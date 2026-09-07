---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: invoke-depth-cycle comments still count "three" countable frame classes while CountableFrameKind carries four
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/invoke-depth-cycle.ts:7-12
  - src/runtime/invoke-depth-cycle.ts:60-78
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# invoke-depth-cycle comments still count "three" countable frame classes while CountableFrameKind carries four

## Observation
Two comments in `src/runtime/invoke-depth-cycle.ts` state that the INV-4
per-chain depth counter counts "three countable frame classes". The
`CountableFrameKind` union directly beneath the second comment has four
members; the fourth (`"subagent-fn"`, added for RFC 0001) is listed as a fourth
bullet under the doc that still opens with "The three countable frame
classes", and is omitted entirely from the module header's enumeration.
Production pushes the fourth class today.

## Evidence
src/runtime/invoke-depth-cycle.ts:7-12 — the module header enumerates three
and omits `subagent-fn`:
```
//   - INV-4 — the per-chain `invoke`-depth counter. A single per-chain counter,
//     incremented BEFORE the child frame begins executing, counting all three
//     countable frame classes — a direct `invoke(...)` frame, a `.theta`
//     callable frame dispatched through a `tools:` entry, and a *cross-file*
//     `.thetalib` `fn` frame (caller and callee residing in different source
//     files). An intra-file `.thetalib` `fn` call is NOT countable.
```

src/runtime/invoke-depth-cycle.ts:60-78 — the type doc says "three", then
lists four bullets over a four-arm union:
```ts
/**
 * The three countable frame classes that each contribute +1 to the single
 * shared per-chain depth counter (invocation.md §INV-4):
 *   - `"direct-invoke"`       — a literal `invoke(...)` / `invoke<Schema>(...)` call;
 *   - `"theta-tools-callable"` — a `.theta` callable call dispatched through a `tools:` entry;
 *   - `"thetalib-fn-cross-file"`  — a *cross-file* `.thetalib` `fn` call (an intra-file
 *                               `fn` call is NOT countable);
 *   - `"subagent-fn"`          — a `subagent fn` call (RFC 0001 FN-6/INV-4): each
 *                               call spawns a fresh isolated session and, like the
 *                               other classes, contributes exactly +1 to the one
 *                               shared per-chain counter.
 */
export type CountableFrameKind =
  | "direct-invoke"
  | "theta-tools-callable"
  | "thetalib-fn-cross-file"
  | "subagent-fn";
```

The fourth class is live in production:
`pushCountableFrame(chain, "subagent-fn")` at
src/extension/production-theta-producer.ts:3026 and
src/runtime/statement-executor.ts:627.

## Why this is a problem
Historical narration comment with a stated count the current code contradicts:
the "three" wording predates the RFC 0001 `subagent-fn` frame class (the fourth
bullet itself cites RFC 0001 as its origin), and the bullet was appended
without updating either count. A reader trusting the module header's
enumeration gets a three-class counting rule where the enforced set — the
union's four arms, all pushed in production — is four.

## Suggested direction (non-binding, optional)
Update the two counts (and add `subagent-fn` to the module header's
enumeration) so the comments match the four-arm union.

## False-positive check
- Count verification: the `CountableFrameKind` union (invoke-depth-cycle.ts:74-78)
  has exactly four arms; both cited comments say "three"
  (`grep -n "three countable" src/runtime/invoke-depth-cycle.ts` — 2 hits, :8
  and :61).
- Fourth-class liveness: `grep -rn '"subagent-fn"' src/` — pushed at
  production-theta-producer.ts:3026 and statement-executor.ts:627, so the
  fourth class is not itself vestigial (this finding is about the stale count,
  not the arm).
- Intent check: the fourth bullet's own text names RFC 0001 as its origin,
  showing the class landed after the "three" prose was written; no comment in
  the file claims `subagent-fn` is excluded from the count — the bullet says it
  "contributes exactly +1" like the others.
- Duplicate check: the already-filed stale-count findings in this wave
  (`d2-04-interpolation-source-stale-call-site-count`,
  `d2-05-system-note-four-arm-comment-stale`) concern different files and
  different comments; no intake or rejected candidate covers
  invoke-depth-cycle.ts's frame-class count.

## Triage
