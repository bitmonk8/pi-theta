---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: WatcherTerminalRecoveryDeps.registry is a required dependency that armWatcherWithTerminalRecovery never reads (only voids)
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/watcher-recovery.ts:98-102
  - src/extension/watcher-recovery.ts:195-197
  - src/extension/hot-reload.ts:383-391
  - src/extension/hot-reload.ts:418-426
  - tests/b0313-terminal-note-burst-latch.test.ts:74-80
  - tests/watcher-terminated-recovery.test.ts:135-141
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# WatcherTerminalRecoveryDeps.registry is a required dependency that armWatcherWithTerminalRecovery never reads (only voids)

## Observation
`WatcherTerminalRecoveryDeps` declares a non-optional `registry:
ThetaRegistry` field. `armWatcherWithTerminalRecovery` is the sole consumer of
that deps type, and its only mention of the field is a `void deps.registry;`
statement whose adjoining comment says the registry is "deliberately
untouched". Because the field is required, every one of the eight call sites
in the repository (two production, six test) must construct or thread a
`ThetaRegistry` that the function ignores.

## Evidence
src/extension/watcher-recovery.ts:98-102 — the required field:
```ts
  /**
   * The live `ThetaRegistry` — kept live and dispatchable across the terminal
   * signal; the recovery path writes no drain-state tag against it.
   */
  readonly registry: ThetaRegistry;
```

src/extension/watcher-recovery.ts:195-197 — the only read, a discard:
```ts
    // (3) The `ThetaRegistry` is deliberately untouched: no drain-state tag is
    // written from this path, keeping it live and dispatchable.
    void deps.registry;
```

Call sites — exact search `grep -rn "armWatcherWithTerminalRecovery("
--include=*.ts src tests`: 8 call expressions, at
src/extension/hot-reload.ts:383 and :418,
tests/b0313-terminal-note-burst-latch.test.ts:74, and
tests/watcher-terminated-recovery.test.ts:135, :177, :270, :306, :328; each
supplies `registry:` (verified per site — the field is non-optional, so every
compiling call must). Production site 1, src/extension/hot-reload.ts:418-426:
```ts
  let unsub = armWatcherWithTerminalRecovery({
    watcher: terminalLatchWatcher,
    roots: deps.roots,
    onChange: (event) => debouncer.onWatcherEvent(event),
    registry: deps.registry,
    channel: deps.channel,
    staleLog,
    terminatedLog,
  });
```

Representative test site, tests/watcher-terminated-recovery.test.ts:135-141
(the test's later drain-state assertion at :163-166 reads its own local
`registry` variable, not anything the armed recovery did with the field):
```ts
    armWatcherWithTerminalRecovery({
      watcher: fw,
      roots: ["/root"],
      onChange: (event) => changes.push(event),
      registry,
      channel,
    });
```

## Why this is a problem
Vestigial field: the value is never read on any path — the single reference is
a `void` discard. The property the field documents ("the recovery path writes
no drain-state tag") holds trivially for a function that holds no reference to
the registry at all; holding a required reference in order to not use it
inverts that guarantee's cheapest proof. The cost is concrete: all eight call
sites must supply a `ThetaRegistry`, and the deps surface advertises a
collaborator relationship (recovery ↔ registry) that does not exist in the
code. The witness tests that assert the registry stays dispatchable
(tests/watcher-terminated-recovery.test.ts:163-166) assert against their own
local registry object and would be unaffected by the field's absence.

## Suggested direction (non-binding, optional)
Remove the `registry` field from `WatcherTerminalRecoveryDeps` and the `void
deps.registry;` discard, keeping the "(3) registry deliberately untouched"
posture as prose on the function doc (where PIC-55's no-drain-tag obligation is
already stated); drop the now-unneeded argument at the eight call sites.

## False-positive check
- Read search within the consumer: `grep -n "deps.registry"
  src/extension/watcher-recovery.ts` → one hit, the `void` discard at :197;
  `grep -n "registry" src/extension/watcher-recovery.ts` shows only the type
  import, the field declaration/doc, and that discard.
- Consumer search: `grep -rn "WatcherTerminalRecoveryDeps" --include=*.ts .`
  → declared and consumed only by `armWatcherWithTerminalRecovery` in
  watcher-recovery.ts (plus type imports at call-site files); no other reader
  could access the field.
- Call-site enumeration: `grep -rn "armWatcherWithTerminalRecovery("
  --include=*.ts src tests` → 8 calls (listed above); each was inspected and
  passes `registry:`.
- String-keyed/dynamic access: no `["registry"]` or `"registry"` keyed access
  into this deps object anywhere in src/, tools/, or tests/.
- Test-only-caller rule: not applicable — the field is unread on every path,
  including test paths; tests assert on their own local registry object, not
  on any use the function makes of the field.
- Git intent: `git log -S "void deps.registry" --
  src/extension/watcher-recovery.ts` → single commit e659066a ("V9q-T —
  watcher post-error terminal recovery posture tests (PIC-55)"); the field was
  born discarded and the paired implementation never added a read.
- Prior-filing check: quality/intake/qw20260907130901-d2-06-theta-extension-
  deps-registry-unread.md covers a different unread registry field
  (`ThetaExtensionDeps.registry` in src/extension/factory.ts); this finding's
  field, file, and call sites are disjoint from it.

## Triage
verdict: questionable — field at :102, the `void deps.registry` discard at :197 and all 8 registry-passing call sites verify verbatim, but the field is the deliberate subject of PIC-55's MUST-NOT witness (watcher-terminated-recovery.test.ts:163-167 asserts no drain tag on the registry it handed in), which removal renders tautological rather than "unaffected" as claimed; structural-vs-witness enforcement of that clause is a human call (triage: claude-opus-5)
verdict: questionable — every mechanical fact reproduces (field :98-102, `void deps.registry` :197 as the sole reference, `WatcherTerminalRecoveryDeps` consumed only by the arm function, 8 registry-passing call sites with hot-reload drifted to :399/:453 by bug 0471, no string-keyed access), but git shows the discard is not a forgotten stub leftover: e659066a voided three collaborators and implementation commit 49d517ba removed the other two voids while consciously re-commenting this one as the code anchor for PIC-55's "MUST NOT write the ThetaRegistry drain-state tag from this path" clause, and the candidate's decisive "unaffected" claim is only outcome-true — without the field, watcher-terminated-recovery.test.ts:163-166 asserts no drain tag on a registry the SUT never received, so the witness must be reworded rather than left as-is; whether that MUST-NOT is better enforced structurally (no reference) or by held-reference witness is a human call, same shape as sibling d2-06 (triage: claude-opus-5)
