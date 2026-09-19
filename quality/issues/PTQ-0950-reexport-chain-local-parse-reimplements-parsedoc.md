---
id: PTQ-0950
title: reexport-chain-resolution.test.ts's local parse() reimplements tests/helpers/e2e-s1.ts's exported parseDoc from the same import line's module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reexport-chain-resolution.test.ts:12,235-237
  - tests/helpers/e2e-s1.ts:65-73
sites: 1
fix_scope: localized
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# reexport-chain-resolution.test.ts's local parse() reimplements tests/helpers/e2e-s1.ts's exported parseDoc from the same import line's module

## Observation
`tests/reexport-chain-resolution.test.ts` imports `parseDeps` from
`./helpers/e2e-s1` and then declares its own module-scope
`parse(source, path)` function whose body — build a `ThetaSource`-shaped
object from UTF-8-encoded bytes and hand it to `parseThetaDocument` with
`parseDeps()` — is the identical two-operation sequence, in the identical
order, over the identical two parameters, that `tests/helpers/e2e-s1.ts`
already exports as `parseDoc(src, path = "test.theta")` from the very
module the file already opens on the same import line for `parseDeps`. The
file does not import `parseDoc`.

## Evidence

`tests/reexport-chain-resolution.test.ts:12` (the import already in place)
and `:235-237` (the reimplementation):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}
```

The canonical, already-exported helper, `tests/helpers/e2e-s1.ts:65-73`:
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

Exact search: `grep -n "^function parse(source: string, path: string): ThetaDocument {" tests/reexport-chain-resolution.test.ts` → exactly one hit, at line 235. `grep -n "parseDoc" tests/reexport-chain-resolution.test.ts` → 0 hits (the canonical wrapper is never imported). The file's own local `parse` is used at exactly one call site, `tests/reexport-chain-resolution.test.ts:1013` inside group (h)'s `parse(mid, "/proj/mid.thetalib")` calls, which passes an explicit `path` argument in every case, so `parseDoc`'s defaulted second parameter is not a behavioural obstacle to substituting it.

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s exported `parseDoc` performs the identical
byte-encode-and-parse sequence this file's local `parse` retypes, from a
module the file already opens on the same import line for `parseDeps`. The
same class of duplication (a local `parse(source, path)` wrapper reimplementing
`parseDoc` instead of importing it, from a file that already imports
`parseDeps` from the same module) is tracked for two other files by the open
PTQ-0914, whose `locations` field names only
`tests/import-export-from-clause-required.test.ts` and
`tests/import-specifier-list-production-required.test.ts` — neither of which
is this file — so this is a distinct, unfiled instance of the same shape.

## Suggested direction (non-binding, optional)
Importing `parseDoc` from `tests/helpers/e2e-s1.ts` alongside the already-
present `parseDeps` import removes the local wrapper, matching the path many
other files in this repository already take for this exact helper.

## False-positive check
- Gate-pin check: `tests/reexport-chain-resolution.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; the cited lines are a stateless
  parse-time wrapper, not a pinned count or inventory.
- Recording-double check: `parse`/`parseDoc` are stateless parse-time
  wrappers, not recording doubles and not "never called" witnesses.
- docs/bugs/ signature search: `grep -n "parseDoc" docs/bugs/0101-reexport-chain-not-resolved.md` → 0 hits; the bug document does not cite or attribute a deliberate reason to this local wrapper.
- coverage-matrix/bug-doc citation search: `grep -n "reexport-chain-resolution" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no rename, merge, or deletion of any `it()`/`describe()` block — only relocating the local `parse` wrapper to the already-exported `parseDoc`.
- Duplicate-topic check: `grep -rl "reimplements-parsedoc\|reimplements parseDoc" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` finds PTQ-0239 (resolved, scoped to four b03xx files), PTQ-0731 (open, scoped to the bug-0211 separator file only) and PTQ-0914 (open, scoped to the two import-export/import-specifier files); none names `reexport-chain-resolution.test.ts` in its `locations` field, so this is a distinct, unfiled instance of the same class at this file.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: the local `parse()` excerpt reproduces verbatim at tests/reexport-chain-resolution.test.ts:235-237 and canonical `parseDoc` at tests/helpers/e2e-s1.ts:69-72 (filing's :65-73 spans it), same encode-then-`parseThetaDocument(…, parseDeps())` sequence from the module the file already opens at :12 solely for `parseDeps` (its only other use is inside `parse` itself, so the import line simply swaps); exact `^function parse(source: string, path: string)` search → 1 hit, `parseDoc` in file → 0, coverage-matrix → 0, `parseDoc` in the real bug doc docs/bugs/0101-from-bearing-reexport-materialises-nothing.md → 0 (the filing's cited filename `0101-reexport-chain-not-resolved.md` does not exist, and its "exactly one call site … :1013" is wrong — the file is 1064 lines and the live callers are :769 and :800 — but both pass an explicit path so `parseDoc` remains a drop-in and neither error touches the root cause); git shows `parse()` landed 2565269d (2026-08-20) long after `parseDoc` existed (d23c22be 2026-07-13), so it is a reimplementation not a predecessor; location under tests/, D7 boilerplate/copy-paste class, not a *gate* kin, not a recording double, no it()/describe() change proposed; not a duplicate — resolved PTQ-0239 named this file only in a 13-file search aside and never in `locations` (which cover b0303-b0306 only), open PTQ-0731 covers the separator file and open PTQ-0914 the from-clause/specifier-list pair, and per the store's per-file convention ruled in PTQ-0914's triage this is a distinct unfiled instance; sibling intake d7-11 is the unrelated registry-oracle clone in the same file (triage: claude-fable-5-1)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
