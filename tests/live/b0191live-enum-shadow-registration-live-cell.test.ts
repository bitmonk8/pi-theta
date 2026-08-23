// H8a live witness — bug 0191 §Fix route 1, as shipped: `#memberType`
// (src/parser/static-type-inference.ts) recognises a member access with the
// variant-access SHAPE — an `ident` target naming a declared `enum` and
// binding no local — AHEAD of the `TypeEnv` schema lookup, and answers with
// `enumVariantType()` (src/parser/type-compat.ts), a provenance-marked
// `named` `CompatType` that carries the enum's spelling for DISPLAY but
// resolves to NO declaration through `resolveNamedRef`. Before the fix, a
// same-file `schema` spelled like the enum removed the "receiver
// unresolvable" branch bug 0136 relies on, so the member arm fell through to
// its closing nominal fallback and minted `named "Red"` — a THIRD
// declaration's own type, fabricated for an enum-variant read
// (docs/bugs/0191-enum-name-shadowed-by-schema-fabricates-member-type.md).
//
// The offline unit witness (tests/enum-shadow-member-type.test.ts, groups
// (a)-(g)/(p)/(r)) pins the whole diagnostic-list contract at the `parseDoc`
// boundary and the production-executor runtime shape; neither observes the
// real discovery→registration path deciding whether a theta carrying the
// double collision becomes a slash command and drives a live turn. This cell
// drives that path through the shipped production composition root
// (`bootShippedExtension`), mirroring
// tests/live/withheld-binder-provenance-live-cell.test.ts's CLEAN/CONTROL
// shape, and asserts on real observables — the `theta-system-note` channel
// read off the settled `SessionManager`, `driveSlashCaptureTurn`'s
// deterministic `userTexts`/`systemNotes`, and registration presence — never
// on `prompt()` merely resolving.
//
// TWO HALVES:
//   (i) CLEAN — `enum Color { Red }` + `schema Color { a: string }` (the
//       object-schema shadow) + `schema Red = array<integer>` (the third
//       colliding declaration `join`'s element precondition would refuse
//       against) + a DECLARED, UNINVOKED `fn f(): string { Color.Red.join(",")
//       }`. Static type inference walks every declaration regardless of
//       whether it is ever called (the offline witness's own harness proves
//       this — `parseDoc` alone, with no execution, is what pins every row),
//       so the fabrication/erasure is fully exercised at load time whether or
//       not `f` runs; leaving it uncalled keeps the live turn itself clear of
//       the runtime's OWN, CORRECT `non-object-receiver` rejection of `.join()`
//       on an enum value (expressions.md:9, the disposition the offline
//       witness's r7 row pins directly) so this cell's single live turn tests
//       registration, not that unrelated runtime gate. Pre-fix this is the
//       reported row: the member arm mints `named "Red"`, resolves it against
//       `schema Red = array<integer>`, and `join`'s element precondition draws
//       an `E`-severity `theta/parse/non-string-array-join` — DENIED
//       registration file-wide (`hasLoadParseError`). Post-fix the enum test
//       fires first, the receiver never resolves, `join`'s precondition
//       defers, and the theta LOADS, REGISTERS, and drives ONE real turn. The
//       prompt is a TASK-FRAMED FIXED-PAIR ARITHMETIC DISCRIMINATOR
//       (`What is 18 plus 24? Answer with the number only.`), the shape
//       AGENTS.md §"Assert on real observables" mandates: a verbatim-echo
//       demand (`Reply with exactly …`, a trailing `and nothing else`) reads
//       as prompt injection to current models, which refuse it and turn the
//       reply into a coin-flip rather than an observable (bug 0243). Asking
//       for the result of a small fixed computation keeps the pinned value a
//       number the model computes.
//   (ii) CONTROL — a trivial, bug-0191-UNRELATED `mode: prompt` theta with no
//       enum, no schema, no collision of any kind. Its only role is to prove
//       the workspace/discovery/registration path itself is sound, so an
//       absent CLEAN registration cannot be misattributed to a broken
//       harness rather than to a regression of the fix. A control built from
//       the offline witness's group (d) row (`for y in Color.Red { 1 }`, the
//       shadowed-receiver `for`-loop shape) cannot serve this purpose: that
//       shape draws an `E`-severity `theta/parse/non-array-iterand`
//       diagnostic post-fix (the enum-shape test in `#memberType` still
//       leaves the iterand non-array) and is therefore DENIED registration
//       file-wide (`hasLoadParseError`) in the very state this control must
//       register cleanly in — the opposite of a "registers cleanly" baseline.
//
// SUBAGENT CHILD PINS: not required for this observable — both fixed thetas
// are `mode: prompt` with no `tools:` and no `invoke`, so no RFC-0006
// subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// Token cost: ONE live turn (the CLEAN half's task-framed arithmetic
// discriminator). The precondition control is registration-only — no drive, no
// tokens.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// H9a stderr gate (§Fix route 1 adds no new diagnostic code and no new
// reachable code path from an ordinary `pi -p` run — it only narrows an
// EXISTING mint site's input — so `tests/fixtures/h7a/permitted-codes.json`
// is expected to need no change; this file's own capture assertion below is
// the evidence for that expectation in this run).
//
// RED / GREEN (AGENTS.md "Verify both directions"): proved by hand during
// verification against the same neutralisation the offline witness's
// obligation 1 uses (the `#memberType` enum-mint branch made unreachable and
// `resolveNamedRef` made to ignore the `enumRef` marker) — see the
// verification report for whether that direction was driven live or proved
// offline and why.

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
import { parseDoc } from "../helpers/e2e-s1";

const PRECONDITION_STEM = "b0191livectl";
const CLEAN_STEM = "b0191liveclean";

/**
 * CLEAN — the fixed-path shape. `enum Color { Red }` beside `schema Color {
 * a: string }` (the object-schema shadow) and `schema Red = array<integer>`
 * (the third colliding declaration): measured offline at HEAD (this tree, the
 * fix applied) to load with zero diagnostics — the enum-shape test in
 * `#memberType` fires ahead of the `TypeEnv` lookup, so `Color.Red` never
 * resolves against `schema Red` and `join`'s element precondition defers.
 * `18 plus 24` is the fixture's fixed arithmetic oracle (42), asked in the
 * task-framed form AGENTS.md requires: a verbatim-echo demand would be read as
 * prompt injection and refused, making the reply a coin-flip (bug 0243).
 */
const CLEAN_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "// bug 0191 double-collision member-read live carrier",
    "enum Color { Red }",
    "schema Color { a: string }",
    "schema Red = array<integer>",
    'fn f(): string { Color.Red.join(",") }',
    "@`What is 18 plus 24? Answer with the number only.`",
  ].join("\n") + "\n";

/**
 * The precondition control — a trivial, bug-0191-UNRELATED `mode: prompt`
 * theta with no enum, no schema, and no collision of any kind. Present only
 * to prove the workspace/discovery/registration path itself is sound, so an
 * absent CLEAN registration cannot be misattributed to a broken harness
 * rather than to a regression of the fix. A control carrying the offline
 * witness's group (d) row (the shadowed-receiver `for`-loop shape) cannot
 * serve this purpose: that shape draws an `E`-severity
 * `theta/parse/non-array-iterand` diagnostic post-fix and is therefore
 * DENIED registration file-wide (`hasLoadParseError`) in the very state this
 * control must register cleanly in. Its prompt carries the same task-framed
 * arithmetic shape as the CLEAN half's for the same reason (bug 0243), though
 * this half is never driven.
 */
const PRECONDITION_THETA =
  [
    "---",
    "mode: prompt",
    "---",
    "@`What is 2 plus 2? Answer with the number only.`",
  ].join("\n") + "\n";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * CLEAN drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

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

describe("bug 0191 live: the double-collision member read loads/registers/drives clean", () => {
  it("registers and drives the CLEAN double-collision carrier to the arithmetic oracle", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): pin the CLEAN fixture's diagnostic list at the `parseDoc`
    // boundary so the live registration observable below cannot be produced
    // by an unrelated load failure.
    expect(
      parseDoc(CLEAN_THETA, "b0191liveclean.theta").diagnostics,
      "attribution: the CLEAN fixture must load with zero diagnostics — the " +
        "enum-shape test in `#memberType` must fire ahead of the `TypeEnv` " +
        "schema lookup for the double collision",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CLEAN_STEM, text: CLEAN_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not " +
          "the fix, would explain the CLEAN theta's behaviour too. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: registers, and drives clean.
      expect(
        handle.command(CLEAN_STEM),
        "bug-0191: the double-collision carrier did not register — the " +
          "enum-shape test did not fire ahead of the shadowing schema's " +
          "own type, and the fabricated `named \"Red\"` mint denied " +
          "registration file-wide again. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toContain(CLEAN_STEM);

      const turn = await driveSlashCaptureTurn(handle, `/${CLEAN_STEM}`);
      expect(
        turn.text,
        "bug-0191: the live model reply for the CLEAN carrier did not " +
          "contain the fixture's arithmetic oracle (42, from 18 plus 24). Reply: " +
          JSON.stringify(turn.text),
      ).toContain("42");
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0191: the CLEAN carrier's drive must end clean — a fail-closed " +
          "theta-system-note here means something broke despite parsing " +
          "clean. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
