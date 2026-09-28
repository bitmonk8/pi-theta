// Bug 0493 D2 — a print-mode parent whose top-level drive ends non-Ok must be
// distinguishable from success at the process boundary.
//
// On the pinned pi host, `pi -p` prints and exit-codes ONLY from a trailing
// assistant message, and flushes nothing to the session file until one exists.
// A top-level theta drive that ends Err / cancelled / panic before any `@` turn
// produces only a `theta-system-note` CUSTOM message — so on the host alone the
// run exits 0 with empty stdout and leaves no evidence at all.
//
// The fix hands the producer a PRINT-MODE FAILURE SURFACE, defined iff
// `ctx.mode` is `"print"` or `"json"` AND the process is not a subagent child
// (a child's failure surface is its PIC-59 envelope). Both terminal non-Ok note
// methods — `emitTopLevelErrNote` (SLSH-3 Err and the cancelled rendering) and
// `emitPanicNote` (both panic framings) — call it after their note:
//
//   - `mirrorLine(content)` — the rendered note text plus "\n" to stderr;
//   - `markFailed()` — `process.exitCode = 1`, assigning only, never lowering a
//     larger code already set.
//
// THE SEAMS THESE CELLS BIND:
//
//   ProductionProducerInput.printModeFailureSurface?: {
//     mirrorLine(text: string): void;
//     markFailed(): void;
//   }
//   ComposeSeamOverrides.printModeFailureProcess?: {
//     writeStderr(text: string): void;
//     readExitCode(): number | string | null | undefined;
//     writeExitCode(code: number): void;
//   }
//     — the process seams the composition builds the surface over; production
//       default: `process.stderr.write` and `process.exitCode`.
//
// TIER: unit (producer cells over `createProductionProducerDeps`) and
// in-process composition (the real factory + `composeExtensionInstance` over a
// planted workspace, each theta driven offline to one of the four endings).
// No provider, no tokens, no processes.
//
// Spec: docs/bugs/0493-visible-children-no-parent-tether-silent-print-parent.md
// §Fix "D2" and §"Witnesses" 4.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { rootDouble } from "./helpers/subagent-fn-child-regime";
import { disposeWorkspace, plantThetaWorkspace, theta } from "./helpers/production-load-harness";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import {
  restoreAmbientControlPlane,
  scrubAmbientControlPlane,
  type AmbientControlPlaneSnapshot,
} from "./helpers/ambient-control-plane-scrub";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import {
  composeExtensionInstance,
  type ComposeSeamOverrides,
  type PrintModeFailureProcess,
} from "../src/extension/production-composition";
import {
  createProductionProducerDeps,
  type ProductionProducerInput,
} from "../src/extension/production-theta-producer";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";
import type { SubagentChildControlPlane } from "../src/runtime/subagent-launch-file";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import type { CancelledError, TransportError } from "../src/runtime/query-error";

type SurfaceProducerInput = ProductionProducerInput;
type FailureProcessOverrides = ComposeSeamOverrides;

const DASH = "\u2014";

// ===========================================================================
// Producer cells — the two terminal non-Ok note methods call the surface.
// ===========================================================================

interface ProducerRig {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  /** Every effect in order: a system note's content, or a surface call. */
  readonly effects: string[];
}

function producerRig(surface: boolean): ProducerRig {
  const effects: string[] = [];
  const pi = {
    sendMessage: (message: { customType: string; content: string }): void => {
      if (message.customType === SYSTEM_NOTE_CHANNEL) {
        effects.push(`note:${message.content}`);
      }
    },
  } as unknown as ExtensionAPI;
  const input: SurfaceProducerInput = {
    pi,
    root: rootDouble(),
    modelRegistry: { getAvailable: (): readonly unknown[] => [] } as unknown as ModelRegistry,
    ...(surface
      ? {
          printModeFailureSurface: {
            mirrorLine: (text: string): void => {
              effects.push(`mirror:${text}`);
            },
            markFailed: (): void => {
              effects.push("failed");
            },
          },
        }
      : {}),
  };
  return { deps: createProductionProducerDeps(input), effects };
}

function transportLeaf(message: string): TransportError {
  return { kind: "transport", message, http_status: null, provider: "anthropic-messages", retryable: false };
}

function cancelledLeaf(): CancelledError {
  return { kind: "cancelled", message: "theta cancelled" };
}

function panicDiagnostic(): Diagnostic {
  return {
    severity: "error",
    code: "theta/runtime/index-out-of-bounds",
    file: "/theta/demo.theta",
    range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
    message: "index out of bounds: 5 not in 0..2",
  };
}

describe("bug 0493 D2 — the producer's terminal non-Ok notes reach the print-mode failure surface", () => {
  it("SLSH-3 Err: the note, then mirrorLine(<the same rendered content>), then markFailed()", () => {
    const { deps, effects } = producerRig(true);
    deps.emitTopLevelErrNote("demo", transportLeaf("boom"));
    const content = `theta /demo returned Err: transport ${DASH} boom`;
    expect(effects).toEqual([`note:${content}`, `mirror:${content}`, "failed"]);
  });

  it("cancelled (the SNK-f rendering through emitTopLevelErrNote): mirrored and marked failed", () => {
    const { deps, effects } = producerRig(true);
    deps.emitTopLevelErrNote("demo", cancelledLeaf());
    expect(effects).toEqual(["note:theta /demo cancelled", "mirror:theta /demo cancelled", "failed"]);
  });

  it("panic framing (emitPanicNote): mirrored and marked failed", () => {
    const { deps, effects } = producerRig(true);
    const framing = "theta /demo aborted: index out of bounds: 5 not in 0..2";
    deps.emitPanicNote(framing, panicDiagnostic());
    expect(effects).toEqual([`note:${framing}`, `mirror:${framing}`, "failed"]);
  });

  it("stamp failure (Clock.wallNow() throws while stamping): the fallback delivers the note once, and the surface still fires", () => {
    const effects: string[] = [];
    const pi = {
      sendMessage: (message: { customType: string; content: string }): void => {
        if (message.customType === SYSTEM_NOTE_CHANNEL) {
          effects.push(`note:${message.content}`);
        }
      },
    } as unknown as ExtensionAPI;
    const base = rootDouble();
    const root: typeof base = {
      ...base,
      clock: {
        ...base.clock,
        wallNow: (): number => {
          throw new Error("clock read failed");
        },
      },
    };
    const input: SurfaceProducerInput = {
      pi,
      root,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] } as unknown as ModelRegistry,
      emitDiagnostic: (diagnostic: Diagnostic): void => {
        effects.push(`diagnostic:${diagnostic.code}`);
      },
      printModeFailureSurface: {
        mirrorLine: (text: string): void => {
          effects.push(`mirror:${text}`);
        },
        markFailed: (): void => {
          effects.push("failed");
        },
      },
    };
    createProductionProducerDeps(input).emitTopLevelErrNote("demo", transportLeaf("boom"));
    const content = `theta /demo returned Err: transport ${DASH} boom`;
    expect(
      effects,
      "the stamp-failure fallback delivers the note (delivery-failed diagnostic, no transcript send); " +
        "the ending still owes its print-mode surface, and the note is not sent a second time",
    ).toEqual(["diagnostic:theta/runtime/system-note-delivery-failed", `mirror:${content}`, "failed"]);
  });

  it("CONTROL — no surface handed in: the notes deliver exactly as before and nothing else happens", () => {
    const { deps, effects } = producerRig(false);
    deps.emitTopLevelErrNote("demo", transportLeaf("boom"));
    deps.emitPanicNote("theta /demo aborted: x", panicDiagnostic());
    expect(effects).toEqual([
      `note:theta /demo returned Err: transport ${DASH} boom`,
      "note:theta /demo aborted: x",
    ]);
  });
});

// ===========================================================================
// Composition cells — ctx.mode × ending, through the real factory + root.
// ===========================================================================

type Mode = "print" | "json" | "tui" | "rpc";
type Ending = "ok" | "err" | "cancelled" | "panic";

/** Each ending's planted theta — every drive completes offline, no `@` turn. */
const ENDING_STEM: Readonly<Record<Ending, string>> = {
  ok: "okt",
  err: "errt",
  cancelled: "cancelt",
  panic: "panict",
};

let workspace: string;
let ambient: AmbientControlPlaneSnapshot | undefined;

beforeAll(() => {
  ambient = scrubAmbientControlPlane();
  workspace = plantThetaWorkspace(
    "theta-b0493-print-failure-",
    [
      // Ok: a pure value tail.
      { stem: "okt", text: theta("---", "mode: prompt", "---", '"DONE"') },
      // Err: an invoke of an absent callee propagated by `?` (SLSH-3, load_failure).
      { stem: "errt", text: theta("---", "mode: prompt", "---", 'invoke("./missing.theta")?') },
      // cancelled: dispatched with an already-aborted signal; the invoke
      // checkpoint surfaces it as the top-level cancelled Err.
      { stem: "cancelt", text: theta("---", "mode: prompt", "---", 'invoke("./okt.theta")?') },
      // panic: a runtime index out of bounds.
      {
        stem: "panict",
        text: theta("---", "mode: prompt", "---", "let xs = [1, 2]", "let i = xs.length + 3", "xs[i]"),
      },
      // The marked root the regime-active cells name; never dispatched there.
      { stem: "worker", text: theta("---", "mode: subagent", "---", '"ok"') },
    ],
    "{}",
  );
});

afterAll(() => {
  disposeWorkspace(workspace);
  if (ambient !== undefined) {
    restoreAmbientControlPlane(ambient);
    ambient = undefined;
  }
});

interface ProcessRig {
  readonly process: PrintModeFailureProcess;
  readonly stderr: string[];
  exitCode: number | string | null | undefined;
}

function processRig(initialExitCode?: number): ProcessRig {
  const rig: ProcessRig = {
    stderr: [],
    exitCode: initialExitCode,
    process: {
      writeStderr: (text: string): void => {
        rig.stderr.push(text);
      },
      readExitCode: (): number | string | null | undefined => rig.exitCode,
      writeExitCode: (code: number): void => {
        rig.exitCode = code;
      },
    },
  };
  return rig;
}

interface DriveOutcome {
  /** Every `theta-system-note` content the dispatch produced. */
  readonly notes: readonly string[];
  readonly stderr: readonly string[];
  readonly exitCode: number | string | null | undefined;
}

async function drive(options: {
  readonly mode: Mode;
  readonly ending: Ending;
  readonly childRegimeSlug?: string;
  readonly initialExitCode?: number;
}): Promise<DriveOutcome> {
  const rig = processRig(options.initialExitCode);
  const notes: string[] = [];
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => unknown }>();
  const sessionStart: ((event: unknown, ctx: ExtensionContext) => unknown)[] = [];
  let dispatching = false;
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerEntryRenderer: (): void => {},
    appendEntry: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => {
      commands.set(name, commandOptions as { handler: never });
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      if (event === "session_start") {
        sessionStart.push(handler);
      }
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    getAllTools: (): readonly unknown[] => [],
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    sendMessage: (message: { customType: string; content: string }): void => {
      if (dispatching && message.customType === SYSTEM_NOTE_CHANNEL) {
        notes.push(message.content);
      }
    },
    sendUserMessage: (): void => {
      throw new Error("offline violation: a D2 composition cell reached a provider turn");
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: workspace,
    mode: options.mode,
    hasUI: options.mode === "tui" || options.mode === "rpc",
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [{ id: "claude-test", provider: "anthropic" }],
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  const controlPlane: SubagentChildControlPlane | undefined =
    options.childRegimeSlug !== undefined
      ? { env: { [SUBAGENT_ROOT_ENV_MARKER]: options.childRegimeSlug }, entry: { kind: "theta" } }
      : undefined;
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx, ownRegisteredNames, entryChannel, latchStatusBus) => {
      const overrides: FailureProcessOverrides = {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
        emitResultEnvelope: (): void => {},
        printModeFailureProcess: rig.process,
        ...(controlPlane !== undefined ? { subagentControlPlane: controlPlane } : {}),
      };
      return composeExtensionInstance(
        composePi,
        composeCtx,
        overrides,
        undefined,
        ownRegisteredNames,
        entryChannel,
        latchStatusBus,
      );
    },
    ...(controlPlane !== undefined ? { isSubagentChild: true } : {}),
  };
  createThetaExtension(deps)(pi);
  for (const handler of sessionStart) {
    await handler({ type: "session_start" }, ctx);
  }
  const stem = ENDING_STEM[options.ending];
  const command = commands.get(stem);
  if (command === undefined) {
    throw new Error(
      `precondition unmet: /${stem} never registered (registered: ${[...commands.keys()].join(", ")})`,
    );
  }
  const abort = new AbortController();
  if (options.ending === "cancelled") {
    abort.abort();
  }
  const dispatchCtx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: workspace,
    mode: options.mode,
    hasUI: ctx.hasUI,
    signal: abort.signal,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined, getBranch: () => [] },
  } as unknown as ExtensionCommandContext;
  dispatching = true;
  await command.handler("", dispatchCtx);
  dispatching = false;
  return { notes, stderr: rig.stderr, exitCode: rig.exitCode };
}

/** The top-level note prefix each non-Ok ending renders (premise probe). */
const ENDING_NOTE_PREFIX: Readonly<Record<Exclude<Ending, "ok">, string>> = {
  err: "theta /errt returned Err: invoke of ./missing.theta failed (load_failure)",
  cancelled: "theta /cancelt cancelled",
  panic: "theta /panict aborted: index out of bounds",
};

const MODES: readonly Mode[] = ["print", "json", "tui", "rpc"];
const NON_OK: readonly Exclude<Ending, "ok">[] = ["err", "cancelled", "panic"];

describe("bug 0493 D2 — composition: the failure surface fires only for a non-Ok ending in a print/json parent", () => {
  for (const mode of ["print", "json"] as const) {
    for (const ending of NON_OK) {
      it(`${mode} × ${ending}: the rendered note is mirrored to stderr as one write and the exit code becomes 1`, async () => {
        const outcome = await drive({ mode, ending });
        // Premise: the drive really ended this way, on the note channel.
        expect(outcome.notes).toHaveLength(1);
        expect(outcome.notes[0]).toContain(ENDING_NOTE_PREFIX[ending]);
        expect
          .soft(
            outcome.stderr,
            `a ${mode}-mode parent whose drive ended ${ending} must say so on stderr — without the ` +
              "surface the note lands in an unflushed session and the process is silent",
          )
          .toEqual([`${outcome.notes[0]}\n`]);
        expect
          .soft(outcome.exitCode, `a ${mode}-mode parent whose drive ended ${ending} must not exit 0`)
          .toBe(1);
      });
    }
  }

  for (const mode of ["tui", "rpc"] as const) {
    for (const ending of NON_OK) {
      it(`CONTROL — ${mode} × ${ending}: no surface (the transcript is the surface / an exit code is meaningless)`, async () => {
        const outcome = await drive({ mode, ending });
        expect(outcome.notes).toHaveLength(1);
        expect(outcome.notes[0]).toContain(ENDING_NOTE_PREFIX[ending]);
        expect(outcome.stderr).toEqual([]);
        expect(outcome.exitCode).toBeUndefined();
      });
    }
  }

  for (const mode of MODES) {
    it(`CONTROL — ${mode} × ok: an Ok ending is always inert`, async () => {
      const outcome = await drive({ mode, ending: "ok" });
      expect(outcome.notes).toEqual([]);
      expect(outcome.stderr).toEqual([]);
      expect(outcome.exitCode).toBeUndefined();
    });
  }

  for (const ending of NON_OK) {
    it(`CONTROL — a subagent child (regime active) under json × ${ending} is inert: its failure surface is the envelope`, async () => {
      const outcome = await drive({ mode: "json", ending, childRegimeSlug: "worker" });
      expect(outcome.notes).toHaveLength(1);
      expect(outcome.notes[0]).toContain(ENDING_NOTE_PREFIX[ending]);
      expect(outcome.stderr).toEqual([]);
      expect(outcome.exitCode).toBeUndefined();
    });
  }

  it("markFailed never lowers a larger exit code already set (print × err over a pre-set 3)", async () => {
    const outcome = await drive({ mode: "print", ending: "err", initialExitCode: 3 });
    expect(outcome.notes).toHaveLength(1);
    // Premise: the surface fired at all — otherwise the untouched 3 proves nothing.
    expect(outcome.stderr).toEqual([`${outcome.notes[0]}\n`]);
    expect(outcome.exitCode).toBe(3);
  });
});
