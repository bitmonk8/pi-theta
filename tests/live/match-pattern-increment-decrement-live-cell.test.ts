// Bug 0123 — a `++` / `--` in `match` PATTERN position live cell,
// standalone live registration cell (the bug 0141
// `tests/live/capitalised-pattern-head-live-cell.test.ts` precedent this file
// mirrors in shape: this lane's parent renumbers the H8a sequence at merge, so
// this file carries the literal token `` rather than a numeric id from
// the existing sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `++` / `--` in `match` pattern position must now be REFUSED at parse under
// the already-registered `theta/parse/increment-decrement` (Sev E, phase
// `parse`, docs/spec_topics/diagnostics/code-registry-parse.md:34), and an
// error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts) — where at
// HEAD `parsePattern`'s tail recovery (src/parser/theta-document.ts:4241–4243)
// consumes the operator token as an indistinguishable wildcard and emits
// nothing
// (docs/bugs/0123-match-pattern-decrement-draws-neighbouring-codes.md).
//
// WHICH SPELLING WITNESSES WHAT (this is why two refused fixtures are planted,
// not one):
//   - `[--y]` is one of the three spellings bug 0123 measures as loading with
//     ZERO diagnostics today (§Reproduction, "The silent rows"), so it
//     REGISTERS at HEAD and must be ABSENT post-fix. That row is what makes
//     this cell able to red now and green after — AGENTS.md "Verify both
//     directions when adding or strengthening an assertion".
//   - the bare `--y` head is the report's primary input. It is refused at HEAD
//     too, but under the WRONG codes (`theta/parse/statement-in-arm-body` plus
//     a cascading `theta/parse/match-arm-type-mismatch`), so its absence from
//     the registered set is asserted as the end-to-end consequence of the fix
//     rather than as this cell's red-capable row.
//
// This cell proves the refusal through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0141's and bug 0115's live cells use. A registration-only observable: no
// live model turn is driven, so this cell spends no tokens beyond
// `requireLiveProvider`'s credential resolution — registration is decided at
// load, so a turn is neither needed nor driven.
//
// Observable per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving": `handle.command(stem)` / `handle.registeredNames()`, read off the
// real `ExtensionRunner` after the real `session_start` →
// `pi.registerCommand` step — never a `prompt()` resolution.
//
// NO SILENT SKIPPING (AGENTS.md, CLAUDE.md): `requireLiveProvider` fails
// LOUDLY naming the unmet precondition when no live provider / model resolves,
// and the lowercase control is asserted PRESENT before either refusal is
// asserted absent, so an empty registered set can never satisfy this cell
// vacuously.
//
// Subagent child-process launch: NOT reached. All three planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters regardless (executable
// pin on `process.argv[1]`, `PI_THETA_SUBAGENT_EXTENSION_PIN` and the
// `PI_THETA_SUBAGENT_PARENT_PID` carriage), inherited by importing it — but this
// cell does not exercise that path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/**
 * A `mode: prompt` `.theta` whose body is a single `match` arm with the given
 * pattern. The `match` shape is identical across all three fixtures, so the
 * only difference between the refused thetas and the control is the operator.
 */
function matchTheta(pattern: string): string {
  return (
    ["---", "mode: prompt", "---", `let v = match 1 { ${pattern} => 1 }`, "1"].join("\n") + "\n"
  );
}

describe("bug 0123 — a `--` in `match` pattern position is refused at live production load and un-registers the theta", () => {
  it(": un-registers both the `[--y]` and the bare `--y` pattern thetas while a lowercase `[y]` sibling over the SAME `match` shape registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The red-capable refusal: `match 1 { [--y] => 1 }` loads with ZERO
      // diagnostics at HEAD (bug 0123 §Reproduction, "The silent rows" — the
      // recovery makes it a silent TWO-slot exact-length array pattern), so it
      // registers today and must be absent post-fix.
      {
        source: "project",
        stem: "cellb2arraydecrement",
        text: matchTheta("[--y]"),
      },
      // The report's primary input: a bare `--y` pattern head. Refused at HEAD
      // as well, but under the wrong codes; post-fix it is refused under the
      // registered operator row.
      {
        source: "project",
        stem: "cellb2baredecrement",
        text: matchTheta("--y"),
      },
      // The control: the SAME `match` shape with an operator-free lowercase
      // binding pattern. Must register — bounding the refusal to the operator,
      // not to the `match` statement's or the array pattern's mere presence.
      {
        source: "project",
        stem: "cellb2lowercase",
        text: matchTheta("[y]"),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before either refusal
      // assertion means anything — otherwise an empty registered set would
      // satisfy both vacuously (no silent skipping).
      expect(
        handle.command("cellb2lowercase"),
        "bug-0123 precondition unmet: the operator-free `[y]` control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0123, so the refusal assertions below cannot witness " +
          "anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable, red-capable direction: the silently-accepted
      // array spelling must be ABSENT from the registered set.
      expect(
        handle.command("cellb2arraydecrement"),
        "bug-0123: a theta whose `match` pattern is `[--y]` registered — the " +
          "operator rejection (`theta/parse/increment-decrement`) did not " +
          "fire in pattern position, so `parsePattern`'s recovery still " +
          "swallowed the operator as a silent wildcard element. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      // The report's primary input, end to end.
      expect(
        handle.command("cellb2baredecrement"),
        "bug-0123: a theta whose `match` pattern head is `--y` registered — " +
          "an error-severity parse diagnostic must deny registration. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();

      expect(
        handle.registeredNames(),
        "bug-0123: neither operator-bearing pattern theta's slash name may " +
          "appear in the registered set.",
      ).not.toContain("cellb2arraydecrement");
      expect(
        handle.registeredNames(),
        "bug-0123: neither operator-bearing pattern theta's slash name may " +
          "appear in the registered set.",
      ).not.toContain("cellb2baredecrement");
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
