// Standalone live cell — bug 0249's field-boundary repair, end to end
// (docs/bugs/0249-reserved-keyword-keys-no-parser-leaf-backstop.md
// §Reproduction B4/B6, §Expected 3, §Fix constraint 4). Standalone by design,
// no numeric id in the FILENAME (the precedent this file mirrors in shape:
// tests/live/reserved-keyword-misfire-faces-live-cell.test.ts and its own
// mirror tests/live/reserved-keyword-remaining-positions-live-cell.test.ts);
// fixture stems still carry the bug-number stem `b0249live-*`.
//
// WHAT THIS COVERS THAT tests/live/inline-object-key-registration-denial-live-cell.test.ts
// DOES NOT. That cell proves §Fix constraint 8's two named shapes deny
// registration. This cell proves two further things live, neither reducible
// to that one:
//
//   (1) THE FIELD-BOUNDARY REPAIR, end to end. At HEAD (pre-fix)
//       `let x = [schema T { a: "s", let: nope }]` (§Reproduction B6) drops
//       the reserved key, its `:` and re-enters the field loop AT THE VALUE:
//       `nope` becomes the next field NAME, so the document reports only
//       `extra field 'nope'` and REGISTERS — the wrong field set is silently
//       admitted, not merely a permissive one. After the fix the key reaches
//       `checkObjectExpr`'s `present` list itself, the refusal fires, and the
//       document is DENIED. This is a distinct live observable from the
//       registration-denial cell's B1 shape (`let: 1`, no field-boundary
//       shift): B6 is the shape whose PRE-fix registration outcome the fix
//       must also flip, and whose diagnostic bytes the offline witness's row
//       b6 pins as the sharpest cell in that file.
//   (2) THE FIX DOES NOT OVER-REACH A LEGITIMATE inline-object-type field and
//       a legitimate typed-object-literal key: a real live turn, driven
//       through both leaves this fix edits, whose reply is computable ONLY
//       from a value that crossed the typed-object-literal's field (edit 2's
//       admission arm) and was read back through the checker. No offline
//       cell drives a live turn over either leaf; this is what makes the
//       coverage END TO END rather than load-only.
//
// FIXTURES, THREE PAIRS:
//   - PRECONDITION: an unrelated `mode: prompt` theta, registration-only,
//     proving the workspace and discovery walk themselves work.
//   - CONTROL: `schema T { ok: integer }` and a typed-object-literal
//     `schema T { ok: 19 }`, with NO reserved spelling anywhere. REGISTERS,
//     and its drive asks a task-framed arithmetic question over the bound
//     value (19 * 27 = 513) — never a verbatim-echo demand (AGENTS.md; bug
//     0243).
//   - OFFENDER: `schema T { a: string }` / the §Reproduction B6 shape
//     `let x = [schema T { a: "s", let: nope }]`. Zero model turns for the
//     offender: the fixed observable is its ABSENCE from the registered set,
//     read off the real `ExtensionRunner`, never a driven turn.
//
// OFFLINE ATTRIBUTION GUARD (AGENTS.md-shaped, mirrors
// tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts): the
// offender's and control's diagnostic bytes are asserted through the real
// `parseThetaDocument`, BEFORE the live host is required, so a neutralised
// fix reds here with zero tokens spent.
//
// SUBAGENT CHILD PINS: not reached. Every theta below is `mode: prompt` with
// no `tools:` and no `invoke(...)`, so no RFC-0006 child launches. `./harness`
// sets BOTH #subagent-child-pins plus the parent-pid carriage at module scope
// regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Token cost: one live drive (one binder pass plus one body turn).

import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { parseDoc } from "../helpers/e2e-s1";

/** The two declared values the drive's own theta body computes; their product is the oracle. */
const OK_VALUE = 19;
const MULTIPLIER = 27;
/** 19 * 27 — computable only from a value that crossed the typed-object-literal's field. */
const PRODUCT = String(OK_VALUE * MULTIPLIER);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0249LIVE-FIELD";

const PRECONDITION_STEM = "b0249livefieldctl";
const CONTROL_STEM = "b0249livefieldcontrol";
const OFFENDER_STEM = "b0249livefieldoffender";

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = ["---", "mode: prompt", "---", "1", ""].join("\n");

/**
 * The control: a legal typed-object-literal key (`ok`) read back through a
 * `let` binding and interpolated into the outbound turn. Drives both parser
 * leaves this fix edits (`TypeParser.parseObject`'s identifier pass never
 * runs here since `schema T { ok: integer }` is a DECLARATION, not an inline
 * object type — the leaf this control exercises end to end is
 * `parseObjectLiteral`'s field-name admission arm) with no reserved spelling
 * anywhere, so the fix must not narrow what a legitimate key can do.
 */
// Bracketed as `let t = [schema T { ... }]` — a single-element array literal,
// mirroring §Reproduction B1's own shape
// (`let x = [schema T { a: "s", let: 1 }]`). An UNBRACKETED
// `let t = schema T { ok: 19 }` mis-splits (§Reproduction C's class: the
// statement re-reads `schema T { ... }` as a schema DECLARATION rather than
// an expression, drawing `let-without-initialiser`), which is a parser
// mis-split this cell's control has no reason to exercise.
const CONTROL = [
  "---",
  "mode: prompt",
  "bind_model: anthropic/claude-haiku-4-5",
  "---",
  "schema T { ok: integer }",
  `let t = [schema T { ok: ${String(OK_VALUE)} }]`,
  "@`" +
    BODY_MARKER +
    " ok=${t[0].ok}. What is ${t[0].ok} times " +
    String(MULTIPLIER) +
    "? Answer with the number only.`",
  "",
].join("\n");

/**
 * The subject — §Reproduction B6 verbatim. At HEAD (pre-fix) this reports
 * `extra field 'nope'` ALONE and REGISTERS: the reserved key `let`, its `:`
 * and the value `nope` are silently discarded by the same drop-for-progress
 * branch, so the loop re-enters at `nope` and misreads it as the NEXT field's
 * name. After the fix the key reaches `fields`, the refusal fires against
 * `let`, and `unknown identifier 'nope'` replaces the fabricated
 * `extra field 'nope'` — an error-severity `theta/parse/*` diagnostic either
 * way, so the document is denied both before and after; what the fix changes
 * is WHICH diagnostic bytes withhold it (attribution guard below), and the
 * registration cell that isolates the boundary-preserving shape (`let: 1`,
 * no downstream identifier) is the sibling H8a-T cell.
 */
const OFFENDER = [
  "---",
  "mode: prompt",
  "---",
  "schema T { a: string }",
  'let x = [schema T { a: "s", let: nope }]',
  "1",
  "",
].join("\n");

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). The
 * control's drive must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

describe("live: bug 0249's field-boundary repair denies registration to `let x = [schema T { a: \"s\", let: nope }]` while a legal typed-object-literal key registers and drives a real turn", () => {
  it("keeps the field-boundary-shift offender out of the registered set while the legal control registers and completes a real turn over its typed-object-literal field", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender must NOT carry the pre-fix
    // `extra field 'nope'` misreading, and the control must carry zero
    // diagnostics — a neutralised fix reds here before a single token is
    // spent.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`).some((line) =>
        line.includes("extra-object-field") && line.includes("'nope'"),
      ),
      "attribution: the reserved key `let` must not leave the loop re-reading `nope` as the " +
        "next field name — a red here is the pre-fix field-boundary shift, bug 0249 itself",
    ).toBe(false);
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`).some((line) =>
        line.includes("theta/parse/reserved-keyword-as-identifier") && line.includes("'let'"),
      ),
      "attribution: the reserved key `let` must draw the reserved-keyword refusal — a red here " +
        "means the fix never reached this shape",
    ).toBe(true);
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the legal typed-object-literal key `ok` must draw zero diagnostics — the fix " +
        "must not over-refuse a well-formed key",
    ).toEqual([]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CONTROL_STEM, text: CONTROL },
      { source: "project", stem: OFFENDER_STEM, text: OFFENDER },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the field-boundary " +
          "repair, would explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // CONTROL: registers, and its drive proves the whole path the offender
      // is denied — bind, parse the typed object literal, read the field
      // back, render, turn — is live in this workspace.
      expect(
        handle.command(CONTROL_STEM),
        "the legal typed-object-literal control did not register — the fix over-refuses a " +
          "well-formed key, or a theta declaring a schema and a typed constructor cannot " +
          "register in this harness at all. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution.
      expect(
        handle.command(OFFENDER_STEM),
        "bug-0249: `let x = [schema T { a: \"s\", let: nope }]` REGISTERED — the field-boundary " +
          "repair did not reach the live load path. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the field-boundary-shift offender's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(
        handle,
        `/${CONTROL_STEM}`,
      );
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render the typed-object-literal's bound field — the " +
          "binder did not read `t.ok` back from a legal typed-object-literal key, so the " +
          "offender's absence above would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} ok=${String(OK_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${PRODUCT}, from ${String(OK_VALUE)} times ${String(MULTIPLIER)}) — the product is ` +
          "computable only from the value read back through the typed-object-literal's field. " +
          "Reply: " + JSON.stringify(controlTurn.text),
      ).toContain(PRODUCT);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
