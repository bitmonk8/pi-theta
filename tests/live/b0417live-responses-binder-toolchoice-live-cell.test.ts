// H8a live witness — bug 0417: every non-bypass `params:` theta whose resolved
// binder model is served through the `openai-responses` api is dead at the
// fork. `FORCED_TOOL_CHOICE_BY_API` carried no Responses-family row, so the
// binder call shipped the outside-the-table `{type:"tool",name}` default the
// OpenAI Responses API rejects with a hard HTTP 400 on the `type` value; the
// classifier routes it to transport, the single transport retry re-issues the
// identical doomed request, and the invocation terminates on
// `argument binder unavailable (openai-responses: …)` having burned BOTH
// budgeted binder calls — the theta body never runs
// (docs/bugs/0417-binder-openai-responses-toolchoice-400.md §Reproduction
// Reach 2).
//
// §Fix (parent adjudication Option A) adds a third flat `{type:"function",name}`
// spelling arm for the Responses family (Reach 1 measured this as the ONLY
// accepted shape) AND gives the binder a supported-api gate that synthesizes a
// refusal BEFORE dispatch for an api with no measured row. `openai-responses`
// gains the row and is admitted, so the bind now SUCCEEDS.
//
// THE WITNESS (doc-MANDATED live): a `mode: prompt`, two-integer-`params:`
// theta whose `bind_model:` names the registry-served `unity-responses/gpt-4.1`
// (api `openai-responses`, credentialed via `$UNITY_LITELLM_KEY1`). Drive one
// binder pass plus one body turn; assert the `bind_echo` success note fired,
// the fail-closed `argument binder unavailable` note is ABSENT, and the body
// ran (both `params:` reached the rendered turn). At the fork this reds; under
// the flat-function row + gate it greens.
//
// OFFLINE ATTRIBUTION GUARD (token-free, runs BEFORE the live host is
// required): the pure `buildBinderCompleteCall` for an `openai-responses` model
// must spell the flat `{type:"function",name}` form. A neutralised fix reds
// HERE with zero tokens spent, and the failure is attributable to THIS report
// (the spelling row), not to an unrelated live-infra fault.
//
// SENTINEL DISCIPLINE (AGENTS.md "Assert on real observables" + bug 0243): the
// discriminator is task-framed arithmetic over the two bound `params:` fields
// (263 + 514 = 777) — never a "reply with exactly this" echo demand. The
// success observable is the ABSENCE of a fail-closed `theta-system-note` and
// the PRESENCE of the arithmetic answer in the real assistant text.
//
// SUBAGENT CHILD PINS: not reached (the theta is `mode: prompt`, no `tools:`,
// no `invoke(...)`, so no RFC-0006 child launches). The shared `./harness` sets
// both #subagent-child-pins plus the parent-pid carriage at module scope.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); nothing here early-returns or skips.
//
// Token cost: one live drive (one binder pass plus one body turn).

import { describe, expect, it } from "vitest";
import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import {
  binderToolName,
  buildBinderCompleteCall,
} from "../../src/binder/binder-inference";
import type { BinderEnvelopeSchema } from "../../src/binder/binder-envelope";

/** The two declared values the slash argument names; their sum is the oracle. */
const X_VALUE = 263;
const Y_VALUE = 514;
/** 263 + 514 — computable only from values that BOTH reached the rendered body. */
const SUM = String(X_VALUE + Y_VALUE);

const STEM = "b0417liveresp";
const PRECONDITION_STEM = "b0417livectl";
const BODY_MARKER = "B0417LIVE-BOUND";

/**
 * The witness theta: `bind_model:` names a registry-served `openai-responses`
 * model (`unity-responses/gpt-4.1`). Two required integer `params:`; the body
 * interpolates both bound fields behind a committed marker and asks their sum.
 */
const RESP_THETA = [
  "---",
  "mode: prompt",
  "bind_model: unity-responses/gpt-4.1",
  "params:",
  "  x: integer",
  "  y: integer",
  "---",
  "@`" + BODY_MARKER + " x=${x} y=${y}. What is ${x} plus ${y}? Answer with the number only.`",
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

/**
 * The fail-closed markers a top-level binder failure lands on the
 * `theta-system-note` channel. A successful bind produces none of them; the
 * pre-fix openai-responses drive landed `argument binder unavailable`.
 */
const FAIL_CLOSED_MARKERS = [
  "argument binder unavailable",
  "returned Err:",
  "cancelled",
  "aborted",
] as const;

describe("bug 0417 live: a non-bypass `params:` theta bound through an openai-responses model binds and drives a real turn", () => {
  it("registers and completes a real turn — bind_echo fires, `argument binder unavailable` is absent, both params bound", async () => {
    // ATTRIBUTION GUARD (offline, token-free, runs BEFORE the live host is
    // required): the pure forced-tool-choice spelling for an openai-responses
    // model must be the flat function form. A neutralised fix reds here with
    // zero tokens spent, and the failure is attributable to bug 0417's row.
    const envelope: BinderEnvelopeSchema = {
      anyOf: [
        {
          type: "object",
          properties: { kind: { const: "ok" } },
          required: ["kind"],
        },
      ],
    };
    const call = buildBinderCompleteCall({
      model: { api: "openai-responses" } as unknown as Model<Api>,
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed: 7,
      signal: new AbortController().signal,
      onResponse: (_r: ProviderResponse, _m: Model<Api>) => {},
    });
    expect(
      (call.options as Record<string, unknown>)["toolChoice"],
      "attribution: an openai-responses binder call must spell the FLAT " +
        "{type:'function',name} form (bug 0417 Reach 1); the {type:'tool',name} default is a " +
        "hard 400 on the Responses API, so a live drive below would fail-closed regardless.",
    ).toEqual({ type: "function", name: binderToolName("triage") });

    const provider = await requireLiveProvider();
    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: STEM, text: RESP_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the binder gate, " +
          "would explain a downstream failure. Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(STEM),
        "the openai-responses-bound theta did not register (registration is token-free and " +
          "must succeed — the bug is a runtime dispatch failure, not a load refusal). Registered: " +
          JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const turn = await driveSlashCaptureTurn(
        handle,
        `/${STEM} x is ${String(X_VALUE)} and y is ${String(Y_VALUE)}`,
      );

      // The fixed observable: NO `argument binder unavailable` (nor any other
      // fail-closed marker). At the fork the openai-responses binder call 400s
      // and this note is present (§Reproduction Reach 2).
      expect(
        turn.systemNotes.filter((note) =>
          FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker)),
        ),
        "the openai-responses binder drive ended fail-closed — the whole non-bypass `params:` " +
          "feature is dead on this api at the fork. Notes: " + JSON.stringify(turn.systemNotes),
      ).toEqual([]);

      // The doc-named observable (bug 0417 §Fix witness spec): the BND-1
      // success echo note fired. The theta declares no `bind_echo: false`, so a
      // successful bind emits `Running /<name>: …` deterministically.
      expect(
        turn.systemNotes.some((note) => note.startsWith(`Running /${STEM}`)),
        "the bind_echo success note did not fire — the openai-responses bind did not succeed. " +
          "Notes: " + JSON.stringify(turn.systemNotes),
      ).toBe(true);

      // The bind SUCCEEDED, so the body ran and rendered both bound fields.
      expect(
        turn.userTexts.join("\n"),
        "the body did not render both bound `params:` fields — the binder did not bind. " +
          "Outbound: " + JSON.stringify(turn.userTexts) + "; notes: " +
          JSON.stringify(turn.systemNotes),
      ).toContain(`${BODY_MARKER} x=${String(X_VALUE)} y=${String(Y_VALUE)}`);

      // The arithmetic oracle: computable only from two values that BOTH
      // reached the rendered body through the (now-bound) openai-responses pass.
      expect(
        turn.text,
        `the live reply did not contain the arithmetic oracle (${SUM}, from ${String(X_VALUE)} ` +
          `plus ${String(Y_VALUE)}). Reply: ` + JSON.stringify(turn.text),
      ).toContain(SUM);
    } finally {
      await handle.dispose();
      workspace.dispose();
    }
  });
});
