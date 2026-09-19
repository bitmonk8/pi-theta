---
id: PTQ-0981
title: generic-argument-bracket-group-truncation.test.ts redeclares e2e-s1's exported diagLines(doc) instead of importing it
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/generic-argument-bracket-group-truncation.test.ts:8
  - tests/generic-argument-bracket-group-truncation.test.ts:326-335
  - tests/helpers/e2e-s1.ts:284-286
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# generic-argument-bracket-group-truncation.test.ts redeclares e2e-s1's exported diagLines(doc) instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``.
`tests/generic-argument-bracket-group-truncation.test.ts` already imports
`parseDoc` from that exact module (`./helpers/e2e-s1`) on the same import
line but omits `diagLines`, then declares its own module-local function of
the identical name and an identical one-line body over the same
`doc.diagnostics` projection, composing a local `lines(src, path)` wrapper
on top of the local copy rather than the export.

## Evidence
`tests/helpers/e2e-s1.ts:284-286` (the canonical, already-exported helper,
re-read immediately before filing):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/generic-argument-bracket-group-truncation.test.ts:8` (the import that
omits `diagLines`) and `:326-335` (the local reimplementation plus its
wrapper), re-read immediately before filing:
```ts
import { parseDoc, subagentTheta as theta, subagentParamsSrc as paramsSrc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}
```

Exact search: `grep -n "^function diagLines" tests/generic-argument-bracket-group-truncation.test.ts` returns exactly one declaration; the file's only `./helpers/e2e-s1` import (line 8) names `parseDoc`, `subagentTheta`, and `subagentParamsSrc`, never `diagLines`.

## Why this is a problem
The file already reaches into `tests/helpers/e2e-s1` for `parseDoc` in the
same import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second time, identically (bar an explicit `Diagnostic`
parameter type annotation the export omits), under a second, file-private
declaration of the identical name and doc comment as the exported one,
instead of calling the already-visible import. The local copy is live: it
feeds the `lines()` wrapper, which every diagnostic-list cell in the file
drives through `expectGroup`.

## Suggested direction (non-binding, optional)
The file could add `diagLines` to its existing `./helpers/e2e-s1` import and
have its local `lines(src, path)` wrapper call the imported function
directly, dropping the local declaration.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines`/`lines` render an
  already-produced diagnostics array for a positive assertion; they record
  no calls and back no "never called" witness.
- docs/bugs/ signature search: `grep -n "diagLines" docs/bugs/0236-bracket-group-generic-argument-truncates-list.md` → 0 hits; no documented correct-reason red cites the local reimplementation. The file itself is a §Fix (d) fresh witness for bug 0236 (already fixed per its own header), and running `npx vitest run tests/generic-argument-bracket-group-truncation.test.ts` passes green, so nothing here is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "generic-argument-bracket-group-truncation" docs/reference/coverage-matrix.md` → 0 hits. The resolved finding `quality/resolved/PTQ-0205-diagline-rendering-helper-duplication.md` lists this file's `diagLines` at its own line 365 (a prior-tree line number) as part of a 68-site pattern roster, but that finding is closed/fixed and its landed fix commit did not touch this file (the local `diagLines` still exists at the cited lines), so this is an untracked residual site of that closed root cause — matching the accepted residual-site convention documented in the triage notes of PTQ-0591/PTQ-0732/PTQ-0733/PTQ-0800 ("the roster was pattern evidence, not cited sites"). This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` block — only that the existing `./helpers/e2e-s1` import could additionally name `diagLines` — so no pinned citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; the file's own tests fully exercise the local copy, and no
  behaviour path is claimed untested.
- Overlap check: `grep -rl "generic-argument-bracket-group-truncation" quality/issues quality/intake quality/resolved` finds `PTQ-0596` (the `Cell`/`expectGroup` harness pair, a disjoint function), `PTQ-0774-03` (systemNoteContents), and `PTQ-0808` (the file's local `msg()` reimplementing `registryMessageOf`, a disjoint function) — none of which cites `diagLines` in this file; `PTQ-0800` covers the sibling file `tests/generic-argument-inline-field-key-rules.test.ts`'s `diagLines` reimplementation but explicitly names only that file's location, not this one.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `diagLines` at tests/generic-argument-bracket-group-truncation.test.ts:330-332 (cited 326-335; small drift) is identical to the export at tests/helpers/e2e-s1.ts:285-287 once `export ` and the `: Diagnostic` annotation are stripped (mktemp diff → zero), the file's sole e2e-s1 import (:9) names only `parseDoc`/`subagentTheta`/`subagentParamsSrc`, the decl grep returns exactly one declaration, the copy is live via `lines()` (:335) through expectGroup, docs/bugs/0236 → 0, coverage-matrix → 0, exemptions → 0, not a gate file, no recording double, 10/10 green; PTQ-0205's roster names this file at a prior-tree `:365` but that finding is fixed and its commit did not touch this file, so the site is an untracked residual under the accepted convention (PTQ-0591/0732/0733/0800 confirmed on identical reasoning); the two overlap hits the candidate omitted (PTQ-0811, PTQ-0827) mention this file only as a sibling in `msg()` filings, PTQ-0596 names `diagLines` only as context for the disjoint `expectGroup` harness, and same-wave sibling d7-01-positionrows cites a disjoint table — D7 boilerplate-duplication class with a mechanical import-swap fix; note for the fixer: the `Diagnostic` type import at :5 is used only by the local copy and should go with it (triage: claude-fable-5-1)
