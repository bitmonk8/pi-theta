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
import type { ThetaSource } from "../src/lexer/lexer";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0179 — `decide`'s TYPE-7 array arm (src/parser/type-compat.ts:218–226)
// answers `"incompatible"` for every sub whose kind is not `array`
// (src/parser/type-compat.ts:222–224), so it returns before control can reach
// the unresolvable-`named`-sub escape 53 lines below it
// (src/parser/type-compat.ts:275–278). Every expression
// `StaticTypeInferencePass.#typeExpr` (src/parser/static-type-inference.ts:197)
// leaves nominal — a method call (:261–262), a member read (:242–244), a `fn`
// call (:251–252), an index into a non-array-typed target (:245–250) — is
// therefore refused at an `array<T>`-declared sink, and the refusal's
// `<actual>` slot renders the placeholder as though it were a type
// (`expected array<string>, got keys`)
// (docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md).
//
// THE CONTRACT UNDER TEST (the bug's §Fix, no wider). The array arm answers
// `"unknown"` for exactly one sub — a `named` whose `resolveNamed(env, name)`
// is `undefined` — exactly as src/parser/type-compat.ts:275–278 already answers
// for that same sub at every sink the arm does not intercept first. The three
// TYPE-9 sinks are untouched: each already returns no diagnostic on `"unknown"`
// (`checkObjectFieldCompat` src/parser/type-compat.ts:520–522,
// `checkLetRhsCompat` :421, `checkFnArgCompat` :472). No registry row changes;
// no runtime behaviour changes; the static inference is not widened. So every
// deferral cell below asserts the SAME body that refuses today parses with zero
// error-severity diagnostics and then evaluates, through the production
// executor, to the value the runtime already computes for it.
//
// Spec anchors:
//   - docs/spec_topics/type-system.md:48 — §Unresolvable operands, the
//     governing paragraph: when either side of a compatibility check is past
//     the parser's static view "the parse-time check is skipped and the runtime
//     AJV check is the safety net". It is unconditional on the sink's kind, and
//     a `named` the `TypeEnv` cannot resolve is its own example class.
//   - :29 — the Operational definition, which names AJV "the safety net at
//     runtime". This is what :48's skip hands the question to, and the reason
//     deferring costs no soundness the relation was carrying.
//   - :31 — §Structural cases, whose closed-list sentence ends "unless the
//     position is one where a runtime AJV check is documented as the safety
//     net". :29 documents it and :48 names the skip, so an unresolvable operand
//     is the closed list's documented exception rather than a member of it.
//   - :50 — TYPE-9, two of this file's three registry oracles:
//     `let-rhs-type-mismatch` at the typed-`let` RHS, and
//     `array-element-type-mismatch` through the array-and-ternary
//     common-type machinery.
//   - :27 — §Type compatibility's opening sentence, not TYPE-9: it lists "a
//     schema-constructor field value against its declared field type" among
//     the governed positions. Its registered row is
//     docs/spec_topics/diagnostics/code-registry-parse.md:46
//     (`object-field-type-mismatch`), cited again below.
//   - docs/spec_topics/expressions.md:114 — the `object` member table's heading
//     row, which scopes the table to "any object value, schema-typed or
//     anonymous"; :118 — `keys()` is `(): array<string>`; :119 — `values()`.
//     `array<T>` is the position these two members exist to feed, and theta
//     1.0's only object-iteration surface reads `keys()`.
//   - docs/spec_topics/diagnostics/code-registry-parse.md:46 —
//     `theta/parse/object-field-type-mismatch`, whose Trigger requires the
//     field value's type to be "statically resolvable"; :56 —
//     `theta/parse/let-rhs-type-mismatch`, carrying the same clause; :40 —
//     `theta/parse/array-element-type-mismatch`. A nominal placeholder is not a
//     statically resolvable type, so the measured inputs fall outside all three
//     registered conditions (DIAG-4).
//
// CELL INVENTORY at HEAD d470996e / v0.103.0 (offline, deterministic;
// §Reproduction (a) re-derived byte-identically). `R` abbreviates
// `schema R { ks: array<string> }`; row numbers are §Reproduction (a)'s.
//
//   RED at HEAD, GREEN after the fix — the deferral cells:
//     a1  row 1   `R { ks: p.keys() }`            object-field … got keys
//                 → zero errors AND value {"ks":["a","b"]}
//     b1  row 11  `R { ks: q.xs }`                object-field … got xs
//     b2  row 12  `R { ks: f() }`                 object-field … got f
//     b3  row 14  `R9 { ks: w.rows[0] }`          object-field … got index
//     b4  row 15  `R { ks: match … }`             object-field … got keys
//     b5  row 16  `R { ks: true ? … : [] }`       object-field … got keys
//     c1  row 9   `let ks: array<string> = p.keys()`
//                                                 let-rhs … got keys
//     c2  row 13  `let n: array<array<string>> = [p.keys()]`
//                                                 let-rhs … got array<keys>
//                                                 AND array-element … got keys
//     f1  `let r: array<string> = @`x``           let-rhs … expected
//                                                 array<string>, got
//                                                 array<string>
//
//   GREEN at HEAD and after — constraint-1 controls (group d) and the controls
//   that locate the arm (group e, rows 3, 5, 6, 8, 17, 18, 19).
//
// THE CONSTRAINT-1 BOUNDARY (group d). Only a `named` sub the type environment
// cannot resolve changes verdict. Everything else the array arm refuses today
// must keep refusing with the same bytes, because for those subs both operands
// ARE inside the parser's static view and type-system.md:48 licenses no
// deferral:
//   d1  `array<number>` under an `array<string>` ctor field   — a mismatched
//       `array` sub; the arm's element-wise recursion decides it.
//   d2  the same pair at a typed `let`                        — the second
//       TYPE-9 sink, so the narrowing is pinned at both.
//   d3  a RESOLVABLE named schema under an array sink         — TYPE-10 makes
//       it nominal and decidable, which is the pair the fix must not widen.
//   d4  a literal (`integer`) under an array sink             — TYPE-3.
//   d5  `let ss: array<string> = [1]`                         — an `array` sub
//       whose ELEMENT mismatches; constraint 2 recurses the deferral through
//       the element position, so this pair must show recursion still REFUSES a
//       resolvable element mismatch. Both of its diagnostics stay.
//
// TIER — unit, offline, provider-free, deterministic. The whole contract is a
// parse-time verdict observable at the `parseThetaDocument` boundary, and the
// value half needs only the in-process production prompt-mode binding. Nothing
// here crosses a provider, a model, a child process or the network, so neither
// an integration nor a live tier is required. §Witness says the same in its own
// words ("Offline, provider-free, parse-level, in a new file") and rules the
// child-process half out.
//
// NO SILENT SKIPPING (CLAUDE.md). Every expected refusal message is built from
// the live registry through {@link registered}, which throws naming the unmet
// precondition when a row is absent; {@link interpolate} throws when a template
// lacks a placeholder the helper fills, so a registry drift can never degrade a
// control into a comparison against an un-interpolated string. No cell
// early-returns and no branch is conditional on the tree's state.
//
// SCOPE. The `fn`-argument sink's separate proof gate (`provableArgType`,
// src/parser/type-layer-checks.ts:1654) is why row 17 is admitted today; §Fix
// constraint 6 scopes that asymmetry out, so e5 pins the row as an invariant
// rather than as something this contract changes. The TYPE-8 inline-object arm
// (src/parser/type-compat.ts:231–256) has the same shape and is scoped out by
// §Fix constraint 3; e7 pins the one measured input that reaches its
// neighbourhood so a later move of that arm cannot land silently.

// ===========================================================================
// The contract under test — the three registered codes and their normative
// messages (DIAG-4: the registry *Message* column is this file's oracle).
// ===========================================================================

const OBJECT_FIELD_CODE = "theta/parse/object-field-type-mismatch";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live four-page sharded registry, read from the spec corpus. */
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
 * unmet precondition when the row is absent, so a registry drift can never
 * degrade a group-(d) control into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 Message column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Fill `slots` into `code`'s registered template. Every placeholder is required
 * to be present: a template that no longer spells one would otherwise yield a
 * silently under-interpolated expectation, which reads as a control passing
 * against a string the implementation never emits.
 */
function interpolate(code: string, slots: Readonly<Record<string, string>>): string {
  let message = registered(code);
  for (const [slot, value] of Object.entries(slots)) {
    if (!message.includes(slot)) {
      throw new Error(
        `harness: the registered Message for ${code} does not spell ${slot} — this file interpolates it, so an absent placeholder is a harness failure, never a skip. Template: ${message}`,
      );
    }
    message = message.replace(slot, value);
  }
  return message;
}

function objectFieldMismatch(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return `${OBJECT_FIELD_CODE}: ${interpolate(OBJECT_FIELD_CODE, {
    "<field>": field,
    "<schema>": schema,
    "<expected>": expected,
    "<actual>": actual,
  })}`;
}

function letRhsMismatch(name: string, expected: string, actual: string): string {
  return `${LET_RHS_CODE}: ${interpolate(LET_RHS_CODE, {
    "<name>": name,
    "<expected>": expected,
    "<actual>": actual,
  })}`;
}

function arrayElementMismatch(index: number, expected: string, actual: string): string {
  return `${ARRAY_ELEMENT_CODE}: ${interpolate(ARRAY_ELEMENT_CODE, {
    "<i>": String(index),
    "<expected>": expected,
    "<actual>": actual,
  })}`;
}

// ===========================================================================
// Shared parse + production-executor harness (the
// tests/absent-member-presence-gate.test.ts:219–325 pattern).
// ===========================================================================

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Every fixture is a whole theta in prompt mode (§Reproduction). */
const FM = "---\nmode: prompt\n---\n";

/** §Reproduction's shared prologue, prepended to every row whose body reads `p`. */
const P = 'schema P { a: string, b: string }\nlet p = P { a: "x", b: "y" }\n';

function parse(body: string): ThetaDocument {
  const source: ThetaSource = {
    path: "bug0179.theta",
    bytes: new TextEncoder().encode(FM + body),
  };
  return parseThetaDocument(source, parseDeps());
}

/** `code: message` for every ERROR-severity diagnostic, in emission order. */
function errorLines(doc: ThetaDocument): string[] {
  return doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => `${d.code}: ${d.message}`);
}

/** The whole diagnostic list, rendered for failure text. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

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
    // pair satisfies the PIC-17 snapshot/restore window. No provider, no model.
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** Drive an already-parsed body through the production prompt-mode binding. */
async function execute(doc: ThetaDocument): Promise<BodyExecution> {
  const theta: ThetaCompositionInput = {
    slashName: "bug0179",
    sourcePath: "/theta/bug0179.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * A deferral cell: the body loads clean and then evaluates to `value`.
 *
 * The diagnostic assertion runs FIRST because a theta carrying an
 * error-severity diagnostic is dropped by the parse pass and does not register
 * (src/extension/production-composition.ts:743–748), so the parse verdict is
 * what decides whether the body ever runs — and it is the observable §Fix
 * moves. `value` is asserted second so the cell pins the answer the author
 * asked for rather than only the absence of a refusal; the runtime is untouched
 * by §Fix, so the pinned value is the one the executor already computes for the
 * same AST.
 */
async function expectDeferred(
  body: string,
  expected: { readonly value: ThetaValue; readonly why: string },
): Promise<void> {
  const doc = parse(body);
  expect(
    errorLines(doc),
    `${expected.why}\n  type-system.md:48 skips the parse-time check when either operand is past the parser's static view, and the sub here is a nominal placeholder the TypeEnv cannot resolve — so the sink must emit nothing and defer to the runtime AJV net (:29)\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([]);
  const execution = await execute(doc);
  expect(execution.outcome, `${expected.why}: the body reaches a value`).toBe("success");
  expect(
    execution.result.value,
    `${expected.why}: the value the sink was declared to hold`,
  ).toEqual(expected.value);
}

/** A control that must keep REFUSING, with exactly `lines` in emission order. */
function expectRefused(body: string, lines: readonly string[], why: string): void {
  const doc = parse(body);
  expect(
    errorLines(doc),
    `${why}\n  §Fix constraint 1 narrows the deferral to a \`named\` sub \`resolveNamed\` cannot resolve; this pair is inside the parser's static view, so it stays decidable and its bytes must not move\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...lines]);
}

/** A control that must keep LOADING CLEAN and evaluating to `value`. */
async function expectAdmitted(body: string, value: ThetaValue, why: string): Promise<void> {
  const doc = parse(body);
  expect(
    errorLines(doc),
    `${why} — this row locates the arm: it is admitted at HEAD and must stay admitted, so a later change to the relation cannot red it silently; actual diagnostics: ${render(doc)}`,
  ).toEqual([]);
  const execution = await execute(doc);
  expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
  expect(execution.result.value, `${why}: the value is unchanged`).toEqual(value);
}

// ===========================================================================
// Fixtures — §Reproduction (a)'s rows, verbatim.
// ===========================================================================

const R = "schema R { ks: array<string> }\n";

/** Row 1 — the smallest failing input: one method call at one `array<T>` sink. */
const ROW1 = P + R + "R { ks: p.keys() }\n";
/** Row 3 — the same call as a tail. */
const ROW3 = P + "p.keys()\n";
/** Row 5 — the same receiver at a `boolean` sink. */
const ROW5 = P + 'schema R3 { h: boolean }\nR3 { h: p.has("a") }\n';
/** Row 6 — the same call as a RECEIVER, its result consumed by `length`. */
const ROW6 = P + "schema R4 { n: integer }\nR4 { n: p.keys().length }\n";
/** Row 8 — a member read at a `string` sink. */
const ROW8 = P + "schema R6 { s: string }\nR6 { s: p.a }\n";
/** Row 9 — the typed-`let` sink over the same call. */
const ROW9 = P + "let ks: array<string> = p.keys()\nks\n";
/** Row 11 — an `array<string>`-DECLARED field read into an `array<string>` sink. */
const ROW11 =
  'schema Q { xs: array<string> }\nlet q = Q { xs: ["a"] }\n' + R + "R { ks: q.xs }\n";
/** Row 12 — a `fn` whose return annotation IS the sink's declared type. */
const ROW12 = R + 'fn f(): array<string> { return ["a"] }\nR { ks: f() }\n';
/** Row 13 — the array-literal ELEMENT sink; two diagnostics at HEAD. */
const ROW13 = P + "let n: array<array<string>> = [p.keys()]\nn\n";
/** Row 14 — an index into a nested array, which the inference names `index`. */
const ROW14 =
  'schema W { rows: array<array<string>> }\nlet w = W { rows: [["a"]] }\n' +
  "schema R9 { ks: array<string> }\nR9 { ks: w.rows[0] }\n";
/** Row 15 — `#commonType` reduces a placeholder arm and a legal arm to the placeholder. */
const ROW15 = P + R + "R { ks: match true { true => p.keys(), false => [] } }\n";
/** Row 16 — the ternary spelling of row 15. */
const ROW16 = P + R + "R { ks: true ? p.keys() : [] }\n";
/** Row 17 — the same call at a `fn` parameter, which consults `provableArgType`. */
const ROW17 = P + "fn g(xs: array<string>): integer { return xs.length }\ng(p.keys())\n";
/** Row 18 — a `fn` call at a `string` sink, reaching the escape at :275–278. */
const ROW18 = 'fn f3(): string { return "z" }\nschema R8 { s: string }\nR8 { s: f3() }\n';
/** Row 19 — the same value at an inline-object sink (the TYPE-8 arm's neighbourhood). */
const ROW19 = 'fn f2(): string { return "z" }\nlet v: { x: string } = f2()\nv\n';

// Constraint-1 controls: every sub here is inside the parser's static view.
const D1 = "schema C1 { ks: array<string> }\nlet ns: array<number> = [1]\nC1 { ks: ns }\n";
const D2 = "let ns: array<number> = [1]\nlet ss: array<string> = ns\nss\n";
const D3 =
  'schema Zn { a: string }\nlet z = Zn { a: "x" }\nschema C2 { ks: array<string> }\nC2 { ks: z }\n';
const D4 = "schema C3 { ks: array<string> }\nC3 { ks: 1 }\n";
const D5 = "let ss: array<string> = [1]\nss\n";

/** The additional cell: a bare query under an `array<T>` annotation. */
const F1 = "let r: array<string> = @`x`\nr\n";

// ===========================================================================
// (a) The primary. RED at HEAD: row 1 refuses with `expected array<string>,
// got keys`, naming a method where the registered `<actual>` slot
// (code-registry-parse.md:46) specifies the field value's static type.
// ===========================================================================

describe("bug 0179 (a) — the primary: a `keys()` call at an `array<string>`-declared constructor field", () => {
  it("RED a1 (row 1): `R { ks: p.keys() }` loads clean and answers {\"ks\":[\"a\",\"b\"]}", async () => {
    // The whole defect in one theta: a two-field schema, one constructor, one
    // `array<string>` sink, one `keys()` call. `expressions.md:118` gives
    // `keys()` the signature `(): array<string>`, and `expressions.md:114`
    // scopes the table to any object value — so the sink and the value agree by
    // the language reference, and only the inference pass's placeholder
    // (`named "keys"`, src/parser/static-type-inference.ts:261–262) stands
    // between them. Removing the sink (control e1) or making it a primitive
    // (e2, e3, e4) already passes, which is what isolates the array arm.
    await expectDeferred(ROW1, {
      value: { ks: ["a", "b"] },
      why: "a1 (row 1) — `R { ks: p.keys() }` at `schema R { ks: array<string> }`",
    });
  });
});

// ===========================================================================
// (b) One cell per distinct placeholder shape the inference pass produces at a
// constructor-field sink, plus the two composite reductions that carry a
// placeholder through `#commonType`. All RED at HEAD.
// ===========================================================================

describe("bug 0179 (b) — every nominal placeholder shape defers at the constructor-field sink", () => {
  it("RED b1 (row 11): a `member` read — `R { ks: q.xs }` where `q.xs` is DECLARED array<string>", async () => {
    // The sharpest instance: the declaration the author wrote on `Q.xs` and the
    // declaration on `R.ks` are the same text. `#typeExpr`'s `member` arm
    // (src/parser/static-type-inference.ts:242–244) answers `named "xs"` — the
    // FIELD NAME — so the declared type is never consulted and no rewriting of
    // either declaration can make the pair compatible.
    await expectDeferred(ROW11, {
      value: { ks: ["a"] },
      why: "b1 (row 11) — a member read of an `array<string>`-declared field into an `array<string>` sink",
    });
  });

  it("RED b2 (row 12): a `call` — `R { ks: f() }` where `fn f(): array<string>`", async () => {
    // The `call` arm (src/parser/static-type-inference.ts:251–252) answers
    // `named "f"`, the callee's name, so the return annotation is not read
    // here either. §Fix constraint 7 rules out closing this by widening the
    // inference: doing so would leave the member and index shapes refused.
    await expectDeferred(ROW12, {
      value: { ks: ["a"] },
      why: "b2 (row 12) — a `fn` whose return annotation is the sink's declared type",
    });
  });

  it("RED b3 (row 14): an `index` — `R9 { ks: w.rows[0] }` into a nested array", async () => {
    // The index arm (src/parser/static-type-inference.ts:245–250) narrows only
    // when the TARGET is statically an array; `w.rows` is itself a member read,
    // so the target is `named "rows"` and the index answers the literal token
    // `named "index"`. No theta type is spelled `index`.
    await expectDeferred(ROW14, {
      value: { ks: ["a"] },
      why: "b3 (row 14) — an index whose target the inference does not see as an array",
    });
  });

  it("RED b4 (row 15): a `match` reduction — one placeholder arm poisons the common type", async () => {
    // `#commonType` over the arms (src/parser/static-type-inference.ts:237–241)
    // reduces a placeholder arm and a legal arm to the placeholder, so the
    // composite forms inherit the refusal rather than escaping it.
    await expectDeferred(ROW15, {
      value: { ks: ["a", "b"] },
      why: "b4 (row 15) — `match true { true => p.keys(), false => [] }` at an `array<string>` sink",
    });
  });

  it("RED b5 (row 16): a ternary reduction — the same shape one spelling over", async () => {
    // The ternary branch reduction (src/parser/static-type-inference.ts:226–233)
    // is the same `#commonType` call, pinned separately so the two spellings
    // cannot diverge.
    await expectDeferred(ROW16, {
      value: { ks: ["a", "b"] },
      why: "b5 (row 16) — `true ? p.keys() : []` at an `array<string>` sink",
    });
  });
});

// ===========================================================================
// (c) The other two TYPE-9 sinks (type-system.md:50). The arm is shared, so
// the deferral must land at all three sinks the relation serves, not only at
// the constructor field.
// ===========================================================================

describe("bug 0179 (c) — the deferral lands at the typed-`let` and array-literal-element sinks too", () => {
  it("RED c1 (row 9): `let ks: array<string> = p.keys()` loads clean and binds [\"a\",\"b\"]", async () => {
    // The typed-`let` sink reads the same `typeOf` the constructor field does
    // (src/parser/type-layer-checks.ts:970 and :1542), so it refuses the same
    // value one position over. Hoisting does not help either: an untyped `let`
    // records the same nominal type, and the sink is still `array<string>`.
    await expectDeferred(ROW9, {
      value: ["a", "b"],
      why: "c1 (row 9) — the typed-`let` sink over the same call",
    });
  });

  it("RED c2 (row 13): `let n: array<array<string>> = [p.keys()]` sheds BOTH diagnostics", async () => {
    // Two sinks fire on one statement at HEAD: the annotation sink over
    // `array<keys>` (the array-literal arm at
    // src/parser/static-type-inference.ts:217–222 lifts the placeholder) and
    // `checkArrayLiteral`'s element sink over `keys`. §Fix constraint 2 —
    // element-wise recursion (src/parser/type-compat.ts:225) inherits the
    // deferral — is what discharges the second one, so a cell that only
    // removed the first would under-witness the fix.
    await expectDeferred(ROW13, {
      value: [["a", "b"]],
      why: "c2 (row 13) — the array-literal element sink, whose element type is itself the placeholder",
    });
  });
});

// ===========================================================================
// (d) Constraint-1 controls. GREEN in BOTH directions: every sub here is
// inside the parser's static view, so type-system.md:48 licenses no deferral
// and the bytes must not move. Each expected message is built from the live
// registry (DIAG-4), never hand-typed.
// ===========================================================================

describe("bug 0179 (d) — constraint 1: a decidable sub at an array sink keeps refusing, byte-unchanged", () => {
  it("d1: `array<number>` under an `array<string>` constructor field still refuses", () => {
    // A mismatched `array` sub does not take the short-circuit at all: the arm
    // recurses element-wise (src/parser/type-compat.ts:225) and `number ⋢
    // string` decides it. The committed cells at
    // tests/ctor-field-type-check.test.ts:441 and :633 pin this class in the
    // mirrored direction (`array<string>` under `array<number>`); restating it
    // here keeps the narrowing observable from the file that changes the arm.
    expectRefused(
      D1,
      [objectFieldMismatch("ks", "C1", "array<string>", "array<number>")],
      "d1 — a resolvable element mismatch is not an unresolvable operand",
    );
  });

  it("d2: `array<number>` under an `array<string>` typed `let` still refuses", () => {
    expectRefused(
      D2,
      [letRhsMismatch("ss", "array<string>", "array<number>")],
      "d2 — the same pair at the second TYPE-9 sink",
    );
  });

  it("d3: a RESOLVABLE named schema under an array sink still refuses", () => {
    // The exact discriminant §Fix constraint 1 names: `resolveNamed(env, "Zn")`
    // answers a declaration, so this `named` sub is decidable and TYPE-10
    // (type-system.md, the nominal rule) makes it incompatible with an array.
    // Only the `undefined` answer changes verdict.
    expectRefused(
      D3,
      [objectFieldMismatch("ks", "C2", "array<string>", "Zn")],
      "d3 — a `named` the TypeEnv DOES resolve stays incompatible",
    );
  });

  it("d4: a literal under an array sink still refuses", () => {
    expectRefused(
      D4,
      [objectFieldMismatch("ks", "C3", "array<string>", "integer")],
      "d4 — a `literal` sub is untouched by the arm's new escape",
    );
  });

  it("d5: `let ss: array<string> = [1]` keeps BOTH diagnostics", () => {
    // The mirror of c2. Constraint 2 makes element-wise recursion inherit the
    // deferral, so this row is the proof that the recursion still REFUSES when
    // the element is decidable — the annotation sink over `array<integer>` and
    // the element sink over `integer` both stay.
    expectRefused(
      D5,
      [
        letRhsMismatch("ss", "array<string>", "array<integer>"),
        arrayElementMismatch(0, "string", "integer"),
      ],
      "d5 — a decidable ELEMENT mismatch still refuses through the recursion constraint 2 governs",
    );
  });
});

// ===========================================================================
// (e) The controls that locate the arm (rows 3, 5, 6, 8, 17, 18, 19). All are
// admitted at HEAD; they are pinned so a later change to the relation cannot
// red them silently. Together they show the answer for one and the same sub
// depends on the SINK's kind, which is the report's root cause.
// ===========================================================================

describe("bug 0179 (e) — the same nominal value is admitted everywhere except an array sink", () => {
  it("e1 (row 3): `p.keys()` as the theta's tail answers [\"a\",\"b\"]", async () => {
    // No sink, no check — and the member is reachable and correct at runtime
    // (`evaluateObjectMember`'s `keys` arm, src/runtime/stdlib-object.ts:114–115).
    // So the refusal in group (a) is the sink's verdict, not the call's.
    await expectAdmitted(ROW3, ["a", "b"], "e1 (row 3) — the same call with no sink");
  });

  it("e2 (row 5): `R3 { h: p.has(\"a\") }` at a `boolean` sink answers {\"h\":true}", async () => {
    // A method call at a `prim` sink reaches the escape at
    // src/parser/type-compat.ts:275–278 and is admitted — the same sub kind the
    // array arm refuses.
    await expectAdmitted(ROW5, { h: true }, "e2 (row 5) — a nominal value at a `boolean` sink");
  });

  it("e3 (row 6): `R4 { n: p.keys().length }` at an `integer` sink answers {\"n\":2}", async () => {
    // `keys()` in RECEIVER position: the array it returns is real enough for
    // `length` to answer 2 at runtime, which is what makes the static refusal
    // at an `array<string>` sink a statement about the relation and not about
    // the value.
    await expectAdmitted(ROW6, { n: 2 }, "e3 (row 6) — the same call as a receiver");
  });

  it("e4 (row 8): `R6 { s: p.a }` at a `string` sink answers {\"s\":\"x\"}", async () => {
    await expectAdmitted(ROW8, { s: "x" }, "e4 (row 8) — a member read at a `string` sink");
  });

  it("e5 (row 17): `g(p.keys())` against an `array<string>` PARAMETER answers 2", async () => {
    // The `fn`-argument sink admits what the other two refuse because it
    // consults `provableArgType` (src/parser/type-layer-checks.ts:1654) and
    // skips the check for an expression whose read is not a proof of the
    // runtime value type. §Fix constraint 6 leaves that asymmetry in place, so
    // this row is an invariant of the change rather than a consequence of it.
    await expectAdmitted(ROW17, 2, "e5 (row 17) — the same call at an `array<string>` parameter");
  });

  it("e6 (row 18): `R8 { s: f3() }` at a `string` sink answers {\"s\":\"z\"}", async () => {
    await expectAdmitted(ROW18, { s: "z" }, "e6 (row 18) — a `fn` call at a `string` sink");
  });

  it("e7 (row 19): `let v: { x: string } = f2()` at an inline-object sink answers \"z\"", async () => {
    // The TYPE-8 arm (src/parser/type-compat.ts:231–256) has the same
    // non-`object` short-circuit as TYPE-7, and this is the one measured input
    // in its neighbourhood. It is admitted today because the annotation
    // lowering never presents an `object`-kind sup, so the arm is not reached.
    // §Fix constraint 3 leaves it byte-untouched; pinning the row means a later
    // move of that arm shows up here as a deliberate change.
    await expectAdmitted(ROW19, "z", "e7 (row 19) — an inline-object sink, TYPE-8's neighbourhood");
  });
});

// ===========================================================================
// (f) The self-identical refusal. RED at HEAD.
// ===========================================================================

describe("bug 0179 (f) — a type declared incompatible with itself", () => {
  it("RED f1: ``let r: array<string> = @`x` `` draws no error-severity diagnostic", () => {
    // `let r: array<string> = @`x`` reports `let binding 'r' initialiser type
    // mismatch: expected array<string>, got array<string>` — recorded verbatim
    // as residual (iii) of
    // docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md:338–349.
    // Its two operands come from ONE source string: `parseLet` propagates the
    // annotation text onto the query, `#typeExpr`'s `query` arm
    // (src/parser/static-type-inference.ts:255–256) answers
    // `named "array<string>"` — the text verbatim, unresolvable in the TypeEnv
    // — while `annotationToCompatType` (src/parser/type-layer-checks.ts:810)
    // parses the same text into an `array` sup. That is exactly the pair the
    // array arm short-circuits, so the deferral cures it: a sink cannot refuse
    // a value whose rendered type is its own.
    //
    // Parse only. A query needs a real Pi tool surface to execute, which is
    // outside this file's offline, provider-free tier.
    const doc = parse(F1);
    expect(
      errorLines(doc),
      `f1 — the refusal names one type on both sides, so no declaration an author could write would satisfy it; type-system.md:48 defers the check and the runtime AJV net (:29) decides the response\n  actual diagnostics: ${render(doc)}`,
    ).toEqual([]);
  });
});
