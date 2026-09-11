---
id: PTQ-0105
title: routeDrainStateArm's doc comment states the same two-arm tuple mapping twice in consecutive paragraphs
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/drain-state.ts:40-51
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# routeDrainStateArm's doc comment states the same two-arm tuple mapping twice in consecutive paragraphs

## Observation
The doc comment on `routeDrainStateArm` consists of two paragraphs. Each
states the same three facts: the `(drained, tag)` tuples map onto the closed
two-arm enumeration, arm (b) fires on the `"shutting-down"` tag or on
`(true, undefined)` while arm (a) is the `(false, undefined)` residue, and
there is no third arm per PIC-30. The second paragraph adds no fact, mapping
row, or citation the first does not already carry — even the closing
"(PIC-30)" sentence repeats.

## Evidence
src/extension/drain-state.ts:40-51 — the full doc comment:
```ts
/**
 * Map a `(drained, tag)` snapshot onto the closed two-arm enumeration
 * (PIC-29). The four tuples map: `(false, undefined)` → (a) `"dispatch"`;
 * `(false|true, "shutting-down")` and `(true, undefined)` → (b)
 * `"shutting-down"`. The arms are mutually exclusive and exhaust the tuple
 * state space; no third arm (PIC-30).
 *
 * The mapping keys on the tuple per PIC-29's closed two-arm map: arm (b)
 * `"shutting-down"` fires on the tag `"shutting-down"` or on
 * `(true, undefined)`; arm (a) `"dispatch"` is the steady-state residue
 * `(false, undefined)`. There is no third arm (PIC-30).
 */
```

## Why this is a problem
Duplicated narration inside one doc comment: paragraph two restates paragraph
one's mapping (`(false, undefined)` → dispatch; tag or `(true, undefined)` →
shutting-down), its exhaustiveness claim, and its "no third arm (PIC-30)"
sentence, item for item. The likely mechanism is an edit that rephrased the
paragraph without deleting the original. A reader must diff the two
paragraphs to confirm they agree, and any future change to the mapping must
now be made twice or the comment self-contradicts.

## Suggested direction (non-binding, optional)
Keep whichever paragraph reads better and delete the other.

## False-positive check
Verified both paragraphs against the implementation (:52-57): the function is
`if (snapshot.tag === "shutting-down" || snapshot.drained) return
"shutting-down"; return "dispatch";` — both paragraphs describe it
identically, so neither carries a distinct behavioural nuance (e.g. one is
not about a different call site or edge case). Checked the sibling doc
comments in the file: `shouldShortCircuitShutdown` (:59-70) and the others
each state their predicate once, so this is the file's one doubled block.
Duplicate check against the filed corpus: `grep -rln routeDrainStateArm
quality/` — no match; the filed
`qw20260907130901-d2-03-parse-theta-document-doc-duplicate-paragraph.md` is
about `src/parser` code, and
`qw20260907130901-d2-09-stale-tests-task-stub-narration.md` cites
drain-state.ts:9-11 (the module header), not this comment.

## Triage
verdict: confirmed — excerpt byte-matches at :40-51 with zero drift and the impl is as cited at :52-57; a word-set diff shows para 2's only words absent from para 1 are rephrasings (`fires`/`keys`/`mapping`/`residue`/`steady-state`) while para 1 alone adds `four`/`mutually exclusive`/`exhaust`, so para 2's facts are a strict subset; git 7879011d (bug 0375 degraded-arm excision) proves the residue mechanically — pre-excision para 2 carried a distinct arm-(c) gloss (`fires whenever the tag is degraded-needs-reload (regardless of drained)`) that the commit deleted, leaving pure restatement, so this is excision residue not house style (same shape as the confirmed d2-03); FP-check side-claim `the file's one doubled block` is false (evalShutdownShortCircuitWithReadFailover repeats the PIC-31 rule at doc :73-79 vs inline :85-89) but that neither refutes the finding nor creates a dupe, and no sibling cites :40-51 (d2-03 = src/parser/theta-document.ts, wave d2-09 = session-swap-tripwire.ts, prior d2-09 = drain-state.ts:9-11) (triage: claude-opus-5)
