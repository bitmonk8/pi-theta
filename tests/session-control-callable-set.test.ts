// RFC 0011 (V24a-T) — S1 (callable-set seam) + S4/S2 model-facing exclusions,
// RED tests.
//
// Contract: `.localpi/tmp/rfc-0011-seam-sheet.md` §2 (fixed signatures as
// data), §3 (S1: union widening, resolution order, `.kind` consumer table,
// load probe, §3.4 behaviour matrix), §4 (S2 matrix). Background:
// docs/rfcs/0011-session-control-tools.md §1, §2, §4, §New diagnostics.
//
// RED SIGNATURE AT HEAD (one line): `resolveCallableSet`'s `resolveEntry`
// consults ONLY `deps.resolvePiTool` for a bare identifier (no RFC 0011 arm
// checks `RUNTIME_TOOL_NAMES` first), and the load-time compose loop
// (`production-composition.ts`) runs no host-member probe — so every
// "resolves to `{ kind: 'runtime-tool', … }`" / "session-tool-unavailable
// fires" assertion below reds against `theta/load/unknown-tool` (or, for the
// registry-shadowing cell, against the CURRENT `pi-tool` precedence) instead.
//
// This file is the DIAG-2 asserting home for the full code string
// `theta/load/session-tool-unavailable` (V8/V8b).
//
// Method: uses `tests/helpers/e2e-s1.ts`'s shared `callableSetDeps` /
// `resolveScalar` harness for the §3.4 unit-level cells, and
// `tests/subagent-tool-admission.test.ts` / `tests/subagent-placement-load-refusal.test.ts`'s
// `discoverAndComposeFixtures` fixture-plant pattern for the composition-level
// cells (the load probe lives in the compose loop, not in `resolveCallableSet`).
import { callableSetDeps as deps, findCode as withCode, parseDoc, resolveScalar } from "./helpers/e2e-s1";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CallableSetResult } from "../src/parser/callable-set";
import { RUNTIME_TOOL_NAMES, RUNTIME_TOOL_SIGNATURES, runtimeToolPresentedNames } from "../src/parser/runtime-tools";
import type { ThetaFixture } from "../src/extension/factory";
import { disposeWorkspace, plantThetaWorkspace, runProductionLoad, type LoadOutcome } from "./helpers/production-load-harness";
import { FACTORY_PROBED_SDK_MEMBERS } from "../src/extension/capability-probe";
import { computeActiveSetInstall } from "../src/runtime/conversation-drive";
import { assembleSubagentArgv, inferChildTrust, PI_CLI_DIALECT } from "../src/runtime/subagent-launcher";

/** DIAG-2 asserting home for `theta/load/session-tool-unavailable` (V8 / V8b below). */
const SESSION_TOOL_UNAVAILABLE_CODE = "theta/load/session-tool-unavailable";

// ===========================================================================
// §2 — the fixed-signature table is present and shaped as the sheet specifies.
// (Green regression pin over the stub this file's builder owns — asserts the
// stub, not the seam; kept beside the seam cells for locality.)
// ===========================================================================

describe("RFC 0011 §2 — RUNTIME_TOOL_SIGNATURES / runtimeToolPresentedNames (the stub)", () => {
  it("the closed name set is exactly {compact, context_usage, session_name}", () => {
    expect([...RUNTIME_TOOL_NAMES].sort()).toEqual(["compact", "context_usage", "session_name"]);
  });

  it("compact: 0/1 arity, one optional string param, hostMembers ['ctx.compact']", () => {
    const sig = RUNTIME_TOOL_SIGNATURES.get("compact");
    expect(sig?.requiredCount).toBe(0);
    expect(sig?.totalCount).toBe(1);
    expect(sig?.hostMembers).toEqual(["ctx.compact"]);
  });

  it("context_usage: 0/0 arity, hostMembers ['ctx.getContextUsage']", () => {
    const sig = RUNTIME_TOOL_SIGNATURES.get("context_usage");
    expect(sig?.requiredCount).toBe(0);
    expect(sig?.totalCount).toBe(0);
    expect(sig?.hostMembers).toEqual(["ctx.getContextUsage"]);
  });

  it("session_name: 1/1 arity, one required string param, hostMembers ['pi.setSessionName', 'pi.getSessionName'] IN PROBE ORDER", () => {
    const sig = RUNTIME_TOOL_SIGNATURES.get("session_name");
    expect(sig?.requiredCount).toBe(1);
    expect(sig?.totalCount).toBe(1);
    expect(sig?.hostMembers).toEqual(["pi.setSessionName", "pi.getSessionName"]);
  });

  it("runtimeToolPresentedNames maps a rename to the CANONICAL name and ignores non-members", () => {
    const map = runtimeToolPresentedNames(["compact as c", "read", "session_name"]);
    expect(map.get("c")).toBe("compact");
    expect(map.get("session_name")).toBe("session_name");
    expect(map.has("read")).toBe(false);
  });
});

// ===========================================================================
// §3.4 unit-level cells — driven directly through `resolveCallableSet`.
// ===========================================================================

/** Read `.kind` / `.name` off a resolved entry as a loose shape (the future
 * `ResolvedRuntimeTool` union member does not exist on `ResolvedCallable` yet
 * — casting through `unknown` lets this file compile at HEAD while asserting
 * the future kind literal, mirroring `tests/call-with-clause-static-checks.test.ts`'s
 * `mixedCallableSet()` cast). */
function looseEntry(r: CallableSetResult, name: string): { kind?: string; name?: string } | undefined {
  const entry = r.callableSet?.entries.get(name);
  return entry as unknown as { kind?: string; name?: string } | undefined;
}

describe("RFC 0011 §3.1/§3.4 — V1: a bare `compact` entry resolves to a runtime-tool, not an unknown Pi tool", () => {
  it("V1: `tools: compact` resolves entry `compact -> { kind: 'runtime-tool', name: 'compact' }`; registered", () => {
    const r = resolveScalar("compact", deps({}));
    expect(withCode(r.diagnostics, "theta/load/unknown-tool"), "RED: 'compact' must not be judged as an unknown Pi tool").toBeUndefined();
    expect(r.registered, "a bare runtime-tool entry registers").toBe(true);
    expect(looseEntry(r, "compact")?.kind).toBe("runtime-tool");
    expect(looseEntry(r, "compact")?.name).toBe("compact");
  });
});

describe("RFC 0011 §3.4 — V2: `as` rename over a runtime tool", () => {
  it("V2: `tools: compact as compact_session` binds key `compact_session`, canonical name `compact`", () => {
    const r = resolveScalar("compact as compact_session", deps({}));
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.has("compact"), "the verbatim name is not also bound").toBe(false);
    expect(looseEntry(r, "compact_session")?.kind).toBe("runtime-tool");
    expect(looseEntry(r, "compact_session")?.name, "the entry's name is the CANONICAL (pre-rename) name").toBe("compact");
  });
});

describe("RFC 0011 §3.4 — V3: a runtime-tool name colliding with a top-level fn/import fires the collision", () => {
  it("V3: `tools: compact` with `compact` reserved (top-level fn/import) draws theta/load/tool-name-collision; not registered", () => {
    const r = resolveScalar("compact", deps({ reservedNames: ["compact"] }));
    const dg = withCode(r.diagnostics, "theta/load/tool-name-collision");
    expect(dg, "RED: the collision never fires while 'compact' is still judged unknown-tool first").toBeDefined();
    expect(dg?.message).toBe("tool name 'compact' collides with another 'tools:' entry, top-level fn, or import");
    expect(r.registered).toBe(false);
  });
});

describe("RFC 0011 §3.1/§3.4 — V4: precedence over a registry-published extension tool of the same name", () => {
  it("V4: an extension tool registered as 'compact' loses to the runtime-tool arm — 'compact' resolves runtime-tool, not pi-tool", () => {
    // deps.resolvePiTool answering for "compact" simulates a registered
    // extension tool published under that name (RFC §1's shadowing
    // disposition: the runtime-tool arm runs BEFORE resolvePiTool is even
    // consulted, so it must win regardless of what the registry answers).
    const r = resolveScalar("compact", deps({ piTools: ["compact"] }));
    expect(r.registered).toBe(true);
    expect(
      looseEntry(r, "compact")?.kind,
      "RED: at HEAD resolveEntry consults resolvePiTool first, so the registry entry wins",
    ).toBe("runtime-tool");
  });
});

describe("RFC 0011 §3.4 — V5: an invalid `as` rename target over a runtime tool (green control — unchanged machinery)", () => {
  it("V5: `tools: compact as Compact` draws theta/load/invalid-tool-rename (rename judged before resolution)", () => {
    const r = resolveScalar("compact as Compact", deps({}));
    const dg = withCode(r.diagnostics, "theta/load/invalid-tool-rename");
    expect(dg).toBeDefined();
    expect(dg?.message).toBe("'as Compact' rename target must be lowercase-first; got 'Compact'");
    expect(r.registered).toBe(false);
  });
});

describe("RFC 0011 §3.4 — V7: a theta declaring none of the three runtime tools is untouched (GOV-15 witness; green control)", () => {
  it("V7: `tools: read` resolves exactly as before — one pi-tool entry, no runtime-tool interaction", () => {
    const r = resolveScalar("read", deps({ piTools: ["read"] }));
    expect(r.registered).toBe(true);
    expect(r.callableSet?.entries.size).toBe(1);
    expect(looseEntry(r, "read")?.kind).toBe("pi-tool");
  });
});

// ===========================================================================
// §3.4 composition-level cells — the load-time host probe
// (`theta/load/session-tool-unavailable`) lives in the compose loop
// (`production-composition.ts`), not in `resolveCallableSet`; unreachable at
// the unit level above.
// ===========================================================================

interface FakeHostOpts {
  readonly ctxCompact?: boolean;
  readonly ctxGetContextUsage?: boolean;
  readonly piSetSessionName?: boolean;
  readonly piGetSessionName?: boolean;
}

/** Plant `files` (relative `<stem>.theta` -> source) under a scratch project
 * theta dir and run the real production load, capturing `ctx.ui.notify`
 * messages and (since the fake `ctx` carries no `hasUI: true`) the headless
 * stderr mirror `renderDiagnosticLine` produces — the one production surface
 * that carries the diagnostic CODE beside the message. */
async function runLoad(
  files: Readonly<Record<string, string>>,
  hostOpts?: FakeHostOpts,
): Promise<LoadOutcome> {
  const piExtras: Record<string, unknown> = {};
  if (hostOpts?.piSetSessionName !== false) {
    piExtras.setSessionName = (): void => {};
  }
  if (hostOpts?.piGetSessionName !== false) {
    piExtras.getSessionName = (): string | undefined => undefined;
  }
  const ctxExtras: Record<string, unknown> = {};
  if (hostOpts?.ctxCompact !== false) {
    ctxExtras.compact = (): void => {};
  }
  if (hostOpts?.ctxGetContextUsage !== false) {
    ctxExtras.getContextUsage = (): undefined => undefined;
  }
  const workspaceDir = plantThetaWorkspace(
    "theta-rfc0011-callable-set-",
    Object.entries(files).map(([stem, text]) => ({ stem, text })),
    "{}",
  );
  try {
    return await runProductionLoad(workspaceDir, { registryTools: [], piExtras, ctxExtras });
  } finally {
    disposeWorkspace(workspaceDir);
  }
}

describe("RFC 0011 §3.3/§3.4 — V8: the load-time host probe (theta/load/session-tool-unavailable)", () => {
  it("V8: `tools: compact` with ctx.compact ABSENT refuses ONLY the declaring theta, one E, exact message; a sibling not declaring it registers", () => {
    return runLoad(
      {
        declaring: ["---", "mode: prompt", "tools: compact", "---", '"hi"', ""].join("\n"),
        sibling: ["---", "mode: prompt", "---", '"hi"', ""].join("\n"),
      },
      { ctxCompact: false },
    ).then((outcome) => {
      expect(
        outcome.registered,
        `RED: at HEAD 'compact' fails as unknown-tool (both un-registered) rather than the host-probe refusing 'declaring' alone. Registered: ${JSON.stringify(outcome.registered)}`,
      ).toEqual(["sibling"]);
      expect(
        outcome.diagnosticLines.some((l) => l.includes(SESSION_TOOL_UNAVAILABLE_CODE)),
        `expected a ${SESSION_TOOL_UNAVAILABLE_CODE} line among ${JSON.stringify(outcome.diagnosticLines)}`,
      ).toBe(true);
      expect(
        outcome.notifications.some((n) =>
          n.includes("runtime tool 'compact' is unavailable on this host: 'ctx.compact' is not a function"),
        ),
        `expected the exact host-probe message among ${JSON.stringify(outcome.notifications)}`,
      ).toBe(true);
    });
  });

  it("V8: every declared host member is probed in order — ctx.getContextUsage absent names that member", () => {
    return runLoad(
      { declaring: ["---", "mode: prompt", "tools: context_usage", "---", '"hi"', ""].join("\n") },
      { ctxGetContextUsage: false },
    ).then((outcome) => {
      expect(outcome.registered).toEqual([]);
      expect(
        outcome.notifications.some((n) =>
          n.includes("runtime tool 'context_usage' is unavailable on this host: 'ctx.getContextUsage' is not a function"),
        ),
      ).toBe(true);
    });
  });

  it("V8: the session_name TWO-MEMBER probe order — pi.setSessionName absent is named before pi.getSessionName is ever consulted", () => {
    return runLoad(
      { declaring: ["---", "mode: prompt", "tools: session_name", "---", '"hi"', ""].join("\n") },
      { piSetSessionName: false, piGetSessionName: false },
    ).then((outcome) => {
      expect(outcome.registered).toEqual([]);
      expect(
        outcome.notifications.some((n) =>
          n.includes("runtime tool 'session_name' is unavailable on this host: 'pi.setSessionName' is not a function"),
        ),
        "the FIRST probed member (setSessionName) names the refusal, not the second",
      ).toBe(true);
      expect(
        outcome.notifications.some((n) => n.includes("'pi.getSessionName' is not a function")),
        "the second member is never reached once the first probe already failed",
      ).toBe(false);
    });
  });

  it("V8: the session_name probe reaches the SECOND member when only pi.getSessionName is absent", () => {
    return runLoad(
      { declaring: ["---", "mode: prompt", "tools: session_name", "---", '"hi"', ""].join("\n") },
      { piGetSessionName: false },
    ).then((outcome) => {
      expect(outcome.registered).toEqual([]);
      expect(
        outcome.notifications.some((n) =>
          n.includes("runtime tool 'session_name' is unavailable on this host: 'pi.getSessionName' is not a function"),
        ),
      ).toBe(true);
    });
  });

  it("V8: one diagnostic per unavailable DECLARED tool, deduplicated by canonical name across two renamed entries", () => {
    return runLoad(
      {
        declaring: ["---", "mode: prompt", "tools: compact as a, compact as b", "---", '"hi"', ""].join("\n"),
      },
      { ctxCompact: false },
    ).then((outcome) => {
      const hits = outcome.notifications.filter((n) => n.includes(SESSION_TOOL_UNAVAILABLE_CODE) || n.includes("is unavailable on this host"));
      expect(outcome.registered).toEqual([]);
      expect(
        hits.length,
        `RED: expected exactly ONE probe diagnostic for the two renamed entries of the same canonical tool, got ${JSON.stringify(outcome.notifications)}`,
      ).toBe(1);
    });
  });
});

describe("RFC 0011 §3.3/§3.4 — V8b: the probe names the CANONICAL name, not the presented (renamed) spelling", () => {
  it("V8b: `tools: session_name as sn` with pi.getSessionName absent renders the message with the canonical name 'session_name', not 'sn'", () => {
    return runLoad(
      { declaring: ["---", "mode: prompt", "tools: session_name as sn", "---", '"hi"', ""].join("\n") },
      { piGetSessionName: false },
    ).then((outcome) => {
      expect(outcome.registered).toEqual([]);
      expect(
        outcome.notifications.some((n) =>
          n.includes("runtime tool 'session_name' is unavailable on this host: 'pi.getSessionName' is not a function"),
        ),
        "the CANONICAL name 'session_name' names the tool, never the renamed 'sn'",
      ).toBe(true);
      expect(outcome.notifications.some((n) => n.includes("runtime tool 'sn'"))).toBe(false);
    });
  });
});

describe("RFC 0011 §3.3 — V9: FACTORY_PROBED_SDK_MEMBERS is NOT widened (green regression pin)", () => {
  it("still the 8 literals — the load probe reads the composition-scope ctx/pi directly, never through the factory capability probe", () => {
    expect([...FACTORY_PROBED_SDK_MEMBERS]).toEqual([
      "pi.registerCommand",
      "pi.sendUserMessage",
      "pi.registerTool",
      "pi.setActiveTools",
      "pi.getActiveTools",
      "pi.getAllTools",
      "pi.registerMessageRenderer",
      "pi.sendMessage",
    ]);
  });
});

describe("RFC 0011 §3.4 — V10: a nested `.theta` callee declaring a runtime tool resolves cleanly; parent load unaffected", () => {
  it("V10: parent `tools: ./child.theta`; child `tools: compact` — child registers with no unknown-tool notification, parent registers", () => {
    return runLoad({
      parent: ["---", "mode: prompt", "tools:", "  - ./child.theta", "---", '"hi"', ""].join("\n"),
      child: ["---", "mode: subagent", "tools: compact", "---", '"hi"', ""].join("\n"),
    }).then((outcome) => {
      expect(
        outcome.registered,
        `RED: at HEAD the child fails to register ('compact' is an unknown Pi tool), which may also un-register the parent. Registered: ${JSON.stringify(outcome.registered)}`,
      ).toEqual(["child", "parent"]);
      expect(
        outcome.notifications.some((n) => n.includes("unknown Pi tool 'compact'")),
        `expected no unknown-tool notification for 'compact' among ${JSON.stringify(outcome.notifications)}`,
      ).toBe(false);
    });
  });
});

// ===========================================================================
// §4 — S2 model-facing exclusions.
// ===========================================================================

/** The Pi-tool underlying names in a resolved snapshot (the `--tools`
 * allowlist inputs) — mirrors `tests/subagent-tool-admission.test.ts`'s local
 * `piToolNames` helper, the same technique this seam's private
 * `callableSetPiToolNames` cannot be imported to exercise directly. */
function piToolNamesOf(fixture: ThetaFixture): string[] {
  const snapshot = (fixture as unknown as { callableSet?: { entries: ReadonlyMap<string, { kind: string; toolDefinition?: unknown }> } }).callableSet;
  const names: string[] = [];
  for (const entry of snapshot?.entries.values() ?? []) {
    if (entry.kind === "pi-tool") {
      // Production stores PiToolDispatch with `toolName`, not `name`.
      names.push((entry.toolDefinition as { toolName?: string })?.toolName ?? "");
    }
  }
  return names;
}

describe("RFC 0011 §4 — X1/X2: install-vector exclusions", () => {
  it("X1/X2: a mixed callable set {read (pi-tool), compact (runtime)} excludes 'compact' from both the pi-tool names AND the computed install vector", () => {
    return runLoad({
      mixed: ["---", "mode: prompt", "tools:", "  - read", "  - compact", "---", '"hi"', ""].join("\n"),
    }).then((outcome) => {
      expect(
        outcome.registered,
        `RED: at HEAD 'compact' is an unknown Pi tool, so the theta never registers at all. Registered: ${JSON.stringify(outcome.registered)}`,
      ).toEqual(["mixed"]);
      const fixture = outcome.fixtures.find((f) => f.slashName === "mixed");
      expect(fixture).toBeDefined();
      const piNames = piToolNamesOf(fixture as ThetaFixture);
      expect(piNames, "the derived pi-tool name list never carries 'compact'").toEqual(["read"]);
      const installVector = computeActiveSetInstall({
        thetaCallableSetNames: piNames,
        respondToolName: "respond_x",
      });
      expect(installVector, "'compact' never enters the install vector").toEqual(["read", "respond_x"]);
    });
  });
});

describe("RFC 0011 §4 — X3: an all-runtime-tool set maps to --no-tools (fake-launcher pattern)", () => {
  it("X3: `tools: compact, context_usage` (no host tool at all) -> noHostTools true -> --no-tools in the child argv", () => {
    return runLoad({
      allruntime: ["---", "mode: subagent", "tools: compact, context_usage", "---", '"hi"', ""].join("\n"),
    }).then((outcome) => {
      expect(
        outcome.registered,
        `RED: at HEAD both entries are unknown Pi tools, so the theta never registers. Registered: ${JSON.stringify(outcome.registered)}`,
      ).toEqual(["allruntime"]);
      const fixture = outcome.fixtures.find((f) => f.slashName === "allruntime");
      expect(fixture).toBeDefined();
      const piNames = piToolNamesOf(fixture as ThetaFixture);
      expect(piNames, "an all-runtime-tool set carries NO pi-tool names").toEqual([]);
      const noHostTools = piNames.length === 0;
      const argv = assembleSubagentArgv(
        {
          slug: "allruntime",
          thetaDirs: ["/w/.pi/theta"],
          systemPrompt: "sp",
          hostTools: piNames,
          respondToolNames: [],
          noHostTools,
          provider: "anthropic",
          model: "claude-sonnet",
          projectTrust: false,
        },
        PI_CLI_DIALECT,
      );
      expect(argv).toContain("--no-tools");
      expect(argv).not.toContain("--tools");
    });
  });
});

// ===========================================================================
// §4 / seam-sheet V6 — a `subagent fn` body with `tools: "compact"` override.
// The runtime-tool entry survives `subagentFnCallableSet` by presented name
// (the `underlying = undefined` arm), but `callableSetPiToolNames` over the
// derived set stays `[]` → the child argv carries `--no-tools`.
// Driven through the real producer with a fake spawn so the cell asserts
// the recorded child argv.
// ===========================================================================
import type { ThetaDocument } from "../src/parser/theta-document";
import type { ThetaCompositionInput, ConversationBindInput } from "../src/extension/theta-composition-producer";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { executeBody } from "../src/runtime/statement-executor";
import { serializeOkEnvelope } from "../src/runtime/subagent-envelope";
import type { SpawnFn } from "../src/runtime/subagent-launcher";
import { fakeExecutableHost, makeFakeJsonChildLauncher, type FakeJsonChild, type SpawnRecord } from "./helpers/fake-json-child";
import { childRegimeRootDouble } from "./helpers/subagent-fn-child-regime";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";

function v6Parse(src: string): ThetaDocument {
  return parseDoc(src, "/thetadir/caller.theta");
}

const V6_MODELS = [
  { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
];

describe("RFC 0011 §4 V6 — subagent fn with tools: \"compact\" override → child argv carries --no-tools", () => {
  it("V6: a `subagent fn step() with { tools: \"compact\" }` body → the child is launched with --no-tools (the runtime-tool entry has no pi-tool underlying)", async () => {
    const src = [
      "subagent fn step() with { tools: \"compact\" } {",
      '  "done"',
      "}",
      "step()",
    ].join("\n");
    const doc = v6Parse(src);
    const errors = doc.diagnostics.filter((d) => d.severity === "error");
    expect(errors, `fixture must parse clean: ${errors.map((d) => d.code).join(", ")}`).toHaveLength(0);

    // Build a calling theta whose callable set carries `compact` as a
    // runtime-tool entry — the same shape `discoverAndComposeFixtures`
    // produces for `tools: compact` in the frontmatter.
    const compactEntry = { kind: "runtime-tool" as const, name: "compact" as const };
    const callableSet = Object.freeze({
      entries: new Map<string, typeof compactEntry>([["compact", compactEntry]]),
    });
    const theta = {
      slashName: "caller",
      sourcePath: "/thetadir/caller.theta",
      frontmatter: { ...(doc.frontmatter ?? {}), mode: "prompt" },
      body: doc.body,
      callableSet,
    } as unknown as ThetaCompositionInput;

    const launcher = makeFakeJsonChildLauncher();
    const spawn: SpawnFn = (execPath, args, options) => {
      const child = launcher.spawn(execPath, args, options) as FakeJsonChild;
      setTimeout(() => {
        child.emitRawLine(serializeOkEnvelope("done").replace(/\n$/, ""));
        child.crashWith(0, null);
      }, 0);
      return child;
    };
    const deps = createProductionProducerDeps({
      pi: { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI,
      root: childRegimeRootDouble(),
      modelRegistry: { getAvailable: () => V6_MODELS } as unknown as ModelRegistry,
      subagentSpawn: spawn,
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: {
        model: V6_MODELS[0],
        cwd: "/work/project",
        signal: undefined,
        sessionManager: { getEntries: () => [], getLeafId: () => undefined },
      } as unknown as import("@earendil-works/pi-coding-agent").ExtensionCommandContext,
    };
    const binding = deps.bindPromptConversation(bindInput);
    await executeBody(theta.body, binding.executeDeps);

    expect(launcher.spawns).toHaveLength(1);
    const spawnRecord = launcher.spawns[0]!;
    expect(
      spawnRecord.args,
      `V6: the child argv must carry --no-tools because the runtime-tool entry has no pi-tool underlying. Got: ${JSON.stringify(spawnRecord.args)}`,
    ).toContain("--no-tools");
    expect(
      spawnRecord.args,
      "V6: --tools must NOT appear (no pi-tool to install)",
    ).not.toContain("--tools");
  });
});

describe("RFC 0011 §4 — X4: inferChildTrust inputs are unchanged (green control)", () => {
  it("X4: a mixed set's derived pi-tool names still grant project-local trust exactly as an ordinary set would", () => {
    return runLoad({
      mixed2: ["---", "mode: prompt", "tools:", "  - read", "  - compact", "---", '"hi"', ""].join("\n"),
    }).then((outcome) => {
      const fixture = outcome.fixtures.find((f) => f.slashName === "mixed2");
      if (fixture === undefined) {
        // RED cascades from X1/X2 above (the theta does not register at HEAD);
        // this cell's own subject (inferChildTrust unchanged) cannot run without
        // a registered fixture to read the callable set from.
        expect(fixture, "cascaded RED: 'mixed2' did not register (see X1/X2)").toBeDefined();
        return;
      }
      const piNames = piToolNamesOf(fixture);
      const allTools = [{ name: "read", sourceInfo: { scope: "project" } }];
      expect(inferChildTrust(piNames, allTools)).toBe(true);
    });
  });
});
