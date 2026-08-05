import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
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
import { surfaceUnexpectedThrow } from "../src/runtime/runtime-panics";
import type { ThetaValue } from "../src/runtime/value";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { Checkpoint } from "../src/seams/checkpoint";

// Bug 0125, the runtime disposition — the three rows that prove the fix removes
// a RUNTIME outcome rather than merely adding a diagnostic
// (docs/bugs/0125-index-element-narrowing-not-alias-unfolded.md §Reproduction
// (e)).
//
// WHAT THIS FILE ADDS OVER THE PARSE WITNESS. Every erased code in
// tests/index-element-alias-unfolded.test.ts is `E` severity, and
// `parseDiscoveredTheta` (src/extension/production-composition.ts:2079, the
// guard at `:2092`) drops any theta carrying an error-severity `theta/load/*` or
// `theta/parse/*` diagnostic. With nothing emitted, nothing is dropped: the
// slash command installs and the body reaches the runtime. So this defect does
// not lose a warning, it admits an illegal theta — and the three rows below are
// what it does once admitted:
//
//   e1  `xs[0].frobnicate()` on an alias-typed `array<string>` aborts with
//       `theta/runtime/internal-error: internal error: unknown string stdlib
//       member: frobnicate` — a runtime-defect-surface code carrying an internal
//       string, which docs/spec_topics/expressions.md:122 states this input does
//       NOT get ("Anything not on this list is `theta/parse/unknown-method`
//       rather than a runtime failure").
//   e3  `array<integer>.join(",")` through an alias returns `"1,2"` — the
//       implicit conversion docs/spec_topics/expressions.md:108 says theta 1.0
//       does not perform, and which src/runtime/stdlib-array.ts:63–65 states
//       cannot reach it ("the parse-time `checkArrayJoin` precondition
//       guarantees a `string` element type, so no implicit conversion happens
//       here").
//   e5  a `number` reaches an `integer`-annotated binding and emerges as `1.5`.
//
// THE ASSERTED CONTRACT is the registration decision, not the runtime value. A
// theta whose parse carries an error-severity `theta/parse/*` diagnostic never
// reaches `executeBody` in production, so pinning the runtime value post-fix
// would pin an unreachable path. Each row therefore asserts BOTH halves of the
// registration argument — the expected code list, and that the code list blocks
// registration — and carries the measured runtime disposition into its failure
// message, so a red names the outcome the fix removes.
//
// SPEC ANCHORS:
//   - docs/spec_topics/type-system.md:54 TYPE-11 — a `NamedType` declared by a
//     type-alias schema is transparent, "recursing through nested aliases until
//     a non-alias form is reached", so `L` declared `array<string>` has element
//     type `string`.
//   - docs/spec_topics/expressions.md:122 — an unexposed member is
//     `theta/parse/unknown-method` "rather than a runtime failure" (e1).
//   - docs/spec_topics/expressions.md:108 (`array<T>` stdlib table, `join` row)
//     — "Element type must be `string`; non-string element types are
//     `theta/parse/non-string-array-join` (no implicit type conversion in theta
//     1.0)" (e3).
//   - docs/spec_topics/errors-and-results/error-model.md:74 — the runtime-defect
//     surface and `theta/runtime/internal-error`, which is the framing e1's
//     plain `Error` from `evaluateStringMember`'s `default` arm
//     (src/runtime/stdlib-string.ts:105) reaches through `surfaceUnexpectedThrow`
//     (src/runtime/runtime-panics.ts:496). That framing is correct for an
//     unexpected throw; the defect is that this input reaches it.
//   - docs/spec_topics/diagnostics/diagnostic-shape.md:72 DIAG-2 — the registry
//     is closed, and this fix engages no registry change: all three codes are
//     already registered (`theta/parse/unknown-method`
//     code-registry-parse.md:63, `theta/parse/non-string-array-join` `:43`,
//     `theta/parse/integer-narrowing` `:24`), all three `E`, and each *Trigger*
//     already covers the receiver it fires from.
//
// RED / GREEN LEDGER, stated against the settled §Fix — computing
// `unfoldAlias(target, env)` at src/parser/static-type-inference.ts:248–249 and
// testing the unfolded value's `kind`. Reverting the unfold reds e1, e3 and e5,
// both halves of each (the parse reports `[]`, so registration is not blocked);
// x1 and x2, the anti-vacuity controls, hold under that neutralisation.
//
// ANTI-VACUITY. The three rows assert an absence turning into a presence, so on
// a harness that stopped parsing — or stopped reaching `executeBody` — they
// would be red under the neutralisation for the wrong reason and would go green
// with the unfold in place for the wrong reason. x1 and x2 close that: both drive the same harness
// end to end and assert a `success` outcome with an exact `BodyExecution.result`
// payload, so a broken parse, bind or execute step reds them. x2 uses the ALIAS
// spelling on a defect-free body, so it also pins that the fix does not
// over-reject the route it repairs.
//
// TIER: unit, offline, deterministic, provider-free. No model, no provider, no
// child process: `bindPromptConversation` is driven with an inert
// `ExtensionCommandContext`, and every body is query-free, so nothing dispatches
// a completion. An integration tier would add a session round-trip without
// reaching a different seam; a live tier would make a fully determined
// observable stochastic.
//
// NO SILENT SKIPPING: nothing here early-returns, branches on the environment,
// or conditionally skips. A throw out of `executeBody` is captured and reported
// as a disposition, never swallowed.

// ===========================================================================
// Parse + production-executor harness. The shape is
// tests/non-object-receiver-gate.test.ts:186–292 — parseThetaDocument →
// createProductionProducerDeps → bindPromptConversation → executeBody, with a
// throw framed through `surfaceUnexpectedThrow`. It differs in one respect: that
// file's `parseTheta` refuses an error-severity diagnostic, because every
// fixture there is parse-clean by construction. Here the parse diagnostics ARE
// the assertion, so the parse is inspected rather than gated.
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

const FM = "---\nmode: prompt\n---\n";

/** The site `surfaceUnexpectedThrow` frames a throw against (the ZERO body range). */
const SITE = {
  file: "bug0125.theta",
  range: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  },
};

/**
 * Whether `diagnostics` blocks registration. This replicates `hasLoadParseError`
 * (src/extension/production-composition.ts:2045–2052) by construction: that
 * function is module-private — `rg -n 'export.*hasLoadParseError' src/` matches
 * nothing — so it cannot be imported, and the predicate is mirrored here
 * instead. Its three clauses are the whole of the original: error severity, and
 * a code in the `theta/load/` or `theta/parse/` namespace.
 * `parseDiscoveredTheta` applies it at `:2092` and drops the theta.
 */
function blocksRegistration(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" &&
      (diagnostic.code.startsWith("theta/load/") ||
        diagnostic.code.startsWith("theta/parse/")),
  );
}

/** One row's measurement: what the parse said, and what the runtime then did. */
interface Row {
  readonly diagnostics: readonly Diagnostic[];
  readonly codes: readonly string[];
  /** The runtime disposition, rendered for a failure message. */
  readonly runtime: string;
  /** The settled execution, absent when the runtime threw. */
  readonly execution: BodyExecution | undefined;
}

/**
 * Parse a self-contained query-free prompt-mode source and drive it through the
 * production executor, capturing both channels. A raw non-panic throw propagates
 * out of `executeBody` uncaught (the framing that reclassifies it lives one
 * layer up), so it is caught here and rendered through the same
 * `surfaceUnexpectedThrow` the production surface uses.
 */
async function measure(src: string): Promise<Row> {
  const doc = parseOnly("bug0125.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0125",
    sourcePath: "/theta/bug0125.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  const codes = doc.diagnostics.map((d: Diagnostic) => d.code);
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return {
      diagnostics: doc.diagnostics,
      codes,
      runtime: `outcome=${execution.outcome} result=${JSON.stringify(execution.result)}`,
      execution,
    };
  } catch (thrown) {
    const diag = surfaceUnexpectedThrow(thrown, SITE);
    return {
      diagnostics: doc.diagnostics,
      codes,
      runtime: `THREW ${String(diag?.code)}: ${String(diag?.message)}`,
      execution: undefined,
    };
  }
}

/** The settled execution, failing loudly when the runtime threw instead. */
function executionOf(row: Row, what: string): BodyExecution {
  if (row.execution === undefined) {
    throw new Error(
      `CONTROL BROKEN — ${what} must execute, but the runtime produced ${row.runtime}. A parse, bind or execute step of this harness is the first suspect`,
    );
  }
  return row.execution;
}

/** The final value the body produced, for a control's payload assertion. */
function valueOf(execution: BodyExecution): ThetaValue | undefined {
  return execution.result.value;
}

// ===========================================================================
// (e) The three runtime outcomes the fix removes by refusing registration.
// ===========================================================================

describe("0125 (e) — an alias-typed array's element defect is refused at parse, so it never reaches the runtime", () => {
  it("e1: `xs[0].frobnicate()` through an alias is a parse rejection, not a runtime abort", async () => {
    // expressions.md:122 states the disposition in terms: an unexposed member is
    // `theta/parse/unknown-method` "rather than a runtime failure". Without the
    // unfold the parse is clean and the runtime failure is what arrives — the
    // erased rejection reappearing as an interpreter message on a session
    // channel rather than at the offending source span.
    const row = await measure(
      'schema L = array<string>\nfn f(xs: L) {\n  let y = xs[0]\n  y.frobnicate()\n}\nlet z = f(["a"])\nz',
    );
    expect(
      row.codes,
      `expressions.md:122 — the element of an alias-typed \`array<string>\` is a \`string\`, so \`frobnicate\` is refused at parse. Measured runtime disposition: ${row.runtime}`,
    ).toEqual(["theta/parse/unknown-method"]);
    expect(
      blocksRegistration(row.diagnostics),
      `code-registry-parse.md:63 severity E — an error-severity \`theta/parse/*\` diagnostic drops the theta at parseDiscoveredTheta (production-composition.ts:2092), so the slash command is never installed and the body never runs. Measured runtime disposition: ${row.runtime}`,
    ).toBe(true);
  });

  it("e3: `xs[0].join(\",\")` on an alias of `array<array<integer>>` is a parse rejection, not a coercion", async () => {
    // expressions.md:108 states there is no implicit type conversion in theta
    // 1.0, and src/runtime/stdlib-array.ts:63–65 records that the parse-time
    // `checkArrayJoin` precondition is what makes the unconditional
    // `receiver.join(...)` at `:67` safe. Without the unfold the precondition
    // never runs and the coercion happens.
    const row = await measure(
      'schema L = array<array<integer>>\nfn f(xs: L): string {\n  xs[0].join(",")\n}\nlet z = f([[1, 2]])\nz',
    );
    expect(
      row.codes,
      `expressions.md:108 \`join\` row — a non-string element type is refused at parse, with no implicit conversion. Measured runtime disposition: ${row.runtime}`,
    ).toEqual(["theta/parse/non-string-array-join"]);
    expect(
      blocksRegistration(row.diagnostics),
      `code-registry-parse.md:43 severity E — the theta is dropped before registration, so the JS coercion is unreachable. Measured runtime disposition: ${row.runtime}`,
    ).toBe(true);
  });

  it("e5: a `number` element copied into an `integer` binding is a parse rejection", async () => {
    // The `integer → number` widening is one-way (code-registry-parse.md:24
    // trigger). Without the unfold the copy is admitted and the fractional value
    // flows out of the `integer`-annotated binding as the theta's final value.
    const row = await measure(
      "schema L = array<number>\nfn f(xs: L) {\n  let m: integer = xs[0]\n  m\n}\nlet z = f([1.5])\nz",
    );
    expect(
      row.codes,
      `code-registry-parse.md:24 trigger — a \`number\` value where \`integer\` is expected. Measured runtime disposition: ${row.runtime}`,
    ).toEqual(["theta/parse/integer-narrowing"]);
    expect(
      blocksRegistration(row.diagnostics),
      `code-registry-parse.md:24 severity E — the theta is dropped before registration, so no fractional value is delivered from an \`integer\` binding. Measured runtime disposition: ${row.runtime}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (x) Anti-vacuity controls — green with and without the unfold. Without them
//     the three rows above could pass on a harness that never reached
//     `executeBody`.
// ===========================================================================

describe("0125 (x) — controls: the harness parses, binds and executes a defect-free body", () => {
  it("x1: a concrete `array<array<string>>` join registers and returns the joined string", async () => {
    // The concrete spelling of e3's body with a `string` element, so the `join`
    // precondition holds and the runtime path e3 must stop reaching is exercised
    // here on an input the spec admits.
    const row = await measure(
      'fn f(xs: array<array<string>>): string {\n  xs[0].join(",")\n}\nlet z = f([["a", "b"]])\nz',
    );
    expect(row.codes, "expressions.md:108 `join` row — a `string` element type is admissible").toEqual(
      [],
    );
    expect(
      blocksRegistration(row.diagnostics),
      "with no error-severity load / parse diagnostic there is nothing for the registration guard to act on",
    ).toBe(false);
    const execution = executionOf(row, "the concrete-array join");
    expect(execution.outcome, "the body reaches its final value").toBe("success");
    expect(
      valueOf(execution),
      "the harness drives the production executor end to end, so the three (e) rows cannot pass on a dead harness",
    ).toBe("a,b");
  });

  it("x2: an ALIAS-typed array with a defect-free body registers and returns its element", async () => {
    // The route the fix repairs, on a body with nothing to reject: the element
    // read is returned as the declared `string`. Green with and without the
    // unfold: without it the sentinel is unresolvable and the return check
    // defers; with it the element unfolds to `string` and the check passes. A
    // fix that over-rejected the alias route — refusing what TYPE-11 admits —
    // reds here.
    const row = await measure(
      'schema L = array<string>\nfn f(xs: L): string {\n  xs[0]\n}\nlet z = f(["a", "b"])\nz',
    );
    expect(
      row.codes,
      "TYPE-11 — an alias of `array<string>` has element type `string`, which is the declared return type",
    ).toEqual([]);
    expect(
      blocksRegistration(row.diagnostics),
      "the alias route must keep registering when the body has no defect",
    ).toBe(false);
    const execution = executionOf(row, "the alias-typed defect-free body");
    expect(execution.outcome, "the body reaches its final value").toBe("success");
    expect(
      valueOf(execution),
      "the element read delivers the first element, so the alias route executes as the concrete one does",
    ).toBe("a");
  });
});
