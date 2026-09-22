// RFC 0015 (docs/rfcs/0015-theta-run-card.md §"The trace seam") — the optional
// statement-trace seam. A SIBLING of the `Checkpoint` seam, never a change to
// it: checkpoints exist for cancellation semantics and fire only at the five
// effect kinds, so riding them alone would leave pure computation lines
// permanently dark on the run card. The trace seam is purely for
// observability — it gates nothing, reads no signal, and is absent
// (`undefined`) in the print/json/child compositions, where its cost is one
// undefined-check per publication site.
//
// The executor publishes TWO families through this one seam, both keyed by
// the panic-site residence rule (`panicSiteFile`: `env.currentResidence()` —
// a `.thetalib` fn body names its DECLARING file — else the on-disk
// `deps.sourcePath`, else the slash-name `deps.file`):
//
//   1. `"stmt"` — at EVERY statement dispatch, with the statement's own
//      source site (head line/column).
//   2. A `CheckpointKind` — at every effect dispatch, published ADJACENT TO
//      (immediately before) that effect's `Checkpoint.before`, with the
//      checkpoint site's line/column but the RESIDENCE-RULE file, not the
//      checkpoint site's own `file` (`checkpointFor` builds sites from
//      `baseDeps.file` — the slash name; production wires
//      `file: theta.slashName` — so a `.thetalib` fn's effect sites carry
//      the caller's name). The trace call sits BESIDE the checkpoint seam,
//      never inside it: cancellation flow (`runCancellableSequence`,
//      `loopIterCheckpoint`) is untouched, and the publication fires at
//      dispatch — before the pre-dispatch signal read — so a
//      cancelled-before-commit effect still shows its line as reached.
//
// D7 span semantics (docs/rfcs/0015-theta-run-card.md, operator ruling
// 2026-09-22 generalised): an EFFECT-kind publication is a SPAN, not an
// instant. The `Trace` call at effect dispatch returns an optional SETTLE
// callback; the executor holds it across the awaited effect and calls it in a
// `finally` when the effect completes — on EVERY completion path: a clean
// value, an `Err`-shaped outcome, a cancellation observed at the checkpoint,
// and a throw unwinding out of the await (settle-then-propagate). The settle
// is therefore the bus-visible witness that the effect's line stopped being
// in-flight, replacing D2's "next `\"stmt\"` publication" heuristic — which a
// `par for` sibling lane could fire while another lane was still blocked
// (the D2 recorded single-clamp-slot residual). Pairing is STRUCTURAL: the
// closure returned at dispatch names exactly its own publication, so
// concurrent lanes running the same source line hold independent settles and
// no lane identity, id minting, or bus-side site matching exists.
//
// Which kinds are spans is a closed split (`isSpanTraceKind`):
//   - SPAN kinds: `query`, `tool-call`, `invoke`, `binder-call` — each names
//     one awaited effect the executor can bracket dispatch→settle.
//   - INSTANT kinds: `"stmt"` and `"loop-iter"` — a statement dispatch and a
//     per-iteration loop boundary mark a crossing, not a blocking wait; the
//     executor DISCARDS any settle a defective implementation returns for
//     them, and a conforming implementation returns `undefined`.
// A settle callback is one-shot from the executor's side (called exactly
// once, in the `finally`); implementations MUST tolerate a late call after
// their own forced close (e.g. the bus's invocation-end close) by making it
// idempotent. A THROWING settle is a defective seam implementation exactly
// like a throwing trace: the executor contains nothing, and because the call
// sits in a `finally` the throw joins/replaces the unwinding error at the
// nearest boundary.
//
// D1→D2 contract (no bus-side join): family 2 exists precisely so D2's heat
// ring never has to join `checkpointBefore` ingest against trace entries.
// Such a join is unsound: between a statement's `"stmt"` trace (dispatch)
// and its effect's `checkpoint.before` sits an await
// (`preEvaluateToolArgs`) that deliberately dispatches nested effects, and
// under `par for` another lane can interleave in that window; a line-only
// recency join then silently attributes the effect kind to whatever entry
// another lane traced last at that line — and cross-FILE same-line
// collisions (a `.thetalib` fn body tracing line N in one lane while
// another lane traces caller-file line N) cannot be disambiguated at all,
// because the checkpoint site's `file` is the slash name, not a heat key.
// The trace stream is therefore SELF-SUFFICIENT: every publication carries
// the residence-keyed `(file, line, kind)` the ring upserts directly, and
// `checkpointBefore` ingest enriches nothing.
//
// `loop-iter` geometry: `loopIterSite` stamps the LOOP STATEMENT'S own head
// line, and statement dispatch trace-establishes exactly that line, so the
// per-iteration `"loop-iter"` publications land on the same `(file, line)`
// key as the loop's `"stmt"` — one publication per iteration, per the RFC's
// enrichment-kinds list.
//
// Contract: a `Trace` implementation MUST NOT throw. The executor calls it
// bare (no containment — CLAUDE.md forbids broad catches in the drive path);
// a throwing trace is a defective seam implementation and its throw
// PROPAGATES TO THE NEAREST BOUNDARY exactly like any other executor throw —
// the same semantics as a throwing checkpoint. Concretely: a `par for` lane
// boundary downgrades it to that element's `Err(invoke_infra,
// cause:"internal_error")` (par-for-executor.ts, ERR-20); a `subagent fn`
// boundary downgrades it to the caller's `Err(InvokeInfraError)`
// (subagent-fn-call.ts, FN-6); only outside any such boundary does it abort
// the whole drive. Composition-side containment, where wanted, belongs in the
// telemetry wrapper that binds the seam to the execution-status bus (the
// EXST-9 posture `TelemetryCheckpoint` already models), not in the executor.
//
// Recorded D1 limitation (pure `fn` bodies): statements inside a pure `fn`
// body evaluate through `evaluatePureBlock` / `evaluatePureStatement`
// (src/runtime/pure-expression-evaluator.ts), which run without
// `ExecuteBodyDeps` and therefore without this seam — a multi-line pure fn
// body stays dark on the card, and the ENCLOSING statement traces once at
// its own call line. Accepted for D1; D5's card explains per-line heat with
// this gap rather than papering over it. Wiring trace into the pure
// evaluator is explicitly out of scope.

import type { CheckpointKind, CheckpointSite } from "./checkpoint";

/**
 * The trace publication kind: `"stmt"` at statement dispatch, or the effect's
 * `CheckpointKind` at effect dispatch (published by the EXECUTOR beside the
 * effect's `Checkpoint.before` — see the header: no bus-side join exists, so
 * `checkpointBefore` ingest never enriches heat).
 */
export type TraceKind = "stmt" | CheckpointKind;

/**
 * RFC 0015 (D7) — the settle half of an effect-span publication: called by
 * the EXECUTOR exactly once, in a `finally` around the awaited effect, on
 * every completion path (value / `Err` / cancel / throw). See the header's
 * §"D7 span semantics" for the full contract (idempotence under a forced
 * close, throwing-settle propagation).
 */
export type TraceSettle = () => void;

/**
 * Whether a publication kind opens a SPAN (dispatch→settle brackets one
 * awaited effect) rather than marking an instant. Closed split — see the
 * header's §"D7 span semantics" for why `"stmt"`/`"loop-iter"` are instants.
 */
export function isSpanTraceKind(kind: TraceKind): boolean {
  return kind !== "stmt" && kind !== "loop-iter";
}

/**
 * The optional executor trace hook: `deps.trace?.(residenceKeyedSite, kind)`.
 * Returns the span's settle callback for span kinds (D7), `undefined` for
 * instant kinds (`"stmt"`, `"loop-iter"`).
 */
export type Trace = (site: CheckpointSite, kind: TraceKind) => TraceSettle | undefined;
