---
id: pending
title: Bug 0325's fix record says the par-max message widened to "is not a finite number" and defends that wording, but commit 31bb73cf (bug 0438) retargeted both b0325 witness message assertions to "not a finite integer" and 0325 carries no note
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0325-nan-max-zero-workers-fabricated-ok-null-array.md:170-172
  - docs/bugs/0325-nan-max-zero-workers-fabricated-ok-null-array.md:189-195
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:48-52
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:187-191
  - tests/b0325-nan-infinity-max-zero-workers.test.ts:222-226
  - docs/bugs/0438-par-max-fractional-width-silent-floor.md:254-257
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0325's fix record says the par-max message widened to "is not a finite number" and defends that wording, but commit 31bb73cf (bug 0438) retargeted both b0325 witness message assertions to "not a finite integer" and 0325 carries no note

## Observation
Bug 0325's `## Fix (0.313.0)` says the emitted `theta/runtime/par-max-non-integer` message widens to `'par for' max operand is not a finite number; in-flight width clamped to 1`. A DIAG-2 adjudication paragraph argues this wording is "true for the whole widened class". The record's witness, `tests/b0325-nan-infinity-max-zero-workers.test.ts`, carries the two cells that assert the message substring. Commit 31bb73cf (bug 0438/0439, v0.417.0, 2026-09-04) changed both assertions from `.toContain("not a finite number")` to `.toContain("not a finite integer")` and updated the test header to match. The 0325 record's last commit is its fix commit, 685fe9f3 (2026-08-30). It has no mention of 0438 and no note of the change. The reword is recorded only on the 0438 side.

## Evidence
Claim side (re-read immediately before filing):

`docs/bugs/0325-nan-max-zero-workers-fabricated-ok-null-array.md:170-172`:
```
    floor (`max 0`/negative) stays 0326's territory. The emitted message widens
    to `'par for' max operand is not a finite number; in-flight width clamped
    to 1` (fidelity-true across the whole widened class incl. Infinity).
```

`docs/bugs/0325-nan-max-zero-workers-fabricated-ok-null-array.md:189-195`:
```
- **DIAG-2 adjudication (in-lane, bounded, choice (a)):** widen the shared
  `theta/runtime/par-max-non-integer` row's Trigger AND its message from "is not
  a number" to "is not a finite number", rather than mint a dedicated row.
  Keeping the old message is DIAG-4-false for Infinity (Infinity IS a number);
  "is not a finite number" is true for the whole widened class
  {non-`number` values, NaN, ±Infinity}. Evidence: the corpus already unifies
  `{NaN, ±Infinity}` as one non-finite class via `Number.isFinite`
```

Evidence side:
- `tests/b0325-nan-infinity-max-zero-workers.test.ts:187-191` (NaN cell):
```
    const diag = captured.find((d) => d.code === RUNTIME_CODE);
    expect.soft(
      diag?.message ?? "",
      "the widened message names the non-FINITE class (RED today: no diagnostic captured)",
    ).toContain("not a finite integer");
```
- `tests/b0325-nan-infinity-max-zero-workers.test.ts:222-226` (Infinity cell): the same assertion, ending `.toContain("not a finite integer");`.
- Header, `tests/b0325-nan-infinity-max-zero-workers.test.ts:48-52`: "widens the message to "'par for' max operand is not a finite integer; in-flight width clamped to 1" (code stays `theta/runtime/par-max-non-integer`; bug 0438 rewords the message again to also cover the finite-non-integral-≥1 class)."
- `git show 31bb73cf -- tests/b0325-nan-infinity-max-zero-workers.test.ts` (assertion lines): `-    ).toContain("not a finite number");` / `+    ).toContain("not a finite integer");`, twice. The commit message says "Enumerated flip: two b0325 .toContain substrings tracking the reword."
- The flip is documented on the 0438 side, `docs/bugs/0438-par-max-fractional-width-silent-floor.md:254-257`: "`tests/b0325-nan-infinity-max-zero-workers.test.ts` — the enumerated message-reword propagation: two `.toContain("not a finite number")` assertions and one header-comment quote → `not a finite integer`".
- `git log --format="%h %ad" --date=short -- docs/bugs/0325-…md` → 685fe9f3 2026-08-30 and e6359e57 2026-08-26. No commit after 31bb73cf.
- `grep -n "0438\|0439" docs/bugs/0325-…md` → 0 hits.
- `grep -n "finite number\|finite integer" tests/b0325-nan-infinity-max-zero-workers.test.ts` → the string "finite number" no longer appears in any assertion. The two assertion hits (:191, :226) both read "finite integer".

## Why this is a problem
0325 states a specific message text and argues for its fidelity. Its own witness, the only test that asserts that text, now asserts a different substring. A reader who checks the record against its witness finds the two disagreeing, and nothing in 0325 says the change was deliberate or names 0438. Coordination notes on affected records are the house practice: 0325 itself appended one to 0324 for the earlier widening (0325:236-237, "Discharge notes appended: `docs/bugs/0324-...md` (append-only coordination note recording the shared-row widening)"). That practice was not applied to 0325 for the 0438 reword.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0325. It would record that 31bb73cf (bug 0438) reworded the shared message to "is not a finite integer" and that the b0325 message assertions were retargeted with it.

## False-positive check
- Witness existence: `tests/b0325-nan-infinity-max-zero-workers.test.ts` exists with 7 `it(` sites, matching the record's "7/7". The code-level assertions (`RUNTIME_CODE`) are unchanged. Only the message substrings moved.
- Commit attribution: `git log --format="%h %ad %s" --date=short -- tests/b0325-nan-infinity-max-zero-workers.test.ts`, excluding quality/citation commits, lists only 685fe9f3 (fix) and 31bb73cf. The 31bb73cf diff to this file has exactly two non-comment changed assertion lines, both the substring swap.
- Other records in shard: 0324 and 0326 do not quote the message text. `grep -n "finite number\|is not a number\|not a finite" docs/bugs/0324-*.md docs/bugs/0326-*.md` gives 2 hits, both in 0326 (:149, :154). Both are prose about the number branch, not message quotes. No other shard record cites 31bb73cf-touched assertions.
- Pending candidates: `grep -ln "31bb73cf" quality/intake/*` → 0.
- Scope: whether the current message is correct is not adjudicated. This filing concerns only the record-versus-witness pointer.

## Triage
verdict: questionable — decay verified, but the fix is prose, not a re-point: 0325 §Fix :170-172 and the DIAG-2 paragraph :189-195 quote "is not a finite number"; 31bb73cf changed both b0325 `.toContain` assertions (:191, :226) and the header quote (:50) to "not a finite integer" (git show confirms exactly those changed lines); the live message is "not a finite integer" at src/runtime/par-for-executor.ts:26 and in the registry row; 0325's only commits are e6359e57 and 685fe9f3; 0 hits for 0438/0439 in 0325; the propagation is recorded only at 0438:254-257; no other intake file or PTQ cites 31bb73cf, and it deleted nothing, so no same-sha dedupe applies. No citation in 0325 fails to resolve: the witness file and all 7 cells exist, the code assertions are unchanged, and the quoted text accurately records what shipped in 0.313.0 (STYLE.md:61-63: a bug doc is a dated record whose citations are not rewritten). The proposed repair adds a coordination note, which is new wording in the record. House practice varies: 0325 appended a note to 0324, but 0217 deliberately appended none to 0204. Whether to add the note is a human's call (triage: claude-opus-5-5)
