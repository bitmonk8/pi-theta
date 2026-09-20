---
id: pending
title: discovery-walk.ts still bundles the DISC-5 settings thetaPaths sub-walk with the five-source driver after the ratified source-enumerate split landed
lens: D9
status: intake
verdict: pending
locations:
  - src/discovery/discovery-walk.ts:1-615
  - src/discovery/discovery-walk.ts:111-426
  - src/discovery/discovery-walk.ts:434-615
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/discovery/discovery-walk.ts
d9_band: zone
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# discovery-walk.ts still bundles the DISC-5 settings thetaPaths sub-walk with the five-source driver after the ratified source-enumerate split landed

## Observation
`src/discovery/discovery-walk.ts` is 615 LOC (band zone: 600-999), down from
the 855 LOC `PTQ-0367` measured. That finding's ratified Seam B — moving the
per-source enumeration concern (`RawCandidate`, `enumerateDirectory`,
`onDiskFileCandidate`, `resolveEntry`, `emitSourceFailure`) into
`discovery-source-enumerate.ts` — has landed (commit 46a063e0; the host's own
header at :17-25 confirms it: "live in `discovery-source-enumerate.ts`
(PTQ-0367, pre-announced by PTQ-0333 as 'concern 1')"). The ratification
deferred Seam A explicitly: "Seam A (the DISC-5 settings sub-walk ->
discovery-settings-source.ts) is NOT ratified this wave — it calls concern 1,
so it must land after Seam B or it imports back from the host (a cycle); D9
re-files it after, expect ratification then." Seam B has landed; this is that
pre-announced re-file. The file's sole exported function remains
`discoverThetas` (structural map: 1 src / 18 test importers); every member of
the settings sub-walk concern is file-private (0/0 importers each).

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every
member re-read at its cited lines before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| settings `thetaPaths` glob/override sub-walk (DISC-5) | TreeEntry, TreeWalk, listTree, emitUniverseFailures, staticPrefixRoot, globMatches, fileEntryOf, ParsedSettingsEntry, resolveSettingsOperand, resolveSettingsSource | 111-426 | 245 |
| five-source driver (the file's sole export; retained orchestrator) | discoverThetas, collectFromEntries | 434-615 | 181 |

Concern-1 excerpt (discovery-walk.ts:273-279 — self-contained: takes only
`fs`/`settings`/`diagnostics`/`roots`):
```ts
async function resolveSettingsSource(
  fs: FileSystem,
  settings: ThetaSettings,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<(RawCandidate & { readonly descriptorValue: string })[]> {
  const entries = settings.thetaPaths ?? [];
```

Concern-2 excerpt (discovery-walk.ts:434-437 — the sole caller of concern 1,
one call at :471):
```ts
export async function discoverThetas(input: DiscoveryInput): Promise<DiscoveryResult> {
  const { fs } = input;
  const diagnostics: Diagnostic[] = [];
  const candidates: SourcedCandidate[] = [];
```

The cycle blocker `PTQ-0367`'s ratification named is now gone: concern 1's
calls into the former enumeration concern (`enumerateDirectory` at :328,
`onDiskFileCandidate` at :349, `emitSourceFailure` at :368/:371/:374 and in
`emitUniverseFailures` at :175) all resolve through the
`./discovery-source-enumerate` import (:81-87), and no member of concern 1
references `discoverThetas`, `collectFromEntries`, or any other host-local
declaration — its remaining dependencies are the `discovery-path-classify` /
`discovery-model` imports and `minimatch`. A moved module would import
nothing back from the host.

## Why this is a problem
Zone band (615 LOC) — a breakdown files only on 2-or-more-concern evidence,
tabulated above as 2. Concern 2 (the driver) has its own defense and is not
the target: `discoverThetas` walks the fixed five-source priority order —
a closed enumeration the spec names (discovery.md /
discovery-sources.md DISC-1…DISC-4, plus the file's own header: "the five
discovery sources, in priority order") — and `collectFromEntries` is its
shared per-entry loop. That closed-enumeration defense does not reach
concern 1: `resolveSettingsSource` is not an arm of the priority walk but a
245-LOC self-contained sub-walk implementing a separately-specified grammar
(package-and-settings.md DISC-5's `!`/`+`/`-` override order), called into
once (:471), with every member file-private (0/0 importers per the map).
Reasons considered for keeping the file whole and why each fails: closed
enumeration — covers only concern 2, shown above; single algorithm with
shared local state — `resolveSettingsSource`'s locals (`selected`,
`treeCache`, `universeFailures`, `baseDir`, `parsed`) are shared across its
five inner closures, which defends that function's own body (it moves whole),
not the file boundary between the two concerns; data-only — the file is
behaviour, not tables; generated — no generator marker; and the prior human
ruling on record is for `package-discovery.ts`, not this file.

## Suggested direction (non-binding, optional)
Continuing `PTQ-0367`'s own pre-announcement; the human ratifies. Seam A: move
concern 1 whole (`TreeEntry` … `resolveSettingsSource`, :111-426) -> a new
`src/discovery/discovery-settings-source.ts` (hypothesis) - 245 LOC, 0
currently-exported symbols moved (the new module exports
`resolveSettingsSource` for the host's one call site at :471; external
importers of the moved symbols today: 0 src / 0 tests), cross-references back
into the host: none (dependencies are the `discovery-source-enumerate`,
`discovery-path-classify`, `discovery-model`, `minimatch` imports already
present). Marked unproven.

## False-positive check
- Band: zone (615 LOC; FILE_BANDS zone=600) — read from the supplied
  structural map, never recounted by hand.
- 2-or-more-concern evidence: 2 rows tabulated, each re-read at its cited
  lines immediately before filing.
- Exemptions check: quality/exemptions.json read in full — 4 entries; the
  only discovery-walk entry is D8 `#enumerateDirectory` (a function that has
  since moved to `discovery-source-enumerate.ts`); no ruling names this file
  as a whole.
- Generated-code check: header and body carry no `@generated`/`DO NOT EDIT`
  marker (full file read across three passes).
- Spec-mirror check: DISC-5 (`thetaPaths` override grammar,
  package-and-settings.md) is specified independently of the driver's source
  priority order (discovery-sources.md DISC-1…DISC-4); nothing mandates
  single-file implementation.
- Prior-finding check: PTQ-0281/0305/0333/0367 are the fixed ancestors of
  this chain; PTQ-0367's human ratification pre-announced exactly this
  re-file ("D9 re-files it after, expect ratification then") once Seam B
  landed — it has (commit 46a063e0; file 855 -> 615 LOC). This filing
  supplies fresh line ranges, LOC, and the now-resolved cycle-blocker
  evidence rather than reproducing the stale accounting.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 615 LOC / band zone with the 12 declarations at exactly the cited ranges (concern 1 = TreeEntry…resolveSettingsSource :111-426, 6+8+9+16+10+13+3+12+14+154 = 245 LOC; concern 2 = discoverThetas 434-581 + collectFromEntries 583-615 = 181 LOC; discoverThetas 1/18, every concern-1 member 0/0 — the only outside name hits are package-discovery.ts's own same-named private walker (PTQ-0287's known sibling) and prose inside test failure messages, never an import); both excerpts match verbatim at :273-279 and :434-437; the cross-reference claim holds both ways (sed :111-426 contains no discoverThetas/collectFromEntries reference; :434-615 touches concern 1 only via the single resolveSettingsSource call at :471), so the two rows share no module-scope state and are distinct concerns; the concern-1 calls into discovery-source-enumerate resolve through the :81-87 import (actual lines 173/326/349/367/370/373 — ≤2-line drift from the cited 175/328/368/371/374), confirming PTQ-0367's cycle blocker is gone; PTQ-0367's resolved-file triage note carries the human ratification verbatim including "Seam A … NOT ratified this wave … D9 re-files it after, expect ratification then", and Seam B landed in 46a063e0; exemptions.json's 4 entries confirmed non-applicable (the discovery-walk row is D8 #enumerateDirectory, since moved; the package-discovery.ts D9 ruling is a different host); no @generated marker, no discovery-settings-source.ts ever existed in git (no reverted split), and package-and-settings.md DISC-5 / discovery-sources.md DISC-1…4 are separately specified with nothing mandating one file; the earlier qw20260916144930-d9-02 filing of this same seam was wiped by the 53f815de store reset so no live duplicate exists; per D9 policy an accurate zone-band breakdown accounting caps at questionable — the seam/home is the human's ruling, never confirmed (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map reproduces 615 LOC / band zone (FILE_BANDS zone=600) with all 12 declarations at exactly the cited ranges (concern 1 TreeEntry…resolveSettingsSource :111-426 = 6+8+9+16+10+13+3+12+14+154 = 245 LOC; concern 2 discoverThetas :434-581 + collectFromEntries :583-615 = 181 LOC; discoverThetas 1/18, every concern-1 member 0/0 — my own grep across src/extensions/tools/tests finds no import of any concern-1 name outside the host, only a prose mention of globMatches in a test comment); both excerpts match verbatim at :273-279 and :434-437; cross-references hold both ways (sed :111-426 has zero references to discoverThetas/collectFromEntries; :434-615 touches concern 1 only via the single resolveSettingsSource call at :471) and the host declares no module-scope const/let, so the two rows share no state — a real ≥2-concern inventory; concern 1's dependencies all resolve through imports (emitSourceFailure/enumerateDirectory/onDiskFileCandidate/RawCandidate via the :81-87 discovery-source-enumerate import at actual lines 173/326/349/367/370/373, SETTINGS_MODES via discovery-model :68, path helpers via discovery-path-classify, minimatch), so PTQ-0367's cycle blocker is gone; reasons-considered not overlooked (closed enumeration covers only the driver; the DISC-5 override grammar lives entirely inside the moving block; no module-scope shared locals; behaviour not data; no @generated marker; no discovery-settings-source.ts ever existed in git so no reverted split; exemptions.json's 4 rows are D8 #enumerateDirectory (moved out), package-discovery.ts (different host), and two unrelated); PTQ-0367 (resolved/, fixed) carries the human ratification verbatim — "Seam A … NOT ratified this wave … D9 re-files it after, expect ratification then" — and Seam B landed in 46a063e0 (discovery-source-enumerate.ts +288); no other intake/issues filing names this seam; minor prose slip only (spec paths omit the docs/spec_topics/discovery/ subdirectory); per D9 policy an accurate zone-band breakdown accounting caps at questionable — the seam and home are the human's ruling, never confirmed (triage: claude-fable-5-1)
