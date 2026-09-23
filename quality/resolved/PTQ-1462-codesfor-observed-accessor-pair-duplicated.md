---
id: PTQ-1462
title: codesFor/observed read-accessor pair over `outcome` is redeclared verbatim as b0248CodesFor/b0248Observed over `b0248Outcome` in the same file
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:550-552
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:559-568
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:1087-1089
  - tests/tools-entry-grammar-derivations-lockstep.test.ts:1097-1105
sites: 4
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# codesFor/observed read-accessor pair over `outcome` is redeclared verbatim as b0248CodesFor/b0248Observed over `b0248Outcome` in the same file

## Observation
`tests/tools-entry-grammar-derivations-lockstep.test.ts` runs two production
loads into two module-level `LoadOutcome` variables, `outcome` (group A/B/C)
and `b0248Outcome` (group D), both produced by the same local
`runProductionLoad` helper (line 499) and sharing the same `LoadOutcome` shape
(line 452). For each outcome variable the file then declares its own pair of
read accessors — `codesFor`/`observed` for `outcome`, and
`b0248CodesFor`/`b0248Observed` for `b0248Outcome` — whose bodies are
identical except for which outcome variable they close over.

## Evidence
`tests/tools-entry-grammar-derivations-lockstep.test.ts:550-552`:
```ts
function codesFor(stem: string): readonly string[] {
  return outcome.codes.get(stem) ?? [];
}
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:1087-1089`:
```ts
function b0248CodesFor(stem: string): readonly string[] {
  return b0248Outcome.codes.get(stem) ?? [];
}
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:559-568`:
```ts
function observed(stem?: string): string {
  const mirror =
    stem === undefined
      ? outcome.raw
      : outcome.raw.filter((l) => l.includes(`${stem}.theta`));
  return (
    ` Registered: ${JSON.stringify(outcome.registered)}` +
    ` Mirror${stem === undefined ? "" : `(${stem})`}: ${JSON.stringify(mirror)}`
  );
}
```

`tests/tools-entry-grammar-derivations-lockstep.test.ts:1097-1105`:
```ts
function b0248Observed(stem?: string): string {
  const mirror =
    stem === undefined
      ? b0248Outcome.raw
      : b0248Outcome.raw.filter((l) => l.includes(`${stem}.theta`));
  return (
    ` Registered: ${JSON.stringify(b0248Outcome.registered)}` +
    ` Mirror${stem === undefined ? "" : `(${stem})`}: ${JSON.stringify(mirror)}`
  );
}
```

Exact search: `grep -n "^function \(codesFor\|observed\|b0248CodesFor\|b0248Observed\)" tests/tools-entry-grammar-derivations-lockstep.test.ts` → the four declarations cited above, no others.

## Why this is a problem
Both accessor pairs read the same `LoadOutcome` shape (`codes`/`raw`/`registered`,
declared once at line 452) through the same field names, differing only in
which module-level variable each closure captures. The bodies are line-for-line
identical apart from the `outcome`/`b0248Outcome` token, which is the shape a
parameterised helper (`codesFor(outcome, stem)` / `observed(outcome, stem)`)
would replace with one declaration each — the file already has the shared
`LoadOutcome` type and the shared `runProductionLoad` producer to hang such a
helper off.

## Suggested direction (non-binding, optional)
A single `codesFor(outcome: LoadOutcome, stem: string)` and
`observed(outcome: LoadOutcome, stem?: string)`, called with `outcome` or
`b0248Outcome` at each existing call site, would remove the second pair
without touching either group's assertions.

## False-positive check
- Gate-pin check: file name matches no `*gate*.test.ts` shape; not a census/pin
  gate.
- Recording-double check: neither accessor is a MUST-NOT witness double; both
  are plain map/array reads with no call-recording semantics.
- docs/bugs/ signature search: `grep -rn "codesFor\|b0248CodesFor\|b0248Observed" docs/bugs/` → 0 hits; not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "tools-entry-grammar-derivations-lockstep" docs/reference/coverage-matrix.md` → 0 hits. `grep -rln "tools-entry-grammar-derivations-lockstep" docs/bugs/` → matches 0106 and 0248's own bug docs, which cite the FILE as a witness, not these two function names or any `it()`/`describe()` title; this finding proposes no merge, rename or deletion of the file or any test cell.
- Dedupe check: `grep -rl "b0248Observed\|function observed" quality/issues/*.md quality/intake/*.md` found PTQ-1360, which covers a different, larger multi-file `outcomeOf`/`observed`/beforeAll/afterAll harness block duplicated ACROSS `tests/tools-field-shape-refusal.test.ts` and `tests/tools-field-zero-entry-scalar-refusal.test.ts` — neither file in scope here, and that finding's cited bodies (a `Map<string, LoadOutcome>` keyed by row, one `beforeAll` per file) are structurally different from this file's two independently-named single-outcome accessor pairs; no overlap. `grep -rl "grammar-derivations-lockstep" quality/issues/*.md` found PTQ-1358 (the `theta()` line-joiner duplication, a different function) and PTQ-1392 (the `loadRegistry`/`readRegistry` duplication, a different function); neither covers `codesFor`/`observed`.
- Coverage drift check: this finding is about the shape of existing accessor code, not about a missing test or an untested path.

## Triage
verdict: confirmed — all four excerpts reproduce at the cited lines (codesFor 550-552, observed 559-569, b0248CodesFor 1087-1089, b0248Observed 1097-1106; one-line drift on the closing braces only) and a sed-normalised diff of the two pairs is empty apart from the `outcome`/`b0248Outcome` token, both reading the single `LoadOutcome` interface at 452; D7 boilerplate-duplication class, tests/-only, not a gate/pin file, no docs/bugs or coverage-matrix citation of these helpers; PTQ-1358 (theta() joiner, other files) and PTQ-1392 (loadRegistry at 112-123/1108-1116) track different functions, so not a duplicate (triage: claude-fable-5-1)
