// A shared "one-`integer`-field `.theta` source, parsed then rendered through
// `buildBinderSystemPrompt` exactly as the sole production caller does" harness
// (PTQ-0252).
//
// WHY THIS FILE EXISTS. tests/binder-prompt-description-hint-line-forgery.test.ts
// (bug 0103) and tests/binder-prompt-all-break-description-hint-empty-line.test.ts
// (bug 0209) each independently redeclared the same `ONE_INTEGER_FIELD`
// constant, the same `RAW_ARGUMENTS` / `THETA_NAME` constants, the same
// `source()` fixture builder, the same result shape (`Row` / `Cell`, structurally
// identical), the same parse-then-build driver (`row()` / `cell()`), and the
// same `codesOf` diagnostic-code projection. This module centralises the pieces
// that were byte-for-byte identical between the two.
//
// TIER: unit, offline, deterministic, provider-free — the same tier as every
// file that imports this module. `buildOneFieldPromptCell` parses through the
// real `parseDoc` (`tests/helpers/e2e-s1.ts`) and renders through the real,
// shipped `buildBinderSystemPrompt`; nothing here is stubbed.

import type { Diagnostic } from "../../src/diagnostics/diagnostic";
import {
  buildBinderSystemPrompt,
  type SystemPromptParamField,
} from "../../src/binder/binder-system-prompt";
import { parseDoc } from "./e2e-s1";

/**
 * The single `params:` field every cell/row declares. One `integer` field is
 * not the single-string bypass (binder-bypass-and-envelope.md:11), so every
 * cell/row is on the binder path that builds this prompt.
 */
export const ONE_INTEGER_FIELD: readonly SystemPromptParamField[] = [
  { wireName: "p", type: "integer", requirement: { kind: "required" } },
];

/** The raw slash text item 5's line carries, on every cell/row. */
export const RAW_ARGUMENTS = "real args";

/** The bare command name item 1's line carries, on every cell/row. */
export const THETA_NAME = "t";

/** A `.theta` source carrying the given frontmatter fragment, above a single
 *  one-`integer`-field `params:` block. */
export function source(frontmatterFragment: string): string {
  return `---\nmode: prompt\n${frontmatterFragment}params:\n  p: integer\n---\n\nlet x = 1\n`;
}

/** Error-severity-and-below diagnostic codes, in emission order. */
export const codesOf = (diagnostics: readonly Diagnostic[]): string[] =>
  diagnostics.map((d) => d.code);

/** One parsed-then-rendered result: the built prompt, the two recorded
 *  frontmatter values it was built from, and the parse's diagnostics. */
export interface OneFieldPromptCell {
  readonly prompt: string;
  readonly description: string | undefined;
  readonly argumentHint: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Parse one source through the real front end, then build the prompt exactly
 * as the sole production caller does — `fm.description` and `fm.argumentHint`
 * spread verbatim onto the builder input. Nothing between the parser and the
 * builder is mocked, so the rendering a caller asserts has to hold inside the
 * builder to satisfy it.
 */
export function buildOneFieldPromptCell(frontmatterFragment: string): OneFieldPromptCell {
  const doc = parseDoc(source(frontmatterFragment));
  const fm = doc.frontmatter;
  if (fm === null) {
    throw new Error(
      `unmet precondition: the fixture's frontmatter did not parse, so the cell scores nothing. Diagnostics: ${JSON.stringify(codesOf(doc.diagnostics))}`,
    );
  }
  const prompt = buildBinderSystemPrompt({
    name: THETA_NAME,
    ...(fm.description !== undefined ? { description: fm.description } : {}),
    ...(fm.argumentHint !== undefined ? { argumentHint: fm.argumentHint } : {}),
    params: [...ONE_INTEGER_FIELD],
    rawArguments: RAW_ARGUMENTS,
  });
  return {
    prompt,
    description: fm.description,
    argumentHint: fm.argumentHint,
    diagnostics: doc.diagnostics,
  };
}
