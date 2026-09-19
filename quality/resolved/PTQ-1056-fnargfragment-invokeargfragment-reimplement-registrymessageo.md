---
id: PTQ-1056
title: fnArgFragment and invokeArgFragment each reimplement tests/helpers/load-row-harness.ts's registryMessageOf placeholder-fill loop
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:91-129
  - tests/live/b0146live-invoke-array-arg-live-cell.test.ts:94-130
  - tests/helpers/load-row-harness.ts:60-79
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# fnArgFragment and invokeArgFragment each reimplement tests/helpers/load-row-harness.ts's registryMessageOf placeholder-fill loop

## Observation
`tests/helpers/load-row-harness.ts` exports `registryMessageOf(registry,
registryPath, code, fills)`: it reads the registry row's *Message* template,
asserts it is defined (naming the registry page in the failure message),
then loops over an ordered `fills` list, asserting each placeholder is
present before substituting it. `fnArgFragment`
(`b0138live-imported-fn-arg-refusal-live-cell.test.ts`) and
`invokeArgFragment` (`b0146live-invoke-array-arg-live-cell.test.ts`) each
independently re-derive the same shape — read the template, assert it is
defined, build a placeholder→value map, substitute every placeholder with an
assertion that it exists in the template and that every supplied
substitution gets used — rather than calling the shared helper.

## Evidence

`tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts:91-129`:
```ts
function fnArgFragment(
  name: string,
  index: number,
  paramName: string,
  expected: string,
  actual: string,
): string {
  const template = registryMessage(REGISTRY, CODE) as string | undefined;
  expect(
    template,
    `${CODE} has no registry row — the code this cell asserts is not registered (DIAG-2)`,
  ).toBeTypeOf("string");
  const subs = new Map<string, string>([
    ["<name>", name],
    ["<i>", String(index)],
    ["<param>", paramName],
    ["<expected>", expected],
    ["<actual>", actual],
  ]);
  const used = new Set<string>();
  const message = (template as string).replace(/<[a-z]+>/g, (token) => {
    const value = subs.get(token);
    expect(
      value,
      `${CODE}: the Message template carries ${token}, which this cell supplies no ` +
        "substitution for — the registry row changed shape",
    ).toBeTypeOf("string");
    used.add(token);
    return value as string;
  });
  for (const token of subs.keys()) {
    expect(
      used.has(token),
      `${CODE}: this cell substitutes ${token} into the Message template, which no ` +
        "longer carries it — the registry row changed shape",
    ).toBe(true);
  }
  return `${CODE}: ${message}`;
}
```

`tests/live/b0146live-invoke-array-arg-live-cell.test.ts:94-130`
(`invokeArgFragment`) carries the same shape — read `registryMessage`,
assert it is a string, build a placeholder→value `Map`, substitute via the
same `/<[a-z]+>/g` regex with the same per-token presence assertion, and
assert every supplied substitution was used — differing only in the
parameter list (no `name` parameter) and the omission of the second, string-
wide re-scan the file's own comment explains is deliberately skipped for
this row's `<actual>` value.

`tests/helpers/load-row-harness.ts:60-79` (`registryMessageOf`, the shared
helper both functions re-derive the shape of):
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
```

Exact search: `grep -n "^function fnArgFragment\|^function invokeArgFragment" tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts tests/live/b0146live-invoke-array-arg-live-cell.test.ts` returns exactly one hit per file; neither file imports `registryMessageOf` from `tests/helpers/load-row-harness.ts` (`grep -n "registryMessageOf" tests/live/b0138live-imported-fn-arg-refusal-live-cell.test.ts tests/live/b0146live-invoke-array-arg-live-cell.test.ts` → 0 hits in both).

## Why this is a problem
Both functions answer the same question — "fill this registry row's Message
template with these named values, asserting the template still carries every
placeholder the caller expects" — through independently maintained
substitution loops rather than the one already-exported helper that performs
the read-assert-substitute sequence. A change to how missing placeholders
are reported (the wording, or which assertion fires first) would need to be
applied at both hand-rolled copies as well as at the canonical helper for
the three to stay in sync.

## Suggested direction (non-binding, optional)
Both functions' bodies could delegate to `registryMessageOf(REGISTRY,
"docs/spec_topics/diagnostics/code-registry-parse.md", CODE, fills)`,
passing an ordered `fills` array built from each function's own named
parameters, in place of the hand-rolled `Map`/regex-replace loop.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns; these functions build assertion-fragment strings, not
  pinned-count gates.
- Recording-double check: not applicable — neither function is a recording
  double backing a MUST-NOT-call witness; both are message-template
  builders.
- docs/bugs/ signature search: `grep -rl "fnArgFragment\|invokeArgFragment"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red names either
  function.
- coverage-matrix/bug-doc citation search: `grep -n "b0138live\|b0146live"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that both
  functions' internal substitution logic duplicates an already-exported
  helper's shape.
- Coverage drift: this finding does not claim any behaviour is untested;
  both fragment builders continue to produce the same registry-sourced
  fragment text their callers assert against, whichever implementation
  produces it.
- Distinctness from d7-03: this finding's root cause (the placeholder-fill
  substitution loop) is distinct from `qw20260918202006-d7-03`'s root cause
  (the single-shard registry-page file read that feeds `REGISTRY`); the two
  reuse the same two host files but duplicate two different pieces of
  `tests/helpers/` machinery, so they are filed separately per "one root
  cause per finding."

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at b0138live:91-129 and b0146live:94-130, mktemp sed-extract + diff shows the two bodies byte-identical except the function name and the `["<name>", name]` Map row (the candidate's claimed "second, string-wide re-scan" difference does not exist — `not.toMatch` greps to 0 in both files), both copies are live (call sites :277 and :274/:291), neither file imports any tests/helpers registry module, and no open/resolved PTQ names these functions or files (PTQ-0983/0967/0991 cover other hosts; sibling intake d7-03 is the REGISTRY page-read, a distinct root cause) — D7 boilerplate-duplication in tests/ with no carve-out engaged; CORRECTION for the fixer: the canonical is NOT load-row-harness `registryMessageOf` (whose ordered `toContain`+`replace` loop lacks the template-derived unsupplied-placeholder check both copies carry, so the filed direction would silently drop an assertion) but tests/helpers/registry-oracle.ts `interpolateStrict` :65-86 / `fillParseMessage` :162-172, whose regex+`used`-set loop diffs against the live copies only on expect→throw, and `fnArgMessage` :175-192 already carries fnArgFragment's exact signature and Map for the same code — `fnArgFragment` ≡ `${CODE}: ${fnArgMessage(...)}`, `invokeArgFragment` ≡ `${CODE}: ${fillParseMessage(CODE, subs)}`, behaviour-preserving since both read the same code-registry-parse.md through the same parseRegistry (triage: claude-fable-5-1)
