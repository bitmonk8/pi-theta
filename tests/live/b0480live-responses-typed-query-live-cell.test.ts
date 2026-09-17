// H8a live witness — bug 0480: a TYPED `@` query on a theta whose `model:`
// routes through the `openai-responses` api was refused at the fork. Bug 0417
// live-measured the Responses family's FLAT `{type:"function",name}` forced-tool
// spelling and admitted `openai-responses` to the BINDER supported bound, but
// left `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` at bug 0010's six members, so the
// load pass warned `theta/load/typed-query-unsupported-provider` and the
// runtime gate synthesised `<api> does not support forced tool-use; typed
// queries unavailable` before any provider turn — the same adapter the binder
// already drove successfully (docs/bugs/0480-typed-query-gate-excludes-
// measured-openai-responses.md).
//
// §Fix widens the set to seven on the measurement law: THIS cell is the
// measurement. It drives the forced respond turn (`dispatchForcedRespondTurn`
// → pi-ai `complete()` with the flat toolChoice) through a registry-served
// `unity-responses/*` model and proves the respond payload BOUND by making the
// theta compute from it in a second, untyped turn.
//
// THE WITNESS (doc-MANDATED live): a `mode: prompt` theta with
// `model: unity-responses/gpt-6-astra` (api `openai-responses`, credentialed
// via `$UNITY_LITELLM_KEY1`) whose body is `let s: Sum = @\`…263 plus 514…\`?`
// followed by an untyped turn that interpolates `${s.value}`. The typed
// query's respond payload is only observable through what the theta CODE
// does with it: the second turn's rendered user text carries
// `B0480-BOUND value=777` iff the typed query bound a `Sum` (userTexts is the
// deterministic outbound-render channel — AGENTS.md "Assert on real
// observables"; bug 0479 makes the theta's `model:` the model these turns
// actually run under). The PATH is pinned too: the cell asserts the settled
// transcript carries no on-session `__theta_respond_*` call, so the binding
// can only have come from the off-session forced `complete()` dispatch — the
// one place the flat toolChoice reaches the wire on the respond path.
//
// OFFLINE ATTRIBUTION GUARD (token-free, runs BEFORE the live host is
// required): `TYPED_QUERY_SUPPORTED_PROVIDER_APIS` must carry
// `openai-responses` and `checkTypedQueryProviderSupport` must not warn on it.
// A neutralised fix reds HERE with zero tokens spent.
//
// SENTINEL DISCIPLINE (bug 0243): task-framed arithmetic over two literals
// (263 + 514 = 777), never a verbatim-echo demand.
//
// SUBAGENT CHILD PINS: not reached (the theta is `mode: prompt`, no `tools:`,
// no `invoke(...)`). The shared `./harness` sets both #subagent-child-pins plus
// the parent-pid carriage at module scope.
//
// NO SILENT SKIPPING: a missing live provider/model fails loudly through
// `requireLiveProvider` (`failLoudly`); the registry-served Responses model is
// asserted present by name before any drive.
//
// Token cost: one live drive (one typed free-phase turn, its forced respond
// turn, one untyped turn — all on the Responses model).
import { describe, expect, it } from "vitest";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  plantThetaWorkspace,
  requireLiveProvider,
  type PlantedTheta,
} from "./harness";
import {
  TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
  checkTypedQueryProviderSupport,
} from "../../src/runtime/typed-query-provider-gate";

const X_VALUE = 263;
const Y_VALUE = 514;
const SUM = String(X_VALUE + Y_VALUE);
const STEM = "b0480liveresp";
const PRECONDITION_STEM = "b0480livectl";
const BOUND_MARKER = "B0480-BOUND value=";
/** The registry-served Responses-api model the fixer worker pins (quality/README.md). */
const RESPONSES_MODEL = "unity-responses/gpt-6-astra";

/**
 * The witness theta. The typed query's free-phase turn runs on the Responses
 * model (bug 0479's model window); when it ends in text the forced respond turn
 * runs off-session through `complete()` with the flat toolChoice on the same
 * adapter. The second (untyped) turn renders the bound value into the outbound
 * user text — the deterministic observable.
 */
const RESP_THETA = [
  "---",
  "mode: prompt",
  `model: ${RESPONSES_MODEL}`,
  "---",
  "schema Sum {",
  "  value: integer",
  "}",
  // The free-phase turn is steered to END IN TEXT (an explicit no-tool
  // instruction — 3/3 measured runs complied, versus 3/3 voluntary respond
  // calls without it), which is what makes the runtime drive the forced
  // respond turn (`complete()` + the flat toolChoice) to extract the `Sum` —
  // the path the gate protects. The cell asserts NO on-session respond call
  // happened, so a bound `s.value` proves the forced dispatch.
  `let s: Sum = @\`What is ${String(X_VALUE)} plus ${String(Y_VALUE)}? Reply in plain prose only for this turn — do not call any tool; the structured answer is collected afterwards.\`?`,
  "@`" + BOUND_MARKER + "${s.value}. Is that number odd or even? Answer with one word.`",
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

/** Every fail-closed ending of a top-level drive lands on the note channel. */
const FAIL_CLOSED_MARKERS = [
  "returned Err:",
  "does not support forced tool-use",
  "cancelled",
  "aborted",
] as const;

describe("bug 0480 live: a typed `@` query on an openai-responses model binds its respond payload", () => {
  it("the forced respond turn binds through the flat toolChoice; the theta computes from the bound value; no gate refusal", async () => {
    // ATTRIBUTION GUARD (offline, token-free).
    expect(
      [...TYPED_QUERY_SUPPORTED_PROVIDER_APIS],
      "attribution: openai-responses must be inside the typed-query supported set (bug 0480 §Fix); " +
        "at the fork the runtime gate refuses before any provider call, so the live drive below " +
        "would fail-closed regardless.",
    ).toContain("openai-responses");
    expect(
      checkTypedQueryProviderSupport({
        file: "probe.theta",
        hasTypedQuery: true,
        api: "openai-responses",
        modelReference: RESPONSES_MODEL,
      }),
      "attribution: the load pass must not warn typed-query-unsupported-provider on openai-responses",
    ).toBeNull();

    const provider = await requireLiveProvider();
    const [responsesProvider, responsesId] = RESPONSES_MODEL.split("/") as [string, string];
    const served = provider.modelRegistry
      .getAvailable()
      .find((m: { provider: string; id: string }) => m.provider === responsesProvider && m.id === responsesId);
    expect(
      served,
      `precondition unmet: the registry serves no ${RESPONSES_MODEL} — the measurement needs the ` +
        "unity-responses provider (models.json + $UNITY_LITELLM_KEY1); never skipped silently.",
    ).toBeDefined();
    expect(
      String(served!.api),
      `precondition: ${RESPONSES_MODEL} must be served through the openai-responses api`,
    ).toBe("openai-responses");

    const thetas: PlantedTheta[] = [
      { source: "project", stem: PRECONDITION_STEM, text: PRECONDITION_THETA },
      { source: "project", stem: STEM, text: RESP_THETA },
    ];
    const workspace = plantThetaWorkspace(thetas);
    const handle = await bootShippedExtension({ workspace, provider });
    try {
      expect(
        handle.command(PRECONDITION_STEM),
        "the precondition control did not register — a broken workspace, not the gate, would " +
          "explain a downstream failure. Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();
      expect(
        handle.command(STEM),
        "the openai-responses typed theta did not register (registration is token-free). " +
          "Registered: " + JSON.stringify(handle.registeredNames()),
      ).toBeDefined();

      const entriesBefore = handle.sessionManager.getEntries().length;
      const turn = await driveSlashCaptureTurn(handle, `/${STEM}`);
      const appended = handle.sessionManager.getEntries().slice(entriesBefore) as readonly {
        readonly type?: string;
        readonly message?: { readonly role?: string; readonly content?: unknown };
      }[];
      const onSessionRespondCalls = appended.filter(
        (e) =>
          e.type === "message" &&
          e.message?.role === "assistant" &&
          Array.isArray(e.message.content) &&
          (e.message.content as { type?: string; name?: string }[]).some(
            (c) => c.type === "toolCall" && String(c.name ?? "").startsWith("__theta_respond_"),
          ),
      ).length;
      // PATH DISCRIMINATOR: the flat toolChoice reaches the wire only on the
      // OFF-SESSION forced respond dispatch (`complete()`); a free-phase turn
      // that volunteers the on-session respond tool binds without it. The
      // query text steers the model to prose, so the binding below can only
      // have come from the forced dispatch when NO on-session respond call
      // exists. A red here means the model volunteered the tool and this run
      // did not measure the forced path — re-run; it is not a gate defect.
      expect(
        onSessionRespondCalls,
        "the free-phase turn called the on-session respond tool, so this run bound WITHOUT the " +
          "forced complete() dispatch and measured nothing about the flat toolChoice on the " +
          "respond path. Outbound: " + JSON.stringify(turn.userTexts),
      ).toBe(0);

      // No fail-closed ending: at the fork the runtime gate's synthesised
      // transport Err ends the drive with `returned Err: … does not support
      // forced tool-use`.
      expect(
        turn.systemNotes.filter((note) => FAIL_CLOSED_MARKERS.some((marker) => note.includes(marker))),
        "the typed drive ended fail-closed on the openai-responses model. Notes: " +
          JSON.stringify(turn.systemNotes),
      ).toEqual([]);
      // THE MEASUREMENT: the respond payload bound — the second turn's rendered
      // user text carries the value the theta CODE read off `s.value`.
      expect(
        turn.userTexts.join("\n"),
        "the typed query did not bind a Sum through the openai-responses forced respond turn — " +
          "the second turn never rendered the bound value. Outbound: " +
          JSON.stringify(turn.userTexts) + "; notes: " + JSON.stringify(turn.systemNotes),
      ).toContain(`${BOUND_MARKER}${SUM}`);
    } finally {
      await handle.dispose();
    }
  });
});
