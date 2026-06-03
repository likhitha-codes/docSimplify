/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createRequire } from "module";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up body parsing limits to handle base64 documents (PDF/images)
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Path to file-based persistent history database
const isVercel = !!process.env.VERCEL;
const BUNDLED_DB_PATH = path.join(process.cwd(), "user_history.json");
const HISTORY_FILE_PATH = isVercel 
  ? path.join("/tmp", "user_history.json") 
  : BUNDLED_DB_PATH;

// Default initial database structure
interface UserData {
  trustScore: number;
  history: any[];
  saved: any[];
  displayName?: string;
  phoneNumber?: string;
  registered?: boolean;
}

interface DbStructure {
  users?: Record<string, UserData>;
  trustScore: number;
  history: any[];
  saved: any[];
  userProfile: {
    email: string;
    displayName: string;
  };
}

const DEFAULT_DB: DbStructure = {
  users: {},
  trustScore: 100,
  history: [],
  saved: [],
  userProfile: {
    email: "citizen@gov.in",
    displayName: "Citizen User"
  }
};

// Initialize file database helper
function loadDb(): DbStructure {
  try {
    if (fs.existsSync(HISTORY_FILE_PATH)) {
      const raw = fs.readFileSync(HISTORY_FILE_PATH, "utf-8");
      return JSON.parse(raw);
    } else if (isVercel && fs.existsSync(BUNDLED_DB_PATH)) {
      // In Vercel, copy the bundled DB to /tmp on first read to avoid EROFS and pre-populate accounts
      const raw = fs.readFileSync(BUNDLED_DB_PATH, "utf-8");
      try {
        fs.writeFileSync(HISTORY_FILE_PATH, raw, "utf-8");
      } catch (writeErr) {
        console.error("Failed to copy bundled db to /tmp", writeErr);
      }
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Failed to read user history db, resetting", err);
  }
  return DEFAULT_DB;
}

// Helper to retrieve or create user-specific session container securely
function getUserData(db: any, email: string): UserData {
  const normEmail = (email || "citizen@gov.in").trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  // Backward compatibility migration: If legacy fields exist and show records, migrate them to their proper email bucket
  if (db.history && db.history.length > 0) {
    const legacyEmail = (db.userProfile?.email || "citizen@gov.in").trim().toLowerCase();
    if (!db.users[legacyEmail]) {
      db.users[legacyEmail] = {
        trustScore: db.trustScore !== undefined ? db.trustScore : 100,
        history: db.history || [],
        saved: db.saved || []
      };
    }
    // Delete legacy layout to prevent cross-contamination
    db.history = [];
    db.saved = [];
  }
  
  if (!db.users[normEmail]) {
    db.users[normEmail] = {
      trustScore: 100,
      history: [],
      saved: []
    };
  }
  
  return db.users[normEmail];
}

function saveDb(data: DbStructure) {
  try {
    fs.writeFileSync(HISTORY_FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save history db", err);
  }
}

// Extract clean text from base64 PDF buffers safely
async function parsePdfText(base64Data: string): Promise<string> {
  try {
    const pdfBuffer = Buffer.from(base64Data, "base64");
    // @ts-ignore
    const parsed = await pdf(pdfBuffer);
    return parsed.text || "";
  } catch (err: any) {
    console.error("Failed to extract PDF via pdf-parse:", err);
    throw new Error("Unable to extract text content from the uploaded PDF document. Please verify the document is not corrupted.");
  }
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is not defined in secrets. Please configure it in your Settings panel.");
    }
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

// Robust execution wrapper for Gemini LLM API
async function generateContentWithGemini(prompt: string, base64Image?: { data: string; mimeType: string }) {
  const gClient = getGemini();
  const parts: any[] = [];
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: base64Image.mimeType,
        data: base64Image.data
      }
    });
  }
  parts.push({
    text: prompt
  });

  console.log("[Gemini API] Generating translation/simplification using gemini-3.5-flash...");
  const response = await gClient.models.generateContent({
    model: "gemini-3.5-flash",
    contents: { parts },
    config: {
      responseMimeType: "application/json"
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response received from the Gemini NLP engine.");
  }
  return text;
}

// Robust execution wrapper for Groq LLM API with Exponential Backoff
async function generateContentWithGroq(prompt: string, base64Image?: { data: string; mimeType: string }) 
{
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in environment variables.");
  }

  // Choose llama-3.2-11b-vision-preview for image payloads, Llama-3.3-70b-versatile for pure text NLP translations
  const isVision = !!base64Image;
  const models = isVision 
    ? ["llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview"] 
    : ["llama-3.3-70b-versatile", "llama3-70b-8192", "llama-3.1-8b-instant"];

  let lastError: any = null;

  for (const modelName of models) {
    let retries = 4;
    let delay = 1000;

    while (retries > 0) {
      try {
        console.log(`[Groq API] Querying model: ${modelName} (${retries} attempts remaining)...`);
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        };

        const messages: any[] = [];
        if (isVision && base64Image) {
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${base64Image.mimeType};base64,${base64Image.data}`
                }
              }
            ]
          });
        } else {
          messages.push({
            role: "user",
            content: prompt
          });
        }

        const reqBody = {
          model: modelName,
          messages: messages,
          temperature: 0.15,
          response_format: {
            type: "json_object"
          }
        };

        // Standard built-in global fetch is supported in NodeJS 18+
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: headers,
          body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Status ${response.status}: ${errorText}`);
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          console.log(`[Groq API] Successfully processed NLP tasks using: ${modelName}`);
          return content;
        }
      } catch (error: any) {
        lastError = error;
        const errStr = String(error?.message || error || "").toLowerCase();

        const isTransient =
          errStr.includes("503") ||
          errStr.includes("unavailable") ||
          errStr.includes("high demand") ||
          errStr.includes("resource_exhausted") ||
          errStr.includes("429") ||
          errStr.includes("rate limit") ||
          errStr.includes("temp") ||
          errStr.includes("timeout");

        if (isTransient && retries > 1) {
          const jitter = Math.floor(Math.random() * 400) - 200;
          const finalDelay = Math.max(200, delay + jitter);
          console.log(`[Groq API] Server demand wave matched. Recalibrating request in ${finalDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, finalDelay));
          delay *= 1.8;
          retries--;
        } else {
          console.log(`[Groq API] Model ${modelName} returned non-transient issue: ${errStr}. Shifting to fallback endpoints...`);
          break;
        }
      }
    }
  }

  throw lastError || new Error("All Groq model checkpoints failed to resolve content.");
}

// Robustly clean and parse JSON responses from Gemini or Groq to avoid parse errors due to wrapping markdown or trailing texts
function cleanAndParseJSON(rawText: string): any {
  let cleaned = rawText.trim();
  
  // Strip lines starting with ``` or ```json and ending with ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3).trim();
    }
  }

  // If there's still a syntax error, try to extract from the first '{' to the last '}'
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const sliced = cleaned.substring(firstBrace, lastBrace + 1);
        return JSON.parse(sliced);
      } catch (nestedErr: any) {
        throw new Error(`Failed to parse extracted JSON block. Original Error: ${err.message}. Slice Error: ${nestedErr.message}. Raw Content: ${cleaned}`);
      }
    }
    throw err;
  }
}

// Ensure database file is initialized
if (!fs.existsSync(HISTORY_FILE_PATH)) {
  saveDb(DEFAULT_DB);
}

// API Routes

// 1. Get User Profile & trust score
app.get("/api/profile", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  res.json({
    email: email,
    displayName: userData.displayName || db.userProfile?.displayName || "Citizen User",
    trustScore: userData.trustScore
  });
});

// Update profile preferences
app.post("/api/profile/update", (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  const db = loadDb();
  if (email) {
    const normEmail = email.toLowerCase();
    const userData = getUserData(db, normEmail);
    if (displayName) {
      userData.displayName = displayName;
    }
    if (phoneNumber) {
      userData.phoneNumber = phoneNumber;
    }
    if (!db.userProfile) db.userProfile = { email: "", displayName: "" };
    db.userProfile.email = email;
    if (displayName) db.userProfile.displayName = displayName;
  } else if (displayName) {
    if (!db.userProfile) db.userProfile = { email: "", displayName: "" };
    db.userProfile.displayName = displayName;
  }
  saveDb(db);
  res.json({ status: "success", profile: db.userProfile });
});

// Explicit registration endpoint: saves the user with verified status
app.post("/api/register", (req, res) => {
  const { displayName, email, phoneNumber } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for registration" });
  }
  const db = loadDb();
  const normEmail = email.trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  db.users[normEmail] = {
    trustScore: 100,
    history: [],
    saved: [],
    displayName: displayName || "John Doe",
    phoneNumber: phoneNumber || "",
    registered: true
  };
  
  saveDb(db);
  res.json({ 
    status: "success", 
    profile: {
      email: normEmail,
      displayName: db.users[normEmail].displayName,
      trustScore: 100,
      isLoggedIn: true
    }
  });
});

// Lookup email by phone number
app.post("/api/lookup-phone", (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ error: "Phone number is required." });
  }
  
  const db = loadDb();
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, "").replace(/\+/g, "");
  
  if (!db.users) {
    return res.status(404).json({ error: "No users registered yet." });
  }
  
  // Find in local memory database
  const email = Object.keys(db.users).find(e => {
    const userPhone = db.users[e].phoneNumber || "";
    if (!userPhone) return false;
    
    const uDigits = userPhone.replace(/\D/g, "");
    const qDigits = phoneNumber.trim().replace(/\D/g, "");
    if (!uDigits || !qDigits) return false;
    
    if (uDigits === qDigits) return true;
    
    const u10 = uDigits.length >= 10 ? uDigits.slice(-10) : uDigits;
    const q10 = qDigits.length >= 10 ? qDigits.slice(-10) : qDigits;
    
    return u10 === q10;
  });

  if (email) {
    return res.json({ email: email.toLowerCase() });
  }

  res.status(404).json({ error: "This phone number is not registered. Please select the 'New Citizen? Register' link below first." });
});

// Explicit login validation: ensures users are registered/initialized in the National Portal database
app.post("/api/login", (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required for login check." });
  }
  const db = loadDb();
  const normEmail = email.trim().toLowerCase();
  
  if (!db.users) {
    db.users = {};
  }
  
  // If the user database document does not exist yet for this email, auto-initialize it safely
  if (!db.users[normEmail] || !db.users[normEmail].registered) {
    const computedName = normEmail.split("@")[0].split(/[._+-]/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || "Citizen User";
      
    db.users[normEmail] = {
      trustScore: 100,
      history: [],
      saved: [],
      displayName: computedName,
      phoneNumber: "",
      registered: true
    };
    saveDb(db);
  }
  
  const userData = db.users[normEmail];
  res.json({
    status: "success",
    profile: {
      email: normEmail,
      displayName: userData.displayName || "John Doe",
      trustScore: userData.trustScore || 100,
      isLoggedIn: true
    }
  });
});

// 2. Fetch recent document history
app.get("/api/history", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  res.json({
    history: userData.history || [],
    saved: userData.saved || [],
    trustScore: userData.trustScore
  });
});

// 3. Mark/unmark a result as saved
app.post("/api/save", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { documentId, saveState } = req.body;
  const db = loadDb();
  const userData = getUserData(db, email);
  
  if (saveState) {
    // Find in user's history and push to saved if not present
    const doc = userData.history.find(d => d.id === documentId);
    if (doc) {
      if (!userData.saved.some(s => s.id === documentId)) {
        userData.saved.unshift(doc);
      }
    }
  } else {
    // Remove from saved
    userData.saved = userData.saved.filter(s => s.id !== documentId);
  }
  
  saveDb(db);
  res.json({ status: "success", saved: userData.saved });
});

// Delete a document from history
app.delete("/api/history/:id", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const { id } = req.params;
  const db = loadDb();
  const userData = getUserData(db, email);
  userData.history = userData.history.filter(h => h.id !== id);
  userData.saved = userData.saved.filter(s => s.id !== id);
  saveDb(db);
  res.json({ status: "success", history: userData.history, saved: userData.saved });
});

// Clear entire history
app.post("/api/history/clear", (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  const db = loadDb();
  const userData = getUserData(db, email);
  userData.history = [];
  userData.saved = [];
  userData.trustScore = 100; // reset of trust score index
  saveDb(db);
  res.json({ status: "success", history: [], saved: [], trustScore: 100 });
});

// 4. Document processing (Manual Paste Text or PDF/Image Base64 extraction)
app.post("/api/process", async (req, res) => {
  const email = (req.headers["x-user-email"] as string) || "citizen@gov.in";
  let { text, fileData, fileName, mimeType, sourceLang } = req.body;

  if (!text && !fileData) {
    return res.status(400).json({ error: "Provide either manually pasted text or a base64 encoded document file." });
  }

  try {
    let inputSourcePrompt = "";
    let base64ImagePayload: { data: string; mimeType: string } | undefined = undefined;
    const detectedSourceLang = sourceLang || "en";
    const sourceLangText = detectedSourceLang === "te" ? "Telugu" : detectedSourceLang === "hi" ? "Hindi" : "English";

    // 1. PDF Preprocessing: Extract PDF text contents directly on the server to pass to Groq NLP
    if (fileData && mimeType && mimeType.toLowerCase().includes("pdf")) {
      console.log(`[PDF Processing] Extracting text content from PDF: ${fileName}...`);
      const extractedText = await parsePdfText(fileData);
      text = extractedText;
      fileData = null; // Clean up so it is processed by the text pipeline
      mimeType = null;
    }

    // 2. Setup prompts and payloads based on source type
    if (fileData && mimeType) {
      base64ImagePayload = {
        data: fileData,
        mimeType: mimeType
      };
      inputSourcePrompt = `Analyze, OCR-extract, parse, translate, and simplify the attached image (named: "${fileName || 'document'}", mimeType: "${mimeType}"). The document's configured source language hint is: ${sourceLangText}. However, the document may be written in English, Telugu, Hindi, or a mix of any of these languages. Please dynamically detect the actual language(s) used and parse/OCR the contents appropriately.`;
    } else {
      inputSourcePrompt = `Analyze, translate, and simplify the following legal/official text. The document's configured source language hint is: ${sourceLangText}. However, the text may be written in English, Telugu, Hindi, or a mix of any of these languages. Please dynamically detect the actual language(s) used and translate/simplify appropriately.

Pasted Text:
"""
${text}
"""`;
    }

    // Append system architectural rules with structured schemas
    const finalPrompt = `
${inputSourcePrompt}

You are acting as an expert Government NLP Architect, Judiciary Translation Specialist, and Universal Citizen Advocate.
Your mission is to perform these operations and return the output strictly in the JSON format requested.

Required Tasks:
1. Classification & Verification:
   - Detect whether the content is related to an official Indian government, legal matter, public utility, municipal sector, welfare program, state/central notification, judicial filing, or relevant public policy issue in India. Set "isGovernmentRelated" to true if so, otherwise false.
   - Categorize the exact "documentType", picking from or describing similar official genres: e.g., "Government Order", "Circular", "Welfare Scheme", "Tax & Customs Notice", "Judiciary Brief", "Public Notice", "Advisory", or "General Policy Brief".
   - Determine "trustScoreImpact". If it is highly related to government policies, notifications, or welfare schemes, set the impact to positive (between +3 to +5). If the document is completely unrelated, personal chat, spam, or nonsense, set it to negative (between -5 and -10). If it contains some relevant context or is partial, set it to 0 or +1.
2. Simplification & Metadata Generation:
   - Give the document a standard human-readable, respectful "title" (e.g. "Pradhan Mantri Awas Yojana Guideline", "MCD Circular on Taxation").
   - Extract a 1-sentence "summary" of the document.
   - Simplify the legalistic, technical, or complex jargon of the document into "simplifiedEnglish" written at a clear, 8th-grade readability level (designed for ease of standard understanding).
3. Translation:
   - Accurately translate this simplified text into Telugu ("teluguTranslation"). Maintain high cultural precision and clean official Telugu lexicon. Avoid reading numbers incorrectly. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Telugu output.
   - Accurately translate this simplified text into Hindi ("hindiTranslation"). Use standard official yet easy-to-read Devanagari. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Hindi output.
4. Glossary Generation:
   - Extract up to 6 complex legal, financial, or bureaucratic terms appearing in the document (mapped to their English terms if written in regional scripts or translated) and map each to a simple, plain-language explanation in "glossary" (term & definition).

Response Schema Constraints:
Your return message MUST strictly be a valid JSON object matching this structure:
{
  "isGovernmentRelated": boolean,
  "documentType": "string",
  "trustScoreImpact": integer between -10 and 5,
  "title": "string",
  "summary": "string",
  "simplifiedEnglish": "string",
  "teluguTranslation": "string",
  "hindiTranslation": "string",
  "glossary": [
    {
      "term": "string",
      "definition": "string"
    }
  ]
}

Only return a valid JSON object. Do not escape quotes or return any pre-text or post-text outside the JSON boundaries.
`;

    let outputText = "";
    try {
      console.log("[Process] Trying simplification and translation using Gemini (gemini-3.5-flash)...");
      outputText = await generateContentWithGemini(finalPrompt, base64ImagePayload);
    } catch (geminiErr: any) {
      console.warn("[Process] Gemini processing failed, attempting fallback to Groq...", geminiErr);
      try {
        outputText = await generateContentWithGroq(finalPrompt, base64ImagePayload);
      } catch (groqErr: any) {
        console.error("[Process] Both Gemini and Groq engines failed:", groqErr);
        throw new Error(`Simplification and Translation service failed directly. Gemini Error: ${geminiErr.message || geminiErr}. Groq Error: ${groqErr.message || groqErr}`);
      }
    }

    if (!outputText) {
      throw new Error("Empty response received from the NLP Simplification Engine.");
    }

    const docuDetails = cleanAndParseJSON(outputText);

    // Save to persistent database
    const db = loadDb();
    const documentId = "doc_" + Math.random().toString(36).substring(2, 11);
    
    // Update that specific user's trust score within safe boundaries (0 to 100)
    const userData = getUserData(db, email);
    const existingScore = userData.trustScore !== undefined ? userData.trustScore : 100;
    
    const isGov = docuDetails.isGovernmentRelated === true;
    const scoreDiff = isGov ? 5 : -10;
    const proposedScore = existingScore + scoreDiff;
    const newScore = Math.max(0, Math.min(100, proposedScore));
    userData.trustScore = newScore;

    const newDocItem = {
      id: documentId,
      originalText: text || `[Multimodal Document Upload: ${fileName || "document.bin"}]`,
      timestamp: new Date().toISOString(),
      ...docuDetails
    };

    userData.history.unshift(newDocItem);
    saveDb(db);

    res.json({
      status: "success",
      trustScore: newScore,
      result: newDocItem
    });

  } catch (error: any) {
    console.error("Groq simplifier service failed:", error);
    res.status(500).json({
      error: error.message || "simplification service errored. Verify database or credentials.",
      suggestion: "Make sure GROQ_API_KEY is configured in your Environment / Secrets."
    });
  }
});

// Setup Vite & Static Files Hosting
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
    console.log(`DocuEase Server running on client-accessible port ${PORT}`);
  });
}

// Only start the standalone HTTP server if we are NOT running inside Vercel's Serverless Function environment
if (!process.env.VERCEL) {
  startServer();
}

export default app;
