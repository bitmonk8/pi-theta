// V7b — Diagnostic code registry and closing gate.
//
// This module IS the machine-checkable diagnostic registry the `H5a` closing
// gate consumes: a structured parse of the four sharded registry tables
// (`loom/parse/*`, `loom/load/*`, `loom/runtime/*`, `loom/host/*`) into one row
// per code carrying its namespace / severity / phase / trigger / message, plus
// the closed-set (DIAG-2) and stable-id (DIAG-3) enforcement, and the
// Message-column-normative lookup (DIAG-4) that asserting tests source their
// expected strings from.
//
// ── V7b STATUS: IMPLEMENTED ───────────────────────────────────────────────────
// The paired V7b implementation fills in the four exports the V7b-T tests pin:
// the structured registry parse (`parseRegistry`), the Message-column lookup
// (`registryMessage`), and the closed-set (`reconcileClosedSet`) / stable-id
// (`reconcileStableIds`) reconciliations the H5a gate consumes.
//
// Findings shape (mirrors the H5a closing gate): { kind, subject, detail }.
//   - asserted-code-not-in-registry  : a test asserts a code with no registry row (DIAG-2)
//   - registry-code-no-asserting-test: a registry code no test asserts (DIAG-2)
//   - code-renamed                   : a baseline (stable) code absent from the
//                                      current registry — a rename, deferred to
//                                      loom 2.0 (DIAG-3)

/**
 * Parse the diagnostics registry markdown (the concatenated four sharded
 * tables) into one structured row per code.
 *
 * @param {string} _text concatenated registry-table markdown
 * @returns {{code: string, namespace: string, severity: string, phase: string, trigger: string, message: string}[]}
 */
export function parseRegistry(text) {
  const rows = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const cells = splitTableRow(line);
    if (cells == null || cells.length < 5) continue;
    const codeMatch = cells[0].match(/`(loom\/[a-z0-9/_-]+)`/);
    if (codeMatch == null) continue;
    const code = codeMatch[1];
    if (seen.has(code)) continue; // first row wins; the registry has no dup codes
    seen.add(code);
    const slash = code.indexOf("/", "loom/".length);
    const namespace = code.slice("loom/".length, slash);
    rows.push({
      code,
      namespace,
      severity: cells[1],
      phase: cells[2],
      trigger: cells[3],
      message: extractMessage(cells[cells.length - 1]),
    });
  }
  return rows;
}

// Split a markdown table body row into trimmed, table-escape-decoded cells, or
// null when the line is not a body row (non-`|` lines and `|---|` separators).
// Pipes escaped as `\|` (the GFM table-cell escape) do NOT split the row.
function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  if (/^\|[\s:|-]+\|?\s*$/.test(trimmed)) return null; // separator row
  const inner = trimmed.replace(/^\|/, "").replace(/\|\s*$/, "");
  return inner
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

// Extract a row's normative *Message* string (DIAG-4) from its last cell. The
// message is backtick-delimited; take the span between the first and last
// backtick so a runtime row's trailing `.` outside the span is dropped, then
// decode the table-cell backtick escape (`\\\`` → backtick) used where a message
// embeds a code span.
function extractMessage(cell) {
  const first = cell.indexOf("`");
  const last = cell.lastIndexOf("`");
  const body = first >= 0 && last > first ? cell.slice(first + 1, last) : cell;
  return body.replace(/\\`/g, "`");
}

/**
 * Look up a code's normative *Message* column string in a parsed registry.
 *
 * @param {{code: string, message: string}[]} _registry parsed registry rows
 * @param {string} _code the diagnostic code to resolve
 * @returns {string | undefined} the normative message string, or undefined when absent
 */
export function registryMessage(registry, code) {
  return registry.find((row) => row.code === code)?.message;
}

/**
 * Closed-set enforcement (DIAG-2): reconcile the asserted code set against the
 * machine-checkable registry, in both directions.
 *
 * @param {{registry: {code: string}[], assertedCodes: string[]}} _input
 * @returns {{kind: string, subject: string, detail: string}[]}
 */
export function reconcileClosedSet({ registry, assertedCodes }) {
  const registrySet = new Set(registry.map((row) => row.code));
  const assertedSet = new Set(assertedCodes);
  const findings = [];
  for (const code of assertedCodes) {
    if (!registrySet.has(code)) {
      findings.push({
        kind: "asserted-code-not-in-registry",
        subject: code,
        detail: `test asserts diagnostic code ${code} absent from the registry`,
      });
    }
  }
  for (const row of registry) {
    if (!assertedSet.has(row.code)) {
      findings.push({
        kind: "registry-code-no-asserting-test",
        subject: row.code,
        detail: `registry code ${row.code} has no asserting test`,
      });
    }
  }
  return findings;
}

/**
 * Stable-id enforcement (DIAG-3): a registered code is a stable identifier, so
 * a code present in the pinned baseline but absent from the current registry is
 * a rename — deferred to loom 2.0 — and fails the gate.
 *
 * @param {{currentCodes: string[], baselineCodes: string[]}} _input
 * @returns {{kind: string, subject: string, detail: string}[]}
 */
export function reconcileStableIds({ currentCodes, baselineCodes }) {
  const currentSet = new Set(currentCodes);
  const findings = [];
  for (const code of baselineCodes) {
    if (!currentSet.has(code)) {
      findings.push({
        kind: "code-renamed",
        subject: code,
        detail: `baseline code ${code} is absent from the current registry — a rename, deferred to loom 2.0 (DIAG-3)`,
      });
    }
  }
  return findings;
}
