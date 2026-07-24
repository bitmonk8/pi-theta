import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import type {
  CallableSetSnapshot,
  ResolvedCallable,
} from "../src/parser/callable-set";
import { inferChildTrust } from "../src/runtime/subagent-launcher";

// RFC-0005 (part 4, closure) — widen SUBAGENT-MODE load-time `tools:` admission.
//
// Motivation #1 end-to-end (docs/rfcs/0005-child-process-subagent-sessions.md):
// a subagent-mode theta's `tools:` list resolves against Pi's full tool
// registry, extension tools INCLUDED. Authority: subagent.md
// #subagent-launch-contract (the `--tools` allowlist carries "built-ins and
// extension tools alike, by name"), #subagent-isolation-and-trust (the
// `--approve` trust rule reads `pi.getAllTools()` `sourceInfo`),
// tool-registration-lifetime.md (subagent-mode tool visibility).
//
// The widening is subagent-mode ONLY: prompt-mode admission is unchanged
// (built-ins only), so an extension-tool name in a prompt-mode theta still
// fails load with `theta/load/unknown-tool` (diagnostics/code-registry-load.md,
// Message `unknown Pi tool '<name>'`).

// --- Registry Message strings (diagnostics/code-registry-load.md) -----------
const MSG = {
  unknownExtInSubagent: "unknown Pi tool 'totally_unknown_xyz'",
  extToolInPromptMode: "unknown Pi tool 'finding_store'",
} as const;

// --- Fake `pi.getAllTools()` snapshot (child-reachable extension tools) ------
// A project-local extension tool (`finding_store`) and a user-scope extension
// tool (`projection`), each carrying a registered `parameters` schema so the
// RFC-0002 disjointness check can see it. Shape mirrors the real Pi `ToolInfo`
// (name + parameters + sourceInfo.scope).
const FINDING_STORE_SCHEMA = {
  type: "object",
  properties: { op: { type: "string" } },
  required: ["op"],
} as const;
const PROJECTION_SCHEMA = {
  type: "object",
  properties: { pipeline: { type: "string" } },
  required: ["pipeline"],
} as const;

const FAKE_ALL_TOOLS = [
  {
    name: "finding_store",
    parameters: FINDING_STORE_SCHEMA,
    sourceInfo: { path: "x", source: "finding-store", scope: "project", origin: "top-level" },
  },
  {
    name: "projection",
    parameters: PROJECTION_SCHEMA,
    sourceInfo: { path: "y", source: "projection", scope: "user", origin: "top-level" },
  },
];

// --- Planted discovery workspace -------------------------------------------

interface PlantedTheta {
  readonly stem: string;
  readonly text: string;
}

function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly PlantedTheta[] = [
  // Subagent theta admitting a project-local extension tool, a user-scope
  // extension tool, and a built-in — all three must be admitted to the frozen
  // callable set.
  {
    stem: "subext",
    text: theta(
      "---",
      "mode: subagent",
      "tools:",
      "  - finding_store",
      "  - projection",
      "  - read",
      "---",
      "@`hi`",
    ),
  },
  // Subagent theta with only a user-scope extension tool + a built-in: admitted,
  // but the project-local trust inference must NOT fire (`--no-approve`).
  {
    stem: "subuser",
    text: theta("---", "mode: subagent", "tools:", "  - projection", "  - read", "---", "@`hi`"),
  },
  // Subagent control: a bare built-in still resolves (unchanged built-in admission).
  { stem: "subread", text: theta("---", "mode: subagent", "tools: read", "---", "@`hi`") },
  // Subagent theta naming a tool absent from getAllTools() AND not a `.theta`
  // callable: still refused with `theta/load/unknown-tool`.
  {
    stem: "subunknown",
    text: theta("---", "mode: subagent", "tools: totally_unknown_xyz", "---", "@`hi`"),
  },
  // Prompt-mode theta naming an extension tool: prompt-mode admission is
  // unchanged (built-ins only), so this still fails load with unknown-tool.
  {
    stem: "promptext",
    text: theta("---", "mode: prompt", "tools: finding_store", "---", "@`hi`"),
  },
];

// --- Load harness ----------------------------------------------------------

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  readonly notifications: readonly string[];
}

let outcome: LoadOutcome;
let workspaceDir: string;

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    // RFC-0005: the child-reachable extension tool snapshot the subagent-mode
    // load-time admission widening reads.
    getAllTools: (): readonly unknown[] => FAKE_ALL_TOOLS,
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), fixtures, notifications };
}

/** Read the frozen callable-set snapshot threaded onto a runnable fixture. */
function callableSetOf(name: string): CallableSetSnapshot {
  const fixture = outcome.fixtures.find((f) => f.slashName === name);
  expect(fixture, `fixture '${name}' was not registered`).toBeDefined();
  const snapshot = (fixture as unknown as { callableSet?: CallableSetSnapshot }).callableSet;
  expect(snapshot, `fixture '${name}' carries no callableSet snapshot`).toBeDefined();
  return snapshot as CallableSetSnapshot;
}

/** The Pi-tool underlying names in a resolved snapshot (the `--tools` allowlist inputs). */
function piToolNames(snapshot: CallableSetSnapshot): string[] {
  const names: string[] = [];
  for (const entry of snapshot.entries.values()) {
    if (entry.kind === "pi-tool") {
      names.push((entry.toolDefinition as { toolName: string }).toolName);
    }
  }
  return names;
}

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0005-admission-"));
  const projectThetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(projectThetaDir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(projectThetaDir, `${l.stem}.theta`), l.text, "utf8");
  }
  outcome = await runProductionLoad(workspaceDir);
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("RFC-0005 — subagent-mode extension-tool admission", () => {
  it("admits a project-local + user-scope extension tool AND a built-in (subext registers)", () => {
    expect(
      outcome.registered,
      "the subagent theta naming extension tools in `tools:` was un-registered — " +
        "admission did not widen to pi.getAllTools(). Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("subext");
  });

  it("the admitted callable set carries all three entries by presented name", () => {
    const snapshot = callableSetOf("subext");
    expect([...snapshot.entries.keys()].sort()).toEqual(
      ["finding_store", "projection", "read"].sort(),
    );
  });

  it("the extension-tool entries carry the tool's registered `parameters` schema (RFC-0002 disjointness check input)", () => {
    const snapshot = callableSetOf("subext");
    const findingStore = snapshot.entries.get("finding_store") as ResolvedCallable & {
      readonly toolDefinition: { readonly parameters?: unknown };
    };
    const projection = snapshot.entries.get("projection") as ResolvedCallable & {
      readonly toolDefinition: { readonly parameters?: unknown };
    };
    expect(findingStore.kind).toBe("pi-tool");
    expect(findingStore.toolDefinition.parameters).toEqual(FINDING_STORE_SCHEMA);
    expect(projection.toolDefinition.parameters).toEqual(PROJECTION_SCHEMA);
  });

  it("a bare built-in still resolves in subagent mode (subread registers)", () => {
    expect(outcome.registered).toContain("subread");
    expect(piToolNames(callableSetOf("subread"))).toContain("read");
  });

  it("a name that is neither built-in, getAllTools(), nor a .theta callable is still refused", () => {
    expect(
      outcome.registered,
      "an unknown tool name in subagent mode must still fail load. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("subunknown");
    expect(outcome.notifications).toContain(MSG.unknownExtInSubagent);
  });
});

describe("RFC-0005 — prompt-mode admission is NOT widened", () => {
  it("an extension-tool name in a PROMPT-mode theta still fails load with unknown-tool", () => {
    expect(
      outcome.registered,
      "prompt-mode admission must be unchanged (built-ins only). Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("promptext");
    expect(outcome.notifications).toContain(MSG.extToolInPromptMode);
  });
});

describe("RFC-0005 — project-local trust inference flows from sourceInfo", () => {
  it("--approve iff the admitted callable set holds a project-local tool", () => {
    // subext admits `finding_store` (project scope) → trust inferred.
    expect(inferChildTrust(piToolNames(callableSetOf("subext")), FAKE_ALL_TOOLS)).toBe(true);
    // subuser admits only `projection` (user scope) + `read` (built-in) → no trust.
    expect(inferChildTrust(piToolNames(callableSetOf("subuser")), FAKE_ALL_TOOLS)).toBe(false);
  });
});
