# `V13c-T` — Query tool loop and typed two-phase (tests)

**Spec.** [`../spec_topics/query/query-tool-loop.md`](../spec_topics/query/query-tool-loop.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** Failing tests for the paired `V13c` implementation leaf.

**Tests.**
- `CIO-4` (query-tool-loop.md — free phase): the free phase advances rounds; a parallel batch counts as one slot; the forced-respond turn is exempt from the round count (CIO-4 final branch).
- `QRY-14` ([query-tool-loop.md — `max_rounds:0` boundary](../spec_topics/query/query-tool-loop.md#qry-14)): `max_rounds:0` (typed) takes the forced-respond branch at the start.
- `QRY-16` ([query-tool-loop.md — exhaustion](../spec_topics/query/query-tool-loop.md#qry-16)), untyped exhaustion: ceiling #2 surfaces as `Err(QueryError { kind: "tool_loop_exhausted" })` (`ToolLoopExhaustedError`), with no `masked` field (omitted, never `[]`).
- `QRY-16` ([query-tool-loop.md — Worked example: depth-6 forced respond at `max_rounds`](../spec_topics/query/query-tool-loop.md#qry-16)), typed depth-6 co-fire vector: ceiling #4 surfaces on the typed-query response in loom code as `Err(QueryError { kind: "validation", cause: "schema_validation" })` (`schema_keyword: "maxDepth"`); separately, the co-satisfied-but-masked ceiling #2 is enumerated on the operator-facing `RuntimeEvent`, never on the `QueryError` — its `masked` field at the wire location `details.event.masked` carries `["ceiling#2"]` (`CIO-4`/`CIO-6`). The surfaced ceiling is the observable `validation`/`maxDepth` `Err`, not a literal `surfaced:` wire key (the full `RuntimeEvent` payload shape is owned by [`runtime-event-channel.md` PIC-1](../spec_topics/pi-integration-contract/runtime-event-channel.md#pic-1), exercised by `V9d`'s `RuntimeEvent`-conformance test).

- Checkpoint before `@`-query dispatch ([cancellation.md — *Granularity*](../spec_topics/cancellation.md), [`coverage-matrix.md`](./coverage-matrix.md) code-keyed-area token `cka-47`, `V13c` facet — the `@`-query-dispatch checkpoint site distributed off [`V17c`](./V17c-checkpoint-granularity.md); testability hook: the [`V8a`](./V8a-checkpoint-validator-seams.md) `Checkpoint` seam, [`host-interfaces-services.md#checkpoint-seam`](../spec_topics/pi-integration-contract/host-interfaces-services.md#checkpoint-seam)): drive the seam to assert a cancellation checkpoint fires immediately before each `@`-query dispatch on the live `V13c` query-tool-loop surface.

- `ERR-13` (delegated live-carrier witness for `V4f`'s completed-callee-finality deferral): a query-tool-loop callee driven to completion on the live `V13c` surface, then a downstream `?`/panic/cancel fired, leaves the completed callee's side effect in place with no compensating turn injected. These live surfaces are loom-runtime-internal, so this witness is `npm test`-assertable (no real-host-only smoke gate).

**Deps.** `V13b`, `V9c`, `V16a`, `V5e`, `V8a`, `V8c`, `V4f`, `H4b`

**Ships when.** The tests above exist, compile, and fail red for the intended reason.
