---
id: PTQ-0150
title: watcher-recovery.ts exports WATCHER_TERMINATED_MESSAGE and watcherTerminatedDiagnostic, which nothing outside the module imports
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/watcher-recovery.ts:43-51
  - src/extension/watcher-recovery.ts:53-64
  - src/extension/watcher-recovery.ts:163
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# watcher-recovery.ts exports WATCHER_TERMINATED_MESSAGE and watcherTerminatedDiagnostic, which nothing outside the module imports

## Observation
`watcher-recovery.ts` publishes two exports whose only consumers are inside the
module: `WATCHER_TERMINATED_MESSAGE` is read once, by
`watcherTerminatedDiagnostic`, and `watcherTerminatedDiagnostic` is called once,
by `armWatcherWithTerminalRecovery`'s terminal-signal callback. No module in
`src/`, `extensions/`, or `tools/` imports either name, and no test imports them
either; the message constant's own doc records why no test will ("Tests source
the expected string from the registry rather than this constant"). The three
importers of the module take `armWatcherWithTerminalRecovery`,
`WatcherTerminatedLatch`, and `WATCHER_TERMINATED_CODE` only.

## Evidence
src/extension/watcher-recovery.ts:43-51 — the exported message constant and the
doc sentence stating tests do not source it:

```ts
/**
 * The stable, location-less message the `theta/runtime/watcher-terminated`
 * diagnostic carries, sourced verbatim from the *Message* column of the runtime
 * diagnostics registry (diagnostics/code-registry-runtime.md). Tests source the
 * expected string from the registry rather than this constant, per the
 * *Diagnostic message anchors* rule.
 */
export const WATCHER_TERMINATED_MESSAGE =
  "theta watcher terminated; hot-reload halted until /reload";
```

src/extension/watcher-recovery.ts:53-64 — the exported builder and its only
read of that constant:

```ts
/**
 * Construct the single `theta/runtime/watcher-terminated` diagnostic emitted on
 * the terminal-signal path. Location-less (a watcher-lifecycle event, not a
 * source-position defect).
 */
export function watcherTerminatedDiagnostic(): Diagnostic {
  return {
    severity: "error",
    code: WATCHER_TERMINATED_CODE,
    message: WATCHER_TERMINATED_MESSAGE,
  };
}
```

src/extension/watcher-recovery.ts:163 — the single call, module-internal:

```ts
      const diagnostic = watcherTerminatedDiagnostic();
```

Reference searches (word-boundary, across `src/`, `tests/`, `tools/`,
`extensions/`, `docs/`, `skills/`, `config/`, all extensions):
`grep -rnw WATCHER_TERMINATED_MESSAGE` → 2 hits, both the declaration and the
in-module read above; `grep -rnw watcherTerminatedDiagnostic` → 2 hits, the
declaration and the in-module call above.

## Why this is a problem
Dead export surface, proven dead: both values are alive inside the module, but
the `export` modifiers reach nothing — no importer in `src/`, `extensions/`,
`tools/`, or `tests/`, no namespace import, no barrel re-export, no
string-keyed access. The message constant is a documented never-imported case:
the *Diagnostic message anchors* rule keeps tests on the registry, so the only
possible external consumer is excluded by design. An exported name advertises a
cross-module contract; publishing two that no consumer can or does use makes the
module's apparent API wider than its real one.

## Suggested direction (non-binding, optional)
Drop the two `export` modifiers so both stay module-private; the terminal-note
path is unchanged.

## False-positive check
- Reference searches run: `grep -rnw "WATCHER_TERMINATED_MESSAGE"` and
  `grep -rnw "watcherTerminatedDiagnostic"` over `src`, `tests`, `tools`,
  `extensions`, `docs`, `skills`, `config` for `*.ts`, `*.md`, `*.json` — only
  the four in-module hits cited above.
- Importer search: `grep -rn "watcher-recovery" src tests tools extensions
  --include=*.ts` → code importers are src/extension/hot-reload.ts:41
  (`armWatcherWithTerminalRecovery`, `WatcherTerminatedLatch`),
  tests/b0313-terminal-note-burst-latch.test.ts:2
  (`armWatcherWithTerminalRecovery`), and
  tests/watcher-terminated-recovery.test.ts:6-9
  (`armWatcherWithTerminalRecovery`, `WATCHER_TERMINATED_CODE`); the remaining
  hits are prose comments. None names either identifier here.
- Tests-only-caller rule considered: not applicable — no test references either
  name, so this is not test-only-reachable production code. The one test that
  asserts the terminal note's text imports `registryMessage` from
  tools/code-registry (tests/watcher-terminated-recovery.test.ts:5), matching the
  constant's own doc.
- Dynamic / re-export access: `grep -rn "export \*\|import \* as"` filtered for
  this module → 0 hits; `grep` for `"WATCHER_TERMINATED_MESSAGE"` /
  `"watcherTerminatedDiagnostic"` as quoted strings across the repo trees → 0
  hits.
- Duplicate check: `grep -rn "watcher-recovery" quality/intake` → the registry
  `deps.registry`-unread finding (qw20260907130901-d2-03), the system-note
  four-arm comment finding (qw20260907130901-d2-05), and the stub-narration
  finding (qw20260907183353-d2-07, citing :20-23); none covers these exports.

## Triage
verdict: confirmed — excerpts byte-exact at :43-51/:53-64/:163; my own greps give 2 in-module hits per name with no barrel `export *`, namespace import, or quoted-string access, `git log -S` over tests/ shows neither name was ever imported, and every other exported `*Diagnostic` constructor and `*_MESSAGE` constant in src/ reaches at least one further file, so these two export modifiers are proven-dead outliers rather than a repo convention (triage: claude-opus-5)
