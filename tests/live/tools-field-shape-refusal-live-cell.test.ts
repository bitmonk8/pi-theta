// Bug 0104 — standalone live registration cell (the 0065/0182
// standalone-live-file precedent; not a numbered live-production-acceptance
// cell).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `tools:` field whose value is a YAML mapping (neither of the two admitted
// spellings — a plain scalar or a sequence) must be REFUSED at load, ranged,
// under `theta/load/malformed-tools-field`, and the theta must NOT register —
// where at HEAD (pre-fix) it registered silently with the empty callable set,
// byte-identical to the absent field
// (docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same
// harness the existing "discovery → registration" H8a-T cells use.
// A registration-only observable: no live model turn is driven,
// so this cell spends no tokens beyond `requireLiveProvider`'s credential
// resolution (mirrors the existing zero-token discovery→registration cells
// in `tests/live/live-production-acceptance.test.ts`, whose file header notes
// "the two discovery→registration tests boot and register only, spending
// none").
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off
// the real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution. A theta whose
// `tools:` is a mapping must be ABSENT from the registered set; a sibling
// theta carrying the SAME entry (`read`) in an admitted spelling (a plain
// scalar) must be PRESENT.
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` (never loaded as a subagent-mode `tools:` callee), and this
// cell never invokes a command, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `tests/live/harness.ts` already
// carries the `#subagent-child-pins` module-scope setters
// (`process.argv[1]`, `PI_THETA_SUBAGENT_EXTENSION_PIN`,
// `PI_THETA_SUBAGENT_PARENT_PID`) for cells in this suite that DO reach that
// launch; importing the harness inherits them, but this cell does not
// exercise that path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose `tools:` field is the given lines, body names no callable. */
function toolsTheta(toolsLines: readonly string[]): string {
  return ["---", "mode: prompt", ...toolsLines, "---", "@`hi`"].join("\n") + "\n";
}

describe("bug 0104 live cell — a mapping-valued `tools:` field is refused at live production load, ranged, and un-registers the theta", () => {
  it("un-registers the flow-mapping `tools:` theta while a sibling admitted-spelling theta over the SAME entry registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: a flow mapping over the same tool name as the
      // sibling control below. Pre-fix this registered silently with the
      // empty callable set (measured in the bug doc's §Reproduction); post-fix
      // it must be absent from the registered set entirely.
      { source: "project", stem: "cellcmapping", text: toolsTheta(["tools: {read: bash}"]) },
      // The control: the SAME entry (`read`), in the admitted plain-scalar
      // spelling. Must register — bounding the refusal to the node KIND, not
      // to the entry the mapping happens to spell.
      { source: "project", stem: "cellcscalar", text: toolsTheta(["tools: read"]) },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal
      // assertion means anything — otherwise an empty registered set would
      // satisfy the refusal vacuously (no silent skipping).
      expect(
        handle.command("cellcscalar"),
        "bug-0104 live cell precondition unmet: the plain-scalar `tools: read` control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0104, so the refusal assertion below cannot witness anything. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the mapping-valued sibling must be ABSENT from
      // the registered set — real observable off the settled `ExtensionRunner`,
      // never a `prompt()` resolution (no turn is driven in this cell at all).
      expect(
        handle.command("cellcmapping"),
        "bug-0104 live cell: a `tools: {read: bash}` theta registered — the field-shape " +
          "refusal (`theta/load/malformed-tools-field`) did not fire and the " +
          "theta loaded with the silently emptied callable set bug 0104 " +
          "reports. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0104 live cell: the mapping-valued theta's slash name must not appear in the " +
          "registered set.",
      ).not.toContain("cellcmapping");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
