---
id: PTQ-1351
title: singleLineIfAt/FM/SINGLE_LINE_IF/msg are redeclared byte-for-byte across the two in-scope reserved-keyword test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:121-131
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:144-144
  - tests/reserved-keyword-inline-object-and-literal-keys.test.ts:203-206
  - tests/reserved-keyword-misfire-faces.test.ts:136-162
  - tests/reserved-keyword-misfire-faces.test.ts:179-179
  - tests/reserved-keyword-misfire-faces.test.ts:221-224
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
fix_skips: 1
---

# singleLineIfAt/FM/SINGLE_LINE_IF/msg are redeclared byte-for-byte across the two in-scope reserved-keyword test files

## Observation
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts` and
`tests/reserved-keyword-misfire-faces.test.ts` each declare their own
`SINGLE_LINE_IF` code-string constant, `FM` frontmatter-literal constant, and
a `singleLineIfAt(head, line, column)` range-builder function, all
byte-identical between the two files, and a `msg(code, fills)` wrapper around
the shared `registryMessageOf` helper whose bodies differ only in whether the
registry-page path is a literal string or the `PARSE_REGISTRY_PATH` constant.
Neither file imports the other's declaration, and no `tests/helpers/` module
exports a `singleLineIfAt`-shaped range builder.

## Evidence
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts:121,129-131,144,203-206`:
```ts
const SINGLE_LINE_IF = "theta/parse/single-line-if";
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  return registryMessageOf(REGISTRY, "docs/spec_topics/diagnostics/code-registry-parse.md", code, fills);
}
...
const FM = "---\nmode: prompt\n---\n";
...
/** The `controlHeads` scan's verdict, ranged on the head token. */
function singleLineIfAt(head: string, line: number, column: number): string {
  return at(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []), line, column, column + head.length);
}
```

`tests/reserved-keyword-misfire-faces.test.ts:136,160-162,179,221-224`:
```ts
const SINGLE_LINE_IF = "theta/parse/single-line-if";
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  return registryMessageOf(REGISTRY, PARSE_REGISTRY_PATH, code, fills);
}
...
const FM = "---\nmode: prompt\n---\n";
...
/** The `controlHeads` scan's verdict, ranged on the head token. */
function singleLineIfAt(head: string, line: number, column: number): string {
  return at(SINGLE_LINE_IF, msg(SINGLE_LINE_IF, []), line, column, column + head.length);
}
```

Exact search: `grep -n "function singleLineIfAt(" tests/*.test.ts` → 2 hits, exactly the two files above, byte-identical bodies (verified by direct comparison of the cited excerpts, including the identical doc-comment "The `controlHeads` scan's verdict, ranged on the head token."). `grep -n '^const FM = "---\\\\nmode: prompt\\\\n---\\\\n";' tests/reserved-keyword-inline-object-and-literal-keys.test.ts tests/reserved-keyword-misfire-faces.test.ts` → 2 hits, identical literal.

## Why this is a problem
Both files are witnesses for the same reserved-keyword-refusal subsystem
(bugs 0242 and 0249) and both independently declare the same `SINGLE_LINE_IF`
code constant, the same standard-frontmatter `FM` literal, and the same
`singleLineIfAt` range-builder with the same doc comment, with no shared
source between them. A change to the frontmatter shape every `.theta` row in
both files is parsed under, or to the `single-line-if` range convention, has
to be hand-applied at both declaration sites; the two `msg()` wrappers around
the already-shared `registryMessageOf` differ only by whether the registry
page path is spelled as a literal or read from `PARSE_REGISTRY_PATH`, one
more small drift between the two copies.

## Suggested direction (non-binding, optional)
Both files already import from `./helpers/load-row-harness` and
`./helpers/e2e-s1`; a shared frontmatter constant and a shared
`singleLineIfAt`-style range builder for the `single-line-if` code are the
kind of piece those helper modules already host analogous exports for.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (the sole `*gate*` file in this family, `b0281-applied-reserved-...`,
  is a different file entirely); not a census/pin gate.
- Recording-double check: `singleLineIfAt`/`msg`/`FM` are pure string
  builders and a frontmatter literal, not fakes, doubles, or MUST-NOT
  witnesses.
- docs/bugs/ signature search: `grep -rl "singleLineIfAt" docs/bugs/*.md` →
  0 hits; the `single-line-if` grep hits are prose describing the diagnostic
  code itself in several unrelated bug docs, none naming this
  function/constant pairing as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-inline-object-and-literal-keys\|reserved-keyword-misfire-faces"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the four redeclared pieces could converge on a shared export.
- Prior-filing search: `grep -rl "singleLineIfAt" quality/resolved
  quality/issues quality/intake` (before this filing) → 0 hits. Resolved
  PTQ-0858 already fixed the `lines()`/`at()` duplication between
  `reserved-keyword-misfire-faces.test.ts` and a different sibling file
  (`reserved-keyword-remaining-identifier-positions.test.ts`), and resolved
  PTQ-0817 already fixed `misfire-faces`'s independent `REGISTRY`/`msg`
  re-derivation of `load-row-harness.ts` — neither names `singleLineIfAt`,
  `FM`, or the pairing between these exact two in-scope files, so this is a
  distinct, previously-uncited duplication.

## Triage
verdict: confirmed — excerpts match at the cited lines (inline-object 121/129-131/144/203-206; misfire-faces 136/160-162/179/221-224): `SINGLE_LINE_IF`, `FM` and the 3-line `singleLineIfAt` incl. its doc comment are byte-identical across the two files, the `msg()` wrappers differ only by literal path vs `PARSE_REGISTRY_PATH`; `grep -rn singleLineIfAt tests/ src/ extensions/ tools/` → only these two declarations, no helper export; `FM` additionally already has a canonical export at tests/helpers/prompt-value-harness.ts:99 that neither file imports (the same literal recurs in 87 test files, 9 redeclare `SINGLE_LINE_IF`), so this is D7 boilerplate duplication with a live shared source available; neither file is a gate, neither is cited by docs/reference/coverage-matrix.md, no docs/bugs/ signature names the helpers; not a duplicate — resolved PTQ-0569/0817 fixed the registry/msg re-derivation, PTQ-0858 fixed lines()/at() against a different sibling, PTQ-0887 is session-control's fm(), and same-wave d7-02 covers reservedTok/reservedAt, none naming singleLineIfAt/FM/SINGLE_LINE_IF between these two files (triage: claude-fable-5-1)

## Fix attempts
- qw20260923093622: skipped — [PTQ-1332-parsedtheta-fixture-builder-duplicated.md] PTQ-1332: removed all 6 local NOOP_RUN/theta ParsedTheta builders across the 5 files and switched every call site to the canonical makeTheta from tests/helpers/watch-arming-harness; in registration-reload-wiring and watcher-terminated-recovery the toEqual(theta(...)) comparisons were rewritten to compare against a single hoisted makeTheta(...) instance (makeTheta's default run mints a fresh function per call, and toEqual treats distinct function refs as unequal — confirmed by an initial red run, then fixed); unused ParsedTheta type imports pruned where the builder was the only user. PTQ-1353: added stderrLinesWithPrefix(calls, prefix) to tests/helpers/compose-workspace-harness.ts (the existing console.error-capture helper home; prefix is a caller argument per the triage's RED-at-HEAD literal-prefix carve-out) and replaced all three cited partitions plus the triage-named fourth partial copy in tests/system-note-channel.test.ts (its spy now records full arg arrays instead of args[0] so the shared projection applies; assertion counts unchanged). PTQ-1338: moved RecordingQueryModel (with the log array as the superset shape) into tests/helpers/scripted-typed-query-harness.ts beside the existing QueryModelDriver doubles; both test files now import it; the b0316 copy gains inert log pushes it never reads; newly-unused type imports pruned. PTQ-1344: added RespondFixture/respondFixtureFor(thetaSource) (memoised per source string) and qry15Body to tests/helpers/scripted-live-session-harness.ts (the home the issue names; carrying the bug-0010/0099 slug-recipe and QRY-15 doc comments); typed-repair-two-phase and typed-two-phase-live keep a one-line respondFixture wrapper over their own theta constant so their 17 call sites are untouched; per the triage correction the drifted third copy in typed-query-provider-gate.test.ts was folded in too, replacing its hand-rolled sha256(JSON.stringify) slug with the canonical respondSchemaSlug path (the fixture is only self-consistent fallback-tool-name plumbing; gate suite passes); dead createHash/lowerQueryResponseSchema/respondSchemaSlug/LoweredSchema/SchemaDecl imports pruned. Verification: the verbatim unset+tsc+npm test gate ran green (705 files, 11780 tests). ||
