---
id: PTQ-1697
title: "Bug 0050 still cites u13e as a withheld positive after dcff3f43 made it an emission witness."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md:648-654
  - tests/fn-arg-type-mismatch-wired.test.ts:3133-3150
  - tests/fn-arg-type-mismatch-wired.test.ts:3166-3174
  - docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md:1029-1036
  - docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md:1192-1196
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0050 still cites u13e as a withheld positive after dcff3f43 made it an emission witness.

## Observation
Bug 0050's fix record names u13e as a withheld true positive and attributes its future flip to the marking-channel identity leak. Commit dcff3f43, bug 0199's fix, re-pinned u13e to assert a diagnostic. The cell's comment and the successor fix record both expressly confirm that the marking-guard flip has happened. Bug 0050 has no coordination note recording that its u13e pin now witnesses an emission instead of withholding.

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

Witness title and flip disclosure, `tests/fn-arg-type-mismatch-wired.test.ts:3133-3136`:
```ts
  it("u13e: an arm body that IS its binder no longer withholds the outer binding's verdict", () => {
    // The marking channel, restated as the emission it used to withhold. Two
    // independent conditions could flip this cell and this comment named both.
    // ONE IS NOW TAKEN. The `let` arm's marking guard adds the object
```

The same comment, :3146-3150:
```ts
    // reads unprovable for the rest of the walk. Bug 0199
    // (docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md) keys that
    // mark to the binding it was recorded for, which restores the emission below
    // — a true positive, since `x` IS the integer `1` — and is the authority
    // under which this cell asserts it.
```

Current assertion, :3166-3174:
```ts
    const doc = parse(U13E_ARM_IDENTITY_MARKING);
    expect(
      argRange(doc, "g", 0),
      "PRECONDITION: the argument `x` sits at the top-level call on body line 7",
    ).toEqual(range(7, 11, 7, 12));
    expect(
      locatedHits(doc, CODE),
      `u13e — a mark recorded for \`m\` must not withhold the outer \`x\`, whose own \`let x = 1\` is a proof; TYPE-9 owes the mismatch at the argument node the PRECONDITION above pins. Diagnostics: ${render(doc)}`,
    ).toEqual([`error ${fnArgMessage("g", 0, "s", "string", "integer")} @${at(range(7, 11, 7, 12))}`]);
```

Successor confirmation, `docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md:1029-1036`:
```text
  - **Cell `u13e` restated under this report's authority, citing bug 0145** — a
    cross-report collision the document did not know about; see *Residuals* item
    1 and *Discharge notes*. `tests/fn-arg-type-mismatch-wired.test.ts` cell
    `u13e` asserts `fn 'g' argument 0 ('s') type mismatch: expected string, got
    integer @7:11-7:12`, its `argRange` PRECONDITION byte-identical, its comment
    re-derived to name this report as the marking-guard flip authority and bug
    0145 as the owner of the REMAINING flip day (arm-scope typing). The other 86
    cells keep byte-identical assertions.
```

Its discharge inventory, :1192-1196:
```text
- **Discharge notes appended**: bug 0194's §Fix *Residuals* item 1 (this report's
  origin, discharged with its `Ok(1)`-pair correction), and a coordination note on
  bug 0145 recording that its §Reproduction group (a) is discharged while its
  group (b) is byte-unmoved. **Neither status was flipped — 0145 stays open**, its
  S2 subject intact.
```

Searches run in this session:
- `git log --format='%h %s' -S'u13e: an arm body that IS its binder no longer' -- tests/fn-arg-type-mismatch-wired.test.ts` — 1 commit hit, dcff3f43, bug 0199, v0.120.0.
- `grep -nE '0126|0199|3d05fd46|dcff3f43' docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md` — 2 matching lines, :653 and :655, both mentioning 0126; no mention of 0199 or dcff3f43. The full appended coordination/discharge sections were read and do not address u13e's flip.

## Why this is a problem
The claim→evidence pointer now leads to the opposite diagnostic disposition. The test still exists and proves the successor's emission, but no longer proves the withholding attributed to u13e in 0050. A dated coordination note would preserve the historical record while making the current witness disposition traceable; the finding does not adjudicate either implementation's truth.

## Suggested direction (non-binding, optional)
Append a dated coordination note recording dcff3f43 / bug 0199 as u13e's marking-guard flip, with the existing u13e cell as the current emission witness and the successor record as its disposition.

## False-positive check
The test distinguishes the marking-guard flip from the still-open arm-scope question; this finding does not claim that bug 0145 as a whole is closed. Both the current assertion and the successor's explicit re-pinning account were opened. The witness is in the default suite and is current proof under the supplied preflight premise; no tests were executed. PTQ-1622 concerns dcff3f43's other flipped pin, d6 in bug 0194, and does not cite this claim in bug 0050. The other candidate for 0050 concerns the separate 3d05fd46 loop-element flip, not u13e. No test-code design, behaviour change, or mechanically gated citation form is requested.

## Triage
verdict: confirmed — Both stated searches reproduce; dcff3f43, bug 0199 §Fix and the current u13e comment confirm the withholding-to-emission flip, while bug 0050 has no coordination note and no deliberate no-note choice was found. PTQ-1622 covers 0194/d6, not 0050/u13e; dcff3f43 flips rather than deletes witnesses, so deleting-SHA dedupe does not apply. Append verbatim heading "### Coordination note — 2026-10-28, bug 0199 (0.120.0)" followed by a blank line and paragraph "Commit dcff3f43 (bug 0199 fix, v0.120.0) re-pinned cell u13e in tests/fn-arg-type-mismatch-wired.test.ts from withholding to asserting fn 'g' argument 0 ('s') type mismatch: expected string, got integer @7:11-7:12. The marking-guard flip is taken; bug 0145's arm-scope question remains open. The wording above stands as a dated record; current disposition: docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md." (triage: claude-opus-5-5)
