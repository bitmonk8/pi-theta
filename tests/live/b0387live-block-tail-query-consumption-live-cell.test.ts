// Bug 0387 — a query at a value-position BlockExpr tail (`let r = { … @`q` }`)
// must bind a `Result` VALUE so a downstream `match r { Ok(v) …, Err(e) … }`
// consumes it, instead of binding the raw payload (Ok side → MatchError panic)
// or aborting the theta at the effect site (Err side). The offline witness
// (tests/b0387-block-expr-tail-query-consumption.test.ts) proves the seam over
// the real `executeBody`; THIS cell proves the same fix end to end through the
// real shipped load + drive path on a live model, because the fix changes the
// DRIVE OUTCOME of the block-tail-query-consumed-by-`match` input class (a
// runtime disposition, not a parse/registration change — the block-expr with a
// query tail already parsed and registered pre-fix).
//
// Spec anchors (bug 0387 §Fix / §Expected): QRY-8 (a query never throws; both
// forms return a `Result`), grammar.md §Block expressions ("value is the tail
// expression"), error-model.md:10 (an `Err` reaches the fail arm "only when …
// not consumed by a caller `match`"), bug 0307's value-position Err-binding law
// and bug 0351's value-position Ok-binding law.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `turn.systemNotes`, the `theta-system-note` channel: pre-fix the outer
//     `match` panics (`MatchError`, Ok side) or the block-tail `Err` aborts the
//     drive (Err side), and EITHER fail-closed ending lands a note here; the
//     fixed drive lands NONE, so their absence is the fix's success signal even
//     though `prompt()` resolves in both worlds.
//   - `turn.userTexts`, the QRY-18 rendered templates read off the settled
//     in-memory `SessionManager`: post-fix the outer `match` resolves to an arm
//     and that arm's own `@`-query renders its deterministic tag
//     (`b0387arm`) into the outbound turn — an outbound-render fact independent
//     of the model's reply. Pre-fix the arm query never renders (the `match`
//     panics before it runs), so the tag is ABSENT — this cell's red direction.
//
// The block-tail arithmetic ask (`318 + 549`) returns `Ok` on any normal live
// turn, so the fixed drive takes the `Ok` arm; the `Err` arm carries the same
// `b0387arm` token so the render assertion witnesses "the `match` consumed `r`
// as a branded `Result` and dispatched an arm" robustly regardless of which
// arm a given live turn selects — the fix, not the arm choice, is what the
// assertion pins. The stochastic `turn.text` is deliberately not asserted.
//
// Task-framed discriminators only (a verbatim-echo demand draws bug-0243
// refusals): the block-tail query is a fixed-pair arithmetic ask, and the arm
// tag is a context label the theta CODE emits, not a reply the model must echo.
//
// Subagent child-process launch: NOT reached (`mode: prompt`, no `tools:`),
// so no query-time tool-call loop and no RFC-0006 subagent-child spawn; the
// `#subagent-child-pins` module-scope setters in harness.ts are inherited by
// importing it regardless.
//
// RED / GREEN (AGENTS.md "Verify both directions"), proved by hand during
// verification: with the fix neutralised (`executeBlock`'s tail reverted to the
// hard-coded `evalExpr(block.tail, env, deps, true)`), the block-tail query
// binds the raw payload, the outer `match` panics, a fail-closed note appears
// and the `b0387arm` tag is ABSENT — this cell reds. Restored, the drive ends
// clean and the arm tag renders.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem the block-tail-query theta registers under. */
const BLOCK_STEM = "cellb0387blocktailquery";

/** The slash stem the brace-less control theta registers under (precondition). */
const CONTROL_STEM = "cellb0387control";

/**
 * The block-tail-query theta (bug 0387 §Reproduction B1/B2): a `let`-RHS
 * BlockExpr whose sole tail is an `@`-query, bound to `r` and consumed by an
 * outer `match`. This is the bug's verified parse (`let r = { @`q` }` yields
 * `init.kind === "block"` with the query as `body.tail`); a preceding
 * statement would demote the trailing bare query to a discarded action and the
 * block would draw `theta/parse/block-expr-missing-tail` — a parse concern of
 * bug 0082, not the runtime disposition bug 0387 targets. Post-fix `r` binds
 * the query's `Result` and the `match` dispatches an arm whose own `@`-query
 * renders the `b0387arm` tag; pre-fix `r` binds the raw payload and the `match`
 * panics before any arm renders.
 */
const BLOCK_THETA = (
  [
    "---",
    "mode: prompt",
    "---",
    "let r = {",
    "  @`What is 318 plus 549? Answer with the number only.`",
    "}",
    "match r {",
    "  Ok(v) => @`Context tag b0387arm-ok. Reply ok.`,",
    "  Err(e) => @`Context tag b0387arm-err. Reply ok.`,",
    "}",
  ].join("\n") + "\n"
);

/**
 * A brace-less control over the same query-then-`match` shape (bug 0387
 * §Reproduction B3 — the 0351 landed path): registers and drives clean before
 * AND after bug 0387's fix, so a discovery/registration regression independent
 * of this bug reds THIS assertion first rather than the block-expr one
 * vacuously.
 */
const CONTROL_THETA = (
  [
    "---",
    "mode: prompt",
    "---",
    "let r = @`What is 318 plus 549? Answer with the number only.`",
    "match r {",
    "  Ok(v) => @`Context tag b0387arm-ok. Reply ok.`,",
    "  Err(e) => @`Context tag b0387arm-err. Reply ok.`,",
    "}",
  ].join("\n") + "\n"
);

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * fixed block-tail-query drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/** The arm-tag token both arms carry; its presence witnesses a dispatched arm. */
const ARM_TAG = "b0387arm-";

describe("bug 0387 — a block-tail query bound by `let` and consumed by `match` drives clean at live production load", () => {
  it("drives a `let r = { … @`q` }` then `match r { Ok/Err }` theta without a fail-closed abort, dispatching an arm", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: CONTROL_STEM, text: CONTROL_THETA },
      { source: "project", stem: BLOCK_STEM, text: BLOCK_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: both thetas must register before the fixed observable
      // means anything — an unregistered theta would satisfy nothing and would
      // hide an unrelated discovery/registration regression (no silent
      // skipping). The block-tail-query theta already PARSES pre-fix (the fix
      // is runtime-only), so both are expected present in both worlds.
      expect(
        handle.command(CONTROL_STEM),
        "bug-0387 precondition unmet: the brace-less control did not register — " +
          "discovery or registration regressed independent of bug 0387. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(BLOCK_STEM),
        "bug-0387 precondition unmet: the block-tail-query theta did not register — " +
          "the block-expr parse (bug 0082) regressed, not the runtime disposition bug 0387 " +
          "targets. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(handle, `/${BLOCK_STEM}`);

      // The fix's primary observable: NO fail-closed note. Pre-fix the outer
      // `match` panics on the raw payload (Ok side) or the block-tail `Err`
      // aborts the drive (Err side); either lands a fail-closed note here.
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0387: the block-tail-query drive must end clean — a fail-closed " +
          "`theta-system-note` means `r` bound the raw payload (outer `match` " +
          "MatchError panic) or the block-tail `Err` aborted at the effect site, " +
          "the exact pre-fix symptom. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // The runtime path end to end: the outer `match` dispatched an arm, so
      // that arm's `@`-query rendered its deterministic tag into the outbound
      // turn. This is only possible when `r` bound a branded `Result` — the
      // fix. Pre-fix the `match` panics before any arm renders, so the tag is
      // absent here (this cell's red direction).
      expect(
        turn.userTexts.join("\n"),
        "bug-0387: the outer `match` must resolve to an arm and render that " +
          "arm's `@`-query tag (`b0387arm-`) — proving `r` bound a branded " +
          "`Result` the `match` could consume. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain(ARM_TAG);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
