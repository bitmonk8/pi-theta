import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0434 — every registered operator-facing `theta/runtime/*` note is rowless
// under the per-variant matrix.
//
// Bug 0434 (docs/bugs/0434-operator-facing-diagnostics-notes-rowless.md), the
// parent-adjudicated OPTION 1 continuation of the 0401 → 0398 → 0404 ladder,
// records that after 0404 the per-variant `display` / `content` matrix in
// docs/spec_topics/pi-integration-contract/runtime-event-channel.md selects
// exactly ONE operator-facing runtime-diagnostic note — the BNDR-9
// custom-type-unsafe rejection, named in row 3's selector and pinned to the
// custom-type-unsafe failure-mode template. Every OTHER registered
// `theta/runtime/*` code that reaches `emitDiagnostic` WITHOUT top-level panic
// framing — 21 registry rows at HEAD, all funnelled through one code path —
// ships the same group-B triple (`display: true`, `details: { diagnostics: [d] }`,
// SERIALISED-line content `<code>: <message>` / `<file>:<line>:<col>: <code>:
// <message>`) and has NO selecting row: the parse/load/type row's selector
// admits only the batch, the panic row is scoped to the top-level panic framing
// these notes do not use, and the BNDR-9 row's content mandate (the
// custom-type-unsafe template) these notes do not carry.
//
// THE SETTLED FIX this file scores, from bug 0434 §Fix (OPTION 1, docs-only and
// additive): GENERALISE the parse/load/type row's SELECTOR to also admit "a
// registered operator-facing `theta/runtime/*` diagnostic routed as a note
// rather than a top-level panic", leaving its CONTENT cell (the serialised
// line) unchanged. That one edit gives the 21 note classes a selecting row
// while the row's serialised-content mandate already matches what they carry.
//
// The fix edits (or, in the alternative sibling-row spelling 0434 §Fix also
// permits, adds) a matrix line, so — like the sibling b0404 and b0265 oracles
// whose byte-stability pins bound these edits — every site here is located BY
// CONTENT over a flattened run, never by a hard-coded line index. The page
// already carries 0432's merged fifth shutdown row, so literal matrix line
// numbers have drifted (the matrix header sits at line 28, not 27); derived
// line numbers appear in failure messages only, recomputed from the tree on
// every run.
//
// Two directions:
//
//   RED-now cells (1, 2) go GREEN after the fix. They assert the SPECIFIED
//   behaviour — the generalised selector gives the operator-facing
//   serialised-content note class exactly one selecting row, for each of the 21
//   registered codes — not the fork's rowless behaviour.
//
//   GREEN-control cells (3, 4, 5) are green at the fork AND after the fix. They
//   lock the parent's boundary requirements the generalisation must not breach:
//   it must not steal or double-cover the BNDR-9 row (3), must stay disjoint
//   from the shutdown clean-cancel row (4), and must not disturb the b0265
//   panic-row substring (5). A fix that over-reaches reds one of these.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent page cannot let a cell pass vacuously (the b0404 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a required source for the bug 0434 surface this oracle owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
    );
  }
  if (text.trim() === "") {
    throw new Error(
      `harness precondition unmet: ${rel} is empty; nothing to score`,
    );
  }
  return text;
}

/** Line splitting tolerates the page's CRLF terminators. */
const linesOf = (text: string): readonly string[] => text.split(/\r?\n/);

/** Line wrapping is editorial, so every prose match runs over a flattened run. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const RUNTIME_EVENT_CHANNEL =
  "docs/spec_topics/pi-integration-contract/runtime-event-channel.md";
const CODE_REGISTRY_RUNTIME = "docs/spec_topics/diagnostics/code-registry-runtime.md";

/**
 * The panic matrix row's b0265-pinned locator: the b0265 gate finds the panic
 * row by this exact substring under an exactly-one-match precondition, so the
 * fix's generalised/new row MUST NOT carry it. Reusing the same predicate keeps
 * the two oracles agreeing on which row is the panic row, and (via cell 5)
 * proves the generalisation leaves the panic row byte-identical on this axis.
 */
const PANIC_ROW_SELECTOR = "runtime panic (single-element batch";

/** The BNDR-9 custom-type-unsafe failure-mode template — NOT a serialised line. */
const FAILURE_TEMPLATE_PHRASE = "custom-message type is not transcript-safe";

/**
 * The 21 registered `theta/runtime/*` codes that reach `emitDiagnostic` without
 * top-level panic framing and ship as operator-facing serialised-content notes
 * — the enumeration bug 0434 §Affected proves mechanically (7 non-subagent +
 * 2 par-max + 12 subagent). Each MUST exist as a registry row (cell 2 asserts
 * it), so this oracle is registry-driven: it reds loudly if the registry moves
 * a code out from under the set rather than passing vacuously.
 */
const OPERATOR_FACING_RUNTIME_CODES: readonly string[] = [
  "watcher-terminated",
  "system-note-delivery-failed",
  "registry-swap-failed",
  "registration-cache-collision",
  "validator-cache-collision",
  "subagent-dispose-failure",
  "active-set-restore-failed",
  "par-max-non-positive",
  "par-max-non-integer",
  "subagent-spawn-failed",
  "subagent-child-crashed",
  "subagent-wire-parse-failed",
  "subagent-envelope-parse-failed",
  "subagent-envelope-schema-skew",
  "subagent-exit-without-envelope",
  "subagent-params-validation-failed",
  "subagent-return-value-not-representable",
  "subagent-teardown-timeout",
  "subagent-callable-hash-mismatch",
  "subagent-model-preflight-mismatch",
  "subagent-model-unresolved",
];

interface MatrixRow {
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The row's own text, flattened. */
  readonly text: string;
  /** The row's markdown cells, trimmed: [selector, display, content]. */
  readonly cells: readonly string[];
}

/** A markdown table row `| a | b | c |` split into trimmed cells `[a, b, c]`. */
function tableCells(rawRow: string): string[] {
  return rawRow
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

/**
 * The `|`-started rows of the "Per-variant `display` / `content` pairings
 * (normative)" table, located by its header and bounded by the next blank line
 * — never by index, so the fix's edited/inserted row does not slip the block.
 * Includes the header/separator rows (they match no cell filter below).
 */
function perVariantMatrixRows(): readonly MatrixRow[] {
  const lines = linesOf(readCorpus(RUNTIME_EVENT_CHANNEL));
  const headerIdx = lines.findIndex(
    (l) => l.includes("Per-variant") && l.includes("pairings (normative)"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no "Per-variant … pairings (normative)" table header — the matrix bug 0434 generalises cannot be located, so the matrix cells would score vacuously`,
    );
  }
  const rows: MatrixRow[] = [];
  let i = headerIdx + 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;
  for (; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (raw.startsWith("|")) {
      rows.push({ line: i + 1, text: flatten(raw), cells: tableCells(raw) });
      continue;
    }
    break;
  }
  if (rows.length === 0) {
    throw new Error(
      `harness precondition unmet: the per-variant table at ${RUNTIME_EVENT_CHANNEL} line ${headerIdx + 1} has no \`|\`-started rows`,
    );
  }
  return rows;
}

/**
 * A matrix row's selector references operator-facing-note routing. Two
 * spellings count: the BNDR-9 row's "routed as an operator-facing note" and the
 * generalised parse/load/type row's shorter "routed as a note" — both name the
 * routing bug 0434 §Fix generalises the selector onto.
 */
const referencesOperatorFacingNoteRouting = (selector: string): boolean =>
  /operator-facing note/i.test(selector) ||
  /routed as (an? )?(operator-facing )?note/i.test(selector);

/**
 * The matching model over matrix rows. A row SELECTS the "operator-facing
 * serialised-content note class" — the 21-code class bug 0434 §Fix gives a row
 * — iff all of:
 *   (i)   the selector references the diagnostics shape;
 *   (ii)  the selector references operator-facing-note routing;
 *   (iii) the selector is NOT the panic row (b0265 substring absent), scoping
 *         out the top-level-panic row 0404 narrowed;
 *   (iv)  the content is the SERIALISED-line form (`serialised` + the literal
 *         `<code>: <message>`) and is NEITHER the BNDR-9 failure template NOR
 *         the `aborted:` panic framing — the two content mandates these notes
 *         do not carry.
 * Scored on the row's own cells, so a selector match cannot borrow content from
 * a sibling row.
 */
function selectsOperatorFacingSerialisedNote(row: MatrixRow): boolean {
  const [selector = "", , content = ""] = row.cells;
  return (
    selector.includes("details: { diagnostics") &&
    referencesOperatorFacingNoteRouting(selector) &&
    !selector.includes(PANIC_ROW_SELECTOR) &&
    /serialised/i.test(content) &&
    content.includes("<code>: <message>") &&
    !content.includes(FAILURE_TEMPLATE_PHRASE) &&
    !content.includes("aborted:")
  );
}

/** The count of matrix rows selecting the operator-facing serialised-content class. */
function selectingRowCount(): number {
  return perVariantMatrixRows().filter(selectsOperatorFacingSerialisedNote)
    .length;
}

/** Dump of the current matrix rows for a red cell's diagnostic, mirroring b0404 cell 1. */
function matrixRowDump(): string {
  return perVariantMatrixRows()
    .map((r) => `  line ${r.line}: ${r.text.slice(0, 140)}`)
    .join("\n");
}

/**
 * Whether code-registry-runtime.md carries a `| \`theta/runtime/<code>\` |`-started
 * registry row. A missing row is a loud harness precondition failure naming the
 * code — never a skip — so the enumeration stays honest against registry drift.
 */
function registryRowExists(code: string): boolean {
  const needle = `| \`theta/runtime/${code}\` |`;
  return linesOf(readCorpus(CODE_REGISTRY_RUNTIME)).some((l) =>
    l.startsWith(needle),
  );
}

describe("bug 0434 — the per-variant matrix gives every registered operator-facing `theta/runtime/*` note a selecting row via the generalised parse/load/type selector", () => {
  // =========================================================================
  // RED-at-fork cells. Bug 0434 §Fix (OPTION 1) makes these green.
  // =========================================================================

  it("cell 1 (RED-now) — the per-variant matrix carries exactly one row selecting the operator-facing serialised-content note class", () => {
    const count = selectingRowCount();
    expect(
      count,
      `cell 1 (bug 0434 §Fix, OPTION 1 — generalise the parse/load/type row's selector): the per-variant table must carry EXACTLY ONE \`|\`-row that (a) references the \`details: { diagnostics\` shape, (b) references operator-facing-note routing, (c) is not the panic row, and (d) pairs it to the serialised \`<code>: <message>\` content (not the BNDR-9 "${FAILURE_TEMPLATE_PHRASE}" template, not the \`aborted:\` panic framing). Found ${count}. At the fork this is 0: 21 registered theta/runtime/* operator-facing note classes are rowless under the per-variant matrix — the parse/load/type row's selector names only the batch, the panic row is scoped to the top-level panic framing, and the BNDR-9 row's content mandate is the custom-type-unsafe template.\nTable rows now present:\n${matrixRowDump()}`,
    ).toBe(1);
  });

  it("cell 2 (RED-now) — each of the 21 registered operator-facing `theta/runtime/*` codes is registered AND its shared note class is selected by exactly one matrix row", () => {
    // (a) Registry-driven precondition: a code missing from the runtime
    // registry fails loudly naming it, so the set below cannot silently shrink.
    const missing = OPERATOR_FACING_RUNTIME_CODES.filter(
      (code) => !registryRowExists(code),
    );
    if (missing.length > 0) {
      throw new Error(
        `harness precondition unmet: ${CODE_REGISTRY_RUNTIME} carries no \`| \`theta/runtime/<code>\` |\`-started registry row for: ${missing.join(", ")} — bug 0434's enumeration is registry-driven, so a missing code is a loud failure, never a skip`,
      );
    }
    // (b) The shared note class (code-independent, one funnel) must be selected
    // by exactly one matrix row. Reported per code so the red names the whole
    // rowless set, not just the count.
    const count = selectingRowCount();
    const uncovered = OPERATOR_FACING_RUNTIME_CODES.filter(() => count !== 1);
    expect(
      uncovered,
      `cell 2 (bug 0434 §Fix witness — "each note class is selected by exactly one matrix row"): every registered operator-facing \`theta/runtime/*\` code ships the same group-B serialised-content triple through one funnel, so its shared note class must have exactly one selecting matrix row. Selecting-row count is ${count}; ${uncovered.length}/${OPERATOR_FACING_RUNTIME_CODES.length} codes are uncovered. At the fork the count is 0 and all 21 are rowless:\n${uncovered.map((c) => `  theta/runtime/${c}`).join("\n")}\nTable rows now present:\n${matrixRowDump()}`,
    ).toEqual([]);
  });

  // =========================================================================
  // GREEN-control cells. Green at the fork AND after the fix — they lock the
  // boundaries the parent required the generalisation not to breach.
  // =========================================================================

  it("cell 3 (GREEN-control) — the BNDR-9 custom-type-unsafe note class stays selected by exactly one row", () => {
    // The generalisation must not steal or double-cover the BNDR-9 row: exactly
    // one row selects operator-facing-note routing AND pins the custom-type-unsafe
    // template as content. The generalised parse/load/type row carries the
    // serialised-line content instead, so it never enters this count.
    const bndr9Rows = perVariantMatrixRows().filter((row) => {
      const [selector = "", , content = ""] = row.cells;
      return (
        referencesOperatorFacingNoteRouting(selector) &&
        content.includes(FAILURE_TEMPLATE_PHRASE)
      );
    });
    expect(
      bndr9Rows.length,
      `cell 3 (bug 0434 §Fix boundary — the generalisation must not steal or double-cover BNDR-9): exactly one matrix row must select operator-facing-note routing AND pin content to the BNDR-9 template "${FAILURE_TEMPLATE_PHRASE}". Found ${bndr9Rows.length}.\nMatching rows:\n${bndr9Rows.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(1);
  });

  it("cell 4 (GREEN-control) — the shutdown clean-cancel note class is disjoint from the generalised diagnostics selector", () => {
    const rows = perVariantMatrixRows();
    // (a) the shutdown clean-cancel row exists and is unique.
    const shutdownRows = rows.filter((row) => {
      const [selector = "", , content = ""] = row.cells;
      return (
        selector.includes("details: { shutdown") &&
        content.includes("cancelled by session shutdown")
      );
    });
    expect(
      shutdownRows.length,
      `cell 4a (bug 0434 §Non-goals — the clean-cancel note is bug 0432's, not this card's): exactly one matrix row must select \`details: { shutdown\` with "cancelled by session shutdown" content. Found ${shutdownRows.length}.\nMatching rows:\n${shutdownRows.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(1);
    // (b) the generalised diagnostics selector must NOT reach into the shutdown
    // class — no `details: { diagnostics` row may also name `shutdown` in its
    // selector. Locks the parent's disjointness requirement.
    const diagnosticsRowsNamingShutdown = rows.filter((row) => {
      const [selector = ""] = row.cells;
      return (
        selector.includes("details: { diagnostics") &&
        selector.includes("shutdown")
      );
    });
    expect(
      diagnosticsRowsNamingShutdown.length,
      `cell 4b (bug 0434 §Fix disjointness): no \`details: { diagnostics\` matrix row may also name "shutdown" in its selector — the generalised row must not capture the shutdown clean-cancel class. Found ${diagnosticsRowsNamingShutdown.length}.\nOffending rows:\n${diagnosticsRowsNamingShutdown.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(0);
  });

  it("cell 5 (GREEN-control) — the panic matrix row keeps its b0265 substring", () => {
    const panicRows = perVariantMatrixRows().filter((row) =>
      row.text.includes(PANIC_ROW_SELECTOR),
    );
    expect(
      panicRows.length,
      `cell 5 (b0265 byte-stability invariant): exactly one matrix row must keep the substring "${PANIC_ROW_SELECTOR}" — the b0265 gate locates the panic row by that exact phrase, and bug 0434's additive generalisation MUST NOT carry it. Found ${panicRows.length}.\nMatching rows:\n${panicRows.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(1);
  });
});
