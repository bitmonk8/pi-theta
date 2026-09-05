// Bug 0458 — a package theta whose slash name a Pi-owned `.md` prompt template
// owns bypasses the DISC-4 rule-2 Pi-owned collision guard entirely: the
// composition-root merge (`runComposePass`, src/extension/production-composition.ts)
// admits the package theta on a bare `!claimed.has(pkg.name)` test, never
// consulting `piOwnedNames`, so the theta registers with zero diagnostics and
// (because the pinned host dispatches extension commands before template
// expansion) silently preempts the user's `/promptdup` template
// (docs/bugs/0458-package-theta-bypasses-pi-owned-collision-guard.md).
//
// DISC-4 rule 2 (docs/spec_topics/discovery/discovery-sources.md §DISC-4):
// when a `.theta` collides with a Pi-owned prompt/skill/extension entry only
// the colliding theta drops (with `theta/load/cross-format-collision`) and the
// Pi-owned entry stays registered — "the theta never preempts a non-theta
// registration". The rule is stated over candidate thetas generally, and
// packages are one of the five sources. Its re-evaluation clause requires the
// next `session_start` cycle to re-drop a package theta that a template owns.
//
// RED at the current tree for the right reason: the package theta REGISTERS and
// NO `theta/load/cross-format-collision` note is emitted, because package
// candidates never enter `resolveSlashNames`' Pi-owned guard
// (discovery-walk.ts). GREEN once §Fix routes package candidates through the
// walk: `promptdup` drops with the cross-format-collision note and the second
// pass drops it again.
//
// The guard's diagnostic code is NOT a closed-set carve-out
// (tests/registry-closed-set-corpus-gate.test.ts), so it is located by its
// registry code literal here — the house style of tests/discovery-walk.test.ts.

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
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

const CROSS_FORMAT_COLLISION = "theta/load/cross-format-collision";

const PACKAGE_PROMPTDUP = ["---", "mode: prompt", "---", "@`promptdup`", ""].join(
  "\n",
);
// The control: a package theta whose name NO Pi-owned entry claims — it must
// still register (the healthy unopposed-package direction the merge keeps).
const PACKAGE_SOLO = ["---", "mode: prompt", "---", "@`solo`", ""].join("\n");

interface CapturedNote {
  readonly code: string;
  readonly message: string;
  readonly severity: string;
}

interface Harness {
  readonly commands: Map<string, { description?: string }>;
  readonly registrations: string[];
  readonly notes: CapturedNote[];
  fireSessionStart(): Promise<void>;
}

/**
 * The e2e-s6 harness shape (factory + `composeExtensionInstance` over a real
 * temp workspace), extended to (a) seed Pi-OWNED commands the way the pinned
 * host reports a `.pi/prompts/<name>.md` template — `pi.getCommands()` returns
 * `{ name, source: "prompt" }` — and (b) capture the `theta-system-note`
 * channel's `pi.sendMessage` payloads so the load diagnostics are observable
 * (the e2e-s6 harness stubs `sendMessage` as a no-op, capturing nothing).
 */
function makeHarness(
  cwd: string,
  ownedCommands: readonly { name: string; source: string }[],
): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
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
      registrations.push(name);
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
    // The seeded Pi-owned entries plus this instance's own registered commands
    // (reported as `source: "extension"`, as the host does). `readPiOwnedCommands`
    // reads this at discovery time to build `piOwnedNames`.
    getCommands: (): { name: string; source: string }[] => [
      ...ownedCommands,
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
    ],
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
    registrations,
    notes,
    fireSessionStart: async () => {
      for (const handler of subscriptions.get("session_start") ?? []) {
        await handler({ type: "session_start" }, ctx);
      }
    },
  };
}

function byCode(notes: readonly CapturedNote[], code: string): CapturedNote[] {
  return notes.filter((n) => n.code === code);
}

describe("b0458 — package theta vs Pi-owned prompt template", () => {
  let workspace: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedAgentDir: string | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-b0458-"));
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedAgentDir = process.env.PI_CODING_AGENT_DIR;
    // Redirect the home + global-agent roots into the empty workspace so the
    // walk is deterministic (no real ~/.pi/agent or global-package scan).
    process.env.HOME = workspace;
    process.env.USERPROFILE = workspace;
    process.env.PI_CODING_AGENT_DIR = join(workspace, ".pi", "agent");

    // A project-local node_modules package (priority-4) shipping a theta whose
    // slash name `promptdup` a Pi-owned prompt template owns, plus an
    // unopposed `solo` control theta.
    const pkgThetas = join(workspace, "node_modules", "pkg-a", "theta");
    mkdirSync(pkgThetas, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-a", "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
      "utf8",
    );
    writeFileSync(join(pkgThetas, "promptdup.theta"), PACKAGE_PROMPTDUP, "utf8");
    writeFileSync(join(pkgThetas, "solo.theta"), PACKAGE_SOLO, "utf8");
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

  it("drops a package theta whose slash name a Pi-owned prompt template owns, with a cross-format-collision note", async () => {
    const harness = makeHarness(workspace, [
      { name: "promptdup", source: "prompt" },
    ]);
    await harness.fireSessionStart();

    // Control: the unopposed package theta registers (the merge's healthy
    // direction is preserved by the fix).
    expect(harness.commands.has("solo")).toBe(true);

    // DISC-4 rule 2: the colliding package theta drops — `/promptdup` stays the
    // user's Pi-owned template, not the package theta.
    expect(harness.commands.has("promptdup")).toBe(false);

    // …and the drop is diagnosed, naming the theta and the surviving Pi-owned
    // entry.
    const collisions = byCode(harness.notes, CROSS_FORMAT_COLLISION).filter((n) =>
      n.message.includes("promptdup"),
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.severity).toBe("error");
  });

  it("re-drops a previously-registered package theta once a template appears (DISC-4 re-evaluation clause)", async () => {
    // The TRUE re-evaluation clause: a template appearing AFTER a theta is
    // already registered. Pass 1 has NO owned `promptdup`, so the package theta
    // REGISTERS (reported thereafter as `source:"extension"`). A Pi-owned
    // `prompt` template then appears; pass 2 must re-drop the theta with one
    // cross-format-collision note.
    //
    // This exercises the PIC-69 interplay: on pass 2 `getCommands()` reports
    // BOTH the instance's own pass-1 registration (`source:"extension"`, which
    // the own-registration ledger excludes) AND the new `source:"prompt"`
    // entry (which stays in the collision set) — so the package theta drops
    // against the template, not against its own prior registration.
    const owned: { name: string; source: string }[] = [];
    const harness = makeHarness(workspace, owned);
    await harness.fireSessionStart();

    // Pass 1: unopposed — the package theta registers.
    expect(harness.commands.has("promptdup")).toBe(true);
    const notesAfterFirst = harness.notes.length;
    const regsAfterFirst = harness.registrations.length;

    // A Pi-owned prompt template now claims `promptdup`, after registration.
    owned.push({ name: "promptdup", source: "prompt" });
    await harness.fireSessionStart();
    const secondPassNotes = harness.notes.slice(notesAfterFirst);
    const secondPassRegs = harness.registrations.slice(regsAfterFirst);

    // Pass 2 re-drops the theta: it is NOT re-owned (no re-registration of
    // `promptdup` this pass — Pi exposes no `unregisterCommand`, so a drop is
    // observed as the absence of a re-own plus the collision note, not as a
    // vanished command entry).
    expect(secondPassRegs).not.toContain("promptdup");
    const secondCollisions = byCode(secondPassNotes, CROSS_FORMAT_COLLISION).filter(
      (n) => n.message.includes("promptdup"),
    );
    expect(secondCollisions).toHaveLength(1);
  });
});
