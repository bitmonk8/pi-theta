import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeHarness, mintWorkspace, type PackageMergeWorkspace } from "./helpers/package-merge-e2e-harness";

// S6 (PIC / DISC seam at the composition root) — the package-source
// walk-routed adjudication.
//
// code-surface.md §5 / Summary point 3: the composition root runs the bounded
// package scan (`discoverPackageThetas`) first, then hands its candidates INTO
// the discovery walk (`discoverThetas`, `discovery-walk.ts`) as priority-4
// `packageCandidates` — the SAME `resolveBySource` → `validateAndRead` →
// `resolveSlashNames` chain that adjudicates the other four sources decides
// priority order and cross-source-shadow for a package theta too (bugs
// 0458/0462/0463 §Fix). The isolated `discoverPackageThetas` unit tests
// (tests/package-discovery.test.ts) exercise the scan in isolation but NOT
// this walk-routed adjudication. This drives the shipped
// `composeExtensionInstance` over a real temp workspace to pin the merge
// behaviour end-to-end.
//
// Spec: discovery/package-and-settings.md (DISC-5 package source, priority-4);
// registration-steps.md §slash-handler-registration (PIC-31 survivors).
//
// The `os.homedir()` global package roots (`~/.pi/agent/npm|git`) are redirected
// to the empty temp workspace so the walk is deterministic (no real global
// package scan).

const PROJECT_DUP = ["---", "mode: prompt", "---", "@`project`", ""].join("\n");
const PACKAGE_DUP = ["---", "mode: prompt", "---", "@`package`", ""].join("\n");
const PACKAGE_UNIQUE = ["---", "mode: prompt", "---", "@`package`", ""].join(
  "\n",
);

describe("S6 — composition-root package two-stage merge", () => {
  let workspace: string;
  let minted: PackageMergeWorkspace;

  beforeEach(() => {
    minted = mintWorkspace("theta-s6-pkgmerge-");
    workspace = minted.cwd;

    // Project theta (walk-discovered, higher priority) claiming `dup`.
    const thetaDir = join(workspace, ".pi", "theta");
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, "dup.theta"), PROJECT_DUP, "utf8");

    // A project-local node_modules package (priority-4) with a conventional
    // `theta/` dir: a COLLIDING `dup` and a UNIQUE `uniquepkg`.
    const pkgThetas = join(workspace, "node_modules", "pkg-a", "theta");
    mkdirSync(pkgThetas, { recursive: true });
    writeFileSync(
      join(workspace, "node_modules", "pkg-a", "package.json"),
      JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
      "utf8",
    );
    writeFileSync(join(pkgThetas, "dup.theta"), PACKAGE_DUP, "utf8");
    writeFileSync(join(pkgThetas, "uniquepkg.theta"), PACKAGE_UNIQUE, "utf8");
  });

  afterEach(() => {
    minted.dispose();
  });

  it("merges in a uniquely-named package theta (unclaimed) and drops a package theta whose name is already claimed by a walk theta", async () => {
    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // The unique package theta is merged in at the composition root (its slash
    // name is unclaimed by the walk).
    expect(harness.commands.has("uniquepkg")).toBe(true);

    // The colliding name is registered exactly once: the project `dup`
    // out-prioritises the package `dup` inside the walk's own
    // cross-source-shadow resolution (discovery-walk.ts `resolveSlashNames`
    // PRIORITY map — project(3) beats package(4)), so the package copy never
    // enters the composed set and cannot override / duplicate the
    // higher-priority project walk theta.
    expect(harness.commands.has("dup")).toBe(true);
    expect(harness.registrations.filter((n) => n === "dup")).toHaveLength(1);

    // Only the expected commands register (no stray package duplicate). RFC
    // 0010 (EXST-11): `/theta-status` registers once per instance alongside
    // the composed thetas.
    expect(new Set(harness.registrations)).toEqual(
      new Set(["dup", "uniquepkg", "theta-status"]),
    );
  });
});
