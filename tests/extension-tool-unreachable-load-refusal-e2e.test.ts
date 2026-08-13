// PIC-64 (bug 0001 amendment; formerly PIC-61 rung 3) — LOAD-time code-side
// extension-tool reach, wired THROUGH the real composition root
// (`composeExtensionInstance`).
//
// PIC-64 pins a fail-closed, MODE-INDEPENDENT code-side extension-tool dispatch
// ladder: the host-loop rung (rung 2) is establishable "wherever a real host
// session with an agent loop and the required Pi surfaces is present — inside
// the subagent-root child (subagent mode) AND in the parent against the user's
// live host session (prompt mode)"; rung 3 is: "a theta whose code calls an
// extension tool refuses to register with
// `theta/load/extension-tool-unreachable` (the runtime never silently falls
// through)" — firing wherever the ladder has NO available rung. The retired
// PIC-61 child-only availability invariant is INVERTED (subagent.md §Retired
// REQ-IDs, PIC-61 row): a prompt-mode / parent theta whose code calls an
// admitted extension tool now REGISTERS when the host-loop surfaces are
// present, and the refusal survives only where the surfaces are absent.
//
// This drives the REAL wiring: extension tools surfaced via a fake
// `pi.getAllTools()`, thetas discovered on disk, the host-loop surfaces toggled
// on the fake host, and registration asserted per rung availability — never per
// process regime.
//
// Spec: pi-integration-contract/subagent.md (PIC-64 #pic-64,
// #subagent-host-loop-dispatch, §Retired REQ-IDs PIC-61 row),
// frontmatter-fields-a.md §`tools` (mode-independent admission),
// diagnostics/code-registry-load.md (`theta/load/extension-tool-unreachable`,
// `theta/load/unknown-tool`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { readParentEnv } from "../src/extension/production-subagent-host";
import { detectSubagentRootRegime } from "../src/runtime/subagent-root-regime";
import type { ExecutableHost } from "../src/runtime/subagent-launcher";
import { EXTENSION_TOOL_UNREACHABLE_CODE } from "../src/runtime/host-loop-dispatch";

function theta(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

const THETAS: readonly { readonly stem: string; readonly text: string }[] = [
  // Code-side call to an EXTENSION tool (no dispatch rung) → refused at LOAD.
  {
    stem: "codecall",
    text: theta(
      "---",
      "mode: subagent",
      "model: claude-test",
      "tools: my_tool",
      "---",
      "let _ = my_tool({ q: 1 })?",
    ),
  },
  // The SAME extension tool listed in `tools:` but reached only MODEL-facing (an
  // `@`-query, no code-side `<name>(args)` call) → still registers.
  {
    stem: "modelonly",
    text: theta(
      "---",
      "mode: subagent",
      "model: claude-test",
      "tools: my_tool",
      "---",
      "@`use the tool if helpful`",
    ),
  },
  // A code-side call to a host BUILT-IN (which has a direct-execute dispatch rung)
  // → not an extension tool, so no reachability refusal; still registers.
  {
    stem: "builtincall",
    text: theta(
      "---",
      "mode: subagent",
      "model: claude-test",
      "tools: read",
      "---",
      'let _ = read({ path: "x" })?',
    ),
  },
  // TRANSITIVE-IMPORT probe. The theta's OWN body never names the extension tool;
  // it imports a `.thetalib` `fn` whose body code-side-calls `my_tool`. This is
  // the transitive escape the load check is claimed not to cover — and it CANNOT
  // arise: a `.thetalib` is parsed standalone with no frontmatter `tools:`, so the
  // bare `my_tool(...)` in the imported `fn` resolves against nothing in scope and
  // fails `.thetalib` parse with `theta/parse/unknown-identifier`, un-registering
  // THIS importer at import resolution — strictly before the reachability check.
  // The refusal is therefore the parse guard, NOT extension-tool-unreachable.
  {
    stem: "importcallstool",
    text: theta(
      "---",
      "mode: subagent",
      "model: claude-test",
      "tools: my_tool",
      "---",
      'import { callsTool } from "./lib-calls-tool.thetalib"',
      "callsTool()",
    ),
  },
  // The CONVERSE. An imported `.thetalib` `fn` that names NO extension tool (pure
  // computation) registers cleanly, even though the importer declares the
  // extension tool in `tools:` — the imported `fn` reaches no extension tool, so
  // no reachability refusal, and no parse guard trips.
  {
    stem: "importpure",
    text: theta(
      "---",
      "mode: subagent",
      "model: claude-test",
      "tools: my_tool",
      "---",
      'import { pure } from "./lib-pure.thetalib"',
      "let _ = pure()",
      "@`use the tool if helpful`",
    ),
  },
  // --- Bug 0001 / PIC-64: PROMPT-mode legs -------------------------------
  // PROMPT-mode code-side call to the extension tool: registers when the
  // host-loop rung is available in the parent (previously refused); refused
  // fail-closed with `theta/load/extension-tool-unreachable` when no rung is.
  {
    stem: "promptcodecall",
    text: theta(
      "---",
      "mode: prompt",
      "tools: my_tool",
      "---",
      "let _ = my_tool({ q: 1 })?",
    ),
  },
  // PROMPT-mode MODEL-facing-only use of the extension tool: admission is
  // mode-independent (frontmatter-fields-a.md §tools) and model-facing reach
  // needs no code-side rung — registers with and without host-loop surfaces.
  {
    stem: "promptmodelonly",
    text: theta(
      "---",
      "mode: prompt",
      "tools: my_tool",
      "---",
      "@`use the tool if helpful`",
    ),
  },
  // Classification keys on the UNDERLYING name (1/2): an `as`-RENAMED extension
  // tool code-called via the presented name is still an extension tool — it
  // needs a rung, so it refuses when none is available.
  {
    stem: "promptrenamecode",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - my_tool as alias",
      "---",
      "let _ = alias({ q: 1 })?",
    ),
  },
  // Classification keys on the UNDERLYING name (2/2): a BUILT-IN renamed to an
  // extension-looking presented name is NOT an extension tool — its code-side
  // call has the direct-execute rung, so it registers even with NO host-loop
  // surfaces.
  {
    stem: "promptbuiltinmask",
    text: theta(
      "---",
      "mode: prompt",
      "tools:",
      "  - read as my_tool",
      "---",
      'let _ = my_tool({ path: "x" })?',
    ),
  },
];

/** `.thetalib` libraries the transitive-import probe thetas import. */
const THETALIBS: readonly { readonly stem: string; readonly text: string }[] = [
  // An imported `fn` whose body code-side-calls the extension tool by bare name.
  // Parsed standalone, `my_tool` is not in scope → `theta/parse/unknown-identifier`.
  {
    stem: "lib-calls-tool",
    text: theta(
      "fn callsTool(): string {",
      "  let r = my_tool({ q: 1 })",
      '  return "x"',
      "}",
    ),
  },
  // An imported `fn` that names no extension tool — pure computation.
  {
    stem: "lib-pure",
    text: theta(
      "fn pure(): string {",
      '  return "ok"',
      "}",
    ),
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

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly noteContent: readonly string[];
  /** The regime the compose pass detected — the childRegime cells' premise probe. */
  readonly regimeActive: boolean;
}

async function runLoad(
  cwd: string,
  options?: {
    readonly childRegime?: boolean;
    /**
     * Whether the fake host exposes the PIC-64 host-loop-dispatch Pi surfaces
     * (`probeHostLoopSurfaces` inputs). Default true — a live host session.
     * `false` models a host with no establishable host-loop rung, the ONLY
     * remaining fail-closed refusal context under PIC-64.
     */
    readonly hostLoopSurfaces?: boolean;
    /**
     * Whether the fake host exposes a `pi.getToolDefinition` member — the
     * PIC-64 rung-1 UPSTREAM surface. No rung-1 dispatcher exists at the theta
     * 1.0 pin, so the member alone must never register a code-calling theta:
     * the composition root records rung 1 on the ladder probe only as surface
     * AND wired dispatcher (registration tracks EXECUTABLE rungs).
     */
    readonly getToolDefinitionMember?: boolean;
  },
): Promise<LoadOutcome> {
  const noteContent: string[] = [];
  const surfaces = options?.hostLoopSurfaces ?? true;
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
    // The extension tool the mode-independent admission reads: present in the
    // registry (so `tools: my_tool` resolves in BOTH modes), but with no host
    // built-in `execute` — a code-side call to it needs a PIC-64 dispatch rung.
    getAllTools: (): readonly unknown[] => [
      { name: "my_tool", parameters: {}, sourceInfo: { scope: "user" } },
    ],
    registerMessageRenderer: (): void => {},
    // PIC-64 rung 2 (host-loop dispatch) Pi surfaces — present by default so the
    // `probeHostLoopSurfaces` probe passes in BOTH the parent and the
    // child-regime runs (the rung is establishable wherever the surfaces are).
    // The surfaces-absent variant drops `registerProvider`, killing the probe.
    ...(surfaces
      ? {
          registerProvider: (): void => {},
          unregisterProvider: (): void => {},
          setModel: (): Promise<boolean> => Promise.resolve(true),
        }
      : {}),
    // The rung-1 upstream surface, exposed WITHOUT any rung-1 dispatcher
    // existing in the codebase — the host shape that must not let registration
    // outrun dispatchability.
    ...(options?.getToolDefinitionMember === true
      ? { getToolDefinition: (): undefined => undefined }
      : {}),
    on: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    model: { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [
        { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      ],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  // The child regime is selected ONLY by the parent-launcher env marker
  // (`detectSubagentRootRegime` reads `readParentEnv()`), and that read is
  // AUTHENTICATED (subagent.md #subagent-control-plane-authentication): the
  // marker counts only beside a parent-pid carriage naming this process's real
  // parent — a real launcher always writes both. Plant both around the compose
  // for the child-context case, restore after (no leakage).
  const priorMarker = process.env["PI_THETA_SUBAGENT_ROOT"];
  const priorPid = process.env["PI_THETA_SUBAGENT_PARENT_PID"];
  if (options?.childRegime === true) {
    process.env["PI_THETA_SUBAGENT_ROOT"] = "codecall";
    process.env["PI_THETA_SUBAGENT_PARENT_PID"] = String(process.ppid);
  }
  try {
    // The premise probe: the regime the compose pass will detect, read through
    // the same authenticated view it uses. A childRegime cell whose marker was
    // stripped (missing/wrong parent-pid carriage) would silently degrade to
    // the parent leg and test it twice — this value lets the cell assert its
    // own premise instead.
    const regimeActive = detectSubagentRootRegime(readParentEnv()).active;
    const wiring = await composeExtensionInstance(pi, ctx, {
      subagentExecutableHost: resolvingHost(),
    });
    return { registered: wiring.thetas.map((t) => t.slashName), noteContent, regimeActive };
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
 * Load-refusal notes are rendered diagnostic lines carrying the refusing
 * theta's file path (`<file>: <code>: <message>`), so matching a diagnostic
 * code AND the refusing theta's filename on ONE line attributes the refusal to
 * that theta — a whole-pass `toContain` would be satisfied by ANY theta's
 * refusal (e.g. the subagent `codecall` theta's), even if the theta under test
 * refused via a different diagnostic.
 */
function noteLinesContaining(
  noteContent: readonly string[],
  ...substrings: readonly string[]
): string[] {
  return noteContent
    .flatMap((note) => note.split("\n"))
    .filter((line) => substrings.every((substring) => line.includes(substring)));
}

let workspaceDir: string;

beforeAll(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-rfc0006-ext-unreachable-"));
  const dir = join(workspaceDir, ".pi", "theta");
  mkdirSync(dir, { recursive: true });
  for (const l of THETAS) {
    writeFileSync(join(dir, `${l.stem}.theta`), l.text, "utf8");
  }
  for (const l of THETALIBS) {
    writeFileSync(join(dir, `${l.stem}.thetalib`), l.text, "utf8");
  }
});

afterAll(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

describe("PIC-64 — the host-loop rung is establishable in the PARENT: code-calling thetas REGISTER when the surfaces are present", () => {
  it("a PROMPT-mode theta whose code calls a callable-set extension tool REGISTERS in the parent when the host-loop surfaces are present (previously refused)", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(
      outcome.registered,
      "PIC-64 inverts the retired PIC-61 child-only rung availability: the " +
        "prompt-mode code-calling theta must register against the parent's live " +
        "host session. Registered: " + JSON.stringify(outcome.registered),
    ).toContain("promptcodecall");
    // No fail-closed refusal note fired for it.
    expect(outcome.noteContent.join("\n")).not.toContain(
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    // And admission did not misfire unknown-tool for the registry name.
    expect(outcome.noteContent.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
  });

  it("a SUBAGENT-mode theta whose code calls the extension tool also registers at PARENT load (the rung is mode-independent, not regime-gated)", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("codecall");
  });

  it("a prompt-mode MODEL-facing-only use registers (admission is mode-independent and not code-side-gated)", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("promptmodelonly");
  });

  it("an `as`-renamed extension tool code-called via the presented name registers when the rung is available", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("promptrenamecode");
  });

  it("a transitive-import extension-tool code-side call cannot arise — an imported .thetalib fn naming the extension tool fails .thetalib parse (theta/parse/unknown-identifier), un-registering the importer before the reachability check", async () => {
    const outcome = await runLoad(workspaceDir);
    // The importer does NOT register (fail-closed).
    expect(outcome.registered).not.toContain("importcallstool");
    // It is refused by the `.thetalib` parse guard that makes the transitive
    // escape unconstructible — NOT by extension-tool-unreachable (the imported
    // `fn`'s call site never reaches the reachability check).
    const notes = outcome.noteContent.join("\n");
    expect(notes).toContain("theta/parse/unknown-identifier");
    expect(notes).toContain("my_tool");
  });

  it("the converse — an imported .thetalib fn that names no extension tool registers cleanly, even when the importer declares the extension tool", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("importpure");
  });

  it("a code-side call to a host BUILT-IN (which has a direct-execute rung) still registers", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("builtincall");
  });
});

describe("PIC-64 rung 3 — STILL fail-closed where NO rung is available (host-loop surfaces absent)", () => {
  it("prompt-mode + code-side call + no rung → refused with theta/load/extension-tool-unreachable naming the tool (NOT unknown-tool)", async () => {
    const outcome = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(outcome.registered).not.toContain("promptcodecall");
    // Attribution is scoped to the REFUSING theta: one note line must carry
    // BOTH the refusing theta's filename and the diagnostic code — the
    // subagent `codecall` theta's own unreachable refusal in the same pass
    // must not satisfy this assertion on promptcodecall's behalf.
    const refusalLines = noteLinesContaining(
      outcome.noteContent,
      "promptcodecall.theta",
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    expect(
      refusalLines.length,
      "promptcodecall.theta itself must refuse with the extension-tool-unreachable code — " +
        "notes: " + JSON.stringify(outcome.noteContent),
    ).toBeGreaterThan(0);
    // The refusing line names the tool.
    expect(refusalLines.join("\n")).toContain("my_tool");
    // The refusal is the REACHABILITY code, not an admission failure: the
    // registry name resolves mode-independently.
    expect(outcome.noteContent.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
  });

  it("classification keys on the UNDERLYING name: `my_tool as alias` code-called via `alias` is refused (extension underlying)", async () => {
    const outcome = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(outcome.registered).not.toContain("promptrenamecode");
    // Attribution is scoped to the REFUSING theta (see noteLinesContaining):
    // promptrenamecode.theta's OWN note line carries the diagnostic code — the
    // other refused thetas' unreachable notes in the same pass do not count.
    const refusalLines = noteLinesContaining(
      outcome.noteContent,
      "promptrenamecode.theta",
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    expect(
      refusalLines.length,
      "promptrenamecode.theta itself must refuse with the extension-tool-unreachable code — " +
        "notes: " + JSON.stringify(outcome.noteContent),
    ).toBeGreaterThan(0);
    // The refusal is the REACHABILITY gate over the renamed entry — the
    // registry name itself resolves mode-independently, so no admission
    // unknown-tool fires anywhere in this pass.
    expect(outcome.noteContent.join("\n")).not.toContain("unknown Pi tool 'my_tool'");
  });

  it("classification keys on the UNDERLYING name: `read as my_tool` code-called via `my_tool` REGISTERS with no rung (built-in underlying)", async () => {
    const outcome = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(outcome.registered).toContain("promptbuiltinmask");
  });

  it("a prompt-mode MODEL-facing-only use still registers with no rung (model-facing reach is not gated on the code-side ladder)", async () => {
    const outcome = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(outcome.registered).toContain("promptmodelonly");
  });

  it("a SUBAGENT-mode code-calling theta is refused at parent load when no rung is available (fail-closed floor unchanged)", async () => {
    const outcome = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(outcome.registered).not.toContain("codecall");
    // Model-facing-only + built-in code-side calls still register there too.
    expect(outcome.registered).toContain("modelonly");
    expect(outcome.registered).toContain("builtincall");
  });
});

describe("PIC-64 — registration tracks EXECUTABLE rungs: pi.getToolDefinition exposed, host-loop surfaces ABSENT", () => {
  // The host shape that exposed bug 0001's Finding 2: the rung-1 UPSTREAM
  // surface is present but no rung-1 dispatcher exists at the pin, and the
  // host-loop surfaces are absent — so NO code-side call can actually be
  // dispatched. Registration and dispatchability must AGREE: the code-calling
  // thetas refuse at load exactly as on a no-surface host. (Recording the bare
  // surface as an available rung would register thetas whose every code-side
  // call then dies in dispatch — inverting rung 3's register-iff-dispatchable
  // intent.) The producer-level twin — the dispatch site refusing the rung-1
  // resolution rather than silently substituting host-loop — lives in
  // prompt-mode-extension-tool-dispatch.test.ts.
  it("the code-calling thetas do NOT register: rung 1 has no dispatcher, so it is not an executable rung", async () => {
    const outcome = await runLoad(workspaceDir, {
      hostLoopSurfaces: false,
      getToolDefinitionMember: true,
    });
    expect(
      outcome.registered,
      "a bare pi.getToolDefinition member must not register a code-calling theta — " +
        "no rung-1 dispatcher exists, so a registration here could never dispatch. " +
        "Registered: " + JSON.stringify(outcome.registered),
    ).not.toContain("promptcodecall");
    expect(outcome.registered).not.toContain("codecall");
    // The refusal is the pinned fail-closed rung-3 diagnostic, attributed to
    // the refusing theta (one line carrying both the file and the code).
    const refusalLines = noteLinesContaining(
      outcome.noteContent,
      "promptcodecall.theta",
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    expect(
      refusalLines.length,
      "promptcodecall.theta must refuse with the extension-tool-unreachable code — " +
        "notes: " + JSON.stringify(outcome.noteContent),
    ).toBeGreaterThan(0);
    expect(refusalLines.join("\n")).toContain("my_tool");
  });

  it("model-facing-only and built-in-calling thetas still register on that host shape (the refusal is scoped to code-side extension reach)", async () => {
    const outcome = await runLoad(workspaceDir, {
      hostLoopSurfaces: false,
      getToolDefinitionMember: true,
    });
    expect(outcome.registered).toContain("promptmodelonly");
    expect(outcome.registered).toContain("modelonly");
    expect(outcome.registered).toContain("builtincall");
    expect(outcome.registered).toContain("promptbuiltinmask");
  });

  it("with the host-loop surfaces ALSO present the code-calling thetas register — rung 2 is executable and carries dispatch; the inert rung-1 surface does not regress registration", async () => {
    const outcome = await runLoad(workspaceDir, { getToolDefinitionMember: true });
    expect(outcome.registered).toContain("promptcodecall");
    expect(outcome.registered).toContain("codecall");
    expect(outcome.noteContent.join("\n")).not.toContain(
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
  });
});

describe("PIC-64 — refusal tracks RUNG AVAILABILITY, not process regime", () => {
  it("under the subagent-root regime + host-loop surfaces present, the code-calling theta registers (unchanged child leg)", async () => {
    const outcome = await runLoad(workspaceDir, { childRegime: true });
    // Premise first: the compose pass genuinely ran in the child regime — the
    // planted marker survived the authenticated control-plane read. Without
    // this the cell would go vacuously green in the parent regime.
    expect(outcome.regimeActive).toBe(true);
    expect(outcome.registered).toContain("codecall");
    expect(outcome.noteContent.join("\n")).not.toContain(
      EXTENSION_TOOL_UNREACHABLE_CODE,
    );
    expect(outcome.registered).toContain("modelonly");
    expect(outcome.registered).toContain("builtincall");
  });

  it("the symmetry is surfaces-present vs surfaces-absent: the SAME composition registers with the rung and refuses without it — in the SAME parent process", async () => {
    const withRung = await runLoad(workspaceDir);
    const withoutRung = await runLoad(workspaceDir, { hostLoopSurfaces: false });
    expect(withRung.registered).toContain("promptcodecall");
    expect(withRung.registered).toContain("codecall");
    expect(withoutRung.registered).not.toContain("promptcodecall");
    expect(withoutRung.registered).not.toContain("codecall");
  });
});
