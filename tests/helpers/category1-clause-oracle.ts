import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../../tools/code-registry/index.js";

// The category-1 conformance oracle, shared.
//
// WHY THIS FILE EXISTS. Bug 0247 says the corpus states no rendering rule for a
// static type the parse layer did not determine, and that two engine producers
// render one anyway: the withheld-binder sentinel (`array<<withheld>>`) and
// `#typeExpr`'s fabrications (`index`, `object`). The witness for a prose defect
// is the oracle's gap, so the scorer has to range over BOTH producers' rows —
// they live in two test files
// (tests/index-sentinel-typeenv-case-fence.test.ts and
// tests/withheld-sentinel-mooting-and-render-pins.test.ts), so the scorer lives
// here rather than as a private copy in either.
//
// WHY THE ADMITTED TOKENS ARE READ FROM THE SPEC PAGE AND NOT LISTED HERE.
// `readAdmittedStandInTokens` parses the closed table out of
// `docs/spec_topics/diagnostics/placeholder-rendering-a.md` category 1. That is
// what makes a sixth engine-fabricated name red without anyone remembering to
// add a row to a test: the token either stands in the spec page's closed table
// or it is an offender. A hardcoded list here would move the closure into
// `tests/**`, where DIAG-2's same-commit discipline does not reach it. Until the
// table exists the read fails loudly naming the missing anchor — which is bug
// 0247's red witness, and is the whole point of reading rather than listing.
//
// The scorer's semantics are bug 0135's, moved unchanged from
// tests/index-sentinel-typeenv-case-fence.test.ts, with one added parameter: a
// token in `admitted` is conformant. A caller passing `EMPTY_ADMITTED` gets the
// pre-0247 behaviour byte-for-byte.
//
// TIER: unit, offline, deterministic, provider-free. Every function here reads a
// committed file or a string; nothing crosses a provider and nothing is stubbed.
//
// NO SILENT SKIPPING: every unmet precondition — a missing registry row, a
// reworded template, an absent spec table, an empty admitted set — fails loudly
// naming itself. Nothing early-returns and nothing falls back to a default.

/** A parsed row of the sharded code registry, as `parseRegistry` yields it. */
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The six placeholders category 1 governs (placeholder-rendering-a.md:17). */
export const CATEGORY1_PLACEHOLDERS: ReadonlySet<string> = new Set([
  "<type>",
  "<expected>",
  "<actual>",
  "<left>",
  "<right>",
  "<element>",
]);

/**
 * The admitted-token set a caller passes to score against the seven original
 * clauses alone (placeholder-rendering-a.md:21–27), with no stand-in admitted.
 */
export const EMPTY_ADMITTED: ReadonlySet<string> = new Set<string>();

/**
 * The five source-grammar primitive spellings category 1 admits
 * (placeholder-rendering-a.md:21).
 */
const PRIMITIVES: ReadonlySet<string> = new Set([
  "string",
  "integer",
  "number",
  "boolean",
  "null",
]);

const PLACEHOLDER_RENDERING_A = "docs/spec_topics/diagnostics/placeholder-rendering-a.md";

/** The category-1 subsection's own heading, and the boundary the scan stops at. */
const CATEGORY1_HEADING = "### 1. Static-type placeholders";

/** The header cell that identifies the closed stand-in table among the page's tables. */
const STAND_IN_HEADER_CELL = "Rendered token";

/** The token the table must carry whatever else it admits (bug 0247 §Fix). */
const WITHHELD_TOKEN = "<withheld>";

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The cells of one markdown table row, outer delimiters dropped. */
function rowCells(line: string): string[] {
  const trimmed = line.trim();
  return trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|");
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|?\s*$/.test(line.trim());
}

/**
 * The lines of category 1's subsection: from its own heading to the next `### `
 * heading. Scoping the table scan this way is what keeps category 3's closed
 * token-name table and category 7's closed value tables out of the result.
 */
function category1Lines(page: string): string[] {
  const lines = page.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === CATEGORY1_HEADING);
  expect(
    start,
    `bug 0247 anchor: ${PLACEHOLDER_RENDERING_A} must carry the "${CATEGORY1_HEADING}" subsection heading, or the closed stand-in table has no scope to be read from`,
  ).toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").startsWith("### ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

/**
 * The closed set of stand-in tokens category 1 admits for a static type the
 * parse layer did not determine, read from the first column of the closed table
 * inside the category-1 subsection of `placeholder-rendering-a.md`.
 *
 * The table's shape is the contract: a header row whose first cell is
 * `Rendered token`, a separator row, then body rows whose first cell is one
 * backticked token. A body row's remaining cells are prose and are not read.
 *
 * Until the table exists this fails, naming the missing anchor. That failure is
 * bug 0247's witness: the page states no clause for the bytes the renderer
 * already emits.
 */
export function readAdmittedStandInTokens(): ReadonlySet<string> {
  const page = readFileSync(
    fileURLToPath(new URL(`../../${PLACEHOLDER_RENDERING_A}`, import.meta.url)),
    "utf8",
  );
  const lines = category1Lines(page);

  const headerIndex = lines.findIndex(
    (line) => isTableRow(line) && (rowCells(line)[0] ?? "").trim() === STAND_IN_HEADER_CELL,
  );
  expect(
    headerIndex,
    `bug 0247 §Fix — ${PLACEHOLDER_RENDERING_A} category 1 ("${CATEGORY1_HEADING}") carries NO closed table of undetermined-static-type tokens: no table row in that subsection has "${STAND_IN_HEADER_CELL}" as its first cell. Category 1's Rule states seven clauses, all presupposing a determined static type, so the bytes the withheld-binder sentinel and #typeExpr's fabrications already render are admitted by no clause and this oracle has no clause list to score them against`,
  ).toBeGreaterThanOrEqual(0);

  const separator = lines[headerIndex + 1] ?? "";
  expect(
    isSeparatorRow(separator),
    `bug 0247 §Fix — the "${STAND_IN_HEADER_CELL}" table in ${PLACEHOLDER_RENDERING_A} category 1 must carry a markdown separator row directly under its header; found ${JSON.stringify(separator)}`,
  ).toBe(true);

  const tokens = new Set<string>();
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!isTableRow(line)) break;
    const first = (rowCells(line)[0] ?? "").trim();
    const backticked = /^`([^`]+)`$/.exec(first);
    expect(
      backticked,
      `bug 0247 §Fix — every body row of the "${STAND_IN_HEADER_CELL}" table must carry exactly one backticked token in its first cell; found ${JSON.stringify(first)}`,
    ).not.toBeNull();
    tokens.add((backticked as RegExpExecArray)[1] as string);
  }

  expect(
    [...tokens],
    `bug 0247 §Fix — the "${STAND_IN_HEADER_CELL}" table in ${PLACEHOLDER_RENDERING_A} category 1 must carry at least one body row, or the clause admits nothing and the oracle scores against an empty closure`,
  ).not.toEqual([]);
  expect(
    tokens.has(WITHHELD_TOKEN),
    `bug 0247 §Fix — the closed table must admit \`${WITHHELD_TOKEN}\`, the withheld-binder sentinel (\`WITHHELD_BINDER_TYPE_NAME\`, src/parser/type-compat.ts) that four E rows already render; admitted=${JSON.stringify([...tokens])}`,
  ).toBe(true);

  return tokens;
}

/** Split on `separator` at bracket depth 0 only, so nested forms stay whole. */
export function splitTopLevel(rendered: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < rendered.length; i += 1) {
    const ch = rendered[i];
    if (ch === "<" || ch === "{") depth += 1;
    else if (ch === ">" || ch === "}") depth -= 1;
    else if (depth === 0 && rendered.startsWith(separator, i)) {
      parts.push(rendered.slice(start, i));
      i += separator.length - 1;
      start = i + 1;
    }
  }
  parts.push(rendered.slice(start));
  return parts;
}

/**
 * The tokens in `rendered` that no clause of category 1
 * (placeholder-rendering-a.md:21–27) admits, treating every token in `admitted`
 * as conformant. The `named` clause (`:25`) fixes the identifier shape by
 * reference to lexical.md, whose `:15` requires an uppercase first letter for
 * every type-like binding — so a lowercase-initial name that is not a primitive
 * spelling and not an admitted stand-in is outside the closed clause list.
 *
 * A composite decomposes first, so an admitted stand-in inside `array<…>` or
 * `Result<…>` is reached through the existing clauses (`:24`, `:26`) rather than
 * matched whole.
 */
export function nonConformantTypeNames(rendered: string, admitted: ReadonlySet<string>): string[] {
  const t = rendered.trim();
  const arms = splitTopLevel(t, " | ");
  if (arms.length > 1) return arms.flatMap((arm) => nonConformantTypeNames(arm, admitted));
  if (t.startsWith("array<") && t.endsWith(">")) {
    return nonConformantTypeNames(t.slice("array<".length, -1), admitted);
  }
  if (t.startsWith("Result<") && t.endsWith(">")) {
    return splitTopLevel(t.slice("Result<".length, -1), ", ").flatMap((inner) =>
      nonConformantTypeNames(inner, admitted),
    );
  }
  if (t.startsWith("{") && t.endsWith("}")) {
    return splitTopLevel(t.slice(1, -1).trim(), ", ").flatMap((field) =>
      nonConformantTypeNames(field.slice(field.indexOf(":") + 1), admitted),
    );
  }
  // The eighth clause bug 0247 §Fix adds: a stand-in for a static type the parse
  // layer did not determine, admitted only by the page's own closed table.
  if (admitted.has(t)) return [];
  if (PRIMITIVES.has(t)) return [];
  // Literal types as their literal source (placeholder-rendering-a.md:22).
  if (/^"[^"]*"$/.test(t) || /^-?\d+(?:\.\d+)?$/.test(t) || t === "true" || t === "false") {
    return [];
  }
  // The `named` clause, shape fixed by lexical.md:13 + :15.
  if (/^[A-Z][A-Za-z0-9_]*$/.test(t)) return [];
  return [t];
}

/**
 * The registry template's placeholder fills, recovered from a rendered message.
 * The template is read from `registry` (DIAG-4, diagnostic-shape.md:74) and
 * turned into an anchored pattern with one capture per placeholder, so a
 * template reword fails the match and reds by naming the registry rather than
 * silently extracting nothing.
 */
export function fillsOf(
  registry: readonly RegistryRow[],
  code: string,
  message: string,
): ReadonlyArray<readonly [string, string]> {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  const t = template as string;
  const names: string[] = [];
  let pattern = "";
  let last = 0;
  const placeholder = /<[A-Za-z]+>/g;
  let hit: RegExpExecArray | null;
  while ((hit = placeholder.exec(t)) !== null) {
    pattern += escapeForRegExp(t.slice(last, hit.index));
    names.push(hit[0]);
    pattern += "(.+?)";
    last = hit.index + hit[0].length;
  }
  pattern += escapeForRegExp(t.slice(last));
  const matched = new RegExp(`^${pattern}$`).exec(message);
  expect(
    matched,
    `DIAG-4: the ${code} message must be the registry template with placeholders interpolated. template=${JSON.stringify(t)} message=${JSON.stringify(message)}`,
  ).not.toBeNull();
  const groups = matched as RegExpExecArray;
  return names.map((name, index) => [name, groups[index + 1] as string] as const);
}
