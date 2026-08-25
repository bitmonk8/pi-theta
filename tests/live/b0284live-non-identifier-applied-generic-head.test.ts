// Bug 0284 — a generic head that is NOT identifier-shaped (`a b<integer>`) is
// admitted at the `params:` right-hand side with no diagnostic at all, and the
// theta REGISTERS with the field lowered `{}`, standalone live registration
// cell
// (docs/bugs/0284-non-identifier-applied-generic-head-silent-at-five-captures.md).
// It mirrors in shape bug 0282's
// `b0282live-unknown-applied-generic-head-registration.test.ts`. Every fixture
// stem, theta filename and slash-name carries the literal `b0284live` prefix so
// the cell's identity is readable from the bug number alone and collides with
// no other cell's stem in the H8a sequence. No existing cell is renumbered or
// touched.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on an input that, before it,
// loaded with ZERO diagnostics and registered (§Reproduction's five-spelling
// `params:` table: "All five register", each with the field lowered `{}`).
// `lowerTypeExpr`'s generic-application arm (`src/parser/params.ts`) tests
// only where the `<` sits (line 770) and slices whatever precedes it as the
// head (line 772); §Fix routes a head that is in no `GENERIC_ARITY` entry, is
// no reserved spelling (bug 0281's gate, line 795) and is NOT identifier-shaped
// (bug 0282's gate, line 809, whose `IDENTIFIER.test(ctor)` conjunct is exactly
// what this class fails) onto `lowerCtx.unspellable` — the not-expression
// family's own sink, whose single existing write in that function sits in the
// ATOM catch-all at line 962, below `// Atom.` at line 881, which an applied
// spelling never reaches because the arm returns at line 878 first. An
// error-severity `theta/load/*` diagnostic denies registration
// (`hasLoadParseError`, `src/extension/production-composition.ts` line 3053,
// consulted at line 1570; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// THE §FIX SUB-CHOICE, adjudicated on the record to candidate (i): the gate
// pushes the HEAD TEXT (`a b`), not the whole application text. The head is
// brace-free by construction, so the shared decline
// `isUnspellableTextRefusable` (src/parser/params.ts lines 1825–1826) never
// declines it. That choice is discriminated OFFLINE, by the `a b<{x: integer}>`
// cell of the companion witness; this cell scopes the registration outcome
// alone.
//
// The code is BORROWED, not minted: `theta/load/params-type-not-expression` is
// an existing row (docs/spec_topics/diagnostics/code-registry-load.md line 20)
// which the BARE spelling of the same text (`p: 'a b'`) already draws at this
// very position, so the two spellings converge on one diagnostic. That row's
// *Trigger* owes a same-commit DIAG-2 widening naming the constructor-head
// position; this cell asserts the code by name and asserts no registry prose.
// The two heads the grammar does parameterise are named at
// docs/spec_topics/grammar.md lines 99–100 and the set is closed at line 107
// ("No other identifier is parameterisable"); `NamedType ::= Ident` (line 98)
// admits `a b` neither bare nor applied. No *Message* byte moves.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0284-non-identifier-applied-generic-head.test.ts`) settles inside one
// `parseThetaDocument` call over a source string and cannot reach discovery,
// registration, the note channel or a driven turn; this cell adds only that.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the control, after a real driven turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the OFFENDER must be ABSENT, the control PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/load/*` → its load cause,
//      `src/extension/production-composition.ts`; the note content is
//      `renderDiagnosticBatch([diagnostic])` and `renderDiagnosticLine` writes
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so the code AND
//      the offending FIELD NAME must appear by name on the real channel the
//      suite observes — the field name because the registered *Message*
//      interpolates it (`'params:' field '<param>' right-hand side is not a
//      theta type expression`), and reading it is what separates this
//      emission from any other theta's refusal carrying the same code.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `userTexts` and `text`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose heads are
//      the grammar's own able to drive a real turn end to end.
//
// THE OFFENDER is `b0284liveparams`, a `params:` right-hand side of
// `a b<integer>` — the position whose lowered schema constrains a BOUND
// ARGUMENT at invocation, so at HEAD the registered theta accepts any value at
// all for its field while the author believes it typed. It carries a resolvable
// `bind_model:` because a `params:`-declaring theta is not bypass-eligible:
// without one, `theta/load/binder-model-unresolved` denies its registration
// through the very same `hasLoadParseError` gate, with the head gate present or
// absent alike, and the absence assertion would witness nothing. A THIRD
// planted theta carries that identical shape with the closed set's `array` head
// at the same `params:` position and MUST register, so the offender's absence
// can never be produced by the fixture shape rather than by the head.
//
// Every stem here is all-lowercase because the composition root refuses a slash
// name that is not lowercase kebab/snake before a diagnostic of this bug's own
// can decide the theta's fate; a carrier with an uppercase letter in its stem
// would be absent from the registered set for that reason instead, and its
// absence assertion could not red.
//
// THE CONTROL is also the over-broadness tripwire: `array<T>` at a `params:`
// field and at a `let` annotation, and `Result<T, E>` at an `fn` return type,
// are the grammar's own two parameterised heads (grammar.md lines 99–100) and
// the committed corpus spells both, so a gate keyed on the presence of an
// argument list — or on anything other than the head's shape and membership —
// reds here rather than in the committed-fixture gate.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from its legally-annotated bindings, never a
// verbatim-echo demand and never a trailing "and nothing else". `n` is computed
// as 448 plus the `array<integer>`-annotated binding's element read (611), so
// the interpolated question also proves that applied head carried a real value
// into the prompt. The `Result`-returning declaration is deliberately left
// UNCALLED: the capture this cell scopes is the `fn` RETURN TYPE walk, which
// runs over the declaration whether or not it is called, and a top-level `?`
// propagation from it would add a runtime question this cell is not measuring.
// The pair (448, 611), their sum 1059 and the addend 952 — and so the answer
// 2011 — appear in no other cell of either suite, verified by a whole-of-
// `tests/` numeric sweep, so no cell's discriminator can satisfy another's
// assertion.
//
// SHAPE PRECONDITION, so the offender's absence can never pass vacuously:
// `b0284liveparamsshape` is asserted PRESENT before the absence assertion is
// read. It differs from the offender in one token.
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
// RED / GREEN (AGENTS.md "Verify both directions"): red without the
// non-identifier head gate for the right reason — the offender REGISTERS and no
// note names the code, because an applied spelling returns from the
// generic-application arm before ever reaching the atom arm where the
// not-expression sink is filled. Green under the fix. The green direction's own
// tripwire is the control, which must keep registering AND keep driving with
// its applied `array` and `Result` heads.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row an applied non-identifier head converges on at `params:`. */
const PARAMS_NOT_EXPR_CODE = "theta/load/params-type-not-expression";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The `params:` field name the registered *Message* interpolates; unique to this cell. */
const FIELD = "b0284p";
/** The non-identifier head the offender applies — two space-separated identifiers. */
const HEAD = "a b";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. The theta computes 448 + 611 = 1059, and the question
// adds 952. The control's source loads with ZERO diagnostics at HEAD and under
// the head gate alike, so a red on the control is the scoping, not the fixture.
const CONTROL_VALUE = "1059";
const SUM_ANSWER = "2011";

/**
 * The offender's fixture SHAPE, parameterised ONLY by the type written at the
 * `params:` right-hand side, so the offender and its registrability
 * precondition below differ in that one token and in nothing else.
 *
 * `bind_model:` is load-bearing, not decoration. A theta that declares `params:`
 * is not bypass-eligible (`classifyBinderBypass`,
 * `src/binder/binder-envelope.ts` line 204, consulted at
 * `src/extension/production-composition.ts` line 995), so its binder model must
 * resolve at LOAD from the `bind_model:` → `theta.binderModel` chain; when
 * neither resolves, `resolveBinderModel` (`src/binder/binder-model.ts` line 179)
 * raises
 * error-severity `theta/load/binder-model-unresolved` and the load walk drops
 * the theta — the SAME registration denial this cell attributes to the head
 * gate. Without a resolvable binder model the offender's absence assertion
 * would hold for that unrelated reason with the gate active AND with it
 * removed, witnessing nothing. The type below is the only variable that moves
 * the outcome.
 */
function paramsShapeTheta(typeText: string): string {
  return (
    [
      "---",
      "description: d",
      "mode: prompt",
      "bind_model: anthropic/claude-haiku-4-5",
      "params:",
      `  ${FIELD}: '${typeText}'`,
      "---",
      "",
      "let z = 1",
      '"ok"',
    ].join("\n") + "\n"
  );
}

/** THE OFFENDER: a `params:` right-hand side whose generic head is not identifier-shaped. */
const OFFENDER: PlantedTheta = {
  source: "project",
  stem: "b0284liveparams",
  text: paramsShapeTheta(`${HEAD}<integer>`),
};

/**
 * The offender's NON-VACUITY guard: its own fixture shape with the closed set's
 * `array` head at the same `params:` position. It must REGISTER, and if it does
 * not then the offender's absence above is being decided by the fixture shape
 * rather than by the head, so the absence assertion could not red under a
 * removed gate. It is a precondition, never a skip.
 */
const PARAMS_SHAPE_PRECONDITION: PlantedTheta = {
  source: "project",
  stem: "b0284liveparamsshape",
  text: paramsShapeTheta("array<integer>"),
};

/** The control: the grammar's own parameterised heads, at three captures, driving a real turn. */
const CONTROL: PlantedTheta = {
  source: "project",
  stem: "b0284livecontrol",
  text: promptTheta([
    "schema QErr { message: string }",
    "fn step(): Result<integer, QErr> { Ok(448) }",
    "let xs: array<integer> = [611]",
    "let n = 448 + xs[0]",
    "@`What is ${n} plus 952? Answer with the number only.`?",
  ]),
};

/** The note-channel precondition: a parse fault that existed and fired before this change-set. */
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0284livenotechannel",
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

describe("bug 0284 — a non-identifier applied generic head is refused at live production load", () => {
  it("un-registers the `params:` offender and names the code and the field on the theta-system-note channel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([
      OFFENDER,
      PARAMS_SHAPE_PRECONDITION,
      CONTROL,
      NOTE_CHANNEL,
    ]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition, and simultaneously the over-broadness assertion: the
      // closed-set control must register before the refusal assertion means
      // anything — otherwise an empty registered set would satisfy it
      // vacuously (no silent skipping).
      expect(
        handle.command("b0284livecontrol"),
        "bug-0284 precondition unmet AND scoping violated: the control theta, whose applied " +
          "heads are the closed set's own, did not register — either discovery regressed " +
          "independent of bug 0284, or the head gate keys on the argument list rather than on " +
          "the head's shape and membership and now refuses shipped source. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Precondition, the offender's non-vacuity guard: its own fixture shape —
      // same frontmatter keys, same `bind_model:`, same body, `array<integer>`
      // at the one varying position — must REGISTER. When it does not, the
      // offender's absence below is decided by the shape (an unresolvable
      // binder model denies registration through the same `hasLoadParseError`
      // gate) and could not red under a removed head gate.
      expect(
        handle.command("b0284liveparamsshape"),
        "bug-0284 precondition unmet: the offender's fixture shape carrying the closed set's " +
          "own `array<integer>` head did not register, so the absence assertion below is " +
          "vacuous — a `params:` theta is not bypass-eligible and its `bind_model:` chain must " +
          "resolve in this harness, or registration is denied for a reason that has nothing to " +
          "do with the applied head. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the offender must be ABSENT from the registered set,
      // read off the settled `ExtensionRunner`.
      expect(
        handle.command("b0284liveparams"),
        "bug-0284: a theta whose `params:` right-hand side is the applied head `" +
          HEAD + "<integer>` registered — the generic-application arm still pushes that head " +
          "onto no sink and lowers the field to `{}`, so the theta's bound argument is " +
          "constrained by nothing while the author believes it typed, and the same text " +
          "written bare (`" + HEAD + "`) refuses at this very position. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0284: the offender's slash name may not appear in the registered set",
      ).not.toContain("b0284liveparams");

      // Real observable 2: the note channel, read off the settled in-memory
      // `SessionManager` (deterministic; no dependence on event timing).
      const notes = systemNotesOf(handle);
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase diagnostics at all.
      expect(
        joined,
        "bug-0284 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertions below could not " +
          "witness the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with the field name the registered *Message*
      // interpolates.
      expect(
        joined,
        "bug-0284: no `theta-system-note` entry names `" + PARAMS_NOT_EXPR_CODE + "` — a " +
          "non-identifier applied head still reaches neither the not-expression sink nor the " +
          "unresolved-name sink, so no load diagnostic reaches the channel. Notes: " +
          JSON.stringify(notes),
      ).toContain(PARAMS_NOT_EXPR_CODE);
      expect(
        joined,
        "bug-0284: the note channel names `" + PARAMS_NOT_EXPR_CODE + "` but not the field `" +
          FIELD + "` the registered Message interpolates — the offender's refusal is missing " +
          "and the code on the channel is some other theta's. Notes: " + JSON.stringify(notes),
      ).toContain(`'${FIELD}'`);
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
        handle.command("b0284livecontrol"),
        "bug-0284: the applied closed-set control did not register, so the two heads the " +
          "grammar does parameterise are refused by a gate that owes them admission. " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0284livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the `array<integer>`-annotated binding's element read never " +
          "reached the outbound render. userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 952`);
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
