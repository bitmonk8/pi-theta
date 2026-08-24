import { describe, expect, it } from "vitest";
import {
  buildBinderSystemPrompt,
  type SystemPromptParamField,
} from "../src/binder/binder-system-prompt";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// A `description:` or `argument-hint:` whose whole value is line breaks and
// horizontal whitespace must render as an absent field renders: no labelled
// line at all — bug 0209.
//
// SPEC ANCHORS (the contract asserted here, not the current rendering):
//   - docs/spec_topics/binder/binder-bypass-and-envelope.md:112 — the item
//     list's preamble: "the listed tokens, line-prefixes, and
//     conditional-presence rules are the contract", and a conditional rule
//     requires both halves.
//   - :115 (item 2, MUST) — "When `description:` is absent or empty, the line
//     MUST be omitted entirely (no `Description:` token with an empty value)".
//     The parenthetical constrains the rendered prompt, so a prompt carrying
//     `Description:` with nothing after it fails item 2 whatever the raw
//     frontmatter scalar was. The same sentence's collapse-and-trim clause is
//     what produces that shape for an all-break value.
//   - :116 (item 3, MUST) — "When absent or empty, the line MUST be omitted
//     entirely", inheriting item 2's collapse-and-trim by reference.
//   - docs/spec_topics/governance/source-language-stability.md:9 — a `W`
//     diagnostic does not disqualify a clean load, so the `argument-hint:`
//     rows here register with their advisory.
//
// SUBJECT (bug 0209 §Actual behaviour / root cause): an all-break value
// passes a raw non-emptiness guard, collapses to "" under
// `normalisePromptTextLineBreaks`, and emits the bare labelled line. At this
// tree the two emission sites test the transform's result
// (`src/binder/binder-system-prompt.ts:388`–`:401`: the item-2 guard at
// `:388` with its collapsed local at `:389`, the item-3 guard at `:397` with
// its collapsed local at `:398`, `normalisePromptTextLineBreaks` itself at
// `:99`, the `line` helper at `:373`), so the line is omitted exactly as for
// an absent field; this file is the witness that keeps that so.
//
// The empty case is already handled one layer down and is the model this file
// asserts: `src/parser/frontmatter.ts:1522` drops a `""` `description:` (and
// `:1527` a `""` `argument-hint:`) before the builder is reached, so the
// builder receives `undefined` and omits the line — the rendering
// `tests/binder-system-prompt.test.ts:102` and `:108` pin with
// `not.toContain("Description:")`. An all-break value is not `""` at the
// parser, so it survives to the builder.
//
// Offline, provider-free, deterministic: every cell is one `parseDoc` (the
// real front end) plus one `buildBinderSystemPrompt` (the shipped exported
// builder), with the two frontmatter values spread exactly as the sole
// production caller spreads them
// (`src/extension/production-theta-producer.ts:851`–`:852`). Live cannot
// witness this: the prompt is a model input and the binder `complete()` call
// is off-session, so no harness channel carries the prompt bytes (bug 0209
// §Fix constraint 5).

// --- fixture drivers ---------------------------------------------------------

/**
 * A single backslash, used to build the two-character `\n` / `\r` / `\t`
 * sequences YAML's double-quoted scalars interpret. Spelling them through
 * `String.fromCharCode` keeps a real line break out of the fixture source: a
 * literal LF inside the frontmatter block terminates it and the row would
 * score a parse failure instead of the subject.
 */
const BS = String.fromCharCode(92);

/**
 * The single `params:` field every cell declares. One `integer` field is not
 * the single-string bypass (binder-bypass-and-envelope.md:11), so every cell
 * is on the binder path that builds this prompt.
 */
const ONE_INTEGER_FIELD: readonly SystemPromptParamField[] = [
  { wireName: "p", type: "integer", requirement: { kind: "required" } },
];

/** The raw slash text item 5's line carries, on every cell. */
const RAW_ARGUMENTS = "real args";

/** The bare command name item 1's line carries, on every cell. */
const THETA_NAME = "t";

/** A `.theta` source carrying the given frontmatter fragment. */
function source(frontmatterFragment: string): string {
  return `---\nmode: prompt\n${frontmatterFragment}params:\n  p: integer\n---\n\nlet x = 1\n`;
}

interface Cell {
  readonly prompt: string;
  readonly description: string | undefined;
  readonly argumentHint: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

const codesOf = (diagnostics: readonly Diagnostic[]): string[] =>
  diagnostics.map((d) => d.code);

/**
 * Parse one source through the real front end, then build the prompt exactly
 * as the sole production caller does — `fm.description` and `fm.argumentHint`
 * spread verbatim onto the builder input. Nothing between the parser and the
 * builder is mocked, so the rendering this file asserts has to hold inside the
 * builder to satisfy it. Mirrors the bug 0103 witness's harness
 * (`tests/binder-prompt-description-hint-line-forgery.test.ts:100`).
 */
function cell(frontmatterFragment: string): Cell {
  const doc = parseDoc(source(frontmatterFragment));
  const fm = doc.frontmatter;
  if (fm === null) {
    throw new Error(
      "unmet precondition: the fixture's frontmatter did not parse, so the " +
        "cell scores nothing about item 2 / item 3 rendering. Diagnostics: " +
        JSON.stringify(codesOf(doc.diagnostics)),
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

// --- observables -------------------------------------------------------------

const linesOf = (prompt: string): readonly string[] => prompt.split("\n");

const physOf = (prompt: string): number => linesOf(prompt).length;

const labelledLines = (prompt: string, prefix: string): readonly string[] =>
  linesOf(prompt).filter((l) => l.startsWith(prefix));

/**
 * The prompt's total `\n`-split physical line count for the one-field shape
 * with neither item 2's nor item 3's line present. Measured off the
 * absent-field control below, which also pins it.
 */
const PHYS_NO_ITEM_LINE = 16;

/** The same count with exactly one of item 2 / item 3 present. */
const PHYS_ONE_ITEM_LINE = 17;

/**
 * Fail loudly when the fixture did not put the value under test in front of
 * the builder. An all-break cell only witnesses the guard/transform
 * disagreement if the parser recorded the value non-empty; a `undefined` or
 * `""` here means the fixture broke, not that the subject moved.
 */
function requireRecorded(
  field: "description" | "argument-hint",
  value: string | undefined,
): string {
  if (value === undefined || value === "") {
    throw new Error(
      `unmet precondition: the fixture's ${field}: was recorded as ` +
        `${JSON.stringify(value)}, so it never reached the builder non-empty ` +
        "and the cell cannot witness the raw-guard / collapsed-value " +
        "disagreement",
    );
  }
  return value;
}

/**
 * The all-break contract: the labelled line is absent and the prompt's
 * physical line count is the absent-field control's. Item 2's omission clause
 * (:115) forbids the `Description:` token with an empty value; item 3's
 * (:116) forbids it for `Argument hint:`.
 */
function expectOmittedLikeAbsentField(
  prompt: string,
  labels: readonly string[],
): void {
  for (const label of labels) {
    expect(
      prompt,
      `item 2 / item 3 omission clause: the prompt carries the '${label}' ` +
        "token with an empty value; the line must be omitted entirely. " +
        `Labelled lines: ${JSON.stringify(labelledLines(prompt, label))}`,
    ).not.toContain(label);
  }
  expect(
    physOf(prompt),
    "the prompt must have the absent-field control's physical line count " +
      `(no labelled line added). Lines: ${JSON.stringify(linesOf(prompt))}`,
  ).toBe(PHYS_NO_ITEM_LINE);
}

// ============================================================================
// (a) Controls — what the omitted rendering is, and what a value that
//     survives the collapse renders as. Green before and after the fix.
// ============================================================================

describe("bug 0209 (a): controls pin the omitted and the surviving renderings", () => {
  it("CTRL-absent: no `description:` and no `argument-hint:` emits neither label", () => {
    const r = cell("");
    expect(r.description).toBeUndefined();
    expect(r.argumentHint).toBeUndefined();
    expect(codesOf(r.diagnostics)).toEqual([]);
    expect(labelledLines(r.prompt, "Description:")).toEqual([]);
    expect(labelledLines(r.prompt, "Argument hint:")).toEqual([]);
    expect(r.prompt).not.toContain("Description:");
    expect(r.prompt).not.toContain("Argument hint:");
    // The measured baseline every all-break cell below is held to.
    expect(physOf(r.prompt)).toBe(PHYS_NO_ITEM_LINE);
  });

  it("CTRL-desc: a break-free `description:` renders verbatim on one line", () => {
    const r = cell("description: plain desc\n");
    expect(r.description).toBe("plain desc");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expect(labelledLines(r.prompt, "Description:")).toEqual([
      "Description: plain desc",
    ]);
    expect(physOf(r.prompt)).toBe(PHYS_ONE_ITEM_LINE);
  });

  it("CTRL-hint: a break-free `argument-hint:` renders verbatim on one line", () => {
    const r = cell('argument-hint: "<path>"\n');
    expect(r.argumentHint).toBe("<path>");
    // Severity `W`, fired because no non-empty `description:` accompanies it
    // (src/parser/frontmatter.ts:1248); the theta still registers
    // (source-language-stability.md:9).
    expect(codesOf(r.diagnostics)).toEqual([
      "theta/load/argument-hint-not-displayed",
    ]);
    expect(labelledLines(r.prompt, "Argument hint:")).toEqual([
      "Argument hint: <path>",
    ]);
    expect(physOf(r.prompt)).toBe(PHYS_ONE_ITEM_LINE);
  });

  it("D-empty: a `description: \"\"` is dropped at the parser and emits no label", () => {
    // src/parser/frontmatter.ts:1522 gates the spread on non-emptiness, so the
    // builder receives `undefined`. This is the rendering the all-break cells
    // below assert.
    const r = cell('description: ""\n');
    expect(r.description).toBeUndefined();
    expect(codesOf(r.diagnostics)).toEqual([]);
    expect(r.prompt).not.toContain("Description:");
    expect(physOf(r.prompt)).toBe(PHYS_NO_ITEM_LINE);
  });

  it("D-block: an empty `description: |` block scalar emits no label", () => {
    const r = cell("description: |\n\n");
    expect(r.description).toBeUndefined();
    expect(codesOf(r.diagnostics)).toEqual([]);
    expect(r.prompt).not.toContain("Description:");
    expect(physOf(r.prompt)).toBe(PHYS_NO_ITEM_LINE);
  });
});

// ============================================================================
// (b) Item 2 — an all-break `description:` must render as an absent field
// ============================================================================

describe("bug 0209 (b): an all-break `description:` emits no `Description:` token (item 2, :115)", () => {
  it("D-nl: `description: \"\\n\"`", () => {
    const r = cell(`description: "${BS}n"${"\n"}`);
    expect(requireRecorded("description", r.description)).toBe("\n");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expectOmittedLikeAbsentField(r.prompt, ["Description:"]);
  });

  it("D-wsnl: `description: \"  \\n  \"`", () => {
    const r = cell(`description: "  ${BS}n  "${"\n"}`);
    expect(requireRecorded("description", r.description)).toBe("  \n  ");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expectOmittedLikeAbsentField(r.prompt, ["Description:"]);
  });

  it("D-crlf: `description: \"\\r\\n\"`", () => {
    const r = cell(`description: "${BS}r${BS}n"${"\n"}`);
    expect(requireRecorded("description", r.description)).toBe("\r\n");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expectOmittedLikeAbsentField(r.prompt, ["Description:"]);
  });

  it("D-tabnl: `description: \"\\t\\n\\t\"`", () => {
    const r = cell(`description: "${BS}t${BS}n${BS}t"${"\n"}`);
    expect(requireRecorded("description", r.description)).toBe("\t\n\t");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expectOmittedLikeAbsentField(r.prompt, ["Description:"]);
  });
});

// ============================================================================
// (c) Item 3 — an all-break `argument-hint:` must render as an absent field
// ============================================================================

describe("bug 0209 (c): an all-break `argument-hint:` emits no `Argument hint:` token (item 3, :116)", () => {
  it("H-nl: `argument-hint: \"\\n\"`", () => {
    const r = cell(`argument-hint: "${BS}n"${"\n"}`);
    expect(requireRecorded("argument-hint", r.argumentHint)).toBe("\n");
    // The advisory's own test is raw, so it fires exactly as on CTRL-hint;
    // the emission-site guard moves no diagnostic.
    expect(codesOf(r.diagnostics)).toEqual([
      "theta/load/argument-hint-not-displayed",
    ]);
    expectOmittedLikeAbsentField(r.prompt, ["Argument hint:"]);
  });

  it("H-wsnl: `argument-hint: \"  \\n  \"`", () => {
    const r = cell(`argument-hint: "  ${BS}n  "${"\n"}`);
    expect(requireRecorded("argument-hint", r.argumentHint)).toBe("  \n  ");
    expect(codesOf(r.diagnostics)).toEqual([
      "theta/load/argument-hint-not-displayed",
    ]);
    expectOmittedLikeAbsentField(r.prompt, ["Argument hint:"]);
  });

  it("BOTH-nl: both fields all-break emit neither label", () => {
    // No advisory: `description:`'s raw value is non-empty at the parser
    // (src/parser/frontmatter.ts:1248's test), so the field counts as present
    // for the advisory while contributing nothing to the prompt.
    const r = cell(
      `description: "${BS}n"${"\n"}argument-hint: "${BS}n"${"\n"}`,
    );
    expect(requireRecorded("description", r.description)).toBe("\n");
    expect(requireRecorded("argument-hint", r.argumentHint)).toBe("\n");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expectOmittedLikeAbsentField(r.prompt, ["Description:", "Argument hint:"]);
  });
});

// ============================================================================
// (d) The bound — a break-free all-space value is byte-identical
// ============================================================================

describe("bug 0209 (d): a break-free whitespace `description:` is unchanged (§Non-goals)", () => {
  it("D-spaces: `description: \"   \"` renders its three trailing spaces", () => {
    // The transform's fast path (src/binder/binder-system-prompt.ts:94) returns
    // a value carrying no CR and no LF unchanged, which bug 0103 §Fix
    // constraint 2 requires byte-for-byte. Green before and after: bug 0209
    // §Non-goals excludes break-free whitespace, and §Fix constraint 1 pins
    // this rendering across the fix.
    const r = cell('description: "   "\n');
    expect(requireRecorded("description", r.description)).toBe("   ");
    expect(codesOf(r.diagnostics)).toEqual([]);
    expect(labelledLines(r.prompt, "Description:")).toEqual([
      "Description:    ",
    ]);
    expect(physOf(r.prompt)).toBe(PHYS_ONE_ITEM_LINE);
  });
});
