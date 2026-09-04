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
