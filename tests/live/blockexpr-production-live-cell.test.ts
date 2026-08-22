// Bug 0082 — the `BlockExpr` production, standalone live registration + turn
// cell (the fixed surface is theta LOAD,
// REGISTRATION, and RUNTIME EVALUATION, so unlike the sibling live cells this
// file mirrors it also drives ONE live turn over the fixed shape itself, not
// merely over a control sibling).
//
// This cell mirrors tests/live/reserved-keyword-object-pattern-head-live-cell.test.ts
// in shape and harness, but the DIRECTION is inverted: that bug needed a
// previously-ADMITTED shape to become REFUSED; bug 0082 needs a previously
// REFUSED shape — a `{ … }` in `let`-RHS or `match`-arm-body position — to
// become ADMITTED and to evaluate correctly end to end.
//
// Pre-fix (bug 0082 §Reproduction, re-measured against this file's own
// fixture): a `let`-RHS block and a `match`-arm block both parse to
// `theta/parse/bare-object-literal` (the shared builder,
// src/parser/theta-document.ts), an error-severity `theta/parse/*`
// diagnostic, which denies registration (`hasLoadParseError`,
// src/extension/production-composition.ts). Post-fix (bug 0082 §Fix,
// recommendation: option 2 implemented as option 1's node with a
// position-gated parse) the same source parses to a `BlockExpr` at both
// admitted sites, evaluates through the existing `executeBlock` in a child
// scope, and the theta registers and drives.
//
// This cell proves the fix through the real shipped load path —
// `session_start` (→ `resources_discover`) → `composeExtensionInstance` — over
// a REAL on-disk `.pi/theta/` discovery walk driven by `bootShippedExtension`
// (tests/live/harness.ts), then drives ONE live turn of the block-expr theta
// so the cell also witnesses the runtime path (`evalExpr`'s `"block"` case,
// src/runtime/statement-executor.ts) executable end to end on a real model —
// not merely that the parser stopped refusing it.
//
// Observables, per AGENTS.md "Assert on real observables, not on `prompt()`
// resolving":
//   - `handle.command(stem)` / `handle.registeredNames()`, read off the real
//     `ExtensionRunner` after the real `session_start` → `pi.registerCommand`
//     step: the block-expr theta must be PRESENT post-fix (it is ABSENT
//     pre-fix — that is this cell's red direction).
//   - `turn.userTexts`, the QRY-18 rendered template read off the settled
//     in-memory `SessionManager`: the block's computed value — produced by
//     statements that ran BEFORE the tail, at BOTH admitted sites (a `let`-RHS
//     block and a `match`-arm block) — appears in the outbound render, which
//     is deterministic and independent of the model's reply.
//   - `turn.systemNotes`, the `theta-system-note` channel: every fail-closed
//     ending of a top-level drive lands there, so their absence is the
//     drive's success signal even though `prompt()` resolves either way.
// The stochastic `turn.text` is deliberately not asserted; `resolves.toBeDefined()`
// on `prompt()` alone is deliberately never used as the pass condition.
//
// Fixture arithmetic (so the label string is a fixed, non-stochastic oracle):
//   `let base = { let y = 1  y + 1 }`               → base = 2
//   `match base { 2 => { let bonus = 10  base + bonus }, _ => 0 }` → 12
// Both sites carry a statement (`let`) BEFORE their tail expression, so a fix
// that merely accepted a bare `{ tailExprOnly }` without threading the
// statement list through `executeBlock` would compute the wrong number and
// this cell's rendered-value assertion would red for the right reason.
//
// Subagent child-process launch: NOT reached. The theta is `mode: prompt` with
// a single `@`-query and no `tools:`, so no query-time tool-call loop and no
// RFC-0006 subagent-child spawn occurs. `harness.ts` carries the
// `#subagent-child-pins` module-scope setters regardless (inherited by
// importing it).
//
// RED / GREEN (AGENTS.md "Verify both directions"), proved by hand during
// verification with the SAME temporary neutralisation used for the offline
// witness (`parseExpressionAtBlockSite` reverted to call `parseExpression()`
// unconditionally): with the fix neutralised, BOTH admitted-site braces parse
// as bare object literals, `hasLoadParseError` denies registration, and the
// "must be PRESENT" assertion reds with `handle.command(BLOCK_STEM)` returning
// `undefined` — before the live turn is ever driven (zero tokens spent on the
// red path, since registration is decided at load). Restored, the theta
// registers and the live turn's rendered value matches the fixture's own
// arithmetic oracle above.

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";

/** The slash stem the block-expr theta must register under. */
const BLOCK_STEM = "cellemainblockexpr";

/** The slash stem a block-free control theta registers under (sanity precondition). */
const CONTROL_STEM = "cellemaincontrol";

/**
 * The block-expr theta (bug 0082 §Fix): a `let`-RHS block (`base`) whose tail
 * follows one statement, and a `match`-arm block (the `2` arm) whose tail
 * follows one more statement — the two admitted expression-position block
 * sites grammar.md:114 names, both exercised in the SAME source. Renders the
 * final integer into the outbound `@`-query template so its value is the
 * cell's deterministic oracle.
 */
const BLOCK_THETA = (
  [
    "---",
    "mode: prompt",
    "---",
    "let base = {",
    "  let y = 1",
    "  y + 1",
    "}",
    "let selected = match base {",
    "  2 => {",
    "    let bonus = 10",
    "    base + bonus",
    "  },",
    "  _ => 0,",
    "}",
    "@`Reply with exactly this word and nothing else: blockexpr-${selected}`",
  ].join("\n") + "\n"
);

/**
 * A block-free control over the same arithmetic and the same `@`-query shape
 * — registers and drives both before and after bug 0082's fix, so a discovery
 * or registration regression independent of this bug reds THIS assertion
 * first rather than the block-expr assertion vacuously.
 */
const CONTROL_THETA = (
  [
    "---",
    "mode: prompt",
    "---",
    "let base = 2",
    "let selected = match base {",
    "  2 => 12,",
    "  _ => 0,",
    "}",
    "@`Reply with exactly this word and nothing else: blockexpr-${selected}`",
  ].join("\n") + "\n"
);

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * block-expr drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

describe("bug 0082 — a `let`-RHS block and a `match`-arm block both register and drive at live production load", () => {
  it("registers the block-expr theta (absent pre-fix) and drives it to the block-computed value", async () => {
    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      {
        source: "project",
        stem: CONTROL_STEM,
        text: CONTROL_THETA,
      },
      {
        source: "project",
        stem: BLOCK_STEM,
        text: BLOCK_THETA,
      },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      // Precondition: the block-free control must register before the fixed
      // observable means anything — an empty registered set would satisfy the
      // "must be present" assertion below vacuously if read backwards, and
      // would hide an unrelated discovery regression (no silent skipping).
      expect(
        handle.command(CONTROL_STEM),
        "bug-0082 precondition unmet: the block-free control did not " +
          "register — discovery or registration regressed independent of " +
          "bug 0082, so the block-expr assertion below cannot witness " +
          "anything. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // The fixed observable: the block-expr theta must be PRESENT — read off
      // the settled `ExtensionRunner`, never a `prompt()` resolution.
      // Pre-fix, BOTH `{ … }` sites in `BLOCK_THETA` parse to
      // `theta/parse/bare-object-literal` and `hasLoadParseError` denies
      // registration, so this is `undefined` there (this cell's red
      // direction).
      expect(
        handle.command(BLOCK_STEM),
        "bug-0082: the block-expr theta (a `let`-RHS block and a " +
          "`match`-arm block, each with a statement before its tail) did " +
          "not register — the `{ … }` at one or both admitted sites still " +
          "parsed as a bare object literal " +
          "(`theta/parse/bare-object-literal`) instead of a `BlockExpr`, and " +
          "the load-time parse-error gate denied registration. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.registeredNames(),
        "bug-0082: the block-expr theta's slash name must appear in " +
          "the registered set.",
      ).toContain(BLOCK_STEM);

      // The runtime path end to end: ONE live turn, with the block-computed
      // value carried in the deterministic outbound render. `base` runs one
      // statement then its tail (1 → 2); the selected `match` arm runs one
      // more statement then its tail (bonus 10 + base 2 → 12) — so the
      // rendered label is the fixed oracle `blockexpr-12`, never a stochastic
      // read of the model's reply.
      const turn = await driveSlashCaptureTurn(handle, `/${BLOCK_STEM}`);
      expect(
        turn.userTexts.join("\n"),
        "bug-0082: the block-expr theta's `let`-RHS block and " +
          "`match`-arm block must both run their statement(s) before their " +
          "tail and produce the fixture's own arithmetic oracle " +
          "(`blockexpr-12`) in the outbound query render. userTexts: " +
          JSON.stringify(turn.userTexts),
      ).toContain("blockexpr-12");
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "bug-0082: the block-expr theta's drive must end clean — a " +
          "fail-closed `theta-system-note` here means the `BlockExpr` " +
          "evaluation path (`evalExpr`'s `\"block\"` case, " +
          "src/runtime/statement-executor.ts) broke at runtime despite " +
          "parsing clean. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
