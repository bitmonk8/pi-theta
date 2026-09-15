---
id: PTQ-0356
title: discovery-walk.ts's header lists PRIORITY among the names it imports back from discovery-model.ts, but the file no longer imports or uses PRIORITY at all
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:24-32
  - src/discovery/discovery-walk.ts:63-78
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260915044704
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-15
---

# discovery-walk.ts's header lists PRIORITY among the names it imports back from discovery-model.ts, but the file no longer imports or uses PRIORITY at all

## Observation
`discovery-walk.ts`'s header names `PRIORITY` as one of the members that
"live in `discovery-model.ts`" and "are imported back in below." The file's
actual import statement from `discovery-model.ts` does not include
`PRIORITY`, and no other line in `discovery-walk.ts` references the
identifier `PRIORITY` at all — the only occurrence of that string in the
whole file is inside the header comment itself.

## Evidence
`src/discovery/discovery-walk.ts:24-32` — the header's claim, naming
`PRIORITY` first in its list of seven names "imported back in below":
```ts
// The discovery-wide types (`DiscoverySource`, `PiOwnedCommand`,
// `DiscoveryInput`, `DiscoveredTheta`, `DiscoveryResult`), the `theta/load/*`
// diagnostic codes, the priority / failure-mode / slash-name tables, and the
// per-source `SourcedCandidate` shape this walk implements against —
// `PRIORITY`, `FailureModes`, `CONVENTIONAL_MODES`, `SETTINGS_MODES`,
// `CLI_MODES`, `SLASH_NAME`, `SourcedCandidate` — live in `discovery-model.ts`
// (PTQ-0305's Seam 0, the leaf every concern here depends on) and are
// imported back in below; every name this file exported before that split is
// still exported from here.
```

`src/discovery/discovery-walk.ts:63-78` — the actual import statement from
`discovery-model.ts` (the "below" the header points to); `PRIORITY` is
absent, while the other six named members (`CLI_MODES`, `CONVENTIONAL_MODES`,
`SETTINGS_MODES`, `SLASH_NAME`, `FailureModes`, `SourcedCandidate`) are all
present:
```ts
import {
  CLI_MODES,
  CONVENTIONAL_MODES,
  INVALID_EXTENSION,
  MISSING_SOURCE,
  NON_CANONICAL_EXTENSION,
  SETTINGS_MODES,
  SLASH_NAME,
  UNREADABLE_SOURCE,
  WRONG_TYPE_SOURCE,
  type DiscoveryInput,
  type DiscoveryResult,
  type DiscoverySource,
  type FailureModes,
  type SourcedCandidate,
} from "./discovery-model";
```

Exact search confirming no other reference exists: `grep -n "\bPRIORITY\b"
src/discovery/discovery-walk.ts` returns exactly one line — line 28, inside
the header quoted above. No import, no body reference, no re-export.

## Why this is a problem
The header enumerates `PRIORITY` as a name this file depends on and pulls in
from `discovery-model.ts`, but the file neither imports nor reads that
identifier anywhere. Git history shows this was accurate when the sentence
was written: at commit `717e97c5` (the commit that first split
`discovery-model.ts` out and wrote this header paragraph), `discovery-walk.ts`
did import `PRIORITY` directly, because the collision-resolution code that
reads it (`dedupeByIdentity`, `collisionPathOrder`, `resolveSlashNames`) still
lived in this file at the time. Commit `ae8b6e05` (the later PTQ-0333 split
that moved that collision-resolution code into
`discovery-collision-resolve.ts`) deleted the `PRIORITY` import and every
`PRIORITY`-reading line from this file in the same commit — but left the
header's roster unedited, so it still lists a name this file dropped.

## Suggested direction (non-binding, optional)
Drop `PRIORITY` from the header's list of names "imported back in below" at
lines 24-32, since `discovery-collision-resolve.ts` (not `discovery-walk.ts`)
is the module that now imports and reads it from `discovery-model.ts`.

## False-positive check
- Ran `grep -n "\bPRIORITY\b" src/discovery/discovery-walk.ts` → exactly one
  hit, the header line itself; confirmed the actual `discovery-model.ts`
  import block (lines 63-78, quoted above) does not name `PRIORITY`.
- Ran `git log -S"live in \`discovery-model.ts\`" --oneline -- src/discovery/discovery-walk.ts` → `717e97c5`, and read `git show 717e97c5:src/discovery/discovery-walk.ts` to confirm `PRIORITY` was in that commit's import list (it was, at line 69 of that revision) and was read by `dedupeByIdentity`/`collisionPathOrder`/`resolveSlashNames`, which still lived in this file at that commit.
- Ran `git log -S"  PRIORITY," --oneline -- src/discovery/discovery-walk.ts` → two hits (`717e97c5` adding it, `ae8b6e05` removing it); `git show ae8b6e05 -- src/discovery/discovery-walk.ts` confirms the same commit that deletes the `PRIORITY` import (a `-  PRIORITY,` line) also deletes every `PRIORITY[...]` read (via the collision-resolution functions it relocates), while the header text carries over unedited — proving genuine drift rather than an always-wrong claim.
- Checked `quality/issues/`, `quality/resolved/`, and the wave's do-not-refile list for this exact claim: no existing filing names `discovery-walk.ts`'s header falsely claiming a `PRIORITY` import; the closest topics (PTQ-0305, PTQ-0333, PTQ-0338) cover the extraction's LOC/seam accounting and a different file's line-number citations into `discovery-sources.md`, not this roster.
- This is a header-accuracy claim, not a deadness claim: `PRIORITY` remains live and load-bearing in `discovery-collision-resolve.ts` (see the sibling finding in this same wave); nothing here proposes removing the export or the identifier itself, only correcting which file's header claims to import it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduced verbatim: header (24-32) lists PRIORITY as imported "below" from discovery-model.ts, but the import block (63-78) omits it and a repo grep finds zero PRIORITY references outside the header itself; git history (717e97c5 added the import, read by dedupeByIdentity/collisionPathOrder/resolveSlashNames; ae8b6e05 deleted the import and those functions, relocating them to discovery-collision-resolve.ts, while rewriting this same paragraph without dropping PRIORITY) proves genuine drift, matching the PTQ-0307/PTQ-0308 header-accuracy precedent; no duplicate exists. (triage: claude-opus-5)
