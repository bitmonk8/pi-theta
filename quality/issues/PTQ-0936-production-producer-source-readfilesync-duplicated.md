---
id: PTQ-0936
title: PRODUCTION_PRODUCER_SOURCE readFileSync boilerplate is byte-identical between proto-named-binder-write-sites.test.ts and proto-named-record-write-sites.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/proto-named-binder-write-sites.test.ts:498-501
  - tests/proto-named-record-write-sites.test.ts:321-324
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# PRODUCTION_PRODUCER_SOURCE readFileSync boilerplate is byte-identical between proto-named-binder-write-sites.test.ts and proto-named-record-write-sites.test.ts

## Observation
Both `tests/proto-named-binder-write-sites.test.ts` and
`tests/proto-named-record-write-sites.test.ts` declare a module-scope
`PRODUCTION_PRODUCER_SOURCE` constant that reads
`src/extension/production-theta-producer.ts` as UTF-8 text via
`readFileSync(fileURLToPath(new URL(...)))`, so each file's own
anchor-based text-search cells (`echoReadStatement`/`inlineDefsRefsCopyWrite`
in one file, `productionLoopText` in the other) can locate and check a
private production statement no offline seam otherwise reaches. The
`readFileSync`/`fileURLToPath`/`new URL` call is byte-identical between the
two files; only the preceding doc comment's parenthetical differs.

## Evidence

`tests/proto-named-binder-write-sites.test.ts:498-501`:
```ts
/** `src/extension/production-theta-producer.ts`, read as text (group (3) only). */
const PRODUCTION_PRODUCER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/extension/production-theta-producer.ts", import.meta.url)),
  "utf8",
);
```

`tests/proto-named-record-write-sites.test.ts:321-324` — identical
`readFileSync`/`fileURLToPath`/`new URL` call, only the doc comment's
parenthetical (`cell A-SRC only` vs. `group (3) only`) differs:
```ts
/** `src/extension/production-theta-producer.ts`, read as text (cell A-SRC only). */
const PRODUCTION_PRODUCER_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/extension/production-theta-producer.ts", import.meta.url)),
  "utf8",
);
```

Search: `grep -n "PRODUCTION_PRODUCER_SOURCE = readFileSync" tests/*.test.ts` returns exactly these two files, one declaration each; both files already import `readFileSync` from `"node:fs"` and `fileURLToPath` from `"node:url"` for this sole purpose.

## Why this is a problem
Both files sit in the same bug-0210/0214 `__proto__`-named-key lineage and
both need the identical capability — reading the same production file's text
because the statements they witness are inside a private method with no
offline seam (each file's own header explains this: "there is no offline
seam to either" / "the loop sits inside the method that launches the child
process"). Each restates the same three-line `readFileSync` call under the
same constant name rather than importing one shared reader (e.g. a
`readSourceFile(relativePath)` helper), even though the two files already
share other primitives (`jsonSlug`, `hasOwn`, `prototypeReport`, `range`)
through `tests/helpers/proto-named-harness.ts`.

## Suggested direction (non-binding, optional)
A small `tests/helpers/`-hosted `readSourceFile(relativePath)` (or a fixed
`readProductionProducerSource()`) alongside the existing
`tests/helpers/proto-named-harness.ts` the two files already share is the
kind of home this two-file exact duplicate already points toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; the cited lines are a text-reading constant declaration, not a pinned count or inventory assertion.
- Recording-double check: `PRODUCTION_PRODUCER_SOURCE` is not a recording double or a "never called" MUST-NOT witness; it is a static read of production source text consumed by later regex/anchor searches. The carve-out does not apply.
- docs/bugs/ signature search: `grep -n "PRODUCTION_PRODUCER_SOURCE" docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md docs/bugs/0214-defaulting-and-inference-drop-the-proto-named-key.md` → 0 hits; neither bug doc names this constant or gives a rationale for not sharing the reader.
- coverage-matrix/bug-doc citation search: `grep -n "proto-named-binder-write-sites\|proto-named-record-write-sites" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block, and touches none of either file's RED/CONTROL/source-sync pin cells — only where the shared text-reading constant is declared.
- Prior-filing search: `grep -rl "PRODUCTION_PRODUCER_SOURCE" quality/intake quality/issues quality/resolved` → 0 hits; the resolved `PTQ-0730`/`PTQ-0671` findings cover the `hasOwn`/`prototypeReport`/`jsonSlug`/`range` primitives in this same file pair, not this text-reading constant.
- Coverage check: the claim is about a repeated constant DEFINITION, not a missing test path; both copies are read successfully by every cell in their own file that depends on them.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/proto-named-binder-write-sites.test.ts:498-501 and tests/proto-named-record-write-sites.test.ts:321-324, the `readFileSync(fileURLToPath(new URL("../src/extension/production-theta-producer.ts", import.meta.url)), "utf8")` call is byte-identical (only the doc-comment parenthetical differs), both copies are live (:511 regex exec; :337/:343 indexOf+slice), the `PRODUCTION_PRODUCER_SOURCE = readFileSync` grep returns exactly these two declarations, docs/bugs 0210/0214 → 0, coverage-matrix → 0, prior-filing grep → only this candidate (resolved PTQ-0730/PTQ-0671 cover hasOwn/prototypeReport/jsonSlug/range, not this constant; resolved PTQ-0208 covers the b02xx spec-gate files), git shows sequential copying (cea6665f 2026-08-20 record-write-sites → 16ab2c58 2026-08-21 binder-write-sites), neither file is a gate kin and no recording-double/red-test carve-out applies; the anchor is stronger than filed — tests/helpers/corpus-reader.ts:29 already exports `readCorpus(rel, owner)` (fail-loud repo-relative text read, minted for exactly this idiom per its own header), so no new helper is needed, and the fixer should fold in the uncounted third reader of the same production file at tests/tools-entry-closed-grammar-lockstep.test.ts:119 (the candidate's grep was narrowed to the constant name); one immaterial inaccuracy: the binder file's `readFileSync`/`fileURLToPath` imports are NOT for this sole purpose — :367 `BINDER_INFERENCE_SOURCE` uses them too (triage: claude-fable-5-1)
