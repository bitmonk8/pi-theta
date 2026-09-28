// Bug 0178, element (b) — a spawned subagent child that REFUSES to register its
// marked root theta must say so on the one channel the parent reads. Today it
// says nothing: the load diagnostic goes to the child's own process-local
// `LoadDiagnosticSink`, the `theta_result` envelope is written only from inside
// `driveSubagentRootRegime` (`src/extension/production-theta-producer.ts`) —
// which an unregistered theta never reaches — and the host then treats the
// child's `-p "/<slug>"` argv as ordinary prompt text. The parent's
// `driveSubagentChild` (`src/runtime/subagent-json-driver.ts`) takes its
// no-envelope exit arm and mints `theta/runtime/subagent-exit-without-envelope`,
// whose message is built from the exit detail alone — so a load refusal in
// another process is rendered as `exited code 0`.
//
// WHAT ELEMENT (b) OWES. At the moment of refusal the compose pass holds both
// facts: the regime (bound from `detectSubagentRootRegime`,
// `src/runtime/subagent-root-regime.ts`) and the identity of the theta it is
// refusing. After its registration loop it must write ONE PIC-59 `theta_result`
// err envelope carrying `InvokeInfraError { kind: "invoke_infra", cause:
// "load_failure", callee_path: <the theta's discovered path or its slug>,
// message: "subagent child refused to register its root theta '/<slug>': <code>:
// <message>" }` — or `"…'/<slug>': no load diagnostic names it"` when no
// error-severity diagnostic is located at that theta's file. The writer becomes
// an injectable seam on `ComposeSeamOverrides` (`emitResultEnvelope`, defaulting
// to `createProductionEnvelopeWriter`), which is the seam this file drives.
//
// ELEMENT (b) DOES NOT PREVENT THE STRAY MODEL TURN. §Fix (b)'s third open
// question records the limit: emitting the envelope does not stop the host from
// processing the argv prompt. Nothing here asserts otherwise, and the
// stdout-line observable that would measure it lives in the integration-tier
// witness, `tests/subagent-root-binder-model-exempt.test.ts`.
//
// TIER: in-process composition root — the real `composeExtensionInstance` over a
// fake `ExtensionAPI` / `ExtensionContext`, thetas discovered from a temp
// workspace, ZERO spawned processes, no provider, no tokens, deterministic. A
// narrower unit test cannot reach it: the decision is a property of the WHOLE
// load pass — the regime read, the per-theta registration loop, the load
// diagnostics the refusal actually produced, and the envelope writer — and none
// of those is a function this file could call in isolation without re-deciding
// the very wiring under test. A real spawned child (the tier above) would only
// re-observe the consequence through the parent's error carrier and would cost a
// process and a model turn to pin one JSON line this seam yields exactly.
//
// DIAGNOSTIC MESSAGES ARE SOURCED FROM THE REGISTRY (DIAG-4), never copied as
// prose: every expected message below comes from the sharded registry tables via
// `registryMessage`, so a registry edit moves the assertion with it.
//
// HERMETICITY. `theta.binderModel` is read from the operator's own
// `~/.pi/agent/settings.json` as well as `<cwd>/<config-dir>/settings.json`, and
// `mergeSettings` (`src/discovery/settings.ts`) replaces a scalar wholesale with
// the project side. Cells 4 and 5 turn on the setting resolving to NO model, so
// the workspace plants a project settings file naming a reference no host
// registry can match rather than depending on the operator's global file being
// empty. (Measured: swapping the planted reference for one the fake registry
// does match flips the same theta to registered, so the file is read and
// load-bearing.)
//
// THE REGIME PLANT IS AUTHENTICATED. `detectSubagentRootRegime` reads the marker
// through `readParentEnv`, and that read honours `PI_THETA_*` only when
// `PI_THETA_SUBAGENT_PARENT_PID` names the reading process's real parent
// (`subagent.md` #subagent-control-plane-authentication). Both variables are
// planted and restored around each compose, and every cell asserts the
// `regimeActive` premise it depends on — a stripped marker would otherwise
// degrade a regime cell into silently testing the non-regime leg twice.
//
// LOCKS THIS FILE DOES NOT TOUCH. §Fix (c)(1) requires the ordinary slash surface
// not to move: `tests/binder-model-resolution.test.ts` and
// `tests/binder-bypass-envelope.test.ts` pin the gate's own behaviour and no
// assertion in either is edited. Cell 4 below is the additive composition-level
// mirror of that constraint.
//
// Spec: pi-integration-contract/subagent.md #pic-58 (the regime), #pic-59 (the
// single `theta_result` envelope line and the fail-closed no-envelope rule),
// #pic-60 (the marshalled path skips the binder entirely),
// #subagent-control-plane-authentication; binder/binder-model-and-context.md
// §Binder model (the refusal rule the regime must not reach);
// diagnostics/code-registry-load.md (`theta/load/unresolvable-theta-path`,
// `theta/load/binder-model-unresolved`); diagnostics/diagnostic-shape.md #diag-4
// (the *Message* column is normative and asserting tests source it from there).
import { fakeExecutableHost } from "./helpers/fake-json-child";
import { makeIdleModelHost, noteLinesContaining } from "./helpers/compose-workspace-harness";
import { REGISTRY } from "./helpers/registry-oracle";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { plantThetaWorkspace, disposeWorkspace, theta } from "./helpers/production-load-harness";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { registryMessage } from "../tools/code-registry/index.js";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
} from "../src/extension/production-composition";
import { readParentEnv } from "../src/extension/production-subagent-host";
import { detectSubagentRootRegime } from "../src/runtime/subagent-root-regime";

import {
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import type { SubagentChildControlPlane } from "../src/runtime/subagent-launch-file";
import type { ResultChannelClient } from "../src/runtime/subagent-result-channel";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import { SUBAGENT_CHILD_OUTCOME_CHANNEL } from "../src/runtime/subagent-placement-registry";
import { inertWatchdogSeams } from "./helpers/inert-parent-watchdog";
import {
  createEnvSandbox,
  restoreAmbientControlPlane,
  scrubAmbientControlPlane,
  type AmbientControlPlaneSnapshot,
} from "./helpers/ambient-control-plane-scrub";

// ===========================================================================
// Registry anchors (DIAG-4).
// ===========================================================================

/** The refusal cell 1 uses: a `tools:` `.theta` entry whose path does not resolve. */
const UNRESOLVABLE_PATH_CODE = "theta/load/unresolvable-theta-path";
/** The refusal cells 4 and 5 turn on. */
const BINDER_MODEL_UNRESOLVED_CODE = "theta/load/binder-model-unresolved";

/** A row's normative *Message* template, asserted defined first so a missing row names the registry. */
function normativeMessage(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
  ).toBeDefined();
  return template as string;
}

// ===========================================================================
// Fixtures.
// ===========================================================================

/** The `tools:` entry text, shared between the fixture and the expected message's `<path>` fill. */
const MISSING_CALLEE_ENTRY = "./no-such-callee.theta";

/**
 * The planted project-settings binder-model reference: matched by no model in
 * the fake registry below, and by none in any real one either.
 */
const UNMATCHABLE_BINDER_MODEL = "no-such-model-bug0178";

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // The NON-binder-model refusal. No `params:`, so it is bypass-eligible and
  // element (a) cannot rescue it: whatever route (a) takes, this theta still
  // fails to register, which is what makes it the stable subject for (b).
  {
    stem: "refused",
    text: theta("---", "mode: subagent", "tools:", `  - ${MISSING_CALLEE_ENTRY}`, "---", '"x"'),
  },
  // The clean marked root: registers, so the load pass owes no envelope.
  { stem: "clean", text: theta("---", "mode: subagent", "---", '"ok"') },
  // The binder-model refusal: `array<string>` is non-bypass
  // (binder-bypass-and-envelope.md #bypass-cases), no `bind_model:`, and the
  // planted setting resolves to nothing.
  {
    stem: "bmroot",
    text: theta("---", "mode: subagent", "params:", "  xs: array<string>", "---", "xs[0]"),
  },
];

/**
 * The compose-pass overrides plus the element-(b) envelope seam. Written as an
 * intersection rather than by extending `ComposeSeamOverrides` so this file
 * type-checks against the tree BOTH before the seam exists (it is an extra
 * property on a wider object, ignored at runtime, so the cells red on the
 * ABSENT envelope rather than on a compile error) and after it lands with the
 * signature §Fix (b) pins.
 */
type EnvelopeCapturingOverrides = ComposeSeamOverrides & {
  readonly emitResultEnvelope: (line: string) => void;
};

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
  /** Every line handed to the envelope writer during the load pass. */
  readonly captured: readonly string[];
  /** The regime the compose pass detected — every cell's own premise probe. */
  readonly regimeActive: boolean;
  /** M15: every `[channel, data]` pair the load pass emitted on the fake `pi.events` bus. */
  readonly outcomeEmitted: readonly { readonly channel: string; readonly data: unknown }[];
}

async function runLoad(
  cwd: string,
  options?: {
    /** The slug the parent launcher would have marked; omitted for the non-regime leg. */
    readonly rootSlug?: string;
  },
): Promise<LoadOutcome> {
  const noteContent: string[] = [];
  const captured: string[] = [];
  const outcomeEmitted: { channel: string; data: unknown }[] = [];
  const { pi: basePi, ctx } = makeIdleModelHost(cwd, true);
  const pi = {
    ...basePi,
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    // M15: a minimal `pi.events` bus — the load-pass registration-refusal
    // envelope writer (bug 0178 element (b)) is a LOAD-pass write outside
    // `driveSubagentRootRegime`, and it is the refused child's ONLY
    // outcome-event emitter (bug 0493 D1 (a); see the M15 cell below).
    events: {
      emit: (channel: string, data: unknown): void => {
        outcomeEmitted.push({ channel, data });
      },
      on: (): (() => void) => (): void => {},
    },
  } as unknown as ExtensionAPI;

  // The regime is selected ONLY by the parent-launcher env marker, and the read
  // is authenticated by the parent-pid carriage — a real launcher always writes
  // both. Plant both around the compose, restore after (no leakage).
  const { setEnv, restoreEnv } = createEnvSandbox();
  // Capture both keys even in the parent leg, preserving the unconditional restore.
  setEnv(
    "PI_THETA_SUBAGENT_ROOT",
    options?.rootSlug !== undefined ? options.rootSlug : process.env["PI_THETA_SUBAGENT_ROOT"],
  );
  setEnv(
    "PI_THETA_SUBAGENT_PARENT_PID",
    options?.rootSlug !== undefined ? String(process.ppid) : process.env["PI_THETA_SUBAGENT_PARENT_PID"],
  );
  try {
    const regimeActive = detectSubagentRootRegime(readParentEnv()).active;
    const overrides: EnvelopeCapturingOverrides = {
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentWatchdogSeams: inertWatchdogSeams(),
      emitResultEnvelope: (line: string): void => {
        captured.push(line);
      },
    };
    const wiring = await composeExtensionInstance(pi, ctx, overrides);
    return {
      registered: wiring.thetas.map((t) => t.slashName),
      noteContent,
      captured,
      regimeActive,
      outcomeEmitted,
    };
  } finally {
    restoreEnv();
  }
}

/**
 * The `err` carrier of the single captured envelope. When the pass captured
 * anything other than exactly one parseable envelope line, returns a stand-in
 * that NAMES what was captured instead — so each field assertion below reds with
 * a legible reason rather than throwing and hiding its siblings.
 */
function capturedErrCarrier(captured: readonly string[]): Record<string, unknown> {
  if (captured.length !== 1) {
    return { absent: true, captured_line_count: captured.length, captured };
  }
  const line = captured[0] as string;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (parseError: unknown) {
    return {
      unparseable: true,
      line,
      detail: parseError instanceof Error ? parseError.message : String(parseError),
    };
  }
  const envelope = (parsed as Record<string, unknown> | null)?.[THETA_RESULT_KEY];
  if (typeof envelope !== "object" || envelope === null) {
    return { no_reserved_key: true, line };
  }
  const payload = envelope as Record<string, unknown>;
  const err = payload["err"];
  if (typeof err !== "object" || err === null) {
    return { no_err_arm: true, version: payload["v"], line };
  }
  return { ...(err as Record<string, unknown>), __version: payload["v"] };
}

// ===========================================================================
// Workspace.
// ===========================================================================

let workspaceDir: string;
/** Ambient control plane carried by the RUNNING process, parked for this file. */
let ambientControlPlane: AmbientControlPlaneSnapshot | undefined;

beforeAll(() => {
  // Bug 0474 §Residual: `runLoad` simulates a subagent CHILD in-process by
  // planting `PI_THETA_SUBAGENT_ROOT` + a real-ppid `PI_THETA_SUBAGENT_PARENT_PID`.
  // An ambient control plane on `process.env` (a `npm test` run from inside a
  // subagent child) authenticates by the same rule and preempts the planted
  // one, so scrub it for the whole file and restore it afterwards.
  ambientControlPlane = scrubAmbientControlPlane();
  workspaceDir = plantThetaWorkspace(
    "theta-bug0178-refusal-envelope-",
    THETAS,
    JSON.stringify({ theta: { binderModel: UNMATCHABLE_BINDER_MODEL } }),
  );
});

afterAll(() => {
  disposeWorkspace(workspaceDir);
  if (ambientControlPlane !== undefined) {
    restoreAmbientControlPlane(ambientControlPlane);
    ambientControlPlane = undefined;
  }
});

describe("bug 0178 element (b) — a child-side refusal of the MARKED ROOT theta reaches the parent as a PIC-59 envelope", () => {
  it("(1) the marked root refused for a NON-binder-model reason produces exactly one theta_result err envelope naming the refusal", async () => {
    const outcome = await runLoad(workspaceDir, { rootSlug: "refused" });

    // Premise: the compose pass genuinely ran under the regime. Without this the
    // cell could go vacuously green in the non-regime leg.
    expect(outcome.regimeActive).toBe(true);
    // Premise: the subject really is refused, and refused for the reason this
    // cell names — attributed to its own file, not to another theta's note.
    expect(
      outcome.registered,
      `the subject must NOT register for this cell to mean anything — registered: ` +
        JSON.stringify(outcome.registered),
    ).not.toContain("refused");
    expect(
      noteLinesContaining(outcome.noteContent, "refused.theta", UNRESOLVABLE_PATH_CODE).length,
      `refused.theta must be the theta carrying ${UNRESOLVABLE_PATH_CODE} — notes: ` +
        JSON.stringify(outcome.noteContent),
    ).toBeGreaterThan(0);

    // PIC-59 fixes ONE envelope line per process. Soft from here on so a single
    // run names every part of the carrier that is wrong or missing.
    expect
      .soft(
        outcome.captured.length,
        "the load pass must write exactly one theta_result line when the marked root did not " +
          "register — today it writes none, the child falls through to the host's prompt " +
          "handling, and the parent sees only `exited code 0`. Captured: " +
          JSON.stringify(outcome.captured),
      )
      .toBe(1);

    const err = capturedErrCarrier(outcome.captured);
    expect
      .soft(err["__version"], `the envelope carries the pinned version field — ${JSON.stringify(err)}`)
      .toBe(THETA_ENVELOPE_VERSION);
    expect
      .soft(err["kind"], `the err arm is an InvokeInfraError — ${JSON.stringify(err)}`)
      .toBe("invoke_infra");
    expect
      .soft(
        err["cause"],
        "the cause names a LOAD failure, not the exit detail PIC-59's no-envelope arm mints — " +
          JSON.stringify(err),
      )
      .toBe("load_failure");
    expect
      .soft(
        String(err["callee_path"] ?? ""),
        `the carrier names the theta that was refused — ${JSON.stringify(err)}`,
      )
      .toContain("refused");
    expect
      .soft(
        String(err["message"] ?? ""),
        `the message states WHICH root slug the child refused — ${JSON.stringify(err)}`,
      )
      .toContain("subagent child refused to register its root theta '/refused'");
    expect
      .soft(
        String(err["message"] ?? ""),
        `the message carries the refusing diagnostic's registry code — ${JSON.stringify(err)}`,
      )
      .toContain(UNRESOLVABLE_PATH_CODE);
    expect
      .soft(
        String(err["message"] ?? ""),
        `the message carries the refusing diagnostic's registry Message (DIAG-4) — ` +
          JSON.stringify(err),
      )
      .toContain(normativeMessage(UNRESOLVABLE_PATH_CODE).replace("<path>", MISSING_CALLEE_ENTRY));
  });

  it("M15: the marked-root load-refusal envelope is followed by exactly one outcome event on the pi.events channel (bug 0493 D1 (a))", async () => {
    // The load pass is a refused child's ONLY emitter (it never reaches
    // `driveSubagentRootRegime`); a silent load pass leaves a placement
    // backend's outcome consumer unaware the child failed, so it never
    // retitles the pane. The exact event shape, envelope-then-event-then-
    // shutdown ordering and presentation gating are pinned by the D1 (a) cells
    // below ("(i)" through "(iii-b)"); this cell pins the event beside the
    // bug-0178 refusal premise checks.
    const outcome = await runLoad(workspaceDir, { rootSlug: "refused" });
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).not.toContain("refused");
    // Premise: the load pass genuinely wrote the refusal envelope this file's
    // primary cell (1) pins — otherwise a zero-emission verdict here would be
    // vacuous (nothing ran at all).
    expect(outcome.captured.length).toBeGreaterThan(0);
    expect(
      outcome.outcomeEmitted,
      `the load-pass write is the refused child's ONLY emitter, so it owes the ` +
        `${SUBAGENT_CHILD_OUTCOME_CHANNEL} channel one "err" event — emitted: ` +
        JSON.stringify(outcome.outcomeEmitted),
    ).toEqual([
      { channel: SUBAGENT_CHILD_OUTCOME_CHANNEL, data: { apiVersion: 1, outcome: "err", slug: "refused" } },
    ]);
  });

  it("(2) CONTROL — a marked root that registers cleanly produces no envelope from the load pass", async () => {
    const outcome = await runLoad(workspaceDir, { rootSlug: "clean" });
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).toContain("clean");
    // The DRIVE writes the envelope for a registered root (`driveSubagentRootRegime`),
    // and it has not run here. A line written at load time would be a second
    // envelope on a channel PIC-59 fixes at one per process.
    expect(
      outcome.captured,
      "the load pass owes no envelope for a root it registered — captured: " +
        JSON.stringify(outcome.captured),
    ).toEqual([]);
  });

  it("(3) CONTROL — outside the regime the same refused theta produces no envelope", async () => {
    const outcome = await runLoad(workspaceDir);
    // Premise: no marker, so the pass is the ordinary parent load.
    expect(outcome.regimeActive).toBe(false);
    expect(outcome.registered).not.toContain("refused");
    // An ordinary session's stdout is not an envelope channel; a load refusal
    // there is reported through the diagnostics channel and nothing else.
    expect(
      outcome.captured,
      "a non-regime load pass must never write a theta_result line — captured: " +
        JSON.stringify(outcome.captured),
    ).toEqual([]);
  });

  it("(4) LOCK (§Fix (c)(1)) — outside the regime a non-bypass theta with no resolvable binder model still fails to load with theta/load/binder-model-unresolved", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.regimeActive).toBe(false);
    // The slash surface does not move: the condition element (a) changes is the
    // REGIME, nothing else.
    expect(
      outcome.registered,
      `binder-model-and-context.md §Binder model: the theta's slash command is NOT registered — ` +
        `registered: ${JSON.stringify(outcome.registered)}`,
    ).not.toContain("bmroot");
    const refusalLines = noteLinesContaining(
      outcome.noteContent,
      "bmroot.theta",
      BINDER_MODEL_UNRESOLVED_CODE,
    );
    expect(
      refusalLines.length,
      `bmroot.theta itself must carry ${BINDER_MODEL_UNRESOLVED_CODE} — notes: ` +
        JSON.stringify(outcome.noteContent),
    ).toBeGreaterThan(0);
    // Same code AND same message (DIAG-4), which is the half of (c)(1) a code
    // check alone would miss.
    expect(refusalLines.join("\n")).toContain(normativeMessage(BINDER_MODEL_UNRESOLVED_CODE));
  });

  it("(5) the marked root refused for the BINDER-MODEL reason registers under the regime, so no envelope is owed", async () => {
    // The element-(a)+(b) interaction, and the seam-level mirror of the
    // integration witness's row A: under the regime the marked root is exempt
    // from binder-model resolution (subagent.md #pic-60 — the binder is
    // unreachable on the marshalled path), so it REGISTERS, and a registered
    // root owes the load pass no envelope. Pre-fix this cell reds on
    // `registered: false`; the zero-envelope half already holds today for the
    // wrong reason (nothing writes envelopes at load time at all), which is why
    // both halves are asserted together.
    const outcome = await runLoad(workspaceDir, { rootSlug: "bmroot" });
    expect(outcome.regimeActive).toBe(true);
    expect
      .soft(
        outcome.registered,
        "the marked root must register: skipping binder-model resolution under the regime also " +
          "skips the strict-capability probe it gates (§Fix (c)(3)), so nothing downstream " +
          "refuses it either. Registered: " + JSON.stringify(outcome.registered),
      )
      .toContain("bmroot");
    expect
      .soft(
        outcome.captured,
        "a registered marked root owes no load-time envelope — captured: " +
          JSON.stringify(outcome.captured),
      )
      .toEqual([]);
  });
});

// ===========================================================================
// Bug 0493 D1 (a) — the refusal ends the child it declared useless.
// ===========================================================================
//
// A refused marked root means the theta never ran, so there is no live session
// worth a human reading. After the envelope the load pass owes two more
// effects, in this order (RFC 0012 §7's Ok-arm order): the child outcome event
// with `outcome: "err"` (so a placement backend's outcome consumer retitles the
// pane), then — under VISIBLE presentation only — `ctx.shutdown()`. A headless
// child requests nothing: its `-p` run ends the process by itself.
//
// The control plane is handed in through `subagentControlPlane` rather than
// planted on `process.env`, because presentation only exists on the
// launch-file view (`SubagentChildControlPlane.launch.presentation`). The
// visible leg names a result channel, so a fake client stands in for the socket
// the compose would otherwise dial; the envelope still reaches the capturing
// writer, which takes precedence over the channel.
//
// Spec: docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md
// §Fix "D1 (a)" and §"Witnesses" 1; subagent.md #subagent-child-outcome-event,
// #subagent-visible-presentation.

/** One observable effect of the refusal emission, in the order it happened. */
type RefusalEffect =
  | { readonly kind: "envelope"; readonly line: string }
  | { readonly kind: "event"; readonly channel: string; readonly data: unknown }
  | { readonly kind: "shutdown" };

interface RefusalExitOutcome {
  readonly registered: readonly string[];
  readonly effects: readonly RefusalEffect[];
  readonly regimeActive: boolean;
}

/** A result channel that goes nowhere — the visible leg must not dial a real socket. */
function inertResultChannel(): ResultChannelClient {
  return { writeLine: (): void => {}, stderr: (): void => {}, close: (): void => {} };
}

function refusalControlPlane(
  rootSlug: string,
  presentation: "visible" | "headless" | "pipe",
): SubagentChildControlPlane {
  const env = {
    [SUBAGENT_ROOT_ENV_MARKER]: rootSlug,
    [SUBAGENT_PARENT_PID_ENV]: String(process.ppid),
  };
  if (presentation === "pipe") {
    // `pipe` carries its control plane on the env and consumes no launch file.
    return { env, entry: { kind: "theta" } };
  }
  return {
    env,
    entry: { kind: "theta" },
    launch: {
      nonce: "n-b0493",
      presentation,
      ...(presentation === "visible" ? { channel: { port: 45093, token: "t-b0493" } } : {}),
    },
  };
}

async function runRefusalExit(
  cwd: string,
  rootSlug: string,
  presentation: "visible" | "headless" | "pipe",
  options?: { readonly subscriberThrows?: boolean },
): Promise<RefusalExitOutcome> {
  const effects: RefusalEffect[] = [];
  const { pi: basePi, ctx: baseCtx } = makeIdleModelHost(cwd, presentation === "visible");
  const pi = {
    ...basePi,
    events: {
      emit: (channel: string, data: unknown): void => {
        effects.push({ kind: "event", channel, data });
        if (options?.subscriberThrows === true) {
          throw new Error("outcome subscriber exploded");
        }
      },
      on: (): (() => void) => (): void => {},
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    ...baseCtx,
    shutdown: (): void => {
      effects.push({ kind: "shutdown" });
    },
  } as typeof baseCtx;
  const controlPlane = refusalControlPlane(rootSlug, presentation);
  const overrides: EnvelopeCapturingOverrides = {
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentWatchdogSeams: inertWatchdogSeams(),
    subagentControlPlane: controlPlane,
    ...(presentation === "visible" ? { subagentResultChannel: inertResultChannel() } : {}),
    emitResultEnvelope: (line: string): void => {
      effects.push({ kind: "envelope", line });
    },
  };
  const wiring = await composeExtensionInstance(pi, ctx, overrides);
  return {
    registered: wiring.thetas.map((t) => t.slashName),
    effects,
    regimeActive: detectSubagentRootRegime(controlPlane.env).active,
  };
}

function effectKinds(effects: readonly RefusalEffect[]): readonly string[] {
  return effects.map((effect) => effect.kind);
}

describe("bug 0493 D1 (a) — the marked-root registration refusal emits the child outcome event and, when visible, requests shutdown", () => {
  it("(i) the refusal emits exactly one outcome event { apiVersion: 1, outcome: \"err\", slug: <regime slug> } on the child outcome channel", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "visible");
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).not.toContain("refused");
    // Premise: the refusal envelope itself was written, so the pass really took
    // the refusal branch this cell is about.
    expect(effectKinds(outcome.effects).filter((kind) => kind === "envelope")).toEqual(["envelope"]);

    const events = outcome.effects.filter((effect) => effect.kind === "event");
    expect(
      events,
      `the refusal must tell ${SUBAGENT_CHILD_OUTCOME_CHANNEL} consumers the child failed — ` +
        `effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual([
      {
        kind: "event",
        channel: SUBAGENT_CHILD_OUTCOME_CHANNEL,
        data: { apiVersion: 1, outcome: "err", slug: "refused" },
      },
    ]);
  });

  it("(ii) under VISIBLE presentation the refusal calls ctx.shutdown() exactly once", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "visible");
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).not.toContain("refused");
    expect(effectKinds(outcome.effects)).toContain("envelope");
    expect(
      effectKinds(outcome.effects).filter((kind) => kind === "shutdown"),
      "a visible child has no `-p` exit; a refused one owes a shutdown request or it idles forever — " +
        `effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual(["shutdown"]);
  });

  it("(iii) under `pipe` the refusal does NOT call ctx.shutdown() — its `-p` run self-ends — but still emits the outcome event", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "pipe");
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).not.toContain("refused");
    expect(effectKinds(outcome.effects)).toContain("envelope");
    expect(
      effectKinds(outcome.effects).filter((kind) => kind === "shutdown"),
      `a headless child requests no shutdown — effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual([]);
    expect(
      outcome.effects.filter((effect) => effect.kind === "event"),
      `the outcome event is presentation-independent — effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual([
      {
        kind: "event",
        channel: SUBAGENT_CHILD_OUTCOME_CHANNEL,
        data: { apiVersion: 1, outcome: "err", slug: "refused" },
      },
    ]);
  });

  it("(iii-b) a non-visible LAUNCH-FILE presentation (`headless`) requests no shutdown either", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "headless");
    expect(outcome.regimeActive).toBe(true);
    expect(effectKinds(outcome.effects)).toContain("envelope");
    expect(effectKinds(outcome.effects).filter((kind) => kind === "shutdown")).toEqual([]);
  });

  it("(iv) the effects are ordered envelope → outcome event → shutdown", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "visible");
    expect(outcome.regimeActive).toBe(true);
    expect(
      effectKinds(outcome.effects),
      `RFC 0012 §7 order: the envelope is on the wire before anyone is told the outcome, ` +
        `and both precede the shutdown request — effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual(["envelope", "event", "shutdown"]);
  });

  it("(v) a THROWING outcome subscriber does not alter the terminal path: the compose settles, the envelope precedes the event, and a visible child still requests shutdown", async () => {
    const outcome = await runRefusalExit(workspaceDir, "refused", "visible", { subscriberThrows: true });
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).not.toContain("refused");
    expect(
      effectKinds(outcome.effects),
      "subagent.md #subagent-child-outcome-event: a subscriber's throw MUST NOT alter the child's " +
        `terminal path — effects: ${JSON.stringify(outcome.effects)}`,
    ).toEqual(["envelope", "event", "shutdown"]);
  });

  it("CONTROL — a marked root that registers cleanly writes no envelope, emits no event and requests no shutdown from the load pass", async () => {
    const outcome = await runRefusalExit(workspaceDir, "clean", "visible");
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).toContain("clean");
    // The drive, not the load pass, owns every effect for a registered root.
    expect(outcome.effects).toEqual([]);
  });
});
