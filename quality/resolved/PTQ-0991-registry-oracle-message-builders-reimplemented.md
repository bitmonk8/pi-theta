---
id: PTQ-0991
title: params-declared-type-in-type-layer.test.ts reimplements three registry-oracle.ts message builders instead of importing them
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-declared-type-in-type-layer.test.ts:320-323
  - tests/params-declared-type-in-type-layer.test.ts:375-385
  - tests/params-declared-type-in-type-layer.test.ts:358-372
  - tests/helpers/registry-oracle.ts:150-152
  - tests/helpers/registry-oracle.ts:155-164
  - tests/helpers/registry-oracle.ts:191-205
sites: 3
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-declared-type-in-type-layer.test.ts reimplements three registry-oracle.ts message builders instead of importing them

## Observation
`tests/params-declared-type-in-type-layer.test.ts` imports only
`interpolateStrict` from `tests/helpers/registry-oracle.ts` (line 1) and then
locally declares its own `fill()`/`registered()` wrapper plus a per-code
message-rendering function for every registered code it needs. Three of
those local functions — `integerNarrowing()`, `arrayElement()` and
`objectField()` — are structurally identical (same registered code, same
placeholder `Map`, same call shape) to three functions
`tests/helpers/registry-oracle.ts` already exports for the exact same
registered codes: `narrowingMessage()`, `arrayElementMessage()` and
`objectFieldMismatchMessage()`. No `tests/*.test.ts` file currently imports
these three canonical exports; the in-scope file redeclares equivalent
bodies locally instead.

## Evidence

`tests/params-declared-type-in-type-layer.test.ts:320-323` (re-read
immediately before filing):
```ts
/** `cannot narrow number to integer` (no placeholders). */
function integerNarrowing(): string {
  return fill(INTEGER_NARROWING, new Map());
}
```
where `INTEGER_NARROWING = "theta/parse/integer-narrowing"` (line 260) and
`fill()` (lines 246-255) is a byte-identical rebuild of
`registry-oracle.ts`'s exported `fillParseMessage()` (lines 117-127: same
`interpolateStrict` call, same two error-message templates).

`tests/helpers/registry-oracle.ts:150-152`:
```ts
export function narrowingMessage(): string {
  return fillParseMessage("theta/parse/integer-narrowing", new Map());
}
```

`tests/params-declared-type-in-type-layer.test.ts:375-385`:
```ts
/** `array element type mismatch at index <i>: expected <expected>, got <actual>` */
function arrayElement(index: number, expected: string, actual: string): string {
  return fill(
    ARRAY_ELEMENT,
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/helpers/registry-oracle.ts:155-164`:
```ts
export function arrayElementMessage(index: number, expected: string, actual: string): string {
  return fillParseMessage(
    "theta/parse/array-element-type-mismatch",
    new Map([
      ["<i>", String(index)],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```

`tests/params-declared-type-in-type-layer.test.ts:358-372`:
```ts
function objectField(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fill(
    OBJECT_FIELD,
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```
(the function's closing `}` is line 373, one line beyond this 15-line excerpt.)

`tests/helpers/registry-oracle.ts:191-205`:
```ts
export function objectFieldMismatchMessage(
  field: string,
  schema: string,
  expected: string,
  actual: string,
): string {
  return fillParseMessage(
    "theta/parse/object-field-type-mismatch",
    new Map([
      ["<field>", field],
      ["<schema>", schema],
      ["<expected>", expected],
      ["<actual>", actual],
    ]),
  );
}
```
(closing `}` at line 206, one line beyond this 15-line excerpt.)

Search performed: `grep -rln "narrowingMessage\|arrayElementMessage\|objectFieldMismatchMessage" tests/*.test.ts` → 0 hits (no test file imports or otherwise names any of the three canonical exports). `grep -n "^import" tests/params-declared-type-in-type-layer.test.ts | grep registry-oracle` → `import { interpolateStrict } from "./helpers/registry-oracle";` (only `interpolateStrict` is imported).

## Why this is a problem
`tests/helpers/registry-oracle.ts` already carries a per-code renderer for
each of these three registered codes (`theta/parse/integer-narrowing`,
`theta/parse/array-element-type-mismatch`,
`theta/parse/object-field-type-mismatch`), built on the same
`fillParseMessage`/`interpolateStrict` primitives the in-scope file's local
`fill()` rebuilds beneath its own three local renderers. The in-scope file
already imports from this exact module (`interpolateStrict`), so the three
canonical renderers were reachable at zero added import cost; instead the
file re-derives the identical parameter list, `Map` key order and call shape
for each of the three, rather than importing the ready-made equivalent.

## Suggested direction (non-binding, optional)
Importing `narrowingMessage`, `arrayElementMessage` and
`objectFieldMismatchMessage` from `tests/helpers/registry-oracle.ts` in
place of the three local functions is the substitution the identical
bodies already point at; the file's own local `fnArg`/`letRhs` functions and
`fill()` wrapper are a separate, already-tracked concern (PTQ-0967) and are
left untouched by this observation.

## False-positive check
- Gate-pin check: `tests/params-declared-type-in-type-layer.test.ts` does not
  match `*gate*.test.ts` or the named gate-kin patterns; not applicable.
- Recording-double check: none of `integerNarrowing`/`arrayElement`/
  `objectField`/`narrowingMessage`/`arrayElementMessage`/
  `objectFieldMismatchMessage` records a call or backs a "never called"
  witness; each is a pure string-rendering function consumed by an
  ordered-equality assertion, so the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rl "narrowingMessage\|arrayElementMessage\|objectFieldMismatchMessage" docs/bugs/*.md` → 0 hits; no open bug document discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-declared-type-in-type-layer" docs/reference/coverage-matrix.md` →
  0 hits. This finding proposes no merge, rename or deletion of the file or
  any `it()`/`describe()` name — only that three local renderer functions
  could import their existing canonical equivalents.
- Coverage check: the claim is entirely about three repeated
  renderer-function DEFINITIONS; every row in the file continues to render
  and assert its own diagnostics exactly as written.
- Prior-finding search: `grep -rl "fnArg\|letRhs" quality/issues
  quality/resolved quality/intake` surfaces PTQ-0967 (open, confirmed),
  which tracks byte-identical `fnArg()`/`letRhs()` redeclaration between two
  *other* files and separately notes (as an unverified wider-count) that
  `tests/params-declared-type-in-type-layer.test.ts` also carries `fnArg`/
  `letRhs` copies. This finding deliberately excludes `fnArg`/`letRhs` to
  avoid overlapping PTQ-0967's topic, and instead covers three functions
  PTQ-0967 does not mention at all (`integerNarrowing`, `arrayElement`,
  `objectField`) against three canonical exports
  (`narrowingMessage`/`arrayElementMessage`/`objectFieldMismatchMessage`)
  that PTQ-0967's own investigation did not cite as available. `grep -rl
  "narrowingMessage\|arrayElementMessage\|objectFieldMismatchMessage"
  quality/issues quality/resolved quality/intake` → 0 hits.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six excerpts reproduce verbatim (test file :320-323 / :358-373 / :375-385; registry-oracle :150-152 / :155-164 / :191-206), the bodies differ only in constant-name-vs-literal and `fill`-vs-`fillParseMessage`, and the substitution is behaviour-preserving because both readers parse the same `code-registry-parse.md` shard through the same `parseRegistry`/`registryMessage` with the same `REGISTRY_PAGE` error string (local `REGISTRY` at :217-219 vs `readRegistry(["parse"])` at registry-oracle:89; `PARSE_REGISTRY_PATH` load-row-harness:46); each local copy is live (one call site each at :843 / :903 / :920); D7 boilerplate duplication with every location under tests/, no gate/live/recording-double/red-signature carve-out and no it()/describe() change proposed; docs/bugs → 0 and coverage-matrix → 0 reproduce; TWO stated searches do NOT reproduce but neither refutes the root cause — (a) the "no tests/*.test.ts names the canonical exports" claim is false: tests/division-result-type-number.test.ts:13-14 imports all three from registry-oracle (17+ live `narrowingMessage()` call sites), which strengthens the anchor by proving the import path is already exercised, and tests/ctor-field-type-check.test.ts:220 carries a further uncited local `arrayElementMessage` copy (fold in at acceptance); (b) the quality-store grep is not 0 — resolved PTQ-0549 names these builder names, but for the division/modulo whole-harness pair, not this file; not a duplicate — PTQ-0967 tracks `fnArg`/`letRhs` only, PTQ-0972 names this file as a residual of the `RegistryRow`/`REGISTRY` read layer (not the builders), PTQ-0954 its `one`/`two` helper, and sibling intake d7-01 tracks `invokeArgMessage`; fix is a mechanical import + delete-three-functions (triage: claude-fable-5-1)
