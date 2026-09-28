---
id: pending
title: "Bug 0245's 0.226.0 fix record cites witness cell b0245-f1 as the fence asserting that `enum E { A,` at EOF stays silent. 66892f19 (bug 0259) rewrote b0245-f1 to assert `theta/parse/enum-body-unclosed` and added no note to 0245's record"
lens: D10
status: intake
verdict: pending
locations:
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:577-582
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:492-493
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:603
  - tests/schema-body-unclosed-at-eof.test.ts:104-107
  - tests/schema-body-unclosed-at-eof.test.ts:598-619
  - docs/bugs/0248-malformed-escaping-tools-entry-containment-unwitnessed.md:572-602
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0245's 0.226.0 fix record cites witness cell b0245-f1 as the fence asserting that `enum E { A,` at EOF stays silent. 66892f19 (bug 0259) rewrote b0245-f1 to assert `theta/parse/enum-body-unclosed` and added no note to 0245's record

## Observation
`docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` is `fixed (0.226.0)`. Its *Residuals* item 1 says the `enum` sibling "stays silent", that `enum E { A,` at EOF "is still observationally identical to `enum E { A }`", and that this is "asserted as a fence by witness cell b0245-f1". Commit `66892f19` (bug 0259, v0.244.0) rewrote that cell in `tests/schema-body-unclosed-at-eof.test.ts`. It is now titled "b0245-f1: `enum E { A,` at EOF draws bug 0259's `theta/parse/enum-body-unclosed`" and asserts an error triple at `4:8-4:9`. Its describe block is retitled "no longer silent (retired by bug 0259)". The 0245 record has not been touched since its fix commit `6a1a605b` and does not mention 0259. Its Adjudications (`:492-493`, "The `enum` sibling stays silent") and Pinned dispositions (`:603`, "the `enum` variant loop") still describe the pre-0259 state.

## Evidence
Claim side, `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:577-582` (re-read before filing):
```
  1. *The `enum` sibling stays silent.* `enum E { A,` at EOF is still
     observationally identical to `enum E { A }` — `parseEnumVariants`'s loop
     bound has the same silent EOF exit. §Non-goals fenced it and the scope call
     kept the doc's letter, so it is untouched and asserted as a fence by
     witness cell b0245-f1. Worth its own filing; a row reading "a declaration
     body not closed by a matching `}`" would reach it.
```
`:492-493`: "ALONE — the doc's letter. The `enum` sibling stays silent (§Non-goals);".

Evidence side, `tests/schema-body-unclosed-at-eof.test.ts` (opened):
- `:598` `describe("b0245 (f) — the \`enum\` variant loop, no longer silent (retired by bug 0259)", …)`.
- `:599` `it("b0245-f1: \`enum E { A,\` at EOF draws bug 0259's \`theta/parse/enum-body-unclosed\`", …)`. The comment at `:600-606` reads: "FLIPPED under bug 0259's named authority … Clause (6) as originally written asserted the silence of `parseEnumVariants`' EOF exit as this bug's §Non-goals fence; bug 0259 is that fence's own filing, so the silence is gone."
- `:616-619`: `expect(triples(truncated), …).toEqual([{ severity: "error", code: ENUM_UNCLOSED, at: "4:8-4:9" }]);`
- `:104-107`, file header: "(f): FLIPPED BY BUG 0259 — this bug's `enum` §Non-goals fence, retired by docs/bugs/0259-unclosed-enum-variant-list-at-eof-loads-clean.md … The row now asserts bug 0259's refusal, not this bug's silence."

Searches (all run this session):
- `git blame -s` on `:598` and `:599` → `66892f194` (2 of 2).
- `grep -c "FLIPPED BY BUG 0259\|retired by bug 0259" tests/schema-body-unclosed-at-eof.test.ts` → 3.
- `grep -c "0259" docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` → 0. `grep -c -i "coordination note"` on the same file → 0.
- `git log --format=%h 66892f19..HEAD -- docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md | wc -l` → 0. `git show 66892f19 --stat --format= | grep -c "0245-"` → 0. The flipping commit edited the witness (`tests/schema-body-unclosed-at-eof.test.ts | 73 +-`) but not the record.
- The `66892f19` commit body: "ONE flip, pre-declared by 0259 §Witness: b0245-f1 (triples []→[enum-body-unclosed @4:8-4:9], registered true→false …)".

## Why this is a problem
Residual 1 names b0245-f1 as the evidence that the `enum` EOF exit is silent. A reader who follows that pointer finds the cell asserting the opposite, an error-severity refusal that blocks registration. The only disclosure is in the test file's comments and in 0259's own record. The 0245 record still says "stays silent" at `:492-493` and `:577-582`, and still lists "the `enum` variant loop" as a pinned non-goal at `:603`. The house practice for a sibling fix that moves a record's witness is a dated coordination note in the moved record: `grep -l "^### Coordination note" docs/bugs/*.md | wc -l` → 12, including 0248 `:572-602` in this shard.

## Suggested direction (non-binding, optional)
Append a dated coordination note to 0245's record that names `66892f19` / bug 0259, states that Residual 1 is discharged there with b0245-f1 retaken to assert `theta/parse/enum-body-unclosed`, and states that 0245's other 19 cells and its own row are unmoved.

## False-positive check
- Pin existence: b0245-f1 still exists by that label. This is a changed-assertion decay, not a missing cell.
- Representations covered:
  - (1) Bug-doc Witness/Fix lines: 0245 quoted; 0 mentions of 0259, 0 coordination notes.
  - (2) Test file names and it()/describe() titles: the witness file, read and blamed at the cited lines.
  - (3) Coverage-matrix rows: `grep -c "0245\|schema-body-unclosed" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md AGENTS.md` → 0, 0, 0.
  - (4) AGENTS.md gate names: same search → 0.
  - (5) CHANGELOG, corroboration only: `CHANGELOG.md:2757` opens the bug 0259 entry. It is not in the record.
- Other filings: `grep -rl "53cd0d86\|206e0da9\|66892f19" quality/intake quality/issues`, run before filing → 0 files.
- The record's missing path for its offline witness file is a different root cause and is filed separately (`qw20260928081617-d10-05-…`). I did not dispute whether 0259's flip was right.

## Triage
verdict: questionable — decay verified: 0245 Residual 1 (:577-582) says the enum EOF exit "stays silent", "asserted as a fence by witness cell b0245-f1", and Adjudication 2 (:492-493) and Pinned dispositions (:603) say the same. But tests/schema-body-unclosed-at-eof.test.ts:598-619 (blame 66892f194 on :598-599) now asserts [error enum-body-unclosed @4:8-4:9], and its header :104-107 says "FLIPPED BY BUG 0259". 66892f19's stat touches the witness (73 +-) and not the 0245 record, the record has 0 commits since 6a1a605b, and it has 0 hits for 0259 or "coordination note" (12 other records carry one). No cell anywhere still asserts the silence, so there is nothing to re-point to: the repair is new prose (a coordination note, or rewording the residual), and that is the human's call. No duplicate: 66892f19 appears in d10-02/d10-03 only inside their search strings (their own shas are 53cd0d86/206e0da9), and d10-05 has a different root cause (triage: claude-opus-5-5)
