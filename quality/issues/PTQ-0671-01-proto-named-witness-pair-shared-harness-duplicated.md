---
id: PTQ-0671
title: proto-named-schema-validator-enforcement.test.ts restates proto-named-record-write-sites.test.ts's jsonSlug/hasOwn/range harness rather than importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/proto-named-record-write-sites.test.ts:140-144
  - tests/proto-named-record-write-sites.test.ts:178-180
  - tests/proto-named-record-write-sites.test.ts:703-705
  - tests/proto-named-schema-validator-enforcement.test.ts:126-130
  - tests/proto-named-schema-validator-enforcement.test.ts:151-154
  - tests/proto-named-schema-validator-enforcement.test.ts:197-199
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# proto-named-schema-validator-enforcement.test.ts restates proto-named-record-write-sites.test.ts's jsonSlug/hasOwn/range harness rather than importing it

## Observation
`tests/proto-named-record-write-sites.test.ts` (bug 0210's witness) declares a
module-private `jsonSlug` (a `SchemaSlugFn` reducing a schema to its own
`JSON.stringify` bytes), a `hasOwn(target, key)` own-key test, and a
`range(line)` `SourceRange` builder.
`tests/proto-named-schema-validator-enforcement.test.ts` (bug 0212's witness,
authored after 0210's fix landed) declares functions of the same three names
with byte-identical bodies. The second file's own header states the harness
was "Built to mirror `tests/proto-named-record-write-sites.test.ts`… so the
two files' verdicts are comparable line for line," and the `jsonSlug` doc
comment there states it is "Identical to 0210's witness `jsonSlug`" — the
duplication is acknowledged at authoring time, not a coincidence.

## Evidence
`tests/proto-named-record-write-sites.test.ts:140-144`:
```ts

/** A content-addressing function deriving a distinct slug per distinct schema. */
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};
```

`tests/proto-named-schema-validator-enforcement.test.ts:126-130` (identical body):
```ts
const jsonSlug: SchemaSlugFn = (schema) => {
  const bytes = JSON.stringify(schema);
  return { slug: bytes, canonicalBytes: bytes };
};

/**
```

`tests/proto-named-record-write-sites.test.ts:178-180`:
```ts
/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
```

`tests/proto-named-schema-validator-enforcement.test.ts:197-199` (identical body):
```ts
/** Whether `key` is an OWN key of `target` — never a prototype-chain read. */
function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}
```

`tests/proto-named-record-write-sites.test.ts:703-705`:
```ts
/** A throwaway located range for the `params:` field inputs. */
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}
```

`tests/proto-named-schema-validator-enforcement.test.ts:151-154` (identical body):
```ts
/** A throwaway located range for the `params:` field inputs. */
function range(line: number): SourceRange {
  return { start: { line, column: 1 }, end: { line, column: 10 } };
}
```

The header at `tests/proto-named-schema-validator-enforcement.test.ts:115-118`:
```ts
// ===========================================================================
// Shared harness. Built to mirror `tests/proto-named-record-write-sites.test.ts`
// (bug 0210's witness) so the two files' verdicts are comparable line for line.
// ===========================================================================
```

Search: `grep -n "^const jsonSlug\|^function hasOwn(\|^function range(" tests/proto-named-record-write-sites.test.ts tests/proto-named-schema-validator-enforcement.test.ts` → exactly the six declarations quoted above, two per name, no others in either file.

## Why this is a problem
Three harness primitives — the content-addressing slug function, the own-key
predicate, and the throwaway range builder — are declared with byte-identical
bodies in two files that already sit in the same bug-witness lineage (0210 →
0212, same `AjvSchemaValidator`/`SchemaSlugFn`/`SourceRange` imports, same
`parseParams` seam). Neither file imports the other's declaration or a shared
`tests/helpers/` module; each restates the same three functions under the same
names and the same doc comments. A change to any one of the three — e.g. the
own-key test, or the range shape `parseParams` accepts — has two
hand-synchronised copies to keep in step, in a pair the second file's own
comment already treats as "comparable line for line."

## Suggested direction (non-binding, optional)
`jsonSlug`, `hasOwn`, and `range` are generic, schema/AST-shaped primitives
with no bug-specific content; a `tests/helpers/` module analogous to the
existing `registry-oracle.ts` or `spy-validator.ts` (single-purpose, named for
what it centralises) is the kind of home the repository already uses for a
two-file "PTQ" pair of exactly this shape.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double carve-out: none of the three functions records a call for
  a "never called" witness; `hasOwn` and `range` are pure predicates/builders,
  `jsonSlug` is a pure content-addressing function; not applicable.
- docs/bugs/ signature search: `grep -n "jsonSlug\|hasOwn\|^function range" docs/bugs/0210-remaining-record-writes-reach-the-prototype-slot.md docs/bugs/0212-ajv-drops-declared-proto-named-property.md` → 0 hits in either bug doc; neither document names these three helpers or gives a rationale for restating them rather than sharing them (0212's own file header explains the MIRRORING of the two files' overall verdicts, not a rationale for not sharing this harness).
- coverage-matrix/bug-doc citation search: `grep -n "proto-named-record-write-sites\|proto-named-schema-validator-enforcement" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no change to any `it()`/`describe()` name, count, range, or assertion, only to where three harness functions are defined.
- Coverage check: the claim is about repeated helper DEFINITIONS, not a missing test path; both copies are exercised by every cell in their own file that calls them.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all six declarations sit at the cited lines with byte-identical bodies (jsonSlug 141/126, hasOwn 178/197, range 703/151), the "Built to mirror" header (115-118) and "Identical to 0210's witness `jsonSlug`" comment (121-125) are real, every copy is live (hasOwn 6/4, range 5/2 call sites, jsonSlug feeds validator() in both), no tests/helpers/ or src/ module exports any of the three, and git shows sequential authoring (0210 witness cea6665f 2026-08-20 → 0212 witness e3470433 2026-08-21); no gate/recording-double/coverage-matrix carve-out applies and no open/resolved PTQ tracks it — note the stated bug-doc grep actually hits `hasOwnProperty` 7× (none naming the helper, so the claim holds), the hasOwn half overlaps same-wave intake sibling qw20260917154546-d7-16-hasown-prototypereport-triplicated-proto-named-suite.md (fold into one helper at acceptance), and jsonSlug is in fact also declared byte-identically in tests/params-defaults.test.ts:65 and tests/schema-validator-seam.test.ts:27, so the pair framing understates the copy count rather than refuting it (triage: claude-fable-5-1)
