import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { buildBodyTypeSchemas } from "../src/parser/body-type-lowering";
import { hoistInlineObjectType, lowerParamsFieldType, type LowerCtx } from "../src/parser/params";
import type { ThetaDocument } from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0052 — a repeated field name inside an inline object body is admitted at
// every `Type` position: `{a: integer, a: string}` loads with zero diagnostics
// and lowers a last-wins `properties.a` beside a two-item `required: ["a","a"]`,
// while the same two fields written as a `schema` body are refused with
// `theta/parse/wire-name-collision`
// (docs/bugs/0052-inline-object-duplicate-field-names-silent-last-wins.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:109 §"Inline object types" — an `ObjectType`'s
//     fields "reuse the same `Field` form as an object-schema body and carry the
//     same field semantics", and "A key that repeats within one inline object type
//     is `theta/parse/duplicate-inline-field-name`, judged over the entries the
//     body spells between its top-level commas, on the text before each entry's own
//     top-level colon, taken as written, and raised once per repeated key in source
//     order before the body is lowered; a key reused between an outer inline object
//     and one nested inside it is two field lists rather than a repeat, and a
//     generic type argument's interior is outside that rule."
//   - docs/spec_topics/schemas.md:44 — the semantics that sentence defers to:
//     "Two fields in the same schema cannot share a wire name… Either is
//     `theta/parse/wire-name-collision`." :45 makes an `as` rename to the
//     theta-side name redundant, which fixes the unrenamed default: a field with
//     no rename has its theta-side name as its wire name, so two fields named
//     `a` declare one wire name twice.
//   - docs/spec_topics/type-system.md:15 — one type grammar in every annotation
//     position, which is why the ten position cells of group (a) answer alike.
//   - docs/spec_topics/schema-subset.md:73 — an inline object in any type
//     position hoists into `$defs` under `__inline_<slug>`, the slug being the
//     hash of the LOWERED fragment. A refused body is never lowered, so no
//     duplicate-carrying fragment is minted and none is addressed.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:87 — the
//     `theta/parse/duplicate-inline-field-name` row: severity `E`, phase `parse`,
//     *Message* `duplicate field name '<field>' within one inline object type`, no
//     *Hint*. Its *Trigger* fixes the multiplicity ("One diagnostic per repeated name,
//     in source order") and the two shapes that sit outside it (group (d)). :85 is the
//     `theta/parse/wire-name-collision` row the declaration spelling keeps (group (e)).
//   - DIAG-4 (diagnostic-shape.md:74) fixes that *Message* character-for-
//     character with its placeholder interpolated, so every expected string here
//     is read out of the registry through `registryMessage`; no message prose is
//     copied. DIAG-2 (:72) makes the row the closed authority for the code, and
//     DIAG-3 (:73) makes the declaration spelling's existing code identity
//     immovable.
//   - docs/spec_topics/governance/source-language-stability.md
//     §"Loads-cleanly predicate" / §"Diagnostic-registry carve-out" — every
//     newly-refused input here carries no `E`-severity diagnostic at 0.83.0, so
//     the addition is in-scope "as an addition for inputs newly brought into the
//     code's emission set".
//
// EXPECTED CONCRETELY (§Expected behaviour, §Fix): exactly ONE
// `theta/parse/duplicate-inline-field-name` per REPEATED NAME, at error
// severity, in source order, emitted at the second occurrence, at every `Type`
// position and every nesting depth reachable through inline-object fields and
// union arms. `<field>` interpolates as the repeated name, unquoted — the
// template supplies the quotes. The lowering does not move: the refusal is at
// parse (§Fix constraint 1), so a fix that deduped in `hoistInlineObjectType`
// or `lowerInlineObject` instead reds group (f).
//
// THE MECHANISM AT HEAD (0.83.0, df7a3d55) — three facts, in the order they
// bear on the cells below:
//   1. THE NAMES DO NOT SURVIVE THE TYPE-GRAMMAR PARSE.
//      `TypeParser.parseObject` (src/parser/type-grammar.ts) reads the field-
//      name token and drops it, collecting `fieldTypes` only, so `walkType`'s
//      `object` arm (src/parser/type-grammar.ts) has no name list to compare.
//      §Fix retains the names there and adds the comparison to that arm.
//   2. THE CALL SITES ARE ALREADY WIRED. The rule joins the existing
//      `"inline-object-shape"` rule SET (`TypeCheckRules`, src/parser/type-
//      grammar.ts): the set is named for the SHAPE its members govern rather
//      than for either rule, and this rule joins it, so no parallel selector
//      and no parallel call site were added. It runs under EVERY `rules`
//      value and needs no new call site: the five `"all"` sites
//      (theta-document.ts:5884 alias arm, :6150 `let` annotation, :6225 `fn`
//      parameter, :6231 `fn` return, :6310 schema field type), the `params:`
//      per-field site (params.ts:202, shifted by bug 0059 §Fix's new sink and
//      refusal check in the same loop), the `@<T>` annotation site
//      (theta-document.ts:6612) and the `invoke<T>` site (:6517, which
//      selects the narrow set). Group (i) pins that reach BY ASSERTION over
//      the set's existing member, so a red in groups (a)/(b) is an absent
//      RULE and not an absent call site.
//   3. THE TWO LOWERERS BUILD THE FIELD LIST AND NEITHER IS A CHECKER.
//      `hoistInlineObjectType` (src/parser/params.ts:670) writes
//      `properties[fieldName] = …` then `required.push(fieldName)` (:687–:688);
//      a repeated name overwrites the property and appends to the array.
//      `lowerInlineObject` (src/parser/body-type-lowering.ts:153) reaches the
//      same two writes through `lowerObjectFields` (:120, :128). That product —
//      `{"properties":{"a":{"type":"string"}},"required":["a","a"]}` — is what
//      group (g) drives a real `AjvSchemaValidator` over.
//
// PROBED CURRENT SIGNATURES (HEAD df7a3d55 / 0.83.0, offline, deterministic).
// Every fixture below was measured against the tree as it stands, and every
// observable the bug doc's §Reproduction records reproduced verbatim — zero
// drift from its 0.49.0 tables: the position fixtures (A6, C1–C4, D1–D5), the
// depth fixtures (B1, C4), the shape probes H1 / H4 and the rename probes
// G1 / G4 all return `[]`; the declaration controls E1 / G3 / G5 render exactly
// the three lines group (e) pins; and the annotation root's lowering (A1)
// carries the duplicate `required` group (g) compiles, message-for-message.
// Measurements the doc does not carry are recorded at their cells: the
// unquoted YAML spelling of a duplicate-name inline body (a11), the lowered
// bytes of the quoted-name shape (d5), the load lists of the multiplicity
// fixtures (group (c)), of which the doc carries one lowering (H5), the
// lowered bytes of the truncation-boundary family (group (k)), and the load
// lists of the unterminated-interior family (group (l)).
//
// WHAT IS RED HERE: groups (a) except a11, (b), (c), (g)'s g1/g2, (h) and (j)
// — every cell asserting the prescribed diagnostic; each observes `[]` today.
// Groups (0), (a)'s a11, (d), (e), (f), (g)'s g3, (i), (k) and (l) are
// CONTROLS: green now, and green after, byte-for-byte. A red in (d) means the rule took
// one of the shapes the registry *Trigger* carves out; a red in (e) means it
// moved `checkObjectSchema`'s emission instead of adding an inline one; a red in
// (f) means it deduped in a lowerer instead of refusing at parse; a red in (i)
// means a call site was rewired rather than a rule added; a red in (k) means the
// rule ran past the stop position the row's key fixes or stopped ahead of it;
// a red in (l) means it compared a field list inside an interior the source
// never closes, which `ObjectType` gives no inline object type to name.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, or one direct lowerer /
// validator call. The observable is a parse-time diagnostic list and a lowered
// JSON fragment; an integration tier would add a session round-trip and could
// assert neither the PRESENCE of the parse diagnostic nor its ABSENCE in the
// control groups any more sharply, and a live tier would make the assertion
// stochastic on top — the AJV throw of group (g) is reachable in-process
// through the shipped seam, so nothing here needs a model turn. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the standard
// inert `parseDeps` double — the harness the bug doc's own §Reproduction used.
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

/** The code the inline spelling owes (code-registry-parse.md:87). */
const DUPLICATE_INLINE = "theta/parse/duplicate-inline-field-name";
/** The code the DECLARATION spelling keeps, unmoved (:85). */
const WIRE_COLLISION = "theta/parse/wire-name-collision";
/** The declaration-only rename warning (:84), pinned unmoved beside it. */
const REDUNDANT_WIRE = "theta/parse/redundant-wire-name";
/** The sibling rule of the same `"inline-object-shape"` set (:86), group (i)'s probe. */
const EMPTY_BODY = "theta/parse/empty-schema-body";
/** The frontmatter surface an unusable YAML block resolves to (code-registry-load.md:17). */
const MISSING_MODE = "theta/load/missing-mode";

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
 * The rendering for a REPEATED INLINE FIELD NAME. `<field>` is a category-5
 * source-derived placeholder (placeholder-rendering-b.md:10), identifier-shaped
 * and rendered unquoted, so the template's own quotes surround the name.
 */
function dupLine(field: string): string {
  return line("error", DUPLICATE_INLINE, msg(DUPLICATE_INLINE, [["<field>", field]]));
}

/** The code bug 0176 §Fix route A adds for a NON-REPEATING quoted key. */
const QUOTED_INLINE = "theta/parse/quoted-inline-field-name";

/**
 * The rendering for a quoted inline field-name key (bug 0176 §Fix route A),
 * subordinate to the duplicate row on a key that repeats: a repeated key keeps
 * `theta/parse/duplicate-inline-field-name` alone and draws nothing from this
 * row.
 */
function quotedInlineLine(field: string): string {
  return line("error", QUOTED_INLINE, msg(QUOTED_INLINE, [["<field>", field]]));
}

/** The rendering for the DECLARATION spelling of the same two fields. */
function collisionLine(name: string, schema: string): string {
  return line(
    "error",
    WIRE_COLLISION,
    msg(WIRE_COLLISION, [
      ["<name>", name],
      ["<schema>", schema],
    ]),
  );
}

/** The rendering for a declaration's redundant `as` rename (warning). */
function redundantLine(name: string): string {
  return line("warning", REDUNDANT_WIRE, msg(REDUNDANT_WIRE, [["<name>", name]]));
}

/** The rendering of the sibling inline-object-shape rule, group (i)'s probe. */
function emptyInlineLine(): string {
  return line("error", EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]]));
}

/** The rendering of the surface an unusable frontmatter block resolves to. */
function missingModeLine(): string {
  return line("error", MISSING_MODE, msg(MISSING_MODE, []));
}

// ===========================================================================
// Fixtures. One builder per position of grammar.md's enumeration, matching the
// sibling lock over this walk arm (tests/inline-empty-object-type.test.ts).
// Every body fixture ends `let a = 1` + `a` so the theta carries a tail
// expression, and every `params:` fixture carries `mode: prompt` so no
// `theta/load/missing-mode` noise is present.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** The subject of this report: two fields of one inline body sharing a name. */
const DUP = "{a: integer, a: string}";

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

function lines(src: string, path = "bug0052.theta"): string[] {
  return diagLines(parseDoc(src, path));
}

/**
 * The whole ordered diagnostic list of one source, asserted against `expected`.
 * A whole-list equality is what makes both directions reachable: an absent
 * emission and an extra one both red, and the multiplicity claims of group (c)
 * are only meaningful against a whole list.
 */
function expectList(src: string, expected: readonly string[], why: string): void {
  expect(lines(src), `${why}\nsource=${JSON.stringify(src)}`).toEqual([...expected]);
}

/** A `LowerCtx` over an EMPTY resolution set — no declaration resolves anything. */
function emptyCtx(): LowerCtx {
  return { bodyTypeMap: new Map<string, Record<string, unknown>>(), defs: {}, unresolved: [] };
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

/** The error-severity codes of one source, in emission order. */
function errorCodes(doc: ThetaDocument): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

// The lowered fragments the two lowerers produce today, hand-written so a fix
// that edits either one reds group (f) by byte rather than by shape. The slugs
// are the canonical hash of the fragment (schema-subset.md:73), so the
// duplicate-carrying fragment addresses one entry from every position.
const DUP_FRAGMENT = {
  type: "object",
  properties: { a: { type: "string" } },
  required: ["a", "a"],
  additionalProperties: false,
};
const DUP_SLUG = "__inline_7e1395c6a16e04cf";
const PAIR_FRAGMENT = {
  type: "object",
  properties: { a: { type: "integer" }, b: { type: "string" } },
  required: ["a", "b"],
  additionalProperties: false,
};
const PAIR_SLUG = "__inline_9b890568745f5ea5";

// ===========================================================================
// (0) THE ORACLE ITSELF — green now and after. Every expected string in this
// file is derived from the registry row, so a red here invalidates the rest.
// ===========================================================================

describe("bug 0052 (0) — the registry is the message oracle", () => {
  it("0a: the `duplicate-inline-field-name` row exists and carries the single `<field>` placeholder", () => {
    // DIAG-2: the registry is the closed authority for what the implementation
    // emits, so an expectation naming a code the registry does not carry is
    // unfalsifiable. The row lands with the code in one commit
    // (diagnostic-shape.md:72), which is why the oracle is asserted here and
    // not inferred from the emission.
    const template = registryMessage(REGISTRY, DUPLICATE_INLINE) as string | undefined;
    expect(
      template,
      "0a — docs/spec_topics/diagnostics/code-registry-parse.md:87 must carry the " +
        `${DUPLICATE_INLINE} row; it is the registered disposition grammar.md:109 assigns to a ` +
        "field name that repeats within one inline object type",
    ).toBeDefined();
    expect(
      template,
      "0a — the Message template must carry the `<field>` placeholder, or the diagnostic " +
        "cannot name WHICH name repeats, and the multiplicity claims of group (c) would be " +
        "unobservable",
    ).toContain("<field>");
  });

  it("0b: the inline rendering names the field, and differs from the declaration spelling's line", () => {
    // The two spellings of the same two fields carry different registered codes
    // (§Fix: `checkObjectSchema` is untouched, so the declaration keeps
    // `wire-name-collision`), so the group (a) cells and the group (e) controls
    // cannot be satisfied by each other's emission.
    expect(
      dupLine("a"),
      "0b — the inline rendering is the registry Message with `<field>` filled, never copied " +
        "prose",
    ).toBe(`error ${DUPLICATE_INLINE}: duplicate field name 'a' within one inline object type`);
    expect(
      collisionLine("a", "S"),
      "0b — the declaration rendering is the standing wire-name-collision row, unchanged",
    ).toBe(
      `error ${WIRE_COLLISION}: wire name 'a' collides with another field on schema 'S'`,
    );
    expect(
      dupLine("a"),
      "0b — an inline object has no name for `<schema>` to interpolate, so the inline case " +
        "needs its own row; the two renderings must differ or neither group can falsify the " +
        "other",
    ).not.toBe(collisionLine("a", "S"));
  });
});

// ===========================================================================
// (a) THE POSITION MATRIX — one cell per `Type` position of grammar.md:105
// plus the `.thetalib` spelling, each asserting exactly ONE registry-sourced
// line. type-system.md:15 is why they must answer alike.
// RED at HEAD: a1–a10 all produce `[]` (probed). a11 is a CONTROL.
// ===========================================================================

describe("bug 0052 (a) — every `Type` position refuses a repeated inline field name", () => {
  it("RED a1 (`let` annotation): `let x: {a: integer, a: string} = 1`", () => {
    expectList(
      body(`let x: ${DUP} = 1`),
      [dupLine("a")],
      "a1 — a `let` annotation is a bare-`Type` position (grammar.md:105) and the rule is " +
        "unqualified by position; the annotation lowers nothing, so the diagnostic is the only " +
        "signal available at all",
    );
  });

  it("RED a2 (`fn` parameter type): `fn f(p: {a: integer, a: string}) { 1 }`", () => {
    expectList(
      body(`fn f(p: ${DUP}) { 1 }`),
      [dupLine("a")],
      "a2 — an `fn` parameter type is a bare-`Type` position (grammar.md:105)",
    );
  });

  it("RED a3 (`fn` return type): `fn f(): {a: integer, a: string} { 1 }`", () => {
    expectList(
      body(`fn f(): ${DUP} { 1 }`),
      [dupLine("a")],
      "a3 — `ReturnType` is `Type` plus `void`, so an `ObjectType` is admitted here and the " +
        "rule reaches it",
    );
  });

  it("RED a4 (`let` annotation nested in an `fn` body): `fn f() { let x: {a: integer, a: string} = 1 }`", () => {
    // The walk is driven per statement, so a statement inside a function body
    // must reach the same check as one at the top level.
    expectList(
      body(`fn f() { let x: ${DUP} = 1 }`),
      [dupLine("a")],
      "a4 — a `let` inside an `fn` body is the same statement form at the same position; " +
        "the enclosing block is not a qualifier the rule reads",
    );
  });

  it("RED a5 (`schema` body field type): `schema S { p: {a: integer, a: string} }`", () => {
    // One of the three positions that HOIST, so the silence has an artefact:
    // `$defs.__inline_7e1395c6a16e04cf` carries `properties.a` typed by the
    // SECOND declaration and a two-item `required`. The declaration itself
    // declares a field, so `checkObjectSchema` has no empty body to report and
    // the whole list is the one inline line.
    expectList(
      body(`schema S { p: ${DUP} }`),
      [dupLine("a")],
      "a5 — grammar.md:109 gives the inline `Field` form the same field semantics as the " +
        "object-schema body's, so the two spellings of these two fields cannot disagree; the " +
        "declaration declares a field, so no declaration-subject line joins this one",
    );
  });

  it("RED a6 (alias / union RHS): `schema T = {a: integer, a: string}`", () => {
    expectList(
      body(`schema T = ${DUP}`),
      [dupLine("a")],
      "a6 — the alias right-hand side is an `AliasRhs ::= Type (\"|\" Type)*`, so its single " +
        "arm is an inline object in a `Type` position",
    );
  });

  it("RED a7 (`params:` field, quoted): `p: \"{a: integer, a: string}\"`", () => {
    // The argument boundary. This position lowers, and its bytes are frozen
    // (§Fix constraint 1), so the refusal is the only place the dropped
    // declaration can be reported.
    expectList(
      paramsSrc(`  p: "${DUP}"`),
      [dupLine("a")],
      "a7 — a `params:` field type is the same type grammar as every other position " +
        "(type-system.md:15); the binder validates arguments against a shape whose first `a` " +
        "was discarded",
    );
  });

  it("RED a8 (`@<T>` annotation root): ``let r = @<{a: integer, a: string}>`hi` ``", () => {
    // The position where the fragment IS the compiled document root, so AJV's
    // meta-schema check applies and the duplicate `required` throws after the
    // model turn. Group (g) drives that compile; this cell is the refusal that
    // makes it unreachable from a loading document.
    expectList(
      annotSrc(DUP),
      [dupLine("a")],
      "a8 — the `@<T>` annotation is a type ascription (grammar.md:105) and its lowering is " +
        "the compiled document root, so this input is refused at load rather than surfaced as " +
        "a validator throw after a query turn has been spent",
    );
  });

  it("RED a9 (`invoke<T>` return annotation): `let r = invoke<{a: integer, a: string}>(\"./x.theta\")`", () => {
    // The position that selects the narrow rule set (theta-document.ts:6517).
    // The rule joins that set, so this cell also pins that the widening reached
    // the narrow selection and not `"all"` alone.
    expectList(
      invokeSrc(DUP),
      [dupLine("a")],
      "a9 — `invoke<Type>` is a bare-`Type` position (grammar.md:105) whose call site selects " +
        "`\"inline-object-shape\"`; the rule belongs to that set, so a widening that reached " +
        "only `\"all\"` leaves this position silent",
    );
  });

  it("RED a10 (`.thetalib` spelling of the schema-body position)", () => {
    // imports.md:13 admits `schema` declarations at a `.thetalib` top level,
    // and the type grammar does not vary by file kind. An importer binding this
    // declaration would otherwise inherit the last-wins shape.
    expect(
      lines(`schema S { p: ${DUP} }\n`, "bug0052.thetalib"),
      "a10 — a `.thetalib` carries the same type grammar as a `.theta` " +
        "(type-system.md:15); the extension changes only the top-level-form check, which " +
        "admits this declaration",
    ).toEqual([dupLine("a")]);
  });

  it("CONTROL a11 (`params:` field, unquoted YAML): the flow-mapping spelling is refused one layer earlier", () => {
    // MEASURED, and not in the bug doc's §Reproduction, which probes the quoted
    // spelling only (C3). The unquoted spelling of THIS input is a YAML flow
    // mapping whose two `a` keys are a duplicate key, so the `yaml` parse
    // errors and FM-5 (src/parser/frontmatter.ts:838–:851) discards the
    // recovered contents: `map` becomes undefined and the block resolves to
    // `theta/load/missing-mode`, with `frontmatter` null. The theta type
    // grammar never sees the body, so no rule of this walk can fire and this
    // spelling cannot carry a10's line. §Non-goals records the same disposition
    // for the sibling shape (two `p:` keys in one block) and leaves it to the
    // frontmatter subject.
    //
    // The cell is a CONTROL because the disposition is a YAML-layer refusal
    // that a parse-time type rule cannot move: it is green now and stays green.
    // Its bound is the DISTINCT-name spelling asserted below, which loads
    // cleanly through the same surface — so the refusal is the duplicate KEY
    // and not the flow mapping.
    expectList(
      paramsSrc(`  p: ${DUP}`),
      [missingModeLine()],
      "a11 — a duplicate YAML key drops the whole frontmatter before the theta type grammar " +
        "runs, so the inline rule has no input at this spelling",
    );
    expectList(
      paramsSrc("  p: {a: integer, b: string}"),
      [],
      "a11 — the distinct-name flow mapping loads cleanly at the same spelling, which places " +
        "the refusal above on the repeated KEY rather than on the mapping form",
    );
  });
});

// ===========================================================================
// (b) DEPTH AND ARM POSITION — the rule is unqualified by nesting depth, and a
// union arm is a `Type` position at both the alias and the annotation root.
// RED at HEAD: all four `[]`.
// ===========================================================================

describe("bug 0052 (b) — the rule is unqualified by depth or arm position", () => {
  it("RED b1 (nested body at the annotation root): ``@<{p: {a: integer, a: string}}>``", () => {
    // The outer body's field list is `[p]` and the inner one's is `[a, a]`, so
    // exactly the inner body is the occurrence. At this depth the duplicate
    // hoists into `$defs` instead of landing at the root, so AJV compiles it
    // and enforces the last-wins property with no throw and no diagnostic —
    // the quietest of the defect's dispositions.
    expectList(
      annotSrc(`{p: ${DUP}}`),
      [dupLine("a")],
      "b1 — grammar.md makes each field's `Type` recursive and the rule is unqualified by " +
        "nesting depth, so an inner body's repeat is its own occurrence",
    );
  });

  it("RED b2 (nested body at the `params:` position): `p: \"{q: {a: integer, a: string}}\"`", () => {
    expectList(
      paramsSrc(`  p: "{q: ${DUP}}"`),
      [dupLine("a")],
      "b2 — b1's twin one position along; the two hoisting positions mint the same " +
        "content-addressed fragment for this text, so they cannot disagree about refusing it",
    );
  });

  it("RED b3 (union arm at the alias position): `schema T = {a: integer, a: string} | Cat`", () => {
    // The `Cat` declaration is present so no `unresolved-named-type` line joins
    // the list; the claim is about the arm, and the whole-list equality would
    // otherwise be asserting two rules at once.
    expectList(
      body(`schema Cat { n: string }\nschema T = ${DUP} | Cat`),
      [dupLine("a")],
      "b3 — a union arm is a bare-`Type` position (grammar.md:105) and the walk descends " +
        "arms, so exactly the object arm is the occurrence and the named arm contributes " +
        "nothing",
    );
  });

  it("RED b4 (brace-union arm at the annotation root): ``@<{a: integer, a: string} | null>``", () => {
    // The annotation root's own union spelling: the object arm is hoisted
    // rather than returned as the root, so this shape lowers without the AJV
    // throw of a8 — and is still the same refused input.
    expectList(
      annotSrc(`${DUP} | null`),
      [dupLine("a")],
      "b4 — `Type (\"|\" Type)*` is one grammar in every position (type-system.md:15), so " +
        "the arm spelling at the ascription position answers as b3 does at the alias one",
    );
  });
});

// ===========================================================================
// (c) MULTIPLICITY — one diagnostic per REPEATED NAME, in source order
// (code-registry-parse.md:87 *Trigger*). Each cell is a whole-list equality,
// which is the only shape that can falsify a count.
// RED at HEAD: all three `[]`.
// ===========================================================================

describe("bug 0052 (c) — one diagnostic per repeated name, in source order", () => {
  it("RED c1 (three occurrences of one name): `{a: integer, a: string, a: boolean}` raises ONCE", () => {
    // The row's *Trigger*: "a name written three times draws one line". A rule
    // emitting per EXTRA occurrence would give two here and pass c2, so the two
    // cells together fix the counting unit as the NAME.
    expectList(
      annotSrc("{a: integer, a: string, a: boolean}"),
      [dupLine("a")],
      "c1 — the diagnostic names the repeated field, so a third occurrence of the same name " +
        "adds no new subject to report",
    );
  });

  it("RED c2 (two independent repeats): `{a: integer, a: string, b: integer, b: string}` raises TWICE, `a` then `b`", () => {
    expectList(
      annotSrc("{a: integer, a: string, b: integer, b: string}"),
      [dupLine("a"), dupLine("b")],
      "c2 — two repeated names are two subjects, reported in source order at the second " +
        "occurrence of each; a per-body dedup would give one line and red here",
    );
  });

  it("RED c3 (two sibling bodies, each with a repeat): raises TWICE", () => {
    // The counting unit is the body, not the document: two sibling inline
    // bodies each carrying `a` twice are two occurrences of the same NAME in
    // two different field lists, and both are reported.
    expectList(
      annotSrc(`{p: ${DUP}, q: ${DUP}}`),
      [dupLine("a"), dupLine("a")],
      "c3 — each inline body is its own field list, so a per-document dedup on the name " +
        "would report one of the two authors' mistakes and swallow the other",
    );
  });

  it("RED c4 (an outer repeat and a nested one): `{p: {c: 1, c: 2}, p: 3}` reports the OUTER body first", () => {
    // The row settles the order between a body and the bodies nested in its
    // field types, which source order alone does not: the nested `{c: 1, c: 2}`
    // opens BEFORE the outer body's second `p`, so an order keyed on the
    // second-occurrence offset would put `c` first. A body's own repeats come
    // first, so the outer `p` leads.
    expectList(
      annotSrc("{p: {c: 1, c: 2}, p: 3}"),
      [dupLine("p"), dupLine("c")],
      "c4 — code-registry-parse.md:87 *Trigger*: a body's own repeats are reported before " +
        "those of the inline objects nested in its field types, so `p` precedes `c` however " +
        "the two second occurrences are ordered in the source",
    );
  });
});

// ===========================================================================
// (d) THE SHAPES THAT SETTLE THE RULE'S KEY. d1–d3 are silent AND
// byte-unchanged: two of the registry *Trigger*'s carve-outs
// (code-registry-parse.md:89), each a shape a rule keyed on "two equal texts
// anywhere under this node" would take with it. d4 and d5 are NOT a third
// and fourth carve-out — bug 0159 §Fix route (a) re-keys the comparison onto
// the raw pre-colon text of a brace-and-angle-aware top-level comma split,
// the same text both lowerers key their `properties` / `required` writes on,
// and under that key a rename and a quoted name are keys like any other:
// two entries spelling one such key twice are refused exactly as two plain
// names are.
// GREEN now and after for d1–d3. RED for d4 row 1 and d5, which this fix
// turns to a refusal (bug 0159 §Fix route (a); bug 0161 §Fix route B).
// ===========================================================================

describe("bug 0052 (d) — a nested reuse and a generic interior are not repeats; a rename and a quoted name are keys like any other", () => {
  it("CONTROL d1 (nested reuse, fixture H4): `@<{a: integer, b: {a: string}}>` stays silent and lowers unchanged", () => {
    // Two field lists — `[a, b]` and `[a]` — so no list repeats a name. The
    // lowered bytes are asserted beside the silence because they are what makes
    // the claim checkable: the inner `a` lands in its own hoisted fragment with
    // a ONE-item `required`, which is exactly the shape a duplicate would not
    // have.
    expectList(
      annotSrc("{a: integer, b: {a: string}}"),
      [],
      "d1 — grammar.md:109: a name reused between an outer inline object and one nested " +
        "inside it is two field lists rather than a repeat",
    );
    expect(
      lowerQueryResponseSchema("{a: integer, b: {a: string}}", [], []),
      "d1 — the nested fragment's `required` carries ONE `a`, so nothing here is the defect's " +
        "shape and the lowering must not move",
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" }, b: { $ref: "#/$defs/__inline_968e40317188aebd" } },
      required: ["a", "b"],
      additionalProperties: false,
      $defs: {
        __inline_968e40317188aebd: {
          type: "object",
          properties: { a: { type: "string" } },
          required: ["a"],
          additionalProperties: false,
        },
      },
    });
  });

  it("CONTROL d2 (distinct names, fixture A3): `@<{a: integer, b: string}>` stays silent and lowers unchanged", () => {
    expectList(
      annotSrc("{a: integer, b: string}"),
      [],
      "d2 — an inline object with distinct field names is legal theta in every `Type` " +
        "position; the rule names the repeat and no other shape",
    );
    expect(
      lowerQueryResponseSchema("{a: integer, b: string}", [], []),
      "d2 — the ordinary annotation root's bytes are untouched by a parse-time refusal " +
        "elsewhere",
    ).toEqual(PAIR_FRAGMENT);
  });

  it("CONTROL d3 (generic argument interior, fixture H1): `array<{a: integer, a: string}>` stays silent at every depth", () => {
    // THE CARVE-OUT THAT CONSTRAINS THE IMPLEMENTATION MOST. `walkType`'s
    // `generic` arm descends its arguments (src/parser/type-grammar.ts, the
    // `case "generic"` arm), and the sibling rule of the same rule SET does
    // fire inside `array<{}>` (group (i)'s row), so adding this check to the
    // `object` arm with no further qualification reds this cell.
    //
    // The reason the interior is outside the trigger is that it is never split
    // into fields: the generic-argument split is angle-only, so a two-field
    // interior presents as two arguments, the arity-1 `array` arm is not taken,
    // and the permissive fallthrough lowers `{}` whether or not the names
    // repeat. Nothing is dropped and no duplicate `required` is minted, so
    // there is no author-visible consequence for a diagnostic to name
    // (§Non-goals; code-registry-parse.md:87).
    expectList(
      body(`schema S { p: array<${DUP}> }`),
      [],
      "d3 — a generic type argument's interior is outside the trigger, at the position the " +
        "bug doc measures it (fixture H1)",
    );
    expectList(
      body(`schema S { p: array<{q: ${DUP}}> }`),
      [],
      "d3 — the carve-out is the whole interior rather than its first level alone: a body nested " +
        "inside the generic argument is reached through the same non-splitting argument",
    );
    expect(
      Object.fromEntries(
        buildBodyTypeSchemas(
          [{ name: "S", fields: [{ name: "p", typeSource: `array<${DUP}>` }] }],
          [],
        ),
      ),
      "d3 — the read-back the bug doc records for H1: `S.properties.p` is the permissive " +
        "`{}`, so the repeat inside the element type reaches no lowered artefact either",
    ).toEqual({
      S: {
        type: "object",
        properties: { p: {} },
        required: ["p"],
        additionalProperties: false,
      },
    });
  });

  it("RED d4 (an `as` rename inside an inline body): the key is the whole pre-colon text", () => {
    // Neither lowerer parses the `as` clause: the whole text before the
    // top-level colon becomes the property name, renamed or not. The
    // comparison reads that same text (code-registry-parse.md:89), so the
    // three spellings below divide on whether their pre-colon texts are
    // equal — not on whether a rename is present.
    //
    // Row 1 writes the identical text twice, so it is ONE key twice: the
    // lowering overwrites that single property and names it twice in
    // `required`, and the row is refused. Rows 2 and 3 write two different
    // pre-colon texts, so they are two distinct keys and two distinct
    // properties — admitted, and their `required` arrays repeat nothing.
    //
    // The subject rendered for row 1 is the ANNOTATION position's captured
    // text, which joins lexer token texts with no separator; the `params:`
    // position passes its YAML scalar through verbatim and renders the
    // author's spacing instead. That divergence belongs to the type-source
    // capture rather than to this rule, and is pinned as cell H1 of
    // tests/inline-object-field-name-comparison-key.test.ts.
    const cells: ReadonlyArray<readonly [type: string, want: string[]]> = [
      ['{a as "w": integer, a as "w": string}', [dupLine('aas"w"')]],
      ['{a as "w": integer, a as "x": string}', []],
      ['{a: integer, a as "x": string}', []],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [type, want] of cells) {
      actual[type] = lines(annotSrc(type));
      expected[type] = want;
    }
    expect(
      actual,
      "d4 — the rename clause is neither parsed nor stripped by either lowerer, so two fields " +
        "renamed alike declare one property name twice; the two rows whose pre-colon texts " +
        "differ declare two, and nothing is dropped there",
    ).toEqual(expected);
  });

  it('RED d5 (a quoted field name): `{"a": string, "a": integer}` is one key twice', () => {
    // The comparison key is the entry's raw pre-colon text after `trim()`,
    // with no unquoting and no normalisation (code-registry-parse.md:89), and
    // both entries here spell the same three characters. The subject `<field>`
    // renders is that text verbatim, by the row-scoped carve-out at
    // placeholder-rendering-b.md:10 — the key can be quoted or space-bearing,
    // neither of which is identifier-shaped.
    //
    // Whether the inline field-name slot should admit a non-identifier AT ALL
    // is a separate question this row does not answer: a SINGLE quoted field
    // still loads and still lowers a property name carrying the author's quote
    // characters. That residual is pinned as cell G2 of
    // tests/inline-object-field-name-comparison-key.test.ts.
    expectList(
      annotSrc('{"a": string, "a": integer}'),
      [dupLine('"a"')],
      "d5 — two entries whose raw pre-colon texts are identical are one key twice, which is " +
        "exactly the property name the lowering would overwrite and the `required` entry it " +
        "would repeat",
    );
    // WHAT THE REFUSAL PREVENTS, not a control of an admitted source: the
    // fragment below is still what a DIRECT lowerer call returns for this text
    // (§Fix constraint 1 freezes both lowerers), and the refusal above is what
    // keeps a loading document from reaching it.
    expect(
      lowerQueryResponseSchema('{"a": string, "a": integer}', [], []),
      "d5 — one last-wins property keyed with the source's quote characters beside a " +
        "`required` naming that key twice: the invalid fragment the refusal keeps unminted, " +
        "byte-identical to what it was before the refusal existed",
    ).toEqual({
      type: "object",
      properties: { '"a"': { type: "integer" } },
      required: ['"a"', '"a"'],
      additionalProperties: false,
    });
  });
});

// ===========================================================================
// (e) THE DECLARATION CONTROLS — byte-unchanged (DIAG-3/DIAG-4). §Fix leaves
// `checkObjectSchema` (src/parser/schema-declarations.ts:87) untouched, so the
// named-declaration spelling keeps its own two codes and its own subjects.
// GREEN now and after. A red here means the fix moved the declaration emission
// instead of adding an inline one.
// ===========================================================================

describe("bug 0052 (e) — the declaration spelling keeps its code, its subjects and its bytes", () => {
  it("CONTROL e1 (fixture E1): `schema S { a: integer, a: string }` keeps `wire-name-collision`", () => {
    // The contrast the whole report rests on: these are the same two fields as
    // `DUP`, written as a declaration, and they are already refused. The
    // collision loop (schema-declarations.ts:147) reports each colliding name
    // once, so the list is one line naming the field and the schema.
    expectList(
      body("schema S { a: integer, a: string }"),
      [collisionLine("a", "S")],
      "e1 — schemas.md:44 with the unrenamed default of :45: two fields with no `as` clause " +
        "share one effective wire name. This line is what the inline spelling owes an " +
        "equivalent of, and it must not move",
    );
  });

  it("CONTROL e2 (fixture G3): a rename collision keeps the same code, naming the WIRE name", () => {
    expectList(
      body('schema S { a as "w": integer, b as "w": string }'),
      [collisionLine("w", "S")],
      "e2 — the declaration's collision check runs on the effective wire name, so a renamed " +
        "collision names `w`; the inline rule compares theta-side field names and cannot " +
        "reach this shape",
    );
  });

  it("CONTROL e3 (fixture G5): a redundant rename keeps its warning", () => {
    expectList(
      body('schema S { a as "a": integer }'),
      [redundantLine("a")],
      "e3 — schemas.md:45 is the rule that fixes an unrenamed field's wire name to its " +
        "theta-side name; its declaration-position warning is unchanged, at warning severity",
    );
  });
});

// ===========================================================================
// (f) THE LOWERING FREEZE (§Fix constraint 1; the 0.44.0 and 0.49.0 freezes the
// bug doc cites). The refusal is at parse, so both lowerers stay callable and
// byte-identical — for a NON-duplicate body, and for the duplicate-carrying one
// too. A fix that deduped in a lowerer instead of refusing at parse reds here.
// GREEN now and after.
// ===========================================================================

describe("bug 0052 (f) — neither lowerer moves", () => {
  it("CONTROL f1: a NON-duplicate body lowers byte-identically at all three seams", () => {
    // One text through the annotation root's lowerer, the `params:` field
    // lowerer and the shared hoist. The `$defs` side-effect is asserted beside
    // the returned `$ref` because the minted `__inline_<slug>` name is the
    // content hash of the fragment (schema-subset.md:73) — a lowering edit that
    // changed a single byte would rename the entry and dangle every pointer.
    expect(
      lowerQueryResponseSchema("{a: integer, b: string}", [], []),
      "f1 — the annotation root returns the fragment AS the document root",
    ).toEqual(PAIR_FRAGMENT);

    const paramsCtx = emptyCtx();
    expect(
      lowerParamsFieldType("{a: integer, b: string}", paramsCtx),
      "f1 — the `params:` field lowerer emits the hoisted pointer",
    ).toEqual({ $ref: `#/$defs/${PAIR_SLUG}` });
    expect(
      paramsCtx.defs,
      "f1 — and registers the fragment under the content-addressed name",
    ).toEqual({ [PAIR_SLUG]: PAIR_FRAGMENT });

    const hoistCtx = emptyCtx();
    expect(
      hoistInlineObjectType("{a: integer, b: string}", hoistCtx, lowerParamsFieldType),
      "f1 — the shared hoist (src/parser/params.ts:670), which both hoisting positions reach",
    ).toEqual({ $ref: `#/$defs/${PAIR_SLUG}` });
    expect(hoistCtx.defs, "f1 — same fragment, same name").toEqual({
      [PAIR_SLUG]: PAIR_FRAGMENT,
    });

    const doc = parseDoc(paramsSrc('  p: "{a: integer, b: string}"'), "bug0052.theta");
    expect(
      diagLines(doc),
      "f1 — the document-level `params:` path over the same text stays clean",
    ).toEqual([]);
    expect(
      doc.frontmatter?.params?.loweredSchema,
      "f1 — and its lowered document is byte-unchanged, `$defs` closure included",
    ).toEqual({
      type: "object",
      properties: { p: { $ref: `#/$defs/${PAIR_SLUG}` } },
      required: ["p"],
      additionalProperties: false,
      $defs: { [PAIR_SLUG]: PAIR_FRAGMENT },
    });
  });

  it("CONTROL f2: the duplicate-carrying fragment is STILL what a direct lowerer call produces", () => {
    // §Fix constraint 1 is explicit that deduping in the shared arm is not
    // available: these bytes ARE the frozen `params:` position's output for
    // this text. The refusal keeps the input from reaching a lowerer through a
    // loading document (group (g)); it does not change what a direct call
    // returns. A fix that made these three calls emit a one-item `required`
    // reds here and would silently move every position's frozen bytes.
    expect(
      lowerQueryResponseSchema(DUP, [], []),
      "f2 — the annotation root's lowering is unchanged: last-wins `properties.a` beside a " +
        "two-item `required`",
    ).toEqual(DUP_FRAGMENT);

    const paramsCtx = emptyCtx();
    expect(
      lowerParamsFieldType(DUP, paramsCtx),
      "f2 — the `params:` field lowerer is unchanged",
    ).toEqual({ $ref: `#/$defs/${DUP_SLUG}` });
    expect(
      paramsCtx.defs,
      "f2 — the content-addressed name is the hash of the duplicate-carrying fragment, so " +
        "every position that lowers this text still addresses one entry",
    ).toEqual({ [DUP_SLUG]: DUP_FRAGMENT });

    const hoistCtx = emptyCtx();
    expect(
      hoistInlineObjectType(DUP, hoistCtx, lowerParamsFieldType),
      "f2 — the shared hoist is unchanged",
    ).toEqual({ $ref: `#/$defs/${DUP_SLUG}` });
    expect(hoistCtx.defs, "f2 — same fragment, same name").toEqual({
      [DUP_SLUG]: DUP_FRAGMENT,
    });
  });
});

// ===========================================================================
// (g) UNREACHABILITY (§Fix constraint 2). The DOCUMENT-level claim is the
// assertable half: a refused fixture carries an `E`-severity diagnostic, so it
// does not load and nothing downstream is handed its lowered bytes. g3 is what
// the refusal prevents, driven through the real seam.
// RED at HEAD: g1, g2 (both observe `[]`). GREEN: g3.
// ===========================================================================

describe("bug 0052 (g) — a refused document reaches no lowering and no compile", () => {
  it("RED g1: the `@<T>` fixture carries an error-severity diagnostic, so it does not load", () => {
    const doc = parseDoc(annotSrc(DUP), "bug0052.theta");
    expect(
      errorCodes(doc),
      "g1 — GOV-15 loads-cleanly: this input carries no `E` diagnostic at 0.83.0, and the fix " +
        `brings it into the ${DUPLICATE_INLINE} emission set. An error-severity diagnostic is ` +
        "what refuses the theta, so `lowerQueryResponseSchema` is never reached through the " +
        `load path and the g3 compile below cannot run. Observed: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([DUPLICATE_INLINE]);
  });

  it("RED g2: the `params:` fixture carries an error-severity diagnostic, so it does not load", () => {
    const doc = parseDoc(paramsSrc(`  p: "${DUP}"`), "bug0052.theta");
    expect(
      errorCodes(doc),
      "g2 — the argument boundary's half of the same claim: the hoisting positions compile " +
        "without complaint and enforce the last-wins shape, so the refusal is the only thing " +
        `that keeps the author's discarded declaration from being validated against. Observed: ${JSON.stringify(diagLines(doc))}`,
    ).toEqual([DUPLICATE_INLINE]);
  });

  it("CONTROL g3: what the refusal prevents — the duplicate fragment is a document AJV refuses to compile", () => {
    // The consequence §Why it matters names, driven through the production seam
    // (src/seams/schema-validator.ts:149, `#build`'s `this.#ajv.compile`). The
    // Ajv instance is built with `strict: false`, which does not disable
    // meta-schema validation, and the meta-schema constrains `required` to
    // unique items — applied to the ROOT document only, which is why the
    // annotation root throws where a hoisted `$defs` member compiles.
    //
    // THE PARSE REFUSAL IS WHAT MAKES THIS UNREACHABLE FROM A LOADING DOCUMENT:
    // g1 refuses the fixture, so no lowering is minted and neither compile site
    // runs. No `catch` is added at any AJV seam (§Fix constraint 2) — this cell
    // asserts on the THROW, not on a resolve, and it stays green after the fix
    // because the lowerer it calls is frozen (group (f)) and reachable only by
    // a direct call like this one.
    const lowered = lowerQueryResponseSchema(DUP, [], []);
    expect(
      lowered,
      "g3 — the fragment the annotation root would hand the compile: one property typed by " +
        "the SECOND declaration, beside a `required` naming it twice",
    ).toEqual(DUP_FRAGMENT);

    const { validator, emitted } = ajv();
    expect(
      () => validator.compile(lowered as LoweredSchema),
      "g3 — a duplicate `required` entry is invalid JSON Schema; both compile sites for this " +
        "lowering run over a CANDIDATE PAYLOAD, so at HEAD the throw lands after the model " +
        "turn has been spent, as an internal error rather than a diagnostic",
    ).toThrowError(
      "schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)",
    );
    expect(
      emitted.map((d) => d.code),
      "g3 — the throw is the compile's own meta-schema refusal, not a cache-collision " +
        "diagnostic",
    ).toEqual([]);

    const { validator: pairValidator } = ajv();
    const pairCompiled = pairValidator.compile(
      lowerQueryResponseSchema("{a: integer, b: string}", [], []) as LoweredSchema,
    );
    expect(
      pairCompiled.validate({ a: 1, b: "s" }).ok,
      "g3 — the distinct-name fragment compiles and validates, which places the throw above " +
        "on the duplicate `required` and not on the object shape",
    ).toBe(true);
  });
});

// ===========================================================================
// (h) THE COMPOUND POSITION — bug 0093's fix flipped this cell. A `let`
// annotation over a query initialiser used to be checked at TWO sites: the
// annotation walk, and the query arm, which re-walked the same text after the
// annotation was propagated into the query's schema. Every rule on this walk
// used to emit twice there — group (i)'s compound row shows the sibling rule
// having doubled identically before the fix, which is why the doubling
// belonged to the POSITION and not to this rule. `parseLet` now marks a
// propagated query with `schemaFromLetAnnotation`, and the query arm
// withholds its own re-walk for a marked query, so the statement-ranged
// verdict from the `let` arm is the only one that survives.
// GREEN now: `[dupLine("a")]` for row 1 too.
// ===========================================================================

describe("bug 0052 (h) — the compound annotation-plus-query position emits once per occurrence", () => {
  it("RED h1: the compound position emits once, matching each single-site spelling", () => {
    // A three-row table rather than three cells: the claim is the CONTRAST
    // between the compound row and the two single-site rows, and separate
    // assertions would stop at the first divergence and hide it.
    const cells: ReadonlyArray<readonly [string, string[]]> = [
      [`let r: ${DUP} = @\`hi\``, [dupLine("a")]],
      [`let r: ${DUP} = 1`, [dupLine("a")]],
      ["let r = @<" + DUP + ">`hi`", [dupLine("a")]],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [stmt, want] of cells) {
      actual[stmt] = lines(body(stmt));
      expected[stmt] = want;
    }
    expect(
      actual,
      "h1 — the rule now emits once per occurrence at every one of the three rows, including " +
        "the compound row (row 1): bug 0093's fix withholds the query arm's re-walk for a " +
        "propagated annotation, so only the statement-ranged verdict from the `let` arm survives",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (i) THE RULE SET ALREADY RUNS AT EVERY POSITION THIS FILE ASSERTS. The rule
// joins the existing `"inline-object-shape"` SET (`TypeCheckRules`,
// src/parser/type-grammar.ts), named for the SHAPE its members govern rather
// than for either rule; this rule joins it, so no parallel selector and no
// parallel call site were added. This group drives the set's EXISTING
// member — the empty-inline-object rule, whose own lock is
// tests/inline-empty-object-type.test.ts — over the same sixteen sources, at
// the same positions and depths, plus the `.thetalib` spelling a10 asserts
// over.
//
// That makes the reds above diagnosable: an absent line in (a)/(b)/(h) is an
// absent RULE, because the walk demonstrably reaches each of those positions
// today. The row for the generic argument is the other half of d3's key: the
// walk descends into `array<…>`, and the empty rule DOES fire there, so the
// duplicate rule's silence in that interior is a deliberate carve-out and not
// an unreached position.
// GREEN now and after: this fix adds a rule to the set and rewires no call site.
// ===========================================================================

describe("bug 0052 (i) — the walk reaches every asserted position today", () => {
  it("CONTROL i1: the set's existing member fires at all sixteen positions and depths", () => {
    const cells: ReadonlyArray<readonly [label: string, source: string, lineCount: number]> = [
      ["let annotation", body("let x: {} = 1"), 1],
      ["fn parameter", body("fn f(p: {}) { 1 }"), 1],
      ["fn return", body("fn f(): {} { 1 }"), 1],
      ["fn-body let", body("fn f() { let x: {} = 1 }"), 1],
      ["schema field", body("schema S { p: {} }"), 1],
      ["alias RHS", body("schema T = {}"), 1],
      ["params quoted", paramsSrc('  p: "{}"'), 1],
      ["params flow mapping", paramsSrc("  p: {}"), 1],
      ["annotation root", annotSrc("{}"), 1],
      ["invoke return", invokeSrc("{}"), 1],
      ["annotation nested", annotSrc("{p: {}}"), 1],
      ["params nested", paramsSrc('  p: "{q: {}}"'), 1],
      ["alias union arm", body("schema Cat { n: string }\nschema T = {} | Cat"), 1],
      ["annotation union arm", annotSrc("{} | null"), 1],
      ["generic argument", body("schema S { p: array<{}> }"), 1],
      ["compound let + query", body("let r: {} = @`hi`"), 1],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [label, source, lineCount] of cells) {
      actual[label] = lines(source);
      expected[label] = Array.from({ length: lineCount }, () => emptyInlineLine());
    }
    expect(
      actual,
      "i1 — every position groups (a), (b), (d) and (h) assert over already runs the " +
        `"inline-object-shape" rule set, and the compound row now emits once, matching every ` +
        "other row (bug 0093's fix withholds the query arm's re-walk for a propagated " +
        "annotation); so a missing line above is a missing rule, and the `.thetalib` " +
        "row of a10 is the one file-kind variant the set does not vary by",
    ).toEqual(expected);
    expect(
      lines("schema S { p: {} }\n", "bug0052.thetalib"),
      "i1 — the `.thetalib` spelling of the schema-body position, the file kind a10 asserts " +
        "over",
    ).toEqual([emptyInlineLine()]);
  });
});

// ===========================================================================
// (j) THE COMPARISON KEY — each entry's raw pre-colon text, after `trim()`
// (code-registry-parse.md:89 *Trigger*). The key is the SOURCE's and not the
// lowered artefact's: an entry whose type position is empty keeps its key even
// where both lowerers drop the property (j1), padding and a trailing comma do
// not move it (j2), and the container is `Set`-based, so an author-chosen name
// like `__proto__` is compared against the entries the interior spells rather
// than answered out of an object's own prototype (j3).
// RED at HEAD: all three `[]`.
// ===========================================================================

describe("bug 0052 (j) — the comparison key is the source's text, not the lowered artefact's", () => {
  it("RED j1 (a name with no parseable type): `{a: integer, a: }` fires once", () => {
    // Both rows spell `a` at two field-name positions, so both are refused; the
    // pair is one cell because the CONTRAST is the claim. The tolerant recovery
    // gives the second field a type read out of whatever follows it — row 2's
    // `b` is read as row 2's second field type, row 1 has nothing to take — so
    // a key that waited for a parsed type would answer these two differently on
    // a difference the author did not write into either name.
    //
    // MEASURED below: row 1 lowers a SINGLE `a`, each lowerer dropping the
    // empty half. This cell is therefore where the refusal is keyed on the
    // SOURCE rather than on the lowered artefact — the two answers diverge
    // here, and the row's key takes the source's.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const type of ["{a: integer, a: }", "{a: integer, a: , b: string}"]) {
      actual[type] = lines(annotSrc(type));
      expected[type] = [dupLine("a")];
    }
    expect(
      actual,
      "j1 — the interior spells `a` at two field-name positions in both rows, which is the " +
        "row's trigger; an absent or stolen type behind the second position is not a licence " +
        "to drop the name the author wrote",
    ).toEqual(expected);
    expect(
      lowerQueryResponseSchema("{a: integer, a: }", [], []),
      "j1 — this text lowers one property and a ONE-item `required`, so the refusal above " +
        "cannot be read off the lowered fragment; it is read off the source's field-name " +
        "positions",
    ).toEqual({
      type: "object",
      properties: { a: { type: "integer" } },
      required: ["a"],
      additionalProperties: false,
    });
  });

  it("RED j2 (padded, with a trailing comma, fixture H7): `{ a : integer , a : string , }` fires once", () => {
    // §Fix constraint 4 names H7 as one of the three fixtures pinning the
    // chosen key's agreement with what is lowered; the other two are H1's
    // generic argument (d3) and H8's union arm (b3). Whitespace around the
    // colons and a trailing comma change neither the field-name positions the
    // interior spells nor the fragment the annotation root mints, so this
    // spelling answers as a8 does and lowers the bytes group (f) freezes.
    expectList(
      annotSrc("{ a : integer , a : string , }"),
      [dupLine("a")],
      "j2 — the type tokeniser is whitespace-insensitive and `ObjectType` admits a trailing " +
        "comma (grammar.md:101), so the padded spelling is the same two field-name positions " +
        "as the unpadded one",
    );
    expect(
      lowerQueryResponseSchema("{ a : integer , a : string , }", [], []),
      "j2 — the agreement constraint 4 names: this text lowers the same duplicate-carrying " +
        "fragment as the unpadded spelling, so key and lowering answer alike at this fixture",
    ).toEqual(DUP_FRAGMENT);
  });

  it("RED j3 (a field name spelling an object's own prototype keys): `__proto__` and `constructor` each fire once", () => {
    // A field name is author-written input, so the comparison's container must
    // not answer for names it never saw. Held in two `Set`s: a plain object
    // keyed by field name would find `constructor` and `__proto__` already
    // present before any field was read, and both spellings below would escape
    // the comparison entirely. One cell over the two names, since the claim is
    // that NEITHER name is answerable by the container's own prototype.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const name of ["__proto__", "constructor"]) {
      const type = `{${name}: integer, ${name}: string}`;
      actual[type] = lines(annotSrc(type));
      expected[type] = [dupLine(name)];
    }
    expect(
      actual,
      "j3 — the rule names the repeated field, so every field name an author may write must " +
        "be compared against the fields the interior spells and against nothing else",
    ).toEqual(expected);
  });
});

// ===========================================================================
// (k) THE MALFORMED-ENTRY FAMILY — the interiors that carry an entry no `Field`
// form spells, beside entries that repeat a key. The comparison runs over the
// entries a brace-aware top-level comma split yields, keyed on each entry's raw
// pre-colon text after `trim()` (code-registry-parse.md:89 *Trigger*), so a
// malformed entry neither ends the comparison nor curtails an enclosing body's:
// it is one entry whose pre-colon text is empty, contributing no key and
// nothing else. Every cell here therefore refuses — whether the repeat sits in
// the SAME body as the malformed entry (k1–k3, k8), in the body ONE LEVEL UP
// (k4, k6) or TWO levels up (k7).
//
// The key is what makes each refusal checkable against the lowering, and that
// is the property this group exists for: each read-back below is the invalid
// fragment the source WOULD have minted, and every repeated `required` entry in
// it is named by a line the cell asserts. The general form of that containment
// is asserted over a table in group (D) of
// tests/inline-object-field-name-comparison-key.test.ts.
//
// TWO CELLS BOUND THE GROUP FROM EITHER SIDE, and neither moves. k5 is the
// shape where NO body repeats a key and no duplicate `required` is minted
// anywhere — a name reused between an outer inline object and one nested inside
// it is two field lists rather than a repeat (group (d), d1) — so an emission
// there would name a consequence no fragment carries. k9 is a repeat spelled
// beside a malformed entry in the same body, which fires exactly once: the
// counting unit is the KEY, so a third occurrence adds no subject.
// A red in k1–k4 or k6–k8 means the comparison is still keyed on the type
// grammar's own `Ident ":"` positions rather than on the split the lowerers
// use; a red in k5 means the re-key over-reached into a source whose lowering
// repeats nothing.
// ===========================================================================

describe("bug 0052 (k) — a malformed entry contributes no key and curtails no comparison", () => {
  it("RED k1 (a nameless entry): `{a: integer, : x, a: boolean}` is refused", () => {
    // The middle entry has a top-level `:` with nothing before it, so its
    // pre-colon text is empty and it contributes no key. The two `a` entries
    // on either side of it are compared to each other, which is also exactly
    // how the lowering derives the two `required` members it writes.
    expectList(
      annotSrc("{a: integer, : x, a: boolean}"),
      [dupLine("a")],
      "k1 — an entry that spells no key is one entry with no key, not a boundary; the entries " +
        "behind it are the same entries the lowering keys its properties on",
    );
    // WHAT THE REFUSAL PREVENTS: the fragment a direct lowerer call still
    // returns for this text (§Fix constraint 1 freezes both lowerers), no
    // longer reachable through a loading document.
    expect(
      lowerQueryResponseSchema("{a: integer, : x, a: boolean}", [], []),
      "k1 — `required: [\"a\",\"a\"]` beside a last-wins `properties.a`: the invalid fragment " +
        "the refusal keeps unminted, whose root-position compile g3 drives to a throw",
    ).toEqual({
      type: "object",
      properties: { a: { type: "boolean" } },
      required: ["a", "a"],
      additionalProperties: false,
    });
  });

  it('RED k2 (a quoted name ahead of a repeat): `{"a": string, a: integer, a: boolean}` is refused', () => {
    // The quoted entry's key is the three characters `"a"`, quote characters
    // included and not unquoted (code-registry-parse.md:89), so it collides
    // with neither unquoted `a`. The repeat is between the two entries behind
    // it, and it is those two the lowering writes one property for.
    // WHY THIS LIST GREW: bug 0176 §Fix route A refuses the non-repeating quoted
    // key `"a"` on its own row, in source order ahead of the repeat behind it;
    // the settled precedence subordinates the new row to this one only on a key
    // that REPEATS, and `"a"` here occurs once.
    expectList(
      annotSrc('{"a": string, a: integer, a: boolean}'),
      [quotedInlineLine('"a"'), dupLine("a")],
      "k2 — the quoted key and the bare key are two distinct texts, so the subject of the " +
        "duplicate line is the bare `a` the two later entries share, and the quoted entry " +
        "ahead of it draws bug 0176's refusal instead of nothing",
    );
    // WHAT THE REFUSAL PREVENTS: the three-item `required` this text still
    // lowers on a direct call, its middle `a` declaration dropped to last-wins.
    expect(
      lowerQueryResponseSchema('{"a": string, a: integer, a: boolean}', [], []),
      "k2 — a three-item `required` naming `a` twice: the fragment the refusal keeps out of " +
        "the same root-position compile failure",
    ).toEqual({
      type: "object",
      properties: { '"a"': { type: "string" }, a: { type: "boolean" } },
      required: ['"a"', "a", "a"],
      additionalProperties: false,
    });
  });

  it('RED k3 (a rename ahead of a repeat): `{a as "w": integer, a: string, a: boolean}` is refused', () => {
    // The renamed entry's key is its whole pre-colon text, `as` clause
    // included, because neither lowerer parses that clause and the comparison
    // reads the same text. It therefore collides with neither unrenamed `a`,
    // and the repeat is between the two entries behind it. d4 pins the rename
    // spellings that carry no other repeat.
    expectList(
      annotSrc('{a as "w": integer, a: string, a: boolean}'),
      [dupLine("a")],
      "k3 — an unparsed rename is a distinct key, so the subject is the bare `a` the two " +
        "later entries share",
    );
    // WHAT THE REFUSAL PREVENTS: the three-item `required` this text still
    // lowers on a direct call, beside the unparsed rename's own property name.
    expect(
      lowerQueryResponseSchema('{a as "w": integer, a: string, a: boolean}', [], []),
      "k3 — a three-item `required` naming `a` twice beside the rename's own key: the " +
        "fragment the refusal keeps unminted",
    ).toEqual({
      type: "object",
      properties: { 'a as "w"': { type: "integer" }, a: { type: "boolean" } },
      required: ['a as "w"', "a", "a"],
      additionalProperties: false,
    });
  });

  it("RED k4 (a malformed entry inside a NESTED body): `{p: {c: 1, : y, c: 2}, p: 3}` is refused TWICE", () => {
    // Two bodies, each repeating a key of its own. The outer body's split is
    // brace-aware, so `p: {c: 1, : y, c: 2}` is ONE entry however its value is
    // spelled, and the outer body's two `p` entries are compared to each other
    // — the malformed entry inside the nested value is not the outer body's
    // entry and cannot curtail it. The nested body's own two `c` entries are
    // its own occurrence.
    //
    // ORDER: a body's own repeats are reported before those of the inline
    // objects nested in its field types (code-registry-parse.md:89), so `p`
    // precedes `c` however the two second occurrences sit in the source. The
    // well-formed contrast is fixture c4 (group (c)), which reports the same
    // two subjects in the same order with the malformed entry removed.
    expectList(
      annotSrc("{p: {c: 1, : y, c: 2}, p: 3}"),
      [dupLine("p"), dupLine("c")],
      "k4 — the outer body's entries are decided by its own top-level commas, so what a " +
        "field's value spells inside its braces changes neither how many entries the outer " +
        "body has nor what they are keyed on",
    );
    // WHAT THE REFUSAL PREVENTS: the root `required` this text still lowers on
    // a direct call. The nested `c` repeat has no read-back of its own here
    // because the root's own duplicate drops `p`'s first value to last-wins,
    // which is why the emission names more than the lowering can show.
    expect(
      lowerQueryResponseSchema("{p: {c: 1, : y, c: 2}, p: 3}", [], []),
      "k4 — a two-item `required` naming `p` twice at the ROOT beside a last-wins " +
        "`properties.p = {const: 3}`: the document bug 0052's own A2 compile refuses, kept " +
        "unreachable from a load by the two lines above",
    ).toEqual({
      type: "object",
      properties: { p: { const: 3 } },
      required: ["p", "p"],
      additionalProperties: false,
    });
  });

  it("CONTROL k5 (a stop with no repeat in any body): `{p: {c: 1, : y, p: 2}}` stays silent and mints no duplicate at all", () => {
    // THE SHAPE THAT FIXES THE THIRD STOP. No field list here spells one name
    // twice: the outer body spells `p`, and the nested body spells `c` then
    // `p`. A name reused between an outer inline object and one nested inside
    // it is two field lists rather than a repeat (group (d), d1), so an
    // emission naming `p` on this source would name a repeat NO SINGLE BODY
    // SPELLS. It is reachable only through the leak: the nested `parseObject`
    // call breaks at `y` without consuming the nested interior's own `}`, so
    // the outer loop resumes inside that interior and reads its leftover
    // `p: 2` position as the OUTER body's own field name. The outer body's name
    // list therefore stops at the field whose type carries an interior that
    // never closes, and compares `["p"]`.
    //
    // MEASURED, and the reason this cell is not a residual: the lowering mints
    // NO duplicate `required` anywhere — `["p"]` at the root and `["c","p"]` in
    // the hoisted nested entry — so no declaration is dropped, no fragment is
    // invalid JSON Schema, and there is no author-visible consequence at any
    // position for a diagnostic to name.
    expectList(
      annotSrc("{p: {c: 1, : y, p: 2}}"),
      [],
      "k5 — the row compares the field-name positions ONE interior spells; a name list read " +
        "through an interior that never closes holds another body's positions, so a repeat " +
        "reported off it would be false of the source",
    );
    expect(
      lowerQueryResponseSchema("{p: {c: 1, : y, p: 2}}", [], []),
      "k5 — the measured lowering: one `p` in the root `required` and `[\"c\",\"p\"]` in the " +
        "hoisted entry, so this source carries none of the duplicate-`required` shape the bug " +
        "is about",
    ).toEqual({
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
    });
  });

  it("RED k6 (three occurrences beside the malformed entry): `{p: {c: 1, : y, c: 2, c: 3}, p: 9}` is refused TWICE", () => {
    // k5's shape with real repeats added on both levels. The nested body's
    // entries are `c`, the nameless one, `c` and `c`, which is ONE repeated key
    // and so one line: the counting unit is the key, not the extra occurrence.
    // The outer body's two `p` entries are its own repeat, reported first.
    //
    // The subject `c` names a key the NESTED body spells, never one the outer
    // body spells — which is the discipline k5 fixes and this cell keeps: each
    // line belongs to the body whose own split produced the repeated key.
    expectList(
      annotSrc("{p: {c: 1, : y, c: 2, c: 3}, p: 9}"),
      [dupLine("p"), dupLine("c")],
      "k6 — two bodies, one repeated key each, reported outer body first; a third occurrence " +
        "of `c` adds no subject",
    );
    // WHAT THE REFUSAL PREVENTS: the root `required` this text still lowers on
    // a direct call. As in k4, the root's own duplicate erases the nested body
    // from the fragment, so `c` has no read-back here.
    expect(
      lowerQueryResponseSchema("{p: {c: 1, : y, c: 2, c: 3}, p: 9}", [], []),
      "k6 — `required: [\"p\",\"p\"]` at the root beside a last-wins " +
        "`properties.p = {const: 9}`: the invalid fragment the refusal keeps unminted",
    ).toEqual({
      type: "object",
      properties: { p: { const: 9 } },
      required: ["p", "p"],
      additionalProperties: false,
    });
  });

  it("RED k7 (depth three): `{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}` reports the outermost and the innermost bodies", () => {
    // DEPTH THREE, which is what makes each line's OWNERSHIP falsifiable. Every
    // body's entries come from its own brace-aware top-level comma split, so
    // the malformed entry three levels down belongs to the innermost body
    // alone; the middle body's entries are `q` and `r`, which repeat nothing,
    // and the outermost body's two `p` entries are its own repeat.
    //
    // The second row is the one that fixes ownership from the other side. Its
    // outermost body spells `a` and `z`, and its MIDDLE body spells `b` and
    // `a` — two field lists, not a repeat (group (d), d1) — so the only
    // repeated key anywhere is the innermost `c`, and it is the only line. A
    // comparison that let one body's entries leak into an enclosing body's
    // split would report `a` here, false of the source and matched by no
    // duplicate `required` at that root (the read-back below: `["a","z"]`, the
    // sole duplicate being `["c","c"]` inside a hoisted `$defs` member).
    const cells: ReadonlyArray<
      readonly [type: string, want: string[], lowered: Record<string, unknown>]
    > = [
      [
        "{p: {q: {c: 1, : y, c: 2}, r: 4}, p: 3}",
        [dupLine("p"), dupLine("c")],
        {
          type: "object",
          properties: { p: { const: 3 } },
          required: ["p", "p"],
          additionalProperties: false,
        },
      ],
      [
        "{a: {b: {c: 1, : y, c: 2}, a: 4}, z: 5}",
        [dupLine("c")],
        {
          type: "object",
          properties: { a: { $ref: "#/$defs/__inline_6e47c05ad43f8f42" }, z: { const: 5 } },
          required: ["a", "z"],
          additionalProperties: false,
          $defs: {
            __inline_8d71c6afe0e98dbc: {
              type: "object",
              properties: { c: { const: 2 } },
              required: ["c", "c"],
              additionalProperties: false,
            },
            __inline_6e47c05ad43f8f42: {
              type: "object",
              properties: { b: { $ref: "#/$defs/__inline_8d71c6afe0e98dbc" }, a: { const: 4 } },
              required: ["b", "a"],
              additionalProperties: false,
            },
          },
        },
      ],
    ];
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const [type, want] of cells) {
      actual[type] = lines(annotSrc(type));
      expected[type] = want;
    }
    expect(
      actual,
      "k7 — each line belongs to the body whose own split produced the repeated key, at any " +
        "depth; a split that read an enclosing body's entries through a nested value would " +
        "report a key neither of the second row's field lists repeats",
    ).toEqual(expected);
    // WHAT THE REFUSAL PREVENTS: the fragments a direct lowerer call still
    // returns. The first row's duplicate is at the compiled ROOT, where AJV's
    // meta-schema check applies and the compile throws; the second row's is
    // inside a hoisted `$defs` member, which AJV compiles and then enforces
    // against the model's payload.
    for (const [type, , lowered] of cells) {
      expect(
        lowerQueryResponseSchema(type, [], []),
        `k7 — the frozen lowering of ${type}, kept unreachable from a load by the lines ` +
          "above; the two rows differ in WHERE their duplicate lands, which is why one throws " +
          "at compile and the other is enforced against a payload instead",
      ).toEqual(lowered);
    }
  });

  it("RED k8 (a missing field separator): `{a: 1 a: 2, a: 3}` is refused", () => {
    // A missing `,` changes which entries the split yields, not whether their
    // keys are compared: the interior's one top-level comma gives two entries,
    // `a: 1 a: 2` and `a: 3`, whose pre-colon texts are both `a`. Those are the
    // same two entries the lowering keys its two `required` members on.
    //
    // At the three declaration positions and at `params:` this line REPLACES
    // the residue sink those positions raise for this text today
    // (`theta/parse/schema-type-not-expression` /
    // `theta/load/params-type-not-expression`), each of which is a last-resort
    // guard that stands down once the field's own walk has refused it; group
    // (A) of tests/inline-object-field-name-comparison-key.test.ts pins that
    // substitution at all nine positions.
    expectList(
      annotSrc("{a: 1 a: 2, a: 3}"),
      [dupLine("a")],
      "k8 — the entry boundary is the top-level comma, so a run-together field pair is one " +
        "entry with one key, and that key repeats against the entry behind it",
    );
    // WHAT THE REFUSAL PREVENTS: the fragment a direct lowerer call still
    // returns, with both earlier declarations dropped to last-wins.
    expect(
      lowerQueryResponseSchema("{a: 1 a: 2, a: 3}", [], []),
      "k8 — a two-item `required` naming `a` twice beside `properties.a = {const: 3}`: the " +
        "invalid fragment the refusal keeps unminted",
    ).toEqual({
      type: "object",
      properties: { a: { const: 3 } },
      required: ["a", "a"],
      additionalProperties: false,
    });
  });

  it("CONTROL k9 (a repeat AHEAD of the stop): `{a: 1, a: 2, b: {c: 1, : y, d: 2}, a: 3}` fires exactly ONCE", () => {
    // THE BOUND ON EVERY CELL ABOVE. The stop truncates the name list; it does
    // not switch the comparison off. This outer body spells `a`, `a` and `b`
    // ahead of the stop its `b` field's type carries, so the repeat among those
    // positions is compared and reported, and only the trailing `a: 3` behind
    // the stop is not. One line and not two, the row's counting unit being the
    // NAME: `a` is already reported when the third position would be read.
    expectList(
      annotSrc("{a: 1, a: 2, b: {c: 1, : y, d: 2}, a: 3}"),
      [dupLine("a")],
      "k9 — a stop truncates the field-name list at the field carrying it, so every position " +
        "the interior spells ahead of that field is still compared; a stop that disabled the " +
        "comparison for the whole body would silence this cell",
    );
  });
});

// ===========================================================================
// (l) THE CLOSING BRACE THE PRODUCTION SPELLS. `ObjectType ::= "{" Field
// ("," Field)* ","? "}"` (grammar.md:101) spells the closing `}`, so an
// interior that never closes writes no inline object type and carries no
// comparison of its own — code-registry-parse.md:87 states it, and the sibling
// rule of the same `"inline-object-shape"` set keys on the identical fact, its
// own lock pinning the unterminated `{` silent at four document positions
// (tests/inline-empty-object-type.test.ts, cell f5). Both spellings of this
// report's subject text are asserted at five positions each, plus the
// generic-argument spelling, because the claim is about the absent `}` and not
// about one call site.
//
// THE GATE IS THE BRACE THE SOURCE SPELLS, not the one the field loop consumes.
// `{a: integer, a: }` spells its `}` and fires (group (j), j1) even though the
// tolerant parse of its last field's empty type position consumes that brace
// while hunting for a type; a gate keyed on the consumed-brace fact instead
// would silence both of j1's rows.
// GREEN now and after: every row below loads with an empty list, and every one
// of them reds when the gate is removed (measured).
// ===========================================================================

describe("bug 0052 (l) — an interior that never closes is no inline object type", () => {
  it("CONTROL l1: the unterminated spellings stay silent at five positions each", () => {
    // A whole table rather than fifteen cells: the claim is that all fifteen
    // answer alike, and separate assertions would stop at the first divergence.
    // The `array<{a: 1, a: 2` rows are silent on two independent grounds — the
    // missing brace here, and the generic-argument carve-out d3 pins — so they
    // bound this group's claim rather than carrying it.
    const actual: Record<string, string[]> = {};
    const expected: Record<string, string[]> = {};
    for (const type of ["{a: 1, a: 2", "{a: integer, a: string", "array<{a: 1, a: 2"]) {
      const cells: ReadonlyArray<readonly [string, string]> = [
        ["annotation root", annotSrc(type)],
        ["invoke return", invokeSrc(type)],
        ["params quoted", paramsSrc(`  p: "${type}"`)],
        ["schema field", body(`schema S { p: ${type}`)],
        ["alias RHS", body(`schema T = ${type}`)],
      ];
      for (const [label, src] of cells) {
        actual[`${label} :: ${type}`] = lines(src);
        expected[`${label} :: ${type}`] = [];
      }
    }
    expect(
      actual,
      "l1 — `ObjectType` spells its closing `}` (grammar.md:101), so an interior that never " +
        "closes holds no field list for this row to compare, at every position; the row's " +
        "*Message* would otherwise name a repeat inside an inline object type the source does " +
        "not write",
    ).toEqual(expected);
  });
});
