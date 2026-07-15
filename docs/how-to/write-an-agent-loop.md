# How to write an agent loop

You want an agent to keep working until a job is done — the pattern people call
an *agent loop* or a *Ralph loop*: run the model, check the result, and either
stop or go again. The usual version is a shell `while` loop that re-runs the
model and hopes it eventually declares itself finished. Loom lets you write the
same loop as real code, where **your code owns the stop condition** and the model
only does the open-ended work inside each round.

Loom fits this pattern well because two of its features line up with what the
loop needs:

- **A fresh context each round.** Calling a `mode: subagent` loom spawns a fresh,
  isolated conversation, so each round starts clean instead of dragging the whole
  history along.
- **A typed result to branch on.** The worker returns a typed
  [final value](../reference/errors-and-results.md#final-value-fn-5), so the loop
  decides when to stop by reading a real `boolean` — not by grepping the model's
  prose for a magic "done" string.

## Steps

1. Write the per-round work as a `mode: subagent` worker loom. End it with a
   typed value that says whether the job is complete.
2. Write the loop as a parent loom. Register the worker in `tools:` and call it by
   name (its file stem, hyphens → underscores).
3. Drive the loop with a `while` and a `let mut` counter. Each round: call the
   worker, then branch on its typed result — `return` on success, otherwise let
   the loop go again.
4. Always cap the loop with a round ceiling so a worker that never finishes can't
   spin forever.

## Working example — a Ralph loop

The worker [`docs/examples/ralph-step.loom`](../examples/ralph-step.loom) takes an
`objective`, does one task toward it, and reports whether the objective is met.
State lives on disk (the files it edits, the commits it makes), not in the
conversation:

```loom
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

Read PLAN.md, do the single most important unfinished task toward the objective,
run the test suite with bash, commit the result, and report whether the objective
is now fully met.`?
status
```

The loop [`docs/examples/ralph.loom`](../examples/ralph.loom) takes the same
`objective`, passes it to the worker, and re-runs the worker on a fresh context
until it reports `done`, or until it hits the ceiling:

```loom
---
description: Re-run the worker on a fresh context until the objective is met (a Ralph loop)
mode: subagent
params:
  objective: string
tools:
  - ./ralph-step.loom
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

Run it against a project that has a `PLAN.md`, passing the objective as the
argument:

```
pi --loom docs/examples -p "/ralph get the integration tests passing"
```

Each `ralph_step(objective)` call is a fresh subagent conversation — the worker
never sees the previous round's turns, only the objective it is handed and what it
reads back off disk. The `while` bound, the completion check, and the ceiling are
all ordinary code: the model does the work, your loom decides whether to keep
going.

## Variant — refine until approved

The loop does not have to edit files. This version drafts some text, then loops:
a reviewer subagent judges the draft, and the loop revises until the reviewer
approves or the round budget runs out. It uses only queries and a subagent, so it
runs without any external tools.

Reviewer [`docs/examples/reviewer.loom`](../examples/reviewer.loom):

```loom
---
description: Judge a draft and say whether it is good enough
mode: subagent
params:
  draft: string
---
schema Verdict {
  good_enough: boolean,
  fix: string
}

let v: Verdict = @`Is this draft clear and complete? If not, say what to fix.
Draft:
${draft}`?
v
```

Loop [`docs/examples/refine.loom`](../examples/refine.loom):

```loom
---
description: Improve a draft until a reviewer subagent approves it (bounded)
mode: subagent
tools:
  - ./reviewer.loom
params:
  topic: string
---
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
pi --loom docs/examples -p "/refine how a Ralph loop works"
```

The reviewer runs in its own fresh context each round, so its judgement is not
biased by having written the earlier drafts itself.

## Notes

- The round ceiling is not optional dressing — it is your only guaranteed exit if
  the worker never reports done. Keep it.
- `break` and `continue` work inside the loop if you want to stop early on a
  different signal or skip a round.
- An `invoke` chain is capped at depth **32** (see
  [Hard ceilings](../reference/hard-ceilings.md)). That limit is about *nesting*
  (a worker that invokes a worker that invokes …); a flat loop that calls a worker
  many times in sequence does not nest, so it is not affected.

## Reference

- [Grammar](../reference/grammar.md) — `while`, `let mut`, `break`/`continue`,
  `return`.
- [Errors and results](../reference/errors-and-results.md) — the final value and
  the success / failure / cancellation outcomes.
- [Return a typed value across a subagent boundary](./return-a-typed-value-across-a-subagent-boundary.md)
  — how the worker's typed result reaches the loop.
