---
id: PTQ-1060
title: inline-object-field-name-case.test.ts's local registers() re-derives e2e-s1's exported isLoadParseError predicate
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-field-name-case.test.ts:6,274-280
  - tests/helpers/e2e-s1.ts:282-287
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# inline-object-field-name-case.test.ts's local registers() re-derives e2e-s1's exported isLoadParseError predicate

## Observation
`tests/helpers/e2e-s1.ts` exports `isLoadParseError(d: Diagnostic): boolean`,
a single-diagnostic predicate mirroring `hasLoadParseError`
(src/extension/production-composition.ts): true iff `d` is an error-severity
`theta/load/*` or `theta/parse/*` diagnostic. `tests/inline-object-field-name-case.test.ts`
already imports from that exact module (`diag`, `parseDoc`, `rendered`) but
does not import `isLoadParseError`; it instead declares a local
`registers(doc: ThetaDocument): boolean` whose body is
`!doc.diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`
— exactly `!doc.diagnostics.some(isLoadParseError)`.

## Evidence

`tests/helpers/e2e-s1.ts:282-287` (the canonical, already-exported predicate,
re-read immediately before filing):
```ts
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

`tests/inline-object-field-name-case.test.ts:6` (the import that stops short
of `isLoadParseError`):
```ts
import { diag, parseDoc, rendered } from "./helpers/e2e-s1";
```

`tests/inline-object-field-name-case.test.ts:274-280` (the local
re-derivation, re-read immediately before filing):
```ts
function registers(doc: ThetaDocument): boolean {
  return !doc.diagnostics.some(
    (d: Diagnostic) =>
      d.severity === "error" &&
      (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")),
  );
}
```

Substituting `d.severity === "error" && (d.code.startsWith("theta/load/") ||
d.code.startsWith("theta/parse/"))` for `isLoadParseError(d)` inside the
local `registers` body's `.some(...)` callback produces
`!doc.diagnostics.some(isLoadParseError)` — the two predicates test the
identical two conditions in the identical order with no third case either
one handles. `registers` is live: it is called at 12 sites across groups (A), (B) and
(H) of the file (lines 302, 316, 324, 330, 344, 352, 365, 451, 479, 907, 921
and 956).

## Why this is a problem
The two-condition predicate this file needs — error severity plus a
`theta/load/` or `theta/parse/` code prefix — is byte-for-byte the logic
already exported as `isLoadParseError`. A change to the registration
predicate (for example, widening the prefix set, as `hasLoadParseError`'s
own production definition might) would need to be hand-applied to this
file's local copy independently of the canonical helper, with nothing
keeping the two in step; the established sibling class (PTQ-0753,
PTQ-0456, PTQ-0543, PTQ-0614, PTQ-0684) already treats this exact
re-derivation as the same root cause in seven other files, none of which
list this one.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `isLoadParseError`, already imported
successfully by this same file's sibling constructs (`diag`, `parseDoc`,
`rendered` all come from that module), is the natural source for
`registers`'s body (`!doc.diagnostics.some(isLoadParseError)`) rather than a
locally retyped copy of the same two conditions.

## False-positive check
- Gate-pin check: `tests/inline-object-field-name-case.test.ts` does not
  match `*gate*.test.ts` or the named gate-kin patterns; the cited lines are
  a registration-predicate helper, not a pinned count or inventory.
- Recording-double check: not applicable — `registers` computes a boolean
  from the diagnostics list already present on a parsed document; it records
  no calls and witnesses no "never called" claim.
- docs/bugs/ signature search: `grep -n "isLoadParseError\|function registers("
  docs/bugs/0154-inline-object-type-field-name-rules-unenforced.md` → 0
  hits; the bug doc states no rationale for a locally re-derived
  registration predicate.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-field-name-case" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no change to any `it()`/`describe()` name,
  count, or assertion — only to where `registers`'s body is sourced from.
- Overlap check: `grep -rl "isLoadParseError" quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md` finds the established
  "registers/blocksRegistration/deniesRegistration reimplements
  isLoadParseError" family — PTQ-0753, PTQ-0813, PTQ-0841, PTQ-0916,
  PTQ-0456, PTQ-0508, PTQ-0543, PTQ-0614, PTQ-0684, PTQ-0727 (resolved) —
  each targeting a DIFFERENT file's own local copy; none of their
  `locations:` frontmatter lists `tests/inline-object-field-name-case.test.ts`
  (confirmed by grepping each file's `locations:` block directly), so this
  is a distinct, previously unfiled site of the same class, not a
  duplicate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-field-name-case.test.ts:274-280 and tests/helpers/e2e-s1.ts:282-287 (helper doc cites the same `hasLoadParseError` mirror, live at production-composition.ts:2437/3074); the file imports only `diag, parseDoc, rendered` from ./helpers/e2e-s1 (line 6) and never names `isLoadParseError`, so `registers` is exactly `!doc.diagnostics.some(isLoadParseError)`; all 12 stated call sites reproduce (302…956), the helper is a live canonical imported by 9 other test files, the test (28c730ad, 2026-08-21) predates the export (f0333c15, 2026-09-12); not a gate file, 0 coverage-matrix hits, 0 bug-doc hits; not a duplicate — PTQ-0753 names this file only in its "nine further files" list and explicitly confines itself to malformed-entry-resync, no issues/resolved row's `locations:` lists this file, and the class precedent (0456/0543/0614/0684/0727/0753) is one row per file; same-wave sibling d7-19 targets schema-field-name-case.test.ts, a different file (triage: claude-fable-5-1)
