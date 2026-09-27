# D9 placement & breakdown lens — model × effort benchmark (2026-09-27)

## Design

- Shard: D9 shard-03 at commit 87778c4e — 6 files, 5059 LOC, as the production sharder emitted it (2 files in the justify band, 1 in the zone band, 3 exempt; 14 over-threshold disposition items). Identical canonical brief for every run: the rendered brief of a real `lens-d9-placement` child (opus-5-5, the production pin) on that shard, with a neutral random wave id, neutral `reported_by` and a neutral manifest path. Several shard functions carry resolved breakdown issues; the judges treated re-filings of them as invalid.
- 28 configs: fable-5-1 {low, medium}; opus-5-5 {low…max}; gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra {off(none), minimal, low, medium, high, xhigh, max} via the additive `unity-bench` provider.
- 5 production rounds (r1–r5) = 140 runs; r1 was audited before the other four rounds.
- Run isolation, confinement and oversight as in the [D8](2026-09-26-d8-model-effort.md) benchmark, including the guard's network rule from r1 on.

## Integrity outcome

- 140/140 runs audited, 100% coverage: 60 CLEAN, 80 CONCERN, 0 VIOLATION (worst verdict per run).
- No run saw another run's or the benchmark's content. CONCERN classes: recursive `quality/` listings that named the tracked benchmark reports (no content read), filings citing verification searches never run as written, zero-tool runs claiming a review, and the fable-5-1 runs misnaming their own model in `reported_by`.
- 10 guard blocks: 2 genuine out-of-scope attempts (one Temp-root redirect, and one write-tool `/tmp` path — the first firing of the node-semantics file-tool rule in any benchmark), 8 false positives. The network rule never fired.
- 3 timeouts at the 50-min cap: two stalled provider streams in r1 (sol-medium, terra-xhigh) and one run still working at the cap (r5-astra-max, which filed 2). 9 runs answered instantly with zero tool calls (7 gpt-5.6-sol, and opus55-low in 3 of 5 rounds); kept in the data.

## Clusters (both judges valid: 6 of 8)

Breakdown: C2 `production-subagent-host.ts`, 608 LOC bundling child-process lifecycle, fs/session-path factories and control-plane readers (103 runs) · C3 `#launchSubagentChild`, 136 LOC, session-log phase beside lease and launch assembly (65) · C6 `#marshalChildCallables` combines tool-allowlist policy with closure-hash carriage (2) · C8 `driveSubagentRootRegime` still inlines the envelope/outcome emitter block after three extracted seams (2).
Misplacement: C1 `isEnoent` + `calleePathIsAbsent` homed in `production-producer-deps.ts`, sole caller in the invoke machinery (16) · C7 two error classes declared in `production-producer-deps.ts`, constructed only elsewhere (3).

Rejected by the verifier: C4 and C5 (functions whose keep-whole rulings still hold; the filings restated resolved accounting).

The inventory discriminates weakly: C2 and C3 are found by nearly every config that files anything, so most configs sit at 0.30–0.37 mean recall. The four rare clusters split by model family — C1 only by fable-5-1 and opus-5-5, C6 only by gpt-6-astra, C7 by gpt-5.6-sol xhigh and fable-5-1 low, C8 only by fable-5-1 low.

## Results (5 runs each; recall over 6 clusters)

| config | recall mean / median ± sd | union recall (5 runs) | precision mean | sec mean / median | cost $ mean / median |
|---|---|---|---|---|---|
| fable51-low | 0.47 / 0.33 ± 0.18 | 0.83 | 0.89 | 499 / 484 | 3.48 / 3.34 |
| astra-xhigh | 0.37 / 0.33 ± 0.07 | 0.50 | 1.00 | 920 / 932 | 3.31 / 3.02 |
| astra-max | 0.37 / 0.33 ± 0.07 | 0.50 | 1.00 | 2531 / 2344 | 7.04 / 7.38 |
| sol-xhigh | 0.33 / 0.33 ± 0.12 | 0.50 | 1.00 | 618 / 601 | 2.81 / 2.45 |
| opus55-medium | 0.33 / 0.33 ± 0.12 | 0.50 | 0.92 | 363 / 306 | 1.56 / 1.41 |
| opus55-high | 0.33 / 0.33 ± 0.12 | 0.50 | 1.00 | 457 / 468 | 2.09 / 2.13 |
| fable51-medium | 0.33 / 0.33 ± 0.20 | 0.50 | 1.00 | 546 / 541 | 3.87 / 4.10 |
| opus55-max | 0.33 / 0.33 ± 0.12 | 0.50 | 0.82 | 2097 / 1837 | 10.70 / 9.83 |
| astra-medium | 0.33 / 0.33 ± 0.00 | 0.33 | 1.00 | 246 / 240 | 1.46 / 1.42 |
| astra-high | 0.33 / 0.33 ± 0.00 | 0.33 | 1.00 | 644 / 630 | 2.72 / 2.74 |
| astra-off | 0.33 / 0.33 ± 0.00 | 0.33 | 1.00 | 148 / 160 | 0.76 / 0.70 |
| opus55-xhigh | 0.30 / 0.33 ± 0.07 | 0.50 | 0.90 | 1026 / 989 | 4.76 / 4.69 |
| astra-low | 0.30 / 0.33 ± 0.07 | 0.33 | 1.00 | 149 / 146 | 0.77 / 0.74 |
| other sol/terra levels, astra-minimal | 0.07–0.23 | 0.17–0.33 | 1.00 | 33–1183 | 0.05–2.82 |
| opus55-low, sol-off, terra-off | 0.00 | 0.00 | — | 23–37 | 0.05–0.25 |

fable51-low's lead rests on two rounds that filed 4 and 5 findings; its median equals the field's. Full per-run data lives outside the repository with the operator's benchmark kit; this file is the summary of record. Cost is measured, with provider prompt caching.

## Spend

contestants $279.25 · opus auditors $172.03 (plus about $5 of unrecorded retries after content-policy blocks) · fable judge $19.57 · opus verifier $1.45 · total $472.30 measured.
