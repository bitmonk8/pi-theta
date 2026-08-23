// Bug 0259 — unclosed `enum` variant list, standalone live registration cell
// (the bug 0245 `schema-body-unclosed-at-eof-live-cell.test.ts` precedent this
// file mirrors in shape, which itself mirrors bug 0151's `fn` cell). Every
// fixture stem and slash-name carries the literal `b0259live` prefix so the
// cell's identity is readable from the bug number alone and collides with no
// other cell's stem in the H8a sequence.
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: an
// `enum` declaration whose variant list is never closed by `}` must now be
// REFUSED at parse under the newly minted registered row
// `theta/parse/enum-body-unclosed` (Sev E, phase parse, ranged on the body's
// opening `{`), and an error-severity `theta/parse/*` diagnostic denies
// registration (`hasLoadParseError`,
// src/extension/production-composition.ts) — where at HEAD (pre-fix)
// `parseEnumVariants`' variant loop (src/parser/theta-document.ts) is bounded
// by `while (!this.atEnd() && depth > 0)` and leaves through the `atEnd()`
// conjunct with nothing pushed, so `enum E { A,` at EOF loaded with ZERO
// diagnostics, recorded the captured variant prefix as the whole declaration,
// lowered `E` to `{"type":"string","enum":["A"]}` and REGISTERED
// (docs/bugs/0259-unclosed-enum-variant-list-at-eof-loads-clean.md
// §Reproduction "The subject").
//
// The row is MINTED rather than widened from bug 0245's
// `theta/parse/schema-body-unclosed`: that row's *Trigger* fences the `enum`
// variant list out by name and its *Message* names a schema object body, and a
// *Message* reword is a DIAG-4 change deferred to theta 2.0
// (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4;
// docs/spec_topics/governance/source-language-stability.md §Diagnostic-registry
// carve-out). So this cell asserts the NEW code by name, and would not be
// satisfied by the `schema` row appearing on the channel.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bugs 0151 and 0245 use for their live cells. This is the LOAD/REGISTRATION
// surface the bug document names as having no coverage today (its §Affected
// records "Test coverage of this defect: none"): a truncated theta no longer
// registers.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the closed twin, after a real driven
// turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the unclosed-list theta must be ABSENT, the
//      closed-list sibling PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router
//      (`preEvalCauseOf` maps `theta/parse/*` → `lex-parse-type`,
//      src/extension/production-composition.ts; the note content is
//      `renderDiagnosticBatch([diagnostic])`, and `renderDiagnosticLine`
//      writes the CODE into the line, src/diagnostics/diagnostic.ts), so the
//      new code must appear by name on the real channel the suite observes.
//   3. For the closed twin ONLY: `driveSlashCaptureTurn`'s `text` and
//      `userTexts` off the settled `SessionManager` after a real driven turn —
//      the registration fix must not merely flip a boolean, it must leave the
//      ordinary registered path able to drive a real live turn end to end.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic
// question whose answer is computable only from the inline value, never a
// verbatim-echo demand and never a narrative framing a value as unseen tool or
// probe output. The pair is deliberately different from bug 0245's cell's, so
// neither cell's sentinel can satisfy the other's assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a THIRD planted theta carries an already-refused parse
// fault (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, live
// at HEAD and untouched by this fix). Its code must appear on the note
// channel too. If it does not, the channel — not this bug — is the fault, and
// the cell reds naming that.
//
// Subagent child-process launch: NOT reached. The closed-twin theta drives one
// plain arithmetic query with no tool invocation, so no query-time tool-call
// loop and no RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, but this cell does not exercise that path.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD for the right
// reason — the unclosed-list theta registers and no note names the new code,
// because the code does not exist yet. Green once the fix lands: the theta is
// refused and the note channel carries the code. The green direction's own
// tripwire is the closed-list control, which must keep registering AND keep
// driving — a route that reported on a variant list that IS closed would red
// there instead.
//
// The offline whole-list witness for the same fix is the sibling
// `tests/enum-body-unclosed-at-eof.test.ts` (28 rows, ordered whole-list
// equality over the unfiltered diagnostics); this cell adds only what an
// offline parse cannot reach: the real discovery → registration →
// note-channel → driven-turn path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The new row bug 0259's fix mints under DIAG-2. */
const ENUM_UNCLOSED_CODE = "theta/parse/enum-body-unclosed";
/** Bug 0139's row — live at HEAD, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

// Drive discriminators are ANSWERS to task questions over an inline value —
// deterministic content a degraded plain-prompt run cannot produce by
// coincidence. A verbatim-echo demand ("reply with exactly this") reads as
// prompt injection to current models and draws refusals (bug 0243); this is a
// natural arithmetic question instead. The pair differs from bug 0245's cell's
// (263 + 514) so the two cells' sentinels cannot be confused.
const SUM_ANSWER = "931";

describe("bug 0259 — an unclosed `enum` variant list is refused at live production load and un-registers the theta", () => {
  it("un-registers the unclosed-variant-list theta and names the new code on the theta-system-note channel, while the closed sibling registers and drives a real turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: the variant list is opened, one variant is captured,
      // and the source ends before the `}`. Pre-fix this registered with zero
      // diagnostics (bug 0259 §Reproduction "The subject", measured). No
      // trailing statement follows the declaration — the truncation must reach
      // LITERAL EOF for the fixed `atEnd()` exit to be the one taken, since a
      // body with tokens still following absorbs them as variant material
      // instead (bug 0259 §Non-goals, "The unbalanced enum body that consumes
      // the file remainder").
      {
        source: "project",
        stem: "b0259livetrunc",
        text: promptTheta(["enum E { A,"]),
      },
      // The control: the SAME declaration with the `}` present, plus a real
      // task-framed query so the registered-path drive is proven end to end
      // (bug 0259 §Fix constraint 5: nothing else moves — the closed-body path
      // stays byte-identical).
      {
        source: "project",
        stem: "b0259liveclosed",
        text: promptTheta([
          "enum E { A }",
          "@`What is 408 plus 523? Answer with the number only.`?",
        ]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code exists at HEAD. Its note proves the channel carries load-phase
      // parse codes at all, so the new code's absence below is attributable to
      // this bug rather than to an unwired channel.
      {
        source: "project",
        stem: "b0259livenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition 1: the closed control must register before the refusal
      // assertion means anything — otherwise an empty registered set would
      // satisfy the refusal vacuously (no silent skipping).
      expect(
        handle.command("b0259liveclosed"),
        "bug-0259 precondition unmet: the CLOSED variant-list control did not register — " +
          "discovery or registration regressed independent of bug 0259. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the unclosed-list theta must be ABSENT from the
      // registered set, read off the settled `ExtensionRunner`.
      expect(
        handle.command("b0259livetrunc"),
        "bug-0259: a theta whose `enum` variant list is never closed by `}` registered — " +
          "the structural refusal (`" + ENUM_UNCLOSED_CODE + "`) did not fire, so the " +
          "declaration loaded with its captured variant prefix recorded as the whole list and " +
          "lowered as a usable enum. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0259: the unclosed-list theta's slash name must not appear in the registered set",
      ).not.toContain("b0259livetrunc");

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
        "bug-0259 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertion below could not witness " +
          "the new code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the newly minted registered code, by name, on the
      // real channel the suite observes.
      expect(
        joined,
        "bug-0259: no `theta-system-note` entry names `" + ENUM_UNCLOSED_CODE + "` for the " +
          "unclosed-variant-list theta — the structural diagnostic the fix mints did not reach " +
          "the load-diagnostic channel. Notes: " + JSON.stringify(notes),
      ).toContain(ENUM_UNCLOSED_CODE);

      // "still drives": one real live turn over the closed sibling, proving the
      // registration fix leaves the ordinary registered path able to complete a
      // real turn — never asserted on `prompt()` merely resolving.
      // `driven.text` is the streamed assistant reply (stochastic beyond the
      // pinned sentinel); `driven.userTexts` is the deterministic
      // outbound-render channel, read off the settled `SessionManager`.
      const driven = await driveSlashCaptureTurn(handle, "/b0259liveclosed");
      expect(
        driven.userTexts.join("\n"),
        "the closed sibling's driven turn sent no user-turn text carrying the arithmetic " +
          "question — the outbound render never reached the model. userTexts: " +
          JSON.stringify(driven.userTexts),
      ).toContain("408 plus 523");
      expect(
        driven.text,
        "the live model reply for the closed sibling did not contain the deterministic sum. " +
          "Reply: " + JSON.stringify(driven.text),
      ).toContain(SUM_ANSWER);
      expect(
        driven.systemNotes,
        "the driven turn over the closed sibling appended a theta-system-note (a fail-closed " +
          "ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
