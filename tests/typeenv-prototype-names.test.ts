import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { Stmt, ThetaDocument } from "../src/parser/theta-document";
import {
  checkCompatible,
  checkLetRhsCompat,
  classifyIndexReceiver,
  type CompatType,
  type NamedDecl,
  type TypeEnv,
} from "../src/parser/type-compat";
import { collectTypeEnv } from "../src/parser/type-layer-checks";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type { ThetaFixture } from "../src/extension/factory";
import { parseDoc } from "./helpers/e2e-s1";

// Bug 0038 — `collectTypeEnv` builds the `TypeEnv` as a plain `{}`, so every
// consumer that resolves a `NamedType` by reading `env[name]` gets a JS value
// instead of `undefined` for the twelve `Object.prototype` own property names.
// The name is then treated as a DECLARED type
// (docs/bugs/0038-typeenv-prototype-member-names-resolve-as-declared-types.md).
//
// THE LIVE SITE. The construction is `collectTypeEnv`
// (src/parser/type-layer-checks.ts:282, `const env: Record<string, NamedDecl> =
// {}`), whose two writes at :298 / :303–306 are the only entries any
// declaration ever puts in. The eight reads are the whole consumer surface:
// `unfoldAlias` (src/parser/type-compat.ts:149), `decide`'s three TYPE-10 arms
// (:238, :242, :252), `classifyIndexReceiver` (:365), `classifyOperand`
// (src/parser/type-layer-checks.ts:139), `classifyReceiver` (:182), and
// `declaredFieldsOf` (:906, the one read already shape-guarded).
//
// TWO SYMPTOMS, ONE MECHANISM.
//   1. `decide` tests `env[name] === undefined` only, so a prototype value
//      passes as a present declaration and the relation answers "incompatible"
//      where the operand is statically unresolvable. `let c: constructor = 3`
//      emits `theta/parse/let-rhs-type-mismatch` against a type no declaration
//      declares.
//   2. The three classifiers branch on `decl.kind === "object-schema"` and
//      otherwise recurse into `decl.rhs`. A prototype value has neither, so the
//      recursion reads `.kind` of `undefined` and throws a `TypeError` out of
//      `parseThetaDocument`. `let r = 1 + constructor` is a two-line body with
//      no `schema` and no `fn`, and it takes down the whole compose pass.
//
// THE CONTRACT UNDER TEST (the bug's §Fix, SETTLED — not one step wider).
// §Fix null-prototypes the record at :282 AND own-key-guards the eight reads
// behind one exported `resolveNamed(env, name)` in type-compat.ts, so a
// prototype member name answers `undefined` → "unknown" → deferred, exactly as
// any other undeclared name does. Post-fix static observables at the
// `parseThetaDocument` boundary, every one DERIVED by measurement rather than
// predicted (see HOW THE POST-FIX ROWS WERE DERIVED below):
//
//   w1–w6  silent loads, matching controls c1/c2/c3 byte-for-byte
//   w7/w8  `theta/parse/unresolved-named-type` ALONE, matching c4/c5
//   t1     `theta/parse/unknown-identifier: unknown identifier 'constructor'`
//   t2     `unknown-identifier: unknown identifier 'toString'`
//   t3     `unknown-identifier: unknown identifier 'constructor'`
//   t4     `unknown-identifier: unknown identifier 'valueOf'`
//   t5/t6  silent
//   t7     `unresolved-named-type: unresolved named type 'constructor'`
//   t8/t9  silent
//   t10    `theta/parse/unknown-method: unknown method 'toString' on type string`
//   t11    `unresolved-named-type: unresolved named type 'constructor'`
//   L1     both clean thetas register; the crashing file drops on its own
//          merits with its own author-visible notification — L2's shape
//   c1–c11 byte-unchanged
//   engine `checkCompatible` → "unknown", `checkLetRhsCompat` → no diagnostic,
//          `classifyIndexReceiver` → "unknown", on a plain `{}` env AND on an
//          `Object.create(null)` env alike
//
// WHERE THE BUG DOC IS WRONG. §Fix's *Post-fix observables* bullet predicts
// "t8–t11 silent as their `zzz`-named counterparts are". Measured, t8 and t9
// are silent but t10 and t11 are NOT, and neither are their `zzz`-named
// counterparts: `"x".zzz() + 1` reports `unknown-method` and `Zzz { a: 1 }`
// reports `unresolved-named-type` (bug 0025's constructor-name gate). The
// prediction's premise — "as their counterparts are" — is the correct rule; the
// premise's value was mis-stated. This file asserts the measured counterpart
// disposition for all four rows, so t10 and t11 lock the SAME rule the doc
// states rather than the wrong value it derived from it.
//
// WHERE THE BUG DOC IS UNDER-SPECIFIED. §Reproduction probes ten of the twelve
// `Object.prototype` own names individually and claims the other two
// (`__defineSetter__`, `__lookupSetter__`) "by mechanism, not by measurement".
// Group (b) enumerates `Object.getOwnPropertyNames(Object.prototype)` and
// measures all twelve; the two unmeasured names behave identically to the ten.
//
// SPEC ANCHORS (line numbers measured at this HEAD):
//   - docs/spec_topics/type-system.md:48 — §Unresolvable operands: "When either
//     side of a compatibility check is past the parser's static view […] the
//     parse-time check is skipped and the runtime AJV check is the safety net."
//     This is the disposition every w- and t-row must reach.
//   - docs/spec_topics/type-system.md:50 — TYPE-9 states the same bound
//     positively for the site w1 fires at: each of the three sites "reports its
//     own parse-time diagnostic on a static failure (`T₁ ⋢ T₂`, both operands
//     statically resolvable)". :52 (TYPE-10) and :54 (TYPE-11) are the arms
//     `decide` and `unfoldAlias` implement over `env[name]`.
//   - docs/spec_topics/grammar.md:98 — `NamedType ::= Ident`, resolved
//     whole-file over the body's top-level declarations
//     (docs/spec_topics/diagnostics/code-registry-parse.md:89). A host
//     language's object prototype is not among the sources.
//   - docs/spec_topics/diagnostics/code-registry-parse.md rows :40
//     (`array-element-type-mismatch`, w6's second emission), :46
//     (`object-field-type-mismatch`, w7's wrong emission), :54
//     (`let-rhs-type-mismatch`, whose Trigger fires only "where the RHS type is
//     statically resolvable" — the qualifier w1–w6 and w8 violate), :61
//     (`unknown-identifier`), :63 (`unknown-method`), :89
//     (`unresolved-named-type`, the checker that answers `constructor`
//     correctly in the SAME parse the type layer answers it wrongly in).
//   - docs/spec_topics/diagnostics/code-registry-load.md:10 —
//     `theta/load/extension-compose-failed`, the only registered code the
//     t-rows can surface under, whose Trigger is a host-level compose failure
//     and whose Hint reads "the compose pass failed before any theta registered
//     on this pass". Group (d) is the measurement that a two-line body reaches
//     it.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:71 — DIAG-1: "tests are
//     entitled to assert on the specific code at every documented diagnostic
//     site", which a whole-pass `TypeError` denies. :74 — DIAG-4: the *Message*
//     column is normative and every expected string below is sourced from it
//     through `registryMessage`, never copied prose.
//   - docs/spec_topics/governance/source-language-stability.md:9 — GOV-15's
//     loads-cleanly predicate selects inputs emitting no `E`-severity
//     diagnostic. Every w-row emits an `E` at this HEAD and every t-row fails to
//     load, so the affected inputs are outside the equivalence promise and the
//     fix needs no carve-out.
//
// TIER — UNIT, offline, provider-free. The whole fix is witnessable at the
// `parseThetaDocument` boundary (groups a/b/c/e), at three exported engine
// entry points (group f), at the exported `collectTypeEnv` (group g), and
// through one in-process drive of the shipped composition root over a
// `mkdtemp` discovery root (group d). Nothing on this
// path crosses a provider, a model, a child process, or the network, so no
// integration test and no live test applies — the bug's §Fix says so in the
// same words ("Test witness — unit, offline, provider-free").
//
// HARNESS — the house parse driver `parseDoc` (tests/helpers/e2e-s1.ts:39) over
// the real `parseThetaDocument` with inert offline seams, the same entry point
// tests/ctor-field-type-check.test.ts (bug 0031, the FIXED sibling record one
// level down) and tests/ctor-unresolved-schema-name.test.ts (bug 0025) use. The
// load group mirrors the temp-root pattern at
// tests/ctor-unresolved-schema-name.test.ts:511. Every fixture is the bug doc's
// table row verbatim, `mode: prompt`.
//
// HOW THE POST-FIX ROWS WERE DERIVED. Each expectation above was measured, not
// guessed: `src/parser/type-layer-checks.ts:282` was temporarily changed to
// `Object.create(null)`, every row re-probed, and the file restored byte-exact
// (`git hash-object` identical before and after). The engine rows of group (f)
// are the doc's own §Reproduction *Engine rows* table, which measures the same
// flip directly on the three exported entry points.
//
// NO SILENT SKIPPING (CLAUDE.md). Nothing here early-returns or conditionally
// skips. A missing registry row throws naming the row; the prototype-name sweep
// asserts its own enumeration is non-empty and carries both sentinel names
// before it runs; the load group asserts the clean control thetas registered
// before it asserts anything about the crashing one.
//
// SCOPE. Enforcing the PascalCase rule at `NamedType` reference positions,
// `theta/parse/fn-arg-type-mismatch` being unreachable, recording `enum`
// declarations in the `TypeEnv`, and other prototype-bearing parser records are
// all §Non-goals of this bug and are not asserted here. The declared-FIELD
// record one level down is bug 0031 and its prototype pins live at
// tests/ctor-field-type-check.test.ts:522–593; these are their env-level
// counterparts.

// ===========================================================================
// The contract under test — registered codes and their normative messages
// (DIAG-4). Every code below already exists in the registry: the fix changes
// which inputs reach which row, and adds no row.
// ===========================================================================

const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
const OBJECT_FIELD_CODE = "theta/parse/object-field-type-mismatch";
const UNRESOLVED_NAMED_CODE = "theta/parse/unresolved-named-type";
const UNKNOWN_IDENTIFIER_CODE = "theta/parse/unknown-identifier";
const UNKNOWN_METHOD_CODE = "theta/parse/unknown-method";
// The declaration-position case rule. Group (h) asserts it because it is the
// diagnostic that bounds the `__proto__` write hazard, and the bound is the
// `E` severity that denies registration rather than any grammar refusal.
const SCHEMA_CASE_CODE = "theta/parse/schema-case-mismatch";

interface RegistryRow {
  readonly code: string;
  readonly namespace: string;
  readonly severity: string;
  readonly phase: string;
  readonly trigger: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus (DIAG-4). */
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

/**
 * A registered code's normative *Message* template. Fails LOUDLY naming the
 * registry page when the row is absent, so a registry drift can never degrade
 * an assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

function letRhsMessage(name: string, expected: string, actual: string): string {
  return registered(LET_RHS_CODE)
    .replace("<name>", name)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function arrayElementMessage(index: number, expected: string, actual: string): string {
  return registered(ARRAY_ELEMENT_CODE)
    .replace("<i>", String(index))
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function objectFieldMessage(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return registered(OBJECT_FIELD_CODE)
    .replace("<field>", field)
    .replace("<schema>", schema)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function unresolvedNamedMessage(name: string): string {
  return registered(UNRESOLVED_NAMED_CODE).replace("<name>", name);
}

function unknownIdentifierMessage(name: string): string {
  return registered(UNKNOWN_IDENTIFIER_CODE).replace("<name>", name);
}

function unknownMethodMessage(method: string, type: string): string {
  return registered(UNKNOWN_METHOD_CODE).replace("<method>", method).replace("<type>", type);
}

/** The case rule's registered *Message*; the row interpolates no name. */
function schemaCaseMessage(): string {
  return registered(SCHEMA_CASE_CODE);
}

/** One diagnostic rendered the way every assertion below compares it. */
function line(severity: string, code: string, message: string): string {
  return `${severity} ${code}: ${message}`;
}

// ===========================================================================
// Parse harness.
// ===========================================================================

/** Every fixture is `mode: prompt` (§Reproduction). */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0038.theta");
}

/** The whole diagnostic list, order-preserving, as comparable strings. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/**
 * `body`'s complete diagnostic list is exactly `expected`. Asserted as one
 * whole-list comparison so a RED prints every diagnostic the parse actually
 * produced — which for a w-row is the wrong-code emission the bug is about,
 * named in the failure text rather than inferred from an absent-code check.
 *
 * `parse` is called through a `not.toThrow` gate first, because at this HEAD a
 * t-row row aborts the parse and an ungated call would red on a raw `TypeError`
 * with no statement of what was expected.
 */
function expectDiagnostics(body: string, expected: readonly string[], why: string): void {
  expect(
    () => parse(body),
    `${why}\n  the parse must REPORT, not throw: the registry carries no \`phase: parse\` row for an internal throw, and the only registered code a throw here surfaces under is \`theta/load/extension-compose-failed\` (code-registry-load.md:10), a host-level row carrying no file and no span`,
  ).not.toThrow();
  const doc = parse(body);
  expect(
    diagLines(doc),
    `${why}\n  expected the complete diagnostic list: ${JSON.stringify(expected)}`,
  ).toEqual([...expected]);
}

/** `body` loads with no diagnostic at all. */
function expectSilent(body: string, why: string): void {
  expectDiagnostics(body, [], why);
}

// ===========================================================================
// Fixtures — the bug doc's §Reproduction tables, verbatim.
// ===========================================================================

// Wrong-diagnostic rows: the annotation is statically unresolvable and the
// engine reports a mismatch anyway.
const W1 = "let c: constructor = 3\n";
const W2 = "let c: toString = 3\n";
const W3 = "let c: __proto__ = 3\n";
const W4 = 'let c: constructor = "s"\n';
const W5 = "let mut c: constructor = 3\n";
const W6 = 'let xs: array<constructor> = ["a"]\n';
const W7 = "schema S { f: constructor }\nlet s = S { f: 3 }\ns\n";
const W8 = "schema A = constructor\nlet a: A = 3\na\n";

// Throwing rows: the parse aborts with no diagnostic at all.
const T1 = "let r = 1 + constructor\nr\n";
const T2 = "let r = 1 < toString\nr\n";
const T3 = "let r = constructor.x\nr\n";
const T4 = "let r = valueOf[0]\nr\n";
const T5 = "fn f(x: constructor): number { x + 1 }\nlet r = f(1)\nr\n";
const T6 = "fn f(x: __proto__): number { let m = x.nope\n  1 }\nlet r = f(1)\nr\n";
const T7 = "schema A = constructor\nfn f(x: A): number { x + 1 }\nlet r = f(1)\nr\n";
const T8 = "schema S { a: number }\nlet s = S { a: 1 }\nlet r = s.toString + 1\nr\n";
const T9 = "fn toString(): number { 1 }\nlet r = toString() + 1\nr\n";
const T10 = 'let r = "x".toString() + 1\nr\n';
const T11 = "let v = constructor { a: 1 }\nlet r = 1 + v\nr\n";

// Matched controls: the same shape with an undeclared NON-prototype name.
const C1 = "let u: Missing = 3\nu\n";
const C2 = "let u: nope = 3\nu\n";
const C3 = 'let xs: array<Missing> = ["a"]\nxs\n';
const C4 = "schema S { f: Missing }\nlet s = S { f: 3 }\ns\n";
const C5 = "schema A = Missing\nlet a: A = 3\na\n";
const C6 = "let r = 1 + zzz\nr\n";
const C7 = "let r = 1 < zzz\nr\n";
const C8 = "let r = zzz.x\nr\n";
const C9 = "fn f(x: Missing): number { x + 1 }\nlet r = f(1)\nr\n";
const C10 = "let r = constructor\nr\n";
const C11 = "schema Good { a: number }\nlet v: Good = 3\nv\n";

// The `zzz`-named counterparts of the four t-rows that carry no annotation.
// §Fix's rule is "t8–t11 silent as their `zzz`-named counterparts are"; these
// four measure what the counterparts actually do, so the t-rows lock the rule
// and not the doc's mis-derived value for it.
const T8Z = "schema S { a: number }\nlet s = S { a: 1 }\nlet r = s.zzz + 1\nr\n";
const T9Z = "fn zzz(): number { 1 }\nlet r = zzz() + 1\nr\n";
const T10Z = 'let r = "x".zzz() + 1\nr\n';
const T11Z = "let v = Zzz { a: 1 }\nlet r = 1 + v\nr\n";

// ===========================================================================
// (a) w1–w8 — the wrong-diagnostic rows. RED at this HEAD: each emits a code
// whose registered Trigger excludes a statically unresolvable operand.
// ===========================================================================

describe("bug 0038 (a) — an annotation naming an `Object.prototype` member is statically unresolvable and defers", () => {
  it("RED w1: `let c: constructor = 3` loads silently", () => {
    // The headline row. `constructor` names no declaration in this document —
    // `theta/parse/unresolved-named-type` says exactly that for the same name in
    // w7 and w8 — so type-system.md:48 requires the check be skipped, and
    // `let-rhs-type-mismatch`'s registered Trigger (code-registry-parse.md:54)
    // admits only a statically resolvable RHS. At this HEAD `env["constructor"]`
    // answers `Object.prototype.constructor`, `decide`'s `env[name] ===
    // undefined` test passes it as present, and the row fires against a type no
    // declaration declares. The matched control is c1/c2.
    expectSilent(
      W1,
      `w1 — the emitted ${LET_RHS_CODE} names \`constructor\` as an expected type; the author cannot act on it because no \`constructor\` type exists to satisfy`,
    );
  });

  it("RED w2: `let c: toString = 3` loads silently", () => {
    // The same mechanism under a second prototype name, pinned separately so a
    // partial guard that special-cases one name cannot pass.
    expectSilent(W2, "w2 — `toString` is as undeclared as `Missing` (control c1)");
  });

  it("RED w3: `let c: __proto__ = 3` loads silently", () => {
    // `__proto__` is the accessor whose WRITE side would replace the record's
    // prototype. The write is unreachable through the grammar
    // (`theta/parse/schema-case-mismatch` refuses a lowercase-headed declaration
    // name), but the READ is not shielded, which is where this symptom lives.
    expectSilent(W3, "w3 — the `__proto__` read is unshielded even though the write is unreachable");
  });

  it("RED w4: `let c: constructor = \"s\"` loads silently", () => {
    // Same annotation, different RHS type: the mismatch text tracks the RHS
    // (`got string`), confirming the wrong answer comes from the annotation side
    // resolving, not from the RHS.
    expectSilent(W4, "w4 — the RHS type varies and the spurious mismatch follows it");
  });

  it("RED w5: `let mut c: constructor = 3` loads silently", () => {
    // Mutability is orthogonal: the same sink, the same engine call.
    expectSilent(W5, "w5 — `let mut` reaches the identical `checkLetRhsCompat` sink");
  });

  it("RED w6: `let xs: array<constructor> = [\"a\"]` loads silently", () => {
    // The element-sink route. `array<constructor>` decomposes to a `named`
    // element type, so BOTH the annotation sink and the element sink resolve
    // `constructor` through the same prototype-bearing map and BOTH report. The
    // matched control is c3, which is silent on both.
    expectSilent(
      W6,
      `w6 — at this HEAD the unresolvable element type produces ${LET_RHS_CODE} AND ${ARRAY_ELEMENT_CODE}; control c3 (\`array<Missing>\`) produces neither`,
    );
  });

  it("RED w7: `schema S { f: constructor }` keeps unresolved-named-type ALONE", () => {
    // The sharpest row: two checkers in the same parse disagree about the same
    // name. `theta/parse/unresolved-named-type` resolves `constructor` against
    // the body's declarations and reports it unresolved (correct,
    // code-registry-parse.md:89); the type layer resolves it against the
    // prototype-bearing `TypeEnv` and reports a field mismatch as if it
    // resolved. Whichever is right, the PAIR is not a coherent report. Control
    // c4 shows the correct single-code disposition for `Missing`.
    expectDiagnostics(
      W7,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("constructor"))],
      `w7 — the correct checker stays and the spurious ${OBJECT_FIELD_CODE} goes; control c4 emits exactly one code for the equally undeclared \`Missing\``,
    );
  });

  it("RED w8: `schema A = constructor` keeps unresolved-named-type ALONE", () => {
    // The alias route into the same disagreement: the alias RHS is unresolvable,
    // so `A` cannot decide anything, yet the `let` sink reports `expected A`.
    // Control c5 is the same shape over `Missing`.
    expectDiagnostics(
      W8,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("constructor"))],
      `w8 — the alias RHS is unresolvable, so the ${LET_RHS_CODE} against \`A\` must go; control c5 emits ${UNRESOLVED_NAMED_CODE} alone`,
    );
  });
});

// ===========================================================================
// (b) The w1 family as a TABLE over `Object.getOwnPropertyNames(Object.prototype)`.
// §Fix: "The twelve `Object.prototype` own names are enumerable […] so the
// w-row family is a table test over that list rather than a hand-picked
// subset." Enumerating rather than hand-picking is what makes the pin close the
// whole hazard class instead of the names that happened to be probed.
// ===========================================================================

const PROTOTYPE_NAMES: readonly string[] = Object.getOwnPropertyNames(Object.prototype);

describe("bug 0038 (b) — the w1 shape over every `Object.prototype` own property name", () => {
  it("the enumeration is non-empty and carries both sentinel names", () => {
    // The precondition guard. Without it a host whose `Object.prototype` carried
    // no own names would run zero table rows and the whole group would report
    // success having verified nothing (CLAUDE.md: a skipped test is a lie).
    expect(
      PROTOTYPE_NAMES.length,
      "harness: `Object.getOwnPropertyNames(Object.prototype)` is the table's whole input; an empty enumeration means the table below asserts nothing",
    ).toBeGreaterThan(0);
    expect(
      PROTOTYPE_NAMES,
      "harness: `constructor` is the name §Reproduction's w1 row measures and `__proto__` is the one whose write side would replace the record's prototype; a table missing either is not the family this bug is about",
    ).toEqual(expect.arrayContaining(["constructor", "__proto__"]));
  });

  it.each(PROTOTYPE_NAMES)(
    "RED w1/%s: the `let c: <name> = 3` shape loads silently",
    (name: string) => {
      // One row per own name of `Object.prototype`. Each reports the w1 message
      // with its own name interpolated at this HEAD, because the defect is the
      // prototype chain itself and not any property of a particular name. The
      // doc measured ten of the twelve individually and claimed the remaining
      // two by mechanism; enumerating measures all of them.
      expectSilent(
        `let c: ${name} = 3\nc\n`,
        `w1/${name} — \`${name}\` names no declaration in this document, so type-system.md:48 requires the check be skipped; ${LET_RHS_CODE}'s Trigger (code-registry-parse.md:54) admits only a statically resolvable RHS`,
      );
    },
  );
});

// ===========================================================================
// (c) t1–t11 — the throwing rows. RED at this HEAD: the parse aborts with a
// `TypeError` and emits nothing, so the whole compose pass fails under a
// host-level load code with no file and no span. Each row asserts BOTH halves:
// the parse reports rather than throws, and it reports the disposition its
// non-type-layer checkers produce.
// ===========================================================================

describe("bug 0038 (c) — the parse reports; it does not throw", () => {
  it("RED t1: `let r = 1 + constructor` reports unknown-identifier and loads", () => {
    // The route through `classifyOperand` (type-layer-checks.ts:139) via
    // `checkPlusOperands` (:1256–1257). The identifier checker already resolves
    // `constructor` correctly — control c10 (`let r = constructor`, bare) proves
    // it — so the throw is contributed by the type layer's own resolution and
    // nothing else. Post-fix this row is exactly c10's observable.
    expectDiagnostics(
      T1,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("constructor"))],
      "t1 — control c6 (`1 + zzz`) reports `unknown identifier 'zzz'` and loads; c10 proves the identifier checker answers `constructor` the same way",
    );
  });

  it("RED t2: `let r = 1 < toString` reports unknown-identifier and loads", () => {
    // The ordering-operator route into the same classifier
    // (`checkOrderingOperands`, :1291–1292). Control c7 is `1 < zzz`.
    expectDiagnostics(
      T2,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("toString"))],
      "t2 — the ordering site reaches `classifyOperand` through a second caller; control c7 (`1 < zzz`) loads",
    );
  });

  it("RED t3: `let r = constructor.x` reports unknown-identifier and loads", () => {
    // `classifyReceiver` (:172) via `checkMemberAccess` (:1218) — the second of
    // the three classifiers. Control c8 is `zzz.x`.
    expectDiagnostics(
      T3,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("constructor"))],
      "t3 — the member-access receiver reaches `classifyReceiver`; control c8 (`zzz.x`) loads",
    );
  });

  it("RED t4: `let r = valueOf[0]` reports unknown-identifier and loads", () => {
    // `classifyIndexReceiver` (type-compat.ts:365) via `checkIndexReceiver`
    // (expression-evaluator.ts:621) — the third classifier, and the one group
    // (f) pins directly.
    expectDiagnostics(
      T4,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("valueOf"))],
      "t4 — the indexed-access receiver reaches `classifyIndexReceiver`, the third of the three classifiers",
    );
  });

  it("RED t5: `fn f(x: constructor): number { x + 1 }` loads silently", () => {
    // A parameter's binding type is a `named` from the annotation, so an
    // ANNOTATED parameter carries the prototype name into the body's operator
    // check. The matched control `fn f(x: Missing): number { x + 1 }` (c9) is
    // silent, and so is this row post-fix: `theta/parse/fn-arg-type-mismatch` is
    // unreachable at this HEAD (§Non-goals), which is why no argument
    // diagnostic appears on either side.
    expectSilent(T5, "t5 — control c9 is the identical shape over `Missing` and is silent");
  });

  it("RED t6: `fn f(x: __proto__): number { let m = x.nope … }` loads silently", () => {
    // t5's shape through `classifyReceiver` instead of `classifyOperand`: a
    // member read on an annotated parameter.
    expectSilent(
      T6,
      "t6 — a member read on a prototype-named parameter reaches the receiver classifier",
    );
  });

  it("RED t7: `schema A = constructor` + `fn f(x: A) { x + 1 }` reports unresolved-named-type", () => {
    // One alias unfold deeper than t5: `A` resolves, its RHS does not. The alias
    // RHS position is the one place a prototype name already has a correct
    // checker (`unresolved-named-type`, code-registry-parse.md:89), so this row
    // keeps exactly that diagnostic and loses the throw. The matched control
    // `schema A = Missing` reports the same code with `Missing` interpolated.
    expectDiagnostics(
      T7,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("constructor"))],
      "t7 — the alias RHS position already reports correctly; only the type layer's throw is removed",
    );
  });

  it("RED t8: `let r = s.toString + 1` loads silently — no annotation anywhere", () => {
    // The throwing surface is not opt-in. `static-type-inference.ts:244` types a
    // member read as its FIELD NAME, and lexical.md:15's lowercase-first rule
    // for fields puts every one of the twelve prototype names inside the
    // admitted name space at this position. Counterpart T8Z pins that the
    // `zzz`-named shape is silent, which is the rule this row locks.
    expectSilent(T8, "t8 — a member read types as `named \"toString\"` with no annotation written");
  });

  it("RED t9: `fn toString(): number { 1 }` + `toString() + 1` loads silently", () => {
    // `static-type-inference.ts:252` types a call as its CALLEE name.
    // `toString` is an ordinary function name under lexical.md:15.
    expectSilent(T9, "t9 — a call types as `named \"toString\"`; counterpart T9Z is silent");
  });

  it("RED t10: `let r = \"x\".toString() + 1` reports unknown-method and loads", () => {
    // `static-type-inference.ts:262` types a method call as its METHOD name.
    // The bug doc predicts silence here on the ground that the `zzz`-named
    // counterpart is silent; measured, the counterpart is NOT silent — the theta
    // 1.0 stdlib exposes no `toString` on `string`, so the correct disposition
    // is the registered `unknown-method` row (code-registry-parse.md:63).
    // Counterpart T10Z measures it.
    expectDiagnostics(
      T10,
      [line("error", UNKNOWN_METHOD_CODE, unknownMethodMessage("toString", "string"))],
      "t10 — the row loses its throw and keeps the disposition its `zzz`-named counterpart has, which is `unknown-method`, not silence",
    );
  });

  it("RED t11: `let v = constructor { a: 1 }` reports unresolved-named-type and loads", () => {
    // `static-type-inference.ts:258` types an object construction as its TYPE
    // name. Bug 0025's constructor-name gate already refuses an unresolvable
    // constructor name, so the correct disposition is that gate's code — again
    // not the silence the doc predicts. Counterpart T11Z measures it.
    expectDiagnostics(
      T11,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("constructor"))],
      "t11 — bug 0025's constructor-name gate owns this position; the type layer contributes only the throw",
    );
  });

  it("the `zzz`-named counterparts t8–t11 lock the rule the t-rows are measured against", () => {
    // GREEN at this HEAD and after. These four are the reference dispositions
    // t8–t11 must converge to: change one of them and the corresponding t-row's
    // expectation above is no longer justified.
    expectSilent(T8Z, "t8z — `s.zzz + 1`, t8's shape over a non-prototype field name");
    expectSilent(T9Z, "t9z — `zzz() + 1`, t9's shape over a non-prototype callee");
    expectDiagnostics(
      T10Z,
      [line("error", UNKNOWN_METHOD_CODE, unknownMethodMessage("zzz", "string"))],
      "t10z — `\"x\".zzz() + 1` reports `unknown-method`, so t10 must too",
    );
    expectDiagnostics(
      T11Z,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("Zzz"))],
      "t11z — `Zzz { a: 1 }` reports `unresolved-named-type`, so t11 must too",
    );
  });
});

// ===========================================================================
// (d) L1 — the load consequence, through the SHIPPED composition root over a
// `mkdtemp` discovery root. RED at this HEAD: the `TypeError` escapes
// `discoverAndComposeFixtures`, so the clean theta that sorts AHEAD of the
// crasher never reaches its `sink.emitGroup` and the one that sorts after is
// never read. Zero thetas register and zero notifications reach the author.
// Harness pattern: tests/ctor-unresolved-schema-name.test.ts:511.
// ===========================================================================

interface LoadProbe {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}

/**
 * Drive the shipped composition root over a throwaway discovery root holding
 * `actl.theta` (clean), `mcrash.theta` (the row under test) and `zctl.theta`
 * (clean). The two clean thetas bracket the crasher alphabetically, so a
 * registration list missing either one distinguishes "the pass aborted" from
 * "the crashing file was dropped".
 */
async function driveComposePass(mcrashBody: string, why: string): Promise<LoadProbe> {
  const workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0038-"));
  try {
    const projectThetaDir = join(workspaceDir, ".pi", "theta");
    mkdirSync(projectThetaDir, { recursive: true });
    writeFileSync(join(projectThetaDir, "actl.theta"), FM + "@`hi`\n", "utf8");
    writeFileSync(join(projectThetaDir, "zctl.theta"), FM + "@`bye`\n", "utf8");
    writeFileSync(join(projectThetaDir, "mcrash.theta"), FM + mcrashBody, "utf8");

    const notifications: string[] = [];
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (): void => {},
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspaceDir,
      // Interactive posture so a drop does not also mirror to stderr; the
      // author-visible observable under test is `ui.notify`.
      hasUI: true,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: {
        notify: (message: string, _type: "error"): void => {
          notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;

    const pass = discoverAndComposeFixtures(pi, ctx);
    await expect(
      pass,
      `${why}\n  \`discoverAndComposeFixtures\` must RETURN: a throw escaping the compose pass is converted by the factory's compose supplier (src/extension/factory.ts:702–719) into one \`theta/load/extension-compose-failed\` naming a JS \`TypeError\` with no file, no span and no theta name (code-registry-load.md:10), which is an escape from DIAG-1's per-site attribution (diagnostic-shape.md:71)`,
    ).resolves.toBeDefined();
    const fixtures: readonly ThetaFixture[] = await pass;
    return {
      registered: fixtures.map((f) => f.slashName),
      notifications,
    };
  } finally {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
}

describe("bug 0038 (d) — one two-line body must not take down every theta in the discovery root", () => {
  it("RED L1: `let r = 1 + constructor` drops on its own merits and both clean thetas register", async () => {
    const probe = await driveComposePass(
      T1,
      "L1 — `mcrash.theta` carries `let r = 1 + constructor`",
    );
    expect(
      probe.registered,
      `L1 setup guard: the project .pi/theta/ discovery walk must reach the workspace; registered=${JSON.stringify(probe.registered)}`,
    ).toContain("actl");
    expect(
      probe.registered,
      `L1 — the theta sorting AFTER the crashing file must register too, so the pin covers both sides of the parse loop (src/extension/production-composition.ts:635); registered=${JSON.stringify(probe.registered)}`,
    ).toContain("zctl");
    expect(
      probe.registered,
      `L1 — the crashing file carries an error-severity parse diagnostic, so \`parseDiscoveredTheta\` drops it on its own merits; registered=${JSON.stringify(probe.registered)}`,
    ).not.toContain("mcrash");
    expect(
      probe.notifications,
      `L1 — DIAG-1: the drop surfaces the registry code's message for THIS file to the author, in place of a whole-pass failure naming a JS \`TypeError\`; notified=${JSON.stringify(probe.notifications)}`,
    ).toContain(unknownIdentifierMessage("constructor"));
  });

  it("CONTROL L2: `let r = 1 + zzz` already drops on its own merits", async () => {
    // GREEN at this HEAD and after. L2 is the shape L1 must converge to; without
    // it, L1's expectations rest on prose rather than on a measured control in
    // the same harness.
    const probe = await driveComposePass(C6, "L2 — `mcrash.theta` carries `let r = 1 + zzz`");
    expect(
      probe.registered,
      `L2 CONTROL BROKEN — both clean thetas must register; registered=${JSON.stringify(probe.registered)}`,
    ).toEqual(expect.arrayContaining(["actl", "zctl"]));
    expect(
      probe.registered,
      `L2 CONTROL BROKEN — the malformed theta must drop; registered=${JSON.stringify(probe.registered)}`,
    ).not.toContain("mcrash");
    expect(
      probe.notifications,
      `L2 CONTROL BROKEN — the drop must notify; notified=${JSON.stringify(probe.notifications)}`,
    ).toContain(unknownIdentifierMessage("zzz"));
  });
});

// ===========================================================================
// (e) c1–c11 — the matched controls. GREEN at this HEAD and after: they are the
// same positions answering correctly for an equally undeclared NON-prototype
// name, so a red here means the fix changed the wrong arm. c11 is the positive
// that proves an OWN key still resolves.
// ===========================================================================

describe("bug 0038 (e) — controls: an equally undeclared non-prototype name is byte-unchanged", () => {
  it("c1/c2: `let u: Missing = 3` and `let u: nope = 3` load silently", () => {
    // The disposition w1–w5 must reach. Both an uppercase and a lowercase
    // undeclared name are silent, so the annotation position applies no case
    // rule (§Non-goals) and the only difference from w1 is the prototype chain.
    expectSilent(C1, "c1 — `Missing` is undeclared and the check defers");
    expectSilent(C2, "c2 — `nope` is undeclared and lowercase, and the check still defers");
  });

  it("c3: `let xs: array<Missing> = [\"a\"]` loads silently", () => {
    // The disposition w6 must reach, on both the annotation sink and the
    // element sink.
    expectSilent(C3, "c3 — an unresolvable element type defers at both sinks");
  });

  it("c4: `schema S { f: Missing }` reports unresolved-named-type ALONE", () => {
    // The disposition w7 must reach: one code, no mismatch.
    expectDiagnostics(
      C4,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("Missing"))],
      "c4 — the field-type position reports the unresolvable name once and the type layer adds nothing",
    );
  });

  it("c5: `schema A = Missing` + `let a: A = 3` reports unresolved-named-type ALONE", () => {
    // The disposition w8 must reach.
    expectDiagnostics(
      C5,
      [line("error", UNRESOLVED_NAMED_CODE, unresolvedNamedMessage("Missing"))],
      "c5 — the alias RHS reports once and the `let` sink defers because `A` decides nothing",
    );
  });

  it("c6/c7/c8: `1 + zzz`, `1 < zzz` and `zzz.x` report unknown-identifier and load", () => {
    // The dispositions t1, t2 and t3 must reach — three distinct classifiers,
    // one shared answer.
    expectDiagnostics(
      C6,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("zzz"))],
      "c6 — the `+` operand position",
    );
    expectDiagnostics(
      C7,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("zzz"))],
      "c7 — the ordering operand position",
    );
    expectDiagnostics(
      C8,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("zzz"))],
      "c8 — the member-access receiver position",
    );
  });

  it("c9: `fn f(x: Missing): number { x + 1 }` loads silently", () => {
    // The disposition t5 must reach.
    expectSilent(C9, "c9 — an unresolvable parameter annotation defers in the body");
  });

  it("c10: `let r = constructor` (bare, no operator) reports unknown-identifier and loads", () => {
    // The control that isolates the mechanism: the identifier checker resolves
    // `constructor` against the document's declarations, reports it unresolved,
    // and the parse COMPLETES. The crash in t1–t11 is therefore contributed by
    // the type layer's own resolution, not by name resolution generally.
    expectDiagnostics(
      C10,
      [line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("constructor"))],
      "c10 — the same name, the same document, no operator: the parse completes",
    );
  });

  it("c11: `schema Good { a: number }` + `let v: Good = 3` still reports let-rhs-type-mismatch", () => {
    // The POSITIVE. An own key must still resolve after the record is
    // null-prototyped and the reads own-key-guarded: a fix that answered
    // "unknown" for every name would silence this row too, and this is the
    // assertion that catches it.
    expectDiagnostics(
      C11,
      [line("error", LET_RHS_CODE, letRhsMessage("v", "Good", "integer"))],
      `c11 — a DECLARED name resolves and the correct ${LET_RHS_CODE} fires; a guard that disabled resolution altogether would red here`,
    );
  });
});

// ===========================================================================
// (f) The engine pins — §Reproduction's *Engine rows*, measured directly on the
// three exported entry points. TWO envs per name:
//
//   PLAIN `{}`          — the READ-GUARD witness. §Fix routes all eight reads
//                         through one exported `resolveNamed(env, name)` guarded
//                         with `Object.hasOwn`, "what makes the fix hold for a
//                         `TypeEnv` value constructed anywhere else, including
//                         the plain-`{}` literals tests/type-compat.test.ts uses
//                         (:61, :82, :138, :149, :321, :347, :354, :367)".
//                         RED at this HEAD.
//   `Object.create(null)` — the CONSTRUCTION witness, green at this HEAD. It is
//                         what proves the assertion can reach green at all, so
//                         the RED above is a statement about the reads and not
//                         about the expectation being unreachable.
//
// The pins are stated through the exported behaviour only. `resolveNamed` does
// not exist at this HEAD, so importing it would couple this file to the
// implementer's choice of symbol name and would red for a harness reason.
// ===========================================================================

const AFFECTED_NAMES: readonly string[] = ["constructor", "toString", "valueOf", "__proto__"];

function named(name: string): CompatType {
  return { kind: "named", name };
}

const INTEGER: CompatType = { kind: "prim", name: "integer" };

/** A throwaway 1:1–1:2 span for the per-site seam call. */
function site(): { file: string; range: SourceRange } {
  return {
    file: "bug0038.theta",
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
}

/**
 * The two env constructions the fix must make indistinguishable. Each entry is
 * a FACTORY rather than a value, so the declared-key control below builds its
 * env the same way the empty one is built and the plain-`{}` witness stays a
 * plain `{}` when it carries an entry.
 */
type EnvFactory = (entries?: Record<string, NamedDecl>) => TypeEnv;

interface EnvCase {
  /** How the env under test is constructed. */
  readonly label: string;
  /** `RED` when the row fails at this HEAD, `GREEN-PROOF` when it passes. */
  readonly prefix: string;
  readonly make: EnvFactory;
}

const ENVS: readonly EnvCase[] = [
  {
    label: "plain `{}` (the read-guard witness)",
    prefix: "RED",
    make: (entries = {}) => ({ ...entries }),
  },
  {
    label: "`Object.create(null)` (the construction witness)",
    // Passes at this HEAD by construction. It is the both-directions proof: the
    // same three assertions the plain-`{}` rows red on are satisfiable, so those
    // reds are statements about the reads and not about an unreachable
    // expectation.
    prefix: "GREEN-PROOF",
    make: (entries = {}) =>
      Object.assign(Object.create(null) as Record<string, NamedDecl>, entries),
  },
];

describe("bug 0038 (f) — the three exported entry points answer `unknown` for an undeclared name on either env construction", () => {
  for (const { label: envLabel, prefix, make: makeEnv } of ENVS) {
    const env = makeEnv();
    for (const name of AFFECTED_NAMES) {
      it(`${prefix} engine/${name} on ${envLabel}: checkCompatible answers "unknown"`, () => {
        // `decide`'s TYPE-10 arms (type-compat.ts:238, :242, :252) test
        // `env[name] === undefined` and nothing else, so a prototype value
        // passes as a present declaration and the relation answers
        // "incompatible" where type-system.md:48 requires the check be skipped.
        expect(
          checkCompatible(INTEGER, named(name), env),
          `engine/${name} — \`${name}\` is in NO env; the relation must be "unknown" so every caller skips (type-system.md:48). The \`zzz\` control below answers "unknown" on both env constructions`,
        ).toBe("unknown");
      });

      it(`${prefix} engine/${name} on ${envLabel}: checkLetRhsCompat emits nothing`, () => {
        // The per-site seam w1 fires through. TYPE-9 (type-system.md:50) admits
        // the row only where BOTH operands are statically resolvable, and
        // `let-rhs-type-mismatch`'s registered Trigger carries the qualifier
        // verbatim (code-registry-parse.md:54).
        const diags = checkLetRhsCompat({
          name: "c",
          annotation: named(name),
          rhs: INTEGER,
          env,
          site: site(),
        });
        expect(
          diags.map((d) => `${d.severity} ${d.code}: ${d.message}`),
          `engine/${name} — an unresolvable annotation defers; a diagnostic here is a mismatch reported against a type no declaration declares`,
        ).toEqual([]);
      });

      it(`${prefix} engine/${name} on ${envLabel}: classifyIndexReceiver answers "unknown"`, () => {
        // The classifier that throws (type-compat.ts:365 → :373): it tests
        // `decl.kind === "object-schema"` and otherwise recurses into
        // `decl.rhs`, which a prototype value does not have. Asserted in two
        // steps so a throw reds against a stated expectation rather than as a
        // bare `TypeError`.
        expect(
          () => classifyIndexReceiver(named(name), env),
          `engine/${name} — the classifier must not throw: its two guards are meant to establish that past them the declaration is an \`alias\` with a \`CompatType\` \`rhs\`, and only a prototype-supplied value violates that`,
        ).not.toThrow();
        expect(
          classifyIndexReceiver(named(name), env),
          `engine/${name} — an unresolved receiver name is "unknown", deferred to the runtime safety net`,
        ).toBe("unknown");
      });
    }

    it(`CONTROL engine/zzz on ${envLabel}: all three entry points already answer for a non-prototype name`, () => {
      // GREEN at this HEAD and after, on both env constructions. This is the
      // reference disposition the four names above must converge to; without it
      // the "unknown" expectations rest on prose rather than on a measured
      // control through the same three calls.
      expect(
        checkCompatible(INTEGER, named("zzz"), env),
        "engine/zzz CONTROL BROKEN — an undeclared non-prototype name must relate as \"unknown\"",
      ).toBe("unknown");
      expect(
        checkLetRhsCompat({
          name: "c",
          annotation: named("zzz"),
          rhs: INTEGER,
          env,
          site: site(),
        }),
        "engine/zzz CONTROL BROKEN — an undeclared non-prototype annotation must emit nothing",
      ).toEqual([]);
      expect(
        classifyIndexReceiver(named("zzz"), env),
        "engine/zzz CONTROL BROKEN — an undeclared non-prototype receiver must classify as \"unknown\"",
      ).toBe("unknown");
    });

    it(`CONTROL engine/declared on ${envLabel}: an OWN key still resolves`, () => {
      // The engine-level counterpart of c11. An own entry written into either
      // env construction must keep deciding, so an own-key guard that answered
      // `undefined` for everything would red here rather than pass the group.
      const declared = makeEnv({ Good: { kind: "object-schema" } });
      expect(
        checkCompatible(INTEGER, named("Good"), declared),
        "engine/declared CONTROL BROKEN — a declared object schema resolves and `integer ⋢ Good` is decidable (TYPE-10, type-system.md:52)",
      ).toBe("incompatible");
      expect(
        classifyIndexReceiver(named("Good"), declared),
        "engine/declared CONTROL BROKEN — a declared object schema classifies as an object receiver",
      ).toBe("object");
    });
  }
});

// ===========================================================================
// (g) The construction site — the exported `collectTypeEnv`
// (src/parser/type-layer-checks.ts:328) driven directly.
//
// WHY THIS GROUP EXISTS. Groups (a)–(f) observe the record through a READ, and
// the read half of §Fix satisfies every one of them on its own: with
// `resolveNamed` own-key-guarding all eight consumption sites, a plain-`{}`
// construction leaves (a)–(f) green. §Fix has two halves, so the construction
// half carries its own observable, stated in §Fix verbatim — "on
// `Object.create(null)`, `o["__proto__"] = v` yields `Object.hasOwn(o,
// "__proto__") === true`, `Object.keys(o) === ["__proto__"]`, and the prototype
// still `null`" — and measured in the converse direction by §Reproduction's last
// *not affected* bullet: on a plain `{}` "the assignment replaces the record's
// prototype instead of creating an own property, `Object.keys(env)` is
// `["Real"]` alone, and the names `kind` and `fields` then resolve to the lost
// declaration's own properties". The three rows below read the returned record
// directly, so they answer for the construction and for no consumer's guard.
//
// WHY THE g2 FIXTURE IS HAND-BUILT. `schema __proto__ { … }` parses.
// `theta/parse/schema-case-mismatch` (code-registry-parse.md:20) is a
// contextual LEXER diagnostic (src/lexer/lexer.ts:833), not a parse refusal:
// the `SchemaDecl` still reaches `doc.body.statements`, and `checkTypeLayer`
// runs over it with no gate on prior diagnostics
// (src/parser/theta-document.ts:843 → type-layer-checks.ts:241), so
// `collectTypeEnv` performs the write on author source text. Group (h) drives
// that route end to end. The list below is built by hand to isolate the
// construction site from the parser, so a red here names `collectTypeEnv` and
// nothing upstream of it. What the diagnostic's `E` severity bounds is the
// LOAD, not the write: such a document never registers (GOV-15's loads-cleanly
// predicate, source-language-stability.md:9; the error-severity drop group (d)
// measures), so no registered theta's env carries a prototype-name key. What
// g2 pins is the construction site's own invariant — every name a write puts
// in is an OWN key of the returned record — which no read-side guard can
// restore: a write the prototype setter swallows loses the declaration
// outright, so `resolveNamed` answers `undefined` for a name that was in fact
// declared.
// ===========================================================================

/**
 * One object-form `schema <name> { a: number }` statement, built by hand
 * against the real `SchemaDecl` shape (src/parser/theta-document.ts:544):
 * `fields` present with `arms` absent is exactly the form `collectTypeEnv`'s
 * object-form write consumes. The span is a throwaway 1:1–1:2 — `collectTypeEnv`
 * reads `kind`, `name`, `arms` and `fields` only.
 */
function objectSchemaStmt(name: string): Stmt {
  return {
    kind: "schema",
    name,
    fields: [{ name: "a", typeSource: "number" }],
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
}

/** The g2/g3 fixture: a `__proto__`-named declaration ahead of a PascalCase one. */
function protoNamedThenReal(): readonly Stmt[] {
  return [objectSchemaStmt("__proto__"), objectSchemaStmt("Real")];
}

describe("bug 0038 (g) — the construction site: `collectTypeEnv` returns a record with no prototype", () => {
  it("g1: `collectTypeEnv([])` has a null prototype", () => {
    // The whole of the construction half in one read. With no prototype there
    // is no chain for a `NamedType` reference to resolve through, so the twelve
    // `Object.prototype` own names answer `undefined` at the record itself and
    // not only at the eight guarded reads.
    expect(
      Object.getPrototypeOf(collectTypeEnv([])),
      "g1 — an empty statement list must still yield a prototype-less record; on an ordinary `{}` the prototype is `Object.prototype` and `env[\"constructor\"]` answers a `Function` for a name no `schema` statement wrote",
    ).toBeNull();
  });

  it("g2: a `__proto__`-named declaration lands as an own key instead of replacing the prototype", () => {
    const env = collectTypeEnv(protoNamedThenReal());

    // §Reproduction measured the converse of this shape on a plain `{}`: the
    // write is swallowed by the `Object.prototype.__proto__` setter, so the
    // declaration never becomes a key and the record's prototype becomes the
    // declaration object itself.
    expect(
      Object.hasOwn(env, "__proto__"),
      "g2 — the write must create an own property; a swallowed write loses the declaration, and no read-side own-key guard can recover a key that was never set",
    ).toBe(true);
    expect(
      Object.keys(env).sort(),
      "g2 — both declarations must be enumerable own keys; `[\"Real\"]` alone is the measured plain-`{}` shape, with the `__proto__` declaration lost",
    ).toEqual(["Real", "__proto__"].sort());
    expect(
      Object.getPrototypeOf(env),
      "g2 — the record's prototype must survive the write as `null`; a prototype replaced by the declaration object puts that object's own properties on every lookup path",
    ).toBeNull();

    // `kind` and `fields` are the own properties of the `NamedDecl` the write
    // produces. A prototype replacement puts them on the record's lookup path,
    // which is the exact leak §Reproduction measured: two names no statement
    // declared start resolving.
    expect(
      env["kind"],
      "g2 — `kind` names no declaration; resolving it means the record inherited the swallowed declaration's own properties",
    ).toBeUndefined();
    expect(
      env["fields"],
      "g2 — `fields` names no declaration; resolving it means the record inherited the swallowed declaration's own properties",
    ).toBeUndefined();
  });

  it("g3 CONTROL: an ordinary PascalCase name still resolves as an own key after the same call", () => {
    // Green on either construction, and that is the point: it proves g1/g2 pin
    // the prototype rather than the record being empty. A construction that
    // recorded nothing would satisfy g1 and g2's prototype rows and red here.
    const env = collectTypeEnv(protoNamedThenReal());
    expect(
      Object.hasOwn(env, "Real"),
      "g3 CONTROL BROKEN — an author-written PascalCase schema name must be an own key of the returned record",
    ).toBe(true);
    expect(
      env["Real"]?.kind,
      "g3 CONTROL BROKEN — the object form must record an `object-schema` declaration, so resolution still works and c11's positive still fires",
    ).toBe("object-schema");
  });
});

// ===========================================================================
// (h) — the author-reachable `__proto__` write. The prototype-replacement
// hazard g2 isolates by hand is also reachable from author source text; the
// rows witness the READ half over that route (see WHICH HALF below).
//
// WHY THESE ROWS MATTER. `schema __proto__ { a: number }` reaches
// `collectTypeEnv` from author source text: `theta/parse/schema-case-mismatch`
// is a contextual lexer diagnostic (src/lexer/lexer.ts:833) rather than a parse
// refusal, the `SchemaDecl` lands in `doc.body.statements`, and
// `checkTypeLayer` runs with no gate on prior diagnostics
// (src/parser/theta-document.ts:843 → type-layer-checks.ts:241). On a plain
// `{}` the object-form write is swallowed by the `Object.prototype.__proto__`
// setter, which replaces the record's prototype with the `NamedDecl` itself.
// Two consequences, both observable from source text: the declaration object's
// OWN property names — `kind` and `fields` — resolve as declared types at every
// read site, and the declaration the author wrote is lost. r6 is the control
// that isolates the mechanism: `kind` against an ordinary declaration set is
// unresolvable, and the identical body loads clean.
//
// THE MEASURED BOUND IS THE LOAD GATE, NOT THE GRAMMAR. The bug doc's
// §Affected calls this hazard "unreachable through the grammar"; the grammar
// admits it. What the `E` severity denies is REGISTRATION — GOV-15's
// loads-cleanly predicate (source-language-stability.md:9) and the
// error-severity drop group (d) measures — so no registered theta's env carries
// a prototype-name key, while every parse of such a source text still performs
// the write.
//
// WHICH HALF OF §Fix THESE ROWS WITNESS. All four observe through the eight
// READS, so the read guard alone satisfies them: measured with the
// construction half neutralised and `resolveNamed` intact, (h) stays green and
// only g1/g2 red. (g) therefore remains the construction half's own witness
// and (h) widens the read half's from a hand-built statement list to author
// source text.
//
// Each row asserts the COMPLETE diagnostic list, order-preserving, so an added
// or dropped diagnostic reds visibly. Every expected message is sourced from
// the live registry through `registered()` (DIAG-4), `schema-case-mismatch`
// included.
// ===========================================================================

// The `__proto__`-named declaration ahead of a reference to one of the lost
// declaration's own property names — `kind` at an annotation position (r3), at
// an operand position (r4), and `fields` at an annotation position (r5).
const R3 = "schema __proto__ { a: number }\nlet c: kind = 3\n";
const R4 = "schema __proto__ { a: number }\nlet r = 1 + kind\n";
const R5 = "schema __proto__ { a: number }\nlet c: fields = 3\n";
// The control: r3's body over a PascalCase declaration name.
const R6 = "schema Good { a: number }\nlet c: kind = 3\n";

describe("bug 0038 (h) — the `__proto__` write reaches `collectTypeEnv` from author source text", () => {
  it("RED r3: `schema __proto__` + `let c: kind = 3` reports the case rule ALONE", () => {
    // The headline reachable row. `kind` is the swallowed `NamedDecl`'s own
    // discriminant property, so a replaced prototype makes it resolve and the
    // `let` sink reports a mismatch against a type no statement declares. The
    // case rule is the only diagnostic the source text earns.
    expectDiagnostics(
      R3,
      [line("error", SCHEMA_CASE_CODE, schemaCaseMessage())],
      `r3 — the extra ${LET_RHS_CODE} names \`kind\` as an expected type; control r6 proves \`kind\` is unresolvable against an ordinary declaration set, so the mismatch is contributed by the swallowed \`__proto__\` write alone`,
    );
  });

  it("RED r4: `schema __proto__` + `let r = 1 + kind` reports the case rule and unknown-identifier", () => {
    // The throwing route, reachable. `classifyOperand` recurses into `decl.rhs`
    // of a value that is a `SchemaDecl`, not a `NamedDecl`, and the read of
    // `.kind` on `undefined` aborts the whole parse. The gate is stated
    // separately from the list so a throw reds against a named expectation
    // rather than as a bare `TypeError`, the shape group (c) uses.
    expect(
      () => parse(R4),
      "r4 — the parse must REPORT, not throw: an author-written `schema __proto__` carries a prototype replacement into `classifyOperand`, whose `decl.rhs` recursion reads `.kind` of `undefined` and takes down the whole compose pass under a host-level load code with no file and no span",
    ).not.toThrow();
    expectDiagnostics(
      R4,
      [
        line("error", SCHEMA_CASE_CODE, schemaCaseMessage()),
        line("error", UNKNOWN_IDENTIFIER_CODE, unknownIdentifierMessage("kind")),
      ],
      "r4 — the identifier checker resolves `kind` against the document's declarations and reports it unresolved; the type layer must add the throw and nothing else",
    );
  });

  it("RED r5: `schema __proto__` + `let c: fields = 3` reports the case rule ALONE", () => {
    // The second own property name of the swallowed declaration, pinned
    // separately so a partial guard covering one name cannot pass the group.
    expectDiagnostics(
      R5,
      [line("error", SCHEMA_CASE_CODE, schemaCaseMessage())],
      `r5 — \`fields\` is the object form's other own property; a second ${LET_RHS_CODE} here is the same prototype replacement under a second name`,
    );
  });

  it("CONTROL r6: `schema Good` + `let c: kind = 3` loads clean on either construction", () => {
    // GREEN at this HEAD and after. Without it r3's expectation rests on prose:
    // r6 is the measurement that `kind` names no declaration once the
    // declaration set is ordinary, so every diagnostic r3 sheds is attributable
    // to the `__proto__` write and to nothing about the name `kind` itself.
    expectSilent(
      R6,
      "r6 CONTROL BROKEN — `kind` must be unresolvable against a PascalCase declaration set; a diagnostic here means the row isolates nothing",
    );
  });
});
