// Bug 0367 — null-left-minus live cell, standalone live registration cell (the
// 0115 / 0104 / 0065 standalone-live-file precedent; not a numbered
// live-production-acceptance cell — this lane's parent renumbers the H8a
// sequence at merge, so this file carries the literal token
// `b0367 null-left-minus live cell` rather than a numeric id from the existing
// H8a sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: an
// authored binary `-` whose LEFT operand is the literal `null` is now REFUSED
// at parse (`theta/parse/non-numeric-arithmetic-operands`, the registered row
// `docs/spec_topics/expressions.md:236` already names `null` in for `-`), and an
// error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts). At the fork
// (before the 0367 fix) `parseUnary` lowered unary `-` to a synthetic-null
// binary that is AST-identical to the authored `null - 3`, so the bug-0332
// parse gate's carve-out exempted the authored pairing and the theta registered
// silently and evaluated `-3`
// (docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0115's live cell uses. A registration-only observable: no live model turn
// is driven, so this cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution — registration is decided at load, so a turn is neither
// needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off the
// real `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
// step — never a `prompt()` resolution. A theta whose body carries
// `let x = null - 3` must be ABSENT from the registered set; a sibling theta
// carrying a GENUINE unary minus (`let x = -3`) — byte-identical in the AST but
// for the `unary: true` marker the fix adds — must be PRESENT. The control
// bounds the refusal to the authored null-LEFT binary, NOT to the `-` operator
// itself (genuine unary `-3` still registers and evaluates to `-3`).
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
// turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"). With the fix neutralised at
// the parse gate (restoring `type-layer-checks.ts`'s carve-out to the wide
// `!(e.op === "-" && e.left.kind === "null")` predicate), the authored
// `null - 3` theta REGISTERS (no diagnostic denies it) and this cell reds on
// the "must be ABSENT" assertion. Restored, the authored pairing is refused and
// the genuine-unary control still registers.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose body is the given lines, no callable named. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

describe("bug 0367 null-left-minus live cell — an authored binary `-` over a literal `null` left operand is refused at live production load and un-registers the theta", () => {
  it("un-registers the authored `null - 3` theta while a genuine unary-minus theta over the SAME operator registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `let x = null - 3` — an authored binary subtraction
      // whose left operand is the literal `null`, squarely inside the spec's
      // refusal set for `-` (expressions.md:236 names `null`). At the fork this
      // registered silently and evaluated `-3` (the bug's §Reproduction row
      // C1); post-fix it must be absent from the registered set entirely.
      {
        source: "project",
        stem: "cellb0367null",
        text: promptTheta(["let x = null - 3", "x"]),
      },
      // The control: a GENUINE unary minus (`let x = -3`) — AST-identical to the
      // refused shape except for the `unary: true` marker the fix adds. Must
      // register, bounding the refusal to the authored null-LEFT binary and NOT
      // to the `-` operator (unary `-3` stays byte-identical and evaluates -3).
      {
        source: "project",
        stem: "cellb0367unary",
        text: promptTheta(["let x = -3", "x"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal assertion
      // means anything — otherwise an empty registered set would satisfy the
      // refusal vacuously (no silent skipping).
      expect(
        handle.command("cellb0367unary"),
        "bug-0367 null-left-minus live cell precondition unmet: the genuine " +
          "unary-minus control did not register — discovery or registration " +
          "regressed independent of bug 0367, so the refusal assertion below " +
          "cannot witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the authored `null - 3` sibling must be ABSENT
      // from the registered set — real observable off the settled
      // `ExtensionRunner`, never a `prompt()` resolution (no turn is driven in
      // this cell at all — registration is decided at load).
      expect(
        handle.command("cellb0367null"),
        "bug-0367 null-left-minus live cell: a theta with `let x = null - 3` " +
          "registered — the authored binary `-` over a `null` left operand was " +
          "misclassified as unary negation and drew no " +
          "`theta/parse/non-numeric-arithmetic-operands`, so the theta loaded " +
          "and evaluated `-3`. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0367 null-left-minus live cell: the authored null-left-minus " +
          "theta's slash name must not appear in the registered set.",
      ).not.toContain("cellb0367null");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
