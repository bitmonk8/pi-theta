// Bug 0151 — unclosed `fn` parameter list, standalone live registration cell
// (the bug 0104 / bug 0141 standalone-live-file precedent this file mirrors in
// shape; this lane's parent renumbers the H8a sequence at merge, so the cell
// carries the literal token rather than a numeric id from the existing
// sequence).
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION: a
// `fn` declaration whose parameter list is never closed by `)` must now be
// REFUSED at parse under the new registered row
// `theta/parse/fn-param-list-unclosed` (Sev E, phase parse, ranged on the
// opening `(`), and an error-severity `theta/parse/*` diagnostic denies
// registration (`hasLoadParseError`,
// src/extension/production-composition.ts:2220) — where at HEAD (pre-fix)
// `parseFn`'s parameter loop (src/parser/theta-document.ts:2353) exits on `)`
// or EOF indistinguishably, the lexer swallows every `stmt-sep` while bracket
// depth is open (src/lexer/lexer.ts:766), and `fn h(p: string { 1 }` loaded
// with ZERO diagnostics, recorded the function's own body `{`, `1` and `}` as
// three further parameters, and REGISTERED
// (docs/bugs/0151-unclosed-fn-parameter-list-accepted.md §Reproduction (a)
// a2).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bugs 0104 and 0141 use for their registration cells. A registration-only
// observable: no live model turn is driven, so this cell spends no tokens
// beyond `requireLiveProvider`'s credential resolution — registration is
// decided at load, so a turn is neither needed nor driven.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", both read off settled state after the real `session_start` →
// `pi.registerCommand` step, never off a `prompt()` resolution:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the unclosed-list theta must be ABSENT, the
//      closed-list sibling PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router
//      (`preEvalCauseOf` maps `theta/parse/*` → `lex-parse-type`,
//      src/extension/production-composition.ts:309–311; the note content is
//      `renderDiagnosticBatch([diagnostic])`, and `renderDiagnosticLine`
//      writes the CODE into the line, src/diagnostics/diagnostic.ts:72), so
//      the new code must appear by name on the real channel the suite
//      observes.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a THIRD planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, live at HEAD
// and untouched by this fix). Its code must appear on the note channel too. If
// it does not, the channel — not this bug — is the fault, and the cell reds
// naming that.
//
// Subagent child-process launch: NOT reached. All three planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters (`process.argv[1]`,
// `PI_THETA_SUBAGENT_EXTENSION_PIN`, `PI_THETA_SUBAGENT_PARENT_PID`) and
// importing it inherits them, but this cell does not exercise that path —
// zero model turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD for the right
// reason — the unclosed-list theta registers and no note names the new code,
// because the code does not exist yet. Green once the fix lands: the theta is
// refused and the note channel carries the code. The green direction's own
// tripwire is the closed-list control, which must keep registering — a route
// that reported on a list that IS closed reds there instead.
//
// The offline whole-list witness for the same fix is
// tests/fn-param-list-unclosed.test.ts (33 rows, ordered whole-list equality
// over the unfiltered diagnostics); this cell adds only what an offline parse
// cannot reach: the real discovery → registration → note-channel path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The new row bug 0151's fix adds under DIAG-2. */
const UNCLOSED_CODE = "theta/parse/fn-param-list-unclosed";
/** Bug 0139's row — live at HEAD, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

describe("bug 0151 — an unclosed `fn` parameter list is refused at live production load and un-registers the theta", () => {
  it("un-registers the unclosed-parameter-list theta and names the new code on the theta-system-note channel, while the closed-list sibling registers", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: the parameter list is opened and never closed, so
      // the function's own body `{ 1 }` joins the list. Pre-fix this
      // registered with zero diagnostics (bug 0151 §Reproduction (a) a2,
      // measured); post-fix it must be absent from the registered set.
      {
        source: "project",
        stem: "celleunclosed",
        text: promptTheta(["fn h(p: string { 1 }", "@`hi`"]),
      },
      // The control: the SAME declaration with the `)` present. Must register
      // — bounding the refusal to the missing closing token, not to the `fn`
      // declaration's presence (bug 0151 §Fix shared constraint 1: the
      // `)`-present path stays byte-identical).
      {
        source: "project",
        stem: "celleclosed",
        text: promptTheta(["fn h(p: string) { 1 }", "@`hi`"]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code exists at HEAD. Its note proves the channel carries load-phase
      // parse codes at all, so the new code's absence below is attributable to
      // this bug rather than to an unwired channel.
      {
        source: "project",
        stem: "cellenotechannel",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition 1: the closed-list control must register before the
      // refusal assertion means anything — otherwise an empty registered set
      // would satisfy the refusal vacuously (no silent skipping).
      expect(
        handle.command("celleclosed"),
        "bug-0151 precondition unmet: the CLOSED-list control did not register — " +
          "discovery or registration regressed independent of bug 0151, so the " +
          "refusal assertion below cannot witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the unclosed-list theta must be ABSENT from the
      // registered set, read off the settled `ExtensionRunner`.
      expect(
        handle.command("celleunclosed"),
        "bug-0151: a theta whose `fn` parameter list is never closed by `)` registered — " +
          "the structural refusal (`" + UNCLOSED_CODE + "`) did not fire, so the " +
          "declaration loaded with its own body recorded as parameters and an " +
          "empty FnBody. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0151: the unclosed-list theta's slash name must not appear in the registered set",
      ).not.toContain("celleunclosed");

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
        "bug-0151 precondition unmet: no `theta-system-note` entry names the " +
          "already-live code `" + CASE_CODE + "` for the `let P = 1` theta — the " +
          "load-diagnostic routing this cell observes is not reaching the " +
          "channel, so the assertion below could not witness the new code " +
          "either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the new registered code, by name, on the real
      // channel the suite observes.
      expect(
        joined,
        "bug-0151: no `theta-system-note` entry names `" + UNCLOSED_CODE + "` for the " +
          "unclosed-parameter-list theta — the structural diagnostic the fix " +
          "adds did not reach the load-diagnostic channel. Notes: " +
          JSON.stringify(notes),
      ).toContain(UNCLOSED_CODE);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
