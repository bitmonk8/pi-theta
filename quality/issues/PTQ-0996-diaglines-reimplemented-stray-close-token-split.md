---
id: PTQ-0996
title: inline-object-stray-close-token-split.test.ts redeclares e2e-s1's exported diagLines(doc) instead of importing it
lens: D7
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
status: open
verdict: confirmed
locations:
  - tests/inline-object-stray-close-token-split.test.ts:9
  - tests/inline-object-stray-close-token-split.test.ts:309-312
  - tests/helpers/e2e-s1.ts:284-286
sites: 1
fix_scope: localized
---

# inline-object-stray-close-token-split.test.ts redeclares e2e-s1's exported diagLines(doc) instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``.
`tests/inline-object-stray-close-token-split.test.ts` already imports
`parseDoc` and `subagentTheta` from that exact module (`./helpers/e2e-s1`)
on the file's very first import line but omits `diagLines`, then declares
its own module-local function of the identical name and an identical
one-line body over the same `doc.diagnostics` projection, feeding a local
`lines(src)` wrapper that every diagnostic-list cell in the file drives
through `expectGroup`.

## Evidence
`tests/helpers/e2e-s1.ts:284-286` (the canonical, already-exported helper,
re-read immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-stray-close-token-split.test.ts:9` (the import that
omits `diagLines`) and `:309-312` (the local reimplementation plus its
wrapper), re-read immediately before filing:
```ts
import { parseDoc, subagentTheta as theta } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string): string[] {
  return diagLines(parseDoc(src));
}
```

Exact search: `grep -n "^function diagLines" tests/inline-object-stray-close-token-split.test.ts`
returns exactly one declaration; the file's only `./helpers/e2e-s1` import
(line 9) names `parseDoc` and `subagentTheta`, never `diagLines`.

## Why this is a problem
The file already reaches into `tests/helpers/e2e-s1` for `parseDoc` in the
same import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second time, identically (bar an explicit `Diagnostic`
parameter type annotation the export omits), under a second, file-private
declaration of the identical name and doc comment as the exported one,
instead of calling the already-visible import. The local copy is live: it
feeds the `lines()` wrapper, which drives every `expectGroup`-compared cell
in the file (groups A–P).

## Suggested direction (non-binding, optional)
The file could add `diagLines` to its existing `./helpers/e2e-s1` import and
have its local `lines(src)` wrapper call the imported function directly,
dropping the local declaration.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines`/`lines` render an
  already-produced diagnostics array for a positive assertion; they record
  no calls and back no "never called" witness.
- docs/bugs/ signature search: `grep -n "diagLines"
  docs/bugs/0238-stray-close-token-underflows-top-level-split.md` → 0 hits;
  no documented correct-reason red cites the local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-stray-close-token-split" docs/reference/coverage-matrix.md`
  → 0 hits. `docs/bugs/0238-*.md` cites this file by name and by cell id
  (W1–W22) as its own §Fix witness, but none of those citations names or
  depends on the `diagLines` function's declaration; this finding proposes
  no merge, rename, or deletion of the file or any `it()`/`describe()` block
  — only that the existing `./helpers/e2e-s1` import could additionally name
  `diagLines`.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; the file's own tests fully exercise the local copy, and no
  behaviour path is claimed untested.
- Prior-filing overlap check: `grep -rl "inline-object-stray-close-token-split"
  quality/issues quality/intake quality/resolved` finds `PTQ-0596`
  (the `Cell`/`expectGroup` harness pair, a disjoint function, which already
  lists this file among 13 sites carrying that pattern), `PTQ-0827`
  (this file's local `msg()` reimplementing `registryMessageOf`, a disjoint
  function), `PTQ-0878` (this file's local `envelope()`, a disjoint
  function), `qw20260918155535-d7-01-loweredparams-frontmatter-reader-quintupled`
  (a disjoint `loweredParams` reader) and the resolved
  `PTQ-0475`/`PTQ-0555` (a disjoint registry-read block and frontmatter
  builder) — none of which cites this file's `diagLines` declaration. The
  resolved `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md`
  covers the general `diagLines`-duplication root cause but is closed
  (status: fixed) and its landed fix did not touch this file — the local
  `diagLines` still exists at the cited lines — matching the accepted
  residual-site convention already used for this exact root cause elsewhere
  in this wave (`qw20260918155535-d7-01-diaglines-reimplemented-bracket-group-truncation.md`,
  filed against a different, previously-unnamed residual site of the same
  closed finding).

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `diagLines` at tests/inline-object-stray-close-token-split.test.ts:310-312 (cited 309-312; one-line drift) is byte-identical to the export at tests/helpers/e2e-s1.ts:285-286 once `export ` and the `: Diagnostic` annotation are stripped, the file's sole e2e-s1 import (:9) names only `parseDoc`/`subagentTheta`, `grep diagLines` in the file returns exactly one declaration (:310) plus its `lines()` caller (:315), the copy is live via `lines()` → `expectGroup` (:340, 8 group calls), 16/16 green; carve-outs hold (not a gate file, no recording double, docs/bugs/0238 `diagLines` → 0, coverage-matrix → 0, no merge/rename/delete proposed); dedupe clean — PTQ-0205 (fixed) never named this file and its fix commit did not touch it, so it is an untracked residual under the accepted convention (same-wave sibling d7-01-bracket-group-truncation and PTQ-0591/0732/0733/0800 confirmed on identical reasoning), and the seven quality files citing this file (PTQ-0596/0827/0878/0475/0555, intake d7-01-loweredParams) track disjoint `expectGroup`/`msg()`/`envelope()`/REGISTRY/frontmatter/`loweredParams` shapes, mentioning `diagLines` only as the e2e-s1 export — D7 boilerplate-duplication class with a mechanical import-swap fix; note for the fixer: the `Diagnostic` type import at :6 is used only by the local copy and should go with it (triage: claude-fable-5-1)
