// Bug 0323 — sub-step (f) of the capability probe is the ONE check with no
// try/catch. `probeSubagentExecutable` (src/extension/capability-probe.ts:470)
// calls `resolveSubagentExecutable` (src/runtime/subagent-launcher.ts:149) bare,
// whose rung-1 existence check runs `host.fileExists(host.argv1)`
// (subagent-launcher.ts:152). A hostile injected `ExecutableHost` whose
// `fileExists` throws (e.g. an `EACCES` stat) makes that throw UNWIND out of the
// probe — and out of the compose pass call site
// (production-composition.ts:905, bare) — instead of routing to the documented
// `theta/load/host-incompatible` refusal with `details.step =
// "subagent-executable"`. PIC-6 (capability-probe.md) requires "Each check is
// wrapped in a try/catch"; the canonical "Self-failure" clause requires the
// subagent-executable step route.
//
// Spec: pi-integration-contract/capability-probe.md (Step 0 (f), PIC-6,
// "Self-failure"); docs/bugs/0323-probe-failed-step-set-registry-contradiction.md
// (## Expected behaviour, ## Fix item 2).
//
// The fix (Phase 2, NOT here) wraps the (f) ladder run in try/catch inside
// `probeSubagentExecutable`; on throw it returns `{ ok: false, diagnostic:
// hostIncompatibleDiagnostic({ kind: "probe-failed", observed: "<unreadable>",
// required: "<unreadable>", step: "subagent-executable", cause: coerceCause(e)
// }) }`. The clean both-rungs-fail `{ ok: false }` verdict keeps its existing
// `theta/load/subagent-executable-unresolved` route byte-identical.
//
// RED at HEAD for the RIGHT reason: the throw unwinds (no try/catch), so cells
// (A) and (B) fail with the thrown `EACCES` message rather than reaching their
// assertions. GREEN once the wrap lands. Cells in (C) are controls that must be
// green at HEAD — the shipped host structurally cannot throw and the clean
// verdict route is unchanged.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  probeSubagentExecutable,
  HOST_INCOMPATIBLE_CODE,
} from "../src/extension/capability-probe";
import { createProductionExecutableHost } from "../src/extension/production-subagent-host";
import { composeExtensionInstance } from "../src/extension/production-composition";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import { SUBAGENT_EXECUTABLE_UNRESOLVED_CODE } from "../src/runtime/subagent-launcher";

// The concrete `EACCES` string the spec's own step-(f) example names ("a
// filesystem `stat` that throws `EACCES` while running the rung-1 existence
// check"). Asserting the coerced `details.cause` carries it proves the fix
// routes the underlying error, not a synthesized placeholder.
const EACCES_MESSAGE = "EACCES: permission denied, stat '/x'";

/**
 * A hostile host whose rung-1 existence check throws. `argv1` is a
 * non-embedded path so `resolveSubagentExecutable` reaches
 * `host.fileExists(host.argv1)` (rung 1) rather than short-circuiting to rung 2.
 */
function throwingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => {
      throw new Error(EACCES_MESSAGE);
    },
    isGenericRuntime: (): boolean => true,
  };
}

/** A host whose BOTH resolution rungs fail cleanly (no throw, no runnable entry point). */
function bothRungsFailHost(): ExecutableHost {
  return {
    argv1: undefined, // rung 1: no entry script
    execPath: "/usr/bin/node", // rung 2: a generic runtime is not Pi itself
    fileExists: (): boolean => false,
    isGenericRuntime: (): boolean => true,
  };
}

// ---------------------------------------------------------------------------
// (A) DIRECT UNIT — a throwing `fileExists` routes to `host-incompatible`
//     `probe-failed` / `subagent-executable`, not an unwound throw.
// ---------------------------------------------------------------------------

describe("bug 0323 (A) — probeSubagentExecutable wraps a throwing host", () => {
  it("a throwing fileExists routes to theta/load/host-incompatible probe-failed(subagent-executable)", () => {
    // RED reason at HEAD: `probeSubagentExecutable` runs the ladder BARE, so
    // this call THROWS `EACCES…` here (the throw unwinds) and never returns.
    // The wrap makes it return the documented refusal, greening the assertions.
    const outcome = probeSubagentExecutable(throwingHost());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostic.code).toBe(HOST_INCOMPATIBLE_CODE);
      const details = outcome.diagnostic.details ?? {};
      expect(details.kind).toBe("probe-failed");
      expect(details.step).toBe("subagent-executable");
      expect(String(details.cause)).toContain("EACCES");
    }
  });
});

// ---------------------------------------------------------------------------
// (B) COMPOSE-PASS INTEGRATION — the doc's own sketch, wired through the real
//     composition root. A throwing host must refuse the subagent theta with
//     host-incompatible (not unwind the load pass), and leave prompt mode alone.
// ---------------------------------------------------------------------------

function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  { stem: "subq", text: theta("---", "mode: subagent", "model: claude-test", "---", "@`hi`") },
  { stem: "promptq", text: theta("---", "mode: prompt", "---", "@`hi`") },
];

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
}

async function runLoad(cwd: string, host: ExecutableHost): Promise<LoadOutcome> {
  const noteContent: string[] = [];
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
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [
        { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      ],
    },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const wiring = await composeExtensionInstance(pi, ctx, { subagentExecutableHost: host });
  return { registered: wiring.thetas.map((t) => t.slashName), noteContent };
}

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0323-exec-wrap-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(dir, `${l.stem}.theta`), l.text, "utf8");
  }
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("bug 0323 (B) — a throwing host refuses through the composition root", () => {
  it("the subagent theta is refused with theta/load/host-incompatible, not an unwound load pass", async () => {
    // RED reason at HEAD: the bare `probeSubagentExecutable(subagentExecutableHost)`
    // at the compose call site (production-composition.ts:905) THROWS `EACCES…`,
    // so `composeExtensionInstance` REJECTS — `runLoad` rejects and this `await`
    // fails before the assertions. The wrap routes it to the refusal instead.
    const outcome = await runLoad(workspaceDir, throwingHost());

    expect(outcome.registered).not.toContain("subq");
    expect(outcome.noteContent.join("\n")).toContain(HOST_INCOMPATIBLE_CODE);
    // The throw class must NOT masquerade as the clean both-rungs-fail verdict.
    expect(outcome.noteContent.join("\n")).not.toContain(
      SUBAGENT_EXECUTABLE_UNRESOLVED_CODE,
    );
  });

  it("the refusal is scoped to subagent mode — the prompt-mode theta still registers", async () => {
    const outcome = await runLoad(workspaceDir, throwingHost());
    expect(outcome.registered).toContain("promptq");
  });
});

// ---------------------------------------------------------------------------
// (C) CONTROLS / FENCES — green at HEAD and after the fix. The clean verdict
//     keeps its own code; the shipped host structurally cannot throw.
// ---------------------------------------------------------------------------

describe("bug 0323 (C) — controls (green at HEAD and after the fix)", () => {
  it("clean both-rungs-fail still routes to theta/load/subagent-executable-unresolved (byte-identical)", () => {
    const outcome = probeSubagentExecutable(bothRungsFailHost());

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostic.code).toBe(SUBAGENT_EXECUTABLE_UNRESOLVED_CODE);
      // The clean verdict is NOT the throw-class host-incompatible refusal.
      expect(outcome.diagnostic.code).not.toBe(HOST_INCOMPATIBLE_CODE);
    }
  });

  it("the production host resolves without throwing — probe passes (existsSync never throws)", () => {
    // Pins the doc's latency claim: `createProductionExecutableHost` discharges
    // `fileExists` via `existsSync` (false on any error, no throw), so the (f)
    // throw is production-unreachable at this pin. Under vitest `process.argv[1]`
    // names an existing non-embedded entry script, so rung 1 resolves.
    const outcome = probeSubagentExecutable(createProductionExecutableHost());
    expect(outcome.ok).toBe(true);
  });
});
