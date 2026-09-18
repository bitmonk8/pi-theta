---
id: PTQ-0806
title: The Triple/Quad diagnostic-projection interfaces and the fnOf/paramsOf/registered FnDecl readers are redeclared near-byte-identical across three fn-param test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-param-not-identifier.test.ts:238-325
  - tests/fn-param-list-unclosed.test.ts:169-265
  - tests/fn-param-annotation-optional.test.ts:368-460
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The Triple/Quad diagnostic-projection interfaces and the fnOf/paramsOf/registered FnDecl readers are redeclared near-byte-identical across three fn-param test files

## Observation
tests/fn-param-not-identifier.test.ts declares a ten-member block — the
`Triple`/`Quad` interfaces, the `at`/`triples`/`e`/`quads`/`q`/`render`
projection functions, and the `fnOf`/`paramsOf`/`registered` `ThetaDocument`
readers — immediately before its `describe` blocks begin. The same ten
members, in the same order, recur in tests/fn-param-list-unclosed.test.ts and
tests/fn-param-annotation-optional.test.ts. `fnOf`, `paramsOf`, `Triple` and
`Quad` are byte-identical across all three files; `at`, `triples`, `e`,
`quads`, `q` and `render` are byte-identical between fn-param-not-identifier
and fn-param-list-unclosed, and differ from fn-param-annotation-optional only
in that file's `registered` predicate, which additionally scopes the checked
severities to `theta/load/`/`theta/parse/` codes.

## Evidence
tests/fn-param-not-identifier.test.ts:299-322 (`fnOf`, `paramsOf`,
`registered`):
```ts
function fnOf(doc: ThetaDocument): FnDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "fn") as FnDecl[];
  expect(
    decls.length,
    `exactly one \`fn\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`fn\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/** The recorded `{name, type}` parameter pairs of the single `fn`. */
function paramsOf(doc: ThetaDocument): FnParam[] {
  return fnOf(doc).params.map((p) => ({ name: p.name, type: p.type }));
}
```

tests/fn-param-list-unclosed.test.ts:230-247 (byte-identical `fnOf`/`paramsOf`):
```ts
function fnOf(doc: ThetaDocument): FnDecl {
  const decls = doc.body.statements.filter((s) => s.kind === "fn") as FnDecl[];
  expect(
    decls.length,
    `exactly one \`fn\` declaration is expected; statements=${JSON.stringify(topKinds(doc))}`,
  ).toBe(1);
  const only = decls[0];
  if (only === undefined) {
    throw new Error(`no \`fn\` declaration to read; diagnostics=${render(doc)}`);
  }
  return only;
}

/** The recorded `{name, type}` parameter pairs of the single `fn`. */
function paramsOf(doc: ThetaDocument): FnParam[] {
  return fnOf(doc).params.map((p) => ({ name: p.name, type: p.type }));
}
```

tests/fn-param-annotation-optional.test.ts:429-446 — same `fnOf`/`paramsOf`
bodies (verified byte-identical by diff below).

The `Triple`/`Quad` interfaces (tests/fn-param-not-identifier.test.ts:238-243,
266-268):
```ts
interface Triple {
  readonly severity: string;
  readonly code: string;
  readonly at: string;
}
...
interface Quad extends Triple {
  readonly message: string;
}
```
identical at tests/fn-param-list-unclosed.test.ts:169-174, 197-199 and
tests/fn-param-annotation-optional.test.ts:368-373, 396-398.

Exact search and result: for each of `fnOf`, `paramsOf`, `registered`, `at`,
`triples`, `quads`, `e`, `q`, run as
`diff <(sed -n '/^function NAME(/,/^}/p' fileA) <(sed -n '/^function NAME(/,/^}/p' fileB)`
between fn-param-not-identifier.test.ts and fn-param-list-unclosed.test.ts —
all eight diffs empty (byte-identical). The same eight against
fn-param-annotation-optional.test.ts are empty for `fnOf`, `paramsOf`, `at`,
`triples`, `quads`, `e`, `q`, and differ only in `registered`'s body (that
file's version adds a `d.code.startsWith("theta/load/") ||
d.code.startsWith("theta/parse/")` conjunct). `grep -rln "^function fnOf(\|^function paramsOf("
tests --include="*.test.ts"` → exactly these 3 files, no others.

## Why this is a problem
`fnOf`/`paramsOf` — a "find the single `fn` declaration, asserting its
presence and uniqueness before reading its parameters" reader — and the
`Triple`/`Quad`/`e`/`q`/`at`/`triples`/`quads` diagnostic-projection shape are
harness code, not the bug-specific assertions each file's `describe` blocks
carry. tests/helpers/e2e-s1.ts, which all three files already import
`parseDoc`/`topKinds` from, hosts the closely related `findFnDecl(doc, name)`
lookup but not an assert-unique-and-return variant, so the natural
consequence of this being pasted three times rather than authored once is
that a change to the "how many `fn` declarations may a document have" or
"what does an unlocated diagnostic render as" decision has to be made
identically by hand in three places, only one of which (this project's
authoring convention already shows) is a copy that varies at all — and that
one variance (`registered`'s severity-namespace scoping) sits inside an
otherwise-pasted block rather than being the file's own logic.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already exports the sibling `findFnDecl`/`topKinds`
lookups these three files import; an assert-unique `fnOf`/`paramsOf` pair and
the `Triple`/`Quad`/`at`/`triples`/`quads`/`e`/`q` projection shape fit
beside that established precedent, with each file's `registered` predicate
(where it differs) staying local.

## False-positive check
- Gate-pin: none of the three files match `*gate*.test.ts` or the named gate
  kin.
- Recording-double: `fnOf`/`paramsOf`/`triples`/`quads`/`at` all read an
  already-completed parse's `ThetaDocument`; none records a call or backs a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "paramsOf\|fnOf(doc)" docs/bugs/*.md`
  → 0 files; no open bug names this duplication or gives a documented
  correct-reason for keeping the definitions local.
- coverage-matrix/bug-doc citation search: `grep -n
  "fn-param-not-identifier.test.ts\|fn-param-list-unclosed.test.ts\|fn-param-annotation-optional.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. docs/bugs/0150, 0151 and 0225
  cite these three files by filename for their pinned `it()` counts and cell
  ids (a1-a21 etc.); this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only to where the
  ten-member harness block is defined — so no pinned witness is affected.
- Overlap check against this wave's own prior filings and quality/issues:
  `grep -rl "interface Triple\|function fnOf\b\|function paramsOf\b"
  quality/issues quality/intake quality/resolved` → 0 hits before this
  filing. quality/issues/PTQ-0522 (open, confirmed) separately covers the
  `at`/`render` pair's duplication, but only between
  tests/fn-call-arity-unchecked.test.ts and
  tests/fn-param-annotation-optional.test.ts — a disjoint file pair from the
  one cited here — and does not cite `fnOf`, `paramsOf`, `Triple`, `Quad`,
  `triples`, `e`, or `q` at all, so this finding's core claim (the
  `fnOf`/`paramsOf`/`Triple`/`Quad`/`e`/`q` block) is not a re-filing of it;
  quality/resolved/PTQ-0518 (fixed) and PTQ-0567 (fixed) cover the disjoint
  `topKinds` and `REGISTRY`/`msg` blocks in these same files, already folded
  onto tests/helpers/e2e-s1.ts and tests/helpers/registry-oracle.ts
  respectively — this finding's members are not among either fixed set.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member is exercised by its own file's existing
  tests today.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: sed-extracted and diffed all nine functions (`fnOf`/`paramsOf`/`registered`/`at`/`triples`/`quads`/`e`/`q`/`render`) and both interfaces across the three files — every pair byte-identical except `registered` A↔C, which differs exactly by the `theta/load/`/`theta/parse/` code-prefix conjunct; `grep -rln "^function fnOf(\|^function paramsOf(" tests` → exactly these 3 files and `tests/helpers/` exports neither (e2e-s1.ts:141 `findFnDecl(doc, name)` is a by-name lookup, not the assert-unique reader); every copy is live (fnOf 3/5/2, paramsOf 24/26/19, triples 24/36/23, q 25/41/7 call sites); all locations under tests/, D7 boilerplate-duplication class, not a gate file, no recording double, 0 coverage-matrix hits, direction is helper extraction not merge/rename/delete so bug-doc witness pins are untouched; quality-store grep for `interface Triple|fnOf|paramsOf` → 0 prior hits, PTQ-0522 covers only `at`/`render` on a disjoint file pair, PTQ-0518/0567 (fixed) folded only `topKinds` and `REGISTRY`/`msg`; corrections on record: (a) `sites: 3` undercounts the projection block — `interface Triple`/`Quad`/`triples`/`quads`/`q`/`registered` recur byte-for-byte in tests/enum-body-unclosed-at-eof.test.ts and tests/schema-body-unclosed-at-eof.test.ts too (the same five files PTQ-0518 folded `topKinds` from; only `fnOf`/`paramsOf` are exactly three) — fold those two sites in at fix time; (b) the FP-check's "0 files" docs/bugs claim is wrong — docs/bugs/0225:836 names `paramsOf`, but only as the pin reader's name, with no local-definition rationale, so no carve-out triggers (triage: claude-fable-5-1)
