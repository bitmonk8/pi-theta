---
id: PTQ-1343
title: reservedMessage/capMessage hard-coded literal builders reimplemented byte-identically across three test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:102-108
  - tests/capitalised-bare-match-pattern-refusal.test.ts:153-159
  - tests/object-pattern-head-unresolved-refusal.test.ts:144-146
  - tests/helpers/load-row-harness.ts:61-71
sites: 3
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# reservedMessage/capMessage hard-coded literal builders reimplemented byte-identically across three test files

## Observation
tests/reserved-keyword-object-pattern-head-refusal.test.ts declares two
module-level functions, `reservedMessage(keyword)` and `capMessage(name)`,
each returning a hard-coded literal string template. The same two functions,
with byte-identical bodies, are separately declared in
tests/capitalised-bare-match-pattern-refusal.test.ts and (for
`reservedMessage` alone) tests/object-pattern-head-unresolved-refusal.test.ts.
Two sibling files in the same test family
(tests/inline-slug-name-reservation.test.ts,
tests/match-pattern-increment-decrement.test.ts) already replaced their local
copies with a call to the canonical `registryMessageOf` helper exported from
tests/helpers/load-row-harness.ts, leaving these three files as the
unmigrated residue.

## Evidence
tests/reserved-keyword-object-pattern-head-refusal.test.ts:102-108
```ts
function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}

function capMessage(name: string): string {
  return `capitalised pattern head '${name}' names no pattern production`;
}
```

tests/capitalised-bare-match-pattern-refusal.test.ts:153-159
```ts
function capMessage(name: string): string {
  return `capitalised pattern head '${name}' names no pattern production`;
}

function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}
```

tests/object-pattern-head-unresolved-refusal.test.ts:144-146
```ts
function reservedMessage(keyword: string): string {
  return `reserved keyword '${keyword}' cannot be used as an identifier`;
}
```

tests/helpers/load-row-harness.ts:61-71 (the canonical read-assert-fill
reader, already the migration target for the two sibling files named above):
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
```

Already-migrated siblings, for contrast — tests/inline-slug-name-reservation.test.ts:141-143:
```ts
function reservedMessage(name: string): string {
  return registryMessageOf(REGISTRY, PARSE_REGISTRY_PATH, CODE, [["<name>", name]]);
}
```
and tests/match-pattern-increment-decrement.test.ts:142-144:
```ts
function capMessage(name: string): string {
  return registryMessageOf(REGISTRY, REGISTRY_PARSE_PAGE, CAP_HEAD, [["<name>", name]], { replaceAll: true });
}
```

## Why this is a problem
The three cited files each restate the same two literal-string templates
(`reserved keyword '...' cannot be used as an identifier` and
`capitalised pattern head '...' names no pattern production`) as
module-level functions with identical bodies, rather than drawing them from
`registryMessageOf` the way the two sibling files in the same family already
do. Each file's own group-(r) test independently re-derives the equivalence
between this hard-coded literal and the registry's *Message* column
(e.g. reserved-keyword-object-pattern-head-refusal.test.ts:178
`expect(registryMessage(REGISTRY, RESERVED), ...).toBe(reservedMessage("<keyword>"))`),
so the same DIAG-4 anchor check is repeated per file against a hand-copied
string instead of against a single call site.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts's `registryMessageOf` is the established
home two sibling files in this same reserved-keyword/pattern-head family
already migrated to; the three cited files could draw `reservedMessage` and
`capMessage` from the same call rather than restating the literal template.

## False-positive check
- Gate-pin: none of the three cited files match `*gate*.test.ts` or the named
  gate kin.
- Recording-double: none of the three functions record calls; each returns a
  computed string value, not a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rl "reservedMessage\|capMessage" docs/bugs/` →
  0 hits; no open bug documents or licenses this duplication.
- coverage-matrix/bug-doc citation search:
  `grep -n "reserved-keyword-object-pattern-head-refusal\|capitalised-bare-match-pattern-refusal\|object-pattern-head-unresolved-refusal" docs/reference/coverage-matrix.md` →
  0 hits. All three files are cited by name in their respective bug documents
  (0219, 0141, 0221) as those bugs' offline-lock witnesses; this finding
  proposes no change to any `it()`/`describe()` name, test count, or asserted
  outcome — only to where the two literal-string builder functions are
  defined — so those citations are unaffected.
- Prior-finding search: `grep -rl "reservedMessage\|capMessage" quality/` shows
  three resolved findings (PTQ-0832, PTQ-0859, PTQ-1001), all naming the
  `registryMessage`-reading variant in `tests/inline-slug-name-reservation.test.ts`
  and other files, already fixed by migration to `registryMessageOf`; none
  names the hard-coded-literal variant still present in the three files cited
  here.
- Coverage check: the claim is about a repeated function DEFINITION across
  files, not a missing test path; every site is exercised by the tests that
  call it.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at reserved-keyword-object-pattern-head-refusal.test.ts:102-108, capitalised-bare-match-pattern-refusal.test.ts:153-159 and object-pattern-head-unresolved-refusal.test.ts:144-146 (grep `function (reservedMessage|capMessage)` across tests/ → exactly these three hard-coded-literal copies plus the two already-migrated registryMessageOf wrappers at inline-slug-name-reservation:141-143 and match-pattern-increment-decrement:142-144, as claimed); bodies are byte-identical template literals matching the registry's *Message* column (code-registry-parse.md:21 `reserved keyword '<keyword>' cannot be used as an identifier`, :23 `capitalised pattern head '<name>' names no pattern production`); every copy is live (5/7/2 call sites) and no tests/helpers module exports either builder (registry-oracle.ts:242 and reserved-keyword-type-position.test.ts:30 hits are comments only); an uncited fourth inline copy of the cap literal at object-pattern-head-unresolved-refusal.test.ts:781 should be folded in at acceptance; all locations under tests/, D7 boilerplate-duplication class, none a gate file, no recording double, no it()/describe() change proposed (docs/bugs identifier grep → 0, coverage-matrix file cite → 0 reproduce); the one rationale the filing omitted — each file's header "Every other expectation is a hard-coded literal, so the primary reds are the MISSING DIAGNOSTIC … never an oracle miss" — argues against folding every row onto registryMessageOf (which would make a registry-row edit red every cell), not against a shared literal builder in tests/helpers beside the per-file group-(r) anchor, so the fixer should weigh that posture when choosing the home (same shape as PTQ-1059's ruling); dedupe clean — PTQ-0832/0859/1001/1089 cover registryMessage-reading variants in other files, PTQ-0646/1074/0645/0684 cover these files' DiagShape/scaffold/runtime/predicate duplication and left the message builders in place, PTQ-0967/1059 are the house precedents confirming byte-identical message builders/constants across sibling tests (triage: claude-fable-5-1)
