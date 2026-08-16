// H8a (live) — the provider-error *Re-validation gate* for bug 0065
// (docs/bugs/0065-anthropic-overflow-status-gate-unsatisfiable.md §Fix,
// "a live cell asserting `ONRESPONSE FIRINGS: []` on a cheap deliberate 400
// is the mechanical form of that gate").
//
// WHY LIVE, AND WHY NOT A SESSION CELL. Bug 0065's element 1 is a claim about
// `@earendil-works/pi-ai` behaviour that is outside its typed surface and that
// `docs/spec_topics/pi-integration-contract/provider-error-mapping.md:7`
// explicitly declines to pin: "Whether a given provider's pi-ai adapter
// invokes `onResponse` before resolving is a behavioural property of
// `@earendil-works/pi-ai` outside its typed surface". No offline fixture can
// score it — a fixture would only replay the assumption under test. The
// version-coupled property named by the *Re-validation gate* clause at
// `provider-error-mapping.md:5` is measured here, against the real adapter.
//
// THIS FILE DRIVES pi-ai `complete()` DIRECTLY. It is not a theta drive and
// not an `AgentSession` cell: the observable is the adapter's `onResponse`
// firing record joined with the resolved `AssistantMessage`, which is exactly
// the classifier's documented input surface (`provider-error-mapping.md:7`)
// and exactly what `#classifyBinderAttempt`
// (src/extension/production-theta-producer.ts:997, joining
// `captured?.status ?? null` into the classifier call at :1071-1076) joins in
// production. Interposing a session would only add a layer between the
// measurement and the thing measured. Credentials for an out-of-band `complete()` do not come
// from a session, so they are threaded from
// `ModelRegistry.getApiKeyAndHeaders(model)` into `options.apiKey` /
// `options.headers`, mirroring `#completeBinderReply`
// (src/extension/production-theta-producer.ts:1101-1126). `complete` is
// imported from `@earendil-works/pi-ai/compat`, not the package root: pi-ai
// 0.80.x moved the streaming free functions onto that subpath
// (src/extension/production-theta-producer.ts:86).
//
// NO CHILD PROCESS, SO NO CHILD PINS. This file spawns nothing — no subagent
// child launch is reached — so AGENTS.md §"In-process harnesses that spawn
// real subagent children need the child pins" does not apply to it. It imports
// `failLoudly` from ./harness, whose module-scope pins therefore come along
// inertly rather than being needed.
//
// NO SILENT SKIPPING. Both model ids this file names are preconditions, not
// preferences: an absent `claude-haiku-4-5` or `claude-sonnet-5` fails loudly
// naming the unmet precondition and listing what the registry did offer.
//
// THE THREE CELLS.
//   (a) 200 control — a one-word turn at `claude-haiku-4-5`: EXACTLY ONE
//       `onResponse` firing carrying `status: 200`. Without this control the
//       empty-firings assertion in (b) is unfalsifiable: an unregistered
//       callback and a callback the error path skips look identical.
//   (b) the re-validation gate — a deliberate cheap 400 at `claude-sonnet-5`:
//       ZERO firings, `stopReason: "error"`, `errorMessage` starting `400 `.
//       This is element 1's premise measured directly.
//   (c) the end-to-end fix — a real over-length prompt at `claude-haiku-4-5`,
//       whose LIVE inputs are handed to `classifyProviderResponse`. RED at
//       HEAD: the response classifies `transport`.
//
// Each cell prints its `ONRESPONSE FIRINGS` / `STOPREASON` / `ERRORMESSAGE`
// lines so the run is its own evidence.

import { describe, expect, it } from "vitest";
import {
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
// pi-ai 0.80.x moved the streaming free functions off the package root into
// the publicly-exported `/compat` subpath; the root barrel no longer
// re-exports `complete`.
import { complete } from "@earendil-works/pi-ai/compat";
import { failLoudly } from "./harness";
import {
  classifyProviderResponse,
  type ProviderClassifierInput,
} from "../../src/binder/provider-error-mapping";
import type { ContextOverflowError } from "../../src/runtime/query-error";

/**
 * Per-cell wall bound. Cell (c) posts a ~1.1 MB request body, so the network
 * leg alone can outrun the ordinary live-turn budget; the runner's own
 * `testTimeout` (180 s, config/vitest/vitest.live.config.ts) is raised per
 * cell rather than globally.
 */
const CELL_TIMEOUT_MS = 300_000;

/** The api every model this file names resolves to. */
const ANTHROPIC_API = "anthropic-messages";

/** The measured 200 000-token context window of `claude-haiku-4-5`. */
const HAIKU_CONTEXT_WINDOW = 200_000;

/**
 * The over-length prompt: `"word "` × 220 000 tokenises to slightly more than
 * the 220 000 words it contains, comfortably past the 200 000 window. The
 * request is refused BEFORE inference, so no output tokens are billed.
 */
const OVERLENGTH_WORD_COUNT = 220_000;

/** A live registry whose `getAvailable()` read has settled. */
async function requireLiveRegistry(): Promise<ModelRegistry> {
  const modelRuntime = await ModelRuntime.create();
  const modelRegistry = new ModelRegistry(modelRuntime);
  await modelRegistry.refresh();
  if (modelRegistry.getAvailable().length === 0) {
    failLoudly(
      "live precondition unmet: no live provider/model is configured " +
        "(ModelRegistry.getAvailable() is empty). Configure a provider and " +
        "credentials before running `npm run test:live`; this suite never " +
        "silently skips.",
    );
  }
  return modelRegistry;
}

/**
 * Resolve ONE exact `anthropic-messages` model id. The ids are preconditions
 * of what is being measured — (b) needs an id the model layer refuses
 * `temperature` on and (c) needs one whose window a 220 000-word prompt
 * exceeds — so an absent id fails loudly instead of falling back to some other
 * model, which would measure a different adapter path and report success.
 */
function requireModelId(
  registry: ModelRegistry,
  modelId: string,
  why: string,
): Model<Api> {
  const available = registry.getAvailable();
  const match = available.find(
    (candidate) => candidate.id === modelId && candidate.api === ANTHROPIC_API,
  );
  if (match === undefined) {
    const offered = available
      .filter((candidate) => candidate.api === ANTHROPIC_API)
      .map((candidate) => candidate.id);
    failLoudly(
      `live precondition unmet: no available \`${ANTHROPIC_API}\` model with ` +
        `id \`${modelId}\` (${why}). Available ${ANTHROPIC_API} ids: ` +
        JSON.stringify(offered),
    );
  }
  return match;
}

/**
 * The registry-resolved request auth for an OUT-OF-BAND `complete()`, in the
 * `options` shape `#completeBinderReply` threads it in
 * (src/extension/production-theta-producer.ts:1101-1126). An unresolvable
 * credential fails loudly: without it every cell below would red on an auth
 * refusal wearing the shape of the defect under test.
 */
async function requireAuthOptions(
  registry: ModelRegistry,
  model: Model<Api>,
): Promise<Record<string, unknown>> {
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    failLoudly(
      `live precondition unmet: no resolvable credential for \`${model.id}\` ` +
        `(${ANTHROPIC_API}): ${auth.error}`,
    );
  }
  const options: Record<string, unknown> = {};
  if (auth.apiKey !== undefined) {
    options["apiKey"] = auth.apiKey;
  }
  if (auth.headers !== undefined) {
    options["headers"] = auth.headers;
  }
  return options;
}

/** Everything one `complete()` made observable at the classifier's input surface. */
interface CapturedCall {
  /** `ProviderResponse.status` per `onResponse` firing, in firing order. */
  readonly firings: readonly number[];
  readonly stopReason: string;
  readonly errorMessage: string | undefined;
}

/**
 * Issue ONE `complete()` with an `onResponse` capture and return the
 * classifier's three inputs. `maxTokens` is pinned small: every cell here is
 * scored on the response envelope, never on generated text.
 */
async function completeCapturing(input: {
  readonly model: Model<Api>;
  readonly authOptions: Record<string, unknown>;
  readonly prompt: string;
  readonly extraOptions?: Record<string, unknown>;
}): Promise<CapturedCall> {
  const firings: number[] = [];
  const reply = await complete(
    input.model,
    {
      messages: [
        { role: "user", content: input.prompt, timestamp: Date.now() },
      ],
    },
    {
      ...input.authOptions,
      ...(input.extraOptions ?? {}),
      maxTokens: 16,
      onResponse: (response: ProviderResponse): void => {
        firings.push(response.status);
      },
    },
  );
  return {
    firings,
    stopReason: String(reply.stopReason),
    errorMessage: reply.errorMessage,
  };
}

/** Print the cell's evidence in the byte shape the bug report records it in. */
function reportCapture(cell: string, captured: CapturedCall): void {
  console.log(`[bug 0065 live ${cell}] ONRESPONSE FIRINGS: ${JSON.stringify(captured.firings)}`);
  console.log(`[bug 0065 live ${cell}] STOPREASON: ${captured.stopReason}`);
  console.log(`[bug 0065 live ${cell}] ERRORMESSAGE: ${String(captured.errorMessage)}`);
}

/**
 * The HTTP status the classifier reads, per `provider-error-mapping.md:7`:
 * the status captured by the LAST firing before `complete()` resolved, or
 * `null` when `onResponse` never fired (the no-HTTP-response class).
 */
function classifierHttpStatus(captured: CapturedCall): number | null {
  return captured.firings.length === 0
    ? null
    : (captured.firings[captured.firings.length - 1] ?? null);
}

describe("bug 0065 (live) — the `onResponse` re-validation gate for the anthropic overflow status gate", () => {
  it(
    "(a) 200 control: a successful one-word turn fires `onResponse` EXACTLY once with status 200",
    async () => {
      // The registration control. `onResponse` is registered identically on
      // every call in this file, so a 200 firing here is what makes the empty
      // firings in (b) and (c) evidence about the ADAPTER'S ERROR PATH rather
      // than about a callback that was never wired.
      const registry = await requireLiveRegistry();
      const model = requireModelId(
        registry,
        "claude-haiku-4-5",
        "the 200 control and the overflow cell both run against it",
      );
      const authOptions = await requireAuthOptions(registry, model);

      const captured = await completeCapturing({
        model,
        authOptions,
        prompt: "Reply with exactly the word: ok",
      });
      reportCapture("a", captured);

      expect(
        captured.firings,
        "the success path must deliver exactly one ProviderResponse to " +
          "`onResponse`; anything else means this file's capture is not " +
          "measuring the callback the classifier's HTTP-status input comes " +
          "from (provider-error-mapping.md:7). observed firings: " +
          JSON.stringify(captured.firings),
      ).toEqual([200]);
      expect(
        captured.stopReason,
        "the control turn must have SUCCEEDED — a failing control would make " +
          "the 200 firing above meaningless. observed: " +
          JSON.stringify(captured),
      ).toBe("stop");
    },
    CELL_TIMEOUT_MS,
  );

  it(
    "(b) the re-validation gate: a deliberate cheap 400 records ZERO `onResponse` firings",
    async () => {
      // WHY A TEMPERATURE-CARRYING CALL. This is a DIRECT pi-ai `complete()`,
      // NOT the binder path: the binder's own temperature placement omits the
      // field for exactly this (api, model-id) pair, so bug 0064's
      // binder-temperature-400 signature is retired and is not being
      // re-introduced here. The field is used only as the cheapest available
      // vehicle for a deterministic provider 400 — `claude-sonnet-5` is one of
      // the two ids measured to refuse it
      // (BINDER_TEMPERATURE_TABLE, src/binder/binder-temperature.ts:81-89),
      // the refusal happens before inference, and no tokens are billed. What
      // is under test is only whether the adapter delivers the 400's status to
      // `onResponse`.
      const registry = await requireLiveRegistry();
      const model = requireModelId(
        registry,
        "claude-sonnet-5",
        "a measured `temperature`-refusing id is the cheap deterministic 400",
      );
      const authOptions = await requireAuthOptions(registry, model);

      const captured = await completeCapturing({
        model,
        authOptions,
        prompt: "Reply with exactly the word: ok",
        extraOptions: { temperature: 0 },
      });
      reportCapture("b", captured);

      expect(
        captured.stopReason,
        "the deliberate 400 must have been refused; a `stop` here means the " +
          "model accepted the field and this cell measured nothing. " +
          "observed: " + JSON.stringify(captured),
      ).toBe("error");
      expect(
        captured.errorMessage ?? "",
        "the refusal must be an HTTP 400 — the pi-ai formatter prefixes the " +
          "status — so that the zero firings below are a 400's firings and " +
          "not some other failure class. observed: " +
          JSON.stringify(captured.errorMessage),
      ).toMatch(/^400 /);
      expect(
        captured.firings,
        "THE GATE: the `anthropic-messages` adapter must be measured, not " +
          "assumed, to withhold `onResponse` on an HTTP 400. Empty here (with " +
          "cell (a) green) is the premise of bug 0065 element 1: every " +
          "anthropic 400, overflow included, reaches the classifier as " +
          "`httpStatus: null`, which only the `httpStatus === null` disjunct " +
          "of the anthropic/mistral arm " +
          "(src/binder/provider-error-mapping.ts:276) admits — a bare 400 " +
          "gate is never satisfied on this path. A " +
          "NON-empty result here means pi-ai changed and the widened gate " +
          "matches on the captured 400 instead — update " +
          "provider-error-mapping.md's classifier-input-surface note, do not " +
          "weaken this cell. observed firings: " +
          JSON.stringify(captured.firings),
      ).toEqual([]);
    },
    CELL_TIMEOUT_MS,
  );

  it(
    "(c) end to end: a REAL over-length prompt classifies as ContextOverflowError with the provider's own counts",
    async () => {
      // The whole bug in one cell: the LIVE inputs (the firing-derived HTTP
      // status, the live stopReason, the live errorMessage) go to the runtime's
      // own classifier and must come back as the variant
      // docs/spec_topics/query/query-failure-and-repair.md §Detection of
      // `ContextOverflowError` promises an author. The request is refused
      // before inference, so no output tokens are billed.
      const registry = await requireLiveRegistry();
      const model = requireModelId(
        registry,
        "claude-haiku-4-5",
        "the overflow needs a model whose context window the prompt exceeds",
      );
      const authOptions = await requireAuthOptions(registry, model);

      const captured = await completeCapturing({
        model,
        authOptions,
        prompt: "word ".repeat(OVERLENGTH_WORD_COUNT),
      });
      reportCapture("c", captured);

      // Preconditions: this must be the OVERFLOW refusal, not a rate limit,
      // an auth failure or a reworded body. A red below is then attributable
      // to the classification, never to the stimulus.
      expect(
        captured.stopReason,
        "the over-length prompt must have been refused. observed: " +
          JSON.stringify(captured),
      ).toBe("error");
      expect(
        captured.errorMessage ?? "",
        "the refusal must carry the provider's overflow wording; a miss here " +
          "is the *Provider-owned-wording presupposition* drift " +
          "(provider-error-mapping.md:9), a different finding from bug 0065. " +
          "observed: " + JSON.stringify(captured.errorMessage),
      ).toMatch(/prompt is too long/i);

      // `errorMessage` is spread in only when present: the classifier's input
      // surface declares it optional, and under `exactOptionalPropertyTypes` a
      // key holding `undefined` is a different thing from an absent key.
      const classifierInput: ProviderClassifierInput = {
        api: String(model.api),
        httpStatus: classifierHttpStatus(captured),
        stopReason: captured.stopReason,
        ...(captured.errorMessage === undefined
          ? {}
          : { errorMessage: captured.errorMessage }),
      };
      const verdict = classifyProviderResponse(
        classifierInput,
      ) as ContextOverflowError;
      console.log(
        `[bug 0065 live c] CLASSIFIER VERDICT: ${JSON.stringify(verdict)}`,
      );

      expect(
        verdict.kind,
        "bug 0065 element 1, end to end: a genuine `prompt is too long` must " +
          "surface as ContextOverflowError. `transport` means the status gate " +
          "(src/binder/provider-error-mapping.ts:276) refused the " +
          "`httpStatus: null` cell (b) proves is the only status this path " +
          "ever delivers, and the author additionally gets `retryable: true` " +
          "on a definite refusal. verdict: " + JSON.stringify(verdict),
      ).toBe("context_overflow");
      expect(
        verdict.tokens_limit,
        "bug 0065 element 2: the provider states the window in its message, " +
          "so `tokens_limit` must be the model's context window " +
          `(${HAIKU_CONTEXT_WINDOW}); null means the scan ran over the ` +
          "pi-ai-FORMATTED envelope instead of the provider-message window. " +
          "verdict: " + JSON.stringify(verdict),
      ).toBe(HAIKU_CONTEXT_WINDOW);
      // NOT pinned exactly: the tokenizer's count for the same prompt drifts
      // run to run (220 044 measured at 0.99.0; the bug report recorded
      // 220 041 at 0.52.0). What is invariant is that the used count is a real
      // number the provider reported and that it exceeds the window — which is
      // what made the request an overflow.
      expect(
        verdict.tokens_used,
        "bug 0065 element 2: `tokens_used` must be the count the provider " +
          `reported, necessarily above the ${HAIKU_CONTEXT_WINDOW} window. ` +
          "null means the formatted-envelope scan; a value at or below the " +
          "window means the wrong run was selected. verdict: " +
          JSON.stringify(verdict),
      ).toBeGreaterThan(HAIKU_CONTEXT_WINDOW);
    },
    CELL_TIMEOUT_MS,
  );
});
