// Bug 0219 — a reserved keyword heading an OBJECT pattern in a `match` arm,
// standalone live registration cell. This lane's parent renumbers the H8a
// sequence at merge, so the cell carries the literal token `` rather
// than a numeric id from the existing sequence (the precedent this file
// mirrors in shape: tests/live/capitalised-pattern-head-live-cell.test.ts).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and
// REGISTRATION: a reserved keyword in `match` pattern-head position must draw
// `theta/parse/reserved-keyword-as-identifier` (Sev E, phase `parse`,
// docs/spec_topics/diagnostics/code-registry-parse.md:21) whether or not a `{`
// follows, and an error-severity `theta/parse/*` diagnostic denies
// registration (`hasLoadParseError`,
// src/extension/production-composition.ts:2220). The `{`-gated object arm
// inside `parsePattern` (src/parser/theta-document.ts:4258–:4304) sits ABOVE
// the tail-arm emission at :4314; before this fix the arm carried no guard of
// its own, so the following `{` alone decided whether
// docs/spec_topics/lexical.md:20's reserved-word sentence was enforced and the
// braced head parsed clean, letting the theta register
// (docs/bugs/0219-reserved-keyword-object-pattern-head-parses-clean.md).
//
// This cell proves the refusal through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance` — over
// a REAL on-disk `.pi/theta/` discovery walk driven by `bootShippedExtension`
// (tests/live/harness.ts), then drives ONE live turn of the legal sibling so
// the cell also witnesses that the guard leaves the admitted production of
// docs/spec_topics/expressions.md:171 executable end to end on a real model.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: the reserved-head theta must be ABSENT.
//   - `turn.userTexts`, the QRY-18 rendered template read off the settled
//     in-memory `SessionManager`: the declared-head sibling's arm value is
//     computed by theta CODE and appears in the outbound render, which is
//     deterministic and independent of the model's reply.
//   - `turn.systemNotes`, the `theta-system-note` channel: every fail-closed
//     ending of a top-level drive lands there, so their absence is the
//     sibling's success signal even though `prompt()` resolves either way.
// The stochastic `turn.text` is deliberately not asserted.
//
// The two fixtures differ in the pattern head ALONE — `Err { a: 1 }` versus
// `Q { a: 1 }` over the same scrutinee and the same field list — which is what
// bounds the refusal to the reserved spelling rather than to the object-pattern
// production or to `match` itself.
//
// Subagent child-process launch: NOT reached. Both thetas are `mode: prompt`
// with a single `@`-query and no `tools:`, so no query-time tool-call loop and
// no RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// RED / GREEN (AGENTS.md "Verify both directions"): at HEAD both fixtures parse
// with ZERO diagnostics (measured offline through the shipped
// `parseThetaDocument`), so the reserved-head theta registers and the "must be
// ABSENT" assertion reds — that is this cell's red direction, and it is the
// bug's symptom. Under the fix only the reserved-head fixture gains the
// diagnostic, so the sibling's registration and drive stay green.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem whose theta must NOT register — a reserved braced head. */
const RESERVED_STEM = "cellareservedhead";

/** The slash stem whose theta must register AND drive — a declared braced head. */
const DECLARED_STEM = "celladeclaredhead";

/** The arm value the declared-head sibling's `match` selects, echoed outbound. */
const DECLARED_LABEL = "declaredheadarm";

/**
 * A `mode: prompt` `.theta` whose body selects a `match` arm through an OBJECT
 * pattern with the given head, then renders the selected value into one
 * `@`-query. `head` is the ONLY difference between the two fixtures.
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

describe("bug 0219 — a reserved keyword heading an object pattern is refused at live production load and un-registers the theta", () => {
  it(": un-registers the reserved-braced-head theta while the declared-braced-head sibling over the SAME match shape registers and drives", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `Err { a: 1 }` — a reserved keyword
      // (docs/spec_topics/lexical.md:20) at an object-pattern head. Measured
      // clean at the pre-fix baseline, where this theta registers.
      {
        source: "project",
        stem: RESERVED_STEM,
        text: objectPatternTheta("Err", "reservedheadarm"),
      },
      // The control: the SAME `match` shape and the SAME field list, headed by
      // the DECLARED schema name — the admitted object/schema pattern of
      // docs/spec_topics/expressions.md:171, which the guard must leave alone.
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
        "bug-0219 precondition unmet: the declared-braced-head " +
          "control did not register — discovery or registration regressed " +
          "independent of bug 0219, so the refusal assertion below cannot " +
          "witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the reserved-braced-head sibling must be ABSENT
      // from the registered set — read off the settled `ExtensionRunner`,
      // never a `prompt()` resolution.
      expect(
        handle.command(RESERVED_STEM),
        "bug-0219: a theta whose `match` pattern head is the reserved " +
          "keyword `Err` followed by `{` registered — the reserved-keyword " +
          "refusal (`theta/parse/reserved-keyword-as-identifier`) did not " +
          "fire in the `{`-gated object arm, so a following `{` still decides " +
          "whether the reserved-word rule is enforced at pattern-head " +
          "position. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0219: the reserved-braced-head theta's slash name must " +
          "not appear in the registered set.",
      ).not.toContain(RESERVED_STEM);

      // The legal spelling still executes on a real model: one live turn, with
      // the arm value the theta CODE selected carried in the deterministic
      // outbound render.
      const turn = await driveSlashCaptureTurn(handle, `/${DECLARED_STEM}`);
      expect(
        turn.userTexts.join("\n"),
        "bug-0219: the declared-braced-head sibling's `match` must " +
          "still select its arm and render it into the outbound query — the " +
          "refusal is scoped to the reserved spelling, not to the object " +
          "pattern production. userTexts: " + JSON.stringify(turn.userTexts),
      ).toContain(DECLARED_LABEL);
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0219: the declared-braced-head sibling's drive must end " +
          "clean — a fail-closed `theta-system-note` here means the guard " +
          "broke the admitted object-pattern production at runtime. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
