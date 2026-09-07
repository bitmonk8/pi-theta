---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: "binder-envelope.ts's module header says the module owns \"two mechanisms\" and then enumerates three top-level bullets"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-envelope.ts:3-23
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# binder-envelope.ts's module header says the module owns "two mechanisms" and then enumerates three top-level bullets

## Observation

The module header of `binder-envelope.ts` opens its ownership list with "This
module owns two mechanisms of binder/binder-bypass-and-envelope.md:" and the
colon-introduced list that follows contains three top-level bullets at the same
indentation: the binder-bypass decision, the dynamic envelope schema, and the
BNDR-3 distinct failure-mode template row prefixes. The module's code implements
all three (`classifyBinderBypass`/`applyBinderBypass`,
`buildBinderEnvelopeSchema`, `binderFailureRowPrefix`/`renderBinderFailureRow`),
and the header's own Spec line names all three obligations.

## Evidence

src/binder/binder-envelope.ts:3-23 (bullet bodies elided to their heads):

```ts
// This module owns two mechanisms of binder/binder-bypass-and-envelope.md:
//
//   - The binder-bypass decision (§Binder bypass): computed at theta-load time
...
//   - The dynamic envelope schema (§Binder envelope): the runtime constructs one
...
//   - The two distinct failure-mode template row prefixes (BNDR-3): the
//     `needs_info` row (`argument binding needs more info`) and the `ambiguous`
//     row (`ambiguous arguments`) stay distinct.
```

The Spec anchor at the end of the same header (src/binder/binder-envelope.ts:30-32)
counts three obligations:

```ts
// Spec: binder/binder-bypass-and-envelope.md (§Binder bypass, §Binder envelope,
// BNDR-1, BNDR-2, BNDR-3), schema-subset.md; failure-mode template rows from
// binder/determinism-cancellation-failure.md#failure-mode-templates-normative.
```

## Why this is a problem

Inaccurate narration with a mechanically checkable mismatch: the stated count
("two mechanisms") disagrees with the enumerated list it introduces (three
bullets) and with the module's actual owned surface (bypass, envelope schema,
and the BNDR-3 prefix/row renderers are all implemented in this file). A reader
using the header as the module inventory is told one fewer owned mechanism than
the list and the code carry. This is the same count-vs-list narration mismatch
class as previously filed intake findings against other files (e.g. the
four-arm/three-count comment findings); this site was not covered by any of
them.

## Suggested direction (non-binding, optional)

Make the count agree with the list — either say three, or drop the numeral and
let the bullets speak.

## False-positive check

- Counted the top-level bullets in the header list: exactly three `//   - `
  items at the same indentation between lines 5 and 23 (sub-clauses within each
  bullet are indented further); no reading merges the BNDR-3 bullet into the
  envelope bullet — it is its own top-level item with its own section heading in
  the file (`--- BNDR-3: distinct failure-mode template row prefixes ---`,
  binder-envelope.ts:286).
- Git intent: `git log -S "This module owns two mechanisms"` and `git log -S
  "The two distinct failure-mode template row prefixes"` both resolve to the
  same introducing commit (66db8874, V11c-T), so the sentence and the third
  bullet were committed together; the mismatch is in the current text either
  way, and no later commit corrected it.
- Overlap check against already-filed findings: the filed
  qw20260907130901-d2-01-stale-tests-task-stub-narration.md cites
  binder-envelope.ts:22-26 for a different sentence (the V11c-T stub paragraph),
  not this count mismatch; no other intake file names this site.

## Triage

