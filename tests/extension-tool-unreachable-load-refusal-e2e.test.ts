// RFC-0006 (PIC-61 rung 3) — LOAD-time code-side extension-tool-unreachable
// refusal, wired THROUGH the real composition root (`composeExtensionInstance`).
//
// PIC-61 pins a fail-closed code-side extension-tool dispatch ladder; rung 3 is:
// "a theta whose code calls an extension tool refuses to register with
// `theta/load/extension-tool-unreachable` (the runtime never silently falls
// through)". Under the shipped increment neither ladder rung is establishable
// (no upstream `getToolDefinition`, host-loop dispatch not shipped), so a
// subagent-mode theta whose CODE calls a callable-set extension tool MUST refuse
// registration at LOAD (spec option (a)), rather than deferring to a runtime
// refusal. This drives the REAL wiring: an extension tool is surfaced via a fake
// `pi.getAllTools()`, subagent thetas are discovered on disk, and the refusal is
// asserted to be scoped to the theta that reaches the tool FROM CODE.
//
// Scope witnessed here (matches the implemented scope): the refusal is
// context-general at registration but naturally lands on subagent-mode thetas
// (only subagent admission widens the callable set to `pi.getAllTools()`
// extension tools); a MODEL-facing-only use (an `@`-query, no code-side call) and
// a built-in code-side call (which has a dispatch rung) both still register.
//
// Spec: pi-integration-contract/subagent.md (PIC-61 #pic-61),
// diagnostics/code-registry-load.md (`theta/load/extension-tool-unreachable`).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { composeExtensionInstance } from "../src/extension/production-composition";
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
}

async function runLoad(cwd: string): Promise<LoadOutcome> {
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
    // The extension tool the subagent-mode admission widening reads: present in
    // the registry (so `tools: my_tool` resolves), but with no host built-in
    // `execute` — a code-side call to it needs a PIC-61 dispatch rung.
    getAllTools: (): readonly unknown[] => [
      { name: "my_tool", parameters: {}, sourceInfo: { scope: "user" } },
    ],
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

  const wiring = await composeExtensionInstance(pi, ctx, {
    subagentExecutableHost: resolvingHost(),
  });
  return { registered: wiring.thetas.map((t) => t.slashName), noteContent };
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

describe("RFC-0006 — PIC-61 rung 3 extension-tool-unreachable LOAD refusal", () => {
  it("a subagent theta whose CODE calls an unreachable extension tool is refused registration with theta/load/extension-tool-unreachable", async () => {
    const outcome = await runLoad(workspaceDir);

    // The code-calling theta does NOT register (fail-closed at load, not runtime).
    expect(outcome.registered).not.toContain("codecall");
    // The pinned diagnostic code is surfaced, naming the tool.
    const notes = outcome.noteContent.join("\n");
    expect(notes).toContain(EXTENSION_TOOL_UNREACHABLE_CODE);
    expect(notes).toContain("my_tool");
  });

  it("the refusal is scoped to CODE-side reach — a model-facing-only use of the same extension tool still registers", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("modelonly");
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

  it("a code-side call to a host BUILT-IN (which has a dispatch rung) still registers", async () => {
    const outcome = await runLoad(workspaceDir);
    expect(outcome.registered).toContain("builtincall");
  });
});
