import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  evaluateIndexAccess,
  evaluateMemberAccess,
  enterInvokeFrame,
  evaluateQuestion,
  surfaceUnexpectedThrow,
  isLoomPanic,
  HostFatal,
  IndexOutOfBoundsPanic,
  MissingObjectKeyPanic,
  NullIndexAccessPanic,
  NullMemberAccessPanic,
  InvokeDepthExceededPanic,
  INDEX_OUT_OF_BOUNDS_CODE,
  MISSING_OBJECT_KEY_CODE,
  NULL_INDEX_ACCESS_CODE,
  NULL_MEMBER_ACCESS_CODE,
  INVOKE_DEPTH_EXCEEDED_CODE,
  INTERNAL_ERROR_CODE,
} from "../src/runtime/runtime-panics";
import {
  evaluateMatch,
  MatchError,
  MATCH_ERROR_CODE,
  type MatchArm,
} from "../src/runtime/match-result";
import { makeOk, makeErr, type LoomValue } from "../src/runtime/value";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V4b-T — failing tests for the paired `V4b` "Runtime panics" implementation.
//
// Spec: errors-and-results.md, errors-and-results/error-model.md §"Runtime
// panics" (closure into invocation.md §"Invocation depth bound" for INV-4's
// `loom/runtime/invoke-depth-exceeded`, and hard-ceilings/
// ceiling-invariants-and-audit.md §"No additional ceilings" for the NOCEIL-3
// uncatchable-host-fatal carve-out).
//
//   - The six closed panic sources — `loom/runtime/index-out-of-bounds`,
//     `loom/runtime/missing-object-key`, `loom/runtime/null-index-access`,
//     `loom/runtime/null-member-access`, `loom/runtime/match-error`,
//     `loom/runtime/invoke-depth-exceeded` — each emit their registered message
//     template and bypass `?`/`match`.
//   - An unexpected thrown value surfaces as `loom/runtime/internal-error`.
//   - A host-fatal uncatchable condition (NOCEIL-3 carve-out) emits no
//     diagnostic at all — in particular no `loom/runtime/internal-error`.
//
// Per the *Diagnostic message anchors* rule every asserted message string is
// sourced from the diagnostics registry's *Message* column (via
// `registryMessage`) with its `<…>` placeholders filled per the placeholder-
// rendering categories, and every diagnostic code is cited inline.
//
// These tests red because the V4b panic surface is absent: the accessor seams
// (`evaluateIndexAccess`, `evaluateMemberAccess`, `enterInvokeFrame`) are inert
// stubs that raise nothing, `evaluateMatch`'s `MatchError` carries the V4a stub
// message (not the registered template), `evaluateQuestion` neither propagates
// an `Err` nor lets a panic through, and `surfaceUnexpectedThrow` returns a
// wrong-code sentinel for every input. Each obligation test reds on its own
// primary assertion, not on a compile error, a missing fixture, or a harness
// throw.

// The live four-page sharded diagnostics registry, read from the spec corpus —
// the single source of truth for every *Message* template (DIAG-4).
const REGISTRY_TEXT = [
  "code-registry-parse.md",
  "code-registry-load.md",
  "code-registry-runtime.md",
  "code-registry-host.md",
].map((page) =>
  readFileSync(
    fileURLToPath(
      new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url),
    ),
    "utf8",
  ),
).join("\n");

interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(REGISTRY_TEXT) as RegistryRow[];

/**
 * Source a code's registered *Message* template from the registry and fill its
 * `<…>` placeholders with the rendered values, per the *Diagnostic message
 * anchors* rule. The substituted values follow the diagnostics placeholder-
 * rendering categories (category 4 integers render as their shortest decimal;
 * the category-2 `<scrutinee summary>` of the integer 5 renders `5`; the
 * category-5 identifier-shaped `<key>`/`<field>` render bare).
 */
function expectedMessage(code: string, subs: Readonly<Record<string, string>>): string {
  let message = registryMessage(REGISTRY, code) as string;
  for (const [placeholder, value] of Object.entries(subs)) {
    message = message.replace(placeholder, value);
  }
  return message;
}

/** A throwaway located site for the runtime-defect surface. */
function site(): { file: string; range: SourceRange } {
  return {
    file: "test.loom",
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
  };
}

// The six closed panic sources, each with a trigger thunk, the panic class it
// raises, its registry code, and the registered message template filled with
// the offending values.
interface PanicCase {
  readonly name: string;
  readonly code: string;
  readonly panicClass: new (...args: never[]) => Error;
  /** Triggers the panic source; returns a `LoomValue` on the (untaken) no-panic path. */
  readonly trigger: () => LoomValue;
  readonly expected: string;
  /** Whether `match` (the construct) can structurally contain this source. */
  readonly matchBypassApplies: boolean;
}

const PANIC_CASES: readonly PanicCase[] = [
  {
    name: "loom/runtime/index-out-of-bounds",
    code: INDEX_OUT_OF_BOUNDS_CODE,
    panicClass: IndexOutOfBoundsPanic,
    trigger: () => evaluateIndexAccess(["a", "b", "c"], 5),
    expected: expectedMessage(INDEX_OUT_OF_BOUNDS_CODE, { "<i>": "5", "<length>": "3" }),
    matchBypassApplies: true,
  },
  {
    name: "loom/runtime/missing-object-key",
    code: MISSING_OBJECT_KEY_CODE,
    panicClass: MissingObjectKeyPanic,
    trigger: () => evaluateIndexAccess({ present: 1 }, "ghost"),
    expected: expectedMessage(MISSING_OBJECT_KEY_CODE, { "<key>": "ghost" }),
    matchBypassApplies: true,
  },
  {
    name: "loom/runtime/null-index-access",
    code: NULL_INDEX_ACCESS_CODE,
    panicClass: NullIndexAccessPanic,
    trigger: () => evaluateIndexAccess(null, 0),
    expected: expectedMessage(NULL_INDEX_ACCESS_CODE, { "<i>": "0" }),
    matchBypassApplies: true,
  },
  {
    name: "loom/runtime/null-member-access",
    code: NULL_MEMBER_ACCESS_CODE,
    panicClass: NullMemberAccessPanic,
    trigger: () => evaluateMemberAccess(null, "name"),
    expected: expectedMessage(NULL_MEMBER_ACCESS_CODE, { "<field>": "name" }),
    matchBypassApplies: true,
  },
  {
    name: "loom/runtime/match-error",
    code: MATCH_ERROR_CODE,
    panicClass: MatchError,
    // A scrutinee `5` matching no arm raises the non-exhaustive-`match` panic.
    trigger: () =>
      evaluateMatch(5, [
        { pattern: { kind: "literal", value: "x" }, body: () => "string-arm" },
      ] satisfies readonly MatchArm[]),
    expected: expectedMessage(MATCH_ERROR_CODE, { "<scrutinee summary>": "5" }),
    // `match-error` IS the `match` construct's own panic; its bypass-of-`match`
    // is intrinsic and already exercised by the V4a `match-result` suite. Here
    // it is exercised for `?`-bypass alongside the other five.
    matchBypassApplies: false,
  },
  {
    name: "loom/runtime/invoke-depth-exceeded",
    code: INVOKE_DEPTH_EXCEEDED_CODE,
    panicClass: InvokeDepthExceededPanic,
    // About to push the 33rd frame (one past the cap of 32) — INV-4.
    trigger: () => {
      enterInvokeFrame(33);
      return null;
    },
    expected: expectedMessage(INVOKE_DEPTH_EXCEEDED_CODE, { "<depth>": "33" }),
    matchBypassApplies: true,
  },
];

describe("V4b-T — the six closed panic sources emit their registered message templates", () => {
  for (const c of PANIC_CASES) {
    it(c.code + ": raises its panic carrying the registered message template", () => {
      let raised: unknown;
      try {
        c.trigger();
      } catch (e: unknown) {
        raised = e;
      }
      expect(
        raised,
        `${c.code}: the panic source raises a panic`,
      ).toBeInstanceOf(c.panicClass);
      expect((raised as { code: string }).code).toBe(c.code);
      // Message sourced from the diagnostics registry *Message* column (DIAG-4).
      expect((raised as Error).message).toBe(c.expected);
    });
  }
});

describe("V4b-T — panics bypass `?` (they are thrown, never a propagated `Err`)", () => {
  for (const c of PANIC_CASES) {
    it(c.code + ": a panic raised in a '?' operand propagates past '?', not as an Err", () => {
      // `evaluateQuestion` invokes the operand thunk; a panic thrown there
      // propagates unchanged (it does not become a `{ kind: "propagate" }`
      // outcome), so `?` is bypassed.
      expect(
        () => evaluateQuestion(c.trigger),
        c.code + ": the panic bypasses '?'",
      ).toThrow(c.panicClass);
    });
  }
});

describe("V4b-T — panics bypass `match` (a `match` arm body cannot contain them)", () => {
  for (const c of PANIC_CASES.filter((p) => p.matchBypassApplies)) {
    it(c.code + ": a panic raised in a 'match' arm body propagates past 'match'", () => {
      const arms: readonly MatchArm[] = [
        { pattern: { kind: "wildcard" }, body: () => c.trigger() },
      ];
      // Even a catch-all wildcard arm cannot capture a panic: it is not a value,
      // so it escapes the `match` rather than selecting an arm value.
      expect(
        () => evaluateMatch(0, arms),
        c.code + ": the panic bypasses 'match'",
      ).toThrow(c.panicClass);
    });
  }
});

describe("V4b-T — `?` propagation discrimination (the non-panic baseline)", () => {
  it("an `Ok(v)` operand yields the inner value", () => {
    expect(evaluateQuestion(() => makeOk(7))).toEqual({ kind: "value", value: 7 });
  });

  it("an `Err(e)` operand yields a propagate outcome carrying the error", () => {
    expect(evaluateQuestion(() => makeErr("boom"))).toEqual({
      kind: "propagate",
      err: "boom",
    });
  });
});

describe("V4b-T — unexpected throws surface as loom/runtime/internal-error", () => {
  it("loom/runtime/internal-error: an unexpected interpreter throw is classified as a runtime defect", () => {
    const thrown = new TypeError("boom");
    const diag = surfaceUnexpectedThrow(thrown, site());

    expect(
      diag,
      "loom/runtime/internal-error: an unexpected throw produces a diagnostic",
    ).toBeDefined();
    expect(diag?.code).toBe(INTERNAL_ERROR_CODE);
    expect(diag?.severity).toBe("error");
    // Message from the diagnostics registry (`internal error: <error.message>`).
    expect(diag?.message).toBe(expectedMessage(INTERNAL_ERROR_CODE, { "<error.message>": "boom" }));
    // The hint carries the underlying error's stack for operator triage.
    expect(diag?.hint).toBe(thrown.stack);
  });

  it("loom/runtime/internal-error: a catchable host allocation failure (RangeError) routes here too", () => {
    const thrown = new RangeError("Invalid string length");
    const diag = surfaceUnexpectedThrow(thrown, site());
    expect(diag?.code).toBe(INTERNAL_ERROR_CODE);
    expect(diag?.message).toBe(
      expectedMessage(INTERNAL_ERROR_CODE, { "<error.message>": "Invalid string length" }),
    );
  });

  it("loom/runtime/internal-error: an already-classified panic is not reclassified (it stays a panic)", () => {
    // A `LoomPanic` reaching the runtime-defect surface is one of the six closed
    // panic sources, not an unexpected interpreter throw, so it is not turned
    // into `loom/runtime/internal-error`; the caller rethrows it as the panic.
    const panic = new IndexOutOfBoundsPanic("index out of bounds: 5 not in 0..3");
    expect(isLoomPanic(panic)).toBe(true);
    expect(surfaceUnexpectedThrow(panic, site())).toBeUndefined();
  });
});

describe("V4b-T — NOCEIL-3 carve-out: a host-fatal uncatchable condition emits no diagnostic", () => {
  it("loom/runtime/internal-error is NOT delivered for an uncatchable host fatal", () => {
    // A V8 heap-OOM (the OOMErrorCallback / abort() path) terminates the host
    // process before any wrap can observe it, so it delivers no throw to a catch
    // site and the runtime-defect surface emits no diagnostic at all.
    const fatal = new HostFatal("FATAL ERROR: Reached heap limit Allocation failed");
    expect(
      surfaceUnexpectedThrow(fatal, site()),
      "NOCEIL-3: no loom/runtime/internal-error is delivered for an uncatchable host fatal",
    ).toBeUndefined();
  });
});
