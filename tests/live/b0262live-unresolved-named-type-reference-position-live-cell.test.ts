// Bug 0262 — an unresolvable `NamedType` head at a `let` annotation, standalone
// live registration cell. It mirrors in shape bug 0046's
// `b0046live-by-clause-undecided-inputs-live-cell.test.ts`. Every fixture stem,
// theta filename and slash-name carries the literal `b0262live` prefix so the
// cell's identity is readable from the bug number alone and collides with no
// other cell's stem in the H8a sequence.
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION, and
// the fix changes a REGISTRATION OUTCOME on an input that, BEFORE this
// change-set, loaded with ZERO diagnostics
// (docs/bugs/0262-unresolved-named-type-silent-at-nine-reference-positions.md
// §Reproduction row r1): `walkStatement`'s `"let"` case read the annotation
// source, ran `parseTypeExpression` plus
// `annotationSourceIsNotTypeExpression`, and called
// `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts`) nowhere —
// so `let a: Nope = 3` named nothing, drew nothing, and the theta registered
// and ran. The fix routes that capture's names through the same helper the
// seven already-emitting captures use, running it at
// src/parser/theta-document.ts line 8091 beside that capture's own annotation
// read at line 8052, so the position refuses with `theta/parse/unresolved-named-type`, and
// an error-severity `theta/parse/*` diagnostic denies registration
// (`hasLoadParseError`, `src/extension/production-composition.ts`; the GOV-15
// loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: docs/spec_topics/diagnostics/code-registry-parse.md
// line 112 already states the trigger as "A `NamedType` that resolves to no
// declaration usable at the position it is written" and closes the position
// list to seven captures; the widening is that row's *Trigger* edit under
// DIAG-2 (docs/spec_topics/diagnostics/diagnostic-shape.md line 72) with the
// *Message* bytes unchanged. So this cell asserts the EXISTING code by name at
// a position that did not emit it before this change-set.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bug 0046's live cell uses. The offline whole-list witness for the same fix
// (`tests/b0262-unresolved-named-type-reference-positions.test.ts`) settles
// inside one `parseThetaDocument` call and cannot reach discovery, registration,
// the note channel or a driven turn; this cell adds only that.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the byte-neighbour control, after a real
// driven turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the CARRIER must be ABSENT, the byte-neighbour
//      control PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/parse/*` → `lex-parse-type`,
//      `src/extension/production-composition.ts`; the note content is
//      `renderDiagnosticBatch([diagnostic])`, and `renderDiagnosticLine` writes
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so the code
//      must appear by name on the real channel the suite observes.
//   3. For the byte-neighbour control ONLY: `driveSlashCaptureTurn`'s `text` and
//      `userTexts` off the settled `SessionManager` after a real driven turn —
//      the refusal must not merely flip a boolean, it must leave a theta whose
//      annotation head DOES resolve able to drive a real turn end to end.
//
// THE BYTE-NEIGHBOUR CONTROL is the carrier's own source with the head
// DECLARED: `schema Nope { a: number }` added, and the initialiser made
// type-correct (`Nope { a: 3 }`) so the recovered check the bug document's
// "What the silence suppresses" table records —
// `theta/parse/let-rhs-type-mismatch` for `let a: Nope = 3` with `Nope`
// declared — has nothing to refuse. It is the tripwire on the green direction:
// a route that refused a head it should resolve, or that kept refusing after
// resolution, reds there instead.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from the annotated binding, never a
// verbatim-echo demand and never a narrative framing. `n` is `a.a * 111` = 333,
// so the interpolated question also proves the annotated binding's own field
// read reached the prompt. The pair is deliberately different from bug 0046's
// and bug 0259's cells' pairs, so no cell's sentinel can satisfy another's
// assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a THIRD planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, already
// live and untouched by this fix). Its code must appear on the note channel too. If
// it does not, the channel — not this bug — is the fault, and the cell reds
// naming that.
//
// Subagent child-process launch: NOT reached. The control drives one plain
// interpolated query with no tool invocation, so no query-time tool-call loop
// and no RFC-0006 subagent-child spawn occurs. `tests/live/harness.ts` carries
// the `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, but this cell does not exercise that path.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red BEFORE this change-set
// for the right reason — the carrier registered and no note named the code,
// because the `let` annotation capture ran no name-resolution pass. Green
// under the fix.
// The green direction's own tripwire is the byte-neighbour control, which must
// keep registering AND keep driving.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row the widening emits at the `let` annotation capture. */
const UNRESOLVED_CODE = "theta/parse/unresolved-named-type";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. A verbatim-echo demand reads as prompt injection to
// current models and draws refusals (bug 0243); this is a natural arithmetic
// question instead. 333 plus 484.
const SUM_ANSWER = "817";

describe("bug 0262 — an unresolvable named-type head at a `let` annotation is refused at live production load and un-registers the theta", () => {
  it("un-registers the carrier and names the code on the theta-system-note channel, while the byte-neighbour control whose head IS declared registers and drives a real turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The CARRIER: the bug document's §Reproduction row r1 fixture at the
      // PascalCase spelling. `Nope` is declared by no statement and imported
      // from no `.thetalib`, so the annotation resolves to nothing — and at
      // HEAD draws nothing, registers, and silently disables the type layer at
      // that binding (`resolveNamed` answers `undefined`,
      // `src/parser/type-compat.ts`, so `decide`'s `named` arms answer
      // "unknown").
      {
        source: "project",
        stem: "b0262livecarrier",
        text: promptTheta([
          "let a: Nope = 3",
          "@`What is 121 plus 106? Answer with the number only.`?",
        ]),
      },
      // The BYTE-NEIGHBOUR CONTROL: the same annotation head, DECLARED. The
      // initialiser is type-correct, so the check the silence suppresses
      // (`theta/parse/let-rhs-type-mismatch`) has nothing to refuse and the
      // theta must register and drive both before and after the fix.
      {
        source: "project",
        stem: "b0262liveneighbour",
        text: promptTheta([
          "schema Nope { a: number }",
          "let a: Nope = Nope { a: 3 }",
          "let n = a.a * 111",
          "@`What is ${n} plus 484? Answer with the number only.`?",
        ]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code existed and fired before this change-set. Its note proves the
      // channel carries load-phase parse codes at all, so a carrier missing
      // its code would be attributable to this bug rather than to an unwired
      // channel.
      {
        source: "project",
        stem: "b0262livenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition 1: the byte-neighbour control must register before the
      // refusal assertion means anything — otherwise an empty registered set
      // would satisfy it vacuously (no silent skipping).
      expect(
        handle.command("b0262liveneighbour"),
        "bug-0262 precondition unmet: the byte-neighbour control whose annotation head IS " +
          "declared did not register — discovery or registration regressed independent of " +
          "bug 0262. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the carrier must be ABSENT from the registered set,
      // read off the settled `ExtensionRunner`.
      expect(
        handle.command("b0262livecarrier"),
        "bug-0262: a theta whose `let` annotation names an undeclared, unimported type " +
          "registered — the refusal (`" + UNRESOLVED_CODE + "`) did not fire at the `let` " +
          "annotation capture, so the annotation still loads clean and still turns off the " +
          "type layer at that binding. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0262: the carrier's slash name must not appear in the registered set",
      ).not.toContain("b0262livecarrier");

      // Real observable 2: the note channel. `theta-system-note` entries are
      // read off the settled in-memory `SessionManager` (deterministic; no
      // dependence on event timing), exactly as `driveSlashCaptureTurn`'s
      // `systemNotes` channel does for driven turns.
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
      const joined = notes.join("\n");

      // Precondition 2: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0262 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertion below could not witness " +
          "the widened code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes.
      expect(
        joined,
        "bug-0262: no `theta-system-note` entry names `" + UNRESOLVED_CODE + "` for the " +
          "carrier — the widened Trigger's emission did not reach the load-diagnostic channel " +
          "from the `let` annotation capture. Notes: " + JSON.stringify(notes),
      ).toContain(UNRESOLVED_CODE);

      // "still drives": one real live turn over the byte-neighbour control,
      // proving the refusal leaves a resolving annotation head able to complete
      // a real turn — never asserted on `prompt()` merely resolving.
      // `driven.text` is the streamed assistant reply (stochastic beyond the
      // pinned sentinel); `driven.userTexts` is the deterministic
      // outbound-render channel, read off the settled `SessionManager`.
      const driven = await driveSlashCaptureTurn(handle, "/b0262liveneighbour");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          "333 — the annotated binding's field read never reached the outbound render. " +
          "userTexts: " + JSON.stringify(driven.userTexts),
      ).toContain("333 plus 484");
      expect(
        driven.text,
        "the live model reply for the byte-neighbour control did not contain the deterministic " +
          "sum. Reply: " + JSON.stringify(driven.text),
      ).toContain(SUM_ANSWER);
      expect(
        driven.systemNotes,
        "the driven turn over the byte-neighbour control appended a theta-system-note (a " +
          "fail-closed ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
