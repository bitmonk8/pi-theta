// Bug 0282 — an UNKNOWN identifier written as a generic head (`Nope<integer>`,
// `Ghost<string>`) derives from no `Type` production, yet the type-application
// seam reads it as an arbitrary constructor name, admits it at every
// type-reference position and lowers the annotation to the empty type,
// standalone live registration cell
// (docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md).
// It mirrors in shape bug 0281's
// `b0281live-applied-reserved-generic-head-registration.test.ts`. Every fixture
// stem, theta filename and slash-name carries the literal `b0282live` prefix so
// the cell's identity is readable from the bug number alone and collides with
// no other cell's stem in the H8a sequence. No existing cell is renumbered or
// touched.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on inputs that, before it, loaded
// with ZERO diagnostics and registered (§Reproduction's 9 × 2 table, all
// eighteen cells measured "SILENT, reg=Y", and the inert table, whose rows load
// clean). `lowerTypeExpr`'s generic-application arm (`src/parser/params.ts`)
// splits the annotation text at its first `<` (line 770) and reads the text
// before it as a constructor head; §Fix route (a), taken at CLOSED-SET width,
// judges that head there — an identifier-shaped head that is not in
// `GENERIC_ARITY` (`src/parser/type-grammar.ts`) routes onto the existing
// `lowerCtx.unresolved` sink and lowers no further, instead of falling through
// to the permissive catch-all whose `return {}` stands at line 826. That sink
// is the one bug 0262's fix already renders at ten reference positions for the
// head's BARE spelling. An error-severity `theta/parse/*` diagnostic denies
// registration (`hasLoadParseError`, `src/extension/production-composition.ts`
// line 3053, consulted at line 1570; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: `theta/parse/unresolved-named-type` is an
// existing row (docs/spec_topics/diagnostics/code-registry-parse.md line 112)
// which the BARE spelling of the same identifier already draws at every one of
// these positions, so the two spellings converge on one diagnostic. That row's
// *Trigger* as registered is scoped to a `NamedType` and to arguments nested
// inside one, so a same-commit DIAG-2 widening naming the constructor-HEAD
// position is owed by the implementer; this cell asserts the code by name and
// asserts no registry prose. The two heads the grammar does parameterise are
// named at docs/spec_topics/grammar.md lines 99–100 and the set is closed at
// line 107 ("No other identifier is parameterisable"); `NamedType ::= Ident`
// (line 98) admits `Nope` bare and admits nothing with an angle list after it.
// No *Message* byte moves under version 0.280.0. This cell asserts an EXISTING
// code by name on inputs that emitted nothing at all before the change-set.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts`)
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
//      interpolates it (`unresolved named type '<name>'`), and reading it is
//      what separates this bug's emission from any other refusal carrying the
//      same code, including the one a BARE name draws.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `text` and `userTexts`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose heads are
//      the grammar's own able to drive a real turn end to end.
//
// THE TWO CARRIERS sit at two different positions, because the nine positions
// are nine separate render sites of one sink: a route that reached only one
// would leave the other registered, and this cell reds naming which. They also
// carry two different heads, so a route keyed on one spelling reds.
//   - `b0282liveparams` — a `params:` right-hand side of `Nope<integer>`. This
//     is the position whose lowered schema constrains a BOUND ARGUMENT at
//     invocation, so at HEAD the registered theta accepts any value at all for
//     `p` while the author believes it typed. It is also the position furthest
//     from the body walk: it builds its diagnostic through the frontmatter
//     load path rather than the shared body builder, so a fix that reached
//     only the body captures reds here. It carries a resolvable `bind_model:`
//     because a `params:`-declaring theta is not bypass-eligible: without one,
//     `theta/load/binder-model-unresolved` denies its registration through the
//     very same `hasLoadParseError` gate, with the head gate present or absent
//     alike, and the absence assertion would witness nothing. A FIFTH planted
//     theta carries that identical shape with the closed set's `array` head at
//     the same `params:` position and MUST register, so the carrier's absence
//     can never again be produced by the fixture shape rather than by the head.
//   - `b0282liveletannot` — `let a: Ghost<string> = "mismatch"`, the report's
//     constraint-dropping headline at the other head. At HEAD it loads with
//     ZERO diagnostics and the annotation lowers to the empty type, so the
//     binding's own check stops firing and `theta/parse/let-rhs-type-mismatch`
//     is silently suppressed: the author writes an annotation and gets none.
//
// Every stem here is all-lowercase because the composition root refuses a slash
// name that is not lowercase kebab/snake before a diagnostic of this bug's own
// can decide the theta's fate; a carrier with an uppercase letter in its stem
// would be absent from the registered set for that reason instead, and its
// absence assertion could not red.
//
// THE CONTROL is the APPLIED CLOSED SET, and it is also the over-broadness
// tripwire: `Result<T, E>` at an `fn` return and `array<T>` at a `let`
// annotation are the grammar's own two parameterised heads (grammar.md lines
// 99–100) and the committed corpus spells both, so a gate keyed on the presence
// of an argument list rather than on the head's membership in the closed set
// reds here rather than in the committed-fixture gate. The control's `QErr`
// declaration is a DECLARED name used as a `Result` argument — the shape that
// separates a membership gate on the HEAD from one that also moved a
// `NamedType` verdict underneath it (bug 0282 §Non-goals: bug 0262's landed
// bare-name rule is not reopened).
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from the legally-annotated bindings, never a
// verbatim-echo demand and never a trailing "and nothing else". `n` is computed
// from the `array<integer>`-annotated binding's element read, so the
// interpolated question also proves that applied head carried a real value into
// the prompt. The `Result`-returning declaration is deliberately left UNCALLED:
// the position this cell scopes is the `fn` RETURN TYPE walk, which runs over
// the declaration whether or not it is called, and a top-level `?` propagation
// from it would add a runtime question this cell is not measuring. The pair
// (313, 344), their sum 657 and the addend 360 — and so the answer 1017 —
// appear in no other cell of either suite, verified by a whole-of-`tests/`
// numeric sweep, so no cell's discriminator can satisfy another's assertion.
//
// SHAPE PRECONDITION, so the `params:` carrier's absence can never pass
// vacuously: `b0282liveparamsshape` above is asserted PRESENT before either
// absence assertion is read. It differs from the carrier in one token.
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
// RED / GREEN (AGENTS.md "Verify both directions"): red without the closed-set
// head gate for the right reason — both carriers register and no note names the
// code, because an applied spelling never reaches the atom arm where the sink
// is filled. Green under the fix. The green direction's own tripwire is the
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

/** The registered row an applied unknown head converges on, as its bare spelling does. */
const UNRESOLVED_CODE = "theta/parse/unresolved-named-type";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The two heads the carriers apply; the registered *Message* interpolates each. */
const HEAD_PARAMS = "Nope";
const HEAD_LET = "Ghost";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. The theta computes 313 + 344 = 657, and the question
// adds 360. Measured offline: the control's source loads with ZERO diagnostics
// at HEAD and under the head gate alike, so a red on the control is the
// scoping, not the fixture.
const CONTROL_VALUE = "657";
const SUM_ANSWER = "1017";

/**
 * The `params:` carrier's fixture SHAPE, parameterised ONLY by the head written
 * at the `params:` right-hand side, so the carrier and its registrability
 * precondition below differ in that one token and in nothing else.
 *
 * `bind_model:` is load-bearing, not decoration. A theta that declares `params:`
 * is not bypass-eligible (`classifyBinderBypass`,
 * `src/extension/production-composition.ts` line 994), so its binder model must
 * resolve at LOAD from the `bind_model:` → `theta.binderModel` chain; when
 * neither resolves, `resolveBinderModel` (`src/binder/binder-model.ts`) raises
 * error-severity `theta/load/binder-model-unresolved` and the load walk drops the
 * theta at line 1034 — the SAME registration denial this cell attributes to the
 * head gate. Without a resolvable binder model the carrier's absence assertion
 * would hold for that unrelated reason with the gate active AND with it removed,
 * witnessing nothing. Measured offline over the shipped composition root: the
 * head below is the only variable that moves the outcome.
 */
function paramsShapeTheta(head: string): string {
  return [
    "---",
    "description: d",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${head}'`,
    "---",
    "",
    "let z = 1",
    '"ok"',
  ].join("\n") + "\n";
}

/** CARRIER 1: the `params:` right-hand side, whose lowered schema binds an argument. */
const CARRIER_PARAMS: PlantedTheta = {
  source: "project",
  stem: "b0282liveparams",
  text: paramsShapeTheta(`${HEAD_PARAMS}<integer>`),
};

/**
 * The `params:` carrier's NON-VACUITY guard: the carrier's own fixture shape
 * with the closed set's `array` head at the same `params:` position. It must
 * REGISTER, and if it does not then the carrier's absence above is being decided
 * by the fixture shape rather than by the head, so the absence assertion could
 * not red under a removed gate. It is a precondition, never a skip.
 */
const PARAMS_SHAPE_PRECONDITION: PlantedTheta = {
  source: "project",
  stem: "b0282liveparamsshape",
  text: paramsShapeTheta("array<integer>"),
};

/** CARRIER 2: the constraint-dropping headline, at the other unknown head. */
const CARRIER_LET_ANNOT: PlantedTheta = {
  source: "project",
  stem: "b0282liveletannot",
  text: promptTheta([`let a: ${HEAD_LET}<string> = "mismatch"`, '"ok"']),
};

/** The control: the carriers' two positions, with the closed set's own heads applied. */
const CONTROL: PlantedTheta = {
  source: "project",
  stem: "b0282livecontrol",
  text: promptTheta([
    "schema QErr { message: string }",
    "fn step(): Result<integer, QErr> { Ok(313) }",
    "let xs: array<integer> = [344]",
    "let n = 313 + xs[0]",
    "@`What is ${n} plus 360? Answer with the number only.`?",
  ]),
};

/** The note-channel precondition: a parse fault that existed and fired before this change-set. */
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0282livenotechannel",
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

describe("bug 0282 — an applied unknown head is refused at live production load and un-registers the theta", () => {
  it("un-registers both carriers and names the code and each head spelling on the theta-system-note channel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      CARRIER_PARAMS,
      PARAMS_SHAPE_PRECONDITION,
      CARRIER_LET_ANNOT,
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
        handle.command("b0282livecontrol"),
        "bug-0282 precondition unmet AND scoping violated: the control theta, whose applied " +
          "heads are the closed set's own at the two carriers' positions, did not register — " +
          "either discovery regressed independent of bug 0282, or the head gate keys on the " +
          "argument list rather than on membership in `GENERIC_ARITY` and now refuses shipped " +
          "source. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Precondition, the `params:` carrier's non-vacuity guard: the carrier's
      // own fixture shape — same frontmatter keys, same `bind_model:`, same
      // body, `array<integer>` at the one varying position — must REGISTER.
      // When it does not, the carrier's absence below is decided by the shape
      // (an unresolvable binder model denies registration through the same
      // `hasLoadParseError` gate) and could not red under a removed head gate.
      expect(
        handle.command("b0282liveparamsshape"),
        "bug-0282 precondition unmet: the `params:` carrier's fixture shape carrying the " +
          "closed set's own `array<integer>` head did not register, so the carrier's absence " +
          "assertion below is vacuous — a `params:` theta is not bypass-eligible and its " +
          "`bind_model:` chain must resolve in this harness, or registration is denied for a " +
          "reason that has nothing to do with the applied head. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: both carriers must be ABSENT from the registered
      // set, read off the settled `ExtensionRunner`. They are asserted
      // separately so the failure names WHICH position still admits the head.
      expect(
        handle.command("b0282liveparams"),
        "bug-0282: a theta whose `params:` right-hand side is the applied head `" +
          HEAD_PARAMS + "<integer>` registered — the generic-application arm still lowers that " +
          "head to the empty type, so the theta's bound argument is constrained by nothing " +
          "while the author believes it typed. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command("b0282liveletannot"),
        "bug-0282: a theta whose `let` annotation is the applied head `" + HEAD_LET +
          "<string>` registered — the binding's own check stays disabled and a mismatched " +
          "initialiser loads under an annotation that derives from no `Type` production. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0282: neither carrier's slash name may appear in the registered set",
      ).not.toContain("b0282liveparams");

      // Real observable 2: the note channel, read off the settled in-memory
      // `SessionManager` (deterministic; no dependence on event timing).
      const notes = systemNotesOf(handle);
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0282 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertions below could not " +
          "witness the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with each offending head the registered
      // *Message* interpolates.
      expect(
        joined,
        "bug-0282: no `theta-system-note` entry names `" + UNRESOLVED_CODE + "` — an applied " +
          "unknown head still reaches no sink at either carrier's position, so no load " +
          "diagnostic reaches the channel. Notes: " + JSON.stringify(notes),
      ).toContain(UNRESOLVED_CODE);
      expect(
        joined,
        "bug-0282: the note channel names `" + UNRESOLVED_CODE + "` but not the applied head `" +
          HEAD_PARAMS + "` the registered Message interpolates — the `params:` carrier's " +
          "refusal is missing and the code on the channel is some other theta's. Notes: " +
          JSON.stringify(notes),
      ).toContain(`'${HEAD_PARAMS}'`);
      expect(
        joined,
        "bug-0282: the note channel names `" + UNRESOLVED_CODE + "` but not the applied head `" +
          HEAD_LET + "` the registered Message interpolates — the `let` annotation carrier's " +
          "refusal is missing, so the gate reaches one position and not the other. Notes: " +
          JSON.stringify(notes),
      ).toContain(`'${HEAD_LET}'`);
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
        handle.command("b0282livecontrol"),
        "bug-0282: the applied closed-set control did not register, so the two heads the " +
          "grammar does parameterise are refused by a gate that owes them admission. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0282livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the `array<integer>`-annotated binding's element read never " +
          "reached the outbound render. userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 360`);
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
