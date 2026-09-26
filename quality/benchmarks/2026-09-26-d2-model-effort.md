# D2 cruft lens — model × effort benchmark (2026-09-26)

## Design

- Shard: D2 shard-04 at commit ee60a538 — 6 files, 3641 LOC (`src/parser/frontmatter.ts`, `src/runtime/host-loop-dispatch.ts`, `src/runtime/statement-executor.ts`, `src/runtime/subagent-argv.ts`, `src/runtime/subagent-placement.ts`, `src/runtime/tool-registration.ts`). Identical canonical brief for every run: the rendered brief of a real `lens-d2-cruft` child (sonnet-5) on that shard, with a neutral random wave id, neutral `reported_by` and a neutral manifest path.
- 28 configs: fable-5-1 {low, medium}; opus-5-5 {low…max}; gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra {off(none), minimal, low, medium, high, xhigh, max} via the additive `unity-bench` provider.
- 5 production rounds (r1–r5) = 140 runs. The harness was unchanged from the D4 benchmark apart from the shard and brief, so r1 ran as a production round and was audited before the other four rounds.
- Run isolation, confinement and oversight as in the [D4 benchmark](2026-09-25-d4-model-effort.md): pristine worktree per run, own $TEMP and session file, 50-min cap, pi-theta's subagent child argv, tool-layer guard, node_modules integrity watcher, every transcript read in full by an opus-5-5-high auditor with verified line coverage, blind fable-5-1-medium judge, every cluster re-verified by opus-5-5-high — a filing counts only if both judges accept its cluster.

## Integrity outcome

- 140/140 runs audited, 100% coverage: 87 CLEAN, 49 CONCERN, 4 VIOLATION (worst verdict per run).
- No run saw another run's or the benchmark's content.
- The dominant CONCERN class, in every model family: filings cite verification searches that were never run as written (a file-local grep presented as repo-wide, invented hit counts). The fable-5-1 runs also misname their own model in `reported_by`; the judge strips that line.
- VIOLATIONs:
  - r2-astra-minimal and r4-terra-medium quote code lines or search results they never observed.
  - r5-sol-high made zero tool calls and reported a filing it never wrote.
  - r4-opus55-max wrote two scratch notes to `C:\tmp\` through the write tool. The guard resolves `/tmp` with git-bash semantics while the write tool resolves it against the drive root. The content was its own draft text; the files were removed.
- 46 guard blocks: 13 genuine out-of-scope attempts (mostly scratch writes to `/tmp`), 33 false positives on regex or heredoc text (`/g`, `..`) — one retry each, spread across lanes.
- gpt-5.6-sol again answered "clean" instantly with zero tool calls in 6 runs; kept in the data.
- 6 timeouts at the 50-min cap (opus55-max r2, terra-max r2 and r3, sol-max r3–r5); partial filings count.

## Clusters (both judges valid: 19 of 24)

All stale-doc unless marked:

C2 `traceEffectDispatch` doc names two span-settling callers (58 runs) · C3 placement `capabilities` "the two" of three (27) · C4 removed `normal` discriminator named (9) · C5 placement request field attribution (4) · C6 `collectLaunchRespondNames` location (24) · C7 `extensionPinDir` env-pin reader (10) · C8 `frontmatter-fields-a.md:37` citation (14) · C9 three of four sharing rules (20) · C10 folded "diagnostics pass below" (2) · C11 argv doc omits `--theta-launch` (10) · C13 `subagent.md:130` citation (16) · C14 "BOTH dispatch sites" (4) · C15 `grammar.md:114` citation (3) · C17 closed four-code roster, five exist (3) · C19 matcher seam declared elsewhere (11) · C20 dead-code: unreachable `parseFrontmatter` fallback arms (3) · C22 per-key loop attribution (5) · C23 scaffolding: stub-then-implement narration (5) · C24 three of four `args: undefined` shapes (1).

Rejected by the verifier: C1 (the seed cluster; the prose is still an accurate caller-level description), C12 and C16 (star re-exports with importers), C18 (no completeness claim), C21 (spec-mirroring precedent).

## Results (5 runs each; recall over 19 clusters)

| config | recall mean / median ± sd | union recall (5 runs) | precision mean | sec mean / median | cost $ mean / median |
|---|---|---|---|---|---|
| opus55-max | 0.36 / 0.37 ± 0.10 | 0.84 | 0.93 | 2665 / 2780 | 16.43 / 15.33 |
| opus55-xhigh | 0.26 / 0.26 ± 0.04 | 0.53 | 0.87 | 1568 / 1658 | 7.99 / 7.75 |
| opus55-high | 0.23 / 0.26 ± 0.07 | 0.47 | 0.90 | 692 / 657 | 3.46 / 3.42 |
| astra-max | 0.21 / 0.21 ± 0.00 | 0.37 | 1.00 | 1041 / 1003 | 5.06 / 5.08 |
| fable51-medium | 0.19 / 0.16 ± 0.10 | 0.58 | 0.77 | 981 / 982 | 6.74 / 6.77 |
| opus55-medium | 0.18 / 0.21 ± 0.08 | 0.47 | 1.00 | 416 / 391 | 1.94 / 1.96 |
| fable51-low | 0.17 / 0.21 ± 0.09 | 0.37 | 0.86 | 812 / 840 | 5.95 / 6.46 |
| astra-xhigh | 0.15 / 0.16 ± 0.02 | 0.21 | 1.00 | 444 / 442 | 2.99 / 3.05 |
| terra-max | 0.11 / 0.16 ± 0.07 | 0.32 | 0.94 | 2627 / 2764 | 6.73 / 6.50 |
| astra-high | 0.11 / 0.11 ± 0.04 | 0.16 | 1.00 | 288 / 294 | 2.00 / 2.27 |
| sol-xhigh | 0.08 / 0.11 ± 0.06 | 0.21 | 0.65 | 735 / 901 | 6.05 / 6.95 |
| sol-max | 0.07 / 0.05 ± 0.09 | 0.26 | 0.64 | 2383 / 3003 | 29.96 / 18.31 |
| astra-medium | 0.06 / 0.05 ± 0.02 | 0.11 | 1.00 | 92 / 92 | 0.76 / 0.81 |
| opus55-low, astra off–low, other sol/terra levels | 0.00–0.04 | 0.00–0.11 | — | 31–561 | 0.06–1.58 |

Full per-run data lives outside the repository with the operator's benchmark kit; this file is the summary of record. Cost is measured, with provider prompt caching.

## Spend

contestants $513.34 · opus auditors $234.23 · fable judge $21.69 · opus verifier $1.78 · total $771.03.
