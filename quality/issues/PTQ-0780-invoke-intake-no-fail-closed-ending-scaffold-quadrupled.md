---
id: PTQ-0780
title: The "no fail-closed ending" failureNotes check block is redeclared byte-identically (module the stem name) across four invoke-intake cells in live-production-acceptance.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/live-production-acceptance.test.ts:4986-4993
  - tests/live/live-production-acceptance.test.ts:7207-7214
  - tests/live/live-production-acceptance.test.ts:9558-9565
  - tests/live/live-production-acceptance.test.ts:10936-10943
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The "no fail-closed ending" failureNotes check block is redeclared byte-identically (module the stem name) across four invoke-intake cells in live-production-acceptance.test.ts

## Observation
Four sibling bug cells in this file — bug 0056 (line 4904), bug 0097 (line
7121), bug 0184 (line 9476) and bug 0164 (line 10852) — each build a
two-theta fixture pair (a `mode: subagent` callee with a typed `params:`
field and a `mode: prompt` parent that issues two `invoke(...)` calls, each
`match`ed into a plain `"ACCEPTED"` / `"REJECTED " + e.cause` string) and then
drive one turn and check the outbound text for `GOOD=ACCEPTED` /
`BAD=REJECTED validation`. At the end of each `it`, all four repeat the exact
same closing block: filter `turn.systemNotes` for a
`/^theta \/<stem>livecheck (returned Err|cancelled|aborted)/` match and assert
the result is `[]`, with an identical two-line failure message. The four
blocks are byte-identical except for the `<stem>` token
(`b56`/`b97`/`b184`/`b164`) substituted into the regex.

## Evidence

tests/live/live-production-acceptance.test.ts:4986-4993 (bug 0056):
```ts
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b56livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
```

tests/live/live-production-acceptance.test.ts:7207-7214 (bug 0097):
```ts
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b97livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
```

tests/live/live-production-acceptance.test.ts:9558-9565 (bug 0184):
```ts
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b184livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
```

tests/live/live-production-acceptance.test.ts:10936-10943 (bug 0164):
```ts
      const failureNotes = turn.systemNotes.filter((n) =>
        /^theta \/b164livecheck (returned Err|cancelled|aborted)/.test(n),
      );
      expect(
        failureNotes,
        "the invoking parent's own drive surfaced fail-closed system note(s) " +
          "— the fixture itself is broken: " + JSON.stringify(failureNotes),
      ).toEqual([]);
```

Diff of the four excerpts above (line-by-line via `diff`, `s/<stem>livecheck//`
normalisation applied only to the regex line) is empty; every other character,
including both comment lines immediately above each block ("bug NNNN fired.")
and the two-line expect message, matches token-for-token. The same four sites
also carry a near-identical preceding scaffold not quoted here for length: the
`{a} | {b}`-shaped two-`invoke(...)`-call theta pair
(`literalParamsInvokeCheckTheta`/`braceUnionParamsInvokeCheckTheta`/
`mixedUnionParamsInvokeCheckTheta`/`literalArrayParamsInvokeCheckTheta`, each
declaring `let okOutcome = match okResult { Ok(_) => "ACCEPTED", Err(e) =>
"REJECTED " + e.cause, }` / `let badOutcome = match badResult { … }`
byte-identically at lines 4891-4894, 7108-7111, 9463-9466 and 10839-10842),
and an identical three-`expect(...).toBeDefined()` precondition-control
sequence. The search `const failureNotes = turn.systemNotes.filter` returns
26 hits total in this file; the four sites above are the only ones whose full
surrounding block (comment, regex shape, and expect message) is byte-for-byte
identical apart from the stem substitution — verified by direct excerpt
comparison of all four.

## Why this is a problem
Four independently-added bug cells (0056, 0097, 0184, 0164) restate the same
five-line "assert the parent's own drive ended cleanly" scaffold with no
shared helper — the only variable across all four instances is the stem
string used to build the regex. Each of the four already imports and calls
`driveSlashCaptureTurn` from `./harness`; a `assertNoFailClosedEnding(turn,
stem)` (or equivalent) function next to that import would let each site state
its stem once instead of re-deriving the same regex and message text.

## Suggested direction (non-binding, optional)
A small helper co-located with `driveSlashCaptureTurn` in `./harness` (or a
local module-scope function in this file, since `./harness` already supplies
the `turn` shape) that takes `(turn, stem)` and performs this exact
filter/assert would let the four call sites collapse to one line each; this is
an observation of the natural home, not a design.

## False-positive check
- Gate-pin check: filename is not `*gate*.test.ts` and no `*-gate.*` kin;
  the file is a live-host acceptance suite, not a census/pin gate — carve-out
  does not apply.
- Recording-double check: no fake/double is involved; `turn.systemNotes` is
  read off the real in-memory `SessionManager`/session-note channel through
  the real `driveSlashCaptureTurn` harness call, not a recording double's
  call log — the "negative witness through a recording double" carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rn "b56livecheck\|b97livecheck\|b184livecheck\|b164livecheck" docs/` returned no hits — no correct-reason-red or documented-signature carve-out applies, and none of the four tests are red.
- Coverage-matrix / bug-doc witness-list citation search:
  `grep -rn "live-production-acceptance.test.ts" docs/reference/coverage-matrix.md`
  and a search for `b56livecheck`/`b97livecheck`/`b184livecheck`/`b164livecheck`
  across `docs/` both returned zero hits — none of the four tests are pinned
  by name in the coverage matrix or a bug doc's witness list; this finding
  proposes no merge/rename/delete of any `it()`/`describe()` in any case.
- Coverage drift check: this finding does not claim any path is untested or
  propose adding/removing a test; it only cites duplicated code already
  present in the four existing tests.
- Prior-wave duplicate check: searched the already-filed/rejected index for
  `b56live`, `b97live`, `b184live`, `b164live` and for "invoke intake" /
  "fail-closed ending" — no match; `grep -rl "b56live\|b97live\|b184live\|b164live" quality/issues/ quality/resolved/ quality/intake/` returned no files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; a 13-line window (5 comment lines + filter + expect) sed-extracted at each site and normalised only on the stem/bug-number tokens diffs to zero across all four, so the clone is byte-identical modulo `<stem>`; the four sites are the only ones carrying the "the invoking parent's own drive surfaced fail-closed system note(s)" message (grep count 4) though the bare `/^theta \/<stem> (returned Err|cancelled|aborted)/` filter recurs at 22 of the 26 `const failureNotes = turn.systemNotes.filter` hits in the file — an under-count of the same scaffold, not a refutation, and a `(turn, stem)` helper would sweep those too; no such helper exists in tests/live/harness.ts (0 hits for the regex or `failClosed`); all locations under tests/, class is D7 boilerplate duplication, stated searches reproduce (docs/ stem grep rc=1, coverage-matrix file cite 0, quality/ stem grep finds only this file), not a *gate* file, no recording double, no red test, no it()/describe() change proposed; PTQ-0552/PTQ-0771 track the unrelated FAIL_CLOSED_MARKERS constant in other files and no existing row cites these sites or this regex (triage: claude-fable-5-1)
