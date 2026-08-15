/**
 * Minimal Firestore client over the REST API.
 *
 * Deliberately server-side only. The browser never holds Firebase credentials
 * and Firestore rules can deny all direct client access, so the single route to
 * teacher appraisal data is this API - which is already behind the platform
 * password. Putting the Firebase web SDK in the bundle would have meant
 * shipping a key that grants access to the whole database.
 *
 * Uses REST with a service-account JWT rather than firebase-admin: no extra
 * dependency (this project's lockfile is bun's, and bun is not always present),
 * and a far smaller serverless cold start.
 */
import crypto from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

// Firestore's hard ceiling is 1 MiB per document; stay clear of it.
const MAX_DOCUMENT_BYTES = 900_000;

export interface StoredRecord {
  id: string;
  updatedAt: string;
  payload: any;
}

/**
 * Recovers a usable PEM from however the key survived the environment.
 *
 * A service-account key is multi-line, and every hosting UI mangles it
 * differently: pasted with the JSON quotes still attached, with newlines turned
 * into literal \n, or with CRLF. Node then fails with an opaque
 * "DECODER routines::unsupported", which says nothing about the real cause, so
 * the value is normalised here instead.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  // Whole value wrapped in quotes, copied straight out of the JSON file.
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  // Base64 of the entire PEM, which is how some people dodge newline problems.
  if (!key.includes("BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) key = decoded.trim();
    } catch {
      // Leave it as-is; the signing step reports a clear error below.
    }
  }

  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
  return key.endsWith("\n") ? key : `${key}\n`;
}

function serviceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) return null;
  return { projectId, clientEmail, privateKey: normalizePrivateKey(rawKey) };
}

export function isFirestoreConfigured(): boolean {
  return serviceAccount() !== null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Signs a service-account JWT and exchanges it for an access token. */
async function getAccessToken(): Promise<string> {
  const account = serviceAccount();
  if (!account) throw new Error("Firestore is not configured.");

  // Reuse until a minute before expiry.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const claim = {
    iss: account.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };

  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify(claim)
  )}`;

  let signature: Buffer;
  try {
    signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.privateKey);
  } catch (error: any) {
    // Say what is actually wrong, rather than passing on Node's opaque
    // "DECODER routines::unsupported".
    throw new Error(
      "FIREBASE_PRIVATE_KEY could not be read as a private key. Copy the private_key " +
        "value from the service-account JSON exactly, including the BEGIN and END lines. " +
        "Do not include the surrounding quotes, and keep the \\n sequences intact. " +
        `(${error?.message || "unknown error"})`
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });

  if (!res.ok) {
    // Google explains the refusal in the body; passing on only the status left
    // the actual cause invisible.
    const detail = await res.text().catch(() => "");
    let hint = "";
    if (detail.includes("invalid_grant")) {
      hint =
        " This usually means FIREBASE_CLIENT_EMAIL does not match the key in " +
        "FIREBASE_PRIVATE_KEY, or that service-account key has been deleted. " +
        "Generate a fresh key and copy both values from the same JSON file.";
    } else if (detail.includes("invalid_scope") || detail.includes("access_denied")) {
      hint =
        " The service account is missing Firestore access. Grant it the " +
        "'Cloud Datastore User' role in the Google Cloud IAM console.";
    }
    throw new Error(
      `Google refused the service-account sign-in (${res.status}): ${detail.slice(0, 240)}${hint}`
    );
  }

  const json: any = await res.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

function documentsUrl(collection: string, docId?: string): string {
  const account = serviceAccount()!;
  const base =
    `https://firestore.googleapis.com/v1/projects/${account.projectId}` +
    `/databases/(default)/documents/${collection}`;
  return docId ? `${base}/${encodeURIComponent(docId)}` : base;
}

async function firestoreFetch(url: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Firestore request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  // DELETE returns an empty body.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Records are stored as one JSON string per document.
 *
 * Everything here is read and written whole, so Firestore's typed-value
 * encoding would add conversion work and fragility for no benefit. updatedAt is
 * kept as its own field purely so a conflict can be detected without parsing
 * the payload.
 */
function toDocument(record: StoredRecord) {
  return {
    fields: {
      id: { stringValue: record.id },
      updatedAt: { stringValue: record.updatedAt },
      payload: { stringValue: JSON.stringify(record.payload) },
    },
  };
}

function fromDocument(doc: any): StoredRecord | null {
  const fields = doc?.fields;
  if (!fields?.payload?.stringValue) return null;
  try {
    return {
      id: fields.id?.stringValue || "",
      updatedAt: fields.updatedAt?.stringValue || "",
      payload: JSON.parse(fields.payload.stringValue),
    };
  } catch {
    return null;
  }
}

export async function listRecords(collection: string): Promise<StoredRecord[]> {
  const results: StoredRecord[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(documentsUrl(collection));
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await firestoreFetch(url.toString());
    (page?.documents || []).forEach((doc: any) => {
      const record = fromDocument(doc);
      if (record) results.push(record);
    });
    pageToken = page?.nextPageToken;
  } while (pageToken);

  return results;
}

export async function getRecord(
  collection: string,
  id: string
): Promise<StoredRecord | null> {
  const doc = await firestoreFetch(documentsUrl(collection, id));
  return doc ? fromDocument(doc) : null;
}

export async function putRecord(
  collection: string,
  record: StoredRecord
): Promise<void> {
  const body = JSON.stringify(toDocument(record));
  if (Buffer.byteLength(body, "utf8") > MAX_DOCUMENT_BYTES) {
    throw Object.assign(
      new Error(
        "This record is too large to sync. Firestore allows about 1 MB per record and " +
          "photo evidence is stored inside it. Remove or re-take a few photos, then save again."
      ),
      { code: "TOO_LARGE" }
    );
  }

  await firestoreFetch(documentsUrl(collection, record.id), {
    method: "PATCH",
    body,
  });
}

export async function deleteRecord(collection: string, id: string): Promise<void> {
  await firestoreFetch(documentsUrl(collection, id), { method: "DELETE" });
}
