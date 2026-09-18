---
id: PTQ-0480
title: The four-line "live-host precondition" guard after requireLiveHost() is copy-pasted at every call site in the reviewed scope
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:146-153
  - tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:149-156
  - tests/live/acceptance/b0358-doc-comment-description-lowering.test.ts:155-162
  - tests/live/acceptance/b0380-params-key-not-identifier-load-refusal.test.ts:162-168
  - tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:171-177
  - tests/live/acceptance/b0411live-template-prose-doc-comment-registration.test.ts:151-158
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:327-334
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:389-396
  - tests/live/acceptance/b0428live-unreadable-thetalib-load-refusal.test.ts:261-268
  - tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:182-189
  - tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:289-296
  - tests/live/acceptance/ctor-unresolved-load-refusal.test.ts:188-195
sites: 12
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The four-line "live-host precondition" guard after requireLiveHost() is copy-pasted at every call site in the reviewed scope

## Observation
`tests/live/acceptance/harness.ts` exports `requireLiveHost()`, which itself
calls `resolveAcceptanceHost()` and already `failLoudly`s (naming the unmet
precondition) when `ModelRegistry.getAvailable()` is empty. Every one of the 11
files in this review's scope calls `requireLiveHost()` and then repeats the
identical four-statement guard afterward — the same comment, the same
`if (modelId.length === 0)` check, and the same `failLoudly` message text (two
minor line-wrap variants of one sentence) — before proceeding to the `mkdtempSync`
setup. The block is byte-for-byte identical (modulo the trivial line-wrap of
the message string) at all 12 call sites across the 11 files in scope.

## Evidence
`tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:146-153`:
```ts
    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
```

`tests/live/acceptance/b0428live-unreadable-thetalib-load-refusal.test.ts:261-268`
(identical shape, confirmed by direct comparison):
```ts
    // Live-host precondition — fails loudly naming the unmet precondition; never
    // a skip or early return.
    const { modelId } = await requireLiveHost();
    if (modelId.length === 0) {
      failLoudly(
        "live-host precondition unmet: the shared live-suite model resolver " +
          "returned an empty model id.",
      );
```

`tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts`
carries the block TWICE, at 327-334 and again at 389-396 (two `it()` bodies in
the same file), each identical to the excerpts above.

Every remaining in-scope file
(`b0357-doc-comment-anchor-registration.test.ts:149-156`,
`b0358-doc-comment-description-lowering.test.ts:155-162`,
`b0380-params-key-not-identifier-load-refusal.test.ts:162-168`,
`b0406live-object-param-system-interp-registration.test.ts:171-177`,
`b0411live-template-prose-doc-comment-registration.test.ts:151-158`,
`b0444live-array-union-element-system-interp.test.ts:182-189`,
`b0445live-imported-array-element-system-interp.test.ts:289-296`,
`ctor-unresolved-load-refusal.test.ts:188-195`) carries the same four
statements, re-read from each file at the cited lines, differing at most in
comment line-wrap and one file (`b0380`, `b0406`, `b0444`, `b0445`,
`b0422`) keeping the `failLoudly` message on a single unbroken string instead
of the two-part concatenation. Search: `grep -n "modelId.length === 0"` across
the 11 in-scope files returns exactly 12 hits, one per site listed above.

## Why this is a problem
`requireLiveHost()` already performs the fail-loudly precondition check inside
`resolveAcceptanceHost()` (harness.ts, `if (available.length === 0) failLoudly(...)`).
The repeated `if (modelId.length === 0) failLoudly(...)` block that every call
site adds afterward is the same precondition guarded a second time, worded
identically at all 12 sites, rather than being a member of `requireLiveHost`'s
own contract. This is the boilerplate-duplication shape: a setup sequence
repeated verbatim across every file in the reviewed scope instead of living
once in the shared harness those files already import from
(`tests/live/acceptance/harness.ts`).

## Suggested direction (non-binding, optional)
The natural home for this check — as an observation, not a design — is inside
`requireLiveHost()` itself in `tests/live/acceptance/harness.ts`, the module
every call site already imports.

## False-positive check
- Gate-pin check: none of these files match `*gate*.test.ts` or the named gate
  kinds; not applicable.
- Recording-double check: not applicable — this is a precondition guard, not a
  double recording calls.
- docs/bugs/ signature search: `grep -rl "modelId.length === 0"` under
  `docs/bugs/` returns no hits; no documented correct-reason-red cites this
  exact guard shape.
- coverage-matrix/bug-doc citation search: the finding proposes no merge,
  rename, or deletion of any test — only that the shared precondition text
  live once in the already-imported harness — so the citation-pinning rule
  does not apply.
- Confirmed this stays a test-code-only observation: `tests/live/acceptance/harness.ts`
  is itself a test-support module under `tests/`, not `src/`, `extensions/`, or
  `tools/`.
- Confirmed this is not a coverage claim: no site is missing a check; every
  site already performs a redundant one.

## Triage
verdict: confirmed — independently re-verified: all 12 excerpts reproduce at the cited lines and normalize to one identical `const { modelId } = await requireLiveHost(); if (modelId.length === 0) failLoudly("live-host precondition unmet: the shared live-suite model resolver returned an empty model id.")` block (differences are string/comment wrap only), `modelId` is never read after the guard at any site, and no PTQ tracks this root cause (sibling d7-72 is the unawaited-call issue, distinct); two corrections for the fixer: the guard is NOT strictly redundant with resolveAcceptanceHost's `available.length === 0` check — harness.ts `idOf()` falls back to `""` and materialiseHostBoundThetaDir separately guards `host.model === ""`, so the fix is to hoist the empty-id check into requireLiveHost() (not delete it); and the pattern is repo-wide — `grep -rn "modelId.length === 0" tests/` = 41 sites in 40 tests/live/acceptance files, not the 12 this shard cited (triage: claude-fable-5-1)
