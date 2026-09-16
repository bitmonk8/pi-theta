---
id: PTQ-0379
title: discovery-walk.ts's Spec line omits package-and-settings.md, the document defining DISC-5 which resolveSettingsSource implements and cites eight times
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:42-44
  - src/discovery/discovery-walk.ts:101-112
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260916144930
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-16
---

# discovery-walk.ts's Spec line omits package-and-settings.md, the document defining DISC-5 which resolveSettingsSource implements and cites eight times

## Observation
`discovery-walk.ts`'s top-of-file "Spec:" line lists only `discovery.md` and
`discovery/discovery-sources.md (DISC-1…DISC-4)` as the specification this
module implements against (plus the diagnostics code registry). The file's
own "Settings `thetaPaths` resolution" section header, later in the same
file, names a different document — `package-and-settings.md` — as that
section's authority, and the rule it cites, DISC-5, is anchored only in that
document, never in discovery-sources.md. `resolveSettingsSource` and its
helpers cite `DISC-5` eight times while implementing the `!`/`+`/`-`
override grammar the section header attributes to `package-and-settings.md`,
and that document name never appears in the Spec: line.

## Evidence
`src/discovery/discovery-walk.ts:42-44` — the Spec: line, whose document
list stops at `discovery-sources.md (DISC-1…DISC-4)`:
```ts
// Spec: discovery.md, discovery/discovery-sources.md (DISC-1…DISC-4), with the
// `theta/load/*` diagnostic codes/messages sourced from
// diagnostics/code-registry-load.md.
```

`src/discovery/discovery-walk.ts:101-112` — the section this file's own
prose says a different, uncited document governs, with DISC-5 named in the
very next paragraph:
```ts
// Settings `thetaPaths` resolution (package-and-settings.md §"`thetaPaths` entry schema").
//
// Unlike the CLI / conventional sources (whose entries are single directory
// roots or explicit `.theta` files), settings entries resolve relative to the
// settings-file directory, support globs, and carry the `!`/`+`/`-` override
// grammar of DISC-5 (the same fixed order the package `pi.theta` path uses:
// plain includes → `!` drops → `+` re-admits an exact path → `-` removes an
// exact path). A non-`.theta` file match is a `theta/load/invalid-extension`
// error (not `wrong-type-source`); a directory expands non-recursively; a
// literal path that is missing / unreadable / a non-regular type still carries
// the per-entry-index failure diagnostic of the failure-modes table.
// --------------------------------------------------------------------------
```

## Why this is a problem
The Spec: line is this module's own stated index of what document explains
its behaviour. `docs/spec_topics/discovery/package-and-settings.md:21`
anchors DISC-5 (`<a id="disc-5">`) — the rule text is a `pi.theta`-array
override grammar the settings `thetaPaths` case mirrors — and no such anchor
exists in `discovery-sources.md`. A search of the file for `DISC-5` finds
eight citations (lines 106, 195, 204, 273, 349, 359, 396, 457), all inside
the settings-resolution code this section header attributes to
`package-and-settings.md`, and a search for the literal string
`package-and-settings` finds two more citations (101, 132) — none of which
appear inside the Spec: line's own document list. By contrast, DISC-1 and
DISC-2, which the Spec line's "(DISC-1…DISC-4)" range does cover, are each
also cited directly in this file (lines 14, 252, 357, 511, 522), so the Spec
line is not wrong about everything — it specifically omits the one document
and rule this file cites most (eight times) among its settings-resolution
logic.

## Suggested direction
Add `discovery/package-and-settings.md (DISC-5)` to the Spec: line's document
list.

## False-positive check
- Ran `grep -n "DISC-5" src/discovery/discovery-walk.ts` → 8 hits (106, 195,
  204, 273, 349, 359, 396, 457), all inside `resolveSettingsSource` and its
  helper functions.
- Ran `grep -n "package-and-settings" src/discovery/discovery-walk.ts` → 2
  hits (101, 132); 0 hits inside lines 1-44 (the header/Spec-line block).
- Read `docs/spec_topics/discovery/package-and-settings.md:21` and confirmed
  the `<a id="disc-5">` anchor lives there, and ran `grep -rn "DISC-5"
  docs/spec_topics/` to confirm no `discovery-sources.md` anchor for DISC-5
  exists.
- Checked DISC-1 (discovery-walk.ts:252) and DISC-2 (14, 357, 511, 522) — the
  two identifiers the Spec line's own range covers — to confirm this is a
  specific omission, not a claim that the whole Spec line is wrong.
- Checked `quality/issues/`, `quality/resolved/`, `quality/intake/`, and the
  wave's do-not-refile list for a prior filing on this exact gap. Two
  existing discovery-walk.ts header findings exist — PTQ-0356 (a stale
  `PRIORITY` entry in the "imported back" roster) and PTQ-0338
  (discovery-sources.md line-citation drift) — and neither addresses the
  Spec: line's document list. A prior wave's own review log
  (`qw20260914060226`, D2 shard-01) flagged this exact gap as a candidate but
  left it unfiled as "weaker"/subsumed that day; it remains unfiled.
- Not a deadness claim: `resolveSettingsSource` and its DISC-5 override
  grammar are live production code, reached from `discoverThetas`'s Settings
  source arm.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — reproduced verbatim: Spec: line (42-44) stops at discovery-sources.md (DISC-1…DISC-4), yet the file's own settings-resolution section (101-112) names package-and-settings.md and cites DISC-5 eight times (106,195,204,273,349,359,396,457), whose sole anchor is package-and-settings.md:21 (absent from discovery-sources.md); sibling files (package-discovery.ts, settings.ts) correctly list package-and-settings.md when they implement its DISC rules, confirming this is a real header-completeness gap, not taste; no duplicate found (PTQ-0308/0338/0356 fix different drift in this same file). (triage: claude-opus-5)
