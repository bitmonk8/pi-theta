// Bug 0460 — the `.md`-skill arm of the cross-format-collision rule is vacuous
// at the pinned host: the pinned Pi SDK enumerates every skill as
// `skill:<name>` (agent-session.js:1841 maps a skill to
// `` name: `skill:${skill.name}` ``) and dispatches it only as `/skill:<name>`,
// so the byte-exact `piNames.has(stem)` membership test in `resolveSlashNames`
// (src/discovery/discovery-walk.ts) can never match a conforming theta stem —
// no skill ever drops a theta.
// (docs/bugs/0460-skill-arm-of-cross-format-collision-vacuous-at-pinned-host.md).
//
// WHY these cells are GREEN, not RED: 0460 is the parent's Option 1 — a
// SPEC-SIDE retirement of the skill arm as vacuous at the theta 1.0 pin, with
// ZERO behaviour change. There is no code delta to red against; the witness is
// a characterization LOCK on the shipped disposition the spec is being
// rewritten to state, plus the both-directions proof the doc's §Reproduction
// describes:
//   - cell (i) proves the PINNED-HOST prefixed skill (`skill:foo`) does NOT
//     drop a same-stem theta and emits zero diagnostics — the coexistence the
//     spec rewrite states;
//   - cell (ii) is the ARM-3 COUNTERFACTUAL: a BARE-named skill entry
//     (`{ name: "foo", source: "skill" }`) — a shape the pinned host never
//     emits — DOES drop the theta with a collision diagnostic, proving the
//     `"skill"` branch is LIVE code, not dead. The contrast between (i) and
//     (ii) is what makes the arm's future-proofing honest: only the host's
//     `skill:` prefixing makes the arm unreachable at the pin.
//   - cell (iii) is the PROMPT-ARM control — the two live arms are unaffected
//     by 0460, and 0459's corrected message form still holds.
//
// WHY the collision diagnostic is located by MESSAGE FRAGMENT, never by its
// namespaced registry-code literal: the closed-set corpus gate
// (tests/registry-closed-set-corpus-gate.test.ts) treats any code-shaped
// literal under tests/ — comments included — as an assertion, which would
// itself close the gap it guards. Filtering on the message fragment mirrors the
// sibling witnesses tests/b0459-cross-format-collision-message-form.test.ts and
// tests/b0440-cross-source-shadow-descriptor-form.test.ts.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createThetaExtension, type ThetaExtensionDeps } from "../src/extension/factory";
import { composeExtensionInstance } from "../src/extension/production-composition";
import { FakeClock } from "./helpers/fake-clock";
import { FakeFileWatcher } from "./helpers/fake-file-watcher";

// A minimal VALID `mode: prompt` theta: cell (i) needs it to parse and
// register (the collision arm fires on the stem regardless of body validity,
// but coexistence requires a real registration to observe).
const THETA_BODY = "---\nmode: prompt\n---\n\"ok\"\n";

// The message FRAGMENT every cross-format-collision diagnostic carries — located
// by fragment (never by the namespaced registry code) to keep the corpus gate
// intact.
const COLLISION_FRAGMENT = "collides at the same priority";

/** One `pi.getCommands()` entry — the fake's `SlashCommandInfo` shape, extended
 *  (per bug 0024's harness) with the optional host-populated `sourceInfo` whose
 *  `path` the pinned host carries for every prompt template. */
interface FakeCommandInfo {
  readonly name: string;
  readonly source: string;
  readonly sourceInfo?: { readonly path: string; readonly source: string; readonly scope: string; readonly origin: string };
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly notes: string[];
  readonly registeredNames: () => string[];
  fireSessionStart(): Promise<void>;
}

/** Factory + composeExtensionInstance seam over a real mkdtemp workspace,
 *  mirroring b0459 cell 4. `extra` plants the genuine Pi-owned entry under test;
 *  the extension's own registrations come back as `source: "extension"`, exactly
 *  as the host reports them. */
function makeHarness(cwd: string, extra: readonly FakeCommandInfo[]): Harness {
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

  const clock = new FakeClock();
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (pi2, ctx2, ownRegisteredNames) =>
      composeExtensionInstance(
        pi2,
        ctx2,
        { fileWatcher: new FakeFileWatcher(), clock },
        undefined,
        ownRegisteredNames,
      ),
  };
  createThetaExtension(deps)(pi);

  return {
    pi,
    notes,
    registeredNames: () => [...commands.keys()],
    fireSessionStart: () => fire("session_start"),
  };
}

/** The collision notes carrying the fragment. */
function collisionNotes(notes: readonly string[]): string[] {
  return notes.filter((n) => n.includes(COLLISION_FRAGMENT));
}

describe("b0460 — the skill arm is vacuous at the pinned host (spec-side retirement, no behaviour change)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "theta-bug0460-"));
    // Minimal prompt theta at the conventional `<cwd>/.pi/theta/` root — the
    // root segment kept apart from the stem here so the corpus gate's
    // `theta/...` extractor never reads a code assertion from this source.
    mkdirSync(join(workspace, ".pi", "theta"), { recursive: true });
    writeFileSync(join(workspace, ".pi", "theta", "foo.theta"), THETA_BODY, "utf8");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------------
  // Cell (i) — PINNED-HOST SKILL COEXISTS. `skill:foo` is the EXACT shape the
  // pinned host emits for a skill named `foo` (agent-session.js:1841). The
  // byte-exact `piNames.has("foo")` test cannot match `"skill:foo"`, so the
  // theta registers with zero diagnostics beside the same-stem skill.
  //
  // WHY: this locks the disjoint-`skill:`-namespace coexistence the spec
  // rewrite (0460 §Fix Option 1) states — a same-stem theta and a
  // `skill:`-prefixed skill coexist with no collision at the theta 1.0 pin.
  // ------------------------------------------------------------------------
  it("cell (i): a `skill:`-prefixed host skill coexists with a same-stem theta — theta registers, zero diagnostics", async () => {
    const harness = makeHarness(workspace, [{ name: "skill:foo", source: "skill" }]);
    await harness.fireSessionStart();

    expect(harness.registeredNames()).toContain("foo");
    expect(
      collisionNotes(harness.notes),
      `expected zero collision notes; got ${JSON.stringify(collisionNotes(harness.notes))}`,
    ).toHaveLength(0);
  }, 15000);

  // ------------------------------------------------------------------------
  // Cell (ii) — ARM-3 COUNTERFACTUAL. A BARE-named skill entry
  // `{ name: "foo", source: "skill" }` is a shape the pinned host NEVER emits
  // (it always prefixes `skill:`), but the `"skill"` branch fires on it: the
  // theta drops with one collision diagnostic.
  //
  // WHY: this is the both-directions proof and the honesty check on the arm's
  // future-proofing. Contrasted with cell (i), it demonstrates that the
  // `"skill"` branch is LIVE code, not dead — the ONLY thing making it
  // unreachable at the pin is the host's `skill:` prefixing. A future Pi minor
  // that enumerated skills under bare names would silently reactivate this arm
  // and start dropping thetas that today coexist; this counterfactual is what
  // keeps that hazard demonstrated rather than merely asserted, so the spec's
  // "unreachable at the pin" note stays falsifiable.
  // ------------------------------------------------------------------------
  it("cell (ii): a BARE-named skill entry (never emitted by the pinned host) DOES drop the theta — the arm is live code", async () => {
    const harness = makeHarness(workspace, [{ name: "foo", source: "skill" }]);
    await harness.fireSessionStart();

    expect(harness.registeredNames()).not.toContain("foo");
    expect(
      collisionNotes(harness.notes),
      `expected exactly one collision note; got ${JSON.stringify(collisionNotes(harness.notes))}`,
    ).toHaveLength(1);
  }, 15000);

  // ------------------------------------------------------------------------
  // Cell (iii) — PROMPT-ARM CONTROL. The live prompt arm is unaffected by
  // 0460: a same-stem project prompt template still drops the theta, and
  // 0459's corrected message form holds — the `.md` sibling is named,
  // forward-slash spelled, with NO ` (Pi-owned command '<name>' survives)`
  // suffix and no backslash in the rendered paths.
  //
  // WHY: locks that retiring the vacuous skill arm leaves the two live arms
  // (prompt + foreign extension) byte-identical (0460 §Fix "Any fix must keep
  // the two live arms byte-identical").
  // ------------------------------------------------------------------------
  it("cell (iii): the live prompt arm still drops the theta with 0459's forward-slash sibling and no survives-suffix", async () => {
    const mdPath = join(workspace, ".pi", "prompts", "foo.md");
    const forwardMd = mdPath.replace(/\\/g, "/");
    const harness = makeHarness(workspace, [
      {
        name: "foo",
        source: "prompt",
        sourceInfo: { path: mdPath, source: "local", scope: "project", origin: "top-level" },
      },
    ]);
    await harness.fireSessionStart();

    expect(harness.registeredNames()).not.toContain("foo");
    const collision = collisionNotes(harness.notes);
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
