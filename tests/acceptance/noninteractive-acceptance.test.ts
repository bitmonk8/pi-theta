// H9a-T — non-interactive `pi -p` real-host acceptance suite (tests).
//
// An OPT-IN, non-interactive acceptance suite that drives loom through the real
// `pi -p` binary (`pi -p --loom <dir> "/<name>"`, process-and-exit) over a
// FULLER feature-loom suite — one loom per functionality area (a)–(i) — and
// asserts, per loom, its model-output-INVARIANT observable set (never exact
// goldens, since a live LLM does not reproduce them): no-error exit, binder
// output validates against the binder envelope schema where a binder pass fires,
// typed-query responses validate against their declared schema (`QRY-22`),
// observed subagent cancellation propagation with committed turns unmutated, and
// emitted `loom-system-note` codes ⊆ the committed permitted-code list. It is
// Phase 1 of the two-phase loom 1.0 release gate (real-host-smoke-gate.md).
//
// It has its own runner (`vitest.acceptance.config.ts` / `npm run
// test:acceptance`), excluded from the default `npm test` and the H8a
// `npm run test:live` suite; it spends real tokens and needs a live host. It
// closes no spec REQ-ID and adds no coverage-matrix row (the live-host
// acceptance pair exception, as for H8a).
//
// INTENDED-REASON RED (current H9a-T state): the fuller feature-loom fixtures do
// not exist yet, so `resolveFeatureLoomPath` returns `undefined` for every
// area and each test reds on its own primary fixture-presence assertion —
// deterministically, token-free, BEFORE any live host / credential / spawned
// `pi` process is required. This is exactly the intended-reason red the leaf
// names: the runner and feature looms are absent, and the (b)/(d)/(e) axes are
// not yet correct/integrated. The paired `H9a` authors the looms, wires the
// runner's per-area observability, and turns these green.
//
// Convention: real-host-smoke-gate.md — Phase 1 (automated non-interactive
// acceptance); conventions.md — phase categories (live-host acceptance pair
// exception). Narrative spec references for the implementer:
// binder-bypass-and-envelope.md, query-failure-and-repair.md (QRY-22),
// cancellation.md, discovery.md.

import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE_LOOM_DIR,
  FEATURE_LOOMS,
  failLoudly,
  featureLoom,
  loadPermittedCodes,
  parseEmittedJson,
  parseSystemNoteCodes,
  requireLiveHost,
  resolveFeatureLoomPath,
  spawnPiPrint,
  validatesAgainstBinderEnvelope,
  validatesAgainstSchema,
  type FeatureArea,
  type FeatureLoomSpec,
  type PiPrintResult,
} from "./harness";

/**
 * Resolve the committed feature-loom `.loom` for a spec, or FAIL LOUDLY naming
 * the absent fixture (never a silent skip). This is the suite's intended-reason
 * red: in the current `H9a-T` state the paired `H9a` has not authored the
 * feature looms, so every area reds here BEFORE any live host is required.
 */
function requireAuthoredLoom(spec: FeatureLoomSpec): string {
  const path = resolveFeatureLoomPath(spec);
  if (path === undefined) {
    failLoudly(
      `feature loom ${spec.label} (${spec.area}) is not authored: expected ` +
        `${spec.fixtureFile} under ${FEATURE_LOOM_DIR}. The paired H9a authors ` +
        `the fuller feature-loom suite; the runner and looms are absent today.`,
    );
  }
  return path;
}

/** A throwaway cwd for a spawned `pi -p` process. */
function scratchCwd(): string {
  return mkdtempSync(join(tmpdir(), "loom-acc-"));
}

/** Assert the no-error-exit invariant every feature loom must satisfy. */
function assertNoErrorExit(result: PiPrintResult, spec: FeatureLoomSpec): void {
  expect(
    result.exitCode,
    `${spec.label} ${spec.area}: expected a no-error exit (0), got ` +
      `${String(result.exitCode)}. stderr: ${result.stderr}`,
  ).toBe(0);
}

/** Assert emitted `loom-system-note` codes ⊆ the committed permitted-code list (criterion e). */
function assertCodesSubsetOfPermitted(
  result: PiPrintResult,
  spec: FeatureLoomSpec,
): void {
  const permitted = new Set(loadPermittedCodes());
  const emitted = parseSystemNoteCodes(result.stdout + "\n" + result.stderr);
  const outside = emitted.filter((code) => !permitted.has(code));
  expect(
    outside,
    `${spec.label} ${spec.area}: emitted loom-system-note code(s) outside the ` +
      `committed permitted-code list: ${JSON.stringify(outside)}`,
  ).toEqual([]);
}

// ===========================================================================
// (a) prompt-mode sentinel turn.
// A single prompt-mode `.loom` whose one untyped query names a deterministic
// sentinel. Invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (a) prompt-mode sentinel turn (Convention: Phase 1 acceptance)", () => {
  it("drives one prompt-mode turn via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureLoom("prompt-sentinel");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (b) typed query with a NAMED `schema` decl.
// A `schema Foo { ... }` declaration bound to a typed `@`-query; the response
// MUST validate against the declared, lowered schema (QRY-22).
// ===========================================================================

describe("H9a-T (b) typed query with a named schema (QRY-22; Convention: Phase 1)", () => {
  it("validates a named-schema typed-query response against its declared schema", async () => {
    const spec = featureLoom("typed-query-named-schema");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    const schema = spec.invariants.typedQuerySchema;
    if (schema === undefined) {
      failLoudly(`${spec.label}: named-schema loom must declare a typedQuerySchema invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    // QRY-22: the typed-query response validates against its declared schema.
    const value = parseEmittedJson(result.stdout);
    const check = validatesAgainstSchema(value, schema);
    expect(
      check.ok,
      `${spec.label}: named-schema typed-query response failed schema ` +
        `validation (QRY-22): ${JSON.stringify(check.errors)}. stdout: ${result.stdout}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (c) typed query with an INLINE object type.
// A `let x: { ... } = @`...`` inline object annotation; the response MUST
// validate against the lowered inline schema (QRY-22).
// ===========================================================================

describe("H9a-T (c) typed query with an inline object type (QRY-22; Convention: Phase 1)", () => {
  it("validates an inline-object typed-query response against its declared schema", async () => {
    const spec = featureLoom("typed-query-inline");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    const schema = spec.invariants.typedQuerySchema;
    if (schema === undefined) {
      failLoudly(`${spec.label}: inline-type loom must declare a typedQuerySchema invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    const value = parseEmittedJson(result.stdout);
    const check = validatesAgainstSchema(value, schema);
    expect(
      check.ok,
      `${spec.label}: inline-type typed-query response failed schema ` +
        `validation (QRY-22): ${JSON.stringify(check.errors)}. stdout: ${result.stdout}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (d) a params loom that forces a real BINDER pass.
// A `params:` loom invoked with raw slash text drives a real binder pass; the
// binder output MUST validate against the per-loom binder envelope schema
// (the three-arm `ok | needs_info | ambiguous` envelope — structural validity).
// ===========================================================================

describe("H9a-T (d) params loom forcing a binder pass (binder envelope; Convention: Phase 1)", () => {
  it("validates the binder pass output against the per-loom binder envelope schema", async () => {
    const spec = featureLoom("params-binder");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    const envelope = spec.invariants.binderEnvelope;
    if (envelope === undefined) {
      failLoudly(`${spec.label}: params-binder loom must declare a binderEnvelope invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      // Raw slash text the binder must bind into the params object.
      slashInvocation: `/${spec.stem} summarise the three most recent commits`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    const value = parseEmittedJson(result.stdout);
    const check = validatesAgainstBinderEnvelope(value, envelope);
    expect(
      check.ok,
      `${spec.label}: binder pass output failed binder-envelope validation: ` +
        `${JSON.stringify(check.errors)}. stdout: ${result.stdout}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (e) a subagent-mode loom exercising spawn + mid-stream CANCELLATION.
// A `mode: subagent` loom that spawns an AgentSession and is cancelled
// mid-stream; cancellation propagation MUST be observed and the spawned
// session's committed turns MUST be left unmutated by the mid-stream cancel.
// ===========================================================================

describe("H9a-T (e) subagent spawn + mid-stream cancellation (Convention: Phase 1)", () => {
  it("observes cancellation propagation with the subagent's committed turns unmutated", async () => {
    const spec = featureLoom("subagent-cancel");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    expect(spec.invariants.observesCancellation).toBe(true);

    requireLiveHost();
    const cwd = scratchCwd();
    // WHY no external abort: `pi -p` buffers stdout, so an external SIGTERM
    // (abortAfterMs) discards the buffer and yields empty stdout/stderr — the
    // `/cancel|aborted/i` assertion could never see the cancellation. Instead
    // the fixture self-cancels: its production subagent drive injects a bounded
    // mid-stream cancel through the injected Clock and echoes the observed
    // cancellation on the user-visible channel on NORMAL completion. So we let
    // the run complete normally (exit 0) and score the captured stdout — this
    // exercises the real in-flight mid-stream cancel path, not a process kill.
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });

    // Cancellation propagation is observed: the run surfaces the cancellation
    // (a `cancelled`/`invoke_callee` QueryError) rather than a silent success,
    // and no code outside the permitted list escapes.
    assertCodesSubsetOfPermitted(result, spec);
    expect(
      /cancel|aborted/i.test(result.stdout + result.stderr),
      `${spec.label}: expected observed cancellation propagation in the run ` +
        `output. stdout: ${result.stdout} stderr: ${result.stderr}`,
    ).toBe(true);

    // Committed turns unmutated: the run does not emit a runtime-internal-error
    // signalling a mutated committed-turn set under the mid-stream cancel.
    const codes = parseSystemNoteCodes(result.stdout + result.stderr);
    expect(
      codes.includes("loom/runtime/internal-error"),
      `${spec.label}: a mid-stream cancel must leave the subagent's committed ` +
        `turns unmutated (no loom/runtime/internal-error). codes: ${JSON.stringify(codes)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// (f) a code-tool loop.
// A prompt-mode loom exposing a code-side tool the model calls in a free-phase
// loop; invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (f) code-tool loop (Convention: Phase 1 acceptance)", () => {
  it("drives a code-tool loop via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureLoom("code-tool-loop");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (g) imports / invoke across looms.
// A loom that imports a symbol from a sibling `.warp`/`.loom` and `invoke`s a
// second loom; invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (g) imports / invoke across looms (Convention: Phase 1)", () => {
  it("drives imports + invoke across looms via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureLoom("imports-invoke");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (h) error/result `match` surfacing a QueryError.
// A loom binding a query result and `match`ing its `Err(QueryError { ... })`
// arm; the run surfaces the QueryError through the match rather than throwing.
// Invariant set: no-error exit (the QueryError is handled) + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (h) error/result match surfacing a QueryError (Convention: Phase 1)", () => {
  it("surfaces a QueryError through a result `match` without an errored exit", async () => {
    const spec = featureLoom("match-queryerror");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    // The QueryError is surfaced through the match arm and handled, so the run
    // still exits cleanly rather than aborting.
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (i) multi-source discovery (project + `--loom` CLI source).
// The loom must register both from the project walk and from the `--loom` CLI
// source, proving discovery is source-general. Driven twice through `pi -p`.
// ===========================================================================

describe("H9a-T (i) multi-source discovery, project + --loom CLI (Convention: Phase 1)", () => {
  it("registers and runs the loom from both a project source and a --loom CLI source", async () => {
    const spec = featureLoom("multi-source-discovery");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    expect(spec.invariants.multiSourceDiscovery).toBe(true);

    requireLiveHost();

    // Project-source discovery: the fixtures dir doubles as the project source.
    const projectCwd = scratchCwd();
    const viaProject = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd: projectCwd,
    });
    assertNoErrorExit(viaProject, spec);
    assertCodesSubsetOfPermitted(viaProject, spec);

    // Alternate source: the same loom discovered via an additional `--loom`
    // CLI source registers and runs identically (discovery is source-general).
    const cliCwd = scratchCwd();
    const viaCli = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      extraLoomDirs: [FEATURE_LOOM_DIR],
      slashInvocation: `/${spec.stem}`,
      cwd: cliCwd,
    });
    assertNoErrorExit(viaCli, spec);
    assertCodesSubsetOfPermitted(viaCli, spec);
  });
});

// ===========================================================================
// Manifest self-check (harness contract, not a feature obligation).
// Documents the committed feature-loom suite contract: exactly the nine
// functionality areas (a)–(i) H9a-T enumerates, each with a distinct stem.
// This green check is a runner-wiring self-test; the nine feature-area tests
// above carry the intended-reason reds.
// ===========================================================================

describe("H9a-T feature-loom manifest (harness self-check)", () => {
  it("enumerates exactly the nine functionality areas (a)–(i) with distinct stems", () => {
    const areas: readonly FeatureArea[] = [
      "prompt-sentinel",
      "typed-query-named-schema",
      "typed-query-inline",
      "params-binder",
      "subagent-cancel",
      "code-tool-loop",
      "imports-invoke",
      "match-queryerror",
      "multi-source-discovery",
    ];
    expect(new Set(FEATURE_LOOMS.map((s) => s.area))).toEqual(new Set(areas));
    expect(FEATURE_LOOMS.length).toBe(areas.length);
    expect(new Set(FEATURE_LOOMS.map((s) => s.stem)).size).toBe(areas.length);
    // The committed permitted-code list criterion (e) scores against is present.
    expect(loadPermittedCodes().length).toBeGreaterThan(0);
  });
});
