---
id: PTQ-0984
title: Both in-scope files redeclare the identical frontmatter-loweredSchema loweredParams() reader found in five tests/inline-object-*.test.ts siblings
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-empty-entry-slot-refusal.test.ts:338-341
  - tests/inline-object-empty-field-type-truncation.test.ts:400-403
  - tests/inline-object-keyless-entry-refusal.test.ts:334-337
  - tests/inline-object-stranded-entry-refusal.test.ts:262-265
  - tests/inline-object-stray-close-token-split.test.ts:318-321
sites: 5
fix_scope: cross-module
d4_class: clone
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope files redeclare the identical frontmatter-loweredSchema loweredParams() reader found in five tests/inline-object-*.test.ts siblings

## Observation
Both files in this review's scope declare a module-scope `loweredParams`
function carrying the identical doc comment ("The `params:` lowering,
verbatim — `null` when the frontmatter is withheld.") and the identical
one-line body `JSON.stringify(parseDoc(...).frontmatter?.params?.loweredSchema
?? null)`. The same doc comment and body recur, independently declared with
no shared import, in three further `tests/inline-object-*.test.ts` files. No
`tests/helpers/` module exports this reader; the shape is distinct from the
`parseParams`-driven `loweredParams` variant already tracked by resolved
PTQ-0944 (that variant calls `parseParams` directly and fail-loudly throws on
an error-severity diagnostic or an undefined `loweredSchema`; this variant
reads a completed `ThetaDocument`'s frontmatter through an optional chain and
falls back to the literal string `"null"`).

## Evidence

`tests/inline-object-empty-entry-slot-refusal.test.ts:338-341` (re-read
immediately before filing):
```ts
/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}
```

`tests/inline-object-empty-field-type-truncation.test.ts:400-403` (re-read
immediately before filing — same doc comment and body, differing only in
that the caller has already applied `paramsSrc` before calling, so the
parameter is named `src` and passed to `parseDoc` directly rather than
wrapped again inside the function):
```ts
/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(src: string): string {
  return JSON.stringify(parseDoc(src).frontmatter?.params?.loweredSchema ?? null);
}
```

`tests/inline-object-keyless-entry-refusal.test.ts:334-337` — same doc
comment, same `parseDoc(paramsSrc(...))` body, only the parameter renamed to
`interior`:
```ts
/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(interior: string): string {
  return JSON.stringify(parseDoc(paramsSrc(interior)).frontmatter?.params?.loweredSchema ?? null);
}
```

`tests/inline-object-stranded-entry-refusal.test.ts:262-265` — byte-identical
to the first excerpt above:
```ts
/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}
```

`tests/inline-object-stray-close-token-split.test.ts:318-321` — byte-identical
to the first excerpt above:
```ts
/** The `params:` lowering, verbatim — `null` when the frontmatter is withheld. */
function loweredParams(type: string): string {
  return JSON.stringify(parseDoc(paramsSrc(type)).frontmatter?.params?.loweredSchema ?? null);
}
```

Exact search: `grep -n "^function loweredParams" tests/*.test.ts` returns
exactly these five declarations (plus nine other `loweredParams`-named
functions of a structurally different shape, none of which reads
`frontmatter?.params?.loweredSchema` through `parseDoc`, confirmed by
`grep -n "function loweredParams" tests/*.test.ts` cross-checked against
`grep -n "frontmatter?.params?.loweredSchema" tests/*.test.ts`, which returns
the same five files at the same line numbers as the declarations, plus one
further inline call at `tests/inline-object-stray-close-token-split.test.ts:814`
that reads the same expression directly rather than through the function).
Both in-scope functions are live: `loweredParams` is called 6 times in
`inline-object-empty-entry-slot-refusal.test.ts` and 4 times in
`inline-object-empty-field-type-truncation.test.ts`.

## Why this is a problem
Both files in scope already import `parseDoc` from `./helpers/e2e-s1` in
their leading import block, and each nonetheless retypes the identical
one-line frontmatter-projection body under the identical doc comment rather
than sharing one declaration. The same declaration recurs, independently, in
three further sibling files in the same `tests/inline-object-*` family. A
change to how a refused document's frontmatter is represented (for example,
if `frontmatter` moved from `null` to `undefined` on refusal, changing what
the `?? null` fallback needs to normalise) would need the identical edit
applied by hand in all five files, with nothing to signal a copy left behind.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already hosts this family's other shared
`ThetaDocument`-reading exports (`parseDoc`, `diagLines`); a
`loweredParams(src)` export there, taking the already-built source string
each caller currently produces via its own `paramsSrc`/`theta` builder, would
give all five files one shared declaration to import instead of five
independent copies.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `loweredParams` reads an already-produced
  `ThetaDocument`'s frontmatter field for a positive value comparison; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "loweredParams" docs/bugs/0257-*.md
  docs/bugs/0237-*.md` → 0 hits; neither bug document these two in-scope
  files witness states a rationale for redeclaring this reader locally
  rather than sharing it.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-empty-entry-slot-refusal\|inline-object-empty-field-type-truncation"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are named by path in
  their own bug documents' witness lists (docs/bugs/0257 and docs/bugs/0237),
  but never by `loweredParams`'s internal declaration; this finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()`
  block, only that the reader function could be imported from a shared
  location.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests today, and no
  behaviour path is claimed untested.
- Prior-filing overlap check: `grep -rl "loweredParams" quality/issues/*.md
  quality/intake/*.md quality/resolved/*.md` finds
  `quality/resolved/PTQ-0944-loweredparams-harness-triplicated.md`, whose own
  triage note distinguishes it from "the other test-side `loweredParams`
  helpers [that] read `frontmatter.params.loweredSchema` off a parsed
  document" as "a different shape" — the exact shape filed here — and
  confirms that shape's three sites (`proto-named-*.test.ts`) are disjoint
  from these five `inline-object-*.test.ts` files. No open or resolved PTQ
  names any of the five files cited here for this root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all five excerpts reproduce verbatim at the cited lines (338-341 / 400-403 / 334-337 / 262-265 / 318-321), every copy is live (6/4/16/9/8 `loweredParams(` mentions), the shape has no shared export (e2e-s1's `loweredP` at :619 reads only `properties.p`; proto-named-harness's `loweredParams` at :58 is PTQ-0944's `parseParams`-plus-throw shape), both in-scope files already import `parseDoc` from e2e-s1, and no carve-out applies (no gate file, not a recording double, docs/bugs 0256:814 and 0282:647 name `loweredParams` only as an assertion result not a local-declaration rationale, coverage-matrix → 0, no test merge/rename/delete proposed); dedupe clean (PTQ-0801/0473 are `diagLines`/REGISTRY in the same files, PTQ-0944 the proto-named shape) — but the filing's census UNDERCOUNTS: its claim that the 10 other `loweredParams` declarations are all a different shape is refuted by a sixth byte-identical copy (same doc comment, same `parseDoc(src)` body) at tests/generic-argument-inline-field-key-rules.test.ts:293-296, plus the same body inlined as a lambda at tests/generic-argument-bracket-group-truncation.test.ts:587-588 and a `(text, path)` variant under the same doc comment at tests/live/b0257live-empty-slot-params-refusal-live-cell.test.ts:181-183; the fix (one `loweredParams(src)` export in e2e-s1, callers passing their `paramsSrc(x)`) is a mechanical dedupe and should sweep those uncited copies too (triage: claude-fable-5-1)
