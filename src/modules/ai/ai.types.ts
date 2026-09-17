import type { VeteranTrack } from "../translate/translate.types";

export type AiProvider = "openai" | "gemini";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  system: string;
  messages: ChatTurn[];
  /** Ask the provider to return strict JSON (still parsed/validated by the caller). */
  json?: boolean;
}

export type ChatPersona = "thrive" | "adult" | "school" | "veteran";

interface ChatInputBase {
  provider: AiProvider;
  messages: ChatTurn[];
}

export interface ThriveChatInput extends ChatInputBase {
  persona: "thrive";
}
export interface AdultChatInput extends ChatInputBase {
  persona: "adult";
}
export interface SchoolChatInput extends ChatInputBase {
  persona: "school";
}
export interface VeteranChatInput extends ChatInputBase {
  persona: "veteran";
  track: VeteranTrack;
}

export type ChatInput = ThriveChatInput | AdultChatInput | SchoolChatInput | VeteranChatInput;
