---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: discovery-walk.ts still bundles the settings thetaPaths sub-walk with the five-source driver after concern 1's enumeration split landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1-622
  - src/discovery/discovery-walk.ts:115-430
  - src/discovery/discovery-walk.ts:277-430
  - src/discovery/discovery-walk.ts:438-622
  - src/discovery/discovery-walk.ts:472-479
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/discovery-walk.ts # D9 breakdown only: the exemption key
d9_band: zone                # D9 breakdown only: zone | justify | strong
wave: qw20260916144930
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# discovery-walk.ts still bundles the settings thetaPaths sub-walk with the five-source driver after concern 1's enumeration split landed

## Observation
`src/discovery/discovery-walk.ts` is 622 LOC (band zone: 600-999), down from
the 855 LOC `PTQ-0367` measured. That finding's ratified "Seam B" — moving
`RawCandidate`, `enumerateDirectory`, `isCanonicalDuplicate`,
`onDiskFileCandidate`, `resolveEntry`, `classifyForSource`,
`emitSourceFailure` (PTQ-0367's "concern 1", per-source candidate
enumeration) into a new sibling `discovery-source-enumerate.ts` — has
landed: that module exists exactly as described (this shard's own
band-exempt file), and this file's header now says so in the past tense
("live in `discovery-source-enumerate.ts` (PTQ-0367 ...) and are imported
back in below"). `PTQ-0367`'s human ratification named the remainder
explicitly: "Seam A (the DISC-5 settings sub-walk -> discovery-settings-
source.ts) is NOT ratified this wave — it calls concern 1, so it must land
after Seam B or it imports back from the host (a cycle); D9 re-files it
after, expect ratification then." Seam B has now landed, removing the cycle
risk Seam A's own deferral named, and the settings sub-walk is still present,
unmoved, in the current file — exactly the two concerns `discovery-model.ts`'s
own header still names as this file's remaining "own concerns."

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every
member re-verified present at the cited lines by direct read):

| concern | members | line ranges | LOC |
|---|---|---|---|
| settings `thetaPaths` glob/override sub-walk (DISC-5) | `TreeEntry`, `TreeWalk`, `listTree`, `emitUniverseFailures`, `staticPrefixRoot`, `globMatches`, `fileEntryOf`, `ParsedSettingsEntry`, `resolveSettingsOperand`, `resolveSettingsSource` | 115-430 | 245 |
| five-source driver (the file's sole export; retained orchestrator) | `discoverThetas`, `collectFromEntries` | 438-622 | 184 |

`discovery-model.ts`'s own header (unchanged since `PTQ-0367`, re-read
immediately before filing) still names these as two of "discovery-walk.ts's
own concerns," now that concern 1 has moved out:
```ts
// Discovery-wide types, diagnostic codes, and the priority / failure-mode /
// slash-name tables shared by discovery-walk.ts's own concerns (per-source
// enumeration, the settings `thetaPaths` sub-walk, the five-source driver)
```

Concern-1 (settings sub-walk) excerpt, `discovery-walk.ts:277-283` —
`resolveSettingsSource` itself, self-contained: takes only
`fs`/`settings`/`diagnostics`/`roots`, no dependency on the driver below:
```ts
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<(RawCandidate & { readonly descriptorValue: string })[]> {
  const entries = settings.thetaPaths ?? [];
```

Concern-2 (driver) excerpt, `discovery-walk.ts:438` and `472-479` — the only
cross-reference between the two concerns is this one call, in the direction
the driver calling INTO the sub-walk (the reverse direction creates no
cycle):
```ts
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
```
```ts
  // Settings (priority 2) — explicit references resolved per the
  // `thetaPaths` entry schema: relative to the settings-file dir, with globs and
  // the `!`/`+`/`-` override grammar; missing/wrong-type are errors.
  const settingsSourceLabel = sourceLabelOf("settings");
  for (const candidate of await resolveSettingsSource(fs, input.settings, diagnostics, roots)) {
    candidates.push({ ...candidate, source: "settings", sourceLabel: settingsSourceLabel });
  }
```

Every member of the settings-sub-walk concern is file-private (structural
map's `exported` column is "no" for all ten; importer counts 0/0 each) — the
only cross-boundary symbol in the file is `discoverThetas` (1 src / 16 test
importers per the map).

## Why this is a problem
Zone band (622 LOC) — files only on 2-or-more-concern evidence, shown above
as 2, independently corroborated by the sibling `discovery-model.ts`'s own
header. The driver concern has its own already-established defense
(`PTQ-0367`'s confirmed false-positive check, re-verified against the
current source): `discoverThetas` walks the fixed 5-source priority order
(CLI, Settings, Project, Packages, Global) in strict sequence — a
closed-enumeration dispatch over the spec-named closed set
`discovery-sources.md` documents (DISC-1…DISC-4) — with the Settings block
itself now only 8 lines (472-479, a thin delegation to
`resolveSettingsSource`), the CLI block short, and the paired
project/global conventional-root loop long only because of its own
extensive DISC-2 clean-leaf-ENOENT rationale in comment form, not additional
dispatched logic. That closed-enumeration defense does not reach the
settings sub-walk itself: it is called INTO by the dispatch, not one of its
arms, and it remains a fully self-contained module-in-waiting (0/0
importers on every one of its ten members; parameters limited to
`fs`/`settings`/`diagnostics`/`roots`, none of them the driver's own
locals). `resolveSettingsSource` itself (the concern's core, 154 LOC) has
its own separately-defensible internal shape — 7 locals (`selected`,
`treeCache`, `universeFailures`, `fs`, `diagnostics`, `roots`, `baseDir`)
threaded through 5 inner closures (`treeFor`/`addDir`/`addFile`/
`addLiteral`/`addGlob`) implementing the DISC-5 four-step override order,
re-verified unchanged from `PTQ-0367`'s own citation — but that defends the
function's own body when it moves, not the surrounding file boundary the
already-executed concern-1 split (this same file, this same mechanism)
already proved workable one concern at a time.

## Suggested direction (non-binding, optional)
Continuing `PTQ-0367`'s own pre-announcement; the human ratifies the shape.
- Seam A (`PTQ-0367`'s own named, not-yet-ratified seam, now unblocked): move
  the settings-sub-walk concern whole (`TreeEntry` … `resolveSettingsSource`,
  `resolveSettingsSource` itself kept intact per its own shared-state shape)
  -> a new `discovery-settings-source.ts` (hypothesis) - 245 LOC (115-430), 0
  currently-exported symbols, called once today (from `discoverThetas`);
  cross-references back into the host: none (its only external dependencies
  are `discovery-path-classify.ts`, `discovery-model.ts`,
  `discovery-source-enumerate.ts`, `./settings`, and the npm package
  `minimatch` — all already-existing imports, none of them
  `discovery-walk.ts` itself); `discoverThetas` would import
  `resolveSettingsSource` back from the new module in place of today's
  in-file call.

## False-positive check
- Band: zone (622 LOC; FILE_BANDS zone=600/justify=1000/strong=2000) — read
  from the supplied structural map, not recounted by hand.
- 2-or-more-concern evidence: 2 rows tabulated above, each re-read at its
  cited lines immediately before filing, and independently corroborated by
  `discovery-model.ts`'s own header (re-read in full, unchanged since
  `PTQ-0367`).
- Exemptions check: `quality/exemptions.json` grepped for
  `discovery-walk` — the sole hit is `D8:...#enumerateDirectory`, a
  different lens and a function this file no longer contains (it moved to
  `discovery-source-enumerate.ts`); no D9 entry names this file or either
  remaining concern.
- Generated-code check: `grep -n "@generated\|DO NOT EDIT\|autogenerated"
  src/discovery/discovery-walk.ts` — no hits.
- Spec-mirror check: `discovery.md`/`discovery-sources.md` document DISC-1
  through DISC-4 as per-source rules; the settings `thetaPaths` override
  grammar is DISC-5, anchored in the separate `package-and-settings.md`
  document (independently confirmed by this same wave's
  `qw20260916144930-d2-02-discovery-walk-spec-omits-package-and-settings.md`,
  a D2 finding on this file's own Spec: line, unrelated root cause) — nothing
  mandates single-file implementation of both a DISC-1…DISC-4 driver and a
  DISC-5 sub-walk.
- Prior-finding check: this continues `PTQ-0367` (confirmed, fixed — Seam B,
  the `discovery-source-enumerate.ts` split, landed) and its own predecessors
  `PTQ-0305`/`PTQ-0333` (both confirmed, fixed). `PTQ-0367`'s own
  ratification named exactly this remaining concern as the deferred item,
  conditioned on Seam B landing first to avoid a cycle: "Seam A ... is NOT
  ratified this wave ... D9 re-files it after, expect ratification then."
  Seam B is confirmed landed (`discovery-source-enumerate.ts` exists exactly
  as specified, in this same shard). This filing supplies the current
  622-LOC accounting (down from `PTQ-0367`'s 855) rather than reproducing
  that filing's now-stale numbers, and is not a duplicate of the distinct D2
  finding on this file's Spec: line noted above (a citation-completeness
  claim, not a breakdown claim).
- Not a deadness claim: every member of both remaining concerns is live —
  `resolveSettingsSource` is called once from `discoverThetas` (472-479,
  quoted above) on every discovery walk; `discoverThetas` itself is the
  file's sole export, 1 src / 16 test importers per the map.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces exactly (size-scan.mjs map: 622 LOC/band zone; settings sub-walk 115-430 sums to 245 LOC across all 10 listed members, each 0/0 importers; driver 438-622 sums to 184 LOC; discoverThetas 1/16), PTQ-0367's quoted ratification and its explicit re-file pre-announcement reproduce verbatim in quality/resolved/PTQ-0367-*.md, Seam B's landing into discovery-source-enumerate.ts (no import cycle back to the host) is confirmed, and the DISC-1…4 vs DISC-5 document split is confirmed in the actual spec docs; per D9 breakdown policy an accurate zone-band ≥2-concern accounting caps at questionable — the seam is a human ruling, never confirmed by triage (triage: claude-opus-5)
verdict: questionable — independently re-verified against current HEAD (not just re-stated): size-scan.mjs now reports 615 LOC/band zone, not the cited 622 — a same-wave commit (dc761274, "qw20260916144930 fix d8/...") landed after this candidate's own filing commit (f67b6530) and trimmed 7 now-dead mode-parameter lines untouched by either concern; band is zone either way and every cited excerpt still reproduces within ≤7 lines (e.g. resolveSettingsSource now at 274 vs cited 277, discoverThetas now at 435 vs cited 438, the settings call-block now at 468-473 vs cited 472-479) — small tolerated drift, not the ~230-line wrong-function drift that sank the sibling rejected d8-01-globmatches finding on this same file. All 10 settings-sub-walk members independently re-grepped as file-private/0-importers (the only src hits are package-discovery.ts's own unrelated same-named DISC-5-mirror declarations or comments); discoverThetas independently confirmed 1 real src importer (production-composition.ts). PTQ-0367's quoted ratification and Seam B's landing (discovery-source-enumerate.ts, header confirms, no cycle) reproduce verbatim on disk; Seam A's target file confirmed not yet created. DISC-1…4-vs-DISC-5 split confirmed in discovery-sources.md/package-and-settings.md; no exemptions.json entry applies; not a duplicate of PTQ-0379 (a distinct D2 citation-completeness finding) or of resolved PTQ-0367 (which ratified only Seam B). Per D9 breakdown policy an accurate zone-band ≥2-concern accounting caps at questionable — the seam/target shape is a human ruling, never confirmed by triage (triage: claude-opus-5)
