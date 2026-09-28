---
id: PTQ-1603
title: Bug 0245's fixed record gives its offline witness only as cell ids and counts ("witness RED before (`Tests 9 failed | 11 passed (20)`)", b0245-e3, b0245-f1) and never names tests/schema-body-unclosed-at-eof.test.ts, the file its fix commit added
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:511-514
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:530-536
  - docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:483
  - tests/schema-body-unclosed-at-eof.test.ts:9-11
  - tests/schema-body-unclosed-at-eof.test.ts:569
  - tests/schema-body-unclosed-at-eof.test.ts:599
  - docs/bugs/0241-nested-array-element-sink-descent-unwired.md:384
  - docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:581
  - docs/bugs/0246-unterminated-query-template-registered-unfired.md:398
sites: 1
fix_scope: localized
d10_class: unwitnessed-claim
wave: qw20260928081617
reported_by: lens-d10-verification (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# Bug 0245's fixed record gives its offline witness only as cell ids and counts ("witness RED before (`Tests 9 failed | 11 passed (20)`)", b0245-e3, b0245-f1) and never names tests/schema-body-unclosed-at-eof.test.ts, the file its fix commit added

## Observation
`docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` has Status `fixed (0.226.0)`. Its `## Fix (0.226.0)` section gives the default-suite witness only as "witness RED before … GREEN after (`Tests 20 passed (20)`)", "The witness witnesses", "new cell b0245-e3" and "witness cell b0245-f1". It never says which file holds those cells. Its *What shipped* list names `src/parser/theta-document.ts`, the registry and four doc mirrors, then "Four sibling witnesses", but not the new witness. The only test paths the Fix section attributes to 0245 are the live cell and the four sibling files. The fix commit `6a1a605b` added `tests/schema-body-unclosed-at-eof.test.ts` (773 lines, 20 `it(` cells), whose header is "Bug 0245 — …". Every other record in this shard whose fix added a witness file names it by path in its Fix section.

## Evidence
Claim side, `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:511-514` (re-read before filing):
```
- **Gates:** witness RED before (`Tests 9 failed | 11 passed (20)`, every red
  naming the absent `theta/parse/schema-body-unclosed` emission or the absent
  registry row) and GREEN after (`Tests 20 passed (20)`); full default suite
  `Test Files 409 passed (409)` / `Tests 8601 passed (8601)`;
```
`:530-536`:
```
  - *The witness witnesses.* Two hash-proven neutralisation cycles against
    `src/parser/theta-document.ts` (pre-edit `git hash-object`
    `d7aee0daf83ec085ba5295cd69780c95b57423cd`, restored byte-exact to the same
    hash both times). Deleting the emission reds 9 of 20 cells; forcing
    `closeBraceAbsorbed` false reds the two withhold cells — so both the
    emission and its withhold are proven able to fail.
```
`:483`: "  - Four sibling witnesses each gained ONE independently-faulted line (below)." This is the last *What shipped* bullet. No bullet names the new witness.

Evidence side:
- `tests/schema-body-unclosed-at-eof.test.ts:9-11`: "// Bug 0245 — a `schema` object body that reaches end of input with at least one // field captured draws ZERO diagnostics, registers, and lowers // (docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md)."
- `:569` `it('b0245-e3: …')` and `:599` `it("b0245-f1: …")`. These are the two cells the record names.
- `grep -c "it(" tests/schema-body-unclosed-at-eof.test.ts` → 20, which matches "(20)".

Searches (all run this session):
- `grep -c "schema-body-unclosed-at-eof\.test" docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` → 0. The only related hit in the record is the live path `…-live-cell.test.ts` at `:538`.
- `grep -n "b0245-" docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md` → 2 hits (`:521`, `:581`), both bare cell ids with no file.
- `git show 6a1a605b --stat --format= | grep "tests/"` → includes `tests/schema-body-unclosed-at-eof.test.ts | 773 +++…`.
- `grep -rln "b0245-e3" tests` → 1 file, and `grep -rln "b0245-f1" tests` → 1 file, both `tests/schema-body-unclosed-at-eof.test.ts`.
- Sibling house format, each Fix section naming its own witness file: 0240 `:461` (`tests/par-for.test.ts`), 0241 `:384` (`tests/nested-array-element-sink-descent.test.ts` — the witness, 26 cells), 0242 `:535` (`tests/reserved-keyword-misfire-faces.test.ts` — new 112-cell witness), 0244 `:581` (`tests/inline-object-keyless-entry-refusal.test.ts` — the new witness), 0246 `:398` (`tests/unterminated-template-lexer-emission.test.ts` — new, 18 offline cells), 0248 `:408`.

## Why this is a problem
The record's `fixed` Status rests on its offline witness: RED 9/20 before, GREEN 20/20 after, and two neutralisation cycles. None of those claims gives the witness's location, so they can only be checked by first finding the file through a token search or `git show`. That is the "fixed-Status record naming no witness where the house format carries one" shape. This shard's six sibling records each carry the pin. The file exists and is a default-suite witness (not under `tests/live/**`), so once named it is gate-proven current evidence.

## Suggested direction (non-binding, optional)
Add `tests/schema-body-unclosed-at-eof.test.ts` to the *What shipped* list and/or the *Gates* witness sentence. It is the file `6a1a605b` added, and it self-identifies as bug 0245's witness.

## False-positive check
- Representations enumerated, one search each:
  - (1) Bug-doc Witness/Fix lines: `grep -c "schema-body-unclosed-at-eof\.test"` on the record → 0, and `grep -n "b0245-"` → 2 bare cell ids.
  - (2) Test file names: `git show 6a1a605b --stat` → the witness file, and `grep -rln "0245" tests` → 9 files, one of them `tests/schema-body-unclosed-at-eof.test.ts`.
  - (3) Test titles: `grep -rln "b0245-e3" tests` / `"b0245-f1"` → 1 file each, the same file.
  - (4) Coverage-matrix rows: `grep -c "0245\|schema-body-unclosed" docs/reference/coverage-matrix.md docs/plan_topics/coverage-matrix.md AGENTS.md` → 0, 0, 0.
  - (5) AGENTS.md gate names: same search → 0.
  - (6) CHANGELOG, corroboration only: `CHANGELOG.md:2902` says "Locked by `tests/schema-body-unclosed-at-eof.test.ts` (20 cells)". So the path is recorded in CHANGELOG but not in the record.
- The witness exists and asserts the claimed observable, so this is not a claim with no evidence. It is a record whose evidence pointer is absent. The same shape was filed this wave for bug 0056 (`qw20260928081617-d10-02-0056-fixed-record-names-no-own-witness-file.md`). That is a different record.
- The later flip of b0245-f1 by bug 0259 is a separate root cause, filed as `qw20260928081617-d10-04-…`. I executed nothing.

## Triage
verdict: confirmed — everything reproduces. The 0245 record (Status fixed (0.226.0)) cites its witness only as RED 9/20 → GREEN 20/20, b0245-e3 and b0245-f1 (:511-514, :521, :530-536, :581), and never gives the file: `grep -c "schema-body-unclosed-at-eof\.test"` returns 0. The witness exists in the default suite: tests/schema-body-unclosed-at-eof.test.ts, added by 6a1a605b (773 lines), header "Bug 0245 — …" at :9-11, 20 `it(` cells. Its describes are "b0245 registry — the new row is a DIAG-2 addition in the fix's own commit" (:250), "b0245 (a) — a body that reaches EOF after a captured field is refused" (:270), "b0245 (b) — every shape whose last field completed before EOF is refused" (:318), "b0245 (c) — a truncation inside a nested inline object type is refused, so its `{}` never ships" (:382), "b0245 (d) — the neighbouring exits keep their own single diagnostic" (:466), "b0245 (e) — a field type that swallowed the body's `}` withholds the verdict" (:534, holds it('b0245-e3: …') at :569), "b0245 (f) — the `enum` variant loop, no longer silent (retired by bug 0259)" (:598, holds it("b0245-f1: …") at :599) and "b0245 (g) — the same truncation one declaration form over" (:643). No coverage-matrix or AGENTS.md row exists (0/0/0). CHANGELOG.md:2902 names the same file. The sibling pins at 0241:384, 0244:581 and 0246:398 reproduce. The record just points at nothing, and the fix is to add this path to its What-shipped/Gates witness lines. This is not a duplicate of d10-04: that filing is the b0245-f1 flip by 66892f19, a different root cause (triage: claude-opus-5-5)
