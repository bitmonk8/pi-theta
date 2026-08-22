// e2e-campaign S5 — package-source discovery THROUGH the composition root.
//
// code-surface.md §summary gap #3: the discovery WALK defers the package source
// (`discoverThetas`, discovery-walk.ts, "not plumbed into this walk yet"); package thetas
// are merged only at the composition root by `discoverPackageThetas`
// (package-discovery.ts) inside `discoverAndComposeFixtures`
// (production-composition.ts:319-334), and only when the derived slash name is
// not already claimed by a higher-priority (CLI/settings/project) or
// lower-priority (global) walk theta. `tests/package-discovery.test.ts` drives
// `discoverPackageThetas` in ISOLATION over a FakeFileSystem — it never exercises
// the composition-root MERGE. This test drives the production compose helper
// (`discoverAndComposeFixtures`) over a real on-disk temp workspace, so the
// two-stage merge is actually observed.
//
// Covers: REQ-DISC-1 (packages are one of the five discovery sources),
// REQ-DISC-25 (a `pi.theta` manifest wins over the `theta/` fallback), and the
// REQ-DISC-6 priority rule that a project theta shadows a same-name package theta
// (the composition-root "register only when the slash name is unclaimed" merge).
//
// Spec: discovery/discovery-sources.md; discovery/package-and-settings.md.
// Method: M2 (production composition root, no live model).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ThetaFixture } from "../src/extension/factory";
import { discoverAndComposeFixtures } from "../src/extension/production-composition";

/** A clean prompt theta that registers with no binder/model precondition. */
const CLEAN_THETA = ["---", "mode: prompt", "tools: read", "---", "@`hi`", ""].join("\n");

function plant(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf8");
}

/**
 * Drive the PRODUCTION COMPOSE HELPER over a real on-disk workspace with an
 * empty model registry (no live model). Returns the registered slash names.
 */
async function runProductionLoad(cwd: string): Promise<readonly string[]> {
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return fixtures.map((f) => f.slashName);
}

let workspaceDir: string;
let registered: readonly string[];

beforeAll(async () => {
  workspaceDir = mkdtempSync(join(tmpdir(), "theta-e2e-s5-pkg-"));
  const nm = join(workspaceDir, "node_modules");

  // Package A — no `pi.theta`: the conventional `theta/` fallback is scanned.
  plant(join(nm, "greeter-e2e-s5", "package.json"), JSON.stringify({ name: "greeter-e2e-s5", version: "1.0.0" }));
  plant(join(nm, "greeter-e2e-s5", "theta", "greet-e2e-s5.theta"), CLEAN_THETA);

  // Package B — `pi.theta` manifest present: the manifest entry registers and
  // the `theta/` fallback is NOT merged (REQ-DISC-25 "the manifest wins").
  plant(
    join(nm, "manifested-e2e-s5", "package.json"),
    JSON.stringify({ name: "manifested-e2e-s5", version: "1.0.0", pi: { theta: ["custom/pick-me-e2e-s5.theta"] } }),
  );
  plant(join(nm, "manifested-e2e-s5", "custom", "pick-me-e2e-s5.theta"), CLEAN_THETA);
  plant(join(nm, "manifested-e2e-s5", "theta", "ignored-e2e-s5.theta"), CLEAN_THETA);

  // Package C + a same-name PROJECT theta — the project copy claims the slash
  // name in the walk, so the composition-root merge does NOT add the package
  // copy (project > packages priority; registered exactly once).
  plant(join(nm, "dupe-e2e-s5", "package.json"), JSON.stringify({ name: "dupe-e2e-s5", version: "1.0.0" }));
  plant(join(nm, "dupe-e2e-s5", "theta", "shadowme-e2e-s5.theta"), CLEAN_THETA);
  plant(join(workspaceDir, ".pi", "theta", "shadowme-e2e-s5.theta"), CLEAN_THETA);

  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  plant(join(workspaceDir, ".pi", "settings.json"), "{}");

  registered = await runProductionLoad(workspaceDir);
}, 60000);

afterAll(() => {
  if (workspaceDir !== undefined) {
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

describe("e2e-s5 gap#3 — package discovery through the composition root", () => {
  it("REQ-DISC-1: a package `theta/` fallback theta is discovered + registered through the composition root", () => {
    expect(
      registered,
      "the package's theta/ fallback theta must register via the composition-root merge. Registered: " +
        JSON.stringify(registered),
    ).toContain("greet-e2e-s5");
  });

  it("REQ-DISC-25: a `pi.theta` manifest wins — the manifest entry registers and the theta/ fallback is not merged", () => {
    expect(registered, "the pi.theta manifest entry must register").toContain("pick-me-e2e-s5");
    expect(
      registered,
      "the theta/ fallback must NOT be merged when a pi.theta manifest is present (manifest wins)",
    ).not.toContain("ignored-e2e-s5");
  });

  it("REQ-DISC-6: a project theta shadows a same-name package theta (composition-root register-only-when-unclaimed merge)", () => {
    const hits = registered.filter((n) => n === "shadowme-e2e-s5");
    expect(
      hits,
      "the same-name theta must register exactly once — the project copy claims the name, the package copy is not merged. Registered: " +
        JSON.stringify(registered),
    ).toHaveLength(1);
  });
});
