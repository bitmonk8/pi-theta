# How to watch a running theta

A running theta renders nothing between its binder echo and its final note by
design ([Execution Status](../spec_topics/execution-status.md)) — code-side
tool calls add no conversation turn and subagent-mode callees are
content-unobservable by construction. This how-to is for the operator
watching a theta run **right now**: what the built-in sinks show, how to
change the view shape for this session only, and what to expect on a degraded
host.

## The footer heartbeat

`ctx.ui.setStatus("theta", …)` summarises active invocations from class-1
telemetry (event kinds, counts, timing, source sites, tool *names* — never
tool arguments or results) — [EXST-8](../spec_topics/execution-status.md#exst-8),
[EXST-12](../spec_topics/execution-status.md#exst-12). Expect a line shaped
like:

```
theta: fix-cluster @ workers/fix-cluster.theta:42 (3s) · 2 children, 1 lane running
```

- **`kind @ file:line`** — the current checkpoint site inside the invocation
  ([EXST-4](../spec_topics/execution-status.md#exst-4)).
- **age** — time since the invocation started.
- **children/lanes summary** — subagent children observed via the child-
  activity tap ([EXST-5](../spec_topics/execution-status.md#exst-5)) and
  `par for` lane states (`queued | running | done | err`,
  [EXST-3](../spec_topics/execution-status.md#exst-3)).
- **the `✉`/`✎` segment** — when an author message (a `theta_progress` call,
  L3) has landed recently, the footer appends a short author-message segment
  alongside the telemetry summary; this is class-2 content, clamped and
  rate-gated at the source ([EXST-12](../spec_topics/execution-status.md#exst-12),
  [EXST-14](../spec_topics/execution-status.md#exst-14)).

The footer only shows a working indicator (`ctx.ui.setWorkingMessage`) while a
driven prompt-mode turn is actually streaming — silent tool calls never draw
one.

## The invocation-tree widget

`ctx.ui.setWidget` places a collapsible tree **belowEditor**, height-budgeted
to 6 lines with overflow elided
([EXST-8](../spec_topics/execution-status.md#exst-8)). Verbosity controls what
each line in the tree renders:

- **`tree`** (full) — one line per tracked invocation/child/lane, each showing
  its own `kind @ file:line` and any recent class-2 author message.
- **`min`** — the tree collapses to counts only (no per-line file:line, no
  author messages).
- **`off`** — the widget is not rendered at all.

## Changing the view shape for this session

`/theta-status off|min|tree` adjusts the **view shape** of the running
instance only — it is session-scoped state, reset by `/reload` or a fresh
session, and the handler never persists the choice to any settings file
([EXST-11](../spec_topics/execution-status.md#exst-11)). It does not change
what is captured — only how much of what is already captured is rendered.

This is a distinct axis from the durable `theta.progress` settings key
(below): `/theta-status` never widens what the settings ceiling withholds.

## The durable settings ceiling: `theta.progress`

`theta.progress` is a hand-edited settings key (`.pi/settings.json` or
`~/.pi/agent/settings.json`) taking `"off" | "counts" | "names"`, default
`names` when absent or invalid
([EXST-10](../spec_topics/execution-status.md#exst-10);
[Discovery reference — Settings file reads](../reference/discovery-cli.md#settings-file-reads)).
Unlike `/theta-status`, this key is durable and sets the **telemetry-class
ceiling** every sink renders against:

- `off` — no execution-status sink renders anything; class-2 author messages
  are disabled entirely.
- `counts` — class-1 fields render with tool *names* withheld.
- `names` — the full class-1 field set renders (the default).

## Degraded hosts

Every sink is presence-probed and individually best-effort
([EXST-8](../spec_topics/execution-status.md#exst-8),
[EXST-9](../spec_topics/execution-status.md#exst-9)); a host missing a given
UI surface simply skips it — no diagnostic, no refused theta registration.
`ctx.hasUI` is `true` in TUI and RPC modes and `false` in `--mode json` and
`-p` (`docs/extensions.md` mode table), and is only ever an advisory input:

- **TUI / RPC** — footer heartbeat and invocation-tree widget both render.
- **`--mode json`** — no UI sinks; the durable entry channel (below) is still
  available when the host supports it.
- **`-p` (print mode)** — same as `--mode json`: no UI sinks, entry channel
  only.

A host that supports neither UI surface nor the entry channel simply shows no
progress at all — this is a silent degradation by design, never a diagnostic
or a refused run.

## Where durable milestones land

Accepted `theta_progress` calls in the parent regime append a durable
`theta-progress-entry` entry via `pi.appendEntry`
([EXST-14](../spec_topics/execution-status.md#exst-14),
[Runtime event channel — PIC-71](../spec_topics/pi-integration-contract/runtime-event-channel.md#pic-71)).
These entries are **transcript-clean and LLM-context-free** — they never enter
provider replay and never cost model tokens to render, unlike a custom
message. Each renders as one dim line:

```
progress[ /<theta>][ <scope>]: <message>[ (<done>/<total>)][ (+<n> dropped)]
```

Milestones from a subagent child's own self-report (a wire-ingested
`theta_progress` line) render on transient sinks only — they are never
appended as a durable entry, since untrusted wire data stays off the durable
transcript ([EXST-15](../spec_topics/execution-status.md#exst-15)).

## How operator notes reach you now

Three operator-facing note classes — load/parse/type diagnostic batches,
watcher structural-change notes, and binder-model recovery notes — now
deliver **entry-first**: when the durable entry channel is present, each note
lands as a `theta-progress-entry` with the same verbatim `content` as its
old message-channel form, so the rendered line is unchanged either way
([Runtime event channel — PIC-72](../spec_topics/pi-integration-contract/runtime-event-channel.md#pic-72)).
When the entry channel is absent or its renderer failed to register, the note
falls back to the pre-existing `pi.sendMessage` system-note realisation —
never silently dropped. This entry-first delivery is the principled fix for
bug 0469 (a background one-liner: a watcher-triggered re-scan note landing
mid-turn on the message channel could corrupt provider replay by landing
between an assistant `tool_use` and its `tool_result`; entries never enter
that replay at all).

## Reference

- [Execution Status](../spec_topics/execution-status.md) — the full bus,
  sink, and telemetry-class contract (EXST-1…EXST-15).
- [Discovery / CLI reference — Settings file reads](../reference/discovery-cli.md#settings-file-reads)
  — `theta.progress` key semantics.
- [How to report progress from a theta](./report-progress-from-a-theta.md) —
  the author-facing side of class-2 messages and milestones.

## Provenance

- Footer heartbeat, invocation-tree widget, sink degradation ladder,
  `ctx.hasUI` advisory posture: `docs/spec_topics/execution-status.md`
  EXST-8, EXST-9.
- Checkpoint telemetry, invocation-lifecycle, `par for` lane, and
  child-activity-tap producers: `docs/spec_topics/execution-status.md`
  EXST-3…EXST-5.
- `/theta-status` view-shape override (session-scoped, never persisted):
  `docs/spec_topics/execution-status.md` EXST-11.
- `theta.progress` settings key semantics and default: `docs/spec_topics/execution-status.md`
  EXST-10; `docs/reference/discovery-cli.md` §"Settings file reads".
- Durable `theta-progress-entry` channel, milestone entry shape and
  rendered line template, entry-first delivery of the three operator note
  classes, bug 0469: `docs/spec_topics/pi-integration-contract/runtime-event-channel.md`
  PIC-71, PIC-72.
- Parent-vs-child milestone posture (wire self-reports never become durable
  entries): `docs/spec_topics/execution-status.md` EXST-14, EXST-15.
- RFC context: `docs/rfcs/0010-live-execution-visibility.md`.
