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

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
} from "../src/extension/production-composition";
import { readParentEnv } from "../src/extension/production-subagent-host";
import { detectSubagentRootRegime } from "../src/runtime/subagent-root-regime";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import {
  THETA_ENVELOPE_VERSION,
  THETA_RESULT_KEY,
} from "../src/runtime/subagent-envelope";

// ===========================================================================
// Registry anchors (DIAG-4).
// ===========================================================================

interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

/** The live sharded registry, read from the spec corpus exactly as the H5a gate reads it. */
const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(
        fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)),
        "utf8",
      ),
    )
    .join("\n"),
) as RegistryRow[];

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

function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

/** The `tools:` entry text, shared between the fixture and the expected message's `<path>` fill. */
const MISSING_CALLEE_ENTRY = "./no-such-callee.theta";

/**
 * The planted project-settings binder-model reference: matched by no model in
 * the fake registry below, and by none in any real one either.
 */
const UNMATCHABLE_BINDER_MODEL = "no-such-model-bug0178";

/** The one model the fake registry offers — what a resolvable reference would have to name. */
const AVAILABLE_MODEL = { id: "claude-test", provider: "anthropic", api: "anthropic-messages" };

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

/** An executable host whose rung 1 resolves (a runnable entry point exists). */
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}

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
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    // The PIC-64 host-loop-dispatch surfaces, present so no fixture below is
    // refused for a reachability reason this file is not about.
    registerProvider: (): void => {},
    unregisterProvider: (): void => {},
    setModel: (): Promise<boolean> => Promise.resolve(true),
    on: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    model: AVAILABLE_MODEL,
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [AVAILABLE_MODEL],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  // The regime is selected ONLY by the parent-launcher env marker, and the read
  // is authenticated by the parent-pid carriage — a real launcher always writes
  // both. Plant both around the compose, restore after (no leakage).
  const priorMarker = process.env["PI_THETA_SUBAGENT_ROOT"];
  const priorPid = process.env["PI_THETA_SUBAGENT_PARENT_PID"];
  if (options?.rootSlug !== undefined) {
    process.env["PI_THETA_SUBAGENT_ROOT"] = options.rootSlug;
    process.env["PI_THETA_SUBAGENT_PARENT_PID"] = String(process.ppid);
  }
  try {
    const regimeActive = detectSubagentRootRegime(readParentEnv()).active;
    const overrides: EnvelopeCapturingOverrides = {
      subagentExecutableHost: resolvingHost(),
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
    };
  } finally {
    if (priorMarker === undefined) {
      delete process.env["PI_THETA_SUBAGENT_ROOT"];
    } else {
      process.env["PI_THETA_SUBAGENT_ROOT"] = priorMarker;
    }
    if (priorPid === undefined) {
      delete process.env["PI_THETA_SUBAGENT_PARENT_PID"];
    } else {
      process.env["PI_THETA_SUBAGENT_PARENT_PID"] = priorPid;
    }
  }
}

/**
 * The note LINES (split across every note) that contain ALL of `substrings`.
 * Load-refusal notes render as `<file>: <code>: <message>`, so matching a code
 * AND the refusing theta's filename on ONE line attributes the refusal to that
 * theta — a whole-pass `toContain` would be satisfied by any other theta's
 * refusal in the same pass.
 */
function noteLinesContaining(
  noteContent: readonly string[],
  ...substrings: readonly string[]
): string[] {
  return noteContent
    .flatMap((note) => note.split("\n"))
    .filter((line) => substrings.every((substring) => line.includes(substring)));
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

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-bug0178-refusal-envelope-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  for (const fixture of THETAS) {
    writeFileSync(join(dir, `${fixture.stem}.theta`), fixture.text, "utf8");
  }
  writeFileSync(
    join(workspaceDir, ".pi", "settings.json"),
    JSON.stringify({ theta: { binderModel: UNMATCHABLE_BINDER_MODEL } }),
    "utf8",
  );
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
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
