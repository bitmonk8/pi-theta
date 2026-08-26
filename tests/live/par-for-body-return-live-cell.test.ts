// Bug 0223 — `par for` body `return` refusal live cell, standalone live
// registration cell (the capitalised-pattern-head-live-cell / bug 0141
// precedent this file mirrors verbatim in shape: this lane's parent renumbers
// the H8a sequence at merge, so this file carries a literal lane token instead
// of a numeric id from the existing sequence —
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `return` inside a `par for` body must now be REFUSED at parse
// (`theta/parse/par-return-in-body`, Sev E, phase `parse`), and an
// error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts) — where at
// HEAD (before the 0223 fix) `scanParForStmt`'s `case "return"` walked the
// operand and emitted nothing (src/parser/theta-document.ts:4753-4757), the
// theta registered silently, and `runParForIteration` folded the `return` into
// that iteration's `makeOk(flow.value)`
// (src/runtime/statement-executor.ts:1292-1293)
// (docs/bugs/0223-par-for-body-return-folds-unenumerated.md, §Fix route (a) —
// ENUMERATE-AND-REFUSE).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0141's live cell uses. A registration-only observable: no live model turn
// is driven, so this cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution — registration is decided at load, so a turn is neither
// needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off the
// real `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
// step — never a `prompt()` resolution. A theta whose body carries a `par for`
// with a body `return` must be ABSENT from the registered set; a sibling theta
// over the SAME `par for` shape whose `return <expr>` is replaced by the bare
// tail expression `<expr>` must be PRESENT (bounding the refusal to the body
// `return`, not to the `par for` construct's mere presence — bug 0223
// §Reproduction row E is that control).
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
// turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"): with the refused fixture's
// body `return i * 10` replaced by the tail expression `i * 10` (i.e. the
// control's text), the "must be ABSENT" assertion reds because the refusal
// disappears and the theta registers under its own stem. Restored to the
// `return` spelling, the theta is refused and the tail-expression control still
// registers. The live suite is NOT run in the phase that wrote this file; this
// cell is expected RED until the parse-side refusal lands.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/**
 * A `mode: prompt` `.theta` whose body binds a `par for` whose body is the
 * given statement/expression text. `bodyLine` is either `return i * 10` (the
 * refused shape) or `i * 10` (the legal tail-expression control).
 */
function parForTheta(bodyLine: string): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "let xs = par for i in [1, 2, 3] {",
      `  ${bodyLine}`,
      "}",
      "xs",
    ].join("\n") + "\n"
  );
}

describe("bug 0223 — a `return` in a `par for` body is refused at live production load and un-registers the theta", () => {
  it("un-registers the body-`return` theta while a sibling tail-expression theta over the SAME `par for` shape registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `par for i in [1, 2, 3] { return i * 10 }`. Pre-fix
      // this registered silently with zero diagnostics (bug 0223
      // §Reproduction row B, re-measured); post-fix it must be absent from the
      // registered set entirely.
      {
        source: "project",
        stem: "celleparreturn",
        text: parForTheta("return i * 10"),
      },
      // The control: the SAME `par for` shape with the `return` replaced by the
      // bare tail expression (bug 0223 §Reproduction row E). Must register —
      // bounding the refusal to the body `return`, not to `par for` itself.
      {
        source: "project",
        stem: "celleparcontrol",
        text: parForTheta("i * 10"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal assertion
      // means anything — otherwise an empty registered set would satisfy the
      // refusal vacuously (no silent skipping).
      expect(
        handle.command("celleparcontrol"),
        "bug-0223 precondition unmet: the tail-expression `par for` control " +
          "did not register — discovery or registration regressed independent " +
          "of bug 0223, so the refusal assertion below cannot witness " +
          "anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the body-`return` sibling must be ABSENT from the
      // registered set — real observable off the settled `ExtensionRunner`,
      // never a `prompt()` resolution (no turn is driven in this cell at all —
      // registration is decided at load).
      expect(
        handle.command("celleparreturn"),
        "bug-0223: a theta whose `par for` body contains a `return` " +
          "registered — the CTRL-4 body refusal " +
          "(`theta/parse/par-return-in-body`) did not fire, so the theta " +
          "loaded and the runtime fold " +
          "(src/runtime/statement-executor.ts:1293-1297) stays reachable. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0223: the body-`return` theta's slash name must not appear in " +
          "the registered set.",
      ).not.toContain("celleparreturn");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
