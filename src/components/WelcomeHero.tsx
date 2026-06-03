/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Sparkles, Landmark, BadgeAlert, Scale, Globe, ArrowDownWideNarrow } from "lucide-react";

interface WelcomeHeroProps {
  onPasteShortcut: () => void;
  trustScore: number;
}

export default function WelcomeHero({ onPasteShortcut, trustScore }: WelcomeHeroProps) {
  return (
    <div className="bg-slate-900 border-b border-slate-800 text-white py-12 px-6 relative overflow-hidden" id="welcome_hero_panel">
      {/* Structural subtle institutional pattern overlay representing national service */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(183,121,31,0.08),transparent_50%)]"></div>
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
        <div className="lg:col-span-7 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gov-accent/20 border border-gov-accent/30 text-white text-xs font-semibold rounded-full uppercase tracking-wider font-sans shadow-sm">
            <Landmark size={14} className="text-gov-accent" />
            <span>Digital India Transparency Action</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-sans tracking-tight leading-tight m-0">
            Simplifying Official Jargon <br className="hidden sm:inline" />
            <span className="text-gov-accent" style={{ color: "#B7791F" }}>For Every Indian Citizen</span>
          </h2>
          
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-sans m-0">
            Translate complicated Legal Orders, Welfare Charters, Public Gazettes, and Court Notifications into straightforward, plain-language text. Supported in complete English, high-precision Telugu (తెలుగు), and official Hindi (हिन्दी) transcripts.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              id="hero_get_started_btn"
              onClick={() => {
                const workspace = document.getElementById("main-workspace-container");
                if (workspace) workspace.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-5 py-2.5 bg-gov-accent hover:bg-yellow-600 text-slate-900 hover:text-white font-bold text-sm tracking-wide rounded shadow-md transition duration-150 cursor-pointer flex items-center gap-2"
            >
              <ArrowDownWideNarrow size={16} /> Simplify a Document Now
            </button>
            <button
              id="hero_sample_btn"
              onClick={onPasteShortcut}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-sm rounded border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles size={14} className="text-gov-accent animate-pulse" /> Try Government Advisory Sample
            </button>
          </div>
        </div>

        {/* Institutional Bento Block Stats Panel */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-4" id="stats_bento_grid">
          {/* Box 1: Trust Score Gauge */}
          <div className="clay-card rounded-lg bg-slate-800/80 p-4 border border-slate-700/60 shadow-xl flex flex-col justify-between hover:border-slate-600 transition">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Citizen Trust Weight</span>
              <Scale size={18} className="text-gov-accent" />
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-extrabold text-white tracking-tight leading-none m-0">
                {trustScore}%
              </h3>
              <p className="text-[10px] text-green-400 font-semibold mt-1">✓ Credibility Level</p>
            </div>
          </div>

          {/* Box 2: Total Documents Simplified */}
          <div className="clay-card rounded-lg bg-slate-800/80 p-4 border border-slate-700/60 shadow-xl flex flex-col justify-between hover:border-slate-600 transition">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Simplified Index</span>
              <Globe size={18} className="text-teal-400" />
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-extrabold text-white tracking-tight leading-none m-0">
                1.48L+
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Notifications simplified successfully</p>
            </div>
          </div>

          {/* Box 3: Verification SLA */}
          <div className="clay-card rounded-lg bg-slate-800/80 p-4 border border-slate-700/60 shadow-xl flex flex-col justify-between hover:border-slate-600 transition col-span-2">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-gov-accent/15 rounded text-gov-accent shrink-0">
                <BadgeAlert size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase text-slate-400 font-bold tracking-wider leading-none m-0">Institutional Policy Notice</p>
                <p className="text-xs text-slate-300 mt-1 mb-0 leading-tight">
                  Uploading actual verified public advisories ensures accurate trust scoring. Spammed or unrelated logs will trigger score penalties of up to 10 points.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
