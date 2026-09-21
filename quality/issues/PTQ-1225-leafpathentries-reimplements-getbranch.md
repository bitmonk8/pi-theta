---
id: PTQ-1225
title: leafPathEntries hand-rolls the leaf-path walk that ctx.sessionManager.getBranch() already provides at its only production call site
lens: D8
status: open
verdict: confirmed
locations:
  - src/extension/live-prompt-query-driver.ts:1216-1245
  - src/extension/production-theta-producer.ts:2299-2306
sites: 2
fix_scope: cross-module
d8_class: reimplemented
d8_host: src/extension/live-prompt-query-driver.ts#leafPathEntries
wave: qw20260921183818
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-21
---

# leafPathEntries hand-rolls the leaf-path walk that ctx.sessionManager.getBranch() already provides at its only production call site

## Observation
`leafPathEntries` (src/extension/live-prompt-query-driver.ts:1225-1245, 21 LOC) rebuilds
the chronological root-to-leaf session-entry path: it constructs a fresh
`Map` over ALL entries, resolves the leaf, walks the `parentId` chain, and
reverses. Its own doc-comment says it mirrors "pi's own `buildSessionPath`
(session-manager.js) EXACTLY". `buildSessionPath` is indeed unexported by the
pi package — but the package's PUBLIC `SessionManager.getBranch(fromId?)`
performs the identical walk over the manager's maintained `byId` index, and
`getBranch` is included in `ReadonlySessionManager`, the exact type of
`ctx.sessionManager` at the sole production call site.

## Evidence
The hand-rolled walk — src/extension/live-prompt-query-driver.ts:1225-1245:

```ts
function leafPathEntries(
  entries: readonly SessionEntry[],
  leafId: string | null | undefined,
): readonly SessionEntry[] {
  if (leafId === null) {
    return [];
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const leaf = (leafId !== undefined ? byId.get(leafId) : undefined) ?? entries[entries.length - 1];
  if (leaf === undefined) {
    return [];
  }
  const path: SessionEntry[] = [];
  let current: SessionEntry | undefined = leaf;
  while (current !== undefined) {
```

The sole production call site — src/extension/production-theta-producer.ts:2305-2306:

```ts
    const readContextPath = (): readonly SessionEntry[] =>
      leafPathEntries(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
```

`ctx` at that site is `ExtensionCommandContext` (production-theta-producer.ts:2178),
whose `sessionManager` is the package's read-only pick:

- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:218` —
  `sessionManager: ReadonlySessionManager;`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts:136` —
  `ReadonlySessionManager = Pick<SessionManager, ... | "getBranch" | ...>`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts:250-256` —
  ```
  /**
   * Walk from entry to root, returning all entries in path order.
   * Includes all entry types (messages, compaction, model changes, etc.).
   * Use buildSessionContext() to get the resolved messages for the LLM.
   */
  getBranch(fromId?: string): SessionEntry[];
  ```

Feature-for-feature comparison against the call site's real needs
(`getBranch()` with no argument defaults to the manager's live leaf):

| case | leafPathEntries(getEntries(), getLeafId()) | ctx.sessionManager.getBranch() |
|---|---|---|
| leafId `null` | `[]` | `[]` (startId null ⇒ no leaf) |
| leafId resolves | parentId walk, reversed | identical walk over maintained `byId`, reversed |
| leafId `undefined` | falls back to last entry | unreachable: `getLeafId()` returns `string \| null`, never `undefined` |
| leafId not in index | falls back to last entry | unreachable at this site: the leafId comes from the SAME live manager whose `byId` index is maintained by `_appendEntry`/`_buildIndex` |

The two divergent rows are dead at the only caller — both inputs are read off
the same live `SessionManager` in the same expression.

Cost at the call site: `readContextPath` is consumed by `thisTurnSettled`
inside the driver's poll predicates (live-prompt-query-driver.ts:902 and :997),
polled every `POLL_INTERVAL_MS = 10` ms for up to `TURN_END_POLL_BOUND =
180000` polls (:1085, :1109). Each poll pays `getEntries()` (a filtered copy
of every entry) plus a fresh `Map` construction over all N entries;
`getBranch()` reads the manager's already-maintained index and takes no
entries array at all.

## Why this is a problem
A facility a package already depended on provides — the chronological
root-to-leaf entry path, documented on the public surface the call site
already holds (`ctx.sessionManager`, `ReadonlySessionManager` pick includes
`getBranch`) — is hand-rolled as 21 LOC plus a threading seam
(`#readContextPath` field, constructor dep, and the `readContextPath`
closure in the producer), and the reimplementation's own comment concedes it
mirrors the package's private helper "EXACTLY". The bug-0482 rationale in the
comment argues only that `#readMessages()` (the compaction-hoisted built
`Message[]`) cannot stand in — it never considers `getBranch`, which returns
exactly the un-hoisted chronological path the predicate needs ("Includes all
entry types (messages, compaction, model changes, etc.)"). The hand-rolled
copy is also the more expensive shape at its only call site (per-10 ms-poll
O(N) map rebuild vs. the maintained index).

## Suggested direction (non-binding, optional)
Unproven hypothesis: wire `readContextPath` as
`() => ctx.sessionManager.getBranch()` and delete `leafPathEntries` (its
export at live-prompt-query-driver.ts:1714 has no test importers). If the
SDK-member closure audit (sdk-inventory.ts / inventory-closure-audit.ts)
pins the set of consumed `ctx.sessionManager` members, `getBranch` would need
adding to that inventory — a fix-stage detail, not an obstacle.

## False-positive check
- Reference search: `grep -rn leafPathEntries src tests` — declaration
  (:1225), module doc-comment, export list (:1714), and
  production-theta-producer.ts:27 (import) / :2306 (sole use). No test
  importers, so removing the export demotes nothing to test-only reach.
- Facility verified in the current dependency:
  `dist/core/session-manager.d.ts:256` (`getBranch`), `:136`
  (`ReadonlySessionManager` pick), `dist/core/extensions/types.d.ts:218`
  (`ctx.sessionManager` type); implementation `getBranch` walks `byId`
  parent chain and reverses — same output order as `leafPathEntries`.
- Spec check: conversation-drive.md PIC-70 / bug 0482 require the
  CHRONOLOGICAL leaf path un-reordered by the compaction hoist; `getBranch`'s
  own doc states it returns exactly that (all entry types, path order). No
  spec clause requires an independent walk; no `challenges_spec`.
- D2 precedents: the in-file D4 "adjudicated in-lane" comment
  (live-prompt-query-driver.ts:1146-1153) covers the settled-turn predicate
  vs. the live-test harness, not this function; no stated rationale anywhere
  addresses why the public `getBranch` was not used.
- Exemption check: no D8 exemption exists for this host (the two D8 rulings
  cover discovery-walk#enumerateDirectory and
  production-theta-producer#firstAdmittingArmProperties — different hosts and
  classes).
- Not already filed: searched the issue roster for
  leafPathEntries/getBranch/buildSessionPath — no match (PTQ-0405 and others
  concern test harness parseDoc reimplementations, unrelated).

## Triage
verdict: questionable — accounting verified: excerpts match at live-prompt-query-driver.ts:1225-1245 (21 LOC) and production-theta-producer.ts:2305-2306 (sole use; export :1714 has no test importers); `getBranch` is in the `ReadonlySessionManager` Pick (session-manager.d.ts:136/:256), `ctx.sessionManager` is that type (extensions/types.d.ts:218), and getBranch (session-manager.js:881-891) is the identical parentId walk + reverse over the maintained `byId`, with `getLeafId(): string | null` (:234) making the `undefined`/missing-id fallbacks unreachable in production; no D8 exemption for the host, no spec clause requires an independent walk, no existing issue tracks it — but the simpler shape is a design decision: 36 test files / 9 harness sites fake `ctx.sessionManager` as `{ getEntries, getLeafId: () => undefined }` with no `getBranch` (the b0482 witness at :104 leans on the undefined→last-entry fallback), so the fix relocates the walk into test doubles rather than deleting it — needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): confirmed - D8 wave-1 batch ruling; triage equivalence verification trusted.
