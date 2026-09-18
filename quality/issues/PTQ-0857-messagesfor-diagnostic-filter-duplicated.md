---
id: PTQ-0857
title: par-for-body-return-refusal.test.ts's messagesFor() is byte-identical to two sibling files' own copies
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/par-for-body-return-refusal.test.ts:149-154
  - tests/par-for.test.ts:454-459
  - tests/b0324-max-incompatible-static.test.ts:100-105
sites: 3
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# par-for-body-return-refusal.test.ts's messagesFor() is byte-identical to two sibling files' own copies

## Observation
`tests/par-for-body-return-refusal.test.ts` declares a module-scope
`messagesFor(src, code)` helper — parse `src`, filter the diagnostics to
`code`, and map to the `message` field — together with its doc comment
("Every message carried by a diagnostic of `code`, in emission order.").
`tests/par-for.test.ts` and `tests/b0324-max-incompatible-static.test.ts` each
declare a function of the same name, same signature, same body, and the same
one-line doc comment, byte-for-byte.

## Evidence
tests/par-for-body-return-refusal.test.ts:149-154 (re-read immediately before
filing):
```ts
/** Every message carried by a diagnostic of `code`, in emission order. */
function messagesFor(src: string, code: string): string[] {
  return parse(src)
    .diagnostics.filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => d.message);
}
```

tests/par-for.test.ts:454-459 (re-read immediately before filing):
```ts
/** Every message carried by a diagnostic of `code`, in emission order. */
function messagesFor(src: string, code: string): string[] {
  return parse(src)
    .diagnostics.filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => d.message);
}
```

tests/b0324-max-incompatible-static.test.ts:100-105 (re-read immediately
before filing):
```ts
/** Every message carried by a diagnostic of `code`, in emission order. */
function messagesFor(src: string, code: string): string[] {
  return parse(src)
    .diagnostics.filter((d: Diagnostic) => d.code === code)
    .map((d: Diagnostic) => d.message);
}
```

Exact search run: `grep -rl "function messagesFor" tests/*.test.ts` → 4 files
(the three above plus `tests/arg-mismatch-diagnostic-count-by-surface.test.ts`,
whose `messagesFor(stem)` takes a different parameter and body and is not a
copy of this shape). All three cited copies are byte-identical, including the
doc comment.

## Why this is a problem
The same five-line filter-and-map helper, with the same doc comment, is
declared independently in three files rather than defined once and imported.
None of `tests/helpers/e2e-s1.ts`, `tests/helpers/registry-oracle.ts`, or any
other module under `tests/helpers/` exports a "messages of a diagnostic code,
in emission order" reader, so each of the three files re-derives the same
five lines against its own locally-declared `parse` function.

## Suggested direction (non-binding, optional)
A `messagesFor`-shaped export parameterised over the caller's own `parse`
result (or over a `readonly Diagnostic[]`) is the natural shared home for this
filter-and-map, alongside the diagnostic-reading helpers already exported from
`tests/helpers/`.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kinds; this finding is about a helper function's definition, not
  a pinned count or inventory assertion.
- Recording-double check: `messagesFor` reads diagnostics already produced by
  a parse call; it records no calls and backs no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "messagesFor" docs/bugs/*.md` → 0
  hits; no open bug document discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-for-body-return-refusal\|par-for\.test\|b0324-max-incompatible-static"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge,
  rename, or deletion of any file or `it()`/`describe()` name, only where the
  internal `messagesFor` helper is defined.
- Coverage check: the claim is entirely about a repeated harness-function
  DEFINITION; every call site in each file continues to exercise its own
  file's diagnostics exactly as documented.
- Prior-finding search: `grep -rl "messagesFor" quality/resolved
  quality/issues quality/intake` → 0 hits; this exact helper has not been
  filed before. `tests/par-for-body-return-refusal.test.ts` and
  `tests/par-for.test.ts` were both already reviewed for D7 in wave
  qw20260917154546 (shard-111/shard-112 per `quality/REVIEW_LOG.md`), which
  filed and resolved three other duplicates in this pair (now fixed:
  PTQ-0648, PTQ-0649, PTQ-0650) but did not name `messagesFor`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce at exactly the cited lines (par-for-body-return-refusal.test.ts:149-154, par-for.test.ts:454-459, b0324-max-incompatible-static.test.ts:100-105), sed-extracted and diffed pairwise → zero diff including the doc comment; every copy is live (2 / 43 / 6 `messagesFor(` call sites) and each closes over its own module-local `parse` (:91 / :116 / :90); `grep -rn "function messagesFor" tests/` → the same 4 hits with arg-mismatch-diagnostic-count-by-surface.test.ts:711 a different `(stem)` signature as stated; tests/helpers/e2e-s1.ts exports codesOf/hasCode/findCode/codes/diagLines/diagCodes but no code-filtered `.message` projection, so the boilerplate-duplication anchor holds; stated searches reproduce (docs/bugs `messagesFor` → 0; coverage-matrix cite of the three files → 0; quality/ `messagesFor` → only this wave's own REVIEW_LOG/shard-44 notes, no prior PTQ; PTQ-0627/0646 cover different files and a different withCode/DiagShape helper set); all locations under tests/, none a gate file, no recording-double or red-test carve-out; fix is a mechanical dedupe of a five-line helper (triage: claude-fable-5-1)
