// H8a live witness — bug 0256: an inline object entry stranded behind
// `TypeParser.parseObject`'s exit on a missing entry separator is never
// visited, so a `params:` field declaring `p: 'array<{a: b c, d e}>'` loads
// with an EMPTY diagnostic list, REGISTERS, and lowers `p` to the permissive
// `{}` fragment — every argument accepted, no warning — the exact bytes
// `theta/parse/empty-schema-body` exists to refuse when an author writes `{}`
// directly
// (docs/bugs/0256-generic-argument-stranded-entry-registers-permissive.md
// §Reproduction (a) row a1, §(c) row c1, §Why it matters).
//
// §Fix, AS THE SETTLED ROUTE SCOPES IT
// (tests/inline-object-stranded-entry-refusal.test.ts is that route's offline
// witness). The refusal belongs where the entry becomes unreachable —
// `TypeParser.parseObject`'s entry-separator read `if (!this.eatPunct(","))
// { break; }` — and REUSES `theta/parse/malformed-schema-field`, whose Trigger
// reaches the inline interior and, rewritten at this change to two exclusions,
// states the missing-separator resync that carries the entry walk onto the
// stranded entry (docs/spec_topics/diagnostics/code-registry-parse.md:99), one
// line per stranded entry (bug 0129's count-consequence law). The colon-present
// entry `a: b c` that DID the stranding keeps its own verdict — bug 0252's
// locked class — and bug 0238's stray-close tolerance is untouched
// (§Non-goals).
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT. The offline witness pins
// `parseThetaDocument`'s diagnostic bytes and `loweredSchema` bytes directly.
// This route moves a REGISTRATION outcome at the verbatim `params:` position
// (§Reproduction (b) row b9, §(c)), and no offline cell observes the real
// discovery → load → `pi.registerCommand` path deciding it. §Fix's own "Live
// cover" clause states the obligation in those words: "the route changes a
// registration outcome at the `params:` position, so a live cell must show the
// carrier absent from the registered set while its byte-neighbour control
// registers and drives a real turn". This cell runs the shipped production
// composition root (`bootShippedExtension`, ./harness), the same path
// tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts — the
// nearest sibling mirror, whose delivered reach this report extends — uses.
//
// THREE PARTS:
//   (1) OFFENDER — a theta whose `params:` field is `p: 'array<{a: b c, d e}>'`
//       — must be ABSENT from the registered set: the refusal is
//       error-severity `theta/parse/*`, and `hasLoadParseError`
//       (src/extension/production-composition.ts) then withholds registration.
//       At HEAD (pre-fix) this theta registers with zero diagnostics, which is
//       the class itself.
//   (2) CONTROL — the same file with the interior's two entries written
//       well-formed (`p: 'array<{a: integer, m: integer}>'`) and nothing else
//       changed. It must REGISTER and drive a REAL turn, so the offender's
//       absence is bounded to the stranded entry rather than to the
//       inline-object-inside-a-generic `params:` shape, the binder or the
//       workspace. The control keeps the SAME enclosure as the offender — an
//       inline object inside a generic argument — because that enclosure is
//       what removes the recogniser gate (§Reproduction (d) d2), and a control
//       written unwrapped would not bound it.
//   (3) A precondition control (`b0256livectl`), an ordinary `mode: prompt`
//       theta in the same workspace, registration-only, so a missing
//       registration above cannot be misattributed to a broken workspace.
//
// SENTINEL DISCIPLINE: the control's drive discriminator is the ANSWER to
// arithmetic over two bound scalar `params:` fields (263 + 514 = 777) — never
// a "reply with exactly this string" echo, which current models read as prompt
// injection (AGENTS.md; bug 0243), and never a narrative framing the value as
// unseen tool output. 777 is computable only from two values that BOTH reached
// the rendered body. The arithmetic runs over `x` and `y` rather than over
// fields of `p`, because `p`'s own lowered schema is the permissive `{}` at
// both columns alike — `lowerTypeExpr`'s generic arm hoists no argument (bug
// 0251 *Residuals* item 2, measured unmoved at §Reproduction (f) f2) — so a
// field of `p` is not a value the contract pins and would be a stochastic
// oracle.
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

/** The two declared scalar values the slash argument names; their sum is the oracle. */
const X_VALUE = 263;
const Y_VALUE = 514;
/** 263 + 514 — computable only from values that BOTH reached the rendered body. */
const SUM = String(X_VALUE + Y_VALUE);

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0256LIVE-BOUND";

const PRECONDITION_STEM = "b0256livectl";
const CONTROL_STEM = "b0256livecontrol";
const OFFENDER_STEM = "b0256liveoffender";

/**
 * One theta over a `params:`-supplied inline object type nested in a GENERIC
 * ARGUMENT — the one enclosure that removes the recogniser gate
 * (§Reproduction (d) d2) — differing ONLY in whether the interior's first entry
 * carries a junk tail that strands the entry behind it. The two scalar fields
 * beside it carry the drive's oracle; the body interpolates both behind a
 * committed marker and then asks for their sum, so the drive carries two
 * independent observables: the deterministic outbound render (`userTexts`) and
 * the model's arithmetic answer.
 */
function paramsTheta(type: string): string {
  return [
    "---",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${type}'`,
    "  x: integer",
    "  y: integer",
    "---",
    "@`" +
      BODY_MARKER +
      " x=${x} y=${y}. What is ${x} plus ${y}? Answer with the number only.`",
    "",
  ].join("\n");
}

/**
 * The subject — the first entry's type text `b` is followed by the junk tail
 * `c`, so `TypeParser.parseObject`'s field loop breaks at the entry separator
 * it never reads and the keyless entry `d e` behind it is never visited. At
 * HEAD (pre-fix) this reports `[]`, registers, and lowers `p` to the permissive
 * `{}` (§Reproduction (a) row a1).
 */
const OFFENDER = paramsTheta("array<{a: b c, d e}>");

/**
 * The control: the same file with both entries written well-formed. It carries
 * no junk tail and no keyless entry, so the field loop visits both entries and
 * refuses neither, at HEAD and after the fix alike.
 */
const CONTROL = paramsTheta("array<{a: integer, m: integer}>");

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

describe("bug 0256 live: a `params:` field whose inline object interior strands an entry behind the field loop's exit is REFUSED at live production load and un-registers the theta, while its well-formed byte-neighbour control at the same generic-argument enclosure registers and drives", () => {
  it("keeps `p: 'array<{a: b c, d e}>'` out of the registered set while `p: 'array<{a: integer, m: integer}>'` registers and completes a real turn over both bound scalar fields", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the offender carries the refusal ALONE (bug 0129's
    // count-consequence law) and the control carries none, so a neutralised
    // fix reds here before a single token is spent.
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      "attribution: the stranded keyless entry `d e` must draw one " +
        "theta/parse/malformed-schema-field line and nothing else — at HEAD (pre-fix) this list " +
        "is EMPTY, which is bug 0256 itself. A SECOND line here would mean the fix also refused " +
        "the colon-present entry `a: b c` that stranded it, which is bug 0252's locked class " +
        "(§Non-goals)",
    ).toEqual([`error theta/parse/malformed-schema-field: ${MALFORMED_FIELD_MESSAGE}`]);
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
      "attribution: the control (both entries well-formed, same generic-argument enclosure) " +
        "must carry zero diagnostics — the fix must not over-refuse an inline object type that " +
        "strands nothing",
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
        "the control `p: 'array<{a: integer, m: integer}>'` did not register — the fix " +
          "over-refuses a well-formed inline object type inside a generic argument, or such a " +
          "`params:` theta cannot register in this harness at all (check the `bind_model:` " +
          "chain). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      // (1) OFFENDER: the fixed observable, read off the settled
      // `ExtensionRunner` — never a `prompt()` resolution. At HEAD (pre-fix)
      // this theta registers with an empty diagnostic list and hands the
      // provider the permissive `{}` for `p`.
      expect(
        handle.command(OFFENDER_STEM),
        "`params: p: 'array<{a: b c, d e}>'` REGISTERED — the entry stranded behind " +
          "`TypeParser.parseObject`'s exit at the junk tail `b c` is still never visited, so " +
          "the document loads with no diagnostic and `p` lowers to the permissive `{}` that " +
          "accepts every argument. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeUndefined();
      expect(
        handle.registeredNames(),
        "the refused theta's slash name must not appear in the registered set.",
      ).not.toContain(OFFENDER_STEM);

      const controlTurn = await driveSlashCaptureTurn(
        handle,
        `/${CONTROL_STEM} p is an empty list, x is ${String(X_VALUE)} and y is ${String(Y_VALUE)}`,
      );
      expect(
        controlTurn.userTexts.join("\n"),
        "the control's outbound turn did not render both bound scalar `params:` fields — the " +
          "binder did not bind `{x, y}` for a contract that declares them, so the offender's " +
          "absence above would be unattributable. Outbound: " +
          JSON.stringify(controlTurn.userTexts) +
          "; notes: " +
          JSON.stringify(controlTurn.systemNotes),
      ).toContain(`${BODY_MARKER} x=${String(X_VALUE)} y=${String(Y_VALUE)}`);
      expect(
        controlTurn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the control's drive ended fail-closed. Notes: " + JSON.stringify(controlTurn.systemNotes),
      ).toEqual([]);
      expect(
        controlTurn.text,
        "the control's live reply did not contain the arithmetic oracle " +
          `(${SUM}, from ${String(X_VALUE)} plus ${String(Y_VALUE)}) — the sum is computable ` +
          "only from two values that BOTH reached the rendered body. Reply: " +
          JSON.stringify(controlTurn.text),
      ).toContain(SUM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
