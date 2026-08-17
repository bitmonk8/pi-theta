import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";
import type { ThetaDocument } from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  MISSING_OBJECT_KEY_CODE,
} from "../src/runtime/runtime-panics";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0136 — `#typeExpr`'s `case "member"` arm, anchored on `case "member"` and
// spanning src/parser/static-type-inference.ts:242–279 as measured against this
// tree, is the site. The report is that the arm types every member access as
// `{ kind: "named", name: node.field }` — the field's NAME, not its declared
// type — so eight registered `E`-severity checks stop firing on
// `p.field` for a schema-typed `p`, a ninth (`theta/parse/non-array-iterand`)
// refuses the spec-legal `for y in p.xs` outright, and the same arm types
// `Enum.Variant` as the VARIANT name against docs/spec_topics/schemas.md:97's
// "statically typed as `Enum`"
// (docs/bugs/0136-member-access-types-as-field-name-not-field-type.md).
//
// ── THE SETTLED ROUTE THIS FILE ENCODES ─────────────────────────────────────
// §Fix (a) route 1 plus the STRUCTURAL enum sub-route of §Fix (b):
//
//   1. In `case "member"`, compute the receiver's type, unfold it through the
//      exported `unfoldAlias`, and — when it is a `named` whose declaration is
//      an object schema carrying an own key for `node.field` — return that
//      field's declared `CompatType`, itself unfolded so an alias-typed field
//      supplies the type it names (TYPE-11, docs/spec_topics/type-system.md:54;
//      rows a1 and c5 are its witnesses). The record's reader reuses the
//      existing own-key guard rather than indexing the record directly.
//   2. The enum half needs NO enum-name source and NO new read. When the
//      unfolded receiver is a `named` that resolves to no declaration, the arm
//      returns THE RECEIVER'S OWN `named` instead of `node.field`. For
//      `Color.Red` the receiver is `named "Color"` and `collectTypeEnv` records
//      no `enum`, so the receiver resolves to nothing and the arm hands back
//      `Color` — schemas.md:97's "statically typed as `Enum`" for free. That
//      same branch is the provably-inert answer for every other unresolvable
//      receiver: it returns a name the arm has proven resolves to nothing,
//      where `node.field` may accidentally resolve. That accident is the
//      wrong-type half, and group (d) is its witness in both directions.
//
// The arm's identity is the whole fix: it is read through the single public
// `typeOf` seam by both the recording walk and the checker-side delegation, so
// one resolution serves every consumer and no per-consumer split is available
// (§Fix's closing constraint).
//
// ── TIER: unit, offline, provider-free ──────────────────────────────────────
// Every parse row settles inside one `parseThetaDocument` call: the arm under
// test runs in the type layer of the load path and its whole observable is the
// document's aggregated `diagnostics` list. The runtime rows (h) need only the
// in-process production prompt-mode binding — no provider, no model, no child
// process, no network. An INTEGRATION tier would add a session round-trip that
// can observe neither the inferred `CompatType` nor the diagnostic list; a LIVE
// tier would put a stochastic model between the fixture and the assertion for
// no added coverage. Nothing in bug 0136's §Fix touches a live-exercised
// surface (the subagent child launch, the production drivers, the binder), so
// neither tier is required for THIS file. Nine registry rows do change
// reachability, which is an H9a `permitted-codes.json` question — that decision
// belongs to the fix run's own live pass, not to this witness.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// Parse rows: the shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39),
// which is the real `parseThetaDocument` behind inert offline seams — the same
// entry point the bug document's §Reproduction measured. Every fixture is
// §Reproduction's row verbatim with `---\nmode: prompt\n---\n` prepended and the
// trailing value that row already carries. Runtime rows: the production-executor
// shape `tests/non-object-receiver-gate.test.ts` establishes (`probeSource` /
// `producer` there) — `parseThetaDocument` → `createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody` — with a non-panic throw framed
// through `surfaceUnexpectedThrow` so the RED output names the leak.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source the string
// from that column. Every expected message below is read through
// `parseRegistry` + `registryMessage` (tools/code-registry/index.js) and
// interpolated; no registry prose is copied into a literal. The mechanism is the
// one tests/ctor-field-type-check.test.ts (`REGISTRY` / `registered`) and
// tests/brace-rooted-union-arm-capture.test.ts established.
//
// ── NO SILENT SKIPPING (CLAUDE.md) ──────────────────────────────────────────
// Nothing here early-returns or conditionally skips. A missing registry row
// throws NAMING the row, and a template missing the placeholder a row needs
// throws naming both — so a registry drift can never degrade an assertion into
// a comparison against `undefined`. Every parse row asserts its WHOLE ordered
// aggregated code list AND its whole ordered message list, so an absent
// emission, an extra emission and a reordering all red. The runtime rows assert
// a rendered disposition string, so "loaded and ran" can never read as
// "refused".
//
// ── BOTH DIRECTIONS ─────────────────────────────────────────────────────────
// Neutralising the fix (restoring `return { kind: "named", name: node.field }`)
// must red exactly the rows that measure it and leave the stated bounds green:
//
//   RED under neutralisation — (a)1/2/4; the nine member rows of (b);
//     (c)1–(c)8; (d)1/2/3/7/9/11/13/14/16/18/19; (e)1/3/4/5/6;
//     (x)8/9/10/13/18; (h)1/2/3.
//   GREEN in both directions — (e)7 (the object-index fence), all of (f) (the
//     sibling-arm tripwires), (h)5 (the absent-field disposition), (e)8,
//     (x)1/2/3/4/5/6/7/11/20, (d)4/5/6/8/10/12/15/17/20, every (b) control,
//     (c)9, (a)3.
//
// (e)1 and (e)3 red under neutralisation TOO. The bug document's §Fix (d) and
// §Expected behaviour predict both unchanged on the ground that `classifyReceiver`
// answers `"object"` and "the A2 gates keep deferring". That holds of
// `checkMemberAccess`, which early-returns on `kind === "unknown" || kind === "object"`,
// and is FALSE of `checkMethodCall`, which early-returns on `"unknown"` only and
// then gates `"object"` against `builtinMembers`. (e)1 and (e)3 are method
// calls, so they flip to their own controls' `unknown-method` — instances of
// §Expected behaviour's own rule "b-rows report the code their control reports",
// not a widening. The bound §Fix (d) actually protects is (e)7, and (e)7 is
// green in both directions.
//
// ── GOV-15 (g): NO NEW CORPUS WALK IS OWED HERE ─────────────────────────────
// The committed-corpus sweep is discharged by tests/committed-fixture-parse-gate.test.ts,
// which enumerates the corpus via `git ls-files '*.theta' '*.thetalib'` against
// hard expected counts and asserts `docs/examples/personas.thetalib` is a
// member — the corpus's only member read whose receiver is an object schema
// declared in the same file, i.e. the only GOV-15-reachable site. The bug
// document's claim that this gate "filters `.theta` only and witnesses neither
// committed `.thetalib`" is STALE (bug 0132 closed it), so no scratch corpus
// walk is written here and none is needed.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// Implementation references below name SYMBOLS, not line numbers: the bug
// document's implementation line citations have drifted, and the house posture
// for that class is disclosed-not-chased — symbols hold, lines drift. The one
// line span this file states is its own site, measured against this tree: the
// `case "member"` arm opens at src/parser/static-type-inference.ts:242 and
// closes at :279, and `case "member"` remains the anchor a reader searches for.
// Spec citations carry lines, each re-derived against the tree.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The parse-phase registry table, read from the spec corpus (DIAG-4). */
const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-parse.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * A registered code's normative *Message* with its placeholders interpolated.
 * Fails LOUDLY naming the row when the registry has none, and naming both row
 * and placeholder when the template does not carry one — never a skip, and
 * never a silent comparison against `undefined`.
 */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's only oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  let out = template;
  for (const [placeholder, value] of fills) {
    if (!out.includes(placeholder)) {
      throw new Error(
        `harness: the ${code} Message template does not carry ${placeholder}; template=${JSON.stringify(template)}`,
      );
    }
    out = out.replace(placeholder, value);
  }
  return out;
}

const UNKNOWN_METHOD = "theta/parse/unknown-method";
const MIXED_PLUS = "theta/parse/mixed-plus-operands";
const NON_INDEXABLE = "theta/parse/non-indexable-receiver";
const INTEGER_NARROWING = "theta/parse/integer-narrowing";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const NON_BOOLEAN_COND = "theta/parse/non-boolean-condition";
const ARRAY_ELEMENT = "theta/parse/array-element-type-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const SCHEMA_CASE = "theta/parse/schema-case-mismatch";
const UNKNOWN_VARIANT = "theta/parse/unknown-variant";
const UNKNOWN_IDENT = "theta/parse/unknown-identifier";
const EMPTY_SCHEMA_BODY = "theta/parse/empty-schema-body";
const SCHEMA_TYPE_NOT_EXPR = "theta/parse/schema-type-not-expression";
const ALIAS_CYCLE = "theta/parse/type-alias-cycle";
const NON_STRING_OBJECT_INDEX = "theta/parse/non-string-object-index";
const OBJECT_FIELD_MISMATCH = "theta/parse/object-field-type-mismatch";
const QUESTION_ON_NON_RESULT = "theta/parse/question-on-non-result";
const NON_ORDERABLE = "theta/parse/non-orderable-operands";

/** `unknown method '<method>' on type <type>` */
function unknownMethod(method: string, type: string): string {
  return msg(UNKNOWN_METHOD, [
    ["<method>", method],
    ["<type>", type],
  ]);
}

/** `'for' expects array<T> after 'in'; got <type>` */
function iterand(type: string): string {
  return msg(NON_ARRAY_ITERAND, [["<type>", type]]);
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` */
function letRhs(name: string, expected: string, actual: string): string {
  return msg(LET_RHS, [
    ["<name>", name],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
}

/** `condition must be boolean; got <type>` */
function condition(type: string): string {
  return msg(NON_BOOLEAN_COND, [["<type>", type]]);
}

// ===========================================================================
// Parse harness. `codes` / `msgs` are the WHOLE aggregated diagnostic list in
// emission order, unfiltered — the shape §Reproduction measured.
// ===========================================================================

/** Every fixture is `mode: prompt` (§Reproduction). */
const FM = "---\nmode: prompt\n---\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0136.theta");
}

function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

/**
 * One row's contract: the whole ordered code list AND the whole ordered message
 * list. Both are asserted, so a fix that restores a code while rendering a
 * value identifier into its `<type>` placeholder (the
 * placeholder-rendering-a.md:13–21 obligation §Fix carries) reds on the second
 * comparison rather than passing on the first.
 */
function expectRow(
  label: string,
  body: string,
  expected: { readonly codes: readonly string[]; readonly msgs: readonly string[] },
  why: string,
): ThetaDocument {
  const doc = parse(body);
  expect(
    doc.diagnostics.map((d) => d.code),
    `${label} — ${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.codes]);
  expect(
    doc.diagnostics.map((d) => d.message),
    `${label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry's *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.msgs]);
  return doc;
}

/** The empty contract — no diagnostic at all. */
const CLEAN = { codes: [] as readonly string[], msgs: [] as readonly string[] };

/** A one-diagnostic contract. */
function one(code: string, message: string): {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
} {
  return { codes: [code], msgs: [message] };
}

// ===========================================================================
// (a) The reported shape, and the control that separates it from bug 0125.
// ===========================================================================

const A1 =
  "schema L = array<string>\nschema P { xs: L }\nfn f(p: P) { let y = p.xs[0]  y.frobnicate() }\n1\n";
const A2 =
  "schema P { xs: array<string> }\nfn f(p: P) { let y = p.xs[0]  y.frobnicate() }\n1\n";
const A3 = "fn f(xs: array<string>) { let y = xs[0]  y.frobnicate() }\n1\n";
const A4 = "schema P { xs: array<string> }\nfn f(p: P) { p.xs[0].frobnicate() }\n1\n";

describe("bug 0136 (a) — a member read's static type is the field's DECLARED type", () => {
  it("RED a1: an ALIAS-typed field unfolds — `schema L = array<string>` + `xs: L` narrows to `string` at the index", () => {
    // a1 is the one row of this witness with no measured post-fix value: the
    // pre-measurement's log filter clipped its output line. Its answer is
    // DERIVED, and the derivation is closed: TYPE-11 (type-system.md:54) makes
    // the field's declared type transparent, so `unfoldAlias` resolves `L` to
    // `array<string>`; the index arm then narrows the element to `string`
    // exactly as it does for a2; and `frobnicate` is off `string`'s stdlib
    // surface (expressions.md:122). So a1's answer IS a2's, and c5 — the same
    // alias chain through the iterand gate — measures the same unfolding.
    expectRow(
      "a1",
      A1,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "the field's declared type is an alias of `array<string>`; TYPE-11 makes it transparent, so the index element is `string` and the method gate fires",
    );
  });

  it("RED a2: the CONCRETE-field control moves — which is what proves the fix is not bug 0125's alias route", () => {
    // The mis-attribution fence. Bug 0125 unfolded the INDEX arm and its
    // §Non-goals declined the member route; the proof it did not reach here is
    // that a1 and a2 are equally silent at HEAD, so the alias is not what is
    // lost. a2 carries no alias at all, so a fix that only unfolds cannot move
    // it. If a2 stays silent while a1 moves, the fix landed at the wrong arm.
    expectRow(
      "a2",
      A2,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "no alias anywhere: the concrete declared `array<string>` reaches the index arm through the member read",
    );
  });

  it("CONTROL a3: the directly-typed `fn` parameter is unchanged (bug 0125's fix, working)", () => {
    expectRow(
      "a3",
      A3,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "the array reaches the index arm directly, so the element narrows and the method gate fires — green in both directions",
    );
  });

  it("RED a4: the loss is not an artifact of the intervening `let`", () => {
    expectRow(
      "a4",
      A4,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "the member read is indexed and dispatched in one expression, with no binding to carry a type",
    );
  });
});

// ===========================================================================
// (b) The check inventory — eight registered codes, each against a
// directly-typed-binding control carrying the same operand type in the same
// position. §Expected behaviour: "b1–b18 report the code their control reports,
// with the control's message." Each pair asserts the control (which establishes
// the check is live for the operand), then the member row against the SAME
// expected lists, then the byte-identity of the two.
// ===========================================================================

const B: Readonly<Record<string, string>> = {
  b1: "schema P { s: string }\nfn f(p: P) { p.s.frobnicate() }\n1\n",
  b2: 'fn f() { let y: string = "a"  y.frobnicate() }\n1\n',
  b3: "schema P { s: string }\nfn f(p: P): string { p.s + 1 }\n1\n",
  b4: 'fn f(): string { let y: string = "a"  y + 1 }\n1\n',
  b5: "schema P { s: string }\nfn f(p: P) { p.s[0] }\n1\n",
  b6: 'fn f() { let y: string = "a"  y[0] }\n1\n',
  b7: "schema P { n: number }\nfn f(p: P) { let m: integer = p.n  m }\n1\n",
  b8: "fn f() { let y: number = 1.5  let m: integer = y  m }\n1\n",
  b9: 'schema P { xs: array<integer> }\nfn f(p: P): string { p.xs.join(",") }\n1\n',
  b10: 'fn f(): string { let y: array<integer> = [1]  y.join(",") }\n1\n',
  b11: "schema P { n: integer }\nfn f(p: P) { p.n.nope }\n1\n",
  b12: "fn f() { let y: integer = 1  y.nope }\n1\n",
  b13: "schema P { s: string }\nfn f(p: P) { let m: integer = p.s  m }\n1\n",
  b14: 'fn f() { let y: string = "a"  let m: integer = y  m }\n1\n',
  b15: "schema P { s: string }\nfn f(p: P): integer { if p.s { 1 } else { 2 } }\n1\n",
  b16: 'fn f(): integer { let y: string = "a"  if y { 1 } else { 2 } }\n1\n',
  b17: "schema P { s: string }\nfn f(p: P) { let xs: array<integer> = [p.s]  xs }\n1\n",
  b18: 'fn f() { let y: string = "a"  let xs: array<integer> = [y]  xs }\n1\n',
};

/**
 * One member/control pair. The control is asserted FIRST so a red on the pair
 * is never ambiguous: a control failure means the check itself moved, a member
 * failure means the declared field type is still not reaching it.
 */
function expectPair(
  memberLabel: string,
  controlLabel: string,
  expected: { readonly codes: readonly string[]; readonly msgs: readonly string[] },
  why: string,
): void {
  const control = expectRow(
    `${controlLabel} [control]`,
    B[controlLabel] as string,
    expected,
    `the check is live for this operand type in this position — green in both directions; ${why}`,
  );
  const member = expectRow(
    memberLabel,
    B[memberLabel] as string,
    expected,
    `the declared field type must reach the same check the control reaches; ${why}`,
  );
  expect(
    member.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    `${memberLabel} vs ${controlLabel} — §Expected behaviour: the member row reports the code ITS CONTROL reports, with the control's message; the two lists must be byte-identical`,
  ).toEqual(control.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

describe("bug 0136 (b) — eight registered codes reach a member read", () => {
  it("RED b1/b2: unknown-method on a `string` field", () => {
    expectPair(
      "b1",
      "b2",
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "expressions.md:122 — anything off the stdlib list is `theta/parse/unknown-method` rather than a runtime failure",
    );
  });

  it("RED b3/b4: mixed-plus-operands on a `string` field", () => {
    expectPair(
      "b3",
      "b4",
      one(
        MIXED_PLUS,
        msg(MIXED_PLUS, [
          ["<left>", "string"],
          ["<right>", "integer"],
        ]),
      ),
      "the `+` operand classifier answers `\"unknown\"` for a fabricated `named` and defers",
    );
  });

  it("RED b5/b6: non-indexable-receiver on a `string` field", () => {
    expectPair(
      "b5",
      "b6",
      one(NON_INDEXABLE, msg(NON_INDEXABLE, [["<type>", "string"]])),
      "expressions.md:10 — indexing a `string` is `theta/parse/non-indexable-receiver`",
    );
  });

  it("RED b7/b8: integer-narrowing on a `number` field", () => {
    expectPair(
      "b7",
      "b8",
      one(INTEGER_NARROWING, msg(INTEGER_NARROWING)),
      "the `integer → number` widening is one-way, and the compatibility engine answers `\"unknown\"` for an unresolvable operand",
    );
  });

  it("RED b9/b10: non-string-array-join on an `array<integer>` field", () => {
    expectPair(
      "b9",
      "b10",
      one(NON_STRING_JOIN, msg(NON_STRING_JOIN, [["<element>", "integer"]])),
      "`checkMethodCall`'s `join` guard requires the unfolded target to be an `array`, which a fabricated `named` never is",
    );
  });

  it("RED b11/b12: unknown-method on an `integer` field, memberless spelling", () => {
    expectPair(
      "b11",
      "b12",
      one(UNKNOWN_METHOD, unknownMethod("nope", "integer")),
      "the bare-member spelling routes through `checkMemberAccess` rather than `checkMethodCall`, so both A2 gates are covered",
    );
  });

  it("RED b13/b14: let-rhs-type-mismatch on a `string` field", () => {
    expectPair(
      "b13",
      "b14",
      one(LET_RHS, letRhs("m", "integer", "string")),
      "the `let` annotation sink decides the pair one position over on the same values",
    );
  });

  it("RED b15/b16: non-boolean-condition on a `string` field", () => {
    expectPair(
      "b15",
      "b16",
      one(NON_BOOLEAN_COND, condition("string")),
      "theta performs no truthiness coercion (control-flow.md:30)",
    );
  });

  it("RED b17/b18: let-rhs + array-element-type-mismatch on a `string` field in an array literal", () => {
    expectPair(
      "b17",
      "b18",
      {
        codes: [LET_RHS, ARRAY_ELEMENT],
        msgs: [
          letRhs("xs", "array<integer>", "array<string>"),
          msg(ARRAY_ELEMENT, [
            ["<i>", "0"],
            ["<expected>", "integer"],
            ["<actual>", "string"],
          ]),
        ],
      },
      "the element sink names the offending element, so this pair pins the ORDER of a two-diagnostic list as well as its membership",
    );
  });
});

// ===========================================================================
// (c) The ninth code, fired FALSELY on a spec-legal program. c1–c7 lose the
// refusal outright; c8 keeps the code and its message moves onto c9's — §Fix's
// one licensed message move.
// ===========================================================================

const C1 = "schema P { xs: array<string> }\nfn f(p: P) { for y in p.xs { y } }\n1\n";
const C2 = 'fn f() { let y: array<string> = ["a"]  for z in y { z } }\n1\n';
const C3 = "schema P { xs: array<string> }\nfn f(p: P) { par for y in p.xs { y } }\n1\n";
const C4 = 'fn f() { let y: array<string> = ["a"]  par for z in y { z } }\n1\n';
const C5 =
  "schema L = array<string>\nschema P { xs: L }\nfn f(p: P) { for y in p.xs { y } }\n1\n";
const C6 =
  "schema Q { xs: array<string> }\nschema P { q: Q }\nfn f(p: P) { for y in p.q.xs { y } }\n1\n";
const C7 = 'schema P { xs: array<string> }\nlet p = P { xs: ["a"] }\nfor y in p.xs { y }\n1\n';
const C8 = "schema P { s: string }\nfn f(p: P) { for y in p.s { y } }\n1\n";
const C9 = 'fn f() { let y: string = "a"  for z in y { z } }\n1\n';

describe("bug 0136 (c) — the false `non-array-iterand` on an array-typed field is removed", () => {
  it("RED c1: `for y in p.xs` over a field declared `array<string>` loads clean", () => {
    // `checkForIterand` is the one consumer that does not defer: it admits
    // `kind === "array"` alone, so a fabricated `named` is refused at `E`
    // severity and registration is denied. control-flow.md:13 admits this
    // loop, so the emission sits outside its own registered *Trigger*.
    expectRow("c1", C1, CLEAN, "control-flow.md:13 admits `for x in xs` for any `array<T>` iterand");
  });

  it("CONTROL c2: the directly-typed iterand is silent (green in both directions)", () => {
    expectRow("c2", C2, CLEAN, "the control the member row must match");
  });

  it("RED c3: `par for` behaves identically", () => {
    expectRow("c3", C3, CLEAN, "the `par for` iterand gate is the same shape as the plain one");
  });

  it("CONTROL c4: the directly-typed `par for` iterand is silent", () => {
    expectRow("c4", C4, CLEAN, "the `par for` control");
  });

  it("RED c5: an ALIAS-typed field iterand loads clean (TYPE-11, type-system.md:54)", () => {
    expectRow("c5", C5, CLEAN, "nested alias chains unfold, which TYPE-11 states in terms");
  });

  it("RED c6: a NESTED member read iterand loads clean", () => {
    expectRow("c6", C6, CLEAN, "`p.q.xs` resolves through two object-schema hops");
  });

  it("RED c7: a `let`-bound constructor receiver at top level loads clean", () => {
    expectRow("c7", C7, CLEAN, "the refusal does not need a `fn` parameter, so neither does its removal");
  });

  it("RED c8: a NON-array field keeps the refusal and its message becomes `got string`", () => {
    // §Fix's one licensed message move. `got s` renders a lowercase-first field
    // identifier in a `<type>` position, which placeholder-rendering-a.md:13–21
    // does not admit — lexical.md:15 forbids a lowercase-initial type name — so
    // the code is right today and the render is not. Post-fix the row matches
    // c9 byte-for-byte, which is the registry's `got <type>` template under the
    // declared field type.
    expectRow(
      "c8",
      C8,
      one(NON_ARRAY_ITERAND, iterand("string")),
      "the code is correct (a `string` is not an `array<T>`) and only the render moves, onto c9's",
    );
  });

  it("CONTROL c9: the directly-typed non-array iterand is the render c8 must match", () => {
    expectRow("c9", C9, one(NON_ARRAY_ITERAND, iterand("string")), "the message c8 moves onto");
  });
});

// ===========================================================================
// (d) The fabricated name is LOOKUPABLE, so the erasure is also a wrong-type.
// A declaration whose name matches the fabricated spelling is adopted as the
// expression's type. Field names are lowercase-first and schema names
// uppercase-first (lexical.md:15), so a FIELD collision needs an ill-cased
// declaration; enum VARIANT names share the PascalCase namespace with schema
// names, so that collision needs no ill-formed input at all.
//
// Several post-fix values here are MEASURED truths that a naive reading of
// §Fix would get wrong; each is pinned as measured and its comment says why.
// ===========================================================================

const D: Readonly<Record<string, string>> = {
  d1: 'schema xs = array<integer>\nschema P { xs: string }\nfn f(p: P): string { p.xs.join(",") }\n1\n',
  d2: 'schema P { xs: string }\nfn f(p: P): string { p.xs.join(",") }\n1\n',
  d3: "schema xs = string\nschema P { xs: integer }\nfn f(p: P) { let m: integer = p.xs  m }\n1\n",
  d4: "schema P { xs: integer }\nfn f(p: P) { let m: integer = p.xs  m }\n1\n",
  d5: "enum Color { Red }\nschema Red = array<integer>\n1\n",
  d6: "enum Color { Red }\nschema Red { a: string }\n1\n",
  d7: 'enum Color { Red, Green }\nschema Red = array<integer>\nfn f(): string { Color.Red.join(",") }\n1\n',
  d8: 'enum Color { Red, Green }\nfn f(): string { Color.Red.join(",") }\n1\n',
  d9: "enum Color { Red }\nschema Red = string\nfn f() { let m: integer = Color.Red  m }\n1\n",
  d10: "enum Color { Red }\nfn f() { let m: integer = Color.Red  m }\n1\n",
  d11: "enum Color { Red }\nschema Red = string\nfn f() { Color.Red.frobnicate() }\n1\n",
  d12: "enum Color { Red }\nfn f() { Color.Red.frobnicate() }\n1\n",
  d13: "enum Color { Red }\nschema Red { a: string }\nfn f() { Color.Red.frobnicate() }\n1\n",
  d14: 'enum Color { Red }\nschema Red = integer\nfn f(): string { Color.Red + "x" }\n1\n',
  d15: 'enum Color { Red }\nfn f(): string { Color.Red + "x" }\n1\n',
  d16: "enum Color { Red }\nschema Red = string\nfn f() { Color.Red[0] }\n1\n",
  d17: "enum Color { Red }\nfn f() { Color.Red[0] }\n1\n",
  d18: "enum Color { Red }\nschema Red = array<string>\nfn f() { for y in Color.Red { y.frobnicate() } }\n1\n",
  d19: "enum Color { Red }\nfn f() { for y in Color.Red { y.frobnicate() } }\n1\n",
  d20: "enum Severity { Low }\nlet s = Severity.Critical\n1\n",
};

describe("bug 0136 (d) — no declaration elsewhere in the file can change a member read's type", () => {
  it("RED d1: the ill-cased `schema xs` collision disappears; the DECLARED `xs: string` drives the code", () => {
    // MEASURED, and not what a naive reading predicts. The collision-driven
    // `non-string-array-join` goes, but the row does not become `[]`: the field
    // is declared `string`, so `join` becomes an unknown method ON `string`
    // (expressions.md:122). The `schema-case-mismatch` is the declaration's
    // own, untouched — this fixture never registers in either direction.
    expectRow(
      "d1",
      D.d1 as string,
      {
        codes: [SCHEMA_CASE, UNKNOWN_METHOD],
        msgs: [msg(SCHEMA_CASE), unknownMethod("join", "string")],
      },
      "the unrelated `schema xs` stops supplying the type, and the declared field type supplies it instead",
    );
  });

  it("RED d2: d1's CONTROL moves too — the declared `xs: string` has no `join`", () => {
    // MEASURED. §Reproduction records this control as `[]`, and it does not
    // stay `[]`: with no collision at all the declared field type is still
    // `string`, so the same `unknown-method` fires. The pair therefore closes
    // in the same place, which is what makes d1's remaining diagnostic
    // attributable to the DECLARATION rather than to the collision.
    expectRow(
      "d2",
      D.d2 as string,
      one(UNKNOWN_METHOD, unknownMethod("join", "string")),
      "no collision, and the declared field type alone reaches the method gate",
    );
  });

  it("RED d3: the false `let-rhs-type-mismatch: … got xs` disappears, leaving the case rule alone", () => {
    // `got xs` renders a field identifier in a `<type>` position, which
    // placeholder-rendering-a.md:13–21 does not admit. The field is declared
    // `integer` and the annotation is `integer`, so nothing is owed but the
    // declaration's own case diagnostic.
    expectRow(
      "d3",
      D.d3 as string,
      one(SCHEMA_CASE, msg(SCHEMA_CASE)),
      "the collision was the only source of the mismatch; the declared `integer` is compatible with the `integer` annotation",
    );
  });

  it("CONTROL d4: the same body without the collision stays clean", () => {
    expectRow("d4", D.d4 as string, CLEAN, "green in both directions");
  });

  it("CONTROL d5: `enum Color { Red }` beside `schema Red = array<integer>` is two well-formed declarations", () => {
    // The premise of the whole enum half: lexical.md:15 puts enum variant names
    // and schema names in ONE PascalCase namespace, and no check objects to the
    // pair. So every d7–d19 row is a theta whose only defect is this one.
    expectRow("d5", D.d5 as string, CLEAN, "the declaration pair alone reports nothing");
  });

  it("CONTROL d6: the same pair with an OBJECT schema is equally well-formed", () => {
    expectRow("d6", D.d6 as string, CLEAN, "the object-schema spelling of the collision premise");
  });

  it("RED d7: `Color.Red.join(\",\")` stops acquiring `array<integer>` from an unrelated `schema Red`", () => {
    // schemas.md:97 states the answer outright: `Color.Red` is statically typed
    // `Color`. The structural enum sub-route delivers it — the receiver
    // `named "Color"` resolves to no declaration (`collectTypeEnv` records no
    // `enum`), so the arm returns the receiver and the expression defers, which
    // is type-system.md:48's posture and exactly what d8 already measures.
    expectRow("d7", D.d7 as string, CLEAN, "the collision is gone and the row collapses onto its control d8");
  });

  it("CONTROL d8: the same file without `schema Red` reports nothing", () => {
    expectRow("d8", D.d8 as string, CLEAN, "green in both directions");
  });

  it("RED d9: `let m: integer = Color.Red` stops drawing `let-rhs-type-mismatch: … got Red`", () => {
    // `got Red` is the worst of the three renders: it names a real identifier
    // that names something other than what the message claims. The enum
    // sub-route inherits one bound: it removes the collision WITHOUT adding a
    // check, because `Color` itself is absent from the `TypeEnv`. So this row
    // becomes `[]`, matching d10; it does not become a correct rejection.
    expectRow("d9", D.d9 as string, CLEAN, "the row collapses onto its control d10");
  });

  it("CONTROL d10: the same body without `schema Red` reports nothing", () => {
    expectRow("d10", D.d10 as string, CLEAN, "green in both directions");
  });

  it("RED d11: `Color.Red.frobnicate()` stops drawing `unknown method 'frobnicate' on type Red`", () => {
    expectRow("d11", D.d11 as string, CLEAN, "the row collapses onto its control d12");
  });

  it("CONTROL d12: the same body without `schema Red` reports nothing", () => {
    expectRow("d12", D.d12 as string, CLEAN, "green in both directions");
  });

  it("RED d13: an OBJECT-schema collision closes too", () => {
    // d13 collides through `classifyReceiver`'s `"object"` answer rather than
    // through `unfoldAlias`, so it pins that the fix removes BOTH resolution
    // paths into the collision and not the alias one alone.
    expectRow("d13", D.d13 as string, CLEAN, "the object-schema route into the collision, closed by the same branch");
  });

  it("RED d14: `Color.Red + \"x\"` stops drawing `mixed operand types: Red and string`", () => {
    expectRow("d14", D.d14 as string, CLEAN, "the row collapses onto its control d15");
  });

  it("CONTROL d15: the same body without `schema Red` reports nothing", () => {
    expectRow("d15", D.d15 as string, CLEAN, "green in both directions");
  });

  it("RED d16: `Color.Red[0]` stops drawing `non-indexable-receiver: … got Red`", () => {
    expectRow("d16", D.d16 as string, CLEAN, "the row collapses onto its control d17");
  });

  it("CONTROL d17: the same body without `schema Red` reports nothing", () => {
    expectRow("d17", D.d17 as string, CLEAN, "green in both directions");
  });

  it("RED d18: the collision stops REMOVING a correct refusal — `got Color`", () => {
    // MEASURED, and the direction is the opposite of d7–d16: here the unrelated
    // `schema Red` makes an enum variant look like an `array<string>` and the
    // refusal disappears. Post-fix the iterand is typed `Color`, which is not
    // an `array<T>`, so the refusal returns. The body stays silent for bug
    // 0126's independent reason (a plain `for` writes no loop variable into the
    // type layer's bindings), so `y.frobnicate()` still reports nothing — the
    // two defects compose and neither fix alone makes that half report.
    expectRow(
      "d18",
      D.d18 as string,
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "an enum variant is not an `array<T>`, whatever an unrelated schema is named",
    );
  });

  it("RED d19: the control's message ALSO moves, `got Red` → `got Color`", () => {
    // MEASURED. A derived, strictly-more-admissible render:
    // placeholder-rendering-a.md:19 admits a named enum "by their theta-side
    // identifier", and no clause of :13–21 admits a VARIANT name. So the move
    // takes the render from inadmissible to admissible, and it is entailed by
    // schemas.md:97 rather than elective.
    expectRow(
      "d19",
      D.d19 as string,
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "schemas.md:97 — `Enum.Variant` is statically typed as `Enum`, so the `<type>` placeholder renders the enum",
    );
  });

  it("CONTROL d20: the variant-EXISTENCE checker is byte-unchanged", () => {
    // The check that reads variant names correctly, which locates the defect in
    // the type arm rather than in variant resolution generally. Green in both
    // directions.
    expectRow(
      "d20",
      D.d20 as string,
      one(UNKNOWN_VARIANT, msg(UNKNOWN_VARIANT, [
        ["<variant>", "Critical"],
        ["<enum>", "Severity"],
      ])),
      "unaffected in both directions",
    );
  });
});

// ===========================================================================
// (e) Every route to a member read behaves identically — the route bounds.
// ===========================================================================

const E1 = "schema Q { a: string }\nschema P { q: Q }\nfn f(p: P) { p.q.frobnicate() }\n1\n";
const E2 = "schema Q { a: string }\nfn f(q: Q) { q.frobnicate() }\n1\n";
const E3 = "schema Q { s: string }\nschema P { q: Q }\nfn f(p: P) { p.q.s.frobnicate() }\n1\n";
const E4 = 'schema P { s: string }\nlet p = P { s: "a" }\np.s.frobnicate()\n1\n';
const E5 = 'schema P { s: string }\nlet p: P = P { s: "a" }\np.s.frobnicate()\n1\n';
const E6 = "schema P { s: string }\nschema Q = P\nfn f(q: Q) { q.s.frobnicate() }\n1\n";
const E7 = 'schema P { s: string }\nfn f(p: P) { let y = p["s"]  y.frobnicate() }\n1\n';
const E8 = "schema P { s: string }\nfn f(p: P) { p.zzz.frobnicate() }\n1\n";

describe("bug 0136 (e) — the five receiver routes, and the two bounds", () => {
  it("RED e1: an OBJECT-schema-typed field flips to its own control's `unknown-method`", () => {
    // The bug document's §Fix (d) and §Expected behaviour predict e1 unchanged,
    // reasoning that `classifyReceiver` answers `"object"` and the A2 gates
    // keep deferring. That is true of `checkMemberAccess` — it early-returns on
    // `kind === "unknown" || kind === "object"` — and FALSE of
    // `checkMethodCall`, which early-returns on `"unknown"` only and then gates
    // `"object"` against `builtinMembers`. e1 is a METHOD CALL, so once `p.q`
    // types as `Q` the gate fires with e2's exact message. TYPE-10
    // (type-system.md:52) still holds: the field's declared type is returned as
    // the object schema's own `named`, nominal, with no union of field types
    // anywhere — which is the bound (d) actually protects, and e7 measures it.
    expectRow(
      "e1",
      E1,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "Q")),
      "an object-schema-typed field returns that schema's own `named` (TYPE-10), and `checkMethodCall` does not defer on `\"object\"`",
    );
  });

  it("CONTROL e2: the object-schema `fn` parameter already reports it today", () => {
    expectRow(
      "e2",
      E2,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "Q")),
      "the message e1 moves onto — green in both directions",
    );
  });

  it("RED e3: a NESTED member read flips to `unknown method 'frobnicate' on type string`", () => {
    // The same correction as e1: a method call, so `checkMethodCall`'s
    // `"object"` fall-through applies at the outer hop while the inner hop
    // resolves `p.q` to `Q` and then `Q.s` to `string`.
    expectRow(
      "e3",
      E3,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "two object-schema hops resolve, so the innermost declared type reaches the gate",
    );
  });

  it("RED e4: a `let`-bound CONSTRUCTOR receiver resolves", () => {
    expectRow("e4", E4, one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")), "the constructor route");
  });

  it("RED e5: an ANNOTATED `let` receiver resolves", () => {
    expectRow("e5", E5, one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")), "the `let`-annotation route");
  });

  it("RED e6: an ALIAS of an object schema resolves (TYPE-11 into TYPE-10)", () => {
    expectRow(
      "e6",
      E6,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "type-system.md:54 — aliasing an object schema unfolds to that object schema, which then participates under TYPE-10's nominal rules",
    );
  });

  it("BOUND e7: the OBJECT-INDEX arm is untouched — `[]` in BOTH directions", () => {
    // THE OBJECT-INDEX FENCE. expressions.md:10 states the object-index result
    // type ("the union of the receiver's declared field types") and the
    // implementation does not derive it; that is the separate report bug 0125's
    // §Non-goals names, and bug 0136's §Non-goals declines it in terms. A RED
    // here means the fix widened into the object-index arm — a distinguishable
    // failure, and the reason this row is in this file rather than 0125's.
    expectRow(
      "e7",
      E7,
      CLEAN,
      "`p[\"s\"]` is the neighbouring spelling with its own unmet obligation; a diagnostic here means the fix reached for the union of declared field types",
    );
  });

  it("BOUND e8: an ABSENT field still defers at parse — §Fix (c)", () => {
    // expressions.md:9 assigns an absent theta-side name a RUNTIME
    // `theta/runtime/missing-object-key` panic, not a parse diagnostic. Under
    // the settled route a field with no own key in the declared-fields record
    // falls through to the deferring branch. h5 measures the runtime half.
    expectRow(
      "e8",
      E8,
      CLEAN,
      "the absent-field disposition is specified and must not move; a diagnostic here is a widening §Fix (c) forbids",
    );
  });
});

// ===========================================================================
// (f) The sibling `named`-mint arms — TRIPWIRES. Byte-identical pre and post.
// A RED here means the fix widened into a sibling arm of the same switch, each
// of which needs its own resolution source and none of which is fixed by
// resolving a field against a schema.
// ===========================================================================

const F1 = 'fn g(): array<string> { ["a"] }\nfor y in g() { y }\n1\n';
const F2 = 'let s: string = "a,b"\nfor y in s.split(",") { y }\n1\n';
const F3 = "for y in zzz { y }\n1\n";

describe("bug 0136 (f) — the sibling-arm tripwires stay byte-identical", () => {
  it("TRIPWIRE f1: `case \"call\"` still types a call by its callee name (`got g`)", () => {
    expectRow(
      "f1",
      F1,
      one(NON_ARRAY_ITERAND, iterand("g")),
      "the `call` arm needs the declared-return-annotation collector as its source; a move here means the fix widened into it",
    );
  });

  it("TRIPWIRE f2: `case \"method-call\"` still types a method call by its method name (`got split`)", () => {
    expectRow(
      "f2",
      F2,
      one(NON_ARRAY_ITERAND, iterand("split")),
      "the `method-call` arm needs the stdlib signature table as its source; a move here means the fix widened into it",
    );
  });

  it("TRIPWIRE f3: `case \"ident\"` keeps the documented nominal fallback on a free name", () => {
    expectRow(
      "f3",
      F3,
      {
        codes: [UNKNOWN_IDENT, NON_ARRAY_ITERAND],
        msgs: [msg(UNKNOWN_IDENT, [["<name>", "zzz"]]), iterand("zzz")],
      },
      "type-system.md:48 — a genuinely free name IS past the parser's static view, so the fallback is correct here and must survive",
    );
  });
});

// ===========================================================================
// (x) Sub-case bounds. These fixtures are RECONSTRUCTED from the
// pre-measurement's row labels and messages (§Reproduction carries no source
// for them); each was re-measured at this HEAD against the pre-fix baseline
// before being pinned, so every row's pre-fix column is measured and its
// post-fix column is the measured prototype value. Each row states its purpose
// in one clause.
//
// x20 is the one row whose reconstruction does NOT reproduce the
// pre-measurement's value, so it is pinned to what this tree measures and its
// own comment carries the derivation — a deferral bound, not a resolved route.
// ===========================================================================

const X: Readonly<Record<string, string>> = {
  // §Fix (c): an object-schema `NamedDecl` whose `fields` record is absent.
  x1: "schema P\nfn f(p: P) { p.s.frobnicate() }\n1\n",
  // §Fix (c)/(d): a receiver that unfolds to a PRIMITIVE, not an object schema.
  x2: "schema P = string\nfn f(p: P) { p.s }\n1\n",
  // §Fix (c): a field whose `typeSource` the annotation converter declined.
  x3: "schema P { s: string + }\nfn f(p: P) { p.s.frobnicate() }\n1\n",
  // §Fix (d): an inline-object field type does not become a narrowing source.
  x4: "schema P { q: { a: string } }\nfn f(p: P) { p.q.frobnicate() }\n1\n",
  // §Fix (d): a union field type does not become a narrowing source.
  x5: "schema P { u: string | integer }\nfn f(p: P) { p.u.frobnicate() }\n1\n",
  // The enum-in-TypeEnv bound: an enum-typed field still resolves to nothing.
  x6: "enum Color { Red }\nschema P { c: Color }\nfn f(p: P) { p.c.frobnicate() }\n1\n",
  // A cycle participant is omitted from the TypeEnv, so unfolding leaves it.
  x7: "schema A = B\nschema B = A\nfn f(a: A) { a.s.frobnicate() }\n1\n",
  // A newly reachable row: the object-index KEY-TYPE gate on a resolved field.
  x8: "schema Q { a: string }\nschema P { q: Q }\nfn f(p: P) { p.q[0] }\n1\n",
  // A newly reachable row at the constructor-field sink.
  x9: 'schema S { n: number }\nschema P { x: string }\nlet p = P { x: "s" }\nlet s = S { n: p.x }\ns\n',
  // A newly reachable row at the `?` operand gate.
  x10: "schema P { n: number }\nlet p = P { n: 5 }\nlet v = p.n?\nv\n",
  // The residual boundary: the fn-argument sink still WITHHOLDS.
  x11: "schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.s) }\n1\n",
  // A newly reachable row at the ordering-comparison gate.
  x13: "schema P { s: string }\nfn f(p: P): boolean { p.s < 1 }\n1\n",
  // The `while` condition, the second condition position after `if` (b15).
  x18: "schema P { s: string }\nfn f(p: P) { while p.s { 1 } }\n1\n",
};

/** x20's receiver is a `params:` field, so this row carries its own frontmatter. */
const X20 =
  "---\nmode: prompt\nparams:\n  p: P\n---\nschema P { s: string }\nif p.s { 1 } else { 2 }\n";

describe("bug 0136 (x) — the sub-case bounds §Fix (c) and (d) require asserted, not assumed", () => {
  it("BOUND x1: a schema with NO fields record defers — its own `empty-schema-body` alone", () => {
    expectRow(
      "x1",
      X.x1 as string,
      one(EMPTY_SCHEMA_BODY, msg(EMPTY_SCHEMA_BODY, [["<X>", "P"]])),
      "§Fix (c): the `fields` property is optional, so an absent record falls through to the deferring branch and adds nothing",
    );
  });

  it("BOUND x2: an ALIAS-OF-PRIMITIVE receiver keeps its present disposition", () => {
    expectRow(
      "x2",
      X.x2 as string,
      one(UNKNOWN_METHOD, unknownMethod("s", "P")),
      "the receiver unfolds to `string`, which carries no `s` member; the message names the author's declared type, unchanged in both directions",
    );
  });

  it("BOUND x3: a DECLINED field `typeSource` defers — its own refusal alone", () => {
    expectRow(
      "x3",
      X.x3 as string,
      one(SCHEMA_TYPE_NOT_EXPR, msg(SCHEMA_TYPE_NOT_EXPR, [["<X>", "P"]])),
      "§Fix (c): a field the annotation converter declined has no `CompatType` to return, so the arm defers and adds nothing",
    );
  });

  it("BOUND x4: an INLINE-OBJECT field type adds no check", () => {
    expectRow("x4", X.x4 as string, CLEAN, "§Fix (d): the inline-object form is not a narrowing source");
  });

  it("BOUND x5: a UNION field type adds no check", () => {
    expectRow("x5", X.x5 as string, CLEAN, "§Fix (d): the union form is not a narrowing source");
  });

  it("BOUND x6: an ENUM-typed field adds no check — enums are absent from the TypeEnv", () => {
    expectRow(
      "x6",
      X.x6 as string,
      CLEAN,
      "the recorded non-goal that bounds how much the enum half can recover: `collectTypeEnv` records `schema` declarations only",
    );
  });

  it("BOUND x7: an ALIAS-CYCLE receiver keeps its own refusal alone", () => {
    expectRow(
      "x7",
      X.x7 as string,
      one(ALIAS_CYCLE, msg(ALIAS_CYCLE, [["<path>", "A → B → A"]])),
      "a cycle participant is omitted from the TypeEnv, so `unfoldAlias` leaves it intact and the arm defers",
    );
  });

  it("RED x8: the object-index KEY-TYPE gate becomes reachable on a resolved field", () => {
    expectRow(
      "x8",
      X.x8 as string,
      one(NON_STRING_OBJECT_INDEX, msg(NON_STRING_OBJECT_INDEX, [["<type>", "integer"]])),
      "expressions.md:10 — an object receiver's index must be `string`; resolving `p.q` to `Q` makes the receiver an object and brings the gate into reach",
    );
  });

  it("RED x9: the CONSTRUCTOR-FIELD sink becomes reachable on a member read", () => {
    // This row is in the addition inventory and is NOT in the bug document's
    // nine-code list. The registered *Trigger* carries its own qualifier —
    // "where the field value's type is statically resolvable" — so the pre-fix
    // silence sits OUTSIDE the row and the post-fix emission sits inside it,
    // which is the diagnostic-registry carve-out
    // (source-language-stability.md:25) in its textbook shape.
    expectRow(
      "x9",
      X.x9 as string,
      one(
        OBJECT_FIELD_MISMATCH,
        msg(OBJECT_FIELD_MISMATCH, [
          ["<field>", "n"],
          ["<schema>", "S"],
          ["<expected>", "number"],
          ["<actual>", "string"],
        ]),
      ),
      "the constructor-field check's resolvability qualifier is what moves; the field value is now provably `string` against a declared `number`",
    );
  });

  it("RED x10: the `?` OPERAND gate becomes reachable on a member read", () => {
    // Also outside the bug document's nine-code inventory. The registered
    // *Trigger* is "`?` applied to an operand whose Theta static type is not
    // `Result<T, QueryError>`"; post-fix `p.n` is `number`, squarely inside it.
    expectRow(
      "x10",
      X.x10 as string,
      one(QUESTION_ON_NON_RESULT, msg(QUESTION_ON_NON_RESULT, [["<type>", "number"]])),
      "a primitive field read is statically not a `Result`, so the static gate decides it instead of the runtime guard",
    );
  });

  it("BOUND x11: the FN-ARGUMENT sink still WITHHOLDS on a now-provable member read", () => {
    // THE RESIDUAL BOUNDARY. `provableArgType`'s `case "member"` returns
    // `undefined` unconditionally, and bug 0136's settled route does not touch
    // it: the route enumerates the inference arm and its consumers, not the
    // sink's own identity channel. So `g(p.s)` with `p.s: string` against
    // `fn g(n: integer)` stays silent — which is exactly why
    // tests/fn-arg-type-mismatch-wired.test.ts's 84 cells stay green across
    // this fix. OPENING THAT SINK IS OUT OF 0136's SCOPE and would flip that
    // protected witness; it belongs to its own report. A RED here means the fix
    // widened past its route.
    expectRow(
      "x11",
      X.x11 as string,
      CLEAN,
      "the fn-argument sink's withholding is independent of the inference arm and is not 0136's to open",
    );
  });

  it("RED x13: the ORDERING-comparison gate becomes reachable on a member read", () => {
    expectRow(
      "x13",
      X.x13 as string,
      one(
        NON_ORDERABLE,
        msg(NON_ORDERABLE, [
          ["<op>", "<"],
          ["<left>", "string"],
          ["<right>", "integer"],
        ]),
      ),
      "a numeric operand against a `string` is non-orderable; the fourth code outside the bug document's nine-code inventory",
    );
  });

  it("RED x18: the `while` condition is the second condition position", () => {
    expectRow(
      "x18",
      X.x18 as string,
      one(NON_BOOLEAN_COND, condition("string")),
      "control-flow.md:30 — a `while` condition must be `boolean`, so the condition check covers both positions rather than `if` (b15) alone",
    );
  });

  it("BOUND x20: a frontmatter `params:` receiver DEFERS — `[]` in BOTH directions", () => {
    // MEASURED `[]`, and the reason sits at a position disjoint from this arm.
    // (a) The receiver route is a frontmatter `params:` field of object-schema
    // type, read in an `if` condition at the body's top level. (b) It defers
    // because that field carries no declared TYPE into the top-level walk:
    // `checkTypeLayer` threads the `params:` field names into
    // `collectLocalBinderNames` alone — a shadowing / call-site NAME set — and
    // then starts the walk with an empty bindings map, so nothing records `p`'s
    // declared `P`. Contrast `walkFn`, which seeds each parameter's declared
    // type into the fn's own scope map: that is the mechanism every one of the
    // five §Reproduction (e) receiver routes rides, and it is why the same body
    // inside `fn f(p: P)` reports (row b15). With no declared type recorded, `p`
    // types through the `ident` arm's nominal fallback as `named "p"`, which
    // resolves to no declaration, so this arm returns the receiver and defers —
    // §Fix (a)/(c)'s specified behaviour for an unresolvable receiver, not a
    // defect in it. (c) The gap is therefore at the BINDING position, the same
    // shape bug 0126 files for the plain-`for` loop variable at a third
    // position, and this row is a bound the fix PRESERVES rather than a route it
    // closes: `[]` whether the arm resolves the field type or not.
    const doc = parseDoc(X20, "bug0136.theta");
    expect(
      doc.diagnostics.map((d) => d.code),
      `x20 — a frontmatter \`params:\` receiver carries no declared type into the top-level walk, so the read is unresolvable and every check defers\n  actual diagnostics: ${render(doc)}`,
    ).toEqual([]);
    expect(
      doc.diagnostics.map((d) => d.message),
      `x20 — total silence is the pin, in both directions\n  actual diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});

// ===========================================================================
// (h) The runtime the registering theta reaches. h1–h3 are the rows that prove
// the fix REMOVES a runtime outcome rather than merely adding a diagnostic:
// post-fix each carries an `E`-severity `theta/parse/*`, the load path drops it
// (`hasLoadParseError`), and the body is never evaluated. h4 is the legal
// control. h5 is §Fix (c)'s bound.
//
// Harness: the production-executor shape tests/non-object-receiver-gate.test.ts
// establishes. Offline, provider-free, no child process.
// ===========================================================================

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    // `sendMessage` satisfies the theta-system-note channel; the active-tools
    // pair satisfies the snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** The site `surfaceUnexpectedThrow` frames a non-panic throw against. */
const SITE = {
  file: "bug0136.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/** One row's disposition: refused by the load, evaluated, or thrown out of. */
type Run =
  | { readonly kind: "refused"; readonly doc: ThetaDocument }
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/**
 * Parse `body`; an `error`-severity diagnostic means the load path drops the
 * theta and the body never runs, so report `refused`. Otherwise drive it
 * through the production prompt-mode binding and report what it evaluated to,
 * capturing a throw (a raw non-panic Error propagates out of `executeBody`).
 * No branch skips: every disposition is asserted against below.
 */
async function run(body: string): Promise<Run> {
  const doc = parse(body);
  if (errors(doc.diagnostics).length > 0) {
    return { kind: "refused", doc };
  }
  const theta: ThetaCompositionInput = {
    slashName: "bug0136",
    sourcePath: "/theta/bug0136.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}

/**
 * A row's disposition as one comparable string, so the RED output names the
 * value or the abort that actually arrived rather than only reporting "no
 * diagnostic".
 */
function disposition(r: Run): string {
  if (r.kind === "refused") {
    return `REFUSED AT PARSE — ${errors(r.doc.diagnostics)
      .map((d) => d.code)
      .join(", ")}`;
  }
  if (r.kind === "value") {
    return `LOADED AND RAN — outcome=${r.execution.outcome}, value=${JSON.stringify(r.execution.result.value)}`;
  }
  const thrown = r.thrown;
  if (isThetaPanic(thrown)) {
    const panic = thrown as { readonly code: string; readonly message: string };
    return `LOADED AND PANICKED — ${panic.code}: ${panic.message}`;
  }
  const diag = surfaceUnexpectedThrow(thrown, SITE);
  return `LOADED AND THREW — ${String(diag?.code)}: ${String(diag?.message)}`;
}

describe("bug 0136 (h) — the runtime outcomes the fix removes, and the one it preserves", () => {
  /**
   * h1–h3's post-fix code list is DERIVED, not measured: the pre-measurement's
   * observable table covers the parse rows only. The derivation is closed —
   * each h-body is a b-row body plus a call of the same `fn` on a well-typed
   * constructor, and each h-row parses to `[]` at this HEAD exactly as its
   * b-row does, so the added lines contribute no diagnostic in either
   * direction. h1's list is therefore b1's, h2's is b9's and h3's is b7's,
   * each measured under the prototype.
   */
  async function expectRefused(
    label: string,
    body: string,
    code: string,
    why: string,
  ): Promise<void> {
    expect(
      disposition(await run(body)),
      `${label} — ${why}. The code is ${code}, error-severity, so the load path drops the theta and the body is NEVER EVALUATED — the fix removes a runtime outcome rather than merely adding a diagnostic`,
    ).toBe(`REFUSED AT PARSE — ${code}`);
  }

  it("RED h1: `p.s.frobnicate()` is refused at PARSE, so `theta/runtime/internal-error` is unreachable", async () => {
    // expressions.md:122 names the disposition this input does not get today:
    // "Anything not on this list is `theta/parse/unknown-method` rather than a
    // runtime failure." At HEAD the string stdlib dispatcher's `default` arm
    // throws a plain Error that `surfaceUnexpectedThrow` frames onto the
    // runtime-defect surface, carrying an interpreter-internal string to the
    // operator instead of a diagnostic at the offending span.
    await expectRefused(
      "h1",
      'schema P { s: string }\nfn f(p: P) { p.s.frobnicate() }\nlet z = f(P { s: "a" })\nz\n',
      UNKNOWN_METHOD,
      "the runtime-defect abort is replaced by the parse rejection b1 measures",
    );
  });

  it("RED h2: `p.xs.join(\",\")` on `array<integer>` is refused at PARSE, so the JS coercion never happens", async () => {
    // expressions.md:108's `join` row admits a `string` element type only, and
    // theta 1.0 performs no implicit conversion. At HEAD the call succeeds and
    // returns a coerced value — a silent success, not a failure.
    await expectRefused(
      "h2",
      'schema P { xs: array<integer> }\nfn f(p: P): string { p.xs.join(",") }\nlet z = f(P { xs: [1, 2] })\nz\n',
      NON_STRING_JOIN,
      "the parse-time precondition `join`'s implementation asserts is restored, so the coercion is unreachable",
    );
  });

  it("RED h3: a `number` field into an `integer`-annotated binding is refused at PARSE", async () => {
    await expectRefused(
      "h3",
      "schema P { n: number }\nfn f(p: P): integer { let m: integer = p.n  m }\nlet z = f(P { n: 1.5 })\nz\n",
      INTEGER_NARROWING,
      "the one-way `integer → number` widening is enforced, so a non-integral value cannot leave an `integer`-annotated binding",
    );
  });

  it("CONTROL h4: the LEGAL member read still loads clean and still evaluates", async () => {
    // The row an over-broad fix breaks first. Green in both directions.
    const body = 'schema P { s: string }\nfn f(p: P): string { p.s }\nlet z = f(P { s: "a" })\nz\n';
    expectRow("h4", body, CLEAN, "a well-typed member read must keep loading with zero diagnostics");
    expect(
      disposition(await run(body)),
      "CONTROL BROKEN — h4 is the proof that resolving the declared field type does not refuse correct programs, and that the harness executes",
    ).toBe('LOADED AND RAN — outcome=success, value="a"');
  });

  it("BOUND h5: an ABSENT field still parses clean and still panics missing-object-key", async () => {
    // §Fix (c)'s bound, and the runtime half of e8. expressions.md:9 assigns
    // the panic, so the parse silence is the SPECIFIED disposition and not a
    // second defect. A RED here means the fix changed the absent-field
    // disposition — a distinguishable failure from a widening at the
    // object-index arm (e7) or at a sibling arm (group (f)).
    const body = 'schema P { s: string }\nfn f(p: P) { p.zzz }\nlet z = f(P { s: "a" })\nz\n';
    expectRow("h5", body, CLEAN, "a statically absent field draws no parse diagnostic");
    const r = await run(body);
    expect(
      r.kind,
      `h5 — the absent field must be rejected at RUNTIME, by the panic expressions.md:9 assigns; got ${disposition(r)}`,
    ).toBe("threw");
    if (r.kind !== "threw") {
      throw new Error("unreachable: the assertion above fails on any other disposition");
    }
    expect(
      isThetaPanic(r.thrown),
      `h5 — missing-object-key is one of the closed panic sources and stays a panic; thrown ${String(r.thrown)}`,
    ).toBe(true);
    expect(
      disposition(r),
      "h5 — byte-unchanged in both directions",
    ).toBe(`LOADED AND PANICKED — ${MISSING_OBJECT_KEY_CODE}: missing object key: zzz`);
  });
});
