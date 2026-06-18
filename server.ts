/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import Groq from "groq-sdk";
import dotenv from "dotenv";

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
        trustScore: db.trustScore !== undefined ? db.trustScore : 85,
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

// Lazy initialization of Groq client
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error("GROQ_API_KEY is not configured in Secrets.");
    }
    groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

// Extract plain text from a base64-encoded file using local libraries
async function extractTextFromFile(fileData: string, mimeType: string): Promise<string> {
  const buffer = Buffer.from(fileData, "base64");

  if (mimeType === "application/pdf") {
    // @ts-ignore - pdf-parse has no TypeScript declarations
    const { default: pdfParse } = await import("pdf-parse");
    const data = await pdfParse(buffer);

    // Text-based PDF: use embedded text directly
    if (data.text.trim().length >= 50) {
      return data.text;
    }

    // Scanned PDF: render each page to PNG via mupdf, then OCR with Groq vision
    console.log("[DocSimplify] Scanned PDF detected — rendering pages for vision OCR...");
    // @ts-ignore - mupdf types may not be available
    const mupdf = await import("mupdf");
    const pdf = mupdf.Document.openDocument(new Uint8Array(buffer), "application/pdf");
    const pageCount = Math.min(pdf.countPages(), 10);
    let fullText = "";

    const groq = getGroqClient();
    for (let i = 0; i < pageCount; i++) {
      const page = pdf.loadPage(i);
      const pixmap = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB);
      const pngBase64 = Buffer.from(pixmap.asPNG()).toString("base64");

      const response = await groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${pngBase64}` } },
            { type: "text", text: "Extract all text from this document page. Return only the extracted text, preserving the original language. The document may be in English, Hindi, or Telugu." }
          ]
        }],
        max_tokens: 4000
      });

      fullText += (response.choices[0].message.content || "") + "\n";
    }

    if (!fullText.trim()) {
      throw new Error("Could not extract any text from this PDF. Try uploading as a JPG or PNG instead.");
    }
    return fullText;

  } else if (mimeType.startsWith("image/")) {
    // Use Groq vision to extract text from the image
    const groq = getGroqClient();
    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${fileData}` }
          },
          {
            type: "text",
            text: "Extract all text from this document image. Return only the extracted text, preserving the original language and layout. The document may be in English, Hindi, or Telugu."
          }
        ]
      }],
      max_tokens: 4000
    });
    return response.choices[0].message.content || "";

  } else {
    // TXT or other text formats: decode base64 directly
    return buffer.toString("utf-8");
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
  const email = Object.keys(db.users!).find(e => {
    const userPhone = db.users![e].phoneNumber || "";
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
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
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
  const { text, fileData, fileName, mimeType, sourceLang } = req.body;

  if (!text && !fileData) {
    return res.status(400).json({ error: "Provide either manually pasted text or a base64 encoded document file." });
  }

  try {
    const groq = getGroqClient();

    const detectedSourceLang = sourceLang || "en";
    const sourceLangText = detectedSourceLang === "te" ? "Telugu" : detectedSourceLang === "hi" ? "Hindi" : "English";

    // Extract text from file if provided, otherwise use pasted text
    let documentText = text || "";
    if (fileData && mimeType) {
      console.log(`[DocSimplify] Extracting text from file: ${fileName || "document"} (${mimeType})`);
      documentText = await extractTextFromFile(fileData, mimeType);
      console.log(`[DocSimplify] Extracted ${documentText.length} characters from file.`);
    }

    const inputSourcePrompt = fileData && mimeType
      ? `Analyze, translate, and simplify the following text extracted from a document (named: "${fileName || 'document'}", mimeType: "${mimeType}"). Source language hint: ${sourceLangText}. The text may be in English, Telugu, Hindi, or a mix — detect and process accordingly.`
      : `Analyze, translate, and simplify the following legal/official text. Source language hint: ${sourceLangText}. The text may be in English, Telugu, Hindi, or a mix — detect and process accordingly.`;

    const finalPrompt = `
${inputSourcePrompt}

Document text:
${documentText}

You are acting as an expert Government NLP Architect, Judiciary Translation Specialist, and Universal Citizen Advocate.
Your mission is to perform these operations:
1. Classification & Verification:
   - First, determine whether the content is actually a document of any kind (letter, form, certificate, notice, image of text, etc.). Set "isDocument" to true if so. Set "isDocument" to false only if the content is clearly a random/personal photo, meme, or contains no document text whatsoever.
   - Detect whether the content is related to an official Indian government, legal matter, public utility, municipal sector, welfare program, state/central notification, judicial filing, or relevant public policy issue in India. Set "isGovernmentRelated" to true if so, otherwise false.
   - Categorize the exact "documentType", picking from or describing similar official genres: e.g., "Government Order", "Circular", "Welfare Scheme", "Tax & Customs Notice", "Judiciary Brief", "Public Notice", "Advisory", or "General Policy Brief".
2. Simplification & Metadata Generation:
   - Give the document a standard human-readable, respectful "title".
   - Write a "summary" of 3–4 sentences covering: what the document is, who it belongs to (use their actual name), its key purpose, and the most important date or condition.
   - For "simplifiedEnglish": Your job is to LIST EVERY PIECE OF ACTUAL DATA from the document AND explain what it means. Do NOT write generic theory. For every field present in the document, state the field name and then its exact value as it appears, followed by a brief plain-language explanation of what that value means. Use SECTION LABELS IN CAPS followed by a colon to group related fields. DO NOT use markdown, asterisks, pound signs, or bullet dashes. Example format: "DOCUMENT NUMBER: MP19R-2021-0224441. This is the unique ID for this licence." Include every name, date, number, address, category, validity period, authority, condition, and any other data visible in the document. After listing all data, add a short "WHAT THIS MEANS FOR YOU" section explaining practical implications. Target length: 350–450 words.
3. Translation:
   - Accurately translate this simplified text into Telugu ("teluguTranslation"). Maintain high cultural precision and clean official Telugu lexicon. Avoid reading numbers incorrectly. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Telugu output.
   - Accurately translate this simplified text into Hindi ("hindiTranslation"). Use standard official yet easy-to-read Devanagari. Even if the source document was in Telugu, Hindi, or mixed, provide a high-quality, fully translated simplified Hindi output.
4. Glossary Generation:
   - Extract up to 10 complex legal, financial, or bureaucratic terms appearing in the document (mapped to their English terms if written in regional scripts or translated) and map each to a simple, plain-language explanation in "glossary" (term & definition).

Return ONLY valid JSON with exactly these fields:
{
  "isDocument": boolean,
  "isGovernmentRelated": boolean,
  "documentType": string,
  "title": string,
  "summary": string,
  "simplifiedEnglish": string,
  "teluguTranslation": string,
  "hindiTranslation": string,
  "glossary": [{"term": string, "definition": string}]
}

Ensure Telugu and Hindi texts are fully translated and returned in elegant unicode scripts.
`;

    console.log(`[Groq API] Sending request to llama-3.3-70b-versatile...`);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a government document analyst. Your primary job is to extract and state every actual value, number, name, date, and field from the document verbatim, then explain what each means in plain English. You NEVER write generic theory without the actual data. You NEVER say 'the document contains a name' — you say 'NAME: Sardar Singh. This is the person this licence belongs to.' You use CAPS LABELS with colons for sections. No markdown, no asterisks, no pound signs, no bullet dashes."
        },
        { role: "user", content: finalPrompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 8000
    });
    console.log(`[Groq API] Response received.`);

    const outputText = completion.choices[0]?.message?.content;
    if (!outputText) {
      throw new Error("Empty response received from the simplification AI");
    }

    const docuDetails = JSON.parse(outputText);

    // Save to persistent database
    const db = loadDb();
    const documentId = "doc_" + Math.random().toString(36).substring(2, 11);

    const userData = getUserData(db, email);
    const existingScore = userData.trustScore || 100;

    // Non-government document — deduct 10, clamped to [0, 100]; lock when score hits 0
    if (docuDetails.isGovernmentRelated === false || !docuDetails.isGovernmentRelated) {
      const newScore = Math.max(0, Math.min(100, existingScore - 10));
      userData.trustScore = newScore;
      saveDb(db);
      return res.status(400).json({
        error: "Failed to translate because the uploaded document is not government-related",
        locked: newScore === 0,
        trustScore: newScore
      });
    }

    // Government document — +5, clamped to [0, 100]
    const newScore = Math.max(0, Math.min(100, existingScore + 5));
    userData.trustScore = newScore;

    const newDocItem = {
      id: documentId,
      originalText: text || `[Document Upload: ${fileName || "document.bin"}]`,
      timestamp: new Date().toISOString(),
      ...docuDetails,
      trustScoreImpact: 5, // after spread so it always wins; kept for frontend compatibility
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
      error: error.message || "Simplification service errored. Verify database or credentials.",
      suggestion: "Make sure GROQ_API_KEY is configured under Settings > Secrets."
    });
  }
});

// Setup Vite & Static Files Hosting
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
