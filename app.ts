/**
 * The Eduversal API: the access gate plus the Gemini-backed endpoints.
 *
 * Deliberately free of any HTTP listener or dev-server wiring so it can be
 * mounted in two places: server.ts runs it locally, and api/index.ts exposes
 * it as a Vercel serverless function.
 */
import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import {
  isFirestoreConfigured,
  listRecords,
  getRecord,
  putRecord,
  deleteRecord,
  describeConfiguration,
} from "./firestore.js";
import { verifyCitations } from "./citationCheck.js";
// Type-only: erased at compile time, so the SDK is not pulled in at module load.
import type { GoogleGenAI } from "@google/genai";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

/**
 * How much base64 audio /api/analyze-lesson will accept.
 *
 * Vercel rejects request bodies over 4.5MB at the edge with a plain-text
 * "Request Entity Too Large" the browser cannot read as JSON, so a lesson
 * recording never even reached this file. A self-hosted deployment would
 * happily accept far more; the same ceiling is enforced here so both behave
 * alike and so the refusal always arrives as JSON. Kept in step with
 * MAX_AUDIO_BASE64_BYTES in the recorder component.
 */
const MAX_AUDIO_BASE64_LENGTH = 4_000_000;

/* ------------------------------------------------------------------ *
 * Access gate
 *
 * The platform password is read from APP_PASSWORD and is never sent to
 * the browser - the client only ever posts a candidate password and
 * receives a signed, expiring session cookie in return.
 * ------------------------------------------------------------------ */

const SESSION_COOKIE = "eduversal_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Signing key for session cookies. Set APP_SESSION_SECRET to keep sessions
// valid across restarts; otherwise a fresh key is generated at boot and
// everyone is signed out when the server restarts.
const SESSION_SECRET =
  process.env.APP_SESSION_SECRET || crypto.randomBytes(32).toString("hex");

if (!process.env.APP_SESSION_SECRET) {
  console.warn(
    "APP_SESSION_SECRET is not set - session cookies are signed with a key " +
      "generated at startup. On serverless hosting every instance generates " +
      "its own key, so users get signed out unpredictably. Set it in production."
  );
}

if (!process.env.APP_PASSWORD) {
  console.warn(
    "APP_PASSWORD is not set - the access gate is closed and nobody can sign in."
  );
}

function getAppPassword(): string | null {
  const pw = process.env.APP_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function issueToken(): string {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;

  const expected = sign(expiresAt);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }
  return Number(expiresAt) > Date.now();
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function isAuthenticated(req: Request): boolean {
  return isValidToken(readCookie(req, SESSION_COOKIE));
}

// Compare in constant time so response timing does not leak the password.
function passwordMatches(candidate: string, actual: string): boolean {
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(actual).digest();
  return crypto.timingSafeEqual(a, b);
}

// Throttle guessing: 10 failures per IP per 15 minutes.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; firstAt: number }>();

function attemptsExceeded(ip: string): boolean {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  next();
}

// Is the gate switched on at all?
app.get("/api/auth/session", (req, res) => {
  res.json({
    authenticated: isAuthenticated(req),
    configured: getAppPassword() !== null,
  });
});

app.post("/api/auth/login", (req, res) => {
  const actual = getAppPassword();
  if (!actual) {
    return res.status(503).json({
      error:
        "No platform password is configured. Set APP_PASSWORD in the server environment.",
    });
  }

  const ip = req.ip || "unknown";
  if (attemptsExceeded(ip)) {
    return res
      .status(429)
      .json({ error: "Too many failed attempts. Try again in 15 minutes." });
  }

  const candidate = typeof req.body?.password === "string" ? req.body.password : "";
  if (!candidate || !passwordMatches(candidate, actual)) {
    recordFailure(ip);
    return res.status(401).json({ error: "Incorrect password." });
  }

  failedAttempts.delete(ip);
  res.cookie(SESSION_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  res.json({ success: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ success: true });
});

// The SDK is loaded on first use rather than at module scope: a serverless
// cold start should not pay for it, and a failure to load it degrades one
// endpoint instead of taking the whole API down with it.
let genaiModule: typeof import("@google/genai") | null = null;

async function loadGenAI() {
  if (!genaiModule) {
    genaiModule = await import("@google/genai");
  }
  return genaiModule;
}

// Initialize Gemini AI Client
async function getGeminiClient(): Promise<GoogleGenAI | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set.");
    return null;
  }
  const { GoogleGenAI } = await loadGenAI();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}


/**
 * AI narrative is written in the appraiser's language rather than translated
 * afterwards - a second pass over pedagogical judgement would blur it.
 */
function languageDirective(language: unknown): string {
  return language === "id"
    ? "\n\nWrite every piece of narrative output in Bahasa Indonesia, using natural " +
        "professional register for Indonesian school leaders. Keep rubric indicator " +
        "codes (D1.1, W3 and so on) and the terms Glow, Grow and Go unchanged.\n"
    : "\n\nWrite all narrative output in English.\n";
}


/* ------------------------------------------------------------------ *
 * Record sync
 *
 * One shared account, several devices. Writes carry the updatedAt the device
 * started from; if the stored copy has moved on since, the write is refused
 * with 409 and the server's version, so the second device can decide rather
 * than silently overwriting a colleague's work.
 * ------------------------------------------------------------------ */

const SYNC_COLLECTIONS: Record<string, string> = {
  appraisals: "appraisals",
  walkthroughs: "walkthroughs",
};

function resolveCollection(req: Request, res: Response): string | null {
  const collection = SYNC_COLLECTIONS[String(req.params.collection)];
  if (!collection) {
    res.status(404).json({ error: "Unknown collection." });
    return null;
  }
  if (!isFirestoreConfigured()) {
    res.status(503).json({
      error: "Sync is not configured on this server.",
      configured: false,
    });
    return null;
  }
  return collection;
}

app.get("/api/sync/status", (req, res) => {
  res.json({ configured: isFirestoreConfigured() });
});

// Masked configuration check, so a broken setup can be diagnosed without
// reading the secrets back out. Behind the platform password.
app.get("/api/sync/diagnostics", requireAuth, (req, res) => {
  res.json(describeConfiguration());
});

app.get("/api/sync/:collection", requireAuth, async (req, res) => {
  const collection = resolveCollection(req, res);
  if (!collection) return;
  try {
    const records = await listRecords(collection);
    res.json({ records: records.map((r) => r.payload), count: records.length });
  } catch (error: any) {
    console.error("Sync list failed:", error);
    res.status(502).json({ error: error?.message || "Could not read from Firestore." });
  }
});

app.put("/api/sync/:collection/:id", requireAuth, async (req, res) => {
  const collection = resolveCollection(req, res);
  if (!collection) return;

  const { record, baseUpdatedAt } = req.body || {};
  if (!record || typeof record !== "object" || !record.id) {
    return res.status(400).json({ error: "A record with an id is required." });
  }

  try {
    const existing = await getRecord(collection, String(req.params.id));

    // Someone else changed this record since this device last read it.
    if (existing && baseUpdatedAt && existing.updatedAt !== baseUpdatedAt) {
      return res.status(409).json({
        error: "This record was changed on another device.",
        serverRecord: existing.payload,
        serverUpdatedAt: existing.updatedAt,
      });
    }

    const updatedAt = record.updatedAt || new Date().toISOString();
    await putRecord(collection, { id: String(record.id), updatedAt, payload: record });
    res.json({ success: true, updatedAt });
  } catch (error: any) {
    if (error?.code === "TOO_LARGE") {
      return res.status(413).json({ error: error.message });
    }
    console.error("Sync write failed:", error);
    res.status(502).json({ error: error?.message || "Could not write to Firestore." });
  }
});

app.delete("/api/sync/:collection/:id", requireAuth, async (req, res) => {
  const collection = resolveCollection(req, res);
  if (!collection) return;
  try {
    await deleteRecord(collection, String(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    console.error("Sync delete failed:", error);
    res.status(502).json({ error: error?.message || "Could not delete from Firestore." });
  }
});

// API Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * How large one window of a recording may be.
 *
 * Posted as raw bytes rather than base64 inside JSON, so the body is the
 * audio itself. Kept in step with MAX_WINDOW_BYTES in the audioWindows
 * service, which is what decides where the recording is cut.
 */
const MAX_WINDOW_BYTES = 3_500_000;

/** Seconds to mm:ss, matching the stamps the recorder writes. */
function formatStamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** The two things a note may be about. Anything else is read as the activity. */
const INSIGHT_FOCUSES = ["Lesson Activity", "Classroom Environment"] as const;

/** What a note may be drawn from. Anything else is dropped rather than kept. */
const INSIGHT_SOURCES = ["Teacher speech", "Student speech", "Classroom sound"] as const;

/** Matches a value to one of a fixed set, however the model cased or spaced it. */
function matchOption<T extends string>(value: unknown, options: readonly T[]): T | null {
  const flat = String(value ?? "").toLowerCase().replace(/[^a-z]+/g, "");
  return options.find((option) => option.toLowerCase().replace(/[^a-z]+/g, "") === flat) || null;
}

/**
 * API: read one window of a lesson recording for what it shows.
 *
 * This does not write down what was said. An appraiser handed forty minutes
 * of verbatim classroom dialogue has to observe the lesson a second time to
 * get anything out of it, and the words a distant microphone catches are the
 * least reliable part of the recording anyway. What comes back instead is the
 * observation - at this minute the class was doing this, and the room was
 * like this - written as sentences that go straight into the lesson notes.
 *
 * The model is given the whole window of audio, so it hears what no transcript
 * carries: who was talking, how many, over what. The teacher's words, the
 * children's words and the noise of the room are all evidence, and a note may
 * rest on any of them.
 *
 * One window at a time, because a lesson does not fit in a single request.
 * The caller passes the offset the window starts at and stitches the replies
 * back into one timeline.
 */
app.post(
  "/api/lesson-insights-window",
  requireAuth,
  express.raw({ type: () => true, limit: "12mb" }),
  async (req, res) => {
    try {
      const ai = await getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error: "Gemini API key is not configured. Please check your environment variables.",
        });
      }
      const { Type } = await loadGenAI();

      const audio: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!audio.length) {
        return res.status(400).json({ error: "No audio was received for this window." });
      }
      if (audio.length > MAX_WINDOW_BYTES) {
        return res.status(413).json({
          error: `This window is ${audio.length} bytes, past the ${MAX_WINDOW_BYTES} a request accepts.`,
        });
      }

      const offsetSeconds = Number(req.query.offsetSeconds) || 0;
      const language = typeof req.query.language === "string" ? req.query.language : "en";
      const mimeType =
        typeof req.query.mimeType === "string" && req.query.mimeType ? req.query.mimeType : "audio/wav";

      const spokenLanguage =
        language === "id"
          ? "The lesson is taught in Bahasa Indonesia, often mixed with English subject " +
            "vocabulary. Write the notes in English, but keep any quoted words in the " +
            "language they were actually spoken in and do not translate them."
          : "The lesson is taught in English, and may be mixed with the local language. " +
            "Write the notes in English, but keep any quoted words in the language they " +
            "were actually spoken in and do not translate them.";

      const promptText = `
You are observing one window of a classroom lesson from its audio, recorded on a
device placed in the room rather than on a microphone worn by the teacher. Expect
a distant and reverberant teacher, overlapping children, scraping chairs and
general classroom noise. That is normal, and the noise is itself evidence.

${spokenLanguage}

Do NOT transcribe. Write what an experienced appraiser sitting in the room would
have written in their notebook: an ordered list of timestamped observations that
will be read back as the lesson notes for this observation.

For each observation return:
- startSeconds: when the moment begins, in seconds from the start of THIS window
  of audio, not from the start of the lesson. A number, never past the length of
  the audio.
- focus: "Lesson Activity" when the note is about what was being taught and how
  the class was working on it - the phase of the lesson, the task set, the
  questions asked, the instructions given, how students responded, what they
  understood or got wrong. "Classroom Environment" when it is about the
  conditions around the learning - the noise level and what was making it,
  transitions between tasks, how orderly or settled the room was, off-task
  drift, how the teacher handled behaviour, pace, and the tone between teacher
  and class.
- note: the observation itself, in one to three complete sentences, written in
  the third person and in an appraiser's professional voice - "The teacher
  opened with a recall question about yesterday's experiment, and several
  students answered together without being nominated." Say what happened and
  what was observable about it. Do not rate the teacher, do not award a score,
  and do not offer advice.
- heardFrom: every one of "Teacher speech", "Student speech" and "Classroom
  sound" that this note actually rests on. A note about noise, chairs, movement
  or silence rests on "Classroom sound".
- quote: where the note turns on a particular thing that was said, the few words
  themselves, verbatim and under about fifteen words. Leave it out when the note
  rests on the sound of the room rather than on any one utterance.

Cover the window evenly. Aim for a note roughly every thirty to ninety seconds of
audio, more where the lesson changes and fewer where it does not, and include at
least one "Classroom Environment" note wherever the room gives you anything to say
about it.

Rules:
- Report only what this audio actually evidences. Never invent an activity, a
  question, a student response or an incident because it would fit the lesson,
  and never quote words that were not spoken.
- Where you can hear that something is happening but not what - movement,
  overlapping talk, a stretch you cannot make out - say exactly that, e.g.
  "Sustained overlapping talk across the room, too indistinct to attribute."
- If the window carries nothing at all - silence, or only room tone - return an
  empty list. That is a valid answer.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: {
          parts: [
            { inlineData: { mimeType, data: audio.toString("base64") } },
            { text: promptText },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.ARRAY,
                description: "Observations drawn from this window, in the order they occurred",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    startSeconds: {
                      type: Type.NUMBER,
                      description: "Seconds from the start of this window of audio",
                    },
                    focus: {
                      type: Type.STRING,
                      description: "Lesson Activity | Classroom Environment",
                    },
                    note: {
                      type: Type.STRING,
                      description: "The observation in complete sentences, in an appraiser's voice",
                    },
                    heardFrom: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Teacher speech | Student speech | Classroom sound",
                    },
                    quote: {
                      type: Type.STRING,
                      description: "The few verbatim words the note rests on, where there are any",
                    },
                  },
                  required: ["startSeconds", "focus", "note", "heardFrom"],
                },
              },
            },
            required: ["insights"],
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response received from AI model.");
      }

      const parsed = JSON.parse(text);
      const raw = Array.isArray(parsed?.insights) ? parsed.insights : [];

      // Stamped against the lesson rather than the window, and sorted, because
      // a model asked for times in order still occasionally returns them out of
      // it and notes that jump backwards cannot be cited.
      const insights = raw
        .filter((item: any) => typeof item?.note === "string" && item.note.trim())
        .map((item: any) => {
          const within = Math.max(0, Number(item.startSeconds) || 0);
          const startSeconds = Math.round(offsetSeconds + within);
          const heardFrom = (Array.isArray(item.heardFrom) ? item.heardFrom : [])
            .map((source: unknown) => matchOption(source, INSIGHT_SOURCES))
            .filter((source: string | null): source is string => !!source);
          const quote = typeof item.quote === "string" ? item.quote.trim() : "";

          return {
            startSeconds,
            timeLabel: formatStamp(startSeconds),
            // An unrecognised focus is read as the lesson rather than dropped:
            // the note is still an observation, and losing it would be worse
            // than filing it under the wrong one of two headings.
            focus: matchOption(item.focus, INSIGHT_FOCUSES) || "Lesson Activity",
            note: String(item.note).trim(),
            // A note has to say what it rests on. With nothing recognised, the
            // honest answer is that it came from the sound of the room.
            heardFrom: heardFrom.length ? Array.from(new Set(heardFrom)) : ["Classroom sound"],
            ...(quote ? { quote } : {}),
          };
        })
        .sort((a: any, b: any) => a.startSeconds - b.startSeconds);

      return res.json({ success: true, insights });
    } catch (error: any) {
      console.error("Lesson insight error:", error);
      return res.status(500).json({
        error: error.message || "Failed to read this part of the lesson.",
      });
    }
  }
);

// API: Analyze Lesson Audio or Lesson Notes
app.post("/api/analyze-lesson", requireAuth, async (req, res) => {
  try {
    const ai = await getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API key is not configured. Please check your environment variables.",
      });
    }
    const { Type } = await loadGenAI();

    const {
      audioBase64,
      mimeType = "audio/webm",
      lessonNotes,
      teacherName,
      subject,
      gradeLevel,
      careerLevel,
      lessonTopic,
      learningObjectives,
      additionalNotes,
      language,
    } = req.body;

    if (typeof audioBase64 === "string" && audioBase64.length > MAX_AUDIO_BASE64_LENGTH) {
      return res.status(413).json({
        error:
          "The audio is too large to analyse in one request. Read the " +
          "recording for lesson insights first - that reads it window by " +
          "window, whatever its length - and analyse the lesson from those notes.",
      });
    }

    const parts: any[] = [];

    // If audio is provided, attach as inlineData
    if (audioBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || "audio/webm",
          data: audioBase64,
        },
      });
    }

    const promptText = `
You are an expert master educational consultant and senior appraiser for the Eduversal Teacher Appraisal Framework (Framework 2 - Classroom Observation).

Analyze the provided lesson recording / lesson notes / observation details for:
- Teacher: ${teacherName || "Observed Teacher"}
- Subject: ${subject || "General Subject"}
- Grade / Level: ${gradeLevel || "Standard"}
- Career Level: ${careerLevel || "Proficient"} (Induction, Developing, Proficient, Lead, or Early Years)
- Lesson Topic: ${lessonTopic || "Topic not specified"}
- Learning Objectives: ${learningObjectives || "Standard curriculum objectives"}
- Observer Live Notes: ${additionalNotes || "None"}
${lessonNotes ? `- Timestamped Lesson Notes Read From The Recording:\n"${lessonNotes}"` : ""}

Evaluate the classroom instruction thoroughly based on Framework 2:
1. Domain 1: Lesson Planning & Objective Alignment
2. Domain 2: Classroom Management & Dynamics
3. Domain 3: Instructional Process (Opening, Higher-Order Thinking, Questioning, CALP/Language, All-Student Participation, Scaffolding, Closure)
4. Domain 4: Assessment & Monitoring Understanding

Provide a comprehensive, highly constructive pedagogical breakdown in JSON format matching the schema provided:
- summary: A 2-3 paragraph professional pedagogical summary of the lesson.
- talkRatio: estimated teacher talk % vs student talk % (e.g. teacher: 65, student: 35).
- higherOrderRatio: estimated % of questions/activities activating Bloom's Higher-Order Thinking (Analysis, Evaluation, Creation).
- timeline: array of key lesson phases (e.g. "00:00 - 05:30: Opening & Apperception", with summary and observation notes).
- domainScores: suggested 1-4 rating with specific evidence notes for major indicators (D1.2, D2.2, D2.4, D3.3, D3.5, D3.10, D3.11, D3.18, D3.19, D4.2).
- glow: exactly 3 specific praises and strengths grounded in observed evidence.
- grow: exactly 3 targeted reflective growth questions for the post-conference.
- go: exactly 3 concrete, time-bound next steps and actionable commitments for the teacher.
- languageProficiency: analysis of CALP (Cognitive Academic Language Proficiency) and BICS usage.
- classroomConditions: what the audio reveals about the conditions for learning -
  noise and its source, transitions, off-task drift, teacher responses to
  behaviour, pacing, group dynamics, tone and rapport.

Rules for classroomConditions:
- Anchor every entry to a time from the lesson notes (mm:ss). The notes
  provided are already timestamped in [mm:ss] form - reuse those stamps.
- Name the classroom-management theory the observation illustrates, choosing
  the one that genuinely fits, e.g. Kounin (withitness, overlapping, momentum,
  group alerting, ripple effect), Marzano (rules and procedures, teacher-student
  relationships), Canter (assertive discipline), Glasser (choice theory),
  Dreikurs (mistaken goals, democratic classroom), Jones (physical proximity,
  say-see-do teaching), Rosenshine (principles of instruction), Vygotsky (ZPD,
  scaffolding) or Bandura (modelling, self-efficacy).
- interpretation: explain what the moment shows through that theory, in the
  appraiser's professional voice, referring to what was actually heard.
- impact: whether the condition supported learning, was neutral, or disrupted it.
- Report only what the audio actually evidences. Do not invent incidents, and
  return an empty array if the audio carries no usable behavioural signal.
`;

    parts.push({ text: promptText + languageDirective(language) });

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Professional pedagogical evaluation summary" },
            teacherTalkPercentage: { type: Type.NUMBER, description: "Estimated Teacher Talk Time percentage 0-100" },
            studentTalkPercentage: { type: Type.NUMBER, description: "Estimated Student Talk Time percentage 0-100" },
            higherOrderThinkingPercentage: { type: Type.NUMBER, description: "Higher-order questioning/activity percentage 0-100" },
            calpProficiencyNotes: { type: Type.STRING, description: "Analysis of Academic Language (CALP) & BICS clarity" },
            classroomConditions: {
              type: Type.ARRAY,
              description: "Classroom conditions heard in the audio, each read through a named classroom-management theory",
              items: {
                type: Type.OBJECT,
                properties: {
                  timeLabel: { type: Type.STRING, description: "mm:ss taken from the timestamped lesson notes" },
                  condition: { type: Type.STRING, description: "What was actually heard" },
                  theory: { type: Type.STRING, description: "e.g. 'Kounin - Withitness', 'Rosenshine - Guided Practice'" },
                  interpretation: { type: Type.STRING, description: "What it shows when read through that theory" },
                  impact: { type: Type.STRING, description: "Supports Learning | Neutral | Disrupts Learning" },
                },
                required: ["timeLabel", "condition", "theory", "interpretation"],
              },
            },
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  phase: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  description: { type: Type.STRING },
                  strengths: { type: Type.STRING },
                },
                required: ["phase", "description"],
              },
            },
            suggestedScores: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  indicatorCode: { type: Type.STRING, description: "e.g. D1.2, D2.2, D3.5, D3.10, D3.18, D3.19" },
                  score: { type: Type.INTEGER, description: "1 to 4" },
                  evidence: { type: Type.STRING, description: "Observable evidence supporting this rating" },
                },
                required: ["indicatorCode", "score", "evidence"],
              },
            },
            glow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Observed strengths and pedagogical highlights",
            },
            grow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Targeted reflective questions for professional development",
            },
            go: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Concrete time-bound action steps for the teacher",
            },
          },
          required: [
            "summary",
            "teacherTalkPercentage",
            "studentTalkPercentage",
            "higherOrderThinkingPercentage",
            "glow",
            "grow",
            "go",
            "suggestedScores",
          ],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response received from AI model.");
    }

    const data = JSON.parse(text);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to analyze lesson with Gemini AI.",
    });
  }
});

/**
 * API: Write one Glow / Grow / Go column from the observation record.
 *
 * The appraiser presses this per column, so the request names the section and
 * gets that column back and nothing else. What it writes from is the same
 * evidence the auto-grader reads - the observer's notes, the timestamped
 * lesson notes, the activities, the photo captions - plus the ratings already
 * given and the note written against each one. Three entries, written long
 * enough to carry a debrief on their own.
 */
const FEEDBACK_SECTIONS = ["glow", "grow", "go"] as const;
type FeedbackSection = (typeof FEEDBACK_SECTIONS)[number];

const SECTION_BRIEF: Record<FeedbackSection, string> = {
  glow:
    'Write the "Glow" column: the strengths this teacher actually demonstrated.\n' +
    "Each entry must name the practice and the indicator it sits under, quote or\n" +
    "point to the moment it was seen (a lesson note with its [mm:ss] stamp, an\n" +
    "activity by name, a photo caption, or a line from the observer's notes), and\n" +
    "then say what that practice did for the students' learning. Praise the\n" +
    "specific teaching move, never the person in general. Draw on the indicators\n" +
    "rated Proficient or Distinguished first.",
  grow:
    'Write the "Grow" column: reflective coaching questions for the post-observation\n' +
    "conference. Each entry must open with the specific moment it comes from -\n" +
    "state the evidence briefly - and then ask one genuinely open question the\n" +
    "teacher has to think about, phrased so it cannot be answered yes or no and\n" +
    "does not smuggle in the answer. Take the moments from the indicators rated\n" +
    "Basic or Unsatisfactory first; where nothing sits below Proficient, ask what\n" +
    "would stretch the strong practice further. Be developmental, never punitive.",
  go:
    'Write the "Go" column: the next steps the teacher and appraiser agree to.\n' +
    "Each entry must state one concrete change to classroom practice, the lesson\n" +
    "or timeframe it will be tried in, and what the appraiser would look for at\n" +
    "the next observation to know it happened. Tie each step to the weakest rated\n" +
    "indicators and to what the evidence showed was missing. No step may be\n" +
    "generic professional-development advice that any teacher could be handed.",
};

app.post("/api/ai-feedback", requireAuth, async (req, res) => {
  try {
    const ai = await getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key is missing." });
    }
    const { Type } = await loadGenAI();

    const {
      section,
      count,
      teacherName,
      subject,
      careerLevel,
      schoolLevel,
      gradeClass,
      lessonTopic,
      learningObjectives,
      observerNotes,
      lessonNotes,
      lessonInsights = [],
      activities = [],
      photos = [],
      classroomConditions = [],
      scoredItems = [],
      language,
    } = req.body;

    if (!FEEDBACK_SECTIONS.includes(section)) {
      return res.status(400).json({
        error: `"section" must be one of ${FEEDBACK_SECTIONS.join(", ")}.`,
      });
    }

    // Three entries is what the debrief column holds. A larger number is
    // honoured up to the column's own ceiling of five; anything else is three.
    const wanted = Number.isInteger(count) && count >= 1 && count <= 5 ? count : 3;

    const prompt = `
You are a senior Eduversal pedagogical appraiser writing the post-observation
debrief with the observing appraiser, under Eduversal Teacher Appraisal
Framework 2.0 and informed by Danielson FfT and Marzano.

Observation Context:
- Teacher: ${teacherName}
- Subject: ${subject}
- School Level: ${schoolLevel}
- Grade/Class: ${gradeClass}
- Career Stage: ${careerLevel}
- Lesson Topic: ${lessonTopic}
- Stated Learning Objectives: ${learningObjectives || "None recorded"}

The Appraiser's Observation Notes:
${observerNotes?.trim() ? `"${observerNotes}"` : "None recorded"}

Lesson Notes Read From The Recording:
${lessonNotes?.trim() ? `"${lessonNotes}"` : "Not available"}

Timestamped Lesson Notes (${lessonInsights.length} entries):
${JSON.stringify(lessonInsights, null, 2)}

Lesson Activities Timeline (${activities.length} phases):
${JSON.stringify(activities, null, 2)}

Captioned Photo Evidence (${photos.length} photos):
${JSON.stringify(photos, null, 2)}

Classroom Conditions Heard In The Audio (${classroomConditions.length} entries):
${JSON.stringify(classroomConditions, null, 2)}

Indicators The Appraiser Has Rated (${scoredItems.length}), with the rating
awarded, the rubric descriptor for that rating, and the appraiser's own note:
${JSON.stringify(scoredItems, null, 2)}

${SECTION_BRIEF[section as FeedbackSection]}

Rules:
1. Return exactly ${wanted} entries. Not more, not fewer. Each entry stands on
   its own and covers a different indicator or moment from the others.
2. Write each entry in detail: two to four full sentences, roughly 45 to 90
   words. A one-line bullet is not enough for a debrief the teacher keeps.
3. Ground every entry in the evidence above and show that grounding in the
   text - the appraiser's note, a lesson note with its [mm:ss] stamp, an
   activity name, or a photo caption. The appraiser's own notes are the
   strongest evidence there is; use their wording where it fits.
4. Invent nothing. Do not describe teaching that is not in the evidence, and do
   not infer it from the subject or the career stage. Where the evidence
   supports fewer than ${wanted} solid entries, say so plainly inside the last
   entry rather than padding with something unevidenced.
5. Address the teacher's practice directly and professionally. No headings, no
   numbering, no markdown - each entry is plain prose that can be pasted
   straight into the debrief sheet.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt + languageDirective(language),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: `Exactly ${wanted} detailed ${section} entries, each 2-4 sentences citing the evidence it rests on`,
            },
          },
          required: ["items"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((entry: unknown) => String(entry || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, wanted);

    return res.json({ success: true, data: { section, items } });
  } catch (error: any) {
    console.error("AI Feedback Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate AI feedback." });
  }
});

// API: Auto-Grade Teacher Lesson Observation based on Lesson Activities, Notes & Audio Insights
app.post("/api/auto-grade", requireAuth, async (req, res) => {
  try {
    const ai = await getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key is missing." });
    }
    const { Type } = await loadGenAI();

    const {
      teacherName,
      subject,
      careerLevel,
      schoolLevel,
      gradeClass,
      lessonTopic,
      learningObjectives,
      observerNotes,
      lessonNotes,
      activities = [],
      indicators = [],
      photos = [],
      classroomConditions = [],
      language,
    } = req.body;

    const prompt = `
You are the master Eduversal Chief Academic Officer and Lead Teacher Appraiser.
Your task is to conduct an rigorous, fair, and evidence-grounded AUTO-GRADING of a subject teacher's classroom observation under Eduversal Teacher Appraisal Framework 2.0.

Observation Context:
- Teacher: ${teacherName}
- Subject: ${subject}
- School Level: ${schoolLevel}
- Grade/Class: ${gradeClass}
- Career Stage: ${careerLevel}
- Lesson Topic: ${lessonTopic}
- Stated Learning Objectives: ${learningObjectives}
- General Observer Notes: ${observerNotes || "None"}
- Lesson Notes Read From The Recording: ${lessonNotes ? `"${lessonNotes}"` : "Not available"}

Structured Lesson Activities Timeline (${activities.length} phases recorded):
${JSON.stringify(activities, null, 2)}

Rubric Indicators to Evaluate:
${JSON.stringify(
  indicators.map((ind: any) => ({
    id: ind.id,
    domain: ind.domainId,
    title: ind.title,
    focus: ind.coachingFocus,
  })),
  null,
  2
)}

Captioned Photo Evidence (${photos.length} photos):
${JSON.stringify(photos, null, 2)}

Classroom Conditions Heard in the Audio (${classroomConditions.length} entries):
${JSON.stringify(classroomConditions, null, 2)}

Scoring Guidelines for 4-Point Rubric:
- 4 (Distinguished): Exemplary, seamless student autonomy, deep Bloom's HOTS synthesis, 100% engagement, rigorous CALP discourse.
- 3 (Proficient): Solid, consistent mastery, clear objectives, guided practice, active student participation, effective feedback.
- 2 (Basic): Inconsistent implementation, teacher-dominated talk, basic tasks, surface understanding, minor timing gaps.
- 1 (Unsatisfactory): Lacks objective alignment, disengaged students, poor classroom management, misconceptions unaddressed.

EVIDENCE RULES - these matter more than producing a full set of scores:

1. Score an indicator ONLY where the captured evidence actually speaks to it.
   The evidence available to you is: the lesson activities timeline, the
   observer's notes, the timestamped lesson notes read from the recording,
   the photo captions, and the classroom-condition entries. Nothing else
   exists.

2. Where there is no evidence for an indicator, set "notObservable": true,
   set "score" to null, and write the rationale as "Not observable - " plus a
   short statement of what was missing (e.g. "Not observable - no assessment
   activity or student work was captured in the recording, notes or photos.").
   Do NOT guess, do NOT infer from the subject or career level, and do NOT
   award a default rating to fill the sheet. An honest gap is worth more to
   the teacher than an invented score.

3. Every rationale for a scored indicator MUST cite where the evidence came
   from, quoting or naming it: a lesson note with its [mm:ss] stamp, an
   activity by name and time range, a photo by its caption, or a line from the
   observer's notes. Put those citations in "evidenceRefs" as well, one per
   source, each written so an appraiser can find it again - for example
   "Lesson note [12:40]: 'asked why the volume changed and took three answers'",
   "Activity 3: Guided Group Problem-Solving (08:20-08:35)", "Photo: 'Success
   criteria displayed on the board'", or "Observer note: students re-grouped
   after the demo".

4. A rationale with no citable evidence behind it is not acceptable. If you
   cannot cite it, the indicator is not observable.

Also generate Glow / Grow / Go feedback and a summary evaluation, each grounded
in the same cited evidence. In the summary, state plainly how many indicators
could not be observed and what further evidence would close that gap.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt + languageDirective(language),
      config: {
        // Grading is the one call here whose output becomes a number on
        // somebody's appraisal. At the model default, re-grading the same
        // evidence returns different ratings and nothing tells the appraiser
        // that the number moved. Sampling at zero makes a re-run reproducible,
        // which is also what lets an agreement study measure the grader rather
        // than the noise around it.
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryEvaluation: {
              type: Type.STRING,
              description: "Comprehensive 2-paragraph pedagogical evaluation narrative",
            },
            scores: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  indicatorCode: { type: Type.STRING },
                  score: {
                    type: Type.INTEGER,
                    nullable: true,
                    description: "1 to 4 rating, or null when the indicator was not observable",
                  },
                  notObservable: {
                    type: Type.BOOLEAN,
                    description: "True when the captured evidence does not speak to this indicator",
                  },
                  rationale: {
                    type: Type.STRING,
                    description: "Justification citing the specific evidence it rests on",
                  },
                  evidenceRefs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Each source cited, e.g. \"Lesson note [12:40]: '...'\" or \"Photo: 'caption'\"",
                  },
                },
                required: ["indicatorCode", "rationale"],
              },
            },
            glow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 3 observed strengths grounded in evidence",
            },
            grow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 3 reflective developmental questions for coaching",
            },
            go: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Exactly 3 actionable time-bound commitments for next steps",
            },
          },
          required: ["summaryEvaluation", "scores", "glow", "grow", "go"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");

    // The prompt requires every rating to cite evidence and forbids a rating it
    // cannot cite. Requiring is not enforcing, so the citations are checked
    // against the evidence actually submitted before the scores leave here.
    const verification = verifyCitations(parsed.scores, {
      activities,
      observerNotes,
      lessonNotes,
      photos,
      classroomConditions,
      learningObjectives,
    });

    return res.json({
      success: true,
      data: { ...parsed, scores: verification.scores },
      citationCheck: {
        checked: verification.checked,
        withdrawn: verification.withdrawn,
      },
    });
  } catch (error: any) {
    console.error("Auto-Grade API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to auto-grade lesson with Gemini AI." });
  }
});

/**
 * body-parser rejects an oversized or malformed body by throwing, and Express's
 * default handler answers with an HTML page - which the caller then fails to
 * parse as JSON, hiding the actual reason. Every API failure leaves as JSON.
 */
app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);

  if (error?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ error: "The request is too large to process. Send less data in one call." });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "The request body was not valid JSON." });
  }

  console.error("Unhandled API error:", error);
  res.status(500).json({ error: error?.message || "Unexpected server error." });
});

export default app;
