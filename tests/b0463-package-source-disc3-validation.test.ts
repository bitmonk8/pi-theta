// Bug 0463 — package-sourced candidates skip the walk's whole per-candidate
// validation stage (`resolveBySource` → `validateAndRead`, discovery-walk.ts):
// the composition-root merge registers the package walk's survivors directly,
// so the DISC-3 filename-validity check, the DISC-3 intra-source case-collision
// check, and the DISC-2 rule-1 per-file readability check never run for the
// package source
// (docs/bugs/0463-package-source-bypasses-disc3-validation.md):
//
//  (1) A package shipping `Foo.theta` registers `/Foo` where DISC-3
//      (discovery-sources.md §DISC-3 Filename validity) mandates
//      `theta/load/invalid-slash-name` (error, no registration).
//  (2) A package shipping `Plan.theta` + `plan.theta` registers both (Linux)
//      where DISC-3 (case-collision, "per source") mandates one
//      `theta/load/case-collision` warning + a byte-first winner.
//  (3) A package theta whose file cannot be read registers where DISC-2 rule 1
//      (readability, "regardless of source") mandates `theta/load/unreadable`
//      (warning, no registration).
//
// Face (1) drives the shipped `composeExtensionInstance` over a real temp
// workspace (the e2e-s6 harness shape). Faces (2)/(3) need case-variant paths
// and an injected read failure that a real disk cannot portably provide, so
// they drive `discoverThetas` directly over a `FakeFileSystem`, feeding the
// pair through the `packageCandidates` input the §Fix (DESIGN Edit 2) ADDS to
// `DiscoveryInput`. That input does NOT exist on the current tree: the cast in
// `packageInput` compiles today, `discoverThetas` silently ignores the unknown
// property (emitting nothing for the package pair — the bug), and reads it once
// the fix routes package candidates through the walk (emitting the mandated
// diagnostic — the test flips GREEN). This is the honest, stable RED shape: the
// assertion encodes the SPECIFIED diagnostic and reds because the package pair
// is currently unadjudicated, not because of a compile error.
//
// None of `theta/load/invalid-slash-name`, `theta/load/case-collision`, or
// `theta/load/unreadable` is a closed-set carve-out
// (tests/registry-closed-set-corpus-gate.test.ts), so each is located by its
// registry-code literal — the house style of tests/discovery-walk.test.ts.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  createThetaExtension,
  type ThetaExtensionDeps,
} from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { discoverThetas, type DiscoveryInput } from "../src/discovery/discovery-walk";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { FakeFileSystem } from "./helpers/fake-file-system";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

const INVALID_SLASH_NAME = "theta/load/invalid-slash-name";
const CASE_COLLISION = "theta/load/case-collision";
const UNREADABLE_FILE = "theta/load/unreadable";

const THETA_BODY = "mode: prompt\n---\n";
const PACKAGE_PROMPT = (body: string): string =>
  ["---", "mode: prompt", "---", `@\`${body}\``, ""].join("\n");

// --------------------------------------------------------------------------
// Face (1) — the e2e harness: package `Foo.theta` → invalid-slash-name.
// --------------------------------------------------------------------------

interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

// The e2e-s6 harness shape, extended to capture the `theta-system-note`
// channel's `pi.sendMessage` payloads (the e2e-s6 harness stubs it no-op).
function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
    },
    on: (
      event: string,
      handler: (e: unknown, c: ExtensionContext) => unknown,
    ): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (message: {
      customType?: string;
      details?: { diagnostics?: readonly CapturedNote[] };
    }): void => {
      if (message?.customType !== "theta-system-note") return;
      const diagnostics = message.details?.diagnostics;
      if (!Array.isArray(diagnostics)) return;
      for (const d of diagnostics) {
        notes.push({ code: d.code, message: d.message, severity: d.severity });
      }
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: (composePi, composeCtx) =>
      composeExtensionInstance(composePi, composeCtx, {
        fileWatcher: new FakeFileWatcher(),
        clock: new FakeClock(),
      }),
  };
  createThetaExtension(deps)(pi);

  return {
    commands,
    notes,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

describe("b0463 face (1) — package `Foo.theta` invalid slash name (e2e)", () => {
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedAgentDir: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-b0463-"));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedAgentDir = process.env.PI_CODING_AGENT_DIR;
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;
    process.env.PI_CODING_AGENT_DIR = join(workspace, ".pi", "agent");

    const pkgThetas = join(workspace, "node_modules", "pkg-a", "theta");
    mkdirSync(pkgThetas, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-a", "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
      "utf8",
    );
    // `Foo` fails `^[a-z0-9][a-z0-9_-]*$` — the spec's own invalid-stem example.
    writeFileSync(join(pkgThetas, "Foo.theta"), PACKAGE_PROMPT("foo"), "utf8");
    // Control: a valid unopposed package theta must still register.
    writeFileSync(join(pkgThetas, "ok.theta"), PACKAGE_PROMPT("ok"), "utf8");
  });

  afterEach(() => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    if (savedUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = savedUserProfile;
    if (savedAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = savedAgentDir;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("refuses to register `/Foo` and emits an invalid-slash-name error", async () => {
    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // Control: the valid stem registers.
    expect(harness.commands.has("ok")).toBe(true);

    // DISC-3 filename validity: the invalid stem does not register…
    expect(harness.commands.has("Foo")).toBe(false);
    // …and the refusal is diagnosed.
    const invalid = harness.notes.filter((n) => n.code === INVALID_SLASH_NAME);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]!.severity).toBe("error");
  });
});

// --------------------------------------------------------------------------
// Faces (2)/(3) — discoverThetas over a FakeFileSystem, fed the package pair
// through the §Fix's `packageCandidates` input.
// --------------------------------------------------------------------------

const HOME = "/home/theta";
const CWD = "/project";
const PKG_DIR = "/project/node_modules/pkg-a/theta";

interface PackageCandidate {
  readonly path: string;
  readonly stem: string;
  readonly descriptorValue: string;
}

/** Build a `DiscoveryInput` carrying the §Fix's `packageCandidates`. See the
 *  file header for why the cast is what makes faces (2)/(3) RED-for-the-right-
 *  reason on the current tree and GREEN once the fix lands. */
function packageInput(
  fs: FakeFileSystem,
  packageCandidates: readonly PackageCandidate[],
): DiscoveryInput {
  return { fs, settings: {}, packageCandidates } as unknown as DiscoveryInput;
}

function byCode(diagnostics: readonly Diagnostic[], code: string): readonly Diagnostic[] {
  return diagnostics.filter((d) => d.code === code);
}

describe("b0463 face (2) — package case-collision (discoverThetas + FakeFileSystem)", () => {
  it("emits one case-collision warning for a package `Plan.theta` + `plan.theta` pair", async () => {
    // Case-sensitive fake filesystem: the two variants coexist as distinct
    // entries and collide case-insensitively within the one package source.
    const fs = new FakeFileSystem({
      homedir: HOME,
      cwd: CWD,
      files: {
        [`${PKG_DIR}/Plan.theta`]: THETA_BODY,
        [`${PKG_DIR}/plan.theta`]: THETA_BODY,
      },
    });

    const { thetas, diagnostics } = await discoverThetas(
      packageInput(fs, [
        { path: `${PKG_DIR}/Plan.theta`, stem: "Plan", descriptorValue: "pkg-a" },
        { path: `${PKG_DIR}/plan.theta`, stem: "plan", descriptorValue: "pkg-a" },
      ]),
    );

    const hits = byCode(diagnostics, CASE_COLLISION);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    // Both colliding paths are named (DISC-3 "per source" comparison).
    expect(hits[0]!.message).toContain("Plan.theta");
    expect(hits[0]!.message).toContain("plan.theta");

    // §Fix: "one case-collision warning + byte-first winner". The byte-first
    // survivor is `Plan` (P<p), whose stem then fails SLASH_NAME — so NOTHING
    // registers, and the invalid-slash-name names `Plan.theta`, not `plan.theta`.
    // A byte-LAST winner would instead survive as the valid stem `plan` and
    // register `/plan`; these assertions fail in that world.
    expect(thetas.some((t) => t.name === "Plan" || t.name === "plan")).toBe(false);
    const invalid = byCode(diagnostics, INVALID_SLASH_NAME);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]!.file).toContain("Plan.theta");
    expect(invalid[0]!.file).not.toContain("plan.theta");
  });
});

describe("b0463 face (3) — package readability (discoverThetas + FakeFileSystem)", () => {
  it("emits one unreadable warning and does not register an unreadable package theta", async () => {
    // The package candidate's file rejects every read with EACCES.
    const unreadablePath = `${PKG_DIR}/pkgread.theta`;
    const fs = new FakeFileSystem({
      homedir: HOME,
      cwd: CWD,
      errors: { [unreadablePath]: "EACCES" },
    });

    const { thetas, diagnostics } = await discoverThetas(
      packageInput(fs, [
        { path: unreadablePath, stem: "pkgread", descriptorValue: "pkg-a" },
      ]),
    );

    const hits = byCode(diagnostics, UNREADABLE_FILE);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warning");
    expect(hits[0]!.message).toContain("pkgread.theta");
    // DISC-2 rule 1: an unreadable file does not register.
    expect(thetas.some((t) => t.name === "pkgread")).toBe(false);
  });
});
