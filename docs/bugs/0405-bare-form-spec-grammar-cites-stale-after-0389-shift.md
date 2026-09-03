# Bug 0405 — Bare-form `grammar.md:N` spec-grammar citations in three committed test files (two inside assertion messages) still point at pre-0389 line numbers after the +9 `fn`-declarations insertion: `grammar.md:139` now names `SubagentMod` where the cites say `FnParams`, and fourteen `:216`–`:221` sink-rule cites point at blank lines or the statement-continuation sentence

- **Status:** open.
- **Kind:** test-infrastructure / doc drift — non-load-bearing for verdicts
  (every assertion is on codes/messages, none on the cited line numbers),
  but two stale cites live inside assertion-failure messages, so a future
  red points its reader at the wrong normative sentence.
- **Sev/Diff estimate:** S5/D1 — S5: doc/registry-inconsistency class,
  reported because it is crisp (each instance is a mechanical
  cited-line-vs-actual-content mismatch) and because the 0389 fix record
  itself states "A follow-up sweep bug is warranted" and none was filed.
  D1: a bounded re-pin sweep over an enumerated instance list; each target
  disambiguates as spec-side by its quoted content (all quoted productions/
  bullets exist only in the spec file at the cited pre-shift numbers).
- **Related:**
  - 0389 (fixed 0.395.0) — the parent fix; its §Residuals item 1 names this
    exact remainder (bare / continuation-form cites outside the ratified
    prefix-form enumeration) with two of the three files cited here as its
    own examples, and recommends the sweep bug.
  - 0394 (fixed 0.397.0) — §Residuals item 3 records one more instance of
    the same follow-up class for the sweep's scope decision:
    `tests/b0366-join-element-laundered-belt.test.ts`'s header quotes a
    pre-0394 `stdlib-string.ts` design-brief sentence (source-comment quote
    drift, not a spec line cite; include or fence explicitly).
  - 0395 (fixed 0.388.0) — §Residuals item 1 establishes the repo convention
    boundary this report respects: era-pinned bug DOCS stay frozen; live
    TEST files are re-pinned (0389 itself re-pinned 11 of them). Its item 1's
    own live-test half — the comment-only `type-layer-checks.ts:3092/3094/3103`
    cites in `tests/b0345-interpolation-operand-checks-at-parse.test.ts`,
    shifted by 0392/0395 — belongs in this same sweep (TS target ⇒ symbol
    form per the 0134 convention, not a re-pin).
  - [0134](./0134-params-shift-induced-stale-citations.md) (fixed 0.198.0) —
    the citation-convention/gate parent. Its do-not-file class covers
    pre-existing, corpus-wide, position-only drift; it explicitly excludes
    drift "shift-induced by a single identified commit" — this set, created
    by 0389's +9 insertion. Its "Deliberately left" item 2 declines only the
    unbounded corpus-wide sweep of pre-existing prose-target drift (256
    `type-system.md`-era cites), not a bounded single-commit-attributable
    set. Neither disposition blocks this report.
  - [0336](./0336-stale-lexical-environment-cite-in-lpa-comment.md) (fixed
    0.308.0) — filing precedent post-0134: a single stale comment cite in a
    test file, filed and fixed as its own report.
- **Affected** (verified at `c2c25d81`, v0.398.0; spec truth beside each):
  - `tests/fn-param-not-identifier.test.ts:19` — comment cites `FnParams` at
    `grammar.md:139`; `:139` is now `SubagentMod ::= "subagent"`, `FnParams`
    is at `:144`.
  - `tests/fn-param-not-identifier.test.ts:712` — ASSERTION MESSAGE:
    "`FnParams` admits ONE trailing comma (grammar.md:139)…" — same
    mispointing, delivered to whoever debugs the red.
  - `tests/ctor-field-type-check.test.ts:63` — header sentence (whose
    prefix half at `:62` WAS re-pinned to `:225–230` by 0389) still says
    "declared EXHAUSTIVE at :216 and :220 lists …"; truth `:225` / `:229`.
    `:216` and `:220` are now blank lines.
  - `tests/ctor-field-type-check.test.ts:432` — comment "grammar.md:216–221
    declares the `array<T>` sink set exhaustive"; truth `:225–230`.
  - `tests/ctor-field-type-check.test.ts:434` — the same comment's
    continuation, "in it at :220"; truth `:229`. Named by 0389 §Residuals
    item 1 as one of its own examples.
  - `tests/ctor-field-type-check.test.ts:446` — ASSERTION MESSAGE:
    "grammar.md:220's sink-set member is implemented…"; truth `:229`.
  - `tests/nested-array-element-sink-descent.test.ts:52` — SPEC-ANCHORS
    comment, continuation form "under `:216`'s 'The sink set is
    exhaustive'"; truth `:225` — in the same block whose `:50` cite WAS
    re-pinned to `:230` by 0389.
  - `tests/nested-array-element-sink-descent.test.ts:87, 271, 279, 294,
    311, 316, 321, 661` — eight cites of `grammar.md:221` for the
    recursive-descent sink bullet (five of them in assertion-message /
    label strings); truth `:230`; `:221` is now "When no trigger holds, the
    newline closes the statement…".
- **Observed at:** v0.398.0 (`c2c25d81`), offline — `grep -n` over the three
  test files; `sed -n '139p;144p;216p;220,221p;223,230p'
  docs/spec_topics/grammar.md` for the line-content truth.

## Summary

Bug 0389's fix inserted 9 lines into `docs/spec_topics/grammar.md` (223→232)
at the `#fn-declarations` block and re-pinned every inbound PREFIX-form
`docs/spec_topics/grammar.md:N` cite in 11 test files. Its §Residuals item 1
recorded that bare / continuation-form `grammar.md:N` cites were left
un-repinned because disambiguating them spec-vs-reference was "not provably
bounded" in that lane, and recommended a follow-up sweep bug. The sweep bug
was never filed. This report enumerates and verifies the concrete stale set:
16 stale numbers across the three files 0389 named (2 in
`fn-param-not-identifier`, 5 in `ctor-field-type-check` counting the
`:216–221` range cite once, 9 in `nested-array-element-sink-descent`),
including
two assertion messages and three assertion labels that will misdirect a
future debugging session to the statement-continuation section instead of
the sink rule, or to `SubagentMod` instead of `FnParams`. Disambiguation is
decidable per instance despite the lane's bounded-effort concern: each cite
sits beside quoted production/bullet text whose pre-shift line number
matches the spec file (`docs/reference/grammar.md` has those symbols at
`:294–301`, three-digit numbers no instance uses).

## Reproduction

```
sed -n '139p;144p' docs/spec_topics/grammar.md
# 139: SubagentMod  ::= "subagent" …      (cited as FnParams)
# 144: FnParams     ::= FnParam … ","?    (actual FnParams)
sed -n '216p;220,221p;225p;229,230p' docs/spec_topics/grammar.md
# 216: (blank — cited as "sink set declared EXHAUSTIVE", truth :225)
# 220: (blank — cited as the constructor-field sink bullet, truth :229)
# 221: "When no trigger holds, the newline closes the statement…"
#      (cited eight times as the recursive-descent bullet, truth :230)
grep -n "grammar.md:139" tests/fn-param-not-identifier.test.ts     # :19, :712
grep -n "grammar.md:2\|:216\|:220" tests/ctor-field-type-check.test.ts
# :62(ok), :63 (":216 and :220"), :432, :434 (":220"), :446; :67 is expressions.md — out of scope
grep -n "grammar.md:221\|:216" tests/nested-array-element-sink-descent.test.ts  # :52 + ×8
```

## Expected behaviour

The repo treats live test files' spec cites as maintained pointers: 0389
re-pinned 11 files in the same commit as the shift and its own assertion
message pins the rule ("A resolution is an in-place, line-count-preserving
rewrite unless it re-pins those citations in the same commit"). A cite of
`grammar.md:N` in a maintained test names line N's current content.

## Actual behaviour / root cause

The 0389 sweep keyed on the prefix spelling `docs/spec_topics/grammar.md:N`;
bare `grammar.md:N` and continuation-form `:N` spellings in the same
sentences were outside the ratified enumeration and were left at pre-shift
values — including inside sentences whose prefix half WAS updated
(`ctor-field-type-check.test.ts:62–64` now cites `:225–230` and `:216`/`:220`
in one breath).

## Why it matters

Lowest impact class, reported for crispness and because the record demands
the follow-up: stale line cites in assertion messages are diagnostics that
lie (wrong site) precisely when someone needs them — a red in
`nested-array-element-sink-descent` tells its reader the normative anchor is
`grammar.md:221`, a blank line. Left unswept, each future grammar-appendix
edit compounds the drift.

## Non-goals

- Era-pinned `docs/bugs/*.md` citations (frozen at filing by repo
  convention; 0395 §Residuals 1).
- Reference-side (`docs/reference/grammar.md`) cite halves — pre-existing
  drift outside 0389's mandate (its Residual 3), separate audit.
- The registry row `code-registry-parse.md:26`'s quoted pre-0150 shape
  `FnParam ::= Ident ":" Type` — pre-dates 0389 by ~220 versions and the row
  compensates in prose; noted for the sweeping fixer, not claimed here.
- Any assertion weakening: every edit is comment/message-string-only.

## Fix

Mechanical re-pin of the enumerated instances (+9 where the target is past
the insertion point: `139→144`, `216→225`, `220→229`, `221→230`;
`216–221→225–230`), plus a decision whether to fold in 0394 §Residuals 3's
b0366 header quote (recommended: yes, same sweep). Optionally add the bare
spelling to whatever citation-form gate ratcheted the prefix form, so the
next shift catches both spellings. No test semantics change; suite must stay
green byte-for-byte on verdicts.

## Provenance

fix-residuals-4 sweep over bugs 0386–0401: developed from 0389 §Residuals
item 1 (named-but-unfiled sweep) with 0394 §Residuals item 3 as an adjacent
instance. Every instance and every spec-line truth re-verified at
`c2c25d81`. Dup check: README index has no citation-sweep report; 0389's own
§Fix re-pin list read in full to confirm these spellings were outside it.
