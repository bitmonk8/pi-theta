---
id: PTQ-0390
title: discovery-path-classify.ts's header still attributes resolveEntry/enumerateDirectory to discovery-walk.ts, though both moved to discovery-source-enumerate.ts
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-path-classify.ts:7-13
  - src/discovery/discovery-source-enumerate.ts:7-17
  - src/discovery/discovery-source-enumerate.ts:26-38
  - src/discovery/discovery-walk.ts:82-88
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# discovery-path-classify.ts's header still attributes resolveEntry/enumerateDirectory to discovery-walk.ts, though both moved to discovery-source-enumerate.ts

## Observation
`discovery-path-classify.ts`'s header says `discovery-walk.ts` "imports back" this module's POSIX/path-classification helpers because "its own per-source enumeration (`resolveEntry`/`enumerateDirectory`)" and its settings resolution call them. `resolveEntry` and `enumerateDirectory` are not declared in `discovery-walk.ts`: both are exported functions of the sibling module `discovery-source-enumerate.ts`, which `discovery-walk.ts` merely re-imports by name as already-built functions. `discovery-source-enumerate.ts` obtains the path-classification helpers those two functions call directly from `discovery-path-classify.ts` itself, independently of `discovery-walk.ts`.

## Evidence
`src/discovery/discovery-path-classify.ts:7-13` — the header's claim, calling `resolveEntry`/`enumerateDirectory` part of `discovery-walk.ts`'s "own per-source enumeration":
```ts
// split (0 importers outside discovery-walk.ts). Most no longer are:
// discovery-walk.ts imports back what its own per-source enumeration
// (`resolveEntry`/`enumerateDirectory`) and settings `thetaPaths` resolution
// (`resolveSettingsSource`) call, and package-discovery.ts and settings.ts
// import the shared POSIX path helpers directly (PTQ-0286, PTQ-0287) —
// package-discovery.ts also imports `walkTree` and the descriptor renderer
// `renderSourceDescriptor` (PTQ-0284) — instead of keeping their own copies.
```

`src/discovery/discovery-source-enumerate.ts:7-17` — this sibling module's own header, stating `resolveEntry`/`enumerateDirectory` (among others) were relocated out of `discovery-walk.ts` into this file:
```ts
// mint (`emitSourceFailure`). Split out of discovery-walk.ts as PTQ-0367
// (pre-announced by PTQ-0333 as "concern 1"): every member here was
// file-private in discovery-walk.ts before the split; `RawCandidate`,
// `enumerateDirectory`, `onDiskFileCandidate`, `resolveEntry`, and
// `emitSourceFailure` are exported because discovery-walk.ts's
// `collectFromEntries` (the five-source driver) and `resolveSettingsSource`
// (the settings `thetaPaths` sub-walk) import them back;
// `isCanonicalDuplicate` and `classifyForSource` stay module-private, called
// only from within this file. This module imports nothing from
// discovery-walk.ts — the cycle guard, since discovery-walk.ts imports FROM
// here.
```

`src/discovery/discovery-source-enumerate.ts:26-38` — this module's own direct import of the path-classification helpers `resolveEntry`/`enumerateDirectory` call, obtained independently of `discovery-walk.ts`:
```ts
import {
  ancestorsClean,
  basename,
  classifyPath,
  dirnameOf,
  joinPosix,
  normalizePath,
  realpathOr,
  renderSourceDescriptor,
  splitExtension,
  type EnoentPolicy,
  type PathClass,
} from "./discovery-path-classify";
```

`src/discovery/discovery-walk.ts:82-88` — `discovery-walk.ts`'s own import of `resolveEntry`/`enumerateDirectory`, sourced from `discovery-source-enumerate.ts`, not from `discovery-path-classify.ts`:
```ts
import {
  emitSourceFailure,
  enumerateDirectory,
  onDiskFileCandidate,
  resolveEntry,
  type RawCandidate,
} from "./discovery-source-enumerate";
```

## Why this is a problem
The header's stated reason for `discovery-walk.ts` needing this module's exports — that `discovery-walk.ts`'s "own" `resolveEntry`/`enumerateDirectory` call them — no longer holds: those two functions are not resident in `discovery-walk.ts`, so they cannot be the reason that file imports anything from `discovery-path-classify.ts`. `discovery-walk.ts`'s genuine remaining reason (its settings-resolution code, `resolveSettingsSource` and its helpers) is folded into the same sentence as if it were symmetric with the `resolveEntry`/`enumerateDirectory` reason, obscuring that the latter half is now false. Commit `33b29e94` (2026-09-13) wrote this header paragraph when `resolveEntry`/`enumerateDirectory` genuinely were declared in `discovery-walk.ts`; commit `46a063e0` (2026-09-16) moved 277 net lines out of `discovery-walk.ts` into the new `discovery-source-enumerate.ts` — including both functions — without touching `discovery-path-classify.ts`'s header.

## Suggested direction (non-binding, optional)
Rewrite the sentence at lines 8-10 to attribute `resolveEntry`/`enumerateDirectory` to `discovery-source-enumerate.ts` (which now imports this module's helpers on its own behalf) rather than to `discovery-walk.ts`, leaving the `resolveSettingsSource` attribution as the one still-accurate reason `discovery-walk.ts` itself imports from this module.

## False-positive check
- Read `discovery-source-enumerate.ts` in full: confirmed `resolveEntry` (line 197) and `enumerateDirectory` (line 64) are both declared and exported there, not in `discovery-walk.ts`.
- Ran `grep -n "^export async function resolveEntry\|^export async function enumerateDirectory" src/discovery/discovery-walk.ts` → no matches (neither function is declared in that file).
- Confirmed `discovery-walk.ts`'s only reference to either name is the import at lines 82-88, sourced from `./discovery-source-enumerate`, not `./discovery-path-classify`.
- Ran `git log -S"its own per-source enumeration" --oneline -- src/discovery/discovery-path-classify.ts` → one hit, `33b29e94` (2026-09-13), which introduced the still-current wording.
- Ran `git log -S"async function resolveEntry" --oneline -- src/discovery/discovery-walk.ts src/discovery/discovery-source-enumerate.ts` → `46a063e0` (2026-09-16, adds it to `discovery-source-enumerate.ts`) and `070a1ef3` (the original commit, when it was still in `discovery-walk.ts`); `git show 46a063e0 --stat` confirms this commit's diff is exactly `discovery-source-enumerate.ts` (+288) and `discovery-walk.ts` (net -277), the PTQ-0367 relocation, and it does not touch `discovery-path-classify.ts`.
- Checked the do-not-refile list and `quality/resolved/`: no existing filing names `discovery-path-classify.ts`'s header attributing `resolveEntry`/`enumerateDirectory` to `discovery-walk.ts`; PTQ-0307 (resolved) covers a different, earlier staleness in this same header (a `walkTree` doc/signature mismatch), already fixed and not overlapping this claim.
- This is a header-accuracy claim, not a deadness claim: `resolveEntry`, `enumerateDirectory`, and every cited helper remain live, exported, and called; nothing here proposes removing any declaration, only correcting which file's header claims which relationship.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts reproduce verbatim at their cited lines (path-classify.ts:7-13, source-enumerate.ts:7-17/26-38, walk.ts:82-88), grep confirms resolveEntry (line 197) and enumerateDirectory (line 64) are declared and exported only in discovery-source-enumerate.ts with no declaration in discovery-walk.ts, and git log/show reproduce exactly: 33b29e94 (2026-09-13) is the sole hit for the header's current wording, 46a063e0 (2026-09-16, discovery-source-enumerate.ts +288/0, discovery-walk.ts +22/-255) relocated both functions without touching discovery-path-classify.ts — a genuine, non-duplicate header staleness (PTQ-0307 fixed a different clause of this same header) matching this repo's established confirmed class for stale collaborator-attribution comments (triage: claude-opus-5)
