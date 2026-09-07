---
id: pending
title: BypassParamsField's doc says the record "Feeds BOTH" the bypass classification and the binder prompt line; eleven further production sites read it
lens: D2
status: intake
verdict: pending
locations:
  - src/binder/binder-envelope.ts:161-165
  - src/extension/import-static-checks.ts:1548
  - src/extension/production-composition.ts:1931-1945
  - src/extension/production-theta-producer.ts:1186
  - src/extension/production-theta-producer.ts:4196
  - src/parser/theta-document.ts:1346
  - src/parser/theta-document.ts:6751
sites: 7
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# BypassParamsField's doc says the record "Feeds BOTH" the bypass classification and the binder prompt line; eleven further production sites read it

## Observation

`BypassParamsField` is the element type of the parser's `ParsedParams.fields`
array — the per-`params:`-field record every load-time and runtime consumer of a
theta's declared parameters reads. Its doc-comment states a closed two-consumer
roster: the load-time bypass classification and the binder system prompt's
per-field Parameters line. Both of those are live, but eleven further production
sites read fields off these records today — the import-time static checks (five
sites), the callee arity / per-argument type-mismatch projection, the
`bind_echo` echo-parameter build, the subagent param-name collection, and three
sites in the theta-document pass. The sentence reads as an exhaustive statement
of what the record feeds and is now nine consumers short.

## Evidence

src/binder/binder-envelope.ts:161-165 — the claim:

```ts
/**
 * One declared `params:` field. Feeds BOTH the load-time bypass classification
 * (`classifyBinderBypass`) and the binder system prompt's per-field Parameters
 * line (the V11d `default=<literal>` requirement token rides `defaultSource`).
 */
export interface BypassParamsField {
```

The record's array is published on the parser's `ParsedParams`
(src/parser/frontmatter.ts:125-127), which is how every site below reaches it:

```ts
  /** The per-field bypass-classification input, in declaration order. */
  readonly fields: readonly BypassParamsField[];
}
```

Consumers the doc does NOT name, each reading a field off these records:

src/extension/import-static-checks.ts:1548 — reads `wireName` and `type`:

```ts
      (input.frontmatter.params?.fields ?? []).map((field) => [field.wireName, field.type]),
```

src/extension/production-composition.ts:1931-1945 — reads `hasDefault`,
`optional`, `type`, `wireName` for the callee arity and per-argument
type-mismatch checks:

```ts
  const fields = document.frontmatter.params?.fields ?? [];
  const requiredCount = fields.filter(
    (field) => !field.hasDefault && field.optional !== true,
  ).length;
```

```ts
    fields: fields.map((field) => ({ typeSource: field.type, name: field.wireName })),
```

src/extension/production-theta-producer.ts:1186 — the `bind_echo` echo-parameter
build:

```ts
    const echoParams: EchoParam[] = params.fields.map((field) => {
```

src/extension/production-theta-producer.ts:4196 — the subagent callee param-name
set:

```ts
    const paramNames = callee.frontmatter.params?.fields.map((field) => field.wireName) ?? [];
```

src/parser/theta-document.ts:1346 — the type-layer checks' `paramsFields`
channel (name + declared type source):

```ts
    (frontmatter?.params?.fields ?? []).map((f) => ({ name: f.wireName, typeSource: f.type })),
```

src/parser/theta-document.ts:6751 — a binder-name root set:

```ts
    for (const f of frontmatter.params?.fields ?? []) {
      roots.add(f.wireName);
    }
```

Site count: `grep -rnE "params(\?)?\.fields" src extensions tools --include=*.ts`
returns 17 hits. Two are prose comments (import-static-checks.ts:1802,
frontmatter.ts:245). Four are the two named consumers
(`classifyBinderBypass` at production-composition.ts:1180,
production-theta-producer.ts:918 and frontmatter.ts:2306; `binderPromptParamField`
at production-theta-producer.ts:1024). The remaining eleven are unnamed
consumers: import-static-checks.ts:1548, :1811, :1824, :1837, :1851;
production-composition.ts:1931; production-theta-producer.ts:1186, :4196;
theta-document.ts:1346, :6751, :7858.

## Why this is a problem

Historical narration: the "Feeds BOTH … and …" sentence records the record's
consumer set as it stood when the binder seam introduced it and has not tracked
the nine adoptions since. A closed two-item roster on a widely-shared record
type is load-bearing for a reader deciding what a change to any field means —
for instance, the doc's own note that `type` is "the field's declared surface
type" is consumed verbatim by the per-argument type-mismatch checks
(production-composition.ts:1942-1945 spells out that dependency) and by the
type-layer channel (theta-document.ts:1346), neither of which the sentence
admits exists. The sibling declaration in frontmatter.ts:125-126 repeats the
same undercount ("The per-field bypass-classification input"), so a reader gets
the stale roster from both ends.

## Suggested direction (non-binding, optional)

State the record's role without enumerating its consumers ("the per-field
`params:` record every load-time and runtime consumer of declared parameters
reads"), or update the enumeration to the current set.

## False-positive check

- Reader enumeration: `grep -rnE "params(\?)?\.fields" src extensions tools
  --include=*.ts` — 17 hits, every one classified above (2 comments, 4 named
  consumers, 11 unnamed).
- Type-identifier search: `grep -rn "BypassParamsField" src extensions tools
  tests --include=*.ts` — declaration (binder-envelope.ts:166), signature use
  (:205), the parser's array field (frontmatter.ts:126, :1570, and the import at
  :56), the producer's mapper signature (production-theta-producer.ts:304,
  :768), a prose reference (production-composition.ts:1944), a prose reference
  (type-layer-checks.ts:318), and test-side type imports.
- Re-export check: `grep -rn "export \*" src extensions tools --include=*.ts`
  returns nothing — no export-star barrel could route additional consumers.
- Deadness is not claimed: the interface and both named consumers are live; the
  claim is that the enumeration undercounts.
- Test-only check: not applicable — every cited unnamed consumer is production
  code under src/.
- Scope: the finding's subject is the comment in the reviewed file
  (src/binder/binder-envelope.ts); the out-of-scope files are cited only as the
  evidence for the consumer count.

## Triage
