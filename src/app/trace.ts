/** One line of the agent trace drawer. */
export interface TraceStep {
  /** ISO time the step ran. */
  at: string;
  kind: "resolve" | "qloo" | "score" | "constraint" | "propose" | "model" | "note";
  text: string;
  /** Extra facts for the drawer, e.g. cached or live. */
  detail?: string;
}

export const step = (at: string, kind: TraceStep["kind"], text: string, detail?: string): TraceStep => ({ at, kind, text, ...(detail ? { detail } : {}) });
