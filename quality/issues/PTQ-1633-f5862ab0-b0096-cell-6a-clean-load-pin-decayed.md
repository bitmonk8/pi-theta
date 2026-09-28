---
id: PTQ-1633
title: Bug 0096's discharge note pins "cell 6a … asserting a clean load" in tests/brace-rooted-union-arm-capture.test.ts, but f5862ab0 (bug 0128) rewrote 6a and 6b to assert non-literal-discriminator
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md:872-883
  - docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md:903-906
  - tests/brace-rooted-union-arm-capture.test.ts:1164-1182
  - tests/brace-rooted-union-arm-capture.test.ts:1205-1217
  - docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md:1042-1053
sites: 2
fix_scope: localized
d10_class: decayed-pointer
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
triaged_at: 07056fcfedba4de0dc49d47a992671fb4f5f1d78
---

# Bug 0096's discharge note pins "cell 6a … asserting a clean load" in tests/brace-rooted-union-arm-capture.test.ts, but f5862ab0 (bug 0128) rewrote 6a and 6b to assert non-literal-discriminator

## Observation
Bug 0096's `### Discharge note — bug 0095 (0.74.0)` says its §Fix witness item 4 is discharged by cell 6a of `tests/brace-rooted-union-arm-capture.test.ts`, "asserting a clean load", with 6b as the parity control. It adds that "the fixture loads with no diagnostics". Commit `f5862ab0` (fix(bug-0128), v0.157.0) rewrote that cell. 6a's title and expectation went from "loads with NO diagnostics" / `diagnostics: []` to "draws `non-literal-discriminator`" / `diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")]`, and 6b was changed the same way. The 0096 record has not been touched since `75af7646` (0.74.0), and it carries no 0128 note (0 hits for "0128"). The sibling record 0095, which cites the same cell, did receive a `## Discharge note — bug 0128 (0.157.0)`. The pinned cell still exists but no longer asserts what the 0096 record says it asserts.

## Evidence
Claim side, `docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md:872-883` (re-read before filing):
```
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) landed at
0.74.0 and carries the item, as this report assigned it — the `parseDoc` cell for
`Cat { kind: {a: integer} | {b: string}, name: string }` plus
`schema Animal by kind = Cat | Dog` asserting a clean load, with
`kind: "a" | "b"` beside it as the parity control. It is cell 6a of
`tests/brace-rooted-union-arm-capture.test.ts`, with 6b the parity control and 6c
bounding it: a single enclosing brace group still reports nested, so the guard
this report installed is asserted from both sides on reachable input for the first
time. **Stage B's prediction held exactly** — the fixture loads with no
diagnostics, and in particular with no `theta/parse/nested-discriminator`, the
wrong line the widened capture would have produced under the naive prefix/suffix
test.
```
`docs/bugs/0096-…md:903-906`:
```
**Residual (i) of this report's fix record is now live rather than prospective.**
`by kind` over a field typed `{a: X} | {b: Y}` loads clean, as predicted; whether
that silence is the right end state remains the spec question this report
declined to settle, and it is being filed separately by the operator.
```

Evidence side, the pinned cell today, `tests/brace-rooted-union-arm-capture.test.ts:1165` and `:1182`:
```
  it("6a: `Cat { kind: {a: integer} | {b: string}, … }` under `by kind` draws `non-literal-discriminator`, not `empty-schema-body`", () => {
...
      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
```
`:1205` and `:1217` (6b):
```
  it("CONTROL 6b: the same declaration with `kind: \"a\" | \"b\"` draws the same `non-literal-discriminator`", () => {
...
      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
```

The rewriting commit, `git show f5862ab0 -- tests/brace-rooted-union-arm-capture.test.ts` (filtered):
```
-  it("RED 6a: `Cat { kind: {a: integer} | {b: string}, … }` under `by kind` loads with NO diagnostics", () => {
+  it("6a: `Cat { kind: {a: integer} | {b: string}, … }` under `by kind` draws `non-literal-discriminator`, not `empty-schema-body`", () => {
-      diagnostics: [],
+      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
-      diagnostics: [],
+      diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")],
```
`git show -s f5862ab0` → `f5862ab045b9e8c9bdc6d46cdc0cbc8a06c1c77a 2026-08-21 fix(bug-0128): a non-literal by-field discriminator refuses at parse — v0.157.0`. Its only `docs/bugs/` path in `--stat` is `docs/bugs/README.md`.

The same-cell sibling record that was updated, `docs/bugs/0095-…md:1042-1047`:
```
## Discharge note — bug 0128 (0.157.0)

The witness cell this report inherited from bug 0096 item 4 —
`tests/brace-rooted-union-arm-capture.test.ts`, the `by kind` union over
`kind: {a: integer} | {b: string}` — asserted a **clean load**. Bug 0128 §Fix
(d) reserved that cell for whichever report landed second; 0095 landed first, so
```

Searches (run this session):
- `grep -n "0128" docs/bugs/0096-…md` → 0 hits (the record has 906 lines).
- `git log --format="%h %s" f5862ab0..HEAD -- docs/bugs/0096-…md | wc -l` → 0. The record's last commit is `75af7646` (0.74.0).
- `grep -n "Discharge note — bug 0095\|It is cell 6a\|Stage B's prediction\|loads clean, as predicted\|asserting a clean load" docs/bugs/0096-…md` → :828, :867, :875, :876, :880, :904. :828 sits in §Fix (0.73.0) and records what §Fix *assigned* to 0095, not a present-tense witness pin. The others are the two quoted blocks.

## Why this is a problem
The 0096 record uses cell 6a (with 6b as its parity control) as the discharge evidence for its witness item 4, and states the cell's asserted observable as a clean load. At HEAD the pinned cell and its control both assert a `theta/parse/non-literal-discriminator` line. Someone following the pin finds a cell that contradicts the sentence it is cited for. The record gives no hint that the observable moved, while the one other record that pins the same cell (0095) states the move explicitly. The cell does still witness the part of item 4 that belongs to 0096: `{a:integer}|{b:string}` is not classified nested, so there is no `nested-discriminator`, and 6c bounds it. What no longer holds is the "clean load" / "loads with no diagnostics" wording tied to the pin, at :875 and :880, and Residual (i)'s "loads clean" at :904.

## Suggested direction (non-binding, optional)
Following the 0095:1042 precedent, one appended coordination note on 0096 would record that `f5862ab0` (bug 0128, 0.157.0) moved cells 6a and 6b to `non-literal-discriminator`. Cell 6a stays the witness for the no-`nested-discriminator` half, with 6c bounding it.

## False-positive check
- Clustering by commit: `f5862ab0` rewrote the pinned cell. The other record in this shard that pins 6a is 0095 (its §Fix (0.74.0) cell-6a text), and it already carries the 0128 discharge note at :1042. That is an honesty marker, not a decay, so 0095 is not listed. No pending candidate in the list above cites 0096 or `f5862ab0`.
- The cell exists and resolves by id: `grep -n "6a:" tests/brace-rooted-union-arm-capture.test.ts` → 2 hits: :1165, the only `it(` titled 6a, and :1241, a comment inside 6c. The decay is in the asserted observable the pin states, not in the cell's existence. `git log --format=%h -- tests/brace-rooted-union-arm-capture.test.ts` lists `f5862ab0` as the commit that flipped 6a from `diagnostics: []`. Of the later commits, `09eeec4e` (0130), `36128659` (0228) and the rest do not revert it (the current bytes at :1182 and :1217 are quoted above).
- This filing does not adjudicate whether a refusal or a clean load is right. That is bug 0128's settled question. It records only that the 0096 pin's stated observable is not what its cited witness asserts.
- Not citation form (no gate checks `docs/bugs/**` witness observables). Nothing was executed.

## Triage
verdict: questionable — decay verified: 0096:872-883 and :903-906 say cell 6a/6b assert a clean load with no diagnostics, but at HEAD tests/brace-rooted-union-arm-capture.test.ts:1165/:1182 (6a) and :1205/:1217 (6b) assert `diagnostics: [nonLiteralDiscriminatorLine("kind", "Animal")]`. `git show f5862ab0` flips both from `diagnostics: []`, and its only docs/bugs path is README.md. 0096 has 906 lines, 0 hits for "0128", and no commits after 75af7646, while 0095:1042 carries the 0128 discharge note. f5862ab0 rewrote the cell rather than deleting it, so the pointer still resolves and no re-point target exists. The repair is a new note or rewording of "clean load" / "loads clean", which is a human's call. Not a duplicate: no other intake file or PTQ cites f5862ab0 (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: D10 RULED REWORD (decayed-pointer). APPEND EXACTLY the following block at the very end of docs/bugs/0096-discriminator-field-classifier-naive-brace-test.md, nothing else; every existing line stays byte-identical:

### Coordination note — 2026-09-28, bug 0128 (0.157.0)

Commit f5862ab0 (bug 0128 fix, v0.157.0) rewrote cells 6a and 6b in tests/brace-rooted-union-arm-capture.test.ts: the clean-load pin the discharge note above cites now asserts one non-literal-discriminator refusal per cell. The wording above stands as a dated record; current disposition: docs/bugs/0128-non-literal-by-field-loads-silently.md.
