// H8a live witness — bug 0251: a `params:` field whose declared inline-object
// type carries a segment the lowering discards (bug 0238's tolerated junk,
// `{a: integer, b > c, m: integer}`) used to render RAW into the binder
// system prompt while the forced-tool envelope schema encoded only `{a, m}`
// (docs/bugs/0251-tolerated-junk-type-text-renders-raw-into-binder-prompt.md
// §Actual behaviour / root cause). The prompt and the schema then described
// two different contracts over the same field, and the merge-gate captures
// this report cites (§Reproduction (b)) measured the live consequence: the
// spawned leg came back empty-stdout/empty-stderr/exit-0 on four of five
// runs over identical bytes, or produced off-task narration, because the
// model was handed a contract it could not satisfy under the tool schema it
// was forced through.
//
// §Fix projects the rendered `<type>` to what the lowering kept
// (`projectRenderedParamType`, src/parser/params.ts), so row a1's post-fix
// `Parameters:` line is `  p ({a: integer, m: integer}) required` — the
// control's line, for the contract the control's schema encodes.
//
// WHAT THIS COVERS THAT THE OFFLINE WITNESS DOES NOT. The offline witness
// (tests/binder-param-type-projection.test.ts) pins the rendered prompt line
// and the lowered fragment directly, plus (cell 8) the real dispatch's
// captured `context.systemPrompt` against a MOCKED `complete()`. No offline
// cell drives a REAL provider through the carrier theta end to end. This
// cell does: it plants a carrier-type theta in a live workspace, drives one
// binder pass plus one body turn over a slash argument supplying BOTH
// declared fields in natural prose, and asserts the bind carried both values
// through the projected contract — the fixed observable this report's §Fix
// claims but only repeat live runs settle (the pre-fix behaviour was green 1
// of 5, per §Reproduction (b)).
//
// SENTINEL DISCIPLINE (AGENTS.md "Assert on real observables" + bug 0243):
// the discriminator is task-framed arithmetic over the two bound `params:`
// fields (17 + 23 = 40) — never a "reply with exactly this" / "and nothing
// else" echo demand, which current models read as prompt injection and
// refuse at random. The success observable is the ABSENCE of a fail-closed
// `theta-system-note` (the SLSH-3 err note, `cancelled`, an abort framing)
// AND the PRESENCE of the arithmetic answer in the real assistant text —
// never `prompt()` merely resolving.
//
// SUBAGENT CHILD PINS: not reached. The theta below is `mode: prompt` with no
// `tools:` and no `invoke(...)`, so no RFC-0006 child launches. The shared
// harness (./harness) sets BOTH #subagent-child-pins plus the parent-pid
// carriage at module scope regardless, which importing it inherits.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// OFFLINE ATTRIBUTION GUARD: the offline projection witness runs BEFORE the
// live host is required, so a neutralised fix reds here with zero tokens
// spent, and this cell's own job is narrowed to the live-only claim: that a
// real turn over the carrier type completes and binds both fields.
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

/** The two declared values the slash argument names; their sum is the oracle. */
const A_VALUE = 17;
const M_VALUE = 23;
/** 17 + 23 — computable only from values that BOTH reached the rendered body. */
const SUM = String(A_VALUE + M_VALUE);

const CARRIER_STEM = "b0251livecarrier";
const PRECONDITION_STEM = "b0251livectl";

/**
 * The carrier theta from §Reproduction (a) row a1: `p`'s declared type
 * carries the tolerated junk segment `b > c` between two well-formed fields.
 * The body interpolates both bound fields behind a committed marker and then
 * asks for their sum — a task-framed arithmetic question, never a verbatim
 * echo demand — so the drive carries two independent observables: the
 * deterministic outbound render (`userTexts`) and the model's arithmetic
 * answer.
 */
const CARRIER_THETA = [
  "---",
  "mode: prompt",
  "bind_model: anthropic/claude-haiku-4-5",
  "params:",
  "  p: '{a: integer, b > c, m: integer}'",
  "---",
  "@`B0251LIVE-BOUND a=${p.a} m=${p.m}. What is ${p.a} plus ${p.m}? Answer with the number only.`",
  "",
].join("\n");

/** An unrelated theta, present only to prove the workspace itself is sound. */
const PRECONDITION_THETA = [
  "---",
  "mode: prompt",
  "---",
  "@`What is 111 plus 222? Answer with the number only.`",
  "",
].join("\n");

/** The committed marker prefixing the rendered outbound turn (the `userTexts` read). */
const BODY_MARKER = "B0251LIVE-BOUND";

/**
 * The fail-closed markers a top-level theta drive lands on the
 * `theta-system-note` channel (AGENTS.md §"Assert on real observables"). A
 * successful bind must produce none of them.
 */
const FAIL_CLOSED_MARKERS = ["returned Err:", "cancelled", "aborted"] as const;

describe("bug 0251 live: a `params:` field carrying a tolerated junk segment (`b > c`) binds and drives a real turn over the fields the lowering kept", () => {
  it("registers the carrier theta with zero diagnostics and completes a real turn binding both `a` and `m`", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the carrier type must load with zero diagnostics — bug
    // 0238's clamp tolerates the junk segment rather than refusing it — so a
    // regression that refuses it instead would red here before a single
    // token is spent, and the failure would be attributable to the WRONG
    // report (0244/0252's refusal class), not this one.
    const doc = parseDoc(CARRIER_THETA, `${CARRIER_STEM}.theta`);
    expect(
      doc.diagnostics,
      "attribution: the carrier's tolerated junk segment `b > c` must load with zero " +
        "diagnostics (bug 0238's landed tolerance) — a non-empty list here means the input " +
        "landscape moved out from under this report's carrier and the live drive below would " +
        "not exercise bug 0251's seam. Diagnostics: " +
        JSON.stringify(doc.diagnostics),
    ).toEqual([]);
    const schema = doc.frontmatter?.params?.loweredSchema as Record<string, unknown> | undefined;
    const loweredProperties = schema?.["properties"] as Record<string, unknown> | undefined;
    const pNode = loweredProperties?.["p"] as Record<string, unknown> | undefined;
    // `p`'s own fragment may be a `$ref` into `$defs` (the inline-object hoist,
    // src/parser/params.ts `hoistInlineObjectType`) rather than inlined — resolve it
    // exactly as the offline witness's `resolveRef` does before reading `properties`.
    const ref = pNode?.["$ref"];
    const defs = schema?.["$defs"] as Record<string, Record<string, unknown>> | undefined;
    const pFragment =
      typeof ref === "string" ? defs?.[ref.replace("#/$defs/", "")] : pNode;
    const pProperties = pFragment?.["properties"] as Record<string, unknown> | undefined;
    expect(
      pProperties && Object.keys(pProperties).sort(),
      "attribution: `p` must lower to exactly `{a, m}` — the tolerated `b > c` segment must " +
        "be absent from the lowered fragment (bug 0238's landed clamp) — for the divergence " +
        "bug 0251 fixes to be reachable at all.",
    ).toEqual(["a", "m"]);

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: CARRIER_STEM, text: CARRIER_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the carrier " +
          "shape, would explain a downstream failure below. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(CARRIER_STEM),
        "the carrier theta did not register — bug 0238's tolerance must let this theta load " +
          "and register; a refusal here belongs to a different report (0244/0252), not 0251. " +
          "Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(
        handle,
        `/${CARRIER_STEM} a is ${String(A_VALUE)} and m is ${String(M_VALUE)}`,
      );

      // The deterministic outbound-render observable: the binder bound BOTH
      // declared fields the lowering kept, so the rendered body carries both
      // values. Pre-fix, the tolerated `b > c` segment reaching the model as
      // part of a self-contradictory contract measurably derailed the reply
      // (empty text, exit 0, or off-task narration) on 4 of 5 identical
      // requests (§Reproduction (b)) — this assertion is the fixed path's
      // claim that the bind now completes.
      expect(
        turn.userTexts.join("\n"),
        "the carrier's outbound turn did not render both bound `params:` fields — the binder " +
          "did not bind `{p.a, p.m}` through the projected contract. Outbound: " +
          JSON.stringify(turn.userTexts) +
          "; notes: " +
          JSON.stringify(turn.systemNotes),
      ).toContain(`${BODY_MARKER} a=${String(A_VALUE)} m=${String(M_VALUE)}`);

      // The success observable per AGENTS.md: absence of a fail-closed
      // `theta-system-note`, never `prompt()` merely resolving.
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the carrier's drive ended fail-closed. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // The arithmetic oracle: computable only from values that BOTH reached
      // the rendered body through the projected (post-fix) contract.
      expect(
        turn.text,
        "the carrier's live reply did not contain the arithmetic oracle " +
          `(${SUM}, from ${String(A_VALUE)} plus ${String(M_VALUE)}) — the sum is computable ` +
          "only from two values that BOTH reached the rendered body. Reply: " +
          JSON.stringify(turn.text),
      ).toContain(SUM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
