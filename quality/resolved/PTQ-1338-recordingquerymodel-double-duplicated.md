---
id: PTQ-1338
title: RecordingQueryModel QueryModelDriver double reimplemented near-identically in two test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/effectful-statement-host.test.ts:120-136
  - tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:227-242
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# RecordingQueryModel QueryModelDriver double reimplemented near-identically in two test files

## Observation
Both `tests/effectful-statement-host.test.ts` and
`tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts` declare a
module-private class named `RecordingQueryModel` implementing
`QueryModelDriver`, with the same three methods (`nextFreePhaseTurn`,
`runToolBatch`, `forcedRespondTurn`) and the same `serviced` flag semantics.
No canonical `QueryModelDriver` double exists under `tests/helpers/`.

## Evidence
tests/effectful-statement-host.test.ts:120-136:
```ts
class RecordingQueryModel implements QueryModelDriver {
  readonly log: string[] = [];
  serviced = false;
  readonly #turns: readonly FreePhaseTurn[];
  constructor(turns: readonly FreePhaseTurn[]) {
    this.#turns = turns;
  }
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    this.log.push("query:turn");
    const turn = this.#turns[round] ?? { kind: "text", text: "" };
    return Promise.resolve(turn);
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    this.serviced = true;
    this.log.push("query:tool-round");
    return Promise.resolve([]);
  }
```

tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:227-242:
```ts
class RecordingQueryModel implements QueryModelDriver {
  serviced = false;
  readonly #turns: readonly FreePhaseTurn[];
  constructor(turns: readonly FreePhaseTurn[]) {
    this.#turns = turns;
  }
  nextFreePhaseTurn(round: number): Promise<FreePhaseTurn> {
    return Promise.resolve(this.#turns[round] ?? { kind: "text", text: "" });
  }
  runToolBatch(): Promise<readonly CommittedSideEffect[]> {
    this.serviced = true;
    return Promise.resolve([]);
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: null });
  }
}
```
Search: `grep -rn "class RecordingQueryModel" tests/*.test.ts` — 2 hits, the two
cited above.

## Why this is a problem
The constructor signature, the `#turns` private field, the round-indexed
`nextFreePhaseTurn` fallback to `{ kind: "text", text: "" }`, the `serviced`
flag set in `runToolBatch`, and the fixed `forcedRespondTurn` reply are
identical in both files; the only difference is the `log` array
`effectful-statement-host.test.ts` adds for its in-order-execution assertion.
Both drive the same `QueryModelDriver` seam against the same real host
(`createEffectfulStatementHost` / `executeBody`), so this is one fixture
maintained twice rather than two independently-motivated doubles.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` double for `QueryModelDriver` (optionally with the
logging hook as an opt-in constructor parameter) is where both call sites'
common shape already points.

## False-positive check
Recording-double carve-out: this is not a MUST-NOT witness (the class drives
turns forward, it does not assert a call never happened), so the carve-out
does not apply. Searched `quality/issues`, `quality/resolved`, `quality/intake`
for "RecordingQueryModel" — the only hit (PTQ-0594, resolved) covers
`effectful-statement-host.test.ts`'s prior redeclaration of
`invoke-seam-scaffold` no-op exports, a different root cause (already fixed:
the file now imports `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK` from that
helper). No coverage-matrix or bug-doc citation names either `RecordingQueryModel`
class by name. Not a coverage claim: both tests exist and pass; only the
duplicated double is observed.

## Triage
verdict: confirmed — both excerpts reproduce at tests/effectful-statement-host.test.ts:120-139 and tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:227-242 (grep `class RecordingQueryModel` = exactly these 2 hits, both live), identical ctor/#turns/round-indexed empty-text fallback/serviced flag/fixed forcedRespondTurn differing only by the `log` array, and the b0316 copy's own doc comment admits it is "the shape tests/effectful-statement-host.test.ts consumes"; the three tests/helpers/ QueryModelDriver doubles (OpeningModel, RespondingModel = max_rounds:0 loud-throw; ScriptedParent = throws past script, takes forced param, no serviced flag) do not cover this shape so the no-canonical-double claim holds; docs/bugs/0316 line 69 names the class descriptively but is not a witness-list bar on sharing the double; PTQ-0594 (seam no-op scaffold) and PTQ-0844 (b0316 mutator/sink) are different root causes — D7 copy-paste double, in tests/ only (triage: claude-fable-5-1)
