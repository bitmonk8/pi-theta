// Bug 0488 — spawn-site integration witness: the REAL launch entry
// (`launchSubagentChild`, src/runtime/subagent-launcher.ts) threads a driven
// body's synthesised respond-tool names onto the ACTUAL spawned child argv, so
// the ≥0.86 strict `--tools` allowlist no longer suppresses the mid-session
// `__theta_respond_<slug>` registration (docs/bugs/0488-…​.md §Fix;
// .pi/tmp/fixes/0488-design.md §3 emit site :537-540).
//
// TIER — offline spawn-site integration, NOT a real child spawn (the design
// doc's permitted fallback). A real pi child fixes its argv at spawn time,
// BEFORE any provider contact, and cannot echo its own argv back to the parent,
// so a real spawn adds no argv-CONTENT signal over recording the spawn here;
// bug 0488 is purely about the `--tools` value. This drives the same production
// launch path exercised by tests/subagent-child-real-spawn.test.ts
// (`launchSubagentChild`: executable resolution → `assembleSubagentArgv` →
// spawn) but over a recording `SpawnFn` (tests/helpers/fake-json-child.ts), so
// it is provider-free and runs under the DEFAULT suite. The production PRODUCER
// half (`collectLaunchRespondNames`, design §Seams 4) — which enumerates a
// driven body's typed queries into these names — is a separate NEW seam whose
// own enumeration witness (tests/b0488-launch-respond-enumeration.test.ts)
// exercises `collectLaunchRespondNames` directly; this file witnesses only the
// launcher emit (the name already computed, threaded onto the spawned argv).
//
// RED PRE-FIX: `assembleSubagentArgv` ignores `respondToolNames`, so the recorded
// child argv's `--tools` value omits the minted respond name — exactly bug 0488's
// symptom on the wire (no model-facing respond declaration). At the type level
// the `respondToolNames` field also reds `npm run typecheck` (the seam is absent).

import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { launchSubagentChild } from "../src/runtime/subagent-launcher";
import { fakeSubagentLaunchRequest, makeFakeJsonChildLauncher } from "./helpers/fake-json-child";

/** The canonical-form respond-tool name for `@<"low" | "high">` (bug 0488 cell 4; bug 0099). */
const RESPOND_LOW_HIGH = "__theta_respond_1aae0990d53b3485";

describe("bug 0488 — launchSubagentChild threads respond names onto the spawned child argv", () => {
  it("a subagent-mode child with host tools read,grep,bash + one typed query → the spawned --tools carries the respond name once", () => {
    const launcher = makeFakeJsonChildLauncher();
    const emitted: Diagnostic[] = [];

    const base = fakeSubagentLaunchRequest();
    const result = launchSubagentChild(
      {
        ...base,
        argv: {
          ...base.argv,
          hostTools: ["read", "grep", "bash"],
          noHostTools: false,
          // NEW seam (design §Seams 3): the synthesised respond names for the
          // typed queries in the body this launch will drive.
          respondToolNames: [RESPOND_LOW_HIGH],
        },
      },
      {
        spawn: launcher.spawn,
        emitDiagnostic: (d): void => {
          emitted.push(d);
        },
      },
    );

    expect(result.ok, `launch failed: ${JSON.stringify(emitted)}`).toBe(true);
    expect(launcher.spawns).toHaveLength(1);
    const args = launcher.spawns[0]!.args;

    const i = args.indexOf("--tools");
    expect(i, "the spawned child must carry a --tools allowlist").toBeGreaterThanOrEqual(0);
    const tools = args[i + 1]!.split(",");
    expect(tools).toEqual(expect.arrayContaining(["read", "grep", "bash"]));
    // bug 0488: pre-fix this name never reaches the child, so its mid-session
    // respond-tool registration is filtered out and the model cannot bind.
    expect(
      tools.filter((t) => t === RESPOND_LOW_HIGH),
      `the minted respond name must ride the spawned --tools exactly once; observed ${JSON.stringify(tools)}`,
    ).toHaveLength(1);
    expect(args, "respond names ride --tools, never re-enable defaults via omission").not.toContain(
      "--no-tools",
    );
  });
});
