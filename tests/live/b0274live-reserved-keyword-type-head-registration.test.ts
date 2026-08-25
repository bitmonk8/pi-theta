// Bug 0274 — a reserved-keyword spelling written where a `NamedType` is read at
// one of the five sinkless `collectUnresolvedNamedTypes` call sites, standalone
// live registration cell
// (docs/bugs/0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md).
// It mirrors in shape bug 0262's
// `b0262live-unresolved-named-type-reference-position-live-cell.test.ts`. Every
// fixture stem, theta filename and slash-name carries the literal `b0274live`
// prefix so the cell's identity is readable from the bug number alone and
// collides with no other cell's stem in the H8a sequence.
//
// WHY A LIVE CELL IS OWED. The fixed surface is theta LOAD and REGISTRATION,
// and the fix changes a REGISTRATION OUTCOME on inputs that, before it, loaded
// with ZERO diagnostics and registered (§Reproduction rows E1 and F5, both
// measured "registers: yes"). `collectUnresolvedNamedTypes`
// (`src/parser/body-type-lowering.ts`) computes the reserved-keyword class at
// every capture and publishes it only through its optional caller-owned
// `reservedKeywords` out-parameter; the `@<T>` query capture's `E`-side block
// and the four captures bug 0262 wired for the name class pass none, so the
// class is discarded there. The fix passes a sink at those five sites and emits
// `reservedKeywordAsIdentifierDiagnostic` per hit, and an error-severity
// `theta/parse/*` diagnostic denies registration (`hasLoadParseError`,
// `src/extension/production-composition.ts`; the GOV-15 loads-cleanly reading,
// docs/spec_topics/governance/source-language-stability.md line 9).
//
// The code is BORROWED, not minted: `theta/parse/reserved-keyword-as-identifier`
// is an existing row (docs/spec_topics/diagnostics/code-registry-parse.md)
// whose *Trigger* — "Reserved keyword used in an identifier position." —
// enumerates no position, so a further identifier position entering its
// emission set makes the behaviour match the row as registered. No *Message*
// byte moves under version 0.272.0. This cell therefore asserts an EXISTING code
// by name at positions that did not emit it before the change-set.
//
// This cell proves the fix through the real shipped load path — `session_start`
// (→ `resources_discover`) → `composeExtensionInstance`, the shipped
// composition root — over a REAL on-disk `.pi/theta/` discovery walk driven by
// `bootShippedExtension` (`tests/live/harness.ts`). The offline whole-list
// witness for the same fix
// (`tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`)
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
//      code and the offending KEYWORD SPELLING must appear by name on the real
//      channel the suite observes — the spelling because the registered
//      *Message* interpolates it, and reading it is what separates this bug's
//      emission from any other refusal of the same code.
//   3. For the CONTROL only: `driveSlashCaptureTurn`'s `text` and `userTexts`
//      off the settled `SessionManager` after a real driven turn — the refusal
//      must not merely flip a boolean, it must leave a theta whose type heads
//      are legal able to drive a real turn end to end.
//
// THE TWO CARRIERS are the two faces of the report at the one measured spelling
// that is confound-free. `match` is a member of neither `PRIMITIVE_TYPES` nor
// the lexer's `controlHeads` set (`src/lexer/lexer.ts`), whose contextual scan
// makes `fn`, `for`, `if` and `while` draw `theta/parse/single-line-if` at many
// of these positions — a misfire the bug document's §Non-goals leave alone.
//   - `b0274livequeryerrside` — §Reproduction row E1, the `@<T>` query capture's `E`
//     argument, which is bug 0273's landed block.
//   - `b0274livefnreturn` — §Reproduction row F3, the `fn` return type, one of
//     the four captures bug 0262 wired for the name class alone.
// Two carriers rather than one because the five sites are five separate
// argument additions: a route that wired only the `E` side would leave the
// second carrier registered, and this cell reds naming which.
//
// Every stem here is all-lowercase because the composition root refuses a
// slash name that is not lowercase kebab/snake before a diagnostic of this
// bug's own can decide the theta's fate; a carrier with an uppercase letter
// in its stem would be absent from the registered set for that reason instead,
// and its absence assertion could not red.
//
// THE CONTROL is the same shape with LEGAL type heads, and it is also the
// scoping tripwire the offline witness's group (X) locks. `Result` and `array`
// are reserved spellings that ARE legal type heads
// (docs/spec_topics/grammar.md: `GenericType ::= "array" "<" Type ">" |
// "Result" "<" Type "," Type ">"`), and the sink at the five new sites admits
// no such spelling. So the control declares an `fn` returning a bare `Result`
// and a `let` annotated `array<integer>` — exactly the spellings a sink wired
// without that withhold would refuse — and must register AND drive. A route
// that over-collected reds here rather than only in the conformance suite.
//
// DRIVE DISCRIMINATOR (bug 0243 is binding): a task-framed arithmetic question
// over a value the THETA computes from the legally-annotated bindings, never a
// verbatim-echo demand and never a narrative framing. `n` is computed from the
// `array<integer>`-annotated binding's element read, so the interpolated
// question also proves that legal reserved head carried a real value into the
// prompt. The `Result`-returning declaration is deliberately left UNCALLED: the
// capture this cell scopes is the `fn` RETURN TYPE walk, which runs over the
// declaration whether or not it is called, and a top-level `?` propagation
// would add a runtime question this cell is not measuring. The pair is
// deliberately different from
// bug 0262's and bug 0271's cells' pairs, so no cell's sentinel can satisfy
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
// because those five captures pass no reserved-keyword sink. Green under the
// fix. The green direction's own tripwire is the control, which must keep
// registering AND keep driving with its legal `Result` and `array` heads.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The registered row the five newly-wired sinks emit. */
const RESERVED_CODE = "theta/parse/reserved-keyword-as-identifier";
/** Bug 0139's row — already live, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The one confound-free spelling both carriers write. */
const KEYWORD = "match";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "description: d", "mode: prompt", "---", "", ...bodyLines].join("\n") + "\n";
}

// The drive discriminator is the ANSWER to a task question over a value the
// theta computes — deterministic content a degraded plain-prompt run cannot
// produce by coincidence. A verbatim-echo demand reads as prompt injection to
// current models and draws refusals (bug 0243); this is a natural arithmetic
// question instead. The theta computes 700 + 41 = 741, and the question adds
// 158. Measured offline: the control's source loads with ZERO diagnostics at
// HEAD, so a red here is the scoping, not the fixture.
const CONTROL_VALUE = "741";
const SUM_ANSWER = "899";

describe("bug 0274 — a reserved-keyword type head at the five sinkless captures is refused at live production load and un-registers the theta", () => {
  it("un-registers both carriers and names the code and the keyword on the theta-system-note channel, while the control whose reserved heads are LEGAL type heads registers and drives a real turn", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // CARRIER 1: §Reproduction row E1 — the `@<T>` query capture's `E`
      // argument, the block bug 0273 landed with the reserved sink explicitly
      // declined. At HEAD this loads with zero diagnostics and registers, so a
      // theta whose query carries `Result<integer, match>` runs with a reserved
      // spelling standing where a declaration name belongs.
      {
        source: "project",
        stem: "b0274livequeryerrside",
        text: promptTheta([
          `let r = @<Result<integer, ${KEYWORD}>>\`What is 12 plus 30? Answer with the number only.\``,
          "r",
        ]),
      },
      // CARRIER 2: §Reproduction row F3 — the `fn` return type, one of the four
      // captures bug 0262 wired for the name class alone. Present because the
      // five sites are five separate argument additions: a route that wired the
      // `E` side only would leave this carrier registered.
      {
        source: "project",
        stem: "b0274livefnreturn",
        text: promptTheta([`fn f(): ${KEYWORD} { 1 }`, "let v = f()", "\"ok\""]),
      },
      // THE CONTROL, and the scoping tripwire. `Result` and `array` are
      // reserved spellings the grammar makes legal type heads, and the sink at
      // the five new sites withholds them; both appear at newly-wired sites
      // here — an APPLIED `Result<integer, QueryError>` at an `fn` return
      // (bug 0277 §Fix route (a): the withheld set held only the UNAPPLIED
      // spelling, so this control keeps its applied heads across that fix),
      // `array<integer>` at a `let` annotation — so a route that fed the full
      // reserved set to those sites reds on this control instead of
      // registering it.
      {
        source: "project",
        stem: "b0274livecontrol",
        // Coordination note, 0.275.0 (bug 0277 §Fix route (a) is the authority):
        // `step`'s return annotation was the bare `Result` — an unapplied head,
        // legal here only under this bug's own withheld set. Route (a) removes
        // that withhold, so the unapplied spelling now refuses at every
        // capture and this control would no longer register. Respelled
        // `Result<integer, QueryError>`, an APPLIED head that stays legal
        // under route (a) (§Non-goals: the grammar admits it everywhere).
        // `step` is declared and never called, so this changes no assertion
        // in this cell — the control's purpose (a legal theta registers AND
        // drives) is preserved.
        text: promptTheta([
          "fn step(): Result<integer, QueryError> { Ok(700) }",
          "let xs: array<integer> = [41]",
          "let n = 700 + xs[0]",
          "@`What is ${n} plus 158? Answer with the number only.`?",
        ]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code existed and fired before this change-set. Its note proves the
      // channel carries load-phase parse codes at all, so a carrier missing its
      // code would be attributable to this bug rather than to an unwired
      // channel.
      {
        source: "project",
        stem: "b0274livenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition 1: the control must register before the refusal
      // assertions mean anything — otherwise an empty registered set would
      // satisfy them vacuously (no silent skipping). This is simultaneously
      // the scoping assertion: the control's reserved-but-legal heads
      // (`Result`, `array`) must remain admitted at the newly-wired `fn`
      // return and `let` annotation sites.
      expect(
        handle.command("b0274livecontrol"),
        "bug-0274 precondition unmet AND scoping violated: the control theta, whose only " +
          "reserved spellings are the legal type heads `Result` and `array` at two of the " +
          "newly-wired sites, did not register — either discovery regressed independent of " +
          "bug 0274, or the sink at the five new sites over-collected and now refuses legal " +
          "source. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: both carriers must be ABSENT from the registered
      // set, read off the settled `ExtensionRunner`. They are asserted
      // separately so the failure names WHICH of the five sites is still
      // sinkless.
      expect(
        handle.command("b0274livequeryerrside"),
        "bug-0274: a theta whose `@<T>` query annotation writes the reserved spelling `" +
          KEYWORD + "` in the `Result` `E` argument registered — the `E`-side block passes no " +
          "reserved-keyword sink, so the class is computed and discarded there. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.command("b0274livefnreturn"),
        "bug-0274: a theta whose `fn` return type IS the reserved spelling `" + KEYWORD +
          "` registered — the `fn` return capture passes no reserved-keyword sink. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0274: neither carrier's slash name may appear in the registered set",
      ).not.toContain("b0274livequeryerrside");

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
        "bug-0274 precondition unmet: no `theta-system-note` entry names the already-live code " +
          "`" + CASE_CODE + "` for the `let P = 1` theta — the load-diagnostic routing this " +
          "cell observes is not reaching the channel, so the assertion below could not witness " +
          "the borrowed code either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the borrowed row by name, on the real channel the
      // suite observes, together with the offending spelling the registered
      // *Message* interpolates.
      expect(
        joined,
        "bug-0274: no `theta-system-note` entry names `" + RESERVED_CODE + "` — the keyword " +
          "class computed at the five sinkless captures still reaches no caller sink, so no " +
          "load diagnostic reaches the channel. Notes: " + JSON.stringify(notes),
      ).toContain(RESERVED_CODE);
      expect(
        joined,
        "bug-0274: the note channel names `" + RESERVED_CODE + "` but not the offending " +
          "spelling `" + KEYWORD + "` the registered Message interpolates — the code on the " +
          "channel is some other refusal, not this bug's emission. Notes: " +
          JSON.stringify(notes),
      ).toContain(`'${KEYWORD}'`);

      // "still drives": one real live turn over the control, proving the
      // refusal leaves a theta whose reserved-but-legal type heads still carry
      // real values through a real turn — never asserted on `prompt()` merely
      // resolving. `driven.text` is the streamed assistant reply (stochastic
      // beyond the pinned sentinel); `driven.userTexts` is the deterministic
      // outbound-render channel, read off the settled `SessionManager`.
      const driven = await driveSlashCaptureTurn(handle, "/b0274livecontrol");
      expect(
        driven.userTexts.join("\n"),
        "the control's driven turn sent no user-turn text carrying the theta-computed value " +
          CONTROL_VALUE + " — the `array<integer>`-annotated binding's element read never " +
          "reached the outbound render. userTexts: " +
          JSON.stringify(driven.userTexts),
      ).toContain(`${CONTROL_VALUE} plus 158`);
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
