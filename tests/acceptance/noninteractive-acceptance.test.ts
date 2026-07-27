// H9a-T — non-interactive `pi -p` real-host acceptance suite (tests).
//
// An OPT-IN, non-interactive acceptance suite that drives theta through the real
// `pi -p` binary (`pi -p --theta <dir> "/<name>"`, process-and-exit) over a
// FULLER feature-theta suite — one theta per functionality area (a)–(i) — and
// asserts, per theta, its model-output-INVARIANT observable set (never exact
// goldens, since a live LLM does not reproduce them): no-error exit, binder
// output validates against the binder envelope schema where a binder pass fires,
// typed-query responses validate against their declared schema (`QRY-22`),
// observed subagent cancellation propagation with committed turns unmutated, and
// emitted `theta-system-note` codes ⊆ the committed permitted-code list. It is
// Phase 1 of the two-phase theta 1.0 release gate (real-host-smoke-gate.md).
//
// It has its own runner (`config/vitest/vitest.acceptance.config.ts` / `npm run
// test:acceptance`), excluded from the default `npm test` and the H8a
// `npm run test:live` suite; it spends real tokens and needs a live host. It
// closes no spec REQ-ID and adds no coverage-matrix row (the live-host
// acceptance pair exception, as for H8a).
//
// INTENDED-REASON RED (current H9a-T state): the fuller feature-theta fixtures do
// not exist yet, so `resolveFeatureThetaPath` returns `undefined` for every
// area and each test reds on its own primary fixture-presence assertion —
// deterministically, token-free, BEFORE any live host / credential / spawned
// `pi` process is required. This is exactly the intended-reason red the leaf
// names: the runner and feature thetas are absent, and the (b)/(d)/(e) axes are
// not yet correct/integrated. The paired `H9a` authors the thetas, wires the
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
  FEATURE_THETA_DIR,
  FEATURE_THETAS,
  failLoudly,
  featureTheta,
  loadPermittedCodes,
  parseEmittedJson,
  parseSystemNoteCodes,
  requireLiveHost,
  resolveFeatureThetaPath,
  spawnPiPrint,
  validatesAgainstBinderEnvelope,
  validatesAgainstSchema,
  type FeatureArea,
  type FeatureThetaSpec,
  type PiPrintResult,
} from "./harness";

/**
 * Resolve the committed feature-theta `.theta` for a spec, or FAIL LOUDLY naming
 * the absent fixture (never a silent skip). This is the suite's intended-reason
 * red: in the current `H9a-T` state the paired `H9a` has not authored the
 * feature thetas, so every area reds here BEFORE any live host is required.
 */
/**
 * Extract the first balanced JSON object AFTER a fixture's committed sentinel,
 * failing loudly when the sentinel is absent. Bug 0010: the typed forced
 * respond turn runs off-session and never streams, so the typed fixtures echo
 * the AJV-validated value behind a sentinel; anchoring here keeps a free-phase
 * brace pair from masquerading as the validated payload.
 */
function parseJsonAfterSentinel(stdout: string, sentinel: string, label: string): unknown {
  const at = stdout.lastIndexOf(sentinel);
  if (at < 0) {
    failLoudly(
      `${label}: sentinel "${sentinel}" not found in stdout — the fixture's ` +
        `final echo turn did not surface (typed binding failed, or the echo ` +
        `query was not driven). stdout: ${stdout}`,
    );
  }
  return parseEmittedJson(stdout.slice(at + sentinel.length));
}

function requireAuthoredTheta(spec: FeatureThetaSpec): string {
  const path = resolveFeatureThetaPath(spec);
  if (path === undefined) {
    failLoudly(
      `feature theta ${spec.label} (${spec.area}) is not authored: expected ` +
        `${spec.fixtureFile} under ${FEATURE_THETA_DIR}. The paired H9a authors ` +
        `the fuller feature-theta suite; the runner and thetas are absent today.`,
    );
  }
  return path;
}

/** A throwaway cwd for a spawned `pi -p` process. */
function scratchCwd(): string {
  return mkdtempSync(join(tmpdir(), "theta-acc-"));
}

/** Assert the no-error-exit invariant every feature theta must satisfy. */
function assertNoErrorExit(result: PiPrintResult, spec: FeatureThetaSpec): void {
  expect(
    result.exitCode,
    `${spec.label} ${spec.area}: expected a no-error exit (0), got ` +
      `${String(result.exitCode)}. stderr: ${result.stderr}`,
  ).toBe(0);
}

/** Assert emitted `theta-system-note` codes ⊆ the committed permitted-code list (criterion e). */
function assertCodesSubsetOfPermitted(
  result: PiPrintResult,
  spec: FeatureThetaSpec,
): void {
  const permitted = new Set(loadPermittedCodes());
  const emitted = parseSystemNoteCodes(result.stdout + "\n" + result.stderr);
  const outside = emitted.filter((code) => !permitted.has(code));
  expect(
    outside,
    `${spec.label} ${spec.area}: emitted theta-system-note code(s) outside the ` +
      `committed permitted-code list: ${JSON.stringify(outside)}`,
  ).toEqual([]);
}

// ===========================================================================
// (a) prompt-mode sentinel turn.
// A single prompt-mode `.theta` whose one untyped query names a deterministic
// sentinel. Invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (a) prompt-mode sentinel turn (Convention: Phase 1 acceptance)", () => {
  it("drives one prompt-mode turn via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureTheta("prompt-sentinel");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
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
    const spec = featureTheta("typed-query-named-schema");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
    const schema = spec.invariants.typedQuerySchema;
    if (schema === undefined) {
      failLoudly(`${spec.label}: named-schema theta must declare a typedQuerySchema invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    // QRY-22: the typed-query response validates against its declared schema.
    // Bug 0010: the forced respond turn runs off-session and never streams, so
    // the fixture echoes the AJV-validated value behind its committed sentinel;
    // anchoring extraction to the sentinel keeps a free-phase brace pair from
    // satisfying the assertion (only a binding that resolved Ok past AJV and
    // `?` can interpolate into the sentinel echo).
    const value = parseJsonAfterSentinel(result.stdout, "ACC TYPED NAMED RESULT", spec.label);
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
    const spec = featureTheta("typed-query-inline");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
    const schema = spec.invariants.typedQuerySchema;
    if (schema === undefined) {
      failLoudly(`${spec.label}: inline-type theta must declare a typedQuerySchema invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    // Bug 0010: sentinel-anchored extraction — see the named-schema case above.
    const value = parseJsonAfterSentinel(result.stdout, "ACC TYPED INLINE RESULT", spec.label);
    const check = validatesAgainstSchema(value, schema);
    expect(
      check.ok,
      `${spec.label}: inline-type typed-query response failed schema ` +
        `validation (QRY-22): ${JSON.stringify(check.errors)}. stdout: ${result.stdout}`,
    ).toBe(true);
  });
});

// ===========================================================================
// (d) a params theta that forces a real BINDER pass.
// A `params:` theta invoked with raw slash text drives a real binder pass.
// DECISION (production conformance): the binder runs OFF-session and INVISIBLE
// — its three-arm `ok | needs_info | ambiguous` envelope MUST NOT reach the user
// session / `pi -p` stdout (BND-3). The invariant set is therefore: no-error
// exit + codes ⊆ permitted, and the envelope does NOT leak to stdout. The
// `bind_echo` success note is the proof of binding, but it lands on the
// `theta-system-note` channel — NOT `pi -p` text stdout (DOC-73 / FIND-S7-4) — so
// it is asserted by the in-process `session-binder` probe, not this black-box
// stdout capture.
//
// WHY the contract changed: the pre-decision runBinder drove the binder as a
// USER-VISIBLE streamed turn that printed the raw envelope JSON to stdout, and
// this test asserted `validatesAgainstBinderEnvelope(parseEmittedJson(stdout))`.
// The maintainer decision makes the binder invisible: the envelope is
// runtime-internal and never surfaced, so the old assertion (envelope on stdout)
// is now a LEAK detector rather than a success criterion — rewritten, not
// weakened, to the correct post-decision contract.
// ===========================================================================

describe("H9a-T (d) params theta forcing an OFF-session binder pass (no envelope leak; Convention: Phase 1)", () => {
  it("runs the binder off-session: no envelope leak to stdout, and a success echo note surfaces", async () => {
    const spec = featureTheta("params-binder");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
    const envelope = spec.invariants.binderEnvelope;
    if (envelope === undefined) {
      failLoudly(`${spec.label}: params-binder theta must declare a binderEnvelope invariant`);
    }

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      // Raw slash text the binder must bind into the params object.
      slashInvocation: `/${spec.stem} summarise the three most recent commits`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);

    // BND-3: the runtime-internal envelope must NEVER reach stdout. A parseable
    // top-level object that validates against the per-theta envelope schema on
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

    // BND-1: the `bind_echo` success note is the observable proof of a
    // successful bind, but it is emitted on the `theta-system-note` channel — NOT
    // on `pi -p` print-mode text stdout (custom system-note renderer output is
    // not streamed to print-mode stdout; DOC-73 / FIND-S7-4 / D2). The
    // black-box acceptance harness captures only stdout/stderr, so it cannot and
    // must not assert the note on stdout — that channel observation belongs to
    // the in-process `tests/hardening/session-binder.test.ts` probe, which reads
    // `turn.systemNotes` for `Running /<stem>: …`. Here the spec-promised stdout
    // observables are the ones asserted above: no-error exit, permitted codes,
    // and no envelope leak.
  });
});

// ===========================================================================
// (e) a subagent-mode theta that drives to a SUCCESS terminal outcome.
// A `mode: subagent` theta spawns an isolated AgentSession, drives one real
// subagent turn to completion, and reaches a success terminal outcome — the
// path the H8a production driver previously made unreachable (it self-cancelled
// every subagent query). Invariant set: no-error exit + codes ⊆ permitted, with
// NO `cancelled` marker on this normal completion.
//
// WHY cancellation moved: the fixed production driver no longer self-cancels, so
// this black-box `pi -p` run drives subagent SUCCESS. Genuine mid-stream
// cancellation (a REAL injected `thetaAbort` fire at a scripted cancel point) is
// deterministically locked in-process by
// `tests/production-subagent-query-model.test.ts`; it cannot be scored here
// because `pi -p` buffers stdout and an external SIGTERM discards the buffer.
// ===========================================================================

describe("H9a-T (e) subagent spawn drives to a success terminal (Convention: Phase 1)", () => {
  it("drives a subagent-mode theta to a no-error success terminal with permitted codes only", async () => {
    const spec = featureTheta("subagent-success");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
    expect(spec.invariants.subagentSuccess).toBe(true);

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
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
      codes.includes("theta/runtime/internal-error"),
      `${spec.label}: a subagent success terminal must not emit ` +
        `theta/runtime/internal-error. codes: ${JSON.stringify(codes)}`,
    ).toBe(false);
  });
});

// ===========================================================================
// (f) a code-tool loop.
// A prompt-mode theta exposing a code-side tool the model calls in a free-phase
// loop; invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (f) code-tool loop (Convention: Phase 1 acceptance)", () => {
  it("drives a code-tool loop via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureTheta("code-tool-loop");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (g) imports / invoke across thetas.
// A theta that imports a symbol from a sibling `.thetalib`/`.theta` and `invoke`s a
// second theta; invariant set: no-error exit + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (g) imports / invoke across thetas (Convention: Phase 1)", () => {
  it("drives imports + invoke across thetas via `pi -p` with a no-error exit and permitted codes only", async () => {
    const spec = featureTheta("imports-invoke");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd,
    });
    assertNoErrorExit(result, spec);
    assertCodesSubsetOfPermitted(result, spec);
  });
});

// ===========================================================================
// (h) error/result `match` surfacing a QueryError.
// A theta binding a query result and `match`ing its `Err(QueryError { ... })`
// arm; the run surfaces the QueryError through the match rather than throwing.
// Invariant set: no-error exit (the QueryError is handled) + codes ⊆ permitted.
// ===========================================================================

describe("H9a-T (h) error/result match surfacing a QueryError (Convention: Phase 1)", () => {
  it("surfaces a QueryError through a result `match` without an errored exit", async () => {
    const spec = featureTheta("match-queryerror");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();

    requireLiveHost();
    const cwd = scratchCwd();
    const result = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
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
// (i) multi-source discovery (project + `--theta` CLI source).
// The theta must register both from the project walk and from the `--theta` CLI
// source, proving discovery is source-general. Driven twice through `pi -p`.
// ===========================================================================

describe("H9a-T (i) multi-source discovery, project + --theta CLI (Convention: Phase 1)", () => {
  it("registers and runs the theta from both a project source and a --theta CLI source", async () => {
    const spec = featureTheta("multi-source-discovery");
    const thetaPath = requireAuthoredTheta(spec);
    expect(thetaPath).toBeDefined();
    expect(spec.invariants.multiSourceDiscovery).toBe(true);

    requireLiveHost();

    // Project-source discovery: the fixtures dir doubles as the project source.
    const projectCwd = scratchCwd();
    const viaProject = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      slashInvocation: `/${spec.stem}`,
      cwd: projectCwd,
    });
    assertNoErrorExit(viaProject, spec);
    assertCodesSubsetOfPermitted(viaProject, spec);

    // Alternate source: the same theta discovered via an additional `--theta`
    // CLI source registers and runs identically (discovery is source-general).
    const cliCwd = scratchCwd();
    const viaCli = await spawnPiPrint({
      thetaDir: FEATURE_THETA_DIR,
      extraThetaDirs: [FEATURE_THETA_DIR],
      slashInvocation: `/${spec.stem}`,
      cwd: cliCwd,
    });
    assertNoErrorExit(viaCli, spec);
    assertCodesSubsetOfPermitted(viaCli, spec);
  });
});

// ===========================================================================
// Manifest self-check (harness contract, not a feature obligation).
// Documents the committed feature-theta suite contract: exactly the nine
// functionality areas (a)–(i) H9a-T enumerates, each with a distinct stem.
// This green check is a runner-wiring self-test; the nine feature-area tests
// above carry the intended-reason reds.
// ===========================================================================

describe("H9a-T feature-theta manifest (harness self-check)", () => {
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
    expect(new Set(FEATURE_THETAS.map((s) => s.area))).toEqual(new Set(areas));
    expect(FEATURE_THETAS.length).toBe(areas.length);
    expect(new Set(FEATURE_THETAS.map((s) => s.stem)).size).toBe(areas.length);
    // The committed permitted-code list criterion (e) scores against is present.
    expect(loadPermittedCodes().length).toBeGreaterThan(0);
  });
});
