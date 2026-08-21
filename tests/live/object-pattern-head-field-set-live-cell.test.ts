// Bug 0226 — a RESOLVED `match` object-pattern head is admitted with any field
// list at all; standalone live registration cell. This lane's parent renumbers
// the H8a sequence at merge, so the cell carries a LITERAL token rather than a
// numeric id from the existing sequence (the precedent this file mirrors in
// shape: tests/live/object-pattern-head-unresolved-live-cell.test.ts). The
// token is bug 0226
//
// Additive H8a-T cell (bug 0226). The fixed surface is theta LOAD and
// REGISTRATION: an object pattern whose head resolves to a same-file
// object-form `schema` that does NOT declare a listed field must draw
// `theta/parse/extra-object-field` (Sev E, phase `parse`,
// docs/spec_topics/diagnostics/code-registry-parse.md:47) at the pattern's
// range, and an error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, src/extension/production-composition.ts:2220).
//
// WHY the field list is unjudged today: bug 0221's landed check resolves the
// head's NAME against a whole-file token scan (symbol
// `BodyParser.patternHeadTypeNames`, src/parser/theta-document.ts:4586) and
// then returns `{ kind: "object", typeName: t.text, fields }` (the `{`-gated
// arm of `BodyParser.parsePattern`, :4444) with the fields compared to nothing.
// The pass that holds the declared field NAMES, `checkObjectExpr` (:7489, over
// `StructuralRefs.schemas`, :6545), is reached from `walkExpr`'s `object` case
// (:7671–:7672) only — its `case "match"` (:7677) walks the scrutinee and each
// `arm.body` and never `arm.pattern`. So `schema R { b: integer }` with the
// pattern `R { a: 1 }` loads clean, registers, and selects that arm on a value
// constructed with an unrelated schema
// (docs/bugs/0226-declared-object-pattern-head-field-set-unchecked.md
// §Reproduction A1).
//
// This cell proves the refusal through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance` — over
// a REAL on-disk `.pi/theta/` discovery walk driven by `bootShippedExtension`
// (tests/live/harness.ts:206), then drives ONE live turn of the
// declared-FIELD sibling so the cell also witnesses that the field-set check
// leaves the admitted production of docs/spec_topics/expressions.md:171
// executable end to end on a real model.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: the extra-field theta must be ABSENT.
//   - `turn.userTexts`, the QRY-18 rendered template read off the settled
//     in-memory `SessionManager`: the sibling's arm value is computed by theta
//     CODE and appears in the outbound render, which is deterministic and
//     independent of the model's reply.
//   - `turn.systemNotes`, the `theta-system-note` channel: every fail-closed
//     ending of a top-level drive lands there, so their absence is the
//     sibling's success signal even though `prompt()` resolves either way.
// The stochastic `turn.text` is deliberately not asserted.
//
// The two fixtures differ in ONE token — the declared field name of the
// pattern's head schema (`b` versus `a`) — with the same head spelling, the
// same pattern, the same scrutinee and the same value. That is what bounds the
// refusal to the FIELD LIST against the head's declaration rather than to the
// head's name (bug 0221's landed half), to the object-pattern production, or
// to `match` itself.
//
// Subagent child-process launch: NOT reached. Both thetas are `mode: prompt`
// with a single `@`-query and no `tools:`, so no query-time tool-call loop and
// no RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it), so the executable pin, the extension-identity pin and the
// parent-pid carriage are in effect for this file.
//
// RED / GREEN (AGENTS.md "Verify both directions"): at the pre-fix baseline
// BOTH fixtures parse with ZERO diagnostics (measured offline through the
// shipped `parseThetaDocument` — the extra-field fixture is cell a1 of
// tests/object-pattern-head-field-set-refusal.test.ts, which answers `"r-arm"`
// with `[]`), so the extra-field theta registers and the "must be ABSENT"
// assertion reds — that is this cell's red direction, and it is the bug's
// symptom. Under the settled route only the extra-field fixture gains the
// diagnostic, so the sibling's registration and drive stay green.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem whose theta must NOT register — a field `R` cannot carry. */
const EXTRA_FIELD_STEM = "cellbextrafieldhead";

/** The slash stem whose theta must register AND drive — a declared field. */
const DECLARED_STEM = "cellbdeclaredfieldhead";

/** The arm value the declared-field sibling's `match` selects, echoed outbound. */
const DECLARED_LABEL = "declaredfieldarm";

/**
 * A `mode: prompt` `.theta` declaring the schema `Q` the value is constructed
 * with plus a second schema `R` whose ONE declared field is `declaredField`,
 * then selecting a `match` arm through an OBJECT pattern headed `R` and
 * listing the field `a`. `declaredField` is the ONLY difference between the
 * two fixtures: `b` makes the listed `a` undeclared, `a` makes it declared.
 */
function fieldSetTheta(declaredField: string, label: string): string {
  return (
    [
      "---",
      "mode: prompt",
      "---",
      "schema Q { a: integer }",
      `schema R { ${declaredField}: integer }`,
      "let d = Q { a: 1 }",
      `let label = match d { R { a: 1 } => "${label}", _ => "other" }`,
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

describe("bug 0226 — a resolved object-pattern head with an undeclared listed field is refused at live production load and un-registers the theta", () => {
  it("un-registers the extra-field theta while the declared-field sibling over the SAME match shape registers and drives —", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: `R` declares `{ b }` and the pattern lists `a`,
      // while the correct `Q` schema IS declared and IS what the value was
      // constructed with — the bug's §Reproduction A1 shape.
      {
        source: "project",
        stem: EXTRA_FIELD_STEM,
        text: fieldSetTheta("b", "extrafieldarm"),
      },
      // The control: the SAME head, the SAME pattern and the SAME value, with
      // the listed field DECLARED by the head's schema — the admitted
      // object/schema pattern of docs/spec_topics/expressions.md:171, which
      // the field-set check must leave alone (cell b1 of
      // tests/object-pattern-head-field-set-refusal.test.ts is its offline
      // sibling: two declared field-compatible schemas stay interchangeable).
      {
        source: "project",
        stem: DECLARED_STEM,
        text: fieldSetTheta("a", DECLARED_LABEL),
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
        "bug-0226 precondition unmet: the declared-field control did " +
          "not register — discovery or registration regressed independent of " +
          "bug 0226, so the refusal assertion below cannot witness anything. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the extra-field sibling must be ABSENT from the
      // registered set — read off the settled `ExtensionRunner`, never a
      // `prompt()` resolution.
      expect(
        handle.command(EXTRA_FIELD_STEM),
        "bug-0226: a theta whose `match` object pattern lists the field " +
          "`a` under a head whose schema declares `b` alone registered — the " +
          "field-set refusal (`theta/parse/extra-object-field`) did not fire, " +
          "so the arm still selects on a value its head cannot describe. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0226: the extra-field theta's slash name must not appear " +
          "in the registered set.",
      ).not.toContain(EXTRA_FIELD_STEM);

      // The legal spelling still executes on a real model: one live turn, with
      // the arm value the theta CODE selected carried in the deterministic
      // outbound render.
      const turn = await driveSlashCaptureTurn(handle, `/${DECLARED_STEM}`);
      expect(
        turn.userTexts.join("\n"),
        "bug-0226: the declared-field sibling's `match` must still " +
          "select its arm and render it into the outbound query — the " +
          "refusal is scoped to a listed field the head's declaration cannot " +
          "carry, not to the object-pattern production. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain(DECLARED_LABEL);
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0226: the declared-field sibling's drive must end clean — " +
          "a fail-closed `theta-system-note` here means the field-set check " +
          "broke the admitted object-pattern production at runtime. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
