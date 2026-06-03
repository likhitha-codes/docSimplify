/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Shield, KeyRound, Mail, UserPlus, FileCheck, ArrowRight, X, Phone, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { UserProfile } from "../types";
import { auth, db } from "../lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

interface AuthPortalProps {
  onLoginSuccess: (profile: UserProfile) => void;
  onClose?: () => void;
}

function formatFirebaseError(err: any): string {
  const code = err?.code || "";
  const msg = err?.message || "";
  
  if (code === "auth/unauthorized-domain" || msg.includes("auth/unauthorized-domain") || msg.includes("unauthorized-domain")) {
    const currentDomain = window.location.hostname;
    return `Authorized Domain Error:\nThe current app domain "${currentDomain}" is not permitted to authenticate with this Firebase project.\n\nTo fix this:\n1. Open your Firebase Console (for project "docsimplify-6d429").\n2. Go to Authentication > Settings > Authorized domains.\n3. Add "${currentDomain}" to the list.\n4. Refresh the page and try again!`;
  }
  
  if (code === "permission-denied" || msg.includes("insufficient permissions") || msg.includes("permission-denied")) {
    return `Database Permission Denied:\nYour Firestore security rules do not permit reading or writing the "users" collection.\n\nTo fix this:\n1. Open your Firebase Console.\n2. Go to Firestore Database > Rules.\n3. Make sure you allow reading & writing user documents. For example, add:\n   match /users/{email} {\n     allow read, write: if true;\n   }\n4. Click Publish, then refresh the page and try again!`;
  }
  
  if (msg.includes("auth/email-already-in-use")) {
    return "This email address is already registered. Please try logging in instead.";
  }
  
  if (msg.includes("auth/weak-password")) {
    return "Password is too weak. Please choose at least 6 characters.";
  }
  
  if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found")) {
    return "Incorrect password or credentials. Please check your password spelling. If you registered through phone number, ensure you are using the password/PIN you set during registration.";
  }

  return err.message || "Failed to connect to Indian Government Secure Portal Gateway.";
}

function standardizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export default function AuthPortal({ onLoginSuccess, onClose }: AuthPortalProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Login flow states (selection, email, phone, google)
  const [selectedLoginMethod, setSelectedLoginMethod] = useState<"email" | "phone" | null>(null);
  
  // Registration and account states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // UI states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    let computedName = "";
    let finalEmail = email.trim();
    let finalPhone = phoneNumber.trim();

    if (isRegistering) {
      if (!firstName.trim()) {
        setErrorMsg("Please enter your First Name.");
        setIsSubmitting(false);
        return;
      }
      if (!finalEmail) {
        setErrorMsg("Please enter an Official Email Address.");
        setIsSubmitting(false);
        return;
      }
      if (!password) {
        setErrorMsg("Please enter a secure password.");
        setIsSubmitting(false);
        return;
      }
      if (!finalPhone) {
        setErrorMsg("Please enter a valid Phone Number.");
        setIsSubmitting(false);
        return;
      }
      computedName = lastName.trim() ? `${firstName.trim()} ${lastName.trim()}` : firstName.trim();
    } else {
      // In Login Mode
      if (selectedLoginMethod === "phone") {
        if (!finalPhone) {
          setErrorMsg("Please enter your Phone Number.");
          setIsSubmitting(false);
          return;
        }
        if (!password) {
          setErrorMsg("Please enter your password.");
          setIsSubmitting(false);
          return;
        }
        
        setSubmittingStatus("Securing connection and querying phone registry...");
        let lookupEmail = "";
        try {
          // Lookup on Express backend first
          const lookupRes = await fetch("/api/lookup-phone", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber: finalPhone })
          });
          if (lookupRes.ok) {
            const lookupData = await lookupRes.json();
            lookupEmail = lookupData.email;
          } else {
            // Try Firestore
            try {
              const { collection, query, where, getDocs } = await import("firebase/firestore");
              // Try exact match first
              let q = query(collection(db, "users"), where("phoneNumber", "==", finalPhone));
              let snapshot = await getDocs(q);
              if (!snapshot.empty) {
                const docData = snapshot.docs[0].data();
                lookupEmail = docData.email;
              } else {
                // Try standardized 10-digit match
                const cleanPhoneForSearch = standardizePhoneNumber(finalPhone);
                if (cleanPhoneForSearch) {
                  q = query(collection(db, "users"), where("phoneNumber", "==", cleanPhoneForSearch));
                  snapshot = await getDocs(q);
                  if (!snapshot.empty) {
                    const docData = snapshot.docs[0].data();
                    lookupEmail = docData.email;
                  }
                }
              }

              // Ultra-robust fallback scanner (scans and cleans values dynamically in case formatting is mixed)
              if (!lookupEmail) {
                const allSnapshot = await getDocs(collection(db, "users"));
                const cleanToMatch = standardizePhoneNumber(finalPhone);
                if (cleanToMatch) {
                  for (const userDoc of allSnapshot.docs) {
                    const data = userDoc.data();
                    const userPhone = data.phoneNumber || "";
                    if (standardizePhoneNumber(userPhone) === cleanToMatch) {
                      lookupEmail = data.email;
                      break;
                    }
                  }
                }
              }
            } catch (fsErr) {
              console.error("Firestore lookup failed:", fsErr);
            }
          }
        } catch (apiErr) {
          console.error("Backend lookup failed:", apiErr);
        }

        if (!lookupEmail) {
          setErrorMsg("This phone number is not registered. Please select the 'New Citizen? Register' link below first.");
          setIsSubmitting(false);
          return;
        }

        finalEmail = lookupEmail;
        computedName = "Citizen User";
      } else {
        // Email login
        if (!finalEmail) {
          setErrorMsg("Please enter your Email Address.");
          setIsSubmitting(false);
          return;
        }
        if (!password) {
          setErrorMsg("Please enter your password.");
          setIsSubmitting(false);
          return;
        }
        const emailLower = finalEmail.toLowerCase();
        const prefix = emailLower.split("@")[0].split(/[._+-]/);
        computedName = prefix
          .map(p => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ") || "Citizen User";
      }
    }

    setSubmittingStatus(isRegistering ? "Processing secured government registration..." : "Verifying national portal credentials...");

    try {
      let backendTrustScore = 85;
      
      if (isRegistering) {
        // 1. Create Firebase Auth user
        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: computedName
          });
        }

        // 2. Save user status in Firestore to register them
        const cleanPhoneForDb = standardizePhoneNumber(finalPhone);
        await setDoc(doc(db, "users", finalEmail.toLowerCase()), {
          displayName: computedName,
          email: finalEmail.toLowerCase(),
          phoneNumber: cleanPhoneForDb || finalPhone,
          registered: true,
          createdAt: new Date().toISOString()
        });

        // 3. Sync profile with the backend
        const regRes = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            displayName: computedName, 
            email: finalEmail,
            phoneNumber: cleanPhoneForDb || finalPhone
          })
        });
        
        if (regRes.ok) {
          const regData = await regRes.json();
          if (regData.profile?.trustScore) {
            backendTrustScore = regData.profile.trustScore;
          }
        }
      } else {
        // 1. Authenticate with Firebase Auth first
        const userCredential = await signInWithEmailAndPassword(auth, finalEmail, password);
        
        // Use the auth display name or compute one
        const userDisplayName = userCredential.user?.displayName || computedName;

        // 2. Perform background checks and sync with Firestore dynamically
        let firestoreDisplayName = "";
        try {
          const docRef = doc(db, "users", finalEmail.toLowerCase());
          const docSnap = await getDoc(docRef);
          
          if (!docSnap.exists() || !docSnap.data()?.registered) {
            // Self-healing: If user exists in Auth but not in Firestore, register them!
            await setDoc(docRef, {
              displayName: userDisplayName,
              email: finalEmail.toLowerCase(),
              phoneNumber: finalPhone || "",
              registered: true,
              createdAt: new Date().toISOString()
            }, { merge: true });
            firestoreDisplayName = userDisplayName;
          } else {
            firestoreDisplayName = docSnap.data()?.displayName || "";
          }
        } catch (fsErr) {
          console.warn("Dynamic Firestore sync checked skipped or failed", fsErr);
        }

        // 3. Verify or auto-register on the Node backend
        const loginRes = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: finalEmail })
        });

        if (loginRes.ok) {
          const loginData = await loginRes.json();
          backendTrustScore = loginData.profile.trustScore || 85;
          computedName = loginData.profile.displayName || firestoreDisplayName || userDisplayName || computedName;
        } else {
          let errorText = "Login check failed on custom server database.";
          try {
            const errData = await loginRes.json();
            errorText = errData.error || errorText;
          } catch (jsonErr) {
            try {
              const rawText = await loginRes.text();
              const cleanText = rawText ? rawText.trim() : "";
              if (cleanText && cleanText.length < 300) {
                errorText = cleanText;
              } else {
                errorText = `Secondary server validation failed with status ${loginRes.status}`;
              }
            } catch (textErr) {
              errorText = `Secondary server validation failed: status ${loginRes.status}`;
            }
          }
          throw new Error(errorText);
        }
      }

      const authenticatedUser: UserProfile = {
        email: finalEmail.toLowerCase(),
        displayName: computedName,
        trustScore: backendTrustScore,
        isLoggedIn: true
      };

      // Cache session
      localStorage.setItem("docuease_user", JSON.stringify(authenticatedUser));
      onLoginSuccess(authenticatedUser);
      setIsSubmitting(false);
      setSubmittingStatus("");
      if (onClose) onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(formatFirebaseError(err));
      setIsSubmitting(false);
      setSubmittingStatus("");
    }
  };



  return (
    <div className="clay-card rounded-lg border-t-4 border-t-gov-accent overflow-hidden max-w-md w-full mx-auto bg-white shadow-xl" id="auth_portal_card">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 text-white relative">
        {onClose && (
          <button 
            type="button" 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            aria-label="Close authentication gateway"
            id="close_auth_btn"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-full" style={{ color: "#B7791F" }}>
            <Shield size={24} />
          </div>
          <div className="flex-1">
            <h2 className="font-sans font-bold text-lg tracking-tight">GovSecure Gateway</h2>
            <p className="text-xs text-slate-300">National Single Sign-On Portal</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Secure Note */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded text-xs text-slate-600 flex items-start gap-2">
          <FileCheck className="text-gov-accent shrink-0 mt-0.5" size={16} />
          <span>
            This is a secure institutional access gateway. Authenticate to track digital audit history, pin simplified welfare laws, and secure your <b>Trust Score</b>.
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200 whitespace-pre-line" role="alert">
            {errorMsg}
          </div>
        )}

        {/* LOADING STATE DISPLAY */}
        {isSubmitting ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
            <span className="inline-block w-8 h-8 border-4 border-gov-accent border-t-transparent rounded-full animate-spin"></span>
            <p className="text-xs font-semibold text-slate-800 animate-pulse">{submittingStatus}</p>
            <p className="text-[10px] text-slate-400">Verifying biometric databases & credentials...</p>
          </div>
        ) : (
          <>
            {/* REGISTERING VIEW FOR THE FIRST TIME */}
            {isRegistering ? (
              <form onSubmit={handleSubmit} className="space-y-3" id="register_form">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_firstname">
                      First Name
                    </label>
                    <input
                      id="reg_firstname"
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g., John"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_lastname">
                      Last Name (Optional)
                    </label>
                    <input
                      id="reg_lastname"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g., Doe"
                      className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_phone">
                    Phone Number
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Phone size={14} />
                    </span>
                    <input
                      id="reg_phone"
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="e.g., +91 9876543210"
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_email">
                    Official Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Mail size={14} />
                    </span>
                    <input
                      id="reg_email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="resident@nic.in"
                      className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="reg_password">
                    Secure Digital Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <KeyRound size={14} />
                    </span>
                    <input
                      id="reg_password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter a password"
                      className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <button
                  id="auth_submit_btn"
                  type="submit"
                  className="w-full mt-2 py-2 bg-gov-primary hover:bg-slate-800 text-white font-medium text-sm rounded flex items-center justify-center gap-2 transition-colors duration-150 shadow-sm cursor-pointer"
                >
                  <span>Confirm Registration</span>
                  <ArrowRight size={16} />
                </button>

                <div className="text-center pt-2 border-t border-slate-100">
                  <button
                    id="toggle_register_btn"
                    type="button"
                    className="text-xs text-gov-accent font-medium hover:underline focus:outline-none"
                    onClick={() => {
                      setIsRegistering(false);
                      setSelectedLoginMethod(null);
                    }}
                  >
                    Already integrated? Access Login Options
                  </button>
                </div>
              </form>
            ) : (
              /* LOGIN SELECTION FLOW OR TRIGGER SUITE */
              <div className="space-y-4">
                {selectedLoginMethod === null ? (
                  /* THREE OPTION SELECTION FOR LOGIN */
                  <div className="space-y-2.5">
                    <p className="text-xs text-slate-500 font-bold mb-1 block uppercase tracking-wider text-center">Choose Identity Verification Preference</p>
                    
                    {/* Method 1: Email */}
                    <button
                      type="button"
                      onClick={() => setSelectedLoginMethod("email")}
                      className="w-full p-3.5 bg-white border border-slate-200 hover:border-gov-accent hover:bg-amber-50/10 rounded-lg text-left flex items-center gap-3.5 transition-all shadow-sm group cursor-pointer"
                      id="login_opt_email"
                    >
                      <div className="p-2.5 bg-slate-100 text-slate-700 group-hover:bg-amber-50 group-hover:text-gov-accent rounded-full transition-colors">
                        <Mail size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">Login through Email</div>
                        <div className="text-[10px] text-slate-400">Secure entry via official mailbox coordinates</div>
                      </div>
                      <ChevronRightArrow />
                    </button>

                    {/* Method 2: Phone */}
                    <button
                      type="button"
                      onClick={() => setSelectedLoginMethod("phone")}
                      className="w-full p-3.5 bg-white border border-slate-200 hover:border-gov-accent hover:bg-amber-50/10 rounded-lg text-left flex items-center gap-3.5 transition-all shadow-sm group cursor-pointer"
                      id="login_opt_phone"
                    >
                      <div className="p-2.5 bg-slate-100 text-slate-700 group-hover:bg-amber-50 group-hover:text-gov-accent rounded-full transition-colors">
                        <Phone size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">Login through Phone</div>
                        <div className="text-[10px] text-slate-400">Multi-point identity verification using cellular lines</div>
                      </div>
                      <ChevronRightArrow />
                    </button>
                  </div>
                ) : (
                  /* SUBFORMS (EMAIL / PHONE SPECIFIC INTERFACES) */
                  <form onSubmit={handleSubmit} className="space-y-3" id="sub_login_form">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoginMethod(null);
                        setErrorMsg("");
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold mb-2"
                    >
                      <ArrowLeft size={13} /> Back to Sign-In selection
                    </button>

                    {selectedLoginMethod === "email" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_email">
                            Official Email Address
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <Mail size={14} />
                            </span>
                            <input
                              id="login_email"
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="e.g., john.doe@gov.in"
                              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_password_email">
                            Secure Signature Password
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <KeyRound size={14} />
                            </span>
                            <input
                              id="login_password_email"
                              type={showPassword ? "text" : "password"}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter your password"
                              className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {selectedLoginMethod === "phone" && (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_phone">
                            Registered Phone Number
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <Phone size={14} />
                            </span>
                            <input
                              id="login_phone"
                              type="tel"
                              required
                              value={phoneNumber}
                              onChange={(e) => setPhoneNumber(e.target.value)}
                              placeholder="e.g., 9876543210"
                              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5" htmlFor="login_pin_phone">
                            Secure Access Password / PIN
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                              <KeyRound size={14} />
                            </span>
                            <input
                              id="login_pin_phone"
                              type={showPassword ? "text" : "password"}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter your password or PIN"
                              className="w-full pl-9 pr-9 py-1.5 text-sm bg-white border border-slate-300 rounded focus:ring-1 focus:ring-gov-accent focus:border-gov-accent outline-none font-normal text-slate-800 placeholder:text-slate-400 placeholder:font-light placeholder:opacity-50"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 outline-none"
                            >
                              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    <button
                      id="auth_submit_btn"
                      type="submit"
                      className="w-full mt-2 py-2 bg-gov-primary hover:bg-slate-800 text-white font-medium text-sm rounded flex items-center justify-center gap-2 transition-colors duration-150 shadow-sm cursor-pointer"
                    >
                      <span>Authenticate Account</span>
                      <ArrowRight size={16} />
                    </button>
                  </form>
                )}

                <div className="text-center pt-2.5 border-t border-slate-100">
                  <button
                    id="toggle_register_btn"
                    type="button"
                    className="text-xs text-gov-accent font-medium hover:underline focus:outline-none flex items-center justify-center gap-1 mx-auto"
                    onClick={() => {
                      setIsRegistering(true);
                      setFirstName("");
                      setLastName("");
                      setPhoneNumber("");
                    }}
                  >
                    <UserPlus size={14} /> New Citizen? Register credentials for the first time
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Chevron helper
function ChevronRightArrow() {
  return (
    <div className="text-slate-300 group-hover:text-gov-accent group-hover:translate-x-0.5 transition-transform">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
