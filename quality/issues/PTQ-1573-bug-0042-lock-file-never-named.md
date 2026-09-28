---
id: PTQ-1573
title: Fix record 0042 rests its "Both witness files", "26 of the 108 witness cells" and "31-test witness" claims on tests/schema-alias-rhs-malformed.test.ts but never names that file anywhere
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0042-schema-decl-same-line-residue-silent.md:446-449
  - docs/bugs/0042-schema-decl-same-line-residue-silent.md:466-469
  - docs/bugs/0042-schema-decl-same-line-residue-silent.md:489-492
  - docs/bugs/0042-schema-decl-same-line-residue-silent.md:689-690
  - docs/bugs/0042-schema-decl-same-line-residue-silent.md:714-716
  - tests/schema-alias-rhs-malformed.test.ts:9-14
  - tests/schema-alias-rhs-malformed.test.ts:1248
  - tests/schema-alias-rhs-malformed.test.ts:1300
  - tests/schema-alias-union-decl.test.ts:1779
sites: 5
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Fix record 0042 rests its "Both witness files", "26 of the 108 witness cells" and "31-test witness" claims on tests/schema-alias-rhs-malformed.test.ts but never names that file anywhere

## Observation
Record 0042 is `Status: fixed (0.52.0)`. Its §Fix (0.52.0) and its later Note (0.74.0) back the fix with "Both witness files", "26 of the 108 witness cells", "this report's own 31-test witness" and "Its 31-cell witness", and they name cells e5/e6. The only test file the record names anywhere is `tests/schema-alias-union-decl.test.ts`. That is bug 0033's file, and the fix only rewrote pins n11/n24/n29 in it. The fix's own lock is `tests/schema-alias-rhs-malformed.test.ts`: fix commit `9c961f7f` added it, and its header names bug 0042. The record never mentions it. Every other record in this shard (0038, 0039, 0040, 0041, 0043, 0044) names the lock file its fix commit added, on an `**Offline lock.** \`tests/…\`` line. 0042 has no such line, so a reader cannot get from the record's quantified witness claims to the file that holds most of those cells.

## Evidence
**Claim site 1:** docs/bugs/0042-schema-decl-same-line-residue-silent.md:446-449
```
effect is the appearance of a code's emission. The verifier's branch-partition
neutralisation is the evidence — with the emission disabled, 26 of the 108
witness cells red and the remaining 82, which pin arms, ranges, statement
kinds, tail promotion, lowered `$defs` and every pre-existing diagnostic, stay
```

**Claim site 2:** docs/bugs/0042-schema-decl-same-line-residue-silent.md:466-469. The one test file named in §Fix, and its count of 77:
```
**The witness pins were rewritten, not deleted** (constraint 4). Cells n11
(both halves), n24 and n29 of `tests/schema-alias-union-decl.test.ts` carry new
expected lists and new assertion messages stating the reasoning that now holds;
the file's `it` count is unchanged at 77 and every control — the bare declared
```

**Claim site 3:** docs/bugs/0042-schema-decl-same-line-residue-silent.md:489-492
```
**Gates.** Full default suite 242 files / 3212 tests, typecheck and lint clean.
Both witness files proven red per shape by targeted neutralisation restored
byte-exact (blob hash `1e8d31ff` before and after): the segment-count branch
reds 5 cells, the cursor branch reds 21, disjointly, and the whole emission
```

**Claim site 4:** docs/bugs/0042-schema-decl-same-line-residue-silent.md:689-690 (Note — bug 0095 (0.74.0))
```
`theta/parse/malformed-alias-rhs`'s boundary set is unperturbed — this report's
own 31-test witness is green and unchanged, and the boundary family was probed
```

**Claim site 5:** docs/bugs/0042-schema-decl-same-line-residue-silent.md:714-716 (Discharge note (0.87.0))
```
where this row has no token to point at. Its 31-cell witness is green, with the
two cells §Fix constraint 4 named as deliberate holds moved under 0061's
authority (e5, the field dangling `|`) or measured unmoved (e6, the field `-1`).
```

**The unnamed witness:** tests/schema-alias-rhs-malformed.test.ts:9-14
```
// Bug 0042 — a `schema X = …` right-hand side the grammar does not derive is
// consumed in part and reported not at all: `schema X = Cat Cat` registers a
// one-arm alias and severs the author's second name into a no-op statement,
// `schema X = Cat |` drops the dangling arm inside the declaration, and
// `schema X = -1` keeps a junk `"-"` arm that lowers to the permissive `{}`
// (docs/bugs/0042-schema-decl-same-line-residue-silent.md).
```
The e5/e6 cells that claim site 5 names are in this file, not in the file the record does name:
- tests/schema-alias-rhs-malformed.test.ts:1248: `it("GREEN (e5, fixture 2a): the dangling \`|\` in a FIELD type is refused now (bug 0061)", () => {`
- tests/schema-alias-rhs-malformed.test.ts:1300: `it("GREEN (e6, fixture 3b): \`schema S { a: -1 }\` now retains \`a\` under bug 0133 §Fix (a)", () => {`
- `grep -n "e5\b\|e6\b" tests/schema-alias-union-decl.test.ts` → 0 hits.
- The pins the record does name still exist, e.g. tests/schema-alias-union-decl.test.ts:1779 `it("n11: \`schema X = Cat Cat\` keeps one arm, …`.

**The 108 is the two files together at the fix commit:**
- `git show --stat --diff-filter=A 9c961f7f` ("fix(bug-0042): … — v0.52.0") adds exactly one test file, `tests/schema-alias-rhs-malformed.test.ts` (1382 lines).
- `git show 9c961f7f:tests/schema-alias-rhs-malformed.test.ts | grep -cE "^\s*it\("` → 26 `it(` lines. One of them is the loop template at :777 over `RESIDUE_MEMBERS`, which has 6 entries (b6–b11). That gives 25 + 6 = 31 cells, the record's "31-test witness".
- `git show 9c961f7f:tests/schema-alias-union-decl.test.ts | grep -cE "^\s*it\("` → 77, the record's own count for that file.
- 31 + 77 = 108, the record's "108 witness cells".

**Cross-shard comparison:** each other fix commit in this shard adds one test file, and its record names it. `git show --stat --format= --diff-filter=A <sha> | grep tests/` for b34aaa52 (0038), 52e257bc (0039), aef82bde (0040), d88742f0 (0041), af7f932e (0043) and 61806a3a (0044) returns typeenv-prototype-names, inline-object-nested-lowering, inline-slug-name-reservation, params-block-mapping-rhs-refusal, union-generic-arm-lowering and reserved-keyword-type-position respectively. Each of those records names its file on an `**Offline lock.**` line (0038:184, 0039:231, 0040:445, 0041:464, 0043:211, 0044:290).

## Why this is a problem
The record makes quantified verification claims ("Both witness files proven red", "26 of the 108 witness cells red", "31-test witness is green", cells e5/e6). Most of that evidence sits in a file the record does not name. Its only named pointer, `tests/schema-alias-union-decl.test.ts`, holds 77 of the 108 cells and none of e5/e6. So the claim→evidence chain cannot be followed from the record: someone re-checking "31-test witness" or "e5" against the one named file finds nothing. The house format, used by every other record in this shard, carries a named lock line for exactly this purpose.

## Suggested direction (non-binding, optional)
Name `tests/schema-alias-rhs-malformed.test.ts` as the §Fix (0.52.0) offline lock, next to the `schema-alias-union-decl.test.ts` pins, so that "Both witness files" and the later notes' "31-test witness" / e5 / e6 resolve to a stated path. The claims themselves need no rewording.

## False-positive check
Searches run in this session, one for each representation:
- **Bug-doc witness lines:** `grep -c -i "witness" docs/bugs/0042-…md` → 11 lines. `grep -n -i "witness" … | grep -c "tests/"` → 2 (both `tests/schema-alias-union-decl.test.ts`, :32 and :615).
- **Distinct tests/ paths in the record:** `grep -o "tests/[A-Za-z0-9_./-]*\.\(ts\|json\)" … | sort -u` → 3 paths (`tests/fixtures/h7a/permitted-codes.json`, `tests/helpers/e2e-s1.ts`, `tests/schema-alias-union-decl.test.ts`).
- **The lock's path in the record:** `grep -c "schema-alias-rhs-malformed" docs/bugs/0042-…md` → 0.
- **Test file names:** `ls tests | grep -c "rhs-malformed"` → 1 (the witness exists).
- **Test titles and headers:** `grep -rlE "[Bb]ug 0042" tests --include=*.ts | wc -l` → 8 files. `grep -rlE 'describe\("bug 0042' tests` → 1 (`tests/schema-alias-rhs-malformed.test.ts`, the only file whose describe() titles belong to bug 0042).
- **Coverage-matrix rows:** `grep -c "0042\|malformed-alias-rhs" docs/plan_topics/coverage-matrix.md docs/reference/coverage-matrix.md` → 0 and 0.
- **AGENTS.md gate names:** `grep -c "0042\|malformed-alias-rhs\|schema-alias-rhs" AGENTS.md` → 0.
- **CHANGELOG (corroboration only):** `grep -c "schema-alias-rhs-malformed" CHANGELOG.md` → 0. The 0.52.0 entry (CHANGELOG.md:7273) names no test file.

Other checks:
- **Not a citation-form issue.** citation-symbol-form-gate scopes `docs/bugs/**` out ("a bug document is a dated record of one HEAD"), and the missing item is a whole witness path, not a line-number form.
- **Not a dated-anchor drift.** The finding does not depend on line numbers or current test counts. All counts are taken at fix commit `9c961f7f`.
- **Other pointers reproduce.** Every pointer the record does give still resolves (n11/n24/n29 cells present), so this is not a decayed-pointer filing.
- **No overlap with filed or rejected items.** No listed issue or pending candidate names 0042 or schema-alias-rhs-malformed.

## Triage
verdict: confirmed — every stated search reproduces: grep of the 0042 record for `schema-alias-rhs-malformed` gives 0; its only test paths are e2e-s1.ts, permitted-codes.json and schema-alias-union-decl.test.ts; 11 witness lines, 2 of them with tests/. My own checks: the coverage-matrix rows (0/0), AGENTS.md (0) and CHANGELOG (0) are also silent, and no other intake file or PTQ tracks it. Fix commit 9c961f7f adds only tests/schema-alias-rhs-malformed.test.ts, which has 26 it( lines, one of them a loop over 6 RESIDUE_MEMBERS (b6–b11), so 31 cells, plus 77 in union-decl = 108. The witnesses exist, so the record just never points at them. Witness to name: tests/schema-alias-rhs-malformed.test.ts, whose header comment names bug 0042. Its describes are "bug 0042 (a) — the malformed-RHS code is registered", "(b) — same-line residue after a complete right-hand side is refused", "(c) — an empty arm position is refused", "(d) — the frontmatter `params:` spelling reports the same declaration" and "(e) — the fences the rule may not cross". (e) holds the e5 test "GREEN (e5, fixture 2a): the dangling `|` in a FIELD type is refused now (bug 0061)" and the e6 test "GREEN (e6, fixture 3b): `schema S { a: -1 }` now retains `a` under bug 0133 §Fix (a)". The named n11/n24/n29 pins in tests/schema-alias-union-decl.test.ts stay as they are. The fix is to add a §Fix Offline lock line like the ones in 0038/0039/0040/0041/0043/0044, with no rewording (triage: claude-opus-5-5)
