import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import type { ModelReferenceMatcher, ParsedFrontmatter } from "../src/parser/frontmatter";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  isThetaPanic,
  surfaceUnexpectedThrow,
  MissingObjectKeyPanic,
  MISSING_OBJECT_KEY_CODE,
  NullMemberAccessPanic,
  NULL_MEMBER_ACCESS_CODE,
  QuestionOperandDefectError,
} from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0032 — member access on a name an object value does not carry reads the
// JS property unfiltered (`evaluateMemberAccess`,
// src/runtime/runtime-panics.ts, its `null` and non-object-receiver guards then
// a bare `(target as { [k: string]: ThetaValue })[field]`), so an absent name
// binds raw JS `undefined` — a value outside the value model — and that value
// then circulates: `o.absent == null` is `false`, `"v=" + o.absent` is
// `"v=undefined"`, a constructor stores it, and a second read aborts the theta
// through the runtime-defect surface
// (docs/bugs/0032-absent-member-binds-undefined.md).
//
// THE CONTRACT UNDER TEST (the bug's §Fix + §Expected behaviour, no wider).
// Member access on an absent theta-side name panics with the EXISTING
// registered code
//
//   theta/runtime/missing-object-key      message: missing object key: <key>
//
// byte-identical to the index spelling of the same name. The closed six-source
// panic list (error-model.md:67–72) keeps six entries, six codes and six
// templates; only the TRIGGER of an existing entry widens from indexed access
// to both structural reads (the §Fix registry edit at
// code-registry-runtime.md:17, a spec change under DIAG-2,
// diagnostic-shape.md:72). So every probe here asserts `isThetaPanic` is
// `true`, the panic CLASS is `MissingObjectKeyPanic`, and the panic does NOT
// reach the runtime-defect surface — the opposite posture from bug 0027's
// `theta/runtime/non-object-receiver` gate, which is deliberately not a panic.
//
// Spec anchors:
//   - docs/spec_topics/expressions.md:9 — "Member access: `a.b`", the entire
//     specification of the form; it assigns an absent name no result, which is
//     the spec-gap half of the report.
//   - :10 — the indexed-access bullet, which pairs the two spellings in one
//     sentence ("an author wanting the per-field declared type uses member
//     access (`obj.fieldName`)") and gives the index one its disposition: "an
//     object index whose theta-side name is absent panics with
//     `theta/runtime/missing-object-key`". Two spellings of one read over one
//     key space, differing only in static result type.
//   - :120 — the `has(k)` row: "Returns `false` for unknown keys (no panic) —
//     this is the explicit safe-check." A designated safe-check presupposes an
//     unsafe read to be safe against; today `.field` is neither safe nor
//     unsafe, it answers wrongly.
//   - docs/spec_topics/errors-and-results/error-model.md:67–72 — the closed
//     panic list (`:71` is the entry whose trigger widens); `:74` — the list is
//     closed for new spec-defined sources, and unexpected throws form the
//     separate runtime-defect surface `theta/runtime/internal-error` (what
//     P1/P2 land on today); `:84` — the registered template
//     `missing object key: <key>`, normative, exact-string assertions licensed.
//   - docs/spec_topics/diagnostics/code-registry-runtime.md:17 — the
//     `theta/runtime/missing-object-key` row; its *Message* column is this
//     file's oracle (DIAG-4) and is UNCHANGED by the fix.
//   - docs/spec_topics/runtime-value-model.md:5–14 — the value-representation
//     table: eight arms, no representation for "no value"; `:10` makes `null` a
//     legal field value, which is why absence cannot be encoded as a value on
//     this surface. §Equality — "`==` and `!=` accept operands of *any* two
//     static types" and "Primitives compare by value", both presupposing
//     operands drawn from that table.
//   - docs/spec_topics/governance/source-language-stability.md:5 (GOV-15) and
//     :23–25 (the diagnostic-registry carve-out) — the affected inputs were
//     never conformant, so the value-change half rests on the
//     never-conformant argument and the new emission is the carve-out's own
//     in-scope case.
//
// PROBED CURRENT SIGNATURES (HEAD 91bb308b / 0.41.0, offline, deterministic,
// byte-identical to the bug's §Reproduction table at 0.32.0 — zero drift).
// Fixture `schema F { x: integer }` / `let o = F { x: 1 }`:
//   M1  o.definitely_absent            → success value=undefined
//   M2  o.definitely_absent == null    → success value=false        ← backwards
//   M3  o.definitely_absent != null    → success value=true         ← backwards
//   M4  o.absent_a == o.absent_b       → success value=true
//   M5  … == ""                        → success value=false
//   M6  … == false                     → success value=false
//   M7  match … { null => …, _ => … }  → success value="other"
//   M8  … ? "t" : "f"                  → success value="f"
//   M9  !…                             → success value=true
//   N1  let a = …; a                   → success value=null   (the `?? null`
//   N2  let a = …; a == null           → success value=true    coercions at
//   N3  fn h(p){p == null}; h(…)       → success value=true    5632 / 571)
//   N4  fn k(p){p.nope == null}; k(o)  → success value=false
//   P1  ….deeper                       → THREW TypeError: Cannot read
//                                        properties of undefined
//   P2  …["k"]                         → THREW Error: indexed access requires
//                                        an array<T> or object receiver; got
//                                        undefined
//   P3  ….keys()                       → success value=null
//   P4  "v=" + …                       → success value="v=undefined"
//   P5  … + 1                          → success value=NaN
//   P6–P9  let q = F { x: o.absent }   → keys ["x"], has true,
//                                        q.x == null false, q == F{x:1} false
//   P10 let arr = [o.absent]; arr[0] == null → success value=false
//   P11 …?                             → THREW QuestionOperandDefectError
//                                        ("a undefined", bug 0019's guard)
// Controls, green today and after: C1 `o["definitely_absent"]` panics with the
// byte-exact registered message, C2 `has` false, C3 `keys()` ["x"], C4 `o.x` 1,
// C5 `F { }` parse-rejects (theta/parse/missing-object-field), `Sev.High`
// resolves, `length` answers 2 on a string and on an array including through an
// unannotated `fn` parameter, and a `null` receiver keeps
// `NullMemberAccessPanic`.
//
// BOTH DIRECTIONS, the bug's §Fix wording — "assert the panic and its
// registered message fire … and assert the pre-fix values are gone". Every RED
// probe declares its pre-fix leak, and {@link assertMissingKeyPanic} asserts
// the leak is GONE *before* asserting the panic, so the red output names the
// exact value that leaked (`undefined`, `false`, `"v=undefined"`, `null`, …)
// rather than only reporting "no panic". This is the same ordering
// tests/non-object-receiver-gate.test.ts's `assertGated` uses.
//
// HARNESS — the tests/non-object-receiver-gate.test.ts group-(e)
// production-executor pattern, verbatim: parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody. Offline,
// provider-free, no model, no child process, no network. `parseTheta` fails
// LOUDLY on any error-severity diagnostic and every value-disposition helper
// throws with the value rendered, so no probe can silently skip or pass for the
// wrong reason (CLAUDE.md: no silent test skipping). Both hosts call the ONE
// shared `evaluateMemberAccess` (src/runtime/statement-executor.ts's member arm
// and src/extension/production-theta-producer.ts's), so unlike bug 0027 there
// is no per-host lockstep obligation and one executor route pins the surface.
//
// A THETA SCOPING NOTE, discovered while probing: a body-level `let o` is NOT
// visible inside an `fn` body, so the laundered probes (N3 / N4 / P11's
// receiver, the `length` and `null`-receiver controls) pass their receiver in as
// a parameter rather than closing over the fixture binding.
//
// SCOPE AGAINST BUG 0036. 0036 landed the `<key>` category-5 rendering at the
// single interpolation point, and tests/missing-object-key-rendering.test.ts
// owns its vectors (a non-identifier-shaped key renders quoted). Every key
// named here is identifier-shaped and therefore renders BARE; this file does
// not restate 0036's quoting vectors. Its one 0036-coordination claim is group
// (d): the member spelling and the index spelling of the SAME absent name must
// render the same bytes, which is what keeps the two surfaces on one
// interpolation point after this fix rebases onto it.

// ===========================================================================
// The contract under test — the registered code and its rendered message.
// ===========================================================================

/**
 * The registered *Message* template for `theta/runtime/missing-object-key`
 * (code-registry-runtime.md:17). Restated so group (e)'s drift guard reds on a
 * registry change rather than silently asserting a stale string. Bug 0032 §Fix
 * makes NO edit to this column — only to the row's *Trigger*.
 */
const REGISTERED_TEMPLATE = "missing object key: <key>";

/** The live registry, read from the spec corpus — the DIAG-4 source of truth. */
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
) as readonly { readonly code: string; readonly message: string }[];

/**
 * The registered template with `<key>` filled by `key`. Every key this file
 * probes is identifier-shaped (`^[A-Za-z_][A-Za-z0-9_]*$`), so its category-5
 * rendering is the bare key — bug 0036's quoting branch is not exercised here
 * and stays owned by tests/missing-object-key-rendering.test.ts.
 */
function missingKeyMessage(key: string): string {
  const template = registryMessage(REGISTRY, MISSING_OBJECT_KEY_CODE) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: no registry row for ${MISSING_OBJECT_KEY_CODE} — the DIAG-4 Message column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template.replace("<key>", key);
}

// ===========================================================================
// Shared parse + production-executor harness (the tests/non-object-receiver-gate.test.ts
// group-(e) pattern).
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}

/**
 * Parse a fixture and fail LOUDLY on any error-severity diagnostic. Every probe
 * in this file is parse-clean at HEAD (the bug's §Reproduction; `checkMemberAccess`
 * returns early for `"object"` and `"unknown"` receivers alike, so no absent
 * field name is rejected statically), so a rejection here is a harness defect —
 * never a silent skip. The one deliberate parse rejection (control C5) uses
 * {@link parseOnly} instead.
 */
function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseOnly(path, src);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
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

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** The bug's §Reproduction frontmatter and fixture prologue, verbatim. */
const FM = "---\nmode: prompt\n---\n";
const OBJECT_FIXTURE = "schema F { x: integer }\nlet o = F { x: 1 }\n";
/** Control (i)'s prologue: `Enum.Variant` resolution must never reach the gate. */
const ENUM_FIXTURE = "enum Sev { Low, High }\n";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "bug0032.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/**
 * One probe's disposition: the body produced a value, or the runtime threw. A
 * panic propagates out of `executeBody` uncaught (the framing that routes it to
 * the system-note channel lives one layer up), so both dispositions are
 * observable here.
 */
type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("bug0032.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0032",
    sourcePath: "/theta/bug0032.theta",
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

/** The JSON rendering a declared pre-fix `leak` is compared against. */
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/**
 * The rendering used in FAILURE TEXT: the JSON form plus the `String(…)` form
 * when the two differ, so a red names what actually leaked. `NaN` (P5) is the
 * reason — `JSON.stringify(NaN)` is `"null"`, which would otherwise hide the
 * arithmetic leak behind a legal theta value's spelling.
 */
function describeValue(value: ThetaValue | undefined): string {
  const json = render(value);
  const raw = String(value);
  return json === raw ? json : `${json} (String(…) = ${raw})`;
}

/**
 * Assert bug 0032's presence gate fired for `key`, in BOTH directions:
 *
 *   1. the declared pre-fix leak is GONE (asserted first, so a red names the
 *      exact out-of-model value the read answered);
 *   2. the read raised `MissingObjectKeyPanic` — a real panic
 *      (`isThetaPanic`), carrying the existing registered code, the registered
 *      message with `key` interpolated, and NOT routed onto the
 *      runtime-defect surface (`surfaceUnexpectedThrow` returns `undefined`
 *      for a panic, which is what distinguishes this fix's disposition from
 *      P1/P2's current `theta/runtime/internal-error` abort).
 *
 * `leak` is the pre-fix JSON rendering, given as a string so `undefined` (M1)
 * is expressible; it is omitted only where the pre-fix disposition is already a
 * throw (P1 / P2 / P11).
 */
function assertMissingKeyPanic(
  probe: Probe,
  expected: { readonly key: string; readonly what: string; readonly leak?: string },
): MissingObjectKeyPanic {
  const expectedMessage = missingKeyMessage(expected.key);
  if (probe.kind === "value") {
    const value = probe.execution.result.value;
    if (expected.leak !== undefined) {
      expect(
        render(value),
        `DIRECTION 2 (bug 0032 §Fix — "assert the pre-fix values are gone"): ${expected.what} leaked ${describeValue(value)}. Raw JS \`undefined\` is outside the value-representation table (runtime-value-model.md:5–14) and outside \`ThetaValue\`, and every value in this row is derived from it — so no theta expression may produce it`,
      ).not.toBe(expected.leak);
    }
    expect(
      `${probe.execution.outcome}, value ${describeValue(value)}`,
      `DIRECTION 1 (bug 0032 §Expected): ${expected.what} must raise ${MISSING_OBJECT_KEY_CODE} with '${expectedMessage}', matching the index spelling of the same name exactly (expressions.md:10). At HEAD the member read returns the JS property unfiltered and the theta continues`,
    ).toBe(`panic ${MISSING_OBJECT_KEY_CODE}: ${expectedMessage}`);
    throw new Error("unreachable: the assertion above always fails on a value disposition");
  }
  const { thrown } = probe;
  expect(
    thrown,
    `PRIMARY (bug 0032 §Fix): ${expected.what} must raise the missing-object-key PANIC CLASS — the same class the index spelling raises (control C1), because the fix widens an existing entry's trigger rather than adding a source to the closed list (error-model.md:67–72/:74). Thrown: ${String(thrown)}`,
  ).toBeInstanceOf(MissingObjectKeyPanic);
  expect(
    isThetaPanic(thrown),
    `bug 0032 §Fix: "The panic list stays closed" — missing-object-key is one of the six closed sources (error-model.md:71), so the throw is a ThetaPanic and bypasses \`?\` / \`match\`. Thrown: ${String(thrown)}`,
  ).toBe(true);
  expect(
    (thrown as { readonly code: string }).code,
    `bug 0032 §Fix: the EXISTING code, not a new one — "the list keeps six entries, six codes and six message templates"`,
  ).toBe(MISSING_OBJECT_KEY_CODE);
  expect(
    (thrown as Error).message,
    `bug 0032 §Expected: the registered template '${REGISTERED_TEMPLATE}' names the first absent key read (error-model.md:84; the templates are normative and exact-string assertions are licensed by :76)`,
  ).toBe(expectedMessage);
  expect(
    surfaceUnexpectedThrow(thrown, SITE),
    `bug 0032 §Why it matters ("The failures it does produce are mislabelled"): a panic is NOT a runtime defect, so it must not route onto the theta/runtime/internal-error surface (error-model.md:74) — surfaceUnexpectedThrow returns undefined for a ThetaPanic`,
  ).toBeUndefined();
  return thrown as MissingObjectKeyPanic;
}

/**
 * The throw a probe produced, failing LOUDLY (with the value rendered) when it
 * produced a value instead. Used by the rows whose pre-fix disposition is
 * already a throw, so their red names the WRONG THROW CLASS rather than a leak.
 */
function thrownOf(probe: Probe, what: string): unknown {
  if (probe.kind === "value") {
    throw new Error(
      `${what} must throw; it produced ${probe.execution.outcome} with value ${describeValue(probe.execution.result.value)}`,
    );
  }
  return probe.thrown;
}

/** Assert a probe produced a value and return it (control rows). */
function valueOf(probe: Probe, what: string): ThetaValue | undefined {
  if (probe.kind === "threw") {
    throw new Error(
      `CONTROL BROKEN — ${what} must evaluate, but the runtime threw ${String(probe.thrown)}. An over-broad bug-0032 presence gate is the first suspect`,
    );
  }
  expect(probe.execution.outcome, `${what}: the body succeeds`).toBe("success");
  return probe.execution.result.value;
}

// ===========================================================================
// (a) M1–M9 — the direct read. M1 is the raw bind; M2/M3 are the in-language
// absence test answering backwards; M5/M6 rule out coercion to a falsy theta
// value; M7 shows `match` cannot catch it; M8/M9 show it is falsy in condition
// position (the reason the defect stays hidden); M4 shows two different absent
// names produce indistinguishable values.
// ===========================================================================

describe("bug 0032 (a) — a direct absent-member read panics instead of binding an out-of-model value", () => {
  it("RED (a1, row M1): `o.definitely_absent` is not a final value", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent"), {
      key: "definitely_absent",
      what: "`o.definitely_absent` as the theta's final value",
      leak: "undefined",
    });
  });

  it("RED (a2, row M2): `o.definitely_absent == null` does not answer `false`", async () => {
    // The idiom an author writes for "did this come through?". `==` is
    // `valuesEqual` structural equality whose primitive arm ends at `a === b`,
    // and `undefined === null` is `false`, so the check reports "present".
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent == null"), {
      key: "definitely_absent",
      what: "`o.definitely_absent == null`",
      leak: "false",
    });
  });

  it("RED (a3, row M3): `o.definitely_absent != null` does not answer `true`", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent != null"), {
      key: "definitely_absent",
      what: "`o.definitely_absent != null`",
      leak: "true",
    });
  });

  it("RED (a4, row M4): two distinct absent names do not compare equal — the FIRST read panics, naming itself", async () => {
    // `absent_a`, not `absent_b`: `==` "evaluates left-then-right"
    // (statement-executor.ts's `evalBinary` docstring), so the left read panics
    // before the right is evaluated. The key in the message is what makes the
    // panic diagnostic — today the value carries no information about which
    // read produced it.
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.absent_a == o.absent_b"), {
      key: "absent_a",
      what: "`o.absent_a == o.absent_b`",
      leak: "true",
    });
  });

  it('RED (a5, row M5): `o.definitely_absent == ""` does not answer `false`', async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + 'o.definitely_absent == ""'), {
      key: "definitely_absent",
      what: '`o.definitely_absent == ""` (ruling out coercion to the empty string)',
      leak: "false",
    });
  });

  it("RED (a6, row M6): `o.definitely_absent == false` does not answer `false`", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent == false"), {
      key: "definitely_absent",
      what: "`o.definitely_absent == false` (ruling out coercion to `false`)",
      leak: "false",
    });
  });

  it("RED (a7, row M7): a `match` over the read does not fall through to `_`", async () => {
    // The `null` pattern does not bind the value, so `match` cannot catch the
    // absence either. Post-fix the panic propagates past `match` by
    // construction (a panic is a thrown exception, error-model.md's §Runtime
    // panics), so the scrutinee never reaches an arm.
    assertMissingKeyPanic(
      await probeSource(
        OBJECT_FIXTURE + 'match o.definitely_absent {\n  null => "n",\n  _ => "other"\n}',
      ),
      {
        key: "definitely_absent",
        what: "`match o.definitely_absent { null => …, _ => … }`",
        leak: '"other"',
      },
    );
  });

  it('RED (a8, row M8): `o.definitely_absent ? "t" : "f"` does not answer the false branch', async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + 'o.definitely_absent ? "t" : "f"'), {
      key: "definitely_absent",
      what: '`o.definitely_absent ? "t" : "f"`',
      leak: '"f"',
    });
  });

  it("RED (a9, row M9): `!o.definitely_absent` does not answer `true`", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "!o.definitely_absent"), {
      key: "definitely_absent",
      what: "`!o.definitely_absent`",
      leak: "true",
    });
  });
});

// ===========================================================================
// (b) N1–N4 — position dependence. The two identifier reads coerce
// (`resolution.value ?? null` at production-theta-producer.ts and
// lexical-environment.ts), so today the same read tests as `null` once a
// binding or a parameter slot sits in between. Bug 0032 §Fix keeps both
// coercions and removes the feeder: the panic fires at the READ, so no binding
// position can launder it. N2/N3 are already `true` today — they are here
// because they must STAY reachable observables of the panic, and N4 is the
// statically unresolvable receiver that proves the gate is total.
// ===========================================================================

describe("bug 0032 (b) — the panic fires at the read, so no binding position launders it", () => {
  it("RED (b1, row N1): `let a = o.definitely_absent` panics at the RHS, so `a` never binds", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "let a = o.definitely_absent\na"), {
      key: "definitely_absent",
      what: "`let a = o.definitely_absent` then reading `a` back (the `?? null` coercion turns the bind into `null` today)",
      leak: "null",
    });
  });

  it("RED (b2, row N2): `let a = …` then `a == null` never reaches the comparison", async () => {
    // This row is `true` at HEAD, so it would go GREEN against an unfixed
    // runtime if it asserted only "tests as null" — the bug's §Fix names it
    // explicitly ("a regression test must probe the *direct* read position").
    // Asserting the PANIC instead keeps it red for the right reason: the panic
    // must pre-empt the coercion, not agree with it.
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "let a = o.definitely_absent\na == null"),
      {
        key: "definitely_absent",
        what: "`let a = o.definitely_absent` then `a == null`",
        leak: "true",
      },
    );
  });

  it("RED (b3, row N3): passing the read as an argument panics before the call", async () => {
    assertMissingKeyPanic(
      await probeSource(
        OBJECT_FIXTURE + "fn h(p) {\n  return p == null\n}\nh(o.definitely_absent)",
      ),
      {
        key: "definitely_absent",
        what: "`fn h(p) { return p == null }` applied to `o.definitely_absent`",
        leak: "true",
      },
    );
  });

  it("RED (b4, row N4): the read INSIDE an unannotated `fn` body panics too — a statically unresolvable receiver is still gated", async () => {
    // The receiver is laundered through an unannotated parameter, so
    // `checkMemberAccess` classifies it `"unknown"` and defers exactly as it
    // does for `"object"`. There is no intervening binding of the member value,
    // so no `?? null` coercion applies and the leak is visible: `false`. The
    // bug's §Fix requires this row ("keep N4's laundered receiver so the gate is
    // proven total over statically unresolvable receivers"). Note the theta
    // scoping rule: `o` is passed in, because a body-level `let` is not visible
    // inside an `fn` body.
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "fn k(p) {\n  return p.nope == null\n}\nk(o)"),
      {
        key: "nope",
        what: "`fn k(p) { return p.nope == null }` applied to `o`",
        leak: "false",
      },
    );
  });
});

// ===========================================================================
// (c) P1–P11 — the spread. Bug 0032 §Expected: "No theta expression can produce
// a value outside `ThetaValue`, so P1–P11 lose their input". Each row is a
// distinct downstream consumer of the out-of-model value; each must instead
// never receive one.
// ===========================================================================

describe("bug 0032 (c) — the out-of-model value loses every downstream consumer", () => {
  it("RED (c1, row P1): a chained member read panics at the FIRST read, not with a raw TypeError", async () => {
    // At HEAD the JS property read at the second link throws
    // `TypeError: Cannot read properties of undefined (reading 'deeper')`,
    // which the runtime-defect surface reclassifies as
    // theta/runtime/internal-error and reports to the operator as an
    // interpreter message. The located panic naming the key belongs one link
    // EARLIER. Asserting the surface first makes the red name the
    // mislabelling.
    const probe = await probeSource(OBJECT_FIXTURE + "o.definitely_absent.deeper");
    const thrown = thrownOf(probe, "`o.definitely_absent.deeper`");
    const diag = surfaceUnexpectedThrow(thrown, SITE) as Diagnostic | undefined;
    expect(
      diag === undefined ? "not a runtime defect (a panic)" : `${diag.code}: ${diag.message}`,
      "bug 0032 §Why it matters: a chained read must not abort the theta through the runtime-defect surface — the first read is the located panic",
    ).toBe("not a runtime defect (a panic)");
    assertMissingKeyPanic(probe, {
      key: "definitely_absent",
      what: "`o.definitely_absent.deeper` (the FIRST read is the panic)",
    });
  });

  it("RED (c2, row P2): a chained index read panics at the FIRST read, not through the non-object-receiver guard", async () => {
    // At HEAD `undefined` reaches `evaluateIndexAccess`'s receiver guard, which
    // classifies it outside the bug-0027 registered `<receiver kind>` set and
    // therefore raises the pre-0027 raw `Error` → theta/runtime/internal-error
    // (that arm is documented as reachable *because of this bug*:
    // `nonObjectReceiverRejection`'s docstring cites 0032 by name). Post-fix
    // the member read panics first and the arm loses this feeder.
    const probe = await probeSource(OBJECT_FIXTURE + 'o.definitely_absent["k"]');
    const thrown = thrownOf(probe, '`o.definitely_absent["k"]`');
    const diag = surfaceUnexpectedThrow(thrown, SITE) as Diagnostic | undefined;
    expect(
      diag === undefined ? "not a runtime defect (a panic)" : `${diag.code}: ${diag.message}`,
      "bug 0032 §Why it matters: the index guard must never see an out-of-model receiver — the member read one link earlier is the located panic",
    ).toBe("not a runtime defect (a panic)");
    assertMissingKeyPanic(probe, {
      key: "definitely_absent",
      what: '`o.definitely_absent["k"]` (the FIRST read is the panic)',
    });
  });

  it("RED (c3, row P3): `o.definitely_absent.keys()` does not answer the stdlib inert `null`", async () => {
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent.keys()"), {
      key: "definitely_absent",
      what: "`o.definitely_absent.keys()` (the stdlib dispatch's inert-`null` fallthrough)",
      leak: "null",
    });
  });

  it('RED (c4, row P4): `"v=" + o.definitely_absent` does not put the text `undefined` in a theta string', async () => {
    // The wire-facing consequence: any prompt built from this string carries
    // the literal text `undefined` to the model.
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + '"v=" + o.definitely_absent'), {
      key: "definitely_absent",
      what: '`"v=" + o.definitely_absent`',
      leak: '"v=undefined"',
    });
  });

  it("RED (c5, row P5): `o.definitely_absent + 1` does not answer `NaN`", async () => {
    // `JSON.stringify(NaN)` is `null`, so the leak is declared as `"null"` and
    // the failure text carries the `String(…)` form — see `describeValue`.
    assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.definitely_absent + 1"), {
      key: "definitely_absent",
      what: "`o.definitely_absent + 1`",
      leak: "null",
    });
  });

  it("RED (c6, row P6): a constructor cannot store the value — `q.keys()` is never reached", async () => {
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "let q = F { x: o.absent }\nq.keys()"),
      {
        key: "absent",
        what: "`let q = F { x: o.absent }` then `q.keys()`",
        leak: '["x"]',
      },
    );
  });

  it('RED (c7, row P7): `q.has("x")` is never reached', async () => {
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + 'let q = F { x: o.absent }\nq.has("x")'),
      {
        key: "absent",
        what: '`let q = F { x: o.absent }` then `q.has("x")`',
        leak: "true",
      },
    );
  });

  it("RED (c8, row P8): `q.x == null` is never reached", async () => {
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "let q = F { x: o.absent }\nq.x == null"),
      {
        key: "absent",
        what: "`let q = F { x: o.absent }` then `q.x == null` (a stored out-of-model field that does not test as `null`)",
        leak: "false",
      },
    );
  });

  it("RED (c9, row P9): `q == F { x: 1 }` is never reached", async () => {
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "let q = F { x: o.absent }\nq == F { x: 1 }"),
      {
        key: "absent",
        what: "`let q = F { x: o.absent }` then `q == F { x: 1 }` (a schema value unequal to its well-formed counterpart)",
        leak: "false",
      },
    );
  });

  it("RED (c10, row P10): an array round-trip is never reached — array indexing has no `?? null`", async () => {
    assertMissingKeyPanic(
      await probeSource(OBJECT_FIXTURE + "let arr = [o.absent]\narr[0] == null"),
      {
        key: "absent",
        what: "`let arr = [o.absent]` then `arr[0] == null`",
        leak: "false",
      },
    );
  });

  it("RED (c11, row P11): the read panics BEFORE bug 0019's `?` operand guard", async () => {
    // At HEAD the out-of-model value reaches the `?` unwrap and bug 0019's
    // fail-closed guard describes it as "a undefined" — derivative evidence
    // cited by the bug's §Reproduction. Post-fix the guard never sees it, so
    // the disposition is the panic, NOT QuestionOperandDefectError. Asserting
    // the negative first makes the red state exactly that claim rather than
    // reporting a generic wrong-class throw.
    const probe = await probeSource(OBJECT_FIXTURE + "o.definitely_absent?");
    const thrown = thrownOf(probe, "`o.definitely_absent?`");
    expect(
      thrown,
      `bug 0032 §Expected: "P11 raises it before reaching bug 0019's \`?\` guard" — the operand never becomes an out-of-model value, so bug 0019's defect error is unreachable from this source. Thrown: ${String(thrown)}`,
    ).not.toBeInstanceOf(QuestionOperandDefectError);
    assertMissingKeyPanic(probe, {
      key: "definitely_absent",
      what: "`o.definitely_absent?`",
    });
  });
});

// ===========================================================================
// (d) The 0036-coordination parity claim: one key space, one message. bug 0032
// §Fix — "`missing object key: <key>` renders identically for `o.absent` and
// `o["absent"]`". Bug 0036 landed the single `<key>` interpolation point
// (`renderSourceDerived`) that both spellings must ride on after this fix;
// this group is the pin that they do. It does NOT restate 0036's quoting
// vectors — the key here is identifier-shaped and renders bare.
// ===========================================================================

describe("bug 0032 (d) — the member and index spellings of one absent name render the same bytes", () => {
  it("RED (d1): `o.parity_key` renders byte-identically to `o[\"parity_key\"]`", async () => {
    const indexProbe = await probeSource(OBJECT_FIXTURE + 'o["parity_key"]');
    const indexMessage = (
      thrownOf(indexProbe, '`o["parity_key"]` (the index spelling — a control)') as Error
    ).message;
    expect(
      indexMessage,
      "CONTROL (green before and after): the index spelling already renders the registered template with the bare identifier-shaped key",
    ).toBe(missingKeyMessage("parity_key"));
    const memberPanic = assertMissingKeyPanic(await probeSource(OBJECT_FIXTURE + "o.parity_key"), {
      key: "parity_key",
      what: "`o.parity_key` (the member spelling of the same absent name)",
      leak: "undefined",
    });
    expect(
      memberPanic.message,
      'bug 0032 §Fix: the two spellings are "two spellings of one read over one key space" (expressions.md:10) and must not drift — one interpolation point, one byte string',
    ).toBe(indexMessage);
  });
});

// ===========================================================================
// (e) CONTROLS — green NOW and green AFTER. C1–C5 are the bug's own controls;
// the last three are the behaviours bug 0032 §Fix mandates the gate preserve
// ("Three behaviours the gate must preserve, each with a control in the test").
// An over-broad gate — one that breaks the index panic, `has`, `keys()`,
// present fields, enum-variant resolution, `length` on a string or array
// receiver, or the `null`-guard ORDER — reds here immediately.
// ===========================================================================

describe("bug 0032 (e) — controls: the other read surfaces, and the three behaviours the gate must preserve", () => {
  it("CONTROL (e1, row C1): `o[\"definitely_absent\"]` keeps its panic, byte-exact", async () => {
    const probe = await probeSource(OBJECT_FIXTURE + 'o["definitely_absent"]');
    const thrown = thrownOf(probe, '`o["definitely_absent"]`');
    expect(
      thrown,
      "the index spelling is the disposition bug 0032 extends to the member spelling; it must survive the extension unchanged",
    ).toBeInstanceOf(MissingObjectKeyPanic);
    expect(isThetaPanic(thrown), "error-model.md:71 — one of the six closed panic sources").toBe(
      true,
    );
    expect((thrown as { readonly code: string }).code).toBe(MISSING_OBJECT_KEY_CODE);
    expect((thrown as Error).message, "the registered template, `<key>` bare").toBe(
      missingKeyMessage("definitely_absent"),
    );
  });

  it('CONTROL (e2, row C2): `o.has("definitely_absent")` stays `false` — the explicit safe-check', async () => {
    // expressions.md:120. The gate is what this safe-check exists to be safe
    // AGAINST; a gate that made `has` panic would destroy the only way to ask
    // about a name without raising.
    expect(
      valueOf(await probeSource(OBJECT_FIXTURE + 'o.has("definitely_absent")'), "o.has(absent)"),
      "expressions.md:120 — `has(k)` returns `false` for unknown keys, no panic",
    ).toBe(false);
  });

  it("CONTROL (e3, row C3): `o.keys()` stays `[\"x\"]`", async () => {
    expect(
      valueOf(await probeSource(OBJECT_FIXTURE + "o.keys()"), "o.keys()"),
      "the absent name is not in the object's key set, and `keys()` still reports the theta-side names",
    ).toEqual(["x"]);
  });

  it("CONTROL (e4, row C4): `o.x` stays `1` — a PRESENT field still reads", async () => {
    // The present-field control. `hasOwnProperty` admits `x`, so the gate must
    // be invisible here; this is the row an over-broad gate breaks first.
    expect(valueOf(await probeSource(OBJECT_FIXTURE + "o.x"), "o.x"), "the present-field read").toBe(
      1,
    );
  });

  it("CONTROL (e5, row C5): `F { }` stays a PARSE rejection — a schema value always carries its declared fields", async () => {
    // C5 bounds the reachable input class: the only route to an absent name is
    // a name that was never declared (a typo, a rename, or a laundered
    // receiver), never a declared field left unset.
    const doc = parseOnly("bug0032-c5.theta", FM + "schema F { x: integer }\nlet m = F { }\nm");
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    expect(
      errors.map((d) => d.code),
      "expressions.md:209 — object construction requires every declared field",
    ).toContain("theta/parse/missing-object-field");
    expect(
      errors.find((d) => d.code === "theta/parse/missing-object-field")?.message,
      "the registered parse message names the field and the schema",
    ).toBe("missing field 'x' on schema 'F'");
  });

  it("CONTROL (e6, §Fix behaviour (i)): `Enum.Variant` resolution never reaches the gate", async () => {
    // Both hosts resolve an enum variant BEFORE the member read and return, so
    // `Sev.High` must not be read as an absent member on the enum carrier. The
    // probes are `==` comparisons rather than the value itself: the enum's
    // in-memory shape is non-normative (runtime-value-model.md §Reference
    // encoding), so equality is the observable the spec licenses.
    expect(
      valueOf(await probeSource(ENUM_FIXTURE + "let e = Sev.High\ne == Sev.High"), "Sev.High"),
      "the variant resolves and compares equal to itself",
    ).toBe(true);
    expect(
      valueOf(await probeSource(ENUM_FIXTURE + "Sev.High == Sev.Low"), "Sev.High == Sev.Low"),
      "cross-variant inequality — the resolution is real, not a degenerate true",
    ).toBe(false);
    expect(
      valueOf(
        await probeSource(ENUM_FIXTURE + "fn pick(v) {\n  return v == Sev.High\n}\npick(Sev.High)"),
        "Sev.High inside an `fn` body",
      ),
      "the variant resolves inside a function body too",
    ).toBe(true);
    // The unknown-variant disposition is a PARSE rejection, so the gate is not
    // the enum surface's answer for a bad variant name either.
    const doc = parseOnly("bug0032-e6.theta", FM + ENUM_FIXTURE + "Sev.Nope");
    expect(
      doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
      "an unknown variant is rejected statically; the runtime presence gate must not become its disposition",
    ).toContain("theta/parse/unknown-variant");
  });

  it("CONTROL (e7, §Fix behaviour (ii)): `length` keeps working on `string` and `array` receivers, including laundered", async () => {
    // Both receivers reach `evaluateMemberAccess` and `length` is an own
    // property of both, so a `hasOwnProperty` presence gate admits it. The
    // laundered pair is the important half: an unannotated `fn` parameter is
    // the input class with no static receiver type, which is exactly where a
    // gate keyed on "is this an object value" would over-reach.
    expect(
      valueOf(await probeSource('"hi".length'), '"hi".length'),
      "expressions.md declares `length` on `string`",
    ).toBe(2);
    expect(
      valueOf(await probeSource('fn len(p) {\n  return p.length\n}\nlen("hi")'), "laundered string"),
      "a `string` receiver laundered through an unannotated `fn` parameter still answers 2",
    ).toBe(2);
    expect(
      valueOf(await probeSource("let a = [1, 2]\na.length"), "[1, 2].length"),
      "expressions.md declares `length` on `array`",
    ).toBe(2);
    expect(
      valueOf(await probeSource("fn len(p) {\n  return p.length\n}\nlen([1, 2])"), "laundered array"),
      "an `array` receiver laundered through an unannotated `fn` parameter still answers 2",
    ).toBe(2);
  });

  it("CONTROL (e8, §Fix behaviour (iii)): a `null` receiver keeps `NullMemberAccessPanic` — guard ORDER", async () => {
    // The new gate sits AFTER the `null` guard, matching the index path's
    // ordering. A gate placed first would reclassify `null.field` from
    // theta/runtime/null-member-access (error-model.md:69) to
    // missing-object-key, silently retiring a distinct entry from the closed
    // list. `null` is laundered through an unannotated parameter because a
    // statically resolvable `null` receiver is rejected earlier.
    const probe = await probeSource("fn f(x) {\n  return x.field\n}\nf(null)");
    const thrown = thrownOf(probe, "`fn f(x) { return x.field }` applied to `null`");
    expect(
      thrown,
      `the null guard runs FIRST, so a null receiver keeps its own panic class. Thrown: ${String(thrown)}`,
    ).toBeInstanceOf(NullMemberAccessPanic);
    expect((thrown as { readonly code: string }).code, "error-model.md:69's own entry").toBe(
      NULL_MEMBER_ACCESS_CODE,
    );
    expect((thrown as Error).message, "the registered `null member access: .<field>` template").toBe(
      "null member access: .field",
    );
  });

  it("CONTROL (e9): the registry row this file interpolates still carries `missing object key: <key>` (DIAG-4)", async () => {
    // The *Message* column is the oracle for every expected string above, and
    // bug 0032 §Fix edits only the row's *Trigger*. A drift here would turn
    // the reds above into meaningless comparisons.
    expect(
      registryMessage(REGISTRY, MISSING_OBJECT_KEY_CODE),
      "code-registry-runtime.md:17 — the Message column is untouched by bug 0032's §Fix (the Trigger column widens instead, a DIAG-2 spec change)",
    ).toBe(REGISTERED_TEMPLATE);
    expect(missingKeyMessage("definitely_absent")).toBe("missing object key: definitely_absent");
  });
});
