---
id: PTQ-0178
title: Two comments in invoke-static-checks.ts say the shared call-site walk "feeds both check loops" of checkInvokeStaticResolution, while the function now runs four loops over that collection and the same file elsewhere calls one of them "a THIRD loop"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:135-144
  - src/extension/invoke-static-checks.ts:1049-1052
  - src/extension/invoke-static-checks.ts:1065
  - src/extension/invoke-static-checks.ts:1223-1226
  - src/extension/invoke-static-checks.ts:1411-1412
  - src/extension/invoke-static-checks.ts:1449-1455
  - src/extension/invoke-static-checks.ts:27-28
sites: 7
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# Two comments in invoke-static-checks.ts say the shared call-site walk "feeds both check loops" of checkInvokeStaticResolution, while the function now runs four loops over that collection and the same file elsewhere calls one of them "a THIRD loop"

## Observation
The `CollectedCallSites` doc comment ends "`checkInvokeStaticResolution`
therefore traverses a body once and feeds both of its check loops from that
one result", and the function body's first comment after the walk says "One
traversal feeds both check loops below". Both sentences date from the bug 0071
commit (f8364db1), when the function had exactly two loops. The function today
iterates the collected sites in four loops: over `invokeExprs` (:1065), over
`resolveThetaCallableCallSites(callSites.callExprs, …)` (:1223), and twice
more over `callSites.callExprs` (:1412, the RFC 0009 Erratum A′ loop; :1455,
the bug 0072 schema-conflict loop). The module header (:27-28) and the
schema-conflict loop's own comment (:1451) already describe that loop as "a
THIRD loop over the SAME call-site collection", so the file carries two
different loop counts for the same construct.

## Evidence
src/extension/invoke-static-checks.ts:135-144 — the interface doc:

```ts
/**
 * The two call-shaped node kinds the shared walk collects in ONE traversal:
 * every `invoke(...)` expression, and every `CallExpr` — a `.theta`-callable-
 * call CANDIDATE whose callee is resolved against the caller's frozen
 * callable set by `resolveThetaCallableCallSites`, not by this walk. One walk
 * keeps the two call surfaces in lockstep: a second, independently written
 * walker would drift out of sync as the `Expr` / `Stmt` node shapes evolve
 * (bug 0071). `checkInvokeStaticResolution` therefore traverses a body once and
 * feeds both of its check loops from that one result.
 */
```

src/extension/invoke-static-checks.ts:1049-1052 — the in-function comment:

```ts
    // One traversal feeds both check loops below (`CollectedCallSites`): the two
    // call surfaces are checked against the same reachable-node set by
    // construction, so neither can be reached by a walk the other misses.
    const callSites = collectCallSites(input.body);
```

The four loops below it (`grep -n "for (const invoke of callSites.invokeExprs)\|for (const site of resolveThetaCallableCallSites(\|for (const call of callSites.callExprs)"` → exactly these four hits):

src/extension/invoke-static-checks.ts:1065

```ts
    for (const invoke of callSites.invokeExprs) {
```

src/extension/invoke-static-checks.ts:1223-1226

```ts
    for (const site of resolveThetaCallableCallSites(
      callSites.callExprs,
      deps.callableSet,
    )) {
```

src/extension/invoke-static-checks.ts:1411-1412 (RFC 0009 Erratum A′)

```ts
    if (deps.callableSet !== undefined) {
      for (const call of callSites.callExprs) {
```

src/extension/invoke-static-checks.ts:1449-1455 (bug 0072 schema-conflict),
whose own comment counts differently from "both":

```ts
    // Bug 0072 — the Pi-tool provable-disjointness check (tool-calls.md
    // §"Provable-disjointness check (parse time)"), a THIRD loop over the SAME
    // `callSites.callExprs` (no new walk; bug 0071 §Fix constraint 3: reuse the
    // shared collection, never fork the walk).
    if (deps.callableSet !== undefined) {
      for (const call of callSites.callExprs) {
```

src/extension/invoke-static-checks.ts:27-28 — the header's count for the same
loop:

```ts
//   - bug 0072 — `theta/parse/tool-arg-schema-conflict`, a THIRD loop over the
//     SAME call-site collection: a Pi-tool call's sole bare-object-argument
```

Blame: `git blame -L 143,143` and `-L 1049,1051` → f8364db1 (2026-08-03, bug
0071). `git show 80fef716 -- src/extension/invoke-static-checks.ts` (bug
0072, 2026-08-04) adds both "THIRD loop" lines and does not touch either
"both" sentence. `git show 96303cc3` (RFC 0009) adds the :1412 loop and
touches neither.

## Why this is a problem
Stale count. "Both" is a definite count of two; the construct it counts has
had three members since 80fef716 and four since 96303cc3, and the same file
states the higher count in two places. The two "both" sentences are the
module's statement of the bug 0071 single-walker invariant — the reason
`CollectedCallSites` exists — so a reader checking that invariant against the
body finds the comment and the code disagreeing on how many consumers the walk
has, and the header disagreeing with the interface doc.

## Suggested direction (non-binding, optional)
State the invariant without a fixed loop count (every check loop in the
function reads the one collection), or keep the count and update it where
loops are added.

## False-positive check
- Counted every loop in `checkInvokeStaticResolution` that reads `callSites`:
  the grep above yields exactly four (:1065, :1223, :1412, :1455); no other
  `callSites.` access exists in the function (`grep -n "callSites\."` → :1065,
  :1224, :1412, :1455 plus the :1452 comment mention only).
- Considered the reading "both call SURFACES' loops": the :1049 sentence says
  "both check loops below", and the :143 sentence says "both of its check
  loops" — both count loops, not surfaces; and the Erratum A′ and
  schema-conflict loops are check loops over the same collection, so the
  count is stale under either reading of "check loop".
- Considered whether "THIRD" at :27/:1451 is itself the stale one: it is
  consistent with the 80fef716-era count of three and, counting only loops
  over `callExprs`, still the third today; it is cited here only to show the
  in-file disagreement, not filed as a separate defect.
- Not a duplicate: no filed finding cites :135-144 or :1049-1052.
  qw20260910054544-d2-01 (doc roster of emitted codes at :989-1028) and
  -d2-02 (module header inventory) have different subjects; this one is the
  loop-count invariant statement.

## Triage
verdict: confirmed — every excerpt reproduces (the :1449-1455 block starts at :1450, one-line drift) and the count is mechanically stale: `grep "callSites\."` at HEAD → exactly :1065/:1224/:1412/:1455 (+ :1452 comment), all four loops push diagnostics so all are check loops fed by the one walk; blame puts both "both" sentences (:143, :1049-1051) at f8364db1, whose file had exactly two loops (:388 `invokeExprs`, :466 `callExprs`), 80fef716 added the third loop plus both "THIRD loop over the SAME call-site collection" lines without touching "both", and 96303cc3 added the :1412 with-clause loop touching neither — the file's own "THIRD" framing counts loops over the collection, not surfaces, which refutes the "two surfaces" reading; not a duplicate (d2-01 counts TYPE checks at :1046-1048 against the :989-1028 roster, d2-02 is the header inventory, no PTQ cites :135-144/:1049-1052), same class as confirmed PTQ-0127's "both" roster and PTQ-0089's two-vs-three (triage: claude-opus-5)
