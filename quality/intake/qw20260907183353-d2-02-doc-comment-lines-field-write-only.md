---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: DocComment.lines is written once by scanDocComments and read by nothing in src, extensions, tools, or tests
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:900-905
  - src/parser/theta-document.ts:2190
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# DocComment.lines is written once by scanDocComments and read by nothing in src, extensions, tools, or tests

## Observation
The `DocComment` AST node carries a `lines: readonly string[]` field holding
the `///` run's content lines. `scanDocComments` is its only writer. The run's
content reaches every actual consumer through a different channel: the same
function separately joins the content into a `DocDescriptionAttachment`
(`description: joinDocComment(content)`), and `attachDocDescriptions` lowers
that onto `SchemaDecl` / `EnumDecl` / field `description` fields. Every
consumer of a `"doc-comment"` statement node — the statement executor, the
`.thetalib` form map, the typed-query walk, the placement walks, and the one
test that touches the node — dispatches on `kind` alone and never reads
`lines`.

## Evidence
src/parser/theta-document.ts:900-905 (the field):

```ts
/** A `///` doc-comment run (`DocComment`; descriptions.md). */
export interface DocComment extends NodeBase {
  readonly kind: "doc-comment";
  readonly lines: readonly string[];
}
```

src/parser/theta-document.ts:2190 (the sole write; the same `content` array
feeds the attachment channel at :2219):

```ts
    nodes.push({ kind: "doc-comment", lines: content, range });
```

Reader searches (all zero hits for a `lines` read on a doc-comment node):
- `grep -rn "\.lines" src --include=*.ts` → 1 hit,
  src/extension/system-note-renderer.ts:32 — a `[...lines]` spread of a local
  variable, not a property read.
- `grep -rn "\.lines" tests --include=*.ts` (spread hits excluded) → hits only
  on test-local row/region objects (`r.lines`, `region.lines` in
  b0046/b0262/etc. table harnesses), none on a parsed statement.
- `grep -rn '\["lines"\]' src tests --include=*.ts` → 0 hits (no string-keyed
  access).
- `grep -rn '"doc-comment"' src --include=*.ts` → theta-document.ts (the
  construction and two kind-switch arms) and
  src/runtime/statement-executor.ts:2183, whose arm returns
  `{ kind: "normal", value: null }` without touching the node.
- The one test asserting on the node, tests/whole-program-parser.test.ts:292,
  checks `body.statements.some((s) => s.kind === "doc-comment")` — kind only.

## Why this is a problem
A write-only field, proven write-only: one writer, zero readers across src/,
tests/, and string-keyed access, for all visible history (the same searches
against the squash-root commit 2bc69157 also find no reader). The module's own
comments describe non-lowering doc text as "accepted-but-AST-only" — i.e. the
field is a data slot retained for no current consumer — so every parse copies
each `///` run's content into a payload nothing reads, while the real
consumers take the content from the parallel attachment channel. The field
also invites the false belief that reading `DocComment.lines` is how doc text
is consumed downstream.

## Suggested direction (non-binding, optional)
Either drop the field (the node's `kind` + `range` carry everything current
consumers use, and the attachment channel carries the content), or leave it
only if a concrete consumer is planned; the "accepted-but-AST-only" comments
would then name the field as deliberately consumer-less.

## False-positive check
- Reference searches: `.lines` across src/ and tests/ (hits enumerated above,
  none a DocComment read); `["lines"]` string-keyed access (0); `"doc-comment"`
  kind dispatches in src (all inert arms); `\bDocComment\b` imports outside
  theta-document.ts (none — the only non-defining hits are prose mentions and
  the distinct identifiers `DocCommentSite` / `checkDocCommentPlacement` /
  `joinDocComment` in descriptions.ts).
- Tests-only-caller check: not even tests read the field —
  whole-program-parser.test.ts pins node presence by `kind` alone, so this is
  not the test-only-reachable case the lens exempts.
- Generic-serialization check: no src code JSON-stringifies or structuredClones
  the parsed statement list (the `JSON.stringify(document, …)` in
  src/runtime/subagent-envelope.ts serialises a wire result value, not the
  AST), so the field does not flow anywhere through generic traversal.
- Spec check: grammar.md:397 / spec_topics/grammar.md:193 define `DocComment`
  as a source production (run of `///` lines, joined per descriptions.md);
  neither mandates an AST field carrying the raw lines. The joined form is
  what descriptions.md specifies, and it flows through the attachment channel.
- Git intent: `git grep "\.lines" 2bc69157 -- src/parser tests` → no reader at
  the squash root either; the field never had a consumer in visible history.
- Deliberate-retention caveat, stated for triage: comments at
  theta-document.ts:2215-2218 and :868-871 say variant/fn doc text "stays
  AST-only via the floating `DocComment` node", which frames the retention as
  intentional; the mechanical fact stands that no code reaches the field.

## Triage
