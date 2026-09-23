---
id: PTQ-1470
title: All three in-scope files reimplement the canonical registryMessageOf lookup-assert-fill loop in a local render()/msg() function instead of calling it with the fills parameter
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-empty-entry-slot-refusal.test.ts:283-294
  - tests/inline-object-keyless-entry-refusal.test.ts:227-238
  - tests/inline-object-malformed-entry-resync.test.ts:157-171
  - tests/helpers/load-row-harness.ts:61-101
sites: 3
fix_scope: cross-module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# All three in-scope files reimplement the canonical registryMessageOf lookup-assert-fill loop in a local render()/msg() function instead of calling it with the fills parameter

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry, registryPath, code, fills, options)`, which looks up a registry row's *Message* template, asserts (via `expect(...).toBeTypeOf("string")`) that the row exists, then for each `[placeholder, value]` pair in `fills` asserts the template still contains the placeholder (`toContain`) before substituting it, optionally with `replaceAll`. Each of the three in-scope files declares its own local function — `render()` in the first two, `msg()` in the third — that performs this identical lookup-assert-fill sequence itself instead of calling the exported helper with a `fills` argument. The two `render()` copies (files 1 and 2) are byte-identical to each other; the third file's `msg()` performs the same steps inline with `.replace` in place of `.replaceAll` and a shorter failure-message tail.

## Evidence
`tests/helpers/load-row-harness.ts:61-101` (the canonical, already-exported helper — the fills loop this file already packages):
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
  options: {
    readonly requireNonEmpty?: boolean;
    readonly replaceAll?: boolean;
    readonly unfilledPattern?: RegExp;
  } = {},
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeTypeOf("string");
  ...
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = options.replaceAll
      ? out.replaceAll(placeholder, value)
      : out.replace(placeholder, value);
  }
  return out;
}
```

`tests/inline-object-empty-entry-slot-refusal.test.ts:283-294` (re-read immediately before filing):
```ts
function render(exp: Exp): string {
  const template = registryMessageOf(exp.code);
  let out = template;
  for (const [slot, value] of exp.fills) {
    expect(
      template,
      `DIAG-4: the ${exp.code} row's Message must still carry the ${slot} slot this file ` +
        `renders; observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${exp.severity} ${exp.code}: ${out}`;
}
```

`tests/inline-object-keyless-entry-refusal.test.ts:227-238` (re-read immediately before filing — byte-identical to the excerpt above):
```ts
function render(exp: Exp): string {
  const template = registryMessageOf(exp.code);
  let out = template;
  for (const [slot, value] of exp.fills) {
    expect(
      template,
      `DIAG-4: the ${exp.code} row's Message must still carry the ${slot} slot this file ` +
        `renders; observed template ${JSON.stringify(template)}`,
    ).toContain(slot);
    out = out.replaceAll(slot, value);
  }
  return `${exp.severity} ${exp.code}: ${out}`;
}
```

`tests/inline-object-malformed-entry-resync.test.ts:157-171` (re-read immediately before filing — same three steps, `.replace` instead of `.replaceAll`, and imports the raw `registryMessage` directly rather than any load-row-harness export):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: docs/spec_topics/diagnostics/ must carry the Message row for ${code}`,
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
```

The two files that already import `registryMessageOrThrow` from `./helpers/load-row-harness` (files 1 and 2, each at their own top-of-file import line) do not import the sibling export `registryMessageOf` from the same module, even though that module already exports it a few lines above the export they do use.

## Why this is a problem
Three files independently carry the same lookup-assert-substitute sequence that `tests/helpers/load-row-harness.ts` already exports as `registryMessageOf`. Two of the three copies are byte-identical to each other; the third differs only in which `String.prototype` replace variant it calls and the wording of its failure message. Any future change to the fill-substitution contract (for example, switching every caller to `replaceAll` for multi-occurrence placeholders, per the b0129-style count-consequence class this file's own comments discuss) must be made in four places by hand — the canonical helper and the three local copies — rather than one, and the three copies can silently drift apart in behaviour (as file 3's `.replace` already has, versus files 1–2's `.replaceAll`) without any test failing to say so.

## Suggested direction (non-binding, optional)
The natural home for this logic already exists and is already imported by two of the three files for a sibling export from the same module — `registryMessageOf(registry, registryPath, code, fills, options)` in `tests/helpers/load-row-harness.ts`. Calling it directly with the `fills` array in hand at each of the three call sites is an observation about where the fold already lives, not a design.

## False-positive check
- Gate-pin check: none of these three files match `*gate*.test.ts` or its named kin; not applicable.
- Recording-double check: `render`/`msg` are pure string-rendering functions with no call recording; not a negative-witness double.
- docs/bugs/ signature search: `grep -rl "render(exp\|function msg(code" docs/bugs` returns no hits; this shape is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn "render(exp\|function msg(code\|registryMessageOf" docs/reference/coverage-matrix.md docs/bugs/0257-*.md docs/bugs/0244-*.md docs/bugs/0231-*.md` returns no hits naming these internal helper functions by name; the citing bug documents pin the *test files* as witnesses, not this internal rendering helper's shape, so a fold that keeps each file's own diagnostic expectations intact does not touch any pinned citation.
- Not a coverage claim: this finding is about existing test-support code duplicating an existing test-support export, not about any behaviour left unverified.

## Triage
verdict: confirmed — independently re-verified: all four excerpts reproduce at the exact cited lines (empty-entry-slot :283-294, keyless :227-238, malformed-resync :157-171, load-row-harness.ts :61-101 `registryMessageOf`); mktemp `diff` of the two sed-extracted `render()` bodies is empty (byte-identical), file 3's `msg()` is the same lookup→toBeDefined→toContain→substitute sequence with `.replace`; every copy is live (`renderAll` passed to `expectGroupShared` at :334/:276/:260, plus :922-923 in file 1); docs/bugs signature grep → 0 and coverage-matrix/bug-doc grep → 0 reproduce; no gate file, no recording double, not a coverage claim — D7 boilerplate duplication in tests/; the `replace`/`replaceAll` drift is behaviour-neutral today (no cited registry template repeats a placeholder: let-rhs/reassign-rhs/generic-arity/empty-schema-body/array-element each carry every placeholder once) so the fold is mechanical; dedupe: PTQ-1055 (fixed, 245781a6) folded the generic-argument pair and its triage note explicitly flagged inline-object-{empty-entry-slot,keyless-entry}-refusal as cohort files that "inline the fill loop into `render`" but were outside its filed sites; PTQ-1319 (fixed) covered only file 1's throw-wrapper `registryMessageOf`, PTQ-1326 only the `Exp` builders, PTQ-0867/0989 only the REGISTRY read, PTQ-1378/1404 (open) name other files — no open row tracks these three `render`/`msg` bodies; fixer note: the fold already exists one step further than the filing names — tests/helpers/registry-oracle.ts:122-129 exports `render(exp)`/`renderAll(exps)` wrapping `registryMessageOf(REGISTRY, …, exp.code, exp.fills)`, and all three files already import `REGISTRY` (files 2-3 also `type Exp`) from that module, so the fix is deleting the local `render`/`renderAll`/`msg` and widening the existing import (triage: claude-fable-5-1)
