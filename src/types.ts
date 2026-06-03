/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface SimplifiedResult {
  id: string;
  title: string;
  originalText: string;
  documentType: string; // Welfare Scheme, Circular, Public Notice, etc.
  isGovernmentRelated: boolean;
  trustScoreImpact: number;
  timestamp: string;
  summary: string;
  simplifiedEnglish: string;
  teluguTranslation: string;
  hindiTranslation: string;
  glossary: GlossaryItem[];
}

export interface UserProfile {
  email: string;
  displayName: string;
  trustScore: number;
  isLoggedIn: boolean;
}

export interface AccessibilitySettings {
  fontSizeAdjustment: number; // -2 to +4 range
  highContrast: boolean;
}
