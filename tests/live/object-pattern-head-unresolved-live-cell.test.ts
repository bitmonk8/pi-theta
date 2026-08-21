// Bug 0221 — a NON-reserved `match` object-pattern head is checked against
// nothing, standalone live registration cell. This lane's parent renumbers the
// H8a sequence at merge, so the cell carries a literal token rather than a
// numeric id from the existing sequence (the precedent this file mirrors in
// shape: tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts).
// The token is
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: an
// object-pattern head that resolves to no declaration usable at that position
// must draw `theta/parse/unresolved-named-type` (Sev E, phase `parse`,
// docs/spec_topics/diagnostics/code-registry-parse.md:101) at the head's range,
// and an error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts:2220). The
// `{`-gated object arm inside `parsePattern` (symbol
// `BodyParser.parsePattern`, src/parser/theta-document.ts:4284; arm gate
// `if (this.isPunct("{"))` at :4355) ran bug 0219's token-kind guard at :4356
// and nothing else, so a non-reserved head was recorded as `typeName` at :4392
// and read by nobody: the theta loaded clean, registered, and selected the arm
// whose head names a schema the value was not constructed with
// (docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md
// §Reproduction A2).
//
// This cell proves the refusal through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance` — over
// a REAL on-disk `.pi/theta/` discovery walk driven by `bootShippedExtension`
// (tests/live/harness.ts), then drives ONE live turn of the declared-head
// sibling so the cell also witnesses that the check leaves the admitted
// production of docs/spec_topics/expressions.md:171 executable end to end on a
// real model.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: the undeclared-head theta must be ABSENT.
//   - `turn.userTexts`, the QRY-18 rendered template read off the settled
//     in-memory `SessionManager`: the declared-head sibling's arm value is
//     computed by theta CODE and appears in the outbound render, which is
//     deterministic and independent of the model's reply.
//   - `turn.systemNotes`, the `theta-system-note` channel: every fail-closed
//     ending of a top-level drive lands there, so their absence is the
//     sibling's success signal even though `prompt()` resolves either way.
// The stochastic `turn.text` is deliberately not asserted.
//
// The two fixtures differ in ONE character — the pattern head `R` versus `Q`
// over the same scrutinee, the same field list and the same declared schema —
// which is what bounds the refusal to the unresolved NAME rather than to the
// object-pattern production or to `match` itself.
//
// Subagent child-process launch: NOT reached. Both thetas are `mode: prompt`
// with a single `@`-query and no `tools:`, so no query-time tool-call loop and
// no RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it), so the executable pin, the extension-identity pin and the
// parent-pid carriage are in effect for this file.
//
// RED / GREEN (AGENTS.md "Verify both directions"): at the pre-fix baseline
// both fixtures parse with ZERO diagnostics (measured offline through the
// shipped `parseThetaDocument`), so the undeclared-head theta registers and the
// "must be ABSENT" assertion reds — that is this cell's red direction, and it
// is the bug's symptom. Under the fix only the undeclared-head fixture gains
// the diagnostic, so the sibling's registration and drive stay green.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem whose theta must NOT register — an undeclared braced head. */
const UNDECLARED_STEM = "cellaundeclaredhead";

/** The slash stem whose theta must register AND drive — a declared braced head. */
const DECLARED_STEM = "celladeclaredname";

/** The arm value the declared-head sibling's `match` selects, echoed outbound. */
const DECLARED_LABEL = "declarednamearm";

/**
 * A `mode: prompt` `.theta` declaring exactly one schema `Q`, constructing a
 * `Q` value, and selecting a `match` arm through an OBJECT pattern with the
 * given head, then rendering the selected value into one `@`-query. `head` is
 * the ONLY difference between the two fixtures.
 */
function objectPatternTheta(head: string, label: string): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "schema Q { a: integer }",
      "let d = Q { a: 1 }",
      `let label = match d { ${head} { a: 1 } => "${label}", _ => "other" }`,
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

describe("bug 0221 — an unresolved object-pattern head is refused at live production load and un-registers the theta", () => {
  it("un-registers the undeclared-braced-head theta while the declared-braced-head sibling over the SAME match shape registers and drives —", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: the head `R` is declared nowhere in the file, while
      // the correct `Q` schema IS declared and IS what the value was
      // constructed with — the bug's §Reproduction A2 shape.
      {
        source: "project",
        stem: UNDECLARED_STEM,
        text: objectPatternTheta("R", "undeclaredheadarm"),
      },
      // The control: the SAME `match` shape and the SAME field list, headed by
      // the DECLARED schema name — the admitted object/schema pattern of
      // docs/spec_topics/expressions.md:171, which the name check must leave
      // alone.
      {
        source: "project",
        stem: DECLARED_STEM,
        text: objectPatternTheta("Q", DECLARED_LABEL),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the control must register before the refusal assertion
      // means anything — an empty registered set would satisfy the refusal
      // vacuously (no silent skipping).
      expect(
        handle.command(DECLARED_STEM),
        "bug-0221 precondition unmet: the declared-braced-head " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0221, so the refusal assertion below cannot " +
          "witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the undeclared-braced-head sibling must be
      // ABSENT from the registered set — read off the settled
      // `ExtensionRunner`, never a `prompt()` resolution.
      expect(
        handle.command(UNDECLARED_STEM),
        "bug-0221: a theta whose `match` object-pattern head `R` is " +
          "declared nowhere in the file registered — the unresolved-name " +
          "refusal (`theta/parse/unresolved-named-type`) did not fire in the " +
          "`{`-gated object arm, so the head still constrains nothing and the " +
          "arm selects on a value it names nothing about. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0221: the undeclared-braced-head theta's slash name must " +
          "not appear in the registered set.",
      ).not.toContain(UNDECLARED_STEM);

      // The legal spelling still executes on a real model: one live turn, with
      // the arm value the theta CODE selected carried in the deterministic
      // outbound render.
      const turn = await driveSlashCaptureTurn(handle, `/${DECLARED_STEM}`);
      expect(
        turn.userTexts.join("\n"),
        "bug-0221: the declared-braced-head sibling's `match` must " +
          "still select its arm and render it into the outbound query — the " +
          "refusal is scoped to a head that resolves to nothing, not to the " +
          "object-pattern production. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain(DECLARED_LABEL);
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0221: the declared-braced-head sibling's drive must end " +
          "clean — a fail-closed `theta-system-note` here means the name " +
          "check broke the admitted object-pattern production at runtime. " +
          "Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
