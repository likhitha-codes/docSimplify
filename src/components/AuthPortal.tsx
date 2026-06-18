/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
// Provide minimal JSX/runtime declarations to satisfy TypeScript in environments
// where @types/react or the automatic jsx runtime types are not available.
// This avoids numerous `JSX.IntrinsicElements` and `react/jsx-runtime` errors
// without changing project-wide tsconfig settings.
declare module 'react/jsx-runtime';
declare global {
  namespace JSX {
    // allow any intrinsic element to avoid implicit 'any' JSX errors in this file
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
import { Shield, KeyRound, Mail, UserPlus, FileCheck, ArrowRight, Phone, ArrowLeft, Eye, EyeOff } from "lucide-react";
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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
          let errMsg = "Login check failed on custom server database.";
          try { const e = await loginRes.json(); errMsg = e.error || errMsg;
          } catch {}
          throw new Error(errMsg);
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
    <div className="w-full h-full bg-white overflow-hidden flex min-h-screen" id="auth_portal_card">

      {/* LEFT: Form Panel */}
      <div className="w-full md:w-1/2 p-8 flex flex-col justify-center relative">
        {/* Back button */}
        {onClose && (
          <button type="button" onClick={onClose} className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition cursor-pointer" id="close_auth_btn">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        )}

        <h2 className="text-2xl font-bold text-gray-900 mb-1">{isRegistering ? "Create account" : "Login"}</h2>
        <p className="text-sm text-gray-400 mb-6">{isRegistering ? "Register to access DocuEase" : "Welcome back to DocuEase"}</p>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 whitespace-pre-line" role="alert">{errorMsg}</div>
        )}

        {isSubmitting ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <span className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
            <p className="text-sm font-semibold text-gray-700 animate-pulse">{submittingStatus}</p>
          </div>
        ) : isRegistering ? (
          /* REGISTER FORM */
          <form onSubmit={handleSubmit} className="space-y-3" id="register_form">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reg_firstname">First Name</label>
                <input id="reg_firstname" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reg_lastname">Last Name</label>
                <input id="reg_lastname" type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe (optional)"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reg_phone">Phone Number</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="reg_phone" type="tel" required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+91 9876543210"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reg_email">Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="reg_email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="reg_password">Password</label>
              <div className="relative">
                <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input id="reg_password" type={showPassword ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password"
                  className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer outline-none">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button id="auth_submit_btn" type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-sm mt-1">
              Create Account <ArrowRight size={15} />
            </button>
            <p className="text-center text-xs text-gray-400 pt-1">
              Already have an account?{" "}
              <button type="button" onClick={() => { setIsRegistering(false); setSelectedLoginMethod(null); }} className="text-blue-600 font-semibold hover:underline cursor-pointer" id="toggle_register_btn">
                Sign in
              </button>
            </p>
          </form>
        ) : selectedLoginMethod === null ? (
          /* LOGIN METHOD SELECTION */
          <div className="space-y-3">
            <button type="button" onClick={() => setSelectedLoginMethod("email")} id="login_opt_email"
              className="w-full p-3.5 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left flex items-center gap-3 transition group cursor-pointer">
              <div className="p-2 bg-gray-100 group-hover:bg-blue-100 rounded-lg transition">
                <Mail size={17} className="text-gray-500 group-hover:text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">Continue with Email</p>
                <p className="text-[11px] text-gray-400">Sign in using your email address</p>
              </div>
              <ChevronRightArrow />
            </button>
            <button type="button" onClick={() => setSelectedLoginMethod("phone")} id="login_opt_phone"
              className="w-full p-3.5 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left flex items-center gap-3 transition group cursor-pointer">
              <div className="p-2 bg-gray-100 group-hover:bg-blue-100 rounded-lg transition">
                <Phone size={17} className="text-gray-500 group-hover:text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">Continue with Phone</p>
                <p className="text-[11px] text-gray-400">Sign in using your phone number</p>
              </div>
              <ChevronRightArrow />
            </button>
            <p className="text-center text-xs text-gray-400 pt-2">
              No account yet?{" "}
              <button type="button" id="toggle_register_btn" onClick={() => { setIsRegistering(true); setFirstName(""); setLastName(""); setPhoneNumber(""); }} className="text-blue-600 font-semibold hover:underline cursor-pointer">
                Register
              </button>
            </p>
          </div>
        ) : (
          /* EMAIL / PHONE LOGIN FORM */
          <form onSubmit={handleSubmit} className="space-y-3" id="sub_login_form">
            <button type="button" onClick={() => { setSelectedLoginMethod(null); setErrorMsg(""); }} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 font-medium mb-1 cursor-pointer">
              <ArrowLeft size={13} /> Back
            </button>

            {selectedLoginMethod === "email" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="login_email">Email Address</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input id="login_email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="login_password_email">Password</label>
                  <div className="relative">
                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input id="login_password_email" type={showPassword ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password"
                      className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer outline-none">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="login_phone">Phone Number</label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input id="login_phone" type="tel" required value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="9876543210"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1" htmlFor="login_pin_phone">Password / PIN</label>
                  <div className="relative">
                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input id="login_pin_phone" type={showPassword ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password or PIN"
                      className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer outline-none">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button id="auth_submit_btn" type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-sm">
              Login <ArrowRight size={15} />
            </button>
            <p className="text-center text-xs text-gray-400">
              No account?{" "}
              <button type="button" id="toggle_register_btn" onClick={() => { setIsRegistering(true); setFirstName(""); setLastName(""); setPhoneNumber(""); }} className="text-blue-600 font-semibold hover:underline cursor-pointer">
                Register
              </button>
            </p>
          </form>
        )}
      </div>

      {/* RIGHT: Branding Panel */}
      <div className="hidden md:flex w-1/2 bg-gradient-to-br from-blue-600 to-blue-500 p-10 flex-col justify-center relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -left-8 w-56 h-56 bg-white/5 rounded-full" />

        <div className="relative z-10 space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Shield size={22} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">DocuEase</span>
          </div>

          <div>
            <h3 className="text-xl font-bold text-white leading-snug">Understand any government document instantly</h3>
            <p className="text-blue-100 text-sm mt-2 leading-relaxed">Simplify complex legal language into plain English, Telugu, or Hindi — with one click.</p>
          </div>

          {/* Features */}
          <div className="space-y-3">
            {[
              { icon: <FileCheck size={15} />, text: "Validates government documents automatically" },
              { icon: <Shield size={15} />, text: "Trust score system keeps portal integrity high" },
              { icon: <Mail size={15} />, text: "Supports PDF, images, and pasted text" },
              { icon: <KeyRound size={15} />, text: "Telugu & Hindi translation with audio narration" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center shrink-0 text-white">
                  {item.icon}
                </div>
                <span className="text-sm text-blue-100">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

function ChevronRightArrow() {
  return (
    <div className="text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-transform">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
