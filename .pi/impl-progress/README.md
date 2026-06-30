# pi-loom implementation harness

Unsupervised, agent-driven implementation of pi-loom from `docs/spec` + `docs/plan`,
with a self-contained progress webpage. Kickstart (or resume) with the
`/loom-implement` command.

## How it fits together

```
/loom-implement  (prompt → the running pi session becomes the ROOT orchestrator)
      │  orchestration only; holds no plan state in memory
      │  re-derives the frontier from git tags every loop
      ▼
loom-leaf-implementer   (one subagent per plan leaf, isolated context)
      │  estimates session fit; if too big, splits and delegates ↓
      ▼
loom-subtask-worker     (one subagent per sub-slice of a large leaf)

loom-impl-cataloguer    (one-time: plain-language names for the webpage)
build-progress.mjs      (deterministic, zero-token: git + plan → progress-data.js)
index.html              (self-contained page; reads progress-data.js, no server)
```

## Why it survives crashes / power loss / resumed sessions

The plan is its own **crash-proof state machine**. The only authoritative
"done" signal is a git tag — `<id>-complete` (or `<id>-T-complete`). Pickability
is recomputed from those tags plus each leaf's `Deps.` by `build-progress.mjs`.
Consequences:

- The root orchestrator keeps **no fragile state**. On every loop it asks the
  script for the frontier. Resuming after an interruption = re-run
  `/loom-implement`; it re-derives exactly where it was.
- Every leaf is **atomic**: nothing is committed-and-tagged until the leaf fully
  ships. An interrupted leaf therefore has no tag and is simply re-picked. Crash
  recovery discards the disposable partial work (`git reset --hard` of the
  production roots) and re-runs that leaf clean.
- `current.json` records the leaf in flight so recovery knows what to discard
  and the page can show "building now".

## Files

| File | Role | Generated? |
|------|------|------------|
| `build-progress.mjs` | Reconstructs all state from git tags + plan; writes `progress-data.js`; `--report` prints the orchestrator frontier JSON | — |
| `index.html` | Self-contained progress page (open via `file://`) | — |
| `progress-data.js` | `window.__LOOM__ = {…}` — the page's data | yes (script) |
| `catalog.json` | Plain-language task/phase names (overrides sanitised titles) | yes (cataloguer) |
| `decisions.jsonl` | Append-only divergence log; one JSON object per line | yes (leaf-implementer, at runtime) |
| `current.json` | The leaf in flight; drives crash recovery + the live page | yes (orchestrator, transient) |

## Viewing progress

Open `.pi/impl-progress/index.html` in any browser. It loads `progress-data.js`
via a `<script>` tag (works on `file://`, no server). The orchestrator
regenerates and commits `progress-data.js` after every leaf, so the page is
current after a `git pull`.

The page shows **only human-meaningful names** — work areas, task names, plain
notes. It never shows leaf ids, requirement codes, or spec/plan jargon.

## Divergence notes

When an implementer must diverge from the literal spec/plan to unblock itself,
it appends a plain-language entry to `decisions.jsonl` (and `notes.md` per the
plan conventions). Those surface on the page under "Notes & decisions made along
the way".

## Regenerating the page manually

```bash
node .pi/impl-progress/build-progress.mjs          # rewrite progress-data.js
node .pi/impl-progress/build-progress.mjs --report # print the frontier JSON
```
