import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import { lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  parseTypeExpression,
  type TypeCheckSite,
  type TypePosition,
} from "../src/parser/type-grammar";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0045 — `grammar.md`'s empty-inline-object rule is unimplemented at every
// `Type` position: `{}` written as a type draws no `theta/parse/empty-schema-body`
// anywhere
// (docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md §"Inline object types" — "`ObjectType` admits
//     an anonymous object type `{ field: T, ... }` in any `Type` position … An
//     empty inline object `{}` is `theta/parse/empty-schema-body`, the same
//     diagnostic an empty named schema body raises. The `Type` reference inside
//     each field is recursive, so nested inline objects and `array<{ ... }>`
//     parse." The rule is unqualified by position and by nesting depth.
//   - :105 — the bare-`Type` position enumeration: `let` annotations, `fn`
//     parameter types, schema field types, `params:` field types, generic type
//     arguments, union arms, and `invoke<Type>` / type-ascription contexts. The
//     `fn` / theta return position takes `ReturnType`, which is `Type` plus
//     `void`.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, which is why the sixteen fixtures below answer alike.
//   - docs/spec_topics/schemas.md §Object schema — the named-body sentence the
//     grammar defers to, and the source of the *Message*.
//   - docs/spec_topics/schema-subset.md §Lowering Algorithm — an inline object
//     in any type position hoists into `$defs`. An empty one is refused before
//     that step, so no lowering of it is specified — neither the closed
//     `@<{}>` fragment nor the permissive `{}`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md — the
//     `theta/parse/empty-schema-body` row: severity `E`, phase `parse`,
//     *Message* `'<X>' has no fields; an empty schema cannot be validated.`,
//     no *Hint*. §Fix widens its *Trigger* to the inline case in the same
//     commit and leaves the *Message* untouched.
//   - DIAG-4 fixes that *Message* character-for-character with its placeholder
//     interpolated, so every expected string here is read out of the registry
//     through `registryMessage`; no message prose is copied.
//   - docs/reference/grammar.md — the user-facing mirror of the same rule.
//
// EXPECTED CONCRETELY (§Expected behaviour, §Fix): exactly ONE
// `theta/parse/empty-schema-body` per empty-inline-object occurrence, at error
// severity, in source order, at every position and every nesting depth. `<X>`
// interpolates as `{}` — an anonymous type carries no name, so the author's own
// two bytes are the subject. The declaration positions keep `'S'` / `'X'`.
//
// THE TWO MECHANISMS §Fix NAMES, as they stand at HEAD (0.56.0):
//   1. THE TYPE-GRAMMAR WALK HAS NO RULE FOR IT. `TypeParser.parseObject`
//      (src/parser/type-grammar.ts) reads `{}` into `{kind:"object",
//      fieldTypes: []}` and `walkType`'s `object` arm iterates that empty list
//      and returns. The seam header and the walk's own doc comment each
//      enumerate three checks (`void`, generic arity, `Result`); this rule is
//      in neither. Every position that calls `parseTypeExpression` inherits the
//      omission.
//   2. ONE POSITION STILL RUNS NO TYPE-GRAMMAR PASS. `walkExpr`'s `invoke` arm
//      walks the arguments only, so the `<T>` return annotation reaches no
//      check pass at all. The bug doc's other two unwired positions — the
//      `@<T>` annotation root and the `params:` per-field loop — were wired by
//      bug 0044's fix (0.54.0) and now run the FULL walk, so they close with
//      mechanism 1 and need no new call site; group (i) pins that the invoke
//      call site §Fix adds selects THIS rule alone and does not import the
//      other three with it.
//
// PROBED CURRENT SIGNATURES (HEAD f8646659 / 0.56.0, offline, deterministic).
// Byte-identical to the bug doc's §Reproduction tables at 0.45.0 for this
// rule — every one of the sixteen matrix rows, the `.thetalib` spelling and all
// twenty-one seam cells produce `[]`. The declaration controls fire as the doc
// records: `schema S { }`, headless `schema S` and the mis-shaped
// `schema X { "a": string }` each render one `'S'` / `'X'` line.
//
// THE UNION-ARM CELLS ARE WRITTEN AT BOTH POSITIONS. A `Type` position consumes
// the whole `Type ("|" Type)*` extent wherever it appears — the alias
// right-hand side of `grammar.md:175` and a schema field type of `:105` are one
// grammar (type-system.md:15) — so `schema X = {} | null` and
// `schema S { f: {} | null }` render the SAME single inline line, and each arm
// order is asserted at each position (a2 / a2b, c1 / c1b). e5 guards the
// absence a schema field adds to that claim: a declaration that declares a
// field is not field-less, so no `'S'` declaration line may join the arm's.
//
// WHAT IS RED HERE: groups (a), (b), (c), (d), (g) and (h)'s h1/h2 — every cell
// asserting the prescribed diagnostic. Groups (0), (e), (f), (i) and (h)'s h3
// are CONTROLS: green now, and green after, byte-for-byte. A red in (e) means
// the fix moved the declaration emission instead of adding an inline one; a red
// in (f), or in the silent half of (d)'s table, means it keyed on
// `fieldTypes.length === 0` — or on a token-free interior alone — rather than on
// a token-free interior WITH a closing brace, taking the tolerant-recovery
// shapes §Non-goals excludes, or the unterminated `{` the grammar admits no
// `ObjectType` for, with it.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, or one direct
// `parseTypeExpression` / lowerer call. The observable is a parse-time
// diagnostic list: an integration tier would add a session round-trip to it and
// could assert neither the PRESENCE of a parse diagnostic nor the ABSENCE of
// one in the control groups any more sharply, and a live tier would make the
// assertion stochastic on top. `parseDoc` (tests/helpers/e2e-s1.ts) is the
// shipped load path wrapped in the standard inert `parseDeps` double — the
// harness the bug doc's own §Reproduction used.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. Every
// registry lookup asserts its row's presence and its placeholder before the
// template is used, so a missing or reworded row reds by naming the registry
// rather than by a silently-wrong expectation; every fixture asserts its whole
// ordered diagnostic list, so an absent emission can never read as a pass.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

const REGISTRY = parseRegistry(
  [
    "code-registry-parse.md",
    "code-registry-load.md",
    "code-registry-runtime.md",
    "code-registry-host.md",
  ]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

/** The one code this rule emits, at the inline positions and the declaration ones alike. */
const EMPTY_BODY = "theta/parse/empty-schema-body";

/**
 * The registry row's normative *Message* template with its named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so
 * a missing row or a reworded template reds by naming the registry rather than
 * by a bare `undefined` comparison.
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

/** One rendered error diagnostic, in the shape `diagLines` produces. */
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

/**
 * The rendering for an EMPTY INLINE OBJECT. `<X>` interpolates as the author's
 * own two bytes: an anonymous type carries no name, and §Fix forbids a reword
 * (DIAG-4 defers wording changes to theta 2.0).
 */
function inlineLine(): string {
  return line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]]));
}

/** The rendering for a DECLARATION that yields no fields — `'S'` / `'X'`, unchanged. */
function declLine(name: string): string {
  return line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", name]]));
}

/**
 * Bug 0244 (operator adjudication)'s refusal for a discarded KEYLESS inline
 * object entry. `{ a }`'s lone entry `a` reaches the field-name position as an
 * `ident` and then spells no `:`, so `TypeParser.parseObject`'s COLON-GATE arm
 * now refuses it. The seam table's §(d) framing keys the malformed-but-
 * non-empty family on `fieldTypes.length === 0` rather than on "draws
 * nothing", so this added line falsifies no key that framing states: the cells
 * report `[]` at HEAD `537c274c` and the flip observed under this change is an
 * ADDED code, distinct from `inlineLine()`'s.
 */
function malformedFieldLine(): string {
  const code = "theta/parse/malformed-schema-field";
  return line(code, "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'");
}

/** The code bug 0176 §Fix route A adds for a QUOTED inline field-name key. */
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";

/**
 * The rendering for a quoted inline field-name key (bug 0176 §Fix route A): the
 * subject is the entry's raw pre-colon text after `trim()`, rendered verbatim by
 * that row's own `<field>` carve-out (placeholder-rendering-b.md:10).
 */
function quotedInlineLine(field: string): string {
  return line(QUOTED_INLINE, msg(QUOTED_INLINE, [["<field>", field]]));
}

// ===========================================================================
// Fixtures. One builder per position of grammar.md's enumeration. Every body
// fixture ends `let a = 1` + `a` so the theta carries a tail expression, and
// every `params:` fixture carries `mode: prompt` so no `theta/load/missing-mode`
// noise is present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The `invoke<T>` return annotation, the one position running no walk at HEAD. */
function invokeSrc(type: string): string {
  return body(`let r = invoke<${type}>("./x.theta")`);
}

// ===========================================================================
// Parse + assertion helpers. Loud on every unexpected disposition.
// ===========================================================================

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "bug0045.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/**
 * The whole ordered diagnostic list of one source, asserted against `expected`.
 * A whole-list equality is what makes both directions reachable: an absent
 * emission and an extra one both red, and the multiplicity claims of group (g)
 * are only meaningful against a whole list.
 */
function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}

/** The seam's located site. The range is not under assertion; the emission is. */
const SEAM_RANGE: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};
const SEAM_SITE: TypeCheckSite = { file: "bug0045.theta", range: SEAM_RANGE };

/** `parseTypeExpression` over one source at one position, rendered as lines. */
function seamLines(source: string, position: TypePosition): string[] {
  return parseTypeExpression(source, position, SEAM_SITE).map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

/** A `LowerCtx` over an EMPTY resolution set — no declaration resolves anything. */
function emptyCtx(): LowerCtx {
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
}

// ===========================================================================
// (0) THE ORACLE ITSELF — green now and after. Every expected string in this
// file is derived from the registry row, so a red here invalidates the rest.
// ===========================================================================

describe("bug 0045 (0) — the registry is the message oracle", () => {
  it("0a: the `empty-schema-body` row exists and carries the single `<X>` placeholder", () => {
    // DIAG-2: the registry is the closed authority for what the implementation
    // emits, so an expectation naming a code the registry does not carry is
    // unfalsifiable. §Fix widens this row's *Trigger* only — the code, the
    // severity and the *Message* are the ones already in the tree.
    const template = registryMessage(REGISTRY, EMPTY_BODY) as string | undefined;
    expect(
      template,
      "0a — docs/spec_topics/diagnostics/code-registry-parse.md must carry the " +
        `${EMPTY_BODY} row; it is the registered disposition grammar.md §"Inline object types" ` +
        "defers to for the empty inline object",
    ).toBeDefined();
    expect(
      template,
      "0a — the Message template must carry the `<X>` placeholder, or the diagnostic cannot " +
        "name WHAT was refused",
    ).toContain("<X>");
  });

  it("0b: the inline subject renders the author's own two bytes, the declaration subject its name", () => {
    // §Fix: "`<X>` interpolates as `{}` at the inline positions … `schema X = {}`
    // is an inline object in a `Type` position and renders `'{}'`, not `'X'`;
    // the declaration positions keep `'X'`." The two renderings must differ, or
    // the matrix below and the controls of group (e) would be asserting the
    // same string and neither could falsify the other.
    expect(
      inlineLine(),
      "0b — the inline rendering is the registry Message with `<X>` filled as `{}`, never " +
        "copied prose",
    ).toBe(`error ${EMPTY_BODY}: '{}' has no fields; an empty schema cannot be validated.`);
    expect(
      declLine("S"),
      "0b — the declaration rendering keeps the declared name, byte-unchanged",
    ).toBe(`error ${EMPTY_BODY}: 'S' has no fields; an empty schema cannot be validated.`);
    expect(
      inlineLine(),
      "0b — an anonymous type has no name to interpolate, so the two subjects are distinct " +
        "and group (e)'s controls cannot be satisfied by an inline emission",
    ).not.toBe(declLine("S"));
  });
});

// ===========================================================================
// (a) THE POSITION MATRIX — the bug doc's §Reproduction table, one cell per
// row, each asserting exactly ONE registry-sourced line.
// RED at HEAD: all sixteen produce `[]` (probed).
// ===========================================================================

describe("bug 0045 (a) — every `Type` position refuses an empty inline object", () => {
  it("RED a1 (alias / union RHS): `schema X = {}`", () => {
    // The alias right-hand side is a `Type` position (bug 0033's fix wired
    // `parseTypeExpression` here), and the arm is captured correctly — the
    // declaration's own `arms` is `["{}"]` — so the subject is the arm's two
    // bytes, not the declaration's name.
    expectList(
      body("schema X = {}"),
      [inlineLine()],
      "a1 — an alias RHS carrying one arm is not a field-less DECLARATION; the arm is an " +
        "inline object in a `Type` position, so the inline subject applies",
    );
  });

  it("RED a2 (alias arm in a union): `schema X = {} | null`", () => {
    // The alias right-hand side captures `arms: ["{}", "null"]`, so exactly the
    // empty arm is refused and the `null` arm contributes nothing. Its
    // schema-field twin a2b asserts the same single line one position along:
    // `Type ("|" Type)*` is one grammar in every position (grammar.md:105,
    // type-system.md:15), so the two spellings cannot disagree.
    expectList(
      body("schema X = {} | null"),
      [inlineLine()],
      "a2 — grammar.md:105 names a union arm a bare-`Type` position, and the walk already " +
        "descends union arms, so one arm's emptiness is one diagnostic",
    );
  });

  it("RED a2b (union arm at the schema-FIELD position): `schema S { f: {} | null }`", () => {
    // a2 one position along. The field IS captured — `fields: [{name:"f",
    // typeSource:"{}|null"}]` — so the declaration is not field-less and the
    // `'S'` declaration rendering must NOT appear; the empty ARM alone is
    // refused, with the inline subject. e5 pins the same fixture's whole list
    // from the declaration-control side.
    expectList(
      body("schema S { f: {} | null }"),
      [inlineLine()],
      "a2b — schemas.md:17 makes `T | null` the only spelling for an optional field and " +
        "grammar.md:109 admits `ObjectType` in any `Type` position, so this is a2's spelling at " +
        "the position an author writing an optional inline-object field must use",
    );
  });

  it("RED a3 (schema body field type): `schema S { f: {} }`", () => {
    // The field IS captured (`fields: [{name:"f", typeSource:"{}"}]`), so the
    // declaration is not field-less and the `'S'` declaration rendering must
    // NOT appear — the whole-list equality is what pins that.
    expectList(
      body("schema S { f: {} }"),
      [inlineLine()],
      "a3 — the declaration declares a field, so `checkObjectSchema`'s zero-field arm does " +
        "not apply; the emission is the field TYPE's, with the inline subject",
    );
  });

  it("RED a4 (the same, whitespace interior): `schema S { f: {   } }`", () => {
    // §Fix keys the rule on whether the brace interior carried any TOKEN, and
    // whitespace is not a token — the tokeniser discards it before `parseObject`
    // sees the interior, so this fixture and a3 are the same input to the rule.
    expectList(
      body("schema S { f: {   } }"),
      [inlineLine()],
      "a4 — an interior of whitespace alone carries no token, so it is the same empty inline " +
        "object as `{}` and draws the same single line",
    );
  });

  it("RED a5 (nested inline object): `schema S { f: { g: {} } }`", () => {
    // The recursion clause of the rule: the OUTER object declares a field and
    // is not empty, so exactly the inner one is refused. Group (g) pins the
    // count claim this cell rests on.
    expectList(
      body("schema S { f: { g: {} } }"),
      [inlineLine()],
      "a5 — grammar.md makes each field's `Type` recursive and the rule is unqualified by " +
        "nesting depth, so the INNER object alone is the occurrence",
    );
  });

  it("RED a6 (generic argument): `schema S { f: array<{}> }`", () => {
    // `walkType` already descends generic arguments, so the element type is a
    // `Type` position reached by the same walk.
    expectList(
      body("schema S { f: array<{}> }"),
      [inlineLine()],
      "a6 — grammar.md:105 names a generic type argument a bare-`Type` position; an empty " +
        "element type is refused exactly as a bare one is",
    );
  });

  it("RED a7 (`let` annotation): `let x: {} = 1`", () => {
    // The `let` annotation is wired to `parseTypeExpression` at position
    // `"value"`. The initialiser mismatch check is silent for this annotation
    // today and stays silent, so the whole list is the one line.
    expectList(
      body("let x: {} = 1"),
      [inlineLine()],
      "a7 — a `let` annotation is a bare-`Type` position (grammar.md:105), and the rule is " +
        "unqualified by position",
    );
  });

  it("RED a8 (`fn` parameter type): `fn f(p: {}) { 1 }`", () => {
    expectList(
      body("fn f(p: {}) { 1 }"),
      [inlineLine()],
      "a8 — a `fn` parameter type is a bare-`Type` position (grammar.md:105)",
    );
  });

  it("RED a9 (`fn` return type): `fn f(): {} { 1 }`", () => {
    // The return position takes `ReturnType` — `Type` plus `void` — so an
    // `ObjectType` is admitted here and the emptiness rule reaches it. The
    // declaration captures `returnType: "{}"`, so the walk sees the object node
    // and not the following body block.
    expectList(
      body("fn f(): {} { 1 }"),
      [inlineLine()],
      "a9 — `ReturnType` is `Type` plus `void`, so an empty `ObjectType` is as refused in a " +
        "return annotation as in any other",
    );
  });

  it("RED a10 (`@<T>` annotation root): ``let r = @<{}>`hi` ``", () => {
    // The type-ascription context. Bug 0044's fix wired `parseTypeExpression`
    // here at position `"value"`, so this position closes with the walk rule and
    // needs no new call site.
    expectList(
      annotSrc("{}"),
      [inlineLine()],
      "a10 — the `@<T>` annotation is a type ascription (grammar.md:105), and QRY-22 " +
        "enforces the lowered annotation against the reply; the empty one is the input this " +
        "rule keeps out of that boundary",
    );
  });

  it("RED a11 (`@<T>` annotation, nested): ``let r = @<{a: {}}>`hi` ``", () => {
    // The outer object declares a field, so exactly the inner empty one is the
    // occurrence — the annotation-root twin of a5.
    expectList(
      annotSrc("{a: {}}"),
      [inlineLine()],
      "a11 — the recursion clause holds at the ascription position too; the non-empty root " +
        "contributes nothing",
    );
  });

  it("RED a12 (`invoke<T>` annotation): `let r = invoke<{}>(\"./x.theta\")`", () => {
    // The one position running no type-grammar pass at HEAD: `walkExpr`'s
    // `invoke` arm walks the arguments only, so the captured `returnSchema`
    // reaches no check. §Fix adds one call site here selecting THIS rule alone;
    // group (i) pins the "alone".
    expectList(
      invokeSrc("{}"),
      [inlineLine()],
      "a12 — grammar.md:105 names `invoke<Type>` a bare-`Type` position, and ceiling #4 " +
        "enforces the lowered annotation against the child's return value",
    );
  });

  it("RED a13 (`params:` field, quoted): `p: \"{}\"`", () => {
    // Bug 0044's fix wired `parseTypeExpression` into `parseParams`'s per-field
    // loop at position `"schema-feeding"`, so this position closes with the walk
    // rule. Bug 0035 §Expected left this case open deliberately; this report
    // owns it.
    expectList(
      paramsSrc('  p: "{}"'),
      [inlineLine()],
      "a13 — a `params:` field type is the same type grammar as every other position " +
        "(frontmatter-fields-a.md:58, type-system.md:15); a `{}` field validates nothing at " +
        "the argument boundary",
    );
  });

  it("RED a14 (`params:` field, flow mapping): `p: {}`", () => {
    // The second surface spelling. Both normalise to the same declared type
    // source (`type: "{}"`, probed), so the single call over the field's
    // declared type source covers both — which is why both are pinned.
    expectList(
      paramsSrc("  p: {}"),
      [inlineLine()],
      "a14 — the YAML flow-mapping spelling declares the same field type as the quoted one, " +
        "so it answers alike",
    );
  });

  it("RED a15 (`params:` field, nested): `p: \"{a: {}}\"`", () => {
    expectList(
      paramsSrc('  p: "{a: {}}"'),
      [inlineLine()],
      "a15 — §Fix runs the check over the field's DECLARED type source rather than inside " +
        "`lowerParamsFieldType`, so a nested spelling is refused exactly as its schema-field " +
        "twin (a5) is",
    );
  });

  it("RED a16 (`params:` field, generic): `p: \"array<{}>\"`", () => {
    // Bug 0035's scope-bound cell e6 pins today's `items: {}` lowering for this
    // source; §Fix inverts that cell in the same commit, and this is the
    // inversion's parse-side half.
    expectList(
      paramsSrc('  p: "array<{}>"'),
      [inlineLine()],
      "a16 — the generic argument is a `Type` position at the `params:` RHS as everywhere " +
        "else, so `array<{}>` is refused exactly as `array<{}>` in a schema field (a6) is",
    );
  });
});

// ===========================================================================
// (b) THE `.thetalib` SPELLING. imports.md's `.thetalib` top-level rules admit
// `schema` declarations, and the type grammar does not vary by file kind.
// RED at HEAD: `[]`.
// ===========================================================================

describe("bug 0045 (b) — a `.thetalib` module refuses the same two bytes", () => {
  it("RED b1: `schema X = {}` + `schema S { f: {} }` in a `.thetalib` raises twice, in source order", () => {
    // Two occurrences, one per declaration, in the order they are written. The
    // `.thetalib` extension changes only the top-level-form check, which admits
    // both declarations, so the emission is the `.theta` behaviour of a1 and a3
    // concatenated.
    expect(
      lines("schema X = {}\nschema S { f: {} }\n", "bug0045.thetalib"),
      "b1 — a `.thetalib` carries the same type grammar as a `.theta` (type-system.md:15), " +
        "and an importer binding either declaration would otherwise inherit a shape that " +
        "validates nothing",
    ).toEqual([inlineLine(), inlineLine()]);
  });
});

// ===========================================================================
// (c) DEPTH AND ARM POSITION beyond the matrix rows — the arm on the other
// side of the `|`, an empty object one level inside an alias arm, a generic
// argument at the alias position, and a doubly-nested generic element type.
// Each union-arm cell is written at the ALIAS position and again at the
// schema-FIELD position (c1, c1b), because `Type ("|" Type)*` is one grammar in
// every position (grammar.md:105) and the two spellings must answer alike.
// RED at HEAD: all five `[]`.
// ===========================================================================

describe("bug 0045 (c) — the rule is unqualified by depth or arm position", () => {
  it("RED c1: `schema X = null | {}` — the empty arm SECOND", () => {
    // a2's mirror. The capture is arm-order-independent (`arms: ["null","{}"]`,
    // probed), so a rule keyed on the first arm alone would pass a2 and red here.
    expectList(
      body("schema X = null | {}"),
      [inlineLine()],
      "c1 — the walk descends every arm, so the diagnostic does not depend on which side of " +
        "the `|` the empty object is written",
    );
  });

  it("RED c1b: `schema S { f: null | {} }` — the empty arm SECOND, at the schema-FIELD position", () => {
    // c1 one position along, and the pair that pins arm-order independence of
    // the CAPTURE as well as of the walk: the captured field type is
    // `null|{}`, so a capture that only reached a LEADING brace group would
    // pass a2b and red here.
    expectList(
      body("schema S { f: null | {} }"),
      [inlineLine()],
      "c1b — the arm start is the token straight after a depth-0 `|` as well as the scan's " +
        "first token, so the field's whole union reaches the walk either way",
    );
  });

  it("RED c2: `schema X = { a: {} }` — one level inside an alias arm", () => {
    expectList(
      body("schema X = { a: {} }"),
      [inlineLine()],
      "c2 — the arm is a non-empty inline object whose field type is empty; exactly the " +
        "inner occurrence is refused",
    );
  });

  it("RED c3: `schema X = array<{}>` — a generic argument at the alias position", () => {
    expectList(
      body("schema X = array<{}>"),
      [inlineLine()],
      "c3 — a6's alias-position twin: one type grammar per position (type-system.md:15)",
    );
  });

  it("RED c4: `schema S { f: array<{ a: {} }> }` — a generic element type's field", () => {
    // Two levels of descent in one source: generic argument, then inline-object
    // field. The `array<…>` element is non-empty, so the count is one.
    expectList(
      body("schema S { f: array<{ a: {} }> }"),
      [inlineLine()],
      "c4 — the walk composes its descents, so an empty object reached through a generic " +
        "argument AND an object field is still exactly one occurrence",
    );
  });
});

// ===========================================================================
// (d) THE SEAM — `parseTypeExpression` directly, over all three `TypePosition`
// values, so the rule's position-independence is pinned BY ASSERTION rather
// than inferred from the whole-document cells above.
//
// Two SILENT families travel in the same table, because between them they fix
// the rule's key. All three families satisfy `fieldTypes.length === 0`, so that
// count decides nothing:
//
//   - MALFORMED BUT NON-EMPTY — `parseObject`'s tolerant recovery (a
//     non-`ident` field name is skipped, a missing `:` breaks the loop)
//     delivers `{ a }` and `{ a: }` with an empty `fieldTypes` and a
//     token-bearing interior. grammar.md assigns a diagnostic to the empty case
//     alone (§Non-goals).
//   - UNTERMINATED — `ObjectType ::= "{" Field ("," Field)* ","? "}"`
//     (grammar.md §"Type grammar") spells the closing brace, so `{`, `array<{`,
//     `null | {` and `{ a: {` write no inline object type at all and carry no
//     `{}` for the row's *Message* to name. The tolerant parser still hands the
//     walk an object node with a token-free interior, so a key on emptiness
//     alone would take them with it.
//
// `{ a: {}` is the second family's other direction — an outer brace that never
// closes around an inner one that does — and draws exactly one line, so the
// closing-brace half of the key is falsifiable both ways.
// RED at HEAD: the six empty-bearing sources in each of the three positions.
// The two silent families are silent at HEAD and stay silent.
// ===========================================================================

/**
 * The seam table: each source paired with the number of registry-sourced lines
 * it must draw, in one order shared by the three position cells.
 */
// Bug 0244 (operator adjudication) flip: `{ a }`'s lone entry is keyless and
// carries no stray close token, so it now draws `malformedFieldLine()` — an
// ADDED line, distinct from `inlineLine()`'s empty-schema-body row (which
// remains the seven `EMPTY_BODY`-drawing sources' own line). `expectedLines`
// carries the exact expected array per source rather than a repeat count, so
// the two codes are not conflated.
const SEAM_SOURCES: ReadonlyArray<readonly [source: string, expectedLines: readonly string[]]> = [
  ["{}", [inlineLine()]],
  ["{   }", [inlineLine()]],
  ["{ a: {} }", [inlineLine()]],
  ["array<{}>", [inlineLine()]],
  ["{} | null", [inlineLine()]],
  ["{ a }", [malformedFieldLine()]],
  ["{ a: }", []],
  ["{", []],
  ["{ ", []],
  ["array<{", []],
  ["null | {", []],
  ["{ a: {", []],
  ["{ a: {}", [inlineLine()]],
];

/** One position's whole column, actual beside expected, as a single comparison. */
function seamColumn(position: TypePosition): {
  readonly actual: Record<string, string[]>;
  readonly expected: Record<string, string[]>;
} {
  const actual: Record<string, string[]> = {};
  const expected: Record<string, string[]> = {};
  for (const [source, expectedLines] of SEAM_SOURCES) {
    actual[source] = seamLines(source, position);
    expected[source] = [...expectedLines];
  }
  return { actual, expected };
}

describe("bug 0045 (d) — the type-grammar seam raises at every `TypePosition`", () => {
  for (const position of ["value", "return", "schema-feeding"] as const) {
    it(`RED d-${position}: \`parseTypeExpression\` refuses the empty interior at position \`${position}\``, () => {
      // A whole-column comparison rather than a per-source loop: the claim is
      // that all seven answer alike at this position, and a loop of separate
      // assertions stops at the first divergence and hides the rest.
      const { actual, expected } = seamColumn(position);
      expect(
        actual,
        `d-${position} — grammar.md states the rule with no position qualifier, and the walk ` +
          "owns it, so the three `TypePosition` values cannot disagree; the " +
          "malformed-but-non-empty interiors and the unterminated braces stay silent because " +
          "the rule keys on a token-free interior WITH a closing brace, not on the field count",
      ).toEqual(expected);
    });
  }
});

// ===========================================================================
// (e) THE DECLARATION CONTROLS — byte-unchanged. §Fix keeps the construction
// point single, so `checkObjectSchema`'s zero-field arm and bug 0033's
// mis-shaped-head disposition render exactly as they do today, with the
// DECLARED NAME as the subject.
// GREEN now and after. A red here means the fix moved the existing emission
// instead of adding an inline one.
// ===========================================================================

describe("bug 0045 (e) — the declaration positions keep their name and their bytes", () => {
  it("CONTROL e1: `schema S { }` keeps the `'S'` rendering", () => {
    expectList(
      body("schema S { }"),
      [declLine("S")],
      "e1 — the standing empty-body rejection (code-registry-parse.md), unchanged: the " +
        "subject is the declaration's name because a DECLARATION has one",
    );
  });

  it("CONTROL e2: a headless `schema S` keeps the `'S'` rendering", () => {
    // Bug 0033's disposition for a shape-less head, which synthesises a
    // zero-field decl and calls the same construction point.
    expectList(
      body("schema S"),
      [declLine("S")],
      "e2 — bug 0033's mis-shaped-head disposition routes through the same single " +
        "construction point, so it renders identically",
    );
  });

  it("CONTROL e3: a mis-shaped head `schema X { \"a\": string }` keeps the `'X'` rendering", () => {
    // The 0033 shape whose brace body captures no `ident: Type` field. The
    // declaration is field-less, so the DECLARATION rendering applies — and the
    // interior carries tokens, so no inline emission joins it.
    expectList(
      body('schema X { "a": string }'),
      [declLine("X")],
      "e3 — a brace body that captures no field yields a field-less declaration, which is " +
        "the declaration case; the quoted key is a token, so the inline rule does not fire " +
        "beside it",
    );
  });

  it("CONTROL e4: `schema X = { a: string }` stays silent", () => {
    expectList(
      body("schema X = { a: string }"),
      [],
      "e4 — a non-empty inline object is legal theta in every `Type` position; the rule " +
        "names the empty case and no other",
    );
  });

  it("CONTROL e5: `schema S { f: {} | null }` renders the INLINE `'{}'` line, not the `'S'` one", () => {
    // The rule in force: a schema-field type consumes the whole `Type ("|"
    // Type)*` extent, so this declaration captures one field `f` and is not
    // field-less. `checkObjectSchema`'s zero-field arm therefore has no subject,
    // and the only occurrence is the empty ARM — which renders the inline
    // subject. This cell sits in the declaration-control group because what it
    // guards is the ABSENCE of the `'S'` rendering: a fix that reintroduced a
    // declaration-subject line for a declaration that declares a field would
    // red here while a2b still passed.
    expectList(
      body("schema S { f: {} | null }"),
      [inlineLine()],
      "e5 — code-registry-parse.md:86's declaration clauses describe a body that yields no " +
        "usable content; `{} | null` is a `Type` (grammar.md:94), so the body DOES begin with a " +
        "plain `ident: Type` field and no declaration clause applies — only the inline one",
    );
  });
});

// ===========================================================================
// (f) THE SHAPES THAT ARE NOT AN EMPTY INLINE OBJECT — still silent. Two
// families, each of which a rule keyed on `fieldTypes.length === 0` would take
// with it:
//
//   - A MALFORMED BUT NON-EMPTY INTERIOR (f1–f4). `parseObject`'s tolerant
//     recovery skips a non-`ident` field name and breaks on a missing `:`, so
//     `{ a }`, `{ "a": string }` and `{ a: }` also arrive with an empty
//     `fieldTypes`. grammar.md assigns a diagnostic to the EMPTY case only, and
//     widening the inline rule to these shapes needs its own spec decision
//     (§Non-goals).
//   - AN UNTERMINATED BRACE (f5). `ObjectType` spells a closing `}`, so a
//     source that never closes one writes no inline object type, and the row's
//     *Message* would name a `{}` the source does not contain. The seam table
//     of group (d) carries this family too; f5 carries it at the document
//     level, at the four positions whose CLOSED spellings a10, a12, a13 and a16
//     pin as raising.
//
// GREEN now and after. This group is what pins both halves of the key.
// ===========================================================================

describe("bug 0045 (f) — a malformed or unterminated brace is not an empty one", () => {
  it("RED f1: `schema S { f: { a } }` now draws bug 0244's keyless-entry refusal", () => {
    // Bug 0244 (operator adjudication) flip: `{ a }`'s lone entry `a` spells no
    // top-level `:`, so it is refused ahead of — not instead of — this rule's
    // own empty-schema-body check, which still stays silent (the interior
    // carries a token). The whole-list assertion states both facts at once.
    expectList(
      body("schema S { f: { a } }"),
      [malformedFieldLine()],
      "f1 — the interior carries a token, so this is not the empty case; the field IS discarded " +
        "as a keyless entry and draws bug 0244's refusal, added rather than substituted",
    );
  });

  it("CONTROL f2: `schema S { f: { \"a\": string } }` draws bug 0176's quoted-key refusal and NOT this rule's", () => {
    // WHY THIS LINE MOVED: bug 0176 §Fix route A refuses a non-repeating inline
    // field-name key whose first character is a quote, at `inlineObjectFieldKeys`
    // and behind this rule's own two gates — this cell's subject (no
    // `empty-schema-body` over a NON-EMPTY interior) is preserved by asserting
    // the whole list, which names the other row and never this one.
    expectList(
      body('schema S { f: { "a": string } }'),
      [quotedInlineLine('"a"')],
      "f2 — a non-`ident` field name is skipped by the tolerant recovery and yields no field " +
        "type, which is indistinguishable from emptiness by field count and distinguishable " +
        "by interior token: this interior is not empty, so `theta/parse/empty-schema-body` " +
        "stays absent however the quoted key is otherwise disposed of",
    );
  });

  it("CONTROL f3: `schema S { f: { a: } }` stays silent", () => {
    expectList(
      body("schema S { f: { a: } }"),
      [],
      "f3 — a missing type after the `:` breaks the field loop, so the field count is zero " +
        "and the interior is not",
    );
  });

  it("RED f4: `let x: { a } = 1` now draws bug 0244's keyless-entry refusal", () => {
    // The same family at a second position: bug 0244's scoping is
    // position-independent, exactly as §(b) of its own witness states.
    expectList(
      body("let x: { a } = 1"),
      [malformedFieldLine()],
      "f4 — the malformed-interior exclusion from THIS rule (empty-schema-body) is " +
        "position-independent; bug 0244's own refusal is position-independent too",
    );
  });

  it("CONTROL f5: an unterminated `{` stays silent at every document position", () => {
    // The four positions a13, a16, a12 and a10 pin as RAISING for their closed
    // spellings (`{}`, `array<{}>`), so this table's silence is a claim about
    // the absent `}` rather than about the positions. A whole table rather than
    // four cells: the claim is that all four answer alike, and separate
    // assertions would stop at the first divergence.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    const cells: ReadonlyArray<readonly [string, string]> = [
      ['params: p: "{"', paramsSrc('  p: "{"')],
      ['params: p: "array<{"', paramsSrc('  p: "array<{"')],
      ["invoke<{>", invokeSrc("{")],
      ["@<{>", annotSrc("{")],
    ];
    for (const [label, src] of cells) {
      actual[label] = lines(src);
      expected[label] = [];
    }
    expect(
      actual,
      "f5 — `ObjectType` requires the closing brace (grammar.md §\"Type grammar\"), so an " +
        "unterminated `{` is no inline object type; DIAG-2 keeps the emission inside the row, " +
        "and the row's *Message* would otherwise name a `{}` these sources do not contain",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (g) MULTIPLICITY — one diagnostic per empty inline object OCCURRENCE, in
// source order, with no dedup rule (§Fix).
// RED at HEAD: both `[]`.
// ===========================================================================

describe("bug 0045 (g) — one diagnostic per occurrence", () => {
  it("RED g1: `schema S { f: {}, g: {} }` raises TWICE", () => {
    // Two fields, each with `typeSource: "{}"` (probed), so two occurrences and
    // two lines. A per-declaration dedup would give one and red here.
    expectList(
      body("schema S { f: {}, g: {} }"),
      [inlineLine(), inlineLine()],
      "g1 — §Fix: one diagnostic per occurrence, in source order, no dedup rule; two sibling " +
        "empty field types are two occurrences",
    );
  });

  it("RED g2: `schema S { f: { g: {} } }` raises ONCE", () => {
    // One field with `typeSource: "{g:{}}"` (probed): the outer object declares
    // a field and is not an occurrence. This is the bound on g1 — a rule that
    // raised for every object node would give two here.
    expectList(
      body("schema S { f: { g: {} } }"),
      [inlineLine()],
      "g2 — the outer inline object carries a field, so it is not empty; exactly the inner " +
        "one is the occurrence",
    );
  });

  it("RED g3: the compound `let r: {} = @…` position emits ONCE per occurrence (bug 0093)", () => {
    // §Fix's one-per-occurrence sentence now holds at this position too, not just
    // for the three single-emission controls below. A `let` annotation over a
    // query initialiser used to be checked at two sites: the annotation walk,
    // and the query arm, which re-walked the same text after `parseLet`
    // propagated the annotation into the query's schema — every walk rule
    // doubled at that one position (bug 0093). The query arm now withholds its
    // own `parseTypeExpression` pass when `QueryExpr.schemaFromLetAnnotation`
    // is `true` (`parseLet`'s marker for exactly this propagation), so the
    // statement-ranged verdict from the `let` arm survives alone.
    //
    // The arity proxy is the control that places the repair: a rule bug 0093
    // does not target (`generic-arity-mismatch`) collapses to one line here
    // identically to the empty-schema-body row, because the withhold is keyed
    // on the propagation site, not on any one rule — it silences the whole
    // re-walk, so `generic-arity-mismatch`, `void-in-non-return-position` and
    // `empty-schema-body` all stop doubling at this position at once.
    const ARITY = "theta/parse/generic-arity-mismatch";
    const LET_RHS = "theta/parse/let-rhs-type-mismatch";
    const arityLine = line(
      ARITY,
      msg(ARITY, [
        ["<ctor>", "array"],
        ["<expected>", "1"],
        ["<actual>", "2"],
      ]),
    );
    // The query initialiser's static type is a nominal placeholder the array
    // sink defers on (type-system.md §"Unresolvable operands"); the `1`
    // initialiser is a statically resolvable literal the sink decides instead
    // of deferring, which is why only that row still builds a mismatch line.
    const letRhsLine = (initialiserType: string): string =>
      line(
        LET_RHS,
        msg(LET_RHS, [
          ["<name>", "r"],
          ["<expected>", "array<string,integer>"],
          ["<actual>", initialiserType],
        ]),
      );
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      ["let r: {} = @`hi`", [inlineLine()]],
      [
        // The initialiser types as a `named` reference to the annotation text
        // itself: `parseLet` propagates the annotation onto the query, and
        // `StaticTypeInferencePass`'s `query` arm reads it back verbatim as the
        // schema name, so the sub is a `named` the TypeEnv has no declaration
        // for. The same text is also the sink: `annotationToCompatType` parses
        // it into an `array`. The array arm defers on an unresolvable `named`
        // sub (type-system.md §"Unresolvable operands") rather than comparing
        // it, because comparing it would read `expected array<string,integer>,
        // got array<string,integer>` — a type declared incompatible with
        // itself. Bug 0093's withhold applies here too: `generic-arity-mismatch`
        // now emits once, from the `let` arm alone.
        "let r: array<string, integer> = @`hi`",
        [arityLine],
      ],
      ["let r: array<string, integer> = 1", [arityLine, letRhsLine("integer")]],
      ["let r: {} = 1", [inlineLine()]],
      ["let r = @<{}>`hi`", [inlineLine()]],
      ['let r: {} = invoke("./x.theta")', [inlineLine()]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [stmt, want] of cells) {
      actual[stmt] = lines(body(stmt));
      expected[stmt] = want;
    }
    expect(
      actual,
      "g3 — the rule emits once per occurrence at every position, including the compound " +
        "annotation-plus-query position (row 1) and the untouched arity rule at that same " +
        "position (row 2 against row 3, bug 0093's fix)",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (h) LOWERING UNREACHABILITY. schema-subset.md specifies no lowering for an
// empty inline object because the rule refuses it first. The DOCUMENT-level
// claim is the assertable one: a refused fixture carries an `E`-severity
// diagnostic, so it does not load and nothing downstream is handed its lowered
// bytes. The lowerer seams themselves stay callable and byte-identical — §Fix
// keeps their zero-field arms as unreachable defence in depth — so h3 pins them
// unchanged rather than claiming they moved.
// RED at HEAD: h1, h2. GREEN: h3.
// ===========================================================================

describe("bug 0045 (h) — a refused document reaches no lowering", () => {
  it("RED h1: the `params:` fixture carries an error-severity diagnostic, so it does not load", () => {
    // The argument boundary. `parseParams` lowers `properties.p = {}` today —
    // total acceptance of every JSON value — and the refusal is what keeps that
    // fragment from ever being presented at a boundary.
    const doc = parseDoc(paramsSrc("  p: {}"), "bug0045.theta");
    const errorCodes = doc.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => d.code);
    expect(
      errorCodes,
      "h1 — GOV-15 loads-cleanly: this input carries no `E` diagnostic today, and the fix " +
        `brings it into the ${EMPTY_BODY} emission set; an `+
        `error-severity diagnostic is what refuses the theta. Observed diagnostics: ` +
        JSON.stringify(diagLines(doc)),
    ).toEqual([EMPTY_BODY]);
  });

  it("RED h2: the `@<{}>` fixture carries an error-severity diagnostic, so it does not load", () => {
    // The response boundary. QRY-22 enforces the lowered annotation against the
    // reply, and the minted closed fragment rejects every non-empty payload, so
    // the query would burn its repair rounds and terminate in a validation
    // `Err`. Nothing in that failure names the empty annotation; this refusal
    // does.
    const doc = parseDoc(annotSrc("{}"), "bug0045.theta");
    const errorCodes = doc.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => d.code);
    expect(
      errorCodes,
      "h2 — the annotation is refused at parse, so `lowerQueryResponseSchema` is never " +
        "reached through the load path and no response schema is minted from it. Observed " +
        `diagnostics: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([EMPTY_BODY]);
  });

  it("CONTROL h3: the two lowerer seams stay callable and byte-identical", () => {
    // §Fix: "The lowerers' zero-field arms stay as unreachable defence in
    // depth." The refusal is at parse time, so a direct call still answers —
    // and must answer exactly as it does today. Pinning these bytes is what
    // makes h1/h2's claim "the document does not load", not "the lowerers
    // changed"; a fix that edited a lowerer instead of adding the parse rule
    // reds here.
    const ctx = emptyCtx();
    expect(
      lowerParamsFieldType("{}", ctx),
      "h3 — the `params:` zero-field arm is unchanged; the input never reaches it through a " +
        "loading document",
    ).toEqual({});
    expect(
      lowerQueryResponseSchema("{}", []),
      "h3 — the annotation root's zero-field lowering is unchanged; under AJV this fragment " +
        "accepts `{}` and rejects every non-empty object, which is why the parse-time refusal " +
        "is the disposition and not a lowering edit",
    ).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
  });
});

// ===========================================================================
// (i) THE `invoke<T>` CALL SITE SELECTS THIS RULE ALONE. §Fix gives the invoke
// arm one `parseTypeExpression` call with this rule selected; it does not
// inherit the walk's other three checks, because none runs at this position
// today and wiring the full walk would move `generic-arity-mismatch`,
// `void-in-non-return-position` and `result-in-schema-position` at once — a
// different subject (§Non-goals, unfiled at bug 0045's own HEAD; filed and
// landed as bug 0262, which widens `unresolved-named-type` to this exact
// capture — i1's `Ghost` row now asserts that refusal instead of silence).
// GREEN now and after: i1. RED: i2's empty spellings.
// ===========================================================================

describe("bug 0045 (i) — the new `invoke<T>` call site adds one rule and no others", () => {
  it("i1: the three walk-owned checks stay silent at `invoke<T>`; the name walk now refuses `Ghost` (bug 0262)", () => {
    // The same four NON-NAME spellings the bug doc's §Reproduction records as
    // silent here, asserted as one table so a fix that wired the FULL walk
    // reds by showing exactly which rows it imported: `void-in-non-return-
    // position`, `generic-arity-mismatch` and `result-in-schema-position` stay
    // outside §Non-goals' unfiled subject.
    //
    // `Ghost` is no longer a CONTROL for `unresolved-named-type`. Bug 0045
    // §Non-goals filed the absent NAME-RESOLUTION pass at `invoke<T>` as a
    // separate, unfiled subject; bug 0262 IS that filing, and its §Fix widens
    // `unresolved-named-type` to exactly this capture. `Ghost` names no
    // declaration, so the row is STRENGTHENED rather than obstructed: the
    // question this cell asks — does an unresolvable `invoke<T>` ascription
    // draw a diagnostic? — now answers "yes", which is the widening's whole
    // point, not a regression in this row's subject.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {
      void: [],
      "array<string, integer>": [],
      "Result<string,string>": [],
      Ghost: [line("theta/parse/unresolved-named-type", msg("theta/parse/unresolved-named-type", [["<name>", "Ghost"]]))],
      "{ a: void }": [],
    };
    for (const type of Object.keys(expected)) {
      actual[type] = lines(invokeSrc(type));
    }
    expect(
      actual,
      "i1 — §Non-goals: the absent type-grammar pass at `invoke<T>` stays a separate, unfiled " +
        "subject; this fix must not make `void-in-non-return-position`, " +
        "`generic-arity-mismatch` or `result-in-schema-position` newly fire here, and bug 0262 " +
        "is what makes `unresolved-named-type` fire on `Ghost` alone",
    ).toEqual(expected);
  });

  it("RED i2: the empty spellings at `invoke<T>` raise, at the root and at depth", () => {
    // The selected rule, at the root and through each of the two descents the
    // walk performs. The count claims of group (g) hold here too: the non-empty
    // outer object contributes nothing.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const type of ["{}", "{a: {}}", "array<{}>"]) {
      actual[type] = lines(invokeSrc(type));
      expected[type] = [inlineLine()];
    }
    expect(
      actual,
      "i2 — ceiling #4 enforces the `invoke<T>` annotation against the child's return value, " +
        "so an empty annotation refuses every informative return; the rule is unqualified by " +
        "position and by depth",
    ).toEqual(expected);
  });
});
