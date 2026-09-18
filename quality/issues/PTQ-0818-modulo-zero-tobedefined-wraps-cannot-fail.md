---
id: PTQ-0818
title: Seven PRECONDITION `.toBeDefined()` wraps around argRange/letRange/objectFieldRange/letInitRange in modulo-zero-result-type-number.test.ts cannot register a failure distinct from the wrapped helper's own throw
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/modulo-zero-result-type-number.test.ts:584-586
  - tests/modulo-zero-result-type-number.test.ts:588-590
  - tests/modulo-zero-result-type-number.test.ts:593-604
  - tests/modulo-zero-result-type-number.test.ts:608-614
  - tests/modulo-zero-result-type-number.test.ts:1049-1052
  - tests/modulo-zero-result-type-number.test.ts:1077-1080
  - tests/modulo-zero-result-type-number.test.ts:1171-1174
  - tests/modulo-zero-result-type-number.test.ts:1393-1396
  - tests/modulo-zero-result-type-number.test.ts:1448-1451
  - tests/modulo-zero-result-type-number.test.ts:1480-1483
  - tests/modulo-zero-result-type-number.test.ts:1507-1510
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Seven PRECONDITION `.toBeDefined()` wraps around argRange/letRange/objectFieldRange/letInitRange in modulo-zero-result-type-number.test.ts cannot register a failure distinct from the wrapped helper's own throw

## Observation
`tests/modulo-zero-result-type-number.test.ts` declares four anchor helpers —
`argRange`, `letRange`, `letInitRange`, `objectFieldRange` — each of which
already runs its own `expect(..., "PRECONDITION: ...").toHaveLength(1)` (or,
inside `letInitRange`, an additional internal `.toBeDefined()` on the
genuinely-optional `init` field) before returning a `SourceRange` value whose
declared return type is non-optional. At seven call sites, the test body
wraps a fresh call to one of these helpers in a second, outer
`expect(helperCall(...), "PRECONDITION (<cell>): ...").toBeDefined()`. Because
each helper throws (via its own internal `expect`) before it could ever
return `undefined`, the outer wrap can never itself distinguish an anchor
found from an anchor missing.

## Evidence

`tests/modulo-zero-result-type-number.test.ts:584-590` (`argRange`/`letRange`,
thin wrappers over the shared, throw-or-return-defined `e2e-s1.ts` helpers):
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  return sharedArgRange(doc, callee, index, (doc) => anchorsOf(doc).calls, render);
}

function letRange(doc: ThetaDocument, name: string): SourceRange {
  return sharedLetRange(doc, name, (doc) => anchorsOf(doc).lets, render);
}
```
`sharedArgRange`/`sharedLetRange` (`tests/helpers/e2e-s1.ts:286-319`) each run
`expect(..., "PRECONDITION: ...").toHaveLength(1)` (and, for `argRange`, a
second `.toBeGreaterThan(index)`) and only then return `args[index]!` /
`hits[0]!.range` — both required, non-optional `SourceRange` fields — so
either call throws first or returns a defined value; there is no third path.

`tests/modulo-zero-result-type-number.test.ts:593-614` (`letInitRange`,
`objectFieldRange`, same throw-before-return contract, declared locally):
```ts
function letInitRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const init = hits[0]!.init;
  expect(
    init,
    `PRECONDITION: \`let ${name}\` must carry an initialiser. Diagnostics: ${render(doc)}`,
  ).toBeDefined();
  return init as SourceRange;
}

function objectFieldRange(doc: ThetaDocument, field: string): SourceRange {
  const hits = anchorsOf(doc).objectFields.filter((f) => f.name === field);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one constructor field '${field}'; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.value;
}
```
`letInitRange`'s own internal `.toBeDefined()` on `init` (a field that is
genuinely `SourceRange | undefined` on the AST) is the one falsifiable check
in this family; once it passes, `init as SourceRange` is proven defined and
the function returns it. `objectFieldRange` returns `hits[0]!.value`, a
required `Expr.range`-derived field, never optional once the length check
passes.

The seven call sites that re-wrap one of these helpers in an outer
`.toBeDefined()`:

`tests/modulo-zero-result-type-number.test.ts:1049-1052` (b4/b5):
```ts
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1077-1080` (b7/b8/b9/b11):
```ts
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1171-1174` (a4/a7):
```ts
      expect(
        argRange(doc, "g", 0),
        `PRECONDITION (${cell}): the argument node must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1393-1396` (E1c):
```ts
    expect(
      letRange(control, "s"),
      "PRECONDITION (E1c): the `let s` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1448-1451` (E3c):
```ts
    expect(
      objectFieldRange(control, "s"),
      "PRECONDITION (E3c): the constructor field 's' must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1480-1483` (E4c):
```ts
    expect(
      letInitRange(control, "xs"),
      "PRECONDITION (E4c): the `let xs` initialiser must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

`tests/modulo-zero-result-type-number.test.ts:1507-1510` (E5c):
```ts
    expect(
      letRange(control, "b"),
      "PRECONDITION (E5c): the `let b` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

Exact search: `grep -n "toBeDefined()" tests/modulo-zero-result-type-number.test.ts`
returns 8 hits total; one (line 603, inside `letInitRange` itself, over the
genuinely-optional `init` field) is the real, falsifiable check; the other
seven, listed above, each wrap one of the four helpers a second time at a
call site.

## Why this is a problem
Take `expect(letRange(control, "b"), "PRECONDITION (E5c): ...").toBeDefined()`
(the representative case) mechanically: evaluating `letRange(control, "b")`
first runs `sharedLetRange`'s own `expect(hits, "PRECONDITION: ...").toHaveLength(1)`.
If that internal check fails, it throws immediately with its own message —
vitest never reaches the outer `.toBeDefined()` call at all, so that
assertion did not register a failure; the test failed on the helper's own
thrown message instead. If the internal check passes, `sharedLetRange`
returns `hits[0]!.range`, a required, non-optional `Stmt.range` field — never
`undefined`. There is no code path on which `letRange` returns `undefined`:
it always either throws first (with its own PRECONDITION message) or returns
a defined `SourceRange`. The outer `.toBeDefined()` therefore has no
observable outcome distinct from the wrapped helper's own internal check; it
is unconditionally true whenever execution reaches it, and it is never
reached on the failure path it purports to guard. The same argument applies
verbatim to `argRange` (proven by the required `Expr.range` collected into
`args`), `objectFieldRange` (proven by the required `Expr.range` on a
constructor field's value) and `letInitRange` (proven by its own internal,
already-falsifiable `.toBeDefined()` on `init`). This is the identical class
already found and fixed in this file's own sibling,
`tests/division-result-type-number.test.ts` (resolved PTQ-0242, whose fix
replaced each such outer wrap with `expect(() => helperCall(...)).not.toThrow()`
around a closure — a check that genuinely differs in observable outcome from
"the call already ran and returned"), but the fix was never carried over to
this file's own byte-for-byte copy of the same seven-site pattern.

## Suggested direction (non-binding, optional)
`tests/division-result-type-number.test.ts` already carries the fix for this
exact class at the same seven cell shapes (`.not.toThrow()` around a wrapped
closure, evaluated before the anchor's own value is read) — the direction
this file's un-migrated copy already has a landed precedent for.

## False-positive check
- Gate-pin check: `tests/modulo-zero-result-type-number.test.ts` does not
  match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory assertion.
- Recording-double check: `argRange`/`letRange`/`objectFieldRange`/
  `letInitRange` all read `SourceRange` fields off a real, freshly-parsed
  `ThetaDocument`'s AST, not a recording double's captured call log; no
  MUST-NOT-called negative witness is at stake.
- docs/bugs/ signature search: `grep -n "toBeDefined\|argRange\|letRange"
  docs/bugs/0152-modulo-zero-result-type-not-number.md` → 0 hits; no open bug
  document defends this pattern as a documented correct-reason red, and
  `npx vitest run tests/modulo-zero-result-type-number.test.ts` reproduces
  42/42 passing at HEAD (reverified during this review).
- coverage-matrix/bug-doc citation search: `grep -n
  "modulo-zero-result-type-number" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any test or
  `it()`/`describe()` cell, only that seven specific outer assertions cannot
  register a failure distinct from the helper they wrap; no cited witness
  cell is disturbed.
- Coverage check: the claim is confined to what these seven existing
  assertions can and cannot register as a failure; it does not allege a
  missing test path, and the load-bearing checks these sites duplicate (each
  helper's own internal `expect`) remain intact.
- Prior-finding overlap check: resolved `PTQ-0242` targets the byte-identical
  pattern (same four helper names, same `PRECONDITION (<cell>): ... reachable,
  or the absence below measures nothing` message shape, same eight/seven-site
  count) but is scoped entirely to `tests/division-result-type-number.test.ts`
  — its own Evidence section cites only that file's line numbers, and its fix
  (confirmed at `tests/division-result-type-number.test.ts:1048,1094,1104,
  1217,1479,1504,1531,1567`, each now `.not.toThrow()`) was never applied to
  `tests/modulo-zero-result-type-number.test.ts`, whose own seven sites still
  read `.toBeDefined()` at HEAD. Resolved `PTQ-0426` (the argRange/letRange
  *definition*-duplication finding, triaged as confirmed and explicitly
  "not a duplicate of PTQ-0242 (same helpers, cannot-fail class)") targets the
  helper bodies themselves, not these seven outer call-site wraps; its own
  Evidence section does not cite any of the seven lines cited here.
  `quality/issues/PTQ-0549-...-harness-duplicated.md`'s false-positive check
  independently re-verified that PTQ-0242's fix landed only in
  `tests/division-result-type-number.test.ts` (now `.not.toThrow()`) and did
  not check `tests/modulo-zero-result-type-number.test.ts`'s own copy, which
  this finding closes.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all 11 cited excerpts reproduce verbatim at the cited lines; `grep -n "toBeDefined()"` → 8 hits with only :603 (letInitRange's own check over `init`, genuinely `SourceRange | undefined` via `s.init?.range` from `init: Expr | null`) falsifiable; the seven outer wraps at :1052/:1080/:1174/:1396/:1451/:1483/:1510 each call a helper that either throws on its own internal `expect(...).toHaveLength(1)` (+ `.toBeGreaterThan(index)` / `.toBeDefined()`) or returns a value read off the required `NodeBase.range` field (src/parser/theta-document.ts:144 → `hits[0]!.range`, `args[index]!`, `f.value.range`, post-check `init`), so no path returns `undefined` and the wrap registers nothing the helper did not — D7 assertion-cannot-fail class, all sites under tests/, not a gate file, no recording double, docs/bugs/0152 and coverage-matrix greps → 0, 42/42 green (not a documented red), no cell merge/rename/delete; not a duplicate: resolved PTQ-0242 cites only tests/division-result-type-number.test.ts (now `.not.toThrow()` at :1048/:1094/:1104/:1217/:1479/:1504/:1531/:1567; its triage note says no PTQ tracked this file), resolved PTQ-0426 targets the helper definitions, open PTQ-0549 targets the harness-body duplication and none of its cited ranges cover these seven call-site wraps (triage: claude-fable-5-1)
