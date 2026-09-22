// RFC 0015 (D5/D7) — the duck-typed Theme surface the run card reads. The
// renderer's `theme` parameter is `unknown` on the D3 entry-channel seam type;
// the real interactive host hands its `Theme` instance, which exposes no raw
// hex (spike Q1) — the card parses the SGRs `getFgAnsi` returns instead.
// Extracted from `run-card-renderer.ts` in D7's PTQ-1260 decomposition: both
// the live component (syntax/accent/muted styling) and the heat-LUT cache
// (endpoint derivation) consume this one probe.

import type { SyntaxRole } from "./styled-lines";

export interface CardThemeSurface {
  getFgAnsi(color: string): string;
  getColorMode(): string;
}

/** Probe an unknown theme for the two members the card needs (PIC-73 posture). */
export function probeCardTheme(theme: unknown): CardThemeSurface | undefined {
  const candidate = theme as Partial<CardThemeSurface> | undefined;
  if (
    typeof candidate?.getFgAnsi !== "function" ||
    typeof candidate.getColorMode !== "function"
  ) {
    return undefined;
  }
  return candidate as CardThemeSurface;
}

/** Guarded theme fg read: a throwing/absent role yields "" (unstyled). */
export function themeFg(theme: CardThemeSurface, role: string): string {
  try {
    const sgr = theme.getFgAnsi(role);
    return typeof sgr === "string" ? sgr : "";
  } catch { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
    return "";
  }
}

/**
 * SyntaxRole → theme fg role. Code roles map onto the host's `syntax*`
 * family 1:1 where one exists (`ident` → `syntaxVariable` — the lexer does
 * not distinguish function idents, and variable is the common case);
 * `trivia` — comments, whitespace, template prose — maps to `syntaxComment`
 * (whitespace carries no glyphs, so fg-coloring it is inert; prose reading
 * as comment-muted is the intended de-emphasis).
 */
export const SYNTAX_ROLE_TO_THEME: Readonly<Record<SyntaxRole, string>> = Object.freeze({
  keyword: "syntaxKeyword",
  ident: "syntaxVariable",
  number: "syntaxNumber",
  string: "syntaxString",
  punct: "syntaxPunctuation",
  trivia: "syntaxComment",
});
