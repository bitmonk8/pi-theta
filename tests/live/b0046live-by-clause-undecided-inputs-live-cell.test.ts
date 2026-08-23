// Bug 0046 — the two undecided `by <field>` input classes, standalone live
// registration cell. It mirrors in shape bug 0259's
// `b0259live-enum-body-unclosed-at-eof-live-cell.test.ts` (which itself mirrors
// bug 0245's and bug 0151's cells). Every fixture stem, theta filename and
// slash-name carries the literal `b0046live` prefix so the cell's identity is
// readable from the bug number alone and collides with no other cell's stem in
// the H8a sequence.
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION, and
// the fix changes a REGISTRATION OUTCOME on two input classes that loaded with
// ZERO diagnostics at HEAD
// (docs/bugs/0046-by-clause-undecided-inputs-load-silently.md §Reproduction):
//
//   Class 1 — an explicit `by` naming a field at least one variant does not
//   declare (`schema Animal by ghost = Cat | Dog`). `checkExplicitDiscriminator`
//   (`src/parser/schema-declarations.ts`) resolves the author's theta-side name
//   per variant through `thetaNamedFieldInVariant`; when no variant carries the
//   name every occurrence is `undefined`, `evaluateOccurrences` records
//   `presentInAll` false, `allLiteral` is conjoined with it, and every
//   remaining gate is vacuous — so the function returned clean AND the explicit
//   path REPLACES `detectImplicitDiscriminator` rather than falling back to it.
//   The fix mints the registry row `theta/parse/absent-discriminator-field`
//   (severity E, phase parse) on a new `!evaluation.presentInAll` gate, and an
//   error-severity `theta/parse/*` diagnostic denies registration
//   (`hasLoadParseError`, `src/extension/production-composition.ts`).
//
//   Class 2 — an explicit `by` over a right-hand side of two or more arms not
//   all of which are object schemas (`schema X by f = string | integer`). The
//   fix widens `theta/parse/by-on-object-schema`'s *Trigger* so the cut becomes
//   the registered *Message*'s own truth condition (two or more arms, EVERY one
//   an object schema); the *Message* is unchanged, so this is a DIAG-2 Trigger
//   operation and not a DIAG-4 *Message* reword
//   (docs/spec_topics/diagnostics/diagnostic-shape.md §DIAG-4). That class too
//   now refuses, so it too un-registers.
//
// The class-1 code is MINTED rather than borrowed from the discriminator rows
// that already exist: `theta/parse/missing-discriminator`'s *Trigger* is stated
// over DETECTION finding no candidate, and bug 0128 bound
// `theta/parse/non-literal-discriminator` to a NAMED field on exactly the
// `presentInAll` partition, its row fencing this class out by name. So this
// cell asserts the NEW code by name, and would not be satisfied by either
// neighbour appearing on the channel.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bugs 0151, 0245 and 0259 use for their live cells. The offline whole-list
// witness for the same fix (`tests/b0046-by-clause-undecided-inputs.test.ts`)
// settles inside one `parseThetaDocument` call and cannot reach discovery,
// registration, the note channel or a driven turn; this cell adds only that.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", read off settled state after the real `session_start` →
// `pi.registerCommand` step and, for the closed twin, after a real driven turn:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the `by ghost` theta and the primitive-union theta
//      must be ABSENT, the well-formed `by kind` twin PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/parse/*` → `lex-parse-type`,
//      `src/extension/production-composition.ts`; the note content is
//      `renderDiagnosticBatch([diagnostic])`, and `renderDiagnosticLine` writes
//      the CODE into the line, `src/diagnostics/diagnostic.ts`), so both codes
//      must appear by name on the real channel the suite observes.
//   3. For the closed twin ONLY: `driveSlashCaptureTurn`'s `text` and
//      `userTexts` off the settled `SessionManager` after a real driven turn —
//      the registration change must not merely flip a boolean, it must leave a
//      well-formed explicit discriminator able to drive a real turn end to end.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// whose answer is computable only from the inline value, never a verbatim-echo
// demand and never a narrative framing. The pair is deliberately different from
// bug 0259's and bug 0129's cells' pairs, so no cell's sentinel can satisfy
// another's assertion.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a FOURTH planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, live at HEAD
// and untouched by this fix). Its code must appear on the note channel too. If
// it does not, the channel — not this bug — is the fault, and the cell reds
// naming that.
//
// Subagent child-process launch: NOT reached. The closed twin drives one plain
// arithmetic query with no tool invocation, so no query-time tool-call loop and
// no RFC-0006 subagent-child spawn occurs. `tests/live/harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, but this cell does not exercise that path.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD for the right
// reason — both refused thetas register and no note names either code, because
// the class-1 code does not exist yet and the class-2 input is outside the
// pre-fix Trigger. Green once the fix lands. The green direction's own tripwire
// is the closed twin, which must keep registering AND keep driving — a gate
// that fired on a `by` field every variant DOES declare, or a Trigger widened
// past all-object-schema arms, would red there instead.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The new row bug 0046's fix mints under DIAG-2 for class 1. */
const ABSENT_FIELD_CODE = "theta/parse/absent-discriminator-field";
/** The existing row whose *Trigger* the fix widens over class 2. */
const BY_ON_OBJECT_CODE = "theta/parse/by-on-object-schema";
/** Bug 0139's row — live at HEAD, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

/** The two well-formed object variants every discriminator fixture below shares. */
const CAT = 'schema Cat { kind: "cat", name: string }';
const DOG = 'schema Dog { kind: "dog", name: string }';

// Drive discriminators are ANSWERS to task questions over an inline value —
// deterministic content a degraded plain-prompt run cannot produce by
// coincidence. A verbatim-echo demand ("reply with exactly this") reads as
// prompt injection to current models and draws refusals (bug 0243); this is a
// natural arithmetic question instead. The pair differs from every neighbouring
// cell's so the sentinels cannot be confused.
const SUM_ANSWER = "627";

describe("bug 0046 — an absent `by` field and a `by` over non-object-schema arms are refused at live production load and un-register the theta", () => {
  it("un-registers both undecided classes and names their codes on the theta-system-note channel, while the well-formed `by kind` twin registers and drives a real turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // Class 1, the bug document's §Reproduction A1 fixture: `ghost` is
      // declared by NEITHER variant, so every resolved occurrence is
      // `undefined` and pre-fix the whole declaration loaded clean while
      // silencing the `theta/parse/missing-discriminator` the same variants
      // draw without the clause.
      {
        source: "project",
        stem: "b0046liveghost",
        text: promptTheta([CAT, DOG, "schema Animal by ghost = Cat | Dog"]),
      },
      // Class 2, the bug document's §Reproduction B1 fixture (test cell n22's
      // pin): two arms, neither an object schema, so the clause is accepted
      // where it can have no subject. `buildUnionVariantSchemas`
      // (`src/parser/theta-document.ts`) declines both arms, so no
      // discriminator check ran either.
      {
        source: "project",
        stem: "b0046liveprim",
        text: promptTheta(["schema X by f = string | integer"]),
      },
      // The CLOSED TWIN: the same declaration shape with a `by` field EVERY
      // variant declares — a well-formed discriminator over two object-schema
      // arms — plus a real task-framed query so the registered path is proven
      // end to end. Neither the new class-1 gate nor the widened class-2
      // Trigger may touch it.
      {
        source: "project",
        stem: "b0046liveclosed",
        text: promptTheta([
          CAT,
          DOG,
          "schema Animal by kind = Cat | Dog",
          "@`What is 271 plus 356? Answer with the number only.`?",
        ]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code exists at HEAD. Its note proves the channel carries load-phase
      // parse codes at all, so the two codes' absence below is attributable to
      // this bug rather than to an unwired channel.
      {
        source: "project",
        stem: "b0046livenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition 1: the closed twin must register before the refusal
      // assertions mean anything — otherwise an empty registered set would
      // satisfy them vacuously (no silent skipping).
      expect(
        handle.command("b0046liveclosed"),
        "bug-0046 precondition unmet: the well-formed `by kind` twin did not register — " +
          "discovery or registration regressed independent of bug 0046. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: both refused thetas must be ABSENT from the
      // registered set, read off the settled `ExtensionRunner`.
      expect(
        handle.command("b0046liveghost"),
        "bug-0046 class 1: a theta whose `by` clause names a field NEITHER variant declares " +
          "registered — the refusal (`" + ABSENT_FIELD_CODE + "`) did not fire, so the clause " +
          "still loads clean and still silences the discriminator rejection the same variants " +
          "draw without it. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0046 class 1: the `by ghost` theta's slash name must not appear in the " +
          "registered set",
      ).not.toContain("b0046liveghost");
      expect(
        handle.command("b0046liveprim"),
        "bug-0046 class 2: a theta whose `by` clause sits on a two-arm union with no " +
          "object-schema arm registered — the widened `" + BY_ON_OBJECT_CODE + "` Trigger did " +
          "not claim it. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0046 class 2: the primitive-union theta's slash name must not appear in the " +
          "registered set",
      ).not.toContain("b0046liveprim");

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
        "bug-0046 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertions below could not witness " +
          "either code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observables: the class-1 row by name, and the class-2 row
      // (widened Trigger) by name, on the real channel the suite observes.
      expect(
        joined,
        "bug-0046 class 1: no `theta-system-note` entry names `" + ABSENT_FIELD_CODE + "` for " +
          "the `by ghost` theta — the diagnostic the fix mints did not reach the " +
          "load-diagnostic channel. Notes: " + JSON.stringify(notes),
      ).toContain(ABSENT_FIELD_CODE);
      expect(
        joined,
        "bug-0046 class 2: no `theta-system-note` entry names `" + BY_ON_OBJECT_CODE + "` for " +
          "the `string | integer` theta — the widened Trigger did not reach the load-diagnostic " +
          "channel. Notes: " + JSON.stringify(notes),
      ).toContain(BY_ON_OBJECT_CODE);

      // "still drives": one real live turn over the closed twin, proving the
      // registration change leaves a well-formed explicit discriminator able to
      // complete a real turn — never asserted on `prompt()` merely resolving.
      // `driven.text` is the streamed assistant reply (stochastic beyond the
      // pinned sentinel); `driven.userTexts` is the deterministic
      // outbound-render channel, read off the settled `SessionManager`.
      const driven = await driveSlashCaptureTurn(handle, "/b0046liveclosed");
      expect(
        driven.userTexts.join("\n"),
        "the closed twin's driven turn sent no user-turn text carrying the arithmetic " +
          "question — the outbound render never reached the model. userTexts: " +
          JSON.stringify(driven.userTexts),
      ).toContain("271 plus 356");
      expect(
        driven.text,
        "the live model reply for the closed twin did not contain the deterministic sum. " +
          "Reply: " + JSON.stringify(driven.text),
      ).toContain(SUM_ANSWER);
      expect(
        driven.systemNotes,
        "the driven turn over the closed twin appended a theta-system-note (a fail-closed " +
          "ending) — the good path must drive clean. Notes: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
