// Bug 0115 — reassign-rhs live cell, standalone live registration cell (the 0104 / 0065 /
// 0182 standalone-live-file precedent; not a numbered live-production-
// acceptance cell — this lane's parent renumbers the H8a sequence at merge,
// so this file carries the literal token `reassign-rhs live cell` rather than a numeric id
// from the existing 66-cell sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// type-incompatible `let mut` reassignment RHS must now be REFUSED at parse
// (`theta/parse/reassign-rhs-type-mismatch`, Sev E, phase `type`), and an
// error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts) — where at
// HEAD 769164b8 (before the 0115 fix) the type phase's `case "reassign"` arm
// evaluated nothing and the theta registered silently
// (docs/bugs/0115-reassignment-type-compat-unchecked-no-registry-row.md).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same
// harness bug 0104's live cell uses. A registration-only observable: no live
// model turn is driven, so this cell spends no tokens beyond
// `requireLiveProvider`'s credential resolution — registration is decided at
// load, so a turn is neither needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off
// the real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution. A theta whose
// body carries `let mut n: integer = 1` / `n = "hi"` must be ABSENT from the
// registered set; a sibling theta over the SAME binding shape whose
// reassignment is type-compatible must be PRESENT (bounding the refusal to
// the mismatch, not to the reassignment statement's mere presence).
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
// turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"). With the fix neutralised
// exactly as obligation 1 does (deleting the `checkReassignRhsCompat` push in
// `src/parser/type-layer-checks.ts`'s reassign arm, restoring
// `this.walkExpr(stmt.value, bindings, flow); return;`), the mismatched theta
// REGISTERS (no diagnostic denies it) and this cell reds on the "must be
// ABSENT" assertion. Restored, the mismatched theta is refused and the
// control still registers.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose body is the given reassignment lines, no callable named. */
function reassignTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines, "1"].join("\n") + "\n";
}

describe("bug 0115 reassign-rhs live cell live cell — a type-incompatible `let mut` reassignment RHS is refused at live production load and un-registers the theta", () => {
  it("un-registers the mismatched-reassignment theta while a sibling compatible-reassignment theta over the SAME binding shape registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `let mut n: integer = 1` then `n = "hi"` — a
      // `string` RHS against a declared `integer` target, `⋢` under
      // Type System — Type compatibility (bindings.md:12). Pre-fix this
      // registered silently with zero diagnostics (measured in the bug doc's
      // §Reproduction row (a)); post-fix it must be absent from the
      // registered set entirely.
      {
        source: "project",
        stem: "cellc2mismatch",
        text: reassignTheta(['let mut n: integer = 1', 'n = "hi"']),
      },
      // The control: the SAME binding shape (`let mut n: integer = 1`),
      // reassigned to a COMPATIBLE value (`n = 2`). Must register — bounding
      // the refusal to the type mismatch, not to the reassignment statement's
      // mere presence.
      {
        source: "project",
        stem: "cellc2compat",
        text: reassignTheta(["let mut n: integer = 1", "n = 2"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal
      // assertion means anything — otherwise an empty registered set would
      // satisfy the refusal vacuously (no silent skipping).
      expect(
        handle.command("cellc2compat"),
        "bug-0115 reassign-rhs live cell live cell precondition unmet: the compatible-reassignment " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0115, so the refusal assertion below cannot " +
          "witness anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the mismatched-reassignment sibling must be
      // ABSENT from the registered set — real observable off the settled
      // `ExtensionRunner`, never a `prompt()` resolution (no turn is driven in
      // this cell at all — registration is decided at load).
      expect(
        handle.command("cellc2mismatch"),
        "bug-0115 reassign-rhs live cell live cell: a theta with `let mut n: integer = 1` / `n = \"hi\"` " +
          "registered — the reassignment RHS type-compatibility check " +
          "(`theta/parse/reassign-rhs-type-mismatch`) did not fire and the theta " +
          "loaded despite the write contradicting the binding's declared type. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0115 reassign-rhs live cell live cell: the mismatched theta's slash name must not appear in " +
          "the registered set.",
      ).not.toContain("cellc2mismatch");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
