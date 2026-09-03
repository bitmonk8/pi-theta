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
import { isResultValue, schemaTagOf, type ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { codes, errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0031 — a schema-constructor field value is never compared to the type the
// schema declares for that field, so `Point { x: "not a number", y: true }`
// against `schema Point { x: number, y: number }` loads with zero diagnostics
// and evaluates to a `Point`-branded object whose payload does not validate
// against `Point`'s lowering
// (docs/bugs/0031-ctor-field-value-typing-unchecked.md).
//
// The live site is `TypeLayerWalk.walkExpr`'s `object` arm
// (src/parser/type-layer-checks.ts): it recurses into every field value and
// passes nothing down — no declared-field lookup, no `checkCompatible` call, no
// element sink. The typed-`let` arm of the SAME walk does both halves over the
// same values (`checkLetRhsCompat`, plus element-sink threading for an array
// initialiser), which is why every fixture below has a matched `let` control
// that fires today.
//
// THE CONTRACT UNDER TEST (the bug's §Fix, not one step wider). Post-fix static
// observables at the `parseThetaDocument` boundary:
//
//   w1  Point { x: "not a number", y: true }   → TWO theta/parse/object-field-type-mismatch
//   w2  Holder { r: Ok(1) }                    → object-field-type-mismatch (expected Inner, got Ok)
//   w3  Holder { r: Other { a: 1 } }           → object-field-type-mismatch (expected Inner, got Other)
//   w4  Bag { xs: ["a", "b"] }                 → object-field-type-mismatch AND
//                                                theta/parse/array-element-type-mismatch
//   w5  N { i: 1.5 }                           → theta/parse/integer-narrowing (routed the
//                                                `checkLetRhsCompat` way), NOT the new code
//
// plus: the controls c1–c7 stay byte-unchanged; the residue probes r1–r5 stay
// SILENT at the constructor field and at the matched `let` (§Fix: "the residue
// probes r2–r5 must be pinned as negative tests so a later widening of
// `collectTypeEnv` is a deliberate change and not a silent one"; r1a/r1b pin
// that the LET position's `result-ctor` silence is untouched — only the
// constructor FIELD position rejects a `result-ctor`); the check runs over the
// INTERSECTION of literal and declaration, so an undeclared field reports
// through `theta/parse/extra-object-field` alone while a declared-but-omitted
// field and a mistyped present field report through their own gates.
//
// Spec anchors (line numbers measured at this HEAD; where the bug doc's own
// citation has drifted, both are given):
//   - docs/spec_topics/grammar.md:225–230 — §`array<T>` literal type-sink rule.
//     The sink set is declared EXHAUSTIVE at :216 and :220 lists "The declared
//     type of a surrounding constructor field (`Schema { items: [...] }`)". w4
//     is an implementation defect against a normative rule whose code is
//     already registered.
//   - docs/spec_topics/expressions.md:220 (bug doc: :218) — §Array
//     construction naming the surrounding constructor field as an element-type
//     inference context; :224 (bug doc: :222) — "If a type sink is in scope
//     […] every element must satisfy `T_element ⊑ T_sinkElement`; a mismatch is
//     `theta/parse/array-element-type-mismatch` naming the offending element."
//   - docs/spec_topics/type-system.md:27 — the normative enumeration of the
//     positions governed by `⊑`. It does NOT list the constructor-field
//     position today; the fix ADDS the entry ("a schema-constructor field value
//     against its declared field type"), which is what makes the new emission
//     citeable. :29 — the Operational definition ("every value statically typed
//     as `T₁` AJV-validates against the lowering of `T₂`" and the parse-first
//     posture) is the premise a branded-but-malformed value falsifies. :48 —
//     §Unresolvable operands licenses skipping a static check where "the
//     runtime AJV check is the safety net", which is the bound on the fix's
//     coverage and the reason the r-rows stay silent. :52 — TYPE-10 makes
//     `Other ⋢ Inner` regardless of field shape (w3, the sharpest instance:
//     both sides resolve).
//   - docs/spec_topics/tool-calls.md:16 — the adjacent precedent: the other
//     object-literal form (a Pi-tool call's sole positional argument) already
//     carries a parse-time field-value static-type check
//     (`theta/parse/tool-arg-schema-conflict`).
//   - docs/spec_topics/diagnostics/code-registry-parse.md rows :24
//     (`integer-narrowing`, closing w5), :40 (`array-element-type-mismatch`,
//     closing w4's element half with no new code), :44/:45 (`extra-object-field`
//     / `missing-object-field`, the two presence gates the intersection rule
//     partitions against), :53 (bug doc; :54 once the 0031 row lands)
//     (`let-rhs-type-mismatch`, whose Trigger already
//     carries the "where the RHS type is statically resolvable" qualifier the
//     new row copies), :59 (bug doc; :60 once the 0031 row lands)
//     (`result-in-schema-position`, control c7 — the gate
//     that makes a `Result`-typed field undeclarable and therefore makes w2's
//     smuggled `Result` decidably incompatible).
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 — DIAG-2: the
//     registry is closed, so the new code is a spec change landing in lock-step
//     with the implementation. DIAG-4 (:74) makes the *Message* column
//     normative — group (f) is this file's reconciliation against it.
//   - docs/spec_topics/governance/source-language-stability.md:25 — the GOV-15
//     diagnostic-registry carve-out: a code ADDITION is admissible within a
//     theta 1.x minor exactly on the inputs that did not previously emit it,
//     which is precisely w1/w3/w5 (and w2/w4's new half).
//
// RE-DERIVED REPRODUCTION AT THIS HEAD (v0.42.0, offline, deterministic;
// byte-identical to the bug doc's §Reproduction tables at 0.32.0 — zero drift):
//   w1–w5   parse with ZERO diagnostics; w1 runs to tag=Point payload
//           {"x":"not a number","y":true}; w2 to tag=Holder with
//           isResultValue(h.r)=true; w3 to tag=Holder with schemaTagOf(h.r)=Other;
//           w4 to tag=Bag payload {"xs":["a","b"]}; w5 to tag=N payload {"i":1.5}.
//   c1–c7   fire exactly the doc's codes and messages (c3 fires BOTH
//           let-rhs-type-mismatch AND array-element-type-mismatch).
//   r1a/r1b/r2a/r2b/r3a/r3b/r4a/r4b/r5a/r5b  all parse with ZERO diagnostics,
//           on the constructor side AND on the matched `let` side.
//
// TIER — unit, offline, provider-free. The whole fix is witnessable at the
// `parseThetaDocument` boundary; the runtime half needs only the in-process
// production prompt-mode binding. Nothing on this path crosses a provider, a
// model, a child process or the network, so neither an integration nor a live
// test is required (the bug's §Fix says so in the same words: "Test witness —
// unit, offline, no live provider").
//
// HARNESS — parse-only rows use the shared house driver `parseDoc`
// (tests/helpers/e2e-s1.ts), the same real `parseThetaDocument` entry point with
// inert offline seams that tests/ctor-unresolved-schema-name.test.ts (bug 0025,
// the sibling gate in this same constructor position) uses. The runtime rows use
// the production-executor pattern of tests/result-value-privacy.test.ts §"Shared
// harness" and tests/absent-member-presence-gate.test.ts: parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody, with
// `schemaTagOf` / `isResultValue` (src/runtime/value.ts) as the brand
// observables. Every fixture is the bug doc's table row verbatim, `mode: prompt`,
// with the construct `let`-bound and returned as the tail expression (§Reproduction's
// own convention).
//
// NO SILENT SKIPPING (CLAUDE.md). Nothing here early-returns or conditionally
// skips: a missing registry row fails loudly naming the row, a fixture that
// stops parsing in the runtime group fails loudly naming its diagnostics, and
// every negative pin asserts an exact diagnostic list rather than a mere absence
// of one code.
//
// SCOPE. Constructor NAME resolution (`Mystery { … }`, `Color { r: 1 }`) is bug
// 0025 and is pinned by tests/ctor-unresolved-schema-name.test.ts; its inputs
// never reach this check, which runs only when the name resolves to a declared
// object schema. A field literally named `__thetaSchema` is bug 0026. Body-level
// alias/union schemas are bug 0033, which keeps alias-typed fields unreachable
// from a `.theta` body.

// ===========================================================================
// The contract under test — the codes and their normative messages
// (DIAG-2 / DIAG-4).
// ===========================================================================

/**
 * The code the bug's §Fix mints. NOT in the registry at this HEAD: group (f) is
 * the single guard that reconciles it, and it is RED until the fix commit adds
 * the row. Naming an unregistered code here is safe for the default gate — the
 * closing gate's `asserted-code-not-in-registry` arm runs against the seeded
 * test-fixtures corpus (tests/closing-gate.test.ts), and the hard-fail
 * live-corpus footing gates only on `CANARY_GAP_KINDS`
 * (tools/closing-gate/live-corpus.js), which does not include that kind.
 */
const CODE = "theta/parse/object-field-type-mismatch";

/**
 * The *Message* template the §Fix registry row carries. Pinned as a literal
 * rather than read through `registryMessage` on purpose: the row does not exist
 * yet, so sourcing it from the registry would make every w-row red for a
 * HARNESS reason ("no registry row") instead of for the reason under test (the
 * diagnostic is absent). Group (f) is the DIAG-4 reconciliation that reds when
 * this literal and the registry disagree.
 *
 * All four placeholders already exist in the closed placeholder surface —
 * `<field>` (category 5), `<schema>` (category 7, identifier-shaped),
 * `<expected>` / `<actual>` (category 1) — so this file states no new rendering
 * vector and does not restate the rendering-vector tests that own them.
 */
const EXPECTED_TEMPLATE =
  "field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>";

const ARRAY_ELEMENT_CODE = "theta/parse/array-element-type-mismatch";
const INTEGER_NARROWING_CODE = "theta/parse/integer-narrowing";
const LET_RHS_CODE = "theta/parse/let-rhs-type-mismatch";
const EXTRA_FIELD_CODE = "theta/parse/extra-object-field";
const MISSING_FIELD_CODE = "theta/parse/missing-object-field";
const RESULT_IN_SCHEMA_CODE = "theta/parse/result-in-schema-position";

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

/** The new row's message with its four placeholders interpolated. */
function fieldMismatch(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return EXPECTED_TEMPLATE.replace("<field>", field)
    .replace("<schema>", schema)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function arrayElementMessage(index: number, expected: string, actual: string): string {
  return registered(ARRAY_ELEMENT_CODE)
    .replace("<i>", String(index))
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function letRhsMessage(name: string, expected: string, actual: string): string {
  return registered(LET_RHS_CODE)
    .replace("<name>", name)
    .replace("<expected>", expected)
    .replace("<actual>", actual);
}

function extraFieldMessage(field: string, schema: string): string {
  return registered(EXTRA_FIELD_CODE).replace("<field>", field).replace("<schema>", schema);
}

function missingFieldMessage(field: string, schema: string): string {
  return registered(MISSING_FIELD_CODE).replace("<field>", field).replace("<schema>", schema);
}

// ===========================================================================
// Fixtures — the bug doc's §Reproduction tables, verbatim.
// ===========================================================================

/** Every fixture is `mode: prompt` (§Reproduction). */
const FM = "---\nmode: prompt\n---\n";

// Declared-name, wrong-typed-value fixtures (w1–w5).
const W1 =
  'schema Point { x: number, y: number }\nlet p = Point { x: "not a number", y: true }\np\n';
const W2 = "schema Inner { a: number }\nschema Holder { r: Inner }\nlet h = Holder { r: Ok(1) }\nh\n";
const W3 =
  "schema Inner { a: number }\nschema Other { a: number }\nschema Holder { r: Inner }\nlet h = Holder { r: Other { a: 1 } }\nh\n";
const W4 = 'schema Bag { xs: array<number> }\nlet b = Bag { xs: ["a", "b"] }\nb\n';
const W5 = "schema N { i: integer }\nlet n = N { i: 1.5 }\nn\n";

// Matched `let` controls — same value, same declared type, one position over.
const C1 = 'let x: number = "not a number"\nx\n';
const C2 =
  "schema Inner { a: number }\nschema Other { a: number }\nlet r: Inner = Other { a: 1 }\nr\n";
const C3 = 'let xs: array<number> = ["a", "b"]\nxs\n';
const C4 = "let i: integer = 1.5\ni\n";

// Controls that fire at the constructor (the presence gates are not dead).
const C5 = "schema Point { x: number }\nlet p = Point { x: 1, z: 3 }\np\n";
const C6 = "schema Point { x: number, y: number }\nlet p = Point { x: 1 }\np\n";
const C7 = "schema Holder { r: Result<number, string> }\n";

// Residue probes — silent at the constructor field AND at the matched `let`.
const R1A = "schema Inner { a: number }\nlet r: Inner = Ok(1)\nr\n";
const R1B = "let n: number = Ok(1)\nn\n";
const R2A = 'schema S { n: number }\nfn f(): string { "s" }\nlet s = S { n: f() }\ns\n';
const R2B = 'fn f(): string { "s" }\nlet n: number = f()\nn\n';
const R3A =
  'schema S { n: number }\nschema P { x: string }\nlet p = P { x: "s" }\nlet s = S { n: p.x }\ns\n';
const R3B = 'schema P { x: string }\nlet p = P { x: "s" }\nlet n: number = p.x\nn\n';
const R4A = "enum Color { Red, Green }\nschema Box { c: Color }\nlet b = Box { c: 3 }\nb\n";
const R4B = "enum Color { Red, Green }\nlet c: Color = 3\nc\n";
const R5A = 'schema S { k: "a" | "b" }\nlet s = S { k: "zzz" }\ns\n';
const R5B = 'let k: "a" | "b" = "zzz"\nk\n';

// Intersection fixtures — each field reports through its own gate.
const X1 = 'schema Point { x: number }\nlet p = Point { x: 1, z: "s" }\np\n';
const X2 = 'schema Point { x: number, y: number }\nlet p = Point { x: "s" }\np\n';

// Prototype-collision fixtures — a theta field name is an ordinary identifier
// and nothing stops it naming an `Object.prototype` member. The declared-field
// record the check resolves against must answer OWN keys only: p1/p2 are
// undeclared fields whose names exist on `Object.prototype` (so a
// prototype-chain read would manufacture a declared type for a field outside
// the intersection), and p3/p4 declare a field literally named `__proto__` (so
// an assignment through the inherited `__proto__` setter would silently set the
// record's prototype instead of recording the declared type).
const P1 = "schema S { x: number }\nlet s = S { x: 1, toString: 2 }\ns\n";
const P2 = "schema S { x: number }\nlet s = S { x: 1, constructor: 2 }\ns\n";
const P3 =
  'schema P { __proto__: number, name: string }\nlet p = P { __proto__: 1, name: "s" }\np\n';
const P4 =
  'schema P { __proto__: number, name: string }\nlet p = P { __proto__: "s", name: 2 }\np\n';

/** The well-typed control: it must keep loading clean AND keep branding. */
const OK = "schema Point { x: number, y: number }\nlet p = Point { x: 1, y: 2 }\np\n";

// ===========================================================================
// Parse-only harness.
// ===========================================================================

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "bug0031.theta");
}

/** The whole diagnostic list, rendered for failure text. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

/** Error-severity codes, deduplicated and sorted — an order-independent pin. */
function errorCodes(doc: ThetaDocument): string[] {
  return codes(errors(doc.diagnostics));
}

/** `severity message` for every diagnostic carrying `code`, sorted. */
function hits(doc: ThetaDocument, code: string): string[] {
  return doc.diagnostics
    .filter((d) => d.code === code)
    .map((d) => `${d.severity} ${d.message}`)
    .sort();
}

/**
 * The new row's emissions on `doc` are exactly `expected` (count, severity and
 * rendered message), asserted in one comparison so the red output carries the
 * whole actual diagnostic list. Severity is `error` per the §Fix row
 * (Sev `E`, following the bug-0014 `empty-query-annotation` precedent): the
 * value is unusable, so the theta must not load.
 */
function expectFieldMismatches(
  doc: ThetaDocument,
  expected: readonly string[],
  why: string,
): void {
  expect(
    hits(doc, CODE),
    `${why}\n  expected ${CODE} emissions: ${JSON.stringify(expected)}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected].map((m) => `error ${m}`).sort());
}

/** The new row emits nothing on `doc` (the residue and intersection negatives). */
function expectNoFieldMismatch(doc: ThetaDocument, why: string): void {
  expect(hits(doc, CODE), `${why}; actual diagnostics=${render(doc)}`).toEqual([]);
}

// ===========================================================================
// (a) w1–w5 — the declared-name, wrong-typed-value fixtures. RED at this HEAD:
// each parses with ZERO diagnostics.
// ===========================================================================

describe("bug 0031 (a) — a constructor field value is checked against its declared field type", () => {
  it("RED w1: `Point { x: \"not a number\", y: true }` fires object-field-type-mismatch on BOTH fields", () => {
    // The headline fixture. Both operands are inside the parser's static view —
    // a string / boolean literal and a declared `number` field — so
    // type-system.md:48 licenses no deferral, and the matched `let` (control c1)
    // decides the identical pair one position over.
    const doc = parse(W1);
    expectFieldMismatches(
      doc,
      [
        fieldMismatch("x", "Point", "number", "string"),
        fieldMismatch("y", "Point", "number", "boolean"),
      ],
      "w1 — per-field diagnostics: the check runs over each field of the intersection, so two mistyped fields report twice",
    );
  });

  it("RED w2: `Holder { r: Ok(1) }` fires object-field-type-mismatch — the Result-smuggle route closes", () => {
    // The limit case. `theta/parse/result-in-schema-position` (control c7) makes
    // a `Result`-typed field undeclarable, so every declared field type is
    // lowerable and a `result-ctor` value is incompatible with whatever the
    // field declares — decidable without a `Result` arm in `CompatType`. §Fix:
    // "Reject a `result-ctor` field value outright … it is the only way w2
    // closes". `<actual>` renders the inferred named type by its identifier
    // (category-1 rendering): a `result-ctor` types as named `"Ok"` / `"Err"`
    // (src/parser/static-type-inference.ts), which is also why `checkCompatible`
    // alone answers "unknown" here and probes r1a/r1b stay silent.
    const doc = parse(W2);
    expectFieldMismatches(
      doc,
      [fieldMismatch("r", "Holder", "Inner", "Ok")],
      "w2 — a `result-ctor` in a constructor field is rejected outright by the field position",
    );
  });

  it("RED w3: `Holder { r: Other { a: 1 } }` fires object-field-type-mismatch — TYPE-10 nominal", () => {
    // The sharpest instance: BOTH sides resolve. TYPE-10
    // (type-system.md:52) makes `Other ⋢ Inner` regardless of field shape, the
    // engine decides it at the `let` sink (control c2), and today the
    // constructor field never asks.
    const doc = parse(W3);
    expectFieldMismatches(
      doc,
      [fieldMismatch("r", "Holder", "Inner", "Other")],
      "w3 — two distinct named schemas with identical field shape are incompatible by name identity (TYPE-10)",
    );
  });

  it("RED w4: `Bag { xs: [\"a\", \"b\"] }` fires BOTH object-field-type-mismatch and array-element-type-mismatch", () => {
    // The normative half: grammar.md:216–221 declares the `array<T>` sink set
    // exhaustive and lists the declared type of a surrounding constructor field
    // in it at :220. §Fix threads the declared field type as the element sink
    // and marks the node skipped, mirroring the typed-`let` arm — so this
    // fixture emits the same PAIR the matched `let` (control c3) emits today,
    // with the new code standing where `let-rhs-type-mismatch` stands there.
    const doc = parse(W4);
    expectFieldMismatches(
      doc,
      [fieldMismatch("xs", "Bag", "array<number>", "array<string>")],
      "w4 — the declared field type is the sink, so the field itself reports the mismatch",
    );
    expect(
      hits(doc, ARRAY_ELEMENT_CODE),
      `w4 — grammar.md:220's sink-set member is implemented, so the ALREADY-REGISTERED element code fires (code-registry-parse.md:40; expressions.md:224 "naming the offending element"); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${arrayElementMessage(0, "number", "string")}`]);
    expect(
      errorCodes(doc),
      `w4 — exactly the two codes, mirroring the pair control c3 exhibits today at the \`let\` sink (same engine, same routing); actual diagnostics=${render(doc)}`,
    ).toEqual([ARRAY_ELEMENT_CODE, CODE].sort());
  });

  it("RED w5: `N { i: 1.5 }` fires the REGISTERED integer-narrowing code, not the new one", () => {
    // §Fix routes the compatibility outcome the way `checkLetRhsCompat` does:
    // "incompatible" emits the new code, "integer-narrowing" emits the
    // registered `theta/parse/integer-narrowing` (code-registry-parse.md:24).
    // So w5 closes through an existing row and the new row must NOT also fire.
    const doc = parse(W5);
    expect(
      hits(doc, INTEGER_NARROWING_CODE),
      `w5 — the one-way \`integer → number\` widening is reported by its own registered code; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${registered(INTEGER_NARROWING_CODE)}`]);
    expectNoFieldMismatch(
      doc,
      "w5 — the narrowing outcome routes to the registered narrowing code, so the new row does not double-report",
    );
    expect(
      errorCodes(doc),
      `w5 — exactly one code, matching control c4 byte-for-byte; actual diagnostics=${render(doc)}`,
    ).toEqual([INTEGER_NARROWING_CODE]);
  });
});

// ===========================================================================
// (b) The intersection rule — §Fix: "Fields absent from the declaration, and
// declared fields absent from the literal, keep reporting through the existing
// presence checks … the type check runs over the intersection so a mistyped
// extra field does not produce two diagnostics."
// ===========================================================================

describe("bug 0031 (b) — the type check runs over the intersection of literal and declaration", () => {
  it("x1: an UNDECLARED mistyped field stays extra-object-field alone — no second diagnostic", () => {
    // `z` has no declared type to be compared against, so the presence gate is
    // its whole disposition. Green at this HEAD and after: the pin is that the
    // fix does not double-report.
    const doc = parse(X1);
    expect(
      hits(doc, EXTRA_FIELD_CODE),
      `x1 — the undeclared field reports through the presence gate (code-registry-parse.md:44); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${extraFieldMessage("z", "Point")}`]);
    expectNoFieldMismatch(
      doc,
      "x1 — `z` is outside the intersection, so the type check has no declared type to compare and must stay silent",
    );
    expect(
      errorCodes(doc),
      `x1 — exactly one code (control c5's disposition, unchanged); actual diagnostics=${render(doc)}`,
    ).toEqual([EXTRA_FIELD_CODE]);
  });

  it("RED x2: an omitted field AND a mistyped present field each report through their own gate", () => {
    // `y` is absent from the literal (presence gate, green today) and `x` is
    // present and mistyped (the new code, RED today). The two gates partition
    // the field set; neither suppresses the other.
    const doc = parse(X2);
    expect(
      hits(doc, MISSING_FIELD_CODE),
      `x2 — the omitted declared field keeps its presence gate (code-registry-parse.md:45); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${missingFieldMessage("y", "Point")}`]);
    expectFieldMismatches(
      doc,
      [fieldMismatch("x", "Point", "number", "string")],
      "x2 — the field PRESENT in both literal and declaration is in the intersection, so its value is type-checked even though a sibling field is missing",
    );
    expect(
      errorCodes(doc),
      `x2 — exactly the two codes, one per gate; actual diagnostics=${render(doc)}`,
    ).toEqual([MISSING_FIELD_CODE, CODE].sort());
  });

  it("p1: an undeclared field named `toString` stays extra-object-field alone — no prototype-chain read", () => {
    // `toString` is not in the intersection: `schema S` declares only `x`. A
    // declared-field record with `Object.prototype` on its chain answers the
    // `toString` lookup with the inherited function, which is neither
    // `undefined` nor a `CompatType`, and the field position reports a second
    // (spurious) diagnostic against a type the schema never declared.
    const doc = parse(P1);
    expect(
      hits(doc, EXTRA_FIELD_CODE),
      `p1 — the undeclared field reports through the presence gate alone; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${extraFieldMessage("toString", "S")}`]);
    expectNoFieldMismatch(
      doc,
      "p1 — `toString` is outside the intersection, so the type check must stay silent however `Object.prototype` spells the name",
    );
    expect(
      errorCodes(doc),
      `p1 — exactly one code, x1's disposition with a prototype-colliding field name; actual diagnostics=${render(doc)}`,
    ).toEqual([EXTRA_FIELD_CODE]);
  });

  it("p2: an undeclared field named `constructor` stays extra-object-field alone", () => {
    // The same hazard under the other reliably-present `Object.prototype`
    // member; pinned separately so a partial guard (one name special-cased)
    // cannot pass.
    const doc = parse(P2);
    expect(
      hits(doc, EXTRA_FIELD_CODE),
      `p2 — the undeclared field reports through the presence gate alone; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${extraFieldMessage("constructor", "S")}`]);
    expectNoFieldMismatch(
      doc,
      "p2 — `constructor` is outside the intersection, so the type check must stay silent",
    );
    expect(
      errorCodes(doc),
      `p2 — exactly one code; actual diagnostics=${render(doc)}`,
    ).toEqual([EXTRA_FIELD_CODE]);
  });

  it("p3: a well-typed field literally named `__proto__` loads clean", () => {
    // The false-positive half of the `__proto__` hazard: a declared-field record
    // whose `__proto__` write went to the prototype slot leaves the field with
    // no recorded type, and whatever the prototype now resolves to is compared
    // against the value instead.
    const doc = parse(P3);
    expect(
      doc.diagnostics,
      `p3 — both fields are well-typed against their declarations, so the theta loads with zero diagnostics; actual diagnostics=${render(doc)}`,
    ).toEqual([]);
  });

  it("p4: a mistyped field literally named `__proto__` reports per field, like any other name", () => {
    // The coverage half: `__proto__` is an ordinary member of the intersection.
    // A record that routed its declared type into the prototype slot answers no
    // own key for it, so the field silently loses its check while its sibling
    // keeps one — which is why both fields are pinned in one comparison.
    const doc = parse(P4);
    expectFieldMismatches(
      doc,
      [
        fieldMismatch("__proto__", "P", "number", "string"),
        fieldMismatch("name", "P", "string", "integer"),
      ],
      "p4 — a field named `__proto__` is checked exactly like `name`: two mistyped fields, two diagnostics, each attributed to its own field",
    );
    expect(
      errorCodes(doc),
      `p4 — exactly the one code; actual diagnostics=${render(doc)}`,
    ).toEqual([CODE]);
  });
});

// ===========================================================================
// (c) c1–c7 — the controls. GREEN at this HEAD and after: c1–c4 are the matched
// `let` sinks whose engine the fix reuses (so a regression there means the fix
// changed the wrong arm), c5–c7 are the gates that already fire at or around
// the constructor.
// ===========================================================================

describe("bug 0031 (c) — controls: the matched `let` sinks and the existing constructor gates are byte-unchanged", () => {
  it("c1: `let x: number = \"not a number\"` stays let-rhs-type-mismatch", () => {
    const doc = parse(C1);
    expect(
      hits(doc, LET_RHS_CODE),
      `c1 pairs with w1: same value, same declared type, one position over; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("x", "number", "string")}`]);
    expect(errorCodes(doc), render(doc)).toEqual([LET_RHS_CODE]);
    expectNoFieldMismatch(doc, "c1 — there is no constructor here, so the new row must not fire");
  });

  it("c2: `let r: Inner = Other { a: 1 }` stays let-rhs-type-mismatch (TYPE-10 at the `let` sink)", () => {
    const doc = parse(C2);
    expect(
      hits(doc, LET_RHS_CODE),
      `c2 pairs with w3 and proves the engine already decides the nominal case; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("r", "Inner", "Other")}`]);
    expect(errorCodes(doc), render(doc)).toEqual([LET_RHS_CODE]);
    expectNoFieldMismatch(
      doc,
      "c2 — `Other { a: 1 }` is well-typed FOR `Other`, so the constructor's own field check stays silent; only the `let` sink rejects",
    );
  });

  it("c3: `let xs: array<number> = [\"a\", \"b\"]` stays the let-rhs + array-element PAIR", () => {
    // The pair w4 must mirror. Pinned here so the mirroring claim in (a) rests
    // on a measured control rather than on prose.
    const doc = parse(C3);
    expect(
      hits(doc, LET_RHS_CODE),
      `c3 — the annotation sink's own mismatch; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("xs", "array<number>", "array<string>")}`]);
    expect(
      hits(doc, ARRAY_ELEMENT_CODE),
      `c3 — the element sink names the offending element (expressions.md:224); actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${arrayElementMessage(0, "number", "string")}`]);
    expect(errorCodes(doc), render(doc)).toEqual([ARRAY_ELEMENT_CODE, LET_RHS_CODE].sort());
    expectNoFieldMismatch(doc, "c3 — no constructor, no new row");
  });

  it("c4: `let i: integer = 1.5` stays integer-narrowing", () => {
    const doc = parse(C4);
    expect(
      hits(doc, INTEGER_NARROWING_CODE),
      `c4 pairs with w5; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${registered(INTEGER_NARROWING_CODE)}`]);
    expect(errorCodes(doc), render(doc)).toEqual([INTEGER_NARROWING_CODE]);
    expectNoFieldMismatch(doc, "c4 — no constructor, no new row");
  });

  it("c5: `Point { x: 1, z: 3 }` stays extra-object-field alone", () => {
    const doc = parse(C5);
    expect(
      hits(doc, EXTRA_FIELD_CODE),
      `c5 — the presence gate is not dead; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${extraFieldMessage("z", "Point")}`]);
    expect(errorCodes(doc), render(doc)).toEqual([EXTRA_FIELD_CODE]);
    expectNoFieldMismatch(
      doc,
      "c5 — `x: 1` is well-typed and `z` is outside the intersection, so the new row adds nothing here",
    );
  });

  it("c6: `Point { x: 1 }` (y declared) stays missing-object-field alone", () => {
    const doc = parse(C6);
    expect(
      hits(doc, MISSING_FIELD_CODE),
      `c6 — the presence gate is not dead; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${missingFieldMessage("y", "Point")}`]);
    expect(errorCodes(doc), render(doc)).toEqual([MISSING_FIELD_CODE]);
    expectNoFieldMismatch(
      doc,
      "c6 — the only present field is well-typed; the omitted field is the presence gate's business",
    );
  });

  it("c7: `schema Holder { r: Result<number, string> }` stays result-in-schema-position", () => {
    // c7 against w2: declaring a `Result`-typed field is rejected, which is
    // exactly why a `result-ctor` field VALUE is decidably incompatible with
    // whatever the field declares (§Fix). This control is the premise w2's
    // outright rejection rests on — if it ever stopped firing, w2's rule would
    // lose its justification.
    const doc = parse(C7);
    expect(
      hits(doc, RESULT_IN_SCHEMA_CODE),
      `c7 — code-registry-parse.md:60; actual diagnostics=${render(doc)}`,
    ).toEqual([`error ${registered(RESULT_IN_SCHEMA_CODE)}`]);
    expect(errorCodes(doc), render(doc)).toEqual([RESULT_IN_SCHEMA_CODE]);
  });
});

// ===========================================================================
// (d) r1–r5 — the residue probes, pinned as NEGATIVE tests. §Fix: "Coverage is
// partial by construction, and identical to the typed-`let` position's" —
// `checkCompatible` returns "unknown" whenever either operand is a `named` type
// absent from the `TypeEnv` (call results, `enum`-declared field types,
// literal-type field annotations), and type-system.md:48 licenses the
// deferral. Each row is measured on BOTH sides — the constructor field and the
// matched `let` — so a later widening of `collectTypeEnv` is a deliberate change
// and not a silent one.
//
// r3a/r3b are that deliberate change, and it arrives from a direction the
// banner did not name: bug 0136 widens `#typeExpr`'s `case "member"` ARM — the
// arm now answers the receiver's DECLARED field type — rather than widening
// `collectTypeEnv`, which still records `schema` declarations only. A member
// read is consequently inside the parser's static view and stops being a
// residue, so the pair is measured POSITIVELY on both sides. 0031's subject is
// preserved and strengthened by that: its constructor-field check is now scored
// by an emission at r3a instead of by a silence, with r3b deciding the identical
// value/declaration pair at the matched `let` sink one position over. r1, r2, r4
// and r5 remain residues, and total silence stays their pin.
// ===========================================================================

describe("bug 0031 (d) — residues: unresolvable operands stay silent at the constructor field AND at the matched `let`", () => {
  function expectSilent(body: string, why: string): void {
    const doc = parse(body);
    expect(
      doc.diagnostics,
      `${why} — this row must stay silent on BOTH sides; a diagnostic here means coverage widened, which §Fix requires to be a deliberate change; actual diagnostics=${render(doc)}`,
    ).toEqual([]);
  }

  it("r1a/r1b: a `result-ctor` at a typed `let` stays silent — only the constructor FIELD position rejects it", () => {
    // The correction the bug doc records against its own split-out's inherited
    // claim: `checkCompatible` answers "unknown" for a `result-ctor` operand at
    // EVERY sink, so w2 does not close by threading declared field types. §Fix
    // closes it with an outright rejection scoped to the constructor field —
    // which means these two `let` rows must remain silent after the fix.
    expectSilent(R1A, "r1a — `let r: Inner = Ok(1)`");
    expectSilent(R1B, "r1b — `let n: number = Ok(1)`");
  });

  it("r2a/r2b: a call result stays silent (a call types as named `f`, unresolvable in the TypeEnv)", () => {
    expectSilent(R2A, "r2a — `S { n: f() }`");
    expectSilent(R2B, "r2b — `let n: number = f()`");
  });

  /**
   * The whole ordered diagnostic list, one `severity code: message` entry per
   * emission — `expectSilent`'s strength pointed the other way, so an absent
   * emission, an extra emission and a reordering all red.
   */
  function expectExactly(body: string, expected: readonly string[], why: string): void {
    const doc = parse(body);
    expect(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
      `${why}; actual diagnostics=${render(doc)}`,
    ).toEqual([...expected]);
  }

  it("r3a/r3b: a member read is JUDGED on both sides — the receiver's declared field type reaches each sink", () => {
    // `p.x` reads a field declared `string` off a receiver that resolves to
    // `schema P`, so the operand is inside the parser's static view and
    // type-system.md:48 licenses no deferral at either sink: the constructor
    // field compares `string` against the declared `number` (r3a), and the `let`
    // annotation decides the identical pair one position over (r3b). Both sinks
    // read the one inference seam, so there is no per-consumer split to make and
    // the two move together.
    expectExactly(
      R3A,
      [`error ${CODE}: ${fieldMismatch("n", "S", "number", "string")}`],
      "r3a — `S { n: p.x }`: 0031's own constructor-field check, scored by an emission rather than by a silence",
    );
    expectExactly(
      R3B,
      [`error ${LET_RHS_CODE}: ${letRhsMessage("n", "number", "string")}`],
      "r3b — `let n: number = p.x`: the matched `let` sink on the same value and the same declared type",
    );
  });

  it("r4a/r4b: an `enum`-declared field type stays silent — `collectTypeEnv` records no `enum` names", () => {
    // Recording `enum` declarations in the `TypeEnv` is an explicit §Non-goal:
    // it would close r4a AND change the typed-`let` position (r4b), so it is a
    // coverage change at two positions, not one. Both sides are pinned so that
    // change cannot land silently.
    expectSilent(R4A, "r4a — `Box { c: 3 }` with `c: Color`");
    expectSilent(R4B, "r4b — `let c: Color = 3`");
  });

  it("r5a/r5b: a literal-type field annotation stays silent — `annotationToCompatType` maps it to an unresolvable `named`", () => {
    expectSilent(R5A, 'r5a — `S { k: "zzz" }` with `k: "a" | "b"`');
    expectSilent(R5B, 'r5b — `let k: "a" | "b" = "zzz"`');
  });
});

// ===========================================================================
// (e) The runtime observables — the leak the static check removes. §Fix makes
// NO runtime change: the brand sites stay as they are, and the malformed values
// disappear because the input no longer loads. So each row's post-fix contract
// is "refused at parse, therefore never evaluated", and its RED output carries
// the branded value that was actually minted at this HEAD.
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

/** One row's disposition: refused by the parse, or loaded and evaluated. */
type Load =
  | { readonly kind: "refused"; readonly doc: ThetaDocument }
  | { readonly kind: "ran"; readonly execution: BodyExecution };

/**
 * Parse `body`; if it carries any error-severity diagnostic the theta never
 * runs (the load path drops it), so report `refused`. Otherwise drive it through
 * the production prompt-mode binding and report what it evaluated to. No branch
 * skips: both dispositions are asserted against below.
 */
async function load(body: string): Promise<Load> {
  const doc = parse(body);
  if (errors(doc.diagnostics).length > 0) {
    return { kind: "refused", doc };
  }
  const theta: ThetaCompositionInput = {
    slashName: "bug0031",
    sourcePath: "/theta/bug0031.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return { kind: "ran", execution: await executeBody(theta.body, binding.executeDeps) };
}

/**
 * The brand evidence for a value the theta minted: the outcome, the payload, the
 * schema brand `schemaTagOf` reads, and per field the inner brand plus
 * `isResultValue`. This string is what a RED row prints, so the failure names
 * the exact branded-but-malformed value that leaked rather than only reporting
 * "no diagnostic".
 */
function brandEvidence(execution: BodyExecution): string {
  const value: ThetaValue | undefined = execution.result.value;
  const tag = value === undefined ? "n/a" : (schemaTagOf(value) ?? "unbranded");
  const parts: string[] = [];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [name, field] of Object.entries(value as { readonly [k: string]: ThetaValue })) {
      parts.push(
        `${name}: schemaTagOf=${schemaTagOf(field) ?? "unbranded"} isResultValue=${String(isResultValue(field))}`,
      );
    }
  }
  return `LOADED CLEAN AND RAN — outcome=${execution.outcome}, schemaTagOf=${tag}, payload=${JSON.stringify(value)}${
    parts.length > 0 ? `, fields{ ${parts.join("; ")} }` : ""
  }`;
}

/** A row's disposition rendered as one comparable string. */
function disposition(loaded: Load): string {
  return loaded.kind === "refused"
    ? `REFUSED AT PARSE — ${errorCodes(loaded.doc).join(", ")}`
    : brandEvidence(loaded.execution);
}

describe("bug 0031 (e) — the branded-but-malformed values are gone because the input no longer loads", () => {
  async function expectRefused(
    body: string,
    expectedCodes: readonly string[],
    why: string,
  ): Promise<void> {
    const loaded = await load(body);
    expect(
      disposition(loaded),
      `${why} — §Fix makes NO runtime change: both brand sites (statement-executor.ts, production-theta-producer.ts) still brand on \`env.resolveSchema(typeName)\` alone, so the malformed value disappears only because the parse now rejects the source`,
    ).toBe(`REFUSED AT PARSE — ${[...expectedCodes].sort().join(", ")}`);
  }

  it("RED e1 (w1): `Point { x: \"not a number\", y: true }` never mints a Point-branded value", async () => {
    // The brand is authoritative on the QRY-18 outbound render (over the
    // declared-type hint), so today this value is rendered to the wire under
    // `Point`'s wire names — a payload that does not validate against `Point`'s
    // lowering, falsifying type-system.md:29.
    await expectRefused(W1, [CODE], "e1 (w1)");
  });

  it("RED e2 (w2): `Holder { r: Ok(1) }` never mints a Holder carrying a Result", async () => {
    // The state `theta/parse/result-in-schema-position` exists to make
    // unrepresentable: `isResultValue(h.r)` is `true` at this HEAD.
    await expectRefused(W2, [CODE], "e2 (w2)");
  });

  it("RED e3 (w3): `Holder { r: Other { a: 1 } }` never mints a Holder whose `r` is Other-branded", async () => {
    // `schemaTagOf(h.r)` is `"Other"` at this HEAD while the declared field type
    // is `Inner` — TYPE-10 says the two are incompatible by name identity.
    await expectRefused(W3, [CODE], "e3 (w3)");
  });

  it("RED e4 (w4): `Bag { xs: [\"a\", \"b\"] }` never mints a Bag of strings", async () => {
    await expectRefused(W4, [CODE, ARRAY_ELEMENT_CODE], "e4 (w4)");
  });

  it("CONTROL e5: a WELL-TYPED constructor still loads clean, runs, and brands", async () => {
    // The row an over-broad fix breaks first. Everything the w-rows lose must
    // stay intact here: zero diagnostics, a successful body, the `Point` brand,
    // and the exact payload.
    const doc = parse(OK);
    expect(
      doc.diagnostics,
      `CONTROL BROKEN — a well-typed constructor must keep loading with zero diagnostics; actual diagnostics=${render(doc)}`,
    ).toEqual([]);
    const loaded = await load(OK);
    expect(
      loaded.kind,
      "CONTROL BROKEN — the well-typed source must reach evaluation",
    ).toBe("ran");
    if (loaded.kind !== "ran") {
      throw new Error("unreachable: the assertion above fails on a refused disposition");
    }
    expect(loaded.execution.outcome, "the body succeeds").toBe("success");
    expect(
      loaded.execution.result.value,
      "the payload is unchanged by the new check",
    ).toEqual({ x: 1, y: 2 });
    expect(
      loaded.execution.result.value === undefined
        ? "n/a"
        : schemaTagOf(loaded.execution.result.value),
      "the brand still comes from `env.resolveSchema(typeName)` — §Fix changes no runtime site",
    ).toBe("Point");
  });
});

// ===========================================================================
// (f) DIAG-4 drift guard for the new registry row. RED until the 0031 fix
// commit adds the row — BY DESIGN: the code and its Message template are a
// DIAG-2 spec change that lands in lock-step with the implementation
// (diagnostic-shape.md:72), admissible within a theta 1.x minor under the
// GOV-15 diagnostic-registry carve-out (source-language-stability.md:25)
// because its only effect is that previously clean-loading inputs gain the
// emission. This guard is what keeps EXPECTED_TEMPLATE above from silently
// drifting from the registry.
// ===========================================================================

describe("bug 0031 (f) — the new registry row (DIAG-2 / DIAG-4)", () => {
  it("RED REG: code-registry-parse.md carries the object-field-type-mismatch row, Sev E, phase type, with the pinned Message template", () => {
    const row = REGISTRY.find((r) => r.code === CODE);
    expect(
      row,
      `THE 0031 FIX COMMIT MUST ADD THIS ROW — docs/spec_topics/diagnostics/code-registry-parse.md has no row for ${CODE} at this HEAD, and that is the registry gap the bug doc's §Fix closes (DIAG-2, diagnostic-shape.md:72: adding a code is a spec change landing in lock-step with the implementation). This assertion is expected to be RED until then`,
    ).toBeDefined();
    expect(
      row!.severity,
      "§Fix: severity is E, following the bug-0014 `empty-query-annotation` precedent — the constructed value is unusable, so the theta must not load",
    ).toBe("E");
    expect(
      row!.phase,
      "§Fix emits from the type phase (`TypeLayerWalk.walkExpr`'s `object` arm), the same phase as the `let`-RHS row at code-registry-parse.md:54",
    ).toBe("type");
    expect(
      row!.trigger,
      `§Fix's Trigger cell names the schema-constructor field position and carries row :54's resolvability qualifier; actual trigger=${JSON.stringify(row!.trigger)}`,
    ).toMatch(/schema-constructor field value/i);
    expect(
      row!.message,
      "DIAG-4: the *Message* column is normative and this file interpolates it — the four placeholders `<field>` / `<schema>` / `<expected>` / `<actual>` already exist in the closed placeholder surface, so the template introduces no new rendering vector",
    ).toBe(EXPECTED_TEMPLATE);
  });

  it("the interpolated messages this file asserts render as the bug doc's §Fix states them", () => {
    // A pure-rendering check over the pinned template: it can never red for a
    // parser reason, so a red in group (a) is never confounded with a
    // mis-spelled expectation here.
    expect(fieldMismatch("x", "Point", "number", "string")).toBe(
      "field 'x' on schema 'Point' type mismatch: expected number, got string",
    );
    expect(fieldMismatch("y", "Point", "number", "boolean")).toBe(
      "field 'y' on schema 'Point' type mismatch: expected number, got boolean",
    );
    expect(fieldMismatch("r", "Holder", "Inner", "Ok")).toBe(
      "field 'r' on schema 'Holder' type mismatch: expected Inner, got Ok",
    );
    expect(fieldMismatch("r", "Holder", "Inner", "Other")).toBe(
      "field 'r' on schema 'Holder' type mismatch: expected Inner, got Other",
    );
    expect(fieldMismatch("xs", "Bag", "array<number>", "array<string>")).toBe(
      "field 'xs' on schema 'Bag' type mismatch: expected array<number>, got array<string>",
    );
  });
});
