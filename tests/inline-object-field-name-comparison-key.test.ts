import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { LetStmt, QueryExpr, SchemaDecl, ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0159 — `theta/parse/duplicate-inline-field-name` compares the field-name
// positions the TYPE GRAMMAR reads as `Ident ":"`, and that walk stops at the
// interior's first malformed position, transitively for every body enclosing
// it. The two lowerers compare nothing and split the same interior with
// `splitTopLevel` + `topLevelColon`, so every shape in the gap between the two
// tokenisations mints the last-wins property drop and the duplicate `required`
// entry the rule exists to refuse
// (docs/bugs/0159-inline-field-name-stop-masks-duplicate.md). This file is that
// report's witness, and it carries bug 0161's closure rows
// (docs/bugs/0161-quoted-inline-field-name-not-a-field.md §Fix route B), whose
// quoted-name shape the same re-key closes.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 §"Inline object types" — "A key that
//     repeats within one inline object type is
//     `theta/parse/duplicate-inline-field-name`, judged over the entries the
//     body spells between its top-level commas, on the text before each entry's
//     own top-level colon, taken as written, and raised once per repeated key in
//     source order before the body is lowered; a key reused between an outer
//     inline object and one nested inside it is two field lists rather than a
//     repeat, and a generic type argument's interior is outside that rule."
//     Both carve-outs are unmoved here (group (F)).
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, which is why the nine cells of each group (A) table must answer
//     alike.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:89 — the row itself.
//     Its *Trigger* states the comparison key, and the key is what moves: the
//     rewritten *Trigger* keys the comparison on the raw pre-colon text of a
//     brace-aware top-level comma split, after `trim()`, with no unquoting and
//     no normalisation. Group (B) is that sentence made falsifiable.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md:72) — the
//     registry is the closed authority, and a *Trigger* change lands in the
//     same commit as the code that widens the emission set.
//   - DIAG-4 (docs/spec_topics/diagnostics/diagnostic-shape.md:74) — the
//     *Message* column is normative and does NOT move: it stays
//     `duplicate field name '<field>' within one inline object type`. Every
//     expected string here is read out of the registry through
//     `registryMessage`; no message prose is copied.
//   - docs/spec_topics/diagnostics/placeholder-rendering-b.md:10 — `<field>` is
//     a category-5 source-derived placeholder, identifier-shaped and rendered
//     unquoted, plus the row-scoped carve-out this fix adds: on this row
//     `<field>` renders the row's subject verbatim — the raw pre-colon text —
//     because the re-keyed comparison can name `"a"` or `a as "w"`, neither of
//     which is identifier-shaped. The carve-out is written on the precedent of
//     `<X>`'s `{}` carve-out for `theta/parse/empty-schema-body` at
//     docs/spec_topics/diagnostics/placeholder-rendering-b.md:55.
//   - docs/spec_topics/governance/source-language-stability.md:9 — the
//     loads-cleanly predicate (no `E`-severity diagnostic), which is the
//     `registers` observable groups (A) and (E) read; every fixture newly
//     refused here satisfies it at this HEAD, so each is inside GOV-15's input
//     set and leaves it. :25 — the diagnostic-registry carve-out, which
//     dispositions this *Trigger* change "as an addition for inputs newly
//     brought into the code's emission set".
//
// EXPECTED CONCRETELY (0159 §Fix route (a)): the comparison runs over the
// entries `splitTopLevel(interior, ",", "angle-and-brace")` yields, keyed on
// each entry's raw pre-colon text (`topLevelColon`) after `trim()` — the very
// tokenisation `hoistInlineObjectType` and `lowerInlineObject` key their
// `properties` and `required` writes on, which is what makes the rule agree
// with what is lowered BY CONSTRUCTION (group (D)) rather than by fixture. An
// entry with no top-level `:`, or whose pre-colon text is empty, contributes no
// key; an entry whose TYPE position is empty keeps its key, the key being the
// source's and not the lowered artefact's. Multiplicity and ordering are
// unchanged: one line per repeated key, at its second occurrence, in source
// order, a body's own repeats ahead of those of bodies nested in its field
// types. The two standing gates are unchanged: a generic type argument's
// interior is outside the rule, and an interior that never closes spells no
// inline object type (group (F)). Neither lowerer moves.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, one direct
// `lowerQueryResponseSchema` call, or one real `AjvSchemaValidator.compile`.
// The observables are a parse-time diagnostic list, a captured type-source
// string off the returned AST, a lowered JSON fragment and a compile throw — an
// integration tier would add a session round-trip and could assert none of them
// more sharply, and a live tier would make the assertion stochastic on top with
// no new reach: the AJV throw of group (E) is reachable in-process through the
// shipped seam, so nothing here needs a model turn. `parseDoc`
// (tests/helpers/e2e-s1.ts:39) is the shipped load path wrapped in the standard
// inert `parseDeps` double — the harness 0159 §Reproduction and 0161
// §Reproduction both used.
//
// WHAT IS RED HERE: group (A) (all six shapes at all nine positions), group
// (B)'s emission table, group (D), group (E)'s load lists and group (H)'s
// emission table — every cell asserting a line the re-keyed comparison owes;
// each observes a list missing exactly that line today. Groups (C), (F), (G),
// (B)'s lowering read-backs, (E)'s compile throw and (H)'s capture read-backs
// are CONTROLS: green now and green after. A red in (C) means the re-key
// over-reached into a source whose lowering mints no duplicate at all; a red in
// (F) means it dropped one of `grammar.md:109`'s two carve-outs or the
// closing-brace gate; a red in (G) means it moved the declaration position 0133
// owns, or moved a lowering 0052 §Fix constraint 1 freezes.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence and its placeholder before the
// template is used, so a missing or reworded row reds by naming the registry
// rather than by a silently-wrong expectation; every emission cell asserts its
// whole ordered diagnostic list, so an absent emission can never read as a
// pass; and every AST read-back asserts the node shape it navigates before it
// reads a field off it.

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

/** The code the re-keyed comparison emits (code-registry-parse.md:89). */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
/** The code the DECLARATION spelling of a quoted field name keeps, unmoved (:88). */
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
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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

/** One rendered diagnostic, in the shape `diagLines` produces. */
function line(severity: string, code: string, message: string): string {
  return `${severity} ${code}: ${message}`;
}

/**
 * The rendering for a repeated inline field-name KEY. Under the re-key the
 * subject is the entry's raw pre-colon text, so `<field>` renders it verbatim
 * by the row-scoped carve-out at placeholder-rendering-b.md:10; the template's
 * own quotes surround it.
 */
function dupLine(field: string): string {
  return line("error", DUPLICATE_INLINE, msg(DUPLICATE_INLINE, [["<field>", field]]));
}

/** The code bug 0176 §Fix route A adds for a NON-REPEATING quoted key. */
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";

/**
 * The rendering for a quoted inline field-name key (bug 0176 §Fix route A). Its
 * subject is the same raw pre-colon text this file's comparison key is, rendered
 * verbatim by that row's own carve-out beside this row's
 * (placeholder-rendering-b.md:10). The settled precedence: a key that REPEATS
 * keeps `theta/parse/duplicate-inline-field-name` alone and draws nothing from
 * the new row; a non-repeating quoted key draws the new row, in source order.
 */
function quotedLine(field: string): string {
  return line("error", QUOTED_INLINE, msg(QUOTED_INLINE, [["<field>", field]]));
}

/** The rendering the DECLARATION spelling of a quoted field name keeps. */
function emptyBodyLine(schema: string): string {
  return line("error", EMPTY_BODY, msg(EMPTY_BODY, [["<X>", schema]]));
}

/** The code bug 0160 adds for an inline `as "WireName"` rename (X.Y.Z). */
const RENAMED_INLINE = "theta/parse/renamed-inline-field-name";

/**
 * The rendering for an inline wire-name rename (bug 0160). Unlike `dupLine`
 * and `quotedLine` above, the subject is the THETA-SIDE identifier the
 * pattern captures, not the raw key — which is what lets this rendering stay
 * the same at every position regardless of whether that position hands the
 * rule the raw `a as "w"` or the token-joined `aas"w"`.
 */
function renLine(field: string): string {
  return line("error", RENAMED_INLINE, msg(RENAMED_INLINE, [["<field>", field]]));
}

// ===========================================================================
// Fixtures. One builder per `Type` position of 0159 §Reproduction, matching the
// vocabulary of the landed sibling lock
// (tests/inline-object-duplicate-field-name.test.ts). Every body fixture ends
// `let a = 1` + `a` so the theta carries a tail expression, and every fixture
// carries `mode: prompt` so no `theta/load/missing-mode` noise is present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by the tail. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/**
 * A `mode: prompt` theta whose `params:` block is `block`. The type is written
 * as a SINGLE-quoted YAML scalar throughout this file so an interior double
 * quote reaches the theta type grammar intact; the unquoted flow-mapping
 * spelling resolves one layer earlier as a frontmatter subject.
 */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** The `@<T>` query annotation — a type-ascription context (grammar.md:105). */
function annotSrc(type: string): string {
  return body("let r = @<" + type + ">`hi`");
}

/** The `invoke<T>` return annotation. */
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

function lines(src: string, path = "bug0159.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/**
 * The whole ordered diagnostic list of one source, asserted against `expected`.
 * A whole-list equality is what makes both directions reachable: an absent
 * emission and an extra one both red, and the multiplicity claims of groups (A)
 * and (B) are only meaningful against a whole list.
 */
function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}

/**
 * GOV-15's loads-cleanly predicate (source-language-stability.md:9): a source
 * emitting no `E`-severity diagnostic. This is the observable that separates
 * "the author is told" from "the artefact is minted and handed on".
 */
function registersCleanly(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some((d) => d.severity === "error");
}

/** The eight `Type` positions of 0159 §Reproduction, plus the `.thetalib` spelling. */
const POSITION_LABELS = [
  "@<T> annotation root",
  "let annotation",
  "schema body field",
  "fn parameter",
  "fn return",
  "alias RHS",
  "params: field",
  "invoke<T>",
  ".thetalib schema field",
] as const;

/** The whole ordered diagnostic list of one inline type at each of those nine positions. */
function positions(type: string): Record<string, string[]> {
  return {
    "@<T> annotation root": lines(annotSrc(type)),
    "let annotation": lines(body(`let x: ${type} = 1`)),
    "schema body field": lines(body(`schema S { p: ${type} }`)),
    "fn parameter": lines(body(`fn f(p: ${type}) { 1 }`)),
    "fn return": lines(body(`fn f(): ${type} { 1 }`)),
    "alias RHS": lines(body(`schema S = ${type}`)),
    "params: field": lines(paramsSrc(`  p: '${type}'`)),
    "invoke<T>": lines(body(`let r = invoke<${type}>("./x.theta")`)),
    ".thetalib schema field": lines(`schema S { p: ${type} }\n`, "bug0159.thetalib"),
  };
}

/** One expected list repeated across all nine positions — type-system.md:15's claim. */
function atEveryPosition(expected: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(POSITION_LABELS.map((label) => [label, [...expected]]));
}

/**
 * The type-source text the `@<T>` position hands BOTH the rule and the lowerer.
 * Read off the returned AST rather than reconstructed, because that string is
 * the whole subject of group (H): the annotation, `let`, `fn`, `schema`, alias
 * and `invoke` positions rebuild it by joining lexer token texts with NO
 * separator, while `params:` passes the YAML scalar through verbatim.
 */
function capturedQuerySchema(type: string): string {
  const doc = parseDoc(annotSrc(type), "bug0159.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the @<T> fixture's first statement must be the \`let r = @<T>\` binding; source=${JSON.stringify(annotSrc(type))}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the query expression").toBe("query");
  const schema = (init as QueryExpr).schema;
  expect(typeof schema, "the query expression must carry its `@<T>` annotation text").toBe(
    "string",
  );
  return schema as string;
}

/** The `typeSource` a `schema` body field captured for its declared type. */
function capturedSchemaFieldType(type: string): string {
  const doc = parseDoc(body(`schema S { p: ${type} }`), "bug0159.theta");
  const stmt = doc.body.statements[0];
  expect(stmt?.kind, "the schema-field fixture's first statement must be the declaration").toBe(
    "schema",
  );
  const field = (stmt as SchemaDecl).fields?.[0];
  expect(field?.name, "the declaration must have captured its one field").toBe("p");
  return (field as { readonly typeSource: string }).typeSource;
}

/**
 * Every JSON Schema key that appears more than once in ANY `required` array of
 * a lowered document — the root's and every `$defs` member's. This is the
 * artefact 0052 §Expected forbids ("no fragment carrying a repeated `required`
 * entry is ever minted") and the set group (D) holds the emission against.
 */
function repeatedRequiredEntries(schema: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const required = record.required;
    if (Array.isArray(required)) {
      const seen = new Set<string>();
      for (const entry of required) {
        if (typeof entry === "string") {
          if (seen.has(entry)) {
            found.add(entry);
          }
          seen.add(entry);
        }
      }
    }
    for (const value of Object.values(record)) {
      visit(value);
    }
  };
  visit(schema);
  return [...found].sort();
}

/** A real `AjvSchemaValidator` plus the diagnostics it emitted. */
function ajv(): { readonly validator: AjvSchemaValidator; readonly emitted: Diagnostic[] } {
  const emitted: Diagnostic[] = [];
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    validator: new AjvSchemaValidator({ emit: (d) => emitted.push(d), slugOf }),
    emitted,
  };
}

// ===========================================================================
// (A) THE POSITION MATRIX — 0159 §Reproduction (a)'s six shapes at all eight
// `Type` positions plus the `.thetalib` spelling. §Fix (c)(5) makes this the
// minimum witness shape: a fix measured at the annotation root alone cannot
// distinguish a rule change from a call-site change, and type-system.md:15 is
// why the nine cells of each table must answer alike.
//
// One `it` per shape, each a whole-map equality over the nine positions: the
// claim is that the nine agree, and separate assertions would stop at the first
// divergence and hide the rest.
// RED at HEAD: every shape draws `[]` at every position except shape 6, which
// draws the position's own residue sink instead —
// `theta/parse/schema-type-not-expression` at the three declaration positions
// and `theta/load/params-type-not-expression` at `params:`. Both sinks are
// last-resort guards that stand down once the field's own walk raises an
// error-severity diagnostic, so the re-key replaces them rather than joining
// them.
// ===========================================================================

describe("bug 0159 (A) — the six masked shapes are refused at every `Type` position", () => {
  it("RED A1 (a nameless field ahead of the repeat): `{a: integer, : x, a: boolean}`", () => {
    // The `: x` entry has a top-level `:` with nothing before it, so it
    // contributes no key and the two `a` entries are compared to each other.
    // The type grammar instead reads `x` as an identifier it cannot follow with
    // a `:`, and stops.
    expect(
      positions("{a: integer, : x, a: boolean}"),
      "A1 — a malformed entry between two well-formed ones is not a licence to stop reading " +
        "the field names the author wrote; the lowering does not stop there either, and mints " +
        '`required: ["a","a"]`',
    ).toEqual(atEveryPosition([dupLine("a")]));
  });

  it('RED A2 (a rename ahead of the repeat): `{a as "w": integer, a: string, a: boolean}`', () => {
    // The rename entry's raw pre-colon text is its own key and collides with
    // nothing FOR THIS ROW; the two unrenamed `a` entries behind it are the
    // repeat. Since bug 0160 (X.Y.Z) the rename entry is refused outright
    // (it is a non-repeating, non-quote-led key), so it draws its own line
    // ahead of the duplicate row's, in source order.
    expect(
      positions('{a as "w": integer, a: string, a: boolean}'),
      "A2 — the rename is a distinct key, not a stop: the repeat behind it is between two " +
        "entries the lowering keys identically, and the rename itself is refused (bug 0160)",
    ).toEqual(atEveryPosition([renLine("a"), dupLine("a")]));
  });

  it('RED A3 (a quoted name ahead of the repeat): `{"a": string, a: integer, a: boolean}`', () => {
    // WHY THIS LIST GREW: bug 0176 §Fix route A refuses the non-repeating quoted
    // key `"a"` on its own row, ahead of the repeat behind it in source order;
    // the settled precedence subordinates the new row to this one only where a
    // key repeats.
    expect(
      positions('{"a": string, a: integer, a: boolean}'),
      'A3 — the quoted entry\'s key is the three characters `"a"`, distinct from `a`, so the ' +
        "repeat is between the two unquoted entries behind it, and the quoted entry ahead of " +
        "them is refused in its own right",
    ).toEqual(atEveryPosition([quotedLine('"a"'), dupLine("a")]));
  });

  it("RED A4 (a stop inside a NESTED body): `{p: {c: 1, : y, c: 2}, p: 3}`", () => {
    // Two bodies, each with its own repeat. The outer body's own repeat is
    // reported first (code-registry-parse.md:89 fixes the order), then the one
    // in the body nested in its field type.
    expect(
      positions("{p: {c: 1, : y, c: 2}, p: 3}"),
      "A4 — the outer body's field split is unaffected by what a field's own type spells, so " +
        "its repeated `p` is compared; the nested body's repeated `c` is its own occurrence",
    ).toEqual(atEveryPosition([dupLine("p"), dupLine("c")]));
  });

  it("RED A5 (the same stop two levels up): `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}`", () => {
    // Depth three, which is what makes the masking a cascade rather than one
    // level: the middle body spells `q` and `r` and repeats nothing, so the two
    // lines come from the outermost and the innermost bodies.
    expect(
      positions("{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}"),
      "A5 — a split keyed on text is unqualified by depth, so a malformed entry three levels " +
        "down curtails no enclosing body's comparison",
    ).toEqual(atEveryPosition([dupLine("p"), dupLine("c")]));
  });

  it("RED A6 (a completed field with no `,` behind it): `{a: 1 a: 2, a: 3}`", () => {
    // The comma split yields two entries — `a: 1 a: 2` and `a: 3` — whose
    // pre-colon texts are both `a`, which is also exactly what the lowering
    // keys its two `required` entries on.
    expect(
      positions("{a: 1 a: 2, a: 3}"),
      "A6 — a missing field separator changes which entries the split yields, not whether " +
        "their keys are compared; at the three declaration positions and at `params:` this " +
        "line replaces the residue sink those positions raise today, each sink standing down " +
        "once the field's own walk has refused it",
    ).toEqual(atEveryPosition([dupLine("a")]));
  });
});

// ===========================================================================
// (B) THE KEY, STATED EXACTLY — the raw pre-colon text of a brace-aware
// top-level comma split, after `trim()`, with NO unquoting and NO
// normalisation. 0161 §Fix B4 requires the *Trigger* to state it that
// precisely, "or the row is not computable from its text"; these are the rows
// that make each clause of it falsifiable.
// RED at HEAD: the three emission rows. The lowering read-backs are CONTROLS.
// ===========================================================================

describe("bug 0159 (B) — the comparison key is raw pre-colon text after `trim()`", () => {
  it("RED B1: quote style, padding, emptiness and quotedness each decide the key", () => {
    // WHY FIVE OF THESE LISTS GREW: bug 0176 §Fix route A refuses a
    // NON-REPEATING key whose first character is a quote, once per offending key
    // in source order. Every row's SUBJECT is unchanged — each still isolates one
    // clause of THIS row's comparison key, now read off a whole list that names
    // the other row too; the three repeating rows and the padded/empty ones keep
    // their single duplicate line by the settled precedence.
    const cells: ReadonlyArray<readonly [type: string, want: string[]]> = [
      // The split is quote-aware, so a `:` or a `,` inside quotes neither ends
      // an entry nor moves its colon — two distinct keys, and no repeat.
      ['{"a:b": string, c: integer}', [quotedLine('"a:b"')]],
      ['{"a,b": string, c: integer}', [quotedLine('"a,b"')]],
      // No unquoting: two quote styles spell one wire name but two keys, so
      // this source draws no DUPLICATE line. 0161 §Fix B4 names it as the row
      // that separates route B from a route that normalises; bug 0176 refuses
      // both of its keys, which is exactly two distinct non-repeating quoted
      // keys and so two lines.
      [`{'a': string, "a": integer}`, [quotedLine("'a'"), quotedLine('"a"')]],
      // No normalisation the other way either: a quoted key and its bare
      // spelling are two keys, so no repeat — and only the quoted one is
      // refused.
      ['{a: integer, "a": string}', [quotedLine('"a"')]],
      // The empty-string key is a key, and collides with itself.
      ['{"": string, "": integer}', [dupLine('""')]],
      // `trim()` absorbs the padding around the pre-colon text, so the padded
      // spelling of one key is that key.
      ['{"a" : string, "a" : integer}', [dupLine('"a"')]],
      // 0161's own subject shape: two entries whose raw pre-colon texts are
      // identical.
      ['{"a": string, "a": integer}', [dupLine('"a"')]],
      ['{"a": string, "b": integer}', [quotedLine('"a"'), quotedLine('"b"')]],
      // Multiplicity is unchanged by the re-key: one line per repeated KEY, at
      // its second occurrence, so a third occurrence adds no subject.
      ['{"a": string, "a": integer, "a": boolean}', [dupLine('"a"')]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [type, want] of cells) {
      actual[type] = lines(annotSrc(type));
      expected[type] = want;
    }
    expect(
      actual,
      "B1 — each row isolates one clause of the key: quote-awareness of the split, verbatim " +
        "quote characters, `trim()`, the empty key, and the counting unit. A key stated as " +
        "anything else answers at least one row differently",
    ).toEqual(expected);
  });

  it("CONTROL B2: every ADMITTED row of B1 lowers the two distinct keys it names", () => {
    // The controls that make B1's silences checkable rather than merely
    // observed: each admitted row lowers exactly two properties, keyed on the
    // same raw text the comparison read, with a two-item `required` naming
    // both. A key that unquoted or normalised would have to red B1 or leave
    // these bytes unexplained.
    const cells: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      [
        '{"a:b": string, c: integer}',
        {
          type: "object",
          properties: { '"a:b"': { type: "string" }, c: { type: "integer" } },
          required: ['"a:b"', "c"],
          additionalProperties: false,
        },
      ],
      [
        '{"a,b": string, c: integer}',
        {
          type: "object",
          properties: { '"a,b"': { type: "string" }, c: { type: "integer" } },
          required: ['"a,b"', "c"],
          additionalProperties: false,
        },
      ],
      [
        `{'a': string, "a": integer}`,
        {
          type: "object",
          properties: { "'a'": { type: "string" }, '"a"': { type: "integer" } },
          required: ["'a'", '"a"'],
          additionalProperties: false,
        },
      ],
      [
        '{a: integer, "a": string}',
        {
          type: "object",
          properties: { a: { type: "integer" }, '"a"': { type: "string" } },
          required: ["a", '"a"'],
          additionalProperties: false,
        },
      ],
    ];
    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [type, fragment] of cells) {
      actual[type] = lowerQueryResponseSchema(type, [], []);
      expected[type] = fragment;
    }
    expect(
      actual,
      "B2 — the lowering keys `properties` and `required` on exactly the text the re-keyed " +
        "comparison reads, so a silence above is a source that mints two distinct required " +
        "entries and not a missed repeat",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (C) THE FALSE-POSITIVE FENCE — the sources whose lowering mints NO duplicate
// `required` anywhere. An emission on any of them would name a consequence no
// fragment carries, which is the fault the stop cascade was built to prevent
// (0159 §Fix constraint 3). Each silence is asserted BESIDE the lowering that
// makes it checkable.
// GREEN now and after.
// ===========================================================================

describe("bug 0159 (C) — no line where no fragment repeats a `required` entry", () => {
  it("CONTROL C1: four sources stay silent, and none of them mints a duplicate", () => {
    // Row 1 is the shape 0159 §Reproduction (d) c4 fixes: a name reused between
    // an outer inline object and one nested inside it is two field lists rather
    // than a repeat (grammar.md:109), so `p` at the root and `p` inside `p`'s
    // own value are two keys of two splits.
    // Rows 2 and 4 are 0045 §Non-goals' reserved malformed interiors: an entry
    // with an empty pre-colon text and an entry with no top-level `:` at all
    // contribute no key, so neither the comparison nor the lowering has
    // anything to name — which is why the lowering mints an empty `required`
    // for both. Row 3's single key repeats nothing.
    const cells: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      [
        "{p: {c: 1, : y, p: 2}}",
        {
          type: "object",
          properties: { p: { $ref: "#/$defs/__inline_b40cf28af9264f70" } },
          required: ["p"],
          additionalProperties: false,
          $defs: {
            __inline_b40cf28af9264f70: {
              type: "object",
              properties: { c: { const: 1 }, p: { const: 2 } },
              required: ["c", "p"],
              additionalProperties: false,
            },
          },
        },
      ],
      ["{: x, : y}", { type: "object", properties: {}, required: [], additionalProperties: false }],
      ["{ a: }", { type: "object", properties: {}, required: [], additionalProperties: false }],
      ["{ a }", { type: "object", properties: {}, required: [], additionalProperties: false }],
    ];
    const actualLines: Record<string, string[]> = {};
    const expectedLines: Record<string, string[]> = {};
    for (const [type] of cells) {
      actualLines[type] = lines(annotSrc(type));
      expectedLines[type] = [];
    }
    expect(
      actualLines,
      "C1 — a comparison keyed on the lowerers' own split can only ever name a key that split " +
        "produced, so a line on any of these four would be false of the source",
    ).toEqual(expectedLines);

    const actualLowered: Record<string, unknown> = {};
    const expectedLowered: Record<string, unknown> = {};
    for (const [type, fragment] of cells) {
      actualLowered[type] = lowerQueryResponseSchema(type, [], []);
      expectedLowered[type] = fragment;
    }
    expect(
      actualLowered,
      "C1 — and the read-back that makes the silence a fact rather than an omission: no " +
        "`required` array anywhere in these four repeats an entry, so nothing here is the " +
        "shape the row exists to refuse",
    ).toEqual(expectedLowered);
    for (const [type, fragment] of cells) {
      expect(
        repeatedRequiredEntries(fragment),
        `C1 — ${type} mints no repeated required entry at any depth`,
      ).toEqual([]);
    }
  });

  it("CONTROL C2: the positive fence beside it — a real repeat past a nameless entry fires ONCE", () => {
    // The bound on C1: a malformed entry truncates nothing. This body's own
    // split yields `a`, `a`, `b`, `a`, so its repeat is compared and reported
    // once; the nested body's entries are `c`, the nameless one, and `d`, which
    // repeat nothing. Without this cell C1 would also be satisfied by a rule
    // that switched itself off near a malformed entry.
    expectList(
      annotSrc("{a: 1, a: 2, b: {c: 1, : y, d: 2}, a: 3}"),
      [dupLine("a")],
      "C2 — one line per repeated key at its second occurrence, so the third `a` adds no " +
        "subject, and the nested body contributes none",
    );
    expect(
      repeatedRequiredEntries(
        lowerQueryResponseSchema("{a: 1, a: 2, b: {c: 1, : y, d: 2}, a: 3}", [], []),
      ),
      "C2 — and the lowering repeats exactly the one key that was reported",
    ).toEqual(["a"]);
  });
});

// ===========================================================================
// (D) AGREEMENT BY CONSTRUCTION — the property route (a) exists to deliver, as
// an assertion rather than as prose. The rule and the two lowerers read the
// same string through the same `splitTopLevel` + `topLevelColon` tokenisation,
// so the set of keys the emission names must ACCOUNT FOR every `required` entry
// the lowering of that same string repeats: 0052 §Expected's "no fragment
// carrying a repeated `required` entry is ever minted" is exactly that
// containment.
// RED at HEAD: no line is emitted for any of these sources, so the reported set
// is empty while the lowering repeats an entry.
// ===========================================================================

describe("bug 0159 (D) — every duplicate the lowering would mint is named by the emission", () => {
  it("RED D1: the reported keys account for every repeated `required` entry", () => {
    // The lowered fragment is taken over the CAPTURED type source — the exact
    // string the position handed the rule — and not over the fixture text, so
    // the agreement claim is about one string read twice and not about two
    // spellings that happen to answer alike. Group (H) is why that distinction
    // is load-bearing for the rename rows.
    //
    // The containment is one-directional by necessity, and the table shows
    // where: a body whose own key repeats drops the FIRST occurrence's value to
    // last-wins, so a nested body's repeat can be erased from the lowered
    // document entirely (rows 10, 11 and 15 report `c` at a nesting the root's
    // own duplicate deleted). The emission naming more than the lowering
    // repeats is the safe direction — it refuses a source that would otherwise
    // drop a declared field silently; the reverse would leave an invalid
    // fragment minted with nothing said.
    // WHY THE `expected` SHAPE WIDENED: bug 0176 §Fix route A puts a second code
    // on one of these sources' lists (row 2's non-repeating quoted key `"a"`), so
    // the expected diagnostic list can no longer be DERIVED from the reported
    // duplicate keys alone. Each row now spells its whole expected list; the
    // `reported` column stays exactly the duplicate keys, and the containment
    // claim below still runs over it, so nothing is weakened. Bug 0160
    // (X.Y.Z) widens two more rows the same way: an inline `as "WireName"`
    // rename is refused outright rather than left an unparsed part of the
    // duplicate key, so a rename entry ahead of (or nested beside) a repeat
    // draws its own line in addition to the repeat's.
    const cells: ReadonlyArray<
      readonly [
        type: string,
        reported: string[],
        repeatedRequired: string[],
        expectedLines?: string[],
      ]
    > = [
      ["{a: integer, : x, a: boolean}", ["a"], ["a"]],
      [
        '{"a": string, a: integer, a: boolean}',
        ["a"],
        ["a"],
        [quotedLine('"a"'), dupLine("a")],
      ],
      [
        '{a as "w": integer, a: string, a: boolean}',
        ["a"],
        ["a"],
        [renLine("a"), dupLine("a")],
      ],
      ["{a: 1 a: 2, a: 3}", ["a"], ["a"]],
      ['{"a": string, "a": integer}', ['"a"'], ['"a"']],
      ['{"": string, "": integer}', ['""'], ['""']],
      ['{"a" : string, "a" : integer}', ['"a"'], ['"a"']],
      ['{"a": string, "a": integer, "a": boolean}', ['"a"'], ['"a"']],
      // Since bug 0228's fix the annotation's brace group is a raw slice of
      // the author's own source bytes, so the repeated key is the author's
      // spacing (`a as "w"`) rather than a joined `aas"w"`.
      ['{a as "w": integer, a as "w": string}', ['a as "w"'], ['a as "w"']],
      ["{p: {c: 1, : y, c: 2}, p: 3}", ["p", "c"], ["p"]],
      ["{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}", ["p", "c"], ["p"]],
      ["{a: {b: {c: 1, : y, c: 2}, a: 4}, z: 5}", ["c"], ["c"]],
      ["{a: integer, a: string}", ["a"], ["a"]],
      [
        '{p: {a as "w": integer}, q: integer, q: string}',
        ["q"],
        ["q"],
        [dupLine("q"), renLine("a")],
      ],
      ["{p: {c: 1, : y, c: 2, c: 3}, p: 9}", ["p", "c"], ["p"]],
    ];

    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const [type, reported, repeatedRequired, expectedLines] of cells) {
      const captured = capturedQuerySchema(type);
      actual[type] = {
        reported: lines(annotSrc(type)),
        repeatedRequired: repeatedRequiredEntries(lowerQueryResponseSchema(captured, [], [])),
      };
      expected[type] = {
        reported: expectedLines ?? reported.map((field) => dupLine(field)),
        repeatedRequired,
      };
    }
    expect(
      actual,
      "D1 — the emission and the lowering read one string through one tokenisation, so the " +
        "keys they derive agree by construction; a fix keyed on anything else would have to " +
        "make some row's two halves name different text",
    ).toEqual(expected);

    // The containment itself, computed rather than tabulated, so a future row
    // added to the table above cannot satisfy this group by being tabulated
    // consistently while breaking the property the route delivers.
    for (const [type, reported, repeatedRequired] of cells) {
      for (const entry of repeatedRequired) {
        expect(
          reported,
          `D1 — ${type} lowers a fragment whose \`required\` repeats ${JSON.stringify(entry)}, ` +
            "so the refusal must name that key; an unnamed repeat is a fragment minted with " +
            "nothing said, which is the outcome 0052 §Expected forbids",
        ).toContain(entry);
      }
    }
  });
});

// ===========================================================================
// (E) UNREACHABILITY — what the refusal prevents, driven through the real seam
// (src/seams/schema-validator.ts:149, `#build`'s `this.#ajv.compile`). Ajv is
// built with `strict: false` (:112), which does not disable meta-schema
// validation; the meta-schema constrains `required` to unique items and applies
// to the compiled ROOT only, which is why the `@<T>` annotation root throws
// where a hoisted `$defs` member compiles. No `catch` is added at any AJV seam
// (0159 §Fix constraint 2) — the throw is removed by refusing the input, so
// this group asserts on the THROW and on the refusal that makes it unreachable
// from a loading document.
// RED at HEAD: the two load lists and the two `registers` reads. The compile
// throws are CONTROLS.
// ===========================================================================

describe("bug 0159 (E) — the refused source reaches no lowering and no compile", () => {
  it("RED E1: the two root-position fragments AJV refuses are no longer reachable from a load", () => {
    const cells: ReadonlyArray<readonly [type: string, want: string[]]> = [
      ["{p: {c: 1, : y, c: 2}, p: 3}", [dupLine("p"), dupLine("c")]],
      ['{"a": string, "a": integer}', [dupLine('"a"')]],
    ];

    for (const [type, want] of cells) {
      const rootDoc = parseDoc(annotSrc(type), "bug0159.theta");
      expect(
        diagLines(rootDoc),
        "E1 — the `@<T>` root is where the fragment IS the compiled document, so this source " +
          "must be refused at load rather than surfaced as a validator throw after a query " +
          `turn has been spent; type=${JSON.stringify(type)}`,
      ).toEqual([...want]);
      expect(
        registersCleanly(rootDoc),
        "E1 — an error-severity diagnostic is what withholds the theta, so the lowering is " +
          "never reached through the load path",
      ).toBe(false);

      // The hoisting positions carry the other half of the consequence: there
      // the same bytes compile without complaint and are enforced against a
      // provider payload, so the refusal is the only place the dropped
      // declaration can be reported.
      const fieldDoc = parseDoc(body(`schema S { p: ${type} }`), "bug0159.theta");
      expect(
        diagLines(fieldDoc),
        "E1 — the schema-body field position answers alike (type-system.md:15); " +
          `type=${JSON.stringify(type)}`,
      ).toEqual([...want]);
      expect(
        registersCleanly(fieldDoc),
        "E1 — and this position registers today, which is what makes the last-wins shape " +
          "reach the binder and the validator",
      ).toBe(false);
    }
  });

  it("CONTROL E2: what the refusal prevents — both fragments are documents AJV refuses to compile", () => {
    // The lowerers are frozen (0052 §Fix constraint 1), so these bytes stay
    // exactly what a direct call returns after the fix; they are reachable only
    // by a direct call like this one once E1's refusal lands.
    for (const type of ["{p: {c: 1, : y, c: 2}, p: 3}", '{"a": string, "a": integer}']) {
      const lowered = lowerQueryResponseSchema(type, [], []);
      expect(
        repeatedRequiredEntries(lowered),
        `E2 — the fragment ${type} would hand the compile carries a repeated \`required\` entry`,
      ).not.toEqual([]);

      const { validator, emitted } = ajv();
      expect(
        () => validator.compile(lowered as LoweredSchema),
        "E2 — a duplicate `required` entry is invalid JSON Schema; both compile sites for this " +
          "lowering run over a CANDIDATE PAYLOAD, so without the refusal the throw lands after " +
          "the model turn has been spent, as an internal error rather than a diagnostic",
      ).toThrowError(
        "schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)",
      );
      expect(
        emitted.map((d) => d.code),
        "E2 — the throw is the compile's own meta-schema refusal, not a cache-collision " +
          "diagnostic",
      ).toEqual([]);
    }
  });
});

// ===========================================================================
// (F) THE CARVE-OUTS THAT DO NOT MOVE — grammar.md:109's two exclusions and the
// closing brace the `ObjectType` production spells. The re-key changes which
// text the comparison runs over; it changes neither gate, and each gate is a
// shape a rule keyed on "two equal pre-colon texts anywhere under this node"
// would take with it.
// GREEN now and after.
// ===========================================================================

describe("bug 0159 (F) — the generic-argument, nested-reuse and unterminated carve-outs hold", () => {
  it("CONTROL F1: a generic argument's interior, a nested reuse and an unclosed interior stay silent", () => {
    const cells: ReadonlyArray<readonly [label: string, source: string]> = [
      // The lowering never divides a generic argument's interior into fields —
      // the argument split is angle-only, so a two-field interior presents as
      // two arguments and the permissive fallthrough lowers `{}` — so no
      // duplicate `required` is minted there for an emission to name.
      ["generic argument", annotSrc("array<{a: integer, a: string}>")],
      ["generic argument, nested", annotSrc("array<{q: {a: integer, a: string}}>")],
      // Two field lists, not a repeat: each body's split yields its own keys.
      ["nested reuse", annotSrc("{a: integer, b: {a: string}}")],
      // `ObjectType ::= "{" Field ("," Field)* ","? "}"` (grammar.md:101)
      // spells the closing `}`, so an interior that never closes writes no
      // inline object type and carries no comparison of its own.
      ["unterminated, annotation root", annotSrc("{a: 1, a: 2")],
      ["unterminated, invoke return", invokeSrc("{a: 1, a: 2")],
      ["unterminated, alias RHS", body("schema S = {a: 1, a: 2")],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [label, source] of cells) {
      actual[label] = lines(source);
      expected[label] = [];
    }
    expect(
      actual,
      "F1 — the re-key moves the comparison's key, not its two gates: `insideGenericArgument` " +
        "and the spelled closing brace still decide WHETHER a body is compared at all",
    ).toEqual(expected);

    expect(
      lowerQueryResponseSchema("array<{a: integer, a: string}>", [], []),
      "F1 — the generic argument's read-back: the permissive `{}` carries no field list, so " +
        "the repeat inside the element type reaches no lowered artefact either",
    ).toEqual({});
    expect(
      repeatedRequiredEntries(lowerQueryResponseSchema("{a: integer, b: {a: string}}", [], [])),
      "F1 — the nested reuse lowers two one-item `required` arrays, so no `required` repeats",
    ).toEqual([]);
  });
});

// ===========================================================================
// (G) BUG 0161's CLOSURE ROWS. Route B closes 0161 on the DUPLICATE and leaves
// its quoted-property-name half open (its §Fix B2), so both halves are pinned
// here: the declaration position it must not move, and the single quoted field
// it still admits. Pinning the residual makes it a measured fact rather than a
// claim, and gives whichever report closes it a red to work against.
// GREEN now and after.
// ===========================================================================

describe("bug 0159 (G) — bug 0161's declaration control and its explicitly-open residual", () => {
  it("CONTROL G1: the declaration spelling of a quoted field name is byte-identical", () => {
    // 0161 §Reproduction (b). These five rows are that report's control group
    // and bug 0133's subject as a MESSAGE; no route here touches
    // `parseSchemaObjectBody` / `skipBraceRemainder`, so all five stay exactly
    // as they are. Rows b4 and b5 bound b1–b3 to the quoted NAME: an identifier
    // field and a rename whose wire name is quoted both load.
    const cells: ReadonlyArray<readonly [decl: string, want: string[]]> = [
      ['schema S { "a": string }', [emptyBodyLine("S")]],
      ['schema S { "a": string, "a": integer }', [emptyBodyLine("S")]],
      ['schema S { "a": string, b: integer }', [emptyBodyLine("S")]],
      ["schema S { a: string }", []],
      ['schema S { a as "w": string }', []],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [decl, want] of cells) {
      actual[decl] = lines(body(decl));
      expected[decl] = want;
    }
    expect(
      actual,
      "G1 — the declaration position keeps `theta/parse/empty-schema-body` for a body whose " +
        "first token is not a plain `ident: Type` field list; the inline re-key adds an " +
        "emission at the inline positions and moves nothing here",
    ).toEqual(expected);
  });

  it('RED G2: a SINGLE quoted field is refused, and no longer lowers `properties[\'"a"\']` through a load', () => {
    // 0161 §Fix B2's explicitly-open half, CLOSED by bug 0176 §Fix route A. The
    // re-key still says nothing about a single quoted entry — it repeats no key
    // — so the refusal comes from the new row this cell's own comment authorised
    // in advance ("the report that closes it reds exactly here"). The lowering
    // read-back below is kept as a prevented-artefact control: the bytes are
    // frozen and reachable only by a direct call once the refusal lands.
    expectList(
      annotSrc('{"a": string}'),
      [quotedLine('"a"')],
      "G2 — the duplicate row's subject is a repeated key, and one entry repeats nothing; " +
        "whether the inline field-name slot admits a non-identifier at all is bug 0176's " +
        "question, and its route A answers it with a refusal keyed on the same raw key",
    );
    expect(
      lowerQueryResponseSchema('{"a": string}', [], []),
      'G2 — the property name is the three characters `"a"`, quote characters included, and ' +
        "these bytes are frozen exactly as every other lowering is",
    ).toEqual({
      type: "object",
      properties: { '"a"': { type: "string" } },
      required: ['"a"'],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (H) THE TYPE-SOURCE CAPTURE IS FAITHFUL AT EVERY POSITION, AND SO IS THE
// RULE (bug 0228). Before that fix, `params:` alone handed the type grammar
// the YAML scalar verbatim, while the other seven positions and the
// `.thetalib` spelling rebuilt the type text by joining lexer token texts with
// NO separator: `{a  as  "w": integer, b: string}` arrived at `params:` as
// written and everywhere else as `{aas"w":integer,b:string}`. Bug 0228's fix
// makes an inline object's brace group a raw slice of the author's own source
// bytes at every position, so the group above now arrives identically
// everywhere — group (H) no longer needs a `params:`-versus-the-rest split to
// state its claim.
//
// This group's header used to read "only the rendered subject differs" — a
// narrower claim than what §Reproduction (b) and (d) of bug 0228 measured: at
// HEAD before that fix, the VERDICT differed too (a repeat manufactured by the
// join at ten positions, admitted at `params:`, and vice versa for a
// case-mismatch key). What this group pins now: the rule and the two lowerers
// receive the SAME string at every position, so their keys agree exactly
// everywhere, and so does the rendered subject — there is no longer a
// position whose capture disagrees with the others. Shapes with no inter-token
// whitespace inside a key were already unaffected either way, which is why
// every table in group (A) is uniform across the nine positions.
// ===========================================================================

describe("bug 0159 (H) — the rendered subject follows the position's type-source capture", () => {
  it('RED H1: `{a as "w": integer, a as "w": string}` names the same raw key at every position', () => {
    // Since bug 0228's fix every position's brace group is a raw slice of the
    // author's own source bytes, so `params:` no longer stands apart: all
    // nine positions render the SAME raw key.
    const everywhere = atEveryPosition([dupLine('a as "w"')]);
    expect(
      positions('{a as "w": integer, a as "w": string}'),
      "H1 — one key repeated is one line at every position; the subject is the entry's raw " +
        "pre-colon text, which now agrees at every position including `params:`",
    ).toEqual({ ...everywhere, "params: field": [dupLine('a as "w"')] });
  });

  it("CONTROL H2: the capture itself, read off the parsed document at three positions", () => {
    // The mechanism, asserted directly so H1's position-dependence is not read
    // as a property of the comparison. A type carrying inter-token whitespace
    // inside its first key is enough to separate the two captures. RE-PINNED
    // for bug 0160 (X.Y.Z): this key does not repeat, so it used to be the
    // re-key's own silent control; it is now a non-repeating, non-quote-led
    // rename, refused at every position including `params:`. The capture
    // assertions below are unmoved — they read the type-source text directly,
    // ahead of any rule — and the DIRECT lowerer call at the end stays
    // byte-identical, which is what proves this fix changed no lowering.
    const type = '{a  as  "w": integer, b: string}';
    // Since bug 0228's fix the whole annotation is ONE brace group, so its
    // capture is a raw slice of the author's own source bytes — byte-identical
    // to `type` itself, double interior spaces and all.
    expect(
      capturedQuerySchema(type),
      "H2 — the `@<T>` annotation's brace group is a raw slice of the author's own source " +
        "bytes, so the captured text is the type as written",
    ).toBe(type);
    expect(
      capturedSchemaFieldType(type),
      "H2 — the `schema` body field position captures the same way, which is why the " +
        "`.thetalib` spelling of it answers with the raw key too",
    ).toBe(type);

    const paramsDoc = parseDoc(paramsSrc(`  p: '${type}'`), "bug0159.theta");
    expect(
      diagLines(paramsDoc),
      "H2 — `params:` passes the YAML scalar through verbatim, so the rendered subject is the " +
        "raw `a` the pattern captures from `a  as  \"w\"` — the same identifier H1 pins at the " +
        "eight joined positions, position-invariance held even though the raw key differs",
    ).toEqual([renLine("a")]);
    expect(
      paramsDoc.frontmatter,
      "H2 — the refusal is a load-time gate, not a sanitising lowerer: a `params:` field " +
        "carrying a refused rename withholds the WHOLE frontmatter object, so no lowered schema " +
        "keyed on either capture ever reaches the binder",
    ).toBeNull();
    // Since bug 0228's fix the DIRECT lowerer call reads the same raw capture
    // the load path does, so it mints the raw pre-colon text — double interior
    // spaces included — as the property name, not a joined `aas"w"`. This is
    // still a prevented-artefact control: the load path withholds the whole
    // frontmatter object on the refusal above, so this schema is reachable
    // only by this direct call.
    expect(
      lowerQueryResponseSchema(capturedQuerySchema(type), [], []),
      "H2 — reached by DIRECT construction only, now that the load-path refusal withholds this " +
        "artefact: the raw capture lowers the raw pre-colon text byte-for-byte, so this fix " +
        "changed no lowering, only what reaches it through a load",
    ).toEqual({
      type: "object",
      properties: { 'a  as  "w"': { type: "integer" }, b: { type: "string" } },
      required: ['a  as  "w"', "b"],
      additionalProperties: false,
    });
  });
});
