// Bug 0225 — a `fn` parameter list that exits on a foreign `)` registers
// silently: standalone live registration cell, tagged
//
// Shape precedent: bug 0151's standalone live cell
// (tests/live/fn-param-list-unclosed-live-cell.test.ts), itself following the
// bug 0104 / bug 0141 standalone-live-file precedent. This lane's parent
// renumbers the H8a sequence at merge, so the cell carries the literal title
// token rather than a numeric id from the existing sequence.
//
// Additive H8a-T cell. The fixed surface is theta LOAD and REGISTRATION. A
// `fn` declaration whose parameter loop consumed a token no `Ident` derives —
// `punct`, `number`, `string` or `template` — and then exited on the `)` the
// author wrote for the list itself must now be REFUSED at parse under the new
// registered row `theta/parse/fn-param-not-identifier` (Sev E, phase parse,
// placeholder-free *Message* `fn parameter name must be an identifier`, ranged
// on the FIRST refused token), and an error-severity `theta/parse/*`
// diagnostic denies registration (`hasLoadParseError`,
// src/extension/production-composition.ts:2220; the gate itself at `:1735`).
// At HEAD (v0.163.0 `3b11f739`) `parseFn`'s loop takes the next token
// unconditionally (`const pTok = this.advance();`,
// theta-document.ts:2423) and pushes it as a `FnParam` (`params.push({ name: pTok.text, type: pType
// })`, theta-document.ts:2486) with no `pTok.kind` test on the control path,
// and bug 0151's `unclosed` mark is set at the block-open-`{` check
// (theta-document.ts:2405) and at the epilogue's no-`)` `else` arm
// (theta-document.ts:2513) alone, so the epilogue's `)`-present arm (`if
// (this.isPunct(")"))`, theta-document.ts:2494) consumes the foreign closer
// and the emission gated on `unclosed && !closeParenAbsorbed`
// (theta-document.ts:2515) never runs, pre-fix:
// `fn h(a: string,` + `x = 1` + `) { 1 }` loaded with ZERO diagnostics,
// recorded four parameters where the author wrote one, dropped the `x = 1`
// reassignment from the statement list the interpreter walks, and REGISTERED
// (docs/bugs/0225-fn-param-list-foreign-close-paren-silent.md §Reproduction
// (A) A1 — the bytes this cell plants).
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), the same harness
// bugs 0104, 0141 and 0151 use for their registration cells. A
// registration-only observable: no live model turn is driven, so this cell
// spends no tokens beyond `requireLiveProvider`'s credential resolution —
// registration is decided at load, so a turn is neither needed nor driven.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", both read off settled state after the real `session_start` →
// `pi.registerCommand` step, never off a `prompt()` resolution:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the foreign-`)` theta must be ABSENT, the
//      closed-list sibling PRESENT.
//   2. The `theta-system-note` channel, read off the settled in-memory
//      `SessionManager`: an error-severity load-phase diagnostic routes onto
//      that channel through the V4e pre-eval router (`preEvalCauseOf` maps
//      `theta/parse/*` → `lex-parse-type`,
//      src/extension/production-composition.ts:309–311; the note content is
//      `renderDiagnosticBatch([diagnostic])`, and `renderDiagnosticLine`
//      writes the CODE into the line, src/diagnostics/diagnostic.ts:72), so
//      the new code must appear by name on the real channel the suite
//      observes.
//
// CHANNEL PRECONDITION, so observable 2 can never pass vacuously and never
// silently skips: a THIRD planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, live at HEAD
// and untouched by this route). Its code must appear on the note channel too.
// If it does not, the channel — not this bug — is the fault, and the cell reds
// naming that.
//
// Subagent child-process launch: NOT reached. All three planted thetas are
// `mode: prompt` and this cell never invokes a command, so no query-time
// tool-call loop and no RFC-0006 subagent-child spawn occurs. `harness.ts`
// carries the `#subagent-child-pins` module-scope setters (`process.argv[1]`
// at the real pi CLI entry, `PI_THETA_SUBAGENT_EXTENSION_PIN` at this working
// tree's `extensions/`, and `PI_THETA_SUBAGENT_PARENT_PID`), and importing it
// inherits all three, so the pins are in force if the load path ever reaches a
// child launch — zero model turns as stated above.
//
// RED / GREEN (AGENTS.md "Verify both directions"): red at HEAD for the right
// reason — the foreign-`)` theta registers and no note names the new code,
// because the code does not exist yet. Green once the fix lands: the theta is
// refused and the note channel carries the code. The green direction's own
// tripwires are the closed-list control, which must keep registering (a route
// that reported on a conformant list reds there instead), and the
// annotation-less-`Ident` control, which must ALSO keep registering — bug 0150
// owns that half and Decision 1's narrow predicate does not decide it.
//
// The offline whole-list witness for the same route is
// tests/fn-param-not-identifier.test.ts (21 source rows, ordered whole-list
// equality over the unfiltered diagnostics, every message read from the
// registry); this cell adds only what an offline parse cannot reach: the real
// discovery → registration → note-channel path. Title token:

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The new row bug 0225's fix adds under DIAG-2. */
const NOTID_CODE = "theta/parse/fn-param-not-identifier";
/** Bug 0139's row — live at HEAD, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

describe("bug 0225 — a `fn` parameter name that no `Ident` derives is refused at live production load", () => {
  it("un-registers the foreign-`)` theta and names the new code on the theta-system-note channel, while both controls register —", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The refused shape: bug 0225 §Reproduction (A) A1's exact bytes. The
      // lexer joins the lines while bracket depth is open
      // (src/lexer/lexer.ts:766), the `=` and the `1` are recorded as
      // parameters, and the `)` on the third line is consumed as the list's
      // closer. Pre-fix this registered with zero diagnostics; post-fix it
      // must be absent from the registered set.
      {
        source: "project",
        stem: "cellenotident",
        text: promptTheta(["fn h(a: string,", "x = 1", ") { 1 }", "@`hi`"]),
      },
      // Control 1: the conformant closed list. Must register — bounding the
      // refusal to the non-`Ident` token at a parameter-name position, not to
      // the `fn` declaration's presence (bug 0225 §Fix constraint 1).
      {
        source: "project",
        stem: "celleclosedok",
        text: promptTheta(["fn h(a: string) { 1 }", "@`hi`"]),
      },
      // Control 2: bug 0150's open half — an annotation-less legal `Ident` at
      // the same position (§Reproduction (A) A11). Decision 1's narrow
      // predicate leaves it alone, so it must keep registering. A route that
      // also refused a missing `":" Type` would decide bug 0150 as a side
      // effect and reds here.
      {
        source: "project",
        stem: "cellenoannot",
        text: promptTheta(["fn h(p): number { 1 }", "@`hi`"]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code exists at HEAD. Its note proves the channel carries load-phase
      // parse codes at all, so the new code's absence below is attributable to
      // this bug rather than to an unwired channel.
      {
        source: "project",
        stem: "cellenotechan",
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
        handle.command("celleclosedok"),
        "bug-0225 precondition unmet: the CLOSED-list control did not register — " +
          "discovery or registration regressed independent of bug 0225, so the " +
          "refusal assertion below cannot witness anything. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Precondition 2 / boundary: bug 0150's annotation-less `Ident` keeps
      // registering. This is a live assertion of Decision 1's stated boundary,
      // not a precondition on the harness.
      expect(
        handle.command("cellenoannot"),
        "bug-0225 boundary violated: the annotation-less-parameter theta " +
          "(`fn h(p): number { 1 }`) did not register — the predicate reached bug " +
          "0150's open class, deciding that report's adjudication as a side " +
          "effect. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Real observable 1: the foreign-`)` theta must be ABSENT from the
      // registered set, read off the settled `ExtensionRunner`.
      expect(
        handle.command("cellenotident"),
        "bug-0225: a theta whose `fn` parameter list recorded a `=` and a `1` as " +
          "parameters registered — the structural refusal (`" + NOTID_CODE + "`) " +
          "did not fire, so the declaration loaded with the author's `x = 1` " +
          "reassignment deleted from the statement list and its arity moved from " +
          "one to four. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "bug-0225: the foreign-`)` theta's slash name must not appear in the registered set",
      ).not.toContain("cellenotident");

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

      // Precondition 3: the channel carries load-phase parse codes at all.
      expect(
        joined,
        "bug-0225 precondition unmet: no `theta-system-note` entry names the " +
          "already-live code `" + CASE_CODE + "` for the `let P = 1` theta — the " +
          "load-diagnostic routing this cell observes is not reaching the " +
          "channel, so the assertion below could not witness the new code " +
          "either. Notes: " + JSON.stringify(notes),
      ).toContain(CASE_CODE);

      // The fixed observable: the new registered code, by name, on the real
      // channel the suite observes.
      expect(
        joined,
        "bug-0225: no `theta-system-note` entry names `" + NOTID_CODE + "` for the " +
          "foreign-`)` theta — the structural diagnostic the fix adds did not " +
          "reach the load-diagnostic channel. Notes: " + JSON.stringify(notes),
      ).toContain(NOTID_CODE);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
