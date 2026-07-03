// V13c / V13c-T — the query tool loop and typed two-phase respond surface.
//
// This module owns the interpreter-side seam the paired `V13c` implementation
// leaf fills in for a `@`-query's model tool-call loop
// (query/query-tool-loop.md; hard-ceilings/ceilings-3-and-4.md):
//
//   - CIO-4 free-phase slot accounting: the free phase advances one tool-call
//     *round* per model turn that emits `tool_use` blocks; a parallel batch
//     counts as a single slot (a model emitting three parallel tool calls in
//     one round consumes one slot). The forced-respond turn that terminates a
//     typed query is the exempt-routed terminator CIO-4's `max_rounds`-final
//     branch dispatches — it is NOT counted against `max_rounds`.
//   - QRY-14 typed two-phase loop: a free phase (any frontmatter tool, serviced
//     and looped) followed by the forced respond turn that forces the provider
//     to the synthesised `__loom_respond_<slug>` tool. The `max_rounds: 0`
//     boundary takes the `max_rounds`-final branch at typed-query start
//     (`slot_count == max_rounds` holds at initialisation, 0 == 0): no
//     free-phase provider call is issued and the forced respond turn is the only
//     turn.
//   - QRY-16 untyped exhaustion: when the cap is reached without an untyped
//     query's model producing a terminating plain-text turn, the runtime returns
//     `Err(QueryError { kind: "tool_loop_exhausted", ... })` (`ToolLoopExhaustedError`),
//     with no `masked` field (omitted, never `[]`).
//   - QRY-16 typed depth-6 co-fire: a depth-6 typed-query response trips the
//     loom-owned depth walk (`V5e`) *before* AJV (CIO-3) and ceiling #4 surfaces
//     in loom code as `Err(QueryError { kind: "validation", cause:
//     "schema_validation" })` (`schema_keyword: "maxDepth"`); the co-satisfied
//     ceiling #2 is enumerated on the operator-facing `RuntimeEvent` at
//     `details.event.masked` as `["ceiling#2"]` (CIO-4/CIO-6), never on the
//     `QueryError`.
//   - cka-47 `V13c` facet: a cancellation checkpoint fires immediately before
//     each `@`-query dispatch, observable through the `V8a` `Checkpoint` seam.
//   - ERR-13 completed-callee-finality (delegated live-carrier witness for
//     `V4f`): a query-tool-loop callee driven to completion stays final after a
//     downstream `?`/panic/cancel — its committed side effect persists with no
//     compensating turn injected.
//
// At its ceiling-#2 first-enforcement point (the round boundary) this leaf
// consults `V16a`'s cross-ceiling arbitration seam for the cross-ceiling
// surfacing precedence and the `masked` enumeration, and the `V9d` `computeMasked`
// V1-reachable predicate that populates `details.event.masked`.
//
// V13c (this implementation leaf) drives both surfaces: `runUntypedQueryLoop`
// fires the pre-dispatch `query` cancellation checkpoint, advances the free
// phase one slot per `tool_use` round, returns `text` on a terminating turn and
// `tool_loop_exhausted` (masked omitted) at the `max_rounds`-final branch;
// `runTypedQueryLoop` runs the same free phase, dispatches the exempt forced
// respond turn, depth-walks the payload before AJV (CIO-3) and surfaces the
// `validation`/`maxDepth` `Err` with `["ceiling#2"]` on the operator-facing
// `RuntimeEvent`'s `masked` at the depth-6 co-fire. The paired V13c-T tests-task
// declared this surface and its inert stubs.
//
// Spec: query/query-tool-loop.md (QRY-13 … QRY-16, CIO-4 free-phase accounting),
// hard-ceilings/ceilings-3-and-4.md (CIO-3/CIO-4/CIO-6, ceiling #4 depth,
// `masked` field), cancellation.md §Granularity (cka-47 `@`-query-dispatch
// checkpoint site), errors-and-results/error-model.md (ERR-13 no-rollback).

import type { Checkpoint, CheckpointSite } from "../seams/checkpoint";
import type { CommittedSideEffect } from "./no-rollback";
import type { RuntimeEvent } from "./runtime-event-channel";
import { computeMasked } from "./runtime-event-channel";
import {
  makeToolLoopExhaustedError,
  type QueryError,
  type ToolLoopExhaustedError,
  type ValidationError,
  type ValidationIssue,
} from "./query-error";
import { DEPTH_VIOLATION_MESSAGE, depthWalk } from "./depth-walk";
import type { LoweredSchema } from "../seams/schema-validator";
import type { RespondRepairOutcome, ValidationFailure } from "./query-respond-repair";

// ---------------------------------------------------------------------------
// The model turns the loop drives.
// ---------------------------------------------------------------------------

/** A single model-emitted `tool_use` block within a free-phase round's batch. */
export interface ToolCallRequest {
  readonly toolName: string;
  readonly toolUseId: string;
}

/**
 * One free-phase model turn: either a `tool_use` round carrying a (possibly
 * parallel) batch of tool calls, or a terminating plain-text turn (provider stop
 * reason `end_turn` / `stop`) that ends the free phase.
 */
export type FreePhaseTurn =
  | { readonly kind: "tool_use"; readonly batch: readonly ToolCallRequest[] }
  | { readonly kind: "text"; readonly text: string };

/**
 * The forced respond turn a typed query issues after the free phase: the model
 * invokes the synthesised `__loom_respond_<slug>` tool with `payload` (the
 * candidate structured value the respond tool's `execute` depth-walks and
 * AJV-validates against the lowered response schema).
 */
export interface ForcedRespondTurn {
  readonly kind: "respond";
  readonly payload: unknown;
}

// ---------------------------------------------------------------------------
// The injected model driver — the deterministic scripted surface a test drives.
// ---------------------------------------------------------------------------

/**
 * The model-facing surface the query tool loop drives. Held by dependency
 * injection so a test scripts the transcript deterministically and the live
 * loop consults the same shape.
 */
export interface QueryModelDriver {
  /** The next free-phase model turn for the 0-based free-phase `round`. */
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn>;
  /**
   * Execute one round's parallel `tool_use` batch and feed every sibling's
   * result back (successful and failing alike). Returns the side effects the
   * batch committed, so a completed callee's finality (ERR-13) is observable.
   */
  runToolBatch(
    batch: readonly ToolCallRequest[],
    round: number,
  ): Promise<readonly CommittedSideEffect[]>;
  /** The forced respond turn (typed queries) — the model's structured payload. */
  forcedRespondTurn(): Promise<ForcedRespondTurn>;
}

/** The per-query configuration the loop reads. */
export interface QueryToolLoopConfig {
  /** The configured `tool_loop.max_rounds` for this query. */
  readonly maxRounds: number;
  /** The `@`-query source site the cancellation checkpoint carries. */
  readonly querySite: CheckpointSite;
  /** Slash name of the owning loom (for the operator-facing `RuntimeEvent`). */
  readonly loomSlashName: string;
  /** Per-invocation UUID (for the operator-facing `RuntimeEvent`). */
  readonly invocationId: string;
  /** The wall-clock epoch-ms the surfacing `RuntimeEvent` is stamped with. */
  readonly occurredAt: number;
}

// ---------------------------------------------------------------------------
// The observable outcomes.
// ---------------------------------------------------------------------------

/** One free-phase round's slot-accounting record (CIO-4). */
export interface FreePhaseRoundLog {
  /** 0-based free-phase round index. */
  readonly round: number;
  /** Number of parallel tool calls in this round's batch. */
  readonly batchSize: number;
  /** Slot count after CIO-4's per-round increment (a parallel batch = 1 slot). */
  readonly slotCountAfter: number;
}

/**
 * The forced respond turn's dispatch record. `countedAgainstMaxRounds` is the
 * CIO-4 exemption witness — the forced respond turn is the exempt-routed
 * terminator and MUST NOT count against `max_rounds` (always `false` when
 * compliant).
 */
export interface ForcedRespondDispatch {
  readonly dispatched: boolean;
  readonly countedAgainstMaxRounds: boolean;
  /** The slot count at the moment the forced respond turn was dispatched. */
  readonly slotCountAtDispatch: number;
}

/** The outcome of an untyped `@`-query tool loop. */
export type UntypedQueryOutcome =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly rounds: readonly FreePhaseRoundLog[];
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      readonly kind: "tool_loop_exhausted";
      readonly error: ToolLoopExhaustedError;
      readonly rounds: readonly FreePhaseRoundLog[];
      readonly committed: readonly CommittedSideEffect[];
    }
  | { readonly kind: "cancelled"; readonly committed: readonly CommittedSideEffect[] };

/** The outcome of a typed `@<T>`-query two-phase tool loop. */
export type TypedQueryOutcome =
  | {
      readonly kind: "value";
      readonly value: unknown;
      readonly rounds: readonly FreePhaseRoundLog[];
      readonly forcedRespond: ForcedRespondDispatch;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      readonly kind: "validation";
      readonly error: ValidationError;
      /** The operator-facing `RuntimeEvent`; carries `masked` per PIC-1. */
      readonly event: RuntimeEvent;
      readonly rounds: readonly FreePhaseRoundLog[];
      readonly forcedRespond: ForcedRespondDispatch;
      readonly committed: readonly CommittedSideEffect[];
    }
  | {
      readonly kind: "propagated";
      /** A proximate non-validation `QueryError` respond-repair surfaced (QRY-11). */
      readonly error: QueryError;
      readonly rounds: readonly FreePhaseRoundLog[];
      readonly forcedRespond: ForcedRespondDispatch;
      readonly committed: readonly CommittedSideEffect[];
    }
  | { readonly kind: "cancelled"; readonly committed: readonly CommittedSideEffect[] };

// ---------------------------------------------------------------------------
// V13e-T — the typed-query schema-validation integration seam (QRY-22).
//
// This seam is the collaborator the runtime execution path (`runTypedQueryLoop`
// / `runQueryEffect`) MUST orchestrate for a typed query so a query's declared
// schema — a named `schema` decl (resolved via `resolveSchema`) or an inline
// object/type annotation — is resolved, lowered to the validating JSON Schema
// (`V5d`/`SUBS-1`), conveyed to the model on the forced-respond turn (the
// conveyance carries the *lowered shape*, not the bare type name), and the
// response validated against it with respond-repair (`QRY-11`) on
// non-conformance. It bundles the four steps QRY-22 pins as separately
// observable invocations: schema resolution → lowering → `AjvSchemaValidator`
// → `runRespondRepairLoop`.
//
// V13e-T declares this seam and adds it as an OPTIONAL, ignored parameter to
// `runTypedQueryLoop` (the paired `V13e` implementation wires the loop to
// orchestrate it). The `V13c` loop body added no orchestration, so a test that
// injects this seam and drives the loop reds: none of the seam's steps are
// invoked and a non-conforming response is bound as the query value instead of
// routing through respond-repair.
//
// Spec: query/query-failure-and-repair.md (QRY-22 typed-query schema-validation
// integration; QRY-11 respond-repair), schema-subset.md (SUBS-1 lowering),
// errors-and-results/queryerror-variants.md (ValidationError shape).
// ---------------------------------------------------------------------------

/**
 * The result of validating a candidate response payload against the lowered
 * declared schema via the `AjvSchemaValidator`. On non-conformance it carries
 * the ordered `ValidationIssue` entries and the malformed response text so the
 * caller can open the `QRY-11` respond-repair loop with the opening failure.
 */
export type TypedQueryValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
      readonly raw_response: string | null;
    };

/**
 * The typed-query schema-validation collaborators the execution path
 * orchestrates for a typed `@`-query (QRY-22). Held by dependency injection so
 * the live path threads the real resolution / lowering / `AjvSchemaValidator` /
 * `runRespondRepairLoop`, and a test injects spies over those same real pieces
 * and asserts the path invokes them (rather than exercising the isolated
 * `V5d` / `V13c` / `V13d` units).
 */
export interface TypedQuerySchemaValidation {
  /**
   * Resolve the typed query's declared schema annotation to its declared shape:
   * a named `schema` decl (resolved via `resolveSchema`) or an inline
   * object/type annotation.
   */
  resolveDeclaredSchema(): unknown;
  /** Lower a resolved declared shape to the validating JSON Schema (`SUBS-1`). */
  lower(shape: unknown): LoweredSchema;
  /**
   * Convey the lowered shape to the model on the forced-respond turn — the
   * forced-respond tool / structured-output instruction carries the lowered
   * shape, NOT merely the schema's bare type name.
   */
  convey(lowered: LoweredSchema): void;
  /**
   * Compile and validate a candidate response payload against the lowered
   * declared schema via the `AjvSchemaValidator`.
   */
  validate(lowered: LoweredSchema, payload: unknown): TypedQueryValidationResult;
  /**
   * Route a non-conforming response through the `QRY-11` respond-repair loop
   * (`runRespondRepairLoop`), returning its outcome.
   */
  runRespondRepair(initial: ValidationFailure): Promise<RespondRepairOutcome>;
}

// ---------------------------------------------------------------------------
// The two drivers (V13c-T stubs; the paired V13c fills them in).
// ---------------------------------------------------------------------------

/**
 * Run an untyped `@`-query's model tool-call loop under the `tool_loop.max_rounds`
 * cap (QRY-13, QRY-16, CIO-4). A cancellation checkpoint fires immediately
 * before the `@`-query dispatch (cka-47 `V13c` facet); the free phase advances
 * one slot per `tool_use` round (a parallel batch counts as one slot); on a
 * terminating plain-text turn the loop returns `text`; on reaching `max_rounds`
 * without a terminating turn it returns the `tool_loop_exhausted` outcome, its
 * `masked` field omitted (never `[]`).
 *
 * V13c-T stubs this inert: it fires no checkpoint, runs no tool-call round, and
 * returns an inert terminating text outcome with no committed side effects — so
 * the exhaustion, checkpoint, and ERR-13 assertions red on their own primary
 * expectation. The paired V13c leaf implements the loop.
 */
export async function runUntypedQueryLoop(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  model: QueryModelDriver,
  config: QueryToolLoopConfig,
): Promise<UntypedQueryOutcome> {
  // cka-47 `V13c` facet: a cancellation checkpoint fires immediately before the
  // `@`-query dispatch, carrying the query site. An abort observed here skips
  // the dispatch entirely (no free-phase provider call).
  await checkpoint.before("query", config.querySite);
  if (signal.aborted) {
    return { kind: "cancelled", committed: [] };
  }

  const rounds: FreePhaseRoundLog[] = [];
  const committed: CommittedSideEffect[] = [];
  let slotCount = 0;
  let round = 0;
  let lastToolName: string | null = null;

  for (;;) {
    // CIO-4 round boundary: cancellation preempts the loop at any round
    // boundary (query-tool-loop.md#qry-16 / cancellation.md).
    if (signal.aborted) {
      return { kind: "cancelled", committed };
    }
    // CIO-4 `max_rounds`-final branch for an untyped query: once the slot count
    // reaches `max_rounds` without a terminating plain-text turn, the runtime
    // surfaces `Err(QueryError { kind: "tool_loop_exhausted" })` before any
    // further turn is issued. `slot_count == max_rounds` at initialisation
    // (0 == 0) exhausts a `max_rounds: 0` untyped query at once.
    if (slotCount === config.maxRounds) {
      const error = makeToolLoopExhaustedError({
        message: `Tool-call loop exhausted after ${config.maxRounds} round(s) without a terminating response`,
        maxRounds: config.maxRounds,
        last_tool_name: lastToolName,
        raw_response: null,
      });
      return { kind: "tool_loop_exhausted", error, rounds, committed };
    }

    const turn = await model.nextFreePhaseTurn(round);
    if (turn.kind === "text") {
      // Terminating plain-text turn: this is the untyped query's final response.
      return { kind: "text", text: turn.text, rounds, committed };
    }

    // A `tool_use` round: execute the (possibly parallel) batch, feed every
    // sibling result back, and count the whole batch as exactly one slot
    // (CIO-4 — a parallel batch of N tool calls consumes one slot).
    const effects = await model.runToolBatch(turn.batch, round);
    committed.push(...effects);
    if (turn.batch.length > 0) {
      lastToolName = turn.batch[turn.batch.length - 1]!.toolName;
    }
    slotCount += 1;
    rounds.push({ round, batchSize: turn.batch.length, slotCountAfter: slotCount });
    round += 1;
  }
}

/**
 * Run a typed `@<T>`-query's two-phase loop (QRY-14, QRY-16, CIO-4). The free
 * phase advances exactly as for an untyped query; once the model emits a
 * terminating plain-text turn — or the `max_rounds`-final branch fires
 * (including the `max_rounds: 0` boundary at typed-query start) — the runtime
 * dispatches the forced respond turn as the exempt-routed terminator (not
 * counted against `max_rounds`). The respond payload is depth-walked (`V5e`)
 * before AJV (CIO-3): a depth-6 payload surfaces as `Err(ValidationError {
 * cause: "schema_validation", schema_keyword: "maxDepth" })` and enumerates the
 * co-satisfied ceiling #2 on the operator-facing `RuntimeEvent`'s
 * `details.event.masked` (`["ceiling#2"]`), consulting `V16a`/`V9d`.
 *
 * V13c-T stubs this inert: it fires no checkpoint, dispatches no forced respond
 * turn, and returns an inert `value` outcome with `forcedRespond` unset — so the
 * CIO-4 slot-accounting, `max_rounds: 0`, and depth-6 co-fire assertions red on
 * their own primary expectation. The paired V13c leaf implements the loop.
 */
export async function runTypedQueryLoop(
  checkpoint: Checkpoint,
  signal: AbortSignal,
  model: QueryModelDriver,
  config: QueryToolLoopConfig,
  // V13e seam (QRY-22): the schema-validation integration collaborators the
  // execution path orchestrates for a typed query. When present the loop
  // resolves → lowers → conveys the declared schema before the forced-respond
  // turn, validates the response against the lowered shape, and routes a
  // non-conforming response through respond-repair. Optional so a query with no
  // declared schema (or the isolated `V13c` slot-accounting tests) drives the
  // bare loop.
  schemaValidation?: TypedQuerySchemaValidation,
): Promise<TypedQueryOutcome> {
  // cka-47 `V13c` facet: the cancellation checkpoint fires immediately before
  // the `@`-query dispatch, exactly as for an untyped query.
  await checkpoint.before("query", config.querySite);
  if (signal.aborted) {
    return { kind: "cancelled", committed: [] };
  }

  const rounds: FreePhaseRoundLog[] = [];
  const committed: CommittedSideEffect[] = [];
  let slotCount = 0;
  let round = 0;

  // Free phase: advance one slot per `tool_use` round exactly as for an untyped
  // query, until the model emits a terminating plain-text turn OR CIO-4's
  // `max_rounds`-final branch fires. At `max_rounds: 0` the branch fires at
  // typed-query start (`slot_count == max_rounds`, 0 == 0) so no free-phase
  // provider call is issued.
  for (;;) {
    if (signal.aborted) {
      return { kind: "cancelled", committed };
    }
    if (slotCount === config.maxRounds) {
      break;
    }
    const turn = await model.nextFreePhaseTurn(round);
    if (turn.kind === "text") {
      break;
    }
    const effects = await model.runToolBatch(turn.batch, round);
    committed.push(...effects);
    slotCount += 1;
    rounds.push({ round, batchSize: turn.batch.length, slotCountAfter: slotCount });
    round += 1;
  }

  // V13e (QRY-22): resolve the typed query's declared schema — a named `schema`
  // decl (via `resolveSchema`, previously uncalled) or an inline object/type
  // annotation — lower it to the validating JSON Schema (`V5d`/`SUBS-1`), and
  // convey the LOWERED shape on the forced-respond turn (the conveyance carries
  // the lowered shape, not the bare type name). Done before the forced respond
  // turn is dispatched so the model sees the lowered shape.
  let lowered: LoweredSchema | undefined;
  if (schemaValidation !== undefined) {
    const shape = schemaValidation.resolveDeclaredSchema();
    lowered = schemaValidation.lower(shape);
    schemaValidation.convey(lowered);
  }

  // Forced respond turn — the exempt-routed terminator CIO-4's `max_rounds`-final
  // branch dispatches. It is NOT counted against `max_rounds` and CIO-4 is not
  // re-evaluated against it.
  const slotCountAtDispatch = slotCount;
  const forced = await model.forcedRespondTurn();
  const forcedRespond: ForcedRespondDispatch = {
    dispatched: true,
    countedAgainstMaxRounds: false,
    slotCountAtDispatch,
  };

  // CIO-3: the loom-owned depth walk (`V5e`) runs at the typed-query response
  // AJV boundary *before* AJV. A depth-6 payload trips ceiling #4 and surfaces
  // in loom code as `Err(QueryError { kind: "validation", cause:
  // "schema_validation" })` with `schema_keyword: "maxDepth"`.
  const walk = depthWalk(forced.payload);
  if (!walk.ok) {
    const error: ValidationError = {
      kind: "validation",
      cause: walk.cause,
      message: DEPTH_VIOLATION_MESSAGE,
      attempts: 0,
      validation_errors: [walk.issue],
      raw_response: JSON.stringify(forced.payload),
    };
    // CIO-4/CIO-6: the co-satisfied ceiling #2 is enumerated on the
    // operator-facing `RuntimeEvent`'s `masked` (wire location
    // `details.event.masked`) via `V9d`'s V1-reachable predicate — never on the
    // `QueryError` itself. `computeMasked` omits `masked` (returns `undefined`,
    // never `[]`) on every other surface.
    const masked = computeMasked({
      kind: "validation",
      validationCause: walk.cause,
      atTypedQueryResponse: true,
      turnKind: "forced_respond",
      toolLoopSlotCount: slotCountAtDispatch,
      maxRounds: config.maxRounds,
    });
    const event: RuntimeEvent = {
      kind: "validation",
      loom: config.loomSlashName,
      invocation_id: config.invocationId,
      query_site: {
        file: config.querySite.file,
        line: config.querySite.line,
        column: config.querySite.column,
      },
      message: DEPTH_VIOLATION_MESSAGE,
      attempts: 0,
      occurred_at: config.occurredAt,
      ...(masked !== undefined ? { masked } : {}),
    };
    return { kind: "validation", error, event, rounds, forcedRespond, committed };
  }

  // V13e (QRY-22): validate the response against the lowered declared schema via
  // the `AjvSchemaValidator`. A conforming response binds as the typed query's
  // value; a non-conforming response routes through the `QRY-11` respond-repair
  // loop (`runRespondRepairLoop`), and terminal non-conformance surfaces
  // `Err(QueryError { kind: "validation", cause: "schema_validation" })`.
  if (schemaValidation !== undefined && lowered !== undefined) {
    const result = schemaValidation.validate(lowered, forced.payload);
    if (!result.ok) {
      const failure: ValidationFailure = {
        kind: "schema_validation",
        issues: result.issues,
        raw_response: result.raw_response,
      };
      const repair = await schemaValidation.runRespondRepair(failure);
      switch (repair.kind) {
        case "value":
          // A respond-repair follow-up re-validated successfully: its corrected
          // value is the typed query's final result.
          return { kind: "value", value: repair.value, rounds, forcedRespond, committed };
        case "validation": {
          // Terminal non-conformance: surface the schema_validation
          // `ValidationError` on the operator-facing `RuntimeEvent`, enumerating
          // any co-satisfied ceiling #2 via `V9d`'s V1-reachable predicate.
          const event = buildValidationEvent(config, repair.error, slotCountAtDispatch);
          return { kind: "validation", error: repair.error, event, rounds, forcedRespond, committed };
        }
        case "propagated":
          // A proximate non-validation failure won respond-repair (QRY-11): the
          // proximate cause propagates as the query's `Err`.
          return { kind: "propagated", error: repair.error, rounds, forcedRespond, committed };
      }
    }
  }

  // The respond tool's validated value is the typed query's final result.
  return {
    kind: "value",
    value: forced.payload,
    rounds,
    forcedRespond,
    committed,
  };
}

/**
 * Build the operator-facing `RuntimeEvent` for a typed-query schema-validation
 * failure surfaced through respond-repair (QRY-22). `masked` is populated only
 * at the ceiling #2 co-fire per `V9d`'s V1-reachable predicate (unreachable for
 * a `max_rounds: 0` query); every other surface omits it (never `[]`).
 */
function buildValidationEvent(
  config: QueryToolLoopConfig,
  error: ValidationError,
  slotCountAtDispatch: number,
): RuntimeEvent {
  const masked = computeMasked({
    kind: "validation",
    validationCause: error.cause,
    atTypedQueryResponse: true,
    turnKind: "forced_respond",
    toolLoopSlotCount: slotCountAtDispatch,
    maxRounds: config.maxRounds,
  });
  return {
    kind: "validation",
    loom: config.loomSlashName,
    invocation_id: config.invocationId,
    query_site: {
      file: config.querySite.file,
      line: config.querySite.line,
      column: config.querySite.column,
    },
    message: error.message,
    attempts: error.attempts,
    occurred_at: config.occurredAt,
    ...(masked !== undefined ? { masked } : {}),
  };
}
