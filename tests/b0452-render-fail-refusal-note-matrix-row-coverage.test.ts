import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0452 — the bug-0422 route (c) system-render-fail refusal note ships a
// `details: { diagnostics: [d] }` payload whose (selector, content) pair
// matches NO per-variant matrix row, and whose parse-namespaced diagnostic
// (`theta/parse/interpolated-result`) routed as a NON-panic operator-facing
// note is admitted by NO group-B partition sentence.
//
// Bug 0452 (docs/bugs/0452-system-render-fail-note-matches-no-matrix-row.md).
// Bug 0422's fix (v0.435.0) added an operator-visible note at the subagent
// spawn site for a failing `system:` render
// (src/extension/production-theta-producer.ts:2351, content template
// "'system:' interpolation for '<name>' failed to render (<code>); refusing to
// spawn rather than silently drop the system prompt"; display: true; details:
// { diagnostics: [rendered.diagnostic] }, the diagnostic being
// `theta/parse/interpolated-result`). The channel page
// (docs/spec_topics/pi-integration-contract/runtime-event-channel.md) was not
// reconciled: under the per-variant `display` / `content` matrix — the
// uniqueness mechanism 0434's fix ratified — this note selects nothing (its
// content is custom prose, not the serialised line the diagnostics-batch row
// mandates), and the group-B partition prose admits `theta/runtime/*`
// diagnostics as operator-facing notes but never a `theta/parse/*` one.
//
// THE SETTLED FIX this file scores (parent-adjudicated = Option 2, "matrix row"
// + witness extension; the shipped bytes are KEPT, the producer note SITE is
// NOT rewritten): in runtime-event-channel.md the fix ADDS (i) one new row to
// the "Per-variant `display` / `content` pairings (normative)" table sanctioning
// the render-fail refusal note — a row whose selector references the
// `details: { diagnostics` shape and whose content cell carries the site's
// verbatim "refusing to spawn…" template — and (ii) a group-B partition
// sentence admitting the parse-namespaced diagnostic routed as a NON-panic
// operator-facing note. Neither exists at the fork; the RED cells red on their
// absence.
//
// The fix edits (adds a row to / adds a sentence to) the page, so — like the
// sibling b0434 / b0404 / b0265 oracles whose byte-stability pins bound these
// edits — every site here is located BY CONTENT over a flattened run, never by
// a hard-coded line index. Derived line numbers appear in failure messages
// only, recomputed from the tree on every run. Line splitting tolerates the
// page's CRLF terminators even though the repo convention is LF.
//
// Two directions:
//
//   RED-now cells (1, 2, 3) go GREEN after the fix. They assert the SPECIFIED
//   behaviour — the new matrix row (1, 3) and the new group-B sentence (2) —
//   not the fork's rowless / sentence-less state.
//
//   GREEN-control cells (4, 5) are green at the fork AND after the fix. They
//   lock the boundaries the new row must not breach: it must not steal or
//   duplicate the b0265 panic row (4), and it must not perturb the b0434
//   serialised-content operator-facing note class's exactly-one-row count (5).
//   A fix that over-reaches reds one of these.

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent page cannot let a cell pass vacuously (the b0434 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is a required source for the bug 0452 surface this oracle owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
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
const PRODUCER = "src/extension/production-theta-producer.ts";

/**
 * The render-fail refusal note's verbatim content template, invented at the
 * emission site (production-theta-producer.ts:2351). Cell 3 pins the code↔doc
 * tie on this exact phrase: it must ship at the emission site (loud
 * precondition) AND be pinned by exactly one matrix row's content cell, so a
 * future site-invented divergence between the two reds.
 */
const REFUSAL_TEMPLATE_PHRASE =
  "refusing to spawn rather than silently drop the system prompt";

/** The short site substring the new matrix row's content cell must carry. */
const REFUSAL_CONTENT_SUBSTRING = "refusing to spawn";

/**
 * The panic matrix row's b0265-pinned locator: the b0265 gate finds the panic
 * row by this exact substring under an exactly-one-match precondition, so the
 * fix's new row MUST NOT carry it. Reusing the same predicate keeps this oracle
 * and b0265 agreeing on which row is the panic row (cell 4).
 */
const PANIC_ROW_SELECTOR = "runtime panic (single-element batch";

/** The BNDR-9 custom-type-unsafe failure-mode template — NOT a serialised line. */
const FAILURE_TEMPLATE_PHRASE = "custom-message type is not transcript-safe";

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
 * — never by index, so the fix's inserted row does not slip the block. Includes
 * the header/separator rows (they match no cell filter below).
 */
function perVariantMatrixRows(): readonly MatrixRow[] {
  const lines = linesOf(readCorpus(RUNTIME_EVENT_CHANNEL));
  const headerIdx = lines.findIndex(
    (l) => l.includes("Per-variant") && l.includes("pairings (normative)"),
  );
  if (headerIdx < 0) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no "Per-variant … pairings (normative)" table header — the matrix bug 0452 adds a row to cannot be located, so the matrix cells would score vacuously`,
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

/** Dump of the current matrix rows for a red cell's diagnostic, mirroring b0434. */
function matrixRowDump(): string {
  return perVariantMatrixRows()
    .map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`)
    .join("\n");
}

/**
 * A matrix row's selector references operator-facing-note routing. Two
 * spellings count: the BNDR-9 / generalised rows' "routed as an operator-facing
 * note" and the shorter "routed as a note" — both name the non-panic
 * operator-facing routing the render-fail note also uses.
 */
const referencesOperatorFacingNoteRouting = (selector: string): boolean =>
  /operator-facing note/i.test(selector) ||
  /routed as (an? )?(operator-facing )?note/i.test(selector);

/**
 * The lines of the "Group B — `details: { diagnostics }`" partition region,
 * located by its header and bounded by the first following non-blank,
 * non-bullet line (the `validation`, `context_overflow` … paragraph) — never by
 * index. Both the existing bullets and any new bullet / bullet-extension the
 * fix lands fall inside this block, and it stops before the unrelated
 * always-log-exclusion prose.
 */
function groupBRegionLines(): readonly { line: number; text: string }[] {
  const lines = linesOf(readCorpus(RUNTIME_EVENT_CHANNEL));
  const headerIdx = lines.findIndex((l) =>
    /^Group B —/.test(l.trim()),
  );
  if (headerIdx < 0) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no "Group B — …" partition header — the group-B sentence bug 0452 adds cannot be located, so cell 2 would score vacuously`,
    );
  }
  const region: { line: number; text: string }[] = [
    { line: headerIdx + 1, text: flatten(lines[headerIdx] ?? "") },
  ];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("- ")) {
      region.push({ line: i + 1, text: flatten(raw) });
      continue;
    }
    break;
  }
  if (region.length === 1) {
    throw new Error(
      `harness precondition unmet: the "Group B — …" partition at ${RUNTIME_EVENT_CHANNEL} line ${headerIdx + 1} has no bullet lines`,
    );
  }
  return region;
}

describe("bug 0452 — the render-fail refusal note gets a per-variant matrix row and a group-B partition sentence", () => {
  // =========================================================================
  // RED-at-fork cells. Bug 0452 §Fix (Option 2 — new row + group-B sentence)
  // makes these green.
  // =========================================================================

  it("cell 1 (RED-now) — the per-variant matrix carries exactly one row selecting the render-fail refusal note class", () => {
    // The new row's selector references the `details: { diagnostics` shape the
    // note carries, and its content cell carries the site's "refusing to spawn"
    // template. Scored on the row's own cells so a selector match cannot borrow
    // content from a sibling row. At the fork no row's content mentions the
    // refusal template, so the count is 0 (the doc's rowless state).
    const rows = perVariantMatrixRows().filter((row) => {
      const [selector = "", , content = ""] = row.cells;
      return (
        selector.includes("details: { diagnostics") &&
        content.includes(REFUSAL_CONTENT_SUBSTRING)
      );
    });
    expect(
      rows.length,
      `cell 1 (bug 0452 §Fix, Option 2 — add a per-variant row for the render-fail refusal note): the per-variant table must carry EXACTLY ONE \`|\`-row that (a) references the \`details: { diagnostics\` shape and (b) pairs it to a content cell containing "${REFUSAL_CONTENT_SUBSTRING}" (the site's verbatim template). Found ${rows.length}. At the fork this is 0: the bug-0422 route (c) note is rowless under the per-variant matrix.\nTable rows now present:\n${matrixRowDump()}`,
    ).toBe(1);
  });

  it("cell 2 (RED-now) — a group-B partition sentence admits the parse-namespaced diagnostic routed as a non-panic operator-facing note", () => {
    // The render-fail note reuses `rendered.diagnostic`, which is
    // parse-namespaced (`theta/parse/interpolated-result`), yet is routed as a
    // NON-panic operator-facing note. At the fork the group-B prose splits: the
    // runtime-panics bullet names the parse-namespaced exception but scopes it
    // to top-level-panic routing (no "operator-facing"), and the BNDR-9 bullet
    // names operator-facing-note routing but only for `theta/runtime/*` (no
    // "parse"). No single line combines the parse-namespaced code with
    // NON-panic operator-facing-note routing, so this class is admitted by no
    // sentence.
    const admitting = groupBRegionLines().filter(
      (l) =>
        /operator-facing/i.test(l.text) &&
        /(theta\/parse\/|parse-namespaced)/i.test(l.text) &&
        /(non-panic|not a top-level panic|rather than (a )?top-level panic)/i.test(
          l.text,
        ),
    );
    expect(
      admitting.length,
      `cell 2 (bug 0452 §Fix, Option 2 — add a group-B partition sentence): at least one group-B region line must reference BOTH the parse-namespaced code (\`theta/parse/interpolated-result\` / "parse-namespaced") AND non-panic operator-facing-note routing. Found ${admitting.length}. At the fork no such sentence exists — the runtime-panics bullet names the parse code but panic-routes it, and the BNDR-9 bullet names operator-facing-note routing but only for \`theta/runtime/*\`.\nGroup-B region now present:\n${groupBRegionLines().map((l) => `  line ${l.line}: ${l.text.slice(0, 160)}`).join("\n")}`,
    ).toBeGreaterThanOrEqual(1);
  });

  it("cell 3 (RED-now) — the site's verbatim refusal template ships at the emission site AND is pinned by exactly one matrix row content cell", () => {
    // (a) Loud precondition: the emission site must still ship the verbatim
    // template. If bug 0452 is fixed by moving the content (Option 1) instead
    // of the adjudicated Option 2, this precondition catches it and fails loudly
    // rather than letting the cell pass vacuously.
    const producer = readCorpus(PRODUCER);
    if (!producer.includes(REFUSAL_TEMPLATE_PHRASE)) {
      throw new Error(
        `harness precondition unmet: ${PRODUCER} no longer ships the verbatim render-fail content template "${REFUSAL_TEMPLATE_PHRASE}" — the code↔doc tie bug 0452 §Fix (Option 2, shipped bytes KEPT) pins has no code end to anchor to; this is a loud failure, never a skip`,
      );
    }
    // (b) The code↔doc tie: exactly one matrix row's CONTENT cell carries the
    // full verbatim template, so a future site-invented content divergence reds.
    // At the fork the phrase is in the producer but in zero matrix rows.
    const pinningRows = perVariantMatrixRows().filter((row) =>
      (row.cells[2] ?? "").includes(REFUSAL_TEMPLATE_PHRASE),
    );
    expect(
      pinningRows.length,
      `cell 3 (bug 0452 §Fix witness — code↔doc tie): the verbatim template "${REFUSAL_TEMPLATE_PHRASE}" ships at ${PRODUCER} and must be pinned by EXACTLY ONE per-variant matrix row content cell. Found ${pinningRows.length} matching row(s). At the fork it is in the producer but in zero matrix rows.\nTable rows now present:\n${matrixRowDump()}`,
    ).toBe(1);
  });

  // =========================================================================
  // GREEN-control cells. Green at the fork AND after the fix — they lock the
  // boundaries the new row must not breach.
  // =========================================================================

  it("cell 4 (GREEN-control) — the panic matrix row keeps its b0265 substring, unstolen and unduplicated by the new row", () => {
    const panicRows = perVariantMatrixRows().filter((row) =>
      row.text.includes(PANIC_ROW_SELECTOR),
    );
    expect(
      panicRows.length,
      `cell 4 (b0265 byte-stability invariant, bug 0452 §Fix Option 2 constraint "the new line must not contain \`runtime panic (single-element batch\`"): exactly one matrix row must keep the substring "${PANIC_ROW_SELECTOR}". Found ${panicRows.length} — a new row that steals or duplicates the panic row's locator breaches the b0265 gate.\nMatching rows:\n${panicRows.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(1);
  });

  it("cell 5 (GREEN-control) — the b0434 serialised-content operator-facing note class still selects exactly one row", () => {
    // The new prose-content render-fail row must not perturb the b0434 count:
    // exactly one row selects the `details: { diagnostics` shape AND
    // operator-facing-note routing, is not the panic row, and pins the
    // SERIALISED-line content (`serialised` + the literal `<code>: <message>`).
    // The render-fail row's content carries the "refusing to spawn" prose and
    // "(<code>)", not "<code>: <message>" or "serialised", so it never enters
    // this count.
    const serialisedRows = perVariantMatrixRows().filter((row) => {
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
    });
    expect(
      serialisedRows.length,
      `cell 5 (bug 0434 count preserved — the new render-fail row must not perturb it): exactly one matrix row must select the \`details: { diagnostics\` shape AND operator-facing-note routing, not be the panic row, and pin the serialised \`<code>: <message>\` content (not the BNDR-9 "${FAILURE_TEMPLATE_PHRASE}" template, not the \`aborted:\` panic framing). Found ${serialisedRows.length}.\nMatching rows:\n${serialisedRows.map((r) => `  line ${r.line}: ${r.text.slice(0, 160)}`).join("\n") || "  (none)"}`,
    ).toBe(1);
  });
});
