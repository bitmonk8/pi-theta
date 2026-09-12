---
id: PTQ-0256
title: b0406 and b0408 each redefine an identical errorCodes helper already composable from e2e-s1.ts's errors() export
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0406-object-typed-params-misclassified-string.test.ts:33-36
  - tests/b0408-scalar-union-params-render-json-row.test.ts:22-25
  - tests/b0427-alias-schema-param-permissive-string-terminal.test.ts:41-44
  - tests/b0441-inline-object-embedded-schema-refs-not-descended.test.ts:26-29
  - tests/b0442-alias-blind-outbound-sidecar-construction.test.ts:29-32
  - tests/b0443-union-alias-spellings-drop-arm-translation.test.ts:28-31
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0406 and b0408 each redefine an identical errorCodes helper already composable from e2e-s1.ts's errors() export

## Observation
tests/b0406-object-typed-params-misclassified-string.test.ts and
tests/b0408-scalar-union-params-render-json-row.test.ts each declare, at
module scope, a byte-identical three-line `errorCodes` function that filters a
parsed document's diagnostics to error severity and maps the result to
`.code`. Both files import `parseDoc` from `tests/helpers/e2e-s1.ts` on the
same line they could have imported this capability from, and that module
already exports `errors(diags)` — the identical filter, one
`.map((d) => d.code)` short of what each file re-derives locally. The same
function, byte-for-byte, recurs in four further files outside this wave's
scope (b0427, b0441, b0442, b0443).

## Evidence
tests/b0406-object-typed-params-misclassified-string.test.ts:33-36:
```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
```

tests/b0408-scalar-union-params-render-json-row.test.ts:22-25 — byte-identical:
```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
```

Both files' own import lines already reach the module hosting the near-match
export — tests/b0406-object-typed-params-misclassified-string.test.ts:2:
```ts
import { parseDoc, parseDeps } from "./helpers/e2e-s1";
```
tests/b0408-scalar-union-params-render-json-row.test.ts:2:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```

tests/helpers/e2e-s1.ts:80-83 — the already-exported, near-identical filter
neither file composes from:
```ts
/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
}
```

Exact search
`grep -rn "function errorCodes(doc: ReturnType<typeof parseDoc>): string\[\] {" tests/*.test.ts`
→ 6 hits, every body byte-identical:
- tests/b0406-object-typed-params-misclassified-string.test.ts:34
- tests/b0408-scalar-union-params-render-json-row.test.ts:23
- tests/b0427-alias-schema-param-permissive-string-terminal.test.ts:42
- tests/b0441-inline-object-embedded-schema-refs-not-descended.test.ts:27
- tests/b0442-alias-blind-outbound-sidecar-construction.test.ts:30
- tests/b0443-union-alias-spellings-drop-arm-translation.test.ts:29

tests/b0441-inline-object-embedded-schema-refs-not-descended.test.ts:26-29 —
one of the four corroborating out-of-scope instances, byte-identical again:
```ts
/** Error-severity diagnostic codes from a parsed doc, in source order. */
function errorCodes(doc: ReturnType<typeof parseDoc>): string[] {
  return doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
```

## Why this is a problem
This is the "Boilerplate duplication" class: the same three-line helper —
filter to error severity, map to `.code` — is retyped at module scope in six
files rather than composed once from the sibling `errors()` export both
in-scope files already import alongside (`parseDoc`, on the identical import
line). `tests/helpers/e2e-s1.ts` predates both b0406 and b0408 by roughly two
months (added 2026-07-13; b0406/b0408 added 2026-09-04, per `git log --follow`
on each path), so the export was available when each file was authored.
`errorCodes` is not a new capability: it is `errors(doc.diagnostics).map((d)
=> d.code)` written out by hand in six places instead of composed from what
each file's own import line already reaches.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts `errors`, `hasCode`, `findCode`, and
`codes` as the shared diagnostic-reading surface both in-scope files import
from; that module is the home this duplication already points at, not a
design for the extraction.

## False-positive check
- Gate-pin check: neither
  tests/b0406-object-typed-params-misclassified-string.test.ts nor
  tests/b0408-scalar-union-params-render-json-row.test.ts matches
  `*gate*.test.ts` or the named kin, and this finding is about a helper
  function's definition site, not a pinned count or inventory assertion.
- Recording-double check: `errorCodes` reads an already-produced
  `diagnostics` array and returns a derived list; it records no calls and
  backs no "never called" witness, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search:
  docs/bugs/0406-object-typed-params-misclassified-string.md Status is "fixed
  (0.404.0)"; docs/bugs/0408-scalar-union-params-render-json-row.md Status is
  "fixed (0.406.0)". `npx vitest run
  tests/b0406-object-typed-params-misclassified-string.test.ts
  tests/b0408-scalar-union-params-render-json-row.test.ts` passes both files
  (16/16) at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0406-object-typed-params-misclassified-string\|b0408-scalar-union-params-render-json-row"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` inside
  them — only that the internal `errorCodes` helper could be composed from an
  existing sibling export — so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; both cited in-scope files are fully
  exercised and passing at HEAD (confirmed above).
- Prior-finding overlap check: `grep -rn "errorCodes"
  quality/resolved/*.md quality/intake/*.md` → the only hit is
  `errorCodesAt` inside `qw20260912112713-d7-02-b0320-diagnostic-harness-duplicated.md`,
  a differently-named function belonging to a disjoint `LoadPass`-driving
  harness family (b0320/b0275); no existing filing or resolved ticket covers
  this `errorCodes` definition.
- Established-convention check (this repository's own precedent for
  rejecting harness-duplication claims where a widely repeated convention
  already exists): this same scope also contains `parseDeps` (78 files,
  `grep -rl "function parseDeps" tests/*.test.ts`), `rootDouble`/`producer`
  (89-95 files per the already-resolved PTQ-0209), `render(value: ThetaValue |
  undefined)` (19 files), the `InstantSettleSession` pure-host double (14
  files, each self-documented "(b0394 shape, verbatim)" or similar), and the
  `fakeThetaLibFs`/`w7FakeFs` in-memory `.thetalib` filesystem double (at
  least 4 files, self-documented "(the b0303 double)") — all reproduced during
  this review but left unfiled because their scale and self-aware "mirrors
  <sibling>" comments match this repository's own prior "pervasive, established
  convention" rejections. `errorCodes` recurs in only 6 files, none carrying
  such a comment, and reads as a narrower, undocumented oversight rather than
  a deliberate suite-wide policy.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all 6 byte-identical `errorCodes` bodies verified at cited lines (grep reproduces the 6 hits exactly), both in-scope files already import from tests/helpers/e2e-s1.ts (added 2026-07-13, predating b0406/b0408 by ~2 months per git log) whose exported `errors()` composes to the identical behavior (`errors(doc.diagnostics).map((d) => d.code)`, type-correct against `ThetaDocument.diagnostics: readonly Diagnostic[]`) and is already practiced elsewhere in the suite (ctor-field-type-check.test.ts imports and composes `codes(errors(...))` from the same module); no gate test, no open docs/bugs red, no coverage-matrix citation, no existing PTQ ticket covers this helper, and the scale (6 sites, no "mirrors" comment) is verifiably far short of this repo's established multi-dozen-file conventions (triage: claude-opus-5)
