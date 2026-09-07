---
id: pending
title: PiTokenEstimator's one-line method body carries a three-line comment restating the module header three lines above it
lens: D2
status: intake
verdict: pending
locations:
  - src/seams/pi-token-estimator.ts:3-7
  - src/seams/pi-token-estimator.ts:18-20
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# PiTokenEstimator's one-line method body carries a three-line comment restating the module header three lines above it

## Observation
`src/seams/pi-token-estimator.ts` is 23 lines. Its module header states three
facts about the adapter: it delegates `estimate(message)` to the `estimateTokens`
named import, returns that import's result unchanged, redefines none of Pi's
estimation algorithm, and is relied on as a deterministic pure function of
`message` at a fixed Pi-SDK pin. The class's only method, a one-statement
`return estimateTokens(message);`, is preceded by a three-line comment asserting
the same three facts in the same order. Nothing in the body comment is absent
from the header.

## Evidence
src/seams/pi-token-estimator.ts:3-7 — the header:

```ts
// Production wiring delegates `estimate(message)` to the `estimateTokens` named
// import from `@earendil-works/pi-coding-agent`, forwarding the message and
// returning the import's result unchanged — redefining none of Pi's estimation
// algorithm. The seam is relied on as a deterministic pure function of its
// `message` argument at a fixed Pi-SDK pin.
```

src/seams/pi-token-estimator.ts:16-22 — the class, the body comment, and the
statement it annotates:

```ts
export class PiTokenEstimator implements TokenEstimator {
  estimate(message: AgentMessage): number {
    // Delegate to Pi's pinned `estimateTokens`, returning its result unchanged
    // — theta redefines none of Pi's estimation algorithm. Relied on as a
    // deterministic pure function of `message` at the fixed Pi-SDK pin.
    return estimateTokens(message);
  }
}
```

Fact-by-fact correspondence, header clause → body clause:

- "delegates `estimate(message)` to the `estimateTokens` named import" →
  "Delegate to Pi's pinned `estimateTokens`";
- "returning the import's result unchanged — redefining none of Pi's estimation
  algorithm" → "returning its result unchanged — theta redefines none of Pi's
  estimation algorithm";
- "relied on as a deterministic pure function of its `message` argument at a
  fixed Pi-SDK pin" → "Relied on as a deterministic pure function of `message`
  at the fixed Pi-SDK pin".

## Why this is a problem
Two independently maintainable statements of one fact separated by ten lines in
a 23-line file. The body comment adds no clause the header does not carry and
annotates a statement whose whole content is the delegation the header
describes, so a change to the delegation contract has two places to reach with
nothing distinguishing which is authoritative.

## Suggested direction (non-binding, optional)
The header is the copy a reader of the seam encounters first; the body comment
is the one whose content is fully contained in it.

## False-positive check
- Checked whether the body comment carries an extra fact the header lacks: the
  three clauses map one-to-one as listed above; no term appears in the body
  comment that is absent from lines 3-7.
- Reference search for other consumers of this text: `grep -rn
  "PiTokenEstimator" --include=*.ts src/ tests/ tools/` — the production import
  (`src/extension/production-composition.ts:100`, constructed at `:400`) and
  `tests/watch-token-seams.test.ts`; neither reads the module's source text, so
  no tool depends on either comment.
- Verified the file's own content: the module is 23 lines total with one class,
  one method, one statement — the duplication is not separated by intervening
  code that would give the body comment local context the header cannot supply.
- Verified the claims themselves are true (so this is redundancy, not
  staleness): `estimateTokens` is a named import from
  `@earendil-works/pi-coding-agent` at :12 and the method returns its result
  directly at :21.
- Not filed as dead code: the class has a production caller
  (`production-composition.ts:400`).

## Triage
