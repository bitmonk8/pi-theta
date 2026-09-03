// Bug 0399 — the SLSH-4 top-level `Err` note's boundary-constructed
// `RuntimeEvent` omits the shape-pinned `attempts` / `tokens_used` / `masked`
// fields, and the origin-side validation event that 0355 taught to compute
// `masked` (`TypedQueryOutcome.validation.event`) is built and dropped with no
// consumer on the one user-visible emission.
//
// WHY this test exists: 0383 (fixed 0.360.0) made `emitTopLevelErrNote` ship a
// real `RuntimeEvent` built at the boundary from the terminal `Err` leaf, and
// adjudicated the freshness of `invocation_id`/`occurred_at`/`theta` plus the
// omission of `query_site` — but NOT `attempts`/`tokens_used`/`masked`. The
// `RuntimeEvent` shape pins those three as populated for exactly these event
// classes (runtime-event-channel.md:76–78 — `attempts?` "populated for
// `validation` events on respond-repair exhaustion", `tokens_used?` "populated
// for `context_overflow` events when the provider supplies the count", `masked?`
// per PIC-1), and all three are derivable at the construction site. This test
// locks bug doc §Fix constraints 1, 2 and the §Fix constraint-4 both-directions
// witness.
//
// The sibling discard path proves the fields ARE derivable at the boundary: at
// `src/runtime/query-discard.ts:190–194` `buildDiscardEvent` preserves
// `attempts`/`tokens_used` from the SAME leaf variants (`"attempts" in error &&
// typeof error.attempts === "number"`; `tokens_used` number-only so `null` stays
// canonically absent). The user-facing `display: true` note is currently poorer
// than the operator-only `display: false` discard note for the same error.
//
// Two halves, per the parent adjudication (both land in ONE commit):
//   (ii) boundary-BUILT arm (kinds with no threaded origin event): preserve
//        `attempts`/`tokens_used` from the leaf exactly `buildDiscardEvent`-
//        shaped. Witnessed by direct `emitTopLevelErrNote` calls (the b0383 rig
//        — `emitTopLevelErrNote` is a public producer-deps member).
//   (i)  `masked`: the typed-query loop constructs the conformant origin event
//        (`TypedQueryOutcome.validation.event`, carrying 0355's corrected
//        `masked`) but `src/runtime/effectful-statement-host.ts:278–283` drops
//        it (`return { ok: false, error: outcome.error }`), so the boundary
//        reconstructs a fresh event WITHOUT `masked`. PIC-1 (f)
//        (runtime-event-channel.md) forbids re-deriving `masked` at the boundary
//        — the origin event must be THREADED verbatim. Witnessed end-to-end: a
//        repair-terminal validation cascade driven through the real `executeBody`
//        to the production `emitTopLevelErrNote` boundary emission.
//
// Tier: UNIT (offline, provider-free, deterministic). Half (ii) needs only the
// production producer with a capturing `pi.sendMessage` (the b0383 rig). Half
// (i) drives the REAL typed-query cascade through the REAL `executeBody` /
// `createEffectfulStatementHost` / `runTypedQueryLoop` seams (the b0355 +
// effectful-statement-host rigs fused) into the REAL `emitTopLevelErrNote`
// boundary emission — the exact 3-arg call
// `src/extension/theta-composition-producer.ts:571` makes once the fix threads
// `originEvent`. No provider, no live model, no host process is needed to reach
// the seam, so an integration/live tier would add cost and nondeterminism for no
// additional reach.

import { describe, expect, it } from "vitest";

import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import { renderTopLevelErrNote } from "../src/runtime/err-note-render";
import type { RuntimeEvent } from "../src/runtime/runtime-event-channel";
import type {
  ContextOverflowError,
  QueryError,
  ValidationError,
} from "../src/runtime/query-error";

// Half (i) — the real typed-query cascade + real executor seams (b0355 rig).
import {
  executeBody,
  type ExecuteBodyDeps,
} from "../src/runtime/statement-executor";
import {
  createEffectfulStatementHost,
  type EffectfulStatementHostDeps,
} from "../src/runtime/effectful-statement-host";
import { buildEnvironment } from "../src/runtime/lexical-environment";
import {
  runTypedQueryLoop,
  type ForcedRespondTurn,
  type FreePhaseTurn,
  type QueryModelDriver,
  type QueryToolLoopConfig,
  type TypedQuerySchemaValidation,
} from "../src/runtime/query-tool-loop";
import {
  buildTypedQueryValidation,
  type FollowUpRespondOutcome,
} from "../src/runtime/typed-query-validation";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type Expr,
  type QueryExpr,
  type ThetaBody,
} from "../src/parser/theta-document";
import type { CommittedSideEffect } from "../src/runtime/no-rollback";
import type {
  CommittedConversationMutator,
  CommittedSurface,
  DrivenConversationMode,
} from "../src/runtime/terminal-outcomes";
import type { ToolLoweringSink } from "../src/runtime/tool-call-execute";
import type { ThetaSource } from "../src/lexer/lexer";
import type { Checkpoint } from "../src/seams/checkpoint";
import type { SourceRange } from "../src/diagnostics/diagnostic";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// Known id/timestamp so the boundary-BUILT (absent-event) arm's freshly-minted
// `invocation_id` / `occurred_at` are assertable at exact values — the 0383
// freshness set this bug does NOT re-litigate.
const KNOWN_INVOCATION_ID = "inv-b0399";
const KNOWN_WALL_NOW = 424242;

/**
 * A captured `pi.sendMessage` custom message — INCLUDING `details`, the
 * machine-readable half this bug is about.
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}

/**
 * A runtime-root double whose `idSource.newInvocationId()` / `clock.wallNow()`
 * return KNOWN values, so the boundary-BUILT path's minted freshness fields are
 * assertable at exact values (mirrors the b0383 rig). `fileSystem` is absent so
 * the invoke-provenance ledger is undefined and the SLSH-5 chain is empty
 * (irrelevant to the `details` payload under test).
 */
function rootDouble(): RuntimeRoot {
  return {
    idSource: {
      newInvocationId: (): string => KNOWN_INVOCATION_ID,
      newToolCallId: (): string => "tc-b0399",
    },
    clock: { wallNow: (): number => KNOWN_WALL_NOW },
  } as unknown as RuntimeRoot;
}

/**
 * A production producer wired with a capturing `pi.sendMessage` and the
 * known-value root double. Returns the producer deps + the captured-notes sink.
 */
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
    getAvailable: (): readonly unknown[] => [],
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

/** The `event` arm of a captured note's `details`, typed for assertion. */
function eventArm(details: unknown): Record<string, unknown> {
  return (details as { event: Record<string, unknown> }).event;
}

// Fully-typed leaf builders — the interfaces require every field, so the file
// compiles without casts at the construction site.
function validationLeaf(attempts: number): ValidationError {
  return {
    kind: "validation",
    cause: "schema_validation",
    message: "model failed schema",
    attempts,
    validation_errors: [
      { path: "/a", message: "must be array", schema_keyword: "type" },
    ],
    raw_response: "{}",
  };
}

function contextOverflowLeaf(tokens_used: number | null): ContextOverflowError {
  return {
    kind: "context_overflow",
    message: "context window exceeded",
    tokens_used,
    tokens_limit: 200000,
    raw_response: null,
  };
}

// ===========================================================================
// HALF (ii) — boundary-BUILT arm: `attempts` / `tokens_used` preservation
// (bug doc §Fix constraint 2). Direct `emitTopLevelErrNote` calls, the b0383
// rig; RED today because the absent-event arm
// (production-theta-producer.ts:1671–1683) builds only the five freshness
// fields and no `attempts`/`tokens_used` arm.
// ===========================================================================

describe("bug 0399 (ii) — the boundary-built RuntimeEvent preserves attempts/tokens_used from the leaf (buildDiscardEvent-shaped)", () => {
  it("bug 0399: a validation leaf (attempts 3) yields details.event.attempts === 3", () => {
    const { deps, notes } = producerWithCapture();
    const leaf = validationLeaf(3);

    deps.emitTopLevelErrNote("demo", leaf);

    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes, "exactly one SLSH-4 note is emitted").toHaveLength(1);
    const event = eventArm(channelNotes[0]!.details);

    // THE RED ASSERTION (bug doc §Fix constraint 2; runtime-event-channel.md:49
    // — `attempts?` populated for validation events on respond-repair
    // exhaustion). RED today: the boundary-built arm omits `attempts`, so
    // `event.attempts` is undefined even though the SNK-a `content` line
    // interpolates it ("... after 3 respond-repair attempts"). GREEN post-fix:
    // preserved buildDiscardEvent-shaped.
    expect(
      event.attempts,
      `runtime-event-channel.md:76 pins attempts for validation events; observed ${JSON.stringify(event)}`,
    ).toBe(3);
  });

  it("bug 0399: a context_overflow leaf (tokens_used 220044) yields details.event.tokens_used === 220044", () => {
    const { deps, notes } = producerWithCapture();
    const leaf = contextOverflowLeaf(220044);

    deps.emitTopLevelErrNote("demo", leaf);

    const event = eventArm(noteChannelEntries(notes)[0]!.details);

    // THE RED ASSERTION (runtime-event-channel.md:51 — `tokens_used?` populated
    // for context_overflow events when the provider supplies the count). RED
    // today: the boundary-built arm omits it; GREEN post-fix.
    expect(
      event.tokens_used,
      `runtime-event-channel.md:77 pins tokens_used for context_overflow events with a provider count; observed ${JSON.stringify(event)}`,
    ).toBe(220044);
  });

  it("bug 0399 (both-directions guard): a context_overflow leaf with tokens_used null keeps the field canonically ABSENT", () => {
    // GREEN today AND post-fix — the fix must NOT fabricate the field. The
    // sibling `buildDiscardEvent` is number-only (query-discard.ts:193), so a
    // `null` count stays absent; this cell proves the number-only preservation
    // shape rather than an unconditional copy that would leak `null`.
    const { deps, notes } = producerWithCapture();
    const leaf = contextOverflowLeaf(null);

    deps.emitTopLevelErrNote("demo", leaf);

    const event = eventArm(noteChannelEntries(notes)[0]!.details);
    expect(
      "tokens_used" in event,
      `a null tokens_used stays canonically absent (query-discard.ts:193 number-only); observed ${JSON.stringify(event)}`,
    ).toBe(false);
  });

  it("bug 0399 (additive/byte-identity control): content and the 0383 freshness fields are unchanged by the new fields", () => {
    // GREEN both directions. The new `attempts` field must be purely ADDITIVE:
    // the SLSH-4 `content` bytes and the 0383-adjudicated freshness set
    // (kind, theta, invocation_id, message, occurred_at) stay exactly as they are
    // today. `query_site` stays omitted on the boundary-built path (0383
    // §Pinned dispositions — SANCTIONED).
    const { deps, notes } = producerWithCapture();
    const leaf = validationLeaf(3);

    deps.emitTopLevelErrNote("demo", leaf);

    const note = noteChannelEntries(notes)[0]!;
    expect(note.display, "the SLSH-4 note is display:true").toBe(true);
    expect(
      note.content,
      "the SNK-a content line is byte-identical to renderTopLevelErrNote",
    ).toBe(renderTopLevelErrNote({ thetaName: "demo", error: leaf, chain: [] }));

    const event = eventArm(note.details);
    expect(event.kind, "kind is the leaf's validation kind").toBe("validation");
    expect(event.theta, "theta is `/<thetaName>`").toBe("/demo");
    expect(event.invocation_id, "invocation_id is the fresh root id (0383 freshness)").toBe(
      KNOWN_INVOCATION_ID,
    );
    expect(event.message, "message is the leaf message").toBe(leaf.message);
    expect(event.occurred_at, "occurred_at is the fresh wallNow (0383 freshness)").toBe(
      KNOWN_WALL_NOW,
    );
    expect(
      "query_site" in event,
      "query_site stays omitted on the boundary-built path (0383 §Pinned dispositions)",
    ).toBe(false);
  });
});

// ===========================================================================
// HALF (i) — `masked` threaded from the origin event through the boundary note
// (bug doc §Fix constraint 1; PIC-1 (f) — verbatim, never re-derived at the
// boundary). Drives the b0355 repair-terminal cascade whose surfaced failure
// originated on a follow-up whose OWN fresh budget reached max_rounds, so the
// origin event carries `masked: ["ceiling#2"]`, THROUGH the real `executeBody`
// to the production `emitTopLevelErrNote` boundary emission.
// ===========================================================================

// --- b0355 substrate (0353's real-seam harness fused with the query-tool-loop
//     scripted parent driver), reused verbatim so the origin event's masked is
//     produced by the real seam, not a mock -----------------------------------

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(maxRounds: number): QueryToolLoopConfig {
  return {
    maxRounds,
    querySite: { file: "demo.theta", line: 1, column: 1 },
    thetaSlashName: "/demo",
    invocationId: "inv-0399-origin",
    occurredAt: 0,
  };
}

const toolUse = (...ids: string[]): FreePhaseTurn => ({
  kind: "tool_use",
  batch: ids.map((toolUseId) => ({ toolName: "search", toolUseId })),
});
const textTurn = (text: string): FreePhaseTurn => ({ kind: "text", text });
const respond = (payload: unknown): ForcedRespondTurn => ({ kind: "respond", payload });

/**
 * A scripted parent driver (mirrors b0355's `ScriptedParent` /
 * query-tool-loop.test.ts's `ScriptedModel`): its ordered free-phase turns drive
 * the parent's `slotCount`, and the forced respond turn opens repair on an
 * AJV-invalid payload.
 */
class ScriptedParent implements QueryModelDriver {
  constructor(
    private readonly freeTurns: readonly FreePhaseTurn[],
    private readonly forced: ForcedRespondTurn,
  ) {}

  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    const turn = this.freeTurns[round];
    if (turn === undefined) {
      // Loud, not a silent hang: a correct loop never reads past the scripted
      // free phase.
      throw new Error(`no scripted free-phase turn for round ${round}`);
    }
    return Promise.resolve(turn);
  }

  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    return Promise.resolve([]);
  }

  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve(this.forced);
  }
}

/** Parse `.theta` source and return its body's `schema` declarations. */
function schemaDeclsOf(src: string): readonly SchemaDecl[] {
  const parseDeps = {
    systemNote: {
      pi: { sendMessage: () => Promise.resolve() },
      ui: { notify: () => {} },
      emitDiagnostic: () => {},
    },
    modelMatcher: { resolve: () => "resolved" as const },
  } as unknown as ParseThetaDocumentDeps;
  const source: ThetaSource = {
    path: "demo.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps);
  return doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
}

/** The real production AJV validator (byte-identical to the sibling suites). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: "probe",
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A `FollowUpRespondOutcome` whose own restarted free phase ran `slots` rounds
 * before its forced respond dispatch: the follow-up's OWN fresh `tool_loop`
 * budget is `slots`. With `slots == max_rounds` the follow-up's own turn
 * co-fires ceiling #2, so the origin event carries `masked: ["ceiling#2"]` per
 * 0355's corrected sourcing.
 */
function payloadFollowUpWithSlots(payload: unknown, slots: number): FollowUpRespondOutcome {
  return {
    kind: "respond_outcome",
    slotCountAtDispatch: slots,
    turn: { kind: "payload", payload },
  };
}

/**
 * Build the production `TypedQuerySchemaValidation` for `annotation` against
 * `decls`, driving at most `attempts` respond-repair follow-ups that each return
 * `follow` through the two-phase-restart payload arm.
 */
function buildValidation(
  annotation: string,
  decls: readonly SchemaDecl[],
  follow: FollowUpRespondOutcome,
  attempts: number,
  followUpMaxRounds: number,
): { readonly validation: TypedQuerySchemaValidation; readonly lowered: LoweredSchema } {
  const lowered = lowerQueryResponseSchema(annotation, decls);
  if (lowered === undefined) {
    // No silent skipping: a fixture whose annotation does not lower cannot
    // witness anything — fail loudly naming the unmet precondition.
    throw new Error(
      `precondition unmet: annotation \`${annotation}\` failed to lower (parser/lowerer drift)`,
    );
  }
  const validation = buildTypedQueryValidation({
    lowered,
    resolveShape: () => decls.find((s) => s.name === annotation),
    schemaValidator: ajv(),
    attempts,
    maxRounds: followUpMaxRounds,
    driveFollowUp: () => Promise.resolve(follow),
  });
  return { validation, lowered };
}

// The fixture schema (b0355 §Reproduction): a legal nested-array type.
const DEEP_SCHEMA = "schema Deep { a: array<array<array<array<string>>>> }";
// AJV-invalid, depth-OK opener/follow-up payloads: `a` is a scalar, not an
// array, so AJV rejects both; each is depth 2, well under the depth-5 cap, so
// the AJV repair leg (not the depth arm) is exercised.
const OPENER_INVALID = { a: 42 };
const FOLLOWUP_INVALID = { a: "still wrong" };

// --- executeBody harness (mirrors effectful-statement-host.test.ts's `harness`,
//     but resolves a TYPED query so `runTypedQueryLoop` fires) -----------------

const NOOP_SINK: ToolLoweringSink = {
  runtimeEvent(): void {},
  diagnostic(): void {},
  systemNote(): void {},
};

/** A no-op committed-conversation mutator (no rollback on the fail path). */
class NoopMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

function body(tail: Expr): ThetaBody {
  return { statements: [], tail };
}

/**
 * Assemble the REAL executor + REAL effectful host so a bare tail `@`-query
 * dispatches through `runTypedQueryLoop` with the supplied `validation`. The
 * host's `resolveQuery` returns the typed dispatch verbatim (the query AST's own
 * `schema` is irrelevant — the dispatch is what selects `runTypedQueryLoop`),
 * exactly as effectful-statement-host.test.ts's `harness` does for its untyped
 * case.
 */
function executeBodyHarness(
  model: QueryModelDriver,
  validation: TypedQuerySchemaValidation,
  cfg: QueryToolLoopConfig,
): ExecuteBodyDeps {
  const checkpoint = NOOP_CHECKPOINT;
  const signal = liveSignal();
  const hostDeps: EffectfulStatementHostDeps = {
    checkpoint,
    signal,
    sink: NOOP_SINK,
    file: "demo.theta",
    evaluatePure: () => null,
    resolveQuery: () => ({ typed: true, model, config: cfg, schemaValidation: validation }),
    resolveToolCall: () => {
      throw new Error("precondition unmet: no tool call is dispatched in this witness");
    },
    resolveInvoke: () => {
      throw new Error("precondition unmet: no invoke is dispatched in this witness");
    },
  };
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint,
    signal,
    mutator: new NoopMutator(),
    mode: "prompt" as DrivenConversationMode,
    file: "demo.theta",
  };
}

/**
 * The `originEvent` member the fix threads onto `BodyExecution` (premeasure
 * seam step 3 — `BodyExecution` gains `originEvent?: RuntimeEvent`, set from the
 * fail flow). It does not exist at HEAD, so reading it through this widened view
 * compiles now (undefined at runtime → boundary reconstructs without masked →
 * RED) and picks up the threaded value once the seam widens (→ GREEN).
 */
interface ExecutionWithOriginEvent {
  readonly originEvent?: RuntimeEvent;
}

describe("bug 0399 (i) — the repair-terminal origin event's masked reaches the boundary note verbatim (PIC-1 (f))", () => {
  it("bug 0399 (origin anchor): the typed-query loop's validation outcome carries masked ['ceiling#2'] (GREEN — 0355-corrected origin)", async () => {
    // Proves the origin HAS the mask the note must carry: a follow-up whose own
    // fresh budget reached max_rounds (2) co-fires ceiling #2 on ITS turn, while
    // the parent ran one free-phase round (slot 1 != 2). This is b0355's
    // under-fire direction — GREEN in the 0355-landed tree.
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    const built = buildValidation(
      "Deep",
      decls,
      payloadFollowUpWithSlots(FOLLOWUP_INVALID, 2),
      1,
      2,
    );
    const compiled = ajv().compile(built.lowered);
    expect(
      compiled.validate(OPENER_INVALID).ok,
      "precondition unmet: the opener `{a:42}` must FAIL AJV so repair opens",
    ).toBe(false);
    expect(
      compiled.validate(FOLLOWUP_INVALID).ok,
      "precondition unmet: the follow-up must FAIL AJV so repair exhausts",
    ).toBe(false);

    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new ScriptedParent([toolUse("a"), textTurn("done")], respond(OPENER_INVALID)),
      config(2),
      built.validation,
    );

    expect(
      outcome.kind,
      `expected a validation outcome; observed kind=${outcome.kind}`,
    ).toBe("validation");
    if (outcome.kind !== "validation") return;
    expect(
      outcome.event.masked,
      `the follow-up's own fresh budget reached max_rounds (2), co-firing ceiling #2; observed ${JSON.stringify(outcome.event)}`,
    ).toEqual(["ceiling#2"]);
  });

  it("bug 0399 (note end-to-end): the SLSH-4 boundary note's details.event.masked deep-equals ['ceiling#2']", async () => {
    // Drive the SAME cascade through the REAL executeBody, then make the exact
    // boundary emission theta-composition-producer.ts:571 makes. RED today:
    // effectful-statement-host.ts:283 drops `outcome.event`, so no origin event
    // reaches the boundary (`execution.originEvent` is undefined) and
    // emitTopLevelErrNote reconstructs a fresh event WITHOUT masked (PIC-1 (f)
    // forbids re-deriving it at the boundary). GREEN post-fix: the origin event
    // is threaded onto BodyExecution.originEvent and passed verbatim as the 3rd
    // arg, carrying 0355's masked.
    const decls = schemaDeclsOf(DEEP_SCHEMA);
    const built = buildValidation(
      "Deep",
      decls,
      payloadFollowUpWithSlots(FOLLOWUP_INVALID, 2),
      1,
      2,
    );

    const execution = await executeBody(
      body(queryExpr("summarise the deep value")),
      executeBodyHarness(
        new ScriptedParent([toolUse("a"), textTurn("done")], respond(OPENER_INVALID)),
        built.validation,
        config(2),
      ),
    );

    // The bare tail typed query surfaces its unhandled validation Err as the
    // body's fail terminal (statement-executor.ts:1182 — `{ flow: "fail", error
    // }`), carrying the real ValidationError leaf.
    expect(
      execution.outcome,
      `expected a fail terminal from the unhandled validation Err; observed ${execution.outcome}`,
    ).toBe("fail");
    expect(
      execution.error,
      "the fail terminal carries the ValidationError leaf",
    ).toBeDefined();

    // The production boundary emission: exactly the call
    // theta-composition-producer.ts:571 makes, but passing the threaded origin
    // event as the 3rd arg (the fix's boundary widening — undefined at HEAD).
    const { deps, notes } = producerWithCapture();
    const originEvent = (execution as unknown as ExecutionWithOriginEvent).originEvent;
    deps.emitTopLevelErrNote("demo", execution.error as unknown as QueryError, originEvent);

    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes, "exactly one SLSH-4 note is emitted").toHaveLength(1);
    const event = eventArm(channelNotes[0]!.details);

    // THE RED ASSERTION (bug doc §Fix constraint 4; PIC-1 (d)/(f)). Today
    // `event.masked` is undefined (absent-field signature) because the origin
    // event was dropped at effectful-statement-host and the boundary rebuilt a
    // masked-less event. GREEN post-fix: the threaded origin event's
    // `["ceiling#2"]`, verbatim.
    expect(
      event.masked,
      `PIC-1 (f): the boundary note carries the origin event's masked verbatim; observed ${JSON.stringify(event)}`,
    ).toEqual(["ceiling#2"]);
  });
});
