// Bug 0327 — `ToolLoopExhaustedError.raw_response` is structurally always
// `null` on the untyped exhaustion path.
//
// Spec: docs/bugs/0327-untyped-exhaustion-raw-response-always-null.md, quoting
// errors-and-results/queryerror-variants.md:151 (ERR-19 field comment:
// `raw_response: string | null — any text the model emitted alongside the final
// tool call, when surfaced by the provider`) and queryerror-variants.md:211
// (Notes, a BICONDITIONAL: "`ToolLoopExhaustedError` carries `raw_response` only
// when the model emitted text alongside its terminating tool-use block; the
// field is `null` when exhaustion fired on a pure tool-use turn").
//
// The defect is a seam-type omission plus a hardcoded literal:
//   - src/runtime/query-tool-loop.ts:94 — `FreePhaseTurn`'s `tool_use` arm is
//     `{ kind: "tool_use"; batch: ToolCallRequest[] }` with NO text member, so
//     no driver can surface the text accompanying a tool-use turn.
//   - src/runtime/query-tool-loop.ts:388 — the `max_rounds`-final exhaustion
//     branch calls `makeToolLoopExhaustedError({ …, raw_response: null })`; the
//     literal `null` is the only value this branch can produce.
//
// PHASE 2 (the fix these witnesses are written against): the `tool_use` arm
// gains an OPTIONAL `readonly text?: string | null` (convention mirrors
// src/binder/provider-error-mapping.ts:358 `rawResponse?: string | null`), and
// `runUntypedQueryLoop` tracks the LAST consumed tool_use turn's text and passes
// it as `raw_response` in the exhaustion branch (null when that turn carried no
// text). This suite drives the shared loop directly through a deterministic
// scripted model — offline, provider-free — so cells (A)/(C) red on the
// hardcoded `null` today and go green once the loop threads the terminal turn's
// text; cells (B)/(F)/(G) pin the biconditional's other half and the untouched
// controls.

import { describe, expect, it } from "vitest";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import {
  runUntypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type ToolCallRequest,
} from "../src/runtime/query-tool-loop";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import type { Message } from "@earendil-works/pi-ai";

const QUERY_SITE: CheckpointSite = { file: "praw.theta", line: 7, column: 3 };

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: QUERY_SITE,
    thetaSlashName: "/praw",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

/** A never-aborted signal — none of these cells exercise cancellation. */
function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

/** A checkpoint whose `before` is inert — this suite pins the exhaustion field, not PIC-10. */
class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * A deterministic scripted `QueryModelDriver` (mirrors the ScriptedModel harness
 * in tests/query-tool-loop.test.ts): the ordered free-phase turns and an
 * optional forced-respond turn. The tool batch commits no side effects (these
 * cells assert only the exhaustion `Err` fields).
 */
class ScriptedModel implements QueryModelDriver {
  freePhaseCalls = 0;
  readonly #freeTurns: readonly FreePhaseTurn[];
  readonly #forced: ForcedRespondTurn;

  constructor(freeTurns: readonly FreePhaseTurn[], forced: ForcedRespondTurn) {
    this.#freeTurns = freeTurns;
    this.#forced = forced;
  }

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.freePhaseCalls += 1;
    const turn = this.#freeTurns[round];
    if (turn === undefined) {
      // Loud failure rather than a silent hang: a correct loop never reads past
      // the scripted free phase (it exhausts at the `max_rounds`-final branch).
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(
    _batch: readonly ToolCallRequest[],
    _round: number,
  ): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.#forced);
  }
}

const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });

/**
 * A `tool_use` free-phase turn carrying a single named call. When `text` is a
 * string the turn also carries it in the (Phase-2) `text` slot alongside the
 * batch — the narration the model emitted with the tool call, which ERR-19
 * defines `raw_response` to carry on the terminal turn. `text: null` builds the
 * BICONDITIONAL's other half: a pure tool-use turn (no accompanying text).
 *
 * The extra `text` property is inert to the loop today (the `tool_use` arm has
 * no text member yet), so under the esbuild transform it rides the object
 * at runtime; the loop's hardcoded `raw_response: null` is what makes the
 * text-carrying cells red. Once Phase 2 widens the arm and threads the value the
 * property is honoured and the same cells go green — no test edit required.
 */
const toolUseTurn = (toolName: string, text: string | null): FreePhaseTurn => ({
  kind: "tool_use",
  batch: [{ toolName, toolUseId: `${toolName}-call` }],
  ...(text !== null ? { text } : {}),
});

const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });

// ===========================================================================
// (A) + (C) WITNESS — the untyped loop threads the LAST consumed tool_use turn's
// text into `raw_response`; `rounds`/`last_tool_name` stay byte-identical to the
// pre-widening values (guards the bug-0308-fixed fields).
// ===========================================================================

describe("bug 0327 (A/C) — untyped exhaustion carries the terminal tool-use turn's narration", () => {
  it("(A) raw_response is the LAST consumed tool_use turn's text on exhaustion (queryerror-variants.md:151/:211)", async () => {
    // max_rounds: 2 with narrated tool rounds on BOTH slots. Round 0 narrates
    // "narration-0", round 1 narrates "narration-1"; the loop consumes both then
    // exhausts at the round-2 boundary. ERR-19's field carries the TERMINAL
    // (last consumed) turn's text — "narration-1", never "narration-0".
    const model = new ScriptedModel(
      [toolUseTurn("read0", "narration-0"), toolUseTurn("read1", "narration-1")],
      respond(null),
    );

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, config(2));

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    // THE WITNESS (red today: src/runtime/query-tool-loop.ts:388 hardcodes
    // `raw_response: null`; the `tool_use` arm at :94 carries no text to thread).
    expect(outcome.error.raw_response).toBe("narration-1");

    // (C) control: the widening leaves the bug-0308-fixed fields intact. Two
    // tool rounds ran; the last tool name is the round-1 call, not round-0's.
    expect(outcome.error.rounds).toBe(2);
    expect(outcome.rounds).toHaveLength(2);
    expect(outcome.error.last_tool_name).toBe("read1");
  });
});

// ===========================================================================
// (B) BICONDITIONAL OTHER HALF — a pure tool-use terminal turn (no text)
// exhausts with `raw_response === null`. Green today; must stay green post-fix.
// ===========================================================================

describe("bug 0327 (B) — a pure tool-use terminal turn keeps raw_response null", () => {
  it("(B) exhaustion on tool_use rounds carrying NO text yields raw_response null (queryerror-variants.md:211)", async () => {
    const model = new ScriptedModel(
      [toolUseTurn("read0", null), toolUseTurn("read1", null)],
      respond(null),
    );

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, config(2));

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    // The `null` value is RESERVED for the pure tool-use turn (biconditional).
    expect(outcome.error.raw_response).toBeNull();
    expect(outcome.error.rounds).toBe(2);
    expect(outcome.error.last_tool_name).toBe("read1");
  });
});

// ===========================================================================
// (R3) LOOP RESET GUARD — a narrated round-0 followed by a PURE round-1 exhausts
// with `raw_response === null`: the loop threads the LAST consumed turn's text,
// so stale round-0 narration must NOT leak. Guards against a regression to a
// truthy-guarded `lastTurnText` assignment (which would retain "narration-0").
// ===========================================================================

describe("bug 0327 (R3) — a pure terminal round resets stale narration to null", () => {
  it("(R3) narrated round-0 then pure round-1 exhausts with raw_response null (last turn wins)", async () => {
    const model = new ScriptedModel(
      [toolUseTurn("read0", "narration-0"), toolUseTurn("read1", null)],
      respond(null),
    );

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, config(2));

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    // The TERMINAL (round-1) turn was pure tool-use: its null text wins over the
    // round-0 narration, which must not leak (loop tracks the LAST turn's text).
    expect(outcome.error.raw_response).toBeNull();
    // The last tool name is the round-1 call, not round-0's.
    expect(outcome.error.last_tool_name).toBe("read1");
    expect(outcome.error.rounds).toBe(2);
  });
});

// ===========================================================================
// (F) CAP-0 CONTROL — max_rounds:0 exhausts at once (no turn ever ran), so no
// terminal tool-use turn exists → raw_response null, last_tool_name null.
// Composes with bug 0308's cap-0 reachability. Green today and post-fix.
// ===========================================================================

describe("bug 0327 (F) — the max_rounds:0 boundary exhausts with no terminal turn", () => {
  it("(F) max_rounds:0 exhausts with raw_response null and last_tool_name null (no round ran)", async () => {
    const model = new ScriptedModel([], respond(null));

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, config(0));

    expect(outcome.kind).toBe("tool_loop_exhausted");
    if (outcome.kind !== "tool_loop_exhausted") return;
    expect(model.freePhaseCalls).toBe(0);
    expect(outcome.error.raw_response).toBeNull();
    expect(outcome.error.last_tool_name).toBeNull();
    expect(outcome.error.rounds).toBe(0);
  });
});

// ===========================================================================
// (G) SUCCESS-PATH CONTROL — a terminating text turn under a non-exhausting cap
// returns `text` with the text unchanged and NO exhaustion `Err` (no
// raw_response involvement). Green today and post-fix (the widening touches only
// the exhaustion branch and the tool_use arm).
// ===========================================================================

describe("bug 0327 (G) — a terminating text turn is unaffected by the widening", () => {
  it("(G) a text turn under a cap that does not exhaust returns Ok(text), no exhaustion Err", async () => {
    const model = new ScriptedModel([textTurn("the-final-answer")], respond(null));

    const outcome = await runUntypedQueryLoop(new NoopCheckpoint(), liveSignal(), model, config(4));

    expect(outcome.kind).toBe("text");
    if (outcome.kind !== "text") return;
    expect(outcome.text).toBe("the-final-answer");
    // No exhaustion error is produced on the success path — there is no
    // `raw_response` to bind.
    expect("error" in outcome).toBe(false);
  });
});

// ===========================================================================
// (D) PROMPT-DRIVER SEAM (fallback unit). `LivePromptQueryModel.#exhaustionTurn`
// (src/extension/production-theta-producer.ts:4809) is private and its class is
// module-local and unexported; reaching the EXHAUSTED prompt path offline
// additionally requires driving pi's native tool loop until the governor sets
// `#exhaustion.exhausted`, which no existing offline harness exercises. Per the
// bug-0327 task's stated fallback, (D) instead pins the exact value Phase 2's
// `#exhaustionTurn` will thread: `extractTrailingTurnText(this.#readMessages())`
// (production-theta-producer.ts:4788 uses this same helper on the SUCCESS path;
// the fix carries it onto the exhausted path, empty→null). The prompt-driver
// threading itself is covered by the loop witness (A) above, the off-session
// end-to-end witness (E) in the sibling file, and the live probe in the bug doc.
// ===========================================================================

describe("bug 0327 (D) — extractTrailingTurnText yields the value the exhaustion turn will thread", () => {
  it("(D) the trailing turn's accompanying assistant text is extracted (the raw_response source)", () => {
    // A final turn whose assistant message narrated ("PLANSTEP …") alongside a
    // tool call: extractTrailingTurnText returns that narration — exactly what
    // Phase 2's #exhaustionTurn will carry into the tool_use `text` slot.
    const messages = [
      { role: "user", content: [{ type: "text", text: "read the chain" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "PLANSTEP read qz-ch2.txt to continue following the chain." },
          { type: "toolCall", id: "tc-read", name: "read", arguments: {} },
        ],
      },
    ] as unknown as Message[];

    expect(extractTrailingTurnText(messages)).toBe(
      "PLANSTEP read qz-ch2.txt to continue following the chain.",
    );
  });

  it("(D) a pure tool-use turn (no assistant text) extracts the empty string (→ null after empty-map)", () => {
    // The biconditional's other half at the driver seam: a terminal turn that
    // carried NO text extracts "" — which Phase 2 maps to null (the reserved
    // pure-tool-use value).
    const messages = [
      { role: "user", content: [{ type: "text", text: "read the chain" }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-read", name: "read", arguments: {} }],
      },
    ] as unknown as Message[];

    expect(extractTrailingTurnText(messages)).toBe("");
  });

  it("(D) a pure MULTI-round tool-use turn extracts separator-only whitespace (→ null after trim-map)", () => {
    // The reachable pure exhaustion shape: two text-less tool-call rounds. The
    // tool-result message carries role "toolResult" (NOT "user"), so
    // extractTrailingTurnText anchors on the single user query and joins BOTH
    // text-less assistant messages with "\n" — yielding `["", ""].join("\n")`,
    // i.e. "\n" (non-empty). This is exactly why #exhaustionTurn's mapping is
    // `text.trim().length > 0 ? text : null` and NOT `text.length > 0`:
    // "\n".trim() === "" collapses to null (the biconditional's reserved value),
    // so the fabricated separator whitespace never reaches raw_response.
    const messages = [
      { role: "user", content: [{ type: "text", text: "read the chain" }] },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-read0", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        content: [{ type: "toolResult", toolCallId: "tc-read0", output: "chapter one" }],
      },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "tc-read1", name: "read", arguments: {} }],
      },
    ] as unknown as Message[];

    const extracted = extractTrailingTurnText(messages);
    expect(extracted).toBe("\n");
    // Prove the trim-map's collapse concretely at the assertion site.
    expect(extracted.trim().length > 0 ? extracted : null).toBeNull();
  });
});
