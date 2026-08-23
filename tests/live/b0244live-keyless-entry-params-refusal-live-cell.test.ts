// H8a live witness — bug 0244: `TypeParser.parseObject`'s two discard arms
// consumed a KEYLESS inline-object entry (one spelling no top-level `:`) with
// no emission, so a `params:` field declaring `p: '{void}'` or
// `p: '{a: integer, void}'` loaded and REGISTERED with an empty diagnostic
// list and lowered `p` to the permissive `{}` fragment — every value accepted,
// no warning — the exact bytes `theta/parse/empty-schema-body` exists to
// refuse
// (docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md
// §Reproduction (e) rows e7–e8, §Why it matters).
//
// §Fix, AS THE OPERATOR ADJUDICATION SCOPES IT
// (tests/inline-object-keyless-entry-refusal.test.ts is that scoping's
// offline witness). `TypeParser.parseObject`'s colon-gate failure arm and its
// non-`ident` field-name-position arm each buffer one
// `theta/parse/malformed-schema-field` — the declaration position's own row,
// REUSED with a widened Trigger — for a KEYLESS, stray-close-free entry before
// `skipMalformedEntry` / `next()` carries it away; the buffer flushes into
// `parseTypeExpression`'s diagnostics array only when the interior's own
// closing `}` is spelled. A colon-present entry is out of reach whatever junk
// follows the colon (bug 0252's business); a keyless entry carrying a stray
// depth-0 close token keeps bug 0238's silent tolerant registration.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT. The offline witness
// pins `parseThetaDocument`'s diagnostic bytes and `loweredSchema` bytes
// directly. This route moves a REGISTRATION outcome at the verbatim `params:`
// position the bug's §Reproduction (b) row b9 and §(e) rows e7–e8 name as the
// wire-facing half of the harm, and no offline cell observes the real
// discovery → load → `pi.registerCommand` path deciding it. §Fix's own
// "Witness" clause says live cover is owed "only if the refusal changes what
// reaches a provider-facing schema" — §(e) rows e7–e8 say it does, by
// refusing the document that produced them. This cell runs the shipped
// production composition root (`bootShippedExtension`, ./harness), the same
// path `tests/live/b0252live-brace-and-angle-annotation-refusal-live-cell.test.ts`
// (the nearest sibling mirror, bug 0252's fence in the SAME adjudication)
// uses.
//
// THREE PARTS:
//   (1) OFFENDER — a theta whose `params:` field is `p: '{a: integer, m}'`, a
//       plain lowercase keyless second entry (FIFTEEN's row shape, never the
//       reserved-keyword `void` spelling used above, which pulls in an
//       unrelated argument-binding complication) — must be ABSENT from the
//       registered set: the refusal is error-severity `theta/parse/*`, and
//       `hasLoadParseError` (src/extension/production-composition.ts) then
//       withholds registration. At HEAD (pre-fix) this theta registers, which
//       is the class itself.
//   (2) CONTROL — the byte-neighbour whose `params:` field spells the colon
//       the offender's second entry lacks (`p: '{a: integer, m: integer}'`)
//       and is otherwise the same file. It must REGISTER and drive a REAL
//       turn over BOTH bound `params:` fields, so the offender's absence is
//       bounded to the missing colon rather than to the inline-object
//       `params:` shape, the binder or the workspace.
//   (3) A precondition control (`b0244livectl`), an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the control's drive discriminator is the ANSWER to
// arithmetic over the TWO bound `params:` fields (19 * 27 = 513) — never a
// "reply with exactly this string" echo, which current models read as prompt
// injection (AGENTS.md; bug 0243). 513 is computable only from values that
// BOTH reached the rendered body.
//
// SUBAGENT CHILD PINS: not reached — every theta below is `mode: prompt` with
// no `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness (./harness) sets BOTH #subagent-child-pins plus the parent-pid
// carriage at module scope regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips,
// and every registration assertion carries the registered set in its message.
//
// OFFLINE ATTRIBUTION GUARD: the diagnostic block runs BEFORE the live host is
// required, so a neutralised fix reds here with zero tokens spent.
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

const MALFORMED_FIELD_MESSAGE =
  "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'";

/** The two declared values the slash argument names; their product is the oracle. */
const A_VALUE = 19;
const M_VALUE = 27;
/** 19 * 27 — computable only from values that BOTH reached the rendered body. */
const PRODUCT = String(A_VALUE * M_VALUE);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0244LIVE-BOUND";

const PRECONDITION_STEM = "b0244livectl";
const CONTROL_STEM = "b0244livecontrol";
const OFFENDER_STEM = "b0244liveoffender";

/**
 * One theta over a `params:`-supplied inline-object field, differing ONLY in
 * whether the interior's second entry (`m`, a plain lowercase identifier —
 * FIFTEEN's row shape, never the reserved-keyword `void` spelling that would
 * pull bug 0242's class into the fixture) spells its colon. The body
 * interpolates both bound fields behind a committed marker and then asks for
 * their product, so the drive carries two independent observables: the
 * deterministic outbound render (`userTexts`) and the model's arithmetic
 * answer.
 */
function paramsTheta(interior: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${interior}'`,
    "---",
    "@`" +
      BODY_MARKER +
      " a=${p.a} m=${p.m}. What is ${p.a} times ${p.m}? Answer with the number only.`",
    "",
  ].join("\n");
}

/**
 * The subject — the second entry `m` spells no top-level `:`. At HEAD
 * (pre-fix) this reports `[]` and registers, lowering `p` to
 * `{"type":"object","properties":{"a":{"type":"integer"}},"required":["a"],
 * "additionalProperties":false}` (§(e) row e5's fragment shape) — the entry
 * contributes no property either way, so the wire harm here is the SILENT
 * REGISTRATION, not a corrupted schema.
 */
const OFFENDER = paramsTheta("{a: integer, m}");

/** The byte-neighbour control: the same interior with the missing colon added. */
const CONTROL = paramsTheta("{a: integer, m: integer}");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
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

describe("bug 0244 live: a `params:` field whose inline object interior spells a keyless entry is REFUSED at live production load and un-registers the theta, while its byte-neighbour control (colon added) registers and drives", () => {
  it("keeps `p: '{a: integer, m}'` out of the registered set while `p: '{a: integer, m: integer}'` registers and completes a real turn over both bound fields", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries the refusal ALONE (bug 0129's
    // count-consequence law) and the control carries none, so a neutralised
    // fix reds here before a single token is spent.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the keyless `m` entry must draw one " +
        "theta/parse/malformed-schema-field line and nothing else — at HEAD (pre-fix) this list " +
        "is EMPTY, which is bug 0244 itself",
    ).toEqual([`error theta/parse/malformed-schema-field: ${MALFORMED_FIELD_MESSAGE}`]);
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the byte-neighbour control (colon added to the second entry) must carry " +
        "zero diagnostics — the fix must not over-refuse a well-formed inline-object interior",
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
        "the precondition control did not register — a broken workspace, not the refusal, would " +
          "explain the offender's absence too. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (2) CONTROL: registers, and its drive proves the whole path the
      // offender is denied — bind, render, turn — is live in this workspace.
      expect(
        handle.command(CONTROL_STEM),
        "the byte-neighbour control `p: '{a: integer, m: integer}'` did not register — the " +
          "fix over-refuses a well-formed `params:` interior, or an inline-object `params:` " +
          "theta cannot register in this harness at all (check the `bind_model:` chain). " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (1) OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution. At HEAD (pre-fix)
      // this theta registers with an empty diagnostic list and lowers `p` to
      // the permissive fragment §Reproduction (e) row e5 records.
      expect(
        handle.command(OFFENDER_STEM),
        "`params: p: '{a: integer, m}'` REGISTERED — the keyless `m` entry is still " +
          "silently discarded by `TypeParser.parseObject`'s resync, so the document loads with " +
          "no diagnostic and `p` lowers to an object schema with only `a` constrained. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the refused theta's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(
        handle,
        `/${CONTROL_STEM} a is ${String(A_VALUE)} and m is ${String(M_VALUE)}`,
      );
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound `params:` fields — the binder did " +
          "not bind `{p.a, p.m}` for a contract that declares them, so the offender's absence " +
          "above would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " +
          JSON.stringify(controlTurn.systemNotes),
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
          `(${PRODUCT}, from ${String(A_VALUE)} times ${String(M_VALUE)}) — the product is ` +
          "computable only from two values that BOTH reached the rendered body. Reply: " +
          JSON.stringify(controlTurn.text),
      ).toContain(PRODUCT);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
