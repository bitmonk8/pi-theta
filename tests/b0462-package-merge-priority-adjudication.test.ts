// Bug 0462 — the composition-root package merge (`runComposePass`,
// src/extension/production-composition.ts) substitutes a first-wins name-claim
// (`!claimed.has(pkg.name)`) for the five-tier adjudication, so three DISC
// rules go silently unenforced for the package source
// (docs/bugs/0462-package-merge-bypasses-priority-adjudication.md):
//
//  (i)  A global (priority-5) theta blocks a same-named package (priority-4)
//       theta — a priority INVERSION: DISC (discovery-sources.md §priority list)
//       fixes the package copy as the winner, and the merge registers the
//       global copy with no diagnostic.
//  (ii) No package-involved shadow ever emits the cross-source-shadow warning,
//       even where the winner is correct (project beats package).
//  (iii) Two packages shipping one stem register the enumeration-first copy
//       where DISC-4 (discovery-sources.md §DISC-4 worked example) mandates
//       every colliding theta drop with one cross-format-collision error.
//
// RED at the current tree for the right reason: (i) the GLOBAL copy registers
// and no shadow note fires; (ii) no shadow note fires; (iii) the pkg-a copy
// registers and no collision note fires — package candidates never reach
// `resolveSlashNames` (discovery-walk.ts). GREEN once §Fix routes package
// candidates through the walk.
//
// The cross-source-shadow diagnostic is a closed-set carve-out
// (tests/registry-closed-set-corpus-gate.test.ts): its registry-code literal
// MUST NOT appear under tests/ or the gate's carve-out empties. It is therefore
// located by MESSAGE FRAGMENT here (mirroring
// tests/b0440-cross-source-shadow-descriptor-form.test.ts). The
// cross-format-collision code is NOT a carve-out and is located by its literal.

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
// The shadow diagnostic's message fragment — never its registry code literal
// (closed-set carve-out; see the header).
const SHADOW_FRAGMENT = "shadowed across discovery sources";

function promptTheta(description: string, body: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", `@\`${body}\``, ""].join(
    "\n",
  );
}

/** Write a package's `package.json` + one theta under `<workspace>/node_modules/<pkg>/theta/`. */
function plantPackageTheta(
  workspace: string,
  pkg: string,
  stem: string,
  contents: string,
): void {
  const dir = join(workspace, "node_modules", pkg, "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(workspace, "node_modules", pkg, "package.json"),
    JSON.stringify({ name: pkg, version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(join(dir, `${stem}.theta`), contents, "utf8");
}

describe("b0462 — composition-root package merge vs five-tier adjudication", () => {
  let workspace: string;
  let disposeWorkspace: () => void;

  beforeEach(() => {
    const ws = mintWorkspace("theta-b0462-");
    workspace = ws.cwd;
    disposeWorkspace = ws.dispose;
  });

  afterEach(() => {
    disposeWorkspace();
  });

  it("(i) a package theta wins over a same-named global theta and emits a cross-source-shadow note", async () => {
    // Global (priority-5) copy under <agentDir>/theta and package (priority-4)
    // copy under node_modules — discriminated by `description:` frontmatter.
    const globalTheta = join(workspace, ".pi", "agent", "theta");
    mkdirSync(globalTheta, { recursive: true });
    writeFileSync(
      join(globalTheta, "gp.theta"),
      promptTheta("global-copy", "gp"),
      "utf8",
    );
    plantPackageTheta(workspace, "pkg-a", "gp", promptTheta("pkg-a-gp", "gp"));

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    expect(harness.commands.has("gp")).toBe(true);
    // The higher-priority package copy must win — the registered body is the
    // package theta, not the stale global one.
    expect(harness.commands.get("gp")?.description).toBe("pkg-a-gp");
    // …and the tier resolution is diagnosed, naming the package descriptor.
    const shadows = byFragment(harness.notes, SHADOW_FRAGMENT).filter((n) =>
      n.message.includes('package:"pkg-a"'),
    );
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.severity).toBe("warning");
  });

  it("(ii) a project theta shadows a same-named package theta with a cross-source-shadow note", async () => {
    // Project (priority-3) copy claims the name; the package (priority-4) copy
    // shadows. The winner is already correct today — the mandated warning is not.
    const projectTheta = join(workspace, ".pi", "theta");
    mkdirSync(projectTheta, { recursive: true });
    writeFileSync(
      join(projectTheta, "dup.theta"),
      promptTheta("project-dup", "dup"),
      "utf8",
    );
    plantPackageTheta(workspace, "pkg-a", "dup", promptTheta("pkg-a-dup", "dup"));

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    expect(harness.commands.get("dup")?.description).toBe("project-dup");
    const shadows = byFragment(harness.notes, SHADOW_FRAGMENT).filter((n) =>
      n.message.includes('package:"pkg-a"'),
    );
    expect(shadows).toHaveLength(1);
    expect(shadows[0]!.severity).toBe("warning");
  });

  it("(iii) two packages shipping one stem both drop with a single cross-format-collision error", async () => {
    plantPackageTheta(workspace, "pkg-a", "lint", promptTheta("pkg-a-lint", "lint"));
    plantPackageTheta(workspace, "pkg-b", "lint", promptTheta("pkg-b-lint", "lint"));

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // DISC-4 worked example: every colliding theta drops; none register.
    expect(harness.commands.has("lint")).toBe(false);
    // One error listing both package paths.
    const collisions = byCode(harness.notes, CROSS_FORMAT_COLLISION).filter(
      (n) => n.message.includes("pkg-a") && n.message.includes("pkg-b"),
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.severity).toBe("error");
  });

  it("control — a healthy unopposed package theta still registers", async () => {
    plantPackageTheta(workspace, "pkg-a", "solo", promptTheta("pkg-a-solo", "solo"));

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    expect(harness.commands.has("solo")).toBe(true);
    expect(harness.commands.get("solo")?.description).toBe("pkg-a-solo");
  });
});
