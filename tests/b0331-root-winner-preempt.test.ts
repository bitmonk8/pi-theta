// Bug 0331 — marshalling every parent discovery root into one child `--theta`
// flag flattens the parent's five-tier source-priority structure to a single
// CLI tier (tier 1). A slug legally shadowed in the parent (settings copy wins
// over project copy, warning only) re-collides in the child at the SAME
// priority, both copies drop, and the marked root never registers — the
// subagent form of a parent-runnable theta refuses on every launch
// (docs/bugs/0331-theta-root-marshalling-flattens-source-priority.md).
//
// The settled fix (.pi/tmp/fixes/0331-report.md): the parent marshals the
// MARKED ROOT's winning source path on a new authenticated control-plane env
// var `PI_THETA_SUBAGENT_ROOT_WINNER` (beside 0328's callable-hash carriage);
// the child's load pass, under the regime marker + authenticated parent-pid
// gate, pre-empts collision/shadow FOR THE MARKED-ROOT SLUG ALONE — the
// parent-named winning path registers, its siblings for that slug drop, and NO
// cross-format-collision / cross-source-shadow diagnostic fires for it. Plus an
// identity-dedup: within a name group, candidates whose separator-normalized
// path is identical collapse to ONE candidate (one physical file = one
// candidate), killing the spurious self-shadow warning; genuinely-distinct
// files keep their real warnings.
//
// WHY the env var is referenced by its STRING LITERAL and not an imported
// constant: `PI_THETA_SUBAGENT_ROOT_WINNER` does not yet exist in `src/` (the
// implementer adds it in the paired fix). Referencing the literal keeps this
// file compiling against the current tree so it reds on the REAL symptom (the
// child collision / marked-root refusal), not on a TypeScript import error.
// Pre-fix, planting the var is inert — the child ignores it and collides (RED);
// post-fix, the child honours it and registers the parent's winner (GREEN).
//
// Harness mirrors tests/subagent-child-hash-refusal-e2e.test.ts (the
// setEnv/savedEnv control-plane save-restore, the regime marker +
// parent-pid authentication, `discoverAndComposeFixtures` driving the REAL
// child load pass, registered slugs via `fixtures.map(f => f.slashName)`) and
// tests/subagent-theta-roots-forwarding.test.ts case (D) (a
// `pi.getFlag('theta')` returning the marshalled roots joined with
// `path.delimiter`, cwd a scratch workspace).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";
import { SUBAGENT_PARENT_PID_ENV } from "../src/runtime/subagent-launcher";
import { SUBAGENT_ROOT_ENV_MARKER } from "../src/runtime/subagent-root-regime";

// The not-yet-existent control-plane carrier, referenced by literal so the file
// compiles against the current tree (see header). The implementer's Phase-2
// constant must equal this string.
const ROOT_WINNER_ENV = "PI_THETA_SUBAGENT_ROOT_WINNER";

// The diagnostic MESSAGE fragments the fix's disposition turns on
// (src/discovery/discovery-walk.ts): the same-priority theta-vs-theta drop and
// the cross-source shadow. Asserting the message text (not the registry code)
// mirrors what `ctx.ui.notify` / the headless stderr mirror actually carry.
const COLLISION_FRAGMENT = "collides at the same priority";
const SHADOW_FRAGMENT = "shadowed across discovery sources";

interface LoadOutcome {
  readonly registered: readonly string[];
  readonly descriptionOf: (slug: string) => string | undefined;
  /** Error-severity load diagnostics (routed to `ctx.ui.notify`). */
  readonly notifications: readonly string[];
  /** The headless stderr mirror — the only surface a WARNING (cross-source-shadow) reaches. */
  readonly stderr: string;
}

let workspaceDir: string;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(key: string, value: string): void {
  if (!(key in savedEnv)) {
    // Save the ORIGINAL (pre-test) value once so a second set for the same key
    // (e.g. the malformed-carrier loop) cannot overwrite it with a planted one.
    savedEnv[key] = process.env[key];
  }
  process.env[key] = value;
}

/** Forward-slash-normalized carrier value, matching the fix's marshalling. */
function fwd(path: string): string {
  return path.replace(/\\/g, "/");
}

/** A registrable prompt-mode theta whose `description:` frontmatter surfaces as
 *  `ThetaFixture.description` — the compose-level observable that tells the
 *  registered copies apart (PROJ COPY / ALT COPY / OTHER). */
function theta(description: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", "@`hi`", ""].join("\n");
}

function plant(relPath: string, content: string): void {
  const abs = join(workspaceDir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, "utf8");
}

/** The doc's §Reproduction layout: a project copy (tier 3) shadowed by a
 *  settings copy (tier 2), plus the arming sibling that keeps the project dir in
 *  `activeRoots`. */
function plantReproLayout(): void {
  plant(join(".pi", "theta", "zqx-review.theta"), theta("PROJ COPY"));
  plant(join(".pi", "theta", "zqx-other.theta"), theta("OTHER"));
  plant(join("alt", "zqx-review.theta"), theta("ALT COPY"));
  plant(join(".pi", "settings.json"), JSON.stringify({ thetaPaths: ["../alt"] }));
}

/** The exact marshalled `--theta` value the parent derives for the repro
 *  layout: the dirnames of the two discovered thetas ({.pi/theta, alt}), joined
 *  with the OS path-list separator (bug 0008's single-flag carriage). */
function marshalledReproRoots(): string {
  return [join(workspaceDir, ".pi", "theta"), join(workspaceDir, "alt")].join(delimiter);
}

/** The parent's winning source path for the marked root `zqx-review`: the
 *  settings-tier (tier 2) ALT COPY that beats the project-tier (tier 3) copy. */
function reproWinnerPath(): string {
  return fwd(join(workspaceDir, "alt", "zqx-review.theta"));
}

/**
 * Drive the REAL child load pass. `thetaFlag` is what `pi.getFlag('theta')`
 * returns (the marshalled `--theta` value, or `undefined` for a parent pass).
 * `hasUI: false` routes cross-source-shadow WARNINGS to the headless stderr
 * mirror (the only surface they reach — `makeLoadEmit` toasts errors only),
 * captured under a scoped spy for hermeticity.
 */
async function runLoad(
  cwd: string,
  thetaFlag: string | undefined,
  piOwnedCommands: readonly { name: string; source: string }[] = [],
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const stderrChunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? thetaFlag : undefined),
    getCommands: (): readonly unknown[] => piOwnedCommands,
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    registerCommand: (): void => {},
    registerMessageRenderer: (): void => {},
    registerFlag: (): void => {},
    on: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [],
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      stderrChunks.push(String(chunk));
      return true;
    });
  try {
    const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
    return {
      registered: fixtures.map((f) => f.slashName),
      descriptionOf: (slug: string): string | undefined =>
        fixtures.find((f) => f.slashName === slug)?.description,
      notifications,
      stderr: stderrChunks.join(""),
    };
  } finally {
    stderrSpy.mockRestore();
  }
}

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-b0331-"));
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
    delete savedEnv[key];
  }
  rmSync(workspaceDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Baseline — the parent's configuration is LEGAL and working (the premise the
// child-side refusal contradicts). GREEN invariant.
// ---------------------------------------------------------------------------

describe("b0331 baseline — the parent-shadowed configuration is legal", () => {
  it("parent pass registers zqx-review (ALT COPY wins, settings tier 2 beats project tier 3) + zqx-other, one shadow warning, NO collision", async () => {
    plantReproLayout();

    // Parent pass: no regime env, no `--theta` — discovery over the project
    // (.pi/theta) and settings (alt) sources only.
    const out = await runLoad(workspaceDir, undefined);

    expect(out.registered).toContain("zqx-review");
    expect(out.registered).toContain("zqx-other");
    // The higher-priority source wins (discovery-sources.md §Source priority):
    // the settings-tier ALT COPY, not the project-tier PROJ COPY.
    expect(out.descriptionOf("zqx-review")).toBe("ALT COPY");
    // Cross-tier shadow is a WARNING (the configuration is legal); no collision.
    expect(out.stderr).toContain(`zqx-review' ${SHADOW_FRAGMENT}`);
    expect(out.notifications.join("\n")).not.toContain(COLLISION_FRAGMENT);
  });
});

// ---------------------------------------------------------------------------
// (A) + (B) — THE DOC'S REGRESSION CELL. Child pass with regime + auth +
// marshalled roots + winner carrier: the marked root registers the PARENT'S
// winner, and the OTHER slug is unaffected. RED pre-fix.
// ---------------------------------------------------------------------------

describe("b0331 (A/B) — child registers the parent's marked-root winner instead of re-colliding it", () => {
  it("the marked slug registers the winner (ALT COPY) with NO cross-format-collision, and the arming sibling still registers", async () => {
    plantReproLayout();
    // Authenticated control plane (subagent.md #subagent-control-plane-
    // authentication): the parent-pid carriage IS this process's real parent, so
    // the regime marker and the winner carrier are honoured, exactly as a real
    // launcher writes them.
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    setEnv(ROOT_WINNER_ENV, reproWinnerPath());

    const out = await runLoad(workspaceDir, marshalledReproRoots());

    // (B) the double-root collision does not disturb the OTHER slug.
    expect(out.registered).toContain("zqx-other");
    // (A) the marked root registers the parent's winner.
    // RED pre-fix: both marshalled CLI-tier copies collide and zqx-review drops.
    expect(
      out.registered,
      "bug 0331: the marked root re-collided in the child and never registered",
    ).toContain("zqx-review");
    // RED pre-fix: descriptionOf is undefined (nothing registered).
    expect(out.descriptionOf("zqx-review")).toBe("ALT COPY");
    // RED pre-fix: the spurious same-priority collision names '/zqx-review'.
    expect(
      out.notifications.join("\n"),
      "bug 0331: a cross-format-collision the parent's configuration never had",
    ).not.toContain(`zqx-review' ${COLLISION_FRAGMENT}`);
  });
});

// ---------------------------------------------------------------------------
// Pi-owned-first ordering — the marked-root pre-emption is adjudicated AFTER
// the theta-vs-Pi-owned guard (discovery-walk.ts `resolveSlashNames`), so a
// theta never pre-empts a name a Pi-owned command already holds, even under
// the regime + a valid winner carrier for that exact slug
// (discovery-sources.md#disc-4). RED-capable: moving the pre-emption ahead of
// the Pi-owned guard would register the theta over the Pi-owned name and flip
// both assertions below.
// ---------------------------------------------------------------------------

describe("b0331 — the Pi-owned guard is adjudicated before the marked-root pre-emption", () => {
  it("a Pi-owned command at the marked slug wins over the theta even with a valid winner carrier", async () => {
    plantReproLayout();
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    setEnv(ROOT_WINNER_ENV, reproWinnerPath());

    const out = await runLoad(workspaceDir, marshalledReproRoots(), [
      { name: "zqx-review", source: "prompt" },
    ]);

    // The theta drops; the Pi-owned entry (not a fixture) is what survives.
    expect(
      out.registered,
      "the marked-root pre-emption must not override a Pi-owned collision at the same slug",
    ).not.toContain("zqx-review");
    expect(out.notifications.join("\n")).toContain(
      `zqx-review' ${COLLISION_FRAGMENT}`,
    );
    expect(out.notifications.join("\n")).toContain("(Pi-owned command 'zqx-review'");
  });
});

// ---------------------------------------------------------------------------
// (C) — skew fence. Regime + auth + roots but NO winner carrier planted (an
// old parent) → today's collide-and-drop behaviour byte-identical. The fix must
// not disturb the absent-carrier path. GREEN both pre- and post-fix.
// ---------------------------------------------------------------------------

describe("b0331 (C) — absent winner carrier: child behaviour is unchanged (skew fence)", () => {
  it("without the carrier the marked slug still collides and drops, collision fires", async () => {
    plantReproLayout();
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    // No ROOT_WINNER_ENV planted.

    const out = await runLoad(workspaceDir, marshalledReproRoots());

    expect(out.registered).not.toContain("zqx-review");
    expect(out.notifications.join("\n")).toContain(`zqx-review' ${COLLISION_FRAGMENT}`);
    expect(out.registered).toContain("zqx-other");
  });
});

// ---------------------------------------------------------------------------
// (D) — pre-emption is MARKED-ROOT-SCOPED. A genuine same-tier collision among
// OTHER slugs keeps today's within-tier drop even under the regime and a winner
// carrier for a DIFFERENT slug. GREEN both.
// ---------------------------------------------------------------------------

describe("b0331 (D) — a winner carrier rescues only its own slug, never a different slug's collision", () => {
  it("the carrier registers mrk-root but does NOT rescue zzz-dup's genuine two-distinct-files collision", async () => {
    plant(join(".pi", "theta", "mrk-root.theta"), theta("MARKED ROOT"));
    plant(join("dirA", "zzz-dup.theta"), theta("DUP A"));
    plant(join("dirB", "zzz-dup.theta"), theta("DUP B"));
    plant(join(".pi", "settings.json"), "{}");

    const flag = [
      join(workspaceDir, "dirA"),
      join(workspaceDir, "dirB"),
      join(workspaceDir, ".pi", "theta"),
    ].join(delimiter);
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "mrk-root");
    setEnv(ROOT_WINNER_ENV, fwd(join(workspaceDir, ".pi", "theta", "mrk-root.theta")));

    const out = await runLoad(workspaceDir, flag);

    // The carrier's own marked slug registers.
    expect(out.registered).toContain("mrk-root");
    // A DIFFERENT slug's two genuinely-distinct same-tier copies still both
    // drop — the pre-emption is scoped to `markedRoot.slug`, and identity-dedup
    // does not collapse distinct files. GREEN pre- and post-fix.
    expect(out.registered).not.toContain("zzz-dup");
    expect(out.notifications.join("\n")).toContain(`zzz-dup' ${COLLISION_FRAGMENT}`);
  });
});

// ---------------------------------------------------------------------------
// (E) — identity-dedup. One physical file reached via two discovery sources
// (the marshalled CLI root overlapping the child's own project source) is ONE
// candidate, not a self-shadow. The dedup must not over-collapse
// genuinely-distinct files.
// ---------------------------------------------------------------------------

describe("b0331 (E) — one physical file reached via two sources is one candidate", () => {
  it("no self-shadow warning when the CLI root overlaps the project source for the SAME file", async () => {
    plant(join(".pi", "theta", "zqx-other.theta"), theta("OTHER"));
    plant(join(".pi", "settings.json"), "{}");
    // The marshalled CLI root IS the child's own project source dir: zqx-other
    // is reached via CLI (tier 1) AND project (tier 3) — the same physical file.
    // Identity-dedup is regime-independent (a physical file is one candidate
    // everywhere), so no regime env is needed to witness it.
    const flag = join(workspaceDir, ".pi", "theta");

    const out = await runLoad(workspaceDir, flag);

    expect(out.registered).toContain("zqx-other");
    // RED pre-fix: the spurious per-launch self-shadow warning for the same
    // file under two separator spellings (the doc's incidental observation).
    expect(
      out.stderr,
      "bug 0331: a self-shadow warning for one physical file reached via two sources",
    ).not.toContain(`zqx-other' ${SHADOW_FRAGMENT}`);
  });

  it("genuinely-distinct files at the same stem across two sources KEEP their real shadow warning (dedup must not over-collapse)", async () => {
    plant(join(".pi", "theta", "zqx-dist.theta"), theta("PROJECT DIST"));
    plant(join("alt", "zqx-dist.theta"), theta("CLI DIST"));
    plant(join(".pi", "settings.json"), "{}");
    // CLI(alt) tier 1 vs project(.pi/theta) tier 3 — two DISTINCT files.
    const flag = join(workspaceDir, "alt");

    const out = await runLoad(workspaceDir, flag);

    expect(out.registered).toContain("zqx-dist");
    // GREEN both: distinct paths are not collapsed; the cross-tier shadow stays.
    expect(out.stderr).toContain(`zqx-dist' ${SHADOW_FRAGMENT}`);
  });
});

// ---------------------------------------------------------------------------
// (H) — the pre-emption suppresses the cross-source-SHADOW arm (distinct from
// (A)'s same-tier COLLISION and from (E)'s identity-dedup of one physical file).
// The marked slug wins at a HIGHER tier (CLI, marshalled) over a genuinely-
// DISTINCT same-slug file at a LOWER tier reached by the child (its own project
// source) — two different physical files, so identity-dedup does NOT collapse
// them and, absent the pre-emption, the tier adjudication names the marked slug
// shadowed across sources. Under regime + auth + winner carrier the winner
// registers ALONE with no shadow diagnostic. GREEN only because the
// pre-emption's `continue` skips the shadow arm.
// ---------------------------------------------------------------------------

describe("b0331 (H) — the winner carrier suppresses the marked slug's cross-source-shadow", () => {
  it("the marked slug registers the higher-tier winner with NO shadow warning over its distinct lower-tier sibling", async () => {
    // Winner at CLI tier (marshalled `alt`); a DISTINCT copy at the child's own
    // project source (.pi/theta). Different physical files — identity-dedup
    // keeps both — so absent the pre-emption the cross-tier shadow fires for
    // `wnr-root`.
    plant(join("alt", "wnr-root.theta"), theta("CLI COPY"));
    plant(join(".pi", "theta", "wnr-root.theta"), theta("PROJ COPY"));
    plant(join(".pi", "settings.json"), "{}");

    const flag = join(workspaceDir, "alt");
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "wnr-root");
    setEnv(ROOT_WINNER_ENV, fwd(join(workspaceDir, "alt", "wnr-root.theta")));

    const out = await runLoad(workspaceDir, flag);

    // The parent-named CLI-tier winner registers.
    expect(out.registered).toContain("wnr-root");
    expect(out.descriptionOf("wnr-root")).toBe("CLI COPY");
    // GREEN only because the pre-emption's `continue` suppresses the shadow arm:
    // absent it, the tier adjudication would name `wnr-root` shadowed over its
    // distinct project-tier sibling.
    expect(
      out.stderr,
      "bug 0331: the pre-emption must suppress the marked slug's cross-source-shadow",
    ).not.toContain(`wnr-root' ${SHADOW_FRAGMENT}`);
  });
});

// ---------------------------------------------------------------------------
// (F) — the winner carrier is AUTHENTICATED control-plane data: honoured only
// under the regime marker + the CORRECT parent pid. Mirrors the e2e refusal
// test's "UNAUTHENTICATED planted map is ignored" cell shape.
// ---------------------------------------------------------------------------

describe("b0331 (F) — the winner carrier is honoured only through the authenticated control plane", () => {
  it("(F1) authenticated (correct parent pid, regime on): the pre-emption registers the marked root", async () => {
    plantReproLayout();
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid)); // correct
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    setEnv(ROOT_WINNER_ENV, reproWinnerPath());

    const out = await runLoad(workspaceDir, marshalledReproRoots());

    // RED pre-fix / GREEN post-fix.
    expect(out.registered).toContain("zqx-review");
  });

  it("(F2) a WRONG parent pid drops the whole control plane: the carrier is ignored, the child collides as today", async () => {
    plantReproLayout();
    // A file written ahead of time cannot state this process's per-run ppid, so
    // a mismatched carriage authenticates nothing: `readParentEnv` drops every
    // control-plane var (the regime marker AND the winner), the regime goes
    // inactive, the pre-emption cannot fire, and the child collides as today.
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid + 1)); // WRONG
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    setEnv(ROOT_WINNER_ENV, reproWinnerPath());

    const out = await runLoad(workspaceDir, marshalledReproRoots());

    // GREEN pre- and post-fix.
    expect(out.registered).not.toContain("zqx-review");
    expect(out.notifications.join("\n")).toContain(`zqx-review' ${COLLISION_FRAGMENT}`);
  });
});

// ---------------------------------------------------------------------------
// (G) — trust boundary. A hostile / malformed carrier value under the
// authenticated regime must fall back SAFELY to today's behaviour and never
// crash the compose pass. GREEN both.
// ---------------------------------------------------------------------------

describe("b0331 (G) — a hostile or malformed winner carrier falls back safely without throwing", () => {
  it("empty / whitespace / non-existent / weird-char carrier values collide as today and never crash the pass", async () => {
    plantReproLayout();
    const flag = marshalledReproRoots();
    setEnv(SUBAGENT_PARENT_PID_ENV, String(process.ppid));
    setEnv(SUBAGENT_ROOT_ENV_MARKER, "zqx-review");
    setEnv(ROOT_WINNER_ENV, ""); // records the pre-test value once

    const hostileValues = [
      "",
      "   ",
      fwd(join(workspaceDir, "nope", "zqx-review.theta")), // names no candidate
      "??::weird*<>|value",
    ];
    for (const bad of hostileValues) {
      process.env[ROOT_WINNER_ENV] = bad;

      // The trust-boundary guarantee: the pass completes (returns fixtures)
      // rather than throwing a parse/crash out of load.
      const out = await runLoad(workspaceDir, flag);

      // None of these names the winner, so the fix falls back to today's
      // collide-and-drop — a real observable, not a vacuous resolve.
      expect(out.registered, `hostile carrier '${bad}' must fall back`).not.toContain(
        "zqx-review",
      );
      expect(out.notifications.join("\n")).toContain(`zqx-review' ${COLLISION_FRAGMENT}`);
    }
  });
});
