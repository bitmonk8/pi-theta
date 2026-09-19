---
id: PTQ-0917
title: test title claims a load failure "surfaces one theta-system-note" but the body asserts only "at least one"
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/load-phase-pre-eval-routing.test.ts:44-70
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# test title claims a load failure "surfaces one theta-system-note" but the body asserts only "at least one"

## Observation
`tests/load-phase-pre-eval-routing.test.ts`'s first `it()` is titled "a load
failure surfaces one theta-system-note (triggerTurn:false) and does not
abort session_start". The body never asserts that exactly one
`theta-system-note` was surfaced: it filters `harness.notes` down to
error-severity notes, asserts only `errorNotes.length` is
`toBeGreaterThanOrEqual(1)`, then locates one matching note by its
`theta/load/unknown-tool` code and asserts that note's envelope shape. A
second, third, or Nth error-severity note carrying any other code — or even
a second note also carrying `theta/load/unknown-tool` — would not fail this
test, so the name's claim of a singular note is not what the assertions
check.

## Evidence
tests/load-phase-pre-eval-routing.test.ts:44-70 (re-read immediately before
filing):
```ts
  it("a load failure surfaces one theta-system-note (triggerTurn:false) and does not abort session_start", async () => {
    // A clean control theta AND a failing theta, so the assertion distinguishes
    // "routes the failure" from "drops everything".
    writeFileSync(join(thetaDir, "goodtool.theta"), GOOD_THETA, "utf8");
    writeFileSync(join(thetaDir, "unknowntool.theta"), BAD_THETA, "utf8");

    const harness = makeHarness(workspace);
    await harness.fireSessionStart();

    // session_start not aborted: the clean theta still registered.
    expect(harness.commands.has("goodtool")).toBe(true);
    // The failing theta was dropped (un-registered).
    expect(harness.commands.has("unknowntool")).toBe(false);

    // The load failure routed onto the `theta-system-note` channel with the
    // error-severity `theta/load/unknown-tool` diagnostic and triggerTurn:false —
    // the SAME envelope shape as the reload path's ERR-7 note.
    const errorNotes = loadErrorNotes(harness.notes);
    expect(errorNotes.length).toBeGreaterThanOrEqual(1);
    const note = errorNotes.find((n) =>
      (n.details!.diagnostics ?? []).some(
        (d) => d.code === "theta/load/unknown-tool",
      ),
    );
    expect(note).toBeDefined();
    expect(note?.customType).toBe("theta-system-note");
    expect(note?.triggerTurn).toBe(false);
```

Exact search: `grep -n "toBeGreaterThanOrEqual(1)\|toHaveLength(1)\|toBe(1)" tests/load-phase-pre-eval-routing.test.ts` → one hit, line 62,
`toBeGreaterThanOrEqual(1)`; there is no assertion anywhere in this file
constraining `harness.notes.length` or `errorNotes.length` to exactly 1.

## Why this is a problem
A reader following the title alone would take this test as proof that a
load failure produces exactly one note on the channel — the same
"exactly-one, not merely at-least-one" distinction that this repository's
own bug 0255 (a sibling drop-path bug, witnessed by
`tests/lex-drop-single-delivery.test.ts` in this same review scope) treats
as the entire defect: a duplicated delivery of the same failure is a
regression the "surfaces one" reading would expect this test to catch. But
the assertion sequence — `toBeGreaterThanOrEqual(1)` followed by locating
one note via `.find()` — stays green whether the harness delivers one
matching note or several: nothing here counts `errorNotes`, counts
`harness.notes`, or asserts uniqueness of the rendered note. The test
verifies "the failure is routed onto the channel with the right envelope",
not "exactly one note was surfaced", which is a materially weaker guarantee
than the title states.

## Suggested direction (non-binding, optional)
None proposed; renaming or tightening the assertion is a fix-stage decision.

## False-positive check
- Gate-pin check: `tests/load-phase-pre-eval-routing.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `harness.notes` is a genuine recording array read
  by other assertions in this file (`errorNotes.length`,
  `note?.customType`); this finding does not dispute the double, only that
  the title's "one" claim is not what the assertions enforce — not a
  MUST-NOT negative witness.
- docs/bugs/ signature search: `grep -n "load-phase-pre-eval-routing" docs/bugs/*.md` → 0 hits; this file is not cited as a witness for any open bug, so this is not a documented correct-reason red. `npx vitest run tests/load-phase-pre-eval-routing.test.ts` → 2 passed (2) at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "load-phase-pre-eval-routing" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the `it()` — only that its name overclaims what its body verifies.
- Coverage check: this is not a claim that a test for exact-one-note delivery is missing (that would be a coverage note, out of scope for this lens); it is a claim that the EXISTING test's name does not match what its EXISTING body checks.
- Bug-shape check: bug 0255 (double-delivery on a dropped theta) is fixed
  (`docs/bugs/0255-lex-phase-diagnostics-double-deliver-on-dropped-theta.md`,
  "Status: fixed (0.247.0)"), and this file's own load-path is unaffected by
  that bug's route (it is the pre-eval ERR-6 path, not the LEX-drop path);
  this finding does not allege the production code double-delivers today —
  only that this test's title would not catch it if it started to.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/load-phase-pre-eval-routing.test.ts:44-70 (title wording unchanged since introducing commit 4a38a4bf; 2bc69157 only renamed Loom→Theta); the stated grep reproduces (one hit, :62 `toBeGreaterThanOrEqual(1)`) and nothing in the body reads `errorNotes.length` or `harness.notes.length` against 1 — the `≥ 1` + `.find()` sequence is green for one or N matching notes, so the title's "surfaces one theta-system-note" is a count claim the assertions structurally cannot witness, the same shape as confirmed/fixed PTQ-0568 ("reports the error once"); "one" is a count word in this repo's vocabulary, not an article — the file header (:12-14) repeats "surfaces one `theta-system-note`" and the spec it cites (docs/spec_topics/errors-and-results/error-model.md:102) uses "emits this surface as **one** `theta-system-note` … not two notes" normatively; docs/bugs and coverage-matrix citations → 0 each, bug 0255 is `Status: fixed (0.247.0)` with witness tests/lex-drop-single-delivery.test.ts as claimed, `npx vitest run` → 2 passed; location under tests/, D7 misleading-name class, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate — PTQ-0632 (resolved), PTQ-0894 and same-wave d7-10 track harness/workspace duplication in this file, none the title/body count mismatch (triage: claude-fable-5-1)
