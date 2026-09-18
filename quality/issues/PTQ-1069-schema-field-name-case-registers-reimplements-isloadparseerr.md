---
id: PTQ-1069
title: schema-field-name-case.test.ts's local registers() re-derives e2e-s1's exported isLoadParseError predicate
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-field-name-case.test.ts:6
  - tests/schema-field-name-case.test.ts:211-222
  - tests/helpers/e2e-s1.ts:277-287
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# schema-field-name-case.test.ts's local registers() re-derives e2e-s1's exported isLoadParseError predicate

## Observation
`tests/helpers/e2e-s1.ts` exports `isLoadParseError(d: Diagnostic): boolean`,
a single-diagnostic predicate: true iff `d` is an error-severity
`theta/load/*` or `theta/parse/*` diagnostic. `tests/schema-field-name-case.test.ts`
already imports `diag`, `parseDoc`, and `rendered` from that exact module but
does not import `isLoadParseError`; it instead declares a local
`registers(doc: ThetaDocument): boolean` whose body is
`!doc.diagnostics.some(d => d.severity === "error" && (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/")))`
— exactly `!doc.diagnostics.some(isLoadParseError)`. `registers` is called at
six sites across the file (lines 254, 267, 680, 700, 730, 738).

## Evidence

`tests/helpers/e2e-s1.ts:277-287` (the canonical, already-exported
predicate, re-read immediately before filing):
```ts

/**
 * True iff `d` is the error-severity `theta/load/*` or `theta/parse/*` refusal
 * that blocks registration (mirrors `hasLoadParseError`,
 * src/extension/production-composition.ts).
 */
export function isLoadParseError(d: Diagnostic): boolean {
  return (
    d.severity === "error" &&
    (d.code.startsWith("theta/load/") || d.code.startsWith("theta/parse/"))
  );
}
```

`tests/schema-field-name-case.test.ts:6` (the import that stops short of
`isLoadParseError`):
```ts
import { diag, parseDoc, rendered } from "./helpers/e2e-s1";
```

`tests/schema-field-name-case.test.ts:211-222` (the local re-derivation,
re-read immediately before filing):
```ts
/**
 * `hasLoadParseError`'s predicate (src/extension/production-composition.ts),
 * restated over a parsed document: a theta registers unless some diagnostic is
 * an error-severity `theta/load/*` or `theta/parse/*`. Warnings never block
 * registration, which is why row w2 registers and row w1 does not.
 */
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
one handles.

Call sites: `grep -n "registers(doc)" tests/schema-field-name-case.test.ts`
→ 6 hits (lines 254, 267, 680, 700, 730, 738).

## Why this is a problem
The two-condition predicate this file needs — error severity plus a
`theta/load/` or `theta/parse/` code prefix — is byte-for-byte the logic
already exported as `isLoadParseError` from a module this file already
imports three other names from. A change to the registration predicate
(for example, widening the prefix set, as `hasLoadParseError`'s own
production definition might drive) would need to be hand-applied to this
file's local copy independently of the canonical helper, with nothing
keeping the two in step. This is the same root cause the sibling class
already tracks in seven other files (PTQ-0456, PTQ-0543, PTQ-0614,
PTQ-0684, PTQ-0753, PTQ-0813, and the sibling wave candidate
qw20260918202006-d7-07 for `tests/inline-object-field-name-case.test.ts`),
none of which lists this file.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `isLoadParseError`, already imported
successfully by this same file's sibling constructs (`diag`, `parseDoc`,
`rendered` all come from that module), is the natural source for
`registers`'s body (`!doc.diagnostics.some(isLoadParseError)`) rather than a
locally retyped copy of the same two conditions.

## False-positive check
- Gate-pin check: `tests/schema-field-name-case.test.ts` does not match
  `*gate*.test.ts` or the named gate-kin patterns; the cited lines are a
  registration-predicate helper, not a pinned count or inventory.
- Recording-double check: not applicable — `registers` computes a boolean
  from the diagnostics list already present on a parsed document; it
  records no calls and witnesses no "never called" claim.
- docs/bugs/ signature search: `grep -n "isLoadParseError\|function registers("
  docs/bugs/0149-field-name-case-positions-unenforced.md` → 0 hits; the bug
  doc states no rationale for a locally re-derived registration predicate.
- coverage-matrix/bug-doc citation search: `grep -n "schema-field-name-case"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only to
  where `registers`'s body is sourced from.
- Overlap check: `grep -rl "isLoadParseError" quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md` finds the established
  "registers/blocksRegistration/deniesRegistration reimplements
  isLoadParseError" family — PTQ-0456, PTQ-0508 (a different root cause:
  registry-oracle harness duplication, not this predicate), PTQ-0543,
  PTQ-0614, PTQ-0684, PTQ-0727 (resolved, targets
  `tests/type-name-as-value-refusal.test.ts`), PTQ-0753, PTQ-0813, and the
  in-wave candidate `qw20260918202006-d7-07-...` (targets
  `tests/inline-object-field-name-case.test.ts`) — each targeting a
  DIFFERENT file's own local copy; none of their `locations:` frontmatter
  lists `tests/schema-field-name-case.test.ts` (confirmed by grepping each
  file's `locations:` block directly), so this is a distinct, previously
  unfiled site of the same class, not a duplicate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (tests/helpers/e2e-s1.ts:277-287 `export function isLoadParseError`, tests/schema-field-name-case.test.ts:211-222 `function registers` with the clause-identical `severity === "error" && (startsWith("theta/load/") || startsWith("theta/parse/"))` body, so `registers` is exactly `!doc.diagnostics.some(isLoadParseError)`); line 6 imports `diag, parseDoc, rendered` from ./helpers/e2e-s1 but not `isLoadParseError` (0 hits in file); `grep -n "registers(doc)"` reproduces the 6 live call sites (254/267/680/700/730/738); git shows the test authored 2026-08-06 (bfa5ae84) and the helper added 2026-09-12 (f0333c15, PTQ-0268's fix), so this is an unmigrated pre-helper copy, not a stated design choice; not a gate file, 0 coverage-matrix hits, bug doc 0149 has 0 hits for the predicate; dedupe: `^function registers` still declares 10 copies and the family (PTQ-0456/0543/0614/0684/0727/0753/0813, in-wave d7-07) each lists a DIFFERENT file in `locations:` — PTQ-0753 and PTQ-0727 name this file only in a body roster and explicitly confine themselves to their own site, matching the recorded per-file precedent on this class — so this is a new site, not a duplicate; minor form note: stray `d4_class: clone` on a D7 filing, non-blocking (triage: claude-fable-5-1)
