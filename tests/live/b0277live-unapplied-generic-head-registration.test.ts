// Bug 0277 — an UNAPPLIED generic-constructor head (`Result`, `array`) or a
// `Result` value constructor (`Ok`, `Err`) written in a type position is
// admitted at five of the nine type-reference captures and lowers to the empty
// type there, standalone live registration cell
// (docs/bugs/0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md).
// It mirrors in shape bug 0274's
// `b0274live-reserved-keyword-type-head-registration.test.ts`. Every fixture
// stem, theta filename and slash-name carries the literal `b0277live` prefix so
// the cell's identity is readable from the bug number alone and collides with
// no other cell's stem in the H8a sequence. No existing cell is renumbered or
// touched.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on inputs that, before it, loaded
// with ZERO diagnostics and registered (§Reproduction, the `fn-return` and
// `let-annot` columns of the `Result` row, both measured "SILENT, reg=Y").
// `lowerTypeExpr`'s atom arm (`src/parser/params.ts`) classifies an unapplied
// head as a reserved keyword read where an `Ident` is read and publishes it
// through the optional `reservedKeywords` out-parameter; five captures render
// that sink through `admittedReservedKeywords`
// (`src/parser/theta-document.ts`), whose withheld set holds exactly these four
// spellings, so the class is computed and dropped there. §Fix route (a) makes
// that function the identity and deletes the set, and an error-severity
// `theta/parse/*` diagnostic denies registration (`hasLoadParseError`,
// `src/extension/production-composition.ts`; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: `theta/parse/reserved-keyword-as-identifier`
// is an existing row (docs/spec_topics/diagnostics/code-registry-parse.md line
// 21) whose *Trigger* — "Reserved keyword used in an identifier position." —
// enumerates no position, and whose neighbour row at line 112 states the
// reading directly ("at every position alike"). No *Message* byte moves under
// version 0.275.0. This cell asserts an EXISTING code by name at positions that
// did not emit it before the change-set.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts`)
// settles inside one `parseThetaDocument` call and cannot reach discovery,
// registration, the note channel or a driven turn; this cell adds only that.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the control, after a real driven turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — both CARRIERS must be ABSENT, the control PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/parse/*` → `lex-parse-type`,
//      `src/extension/production-composition.ts`; the note content is
//      `renderDiagnosticBatch([diagnostic])` and `renderDiagnosticLine` writes
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so both the
//      code and the offending HEAD SPELLING must appear by name on the real
//      channel the suite observes — the spelling because the registered
//      *Message* interpolates it, and reading it is what separates this bug's
//      emission from any other refusal of the same code.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `text` and `userTexts`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose constructor
//      heads carry their argument lists able to drive a real turn end to end.
//
// THE TWO CARRIERS are the two faces of the report at the spelling the
// committed corpus itself writes in its APPLIED form, so the contrast with the
// control is one argument list wide.
//   - `b0277livefnreturn` — §Reproduction's `fn-return` column, `fn f(): Result`,
//     the shape the conformance corpus spells and the reason §Fix route (a)
//     owes that theta a respelling in the same change.
//   - `b0277liveletannot` — §Reproduction's `let-annot` column and the
//     inert-annotation half: at HEAD `let a: Result = 3` loads with the
//     binding's own type check silently disabled, so the author writes an
//     annotation and gets none.
// Two carriers rather than one because the five captures are five separate
// render sites: a route that unfiltered only one would leave the other
// registered, and this cell reds naming which.
//
// Every stem here is all-lowercase because the composition root refuses a slash
// name that is not lowercase kebab/snake before a diagnostic of this bug's own
// can decide the theta's fate; a carrier with an uppercase letter in its stem
// would be absent from the registered set for that reason instead, and its
// absence assertion could not red.
//
// THE CONTROL is the same shape with every constructor head APPLIED, and it is
// also the over-broadness tripwire the offline witness's group (A) locks. An
// applied head is consumed by the generic-application arm and never reaches the
// atom arm the withheld set sits on, so `Result<T, E>` and `array<T>` are legal
// at these captures (docs/spec_topics/grammar.md lines 99–100) and the
// committed corpus spells both (docs/examples/personas.thetalib line 7,
// docs/examples/summarise-doc.theta line 10). The control writes an applied
// `Result` at an `fn` return and an applied `array` at a `let` annotation —
// exactly the two carriers' captures — so a route that keyed the refusal on the
// SPELLING rather than on the zero-argument form reds here rather than in the
// committed-fixture gate.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from the legally-annotated bindings, never a
// verbatim-echo demand and never a narrative framing. `n` is computed from the
// `array<integer>`-annotated binding's element read, so the interpolated
// question also proves that applied head carried a real value into the prompt.
// The `Result`-returning declaration is deliberately left UNCALLED: the capture
// this cell scopes is the `fn` RETURN TYPE walk, which runs over the
// declaration whether or not it is called, and a top-level `?` propagation from
// it would add a runtime question this cell is not measuring. The pair
// (777, 133) is deliberately different from the pairs bug 0262's, bug 0271's,
// bug 0274's and bug 0278's cells use, so no cell's discriminator can satisfy
// another's assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a FOURTH planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, already live
// and untouched by this fix). Its code must appear on the note channel too. If
// it does not, the channel — not this bug — is the fault, and the cell reds
// naming that.
//
// Subagent child-process launch: NOT reached. The control drives one plain
// interpolated query with no tool invocation, so no query-time tool-call loop
// and no RFC-0006 subagent-child spawn occurs. `tests/live/harness.ts` carries
// the `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, so the pins are in effect for this cell whether
// or not that path is exercised.
//
// NO SILENT SKIPPING. `requireLiveProvider` fails loudly (`failLoudly`,
// `tests/live/harness.ts`) naming the unmet precondition when no live provider
// or model is configured; nothing here early-returns, branches on the
// environment or skips.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red BEFORE the change-set
// for the right reason — both carriers register and no note names the code,
// because those five captures drop these four spellings before rendering their
// sink. Green under the fix. The green direction's own tripwire is the control,
// which must keep registering AND keep driving with its applied `Result` and
// `array` heads.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row the five filtered captures must draw for an unapplied head. */
const RESERVED_CODE = "theta/parse/reserved-keyword-as-identifier";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The head both carriers write with no argument list, and which the *Message* interpolates. */
const HEAD = "Result";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. The theta computes 263 + 514 = 777, and the question
// adds 133. Measured offline: the control's source loads with ZERO diagnostics
// at HEAD, so a red on the control is the scoping, not the fixture.
const CONTROL_VALUE = "777";
const SUM_ANSWER = "910";

/** CARRIER 1: §Reproduction's `fn-return` column, the conformance corpus's own shape. */
const CARRIER_FN_RETURN: PlantedTheta = {
  source: "project",
  stem: "b0277livefnreturn",
  text: promptTheta([`fn f(): ${HEAD} { 3 }`, "let v = f()", '"ok"']),
};

/** CARRIER 2: §Reproduction's `let-annot` column, the inert-annotation half. */
const CARRIER_LET_ANNOT: PlantedTheta = {
  source: "project",
  stem: "b0277liveletannot",
  text: promptTheta([`let a: ${HEAD} = 3`, '"ok"']),
};

/** The control: the same two captures with every constructor head applied. */
const CONTROL: PlantedTheta = {
  source: "project",
  stem: "b0277livecontrol",
  text: promptTheta([
    "schema QErr { message: string }",
    "fn step(): Result<integer, QErr> { Ok(263) }",
    "let xs: array<integer> = [514]",
    "let n = 263 + xs[0]",
    "@`What is ${n} plus 133? Answer with the number only.`?",
  ]),
};

/** The note-channel precondition: a parse fault that existed and fired before this change-set. */
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0277livenotechannel",
  text: promptTheta(["let P = 1", "@`hi`"]),
};

/** Every `theta-system-note` entry's text, read off the settled `SessionManager`. */
function systemNotesOf(handle: { sessionManager: { getEntries: () => unknown[] } }): string[] {
  const notes: string[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as { customType?: string; content?: unknown };
    if (e.customType !== "theta-system-note") continue;
    if (typeof e.content === "string") notes.push(e.content);
    else if (Array.isArray(e.content)) {
      for (const part of e.content) {
        const t = (part as { text?: string }).text;
        if (typeof t === "string") notes.push(t);
      }
    }
  }
  return notes;
}

describe("bug 0277 — an unapplied constructor head at the five filtered captures is refused at live production load and un-registers the theta", () => {
  it("un-registers both carriers and names the code and the head spelling on the theta-system-note channel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      CARRIER_FN_RETURN,
      CARRIER_LET_ANNOT,
      CONTROL,
      NOTE_CHANNEL,
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition, and simultaneously the over-broadness assertion: the
      // applied control must register before the refusal assertions mean
      // anything — otherwise an empty registered set would satisfy them
      // vacuously (no silent skipping).
      expect(
        handle.command("b0277livecontrol"),
        "bug-0277 precondition unmet AND scoping violated: the control theta, whose constructor " +
          "heads are applied at the two carriers' own captures, did not register — either " +
          "discovery regressed independent of bug 0277, or the refusal keys on the spelling " +
          "rather than on the zero-argument form and now refuses shipped source. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: both carriers must be ABSENT from the registered
      // set, read off the settled `ExtensionRunner`. They are asserted
      // separately so the failure names WHICH capture still withholds.
      expect(
        handle.command("b0277livefnreturn"),
        "bug-0277: a theta whose `fn` return type is the unapplied head `" + HEAD +
          "` registered — the `fn` return capture still renders its sink through the withheld " +
          "set. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command("b0277liveletannot"),
        "bug-0277: a theta whose `let` annotation is the unapplied head `" + HEAD +
          "` registered — the annotation lowers to the empty type and the binding's own check " +
          "is disabled with it. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0277: neither carrier's slash name may appear in the registered set",
      ).not.toContain("b0277livefnreturn");

      // Real observable 2: the note channel, read off the settled in-memory
      // `SessionManager` (deterministic; no dependence on event timing).
      const notes = systemNotesOf(handle);
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0277 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertion below could not witness " +
          "the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with the offending head the registered
      // *Message* interpolates.
      expect(
        joined,
        "bug-0277: no `theta-system-note` entry names `" + RESERVED_CODE + "` — the keyword " +
          "class computed for an unapplied head at the five filtered captures still reaches no " +
          "render, so no load diagnostic reaches the channel. Notes: " + JSON.stringify(notes),
      ).toContain(RESERVED_CODE);
      expect(
        joined,
        "bug-0277: the note channel names `" + RESERVED_CODE + "` but not the offending head `" +
          HEAD + "` the registered Message interpolates — the code on the channel is some other " +
          "refusal, not this bug's emission. Notes: " + JSON.stringify(notes),
      ).toContain(`'${HEAD}'`);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });

  it("leaves the applied control registered and able to drive a real turn", async () => {
    // The green direction. A refusal that also stopped the applied spelling
    // from driving would satisfy the cell above and still be wrong; this cell
    // drives the control end to end over a real turn, discriminated by an
    // arithmetic answer computed from a value the theta itself produced through
    // its `array<integer>`-annotated binding.
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([CONTROL]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0277livecontrol"),
        "bug-0277: the applied control did not register, so the legal spelling this report " +
          "promises to leave untouched is refused. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0277livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the `array<integer>`-annotated binding's element read never " +
          "reached the outbound render. userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 133`);
      expect(
        driven.text,
        "the live model reply for the control did not contain the deterministic sum. Reply: " +
          JSON.stringify(driven.text),
      ).toContain(SUM_ANSWER);
      expect(
        driven.systemNotes,
        "the driven turn over the control appended a theta-system-note (a fail-closed ending) " +
          "— the good path must drive clean. Notes: " + JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
