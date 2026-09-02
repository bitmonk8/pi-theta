// Bug 0370 — reassign-target-scope live cell, a standalone live registration
// cell (the 0104 / 0065 / 0182 / 0115 standalone-live-file precedent; not a
// numbered live-production-acceptance cell — this lane's parent renumbers the
// H8a sequence at merge, so this file carries the literal token
// `reassign-target-scope live cell` rather than a numeric id from the existing
// sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// reassignment whose TARGET is refused by bug 0370's §Fix layer 1 target-scope
// walk must now be REFUSED at parse, and an error-severity `theta/parse/*`
// diagnostic denies registration (`hasLoadParseError`,
// src/extension/production-composition.ts) — where at the fork bd76794f
// (before this fix) the target was never resolved against the scope model, so
// both planted refusals registered silently and their writes were dropped at
// runtime (docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md,
// §Reproduction rows G10 and G9).
//
// TWO refused input classes, one per ratified flip class, exercised end-to-end:
//   - CLASS 1 (`theta/parse/immutable-rebinding`): a write to an immutable
//     `fn` parameter — `fn f(a) { a = 3 … }` — the highest-frequency shape
//     (§Why it matters facet (a)).
//   - CLASS 2 (`theta/parse/unknown-identifier`): a cross-boundary write to a
//     caller-scope `let mut` from inside a closure-free `fn` body —
//     `let mut x = 0` / `fn f() { x = 10 … }` — refused because the target is
//     not in the body's scope (functions.md:20, FN-1).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0115's live cell uses. A registration-only observable: no live model turn
// is driven, so this cell spends no tokens beyond `requireLiveProvider`'s
// credential resolution — registration is decided at load, so a turn is
// neither needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off
// the real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution. A theta whose body
// carries a refused reassignment target must be ABSENT from the registered
// set; a sibling theta over the SAME `fn` shape whose body carries no refused
// write must be PRESENT (bounding the refusal to the write, not to the `fn`
// declaration's mere presence).
//
// Subagent child-process launch: NOT reached. All planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (inherited
// by importing it), but this cell does not exercise that path — zero model
// turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"). With §Fix layer 1
// neutralised — the reassign-target arm's `emitUnknownIdentifier` call and the
// `withImmutableBindings` recording removed from
// `src/parser/theta-document.ts` — both refused thetas REGISTER (no diagnostic
// denies them) and this cell reds on the "must be ABSENT" assertions. Restored,
// both are refused and the control still registers.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** A `mode: prompt` `.theta` whose body is the given lines, no callable named. */
function bodyTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines, "1"].join("\n") + "\n";
}

describe("bug 0370 reassign-target-scope live cell — a reassignment whose target the scope model refuses is denied registration at live production load", () => {
  it("un-registers a parameter write and a cross-boundary write while a sibling with no refused write over the SAME fn shape registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // CLASS 1 — a write to an immutable `fn` parameter draws
      // `theta/parse/immutable-rebinding` (§Fix layer 1). Pre-fix this
      // registered silently and the write was dropped at runtime (§Reproduction
      // row G10, value 1); post-fix it must be absent from the registered set.
      {
        source: "project",
        stem: "cell0370param",
        text: bodyTheta(["fn f(a) { a = 3", "a }", "f(1)"]),
      },
      // CLASS 2 — a cross-boundary write to a caller-scope `let mut` from a
      // closure-free `fn` body draws `theta/parse/unknown-identifier` (§Fix
      // layer 1). Pre-fix this parsed clean and the runtime walk crossed the
      // activation boundary and mutated the top-level binding (§Reproduction
      // row G9, value 6); post-fix it must be absent from the registered set.
      {
        source: "project",
        stem: "cell0370xbound",
        text: bodyTheta(["let mut x = 0", "fn f() { x = 10", "2 }", "f()", "x"]),
      },
      // The control: the SAME parameter `fn` shape whose body carries NO
      // refused write — it reads the parameter and returns it. Must register,
      // bounding the refusals above to the write itself, not to the `fn`
      // declaration's mere presence.
      {
        source: "project",
        stem: "cell0370control",
        text: bodyTheta(["fn f(a) { a }", "f(1)"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal assertions
      // mean anything — otherwise an empty registered set would satisfy the
      // refusals vacuously (no silent skipping).
      expect(
        handle.command("cell0370control"),
        "bug-0370 reassign-target-scope live cell precondition unmet: the no-refused-write " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0370, so the refusal assertions below cannot " +
          "witness anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable, CLASS 1: the parameter-write sibling must be
      // ABSENT from the registered set — real observable off the settled
      // `ExtensionRunner`, never a `prompt()` resolution (no turn is driven in
      // this cell at all — registration is decided at load).
      expect(
        handle.command("cell0370param"),
        "bug-0370 reassign-target-scope live cell: a theta with `fn f(a) { a = 3 }` registered " +
          "— the parameter write was not refused as an immutable-context " +
          "rebinding (`theta/parse/immutable-rebinding`) and the theta loaded " +
          "despite the write being silently dropped at runtime. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The fixed observable, CLASS 2: the cross-boundary-write sibling must
      // likewise be ABSENT.
      expect(
        handle.command("cell0370xbound"),
        "bug-0370 reassign-target-scope live cell: a theta with a cross-boundary `fn`-body write " +
          "to a caller-scope `let mut` registered — the target was not refused " +
          "as out-of-scope (`theta/parse/unknown-identifier`) and the write " +
          "would land across the no-closures activation boundary. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      const names = handle.registeredNames();
      expect(
        names,
        "bug-0370 reassign-target-scope live cell: neither refused theta's slash name may appear in " +
          "the registered set.",
      ).not.toContain("cell0370param");
      expect(names).not.toContain("cell0370xbound");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
