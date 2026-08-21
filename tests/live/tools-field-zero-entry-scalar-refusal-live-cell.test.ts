// Bug 0206 — standalone live registration cell `` (the 0065/0182/0104
// standalone-live-file precedent; not a numbered live-production-acceptance
// cell).
//
// Additive H8a cell. The fixed surface is theta LOAD and REGISTRATION: a
// `tools:` value that IS an admitted spelling — a quoted or block SCALAR — but
// whose comma split yields ZERO entries must be REFUSED at load under bug
// 0104's registered code `theta/load/malformed-tools-field`, ranged on the
// value node, and the theta must NOT register. At HEAD (pre-fix) it registers
// silently with the empty callable set, byte-identically to a file with no
// `tools:` line at all
// (docs/bugs/0206-zero-entry-tools-scalar-loads-empty-callable-set.md; the
// mechanism is `extractToolsList`'s scalar arm collapsing a zero-length split
// to `undefined` at src/parser/frontmatter.ts:438, which the `tools` arm of the
// key walk at :994–998 cannot distinguish from an absent field).
//
// This cell proves the disposition through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// the existing "discovery → registration" H8a cells and bug 0104's sibling
// cell (`tests/live/tools-field-shape-refusal-live-cell.test.ts`, `CELL-C`)
// use. Registration-only observable: no live model turn is driven, so
// `` spends no tokens beyond `requireLiveProvider`'s credential
// resolution.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off the
// real `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
// step — never a `prompt()` resolution. A theta whose `tools:` scalar declares
// no entry must be ABSENT from the registered set; a sibling theta whose scalar
// declares one entry in the SAME quoted spelling must be PRESENT, which bounds
// the refusal to the zero-entry outcome rather than to quoting.
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` (never loaded as a subagent-mode `tools:` callee) and this
// cell never invokes a command, so no query-time tool-call loop and no RFC-0006
// subagent-child spawn occurs. `tests/live/harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) for the
// cells in this suite that DO reach that launch; importing the harness inherits
// all three, but `` does not exercise that path.
//
// TIER: live is ADDITIVE here, not a substitute. The offline witness
// (`tests/tools-field-zero-entry-scalar-refusal.test.ts`) owns the diagnostic
// count, the exact `SourceRange` and the withheld frontmatter, which no live
// harness can read. What only the live tier shows is that the refusal survives
// the real shipped host's discovery-and-registration wiring rather than only
// the in-test composition helper.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` carrying the given `tools:` line, body names no callable. */
function toolsTheta(toolsLine: string): string {
  return ["---", "mode: prompt", toolsLine, "---", "@`hi`"].join("\n") + "\n";
}

describe("bug 0206 live cell — a zero-entry `tools:` scalar is refused at live production load and un-registers the theta", () => {
  it(": un-registers the empty-quoted-scalar theta while a sibling quoted scalar naming ONE entry registers", async () => {
    // A missing provider/model fails loudly inside `requireLiveProvider`
    // (AGENTS.md §No silent skipping) — never an early return.
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The subject: the quoted-empty spelling of bug 0206 §Reproduction's
      // first row, the realistic generated-frontmatter vector of §Why it
      // matters (a scaffolder emitted `tools: "<substituted>"` and the
      // substitution was empty). Pre-fix this registers with the empty callable
      // set and no diagnostic; post-fix it must be absent from the registered
      // set entirely.
      { source: "project", stem: "cellf2empty", text: toolsTheta('tools: ""') },
      // The control: the SAME quoted spelling naming ONE entry. Must register —
      // bounding the refusal to a split that yields no entry, not to quoting.
      { source: "project", stem: "cellf2scalar", text: toolsTheta('tools: "read"') },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition, asserted FIRST: the control must register before the
      // refusal assertion means anything — otherwise an empty registered set
      // would satisfy it vacuously (no silent skipping).
      expect(
        handle.command("cellf2scalar"),
        "precondition unmet: the quoted one-entry `tools: \"read\"` control " +
          "did not register — discovery or registration regressed independent of " +
          "bug 0206, so the refusal assertion below cannot witness anything. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable, read off the settled `ExtensionRunner`.
      expect(
        handle.command("cellf2empty"),
        ': a `tools: ""` theta registered — the zero-entry refusal ' +
          "(`theta/load/malformed-tools-field`) did not fire and the theta loaded " +
          "with the silently emptied callable set bug 0206 reports, " +
          "indistinguishably from a file with no `tools:` line. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        ": the zero-entry theta's slash name must not appear in the " +
          "registered set.",
      ).not.toContain("cellf2empty");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
