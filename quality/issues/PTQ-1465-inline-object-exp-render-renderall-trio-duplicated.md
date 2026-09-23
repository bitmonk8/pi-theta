---
id: PTQ-1465
title: inline-object-stray-close-token-split.test.ts and inline-object-type-source-capture.test.ts redeclare a byte-identical Exp/render/renderAll rendering trio
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-stray-close-token-split.test.ts:213-217
  - tests/inline-object-stray-close-token-split.test.ts:252-258
  - tests/inline-object-type-source-capture.test.ts:194-198
  - tests/inline-object-type-source-capture.test.ts:211-217
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# inline-object-stray-close-token-split.test.ts and inline-object-type-source-capture.test.ts redeclare a byte-identical Exp/render/renderAll rendering trio

## Observation
Both files declare an identical `Exp` interface (`severity`, `code`,
`fills`), an identical `render(exp: Exp)` function that renders
`` `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}` ``, and an
identical `renderAll(exps)` function that maps `render` over a list. Neither
file imports these three names from `tests/helpers/`; each independently
declares the same shapes and bodies. The exact search `grep -rl "^function
renderAll" tests/*.test.ts` returns 10 files, including both of these.

## Evidence
`tests/inline-object-stray-close-token-split.test.ts:213-217`:
```ts
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
```

`tests/inline-object-stray-close-token-split.test.ts:252-258`:
```ts
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

`tests/inline-object-type-source-capture.test.ts:194-198`:
```ts
interface Exp {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly fills: ReadonlyArray<readonly [string, string]>;
}
```

`tests/inline-object-type-source-capture.test.ts:211-217`:
```ts
function render(exp: Exp): string {
  return `${exp.severity} ${exp.code}: ${msg(exp.code, exp.fills)}`;
}

function renderAll(exps: readonly Exp[]): string[] {
  return exps.map(render);
}
```

The `Exp` interface bodies are byte-identical between the two files, and the
`render`/`renderAll` pair is byte-identical between the two files. Each
file's own `msg(code, fills)` helper the `render` function calls differs only
in the registry-path string literal it passes to the shared
`registryMessageOf` (stray-close-token-split.test.ts:190-198 passes
`"docs/spec_topics/diagnostics/code-registry-{parse,load,runtime,host}.md"`;
type-source-capture.test.ts:206-208 passes
`"docs/spec_topics/diagnostics/"`), which is outside the cited `Exp`/`render`/
`renderAll` trio itself.

## Why this is a problem
The three names are a small, pure, domain-generic rendering shim over one
diagnostic-registry row shape, reimplemented identically in each file rather
than declared once. A change to the rendered line's shape (e.g. adding a
fourth field to `Exp` or changing the `severity code: message` layout) would
need the identical hand-edit applied at both sites to keep the two files'
output format in agreement.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of the `Exp` interface plus `render`/`renderAll`
(parameterised by the caller's own `msg`/registry-read function) is the
natural home these two byte-identical copies point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns.
- Recording-double check: `render`/`renderAll` format a diagnostic string
  from a description object; they record no call and back no "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "renderAll\b" docs/bugs/*.md`
  returns no hits — no documented correct-reason red names either function.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-stray-close-token-split\|inline-object-type-source-capture"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in their own bug reports' (0238, 0228) witness lists, always for the
  diagnostic behaviour under test, never for where `Exp`/`render`/`renderAll`
  live. This finding proposes no merge, rename, or deletion of either file or
  any `it()`/`describe()` — only that the duplicated rendering trio could be
  shared.
- Coverage check: the claim is about repeated helper code, not a missing
  test path; both copies are exercised by every diagnostic-list cell in
  their own file that calls `render`/`renderAll` today.
- Prior-filing overlap check: `grep -rl "inline-object-stray-close-token-split.test.ts"
  quality/resolved quality/intake quality/issues | xargs grep -l
  "inline-object-type-source-capture.test.ts"` (run before this filing)
  returned PTQ-0475 (the four-page registry-read block, since fixed by
  importing `REGISTRY` from `tests/helpers/registry-oracle.ts`), PTQ-1058
  (the `DUP`/`QUOTED`/`NOTIDENT` `Exp`-builder functions, since fixed the
  same way), and this same wave's
  `qw20260923145222-d7-02-brace-angle-exp-render-renderall-trio-duplicated.md`
  (which pairs `inline-object-stray-close-token-split.test.ts` with a
  different sibling, `brace-and-angle-annotation-junk-refusal.test.ts`, not
  with `inline-object-type-source-capture.test.ts`). PTQ-1055 names both
  files in scope here only in a "sizing the pattern, not cited as filed
  sites" list, alongside eight other files, and explicitly declines to file
  against them. None of the four prior artefacts cites the `Exp`/`render`/
  `renderAll` trio as a location pair between exactly these two files, so
  this pair is not a duplicate of any of them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — excerpts reproduce byte-identical at stray-close-token-split.test.ts:213-217/252-258 and type-source-capture.test.ts:194-198/211-217, both copies live (expectGroupShared(..., renderAll) at :295 and :602/:1077/:1095), `grep -l "^function renderAll" tests/*.test.ts` = 10 files incl. both; the case is stronger than filed: tests/helpers/registry-oracle.ts:86-128 ALREADY exports `Exp`/`render`/`renderAll` (PTQ-1055's fix, commit 7ef16dce, same "docs/spec_topics/diagnostics/" path type-source-capture's msg uses) and both files import REGISTRY/DUP/QUOTED/NOTIDENT from that very module at line 1 while redeclaring the trio — a mechanical import swap; not a duplicate of resolved PTQ-1055 (generic-argument pair, explicitly declined these files) nor of same-wave d7-02 (brace-angle pair) (triage: claude-fable-5-1)
