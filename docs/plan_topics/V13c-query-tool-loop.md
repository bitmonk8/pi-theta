# `V13c` — Query tool loop and typed two-phase

**Spec.** [`../spec_topics/query/query-tool-loop.md`](../spec_topics/query/query-tool-loop.md), [`../spec_topics/hard-ceilings/ceilings-3-and-4.md`](../spec_topics/hard-ceilings/ceilings-3-and-4.md).

**Adds.** The model tool-call loop (free phase), the typed two-phase `complete()` with the `__loom_respond_<slug>` forced-respond turn (verbatim templates), the `max_rounds:0` boundary, and the ceiling-#2 evaluation at the round boundary. At its ceiling-#2 first-enforcement point (the round boundary) this leaf **consults** `V16a`'s cross-ceiling arbitration seam for the cross-ceiling surfacing precedence and `masked` enumeration — the seam it binds via its `Deps` on `V16a`.

**Tests.**
- `CIO-4` (query-tool-loop.md — free phase): the free phase advances rounds; a parallel batch counts as one slot; the forced-respond turn is exempt from the round count (CIO-4 final branch).
- [query-tool-loop.md — `max_rounds:0` boundary](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area): `max_rounds:0` (typed) takes the forced-respond branch at the start.
- [query-tool-loop.md — exhaustion](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area), untyped exhaustion: ceiling #2 surfaces as `Err(QueryError { kind: "tool_loop_exhausted" })` (`ToolLoopExhaustedError`), with no `masked` field (omitted, never `[]`).
- [query-tool-loop.md — Worked example: depth-6 forced respond at `max_rounds`](../spec_topics/query/query-tool-loop.md) (QRY code-keyed area), typed depth-6 co-fire vector: ceiling #4 surfaces on the typed-query response as `Err(QueryError { kind: "validation", cause: "schema_validation" })` (`schema_keyword: "maxDepth"`), and the surface's `masked` enumerates the co-satisfied-but-masked ceiling #2 — i.e. `masked:["ceiling#2"]` (`CIO-4`/`CIO-6`). The surfaced ceiling is the observable `validation`/`maxDepth` `Err`, not a literal `surfaced:` wire key (the event shape carries only `kind` plus the optional `masked` field).

**Deps.** `V13c-T`, `V13b`, `V9c`, `V16a`, `V5e`, `V8c`, `H4b`

**Ships when.** `npm test` advances the tool loop, runs the forced-respond branch, and asserts the `max_rounds:0` and exhaustion paths.
