import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { reservedKeywords } from "../src/lexer/lexer";
import type { ThetaDocument } from "../src/parser/theta-document";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0249 — a reserved keyword spelled as an inline object type's field key
// (`schema S { p: { let: string } }`) or as a typed object-literal key
// (`let x = [schema T { a: "s", let: 1 }]`) reaches no parser leaf
// (docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md). This file
// is that report's §Fix constraint 6 witness.
//
// THE RULE THE TWO POSITIONS REST ON. docs/spec_topics/lexical.md:20 reserves
// 32 spellings and states the consequence with no position qualifier: "Using
// one of these in identifier position is
// `theta/parse/reserved-keyword-as-identifier`". An inline object type's
// fields "reuse the object-schema `Field` form" (docs/reference/grammar.md:238)
// and their names "are identifiers" (`:249`–`:250`); a typed object literal's
// entry is `FieldEntry ::= Ident ":" Literal` (`:599`, `NamedObjectLit` `:600`).
// Both keys are
// therefore identifier positions, and the registered row
// (docs/spec_topics/diagnostics/code-registry-parse.md:21) already describes
// them — no code is minted here and no registry or spec edit is owed
// (§Fix constraint 3, DIAG-2).
//
// THE TWO LEAVES (cited BY SYMBOL — docs/STYLE.md §Citations, and bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class for absolute line numbers into these two parser
// modules).
//   1. `TypeParser.parseObject` (src/parser/type-grammar.ts) retains the key in
//      `TypeNode.fieldNames`, and bug 0154's identifier pass over that list
//      opens each iteration with `if (RESERVED_KEYWORDS.has(name)) { continue;
//      }`. The skip is bug 0154's Disposition A — it keeps `Ok` / `Err` /
//      `Result` out of the case rule, since `tokeniseType` has no keyword kind
//      and presents them as plain `ident` text — and it defers the refusal to
//      bug 0153, which shipped (0.194.0) covering six other positions. The
//      deferral terminates nowhere, so the guard that protects the case rule
//      from `Ok` also withholds every refusal from `let`.
//   2. `ThetaParser.parseObjectLiteral` (src/parser/theta-document.ts) gates the
//      field-name slot on token KIND (`nameTok.kind !== "ident" && nameTok.kind
//      !== "string"`) and a reserved spelling lexes as `keyword`, so the head
//      takes the "Not a field name: drop the token to guarantee progress"
//      branch with no diagnostic. Its `:` and its value are dropped by the same
//      branch on the following turns, so `checkObjectExpr`'s `present` list
//      never contains the key — the field SET is wrong, not merely permissive.
//   3. The four `controlHeads` spellings (`fn`, `for`, `if`, `while`) are
//      refused anyway, by the lexer's `contextualDiagnostics` scan, as
//      `theta/parse/single-line-if` — a row whose *Trigger* is a body that is
//      not a braced block (code-registry-parse.md:23) and whose *Hint* is "Wrap
//      the body in `{ ... }`", at a field key that has no body.
//
// WHAT THIS FILE ASSERTS — the bug's §Expected behaviour 1–5, not HEAD's
// output. Every row states the POST-FIX list. At HEAD 28 of the 32 spellings
// draw `[]` at each key position and the other four draw the off-Trigger
// `single-line-if`; those are the lists this file requires to be REPLACED by
// the refusal. Each expected list here was MEASURED against a throwaway
// prototype of §Fix edits 1–3 (built, read, reverted), never guessed, so the
// file is reachable from both directions: red at HEAD, green once the fix
// lands.
//
// THE TWO RANGES THE FIX DELIVERS, and why they differ. At the inline-object
// leaf the pass has no `TypeToken` range to name — `tokeniseType` is not
// re-ranged by this fix — so the refusal carries the pass's existing
// `site.range`, the ENCLOSING DECLARATION's, which is exactly the range bug
// 0154's case rule already reports at the identical slot (row a12 below is that
// shape's control). At the object-literal leaf the field head IS a token, so
// the refusal is ranged on `nameTok.range`. Every expected range below is
// COMPUTED from the row's own source text rather than copied as a literal
// number, so a fix that ranges the refusal on some other span reds here instead
// of silently agreeing with a stale constant.
//
// WITNESS FORM (§Fix constraint 6). Every assertion is an ORDERED WHOLE-LIST
// `toEqual` over the UNFILTERED `doc.diagnostics` through `parseDoc`
// (tests/helpers/e2e-s1.ts:39), rendered `severity code @l:c-l:c: message`, so
// neither an extra diagnostic, nor one at the wrong range, nor one naming the
// wrong keyword can hide inside a containment check. DIAG-4
// (docs/spec_topics/diagnostics/diagnostic-shape.md:74): no asserted message
// string is written out — each is READ from the registry's *Message* column
// through `parseRegistry` / `registryMessage` (tools/code-registry/index.js)
// with its placeholders filled after their presence is asserted.
//
// THE TWO ANTI-OVER-REACH FENCES (§Fix constraints 4 and 5).
//   - Group (b) row b6 asserts the WHOLE post-fix list — the refusal against
//     `let` AND `unknown identifier 'nope'`, with NO `extra field 'nope'` — so
//     a fix that emits the refusal while leaving the key dropped reds. Its
//     control b7 pins the unmoved uppercase spelling beside it.
//   - Group (g) pins the GENUINE subjects of `theta/parse/single-line-if`
//     (`if (b) 1`, `fn f(): number 1`) and group (a) pins bug 0154's case rule
//     still firing on `{ Ys: string }` (a12) and still NOT firing on
//     `{ Ok: string }` (a12ok, which draws the reserved refusal instead — the
//     report's §Non-goals disposition for the three `Result` spellings).
//
// ANTI-VACUITY. The ten 32-spelling sweeps of groups (sa) and (sb) assert 320
// whole ordered lists, none of them empty, so a harness that stopped reaching
// the lexer or the parser cannot turn an assertion here into a silent pass. The
// legal controls a11 and b9 are the other floor: they are `[]` at HEAD and must
// stay `[]`, so a fix that refuses MORE than the two keys reds too.
//
// TIER: unit, offline, deterministic, provider-free. Every observable settles
// inside one `parseThetaDocument` call over a source string — both leaves are
// parse-time and the off-Trigger residue is lexer-time, all three before any
// session, host or model exists, so an integration tier would add a round trip
// to a parse-time value and buy no reach, and a live tier would make a fully
// determined value stochastic. The one thing this tier cannot reach is the
// composition root's registration decision, which is §Fix constraint 8's
// separately-owed H8a cell.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment
// or conditionally skips. The registry lookups assert their row's presence and
// their template's placeholders before either is used, and the spelling list is
// read from the shipped `reservedKeywords()` (src/lexer/lexer.ts:159) with its
// size asserted, so a shrunken set reds rather than quietly sweeping less.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* and *Sev* columns (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

const RESERVED = "theta/parse/reserved-keyword-as-identifier";
const SINGLE_LINE_IF = "theta/parse/single-line-if";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const LET_RHS_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const LET_NO_INITIALISER = "theta/parse/let-without-initialiser";
const EXTRA_FIELD = "theta/parse/extra-object-field";
const MISSING_FIELD = "theta/parse/missing-object-field";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled. Definedness and placeholder presence are asserted first, so a missing
 * row or a reworded template reds by naming the registry rather than by a bare
 * `undefined` comparison.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/code-registry-parse.md must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

// ===========================================================================
// Parse harness and the rendered-diagnostic vocabulary.
// ===========================================================================
//
// `parseDoc` (tests/helpers/e2e-s1.ts:39) is the shipped whole-file entry point
// `parseThetaDocument` wrapped in the standard inert deps — an in-band no-op
// system-note channel and a resolving `model:` matcher. No behaviour is
// stubbed: the lexer, the parser and the frontmatter reader under assertion are
// the production ones.

/** Frontmatter for every `.theta` row — occupies lines 1–3, body starts at 4. */
const FM = "---\nmode: prompt\n---\n";

/** Every diagnostic rendered `severity code @l:c-l:c: message`, in report order. */
function lines(src: string, path = "test.theta"): string[] {
  const doc: ThetaDocument = parseDoc(src, path);
  return doc.diagnostics.map((d: Diagnostic) => {
    const r = d.range;
    const at =
      r === undefined
        ? "-"
        : `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
    return `${d.severity} ${d.code} @${at}: ${d.message}`;
  });
}

/** One rendered `error`-severity diagnostic line, single-line range. */
function at(
  code: string,
  message: string,
  line: number,
  column: number,
  endColumn: number,
): string {
  return `error ${code} @${line}:${column}-${line}:${endColumn}: ${message}`;
}

/**
 * A DECLARATION-ranged line: the enclosing statement's own span. Every row
 * below whose subject sits inside a `Type` puts that statement on one source
 * line, so the declaration's range is that line from column 1 to its
 * end-exclusive last column — computed from the line's own text so no expected
 * column here is a copied constant.
 */
function declLine(code: string, message: string, line: number, text: string): string {
  return at(code, message, line, 1, text.length + 1);
}

/** The refusal at the inline-object-type leaf: declaration-ranged (`site.range`). */
function reservedDecl(keyword: string, line: number, text: string): string {
  return declLine(RESERVED, msg(RESERVED, [["<keyword>", keyword]]), line, text);
}

/** The refusal at a token: the object-literal leaf's `nameTok.range`, and bug 0153's leaves. */
function reservedTok(keyword: string, line: number, column: number): string {
  return at(
    RESERVED,
    msg(RESERVED, [["<keyword>", keyword]]),
    line,
    column,
    column + keyword.length,
  );
}

/** Bug 0154's case rule at the same inline slot — declaration-ranged as well. */
function caseAt(line: number, text: string): string {
  return declLine(BINDING_CASE, msg(BINDING_CASE, []), line, text);
}

/** The RHS gate's verdict on a typed `let`, ranged on the same declaration. */
function letRhsAt(
  name: string,
  expected: string,
  actual: string,
  line: number,
  text: string,
): string {
  return declLine(
    LET_RHS_MISMATCH,
    msg(LET_RHS_MISMATCH, [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
    line,
    text,
  );
}

/** The `controlHeads` scan's verdict, ranged on the head token. */
function singleLineIfAt(head: string, line: number, column: number): string {
  return at(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []), line, column, column + head.length);
}

// --- Column arithmetic over a row's own source line -------------------------
//
// Each helper derives its columns from the line text under test (1-indexed,
// end-exclusive, per lexical.md §"Diagnostic spans"), so a row's expectation
// cannot drift from the bytes the row actually parses.

/** The 1-indexed column of `key`'s own token, found by its `key:` spelling. */
function keyColumn(text: string, key: string): number {
  const index = text.indexOf(`${key}:`);
  expect(
    index,
    `harness: the row's source line must spell the key \`${key}:\` once, or the expected ` +
      `column is not derivable from it; line=${JSON.stringify(text)}`,
  ).toBeGreaterThanOrEqual(0);
  return index + 1;
}

/**
 * The named object literal's own range — from its constructor name to the
 * closing `}` — the span every field-set verdict (`extra-object-field`,
 * `missing-object-field`) reports at. `head` is the constructor's `<Name> {`
 * spelling and the first `}` on the line closes the literal in every row here.
 */
function literalSpan(text: string, head: string): readonly [number, number] {
  const start = text.indexOf(head);
  const close = text.indexOf("}");
  expect(
    Math.min(start, close),
    `harness: the row's source line must spell \`${head}\` and its closing brace, or the ` +
      `literal's expected span is not derivable; line=${JSON.stringify(text)}`,
  ).toBeGreaterThanOrEqual(0);
  return [start + 1, close + 2];
}

/** `extra field '<field>' on schema '<schema>'`, ranged on the whole literal. */
function extraFieldAt(
  field: string,
  schema: string,
  line: number,
  span: readonly [number, number],
): string {
  return at(
    EXTRA_FIELD,
    msg(EXTRA_FIELD, [
      ["<field>", field],
      ["<schema>", schema],
    ]),
    line,
    span[0],
    span[1],
  );
}

/** `missing field '<field>' on schema '<schema>'`, ranged on the whole literal. */
function missingFieldAt(
  field: string,
  schema: string,
  line: number,
  span: readonly [number, number],
): string {
  return at(
    MISSING_FIELD,
    msg(MISSING_FIELD, [
      ["<field>", field],
      ["<schema>", schema],
    ]),
    line,
    span[0],
    span[1],
  );
}

/** `unknown identifier '<name>'`, ranged on the identifier token. */
function unknownIdentAt(name: string, line: number, column: number): string {
  return at(
    UNKNOWN_IDENT,
    msg(UNKNOWN_IDENT, [["<name>", name]]),
    line,
    column,
    column + name.length,
  );
}

/**
 * `let binding '<name>' has no initialiser`, ranged on the binder head the
 * mis-split leaves behind — `let x =` / `let x: T =`, i.e. column 1 through the
 * `=` the split ends at, derived from the row's own statement text.
 */
function letNoInitialiserAt(name: string, line: number, stmt: string): string {
  const equals = stmt.indexOf("=");
  expect(
    equals,
    `harness: the row's statement must spell \`=\`, or the binder head's expected span is not ` +
      `derivable; stmt=${JSON.stringify(stmt)}`,
  ).toBeGreaterThanOrEqual(0);
  return at(LET_NO_INITIALISER, msg(LET_NO_INITIALISER, [["<name>", name]]), line, 1, equals + 2);
}

// ===========================================================================
// The 32 spellings, read from the shipped set rather than copied.
// ===========================================================================

const SPELLINGS: readonly string[] = [...reservedKeywords()];

/** Assert one whole ordered list, naming the row and its source in the failure. */
function expectRow(
  cell: string,
  src: string,
  expected: readonly string[],
  why: string,
  path = "test.theta",
): void {
  expect(lines(src, path), `${cell} :: ${JSON.stringify(src)} — ${why}`).toEqual([
    ...expected,
  ]);
}

/**
 * One shape's whole 32-spelling sweep, asserted as a single map equality:
 * separate per-spelling assertions would stop at the first divergence and hide
 * the partition the sweep exists to state.
 */
function expectSweep(
  cell: string,
  source: (keyword: string) => string,
  rule: (keyword: string) => readonly string[],
  why: string,
  path = "test.theta",
): void {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    const src = source(keyword);
    actual[`${keyword} :: ${src}`] = lines(src, path);
    expected[`${keyword} :: ${src}`] = [...rule(keyword)];
  }
  expect(actual, `${cell} — ${why}`).toEqual(expected);
}

// ===========================================================================
// (r) The registered rows the whole file reads its oracle from.
// ===========================================================================

describe("0249 (r) — the registered rows and the reserved set", () => {
  it("r1: both codes are registered `E` and carry the templates this file fills", () => {
    // DIAG-2 is not engaged by this fix: no code is added, removed,
    // re-namespaced or re-triggered (§Fix constraint 3). Both rows exist today;
    // the defect is that one of them fires where its *Trigger* does not hold and
    // the other does not fire where its *Trigger* does.
    for (const code of [RESERVED, SINGLE_LINE_IF]) {
      const row = REGISTRY.find((r) => r.code === code);
      expect(
        row,
        `DIAG-2: docs/spec_topics/diagnostics/code-registry-parse.md must carry the row for ${code}`,
      ).toBeDefined();
      expect(
        (row as RegistryRow).severity,
        `${code} is no longer an E-severity row, so the load-blocking consequence this bug turns on no longer follows`,
      ).toBe("E");
    }
    expect(
      (REGISTRY.find((r) => r.code === RESERVED) as RegistryRow).message,
      "DIAG-4: the reserved row's Message template carries the `<keyword>` slot the emission interpolates",
    ).toContain("<keyword>");
  });

  it("r2: the shipped reserved set is lexical.md:20's 32 spellings", () => {
    expect(
      SPELLINGS.length,
      "src/lexer/lexer.ts:159 must carry lexical.md:20's 32 spellings, or the sweeps below silently sweep less",
    ).toBe(32);
    for (const spelling of ["let", "fn", "if", "while", "for", "Ok", "void"]) {
      expect(
        SPELLINGS,
        `lexical.md:20 lists \`${spelling}\`, one of the spellings this bug's partition turns on`,
      ).toContain(spelling);
    }
  });
});

// ===========================================================================
// (a) The inline object type's field key — §Reproduction (A), §Expected 1.
// ===========================================================================

describe("0249 (a) — a reserved spelling at an inline object type's key is refused", () => {
  const WHY =
    "grammar.md:238 makes an inline object's fields the object-schema `Field` form and :249–:250 " +
    "makes their names identifiers, so lexical.md:20 holds of the key: it draws " +
    "`theta/parse/reserved-keyword-as-identifier` at the enclosing declaration's range, the range " +
    "bug 0154's case rule already reports at the identical slot (row a12). A red reporting `[]` is " +
    "bug 0249: the bug-0154 identifier pass in `TypeParser.parseObject` skipped the name by " +
    "`RESERVED_KEYWORDS.has(name) -> continue`. A red reporting `theta/parse/single-line-if` is the " +
    "same bug's off-Trigger residue in the lexer's `controlHeads` scan (§Expected 4)";

  it("a1: `schema S { p: { let: string } }`", () => {
    const body = "schema S { p: { let: string } }";
    expectRow("a1", `${FM}${body}\n1\n`, [reservedDecl("let", 4, body)], WHY);
  });

  it("a2: `schema S { p: { fn: string } }` — a `controlHeads` spelling", () => {
    // §Expected 4. `fn` is the face where the off-Trigger row stands in for the
    // refusal today; the *Hint* it carries ("Wrap the body in `{ ... }`") names
    // an edit that does not apply at a field key.
    const body = "schema S { p: { fn: string } }";
    expectRow("a2", `${FM}${body}\n1\n`, [reservedDecl("fn", 4, body)], WHY);
  });

  it("a3: `schema S { p: { q: { let: string } } }` — one level deeper", () => {
    const body = "schema S { p: { q: { let: string } } }";
    expectRow("a3", `${FM}${body}\n1\n`, [reservedDecl("let", 4, body)], WHY);
  });

  it("a4: `let x: { let: string } = 1` — the annotation position", () => {
    // The RHS gate's own verdict is independent of this rule and stays beside
    // the refusal, at the same declaration range and after it in report order.
    const body = "let x: { let: string } = 1";
    expectRow(
      "a4",
      `${FM}${body}\n1\n`,
      [
        reservedDecl("let", 4, body),
        letRhsAt("x", "{ let: string }", "integer", 4, body),
      ],
      WHY,
    );
  });

  it("a5: `let x: { outer: { let: string } } = 1` — nested under the annotation", () => {
    const body = "let x: { outer: { let: string } } = 1";
    expectRow(
      "a5",
      `${FM}${body}\n1\n`,
      [
        reservedDecl("let", 4, body),
        letRhsAt("x", "{ outer: { let: string } }", "integer", 4, body),
      ],
      WHY,
    );
  });

  it("a6: `fn h(p: { outer: { let: string } }): number { 1 }` — the parameter position", () => {
    // The two `fn` positions draw NOTHING at HEAD for any of the 32 spellings:
    // the `fn` head puts a `{` on the logical line, so even the off-Trigger
    // `controlHeads` scan is satisfied and the key is wholly unrefused.
    const body = "fn h(p: { outer: { let: string } }): number { 1 }";
    expectRow("a6", `${FM}${body}\n1\n`, [reservedDecl("let", 4, body)], WHY);
  });

  it("a7: `fn h(): { outer: { let: string } } { 1 }` — the return position", () => {
    const body = "fn h(): { outer: { let: string } } { 1 }";
    expectRow("a7", `${FM}${body}\n1\n`, [reservedDecl("let", 4, body)], WHY);
  });

  it("a8: `let x: array<{ outer: { let: string } }> = []` — beneath a generic argument", () => {
    const body = "let x: array<{ outer: { let: string } }> = []";
    expectRow("a8", `${FM}${body}\n1\n`, [reservedDecl("let", 4, body)], WHY);
  });

  it("a9: the `.thetalib` route — one grammar, one rule (lexical.md:3)", () => {
    // A library carries no frontmatter, so the declaration is source line 1; the
    // path is what selects the library grammar and is passed explicitly.
    const body = "schema S { p: { let: string } }";
    expectRow(
      "a9",
      `${body}\nfn f(): number { 1 }\n`,
      [reservedDecl("let", 1, body)],
      WHY,
      "lib.thetalib",
    );
  });

  it("a10: the `params:` route — the same inline type declared in frontmatter", () => {
    // The frontmatter scalar carries its own range, so the refusal is ranged on
    // the YAML value node rather than on a body line.
    const scalar = "  p: '{ outer: { let: string } }'";
    const src = `---\nmode: prompt\nparams:\n${scalar}\n---\nlet y = 1\n1\n`;
    expectRow(
      "a10",
      src,
      [
        at(
          RESERVED,
          msg(RESERVED, [["<keyword>", "let"]]),
          4,
          scalar.indexOf("'") + 1,
          scalar.length + 1,
        ),
      ],
      WHY,
    );
  });

  it("a11: control — a lowercase key stays admitted", () => {
    // §Expected 5. The agreement is reached by ADDING the refusal at reserved
    // spellings, never by refusing more of the position.
    expectRow(
      "a11",
      `${FM}schema S { p: { ok: string } }\n1\n`,
      [],
      "a legal inline key draws nothing before or after the fix; a red here is over-reach",
    );
  });

  it("a12: control — an uppercase key keeps bug 0154's case rule ALONE", () => {
    // §Fix constraint 5. a12 also proves the identifier pass REACHES the nested
    // key, and its range is the shape the refusal above is asserted at.
    const body = "schema S { p: { Ys: string } }";
    expectRow(
      "a12",
      `${FM}${body}\n1\n`,
      [caseAt(4, body)],
      "bug 0154's case rule owns the uppercase spelling and this report moves nothing about it",
    );
  });

  it("a12ok: control — `{ Ok: string }` draws the refusal and NOT the case rule", () => {
    // §Non-goals. Bug 0154's Disposition A exists so `Ok` / `Err` / `Result` —
    // which `tokeniseType` presents as plain `ident` text — never draw
    // `binding-case-mismatch`. They are reserved spellings, so after the fix they
    // draw the reserved refusal instead, and the case rule stays silent on them.
    const body = "schema S { p: { Ok: string } }";
    expectRow(
      "a12ok",
      `${FM}${body}\n1\n`,
      [reservedDecl("Ok", 4, body)],
      "a `binding-case-mismatch` here would undo bug 0154's Disposition A; `[]` here is bug 0249",
    );
  });

  it("a13: control — the DECLARATION body one brace out is already refused", () => {
    // Bug 0153's `parseSchemaObjectBody` leaf, token-ranged. It is the boundary
    // this report closes: the same spelling one brace INWARD draws nothing.
    const body = "schema S { let: string }";
    expectRow(
      "a13",
      `${FM}${body}\n1\n`,
      [reservedTok("let", 4, keyColumn(body, "let"))],
      "bug 0153 covers the schema field NAME and this report moves nothing about it",
    );
  });
});

// ===========================================================================
// (sa) The (A) sweeps — all 32 spellings at seven `Type` positions plus the
// `params:` route. §Expected 1 and 4 over the whole set.
// ===========================================================================

describe("0249 (sa) — all 32 spellings, every `Type` position", () => {
  const WHY =
    "lexical.md:20 states the rule over the whole 32-spelling set with no position qualifier and " +
    "type-system.md:15 states one type grammar in every annotation position, so the disposition is " +
    "the same at every shape and every spelling. A red showing `[]` for 28 of them is bug 0249's " +
    "silence; a red showing `theta/parse/single-line-if` for `fn` / `for` / `if` / `while` is its " +
    "off-Trigger residue (§Expected 4)";

  it("sa1: `schema S { p: { <kw>: string } }`", () => {
    const body = (kw: string): string => `schema S { p: { ${kw}: string } }`;
    expectSweep(
      "sa1",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) => [reservedDecl(kw, 4, body(kw))],
      WHY,
    );
  });

  it("sa2: `schema S { p: { q: { <kw>: string } } }`", () => {
    const body = (kw: string): string => `schema S { p: { q: { ${kw}: string } } }`;
    expectSweep(
      "sa2",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) => [reservedDecl(kw, 4, body(kw))],
      WHY,
    );
  });

  it("sa3: `let x: { <kw>: string } = 1`", () => {
    // The RHS gate answers 31 of the 32 spellings beside the refusal. The
    // exception is `void`, whose disposition at the mismatch check is fenced by
    // §Non-goals and is not this report's subject — it is asserted as MEASURED so
    // the sweep states the whole partition rather than averaging over it.
    const body = (kw: string): string => `let x: { ${kw}: string } = 1`;
    expectSweep(
      "sa3",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) =>
        kw === "void"
          ? [reservedDecl(kw, 4, body(kw))]
          : [
              reservedDecl(kw, 4, body(kw)),
              letRhsAt("x", `{ ${kw}: string }`, "integer", 4, body(kw)),
            ],
      WHY,
    );
  });

  it("sa4: `fn h(p: { <kw>: string }): number { 1 }`", () => {
    const body = (kw: string): string => `fn h(p: { ${kw}: string }): number { 1 }`;
    expectSweep(
      "sa4",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) => [reservedDecl(kw, 4, body(kw))],
      WHY,
    );
  });

  it("sa5: `fn h(): { <kw>: string } { 1 }`", () => {
    const body = (kw: string): string => `fn h(): { ${kw}: string } { 1 }`;
    expectSweep(
      "sa5",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) => [reservedDecl(kw, 4, body(kw))],
      WHY,
    );
  });

  it("sa6: `let x: array<{ <kw>: string }> = []`", () => {
    const body = (kw: string): string => `let x: array<{ ${kw}: string }> = []`;
    expectSweep(
      "sa6",
      (kw) => `${FM}${body(kw)}\n1\n`,
      (kw) => [reservedDecl(kw, 4, body(kw))],
      WHY,
    );
  });

  it("sa7: the `.thetalib` shape, all 32", () => {
    const body = (kw: string): string => `schema S { p: { ${kw}: string } }`;
    expectSweep(
      "sa7",
      (kw) => `${body(kw)}\nfn f(): number { 1 }\n`,
      (kw) => [reservedDecl(kw, 1, body(kw))],
      WHY,
      "lib.thetalib",
    );
  });

  it("sa8: the `params:` shape, all 32", () => {
    const scalar = (kw: string): string => `  p: '{ ${kw}: string }'`;
    expectSweep(
      "sa8",
      (kw) => `---\nmode: prompt\nparams:\n${scalar(kw)}\n---\nlet y = 1\n1\n`,
      (kw) => [
        at(
          RESERVED,
          msg(RESERVED, [["<keyword>", kw]]),
          4,
          scalar(kw).indexOf("'") + 1,
          scalar(kw).length + 1,
        ),
      ],
      WHY,
    );
  });
});

// ===========================================================================
// (b) The typed object-literal key — §Reproduction (B), §Expected 2 and 3.
// ===========================================================================

/** Body line 1 of every (b) row; body line 2 is source line 5. */
const SCHEMA_T = "schema T { a: string }";

/** A `.theta` declaring `schema T { a: string }` and then `stmt`. */
function withT(stmt: string): string {
  return `${FM}${SCHEMA_T}\n${stmt}\n1\n`;
}

describe("0249 (b) — a reserved spelling at a typed object-literal key is refused AND is a key", () => {
  const WHY =
    "grammar.md:599 makes a `FieldEntry`'s key an `Ident` (and :600 the `NamedObjectLit` that " +
    "carries it), and a reserved spelling is not one, " +
    "so the key draws `theta/parse/reserved-keyword-as-identifier` ranged on its own token — and it " +
    "must still BE a key, so the field-set checks name it (expressions.md:211). A red reporting `[]` " +
    "or a bare `theta/parse/single-line-if` is bug 0249: `parseObjectLiteral`'s field-name gate " +
    "tested token KIND, and a reserved spelling lexes as `keyword`, so the head took the " +
    "drop-for-progress branch with no diagnostic and never reached `checkObjectExpr`'s `present` list";

  it("b1: `let x = [schema T { a: \"s\", let: 1 }]`", () => {
    const stmt = 'let x = [schema T { a: "s", let: 1 }]';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b1",
      withT(stmt),
      [
        extraFieldAt("let", "T", 5, span),
        reservedTok("let", 5, keyColumn(stmt, "let")),
      ],
      WHY,
    );
  });

  it("b2: `let x = [schema T { a: \"s\", fn: 1 }]` — a `controlHeads` spelling", () => {
    const stmt = 'let x = [schema T { a: "s", fn: 1 }]';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b2",
      withT(stmt),
      [extraFieldAt("fn", "T", 5, span), reservedTok("fn", 5, keyColumn(stmt, "fn"))],
      WHY,
    );
  });

  it("b3: the same constructor passed as an argument", () => {
    const stmt = 'g(schema T { a: "s", let: 1 })';
    const span = literalSpan(stmt, "T {");
    const src = `${FM}${SCHEMA_T}\nfn g(p: T): number { 1 }\n${stmt}\n`;
    expectRow(
      "b3",
      src,
      [
        extraFieldAt("let", "T", 6, span),
        reservedTok("let", 6, keyColumn(stmt, "let")),
      ],
      WHY,
    );
  });

  it("b4: `let x = [schema T { let: 1 }]` — the key is a key, so it is an EXTRA field", () => {
    // §Expected 3. At HEAD this row reports `missing field 'a'` ALONE: the key,
    // its `:` and its value are all dropped, so the literal has no fields at all
    // and `extra-object-field` cannot name the one the author wrote. b5 beside it
    // is the same shape with an uppercase key, which IS a field today.
    const stmt = "let x = [schema T { let: 1 }]";
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b4",
      withT(stmt),
      [
        extraFieldAt("let", "T", 5, span),
        missingFieldAt("a", "T", 5, span),
        reservedTok("let", 5, keyColumn(stmt, "let")),
      ],
      WHY,
    );
  });

  it("b5: control — the uppercase key at the same slot is unchanged", () => {
    const stmt = "let x = [schema T { Ys: 1 }]";
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b5",
      withT(stmt),
      [extraFieldAt("Ys", "T", 5, span), missingFieldAt("a", "T", 5, span)],
      "b4's pair: an uppercase key is an extra field today and stays one; only the reserved key moves",
    );
  });

  it("b6: `let x = [schema T { a: \"s\", let: nope }]` — the field boundary must not shift", () => {
    // §Fix constraint 4, the sharpest cell in the file. At HEAD the dropped key
    // and its `:` make the loop re-enter at the VALUE, so `nope` becomes the next
    // field NAME and the row reports `extra field 'nope'` — a field the author
    // never wrote — while the value expression it displaced is never walked, so
    // b7's `unknown-identifier` is withheld. The whole post-fix list is asserted
    // here precisely so a fix that emits the refusal while leaving the key
    // dropped still reds.
    const stmt = 'let x = [schema T { a: "s", let: nope }]';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b6",
      withT(stmt),
      [
        extraFieldAt("let", "T", 5, span),
        reservedTok("let", 5, keyColumn(stmt, "let")),
        unknownIdentAt("nope", 5, stmt.indexOf("nope") + 1),
      ],
      `${WHY}. A red carrying \`extra field 'nope'\` is the un-repaired field boundary; a red ` +
        "missing `unknown identifier 'nope'` is the value expression still going unwalked",
    );
  });

  it("b7: control — the same shape with an uppercase key is unchanged", () => {
    const stmt = 'let x = [schema T { a: "s", Ys: nope }]';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b7",
      withT(stmt),
      [
        extraFieldAt("Ys", "T", 5, span),
        unknownIdentAt("nope", 5, stmt.indexOf("nope") + 1),
      ],
      "b6's pair: the value expression behind a real key IS walked today, and this row proves it",
    );
  });

  it("b8: control — the QUOTED spelling is a different key entirely", () => {
    // §Non-goals: `"let"` lexes as a `string`-kind token, is retained verbatim by
    // the existing gate, and is bugs 0176 / 0161's subject at the type position.
    const stmt = 'let x = [schema T { "let": 1 }]';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b8",
      withT(stmt),
      [extraFieldAt('"let"', "T", 5, span), missingFieldAt("a", "T", 5, span)],
      "a quoted key is not an `Ident` position and this report moves nothing about it",
    );
  });

  it("b9: control — the legal constructor stays admitted", () => {
    expectRow(
      "b9",
      withT('let x = [schema T { a: "s" }]'),
      [],
      "a legal constructor draws nothing before or after the fix; a red here is over-reach",
    );
  });

  it("b10: the `.thetalib` route", () => {
    const stmt = 'fn f(): array<T> { [schema T { a: "s", let: 1 }] }';
    const span = literalSpan(stmt, "T {");
    expectRow(
      "b10",
      `${SCHEMA_T}\n${stmt}\n`,
      [
        extraFieldAt("let", "T", 2, span),
        reservedTok("let", 2, keyColumn(stmt, "let")),
      ],
      WHY,
      "lib.thetalib",
    );
  });
});

// ===========================================================================
// (sb) The (B) sweeps — all 32 spellings at both literal positions.
// ===========================================================================

describe("0249 (sb) — all 32 spellings, both object-literal positions", () => {
  const WHY =
    "grammar.md:599 admits an `Ident` at a `FieldEntry` key and lexical.md:20 excludes all 32 " +
    "spellings from `Ident`, so every spelling is refused and every spelling is a field. A red " +
    "showing `[]` for 28 of them is bug 0249's silence; a red showing `theta/parse/single-line-if` " +
    "for `fn` / `for` / `if` / `while` is its off-Trigger residue (§Expected 4)";

  it("sb1: `let x = [schema T { a: \"s\", <kw>: 1 }]`", () => {
    const stmt = (kw: string): string => `let x = [schema T { a: "s", ${kw}: 1 }]`;
    expectSweep(
      "sb1",
      (kw) => withT(stmt(kw)),
      (kw) => [
        extraFieldAt(kw, "T", 5, literalSpan(stmt(kw), "T {")),
        reservedTok(kw, 5, keyColumn(stmt(kw), kw)),
      ],
      WHY,
    );
  });

  it("sb2: `g(schema T { a: \"s\", <kw>: 1 })`", () => {
    const stmt = (kw: string): string => `g(schema T { a: "s", ${kw}: 1 })`;
    expectSweep(
      "sb2",
      (kw) => `${FM}${SCHEMA_T}\nfn g(p: T): number { 1 }\n${stmt(kw)}\n`,
      (kw) => [
        extraFieldAt(kw, "T", 6, literalSpan(stmt(kw), "T {")),
        reservedTok(kw, 6, keyColumn(stmt(kw), kw)),
      ],
      WHY,
    );
  });
});

// ===========================================================================
// (c) The three mis-split shapes — §Reproduction (C). Refused today, but by
// bug 0153's DECLARATION leaf answering a re-read `schema T { … }`, not by the
// literal leaf. Each must keep exactly the list it carries.
// ===========================================================================

describe("0249 (c) — the shapes that look covered, and are covered by another leaf", () => {
  const WHY =
    "the statement mis-splits and `schema T { … }` is re-read as a schema DECLARATION, so bug " +
    "0153's `parseSchemaObjectBody` arm answers and the `let-without-initialiser` beside it is the " +
    "tell. These rows are unmoved by this report: bracketing the same constructor (b1) or passing " +
    "it as an argument (b3) removes the mis-split and is where the literal leaf must answer instead";

  it("c1: `let x = schema T { a: \"s\", let: 1 }`", () => {
    const stmt = 'let x = schema T { a: "s", let: 1 }';
    expectRow(
      "c1",
      withT(stmt),
      [
        letNoInitialiserAt("x", 5, stmt),
        reservedTok("let", 5, keyColumn(stmt, "let")),
      ],
      WHY,
    );
  });

  it("c2: `let x: T = schema T { a: \"s\", let: 1 }`", () => {
    const stmt = 'let x: T = schema T { a: "s", let: 1 }';
    expectRow(
      "c2",
      withT(stmt),
      [
        letNoInitialiserAt("x", 5, stmt),
        reservedTok("let", 5, keyColumn(stmt, "let")),
      ],
      WHY,
    );
  });

  it("c3: `fn g(): T { schema T { a: \"s\", let: 1 } }`", () => {
    const stmt = 'fn g(): T { schema T { a: "s", let: 1 } }';
    expectRow(
      "c3",
      withT(stmt),
      [reservedTok("let", 5, keyColumn(stmt, "let"))],
      WHY,
    );
  });
});

// ===========================================================================
// (g) The GENUINE subjects of `theta/parse/single-line-if` — §Fix constraint 5.
// ===========================================================================

describe("0249 (g) — the row this fix withdraws from two key positions keeps its own subjects", () => {
  const WHY =
    "code-registry-parse.md:23's *Trigger* is a body that is not a braced block, and these two rows " +
    "ARE that. §Fix edit 3 narrows the `controlHeads` scan at a key slot only — a token after `{` / " +
    "`,` / a statement separator inside a brace region whose NEXT token is `:` — so a red here is " +
    "over-reach that removed the row from the inputs it exists for";

  it("g1: `if (b) 1` keeps `theta/parse/single-line-if`", () => {
    // The condition is a `boolean` binding so the type layer's own
    // `non-boolean-condition` stays out of the list and the row is isolated.
    expectRow("g1", `${FM}let b = true\nif (b) 1\n1\n`, [singleLineIfAt("if", 5, 1)], WHY);
  });

  it("g2: `fn f(): number 1` keeps `theta/parse/single-line-if`", () => {
    expectRow("g2", `${FM}fn f(): number 1\n1\n`, [singleLineIfAt("fn", 4, 1)], WHY);
  });
});
