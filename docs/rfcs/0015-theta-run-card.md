# RFC 0015 — The theta run card: a live in-transcript script heatmap

- **Status:** draft (design settled with the operator 2026-09-22; no code).
- **Scope:** a TUI-only progress surface for running thetas — a custom
  transcript entry that renders the executing script with lexer-backed syntax
  highlighting, a time-decaying per-line execution heatmap, running-subagent
  markers, and an active-children roster. Touches the runtime (a statement
  trace seam), the execution-status bus (heat ring, launch-site attribution),
  the entry channel, and the interactive rendering layer. Supersedes the
  RFC 0010 footer and widget sinks in TUI (decision 4 below).
- **Does NOT touch:** print/json observability (RFC 0007 surfaces unchanged),
  the theta-system-note channel's LLM-context content, the `/status` command,
  cancellation semantics (the checkpoint seam is read, not altered).
- **Depends on:** RFC 0010 (shipped): the execution-status bus, its snapshot
  types, and the EXST-6 coalesced render tick are the substrate.

## Problem

RFC 0010 shipped three progress surfaces: a one-line status footer below the
editor, an optional 6-line tree widget, and system notes (`Running /<name>:
<args>`) in the transcript. They answer "is something running and roughly
where", but none show *the program itself*. For a 600-line orchestration
theta a footer line is a keyhole: the operator cannot see which statement is
executing, what ran recently, which `invoke` sites currently hold live
subagents, or how execution moves through the script. The transcript message
is a static arg echo, truncated, and permanently stale one second after the
drive starts.

## Proposal

One **run card** per top-level theta drive: a custom entry
(`pi.appendEntry("theta-run", …)` + `pi.registerEntryRenderer`) appended at
drive start, whose renderer is a live view over execution-status bus state.

A custom entry — not a tool row, not an overlay — because:

- a theta drive is not a tool call in the driving session; a synthetic tool
  row would inject model-visible messages the model never produced;
- entries are durable transcript rows that do NOT participate in LLM context;
- entries receive the same Component rendering API, and the extension can
  invalidate + `tui.requestRender()` on its existing tick;
- an overlay (the widget-sink approach) competes with editor space and does
  not scroll with history.

Entry data is the static seed: `{ invocationId, theta, argsSummary,
startedAtMs, sourcePath }`. While the bus tracks `invocationId` the renderer
renders live; when the bus no longer knows it (drive ended and evicted, or
session restarted) it degrades to a static compact summary from the entry
data.

### Card anatomy

```
⟳ /quality-loop · 4m32s · cp 1.2k · iters 38 · 3 children      ← header
/quality-loop ▸ /fix-cluster                                    ← breadcrumb (nested invoke only)
  138   let picked = clusters.take(cluster_max)                 ← 24-line viewport,
  139                                                              lexer-highlighted,
  142 ▶ let r = invoke<FixResult>(fix_cluster, {…})  ⑂ 2m11s · 14 turns · bash
  ...                                                              heat-fading backgrounds
  children:
    ⑂ fix-cluster (src__parser)   2m11s  14 turns · 41 tools · bash   [line 142]
    ⑂ review-fix                    12s   1 turn  ·  3 tools · read   [line 198]
```

- **Header**: name, elapsed, checkpoint/iteration counters, child count —
  from `InvocationNodeSnapshot`.
- **Viewport**: 24 source lines (collapsed), sticky-centered on the current
  statement — recenter only when the current line leaves the middle third,
  so the view does not jitter. `{expanded}` renders the full script. Gutter
  line numbers; the current line gets `▶` and a bold number.
- **Children roster**: one line per active child (insertion order, capped ~8
  + `+N more`): glyph, theta name + scope tag, elapsed, `ChildActivity`
  (turns · toolExecs · lastToolName) or `live in <placement>`, and the
  launch-line cross-reference. Ended children linger `DONE_LINGER_MS` with
  `✓`/`✗` then drop (bus behaviour, already shipped).
- **Author messages**: the newest `theta_progress` payload per node renders
  as a row under the header (the footer used to carry these; decision 4).

### Syntax highlighting — lexer-backed

Highlight from real `lexTheta` output (`src/lexer/lexer.ts`): lex the script
once at card creation (source is immutable for the run), map token kinds to
theme fg roles, cache a styled-line array per file on the component. The
heat pass only re-styles backgrounds per frame. Use the shared inert
note-channel helper (the PTQ-1237 consolidation) — a running script already
lexed clean, and LexResult diagnostics are ignored here. Implementation-time
check: if the lexer skips comment trivia, comment spans are recovered as the
unclaimed gaps between token ranges.

### Heat model — continuous truecolor fade

- Data: per-invocation heat ring `Map<(file, line), { lastHitMs, hits,
  dwellMs, kind }>`, capacity-bounded (~256 entries, LRU evict).
- Intensity: `α = exp(-age / τ)` with `τ ≈ 1.3 s` over a `FADE_MS ≈ 4 s`
  window (single tunable; exponential decay reads more organic than linear).
- Color: blend `defaultBg → heatBg` by α **in OKLab** (naive sRGB lerp goes
  muddy mid-ramp), emitted as truecolor ANSI backgrounds. Endpoints from the
  theme's raw hex values; precompute a 64-step LUT at theme load /
  `invalidate()` — zero per-frame color math. If the terminal lacks
  truecolor, quantize the LUT to xterm-256 at emit (or rely on pi-tui
  downsampling if it does — implementation-time check).
- Multiple simultaneously hot lines are natural (par-for lanes); the ring
  records all, the viewport centers on the newest.

### The trace seam — every statement, not just effects

Checkpoints (`checkpoint.before(kind, site)`) exist for cancellation
semantics and fire only at the five effect kinds; riding them alone would
leave pure computation lines permanently dark. That is a convenience gap,
not a technical one: every statement node carries `range` (the executor
already builds `{file, line, column}` from `stmt.range` for panic sites).

Add an optional **trace seam** on the executor deps:

```
deps.trace?.(site: CheckpointSite, kind: "stmt")
```

called at statement dispatch. The checkpoint ingest path enriches effect
lines with their checkpoint kind (`query`, `tool-call`, `invoke`,
`binder-call`, `loop-iter`) so the gutter can distinguish effects. Ingest is
an O(1) map upsert; rendering stays coalesced on the 200 ms tick, so tight
pure loops rewrite a few keys with no event-flood path. The seam is an
optional function: absent in print/json/child compositions, the cost is one
undefined-check per statement. A side effect that is a feature: fast pure
sequences smear a warm trail across the lines they raced through.

### Running-subagent markers

The background channel is reserved for heat (two competing background
semantics read as noise). Launch lines of currently-running children are
marked orthogonally:

- gutter glyph `⑂` in the theme accent color;
- callee name bold;
- right-aligned live badge: child elapsed · turns · lastToolName, or the
  lane summary for par-for over subagents (`⑂ 4/6 lanes · 2 done · 0 err`).

Requires **launch-site attribution**: record the parent's `invoke` /
`binder-call` site into the child node at spawn
(`InvocationNodeSnapshot.launchSite?: CheckpointSite`).

### Nested theta invokes — the viewport follows

One card per top-level drive. When execution enters another theta via
`invoke`, the viewport switches to the callee's source with a breadcrumb
(`/quality-loop ▸ /fix-cluster`), returning on completion. A dwell threshold
(~500 ms inside the callee before switching) damps tight call loops. Hence
the heat ring's `(file, line)` key and the per-file styled-line cache.

### Animation

No new timer machinery. The EXST-6 coalesced 200 ms tick already drives the
status surfaces; the entry-channel sink additionally invalidates the card
component + `tui.requestRender()` on the same cadence while (a) any heat
entry is younger than `FADE_MS`, or (b) any child is running. 4 s fade at
200 ms ticks = 20 frames over a 64-step LUT — visually continuous. When
idle, ticking stops; the final render is static.

### Terminal heat-summary entry (gated)

When a drive ends after ≥ ~30 s (tunable), append a `theta-run-summary`
entry: outcome (ok/err/cancelled), elapsed, counters, children spawned, and
a static where-time-went intensity ramp from the accumulated per-line
hits/dwell. A durable per-run profile artifact in the session history that
survives restarts (bus state does not). Short utility drives append nothing.

## Decisions (operator-ratified, 2026-09-22)

1. Fade: 4 s window, exponential τ ≈ 1.3 s; one tunable constant.
2. Color: continuous truecolor, OKLab-blended 64-step LUT (no quantized
   fallback mode as a design tier; xterm-256 only as emit-time degradation).
3. Viewport: 24 lines collapsed, full script on expand.
4. **The card supersedes BOTH the footer-sink and the widget-sink in TUI** —
   nothing pinned below the editor. The scroll-away gap (new turns push the
   card off-view; nothing then signals a running theta) is ACCEPTED: at the
   tail the live turns are themselves the signal; scroll up for the card.
   `/status` and non-TUI surfaces unaffected.
5. The `Running /<name>` system note is **hidden in TUI entirely** (message
   renderer returning empty). Unchanged as LLM context and in print/json —
   model visibility and live-test observables intact.
6. Nested invokes: one card, viewport follows with breadcrumb + dwell.
7. Terminal heat-summary entry: yes, gated ≥ ~30 s.
   *Re-ruled (operator, 2026-09-23):* **default OFF** — no `theta-run-summary`
   entry is appended unless the operator opts in via the validated settings
   key `theta.runSummary` (boolean, either scope, default `false`). When
   opted in, the ≥ ~30 s gate applies unchanged. The entry kind, renderer,
   and constants are retained; the opt-in gates the append only.

## Modes and degradation

- TUI only (`ctx.mode === "tui"`). Print/json keep RFC 0007 surfaces; the
  trace seam is not wired in those compositions.
- Session restart / reattach: bus state gone → static compact card from
  entry data (+ the terminal summary if the drive finished before restart).
- Subagent-child sessions: cards render in the session that drives the
  theta; a child theta's card lives in the child's own (private) transcript.
- `MAX_TRACKED_INVOCATIONS` overflow: untracked drives get no card
  (unchanged from today's untracked handling).

## Alternatives considered

- **Synthetic tool row** (`renderCall`/`renderResult`, per-row
  `invalidate()`): rejected — fakes a model-visible tool call.
- **Overlay / `ctx.ui.custom()`**: rejected as primary surface — does not
  scroll with history, competes with editor space; it is what widget-sink
  already was.
- **Checkpoint-only heat** (no trace seam): rejected — pure statements never
  light up; the operator asked for the program, not just its effects.
- **Quantized theme-role heat buckets**: rejected by decision 2.
- **Regex highlighter**: rejected — we own the lexer; token-accurate
  highlighting from the start.
- **Keeping a minimal footer for the scroll-away gap**: offered, declined
  (decision 4) — accepted gap.

## Open questions

- Theme API: does the interactive theme object expose raw hex values, or
  must the LUT builder read the theme JSON?
- Truecolor capability: does pi-tui downsample truecolor for non-truecolor
  terminals, or must the LUT quantize at emit?
- Lexer trivia: are comments tokens or gaps?
- Entry shell: do entry renderers need a `renderShell: "self"` equivalent
  for full-width background rows, or does the default entry chrome permit
  them?
