import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import { codes, parseDoc } from "./helpers/e2e-s1";

// Bug 0033 — the `schema X = A | B` type-alias / union declaration does not
// parse: `parseSchema` consumes only `schema` + the name, registers a field-less
// `SchemaDecl` for the head, and leaves the whole shape in the token stream, so
// the statement loop re-lexes it as source text
// (docs/bugs/0033-body-level-schema-alias-unsupported.md).
//
// THIS FILE IS THE END-TO-END SIBLING SET the bug doc's §Fix requires:
// "The seven tests in tests/disc-unions-recursion.test.ts keep their seam-level
// assertions and gain `parseThetaDocument`-level siblings, so the registry rows
// are covered end-to-end rather than at the seam alone." That file is left
// untouched; every fixture here is a SOURCE string driven through the shipped
// `parseThetaDocument`.
//
// SPEC ANCHORS (the contract, not the current code):
//   - docs/spec_topics/grammar.md:170–177 — `SchemaShape` has THREE
//     alternatives: the object form, `"=" AliasRhs`, and
//     `"by" Ident "=" UnionRhs`, with `AliasRhs ::= Type ("|" Type)*` and
//     `UnionRhs ::= Type ("|" Type)+`. None is marked deferred. `:179` prescribes
//     `theta/parse/by-on-object-schema` for `schema X by f { ... }`.
//   - docs/spec_topics/schemas.md:50–60 — §Type-alias / union schema: "The `=`
//     form is a top-level type alias. It composes with every shape from the type
//     grammar", with the three worked examples at `:55–57` (string-literal
//     union, primitive union, discriminated object union) that fixtures
//     SEVERITY / STRORNUM / ANIMAL below reproduce verbatim.
//   - :95–117 — §Discriminated unions: implicit detection (present in every
//     variant / single string literal / unique value), the explicit
//     `schema Animal by species = Cat | Dog | Lizard` form (`:110`), the five
//     rejection codes, and the `by`-on-object-body rule (`:113`).
//   - :143 — §Recursion: a pure-alias cycle is `theta/parse/type-alias-cycle`
//     "with the cycle path printed (`type-alias cycle: X → Y → X`)".
//   - docs/spec_topics/schema-subset.md:12 — discriminated unions are in the
//     supported subset, `schema X = A | B | C` named as the surface syntax;
//     `:81` SUBS-1 (a union of primitives only lowers to `{ "type": [...] }`);
//     `:82` (a discriminated object union lowers to
//     `{ "anyOf": [<A-lowered>, <B-lowered>] }`); `:85` *Array element order*
//     ("`anyOf` lists variants in source order").
//   - docs/spec_topics/type-system.md:38 TYPE-4 (variant-to-union: every variant
//     of `schema U = A | B` satisfies `A ⊑ U`) and `:54` TYPE-11 (alias-schema
//     transparency: a `schema X = R` name is replaced by `R` on either side of
//     `⊑`). Both rules have no reachable subject until the declaration parses.
//   - docs/spec_topics/diagnostics/code-registry-parse.md — the rows this file
//     drives end-to-end: `by-on-object-schema` (:56), `ambiguous-discriminator`
//     (:94), `missing-discriminator` (:95), `duplicate-discriminator-value`
//     (:96), `nested-discriminator` (:97), `non-string-discriminator` (:98),
//     `type-alias-cycle` (:99); plus `unsupported-feature` (:27, the
//     MISATTRIBUTED code today), `immutable-rebinding` (:28, the other
//     misattribution), `empty-schema-body` (:86) and `unresolved-named-type`
//     (:89). The bug doc cites `:55` / `:88` / `:93–98`; the rows have shifted
//     one line since filing — same rows, same *Message* columns.
//   - DIAG-2 (diagnostics/diagnostic-shape.md) — the registry is the closed
//     authority for what the implementation emits, so a spec-defined declaration
//     form must not be reported through `unsupported-feature`, whose trigger
//     reads "A theta 1.0-deferred or non-Theta syntactic construct".
//     DIAG-4 — the *Message* column is normative: every expected string below is
//     read out of the registry through `registryMessage`, never copied prose.
//   - GOV-15 loads-cleanly predicate
//     (governance/source-language-stability.md:9) — every fixture that fails
//     today on `stray '='` / `stray '|'` carries an `E`-severity diagnostic and
//     is therefore OUTSIDE GOV-15's input set, so making it load is not a
//     stability break. The two inputs whose observable sequence goes from clean
//     to rejecting — `schema X by f { ... }` and the body-less head — are covered
//     by the GOV-15 diagnostic-registry carve-out (`:25`) as a trigger change
//     "in-scope as an addition for inputs newly brought into the code's
//     emission set".
//
// PROBED CURRENT SIGNATURES (HEAD b1caedf8 / 0.44.0, offline, deterministic).
// Byte-identical to the bug doc's §Reproduction (recorded at 0.32.0) with ONE
// DRIFT, called out where it lands (group (b) cell b1):
//   ANIMAL       stray '=' + stray '|'; stmts [schema,schema,schema,expr,expr,let]
//   SEVERITY     stray '=' + 2× stray '|'
//   NAME         stray '=' alone
//   STRORNUM     stray '=' + stray '|'
//   BY-KIND      stray '|' alone; the `by kind = Cat` head parses as a reassign
//   BY-KIND+let  immutable-rebinding 'kind' + stray '|'
//   BY-OBJ       *** DRIFT *** unresolved-named-type 'f' (bug 0025's landed
//                constructor gate rejects the `f { a: string }` residue's
//                re-parse). The bug doc recorded `diags: []` at 0.32.0. Either
//                way `by-on-object-schema` does not fire.
//   CYCLE        2× stray '='
//   NONSTR/DUP/NESTED   stray '|' alone
//   AMBIG/MISSING       stray '=' + stray '|'
//   HEADLESS     [] — SILENT, field-less decl
//   QUOTED-BODY  [] — SILENT, field-less decl (the brace group is consumed)
//   EMPTY-BODY   empty-schema-body (control, already firing)
//   TYPEPOS/OBJFORM     [] (controls)
//   CTOR-ALIAS   stray '=' + stray '|' + unresolved-named-type 'Animal'
//   GHOST        stray '=' + unknown-identifier 'Missing'
//   LET-ALIAS    stray '=' + let-rhs-type-mismatch (expected Name, got integer)
//   LET-VARIANT  stray '=' + stray '|' + let-rhs-type-mismatch (expected
//                Animal, got Cat) — the mismatch TYPE-4 forbids
//   PARAMS/@<T>  stray tokens; `$defs.<Alias>` lowers to the permissive `{}`
//   THETALIB     stray tokens PLUS 2× thetalib-top-level-statement
//
// WHAT IS RED HERE AND WHY. Groups (a)–(d) and the alias rows of (f) red on the
// stray-token / misattribution signatures — every assertion renders the whole
// diagnostic list into its failure text, so the red names the residue rather
// than an anonymous length mismatch. Group (e) reds on SILENCE (an empty
// diagnostic list where `empty-schema-body` is prescribed). The controls —
// type-position unions, the object form, `schema X { }`, and the `by`-on-union
// legality of the seam — are GREEN today and must stay green.
//
// TWO ORCHESTRATOR DISPOSITIONS, decided inside the §Fix's own delegation
// ("Replacing the `null` fallthrough removes the mechanism that makes them
// silent, so the fix decides what they are. No separate report is filed for
// them."), are pinned in group (e): both `schema X` and `schema X { "a": string }`
// are `theta/parse/empty-schema-body`. The choice is registry-honest — it adds
// no code and rewords no *Message*: the registered message
// `'<X>' has no fields; an empty schema cannot be validated.` is already true of
// both declarations, and only the row's *Trigger* prose widens (a same-commit
// doc edit the implementer owns, covered by the GOV-15 carve-out cited above).
// `theta/parse/unsupported-feature` is deliberately NOT the disposition: DIAG-2's
// trigger for it names non-Theta constructs, and `schema X` is not one.
//
// TIER: unit, offline, deterministic, provider-free. The whole contract settles
// inside one `parseThetaDocument` call over a string, plus real AJV compiles of
// the `params:` documents those calls produce. An integration tier would add a
// session round-trip to a parse-time observable and could not assert the
// ABSENCE of a diagnostic or the byte shape of a `$defs` entry at all; a live
// tier would additionally make the assertion stochastic. `parseDoc`
// (tests/helpers/e2e-s1.ts) is the shipped load path wrapped in the standard
// inert `parseDeps` double — the same harness the bug doc's §Reproduction used.
//
// NO SILENT SKIPPING: nothing here early-returns or conditionally skips. Every
// fixture that must load asserts an empty diagnostic list first; every lowering
// read THROWS with the diagnostics rendered when an intermediate is absent, so a
// refused parse can never be mistaken for a pass. The `.thetalib` spelling is
// driven through the real path (`parseThetaDocument` keys the `.thetalib`
// top-level-form check off the byte-exact lowercase extension,
// theta-document.ts:803), so no skip is needed for it either.

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

const BY_ON_OBJECT = "theta/parse/by-on-object-schema";
const NON_STRING = "theta/parse/non-string-discriminator";
const AMBIGUOUS = "theta/parse/ambiguous-discriminator";
const MISSING = "theta/parse/missing-discriminator";
const DUPLICATE_VALUE = "theta/parse/duplicate-discriminator-value";
const NESTED = "theta/parse/nested-discriminator";
const ALIAS_CYCLE = "theta/parse/type-alias-cycle";
const EMPTY_BODY = "theta/parse/empty-schema-body";
const UNRESOLVED = "theta/parse/unresolved-named-type";
const LET_MISMATCH = "theta/parse/let-rhs-type-mismatch";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
/** Bug 0042 §Fix — a `schema X = …` right-hand side that is not an `AliasRhs`. */
const MALFORMED_ALIAS_RHS = "theta/parse/malformed-alias-rhs";

/** The three codes the unparsed shape is misattributed to today. */
const RESIDUE_CODES = [
  "theta/parse/unsupported-feature",
  "theta/parse/immutable-rebinding",
  "theta/parse/thetalib-top-level-statement",
] as const;

/**
 * The registry row's normative *Message* template with the named placeholders
 * filled (DIAG-4). Definedness and placeholder presence are asserted first, so a
 * missing row or a reworded template reds by naming the registry rather than by
 * a silently-wrong expectation. Only the named placeholders are substituted:
 * `missing-discriminator` and `ambiguous-discriminator` carry a LITERAL
 * `'by <field>'` in their remedy prose that the implementation renders verbatim.
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

/** One rendered diagnostic line, in the shape `diagLines` produces. */
function line(code: string, message: string): string {
  return `error ${code}: ${message}`;
}

// ===========================================================================
// Fixtures. Every one is the whole body after the frontmatter fence, exactly as
// the bug doc's §Reproduction quotes them.
// ===========================================================================

/** The frontmatter prelude every `.theta` fixture carries. */
const FM = "---\nmode: prompt\n---\n";

/** Two object-form variants sharing a string-literal `kind` field. */
const CAT_DOG =
  'schema Cat { kind: "cat", name: string }\nschema Dog { kind: "dog", name: string }\n';

// (a) The two shapes that must parse.
const F_ANIMAL = `${CAT_DOG}schema Animal = Cat | Dog\nlet a = 1\na\n`;
const F_ANIMAL_REVERSED = `${CAT_DOG}schema Animal = Dog | Cat\nlet a = 1\na\n`;
const F_SEVERITY = 'schema Severity = "low" | "medium" | "high"\nlet a = 1\na\n';
const F_NAME = "schema Name = string\nlet a = 1\na\n";
const F_STRORNUM = "schema StringOrNumber = string | number\nlet a = 1\na\n";
const F_BY_KIND = `${CAT_DOG}schema Animal by kind = Cat | Dog\nlet a = 1\na\n`;
const F_BY_KIND_WITH_LET = `${CAT_DOG}let kind = "x"\nschema Animal by kind = Cat | Dog\nkind\n`;
/** The `.thetalib` spelling — permitted top-level forms only, no frontmatter. */
const F_THETALIB = `${CAT_DOG}schema Animal = Cat | Dog\n`;

// (b) One fixture per registry row, driven through the parse.
const F_BY_OBJ = "schema X by f { a: string }\nlet a = 1\na\n";
const F_NONSTR =
  "schema Cat { kind: 1, name: string }\nschema Dog { kind: 2, name: string }\n" +
  "schema Animal by kind = Cat | Dog\nlet a = 1\na\n";
const F_AMBIG =
  'schema Cat { kind: "cat", species: "feline" }\nschema Dog { kind: "dog", species: "canine" }\n' +
  "schema Animal = Cat | Dog\nlet a = 1\na\n";
const F_MISSING =
  "schema Cat { name: string }\nschema Dog { age: integer }\n" +
  "schema Animal = Cat | Dog\nlet a = 1\na\n";
const F_DUP =
  'schema Cat { kind: "same", name: string }\nschema Dog { kind: "same", name: string }\n' +
  "schema Animal by kind = Cat | Dog\nlet a = 1\na\n";
const F_NESTED =
  'schema Cat { kind: { type: "x" }, name: string }\nschema Dog { kind: { type: "y" }, name: string }\n' +
  "schema Animal by kind = Cat | Dog\nlet a = 1\na\n";
const F_CYCLE = "schema X = Y\nschema Y = X\nlet a = 1\na\n";

// (d) The type layer.
const F_LET_ALIAS_MISMATCH = "schema Name = string\nlet n: Name = 1\nn\n";
const F_LET_VARIANT_UNION =
  `${CAT_DOG}schema Animal = Cat | Dog\n` +
  'let a: Animal = Cat { kind: "cat", name: "n" }\na\n';

// (e) The two dispositions plus the standing control.
const F_HEADLESS = "schema X\nlet a = 1\na\n";
const F_QUOTED_BODY = 'schema X { "a": string }\nlet a = 1\na\n';
const F_EMPTY_BODY = "schema X { }\nlet a = 1\na\n";

// (f) Interactions and controls.
const F_CTOR_ALIAS =
  `${CAT_DOG}schema Animal = Cat | Dog\n` +
  'let a = Animal { kind: "cat", name: "n" }\na\n';
const F_GHOST = "schema Ghost = Missing\nlet a = 1\na\n";
const F_ANNOT_ALIAS = `${CAT_DOG}schema Animal = Cat | Dog\nlet r = @<Animal>\`pick one\`\nr\n`;
const F_TYPEPOS_UNION = 'schema S { a: string | null, b: "x" | "y" }\nlet a = 1\na\n';
const F_OBJFORM = 'schema Cat { kind: "cat", name: string }\nlet a = 1\na\n';

// (g) REVIEW ROUND 1 — the right-hand side ends where the DECLARATION ends.
// `>` and `=` are trailing newline-continuation triggers (lexer.ts
// `trailingTriggers`; grammar.md §"Statement termination & newline
// continuation"), so a right-hand side ending in either carries no `stmt-sep`
// to stop the capture and the NEXT statement's tokens sit directly ahead of the
// cursor. Each fixture below is an arrangement in which that happens.
const F_GENERIC_THEN_LET = "schema IntList = array<integer>\nlet a = 1\na\n";
const F_LET_THEN_GENERIC = "let a = 1\nschema IntList = array<integer>\na\n";
const F_UNION_GENERIC_THEN_LET = `${CAT_DOG}schema X = Cat | array<string>\nlet a = 1\na\n`;
const F_EMPTY_RHS_THEN_LET = "schema X =\nlet a = 1\na\n";

// (h) A literal-UNION field type is not a single literal (schemas.md
// §Discriminated unions, detection rule 2).
const F_LITERAL_UNION_TAGS =
  'schema Cat { kind: "a" | "b", name: string }\nschema Dog { kind: "c" | "d", name: string }\n' +
  "schema Animal = Cat | Dog\nlet a = 1\na\n";
const F_LITERAL_UNION_TAGS_SHARED =
  'schema Cat { kind: "a" | "b", name: string }\nschema Dog { kind: "a" | "b", name: string }\n' +
  "schema Animal = Cat | Dog\nlet a = 1\na\n";

// (i) An explicit `by` names the THETA-SIDE field (schemas.md §Wire-name
// renaming), whose wire name here is the distinct spelling `"Kind"`.
const F_BY_THETA_NAME =
  'schema Cat { kind as "Kind": 1, name: string }\nschema Dog { kind as "Kind": 2, name: string }\n' +
  "schema Animal by kind = Cat | Dog\nlet a = 1\na\n";
const F_BY_WIRE_NAME =
  'schema Cat { kind as "Kind": 1, name: string }\nschema Dog { kind as "Kind": 2, name: string }\n' +
  "schema Animal by Kind = Cat | Dog\nlet a = 1\na\n";

// (j) An inline `ObjectType` is a `Type` in any `Type` position (grammar.md
// §"Inline object types"), so it is a legal arm at either end of a union.
const F_BRACE_ARM_FIRST = `${CAT_DOG}schema X = { a: string } | Cat\nlet a = 1\na\n`;
const F_BRACE_ARM_SECOND = `${CAT_DOG}schema X = Cat | { a: string }\nlet a = 1\na\n`;

// (k) `UnionRhs ::= Type ("|" Type)+` (grammar.md §"schema X by <field>") — a
// `by` clause needs two arms under it.
const F_BY_SINGLE_ARM = `${CAT_DOG}schema X by f = Cat\nlet a = 1\na\n`;
const F_BY_TWO_ARMS = `${CAT_DOG}schema X by kind = Cat | Dog\nlet a = 1\na\n`;

// (l) REVIEW ROUND 2, F1 — the PUNCT-headed following statement. `@`, a
// template backtick, `(` and `[` each open a statement form
// (`EXPRESSION_LEAD_PUNCT`) and none can begin or continue a `Type`
// (grammar.md §"Type grammar" has no parenthesised or bracket-headed Type, and
// neither `@` nor a backtick occurs in it), so each is the punct twin of
// group (g)'s keyword arrangement: the trailing `>` swallows the boundary
// newline and the next statement sits directly ahead of the cursor.
const F_GENERIC_THEN_QUERY = "schema X = array<integer>\n@`ask something`\n";
const F_GENERIC_THEN_TYPED_QUERY = "schema X = array<integer>\n@<X>`ask`\n";
const F_GENERIC_THEN_PAREN = "schema X = array<integer>\n( 1 + 2 )\n";
const F_GENERIC_THEN_ARRAY_LIT = "schema X = array<integer>\n[1, 2]\n";
/** The ARM-START twin of g4: `=` is itself a trailing trigger. */
const F_EMPTY_RHS_THEN_QUERY = "schema X =\n@`ask`\n";
/** The `[` that must NOT stop the capture: it follows the bare `enum` keyword. */
const F_INLINE_ENUM_ARM = 'schema E = enum["a", "b"]\nlet a = 1\na\n';

// (m) REVIEW ROUND 2, F2 — one alias fixture per rescued row, each paired with
// the object-field CONTROL over the same type source. An arm is a `Type`
// position (`AliasRhs ::= Type ("|" Type)*`) reached from a `schema`
// declaration, so it is schema-feeding exactly as a field type is, and the two
// positions must answer to the same checks.
const F_ALIAS_INLINE_ENUM = 'schema X = enum["a", "b"]\nlet a = 1\na\n';
const F_FIELD_INLINE_ENUM = 'schema X { f: enum["a", "b"] }\nlet a = 1\na\n';
const F_ALIAS_ARITY = "schema X = array<integer, string>\nlet a = 1\na\n";
const F_FIELD_ARITY = "schema X { f: array<integer, string> }\nlet a = 1\na\n";
const F_ALIAS_VOID = "schema X = void\nlet a = 1\na\n";
const F_FIELD_VOID = "schema X { f: void }\nlet a = 1\na\n";
const F_ALIAS_VOID_UNION = "schema X = void | string\nlet a = 1\na\n";
const F_FIELD_VOID_UNION = "schema X { f: void | string }\nlet a = 1\na\n";
const F_ALIAS_RESULT = "schema X = Result<string, string>\nlet a = 1\na\n";
const F_FIELD_RESULT = "schema X { f: Result<string, string> }\nlet a = 1\na\n";
const F_ALIAS_EMPTY_OBJECT = "schema X = {}\nlet a = 1\na\n";
const F_FIELD_EMPTY_OBJECT = "schema X { f: {} }\nlet a = 1\na\n";
/** Both illegalities on one arm, and the two single-code neighbours. */
const F_ALIAS_GHOST_APPLIED = "schema X = Ghost<1,2>\nlet a = 1\na\n";
const F_FIELD_GHOST_APPLIED = "schema X { f: Ghost<1,2> }\nlet a = 1\na\n";
const F_ALIAS_GHOST_ELEMENT = "schema X = array<Ghost>\nlet a = 1\na\n";
const F_ALIAS_GHOST_TWICE = "schema X = Ghost | Ghost\nlet a = 1\na\n";

// (n) REVIEW ROUND 2, F3 — same-line residue whose text resolves. `Cat Cat` is
// two value-ish tokens with no `|` between them, so the field-boundary stop
// ends the arm at the first and the second re-enters the statement loop.
const F_RESIDUE_RESOLVABLE = "schema Cat { a: string }\nschema X = Cat Cat\nlet a = 1\na\n";
const F_BARE_DECLARED_NAME = "schema Cat { a: string }\nCat\nlet a = 1\na\n";
const F_RESIDUE_UNRESOLVABLE = "schema X = Ghost Ghost\nlet a = 1\na\n";

// (o) REVIEW ROUND 3, F1 — an alias CYCLE with a use that reaches the type
// layer. Each fixture pairs the cycle with the one thing that makes
// `collectTypeEnv`'s entry get UNFOLDED: a typed `let` (the `⊑` engine), or a
// member access on a cycle-typed `fn` parameter (`classifyReceiver`).
const F_CYCLE_TYPED_LET = "schema X = Y\nschema Y = X\nlet a: X = 1\na\n";
const F_CYCLE_UNION_ARM_TYPED_LET = "schema X = Y | string\nschema Y = X\nlet a: X = 1\na\n";
const F_CYCLE_SELF_TYPED_LET = "schema X = X\nlet a: X = 1\na\n";
const F_CYCLE_MEMBER_ACCESS =
  "schema X = Y\nschema Y = X\nfn f(p: X): string { p.g }\nlet a = 1\na\n";
/** The acyclic control over the same shape: an alias param, a field access. */
const F_ALIAS_MEMBER_ACCESS =
  "schema Y { g: string }\nschema X = Y\nfn f(p: X): string { p.g }\nlet a = 1\na\n";
/** The cycle behind an UNRELATED leading alias, for the diagnostic's range. */
const F_CYCLE_AFTER_UNRELATED_ALIAS =
  'schema A = "x" | "y"\nschema X = Y\nschema Y = X\nlet a = 1\na\n';

// (p) REVIEW ROUND 3, F2 — the stop-set siblings. `!` is the unary-not head at
// a COMPLETED arm; `match` / `invoke` / `Ok` / `Err` are the expression-
// statement keyword heads at an ARM START, behind the trailing `=` the lexer
// continues over.
const F_GENERIC_THEN_BANG = "schema X = array<integer>\n!true\n";
const F_EMPTY_RHS_THEN_INVOKE = 'schema X =\ninvoke<string>("child.theta")\n';
const F_EMPTY_RHS_THEN_MATCH = "schema X =\nmatch 1 { 1 => 2 }\n";
const F_EMPTY_RHS_THEN_OK = "schema X =\nOk(1)\n";
const F_EMPTY_RHS_THEN_ERR = "schema X =\nErr(1)\n";
/** The literal-type keywords that must STAY capturable as arms. */
const F_LITERAL_KEYWORD_ARMS = "schema X = true | null\nlet a = 1\na\n";

// (q) REVIEW ROUND 3, F3 — a `by` clause over a two-arm PRIMITIVE union: two
// arms, no object variant, so no discriminator concept applies to it at all.
const F_BY_PRIMITIVE_UNION = "schema X by f = string | integer\nlet a = 1\na\n";

// (r) REVIEW ROUND 3, the reviewer's dangling-`|` observation.
const F_DANGLING_PIPE = "schema Cat { a: string }\nschema X = Cat |\nlet a = 1\na\n";
const F_FIELD_DANGLING_PIPE = "schema S { a: string | }\nlet a = 1\na\n";

// (t) REVIEW ROUND 4, F1 — the recursion the language ADMITS, under the same
// cycle guard. `X` is reached only THROUGH an `array<…>` element, so the
// structural pass' bare-identifier edge set (`identifierShapedReferences`,
// theta-document.ts) sees no alias-to-alias reference and raises no
// `type-alias-cycle`: the declaration is legal, and schemas.md:143 forbids the
// PURE-alias cycle alone. The type layer's own edge set does descend into
// `array<T>`, so the guard still counts `X` as a cycle participant — which is
// exactly why the guard's disposition has to be omission (answer `unknown`)
// rather than nominalisation (answer `incompatible`).
const F_RECURSIVE_UNION_TYPED_LET = "schema X = integer | array<X>\nlet v: X = 3\nv\n";
const F_RECURSIVE_ARRAY_TYPED_LET = "schema X = array<X>\nlet a: X = []\na\n";

// (u) REVIEW ROUND 4, F2 — `-` at the two arm boundaries. After a COMPLETED
// arm it heads the unary-negation expression statement on the line whose
// boundary newline the trailing `>` swallowed; at an ARM START it is captured.
const F_GENERIC_THEN_NEG = "let a = 1\nschema X = array<integer>\n-a\n";
const F_NEG_LITERAL_ARMS = "schema X = -1 | null\nlet a = 1\na\n";
const F_NEG_LITERAL_SINGLE = "schema X = -1\nlet a = 1\na\n";
/** The object-field position over the same `-1` type source, for parity. */
const F_FIELD_NEG_LITERAL = "schema S { a: -1 }\nlet a = 1\na\n";

/** A `mode: prompt` theta whose single `params:` entry is `field`. */
function paramsSrc(field: string, body: string): string {
  return `---\nmode: prompt\nparams:\n  ${field}\n---\n${body}@\`use \${a}\`\n`;
}

const P_ANIMAL = paramsSrc("a: Animal", `${CAT_DOG}schema Animal = Cat | Dog\n`);
const P_ANIMAL_REVERSED = paramsSrc("a: Animal", `${CAT_DOG}schema Animal = Dog | Cat\n`);
const P_STRORNUM = paramsSrc("a: StringOrNumber", "schema StringOrNumber = string | number\n");
const P_SEVERITY = paramsSrc(
  "a: Severity",
  'schema Severity = "low" | "medium" | "high"\n',
);
/** The generic-tailed alias, with a following `let` on the swallowed newline. */
const P_INTLIST = paramsSrc("a: IntList", "schema IntList = array<integer>\nlet b = 1\n");
/** The self-referential array alias in a `params:` position (round 4, F1). */
const P_RECURSIVE_ARRAY = paramsSrc("a: X", "schema X = array<X>\nlet b = 1\n");
const P_BRACE_ARM_FIRST = paramsSrc("a: X", `${CAT_DOG}schema X = { a: string } | Cat\n`);
const P_BRACE_ARM_SECOND = paramsSrc("a: X", `${CAT_DOG}schema X = Cat | { a: string }\n`);

// ===========================================================================
// Parse + assertion helpers. Loud on every unexpected disposition.
// ===========================================================================

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0033.theta");
}

/** Parse a `.thetalib` body: the top-level-form check keys off the extension. */
function parseLib(body: string): ThetaDocument {
  return parseDoc(body, "bug0033.thetalib");
}

/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * The top-level statement sequence as `kind` or `kind:name`. The trailing tail
 * expression is not a statement, so it does not appear. This is the observable
 * that separates "the shape was consumed by the declaration" from "the shape was
 * re-lexed as statements": today the residue shows up here as `expr` / `reassign`.
 */
function stmtSig(doc: ThetaDocument): string[] {
  return doc.body.statements.map((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    const kind = String(record["kind"]);
    const name = record["name"];
    return typeof name === "string" ? `${kind}:${name}` : kind;
  });
}

/**
 * The bug's core claim, asserted before any expected-diagnostic assertion so the
 * red names the residue: none of the three codes the unparsed shape is
 * misattributed to survives, and no statement of the declaration's shape leaks
 * into the statement list.
 */
function expectNoResidue(doc: ThetaDocument, why: string): void {
  const present = codes(doc.diagnostics);
  for (const code of RESIDUE_CODES) {
    expect(
      present,
      `${why} — bug 0033 §Expected: "no stray '=' / stray '|' diagnostic is produced for a ` +
        `well-formed declaration". ${code} is a MISATTRIBUTION: the declaration shape was left ` +
        `in the token stream and re-lexed as statements. actual diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(code);
  }
  const sig = stmtSig(doc);
  for (const residue of ["expr", "reassign"]) {
    expect(
      sig,
      `${why} — the shape's tokens must be consumed by the declaration, not re-parsed as ` +
        `statements (grammar.md:170–177). statements=${JSON.stringify(sig)}; ` +
        `diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(residue);
  }
}

/**
 * A fixture that must LOAD: no diagnostic at all, and no residue statement. The
 * residue check runs first so a red quotes the stray tokens.
 */
function expectLoadsClean(doc: ThetaDocument, why: string): void {
  expectNoResidue(doc, why);
  expect(
    diagLines(doc),
    `${why} — the form is normative theta 1.0 (grammar.md:170–177, schemas.md:50–60), so it must ` +
      `load with NO diagnostics`,
  ).toEqual([]);
}

/**
 * A fixture whose whole diagnostic list must be exactly one rendered line. Used
 * for the seven registry rows: the code must fire AND the residue must be gone,
 * which an exact list equality states in one assertion.
 */
function expectExactly(doc: ThetaDocument, expected: string, why: string): void {
  expectNoResidue(doc, why);
  expect(
    diagLines(doc),
    `${why} — expected exactly one diagnostic; actual=${JSON.stringify(diagLines(doc))}`,
  ).toEqual([expected]);
}

/** The named `schema` declaration node, or a loud failure naming the parse. */
function schemaDecl(
  doc: ThetaDocument,
  name: string,
  label: string,
): Record<string, unknown> {
  const decl = doc.body.statements.find((stmt) => {
    const record = stmt as unknown as Record<string, unknown>;
    return record["kind"] === "schema" && record["name"] === name;
  });
  if (decl === undefined) {
    throw new Error(
      `${label}: no \`schema ${name}\` declaration in the statement list ` +
        `${JSON.stringify(stmtSig(doc))}; diagnostics=${JSON.stringify(diagLines(doc))}`,
    );
  }
  return decl as unknown as Record<string, unknown>;
}

/** The 1-based source line a named declaration starts on, or a loud failure. */
function declLine(doc: ThetaDocument, name: string, label: string): number {
  const range = schemaDecl(doc, name, label)["range"] as
    | { start?: { line?: number } }
    | undefined;
  const startLine = range?.start?.line;
  if (typeof startLine !== "number") {
    throw new Error(
      `${label}: \`schema ${name}\` carries no source range to anchor a diagnostic against`,
    );
  }
  return startLine;
}

/**
 * The alias/union arm sources the named declaration captured, or a loud
 * failure. This is the fix's own observable for "where did the right-hand-side
 * capture stop": a capture that ran past the declaration shows up here as a
 * joined arm (`array<integer>leta`), and one that ran short shows up as a
 * missing arm.
 */
function armsOf(doc: ThetaDocument, name: string, label: string): readonly string[] {
  const arms = schemaDecl(doc, name, label)["arms"];
  if (!Array.isArray(arms)) {
    throw new Error(
      `${label}: \`schema ${name}\` carries no alias/union arm list, so the right-hand side ` +
        `was not captured as a declaration at all; diagnostics=${JSON.stringify(diagLines(doc))}`,
    );
  }
  return arms as readonly string[];
}

/**
 * A rescued type-source row (review round 2, F2): the alias fixture's WHOLE
 * diagnostic list must equal `expected` AND must be byte-equal to the
 * object-field control's list over the same type source. The control is
 * asserted first, so a red separates "the alias position diverged" from "the
 * shared check moved underneath both positions". Every expected line is built
 * from the registry's *Message* column (DIAG-4), never copied prose.
 */
function expectArmMatchesFieldControl(
  label: string,
  aliasSource: string,
  fieldSource: string,
  expected: readonly string[],
): void {
  const fieldDoc = parse(fieldSource);
  expect(
    diagLines(fieldDoc),
    `${label} — the object-field CONTROL over the same type source; a red here means the shared ` +
      `check moved for BOTH positions, not that the alias arm diverged`,
  ).toEqual([...expected]);
  const aliasDoc = parse(aliasSource);
  expectNoResidue(aliasDoc, label);
  expect(
    diagLines(aliasDoc),
    `${label} — an alias arm is a \`Type\` position reached from a \`schema\` declaration, so it ` +
      `answers to exactly what the object form's field-type position answers to; ` +
      `field-control=${JSON.stringify(diagLines(fieldDoc))}`,
  ).toEqual([...expected]);
}

/** A real `AjvSchemaValidator` plus the diagnostics it emitted (V8c seam). */
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

/** A parsed, cleanly-lowered `params:` document. */
interface LoadedParams {
  readonly loweredSchema: LoweredSchema;
  readonly properties: Record<string, unknown>;
  readonly defs: Record<string, unknown>;
}

/**
 * Parse a `params:` fixture that must load, and read its lowered document back.
 * Every absent intermediate THROWS with the diagnostics rendered — a refused
 * parse must never read as a pass.
 */
function loadParams(label: string, source: string): LoadedParams {
  const doc = parseDoc(source, "bug0033.theta");
  expectLoadsClean(doc, `${label}: the aliased name is a declared top-level schema`);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no ` +
        `AJV-validatable document. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const properties = lowered["properties"];
  if (properties === null || typeof properties !== "object") {
    throw new Error(
      `${label}: the lowered params document carries no \`properties\` object: ${JSON.stringify(lowered)}`,
    );
  }
  return {
    loweredSchema: lowered,
    properties: properties as Record<string, unknown>,
    defs: (lowered["$defs"] ?? {}) as Record<string, unknown>,
  };
}

/** The `$defs` entry the alias name must lower to, or a loud failure. */
function aliasDef(loaded: LoadedParams, name: string, label: string): Record<string, unknown> {
  expect(
    loaded.properties["a"],
    `${label}: schema-subset.md:76 — a named schema reference emits {"$ref":"#/$defs/<Name>"}`,
  ).toEqual({ $ref: `#/$defs/${name}` });
  const def = loaded.defs[name];
  expect(
    def,
    `${label}: the alias must be hoisted as a \`$defs\` entry (schema-subset.md step 1); ` +
      `$defs keys=${JSON.stringify(Object.keys(loaded.defs))}`,
  ).toBeDefined();
  expect(
    def,
    `${label}: bug 0033 §Fix ("Lowering") — an alias name becomes CONCRETELY lowerable, so ` +
      `\`collectBodyTypes\`'s permissive \`{}\` arm (theta-document.ts:1108–1112) must no longer ` +
      `claim it; lowered=${JSON.stringify(def)}`,
  ).not.toEqual({});
  return def as Record<string, unknown>;
}

/**
 * Resolve one `anyOf` arm: a `$ref`-shaped arm is followed into `$defs` (and its
 * target asserted present, or AJV could not resolve the document), an inline arm
 * is returned as written. The §Fix names `<A-lowered>` without fixing which of
 * the two spellings a NAMED arm takes, so the order assertion is made against
 * the resolved shapes.
 */
function resolveArm(arm: unknown, defs: Record<string, unknown>, label: string): unknown {
  if (arm !== null && typeof arm === "object" && !Array.isArray(arm)) {
    const ref = (arm as Record<string, unknown>)["$ref"];
    if (typeof ref === "string") {
      expect(
        ref,
        `${label}: a \`$ref\` arm must be the root-absolute \`#/$defs/<Name>\` pointer form ` +
          `(schema-subset.md:76)`,
      ).toMatch(/^#\/\$defs\//);
      const key = ref.slice("#/$defs/".length);
      const target = defs[key];
      expect(
        target,
        `${label}: the arm refs '${key}', which must exist at the document root or AJV cannot ` +
          `resolve the document; $defs keys=${JSON.stringify(Object.keys(defs))}`,
      ).toBeDefined();
      return target;
    }
  }
  return arm;
}

/** The lowered Object emission of `schema Cat { kind: "cat", name: string }`. */
const CAT_FRAGMENT = {
  type: "object",
  properties: { kind: { const: "cat" }, name: { type: "string" } },
  required: ["kind", "name"],
  additionalProperties: false,
};

/** The lowered Object emission of `schema Dog { kind: "dog", name: string }`. */
const DOG_FRAGMENT = {
  type: "object",
  properties: { kind: { const: "dog" }, name: { type: "string" } },
  required: ["kind", "name"],
  additionalProperties: false,
};

/**
 * Assert an alias `$defs` entry is an `anyOf` whose arms, resolved through
 * `$defs`, are exactly `expectedArms` IN THAT ORDER (schema-subset.md:82 + the
 * *Array element order* clause at `:85`).
 */
function expectAnyOfInOrder(
  def: Record<string, unknown>,
  expectedArms: readonly unknown[],
  defs: Record<string, unknown>,
  label: string,
): void {
  const anyOf = def["anyOf"];
  expect(
    Array.isArray(anyOf),
    `${label}: schema-subset.md:82 — a discriminated object union lowers to ` +
      `{ "anyOf": [<A-lowered>, <B-lowered>] }; lowered=${JSON.stringify(def)}`,
  ).toBe(true);
  const arms = anyOf as unknown[];
  expect(
    arms.length,
    `${label}: one arm per source variant; lowered=${JSON.stringify(def)}`,
  ).toBe(expectedArms.length);
  expect(
    arms.map((arm, i) => resolveArm(arm, defs, `${label} arm ${i}`)),
    `${label}: schema-subset.md:85 *Array element order* — "\`anyOf\` lists variants in source ` +
      `order"; lowered=${JSON.stringify(def)}`,
  ).toEqual(expectedArms);
}

// ===========================================================================
// (a) THE TWO SHAPES PARSE. Every fixture is a §Reproduction fixture.
// RED at HEAD: stray '=' / stray '|' / immutable-rebinding, with the shape's
// tokens showing up as `expr` / `reassign` statements.
// ===========================================================================

describe("bug 0033 (a) — the alias and explicit-discriminator declaration shapes parse", () => {
  it("RED a1: `schema Animal = Cat | Dog` loads clean and yields ONE schema declaration per source declaration", () => {
    // The bug doc's first §Reproduction fixture. `Cat` and `Dog` become two
    // expression statements today, and `Animal` is registered field-less.
    const doc = parse(F_ANIMAL);
    expectLoadsClean(doc, "a1 — schemas.md:57's worked example, verbatim");
    expect(
      stmtSig(doc),
      "one statement per source declaration: the union's arms are part of the DECLARATION, not " +
        "two expression statements (bug doc §Reproduction records " +
        '["schema(Cat)","schema(Dog)","schema(Animal)","expr","expr","let(a)"] today); ' +
        `diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:Animal", "let:a"]);
  });

  it("RED a2: the string-literal union `schema Severity = \"low\" | \"medium\" | \"high\"` loads clean", () => {
    // schemas.md:55 — "an enum-as-alias". Three `|` today, three stray tokens.
    const doc = parse(F_SEVERITY);
    expectLoadsClean(doc, "a2 — schemas.md:55's worked example");
    expect(stmtSig(doc), `diagnostics=${JSON.stringify(diagLines(doc))}`).toEqual([
      "schema:Severity",
      "let:a",
    ]);
  });

  it("RED a3: the single-type alias `schema Name = string` loads clean", () => {
    // The minimal alias: one `=`, one stray token today. TYPE-11's subject.
    expectLoadsClean(parse(F_NAME), "a3 — the single-type alias of type-system.md:54");
  });

  it("RED a4: the primitive union `schema StringOrNumber = string | number` loads clean", () => {
    // schemas.md:56's worked example; SUBS-1's subject at schema-subset.md:81.
    expectLoadsClean(parse(F_STRORNUM), "a4 — schemas.md:56's worked example");
  });

  it("RED a5: the explicit-discriminator form `schema Animal by kind = Cat | Dog` loads clean", () => {
    // schemas.md:110 / grammar.md:177. Today the `by kind = Cat` head parses as
    // a REASSIGNMENT and only the trailing `| Dog` draws a diagnostic — one
    // stray token for a whole unparsed declaration.
    const doc = parse(F_BY_KIND);
    expectLoadsClean(doc, "a5 — schemas.md:110's explicit `by <field>` form");
    expect(
      stmtSig(doc),
      `the \`by\` clause belongs to the declaration; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:Animal", "let:a"]);
  });

  it("RED a6: the `by` form does not misattribute a failure to an unrelated `let` binding", () => {
    // The bug doc's second §Reproduction fixture, generalised: with `let kind`
    // in scope the residue parses as a reassignment of it, so the load fails on
    // `theta/parse/immutable-rebinding: cannot reassign immutable binding 'kind'`
    // — a diagnostic about a binding the author never referenced in that
    // statement. `expectNoResidue` asserts that code is gone by name.
    const doc = parse(F_BY_KIND_WITH_LET);
    expectLoadsClean(
      doc,
      "a6 — a `let` sharing the discriminator's name must not be implicated",
    );
    expect(
      stmtSig(doc),
      `the declaration must not become a reassignment; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "let:kind", "schema:Animal"]);
  });

  it("RED a7: the `.thetalib` spelling of the union declaration loads clean", () => {
    // In a `.thetalib` the residue is additionally illegal: the variant names
    // become top-level statements, so the file draws two
    // `theta/parse/thetalib-top-level-statement` errors on top of the stray
    // tokens (bug doc §Reproduction, "Reach into the other positions"). A
    // `schema` declaration is a permitted `.thetalib` top-level form
    // (imports.md §`.thetalib` file rules), so the fixed parse must be silent.
    const doc = parseLib(F_THETALIB);
    expectLoadsClean(doc, "a7 — `schema` is a permitted `.thetalib` top-level form");
    expect(
      stmtSig(doc),
      `diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:Animal"]);
  });

  it("CONTROL a8: the object form and type-position unions are byte-unchanged", () => {
    // The bug doc's controls: the `|` failure is specific to the DECLARATION
    // shape, not to unions. Green today and after — a red here names a
    // regression in the object path `parseSchemaObjectBody` keeps.
    const objForm = parse(F_OBJFORM);
    expect(diagLines(objForm), "the object form is untouched by this fix").toEqual([]);
    expect(stmtSig(objForm)).toEqual(["schema:Cat", "let:a"]);
    const typePos = parse(F_TYPEPOS_UNION);
    expect(
      diagLines(typePos),
      "union arms in TYPE position already parse (bug doc §Reproduction, Controls)",
    ).toEqual([]);
    expect(stmtSig(typePos)).toEqual(["schema:S", "let:a"]);
  });
});

// ===========================================================================
// (b) THE SEVEN REGISTRY ROWS, END-TO-END through `parseThetaDocument`.
// Each fixture mirrors the seam-level input of the same-named test in
// tests/disc-unions-recursion.test.ts, as theta SOURCE.
// RED at HEAD: the checkers have no caller in `src/` at all — the seven codes
// are unreachable from any input, and each fixture instead reds on the residue.
// ===========================================================================

describe("bug 0033 (b) — the seven discriminated-union / cycle codes fire through the parse", () => {
  it("RED b1: `schema X by f { a: string }` fires theta/parse/by-on-object-schema", () => {
    // grammar.md:179 prescribes this rejection. DRIFT vs the bug doc: at 0.32.0
    // this fixture loaded with ZERO diagnostics; at HEAD bug 0025's landed
    // constructor gate rejects the `f { a: string }` residue's re-parse with
    // `unresolved-named-type 'f'` — a name the author never wrote as a type.
    // Both are the same defect: the declaration's shape reaches the statement
    // loop. The misattribution is asserted gone by name below.
    const doc = parse(F_BY_OBJ);
    expect(
      diagLines(doc),
      "b1 — the `by f` clause and the `{ a: string }` body must both be consumed by the " +
        "DECLARATION, so no residue can be misread as a constructor naming the type `f`; " +
        `actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "f"]])));
    expectExactly(
      doc,
      line(BY_ON_OBJECT, msg(BY_ON_OBJECT, [])),
      "b1 — grammar.md:179 / schemas.md:113",
    );
  });

  it("RED b2: an explicit `by` over integer-literal tags fires theta/parse/non-string-discriminator", () => {
    // Seam sibling: disc-unions-recursion.test.ts's non-string test, whose
    // `{ kind: "integer", text: "1" }` this source spells `kind: 1` (probed: it
    // lowers to `{"const":1}`, so the literal type IS carried).
    expectExactly(
      parse(F_NONSTR),
      line(
        NON_STRING,
        msg(NON_STRING, [
          ["<field>", "kind"],
          ["<X>", "Animal"],
          ["<kind>", "integer"],
        ]),
      ),
      "b2 — schemas.md §Discriminated unions: the string-literal constraint applies to the " +
        "explicit `by` form too",
    );
  });

  it("RED b3: two qualifying implicit candidates fire theta/parse/ambiguous-discriminator", () => {
    // Both `kind` and `species` are present in every variant, single string
    // literals, unique across variants — detection is ambiguous. Candidates are
    // rendered in source order, comma-space joined.
    expectExactly(
      parse(F_AMBIG),
      line(
        AMBIGUOUS,
        msg(AMBIGUOUS, [
          ["<X>", "Animal"],
          ["<fields>", "kind, species"],
        ]),
      ),
      "b3 — schemas.md §Discriminated unions, implicit detection",
    );
  });

  it("RED b4: an object union with no shared literal field fires theta/parse/missing-discriminator", () => {
    // `name` and `age` are non-literal fields on disjoint variants, so no field
    // qualifies. The template's trailing `'by <field>'` is LITERAL prose and is
    // not substituted.
    expectExactly(
      parse(F_MISSING),
      line(MISSING, msg(MISSING, [["<X>", "Animal"]])),
      "b4 — schemas.md §Discriminated unions: discriminator-less object unions are rejected",
    );
  });

  it("RED b5: two variants sharing the tag fire theta/parse/duplicate-discriminator-value", () => {
    // Explicit `by kind`, both variants `kind: "same"`. The value renders bare
    // because `same` is identifier-shaped (placeholder-rendering-b.md category 5).
    expectExactly(
      parse(F_DUP),
      line(
        DUPLICATE_VALUE,
        msg(DUPLICATE_VALUE, [
          ["<value>", "same"],
          ["<X>", "Animal"],
        ]),
      ),
      "b5 — schemas.md §Discriminated unions: duplicate discriminator values",
    );
  });

  it("RED b6: a nested discriminator value fires theta/parse/nested-discriminator", () => {
    // `kind: { type: "x" }` — the chosen discriminator is not a top-level
    // literal of the variant.
    expectExactly(
      parse(F_NESTED),
      line(
        NESTED,
        msg(NESTED, [
          ["<field>", "kind"],
          ["<X>", "Animal"],
        ]),
      ),
      "b6 — schemas.md §Discriminated unions: the discriminator field must be top-level",
    );
  });

  it("RED b7: `schema X = Y` + `schema Y = X` fires theta/parse/type-alias-cycle with the path", () => {
    // schemas.md:143 prescribes the rejection and the rendering: the path is
    // arrow-joined (` → `, U+2192) and closes back on the entry node, mirroring
    // the import-/invocation-cycle diagnostics. Today: two stray '=' and no
    // cycle detection at all, because neither alias RHS is parsed.
    expectExactly(
      parse(F_CYCLE),
      line(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "X \u2192 Y \u2192 X"]])),
      "b7 — schemas.md:143 / the `detectTypeAliasCycles` seam's own rendering " +
        "(schema-declarations.ts:707)",
    );
  });
});

// ===========================================================================
// (c) THE LOWERING. `doc.frontmatter.params.loweredSchema` is the cheapest
// readable surface for a lowered alias fragment (the access pattern
// tests/params-inline-object-lowering.test.ts uses).
// RED at HEAD: the fixtures do not load (stray tokens), and `$defs.<Alias>`
// lowers to the permissive `{}` (probed).
// ===========================================================================

describe("bug 0033 (c) — an alias declaration lowers concretely", () => {
  it("RED c1: a discriminated object union lowers to `anyOf` in SOURCE ARM ORDER", () => {
    const loaded = loadParams("c1", P_ANIMAL);
    const def = aliasDef(loaded, "Animal", "c1");
    expectAnyOfInOrder(def, [CAT_FRAGMENT, DOG_FRAGMENT], loaded.defs, "c1 (`Cat | Dog`)");
  });

  it("RED c2: reversing the source arms reverses the `anyOf` arms", () => {
    // Without this cell the order claim in c1 could hold by accident (alphabetical,
    // declaration order of `Cat`/`Dog`, or `$defs` insertion order). `Dog | Cat`
    // declares the arms against both.
    const loaded = loadParams("c2", P_ANIMAL_REVERSED);
    const def = aliasDef(loaded, "Animal", "c2");
    expectAnyOfInOrder(def, [DOG_FRAGMENT, CAT_FRAGMENT], loaded.defs, "c2 (`Dog | Cat`)");
  });

  it("RED c3: an all-primitive union lowers to SUBS-1's `{ \"type\": [...] }` in arm order", () => {
    // schema-subset.md:81 — "A union all of whose arms are primitive types …
    // MUST lower to the multi-type-array form"; the reference vector for
    // `string | number` is `{ "type": ["string", "number"] }`.
    const loaded = loadParams("c3", P_STRORNUM);
    const def = aliasDef(loaded, "StringOrNumber", "c3");
    expect(
      def,
      'c3 — SUBS-1 (schema-subset.md:81) and the *Array element order* clause (:85): the ' +
        'reference vector for `string | number` is {"type":["string","number"]}',
    ).toEqual({ type: ["string", "number"] });
  });

  it("RED c4: the lowered union document actually constrains the argument (real AJV)", () => {
    // The consequence of the permissive `{}` arm: with `$defs.Animal = {}` the
    // envelope check accepts ANY JSON value for a param declared as the union.
    // Driven through the real `AjvSchemaValidator` (V8c seam).
    const loaded = loadParams("c4", P_ANIMAL);
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    expect(
      compiled.validate({ a: { kind: "cat", name: "n" } }).ok,
      "a well-formed `Cat` payload satisfies the union — the `anyOf` arms and every `$defs` " +
        "entry they ref must be AJV-resolvable, or the fix trades a silent hole for a broken " +
        "envelope",
    ).toBe(true);
    expect(
      compiled.validate({ a: { kind: "dog", name: "n" } }).ok,
      "the second arm is reachable too",
    ).toBe(true);
    expect(
      compiled.validate({ a: { kind: "bird", name: "n" } }).ok,
      "a payload matching NEITHER variant is rejected: each variant carries its own `const` " +
        "discriminator plus `additionalProperties: false` (schema-subset.md:82)",
    ).toBe(false);
    expect(
      compiled.validate({ a: 7 }).ok,
      "with the permissive `{}` lowering the envelope accepts any JSON value for a param " +
        "declared as a discriminated union — the accept-anything hole this cell closes",
    ).toBe(false);
    expect(
      compiled.validate({ a: { kind: "cat" } }).ok,
      "every wire name of the matched variant is required",
    ).toBe(false);
    expect(
      emitted.map((d) => d.code),
      "no slug-collision diagnostic: one compile of one document",
    ).toEqual([]);
  });

  it("RED c5: a string-literal union alias accepts exactly its arms (real AJV, behavioural pin)", () => {
    // The §Fix names byte shapes only for the primitive (`{"type":[...]}`) and
    // `anyOf` cases, but the fragment shape is not the implementer's choice:
    // schema-subset.md:80 spells one emission for an enum or a string-literal
    // union, `{"type":"string","enum":[...]}`, and those bytes are pinned at
    // every position by tests/literal-union-string-enum-emission.test.ts. This
    // cell holds the other half of the contract — the admitted value set — so
    // it stays behavioural and does not move with the emission.
    const loaded = loadParams("c5", P_SEVERITY);
    aliasDef(loaded, "Severity", "c5");
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    for (const accepted of ["low", "medium", "high"]) {
      expect(
        compiled.validate({ a: accepted }).ok,
        `schemas.md:55 — every declared arm is admitted; rejected ${JSON.stringify(accepted)}`,
      ).toBe(true);
    }
    expect(
      compiled.validate({ a: "zzz" }).ok,
      "an undeclared string is rejected — the whole point of the alias",
    ).toBe(false);
    expect(
      compiled.validate({ a: 1 }).ok,
      "a non-string is rejected: every arm of this union is a string literal",
    ).toBe(false);
    expect(emitted.map((d) => d.code), "one compile of one document").toEqual([]);
  });
});

// ===========================================================================
// (d) THE TYPE LAYER — TYPE-11 and TYPE-4 gain their first reachable subjects.
// RED at HEAD: the declaration does not parse, so each fixture carries the
// stray-token residue alongside (d1) or instead of (d2) the wanted outcome.
// ===========================================================================

describe("bug 0033 (d) — alias transparency (TYPE-11) and variant-to-union (TYPE-4)", () => {
  it("RED d1: `let n: Name = 1` under `schema Name = string` reports ONLY let-rhs-type-mismatch", () => {
    // TYPE-11 (type-system.md:54): `Name` is replaced by `string` and the check
    // re-evaluated, so `1` (integer) is incompatible. The mismatch already fires
    // today — for the WRONG reason (the field-less head is a nominal named type
    // under TYPE-10) and alongside `stray '='`. The claim here is that it is the
    // only diagnostic.
    //
    // The expected/actual bytes are `displayType`'s (type-compat.ts:296): its
    // `named` arm (:302) renders the annotation's name AS WRITTEN, so
    // unfolding happens inside `checkCompatible`, not inside the renderer.
    expectExactly(
      parse(F_LET_ALIAS_MISMATCH),
      line(
        LET_MISMATCH,
        msg(LET_MISMATCH, [
          ["<name>", "n"],
          ["<expected>", "Name"],
          ["<actual>", "integer"],
        ]),
      ),
      "d1 — TYPE-11 alias transparency: `Name` unfolds to `string`, and `integer ⋢ string`",
    );
  });

  it("RED d2: `let a: Animal = Cat { ... }` under the union loads clean (TYPE-4)", () => {
    // type-system.md:38 — "for any discriminated union `schema U = A | B | ...`,
    // every variant satisfies `A ⊑ U`" (the `Cat ⊑ Animal` case). Today the
    // field-less `Animal` head is a nominal named type distinct from `Cat`, so
    // the load fails on `let-rhs-type-mismatch: expected Animal, got Cat` —
    // exactly the pair TYPE-4 admits — on top of the two stray tokens.
    const doc = parse(F_LET_VARIANT_UNION);
    expect(
      codes(doc.diagnostics),
      "d2 — TYPE-4 (type-system.md:38) admits `Cat ⊑ Animal`, so the typed `let` sink must not " +
        `report a mismatch; actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(LET_MISMATCH);
    expectLoadsClean(doc, "d2 — a variant assigned to its union");
  });
});

// ===========================================================================
// (e) THE TWO DISPOSITIONS the §Fix delegates ("A body-less `schema X` head must
// gain a disposition"), decided here as `theta/parse/empty-schema-body`.
// RED at HEAD: both load with ZERO diagnostics (probed) and register a
// field-less declaration whose name resolves everywhere.
// ===========================================================================

describe("bug 0033 (e) — a shape-less `schema X` head is theta/parse/empty-schema-body", () => {
  it("RED e1: `schema X` with no shape at all fires empty-schema-body", () => {
    // Registry-honest: the registered message
    // `'X' has no fields; an empty schema cannot be validated.` is already true
    // of this declaration, so the code's *Message* is unchanged and only the
    // row's *Trigger* prose widens from `schema X { }` (a same-commit doc edit,
    // GOV-15 diagnostic-registry carve-out). NOT `unsupported-feature`: DIAG-2's
    // trigger for that code names non-Theta constructs, which this is not.
    expectExactly(
      parse(F_HEADLESS),
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
      "e1 — replacing the `null` fallthrough removes the mechanism that makes this silent",
    );
  });

  it("RED e2: `schema X { \"a\": string }` (brace body, not an ident field list) fires empty-schema-body", () => {
    // The other silent head: `parseSchemaObjectBody` consumes the brace group
    // but captures no `ident: Type` field, so the declaration yields no fields —
    // the same observable as `schema X { }`, and the same disposition.
    expectExactly(
      parse(F_QUOTED_BODY),
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
      "e2 — a brace body that captures no field yields a field-less declaration",
    );
  });

  it("CONTROL e3: `schema X { }` keeps firing empty-schema-body, byte-unchanged", () => {
    // Green today and after. This is the standing behaviour e1/e2 are aligned
    // to, so a red here means the disposition moved the existing row instead of
    // widening it.
    expect(
      diagLines(parse(F_EMPTY_BODY)),
      "the existing empty-body rejection is byte-unchanged (code-registry-parse.md:86)",
    ).toEqual([line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]]))]);
  });
});

// ===========================================================================
// (f) INTERACTIONS with the two reports whose coverage was conditional on this
// one (bug doc §Fix, "Fix ordering"), and the downstream name positions.
// ===========================================================================

describe("bug 0033 (f) — the alias/union name in the other NamedType positions", () => {
  it("RED f1: a constructor naming a union stays bug 0025's non-constructible rejection, alone", () => {
    // 0025 §Fix (2) rejects a constructor naming a declared but
    // non-brace-constructible declaration; `code-registry-parse.md:89` spells it
    // out — "a `schema` without an object body … is not constructible and fires
    // this code". That arm already fires at HEAD (probed), so the claim here is
    // that once 0033 lands it is the ONLY diagnostic: the alias tail no longer
    // contributes its two stray tokens.
    expectExactly(
      parse(F_CTOR_ALIAS),
      line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "Animal"]])),
      "f1 — bug 0025's classification re-run against a union declaration " +
        "(0025 §Non-goals; 0033 §Fix, Fix ordering)",
    );
  });

  it("RED f2: `schema Ghost = Missing` fires unresolved-named-type naming 'Missing'", () => {
    // The alias RHS is a NEW `NamedType`-resolution position. The bug doc: "0033
    // adds a further such position — the alias right-hand side, where
    // `schema X = Ghost` names an undeclared type — so the widened row's
    // predicate … covers it without further edit". The row's *position list*
    // (code-registry-parse.md:89) names four positions today and gains the alias
    // RHS in the same commit; the *Message* is unchanged.
    //
    // At HEAD the name is not a type at all: the residue makes `Missing` an
    // expression statement, so the file reds on `stray '='` plus
    // `theta/parse/unknown-identifier` — the value-position row, which is the
    // wrong row for a type position.
    const doc = parse(F_GHOST);
    expect(
      codes(doc.diagnostics),
      "f2 — the alias RHS is a TYPE position, so the type-resolution row applies, not the " +
        "value-position `unknown-identifier` row; actual=" +
        JSON.stringify(diagLines(doc)),
    ).not.toContain("theta/parse/unknown-identifier");
    expectExactly(
      doc,
      line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "Missing"]])),
      "f2 — an alias RHS naming no declaration",
    );
  });

  it("RED f3: an alias name at the `@<T>` annotation root resolves", () => {
    // bug doc §Reproduction, "Reach into the other positions": an alias at the
    // `@<T>` root fails the load on the two stray tokens today, so no downstream
    // position can even be probed against an alias declaration. bug 0028 owns
    // the annotation-resolution row and left the alias case out for exactly this
    // reason.
    const doc = parse(F_ANNOT_ALIAS);
    expect(
      codes(doc.diagnostics),
      "f3 — the union is a declared top-level schema, so the annotation root resolves " +
        `(code-registry-parse.md:89, whole-file resolution); actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(UNRESOLVED);
    expectLoadsClean(doc, "f3 — a union name is a resolvable `@<T>` annotation root");
  });

  it("RED f4: an alias name on the `params:` right-hand side resolves", () => {
    // The `params:` reach, asserted as resolution only (the lowered bytes are
    // group (c)'s claim). `loadParams` fails loudly with the diagnostics
    // rendered if the theta does not load.
    expect(
      codes(parseDoc(P_ANIMAL, "bug0033.theta").diagnostics),
      "f4 — the `params:` right-hand side is the row's FIRST position; the union name resolves " +
        "whole-file, so the code must not fire",
    ).not.toContain(UNRESOLVED);
    const loaded = loadParams("f4", P_ANIMAL);
    expect(
      loaded.properties["a"],
      "f4 — frontmatter-fields-a.md:58: whole-file resolution over the body's top-level " +
        "declarations, which now include the union",
    ).toEqual({ $ref: "#/$defs/Animal" });
  });
});

// ===========================================================================
// (g) REVIEW ROUND 1, F1 — the right-hand-side capture ends where the
// DECLARATION grammatically ends (§Fix: "No token of a declaration shape may
// survive into the statement loop" — and, symmetrically, no token of the NEXT
// statement may be pulled into the declaration).
//
// The mechanism: `>` and `=` are TRAILING newline-continuation triggers
// (lexer.ts `trailingTriggers`; grammar.md §"Statement termination & newline
// continuation"), so after `schema IntList = array<integer>` or a bare
// `schema X =` the lexer emits NO `stmt-sep` and the next statement's tokens
// are the next tokens the capture sees.
// ===========================================================================

describe("bug 0033 (g) — an alias right-hand side ends at the declaration's end", () => {
  it("g1: `schema IntList = array<integer>` does not swallow the `let` behind the swallowed newline", () => {
    // The destructive arrangement: the following statement is consumed into the
    // arm source (`array<integer>leta`), so the `let` never exists and its `= 1`
    // lands in the statement loop as `stray '='`.
    const doc = parse(F_GENERIC_THEN_LET);
    expectLoadsClean(doc, "g1 — a generic-tailed alias followed by a `let`");
    expect(
      armsOf(doc, "IntList", "g1"),
      "g1 — the arm is the declaration's Type and nothing after it; a capture that ran past " +
        "the declaration joins the next statement's tokens onto the arm",
    ).toEqual(["array<integer>"]);
    expect(
      stmtSig(doc),
      `g1 — the \`let\` survives as its own declaration; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:IntList", "let:a"]);
  });

  it("g2: the same alias placed LAST does not silently absorb the body's tail expression", () => {
    // The silent arrangement: nothing after the declaration draws a diagnostic,
    // so the capture eats the tail expression `a` and the theta still loads
    // clean — the load is a lie about what it parsed. `expectLoadsClean` cannot
    // be used here: the tail `a` is a legitimate expression FORM on the logical
    // line the trailing `>` continued, so it lands in the statement list rather
    // than being promoted to `body.tail` (`parseForms` promotes only a form that
    // opened a new logical line). That promotion loss is the lexer's
    // continuation rule, not the capture's; what this cell pins is that the
    // token survives AS A FORM instead of vanishing into the arm source.
    const doc = parse(F_LET_THEN_GENERIC);
    expect(
      diagLines(doc),
      "g2 — every fixture arrangement of a well-formed alias loads clean",
    ).toEqual([]);
    expect(
      armsOf(doc, "IntList", "g2"),
      "g2 — the tail expression is NOT part of the right-hand side; absorbing it (arm " +
        "`array<integer>a`) drops the body's final value with no diagnostic at all",
    ).toEqual(["array<integer>"]);
    expect(
      stmtSig(doc),
      `g2 — the trailing \`a\` survives as an expression form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["let:a", "schema:IntList", "expr"]);
  });

  it("g3: a union whose LAST arm is generic-tailed stops at the following statement", () => {
    // Same trigger one arm along: the `>` closing `array<string>` swallows the
    // newline, so the field-boundary stop has to end the capture on the `let`.
    const doc = parse(F_UNION_GENERIC_THEN_LET);
    expectLoadsClean(doc, "g3 — a mixed union whose final arm ends in `>`");
    expect(
      armsOf(doc, "X", "g3"),
      "g3 — two arms, neither carrying the next statement",
    ).toEqual(["Cat", "array<string>"]);
    expect(
      stmtSig(doc),
      `g3 — the \`let\` survives; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:X", "let:a"]);
  });

  it("g4: `schema X =` with no right-hand side is empty-schema-body AND leaves the `let` intact", () => {
    // The `=` is itself a trailing trigger, so the arm capture starts ON the
    // next statement with nothing behind it — the field-boundary stop needs a
    // completed atom to fire against and has none, which is why the arm-token
    // boundary needs its own statement-keyword stop. Without it the capture
    // mints the single arm `leta`, the shapeless-RHS recovery is unreachable,
    // and the `= 1` left over becomes `stray '='`.
    const doc = parse(F_EMPTY_RHS_THEN_LET);
    expectExactly(
      doc,
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
      "g4 — a shapeless alias right-hand side takes group (e)'s disposition",
    );
    expect(
      stmtSig(doc),
      "g4 — the following `let` is a declaration, not the alias's first arm; " +
        `diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "let:a"]);
  });

  it("g5: the generic-tailed alias lowers to its declared array fragment", () => {
    // The byte consequence of g1/g2: an arm carrying the next statement's
    // tokens is not a Type, so it lowers permissively and the `params:`
    // envelope stops constraining the argument.
    const loaded = loadParams("g5", P_INTLIST);
    const def = aliasDef(loaded, "IntList", "g5");
    expect(
      def,
      "g5 — schema-subset.md §Lowering Algorithm: `array<integer>` lowers to the array form " +
        "with a lowered `items`",
    ).toEqual({ type: "array", items: { type: "integer" } });
  });
});

// ===========================================================================
// (h) REVIEW ROUND 1, F2 — a literal UNION is not a single literal.
// schemas.md §Discriminated unions, detection rule 2: the discriminator must
// "be a single string literal type in every variant (one literal value per
// variant; not a literal-union)".
// ===========================================================================

describe("bug 0033 (h) — a literal-union field is no discriminator candidate", () => {
  it("h1: literal-union tags in both variants fire missing-discriminator", () => {
    // Endpoint-tested classification reads `"a" | "b"` as ONE string literal
    // whose text is the interior byte run `a" | "b`, so the union silently
    // passes detection with a discriminator no lowered schema can carry.
    expectExactly(
      parse(F_LITERAL_UNION_TAGS),
      line(MISSING, msg(MISSING, [["<X>", "Animal"]])),
      "h1 — no field is a SINGLE literal in every variant, so none qualifies",
    );
  });

  it("h2: the same literal-union in both variants fires missing-discriminator, not duplicate-value", () => {
    // The mis-classification's second face: with identical literal-unions the
    // two garbled texts collide, and the union is rejected on the wrong code
    // with the interior byte run rendered into the message
    // (`duplicate discriminator value '"a\"|\"b"'`).
    const doc = parse(F_LITERAL_UNION_TAGS_SHARED);
    expect(
      codes(doc.diagnostics),
      "h2 — a literal-union field never becomes a discriminator, so it can never be the " +
        `subject of a duplicate-VALUE rejection; actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(DUPLICATE_VALUE);
    expectExactly(
      doc,
      line(MISSING, msg(MISSING, [["<X>", "Animal"]])),
      "h2 — the union has no shared single-literal field at all",
    );
  });

  it("CONTROL h3: a `|` INSIDE a string literal still reads as one literal", () => {
    // The rejection is on a TOP-LEVEL `|`. `kind: "a|b"` is a single string
    // literal that happens to contain the byte, and stays a valid discriminator
    // — green today and after.
    expect(
      diagLines(
        parse(
          'schema Cat { kind: "a|b", name: string }\nschema Dog { kind: "c|d", name: string }\n' +
            "schema Animal = Cat | Dog\nlet a = 1\na\n",
        ),
      ),
      "h3 — `splitTopLevel` tracks string literals, so a quoted `|` does not split the arm",
    ).toEqual([]);
  });
});

// ===========================================================================
// (i) REVIEW ROUND 1, F3 — an explicit `by` names the THETA-SIDE field.
// schemas.md §Wire-name renaming: "The explicit form `by <field>` accepts the
// theta-side name — the only name visible in code — and the lowering resolves
// it to each variant's wire name."
// ===========================================================================

describe("bug 0033 (i) — `by <field>` resolves the theta-side name of a renamed field", () => {
  it('i1: `by kind` over `kind as "Kind": 1` fires non-string-discriminator', () => {
    // Resolving the by-field by WIRE name misses `kind` entirely, every
    // constraint evaluates over an absent field, and the union loads clean with
    // an integer discriminator — the exact shape schemas.md §Discriminated
    // unions rejects ("wire-renamed discriminator fields keep the string-literal
    // constraint on the *value*; the rename does not interact").
    expectExactly(
      parse(F_BY_THETA_NAME),
      line(
        NON_STRING,
        msg(NON_STRING, [
          ["<field>", "kind"],
          ["<X>", "Animal"],
          ["<kind>", "integer"],
        ]),
      ),
      "i1 — the by-clause resolves `kind`, and the RESOLVED field's value is checked",
    );
  });

  it("i2: `by Kind` — the wire spelling — is not a theta-side name, and the outcome is UNDECIDED", () => {
    // PINNED AS THE CURRENT DISPOSITION, NOT AS A SPECIFIED ONE. The by-clause
    // resolves nothing, so every constraint in `checkExplicitDiscriminator` is
    // vacuous and the declaration loads clean. schemas.md §Discriminated unions
    // prescribes codes for a discriminator that is nested, non-string or
    // non-unique, and `missing-discriminator` for IMPLICIT detection finding no
    // candidate; it says nothing about an explicit `by` naming a field no
    // variant declares. No registry code is invented for it here. If the
    // specification later decides this case, this cell is the one to change.
    expectLoadsClean(
      parse(F_BY_WIRE_NAME),
      "i2 — an explicit by-clause naming no theta-side field of any variant",
    );
  });

  it("CONTROL i3: a renamed discriminator with distinct string values still loads clean", () => {
    // The other half of "the rename does not interact": once the theta-side
    // name resolves, a well-formed string discriminator behind a wire rename is
    // legal.
    expect(
      diagLines(
        parse(
          'schema Cat { kind as "Kind": "cat", name: string }\n' +
            'schema Dog { kind as "Kind": "dog", name: string }\n' +
            "schema Animal by kind = Cat | Dog\nlet a = 1\na\n",
        ),
      ),
      "i3 — the value constraint binds the resolved field, and these values satisfy it",
    ).toEqual([]);
  });
});

// ===========================================================================
// (j) REVIEW ROUND 1, F4 — an inline `ObjectType` is a legal arm.
// grammar.md §"Inline object types" admits `ObjectType` "in any `Type`
// position", recursively, and `AliasRhs ::= Type ("|" Type)*` is such a
// position.
// ===========================================================================

describe("bug 0033 (j) — an inline-object arm is captured, at either end of the union", () => {
  it("j1: `schema X = { a: string } | Cat` is a two-arm declaration with zero residue", () => {
    // A leading-`{` capture that returns at the closing brace strands `| Cat`
    // for the statement loop: `stray '|'` plus `Cat` as an expression statement.
    const doc = parse(F_BRACE_ARM_FIRST);
    expectLoadsClean(doc, "j1 — an inline object as the FIRST arm");
    expect(
      armsOf(doc, "X", "j1"),
      "j1 — the brace group is one arm and `Cat` is the other",
    ).toEqual(["{a:string}", "Cat"]);
    expect(
      stmtSig(doc),
      "j1 — one schema declaration, then the following statements intact; " +
        `diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:X", "let:a"]);
  });

  it("j2: `schema X = Cat | { a: string }` is the same declaration, arms reversed", () => {
    // The mirror arrangement terminates the capture AT the depth-0 `{`, so the
    // brace group re-enters the statement loop and draws
    // `theta/parse/bare-object-literal` — a diagnostic about an expression the
    // author never wrote.
    const doc = parse(F_BRACE_ARM_SECOND);
    expect(
      codes(doc.diagnostics),
      "j2 — the arm is a TYPE, so it can never be reported as an object literal in expression " +
        `position; actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain("theta/parse/bare-object-literal");
    expectLoadsClean(doc, "j2 — an inline object as the SECOND arm");
    expect(armsOf(doc, "X", "j2"), "j2 — arm order follows source order").toEqual([
      "Cat",
      "{a:string}",
    ]);
    expect(
      stmtSig(doc),
      `j2 — the following statements are intact; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:Dog", "schema:X", "let:a"]);
  });

  it("j3: both arm orders lower without diagnostics", () => {
    // NO BYTE PIN on the inline-object arm. `lowerTypeSource`'s handling of a
    // brace-rooted union arm is permissive (`{}`) and symmetric with every
    // other `lowerTypeExpr` caller — pre-existing behaviour this fix does not
    // move. What is pinned is that the declaration lowers at all: the name
    // resolves, the arm count is the source's, and no diagnostic is raised.
    for (const [label, source] of [
      ["j3 first", P_BRACE_ARM_FIRST],
      ["j3 second", P_BRACE_ARM_SECOND],
    ] as const) {
      const loaded = loadParams(label, source);
      expect(
        loaded.properties["a"],
        `${label} — the union name resolves at the \`params:\` position`,
      ).toEqual({ $ref: "#/$defs/X" });
      const def = loaded.defs["X"];
      expect(
        def,
        `${label} — the declaration is hoisted as a \`$defs\` entry; ` +
          `$defs keys=${JSON.stringify(Object.keys(loaded.defs))}`,
      ).toBeDefined();
      const anyOf = (def as Record<string, unknown>)["anyOf"];
      expect(
        Array.isArray(anyOf) ? (anyOf as unknown[]).length : anyOf,
        `${label} — one lowered arm per source arm (schema-subset.md:82); ` +
          `lowered=${JSON.stringify(def)}`,
      ).toBe(2);
    }
  });
});

// ===========================================================================
// (k) REVIEW ROUND 1, F5 — a `by` clause needs a discriminated union under it.
// grammar.md §"schema X by <field>": `UnionRhs ::= Type ("|" Type)+`. A
// single-arm right-hand side declares one variant, which is the same "one
// variant by definition" the object form carries — so it takes the same
// registered code, through the same construction point.
// ===========================================================================

describe("bug 0033 (k) — a `by` clause over fewer than two arms is by-on-object-schema", () => {
  it("k1: `schema X by f = Cat` fires theta/parse/by-on-object-schema", () => {
    // Loads silently otherwise: the by-clause is classified as the union form
    // on the strength of the `=` alone, and the discriminator checks skip a
    // one-arm union, so nothing looks at the clause at all.
    expectExactly(
      parse(F_BY_SINGLE_ARM),
      line(BY_ON_OBJECT, msg(BY_ON_OBJECT, [])),
      'k1 — grammar.md §"schema X by <field>": `UnionRhs` is two arms or more',
    );
  });

  it("CONTROL k2: `schema X by kind = Cat | Dog` stays clean", () => {
    // The well-formed explicit form. Green today and after — a red here means
    // the arm-count rule was applied to the legal shape too.
    expect(
      diagLines(parse(F_BY_TWO_ARMS)),
      "k2 — two arms with a well-formed string discriminator is exactly the form " +
        "schemas.md:110 declares",
    ).toEqual([]);
  });
});

// ===========================================================================
// (l) REVIEW ROUND 2, F1 — a PUNCT-headed following statement survives.
// The §Fix invariant is dual: "No token of a declaration shape may survive into
// the statement loop", and no following STATEMENT may be absorbed into the
// declaration. Group (g) settled the keyword-headed half; these settle the
// punct-headed half, which the arm-start keyword stop cannot see and the
// field-boundary stop cannot see either (its rule is about VALUE-ish tokens:
// ident, keyword, string, number). `@`, a template backtick, `(` and `[` are
// none of those, so each was joined onto the arm source and its whole statement
// vanished with it — in n1–n4 with no diagnostic at all.
// ===========================================================================

const DISCARDED = "theta/parse/discarded-query-result";
const INLINE_ENUM = "theta/parse/inline-enum";
const ARITY = "theta/parse/generic-arity-mismatch";
const VOID_POSITION = "theta/parse/void-in-non-return-position";
const RESULT_POSITION = "theta/parse/result-in-schema-position";

describe("bug 0033 (l) — a punct-headed following statement is not absorbed", () => {
  it("n1: a bare `@`-query after a generic-tailed alias survives as a statement", () => {
    // Destructive arrangement: the arm grows to ``array<integer>@`` `` (the
    // lexer emits the two backtick delimiters and no prose tokens), the query
    // statement is GONE, and the theta loads with zero diagnostics.
    const doc = parse(F_GENERIC_THEN_QUERY);
    expect(
      armsOf(doc, "X", "n1"),
      "n1 — the arm is the declaration's Type and nothing after it",
    ).toEqual(["array<integer>"]);
    expect(
      stmtSig(doc),
      `n1 — the query survives as its own form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "query"]);
    // The query's OWN disposition, pinned as observed rather than as preferred:
    // the `>` continuation swallowed the boundary newline, so the query does not
    // open a logical line and `parseForms` cannot promote it to the void tail.
    // A non-tail bare query is QRY-19's sole trigger. That is the arrangement's
    // honest cost; the alternative is the statement disappearing.
    expect(
      diagLines(doc),
      "n1 — the surviving query is an ordinary non-tail bare query",
    ).toEqual([line(DISCARDED, msg(DISCARDED, []))]);
  });

  it("n2: a TYPED `@<X>`-query after the same alias survives with its annotation", () => {
    // The annotation names the very declaration whose right-hand side would
    // otherwise have swallowed it, so absorption here also destroys the only
    // use of the alias in the file.
    const doc = parse(F_GENERIC_THEN_TYPED_QUERY);
    expect(armsOf(doc, "X", "n2"), "n2 — the arm stops before the `@`").toEqual([
      "array<integer>",
    ]);
    expect(
      stmtSig(doc),
      `n2 — the typed query survives; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "query"]);
    expect(
      diagLines(doc),
      "n2 — same non-tail bare-query disposition as n1; the annotation resolves, so no " +
        "unresolved-named-type joins it",
    ).toEqual([line(DISCARDED, msg(DISCARDED, []))]);
  });

  it("n3: a parenthesised expression statement after the same alias survives", () => {
    // `(` is no depth-0 stop in the general list — it INCREMENTS depth — so the
    // arm grew to `array<integer>(1+2)` and the statement was consumed with it.
    const doc = parse(F_GENERIC_THEN_PAREN);
    // `expectLoadsClean` does not apply: its residue rule forbids an `expr`
    // statement, and here the surviving statement IS an expression form — the
    // observable this cell exists to see. The load must still be clean.
    expect(
      diagLines(doc),
      "n3 — a well-formed alias followed by a well-formed expression statement",
    ).toEqual([]);
    expect(armsOf(doc, "X", "n3"), "n3 — the arm stops before the `(`").toEqual([
      "array<integer>",
    ]);
    expect(
      stmtSig(doc),
      `n3 — the expression survives as a form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "expr"]);
  });

  it("n4: an array-literal statement after the same alias survives", () => {
    // `[` likewise increments depth, so `[1, 2]` joined the arm. The type
    // grammar has no bracket-headed Type at an arm boundary at all.
    const doc = parse(F_GENERIC_THEN_ARRAY_LIT);
    // Same as n3: the survivor is an expression form, so the shared
    // residue-forbidding helper is the wrong oracle here.
    expect(
      diagLines(doc),
      "n4 — a well-formed alias followed by a well-formed array-literal statement",
    ).toEqual([]);
    expect(armsOf(doc, "X", "n4"), "n4 — the arm stops before the `[`").toEqual([
      "array<integer>",
    ]);
    expect(
      stmtSig(doc),
      `n4 — the literal survives as a form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "expr"]);
  });

  it("n4b: the same four heads stop where an arm must START, not only after one", () => {
    // The punct twin of g4, and the reason the ARM-START position needs the
    // stop as well: `=` is itself a trailing trigger, so the capture opens
    // directly on the `@` with nothing behind it. Ending the capture there is
    // half the job — `finishAliasSchema`'s shapeless-RHS recovery
    // (`skipDeclarationShape`) runs next over the same tokens, and it stops at
    // the same punct heads for the same reason, or the statement the capture
    // refused is consumed by the recovery instead.
    const doc = parse(F_EMPTY_RHS_THEN_QUERY);
    expect(
      stmtSig(doc),
      `n4b — the query is a statement of its own; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "query"]);
    expect(
      diagLines(doc),
      "n4b — a shapeless right-hand side takes group (e)'s disposition, and the surviving " +
        "query takes n1's",
    ).toEqual([
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
      line(DISCARDED, msg(DISCARDED, [])),
    ]);
  });

  it("CONTROL n5: the `[` of an inline `enum[...]` arm is mid-arm and still joins", () => {
    // The one `[` that must NOT stop the capture: it follows the bare `enum`
    // keyword, which completes no arm, so the boundary rule does not apply and
    // the rejected form is captured WHOLE. Its disposition is group (m)'s
    // business — the capture stays whole, and the check then rejects it loudly.
    const doc = parse(F_INLINE_ENUM_ARM);
    expect(
      armsOf(doc, "E", "n5"),
      'n5 — a truncated `enum["a"` arm would strand `, "b"]` for the statement loop and hide ' +
        "the form from `checkInlineEnumForm`",
    ).toEqual(['enum["a","b"]']);
    expect(
      stmtSig(doc),
      `n5 — the following \`let\` is intact; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:E", "let:a"]);
    expect(
      diagLines(doc),
      "n5 — the whole captured arm is rejected as the inline-enum form it is",
    ).toEqual([line(INLINE_ENUM, msg(INLINE_ENUM, []))]);
  });
});

// ===========================================================================
// (m) REVIEW ROUND 2, F2 — an alias arm runs the per-type-source check pass.
// `AliasRhs ::= Type ("|" Type)*` (grammar.md §"schema X by <field>") makes
// every arm a `Type` position, and a `Type` reached from a `schema` declaration
// is schema-feeding (schema-subset.md §Lowering Algorithm). The object form's
// field-type position runs `checkInlineEnumForm` + `parseTypeExpression(...,
// "schema-feeding")` + the unresolved-name walk over every field type; the arm
// position ran the name walk alone, so four rows that fire on a field type were
// silent on the identical source in an arm. Each cell asserts the alias list
// EQUALS the object-field control's list over the same type source.
// ===========================================================================

describe("bug 0033 (m) — an alias arm answers to the field-type checks", () => {
  it('n6: `schema X = enum["a", "b"]` fires theta/parse/inline-enum', () => {
    // `enum` is top-level only (schemas.md §Enum declarations). The arm-position
    // silence was the reason `ALIAS_ARM_STOP_KEYWORDS` omits `enum`: the capture
    // was whole, and nothing looked at it.
    expectArmMatchesFieldControl("n6", F_ALIAS_INLINE_ENUM, F_FIELD_INLINE_ENUM, [
      line(INLINE_ENUM, msg(INLINE_ENUM, [])),
    ]);
  });

  it("n7: `schema X = array<integer, string>` fires generic-arity-mismatch", () => {
    // The closed `GenericType` set is position-independent (grammar.md §"Type
    // grammar"): `array` is arity 1 wherever it is written.
    expectArmMatchesFieldControl("n7", F_ALIAS_ARITY, F_FIELD_ARITY, [
      line(
        ARITY,
        msg(ARITY, [
          ["<ctor>", "array"],
          ["<expected>", "1"],
          ["<actual>", "2"],
        ]),
      ),
    ]);
  });

  it("n8: `schema X = void` and `void | string` fire void-in-non-return-position", () => {
    // The registry row names "union arm" among the rejecting positions
    // explicitly, and it is the WHOLE rejection: `void` is a reserved keyword,
    // so it is not a `NamedType ::= Ident` (grammar.md:98, lexical.md:20) and
    // the whole-file name walk has no subject in it — bug 0044's §Fix. The
    // equality against the object-field control is what keeps the alias arm and
    // the field position answering to one type grammar (type-system.md:15), so
    // this cell still inverts if either position drifts.
    const expected = [line(VOID_POSITION, msg(VOID_POSITION, []))];
    expectArmMatchesFieldControl("n8 (single arm)", F_ALIAS_VOID, F_FIELD_VOID, expected);
    expectArmMatchesFieldControl(
      "n8 (union arm)",
      F_ALIAS_VOID_UNION,
      F_FIELD_VOID_UNION,
      expected,
    );
  });

  it("n9: `schema X = Result<string, string>` fires result-in-schema-position", () => {
    // A `schema` declaration is a lowered-schema position by definition, and
    // `Result` has no lowered-schema form (schema-subset.md §Lowering
    // Algorithm). Without the check the alias lowered permissively instead.
    expectArmMatchesFieldControl("n9", F_ALIAS_RESULT, F_FIELD_RESULT, [
      line(RESULT_POSITION, msg(RESULT_POSITION, [])),
    ]);
  });

  it("n10: `schema X = {}` takes the field position's disposition for `{}`", () => {
    // grammar.md §"Inline object types" says an empty inline object `{}` is
    // `theta/parse/empty-schema-body`, and the type grammar now implements
    // that rule at every position it is called from, including this one (bug
    // 0045 §Fix). What this cell pins is the EQUALITY — whatever the type
    // grammar makes of `{}`, the arm and the field agree — not which
    // disposition that is; the rule landing at both positions in one edit is
    // what keeps the equality true rather than incidental.
    expectArmMatchesFieldControl("n10", F_ALIAS_EMPTY_OBJECT, F_FIELD_EMPTY_OBJECT, [
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]])),
    ]);
    expect(
      armsOf(parse(F_ALIAS_EMPTY_OBJECT), "X", "n10"),
      "n10 — the empty inline object is captured as the single arm it is",
    ).toEqual(["{}"]);
  });

  it("n10b: an arm that is both unresolvable and grammar-checked emits each row once", () => {
    // The dedup question the wiring raises: the name walk and the type-grammar
    // walk both traverse the arm, so a name could be reported twice, or an arity
    // failure could arrive alongside an unresolved-name failure for the same
    // head. Pinned AS OBSERVED, with no invented dedup rule:
    //   - `Ghost<1,2>` — silent at both positions. `Ghost` is outside the closed
    //     `GenericType` set, so it declares no arity to violate, and the name
    //     walk does not descend an unknown application's head.
    //   - `array<Ghost>` — the name walk alone, once.
    //   - `Ghost | Ghost` — ONE line for two occurrences: the walk runs over the
    //     rejoined right-hand side and dedups by name, as it did before.
    expectArmMatchesFieldControl(
      "n10b (applied)",
      F_ALIAS_GHOST_APPLIED,
      F_FIELD_GHOST_APPLIED,
      [],
    );
    expect(
      diagLines(parse(F_ALIAS_GHOST_ELEMENT)),
      "n10b — an unresolved element type of a well-formed `array<T>` is one row, once",
    ).toEqual([line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "Ghost"]]))]);
    expect(
      diagLines(parse(F_ALIAS_GHOST_TWICE)),
      "n10b — the same unresolved name in two arms is still one diagnostic",
    ).toEqual([line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "Ghost"]]))]);
  });
});

// ===========================================================================
// (n) REVIEW ROUND 2, F3 — same-line residue whose text RESOLVES.
// `schema X = Cat Cat` (with `Cat` declared) captures one arm and leaves the
// second `Cat` to the statement loop, where it reduces to theta's silent no-op
// class: a bare declared-name expression statement, which the language
// accepts with no diagnostic wherever it is written (the control in n11).
// That STATEMENT-level silence is unchanged — bug 0042 does not touch the
// general same-line statement permissiveness (`42 43` and friends), which is
// wider than this boundary and out of scope. The DECLARATION is no longer
// silent about having severed a token onto that path:
// `theta/parse/malformed-alias-rhs` (bug 0042 §Fix) reports a right-hand side
// that is not an `AliasRhs ::= Type ("|" Type)*` from the declaration's own
// extent, once per declaration, before the residue is ever parsed as a
// statement. The UNRESOLVABLE arrangement stays loud through the ordinary
// name checks, alongside the same declaration-level report.
// ===========================================================================

describe("bug 0033 (n) — the residue STATEMENT is the language's no-op class, the DECLARATION is reported", () => {
  it("n11: `schema X = Cat Cat` keeps one arm, one no-op expression statement, and the declaration's own report", () => {
    const doc = parse(F_RESIDUE_RESOLVABLE);
    expect(
      armsOf(doc, "X", "n11"),
      "n11 — the field-boundary stop ends the arm at the first value-ish token with no " +
        "intervening `|`, so the arm is the declaration's Type",
    ).toEqual(["Cat"]);
    expect(
      stmtSig(doc),
      `n11 — the residue is a statement, not a lost token; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:X", "expr", "let:a"]);
    expect(
      diagLines(doc),
      "n11 — the DECLARATION is reported, the STATEMENT is not: the severed `Cat` is still a " +
        "bare declared-name expression statement, silent wherever it is written (control below), " +
        "but `schema X = Cat Cat` is not an `AliasRhs` the grammar derives, and " +
        "`finishAliasSchema` reports that from the declaration's own extent (bug 0042 §Fix) " +
        "rather than staying silent about it",
    ).toEqual([line(MALFORMED_ALIAS_RHS, msg(MALFORMED_ALIAS_RHS, [["<X>", "X"]]))]);
    expect(
      diagLines(parse(F_BARE_DECLARED_NAME)),
      "n11 CONTROL — the same statement written on its own line, away from any declaration " +
        "shape, is equally silent; that is the class the residue STATEMENT falls into — no " +
        "declaration sits behind it for `malformed-alias-rhs` to report",
    ).toEqual([]);
    expect(
      stmtSig(parse(F_BARE_DECLARED_NAME)),
      "n11 CONTROL — and it is the same statement kind",
    ).toEqual(["schema:Cat", "expr", "let:a"]);
  });

  it("n11 (other half): the UNRESOLVABLE arrangement stays loud, and the declaration's report joins it", () => {
    // The residual is confined to what a STATEMENT does with text that
    // resolves. `schema X = Ghost Ghost` fails on the arm
    // (`unresolved-named-type`, the alias-RHS position of the widened registry
    // row), on the declaration's own shape (`malformed-alias-rhs`, bug 0042
    // §Fix), and on the residue statement (`unknown-identifier`) — three
    // independent checks over the same input, none of them silent.
    expect(
      diagLines(parse(F_RESIDUE_UNRESOLVABLE)),
      "n11 — an unresolvable arm, a malformed declaration and an unresolvable residue are each " +
        "reported, in source-position order: the arm's name resolution anchors at the whole " +
        "declaration (the earliest position), the malformed-shape report and the residue's name " +
        "resolution both anchor at the severed `Ghost` (a tied position, where the parser's own " +
        "diagnostics sort ahead of the identifier-resolution walk's)",
    ).toEqual([
      line(UNRESOLVED, msg(UNRESOLVED, [["<name>", "Ghost"]])),
      line(MALFORMED_ALIAS_RHS, msg(MALFORMED_ALIAS_RHS, [["<X>", "X"]])),
      line(UNKNOWN_IDENT, msg(UNKNOWN_IDENT, [["<name>", "Ghost"]])),
    ]);
  });
});

// ===========================================================================
// (o) REVIEW ROUND 3, F1 — an alias CYCLE that reaches the type layer.
// `collectTypeEnv` (type-layer-checks.ts) publishes every alias declaration as
// a TRANSPARENT `alias` entry, and TYPE-11 unfolding is total only over an
// ACYCLIC alias graph: `unfoldAlias` (type-compat.ts) walks `decl.rhs` in a
// `while`, and `decide`, `classifyIndexReceiver`, `classifyReceiver` and
// `classifyOperand` recurse through the same edge. `checkTypeLayer` runs in the
// SAME parse as the structural pass that reports the cycle, ungated by it, so
// "alias cycles are rejected upstream" was never a load-path guarantee — a
// cyclic entry made the load DIVERGE rather than report:
//
//   schema X = Y / schema Y = X / let a: X = 1  → `unfoldAlias` spins forever
//                                                 (the vitest worker dies)
//   schema X = Y | string / schema Y = X / …    → RangeError: Maximum call
//                                                 stack size exceeded, THROWN
//                                                 out of parseThetaDocument
//
// The precondition is now made true where the env is BUILT, one point covering
// all five consumers: an alias that participates in a cycle is OMITTED from the
// `TypeEnv` entirely — no entry of any kind — so every unfolding walk ends at
// that member and every question about it answers `"unknown"`, the
// silent-and-deferred disposition any type past the parser's static view takes.
// OMISSION rather than a nominal entry is what keeps the guard from refusing
// programs the specification admits: a nominal cycle member relates by identity
// alone and turns the legal recursion of group (t) below
// (`schema X = integer | array<X>` with `let v: X = 3`) into a spurious
// `let-rhs-type-mismatch`. The cycle's own rejection is untouched either way:
// `theta/parse/type-alias-cycle` comes from the structural pass over the same
// declarations, and it reports the pure-alias cycles the language forbids, not
// the guarded recursion it allows.
//
// Each cell asserts BOTH halves: the parse RETURNED (the declarations are in
// the statement list at all), and the cycle was reported.
// ===========================================================================

describe("bug 0033 (o) — a cyclic alias is reported, not diverged on", () => {
  it("n12: a named-chain cycle under a typed `let` loads and reports type-alias-cycle", () => {
    const doc = parse(F_CYCLE_TYPED_LET);
    expect(
      stmtSig(doc),
      "n12 — the parse RETURNED with both declarations and the typed `let` intact; before the " +
        "fix `unfoldAlias` never terminated on this input and the process died",
    ).toEqual(["schema:X", "schema:Y", "let:a"]);
    expect(
      diagLines(doc),
      "n12 — the cycle is REPORTED (schemas.md:143) and is the WHOLE report: the typed `let` " +
        "asks about a name the env omits, which answers `unknown` — silent, deferred to the " +
        "runtime AJV net — rather than adding a second diagnostic",
    ).toEqual([line(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "X \u2192 Y \u2192 X"]]))]);
  });

  it("n13: the UNION-ARM spelling of the same cycle loads (no RangeError escapes the parse)", () => {
    // The recursion half: with `Y` inside a union arm the cycle is reached
    // through `decide`'s TYPE-6 arm rather than `unfoldAlias`'s `while`, so the
    // divergence was a stack overflow thrown out of `parseThetaDocument` — a
    // caller could not even collect diagnostics from it.
    const doc = parse(F_CYCLE_UNION_ARM_TYPED_LET);
    expect(
      stmtSig(doc),
      "n13 — the parse RETURNED; a thrown RangeError leaves no document at all",
    ).toEqual(["schema:X", "schema:Y", "let:a"]);
    expect(
      codes(doc.diagnostics),
      `n13 — the cycle is reported; actual=${JSON.stringify(diagLines(doc))}`,
    ).toContain(ALIAS_CYCLE);
    expect(
      diagLines(doc),
      "n13 — same disposition as n12: the cycle alone, the typed `let` silent against the " +
        "omitted member",
    ).toEqual([line(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "X \u2192 Y \u2192 X"]]))]);
  });

  it("n14: the SELF-cycle `schema X = X` loads and reports the one-node path", () => {
    // The shortest cycle, and the one a chain-length bound would miss: the
    // first unfolding step already closes it.
    const doc = parse(F_CYCLE_SELF_TYPED_LET);
    expect(stmtSig(doc), "n14 — the parse RETURNED").toEqual(["schema:X", "let:a"]);
    expect(
      diagLines(doc),
      "n14 — the rendered path closes back on the entry node, one hop long, and the typed " +
        "`let` against the omitted member adds nothing to it",
    ).toEqual([line(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "X \u2192 X"]]))]);
  });

  it("n15: a member access on a cycle-typed `fn` parameter loads (the second consumer)", () => {
    // `unfoldAlias` is not the only walker of `NamedDecl.rhs`: the A2
    // unknown-method check classifies its receiver through `classifyReceiver`,
    // which recurses on the same edge. A `fn` parameter is the position that
    // carries a bare `named` type into it (`walkFn` binds the annotation), so
    // this cell reaches a consumer the typed-`let` cells do not.
    const doc = parse(F_CYCLE_MEMBER_ACCESS);
    expect(stmtSig(doc), "n15 — the parse RETURNED with the `fn` intact").toEqual([
      "schema:X",
      "schema:Y",
      "fn:f",
      "let:a",
    ]);
    expect(
      diagLines(doc),
      "n15 — the omitted receiver classifies as `unknown`, so the A2 member check defers and " +
        "the cycle is the whole report",
    ).toEqual([line(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "X \u2192 Y \u2192 X"]]))]);
  });

  it("CONTROL n16: the same shape WITHOUT a cycle keeps alias transparency", () => {
    // The omission is scoped to cycle participants: an ordinary alias still
    // unfolds (TYPE-11), so `p: X` reaches `Y`'s object fields and the access
    // is silent for the transparent reason rather than the deferred one.
    // A red here means the guard omitted more than the cycle.
    expect(
      diagLines(parse(F_ALIAS_MEMBER_ACCESS)),
      "n16 — an acyclic alias to an object schema is unaffected by the cycle guard",
    ).toEqual([]);
  });
});

// ===========================================================================
// (p) REVIEW ROUND 3, F2 — the stop-set siblings of groups (g) and (l). `!`
// heads a unary-not expression statement and appears NOWHERE in the type
// grammar, so it can neither start nor continue a `Type` — the `(` / `[`
// argument exactly, not `-`'s (whose stop is completed-arm-only — group (u)).
// `match`, `invoke`, `Ok` and `Err` are the expression-statement heads
// among the reserved keywords (lexer.ts `reservedKeywords`) and name no type,
// so at an ARM START they prove the same swallowed boundary newline `let`
// proves. `true` / `false` / `null` stay capturable: they are `LiteralType`
// atoms.
// ===========================================================================

describe("bug 0033 (p) — `!` and the expression-statement keywords end the capture", () => {
  it("n17: `!true` after a `>`-tailed right-hand side is not eaten by the arm", () => {
    // Destructive arrangement: the arm grew to `array<integer>!`, the negation
    // silently vanished, and what remained was the bare `true` — a change of
    // MEANING with no diagnostic anywhere.
    const doc = parse(F_GENERIC_THEN_BANG);
    expect(
      armsOf(doc, "X", "n17"),
      "n17 — `!` sits at a completed-arm boundary and no `Type` continues with it",
    ).toEqual(["array<integer>"]);
    expect(
      stmtSig(doc),
      `n17 — the statement survives as a form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "expr"]);
    expect(
      diagLines(doc),
      "n17 — a well-formed alias followed by a well-formed expression statement",
    ).toEqual([]);
  });

  it("n18: an `invoke` statement at an arm start survives with the shapeless-RHS disposition", () => {
    // `=` is a trailing trigger, so the capture opens directly on `invoke` and
    // absorbed `invoke<string>` as the first arm — the invocation was gone and
    // the theta loaded with the alias silently redefined to it.
    const doc = parse(F_EMPTY_RHS_THEN_INVOKE);
    expect(
      stmtSig(doc),
      `n18 — the invocation is a statement of its own; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "invoke"]);
    expect(
      diagLines(doc),
      "n18 — a shapeless right-hand side takes group (e)'s disposition, and nothing else fires",
    ).toEqual([line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]]))]);
  });

  it("n19: a `match` statement at an arm start survives, with no invented type name", () => {
    // The absorbed keyword was reported as a TYPE: `unresolved named type
    // 'match'`, plus `bare-object-literal` for the arm block the statement loop
    // then met — two diagnostics about a program the author never wrote.
    const doc = parse(F_EMPTY_RHS_THEN_MATCH);
    expect(
      codes(doc.diagnostics),
      `n19 — \`match\` is a keyword, never a NamedType; actual=${JSON.stringify(diagLines(doc))}`,
    ).not.toContain(UNRESOLVED);
    expect(
      stmtSig(doc),
      `n19 — the match survives as an expression form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X", "expr"]);
    expect(diagLines(doc), "n19 — the shapeless right-hand side alone").toEqual([
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
    ]);
  });

  it("n20: `Ok(...)` and `Err(...)` statements at an arm start survive", () => {
    // Both were captured as one-token arms and reported as unresolved type
    // names; the `Result` constructors are expression heads, and the type
    // grammar spells the type `Result<T, E>`.
    for (const [label, source] of [
      ["n20 Ok", F_EMPTY_RHS_THEN_OK],
      ["n20 Err", F_EMPTY_RHS_THEN_ERR],
    ] as const) {
      const doc = parse(source);
      expect(
        stmtSig(doc),
        `${label} — the constructor call survives as a form; diagnostics=${JSON.stringify(diagLines(doc))}`,
      ).toEqual(["schema:X", "expr"]);
      expect(
        diagLines(doc),
        `${label} — the shapeless right-hand side alone, with no unresolved TYPE named after ` +
          "an expression keyword",
      ).toEqual([line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]]))]);
    }
  });

  it("CONTROL n21: the literal-type keywords are still captured as arms", () => {
    // The other side of the keyword cut: `true` / `false` / `null` ARE Type
    // atoms (grammar.md §"Type grammar", `LiteralType`), so a stop on them
    // would truncate a legal right-hand side.
    const doc = parse(F_LITERAL_KEYWORD_ARMS);
    expectLoadsClean(doc, "n21 — a literal-type union alias");
    expect(
      armsOf(doc, "X", "n21"),
      "n21 — both literal keywords are arms of the declaration",
    ).toEqual(["true", "null"]);
  });
});

// ===========================================================================
// (q) REVIEW ROUND 3, F3 — what the by-clause check actually cuts on.
// `checkByClause` classifies by SHAPE (an object body, or the arm count
// against `UnionRhs ::= Type ("|" Type)+`), not by whether the arms form a
// discriminated union, so a two-arm PRIMITIVE union under a `by` is admitted.
// ===========================================================================

describe("bug 0033 (q) — a `by` clause over a two-arm primitive union", () => {
  it("n22: `schema X by f = string | integer` loads clean — the UNDECIDED disposition", () => {
    // PINNED AS THE CURRENT DISPOSITION, NOT AS A SPECIFIED ONE, exactly as i2
    // is. Two arms satisfy `UnionRhs`, so `by-on-object-schema` does not fire;
    // the arms are primitives, so `checkDiscriminatedUnion` never runs over
    // them (it is scoped to unions whose arms all resolve to declared object
    // schemas) and no discriminator code fires either. schemas.md §Discriminated
    // unions prescribes no code for a `by` clause over a non-object union, so
    // none is invented here — and the `by-on-object-schema` registry row must
    // not claim this input, which is why its Trigger reads as the shape cut
    // (object body / arm count) rather than as "a declaration that is not a
    // discriminated union". If the specification later decides this case, this
    // cell is the one to change.
    expectLoadsClean(
      parse(F_BY_PRIMITIVE_UNION),
      "n22 — an explicit by-clause over two primitive arms",
    );
  });
});

// ===========================================================================
// (r) REVIEW ROUND 3, F4 — a cycle's diagnostic is anchored IN the cycle.
// `detectTypeAliasCycles` takes one whole-graph site, so every cycle in a file
// reported at the first alias declaration — routinely a declaration that
// participates in no cycle. The optional per-node site map fixes the anchor
// without moving the seam's default (tests/disc-unions-recursion.test.ts drives
// the two-argument form and is untouched).
// ===========================================================================

describe("bug 0033 (r) — the cycle diagnostic's range names a participating declaration", () => {
  it("n23: an unrelated leading alias does not absorb the cycle's range", () => {
    const doc = parse(F_CYCLE_AFTER_UNRELATED_ALIAS);
    const cycle = doc.diagnostics.find((d) => d.code === ALIAS_CYCLE);
    // `range` is optional on `Diagnostic` (file-only sites omit it), so an
    // absent cycle or an unlocated one FAILS here naming which half is missing
    // rather than reading as a pass through an optional chain.
    if (cycle?.range === undefined) {
      throw new Error(
        `n23: the cycle must be reported AND located (DIAG-1); actual=${JSON.stringify(diagLines(doc))}`,
      );
    }
    const unrelatedLine = declLine(doc, "A", "n23");
    const participantLine = declLine(doc, "X", "n23");
    // The fixture is the three-line frontmatter fence plus one body line per
    // declaration, so `schema A` is line 4 and `schema X` line 5. Pinned
    // literally as well as relatively: a range that drifts to a THIRD line is
    // as wrong as one that stays on `A`.
    expect([unrelatedLine, participantLine], "n23 — the fixture's own geometry").toEqual([
      4, 5,
    ]);
    expect(
      cycle.range.start.line,
      "n23 — DIAG-1: the range locates the reported construct. `schema A` participates in no " +
        "cycle, so anchoring there points the author at a declaration that is not the subject",
    ).not.toBe(unrelatedLine);
    expect(
      cycle.range.start.line,
      "n23 — the anchor is the first node of the rendered path (`X → Y → X`), which is a " +
        "declaration IN the cycle",
    ).toBe(participantLine);
  });
});

// ===========================================================================
// (s) REVIEW ROUND 3 — the reviewer's dangling-`|` observation. `schema X =
// Cat |` ends on a top-level `|` with no arm behind it; the capture stops at
// the following statement's head and the empty trailing arm is dropped, so
// the declaration loads as the one-arm alias `Cat`. That capture and its
// lowering are unchanged (a shared-mechanism question bug 0043 owns, not this
// one): `finishAliasSchema` now reports the shape itself as malformed — a
// trailing `|` with no `Type` behind it is an EMPTY ARM POSITION, not a
// well-formed one-arm alias (`theta/parse/malformed-alias-rhs`, bug 0042
// §Fix) — which the object form's field-type position does not reach.
// ===========================================================================

describe("bug 0033 (s) — a dangling `|` is reported at the alias position, silent at the field position", () => {
  it("n24: `schema X = Cat |` is a one-arm alias the declaration reports as malformed, and the field position stays silent", () => {
    const doc = parse(F_DANGLING_PIPE);
    expect(
      armsOf(doc, "X", "n24"),
      "n24 — the empty arm behind the trailing `|` is dropped by the same top-level split " +
        "`lowerTypeSource` re-applies, so the declaration carries one arm",
    ).toEqual(["Cat"]);
    expect(
      stmtSig(doc),
      `n24 — the following statement is intact; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:Cat", "schema:X", "let:a"]);
    expect(
      diagLines(doc),
      "n24 — WHY the declaration is reported: `splitTopLevelSegments` keeps the empty segment " +
        "behind the trailing `|` that the non-empty arm filter drops, so the segment count (2) " +
        "disagrees with the arm count (1) — an empty arm position, anchored at the declaration's " +
        "own range because the dropped segment was never a token to point at",
    ).toEqual([line(MALFORMED_ALIAS_RHS, msg(MALFORMED_ALIAS_RHS, [["<X>", "X"]]))]);
    expect(
      diagLines(parse(F_FIELD_DANGLING_PIPE)),
      "n24 CONTROL — `schema S { a: string | }`, the identical dangling `|` in the object " +
        "form's field-type position: still silent and still lowers permissively — the " +
        "malformed-right-hand-side rule is scoped to the `schema X = …` declaration and does " +
        "not reach a field type",
    ).toEqual([]);
  });
});

// ===========================================================================
// (t) REVIEW ROUND 4, F1 — the cycle guard must not REFUSE legal recursion.
// Round 3's guard registered every cycle participant as a nominal
// `{ kind: "object-schema" }`, which relates by identity alone: `let v: X = 3`
// under `schema X = integer | array<X>` then answered `incompatible` and the
// theta was REJECTED at load. The specification admits that program —
// schemas.md:143 forbids the PURE-alias cycle (`schema X = Y` / `schema Y = X`),
// not recursion guarded by a structural constructor, and schema-subset.md's
// lowering emits the self-`$ref` for it; TYPE-11 unfolds `X` and TYPE-5 widens
// `3` into the `integer` arm. The guard now OMITS the participant from the
// `TypeEnv` instead, so every question about it answers `"unknown"` — silent,
// deferred to the runtime AJV net, which group (t)'s middle cell drives for
// real rather than assuming.
//
// Group (o)'s crash protection is unchanged: n12–n15 still terminate, and the
// omitted entry is what ends their walks.
// ===========================================================================

describe("bug 0033 (t) — legal recursion is admitted, not refused", () => {
  it("n25: `schema X = integer | array<X>` + `let v: X = 3` loads with NO diagnostic", () => {
    // The load refusal this cell forbids: `theta/parse/let-rhs-type-mismatch`
    // (expected X, got integer) — a nominal cycle member's identity-only
    // relation, manufactured for a program TYPE-11 + TYPE-5 admit. An omitted
    // member answers `"unknown"` at every `decide` site
    // (type-compat.ts's `env[name] === undefined` arms), so the typed `let` is
    // silent and the runtime AJV net remains the judge.
    const doc = parse(F_RECURSIVE_UNION_TYPED_LET);
    expect(
      armsOf(doc, "X", "n25"),
      "n25 — the recursive right-hand side is captured as its two arms",
    ).toEqual(["integer", "array<X>"]);
    expectLoadsClean(
      doc,
      "n25 — recursion guarded by `array<…>` is not a pure-alias cycle (schemas.md:143), so " +
        "neither the structural pass nor the type layer may refuse it",
    );
  });

  it("n26: `schema X = array<X>` lowers to a self-`$ref` array real AJV enforces", () => {
    // The reviewer's own probe, pinned: the observable is the `$defs` fragment
    // AND the value set it admits. `items` refs the enclosing definition, so
    // the constraint is "an array, at every depth" — `[]` and `[[]]` in, `3`
    // out. The param is named `a` because `aliasDef` / `paramsSrc` key on that
    // name; the name is immaterial to both observables.
    const loaded = loadParams("n26", P_RECURSIVE_ARRAY);
    const def = aliasDef(loaded, "X", "n26");
    expect(
      def,
      "n26 — schema-subset.md:76 — the element type is the alias itself, so it emits the " +
        "root-absolute pointer back to its own `$defs` entry",
    ).toEqual({ type: "array", items: { $ref: "#/$defs/X" } });
    const { validator, emitted } = ajv();
    const compiled = validator.compile(loaded.loweredSchema);
    expect(
      compiled.validate({ a: [] }).ok,
      "n26 — the empty array is the recursion's base case; a `$ref` AJV cannot resolve would " +
        "fail the compile instead",
    ).toBe(true);
    expect(
      compiled.validate({ a: [[]] }).ok,
      "n26 — one level of nesting exercises the self-reference itself",
    ).toBe(true);
    expect(
      compiled.validate({ a: 3 }).ok,
      "n26 — a non-array is rejected: the lowering is concrete, not the permissive `{}`",
    ).toBe(false);
    expect(
      emitted.map((d) => d.code),
      "n26 — no slug-collision diagnostic: one compile of one document",
    ).toEqual([]);
  });

  it("n27: `schema X = array<X>` + `let a: X = []` loads with NO diagnostic", () => {
    // The single-arm spelling of n25, and the shape whose typed `let` the round-3
    // guard also refused. `[]` against an omitted name is `"unknown"`, not a
    // mismatch.
    expectLoadsClean(
      parse(F_RECURSIVE_ARRAY_TYPED_LET),
      "n27 — a typed `let` whose annotation names a recursive alias",
    );
  });
});

// ===========================================================================
// (u) REVIEW ROUND 4, F2 — `-` at a COMPLETED-arm boundary. `-` was in neither
// stop set, so after a `>`-tailed right-hand side the arm grew across the
// swallowed boundary newline and absorbed the whole negation statement behind
// it (`array<integer>-a`, statement gone, no diagnostic) — group (l)'s
// destruction, one token class along. It cannot join the punct set wholesale:
// at an ARM START `-` is captured rather than stopped on, so the stop is
// scoped to `armComplete && !atArmStart` and the arm-start position is
// unchanged by this round.
// ===========================================================================

describe("bug 0033 (u) — `-` after a completed arm ends the capture", () => {
  it("n28: `-a` after a generic-tailed alias survives as its own statement", () => {
    const doc = parse(F_GENERIC_THEN_NEG);
    expect(
      armsOf(doc, "X", "n28"),
      "n28 — the arm is the declaration's Type and nothing after it; a capture that ran on " +
        "shows up here as `array<integer>-a`",
    ).toEqual(["array<integer>"]);
    expect(
      stmtSig(doc),
      `n28 — the negation survives as a form; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["let:a", "schema:X", "expr"]);
    expect(
      diagLines(doc),
      "n28 — a well-formed alias followed by a well-formed negation statement; `let a = 1` " +
        "leads so the negated name resolves and no unknown-identifier joins in",
    ).toEqual([]);
  });

  it("CONTROL n29: an ARM-START `-` is captured, not stopped on", () => {
    // The other side of the cut, and the reason the stop is not unconditional:
    // were `-` a stop at every boundary, these right-hand sides would capture
    // NOTHING and the declarations would take the shapeless-RHS disposition
    // (`theta/parse/empty-schema-body`, group (e)). The arm list below is
    // non-empty, which is that discrimination.
    //
    // WHAT IS PINNED AND WHAT IS NOT: the arm reads `-` and not `-1`. The
    // trailing `1` is taken by the FIELD-BOUNDARY stop (`parseType`'s
    // `stopAtFieldBoundary` arm: a value-ish token whose predecessor is not
    // `|` starts the next field), which is shared with the object form and
    // predates this round — the object-field control below shows the same
    // source faring no better there, dropping the field list outright. Nor is
    // `-1` a `Type` the grammar spells: `LiteralType ::= STRING | NUMBER |
    // BOOLEAN | NULL` (grammar.md:102) has no unary-minus alternative, which
    // belongs to the VALUE sublanguage's `PrimitiveLit` (:22). So this cell
    // pins the arm-start disposition as observed; making `-1` capture whole
    // would be a grammar change in a shared path, not this fix.
    const single = parse(F_NEG_LITERAL_SINGLE);
    expect(
      armsOf(single, "X", "n29"),
      "n29 — `schema X = -1`: the arm-start `-` joined the capture, so the right-hand side " +
        "is not empty",
    ).toEqual(["-"]);
    expect(
      diagLines(single),
      `n29 — the captured arm is not the right-hand side the author wrote: the field-boundary ` +
        `stop severed the \`1\`, and \`finishAliasSchema\` reports that same-line residue from the ` +
        `declaration's own extent (bug 0042 §Fix) rather than staying silent about it. stmts=` +
        `${JSON.stringify(stmtSig(single))}`,
    ).toEqual([line(MALFORMED_ALIAS_RHS, msg(MALFORMED_ALIAS_RHS, [["<X>", "X"]]))]);
    const unioned = parse(F_NEG_LITERAL_ARMS);
    expect(
      armsOf(unioned, "X", "n29"),
      "n29 — `schema X = -1 | null`: the same arm-start capture; the field-boundary stop ends " +
        "it at the `1`, so the `| null` behind it is residue rather than a second arm",
    ).toEqual(["-"]);
    expect(
      diagLines(unioned),
      "n29 — the malformed-right-hand-side report joins the orphaned `|`'s own stray-token " +
        "diagnostic rather than replacing it: the severed `1` is the residue head the " +
        "declaration's own check reads (and sorts first, being the earlier position), and the " +
        "`| null` behind it keeps its pre-existing disposition as a stray token in statement " +
        "position",
    ).toEqual([
      line(MALFORMED_ALIAS_RHS, msg(MALFORMED_ALIAS_RHS, [["<X>", "X"]])),
      line(
        "theta/parse/unsupported-feature",
        "unsupported syntactic feature: stray '|' in statement position",
      ),
    ]);
    expect(
      diagLines(parse(F_FIELD_NEG_LITERAL)),
      "n29 CONTROL — `schema S { a: -1 }`, the identical `-1` in the object form's field-type " +
        "position: the field list is dropped whole and the body reads as empty. No `Type` " +
        "position in the implementation carries a negative numeric literal, and the " +
        "malformed-right-hand-side rule is a declaration-shape question this field position " +
        "never reaches",
    ).toEqual([line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "S"]]))]);
  });
});
