// Bug 0478 — the binder's compact-transcript renderer assumed a four-arm
// `AgentMessage` union, but pi-coding-agent augments it with `compactionSummary`
// / `branchSummary` / `bashExecution` (dist/core/messages.d.ts, `declare module
// "@earendil-works/pi-agent-core"`), `buildSessionContext(...)` emits all three
// (dist/core/session-manager.js `sessionEntryToContextMessages`), and the
// renderer's `default:` arm cast them to `custom` → `textBody(undefined)` →
// `TypeError: content is not iterable` inside binding.
//
// RULING (option A, human-ruled 2026-09-14): EXCLUDE. Messages whose role is
// outside the closed set {user, assistant, toolResult, custom} are dropped
// BEFORE the truncation walk, so they contribute neither transcript bytes nor a
// per-message token estimate to any turn; the rule-3 role-tag set stays closed
// and every BNDR-7 reference rendering is unchanged. Spec:
// binder/binder-model-and-context.md §"Session-context truncation" (the
// pre-walk exclusion sentence, `#session-context-closed-set-exclusion`) and
// rule 3 of §"Compact-transcript format (normative)";
// pi-integration-contract/host-interfaces-core.md §`SessionContext` shape.
//
// RED-AT-FORK: pre-fix, `walkSessionContext` hands the out-of-set messages to
// the renderer (they also count toward the token total and a leading
// `compactionSummary` opens a turn of its own), so the walk-level cells red on
// their `includedMessages` / `includedTurnCount` assertions and every render
// cell reds on the TypeError. The production-route cells red on the same
// TypeError escaping `runBinder`.
//
// Tier: UNIT (walk + renderer over hand-built `AgentMessage` lists; the
// production route through the real `runBinder` seam with the off-session
// `complete()` mocked, mirroring tests/e2e-s5-binder-echo-emission.test.ts and
// tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts). No provider,
// no live model.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply plus the captured `complete()` context
// (its `systemPrompt` carries the *Recent session context* block under test).
// `vi.hoisted` so the hoisted `vi.mock` factory can close over the holder.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
  contexts: [] as unknown[],
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) => {
      scripted.contexts.push(context);
      return scripted.replyFor?.(context);
    }),
  };
});

import type {
  AssistantMessage,
  TextContent,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
  isTranscriptMessage,
  renderCompactTranscript,
  type TranscriptMessage,
} from "../src/binder/compact-transcript";
import {
  walkSessionContext,
  type SessionContextWalkResult,
} from "../src/binder/session-context-walk";
import type { TokenEstimator } from "../src/seams/token-estimator";
import { FakeTokenEstimator } from "./helpers/fake-token-estimator";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

// --- AgentMessage constructors ----------------------------------------------

const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;

function user(text: string): UserMessage {
  return { role: "user", content: text, timestamp: 0 };
}

function assistant(text: string): AssistantMessage {
  const content: TextContent[] = [{ type: "text", text }];
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    provider: "anthropic",
    model: "test-model",
    usage: USAGE,
    stopReason: "stop",
    timestamp: 0,
  };
}

function custom(customType: string, content: string): AgentMessage {
  return { role: "custom", customType, content, display: true, timestamp: 0 };
}

// The three pi-coding-agent augmentations that reach the renderer. Each is a
// real `AgentMessage` arm at the pin (dist/core/messages.d.ts), typed as such so
// a pin that drops one fails `tsc` here rather than silently vacating a cell.
function compactionSummary(summary: string): AgentMessage {
  return { role: "compactionSummary", summary, tokensBefore: 1234, timestamp: 0 };
}

function branchSummary(summary: string): AgentMessage {
  return { role: "branchSummary", summary, fromId: "branch-1", timestamp: 0 };
}

function bashExecution(command: string, excludeFromContext?: boolean): AgentMessage {
  return {
    role: "bashExecution",
    command,
    output: "out",
    exitCode: 0,
    cancelled: false,
    truncated: false,
    timestamp: 0,
    ...(excludeFromContext === undefined ? {} : { excludeFromContext }),
  };
}

/** Sentinel bytes that must never reach the transcript. */
const FOREIGN_SUMMARY = "COMPACTION-SUMMARY-BYTES";
const FOREIGN_BRANCH = "BRANCH-SUMMARY-BYTES";
const FOREIGN_COMMAND = "bash-command-bytes";

/**
 * A per-message count table: every in-set message weighs `inSet`; every
 * out-of-set message weighs `foreign`. `foreign` defaults to a value that alone
 * exceeds the 8000-token cap, so a walk that COUNTS an out-of-set message drops
 * its whole turn — an assertion-visible symptom rather than a silent one.
 */
function counts(
  messages: readonly AgentMessage[],
  inSet: number,
  foreign = 9000,
): ReadonlyMap<AgentMessage, number> {
  const table = new Map<AgentMessage, number>();
  for (const m of messages) {
    const isInSet =
      m.role === "user" || m.role === "assistant" || m.role === "toolResult" || m.role === "custom";
    table.set(m, isInSet ? inSet : foreign);
  }
  return table;
}

function walk(
  messages: readonly AgentMessage[],
  estimator: TokenEstimator,
): SessionContextWalkResult {
  return walkSessionContext({
    messages,
    estimator,
    mode: "prompt",
    bindContext: "session",
  });
}

/** Render an included slice and unwrap the `ok` body (fails loud otherwise). */
function renderBody(result: SessionContextWalkResult): string | undefined {
  const rendered = renderCompactTranscript(result.includedMessages);
  if (rendered.kind !== "ok") {
    expect.unreachable(`renderCompactTranscript returned '${rendered.kind}', expected 'ok'`);
  }
  return rendered.sessionContext?.transcriptBody;
}

// ============================================================================
// The closed-set guard and the renderer's input type
// binder/binder-model-and-context.md#session-context-closed-set-exclusion;
// pi-integration-contract/host-interfaces-core.md#sessioncontext-shape

describe("bug 0478 — the closed TranscriptMessage set", () => {
  it("isTranscriptMessage admits exactly user / assistant / toolResult / custom and excludes the three pinned host augmentations", () => {
    expect(isTranscriptMessage(user("u"))).toBe(true);
    expect(isTranscriptMessage(assistant("a"))).toBe(true);
    expect(
      isTranscriptMessage({
        role: "toolResult",
        toolCallId: "tc",
        toolName: "t",
        content: [{ type: "text", text: "r" }],
        isError: false,
        timestamp: 0,
      }),
    ).toBe(true);
    expect(isTranscriptMessage(custom("theta-system-note", "n"))).toBe(true);

    expect(isTranscriptMessage(compactionSummary(FOREIGN_SUMMARY))).toBe(false);
    expect(isTranscriptMessage(branchSummary(FOREIGN_BRANCH))).toBe(false);
    expect(isTranscriptMessage(bashExecution(FOREIGN_COMMAND))).toBe(false);
    expect(isTranscriptMessage(bashExecution(FOREIGN_COMMAND, true))).toBe(false);
  });

  it("a role the pinned type does not know is outside the set at runtime (the never-typed default arm is the closed-set drop, not a throw)", () => {
    // A second host may augment `CustomAgentMessages` beyond the pin; the guard
    // must classify such a value as out-of-set rather than throw inside binding.
    const unpinned = { role: "skillInvocation", timestamp: 0 } as unknown as AgentMessage;
    expect(isTranscriptMessage(unpinned)).toBe(false);
  });

  it("type-level tripwire: renderCompactTranscript's parameter is the closed set, so an out-of-set AgentMessage is a compile error (never executed)", () => {
    // `tsc` over tests/ is part of the gate: if the renderer's input widens back
    // to the open `AgentMessage` union, the directive below becomes unused and
    // fails the typecheck. The closure is never invoked.
    const neverCalled = (m: AgentMessage): void => {
      // @ts-expect-error — bug 0478: an out-of-set AgentMessage is not a TranscriptMessage
      renderCompactTranscript([m]);
    };
    expect(typeof neverCalled).toBe("function");
  });
});

// ============================================================================
// Walk + renderer — the pre-walk exclusion
// binder/binder-model-and-context.md#session-context-closed-set-exclusion

describe("bug 0478 — out-of-set AgentMessage variants are dropped before the truncation walk", () => {
  it("a session carrying compactionSummary / branchSummary / bashExecution (with and without excludeFromContext) among ordinary turns walks and renders byte-identical to the same session without them", () => {
    const u1 = user("recent question");
    const a1 = assistant("recent answer");
    const u2 = user("follow-up");
    const a2 = assistant("done");
    const withForeign: AgentMessage[] = [
      compactionSummary(FOREIGN_SUMMARY),
      u1,
      a1,
      branchSummary(FOREIGN_BRANCH),
      bashExecution(FOREIGN_COMMAND),
      bashExecution(FOREIGN_COMMAND, true),
      u2,
      a2,
    ];
    const without: AgentMessage[] = [u1, a1, u2, a2];

    const walked = walk(withForeign, new FakeTokenEstimator(counts(withForeign, 10)));
    const control = walk(without, new FakeTokenEstimator(counts(without, 10)));

    // The included slice is exactly the in-set messages, chronological; none of
    // the three foreign roles survives into it.
    expect(walked.includedMessages).toEqual([u1, a1, u2, a2]);
    expect(walked.includedMessages.map((m) => m.role)).not.toContain("compactionSummary");
    expect(walked.includedMessages.map((m) => m.role)).not.toContain("branchSummary");
    expect(walked.includedMessages.map((m) => m.role)).not.toContain("bashExecution");

    // Turn count and token total ignore the foreign messages entirely (had they
    // counted, the 9000-token weights would have dropped the older turn).
    expect(walked.includedTurnCount).toBe(2);
    expect(walked.includedTokenTotal).toBe(40);
    expect(walked.includedTurnCount).toBe(control.includedTurnCount);
    expect(walked.includedTokenTotal).toBe(control.includedTokenTotal);

    // Byte-identical rendering to the foreign-free session (BNDR-7 bytes).
    const body = renderBody(walked);
    expect(body).toBe(
      "[user]: recent question\n" +
        "[assistant]: recent answer\n" +
        "\n" +
        "[user]: follow-up\n" +
        "[assistant]: done\n",
    );
    expect(body).toBe(renderBody(control));
    expect(body).not.toContain(FOREIGN_SUMMARY);
    expect(body).not.toContain(FOREIGN_BRANCH);
    expect(body).not.toContain(FOREIGN_COMMAND);
  });

  it("the TokenEstimator seam is never consulted for an out-of-set message", () => {
    // The spec places the drop BEFORE any token is counted: an estimator that
    // sees a foreign role proves the exclusion ran too late (or not at all).
    const seen: string[] = [];
    const spy: TokenEstimator = {
      estimate: (message: AgentMessage): number => {
        seen.push(message.role);
        return 1;
      },
    };
    const messages: AgentMessage[] = [
      compactionSummary(FOREIGN_SUMMARY),
      user("q"),
      bashExecution(FOREIGN_COMMAND),
      assistant("a"),
      branchSummary(FOREIGN_BRANCH),
    ];

    const walked = walk(messages, spy);

    expect(seen).toEqual(["user", "assistant"]);
    expect(walked.includedTokenTotal).toBe(2);
    expect(walked.includedTurnCount).toBe(1);
  });

  it("post-compaction shape: the leading compactionSummary the compaction entry projects to does not open a turn — the first in-set user message does", () => {
    // At the pin a compacted session's `buildSessionContext(...).messages`
    // begins with the `compactionSummary` message (buildContextEntries puts the
    // compaction entry first), followed by the kept entries from a turn-start
    // cut point. Pre-fix the summary opened a turn of its own (turn count 2)
    // and then threw in the renderer.
    const u1 = user("kept question");
    const a1 = assistant("kept answer");
    const messages: AgentMessage[] = [compactionSummary(FOREIGN_SUMMARY), u1, a1];

    // Foreign weight kept SMALL here so the cell discriminates on turn count, not
    // on the token cap masking the extra turn.
    const walked = walk(messages, new FakeTokenEstimator(counts(messages, 5, 5)));

    expect(walked.includedTurnCount).toBe(1);
    expect(walked.includedTokenTotal).toBe(10);
    expect(walked.includedMessages).toEqual([u1, a1]);
    expect(renderBody(walked)).toBe("[user]: kept question\n" + "[assistant]: kept answer\n");
  });

  it("a session consisting only of out-of-set messages walks to zero turns (BNDR-7i void truncation: no block)", () => {
    const messages: AgentMessage[] = [
      compactionSummary(FOREIGN_SUMMARY),
      bashExecution(FOREIGN_COMMAND, true),
    ];

    // Small foreign weight: a walk that admitted these would include one turn.
    const walked = walk(messages, new FakeTokenEstimator(counts(messages, 1, 1)));

    expect(walked.applies).toBe(true);
    expect(walked.includedTurnCount).toBe(0);
    expect(walked.includedMessages).toEqual([]);
    const rendered = renderCompactTranscript(walked.includedMessages);
    expect(rendered.kind).toBe("ok");
    if (rendered.kind === "ok") {
      expect(rendered.sessionContext).toBeUndefined();
    }
  });

  it("BNDR-9 is unaffected: a safe custom message among out-of-set messages still renders under its [custom:<type>] tag", () => {
    // binder-model-and-context.md#bndr-7c shape, with foreign messages
    // interleaved. Pre-fix this threw in the renderer on the leading summary.
    const messages: AgentMessage[] = [
      compactionSummary(FOREIGN_SUMMARY),
      user("/lookup foo"),
      bashExecution(FOREIGN_COMMAND),
      custom("theta-system-note", "theta /lookup: argument binding cancelled"),
      branchSummary(FOREIGN_BRANCH),
    ];

    // Small foreign weight so the whole turn is walked and the renderer is
    // reached (pre-fix: the TypeError; post-fix: the BNDR-7c bytes).
    const walked = walk(messages, new FakeTokenEstimator(counts(messages, 3, 3)));

    expect(renderBody(walked)).toBe(
      "[user]: /lookup foo\n" +
        "[custom:theta-system-note]: theta /lookup: argument binding cancelled\n",
    );
  });

  it("CONTROL — BNDR-9 is unaffected: an unsafe customType among out-of-set messages is still rejected with custom-type-unsafe (green both directions)", () => {
    const unsafe = "weird]type";
    const messages: AgentMessage[] = [
      compactionSummary(FOREIGN_SUMMARY),
      user("go"),
      custom(unsafe, "body"),
      bashExecution(FOREIGN_COMMAND, true),
    ];

    // Small foreign weight so the turn is walked in BOTH directions: pre-fix the
    // pre-scan rejects before any rendering; post-fix the same pre-scan rejects
    // over the filtered slice.
    const walked = walk(messages, new FakeTokenEstimator(counts(messages, 3, 3)));
    const rendered = renderCompactTranscript(walked.includedMessages);

    expect(rendered.kind).toBe("custom-type-unsafe");
    if (rendered.kind === "custom-type-unsafe") {
      expect(rendered.value).toBe(unsafe);
    }
  });
});

// ============================================================================
// Production route — `#buildBinderSessionContext` through the real `runBinder`
// src/extension/production-theta-producer.ts

const SYSTEM_NOTE_CHANNEL = "theta-system-note";
const SLASH_NAME = "code-review";

interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
}

/**
 * Script a ToolCall-bearing `ok` binder reply naming the binder tool production
 * attached on the captured call (`context.tools[0].name`).
 */
function scriptOk(args: Record<string, unknown>): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope: { kind: "ok", args } } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(src: string) {
  const source: ThetaSource = {
    path: "code-review.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * A runtime-root double sufficient for a `bind_context: session` binder pass:
 * a flat 1-token-per-message estimator (the walk consumes `root.tokenEstimator`)
 * and the real AJV validator (the forced-tool routing validates the envelope).
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    tokenEstimator: { estimate: (_message: unknown): number => 1 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

// A two-required-string-param, `bind_context: session`, prompt-mode binder
// theta: two fields force a genuine binder pass; `bind_context: session` +
// `mode: prompt` gate the session-context block.
const SESSION_BINDER_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "bind_context: session",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");

function sessionBinderTheta(): ThetaCompositionInput {
  const doc = parse(SESSION_BINDER_THETA);
  return {
    slashName: SLASH_NAME,
    sourcePath: "/theta/code-review.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

/** A `SessionManager` entry in the `buildSessionContext` read shape. */
interface EntryDouble {
  readonly type: string;
  readonly id: string;
  readonly parentId: string | null;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

/** An entry before chaining: everything but the `parentId` / `timestamp` chain fields. */
interface UnchainedEntry {
  readonly type: string;
  readonly id: string;
  readonly [key: string]: unknown;
}

/** Chain `entries` by `parentId` in array order (the first is the root). */
function chained(entries: readonly UnchainedEntry[]): EntryDouble[] {
  return entries.map((entry, i) => ({
    ...entry,
    parentId: i === 0 ? null : entries[i - 1]!.id,
    timestamp: `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
  }));
}

function messageEntry(id: string, message: Record<string, unknown>): UnchainedEntry {
  return { type: "message", id, message };
}

/**
 * The compacted-session store: two summarised turns (e1/e2), a compaction
 * entry keeping from e3, then a branch summary, a `!cmd` and a `!!cmd`
 * bashExecution, and a final turn. `buildContextEntries` yields
 * [e5, e3, e4, e6, e7, e8, e9, e10] → messages [compactionSummary, user,
 * assistant, branchSummary, bashExecution, bashExecution(excluded), user,
 * assistant].
 */
function compactedEntries(): EntryDouble[] {
  return chained([
    messageEntry("e1", { role: "user", content: "old question", timestamp: 0 }),
    messageEntry("e2", assistant("old answer") as unknown as Record<string, unknown>),
    messageEntry("e3", { role: "user", content: "recent question", timestamp: 0 }),
    messageEntry("e4", assistant("recent answer") as unknown as Record<string, unknown>),
    {
      type: "compaction",
      id: "e5",
      summary: FOREIGN_SUMMARY,
      firstKeptEntryId: "e3",
      tokensBefore: 1234,
    },
    { type: "branch_summary", id: "e6", fromId: "e2", summary: FOREIGN_BRANCH },
    messageEntry("e7", {
      role: "bashExecution",
      command: FOREIGN_COMMAND,
      output: "out",
      exitCode: 0,
      cancelled: false,
      truncated: false,
      timestamp: 0,
    }),
    messageEntry("e8", {
      role: "bashExecution",
      command: FOREIGN_COMMAND,
      output: "out",
      exitCode: 0,
      cancelled: false,
      truncated: false,
      excludeFromContext: true,
      timestamp: 0,
    }),
    messageEntry("e9", { role: "user", content: "follow-up", timestamp: 0 }),
    messageEntry("e10", assistant("done") as unknown as Record<string, unknown>),
  ]);
}

/** The same conversation with no compaction / branch / bash entries at all. */
function plainEntries(): EntryDouble[] {
  return chained([
    messageEntry("p1", { role: "user", content: "recent question", timestamp: 0 }),
    messageEntry("p2", assistant("recent answer") as unknown as Record<string, unknown>),
    messageEntry("p3", { role: "user", content: "follow-up", timestamp: 0 }),
    messageEntry("p4", assistant("done") as unknown as Record<string, unknown>),
  ]);
}

function ctxWith(entries: readonly EntryDouble[]): ExtensionCommandContext {
  const leaf = entries[entries.length - 1]!.id;
  return {
    sessionManager: {
      getEntries: (): unknown[] => [...entries],
      getLeafId: (): string => leaf,
    },
  } as unknown as ExtensionCommandContext;
}

function capturedSystemPrompt(index: number): string {
  const context = scripted.contexts[index] as { systemPrompt?: unknown } | undefined;
  expect(context, `complete() call #${index} was captured`).toBeDefined();
  expect(typeof context?.systemPrompt, "the captured context carries a string systemPrompt").toBe(
    "string",
  );
  return context!.systemPrompt as string;
}

const EXPECTED_BLOCK =
  "Recent session context (most recent 20 turns / 8000 tokens):\n" +
  "[user]: recent question\n" +
  "[assistant]: recent answer\n" +
  "\n" +
  "[user]: follow-up\n" +
  "[assistant]: done\n" +
  "\n";

beforeEach(() => {
  scripted.replyFor = undefined;
  scripted.contexts.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("bug 0478 — production route: a bind_context: session theta binds against a compacted session", () => {
  it("proceeds to bind (no throw) and the Recent session context block carries only the in-set turns", async () => {
    scriptOk({ topic: "async", audience: "team" });
    const { deps, notes } = producerWithCapture();

    const result = await deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWith(compactedEntries()),
    });

    // Binding proceeded to the off-session call and bound.
    expect(result.bound, "the binder binds against a compacted session").toBe(true);
    expect(result.args).toEqual({ topic: "async", audience: "team" });
    expect(scripted.contexts, "exactly one binder complete() call").toHaveLength(1);

    // The block is the in-set turns only — no summary / branch / bash bytes.
    const systemPrompt = capturedSystemPrompt(0);
    expect(systemPrompt).toContain(EXPECTED_BLOCK);
    expect(systemPrompt).not.toContain(FOREIGN_SUMMARY);
    expect(systemPrompt).not.toContain(FOREIGN_BRANCH);
    expect(systemPrompt).not.toContain(FOREIGN_COMMAND);
    expect(systemPrompt).not.toContain("old question");

    // The only note is the success echo; no failure / unsafe note fired.
    const channel = notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
    expect(channel.map((n) => n.content)).toEqual([
      "Running /code-review: topic=async, audience=team",
    ]);
  });

  it("the binder system prompt is byte-identical to the one built for the same conversation without compaction / branch / bash entries", async () => {
    scriptOk({ topic: "async", audience: "team" });
    const compacted = producerWithCapture();
    await compacted.deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWith(compactedEntries()),
    });

    scriptOk({ topic: "async", audience: "team" });
    const plain = producerWithCapture();
    await plain.deps.runBinder({
      theta: sessionBinderTheta(),
      args: "the async module for the team",
      ctx: ctxWith(plainEntries()),
    });

    expect(scripted.contexts).toHaveLength(2);
    expect(capturedSystemPrompt(0)).toBe(capturedSystemPrompt(1));
  });
});
