// Bug 0459 — both mint arms of the cross-format-collision diagnostic in
// `resolveSlashNames` (src/discovery/discovery-walk.ts) diverge from the pinned
// `<paths>` rendering, and the Pi-owned arm diverges further with an
// off-template ` (Pi-owned command '<name>' survives)` suffix that also omits
// the colliding `.md` sibling from `<paths>`
// (docs/bugs/0459-cross-format-collision-message-suffix-sibling-order-and-spelling.md).
//
// The rendering is normative:
//   - the registry Message template is `slash name '<name>' collides at the
//     same priority: <paths>` — NO suffix
//     (docs/spec_topics/diagnostics/code-registry-load.md:50), made
//     character-for-character normative by DIAG-4
//     (docs/spec_topics/diagnostics/diagnostic-shape.md:74);
//   - `<paths>` ordering is "registered candidates first, then the
//     slash-name-deriving `.md` siblings, both internally ordered by
//     discovery-source priority then by absolute path", forward-slash spelled
//     (docs/spec_topics/diagnostics/placeholder-rendering-b.md:57).
//
// WHY the diagnostic is located by MESSAGE FRAGMENT, never by its namespaced
// registry-code literal: the closed-set corpus gate
// (tests/registry-closed-set-corpus-gate.test.ts) treats any code-shaped
// literal under tests/ — comments included — as an assertion. Filtering on the
// message fragment mirrors the sibling witness
// tests/b0440-cross-source-shadow-descriptor-form.test.ts.
//
// RED against the current tree for the right reason (bytes captured at v0.437.0):
//   - Cell 1 reds because the same-format arm renders CLI candidates in
//     insertion order (`/opt/zz…, /opt/aa…`) where §7 pins priority-then-
//     absolute-path (`/opt/aa…, /opt/zz…`).
//   - Cell 2 reds because the Pi-owned arm appends the ` (Pi-owned command
//     'plan' survives)` suffix and never renders the colliding `.md` sibling.
//   - Cell 3 reds for the same suffix; its expected form pins the path-less
//     foreign `extension`-source fallback tail (the command name).
//   - Cell 4 reds because `readPiOwnedCommands`
//     (src/extension/production-composition.ts) discards `sourceInfo`, so the
//     `.md` sibling never renders, the suffix is present, and the theta path
//     interpolates in the mixed Win32-root-plus-POSIX-tail spelling.
// GREEN once the recommended §Fix (Option 1) sorts each `<paths>` segment by
// PRIORITY[source] then normalised absolute path, appends the Pi-owned
// entry's `sourceInfo.path` (or the command name for a path-less foreign
// entry) as the `.md`-sibling tail, drops the suffix, and forward-slashes.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { discoverThetas, type DiscoveryInput, type PiOwnedCommand } from "../src/discovery/discovery-walk";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";
import { FakeFileSystem } from "./helpers/fake-file-system";

const HOME = "/home/theta";
const CWD = "/project";
const THETA_BODY = "mode: prompt\n---\n";

// The message FRAGMENT every arm's diagnostic carries — located by fragment
// (never by the namespaced registry code) to keep the corpus gate intact.
const COLLISION_FRAGMENT = "collides at the same priority";

// --------------------------------------------------------------------------
// FakeFileSystem scaffolding (mirrors b0440's helpers).
// --------------------------------------------------------------------------

/** Proper-ancestor directories of `leaf` as empty dirs, so a clean-leaf ENOENT
 *  walk finds every ancestor enterable. The leaf itself is NOT registered. */
function ancestors(leaf: string): Record<string, string[]> {
  const segs = leaf.split("/").filter((s) => s.length > 0);
  const out: Record<string, string[]> = { "/": [] };
  let parent = "/";
  for (let i = 0; i < segs.length - 1; i++) {
    const path = parent === "/" ? `/${segs[i]}` : `${parent}/${segs[i]}`;
    out[path] = [];
    parent = path;
  }
  return out;
}

/** Merge several dirs maps, concatenating entry lists for shared keys. */
function mergeDirs(
  ...maps: Record<string, readonly string[]>[]
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      out[k] = [...(out[k] ?? []), ...v];
    }
  }
  return out;
}

/** A FakeFileSystem holding one `plan.theta` under each of `dirs`. */
function fsWithPlanIn(dirs: readonly string[]): FakeFileSystem {
  let mergedDirs: Record<string, readonly string[]> = {};
  const files: Record<string, string> = {};
  for (const dir of dirs) {
    const leaf = `${dir}/plan.theta`;
    mergedDirs = mergeDirs(mergedDirs, ancestors(leaf), { [dir]: ["plan.theta"] });
    files[leaf] = THETA_BODY;
  }
  return new FakeFileSystem({ homedir: HOME, cwd: CWD, dirs: mergedDirs, files });
}

/** The single diagnostic carrying the collision fragment, or a loud failure
 *  naming the unmet precondition — never a silent skip (AGENTS.md). */
function soleCollision(diagnostics: readonly Diagnostic[]): Diagnostic {
  const hits = diagnostics.filter((d) => d.message.includes(COLLISION_FRAGMENT));
  expect(
    hits,
    `expected exactly one diagnostic containing '${COLLISION_FRAGMENT}'; got ${hits.length}: ${JSON.stringify(hits.map((d) => d.message))}`,
  ).toHaveLength(1);
  return hits[0]!;
}

// --------------------------------------------------------------------------
// Cell 1 — same-format arm ORDER. Two CLI directory sources (both priority 1)
// each ship `plan.theta`; the same-priority theta-vs-theta arm fires. §7 pins
// priority-then-absolute-path, which for this single-tier group reduces to
// absolute-path order — `aa` before `zz`, independent of the flag order.
//
// CURRENT (wrong) bytes, cliPaths ["/opt/zz","/opt/aa"]:
//   slash name 'plan' collides at the same priority: /opt/zz/plan.theta, /opt/aa/plan.theta
// (insertion order — `zz` before `aa`.)
// --------------------------------------------------------------------------

describe("b0459 cell 1 — same-format arm renders <paths> priority-then-absolute-path, not insertion order", () => {
  const EXPECTED =
    "slash name 'plan' collides at the same priority: /opt/aa/plan.theta, /opt/zz/plan.theta";

  it("orders aa before zz when the flag order is zz,aa", async () => {
    const fs = fsWithPlanIn(["/opt/zz", "/opt/aa"]);
    const { diagnostics, thetas } = await discoverThetas({
      fs,
      settings: {},
      cliPaths: ["/opt/zz", "/opt/aa"],
    });
    expect(soleCollision(diagnostics).message).toBe(EXPECTED);
    // Outcome unchanged: both same-tier copies drop.
    expect(thetas.map((t) => t.name)).not.toContain("plan");
  });

  it("renders the SAME bytes when the flag order is swapped to aa,zz (order-independence)", async () => {
    const fs = fsWithPlanIn(["/opt/aa", "/opt/zz"]);
    const { diagnostics } = await discoverThetas({
      fs,
      settings: {},
      cliPaths: ["/opt/aa", "/opt/zz"],
    });
    expect(soleCollision(diagnostics).message).toBe(EXPECTED);
  });
});

// --------------------------------------------------------------------------
// Cell 2 — Pi-owned arm: the theta candidate first, then the colliding `.md`
// sibling as a tail (from the Pi-owned entry's `sourceInfo.path`), NO suffix.
//
// WHY the `as` cast: `DiscoveryInput.piOwnedNames` is `readonly
// PiOwnedCommand[]`, and `PiOwnedCommand` does not carry a `path` field YET.
// Phase 2 (the §Fix) adds `path?: string` to `PiOwnedCommand` and
// `readPiOwnedCommands` populates it from `command.sourceInfo?.path`; the cast
// is removed then. It is widened here only so this RED run EXECUTES and reds on
// the ASSERTION (expected vs actual bytes), not on a type error.
//
// CURRENT (wrong) bytes, piOwnedNames [{name:"plan",source:"prompt",path:"…"}]:
//   slash name 'plan' collides at the same priority: /opt/zz/plan.theta (Pi-owned command 'plan' survives)
// (suffix present; the `.md` sibling path absent.)
// --------------------------------------------------------------------------

interface PiOwnedWithPath extends PiOwnedCommand {
  readonly path: string;
}

describe("b0459 cell 2 — Pi-owned arm tails the colliding .md sibling and drops the survives-suffix", () => {
  it("renders the theta candidate then the .md sibling, no suffix", async () => {
    const fs = fsWithPlanIn(["/opt/zz"]);
    const piOwned: readonly PiOwnedWithPath[] = [
      { name: "plan", source: "prompt", path: "/project/.pi/prompts/plan.md" },
    ];
    const input: DiscoveryInput = {
      fs,
      settings: {},
      cliPaths: ["/opt/zz"],
      piOwnedNames: piOwned as readonly PiOwnedCommand[],
    };
    const { diagnostics, thetas } = await discoverThetas(input);
    expect(soleCollision(diagnostics).message).toBe(
      "slash name 'plan' collides at the same priority: /opt/zz/plan.theta, /project/.pi/prompts/plan.md",
    );
    // Outcome unchanged: the theta drops, the Pi-owned entry survives.
    expect(thetas.map((t) => t.name)).not.toContain("plan");
  });
});

// --------------------------------------------------------------------------
// Cell 3 — path-less foreign `extension`-source fallback. The §7 pin speaks of
// `.md` siblings; a foreign extension command carries no host-populated
// `sourceInfo.path`, so its sibling tail falls back to the command name.
//
// CURRENT (wrong) bytes, piOwnedNames [{name:"plan",source:"extension"}]:
//   slash name 'plan' collides at the same priority: /opt/zz/plan.theta (Pi-owned command 'plan' survives)
// (suffix present; no fallback tail.)
// --------------------------------------------------------------------------

describe("b0459 cell 3 — path-less extension-source sibling renders the command name as fallback tail", () => {
  it("tails the command name for a foreign extension entry, no suffix", async () => {
    const fs = fsWithPlanIn(["/opt/zz"]);
    const input: DiscoveryInput = {
      fs,
      settings: {},
      cliPaths: ["/opt/zz"],
      piOwnedNames: [{ name: "plan", source: "extension" }],
    };
    const { diagnostics } = await discoverThetas(input);
    expect(soleCollision(diagnostics).message).toBe(
      "slash name 'plan' collides at the same priority: /opt/zz/plan.theta, plan",
    );
  });
});

// --------------------------------------------------------------------------
// Cell 4 — production seam (factory + composeExtensionInstance over a real
// mkdtemp workspace, Windows-spelling face). A project theta named
// `promptdup2.theta` under the conventional `<cwd>/.pi/theta/` root (the root
// segment kept apart from the stem here so the corpus gate's `theta/...`
// extractor does not read this comment as a code assertion) collides with a
// project prompt template whose host `SlashCommandInfo` carries
// `sourceInfo.path` at the sibling `<cwd>/.pi/prompts/promptdup2.md`. This
// witnesses `readPiOwnedCommands` reading
// `sourceInfo.path` AND the forward-slash spelling fix at one seam.
//
// CURRENT (wrong) note (Windows; `<code>:` is the namespaced registry code,
// omitted here as a literal so the closed-set corpus gate's `theta/...`
// extractor does not read this comment as an assertion — rule mirrored from
// b0440):
//   <code>: slash name 'promptdup2' collides at the same priority: C:\Users\…\.pi\theta\promptdup2.theta (Pi-owned command 'promptdup2' survives)
// (theta path mixed Win32-root+POSIX-tail spelling; no `.md` sibling; suffix present.)
// --------------------------------------------------------------------------

/** One `pi.getCommands()` entry — the fake's `SlashCommandInfo` shape, extended
 *  (per bug 0024's harness) with the optional host-populated `sourceInfo` whose
 *  `path` the pinned host carries for every prompt template. */
interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo?: { readonly path: string; readonly source: string; readonly scope: string; readonly origin: string };
}

interface Cell4Harness {
  readonly pi: ExtensionAPI;
  readonly notes: string[];
  fireSessionStart(): Promise<void>;
}

function makeCell4Harness(cwd: string, extra: readonly FakeCommandInfo[]): Cell4Harness {
  const commands = new Map<string, unknown>();
  const notes: string[] = [];
  const subscriptions = new Map<string, ((e: unknown, c: ExtensionContext) => unknown)[]>();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    // Faithful to the host: an extension's own registrations come back as
    // `source: "extension"`; `extra` plants the genuine Pi-owned prompt entry.
    getCommands: (): readonly FakeCommandInfo[] => [
      ...[...commands.keys()].map((name) => ({ name, source: "extension" })),
      ...extra,
    ],
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;

  const fire = async (event: string): Promise<void> => {
    for (const handler of subscriptions.get(event) ?? []) {
      await handler({ type: event }, ctx);
    }
  };

  return { pi, notes, fireSessionStart: () => fire("session_start") };
}

describe("b0459 cell 4 — production seam renders the forward-slash .md sibling and drops the suffix", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0459-"));
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", "promptdup2.theta"), THETA_BODY, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("the collision note names the .md sibling forward-slashed with no survives-suffix", async () => {
    const mdPath = join(workspace, ".pi", "prompts", "promptdup2.md");
    const forwardMd = mdPath.replace(/\\/g, "/");
    const harness = makeCell4Harness(workspace, [
      {
        name: "promptdup2",
        source: "prompt",
        sourceInfo: { path: mdPath, source: "local", scope: "project", origin: "top-level" },
      },
    ]);

    const clock = new FakeClock();
    const deps: ThetaExtensionDeps = {
      fixtures: [],
      composeInstance: async (pi, ctx, ownRegisteredNames) =>
        composeExtensionInstance(
          pi,
          ctx,
          { fileWatcher: new FakeFileWatcher(), clock },
          undefined,
          ownRegisteredNames,
        ),
    };
    createThetaExtension(deps)(harness.pi);

    await harness.fireSessionStart();

    const collision = harness.notes.filter((n) => n.includes(COLLISION_FRAGMENT));
    expect(
      collision,
      `expected exactly one collision note; got ${JSON.stringify(collision)}`,
    ).toHaveLength(1);
    const note = collision[0]!;
    // (a) the `.md` sibling is named, forward-slash spelled.
    expect(note).toContain(forwardMd);
    // (b) no off-template survives-suffix.
    expect(note).not.toContain("survives)");
    // (c) forward-slash spelling: no backslash anywhere in the rendered paths.
    expect(note).not.toMatch(/\\/);
  }, 15000);
});
