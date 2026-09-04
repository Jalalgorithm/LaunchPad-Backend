/** Where the person needs to ask for support. */
export type EasyAskContext = "work" | "doctor" | "school" | "transport";

/** Only meaningful when the context is `transport`. */
export type TransportMode = "land" | "sea" | "air";

export interface ShortNoteResult {
  /** e.g. "Your Short Note — for Work". */
  title: string;
  /** Three short first-person sentences, ready to hand over. */
  lines: string[];
  /**
   * Set when the answers describe risk of harm rather than an access need.
   * The note is still returned — this only tells the client to show support
   * signposting alongside it.
   */
  concern: boolean;
}
