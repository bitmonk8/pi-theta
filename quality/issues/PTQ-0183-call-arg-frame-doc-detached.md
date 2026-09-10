---
id: PTQ-0183
title: callArgFrame's doc comment sits stacked above rewriteCallWithClause's own doc comment and declaration, thirty lines away from the undocumented callArgFrame it describes, since the RFC 0009 commit inserted the new method between the two
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/query-schema-resolve.ts:544-565
  - src/parser/query-schema-resolve.ts:582-584
sites: 1
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# callArgFrame's doc comment sits stacked above rewriteCallWithClause's own doc comment and declaration, thirty lines away from the undocumented callArgFrame it describes, since the RFC 0009 commit inserted the new method between the two

## Observation
In `QuerySchemaResolveWalk`, two `/** … */` blocks appear back to back at
:544-553 and :554-564, followed by the declaration of `rewriteCallWithClause`
at :565. The first block begins "The `call-arg` frame for argument `index` of
a call to `callee`" and describes `callArgFrame`'s parse-time limitation; the
second describes `rewriteCallWithClause`. `callArgFrame` itself is declared at
:584 with no doc comment above it. Before commit 96303cc3 (RFC 0009) the first
block sat directly above `callArgFrame`; that commit inserted
`rewriteCallWithClause` and its doc between them.

## Evidence
src/parser/query-schema-resolve.ts:544-565 — the two stacked blocks and the
declaration they precede:

```ts
  /**
   * The `call-arg` frame for argument `index` of a call to `callee`.
   *
   * DOCUMENTED PARSE-TIME LIMITATION (query-forms.md:41): only a call to a local
   * `fn` in this file is statically resolvable to a typed parameter. A tool call
   * is also a `CallExpr`, but tool signatures live in the host tool registry,
   * not in this single-file parse; likewise `invoke` targets external `.theta`
   * files resolved at load/runtime. Those args therefore have no resolvable
   * parameter type here and stay untyped (the walk stops at the call boundary).
   */
  /**
   * Rewrite a call-site `with { cwd: … }` clause's value expressions (RFC 0009),
   * so a `@`-query inside one resolves exactly as one inside an argument does
   * (invocation.md INV-6: the value is a full expression, judged by the same
```
```ts
   * `exactOptionalPropertyTypes` distinguishes from an omitted key).
   */
  private rewriteCallWithClause(
```

src/parser/query-schema-resolve.ts:582-584 — the method the first block
describes, with no doc of its own:

```ts
  }

  private callArgFrame(callee: string, index: number): OriginFrame {
```

History: `git show 96303cc3^:src/parser/query-schema-resolve.ts | grep -n -A2 "stay untyped (the walk stops at the call boundary)."`
→ the block closed at old :550 and old :551 was
`private callArgFrame(callee: string, index: number): OriginFrame {`.
`git blame -L 544,565` → :544-553 from 72272a20 (2026-07-12) and 2bc69157,
:554-565 from 96303cc3 (2026-09-09).

## Why this is a problem
Detached doc comment. A JSDoc block attaches to the declaration that follows
it; here the block describing `callArgFrame`'s "documented parse-time
limitation" is followed by another JSDoc block and then `rewriteCallWithClause`,
so tooling and readers attribute the wrong description to the new method (or
none), while `callArgFrame` — referenced by name from two comments at :481 and
:559 as the place that explains the limitation — carries no description at
its declaration. The same file's other methods (`rewriteBlock`, `rewriteFnBlock`,
`rewriteLoopBody`, `rewriteExpr`, `recordDirectLetPropagation`, `resolveQuery`,
`checkLetMismatch`) each have their doc block directly above the declaration.

## Suggested direction (non-binding, optional)
Move the first block down to sit directly above `callArgFrame` at :584 (or
move `rewriteCallWithClause` and its doc below `callArgFrame`).

## False-positive check
- Confirmed the first block is not an intentional shared preface for both
  methods: its first sentence names `callArgFrame`'s parameters (`index`,
  `callee`) and return (the `call-arg` frame), which `rewriteCallWithClause`
  does not have; the second block separately explains that the clause uses
  "the untyped `call-arg`, not `callArgFrame`".
- Confirmed `callArgFrame` has no other doc: :583 is a blank line and :582 is
  the closing brace of `rewriteCallWithClause`.
- Not a duplicate: PTQ-0049 (fixed) concerns three detached docs in
  src/extension/production-theta-producer.ts; PTQ-0022, PTQ-0084, PTQ-0090
  cite other files. No filed finding cites query-schema-resolve.ts:544-565.
  PTQ-0006 and PTQ-0052 cite other sites in this file.

## Triage
verdict: confirmed — every cited fact reproduces: the JSDoc naming `callArgFrame`'s `index`/`callee` params and `call-arg` return sits at :544-553, is followed directly by rewriteCallWithClause's own JSDoc (:554-564) and declaration (:565), and `callArgFrame` at :584 has only `}`/blank above it; `git show 96303cc3^` places the old `*/` at :550 immediately above `private callArgFrame` at :551 and the 96303cc3 hunk (`@@ -548,6 +551,36`) inserts the new method between them, so the detachment is insertion residue not intent; :481 and :559 still direct readers to `callArgFrame` for a limitation its declaration no longer carries; all seven named siblings keep their doc directly above their declaration; no filed finding cites :544-565 or either method (PTQ-0006/0052/0091/0107/0137 cite other sites in this file) — same accepted class as PTQ-0022/0024/0049/0084 (triage: claude-opus-5)
