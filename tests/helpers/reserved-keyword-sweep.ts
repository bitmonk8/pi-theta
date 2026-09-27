// The 32-spelling reserved-keyword sweep harness the bug 0153 / 0242 witness
// files share (tests/reserved-keyword-remaining-identifier-positions.test.ts,
// tests/reserved-keyword-misfire-faces.test.ts): the shipped spelling list, the
// per-shape `.theta` source builders, the 1-indexed column each shape's name
// starts at, and the `sweep` / `expectedSweep` pair that drives one shape over
// every spelling into a `spelling -> rendered list` record (PTQ-1502).
//
// TIER: unit, offline, deterministic, provider-free. Nothing here is stubbed:
// `sweep` parses through the real `parseDoc` (`tests/helpers/e2e-s1.ts`).

import { reservedKeywords } from "../../src/lexer/lexer";
import { parseDoc, diagLinesWithRange as lines } from "./e2e-s1";
import { FM } from "./prompt-value-harness";

/**
 * lexical.md:20's 32 spellings, read from the shipped set (`reservedKeywords()`,
 * src/lexer/lexer.ts) rather than copied, so the sweeps cannot drift from the
 * set the fix's own predicates read and a fix that mints a second list has
 * nowhere to hide.
 */
export const SPELLINGS: readonly string[] = [...reservedKeywords()];

// The shared source shapes. Body line numbers: the `.theta` frontmatter
// occupies lines 1–3, so a one-line body sits on line 4 and a body preceded by
// `let xs = [1]` sits on line 5.
export const forSource = (kw: string): string =>
  `${FM}let xs = [1]\nfor ${kw} in xs { 1 }\n1\n`;
export const parForSource = (kw: string): string =>
  `${FM}let xs = [1]\npar for ${kw} in xs { 1 }\n1\n`;
export const schemaFieldSource = (kw: string): string => `${FM}schema S { ${kw}: string }\n1\n`;
export const paramsSource = (kw: string): string =>
  `---\nmode: prompt\nparams:\n  ${kw}: string\n---\n1\n`;
export const enumVariantSource = (kw: string): string => `${FM}enum E { ${kw} }\n1\n`;
export const importBareLine = (kw: string): string => `import { ${kw} } from "./lib.thetalib"`;
export const importBareSource = (kw: string): string => `${FM}${importBareLine(kw)}\n1\n`;
export const importAliasSource = (kw: string): string =>
  `${FM}import { a as ${kw} } from "./lib.thetalib"\n1\n`;

/** The 1-indexed column each shape's name starts at, from its fixed prefix. */
export const FOR_COL = 5; // `for `
export const PAR_FOR_COL = 9; // `par for `
export const SCHEMA_FIELD_COL = 12; // `schema S { `
export const PARAMS_KEY_COL = 3; // the two-space YAML indent
export const ENUM_VARIANT_COL = 10; // `enum E { `
export const IMPORT_BARE_COL = 10; // `import { `
export const IMPORT_ALIAS_COL = 15; // `import { a as `

/** Run one shape's whole 32-spelling sweep into `spelling -> rendered list`. */
export function sweep(
  source: (keyword: string) => string,
  path?: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    const text = source(keyword);
    out[keyword] = lines(path === undefined ? parseDoc(text) : parseDoc(text, path));
  }
  return out;
}

/** Build the expected sweep from a per-spelling rule. */
export function expectedSweep(rule: (keyword: string) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    out[keyword] = rule(keyword);
  }
  return out;
}
