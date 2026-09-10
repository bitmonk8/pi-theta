---
id: PTQ-0084
title: The JSDoc contract for evaluateIndexAccess in runtime-panics.ts is attached to the helper renderIndexOperand that bug 0365 inserted between them
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/runtime-panics.ts:243-274
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The JSDoc contract for evaluateIndexAccess in runtime-panics.ts is attached to the helper renderIndexOperand that bug 0365 inserted between them

## Observation
runtime-panics.ts carries a 21-line JSDoc block (lines 243-263) documenting the
full runtime `[i]` indexed-access contract — the bulleted `target[index]`
disposition table naming `NullIndexAccessPanic`, `IndexOutOfBoundsPanic`,
`NonObjectReceiverError`, and `MissingObjectKeyPanic`. The declaration that
block now attaches to is not `evaluateIndexAccess` but the four-line private
helper `renderIndexOperand` (line 269), which was inserted between the doc and
its subject together with its own `//` comment block. `evaluateIndexAccess`
itself (line 274) has no attached doc comment.

## Evidence
src/runtime/runtime-panics.ts:243-249 — the opening of the stranded contract
doc (the block runs to :263):

```ts
/**
 * Runtime `[i]` indexed access (errors-and-results/error-model.md §"Runtime
 * panics"). `target[index]`:
 *   - `null` target               → `NullIndexAccessPanic` (`[<i>]`);
 *   - array, `i` not an integer in `0..len` → `IndexOutOfBoundsPanic` (`<i> not in 0..<length>`);
 *   - a primitive, an enum value, or a `Result` value → `NonObjectReceiverError`
 *     (`theta/runtime/non-object-receiver`, bug 0027 §Fix — a registered
```

src/runtime/runtime-panics.ts:264-277 — what immediately follows the block's
closing `*/`: the inserted helper (with its own `//` comment) and then the
undocumented `evaluateIndexAccess`:

```ts
// A string index renders QUOTED (JSON.stringify — the bug 0300 precedent) so a
// string cannot masquerade as an in-range integer in the message; an integer
// renders via the category-4 numeric rule (renderInteger), byte-identical to
// the pre-widening message; a non-integer number (1.5, NaN) renders as its
// plain decimal — the honest offending value.
function renderIndexOperand(index: number | string): string {
  if (typeof index === "string") return JSON.stringify(index);
  return Number.isInteger(index) ? renderInteger(index) : String(index);
}

export function evaluateIndexAccess(
  target: ThetaValue,
  index: number | string,
):
```

Pre-insertion state — `git show bd76794f^:src/runtime/runtime-panics.ts`, the
same doc block's tail followed directly by its subject:

```ts
 * rendering categories (`<i>` / `<length>` are category-4 numerics; `<key>` is
 * a category-5 source-derived identifier).
 */
export function evaluateIndexAccess(
```

`git log --oneline -S "renderIndexOperand" -- src/runtime/runtime-panics.ts`
yields exactly one commit: `bd76794f fix(bug-0365): array-index kind discipline
— widened panic + object-index belt — v0.357.0` — the insertion commit.

## Why this is a problem
Leftover narration detached from its subject by insertion — the same
mechanically-provable detachment already filed for other sites
(qw20260907130901-d2-06 for production-theta-producer.ts, qw20260907130901-d2-02
for the three stdlib modules). In the position the block now occupies, an IDE
hover or doc tool attributes the whole indexed-access panic contract (six
disposition bullets, the registry-template sourcing paragraph) to a private
string-rendering helper that implements none of it, while the exported
`evaluateIndexAccess` — one of the module's two accessor seams — reads as
undocumented. Git shows the doc was authored attached to `evaluateIndexAccess`
and the bug-0365 commit inserted `renderIndexOperand` between them without
re-attaching it.

## Suggested direction (non-binding, optional)
Move `renderIndexOperand` (with its own `//` comment) above the JSDoc block, or
below `evaluateIndexAccess`, so the contract doc re-attaches to the function it
describes. Comment/position-only change.

## False-positive check
- Content check: the stranded block's bullets describe `target[index]`
  dispositions (`null` target, array bounds, non-object receiver, missing key,
  member value) — the body of `evaluateIndexAccess` (:274-321), not the
  three-line quoting/rendering helper it precedes; `renderIndexOperand`'s own
  behaviour is separately and correctly described by the `//` block at
  :264-268.
- Tooling check: no jsdoc generator consumes stacked blocks here; the harm is
  reader/IDE attribution, the same basis as the two already-accepted detached-
  doc findings.
- Git intent: single insertion commit `bd76794f` (bug 0365); parent revision
  shows the doc directly above `export function evaluateIndexAccess` —
  insertion-detachment, not deliberate re-attribution.
- Duplicate check: grep over quality/intake for `runtime-panics.ts` shows no
  existing finding citing this file; the two detached-doc findings on file
  cover production-theta-producer.ts and the stdlib trio only.
- Behaviour: nothing behavioural claimed; `evaluateIndexAccess` and
  `renderIndexOperand` are both alive (callers in statement-executor.ts and
  production-theta-producer.ts; `renderIndexOperand` used at :293).

## Triage
verdict: confirmed — excerpts verbatim at 243-263/264-268/269/274 and TS 5.9's own symbol-doc API proves the misattribution (renderIndexOperand carries 1167 chars of the indexed-access contract, evaluateIndexAccess carries 0, evaluateMemberAccess still documented); `git show bd76794f` shows that commit editing the array bullet inside the block while inserting the helper between it and `export function evaluateIndexAccess`, refuting deliberate re-attribution; both functions live (producer:8039, statement-executor:1143, helper at :293), no jsdoc/typedoc in devDeps, no other filing cites this site (triage: claude-opus-5)
