import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type {
  Block,
  FnDecl,
  LetStmt,
  SchemaDecl,
  ThetaDocument,
} from "../src/parser/theta-document";
import {
  parseTypeExpression,
  type TypeCheckSite,
  type TypePosition,
} from "../src/parser/type-grammar";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0095 — `ThetaDocument.parseType` captures a brace-rooted union arm as the
// WHOLE type at every non-alias `Type` position, leaving the `("|" Type)*` tail
// in the token stream for the caller to mis-read
// (docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md).
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:94 — `Type "|" Type` is one alternative of
//     `Type`, and it places no restriction on which alternative its left
//     operand takes; `ObjectType ::= "{" Field ("," Field)* ","? "}"` (:101) is
//     one of them. A brace-rooted union is therefore a `Type`.
//   - docs/spec_topics/grammar.md:105 — the bare-`Type` position enumeration
//     ("`let` annotations, `fn` parameter types, schema field types, `params:`
//     field types, generic type arguments, union arms, and `invoke<Type>` /
//     type-ascription contexts") and its closing sentence: "The grammar is
//     otherwise identical in every position; nullability is written `T | null`."
//   - docs/spec_topics/grammar.md:109 §"Inline object types" — "`ObjectType`
//     admits an anonymous object type `{ field: T, ... }` in **any** `Type`
//     position."
//   - docs/spec_topics/grammar.md:175 — `AliasRhs ::= Type ("|" Type)*`. The
//     alias right-hand side is the same union of the same `Type`, which makes
//     its capture the reference implementation rather than a special case.
//   - docs/spec_topics/grammar.md:77 (`LetStmt`) and :138/:143 (`FnDecl` /
//     `FnParam`) — in both, the type slot is ONE `Type` and what follows it
//     (`= Expr`, `,`, `)`, `FnBody`) is a separate slot of the same production.
//   - docs/spec_topics/type-system.md:15 — "The same type grammar applies in
//     every type-annotation position". Position invariance is the property the
//     four non-alias positions break.
//   - docs/spec_topics/schemas.md:17 — "Optional fields are expressed as
//     `T | null` — there is no `field?: T` shorthand." An optional inline-object
//     field has exactly one spelling, and it is the one under test.
//   - DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md) — the registry
//     is the closed authority for what the runtime emits, and a code's *Trigger*
//     is a spec-level property. No registry edit is needed here: the emissions
//     this file expects are already inside
//     `code-registry-parse.md:86`'s two clauses.
//   - DIAG-4 — the *Message* column is normative, so every expected string
//     below is read out of the registry through `registryMessage`, exactly as
//     `tests/inline-empty-object-type.test.ts:5` (the import), `:126` (the
//     parsed registry) and `:151` (the template fill) do. No message prose is
//     copied.
//
// EXPECTED CONCRETELY (§Expected behaviour): every non-alias `Type` position
// consumes the same `Type ("|" Type)*` extent the alias right-hand side already
// consumes. So `schema S { f: {} | null }` keeps its field and draws the INLINE
// `'{}'` line rather than the DECLARATION `'S'` line; `let x: {} | null = 1`
// binds its initialiser; `fn f(p: {} | null) { 1 }` records ONE parameter; and
// `fn f(): {} | null { 1 }` keeps `{ 1 }` as its body with the rest of the file
// at file level.
//
// RE-DERIVED BASELINE (HEAD 04504288, 0.73.0, offline, deterministic). Every
// fixture of the bug doc's §Reproduction reproduces byte for byte at HEAD, and
// the post-fix column of each table below was measured with the §Fix capture
// widening applied as a temporary probe, so both directions of every assertion
// are known reachable. Two measured facts the bug doc leaves open:
//   - `let x: {} | null = 1` draws the single inline `'{}'` line post-fix and
//     NO `theta/parse/let-rhs-type-mismatch`: the annotation is an object union,
//     whose static compatibility against the integer `1` is not statically
//     resolvable, so that check has no subject (§Non-goals leaves its
//     disposition to itself; this file pins what it measures).
//   - `schema S { f: {} | {} }` draws TWO inline lines post-fix, one per empty
//     arm — the widened capture reaches BOTH arms, and 0045's rule has no dedup
//     (`tests/inline-empty-object-type.test.ts` group (g)).
//
// WHAT IS RED HERE: every cell of groups (1), (2) and (3) whose fixture carries
// a depth-0 `{` at an arm start, plus (5)'s union row and (6)'s twins. Groups
// (4) and (7) are CONTROLS — green now and after, byte-for-byte. A red in (4)
// means the widened capture ate a delimiter it must not (the `fn` body block,
// the comma-missing field recovery, the `=`/`,`/`)` boundaries, or a brace one
// level down inside `<…>`); a red in (7) means the type grammar under the
// capture moved, which no part of this fix touches.
//
// TIER: unit, offline, deterministic, provider-free. Every claim settles inside
// one `parseThetaDocument` call over a string, or one direct
// `parseTypeExpression` call. The observables are a parse-time diagnostic list
// and the parsed statement AST — both fully determined at the parse seam. An
// integration tier would add a session round-trip that can observe neither the
// captured `typeSource` nor the parameter list, and a live tier would make the
// assertion stochastic on top. `parseDoc` (tests/helpers/e2e-s1.ts:39) is the
// shipped load path wrapped in the standard inert `parseDeps` double — the
// harness the bug doc's own §Reproduction used.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. The
// registry lookup asserts its row's presence and its placeholder before the
// template is used, so a missing or reworded row reds by naming the registry
// rather than by a silently-wrong expectation; every fixture asserts its WHOLE
// ordered diagnostic list AND its parsed shape, so an absent emission and a
// silently-corrupted AST both red.

// ===========================================================================
// The diagnostic oracle — the registry's *Message* column (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
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

const EMPTY_BODY = "theta/parse/empty-schema-body";
const UNSUPPORTED = "theta/parse/unsupported-feature";
const NESTED_DISC = "theta/parse/nested-discriminator";
const NON_LITERAL_DISC = "theta/parse/non-literal-discriminator";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";

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
 * `empty-schema-body` for an EMPTY INLINE OBJECT — the subject is the author's
 * own two bytes, because an anonymous type carries no name. This is the second
 * clause of the row's *Trigger* (code-registry-parse.md:86), added by bug 0045.
 */
function inlineLine(): string {
  return line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]]));
}

/** `unsupported-feature` with one of its `<construct>` tails. */
function unsupportedLine(construct: string): string {
  return line(UNSUPPORTED, msg(UNSUPPORTED, [["<construct>", construct]]));
}

/** `nested-discriminator` for one field of one union schema. */
function nestedDiscriminatorLine(field: string, schema: string): string {
  return line(
    NESTED_DISC,
    msg(NESTED_DISC, [
      ["<field>", field],
      ["<X>", schema],
    ]),
  );
}

/**
 * `non-literal-discriminator` for one field of one union schema — the
 * disposition bug 0128 settles for a `by` field that resolves in every
 * variant but is not a single literal, including a brace-rooted union of
 * `ObjectType` arms (bug 0128 §Fix; docs/spec_topics/schemas.md
 * §Discriminated unions).
 */
function nonLiteralDiscriminatorLine(field: string, schema: string): string {
  return line(
    NON_LITERAL_DISC,
    msg(NON_LITERAL_DISC, [
      ["<field>", field],
      ["<X>", schema],
    ]),
  );
}

/**
 * `let-rhs-type-mismatch` — bug 0130's row. Added by that report to render the
 * emission its fix owes at cells 2b and 4i below, which this file's own bug
 * (0095) left silent because its subject was the CAPTURE, not the check.
 */
function mismatchLine(name: string, expected: string, actual: string): string {
  return line(
    LET_RHS,
    msg(LET_RHS, [
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

// ===========================================================================
// Fixtures and observation helpers.
// ===========================================================================

const FM = "---\nmode: prompt\n---\n";
const TAIL = "let a = 1\na\n";

/** A `mode: prompt` theta whose body is `stmt` followed by a tail expression. */
function body(stmt: string): string {
  return `${FM}${stmt}\n${TAIL}`;
}

/** A `mode: prompt` theta whose `params:` block is `block`. */
function paramsSrc(block: string): string {
  return `---\nmode: prompt\nparams:\n${block}\n---\n${TAIL}`;
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): readonly string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** One field of a captured object schema, as name / type-source pair. */
interface FieldShape {
  readonly name: string;
  readonly typeSource: string;
}

/** One parameter of a captured `fn`, as name / type pair. */
interface ParamShape {
  readonly name: string;
  readonly type: string;
}

/**
 * The whole observable of one fixture: the ordered diagnostic list plus the
 * parsed shape. Both halves are mandatory in every cell — two element-3
 * fixtures move an AST WITHOUT moving a diagnostic (`fn f(p: {a: integer} |
 * null) { 1 }` is `[]` before and after while its parameter count goes 3 -> 1),
 * so a diagnostic-only assertion is vacuous for them.
 */
interface Observed {
  readonly diagnostics: readonly string[];
  readonly shape: unknown;
}

/**
 * The object-schema field lists of a document, one entry per `schema`
 * declaration, in source order. `null` covers two distinct shapes: an alias
 * declaration's `fields` is undefined BY DESIGN — it carries `arms` instead,
 * as 5a's `schema X = {} | null` asserts alongside `arms: ["{}", "null"]` —
 * and, on the route §Actual behaviour describes, `parseSchemaObjectBody`
 * discarding a field list it had already built for a declaration that IS
 * field-shaped.
 */
function schemaFields(doc: ThetaDocument): ReadonlyArray<{
  readonly name: string;
  readonly fields: readonly FieldShape[] | null;
  readonly arms: readonly string[] | null;
}> {
  return doc.body.statements
    .filter((s): s is SchemaDecl => s.kind === "schema")
    .map((d) => ({
      name: d.name,
      fields:
        d.fields === undefined
          ? null
          : d.fields.map((f) => ({ name: f.name, typeSource: f.typeSource })),
      arms: d.arms === undefined ? null : [...d.arms],
    }));
}

/** A `schema`-carrying fixture: the diagnostic list plus every declaration's shape. */
function observeSchema(src: string): Observed {
  const doc = parseDoc(src, "bug0095.theta");
  return { diagnostics: diagLines(doc), shape: schemaFields(doc) };
}

/**
 * A `let`-carrying fixture. `annotation` is the captured annotation text,
 * `hasInitialiser` is the presence `checkLetBinding` (src/parser/bindings.ts)
 * reads, and `statementKinds` names every statement the parse produced, `let
 * x` included — the two stray-punct expression statements element 2 mints
 * would appear there too, interposed between the two `let`s.
 */
function observeLet(src: string): Observed {
  const doc = parseDoc(src, "bug0095.theta");
  const lets = doc.body.statements.filter((s): s is LetStmt => s.kind === "let");
  const x = lets.find((s) => s.name === "x");
  return {
    diagnostics: diagLines(doc),
    shape: {
      annotation: x?.annotation ?? null,
      hasInitialiser: x !== undefined && x.init !== null,
      statementKinds: doc.body.statements.map((s) => s.kind),
      docTailPresent: doc.body.tail !== null,
    },
  };
}

/**
 * An `fn`-carrying fixture. `params`, `returnType` and the BODY block's own
 * statement kinds are the three observables element 3 moves, and
 * `docTailPresent` is the fourth: the depth-0 `{` stop ends the return-type
 * capture only at a `{` that follows a COMPLETED arm, so `{ 1 }` in
 * `fn f(): {} | null { 1 }` stays the `FnBody` and the file's own tail
 * survives (cell 3c below) — at HEAD 04504288 the truncated return type left
 * that same `{` at an arm start instead, so it absorbed the rest of the file
 * into the function body and the document's tail was `null`.
 */
function observeFn(src: string): Observed {
  const doc = parseDoc(src, "bug0095.theta");
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  const block = fn?.body as Block | undefined;
  return {
    diagnostics: diagLines(doc),
    shape: {
      params: (fn?.params ?? []).map((p): ParamShape => ({ name: p.name, type: p.type })),
      returnType: fn?.returnType ?? null,
      bodyStatementKinds: (block?.statements ?? []).map((s) => s.kind),
      bodyTailPresent: block !== undefined && block.tail !== null,
      docTailPresent: doc.body.tail !== null,
    },
  };
}

/** The seam's located site. The range is not under assertion; the emission is. */
const SEAM_RANGE: SourceRange = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 1 },
};
const SEAM_SITE: TypeCheckSite = { file: "bug0095.theta", range: SEAM_RANGE };

/** `parseTypeExpression` over one source at one position, rendered as lines. */
function seamLines(source: string, position: TypePosition): readonly string[] {
  return parseTypeExpression(source, position, SEAM_SITE).map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}

// ===========================================================================
// (1) ELEMENT 1 — the schema-field position keeps its field list.
//
// §Expected behaviour: `schema S { f: {} | null }` parses to one field `f` with
// type source `{}|null`, whose own type reaches `parseTypeExpression` at
// `schema-feeding`; the only line is 0045's inline rule against the empty arm,
// rendering `'{}'` — the same single line the alias spelling
// `schema X = {} | null` produces today. No `'S' has no fields` line is emitted:
// the declaration has a field.
//
// RED at HEAD: every cell. Each renders one `'S'` DECLARATION line and carries
// `fields: null`.
// ===========================================================================

describe("bug 0095 (1) — a brace-rooted union arm in a schema field keeps the field list", () => {
  it("RED 1a: `schema S { f: {} | null }` — the optional inline-object field of schemas.md:17", () => {
    // The whole point of the report in one fixture: schemas.md:17 makes
    // `T | null` the ONLY spelling for optionality and grammar.md:109 admits
    // `ObjectType` in any `Type` position, so this is the intersection the
    // author has no alternative to. The `'{}'` subject rather than `'S'` is
    // what places the emission inside code-registry-parse.md:86's inline clause
    // instead of its declaration clauses.
    expect(
      observeSchema(body("schema S { f: {} | null }")),
      "1a — grammar.md:94 makes `{} | null` a `Type`, so the body DOES begin with a plain " +
        "`ident: Type` field and no declaration clause of the empty-schema-body row matches; " +
        "the empty ARM matches its inline clause, and that is the line",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: [{ name: "S", fields: [{ name: "f", typeSource: "{}|null" }], arms: null }],
    });
  });

  it("RED 1b: `schema S { f: {a: integer} | null }` — the emptiness control, loads CLEAN", () => {
    // Emptiness is not the trigger: a non-empty arm is destroyed identically at
    // HEAD. Post-fix there is no empty arm for 0045's rule to name, so the whole
    // list is empty — the fixture §Fix's GOV-15 clause names as "newly loads
    // clean".
    // Since bug 0228's fix an inline object's brace group is a raw slice of
    // the author's own source bytes here too, so the non-empty arm keeps its
    // inter-token spacing.
    expect(
      observeSchema(body("schema S { f: {a: integer} | null }")),
      "1b — an optional inline-object field with a field in it draws nothing at all: the " +
        "declaration has a field and neither arm is empty",
    ).toEqual({
      diagnostics: [],
      shape: [
        { name: "S", fields: [{ name: "f", typeSource: "{a: integer}|null" }], arms: null },
      ],
    });
  });

  it("RED 1c: `schema S { f: null | {} }` — the empty arm SECOND", () => {
    // The `null | {}` route differs by one step at HEAD (the capture ends at
    // `"null|"` on the depth-0 `{` stop rather than at the arm-start early
    // return) and ends the same way, so it is a separate cell: a fix that only
    // widened the LEADING brace would pass 1a and red here.
    expect(
      observeSchema(body("schema S { f: null | {} }")),
      "1c — `atArmStart` is the token straight after a depth-0 `|` as well as the scan's " +
        "first token, so arm order cannot change the captured extent",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: [{ name: "S", fields: [{ name: "f", typeSource: "null|{}" }], arms: null }],
    });
  });

  it("RED 1d: `schema S { f: {} | {} }` — both arms are captured, and both are refused", () => {
    // TWO inline lines, one per arm (measured with the widening applied). The
    // count is the evidence that the capture reached the SECOND arm-start `{`
    // and not merely the first: a widening that consumed one group and stopped
    // would draw one line here and pass 1a.
    expect(
      observeSchema(body("schema S { f: {} | {} }")),
      "1d — 0045's rule has no dedup and the walk descends every arm, so a two-empty-arm " +
        "field is two occurrences; one line here would mean the second arm was never captured",
    ).toEqual({
      diagnostics: [inlineLine(), inlineLine()],
      shape: [{ name: "S", fields: [{ name: "f", typeSource: "{}|{}" }], arms: null }],
    });
  });

  it("RED 1e: `schema S { a: string, f: {} | null }` — the PRECEDING field survives", () => {
    // §Why it matters 2: the declaration reports the same line today while
    // destroying a field the arm has nothing to do with. `a` is captured before
    // the arm is even read, so its presence is what proves the recovery path is
    // no longer entered.
    expect(
      observeSchema(body("schema S { a: string, f: {} | null }")),
      "1e — `parseSchemaObjectBody` must not reach the discard-the-whole-list arm, so a field " +
        "captured BEFORE the union survives",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: [
        {
          name: "S",
          fields: [
            { name: "a", typeSource: "string" },
            { name: "f", typeSource: "{}|null" },
          ],
          arms: null,
        },
      ],
    });
  });

  it("RED 1f: `schema S { f: {} | null, g: string }` — the FOLLOWING field survives", () => {
    // The other direction: the capture must stop at the depth-0 `,` after a
    // COMPLETED arm, so the next field is read as a field. A capture that
    // over-consumed would swallow `g: string` into `f`'s type source.
    expect(
      observeSchema(body("schema S { f: {} | null, g: string }")),
      "1f — `,` still ends a field type at depth 0 after a completed arm, so the field written " +
        "after the union is captured as its own field",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: [
        {
          name: "S",
          fields: [
            { name: "f", typeSource: "{}|null" },
            { name: "g", typeSource: "string" },
          ],
          arms: null,
        },
      ],
    });
  });

  it("RED 1g: `schema S { f: {  } | null }` — a whitespace interior is the same empty arm", () => {
    // Whitespace is not a token, so this is the same input to 0045's rule as 1a
    // and the captured type source is the same bytes.
    // Since bug 0228's fix the brace group is a raw slice of the author's own
    // source bytes, so the whitespace interior survives the capture (the
    // group's INTERIOR, after `trim()`, is still empty, so 0045's rule fires
    // identically to 1a — only the captured `typeSource` bytes move).
    expect(
      observeSchema(body("schema S { f: {  } | null }")),
      "1g — the tokeniser discards whitespace before the interior is read, so an interior of " +
        "whitespace alone is the empty inline object of 1a and captures identically",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: [{ name: "S", fields: [{ name: "f", typeSource: "{  }|null" }], arms: null }],
    });
  });

  it("RED 1h: `schema S { a: {a: integer} | array<integer> }` — the spelling `union-generic-arm-lowering` i3 pins", () => {
    // The same source `tests/union-generic-arm-lowering.test.ts` cell i3
    // records as unusable at this position. Post-fix it loads, which is what
    // turns that cell into the four-position parity assertion its own comment
    // says it could not be.
    // Since bug 0228's fix the brace-group arm keeps the author's own spacing.
    expect(
      observeSchema(body("schema S { a: {a: integer} | array<integer> }")),
      "1h — a brace-group arm beside a generic arm is ordinary grammar (grammar.md:94, :99); " +
        "neither arm is empty, so the declaration loads clean",
    ).toEqual({
      diagnostics: [],
      shape: [
        {
          name: "S",
          fields: [{ name: "a", typeSource: "{a: integer}|array<integer>" }],
          arms: null,
        },
      ],
    });
  });

  it("RED 1i: the loss is not scoped to one declaration's own recovery", () => {
    // §Reproduction's two-declaration fixture. At HEAD the following
    // declaration is unaffected (the recovery IS scoped), and the claim
    // post-fix is that BOTH declarations carry their fields and the list is
    // empty — so this cell moves the first declaration only.
    // Since bug 0228's fix `S`'s brace-group arm keeps the author's own
    // spacing.
    expect(
      observeSchema(`${FM}schema S { f: {a: integer} | null }\nschema T { g: string }\n${TAIL}`),
      "1i — recovery scoping is already correct; what moves is that `S` keeps its field, so " +
        "the two-declaration file loads clean",
    ).toEqual({
      diagnostics: [],
      shape: [
        { name: "S", fields: [{ name: "f", typeSource: "{a: integer}|null" }], arms: null },
        { name: "T", fields: [{ name: "g", typeSource: "string" }], arms: null },
      ],
    });
  });
});

// ===========================================================================
// (2) ELEMENT 2 — the `let` annotation keeps its initialiser.
//
// §Expected behaviour: `let x: {} | null = 1` records annotation `{}|null` with
// its initialiser bound, and emits neither `let-without-initialiser` nor a
// stray-punct line.
//
// RED at HEAD: 2a and 2b. Each records `x` with a truncated annotation and NO
// initialiser, and the residue `| null = 1` re-enters statement position as two
// stray puncts.
// ===========================================================================

describe("bug 0095 (2) — a brace-rooted union annotation keeps the `=` initialiser", () => {
  it("RED 2a: `let x: {} | null = 1` binds its initialiser and draws one inline line", () => {
    // MEASURED, not assumed: with the widening applied this fixture draws the
    // single inline `'{}'` line and NOTHING else, and the expected list is
    // UNCHANGED by bug 0130. Not for the reason once stated here — that report
    // does not sustain a resolvability reading of the ANNOTATION (the
    // *Trigger*'s clause governs the RHS type, and the RHS here is the integer
    // literal `1`, which IS statically resolvable). The empty arm `{}` is
    // R2's own decision instead: an empty interior does not convert to TYPE-8's
    // `object` arm, so it stays the deferring pseudo-`named` and
    // `let-rhs-type-mismatch` still has no subject here — bug 0045's inline
    // line is the only one this annotation ever draws, and bug 0129's open
    // question (a second line for one written mistake) is left untouched.
    expect(
      observeLet(body("let x: {} | null = 1")),
      "2a — `code-registry-parse.md:53` triggers `let-without-initialiser` on `let x: T` with " +
        "NO initialiser; this source spells `= 1`, so neither that line nor the two severed " +
        "puncts may appear, and the annotation is the whole `Type` grammar.md:77 gives the slot",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: {
        annotation: "{}|null",
        hasInitialiser: true,
        statementKinds: ["let", "let"],
        docTailPresent: true,
      },
    });
  });

  it("RED 2b: `let x: {a: integer} | null = 1` refuses under bug 0130's row (flipped)", () => {
    // PRE-0130: this cell asserted `diagnostics: []` — the emptiness control at
    // this position was read as also controlling the mismatch row. Bug 0130
    // §Expected behaviour settles that the *Trigger*'s resolvability clause
    // governs the RHS type (the integer literal `1`, TYPE-3), not the
    // annotation, so `1 ⊑ {a: integer} | null` is a decidable `false`
    // (TYPE-5 + TYPE-8) and the row fires. 0095's own subject stands: the
    // annotation and initialiser are both still recovered whole, which is what
    // makes the row have a subject to fire on at all.
    expect(
      observeLet(body("let x: {a: integer} | null = 1")),
      "2b — the recovered statement now reaches bug 0130's check, which decides `1 \u22ee " +
        "{a: integer} | null` statically and refuses it",
    // Since bug 0228's fix the brace-group arm keeps the author's own spacing
    // in the captured `annotation`; the RENDERED `<expected>` above already
    // went through `displayType`'s own spacing convention and is unmoved.
    ).toEqual({
      diagnostics: [mismatchLine("x", "{ a: integer } | null", "integer")],
      shape: {
        annotation: "{a: integer}|null",
        hasInitialiser: true,
        statementKinds: ["let", "let"],
        docTailPresent: true,
      },
    });
  });

  it("CONTROL 2c: `let x: integer | null = 1` is byte-unchanged", () => {
    // A union with no brace arm never entered the defective route, so it pins
    // that the widening did not perturb the ordinary `=` boundary.
    expect(
      observeLet(body("let x: integer | null = 1")),
      "2c — the `=` stop at a COMPLETED-arm boundary is untouched by this fix",
    ).toEqual({
      diagnostics: [],
      shape: {
        annotation: "integer|null",
        hasInitialiser: true,
        statementKinds: ["let", "let"],
        docTailPresent: true,
      },
    });
  });
});

// ===========================================================================
// (3) ELEMENT 3 — the `fn` signature.
//
// §Expected behaviour: `fn f(p: {} | null) { 1 }` records ONE parameter `p`
// with type `{}|null`; `fn f(): {} | null { 1 }` records return type `{}|null`
// and the body block `{ 1 }` as the body, with the file's remaining statements
// at file level.
//
// RED at HEAD: 3a–3d, plus 3f/3g below. 3a/3b mint two phantom parameters
// named `|` and `null`; 3c/3d truncate the return type, take the body block
// as a bare object literal and absorb the rest of the file, leaving
// `doc.body.tail` null; 3f is the same return-slot mover with a NON-brace
// leading arm (GOV-15, alongside 3b); 3g is 3d's arm-order twin, the union's
// brace arm written SECOND with a body block one token further on.
// ===========================================================================

describe("bug 0095 (3) — a brace-rooted union in an `fn` signature", () => {
  it("RED 3a: `fn f(p: {} | null) { 1 }` records ONE parameter", () => {
    // grammar.md:143 makes each `FnParam` an `Ident ":" Type` pair and admits no
    // parameter named `|`. The parameter LIST is the whole observable — no
    // diagnostic moves here at all, which is why the shape half is mandatory.
    expect(
      observeFn(body("fn f(p: {} | null) { 1 }")),
      "3a — grammar.md:138/:143: the type slot is one `Type` and `)` is a separate slot of the " +
        "same production, so `{} | null` is `p`'s whole type and the signature has arity 1",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: {
        params: [{ name: "p", type: "{}|null" }],
        returnType: null,
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("RED 3b: `fn f(p: {a: integer} | null) { 1 }` — the AST moves with NO diagnostic either side", () => {
    // §Why it matters 3 and the GOV-15 clause §Fix must disposition: this
    // fixture loads with ZERO diagnostics today, carrying three parameters, and
    // with zero after, carrying one. A diagnostic-only assertion is vacuous
    // here, so the parameter list is the entire witness.
    // Since bug 0228's fix the brace-group parameter type keeps the author's
    // own spacing.
    expect(
      observeFn(body("fn f(p: {a: integer} | null) { 1 }")),
      "3b — arity is read by argument binding (invocation.md §\"Argument arity\"), so a theta " +
        "that loads cleanly carries the corrupted signature into the callable set; no spec text " +
        "defines a parameter named `|`",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [{ name: "p", type: "{a: integer}|null" }],
        returnType: null,
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("RED 3c: `fn f(): {} | null { 1 }` keeps `{ 1 }` as the body and the file's tail", () => {
    // The return position takes `ReturnType` (grammar.md:89) — `Type` plus
    // `void` — so a brace-rooted union is admitted, and `FnBody` (:138) is the
    // separate slot after it. `docTailPresent` is the sharpest half: at HEAD the
    // rest of the file is absorbed into the function body and the document has
    // no tail expression, which is a different program.
    expect(
      observeFn(body("fn f(): {} | null { 1 }")),
      "3c — the body block is a `{` at a COMPLETED-arm boundary, so the depth-0 `{` stop still " +
        "ends the return-type capture there; `bare-object-literal` (code-registry-parse.md:47) " +
        "triggers on expression position, and a `FnBody` is not one",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: {
        params: [],
        returnType: "{}|null",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("RED 3d: `fn f(): {a: integer} | null { 1 }` loads clean with the whole return type", () => {
    // §Fix's other named GOV-15 arrival: two diagnostics today, none after.
    // Since bug 0228's fix the brace-group return-union arm keeps the
    // author's own spacing.
    expect(
      observeFn(body("fn f(): {a: integer} | null { 1 }")),
      "3d — a non-empty brace arm in a return union leaves nothing for any rule to name, so the " +
        "whole observable is the recovered declaration and the file's own tail",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [],
        returnType: "{a: integer}|null",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("CONTROL 3e: `fn f(): integer | null { 1 }` is byte-unchanged", () => {
    expect(
      observeFn(body("fn f(): integer | null { 1 }")),
      "3e — a union with no brace arm never entered the defective route; it pins that the " +
        "return-type slot's ordinary boundary did not move",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [],
        returnType: "integer|null",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("RED 3f: `fn f(): integer | { 1 }` — the SECOND loads-cleanly mover, at the return slot", () => {
    // §Fix's GOV-15 paragraph dispositions the parameter-arity family (3b) by
    // name; this fixture is the return-slot member of the same class.
    // grammar.md:94 requires a `Type` after a depth-0 `|` and :109 admits
    // `ObjectType` there, so the `{` straight after `|` is an arm start under
    // the same rule 3d's `{a: integer}` satisfies — the balanced group is
    // consumed whole as the arm regardless of what is inside it, so `{ 1 }`
    // joins the return type rather than staying available as the `FnBody` the
    // signature still requires. With no `{` left to open a body block, the
    // file's own missing-body recovery (§Non-goals: "the tolerant recoveries
    // themselves… stay as written") takes the rest of the file as the
    // function's own body. The pre-fix capture `integer|` was not a `Type`
    // either, so no conformant disposition is displaced. Carve-out evidence:
    // no committed `.theta` / `.thetalib` spells a `{` straight after a `|`
    // (`rg '\|\s*\{' --glob '*.theta' --glob '*.thetalib'` over the tree —
    // no match), matching the corpus oracle's byte-identical dispositions
    // across all 35 files (`.pi/tmp/fixes/0095-corpus-baseline.txt`).
    // Since bug 0228's fix the absorbed `{ 1 }` body-turned-arm is a raw
    // slice of the author's own source bytes, so its interior spacing
    // survives too.
    expect(
      observeFn(body("fn f(): integer | { 1 }")),
      "3f — a loads-cleanly source can move its RETURN type's arm count and the document's own " +
        "tail together, with zero diagnostics on either side of the fix",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [],
        returnType: "integer|{ 1 }",
        bodyStatementKinds: ["let"],
        bodyTailPresent: true,
        docTailPresent: false,
      },
    });
  });

  it("RED 3g: `fn f(): integer | {a: integer} { 1 }` — the reversed-arm return union keeps its body block", () => {
    // The sharpest two-`{` competition at the return slot: an arm-start `{`
    // (`{a: integer}`, straight after the depth-0 `|`) immediately followed,
    // one token later, by the body's own `{` at a COMPLETED-arm boundary.
    // This closes the arm-order gap at the return slot the way 1c closes it
    // at the schema-field slot in this file, and `tests/inline-empty-object-
    // type.test.ts`'s c1b closes it at the same field slot for the walk: an
    // arm start is the token straight after a depth-0 `|` regardless of which
    // side of the union the brace-rooted arm sits on, so the SECOND `{` here
    // is not at an arm start and still ends the capture at the same
    // COMPLETED-arm boundary 3c/3d/4a/4b pin, and stays the `FnBody`.
    // Since bug 0228's fix the brace-group return-union arm keeps the
    // author's own spacing.
    expect(
      observeFn(body("fn f(): integer | {a: integer} { 1 }")),
      "3g — a non-empty brace arm SECOND in a return union leaves nothing for any rule to name, " +
        "and the body block still stays the body",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [],
        returnType: "integer|{a: integer}",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });
});

// ===========================================================================
// (4) THE MUST-NOT-MOVE CONTROLS — §Fix's "What must not move" list, one cell
// per named fixture. GREEN now and after, byte-for-byte.
//
// The `fn` body block is the one place where the widened rule and an existing
// construct compete for the same token, so it is asserted in BOTH directions:
// a `{` after a COMPLETED arm must still end the capture at the depth-0 stop
// (4a, 4b), while a `{` at an ARM START must be consumed (3c, 3d above).
// ===========================================================================

describe("bug 0095 (4) — the delimiters the widened capture must not eat", () => {
  it("CONTROL 4a: `fn f(): {a: integer} { 1 }` keeps its body block", () => {
    // The competing-token case, non-empty. The return type is a completed arm
    // and the `{` that follows is the `FnBody`; a widening that consumed a
    // post-arm `{` would swallow the body here and red.
    // Since bug 0228's fix the completed brace-group return type keeps the
    // author's own spacing.
    expect(
      observeFn(body("fn f(): {a: integer} { 1 }")),
      "4a — `atArmStart` is false after a completed arm, so the depth-0 `{` stop " +
        "(the rule that keeps a return type from swallowing its body) still applies",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [],
        returnType: "{a: integer}",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("CONTROL 4b: `fn f(): {} { 1 }` keeps its body block and its single `'{}'` line", () => {
    // The same competition with an EMPTY brace group, where the early return
    // and a correct capture coincide today: the line and the shape must both be
    // byte-identical after the early return is deleted.
    expect(
      observeFn(body("fn f(): {} { 1 }")),
      "4b — a leading `{` that is the WHOLE type captures identically either way; deleting the " +
        "early return must not change this fixture's line or its body",
    ).toEqual({
      diagnostics: [inlineLine()],
      shape: {
        params: [],
        returnType: "{}",
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("CONTROL 4c: `schema S { f: {} g: string }` keeps the comma-missing recovery", () => {
    // §Fix: `stopAtFieldBoundary`'s value-ish rule must still fire after a
    // brace-rooted arm. Both fields, the comma diagnostic and the `'{}'` line,
    // in emission order.
    expect(
      observeSchema(body("schema S { f: {} g: string }")),
      "4c — the value-ish field boundary is what lets a comma-missing body recover both fields; " +
        "widening the arm-start `{` must leave it firing",
    ).toEqual({
      diagnostics: [inlineLine(), unsupportedLine("schema fields must be comma-separated")],
      shape: [
        {
          name: "S",
          fields: [
            { name: "f", typeSource: "{}" },
            { name: "g", typeSource: "string" },
          ],
          arms: null,
        },
      ],
    });
  });

  it("CONTROL 4d: `schema S { f: {a: integer}, g: string }` keeps the `,` delimiter", () => {
    // Since bug 0228's fix the brace-group field type keeps the author's own
    // spacing.
    expect(
      observeSchema(body("schema S { f: {a: integer}, g: string }")),
      "4d — a brace-rooted field type with no `|` after it captures correctly today because the " +
        "early return and a full capture coincide; the widened rule must land on the same bytes",
    ).toEqual({
      diagnostics: [],
      shape: [
        {
          name: "S",
          fields: [
            { name: "f", typeSource: "{a: integer}" },
            { name: "g", typeSource: "string" },
          ],
          arms: null,
        },
      ],
    });
  });

  it("CONTROL 4e: `schema S { f: {a: integer} }` and `schema S { f: {} }` keep the `}` delimiter", () => {
    // The two single-field spellings, as one table so a moved cell names its own
    // source. `schema S { f: {} }` is `tests/inline-empty-object-type.test.ts`
    // cell a3's fixture, pinned here at its own position too.
    expect(
      {
        nonEmpty: observeSchema(body("schema S { f: {a: integer} }")),
        empty: observeSchema(body("schema S { f: {} }")),
      },
      "4e — `}` still ends a field type at depth 0, and the declaration is not field-less in " +
        "either spelling, so the empty one keeps the INLINE subject",
    // Since bug 0228's fix the non-empty group keeps the author's own
    // spacing; the empty group has no interior to move.
    ).toEqual({
      nonEmpty: {
        diagnostics: [],
        shape: [
          { name: "S", fields: [{ name: "f", typeSource: "{a: integer}" }], arms: null },
        ],
      },
      empty: {
        diagnostics: [inlineLine()],
        shape: [{ name: "S", fields: [{ name: "f", typeSource: "{}" }], arms: null }],
      },
    });
  });

  it("CONTROL 4f: `schema S { f: string | null }` — a union with no brace arm", () => {
    expect(
      observeSchema(body("schema S { f: string | null }")),
      "4f — the ordinary optional field, which never entered the defective route; its bytes " +
        "bound the claim that only a depth-0 `{` at an arm start moves",
    ).toEqual({
      diagnostics: [],
      shape: [{ name: "S", fields: [{ name: "f", typeSource: "string|null" }], arms: null }],
    });
  });

  it("CONTROL 4g: a brace group at depth > 0 inside `array<…>` is byte-unchanged", () => {
    // Both nesting directions in one table: the empty group inside `<…>` beside
    // a union outside it, and a whole union inside it. A brace at depth > 0
    // never reaches the ARM-START test (`parseType`'s `depth === 0` branch), so
    // this cell's own claim — no arm-start reordering one level down — is
    // unmoved; since bug 0228's fix a depth>0 `{` is instead routed through the
    // shared balanced-group consumer (`stopAtAngleClose`), which raw-slices a
    // NON-EMPTY interior. `outerUnion`'s group is empty (no interior to move);
    // `innerUnion`'s is not, so its `typeSource` keeps the author's own
    // spacing.
    expect(
      {
        outerUnion: observeSchema(body("schema S { f: array<{}> | null }")),
        innerUnion: observeSchema(body("schema S { f: array<{a: integer} | null> }")),
      },
      "4g — the arm-start branch is guarded on `depth === 0`, so a brace inside `<…>` is " +
        "untouched; these fixtures already capture their union intact",
    ).toEqual({
      outerUnion: {
        diagnostics: [inlineLine()],
        shape: [
          { name: "S", fields: [{ name: "f", typeSource: "array<{}>|null" }], arms: null },
        ],
      },
      innerUnion: {
        diagnostics: [],
        shape: [
          {
            name: "S",
            fields: [{ name: "f", typeSource: "array<{a: integer}|null>" }],
            arms: null,
          },
        ],
      },
    });
  });

  it("CONTROL 4h: `fn f(p: {a: integer}, q: string) { 1 }` keeps the `,` and `)` delimiters", () => {
    // The parameter-slot half of the delimiter claim: a brace-rooted parameter
    // type followed by `,` and then `)`, both at COMPLETED-arm boundaries.
    // Since bug 0228's fix the brace-group parameter type keeps the author's
    // own spacing.
    expect(
      observeFn(body("fn f(p: {a: integer}, q: string) { 1 }")),
      "4h — `,` and `)` still end a parameter type at depth 0 after a completed arm, so a " +
        "brace-rooted parameter does not swallow the parameter after it or the closing paren",
    ).toEqual({
      diagnostics: [],
      shape: {
        params: [
          { name: "p", type: "{a: integer}" },
          { name: "q", type: "string" },
        ],
        returnType: null,
        bodyStatementKinds: [],
        bodyTailPresent: true,
        docTailPresent: true,
      },
    });
  });

  it("CONTROL 4i: `let x: {a: integer} = 1` keeps the `=` delimiter", () => {
    // The `let` half: a brace-rooted annotation with no `|` after it. The early
    // return and a full capture coincide here today, so this is the fixture that
    // proves deleting it did not eat the initialiser. The SHAPE assertions stay
    // byte-identical; only the diagnostics list gains bug 0130's row, for the
    // same reason cell 2b's does — `1 \u22ee {a: integer}` is a decidable `false`
    // (TYPE-8), not the deferred pseudo-`named` this file's own bug left it as.
    // Since bug 0228's fix the brace-group annotation keeps the author's own
    // spacing in the captured `annotation`.
    expect(
      observeLet(body("let x: {a: integer} = 1")),
      "4i — `=` still ends a `let` annotation at the completed-arm boundary, so the initialiser " +
        "arm of `parseLet` is still entered for a brace-rooted annotation",
    ).toEqual({
      diagnostics: [mismatchLine("x", "{ a: integer }", "integer")],
      shape: {
        annotation: "{a: integer}",
        hasInitialiser: true,
        statementKinds: ["let", "let"],
        docTailPresent: true,
      },
    });
  });
});

// ===========================================================================
// (5) THE THREE CONFORMANT CAPTURE SITES — byte-unchanged.
//
// §Fix: the alias right-hand side's `arms` are byte-identical for all three
// spellings, because the branch is REUSED rather than rewritten (so 0042's
// `malformed-alias-rhs` boundary set is not perturbed); the `@<T>` root and the
// `params:` fields run different capture code entirely.
//
// GREEN now and after. A red here means the fix rewrote the alias branch
// instead of widening its guard.
// ===========================================================================

/**
 * The schema text of the `QueryExpr` bound to `let r = …`, or `null` when `r`
 * is absent or its initialiser is not a query. This is the same capture 5a
 * reads off `arms` and 1a off `typeSource` — the `@<T>` annotation's own
 * bytes, verbatim.
 */
function queryLetSchema(doc: ThetaDocument): string | null {
  const lets = doc.body.statements.filter((s): s is LetStmt => s.kind === "let");
  const r = lets.find((s) => s.name === "r");
  const init = r?.init;
  return init !== null && init !== undefined && init.kind === "query" ? init.schema : null;
}

describe("bug 0095 (5) — the capture sites that are already correct do not move", () => {
  it("CONTROL 5a: the alias right-hand side's `arms` are byte-identical for all three spellings", () => {
    // One table rather than three cells: the claim is that all three answer as
    // they do today, and separate assertions would stop at the first divergence.
    expect(
      {
        emptyFirst: observeSchema(body("schema X = {} | null")),
        emptySecond: observeSchema(body("schema X = null | {}")),
        nonEmpty: observeSchema(body("schema X = {a: integer} | null")),
      },
      "5a — grammar.md:175's `AliasRhs ::= Type (\"|\" Type)*` is the reference capture this fix " +
        "generalises; reusing its branch is what keeps 0042's boundary set intact",
    ).toEqual({
      emptyFirst: {
        diagnostics: [inlineLine()],
        shape: [{ name: "X", fields: null, arms: ["{}", "null"] }],
      },
      emptySecond: {
        diagnostics: [inlineLine()],
        shape: [{ name: "X", fields: null, arms: ["null", "{}"] }],
      },
      // Since bug 0228's fix the alias's own brace-group arm is ALSO a raw
      // slice now (it shares the same `consumeInlineObjectType`), so this
      // reference capture (grammar.md:175) keeps the author's own spacing
      // too, agreeing byte-for-byte with the widened positions it generalises
      // to.
      nonEmpty: {
        diagnostics: [],
        shape: [{ name: "X", fields: null, arms: ["{a: integer}", "null"] }],
      },
    });
  });

  it("CONTROL 5b: the `@<T>` annotation root is byte-unchanged", () => {
    // Different capture code (the annotation's `<…>` extent), so the claim is
    // that this fix did not reach it. The captured TEXT is pinned alongside
    // the diagnostic, exactly as 5a pins `arms`: a truncation that stopped at
    // the union's first arm would still draw the SAME single line for the
    // empty fixture and the SAME empty list for the non-empty one, so the
    // diagnostic alone cannot red on it.
    const emptyDoc = parseDoc(body("let r = @<{} | null>`hi`"), "bug0095.theta");
    const nonEmptyDoc = parseDoc(body("let r = @<{a: integer} | null>`hi`"), "bug0095.theta");
    expect(
      {
        empty: { diagnostics: diagLines(emptyDoc), querySchema: queryLetSchema(emptyDoc) },
        nonEmpty: {
          diagnostics: diagLines(nonEmptyDoc),
          querySchema: queryLetSchema(nonEmptyDoc),
        },
      },
      "5b — the `@<T>` root already captures the whole union and reports exactly the empty arm; " +
        "this fix touches `parseType` only, and the captured bytes are the proof rather than the " +
        "diagnostic alone",
    // Since bug 0228's fix the `@<T>` root's brace-group arm keeps the
    // author's own spacing.
    ).toEqual({
      empty: { diagnostics: [inlineLine()], querySchema: "{}|null" },
      nonEmpty: { diagnostics: [], querySchema: "{a: integer}|null" },
    });
  });

  it("CONTROL 5c: the `params:` field types are byte-unchanged", () => {
    // A `params:` field type is read out of YAML (frontmatter.ts's
    // `splitParamValue`), not out of the token stream, so it never reached
    // `parseType`'s early return. The non-empty fixture's recorded `type` is
    // pinned alongside its diagnostics, exactly as 5a pins `arms` and 5b pins
    // `querySchema`: a truncation that stopped at the union's first arm would
    // still draw `[]` here, so the diagnostic alone cannot red on it. The
    // empty fixture has no equivalent text to pin: `empty-schema-body` is an
    // `error`, and `parseFrontmatter`'s own registration gate
    // (`!diagnostics.some((d) => d.severity === "error")`) trips on it, so
    // `doc.frontmatter` — and every field type it would carry — is `null`.
    // That nullness is asserted directly rather than left implicit.
    const emptyDoc = parseDoc(paramsSrc('  p: "{} | null"'), "bug0095.theta");
    const nonEmptyDoc = parseDoc(paramsSrc('  p: "{a: integer} | null"'), "bug0095.theta");
    expect(
      {
        empty: { diagnostics: diagLines(emptyDoc), frontmatter: emptyDoc.frontmatter },
        nonEmpty: {
          diagnostics: diagLines(nonEmptyDoc),
          type: nonEmptyDoc.frontmatter?.params?.fields[0]?.type,
        },
      },
      "5c — a `params:` field type is read out of YAML, not out of the token stream, so it never " +
        "reached `parseType`'s early return; the non-empty fixture's recorded `type` is the " +
        "proof, and the empty fixture's own `error` severity is what nulls `doc.frontmatter`",
    ).toEqual({
      empty: { diagnostics: [inlineLine()], frontmatter: null },
      nonEmpty: { diagnostics: [], type: "{a: integer} | null" },
    });
  });
});

// ===========================================================================
// (6) THE INHERITED 0096 §Fix WITNESS ITEM 4.
//
// 0096 (docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md)
// assigned this cell to "whichever of the two changes carries 0095's widened
// capture", because that capture is what makes the input reachable through
// `parseDoc` at all. 0096's own witness
// (tests/discriminator-field-classifier-brace-group.test.ts item 3) pins the
// before-bytes: `Cat`'s field list is discarded and `empty-schema-body` names
// `Cat`, so `buildUnionVariantSchemas` declines the union before any field is
// classified.
//
// Post-fix the field IS captured and IS classified — and 0096's structural
// brace predicate answers `{}` (not `{ nested: true }`) for
// `{a:integer}|{b:string}`, so the load is CLEAN. Both absences matter: no
// `theta/parse/nested-discriminator` (which the pre-0096 naive prefix/suffix
// test would have produced, naming a nesting the source does not contain) and
// no `theta/parse/empty-schema-body`.
//
// RED at HEAD: 6a. GREEN: 6b, its parity control.
// ===========================================================================

/** `Cat`/`Dog`/`Animal by kind` with `Cat`'s discriminator field spelled `catKind`. */
function animalSrc(catKind: string): string {
  return (
    `${FM}schema Cat { kind: ${catKind}, name: string }\n` +
    'schema Dog { kind: "dog", name: string }\n' +
    `schema Animal by kind = Cat | Dog\n${TAIL}`
  );
}

describe("bug 0095 (6) — 0096's witness item 4: a brace-group discriminator union reaches the discriminator checker", () => {
  it("6a: `Cat { kind: {a: integer} | {b: string}, … }` under `by kind` draws `non-literal-discriminator`, not `empty-schema-body`", () => {
    // The whole-list equality is what pins two things at once: the
    // `empty-schema-body` line this fix removes (the field list survives
    // capture, so `Cat` is not empty), and the DISPOSITION bug 0128 settles
    // for the field the capture then exposes — `{a:integer}|{b:string}`
    // resolves in every variant but is not a single literal, so 0096's
    // structural predicate classifies it `{}` (not nested) and bug 0128's gate
    // refuses it under `theta/parse/non-literal-discriminator`.
    // Since bug 0228's fix each brace-group arm keeps the author's own
    // spacing.
    expect(
      observeSchema(animalSrc("{a: integer} | {b: string}")),
      "6a — `{a:integer}|{b:string}` is not a single enclosing brace group, so 0096's " +
        "structural predicate declines to classify it nested; the discriminator IS at the top " +
        "level of `Cat`, so the field-less refusal has no subject, but the field resolves in " +
        "every variant and is not a single literal, so bug 0128's gate refuses it",
    ).toEqual({
      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
      shape: [
        {
          name: "Cat",
          fields: [
            { name: "kind", typeSource: "{a: integer}|{b: string}" },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        {
          name: "Dog",
          fields: [
            { name: "kind", typeSource: '"dog"' },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        { name: "Animal", fields: null, arms: ["Cat", "Dog"] },
      ],
    });
  });

  it("CONTROL 6b: the same declaration with `kind: \"a\" | \"b\"` draws the same `non-literal-discriminator`", () => {
    // The parity control: a literal union in the same slot already reaches the
    // classifier today and carries no brace group at all, so it fixes what 6a's
    // target disposition is rather than leaving it inferred. Bug 0128 settled
    // that disposition as a refusal, not the clean load this cell pinned
    // before that report was decided — 6a and 6b now agree on the same code.
    expect(
      observeSchema(animalSrc('"a" | "b"')),
      "6b — a discriminator field whose type is a literal union carries no brace group at all, " +
        "so it is the position's already-correct neighbour, and bug 0128 refuses it the same way " +
        "6a's exposed field is refused",
    ).toEqual({
      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
      shape: [
        {
          name: "Cat",
          fields: [
            { name: "kind", typeSource: '"a"|"b"' },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        {
          name: "Dog",
          fields: [
            { name: "kind", typeSource: '"dog"' },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        { name: "Animal", fields: null, arms: ["Cat", "Dog"] },
      ],
    });
  });

  it("CONTROL 6c: a genuinely nested discriminator still draws `nested-discriminator`", () => {
    // The bound on 6a: the code 0096's predicate still selects for a SINGLE
    // enclosing brace group. Without this cell, 6a's clean load could be
    // satisfied by a classifier that never reports nesting at all.
    // Since bug 0228's fix the single enclosing brace group keeps the
    // author's own spacing.
    expect(
      observeSchema(animalSrc('{ type: "x" }')),
      "6c — `{ type: \"x\" }` IS a single enclosing brace group, so the discriminator is not at " +
        "the top level of `Cat` and code-registry-parse.md:98's row applies",
    ).toEqual({
      diagnostics: [nestedDiscriminatorLine("kind", "Animal")],
      shape: [
        {
          name: "Cat",
          fields: [
            { name: "kind", typeSource: '{ type: "x" }' },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        {
          name: "Dog",
          fields: [
            { name: "kind", typeSource: '"dog"' },
            { name: "name", typeSource: "string" },
          ],
          arms: null,
        },
        { name: "Animal", fields: null, arms: ["Cat", "Dog"] },
      ],
    });
  });
});

// ===========================================================================
// (7) THE TYPE GRAMMAR UNDER THE CAPTURE — the control that it was never
// implicated. `parseTypeExpression` over five sources at all three
// `TypePosition` values: fifteen cells, identical across positions.
//
// GREEN now and after. §Non-goals: `parseTypeExpression`, `walkType` and every
// lowerer are correct for this text already, so a red here means the fix was
// made below the parse seam instead of at the capture.
// ===========================================================================

/** The seam table: each source paired with the number of inline lines it draws. */
const SEAM_SOURCES: ReadonlyArray<readonly [source: string, lineCount: number]> = [
  ["{} | null", 1],
  ["null | {}", 1],
  ["{a: integer} | null", 0],
  ["{}", 1],
  ["string | null", 0],
];

describe("bug 0095 (7) — the type grammar parses a brace-rooted union at every `TypePosition`", () => {
  for (const position of ["value", "return", "schema-feeding"] as const) {
    it(`CONTROL 7-${position}: \`parseTypeExpression\` answers alike at position \`${position}\``, () => {
      // A whole-column comparison rather than a per-source loop: the claim is
      // that all five answer alike at this position, and a loop of separate
      // assertions stops at the first divergence and hides the rest.
      const actual: Record<string, readonly string[]> = {};
      const expected: Record<string, readonly string[]> = {};
      for (const [source, lineCount] of SEAM_SOURCES) {
        actual[source] = seamLines(source, position);
        expected[source] = Array.from({ length: lineCount }, () => inlineLine());
      }
      expect(
        actual,
        `7-${position} — the union is parsed and its arms are walked; only the empty arm is ` +
          "refused, at every position. No part of the reported behaviour originates here, so " +
          "these bytes bound the fix to the document-level text capture above them",
      ).toEqual(expected);
    });
  }
});
