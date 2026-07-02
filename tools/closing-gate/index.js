// H5a — REQ-ID / diagnostic-code closing-gate automation.
//
// This module IS the closing gate that reconciles the spec REQ-ID set and the
// diagnostics code registry against the plan's coverage-matrix and the
// asserting tests, operationalising conventions.md *REQ-ID discipline* and
// *Diagnostic message anchors* and the coverage-matrix.md closure obligation.
//
// The gate is a PURE reconciliation over an in-memory corpus snapshot:
// `runClosingGate(corpus)` returns a structured findings collection — one entry
// per gap, each tagged with the gap KIND it represents — and never throws or
// mutates global state. The caller decides the disposition: at H5a the gate is
// evaluated against the seeded fixtures under the dedicated test-fixtures root
// (`test-fixtures/closing-gate/`, outside docs/spec_topics/** and outside the
// live vitest corpus), green against the no-violation fixture and non-empty
// against each seeded violation fixture this leaf owns. The warn-only canary
// (H5b) consumes the returned collection; the hard-fail release-gate footing
// (H6a) raises the non-zero npm-test exit status over the live corpus. Neither
// the live-corpus gating footing nor the warn-only live wiring is built here.
//
// Gap KINDS this gate recognises (Adds. enumeration):
//   - unmapped-executable-req-id     : a spec REQ-ID with no coverage-matrix row
//   - mapped-req-id-no-citing-test   : a coverage-matrix-mapped numbered REQ-ID
//                                      with no test citing it inline
//   - registry-code-no-asserting-test: a registry code with no asserting test
//   - asserted-code-not-in-registry  : a test asserts a code absent from registry
//   - retired-live-id-clash          : a REQ-ID present in both live and retired
//   - per-prefix-numbering-hole      : an n ≤ max(live∪retired) neither live nor
//                                      retired for a prefix the corpus owns
//   - broad-catch-allow-list-unresolved: a `// allow-broad-catch:` entry whose
//                                      cited token resolves to none of the four
//                                      admitted arms (H5c)
//   - transitive-completeness-unreachable: a coverage-matrix closing-leaf cell
//                                      none of whose listed leaves is in H5b's
//                                      expanded `Deps.` membership (H5d)
//   - un-anchored-must-unenumerated  : an un-anchored normative MUST on a non-
//                                      narrative spec page with no Code-keyed
//                                      obligation-areas row enumerating it (H5e)
//   - un-anchored-must-new-placeholder: an un-anchored MUST mapped only to a
//                                      `<new>` placeholder coverage-matrix row
//                                      that names no real closing leaf (H5e)
//   - un-anchored-must-unresolved-leaf: an un-anchored MUST whose enumerating
//                                      row's closing-leaf token resolves to no
//                                      real plan leaf ID (a typo like V99z) (H5e)
//   - un-rowed-page-residue           : a non-hub-stub spec_topics/**-shaped
//                                      page absent from the prefix table (H5e)
//   - per-facet-citing-test-missing  : a facet leaf of a multi-leaf coverage-
//                                      matrix row carries no facet-naming citing
//                                      test — a test citing BOTH the row's
//                                      subject (the numbered REQ-ID, or the
//                                      `cka-<n>` Token for a code-keyed row) and
//                                      that facet's closing-leaf-ID inline (H5f)
//
// H5e — un-anchored normative-MUST text-scan arm. A best-effort MUST/MUST-NOT
// token scan over the non-narrative spec pages, spanning three sub-recognisers
// (facets of one scan, not separate arms): the un-enumerated-MUST recogniser,
// the `<new>`-placeholder-MUST recogniser, and the un-rowed-page recogniser. A
// spec page is non-narrative — and thus in scope — iff its prefix-table row's
// cell is NOT the byte-exact `(no IDs — narrative)` literal (GOV-3); a page
// absent from the table altogether is an un-rowed-page residue defect unless it
// is a GOV-24 table-of-contents hub stub (a page whose stem matches a trailing-
// slash subtree row). For each in-scope page carrying an un-anchored MUST (a
// paragraph holding a MUST token but neither a `PREFIX-N` REQ-ID nor a
// `loom/...` registry code), the page MUST be enumerated in the coverage-
// matrix's *Code-keyed obligation areas (no numbered REQ-IDs)* table by a row
// whose closing-leaf cell resolves to a real plan leaf ID. A `<new>` literal
// names no real leaf (placeholder); any other non-resolving token (V99z) is a
// defect. The arm runs only when the corpus supplies `planLeavesText` (the real
// plan leaf-ID universe); the H5a/H5c/H5d fixtures omit it and are unaffected.
// Like the H5a surfaces it is exercised against the seeded fixtures here and
// first binds against the live spec corpus at the H6a release-gate activation.
//
// H5f — per-facet citing-test arm. For every coverage-matrix row whose *Closing
// leaf(s)* cell lists two or more leaves — across BOTH the *Numbered REQ-IDs*
// table and the *Code-keyed obligation areas (no numbered REQ-IDs)* table — the
// arm derives the row's FACET PARTITION from the cell alone by the rule the
// release-time residue inspection item 7 / coverage-matrix.md *Multi-leaf-row
// per-facet citing tests* convention fixes: a listed leaf whose immediately-
// following parenthetical annotation contains the literal token `co-witness` is
// dropped, and every remaining listed leaf is a FACET of the row's obligation.
// It then asserts each remaining facet carries its own FACET-NAMING CITING TEST
// — a test source citing BOTH the row's subject inline (the numbered REQ-ID for
// a *Numbered REQ-IDs* row, or the `cka-<n>` *Token* for a *Code-keyed
// obligation areas* row) and that facet's closing-leaf-ID inline — and reddens
// on any remaining facet with no such citing test in the corpus. Like the H5a
// per-REQ-ID citing-test scan it is a BEST-EFFORT inline-citation EXISTENCE scan:
// it certifies a facet-naming citing test exists for each facet, not that the
// cited test's assertion is semantically faithful to the facet's obligation —
// that per-facet faithfulness stays a TDD / self-review and release-time residue
// (item 7) obligation. The arm reuses the existing backtick-delimited leaf-ID
// tokens as facet keys and adds no token to the closing-leaf cell. It runs only
// when the corpus sets `perFacetCitingTests`; the H5a/H5c/H5d/H5e fixtures leave
// it unset and are unaffected. Like the other live-corpus surfaces it is
// exercised against the seeded fixtures here and first binds against the live
// test corpus at the H6a release-gate activation.
//
// H5d — transitive-completeness plan-structural arm. For every row in the
// coverage-matrix's *Numbered REQ-IDs* and *Code-keyed obligation areas (no
// numbered REQ-IDs)* tables, the arm reads ONLY that row's right-hand closing-
// leaf cell, tokenises it by its backtick-delimited spans (each `…` span is one
// leaf-ID token), and requires AT LEAST ONE of those leaf IDs to be a member of
// H5b's `Deps.` after expanding both sides' contiguous within-group
// `<group><letter>` ranges (e.g. `V2a`–`V2d` → V2a, V2b, V2c, V2d). A cell none
// of whose listed leaves is in that expanded set is a CI failure. The arm
// excludes the two recognised empty-tokenising cell forms whose content is
// EXACTLY the literal `<new>` placeholder or the literal `*(numbered above)*`
// retirement marker; any other cell (including a mis-authored un-delimited
// single-leaf cell tokenising empty) is subject to the at-least-one check. It is
// a per-cell AT-LEAST-ONE test — a multi-leaf (primary + co-witness) cell stays
// green as long as one listed leaf is present — so it cannot catch an omitted
// secondary facet-closer (that residue is surfaced by H5b's canary and the
// release-time residue inspection). The arm runs only when the corpus supplies
// `h5bDepsText`; the H5a/H5c seeded fixtures omit it and are unaffected.
//
// H5c — `no-broad-catch` allow-list closing-gate reconciliation arm. The gate
// scans the `// allow-broad-catch:` comments across `src/**` (the lint allow-
// list conventions.md *Specific exception types only* defines) as its entries;
// every entry's cited token MUST resolve to one of the four arms that rule's
// predicate admits: a coverage-matrix REQ-ID, a *Code-keyed obligation areas
// (no numbered REQ-IDs)* row's canonical `cka-<n>` token (resolving iff it
// matches exactly one such row's *Token* cell), a concrete `loom/...`
// diagnostics-registry code present in the registry (never a glob/wildcard
// family — the resolver matches no wildcard), or the structural
// `pi-sdk-boundary` token. An entry resolving to none is a CI failure, on the
// same seeded-fixture-then-live-corpus footing as the H5a surfaces; the live-
// corpus binding flips at H6a.
//
// The `loom/typecheck/*` build-time `tsc` brand-string prefix is NOT a
// diagnostics-registry code and is excluded from registry reconciliation on
// both sides (registry-code-no-asserting-test and asserted-code-not-in-registry).
//
// The citing-test reconciliation is a best-effort scan for the inline `PREFIX-N`
// citation across the test sources: it certifies that a citing test EXISTS for
// each mapped REQ-ID, not that the cited test's assertion is semantically
// faithful to the obligation — faithfulness stays a TDD / self-review obligation.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Prefixes that govern the spec corpus itself rather than runtime behaviour and
// so are NOT executable spec REQ-IDs (conventions.md *REQ-ID discipline*).
const NON_EXECUTABLE_PREFIXES = new Set(["GOV"]);

// Per-ID non-executable carve-out: *terminology* REQ-IDs whose obligation is a
// spec-prose naming discipline, not a runtime/parse/load obligation. Their
// prefixes (FRNT, SUBS) also anchor real runtime REQ-IDs, so a per-PREFIX
// exclusion would be wrong — the carve-out is per-ID. This set mirrors the
// governance record on `governance/req-id-prefix-table-active-b.md`
// (*Terminology REQ-IDs (non-executable)*) and the conventions.md *REQ-ID
// discipline* "terminology REQ-ID (non-executable)" class, exactly as
// NON_EXECUTABLE_PREFIXES mirrors the GOV-* corpus-governance carve-out; it is
// spec-backed, not a bare hardcode. Each cited ID's spec anchor states "purely
// terminology": FRNT-2 (callable-set terminology), FRNT-3 (`.loom`-callable
// terminology), SUBS-2 (schema-slug terminology).
const NON_EXECUTABLE_REQ_IDS = new Set(["FRNT-2", "FRNT-3", "SUBS-2"]);

// The build-time tsc brand-string namespace, excluded from registry
// reconciliation on both sides (conventions.md *REQ-ID discipline* carve-out).
const TYPECHECK_PREFIX = "loom/typecheck/";

// ── Markdown exclusion stripping (GOV-3) ──────────────────────────────────────
// Before REQ-ID extraction, strip fenced code blocks, HTML comments, and inline
// code spans, in that order, so a REQ-ID inside any of them is invisible.
function stripMarkdownExclusions(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/`[^`\n]*`/g, "");
}

// ── Prefix table + retirement parsing ─────────────────────────────────────────
// Parse the governance prefix table (`| Page | Prefix |` rows) into the live
// prefix set, and the `## Retired REQ-IDs` section into the retired-ID set.
export function parsePrefixTable(text) {
  const prefixes = new Set();
  const lines = text.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (/^\s*##\s+REQ-ID prefix table/i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\s*##\s+/.test(line)) inTable = false;
    if (!inTable) continue;
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 2) continue;
    // The live prefix table delimits its Prefix cell in backticks
    // (`| `lexical.md` | `LEX` |`); the seeded fixtures use the bare form
    // (`| foo.md | FOO |`). Strip backticks so both parse identically, mirroring
    // the backtick strip parsePrefixTablePages already applies to the Page cell.
    const prefix = cells[cells.length - 1].replace(/`/g, "").trim();
    if (/^[A-Z]{2,4}$/.test(prefix)) prefixes.add(prefix);
  }
  return [...prefixes];
}

export function parseRetiredReqIds(text) {
  const retired = new Set();
  const lines = text.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (/^\s*##\s+Retired REQ-IDs/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\s*##\s+/.test(line)) inSection = false;
    if (!inSection) continue;
    for (const id of line.match(/\b[A-Z]{2,4}-[1-9][0-9]*\b/g) ?? []) {
      retired.add(id);
    }
  }
  return [...retired];
}

// Split a markdown table row `| a | b |` into trimmed cells, or null if the line
// is not a table body row (header separators `|---|` are rejected).
function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  if (/^\|[\s:|-]+\|?\s*$/.test(trimmed)) return null; // separator row
  const inner = trimmed.replace(/^\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.trim());
}

// ── Spec REQ-ID extraction (GOV-3) ────────────────────────────────────────────
// Distinct `PREFIX-N` tokens over the exclusion-stripped spec sources, keyed to
// the live prefix set, excluding the non-executable governance family.
export function extractReqIds(sources, prefixes) {
  const executable = prefixes.filter((p) => !NON_EXECUTABLE_PREFIXES.has(p));
  if (executable.length === 0) return [];
  const re = new RegExp(`\\b(${executable.join("|")})-([1-9][0-9]*)\\b`, "g");
  const found = new Set();
  for (const src of sources) {
    const stripped = stripMarkdownExclusions(src.text);
    for (const m of stripped.matchAll(re)) {
      const id = `${m[1]}-${m[2]}`;
      if (NON_EXECUTABLE_REQ_IDS.has(id)) continue; // terminology REQ-ID — non-executable
      found.add(id);
    }
  }
  return [...found];
}

// ── Coverage-matrix parsing ───────────────────────────────────────────────────
// Parse the `| REQ-ID | Closing leaf(s) |` rows, expanding each `X-n … X-m`
// inclusive range, into the set of mapped REQ-IDs. Retired interior IDs are
// excluded from the citing-test obligation set by the caller (see runClosingGate).
// ── Code-keyed-area token parsing (H5c) ───────────────────────────────────────
// Parse the *Code-keyed obligation areas (no numbered REQ-IDs)* table's leading
// *Token* column into a frequency map of `cka-<n>` tokens. A token resolves for
// the broad-catch allow-list arm iff it matches exactly one row's *Token* cell
// (count === 1); a bare prefix or a token appearing in no row never resolves.
export function parseCkaTokens(text) {
  const counts = new Map();
  for (const line of text.split("\n")) {
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 1) continue;
    const m = cells[0].match(/`(cka-[1-9][0-9]*)`/);
    if (m == null) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return counts;
}

export function parseCoverageMatrix(text) {
  const mapped = new Set();
  for (const line of text.split("\n")) {
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 2) continue;
    const leftCell = cells[0];
    // Header row guard: the left cell of the header literally reads "REQ-ID".
    if (/^REQ-ID$/i.test(leftCell)) continue;
    for (const id of expandReqIdSpec(leftCell)) mapped.add(id);
  }
  return [...mapped];
}

// Expand a coverage-matrix left-cell REQ-ID spec into concrete IDs. Handles a
// `X-n … X-m` / `X-n ... X-m` inclusive contiguous range and comma-separated
// single IDs; mixed forms in one cell are each handled by their own segment.
function expandReqIdSpec(cell) {
  const out = [];
  const rangeRe = /\b([A-Z]{2,4})-([1-9][0-9]*)\s*(?:…|\.\.\.)\s*([A-Z]{2,4})-([1-9][0-9]*)\b/;
  for (const seg of cell.split(",")) {
    const piece = seg.trim();
    const range = piece.match(rangeRe);
    if (range != null && range[1] === range[3]) {
      const prefix = range[1];
      const lo = Number(range[2]);
      const hi = Number(range[4]);
      for (let n = lo; n <= hi; n++) out.push(`${prefix}-${n}`);
      continue;
    }
    const single = piece.match(/\b([A-Z]{2,4}-[1-9][0-9]*)\b/);
    if (single != null) out.push(single[1]);
  }
  return out;
}

// ── Transitive-completeness parsing (H5d) ─────────────────────────────────────
// Expand a span of plan prose into the set of leaf IDs it names, expanding each
// contiguous within-group `<group><letter>` range whose two backtick-delimited
// endpoints share the same `<group>` over its contiguous letter suffixes (e.g.
// `V2a`–`V2d` → V2a, V2b, V2c, V2d), and taking every other backtick-delimited
// leaf-ID span as a singleton (including a no-letter singleton such as `M`).
// Only backtick-delimited spans are read; surrounding prose is ignored.
export function expandLeafTokens(text) {
  const out = new Set();
  const rangeRe = /`([A-Z]+[0-9]+)([a-z])`\s*[\u2013\u2014-]\s*`([A-Z]+[0-9]+)([a-z])`/g;
  // Consume ranges first so their endpoints are not re-counted as singletons.
  const remainder = text.replace(rangeRe, (_full, g1, l1, g2, l2) => {
    if (g1 === g2) {
      for (let c = l1.charCodeAt(0); c <= l2.charCodeAt(0); c++) {
        out.add(`${g1}${String.fromCharCode(c)}`);
      }
    } else {
      // Cross-group range is not a contiguous within-group range: keep both
      // endpoints rather than silently inventing intermediate IDs.
      out.add(`${g1}${l1}`);
      out.add(`${g2}${l2}`);
    }
    return " ";
  });
  for (const m of remainder.matchAll(/`([A-Z]+[0-9]*[a-z]?)`/g)) out.add(m[1]);
  return out;
}

// Parse H5b's `Deps.` field into its expanded leaf-ID membership. Reads only the
// `**Deps.**` paragraph (up to the next blank line) so leaf IDs cited elsewhere
// in the H5b page's prose are not admitted, then expands per `expandLeafTokens`.
export function parseH5bDeps(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\*\*Deps\.\*\*/.test(lines[i])) continue;
    let para = lines[i].replace(/^\s*\*\*Deps\.\*\*/, "");
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ""; j++) {
      para += `\n${lines[j]}`;
    }
    return expandLeafTokens(para);
  }
  return new Set();
}

// The two literal empty-tokenising cell forms the arm excludes from the at-least-
// one check: the `<new>` placeholder and the `*(numbered above)*` retirement
// marker. Recognised by EXACT trimmed cell content — a mis-authored un-delimited
// single-leaf cell is NOT excluded and tokenises empty into a (spurious) failure.
const EXCLUDED_CLOSING_LEAF_CELLS = new Set(["<new>", "*(numbered above)*"]);

// Parse the right-hand *Closing leaf(s)* cell of every row in the coverage
// matrix's *Numbered REQ-IDs* and *Code-keyed obligation areas (no numbered
// REQ-IDs)* tables. Scoped by `##` section heading so the *Governance REQ-IDs*
// table (and any other section) is not read. The closing-leaf cell is the LAST
// cell of each row; the header row (last cell literally `Closing leaf(s)`) is
// skipped. Returns the raw trimmed cell strings, in document order.
export function parseClosingLeafCells(text) {
  const cells = [];
  let inScope = false;
  for (const line of text.split("\n")) {
    const heading = line.match(/^\s*##\s+(.*)$/);
    if (heading != null) {
      inScope =
        /Numbered REQ-IDs/i.test(heading[1]) ||
        /Code-keyed obligation areas/i.test(heading[1]);
      continue;
    }
    if (!inScope) continue;
    const row = parseTableRow(line);
    if (row == null || row.length < 2) continue;
    const last = row[row.length - 1].trim();
    if (/^Closing leaf\(s\)$/i.test(last)) continue; // header row
    cells.push(last);
  }
  return cells;
}

// ── Per-facet citing-test parsing (H5f) ───────────────────────────────────────
// Derive a closing-leaf cell's facet partition from the cell ALONE (no recourse
// to the coverage-matrix closure-rationale prose), by the rule the release-time
// residue inspection item 7 fixes. Walk the cell left-to-right; each backtick-
// delimited leaf-ID span is a LISTED leaf, and the parenthetical that
// immediately follows it (if any) is its annotation. A leaf whose immediately-
// following parenthetical contains the literal `co-witness` token is dropped
// from the facet set; every other listed leaf (bare or carrying a non-co-witness
// facet annotation) is a FACET. Returns { listed, facets } as ordered arrays.
//
// Limitation (documented, not exercised by any live closing-leaf cell): a
// within-group range form `` `V2a`–`V2d` `` keeps only its two backtick
// endpoints as listed leaves and does not expand the interior; real multi-leaf
// closing-leaf cells are comma-separated singletons, never ranges.
export function deriveFacetPartition(cell) {
  const listed = [];
  const facets = [];
  const re = /`([A-Z]+[0-9]*[a-z]?)`\s*(?:\(([^)]*)\))?/g;
  let m;
  while ((m = re.exec(cell)) !== null) {
    const leaf = m[1];
    listed.push(leaf);
    const paren = m[2];
    if (paren != null && /\bco-witness\b/.test(paren)) continue; // co-witness — dropped
    facets.push(leaf);
  }
  return { listed, facets };
}

// Parse the coverage matrix's two obligation tables into one entry per body row:
// { subjects, closing }. For a *Numbered REQ-IDs* row the subjects are the
// expanded REQ-IDs of the left cell (a range / comma list expands per
// `expandReqIdSpec`); for a *Code-keyed obligation areas* row the subject is the
// single `cka-<n>` *Token* cell. The *Governance* and any other section is out
// of scope, and the header rows (last cell `Closing leaf(s)`) are skipped.
export function parseFacetRows(text) {
  const rows = [];
  let section = null; // "numbered" | "cka" | null
  for (const line of text.split("\n")) {
    const heading = line.match(/^\s*##\s+(.*)$/);
    if (heading != null) {
      // Code-keyed is tested first: its heading literally contains the phrase
      // "no numbered REQ-IDs", which would otherwise match the Numbered branch.
      if (/Code-keyed obligation areas/i.test(heading[1])) section = "cka";
      else if (/Numbered REQ-IDs/i.test(heading[1])) section = "numbered";
      else section = null;
      continue;
    }
    if (section == null) continue;
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 2) continue;
    const last = cells[cells.length - 1].trim();
    if (/^Closing leaf\(s\)$/i.test(last)) continue; // header row
    if (section === "numbered") {
      if (/^REQ-ID$/i.test(cells[0].trim())) continue; // header row
      const subjects = expandReqIdSpec(cells[0]);
      if (subjects.length === 0) continue;
      rows.push({ subjects, closing: last });
    } else {
      const tok = cells[0].match(/`(cka-[1-9][0-9]*)`/);
      if (tok == null) continue;
      rows.push({ subjects: [tok[1]], closing: last });
    }
  }
  return rows;
}

// True iff `token` is cited inline anywhere in `text`, matched on word
// boundaries so a leaf-ID / REQ-ID / cka-token is not a substring of a larger
// identifier. The token is regex-escaped before use.
export function citesTokenInline(text, token) {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`).test(text);
}

// ── Un-anchored-MUST text-scan parsing (H5e) ──────────────────────────────────
// The byte-exact narrative-cell literal (GOV-3). A prefix-table row whose cell
// is EXACTLY this string classifies its page as pure-narrative and out of the
// un-anchored-MUST scan's scope; any other cell is non-narrative and in scope.
const NARRATIVE_CELL = "(no IDs — narrative)";

// Parse the governance prefix table into a per-page classification map plus the
// subtree-binding map (trailing-slash `Page` cells). A page row's `Page` cell is
// the FIRST column (optionally backtick-delimited); the classification cell is
// the LAST column. A `Page` cell ending in `/` is a subtree binding (e.g.
// `binder/`), recorded in `subtrees` (its trailing slash stripped, keyed to its
// own `{ narrative }` classification) rather than as a single-file page. The
// subtree map serves two lookups: the GOV-24 hub-stub exclusion matches an un-
// rowed page's filename STEM against it, and a page nested inside a subtree-
// bound DIRECTORY is resolved through it (a page under `binder/` is rowed by the
// `binder/` subtree binding, not un-rowed). `.has(name)` behaves identically to
// the former Set for the stem-exclusion callers.
export function parsePrefixTablePages(text) {
  const pages = new Map(); // basename → { narrative: boolean }
  const subtrees = new Map(); // subtree directory name (no trailing slash) → { narrative }
  const lines = text.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (/^\s*##\s+REQ-ID prefix table/i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\s*##\s+/.test(line)) inTable = false;
    if (!inTable) continue;
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 2) continue;
    const pageCell = cells[0].replace(/`/g, "").trim();
    if (/^Page$/i.test(pageCell)) continue; // header row
    const classCell = cells[cells.length - 1].trim();
    if (pageCell.endsWith("/")) {
      subtrees.set(pageCell.replace(/\/$/, ""), {
        narrative: classCell === NARRATIVE_CELL,
      });
      continue;
    }
    pages.set(pageCell, { narrative: classCell === NARRATIVE_CELL });
  }
  return { pages, subtrees };
}

// Parse the coverage-matrix *Code-keyed obligation areas (no numbered REQ-IDs)*
// table into one entry per row: the set of `.md` page basenames its *Spec area*
// cell references, and the raw trimmed *Closing leaf(s)* cell. Scoped to that
// `##` section so the *Numbered REQ-IDs* / *Governance* tables are not read; the
// header row (last cell `Closing leaf(s)`) is skipped.
export function parseCkaAreaRows(text) {
  const rows = [];
  let inScope = false;
  for (const line of text.split("\n")) {
    const heading = line.match(/^\s*##\s+(.*)$/);
    if (heading != null) {
      inScope = /Code-keyed obligation areas/i.test(heading[1]);
      continue;
    }
    if (!inScope) continue;
    const cells = parseTableRow(line);
    if (cells == null || cells.length < 3) continue;
    const closing = cells[cells.length - 1].trim();
    if (/^Closing leaf\(s\)$/i.test(closing)) continue; // header row
    const areaCell = cells.slice(1, cells.length - 1).join(" ");
    const pages = new Set(
      [...areaCell.matchAll(/([A-Za-z0-9._-]+\.md)/g)].map((m) => m[1]),
    );
    rows.push({ pages, closing });
  }
  return rows;
}

// Parse a plan-leaf-ID universe snapshot (the fixture stand-in for the live
// `docs/plan_topics/` leaf-ID set) into the set of leaf IDs it lists, reading
// only its backtick-delimited spans via `expandLeafTokens`.
export function parsePlanLeaves(text) {
  return expandLeafTokens(text);
}

// Strip fenced code blocks and HTML comments (NOT inline code spans, so a
// `loom/...` registry code in backticks still anchors its obligation) before the
// MUST scan, mirroring the GOV-3 exclusion order for the constructs that can
// hide a MUST token.
function stripFencesAndComments(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

// True iff the page carries at least one un-anchored normative MUST: a blank-
// line-delimited paragraph holding a `MUST` token (covering `MUST` and
// `MUST NOT`) but neither a numbered `PREFIX-N` REQ-ID nor a non-typecheck
// `loom/...` registry code. Best-effort per conventions.md *REQ-ID discipline*:
// it cannot tell a normative MUST from one in narrative, an example, or a quote.
export function pageHasUnanchoredMust(text) {
  const scanned = stripFencesAndComments(text);
  for (const para of scanned.split(/\n\s*\n/)) {
    if (!/\bMUST\b/.test(para)) continue;
    if (/\b[A-Z]{2,4}-[1-9][0-9]*\b/.test(para)) continue; // PREFIX-N anchor
    const loom = para.match(/\bloom\/[a-z0-9/_-]+/);
    if (loom != null && !loom[0].startsWith(TYPECHECK_PREFIX)) continue; // loom code anchor
    return true;
  }
  return false;
}

// Classify a Code-keyed closing-leaf cell against the real plan leaf-ID universe.
// Returns "new-placeholder" for the literal bare `<new>` token, "resolved" when
// at least one backtick-delimited leaf token names a real plan leaf, and
// "unresolved" otherwise (a typo'd / non-existent leaf ID such as `V99z`).
export function classifyClosingCell(cell, planLeaves) {
  if (cell.trim() === "<new>") return "new-placeholder";
  const leaves = expandLeafTokens(cell);
  for (const id of leaves) {
    if (planLeaves.has(id)) return "resolved";
  }
  return "unresolved";
}

// ── Diagnostics-registry parsing ──────────────────────────────────────────────
// Distinct backtick-delimited `loom/...` codes in the registry sources,
// excluding the `loom/typecheck/*` build-time brand namespace.
export function parseRegistryCodes(text) {
  const codes = new Set();
  for (const m of text.matchAll(/`(loom\/[a-z0-9/_-]+)`/g)) {
    const code = m[1];
    if (code.startsWith(TYPECHECK_PREFIX)) continue;
    codes.add(code);
  }
  return [...codes];
}

// ── Test-corpus scans ─────────────────────────────────────────────────────────
// Distinct `loom/...` codes a test asserts (in any quote or backtick form),
// excluding the `loom/typecheck/*` brand namespace.
export function extractAssertedCodes(sources) {
  const codes = new Set();
  for (const src of sources) {
    for (const m of src.text.matchAll(/loom\/[a-z0-9/_-]+/g)) {
      const code = m[0];
      if (code.startsWith(TYPECHECK_PREFIX)) continue;
      codes.add(code);
    }
  }
  return [...codes];
}

// ── Broad-catch allow-list scan (H5c) ─────────────────────────────────────────
// Extract every `// allow-broad-catch: <token> — <spec-page>` comment across the
// (seeded or live) `src/**` sources as the allow-list entries. The cited token
// is the first whitespace-delimited span after the colon; a `loom/...` glob or
// wildcard family (e.g. `loom/host/session-shutdown-*`) is captured verbatim and
// later rejected by the resolver.
export function extractBroadCatchEntries(sources) {
  const entries = [];
  for (const src of sources) {
    const lines = src.text.split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/\/\/\s*allow-broad-catch:\s*(\S+)/);
      if (m != null) entries.push({ token: m[1], path: src.path, line: i + 1 });
    });
  }
  return entries;
}

// Resolve a cited broad-catch token against the four admitted arms. Returns true
// iff the token resolves; the `loom/...` arm matches only a concrete registry
// code (the `[a-z0-9/_-]` char class excludes `*`, so a glob/wildcard family
// never matches), and the `cka-<n>` arm resolves iff the token matches exactly
// one *Token* cell (count === 1).
function resolveBroadCatchToken(token, { mapped, ckaCounts, registryCodes }) {
  if (token === "pi-sdk-boundary") return true;
  if (/^[A-Z]{2,4}-[1-9][0-9]*$/.test(token)) return mapped.has(token);
  if (/^cka-[1-9][0-9]*$/.test(token)) return ckaCounts.get(token) === 1;
  if (/^loom\/[a-z0-9/_-]+$/.test(token)) return registryCodes.has(token);
  return false;
}

// Distinct `PREFIX-N` tokens cited inline anywhere in the test sources.
export function extractCitingReqIds(sources) {
  const ids = new Set();
  for (const src of sources) {
    for (const m of src.text.matchAll(/\b[A-Z]{2,4}-[1-9][0-9]*\b/g)) {
      ids.add(m[0]);
    }
  }
  return [...ids];
}

// ── The gate ──────────────────────────────────────────────────────────────────
/**
 * Reconcile a corpus snapshot and return one finding per gap.
 *
 * @param {{
 *   prefixTableText: string,
 *   specSources: {path: string, text: string}[],
 *   coverageMatrixText: string,
 *   registryText: string,
 *   testSources: {path: string, text: string}[],
 *   srcSources?: {path: string, text: string}[],
 *   h5bDepsText?: string,
 *   planLeavesText?: string,
 *   perFacetCitingTests?: boolean,
 * }} corpus
 * @returns {{kind: string, subject: string, detail: string}[]}
 */
export function runClosingGate(corpus) {
  const prefixes = parsePrefixTable(corpus.prefixTableText);
  const retired = new Set(parseRetiredReqIds(corpus.prefixTableText));
  const specReqIds = extractReqIds(corpus.specSources, prefixes);
  const mapped = new Set(parseCoverageMatrix(corpus.coverageMatrixText));
  const registryCodes = parseRegistryCodes(corpus.registryText);
  const assertedCodes = new Set(extractAssertedCodes(corpus.testSources));
  const citingReqIds = new Set(extractCitingReqIds(corpus.testSources));
  const ckaCounts = parseCkaTokens(corpus.coverageMatrixText);
  const registrySet = new Set(registryCodes);
  const broadCatchEntries = extractBroadCatchEntries(corpus.srcSources ?? []);

  const findings = [];

  // (1) Unmapped executable REQ-ID: a live spec REQ-ID with no coverage-matrix row.
  for (const id of specReqIds) {
    if (!mapped.has(id)) {
      findings.push({
        kind: "unmapped-executable-req-id",
        subject: id,
        detail: `spec REQ-ID ${id} has no coverage-matrix row`,
      });
    }
  }

  // (2) Mapped numbered REQ-ID with no citing test. The mapped set this arm
  // iterates is the matrix mappings intersected with the live executable set,
  // minus retired interior IDs (which carry no citing-test obligation).
  const executableSet = new Set(specReqIds);
  for (const id of mapped) {
    if (!executableSet.has(id)) continue; // mapping outside the live executable set
    if (retired.has(id)) continue; // retired interior ID: no citing-test obligation
    if (!citingReqIds.has(id)) {
      findings.push({
        kind: "mapped-req-id-no-citing-test",
        subject: id,
        detail: `coverage-matrix-mapped REQ-ID ${id} has no citing test in the test corpus`,
      });
    }
  }

  // (3) Registry code with no asserting test (loom/typecheck/* already excluded).
  for (const code of registryCodes) {
    if (!assertedCodes.has(code)) {
      findings.push({
        kind: "registry-code-no-asserting-test",
        subject: code,
        detail: `registry code ${code} has no asserting test`,
      });
    }
  }

  // (4) Asserted code absent from the registry (loom/typecheck/* already excluded).
  for (const code of assertedCodes) {
    if (!registrySet.has(code)) {
      findings.push({
        kind: "asserted-code-not-in-registry",
        subject: code,
        detail: `test asserts diagnostic code ${code} absent from the registry`,
      });
    }
  }

  // (5) Retired/live ID clash: a REQ-ID present in both the live spec set and
  // the retirement registry.
  for (const id of specReqIds) {
    if (retired.has(id)) {
      findings.push({
        kind: "retired-live-id-clash",
        subject: id,
        detail: `REQ-ID ${id} is both live in the spec and listed retired`,
      });
    }
  }

  // (5b) Broad-catch allow-list (H5c): a `// allow-broad-catch:` entry whose
  // cited token resolves to none of the four admitted arms (coverage-matrix
  // REQ-ID, exactly-one `cka-<n>` Token cell, concrete `loom/...` registry code,
  // or the structural `pi-sdk-boundary` token).
  for (const entry of broadCatchEntries) {
    if (!resolveBroadCatchToken(entry.token, { mapped, ckaCounts, registryCodes: registrySet })) {
      findings.push({
        kind: "broad-catch-allow-list-unresolved",
        subject: entry.token,
        detail: `// allow-broad-catch: token ${entry.token} resolves to none of the four admitted arms (coverage-matrix REQ-ID, cka-<n> token, concrete loom/... registry code, pi-sdk-boundary)`,
      });
    }
  }

  // (5c) Transitive-completeness (H5d): every coverage-matrix closing-leaf cell
  // must list at least one leaf reachable in H5b's expanded `Deps.` membership.
  // Runs only when the corpus supplies H5b's `Deps.` text; the `<new>` and
  // `*(numbered above)*` literal cells are excluded.
  if (corpus.h5bDepsText != null && corpus.h5bDepsText.trim() !== "") {
    const h5bDeps = parseH5bDeps(corpus.h5bDepsText);
    for (const cell of parseClosingLeafCells(corpus.coverageMatrixText)) {
      if (EXCLUDED_CLOSING_LEAF_CELLS.has(cell)) continue;
      const leaves = expandLeafTokens(cell);
      const reachable = [...leaves].some((id) => h5bDeps.has(id));
      if (!reachable) {
        findings.push({
          kind: "transitive-completeness-unreachable",
          subject: cell,
          detail: `closing-leaf cell "${cell}" lists no leaf present in H5b's expanded Deps. (tokenised: {${[...leaves].join(", ")}})`,
        });
      }
    }
  }

  // (5d) Un-anchored normative-MUST text-scan (H5e): reconcile the non-narrative
  // spec pages' un-anchored MUST/MUST-NOT obligations against the coverage-
  // matrix's *Code-keyed obligation areas* table, and redden un-rowed non-hub-
  // stub pages. Runs only when the corpus supplies the plan leaf-ID universe;
  // the H5a/H5c/H5d fixtures omit `planLeavesText` and leave this arm dormant.
  if (corpus.planLeavesText != null && corpus.planLeavesText.trim() !== "") {
    const planLeaves = parsePlanLeaves(corpus.planLeavesText);
    const { pages: prefixPages, subtrees } = parsePrefixTablePages(
      corpus.prefixTableText,
    );
    const ckaRows = parseCkaAreaRows(corpus.coverageMatrixText);
    for (const src of corpus.specSources) {
      const basename = path.basename(src.path);
      // Resolve the page's prefix-table row: an explicit single-file row keyed
      // by basename, else the subtree binding of its containing directory (a
      // page under `binder/` is rowed by the `binder/` subtree binding, GOV
      // subtree-binding semantics), so a nested page is neither un-rowed nor out
      // of the un-anchored-MUST scope.
      const row =
        prefixPages.get(basename) ??
        subtrees.get(path.basename(path.dirname(src.path)));
      if (row == null) {
        // Un-rowed page: in scope unless it is a GOV-24 hub stub (its filename
        // stem names a trailing-slash subtree row). Emit only the un-rowed
        // residue defect; the MUST-enumeration check needs a row to scope it.
        const stem = basename.replace(/\.md$/, "");
        if (subtrees.has(stem)) continue; // hub stub — excluded
        findings.push({
          kind: "un-rowed-page-residue",
          subject: basename,
          detail: `spec page ${basename} is absent from the prefix table and is not a GOV-24 hub stub`,
        });
        continue;
      }
      if (row.narrative) continue; // narrative page — out of scope
      if (!pageHasUnanchoredMust(src.text)) continue; // no un-anchored MUST
      const enumerating = ckaRows.filter((r) => r.pages.has(basename));
      if (enumerating.length === 0) {
        findings.push({
          kind: "un-anchored-must-unenumerated",
          subject: basename,
          detail: `un-anchored normative MUST on ${basename} has no Code-keyed obligation-areas row with a closing leaf`,
        });
        continue;
      }
      const classes = enumerating.map((r) => classifyClosingCell(r.closing, planLeaves));
      if (classes.includes("resolved")) continue; // enumerated with a real leaf
      findings.push(
        classes.includes("new-placeholder")
          ? {
              kind: "un-anchored-must-new-placeholder",
              subject: basename,
              detail: `un-anchored normative MUST on ${basename} maps only to a <new> placeholder row naming no real closing leaf`,
            }
          : {
              kind: "un-anchored-must-unresolved-leaf",
              subject: basename,
              detail: `un-anchored normative MUST on ${basename} maps only to a closing-leaf token resolving to no real plan leaf ID`,
            },
      );
    }
  }

  // (5e) Per-facet citing-test (H5f): for every multi-leaf coverage-matrix row
  // (across both obligation tables), derive its facet partition (dropping the
  // co-witness-annotated leaves) and require each remaining facet to carry a
  // facet-naming citing test — a test source citing BOTH the row's subject (a
  // numbered REQ-ID, or the `cka-<n>` token) and that facet's closing-leaf-ID
  // inline. Runs only when the corpus sets `perFacetCitingTests`; the other
  // arms' fixtures leave it unset and this arm stays dormant.
  if (corpus.perFacetCitingTests) {
    for (const row of parseFacetRows(corpus.coverageMatrixText)) {
      const { listed, facets } = deriveFacetPartition(row.closing);
      if (listed.length < 2) continue; // single-leaf row — out of per-facet scope
      for (const facet of facets) {
        const satisfied = corpus.testSources.some(
          (src) =>
            citesTokenInline(src.text, facet) &&
            row.subjects.some((subject) => citesTokenInline(src.text, subject)),
        );
        if (!satisfied) {
          findings.push({
            kind: "per-facet-citing-test-missing",
            subject: facet,
            detail: `facet leaf ${facet} of multi-leaf row [${row.subjects.join(", ")}] has no facet-naming citing test citing both the row subject and ${facet} inline`,
          });
        }
      }
    }
  }

  // (6) Per-prefix numbering hole: for each prefix the corpus owns, an integer
  // n ≤ max(live ∪ retired) that is neither live nor retired.
  for (const hole of numberingHoles(specReqIds, retired)) {
    findings.push({
      kind: "per-prefix-numbering-hole",
      subject: hole,
      detail: `${hole} is a per-prefix numbering hole (neither live nor retired)`,
    });
  }

  return findings;
}

function numberingHoles(liveIds, retiredSet) {
  const byPrefix = new Map();
  const record = (id) => {
    const m = id.match(/^([A-Z]{2,4})-([1-9][0-9]*)$/);
    if (m == null) return;
    if (!byPrefix.has(m[1])) byPrefix.set(m[1], new Set());
    byPrefix.get(m[1]).add(Number(m[2]));
  };
  for (const id of liveIds) record(id);
  for (const id of retiredSet) record(id);

  const holes = [];
  for (const [prefix, nums] of byPrefix) {
    const max = Math.max(...nums);
    for (let n = 1; n <= max; n++) {
      if (!nums.has(n)) holes.push(`${prefix}-${n}`);
    }
  }
  return holes;
}

// ── Corpus loader ─────────────────────────────────────────────────────────────
// Read a fixture scenario directory in the conventional closing-gate layout into
// the in-memory corpus snapshot `runClosingGate` consumes:
//
//   <dir>/governance.md       — prefix table + retirement sections
//   <dir>/spec/**/*.md        — spec pages (PREFIX-N anchors)
//   <dir>/coverage-matrix.md  — REQ-ID → closing-leaf mapping table
//   <dir>/registry.md         — diagnostics registry table(s)
//   <dir>/tests/**            — the (seeded or live) test corpus
//   <dir>/h5b-deps.md         — (H5d) H5b's `Deps.` field snapshot; absent in
//                               the H5a/H5c scenarios (arm stays dormant)
//   <dir>/h5f-enabled.md      — (H5f) marker enabling the per-facet citing-test
//                               arm for this scenario; absent elsewhere (dormant)
//
// At the live-corpus footing (H6a) the same loader is pointed at the live trees;
// the path selection MUST exclude the fixtures root so no seeded fixture is ever
// scanned as live coverage — that selection is the caller's responsibility.
export function loadCorpus(dir) {
  const read = (rel) => readFileSync(path.join(dir, rel), "utf8");
  return {
    prefixTableText: read("governance.md"),
    specSources: readTree(path.join(dir, "spec"), (f) => f.endsWith(".md")),
    coverageMatrixText: read("coverage-matrix.md"),
    registryText: readTree(path.join(dir, "registry"), (f) => f.endsWith(".md"))
      .map((s) => s.text)
      .join("\n") || readIfPresent(path.join(dir, "registry.md")),
    testSources: readTree(path.join(dir, "tests"), (f) => f.endsWith(".ts")),
    srcSources: readTree(path.join(dir, "src"), (f) => f.endsWith(".ts")),
    // H5d: H5b's `Deps.` snapshot. Absent in the H5a/H5c scenarios, which leaves
    // the transitive-completeness arm dormant for those fixtures.
    h5bDepsText: readIfPresent(path.join(dir, "h5b-deps.md")),
    // H5e: the real plan leaf-ID universe snapshot. Absent in the H5a/H5c/H5d
    // scenarios, which leaves the un-anchored-MUST arm dormant for those fixtures.
    planLeavesText: readIfPresent(path.join(dir, "plan-leaves.md")),
    // H5f: marker file presence enables the per-facet citing-test arm. Absent in
    // every other scenario, which leaves the per-facet arm dormant for them.
    perFacetCitingTests: existsSync(path.join(dir, "h5f-enabled.md")),
  };
}

function readIfPresent(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function readTree(dir, accept) {
  if (!existsSync(dir)) return [];
  const out = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...readTree(full, accept));
    } else if (accept(entry)) {
      out.push({ path: full, text: readFileSync(full, "utf8") });
    }
  }
  return out;
}
