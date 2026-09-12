// Bug 0462 (F1) — package-identity dedup inside the package walker.
//
// package-and-settings.md:30: "A package present in both a project root and a
// global root is deduplicated by package identity (npm package name / git URL
// without ref / resolved absolute path). The project copy wins and the global
// copy contributes nothing; this is package-level dedup, not a
// cross-source-shadow event." discovery-sources.md:89: "The same dedup
// applies … inside the package walker."
//
// Routing package candidates through the walk's five-tier adjudication (the
// 0458/0462/0463 fix) removed the composition root's own slash-name merge loop.
// Without an identity dedup INSIDE `discoverPackageThetas`, the SAME package
// present in a project root and a global root enters the walk as TWO tier-4
// `package`-source candidates with the same stem; `resolveSlashNames` then sees
// a same-priority theta-vs-theta collision and drops BOTH with
// `theta/load/cross-format-collision` — a regression against the dedup DISC
// pins as conformant (0458 §Non-goals, 0462 §Fix).
//
// This witness reds without the F1 dedup (both `lint` copies drop with one
// cross-format-collision error; `lint` never registers) and greens with it (the
// project copy registers alone, no shadow and no collision note). Face (iii) of
// b0462-package-merge-priority-adjudication.test.ts guards the opposite
// direction: two DIFFERENT packages sharing a stem have DIFFERENT identities,
// survive this dedup, and correctly drop-all.
//
// The cross-source-shadow diagnostic is a closed-set carve-out
// (tests/registry-closed-set-corpus-gate.test.ts): located by MESSAGE FRAGMENT,
// never its registry-code literal. The cross-format-collision code is not a
// carve-out and is located by its literal.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  byCode,
  byFragment,
  makeHarness,
  mintWorkspace,
} from "./helpers/package-merge-e2e-harness";

const CROSS_FORMAT_COLLISION = "theta/load/cross-format-collision";
const SHADOW_FRAGMENT = "shadowed across discovery sources";

function promptTheta(description: string, body: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", `@\`${body}\``, ""].join(
    "\n",
  );
}

/** Write a package's `package.json` + one theta under `<root>/<pkg>/theta/`. */
function plantPackageThetaAt(
  packageRoot: string,
  pkg: string,
  stem: string,
  contents: string,
): void {
  const dir = join(packageRoot, pkg, "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(packageRoot, pkg, "package.json"),
    JSON.stringify({ name: pkg, version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(join(dir, `${stem}.theta`), contents, "utf8");
}

describe("b0462 (F1) — package-identity dedup inside the package walker", () => {
  let workspace: string;
  let disposeWorkspace: () => void;

  beforeEach(() => {
    const ws = mintWorkspace("theta-b0462-dedup-");
    workspace = ws.cwd;
    disposeWorkspace = ws.dispose;
  });

  afterEach(() => {
    disposeWorkspace();
  });

  it("registers the project copy exactly once, with no collision and no shadow note", async () => {
    // The SAME package `pkg-a` in a PROJECT root (node_modules, enumerated
    // first) and a GLOBAL root (<agentDir>/npm), both shipping `lint.theta`,
    // discriminated by `description:` frontmatter.
    plantPackageThetaAt(
      join(workspace, "node_modules"),
      "pkg-a",
      "lint",
      promptTheta("project-copy-lint", "lint"),
    );
    plantPackageThetaAt(
      join(workspace, ".pi", "agent", "npm"),
      "pkg-a",
      "lint",
      promptTheta("global-copy-lint", "lint"),
    );

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // The project copy wins (enumerated first); it registers exactly once.
    expect(harness.commands.has("lint")).toBe(true);
    expect(harness.commands.get("lint")?.description).toBe("project-copy-lint");

    // Package-level dedup is NOT a cross-source-shadow event…
    expect(byFragment(harness.notes, SHADOW_FRAGMENT)).toHaveLength(0);
    // …and the two copies must NOT reach the walk as two colliding tier-4
    // candidates (which would drop both with a cross-format-collision).
    expect(byCode(harness.notes, CROSS_FORMAT_COLLISION)).toHaveLength(0);
  });
});
