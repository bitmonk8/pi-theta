---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: InboundTranslationInput.enumDeclaringPath's doc counts "the two boundaries that supply this", but four production call sites across three inbound boundaries supply it — including the invoke-return boundary its absent-case sentence describes
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/wire-translation.ts:143-147
  - src/extension/theta-composition-producer.ts:118
  - src/extension/production-theta-producer.ts:2894-2898
  - src/extension/production-theta-producer.ts:3393-3398
  - src/extension/production-theta-producer.ts:4569-4572
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# InboundTranslationInput.enumDeclaringPath's doc counts "the two boundaries that supply this", but four production call sites across three inbound boundaries supply it — including the invoke-return boundary its absent-case sentence describes

## Observation
The doc of `InboundTranslationInput.enumDeclaringPath` justifies the
single-path field with a count: "Every retagged position at the two boundaries
that supply this is a body-declared enum of that one file, so a single path
qualifies them all", and its absent-case sentence includes "a boundary whose
retagged names are not the local file's own declarations" among the cases that
keep bare names. In production the field is supplied at four call sites
spanning three of the spec's inbound boundaries — binder-args (two
projections), typed-query-results, and the `invoke<T>` return — and the
invoke-return site supplies the CALLEE's resolved path, i.e. exactly the
not-the-local-file's-declarations boundary the absent-case sentence assigns to
the absent arm.

## Evidence
src/runtime/wire-translation.ts:143-147 — the count and the absent-case arm:

```
   * SAME file-qualified declaration. Absent (a harness with no source path, or
   * a boundary whose retagged names are not the local file's own declarations)
   * keeps the bare declared name. Every retagged position at the two boundaries
   * that supply this is a body-declared enum of that one file, so a single
   * path qualifies them all.
```

The supply sites. Search: `enumDeclaringPath:` (object-literal supply) over
`*.ts` in src/, extensions/, tools/ — exactly four hits:

src/extension/theta-composition-producer.ts:118 — binder-args, slash
projection:

```
    ...(theta.sourcePath !== undefined ? { enumDeclaringPath: theta.sourcePath } : {}),
```

src/extension/production-theta-producer.ts:2894-2898 — binder-args, marshalled
child-side intake (the code above it calls this "that boundary's other
projection"):

```
            ...(theta.sourcePath !== undefined
              ? { enumDeclaringPath: theta.sourcePath }
              : {}),
```

src/extension/production-theta-producer.ts:3393-3398 — typed-query-results
boundary:

```
              // Bug 0337: this theta's OWN typed-query result retags its
              // `.theta`-declared enums with their file-qualified declaring
              // key, so a query result and a body-constructed variant of the
              // same declaration keep comparing equal.
              ...(deps.theta.sourcePath !== undefined
                ? { enumDeclaringPath: deps.theta.sourcePath }
                : {}),
```

src/extension/production-theta-producer.ts:4569-4572 — the `invoke<T>` return
boundary, supplying the callee's path (not the local file's):

```
        ...(calleeResolvedPath !== undefined
          ? { enumDeclaringPath: calleeResolvedPath }
          : {}),
```

## Why this is a problem
Stale supplier-roster narration: whether counted as call sites (four) or as
spec boundaries (three: binder-args, typed-query-results, invoke-return),
"the two boundaries that supply this" matches neither, and the neighbouring
absent-case sentence sorts the not-local-declarations boundary into the
absent arm while producer:4569-4572 supplies a path there. Git shows the
sentence never matched the shipped supply set: text and all four supply sites
landed together in 62bf9d3c (bug 0337, v0.305.0 — verified via `git show
62bf9d3c`, which has three `enumDeclaringPath:` supplies in
production-theta-producer.ts plus one in theta-composition-producer.ts), so a
reader auditing who supplies the field from this doc stops one boundary short.

## Suggested direction (non-binding, optional)
Restate the sentence around the invariant it defends — each supplying boundary
retags declarations of exactly one file, whose path it supplies (the local
file's, or the callee's at the invoke return) — without a hard boundary count.

## False-positive check
- Reference search: `enumDeclaringPath` over `*.ts` in src/, extensions/,
  tools/, tests/ — origination (object-literal `enumDeclaringPath:`) sites
  are exactly the four cited; `src/runtime/inbound-boundary.ts` (:91-93,
  :161-163 area) only threads a caller-supplied value onward and is not a
  fifth origin; test suppliers (e.g. b0337 witness suites) are not
  boundaries. `translateInbound` is imported in src/ only by
  inbound-boundary.ts, so no supply path bypasses the counted sites.
- Boundary mapping verified from each site's own surrounding comments: the
  intake site's preceding comment names binder `args` ("the marshalled
  child-side intake is that boundary's other projection"), the :3393 site
  sits under the "typed-query-results boundary" comment, and the :4569 site
  sits in the `invoke<T>` return decode under the bug-0337 "mint the
  CALLEE's file-qualified declaring key" comment.
- Git intent check: `git show 62bf9d3c:src/runtime/wire-translation.ts` line
  145 already reads "the two boundaries"; the same commit's producer and
  composition-producer already contain all four supply sites — so this is a
  claim the current code (and the landing code) contradicts, not a recent
  regression of the comment.
- Duplicate check: qw20260907130901-d2-02-wire-walk-line-citations-drifted
  mentions wire-translation.ts:212 only as the unrelated text now sitting at
  a drifted pin (`readonly enumDeclaringPath…`, the InboundWalk field) and
  makes no claim about this doc's boundary count; no other filed finding or
  triage-log row covers it.

## Triage
