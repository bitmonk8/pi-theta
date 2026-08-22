// H8a live witness -- bug 0238: a stray depth-0 CLOSE token in an inline
// object type underflowed `splitTopLevelSegments`' depth counter, so every
// entry behind it merged into one unkeyed segment. A `params:` field spelled
// `p: '{a: integer, b > c, m: integer}'` therefore loaded with an EMPTY
// diagnostic list, REGISTERED, and lowered `p` to a one-field `{a}` fragment
// whose `additionalProperties: false` REFUSES the field `m` the author
// declared -- §Reproduction (E) row E2 measured the envelope validator
// answering `must NOT have additional properties`, `additionalProperty: "m"`
// for `{"p": {"a": 1, "m": 2}}`, where the byte-neighbour control
// `{a: integer, m: integer}` (row E1) validates
// (docs/bugs/0238-stray-close-token-underflows-top-level-split.md).
//
// §Fix ROUTE (a) -- CLAMP TO MATCH, implemented as a TYPED opener stack rather
// than as §Fix (a)'s literal `Math.max(0, depth - 1)` sketch (the bare floor
// leaves §Reproduction row W15 unmoved, measured by the parent run:
// .pi/tmp/fixes/0238-premeasure.md). `>` closes only a `<`, `}` only a `{`,
// `)` only a `(`; a close token whose innermost OPEN frame is not its own
// matching opener (or none) is INERT. Applied in `splitTopLevelSegments` and
// `topLevelColon` (src/parser/params.ts) and in `TypeParser.skipMalformedEntry`
// (src/parser/type-grammar.ts), so the two inventories of one interior agree
// (§Expected behaviour 1). No diagnostic code is minted and no registry row
// moves. Symbol-level citations only: bug 0134
// (docs/bugs/0134-params-shift-induced-stale-citations.md) is the adjudicated
// stale-citation class for absolute line numbers into src/parser/params.ts,
// which this route edits.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT.
// `tests/inline-object-stray-close-token-split.test.ts` pins the diagnostic
// bytes, the lowered fragments and the E1/E2 validator rows directly at the
// `parseThetaDocument` boundary. No offline cell observes the real
// discovery->registration->BINDER path deciding whether a caller's value for
// the declared field `m` survives the envelope validator of a theta that
// registers either way. That is the INVERSE of the sibling 0237 cell's
// subject: 0237 stops a bad theta registering, 0238 makes an
// already-registering theta register with a CORRECT contract, so the live
// observable is a successful bind of a field HEAD refuses -- not an absence of
// registration. This cell drives that through the shipped production
// composition root (`bootShippedExtension`), mirroring
// `tests/live/inline-object-empty-field-type-truncation-live-cell.test.ts` and
// `tests/live/live-production-acceptance.test.ts`'s bug-0066 binder cell, and
// asserts on real observables -- `driveSlashCaptureTurn`'s deterministic
// `userTexts` (the exact outbound template the theta CODE rendered from the
// bound values) plus the `theta-system-note` channel read off the settled
// `SessionManager` -- never on `prompt()` merely resolving. This is the live
// cell §Fix "Witness"'s last sentence owes ("A live cell is owed under either
// route ... because both change a registration outcome").
//
// THREE PARTS:
//   (1) OFFENDER -- `p: '{a: integer, b > c, m: integer}'` (§Reproduction row
//       W2, the row the class is named for) REGISTERS, and a real drive whose
//       slash argument names BOTH declared values binds both: the binder's
//       `args.p` carries `a` AND `m`, the envelope validator accepts it, the
//       body renders both values into its outbound turn, and the drive ends
//       with NO fail-closed `theta-system-note` (no `returned Err:`, no
//       `cancelled`, no `aborted`). At HEAD the fragment forbids `m`
//       (§Reproduction E2), so the bind cannot carry it.
//   (2) CONTROL -- the byte-neighbour `p: '{a: integer, m: integer}'`
//       (§Reproduction row W1), identical in every other byte of the file, put
//       through the IDENTICAL drive. The offender converging on the control IS
//       the fix, so both halves assert the same observables and the offline
//       attribution guard below pins their lowered fragments byte-equal modulo
//       the `$defs` content hash.
//   (3) A precondition control (`b0238livectl`) -- an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the drive discriminator is the ANSWER to the theta's
// own arithmetic question over the two INTERPOLATED bound values (17 * 23 =
// 391) -- never a "reply with exactly this string" echo, which reads as prompt
// injection to current models and draws the documented sentinel-refusal class
// (AGENTS.md). 391 is computable only from values that actually reached the
// body, so a bind that dropped `m` cannot produce it.
//
// SUBAGENT CHILD PINS: not reached -- every theta below is `mode: prompt` with
// no `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness (`./harness`) sets BOTH #subagent-child-pins plus the parent-pid
// carriage at module scope regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Bug 0030's file-scope `console.error` spy gates this file: the filtered
// capture (`thetaOwnedStderrLines`) must be empty.
//
// OFFLINE ATTRIBUTABLE GUARD: the attribution block runs BEFORE the live host
// is required, so a neutralised fix reds here with zero tokens spent.
//
// Token cost: two live drives (one binder pass + one body turn each). 

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { thetaOwnedStderrLines } from "./theta-stderr-prefixes";
import { parseDoc } from "../helpers/e2e-s1";

/** The two declared values the slash argument names; their product is the oracle. */
const A_VALUE = 17;
const M_VALUE = 23;
/** 17 * 23 -- computable only from values that BOTH reached the body. */
const PRODUCT = String(A_VALUE * M_VALUE);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0238-BOUND";

const PRECONDITION_STEM = "b0238livectl";
const CONTROL_STEM = "b0238livecontrol";
const OFFENDER_STEM = "b0238liveoffender";

/**
 * One `params:` theta over a single inline-object field `p`, differing ONLY in
 * the declared type text. Two fields inside `p` make this a genuine binder pass
 * (never `classifyBinderBypass`'s single-string bypass), which is why the
 * resolvable `bind_model:` is required for either sibling to register at all --
 * so a missing binder model cannot explain an absence instead of this bug.
 *
 * The body interpolates BOTH bound values behind a committed marker and then
 * asks for their product, so the drive carries two independent observables: the
 * deterministic outbound render (`userTexts`) and the model's arithmetic answer.
 */
function paramsTheta(fieldType: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${fieldType}'`,
    "---",
    "@`" +
      BODY_MARKER +
      " a=${p.a} m=${p.m}. What is ${p.a} times ${p.m}? Reply with only the resulting " +
      "integer digits and nothing else.`",
    "",
  ].join("\n");
}

/** §Reproduction row W2 -- the stray depth-0 `>` between the two declared fields. */
const OFFENDER = paramsTheta("{a: integer, b > c, m: integer}");

/** §Reproduction row W1 -- the byte-neighbour control the offender must converge on. */
const CONTROL = paramsTheta("{a: integer, m: integer}");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 2 + 2? Reply with only the resulting integer digits and nothing else.`",
  "",
].join("\n");

/** The slash argument naming both values in natural language (the binder's input). */
const SLASH_ARG = ` a is ${String(A_VALUE)} and m is ${String(M_VALUE)}`;

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). Both
 * drives must produce none of them. 
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

/**
 * The lowered `params:` schema of one source, with the `$defs` content hash
 * normalised away: the offender and the control hash DIFFERENT source text, so
 * only the fragment CONTENT can be compared, and content equality is exactly
 * "the offender converged on the control". 
 */
function normalisedLowering(text: string, path: string): string {
  const lowered = parseDoc(text, path).frontmatter?.params?.loweredSchema ?? null;
  return JSON.stringify(lowered).replace(/__inline_[0-9a-f]+/g, "__inline_HASH");
}

let consoleErrorSpy: MockInstance | undefined;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error");
});

afterEach(() => {
  const spy = consoleErrorSpy;
  try {
    const lines = (spy?.mock.calls ?? []).map((args) => args.map(String).join(" "));
    const offenders = thetaOwnedStderrLines(lines);
    expect(
      offenders,
      "bug 0018's live verification observable for this suite is a 0-byte stderr capture; this " +
        "spy caught theta-owned stderr line(s) instead: " +
        JSON.stringify(offenders),
    ).toEqual([]);
  } finally {
    spy?.mockRestore();
    consoleErrorSpy = undefined;
  }
});

describe("bug 0238 live: a params: field carrying a stray depth-0 close token registers a contract that ACCEPTS the field it declares, converging on its byte-neighbour control ", () => {
  it("binds both `a` and `m` for `p: '{a: integer, b > c, m: integer}'` through the real binder and drives clean, exactly as the control `{a: integer, m: integer}` does ", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): both siblings load with ZERO diagnostics -- this route mints
    // no code and refuses nothing here -- and the offender's lowered fragment
    // is byte-equal to the control's modulo the `$defs` hash. At HEAD the
    // offender lowers `{"a":{"type":"integer"}}` with `required ["a"]` and
    // `additionalProperties: false`, which is bug 0238 itself, so this block
    // reds on a neutralised fix before a single token is spent.
    expect(
      parseDoc(OFFENDER, `${OFFENDER_STEM}.theta`).diagnostics.map(
        (d) => `${d.severity} ${d.code}: ${d.message}`,
      ),
      "attribution: the offending params: theta must still load clean -- §Fix route (a) mints no " +
        "diagnostic code for this spelling, it repairs the segmentation",
    ).toEqual([]);
    expect(
      parseDoc(CONTROL, `${CONTROL_STEM}.theta`).diagnostics.map(
        (d) => `${d.severity} ${d.code}: ${d.message}`,
      ),
      "attribution: the byte-neighbour control must carry zero diagnostics -- the fix must not " +
        "disturb the good path",
    ).toEqual([]);
    expect(
      normalisedLowering(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the offender's lowered params: fragment must be byte-equal to the control's " +
        "(modulo the `$defs` content hash). A fragment missing `m` here is §Reproduction row W2 " +
        "at HEAD: the stray `>` still underflows the split's depth counter, so the declared " +
        "field `m` never reaches `properties` and `additionalProperties: false` then FORBIDS the " +
        "value the author declared (§Reproduction row E2).",
    ).toEqual(normalisedLowering(CONTROL, `${CONTROL_STEM}.theta`));
    expect(
      normalisedLowering(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: sanity -- the shared fragment must actually declare both fields, so the " +
        "equality above cannot be satisfied by two EMPTY lowerings",
    ).toContain('"required":["a","m"]');

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
        "the precondition control did not register -- a broken workspace, not the fix, would " +
          "explain the two params: thetas' behaviour too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // Both params: siblings register: the offender registers at HEAD too
      // (that is precisely why the class is silent), so registration is a
      // PRECONDITION here rather than the fixed observable.
      expect(
        handle.command(CONTROL_STEM),
        "the byte-neighbour control `p: '{a: integer, m: integer}'` did not register -- " +
          "precondition unmet (a two-field inline-object params: theta cannot register in this " +
          "harness at all, independent of this bug; check the `bind_model:` chain). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(OFFENDER_STEM),
        "`p: '{a: integer, b > c, m: integer}'` did not register -- §Fix route (a) repairs the " +
          "SEGMENTATION and refuses nothing at this spelling, so a withheld registration is an " +
          "over-refusal, not the fix. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // ---- (2) CONTROL: the reference drive, run FIRST so a provider-side
      // problem reds against the row that is green at HEAD too. ----
      const controlTurn = await driveSlashCaptureTurn(handle, `/${CONTROL_STEM}${SLASH_ARG}`);
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound values -- the binder did not bind " +
          "`{a, m}` for a contract that plainly declares them, so the offender's identical " +
          "assertion below would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} a=${String(A_VALUE)} m=${String(M_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${PRODUCT}, from ${String(A_VALUE)} * ${String(M_VALUE)}). Reply: ` +
          JSON.stringify(controlTurn.text),
      ).toContain(PRODUCT);

      // ---- (1) OFFENDER: the fixed observable. The SAME drive over the SAME
      // declared fields, through a contract HEAD lowers without `m`. ----
      const offenderTurn = await driveSlashCaptureTurn(handle, `/${OFFENDER_STEM}${SLASH_ARG}`);
      expect(
        offenderTurn.userTexts.join("\n"),
        "the offender's outbound turn did not render both bound values: the author declared `m` " +
          "and the registered contract did not carry it, so the binder's `args.p` could not " +
          "supply it (at HEAD the envelope validator answers `must NOT have additional " +
          "properties`, additionalProperty `m` -- §Reproduction row E2). Outbound: " +
          JSON.stringify(offenderTurn.userTexts) +
          "; notes: " + JSON.stringify(offenderTurn.systemNotes),
      ).toContain(`${BODY_MARKER} a=${String(A_VALUE)} m=${String(M_VALUE)}`);
      expect(
        offenderTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the offender's drive ended fail-closed -- a registered contract that forbids what it " +
          "declares refuses the bind instead of completing (§Expected behaviour 4). Notes: " +
          JSON.stringify(offenderTurn.systemNotes),
      ).toEqual([]);
      expect(
        offenderTurn.text,
        "the offender's live reply did not contain the arithmetic oracle " +
          `(${PRODUCT}, from ${String(A_VALUE)} * ${String(M_VALUE)}) -- the product is ` +
          "computable only from two values that BOTH reached the body. Reply: " +
          JSON.stringify(offenderTurn.text),
      ).toContain(PRODUCT);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
