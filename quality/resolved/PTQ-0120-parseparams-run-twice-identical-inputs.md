---
id: PTQ-0120
title: parseParams is invoked twice per parseFrontmatter over the identical arguments, each call reading one of the result record's two fields and discarding the other
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/frontmatter.ts:1708-1717
  - src/parser/frontmatter.ts:2270-2297
  - src/parser/params.ts:117-120
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# parseParams is invoked twice per parseFrontmatter over the identical arguments, each call reading one of the result record's two fields and discarding the other

## Observation
`ParamsParseResult` carries exactly two fields, `diagnostics` and
`loweredSchema`. `parseFrontmatter` reaches `parseParams` twice on one parse of
one source: once inside `extractParsedParams`, which keeps only
`lowered.loweredSchema`, and once in `parseFrontmatter`'s own body, which keeps
only `.diagnostics`. Both calls receive the same three arguments — the same
`fieldInputs` array object (returned by `extractParsedParams` and handed
straight back in), the same `bodyTypeDecls` array object, and `{ file }` built
from the same `file` string. `parseParams` reads nothing but its parameters and
returns a freshly built record, so the second call recomputes exactly what the
first already computed.

## Evidence
src/parser/params.ts:117-120 — the result record has two fields, so a caller
reading one discards the other:

```ts
export interface ParamsParseResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly loweredSchema?: LoweredSchema;
}
```

src/parser/frontmatter.ts:1708-1717 — call 1, inside `extractParsedParams`;
`lowered.diagnostics` is never named (the `diagnostics` returned on the next
lines is the function's own local array of per-field shape refusals):

```ts
  const lowered = parseParams(fieldInputs, bodyTypeDecls, { file });
  return {
    params: {
      ...(lowered.loweredSchema !== undefined ? { loweredSchema: lowered.loweredSchema } : {}),
      defaultedFields,
      fields: bypassFields,
    },
    fieldInputs,
    diagnostics,
  };
}
```

src/parser/frontmatter.ts:2270-2282 — `parseFrontmatter` destructures the very
`fieldInputs` array `extractParsedParams` just passed to call 1, and holds the
same `bodyTypeDecls` it passed in:

```ts
  // `params:` lowering + bypass classification (the binder's runtime schema).
  const {
    params,
    fieldInputs,
    diagnostics: paramsShapeDiags,
  } = extractParsedParams(
    paramsNode,
    file,
    lineCounter,
    lineOffset,
    bodyTypeDecls,
    block?.yaml ?? "",
  );
```

src/parser/frontmatter.ts:2293-2297 — call 2, with the identical argument
triple; `.loweredSchema` is never named:

```ts
  if (fieldInputs.length > 0) {
    diagnostics.push(
      ...parseParams(fieldInputs, bodyTypeDecls, { file }).diagnostics,
    );
  }
```

The two calls therefore coincide on every input whenever
`fieldInputs.length > 0`. A `params:` mapping that yields no field runs call 1
alone; a source whose `params:` node is not a mapping runs neither
(`extractParsedParams` returns at frontmatter.ts:1566-1568 before call 1).

## Why this is a problem
Redundant recomputation of an identical result: the module asks the same pure
function the same question twice and throws away half of each answer. The
first call's `diagnostics` and the second call's `loweredSchema` are values
that are constructed and then reachable by nothing — the "dead output"
face of dead code. `parseParams` (src/parser/params.ts:167-171) takes
`readonly` inputs, reads no module-level mutable state (grep `^(let|var) ` over
src/parser/params.ts: 0 hits — every module-scope binding is `const`), and
builds its `properties` / `required` / `defs` / `diagnostics` accumulators
locally, so the two invocations are extensionally identical and neither can
observe the other.

## Suggested direction (non-binding, optional)
One call whose whole `ParamsParseResult` travels out of `extractParsedParams`
alongside the shape refusals would let `parseFrontmatter` push the lowering
diagnostics it already has, with the `fieldInputs.length > 0` guard preserved
as an empty-diagnostics no-op.

## False-positive check
- Argument identity: `fieldInputs` at frontmatter.ts:2295 is the same array
  object returned at :1715 (destructured at :2273 from the very call that made
  it); `bodyTypeDecls` at :2295 is the array built at :2277-2281 and passed as
  the fifth argument at :2280; `file` is the single `const { file, modelMatcher } =
  options;` binding. No copy or mutation of `fieldInputs` occurs between the
  two calls — searched `fieldInputs` across frontmatter.ts: the only writes are
  `fieldInputs.push(...)` inside `extractParsedParams`, all before call 1.
- Purity of `parseParams`: `grep -nE "^(let|var) " src/parser/params.ts` → 0
  hits; the function's signature (params.ts:167-171) takes `readonly
  ParamFieldInput[]`, `readonly BodyTypeDeclaration[]`, and a site record, and
  returns a fresh `ParamsParseResult`.
- Other call sites: `grep -n "parseParams(" src/parser/frontmatter.ts` → 2 hits
  (1708, 2295); `grep -rn "parseParams" src/ extensions/ tools/ tests/` shows
  the export plus test callers, none of which is between these two.
- Result-field readers: `ParamsParseResult` has exactly two members
  (params.ts:117-120), so "reads one, discards the other" is exhaustive.
- Not a test-only artifact: both call sites are in production `src/`.
- git history: `git log -S "function extractParsedParams" -- src/parser/frontmatter.ts`
  bottoms out at fed12acd (2026-07-03), which introduced call 1;
  `git log -S "parseParams(fieldInputs, bodyTypeDecls, { file }).diagnostics" --
  src/parser/frontmatter.ts` yields the single commit 5eedc9b7 (2026-07-04),
  which added call 2 — i.e. the second call was added beside an existing first
  call, to surface diagnostics the first call already produced but dropped.
  Neither commit left a comment claiming the two calls answer different
  questions.

## Triage
verdict: confirmed — independently re-verified: an instrumented parseFrontmatter run shows exactly 2 parseParams calls whose fieldInputs/bodyTypeDecls are the SAME objects (reference-identical) and whose results are byte-identical, with shared body-type `lowered` fragments unmutated (hoistNestedDefs clones; no module-scope mutable state); the stated boundaries reproduce (1 call on an empty `params:` mapping, 0 on a non-mapping), and all six citations plus both commits (fed12acd 2026-07-03, 5eedc9b7 2026-07-04) check out (triage: claude-opus-5)
