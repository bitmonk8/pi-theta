// H8a (live) — bug 0182: a REAL provider context overflow on the OFF-SESSION
// `@`-query path reaches the theta author as `ContextOverflowError` carrying the
// provider's own token counts.
//
// WHY LIVE, AND WHY THIS SHAPE. Bug 0182's fix removed a fabricated
// `httpStatus: 200` from `classifyOffSessionReply`'s classifier input and
// replaced it with the status each off-session `complete()` call actually
// captured through `options.onResponse`. Everything downstream of that input is
// covered offline and deterministically by
// `tests/off-session-transport-classification.test.ts`. What no offline fixture
// can score is the input itself: whether a real `anthropic-messages` overflow
// arrives at this seam with NO captured status, which is the only value bug
// 0065's widened gate (`src/binder/provider-error-mapping.ts`
// `overflowStatusGateSatisfied`) admits besides HTTP 400. A fixture asserting
// that would only replay the assumption. `provider-error-mapping.md`
// §Classifier input surface says so explicitly: "Whether a given provider's
// pi-ai adapter invokes `onResponse` before resolving is a behavioural property
// of `@earendil-works/pi-ai` outside its typed surface."
//
// `tests/live/provider-error-revalidation-gate.test.ts` (bug 0065) measures that
// adapter property directly, against a raw `complete()`. THIS file is the other
// half: the same real refusal driven END TO END through the production
// off-session query driver, scored on the value a theta AUTHOR observes. The two
// are complementary — the gate cell proves the status is absent, this file proves
// the runtime's classification of that absence reaches the author's `match` arm.
//
// THE OBSERVABLE IS THE AUTHOR'S `match` ARM, NOT A FIELD THIS FILE READS. The
// planted theta matches the query's `Result` itself and renders exactly one
// deterministic token per verdict, then sends that token in its own final
// `@`-query. `DrivenTurn.userTexts` is the settled-transcript OUTBOUND-render
// channel (AGENTS.md §"Assert on real observables"): it carries the text the
// theta CODE computed, independent of anything the model replies. So the pass
// condition is "the runtime dispatched the author's context-overflow arm", and
// the four arms are mutually exclusive — `TRANSPORT` is precisely the pre-fix
// signature (bug 0182 §Reproduction (d)) and `OVF_NO_COUNTS` is the variant
// matched with the counts dropped.
//
// NO CHILD PROCESS, SO NO CHILD PINS. A `subagent fn` is an INLINE body with no
// `.theta` file or slug to launch, so — unlike an `invoke`d subagent-mode callee
// — it spawns no child `pi` process: its body runs in-process against an
// isolated OFF-SESSION conversation (`#spawnSubagentFnSession`'s doc-comment in
// `src/extension/production-theta-producer.ts`, and the `userVisible: false`
// host deps it consumes). That in-process off-session conversation IS the seam
// under test. AGENTS.md §"In-process harnesses that spawn real subagent
// children need the child pins" therefore does not apply; the module-scope pins
// of `./harness` come along inertly with the import.
//
// TOKEN COST. Both cells are bounded by construction. The overflow request is
// refused at the provider edge BEFORE inference, so no output tokens are billed
// for it; the control's query and each cell's final render turn are one-word
// turns. This is the same posture bug 0065's cell (c) shipped under.
//
// NO SILENT SKIPPING. `claude-haiku-4-5` and its measured 200 000-token context
// window are PRECONDITIONS, not preferences — the window is the integer the
// author's arm pattern matches on — so an absent id or a changed window fails
// loudly naming the unmet precondition instead of falling back to another model,
// which would measure a different adapter path and report success.

import { beforeAll, describe, expect, it } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  bootShippedExtension,
  driveSlashCaptureTurn,
  failLoudly,
  plantThetaWorkspace,
  requireLiveProvider,
  type LiveProvider,
} from "./harness";

/**
 * Per-cell wall bound. The overflow cell posts a ~1.1 MB request body, so the
 * network leg alone can outrun the ordinary live-turn budget; the runner's own
 * `testTimeout` (180 s, config/vitest/vitest.live.config.ts) is raised per cell
 * rather than globally — the same treatment bug 0065's live gate applies.
 */
const CELL_TIMEOUT_MS = 300_000;

/** The api the overflow row under test is keyed on. */
const ANTHROPIC_API = "anthropic-messages";

/** The exact off-session query model both cells pin through frontmatter `model:`. */
const OVERFLOW_MODEL_ID = "claude-haiku-4-5";

/**
 * The measured context window of `OVERFLOW_MODEL_ID`. This is not decoration:
 * the provider states this integer in its own refusal message, the runtime's
 * `extractOverflowTokens` lifts it into `tokens_limit`, and the planted theta's
 * arm pattern matches it as a LITERAL — so a window change must red this file
 * loudly rather than silently degrade the assertion to "some overflow".
 */
const MODEL_CONTEXT_WINDOW = 200_000;

/**
 * `"word "` × 220 000 tokenises to slightly more than the 220 000 words it
 * contains, comfortably past the window above. Copied from bug 0065's live gate,
 * whose run recorded `prompt is too long: 220044 tokens > 200000 maximum`.
 */
const OVERLENGTH_WORD_COUNT = 220_000;

/**
 * The theta both cells plant, parameterised only by the off-session query text.
 *
 * The `subagent fn` body is where the `@`-query runs OFF-SESSION, and the body
 * matches the query's own `Result` — the arm dispatch is the whole observable.
 * The arms are ordered most-specific-first so `OVF_LIMIT_200000` is reachable
 * only when the variant AND the provider-supplied limit are both right; the
 * `context_overflow`-without-counts arm below it is what the `length`-stop route
 * renders, and `TRANSPORT` is the pre-fix signature.
 */
function matchArmTheta(queryText: string): string {
  return [
    "---",
    "description: bug 0182 off-session overflow classification",
    "mode: prompt",
    `model: ${OVERFLOW_MODEL_ID}`,
    "---",
    "subagent fn probe() {",
    `  let verdict = match @\`${queryText}\` {`,
    '    Ok(_) => "UNEXPECTED_OK",',
    `    Err(QueryError { kind: "context_overflow", tokens_limit: ${MODEL_CONTEXT_WINDOW} }) => "OVF_LIMIT_${MODEL_CONTEXT_WINDOW}",`,
    '    Err(QueryError { kind: "context_overflow" }) => "OVF_NO_COUNTS",',
    '    Err(QueryError { kind: "transport" }) => "TRANSPORT",',
    '    Err(_) => "OTHER",',
    "  }",
    "  verdict",
    "}",
    "let out = probe()",
    "@`VERDICT=${out}|END`",
    "",
  ].join("\n");
}

/**
 * Assert the exact off-session query model is available and still carries the
 * window the arm pattern names. Both are preconditions of what is measured, so an
 * absent id or a moved window fails loudly and lists what the registry offered.
 */
function requireOverflowModel(provider: LiveProvider): Model<Api> {
  const available = provider.modelRegistry.getAvailable();
  const match = available.find(
    (candidate) => candidate.id === OVERFLOW_MODEL_ID && candidate.api === ANTHROPIC_API,
  );
  if (match === undefined) {
    const offered = available
      .filter((candidate) => candidate.api === ANTHROPIC_API)
      .map((candidate) => candidate.id);
    failLoudly(
      `live precondition unmet: no available \`${ANTHROPIC_API}\` model with id ` +
        `\`${OVERFLOW_MODEL_ID}\` (the off-session query model both cells pin). ` +
        `Available ${ANTHROPIC_API} ids: ${JSON.stringify(offered)}`,
    );
  }
  const window = (match as { readonly contextWindow?: number }).contextWindow;
  if (window !== MODEL_CONTEXT_WINDOW) {
    failLoudly(
      `live precondition unmet: \`${OVERFLOW_MODEL_ID}\` reports contextWindow ` +
        `${String(window)}, but the planted theta's overflow arm matches the ` +
        `literal ${MODEL_CONTEXT_WINDOW} (the integer the provider states in its ` +
        "own refusal and `extractOverflowTokens` lifts into `tokens_limit`). " +
        "Re-measure the window and update MODEL_CONTEXT_WINDOW together with the " +
        "arm pattern; do not weaken the arm to accept any overflow.",
    );
  }
  return match;
}

/** Plant the theta, drive `/<stem>` once, and return the rendered verdict token. */
async function driveVerdict(input: {
  readonly provider: LiveProvider;
  readonly stem: string;
  readonly queryText: string;
}): Promise<{ readonly userTexts: readonly string[]; readonly systemNotes: readonly string[] }> {
  const workspace = plantThetaWorkspace([
    { source: "project", stem: input.stem, text: matchArmTheta(input.queryText) },
  ]);
  const handle = await bootShippedExtension({ workspace, provider: input.provider });
  try {
    if (handle.command(input.stem) === undefined) {
      failLoudly(
        `live precondition unmet: discovery registered no \`/${input.stem}\` command ` +
          `(registered: ${JSON.stringify(handle.registeredNames())}).`,
      );
    }
    const driven = await driveSlashCaptureTurn(handle, `/${input.stem}`);
    console.log(
      `[bug 0182 live ${input.stem}] USERTEXTS: ${JSON.stringify(driven.userTexts)}`,
    );
    console.log(
      `[bug 0182 live ${input.stem}] SYSTEMNOTES: ${JSON.stringify(driven.systemNotes)}`,
    );
    return { userTexts: driven.userTexts, systemNotes: driven.systemNotes };
  } finally {
    await handle.dispose();
    workspace.dispose();
  }
}

/** The rendered verdict token, or `undefined` when the theta never got that far. */
function verdictOf(userTexts: readonly string[]): string | undefined {
  for (const text of userTexts) {
    const match = /VERDICT=([A-Z0-9_]+)\|END/.exec(text);
    if (match !== null) return match[1];
  }
  return undefined;
}

describe("bug 0182 (live) — a real off-session overflow reaches the author's context-overflow arm", () => {
  let provider: LiveProvider;

  beforeAll(async () => {
    provider = await requireLiveProvider();
    requireOverflowModel(provider);
  }, CELL_TIMEOUT_MS);

  it(
    "(a) control: a small off-session `@`-query in the same theta resolves Ok, so the arms below are live",
    async () => {
      // Without this control the overflow cell is unfalsifiable: a theta that
      // never reached its `@`-query, or whose fn body failed for an unrelated
      // reason, would look the same as one whose overflow arm did not fire. A
      // rendered `UNEXPECTED_OK` proves the off-session query ran, succeeded,
      // and that the `match` dispatched — on the identical code path the
      // overflow cell drives.
      //
      // Drive discriminators are ANSWERS to task questions over the theta's own
      // computed text -- deterministic content a degraded plain-prompt run
      // cannot produce. A verbatim-echo demand ("reply with exactly this") reads
      // as prompt injection to current models and draws refusals: the
      // sentinel-refusal class filed as bug 0243.
      const driven = await driveVerdict({
        provider,
        stem: "ovfctl",
        queryText: "What is 337 plus 455? Answer with the number only.",
      });

      expect(
        verdictOf(driven.userTexts),
        "the control's off-session query must SUCCEED — a failing control makes " +
          "the overflow cell's verdict meaningless. observed userTexts: " +
          JSON.stringify(driven.userTexts) +
          "; systemNotes: " +
          JSON.stringify(driven.systemNotes),
      ).toBe("UNEXPECTED_OK");
      expect(
        driven.systemNotes,
        "a fail-closed ending of the top-level drive lands on the " +
          "theta-system-note channel; the control must end clean. observed: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    },
    CELL_TIMEOUT_MS,
  );

  it(
    "(b) a REAL over-length off-session `@`-query dispatches the author's ContextOverflowError arm with the provider's own limit",
    async () => {
      // THE WHOLE BUG, END TO END. Pre-fix this rendered `TRANSPORT`: the fold
      // handed the classifier a fabricated `httpStatus: 200`, and 200 is neither
      // of the two values the anthropic overflow gate admits, so the signature
      // match was vetoed on a status no `onResponse` ever produced and both
      // token counts were dropped (bug 0182 §Reproduction (d); bug 0065's live
      // gate cell (b) measures the zero firings that make `null` the seam's real
      // input). `OVF_LIMIT_200000` requires the variant AND the provider's stated
      // window, so it cannot be reached by a classification that merely guessed
      // the variant. The request is refused before inference — no output tokens.
      const driven = await driveVerdict({
        provider,
        stem: "ovflive",
        queryText: "word ".repeat(OVERLENGTH_WORD_COUNT),
      });

      expect(
        verdictOf(driven.userTexts),
        "bug 0182: a genuine `prompt is too long` refusal on the off-session " +
          "`@`-query path must dispatch the author's " +
          `\`Err(QueryError { kind: "context_overflow", tokens_limit: ${MODEL_CONTEXT_WINDOW} })\` ` +
          "arm. `TRANSPORT` is the pre-fix signature — the fabricated 200 vetoing " +
          "the overflow signature. `OVF_NO_COUNTS` means the variant matched but " +
          "the counts were dropped (bug 0065 element 2's provider-message-window " +
          "extraction). `UNEXPECTED_OK` means the prompt did not overflow — " +
          "re-measure the window rather than weakening this cell. observed " +
          "userTexts: " +
          JSON.stringify(driven.userTexts.map((text) => text.slice(0, 200))) +
          "; systemNotes: " +
          JSON.stringify(driven.systemNotes),
      ).toBe(`OVF_LIMIT_${MODEL_CONTEXT_WINDOW}`);
      expect(
        driven.systemNotes,
        "the classified overflow is the author's VALUE, not a fail-closed ending " +
          "of the drive: the theta matched it, rendered a token and ran to " +
          "completion, so the note channel must be empty. observed: " +
          JSON.stringify(driven.systemNotes),
      ).toEqual([]);
    },
    CELL_TIMEOUT_MS,
  );
});
