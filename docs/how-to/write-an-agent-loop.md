# How to write an agent loop

You want an agent to keep working until a job is done — the pattern people call
an *agent loop* or a *Ralph loop*: run the model, check the result, and either
stop or go again. The usual version is a shell `while` loop that re-runs the
model and hopes it eventually declares itself finished. Theta lets you write the
same loop as real code, where **your code owns the stop condition** and the model
only does the open-ended work inside each round.

Theta fits this pattern well because two of its features line up with what the
loop needs:

- **A fresh context each round.** A `subagent fn` — a `fn` with the `subagent`
  modifier (theta 1.2) — spawns a fresh, isolated conversation on every call, so
  each round starts clean instead of dragging the whole history along.
- **A typed result to branch on.** The worker returns a typed
  [final value](../reference/errors-and-results.md#final-value-fn-5), so the loop
  decides when to stop by reading a real `boolean` — not by grepping the model's
  prose for a magic "done" string.

The per-round worker and the loop that drives it live in **one file**: the worker
is a `subagent fn` at the top of the theta, and the loop is ordinary code below
it. (Before theta 1.2 the worker had to be its own `mode: subagent` file, because
a single file's `@` queries all append to one growing conversation; see
[Two-file variant](#variant--two-file-split-pre-12) below.)

## Steps

1. Write the per-round work as a `subagent fn` at the top of the theta. Its body
   runs in a fresh spawned session, so its `@` query does not accumulate context
   across rounds. End the body with a typed value that says whether the job is
   complete.
2. Drive the loop with a `while` and a `let mut` counter in the same file. Each
   round: call the `subagent fn` by name with positional arguments, then branch on
   its typed result — `return` on success, otherwise let the loop go again.
3. Optionally give the spawned session its own configuration with a `with { … }`
   clause on the `subagent fn`; keys you omit inherit from the enclosing theta.
4. Always cap the loop with a round ceiling so a worker that never finishes can't
   spin forever.

## Working example — a Ralph loop

[`docs/examples/ralph-inline.theta`](../examples/ralph-inline.theta) is the whole
loop in one file. The `subagent fn step` is the per-round worker: each call spawns
a fresh isolated session, does one task toward the objective, and returns a typed
`Progress`. Each round is a child process (RFC 0012 §10) — the per-round
startup cost is the price of a clean context and of one execution model. State
lives on disk (the files it edits, the commits it makes), not in
any conversation. The `with { … }` clause overrides two session-config keys for
the spawned session — it narrows the tools and sets a private system prompt —
while the keys it omits (`model`, `tool_loop`, `respond_repair`) still inherit
from the enclosing theta:

```theta
---
description: Re-run a fresh-context step until the objective is met (a single-file Ralph loop)
mode: subagent
params:
  objective: string
tools:
  - read
  - bash
---
schema Progress {
  done: boolean,
  summary: string
}

subagent fn step(objective: string) with {
  tools: [read, bash],
  system: "Do exactly one task toward the objective per turn, then stop and report."
} {
  let status: Progress = @`Objective: ${objective}

Inspect the current state of the project, do the single most important unfinished
task toward the objective, run the test suite with bash, commit the result, and
report whether the objective is now fully met.`?
  status
}

let mut round = 0
while round < 20 {
  round += 1
  let status = step(objective)?
  if status.done {
    return status.summary
  }
}
"stopped at the 20-round ceiling"
```

Run it inside a project, passing the objective as the argument:

```
pi --theta docs/examples -p "/ralph-inline get the integration tests passing"
```

Each `step(objective)` call is a fresh subagent conversation — the worker never
sees the previous round's turns, only the objective it is handed and what it reads
back off disk. The `while` bound, the completion check, and the ceiling are all
ordinary code: the model does the work, your theta decides whether to keep going.

## Variant — refine until approved

The loop does not have to edit files. This version drafts some text, then loops:
a reviewer subagent judges the draft, and the loop revises until the reviewer
approves or the round budget runs out. It uses only queries and a subagent, so it
runs without any external tools.

Here the loop body queries the enclosing conversation directly (drafting and
revising), and only the review step needs isolation — so the reviewer is an inline
`subagent fn` with no `with` clause, inheriting the enclosing theta's
configuration. The whole thing is one file,
[`docs/examples/refine-inline.theta`](../examples/refine-inline.theta):

```theta
---
description: Improve a draft until an isolated reviewer subagent approves it (bounded)
mode: subagent
params:
  topic: string
---
schema Verdict {
  good_enough: boolean,
  fix: string
}

subagent fn reviewer(draft: string) {
  let v: Verdict = @`Is this draft clear and complete? If not, say what to fix.
Draft:
${draft}`?
  v
}

let mut draft = @`Write a one-paragraph explanation of: ${topic}`?
let mut round = 0
while round < 5 {
  round += 1
  let verdict = reviewer(draft)?
  if verdict.good_enough {
    return draft
  }
  draft = @`Revise the paragraph to fix this: ${verdict.fix}
Current draft:
${draft}`?
}
draft
```

Run it:

```
pi --theta docs/examples -p "/refine-inline how a Ralph loop works"
```

The reviewer's `@` query targets its own spawned session, not the loop's
conversation, so its judgement each round is not biased by having written the
earlier drafts itself. The drafting and revising queries stay in the enclosing
conversation, where the draft-so-far context is exactly what you want.

## Variant — two-file split (pre-1.2)

Before theta 1.2 there was no `subagent fn`, so the fresh-context worker had to be
its own `mode: subagent` file, registered in the loop's `tools:` and called by its
file stem (hyphens → underscores). The split still works and is equivalent; the
single-file `subagent fn` form above is the same worker without the second file.

Worker [`docs/examples/ralph-step.theta`](../examples/ralph-step.theta):

```theta
---
description: Do the next task toward the objective on a fresh context, then report status
mode: subagent
params:
  objective: string
tools:
  - read
  - bash
---
schema Progress {
  done: boolean,
  summary: string
}

let status: Progress = @`Objective: ${objective}

Inspect the current state of the project, do the single most important unfinished
task toward the objective, run the test suite with bash, commit the result, and
report whether the objective is now fully met.`?
status
```

Loop [`docs/examples/ralph.theta`](../examples/ralph.theta), which registers the
worker in `tools:` and calls it by name:

```theta
---
description: Re-run the worker on a fresh context until the objective is met (a Ralph loop)
mode: subagent
params:
  objective: string
tools:
  - ./ralph-step.theta
---
let mut round = 0
while round < 20 {
  round += 1
  let status = ralph_step(objective)?
  if status.done {
    return status.summary
  }
}
"stopped at the 20-round ceiling"
```

Reach for the split when the worker is large enough to deserve its own file, when
more than one theta needs the same worker, or when the worker is also useful as a
slash-discoverable callable in its own right — a `subagent fn` is never
discoverable and is reachable only from within its own file (or, for a
`.thetalib` helper, from an importer).

## Notes

- The round ceiling is not optional dressing — it is your only guaranteed exit if
  the worker never reports done. Keep it.
- `break` and `continue` work inside the loop if you want to stop early on a
  different signal or skip a round.
- A `subagent fn` call is a countable frame under the depth-**32** `invoke`
  ceiling (see [Hard ceilings](../reference/hard-ceilings.md)). That limit is about
  *nesting* (a worker whose spawned session invokes another worker, and so on); a
  flat loop that calls the same `subagent fn` many times in sequence does not
  nest, so it is not affected.
- A `subagent fn` cannot reference itself; a self-reference is rejected at load as
  a length-1 invocation cycle (`theta/load/invocation-cycle`). Recurse by looping,
  as above, not by self-call.
- A `subagent fn` may also be called from a `mode: prompt` theta — the spawned
  session is always a fresh isolated conversation, so this is the safe direction.
  A `with { system: … }` clause is legitimate there even though a prompt-mode
  theta cannot carry `system:` in its own frontmatter.

## Reference

- [Grammar — `fn` declarations](../reference/grammar.md#fn-declarations) — the
  `subagent` modifier and the `with { … }` session-config clause; also `while`,
  `let mut`, `break`/`continue`, `return`.
- [Functions — FN-6…FN-9](../spec_topics/functions.md#subagent-fn) — `subagent fn`
  isolation, argument-by-value, typed return, query targeting, session config, and
  the self-reference ban.
- [Errors and results](../reference/errors-and-results.md) — the final value and
  the success / failure / cancellation outcomes.
- [Return a typed value across a subagent boundary](./return-a-typed-value-across-a-subagent-boundary.md)
  — how the worker's typed result reaches the loop.
- [How to fan out in parallel](./fan-out-in-parallel.md) — the breadthwise
  counterpart: many workers at once instead of one worker re-run in sequence.
- RFC: [`docs/rfcs/0001-subagent-fn.md`](../rfcs/0001-subagent-fn.md) (accepted).
