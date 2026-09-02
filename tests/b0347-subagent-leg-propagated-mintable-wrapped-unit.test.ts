// Bug 0347 (offline unit cells) — the subagent leg leaves a callee-PROPAGATED
// nested `invoke_infra` of one of the five child-side-mintable causes
// (`load_failure` / `validation` / `return_validation` / `internal_error` /
// `subagent_model_preflight_mismatch`) BARE, breaking INV-5 wrap parity with the
// in-process leg (`docs/spec_topics/invocation.md:36`). The parent-side driver
// reads `cause` as a provenance proxy over the closed `InvokeInfraCause` union
// (`src/runtime/subagent-json-driver.ts:246-249`) because the `theta_result`
// envelope carries no provenance marker — so a propagated mintable leaf is
// indistinguishable on the wire from a genuine child-side mint of the same
// cause and defaults bare.
//
// THE SETTLED WIRE MARKER (in-lane fixed decision, not re-litigated here). The
// `theta_result` `err` arm gains an OPTIONAL `err_provenance` field, a SIBLING
// of `err` (exactly as `enum_tags` is a sibling of `ok`, bug 0342), values
// `"mint"` | `"propagated"`, `v` stays 1. Its ABSENCE reproduces today's
// closed-set-proxy behaviour verbatim (skew-safe both directions). POST-FIX the
// driver's `err`-arm `source` derivation is:
//   - `err_provenance:"mint"`       -> `"boundary-minted"` (bare) for ANY cause
//     (the explicit marker supersedes the proxy);
//   - `err_provenance:"propagated"` -> `"callee-returned"` (wrap) for ANY cause;
//   - ABSENT                        -> the RETAINED closed-set proxy — an
//     `invoke_infra` whose cause is NOT in {parse_failure, panic,
//     subagent_model_unresolved} is boundary-minted, otherwise callee-returned;
//     a non-`invoke_infra` err is callee-returned.
//
// WHY THESE ARE UNIT CELLS, NOT COMPOSITION-ROOT CELLS. The `err`-arm `source`
// derivation (`driveSubagentChild`, `src/runtime/subagent-json-driver.ts`) is
// the driver's own settle site; a `FakeRpcChild` emitting a hand-built envelope
// line exercises it directly with zero process spawn and zero tokens. The INV-5
// parity oracle and the SLSH-5 hop are witnessed at the wrap seam
// (`runInvokeEffect`, `src/runtime/effectful-statement-host.ts:507`) driven by
// the real `executeBody` over an injected `InvokeChild` boundary double — the
// b0294 `(G)` / b0349 `runInvokeEffect` harness.
//
// WHY `err_provenance` IS AN ENVELOPE SIBLING THE CURRENT PARSER DROPS.
// `parseEnvelopeLine`'s `err` arm returns `record.err` alone
// (`src/runtime/subagent-envelope.ts:384`); no reader consults an
// `err_provenance` sibling. So at THIS fork every envelope below — stamped or
// not — settles through the unchanged `cause` proxy: that is the mechanism the
// RED cells witness (a propagated mintable leaf carrying `err_provenance:
// "propagated"` still tags boundary-minted, so its downstream wrap never fires).
//
// RED AT THIS FORK (correct-reason reds):
//   - the FIVE mintable causes' stamped-`propagated` cells assert callee-returned
//     but the proxy yields boundary-minted (marker unread): "expected
//     'boundary-minted' to be 'callee-returned'";
//   - the THREE no-writer causes' stamped-`mint` cells assert boundary-minted but
//     the proxy yields callee-returned (marker unread — the mirror direction of
//     the same defect): "expected 'callee-returned' to be 'boundary-minted'";
//   - the INV-5 parity oracle's propagation leg (subagent source flows into
//     `runInvokeEffect`) surfaces bare `invoke_infra`: "expected 'invoke_infra'
//     to be 'invoke_callee'";
//   - the SLSH-5 hop-lands cell records no hop off the bare leaf: hop-count
//     mismatch "expected +0 to be 1".
// GREEN at this fork (proxy coincides with the marker or the fallback): every
// mintable stamped-`mint`, every no-writer stamped-`propagated`, every
// absent-marker cell, every malformed/skew tolerance cell, the mint-stays-bare
// oracle cell, and the no-hop-for-mint cell.
//
// NO SILENT SKIP. Every cell asserts a concrete value; a missing precondition
// (the driver never settling, the body never reaching the invoke) surfaces as a
// failing assertion or a rejected promise, never an early return.
//
// Spec: pi-integration-contract/subagent.md (PIC-59 envelope consumption + the
// 0342-scale additive-sidecar convention), `docs/spec_topics/invocation.md:36`
// (INV-5 wrap parity across legs), `:75` (the wrap rule),
// `docs/spec_topics/errors-and-results/queryerror-variants.md` §Invoke variants.

import { describe, expect, it } from "vitest";

import { driveSubagentChild } from "../src/runtime/subagent-json-driver";
import {
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";
import type { SubagentChildProcess } from "../src/runtime/subagent-launcher";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeRpcChild } from "./helpers/fake-rpc-child";

import {
  executeBody,
  type ExecuteBodyDeps,
} from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { Checkpoint } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeErr, type ResultValue, type ThetaValue } from "../src/runtime/value";
import type {
  DrivenInvokeResult,
  InvokeChild,
  InvokeResultSource,
} from "../src/runtime/invoke-cancellation";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { Expr, InvokeExpr, ThetaBody } from "../src/parser/theta-document";
import type { SourceRange } from "../src/diagnostics/diagnostic";
import type { InvokeCalleeError, QueryError } from "../src/runtime/query-error";
import type { InvokeCallSite } from "../src/runtime/invoke-provenance";

// The two cause partitions of the closed `InvokeInfraCause` union, by whether a
// child-side envelope writer exists (bug 0347 root cause; the writers are
// enumerated in `subagent-json-driver.ts`'s `case "err"` block).
const MINTABLE_CAUSES = [
  "load_failure",
  "validation",
  "return_validation",
  "internal_error",
  "subagent_model_preflight_mismatch",
] as const;
const NO_WRITER_CAUSES = ["parse_failure", "panic", "subagent_model_unresolved"] as const;

// ===========================================================================
// (F) Subagent-leg driver harness — hand-built envelope line, mirroring b0294.
// ===========================================================================

/** One hand-built `theta_result` envelope line (the child emits this on stdout). */
function envelopeLine(payload: Record<string, unknown>): string {
  return JSON.stringify({ [THETA_RESULT_KEY]: payload });
}

/** A macrotask flush so the drive reaches its stdout-read await before the line lands. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function driveDeps(child: SubagentChildProcess, thetaAbort: AbortController): {
  child: SubagentChildProcess;
  thetaAbort: AbortController;
  calleePath: string;
  emitDiagnostic: (d: Diagnostic) => void;
} {
  return {
    child,
    thetaAbort,
    calleePath: "./worker.theta",
    emitDiagnostic: (): void => {},
  };
}

/** A minimal `invoke_infra` err body carrying the given cause (the driver reads `kind`/`cause`). */
function invokeInfraErr(cause: string): Record<string, unknown> {
  return {
    kind: "invoke_infra",
    message: `invoke of ./deeper.theta failed (${cause})`,
    callee_path: "./deeper.theta",
    cause,
  };
}

/**
 * A full `theta_result` err payload: `err` plus the OPTIONAL `err_provenance`
 * sibling marker (omitted when `provenance` is `undefined`) plus any extra
 * sibling fields (unknown-field / malformed-marker skew cells).
 */
function stampedEnvelope(
  cause: string,
  provenance: string | number | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    v: THETA_ENVELOPE_VERSION,
    err: invokeInfraErr(cause),
    ...(provenance !== undefined ? { err_provenance: provenance } : {}),
    ...extra,
  };
}

/**
 * Drive one hand-built err envelope through the real `driveSubagentChild` over a
 * `FakeRpcChild` and return the settled `source`. A non-`err` settle (the drive
 * failing to reach the envelope arm) fails loudly on the `result.ok` assertion,
 * never an early return.
 */
async function driveSource(payload: Record<string, unknown>): Promise<InvokeResultSource> {
  const child = new FakeRpcChild({ exitOnStdinEof: false });
  const thetaAbort = new AbortController();
  const pending = driveSubagentChild(driveDeps(child, thetaAbort));
  await tick();
  child.emitRawLine(envelopeLine(payload));
  child.crashWith(0);
  const result = await pending;
  expect(result.ok, "an `err` envelope must settle an Err invocation result").toBe(false);
  return (result as unknown as { readonly source: InvokeResultSource }).source;
}

describe("bug 0347 (F) — the subagent driver keys the err-arm source on the wire err_provenance marker (INV-5)", () => {
  // The five child-side-mintable causes: the marker's `mint` value keeps them
  // bare (unchanged), its `propagated` value now WRAPS them (the fix), and its
  // absence degrades to the retained proxy (bare).
  for (const cause of MINTABLE_CAUSES) {
    it(`${cause}: stamped err_provenance "mint" -> boundary-minted (marker keeps a child-side mint bare)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, "mint"));
      expect(
        source,
        "an explicit `mint` marker supersedes the proxy — a child-side mint stays bare (INV-5's preserved bare case)",
      ).toBe("boundary-minted");
    });

    it(`${cause}: stamped err_provenance "propagated" -> callee-returned (a ?-propagated nested invoke_infra WRAPS)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, "propagated"));
      // RED at this fork: the marker is unread, so the proxy tags this mintable
      // cause boundary-minted. This is the bug-0347 witness — the propagated
      // mintable leaf that INV-5 requires wrapped stays bare on the subagent leg.
      expect(
        source,
        "an explicit `propagated` marker forces the wrap for the five mintable causes (bug 0347 INV-5 gap)",
      ).toBe("callee-returned");
    });

    it(`${cause}: absent marker -> boundary-minted (retained closed-set proxy fallback)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, undefined));
      expect(
        source,
        "absent marker degrades to the closed-set proxy; a mintable cause defaults bare (today's behaviour, preserved)",
      ).toBe("boundary-minted");
    });
  }

  // The three no-writer causes reach the envelope only by propagation, so the
  // marker's `propagated` value and the proxy AGREE (both wrap); the marker's
  // `mint` value is the mirror-direction witness — an explicit mint supersedes a
  // proxy that would (wrongly, for a hypothetical child-side mint) wrap.
  for (const cause of NO_WRITER_CAUSES) {
    it(`${cause}: stamped err_provenance "mint" -> boundary-minted (marker supersedes the wrap-defaulting proxy)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, "mint"));
      // RED at this fork: the proxy tags a no-writer cause callee-returned, so an
      // explicit `mint` marker (which must bare it) is contradicted — the mirror
      // direction of the same unread-marker defect.
      expect(
        source,
        "an explicit `mint` marker bares even a no-writer cause the proxy would wrap (marker supersedes proxy, any cause)",
      ).toBe("boundary-minted");
    });

    it(`${cause}: stamped err_provenance "propagated" -> callee-returned (coincides with the proxy)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, "propagated"));
      expect(
        source,
        "a `propagated` marker wraps — byte-identical to the proxy for a no-writer cause (INV-5 parity, unchanged)",
      ).toBe("callee-returned");
    });

    it(`${cause}: absent marker -> callee-returned (retained closed-set proxy fallback)`, async () => {
      const source = await driveSource(stampedEnvelope(cause, undefined));
      expect(
        source,
        "absent marker degrades to the closed-set proxy; a no-writer cause wraps (today's behaviour, preserved)",
      ).toBe("callee-returned");
    });
  }
});

// ===========================================================================
// (F') Skew and malformed-marker tolerance (0342 both-directions posture).
// ===========================================================================

describe("bug 0347 (F') — old-envelope and malformed-marker tolerance falls back to the closed-set proxy", () => {
  it("old-envelope skew: a mintable cause with NO err_provenance falls back to the proxy -> boundary-minted", async () => {
    // New-parent / old-child skew: an old child emits no `err_provenance`. The
    // new parent must degrade to the current disposition (bare), not fabricate a
    // wrap — the 0342 absent-sidecar tolerance direction.
    const source = await driveSource(stampedEnvelope("return_validation", undefined));
    expect(
      source,
      "an old child's marker-less envelope degrades to today's proxy disposition (bare) — skew-safe",
    ).toBe("boundary-minted");
  });

  it('malformed err_provenance value "nonsense" is IGNORED -> proxy fallback -> boundary-minted', async () => {
    // A malformed marker value is not a recognised provenance; the driver must
    // ignore it and fall back to the proxy, mirroring `parseEnumTagsSidecar`'s
    // ignore-on-malformed posture (`subagent-envelope.ts:326`).
    const source = await driveSource(stampedEnvelope("load_failure", "nonsense"));
    expect(
      source,
      "an unrecognised `err_provenance` value is ignored, not honoured — the proxy decides (bare for a mintable cause)",
    ).toBe("boundary-minted");
  });

  it("malformed err_provenance value 42 (wrong type) is IGNORED -> proxy fallback -> boundary-minted", async () => {
    const source = await driveSource(stampedEnvelope("validation", 42));
    expect(
      source,
      "a non-string `err_provenance` is malformed and ignored — the proxy decides (bare for a mintable cause)",
    ).toBe("boundary-minted");
  });

  it("unknown extra sibling field + malformed marker is tolerated -> proxy fallback -> boundary-minted", async () => {
    // Unknown-extra-field tolerance: an envelope carrying an unrelated future
    // field alongside a malformed marker must still parse and fall back to the
    // proxy, never fail the envelope schema.
    const source = await driveSource(
      stampedEnvelope("internal_error", "nonsense", { some_future_field: { nested: true } }),
    );
    expect(
      source,
      "an unknown sibling field is tolerated and the malformed marker ignored — the proxy decides (bare)",
    ).toBe("boundary-minted");
  });
});

// ===========================================================================
// (G) INV-5 parity oracle + SLSH-5 hop — the `runInvokeEffect` wrap seam.
// Mirrors the b0294 (G) / b0349 harness: the real `executeBody` drives one
// `invoke(...)` tail over an injected `InvokeChild` double, and the surfaced
// `Err.kind` / recorded hop are read off the wrap seam.
// ===========================================================================

const WORKER = "./worker.theta"; // the parent's own callee (the wrapper's callee_path).
const GRANDCHILD = "./deeper.theta"; // the propagated leaf's callee_path (the grandchild the parent never invoked).

const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const SEAM_NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function invokeExpr(path: string): InvokeExpr {
  return { kind: "invoke", path, returnSchema: null, args: [], range: span() };
}

function tailBody(tail: Expr): ThetaBody {
  return { statements: [], tail };
}

/** The propagated grandchild leaf — an `invoke_infra{load_failure}` the callee `?`-propagated. */
function propagatedLeaf(): QueryError {
  return {
    kind: "invoke_infra",
    message: `invoke of ${GRANDCHILD} failed (load_failure)`,
    callee_path: GRANDCHILD,
    cause: "load_failure",
  } as unknown as QueryError;
}

/** One recorded SLSH-5 hop (`deps.recordInvokeHop` fires only when the seam wraps an `invoke_callee`). */
interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}

/**
 * An `InvokeChild` boundary double whose completed drive resolves `Err(leaf)`
 * with the given provenance `source` — the exact input `runInvokeEffect`'s
 * XMODE-1 gate keys its wrap decision on (bug 0294).
 */
function invokeChildWithSource(
  calleePath: string,
  leaf: QueryError,
  source: InvokeResultSource,
): InvokeChild {
  return {
    calleePath,
    committed: [],
    drive: (): Promise<DrivenInvokeResult> =>
      Promise.resolve({ source, result: makeErr(leaf as unknown as ThetaValue) }),
  } as unknown as InvokeChild;
}

function seamDeps(invoke: InvokeChild, recordHop: (hop: RecordedHop) => void): ExecuteBodyDeps {
  const signal = new AbortController().signal; // QUIET parent signal — the wrap gate is purely source-keyed here.
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    sink: SEAM_NOOP_SINK,
    file: "parent.theta",
    evaluatePure(): ThetaValue {
      return null;
    },
    resolveQuery(): QueryHostDispatch {
      throw new Error("no `@`-query is executed in this seam — resolveQuery must not be reached");
    },
    resolveToolCall(): never {
      throw new Error("no tool call is executed in this seam — resolveToolCall must not be reached");
    },
    resolveInvoke(): InvokeChild {
      return invoke;
    },
    recordInvokeHop(
      wrapper: InvokeCalleeError,
      calleePath: string,
      callSite: InvokeCallSite,
    ): Promise<void> {
      recordHop({ wrapper, calleePath, callSite });
      return Promise.resolve();
    },
  };
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt" as DrivenConversationMode,
    file: "parent.theta",
  };
}

/**
 * Drive one `invoke(WORKER)` tail through the real `executeBody` over a double
 * carrying the given `source`, and read the surfaced `Err.kind` and any recorded
 * SLSH-5 hops. A non-Err surface fails loudly on the `value.ok` assertion.
 */
async function surfaceInvoke(
  source: InvokeResultSource,
  leaf: QueryError,
): Promise<{ readonly kind: string; readonly hops: readonly RecordedHop[] }> {
  const hops: RecordedHop[] = [];
  const invoke = invokeChildWithSource(WORKER, leaf, source);
  const deps = seamDeps(invoke, (hop) => hops.push(hop));
  const exec = await executeBody(tailBody(invokeExpr(WORKER)), deps);
  const value = exec.result.value as ResultValue;
  expect(value.ok, "a driven Err invoke surfaces an Err at the parent tail").toBe(false);
  const err = (value as unknown as { readonly error: QueryError }).error;
  return { kind: (err as unknown as { readonly kind: string }).kind, hops };
}

describe("bug 0347 (G) — INV-5 parity oracle: the subagent leg wraps a propagated mintable leaf exactly as the in-process leg", () => {
  it("propagated invoke_infra(load_failure): subagent leg AND in-process twin both surface invoke_callee", async () => {
    // Subagent leg: the propagated mintable leaf carries `err_provenance:
    // "propagated"`; its settled `source` flows into the wrap seam.
    const subagentSource = await driveSource(stampedEnvelope("load_failure", "propagated"));
    const subagentLeg = await surfaceInvoke(subagentSource, propagatedLeaf());
    // In-process twin: the body-outcome path marks a `?`-propagated invoke_infra
    // `callee-returned` directly (bug 0294) — the leg INV-5 pins parity against.
    const inProcessTwin = await surfaceInvoke("callee-returned", propagatedLeaf());

    // RED at this fork: `subagentSource` is boundary-minted (marker unread), so
    // the seam bares the leaf and surfaces `invoke_infra` — the parity gap.
    expect(
      subagentLeg.kind,
      "the subagent leg must wrap the propagated mintable leaf as invoke_callee (INV-5, invocation.md:36)",
    ).toBe("invoke_callee");
    expect(
      inProcessTwin.kind,
      "the in-process twin wraps the identical propagated leaf as invoke_callee (bug 0294, correct leg)",
    ).toBe("invoke_callee");
    expect(
      subagentLeg.kind,
      "INV-5 parity oracle: the surfaced kind is identical whether the callee resolves in-process or as a subagent",
    ).toBe(inProcessTwin.kind);
  });

  it("child-side mint invoke_infra(load_failure): the subagent leg stays boundary-minted and surfaces the leaf BARE", async () => {
    // A genuine child-side mint carries `err_provenance:"mint"` and must stay
    // bare — the disposition today's bare tagging already gets right and the fix
    // preserves. GREEN both at fork and post-fix (proxy coincides with the mint).
    const mintSource = await driveSource(stampedEnvelope("load_failure", "mint"));
    const surfaced = await surfaceInvoke(mintSource, propagatedLeaf());
    expect(mintSource, "an explicit `mint` marker keeps the leaf boundary-minted").toBe("boundary-minted");
    expect(
      surfaced.kind,
      "a boundary-minted leaf passes bare through the XMODE-1 gate — kind stays invoke_infra, no wrap",
    ).toBe("invoke_infra");
    expect(surfaced.kind).not.toBe("invoke_callee");
  });
});

describe("bug 0347 (G) — SLSH-5 hop: a wrapped propagated leaf records one literal_invoke hop, a bare mint records none", () => {
  it("propagated invoke_infra(load_failure): exactly one SLSH-5 hop (literal_invoke) is recorded against the wrapper", async () => {
    const propagatedSource = await driveSource(stampedEnvelope("load_failure", "propagated"));
    const { hops } = await surfaceInvoke(propagatedSource, propagatedLeaf());

    // RED at this fork: `propagatedSource` is boundary-minted (marker unread), so
    // the seam bares the leaf, records no hop, and the SLSH-5 chain suffix is lost.
    expect(hops.length, "a wrapped propagated leaf records exactly one SLSH-5 hop (bug 0088)").toBe(1);
    expect(
      hops[0]?.callSite.style,
      "the invoke seam records the literal_invoke call-site style (effectful-statement-host.ts:520)",
    ).toBe("literal_invoke");
    expect(hops[0]?.calleePath, "the hop names the parent's OWN callee, not the grandchild leaf").toBe(WORKER);
  });

  it("child-side mint invoke_infra(load_failure): NO SLSH-5 hop is recorded for a bare boundary-minted leaf", async () => {
    const mintSource = await driveSource(stampedEnvelope("load_failure", "mint"));
    const { hops } = await surfaceInvoke(mintSource, propagatedLeaf());
    expect(hops.length, "a bare boundary-minted leaf contributes no hop to the SLSH-5 chain").toBe(0);
  });
});
