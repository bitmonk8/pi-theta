---
id: PTQ-1398
title: b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts declares a local diagLines wrapper instead of importing the canonical e2e-s1 export its own sibling live cells already use
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:84,177-179,202,209
  - tests/helpers/e2e-s1.ts:436-439
  - tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:100
  - tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:99
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts declares a local diagLines wrapper instead of importing the canonical e2e-s1 export its own sibling live cells already use

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(source: ThetaDocument |
readonly Diagnostic[])`, a rendering helper that maps a document's
diagnostics to `` `${severity} ${code}: ${message}` `` strings.
`tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts`
imports `parseDoc` from `../helpers/e2e-s1` (line 84) but does not import
`diagLines` from the same module; instead it declares its own
module-private `diagLines(text, path)` function (lines 177-179) that calls
`parseDoc` and maps the identical rendering inline, then calls that local
function at its two attribution-guard assertions (lines 202, 209). Two
other live cells reviewed in this same wave/scope —
`b0244live-keyless-entry-params-refusal-live-cell.test.ts` and
`b0256live-stranded-entry-params-refusal-live-cell.test.ts` — import
`diagLines` and `parseDoc` together from `../helpers/e2e-s1` and call
`diagLines(parseDoc(text, stem))` directly, with no local wrapper.

## Evidence
`tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:84`
(the e2e-s1 import line; `diagLines` is not among the names pulled in):
```ts
import { parseDoc } from "../helpers/e2e-s1";
```

`tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:177-179`
(the local reimplementation):
```ts
function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}
```

`tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:202,209`
(the two call sites the local wrapper exists for):
```ts
    expect(
      diagLines(OFFENDER, `${OFFENDER_STEM}.theta`),
      ...
    expect(
      diagLines(CONTROL, `${CONTROL_STEM}.theta`),
```

`tests/helpers/e2e-s1.ts:436-439` (the canonical, already-exported helper,
producing the byte-identical string):
```ts
export function diagLines(source: ThetaDocument | readonly Diagnostic[]): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/b0244live-keyless-entry-params-refusal-live-cell.test.ts:100`
(the sibling in this same review scope, importing and composing the
canonical helper directly):
```ts
import { diagLines, parseDoc } from "../helpers/e2e-s1";
...
      diagLines(parseDoc(OFFENDER, `${OFFENDER_STEM}.theta`)),
```

`tests/live/b0256live-stranded-entry-params-refusal-live-cell.test.ts:99`
(the other sibling in this same review scope, same pattern):
```ts
import { diagLines, parseDoc } from "../helpers/e2e-s1";
...
      diagLines(parseDoc(OFFENDER, `${OFFENDER_STEM}.theta`)),
```

Exact search: `grep -n "^function diagLines" tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts` → 1 hit (line 177), the sole declaration site of this root cause in scope.

## Why this is a problem
The local function's body — `parseDoc(text, path).diagnostics.map((d) =>
\`${d.severity} ${d.code}: ${d.message}\`)` — is the same one-line map the
canonical export performs once `"diagnostics" in source` resolves to
`source.diagnostics` for a `ThetaDocument` input, which is exactly the
shape `parseDoc`'s return value has. Two files reviewed in this identical
scope already import and compose the canonical name (`diagLines(parseDoc(...))`)
instead of redeclaring it, so the local copy in the third file is not an
independent design choice for a different signature need — the local
wrapper exists only to fold `parseDoc(text, path)` and `diagLines(doc)`
into one call, which the file could do inline at its two call sites with
the already-imported names.

## Suggested direction (non-binding, optional)
The local `diagLines` declaration could be dropped and `diagLines` added to
the existing `../helpers/e2e-s1` import line, with the two call sites
becoming `diagLines(parseDoc(OFFENDER, ...))` / `diagLines(parseDoc(CONTROL, ...))`,
mirroring the two sibling cells in this same scope.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` and matches none of the
  named gate kin; the cited lines are a rendering helper, not a pinned
  count or inventory assertion.
- Recording-double check: `diagLines` maps an already-produced array; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "diagLines" docs/bugs/0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md` → 0 hits; no documented correct-reason red cites this local declaration.
- coverage-matrix/bug-doc citation search: `grep -n "b0263live-frontmatter-yaml-parse-failure-live-cell" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` block, and no change to any assertion's expected value — only the definition site of one internal helper function — so no pinned-test citation is affected.
- Prior filing search: `ls quality/intake | grep -i "0263\|frontmatter-yaml"` and `ls quality/resolved | grep -i "0263\|frontmatter-yaml"` → the only resolved hit is `PTQ-0263-row-8-note-tautological-assert.md`, an unrelated finding (a different numeric coincidence, not about this file or about `diagLines`); no filing in `quality/intake` or `quality/resolved` names this file or this local declaration.
- Coverage check: the claim is about a repeated function definition, not a missing test path; every diagnostic-list assertion in the file is exercised by the file's own currently-passing assertions untouched by this finding.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/live/b0263live-frontmatter-yaml-parse-failure-live-cell.test.ts:84 imports only `parseDoc` from `../helpers/e2e-s1`, :177-181 declares a module-private `diagLines(text, path)` whose body is `parseDoc(text, path).diagnostics.map(d => \`${d.severity} ${d.code}: ${d.message}\`)` — byte-identical rendering to the exported tests/helpers/e2e-s1.ts:436-439 `diagLines` once its `"diagnostics" in source` arm resolves for the `ThetaDocument` that `parseDoc` returns — with exactly 2 call sites (:202, :209); the two in-scope siblings b0244live:83/157/163 and b0256live:90/169/177 import `diagLines` and compose `diagLines(parseDoc(...))` as claimed (cited sibling line numbers point at the import rather than the calls — tolerable drift, content matches); stated searches reproduce (docs/bugs/0263 diagLines → 0, coverage-matrix file cite → 0), not a gate file, no recording double, no it()/describe() or expected-value change proposed; dedupe clean — PTQ-1072 cites this file only for the `FAIL_CLOSED_MARKERS` constant at :181 and PTQ-1062 for the offender/control precondition template, both different root causes, and the same-wave diagLines siblings (d7-01 inline-slug, etc.) cite different files, so this is an untracked residual under the accepted per-file convention (PTQ-0981/1027/1028/1071) — D7 boilerplate-duplication class with a mechanical import-swap fix (triage: claude-fable-5-1)
