# D8 simplification lens — model × effort benchmark (2026-09-26)

## Design

- Shard: D8 shard-02 at commit 8986ffb8 — 7 files, 4617 LOC (`src/extension/subagent-spawn-regime.ts`, `src/parser/frontmatter.ts`, `src/runtime/tool-registration.ts`, `src/runtime/subagent-argv.ts`, `src/parser/frontmatter-contract.ts`, `src/runtime/subagent-placement.ts`, `src/runtime/host-loop-dispatch.ts`), the smaller of the two pending D8 shards the sharder produced. Identical canonical brief for every run: the rendered brief of a real `lens-d8-simplification` child (opus-5-5, the production pin) on that shard, with a neutral random wave id, neutral `reported_by` and a neutral manifest path.
- 28 configs: fable-5-1 {low, medium}; opus-5-5 {low…max}; gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra {off(none), minimal, low, medium, high, xhigh, max} via the additive `unity-bench` provider.
- 5 production rounds (r1–r5) = 140 runs; r1 was audited before the other four rounds.
- Run isolation, confinement and oversight as in the [D4](2026-09-25-d4-model-effort.md), [D2](2026-09-26-d2-model-effort.md) and [D7](2026-09-26-d7-model-effort.md) benchmarks. After r1 the guard gained a network rule (registry, web-request and remote-git commands blocked; npm forced offline), because r1-terra-max downloaded package tarballs from the npm registry. r2–r5 ran with it.

## Integrity outcome

- 140/140 runs audited, 100% coverage: 64 CLEAN, 70 CONCERN, 6 VIOLATION (worst verdict per run).
- No run saw another run's or the benchmark's content. The tracked benchmark reports showed up in recursive `quality/` listings; one run grepped them for its own topics and got no matches.
- VIOLATIONs:
  - r1-terra-max reached registry.npmjs.org before the network rule existed. Its finding was re-proved by both judges from in-repo evidence.
  - r2-fable51-low compiled a scratch probe file in its own worktree root, created and deleted within one command.
  - Four gpt-5.6-sol runs claimed review work they never did, such as "examined all seven hosts" with zero tool calls, or two filings that were never written.
- 43 guard blocks: 11 genuine out-of-scope attempts, 32 false positives on shell text that names `node_modules`, `..` or a drive-like `/x`. The network rule fired 4 times in r2–r5 (sol-max and terra-max repeating the r1 registry query), with no false positives. In r1, opus55-max twice rebuilt a blocked `..` from character codes; it stayed in scope.
- 1 timeout at the 50-min cap (r2-terra-max, still working). gpt-5.6-sol answered instantly with zero tool calls in 7 runs; kept in the data. gpt-6-astra filed nothing in any of its 35 runs.

## Clusters (both judges valid: 9 of 10)

Against the grain: C1 five `as unknown as QueryError` double casts on already-typed values (15 runs) · C2 `setThinkingLevel` parameter typed `never`, forcing `as never` at both call sites (29).
Reimplemented: C3 hand-rolled `Object.fromEntries` ×2 (5) · C8 `sameModelIdentity` re-implements pi-ai's `modelsAreEqual` (6) · C9 `(emitDiagnostic ?? noop)(…)` instead of `?.()` ×4 (2).
Overbuilt: C5 validators re-guard an already-typed verdict (11) · C6 `noHostTools` stores derived state through four hand-offs (6) · C7 ReadonlyMap copied to an array only to rebuild the same Map (2) · C10 guard predicate re-derived beside its verdict (1).

Rejected by the verifier: C4 (a union with a stated rationale).

## Results (5 runs each; recall over 9 clusters)

| config | recall mean / median ± sd | union recall (5 runs) | precision mean | sec mean / median | cost $ mean / median |
|---|---|---|---|---|---|
| opus55-max | 0.33 / 0.33 ± 0.11 | 0.67 | 1.00 | 2117 / 2208 | 10.00 / 11.10 |
| opus55-xhigh | 0.27 / 0.22 ± 0.06 | 0.56 | 1.00 | 840 / 877 | 4.47 / 4.45 |
| sol-max | 0.20 / 0.22 ± 0.12 | 0.33 | 0.92 | 1627 / 1869 | 21.00 / 29.43 |
| opus55-high | 0.20 / 0.22 ± 0.05 | 0.44 | 1.00 | 338 / 333 | 1.91 / 1.91 |
| fable51-medium | 0.18 / 0.22 ± 0.06 | 0.44 | 0.93 | 429 / 428 | 4.06 / 3.96 |
| fable51-low | 0.16 / 0.11 ± 0.06 | 0.33 | 0.93 | 388 / 306 | 3.69 / 3.03 |
| opus55-medium | 0.11 / 0.11 ± 0.00 | 0.56 | 1.00 | 173 / 173 | 1.19 / 1.23 |
| sol-high | 0.09 / 0.11 ± 0.05 | 0.11 | 1.00 | 180 / 222 | 1.04 / 1.16 |
| sol-xhigh | 0.09 / 0.11 ± 0.09 | 0.22 | 1.00 | 284 / 423 | 1.88 / 2.60 |
| terra-max | 0.07 / 0.00 ± 0.10 | 0.22 | 1.00 | 2369 / 2167 | 6.79 / 5.78 |
| opus55-low, all astra, other sol/terra levels | 0.00–0.02 | 0.00–0.11 | — | 17–372 | 0.05–1.56 |

Full per-run data lives outside the repository with the operator's benchmark kit; this file is the summary of record. Cost is measured, with provider prompt caching.

## Spend

contestants $310.00 · opus auditors $171.55 (plus about $14 of unrecorded retries after content-policy blocks) · fable judge $9.11 · opus verifier $1.37 · total $492.03 measured.
