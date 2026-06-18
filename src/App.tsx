/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  ArrowRight,
  Download,
  Share2,
  Volume2,
  Play,
  Pause,
  Square,
  Trash2,
  Check,
  UploadCloud,
  Clipboard,
  Copy,
  Printer,
  AlertTriangle,
  Loader2,
  Bookmark,
  X,
  Plus,
  Clock,
  LogOut,
  BookOpen,
  FileCheck,
  Info
} from "lucide-react";

import AuthPortal from "./components/AuthPortal";
import { SimplifiedResult, UserProfile, GlossaryItem } from "./types";

function showPenaltyToast(score: number) {
  const existing = document.getElementById("__penalty_toast__");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "__penalty_toast__";
  toast.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:999999",
    "width:320px", "background:#0f172a", "border:1px solid rgba(234,179,8,0.35)",
    "border-radius:12px", "overflow:hidden",
    "box-shadow:0 25px 50px -12px rgba(0,0,0,0.6)",
    "font-family:sans-serif"
  ].join(";");

  toast.innerHTML = `
    <div style="height:3px;background:#d97706;width:100%"></div>
    <div style="padding:14px 14px 14px 14px;display:flex;gap:10px;align-items:flex-start;">
      <div style="flex-shrink:0;margin-top:2px;width:28px;height:28px;border-radius:50%;background:rgba(245,158,11,0.12);border:1px dashed rgba(245,158,11,0.4);display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div style="flex:1;min-width:0;">
        <p style="margin:0 0 2px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:#f59e0b;">Integrity Warning</p>
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#fff;">Trust Score Decreased to ${score}/100</p>
        <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">Non-government document submitted. Continued violations will result in permanent access block.</p>
      </div>
      <button id="__penalty_toast_close__" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:#475569;font-size:18px;line-height:1;padding:0;">&#x2715;</button>
    </div>
  `;

  document.body.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), 20000);
  document.getElementById("__penalty_toast_close__")?.addEventListener("click", () => {
    clearTimeout(timer);
    toast.remove();
  });
}

export default function App() {
  // Navigation & User session states
  const [activeTab, setActiveTab] = useState<string>("home");
  const [selectedLang, setSelectedLang] = useState<"en" | "te" | "hi">("en");
  const [sourceLang, setSourceLang] = useState<"en" | "te" | "hi">("en");
  const [fontSizeAdjustment, setFontSizeAdjustment] = useState<number>(0);
  const [highContrast, setHighContrast] = useState<boolean>(false);

  // Authenticated Profile
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem("docuease_user");
    return cached ? JSON.parse(cached) : null;
  });
  const [showAuthPage, setShowAuthPage] = useState<boolean>(false);
  const [showLoginPromptForUpload, setShowLoginPromptForUpload] = useState<boolean>(false);

  // Input states
  const [inputText, setInputText] = useState<string>("");
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string; type: string; base64: string } | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [complexityMode, setComplexityMode] = useState<"summary" | "plain" | "literal" | "overlay">("plain");
  const [hoveredOrigIdx, setHoveredOrigIdx] = useState<number>(0);
  const [overlayCopied, setOverlayCopied] = useState<boolean>(false);

  // Output States & Processing states
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [warningScore, setWarningScore] = useState<number>(100);
  const [currentResult, setCurrentResult] = useState<SimplifiedResult | null>(null);

  // History states
  const [historyList, setHistoryList] = useState<SimplifiedResult[]>([]);
  const [savedList, setSavedList] = useState<SimplifiedResult[]>([]);
  const [portalTrustScore, setPortalTrustScore] = useState<number>(100);

  // Contact US Form States
  const [contactForm, setContactForm] = useState({ name: "", email: "", idCode: "", message: "" });
  const [contactSuccess, setContactSuccess] = useState(false);

  // Notification States
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Speech controls
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [speakingSentenceIndex, setSpeakingSentenceIndex] = useState<number>(-1);

  // Real-time refs to circumvent stale closures during recursive synthesis callbacks
  const playbackSpeedRef = useRef<number>(1);
  const selectedLangRef = useRef<"en" | "te" | "hi">("en");
  const isChangingSpeedRef = useRef<boolean>(false);

  // Keep references in sync with real-time state values
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  // References for file dialog, highlight indexing and TTS
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentencesRef = useRef<string[]>([]);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Fetch initial profile/history from the backend on mount
  useEffect(() => {
    fetchHistoryAndProfile();
  }, []);

  const fetchHistoryAndProfile = async (activeUser?: UserProfile | null) => {
    try {
      let emailVal = "";
      if (activeUser !== undefined) {
        emailVal = activeUser?.email || "";
      } else {
        const cached = localStorage.getItem("docuease_user");
        const parsed = cached ? JSON.parse(cached) : null;
        emailVal = parsed?.email || user?.email || "";
      }

      const histRes = await fetch("/api/history", {
        headers: {
          "x-user-email": emailVal
        }
      });
      if (histRes.ok) {
        const data = await histRes.json();
        setHistoryList(data.history || []);
        setSavedList(data.saved || []);
        if (data.trustScore) {
          setPortalTrustScore(data.trustScore);
          // Sync with logged in user profile trust score
          const cachedUser = localStorage.getItem("docuease_user");
          if (cachedUser) {
            const parsedUser = JSON.parse(cachedUser);
            const updatedUser = { ...parsedUser, trustScore: data.trustScore };
            setUser(updatedUser);
            localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
          }
        }
      }
    } catch (e) {
      console.warn("Backend API not reachable. Reverting to persistent memory.", e);
      // Fallback load from localStorage
      const cachedHist = localStorage.getItem("docuease_history");
      const cachedSaved = localStorage.getItem("docuease_saved");
      if (cachedHist) setHistoryList(JSON.parse(cachedHist));
      if (cachedSaved) setSavedList(JSON.parse(cachedSaved));
    }
  };

  // Sync state to LocalStorage as safety backup
  useEffect(() => {
    localStorage.setItem("docuease_history", JSON.stringify(historyList));
    localStorage.setItem("docuease_saved", JSON.stringify(savedList));
  }, [historyList, savedList]);

  // Handle active speech cancellation when switching to Telugu or Hindi translated tabs
  useEffect(() => {
    if (complexityMode === "plain" && (selectedLang === "te" || selectedLang === "hi")) {
      handleCancelSpeech();
    }
  }, [complexityMode, selectedLang]);

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Process selected file to Base64 data url for API transmission
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!user) {
      setShowLoginPromptForUpload(true);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileReader = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      setShowLoginPromptForUpload(true);
      return;
    }
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const isTextFile = file.type === "text/plain" || file.name.endsWith(".txt");
    const isImageFile = file.type.startsWith("image/");
    setErrorMsg("");
    if (portalTrustScore > 0) setIsLocked(false);

    if (isTextFile) {
      const reader = new FileReader();
      reader.onload = () => {
        const textContent = reader.result as string;
        setInputText(textContent);
        setFileDetails({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + " MB",
          type: "text/plain",
          base64: null
        });
      };
      reader.readAsText(file);
    } else if (isImageFile) {
      // Compress image client-side to keep under 4MB limit, prevent payload too large & speed up upload
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setErrorMsg("Failed to initialize canvas for image compression.");
          return;
        }

        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert and compress to JPEG with 0.75 quality for dramatic size minimization
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);
        const base64Clean = compressedBase64.split(",")[1];

        const estimatedBytes = Math.round((base64Clean.length * 3) / 4);
        const sizeStr = (estimatedBytes / 1024 / 1024).toFixed(2) + " MB";

        setFileDetails({
          name: file.name,
          size: sizeStr,
          type: "image/jpeg",
          base64: base64Clean
        });
        setInputText(`[UPLOADED FILE DETECTED: ${file.name}] Ready for simplified digital auditing.`);
      };
      img.onerror = () => {
        setErrorMsg("Failed to process the uploaded image file. Please verify it is a valid format.");
      };
    } else {
      // PDF or other binaries
      if (file.size > 4 * 1024 * 1024) {
        setErrorMsg("Uploaded PDF document is too large. For secure billing, PDF files must be under 4MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64Result = reader.result as string;
        const base64Clean = base64Result.split(",")[1];
        setFileDetails({
          name: file.name,
          size: (file.size / 1024 / 1024).toFixed(2) + " MB",
          type: file.type || "application/octet-stream",
          base64: base64Clean
        });
        setInputText(`[UPLOADED FILE DETECTED: ${file.name}] Ready for simplified digital auditing.`);
      };
      reader.readAsDataURL(file);
    }
  };

  // Paste Sample document shortcut for easy demonstration
  const handleLoadSample = () => {
    setInputText(
      `GOVERNMENT OF TELANGANA\nREVENUE (EXCISE-II) DEPARTMENT\n\nG.O.Ms.No. 143\t\t\t\t\tDate: 12.05.2025\n\nSubject: Guidelines for execution of National Solatium and Rehabilitation Welfare Program for small-land agriculturalists aggrieved by water logging in command areas.\n\nORDER:\nWhereas the High Commission of Agricultural reforms has recommended immediate solatium under clause 4.2 of statutory directive. Now therefore, the Government in pursuance of executive authority under constitution article 243, hereby notifies that an ex-gratia amount of ₹5,000/- (Rupees Five Thousand only) per household shall be disbursed with absolute finality to eligible agriculturalists whose primary landholding falls beneath 2.5 acres. Applications must trigger within 30 days. No proxy applications or third-party land developers shall be status-eligible under any terms of force majeure.`
    );
    setFileDetails(null);
  };

  // Submit Processing Call
  const handleSimplifyDocument = async () => {
    if (!user) {
      setShowAuthPage(true);
      setErrorMsg("Secure Access Notice: Please authenticate your account (Sign In or Sign Up) before executing the document simplification and translation NLP engine.");
      return;
    }

    if (!inputText.trim() && !fileDetails) {
      setErrorMsg("Please paste a regulatory document text or drag in a document file to proceed.");
      return;
    }

    setIsProcessing(true);
    setErrorMsg("");
    setCurrentResult(null);

    // Mock progress status sequences
    const steps = [
      "Analyzing document authenticity metrics...",
      "Running legal text structure decomposition...",
      "Simplifying complex terms with regional glossaries...",
      "Translating plain-language version into Telugu Unicode scripts...",
      "Translating plain-language version into official Hindi corpus...",
      "Generating high-fidelity digital output..."
    ];

    let stepIdx = 0;
    setProgressStep(steps[0]);
    const progressInterval = setInterval(() => {
      if (stepIdx < steps.length - 1) {
        stepIdx++;
        setProgressStep(steps[stepIdx]);
      }
    }, 1200);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": user?.email || ""
        },
        body: JSON.stringify({
          text: inputText,
          fileData: fileDetails?.base64 || null,
          fileName: fileDetails?.name || null,
          mimeType: fileDetails?.type || null,
          sourceLang: sourceLang
        })
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errMsg = "Platform gateway dropped connection.";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
          if (errData.locked) setIsLocked(true);
          if (errData.trustScore !== undefined) {
            const newScore = errData.trustScore;
            setWarningScore(newScore);
            setPortalTrustScore(newScore);
            showPenaltyToast(newScore);
            if (user) {
              const updatedUser = { ...user, trustScore: newScore };
              setUser(updatedUser);
              localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
            }
          }
        } catch (jsonErr) {
          try {
            const rawText = await response.text();
            if (rawText && rawText.length < 300) {
              errMsg = rawText;
            } else {
              errMsg = `Server gateway returned status ${response.status}. Please make sure your file is valid and under 4MB.`;
            }
          } catch (textErr) {
            errMsg = `Server gateway returned status ${response.status}.`;
          }
        }
        throw new Error(errMsg);
      }

      let payload: any;
      try {
        payload = await response.json();
      } catch (jsonParseErr) {
        throw new Error("Received an invalid response from the gateway. Please try again with a cleaner document input.");
      }
      setCurrentResult(payload.result);
      if (payload.trustScore) {
        setPortalTrustScore(payload.trustScore);
        if (user) {
          const updatedUser = { ...user, trustScore: payload.trustScore };
          setUser(updatedUser);
          localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
        }
      }
      setActiveTab("home"); // ensure viewport highlights workspace

      // Refresh persistent list from server
      fetchHistoryAndProfile();
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error(e);
      setErrorMsg(e.message || "An unexpected NLP compilation error occured. Verify your inputs or Gemini API Key.");
    } finally {
      setIsProcessing(false);
      setProgressStep("");
    }
  };

  // Toggle Save result
  const handleToggleSave = async (docId: string, currentState: boolean) => {
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-email": user?.email || ""
        },
        body: JSON.stringify({ documentId: docId, saveState: !currentState })
      });
      if (res.ok) {
        const data = await res.json();
        setSavedList(data.saved || []);
        fetchHistoryAndProfile();
      }
    } catch (e) {
      // client status fallback
      const target = historyList.find(h => h.id === docId);
      if (target) {
        if (currentState) {
          setSavedList(prev => prev.filter(s => s.id !== docId));
        } else {
          setSavedList(prev => [target, ...prev]);
        }
      }
    }
  };

  // Delete result from history
  const handleDeleteItem = async (docId: string) => {
    try {
      const res = await fetch(`/api/history/${docId}`, {
        method: "DELETE",
        headers: {
          "x-user-email": user?.email || ""
        }
      });
      if (res.ok) {
        setHistoryList(prev => prev.filter(h => h.id !== docId));
        setSavedList(prev => prev.filter(s => s.id !== docId));
        if (currentResult?.id === docId) {
          setCurrentResult(null);
        }
      }
    } catch (e) {
      setHistoryList(prev => prev.filter(h => h.id !== docId));
      setSavedList(prev => prev.filter(s => s.id !== docId));
    }
  };

  // Clear entire history
  const handleClearHistory = async () => {
    if (!window.confirm("Verify: Are you sure you want to clear your entire verification history?")) return;
    try {
      await fetch("/api/history/clear", {
        method: "POST",
        headers: {
          "x-user-email": user?.email || ""
        }
      });
      setHistoryList([]);
      setSavedList([]);
      setCurrentResult(null);
      setPortalTrustScore(100);

      const cachedUser = localStorage.getItem("docuease_user");
      if (cachedUser) {
        const parsedUser = JSON.parse(cachedUser);
        const updatedUser = { ...parsedUser, trustScore: 100 };
        setUser(updatedUser);
        localStorage.setItem("docuease_user", JSON.stringify(updatedUser));
      }
    } catch (e) {
      setHistoryList([]);
      setSavedList([]);
      setPortalTrustScore(100);
    }
  };

  // Audio Accessibility Synthesis - Web Speech API
  const handleSpeak = (textToSpeak: string) => {
    if ("speechSynthesis" in window) {
      // Stop ongoing speech
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);

      if (!textToSpeak) return;

      // Split text strictly for Unicode aware sentence highlighting
      const sentSet = splitIntoSentences(textToSpeak);
      sentencesRef.current = sentSet;
      setSpeakingSentenceIndex(0);

      // Start sequential reading of sentences to keep highlighter in perfect lockstep
      speakSetSequence(0, sentSet);
    } else {
      alert("This browser does not support the Web Speech API. Please open in Chrome or Edge.");
    }
  };

  const speakSetSequence = (index: number, list: string[]) => {
    if (index >= list.length) {
      setIsSpeaking(false);
      setSpeakingSentenceIndex(-1);
      return;
    }

    setSpeakingSentenceIndex(index);
    setIsSpeaking(true);
    setIsPaused(false);

    const utterance = new SpeechSynthesisUtterance(list[index]);
    speechUtteranceRef.current = utterance;

    // Detect language of the active tab for realistic voices matching regional parameters
    if (selectedLangRef.current === "te") {
      utterance.lang = "te-IN";
    } else if (selectedLangRef.current === "hi") {
      utterance.lang = "hi-IN";
    } else {
      utterance.lang = "en-IN";
    }

    // Dynamic speed rates from real-time ref
    utterance.rate = playbackSpeedRef.current;

    // Retrieve compatible Indian accents/voices if available
    const voices = window.speechSynthesis.getVoices();
    let matchingVoice = null;
    if (selectedLangRef.current === "te") {
      matchingVoice = voices.find(v => v.lang.startsWith("te")) || voices.find(v => v.lang.includes("IN"));
    } else if (selectedLangRef.current === "hi") {
      matchingVoice = voices.find(v => v.lang.startsWith("hi")) || voices.find(v => v.lang.includes("IN"));
    } else {
      matchingVoice = voices.find(v => v.lang.includes("en-IN")) || voices.find(v => v.lang.includes("IN"));
    }
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => {
      if (isChangingSpeedRef.current) return;
      speakSetSequence(index + 1, list);
    };

    utterance.onerror = (evt) => {
      if (isChangingSpeedRef.current) return;
      console.warn("TTS step failed, jumping forward", evt);
      speakSetSequence(index + 1, list);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Handles real-time speed adjustment during ongoing playback
  const handleSpeedChange = (newSpeed: number) => {
    setPlaybackSpeed(newSpeed);
    playbackSpeedRef.current = newSpeed;

    if (isSpeaking && !isPaused && sentencesRef.current.length > 0 && speakingSentenceIndex >= 0) {
      if ("speechSynthesis" in window) {
        isChangingSpeedRef.current = true;
        window.speechSynthesis.cancel();
        isChangingSpeedRef.current = false;
        speakSetSequence(speakingSentenceIndex, sentencesRef.current);
      }
    }
  };

  const handlePauseSpeech = () => {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        setIsPaused(true);
      }
    }
  };

  const handleResumeSpeech = () => {
    if ("speechSynthesis" in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPaused(false);
      }
    }
  };

  const handleCancelSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setSpeakingSentenceIndex(-1);
    }
  };

  // Dynamic sentence extraction helper
  const splitIntoSentences = (text: string): string[] => {
    if (!text) return [];
    // Regular expression that honors Telugu/Hindi patterns & English full stops
    const rawParts = text.split(/([.!?।\n]+)/g);
    const result: string[] = [];
    let accum = "";

    for (let i = 0; i < rawParts.length; i++) {
      const chunk = rawParts[i];
      if (/^[.!?।\n]+$/.test(chunk)) {
        accum += chunk;
        if (accum.trim()) {
          result.push(accum.trim());
        }
        accum = "";
      } else {
        accum += chunk;
      }
    }
    if (accum.trim()) {
      result.push(accum.trim());
    }
    return result.filter(s => s.length > 1);
  };

  // Bidirectional Jaccard / Proportional text alignment & glossary highlighter for Overlay Comparison Mode
  const getMatchedSimplifiedIndex = (origIdx: number, sentsOrig: string[], sentsSimp: string[]): number => {
    if (sentsOrig.length === 0 || sentsSimp.length === 0) return 0;

    const origSent = sentsOrig[origIdx];
    if (!origSent) return 0;

    const origWords = new Set(
      origSent.toLowerCase()
        .replace(/[^\w\s\u0900-\u097F\u0C00-\u0C7F]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2)
    );

    if (origWords.size === 0) {
      const ratio = sentsSimp.length / sentsOrig.length;
      return Math.min(Math.floor(origIdx * ratio), sentsSimp.length - 1);
    }

    let bestIndex = 0;
    let maxOverlap = -1;

    for (let i = 0; i < sentsSimp.length; i++) {
      const simpWords = sentsSimp[i].toLowerCase()
        .replace(/[^\w\s\u0900-\u097F\u0C00-\u0C7F]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2);

      let overlap = 0;
      for (const w of simpWords) {
        if (origWords.has(w)) {
          overlap++;
        }
      }

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestIndex = i;
      }
    }

    if (maxOverlap <= 0) {
      const ratio = sentsSimp.length / sentsOrig.length;
      return Math.min(Math.floor(origIdx * ratio), sentsSimp.length - 1);
    }

    return bestIndex;
  };

  const getMatchedOriginalIndex = (simpIdx: number, sentsOrig: string[], sentsSimp: string[]): number => {
    if (sentsOrig.length === 0 || sentsSimp.length === 0) return 0;

    const simpSent = sentsSimp[simpIdx];
    if (!simpSent) return 0;

    const simpWords = new Set(
      simpSent.toLowerCase()
        .replace(/[^\w\s\u0900-\u097F\u0C00-\u0C7F]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2)
    );

    if (simpWords.size === 0) {
      const ratio = sentsOrig.length / sentsSimp.length;
      return Math.min(Math.floor(simpIdx * ratio), sentsOrig.length - 1);
    }

    let bestIndex = 0;
    let maxOverlap = -1;

    for (let i = 0; i < sentsOrig.length; i++) {
      const origWords = sentsOrig[i].toLowerCase()
        .replace(/[^\w\s\u0900-\u097F\u0C00-\u0C7F]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2);

      let overlap = 0;
      for (const w of origWords) {
        if (simpWords.has(w)) {
          overlap++;
        }
      }

      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestIndex = i;
      }
    }

    if (maxOverlap <= 0) {
      const ratio = sentsOrig.length / sentsSimp.length;
      return Math.min(Math.floor(simpIdx * ratio), sentsOrig.length - 1);
    }

    return bestIndex;
  };

  const renderTextWithGlossaryHighlights = (text: string, glossary: GlossaryItem[]) => {
    if (!text || !glossary || glossary.length === 0) return text;

    const sortedGlossary = [...glossary].sort((a, b) => b.term.length - a.term.length);
    const escapedTerms = sortedGlossary.map(g => g.term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));

    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      const matchedTerm = sortedGlossary.find(g => g.term.toLowerCase() === part.toLowerCase());
      if (matchedTerm) {
        return (
          <span
            key={index}
            className="font-bold text-amber-800 bg-amber-50 h-fit border-b border-dashed border-amber-500 px-1 rounded cursor-help inline-block group relative"
            title={matchedTerm.definition}
          >
            {part}
            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-slate-900 text-white text-[10px] p-2.5 rounded-lg shadow-lg max-w-xs z-50 w-52 leading-relaxed font-sans normal-case font-normal border border-slate-700">
              <strong className="text-amber-400 block mb-0.5">{matchedTerm.term}:</strong> {matchedTerm.definition}
            </span>
          </span>
        );
      }
      return part;
    });
  };

  const handleCopyOverlaySideBySide = () => {
    if (!currentResult) return;
    const originalSentences = splitIntoSentences(currentResult.originalText);
    const activeSimplifiedText = selectedLang === "te"
      ? currentResult.teluguTranslation
      : selectedLang === "hi"
        ? currentResult.hindiTranslation
        : currentResult.simplifiedEnglish;
    const simplifiedSentences = splitIntoSentences(activeSimplifiedText);

    let output = `======================================================================\n`;
    output += `SIDE-BY-SIDE STUDY: ORIGINAL LEGALESE vs. CITIZEN SIMPLIFIED\n`;
    output += `Document Title: ${currentResult.title || "Regulatory Information circular"}\n`;
    output += `Language: ${selectedLang === "te" ? "Telugu | తెలుగు" : selectedLang === "hi" ? "Hindi | हिन्दी" : "Simplified English"}\n`;
    output += `======================================================================\n\n`;

    originalSentences.forEach((orig, idx) => {
      const matchIdx = getMatchedSimplifiedIndex(idx, originalSentences, simplifiedSentences);
      const simp = simplifiedSentences[matchIdx] || "(No direct translation found)";
      output += `[Clause #${idx + 1}]\n`;
      output += `ORIGINAL LEGALESE:\n${orig.trim()}\n\n`;
      output += `SIMPLIFIED ALTERNATIVE:\n${simp.trim()}\n`;
      output += `----------------------------------------------------------------------\n\n`;
    });

    navigator.clipboard.writeText(output);
    setOverlayCopied(true);
    setTimeout(() => setOverlayCopied(false), 2000);
  };

  const handlePrintOverlay = () => {
    window.print();
  };

  const handleWhatsAppShare = (title: string, summary: string) => {
    const formatted = `*DocuEase Official Simplification Summary*\n\n*Document:* ${title}\n\n*Summary:* ${summary}\n\n_Generated via National Digital Transparency Initiative_`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(formatted)}`;
    window.open(url, "_blank");
  };

  const handleDownloadTxt = (title: string, details: string) => {
    const blob = new Blob([`DOCUEASE SIMPLIFIED EXPORT\n=========================\nTitle: ${title}\nDate: ${new Date().toLocaleDateString()}\n\nContent:\n${details}\n\n-------------------------\nVerified of high citizen trust confidence via Indian digital NLP.`], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${title.replace(/\s+/g, "_")}_simplification.txt`;
    link.click();
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    setPortalTrustScore(profile.trustScore);
    setShowAuthPage(false);
    fetchHistoryAndProfile(profile);
    setNotification({
      message: `You have successfully logged in as ${profile.displayName}!`,
      type: "success"
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("docuease_user");
    setUser(null);
    setPortalTrustScore(100);
    setHistoryList([]);
    setSavedList([]);
    setCurrentResult(null);
    setNotification({
      message: "You have successfully logged out.",
      type: "success"
    });
  };

  const getActiveTextForSpeech = (result: SimplifiedResult) => {
    if (complexityMode === "summary") return result.summary;
    if (selectedLang === "te") return result.teluguTranslation;
    if (selectedLang === "hi") return result.hindiTranslation;
    return result.simplifiedEnglish;
  };

  const [inputMode, setInputMode] = useState<"paste" | "upload">("upload");

  return (
    <div className={`flex h-screen overflow-hidden bg-white ${highContrast ? "high-contrast" : ""}`}>

      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">DocuEase</span>
          </div>
        </div>

        {/* New Document Button */}
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => { setCurrentResult(null); setInputText(""); setFileDetails(null); setActiveTab("home"); setErrorMsg(""); }}
            className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition cursor-pointer"
          >
            <Plus size={16} />
            New Document
          </button>
        </div>

        {/* Nav Items */}
        <nav className="px-4 py-2 space-y-0.5">
          <button
            onClick={() => setActiveTab("saved")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition cursor-pointer ${activeTab === "saved" ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}
          >
            <Bookmark size={16} />
            Saved
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition cursor-pointer ${activeTab === "history" ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}
          >
            <Clock size={16} />
            History
          </button>
        </nav>

        {/* Recent Section */}
        {historyList.length > 0 && (
          <div className="px-4 py-3 flex-1 overflow-y-auto min-h-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">Recent</p>
            <div className="space-y-0.5">
              {historyList.slice(0, 10).map(hist => (
                <button
                  key={hist.id}
                  onClick={() => { setCurrentResult(hist); setInputText(hist.originalText || ""); setActiveTab("home"); }}
                  title={hist.title || "Government Directive"}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition cursor-pointer truncate block ${currentResult?.id === hist.id ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}
                >
                  {hist.title || "Government Directive"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0" />

        {/* User Card */}
        <div className="p-4 border-t border-gray-100">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{user.displayName}</p>
                  <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500">Trust Score</span>
                  <span className="font-semibold text-gray-700">{portalTrustScore}/100</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${portalTrustScore > 50 ? "bg-blue-500" : portalTrustScore > 20 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${portalTrustScore}%` }}
                  />
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition cursor-pointer"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthPage(true)}
              className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700 py-2 px-3 border border-blue-200 rounded-lg hover:bg-blue-50 transition cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between shrink-0">
          <span className="font-semibold text-gray-900 text-sm">DocuEase</span>
          {user && (
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">

          {/* Auth Page */}
          {showAuthPage && (
            <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
              <AuthPortal onLoginSuccess={handleLoginSuccess} onClose={() => setShowAuthPage(false)} />
            </div>
          )}

          {/* Login Required Modal */}
          {showLoginPromptForUpload && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" id="login_required_upload_modal">
              <div className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-sm w-full overflow-hidden relative">
                <button onClick={() => setShowLoginPromptForUpload(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                  <X size={18} />
                </button>
                <div className="p-6 text-center space-y-4">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-red-200">
                    <UploadCloud size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900" id="upload_popup_title">Authentication Required</h3>
                    <p className="text-xs text-gray-500 mt-1" id="upload_popup_message">You must sign in before uploading a document.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button id="upload_popup_close" onClick={() => setShowLoginPromptForUpload(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer">Cancel</button>
                    <button id="upload_popup_login_btn" onClick={() => { setShowLoginPromptForUpload(false); setShowAuthPage(true); }} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition cursor-pointer">Sign In</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* HOME TAB */}
          {activeTab === "home" && (
            <div id="main-workspace-container">

              {/* PROCESSING STATE */}
              {isProcessing && (
                <div className="max-w-2xl mx-auto px-6 py-16 text-center">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 space-y-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                      <Loader2 className="animate-spin text-blue-600" size={28} />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">Processing your document...</h3>
                      <p className="text-sm text-blue-600 font-medium mt-1">{progressStep}</p>
                    </div>
                    <div className="space-y-2 max-w-sm mx-auto pt-2">
                      <div className="h-2 bg-gray-100 rounded-full w-full animate-pulse" />
                      <div className="h-2 bg-gray-100 rounded-full w-4/5 mx-auto animate-pulse" />
                      <div className="h-2 bg-gray-100 rounded-full w-3/5 mx-auto animate-pulse" />
                    </div>
                  </div>
                </div>
              )}

              {/* HERO + UPLOAD (no result yet) */}
              {!isProcessing && !currentResult && (
                <div className="max-w-2xl mx-auto px-6 py-10">

                  {/* Error */}
                  {errorMsg && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3" id="error_alert">
                      <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="text-sm font-semibold text-red-800">Processing Failed</p>
                        <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
                      </div>
                    </div>
                  )}

                  {/* Hero Text */}
                  <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">Understand any government document</h1>
                    <p className="text-gray-500 text-sm">Upload or paste your document and get a simplified, translated version instantly.</p>
                  </div>

                  {/* Upload Panel */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
                    {/* Mode Tabs */}
                    <div className="flex border-b border-gray-100">
                      <button
                        onClick={() => setInputMode("paste")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition cursor-pointer ${inputMode === "paste" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <Clipboard size={15} />
                        Paste text
                      </button>
                      <button
                        onClick={() => setInputMode("upload")}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition cursor-pointer ${inputMode === "upload" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
                      >
                        <UploadCloud size={15} />
                        Upload file
                      </button>
                    </div>

                    {/* Source Language Pills */}
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-medium">Source language:</span>
                      {([{code: "en", label: "English"}, {code: "hi", label: "Hindi"}, {code: "te", label: "Telugu"}] as {code: "en"|"te"|"hi", label: string}[]).map(l => (
                        <button
                          key={l.code}
                          onClick={() => setSourceLang(l.code)}
                          className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${sourceLang === l.code ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>

                    {/* Input Area */}
                    <div className="p-5">
                      <input ref={fileInputRef} id="file-selector" type="file" accept="*" onChange={handleFileReader} className="hidden" />

                      {inputMode === "upload" ? (
                        <div
                          id="document_drag_frame"
                          onDragEnter={handleDrag}
                          onDragLeave={handleDrag}
                          onDragOver={handleDrag}
                          onDrop={handleFileDrop}
                          onClick={() => { if (!user) { setShowLoginPromptForUpload(true); } else { fileInputRef.current?.click(); } }}
                          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${dragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"}`}
                        >
                          <div className="w-12 h-12 bg-white rounded-full shadow-sm border border-gray-200 flex items-center justify-center">
                            <UploadCloud size={22} className="text-gray-400" />
                          </div>
                          {fileDetails ? (
                            <>
                              <p className="text-sm font-semibold text-gray-800">{fileDetails.name}</p>
                              <p className="text-xs text-gray-400">{fileDetails.size}</p>
                              <button onClick={(e) => { e.stopPropagation(); setFileDetails(null); setInputText(""); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove file</button>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-gray-700">Drop your file here, or <span className="text-blue-600">browse</span></p>
                              <p className="text-xs text-gray-400">PDF, TXT, JPG, PNG supported · Max 4MB</p>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <textarea
                            id="pasted_text_input"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Paste your government document text here... e.g., G.O.Ms.No. 143..."
                            rows={8}
                            className="w-full p-4 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                          />
                          <div className="absolute bottom-3 right-3 text-[10px] text-gray-400">{inputText.length} chars</div>
                        </div>
                      )}
                    </div>

                    {/* Target Language + Submit */}
                    <div className="px-5 pb-5 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 font-medium">Translate to:</span>
                        {([{code: "en", label: "English"}, {code: "te", label: "Telugu"}, {code: "hi", label: "Hindi"}] as {code: "en"|"te"|"hi", label: string}[]).map(l => (
                          <button
                            key={l.code}
                            onClick={() => setSelectedLang(l.code)}
                            className={`px-3 py-1 text-xs rounded-full border transition cursor-pointer ${selectedLang === l.code ? "bg-blue-600 text-white border-blue-600 font-semibold" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                      <button
                        id="process-simplifier-btn"
                        onClick={handleSimplifyDocument}
                        disabled={isLocked || portalTrustScore === 0}
                        className={`w-full py-3 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition ${(isLocked || portalTrustScore === 0) ? "bg-red-100 text-red-700 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm"}`}
                      >
                        {portalTrustScore === 0 ? "Access Revoked — Trust Score at 0" : isLocked ? "Upload Blocked — Invalid Document" : "Simplify & Translate"}
                        {!(isLocked || portalTrustScore === 0) && <ArrowRight size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Feature Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
                        <FileText size={18} className="text-blue-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Government-focused</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">Specialized in Indian government orders, circulars, and welfare documents.</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center mb-3">
                        <Volume2 size={18} className="text-green-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">3-language output</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">Get results in English, Telugu, and Hindi with voice narration support.</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
                        <BookOpen size={18} className="text-amber-600" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">Auto glossary</h3>
                      <p className="text-xs text-gray-500 leading-relaxed">Complex legal terms are automatically detected and explained in plain language.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* RESULT VIEW */}
              {!isProcessing && currentResult && (
                <div className="px-6 py-6 space-y-4" id="result-view">

                  {/* Error above result */}
                  {errorMsg && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3" id="error_alert">
                      <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="text-sm font-semibold text-red-800">Processing Error</p>
                        <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Top Controls */}
                    <div className="border-b border-gray-100 px-5 py-3 flex flex-wrap justify-between items-center gap-3">
                      <div className="flex items-center gap-1">
                        {(["summary", "plain", "overlay", "literal"] as const).map(mode => (
                          <button
                            key={mode}
                            id={`tab_complexity_${mode}`}
                            onClick={() => setComplexityMode(mode)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition cursor-pointer ${complexityMode === mode ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                          >
                            {mode === "summary" ? "Summary" : mode === "plain" ? "Plain Language" : mode === "overlay" ? "Compare" : "Original"}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* TTS controls */}
                        {!(complexityMode === "plain" && (selectedLang === "te" || selectedLang === "hi")) && (
                          <div className="flex items-center border border-gray-200 rounded-lg bg-white px-1 py-0.5 gap-1" id="speech_audio_controls">
                            {isSpeaking ? (
                              <>
                                <button id="playback_stop_btn" onClick={handleCancelSpeech} className="p-1 text-red-600 hover:bg-gray-100 rounded cursor-pointer" title="Stop"><Square size={13} fill="currentColor" /></button>
                                {isPaused ? (
                                  <button id="playback_resume_btn" onClick={handleResumeSpeech} className="p-1 text-green-600 hover:bg-gray-100 rounded cursor-pointer" title="Resume"><Play size={13} fill="currentColor" /></button>
                                ) : (
                                  <button id="playback_pause_btn" onClick={handlePauseSpeech} className="p-1 text-gray-600 hover:bg-gray-100 rounded cursor-pointer" title="Pause"><Pause size={13} fill="currentColor" /></button>
                                )}
                              </>
                            ) : (
                              <button id="playback_play_btn" onClick={() => handleSpeak(getActiveTextForSpeech(currentResult))} className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:bg-gray-100 rounded cursor-pointer text-xs font-medium" title="Listen">
                                <Volume2 size={13} /> Listen
                              </button>
                            )}
                            <select id="playback_speed_selector" value={playbackSpeed} onChange={(e) => handleSpeedChange(parseFloat(e.target.value))} className="text-[10px] font-bold outline-none border-l border-gray-200 pl-1 bg-white text-gray-600 cursor-pointer ml-1">
                              <option value="0.5">0.5x</option>
                              <option value="1">1x</option>
                              <option value="1.25">1.25x</option>
                              <option value="1.5">1.5x</option>
                              <option value="2">2x</option>
                            </select>
                          </div>
                        )}
                        {/* Language */}
                        <div className="flex gap-1">
                          {([{code:"en",label:"EN"},{code:"te",label:"TE"},{code:"hi",label:"HI"}] as {code:"en"|"te"|"hi",label:string}[]).map(l => (
                            <button key={l.code} onClick={() => setSelectedLang(l.code)} className={`px-2 py-1 text-xs rounded border transition cursor-pointer ${selectedLang === l.code ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{l.label}</button>
                          ))}
                        </div>
                        {/* Bookmark */}
                        <button
                          id="btn_bookmark_result"
                          onClick={() => handleToggleSave(currentResult.id, savedList.some(s => s.id === currentResult.id))}
                          className={`p-1.5 border rounded-lg cursor-pointer transition ${savedList.some(s => s.id === currentResult.id) ? "text-amber-500 border-amber-200 bg-amber-50" : "text-gray-400 border-gray-200 hover:border-gray-300"}`}
                          title="Bookmark"
                        >
                          <Bookmark size={14} fill={savedList.some(s => s.id === currentResult.id) ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      {/* Title */}
                      <div className="mb-5">
                        <span className="text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded uppercase">Verified Document</span>
                        <h2 className="text-lg font-bold text-gray-900 mt-1.5">{currentResult.title || "Government Document"}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Processed: {new Date(currentResult.timestamp).toLocaleString()}</p>
                      </div>

                      {/* Summary Mode */}
                      {complexityMode === "summary" && (
                        <div id="executive_summary_holder">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Executive Summary</p>
                          <p className="text-sm border-l-4 border-blue-400 pl-4 italic leading-relaxed text-gray-700">{currentResult.summary}</p>
                        </div>
                      )}

                      {/* Original Mode */}
                      {complexityMode === "literal" && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed select-text" id="original_pasted_holder">
                          {currentResult.originalText}
                        </div>
                      )}

                      {/* Overlay Mode */}
                      {complexityMode === "overlay" && (() => {
                        const originalSentences = splitIntoSentences(currentResult.originalText);
                        const activeSimplifiedText = selectedLang === "te" ? currentResult.teluguTranslation : selectedLang === "hi" ? currentResult.hindiTranslation : currentResult.simplifiedEnglish;
                        const simplifiedSentences = splitIntoSentences(activeSimplifiedText);
                        const matchedSimpIndex = getMatchedSimplifiedIndex(hoveredOrigIdx, originalSentences, simplifiedSentences);
                        const activeOriginalSentence = originalSentences[hoveredOrigIdx] || "";
                        const activeSimplifiedSentence = simplifiedSentences[matchedSimpIndex] || "";

                        return (
                          <div className="space-y-4" id="overlay_comparison_holder">
                            <div className="flex flex-wrap justify-between items-center gap-2">
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Info size={14} className="text-blue-500" />
                                Hover over clauses to see plain language equivalent
                              </div>
                              <div className="flex gap-2" id="overlay_comparison_header_bar">
                                <button id="overlay_copy_all_btn" onClick={handleCopyOverlaySideBySide} className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition cursor-pointer ${overlayCopied ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                                  {overlayCopied ? <Check size={12} /> : <Copy size={12} />}
                                  {overlayCopied ? "Copied!" : "Copy all"}
                                </button>
                                <button id="overlay_print_btn" onClick={handlePrintOverlay} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg text-xs font-medium text-gray-600 transition cursor-pointer">
                                  <Printer size={12} />
                                  Print
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4" id="overlay_split_view">
                              {/* Original */}
                              <div className="border border-red-100 rounded-xl overflow-hidden flex flex-col h-80">
                                <div className="bg-red-50 px-3 py-2 border-b border-red-100 flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-red-700 uppercase tracking-wide">Original</span>
                                  <span className="text-[9px] text-red-400">{originalSentences.length} clauses</span>
                                </div>
                                <div className="p-3 space-y-2 overflow-y-auto flex-1">
                                  {originalSentences.map((sent, idx) => (
                                    <div
                                      key={idx}
                                      id={`overlay_orig_sent_${idx}`}
                                      onClick={() => setHoveredOrigIdx(idx)}
                                      onMouseEnter={() => setHoveredOrigIdx(idx)}
                                      className={`p-2 rounded-lg border text-xs leading-relaxed cursor-pointer transition ${hoveredOrigIdx === idx ? "bg-red-50 border-red-200 text-red-900" : "border-transparent text-gray-500 hover:bg-gray-50"}`}
                                    >
                                      <div className="flex gap-2">
                                        <span className={`text-[9px] font-bold px-1 rounded shrink-0 ${hoveredOrigIdx === idx ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>{idx + 1}</span>
                                        <div className="grow select-text">{renderTextWithGlossaryHighlights(sent, currentResult.glossary || [])}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Simplified */}
                              <div className="border border-green-100 rounded-xl overflow-hidden flex flex-col h-80">
                                <div className="bg-green-50 px-3 py-2 border-b border-green-100 flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-green-700 uppercase tracking-wide">Simplified</span>
                                  <span className="text-[9px] text-green-500">{selectedLang === "te" ? "Telugu" : selectedLang === "hi" ? "Hindi" : "English"}</span>
                                </div>
                                <div className="p-3 space-y-2 overflow-y-auto flex-1">
                                  {simplifiedSentences.map((sent, idx) => (
                                    <div
                                      key={idx}
                                      id={`overlay_simp_sent_${idx}`}
                                      onClick={() => setHoveredOrigIdx(getMatchedOriginalIndex(idx, originalSentences, simplifiedSentences))}
                                      onMouseEnter={() => setHoveredOrigIdx(getMatchedOriginalIndex(idx, originalSentences, simplifiedSentences))}
                                      className={`p-2 rounded-lg border text-xs leading-relaxed cursor-pointer transition ${matchedSimpIndex === idx ? "bg-green-50 border-green-200 text-green-900" : "border-transparent text-gray-500 hover:bg-gray-50"}`}
                                    >
                                      <div className="flex gap-2">
                                        <span className={`text-[9px] font-bold px-1 rounded shrink-0 ${matchedSimpIndex === idx ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{idx + 1}</span>
                                        <div className="grow select-text">{sent}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Insights */}
                            {activeOriginalSentence && (
                              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl" id="overlay_insights_panel">
                                <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-600">
                                  <FileCheck size={14} className="text-blue-500" />
                                  Clause #{hoveredOrigIdx + 1} <ArrowRight size={12} className="text-gray-400" /> Plain #{matchedSimpIndex + 1}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="bg-white p-3 rounded-lg border border-gray-200 text-center">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold">Length Reduction</p>
                                    {(() => {
                                      const origLen = activeOriginalSentence.split(/\s+/).filter(Boolean).length;
                                      const simpLen = activeSimplifiedSentence ? activeSimplifiedSentence.split(/\s+/).filter(Boolean).length : 0;
                                      const pct = origLen > 0 ? Math.max(0, Math.round(((origLen - simpLen) / origLen) * 100)) : 0;
                                      return <p className="text-xl font-bold text-gray-900 mt-1">{pct}% <span className="text-xs text-green-600 font-normal">shorter</span></p>;
                                    })()}
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Complexity</p>
                                    {(() => {
                                      const origLen = activeOriginalSentence.split(/\s+/).filter(Boolean).length;
                                      const simpLen = activeSimplifiedSentence ? activeSimplifiedSentence.split(/\s+/).filter(Boolean).length : 0;
                                      const ratio = origLen > 0 ? Math.min(100, Math.round((simpLen / origLen) * 100)) : 25;
                                      return (
                                        <div className="space-y-1.5">
                                          <div>
                                            <div className="flex justify-between text-[9px] text-gray-400 mb-0.5"><span>Original</span><span>100%</span></div>
                                            <div className="h-1.5 bg-red-200 rounded-full" />
                                          </div>
                                          <div>
                                            <div className="flex justify-between text-[9px] text-gray-400 mb-0.5"><span>Simplified</span><span>{ratio}%</span></div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-green-400 rounded-full" style={{ width: `${ratio}%` }} /></div>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                                    <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Jargon Found</p>
                                    <div className="flex flex-wrap gap-1">
                                      {(() => {
                                        const terms = (currentResult.glossary || []).filter(item => {
                                          const escaped = item.term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                          return new RegExp(escaped, 'i').test(activeOriginalSentence);
                                        });
                                        return terms.length > 0 ? terms.map((item, i) => (
                                          <span key={i} className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded cursor-help" title={item.definition}>{item.term}</span>
                                        )) : <p className="text-[10px] text-gray-400 italic">None found</p>;
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Plain Language Mode */}
                      {complexityMode === "plain" && (
                        <div className={`grid gap-6 ${selectedLang !== "en" ? "grid-cols-2" : "grid-cols-1"}`} id="bilingual_output_grid">
                          {/* English */}
                          <div className="flex flex-col">
                            <span className="text-[10px] bg-gray-100 text-gray-600 font-bold px-2 py-0.5 rounded uppercase inline-block mb-3 w-fit">Simplified English</span>
                            <div className="text-sm leading-relaxed text-gray-800 flex-1" id="english_simplified_text">
                              {splitIntoSentences(currentResult.simplifiedEnglish).map((sent, sIdx) => (
                                <span key={sIdx} className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}>{sent}{" "}</span>
                              ))}
                            </div>
                            <div className="pt-4 mt-auto flex gap-2">
                              <button
                                id="btn_whatsapp_share"
                                onClick={() => handleWhatsAppShare(currentResult.title, currentResult.summary)}
                                className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition shadow-sm"
                              >
                                <Share2 size={13} /> WhatsApp
                              </button>
                              <button
                                id="btn_export_txt"
                                onClick={() => {
                                  let details = `English Simplified:\n${currentResult.simplifiedEnglish}`;
                                  if (selectedLang === "te") details += `\n\nTelugu:\n${currentResult.teluguTranslation}`;
                                  if (selectedLang === "hi") details += `\n\nHindi:\n${currentResult.hindiTranslation}`;
                                  handleDownloadTxt(currentResult.title, details);
                                }}
                                className="flex-1 py-2 border border-gray-300 hover:bg-gray-900 text-gray-800 hover:text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition"
                              >
                                <Download size={13} /> Download
                              </button>
                            </div>
                          </div>

                          {/* Translation */}
                          {selectedLang !== "en" && (
                            <div className="flex flex-col border-l border-gray-100 pl-6">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase inline-block mb-3 w-fit ${selectedLang === "te" ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700"}`}>
                                {selectedLang === "te" ? "Telugu | తెలుగు" : "Hindi | हिन्दी"}
                              </span>
                              <div className="text-sm leading-relaxed text-gray-800 flex-1 tracking-wide" id="translated_target_text">
                                {selectedLang === "te" ? (
                                  splitIntoSentences(currentResult.teluguTranslation).map((sent, sIdx) => (
                                    <span key={sIdx} className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}>{sent}{" "}</span>
                                  ))
                                ) : (
                                  splitIntoSentences(currentResult.hindiTranslation).map((sent, sIdx) => (
                                    <span key={sIdx} className={speakingSentenceIndex === sIdx ? "speech-highlight" : ""}>{sent}{" "}</span>
                                  ))
                                )}
                              </div>
                              {currentResult.glossary && currentResult.glossary.length > 0 && (
                                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Glossary Aide</p>
                                  <p className="text-xs text-gray-700"><span className="font-bold">{currentResult.glossary[0].term}:</span> {currentResult.glossary[0].definition}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Glossary */}
                      {currentResult.glossary && currentResult.glossary.length > 0 && complexityMode !== "overlay" && (
                        <div className="border-t border-gray-100 pt-5 mt-5" id="glossary-section-block">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <BookOpen size={13} className="text-blue-500" />
                            Glossary
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {currentResult.glossary.map((item, idx) => (
                              <div key={idx} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs select-text">
                                <span className="font-bold text-gray-900 border-b border-dashed border-gray-300 cursor-help" title={item.definition}>{item.term}</span>
                                <p className="text-gray-500 mt-1 leading-relaxed">{item.definition}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="border-t border-gray-100 pt-4 mt-5 flex items-center justify-between gap-3 flex-wrap">
                        <button
                          onClick={() => handleDeleteItem(currentResult.id)}
                          className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition cursor-pointer"
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                        <button
                          onClick={() => { setCurrentResult(null); setInputText(""); setFileDetails(null); setErrorMsg(""); }}
                          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-medium transition cursor-pointer"
                        >
                          <Plus size={13} /> New Document
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div className="max-w-3xl mx-auto px-6 py-8" id="history_tab_panel">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">History</h2>
                {historyList.length > 0 && (
                  <button id="btn_history_clear_all" onClick={handleClearHistory} className="text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer">Clear all</button>
                )}
              </div>
              {historyList.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Clock size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-gray-500">No documents processed yet</p>
                  <p className="text-xs mt-1">Simplified documents will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map(hist => (
                    <div key={hist.id} id={`history_item_${hist.id}`} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4 hover:border-gray-300 transition">
                      <div
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        onClick={() => { setCurrentResult(hist); setInputText(hist.originalText || ""); setActiveTab("home"); }}
                      >
                        <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <FileText size={16} className="text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{hist.title || "Government Document"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(hist.timestamp).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleSave(hist.id, savedList.some(s => s.id === hist.id))}
                          className={`p-2 border rounded-lg cursor-pointer transition ${savedList.some(s => s.id === hist.id) ? "text-amber-500 border-amber-200 bg-amber-50" : "text-gray-400 border-gray-200 hover:border-gray-300"}`}
                        >
                          <Bookmark size={14} fill={savedList.some(s => s.id === hist.id) ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(hist.id)}
                          className="p-2 border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 rounded-lg cursor-pointer transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SAVED TAB */}
          {activeTab === "saved" && (
            <div className="max-w-3xl mx-auto px-6 py-8" id="saved_tab_panel">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Saved Documents</h2>
              </div>
              {savedList.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Bookmark size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium text-gray-500">No saved documents</p>
                  <p className="text-xs mt-1">Bookmark documents from the result view to save them here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedList.map(saved => (
                    <div key={saved.id} id={`saved_item_${saved.id}`} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded uppercase">{saved.documentType || "Document"}</span>
                          <button id={`remove_bookmark_${saved.id}`} onClick={() => handleToggleSave(saved.id, true)} className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer shrink-0">Remove</button>
                        </div>
                        <h4 className="text-sm font-semibold text-gray-900 mt-2">{saved.title}</h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{saved.summary}</p>
                      </div>
                      <button
                        id={`load_saved_home_${saved.id}`}
                        onClick={() => { setCurrentResult(saved); setInputText(saved.originalText || ""); setActiveTab("home"); }}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg cursor-pointer text-center transition"
                      >
                        Open Document
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* FLOATING AUDIO PLAYER */}
      {isSpeaking && (
        <div id="floating_audio_player" className="fixed bottom-6 right-6 z-50 bg-gray-900 border border-gray-700 text-white rounded-xl shadow-2xl p-4 w-72 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{isPaused ? "Paused" : "Playing"}</span>
            </div>
            <button onClick={handleCancelSpeech} className="text-gray-400 hover:text-white cursor-pointer" id="floating_close_btn"><X size={15} /></button>
          </div>
          <p className="text-xs text-gray-200 truncate font-medium">{currentResult?.title || "Document"}</p>
          <div className="flex items-center justify-between bg-gray-800 p-2 rounded-lg">
            <div className="flex gap-2">
              {isPaused ? (
                <button id="floating_resume_btn" onClick={handleResumeSpeech} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full cursor-pointer"><Play size={13} fill="currentColor" /></button>
              ) : (
                <button id="floating_pause_btn" onClick={handlePauseSpeech} className="p-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-full cursor-pointer"><Pause size={13} fill="currentColor" /></button>
              )}
              <button id="floating_stop_btn" onClick={handleCancelSpeech} className="p-1.5 bg-red-900/60 hover:bg-red-800 text-red-400 rounded-full cursor-pointer"><Square size={13} fill="currentColor" /></button>
            </div>
            <select id="floating_playback_speed" value={playbackSpeed} onChange={(e) => handleSpeedChange(parseFloat(e.target.value))} className="text-[10px] bg-gray-900 text-white font-bold border border-gray-700 rounded px-1 py-0.5 cursor-pointer outline-none">
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>
          <button onClick={() => setActiveTab("home")} className="w-full text-center py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-[10px] font-semibold uppercase rounded-lg cursor-pointer flex items-center justify-center gap-1" id="floating_go_home_btn">
            <BookOpen size={11} /> View document
          </button>
        </div>
      )}

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div id="portal_notification_toast" className="fixed top-4 right-6 z-50 bg-gray-900 text-white border border-gray-700 p-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm" role="status">
          <div className="p-1 bg-emerald-500 rounded-full text-gray-900 shrink-0"><Check size={13} strokeWidth={3} /></div>
          <p className="text-xs font-medium text-gray-100 flex-1">{notification.message}</p>
          <button id="dismiss_toast_btn" onClick={() => setNotification(null)} className="text-gray-400 hover:text-white cursor-pointer"><X size={13} /></button>
        </div>
      )}

      {/* PRINT OVERLAY */}
      {currentResult && (
        <div id="citizen-print-overlay-document" className="hidden print:block p-8 max-w-4xl mx-auto bg-white text-gray-900 font-sans">
          <div className="border-b border-gray-300 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Official Simplification Study</span>
                <h1 className="text-xl font-bold text-gray-900 mt-0.5">{currentResult.title || "Regulatory Circular"}</h1>
                <p className="text-xs text-gray-500 mt-1">Processed: {new Date(currentResult.timestamp).toLocaleDateString()} at {new Date(currentResult.timestamp).toLocaleTimeString()}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-1 rounded">
                  Language: {selectedLang === "te" ? "Telugu (తెలుగు)" : selectedLang === "hi" ? "Hindi (हिन्दी)" : "English (Simplified)"}
                </span>
              </div>
            </div>
          </div>
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Executive Summary</h3>
            <p className="text-xs text-gray-800 bg-gray-50 border border-gray-200 p-3 rounded leading-relaxed italic">{currentResult.summary}</p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 border-b border-gray-200 pb-1.5">Detailed Clause Comparison</h3>
            <div className="space-y-4">
              {(() => {
                const originalSentences = splitIntoSentences(currentResult.originalText);
                const activeSimplifiedText = selectedLang === "te" ? currentResult.teluguTranslation : selectedLang === "hi" ? currentResult.hindiTranslation : currentResult.simplifiedEnglish;
                const simplifiedSentences = splitIntoSentences(activeSimplifiedText);
                return originalSentences.map((orig, i) => {
                  const simpIdx = getMatchedSimplifiedIndex(i, originalSentences, simplifiedSentences);
                  const simp = simplifiedSentences[simpIdx] || "(No direct translation found)";
                  return (
                    <div key={i} className="grid grid-cols-2 gap-6 border-b border-gray-100 pb-4 last:border-0">
                      <div className="text-xs text-gray-800 leading-relaxed pr-2">
                        <div className="font-bold text-red-800 mb-1 font-mono">#{i + 1} ORIGINAL</div>
                        <p className="whitespace-pre-line leading-relaxed">{orig.trim()}</p>
                      </div>
                      <div className="text-xs text-gray-900 leading-relaxed pl-2 border-l border-gray-200">
                        <div className="font-bold text-green-800 mb-1 font-mono">#{i + 1} SIMPLIFIED</div>
                        <p className="whitespace-pre-line leading-relaxed">{simp.trim()}</p>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          {currentResult.glossary && currentResult.glossary.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Glossary</h3>
              <dl className="grid grid-cols-2 gap-4">
                {currentResult.glossary.map((item, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <dt className="font-bold text-gray-800 mb-0.5">{item.term}</dt>
                    <dd className="text-gray-600">{item.definition}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="mt-12 border-t border-gray-200 pt-3 text-center">
            <p className="text-[10px] text-gray-400">Digitally Simplified & Translated by DocuEase — Indian Citizen Legislation Portal.</p>
          </div>
        </div>
      )}

    </div>
  );
}
