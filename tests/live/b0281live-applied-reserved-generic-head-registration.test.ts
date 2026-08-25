// Bug 0281 — an APPLIED `Ok<…>` / `Err<…>` spelling derives from no `Type`
// production at any arity, yet the type-application seam reads its head as an
// arbitrary constructor name, admits it at every type-reference capture and
// lowers the annotation to the empty type, standalone live registration cell
// (docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md).
// It mirrors in shape bug 0277's
// `b0277live-unapplied-generic-head-registration.test.ts`. Every fixture stem,
// theta filename and slash-name carries the literal `b0281live` prefix so the
// cell's identity is readable from the bug number alone and collides with no
// other cell's stem in the H8a sequence. No existing cell is renumbered or
// touched.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on inputs that, before it, loaded
// with ZERO diagnostics and registered (§Reproduction's 9 × 2 table, every
// `Ok<integer>` / `Err<string>` cell but the two `schema-alias` ones, measured
// "SILENT, reg=Y", and the inert table, whose seven rows load clean).
// `lowerTypeExpr`'s generic-application arm (`src/parser/params.ts`) splits the
// annotation text at its first `<` and reads the text before it as a
// constructor head; §Fix route (a), taken in its NARROW variant, judges that
// head there — a reserved spelling that is not one of the two constructor
// keywords of the closed `GENERIC_ARITY` set (`src/parser/type-grammar.ts`) is
// pushed onto the existing `reservedKeywords` sink, the sink all nine captures
// already render for the head's BARE spelling. An error-severity
// `theta/parse/*` diagnostic denies registration (`hasLoadParseError`,
// `src/extension/production-composition.ts`; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: `theta/parse/reserved-keyword-as-identifier`
// is an existing row (docs/spec_topics/diagnostics/code-registry-parse.md line
// 21) whose *Trigger* — "Reserved keyword used in an identifier position." —
// enumerates no position, and a constructor head is read where an `Ident` is
// read (`NamedType ::= Ident`, docs/spec_topics/grammar.md line 98). The two
// heads the grammar does parameterise are named at lines 99–100 and closed at
// line 107 ("No other identifier is parameterisable"). No *Message* byte moves
// under version 0.277.0. This cell asserts an EXISTING code by name on inputs
// that emitted nothing at all before the change-set.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`)
// settles inside one `parseThetaDocument` call over a source string and cannot
// reach discovery, registration, the note channel or a driven turn; this cell
// adds only that.
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
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so the code
//      AND each offending HEAD SPELLING must appear by name on the real channel
//      the suite observes — the spelling because the registered *Message*
//      interpolates it, and reading it is what separates this bug's emission
//      from any other refusal carrying the same code.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `text` and `userTexts`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose heads are
//      the grammar's own able to drive a real turn end to end.
//
// THE TWO CARRIERS sit at two different captures, because the nine captures are
// nine separate render sites of one sink: a route that reached only one would
// leave the other registered, and this cell reds naming which.
//   - `b0281liveletannot` — `let a: Ok<integer> = "not-an-integer"`, the
//     report's headline inert case. At HEAD it loads with ZERO diagnostics and
//     the annotation lowers to the empty type, so the binding's own check stops
//     firing and `theta/parse/let-rhs-type-mismatch` is silently suppressed:
//     the author writes an annotation and gets none.
//   - `b0281livefnreturn` — `fn f(): Err<string> { 3 }`, §Reproduction's
//     `fn-return` column at the other reserved spelling, so a route keyed on
//     one head or one capture reds here.
//
// Every stem here is all-lowercase because the composition root refuses a slash
// name that is not lowercase kebab/snake before a diagnostic of this bug's own
// can decide the theta's fate; a carrier with an uppercase letter in its stem
// would be absent from the registered set for that reason instead, and its
// absence assertion could not red.
//
// THE CONTROL is the APPLIED CLOSED SET, and it is also the over-broadness
// tripwire: `Result<T, E>` at an `fn` return and `array<T>` at a `let`
// annotation are the grammar's own two parameterised heads
// (docs/spec_topics/grammar.md lines 99–100) and the committed corpus spells
// both, so a gate that keyed on the presence of an argument list rather than on
// the head's membership in the closed set reds here rather than in the
// committed-fixture gate. The carriers' captures are the control's captures, so
// the contrast between refusal and admission is the head alone.
//
// The 0282-discharge branch is deliberately absent: an UNKNOWN applied head
// (`Nope<integer>`) still loads clean and registers under the narrow gate, and
// bug 0281 §Non-goals places that class outside this report's authority. This
// cell asserts nothing about it in either direction.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from the legally-annotated bindings, never a
// verbatim-echo demand and never a trailing "and nothing else". `n` is computed
// from the `array<integer>`-annotated binding's element read, so the
// interpolated question also proves that applied head carried a real value into
// the prompt. The `Result`-returning declaration is deliberately left UNCALLED:
// the capture this cell scopes is the `fn` RETURN TYPE walk, which runs over
// the declaration whether or not it is called, and a top-level `?` propagation
// from it would add a runtime question this cell is not measuring. The pair
// (469, 427) and the addend 592 appear in no other cell of either suite, so no
// cell's discriminator can satisfy another's assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a FOURTH planted theta carries an already-refused parse fault
// unrelated to this bug (`let P = 1` → `theta/parse/binding-case-mismatch`, bug
// 0139's, already live and untouched by this fix). Its code must appear on the
// note channel too. If it does not, the channel — not this bug — is the fault,
// and the cell reds naming that.
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
// RED / GREEN (AGENTS.md "Verify both directions"): red without the head gate
// for the right reason — both carriers register and no note names the code,
// because an applied spelling never reaches the atom arm where the sink is
// filled. Green under the fix. The green direction's own tripwire is the
// control, which must keep registering AND keep driving with its applied
// `Result` and `array` heads.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row an applied reserved head converges on, as its bare spelling does. */
const RESERVED_CODE = "theta/parse/reserved-keyword-as-identifier";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The two heads the carriers apply; the registered *Message* interpolates each. */
const HEAD_LET = "Ok";
const HEAD_FN = "Err";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. The theta computes 469 + 427 = 896, and the question
// adds 592. Measured offline: the control's source loads with ZERO diagnostics
// under the head gate, so a red on the control is the scoping, not the fixture.
const CONTROL_VALUE = "896";
const SUM_ANSWER = "1488";

/** CARRIER 1: the headline inert case — an annotation that silently constrains nothing. */
const CARRIER_LET_ANNOT: PlantedTheta = {
  source: "project",
  stem: "b0281liveletannot",
  text: promptTheta([`let a: ${HEAD_LET}<integer> = "not-an-integer"`, '"ok"']),
};

/** CARRIER 2: §Reproduction's `fn-return` column, at the other reserved spelling. */
const CARRIER_FN_RETURN: PlantedTheta = {
  source: "project",
  stem: "b0281livefnreturn",
  text: promptTheta([`fn f(): ${HEAD_FN}<string> { 3 }`, "let v = f()", '"ok"']),
};

/** The control: the carriers' two captures, with the closed set's own heads applied. */
const CONTROL: PlantedTheta = {
  source: "project",
  stem: "b0281livecontrol",
  text: promptTheta([
    "schema QErr { message: string }",
    "fn step(): Result<integer, QErr> { Ok(469) }",
    "let xs: array<integer> = [427]",
    "let n = 469 + xs[0]",
    "@`What is ${n} plus 592? Answer with the number only.`?",
  ]),
};

/** The note-channel precondition: a parse fault that existed and fired before this change-set. */
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0281livenotechannel",
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

describe("bug 0281 — an applied reserved head is refused at live production load and un-registers the theta", () => {
  it("un-registers both carriers and names the code and each head spelling on the theta-system-note channel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      CARRIER_LET_ANNOT,
      CARRIER_FN_RETURN,
      CONTROL,
      NOTE_CHANNEL,
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition, and simultaneously the over-broadness assertion: the
      // closed-set control must register before the refusal assertions mean
      // anything — otherwise an empty registered set would satisfy them
      // vacuously (no silent skipping).
      expect(
        handle.command("b0281livecontrol"),
        "bug-0281 precondition unmet AND scoping violated: the control theta, whose applied " +
          "heads are the closed set's own at the two carriers' captures, did not register — " +
          "either discovery regressed independent of bug 0281, or the head gate keys on the " +
          "argument list rather than on membership in the closed set and now refuses shipped " +
          "source. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: both carriers must be ABSENT from the registered
      // set, read off the settled `ExtensionRunner`. They are asserted
      // separately so the failure names WHICH capture still admits the head.
      expect(
        handle.command("b0281liveletannot"),
        "bug-0281: a theta whose `let` annotation is the applied head `" + HEAD_LET +
          "<integer>` registered — the generic-application arm still lowers that head to the " +
          "empty type, so the binding's own check stays disabled and a string initialiser " +
          "loads under an integer-shaped annotation. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command("b0281livefnreturn"),
        "bug-0281: a theta whose `fn` return type is the applied head `" + HEAD_FN +
          "<string>` registered — the `fn` return capture still admits a head no `GenericType` " +
          "production spells. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0281: neither carrier's slash name may appear in the registered set",
      ).not.toContain("b0281liveletannot");

      // Real observable 2: the note channel, read off the settled in-memory
      // `SessionManager` (deterministic; no dependence on event timing).
      const notes = systemNotesOf(handle);
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0281 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertions below could not " +
          "witness the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with each offending head the registered
      // *Message* interpolates.
      expect(
        joined,
        "bug-0281: no `theta-system-note` entry names `" + RESERVED_CODE + "` — an applied " +
          "reserved head still reaches no sink at either carrier's capture, so no load " +
          "diagnostic reaches the channel. Notes: " + JSON.stringify(notes),
      ).toContain(RESERVED_CODE);
      expect(
        joined,
        "bug-0281: the note channel names `" + RESERVED_CODE + "` but not the applied head `" +
          HEAD_LET + "` the registered Message interpolates — the `let` annotation carrier's " +
          "refusal is missing and the code on the channel is some other theta's. Notes: " +
          JSON.stringify(notes),
      ).toContain(`'${HEAD_LET}'`);
      expect(
        joined,
        "bug-0281: the note channel names `" + RESERVED_CODE + "` but not the applied head `" +
          HEAD_FN + "` the registered Message interpolates — the `fn` return carrier's refusal " +
          "is missing, so the gate reaches one capture and not the other. Notes: " +
          JSON.stringify(notes),
      ).toContain(`'${HEAD_FN}'`);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });

  it("leaves the applied closed set registered and able to drive a real turn", async () => {
    // The green direction. A refusal that also stopped the grammar's own
    // parameterised heads from driving would satisfy the cell above and still
    // be wrong; this cell drives the control end to end over a real turn,
    // discriminated by an arithmetic answer computed from a value the theta
    // itself produced through its `array<integer>`-annotated binding.
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([CONTROL]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0281livecontrol"),
        "bug-0281: the applied closed-set control did not register, so the two heads the " +
          "grammar does parameterise are refused by a gate that owes them admission. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0281livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the `array<integer>`-annotated binding's element read never " +
          "reached the outbound render. userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 592`);
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
