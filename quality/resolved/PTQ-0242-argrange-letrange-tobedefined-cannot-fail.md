---
id: PTQ-0242
title: Eight PRECONDITION `.toBeDefined()` checks wrap `argRange`/`letRange`/`objectFieldRange`/`letInitRange` calls that already throw-or-return-defined, so the wrap cannot fail
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/division-result-type-number.test.ts:552-564
  - tests/division-result-type-number.test.ts:571-578
  - tests/division-result-type-number.test.ts:581-593
  - tests/division-result-type-number.test.ts:596-603
  - tests/division-result-type-number.test.ts:1076-1082
  - tests/division-result-type-number.test.ts:1122-1127
  - tests/division-result-type-number.test.ts:1133-1137
  - tests/division-result-type-number.test.ts:1245-1250
  - tests/division-result-type-number.test.ts:1508-1512
  - tests/division-result-type-number.test.ts:1533-1537
  - tests/division-result-type-number.test.ts:1560-1564
  - tests/division-result-type-number.test.ts:1596-1600
sites: 8                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# Eight PRECONDITION `.toBeDefined()` checks wrap `argRange`/`letRange`/`objectFieldRange`/`letInitRange` calls that already throw-or-return-defined, so the wrap cannot fail

## Observation
`tests/division-result-type-number.test.ts` declares four anchor helpers —
`argRange`, `letRange`, `objectFieldRange`, `letInitRange` — each of which
runs its own `expect(..., "PRECONDITION: ...").toHaveLength(1)` (or, inside
`letInitRange`, an additional `.toBeDefined()`) before returning a
`SourceRange` read from an already-parsed AST node. At eight call sites, the
test body wraps a fresh call to one of these helpers in a second,
outer `expect(helperCall(...), "PRECONDITION (<cell>): ...").toBeDefined()`.
Given each helper's own contract (throw if the anchor is absent, otherwise
return a real `SourceRange` object read from a required AST field), the outer
wrap can never itself distinguish an anchor found from an anchor missing: it
is unreachable on the failure path and unconditionally true on the success
path.

## Evidence
The four wrapped helpers, each throwing via its own internal `expect` before
it could ever return `undefined`:

tests/division-result-type-number.test.ts:552-564 (`argRange`):
```ts
function argRange(doc: ThetaDocument, callee: string, index: number): SourceRange {
  const calls = anchorsOf(doc).calls.filter((c) => c.callee === callee);
  expect(
    calls,
    `PRECONDITION: the fixture must hold exactly one call of '${callee}'; the parse found ${calls.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  const args = calls[0]!.args;
  expect(
    args.length,
    `PRECONDITION: the call of '${callee}' must carry an argument at index ${index}; it carries ${args.length}. Diagnostics: ${render(doc)}`,
  ).toBeGreaterThan(index);
  return args[index]!;
}
```
`args` is built by `anchorsOf` via `e.args.map((a) => a.range)` (a dense map
over `Expr.range`, a required field) — once `args.length > index` is proven,
`args[index]` is a real `SourceRange`, never `undefined`.

tests/division-result-type-number.test.ts:571-578 (`letRange`):
```ts
function letRange(doc: ThetaDocument, name: string): SourceRange {
  const hits = anchorsOf(doc).lets.filter((l) => l.name === name);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one \`let ${name}\`; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.range;
}
```
`hits[0]!.range` is populated from `s.range`, a required field on every
`Stmt` — once `hits.length === 1` is proven, it is always defined.

tests/division-result-type-number.test.ts:581-593 (`letInitRange`):
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
```
This helper's *own* internal `.toBeDefined()` (line 591) is the one
legitimate, falsifiable check on `init` (a `let` genuinely may lack an
initialiser); once it passes, the function returns a value already proven
defined.

tests/division-result-type-number.test.ts:596-603 (`objectFieldRange`):
```ts
function objectFieldRange(doc: ThetaDocument, field: string): SourceRange {
  const hits = anchorsOf(doc).objectFields.filter((f) => f.name === field);
  expect(
    hits,
    `PRECONDITION: the fixture must hold exactly one constructor field '${field}'; the parse found ${hits.length}. Diagnostics: ${render(doc)}`,
  ).toHaveLength(1);
  return hits[0]!.value;
}
```
`hits[0]!.value` is populated from `f.value.range` (a required `Expr.range`)
— always defined once the length check passes.

The eight call sites that re-wrap one of these helpers in an outer
`.toBeDefined()`:

tests/division-result-type-number.test.ts:1076-1082:
```ts
    const verdicts = rows.map(([cell, body]) => {
      const doc = parse(G_INT + body);
      expect(
        argRange(doc, "g", 0),
        `PRECONDITION (${cell}): the argument node must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
      return `${cell} -> ${JSON.stringify(allHits(doc))}`;
    });
```

tests/division-result-type-number.test.ts:1122-1127:
```ts
    const division = parse(G_INT + 'let r = g("a" / "b")\nr\n');
    expectDivisions(division, 1, "aStr");
    expect(
      argRange(division, "g", 0),
      "PRECONDITION (aStr): the argument node must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

tests/division-result-type-number.test.ts:1133-1137:
```ts
    const control = parse(G_INT + 'let r = g("a" - "b")\nr\n');
    expect(
      argRange(control, "g", 0),
      "PRECONDITION (aStr control): the argument node must be reachable",
    ).toBeDefined();
```

tests/division-result-type-number.test.ts:1245-1250:
```ts
    const verdicts = rows.map(([cell, src]) => {
      const doc = parse(src);
      expect(
        letRange(doc, "n"),
        `PRECONDITION (${cell}): the \`let n\` statement must be reachable, or the absence below measures nothing`,
      ).toBeDefined();
```

tests/division-result-type-number.test.ts:1508-1512:
```ts
    const control = parse('let s: string = "a" - "b"\ns\n');
    expect(
      letRange(control, "s"),
      "PRECONDITION (L1c): the `let s` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

tests/division-result-type-number.test.ts:1533-1537:
```ts
    const control = parse("let b: boolean = true - false\nb\n");
    expect(
      letRange(control, "b"),
      "PRECONDITION (L2c): the `let b` statement must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

tests/division-result-type-number.test.ts:1560-1564:
```ts
    const control = parse(S_STR + 'let o = S { s: "a" - "b" }\no\n');
    expect(
      objectFieldRange(control, "s"),
      "PRECONDITION (L3c): the constructor field 's' must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

tests/division-result-type-number.test.ts:1596-1600:
```ts
    const control = parse('let xs: array<string> = ["a" - "b"]\nxs\n');
    expect(
      letInitRange(control, "xs"),
      "PRECONDITION (L4c): the `let xs` initialiser must be reachable, or the absence below measures nothing",
    ).toBeDefined();
```

Search: `grep -n "toBeDefined()" tests/division-result-type-number.test.ts`
returns 9 hits total; 1 (line 591, inside `letInitRange` itself, over the
genuinely-optional `init` field) is a real, falsifiable check; the other 8,
listed above, each wrap one of the four helpers a second time at a call site.

## Why this is a problem
Each of the 8 outer assertions can be shown, mechanically, to never
distinguish pass from fail at the line where it sits. Take
`expect(argRange(doc, "g", 0), "PRECONDITION (a10): ...").toBeDefined()`
(line 1078-1081) as the representative case: evaluating `argRange(doc, "g",
0)` first runs `argRange`'s own `expect(calls, "PRECONDITION: ...").
toHaveLength(1)`. If that internal check fails, `expect().toHaveLength()`
throws immediately — vitest never reaches the outer `expect(...,
"PRECONDITION (a10): ...").toBeDefined()` call at all, so that assertion did
not fail; the *test* failed on `argRange`'s own thrown message instead. If
the internal check passes, `argRange` runs its second internal check
(`args.length` `.toBeGreaterThan(index)`) and, only if that also passes,
returns `args[index]!` — a `SourceRange` object read from `Expr.range`, a
field that is never optional on the node kinds `anchorsOf` walks. There is no
third outcome in which `argRange` returns `undefined`: it always either
throws first (with its own message) or returns a defined object. The outer
`.toBeDefined()` therefore has no code path on which it registers a failure
distinct from `argRange`'s own; it is true whenever it is reached, and it is
never reached when the anchor is actually missing. The same argument applies
verbatim to `letRange` (proven by `Stmt.range`), `objectFieldRange` (proven
by `Expr.range` on a constructor field's value) and `letInitRange` (proven by
its *own* internal `.toBeDefined()` at line 591, which is the one check in
this family that is actually falsifiable). All 8 call-site wraps share this
one root cause: a second assertion re-states a guarantee the wrapped helper
already enforces one call earlier, so the second assertion cannot itself
fail.

## Suggested direction (non-binding, optional)
The load-bearing precondition at each of these 8 sites is already enforced,
with its own descriptive message, inside the wrapped helper's first internal
`expect` call; that is the assertion a missing anchor would actually be
reported through.

## False-positive check
- Gate-pin check: `tests/division-result-type-number.test.ts` does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory, so the census/pin-gate carve-out does not apply.
- Recording-double check: `argRange`/`letRange`/`objectFieldRange`/
  `letInitRange` all read `SourceRange` fields off a real, freshly-parsed
  `ThetaDocument`'s AST (via `anchorsOf`), not a recording double's captured
  call log; no MUST-NOT-called negative witness is at stake, so the
  recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -n "argRange\|letRange\|toBeDefined"
  docs/bugs/0142-division-result-type-not-number.md
  docs/bugs/0152-modulo-zero-result-type-not-number.md
  docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md` —
  the review notes in 0142 discuss cell dispositions (`aStr`, `b3`'s missing
  `expectDivisions`) but never this outer-wrap redundancy; no doc defends it
  as a documented correct-reason red, and `npx vitest run
  tests/division-result-type-number.test.ts` reproduces 44/44 passing at
  HEAD (reverified during this review).
- coverage-matrix/bug-doc citation search: `grep -c
  "division-result-type-number.test.ts" docs/reference/coverage-matrix.md` →
  0. This finding proposes no merge, rename or deletion of any test, only
  observes that 8 specific assertions cannot fail, so no witness-list
  citation is disturbed.
- Coverage-drift check: the claim is confined to what these 8 existing
  assertions can and cannot register as a failure; it does not allege a
  missing test path, and the load-bearing checks these 8 sites duplicate
  (each helper's own internal `expect`) remain intact and are not proposed
  for removal.

## Triage
verdict: confirmed — verified all 12 cited locations byte-for-byte; each of the 8 outer `.toBeDefined()` wraps sits after a call to one of four helpers whose own internal `expect(...).toHaveLength(1)`/`.toBeDefined()` already throws first and whose return is read off a required `NodeBase.range` field (confirmed in theta-document.ts), so the wrap cannot register a failure distinct from the helper's own; all searches (9 `toBeDefined()` hits, docs/bugs silence, coverage-matrix 0, 44/44 passing) reproduce, no gate/recording-double/witness-list carve-out applies, and no existing/resolved PTQ tracks this file (triage: claude-opus-5)
