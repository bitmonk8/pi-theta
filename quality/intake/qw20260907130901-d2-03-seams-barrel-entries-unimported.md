---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Six of the nineteen type names re-exported by the seams barrel are imported through the barrel by no module
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/seams/index.ts:6
  - src/seams/index.ts:7-12
  - src/seams/index.ts:15-22
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Six of the nineteen type names re-exported by the seams barrel are imported through the barrel by no module

## Observation
`src/seams/index.ts` re-exports nineteen type names. Exactly two files in the
repository import from the barrel: `src/runtime-root.ts` (the seven seam
interfaces) and `tests/di-seam-skeleton.test.ts` (those plus six supporting
types). Six re-exported names — `CheckpointKind`, `CheckpointSite`,
`ValidationError`, `FileWatchEventKind`, `WatchTermination`,
`OnWatchTerminate` — are imported through the barrel by nothing; every consumer
of those six types imports them directly from their declaring seam module
(`./checkpoint`, `./schema-validator`, `./file-watcher`).

## Evidence
src/seams/index.ts:6-22 — the re-export surface (unconsumed-through-barrel
names: `CheckpointKind`, `CheckpointSite` on line 6; `ValidationError` on line
10; `FileWatchEventKind`, `WatchTermination`, `OnWatchTerminate` on lines
18/20/21):

```
export type { Checkpoint, CheckpointKind, CheckpointSite } from "./checkpoint";
export type {
  SchemaValidator,
  CompiledValidator,
  ValidationError,
  LoweredSchema,
} from "./schema-validator";
export type { Clock, TimerHandle } from "./clock";
export type { FileSystem, FileStat } from "./file-system";
export type {
  FileWatcher,
  FileWatchEvent,
  FileWatchEventKind,
  Unsubscribe,
  WatchTermination,
```

The complete importer set. Search: `from ["'](\.\./)+seams["']|from
["']\./seams["']|from ["'].*seams/index["']` over `**/*.ts` — 2 hits:

```
src/runtime-root.ts:25: } from "./seams/index";
tests/di-seam-skeleton.test.ts:23: } from "../src/seams/index";
```

src/runtime-root.ts:17-25 imports seven names, none of the six:

```
import type {
  Checkpoint,
  Clock,
  FileSystem,
  FileWatcher,
  IdSource,
  SchemaValidator,
  TokenEstimator,
} from "./seams/index";
```

tests/di-seam-skeleton.test.ts:9-23 imports thirteen names, none of the six
(`Checkpoint, Clock, CompiledValidator, FileStat, FileSystem, FileWatcher,
FileWatchEvent, IdSource, LoweredSchema, SchemaValidator, TimerHandle,
TokenEstimator, Unsubscribe`).

Direct-import evidence that the six names live elsewhere (examples):
`CheckpointKind`/`CheckpointSite` — `src/seams/production-checkpoint.ts:18`
imports them `from "./checkpoint"`; `src/runtime/statement-executor.ts:50`
`from "../seams/checkpoint"`. `WatchTermination`/`OnWatchTerminate` —
`src/seams/pi-file-watcher.ts:24-29` and `tests/helpers/fake-file-watcher.ts`
import `from "./file-watcher"` / `"../../src/seams/file-watcher"`.
`FileWatchEventKind` is referenced outside its declaring file and the barrel by
nothing at all (search `FileWatchEventKind` over `**/*.ts`: hits only in
`src/seams/file-watcher.ts` and `src/seams/index.ts`).

## Why this is a problem
Redundant pass-through entries: a re-export line exists to be imported through,
and these six names have no importer through the barrel across src/,
extensions/, tools/, and tests/. The barrel's own header scopes it to "the seam
interfaces threaded by the constructor-injection runtime root", and the runtime
root threads only the seven interfaces; the six unconsumed names are surface
the barrel carries for no consumer, so a reader auditing the barrel's contract
must chase six names that no import path exercises.

## Suggested direction (non-binding, optional)
Trim the barrel to the names its two importers actually consume, or leave a
one-line statement that the barrel mirrors each seam module's full public
surface if that is the intended contract — either way the current silent
mismatch between the header's stated scope and the entry list goes away.

## False-positive check
- Importer search: `from ["'](\.\./)+seams["']`, `from ["']\./seams["']`, and
  `from ["'].*seams/index["']` over `**/*.ts` in src/, extensions/, tools/,
  tests/ — exactly 2 hits (runtime-root.ts:25, di-seam-skeleton.test.ts:23);
  neither import list contains any of the six names.
- Re-export chain search: `export .* from .*seams` outside src/seams/index.ts —
  0 hits, so no second barrel forwards these entries.
- Dynamic/string-keyed access: searched `"CheckpointKind"`, `"ValidationError"`
  etc. as string literals — no dynamic access of barrel exports (type-only
  exports cannot be dynamically accessed at runtime in any case).
- Tests-as-callers check: the test that does import through the barrel
  (di-seam-skeleton.test.ts) consumes six supporting types
  (CompiledValidator, FileStat, FileWatchEvent, LoweredSchema, TimerHandle,
  Unsubscribe) — those are therefore NOT counted here; only the six names no
  test or production file imports through the barrel are.
- The six TYPES themselves are not claimed dead: `CheckpointKind`,
  `CheckpointSite`, `ValidationError`, `WatchTermination`, `OnWatchTerminate`
  all have direct importers, and `FileWatchEventKind` types the
  `FileWatchEvent.kind` field inside its declaring module. Only the barrel
  entries are unreached.
- Checked qwprobe-d2-01 (schema-validator invalidate): different root cause
  (an uncalled interface member); its false-positive check merely notes the
  barrel re-exports `SchemaValidator`, which this finding does not dispute.

## Triage
