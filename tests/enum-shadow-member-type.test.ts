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
import { isThetaPanic, surfaceUnexpectedThrow } from "../src/runtime/runtime-panics";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";
import { errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0191 — `#memberType` (src/parser/static-type-inference.ts, the one reader
// `#typeExpr`'s `case "member"` delegates to) resolves its receiver against the
// `TypeEnv` and reads the field off the receiver's declaration. Bug 0136 gave
// `Enum.Variant` its spec'd type through the branch that fires when the
// receiver resolves to NOTHING: `collectTypeEnv`
// (src/parser/type-layer-checks.ts) records `schema` declarations only, so
// `named "Color"` is unresolvable and the arm hands it back —
// docs/spec_topics/schemas.md:97's "statically typed as `Enum`", obtained with
// no enum-name source.
//
// A same-file `schema` spelled like the enum removes that branch: `resolveNamed`
// answers the schema, the variant is no own field of it and can never be one
// (variant names are PascalCase, field names lowercase-first —
// docs/spec_topics/lexical.md:15, and the ill-cased spelling is refused, row
// f1), so the arm reaches its closing nominal fallback and mints
// `named <variant>`. That name is lookupable, so a third declaration spelled
// like the variant becomes the static type of `Color.Red`
// (docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md).
//
// ── THE SETTLED ROUTE THIS FILE ENCODES ─────────────────────────────────────
// §Fix route 1: an enum-name source threaded into the pass. In the member arm a
// member access with the variant-access SHAPE is recognised BEFORE the
// `TypeEnv` schema lookup, and the arm answers with a nominal that carries the
// ENUM's name for display but resolves to NO declaration: a provenance-marked
// `named` in the exact shape of bug 0143's withheld marker (the `withheld` flag
// on `CompatType`'s `named` arm, minted only by `withheldBinderType`,
// src/parser/type-compat.ts).
//
// THE SHAPE, not the receiver's inferred TYPE, is the gate — the predicate is
// the runtime's own, in symbol form: `evalExpr`'s `case "member"`
// (src/runtime/statement-executor.ts) fires its `env.resolveEnumVariant` read
// only for `expr.target.kind === "ident"` whose `env.resolve(name).arm` is not
// `"local"`, and the structural checker keys the same way, on
// `refs.enums.get(e.target.name)` over the target ident (`checkStructural`'s
// `member` arm, src/parser/theta-document.ts). Group (p) below is the witness
// for that gating: a type-keyed test additionally captures every member read
// off a VALUE typed by the shadowing schema, which loses a
// `let-rhs-type-mismatch` a declared-field read is owed (p1) and adds a
// `non-array-iterand` refusal of a spec-legal program (p4).
//
// Constraint A (§Fix) is why the answer must resolve to nothing: group (g)
// measures what a LOOKUPABLE `named "Color"` draws in six positions — four
// refusals naming the schema and two silent accepts of object operations an
// enum value cannot support — so answering with the shadowing schema's own
// nominal trades one wrong answer for another. Constraint C is why one answer
// serves every check: the arm is read through the single public `typeOf` seam
// (`StaticTypeInferencePass.typeOf`, src/parser/static-type-inference.ts), so
// no per-consumer split exists.
//
// THE CONSEQUENCE THIS FILE ASSERTS: every shadowed row's whole diagnostic list
// becomes BYTE-IDENTICAL to its un-shadowed control's, except where the
// shadowing declaration draws a diagnostic of its OWN for its own reason (e4's
// `empty-schema-body`, f1's `binding-case-mismatch`). That is why every group
// below is written as a shadowed/control PAIR and asserts the pair's equality
// explicitly rather than restating a literal twice: the contract is a sameness
// claim, so a fix that merely swaps one wrong code for another still reds.
//
// ── TIER: unit, offline, provider-free ──────────────────────────────────────
// The defect is a static type the type layer of the load path computes, and its
// whole observable is the document's aggregated `diagnostics` list — one
// `parseThetaDocument` call. The runtime rows need only the in-process
// production prompt-mode binding: no provider, no model, no child process, no
// network. An INTEGRATION tier would add a session round-trip that can observe
// neither the inferred `CompatType` nor the diagnostic list; a LIVE tier would
// put a stochastic model between the fixture and the assertion for no added
// coverage, and nothing in §Fix route 1 touches a live-exercised surface (the
// subagent child launch, the production drivers, the binder).
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// Parse rows: the shared house driver `parseDoc` (tests/helpers/e2e-s1.ts:39),
// the real `parseThetaDocument` behind inert offline seams — the entry point
// §Reproduction measured, with `---\nmode: prompt\n---\n` prepended and the
// trailing value each row already carries. `codes` / `msgs` are the WHOLE
// aggregated list, unfiltered, in emission order, so an absent emission, an
// extra emission and a reordering all red. Runtime rows: the production-executor
// shape tests/member-access-declared-field-type.test.ts:1184–1253 establishes —
// `parseThetaDocument` → `createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md:74 makes the registry's
// *Message* column normative and requires an asserting test to source the string
// from that column. Every expected message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated; no
// registry prose is copied into a literal. A missing row throws NAMING the row
// and a template missing a needed placeholder throws naming both — never a skip,
// and never a silent comparison against `undefined` (CLAUDE.md: no silent test
// skipping).
//
// ── BOTH DIRECTIONS ─────────────────────────────────────────────────────────
// RED at this HEAD, and green once route 1 lands: a1, b5, c1, c3, c5, c7 (each
// emitting a code its control does not), d1, d4, d6 (each MISSING the
// `theta/parse/non-array-iterand` its control emits), e1, e2, e3, e4, f1, and the
// runtime rows r1 / r3 (which load and iterate zero times where the refusal is
// owed).
// GREEN in both directions — the bounds a wrong fix breaks: a2/a3/a4, b1–b4,
// c2/c4/c6/c8, d2/d3/d5, e5 and its control, f2, f3, f4, all of (g), and the
// runtime controls r2/r4/r5/r8.
//
// f4 is a RECORDED RESIDUAL, not a claim: the same fabrication with NO enum
// involved (a genuinely absent field whose spelling matches a declaration).
// Route 1 threads an ENUM-name source, so it closes the enum half only and f4
// keeps exactly the disposition measured here. Its second code
// (`theta/parse/type-as-value`) is bug 0140's row firing on the bare receiver
// name; the filing predates that row, so f4's list is stated as MEASURED at this
// HEAD rather than as filed.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// Implementation and spec citations above and below are re-derived against this
// tree: the bug document's own line spans predate bug 0136's arm extraction into
// `#memberType` and have drifted, so the site is cited at its symbol plus this
// tree's line.

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
 * The runtime-phase registry table. The (r) group's panic rows read their
 * expected message from here for the same DIAG-4 reason the parse rows read
 * theirs from the parse table: the *Message* column is normative, so a runtime
 * disposition asserted as a literal would pin this file's own prose instead of
 * the registry's.
 */
const RUNTIME_REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../docs/spec_topics/diagnostics/code-registry-runtime.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * A registered code's normative *Message* with its placeholders interpolated.
 * Fails LOUDLY naming the registry page and the row when the table has none,
 * and naming both row and placeholder when the template does not carry one.
 * One implementation over both tables so the parse rows and the runtime rows
 * cannot drift into two different loudness postures.
 */
function fromRegistry(
  table: readonly RegistryRow[],
  page: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]>,
): string {
  const template = registryMessage(table, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/${page} carries no Message row for ${code} — the DIAG-4 column (diagnostic-shape.md:74) is this file's only oracle, so a missing row is a harness failure, never a skip`,
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

/** A parse-phase row's interpolated *Message*. */
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return fromRegistry(REGISTRY, "code-registry-parse.md", code, fills);
}

/** A runtime-phase row's interpolated *Message*. */
function runtimeMsg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  return fromRegistry(RUNTIME_REGISTRY, "code-registry-runtime.md", code, fills);
}

const UNKNOWN_METHOD = "theta/parse/unknown-method";
const MIXED_PLUS = "theta/parse/mixed-plus-operands";
const NON_INDEXABLE = "theta/parse/non-indexable-receiver";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const NON_ARRAY_ITERAND = "theta/parse/non-array-iterand";
const EMPTY_SCHEMA_BODY = "theta/parse/empty-schema-body";
const UNKNOWN_VARIANT = "theta/parse/unknown-variant";
const BINDING_CASE = "theta/parse/binding-case-mismatch";
const TYPE_AS_VALUE = "theta/parse/type-as-value";
const NON_OBJECT_RECEIVER = "theta/runtime/non-object-receiver";

/**
 * `non-object receiver: cannot read <read> on <receiver kind>`
 * (code-registry-runtime.md) — the runtime's own receiver-kind gate, which is
 * what an enum receiver reaches once the parse layer stops fabricating a type
 * for it.
 */
function nonObjectReceiver(read: string, receiverKind: string): string {
  return runtimeMsg(NON_OBJECT_RECEIVER, [
    ["<read>", read],
    ["<receiver kind>", receiverKind],
  ]);
}

/** `unknown method '<method>' on type <type>` (code-registry-parse.md:70) */
function unknownMethod(method: string, type: string): string {
  return msg(UNKNOWN_METHOD, [
    ["<method>", method],
    ["<type>", type],
  ]);
}

/** `'for' expects array<T> after 'in'; got <type>` (code-registry-parse.md:71) */
function iterand(type: string): string {
  return msg(NON_ARRAY_ITERAND, [["<type>", type]]);
}

/**
 * `let binding '<name>' initialiser type mismatch: expected <expected>, got
 * <actual>` (code-registry-parse.md:59)
 */
function letRhs(name: string, expected: string, actual: string): string {
  return msg(LET_RHS, [
    ["<name>", name],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
}

/** `'+' has mixed operand types: <left> and <right>` (code-registry-parse.md:39) */
function mixedPlus(left: string, right: string): string {
  return msg(MIXED_PLUS, [
    ["<left>", left],
    ["<right>", right],
  ]);
}

/**
 * `indexed access requires an array<T> or object receiver; got <type>`
 * (code-registry-parse.md:41)
 */
function nonIndexable(type: string): string {
  return msg(NON_INDEXABLE, [["<type>", type]]);
}

/**
 * `array.join requires a string element type; got array<<element>>`
 * (code-registry-parse.md:46) — the placeholder is the ELEMENT, so the rendered
 * `array<…>` wrapper comes from the registry template rather than from here.
 */
function nonStringJoin(element: string): string {
  return msg(NON_STRING_JOIN, [["<element>", element]]);
}

/** `unknown variant '<variant>' on enum '<enum>'` (code-registry-parse.md:109) */
function unknownVariant(variant: string, enumName: string): string {
  return msg(UNKNOWN_VARIANT, [
    ["<variant>", variant],
    ["<enum>", enumName],
  ]);
}

/**
 * `type '<name>' used as a value; …` (code-registry-parse.md:95) — bug 0140's
 * row, read only by the f4 residual.
 */
function typeAsValue(name: string): string {
  return msg(TYPE_AS_VALUE, [["<name>", name]]);
}

// ===========================================================================
// Parse harness.
// ===========================================================================

/** Every fixture is `mode: prompt` (§Reproduction). */
const FM = "---\nmode: prompt\n---\n";

/** The enum every row under test declares. */
const ENUM = "enum Color { Red }\n";
/** The object-schema shadow — the first of the two collisions the defect needs. */
const SHADOW = "schema Color { a: string }\n";

function parse(body: string): ThetaDocument {
  return parseDoc(FM + body, "b0191.theta");
}

function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}

interface Contract {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Contract = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
function one(code: string, message: string): Contract {
  return { codes: [code], msgs: [message] };
}

/**
 * One row's contract: the whole ordered code list AND the whole ordered message
 * list. Both are asserted, so a fix that restores the right code while
 * rendering the wrong identifier into its `<type>` placeholder reds on the
 * second comparison rather than passing on the first.
 */
function expectRow(label: string, body: string, expected: Contract, why: string): ThetaDocument {
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

/**
 * A shadowed/control PAIR. The control is asserted FIRST — it is the row that
 * states what the input class is owed, and a red there means the control itself
 * moved (a distinguishable, worse failure than the shadowed row moving). Then
 * the shadowed row is asserted against the same contract, and finally the two
 * lists are compared to each other: the route's whole claim is that a `schema`
 * spelled like the enum changes NOTHING, so the sameness is asserted as such
 * rather than left implicit in two matching literals.
 */
function expectPair(
  label: string,
  bodies: { readonly shadowed: string; readonly control: string },
  expected: Contract,
  why: string,
): void {
  const control = expectRow(
    `${label} control (no \`schema Color\`)`,
    bodies.control,
    expected,
    `the un-shadowed disposition this input class is owed — ${why}`,
  );
  const shadowed = expectRow(
    `${label} shadowed`,
    bodies.shadowed,
    expected,
    `adding \`schema Color { a: string }\` beside \`enum Color { Red }\` must change nothing: the runtime resolves the variant through the ENUM whatever a schema is spelled (\`evalExpr\`'s \`case "member"\`, statement-executor.ts) and schemas.md:97 types the expression as the enum — ${why}`,
  );
  expect(
    shadowed.diagnostics.map((d) => `${d.code}: ${d.message}`),
    `${label} — bug 0191 §Expected behaviour: the shadowed row's diagnostics must be BYTE-IDENTICAL to its control's. A code that merely CHANGES under the shadow is still a fabricated member type\n  shadowed: ${render(shadowed)}\n  control:  ${render(control)}`,
  ).toEqual(control.diagnostics.map((d) => `${d.code}: ${d.message}`));
}

// ===========================================================================
// (a) The reported shape, and the three controls that isolate it. a2 is the key
// control: with the enum name unshadowed the receiver is unresolvable, the arm
// returns `named "Color"`, and every consumer defers as type-system.md:48's
// *Unresolvable operands* paragraph prescribes. a3 shows the shadow ALONE is
// not observable — the fallback mints `named "Red"`, which resolves to nothing.
// Both collisions are required.
// ===========================================================================

const A_BODY = 'fn f(): string { Color.Red.join(",") }\nlet z = f()\nz\n';
const RED_ARRAY_INT = "schema Red = array<integer>\n";

describe("bug 0191 (a) — a schema spelled like the enum does not give the variant a third declaration's type", () => {
  it("RED a1: `Color.Red.join(\",\")` under the double collision draws nothing, as its control does", () => {
    // The reported row. At HEAD the arm mints `named "Red"`, `unfoldAlias`
    // resolves it against `schema Red = array<integer>`, and `join`'s element
    // precondition refuses a spec-legal program file-wide
    // (`hasLoadParseError` drops any theta carrying an error-severity
    // `theta/parse/*`), naming a declaration the expression has nothing to do
    // with.
    expectPair(
      "a1",
      {
        shadowed: ENUM + SHADOW + RED_ARRAY_INT + A_BODY,
        control: ENUM + RED_ARRAY_INT + A_BODY,
      },
      CLEAN,
      "the receiver is an enum, so no schema supplies the member read's type and the `join` precondition has no resolvable element to judge",
    );
  });

  it("CONTROL a3: the shadow ALONE is silent — the minted variant name resolves to nothing", () => {
    expectRow(
      "a3",
      ENUM + SHADOW + A_BODY,
      CLEAN,
      "with no `schema Red` the fabricated name resolves to no declaration, so every consumer defers exactly as a2 does — this row proves the defect needs BOTH collisions",
    );
  });

  it("CONTROL a4: neither collision — the baseline", () => {
    expectRow(
      "a4",
      ENUM + A_BODY,
      CLEAN,
      "bug 0136's enum route firing on an unshadowed, unresolvable receiver",
    );
  });
});

// ===========================================================================
// (b) The declaration pair itself. lexical.md:18 — "The casing rule and the
// import-specifier synthesised-name reservation are the only enforced naming
// constraints" — and enum, variant and schema names share one PascalCase
// namespace (lexical.md:15). §Fix's adjudication ("does a same-file `enum X` /
// `schema X` pair stay legal?") is answered YES by route 1, so these rows must
// stay silent: a fix that refuses the pair instead is route 4, a different
// route with its own DIAG-2 registry edit and its own GOV-15 disposition.
// ===========================================================================

describe("bug 0191 (b) — the declaration pair stays legal, in either order", () => {
  it("CONTROL b1: `enum Color` then `schema Color`", () => {
    expectRow("b1", ENUM + SHADOW + "1\n", CLEAN, "no registry row covers a cross-kind top-level name collision");
  });

  it("CONTROL b2: `schema Color` then `enum Color` — declaration order is irrelevant", () => {
    expectRow("b2", SHADOW + ENUM + "1\n", CLEAN, "`collectTypeEnv` keys by name and never records the enum, so the schema answers whichever side it is written on");
  });

  it("CONTROL b3: the pair plus the third colliding declaration", () => {
    expectRow(
      "b3",
      ENUM + SHADOW + RED_ARRAY_INT + "1\n",
      CLEAN,
      "all three declarations the defect needs, with no member read: the declarations are not the defect, the member read is",
    );
  });

  it("CONTROL b4: the alias spelling of the shadow is admitted too", () => {
    expectRow("b4", ENUM + "schema Color = string\n1\n", CLEAN, "lexical.md:18 admits the alias spelling identically");
  });

  it("RED b5: declaration order does not change the member read either", () => {
    // The shadow written BEFORE the enum. At HEAD this draws `unknown method
    // 'frobnicate' on type Red` exactly as c7 does, which is the evidence that
    // the arm reads the name, not the declaration order.
    expectPair(
      "b5",
      {
        shadowed: SHADOW + ENUM + "schema Red = string\nfn f() { Color.Red.frobnicate() }\nlet z = f()\nz\n",
        control: ENUM + "schema Red = string\nfn f() { Color.Red.frobnicate() }\nlet z = f()\nz\n",
      },
      CLEAN,
      "an unresolvable enum receiver defers the method gate, whichever side the shadow is written on",
    );
  });
});

// ===========================================================================
// (c) Four more registered `E`-severity codes, each against its un-shadowed
// control. Every row carries `enum Color { Red }`; the shadowed side adds
// `schema Color { a: string }`. c7 collides through an OBJECT schema, i.e.
// through `classifyReceiver`'s `"object"` answer rather than through
// `unfoldAlias`.
// ===========================================================================

describe("bug 0191 (c) — the four remaining registered codes fire on spec-legal input", () => {
  it("RED c1/c2: a typed `let` initialised from a variant draws no `let-rhs-type-mismatch`", () => {
    const body = "fn f(): integer { let m: integer = Color.Red  m }\nlet z = f()\nz\n";
    expectPair(
      "c1/c2",
      {
        shadowed: ENUM + SHADOW + "schema Red = string\n" + body,
        control: ENUM + "schema Red = string\n" + body,
      },
      CLEAN,
      "type-system.md:48: the operand is past the parser's static view, so the compatibility check is skipped rather than decided",
    );
  });

  it("RED c3/c4: `Color.Red + \"x\"` draws no `mixed-plus-operands`", () => {
    const body = 'fn f(): string { Color.Red + "x" }\nlet z = f()\nz\n';
    expectPair(
      "c3/c4",
      {
        shadowed: ENUM + SHADOW + "schema Red = integer\n" + body,
        control: ENUM + "schema Red = integer\n" + body,
      },
      CLEAN,
      "the enum receiver supplies no operand type, so the mixed-operand judgement has nothing to compare",
    );
  });

  it("RED c5/c6: `Color.Red[0]` draws no `non-indexable-receiver`", () => {
    const body = "fn f() { Color.Red[0] }\nlet z = f()\nz\n";
    expectPair(
      "c5/c6",
      {
        shadowed: ENUM + SHADOW + "schema Red = string\n" + body,
        control: ENUM + "schema Red = string\n" + body,
      },
      CLEAN,
      "an unresolvable receiver defers the index gate; the shadow must not make an unrelated `schema Red = string` the indexed receiver's type",
    );
  });

  it("RED c7/c8: an OBJECT schema spelled like the variant draws no `unknown-method`", () => {
    const body = "fn f() { Color.Red.frobnicate() }\nlet z = f()\nz\n";
    expectPair(
      "c7/c8",
      {
        shadowed: ENUM + SHADOW + "schema Red { a: string }\n" + body,
        control: ENUM + "schema Red { a: string }\n" + body,
      },
      CLEAN,
      "the object-schema collision reaches the fabrication through `classifyReceiver`'s `\"object\"` answer, a second route to the same wrong type",
    );
  });
});

// ===========================================================================
// (d) The REMOVAL direction — the refusal bug 0136 installed disappears.
// control-flow.md:13 makes `theta/parse/non-array-iterand` the disposition for
// iterating a non-array, and `checkForIterand` (src/parser/control-flow.ts:64)
// is the one consumer that refuses rather than defers — so under a shadow the
// fabricated `array<string>` ADMITS the iterand and the owed emission vanishes.
// Loop bodies are `{ 1 }` where the body is not the subject, so no row here
// depends on whether the loop variable is bound (bug 0126's subject).
// ===========================================================================

const RED_ARRAY_STR = "schema Red = array<string>\n";

describe("bug 0191 (d) — both loop forms keep the refusal a non-array iterand is owed", () => {
  it("RED d1/d2: `for y in Color.Red { 1 }` keeps `non-array-iterand`", () => {
    // The S1-shaped row: at HEAD the shadowed program loads, registers, and
    // `executeFor` treats the non-array iterand as an empty snapshot, so the
    // body never runs and nothing reports (runtime row r1 below).
    const body = "for y in Color.Red { 1 }\n";
    expectPair(
      "d1/d2",
      {
        shadowed: ENUM + SHADOW + RED_ARRAY_STR + body,
        control: ENUM + RED_ARRAY_STR + body,
      },
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "an enum variant is not an `array<T>`, and constraint B requires the `<type>` the message renders to stay something placeholder-rendering-a.md:19 admits — the ENUM's theta-side identifier",
    );
  });

  it("CONTROL d3: neither collision — the same refusal, same bytes", () => {
    expectRow(
      "d3",
      ENUM + "for y in Color.Red { 1 }\n",
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "the disposition bug 0136's fix installed, with no colliding declaration anywhere in the file",
    );
  });

  it("RED d4/d5: `par for y in Color.Red { 1 }` keeps `non-array-iterand`", () => {
    // control-flow.md:70 — "`par for` reuses the `for` iterand contract
    // unchanged". At HEAD the shadowed form evaluates to `[]` (runtime row r3)
    // against a legal-iterand control that yields two `Ok` cells (r5).
    const body = "let zs = par for y in Color.Red { 1 }\nzs\n";
    expectPair(
      "d4/d5",
      {
        shadowed: ENUM + SHADOW + RED_ARRAY_STR + body,
        control: ENUM + RED_ARRAY_STR + body,
      },
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "the `par for` iterand contract is the `for` contract, so the shadow must not admit there either",
    );
  });

  it("RED d6: the fabricated ELEMENT type stops propagating into the body", () => {
    // At HEAD the type layer binds the `par for` loop variable from the
    // fabricated iterand's element, so the body is typed against `string` from
    // `schema Red = array<string>` — a type the iterand does not have — and the
    // file's only diagnostic is about the BODY. Under route 1 the iterand is
    // refused and the loop variable has no resolvable element, so body checks
    // defer (control-flow.md:13's *Unresolvable operands* clause) and the row
    // collapses onto its control's single refusal.
    const body = "let zs = par for y in Color.Red { y.frobnicate() }\nzs\n";
    expectPair(
      "d6",
      {
        shadowed: ENUM + SHADOW + RED_ARRAY_STR + body,
        control: ENUM + RED_ARRAY_STR + body,
      },
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "the iterand refusal is what the file is owed; a diagnostic about the body instead means the wrong element type reached the body's scope",
    );
  });
});

// ===========================================================================
// (e) Every shadow spelling reaches the fallback. All rows carry
// `enum Color { Red }` + `schema Red = array<integer>` + the (a) body, varying
// only the shadowing declaration. e4 and f1 are the two rows whose shadowing
// declaration draws a diagnostic of its OWN for its own reason; the route
// removes the fabrication beside it and leaves that one standing, so those two
// rows state the control's list PLUS the declaration's own row rather than
// asserting byte-equality with the control.
// ===========================================================================

const E_TAIL = RED_ARRAY_INT + A_BODY;
/** The control for every (e) row: the same body with no shadowing declaration. */
const E_CONTROL = ENUM + E_TAIL;

describe("bug 0191 (e) — every spelling of the shadowing declaration", () => {
  it("RED e1: an ALIAS to a primitive — and the second code it adds", () => {
    // e1 is the row that draws TWO codes at HEAD: beside the fabrication,
    // `checkMemberAccess` classifies the receiver through `classifyReceiver`,
    // which unfolds `schema Color = string` to `string`, and `Red` is no string
    // member — so the VARIANT NAME is refused as a stdlib member, rendered
    // `on type Color`. Route 1 recognises the enum ahead of the schema lookup,
    // so neither code is reachable.
    expectPair(
      "e1",
      { shadowed: ENUM + "schema Color = string\n" + E_TAIL, control: E_CONTROL },
      CLEAN,
      "the enum wins over an alias of the same spelling, so the variant is never read as a `string` stdlib member",
    );
  });

  it("RED e2: an ALIAS to an object schema", () => {
    expectPair(
      "e2",
      {
        shadowed: ENUM + "schema Q { a: string }\nschema Color = Q\n" + E_TAIL,
        control: ENUM + "schema Q { a: string }\n" + E_TAIL,
      },
      CLEAN,
      "the control keeps `schema Q` so the pair differs by exactly the shadowing declaration",
    );
  });

  it("RED e3: a UNION", () => {
    expectPair(
      "e3",
      { shadowed: ENUM + "schema Color = string | integer\n" + E_TAIL, control: E_CONTROL },
      CLEAN,
      "the union unfolds to no `named` at all and still reaches the fallback at HEAD",
    );
  });

  it("RED e4: a HEAD-ONLY schema keeps its own `empty-schema-body` and nothing else", () => {
    // The shadowing declaration is ill-formed on its own terms
    // (code-registry-parse.md:98) and that refusal is NOT this bug's — it
    // survives the fix. What must go is the fabrication beside it, so this row
    // is stated as the control's list plus that one declaration-owned row.
    expectRow(
      "e4 control",
      E_CONTROL,
      CLEAN,
      "the un-shadowed disposition, restated here because e4 does not assert byte-equality with it",
    );
    expectRow(
      "e4",
      ENUM + "schema Color\n" + E_TAIL,
      one(EMPTY_SCHEMA_BODY, msg(EMPTY_SCHEMA_BODY, [["<X>", "Color"]])),
      "an ill-formed shadowing declaration keeps its own refusal; the member read beside it must draw nothing, exactly as the control does",
    );
  });

  it("BOUND e5: the COMPATIBLE collision — silent at HEAD, and silent for the right reason after", () => {
    // The one shadowed row that is already silent: the colliding declaration
    // happens to satisfy the position, so the wrong type produces no
    // diagnostic and the theta registers with a member read typed
    // `array<string>` that evaluates to `"Red"`. Green in both directions — its
    // value is as the row that proves the fix does not ADD a refusal where the
    // accident currently hides one.
    expectPair(
      "e5",
      { shadowed: ENUM + SHADOW + RED_ARRAY_STR + A_BODY, control: ENUM + RED_ARRAY_STR + A_BODY },
      CLEAN,
      "silence here is the correct disposition before and after; the defect it hides is the static TYPE, which the (a)–(d) rows observe",
    );
  });
});

// ===========================================================================
// (f) Bounds. f1 is the only route by which the shadowing schema could own a
// field spelled like the variant, and it costs an `E`-severity case diagnostic
// (lexical.md:15) — so for every conformant program the fallback is
// unconditional. f2 and f3 are the two positions that are already CORRECT and
// must stay so. f4 is the recorded residual.
// ===========================================================================

describe("bug 0191 (f) — the bounds", () => {
  it("RED f1: an ill-cased own field keeps its case refusal and loses the fabrication", () => {
    // At HEAD the ill-cased field IS read, so the arm answers `string` and the
    // file draws a second code (`unknown method 'join' on type string`). Route 1
    // recognises the enum ahead of the field lookup, so the field is never
    // consulted and only the declaration's own refusal remains — the same
    // shape as e4.
    expectRow(
      "f1 control",
      E_CONTROL,
      CLEAN,
      "the un-shadowed disposition, restated here because f1 does not assert byte-equality with it",
    );
    expectRow(
      "f1",
      ENUM + "schema Color { Red: string }\n" + E_TAIL,
      one(BINDING_CASE, msg(BINDING_CASE)),
      "the ill-cased field keeps `binding-case-mismatch` (code-registry-parse.md:19); the member read beside it draws nothing, because the enum is recognised before any field lookup",
    );
  });

  it("CONTROL f2: variant resolution itself is unaffected", () => {
    // The structural checker recognises a variant access by testing the
    // receiver ident against the file's enum-name map and refuses an unknown
    // variant naming the ENUM — already correct under the shadow, and the
    // evidence that the missing input at the type arm is threading, not
    // derivation. An over-broad fix that made the type arm swallow the
    // receiver would red here first.
    expectRow(
      "f2",
      ENUM + SHADOW + "let s = Color.Blue\ns\n",
      one(UNKNOWN_VARIANT, unknownVariant("Blue", "Color")),
      "schemas.md:97's unknown-variant sentence, unchanged by the shadow and unchanged by the fix",
    );
  });

  it("CONTROL f3: the ANNOTATION position keeps deferring", () => {
    // `let c: Color = Color.Red` — `Color` resolves to the schema in a `Type`
    // position and the check defers. Whether `enum` declarations belong in the
    // `TypeEnv` is bug 0038 residual (iii)'s question and a §Non-goal here, so
    // this row must stay silent: a fix that starts refusing it has widened
    // past route 1.
    expectRow(
      "f3",
      ENUM + SHADOW + "let c: Color = Color.Red\nc\n",
      CLEAN,
      "bug 0038 residual (iii) territory — a §Non-goal, so the annotation position moves in neither direction",
    );
  });

  it("RESIDUAL f4: the same fabrication with NO enum stays exactly as measured", () => {
    // Route 1 threads an ENUM-name source, so it closes the enum half only:
    // a genuinely absent field whose spelling matches a declaration keeps
    // fabricating. This row is a PIN on the residual, not a claim that it is
    // correct — §Fix route 5 is the route that would close it too. Both codes
    // are measured at this HEAD; the filing predates bug 0140's
    // `type-as-value` row, which fires here on the bare receiver name.
    expectRow(
      "f4",
      SHADOW + E_TAIL,
      {
        codes: [TYPE_AS_VALUE, NON_STRING_JOIN],
        msgs: [typeAsValue("Color"), nonStringJoin("integer")],
      },
      "the non-enum collision is outside route 1's reach and must be UNCHANGED by the fix — a red here means the fix widened past its subject",
    );
  });
});

// ===========================================================================
// (g) Constraint A's evidence, and its controls. Measured on a directly-typed
// object-schema value — no enum, no shadow — because this is what the arm would
// return under a shadow if it answered with the receiver's own LOOKUPABLE
// `named`. g1–g4 are refusals naming the schema; g5/g6 are object operations
// ADMITTED. An enum value is neither: expressions.md:9 and
// code-registry-runtime.md:23 reject a member, index or stdlib call on it at
// runtime. So the route's answer must resolve to NO declaration
// (`enumVariantType`'s provenance-marked mint, src/parser/type-compat.ts), and
// this whole group
// is green in both directions — it is the tripwire that reds if the fix answers
// with the shadowing schema's nominal instead.
// ===========================================================================

describe("bug 0191 (g) — a lookupable object-schema nominal is not inert (constraint A)", () => {
  it("CONTROL g1: `c.frobnicate()` refuses, naming the schema", () => {
    expectRow(
      "g1",
      SHADOW + "fn f(c: Color) { c.frobnicate() }\n1\n",
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "Color")),
      "a resolvable object-schema receiver draws its own method refusal — so answering `named \"Color\"` under a shadow would trade one wrong refusal for another",
    );
  });

  it("CONTROL g2: a typed `let` from an object-schema value refuses", () => {
    expectRow(
      "g2",
      SHADOW + "fn f(c: Color): integer { let m: integer = c  m }\n1\n",
      one(LET_RHS, letRhs("m", "integer", "Color")),
      "`decide` reaches a verdict on a RESOLVABLE nominal, where the enum answer must defer",
    );
  });

  it("CONTROL g3: iterating an object-schema value refuses", () => {
    expectRow(
      "g3",
      SHADOW + "fn f(c: Color) { for y in c { 1 } }\n1\n",
      one(NON_ARRAY_ITERAND, iterand("Color")),
      "the one position where the refusal is WANTED and identical either way — which is why (d) can assert it against the enum answer too",
    );
  });

  it("CONTROL g4: `c + \"x\"` refuses", () => {
    expectRow(
      "g4",
      SHADOW + 'fn f(c: Color): string { c + "x" }\n1\n',
      one(MIXED_PLUS, mixedPlus("Color", "string")),
      "a resolvable nominal supplies an operand type; the enum answer must not",
    );
  });

  it("CONTROL g5: `c.keys()` is ADMITTED — the first of constraint A's two silent accepts", () => {
    expectRow(
      "g5",
      SHADOW + "fn f(c: Color) { c.keys() }\n1\n",
      CLEAN,
      "an object operation an ENUM value cannot support (code-registry-runtime.md:23) is admitted for a resolvable object schema — so the enum answer must not resolve to one",
    );
  });

  it("CONTROL g6: `c[\"a\"]` is ADMITTED — the second silent accept", () => {
    expectRow(
      "g6",
      SHADOW + 'fn f(c: Color) { c["a"] }\n1\n',
      CLEAN,
      "the object-index position, admitted for the same reason and for the same wrong receiver kind",
    );
  });
});

// ===========================================================================
// (p) The GATE'S OWN SHAPE. Every row above varies the DECLARATIONS; these rows
// vary the RECEIVER while holding the shadowing `schema Color` fixed, which is
// the axis a type-keyed gate collapses. The `ident` arm of `#typeExpr`
// (src/parser/static-type-inference.ts) answers `named "Color"` for a `c: Color`
// parameter exactly as it does for the bare enum name, so a gate reading the
// receiver's inferred TYPE cannot tell the two apart and reclassifies both as
// enum-variant accesses. Measured consequences, each pinned below: p1 loses a
// `let-rhs-type-mismatch` owed on a declared field read off a resolvable object
// schema — bug 0136's field route, this report's §Non-goal — and p4 gains an
// `E`-severity `non-array-iterand` denial of a spec-legal program, which
// constraint E / GOV-15 refuses on one collision.
//
// The gate is therefore the runtime's predicate in symbol form: an `ident`
// target, that ident binding no local, and the name declared as an `enum`.
// p1/p4 exercise the local half through a `fn` parameter (`walkFn`'s parameter
// loop, src/parser/type-layer-checks.ts, records it in `bindings`, the same
// names `env.resolve(…).arm === "local"` answers for at runtime); a `let`
// binding spelled like the enum is unreachable by casing (binding names are
// lowercase-first, lexical.md:15), so the parameter is the reachable form. p7
// exercises the ident half through a non-ident receiver.
//
// Each row's control drops the `enum` and keeps everything else, so the pair
// differs by exactly the declaration whose presence must not reach a read off a
// value.
// ===========================================================================

/**
 * A pair differing by exactly one added `enum Color { Red }`. Where
 * `expectPair` above adds the SHADOW to an enum-bearing file, this adds the
 * ENUM to a shadow-bearing file: the claim is that declaring the enum leaves
 * every member read off a VALUE typed by `schema Color` untouched.
 */
function expectEnumInertPair(
  label: string,
  bodies: { readonly withEnum: string; readonly control: string },
  expected: Contract,
  why: string,
): void {
  const control = expectRow(
    `${label} control (no \`enum Color\`)`,
    bodies.control,
    expected,
    `the disposition a read off a value typed by \`schema Color\` is owed — ${why}`,
  );
  const withEnum = expectRow(
    `${label} with the enum declared`,
    bodies.withEnum,
    expected,
    `declaring \`enum Color { Red }\` beside the schema must not reclassify a read off a VALUE: the receiver is a local binding, which the runtime resolves as a value before any variant lookup — ${why}`,
  );
  expect(
    withEnum.diagnostics.map((d) => `${d.code}: ${d.message}`),
    `${label} — the enum-bearing row's diagnostics must be BYTE-IDENTICAL to its enum-less control's. A gate keying on the receiver's inferred TYPE reds here: it reclassifies the read and either drops the owed emission or adds an unowed refusal\n  with enum: ${render(withEnum)}\n  control:  ${render(control)}`,
  ).toEqual(control.diagnostics.map((d) => `${d.code}: ${d.message}`));
}

/** The array-field spelling of the shadow, for the iterand row. */
const SHADOW_ARRAY_FIELD = "schema Color { a: array<string> }\n";

describe("bug 0191 (p) — the gate keys on the variant-access shape, not on the receiver's type", () => {
  it("p1: a declared-field read off a `Color`-typed parameter keeps its `let-rhs-type-mismatch`", () => {
    // The LOST-EMISSION direction. `c.a` is a declared field read on a
    // resolvable object schema, typed `string` by bug 0136's field route, so the
    // `integer` annotation is a real mismatch. A type-keyed gate answers
    // `enumVariantType("Color")` here instead, `decide` defers on an
    // unresolvable nominal, and the emission disappears.
    const body = "fn f(c: Color): integer { let m: integer = c.a  m }\n1\n";
    expectEnumInertPair(
      "p1",
      { withEnum: ENUM + SHADOW + body, control: SHADOW + body },
      one(LET_RHS, letRhs("m", "integer", "string")),
      "bug 0136's field route is a §Non-goal here: what a member read of a declared field on a resolvable object schema types as must not move",
    );
  });

  it("p4: an `array<string>`-field iterand off a `Color`-typed parameter stays admitted", () => {
    // The ADDED-REFUSAL direction, and the worse of the two: `non-array-iterand`
    // is `E`-severity, so a wrong emission here denies registration to the whole
    // file (`hasLoadParseError`) for a program the spec admits — constraint E /
    // GOV-15, reached on ONE collision rather than the two the filed defect
    // needs.
    const body = "fn f(c: Color) { for y in c.a { 1 } }\n1\n";
    expectEnumInertPair(
      "p4",
      { withEnum: ENUM + SHADOW_ARRAY_FIELD + body, control: SHADOW_ARRAY_FIELD + body },
      CLEAN,
      "the iterand is the schema's own declared `array<string>` field; a refusal naming `Color` here is a denial of a spec-legal program",
    );
  });

  it("p7: a non-ident receiver typed `Color` is read as a value, not as a variant access", () => {
    // The ident half of the gate. A named-schema constructor's type is
    // `named "Color"` (`#typeExpr`'s `case "object"`), identical to the bare
    // enum name's, and its field read must stay bug 0136's field route: the
    // target is no `ident`, so the runtime never reaches
    // `env.resolveEnumVariant` for it either.
    const body = 'fn f(): integer { let m: integer = Color { a: "x" }.a  m }\n1\n';
    expectEnumInertPair(
      "p7",
      { withEnum: ENUM + SHADOW + body, control: SHADOW + body },
      one(LET_RHS, letRhs("m", "integer", "string")),
      "`node.target.kind === \"ident\"` is the runtime's own first test, so a constructor receiver is outside the gate whatever its type spells",
    );
  });
});

// ===========================================================================
// (r) The runtime the erased refusal admits. These rows prove the fix REMOVES a
// runtime outcome rather than merely adding a diagnostic: post-fix each shadowed
// loop carries an `E`-severity `theta/parse/*`, the load path drops the theta
// (`hasLoadParseError`), and the body is never evaluated. Today both loop forms
// coerce the non-array iterand to `[]` (`executeFor` and `evalParFor` in
// src/runtime/statement-executor.ts), so the body is skipped with no diagnostic
// and no panic.
//
// The group also carries the OPPOSITE runtime direction, which the route newly
// admits rather than removes: a1's shadowed body parses CLEAN post-fix, so it
// now RUNS, and what it runs into is the runtime's own receiver-kind gate
// (`theta/runtime/non-object-receiver`, expressions.md:9's "an enum or `Result`
// receiver is rejected with `theta/runtime/non-object-receiver`";
// code-registry-runtime.md's row). That disposition is the whole point of the
// route — the wrong static refusal is replaced by the right runtime rejection —
// so it is witnessed here (r7) beside its un-shadowed control rather than left
// inferred from the parse rows.
//
// Harness: the production-executor shape
// tests/member-access-declared-field-type.test.ts establishes (its runtime
// group). Offline, provider-free, no child process, no network.
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
  file: "b0191.theta",
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
 * capturing a throw. No branch skips: every disposition is asserted below.
 */
async function run(body: string): Promise<Run> {
  const doc = parse(body);
  if (errors(doc.diagnostics).length > 0) {
    return { kind: "refused", doc };
  }
  const theta: ThetaCompositionInput = {
    slashName: "b0191",
    sourcePath: "/theta/b0191.theta",
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
 * value that actually arrived rather than only reporting "no diagnostic".
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
  if (isThetaPanic(r.thrown)) {
    const panic = r.thrown as { readonly code: string; readonly message: string };
    return `LOADED AND PANICKED — ${panic.code}: ${panic.message}`;
  }
  const diag = surfaceUnexpectedThrow(r.thrown, SITE);
  return `LOADED AND THREW — ${String(diag?.code)}: ${String(diag?.message)}`;
}

describe("bug 0191 (r) — the runtime outcome the erased refusal admits", () => {
  it("RED r1/r2: the shadowed plain `for` is refused at PARSE, so it cannot iterate zero times", async () => {
    const body = RED_ARRAY_STR + "for y in Color.Red { 1 }\n";
    const refused = `REFUSED AT PARSE — ${NON_ARRAY_ITERAND}`;
    expect(
      disposition(await run(ENUM + body)),
      "r2 CONTROL — the un-shadowed program is refused at parse; a red here means the control moved, not the subject",
    ).toBe(refused);
    expect(
      disposition(await run(ENUM + SHADOW + body)),
      "r1 — bug 0191 §Why it matters: the parse gate is the ONLY objection to a non-array iterand (`executeFor` coerces it to an empty snapshot), so with the gate silent the theta registers and the loop body silently never executes. The fix restores the refusal, which removes the runtime outcome entirely",
    ).toBe(refused);
  });

  it("RED r3/r4: the shadowed `par for` is refused at PARSE, so it cannot evaluate to `[]`", async () => {
    const body = RED_ARRAY_STR + "let zs = par for y in Color.Red { 1 }\nzs\n";
    const refused = `REFUSED AT PARSE — ${NON_ARRAY_ITERAND}`;
    expect(
      disposition(await run(ENUM + body)),
      "r4 CONTROL — the un-shadowed `par for` is refused at parse",
    ).toBe(refused);
    expect(
      disposition(await run(ENUM + SHADOW + body)),
      "r3 — `evalParFor` falls back to `[]` for a non-array iterand, so the shadowed form yields zero cells against r5's two. Refusing at parse is the disposition control-flow.md:13 assigns",
    ).toBe(refused);
  });

  it("CONTROL r5: a LEGAL iterand still loads and still runs the body per element", async () => {
    // The row an over-broad fix breaks first, and the proof that r3's `[]` is a
    // zero-iteration observable rather than a harness that never executes.
    expect(
      disposition(await run('let ys: array<string> = ["a", "b"]\nlet zs = par for y in ys { 1 }\nzs\n')),
      "CONTROL BROKEN — r5 proves the harness executes and that the iterand gate admits a real `array<string>`",
    ).toBe('LOADED AND RAN — outcome=success, value=[{"ok":true,"value":1},{"ok":true,"value":1}]');
  });

  it("r7: the shadowed a1 body now LOADS and reaches the runtime's own enum-receiver rejection", async () => {
    // The direction the route ADDS. At HEAD the shadowed row is refused at
    // parse by `non-string-array-join` naming `array<integer>`, a declaration
    // the expression has nothing to do with; post-fix it loads and
    // `.join(",")` on the enum value reaches the receiver-kind gate the spec
    // assigns it. The control is the filed r7 — the un-shadowed program, which
    // already reaches that gate — so the pair states that the shadow changes
    // the runtime disposition not at all.
    // `LOADED AND THREW`, not `LOADED AND PANICKED`: code-registry-runtime.md's
    // own prose puts this code on the runtime-DEFECT surface and states it "is
    // not a panic source either", so `isThetaPanic` declines it and
    // `disposition` frames it through `surfaceUnexpectedThrow`. The code and the
    // registry-read message are the assertion's substance either way, and both
    // are compared here.
    const rejected = `LOADED AND THREW — ${NON_OBJECT_RECEIVER}: ${nonObjectReceiver(
      ".join()",
      "an enum value",
    )}`;
    expect(
      disposition(await run(ENUM + RED_ARRAY_INT + A_BODY)),
      "r7 CONTROL — the un-shadowed program's runtime disposition, which the fix must not move",
    ).toBe(rejected);
    expect(
      disposition(await run(ENUM + SHADOW + RED_ARRAY_INT + A_BODY)),
      "r7 — the shadowed a1 body: group (a) pins its parse silence, and this row pins what that silence admits. A `REFUSED AT PARSE` here means the static fabrication survives; a `LOADED AND RAN` means the receiver-kind gate is not reached and a stdlib call on an enum value silently produced a value",
    ).toBe(rejected);
  });

  it("CONTROL r8: the runtime resolves the variant through the ENUM despite the shadow", async () => {
    // The semantics the fix mirrors rather than changes: `evalExpr`'s member arm
    // calls `env.resolveEnumVariant` (`evalExpr`, src/runtime/statement-executor.ts)
    // BEFORE evaluating the target as a value, so the enum wins over the
    // same-named schema. Only the static type is wrong — which is exactly why
    // route 1 puts the enum test ahead of the `TypeEnv` lookup in the type arm
    // too. Green in both directions.
    expect(
      disposition(await run(ENUM + SHADOW + "schema Red = string\nlet s = Color.Red\ns\n")),
      "CONTROL BROKEN — r8 is the evidence that the value semantics are unambiguous under the shadow; a fix must not move them",
    ).toBe('LOADED AND RAN — outcome=success, value="Red"');
  });
});
