// Bug 0141 — capitalised bare `match` pattern head live cell,
// standalone live registration cell (the reassign-rhs-live-cell / bug 0115
// precedent this file mirrors verbatim in shape: this lane's parent
// renumbers the H8a sequence at merge, so this file carries the literal
// token `` rather than a numeric id from the existing sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// bare capitalised `match` pattern head that heads no admitted pattern
// production must now be REFUSED at parse
// (`theta/parse/capitalised-pattern-head`, Sev E, phase `parse`), and an
// error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts) — where at
// HEAD (before the 0141 fix) `parsePattern`'s tail arm returned
// `{ kind: "identifier", name: t.text }` unconditionally and the theta
// registered silently
// (docs/bugs/0141-capitalised-bare-match-pattern-binds-identifier.md).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same
// harness bug 0115's live cell uses. A registration-only observable: no live
// model turn is driven, so this cell spends no tokens beyond
// `requireLiveProvider`'s credential resolution — registration is decided at
// load, so a turn is neither needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off
// the real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution. A theta whose
// body carries a bare capitalised `match` pattern head (`P => P`) must be
// ABSENT from the registered set; a sibling theta over the SAME `match`
// shape whose pattern head is lowercase (`p => p`) must be PRESENT
// (bounding the refusal to the capitalised head, not to the `match`
// statement's mere presence).
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless
// (inherited by importing it), but this cell does not exercise that path —
// zero model turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"), proved once by hand
// during verification and recorded here rather than re-run automatically:
// with the fixture's pattern head LOWERCASED (`p => p` in place of
// `P => P`), the "must be ABSENT" assertion reds because the refusal
// disappears and the theta registers under the mismatched-case fixture's
// own stem. Restored to the capitalised spelling, the theta is refused and
// the lowercase control still registers.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose body is a `match` arm with the given pattern head. */
function matchTheta(head: string): string {
  return ["---", "mode: prompt", "---", `let v = match 3 { ${head} => 1 }`, "1"].join("\n") + "\n";
}

describe("bug 0141 — a bare capitalised `match` pattern head is refused at live production load and un-registers the theta", () => {
  it("un-registers the capitalised-pattern-head theta while a sibling lowercase-pattern-head theta over the SAME `match` shape registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `match 3 { P => v }` — a bare capitalised pattern
      // head naming no admitted pattern production (no following `(` or `{`),
      // per docs/spec_topics/expressions.md's disambiguation sentence.
      // Pre-fix this registered silently with zero diagnostics (bug 0141
      // §Reproduction row a1, measured); post-fix it must be absent from the
      // registered set entirely.
      {
        source: "project",
        stem: "cellbcapitalised",
        text: matchTheta("P"),
      },
      // The control: the SAME `match` shape, with a LOWERCASE pattern head.
      // Must register — bounding the refusal to the capitalised head, not to
      // the `match` statement's mere presence.
      {
        source: "project",
        stem: "cellblowercase",
        text: matchTheta("p"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal
      // assertion means anything — otherwise an empty registered set would
      // satisfy the refusal vacuously (no silent skipping).
      expect(
        handle.command("cellblowercase"),
        "bug-0141 precondition unmet: the lowercase-pattern-head " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0141, so the refusal assertion below cannot " +
          "witness anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the capitalised-pattern-head sibling must be
      // ABSENT from the registered set — real observable off the settled
      // `ExtensionRunner`, never a `prompt()` resolution (no turn is driven
      // in this cell at all — registration is decided at load).
      expect(
        handle.command("cellbcapitalised"),
        "bug-0141: a theta with a bare capitalised `match` pattern " +
          "head (`P => v`) registered — the pattern-head refusal " +
          "(`theta/parse/capitalised-pattern-head`) did not fire and the " +
          "theta loaded despite the head naming no admitted pattern " +
          "production. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0141: the capitalised-pattern-head theta's slash name " +
          "must not appear in the registered set.",
      ).not.toContain("cellbcapitalised");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
