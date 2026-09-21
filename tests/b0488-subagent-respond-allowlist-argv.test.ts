// Bug 0488 — the subagent child's `--tools` allowlist suppresses the typed-query
// respond tool on pi ≥ 0.86. THIS FILE IS THE AUTHORITATIVE ARGV-COMPOSITION
// WITNESS (docs/bugs/0488-…​.md §"Witness guidance"; .pi/tmp/fixes/0488-design.md
// §"Cases (argv witnesses)").
//
// The settled fix (design doc §3) appends the statically-derived synthesised
// respond-tool names (`__theta_respond_<slug>`) for a driven body's typed
// queries to the child's `--tools` allowlist at launch assembly, dialect-gated
// to the PI dialect (OMP validates the allowlist and exits-2 on a name unknown
// at startup — bug 0218 — so respond names are NOT carried on OMP).
//
// SEAMS UNDER TEST (design doc §"Seams"):
//   - src/runtime/subagent-launcher.ts SubagentArgvInput gains
//     `readonly respondToolNames: readonly string[]` (input at :353,
//     hostTools contract at :377-393, noHostTools at :394).
//   - HostCliDialect (:277) gains `readonly toleratesUnregisteredToolNames`
//     (PI :289 true, OMP :309 false) — targeted here via OBSERVABLE gating
//     behaviour, not by reading the boolean.
//   - the emit-site flip/gate (:537-540) — today's arm is
//     `if (input.noHostTools) argv.push("--no-tools"); else argv.push("--tools", input.hostTools.join(","))`.
//
// RED PRE-FIX: `assembleSubagentArgv` (src/runtime/subagent-launcher.ts:453)
// today ignores `respondToolNames`, so cells (1) and (2) below red — the minted
// respond name is ABSENT from the child `--tools` allowlist, exactly bug 0488's
// symptom ("no model-facing declaration"). At the type level the object literal
// also reds `npm run typecheck` naming the missing `respondToolNames` field —
// the seam the fix adds is absent (the correct-reason red). Cells (3)/(4)/(5)
// are CONTROLS that must stay green in BOTH directions (the fix must not move
// the no-typed / OMP-gated paths).

import { describe, expect, it } from "vitest";
import {
  PI_CLI_DIALECT,
  OMP_CLI_DIALECT,
  assembleSubagentArgv,
  type SubagentArgvInput,
} from "../src/runtime/subagent-launcher";

/** The canonical-form respond-tool name for `@<"low" | "high">` (bug 0488 cell 4; bug 0099). */
const RESPOND_LOW_HIGH = "__theta_respond_1aae0990d53b3485";
/** A second, distinct respond name (any 16-hex slug) — for the dedup / multi cases. */
const RESPOND_OTHER = "__theta_respond_c40f310ae8897f46";

/** The `--tools` csv value as an ordered list, or `undefined` when `--tools` is absent. */
function toolsList(argv: readonly string[]): readonly string[] | undefined {
  const i = argv.indexOf("--tools");
  if (i === -1) return undefined;
  return argv[i + 1]!.split(",");
}

/** A today-shaped `SubagentArgvInput`, overridable per field. `respondToolNames` is the NEW seam. */
function argvInput(overrides: Partial<SubagentArgvInput>): SubagentArgvInput {
  return {
    slug: "code-review",
    thetaDirs: ["/w/.pi/theta"],
    systemPrompt: "you are a subagent",
    hostTools: [],
    noHostTools: true,
    respondToolNames: [],
    provider: "anthropic",
    model: "claude-sonnet",
    projectTrust: false,
    ...overrides,
  };
}

describe("bug 0488 — respond-tool names ride the child --tools allowlist (PI dialect)", () => {
  it("(1) host tools + typed queries → --tools carries each host name AND the respond name exactly once; no --no-tools", () => {
    const argv = assembleSubagentArgv(
      argvInput({
        hostTools: ["read", "grep", "bash"],
        noHostTools: false,
        respondToolNames: [RESPOND_LOW_HIGH],
      }),
      PI_CLI_DIALECT,
    );
    const tools = toolsList(argv);
    expect(tools, "the child must launch with a --tools allowlist").toBeDefined();
    // bug 0488 symptom: pre-fix the respond name is absent — the mid-session
    // registration is then suppressed by the strict ≥0.86 allowlist and the
    // model can never call __theta_respond_<slug>.
    expect(tools).toContain("read");
    expect(tools).toContain("grep");
    expect(tools).toContain("bash");
    expect(
      tools!.filter((t) => t === RESPOND_LOW_HIGH),
      `the minted respond name must appear exactly once in the allowlist; observed ${JSON.stringify(tools)}`,
    ).toHaveLength(1);
    expect(argv).not.toContain("--no-tools");
  });

  it("(2) NO host tools + typed queries → --tools <respond only> (the noHostTools arm flips), NOT --no-tools", () => {
    const argv = assembleSubagentArgv(
      argvInput({
        hostTools: [],
        noHostTools: true,
        respondToolNames: [RESPOND_LOW_HIGH],
      }),
      PI_CLI_DIALECT,
    );
    // design doc §3 clause: noHostTools flips to --tools ONLY when respond names exist.
    expect(argv).not.toContain("--no-tools");
    expect(toolsList(argv)).toEqual([RESPOND_LOW_HIGH]);
  });

  it("(3) CONTROL: no host tools + no typed queries → --no-tools, no --tools (unchanged)", () => {
    const argv = assembleSubagentArgv(
      argvInput({ hostTools: [], noHostTools: true, respondToolNames: [] }),
      PI_CLI_DIALECT,
    );
    expect(argv).toContain("--no-tools");
    expect(argv).not.toContain("--tools");
  });

  it("(4) CONTROL: host tools + no typed queries → --tools value equals the host set, no respond name", () => {
    const argv = assembleSubagentArgv(
      argvInput({ hostTools: ["read"], noHostTools: false, respondToolNames: [] }),
      PI_CLI_DIALECT,
    );
    // Byte-identical to a today-shaped call: exactly `--tools read`, and no
    // synthesised name leaks in when the driven body has no typed query.
    expect(toolsList(argv)).toEqual(["read"]);
    expect(argv.join(" ")).not.toContain("__theta_respond_");
    expect(argv).not.toContain("--no-tools");
  });

  it("(5) CONTROL: OMP dialect gates respond names OUT (bug 0218 — the host exits-2 on an unknown allowlist name)", () => {
    // host tools present: OMP argv must be byte-identical to an OMP call WITHOUT
    // respond names — `--tools read` only.
    const withRespond = assembleSubagentArgv(
      argvInput({ hostTools: ["read"], noHostTools: false, respondToolNames: [RESPOND_LOW_HIGH] }),
      OMP_CLI_DIALECT,
    );
    const withoutRespond = assembleSubagentArgv(
      argvInput({ hostTools: ["read"], noHostTools: false, respondToolNames: [] }),
      OMP_CLI_DIALECT,
    );
    expect(toolsList(withRespond)).toEqual(["read"]);
    expect(withRespond.join(" ")).not.toContain("__theta_respond_");
    expect(withRespond).toEqual(withoutRespond);

    // no host tools + typed query on OMP: still --no-tools (gated, unchanged).
    const noHost = assembleSubagentArgv(
      argvInput({ hostTools: [], noHostTools: true, respondToolNames: [RESPOND_LOW_HIGH] }),
      OMP_CLI_DIALECT,
    );
    expect(noHost).toContain("--no-tools");
    expect(noHost).not.toContain("--tools");
  });

  it("dedup: a duplicate respond name and one equal to a host tool each appear exactly once", () => {
    const argv = assembleSubagentArgv(
      argvInput({
        hostTools: ["read", RESPOND_OTHER],
        noHostTools: false,
        respondToolNames: [RESPOND_LOW_HIGH, RESPOND_LOW_HIGH, RESPOND_OTHER],
      }),
      PI_CLI_DIALECT,
    );
    const tools = toolsList(argv);
    expect(tools, "the child must launch with a --tools allowlist").toBeDefined();
    expect(tools!.filter((t) => t === RESPOND_LOW_HIGH)).toHaveLength(1);
    expect(
      tools!.filter((t) => t === RESPOND_OTHER),
      "a respond name equal to a host-tool entry is deduped (dedupePreservingFirst)",
    ).toHaveLength(1);
    expect(tools).toContain("read");
  });
});
