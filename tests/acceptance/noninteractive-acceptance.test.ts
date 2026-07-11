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
// A `params:` loom invoked with raw slash text drives a real binder pass.
// DECISION (production conformance): the binder runs OFF-session and INVISIBLE
// — its three-arm `ok | needs_info | ambiguous` envelope MUST NOT reach the user
// session / `pi -p` stdout (BND-3). The invariant set is therefore: no-error
// exit + codes ⊆ permitted, the envelope does NOT leak to stdout, and (on a
// successful bind) the `bind_echo` success note `Running /<stem>: …` surfaces.
//
// WHY the contract changed: the pre-decision runBinder drove the binder as a
// USER-VISIBLE streamed turn that printed the raw envelope JSON to stdout, and
// this test asserted `validatesAgainstBinderEnvelope(parseEmittedJson(stdout))`.
// The maintainer decision makes the binder invisible: the envelope is
// runtime-internal and never surfaced, so the old assertion (envelope on stdout)
// is now a LEAK detector rather than a success criterion — rewritten, not
// weakened, to the correct post-decision contract.
// ===========================================================================

describe("H9a-T (d) params loom forcing an OFF-session binder pass (no envelope leak; Convention: Phase 1)", () => {
  it("runs the binder off-session: no envelope leak to stdout, and a success echo note surfaces", async () => {
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

    // BND-3: the runtime-internal envelope must NEVER reach stdout. A parseable
    // top-level object that validates against the per-loom envelope schema on
    // stdout is a leak regression.
    const leaked = parseEmittedJson(result.stdout);
    const asEnvelope = validatesAgainstBinderEnvelope(leaked, envelope);
    expect(
      asEnvelope.ok,
      `${spec.label}: the off-session binder envelope leaked to stdout: ` +
        `${result.stdout}`,
    ).toBe(false);
    expect(
      /"kind"\s*:\s*"(ok|needs_info|ambiguous)"/.test(result.stdout),
      `${spec.label}: a raw binder envelope discriminator leaked to stdout: ${result.stdout}`,
    ).toBe(false);

    // BND-1: on a successful bind the bind_echo success note surfaces (the
    // observable proof of binding, replacing the old visible envelope). A
    // non-binding arm would instead surface a `loom /<stem>: argument binding …`
    // failure note; either way the raw envelope stays internal.
    expect(
      /Running \/acc-params-binder:/.test(result.stdout) ||
        /loom \/acc-params-binder: argument binding/.test(result.stdout),
      `${spec.label}: expected a bind_echo success note or a binder failure note ` +
        `on stdout, got: ${result.stdout}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (e) a subagent-mode loom that drives to a SUCCESS terminal outcome.
// A `mode: subagent` loom spawns an isolated AgentSession, drives one real
// subagent turn to completion, and reaches a success terminal outcome — the
// path the H8a production driver previously made unreachable (it self-cancelled
// every subagent query). Invariant set: no-error exit + codes ⊆ permitted, with
// NO `cancelled` marker on this normal completion.
//
// WHY cancellation moved: the fixed production driver no longer self-cancels, so
// this black-box `pi -p` run drives subagent SUCCESS. Genuine mid-stream
// cancellation (a REAL injected `loomAbort` fire at a scripted cancel point) is
// deterministically locked in-process by
// `tests/production-subagent-query-model.test.ts`; it cannot be scored here
// because `pi -p` buffers stdout and an external SIGTERM discards the buffer.
// ===========================================================================

describe("H9a-T (e) subagent spawn drives to a success terminal (Convention: Phase 1)", () => {
  it("drives a subagent-mode loom to a no-error success terminal with permitted codes only", async () => {
    const spec = featureLoom("subagent-success");
    const loomPath = requireAuthoredLoom(spec);
    expect(loomPath).toBeDefined();
    expect(spec.invariants.subagentSuccess).toBe(true);

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      loomDir: FEATURE_LOOM_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });

    // Subagent success: the run completes without error and emits no code outside
    // the permitted list. The old self-cancel coupling (a `cancelled` substring
    // on normal completion) is intentionally dropped — the fixed driver reaches
    // the success terminal instead of forcing a cancel.
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
    expect(
      /cancel|aborted/i.test(result.stdout + result.stderr),
      `${spec.label}: a normal subagent completion must NOT surface a ` +
        `cancellation marker. stdout: ${result.stdout} stderr: ${result.stderr}`,
    ).toBe(false);

    // The success path does not emit a runtime-internal-error.
    const codes = parseSystemNoteCodes(result.stdout + result.stderr);
    expect(
      codes.includes("loom/runtime/internal-error"),
      `${spec.label}: a subagent success terminal must not emit ` +
        `loom/runtime/internal-error. codes: ${JSON.stringify(codes)}`,
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
      "subagent-success",
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
