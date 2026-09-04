import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// b0404 — the custom-type-unsafe note's matrix-row oracle.
//
// Bug 0404 (docs/bugs/0404-custom-type-unsafe-note-pairing-outside-variant-matrix.md)
// records a spec gap on a single page: two normative surfaces in
// docs/spec_topics/pi-integration-contract/runtime-event-channel.md disagree
// about the BNDR-9 custom-type-unsafe note. The group-B partition bullet
// classifies the note's structured half as a single-element `theta/runtime/*`
// diagnostics batch (an operator-facing note, not a top-level panic), while the
// four-shape `details: { diagnostics }` bullet and the per-variant `display` /
// `content` matrix enumerate only two content pairings for diagnostics-shaped
// notes — serialised diagnostic lines, or the `aborted:` panic framing. The
// shipped note carries the failure-mode template
// `theta /<name>: custom-message type is not transcript-safe: '<value>'`,
// which fits neither: rowless under the panic row's label, over-matched (with
// the wrong content mandate) under its parenthetical.
//
// THE SETTLED FIX this file scores, from bug 0404 §Fix (three additive edits to
// runtime-event-channel.md, no runtime behaviour moves):
//   (1) a third content case in the four-shape `details: { diagnostics }`
//       bullet for the operator-facing-note routing, paired with the
//       failure-mode template;
//   (2) a new per-variant matrix row selecting the single-element registered
//       `theta/runtime/*` diagnostic routed as an operator-facing note (the
//       BNDR-9 custom-type-unsafe rejection), display `true`, content = the
//       failure-mode template;
//   (3) one narrowing clause on the existing panic matrix row scoping it to the
//       top-level-panic framing (excluding the note the new row now claims).
//
// The fix ADDS a matrix row, shifting every downstream line number on the page.
// So — like the sibling b0265 oracle whose byte-stability pins this fix must
// move additively — every site here is located BY CONTENT over a flattened run,
// never by a hard-coded line index. Derived line numbers appear in failure
// messages only, where they are recomputed from the tree on every run.
//
// Two directions:
//
//   RED-now cells go GREEN after the fix. They assert the specified behaviour
//   (the matrix row exists; the four-shape bullet enumerates the third case;
//   the panic row is narrowed), not the fork's behaviour.
//
//   GREEN-control cells are green at the fork AND after the fix. They lock the
//   b0265-pinned invariants the additive edits must not disturb, so a fix that
//   drops the panic row's parse-namespaced qualifier, its errors-and-results
//   cross-reference, the four-shape bullet's single-line shape, or the group-B
//   classification bullet reds here.
//
// Spec anchors (every line re-derived against this tree):
//   - runtime-event-channel.md line 22 — the four-shape
//     `details: { diagnostics: Diagnostic[] }` payload bullet.
//   - runtime-event-channel.md line 27 — the "Per-variant `display` / `content`
//     pairings (normative)" table header.
//   - runtime-event-channel.md line 32 — the per-variant panic matrix row keyed
//     "runtime panic (single-element batch, `theta/runtime/*` code …)".
//   - runtime-event-channel.md line 60 — the group-B bullet classifying the
//     BNDR-9 custom-type-unsafe note (`theta/runtime/custom-type-unsafe`,
//     `alwaysLogGroup`).

const repoFile = (rel: string): string =>
  fileURLToPath(new URL(`../${rel}`, import.meta.url));

/**
 * Read a corpus file. A missing or empty file is a HARNESS failure that names
 * the unmet precondition and throws — never a skip, never an early return, so
 * an absent page cannot let a cell pass vacuously (the b0265 `readCorpus`
 * pattern this file mirrors).
 */
function readCorpus(rel: string): string {
  let text: string;
  try {
    text = readFileSync(repoFile(rel), "utf8");
  } catch (cause) {
    throw new Error(
      `harness precondition unmet: ${rel} is unreadable, and it is this oracle's only source for the bug 0404 surface it owns — a missing corpus file is a loud failure, never a skip (${String(cause)})`,
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

/**
 * The panic matrix row's b0265-pinned locator: the b0265 gate finds this row by
 * this exact substring under an exactly-one-match precondition, so the fix's
 * new row MUST NOT carry it. Reusing the same predicate here keeps the two
 * oracles agreeing on which row is the panic row.
 */
const PANIC_ROW_SELECTOR = "runtime panic (single-element batch";

/** The failure-mode template the shipped note (and BNDR-9) pairs its content to. */
const FAILURE_TEMPLATE_PHRASE = "custom-message type is not transcript-safe";

/** Half (a) of the b0265 requalification the panic row must keep. */
const PARSE_NAMESPACED_QUALIFIER =
  /theta\/parse\/interpolated-result|parse-namespaced/;

/** Half (b): the cross-reference to the page that owns the runtime-panics rule. */
const ERRORS_AND_RESULTS_XREF = /errors-and-results\.md/;

interface Site {
  /** What the site is, for the failure message. */
  readonly what: string;
  /** 1-based line number, re-derived on every run. */
  readonly line: number;
  /** The site's own text, flattened. */
  readonly text: string;
}

/**
 * Locate one site by content. Exactly one match is required: zero means the
 * page moved out from under the cell (a loud harness failure, since a
 * silently-absent site would score vacuously), and more than one means the
 * predicate no longer identifies a single line.
 */
function locateSite(
  what: string,
  matches: (line: string) => boolean,
): Site {
  const lines = linesOf(readCorpus(RUNTIME_EVENT_CHANNEL));
  const hits: Site[] = [];
  lines.forEach((line, index) => {
    if (matches(line))
      hits.push({ what, line: index + 1, text: flatten(line) });
  });
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries ${hits.length} lines matching the ${what} site, expected exactly one — bug 0404 §Fix names this site, so a cell that cannot find it must fail loudly rather than pass vacuously${hits.length > 1 ? ` (found at lines ${hits.map((h) => h.line).join(", ")})` : ""}`,
    );
  }
  return hits[0] as Site;
}

interface MatrixRow extends Site {
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
      `harness precondition unmet: ${RUNTIME_EVENT_CHANNEL} carries no "Per-variant … pairings (normative)" table header — the matrix bug 0404 extends cannot be located, so the matrix cells would score vacuously`,
    );
  }
  const rows: MatrixRow[] = [];
  let i = headerIdx + 1;
  while (i < lines.length && (lines[i] ?? "").trim() === "") i += 1;
  for (; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    if (raw.startsWith("|")) {
      rows.push({
        what: "per-variant matrix row",
        line: i + 1,
        text: flatten(raw),
        cells: tableCells(raw),
      });
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

/** The four-shape `details: { diagnostics }` bullet (single physical line). */
function fourShapeDiagnosticsBullet(): Site {
  return locateSite(
    "four-shape `details: { diagnostics: Diagnostic[] }` payload bullet",
    (l) =>
      l.startsWith("- `details: { diagnostics: Diagnostic[] }`") &&
      l.includes("runtime-panic case"),
  );
}

/** The panic matrix row, located by the b0265-shared selector. */
function panicMatrixRow(): Site {
  return locateSite(
    "per-variant panic matrix row",
    (l) => l.startsWith("|") && l.includes(PANIC_ROW_SELECTOR),
  );
}

/** The group-B classification bullet 0398 added for the custom-type-unsafe note. */
function groupBOperatorNoteBullet(): Site {
  return locateSite(
    "group-B operator-facing-note classification bullet",
    (l) =>
      l.startsWith(
        "- Registered `theta/runtime/*` diagnostics routed as operator-facing notes",
      ),
  );
}

describe("bug 0404 — the custom-type-unsafe operator-facing note gets a per-variant matrix row and a four-shape content case", () => {
  // =========================================================================
  // RED-at-fork cells. Bug 0404 §Fix makes these green.
  // =========================================================================

  it("cell 1 (RED-now) — the per-variant matrix carries exactly one operator-facing-note row for the BNDR-9 custom-type-unsafe rejection, paired to the failure-mode template", () => {
    const rows = perVariantMatrixRows();
    // The row bug 0404 §Fix item 2 adds: a NON-panic selector naming the
    // operator-facing-note / custom-type-unsafe (BNDR-9) case, display `true`,
    // content = the failure-mode template. Scored on the row's own cells so a
    // selector match cannot borrow a display/content from a sibling row.
    const matching = rows.filter((row) => {
      const [selector = "", display = "", content = ""] = row.cells;
      return (
        !row.text.includes(PANIC_ROW_SELECTOR) &&
        /operator-facing note/i.test(selector) &&
        /custom-type-unsafe|BNDR-9/i.test(selector) &&
        content.includes(FAILURE_TEMPLATE_PHRASE) &&
        display.includes("true")
      );
    });
    expect(
      matching.length,
      `cell 1 (bug 0404 §Fix item 2 — "the matching matrix row"): the per-variant table must carry EXACTLY ONE \`|\`-row that (a) is not the panic row, (b) selects the single-element registered \`theta/runtime/*\` diagnostic routed as an operator-facing note (the BNDR-9 custom-type-unsafe rejection), (c) pairs display \`true\` to the failure-mode template "${FAILURE_TEMPLATE_PHRASE}". Found ${matching.length}. The shipped note (production-theta-producer.ts #emitCustomTypeUnsafeNote) fits no other row; at the fork it is rowless.\nTable rows now present:\n${rows.map((r) => `  line ${r.line}: ${r.text.slice(0, 140)}`).join("\n")}`,
    ).toBe(1);
  });

  it("cell 2 (RED-now) — the four-shape `details: { diagnostics }` bullet enumerates the operator-facing-note content case with the failure-mode template", () => {
    const bullet = fourShapeDiagnosticsBullet();
    expect(
      /operator-facing note/i.test(bullet.text) &&
        bullet.text.includes(FAILURE_TEMPLATE_PHRASE),
      `cell 2 (bug 0404 §Fix item 1 — "a third content case in the four-shape \`details: { diagnostics }\` bullet for a registered \`theta/runtime/*\` diagnostic routed as an operator-facing note (BNDR-9 custom-type-unsafe) whose content is the failure-mode template"): the bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must name the operator-facing-note case AND the failure-mode template "${FAILURE_TEMPLATE_PHRASE}". At the fork it enumerates only the parse/load/type serialisation and the runtime-panic \`aborted:\` framing. Bullet head: ${bullet.text.slice(0, 320)}`,
    ).toBe(true);
  });

  it("cell 3 (RED-now) — the panic matrix row is narrowed to the top-level-panic framing, excluding the operator-facing note the new row claims", () => {
    const row = panicMatrixRow();
    expect(
      /top-level panic|not an operator-facing note/i.test(row.text),
      `cell 3 (bug 0404 §Fix item 3 — "one narrowing parenthetical on the runtime-panic row scoping it to the panic framing"): the panic row at ${RUNTIME_EVENT_CHANNEL} line ${row.line} must carry a narrowing marker (e.g. "top-level panic") scoping it away from the operator-facing note. At the fork its parenthetical selector over-matches the single-element \`theta/runtime/*\` custom-type-unsafe note and mandates the wrong content. Row: ${row.text.slice(0, 320)}`,
    ).toBe(true);
  });

  // =========================================================================
  // GREEN-control cells. Green at the fork AND after the fix — they lock the
  // b0265 invariants the additive edits must not disturb.
  // =========================================================================

  it("cell 4 (GREEN-control) — the panic matrix row keeps its b0265 selector, parse-namespaced qualifier, and errors-and-results cross-reference", () => {
    const row = panicMatrixRow();
    expect(
      row.text.includes(PANIC_ROW_SELECTOR),
      `cell 4 (b0265 cell A invariant): the panic row at ${RUNTIME_EVENT_CHANNEL} line ${row.line} must keep the substring "${PANIC_ROW_SELECTOR}" — the b0265 gate locates it by that exact phrase. Row: ${row.text.slice(0, 200)}`,
    ).toBe(true);
    expect(
      PARSE_NAMESPACED_QUALIFIER.test(row.text),
      `cell 4 (b0265 cell A invariant — qualify the one parse-namespaced panic): the panic row at ${RUNTIME_EVENT_CHANNEL} line ${row.line} must keep its \`theta/parse/interpolated-result\` / parse-namespaced qualifier. Row: ${row.text.slice(0, 320)}`,
    ).toBe(true);
    expect(
      ERRORS_AND_RESULTS_XREF.test(row.text),
      `cell 4 (b0265 cell A invariant — cross-reference the Runtime panics section): the panic row at ${RUNTIME_EVENT_CHANNEL} line ${row.line} must keep its errors-and-results.md cross-reference. Row: ${row.text.slice(0, 320)}`,
    ).toBe(true);
  });

  it("cell 5 (GREEN-control) — the four-shape `details: { diagnostics }` bullet stays a single physical line naming the runtime-panic case and its errors-and-results cross-reference", () => {
    // locateSite already enforces exactly-one-line — the single-physical-line
    // invariant the b0265 gate depends on — so reaching this body proves it.
    const bullet = fourShapeDiagnosticsBullet();
    expect(
      bullet.text.includes("runtime-panic case"),
      `cell 5 (b0265 cell A invariant): the four-shape bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must keep "runtime-panic case" — the b0265 gate locates it by \`startsWith\` + that phrase. Bullet head: ${bullet.text.slice(0, 200)}`,
    ).toBe(true);
    expect(
      ERRORS_AND_RESULTS_XREF.test(bullet.text),
      `cell 5 (b0265 cell A invariant): the four-shape bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must keep its errors-and-results.md cross-reference. Bullet head: ${bullet.text.slice(0, 320)}`,
    ).toBe(true);
  });

  it("cell 6 (GREEN-control) — the group-B bullet still classifies the custom-type-unsafe note under the shipped `alwaysLogGroup` partition", () => {
    const bullet = groupBOperatorNoteBullet();
    expect(
      bullet.text.includes("theta/runtime/custom-type-unsafe"),
      `cell 6 (bug 0404 §Non-goals — the group-B classification does not move): the bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must keep classifying \`theta/runtime/custom-type-unsafe\` as group B. Bullet head: ${bullet.text.slice(0, 320)}`,
    ).toBe(true);
    expect(
      bullet.text.includes("alwaysLogGroup"),
      `cell 6 (bug 0404 §Non-goals): the bullet at ${RUNTIME_EVENT_CHANNEL} line ${bullet.line} must keep naming the shipped \`alwaysLogGroup\` partition it mirrors. Bullet head: ${bullet.text.slice(0, 320)}`,
    ).toBe(true);
  });
});
