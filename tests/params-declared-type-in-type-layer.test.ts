import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaDocument } from "../src/parser/theta-document";
import { errors, parseDoc } from "./helpers/e2e-s1";

// Bug 0192 — `checkTypeLayer` (src/parser/type-layer-checks.ts) threads the
// frontmatter `params:` fields into `collectLocalBinderNames` as NAMES only (a
// `Set<string>`, bug 0050's shadowing channel) and starts the top-level walk
// with `new Map()`, so no `params:` field carries a declared `CompatType` into
// `bindings`. Twelve registered `E`-severity type-layer rows are therefore
// unreachable on every read of a `params:`-declared binding, where the
// `fn`-parameter form of the same body reports all twelve, and a thirteenth —
// `theta/parse/non-array-iterand` — fires FALSELY at `E` on `for y in xs` over
// `params: xs: array<string>`, denying registration to a program
// control-flow.md:13 admits
// (docs/bugs/0192-params-receiver-type-not-threaded-into-type-layer.md).
//
// ADDITIVE. This file is new. It modifies no existing test. One committed
// witness row DOES encode the defect as a bound — row x20 of
// tests/member-access-declared-field-type.test.ts, which is §Reproduction (a2)
// and asserts `[]` in both directions — and §Fix (f) of the bug document
// authorises exactly that one re-pin, made from that file's side. Nothing else
// in the corpus pins this position.
//
// ── THE ADJUDICATED ROUTE THIS FILE ENCODES ─────────────────────────────────
// §Fix (a) + (b) + (c) with `annotationToCompatType` as the converter:
//
//   1. `checkTypeLayer`'s third parameter widens from a name list to a record
//      array carrying each `params:` field's body-visible NAME beside its
//      declared TYPE SOURCE. The record already exists at the call site —
//      `BypassParamsField` carries `wireName` beside `type`, "the field's
//      declared surface type" (src/binder/binder-envelope.ts) — and the
//      production wiring in `parseThetaDocument` projects `wireName` alone
//      today, which is the whole threading gap.
//   2. The NAME half keeps feeding `collectLocalBinderNames` unchanged: that
//      channel is a `Set<string>` whose only power is suppression, and twelve
//      of the thirteen rows here need a PRODUCED verdict, so bug 0050's
//      shadowing behaviour is neither repurposed nor disturbed (§Fix (a)).
//   3. The TYPE half seeds the root `bindings` map the top-level walk starts
//      from, through `annotationToCompatType` with `walkFn`'s own
//      `?? { kind: "named", name: <source> }` fallback — so the `params:`
//      position and the `fn`-parameter position decide identically BY
//      CONSTRUCTION (§Fix (c)). That construction is what makes every
//      §Reproduction (a) control the ORACLE for its row rather than a
//      hand-picked comparison, and it is what this file asserts cell by cell.
//   4. The recorded type does NOT enter `unprovableBindings` (§Fix (c)'s
//      closing constraint): an author-written annotation IS a declared type,
//      so it is a proof, and a params type laundered through that set would
//      leave row a5 (and row m1) silent while the other eleven rows moved.
//      Cells a5 and m1 are that constraint's witnesses.
//
// ── ROW INVENTORY (bug 0192 §Reproduction row ids, one `it` cell each) ──────
// The rows this fix ADDS — `[]` on the `params:` spelling today, the control's
// own measured diagnostics after (group (a), 16 cells over 12 distinct
// registered codes):
//   a1  `if s` — non-boolean-condition on a primitive.
//   a2  `if p.s` — the same code through a member read of an object-schema
//       param. This row IS row x20 of the protected member-access witness.
//   a3  `while s` — the second condition position.
//   a4  `let s: string = n` — let-rhs-type-mismatch.
//   a5  `g(s)` — fn-arg-type-mismatch, the one row that also needs the
//       `unprovableBindings` constraint of §Fix (c) held.
//   a6  `s.frobnicate()` — unknown-method.
//   a7  `let n: integer = x` — integer-narrowing.
//   a8  `s?` — question-on-non-result.
//   a9  `s < 1` — non-orderable-operands.
//   a10 `xs.join(", ")` — non-string-array-join, an `array<T>` declaration.
//   a11 `p[0]` — non-string-object-index.
//   a12 `s[0]` — non-indexable-receiver.
//   a13 `S { n: s }` — object-field-type-mismatch.
//   a14 `let xs: array<integer> = [s]` — TWO codes, ordered.
//   a15 `if s` over a top-level UNION declaration.
//   a16 `let n: integer = xs` — an `array<T>` against a primitive sink.
//   m1  the bug 0190 composition: a params-rooted member read at the
//       fn-argument sink. Bug 0190 opened that sink for a member read whose
//       receiver is a proven read; a `params:` receiver is not one today
//       because it has no recorded type at all.
// The rows this fix REMOVES — a false `E` that denies registration stops
// firing (group (b), 4 cells; group (L), 4 cells):
//   b1  `for y in xs` over a declared `array<string>` — the direct form.
//   b2  `for y in p.xs` — through a declared field of an object-schema param.
//   b3  `for y in xs` over a type ALIAS of `array<string>`.
//   b4  `par for y in xs` — the second call site of the same row.
//   L1–L4 the loop-ELEMENT consumers: pre-fix each carries the same false
//       `non-array-iterand` INSTEAD of the element-typed verdict its control
//       reports, so each is a removal and an addition in one cell.
// The rows that move at every nesting DEPTH (group (c), 2 cells): c1, c2.
// The rows that are GREEN IN BOTH DIRECTIONS — the fences §Fix (h) names:
//   d1  a legal `boolean` condition stays `[]`.
//   d2  a legal typed `let` off a declared field stays `[]`.
//   d3  an INLINE OBJECT type: both converters answer a nominal `named` for it
//       at every annotation position alike, so the `fn` control defers too.
//   d4  an `enum`-typed param: `collectTypeEnv` records no `enum`, so the `fn`
//       control also measures `[]` and there is no delta to claim.
//   e   `theta/parse/unknown-identifier` is unmoved: the lexical layer's own
//       `rootLocals` reader binds the NAME today, and only the TYPE is missing.
//
// ── TIER: unit, offline, provider-free, deterministic ───────────────────────
// Every row settles inside one `parseThetaDocument` call: the site under test
// is the type layer's root scope map on the load path, and its whole observable
// is the document's aggregated `diagnostics` list. An INTEGRATION tier would
// add a session round-trip that observes neither the seeded `CompatType` nor
// the diagnostic list. A LIVE tier would put a stochastic model between the
// fixture and a fully determined parse-time observable. Nothing in the
// adjudicated route touches a live-exercised surface (the subagent child
// launch, the production drivers, the binder). The one thing this tier cannot
// see is the REGISTRATION consequence of group (b) — an `E`-severity
// `theta/parse/*` denies registration through `hasLoadParseError`
// (src/extension/production-composition.ts) — and that is why one H8a cell is
// added beside this file in tests/live/live-production-acceptance.test.ts
// rather than folded in here. Thirteen registry rows change reachability, which
// is an H9a `permitted-codes.json` assessment for the fix run's own live pass,
// not for this witness.
//
// ── HARNESS ─────────────────────────────────────────────────────────────────
// The shared house driver `parseDoc` (tests/helpers/e2e-s1.ts), the real
// `parseThetaDocument` behind inert offline seams — the entry point bug 0192's
// §Reproduction measured every row through, and the one the three comparable
// witnesses use (tests/member-access-declared-field-type.test.ts,
// tests/plain-for-loop-variable-element-type.test.ts,
// tests/fn-arg-member-read-proof.test.ts). Unlike those three, no fixture here
// can share one frontmatter constant: the `params:` block IS the subject, so
// every fixture carries its own fence. Each `params:` fixture is §Reproduction's
// source verbatim; each control is §Reproduction's control verbatim with
// `---\nmode: prompt\n---` prepended, and measured, that fence changes no
// control's diagnostic list.
//
// ── THE PAIRING, AND WHY IT IS ASSERTED THREE WAYS ──────────────────────────
// §Expected behaviour names the `fn`-parameter form as the oracle: "the twelve
// rows in §Reproduction (a) fire exactly as they do on the byte-identical
// `fn`-parameter form". Each pair cell therefore asserts, in this order:
//
//   1. the DECLARED-TYPE-SITE precondition on both fixtures, loud;
//   2. the VEHICLE identity — the two spellings declare the same binding name
//      with the same declared type, so the only difference between them is the
//      annotation POSITION;
//   3. the CONTROL's whole ordered code list and message list against a
//      registry-sourced expectation (DIAG-4);
//   4. the `params:` row's whole ordered code list and message list against
//      THE SAME expectation;
//   5. the byte-identity of the two rendered lists.
//
// Steps 3 and 4 share one expectation object rather than comparing the params
// row against the control's runtime value alone, and the expectation is read
// out of the registry rather than hand-copied. Both choices are deliberate.
// Sourcing from the registry is DIAG-4's requirement
// (docs/spec_topics/diagnostics/diagnostic-shape.md), and it is what makes a
// fix that restores a code while rendering a BINDING NAME into a `<type>`
// placeholder red — the exact defect §Reproduction (b) measures on the removal
// side (`got xs`), and the rendering contract
// docs/spec_topics/diagnostics/placeholder-rendering-a.md:11–13 states. Step 5
// then adds what a shared literal cannot: it fails if the two positions agree
// with the registry and disagree with each other. A pair asserted only against
// the control's runtime value would pass vacuously the day both spellings go
// silent together.
//
// ── THE DIAGNOSTIC ORACLE: DIAG-4 ───────────────────────────────────────────
// docs/spec_topics/diagnostics/diagnostic-shape.md makes the registry's
// *Message* column normative and requires an asserting test to source its
// expected strings from it. Every message below is read through `parseRegistry`
// + `registryMessage` (tools/code-registry/index.js) and interpolated in ONE
// pass, with an unsupplied or unused placeholder throwing — the mechanism
// tests/fn-arg-member-read-proof.test.ts and
// tests/plain-for-loop-variable-element-type.test.ts established. Registry rows
// are cited by CODE, never by line.
//
// ── NO SILENT SKIPPING (CLAUDE.md, AGENTS.md) ───────────────────────────────
// Nothing here early-returns, branches on the environment, or skips. A missing
// registry row throws NAMING the row. A fixture whose frontmatter stopped
// parsing, whose `params:` block stopped being recorded, or whose declared type
// source drifted fails its own `PRECONDITION` naming the declared-type sites it
// found — so a `toEqual([])` fence can never pass while measuring nothing, and
// a red in group (a) can never be a frontmatter accident. Every row asserts its
// WHOLE ordered code list AND its whole ordered message list, unfiltered, so an
// absent emission, an extra emission and a reordering all red.
//
// ── BOTH DIRECTIONS ─────────────────────────────────────────────────────────
// Groups (a), (c), (m) and (L) are RED at this HEAD and go green when the
// declared type reaches the root `bindings` map. Group (b) is red on its
// `params:` half only (the false `E`) and goes green the same way. Groups (d)
// and (e) are green NOW and must stay green: they are the fences that separate
// this defect from the `params:` spellings that legitimately defer, and a route
// that moves either has widened something the report does not claim (§Fix (h)).
// Neutralising the fix — dropping the type half of the widened parameter and
// re-starting the walk from an empty map — must red exactly groups (a), (b),
// (c), (m), (L) and leave (d) and (e) untouched.
//
// ── CITATION POSTURE ────────────────────────────────────────────────────────
// `src/` is cited by SYMBOL (`checkTypeLayer`, `collectLocalBinderNames`,
// `walkFn`, `walkBlock`, `annotationToCompatType`, `paramsDeclaredCompatType`,
// `checkForIterand`, `containsWithheldBinderType`, `recordWithheldBinders`,
// `unprovableBindings`, `provableArgType`, `#typeExpr`'s `case "ident"` /
// `case "member"`, `collectTypeEnv`, `hasLoadParseError`, `BypassParamsField`):
// the bug document's implementation line spans were taken at 0.106.0 and the
// 0126 and 0190 fixes have since drifted them (`checkTypeLayer`'s own span, the
// `walkFn` seed line and the `parseThetaDocument` call site have all moved), so
// chasing lines here would only re-introduce the staleness. Registry rows are
// cited by CODE, sibling tests by CELL ID, and the spec by line, each
// re-derived against this tree.

// ===========================================================================
// The DIAG-4 oracle.
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live `theta/parse/*` registry page — this file's only message oracle. */
const REGISTRY_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PAGE}`, import.meta.url)), "utf8"),
) as RegistryRow[];

/**
 * A registered code's normative *Message* template. Throws naming the registry
 * page when the row is absent, so a registry drift can never degrade an
 * assertion below into a comparison against `undefined`.
 */
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: ${REGISTRY_PAGE} carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}

/**
 * Interpolate a registered template's `<…>` placeholders from `subs`, in one
 * pass so a substituted value is never re-scanned — `<actual>` legitimately
 * expands to text containing angle brackets (`array<string>`, rows a14/a16).
 *
 * The placeholder set is derived from the TEMPLATE: an unsupplied placeholder
 * and an unused substitution both throw, so a registry row that changes shape
 * fails loudly here instead of quietly producing a string no emission equals.
 */
function fill(code: string, subs: ReadonlyMap<string, string>): string {
  const template = registered(code);
  const used = new Set<string>();
  const message = template.replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    if (value === undefined) {
      throw new Error(
        `harness: the ${code} Message template carries placeholder ${token}, which this file supplies no substitution for — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
    used.add(token);
    return value;
  });
  for (const token of subs.keys()) {
    if (!used.has(token)) {
      throw new Error(
        `harness: this file substitutes ${token} into the ${code} Message, which no longer carries it — the registry row changed shape (${REGISTRY_PAGE})`,
      );
    }
  }
  return message;
}

const NON_BOOLEAN = "theta/parse/non-boolean-condition";
const LET_RHS = "theta/parse/let-rhs-type-mismatch";
const FN_ARG = "theta/parse/fn-arg-type-mismatch";
const UNKNOWN_METHOD = "theta/parse/unknown-method";
const INTEGER_NARROWING = "theta/parse/integer-narrowing";
const QUESTION_ON_NON_RESULT = "theta/parse/question-on-non-result";
const NON_ORDERABLE = "theta/parse/non-orderable-operands";
const NON_STRING_JOIN = "theta/parse/non-string-array-join";
const NON_STRING_OBJECT_INDEX = "theta/parse/non-string-object-index";
const NON_INDEXABLE = "theta/parse/non-indexable-receiver";
const OBJECT_FIELD = "theta/parse/object-field-type-mismatch";
const ARRAY_ELEMENT = "theta/parse/array-element-type-mismatch";
const UNKNOWN_IDENTIFIER = "theta/parse/unknown-identifier";

/** `condition must be boolean; got <type>` */
function condition(type: string): string {
  return fill(NON_BOOLEAN, new Map([["<type>", type]]));
}

/** `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` */
function letRhs(name: string, expected: string, actual: string): string {
  return fill(
    LET_RHS,
    new Map([
      ["<name>", name],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` */
function fnArg(
  name: string,
  index: number,
  param: string,
  expected: string,
  actual: string,
): string {
  return fill(
    FN_ARG,
    new Map([
      ["<name>", name],
      ["<i>", String(index)],
      ["<param>", param],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `unknown method '<method>' on type <type>` */
function unknownMethod(method: string, type: string): string {
  return fill(
    UNKNOWN_METHOD,
    new Map([
      ["<method>", method],
      ["<type>", type],
    ]),
  );
}

/** `cannot narrow number to integer` (no placeholders). */
function integerNarrowing(): string {
  return fill(INTEGER_NARROWING, new Map());
}

/** `'?' requires a Result operand; got <type>` */
function questionOperand(type: string): string {
  return fill(QUESTION_ON_NON_RESULT, new Map([["<type>", type]]));
}

/** `'<op>' requires two numeric or two string operands; got <left> and <right>` */
function nonOrderable(op: string, left: string, right: string): string {
  return fill(
    NON_ORDERABLE,
    new Map([
      ["<op>", op],
      ["<left>", left],
      ["<right>", right],
    ]),
  );
}

/** `array.join requires a string element type; got array<<element>>` */
function arrayJoin(element: string): string {
  return fill(NON_STRING_JOIN, new Map([["<element>", element]]));
}

/** `object index must be string; got <type>` */
function objectIndex(type: string): string {
  return fill(NON_STRING_OBJECT_INDEX, new Map([["<type>", type]]));
}

/** `indexed access requires an array<T> or object receiver; got <type>` */
function nonIndexable(type: string): string {
  return fill(NON_INDEXABLE, new Map([["<type>", type]]));
}

/** `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>` */
function objectField(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `array element type mismatch at index <i>: expected <expected>, got <actual>` */
function arrayElement(index: number, expected: string, actual: string): string {
  return fill(
    ARRAY_ELEMENT,
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}

/** `unknown identifier '<name>'` */
function unknownIdentifier(name: string): string {
  return fill(UNKNOWN_IDENTIFIER, new Map([["<name>", name]]));
}

/**
 * The message every plain-primitive condition row shares: a declared `string`
 * in a `boolean` position. Named once so a row's identity is its fixture and
 * not a retyped expectation.
 */
const CONDITION_GOT_STRING = (): string => condition("string");

// ===========================================================================
// Parse harness.
//
// Two fences, because the `params:` block is the subject. `PFM` opens a
// `params:` fixture and every row appends its own field lines; `CFM` is the
// control fence, identical but for the absent block.
// ===========================================================================

const FILE = "bug0192.theta";

/** The `params:` fence, `<FM>` in §Reproduction's own abbreviation. */
const PFM = "---\nmode: prompt\nparams:\n";

/** The control fence: the same `mode: prompt`, no `params:` block. */
const CFM = "---\nmode: prompt\n---\n";

/** Every diagnostic rendered `severity code: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
  );
}

/**
 * Every DECLARED-TYPE SITE of `doc` in document order: each frontmatter
 * `params:` field as `params <wireName>:<type>`, then each top-level `fn`
 * declaration's parameters as `fn <fn>(<param>:<type>)`.
 *
 * This is the loud precondition every row runs FIRST, and the two halves are
 * exactly the two annotation positions this bug is about. `params <…>` reads
 * `frontmatter.params.fields` — the `BypassParamsField` records the production
 * wiring iterates to build `checkTypeLayer`'s third argument, carrying `type`
 * beside `wireName`; `fn <…>` reads the `FnDecl.params` records `walkFn` seeds
 * its scope map from. The subject of this file is a scope write with no direct
 * observable, so most rows assert either one emission or an absence; without an
 * anchor, a fixture whose `params:` block stopped being recorded at all (a
 * `theta/load/params-type-not-expression` refusal, a YAML shape drift) would
 * let a fence pass while measuring nothing, and would make a group-(a) red
 * unattributable.
 */
function declaredTypeSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  for (const field of doc.frontmatter?.params?.fields ?? []) {
    out.push(`params ${field.wireName}:${field.type}`);
  }
  for (const stmt of doc.body.statements) {
    if (stmt.kind === "fn") {
      for (const param of stmt.params) {
        out.push(`fn ${stmt.name}(${param.name}:${param.type})`);
      }
    }
  }
  return out;
}

/**
 * The declared type source recorded for `binding` at the `params:` position.
 * Throws naming the sites it found rather than returning `undefined`: a row
 * whose subject binding is not declared measures nothing.
 */
function paramsDeclaredType(label: string, doc: ThetaDocument, binding: string): string {
  const field = (doc.frontmatter?.params?.fields ?? []).find(
    (f) => f.wireName === binding,
  );
  if (field === undefined) {
    throw new Error(
      `harness: ${label} declares no \`params:\` field named '${binding}' — the row's vehicle is absent, so its assertions would measure nothing. Sites: ${JSON.stringify(declaredTypeSites(doc))}. Diagnostics: ${render(doc)}`,
    );
  }
  return field.type;
}

/**
 * The declared type source recorded for `binding` at the `fn`-parameter
 * position. Throws the same way, so a control that lost its parameter cannot
 * silently become the oracle for nothing.
 */
function fnDeclaredType(label: string, doc: ThetaDocument, binding: string): string {
  for (const stmt of doc.body.statements) {
    if (stmt.kind !== "fn") {
      continue;
    }
    for (const param of stmt.params) {
      if (param.name === binding) {
        return param.type;
      }
    }
  }
  throw new Error(
    `harness: ${label} declares no \`fn\` parameter named '${binding}' — the control's vehicle is absent, so it is no oracle. Sites: ${JSON.stringify(declaredTypeSites(doc))}. Diagnostics: ${render(doc)}`,
  );
}

/**
 * A declared type source with every space removed.
 *
 * MEASURED asymmetry, and the reason this normalisation exists: the two
 * positions record the author's bytes differently. A `params:` field keeps the
 * YAML scalar verbatim (`string | integer`, `{s: string}`), while a `fn`
 * parameter list is recorded whitespace-stripped (`string|integer`,
 * `{s:string}`). Both feed one converter that trims — `annotationToCompatType`
 * trims its input and `splitTopLevelUnion` trims each arm — so the declared
 * TYPE is the same even where the source BYTES differ, which is what the
 * vehicle-identity assertion is about. Row d3 is the one row where the
 * difference survives into the converter's nominal fallback (`named
 * "{s: string}"` against `named "{s:string}"`); both are unresolvable, both
 * defer, and d3 pins that in both directions.
 */
function normaliseType(src: string): string {
  return src.replace(/\s+/g, "");
}

interface Expectation {
  readonly codes: readonly string[];
  readonly msgs: readonly string[];
}

/** The empty contract — no diagnostic at all. */
const CLEAN: Expectation = { codes: [], msgs: [] };

/** A one-diagnostic contract. */
function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}

/** A two-diagnostic contract, in emission order (row a14). */
function two(
  firstCode: string,
  firstMessage: string,
  secondCode: string,
  secondMessage: string,
): Expectation {
  return { codes: [firstCode, secondCode], msgs: [firstMessage, secondMessage] };
}

/**
 * One row of one spelling: the declared-type-site precondition, then the WHOLE
 * ordered code list, then the whole ordered message list — unfiltered, both.
 * Filtering to the one code under test would let a fix that opens a sink by
 * breaking something else (a new false emission beside the expected one, a lost
 * sibling verdict) pass, and the message list is what catches a fix that
 * restores a code while rendering a BINDING NAME into its `<type>` placeholder
 * (placeholder-rendering-a.md:11–13, the defect §Reproduction (b) measures as
 * `got xs`).
 */
function expectRow(
  label: string,
  src: string,
  sites: readonly string[],
  expected: Expectation,
  why: string,
): ThetaDocument {
  const doc = parseDoc(src, FILE);
  expect(
    declaredTypeSites(doc),
    `${label} PRECONDITION: the fixture's declared-type sites must be exactly these, so a fixture whose \`params:\` block or \`fn\` parameter list drifted fails here instead of letting the assertions below measure nothing. Diagnostics: ${render(doc)}`,
  ).toEqual([...sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${label} — ${why}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${label} — DIAG-4: the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...expected.msgs]);
  return doc;
}

/** One §Reproduction row: the `params:` spelling and its `fn`-parameter control. */
interface Pair {
  /** The shared binding name both spellings declare. */
  readonly binding: string;
  /** The `params:` spelling, §Reproduction's source verbatim. */
  readonly params: string;
  /** Its declared-type sites. */
  readonly paramsSites: readonly string[];
  /** The `fn`-parameter control, §Reproduction's control verbatim under `CFM`. */
  readonly control: string;
  /** Its declared-type sites. */
  readonly controlSites: readonly string[];
}

/**
 * One pair cell, in the order the file header states: both preconditions, the
 * vehicle identity, the CONTROL against the registry-sourced expectation, the
 * `params:` row against the same expectation, then the byte-identity of the two
 * rendered lists.
 *
 * The control is asserted BEFORE the subject so a red is never ambiguous: a
 * control failure means the check itself moved (or the registry row changed
 * shape), and a `params:` failure means the declared type is still not reaching
 * it. The trailing identity comparison is what a shared literal cannot give —
 * it reds if the two positions agree with the registry and disagree with each
 * other, and it cannot pass vacuously the day both spellings fall silent
 * together.
 */
function expectPair(row: string, pair: Pair, expected: Expectation, why: string): void {
  const control = expectRow(
    `${row} [control]`,
    pair.control,
    pair.controlSites,
    expected,
    `the check is live for this declared type in this position — green in both directions; ${why}`,
  );
  const params = expectRow(
    `${row} [params]`,
    pair.params,
    pair.paramsSites,
    expected,
    `§Expected behaviour: a read of a \`params:\`-declared binding carries that binding's declared type into the type layer, so this row fires exactly as its \`fn\`-parameter control does; ${why}`,
  );
  const paramsType = paramsDeclaredType(`${row} [params]`, params, pair.binding);
  const controlType = fnDeclaredType(`${row} [control]`, control, pair.binding);
  expect(
    normaliseType(paramsType),
    `${row} VEHICLE: both spellings must declare '${pair.binding}' with the same type, so the only difference between them is the annotation POSITION. params source: ${JSON.stringify(paramsType)}; fn-parameter source: ${JSON.stringify(controlType)}`,
  ).toBe(normaliseType(controlType));
  expect(
    params.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
    `${row} — §Expected behaviour makes the \`fn\`-parameter form the oracle: the two spellings' whole rendered diagnostic lists must be byte-identical\n  params:  ${render(params)}\n  control: ${render(control)}`,
  ).toEqual(control.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`));
}

// ===========================================================================
// (a) THE TWELVE UNREACHABLE ROWS.
//
// RULE: `type-system.md:15` puts frontmatter `params:` in the same
// type-annotation-position list as `let x: T` and a function parameter, and
// `:27` makes `⊑` the single relation governing those positions. `:48` licenses
// skipping a check only for an operand "past the parser's static view"; a
// `params:` field's declared type is written in the file and resolves whole-file
// (`frontmatter-fields-a.md:58`), so the deferral is unlicensed.
//
// Every `params:` cell here is `[]` at HEAD. A RED whose actual list is `[]` is
// the ERASURE; a RED naming a parse error, an unknown identifier or a different
// code is a fixture defect and not this bug. A red on a `[control]` label is
// neither — it means the check moved or the registry row changed shape.
// ===========================================================================

const A1: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nif s { 1 } else { 2 }\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { if s { 1 } else { 2 } }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A2: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { s: string }\nif p.s { 1 } else { 2 }\n`,
  paramsSites: ["params p:P"],
  control: `${CFM}schema P { s: string }\nfn f(p: P) { if p.s { 1 } else { 2 } }\n1\n`,
  controlSites: ["fn f(p:P)"],
};

const A3: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nwhile s { 1 }\n2\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { while s { 1 } }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A4: Pair = {
  binding: "n",
  params: `${PFM}  n: integer\n---\nlet s: string = n\ns\n`,
  paramsSites: ["params n:integer"],
  control: `${CFM}fn f(n: integer): string { let s: string = n\n s }\n1\n`,
  controlSites: ["fn f(n:integer)"],
};

const A5: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nfn g(n: integer): integer { n }\ng(s)\n`,
  paramsSites: ["params s:string", "fn g(n:integer)"],
  control: `${CFM}fn g(n: integer): integer { n }\nfn f(s: string): integer { g(s) }\n1\n`,
  controlSites: ["fn g(n:integer)", "fn f(s:string)"],
};

const A6: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nlet v = s.frobnicate()\nv\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { s.frobnicate() }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A7: Pair = {
  binding: "x",
  params: `${PFM}  x: number\n---\nlet n: integer = x\nn\n`,
  paramsSites: ["params x:number"],
  control: `${CFM}fn f(x: number): integer { let n: integer = x\n n }\n1\n`,
  controlSites: ["fn f(x:number)"],
};

const A8: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nlet v = s?\nv\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { let v = s?\n v }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A9: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nlet b: boolean = s < 1\nb\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string): boolean { s < 1 }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A10: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<integer>\n---\nlet j = xs.join(", ")\nj\n`,
  paramsSites: ["params xs:array<integer>"],
  control: `${CFM}fn f(xs: array<integer>) { xs.join(", ") }\n1\n`,
  controlSites: ["fn f(xs:array<integer>)"],
};

const A11: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { s: string }\nlet v = p[0]\nv\n`,
  paramsSites: ["params p:P"],
  control: `${CFM}schema P { s: string }\nfn f(p: P) { p[0] }\n1\n`,
  controlSites: ["fn f(p:P)"],
};

const A12: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nlet v = s[0]\nv\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { s[0] }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A13: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nschema S { n: number }\nlet v = S { n: s }\nv\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}schema S { n: number }\nfn f(s: string) { S { n: s } }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A14: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nlet xs: array<integer> = [s]\nxs\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { let xs: array<integer> = [s]\n xs }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

const A15: Pair = {
  binding: "s",
  params: `${PFM}  s: string | integer\n---\nif s { 1 } else { 2 }\n`,
  paramsSites: ["params s:string | integer"],
  control: `${CFM}fn f(s: string | integer) { if s { 1 } else { 2 } }\n1\n`,
  controlSites: ["fn f(s:string|integer)"],
};

const A16: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\nlet n: integer = xs\nn\n`,
  paramsSites: ["params xs:array<string>"],
  control: `${CFM}fn f(xs: array<string>): integer { let n: integer = xs\n n }\n1\n`,
  controlSites: ["fn f(xs:array<string>)"],
};

describe("bug 0192 (a) — a params:-declared read is judged, as its fn-parameter form is", () => {
  it("RED a1: non-boolean-condition on a declared `string` in an `if`", () => {
    // The one-body statement of the addition half: one declared primitive, one
    // condition position, and the only difference from the control is that the
    // annotation sits in frontmatter. `#typeExpr`'s `case "ident"` finds no
    // `bindings` entry and falls through to `named "s"`, which resolves to no
    // declaration, so the condition check answers `"unknown"` and defers.
    expectPair(
      "a1",
      A1,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "expressions.md truthiness: only a `boolean` is admissible in a condition, and `string` is the declared type on both sides",
    );
  });

  it("RED a2: the same code through a MEMBER read of an object-schema param", () => {
    // The member route, and the row the protected witness
    // tests/member-access-declared-field-type.test.ts pins as its BOUND x20.
    // Post-0136 the member arm is correct at its own position: for an
    // unresolvable receiver it returns the RECEIVER's own `named`, so `p.s`
    // types as `named "p"` — which is why the gap is upstream of that arm and
    // why this row moves without editing it (§Fix (e)). x20 flips with this
    // cell, under §Fix (f)'s authority.
    expectPair(
      "a2",
      A2,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "the receiver's declared `P` is what makes the field read `string`; supplying the receiver type is this fix's whole contribution to the member route",
    );
  });

  it("RED a3: the `while` condition is the second condition position", () => {
    expectPair(
      "a3",
      A3,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "control-flow.md:30 — a `while` condition must be `boolean`, so the erasure covers both condition positions rather than `if` alone",
    );
  });

  it("RED a4: let-rhs-type-mismatch — a declared `integer` under a `string` annotation", () => {
    expectPair(
      "a4",
      A4,
      one(LET_RHS, letRhs("s", "string", "integer")),
      "the registered *Trigger* qualifies on the RHS type being statically resolvable, and a declared `params:` type is exactly that",
    );
  });

  it("RED a5: fn-arg-type-mismatch — the row that also needs the unprovableBindings constraint", () => {
    // This row reaches its sink only through `provableArgType`, whose `ident`
    // arm withholds on an `unprovableBindings` identity hit. §Fix (c)'s closing
    // constraint is that the seeded `params:` type must NOT be recorded there:
    // an author-written annotation IS a declared type, so it is a proof. A fix
    // that launders it would leave this cell red while the other fifteen went
    // green — which is precisely how this cell attributes that failure.
    expectPair(
      "a5",
      A5,
      one(FN_ARG, fnArg("g", 0, "n", "integer", "string")),
      "a declared `params:` type is author-written in the same sense a `fn` annotation is, so it is a proof at the argument sink and not a laundered binding",
    );
  });

  it("RED a6: unknown-method on a declared `string`", () => {
    expectPair(
      "a6",
      A6,
      one(UNKNOWN_METHOD, unknownMethod("frobnicate", "string")),
      "expressions.md — anything off the stdlib list is a parse `E`, so the declared type is what decides the method's existence",
    );
  });

  it("RED a7: integer-narrowing — the one-way `integer → number` widening", () => {
    expectPair(
      "a7",
      A7,
      one(INTEGER_NARROWING, integerNarrowing()),
      "the declared `number` cannot narrow to `integer`; the message carries no placeholder, so this row's oracle is the code and the fixed string alone",
    );
  });

  it("RED a8: question-on-non-result — `?` on a declared `string`", () => {
    // The `?` gate has two halves and only the OPERAND half is this row's:
    // `checkQuestionScope` answers `undefined` for an inferred return scope,
    // and `checkTypeLayer` starts the top-level walk with
    // `{ kind: "inferred" }`, exactly as the control's annotation-less `fn`
    // does. So the pair stays a one-diagnostic pair in both directions rather
    // than the `params:` row acquiring a second, scope-shaped verdict.
    expectPair(
      "a8",
      A8,
      one(QUESTION_ON_NON_RESULT, questionOperand("string")),
      "the operand half of the `?` gate reads the declared type; the scope half defers identically on both sides because both scopes are inferred",
    );
  });

  it("RED a9: non-orderable-operands — a declared `string` against an `integer`", () => {
    expectPair(
      "a9",
      A9,
      one(NON_ORDERABLE, nonOrderable("<", "string", "integer")),
      "both operand types render in source-grammar form, so this row also pins that the declared type reaches the `<left>` placeholder",
    );
  });

  it("RED a10: non-string-array-join — an `array<T>` DECLARATION, not a primitive", () => {
    expectPair(
      "a10",
      A10,
      one(NON_STRING_JOIN, arrayJoin("integer")),
      "`array<T>` is the second of the four declared spellings the claim covers, and the element type is what the join gate judges",
    );
  });

  it("RED a11: non-string-object-index — an object-schema receiver indexed by an integer", () => {
    expectPair(
      "a11",
      A11,
      one(NON_STRING_OBJECT_INDEX, objectIndex("integer")),
      "the declared `P` resolves to an object-form `schema`, which is what makes the receiver an object and brings the key-type gate into reach",
    );
  });

  it("RED a12: non-indexable-receiver — a declared `string` indexed", () => {
    expectPair(
      "a12",
      A12,
      one(NON_INDEXABLE, nonIndexable("string")),
      "a `string` is neither `array<T>` nor an object value, so the declared type decides the receiver's indexability",
    );
  });

  it("RED a13: object-field-type-mismatch at a constructor field", () => {
    expectPair(
      "a13",
      A13,
      one(OBJECT_FIELD, objectField("n", "S", "number", "string")),
      "the constructor-field check's own resolvability qualifier is met once the field value's declared type arrives",
    );
  });

  it("RED a14: TWO codes, in emission order — the array sink and its element", () => {
    // The only multi-diagnostic row in the group, and the reason every
    // assertion here is a whole ORDERED list: a fix that restored one of the
    // two, or restored both in the other order, would pass a containment
    // matcher and reds here.
    expectPair(
      "a14",
      A14,
      two(
        LET_RHS,
        letRhs("xs", "array<integer>", "array<string>"),
        ARRAY_ELEMENT,
        arrayElement(0, "integer", "string"),
      ),
      "the element's declared type reaches both the array literal's own sink and the enclosing annotation, so two registered rows fire from one read",
    );
  });

  it("RED a15: a TOP-LEVEL UNION declaration", () => {
    // The third declared spelling. `annotationToCompatType` splits on
    // top-level `|` through `splitTopLevelUnion`, which trims each arm — so the
    // `params:` source's spaces (`string | integer`) and the control's stripped
    // bytes (`string|integer`) project onto the same `union`, and the rendered
    // `<type>` is the same source-grammar spelling on both sides.
    expectPair(
      "a15",
      A15,
      one(NON_BOOLEAN, condition("string | integer")),
      "the union arms are trimmed by the converter, so the two positions' differing source bytes decide identically and render identically",
    );
  });

  it("RED a16: an `array<T>` declaration against a primitive `let` annotation", () => {
    expectPair(
      "a16",
      A16,
      one(LET_RHS, letRhs("n", "integer", "array<string>")),
      "the `<actual>` renders `array<string>` in source-grammar form, which is the placeholder-rendering-a.md:11–13 obligation the false `got xs` render of group (b) fails",
    );
  });
});

// ===========================================================================
// (b) THE REMOVAL DIRECTION: A FALSE `E` THAT DENIES REGISTRATION.
//
// RULE: `control-flow.md:13` admits `for x in xs` for any `array<T>` iterand.
// `checkForIterand` (src/parser/control-flow.ts) refuses every non-`array`
// iterand INCLUDING an unresolvable `named`, by design, and the `for` and
// `par for` arms shield it with `containsWithheldBinderType` alone — a test for
// the sentinel `recordWithheldBinders` writes. A `params:` name has no
// `bindings` entry of any kind, so nothing is withheld, the refusal lands at
// `E`, and `hasLoadParseError`
// (src/extension/production-composition.ts) denies registration.
//
// Each cell asserts `[]` in BOTH directions and, separately, that the document
// carries no `error`-severity diagnostic at all — the predicate registration
// actually keys off. Pre-fix the `params:` half carries
// `theta/parse/non-array-iterand: 'for' expects array<T> after 'in'; got xs`
// (b2: `got p`), which renders the BINDING'S IDENTIFIER where a type belongs
// and so fails placeholder-rendering-a.md:11–13 even where a verdict would be
// right. A RED here whose actual list is that diagnostic is the defect; any
// other list is a fixture defect.
// ===========================================================================

const B1: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\nfor y in xs { y }\n1\n`,
  paramsSites: ["params xs:array<string>"],
  control: `${CFM}fn f(xs: array<string>) { for y in xs { y } }\n1\n`,
  controlSites: ["fn f(xs:array<string>)"],
};

const B2: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { xs: array<string> }\nfor y in p.xs { y }\n1\n`,
  paramsSites: ["params p:P"],
  control: `${CFM}schema P { xs: array<string> }\nfn f(p: P) { for y in p.xs { y } }\n1\n`,
  controlSites: ["fn f(p:P)"],
};

const B3: Pair = {
  binding: "xs",
  params: `${PFM}  xs: L\n---\nschema L = array<string>\nfor y in xs { y }\n1\n`,
  paramsSites: ["params xs:L"],
  control: `${CFM}schema L = array<string>\nfn f(xs: L) { for y in xs { y } }\n1\n`,
  controlSites: ["fn f(xs:L)"],
};

const B4: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\npar for y in xs { y }\n1\n`,
  paramsSites: ["params xs:array<string>"],
  control: `${CFM}fn f(xs: array<string>) { par for y in xs { y } }\n1\n`,
  controlSites: ["fn f(xs:array<string>)"],
};

/**
 * A group-(b) cell: the pair, then the registration predicate's own input. An
 * `E`-severity `theta/parse/*` is what `hasLoadParseError` acts on, so the
 * second assertion states the load consequence in the terms the load path uses
 * rather than leaving it to the reader of an empty list.
 */
function expectAdmitted(row: string, pair: Pair, why: string): void {
  expectPair(row, pair, CLEAN, why);
  const params = parseDoc(pair.params, FILE);
  expect(
    errors(params.diagnostics).map((d: Diagnostic) => `${d.code}: ${d.message}`),
    `${row} — an \`E\`-severity \`theta/parse/*\` denies registration (\`hasLoadParseError\`), so this spec-legal program must carry none`,
  ).toEqual([]);
}

describe("bug 0192 (b) — the false non-array-iterand refusal stops firing", () => {
  it("RED b1: `for y in xs` over a declared `array<string>` loads clean", () => {
    // The direct declaration, and the ordinary shape for a list-valued
    // parameter — `focus_areas: array<string>` is the spec's own opening
    // `params:` example (frontmatter-fields-a.md:23). No shipped fixture
    // declares an `array<…>` param, so nothing in the committed corpus
    // witnesses this refusal.
    expectAdmitted(
      "b1",
      B1,
      "control-flow.md:13 admits this loop for any `array<T>` iterand, and the declared type is `array<string>` on both sides",
    );
  });

  it("RED b2: `for y in p.xs` over a declared field of an object-schema param", () => {
    // The member route into the same refusal. Pre-fix the message renders
    // `got p` — the RECEIVER's own `named`, which is bug 0136's specified
    // answer for an unresolvable receiver — so this row also pins that the fix
    // supplies the receiver type rather than editing that arm.
    expectAdmitted(
      "b2",
      B2,
      "the receiver's declared `P` unfolds to the field's declared `array<string>`, which `checkForIterand` admits",
    );
  });

  it("RED b3: `for y in xs` over a type ALIAS of `array<string>`", () => {
    // `checkForIterand` unfolds an alias for the control and cannot unfold
    // anything here, because nothing named the type: the erasure happens before
    // the unfolding, not in it. TYPE-11 (type-system.md:54) is what makes the
    // control admissible.
    expectAdmitted(
      "b3",
      B3,
      "TYPE-11 makes the alias transparent once a type arrives at all, so the alias row is the same admission one unfolding on",
    );
  });

  it("RED b4: `par for y in xs` — the second call site of the same registry row", () => {
    expectAdmitted(
      "b4",
      B4,
      "the `par for` arm carries its own copy of the same withheld-marker guard, so the row moves at both call sites or the fix is half-applied",
    );
  });
});

// ===========================================================================
// (c) THE ERASURE REACHES EVERY NESTING DEPTH.
//
// RULE: `walkBlock` hands each nested block `new Map(bindings)`, so whatever
// the root map holds propagates down and whatever it lacks is lacked
// everywhere. FN-1 (functions.md:20) forbids closures and functions.md:61
// states there is no lexical capture, so a `fn` body cannot read a `params:`
// field at all — the top-level walk `checkTypeLayer` starts IS the whole
// surface, and the loss is total for the position rather than partial by depth.
// ===========================================================================

const C1: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n  b: boolean\n---\nif b { if s { 1 } else { 2 } } else { 3 }\n`,
  paramsSites: ["params s:string", "params b:boolean"],
  control: `${CFM}fn f(s: string, b: boolean) { if b { if s { 1 } else { 2 } } else { 3 } }\n1\n`,
  controlSites: ["fn f(s:string)", "fn f(b:boolean)"],
};

const C2: Pair = {
  binding: "s",
  params: `${PFM}  s: string\n---\nfor y in [1,2] { if s { y } else { y } }\n1\n`,
  paramsSites: ["params s:string"],
  control: `${CFM}fn f(s: string) { for y in [1,2] { if s { y } else { y } } }\n1\n`,
  controlSites: ["fn f(s:string)"],
};

describe("bug 0192 (c) — the declared type propagates to every nested depth", () => {
  it("RED c1: a nested `if` inside a legal `if` judges the inner read", () => {
    // Two declared fields, one legal and one not: the outer `boolean` condition
    // must stay silent while the inner `string` condition fires, so this cell
    // also pins that seeding the root map does not make the walk noisy.
    expectPair(
      "c1",
      C1,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "the per-block `new Map(bindings)` copy carries the root entry down, and the legal outer condition proves the copy is not a blanket refusal",
    );
  });

  it("RED c2: a `for` body judges a read of an enclosing `params:` field", () => {
    // The iterand here is a literal array, so this row is about the DEPTH and
    // not about the iterand gate: the loop is admissible in both spellings and
    // the only verdict either owes is the body's own condition.
    expectPair(
      "c2",
      C2,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "a loop body is a nested block like any other, so the enclosing declared type is in scope for its checks",
    );
  });
});

// ===========================================================================
// (d) THE FENCES — §Fix (h). GREEN IN BOTH DIRECTIONS.
//
// RULE: the claim covers exactly the four spellings the type layer types at
// every other annotation position — a primitive, a top-level union, `array<T>`,
// and a `NamedType` resolving to an object-form `schema`. d1 and d2 are legal
// uses that must not become refusals. d3 and d4 are the `params:` spellings
// that legitimately defer, each because its `fn`-parameter control defers too:
// a route that moves either has widened something this report does not claim.
// ===========================================================================

const D1: Pair = {
  binding: "b",
  params: `${PFM}  b: boolean\n---\nif b { 1 } else { 2 }\n`,
  paramsSites: ["params b:boolean"],
  control: `${CFM}fn f(b: boolean) { if b { 1 } else { 2 } }\n1\n`,
  controlSites: ["fn f(b:boolean)"],
};

const D2: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { s: string }\nlet ok: string = p.s\nok\n`,
  paramsSites: ["params p:P"],
  control: `${CFM}schema P { s: string }\nfn f(p: P) { let ok: string = p.s\n ok }\n1\n`,
  controlSites: ["fn f(p:P)"],
};

const D3: Pair = {
  binding: "p",
  params: `${PFM}  p: {s: string}\n---\nif p.s { 1 } else { 2 }\n`,
  paramsSites: ["params p:{s: string}"],
  control: `${CFM}fn f(p: {s: string}) { if p.s { 1 } else { 2 } }\n1\n`,
  // Since bug 0228's fix an inline object's brace group is a raw slice of the
  // author's own source bytes at the `fn` parameter position too, so this
  // control's captured type keeps the author's inter-token space instead of
  // joining it away.
  controlSites: ["fn f(p:{s: string})"],
};

const D4: Pair = {
  binding: "c",
  params: `${PFM}  c: Color\n---\nenum Color { Red }\nif c { 1 } else { 2 }\n`,
  paramsSites: ["params c:Color"],
  control: `${CFM}enum Color { Red }\nfn f(c: Color) { if c { 1 } else { 2 } }\n1\n`,
  controlSites: ["fn f(c:Color)"],
};

describe("bug 0192 (d) — the fences the fix must hold", () => {
  it("FENCE d1: a legal `boolean` condition stays silent", () => {
    // The row an over-broad fix breaks first: seeding a declared type makes the
    // check JUDGE, and its judgement here is that nothing is owed.
    expectPair(
      "d1",
      D1,
      CLEAN,
      "TYPE-1 reflexivity on the declared `boolean`; a legal use must not become a refusal",
    );
  });

  it("FENCE d2: a legal typed `let` off a declared field stays silent", () => {
    // The compatible half of the member route, and the same-source contrast row
    // §Reproduction (e) names: the binding resolves today and the declared field
    // type is compatible with the annotation, so the row owes nothing in either
    // direction.
    expectPair(
      "d2",
      D2,
      CLEAN,
      "the field's declared `string` satisfies the `string` annotation, so opening the sink adds nothing to this program",
    );
  });

  it("FENCE d3: an INLINE OBJECT type defers, in both directions", () => {
    // Outside the claim, and not for a `params:`-specific reason:
    // `annotationToCompatType` and `paramsDeclaredCompatType` both answer a
    // nominal `named` for an inline object type at EVERY annotation position, so
    // the `fn`-parameter control defers identically. The unfolded receiver
    // resolves to no declaration, `#typeExpr`'s `case "member"` returns the
    // receiver's own `named`, and the condition check answers `"unknown"`.
    // Widening this is `annotationToCompatType`'s subject
    // (docs/bugs/0124-parsetype-trailing-punctuation-leniency.md), not this
    // position's — and row x4 of
    // tests/member-access-declared-field-type.test.ts is the schema-field twin.
    expectPair(
      "d3",
      D3,
      CLEAN,
      "both converters decline the inline-object form at every position alike, so there is no delta between the two spellings to claim",
    );
  });

  it("FENCE d4: an `enum`-typed param defers, in both directions", () => {
    // `collectTypeEnv` records `schema` declarations only, so `named "Color"`
    // resolves to nothing whichever position declared it. A recorded non-goal
    // (bug 0038 residual (iii), restated by bug 0136 §Fix (b)): a fix here
    // inherits whatever that position does and adds no enum-name source. Row x6
    // of tests/member-access-declared-field-type.test.ts is its field twin.
    expectPair(
      "d4",
      D4,
      CLEAN,
      "the `fn`-parameter control also measures `[]` because the TypeEnv holds no `enum`, so no delta exists at this spelling",
    );
  });
});

// ===========================================================================
// (e) THE NAME IS BOUND; ONLY THE TYPE IS MISSING. GREEN IN BOTH DIRECTIONS.
//
// RULE: the lexical layer resolves a `params:` field through
// `checkLexicalCallSites`'s own `rootLocals` reader, which is name-keyed and is
// NOT this fix's surface (§Fix (h)). An undeclared spelling draws
// `theta/parse/unknown-identifier` today and must keep drawing exactly that;
// the declared spelling of the same body draws nothing. The pair is what
// separates "the binding does not exist" from "the binding has no type".
// ===========================================================================

const E_UNKNOWN = `${PFM}  p: P\n---\nschema P { s: string }\nlet ok: string = q.s\nok\n`;

describe("bug 0192 (e) — the lexical layer's own verdict is unmoved", () => {
  it("FENCE e: an UNDECLARED receiver keeps its unknown-identifier, and the declared spelling keeps its silence", () => {
    expectRow(
      "e [undeclared]",
      E_UNKNOWN,
      ["params p:P"],
      one(UNKNOWN_IDENTIFIER, unknownIdentifier("q")),
      "the lexical layer decides this row and is a separate reader from the type layer's `bindings` map, so the verdict is unmoved in both directions",
    );
    // The same body one spelling over — D2's `params:` fixture, whose receiver
    // IS declared — reports nothing. Asserted here as the pair, so the
    // unknown-identifier row cannot be read as evidence that the type layer
    // sees the binding.
    expectRow(
      "e [declared]",
      D2.params,
      ["params p:P"],
      CLEAN,
      "the declared spelling resolves lexically and owes no type verdict, which is what makes the neighbouring row's diagnostic a NAME verdict rather than a type one",
    );
  });
});

// ===========================================================================
// (m) THE BUG 0190 COMPOSITION — a params-rooted member read at the
// fn-argument sink.
//
// RULE: bug 0190 (0.111.0) opened `provableArgType`'s `case "member"` for a
// member read whose RECEIVER is itself a proven read and whose field resolves
// to a declared type on a resolved object schema. A `params:` receiver is not a
// proven read today for the simplest possible reason — it has no recorded type
// at all — so that fix's own sink is unreachable from the primary typed-input
// surface. This row is where the two fixes compose: the receiver obligation is
// satisfied by the seeded declared type, and no change to bug 0190's arm is
// needed.
//
// NOT the same row as cell S3 of tests/fn-arg-member-read-proof.test.ts, which
// is an UNANNOTATED `fn` parameter recorded as a WITHHELD binder and stays a
// bound under this fix: there the receiver has no DECLARED type to thread, here
// it has one and the threading is what is missing.
// ===========================================================================

const M1: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { s: string }\nfn g(n: integer): integer { n }\ng(p.s)\n`,
  paramsSites: ["params p:P", "fn g(n:integer)"],
  control: `${CFM}schema P { s: string }\nfn g(n: integer): integer { n }\nfn f(p: P): integer { g(p.s) }\n1\n`,
  controlSites: ["fn g(n:integer)", "fn f(p:P)"],
};

describe("bug 0192 (m) — a params-rooted member read reaches the fn-argument sink", () => {
  it("RED m1: `g(p.s)` over a `params:`-declared object-schema receiver fires once", () => {
    expectPair(
      "m1",
      M1,
      one(FN_ARG, fnArg("g", 0, "n", "integer", "string")),
      "the receiver-proof obligation bug 0190's arm imposes is met by the declared `params:` type, so the declared field type is judged at the argument slot TYPE-9 names",
    );
  });
});

// ===========================================================================
// (L) THE LOOP-ELEMENT CONSUMERS — the removal and the addition in one cell.
//
// RULE: with the iterand's declared type in place, the loop variable carries
// the iterand's ELEMENT type (bug 0126's fix for the plain arm, and the
// `par for` arm's own element binding), so the body's checks judge the element.
// Pre-fix each of these four programs carries the FALSE `non-array-iterand`
// INSTEAD of the element-typed verdict its control reports — the loop is
// refused before its body is ever judged — so each cell reds twice over: the
// code list is wrong AND the message renders a binding name where a type
// belongs.
//
// These four rows are also what proves the removal in group (b) is not a
// silencing: `[]` there is the whole verdict a bodyless loop owes, and here the
// same admission carries a body whose verdict must arrive.
// ===========================================================================

const L1: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\nfor y in xs { if y { 1 } else { 2 } }\n1\n`,
  paramsSites: ["params xs:array<string>"],
  control: `${CFM}fn f(xs: array<string>) { for y in xs { if y { 1 } else { 2 } } }\n1\n`,
  controlSites: ["fn f(xs:array<string>)"],
};

const L2: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\npar for y in xs { if y { 1 } else { 2 } }\n1\n`,
  paramsSites: ["params xs:array<string>"],
  control: `${CFM}fn f(xs: array<string>) { par for y in xs { if y { 1 } else { 2 } } }\n1\n`,
  controlSites: ["fn f(xs:array<string>)"],
};

const L3: Pair = {
  binding: "p",
  params: `${PFM}  p: P\n---\nschema P { xs: array<string> }\nfor y in p.xs { if y { 1 } else { 2 } }\n1\n`,
  paramsSites: ["params p:P"],
  control: `${CFM}schema P { xs: array<string> }\nfn f(p: P) { for y in p.xs { if y { 1 } else { 2 } } }\n1\n`,
  controlSites: ["fn f(p:P)"],
};

const L4: Pair = {
  binding: "xs",
  params: `${PFM}  xs: array<string>\n---\nfn g(n: integer): integer { n }\nfor y in xs { g(y) }\n1\n`,
  paramsSites: ["params xs:array<string>", "fn g(n:integer)"],
  control: `${CFM}fn g(n: integer): integer { n }\nfn f(xs: array<string>) { for y in xs { g(y) } }\n1\n`,
  controlSites: ["fn g(n:integer)", "fn f(xs:array<string>)"],
};

describe("bug 0192 (L) — the loop element carries the declared element type", () => {
  it("RED L1: a plain `for` body judges its loop variable as `string`", () => {
    expectPair(
      "L1",
      L1,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "the admitted iterand's element type is what the body's condition check judges, so admitting the loop and typing its variable are one step",
    );
  });

  it("RED L2: the `par for` body reaches the same verdict on the same body", () => {
    expectPair(
      "L2",
      L2,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "the second loop arm binds its own element, so the two arms must agree on the identical body",
    );
  });

  it("RED L3: a MEMBER iterand's element is judged the same way", () => {
    expectPair(
      "L3",
      L3,
      one(NON_BOOLEAN, CONDITION_GOT_STRING()),
      "the receiver's declared `P` supplies the field's declared `array<string>`, whose element is what the body reads",
    );
  });

  it("RED L4: the loop element reaches the fn-argument sink", () => {
    // The element-typed composition of group (m)'s sink: the element must be a
    // PROOF for `provableArgType` to judge it, which is the same
    // `unprovableBindings` constraint cell a5 pins one hop earlier.
    expectPair(
      "L4",
      L4,
      one(FN_ARG, fnArg("g", 0, "n", "integer", "string")),
      "a proven iterand's element is a proof, so the element-typed argument inside the body is judged exactly as the control's is",
    );
  });
});
