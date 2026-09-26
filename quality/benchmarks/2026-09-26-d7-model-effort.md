# D7 test-quality lens — model × effort benchmark (2026-09-26)

## Design

- Shard: one D7 shard at commit 04e9d256 — 5 test files, 2921 LOC (`tests/respond-tool-wire.test.ts`, `tests/schema-body-unclosed-at-eof.test.ts`, `tests/subagent-fn-child-launch.test.ts`, `tests/subagent-invoke-inbound-enum-tag.test.ts`, `tests/subagent-invoke-nonfinite-return-refusal.test.ts`). Identical canonical brief for every run: the rendered brief of a real `lens-d7-testquality` child (sonnet-5) on that shard, with a neutral random wave id, neutral `reported_by` and a neutral manifest path. Two open issues already cite shard files; the judges treated re-filings of them as invalid.
- 28 configs: fable-5-1 {low, medium}; opus-5-5 {low…max}; gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra {off(none), minimal, low, medium, high, xhigh, max} via the additive `unity-bench` provider.
- 5 production rounds (r1–r5) = 140 runs; r1 was audited before the other four rounds.
- Run isolation, confinement and oversight as in the [D4](2026-09-25-d4-model-effort.md) and [D2](2026-09-26-d2-model-effort.md) benchmarks. Since D2 the guard resolves file-tool paths with node semantics, so a write-tool `/tmp/...` is blocked like a bash one.

## Integrity outcome

- 140/140 runs audited, 100% coverage: 62 CLEAN, 77 CONCERN, 1 VIOLATION (worst verdict per run).
- No run saw another run's or the benchmark's content. The worktrees contained the tracked D4 and D2 reports; the auditors flagged every recursive `quality/` listing or grep that touched them (the largest CONCERN class) and confirmed no agent read either report.
- Other CONCERN classes: filings citing verification searches never run as written, most often in the fable-5-1 runs, which also misname their own model in `reported_by`; excerpts over the 15-line cap.
- VIOLATION: r3-opus55-low overwrote the manifest file in its own worktree with a status note. The driver rewrites the manifest before every run, so no other run saw it.
- 37 guard blocks: 17 genuine out-of-scope attempts (gpt-6-astra and gpt-5.6-terra opening with `find .. -name AGENTS.md`), 20 false positives on heredoc or regex text. The file-tool `/tmp` rule never fired.
- 5 timeouts at the 50-min cap: two stalled provider streams (r3-astra-high, r4-sol-high: no reply after a tool result until the cap) and three runs still working at the cap (r2-sol-max, which filed 5, and terra-max r3 and r5). One sol run answered "clean" instantly with zero tool calls.

## Clusters (both judges valid: 19 of 21)

Copy-paste fixture: C1 on-session harness re-implemented (1 run) · C4 RuntimeRoot literals vs `liveSessionRoot` (31) · C5 ModelRegistry double repeated (25) · C9 local `parse` vs `parseTheta` (24) · C10 FM/theta parse wrapper redeclared (13) · C16 local `lower()` inlines decl filters (5) · C19 parse-diagnostics guard retyped (1) · C21 fail-closed note filter retyped ×5 (1).
Boilerplate duplication: C11 `driveSubagentFnEntry` preamble ×6 (18) · C17 offline forced-respond producer drive (1) · C18 fixture-cell tail restated ×4 (5) · C20 `driveChild` narrowing forces bypass (1).
Misleading test name: C2 "the label" not asserted (54) · C3 group (d) "single diagnostic" (12) · C6 "non-string / empty" drives only empty (45) · C12 FN-9 helper cannot witness its claim (7) · C14 override "rides --model" unwitnessed (1) · C15 enum-tag "child's declaration" unwitnessed (1).
Cannot-fail assertion: C13 twenty `registered(...)` asserts entailed by an exact-set assertion (2).

Rejected by the verifier: C7 (re-files an open issue; its "zero importers" claim is false), C8 (no canonical helper to duplicate).

## Results (5 runs each; recall over 19 clusters)

| config | recall mean / median ± sd | union recall (5 runs) | precision mean | sec mean / median | cost $ mean / median |
|---|---|---|---|---|---|
| opus55-max | 0.31 / 0.32 ± 0.08 | 0.53 | 0.89 | 2360 / 2461 | 15.71 / 15.49 |
| fable51-medium | 0.27 / 0.26 ± 0.04 | 0.47 | 0.81 | 711 / 673 | 6.35 / 6.20 |
| opus55-xhigh | 0.25 / 0.26 ± 0.04 | 0.53 | 0.89 | 1244 / 1270 | 7.84 / 7.90 |
| fable51-low | 0.23 / 0.21 ± 0.06 | 0.42 | 0.78 | 604 / 546 | 4.96 / 4.58 |
| astra-max | 0.21 / 0.21 ± 0.04 | 0.26 | 1.00 | 1012 / 976 | 5.02 / 4.94 |
| opus55-high | 0.21 / 0.21 ± 0.05 | 0.47 | 0.92 | 642 / 616 | 3.83 / 3.82 |
| astra-xhigh | 0.19 / 0.16 ± 0.05 | 0.26 | 1.00 | 491 / 482 | 3.31 / 3.36 |
| opus55-medium | 0.17 / 0.16 ± 0.04 | 0.42 | 1.00 | 368 / 319 | 2.13 / 2.03 |
| sol-max | 0.15 / 0.21 ± 0.11 | 0.37 | 0.88 | 1877 / 1959 | 27.10 / 25.04 |
| astra-high | 0.12 / 0.11 ± 0.08 | 0.26 | 1.00 | 852 / 312 | 1.95 / 2.03 |
| sol-xhigh | 0.12 / 0.11 ± 0.02 | 0.16 | 0.93 | 321 / 300 | 2.70 / 2.01 |
| terra-max | 0.11 / 0.16 ± 0.10 | 0.26 | 1.00 | 2467 / 2297 | 6.48 / 7.49 |
| opus55-low, astra off–medium, other sol/terra levels | 0.00–0.08 | 0.00–0.16 | — | 20–707 | 0.05–0.77 |

Full per-run data lives outside the repository with the operator's benchmark kit; this file is the summary of record. Cost is measured, with provider prompt caching.

## Spend

contestants $460.83 · opus auditors $207.70 (plus about $25 of unrecorded retries after a content-policy block on one transcript) · fable judge $25.31 · opus verifier $3.10 · total $696.94 measured.
