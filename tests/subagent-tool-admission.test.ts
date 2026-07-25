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

// RFC-0005 (part 4, closure) + bug 0001 amendment — MODE-INDEPENDENT load-time
// `tools:` admission against the `pi.getAllTools()` registry snapshot.
//
// Motivation #1 end-to-end (docs/rfcs/0005-child-process-subagent-sessions.md):
// a subagent-mode theta's `tools:` list resolves against Pi's full tool
// registry, extension tools INCLUDED. Authority: subagent.md
// #subagent-launch-contract (the `--tools` allowlist carries "built-ins and
// extension tools alike, by name"), #subagent-isolation-and-trust (the
// `--approve` trust rule reads `pi.getAllTools()` `sourceInfo`),
// tool-registration-lifetime.md (subagent-mode tool visibility).
//
// AMENDED (bug 0001, prompt-mode extension-tool reach): the registry-snapshot
// admission is MODE-INDEPENDENT — frontmatter-fields-a.md §`tools` ("a name an
// installed extension registered … resolves on the same footing as a host
// built-in … in **both** prompt mode and subagent mode") and the
// `theta/load/unknown-tool` registry row ("The registry-snapshot admission is
// **mode-independent** (prompt and subagent)"). A prompt-mode extension-tool
// entry therefore REGISTERS, its snapshot entry pinning the tool's name +
// `parameters` schema (frontmatter-fields-b-and-templates.md §Resolution
// snapshot, *Prompt-mode extension-tool leg*); only a genuinely-absent name
// still fires `theta/load/unknown-tool` (Message `unknown Pi tool '<name>'`).
// Model-facing/code-side REACH of an admitted prompt-mode extension tool is
// PIC-64's concern (covered elsewhere); this file covers admission.

// --- Registry Message strings (diagnostics/code-registry-load.md) -----------
const MSG = {
  unknownExtInSubagent: "unknown Pi tool 'totally_unknown_xyz'",
  unknownExtInPrompt: "unknown Pi tool 'nope_not_registered'",
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
  // Prompt-mode theta naming extension tools (bug 0001 amendment): the
  // registry-snapshot admission is mode-independent, so this REGISTERS with the
  // extension entries admitted alongside the built-in. The body is
  // model-facing-only (an `@`-query, no code-side call), so admission is not
  // entangled with the PIC-64 code-side dispatch ladder.
  {
    stem: "promptext",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - finding_store",
      "  - projection",
      "  - read",
      "---",
      "@`hi`",
    ),
  },
  // Prompt-mode `as` rename over an extension tool: admitted under the
  // presented name, pinning the UNDERLYING registered tool name.
  {
    stem: "promptrename",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - finding_store as store",
      "---",
      "@`hi`",
    ),
  },
  // Prompt-mode theta naming a tool absent from getAllTools() AND not a `.theta`
  // callable: still refused with `theta/load/unknown-tool` (the mode-independent
  // rule admits registry names, not arbitrary ones).
  {
    stem: "promptunknown",
    text: theta("---", "mode: prompt", "tools: nope_not_registered", "---", "@`hi`"),
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

// ---------------------------------------------------------------------------
// Bug 0001 amendment — prompt-mode admission IS the same registry-snapshot rule.
// Spec: frontmatter-fields-a.md §`tools` (mode-independent registry-snapshot
// admission), frontmatter-fields-b-and-templates.md §Resolution snapshot
// (*Prompt-mode extension-tool leg*: the entry pins name + `parameters`),
// diagnostics/code-registry-load.md `theta/load/unknown-tool`.
// ---------------------------------------------------------------------------
describe("bug 0001 — prompt-mode extension-tool admission (mode-independent registry snapshot)", () => {
  it("a PROMPT-mode theta naming extension tools in `tools:` REGISTERS (no theta/load/unknown-tool)", () => {
    expect(
      outcome.registered,
      "prompt-mode admission must resolve extension-registered names against the " +
        "pi.getAllTools() snapshot (frontmatter-fields-a.md §tools — 'in both prompt " +
        "mode and subagent mode'). Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("promptext");
    // No unknown-tool refusal fired for the admitted extension names.
    expect(outcome.notifications).not.toContain("unknown Pi tool 'finding_store'");
    expect(outcome.notifications).not.toContain("unknown Pi tool 'projection'");
  });

  it("the prompt-mode callable set carries all three entries by presented name", () => {
    const snapshot = callableSetOf("promptext");
    expect([...snapshot.entries.keys()].sort()).toEqual(
      ["finding_store", "projection", "read"].sort(),
    );
  });

  it("the prompt-mode extension entries carry the tool's registered `parameters` schema (RFC-0002 disjointness input + model tool spec)", () => {
    // Resolution snapshot (*Prompt-mode extension-tool leg*): the entry "holds
    // only the tool's name and `parameters` schema" — the schema object itself
    // must reach the frozen entry.
    const snapshot = callableSetOf("promptext");
    const findingStore = snapshot.entries.get("finding_store") as ResolvedCallable & {
      readonly toolDefinition: { readonly parameters?: unknown };
    };
    const projection = snapshot.entries.get("projection") as ResolvedCallable & {
      readonly toolDefinition: { readonly parameters?: unknown };
    };
    expect(findingStore.kind).toBe("pi-tool");
    expect(findingStore.toolDefinition.parameters).toEqual(FINDING_STORE_SCHEMA);
    expect(projection.kind).toBe("pi-tool");
    expect(projection.toolDefinition.parameters).toEqual(PROJECTION_SCHEMA);
  });

  it("an `as` rename over a prompt-mode extension tool admits under the presented name and pins the UNDERLYING tool name", () => {
    expect(
      outcome.registered,
      "the renamed prompt-mode extension tool must register. Registered: " +
        JSON.stringify(outcome.registered),
    ).toContain("promptrename");
    const snapshot = callableSetOf("promptrename");
    const entry = snapshot.entries.get("store") as ResolvedCallable & {
      readonly toolDefinition: { readonly toolName?: string };
    };
    expect(entry, "the snapshot is keyed by the post-rename presented name").toBeDefined();
    expect(entry.kind).toBe("pi-tool");
    // The underlying registered name is pinned on the entry — the name the
    // PIC-17 install vector and PIC-64 host-loop dispatch use.
    expect(entry.toolDefinition.toolName).toBe("finding_store");
  });

  it("the admitted extension tool's UNDERLYING name feeds the PIC-17 query-window install-vector input", () => {
    // tool-registration-lifetime.md PIC-17: "An extension-supplied Pi tool
    // admitted into the callable set … is a member of thetaCallableSetNames, so
    // its name is in this install vector". The install vector consumes the
    // snapshot's underlying pi-tool names — assert the admitted extension tool
    // is among them.
    expect(piToolNames(callableSetOf("promptext"))).toContain("finding_store");
    expect(piToolNames(callableSetOf("promptext"))).toContain("projection");
  });

  it("a prompt-mode `tools:` name that is neither built-in, registry snapshot, nor .theta callable STILL fails with theta/load/unknown-tool", () => {
    expect(
      outcome.registered,
      "a genuinely-absent name must still refuse in prompt mode. Registered: " +
        JSON.stringify(outcome.registered),
    ).not.toContain("promptunknown");
    expect(outcome.notifications).toContain(MSG.unknownExtInPrompt);
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
