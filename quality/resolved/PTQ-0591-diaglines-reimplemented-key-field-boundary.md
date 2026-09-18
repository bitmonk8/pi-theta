---
id: PTQ-0591
title: reserved-keyword-key-field-boundary-live-cell.test.ts reimplements a local diagLines(text, path) though tests/helpers/e2e-s1.ts already exports diagLines(doc)
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/helpers/e2e-s1.ts:99-101
  - tests/live/reserved-keyword-key-field-boundary-live-cell.test.ts:150-152
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reserved-keyword-key-field-boundary-live-cell.test.ts reimplements a local diagLines(text, path) though tests/helpers/e2e-s1.ts already exports diagLines(doc)

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`, which renders every diagnostic as `` `${severity} ${code}: ${message}` ``. `tests/live/reserved-keyword-key-field-boundary-live-cell.test.ts` imports `parseDoc` from that same module but not `diagLines`; instead it declares its own module-local function of the same name that takes `(text, path)`, calls `parseDoc(text, path)` itself, and maps the resulting `.diagnostics` through the identical rendering expression.

## Evidence
`tests/helpers/e2e-s1.ts:99-101`:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/live/reserved-keyword-key-field-boundary-live-cell.test.ts:150-152`:
```ts
function diagLines(text: string, path: string): string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The mapping expression — `` `${d.severity} ${d.code}: ${d.message}` `` — is byte-identical between the exported helper and the local reimplementation; the only difference is that the local version also performs the `parseDoc` call the export leaves to its caller.

## Why this is a problem
The rendering logic this file needs already exists as an exported helper in `tests/helpers/e2e-s1.ts`, imported by name (`parseDoc`) two lines above the local `diagLines` declaration in the same file. The local function restates the identical diagnostic-formatting expression rather than composing `parseDoc(...)` with the imported `diagLines(...)`.

## Suggested direction (non-binding, optional)
Composing the already-imported `parseDoc` with the already-exported `diagLines` from `tests/helpers/e2e-s1.ts` is the natural route this file's own import line already points toward.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; not applicable. Recording-double check: `diagLines` is a pure rendering helper over parse diagnostics, not a recording double; not applicable. docs/bugs/ signature search: grepped `docs/bugs/` for `diagLines` — no hits; not a documented correct-reason red. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for this file's name — no citation by name; no merge/rename/delete proposed against a pinned test. A companion filing (`qw20260917154546-d7-90-diaglines-reimplements-e2e-s1-helper.md`) already covers the identical topic for four other, disjoint live-cell files (`b0244live-...`, `b0252live-...`, `b0256live-...`, `b0257live-...`); verified `reserved-keyword-key-field-boundary-live-cell.test.ts` is not among that filing's cited locations, so this is a fifth, previously uncited instance of the same recurring pattern.

## Triage
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines, the file imports only parseDoc from ../helpers/e2e-s1 (line 71) and its local diagLines(text, path) (3 callers, lines 162/169/176) repeats the byte-identical `${d.severity} ${d.code}: ${d.message}` rendering the module already exports; genuine D7 boilerplate duplication with a mechanical fix (diagLines(parseDoc(text, path))); not a duplicate — resolved PTQ-0205's fix (2594cd44) touched e2e-s1.ts plus its four named root-level files and never named this tests/live/ file (created 2026-08-23 in 53cd0d86), and per-file e2e-s1 reimplementation residues are accepted as distinct issues (PTQ-0214/0239/0314/0386/0405); sibling intake d7-90 cites four disjoint live cells; carve-outs inapplicable (not a gate, not a recording double, docs/bugs/0249:613 witness citation pins the test not its helper body and no merge/rename/delete is proposed); stray d4_class field on a D7 filing is non-blocking (triage: claude-fable-5-1)
