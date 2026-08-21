import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";

// ===========================================================================
// Bug 0200 — CTRL-4's three legacy `par for` body-restriction codes have no row
//            on the four sharded `code-registry-*.md` registry pages
// ===========================================================================
//
// SUBJECT. `theta/parse/par-query-in-body`, `theta/parse/par-shared-mutation`
// and `theta/parse/par-break-continue` are emitted by the parser (symbols
// `parseParFor` → `emitParForBodyDiagnostics` → `scanParForBlock` /
// `scanParForStmt` / `scanParForExpr` in src/parser/theta-document.ts — the
// `reassign` arm pushes `par-shared-mutation`, the `break` / `continue` arm
// pushes `par-break-continue` when `loopDepth === 0`, and the two `query` arms
// push `par-query-in-body`, all with `severity: "error"`), stated in CTRL-4
// prose (docs/spec_topics/control-flow.md:76, anchor `ctrl-4`), and tabulated
// in the four-column reference mirror (docs/reference/diagnostics.md:120-122) —
// but they have NO row on any of docs/spec_topics/diagnostics/code-registry-
// {parse,load,runtime,host}.md. The fourth CTRL-4 body-restriction code,
// `theta/parse/par-return-in-body`, does have a sharded row
// (code-registry-parse.md:77, landed by bug 0223); these three land at
// code-registry-parse.md:74-:76.
//
// SPEC ANCHORS.
//   * DIAG-1 (docs/spec_topics/diagnostics/diagnostic-shape.md:71) — every
//     author-visible diagnostic MUST carry a code "from the registry below".
//   * DIAG-2 (`:72`) — the registry is CLOSED; new diagnostic sites "MUST land
//     their codes in this table at the same time".
//   * DIAG-4 (`:74`) — the *Message* column is normative and a test asserting a
//     rendered message MUST source its string from that column.
//   * Column legend (`:78` anchor `column-legend`, `:80`) — normative for all
//     four tables; the registry is sharded by namespace, *Trigger* is "the
//     canonical condition", *Spec rule* "points to the topic page where the
//     rule is stated".
//   * CTRL-4 (docs/spec_topics/control-flow.md:76) — the only spec-corpus
//     statement of all three triggering conditions, and the *Spec rule* target
//     `../control-flow.md#ctrl-4` these rows owe.
//   * The four-page completeness claim (code-registry-parse.md:5) — the four
//     tables "together enumerate every diagnostic the V1 spec defines".
//
// THE DIAG-4 ORACLE. Every expected message string below is read through the
// shipped `parseRegistry` / `registryMessage` (tools/code-registry/index.js)
// over the four sharded pages, and interpolated in ONE pass where the template
// carries a placeholder — an unsupplied or unused placeholder throws (the same
// `fill` discipline as bug 0194's witness). Registry rows are cited by CODE,
// never by line. The four-column mirror is read only as the byte-for-byte
// COMPARAND of cell (r3), never as a fallback oracle: `parseRegistry` skips any
// row with fewer than five cells (tools/code-registry/index.js:36), so the
// mirror is invisible to it by construction and this file has no second rung.
//
// NO SILENT SKIPPING (CLAUDE.md). Nothing here early-returns, branches on the
// environment, or skips. A code with no sharded row fails LOUDLY naming the
// code and the four pages — that absence IS this file's subject, so every cell
// whose precondition is the row reds by throwing with the row named, never by
// passing while measuring nothing. Cells assert whole ordered lists against a
// `[]`- or literal-pin, so an absent row, a spurious extra row and a reordering
// all red.
//
// TIER: unit, offline, provider-free, deterministic. Both artifacts are
// committed files and the emissions settle inside one `parseThetaDocument`
// call, so no session, host or provider is reachable from the subject. An
// integration tier would add a load round-trip that observes neither a
// markdown table nor a parse-phase diagnostic list; a live tier would put a
// stochastic model between two static documents.
//
// CITATION POSTURE. `src/` is cited by SYMBOL (a par-for scan the fix does not
// touch still moves lines under any neighbouring edit); spec pages and the
// mirror by line; registry rows by code.
//
// RED AT THIS TREE / GREEN AFTER. Cell (r1) reds naming all three absent codes.
// Cells (r2)-(r5) red by their loud harness precondition (no sharded row).
// Cell (r6) reds on the mirror-only census residue. All six green once the
// three five-plus-column rows land on code-registry-parse.md between the
// `theta/parse/break-with-value` row (`:73`) and the
// `theta/parse/par-return-in-body` row (`:74`), spelling
// `par-query-in-body`'s *Message* with the outer single-backtick span and
// `\`` inner escapes that `theta/parse/empty-query-annotation`
// (code-registry-parse.md:81) already uses — §Fix Constraints 1, 2 and 5.
//
// PROTECTED NEIGHBOURS this file does not touch:
// tests/loop-element-withhold-binding-scoped.test.ts (bug 0194),
// tests/par-for.test.ts, tests/par-for-body-return-refusal.test.ts (bug 0223).

// ---------------------------------------------------------------------------
// The subject codes, in the row order the mirror already fixes (`:120`-`:122`).
// ---------------------------------------------------------------------------

const PAR_QUERY_IN_BODY = "theta/parse/par-query-in-body";
const PAR_SHARED_MUTATION = "theta/parse/par-shared-mutation";
const PAR_BREAK_CONTINUE = "theta/parse/par-break-continue";

const SUBJECT_CODES = [
  PAR_QUERY_IN_BODY,
  PAR_SHARED_MUTATION,
  PAR_BREAK_CONTINUE,
] as const;

// ---------------------------------------------------------------------------
// The sharded registry — the DIAG-2 closed set and the DIAG-4 message oracle.
// ---------------------------------------------------------------------------

/** The four sharded pages named by the column legend (diagnostic-shape.md:80). */
const REGISTRY_PAGES = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
] as const;

const REGISTRY_PAGE_LIST = REGISTRY_PAGES.map(
  (page) => `docs/spec_topics/diagnostics/${page}`,
).join(", ");

function readCorpus(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}

const REGISTRY_TEXT = REGISTRY_PAGES.map((page) =>
  readCorpus(`docs/spec_topics/diagnostics/${page}`),
).join("\n");

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as readonly RegistryRow[];

/**
 * PRECONDITION for the whole file: the shipped reader sees a populated closed
 * set. A registry that read as empty would make every cell below vacuously
 * green, so it fails loudly here instead.
 */
function assertRegistryReadable(): void {
  if (REGISTRY.length < 100) {
    throw new Error(
      `harness precondition unmet: parseRegistry read only ${REGISTRY.length} rows from ${REGISTRY_PAGE_LIST} — the closed registry (DIAG-2, diagnostic-shape.md:72) carries 200+, so the oracle itself is broken and no absence below would mean anything`,
    );
  }
}

/**
 * A code's sharded registry row, or a LOUD failure naming the code and the four
 * pages. This is bug 0200's subject, so the throw is the witness, never a skip.
 */
function shardedRow(code: string): RegistryRow {
  assertRegistryReadable();
  const row = REGISTRY.find((r) => r.code === code);
  if (row === undefined) {
    throw new Error(
      `harness precondition unmet: no registry row for ${code} on any of ${REGISTRY_PAGE_LIST} — DIAG-2 (diagnostic-shape.md:72) closes that registry and DIAG-4 (:74) makes its Message column this file's only oracle, so a missing row is a harness failure, never a skip. Bug 0200 §Fix owes that row on code-registry-parse.md between break-with-value (:73) and par-return-in-body (:74)`,
    );
  }
  return row;
}

/**
 * Interpolate a sharded row's *Message* template from `subs` in ONE pass. An
 * unsupplied placeholder and an unused substitution both throw, so a row that
 * lands with a different placeholder vocabulary fails loudly rather than
 * quietly producing a string no emission equals. (Shape mirrored from `fill`
 * in bug 0194's witness, tests/loop-element-withhold-binding-scoped.test.ts.)
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = shardedRow(code).message;
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness precondition unmet: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE_LIST})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness precondition unmet: this file substitutes ${token} into the ${code} Message, which does not carry it — the registry row changed shape (${REGISTRY_PAGE_LIST})`,
      );
    }
  }
  return message;
}

/**
 * The RAW sharded table row for `code`, split into trimmed cells — the reach
 * `parseRegistry` does not give: it exposes `trigger` as cells[3] and the
 * *Message* as the LAST cell, dropping *Spec rule* (cells[4]) and *Hint*
 * (cells[5]) that cell (r5) needs. Splitting is done here rather than by
 * widening tools/code-registry/index.js, which this file does not modify.
 */
function shardedCells(code: string): readonly string[] {
  assertRegistryReadable();
  const escaped = code.replace(/[/-]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`^\\|\\s*\`${escaped}\`\\s*\\|`);
  for (const line of REGISTRY_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!pattern.test(trimmed)) continue;
    return trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  }
  throw new Error(
    `harness precondition unmet: no table row starting \`${code}\` on any of ${REGISTRY_PAGE_LIST} — bug 0200's subject; the Spec rule column (diagnostic-shape.md:80) exists nowhere for this code`,
  );
}

// ---------------------------------------------------------------------------
// The four-column reference mirror — the COMPARAND of cell (r3), not an oracle.
// ---------------------------------------------------------------------------

/**
 * The transcription page (docs/reference/diagnostics.md:4-8) whose four-column
 * `| Code | Sev | Phase | Message |` table (`:55`) already carries the three
 * rows (`:120`-`:122`). Its Message cell is a code span, DOUBLED (``` `` ```)
 * where the message itself embeds one — which `par-query-in-body`'s
 * backtick-quoted `@` does.
 */
const MIRROR_PAGE = "docs/reference/diagnostics.md";
const MIRROR_TEXT = readCorpus(MIRROR_PAGE);

interface MirrorRow {
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

/** Decode a mirror Message cell: strip the doubled or single code-span fence. */
function decodeMirrorCell(cell: string): string {
  const trimmed = cell.trim();
  if (trimmed.startsWith("``") && trimmed.endsWith("``") && trimmed.length > 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length > 2) {
    return trimmed.slice(1, -1);
  }
  throw new Error(
    `harness precondition unmet: the ${MIRROR_PAGE} Message cell ${JSON.stringify(trimmed)} is not a code span — the page's Message column is normative under DIAG-4 (:6), so an unfenced cell is a harness failure`,
  );
}

function mirrorRow(code: string): MirrorRow {
  const escaped = code.replace(/[/-]/g, (c) => `\\${c}`);
  const pattern = new RegExp(`^\\|\\s*\`${escaped}\`\\s*\\|`);
  for (const line of MIRROR_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!pattern.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/);
    if (cells.length !== 4) {
      throw new Error(
        `harness precondition unmet: the ${MIRROR_PAGE} row for ${code} has ${cells.length} cells, not the four the page's header row (:55) declares`,
      );
    }
    return {
      severity: (cells[1] as string).trim(),
      phase: (cells[2] as string).trim(),
      message: decodeMirrorCell(cells[3] as string),
    };
  }
  throw new Error(
    `harness precondition unmet: ${MIRROR_PAGE} carries no row for ${code} — §Reproduction R2 measured it at :120-:122, so its absence means the comparand moved and this file cannot judge R7's round-trip`,
  );
}

/** Every code tabulated on the mirror, in page order. */
function mirrorCodes(): readonly string[] {
  const codes: string[] = [];
  for (const line of MIRROR_TEXT.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|\s*$/, "")
      .split(/(?<!\\)\|/);
    if (cells.length !== 4) continue;
    const match = (cells[0] as string).match(/`(theta\/[a-z0-9/_-]+)`/);
    if (match === null) continue;
    if (!codes.includes(match[1] as string)) codes.push(match[1] as string);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Parse harness — the production whole-file parser behind inert offline seams.
// Shape copied from tests/par-for-body-return-refusal.test.ts (bug 0223), not
// imported, per that file's own posture on tests/par-for.test.ts.
// ---------------------------------------------------------------------------

function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

function parse(src: string, path = "bug0200.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** `@`-query in a `par for` body → `par-query-in-body` (CTRL-4 clause 1). */
const SRC_QUERY = [
  "let xs = par for i in [1, 2] {",
  "  @`summarise`",
  "}",
  "xs",
].join("\n");

/** Assignment to an outer `let mut` → `par-shared-mutation` (CTRL-4 clause 2). */
const SRC_MUTATION = [
  "let mut total = 0",
  "let xs = par for i in [1, 2] {",
  "  total = i",
  "}",
  "xs",
].join("\n");

/** Bare `break` directly in the body → `par-break-continue` (CTRL-4 clause 3). */
const SRC_BREAK = [
  "let xs = par for i in [1, 2] {",
  "  break",
  "}",
  "xs",
].join("\n");

/**
 * The single diagnostic of `code` a fixture emits. A fixture that emitted none,
 * or more than one, fails loudly naming what it found — §Reproduction R4's
 * emission is the comparand of cell (r4), so a drifted fixture must never let
 * an absent row pass while measuring nothing.
 */
function soleMessage(src: string, code: string): string {
  const all = parse(src).diagnostics as readonly Diagnostic[];
  const hits = all.filter((d) => d.code === code);
  if (hits.length !== 1) {
    throw new Error(
      `harness precondition unmet: the fixture for ${code} emitted ${hits.length} diagnostics of that code, expected exactly 1 — the whole unfiltered list was ${JSON.stringify(all.map((d) => `${d.severity} ${d.code}`))}`,
    );
  }
  return (hits[0] as Diagnostic).message;
}

// ===========================================================================
// Cells.
// ===========================================================================

describe("bug 0200 — CTRL-4's three legacy `par for` body-restriction codes are registered on the sharded registry", () => {
  // (r1) DIAG-2 (diagnostic-shape.md:72) closes the registry over the four
  // sharded pages and code-registry-parse.md:5 claims they "together enumerate
  // every diagnostic the V1 spec defines". All three emitted codes must have a
  // row. Whole-list `[]` pin so the failure names every absent code at once.
  it("r1: DIAG-2 — each of the three codes has a row on the four sharded code-registry pages", () => {
    assertRegistryReadable();
    const present = new Set(REGISTRY.map((row) => row.code));
    const missing = SUBJECT_CODES.filter((code) => !present.has(code));
    expect(missing).toEqual([]);
  });

  // (r2) The column legend (diagnostic-shape.md:80) fixes the *Sev* / *Phase*
  // vocabulary; §Non-goals fixes the values: `E` / `parse` for all three, as
  // the mirror already records (:120-:122). Whole-list literal pin.
  it("r2: each row's Sev is `E` and Phase is `parse`", () => {
    const observed = SUBJECT_CODES.map(
      (code) => `${code} ${shardedRow(code).severity}/${shardedRow(code).phase}`,
    );
    expect(observed).toEqual([
      `${PAR_QUERY_IN_BODY} E/parse`,
      `${PAR_SHARED_MUTATION} E/parse`,
      `${PAR_BREAK_CONTINUE} E/parse`,
    ]);
  });

  // (r3) §Fix Constraint 5 / §Reproduction R7 — the round-trip. The sharded
  // Message cell must extract, through the shipped `extractMessage`
  // (tools/code-registry/index.js:74), BYTE-IDENTICALLY to the mirror's
  // already-normative cell (docs/reference/diagnostics.md:120-:122). This is
  // the cell that catches a naive transplant of the mirror's doubled-backtick
  // spelling for `par-query-in-body`, which mis-extracts with an extra leading
  // and trailing backtick-plus-space; the corpus form is the outer
  // single-backtick span with `\`` escapes that
  // `theta/parse/empty-query-annotation` (code-registry-parse.md:84) uses.
  it("r3: each row's extracted Message is byte-identical to the mirror's Message cell (R7 round-trip)", () => {
    const observed = SUBJECT_CODES.map((code) => {
      const sharded = registryMessage(REGISTRY, code) as string | undefined;
      const message = sharded === undefined ? shardedRow(code).message : sharded;
      return `${code} :: ${message}`;
    });
    expect(observed).toEqual(
      SUBJECT_CODES.map((code) => `${code} :: ${mirrorRow(code).message}`),
    );
  });

  // (r4) DIAG-4 (diagnostic-shape.md:74) — renderers emit the Message column
  // "character-for-character with placeholders interpolated". Drive the real
  // parser over the three CTRL-4 fixtures and compare each emission to the
  // registry template with `<name>` / `<keyword>` substituted. `fill` throws on
  // an unsupplied or unused placeholder, so a row landing with a different
  // vocabulary reds here rather than silently comparing the wrong string.
  it("r4: each row's Message template, interpolated, is byte-identical to what the parser emits", () => {
    const observed = [
      `${PAR_QUERY_IN_BODY} :: ${soleMessage(SRC_QUERY, PAR_QUERY_IN_BODY)}`,
      `${PAR_SHARED_MUTATION} :: ${soleMessage(SRC_MUTATION, PAR_SHARED_MUTATION)}`,
      `${PAR_BREAK_CONTINUE} :: ${soleMessage(SRC_BREAK, PAR_BREAK_CONTINUE)}`,
    ];
    expect(observed).toEqual([
      `${PAR_QUERY_IN_BODY} :: ${fill(PAR_QUERY_IN_BODY, new Map())}`,
      `${PAR_SHARED_MUTATION} :: ${fill(PAR_SHARED_MUTATION, new Map([["<name>", "total"]]))}`,
      `${PAR_BREAK_CONTINUE} :: ${fill(PAR_BREAK_CONTINUE, new Map([["<keyword>", "break"]]))}`,
    ]);
  });

  // (r5) The column legend (diagnostic-shape.md:80) defines *Spec rule* as the
  // pointer to "the topic page where the rule is stated"; CTRL-4
  // (control-flow.md:76, anchor `ctrl-4`) is the only spec-corpus statement of
  // all three conditions (§Fix Constraint 2), and the fourth body-restriction
  // row already points there (code-registry-parse.md:77). *Spec rule* is the
  // 5th column, which `parseRegistry` does not expose — read off the raw row.
  it("r5: each row's Spec rule cell points at the CTRL-4 anchor `../control-flow.md#ctrl-4`", () => {
    const observed = SUBJECT_CODES.map((code) => {
      const cells = shardedCells(code);
      if (cells.length < 7) {
        throw new Error(
          `harness precondition unmet: the ${code} row has ${cells.length} cells, fewer than the seven the sharded header row declares (code-registry-parse.md:9) — Spec rule is cells[4]`,
        );
      }
      return `${code} :: ${(cells[4] as string).includes("../control-flow.md#ctrl-4")}`;
    });
    expect(observed).toEqual(SUBJECT_CODES.map((code) => `${code} :: true`));
  });

  // (r6) The two-way census (§Reproduction R5): after the fix, no subject code
  // is mirror-only. Asserted as the intersection of the mirror-only residue
  // with the three codes, so the opposite-direction residue
  // (`theta/runtime/non-object-receiver`, on the shards and not the mirror —
  // §Non-goals) is deliberately not judged here.
  it("r6: two-way census — none of the three codes is mirror-only", () => {
    assertRegistryReadable();
    const sharded = new Set(REGISTRY.map((row) => row.code));
    const mirrorOnly = mirrorCodes().filter((code) => !sharded.has(code));
    const subjectMirrorOnly = mirrorOnly.filter((code) =>
      (SUBJECT_CODES as readonly string[]).includes(code),
    );
    expect(subjectMirrorOnly).toEqual([]);
  });
});
