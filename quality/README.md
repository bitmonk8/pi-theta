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
6. **Fix** — open issues clustered by fix surface (D2/D7: first two path
   segments; D9: the whole HOST FILE, §"D9 — placement & breakdown" below);
   one fixer per cluster (`claude-sonnet-5`), each in its own detached git
   worktree, fanned out in parallel. Fixer edits code only, then runs the
   gate inside its tree.
7. **Fix review** — `claude-fable-5` verifies each issue is actually resolved
   and nothing else was damaged, in the tree; a green, reviewed lane's commit
   is cherry-picked onto the integrated head sequentially, in cluster order.
   A conflicting cherry-pick gets ONE rebase-and-retry in a fresh worktree at
   the integrated head; a second conflict, or a red retry, drops the lane and
   its issues stay open. After every lane of the wave is integrated (or
   dropped), ONE batch gate run judges the whole integrated result; a red
   batch gate drops the wave's cherry-picks last-to-first, re-gating after
   each drop, until the gate is green again.
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

## D9 — placement & breakdown

D9 (`lens-d9-placement.theta`, `anthropic/claude-fable-5`) reviews every file
under `src/` for three classes at once:

- **breakdown** — a file or function over the size thresholds without an
  adequate reason to stay whole.
- **misplacement** — correct code living in the wrong module or directory
  (counted affinity to a foreign host, or a layer crossing).
- **husk** — a module that survives a past move almost empty (payload vs
  scaffolding ratio), as opposed to a deliberate re-export barrel/facade.

Only the breakdown class is band-gated; misplacement and husk are reviewed
for every file regardless of size. Bands (mechanical; from
`node tools/quality/size-scan.mjs bands`, quoted into every D9 brief so the
lens can never drift from the scanner):

| band | file LOC | function LOC | breakdown posture |
|---|---|---|---|
| exempt | < 600 | < 60 | no breakdown finding may be filed (placement review still applies) |
| zone | 600–999 | 60–99 | no presumption: needs a ≥ 2-concern inventory |
| justify | 1000–1999 | 100–199 | presumption of breakdown: not filed only with a concrete reason to stay whole |
| strong | ≥ 2000 | ≥ 200 | presumption of breakdown: not filed only with a **strong** concrete reason |

Every over-threshold item the mechanical map (`size-scan.mjs map`) lists must
be dispositioned exactly once: **FILE** (a breakdown finding), **KEEP-WHOLE**
(a reason class + evidence, recorded in the filer's notes as `kept whole:
<host> — <reason class>: <evidence>`), or **EXEMPT** (already human-ruled).

D9 never proposes a fix design — only the accounting and (for breakdown) a
set of unproven seam hypotheses. The target shape is a human decision, so a
triage verdict on a D9 candidate is never `confirmed`: an accurate D9
candidate triages to `questionable — accounting verified; target shape needs
a human ruling` and sits in `intake/` until you rule on it:

```
# ratify a seam or a move: this MINTS the issue (the accept --note IS the ruling)
node tools/quality/store.mjs accept --finding quality/intake/<f> --note \
  "RATIFIED: <seam letter or free text> — move <what> → <new module path,
  helper names, or rightful home>; <barrel|core-remains|dissolve>;
  constraints: …"

# keep the host whole for a recorded reason: writes a durable exemption
node tools/quality/store.mjs reject --finding quality/intake/<f> \
  --verdict human-keep-whole --reason "<the concrete/strong reason>"

# defer without recording anything: the host is not re-filed until it changes
node tools/quality/store.mjs reject --finding quality/intake/<f> \
  --verdict human-defer --reason "..."
```

`accept --note "RATIFIED: …"` is picked up by the fix phase next wave: ONE
ratified seam/move per issue, per wave — incremental, bounded lanes. If the
host is still over threshold afterwards, D9 re-reviews it and can file the
next seam.

`reject --verdict human-keep-whole` records the finding's `d9_host` in
`quality/exemptions.json` with the host's CURRENT LOC (any other verdict, or
a finding without `d9_host`, records nothing there). `exemptions.json` is
store-owned — it falls under the same single-writer rule as every other file
under `quality/`: only `store.mjs` (via `accept`/`reject`/`exempt`/`unexempt`)
writes it; nothing else under `.pi/theta/` or a lens worker touches it.
An exempted host is annotated in `size-scan.mjs map` output and is re-filed
only on growth of 25% or more since the ruling, or a newly named distinct
concern.

**A D9 lane owns its host file**: open `lens: D9` issues are clustered by
HOST FILE, not by the usual fix-surface path prefix — two ratified D9 issues
on the same host share one lane (one worktree, applied in issue-id order);
no other lens's issue may share a D9 lane's cluster. Any OTHER open issue
(any lens) that cites a file a D9 lane owns is **deferred** for the wave (one
fixer would only conflict with a breakdown rewriting the whole file) —
reported as one stderr line `deferred <issue>: file owned by D9 lane <key>`.
This is a distinct meaning from the orchestrator's own "deferred" count in
the exit report, which is the fix phase's PER-WAVE CAPACITY limit (a cluster
picked but not fanned out because `parallel` was already full — it is
reconsidered next wave, nothing about file ownership is implied).

## Extending to more lenses

Add a lens = one surfaces.json entry (+ `shard_loc`) + one worker theta in
`.pi/theta/workers/` (its own `model:` pin — that is why workers are separate
files) + THREE literal touch points in `quality-loop.theta` (the `tools:`
entry, the dispatch arm in the review `par for`, the `has_worker` roster
predicate) + a triage step-4 scope block + a fix-brief rules block.
Model picks: D7 test quality → claude-sonnet-5 (x03 quarter-surface data;
supersedes the earlier kimi-k2.7-code note); D9 placement & breakdown →
claude-fable-5 (precision/U100% on the D9 reference set; the mechanical
pre-scan makes breakdown recall structural, so precision and reasoning
quality decide); D4 duplication → kimi-k2.7-code or gemini-3.7-flash; D1/D6
→ fable only.

## Committing note

The repo's parse gate (`tests/committed-fixture-parse-gate.test.ts`) pins exact
counts of committed `.theta`/`.thetalib` files (currently 39/3, including the
`.pi/theta/` loop) — adding or removing a committed theta means bumping the
counts in the same commit.
