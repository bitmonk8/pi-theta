// Bug 0343 — a callable whose derived/presented name is exactly `__proto__`
// never marshals a closure-hash row. The subagent hash carrier is a plain
// object literal (`const callableHashes: Record<string, string> = {}` in
// `spawnSubagentConversation`, `production-theta-producer.ts`) whose string key
// `__proto__` resolves to the accessor `Object.prototype` exposes, not an own
// data property. Both carrier write sites — the `tools:`-entry write
// (`callableHashes[entry.presentedName] = entry.closureHash`) and the bug-0328
// root-row write (`callableHashes[rootClosureHash.name] = rootClosureHash.hash`,
// guarded by `!Object.hasOwn`) — assign a STRING value at that key, so the
// inherited setter ignores it: no throw, no own row. The carrier gate
// (`Object.keys(callableHashes).length > 0`) then sees an empty map for a
// `__proto__`-only launch and emits no carrier, and the child's
// `verifyChildCallableHashes` (`subagent-child-hash-verify.ts`) iterates only
// present rows — so the `__proto__` callable is admitted with no closure-hash
// check and RFC-0005's parent-load-to-child-spawn edit window reopens for that
// one name (subagent.md #subagent-theta-callable-hash).
//
// The settled §Fix routes both writes through `defineRecordField`
// (`src/runtime/value.ts`, already imported in `production-theta-producer.ts`),
// which calls `Object.defineProperty` and lands an own enumerable data property
// byte-identical to an ordinary assignment for every ordinary name, so a
// `__proto__` row appears as an own key in `Object.keys`, in `JSON.stringify`,
// and in the child's `Object.entries` reader.
//
// These cells assert the SPECIFIED post-fix behaviour and RED on the current
// tree for the RIGHT reason (the `__proto__` row is absent / the carrier is
// cleared), never a type error: `rootClosureHash` is reached through the same
// cast bug 0328's cells use.
//
// Cell E is not a cell: bug 0328 cell `2c`
// (`tests/b0328-root-closure-hash-marshalled.test.ts`) already locks the
// SIBLING prototype-name `constructor`, which — unlike `__proto__` — is an
// ordinary inherited data property that a plain assignment shadows with an own
// key, so it marshals today. `__proto__` is the accessor case that does not.
//
// No silent skipping: an unmet precondition (no spawn recorded, fixture absent)
// fails the surrounding assertion loudly with a message naming it; there is no
// early return or skip.

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import {
  hashCallableClosure,
  SUBAGENT_CALLABLE_HASHES_ENV,
} from "../src/runtime/subagent-callable-hash";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";
import {
  fakeExecutableHost,
  makeFakeJsonChildLauncher,
} from "./helpers/fake-json-child";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import { defineRecordField } from "../src/runtime/value";
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ThetaBody } from "../src/parser/theta-document";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

// ── Shared discovery harness (mirrors b0328 / the e2e refusal harness) ──

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}

function makeDiscoveryHost(cwd: string): {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notifications: string[];
} {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  return { pi, ctx, notifications };
}

async function runDiscovery(cwd: string): Promise<LoadOutcome> {
  const host = makeDiscoveryHost(cwd);
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(host.pi, host.ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications: host.notifications };
}

/** The exact on-disk content a closure hash is computed over (UTF-8, no BOM). */
function readText(path: string): string {
  return readFileSync(path, "utf8");
}

let workspaceDir: string;
let thetaDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0343-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read for hermeticity (an
  // ABSENT file is silent per package-and-settings.md §Failure modes), matching
  // the b0328 and e2e harnesses.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

// ── Parent-producer harness (mirrors b0328 cell 2: real
//    spawnSubagentConversation over a fake JSON child launcher) ──

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: () => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

function queryBody(): ThetaBody {
  return {
    statements: [],
    tail: {
      kind: "query",
      schema: null,
      template: "do the thing",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } },
    },
  } as unknown as ThetaBody;
}

function makeParentDeps(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly launcher: ReturnType<typeof makeFakeJsonChildLauncher>;
} {
  const launcher = makeFakeJsonChildLauncher();
  const deps = createProductionProducerDeps({
    pi: noopPi(),
    root: rootDouble(),
    modelRegistry: {
      getApiKeyAndHeaders: () => Promise.resolve({ ok: false }),
    } as unknown as ModelRegistry,
    parseCallee: (_caller: string | undefined, _calleePath: string) =>
      Promise.resolve({} as unknown as ThetaCompositionInput),
    subagentSpawn: launcher.spawn,
    subagentExecutableHost: fakeExecutableHost(),
    subagentParentEnv: {},
    subagentParentPid: 4242,
  });
  return { deps, launcher };
}

function parentBindInput(theta: ThetaCompositionInput): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta, args: "", ctx, thetaAbort: new AbortController() };
}

function carrierRaw(env: Record<string, string | undefined>): string | undefined {
  return env[SUBAGENT_CALLABLE_HASHES_ENV];
}

function marshalledHashes(env: Record<string, string | undefined>): Record<string, string> {
  const raw = carrierRaw(env);
  return raw === undefined ? {} : (JSON.parse(raw) as Record<string, string>);
}

// =============================================================================
// Cell A — ROOT path: a root whose derived name is `__proto__` marshals its row.
// =============================================================================

describe("bug 0343 (A) — the root-row write marshals a `__proto__` name as an own carrier key", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("A: a `tools:`-less root named __proto__ marshals a present carrier with __proto__ as an OWN key", async () => {
    const { deps, launcher } = makeParentDeps();
    const theta = {
      slashName: "proto-root",
      sourcePath: "/roots/proto-root.theta",
      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries: new Map() } as CallableSetSnapshot,
      // The derived name is the degenerate accessor name; the bug-0328 root-row
      // write assigns a STRING here, which the inherited __proto__ setter drops.
      rootClosureHash: { name: "__proto__", hash: "sha256:ROOT" },
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    expect(launcher.spawns, "exactly one child spawned").toHaveLength(1);
    const env = launcher.spawns[0]!.env;
    const raw = carrierRaw(env);
    // RED pre-fix: `callableHashes["__proto__"] = hash` no-ops through the
    // Object.prototype setter, the carrier gate sees an empty map, and no
    // carrier is emitted. GREEN post-fix: defineRecordField lands the own row.
    expect(
      raw,
      "a __proto__-named root must marshal a present carrier; the plain-object write no-ops through the inherited Object.prototype setter",
    ).toBeDefined();
    // The row must survive serialization as a literal JSON key.
    expect(raw!).toContain('"__proto__"');
    const parsed = marshalledHashes(env);
    expect(
      Object.hasOwn(parsed, "__proto__"),
      "the __proto__ row must be an OWN key of the parsed carrier, not an inherited accessor",
    ).toBe(true);
    expect(parsed["__proto__"]).toBe("sha256:ROOT");
  });
});

// =============================================================================
// Cell B — `tools:`-ENTRY path: a presented name `__proto__` marshals its row.
// =============================================================================

describe("bug 0343 (B) — the tools:-entry write marshals a `__proto__` presented name as an own carrier key", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("B: a callable-set entry presented as __proto__ marshals a present carrier with __proto__ as an OWN key", async () => {
    const { deps, launcher } = makeParentDeps();
    // `callableSetThetaEntries` iterates the entries Map, reading the Map KEY as
    // the presented name — so the degenerate name rides the entry key here.
    const entries = new Map<string, unknown>([
      [
        "__proto__",
        {
          kind: "theta" as const,
          mode: "subagent" as const,
          calleePath: "./child.theta",
          callee: undefined,
          closureHash: "sha256:ENTRY",
        },
      ],
    ]);
    const theta = {
      slashName: "proto-entry-root",
      sourcePath: "/roots/proto-entry-root.theta",
      frontmatter: {
        mode: "subagent",
        tools: ["./child.theta as __proto__"],
      } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries } as CallableSetSnapshot,
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    expect(launcher.spawns, "exactly one child spawned").toHaveLength(1);
    const env = launcher.spawns[0]!.env;
    const raw = carrierRaw(env);
    // RED pre-fix: the `tools:`-entry write `callableHashes[entry.presentedName]
    // = entry.closureHash` no-ops for the key __proto__, so the map is empty and
    // no carrier is emitted. GREEN post-fix: defineRecordField lands the own row.
    expect(
      raw,
      "a __proto__ presented name must marshal a present carrier; the tools:-entry write no-ops through the inherited Object.prototype setter",
    ).toBeDefined();
    expect(raw!).toContain('"__proto__"');
    const parsed = marshalledHashes(env);
    expect(
      Object.hasOwn(parsed, "__proto__"),
      "the __proto__ row must be an OWN key of the parsed carrier, not an inherited accessor",
    ).toBe(true);
    expect(parsed["__proto__"]).toBe("sha256:ENTRY");
  });
});

// =============================================================================
// Cell C — END-TO-END: the parent shapes the carrier, the child hash-verifies.
// Drives the REAL parent producer to SHAPE the carrier (as b0328 cell 3's
// parentMarshalRootCarrier does) then forwards it to the child compose under the
// authenticated control plane. The parent bug is the driver: pre-fix the parent
// emits no __proto__ row, so the child verifies nothing and an edit to the
// __proto__ callee runs unvalidated.
//
// The reachable end-to-end name is a `tools:`-entry rename `as __proto__`, NOT a
// root FILE `__proto__.theta`: `SLASH_NAME` (`discovery-walk.ts`) rejects a
// leading-underscore basename at discovery, so a `__proto__.theta` root never
// reaches the child — cell A witnesses the root-row marshalling no-op at the
// producer directly. `isLowercaseFirstIdentifier` (`callable-set.ts`) DOES admit
// `__proto__` as a rename target, so the presented-name path is the one that
// reaches the child. A genuine `__proto__` JSON key round-trips to an own Map
// entry in the child's `Object.entries` reader (`readMarshalledCallableHashes`,
// `subagent-child-hash-verify.ts`), so the child drops on mismatch WHEN the
// parent produces the key — which pre-fix it never does.
// =============================================================================

const savedEnv: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined): void {
  if (!(key in savedEnv)) {
    savedEnv[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

const PROTO_CALLER =
  "---\nmode: subagent\ntools:\n  - ./proto-tool.theta as __proto__\n---\n@`hi`\n";
const PROTO_TOOL =
  "---\nmode: subagent\nparams:\n  q: string\n---\n@`tool ${q}`\n";

function plantProtoFixture(): { readonly toolPath: string } {
  writeFileSync(join(thetaDir, "proto-caller.theta"), PROTO_CALLER, "utf8");
  const toolPath = join(thetaDir, "proto-tool.theta");
  writeFileSync(toolPath, PROTO_TOOL, "utf8");
  return { toolPath };
}

/**
 * Drive the real parent producer over a subagent caller whose sole `tools:`
 * entry is presented as `__proto__`, carrying the CURRENT on-disk tool's closure
 * hash on the frozen entry, and return the raw carrier the parent marshalled
 * (undefined pre-fix — the `tools:`-entry write no-ops for the key __proto__).
 * The producer marshals the entry hash structurally; it never re-reads the tool,
 * so a later on-disk edit affects only the child recompute.
 */
async function parentMarshalProtoEntryCarrier(toolPath: string): Promise<string | undefined> {
  const loadTimeHash = hashCallableClosure([{ path: toolPath, content: readText(toolPath) }]);
  const { deps, launcher } = makeParentDeps();
  const entries = new Map<string, unknown>([
    [
      "__proto__",
      {
        kind: "theta" as const,
        mode: "subagent" as const,
        calleePath: "./proto-tool.theta",
        callee: undefined,
        closureHash: loadTimeHash,
      },
    ],
  ]);
  const theta = {
    slashName: "proto-caller",
    sourcePath: "/roots/proto-caller.theta",
    frontmatter: {
      mode: "subagent",
      tools: ["./proto-tool.theta as __proto__"],
    } as unknown as ParsedFrontmatter,
    body: queryBody(),
    callableSet: { entries } as CallableSetSnapshot,
  } as unknown as ThetaCompositionInput;
  await deps.spawnSubagentConversation(parentBindInput(theta));
  expect(launcher.spawns, "parent must record exactly one spawn").toHaveLength(1);
  return carrierRaw(launcher.spawns[0]!.env);
}

const PROTO_MISMATCH_MSG =
  "subagent callable '__proto__' content hash mismatch; refusing invocation";

describe("bug 0343 (C) — child end-to-end: the parent-marshalled __proto__ row catches a load→spawn edit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
      delete savedEnv[key];
    }
  });

  it("C-admit: a byte-identical __proto__ callee is ADMITTED with no mismatch note (green anchor)", async () => {
    const { toolPath } = plantProtoFixture();

    const carrier = await parentMarshalProtoEntryCarrier(toolPath);
    // Forward EXACTLY what the parent marshalled under the authenticated control
    // plane (readParentEnv honours PI_THETA_* only when the parent-pid names the
    // reading process's real parent — subagent.md #subagent-control-plane-authentication).
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "proto-caller");
    setEnv(SUBAGENT_CALLABLE_HASHES_ENV, carrier);

    const outcome = await runDiscovery(workspaceDir);

    // Green in BOTH tree states: pre-fix no carrier so nothing verifies; post-fix
    // the recomputed hash matches. Either way the callee is admitted with no note
    // — the mandatory green-after-fix sanity check. The child side needs no fix:
    // its Object.entries reader materialises a genuine JSON __proto__ key as an
    // own Map entry (readMarshalledCallableHashes, subagent-child-hash-verify.ts).
    expect(outcome.registered).toContain("proto-caller");
    expect(outcome.registered).toContain("proto-tool");
    expect(outcome.notifications).not.toContain(PROTO_MISMATCH_MSG);
  });

  it("C-drop: a __proto__ callee edited between parent load and child spawn is DROPPED with the mismatch note (red witness)", async () => {
    const { toolPath } = plantProtoFixture();

    // Parent marshals the hash of the ORIGINAL tool bytes under the presented
    // name __proto__.
    const carrier = await parentMarshalProtoEntryCarrier(toolPath);

    // Edit AFTER parent load but BEFORE the child re-discovers: the child would
    // run bytes the parent never validated.
    writeFileSync(
      toolPath,
      "---\nmode: subagent\nparams:\n  q: string\n---\n@`EDITED body the parent never validated ${q}`\n",
      "utf8",
    );

    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "proto-caller");
    setEnv(SUBAGENT_CALLABLE_HASHES_ENV, carrier);

    const outcome = await runDiscovery(workspaceDir);

    // RED pre-fix: the parent's __proto__ write no-ops, so it marshals NO row
    // (carrier undefined), the child verifies nothing, and the edited callee
    // registers silently. GREEN post-fix: the parent marshals the load-time hash
    // under __proto__, the child recompute over the edited bytes diverges, and
    // the callee is refused fail-closed with the registry-pinned mismatch message
    // while the caller stays registered.
    expect(outcome.registered).toContain("proto-caller");
    expect(outcome.registered).not.toContain("proto-tool");
    expect(outcome.notifications).toContain(PROTO_MISMATCH_MSG);
  });
});

// =============================================================================
// Cell D — ORDINARY-NAME control: defineRecordField is byte-equivalent to a
// plain assignment for an ordinary name, so the fix carries no serialization
// regression. Green in BOTH tree states (a pure control over the helper).
// =============================================================================

describe("bug 0343 (D) — defineRecordField changes nothing for an ordinary carrier name", () => {
  it("D: an ordinary-name carrier built by assignment and by defineRecordField serialize byte-identically", () => {
    const assigned: Record<string, string> = {};
    assigned["child"] = "sha256:child";
    const defined: Record<string, string> = {};
    defineRecordField(defined, "child", "sha256:child");
    // The fix's helper (src/runtime/value.ts) lands an own enumerable data
    // property whose descriptor matches what assignment produces, so no consumer
    // observes a difference for an ordinary name.
    expect(JSON.stringify(defined)).toBe(JSON.stringify(assigned));
    expect(Object.keys(defined)).toEqual(Object.keys(assigned));
  });
});
