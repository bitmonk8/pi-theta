---
id: PTQ-0731
title: import-specifier-separator-production-required.test.ts redefines a local parse() reimplementing tests/helpers/e2e-s1.ts's exported parseDoc
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-specifier-separator-production-required.test.ts:12,233-235
  - tests/helpers/e2e-s1.ts:37-45
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# import-specifier-separator-production-required.test.ts redefines a local parse() reimplementing tests/helpers/e2e-s1.ts's exported parseDoc

## Observation
tests/import-specifier-separator-production-required.test.ts imports
`parseDeps` from `./helpers/e2e-s1` and then defines its own module-scope
`parse(source, path)` function whose body — build a `ThetaSource`-shaped
object from UTF-8-encoded bytes and hand it to `parseThetaDocument` with
`parseDeps()` — is the same two-operation sequence, in the same order, over
the same two parameters, that `tests/helpers/e2e-s1.ts` already exports as
`parseDoc(src, path = "test.theta")` from the very module this file already
imports `parseDeps` from. The file does not import `parseDoc` alongside
`parseDeps`, and every one of its own call sites already supplies an explicit
`path` argument, so `parseDoc`'s defaulted second parameter is not a
behavioural obstacle to using it here.

## Evidence
tests/import-specifier-separator-production-required.test.ts:12 (the import
already in place) and :233-235 (the reimplementation):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}
```

The canonical, already-exported helper, tests/helpers/e2e-s1.ts:37-45:
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

Exact search run: `grep -n "^function parse(source: string, path: string):
ThetaDocument {" tests/import-specifier-separator-production-required.test.ts`
→ one hit, line 233. `grep -n "helpers/" tests/import-specifier-separator-production-required.test.ts`
→ one hit, line 12 (`parseDeps` only; `parseDoc` is not imported).

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s exported `parseDoc` performs the identical
byte-encode-and-parse sequence this file's local `parse` retypes, from a
module this file already opens for `parseDeps`. The sibling instance of this
same class (b0303/b0304/b0305/b0306 each redefining the identical local
`parse`/`parseApp` pair) was already filed and fixed as PTQ-0239, whose own
evidence recorded that this exact file's `parse` function also matched the
grep pattern for the redefinition (`grep -rl "^function parse(source: string,
path: string): ThetaDocument {" tests --include="*.test.ts"` → 13 files
including this one) but scoped that finding's fix to only the four b03xx
files; this file's own copy was left unaddressed and is still present at
today's HEAD.

## Suggested direction (non-binding, optional)
Importing `parseDoc` from `tests/helpers/e2e-s1.ts` alongside the `parseDeps`
import already present in this file is the path the four files PTQ-0239
addressed, and 18 further files, already take for the identical helper.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named gate
  kin; not a pinned-count/inventory gate.
- Recording-double check: `parse`/`parseDoc` are parse-time wrappers, not
  recording doubles backing a "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -n "helpers/e2e-s1\|parseDoc"
  docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md` → 0
  hits; the bug document does not cite this file's own `parse` wrapper as a
  deliberate divergence from the shared helper, and its own comment at
  tests/import-specifier-separator-production-required.test.ts:228-230
  attributes the parse-driver "helper set" to bug 0100's witness file
  (tests/import-specifier-list-production-required.test.ts), not to a
  rationale for redeclaring `parseDoc` itself.
- coverage-matrix/bug-doc citation search: this file is named in
  docs/bugs/0211-separator-degenerate-specifier-lists-parse-clean.md's witness
  list (lines 813, 839); this finding proposes no rename, merge, or deletion
  of any `it()`/`describe()` in the file, only relocating the local `parse`
  wrapper to the already-exported `parseDoc`, so the citation is unaffected.
  `grep -n "import-specifier-separator-production-required"
  docs/reference/coverage-matrix.md` → 0 hits.
- Duplicate-topic check: PTQ-0239 ("b0303, b0304, b0305 and b0306 each
  redefine a local parse()...") is `status: fixed`, but its `locations` field
  lists only the four b03xx files and `tests/helpers/e2e-s1.ts`; this file was
  named only inside PTQ-0239's evidence-section grep output, not among its
  filed locations, and its copy of the redefinition is unfixed at today's
  HEAD (`grep -n "^function parse(source" tests/import-specifier-separator-production-required.test.ts`
  still returns line 233), so this is a distinct, still-open instance rather
  than a re-filing of PTQ-0239's own scope.
- Coverage check: the claim is about a repeated wrapper-function DEFINITION,
  not a missing test path; every call site is already exercised by this
  file's own tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: excerpts match verbatim (import at :12 is `parseDeps` only; local `parse` at :233-235 is body-equivalent to e2e-s1.ts:43-45's exported `parseDoc`), its only two callers (:243 parseLib, :254 parseApp) pass an explicit path so `parseDoc` is a drop-in; file is not a *gate*, not a recording double, bug 0211 is fixed (0.150.0) and the file is 68/68 green at HEAD, bug-doc :155 mentions `parseDeps` only for scratch probes (no rationale for a local wrapper), coverage-matrix 0 hits and no it()/describe() change is proposed; not a duplicate — resolved PTQ-0239's `locations` cover only b0303-b0306 (this file appeared solely in its evidence grep and still matches today), PTQ-0214/0314/0386/0405 are the same class at other files, and sibling intake d7-15 is the unrelated fakeThetaLibFs clone (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
