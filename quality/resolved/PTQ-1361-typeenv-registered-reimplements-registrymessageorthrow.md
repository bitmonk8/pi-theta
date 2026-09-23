---
id: PTQ-1361
title: typeenv-prototype-names.test.ts's local `registered(code)` reimplements the canonical registryMessageOrThrow
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/typeenv-prototype-names.test.ts:201-208
  - tests/helpers/load-row-harness.ts:111-126
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# typeenv-prototype-names.test.ts's local `registered(code)` reimplements the canonical registryMessageOrThrow

## Observation
`tests/typeenv-prototype-names.test.ts` declares a local `registered(code:
string): string` that reads `registryMessage(REGISTRY, code)` and throws a
loud error naming the missing DIAG-4 Message row when the template is
`undefined`, otherwise returning the template. `tests/helpers/load-row-harness.ts`
already exports `registryMessageOrThrow(registry, code, missingRowContext)`,
performing the identical `registryMessage(registry, code)` read and the same
throw-when-`undefined` shape, parameterising only the caller-supplied tail
sentence appended after the fixed DIAG-4 prefix. The in-scope file imports
`registryMessage` directly from `../tools/code-registry/index.js` and
`REGISTRY` from `./helpers/registry-oracle`, but does not import
`registryMessageOrThrow` from `./helpers/load-row-harness`.

## Evidence
tests/typeenv-prototype-names.test.ts:201-208 (re-read immediately before
filing):
```ts
function registered(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for ${code} — the DIAG-4 column is this file's oracle, so a missing row is a harness failure, never a skip`,
    );
  }
  return template;
}
```

tests/helpers/load-row-harness.ts:111-126 (re-read immediately before
filing):
```ts
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}
```

Exact search: `grep -n "^function registered(code: string): string {" tests/*.test.ts`
→ 19 hits, one per file, including the in-scope
`tests/typeenv-prototype-names.test.ts:201` (the other 18 in-scope-adjacent
files are named as pattern evidence, not filed here: arg-mismatch-diagnostic-count-by-surface.test.ts,
array-sink-unresolvable-deferral.test.ts, ctor-field-type-check.test.ts,
fn-arg-member-read-proof.test.ts, fn-arg-type-mismatch-wired.test.ts,
increment-decrement-wiring.test.ts, interpolation-parse-diagnostics.test.ts,
invoke-arg-array-literal-provable.test.ts, invoke-arg-type-mismatch-wired.test.ts,
join-element-unresolvable-disposition.test.ts, let-arm-withhold-binding-scoped.test.ts,
loop-element-withhold-binding-scoped.test.ts, match-arm-scope-inference-pass.test.ts,
params-declared-type-in-type-layer.test.ts, plain-for-loop-variable-element-type.test.ts,
question-operand-defect.test.ts, reassign-rhs-type-compat.test.ts,
unresolvable-operand-structural-target-adjudication.test.ts).

## Why this is a problem
The two function bodies perform the identical sequence — read
`registryMessage(registry, code)`, guard `if (template === undefined)`, throw
a loud error citing DIAG-4 and the missing row, else return the template —
differing only in the fixed tail sentence, which is exactly what
`registryMessageOrThrow`'s third parameter (`missingRowContext`) already
exists to carry. The in-scope file's `registered()` is a second,
independently maintained implementation of the same read-or-throw contract
the helper module centralises, reachable in one import line since the file
already imports a sibling export (`REGISTRY`) from the neighbouring
`tests/helpers/registry-oracle` module.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts` already exports `registryMessageOrThrow`
for exactly this call shape (registry, code, caller-supplied context
sentence).

## False-positive check
- Gate-pin check: `tests/typeenv-prototype-names.test.ts` is not named
  `*gate*.test.ts` or any of the named gate kin; the cited lines are a
  message reader, not a pinned count or inventory assertion.
- Recording-double check: `registered()` reads an already-produced registry
  row for a positive message-fill assertion; it records no calls and backs
  no "never called" witness.
- docs/bugs/ signature search: `grep -n "registered(code)\|registryMessageOrThrow" docs/bugs/0038-typeenv-prototype-member-names-resolve-as-declared-types.md docs/bugs/0262*.md` → 0 hits; no documented correct-reason red cites this local declaration.
- coverage-matrix/bug-doc citation search: `grep -n "typeenv-prototype-names" docs/reference/coverage-matrix.md` → 0 hits. `grep -rn "typeenv-prototype-names" docs/bugs/*.md` shows the file is cited by bug 0038 and by bug 0262 as a witness; this finding proposes no merge, rename or deletion of the file or any of its cells — only that the local `registered()` declaration duplicates the already-exported `registryMessageOrThrow` — so those citations are unaffected.
- Coverage check: the claim is about a repeated function body, not a missing test path; every cell in the file remains exercised by its own currently-stated assertions.
- Prior-triage awareness: `quality/TRIAGE_LOG.md` records the sibling
  `registryMessageOf`-named shape of this same root cause fixed in two files
  and explicitly left ~16-17 other files carrying it unchased under that
  ticket; `registered(code)` is the same read-or-throw shape under a
  different local name, confirmed present in 19 files including this
  in-scope one, and has not itself been filed under any prior PTQ (`grep -rl
  "function registered(code: string): string" quality/resolved quality/issues
  quality/intake` shows no prior filing naming this exact function in this
  file).

## Triage
verdict: confirmed — excerpts match at tests/typeenv-prototype-names.test.ts:201-208 and tests/helpers/load-row-harness.ts:111-126; the local `registered()` performs the identical registryMessage read → undefined-guard → loud DIAG-4 throw → return that the exported `registryMessageOrThrow(registry, code, missingRowContext)` centralises, differing only in the tail sentence the helper's third parameter carries; the file imports REGISTRY from ./helpers/registry-oracle but nothing from ./helpers/load-row-harness (grep confirms 0 `registryMessageOrThrow` hits in the file); the 19-file `^function registered(code: string): string {` search reproduces exactly; not a gate test, not a recording double, not cited by coverage-matrix.md (0 hits) and no bug-doc signature names the helper; no prior PTQ names this file for this shape (PTQ-1046/0859 fixed the same class in other files) — D7 boilerplate duplication, mechanical one-import fix (triage: claude-fable-5-1)
