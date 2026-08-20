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

// API: Analyze Lesson Audio or Transcript
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
      transcript,
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
          "The audio is too large to analyse in one request. Record the lesson " +
          "in shorter segments, or analyse it from the transcript instead.",
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

Analyze the provided lesson recording / transcript / observation details for:
- Teacher: ${teacherName || "Observed Teacher"}
- Subject: ${subject || "General Subject"}
- Grade / Level: ${gradeLevel || "Standard"}
- Career Level: ${careerLevel || "Proficient"} (Induction, Developing, Proficient, Lead, or Early Years)
- Lesson Topic: ${lessonTopic || "Topic not specified"}
- Learning Objectives: ${learningObjectives || "Standard curriculum objectives"}
- Observer Live Notes: ${additionalNotes || "None"}
${transcript ? `- Full Lesson Audio Transcription / Dialogue Notes:\n"${transcript}"` : ""}

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
- Anchor every entry to a time from the transcript (mm:ss). The transcript
  provided is already timestamped in [mm:ss] form - reuse those stamps.
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
                  timeLabel: { type: Type.STRING, description: "mm:ss taken from the timestamped transcript" },
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

// API: Generate Custom Glow / Grow / Go & Action Recommendations
app.post("/api/ai-feedback", requireAuth, async (req, res) => {
  try {
    const ai = await getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key is missing." });
    }
    const { Type } = await loadGenAI();

    const { teacherName, subject, careerLevel, scoredItems, observerNotes, language } = req.body;

    const prompt = `
You are a senior Eduversal pedagogical appraiser.
Generate professional, structured post-observation feedback (Glow / Grow / Go protocol) for:
- Teacher: ${teacherName}
- Subject: ${subject}
- Level: ${careerLevel}
- Observer's Quick Notes: ${observerNotes || "None"}
- Assessment Items and Scores:
${JSON.stringify(scoredItems || [], null, 2)}

Provide high-impact, empathetic, research-informed feedback aligned with Danielson FfT and Marzano instructional strategies:
1. Glow (exactly 3 specific praises with rubric evidence)
2. Grow (exactly 3 reflective coaching questions designed to prompt deep professional reflection)
3. Go (exactly 3 concrete, measurable commitments/next steps)
4. Synthesis Paragraph for the official appraisal record.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt + languageDirective(language),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            glow: { type: Type.ARRAY, items: { type: Type.STRING } },
            grow: { type: Type.ARRAY, items: { type: Type.STRING } },
            go: { type: Type.ARRAY, items: { type: Type.STRING } },
            synthesis: { type: Type.STRING },
          },
          required: ["glow", "grow", "go", "synthesis"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error("AI Feedback Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate AI feedback." });
  }
});

// API: Auto-Grade Teacher Lesson Observation based on Lesson Activities, Notes & Transcripts
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
      transcript,
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
- Audio Transcript / Dialogue: ${transcript ? `"${transcript}"` : "Not available"}

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
   observer's notes, the timestamped transcript, the photo captions, and the
   classroom-condition entries. Nothing else exists.

2. Where there is no evidence for an indicator, set "notObservable": true,
   set "score" to null, and write the rationale as "Not observable - " plus a
   short statement of what was missing (e.g. "Not observable - no assessment
   activity or student work was captured in the recording, notes or photos.").
   Do NOT guess, do NOT infer from the subject or career level, and do NOT
   award a default rating to fill the sheet. An honest gap is worth more to
   the teacher than an invented score.

3. Every rationale for a scored indicator MUST cite where the evidence came
   from, quoting or naming it: a transcript moment with its [mm:ss] stamp, an
   activity by name and time range, a photo by its caption, or a line from the
   observer's notes. Put those citations in "evidenceRefs" as well, one per
   source, each written so an appraiser can find it again - for example
   "Transcript [12:40]: 'so why did the volume change?'", "Activity 3: Guided
   Group Problem-Solving (08:20-08:35)", "Photo: 'Success criteria displayed
   on the board'", or "Observer note: students re-grouped after the demo".

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
                    description: "Each source cited, e.g. \"Transcript [12:40]: '...'\" or \"Photo: 'caption'\"",
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
      transcript,
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
