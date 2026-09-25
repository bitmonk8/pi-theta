# D4 duplication lens — model × effort benchmark (2026-09-25)

## Design

- Shard: the 7-file D4 shard of wave qbench20260925081424 at commit 850b591b; identical canonical brief for every run (neutral random wave id, neutral `reported_by`).
- 28 configs: fable-5-1 {low, medium}; opus-5-5 {low…max}; gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra {off(none), minimal, low, medium, high, xhigh, max} via the additive `unity-bench` provider (all 7 levels verified on the wire).
- 5 production rounds (r2–r6) = 140 runs, after trial round r1 (diagnostic only; excluded).
- Each run: pristine git worktree (6 slots) + node_modules junction to a dedicated copy, own $TEMP, own session file outside the repo, 50-min cap, mirror of pi-theta's subagent child argv (system prompt + read/grep/bash/write, no context files/skills).
- Confinement: tool-layer guard extension (blocks paths outside worktree+$TEMP, writes outside quality/intake, `..`, home vars, git worktree/metadata, mutating git, package installs, node_modules writes); node_modules integrity watcher.
- Oversight: every transcript read in full by an opus-5-5-high auditor (read coverage verified line-by-line from the auditor's own session; gaps re-audited); blind fable-5-1-medium judge (model names stripped from filings); every cluster independently re-verified by opus-5-5-high — a filing counts only if both judges accept its cluster.

## Integrity outcome

- 140/140 runs audited, 100% coverage: 112 CLEAN, 26 CONCERN, 2 VIOLATION.
- No run saw another run's or the benchmark's content (auditors + mechanical scan).
- 16 guard blocks: ~10 genuine out-of-scope attempts (mostly globbing /tmp for own mktemp files), ~6 false positives on regex/sed text (`/g`, `/X/`, `/\`) — one retry each.
- VIOLATIONs (no information gain, own worktree, reset afterwards): r3-terra-off appended to tracked REVIEW_LOG.md; r4-terra-max wrote probe/test files into its worktree and ran vitest (vitest cache landed in the shared node_modules copy; nobody read it).
- Known model behaviour kept in the data: gpt-5.6-sol intermittently answers "clean" instantly with 0 reasoning and 0 tool calls (reproduced at the raw API in 2/5 identical requests) — 10/35 sol runs, including 5/5 sol-max.
- 2 timeouts (terra-max r3, r4) at the 50-min cap.

## Clusters (both judges valid)

C1 enum-registration projection ×3 (23 runs) · C2 two duration grammars (17) · C3 provable-arg incompatibility gate ×3 (9) · C4 progress envelope keys (0; a seed cluster from the pre-benchmark wave qbench20260925081424, where the opus-5-5 lane filed it; no production run re-found it, so the highest achievable recall here is 7/8) · C5 precache mirrors resolver gates (11) · C6 run-card animationOwed vs bus keep-alive (5) · C7 milestone payload typed/untyped (2) · C8 callable vs runtime-tool call surface (2).

## Results (5 runs each; recall over 8 clusters; precision 1.00 wherever anything was filed, except sol-high 0/1)

| config | recall mean / median ± sd | union recall (5 runs) | sec mean / median ± sd | cost $ mean / median ± sd |
|---|---|---|---|---|
| opus55-max | 0.42 / 0.38 ± 0.14 | 0.75 | 2235 / 2319 ± 317 | 13.25 / 14.60 ± 3.09 |
| opus55-xhigh | 0.40 / 0.38 ± 0.06 | 0.62 | 1164 / 1130 ± 107 | 6.80 / 6.82 ± 0.80 |
| fable51-medium | 0.28 / 0.25 ± 0.06 | 0.38 | 552 / 556 ± 45 | 4.43 / 4.33 ± 0.37 |
| fable51-low | 0.23 / 0.25 ± 0.06 | 0.25 | 443 / 401 ± 82 | 3.53 / 3.32 ± 0.43 |
| opus55-high | 0.17 / 0.13 ± 0.07 | 0.38 | 433 / 416 ± 104 | 2.47 / 2.34 ± 0.51 |
| opus55-medium | 0.10 / 0.13 ± 0.10 | 0.25 | 195 / 158 ± 73 | 1.16 / 1.02 ± 0.35 |
| terra-max | 0.07 / 0.13 ± 0.07 | 0.25 | 2385 / 2474 ± 677 | 8.42 / 7.07 ± 3.83 |
| sol-xhigh | 0.03 / 0.00 ± 0.06 | 0.12 | 413 / 481 ± 443 | 2.40 / 2.24 ± 3.01 |
| terra-xhigh | 0.03 / 0.00 ± 0.06 | 0.12 | 240 / 206 ± 124 | 0.64 / 0.45 ± 0.46 |
| opus55-low, all astra, other sol/terra levels | 0.00 | 0.00 | 5–406 | 0.00–1.68 |

Full per-run data (stats, sessions, audits, judge verdicts) lives outside the repository with the operator's benchmark kit; this file is the summary of record. Cost is measured (with provider prompt caching); stats also carry a cache-neutral figure (all input priced uncached), which is an upper bound, not a real bill.

## Spend

contestants r2–r6 $240.44 · trial r1 $65.49 · opus auditors $186.47 · fable judge $9.31 · opus verifier $0.66 · total $502.37.
