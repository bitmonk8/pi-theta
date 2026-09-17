---
id: PTQ-0772
title: The transport-blip regex predicate `transportish` is redeclared byte-identically in three tests/live/hardening files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/hardening/session-subagent-toolloop.test.ts:50-53
  - tests/live/hardening/recent-rfc-live-drives.test.ts:52-55
  - tests/live/hardening/session-invoke-attach.test.ts:34-37
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The transport-blip regex predicate `transportish` is redeclared byte-identically in three tests/live/hardening files

## Observation
`tests/live/hardening/session-subagent-toolloop.test.ts`,
`tests/live/hardening/recent-rfc-live-drives.test.ts`, and
`tests/live/hardening/session-invoke-attach.test.ts` each declare a
module-scope `function transportish(s: string | undefined): boolean` used to
decide whether a drive's error/note text looks like a transient transport
fault (429/rate-limit/etc.) worth a single retry. All three bodies —
signature, the `undefined` short-circuit, and the regex literal — are
byte-identical. All three files already import `requireLiveProvider` and
`runProbe`/`ProbeResult` from the sibling `./probe-harness` module in the same
directory, which defines no such predicate.

## Evidence
`tests/live/hardening/session-subagent-toolloop.test.ts:50-53`:
```ts
function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}
```

`tests/live/hardening/recent-rfc-live-drives.test.ts:52-55`:
```ts
function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}
```

`tests/live/hardening/session-invoke-attach.test.ts:34-37`:
```ts
function transportish(s: string | undefined): boolean {
  if (s === undefined) return false;
  return /429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529/i.test(s);
}
```

Exact search: `grep -rn "function transportish" tests/live/hardening/*.ts` →
exactly these three hits (verified via re-read, no fourth site in
`tests/live/hardening/`).

## Why this is a problem
The same 4-line predicate is retyped whole into three separate files rather
than defined once. All three files already import from the shared
`./probe-harness` module in the same directory (`requireLiveProvider`,
`runProbe`, `ProbeResult`/`PlantedFile` types), so the omission is not a
missing habit of drawing from the shared harness generally, only of this one
specific predicate — each caller re-derives the identical regex independently
rather than importing one definition.

## Suggested direction (non-binding, optional)
`tests/live/hardening/probe-harness.ts` is the one module all three call
sites already import from and is where this predicate's callers already look
for shared live-drive plumbing; it is the natural home for a single exported
`transportish`.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kinds (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: `transportish` is a pure regex test over a string;
  it records no calls and backs no "never called" assertion, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "transportish" docs/bugs/*.md` → 0
  files. `docs/bugs/0254-verbatim-echo-drive-sentinels-survive-in-three-hardening-files.md`
  cites `session-invoke-attach.test.ts` and `session-subagent-toolloop.test.ts`
  (plus `session-promptloop.test.ts`, not part of this cluster) as a group,
  but that bug's subject is the verbatim-echo sentinel shape (fixed in
  0.243.0), not this retry predicate; it states no rationale for
  redeclaring `transportish` locally rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "session-subagent-toolloop\|recent-rfc-live-drives\|session-invoke-attach"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  predicate's definition could be shared — so the citation carve-out does not
  bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; every copy is exercised by the tests in
  its own file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts are byte-identical at exactly :50-53/:52-55/:34-37 and each copy is live (called at :59/:81/:43 by its file's retry wrapper); repo-wide grep of `transportish` and of the regex literal `429|overloaded|transport|rate.?limit|ECONNRESET|timeout|503|529` yields only these three declarations, all introduced in one commit (a6a5953e, 2026-07-28) — same-commit sibling repetition; probe-harness.ts (which all three already import) exports no such predicate; docs/bugs and coverage-matrix searches reproduce at 0 hits; D7 boilerplate-duplication class in tests/ with no gate/recording-double/failLoudly carve-out touched; not tracked (PTQ-0114 cites probe-harness.ts only incidentally; sibling -04 driveOnce is a different helper in two other files) (triage: claude-fable-5-1)
