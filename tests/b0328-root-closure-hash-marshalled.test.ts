// Bug 0328 — the launched subagent ROOT callee's own transitive-closure hash is
// never marshalled. subagent.md #subagent-theta-callable-hash widens the hash
// obligation to the "whole callee file": the parent must record, at LOAD, a
// content hash of the transitive closure of the root callee `.theta` plus every
// `.thetalib` it imports, and marshal it to the child so the child refuses on
// mismatch. Today the parent builds the marshalled map from `tools:` entries
// ONLY (production-theta-producer.ts:2067 loop over `thetaCallableEntries`) and
// clears the carrier entirely for a `tools:`-less callee
// (production-theta-producer.ts:2182–2185), and no load site records a theta's
// OWN closure hash — `attachLoadTimeClosureHashes`
// (production-composition.ts:2111) fills `tools:`-entry hashes only. The
// child-side verifier already drops a marked root whose name the map carries
// (proven by tests/subagent-child-hash-refusal-e2e.test.ts's hand-planted root
// entry); the defect is purely PARENT-side omission.
//
// The fix (Phase 2): add `rootClosureHash?: { name; hash }` to `ParsedTheta`
// (reload-wiring.ts:54); at LOAD compute it for EVERY theta with a readable
// source, regardless of `mode` (ANY theta can be launched as a child root, not
// only a subagent-mode one), as `{ name: deriveCallableName(sourcePath), hash:
// resolveCallableClosureHash(fs, ctx, deps, undefined, sourcePath) }`
// (deriveCallableName at production-composition.ts:1223 — basename minus
// `.theta`, hyphens→underscores; resolveCallableClosureHash at :3185); the
// producer's marshalling loop then adds `callableHashes[rootClosureHash.name] =
// rootClosureHash.hash` after the `tools:`-entry loop when that key is not
// already an entry key.
//
// These cells assert the SPECIFIED post-fix behaviour. Cells 1 and 2 reach
// `rootClosureHash` only through casts, so they COMPILE against the current
// (pre-fix) tree and RED on the assertion — never a type error. Cell 3 drives
// the real parent→child flow: 3a is the byte-identical green anchor (a matching
// closure must never be dropped — the fix's green-after sanity check), 3b is the
// red witness (the parent marshals no root key today, so an edit to the root
// between parent load and child spawn is undetectable).
//
// Every `0.306.0` in a comment is the literal placeholder the fix's version fills.
//
// No silent skipping: an unmet precondition (fixture absent, spawn not recorded)
// fails the surrounding assertion loudly; there is no early return or skip.
//
// Round-2 cells 1c and 2c pin the two round-2 remedies: 1c proves capture is no
// longer gated on `mode: subagent` (a `mode: prompt` root also carries
// `rootClosureHash`, because a subagent caller can spawn a prompt-mode callee as
// its child root); 2c proves the producer's presence guard is `Object.hasOwn`,
// not `=== undefined` (a root whose derived name collides with an inherited
// `Object.prototype` member, e.g. `constructor`, still marshals its row instead
// of being silently dropped).

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve as resolvePath } from "node:path";
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
import type {
  ConversationBindInput,
  ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ThetaBody } from "../src/parser/theta-document";
import type { CallableSetSnapshot } from "../src/parser/callable-set";
import type { ParsedFrontmatter } from "../src/parser/frontmatter";

/**
 * The shape the fix stamps onto `ParsedTheta` / the composition input. Read via
 * a cast so these cells compile against the pre-fix tree (the field does not yet
 * exist) and red on the value rather than on a type error.
 */
interface RootClosureHash {
  readonly name: string;
  readonly hash: string;
}

// ── Shared discovery harness (mirrors tests/subagent-child-hash-refusal-e2e.ts) ──

interface LoadOutcome {
  readonly fixtures: readonly ThetaFixture[];
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
  const fixtures = await discoverAndComposeFixtures(host.pi, host.ctx);
  return {
    fixtures,
    registered: fixtures.map((f) => f.slashName),
    notifications: host.notifications,
  };
}

/** The `rootClosureHash` the fix stamps on the composed fixture (undefined pre-fix). */
function rootClosureHashOf(fixture: ThetaFixture): RootClosureHash | undefined {
  return (fixture as unknown as { rootClosureHash?: RootClosureHash }).rootClosureHash;
}

/** The exact on-disk content the closure hash is computed over (UTF-8, no BOM). */
function readText(path: string): string {
  return readFileSync(path, "utf8");
}

let workspaceDir: string;
let thetaDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "b0328-"));
  thetaDir = join(workspaceDir, ".pi", "theta");
  mkdirSync(thetaDir, { recursive: true });
  // A minimal valid settings file pins the settings read (an ABSENT file is
  // silent per package-and-settings.md §Failure modes) — hermeticity, not noise
  // suppression, matching the e2e harness.
  writeFileSync(join(workspaceDir, ".pi", "settings.json"), "{}", "utf8");
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

// =============================================================================
// Cell 1 — LOAD: the composed subagent root carries its OWN closure hash.
// =============================================================================

describe("bug 0328 (1) — LOAD records the root callee's own transitive-closure hash", () => {
  it("1a: a `tools:`-less, import-less subagent root carries rootClosureHash = { derived name, single-file closure hash }", async () => {
    // A hyphenated stem also witnesses the hyphen→underscore name derivation
    // (deriveCallableName, production-composition.ts:1223): `zqx-root` → `zqx_root`.
    const rootPath = join(thetaDir, "zqx-root.theta");
    writeFileSync(rootPath, "---\nmode: subagent\n---\n@`hi`\n", "utf8");

    const outcome = await runDiscovery(workspaceDir);
    const fixture = outcome.fixtures.find((f) => f.slashName === "zqx-root");
    // Fail loudly if the precondition (a registered root) is not met.
    expect(fixture, "zqx-root must register so its rootClosureHash is observable").toBeDefined();

    // The closure of a `tools:`-less, import-less root is the single root file,
    // so the hash is order-independent of any single path (nothing else is in it).
    const source = (fixture as unknown as { sourcePath: string }).sourcePath;
    const expectedHash = hashCallableClosure([{ path: source, content: readText(rootPath) }]);

    // RED pre-fix: rootClosureHash is undefined (no load site records the root's
    // own closure). GREEN post-fix: the load computes exactly this pair.
    expect(rootClosureHashOf(fixture!)).toEqual({ name: "zqx_root", hash: expectedHash });
  });

  it("1b: a subagent root importing a `.thetalib` folds the import into rootClosureHash", async () => {
    // Top-level `fn` is implicitly exported (imports.md §Visibility), so the
    // library needs no `export` clause.
    const libPath = join(thetaDir, "zqx2-lib.thetalib");
    const rootPath = join(thetaDir, "zqx2-root.theta");
    writeFileSync(libPath, 'fn greet(): string {\n  return "hi"\n}\n', "utf8");
    writeFileSync(
      rootPath,
      '---\nmode: subagent\n---\nimport { greet } from "./zqx2-lib.thetalib"\ngreet()\n',
      "utf8",
    );

    const outcome = await runDiscovery(workspaceDir);
    const fixture = outcome.fixtures.find((f) => f.slashName === "zqx2-root");
    expect(fixture, "zqx2-root must register so its rootClosureHash is observable").toBeDefined();

    // Reproduce the closure exactly as `collectCallableClosureSources` does: the
    // root file at its discovered `sourcePath`, plus the `.thetalib` resolved
    // against the root's directory. `hashCallableClosure` sorts by path, so the
    // path STRINGS must match production's (the separator flavour affects sort
    // order); using the fixture's own `sourcePath` + `resolve(dirname, import)`
    // yields the identical strings the child recomputes.
    const source = (fixture as unknown as { sourcePath: string }).sourcePath;
    const libAbs = resolvePath(dirname(source), "./zqx2-lib.thetalib");
    const expectedHash = hashCallableClosure([
      { path: source, content: readText(rootPath) },
      { path: libAbs, content: readText(libPath) },
    ]);

    // RED pre-fix: undefined. GREEN post-fix: the folded closure hash under the
    // derived name `zqx2_root`.
    expect(rootClosureHashOf(fixture!)).toEqual({ name: "zqx2_root", hash: expectedHash });
  });

  it("1c: a `mode: prompt` root also carries rootClosureHash — capture is mode-independent", async () => {
    // A subagent-mode caller can invoke a prompt-mode callee as its spawned
    // child root (invocation.md), so the removed `mode: subagent` gate would
    // leave that spawned root's bytes unhashed. Driven through the real
    // on-disk discovery path (not a hand-built `sourcePath` literal) so the
    // tmpdir path is a runtime value, never source text the DIAG-2 corpus scan
    // sees.
    const rootPath = join(thetaDir, "zqxp-root.theta");
    writeFileSync(rootPath, "---\nmode: prompt\n---\n@`hi`\n", "utf8");

    const outcome = await runDiscovery(workspaceDir);
    const fixture = outcome.fixtures.find((f) => f.slashName === "zqxp-root");
    expect(fixture, "zqxp-root must register so its rootClosureHash is observable").toBeDefined();

    const source = (fixture as unknown as { sourcePath: string }).sourcePath;
    const expectedHash = hashCallableClosure([{ path: source, content: readText(rootPath) }]);

    // RED if the `mode: subagent` gate is reinstated: a prompt-mode root would
    // then carry no rootClosureHash. GREEN post-fix: capture is mode-independent.
    expect(rootClosureHashOf(fixture!)).toEqual({ name: "zqxp_root", hash: expectedHash });
  });
});

// =============================================================================
// Cell 2 — PARENT MARSHAL: the producer marshals the root hash into the carrier.
// Mirrors the (B) harness in tests/subagent-model-theta-tool.test.ts (real
// spawnSubagentConversation over a fake JSON child launcher).
// =============================================================================

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: () => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    // The model pre-flight + child teardown measure on the injected Clock; wire
    // the ambient timers so the seams resolve.
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
    // A `.theta` callable entry resolves its callee via parseCallee; the tests
    // below use only the frozen entry's `closureHash`, so a stub callee suffices.
    // Bug 0293: the seam returns the `CalleeParseOutcome` verdict, not a bare
    // `ThetaCompositionInput`.
    parseCallee: (_caller: string | undefined, _calleePath: string) =>
      Promise.resolve({ kind: "ok" as const, input: {} as unknown as ThetaCompositionInput }),
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

describe("bug 0328 (2) — the producer marshals rootClosureHash into PI_THETA_SUBAGENT_CALLABLE_HASHES", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("2a: a `tools:`-less subagent root marshals a PRESENT carrier keyed by its own derived name", async () => {
    const { deps, launcher } = makeParentDeps();
    const theta = {
      slashName: "zqx-root",
      sourcePath: "/theta/zqx-root.theta",
      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries: new Map() } as CallableSetSnapshot,
      // The load-captured root closure hash the fix stamps here (cast — the
      // field does not yet exist on the type).
      rootClosureHash: { name: "zqx_root", hash: "sha256:ROOT" },
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    expect(launcher.spawns, "exactly one child spawned").toHaveLength(1);
    const env = launcher.spawns[0]!.env;
    // RED pre-fix: the carrier is cleared to `undefined` for a `tools:`-less
    // callee (production-theta-producer.ts:2182–2185), so the root's own bytes
    // are never validated. GREEN post-fix: the carrier is present and names the
    // root under its derived slug.
    expect(carrierRaw(env), "carrier must be present for a tools-less root").toBeDefined();
    expect(marshalledHashes(env)["zqx_root"]).toBe("sha256:ROOT");
  });

  it("2b: a root with one `.theta` callable marshals BOTH the callable's hash AND the root's own hash", async () => {
    const { deps, launcher } = makeParentDeps();
    const entries = new Map<string, unknown>([
      [
        "child",
        {
          kind: "theta" as const,
          mode: "subagent" as const,
          calleePath: "./child.theta",
          callee: undefined,
          closureHash: "sha256:child",
        },
      ],
    ]);
    const theta = {
      slashName: "zqx-root",
      sourcePath: "/theta/zqx-root.theta",
      frontmatter: { mode: "subagent", tools: ["./child.theta"] } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries } as CallableSetSnapshot,
      rootClosureHash: { name: "zqx_root", hash: "sha256:ROOT" },
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    const map = marshalledHashes(launcher.spawns[0]!.env);
    // The `tools:` entry hash already marshals today (control leg). RED pre-fix:
    // the root's own key is absent (the loop at production-theta-producer.ts:2067
    // reads `tools:` entries only, never the root). GREEN post-fix: both keys.
    expect(map["child"], "the .theta callable hash still marshals").toBe("sha256:child");
    expect(map["zqx_root"], "the root's own closure hash marshals too").toBe("sha256:ROOT");
  });

  it("2c: a root whose derived name collides with an Object.prototype member still marshals its row", async () => {
    // `sourcePath` has no `theta/`-shaped span (the assertion below depends
    // only on the marshalled map, not on this path) so no new DIAG-2 artifact
    // is introduced by this hand-built fixture.
    const { deps, launcher } = makeParentDeps();
    const theta = {
      slashName: "ctor-root",
      sourcePath: "/roots/ctor-root.theta",
      frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
      body: queryBody(),
      callableSet: { entries: new Map() } as CallableSetSnapshot,
      // The derived name collides with an inherited Object.prototype member.
      rootClosureHash: { name: "constructor", hash: "sha256:PROTOROOT" },
    } as unknown as ThetaCompositionInput;
    await deps.spawnSubagentConversation(parentBindInput(theta));

    const map = marshalledHashes(launcher.spawns[0]!.env);
    // RED if the guard reverts to `callableHashes[rootClosureHash.name] ===
    // undefined`: `({})["constructor"]` reads the inherited function, not
    // `undefined`, so the row is silently dropped. GREEN with `Object.hasOwn`:
    // the plain object has no OWN `constructor` key, so the row marshals.
    expect(map["constructor"]).toBe("sha256:PROTOROOT");
  });
});

// =============================================================================
// Cell 3 — CHILD end-to-end: the parent-marshalled carrier lets the child catch
// an edit to the root between parent load and child spawn. Drives the REAL
// parent producer (cell 2 harness) to SHAPE the carrier, forwards it to the
// child compose (cell 1 harness) under the authenticated control plane, and
// observes admit/drop off the settled fixtures + notifications.
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

/**
 * Drive the parent producer over a `tools:`-less subagent root carrying
 * `rootClosureHash` = the closure hash of the CURRENT on-disk root, and return
 * the raw carrier value the parent marshalled (undefined pre-fix). The producer
 * marshals `rootClosureHash` structurally; it never re-reads the root file, so a
 * subsequent on-disk edit affects only the child recompute.
 */
async function parentMarshalRootCarrier(rootPath: string): Promise<string | undefined> {
  const loadTimeHash = hashCallableClosure([{ path: rootPath, content: readText(rootPath) }]);
  const { deps, launcher } = makeParentDeps();
  const theta = {
    slashName: "zqx-root",
    sourcePath: rootPath,
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: queryBody(),
    callableSet: { entries: new Map() } as CallableSetSnapshot,
    rootClosureHash: { name: "zqx_root", hash: loadTimeHash },
  } as unknown as ThetaCompositionInput;
  await deps.spawnSubagentConversation(parentBindInput(theta));
  expect(launcher.spawns, "parent must record exactly one spawn").toHaveLength(1);
  return carrierRaw(launcher.spawns[0]!.env);
}

const ROOT_MISMATCH_MSG =
  "subagent callable 'zqx_root' content hash mismatch; refusing invocation";

describe("bug 0328 (3) — child end-to-end: the marshalled root hash catches a load→spawn root edit", () => {
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

  it("3a: a byte-identical root is ADMITTED with no mismatch notification (green anchor — the fix must never false-drop)", async () => {
    const rootPath = join(thetaDir, "zqx-root.theta");
    writeFileSync(rootPath, "---\nmode: subagent\n---\n@`hi`\n", "utf8");

    const carrier = await parentMarshalRootCarrier(rootPath);
    // Forward EXACTLY what the parent marshalled, under the authenticated control
    // plane (readParentEnv honours PI_THETA_* only when the parent-pid names the
    // reading process's real parent — subagent.md #subagent-control-plane-authentication).
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-root");
    setEnv(SUBAGENT_CALLABLE_HASHES_ENV, carrier);

    // No on-disk edit: the child recomputes the identical hash.
    const outcome = await runDiscovery(workspaceDir);

    // Green in BOTH tree states: pre-fix there is no carrier so nothing verifies;
    // post-fix the recomputed hash matches. Either way the root is admitted with
    // no mismatch note — the mandatory green-after-fix sanity check.
    expect(outcome.registered).toContain("zqx-root");
    expect(outcome.notifications).not.toContain(ROOT_MISMATCH_MSG);
  });

  it("3b: a root edited between parent load and child spawn is DROPPED with the mismatch notification (red witness)", async () => {
    const rootPath = join(thetaDir, "zqx-root.theta");
    writeFileSync(rootPath, "---\nmode: subagent\n---\n@`hi`\n", "utf8");

    // Parent marshals the hash of the ORIGINAL bytes.
    const carrier = await parentMarshalRootCarrier(rootPath);

    // Simulate an edit AFTER parent load but BEFORE the child re-discovers: the
    // child would now run bytes the parent never validated.
    writeFileSync(rootPath, "---\nmode: subagent\n---\n@`EDITED body the parent never validated`\n", "utf8");

    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-root");
    setEnv(SUBAGENT_CALLABLE_HASHES_ENV, carrier);

    const outcome = await runDiscovery(workspaceDir);

    // RED pre-fix: the parent marshalled NO root key (carrier `undefined`), so
    // the child never verifies the root — it registers the edited bytes silently
    // with zero notifications. GREEN post-fix: the parent marshalled the root's
    // load-time hash, the child recompute over the edited bytes diverges, and the
    // root is refused fail-closed with the registry-pinned mismatch message.
    expect(outcome.registered).not.toContain("zqx-root");
    expect(outcome.notifications).toContain(ROOT_MISMATCH_MSG);
  });
});
