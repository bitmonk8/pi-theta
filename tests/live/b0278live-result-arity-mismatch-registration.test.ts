// Bug 0278 — a wrong-arity `Result` application written at the `@<T>` query
// annotation draws nothing and registers, standalone live registration cell
// (docs/bugs/0278-result-arity-mismatch-silent-at-query-response-annotation.md).
// It mirrors in shape bug 0274's
// `b0274live-reserved-keyword-type-head-registration.test.ts`. Every fixture
// stem, theta filename and slash-name carries the literal `b0278live` prefix so
// the cell's identity is readable from the bug number alone and collides with
// no other cell's stem in the H8a sequence. No existing cell is renumbered or
// touched.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on an input that, before it,
// loaded with ZERO diagnostics and registered (§Reproduction, the `@<T>`
// ascription column of the `Result<integer>` row, measured "SILENT, reg").
// `queryResponseAnnotation` (`src/parser/theta-document.ts`) peels a
// `Result<T, E>` application down to `T` and returns `undefined` for any
// argument count other than two; `walkExpr`'s `"query"` arm guards its entire
// annotation-interior check block on that value, so at a non-2 count the walk
// that computes the arity — `walkType`'s `"generic"` arm over `GENERIC_ARITY`,
// `src/parser/type-grammar.ts` — never sees the application. The fix runs the
// position-rule pass over the whole annotation, and an error-severity
// `theta/parse/*` diagnostic denies registration (`hasLoadParseError`,
// `src/extension/production-composition.ts`; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: `theta/parse/generic-arity-mismatch` is an
// existing row (docs/spec_topics/diagnostics/code-registry-parse.md line 65)
// whose *Trigger* names `Result<T>` as its own example and enumerates no
// position, so the query ascription entering its emission set makes the
// behaviour match the row as registered. No *Message* byte moves under version
// 0.273.0. This cell asserts an EXISTING code by name at a position that did not
// emit it before the change-set.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts`)
// settles inside one `parseThetaDocument` call and cannot reach discovery,
// registration, the note channel or a driven turn; this cell adds only that.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the control, after a real driven turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the OFFENDER must be ABSENT, the CONTROL PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/parse/*` → `lex-parse-type`,
//      `src/extension/production-composition.ts`; the note content is
//      `renderDiagnosticBatch([diagnostic])` and `renderDiagnosticLine` writes
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so both the
//      code and the WRITTEN ARGUMENT COUNT must appear by name on the real
//      channel the suite observes — the count because the registered *Message*
//      interpolates it, and reading it is what separates this bug's emission
//      from any other arity refusal in the same file.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `text` and `userTexts`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose `Result`
//      annotation is written at the declared arity able to drive a real turn
//      end to end.
//
// THE OFFENDER is §Reproduction's arity-1 row at the one position this report
// owns: `@<Result<integer>>` written as the author's own ascription. At HEAD it
// loads with zero diagnostics and registers, so a query whose annotation names
// a constructor at the wrong arity runs and validates its response against the
// permissive `{}` lowering (§Reproduction, `LOWER` rows; the `{}` posture is
// bug 0028's and is not this report's subject).
//
// THE CONTROL is the same shape at the DECLARED arity, and it is also the
// over-broadness tripwire the offline witness's group (C) locks. `Result` at
// arity 2 is legal in a type-ascription context (docs/spec_topics/grammar.md
// line 107), so a route that fired the arity row off the peel's own
// `splitTopLevel` count — or off any count other than `TypeParser`'s — would
// refuse legal source, and reds here rather than only in the conformance suite.
// The control's `E` argument is a declared schema rather than the builtin
// `QueryError`, so the cell also witnesses that the new pass names no declared
// error model as a fault.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes, never a verbatim-echo demand and never a
// narrative framing. The interpolated operand is computed by the theta itself,
// so the question also proves the legally-annotated query carried a real
// theta-computed value into the prompt. The pair (308, 291) is deliberately
// different from the pairs bug 0262's, bug 0271's and bug 0274's cells use, so
// no cell's discriminator can satisfy another's assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a THIRD planted theta carries an already-refused parse fault
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
// for the right reason — the offender registers and no note names the code,
// because the query capture's guard skips the only walk that computes the
// arity. Green under the fix. The green direction's own tripwire is the
// control, which must keep registering AND keep driving with its arity-2
// `Result` annotation.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row the `@<T>` capture must draw for a non-arity-2 application. */
const ARITY_CODE = "theta/parse/generic-arity-mismatch";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The written argument count the registered *Message* interpolates for the offender. */
const WRITTEN_COUNT = "got 1";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. The theta computes 100 + 208 = 308, and the question
// adds 291. Measured offline: the control's source loads with ZERO diagnostics
// at HEAD, so a red on the control is the scoping, not the fixture.
const CONTROL_VALUE = "308";
const SUM_ANSWER = "599";

/** The offender: §Reproduction's arity-1 row at the author-written ascription. */
const OFFENDER: PlantedTheta = {
  source: "project",
  stem: "b0278livearity1",
  text: promptTheta([
    "let r = @<Result<integer>>`What is 12 plus 30? Answer with the number only.`",
    "r",
  ]),
};

/** The control: the same constructor at its declared arity, with a declared error model. */
const CONTROL: PlantedTheta = {
  source: "project",
  stem: "b0278livecontrol",
  text: promptTheta([
    "schema SomeError { message: string }",
    "let base = 100 + 208",
    "let r = @<Result<integer, SomeError>>`What is ${base} plus 291? Answer with the number only.`?",
    "r",
  ]),
};

/** The note-channel precondition: a parse fault that existed and fired before this change-set. */
const NOTE_CHANNEL: PlantedTheta = {
  source: "project",
  stem: "b0278livenotechannel",
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

describe("bug 0278 — a wrong-arity `Result` at the `@<T>` query annotation is refused at live production load and un-registers the theta", () => {
  it("un-registers the arity-1 offender and names the code and the written count on the theta-system-note channel", async () => {
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([OFFENDER, CONTROL, NOTE_CHANNEL]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition, and simultaneously the over-broadness assertion: the
      // arity-2 control must register before the refusal assertion means
      // anything — otherwise an empty registered set would satisfy it
      // vacuously (no silent skipping).
      expect(
        handle.command("b0278livecontrol"),
        "bug-0278 precondition unmet AND scoping violated: the control theta, whose `@<T>` " +
          "annotation writes `Result` at its declared arity of two, did not register — either " +
          "discovery regressed independent of bug 0278, or the new arity pass counts arguments " +
          "by a route that refuses legal source. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the offender must be ABSENT from the registered set,
      // read off the settled `ExtensionRunner`.
      expect(
        handle.command("b0278livearity1"),
        "bug-0278: a theta whose `@<T>` query annotation applies `Result` to ONE type argument " +
          "registered — `queryResponseAnnotation` declines the non-2 count and the caller's " +
          "guard skips the only walk that computes the arity, so the annotation is never " +
          "judged. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0278: the offender's slash name may not appear in the registered set",
      ).not.toContain("b0278livearity1");

      // Real observable 2: the note channel, read off the settled in-memory
      // `SessionManager` (deterministic; no dependence on event timing).
      const notes = systemNotesOf(handle);
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0278 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertion below could not witness " +
          "the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with the written argument count the registered
      // *Message* interpolates.
      expect(
        joined,
        "bug-0278: no `theta-system-note` entry names `" + ARITY_CODE + "` — the wrong-arity " +
          "application at the `@<T>` ascription still reaches no type walk, so no load " +
          "diagnostic reaches the channel. Notes: " + JSON.stringify(notes),
      ).toContain(ARITY_CODE);
      expect(
        joined,
        "bug-0278: the note channel names `" + ARITY_CODE + "` but not the written argument " +
          "count `" + WRITTEN_COUNT + "` the registered Message interpolates — the code on the " +
          "channel is some other arity refusal, not this bug's emission. Notes: " +
          JSON.stringify(notes),
      ).toContain(WRITTEN_COUNT);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });

  it("leaves the arity-2 control registered and able to drive a real turn", async () => {
    // The green direction. A refusal that also stopped the legal spelling from
    // driving would satisfy the cell above and still be wrong; this cell drives
    // the control end to end over a real turn, discriminated by an arithmetic
    // answer computed from a value the theta itself produced.
    const provider = await requireLiveProvider();
    const workspace = plantThetaWorkspace([CONTROL]);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command("b0278livecontrol"),
        "bug-0278: the arity-2 control did not register, so the legal spelling this report " +
          "promises to leave untouched is refused. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const driven = await driveSlashCaptureTurn(handle, "/b0278livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the arity-2 annotated query never carried a real value into the " +
          "prompt. userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 291`);
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
