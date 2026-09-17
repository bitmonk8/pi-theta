---
id: PTQ-0631
title: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE is redeclared byte-identically in binder-forced-tool-dispatch.test.ts and binder-inference-provider-mapping.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/binder-forced-tool-dispatch.test.ts:1071-1078
  - tests/binder-inference-provider-mapping.test.ts:915-924
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE is redeclared byte-identically in binder-forced-tool-dispatch.test.ts and binder-inference-provider-mapping.test.ts

## Observation
Both `tests/binder-forced-tool-dispatch.test.ts` and `tests/binder-inference-provider-mapping.test.ts` declare their own module/block-scope `const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE` holding the identical measured provider-error byte string (a live `claude-haiku-4-5` overflow capture cited to bug 0065). `tests/binder-forced-tool-dispatch.test.ts`'s own doc comment states the string is "byte-identical to the string committed at `tests/binder-inference-provider-mapping.test.ts:941-942`" (a stale line reference — the declaration is at line 923 as of this review, not 941 — but the byte-identity claim it makes is correct) — the author identified the sibling declaration by name while re-typing the literal rather than importing it.

## Evidence

`tests/binder-forced-tool-dispatch.test.ts:1071-1078`:
```ts
/**
 * The verbatim live anthropic overflow `errorMessage`, byte-identical to the
 * string committed at `tests/binder-inference-provider-mapping.test.ts:941-942`
 * (captured from a real `claude-haiku-4-5` overflow by bug 0065's 0.100.0 run).
 */
const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =
  `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}`;
```

`tests/binder-inference-provider-mapping.test.ts:915-924` (the block the comment above names by content; the literal is byte-identical):
```ts
  /**
   * The verbatim live `errorMessage` byte string. Whole-string numeric runs
   * are SEVEN (`400`, `220044`, `200000`, `011`, `67`, `3`, `6` — the last
   * four from the `request_id`), so the exactly-two rule cannot fire against
   * it. The provider-message window is
   * `prompt is too long: 220044 tokens > 200000 maximum`, whose runs are
   * exactly `220044` and `200000`.
   */
  const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =
    `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}`;
```

Exact search: `grep -n "LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =" tests/binder-forced-tool-dispatch.test.ts tests/binder-inference-provider-mapping.test.ts` returns exactly one declaration per file (2 total). The two quoted backtick-string lines are byte-identical.

## Why this is a problem
The exact same measured provider byte string — a specific, non-obvious fixture value (a live capture, not a hand-authored literal) — is typed twice into two files rather than declared once and imported. The duplicating file's own doc comment names the other file as the source of the byte-identical string (even though the line number it cites has drifted from the file's current shape), showing the author cross-referenced the sibling deliberately rather than arriving at the same string independently; nothing enforces that the two copies stay equal going forward, and the citing comment's own line number is already out of date, which is the drift this kind of duplication invites.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` fixture module exporting this measured constant would let both files import the one recorded byte string instead of each carrying its own transcription (and would remove the need for a cross-file line-number comment that can drift).

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited constant is a fixture literal, not a pinned count or inventory.
- Recording-double check: this constant is a scripted INPUT to `classifyProviderResponse`/the mocked `complete()` reply, not a recording double or a "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "0065\b" docs/bugs/` finds `docs/bugs/0065-anthropic-overflow-status-gate-unsatisfiable.md`, which both files cite as the source measurement; the bug doc does not mark either file's declaration as a documented correct-reason red, and this finding does not touch the RED/CONTROL assertions built on the constant, only its duplicated declaration.
- coverage-matrix/bug-doc citation search: `grep -n "binder-forced-tool-dispatch\|binder-inference-provider-mapping" docs/reference/coverage-matrix.md` → 0 hits. No merge, rename, or deletion of either file or any `it()`/`describe()` is proposed.
- Coverage check: the claim is about a repeated fixture-literal DEFINITION; both files' own tests consume their own copy, so this is not a coverage-gap claim.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines and the two backtick literals diff byte-identical (171 bytes each); the forced-tool-dispatch comment's `:941-942` citation is indeed stale (sibling declaration now at :923-924); copy-paste fixture is an in-scope D7 class with no carve-out applying (neither file is a gate test, the constant is a scripted input not a recording double, 0 coverage-matrix hits, no exemption row, no cell merge/delete proposed); no existing PTQ or sibling intake candidate tracks this constant. Correction to the inventory: the candidate's grep was scoped to its two files — a repo-wide hunt finds a THIRD byte-identical declaration at tests/typed-two-phase-live.test.ts:2055-2056 (bug 0182 witnesses, 97e2c98a), so the fix should hoist all three copies, not two (triage: claude-fable-5-1)
