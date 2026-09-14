---
id: PTQ-0297
title: PassParseDeps's doc comment says its cache field avoids a new parameter on six call sites, but parseViaPassCache now has seven
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/pass-parse-cache.ts:136-145
  - src/extension/import-static-checks.ts:723
  - src/extension/production-composition.ts:2064
  - src/extension/production-composition.ts:2636
  - src/extension/production-composition.ts:3122
  - src/extension/production-composition.ts:3616
  - src/extension/production-composition.ts:3769
  - src/extension/production-composition.ts:3848
sites: 8
fix_scope: localized
wave: qw20260913183958
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# PassParseDeps's doc comment says its cache field avoids a new parameter on six call sites, but parseViaPassCache now has seven

## Observation
`PassParseDeps`'s doc comment says the interface widens
`ParseThetaDocumentDeps` with an optional cache field "so the cache rides the
same `parseDeps` object already threaded to every relevant walk instead of a
new parameter on six call sites." `git blame` attributes this doc comment to
b01e7bee9 (bug 0264, 2026-08-24 10:25:43+02:00), the commit that introduced
the module and, in the same commit, six of the seven current call sites of
the routing function the comment is describing, `parseViaPassCache`. A
seventh call site (`production-composition.ts:3122`) was added the same day
by a later, separate commit (1e7e4321d, bug 0271, 2026-08-24 21:21:27+02:00),
which made no change to `pass-parse-cache.ts`. The doc comment's count has
read "six" ever since, while the function it describes now has seven callers.

## Evidence
src/extension/pass-parse-cache.ts:136-145 — the count claim and the interface
it documents:
```ts
/**
 * `ParseThetaDocumentDeps` widened with the optional pass-cache field, so the
 * cache rides the same `parseDeps` object already threaded to every relevant
 * walk instead of a new parameter on six call sites. Absent (every
 * non-production / inert-channel caller): {@link parseViaPassCache} parses
 * directly, byte-identical to calling `parseThetaDocument` itself.
 */
export interface PassParseDeps extends ParseThetaDocumentDeps {
  readonly passParseCache?: PassParseCache;
}
```

The seven call sites of `parseViaPassCache` (`grep -n "parseViaPassCache("
src/**/*.ts` — exactly these seven; the same search over `tests/`,
`extensions/` and `tools/` returns zero matches):

src/extension/import-static-checks.ts:723 (introduced by b01e7bee9):
```ts
          document: parseViaPassCache({ path: resolvedPath, bytes }, deps.parseDeps),
```

src/extension/production-composition.ts:2064 (b01e7bee9):
```ts
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
```

src/extension/production-composition.ts:2636 (b01e7bee9):
```ts
  const document = parseViaPassCache({ path: absolute, bytes }, deps);
```

src/extension/production-composition.ts:3122 — the seventh call site, added
by a *different* commit (1e7e4321d, bug 0271, eleven hours after b01e7bee9)
that left `pass-parse-cache.ts` untouched:
```ts
    const document = parseViaPassCache({ path: nestedAbsolute, bytes }, deps);
```

src/extension/production-composition.ts:3616 (b01e7bee9):
```ts
  const document = parseViaPassCache({ path: absolute, bytes }, deps);
```

src/extension/production-composition.ts:3769 (b01e7bee9):
```ts
    const document = parseViaPassCache({ path: absPath, bytes }, deps);
```

src/extension/production-composition.ts:3848 (b01e7bee9):
```ts
  const document = parseViaPassCache({ path: theta.path, bytes }, deps);
```

## Why this is a problem
"Six call sites" is a concrete, falsifiable count offered as the
justification for this field's design (piggybacking on the existing
`parseDeps` object "instead of" a dedicated parameter at each site). `git
blame` shows the count was correct on the commit that wrote it and became
wrong roughly eleven hours later the same day, when a second commit added a
seventh `parseViaPassCache` call site without revisiting the sentence that
names a count. The design the sentence is justifying does not depend on the
exact number — the argument holds equally well at seven — but the number
itself has been wrong since 2026-08-24, through three subsequent weeks of
commits that added further consumers of this dependency chain (e.g.
`PassVerdictDeps`), none of which touched it.

## Suggested direction (non-binding, optional)
Update the count to seven, or reword the sentence to avoid naming a specific
number that a future eighth call site would again make stale.

## False-positive check
- `grep -n "parseViaPassCache("` across `src/` returns exactly the seven
  sites cited above; the same pattern over `tests/`, `extensions/` and
  `tools/` returns zero matches, so the count is not diluted or inflated by
  a non-production caller.
- `git blame -L 136,145 -- src/extension/pass-parse-cache.ts` attributes the
  whole doc comment to b01e7bee9 (2026-08-24T10:25:43+02:00).
- `git blame` on each of the seven call sites individually: six
  (import-static-checks.ts:723; production-composition.ts:2064, 2636, 3616,
  3769, 3848) resolve to b01e7bee9 itself; the seventh
  (production-composition.ts:3122) resolves to 1e7e4321d
  (2026-08-24T21:21:27+02:00), a later commit the same day.
- `git show 1e7e4321d -- src/extension/pass-parse-cache.ts` produces no
  diff, confirming the doc comment was not revisited when the seventh call
  site was added.
- Considered whether "six call sites" might intentionally exclude
  production-composition.ts:3122 (e.g. as a nested/recursive parse rather
  than a top-level one): the cited excerpt shows it is an ordinary
  `parseViaPassCache({ path: nestedAbsolute, bytes }, deps)` call parsing a
  callee's document exactly like its six siblings, called from a `deps:
  PassParseDeps`-typed function alongside them; nothing in this interface's
  doc or in `parseViaPassCache`'s own doc comment carves out a narrower
  definition of "call site" that would exclude it.
- Not a duplicate: `grep -rl "six call sites\|PassParseDeps" quality/resolved
  quality/issues` returns PTQ-0101, PTQ-0168, PTQ-0289, PTQ-0291, PTQ-0294 —
  none discuss this interface's doc comment or its call-site count (PTQ-0289
  is the `bytesEqual`/`normaliseCacheKey` duplication between this file and
  `pass-verdict-memo.ts`, already fixed; the others concern unrelated
  files).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — doc comment (pass-parse-cache.ts:136-145) and all 7 call sites byte-match; git blame confirms 6 (plus the doc itself) are b01e7bee9 and the 7th (production-composition.ts:3122, an ordinary `deps: PassParseDeps` call) is 1e7e4321d 11h later, whose `git show -- pass-parse-cache.ts` diff is empty; grep confirms exactly 7 callers repo-wide and no PTQ dedupe match (triage: claude-opus-5)
