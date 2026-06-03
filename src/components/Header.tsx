/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Building2, 
  Menu, 
  X, 
  Moon, 
  Sun, 
  Check, 
  ShieldAlert, 
  ChevronDown, 
  User, 
  UserCheck, 
  LogOut,
  Accessibility,
  Contrast
} from "lucide-react";
import { UserProfile } from "../types";

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedLang: "en" | "te" | "hi";
  setSelectedLang: (lang: "en" | "te" | "hi") => void;
  fontSizeAdjustment: number;
  setFontSizeAdjustment: (adj: number | ((prev: number) => number)) => void;
  highContrast: boolean;
  setHighContrast: (val: boolean | ((prev: boolean) => boolean)) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  user: UserProfile | null;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export default function Header({
  activeTab,
  setActiveTab,
  selectedLang,
  setSelectedLang,
  fontSizeAdjustment,
  setFontSizeAdjustment,
  highContrast,
  setHighContrast,
  darkMode,
  setDarkMode,
  user,
  onLogout,
  onOpenAuth
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const languages = {
    en: { name: "English", nativeName: "English" },
    te: { name: "Telugu", nativeName: "తెలుగు" },
    hi: { name: "Hindi", nativeName: "हिन्दी" }
  };

  const navLinks = [
    { id: "home", label: "Home" },
    { id: "dashboard", label: "Dashboard" },
    { id: "how-it-works", label: "How It Works" },
    { id: "about", label: "About Platform" },
    { id: "contact", label: "Contact Us" }
  ];

  const handleLangSelect = (code: "en" | "te" | "hi") => {
    setSelectedLang(code);
    setLangDropdownOpen(false);
  };

  const adjustFont = (type: "increase" | "decrease" | "reset") => {
    setSelectedLang(selectedLang); // dummy to trigger re-renders safely
    if (type === "increase") {
      setFontSizeAdjustment((prev) => Math.min(4, prev + 1));
    } else if (type === "decrease") {
      setFontSizeAdjustment((prev) => Math.max(-2, prev - 1));
    } else {
      setFontSizeAdjustment(0);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-700 text-white shadow-md select-none" id="main_header">
      {/* Prime Minister's Digital India Initiative bar */}
      <div className="bg-[#111822] hidden md:flex justify-between items-center px-6 py-1.5 text-xs text-slate-300 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          <span>Official Portal: Ministry of Electronics & IT (MeitY), Government of India</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#main-content" className="hover:underline hover:text-white transition">Skip to main content</a>
          <span>|</span>
          <div className="flex items-center gap-2">
            <Accessibility size={12} className="text-gov-accent" />
            <span>Accessible Platform</span>
          </div>
        </div>
      </div>

      {/* Main Header Row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
        {/* Left Side: National Emblem Outline & branding */}
        <div 
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setActiveTab("home")}
          id="logo_container"
        >
          {/* Emblem representation */}
          <div className="relative p-2 bg-gradient-to-br from-slate-800 to-slate-700 text-gov-accent rounded-lg shadow-inner border border-slate-700 shrink-0">
            <Building2 size={28} className="text-[#B7791F]" />
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-700 rounded-full border-2 border-slate-900 flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-sans font-extrabold text-xl sm:text-2xl tracking-tight text-white m-0">
                DocuEase
              </h1>
              <span className="bg-gov-accent/20 border border-gov-accent/30 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                NLP ENGINE
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-300 font-sans tracking-tight block">
              Official Document Simplification & Translation Platform
            </p>
          </div>
        </div>

        {/* Center: Navigation Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1.5" aria-label="Main Navigation">
          {navLinks.map((link) => (
            <button
              id={`nav_link_${link.id}`}
              key={link.id}
              onClick={() => {
                setActiveTab(link.id);
                setMobileMenuOpen(false);
              }}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-all duration-150 cursor-pointer ${
                activeTab === link.id
                  ? "bg-gov-accent text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right Side: Accessibility Controls, Language, Account */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Sizing (A-, A, A+) */}
          <div className="flex items-center border border-slate-700 rounded overflow-hidden">
            <button
              id="btn_font_decrease"
              onClick={() => adjustFont("decrease")}
              className="px-2 py-1 text-xs font-bold leading-none bg-slate-800 hover:bg-slate-700 border-r border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Decrease Text Size (A-)"
            >
              A-
            </button>
            <button
              id="btn_font_reset"
              onClick={() => adjustFont("reset")}
              className="px-2 py-1 text-xs font-bold leading-none bg-slate-800 hover:bg-slate-700 border-r border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Reset Font Size"
            >
              A
            </button>
            <button
              id="btn_font_increase"
              onClick={() => adjustFont("increase")}
              className="px-2 py-1 text-xs font-bold leading-none bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
              title="Increase Text Size (A+)"
            >
              A+
            </button>
          </div>

          {/* Dark Mode Toggle */}
          <button
            id="btn_dark_mode_toggle"
            onClick={() => setDarkMode(!darkMode)}
            className={`p-1.5 rounded border cursor-pointer transition ${
              darkMode 
                ? "bg-slate-700 text-yellow-400 border-yellow-400/50" 
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-755 hover:text-white"
            }`}
            title={darkMode ? "Disable Dark Mode" : "Enable Dark Mode (Reduce Eye Strain)"}
            aria-label="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* High Contrast Toggle */}
          <button
            id="btn_contrast_toggle"
            onClick={() => setHighContrast(!highContrast)}
            className={`p-1.5 rounded border cursor-pointer transition ${
              highContrast
                ? "bg-yellow-500 text-slate-900 border-yellow-400 font-bold"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-755 hover:text-white"
            }`}
            title={highContrast ? "Disable High Contrast" : "Enable High Contrast (Accessibility)"}
            aria-label="Toggle High Contrast Mode"
          >
            <Contrast size={15} />
          </button>

          {/* User Section */}
          {user ? (
            <div className="relative">
              <button
                id="btn_profile_menu"
                onClick={() => {
                  setProfileDropdownOpen(!profileDropdownOpen);
                  setLangDropdownOpen(false);
                }}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-[#1a2536] hover:bg-slate-800 rounded-full border border-gov-accent/40 cursor-pointer transition"
              >
                <div className="w-6 h-6 rounded-full bg-gov-accent text-white font-bold text-xs flex items-center justify-center">
                  {user.displayName.charAt(0)}
                </div>
                <span className="text-xs font-semibold tracking-tight">{user.displayName.split(' ')[0]}</span>
                <ChevronDown size={14} className="opacity-70" />
              </button>

              {profileDropdownOpen && (
                <div 
                  className="absolute right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 z-50 text-slate-200"
                  id="profile_dropdown_menu"
                >
                  <div className="px-3 py-2 border-b border-slate-700 text-xs">
                    <p className="font-semibold text-white">{user.displayName}</p>
                    <p className="text-slate-400 overflow-hidden text-ellipsis">{user.email}</p>
                    <div className="mt-1.5 flex items-center gap-1 p-1 bg-slate-900 rounded font-bold text-gov-accent text-[10px]">
                      <span>Trust Credibility:</span>
                      <span className="text-green-400">{user.trustScore}/100</span>
                    </div>
                  </div>
                  <button
                    id="profile_dashboard_tab_btn"
                    onClick={() => {
                      setActiveTab("dashboard");
                      setProfileDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-700 flex items-center gap-2 cursor-pointer font-semibold"
                  >
                    <UserCheck size={14} /> My Dashboard
                  </button>
                  <button
                    id="profile_logout_btn"
                    onClick={() => {
                      onLogout();
                      setProfileDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:text-white hover:bg-red-800/40 flex items-center gap-2 cursor-pointer font-semibold"
                  >
                    <LogOut size={14} /> Close Gateway Session
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              id="open_auth_btn_header"
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 text-xs font-bold leading-normal bg-gov-accent hover:bg-yellow-700 text-slate-900 font-sans hover:text-white rounded border border-gov-accent cursor-pointer transition duration-150"
            >
              Sign In (Secure)
            </button>
          )}
        </div>

        {/* Mobile controls (hamburger menu and quick buttons) */}
        <div className="flex lg:hidden items-center gap-1.5">
          {/* Quick Access lang toggle */}
          <button
            id="mobile_lang_quick_btn"
            onClick={() => setSelectedLang(selectedLang === "en" ? "hi" : selectedLang === "hi" ? "te" : "en")}
            className="px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 uppercase font-bold cursor-pointer font-sans"
            title="Fast Language Cycle"
          >
            {selectedLang}
          </button>

          {/* Quick dark mode accessibility button */}
          <button
            id="mobile_dark_mode_btn"
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 bg-slate-800 rounded border border-slate-700 cursor-pointer text-slate-300 hover:text-white"
            title="Toggle Dark Mode"
            aria-label="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Quick accessibility contrast button */}
          <button
            id="mobile_contrast_btn"
            onClick={() => setHighContrast(!highContrast)}
            className="p-1.5 bg-slate-800 rounded border border-slate-700 cursor-pointer text-slate-350 hover:text-white"
            title="Toggle High Contrast"
            aria-label="Toggle High Contrast"
          >
            <Contrast size={15} className={highContrast ? "text-yellow-400" : ""} />
          </button>

          {/* Hamburger trigger */}
          <button
            id="mobile_hamburger_btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 bg-slate-800 rounded border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle Mobile Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Out menu overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-800 text-white border-t border-slate-700 px-4 py-4 space-y-4 animate-slideDown" id="mobile_navbar">
          {/* Font Sizes Controls */}
          <div className="flex justify-between items-center p-2.5 bg-slate-900 rounded">
            <span className="text-xs text-slate-300 font-sans">Font Scale (Accessibility):</span>
            <div className="flex gap-2.5">
              <button
                id="mobile_font_dec"
                onClick={() => adjustFont("decrease")}
                className="w-7 h-7 bg-slate-800 flex items-center justify-center font-bold text-sm border border-slate-700 rounded cursor-pointer"
              >
                A-
              </button>
              <button
                id="mobile_font_reset"
                onClick={() => adjustFont("reset")}
                className="w-7 h-7 bg-slate-800 flex items-center justify-center font-bold text-sm border border-slate-700 rounded cursor-pointer"
              >
                A
              </button>
              <button
                id="mobile_font_inc"
                onClick={() => adjustFont("increase")}
                className="w-7 h-7 bg-slate-800 flex items-center justify-center font-bold text-sm border border-slate-700 rounded cursor-pointer"
              >
                A+
              </button>
            </div>
          </div>

          {/* Dark Mode & Contrast row */}
          <div className="flex justify-between items-center p-2.5 bg-slate-900 rounded">
            <span className="text-xs text-slate-300 font-sans">Screen Theme:</span>
            <div className="flex gap-2">
              <button
                id="mobile_action_dark"
                onClick={() => setDarkMode(!darkMode)}
                className={`px-3 py-1 text-xs border rounded cursor-pointer font-semibold ${
                  darkMode ? "bg-slate-700 text-yellow-500 border-yellow-500" : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {darkMode ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                id="mobile_action_contrast"
                onClick={() => setHighContrast(!highContrast)}
                className={`px-3 py-1 text-xs border rounded cursor-pointer font-semibold ${
                  highContrast ? "bg-slate-700 text-yellow-500 border-yellow-500" : "bg-slate-800 text-slate-300 border-slate-700"
                }`}
              >
                {highContrast ? "Normal Contrast" : "High Contrast"}
              </button>
            </div>
          </div>

          {/* Links stack */}
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                id={`mobile_nav_link_${link.id}`}
                key={link.id}
                onClick={() => {
                  setActiveTab(link.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 rounded font-sans font-semibold text-sm transition ${
                  activeTab === link.id
                    ? "bg-gov-accent text-slate-900"
                    : "text-slate-100 hover:bg-slate-700"
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Profile controls for mobile */}
          <div className="pt-3 border-t border-slate-700">
            {user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 p-2 bg-slate-900 rounded">
                  <div className="w-8 h-8 rounded-full bg-gov-accent text-slate-900 font-bold flex items-center justify-center shadow-md">
                    {user.displayName.charAt(0)}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-100">{user.displayName}</p>
                    <p className="text-[10px] text-green-400 font-semibold leading-none mt-1">Trust Credibility: {user.trustScore}/100</p>
                  </div>
                </div>
                <button
                  id="mobile_logout_btn"
                  onClick={() => {
                    onLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-center py-2 text-xs border border-red-500 hover:bg-red-800 text-red-300 hover:text-white rounded font-sans font-bold cursor-pointer"
                >
                  Logout Session
                </button>
              </div>
            ) : (
              <button
                id="mobile_auth_btn"
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2.5 text-center text-sm font-bold bg-gov-accent text-slate-900 rounded hover:bg-yellow-600 transition tracking-wide cursor-pointer font-sans"
              >
                Authenticate Secure Account
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
