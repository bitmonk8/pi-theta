---
id: PTQ-1728
title: createImportResolutionKit describes three diagnostic arms below its unreadablePaths declaration although only one is in that file.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/import-resolution-kit.ts:407-415
  - src/extension/import-resolution-kit.ts:500-506
  - src/extension/import-specifier-facts.ts:257-266
  - src/extension/import-reexport-closure.ts:120-125
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# createImportResolutionKit describes three diagnostic arms below its unreadablePaths declaration although only one is in that file.

## Observation
The comment on `unreadablePaths` says “the three read-failure arms below” use the set to push IMP-1 diagnostics. Only the transitive-import diagnostic arm is below that comment in `import-resolution-kit.ts`. The direct-import arm is in `import-specifier-facts.ts`, and the re-export arm is in `import-reexport-closure.ts`.

## Evidence
The reported locator, `src/extension/import-resolution-kit.ts:407-415`:

```ts
  // Bug 0428: resolved paths whose `readBytes` rejected, distinguished from the
  // pipeline's only other `parseThetaLib` outcome (a document, however
  // unparseable its content) so the three read-failure arms below can push
  // IMP-1 exactly once per site without conflating "unreadable" with the
  // already-handled "parses to an illegal `.thetalib`" case. `parseCache`
  // itself stays `ParsedThetaLib | undefined` (unchanged shape, so every
  // existing `parsed === undefined` consumer keeps its current behaviour) —
  // this is an ADDITIONAL fact recorded beside it, not a replacement.
  const unreadablePaths = new Set<string>();
```

The one diagnostic arm remaining below it, `src/extension/import-resolution-kit.ts:500-506`:

```ts
          // `export`-kind edges are excluded: `closeOverReExports` is the sole
          // reporter for a re-export source's read failure (mirrors the existing
          // resolution-failure division of labour in the comment above).
          if (edge.kind === "import" && unreadablePaths.has(load.resolvedPath)) {
            diagnostics.push(
              unreadableThetaLibDiagnostic({ file: resolvedPath, range: edge.range }, edge.path),
            );
```

The direct-import arm's current location, `src/extension/import-specifier-facts.ts:257-266`:

```ts
  if (parsed === undefined) {
    // Bug 0428: resolution succeeded (the entry is byte-exact and listed)
    // but the bytes could not be read — IMP-1's "likewise unresolvable"
    // clause at DIRECT depth, sited on this decl exactly as the
    // resolution-failure arm above sites its own push on `site`. An
    // unparseable-but-READABLE lib (not this arm; `registrationFilteredPaths`
    // below handles that) never reaches this branch, since `parsed` would be
    // a `ParsedThetaLib` carrying parse diagnostics, not `undefined`.
    if (unreadablePaths.has(resolvedPath)) {
      diagnostics.push(unreadableThetaLibDiagnostic(site, spec));
```

The re-export arm's current location, cited only to verify the scoped comment's collaborator count, `src/extension/import-reexport-closure.ts:120-125`:

```ts
      if (unreadablePaths.has(load.resolvedPath)) {
        diagnostics.push(
          unreadableThetaLibDiagnostic({ file: resolvedPath, range: stmt.range }, stmt.path),
        );
        continue;
      }
```

`rg -n 'unreadableThetaLibDiagnostic' src extensions tools tests` returns seven lines: the declaration, three import/re-export entries, and exactly the three call sites quoted above. Thus the three-site subsystem count still holds, but two of those sites are not below the declaration in this module.

## Why this is a problem
This is a stale post-extraction locator, not a complaint about the live bookkeeping mechanism. The comment presents three diagnostic collaborators as local downstream branches, while the code distributes them across three modules. It therefore directs readers looking for the complete read-failure reporting contract to a local sequence that is no longer present.

## False-positive check
- The exact diagnostic-helper search in Evidence includes all of `src/`, `extensions/`, `tools/`, and `tests/`; every counted call site is quoted. Imports and the function declaration were distinguished from calls.
- The report does not claim that the total count of three diagnostic arms is wrong. It isolates the word “below” and the implied same-module location; the shared set and all three arms remain live.
- History intent: `git blame -L 404,415 -- src/extension/import-resolution-kit.ts` attributes the comment and set to extraction commit a94280098. `git show 'a9428009^:src/extension/import-static-checks.ts' | rg -n 'three read-failure arms|unreadableThetaLibDiagnostic'` shows the same prose in the earlier host. This is retained explanatory text, not a dated quotation or a requirement to keep the branches in one module.
- Prior-topic searches for `three read-failure arms` and related locator wording in `quality/issues` and `quality/resolved` found no report about this sentence. The scope and seam findings about the import subsystem concern code placement rather than this prose.
- The out-of-scope module is cited solely as reference evidence for the comment under review; no finding is made against its implementation.

## Triage
verdict: confirmed — The retained comment at import-resolution-kit.ts:409 incorrectly locates all three read-failure arms “below”: the seven-hit helper search confirms only one local call, with the others in import-specifier-facts.ts:266 and import-reexport-closure.ts:122; history verifies retained prose, and no existing finding tracks this stale locator. (triage: claude-opus-5-5)
