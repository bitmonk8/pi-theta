# How to report progress from a theta

You are authoring a theta whose caller (or the operator watching a long
`par for` fan-out) needs a narrative breadcrumb — not just the ambient
telemetry [Watch a running theta](./watch-a-running-theta.md) already
describes, but an author-chosen message and, optionally, a `done`/`total`
count. RFC 0010 layer L3 adds exactly one tool for this: `theta_progress`.

## Add it to `tools:`

`theta_progress` is an ordinarily-registered extension tool — list it like any
other:

```theta
---
description: Fix a lint cluster, reporting milestones along the way
mode: subagent
params:
  manifest: string
tools:
  - bash
  - theta_progress
---
```

It resolves through the same callable-set entry the theta's **model** and its
**code** both use — listing it once lets the worker's own model self-report,
not only your code
([Frontmatter reference](../reference/frontmatter.md), "One extension tool is
registered by pi-theta itself").

## Call shapes

The input schema is exactly `{ message: string, scope?: string, done?:
integer, total?: integer }`, additional properties rejected. A code-side call
takes a bare object literal — legal in this one position, a tool-args
position, unlike elsewhere in theta code:

```theta
theta_progress({ message: "starting cluster fix" })?
```

Add `scope` to disambiguate which sub-task is progressing, and `done`/`total`
for a count a caller-side tree widget can render as `(<done>/<total>)`:

```theta
let clusters: array<string> = manifest.split(",")
let total = clusters.length
let mut fixed = 0
for cluster in clusters {
  // ... fix `cluster` ...
  fixed += 1
  theta_progress({ message: "cluster fixed", scope: cluster, done: fixed, total: total })?
}
```

The call always returns the literal `ok` — even when the rate clamp drops it
(below) or `theta.progress` is `off` — so `?` never surfaces a `theta_progress`
failure from a well-formed call; only a genuinely malformed argument (wrong
field type, an unknown extra field) fails ordinary tool-arg validation like any
other tool call.

## The clamps, as felt behavior

Every accepted call is clamped **before** it renders or is appended anywhere:

- **`message`** is truncated to 200 characters, **`scope`** to 64 — control
  characters and ANSI escapes are stripped first (a tab becomes one space).
  Write short, single-line messages; anything longer is silently cut, not
  wrapped.
- **200 ms minimum inter-acceptance interval**, per extension instance. A call
  arriving inside the window is **counted-but-dropped**: no bus event, no
  entry — but it still returns `ok`, so you cannot detect a drop from the call
  site. The drop count carries forward and rides the *next accepted* call's
  rendering and milestone entry as a `(+<n> dropped)` suffix — so a burst of
  calls inside one interval collapses to one rendered line plus a dropped
  count, not a queue.
- **`theta.progress: off`** turns every call into an uncounted no-op: nothing
  renders, nothing is appended, and the call still returns `ok`. Do not branch
  on the return value to detect this — there is nothing to detect.

## Parent vs. child regime

Where the call executes changes what it does, not what it returns:

- **Parent regime** (no subagent-root marker active) — each accepted call
  produces two effects: one class-2 rendering on the transient sinks (footer
  segment / tree widget line), and one durable `theta-progress-entry`
  milestone via `pi.appendEntry` — transcript-clean, never entering LLM
  context. See [Watch a running theta](./watch-a-running-theta.md#where-durable-milestones-land).
- **Child regime** (running inside a spawned subagent child) — each accepted
  call emits exactly **one** `theta_progress` stdout wire line and touches
  nothing else: no UI surface, no bus publication, no entry append. The
  parent's child-activity tap re-clamps the line defensively and renders it as
  a transient, class-2 event attributed to that child's invocation node — it
  is **never** appended as a durable entry, since a subagent child's own
  self-report is untrusted wire data and stays off the durable transcript.

Because the callable set serves the worker's model as well as its code,
self-reports **from the worker's model** (a model-issued `theta_progress`
`tool_use`) flow through the identical path and the identical clamps as an
author-written call — same 200-char/64-char/200 ms treatment, same
child-regime wire-line-only effect.

## Milestones: one entry per accepted call

A parent-regime accepted call appends exactly one `theta-progress-entry`
milestone — never more than one per call, never batched. If the durable entry
channel is absent or degraded for the session, the milestone arm is **skipped
silently** — it does NOT fall back to a `pi.sendMessage` note. (That
message-channel fallback exists for the three operator note classes only; see
[Watch a running theta](./watch-a-running-theta.md#how-operator-notes-reach-you-now).)
Do not depend on a milestone always landing somewhere — treat it as
best-effort narration, never as a signal your caller relies on for control
flow.

## What not to do

- **Don't call it per-iteration in a tight loop.** The 200 ms rate gate eats
  bursts anyway — calling on every iteration of a fast loop just produces a
  string of counted-but-dropped calls collapsing into one rendered line with a
  large `dropped` count. Call at natural milestones (cluster boundaries, batch
  completions), not per-element.
- **Never put content-class-3 material in `message` or `scope`.** Prompt
  text, tool arguments, tool results, and thinking are class 3 and MUST NOT be
  surfaced on any execution-status sink at any verbosity — `theta_progress`'s
  own `message`/`scope` fields are author-chosen class-2 narration, not a
  channel for smuggling raw content through. Keep it to short human-readable
  status, not a dump of what a tool call returned.

## Reference

- [Watch a running theta](./watch-a-running-theta.md) — the operator side of
  the same sinks and entries.
- [Execution Status](../spec_topics/execution-status.md) — the full producer,
  clamp, and telemetry-class contract.
- [Frontmatter reference](../reference/frontmatter.md) — `tools:` resolution
  and the `theta_progress` registration note.

## Provenance

- `theta_progress` tool registration, input schema, always-`ok` return, and
  code/model shared callable-set entry: `docs/spec_topics/execution-status.md`
  EXST-13; `docs/reference/frontmatter.md` "One extension tool is registered
  by pi-theta itself".
- Parent-regime two-effect execution and the class-2 clamp values (200/64
  chars, 200 ms, counted-but-dropped with dropped-carry, `theta.progress: off`
  no-op): `docs/spec_topics/execution-status.md` EXST-14.
- Child-regime wire-only execution and the parent tap's re-clamp/no-relay
  posture: `docs/spec_topics/execution-status.md` EXST-15;
  `docs/spec_topics/pi-integration-contract/subagent.md` PIC-74.
- Milestone entry shape, one-entry-per-call, skip-silently-when-degraded
  (no message-channel fallback for milestones): `docs/spec_topics/pi-integration-contract/runtime-event-channel.md`
  PIC-71.
- Three-class telemetry partition (class-1 telemetry / class-2 author
  messages / class-3 content) and the class-3 surfacing prohibition:
  `docs/spec_topics/execution-status.md` EXST-12.
- RFC context: `docs/rfcs/0010-live-execution-visibility.md` (L3 author
  surface, hold gate discharged 2026-09-09).
