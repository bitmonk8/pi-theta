// H8a live witness — bug 0481: `anthropic/claude-fable-5-1` rejects forced
// `tool_choice` at the MODEL level (400 invalid_request_error — "tool_choice:
// type \"tool\" and \"any\" are not supported for this model", live-measured
// 2026-09-17), so at the fork every typed `@` query whose forced respond turn
// actually runs on that model dies `Err(transport)` AFTER its free phase did
// the work — all twenty triage children of quality-loop wave qw20260917095931
// failed this way (docs/bugs/0481-typed-query-dies-on-model-level-forced-
// tool-choice-rejection.md).
//
// §Fix: on the rejection signature the dispatch is re-issued ONCE with
// `options.toolChoice` omitted (the degraded dispatch — auto + the single
// respond tool + the QRY-15 trailing template). THIS cell is the live
// measurement of that degradation end-to-end on the rejecting model.
//
// THE WITNESS: a `mode: prompt` theta with `model: anthropic/claude-fable-5-1`
// whose typed query's free phase is steered to END IN PROSE (so the forced
// respond dispatch MUST run — the volunteer path would bind without ever
// sending the rejected option) followed by an untyped turn interpolating
// `${s.value}`. Post-fix the degraded dispatch extracts the payload and the
// second turn renders `B0481-BOUND value=777`; at the fork the drive ends
// fail-closed with the pinned 400 signature on the note channel
// (`returned Err: transport — 400 … tool_choice … not supported …`).
//
// PATH DISCRIMINATOR (same shape as the b0480 cell): the settled transcript
// must carry NO on-session `__theta_respond_*` call — a volunteering free
// phase would bind without the forced dispatch and measure nothing about the
// degradation. A red on that assertion means re-run, not a fix defect.
//
// SENTINEL DISCIPLINE (bug 0243): task-framed arithmetic (263 + 514 = 777),
// never a verbatim-echo demand; the prose steer is task-framed ("the
// structured answer is collected afterwards"), the same wording the b0480
// cell measured 3/3 compliant.
//
// SUBAGENT CHILD PINS: not reached (`mode: prompt`, no `tools:`, no
// `invoke(...)`); the shared `./harness` sets them at module scope anyway.
//
// NO SILENT SKIPPING: a missing live provider fails loudly through
// `requireLiveProvider`; the rejecting model is asserted registry-served BY
// NAME before any drive — this cell measures fable-5-1 specifically, no
// sonnet fallback (the fallback models ACCEPT forcing, which would measure
// nothing).
//
// DOCUMENTED CORRECT-REASON RED AT THE CURRENT PI PIN (bug-0017 precedent):
// the pinned host (`~0.80.10`, pi-ai claudeCodeVersion 2.1.75) is rejected by
// Anthropic's fable-5-1 version gate (`claude_code_version_too_old`: ≥2.1.251
// required) BEFORE any tool_choice behaviour is observable, so at this pin the
// cell fails loudly on that NAMED precondition (detector below) — never
// silently, never misattributed to the degradation. The green path activates
// on the next pi version bump. The fix itself is fully witnessed offline
// (tests/b0481-forced-tool-choice-model-rejection-degrades.test.ts, both
// resolved and thrown arms, with the live-measured signature) — measured
// against the real API on the operator's pi 0.85.1 (bug doc §Live
// measurement record).
//
// Token cost: one live drive on fable-5-1 — one free-phase turn, the rejected
// forced dispatch (a 400, no generation), the degraded dispatch, one untyped
// turn (+ bounded respond-repair turns if the degraded reply is prose).
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import { countOnSessionRespondCalls, FAIL_CLOSED_MARKERS } from "../helpers/live-transcript";
import { isForcedToolChoiceRejection } from "../../src/binder/forced-tool-choice";

const X_VALUE = 263;
const Y_VALUE = 514;
const SUM = String(X_VALUE + Y_VALUE);
const STEM = "b0481livefable";
const BOUND_MARKER = "B0481-BOUND value=";
/** The forcing-rejecting model (the quality-loop triage pin, quality/README.md). */
const REJECTING_MODEL = "anthropic/claude-fable-5-1";

const FABLE_THETA = [
  "---",
  "mode: prompt",
  `model: ${REJECTING_MODEL}`,
  "---",
  "schema Sum {",
  "  value: integer",
  "}",
  // Steered to prose so the forced respond dispatch MUST run — on this model
  // the forced option 400s and the fix's degraded dispatch is what binds.
  `let s: Sum = @\`What is ${String(X_VALUE)} plus ${String(Y_VALUE)}? Reply in plain prose only for this turn — do not call any tool; the structured answer is collected afterwards.\`?`,
  "@`" + BOUND_MARKER + "${s.value}. Is that number odd or even? Answer with one word.`",
  "",
].join("\n");

describe("bug 0481 live: a typed `@` query on the forcing-rejecting claude-fable-5-1 binds through the degraded dispatch", () => {
  it("the rejected forced dispatch degrades (toolChoice omitted) and the payload binds; no fail-closed ending", async () => {
    // ATTRIBUTION GUARD (offline, token-free): the live-measured signature
    // must be recognised — at the fork the predicate is absent/false and the
    // drive below ends fail-closed regardless.
    expect(
      isForcedToolChoiceRejection(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":' +
          '"tool_choice: type \\"tool\\" and \\"any\\" are not supported for this model."}}',
      ),
      "attribution: the shared predicate must recognise the live-measured anthropic rejection " +
        "(bug 0481 §Fix); without it the degraded dispatch never runs.",
    ).toBe(true);

    const provider = await requireLiveProvider();
    const [rejProvider, rejId] = REJECTING_MODEL.split("/") as [string, string];
    const served = provider.modelRegistry
      .getAvailable()
      .find((m: { provider: string; id: string }) => m.provider === rejProvider && m.id === rejId);
    expect(
      served,
      `precondition unmet: the registry serves no ${REJECTING_MODEL} — this cell measures the ` +
        "forcing-rejecting model specifically (a fallback model accepts forcing and would " +
        "measure nothing); never skipped silently.",
    ).toBeDefined();

    const thetas: PlantedTheta[] = [{ source: "project", stem: STEM, text: FABLE_THETA }];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(STEM),
        "the fixture theta did not register (registration is token-free). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const entriesBefore = handle.sessionManager.getEntries().length;
      const turn = await driveSlashCaptureTurn(handle, `/${STEM}`);
      const onSessionRespondCalls = countOnSessionRespondCalls(handle, entriesBefore);
      expect(
        onSessionRespondCalls,
        "the free-phase turn called the on-session respond tool, so this run bound WITHOUT the " +
          "forced dispatch and measured nothing about the degradation. Re-run. Outbound: " +
          JSON.stringify(turn.userTexts),
      ).toBe(0);

      // HOST-PIN PRECONDITION (named, loud): Anthropic gates fable-5-1 behind
      // a minimum claude-cli version; the pinned host's pi-ai identifies below
      // it, and the resulting 400 says nothing about tool_choice. Distinct
      // failure text so this red is never misread as a degradation defect.
      const versionGated = turn.systemNotes.filter((note) =>
        note.includes("claude_code_version_too_old") ||
        /does not support this model; version .* or newer is required/.test(note),
      );
      expect(
        versionGated,
        "PRECONDITION UNMET (documented correct-reason red at pi pin ~0.80.10): the pinned " +
          "host's pi-ai (claudeCodeVersion 2.1.75) is below Anthropic's fable-5-1 version gate, " +
          "so the degradation is unobservable here. Re-runs green after the next pi version bump. " +
          "Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // At the fork this carries `theta /<stem> returned Err: transport — 400
      // … tool_choice … not supported …` (the pinned failure signature).
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the typed drive ended fail-closed on the rejecting model — the degraded dispatch did " +
          "not rescue it. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);
      // THE MEASUREMENT: the payload bound through the degraded dispatch.
      expect(
        turn.userTexts.join("\n"),
        "the typed query did not bind a Sum on the rejecting model — the second turn never " +
          "rendered the bound value. Outbound: " + JSON.stringify(turn.userTexts) +
          "; notes: " + JSON.stringify(turn.systemNotes),
      ).toContain(`${BOUND_MARKER}${SUM}`);
    } finally {
      await handle.dispose();
    }
  });
});
