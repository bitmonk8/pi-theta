---
id: PTQ-1383
title: reservedTok and reservedAt/reservedMsg compute the identical reserved-refusal range template in the two in-scope files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:167-176
  - tests/reserved-keyword-misfire-faces.test.ts:164-167
  - tests/reserved-keyword-misfire-faces.test.ts:202-209
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# reservedTok and reservedAt/reservedMsg compute the identical reserved-refusal range template in the two in-scope files

## Observation
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts` declares
`reservedTok(keyword, line, column)`, and
`tests/reserved-keyword-misfire-faces.test.ts` declares `reservedAt(keyword,
line, column)` plus a small `reservedMsg(keyword)` helper it calls. Both
ultimately return the exact same expression —
`at(RESERVED, msg(RESERVED, [["<keyword>", keyword]]), line, column, column + keyword.length)`
— for the token-ranged reserved-keyword-as-identifier refusal. Neither file
imports the other's declaration and no `tests/helpers/` module exports this
range template.

## Evidence
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts:167-176`:
```ts
/** The refusal at a token: the object-literal leaf's `nameTok.range`, and bug 0153's leaves. */
function reservedTok(keyword: string, line: number, column: number): string {
  return at(
    RESERVED,
    msg(RESERVED, [["<keyword>", keyword]]),
    line,
    column,
    column + keyword.length,
  );
}
```

`tests/reserved-keyword-misfire-faces.test.ts:164-167,202-209`:
```ts
/** The registry *Message* for the reserved code with `<keyword>` filled. */
function reservedMsg(keyword: string): string {
  return msg(RESERVED, [["<keyword>", keyword]]);
}
...
function reservedAt(keyword: string, line: number, column: number): string {
  return at(RESERVED, reservedMsg(keyword), line, column, column + keyword.length);
}
```

Inlining `reservedMsg` into `reservedAt` yields
`at(RESERVED, msg(RESERVED, [["<keyword>", keyword]]), line, column, column + keyword.length)`
— the same expression `reservedTok` returns directly, with the same
parameter names (`keyword`, `line`, `column`) and the same `column +
keyword.length` end-column rule.

Exact search: `grep -n "function reservedTok(\|function reservedAt(\|function reservedMsg(" tests/reserved-keyword-inline-object-and-literal-keys.test.ts tests/reserved-keyword-misfire-faces.test.ts` → 3 hits total, the three declarations cited above, no fourth site in either file.

## Why this is a problem
Both files independently arrive at the same three-argument reserved-keyword
range builder (constant `RESERVED` code, `<keyword>` placeholder fill,
`column + keyword.length` end-column), one factoring the message lookup out
into a named `reservedMsg` step and the other inlining it, with no shared
declaration between the two files or in `tests/helpers/`. A change to the
reserved-refusal range convention (e.g. a different end-column rule for a
multi-byte keyword) has to be reproduced correctly in both places rather than
fixed once.

## Suggested direction (non-binding, optional)
Both files already share the `RESERVED` code constant and the `at`/`msg`
building blocks from their respective imports; a single exported
`reservedAt`-shaped builder is the kind of convergence point the rest of
each file's per-code range builders (`reservedDecl`, `caseAt`, `mutAt`, and
so on) already follow the same naming pattern for.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not a census/pin gate.
- Recording-double check: `reservedTok`/`reservedAt`/`reservedMsg` are pure
  string builders over a registry template, not fakes, doubles, or MUST-NOT
  witnesses.
- docs/bugs/ signature search: `grep -rl "reservedTok\|reservedAt\b"
  docs/bugs/*.md` → 0 hits; neither function is named as a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-inline-object-and-literal-keys\|reserved-keyword-misfire-faces"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the two range-builder declarations could converge on one
  export.
- Prior-filing search: `grep -rl "reservedTok\|reservedAt\b" quality/resolved
  quality/issues quality/intake` (before this filing) → 0 hits, so this is a
  previously-uncited duplication distinct from the already-fixed PTQ-0817
  (`REGISTRY`/`msg` re-derivation) and PTQ-0858 (`lines`/`at` renderer
  duplication) findings against the misfire-faces file, and distinct from
  the same-wave `singleLineIfAt`/`FM`/`msg`-wrapper filing against this same
  file pair.

## Triage
verdict: confirmed — excerpts match at the cited lines (inline-object 167-176 `reservedTok`; misfire-faces 164-167 `reservedMsg`, 202-209 `reservedAt`): both files import the same `errorLineAt as at` from tests/helpers/e2e-s1 and declare the same `RESERVED` code, so inlining `reservedMsg` makes the two builders the identical `at(RESERVED, msg(RESERVED, [["<keyword>", keyword]]), line, column, column + keyword.length)` expression; the declaration grep reproduces (3 hits) and `grep -rln reserved-keyword-as-identifier tests/helpers` finds no exported range builder (registry-oracle.ts only carries the code); the pattern is in fact wider than filed — tests/reserved-keyword-remaining-identifier-positions.test.ts:229 carries a byte-identical `reservedAt` as an uncounted third site, which strengthens rather than refutes the boilerplate-duplication claim; neither file is a gate, neither is cited by docs/reference/coverage-matrix.md, no docs/bugs/ signature names the helpers; not a duplicate — resolved PTQ-0569/0817 fixed REGISTRY/msg re-derivation, PTQ-0858 fixed lines()/at() rendering, PTQ-0618 is the live-cell fragment reader, PTQ-0832 is inline-slug's reservedMessage, and same-wave d7-01 covers singleLineIfAt/FM/msg, none naming the reserved range builder (triage: claude-fable-5-1)
