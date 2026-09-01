import { describe, expect, it } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Message, UserMessage } from "@earendil-works/pi-ai";
import {
  composeThetaFixture,
  type ConversationBinding,
  type ConversationBindInput,
  type BinderRunInput,
  type BinderRunResult,
  type DrivenConversation,
  type ThetaCompositionInput,
  type ThetaProducerDeps,
} from "../src/extension/theta-composition-producer";
import type { ParsedTheta } from "../src/extension/reload-wiring";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
  type QueryHostDispatch,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import type { ExecuteBodyDeps } from "../src/runtime/statement-executor";
import type { Checkpoint, CheckpointKind, CheckpointSite } from "../src/seams/checkpoint";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import { makeErr, makeOk, type ThetaValue, type ResultValue } from "../src/runtime/value";
import type { QueryError } from "../src/runtime/query-error";
import type {
  ForcedRespondTurn,
  FreePhaseTurn,
  QueryModelDriver,
  QueryToolLoopConfig,
} from "../src/runtime/query-tool-loop";
import { extractTrailingTurnText } from "../src/runtime/conversation-drive";
import type {
  AgentToolResultEnvelope,
  CodeSideToolCall,
  ToolLoweringSink,
} from "../src/runtime/tool-call-execute";
import type { InvokeChild, DrivenInvokeResult } from "../src/runtime/invoke-cancellation";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type { Expr, ThetaBody, QueryExpr } from "../src/parser/theta-document";
import type { ThetaMode, ParsedFrontmatter } from "../src/parser/frontmatter";
import type { SourceRange } from "../src/diagnostics/diagnostic";

// V19e-T — failing tests for the paired `V19e` per-theta runnable composition
// producer.
//
// `V19e` maps a parsed `.theta` (`V19a` frontmatter + body AST under a slash
// name) to a `H4a` `ThetaFixture` (`{ slashName, run }`) whose `run` composes the
// existing runtime seams: it runs the `V11a` frontmatter binder (when
// applicable) BEFORE the theta interpreter, routes on the theta's `mode:` and
// drives `V19d`'s effectful executor (`executeBody`) against the appropriate
// conversation — prompt-mode against the user session (`V12a`/`V9c`),
// subagent-mode against a freshly spawned isolated `AgentSession` (`V9i`) — and
// surfaces the mode's return value (prompt-mode extracts the trailing-turn
// `Ok(string)`, `PIC-53`).
//
// The per-theta runnable-producer obligation is phrased declaratively in
// extension-bootstrap-and-per-theta.md §"Per-theta registration" ("the
// slash-command `handler` runs the binder (when applicable) and then the theta
// interpreter against the appropriate conversation") and carries NO `PREFIX-N`
// REQ-ID / `theta/...` code — a GOV-22 un-anchored obligation routed to
// release-time residue-inspection item 5, so this leaf closes NO
// coverage-matrix row. The prompt-mode / subagent-mode drive bullets are
// integration witnesses (SLSH-2 / PIC-53 owned by `V12a`/`V9c`; PIC-40…43 owned
// by `V9i`); they are NOT re-closed here.
//
// These tests wire the REAL executor (`executeBody`, via each mode binding's
// `executeDeps`) and the REAL host-assembly factory
// (`createEffectfulStatementHost`) to the query host's legitimate boundary
// double (a scripted `QueryModelDriver` that issues into the bound conversation
// double). They red because the `V19e` composition is absent: the `V19e-T`
// producer stub's `run` is inert — it runs no binder, does no routing, drives no
// executor, surfaces no result. Each test reds on its own primary assertion — a
// binder that never ran, an executor never driven against the user / private
// conversation, a prompt turn never issued, a subagent session never spawned, or
// a bind step that never committed ahead of the executor's first statement — not
// on a compile error, a missing fixture, or a harness throw.

// --- AST + Message + config helpers ----------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

function body(statements: readonly [] = [], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  } as AssistantMessage;
}

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

/** A no-op `Checkpoint` (an already-resolved promise). */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

class RecordingMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

function queryConfig(): QueryToolLoopConfig {
  return {
    maxRounds: 3,
    querySite: SITE,
    thetaSlashName: "demo",
    invocationId: "inv-1",
    occurredAt: 0,
  };
}

/** A minimal dispatch context — the producer's collaborators ignore it here. */
function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

// --- Conversation-session doubles ------------------------------------------

/** The narrow session surface a mode binding's query driver issues into. */
interface RecordingSession {
  readonly calls: string[];
  sendUserMessage(content: string): void;
}

class RecordingUserSession implements RecordingSession {
  readonly calls: string[] = [];
  sendUserMessage(content: string): void {
    this.calls.push(content);
  }
}

class RecordingSubagentSession implements RecordingSession {
  readonly calls: string[] = [];
  sendUserMessage(content: string): void {
    this.calls.push(content);
  }
}

/**
 * The legitimate query-host boundary the real query loop
 * (`runUntypedQueryLoop`) drives: it issues EXACTLY ONE user turn into the
 * bound conversation session for the 0-based first free-phase round, appends the
 * streamed assistant response to `messages` so the trailing-turn extraction sees
 * it, and returns the terminating plain-text turn.
 */
class ScriptedSessionQueryModel implements QueryModelDriver {
  constructor(
    private readonly session: RecordingSession,
    private readonly messages: Message[],
    private readonly finalText: string,
    private readonly onFirstTurn: () => void,
  ) {}
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    if (round === 0) {
      this.onFirstTurn();
      this.session.sendUserMessage("what is the answer?");
      this.messages.push(userMessage("what is the answer?"));
      this.messages.push(assistantMessage(this.finalText));
    }
    return Promise.resolve({ kind: "text", text: this.finalText });
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    // These deps drive the UNTYPED path (`typed: false`), so the forced-respond
    // turn is never dispatched; return a conforming structured payload rather
    // than a bare `null` so this stub does not encode the Defect-B
    // unvalidated-null shape even on the dead path.
    return Promise.resolve({ kind: "respond", payload: { ok: true } });
  }
}

// Test-local tool-call / invoke resolver doubles for this V19e harness: the
// test bodies carry only an `@`-query, so these resolvers are not reached in
// these cases. They are harness doubles satisfying the
// `EffectfulStatementHostDeps` shape — NOT an assertion of production behaviour.
// The shipped production resolvers (H8b) are real; their live wiring is covered
// by tests/production-live-resolvers.test.ts.
const INERT_TOOL_CALL: CodeSideToolCall = {
  toolName: "unused",
  committed: [],
  dispatch(): Promise<AgentToolResultEnvelope> {
    return Promise.resolve({ content: [] });
  },
};
const INERT_INVOKE: InvokeChild = {
  calleePath: "./unused.theta",
  committed: [],
  drive(): Promise<DrivenInvokeResult> {
    // Inert double (never reached in these cases); models an ordinary
    // callee-returned Ok when it is.
    return Promise.resolve({ source: "callee-returned", result: makeOk(null) });
  },
};

/**
 * Build the `V19d`/`V19c` executor deps bound to one conversation session,
 * whose real host issues the body `@`-query into that session. `onFirstTurn`
 * records the executor's first statement into the shared order log.
 */
function boundExecuteDeps(
  session: RecordingSession,
  messages: Message[],
  mode: DrivenConversationMode,
  onFirstTurn: () => void,
): ExecuteBodyDeps {
  const model = new ScriptedSessionQueryModel(session, messages, "final answer", onFirstTurn);
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    sink: NOOP_SINK,
    file: "theta.theta",
    evaluatePure(expr: Expr): ThetaValue {
      void expr;
      return null;
    },
    resolveQuery(): QueryHostDispatch {
      return { typed: false, model, config: queryConfig() };
    },
    resolveToolCall(): CodeSideToolCall {
      return INERT_TOOL_CALL;
    },
    resolveInvoke(): InvokeChild {
      return INERT_INVOKE;
    },
  };
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: NOOP_CHECKPOINT,
    signal: new AbortController().signal,
    mutator: new RecordingMutator(),
    mode,
    file: "test.theta",
  };
}

// --- Recording producer deps -----------------------------------------------

interface ProducerProbe {
  binderCalled: boolean;
  promptBound: boolean;
  subagentSpawned: boolean;
  drivenAgainst: DrivenConversation | undefined;
  surfaced: ResultValue | undefined;
  errNote: { thetaName: string; error: QueryError } | undefined;
}

interface Harness {
  readonly deps: ThetaProducerDeps;
  readonly order: string[];
  readonly userSession: RecordingUserSession;
  readonly subagentSession: RecordingSubagentSession;
  probe(): ProducerProbe;
}

/**
 * Assemble the recording producer deps: a binder that records its bind step, a
 * prompt-mode binding over the user session, and a subagent-mode binding over a
 * freshly spawned isolated private session. Each binding drives the REAL
 * executor against its own recording conversation.
 */
function makeHarness(opts: { bound?: boolean; surfaceErr?: QueryError } = {}): Harness {
  const order: string[] = [];
  const userSession = new RecordingUserSession();
  const subagentSession = new RecordingSubagentSession();
  const state: ProducerProbe = {
    binderCalled: false,
    promptBound: false,
    subagentSpawned: false,
    drivenAgainst: undefined,
    surfaced: undefined,
    errNote: undefined,
  };

  function bindingOver(
    session: RecordingSession,
    mode: DrivenConversationMode,
    drivenAgainst: DrivenConversation,
  ): ConversationBinding {
    const messages: Message[] = [];
    const executeDeps = boundExecuteDeps(session, messages, mode, () => order.push("stmt:query"));
    state.drivenAgainst = drivenAgainst;
    return {
      drivenAgainst,
      executeDeps,
      surface(): ResultValue {
        const r: ResultValue =
          opts.surfaceErr !== undefined
            ? makeErr(opts.surfaceErr as unknown as ThetaValue)
            : makeOk(extractTrailingTurnText(messages));
        state.surfaced = r;
        return r;
      },
    };
  }

  const deps: ThetaProducerDeps = {
    runBinder(_input: BinderRunInput): Promise<BinderRunResult> {
      state.binderCalled = true;
      order.push("bind");
      return Promise.resolve({ bound: opts.bound ?? true });
    },
    bindPromptConversation(_input: ConversationBindInput): ConversationBinding {
      state.promptBound = true;
      return bindingOver(userSession, "prompt", "prompt-user-session");
    },
    spawnSubagentConversation(_input: ConversationBindInput): Promise<ConversationBinding> {
      state.subagentSpawned = true;
      return Promise.resolve(bindingOver(subagentSession, "subagent", "subagent-private-session"));
    },
    emitTopLevelErrNote(thetaName: string, error: QueryError): void {
      state.errNote = { thetaName, error };
    },
    emitPanicNote(): void {
      // No top-level defect is injected on these value-path harnesses; the
      // panic-note surface is exercised by composition-producer's own panic
      // tests and subagent-drive-teardown. Stubbed so the deps satisfy the
      // widened `ThetaProducerDeps` interface.
    },
  };

  return {
    deps,
    order,
    userSession,
    subagentSession,
    probe: () => ({ ...state }),
  };
}

function thetaInput(slashName: string, mode: ThetaMode): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode };
  return { slashName, frontmatter, body: body([], queryExpr("what is the answer?")) };
}

// ===========================================================================
// Parsed .theta → registered ThetaFixture mapping (GOV-22 declarative MUST).
// ===========================================================================

describe("V19e-T — parsed .theta → runnable ThetaFixture mapping", () => {
  it("Convention (per-theta runnable producer, residue-inspection item 5): a parsed .theta maps to a registered ThetaFixture with the correct slashName whose run runs the binder then the theta interpreter against the appropriate conversation", async () => {
    const h = makeHarness();
    const fixture = composeThetaFixture(thetaInput("summarise", "prompt"), h.deps);

    expect(fixture.slashName, "the fixture registers under the parsed theta's slash name").toBe(
      "summarise",
    );

    await fixture.run("some args", ctxDouble());

    expect(
      h.probe().binderCalled,
      "the composed run runs the V11a binder before the interpreter",
    ).toBe(true);
    expect(
      h.userSession.calls.length,
      "the composed run drives the theta interpreter — one prompt turn against the appropriate (user) conversation",
    ).toBe(1);
  });
});

// ===========================================================================
// Prompt-mode drive — SLSH-2 / PIC-53 integration witness (V12a / V9c).
// ===========================================================================

describe("V19e-T — prompt-mode drive (SLSH-2 / PIC-53 integration witness)", () => {
  it("the run of a prompt-mode parsed .theta drives exactly one real prompt turn via V19d's executor against the user conversation and extracts the trailing-turn Ok(string), leaving one appended turn", async () => {
    const h = makeHarness();

    await composeThetaFixture(thetaInput("summarise", "prompt"), h.deps).run("", ctxDouble());

    const p = h.probe();
    expect(
      p.drivenAgainst,
      "the executor drives the user conversation in prompt mode",
    ).toBe("prompt-user-session");
    expect(
      h.userSession.calls.length,
      "exactly one prompt turn is appended to the user conversation",
    ).toBe(1);
    expect(p.surfaced?.ok, "the prompt-mode run surfaces the trailing-turn Ok(string)").toBe(true);
    expect(
      (p.surfaced as { readonly ok: true; readonly value: ThetaValue }).value,
      "PIC-53: the surfaced Ok value is the trailing-turn assistant text",
    ).toBe("final answer");
  });
});

// ===========================================================================
// Subagent-mode drive — PIC-40…43 integration witness (V9i spawn seam).
// ===========================================================================

describe("V19e-T — subagent-mode drive (PIC-40…43 integration witness)", () => {
  it("the run of a subagent-mode parsed .theta spawns an isolated AgentSession through V9i's spawn seam and drives the executor against that private session rather than the user conversation", async () => {
    const h = makeHarness();

    await composeThetaFixture(thetaInput("classify", "subagent"), h.deps).run("", ctxDouble());

    const p = h.probe();
    expect(
      p.subagentSpawned,
      "the run spawns an isolated AgentSession through V9i's spawn seam",
    ).toBe(true);
    expect(
      p.drivenAgainst,
      "the executor drives the private subagent session, not the user conversation",
    ).toBe("subagent-private-session");
    expect(
      h.subagentSession.calls.length,
      "the body query drives the private subagent session",
    ).toBe(1);
    expect(
      h.userSession.calls.length,
      "a subagent-mode theta does NOT drive the user conversation",
    ).toBe(0);
  });
});

// ===========================================================================
// Binder-before-interpreter ordering — V11a seam integration witness.
// ===========================================================================

describe("V19e-T — binder-before-interpreter ordering (V11a seam witness)", () => {
  it("run binds the frontmatter binder before entering the theta interpreter — the bind step commits ahead of the executor's first statement", async () => {
    const h = makeHarness();

    await composeThetaFixture(thetaInput("summarise", "prompt"), h.deps).run("", ctxDouble());

    expect(
      h.order,
      "the bind step commits ahead of the executor's first statement",
    ).toEqual(["bind", "stmt:query"]);
  });

  it("a non-binding binder envelope (needs-info / ambiguous / cancelled) short-circuits — the theta interpreter never runs", async () => {
    const h = makeHarness({ bound: false });

    await composeThetaFixture(thetaInput("summarise", "prompt"), h.deps).run("", ctxDouble());

    expect(h.probe().binderCalled, "the binder still runs").toBe(true);
    expect(
      h.userSession.calls.length,
      "a non-binding envelope short-circuits: the interpreter drives no turn",
    ).toBe(0);
  });
});

// ===========================================================================
// SLSH-3 top-level Err note — the slash-dispatch boundary emits the note.
// ===========================================================================

describe("V19e-T — SLSH-3 top-level Err at the slash-dispatch boundary", () => {
  it("a top-level Err returned by the mode's surface routes the QueryError to emitTopLevelErrNote (SLSH-3); the note is the boundary's user-facing surface", async () => {
    const err: QueryError = {
      kind: "validation",
      cause: "empty_template",
      attempts: 0,
      message: "rendered query template was empty",
    } as unknown as QueryError;
    const h = makeHarness({ surfaceErr: err });

    await composeThetaFixture(thetaInput("snkb", "prompt"), h.deps).run("", ctxDouble());

    const p = h.probe();
    expect(p.surfaced?.ok, "the failed run surfaces an Err, not a masking Ok").toBe(false);
    expect(
      p.errNote?.thetaName,
      "run routes the top-level Err to emitTopLevelErrNote under the theta's slash name",
    ).toBe("snkb");
    expect(
      p.errNote?.error,
      "the QueryError payload of the Err is threaded into the note renderer",
    ).toBe(err);
  });

  it("a successful top-level run emits NO boundary note (no over-emission)", async () => {
    const h = makeHarness();

    await composeThetaFixture(thetaInput("summarise", "prompt"), h.deps).run("", ctxDouble());

    expect(h.probe().errNote, "a successful run does not emit a top-level Err note").toBe(
      undefined,
    );
  });
});

// ===========================================================================
// ParsedTheta widening — Class-2 cross-leaf seam consumed by H8a.
// ===========================================================================

describe("V19e-T — ParsedTheta widening (Class-2 seam consumed by H8a)", () => {
  it("reload-wiring.ts ParsedTheta carries the V19a frontmatter + body AST + the producer run the H8a session_start registration consumes", async () => {
    const h = makeHarness();
    const input = thetaInput("summarise", "prompt");
    const fixture = composeThetaFixture(input, h.deps);

    // The widened ParsedTheta carries the V19a frontmatter + body AST + the
    // producer run — the seam H8a's session_start registration consumes. This
    // object literal compiles only against the widened seam.
    const parsed: ParsedTheta = {
      slashName: input.slashName,
      frontmatter: input.frontmatter,
      body: input.body,
      run: fixture.run,
    };

    expect(parsed.frontmatter, "ParsedTheta carries the V19a frontmatter").toBe(input.frontmatter);
    expect(parsed.body, "ParsedTheta carries the V19a body AST").toBe(input.body);

    await parsed.run("", ctxDouble());

    expect(
      h.probe().binderCalled,
      "the ParsedTheta-carried run is the live producer run — it drives the binder + interpreter",
    ).toBe(true);
  });
});
