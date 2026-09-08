---
id: PTQ-0083
title: err-field-summary.ts comments pin line numbers into runtime-panics.ts and wire-translation.ts that no longer point at the code they name
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/err-field-summary.ts:8
  - src/runtime/err-field-summary.ts:30
  - src/runtime/err-field-summary.ts:91
sites: 3
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# err-field-summary.ts comments pin line numbers into runtime-panics.ts and wire-translation.ts that no longer point at the code they name

## Observation
The bug-0177 rationale comments in `err-field-summary.ts` cite three
cross-module positions by hard line number: the null-prototype record mint in
`rebuildInbound` (`wire-translation.ts:370`) and `summariseNonResultOperand`'s
definition and proxy-case doc (`runtime-panics.ts:440` and `:435-439`). All
three targets have since moved; the cited lines now sit inside unrelated code
or unrelated doc-comments. Two sibling citations in the same file
(`match-result.ts:88-89`, `value.ts:112-120`) still point at the code they
name, so the drift is per-target, not a uniform offset a reader could correct
for.

## Evidence
src/runtime/err-field-summary.ts:8 — cites `:370` for the null-prototype mint:
```ts
// (`Symbol.toPrimitive`, then `toString`, then `valueOf`): a plain-prototype
// record finds `Object.prototype.toString` and yields the uninformative
// `[object Object]`; a null-prototype record (the shape
// `rebuildInbound` mints since bug 0173, `wire-translation.ts:370`) finds none
```
Current wire-translation.ts:370 is mid-comment inside `rebuildInbound`'s
fresh-record rationale ("...`$ref`-target arm above, or through the name-match
arm below, both of..."); the null-prototype mint is at
src/runtime/wire-translation.ts:398:
```ts
  const result: { [k: string]: ThetaValue } = Object.create(null) as { [k: string]: ThetaValue };
```

src/runtime/err-field-summary.ts:30 — rule 5 cites `:440` for
`summariseNonResultOperand`:
```ts
//      output exceeds a 200-character cap — the value renders as
//      `summariseNonResultOperand`'s capped descriptor instead
//      (`src/runtime/runtime-panics.ts:440`).
```
Current runtime-panics.ts:440 is inside the `QuestionOperandDefectError`
doc-comment ("framed via `surfaceUnexpectedThrow`), so the gap fails loudly
instead of"); `summariseNonResultOperand` is defined at
src/runtime/runtime-panics.ts:526:
```ts
export function summariseNonResultOperand(value: ThetaValue): string {
```

src/runtime/err-field-summary.ts:91 — cites `:435-439` for the proxy-case doc:
```ts
 * same fails-loud posture `summariseNonResultOperand` documents for its own
 * proxy case (`src/runtime/runtime-panics.ts:435-439`).
```
Current runtime-panics.ts:435-439 is the middle of the same unrelated
`QuestionOperandDefectError` doc-comment; the proxy-case sentence lives in
`summariseNonResultOperand`'s own doc at src/runtime/runtime-panics.ts:520-524:
```ts
 * list capped at four names). Never throws or mutates on any plain-data
 * `ThetaValue`; an exotic proxy receiver whose traps throw from the key walk
 * fails into the same top-level `theta/runtime/internal-error` surface this
 * defect targets, so the abort stays loud either way.
```

Control (accurate neighbours in the same file, showing per-target drift):
err-field-summary.ts:25 cites `match-result.ts:88-89`, which is still
`summariseScrutinee`'s compact-`JSON.stringify` arm, and :81 cites
`value.ts:112-120`, which is still the `ThetaValue` union.

## Why this is a problem
Hard-pinned line citations are cruft once the target moves: they now direct a
reader to unrelated code (`:440` lands in the `QuestionOperandDefectError`
doc-comment, `:370` in a different `rebuildInbound` comment), which is worse
than no citation because it asserts a wrong location with false precision.
This is the same drifted-line-citation class already confirmed for other
modules (e.g. qw20260907130901-d2-02-wire-walk-line-citations-drifted, which
covers wire-form-depth-walk.ts's and wire-translation.ts's own comments —
none of its six sites are in err-field-summary.ts).

## Suggested direction (non-binding, optional)
Replace the three stale numbers with symbol-anchored references
(`rebuildInbound`'s record arm; `summariseNonResultOperand` and its doc), or
refresh the numbers — matching whatever convention the earlier
citation-drift fixes settle on.

## False-positive check
- Read the cited targets at their current lines: wire-translation.ts:362-378
  (a doc-comment, no `Object.create(null)`), runtime-panics.ts:430-445 (the
  `QuestionOperandDefectError` doc-comment, no `summariseNonResultOperand`).
- Located the real targets: `grep -n "Object.create(null)"
  src/runtime/wire-translation.ts` → :398 (plus :656/:722 in other functions —
  :398 is the `rebuildInbound` record arm the comment names);
  `grep -n "summariseNonResultOperand" src/runtime/runtime-panics.ts` → :526
  definition, proxy-case doc at :520-524.
- Verified the two sibling citations (match-result.ts:88-89,
  value.ts:112-120) are still accurate, so this is not a whole-file offset.
- Checked the already-filed intake list: the wire-walk/wire-translation
  citation-drift finding cites only wire-form-depth-walk.ts:18-19 and
  wire-translation.ts's own comment lines; no filed finding names
  err-field-summary.ts.

## Triage
verdict: confirmed — reproduced all 3 pins wrong (wire-translation.ts:370 is mid-comment in rebuildInbound's fresh-record rationale, the `Object.create(null)` mint is now :398; runtime-panics.ts:440 is inside the `QuestionOperandDefectError` doc, `summariseNonResultOperand` is now :526; :435-439 is that same unrelated doc, the proxy-case sentence now :520-524) and `git show db98c7b66` proves all three were exact at introduction, so this is decay not birth-error; the 3 excluded sibling pins (match-result.ts:88-89 in `summariseScrutinee`, value.ts:112-120 `ThetaValue` union, query-escapes-stringification.md:16 QRY-18) genuinely still hold so the per-target claim and site count are right, and no intake covers this file's pins (qw20260907202646-d2-01-summarise-descriptor-two-call-sites-stale is a different root cause at :32-35/:117-124; the confirmed wire-walk finding cites only wire-form-depth-walk.ts and wire-translation.ts's own comments) (triage: claude-opus-5)
