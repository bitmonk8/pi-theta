import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// Bug 0403 — the unary-`-` parse refusal renders
// `unary '-' requires a numeric operand; got <type>` under the code
// `theta/parse/non-numeric-arithmetic-operands`, whose normative *Message*
// column (DIAG-4) pins only the binary template
// `'<op>' requires two numeric operands; got <left> and <right>`. The 0392
// adjudication sanctioned the divergence "documented in the Trigger column",
// and that documentation never landed on any normative registry surface.
//
// WHY this is a DIAG-4 defect, not a wording preference: DIAG-4
// (`docs/spec_topics/diagnostics/diagnostic-shape.md`, `<a id="diag-4"></a>`)
// makes the *Message* column normative — renderers MUST emit it
// character-for-character with placeholders interpolated, and tests MUST source
// the expected string from that column. The unary emission renders a sentence
// that is no interpolation of the registered template (different placeholder
// set: `<type>` vs `<left> and <right>`; different words: it never says "two
// numeric operands"), so a DIAG-4-conformant oracle sourcing the *Message*
// column cannot witness the unary bytes — the same test-infrastructure hazard
// bug 0261 was filed for.
//
// SETTLED FIX (bug 0403 §Fix option 1, the recommendation): add the unary
// template to the *Trigger* column of the row as prose-with-inline-code, placed
// so the first-to-last-backtick extraction over the *Message* cell is
// unaffected (`extractMessage` in `tools/code-registry/index.js` is cell-scoped
// to the last cell, so a backticked template in the Trigger cell cannot corrupt
// Message extraction or red the 13 bug-0142/0152 registryMessage-sourcing
// tests). Amend DIAG-4 with one sentence admitting a Trigger-column-documented
// position-specific message template. The *Message* cell stays byte-for-byte
// unchanged.
//
// This file scores two directions, mirroring the sibling registry-divergence
// oracle `tests/b0261-envelope-parse-failed-message-prefix-registry.test.ts`
// and the two-direction gate `tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts`:
//
//   RED-at-fork cells (bug 0403 §Fix makes them green):
//     - cell A — the row's *Trigger* cell documents the unary template.
//     - cell B — DIAG-4 admits a Trigger-column position-specific template.
//
//   GREEN control cells (green BOTH directions — a wrong fix reds them):
//     - cell C — the shipped unary emission is exactly
//       `unary '-' requires a numeric operand; got string` (the divergent
//       bytes the fix documents but does NOT change; §Non-goals forbids
//       rewording the emission).
//     - cell D — the row's *Message* cell is UNCHANGED (locks that the fix
//       touches only the Trigger cell, protecting the registryMessage-sourcing
//       tests).
//     - cell E — divergence proof: the observed unary message is no
//       interpolation of the registered *Message* template (the template says
//       "two numeric operands"; the emission does not).
//
// Every doc site is located BY CONTENT (the code string, the `diag-4` anchor)
// over a flattened run, never by a hard-coded line index; derived line numbers
// appear only in failure messages, recomputed each run. Assertions are semantic
// patterns so the fix survives editorial rewording while still reddening on the
// pre-fix bytes.
//
// Spec anchors (re-derived against this tree at authoring):
//   - docs/spec_topics/diagnostics/code-registry-parse.md line 43 — the
//     `theta/parse/non-numeric-arithmetic-operands` row (cells A, D).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md line 74 — DIAG-4
//     (`<a id="diag-4"></a>`) (cell B).
//   - src/parser/type-layer-checks.ts line 3906 — the unary emission read
//     through the whole-file parser (cells C, E).
//
// Tier: UNIT. Two of the five cells are pure corpus reads of committed docs;
// the emission is reached offline through the production whole-file parser
// (`parseThetaDocument`) with in-memory doubles — no provider, no model, no
// integration host. An integration/live tier would add cost and nondeterminism
// for no additional reach: both the emission literal and the registry bytes are
// static. Parse rig mirrors
// `tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts`.

const REGISTRY_PARSE =
  "docs/spec_topics/diagnostics/code-registry-parse.md";
const DIAGNOSTIC_SHAPE =
  "docs/spec_topics/diagnostics/diagnostic-shape.md";

/** The row this bug is about, located by its code string. */
const ROW_CODE = "theta/parse/non-numeric-arithmetic-operands";

/** The binary template the *Message* cell pins — must stay byte-unchanged. */
const BINARY_MESSAGE_TEMPLATE =
  "'<op>' requires two numeric operands; got <left> and <right>";

/** The distinguishing phrase the binary template carries and the unary
 *  emission does not — the substance of the divergence. */
const BINARY_ARITY_PHRASE = "two numeric operands";

/** The unary message body the emission renders and the fix must document in
 *  the Trigger column. Plain single-quotes around a plain hyphen, matching the
 *  emission at `type-layer-checks.ts:3906`. */
const UNARY_MESSAGE_PATTERN = /unary '-' requires a numeric operand; got <type>/;

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return
 * (the b0265 readCorpus pattern), because the file IS this cell's only oracle
 * and a degraded read would report success while verifying nothing.
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0403 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** Line wrapping is editorial, so every prose match runs over a flattened run. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Split a markdown table body row into trimmed, escape-decoded cells — the
 * `tools/code-registry/index.js` `splitTableRow` semantics, implemented inline
 * so this cell owns its extraction. A `\|` escape does NOT split the row.
 */
function splitTableCells(line: string): readonly string[] {
  const inner = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "");
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/**
 * Extract a cell's backtick-delimited body — the span between its first and
 * last backtick, then the table-cell backtick escape decoded — the
 * `extractMessage` semantics from `tools/code-registry/index.js:74-79`,
 * implemented inline. Used only on the *Message* (last) cell, so a backticked
 * template elsewhere in the row cannot reach it.
 */
function extractBacktickBody(cell: string): string {
  const first = cell.indexOf("`");
  const last = cell.lastIndexOf("`");
  const body = first >= 0 && last > first ? cell.slice(first + 1, last) : cell;
  return body.replace(/\\`/g, "`");
}

interface RegistryRow {
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The row's cells, split on unescaped `|`. */
  readonly cells: readonly string[];
}

/**
 * Locate the row by its code string. Exactly one body row must carry the code:
 * zero means the row moved out from under the cell (a loud harness failure,
 * since an absent row would score vacuously), more than one means the registry
 * grew a duplicate.
 */
function locateRow(): RegistryRow {
  const lines = linesOf(readCorpus(REGISTRY_PARSE));
  const hits: RegistryRow[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return;
    if (!trimmed.includes(`\`${ROW_CODE}\``)) return;
    hits.push({ line: index + 1, cells: splitTableCells(line) });
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${REGISTRY_PARSE} carries ${hits.length} body rows for \`${ROW_CODE}\`, expected exactly one — bug 0403 §Fix names this row, so a cell that cannot find it must fail loudly rather than pass vacuously${hits.length > 1 ? ` (lines ${hits.map((h) => h.line).join(", ")})` : ""}`,
    );
  }
  return hits[0] as RegistryRow;
}

/**
 * The DIAG-4 paragraph, located by its `<a id="diag-4"></a>` anchor rather than
 * by position. The list item is a single physical line; the run extends to the
 * next blank line so an editorial line-wrap cannot hide the amended sentence.
 */
function diag4Run(): { readonly flat: string; readonly anchorLine: number } {
  const lines = linesOf(readCorpus(DIAGNOSTIC_SHAPE));
  const anchorIndex = lines.findIndex((l) => l.includes('<a id="diag-4"></a>'));
  if (anchorIndex < 0) {
    throw new Error(
      `harness precondition unmet: ${DIAGNOSTIC_SHAPE} carries no <a id="diag-4"></a> anchor — DIAG-4 cannot be located, so cell B would be vacuous`,
    );
  }
  let end = anchorIndex;
  while (end + 1 < lines.length && (lines[end + 1] ?? "").trim() !== "") end += 1;
  return {
    flat: flatten(lines.slice(anchorIndex, end + 1).join(" ")),
    anchorLine: anchorIndex + 1,
  };
}

// --- The parse rig (mirrors b0398): production whole-file parser, in-memory
//     doubles for the systemNote channel and the model matcher, no provider.

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

interface EmittedError {
  readonly code: string;
  readonly message: string;
}

/**
 * Parse `let s = "5"` / `let y = -s` (bug 0403 §Reproduction) and return the
 * error-severity diagnostics. `s` resolves to `string`, so unary `-` over it
 * fires the non-numeric operand refusal.
 */
function parseUnaryRefusalErrors(): readonly EmittedError[] {
  const src = 'let s = "5"\nlet y = -s\n';
  const source: ThetaSource = {
    path: "b0403.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  return doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => ({ code: d.code, message: d.message }));
}

const ROW = locateRow();
const DIAG4 = diag4Run();

describe("bug 0403 — the unary-`-` refusal's message diverges from every normative registry surface", () => {
  // =========================================================================
  // RED-at-fork cells. Bug 0403 §Fix (option 1) makes these green.
  // =========================================================================

  it("cell A (RED-now) — the row's Trigger cell documents the unary message template", () => {
    // Trigger is cell index 3 (Code | Sev | Phase | Trigger | Spec rule | Hint
    // | Message). At the fork the Trigger names the unary firing and cites
    // "(bug 0392)" but carries NO template, so this reds. Option 1 adds the
    // unary template here as prose-with-inline-code → green.
    const trigger = flatten(ROW.cells[3] ?? "");
    expect(
      UNARY_MESSAGE_PATTERN.test(trigger),
      `cell A (bug 0403 §Fix option 1 — "add the unary template to the Trigger column as prose-with-inline-code"): the Trigger cell of \`${ROW_CODE}\` at ${REGISTRY_PARSE} line ${ROW.line} must document the divergent unary template (matching ${UNARY_MESSAGE_PATTERN}). At the fork it names the unary firing and cites "(bug 0392)" but carries no template — the divergent sentence exists on no normative registry surface. Trigger cell: ${trigger.slice(0, 320)}`,
    ).toBe(true);
  });

  it("cell B (RED-now) — DIAG-4 admits a Trigger-column position-specific message template", () => {
    // At the fork DIAG-4 makes the *Message* column normative
    // character-for-character with NO divergence-escape, so it names no Trigger
    // column at all and this reds. Option 1 amends DIAG-4 with one sentence
    // admitting a Trigger-documented position-specific template → green.
    // Two order-independent conjuncts. The load-bearing one is the mention of
    // the *Trigger* column — tolerating markdown emphasis / code markup between
    // "trigger" and "column" (the fix references it in the house style
    // `*Trigger* column`, mirroring DIAG-4's own `*Message* column`). The
    // second requires a template/position notion, keeping the sanction specific
    // to a documented message template rather than any stray Trigger mention.
    // Neither "trigger column", "template", nor "position" appears in DIAG-4 at
    // the fork, so both conjuncts are red now; the amendment adds both,
    // regardless of clause order. "message" is deliberately NOT a second-
    // conjunct term — DIAG-4 already carries it at the fork.
    const mentionsTriggerColumn = /trigger[\s*_`]*column/i.test(DIAG4.flat);
    const mentionsPositionTemplate = /template|position/i.test(DIAG4.flat);
    expect(
      mentionsTriggerColumn && mentionsPositionTemplate,
      `cell B (bug 0403 §Fix option 1 — "amend DIAG-4 with one sentence admitting a Trigger-documented position-specific template"): DIAG-4 at ${DIAGNOSTIC_SHAPE} line ${DIAG4.anchorLine} must admit a position-specific message template documented in the *Trigger* column (mentions-Trigger-column=${mentionsTriggerColumn}, mentions-template/position=${mentionsPositionTemplate}). At the fork it makes the *Message* column normative with no such escape, so the unary divergence has no sanction. DIAG-4 run: ${DIAG4.flat.slice(0, 400)}`,
    ).toBe(true);
  });

  // =========================================================================
  // GREEN control cells. Green BOTH directions — a wrong fix reds them.
  // =========================================================================

  it("cell C (GREEN control) — the shipped unary emission is exactly the divergent sentence", () => {
    // §Non-goals forbids rewording the emission; the fix documents these bytes,
    // it does not change them. Guards the reach path too: exactly one
    // error-severity diagnostic under the reused row's code. If this reds the
    // rig no longer reaches the emission and cells A/B/D/E score nothing.
    const errors = parseUnaryRefusalErrors();
    expect(
      errors,
      `cell C: parsing \`let s = "5"\` / \`let y = -s\` must yield exactly one error-severity diagnostic (the unary refusal). Got: ${JSON.stringify(errors)}`,
    ).toHaveLength(1);
    const only = errors[0]!;
    expect(only.code, "the unary gate reuses the binary row's code (0326 anti-fork)").toBe(
      ROW_CODE,
    );
    expect(
      only.message,
      "bug 0403 §Reproduction — the emission renders this sentence verbatim (type-layer-checks.ts:3906)",
    ).toBe("unary '-' requires a numeric operand; got string");
  });

  it("cell D (GREEN control) — the row's Message cell is UNCHANGED (fix touches only the Trigger cell)", () => {
    // Locks that the fix does NOT touch the *Message* cell, protecting the 13
    // registryMessage-sourcing (bug 0142/0152) tests. Message is the last cell;
    // its normative body is the span between its first and last backtick.
    const messageCell = ROW.cells[ROW.cells.length - 1] ?? "";
    const message = extractBacktickBody(messageCell);
    expect(
      message,
      `cell D (bug 0403 §Fix — "the Message cell is UNCHANGED"; §Non-goals — rewording the binary template is a theta 2.0 breaking change): the *Message* cell of \`${ROW_CODE}\` at ${REGISTRY_PARSE} line ${ROW.line} must stay the binary two-operand template byte-for-byte. Found: ${message}`,
    ).toBe(BINARY_MESSAGE_TEMPLATE);
  });

  it("cell E (GREEN control) — divergence proof: the unary emission is no interpolation of the registered Message template", () => {
    // The registered template carries "two numeric operands" and two operand
    // placeholders; the unary emission carries neither. No interpolation of the
    // one yields the other — the core claim of the bug, true both directions
    // (the fix documents the divergence, it does not remove it).
    const errors = parseUnaryRefusalErrors();
    const observed = errors[0]!.message;
    const messageCell = ROW.cells[ROW.cells.length - 1] ?? "";
    const template = extractBacktickBody(messageCell);

    expect(
      template.includes(BINARY_ARITY_PHRASE),
      `cell E: the registered *Message* template must carry the arity phrase "${BINARY_ARITY_PHRASE}" that distinguishes it from the unary emission. Template: ${template}`,
    ).toBe(true);
    expect(
      observed.includes(BINARY_ARITY_PHRASE),
      `cell E (the divergence): the unary emission must NOT contain "${BINARY_ARITY_PHRASE}" — it renders a different sentence than any interpolation of the registered binary template. Observed: ${observed}`,
    ).toBe(false);
  });
});
