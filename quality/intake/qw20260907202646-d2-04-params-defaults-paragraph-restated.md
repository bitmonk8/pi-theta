---
id: pending
title: The params-defaults paragraph in wire-translation.ts's module header restates its own first sentence and repeats inbound-boundary.ts's copy of the same four lines
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/wire-translation.ts:35-43
  - src/runtime/inbound-boundary.ts:138-148
sites: 2
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The params-defaults paragraph in wire-translation.ts's module header restates its own first sentence and repeats inbound-boundary.ts's copy of the same four lines

## Observation
`wire-translation.ts`'s module header carries a paragraph about frontmatter
`params:` defaults built from two sentences that assert the same fact: sentence
one says a defaulted `args` record reaches this pass and is "re-tagged /
re-branded here exactly as any other validated value is"; sentence two says
`runtime-value-model.md:37` "states the same mechanism" and then spells that
mechanism out again ("a named-enum position is re-tagged and a schema-typed one
re-branded here rather than arriving pre-tagged from frontmatter"). The second
sentence also appears, word for word apart from two hyphens, in
`inbound-boundary.ts`'s `bindParamsInbound` doc comment, which is the function
the paragraph names as the boundary doing the translating.

## Evidence
src/runtime/wire-translation.ts:35-43 — the paragraph, both sentences:

```
//   Frontmatter `params:` defaults DO reach this pass: the merged `args`
//   `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) produces, defaulted
//   fields included, are exactly what the binder-`args` inbound boundary
//   (`bindParamsInbound`, `inbound-boundary.ts`) translates, so a default in WIRE
//   form is re-tagged / re-branded here exactly as any other validated value is.
//   `runtime-value-model.md:37` states the same mechanism: a default projected
//   to wire form crosses the binder-`args` inbound boundary like any other
//   validated value, so a named-enum position is re-tagged and a schema-typed
//   one re-branded here rather than arriving pre-tagged from frontmatter.
```

src/runtime/inbound-boundary.ts:138-148 — the second copy, on the function the
paragraph above names:

```
 * A theta with no `params:` has no lowered document to plan against, so its
 * record is projected unchanged. A filled default DOES arrive here: the
 * merged `args` `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`)
 * produces are exactly what `paramBindingsFrom`
 * (`src/extension/theta-composition-producer.ts:102`) hands this function,
 * defaulted fields included, and for a value in WIRE form this pass is what
 * re-tags a named-enum position / re-brands a schema-typed one.
 * `runtime-value-model.md:37` states the same mechanism: a default projected
 * to wire form crosses the binder-`args` inbound boundary like any other
 * validated value, so a named-enum position is retagged and a schema-typed
 * one rebranded here rather than arriving pre-tagged from frontmatter.
```

The two four-line closing sentences differ only in `re-tagged`/`retagged` and
`re-branded`/`rebranded`.

docs/spec_topics/runtime-value-model.md:37 — the source both copies paraphrase,
verbatim in the corpus already:

```
A frontmatter `params:` default is written in the [Theta literal sublanguage](./grammar.md#theta-literal-sublanguage) and parsed as an ordinary Theta value at frontmatter-parse time. When a slash invocation omits the corresponding positional argument, the runtime projects that value to its wire form, merges it into binder `args` for the omitted field, and the merged record — defaulted fields included — crosses the binder-`args` inbound boundary the rule above already covers, where a named-enum position is retagged and a schema-typed one rebranded exactly as for a binder-supplied value.
```

## Why this is a problem
The same claim is written three times: once in the spec, once per module, and
twice within each module's own paragraph. Each copy is an independently
maintainable statement of one rule, so a later change to the rule has three
places to reach and two of them are prose restatements that carry no additional
fact — the second sentence of each copy adds nothing to the first beyond the
spec citation. The wire-translation.ts copy is additionally about a boundary
that lives in another module (`bindParamsInbound`), not about anything this
module declares.

## Suggested direction (non-binding, optional)
One of the two modules is where a reader of `bindParamsInbound` will look; the
other can carry the spec pointer without the restatement.

## False-positive check
- Duplicate search: `grep -rn "states the same mechanism" --include=*.ts src/`
  — 2 hits, `src/runtime/wire-translation.ts:40` and
  `src/runtime/inbound-boundary.ts:145`; those are the only two copies in `src/`.
- Verified the spec citation resolves: `sed -n '37p'
  docs/spec_topics/runtime-value-model.md` holds the paragraph quoted above, so
  the pointer is live and both restatements are optional relative to it.
- Verified this is prose only, not code: neither copy is read by any tool;
  `grep -n "typedoc\|jsdoc\|api-extractor" package.json` returns nothing, and no
  test reads either module's comment text (searched `tests/` for
  `wire-translation.ts` / `inbound-boundary.ts` source-text reads — the hits are
  imports of the exported functions, not file reads).
- Verified the paragraph's factual content is currently true (so this is
  redundancy, not staleness): `bindParamsInbound`
  (`src/runtime/inbound-boundary.ts:150`) routes the merged record through
  `decodeInboundValue` → `translateInbound`, and
  `fillDefaultsAndRevalidate` exists at `src/binder/defaulting.ts`.

## Triage
