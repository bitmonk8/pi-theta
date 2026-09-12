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
surfaces.json `shard_loc` - D2 6000, D4 6000, D7 3000, D8 12000, D9 6000;
non-zero overrides all lenses),
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
   (`quality/tmp/<wave>/<lens>/shard-NN.txt`) - for D8, a shard is a
   path-contiguous APPROXIMATION of a subsystem, not a subsystem boundary.
4. **Review** — one lens worker per shard in parallel (D2 cruft:
   `anthropic/claude-sonnet-5`, per the experiments' D2 pick at quarter-surface
   scopes; D4 duplication & drift: `unity-completions/kimi-k2.7-code`; D7 test
   quality: `anthropic/claude-sonnet-5`, per the x03 quarter-surface data; D8
   simplification: `unity-completions/gemini-3.7-flash`; D9 placement &
   breakdown: `anthropic/claude-fable-5`). Candidates land in `intake/`, shaped by
   `TEMPLATE.md`. Reviewed files are marked in `state.json` at the reviewed
   sha — fix commits re-dirty them, so the next cycle re-reviews exactly what
   changed. Each worker's closing notes (D9's KEEP-WHOLE dispositions, every
   lens's routing notes — coverage gaps, suspected bugs, hollow modules) are
   persisted as one `REVIEW_LOG.md` row per shard (`store.mjs log-review`);
   the orchestrator otherwise reads only the filed count.
5. **Triage** — every candidate independently re-verified
   (`anthropic/claude-fable-5`, the experiments' judge). `confirmed` → minted
   `PTQ-NNNN` in `issues/`; rejections → one `TRIAGE_LOG.md` row, file deleted;
   `questionable` stays in `intake/` as the human queue.
6. **Fix** — open issues clustered by fix surface (D2/D7/D4: the first two
   path segments of the first cited location, split file-disjoint over every
   cited path; D9/D8: the whole HOST FILE — one host, one lane per wave, D9
   before D8 — §"D9 — placement & breakdown" and §"D8 — simplification"
   below);
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
   each drop, until the gate is green again. `store.mjs resolve` then moves
   the review-confirmed issues to `resolved/`; every other issue the lane's
   manifest listed came back unfixed and gets `fix_skips += 1` plus a
   `## Fix attempts` line carrying the fixer's account. At the **second**
   skip the issue is **parked**: moved to `intake/` as `questionable` for a
   human ruling (`accept --note <direction>` keeps its PTQ id and resets the
   skip budget; `reject` retires it) instead of being re-laned every wave.
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
| `TRIAGE_LOG.md` | append-only rejection ledger (re-file prevention; `parked` rows too) | yes |
| `REVIEW_LOG.md` | append-only lens-worker notes, one row per reviewed shard (`store.mjs log-review`) | yes |
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

`reject --verdict human-keep-whole` records the finding's `d9_host ?? d8_host`
in `quality/exemptions.json`, keyed `<lens>:<host>`, with the host's CURRENT
LOC and its class (any other verdict, or a finding naming neither host field,
records nothing there). An existing entry for ANOTHER lens on the same host is
never overwritten — a D9 "do not break this down" ruling never silences D8 and
vice versa. `exemptions.json` is store-owned — it falls under the same
single-writer rule as every other file under `quality/`: only `store.mjs` (via
`accept`/`reject`/`exempt`/`unexempt`) writes it; nothing else under
`.pi/theta/` or a lens worker touches it.
An exempted D9 host is annotated in `size-scan.mjs map` output (D9 entries
only — a D8 exemption on the same host is never annotated there, since
size-scan is D9's mechanical map) and is re-filed only on growth of 25% or
more since the ruling, or a newly named distinct concern.

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

D2's brief was re-scoped when D4/D8 landed: speculative generality and
pass-through wrappers that add no behaviour moved to D8 (they are over-built
but live, not cruft); D2 keeps only redundant re-export files nothing imports
through (deadness).

## D4 — duplication & drift

D4 (`lens-d4-duplication.theta`, `unity-completions/kimi-k2.7-code`) reviews
every file under `src/` for three classes:

- **clone** — a copy-paste block (type-1 exact or type-2 identifier/literal-
  renamed) live in two or more places; `tests/` duplication is D7's.
- **drift** — copies that were once identical and have since diverged: the
  filing names the copy that is right, with evidence, or is capped at
  `questionable` by triage (a human picks the behaviour, never the fixer).
- **parallel** — load-bearing parallel truth that must not drift (a switch
  over one discriminant set mirrored in two passes, a wire encoder/decoder),
  filed only with the counted coverage claim named.

A mechanical pre-scan, `tools/quality/clone-scan.mjs`, token-normalises every
`src/**/*.ts` file and reports maximal clone groups (`map --files <manifest>`)
as the authoritative clone/drift inventory; the model dispositions every group
(FILE or INCIDENTAL, with reason) and hunts the `parallel` class by reading.

**Dual fix contract**: `clone` and `drift` findings are autonomous —
confirmed by triage, dedupe-fixed by the fix phase like D2/D7. `parallel`
findings are capped at `questionable` and ratified by a human exactly like
D9 (`accept --note "RATIFIED: <shared source of truth>"`).

D4 clusters by dirname with file-disjoint parts, like D2/D7 (a dedupe cites
every copy, so the split keeps its lane whole); two D4 lanes that both create
the same NEW helper module are not co-laned — that is what the uncited-file
rebase-and-retry (step 7b) exists for.

## D8 — simplification

D8 (`lens-d8-simplification.theta`, `unity-completions/gemini-3.7-flash`)
reviews every file under `src/` for four classes, each an ACCOUNTING never a
fix (a simpler shape may be named as an explicitly unproven hypothesis; "no
simpler shape identified yet" is legal):

- **overbuilt** — concepts / indirection layers / states / special cases
  disproportionate to the job, counted against real call sites.
- **reimplemented** — a facility `node:*`, the TypeScript API, or an already-
  depended-on package provides, hand-rolled here.
- **against-grain** — API usage fighting the documented intent.
- **heavier-than-scale** — algorithm/data-structure shape vs the measured or
  cited data size at the call sites.

THE SPEC IS THE PIN: a simplification that would drop behaviour a
`docs/spec_topics/` clause requires is a false positive unless the filing
names the clause and argues against it (`challenges_spec: <anchor>`, then a
human-ruling item). D2's precedents (spec-mirroring arms, rationale-stated
knobs, MUST-NOT witness seams) carry over as not-findings. Boundaries: dead
code → D2; host size/breakdown → D9 (a D8 claim on a D9-filed host must be a
DISTINCT over-built claim, cross-referenced); duplication → D4.

**Fix contract**: intake-ratified like D9 (verdict capped `questionable`).
Ruling flow:

```
# ratify the simpler shape: this MINTS the issue (the accept --note IS the ruling)
node tools/quality/store.mjs accept --finding quality/intake/<f> --note \
  "RATIFIED: <the simpler shape>"

# keep the host as-is for a recorded reason: writes a durable per-lens exemption
node tools/quality/store.mjs reject --finding quality/intake/<f> \
  --verdict human-keep-whole --reason "<the concrete reason>"

# defer without recording anything: the host is not re-filed until it changes
node tools/quality/store.mjs reject --finding quality/intake/<f> \
  --verdict human-defer --reason "..."
```

A D8 lane owns its host file exactly like a D9 lane (clustered by `d8_host`'s
path, falling back to the first location's path); a D9 keep-whole ruling on a
host never silences D8 on that same host, and vice versa — both per-lens
exemptions coexist (`exemptions --lens D8` filters to D8's own rulings). The
human is expected to run D8 at `budget <= 5`.

## Extending to more lenses

Add a lens = one surfaces.json entry (+ `shard_loc`) + one worker theta in
`.pi/theta/workers/` (its own `model:` pin — that is why workers are separate
files) + THREE literal touch points in `quality-loop.theta` (the `tools:`
entry, the dispatch arm in the review `par for`, the `has_worker` roster
predicate) + a triage step-4 scope block + a fix-brief rules block.

| lens | reviews | model | fix contract |
|---|---|---|---|
| D2 | cruft in `src/` | `anthropic/claude-sonnet-5` | autonomous |
| D4 | duplication & drift in `src/` | `unity-completions/kimi-k2.7-code` | clone/drift autonomous; parallel intake-ratified |
| D7 | test quality in `tests/` | `anthropic/claude-sonnet-5` | autonomous |
| D8 | simplification in `src/` | `unity-completions/gemini-3.7-flash` | intake-ratified |
| D9 | placement & breakdown in `src/` | `anthropic/claude-fable-5` | intake-ratified |

D1/D6 → fable only, when added.

## Committing note

The repo's parse gate (`tests/committed-fixture-parse-gate.test.ts`) pins exact
counts of committed `.theta`/`.thetalib` files (currently 41/3, including the
`.pi/theta/` loop) — adding or removing a committed theta means bumping the
counts in the same commit.
