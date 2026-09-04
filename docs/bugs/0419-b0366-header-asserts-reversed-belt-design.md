# Bug 0419 — `tests/b0366-join-element-laundered-belt.test.ts:21–23` asserts as present-tense fact, quote and line-cite included, the pre-0394 belt design "the belt does not consult `params` — arity is its only concern", which bug 0394 reversed: the cited lines `stdlib-string.ts:65-66` now state the opposite ("the runtime dispatcher belt reads `params` too … arity and kind are its two concerns")

- **Status:** open.
- **Sev/Diff estimate:** S5/D1 — S5: doc/records drift in a committed test
  header, non-load-bearing for verdicts (b0366's assertions are on the
  element-walk throw and parse codes, not on the quoted sentence); reported
  because it is crisp, twice-named-and-never-filed (0394 §Residuals 3,
  0405 §Residuals 1), and SEMANTIC — the quote asserts a reversed design
  claim, so it sits outside 0134's position-only do-not-file class on the
  substance axis. D1: one bounded comment-only header rewrite in one file,
  with the correct post-fix framing already modelled one file over
  (`tests/b0394-stdlib-wrong-kind-args-belt.test.ts:3-6`).
- **Kind:** test-infrastructure / doc drift (semantic) — a witness header
  whose design-brief quote was reversed by an identified later commit.
- **Related:**
  - 0394 (fixed 0.397.0) — the reversing fix; its §Residuals item 3 names
    this exact site ("b0366's header quotes the pre-0394 design-brief
    sentence … that quote/line-citation is now stale … Follow-up sweep
    material") and left it byte-exact deliberately (lane rule: no sibling
    citation chasing).
  - 0405 (fixed 0.415.0) — its §Fix Residuals item 1 re-adjudicated the same
    site and declined to fold it into the mechanical citation sweep because
    "re-quoting rewrites a claim's meaning, outside a mechanical citation
    sweep and outside this lane's STOP-on-meaning bound. Follow-on." This
    report is that follow-on.
  - 0402 (fixed 0.400.0) — deepened the reversal: the `"integer"` arm now
    checks integrality too, so the belt consults `params` at two levels.
  - [0134](./0134-params-shift-induced-stale-citations.md)
    (fixed 0.198.0) — the citation-convention parent. Its do-not-file class
    covers "pre-existing, corpus-wide, position-only drift **with substance
    intact**"; this instance fails the class on both axes (substance
    reversed; created by one identified fix commit).
  - [0336](./0336-stale-lexical-environment-cite-in-lpa-comment.md)
    (fixed 0.308.0) — precedent that a single stale comment cite in a test
    file is filed and fixed as its own report.
  - [bug 0421](./0421-0389-shift-stale-cites-outside-0405-enumeration.md) — the mechanical counterpart of the same
    0405-drawn split: 0389-shift, position-only `grammar.md:N` drift whose
    remedy is a citation re-pin with no meaning change. This report is the
    semantic side (re-quoting rewrites a claim's meaning). Different
    originating commit (0394 vs 0389), no file overlap; do not merge.
- **Affected** (verified at `04579e12`, v0.415.0):
  - `tests/b0366-join-element-laundered-belt.test.ts:21–23` — "The bug-0315
    arity belt sits in the SAME function (stdlib-array.ts:87-89) and checks
    arity ONLY (stdlib-string.ts:65-66: \"the belt does not consult `params`
    — arity is its only concern\"), so no element-kind belt exists." Every
    clause is now false or mispointing (see below).
  - `tests/b0366-join-element-laundered-belt.test.ts:16–17` — the same
    header cites the join element walk at `stdlib-array.ts:101-106`; the
    walk now sits at `:106–111` (`case "join"` head at `:106`, `join`
    return at `:111`; `:101-106` is the `checkArrayJoin` doc comment) —
    position drift in the same block, sweep it in the same edit.
  - `src/runtime/stdlib-string.ts:65–66` — the cited lines now read: "parse
    check resolves against (the runtime dispatcher belt reads `params` /
    too, as of bug 0394 — arity and kind are its two concerns)." The quoted
    sentence exists nowhere in `src/**` (`grep -rn "arity is its only
    concern" src/` → no match).
  - `src/runtime/stdlib-array.ts:87–88` — the cited "arity belt" lines now
    hold the comment "by the bug-0394 KIND check (same laundered-receiver
    gap, one level down), / so the belt now covers both arity and kind" —
    the pointed-at content contradicts the citing sentence; the arity throw
    itself is at `:91–92`, the kind call at `:94`.
  - Contrast (correct handling of the same quote):
    `tests/b0394-stdlib-wrong-kind-args-belt.test.ts:3–6` marks it
    "pre-fix: … — superseded post-fix: that same `StdlibMemberSignature`
    doc now records that the belt reads `params` for kind too."
- **Observed at:** v0.415.0 (`04579e12`), offline — `sed`/`grep` over the
  test header and the two runtime files; no probe needed (documentary).

## Summary

Bug 0366's witness header explains why the join element walk was needed by
describing the runtime belt's scope: arity only, belt does not consult
`params`, "so no element-kind belt exists" — with a supporting quote
attributed to `stdlib-string.ts:65-66`. Bug 0394 (0.397.0) reversed that
design: `assertStdlibArgumentKinds` now runs in all three dispatchers
directly after the arity check, reading the same `params` descriptors the
parse gate uses, and the `StdlibMemberSignature` doc comment — at exactly
the cited lines — was rewritten to say so. Bug 0402 (0.400.0) widened the
`"integer"` arm further. The b0366 header was left byte-exact through both
fixes (each recorded the debt as a residual; neither filed the follow-on).
At pin the header asserts a reversed design claim in present tense, quotes a
sentence that no longer exists anywhere in the tree, and its line-cites
resolve to text stating the opposite.

## Reproduction

```
sed -n '16,23p' tests/b0366-join-element-laundered-belt.test.ts
# …element walk cite (src/runtime/stdlib-array.ts:101-106)…
# "The bug-0315 arity belt sits in the SAME function (stdlib-array.ts:87-89) and checks
#  arity ONLY (stdlib-string.ts:65-66: \"the belt does not consult `params`
#  — arity is its only concern\"), so no element-kind belt exists."
sed -n '63,66p' src/runtime/stdlib-string.ts
# "…the per-parameter type descriptor the `stdlib-arg-type-mismatch`
#  parse check resolves against (the runtime dispatcher belt reads `params`
#  too, as of bug 0394 — arity and kind are its two concerns)."
grep -rn "arity is its only concern" src/        # no match — the quoted sentence is gone
sed -n '86,94p' src/runtime/stdlib-array.ts      # arity throw :91-92, kind call :94
```

## Expected behaviour

The repo treats live test files as maintained artefacts whose comments make
testable claims (`docs/STYLE.md` §Claims: "Every claim is testable or is
removed"). A header sentence describing the CURRENT belt design must
describe the shipped belt; a quoted source sentence must exist at (or near)
its cited lines. The house pattern for a superseded design quote is the
b0394 header's own "pre-fix: … superseded post-fix: …" framing.

## Actual behaviour / root cause

0394's fix rewrote the `StdlibMemberSignature` doc comment it quoted but,
per its lane rule ("this lane does not chase sibling citations"), did not
touch b0366's header; 0405's mechanical re-pin sweep then explicitly
excluded it because fixing it requires rewriting a claim's meaning, not a
number. Both recorded it as follow-up material; no follow-up existed until
this report. Net: a reader debugging a b0366 red (the join element belt) is
told no kind belt exists and that the belt ignores `params`, when
`assertStdlibArgumentKinds` runs immediately upstream of the join arm and
can itself throw for a wrong-kind separator — the first hypothesis such a
reader must form is one the header forecloses.

## Why it matters

Lowest impact class, but the drift is semantic, not positional: the header
actively asserts the negation of the shipped design at the exact seam the
witness exercises (the `evaluateArrayMember` belt stack). Both prior fix
records demand the follow-on; leaving it unfiled discards their recorded
debt. The 0134 gate cannot catch it (the citation-symbol-form gate's
ratchet does not cover `stdlib-string.ts`/`stdlib-array.ts`, and no gate
reads quote semantics).

## Non-goals

- Any assertion, fixture, or verdict change in b0366 — the edit is
  comment-only; the suite must stay green byte-for-byte on verdicts.
- The belt implementation and its doc comments (correct at pin).
- The b0394 header (already correctly framed).
- Position-only drift elsewhere in the b0366 header beyond the block being
  rewritten (the `:101-106` walk cite is folded in only because it sits in
  the same sentence run).

## Fix

Comment-only rewrite of `tests/b0366-join-element-laundered-belt.test.ts`
lines 16–23 (the "TWO unbelted sinks" block's belt description). Options:

1. Re-frame historically, mirroring b0394's pattern: "…the bug-0315 arity
   belt (pre-0394: \"the belt does not consult `params` — arity is its only
   concern\") checked arity ONLY at the time, so no element-kind belt
   existed; post-0394 the same belt reads `params` for kind too
   (`assertStdlibArgumentKinds`, stdlib-string.ts), and the element walk
   this file locks remains the join-specific VALUE belt." Update the two
   line-cites (`stdlib-array.ts:87-89` → the current arity/kind belt block,
   `:101-106` → the current walk) or convert them to symbol form
   (`evaluateArrayMember`, `assertStdlibArgumentKinds`) per STYLE.md
   §Citations — symbol form is recommended: this header has now gone stale
   through two consecutive fixes, which is the exact decay 0134's
   convention exists to stop. Recommended.
2. Delete the parenthetical quote and the ", so no element-kind belt
   exists" clause, keeping only the still-true arity-belt placement fact.
   Smaller, but loses the pre-fix rationale the witness header narrates.

Since the file is bug 0366's witness (a protected surface), this report
grants the authorization for that comment-block edit and nothing else in
the file — the 0134 constraint-1 pattern.

## Provenance

fix-residuals-5 sweep over the 0402–0418 fix round: developed from
0405 §Fix Residuals item 1 (named follow-on), whose parent is 0394
§Residuals item 3. All four cited positions re-verified at `04579e12`;
`grep` proved the quoted sentence absent from `src/**`. Dup check: README
index carries no report on this header; 0394/0402/0405 read in full — each
names, none files.
