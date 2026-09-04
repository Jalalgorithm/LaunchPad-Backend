import type { AiProvider } from "../ai/ai.types";

export type TranslateKind = "general" | "school" | "veteran";
export type VeteranTrack = "veteran" | "spouseEmployed" | "spouseHousehold";

export interface SkillItem {
  skill: string;
  evidence: string;
}

export interface TranslateProfile {
  kind: TranslateKind;
  provider: AiProvider;
  summary: string;
  skills: SkillItem[];
  stemSparks: string[] | null;
  reveal: string | null;
  roleMatches: string[] | null;
  concern: boolean;
  updatedAt: string;
}

export type MyTranslateProfiles = Record<TranslateKind, TranslateProfile | null>;

export interface GeneralInput {
  kind: "general";
  provider: AiProvider;
  gapStatement: string;
  qualificationText: string;
}

export interface SchoolInput {
  kind: "school";
  provider: AiProvider;
  interests: string;
  subjects: string;
}

export interface VeteranInput {
  kind: "veteran";
  provider: AiProvider;
  track: VeteranTrack;
  in1: string;
  in2: string;
}

export type TranslateInput = GeneralInput | SchoolInput | VeteranInput;
