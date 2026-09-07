---
id: pending
title: "Three doc comments in production-theta-producer.ts sit stacked above declarations they do not describe, while their real subjects are undocumented or documented elsewhere"
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:722-752
  - src/extension/production-theta-producer.ts:1380-1398
  - src/extension/production-theta-producer.ts:4572-4581
sites: 3
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three doc comments in production-theta-producer.ts sit stacked above declarations they do not describe, while their real subjects are undocumented or documented elsewhere

## Observation

At three places in the file, two `/** … */` blocks are stacked directly on top
of one declaration. In each case the first block describes a different
declaration — one that now sits further down undocumented, or that has since
received its own newer doc block. Later insertions between a doc comment and
its subject left the comments stranded as dangling narration on the wrong code.

## Evidence

Site 1 — src/extension/production-theta-producer.ts:722-744. The first block
describes `BinderForcedToolDispatch` ("the resolved binder model, the rendered
V11d system prompt, … the memoising envelope-validator accessor" — exactly its
seven members), but `interface MergedDeclaredDefaults` was inserted between the
comment and its subject; `BinderForcedToolDispatch` at line 744 has no doc of
its own:

```ts
/**
 * The per-dispatch binder forced-tool call ingredients (binder-inference.md
 * §"Binder inference call"), built ONCE per slash invocation and reused across
 * every budgeted attempt: the resolved binder model, the rendered V11d system
 ...
 */
/**
 * The post-default-merge outcome `runBinder` routes on: the merged `args`, the
 ...
 */
interface MergedDeclaredDefaults {
```

```ts
interface BinderForcedToolDispatch {
  readonly model: Model<Api>;
```

Site 2 — src/extension/production-theta-producer.ts:1380-1398. The first block
describes `#emitBinderFailureNote` ("Emit the mapped binder failure-mode system
note (BND-3)…"), but it precedes `#buildBinderSessionContext`, which carries its
own correct BNDR-10 doc immediately after. `#emitBinderFailureNote` itself is
defined at line 1463 with its own, newer doc ("Bug 0397 §Fix: the
binder-failure note is a group-A always-log member…", lines 1449-1462), so the
stranded block is a stale duplicate:

```ts
  /**
   * Emit the mapped binder failure-mode system note (BND-3) on the
   * theta-system-note channel: `needs_info` / `ambiguous` render their
   * fixed-phrase row with the model's message; a non-parse / empty-message reply
   * is the malformed-envelope row (`could not parse arguments`). The raw
   * envelope JSON is NEVER surfaced.
   */
  /**
   * BNDR-10 (binder/binder-model-and-context.md §Binder context): build the
   ...
   */
  #buildBinderSessionContext(
```

Site 3 — src/extension/production-theta-producer.ts:4572-4581. The first block
describes `callableSetPiToolNames` ("QTL-4. The underlying Pi-tool names in the
theta's frozen `tools:` callable set…"), but it precedes
`surfaceCalleeFinalValue` (which carries its own FN-5 doc immediately after);
`callableSetPiToolNames` at line 4640 has no doc of its own:

```ts
/**
 * QTL-4. The underlying Pi-tool names in the theta's frozen `tools:` callable set
 * — the host tool each `pi-tool` entry dispatches to (an `as`-rename entry
 ...
 */
/**
 * FN-5 (invocation.md §Final-value propagation across callees): project an
 ...
 */
function surfaceCalleeFinalValue(execution: BodyExecution): ResultValue {
```

```ts
function callableSetPiToolNames(
  theta: ConversationBindInput["theta"],
): readonly string[] {
```

## Why this is a problem

Leftover narration detached from its subject. Each stranded block is dead
weight in the position it occupies: a reader (or doc tooling) attributes the
first block's claims to `MergedDeclaredDefaults`, `#buildBinderSessionContext`,
or `surfaceCalleeFinalValue`, none of which it describes. Site 2 is doubly
stale — its subject has a newer authoritative doc at line 1449, so the old text
is a superseded duplicate; sites 1 and 3 leave their true subjects
(`BinderForcedToolDispatch`, `callableSetPiToolNames`) undocumented while their
descriptions float elsewhere.

## Suggested direction (non-binding, optional)

Reattach the site-1 and site-3 blocks to their declarations
(`BinderForcedToolDispatch`, `callableSetPiToolNames`) and delete the site-2
block, which is superseded by the Bug-0397 doc on `#emitBinderFailureNote`.

## False-positive check

- Verified each stranded block's content against the declaration it precedes
  and the declaration it describes: site 1 enumerates
  `BinderForcedToolDispatch`'s exact member set (model / systemPrompt /
  envelopeSchema / slug / toolName / seed / envelopeValidator), not
  `MergedDeclaredDefaults`'s three members; site 2 describes note emission,
  not session-context building (and `#emitBinderFailureNote` at 1449-1476 has
  its own current doc); site 3 describes a name-list derivation with "yields
  `[]`" semantics matching `callableSetPiToolNames`, not `surfaceCalleeFinalValue`.
- Checked that no doc generator or lint rule in the repo consumes stacked
  leading blocks intentionally (eslint.config.js carries only the three
  theta-local rules; no jsdoc tooling in package scripts).
- Git intent: `git log -S "QTL-4. The underlying Pi-tool names"` shows the
  block predates the Loom→Theta rename (2bc69157); the interposing
  declarations (`MergedDeclaredDefaults`, `surfaceCalleeFinalValue`, the
  BNDR-10 doc) landed with later features, consistent with insertion-detachment
  rather than intent.

## Triage

