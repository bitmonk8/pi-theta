---
id: PTQ-1693
title: Bug 0220 still pins the silent Ghost-return control flipped by 76489c61.
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:188-191
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:514-520
  - tests/fn-return-void-query-sink.test.ts:414-437
  - docs/bugs/0262-unresolved-named-type-incomplete-position-coverage.md:668-668
  - docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:629-641
sites: 5
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0220 still pins the silent Ghost-return control flipped by 76489c61.

## Observation
Bug 0220 says the non-query `Ghost` return draws no diagnostic and names `tests/fn-return-void-query-sink.test.ts` as its whole-list reproduction witness. That file's e1 control now requires an upstream unresolved-name refusal for the same input. Both the cell comment and bug 0262 explicitly record this flip, but bug 0220 contains no coordination note for it. Its appended bug-0511 coordination concerns a different row.

## Evidence
- Claim, `docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md:188-191`:
  > list. v16's `diags` is one
  > `error theta/parse/unresolved-named-type: unresolved named type 'Ghost' @ 5:3-5:8`,
  > emitted by the name-resolution loop of the same arm; `fn f(): Ghost { 1 }`
  > draws none.

- Witness pin, the same record at `:514-520`:
  >   - `tests/fn-return-void-query-sink.test.ts` (new, 7 cells) — the witness of
  >     §Fix's "Test witness" paragraph: whole-ordered-list equality on
  >     `doc.diagnostics` and on the parsed body's `QueryExpr.schema` values across
  >     all §Reproduction rows, plus a provenance-flag cell. Subject rows (v1, v10,
  >     v14 and the `return`-operand spelling) at zero diagnostics and `null`
  >     schema; the `Ghost` row reds any wholesale-silencing route; the
  >     `string`-return row reds any schema-starving route.

- Current witness, `tests/fn-return-void-query-sink.test.ts:414-424`:
  ```ts
  describe("bug 0220 (e) — the query arm keeps its name resolution; the non-query return now resolves too", () => {
    it("e1: a propagated unresolvable return type keeps its `unresolved-named-type`; the non-query return now draws its own, upstream", () => {
      // "ghost-return-non-query" FLIPPED under the sixteenth-set OPERATOR RULING
      // for bug 0262 clause (i), which names `walkStatement`'s "fn" case return
      // read as one of the four uncovered captures the full widening reaches.
      // OLD codes: `[]` — the `fn` return type ran no resolution pass of its
      // own, and the registry row's closed position list did not name it, so a
      // return type with no query tail to propagate onto was silent. NEW: bug
      // 0262's widening now runs `collectUnresolvedNamedTypes` at the `fn`
      // return capture itself, so `Ghost` — resolving to no visible declaration
      // — is refused upstream, at the declaration's own range, the same range
  ```
  The assertions at `:434-437` are:
  ```ts
      expectTable(
        [
          ["ghost-return", GHOST_TAIL, [at(UNRESOLVED, "5:3-5:8")]],
          ["ghost-return-non-query", GHOST_TAIL_NUMBER, [at(UNRESOLVED, "4:1-6:2")]],
  ```
  This is a default-suite witness, hence current proof under this wave's supplied green preflight; no test was executed for this review.

- Flip confirmation, `docs/bugs/0262-unresolved-named-type-incomplete-position-coverage.md:668`:
  > | `tests/fn-return-void-query-sink.test.ts` | 0220 | 1 | FLIPPED | the non-propagated ghost return → its own upstream refusal | (i), bounded by (iv)(2) |

- History search, run this session: `git log --format='%H %s' -G 'ghost-return-non-query.*UNRESOLVED' -- tests/fn-return-void-query-sink.test.ts` returned one commit, `76489c61cfb0132112a9f347ce8c39a740d10d0b` (`fix(bug-0262): unresolved named types refuse at all reference positions — operator ruling (a) — v0.266.0`).
- Coordination search, run this session: `rg -n '0262|0\.266\.0' docs/bugs/0220-fn-return-void-sink-false-void-diagnostic.md | wc -l` returned `0`. The appended section at `:629-641` is headed `## Coordination with bug 0511 (unreleased)` and identifies the changed row as the historical v10 if/else query treatment, not e1's non-query Ghost return.

## Why this is a problem
The claim→evidence chain no longer resolves as stated: the named witness proves refusal where the report records silence. This is a flipped witness pin, not a challenge to the authorized bug-0262 widening or to bug 0220's root-void repair. A reader cannot use the current e1 result to reproduce the recorded control without the missing successor coordination.

## Suggested direction (non-binding, optional)
Preserve the dated report and append coordination identifying bug 0262, commit `76489c61cfb0132112a9f347ce8c39a740d10d0b`, and e1's non-query Ghost-return oracle changing from silence to `theta/parse/unresolved-named-type` at `4:1-6:2`; the propagated-query row remains unchanged.

## False-positive check
The witness exists and was opened, including its explicit old/new comment and both e1 expectations; this is not missing coverage. The successor record independently confirms the flip and its owning report. Bug 0220's existing bug-0511 coordination was read and addresses a different control; the exact successor search above finds no bug-0262 coordination. No source-line citation-form issue, behavior defect, or request to change a test is being filed. No tests were run.

## Triage
verdict: confirmed — 0220:190-191 and :403 still claim silence, but e1 now pins refusal; both stated searches reproduce and git show verifies the flip. The candidate misnames the successor file: its quoted ledger row exists at :668 of docs/bugs/0262-unresolved-named-type-silent-at-nine-reference-positions.md. That record and the cell comment confirm the flip, with no deliberate no-note choice; 0220's 0511 note concerns another row. PTQ-1618 covers 0124, not this pin; 76489c61 modified rather than deleted this witness, so deleting-sha clustering does not apply. Append verbatim as a heading followed by one paragraph: "### Coordination note — 2026-10-28, bug 0262 (0.266.0)" then "Commit 76489c61cfb0132112a9f347ce8c39a740d10d0b (bug 0262 fix, v0.266.0) flipped e1's ghost-return-non-query control in tests/fn-return-void-query-sink.test.ts from silence to theta/parse/unresolved-named-type at 4:1-6:2; e1's propagated ghost-return row remains one theta/parse/unresolved-named-type at 5:3-5:8. The wording above stands as a dated record; current disposition: docs/bugs/0262-unresolved-named-type-silent-at-nine-reference-positions.md." No tests executed. (triage: claude-opus-5-5)
