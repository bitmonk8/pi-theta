---
id: pending
title: "Bug 0126's 0.107.0 Verification names cell `e4` as the `unprovableBindings` marking's witness (\"dropping only the `unprovableBindings` marking reds exactly `e4`\"), but 85770a8c (bug 0190) flipped e4 to a fix-produced `fn-arg-type-mismatch` emission, and its banner says the ledger \"is left for that report to move\"; no note on 0126"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0126-plain-for-binds-no-loop-variable.md:1305-1311
  - tests/plain-for-loop-variable-element-type.test.ts:1139-1165
  - tests/plain-for-loop-variable-element-type.test.ts:1215-1226
  - tests/plain-for-loop-variable-element-type.test.ts:72-73
  - docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md:961-966
  - docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md:995-997
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0126's 0.107.0 Verification names cell `e4` as the `unprovableBindings` marking's witness ("dropping only the `unprovableBindings` marking reds exactly `e4`"), but 85770a8c (bug 0190) flipped e4 to a fix-produced `fn-arg-type-mismatch` emission, and its banner says the ledger "is left for that report to move"; no note on 0126

## Observation
Bug 0126's `## Fix (0.107.0)` Verification names cell `e4` of `tests/plain-for-loop-variable-element-type.test.ts` as the single-cell witness for the `unprovableBindings` marking. Dropping only the marking "reds exactly `e4`". At 3d05fd46, e4 was "PIN e4: an iterand that is not itself a proof leaves the element unprovable". Commit 85770a8c (bug 0190, v0.111.0) made a declared member read a proof. The same commit retitled e4 to "RED e4: a PROVEN member iterand's element is judged at the fn-arg slot" and changed it to assert one `theta/parse/fn-arg-type-mismatch`. The cell's new banner says e4 is now a fix-produced emission and no longer the marking's witness, and that "The file header's ledger is bug 0126's own bookkeeping and is left for that report to move." Bug 0190's discharge notes go to 0136 and 0050 only. 0126 mentions 0190 twice, but neither mention concerns e4.

## Evidence
Claim side, `docs/bugs/0126-plain-for-binds-no-loop-variable.md:1305-1311`:
```
- Verification: SOLID, all four obligations discharged with quoted evidence.
  - Neutralisation — replacing the arm with its pre-fix single line reds the
    witness at **exactly** the 21 rows its own ledger calls fix-produced, with
    every regression pin staying green; `u9`, `u12e`, `u13me` and `n1` red as
    authorized. Dropping only the `unfoldAlias` reds exactly `f1`; dropping
    only the `unprovableBindings` marking reds exactly `e4`. Every restore
    verified byte-exact by blob hash. `u13r` correctly does **not** red: its
```

Witness today, `tests/plain-for-loop-variable-element-type.test.ts:1139-1140`, `:1151-1155`, `:1158-1163`:
```
// e4 was written as the `unprovableBindings` mirror's witness, on the premise
// that a MEMBER iterand is not a proof — and it named its own external flip
...
// The MIRROR ITSELF IS UNTOUCHED by that re-derivation. The `for` arm still
// copies the `par for` arm's marking, which is what bug 0126 establishes and
// bug 0190 does not disturb; what moved is the iterand's verdict, not the rule
// that reads it. The marking's own witnesses are the UNPROVEN iterand classes
// of group (g), where the loop variable is a withheld binder and every sink
...
// e4 is therefore a FIX-PRODUCED EMISSION for this report as well, and no
// longer the both-directions regression pin the file header lists it as: remove
// the element binding in `walkStmt`'s `case "for"` and the loop variable is a
// withheld binder again, the argument sink withholds, and this row's list goes
// empty. The file header's ledger is bug 0126's own bookkeeping and is left for
// that report to move. The other side of the same flip is row x11 of
```
`:1215` and `:1221-1225`:
```
  it("RED e4: a PROVEN member iterand's element is judged at the fn-arg slot", () => {
...
      "e4",
      E4_UNPROVABLE_ITERAND,
      ["for x@11:12-11:16", "let _r@12:5-12:18"],
      one(FN_ARG, fnArg("g", 0, "s", "string", "integer")),
      "a member read of a declared field on a resolved object schema is a proof (bug 0190), so the element it supplies is a proof too and every iteration genuinely hands `g` an `integer`",
```
Header ledger `:72-73`: "(e) e1, the fn-arg composition; e4, the member-iterand proof, moved here / under bug 0190's authority (see the group-(e) banner)."

Re-pinning record, `docs/bugs/0190-fn-arg-sink-withholds-provable-member-reads.md:961-966`:
```
  3. **`tests/plain-for-loop-variable-element-type.test.ts`'s header ledger.**
     The e4 reclassification was applied here under a bounded self-authorization
     (one enumeration line plus its attribution) because this fix is what made
     the ledger's "holds in both directions" claim false and the file's own
     group-(e) banner already contradicted it. The rest of that ledger is bug
     0126's bookkeeping and was left alone.
```
`:995-997`: "- **Discharge notes appended:** bug 0136's document (residual 1 discharged by / this fix); bug 0050's document (its coordination note's "remains this report's / to fix" clause discharged for the field half)."

Searches run this session:
- `git show 85770a8c -- tests/plain-for-loop-variable-element-type.test.ts | grep -E '^[-+].*(it\(|toEqual)'` → `-it("PIN e4: an iterand that is not itself a proof leaves the element unprovable"` / `+it("RED e4: a PROVEN member iterand's element is judged at the fn-arg slot"` and `+).toEqual([\`error ${FN_ARG} @12:16-12:17\`]);`.
- `git log --format='%h %ad %s' --date=short -- tests/plain-for-loop-variable-element-type.test.ts` → 3d05fd46 (bug 0126), 85770a8c (bug 0190), 074740b1 (bug 0370), then four `quality:` commits.
- `grep -n 0190 docs/bugs/0126-plain-for-binds-no-loop-variable.md` → 2 hits: `:1377` (residual 4's 0194 discharge: "bug 0190 (0.111.0) made `p.xs` a proof — so 0194's witness is built on an erased receiver instead") and `:1412` (a non-goal). Neither mentions e4 or the marking's witness.
- `grep -n e4 docs/bugs/0126-plain-for-binds-no-loop-variable.md` → 1 hit, `:1310` (the claim above).
- `grep -n "^## " docs/bugs/0126-plain-for-binds-no-loop-variable.md` → coordination notes for 0125 (`:1114`), 0050 (`:1133`) and 0370 (`:1415`). There is none for 0190.

## Why this is a problem
The Verification line is the record's evidence that the `unprovableBindings` marking has a discriminating witness, and it names e4. Today e4 is fixture-produced by the element binding, not by the marking. Its own banner says the marking's witnesses are elsewhere and that 0126's bookkeeping was left for 0126 to move. The house convention for a later fix moving this record's witness is visible in the same record, which has 0125, 0050 and 0370 coordination notes. Bug 0190 wrote none here. The claim held at 3d05fd46, where the removed "PIN e4 … leaves the element unprovable" shows it. Only the pointer's current resolution is at issue.

## Suggested direction (non-binding, optional)
A dated coordination note on 0126 recording that 85770a8c re-derived e4 into a fix-produced emission, and naming the marking's witness as the e4 banner does (group (g), the unproven iterand classes). The banner states the group (g) attribution. No recorded single-edit neutralisation of the marking against group (g) was found in either record.

## False-positive check
- Representations covered: bug-doc Verification pin (0126:1305-1311 quoted); test titles (the e4 `it()` string before and after, via `git show`); test file name (`tests/plain-for-loop-variable-element-type.test.ts` exists); coverage matrix (not cited by 0126); AGENTS.md gates (not a gate claim); CHANGELOG (not relied on).
- 0126 residual 4's discharge text (`:1377`) acknowledges that 0190 made `p.xs` a proof, but only for bug 0194's fixture choice. It does not re-point the Verification line's e4 citation, so the record does not contradict itself on this point.
- Other pins in the same Verification line still resolve. `f1` exists (6 hits for `\bf1\b` in the file). `b4` exists (6 hits). `u9`/`u12e`/`u13me`/`u13r` sit in `tests/fn-arg-type-mismatch-wired.test.ts`, which exists.
- No pending candidate cites bug 0126 or bug 0190.

## Triage
verdict: questionable — decay verified: 0126:1310 says dropping only the `unprovableBindings` marking "reds exactly `e4`", but 85770a8c retitled e4 from "PIN e4: an iterand that is not itself a proof leaves the element unprovable" to "RED e4: a PROVEN member iterand's element is judged at the fn-arg slot". The e4 banner (test :1151-1163) says e4 is now produced by the element binding, not the marking, and leaves the ledger to 0126. 0190:995-997 appended discharge notes only to 0136 and 0050. 0126 has no 0190 coordination note, and its two 0190 mentions (:1377, :1412) do not concern e4. The equivalent is ambiguous: the banner names group (g) as a whole (six cells, "PIN g1".."PIN g6"), and neither record has a single-cell neutralisation result for the marking. So re-pointing "reds exactly `e4`" needs a new measurement or rewording, which is a human's call. 85770a8c changed e4 rather than deleting it, and no other intake file or PTQ cites 85770a8c. (Candidate lacked its own ## Triage heading; triage added it.) (triage: claude-opus-5-5)
