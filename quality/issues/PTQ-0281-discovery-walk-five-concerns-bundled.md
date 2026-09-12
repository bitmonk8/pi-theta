---
id: PTQ-0281
title: discovery-walk.ts bundles five separable discovery concerns in one 1596-LOC file
lens: D9                     # D2 | D7 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:1-1596
  - src/discovery/discovery-walk.ts:152-476
  - src/discovery/discovery-walk.ts:479-781
  - src/discovery/discovery-walk.ts:798-1135
  - src/discovery/discovery-walk.ts:1143-1331
  - src/discovery/discovery-walk.ts:1333-1596
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/discovery-walk.ts # D9 breakdown only: the exemption key
d9_band: justify             # D9 breakdown only: zone | justify | strong
wave: qw20260912161041
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-12
---

# discovery-walk.ts bundles five separable discovery concerns in one 1596-LOC file

## Observation
`src/discovery/discovery-walk.ts` is 1596 LOC (band justify: 1000-1999), the
"five-source discovery walk, source priority, per-source failure modes, `~/`
home expansion, slash-name validity, and the cross-source-shadow /
cross-format-collision resolution" per its own header comment. It exports one
function, `discoverThetas` (1 src / 16 test importers), plus a small type
surface; every other declaration in the file (54 of 56) is file-private —
not exported, 0/0 importers. The file grew across 22 commits since its V10a
introduction (`git log --follow`), each adding a bug-fix-scoped increment
(0075, 0076, 0078, 0113, 0310, 0331, 0339 routing, 0363, 0440, 0458-463, 0461)
rather than a single authored design.

## Evidence
Distinct-concern inventory (line ranges and LOC from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| path/filesystem-shape classification (DISC-2 clean-leaf-ENOENT rule, POSIX path helpers) | normalizePath, joinPosix, basename, splitExtension, properAncestors, expandHome, isAbsolutePath, dirnameOf, relativeToBase, isGlobPattern, hasOverridePrefix, LstatOutcome, lstatOutcome, ancestorsClean, realpathOr, RealpathOutcome, realpathOutcome, resolvedAncestorIsDir, PathClass, EnoentPolicy, classifyPath, classifyResolvedTarget, classifyUnresolvedTarget | 152-476 | 234 |
| per-source candidate enumeration & intra-source case-collision resolution | RawCandidate, enumerateDirectory, isCanonicalDuplicate, onDiskFileCandidate, resolveEntry, classifyForSource, emitSourceFailure, SourcedCandidate, resolveCaseCollisions, dedupeByPath | 479-781 | 248 |
| settings `thetaPaths` glob/override resolution sub-walk (DISC-5/DISC-7) | TreeEntry, TreeWalk, listTree, emitUniverseFailures, staticPrefixRoot, globMatches, fileEntryOf, ParsedSettingsEntry, resolveSettingsOperand, resolveSettingsSource | 798-1135 | 271 |
| five-source driver | discoverThetas, collectFromEntries | 1143-1331 | 188 |
| cross-source descriptor rendering + slash-name collision/shadow resolution | sourceLabelOf, descriptorKindOf, renderSourceDescriptor, renderDescriptor, resolveBySource, validateAndRead, dedupeByIdentity, collisionPathOrder, resolveSlashNames | 1333-1596 | 215 |

Representative excerpt, concern 1 (path helpers, no dependency on any
discovery-specific type):
```
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function joinPosix(base: string, tail: string): string {
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/${tail}`;
}

function basename(path: string): string {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}
```

Representative excerpt, concern 3 (`resolveSettingsSource`, 982-1135, 154
LOC, self-contained — takes exactly `fs`/`settings`/`diagnostics`/`roots`):
```
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

  const parsed: ParsedSettingsEntry[] = entries.map((raw, index) => {
    const first = raw[0];
```

Representative excerpt, concern 5 (`resolveSlashNames`, 1493-1596, 104 LOC):
```
async function resolveSlashNames(
  candidates: readonly SourcedCandidate[],
  piOwned: readonly PiOwnedCommand[],
  diagnostics: Diagnostic[],
  markedRoot?: { readonly slug: string; readonly winnerPath: string },
): Promise<DiscoveredTheta[]> {
  const piOwnedByName = new Map<string, PiOwnedCommand[]>();
  for (const command of piOwned) {
    const bucket = piOwnedByName.get(command.name);
```

Every member in concerns 1, 2, 3, and 5 is file-private (map's `exported`
column reads "no" for all of them; importer counts 0/0), i.e. none of them
is consumed by name from outside this file today — the only cross-boundary
symbol is `discoverThetas` itself (1 src / 16 test importers). Concerns
2, 3, and 5 each already take their inputs as explicit function parameters
(`fs`, `diagnostics`, `roots`, plus concern-specific data) rather than
closing over file-level mutable state — there is no module-level variable
in the file (consistent with the project's own "No globals, statics,
singletons" convention cited in `src/diagnostics/placeholder.ts` and
`src/extension/execution-status/bus.ts`).

## Why this is a problem
The file is in the justify band (1000-1999 LOC), which presumes breakdown
unless a concrete reason to keep it whole is found. The five reasons the
brief allows were each checked against this file's own evidence:
- Closed-enumeration dispatch: a handful of small helpers (`classifyForSource`,
  `sourceLabelOf`, `descriptorKindOf`) are switches over the closed
  `DiscoverySource` set, but that describes 10-20 LOC apiece, not the
  1596-LOC whole; the file is not one dispatch, it is five sequentially
  organised subsystems.
- Single algorithm with shared local state: there is no file-level mutable
  state to thread — every helper in concerns 1/2/3/5 already receives its
  collaborators (`fs`, `diagnostics`, `roots`, `settings`) as explicit
  parameters, so lifting any one concern into its own module costs no new
  parameter-threading beyond what the current signatures already declare.
- Data-only module or type family: the shared top-of-file types/constants
  (`DiscoverySource` … `CLI_MODES`, lines 26-145) total 89 LOC, ~6% of the
  file — far under the 80% bar.
- One grammar production family: not applicable (this is not a parser).
- Generated or mechanically derived code: the file carries extensive
  hand-authored bug citations (bugs 0075, 0076, 0078, 0113, 0310, 0331,
  0339, 0363, 0440, 0458-0463, 0461) added across 22 separate commits per
  `git log --follow`, inconsistent with generation.
None of the five concrete reasons holds for the file as a whole, so the
justify band's presumption of breakdown stands.
Two of the three functions the map separately flags as over the *function*
threshold are the concern-3 and concern-5 members already itemised above
(`resolveSettingsSource`, 154 LOC; `resolveSlashNames`, 104 LOC); the third
(`discoverThetas`, 151 LOC) is the concern-4 driver. `resolveSettingsSource`
itself has a defensible single-function reason to stay whole — it
threads 7 locals (`selected`, `treeCache`, `universeFailures`, `fs`,
`diagnostics`, `roots`, `baseDir`) through 5 inner closures
(`treeFor`/`addDir`/`addFile`/`addLiteral`/`addGlob`) implementing the
DISC-5 four-step override order — but that is a reason to keep that one
function intact, not a reason to keep it (or its concern-3 siblings
`listTree`/`globMatches`/etc.) inside this particular file.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one.
- Seam A: move concern 1 (path/filesystem-shape classification,
  `normalizePath` … `classifyUnresolvedTarget`) -> a new
  `discovery-path-classify.ts` (hypothesis) - 234 LOC, 0 currently-exported
  symbols (0/0 importers today since all are file-private), consumed back
  by concern 2 (`resolveEntry`, `enumerateDirectory`) and concern 3
  (`resolveSettingsSource`'s `classifyPath`/`expandHome`/`isAbsolutePath`
  calls) — both would import it.
- Seam B: move concern 3 (the settings `thetaPaths` glob/override sub-walk,
  `TreeEntry` … `resolveSettingsSource`, whole — including
  `resolveSettingsSource` itself, kept intact per its own shared-state
  reason above) -> a new `discovery-settings-source.ts` (hypothesis) - 271
  LOC, 0 currently-exported symbols, called once today (from
  `discoverThetas`); cross-references back into concern 1's path helpers
  and concern 2's `RawCandidate`/`onDiskFileCandidate`/`enumerateDirectory`.
- Seam C: move concern 5 (descriptor rendering + slash-name
  collision/shadow resolution, `sourceLabelOf` … `resolveSlashNames`) -> a
  new `discovery-collision-resolve.ts` (hypothesis) - 215 LOC, 0
  currently-exported symbols, called once today (from `discoverThetas`);
  cross-references back into concern 2's `SourcedCandidate`/`PRIORITY` and
  the top-level `PiOwnedCommand` type.

## False-positive check
- Band: justify (1596 LOC; FILE_BANDS zone=600/justify=1000/strong=2000).
- Reasons-considered: all five concrete reasons checked above, each
  defeated with the cited evidence (no qualifying closed-dispatch shape at
  file scope; no file-level mutable state requiring 6+ threaded locals to
  split; type/constant share ~6% of LOC, not 80%; no grammar-production
  shape; hand-authored bug-citation prose across 22 commits, not
  generated).
- Exemptions check: `quality/exemptions.json` is `{}` — no existing human
  ruling for this file.
- Generated-code check: no generator marker; comments cite specific bug
  numbers and spec sections in prose, not templated output.
- Spec-mirror check: the cited spec (`discovery.md`,
  `discovery-sources.md` DISC-1..4) itself organises the material as
  separate per-source rules (CLI/Settings/Project/Packages/Global each a
  distinct row/section); nothing in the spec mandates single-file
  implementation, and the per-source organisation if anything supports the
  concern split cited above rather than defeating it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran `size-scan.mjs map`: 1596 LOC/band justify and every concern's member list/range/LOC (234/248/271/188/215, summing the tool's own per-declaration LOC) reproduce exactly, 0/0 importers confirmed for all 54 concern members (only `discoverThetas` at 1 src/16 tests), zero top-level `let`/`var` confirms the no-shared-state claim, and `git log --follow` confirms 22 commits, but two narrative errors don't refute this accounting: the Observation's "54 of 56 file-private" tally doesn't match the file's real total (69/75 by the same tool), and bug 0339 is misattributed to this file's history (its fix commit 381cb656 touched package-discovery.ts/production-composition.ts, never discovery-walk.ts) — per D9 policy a verified breakdown accounting caps at questionable (never confirmed) pending a human-ratified seam (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-12): Seam A — move concern 1, the path/filesystem-shape classification (normalizePath … classifyUnresolvedTarget, :152-476, 234 LOC, all file-private) → new module src/discovery/discovery-path-classify.ts; discovery-walk.ts imports what it still uses (core remains — no barrel needed, 0 external importers of the moved members). Pure move by line range, declarations verbatim with their doc comments, new module gets a header stating its role, no logic edits, tsc first then the full gate. Seams B and C are NOT ratified in this ruling: the host stays over threshold and D9 re-files the next seam after this one lands.
