---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: live-production-acceptance.test.ts reimplements the guarded template-substitution idiom of tests/helpers/load-row-harness.ts's registryMessageOf in ~24 local Fragment functions
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/live-production-acceptance.test.ts:1017-1034
  - tests/live/live-production-acceptance.test.ts:2980-3009
  - tests/live/live-production-acceptance.test.ts:3422-3439
  - tests/live/live-production-acceptance.test.ts:8325-8342
  - tests/helpers/load-row-harness.ts:62-91
sites: 24
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# live-production-acceptance.test.ts reimplements the guarded template-substitution idiom of tests/helpers/load-row-harness.ts's registryMessageOf in ~24 local Fragment functions

## Observation
This file declares 31 module-scope `function ...Fragment(...)` helpers (one
per diagnostic code under test), each of which: reads a registry-row
`Message` template via `registryMessage(REGISTRY, CODE)`, asserts the
template `toBeTypeOf("string")` (a definedness guard against a moved/removed
row), substitutes named placeholders via one or more `.replaceAll(...)`
calls, asserts the result `not.toMatch(/<[a-z]+>/)` (a staleness guard
against a template that grew a placeholder the fragment does not fill), and
returns `${CODE}: ${message}`. At least 24 of the 31 use this exact
guard-then-return shape (`grep -n "not.toMatch(/<" tests/live/live-production-acceptance.test.ts`
→ 24 hits). `tests/helpers/load-row-harness.ts` already exports a generic
version of this same guarded-substitution idiom — `registryMessageOf(registry,
registryPath, code, fills)` (asserts definedness, then for each `[placeholder,
value]` fill asserts the placeholder is present before substituting) and
`registryLineOf(...)` (renders the same `<code>: <message>`-shaped line) — but
this file never imports either.

## Evidence
Exact search: `grep -n "^function .*Fragment" tests/live/live-production-acceptance.test.ts` → 31 hits; `grep -n "not.toMatch(/<" tests/live/live-production-acceptance.test.ts` → 24 hits (the subset sharing this exact guard).

`tests/live/live-production-acceptance.test.ts:1017-1034`:
```ts
function invokePathEscapeFragment(path: string): string {
  const template = registryMessage(
    INVOKE_PATH_ESCAPE_REGISTRY,
    INVOKE_PATH_ESCAPE_CODE,
  ) as string | undefined;
  expect(
    template,
    `${INVOKE_PATH_ESCAPE_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string).replaceAll("<path>", path);
  expect(
    message,
    `${INVOKE_PATH_ESCAPE_CODE}: an unsubstituted <…> placeholder remains — ` +
      "the registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${INVOKE_PATH_ESCAPE_CODE}: ${message}`;
}
```

`tests/live/live-production-acceptance.test.ts:2980-3009` (`fnArgTypeMismatchFragment`, five parameters, same shape):
```ts
function fnArgTypeMismatchFragment(
  fnName: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(
    FN_ARG_TYPE_MISMATCH_REGISTRY,
    FN_ARG_TYPE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${FN_ARG_TYPE_MISMATCH_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<name>", fnName)
```

`tests/live/live-production-acceptance.test.ts:3422-3439` (`bindingCaseMismatchFragment`, zero parameters, same shape):
```ts
function bindingCaseMismatchFragment(): string {
  const template = registryMessage(
    BINDING_CASE_MISMATCH_REGISTRY,
    BINDING_CASE_MISMATCH_CODE,
  ) as string | undefined;
  expect(
    template,
    `${BINDING_CASE_MISMATCH_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = template as string;
  expect(
    message,
    `${BINDING_CASE_MISMATCH_CODE}: the registry row's Message template grew ` +
      "an unsubstituted <…> placeholder this reader does not fill — the row " +
      "changed shape",
  ).not.toMatch(/<[a-z]+>/);
  return `${BINDING_CASE_MISMATCH_CODE}: ${message}`;
}
```

`tests/live/live-production-acceptance.test.ts:8325-8342` (`unknownVariantFragment`, two placeholders, same shape):
```ts
function unknownVariantFragment(variant: string, enumName: string): string {
  const template = registryMessage(
    UNKNOWN_VARIANT_REGISTRY,
    UNKNOWN_VARIANT_CODE,
  ) as string | undefined;
  expect(
    template,
    `${UNKNOWN_VARIANT_CODE} has no registry row — the code this cell ` +
      "asserts is not registered (DIAG-2)",
  ).toBeTypeOf("string");
  const message = (template as string)
    .replaceAll("<variant>", variant)
    .replaceAll("<enum>", enumName);
  expect(
    message,
    `${UNKNOWN_VARIANT_CODE}: an unsubstituted <…> placeholder remains — the ` +
      "registry row's Message template changed shape and this cell's " +
      "substitution is stale",
  ).not.toMatch(/<[a-z]+>/);
  return `${UNKNOWN_VARIANT_CODE}: ${message}`;
}
```

`tests/helpers/load-row-harness.ts:62-91` — the exported generic version of
this same idiom, never imported by the in-scope file:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}

/** One rendered diagnostic line, `<severity> <code>: <message>` — the bug documents' own rendering. */
export function registryLineOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  return `error ${code}: ${registryMessageOf(registry, registryPath, code, fills)}`;
}
```

## Why this is a problem
Four representative sites above — with zero, one, two, and five placeholder
parameters respectively — reproduce the identical three-step shape (a
definedness guard on the raw template, one or more placeholder
substitutions, a staleness guard on the result, then a `${CODE}: ${message}`
return) independently, each under its own function name and its own
hand-written guard message text. `tests/helpers/load-row-harness.ts` already
generalises this exact shape as `registryMessageOf`/`registryLineOf`,
parameterised by a `fills` list precisely so a varying number of named
placeholders does not require a new bespoke function each time — but this
file's 24 guard-shaped `Fragment` functions (of 31 total) never draw on it.

## Suggested direction (non-binding, optional)
`tests/helpers/load-row-harness.ts`'s `registryMessageOf`/`registryLineOf`
already generalise the guarded-substitution-and-render shape these 24
functions each re-derive under a bespoke name; each could render its fragment
by calling the shared function with its own `[placeholder, value]` fills
instead.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of
  the named gate kinds; not a census/pin gate.
- Recording-double check: these functions render a template string; none
  records a call or backs a "never called" witness, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "registryMessageOf\|load-row-harness"
  docs/bugs/*.md` → 0 hits; no open bug documents a rationale for this file's
  bespoke per-code renderers instead of the shared parameterised one.
- coverage-matrix/bug-doc citation search: `grep -n "live-production-acceptance"
  docs/reference/coverage-matrix.md` → 0 hits. Bug documents cite this test
  file as their live verification location, but none pins any of the 31
  `Fragment` function bodies, and this finding proposes no change to any
  `it()`/`describe()` name, count, or assertion — only that the renderer
  functions' own bodies could draw on the already-existing shared one — so
  the citation carve-out does not bind.
- Coverage check: the claim is about a repeated helper-function
  IMPLEMENTATION reinventing an existing parameterised helper, not a missing
  test path; all 31 sites are already exercised by the tests in this file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — the intra-file boilerplate is real and re-verified (all four excerpts match at the cited lines; `not.toMatch(/<` → 24 hits, `^function .*Fragment` → 32 not 31; 0 imports of load-row-harness; no template among the 28 codes repeats a placeholder so replace/replaceAll is equivalent today), but the named shared facility is not a drop-in and the filing did not account for the gaps: `registryLineOf` renders `error <code>: <message>` (harness:85-91), not the severity-less `<code>: <message>` these fragments substring-match against system-note content (:1137-1144); `registryMessageOf` guards placeholder presence-before-fill and carries no leftover-`<[a-z]+>` guard (0 hits in tests/helpers/), which all 24 fragments have and 31 docstrings call a deliberate drift guard against a row that grows a placeholder — a mechanical swap silently drops it; and the harness header pins "TIER: unit, offline … the same tier as every file that imports this module", which a tests/live importer falsifies — so extend-the-harness vs registry-oracle.ts home vs file-local generic renderer is a design ruling for a human; not a duplicate (PTQ-0409 covers b0046; sibling intake d7-99-01 covers the registry read, not the renderer) (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: all four excerpts match at the cited lines, `not.toMatch(/<` → 24, `^function .*Fragment` → 32 (filing says 31), 0 load-row-harness imports, docs/bugs and coverage-matrix searches reproduce at 0, and the 24 near-identical guard→substitute→guard→`${CODE}: ${message}` renderers are real D7 boilerplate in tests/ with no gate/recording-double/red-test carve-out; but the named facility is not a drop-in and the filing did not account for it — `registryLineOf` emits `error <code>: <message>` (harness:85-91) while these fragments substring-match severity-less `<code>: <message>` against system-note text (:1137-1144), `registryMessageOf` guards placeholder presence only and has no leftover-`<[a-z]+>` drift guard (0 hits in tests/helpers/) that all 24 fragments deliberately carry, and the harness header pins a unit/offline tier with 0 tests/live importers today (tests/live/harness.ts has no registry-message helper either) — so whether to extend the harness, add a tests/live-side generic renderer, or keep per-code renderers is a human design ruling; not a duplicate (PTQ-0618 and PTQ-0765 cover fragment helpers in other live cells, not this file) (triage: claude-fable-5-1)
