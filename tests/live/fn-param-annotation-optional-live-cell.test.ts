// Bug 0150 — a `fn` parameter with no type annotation: standalone live cell for
// the BLESSED shape.
//
// Shape precedent: bug 0225's standalone live cell
// (tests/live/fn-param-not-identifier-live-cell.test.ts) and bug 0151's
// (tests/live/fn-param-list-unclosed-live-cell.test.ts), themselves following
// the bug 0104 / bug 0141 standalone-live-file precedent. This lane's parent
// renumbers the H8a sequence at merge, so the cell carries a literal title
// token rather than a numeric id from the existing sequence.
//
// Additive H8a-T cell, and it is the INVERSE of those two precedents. They
// witness a NEW refusal; bug 0150's adjudicated route is route 2 — relax both
// normative grammar mirrors to `FnParam ::= Ident (":" Type)?`, rewrite the
// `fn`-declarations prose on both pages, and supply the typing rule the shape
// lacks — a DOCUMENTATION-only fix that changes no behaviour. So this cell
// asserts the blessed shape end to end: the theta with an unannotated `fn`
// parameter REGISTERS, and driving it lands NO `theta-system-note`.
//
// At HEAD (v0.173.0 `04515c5d`) `parseFn` (src/parser/theta-document.ts:2346)
// reads the annotation behind a guard — `let pType = ""; if
// (this.isPunct(":")) { … }` then `params.push({ name: pTok.text, type: pType
// })` (src/parser/theta-document.ts:2477–2486) — so absence of `:` is the
// initialiser, not a diagnostic, and the declaration reaches the AST with
// `type: ""`. `walkFn` records that parameter as a withheld binder
// (src/parser/type-layer-checks.ts:1801–1815) and `checkFnCallArgs` skips its
// argument slot (`:2188`), so no type-layer sink fires either. Being
// GREEN at HEAD is therefore expected and is the point: route 2 changes no
// observable, and this cell is the end-to-end lock that a later route-1
// re-enforcement cannot land silently.
//
// This cell proves the shape through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance`, the
// shipped composition root — over a REAL on-disk `.pi/theta/` discovery walk
// driven by `bootShippedExtension` (`tests/live/harness.ts`), and then drives
// ONE real turn through the registered slash command
// (`driveSlashCaptureTurn`), which is what an offline `parseDoc` cannot reach:
// registration, the outbound render of a value the unannotated parameter
// carried, and the fail-closed note channel.
//
// Observables per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving", all read off settled state, never off a `prompt()` resolution:
//   1. `handle.command(stem)` / `handle.registeredNames()` off the real
//      `ExtensionRunner` — the unannotated-parameter theta must be PRESENT
//      (an error-severity `theta/parse/*` diagnostic would deny registration:
//      `hasLoadParseError`, src/extension/production-composition.ts,
//      applied in `parseDiscoveredTheta`).
//   2. The driven turn's `userTexts` — the deterministic outbound-render
//      channel — must carry the sentinel the theta computed by calling the
//      unannotated-parameter function. This is the positive observable: it
//      proves the parameter BOUND positionally
//      (src/runtime/statement-executor.ts:417) and its value reached the
//      rendered query template, so the note-absence assertion below is not
//      standing in for a drive that never happened.
//   3. The driven turn's `theta-system-note` channel, read off the settled
//      in-memory `SessionManager`: EVERY fail-closed ending of a top-level
//      drive lands here (the SLSH-3 err note, the cancelled note, the panic
//      framings), so ABSENCE of any note is the success observable for the
//      blessed shape. `assistantText` is stochastic and is deliberately NOT
//      asserted.
//
// CHANNEL PRECONDITION, so observable 3 can never pass vacuously and never
// silently skips: a SECOND planted theta carries an already-refused parse fault
// (`let P = 1` → `theta/parse/binding-case-mismatch`, bug 0139's, live at HEAD
// and untouched by route 2). Its load-phase diagnostic routes onto the
// `theta-system-note` channel through the V4e pre-eval router (`preEvalCauseOf`
// maps `theta/parse/*` → `lex-parse-type`,
// src/extension/production-composition.ts:309–311; `renderDiagnosticLine`
// writes the CODE into the line, src/diagnostics/diagnostic.ts:87) at BOOT, so
// it appears in the whole-session read below while being outside the per-drive
// slice `driveSlashCaptureTurn` returns. If that code is absent, the channel —
// not this bug — is the fault, and the cell reds naming that.
//
// Subagent child-process launch: NOT reached. Both planted thetas are
// `mode: prompt`, so the drive is a prompt-mode query with no tool-call loop
// and no RFC-0006 subagent-child spawn. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters (`process.argv[1]` at the real pi
// CLI entry, `PI_THETA_SUBAGENT_EXTENSION_PIN` at this working tree's
// `extensions/`, and `PI_THETA_SUBAGENT_PARENT_PID`), and importing it inherits
// all three, so the pins are in force if the load path ever reaches a child
// launch.
//
// RED / GREEN (AGENTS.md "Verify both directions"): GREEN at HEAD, because
// route 2 changes no behaviour. Its red direction is the one that matters —
// any fix that enforces `FnParam ::= Ident ":" Type` (route 1) reds it twice
// over: the theta stops registering (observable 1) and, were it still to
// register, its drive would land a fail-closed note (observable 3). Phase 4
// red-proves it in both directions.
//
// The offline whole-list witness for the same route is
// tests/fn-param-annotation-optional.test.ts — five documentation cells (the
// red half at HEAD) plus the behaviour and type-layer locks; this cell adds
// only what an offline parse cannot reach: the real discovery → registration →
// driven-turn → note-channel path.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** Bug 0139's row — live at HEAD, the note-channel precondition. */
const CASE_CODE = "theta/parse/binding-case-mismatch";
/** The value the unannotated parameter carries through to the outbound render. */
// Drive discriminators are ANSWERS to task questions over the theta's own
// computed text -- deterministic content a degraded plain-prompt run cannot
// produce. A verbatim-echo demand ("reply with exactly this") reads as prompt
// injection to current models and draws refusals: the sentinel-refusal class
// filed as bug 0243. `${z}` stays in the rendered text as a context token
// (asserted off the outbound render, not the reply).
const SENTINEL = "unannotatedparamok";

/** A `mode: prompt` `.theta` whose body is the given lines. */
function promptTheta(bodyLines: readonly string[]): string {
  return ["---", "mode: prompt", "---", ...bodyLines].join("\n") + "\n";
}

describe("bug 0150 — a `fn` parameter with no type annotation is the blessed shape at live production load and drive", () => {
  it("registers the unannotated-parameter theta, renders the value it computed, and lands NO theta-system-note (bug 0150)", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      // The blessed shape: bug 0150 §Reproduction (A) A9's declaration — an
      // unannotated parameter whose BODY reads it — plus a call site and a
      // prompt-mode query that interpolates the result, so the drive has a
      // deterministic outbound observable.
      {
        source: "project",
        stem: "cellcnoannot",
        text: promptTheta([
          "fn echoback(p): string { p }",
          `let z = echoback("${SENTINEL}")`,
          "@`Context token ${z} was produced upstream. What is 365 plus 472? Answer with the number only.`",
        ]),
      },
      // The note-channel precondition: an already-refused parse fault whose
      // code exists at HEAD. Its note proves the channel carries load-phase
      // parse codes at all, so the per-drive note ABSENCE asserted below is
      // attributable to the drive being clean rather than to an unwired
      // channel.
      {
        source: "project",
        stem: "cellcnotechan",
        text: promptTheta(["let P = 1", "@`hi`"]),
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Real observable 1: the unannotated-parameter theta REGISTERS, read off
      // the settled `ExtensionRunner`. Route 2 leaves this true; a route-1
      // refusal denies registration and reds here first.
      expect(
        handle.command("cellcnoannot"),
        "bug-0150: the theta declaring `fn echoback(p): string { p }` did NOT register — " +
          "an error-severity theta/parse/* diagnostic was raised on a `fn` parameter " +
          "carrying no type annotation, which is the shape bug 0150's adjudicated " +
          "route 2 blesses by relaxing both normative mirrors to `FnParam ::= Ident " +
          '(":" Type)?`. Registered: ' +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Precondition: the note channel carries load-phase parse codes at all.
      // Read over the WHOLE settled session (the refused theta's note lands at
      // boot, outside the per-drive slice below).
      const bootNotes: string[] = [];
      for (const entry of handle.sessionManager.getEntries()) {
        const e = entry as { customType?: string; content?: unknown };
        if (e.customType !== "theta-system-note") continue;
        if (typeof e.content === "string") bootNotes.push(e.content);
        else if (Array.isArray(e.content)) {
          for (const part of e.content) {
            const t = (part as { text?: string }).text;
            if (typeof t === "string") bootNotes.push(t);
          }
        }
      }
      expect(
        bootNotes.join("\n"),
        "bug-0150 precondition unmet: no `theta-system-note` entry names the " +
          "already-live code `" + CASE_CODE + "` for the `let P = 1` theta — the " +
          "load-diagnostic routing this cell relies on is not reaching the channel, " +
          "so the per-drive note ABSENCE asserted below could pass vacuously. Notes: " +
          JSON.stringify(bootNotes),
      ).toContain(CASE_CODE);

      // One real live turn through the registered command.
      const turn = await driveSlashCaptureTurn(handle, "/cellcnoannot");

      // Real observable 2 (positive, deterministic): the rendered query text
      // the theta CODE computed and sent. Its presence proves the unannotated
      // parameter bound positionally and its value was read by the body — so
      // the note-absence assertion below is not standing in for a drive that
      // never ran.
      expect(
        turn.userTexts.join("\n"),
        "bug-0150: the driven turn's outbound render does not carry the sentinel the " +
          "unannotated-parameter function returned — the parameter did not bind, the " +
          "body did not read it, or the query never rendered, so the note-absence " +
          "assertion below would be vacuous. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain(SENTINEL);

      // Real observable 3: the fail-closed note channel is SILENT for this
      // drive. Every fail-closed ending of a top-level drive lands here, so
      // absence is the success observable for the blessed shape.
      expect(
        turn.systemNotes,
        "bug-0150: the drive of a theta whose `fn` parameter carries no type " +
          "annotation landed a `theta-system-note` — the blessed shape must reach a " +
          "clean ending on every channel (no SLSH-3 err note, no cancellation, no " +
          "panic framing). Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
