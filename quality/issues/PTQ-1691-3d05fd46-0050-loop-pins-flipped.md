---
id: PTQ-1691
title: "Bug 0050 still cites u12e and u13me as withheld positives after 3d05fd46 flipped their verdicts."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md:648-654
  - tests/fn-arg-type-mismatch-wired.test.ts:2317-2339
  - tests/fn-arg-type-mismatch-wired.test.ts:2793-2815
  - docs/bugs/0126-plain-for-binds-no-loop-variable.md:1184-1190
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0050 still cites u12e and u13me as withheld positives after 3d05fd46 flipped their verdicts.

## Observation
Bug 0050's fix record names u12e and u13me as withheld true positives with future flip conditions. Commit 3d05fd46, bug 0126's fix, took the plain-loop flip condition and changed those cells to assert emissions. Both cells still exist in the named default-suite witness, but neither now asserts the withholding attributed to it. Bug 0050 contains no coordination note recording that these pins flipped.

## Evidence
Claim, `docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md:648-654`:
```text
  enclosing-scope arm typing). Recorded, not filed: the `shadowedNames`
  over-approximation suppressing a self-shadow emission (deferral inside the
  adjudicated conservative reading); the five sentinel render shapes (pinned
  by cell u13r, verdicts byte-identical to HEAD's); the withheld true
  positives u12e/u13me/u13e (pinned with named flip conditions — the plain
  `for` element gap is bug 0126's, the marking-channel identity leak is bug
  0145's root); pre-existing position-only citation drift (bug 0134's class).
```

Current u12e, `tests/fn-arg-type-mismatch-wired.test.ts:2328-2339` (its title at :2317 says it “fires, under bug 0126”):
```ts
    const doc = parse(U12E_FOR_PROVEN_ITERAND);
    const argument = argRange(doc, "g", 0);
    expect(
      argument,
      "PRECONDITION: the argument `x` sits inside the loop body on body line 5",
    ).toEqual(range(5, 26, 5, 27));
    expectOneFnArgMismatch(
      doc,
      fnArgMessage("g", 0, "s", "string", "integer"),
      argument,
      "u12e — bug 0126 binds the plain `for` variable to the iterand's element type, so this PROVEN iterand's element is a genuine proof and the mismatch fires",
    );
```

Current u13me, `tests/fn-arg-type-mismatch-wired.test.ts:2806-2815` (its title at :2793 says it “fires, under bug 0126”):
```ts
    const doc = parse(U13ME_STRUCTURAL_SUP);
    const site = letRange(doc, "s");
    expect(
      site,
      "PRECONDITION: the typed `let s` sink sits inside the `for` body on body line 4",
    ).toEqual(range(4, 16, 4, 41));
    expect(
      locatedHits(doc, LET_RHS_CODE),
      `u13me — bug 0126 binds the plain \`for\` variable to the iterand's element type, so a structural sink over a genuinely proven element fires for real. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${letRhsMessage("s", "array<integer>", "integer")} @${at(site)}`]);
```

Flip confirmation, `docs/bugs/0126-plain-for-binds-no-loop-variable.md:1184-1190`:
```text
  - `tests/fn-arg-type-mismatch-wired.test.ts` — bug 0050's 84-cell witness:
    `u9`, `u12e` and `u13me` flip from deferral to the fired true positive each
    named as its own flip condition; `u13r` is **re-pointed subject-preserving**
    onto an unannotated-`fn`-parameter binder so its `array<<withheld>>`
    assertion stays byte-identical and bug 0143 keeps its only in-tree pin. The
    narrative passages this fix falsified are rewritten to the shipped
    mechanism. No other cell's assertion moves.
```

Searches run in this session:
- `git log --format='%h %s' -S'over a PROVEN iterand fires, under bug 0126' -- tests/fn-arg-type-mismatch-wired.test.ts` — 1 commit hit, 3d05fd46, bug 0126, v0.107.0.
- `grep -nE '0126|0199|3d05fd46|dcff3f43' docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md` — 2 matching lines: :653 names the then-open gap; :655 lists the discharge notes appended **by 0050** to other records. Neither records the later flip. The complete appended coordination/discharge sections were also read; they concern 0136, 0190 and the corpus gate, not this flip.

## Why this is a problem
The claim→evidence chain no longer resolves as stated: following the withheld-positive pins finds assertions requiring diagnostics, not deferrals. The successor record expressly confirms that these are the flipped cells. This concerns witness decay, not whether either historical or current behaviour is correct; the dated fix record can stand while a coordination note identifies its pins' current disposition.

## Suggested direction (non-binding, optional)
Record the 3d05fd46 / bug 0126 supersession in an appended dated coordination note, naming u12e and u13me as current emission witnesses rather than withholding witnesses.

## False-positive check
The future flip condition is acknowledged in 0050; this finding is not about that honesty marker, but about the missing record that the named condition has since been taken. Each cited cell's present assertion was opened separately, and 0126's own fix confirms the flip. These are default-suite tests, so the brief's green preflight supplies current proof without executing tests. Existing PTQ-1638 concerns a different pin in bug 0126's own record (e4), not these pins in bug 0050. No test, code, diagnostic contract or gate-enforced citation form is challenged. The separate u13e flip is not attributed to this commit.

## Triage
verdict: confirmed — Both searches reproduce; current u12e/u13me assert emissions, and 3d05fd46 plus bug 0126 §Fix explicitly confirm their flips. Bug 0050 has no corresponding coordination note; no deliberate no-note choice or duplicate was found (PTQ-1638 concerns e4, and the sibling intake concerns dcff3f43/u13e). Append verbatim heading "### Coordination note — 2026-10-28, bug 0126 (0.107.0)" followed by a blank line and paragraph "Commit 3d05fd46 (bug 0126 fix, v0.107.0) flipped cells u12e and u13me in tests/fn-arg-type-mismatch-wired.test.ts from withheld true positives to emission witnesses by binding a plain for variable to its proven iterand's element type. Cell u12e now asserts fn-arg-type-mismatch (expected string, got integer); u13me now asserts let-rhs-type-mismatch (expected array<integer>, got integer). The wording above stands as a dated record; current disposition: docs/bugs/0126-plain-for-binds-no-loop-variable.md." (triage: claude-opus-5-5)
