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
    const prefix = cells[cells.length - 1].trim();
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
    for (const m of stripped.matchAll(re)) found.add(`${m[1]}-${m[2]}`);
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
