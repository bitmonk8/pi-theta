# quality/ — the self-review (dogfood) store

pi-theta reviews and fixes itself with its own language: the commands under
`.pi/theta/` are `.theta`/`.thetalib` files executed by the **installed**
pi-theta extension (installed from GitHub main via pi-config's
`@bitmonk8/pi-theta` git dependency), not by this working tree. The
review method is adapted from the Playdough code-quality pipeline
(lens x surface waves, evidence-first findings, independent triage, solution-free
issue store); the model and shard-size choices follow the TessenAgents
lens-model-matrix experiments (x01–x03).

## Running

The thetas live in `.pi/theta/` (a committed project source), so any pi session
in this repository discovers `/quality-loop` automatically — no flags:

```
pi                                   # interactive; then /quality-loop
pi -p "/quality-loop"                # headless, defaults
pi -p "/quality-loop 2 cycles, shards of 4000 loc, no push"
```

Personal, uncommitted thetas go directly in `.localpi/` (see its README); a
`.localpi` theta with the same filename stem shadows the committed command.

Arguments (bound by an LLM binder, so free-form text works):
`max_cycles` (default 3), `lenses` (comma-separated lens roster, default
`"D2,D7"`; start-up refuses an id lacking a surfaces.json entry or a worker),
`shard_loc` (target lines per review shard, default `"0"` = each lens's
surfaces.json `shard_loc` — D2 6000, D7 3000; non-zero overrides all lenses),
`review_cap` (max shards reviewed per lens per wave, default `"0"` =
unlimited), `budget` (max candidates per shard, default 10), `parallel`
(fan-out width, default 4), `push` (default true), `gate_cmd` (offline
verification gate, default `npx tsc --noEmit && npm test`).

## The loop (one cycle)

1. **Preflight** — clean worktree + green gate, else refuse.
2. **Delta detection** — `store.mjs needs-review` compares `state.json`
   (per-lens, per-file last-reviewed commit) against `git diff`: a file is due
   when never reviewed or changed since its recorded sha.
3. **Shard** — due files split path-contiguously into ~`shard_loc`-line shards
   (`quality/tmp/<wave>/<lens>/shard-NN.txt`).
4. **Review** — one lens worker per shard in parallel (D2 cruft:
   `anthropic/claude-sonnet-5`, per the experiments' D2 pick at quarter-surface
   scopes; D7 test quality: `anthropic/claude-sonnet-5`, per the x03
   quarter-surface data). Candidates land in `intake/`, shaped by
   `TEMPLATE.md`. Reviewed files are marked in `state.json` at the reviewed
   sha — fix commits re-dirty them, so the next cycle re-reviews exactly what
   changed.
5. **Triage** — every candidate independently re-verified
   (`anthropic/claude-fable-5`, the experiments' judge). `confirmed` → minted
   `PTQ-NNNN` in `issues/`; rejections → one `TRIAGE_LOG.md` row, file deleted;
   `questionable` stays in `intake/` as the human queue.
6. **Fix** — open issues clustered by fix surface (first two path segments);
   one fixer per cluster, sequentially (`claude-sonnet-5`). Fixer edits code
   only, then runs the gate.
7. **Fix review** — `claude-fable-5` verifies each issue is actually resolved
   and nothing else was damaged; gate + review must pass, else one guided retry,
   else `git restore .` and the issues stay open.
8. **Commit/push** — one store commit per wave (`quality: <wave> review pass
   [<lenses with files due>]`, suffix omitted when no lens had files due) and
   one commit per fixed cluster (`quality: <wave> fix <key>`), plus one
   `quality: <wave> fix batch` store commit after integration.
9. Repeat until nothing needs review and intake is empty (converged), or
   `max_cycles`.

## Layout

| Path | What | Versioned |
|---|---|---|
| `surfaces.json` | lens → reviewable file set (include/exclude prefixes + extensions over git-tracked files) + per-lens `shard_loc` | yes |
| `state.json` | lens → { file → commit sha last reviewed at } | yes |
| `TEMPLATE.md` | finding file shape (one finding, one root cause, evidence-first) | yes |
| `TRIAGE_LOG.md` | append-only rejection ledger (re-file prevention) | yes |
| `intake/` | candidates awaiting triage / human ruling | yes (transient content) |
| `issues/` | confirmed open issues `PTQ-NNNN-*.md` | yes |
| `resolved/` | fixed issues (moved by `store.mjs resolve`) | yes |
| `tmp/` | shard + cluster manifests | no (gitignored) |
| `../.pi/theta/` | the loop: `quality-loop.theta` root command, `workers/`, `lib/` | yes |
| `../.pi/settings.json` | project settings (`thetaPaths: ["../.localpi"]` — entries resolve relative to `.pi/`) | yes |
| `../.localpi/` | personal thetas + scratch (local user layer) | README only |
| `../tools/quality/store.mjs` | deterministic store mechanics (state, sharding, minting, moves) | yes |

Division of labor: models judge (find, verify, fix, review); `store.mjs` owns
every store/state mutation except the finding files the reviewer writes and the
triage note appended to them — so ids, moves, and state stay consistent no
matter what a model does.

## Extending to more lenses

Add a lens = one surfaces.json entry (+ `shard_loc`) + one worker theta in
`.pi/theta/workers/` (its own `model:` pin — that is why workers are separate
files) + THREE literal touch points in `quality-loop.theta` (the `tools:`
entry, the dispatch arm in the review `par for`, the `has_worker` roster
predicate) + a triage step-4 scope block + a fix-brief rules block.
Model picks: D7 test quality → claude-sonnet-5 (x03 quarter-surface data;
supersedes the earlier kimi-k2.7-code note); D4 duplication → kimi-k2.7-code
or gemini-3.7-flash; D8/D9 → gemini-3.7-flash with fable arbiter; D1/D6 →
fable only.

## Committing note

The repo's parse gate (`tests/committed-fixture-parse-gate.test.ts`) pins exact
counts of committed `.theta`/`.thetalib` files (currently 38/3, including the
`.pi/theta/` loop) — adding or removing a committed theta means bumping the
counts in the same commit.
