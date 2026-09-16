---
id: PTQ-0367
title: discovery-walk.ts still bundles per-source enumeration and the settings thetaPaths sub-walk after the collision-resolve split landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1-855
  - src/discovery/discovery-walk.ts:94-331
  - src/discovery/discovery-walk.ts:348-663
  - src/discovery/discovery-walk.ts:671-855
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/discovery-walk.ts # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: zone                # D9 breakdown only: zone | justify | strong
wave: qw20260915044704
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-15
---

# discovery-walk.ts still bundles per-source enumeration and the settings thetaPaths sub-walk after the collision-resolve split landed

## Observation
`src/discovery/discovery-walk.ts` is 855 LOC (band zone: 600-999), down from
the 1125 LOC `PTQ-0333` measured. That finding's ratified seam — moving
`SourcedCandidate` plus `sourceLabelOf` … `resolveSlashNames` (with
`resolveCaseCollisions`/`dedupeByPath`) into `discovery-collision-resolve.ts`
— has landed; that module's own header confirms it ("Split out of
discovery-walk.ts as PTQ-0333"). `PTQ-0333`'s human ratification named the
remainder explicitly: "Rows 1 and 2 (enumeration; settings sub-walk) are NOT
ratified - D9 re-files after this lands." Both rows are still present,
unmoved, in the current file. The file's sole export remains `discoverThetas`
(1 src / 16 test importers per the structural map); every member of the two
remaining non-driver concerns below is file-private (0/0 importers).

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every
member re-verified present at the cited lines by direct read):

| concern | members | line ranges | LOC |
|---|---|---|---|
| per-source candidate enumeration | RawCandidate, enumerateDirectory, isCanonicalDuplicate, onDiskFileCandidate, resolveEntry, classifyForSource, emitSourceFailure | 94-331 | 192 |
| settings `thetaPaths` glob/override sub-walk (DISC-5) | TreeEntry, TreeWalk, listTree, emitUniverseFailures, staticPrefixRoot, globMatches, fileEntryOf, ParsedSettingsEntry, resolveSettingsOperand, resolveSettingsSource | 348-663 | 245 |
| five-source driver (the file's sole export; retained orchestrator) | discoverThetas, collectFromEntries | 671-855 | 184 |

These three names are not this filing's own invention: `discovery-model.ts`'s
header (the leaf both this file and `discovery-collision-resolve.ts` import
from) names them verbatim as "discovery-walk.ts's own concerns" —
`src/discovery/discovery-model.ts:1-5`:
```ts
// Discovery-wide types, diagnostic codes, and the priority / failure-mode /
// slash-name tables shared by discovery-walk.ts's own concerns (per-source
// enumeration, the settings `thetaPaths` sub-walk, the five-source driver)
// and by discovery-collision-resolve.ts's cross-source/format collision
// resolution (PTQ-0333).
```

Concern-1 excerpt (discovery-walk.ts:94-97, 106-109 — file-private, no
dependency on concern 2 or 3):
```ts
interface RawCandidate {
  readonly path: string;
  readonly stem: string;
}
...
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: DiscoverySource,
```

Concern-2 excerpt (discovery-walk.ts:510-516 — `resolveSettingsSource`, 154
LOC, self-contained: takes only `fs`/`settings`/`diagnostics`/`roots`):
```ts
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<(RawCandidate & { readonly descriptorValue: string })[]> {
  const entries = settings.thetaPaths ?? [];
```

Concern-3 excerpt (discovery-walk.ts:671-676 — the retained orchestrator, the
only exported symbol):
```ts
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];
  const roots = new Set<string>();

```

Every member in concerns 1 and 2 is file-private (structural map's `exported`
column is "no" for all of them; importer counts 0/0 each) — the only
cross-boundary symbol in the file is `discoverThetas`.

## Why this is a problem
Zone band (855 LOC) — files only on 2-or-more-concern evidence, shown above
as 3, and independently named as three separate concerns by the sibling
module's own header quoted above. Concern 3 (the driver) has its own
defense: `discoverThetas` walks the fixed 5-source priority order
(`discovery-model.ts`'s `DiscoverySource` doc comment: "The five discovery
sources, in priority order high→low") in strict sequence — a
closed-enumeration dispatch over the spec-named closed set
`discovery-sources.md` documents (DISC-1…DISC-4) — with three of its five
blocks short (CLI 683-707, 25 LOC; Settings 708-712, 5 LOC; Package 793-806,
14 LOC); the fourth (the paired project/global conventional-root loop,
713-792, 80 LOC) is longer, but that length is the loop's own extensive
DISC-2 clean-leaf-ENOENT rationale in comment form, not additional dispatched
logic. That closed-enumeration defense does not reach concerns 1 or 2:
neither is an arm of that switch — both are called INTO by it (via
`collectFromEntries` and `resolveSettingsSource` respectively) — and both
remain fully self-contained modules-in-waiting (0/0 importers on every
member; parameters limited to `fs`/`diagnostics`/`roots`/`settings`).
`resolveSettingsSource` itself (concern 2's core, 154 LOC) has its own
defensible internal shape — 7 locals (`selected`, `treeCache`,
`universeFailures`, `fs`, `diagnostics`, `roots`, `baseDir`) threaded through
5 inner closures (`treeFor`/`addDir`/`addFile`/`addLiteral`/`addGlob`)
implementing the DISC-5 four-step override order — but that defends the
function's own body when it moves, not the surrounding file boundary: every
other member of concerns 1 and 2 already receives its collaborators as
ordinary parameters, with no comparable shared closure state to preserve
across a file boundary.

## Suggested direction (non-binding, optional)
Continuing `PTQ-0333`'s own pre-announcement; the human ratifies one.
- Seam A (the settings-sub-walk seam `PTQ-0305`/`PTQ-0333` both deferred):
  move concern 2 whole (`TreeEntry` … `resolveSettingsSource`,
  `resolveSettingsSource` itself kept intact per its own shared-state shape)
  -> a new `discovery-settings-source.ts` (hypothesis) - 245 LOC (348-663), 0
  currently-exported symbols, called once today (from `discoverThetas`);
  cross-references back into concern 1's `enumerateDirectory`/
  `onDiskFileCandidate` (called from `addDir`/`addFile`) and the shared
  `discovery-path-classify.ts`/`discovery-model.ts` imports already present.
- Seam B (`PTQ-0305`'s deferred Seam C): move concern 1 whole (`RawCandidate`
  … `emitSourceFailure`) -> a new `discovery-source-enumerate.ts`
  (hypothesis) - 192 LOC (94-331), 0 currently-exported symbols, called from
  `discoverThetas` (via `collectFromEntries`) and from concern 2's
  `resolveSettingsSource`. Seam B's own cross-reference from concern 2 means
  it would need to land before or together with Seam A, or
  `discovery-settings-source.ts` would import back from `discovery-walk.ts` —
  a cycle — unless concern 1 has already moved out first.

## False-positive check
- Band: zone (855 LOC; FILE_BANDS zone=600/justify=1000/strong=2000) — read
  from the supplied structural map, not recounted by hand.
- 2-or-more-concern evidence: 3 rows tabulated above, each re-read at its
  cited lines immediately before filing, and independently corroborated by
  `discovery-model.ts`'s own header naming the same three concerns.
- Exemptions check: `quality/exemptions.json` read in full — 4 entries
  (`discovery-walk.ts#enumerateDirectory`, two `production-theta-producer.ts`/
  `binder-system-prompt.ts` hosts, `discovery/package-discovery.ts`), none
  naming this file as a whole or either remaining concern's group.
- Generated-code check: `grep -n "@generated\|DO NOT EDIT\|autogenerated"
  src/discovery/discovery-walk.ts` — no hits.
- Spec-mirror check: `discovery.md`/`discovery-sources.md` document DISC-1
  through DISC-7 as separate per-source/per-mechanism rule sections; the
  settings `thetaPaths` override grammar (DISC-5) is specified independently
  of the per-source enumeration rules (DISC-2/DISC-3) — nothing mandates
  single-file implementation of both.
- Prior-finding check: this continues `PTQ-0305` (confirmed, fixed — Seam 0,
  the discovery-model.ts split, landed) and `PTQ-0333` (confirmed, fixed —
  the collision-resolve split landed); `PTQ-0333`'s own ratification named
  exactly these two rows as the deferred remainder ("Rows 1 and 2
  (enumeration; settings sub-walk) are NOT ratified - D9 re-files after this
  lands"). This filing supplies fresh line ranges/LOC against the current
  855-LOC file (down from `PTQ-0333`'s 1125) and the current zone band (down
  from `PTQ-0333`'s justify), rather than reproducing either prior filing's
  now-stale accounting or band.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran size-scan.mjs map: 855 LOC/band zone reproduces, all three concern rows' line-ranges/members/LOC match exactly (94-331/192, 348-663/245, 671-855/184), discoverThetas confirmed 1/16 while every concern-1/2 member is 0/0 (independently grepped every identifier across src/tests/extensions/tools — the few outside hits are prose/comment mentions or coincidentally-same-named unrelated declarations in package-discovery.ts, never a real import), discovery-model.ts's header quote and PTQ-0305/PTQ-0333's verbatim ratification text ("Rows 1 and 2 ... are NOT ratified - D9 re-files after this lands") both reproduce against the resolved files, and exemptions.json's 4 entries are confirmed non-applicable; minor narrative imprecision in the Observation (SourcedCandidate actually landed in discovery-model.ts, not discovery-collision-resolve.ts as the sentence implies) and a 3-line misattribution in the bonus discoverThetas block-boundary discussion don't touch the load-bearing concern-1/2 accounting; per D9 policy an accurate zone-band breakdown accounting caps at questionable — the seam choice is a human ruling, never confirmed (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-15): Seam B first — the leaf. Move concern 1 whole (RawCandidate, enumerateDirectory, isCanonicalDuplicate, onDiskFileCandidate, resolveEntry, classifyForSource, emitSourceFailure; :94-331 at filing, 192 LOC) to a new sibling src/discovery/discovery-source-enumerate.ts with a header comment stating its role (per-source candidate enumeration and classification). Export exactly the members the host still uses — this session's trace: RawCandidate, emitSourceFailure, enumerateDirectory, onDiskFileCandidate, resolveEntry (re-trace before moving); the rest stay module-private in the new file. Cycle check done here: the block references no module-level declaration of discovery-walk.ts (its dependencies are discovery-model / discovery-path-classify imports), so the new module never imports the host; discovery-walk.ts imports the members back and its header's sources list gains the new module (the PTQ-0338 pattern). Zone band: ratified on PTQ-0333's pre-announcement, not on size. Seam A (the DISC-5 settings sub-walk -> discovery-settings-source.ts) is NOT ratified this wave — it calls concern 1, so it must land after Seam B or it imports back from the host (a cycle); D9 re-files it after, expect ratification then. Bodies verbatim with comments; identical behaviour and diagnostics; tests unchanged (0 external importers of any moved member); tsc first; report before/after LOC of discovery-walk.ts.
