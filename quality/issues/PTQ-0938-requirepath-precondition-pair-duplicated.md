---
id: PTQ-0938
title: the requirePath(PI_CLI_ENTRY, ...)/requirePath(EXTENSION_ENTRY, ...) precondition pair is repeated verbatim across 13 real-spawn subagent test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-root-binder-model-exempt.test.ts:435-436
  - tests/subagent-theta-roots-forwarding.test.ts:218-219
  - tests/b0337-theta-enum-identity-invoke.test.ts:580-581
  - tests/b0342-forwarded-enum-subagent-chain.test.ts:189-190
  - tests/inbound-boundary-theta-callable.test.ts:196-197
  - tests/inbound-union-arm-dispatch.test.ts:1387-1388
  - tests/invoke-prompt-cell-enum-return.test.ts:279-280
  - tests/subagent-child-real-spawn.test.ts:64-65
  - tests/subagent-envelope-result-carriage.test.ts:1791-1792
  - tests/subagent-invoke-inbound-enum-tag.test.ts:149-150
  - tests/subagent-invoke-nonfinite-return-refusal.test.ts:267-268
  - tests/subagent-return-depth-refusal.test.ts:1202-1203
sites: 12
fix_scope: cross-module        # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the requirePath(PI_CLI_ENTRY, ...)/requirePath(EXTENSION_ENTRY, ...) precondition pair is repeated verbatim across 13 real-spawn subagent test files

## Observation
Every real-spawn subagent test file that imports `requirePathFor` from
`tests/helpers/real-subagent-spawn.ts` opens its test body with the same two
lines, checking the two fixed paths `PI_CLI_ENTRY` and `EXTENSION_ENTRY`
with the same two literal `what` descriptions, byte-identical across all 12
counted files (two of which are in this review's scope).

## Evidence

The exact search `requirePath\(PI_CLI_ENTRY|requirePath\(EXTENSION_ENTRY`
over `tests/*.ts` returns 24 lines (12 files × 2 lines each), every one of
the following form.

tests/subagent-root-binder-model-exempt.test.ts:435-436:
```ts
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");
```

tests/subagent-theta-roots-forwarding.test.ts:218-219:
```ts
      requirePath(PI_CLI_ENTRY, "the pi CLI entry (node_modules/@earendil-works/pi-coding-agent)");
      requirePath(EXTENSION_ENTRY, "this working tree's extension entry (extensions/)");
```

The identical two-line pair also appears verbatim at:
tests/b0337-theta-enum-identity-invoke.test.ts:580-581;
tests/b0342-forwarded-enum-subagent-chain.test.ts:189-190;
tests/inbound-boundary-theta-callable.test.ts:196-197;
tests/inbound-union-arm-dispatch.test.ts:1387-1388;
tests/invoke-prompt-cell-enum-return.test.ts:279-280;
tests/subagent-child-real-spawn.test.ts:64-65;
tests/subagent-envelope-result-carriage.test.ts:1791-1792;
tests/subagent-invoke-inbound-enum-tag.test.ts:149-150;
tests/subagent-invoke-nonfinite-return-refusal.test.ts:267-268;
tests/subagent-return-depth-refusal.test.ts:1202-1203 — each line
byte-identical to the pair quoted above (verified by direct grep of the two
literal strings, which returns exactly these 24 lines and no others).

## Why this is a problem
`tests/helpers/real-subagent-spawn.ts` already centralises the fail-loudly
mechanism (`requirePathFor`) and the two path constants (`PI_CLI_ENTRY`,
`EXTENSION_ENTRY`) that every one of these 12 files imports, but the
"check both, with these exact two descriptions" pairing itself is retyped at
every call site rather than expressed once. All 12 sites check the identical
two paths with the identical two `what` strings — there is no per-file
variation in this pair for the shared helper module to parameterise away.

## Suggested direction (non-binding, optional)
`tests/helpers/real-subagent-spawn.ts` already exports `requirePathFor`,
`PI_CLI_ENTRY`, and `EXTENSION_ENTRY`; noting that a single exported
convenience (checking both paths with their two fixed descriptions) has no
home yet, despite 12 files needing the identical pair, is an observation
about the existing convention, not a design proposal.

## False-positive check
- Gate-pin check: none of the 12 files match `*gate*.test.ts` or the named
  kin; nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `requirePath` is a fail-loudly precondition guard,
  not a recording double backing a MUST-NOT witness.
- docs/bugs/ signature search: each file is its own bug doc's real-spawn
  witness suite (bugs 0008, 0058/0100-adjacent, 0172, 0178, etc. per each
  file's own header); this finding does not contest any file's red/green
  status, only the duplicated two-line precondition pair every one of them
  carries independently of its own bug's resolution.
- coverage-matrix citation search:
  `grep -rn "requirePath(PI_CLI_ENTRY" docs/reference/coverage-matrix.md`
  returns no hits; this finding proposes no merge, rename, or deletion of
  any of the 12 files.
- Coverage-drift check: the claim is about a two-line precondition pair
  duplicated across files that all exist and all pass (or documented-red)
  today, not about a missing test path.

## Triage
verdict: confirmed — independently re-verified: the stated grep `requirePath\(PI_CLI_ENTRY|requirePath\(EXTENSION_ENTRY` over tests/ returns exactly 24 lines in exactly the 12 cited files at the cited lines, `sort | uniq -c` after indent-stripping shows both lines byte-identical (12× each), `requirePathFor(` has exactly those 12 callers and `requirePath(` is invoked with NOTHING but these two constants anywhere in tests/ (so the curried per-path checker exists only to be called this one fixed way); the helper tests/helpers/real-subagent-spawn.ts:17-23 already owns both constants with JSDoc describing what each is, and the pair is the residue left by commit b2555372 (the fix for resolved PTQ-0583, whose scope was the whole launch/watchdog bundle, not this shape) — a distinct, untracked root cause; all 12 locations under tests/, D7 boilerplate-duplication class, no *gate* file, fail-loudly throw not a recording double, coverage-matrix grep → 0, no merge/rename/delete proposed; PTQ-0686/0766 mention PI_CLI_ENTRY only incidentally and same-wave intake d7-10 quotes the pair inside a larger drive-orchestration excerpt for 2 of these files (different root cause); same shape and scale as confirmed PTQ-0480 (2-line precondition guard × 12 files) and PTQ-0426; one form nit for the record: the title says "13" files but sites, locations, body and grep all agree on 12 (triage: claude-fable-5-1)
