// RFC 0015 (D5) — the trace-seam composition gate: the TUI composition wires
// `deps.trace → bus.trace(invocationId, …)` into the executor deps of a
// top-level prompt drive (heat populates on the bus under the drive's
// invocation id, keyed by the residence-rule file), a nested prompt-invoke
// callee's statements heat the SAME top-level ring (decision 6's one card per
// top-level drive), and the print composition leaves the seam UNWIRED (the D1
// byte-identical contract): the identical dispatch folds zero heat.
//
// Mirrors the D3 composition-gate harness (execution-status-run-card.test.ts):
// the real factory over the real composition root, `ctx.mode` the only
// variable.
//
// TIER: unit, offline, deterministic, provider-free.

import { afterAll, describe, expect, it } from "vitest";
import type { ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { ExecutionStatusBus } from "../src/extension/execution-status/types";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import { FakeClock } from "./helpers/fake-clock";
import {
  bootComposedHost,
  disposeWorkspace,
  plantThetaWorkspace,
  theta,
} from "./helpers/production-load-harness";

interface ComposedHost {
  readonly statusBus: () => ExecutionStatusBus;
  dispatch(name: string, args: string): Promise<unknown>;
}

async function composeHost(options: {
  readonly cwd: string;
  readonly mode: "tui" | "print";
}): Promise<ComposedHost> {
  let latchedBus: ExecutionStatusBus | undefined;
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx, ownRegisteredNames, entryChannel, latchStatusBus) =>
      composeExtensionInstance(
        composePi,
        composeCtx,
        {
          fileWatcher: new FakeFileWatcher(),
          clock: new FakeClock(),
          emitResultEnvelope: (): void => {},
        },
        undefined,
        ownRegisteredNames,
        entryChannel,
        (bus): void => {
          latchedBus = bus;
          latchStatusBus?.(bus);
        },
      ),
  };
  const host = await bootComposedHost({
    cwd: options.cwd,
    mode: options.mode,
    deps,
    piExtras: {
      // The prompt→prompt attach cell (runPromptSuspendInvoke) snapshots and
      // restores the active tool set around the callee body; the callable-set
      // admission reads the registry snapshot. All three are inert here.
      getActiveTools: (): string[] => [],
      setActiveTools: (): void => {},
      getAllTools: (): unknown[] => [],
    },
  });
  return {
    statusBus: (): ExecutionStatusBus => {
      if (latchedBus === undefined) {
        // No silent skipping: a compose pass that never latched is a harness fault.
        throw new Error("precondition unmet: compose pass never latched a status bus");
      }
      return latchedBus;
    },
    dispatch: host.dispatch,
  };
}

// A prompt-mode caller whose body runs three statements (two of them pure
// value/let statements — exactly the lines a checkpoint-only design would
// leave dark) and invokes a prompt-mode callee, plus that callee. Everything
// completes offline: no params (binder bypass), no prompt statement.
const workspace = plantThetaWorkspace(
  "theta-run-card-trace-wiring-",
  [
    {
      stem: "demo",
      text: theta(
        "---",
        "mode: prompt",
        "---",
        "let a = 1",
        'let r = invoke("./callee.theta")',
        '"DONE"',
      ),
    },
    { stem: "callee", text: theta("---", "mode: prompt", "---", "let b = 2", '"CALLEE"') },
  ],
  "{}",
);

afterAll(() => {
  disposeWorkspace(workspace);
});

describe("D5 — trace-seam composition gate", () => {
  it("TUI: a top-level drive folds heat under ITS invocation id, callee statements included (one ring per top-level drive)", async () => {
    const host = await composeHost({ cwd: workspace, mode: "tui" });
    await host.dispatch("demo", "");
    const snapshot = host.statusBus().snapshot();
    // The top-level node lingers post-drive (FakeClock never advances); the
    // callee's child node lingers beside it with NO heat of its own.
    const top = snapshot.nodes.find(
      (node) => node.theta === "demo" && node.parentInvocationId === undefined,
    );
    expect(top).toBeDefined();
    expect(top!.heat).toBeDefined();
    const files = new Set(top!.heat!.entries.map((entry) => entry.file));
    // Residence-rule keys: the caller's on-disk file AND the callee's — the
    // nested invoke inherited the parent's trace closure (decision 6).
    expect([...files].some((file) => file.endsWith("demo.theta"))).toBe(true);
    expect([...files].some((file) => file.endsWith("callee.theta"))).toBe(true);
    // Pure statements heated too (the trace seam's whole point vs checkpoints):
    // `let a = 1` is line 4 of demo.theta.
    expect(
      top!.heat!.entries.some((entry) => entry.file.endsWith("demo.theta") && entry.line === 4),
    ).toBe(true);
    // The callee's own child node carries no ring: its statements published
    // under the TOP-LEVEL id, not its own.
    const child = snapshot.nodes.find((node) => node.parentInvocationId === top!.invocationId);
    expect(child).toBeDefined();
    expect(child!.heat).toBeUndefined();
  });

  it("print: the SAME dispatch folds zero heat — the seam is unwired (D1 byte-identical contract)", async () => {
    const host = await composeHost({ cwd: workspace, mode: "print" });
    await host.dispatch("demo", "");
    const snapshot = host.statusBus().snapshot();
    // Positive control: the bus itself IS wired in print mode (lifecycle
    // publications arrive) — only the trace seam is absent.
    expect(snapshot.nodes.length).toBeGreaterThan(0);
    for (const node of snapshot.nodes) {
      expect(node.heat).toBeUndefined();
    }
  });
});
