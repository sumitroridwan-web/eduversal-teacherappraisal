import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize Gemini AI Client
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Health
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API: Analyze Lesson Audio or Transcript
app.post("/api/analyze-lesson", async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({
        error: "Gemini API key is not configured. Please check your environment variables.",
      });
    }

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
    } = req.body;

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
- glow: specific praise and strengths grounded in observed evidence.
- grow: targeted reflective growth questions for the post-conference.
- go: concrete, time-bound next steps and actionable commitments for the teacher.
- languageProficiency: analysis of CALP (Cognitive Academic Language Proficiency) and BICS usage.
`;

    parts.push({ text: promptText });

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
app.post("/api/ai-feedback", async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key is missing." });
    }

    const { teacherName, subject, careerLevel, scoredItems, observerNotes } = req.body;

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
1. Glow (3-4 specific praises with rubric evidence)
2. Grow (3 reflective coaching questions designed to prompt deep professional reflection)
3. Go (3 concrete, measurable commitments/next steps)
4. Synthesis Paragraph for the official appraisal record.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
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
app.post("/api/auto-grade", async (req, res) => {
  try {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(500).json({ error: "Gemini API key is missing." });
    }

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

Scoring Guidelines for 4-Point Rubric:
- 4 (Distinguished): Exemplary, seamless student autonomy, deep Bloom's HOTS synthesis, 100% engagement, rigorous CALP discourse.
- 3 (Proficient): Solid, consistent mastery, clear objectives, guided practice, active student participation, effective feedback.
- 2 (Basic): Inconsistent implementation, teacher-dominated talk, basic tasks, surface understanding, minor timing gaps.
- 1 (Unsatisfactory): Lacks objective alignment, disengaged students, poor classroom management, misconceptions unaddressed.

Analyze all available activities, teacher actions, questions asked, and student evidence to score EVERY listed indicator (1, 2, 3, or 4) with a specific pedagogical rationale. Also generate structured Glow / Grow / Go feedback items and a summary evaluation.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
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
                  score: { type: Type.INTEGER, description: "1 to 4 rating" },
                  rationale: { type: Type.STRING, description: "Specific evidence-based justification" },
                },
                required: ["indicatorCode", "score", "rationale"],
              },
            },
            glow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3-4 observed strengths grounded in evidence",
            },
            grow: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 reflective developmental questions for coaching",
            },
            go: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 actionable time-bound commitments for next steps",
            },
          },
          required: ["summaryEvaluation", "scores", "glow", "grow", "go"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error("Auto-Grade API Error:", error);
    return res.status(500).json({ error: error.message || "Failed to auto-grade lesson with Gemini AI." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Eduversal Appraisal Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
