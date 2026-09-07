---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "executeFor's drive of evaluateForLoop builds a plan array through a two-method host whose both members are inert, adding no behavior over iterating the snapshot directly"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/statement-executor.ts:2341-2355
  - src/runtime/control-flow.ts:52-63
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# executeFor's drive of evaluateForLoop builds a plan array through a two-method host whose both members are inert, adding no behavior over iterating the snapshot directly

## Observation

`executeFor` evaluates the loop iterand itself (once, at loop entry) and
captures `snapshot`. It then constructs a `ForLoopHost` whose
`evaluateIterand` returns that already-computed `snapshot` and whose
`runIteration` only pushes `{ element }` into a local `plan` array, calls
`evaluateForLoop(host)`, and iterates `plan`. `evaluateForLoop` is a
seven-line function that reads the iterand once and calls `runIteration` per
element in index order, so at this call site the drive reduces to copying
`snapshot`'s elements, in order, into wrapper objects — `plan[i].element ===
snapshot[i]` by construction. This is `evaluateForLoop`'s only caller in
src/, extensions/, and tools/. The sibling loop `evalParFor`, under the same
CTRL-1 snapshot obligation, iterates its snapshot directly without the drive.

## Evidence

src/runtime/statement-executor.ts:2341-2355 — the drive and its consumption:

```ts
  // Drive `V3c`'s real `evaluateForLoop` to fix the iteration order over the
  // snapshot (iterand evaluated exactly once — CTRL-1). The body's effects are
  // async, so the synchronous loop host captures each element in order; the
  // async body walk below honours `break` / `continue`.
  const plan: { readonly element: ThetaValue }[] = [];
  const host: ForLoopHost = {
    evaluateIterand: () => snapshot,
    runIteration: (element) => {
      plan.push({ element });
    },
  };
  evaluateForLoop(host);

  const site = loopIterSite(stmt, deps);
  for (const { element } of plan) {
```

src/runtime/control-flow.ts:52-63 — the entire driven function:

```ts
export function evaluateForLoop(host: ForLoopHost): void {
  // CTRL-1: evaluate the iterand exactly once at loop entry, committing its
  // effect, and capture the resulting `array<T>` snapshot before iterating. A
  // body-side `let mut` reassignment of the iterand source cannot reach this
  // captured reference, so the iterated sequence stays fixed.
  const snapshot = host.evaluateIterand();
  for (let index = 0; index < snapshot.length; index += 1) {
    host.runIteration(snapshot[index] as ThetaValue, index);
  }
}
```

CTRL-1's evaluate-once obligation is discharged before the drive, at
src/runtime/statement-executor.ts:2329-2339:

```ts
  const iterand = await evalExpr(stmt.iterand, env, deps);
  if (iterand.flow !== "value") {
    return terminalFlow(iterand);
  }
  // Bug 0369 belt: a non-array iterand that evaded the parse refusal by static
  // unresolvability must abort loudly, not silently satisfy the loop with a
  // fabricated empty snapshot.
  if (!Array.isArray(iterand.value)) {
    throw new ForIterandKindDefectError(iterand.value);
  }
  const snapshot: readonly ThetaValue[] = iterand.value;
```

Caller count: `grep -rn "evaluateForLoop" src/ extensions/ tools/` — hits only
in src/runtime/control-flow.ts (declaration and its own comments) and
src/runtime/statement-executor.ts (import at 60, comments at 6/2322/2341/2381,
the one call at 2352). Tests call it directly at
tests/control-flow.test.ts:75,100,129 (the V3c seam's own witnesses).

The sibling `evalParFor` under the same CTRL-1 obligation iterates its
snapshot without the drive — src/runtime/statement-executor.ts:1917 captures
`const snapshot: readonly ThetaValue[] = iterandValue;`, 1989 reads
`const n = snapshot.length;`, and the worker at 2010-2035 indexes
`snapshot[index]` directly; no `ForLoopHost` is built.

## Why this is a problem

A redundant pass-through layer at its sole production instantiation. Both
injected host members are inert at this site: `evaluateIterand` cannot
evaluate anything (it returns a constant computed at line 2329, which is where
the evaluate-once property actually holds), and `runIteration` records rather
than runs an iteration (`index` is not even bound). The net effect of the
composition is an element-wise identity copy of `snapshot` into `plan`, which
the very next statement unwraps back to elements — the comment's stated
purpose, "fix the iteration order over the snapshot", is a property direct
array iteration already has. The indirection misleads a reader into thinking
the V3c seam gates the executor's `for` semantics, while the sibling `par for`
path shows the module itself does not route snapshot iteration through that
seam.

## Suggested direction (non-binding, optional)

Iterate `snapshot` directly in `executeFor` (as `evalParFor` already does),
leaving `control-flow.ts` and its witness tests untouched; if the V3c seam
must remain the executor's iteration authority, the host it is handed would
need to carry the real per-iteration work rather than a recorder.

## False-positive check

- Caller enumeration: every `evaluateForLoop` reference in src/, extensions/,
  tools/, and tests/ cited above; the single production call is
  statement-executor.ts:2352. No dynamic or string-keyed dispatch reaches it
  (grep for `"evaluateForLoop"` as a string literal: only comments).
- Not a deadness claim against `evaluateForLoop` / `ForLoopHost`: the V3c
  module has its own witness tests (tests/control-flow.test.ts) and is not
  claimed removable; the claim is confined to the executor-side drive being a
  behavior-free pass-through at its one production site.
- Behavioral equivalence verified by inspection: `evaluateForLoop` performs no
  work besides the two host calls; `evaluateIterand` closes over the
  already-captured `snapshot`; `plan` is consumed only for `element`
  (statement-executor.ts:2355). No await, no catch, no signal read occurs
  inside the drive, so cancellation/checkpoint order is unchanged by inlining.
- Documented-intent check: the module header (statement-executor.ts:6,
  "driving the real `ForLoopHost` / `evaluateForLoop` from `V3c`") states the
  composition is deliberate; noted rather than disputed — the mechanical fact
  filed here is that at this site the composition contributes no behavior, and
  the sibling `evalParFor` discharges the same CTRL-1 obligation without it.
- Git intent: the drive shape (pre-evaluated iterand + recording host) is
  unchanged since the V19c executor landed; no later commit added behavior to
  the host members.

## Triage

