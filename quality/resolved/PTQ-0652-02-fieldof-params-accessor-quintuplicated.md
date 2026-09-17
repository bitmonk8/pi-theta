---
id: PTQ-0652
title: fieldOf(loaded, wireName) params-field accessor is byte-identical across five lowering/refusal test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:400-408
  - tests/params-brace-union-rhs-lowering.test.ts:539-547
  - tests/binder-param-line-newline-normalisation.test.ts:393-401
  - tests/params-default-string-literal-raw-newline.test.ts:402-410
  - tests/params-inline-object-lowering.test.ts:434-442
sites: 5
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# fieldOf(loaded, wireName) params-field accessor is byte-identical across five lowering/refusal test files

## Observation
`tests/params-block-mapping-rhs-refusal.test.ts` and
`tests/params-brace-union-rhs-lowering.test.ts` — the two files in this
review's scope — each declare a module-scope
`function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField`
that finds the named field in `loaded.fields` and throws loudly, naming the
dropped declaration, if it is absent. The identical function, same name, same
signature, same body byte-for-byte, is independently declared in three further
sibling test files in the same params/lowering family. No `tests/helpers/*.ts`
module exports this accessor.

## Evidence
`tests/params-block-mapping-rhs-refusal.test.ts:400-408`:
```ts
function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField {
  const found = loaded.fields.find((f) => f.wireName === wireName);
  if (found === undefined) {
    throw new Error(
      `no params field '${wireName}' in ${JSON.stringify(loaded.fields)} — the declaration was dropped entirely`,
    );
  }
  return found;
}
```

`tests/params-brace-union-rhs-lowering.test.ts:539-547` — byte-identical
(re-read immediately before filing; no differing character):
```ts
function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField {
  const found = loaded.fields.find((f) => f.wireName === wireName);
  if (found === undefined) {
    throw new Error(
      `no params field '${wireName}' in ${JSON.stringify(loaded.fields)} — the declaration was dropped entirely`,
    );
  }
  return found;
}
```

`tests/binder-param-line-newline-normalisation.test.ts:393-401`,
`tests/params-default-string-literal-raw-newline.test.ts:402-410`,
`tests/params-inline-object-lowering.test.ts:434-442` — each re-read
immediately before filing, each byte-identical to the two excerpts above.

Exact search: `grep -rl "function fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField" tests/*.ts` → exactly these five files, no others.
`grep -n "fieldOf" tests/helpers/*.ts` → 0 hits, no helper module exports it.

## Why this is a problem
The same eight-line "find this wire name in the loaded params fields, or
throw naming what was dropped" accessor is typed out five separate times
across the params/lowering test family, including both files in this
review's scope, rather than imported once. Both in-scope files already
depend on the shared `LoadedParams` shape and `BypassParamsField` type from
`src/binder/binder-envelope`, and both already import other test-only
oracles from `tests/helpers/` (`tests/helpers/e2e-s1`,
`tests/helpers/canonical-slug-oracle`, `tests/helpers/binder-prompt-param-mirror`,
`tests/helpers/registry-oracle`) for comparable roles, so the accessor is not
withheld from `tests/helpers/` by any stated file-local-independence
rationale — no comment in either in-scope file discusses `fieldOf` at all.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export parameterised by a `LoadedParams`-shaped value and a
wire name is the natural home the five byte-identical declarations point at;
several sibling helpers in this same family (`loadCleanly`'s eventual home,
per PTQ-0212) already share the same `LoadedParams` return shape, so `fieldOf`
would sit naturally beside it.

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named
  gate-kin patterns; the cited lines are a field-lookup accessor, not a
  pinned count or inventory.
- Recording-double check: `fieldOf` records no call and backs no "never
  called" witness; it is a pure lookup-or-throw accessor over an already-loaded
  value, not a recording double.
- docs/bugs/ signature search: `grep -rl "function fieldOf" docs/bugs/*.md` →
  0 hits; neither in-scope file's own bug doc (0041, 0097) states a rationale
  for keeping this accessor file-local.
- coverage-matrix/bug-doc citation search: `grep -n "params-block-mapping-rhs-refusal\|params-brace-union-rhs-lowering" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the five identical `fieldOf` definitions could import a shared helper — so no citation is affected.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; `fieldOf` is exercised by every call site in each of the
  five files.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `fieldOf` and `fieldof` — 0 hits; PTQ-0212 (loadCleanly) and PTQ-0279
  (binderParams/parametersBlockLines) are the only prior findings touching
  this file family's shared harness, and neither cites or discusses the
  `fieldOf` accessor.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five `fieldOf(loaded: LoadedParams, wireName: string): BypassParamsField` bodies extracted and md5-hashed identical (886c794b…), each live (7/2/8/2/5 call sites), the signature grep hits exactly these five files (the two other `fieldOf`s in tests/ take Fragment/ThetaValue — different accessors), `grep fieldOf tests/helpers/` = 0, no gate-kin filename, no recording double, coverage-matrix cites none of the five, the sole docs/bugs mention (0102:899) is a quoted call in a fixed bug's narrative not a witness citation or file-local rationale, and no prior PTQ covers it (PTQ-0212 is `loadCleanly` only, PTQ-0279 is `binderParams`/`parametersBlockLines`); one imprecision for the fixer: `LoadedParams` is NOT from `src/binder/binder-envelope` but a file-local interface in each file with five differing shapes (only `BypassParamsField` is imported) — immaterial to the clone since `fieldOf` reads only `.fields`, declared `readonly BypassParamsField[]` in all five, but a shared helper must be typed on that member, not on the helpers' `LoadedParams` (tests/helpers/e2e-s1.ts:153-156, which has no `fields`) (triage: claude-fable-5-1)
