---
id: PTQ-0333
title: discovery-walk.ts's cross-source collision resolution stays bundled with per-source enumeration and the settings sub-walk after Seam 0 landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1-1125
  - src/discovery/discovery-walk.ts:91-384
  - src/discovery/discovery-walk.ts:401-716
  - src/discovery/discovery-walk.ts:724-912
  - src/discovery/discovery-walk.ts:914-1125
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/discovery-walk.ts # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: justify             # D9 breakdown only: zone | justify | strong
wave: qw20260914091051
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# discovery-walk.ts's cross-source collision resolution stays bundled with per-source enumeration and the settings sub-walk after Seam 0 landed

## Observation
`src/discovery/discovery-walk.ts` is 1125 LOC (band justify: 1000-1999), described by its
own header as owning "the five-source discovery walk, source priority, per-source failure
modes, `~/` home expansion, slash-name validity, and the cross-source-shadow /
cross-format-collision resolution." This is a fresh-evidence continuation of `PTQ-0305`
(confirmed, fixed): that finding's ratified Seam 0 — moving the discovery-wide
types/constants (90 LOC) into `discovery-model.ts` — landed at commit `717e97c5` (146
lines added to the new file, this file cut by 122 net), taking the file from the finding's
1240 LOC to the current 1125. That same ratification pre-announced, but explicitly did not
ratify, the next step: "concern 5 (`sourceLabelOf` … `resolveSlashNames`) ->
`discovery-collision-resolve.ts` next wave." The file's sole export remains `discoverThetas`
(1 src / 16 test importers per the map); every declaration in the three file-private groups
below is 0/0.

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every member
re-verified present at the cited lines by direct read; rows sum to the file's own
846-LOC declared-body total):

| concern | members | line ranges | LOC |
|---|---|---|---|
| per-source candidate enumeration & intra-source case-collision resolution | RawCandidate, enumerateDirectory, isCanonicalDuplicate, onDiskFileCandidate, resolveEntry, classifyForSource, emitSourceFailure, SourcedCandidate, resolveCaseCollisions, dedupeByPath | 91-384 | 239 |
| settings `thetaPaths` glob/override resolution sub-walk (DISC-5/DISC-7) | TreeEntry, TreeWalk, listTree, emitUniverseFailures, staticPrefixRoot, globMatches, fileEntryOf, ParsedSettingsEntry, resolveSettingsOperand, resolveSettingsSource | 401-716 | 245 |
| five-source driver (the file's sole export; retained orchestrator) | discoverThetas, collectFromEntries | 724-912 | 188 |
| cross-source descriptor rendering + slash-name collision/shadow resolution | sourceLabelOf, renderDescriptor, resolveBySource, validateAndRead, dedupeByIdentity, collisionPathOrder, resolveSlashNames | 914-1125 | 174 |

Five-source-driver excerpt (discovery-walk.ts:724-731 — the retained orchestrator walks
discovery-sources.md's own fixed 5-source priority order; this is why it is not itself a
proposed seam target):
```ts
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];
  ...
  const roots = new Set<string>();

  // CLI (priority 1) — explicit user intent: every failure mode is an error.
```

Cross-source-collision excerpt (discovery-walk.ts:1038-1046 — `resolveSlashNames`, 88 LOC,
self-contained: takes only `candidates`/`piOwned`/`diagnostics`/`markedRoot`):
```ts
async function resolveSlashNames(
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
  markedRoot?: { readonly slug: string; readonly winnerPath: string },
): Promise<DiscoveredTheta[]> {
  const piOwnedByName = groupBy(piOwned, (command) => command.name);
  const byName = groupBy(candidates, (candidate) => candidate.stem);

  const thetas: DiscoveredTheta[] = [];
```

`resolveSlashNames` itself dropped under the function threshold since PTQ-0305 (88 LOC now,
zone; was 104 LOC/justify there), but the group it anchors (row 4, 174 LOC, 0/0 importers on
every member) is still a self-contained unit whose only outside caller is `discoverThetas`.

## Why this is a problem
The file is in the justify band (1125 LOC), which presumes breakdown unless a concrete
reason to keep it whole is found. The five reasons, re-checked against the current file:
- Closed-enumeration dispatch: `sourceLabelOf` (5 arms over discovery-sources.md's 5-source
  set) and the driver's own five-source walk are legitimately closed-set dispatches with
  short arms — but that describes part of rows 3-4, not the 484 LOC of rows 1-2 (per-source
  enumeration, settings sub-walk), which are sequential subsystems, not dispatch arms.
- Single algorithm with shared local state: `resolveSettingsSource` alone (row 2's core, 154
  LOC, unchanged since PTQ-0305) still threads 7 locals (`selected`, `treeCache`,
  `universeFailures`, `fs`, `diagnostics`, `roots`, `baseDir`) through 5 inner closures — a
  reason to keep that one function's body intact when row 2 moves as a group, not a reason
  to keep rows 1, 2, or 4 inside this file. `discoverThetas` (row 3) has its own
  closed-enumeration defense (above), which is why row 3 is the retained orchestrator, not a
  proposed seam.
- Data-only module or type family: no remaining row is types/tables (that was Seam 0's row,
  already extracted to `discovery-model.ts`).
- One grammar production family: not applicable.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT` marker (grepped);
  `git log --oneline --follow -- src/discovery/discovery-walk.ts | grep -iE
  "revert|split|extract"` returns no hits.
None of the five reasons rescues rows 1, 2 (as a module boundary, independent of
`resolveSettingsSource`'s own internal shape), or 4 from staying inside this file; the
justify band's presumption of breakdown stands for them.

## Suggested direction (non-binding, optional)
Continuing PTQ-0305's own pre-announcement; the human ratifies one.
- Seam (pre-announced by PTQ-0305, not yet ratified): move row 4 whole (`sourceLabelOf` …
  `resolveSlashNames`, `resolveSlashNames` itself kept intact) -> a new
  `discovery-collision-resolve.ts` (hypothesis) - 174 LOC (914-1125), 0 currently-exported
  symbols, called once today (from `discoverThetas`); cross-references back into row 1's
  `SourcedCandidate` and the top-level `PiOwnedCommand`/`PRIORITY`/`DiscoveredTheta`
  (already imported from `discovery-model.ts`, so no new cycle).
- Seam (PTQ-0305's own deferred Seam A): move row 2 whole (`TreeEntry` …
  `resolveSettingsSource`, `resolveSettingsSource` itself kept intact per its shared-state
  reason) -> a new `discovery-settings-source.ts` (hypothesis) - 245 LOC (401-716), 0
  currently-exported symbols, called once today (from `discoverThetas`).
- Seam (PTQ-0305's own deferred Seam C): move row 1 whole (`RawCandidate` …
  `dedupeByPath`) -> a new `discovery-source-enumerate.ts` (hypothesis) - 239 LOC (91-384),
  0 currently-exported symbols, called from `discoverThetas` (via `collectFromEntries`) and
  from row 2's `resolveSettingsSource`.

## False-positive check
- Band: justify (1125 LOC; FILE_BANDS zone=600/justify=1000/strong=2000).
- Reasons-considered: all five concrete reasons re-checked above against the current line
  numbers; only `resolveSettingsSource`'s and `discoverThetas`'s own internal shapes are
  defensible, and neither defends the surrounding file boundary for rows 1, 2, or 4.
- Exemptions check: `quality/exemptions.json` grepped for `discovery-walk.ts` — no entry
  (its only two entries are `binder-system-prompt.ts#normaliseParamLineBreaks` and
  `package-discovery.ts`).
- Generated-code check: grepped for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits.
- Spec-mirror check: `discovery.md`/`discovery-sources.md` organise DISC-1 through DISC-7 as
  separate per-source/per-mechanism rule sections; nothing mandates single-file
  implementation.
- Prior-finding check: this continues `PTQ-0305` (confirmed, fixed — Seam 0 landed at commit
  `717e97c5`); its own ratification named row 4 ("concern 5") as the explicit next step
  ("next wave") without ratifying it. This filing supplies fresh line ranges/LOC against the
  current 1125-LOC file (row boundaries shifted from PTQ-0305's 1240-LOC numbering;
  `resolveSlashNames` itself is now 88 LOC/zone, down from 104/justify there) rather than
  reproducing the prior filing's now-stale accounting.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran size-scan.mjs map: 1125 LOC/band justify reproduces, all four concern rows' line-ranges/members/LOC match exactly (91-384/239, 401-716/245, 724-912/188, 914-1125/174, summing to the claimed 846), every row-1/2/4 member is 0/0 importers (independently confirmed by grepping RawCandidate/TreeEntry/resolveSlashNames etc. across src/ and tests/ — only discoverThetas and the discovery-model.ts re-exported types are ever imported) while discoverThetas is 1/16, resolveSettingsSource's 7-locals/5-closures shape holds, exemptions.json carries no discovery-walk.ts entry, the generated-marker and git-log revert/split/extract greps both reproduce zero hits, and PTQ-0305's ratification is quoted verbatim ("concern 5 ... -> discovery-collision-resolve.ts next wave"); per D9 policy an accurate breakdown accounting caps at questionable — the seam choice among the three proposed is a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): the pre-announced collision seam, with two cycle guards. (1) Move the SourcedCandidate interface (discovery-walk.ts ~:331, file-private) into src/discovery/discovery-model.ts and export it; discovery-walk.ts imports it from there. (2) Move row 4 - sourceLabelOf (:910), renderDescriptor, resolveBySource, validateAndRead, dedupeByIdentity, collisionPathOrder, resolveSlashNames (:914-1125) - TOGETHER WITH resolveCaseCollisions (:346-369) and dedupeByPath (:373-384), which are intra-source case-collision resolution called only from resolveBySource, verbatim into a new module src/discovery/discovery-collision-resolve.ts. The new module imports only from discovery-model.ts, discovery-path-classify.ts and other leaves - NOTHING from discovery-walk.ts (that is the cycle guard); it exports what discovery-walk.ts still calls (sourceLabelOf, renderDescriptor, resolveBySource, resolveSlashNames, validateAndRead) and discovery-walk.ts imports them back. Pure move by line range with doc comments; header comment on the new module; no logic edits; tsc first; report before/after LOC of discovery-walk.ts. Rows 1 and 2 (enumeration; settings sub-walk) are NOT ratified - D9 re-files after this lands.
