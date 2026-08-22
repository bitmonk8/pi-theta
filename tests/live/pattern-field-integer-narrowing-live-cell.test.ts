// Bug 0234 — a `number`-spelled numeric literal in a `match` object-pattern
// field under an `integer`-declared field of a same-file object-form schema
// (`match d { Q { a: 1.0 } => … }` where `schema Q { a: integer }`) must now
// draw `theta/parse/integer-narrowing` and DENY registration, on bug 0226's
// live-cell precedent
// (tests/live/object-pattern-head-field-set-live-cell.test.ts), which this
// file mirrors in shape. The token is .
//
// Additive H8a-T cell (bug 0234). The fixed surface is theta LOAD and
// REGISTRATION: under §Fix DISPOSITION 1, the pattern position narrows —
// `checkPatternFieldTypes` (src/parser/type-layer-checks.ts) keeps BOTH
// verdicts `checkObjectFieldCompat` (src/parser/type-compat.ts:526) can
// answer, and `patternLiteralType` (src/parser/type-layer-checks.ts) is fed
// the token's lexed `numericType` that `parsePattern`
// (src/parser/theta-document.ts) now carries onto the `PatternNode` literal
// variant, exactly as the expression path already carries it onto
// `NumberExpr`. An error-severity `theta/parse/*` diagnostic denies
// registration (`hasLoadParseError`, src/extension/production-composition.ts:2220).
//
// WHY the position was silent before this fix (docs/bugs/
// 0234-pattern-field-literal-integer-narrowing-deferred.md §Root cause): the
// integral-VALUED `number` spelling `1.0` types `integer` under
// `patternLiteralType`'s pre-fix `Number.isInteger(value)` read, so
// `checkCompatible` answers `"compatible"` and no verdict is ever computed —
// distinct from the `1.5` mechanism (verdict computed, then filtered), which
// is the offline witness's cell a1 / bug 0226's cell x4. This live cell picks
// the `1.0` spelling deliberately: it is the row §Fix constraint 1 requires
// the disposition to name by spelling, not the row a route that only removes
// the `.filter` would already close.
//
// This cell proves the refusal through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance` —
// over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (tests/live/harness.ts:206), then drives ONE live
// turn of an `integer`-spelled sibling so the cell also witnesses that the
// narrowing check leaves the admitted `1`-under-`integer` production
// (§Reproduction C1) executable end to end on a real model.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: the `1.0`-spelled theta must be ABSENT.
//   - `turn.userTexts`, the QRY-18 rendered template read off the settled
//     in-memory `SessionManager`: the sibling's arm value is computed by
//     theta CODE and appears in the outbound render, which is deterministic
//     and independent of the model's reply.
//   - `turn.systemNotes`, the `theta-system-note` channel: every fail-closed
//     ending of a top-level drive lands there, so their absence is the
//     sibling's success signal even though `prompt()` resolves either way.
// The stochastic `turn.text` is deliberately not asserted.
//
// The two fixtures differ in ONE token — the pattern field literal's spelling
// (`1.0` versus `1`) — with the same head schema, the same scrutinee and the
// same declared field type. That is what bounds the refusal to the LITERAL
// SPELLING under this disposition rather than to the object-pattern
// production itself or to the head's field-set / field-type checks bug 0226
// already landed.
//
// Subagent child-process launch: NOT reached. Both thetas are `mode: prompt`
// with a single `@`-query and no `tools:`, so no query-time tool-call loop
// and no RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it), so the executable pin, the extension-identity pin and the
// parent-pid carriage are in effect for this file.
//
// RED / GREEN (AGENTS.md "Verify both directions"): at the pre-fix baseline
// the `1.0`-spelled fixture parses with ZERO diagnostics (measured offline
// through the shipped `parseThetaDocument` — bug 0234 §Reproduction row A2),
// so it registers and the "must be ABSENT" assertion reds — that is this
// cell's red direction, and it is the bug's symptom. Under the settled route
// only the `1.0`-spelled fixture gains the diagnostic, so the
// `1`-spelled sibling's registration and drive stay green. — 

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem whose theta must NOT register — a `number`-spelled literal. */
const NARROWING_STEM = "cellslashintegernarrowingpattern";

/** The slash stem whose theta must register AND drive — an `integer`-spelled literal. */
const CONTROL_STEM = "cellslashintegerspelledpattern";

/** The arm value the control sibling's `match` selects, echoed outbound. */
const CONTROL_LABEL = "integerspelledarm";

/**
 * A `mode: prompt` `.theta` declaring `schema Q { a: integer }`, constructing
 * `d` with the integer value `1`, then selecting a `match` arm through an
 * object pattern headed `Q` whose listed field `a` carries `literal` verbatim
 * — `1.0` for the narrowing fixture, `1` for the control. `literal` is the
 * ONLY difference between the two fixtures.
 */
function narrowingTheta(literal: string, label: string): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "schema Q { a: integer }",
      "let d = Q { a: 1 }",
      `let label = match d { Q { a: ${literal} } => "${label}", _ => "other" }`,
      "@`Reply with exactly this word and nothing else: ${label}`",
    ].join("\n") + "\n"
  );
}

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * sibling drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

describe("bug 0234 — a `number`-spelled pattern field literal under an `integer`-declared field is refused at live production load and un-registers the theta — ", () => {
  it("un-registers the `1.0`-spelled theta while the `1`-spelled sibling over the SAME match shape registers and drives — ", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `1.0` is a `number` literal by lexical.md §Number
      // literals under `a: integer` — bug 0234 §Reproduction A2, "THE SHARP
      // ROW", the spelling whose verdict is never computed by a route that
      // only removes the `.filter`.
      {
        source: "project",
        stem: NARROWING_STEM,
        text: narrowingTheta("1.0", "narrowedarm"),
      },
      // The control: the SAME head, the SAME scrutinee and the SAME declared
      // field type, with the literal spelled `integer` — §Reproduction C1,
      // the row a wrong route (typing every integral pattern literal
      // `number`) would red.
      {
        source: "project",
        stem: CONTROL_STEM,
        text: narrowingTheta("1", CONTROL_LABEL),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal assertion
      // means anything — an empty registered set would satisfy the refusal
      // vacuously (no silent skipping).
      expect(
        handle.command(CONTROL_STEM),
        "bug-0234 precondition unmet: the `integer`-spelled control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0234, so the refusal assertion below cannot witness anything. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the `1.0`-spelled sibling must be ABSENT from
      // the registered set — read off the settled `ExtensionRunner`, never a
      // `prompt()` resolution.
      expect(
        handle.command(NARROWING_STEM),
        "bug-0234: a theta whose `match` object pattern lists a " +
          "`number`-spelled literal `1.0` under a field declared `integer` " +
          "registered — the narrowing refusal (`theta/parse/integer-narrowing`) " +
          "did not fire, so the arm still selects on a spelling every other " +
          "TYPE-2 sink refuses. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0234: the `1.0`-spelled theta's slash name must not appear " +
          "in the registered set.",
      ).not.toContain(NARROWING_STEM);

      // The legal spelling still executes on a real model: one live turn,
      // with the arm value the theta CODE selected carried in the
      // deterministic outbound render.
      const turn = await driveSlashCaptureTurn(handle, `/${CONTROL_STEM}`);
      expect(
        turn.userTexts.join("\n"),
        "bug-0234: the `integer`-spelled sibling's `match` must still " +
          "select its arm and render it into the outbound query — the " +
          "refusal is scoped to a `number`-spelled literal, not to the " +
          "object-pattern production. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain(CONTROL_LABEL);
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0234: the `integer`-spelled sibling's drive must end clean — " +
          "a fail-closed `theta-system-note` here means the narrowing check " +
          "broke the admitted `integer`-under-`integer` production at " +
          "runtime. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
