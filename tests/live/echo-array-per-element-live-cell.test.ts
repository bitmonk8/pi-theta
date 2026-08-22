// H8a live witness — bug 0092: a heterogeneous-array `params:` default echoes
// each element under its OWN descriptor, live, through the real
// discovery→registration→binder→echo path
// (docs/bugs/0092-renderobject-first-field-unguarded-cast.md).
//
// WHAT THIS COVERS THAT NO SHIPPED LIVE CELL DOES.
// Every declared-default echo cell in `tests/live/live-production-acceptance.
// test.ts` (e.g. the bug 0181 `b181livedef` cell, and the bug 0185 cells
// beside it) defaults a HOMOGENEOUS field — a plain `number` literal or a
// single `Enum.Variant` access. None defaults an `array<T | null>` (or an
// array of discriminated-union variants), so no shipped live cell exercises
// the shape this bug is about: the sole descriptor producer
// (`echoTypeFromValue`, `src/extension/production-theta-producer.ts`) deriving
// ONE element descriptor from element 0 and reusing it for every element.
//
// THE CARRIER. `params: items: 'array<Shape | null> = [Shape { label: "x" },
// null]'` is bug 0092's own Carrier 1 (§Reproduction) — a DECLARED default, so
// the heterogeneous array reaches the echo through the runtime's own
// fill-if-absent merge and needs NO model cooperation to construct: the
// binder model supplies only the required `topic: string`, and omits `items`
// per its system prompt's last line (the same asymmetry the bug 0181 cell
// above states for its own `sev` default).
//
// THE FIXED OBSERVABLE. At HEAD-without-fix, `renderObject`
// (`src/render/argument-echo.ts`) reads `value[first.name]` off `null` (the
// second array element, described by element 0's `Shape` descriptor) and
// throws `TypeError: Cannot read properties of null (reading 'label')`
// straight out of `#emitBinderEchoNote`, before `pi.sendMessage` runs — so
// ZERO `theta-system-note` entries are delivered and the top-level slash
// dispatch's catch (`theta-composition-producer.ts`) frames the invocation as
// `theta /<name> aborted with internal error: …` instead. Post-fix, each
// element renders under its own descriptor — the object element by the object
// rule, the `null` element by the `null` rule — and the success echo carries
// `items=[{x, …}, null] (default)`. This cell asserts the fixed fragment is
// PRESENT and the abort framing is ABSENT: never on `prompt()` merely
// resolving (a fail-closed binder still resolves; AGENTS.md §"Assert on real
// observables").
//
// NO SENTINEL-REPLY PROMPT. The body is a pure literal (`1`) — no `@`-query,
// so no second model call and no "reply with exactly this" instruction; the
// theta's only model turn is the binder pass that decides `topic`, and the
// pass/fail observable is purely the `theta-system-note` channel content,
// mirroring the hardening precedent that a note's presence/absence is the
// deterministic signal.
//
// SUBAGENT CHILD PINS: not applicable. The fixture is `mode: prompt` with no
// `invoke(...)` and no `subagent fn`, so the RFC-0006 child-process launch is
// never reached; the harness sets both #subagent-child-pins at module scope
// regardless (`./harness`).
//
// MODEL SELECTION. `requireLiveProvider` resolves the SESSION model per the
// one shared rule (prefer `claude-sonnet-5`, AGENTS.md §"Live-suite
// conventions"). `bind_model:` is a separate, per-fixture declaration; this
// cell reuses `anthropic/claude-haiku-4-5`, the exact id the bug 0181/0185/
// 0192 cells in `live-production-acceptance.test.ts` already prove resolves
// live for a binder pass, so no new binder-model resolution risk is
// introduced.
//
// Token cost: ONE binder inference call (the `topic` extraction). No body
// query, no subagent child. NO SILENT SKIPPING: a missing live provider/model
// fails loudly through `requireLiveProvider` (`failLoudly`); nothing here
// early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";

/** The slash-command name for the fixture under test. */
const SLASH_NAME = "b0092live";

/** The precondition-control slash name, sharing the workspace. */
const CONTROL_NAME = "b0092livectl";

/** The sentinel the precondition control's `@`-query names (registration-only; never driven). */
// The drive discriminator is the ANSWER to the theta's own arithmetic
// prompt: deterministic content a degraded plain-prompt run cannot produce.
// A verbatim-echo demand reads as prompt injection to current models and
// draws refusals -- the documented sentinel-refusal class.
const CONTROL_SENTINEL = "812";

/**
 * The fixed fragment: the heterogeneous array's two elements, each rendered
 * under its OWN descriptor (the object rule for element 0, the `null` rule
 * for element 1) — bug 0092's §Reproduction Carrier 1, §"Expected behaviour".
 * At HEAD-without-fix this fragment never lands on the channel because the
 * invocation aborts before `pi.sendMessage` runs.
 */
const EXPECTED_ITEMS_FRAGMENT = "items=[{x, …}, null] (default)";

/**
 * The declared-default carrier, verbatim from bug 0092's §Reproduction
 * Carrier 1: a required `topic: string` plus an `items` default authored as a
 * heterogeneous array literal (`Shape { label: "x" }` and `null`). The binder
 * model supplies only `topic`; the runtime's own fill-if-absent step recovers
 * the declared default. The body is a pure literal — no `@`-query, no second
 * model call.
 */
function heterogeneousArrayDefaultTheta(): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    "  topic: string",
    `  items: 'array<Shape | null> = [Shape { label: "x" }, null]'`,
    "---",
    "schema Shape { label: string }",
    "1",
    "",
  ].join("\n");
}

/** An ordinary registration-only precondition control, never driven. */
function controlTheta(): string {
  return [
    "---",
    "mode: prompt",
    "---",
    "@`What is 379 plus 433? Answer with the number only.`",
    "",
  ].join("\n");
}

let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte " +
        "stderr capture; this spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("H8a-T — bug 0092: a heterogeneous-array params: default echoes each element under its own descriptor, live (Convention: live-host acceptance)", () => {
  it("binds the declared-default carrier and delivers the fixed BND-1 echo fragment instead of aborting the invocation", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Precondition control: an ordinary theta in the SAME workspace, proving
      // the workspace and discovery walk both work — without it, an absent
      // fixed fragment below could be (wrongly) attributed to a broken
      // workspace instead of the echo path under test.
      { source: "project", stem: CONTROL_NAME, text: controlTheta() },
      { source: "project", stem: SLASH_NAME, text: heterogeneousArrayDefaultTheta() },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(CONTROL_NAME),
        "the precondition control did not register — a broken workspace, not " +
          "the echo path under test, would explain the target fixture's " +
          "outcome too. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The heterogeneous-array-default fixture must itself register: an
      // `array<Shape | null>` default lowers to a clean `anyOf` items schema
      // and parses with zero diagnostics (bug 0092's own §Reproduction), so a
      // load-time refusal here would leave the runtime hook this cell drives
      // entirely unreached.
      expect(
        handle.command(SLASH_NAME),
        "the heterogeneous-array-default theta did not register. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The slash argument names ONLY the required field, so the binder omits
      // `items` per its system prompt's last line, leaving the runtime's own
      // fill-if-absent step to supply the heterogeneous default this bug is
      // about — exactly bug 0092's Carrier 1.
      const turn = await driveSlashCaptureTurn(handle, `/${SLASH_NAME} weather`);

      // THE FIXED OBSERVABLE, asserted FIRST and POSITIVELY so a red names
      // what the channel actually carried. Read off the settled in-memory
      // `SessionManager` (AGENTS.md §"Assert on real observables"), never off
      // `prompt()` merely resolving — a fail-closed echo path still resolves.
      // At HEAD-without-fix this fragment is absent (the invocation aborted
      // before `pi.sendMessage` ran).
      expect(
        turn.systemNotes.some(
          (note) => note.startsWith(`Running /${SLASH_NAME}:`) && note.includes(EXPECTED_ITEMS_FRAGMENT),
        ),
        "no theta-system-note entry named " +
          `Running /${SLASH_NAME}:` +
          " carries the fixed fragment " +
          JSON.stringify(EXPECTED_ITEMS_FRAGMENT) +
          " — the object element and the `null` element are not being rendered " +
          "under their own descriptors. Notes: " + JSON.stringify(turn.systemNotes) +
          "; outbound: " + JSON.stringify(turn.userTexts),
      ).toBe(true);

      // THE BUG'S OWN FAILURE SIGNATURE, asserted as an ABSENCE: at
      // HEAD-without-fix the top-level slash dispatch's catch
      // (theta-composition-producer.ts) frames the thrown `TypeError` as
      // `theta /<name> aborted with internal error: …`.
      const abortNotes = turn.systemNotes.filter((note) =>
        new RegExp(`^theta /${SLASH_NAME} (returned Err|cancelled|aborted)`).test(note),
      );
      expect(
        abortNotes,
        "the drive ended through a fail-closed path instead of binding and " +
          "echoing cleanly: " + JSON.stringify(abortNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
