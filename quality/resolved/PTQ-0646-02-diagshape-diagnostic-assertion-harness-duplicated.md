---
id: PTQ-0646
title: The DiagShape/shapes/render/readRepoFile diagnostic-assertion harness is redeclared byte-identical across six pattern-refusal test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/object-pattern-head-field-set-refusal.test.ts:200-204
  - tests/object-pattern-head-field-set-refusal.test.ts:354-362
  - tests/object-pattern-head-field-set-refusal.test.ts:431-445
  - tests/object-pattern-head-field-set-refusal.test.ts:472-478
  - tests/object-pattern-head-unresolved-refusal.test.ts:206-214
  - tests/object-pattern-head-unresolved-refusal.test.ts:257-271
  - tests/object-pattern-head-unresolved-refusal.test.ts:298-304
  - tests/object-pattern-head-unresolved-refusal.test.ts:339-343
  - tests/capitalised-bare-match-pattern-refusal.test.ts:173-278
  - tests/match-pattern-increment-decrement.test.ts:94-100
  - tests/match-pattern-increment-decrement.test.ts:223-291
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:151-157
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:303-449
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:140-278
sites: 6
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The DiagShape/shapes/render/readRepoFile diagnostic-assertion harness is redeclared byte-identical across six pattern-refusal test files

## Observation
Both in-scope files — `tests/object-pattern-head-field-set-refusal.test.ts` and `tests/object-pattern-head-unresolved-refusal.test.ts` — declare, module-scope, an identical five-piece "reduce a diagnostic to its five normative fields, render a diagnostic list to a failure string, read a repo file for the registry oracle" scaffold: the `DiagShape` interface, `shapes()`, `render()`, `readRepoFile()`, and the `REGISTRY_PARSE_PAGE` constant. The same five pieces, byte-identical or byte-identical apart from comment wording, also recur in four sibling test files outside this review's scope (`capitalised-bare-match-pattern-refusal.test.ts`, `match-pattern-increment-decrement.test.ts`, `pattern-field-literal-integer-narrowing-refusal.test.ts`, `reserved-keyword-object-pattern-head-refusal.test.ts`). Three of the six files additionally carry an identical `range()` builder and `deniesRegistration()` predicate (the fourth, `match-pattern-increment-decrement.test.ts`, uses differently-named `at`/`span` builders and an `expectCell` assertion instead, so those two pieces are not claimed for it). One in-scope file's own doc comment cites the sibling gate file's `deniesRegistration` copy by name and line as the mirrored precedent ("the same mirror, for the same reason, as symbol `deniesRegistration`, tests/reserved-keyword-object-pattern-head-refusal.test.ts:228").

## Evidence
`tests/object-pattern-head-field-set-refusal.test.ts:354-362` (`shapes`):
```ts
function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  }));
}
```

`tests/object-pattern-head-unresolved-refusal.test.ts:206-214` — the same function, byte-identical body:
```ts
function shapes(doc: ThetaDocument): DiagShape[] {
  return doc.diagnostics.map((d: Diagnostic) => ({
    severity: d.severity,
    code: d.code,
    file: d.file,
    range: d.range,
    message: d.message,
  }));
}
```

`tests/capitalised-bare-match-pattern-refusal.test.ts:173-179` and `tests/reserved-keyword-object-pattern-head-refusal.test.ts:140-146` — the `DiagShape` interface, byte-identical in both sibling files:
```ts
interface DiagShape {
  readonly severity: string;
  readonly code: string;
  readonly file: string | undefined;
  readonly range: SourceRange | undefined;
  readonly message: string;
}
```

`tests/object-pattern-head-field-set-refusal.test.ts:200-204` and `tests/object-pattern-head-unresolved-refusal.test.ts:339-343` — `readRepoFile`/`REGISTRY_PARSE_PAGE`, byte-identical in both in-scope files:
```ts
const REGISTRY_PARSE_PAGE = "docs/spec_topics/diagnostics/code-registry-parse.md";

function readRepoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}
```

Exact search: `grep -n "^interface DiagShape\|^function shapes\|^function render\|^function readRepoFile\|^const REGISTRY_PARSE_PAGE" tests/*.test.ts` returns exactly these five declarations, once each, in all six named files (30 matches total: 5 × 6), and zero matches in any `tests/helpers/*.ts` module — no shared export backs any of the five names. A second search, `grep -n "^function range(\|^function deniesRegistration" tests/*.test.ts`, returns both names in five of the six files (10 matches; `match-pattern-increment-decrement.test.ts` has neither, using `at`/`span`/`expectCell` in their place).

## Why this is a problem
The same "reduce a diagnostic to its normative shape, render a diagnostic list, read a repo file for the registry oracle" scaffold is authored independently six times, with no shared source of truth, and one file's own doc comment names another file's copy as the mirrored precedent rather than importing it. A change to the normative diagnostic shape (`diagnostic-shape.md`'s five fields) or to the registry-page path constant has to be hand-applied at all six declaration sites.

## Suggested direction (non-binding, optional)
`tests/helpers/` holds no diagnostic-assertion module today; the five pieces confirmed identical across all six files (plus `range`/`deniesRegistration` where present) are natural candidates for a shared, parameterised `tests/helpers/` module — only each file's own per-bug diagnostic-builder functions (`extraField`, `unresolved`, `incDec`, etc.) would stay local — alongside the corpus-discovery precedent this same in-scope pair already followed when `committedThetaSources` was extracted to `tests/helpers/theta-corpus.ts`.

## False-positive check
- Gate-pin check: none of the six files match `*gate*.test.ts` or a named gate kin; this finding is about a harness-declaration site, not a pinned count or corpus inventory.
- Recording-double check: not applicable — none of the five (or seven) pieces are a fake, double, or MUST-NOT witness; `shapes`/`render`/`deniesRegistration` are pure data-shaping/assertion functions over real diagnostics.
- docs/bugs/ signature search: `grep -rln "DiagShape\|deniesRegistration" docs/bugs/` returns no hits — no documented correct-reason red names any of these pieces.
- coverage-matrix/bug-doc citation search: `grep -n "object-pattern-head-field-set-refusal\|object-pattern-head-unresolved-refusal\|capitalised-bare-match-pattern-refusal\|match-pattern-increment-decrement\|pattern-field-literal-integer-narrowing-refusal\|reserved-keyword-object-pattern-head-refusal" docs/reference/coverage-matrix.md` returns 0 hits. The bug docs cite these files repeatedly by name for specific cells, never for the `DiagShape`/`shapes`/`render`/`readRepoFile` declaration lines cited here; no merge, rename, or deletion of any file or cell is proposed.
- Coverage-drift check: the claim is entirely about a repeated harness DEFINITION; each file's own cells exercise its own copy, so this is not a coverage-gap claim.
- Prior-filing search: `grep -rl "DiagShape" quality/intake quality/resolved` returns no hits before this filing — no existing PTQ or intake candidate already tracks this specific scaffold's duplication (PTQ-0226, resolved, tracked a different scaffold — the `committedThetaSources` corpus-discovery step — in the same in-scope file pair, already migrated to `tests/helpers/theta-corpus.ts` as both files' own import line confirms).

## Triage
verdict: confirmed — independently re-verified by extracting each declaration and md5-diffing: DiagShape/shapes/render/readRepoFile/range/deniesRegistration are byte-identical across five of the six files (field-set, unresolved, capitalised-bare, pattern-field-literal, reserved-keyword) and match-pattern-increment-decrement differs only by an added `hint` field/`[hint=…]` suffix; every cited excerpt sits at the cited lines, no tests/helpers module exports any of the names (e2e-s1.ts has diagLines/codes but no five-field reducer), the :468/:294 doc comments really cite reserved-keyword…:228's deniesRegistration by name, coverage-matrix 0 hits, docs/bugs 0 hits for DiagShape/deniesRegistration, none of the files is a gate/recording-double/failLoudly case, and no PTQ (0205/0215/0226 family included) tracks this scaffold — genuine D7 boilerplate/copy-paste-fixture duplication; filing inaccuracies, non-blocking: the stated grep is not "exactly 30 matches" (`^function render` hits ~100 other test files and REGISTRY_PARSE_PAGE/readRepoFile also recur in b0315-stdlib-arg-surface.test.ts) and the Observation's "three of the six" carry range/deniesRegistration is actually five (its own Evidence count of 10 is right); fixer note: the readRepoFile/REGISTRY_PARSE_PAGE→parseRegistry slice is the registry-oracle family (PTQ-0215/0313/0404) and overlaps confirmed sibling intakes d7-105-01 (match-pattern-increment-decrement:94-110) and d7-01-registry-oracle-read-reimplemented-in-scope-trio (pattern-field-literal…:143-158), so route it through tests/helpers/registry-oracle.ts readRegistry(["parse"]) rather than a new helper, keeping a raw page read where files scan raw text (Hint column, line lookups at unresolved:366, reserved-keyword:304/319/341, capitalised:387); deniesRegistration in reserved-keyword…:228 is also claimed by sibling d7-130-01 (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
