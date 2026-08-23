import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0063 — the closed `<construct>` token-name table of
// docs/spec_topics/diagnostics/placeholder-rendering-a.md §3 has fifteen rows,
// all naming deferred or non-Theta node categories, and the shipped parser
// renders two `<construct>` values that are in no row: the statement loop's
// `stray '<t>' in statement position` (`parseForms`, src/parser/theta-document.ts)
// and the schema object body's `schema fields must be comma-separated`
// (`parseSchemaObjectBody`, same file). §3's rule for `<construct>` is "Use the
// closed token-name table below", so a value in no row is a rendering the
// normative rule does not produce
// (docs/bugs/0063-two-unsupported-feature-tails-missing-from-construct-table.md).
//
// THE SETTLED ROUTE this file witnesses is documentation-only — §Fix
// disposition 1: two rows are added to §3's table (row A parametrised in the
// shape of the table's existing `bitwise <op>` cell, row B a fixed string) and
// §3's lead-in is widened to admit well-formedness violations alongside node
// categories. No `src/` byte and no registry row moves, so every rendered byte
// asserted below is byte-identical before and after the fix (GOV-15 binds
// category-3 renderings; docs/spec_topics/governance/source-language-stability.md).
//
// WHICH CELLS RED AND WHICH DO NOT, stated up front:
//
//   - §(A) THE BEHAVIOUR ANCHOR — GREEN before and after. The three
//     §Reproduction fixtures plus the comma-present control, asserted on code,
//     full message and range. It is the oracle's ground truth: §(B) and §(C)
//     score the two tails this cell MEASURES, not two remembered strings.
//   - §(B) TABLE CONFORMANCE — RED at HEAD. Three cells: each subject tail must
//     be admitted by some row of §3's closed table, and §3's lead-in must state
//     a subject the two new rows fall under.
//   - §(C) THE NO-OVER-REACH GUARDS — C1 and C3 red at HEAD (they presuppose
//     §(B)'s rows), C2 green before and after. C1 refuses an enumerated row:
//     the token text is an open set over characters (any character no earlier
//     lexer arm consumes becomes a `punct` token carrying its own text —
//     `lexTheta`, src/lexer/lexer.ts), so the admitting row must be
//     parametrised. C2 refuses a fix reached by REWRITING one of the fifteen
//     existing cells. C3 pins that exactly two rows are added, which is §Fix
//     disposition 1's stated end state ("What else moves. Nothing.").
//
// THE OTHER NINE TAILS ARE NOT SCORED. §Reproduction's emission-site census
// lists eleven sites; the nine outside the subject pair are §Non-goals of the
// report and are deliberately absent from every assertion here, so this oracle
// goes green on the settled route instead of reddening forever.
//
// Offline, deterministic, provider-free: `parseDoc` (tests/helpers/e2e-s1.ts)
// wraps the shipped `parseThetaDocument` with inert seams, and the two corpus
// reads are `readFileSync` of committed pages. Nothing under assertion is
// stubbed. The heading-anchored, line-number-free table-reading technique is
// tests/helpers/category1-clause-oracle.ts's, applied to §3 instead of §1; the
// cell layout follows the sibling filing's oracle
// tests/grammar-trailing-trigger-equals.test.ts.

// ===========================================================================
// The registry, read live. DIAG-4 makes the *Message* column normative and
// fixes the direction of expected-message reads: no expectation below writes
// out `unsupported syntactic feature: …` by hand.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY_PAGES = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
] as const;

const REGISTRY = parseRegistry(
  REGISTRY_PAGES.map((page) =>
    readFileSync(
      fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
      "utf8",
    ),
  ).join("\n"),
) as RegistryRow[];

const CODE = "theta/parse/unsupported-feature";

/** The `<construct>` placeholder §3 owns the rendering of. */
const CONSTRUCT = "<construct>";

/** The registered *Message* template for `CODE`, asserted present before use. */
function template(): string {
  const found = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    found,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${CODE}, or no expectation here has a normative frame to be composed from`,
  ).toBeDefined();
  const text = found as string;
  expect(
    text,
    `DIAG-4: the ${CODE} Message template must carry the ${CONSTRUCT} placeholder; template=${JSON.stringify(text)}`,
  ).toContain(CONSTRUCT);
  return text;
}

/** The registry template with `<construct>` filled — the whole expected message. */
function messageFor(tail: string): string {
  return template().replace(CONSTRUCT, tail);
}

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The `<construct>` fill recovered from a rendered message, by matching the
 * registry template with the placeholder as the one capture. A reworded
 * template fails the match and reds by naming the registry rather than
 * silently extracting nothing.
 */
function tailOf(message: string): string {
  const text = template();
  const at = text.indexOf(CONSTRUCT);
  const pattern = new RegExp(
    `^${escapeForRegExp(text.slice(0, at))}(.+)${escapeForRegExp(text.slice(at + CONSTRUCT.length))}$`,
  );
  const matched = pattern.exec(message);
  expect(
    matched,
    `DIAG-4: the ${CODE} message must be the registry template with ${CONSTRUCT} interpolated. template=${JSON.stringify(text)} message=${JSON.stringify(message)}`,
  ).not.toBeNull();
  return (matched as RegExpExecArray)[1] as string;
}

// ===========================================================================
// The fixtures. Every body shares §Reproduction's four-line frontmatter
// prelude, so body line 1 is file line 5.
// ===========================================================================

const FRONTMATTER_LINES = 4;
const PRELUDE = "---\ndescription: probe\nmode: subagent\n---\n";

/** One `code @line:col-line:col` string per diagnostic, in emission order. */
function located(diags: readonly Diagnostic[]): string[] {
  return diags.map((d) => {
    const r = d.range;
    if (r === undefined) {
      throw new Error(
        `harness: ${d.code} arrived without a range, so this cell cannot assert the located site the bug document transcribes`,
      );
    }
    return `${d.code} @${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
  });
}

/** The shipped front end's diagnostics for one body, prelude prepended. */
function diagnose(body: string): readonly Diagnostic[] {
  return parseDoc(PRELUDE + body).diagnostics;
}

/**
 * The sole diagnostic a body must produce, with its code and located span
 * asserted first. A body that produces none or several reds naming that,
 * rather than letting a later index read `undefined`.
 */
function soleDiagnostic(body: string, expectedLocated: string, label: string): Diagnostic {
  const diags = diagnose(body);
  expect(
    located(diags),
    `${label} — the body must produce exactly the one located ${CODE} the bug document's §Reproduction transcribes`,
  ).toEqual([expectedLocated]);
  return diags[0] as Diagnostic;
}

/** §Reproduction F1: a punctuation token in statement position. */
const F1_BODY = "| 1";
/** §Reproduction F2: a schema body whose fields are newline-separated. */
const F2_BODY = "schema S {\n  a: string\n  b: integer\n}\nlet x = 1";
/** §Reproduction F3: the same defect on one line. */
const F3_BODY = "schema S { a: string b: integer }\nlet x = 1";
/** §Reproduction F4: the control, the comma present. */
const F4_BODY = "schema S {\n  a: string,\n  b: integer\n}\nlet x = 1";

/**
 * The two tails as §Reproduction transcribes them. They are written out here —
 * and only here — because they are the MEASUREMENT this file scores the corpus
 * against; §(A) proves the shipped parser still renders exactly these, and
 * §(B) / §(C) then range over the measured values, never over these literals.
 */
const F1_TAIL = "stray '|' in statement position";
const SCHEMA_TAIL = "schema fields must be comma-separated";

// ===========================================================================
// (A) The behaviour anchor — GREEN at HEAD and after. Documentation-only route:
// §Fix constraint 3 states that adding rows changes no observable, so every
// byte asserted here must survive the fix unchanged.
// ===========================================================================

describe("bug 0063 (A) — the two rendered tails, measured at the parse boundary", () => {
  it("A1: F1 — a punctuation token in statement position renders the stray tail", () => {
    // The no-progress arm of `parseForms` (src/parser/theta-document.ts) splices
    // the offending token's text verbatim into the tail. Body line 1 is file
    // line 5, so the `|` is at 5:1 and the span is one column wide.
    const d = soleDiagnostic(F1_BODY, `${CODE} @5:1-5:2`, "A1");
    expect(d.severity, "A1 — the registered row's severity is E").toBe("error");
    expect(
      d.message,
      "A1 — the message is the registry template with the emission site's tail interpolated (DIAG-4)",
    ).toBe(messageFor(F1_TAIL));
    expect(tailOf(d.message), "A1 — the recovered `<construct>` fill").toBe(F1_TAIL);
  });

  it("A2: F2 — newline-separated schema fields render the comma-separator tail", () => {
    // `parseSchemaObjectBody` (src/parser/theta-document.ts) reports where a
    // `,` is required and an `ident` stands instead — file line 7, column 3,
    // the `b` of the second field. Both fields survive the recovery, which is
    // what makes the diagnostic the whole of the disposition.
    const d = soleDiagnostic(F2_BODY, `${CODE} @7:3-7:4`, "A2");
    expect(d.message, "A2 — the fixed-string tail, composed through the registry").toBe(
      messageFor(SCHEMA_TAIL),
    );
    expect(tailOf(d.message), "A2 — the recovered `<construct>` fill").toBe(SCHEMA_TAIL);
  });

  it("A3: F3 — the same defect on one line renders the same tail at its own span", () => {
    const d = soleDiagnostic(F3_BODY, `${CODE} @5:22-5:23`, "A3");
    expect(d.message, "A3 — the same tail as A2 from a same-line body").toBe(
      messageFor(SCHEMA_TAIL),
    );
  });

  it("A4: F4 — the comma-present control is silent", () => {
    // The negative control that makes A2 and A3 measurements of the comma rule
    // rather than of schema bodies in general.
    expect(
      located(diagnose(F4_BODY)),
      "A4 — with the separator present the body loads clean, so A2/A3 measure the missing comma and nothing else",
    ).toEqual([]);
    expect(
      FRONTMATTER_LINES,
      "A4 — the prelude is four lines, which is what puts F1's `|` at file line 5",
    ).toBe(PRELUDE.split("\n").length - 1);
  });
});

// ===========================================================================
// The §3 table reader. Heading-region-scoped and line-number-free, so the page
// may grow above or below §3 without moving this cell's referent. The
// technique is `readAdmittedStandInTokens`
// (tests/helpers/category1-clause-oracle.ts), scoped to category 3.
// ===========================================================================

const PAGE = "docs/spec_topics/diagnostics/placeholder-rendering-a.md";
const CATEGORY3_HEADING = "### 3. Syntactic-construct placeholder";
const CONSTRUCT_HEADER_CELLS = ["Construct", "Token name"] as const;

/** One body row of §3's closed table. */
interface ConstructRow {
  /** The *Construct* cell, verbatim. */
  readonly construct: string;
  /** The first backticked span of the *Token name* cell — the rendered token. */
  readonly token: string;
}

function page(): string {
  const text = readFileSync(fileURLToPath(new URL(`../${PAGE}`, import.meta.url)), "utf8");
  if (text.trim().length === 0) {
    throw new Error(
      `harness: ${PAGE} read empty, so the closed table this oracle scores against does not exist — a loud failure, never a vacuous pass`,
    );
  }
  return text;
}

/** The lines of §3, from its own heading to the next `### ` heading. */
function category3Lines(): string[] {
  const lines = page().split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === CATEGORY3_HEADING);
  if (start < 0) {
    throw new Error(
      `harness: ${PAGE} carries no ${JSON.stringify(CATEGORY3_HEADING)} heading, so the closed <construct> table has no region to be read from`,
    );
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if ((lines[i] ?? "").startsWith("### ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end);
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s:|-]+\|?\s*$/.test(line.trim());
}

/** A markdown row's cells, split on unescaped pipes, escapes undone. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/**
 * §3's closed token-name table, in file order. The header row is located by its
 * two declared cells rather than by position, and every body row must carry a
 * backticked token in its *Token name* cell — a row that does not fails loudly,
 * because a row whose rendered token cannot be read is a row this oracle would
 * otherwise silently ignore.
 */
function readConstructTable(): readonly ConstructRow[] {
  const lines = category3Lines();
  const headerIndex = lines.findIndex((line) => {
    if (!isTableRow(line)) return false;
    const c = cells(line);
    return CONSTRUCT_HEADER_CELLS.every((want, i) => (c[i] ?? "") === want);
  });
  if (headerIndex < 0) {
    throw new Error(
      `harness: ${PAGE} ${CATEGORY3_HEADING} carries no table whose header cells are ${JSON.stringify(CONSTRUCT_HEADER_CELLS)}, so the closed vocabulary its Rule points at cannot be read`,
    );
  }
  const separator = lines[headerIndex + 1] ?? "";
  if (!isSeparatorRow(separator)) {
    throw new Error(
      `harness: the ${JSON.stringify(CONSTRUCT_HEADER_CELLS[1])} table in ${PAGE} ${CATEGORY3_HEADING} must carry a markdown separator row directly under its header; found ${JSON.stringify(separator)}`,
    );
  }

  const rows: ConstructRow[] = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!isTableRow(line)) break;
    const c = cells(line);
    const tokenCell = c[1] ?? "";
    const backticked = /`([^`]+)`/.exec(tokenCell);
    if (backticked === null) {
      throw new Error(
        `harness: every body row of ${PAGE} ${CATEGORY3_HEADING}'s token-name table must carry a backticked rendered token in its *Token name* cell; found ${JSON.stringify(tokenCell)}`,
      );
    }
    rows.push({ construct: c[0] ?? "", token: backticked[1] as string });
  }
  if (rows.length === 0) {
    throw new Error(
      `harness: ${PAGE} ${CATEGORY3_HEADING}'s token-name table has no body rows, so the Rule closes the vocabulary over nothing`,
    );
  }
  return rows;
}

/** A row's token carries at least one `<param>` parameter, `bitwise <op>`-style. */
const PARAMETER = /<[A-Za-z]+>/;

/**
 * Whether a row admits a rendered tail. A token with no parameter admits its
 * own bytes; a parametrised token admits the pattern with each parameter
 * standing for any non-empty verbatim source token — the reading the table's
 * own `bitwise <op>` cell already carries ("where `<op>` is the source token
 * verbatim").
 */
function admits(row: ConstructRow, tail: string): boolean {
  const parts = row.token.split(/<[A-Za-z]+>/);
  const pattern = new RegExp(`^${parts.map(escapeForRegExp).join("(.+)")}$`);
  return pattern.test(tail);
}

/** The rows of §3's table that admit `tail`, in file order. */
function admittingRows(rows: readonly ConstructRow[], tail: string): readonly ConstructRow[] {
  return rows.filter((row) => admits(row, tail));
}

// ===========================================================================
// (B) Table conformance — RED at HEAD. §3's Rule for `<construct>` admits one
// derivation, the table; a value in no row is a rendering the Rule does not
// produce, and the table carries the registry's own GOV-7 / GOV-8 posture.
// ===========================================================================

describe("bug 0063 (B) — §3's closed table admits both tails the parser renders", () => {
  it("B1: the stray-punctuation tail measured at A1 is admitted by some row", () => {
    const tail = tailOf(soleDiagnostic(F1_BODY, `${CODE} @5:1-5:2`, "B1").message);
    const rows = readConstructTable();
    expect(
      admittingRows(rows, tail).map((r) => r.token),
      `${PAGE} ${CATEGORY3_HEADING} — no row admits the \`${CONSTRUCT}\` value the shipped parser renders for ${JSON.stringify(F1_BODY)}: ${JSON.stringify(tail)}. §3's Rule for ${CONSTRUCT} is "Use the closed token-name table below", so this rendering is produced by no rule of the page. §Fix disposition 1 row A supplies it, parametrised in the shape of the existing \`bitwise <op>\` cell. Admitted tokens were ${JSON.stringify(rows.map((r) => r.token))}`,
    ).not.toEqual([]);
  });

  it("B2: the comma-separator tail measured at A2 is admitted by some row", () => {
    const tail = tailOf(soleDiagnostic(F2_BODY, `${CODE} @7:3-7:4`, "B2").message);
    const rows = readConstructTable();
    expect(
      admittingRows(rows, tail).map((r) => r.token),
      `${PAGE} ${CATEGORY3_HEADING} — no row admits the \`${CONSTRUCT}\` value the shipped parser renders for a newline-separated schema body: ${JSON.stringify(tail)}. §Fix constraint 1 makes the two tails one surface, so this row lands in the same commit as B1's; it is a fixed string with no parameter (§Fix disposition 1 row B). Admitted tokens were ${JSON.stringify(rows.map((r) => r.token))}`,
    ).not.toEqual([]);
  });

  it("B3: §3's lead-in states a subject the two new rows fall under", () => {
    // §Fix disposition 1, "The cost, stated": the fifteen original rows and the
    // lead-in describe NODE CATEGORIES ("the offending site is a whole node
    // category with no single source-span anchor"), while rows A and B describe
    // well-formedness violations of Theta constructs. The lead-in moves with
    // them or the table's own description of its subject becomes false. The
    // wording is the editor's; the alternation below is what any widening
    // spelling must contain.
    const lead = category3Lines()
      .join("\n")
      .split(/\|/)[0] as string;
    expect(
      lead,
      `${PAGE} ${CATEGORY3_HEADING} — the lead-in must carry the ${CONSTRUCT} Rule sentence that closes the vocabulary, or B1/B2 score against a table nothing points at`,
    ).toContain("closed token-name table");
    expect(
      lead.toLowerCase(),
      `${PAGE} ${CATEGORY3_HEADING} — the lead-in describes the table's subject as a whole node category with no single source-span anchor, which rows A and B are not: both are well-formedness violations of a Theta construct. §Fix disposition 1 ("The cost, stated") requires the lead-in to move with the rows; it must name that widened subject (one of: well-formedness, ill-formed, malformed, violation). Lead-in was ${JSON.stringify(lead)}`,
    ).toMatch(/well-formedness|ill-formed|malformed|violation/);
  });
});

// ===========================================================================
// (C) The no-over-reach guards.
// ===========================================================================

/**
 * The fifteen token names in force at the filing, in file order. Listed here as
 * a RATCHET, not as the oracle's closure: §(B) reads the live table, so this
 * list only refuses a fix reached by rewriting an existing cell instead of
 * adding rows. §Fix disposition 1's "What else moves. Nothing." is the claim.
 */
const PREEXISTING_TOKENS = [
  "arrow function",
  "spread",
  "optional chaining",
  "nullish coalescing",
  "strict equality",
  "bitwise <op>",
  "comma operator",
  "nested template",
  "new",
  "typeof",
  "instanceof",
  "delete",
  "void",
  "yield",
  "await",
] as const;

/** Four `<t>` spellings whose only common property is reaching the punct arm. */
const STRAY_TOKENS = ["|", "&", "%", "§"] as const;

describe("bug 0063 (C) — the guards on how the two rows may be written", () => {
  it("C1: one PARAMETRISED row admits every `<t>` the punct arm can splice", () => {
    // §Fix constraint 2: any character no earlier lexer arm consumes becomes a
    // `punct` token carrying its own text (`lexTheta`, src/lexer/lexer.ts), so
    // `<t>` is an open set over characters — `§`, `€`, `±` and the unpaired
    // surrogates of an astral character all render. A cell that ENUMERATES
    // tokens is wrong on arrival; the four spellings below must therefore be
    // admitted by the same row, and that row must carry a parameter.
    const rows = readConstructTable();
    const admittingTokens = STRAY_TOKENS.map((t) => {
      const tail = tailOf(soleDiagnostic(`${t} 1`, `${CODE} @5:1-5:2`, `C1 ${t}`).message);
      return admittingRows(rows, tail).map((row) => row.token);
    });
    expect(
      admittingTokens,
      `${PAGE} ${CATEGORY3_HEADING} — every one of ${JSON.stringify(STRAY_TOKENS)} in statement position must be admitted by the SAME single row; an enumerating cell admits some and not others. Per-token admitting tokens were ${JSON.stringify(admittingTokens)}`,
    ).toEqual(STRAY_TOKENS.map(() => admittingTokens[0]));
    const admitting = admittingTokens[0] as string[];
    expect(
      admitting.length,
      `${PAGE} ${CATEGORY3_HEADING} — exactly one row may admit the stray tail; ${JSON.stringify(admitting)} admit it`,
    ).toBe(1);
    expect(
      PARAMETER.test(admitting[0] as string),
      `${PAGE} ${CATEGORY3_HEADING} — the row admitting the stray tail must be PARAMETRISED in the shape of the existing \`bitwise <op>\` cell (§Fix constraint 2): the token text is an open set over characters, so an enumeration of concrete values is wrong on arrival. Row token was ${JSON.stringify(admitting[0])}`,
    ).toBe(true);
  });

  it("C2: the fifteen rows in force at the filing all survive unchanged", () => {
    // The guard against reaching B1/B2 by rewriting a cell. §3's table carries
    // the registry's GOV-7 / GOV-8 posture, so a silently retired row is a
    // breaking change to the placeholder surface, not a table edit.
    const tokens = readConstructTable().map((row) => row.token);
    expect(
      tokens,
      `${PAGE} ${CATEGORY3_HEADING} — the fifteen token names in force at the filing must all still be present; the two subject rows are ADDED, never substituted for an existing cell`,
    ).toEqual(expect.arrayContaining([...PREEXISTING_TOKENS]));
  });

  it("C3: exactly two rows are added — the subject pair, and nothing else", () => {
    // §Fix disposition 1 enumerates row A and row B and states "What else
    // moves. Nothing." The other nine tails of §Reproduction's census are
    // §Non-goals and are neither scored nor licensed here, so a table that
    // grew a row for one of them reds and sends that edit back to its own
    // filing.
    const tokens = readConstructTable().map((row) => row.token);
    expect(
      tokens.length,
      `${PAGE} ${CATEGORY3_HEADING} — the table must carry exactly ${PREEXISTING_TOKENS.length + 2} rows: the ${PREEXISTING_TOKENS.length} in force at the filing plus row A and row B. Tokens were ${JSON.stringify(tokens)}`,
    ).toBe(PREEXISTING_TOKENS.length + 2);
  });
});
