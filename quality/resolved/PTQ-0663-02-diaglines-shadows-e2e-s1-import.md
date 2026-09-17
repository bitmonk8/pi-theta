---
id: PTQ-0663
title: Both files locally redeclare diagLines(doc) though each already imports parseDoc from the module that exports it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-inline-enum-position-refusal.test.ts:271-273
  - tests/params-inline-object-lowering.test.ts:353-355
  - tests/helpers/e2e-s1.ts:100-102
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both files locally redeclare diagLines(doc) though each already imports parseDoc from the module that exports it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
which renders every diagnostic as `` `${severity} ${code}: ${message}` ``.
Both files in this review's scope import `parseDoc` from that same module
(`./helpers/e2e-s1`) but not `diagLines`; each instead declares its own
module-private `function diagLines(doc: ThetaDocument): string[]` whose body
is the byte-identical one-line map expression, under the identical doc
comment.

## Evidence
`tests/helpers/e2e-s1.ts:100-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/params-inline-enum-position-refusal.test.ts:271-273`:
```ts
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/params-inline-object-lowering.test.ts:352-355`:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Both files' import lines name only `parseDoc` from the shared module:
`tests/params-inline-enum-position-refusal.test.ts:8` —
`import { parseDoc } from "./helpers/e2e-s1";`; `tests/params-inline-object-lowering.test.ts:13` —
`import { parseDoc } from "./helpers/e2e-s1";`. Search:
`grep -n "^function diagLines\|import.*helpers/e2e-s1" tests/params-inline-enum-position-refusal.test.ts tests/params-inline-object-lowering.test.ts`
→ each file shows exactly one local `function diagLines` declaration and one
`e2e-s1` import that omits it.

## Why this is a problem
The two local bodies are byte-identical to each other and to the canonical
export — not a divergent rendering each file needed independently, but the
same one-line projection restated twice in a two-file review scope that
already imports the module `diagLines` lives in. `tests/helpers/e2e-s1.ts`'s
own purpose, stated in its header, is to hold shared drivers so "a test can
assert on the returned diagnostics … without" re-deriving the plumbing; a
`diagLines` render is exactly that class of plumbing, not domain logic
specific to bug 0162 or bug 0035.

## Suggested direction (non-binding, optional)
Both files could add `diagLines` to their existing `import { parseDoc } from
"./helpers/e2e-s1"` line and drop the local declaration, the way each file's
own `loadCleanly`/slug-oracle helpers already reuse other `tests/helpers/`
exports directly.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: `diagLines` maps an already-produced,
  already-returned diagnostics array for a positive comparison; it records no
  call and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/0162* docs/bugs/0035*` returns no hits; neither bug document states a rationale for keeping this render local to each file.
- coverage-matrix/bug-doc citation search: `grep -n "params-inline-enum-position-refusal\|params-inline-object-lowering" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change to any `it()`/`describe()` name, count, or assertion, only to where the render function is defined.
- Overlap check: the already-resolved PTQ-0205 (diagline-rendering-helper-duplication, status fixed) established the general class and named three other files plus a "at least" list that does not include either file in this review's scope; the pending intake `qw20260917154546-d7-90-diaglines-reimplements-e2e-s1-helper.md` covers a different `(text, path)`-signature variant in four `tests/live/` files, also not overlapping these two `(doc)`-signature sites. Neither prior filing cites either file reviewed here.
- Coverage check: the claim is about a repeated function DEFINITION, not a missing test path; both local copies are exercised by every assertion in their own file that calls them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: e2e-s1.ts:100-102 exports diagLines(doc) and both files carry byte-identical live local copies (enum-position-refusal:271-273, called at 291/296; object-lowering:353-355, called at ~17 sites) while importing only parseDoc from ./helpers/e2e-s1 (lines 7 and 14); D7 boilerplate duplication confined to tests/, no gate/recording-double carve-out, coverage-matrix 0 hits, and bug docs 0035/0043/0045 pin the file/cells not the helper's definition site; not a duplicate — PTQ-0205's fix commit 2594cd44 touched neither file and its "at least" list names neither, and sibling intakes d7-90 (tests/live, (text,path) variant) and d7-125-01 (query-annotation-nontype-text-refusal) cite different files, so this is an unmigrated residual of the PTQ-0240/PTQ-0405 kind (triage: claude-fable-5-1)
