---
id: PTQ-0305
title: discovery-walk.ts still bundles four separable discovery concerns after Seam A's extraction landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1-1240
  - src/discovery/discovery-walk.ts:51-170
  - src/discovery/discovery-walk.ts:173-475
  - src/discovery/discovery-walk.ts:492-807
  - src/discovery/discovery-walk.ts:815-1003
  - src/discovery/discovery-walk.ts:1005-1240
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/discovery-walk.ts # D9 breakdown only: the exemption key
d9_band: justify             # D9 breakdown only: zone | justify | strong
wave: qw20260913183958
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-13
---

# discovery-walk.ts still bundles four separable discovery concerns after Seam A's extraction landed

## Observation
`src/discovery/discovery-walk.ts` is 1240 LOC (band justify: 1000-1999), the
"five-source discovery walk, source priority, per-source failure modes, `~/`
home expansion, slash-name validity, and the cross-source-shadow /
cross-format-collision resolution" per its own header comment. This is a
partially-fixed re-file of `PTQ-0281`: that finding's Seam A (moving the
path/filesystem-shape classification concern, 234 LOC, into
`discovery-path-classify.ts`) landed (commit `846fd992`, current file down
from the finding's 1596 LOC to 1240), and its ratification explicitly said
"Seams B and C are NOT ratified in this ruling: the host stays over threshold
and D9 re-files the next seam after this one lands." The file's sole export
remains `discoverThetas` (1 src / 16 test importers per the map); every other
declaration below is 0/0 (file-private).

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every
member re-verified present at the cited lines by direct read):

| concern | members | line ranges | LOC |
|---|---|---|---|
| discovery-wide types, diagnostic codes, and priority/failure-mode tables | DiscoverySource, PiOwnedCommand, DiscoveryInput, DiscoveredTheta, DiscoveryResult, the 10 `theta/load/*` code consts, SLASH_NAME, PRIORITY, FailureModes, CONVENTIONAL_MODES, SETTINGS_MODES, CLI_MODES | 51-170 | 90 |
| per-source candidate enumeration & intra-source case-collision resolution | RawCandidate, enumerateDirectory, isCanonicalDuplicate, onDiskFileCandidate, resolveEntry, classifyForSource, emitSourceFailure, SourcedCandidate, resolveCaseCollisions, dedupeByPath | 173-475 | 248 |
| settings `thetaPaths` glob/override resolution sub-walk (DISC-5/DISC-7) | TreeEntry, TreeWalk, listTree, emitUniverseFailures, staticPrefixRoot, globMatches, fileEntryOf, ParsedSettingsEntry, resolveSettingsOperand, resolveSettingsSource | 492-807 | 245 |
| five-source driver | discoverThetas, collectFromEntries | 815-1003 | 188 |
| cross-source descriptor rendering + slash-name collision/shadow resolution | sourceLabelOf, renderDescriptor, resolveBySource, validateAndRead, dedupeByIdentity, collisionPathOrder, resolveSlashNames | 1005-1240 | 198 |

Concern 1 excerpt (discovery-walk.ts:51, 141-147 — a self-contained type/table
pair with no dependency on any other concern):
```ts
export type DiscoverySource = "cli" | "settings" | "project" | "package" | "global";
…
const PRIORITY: Record<DiscoverySource, number> = {
  cli: 1,
  settings: 2,
  project: 3,
  package: 4,
  global: 5,
} as const;
```

Concern 2 excerpt (discovery-walk.ts:173-176, 185-191):
```ts
interface RawCandidate {
  readonly path: string;
  readonly stem: string;
}
…
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
```

Concern 3 excerpt (discovery-walk.ts:654-663, 671-673 — `resolveSettingsSource`,
154 LOC, self-contained: takes only `fs`/`settings`/`diagnostics`/`roots`):
```ts
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<(RawCandidate & { readonly descriptorValue: string })[]> {
  const entries = settings.thetaPaths ?? [];
  if (entries.length === 0) {
    return [];
  }
  const baseDir = settings.thetaPathsBaseDir;
  …
  const selected = new Map<string, RawCandidate & { readonly descriptorValue: string }>();
  const treeCache = new Map<string, TreeWalk>();
```

Concern 4 excerpt (discovery-walk.ts:815-822):
```ts
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];
  const roots = new Set<string>();

  // CLI (priority 1) — explicit user intent: every failure mode is an error.
  const cliPaths = input.cliPaths ?? [];
```

Concern 5 excerpt (discovery-walk.ts:1137-1143):
```ts
async function resolveSlashNames(
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
  markedRoot?: { readonly slug: string; readonly winnerPath: string },
): Promise<DiscoveredTheta[]> {
  const piOwnedByName = new Map<string, PiOwnedCommand[]>();
```

Every member in concerns 1, 2, 3, and 5 is file-private (map's `exported`
column is "no" for all of them; importer counts 0/0) — the only
cross-boundary symbol is `discoverThetas` (1 src / 16 test importers). Three
functions the map separately flags over the function threshold sit inside
these concerns: `resolveSettingsSource` (654-807, 154 LOC, concern 3),
`discoverThetas` (815-965, 151 LOC, concern 4), and `resolveSlashNames`
(1137-1240, 104 LOC, concern 5).

## Why this is a problem
The file is in the justify band (1240 LOC), which presumes breakdown unless a
concrete reason to keep it whole is found. The five reasons were each
checked against the file as a whole:
- Closed-enumeration dispatch: the handful of small switches inside concerns
  2/4/5 (`classifyForSource` 10 LOC, `sourceLabelOf` 20 LOC) are each short,
  but that describes tens of LOC, not the 969 LOC of grouped declarations;
  the file is not one dispatch, it is four sequentially organised
  subsystems plus their shared type/constant header.
- Single algorithm with shared local state: `resolveSettingsSource` alone
  (concern 3's core, 154 LOC) has a genuine version of this reason — it
  threads 7 locals (`selected`, `treeCache`, `universeFailures`, `fs`,
  `diagnostics`, `roots`, `baseDir`) through 5 inner closures
  (`treeFor`/`addDir`/`addFile`/`addLiteral`/`addGlob`) implementing the
  DISC-5 four-step override order — but that is a reason to keep that one
  function's body intact when it moves, not a reason to keep concern 3's
  surrounding module (or concerns 2/4/5) inside *this* file: every other
  function in concerns 2, 4, and 5 already receives its collaborators
  (`fs`, `diagnostics`, `roots`, `candidates`) as ordinary parameters, with
  no comparable multi-closure shared state to preserve.
- Data-only module or type family: concern 1 (shared types/constants) is 90
  of 1240 LOC (~7%), far under the 80% bar.
- One grammar production family: not applicable (this is not a parser).
- Generated or mechanically derived code: the file carries hand-authored
  bug citations (0363, 0331, 0461, 0310 among others, each tied to a
  specific rule the code implements) added across many commits, inconsistent
  with generation.
None of the five reasons rescues the file as a whole, so the justify band's
presumption of breakdown stands for concerns 2, 3 (as a module, independent
of `resolveSettingsSource`'s own internal-shape defense), 4, and 5.

## Suggested direction (non-binding, optional)
Unproven hypotheses continuing PTQ-0281's own deferred Seams B/C; the human
ratifies one.
- Seam A: move concern 3 (the settings `thetaPaths` glob/override sub-walk,
  `TreeEntry` … `resolveSettingsSource`, whole — including
  `resolveSettingsSource` itself, kept intact per its own shared-state
  reason above) -> a new `discovery-settings-source.ts` (hypothesis) - 245
  LOC (492-807), 0 currently-exported symbols, called once today (from
  `discoverThetas`); cross-references back into concern 2's
  `RawCandidate`/`onDiskFileCandidate`/`enumerateDirectory` and the shared
  `discovery-path-classify.ts` helpers already imported here.
- Seam B: move concern 5 (descriptor rendering + slash-name
  collision/shadow resolution, `sourceLabelOf` … `resolveSlashNames`) -> a
  new `discovery-collision-resolve.ts` (hypothesis) - 198 LOC (1005-1240), 0
  currently-exported symbols, called once today (from `discoverThetas`);
  cross-references back into concern 2's `SourcedCandidate`/`PRIORITY` and
  the top-level `PiOwnedCommand` type.
- Seam C: move concern 2 (per-source candidate enumeration & case-collision
  resolution, `RawCandidate` … `dedupeByPath`) -> a new
  `discovery-source-enumerate.ts` (hypothesis) - 248 LOC (173-475), 0
  currently-exported symbols, called from `discoverThetas` (via
  `collectFromEntries`) and from concern 3's `resolveSettingsSource`
  (`enumerateDirectory`/`onDiskFileCandidate`).

## False-positive check
- Band: justify (1240 LOC; FILE_BANDS zone=600/justify=1000/strong=2000).
- Reasons-considered: all five concrete reasons checked above; only
  `resolveSettingsSource`'s own internal shape is defensible, and that
  defends the function's body, not the file boundary.
- Exemptions check: `quality/exemptions.json` has one entry
  (`D9:src/binder/binder-system-prompt.ts#normaliseParamLineBreaks`) — none
  for this file or any of its functions.
- Generated-code check: no generator marker; comments cite specific bug
  numbers (0363, 0331, 0461, 0310) and spec sections in prose.
- Spec-mirror check: `discovery.md`/`discovery-sources.md` organise DISC-1
  through DISC-7 as separate per-source / per-mechanism rule sections
  (enumeration sources, settings `thetaPaths`, collision resolution each a
  distinct section); nothing mandates single-file implementation.
- Prior-finding check: this continues `PTQ-0281` (confirmed, partially
  fixed — Seam A landed at commit `846fd992`); its own ratification named
  Seams B/C as not-yet-ratified and invited a re-file once Seam A landed.
  This filing supplies fresh line ranges/LOC against the current 1240-LOC
  file rather than reproducing the prior filing's now-stale 1596-LOC
  accounting.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran size-scan.mjs map: 1240 LOC/band justify reproduces, every concern's LOC (90/248/245/188/198, summing to the cited 969) and member/range list match exactly, the three over-threshold functions (resolveSettingsSource 154, discoverThetas 151, resolveSlashNames 104) and resolveSettingsSource's 7-locals/5-closures shape are verified, concerns 2/3/5 (the ones actually proposed to move) are confirmed 0/0 unexported, exemptions.json's single unrelated entry is confirmed, and PTQ-0281's quoted ratification ("Seams B and C are NOT ratified...") plus Seam A's landing (commit 846fd992, 234 LOC) both check out — but "the file's sole export remains discoverThetas … every other declaration below is 0/0 (file-private)" is false: concern 1 alone carries 5 more exported declarations (DiscoverySource 1/0, PiOwnedCommand 1/2, DiscoveryInput 0/15, DiscoveredTheta 1/12, DiscoveryResult 0/0 importers), a narrative overstatement that never reaches concerns 2/3/5; per D9 policy a verified breakdown accounting caps at questionable (never confirmed) pending a human-ratified seam (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): Seam 0 (the leaf), not the filing's A/B/C. Move concern 1 - the discovery-wide types (DiscoverySource, PiOwnedCommand, DiscoveryInput, DiscoveredTheta, DiscoveryResult), the ten theta/load/* code consts, SLASH_NAME, PRIORITY, FailureModes, CONVENTIONAL_MODES, SETTINGS_MODES, CLI_MODES (discovery-walk.ts:51-170, 90 LOC) - verbatim into a new module src/discovery/discovery-model.ts; discovery-walk.ts imports what it uses and re-exports every name that is exported today (export { ... } from "./discovery-model" - BARREL) so its src and test importers resolve unchanged; the new module imports nothing from discovery-walk.ts (it is the leaf). Reason: every seam the filing proposes (concerns 2/3/5) references concern 1 at runtime (concern 5 alone reads PRIORITY 11 times plus four code consts), so moving any of them first would create a host <-> module runtime import cycle; with the model module in place they move cycle-free. Pre-announced, NOT ratified: concern 5 (sourceLabelOf ... resolveSlashNames) -> discovery-collision-resolve.ts next wave. No logic edits; header comment on the new module; tsc first; report before/after LOC.
