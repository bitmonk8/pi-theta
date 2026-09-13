---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: package-discovery.ts bundles six separable package-discovery concerns in one 710-LOC file
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/package-discovery.ts:1-710
  - src/discovery/package-discovery.ts:46-86
  - src/discovery/package-discovery.ts:95-123
  - src/discovery/package-discovery.ts:129-194
  - src/discovery/package-discovery.ts:200-286
  - src/discovery/package-discovery.ts:292-554
  - src/discovery/package-discovery.ts:561-710
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/discovery/package-discovery.ts # D9 breakdown only: the exemption key
d9_band: zone                 # D9 breakdown only: zone | justify | strong
wave: qw20260913183958
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-13
---

# package-discovery.ts bundles six separable package-discovery concerns in one 710-LOC file

## Observation
`src/discovery/package-discovery.ts` is 710 LOC (band zone: 600-999), owning
"Package discovery (bounded walk)" per its own header: walking the five
installed-package roots, resolving each candidate's `pi.theta` manifest (or
its conventional `theta/` fallback), subject to the DISC-6 file-count /
wall-clock bounds and a per-read deadline. It already imports its POSIX path
helpers, `renderSourceDescriptor`, and `walkTree` from the sibling
`discovery-path-classify.ts` (the PTQ-0281/0286/0287 extraction) rather than
keeping its own copies — this filing is about what remains bundled inside the
file itself. The zone band files only on 2-or-more-concern evidence; the
inventory below shows six.

## Evidence
Distinct-concern inventory (line ranges/LOC from the structural map; every
member re-verified present at the cited lines by direct read):

| concern | members | line ranges | LOC |
|---|---|---|---|
| package-discovery types, diagnostic codes, and bound defaults | PackageDiscoveryInput, PackageDiscoveredTheta, PackageDiscoveryResult, DEFAULT_SCAN_PACKAGES(_MAX_FILES/_TIMEOUT_MS), the 6 `theta/load/*` code consts | 46-86 | 28 |
| package-relative POSIX path/JSON-kind helpers (not shared with discovery-path-classify.ts) | normalizePosix, jsonKind | 95-123 | 27 |
| bounded filesystem probes + the manual per-read deadline race | isDirectory, isFileHelper, readdirOr, ReadOutcome, readWithDeadline | 129-194 | 55 |
| candidate-package enumeration across the five installed-package roots | RootLayout, PackageRoot, CandidatePackage, packageRoots, enumerateRoot | 200-286 | 69 |
| package-tree enumeration + DISC-5 `pi.theta` override resolution | TreeEntry, TreeWalk, listTree, matchesGlob, matchesExact, escapesPackage, resolvePiThetas, thetasInDirectory, readPiThetasField, isStringArray | 292-554 | 209 |
| per-package manifest resolution + the DISC-6 bounded-walk driver | resolvePackage, discoverPackageThetas | 561-710 | 137 |

Concern 1 excerpt (package-discovery.ts:81-86):
```ts
const MANIFEST_INVALID = "theta/load/manifest-invalid";
const MANIFEST_ESCAPES_PACKAGE = "theta/load/manifest-escapes-package";
const DISCOVERY_SLOW = "theta/load/discovery-slow";
const PACKAGE_READ_TIMEOUT = "theta/load/package-read-timeout";
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
```

Concern 3 excerpt (package-discovery.ts:161-168 — a self-contained
`fs`/`path`/`deadlineMs`/`clock` primitive with no dependency on any other
concern):
```ts
async function readWithDeadline(
  fs: FileSystem,
  path: string,
  deadlineMs: number,
  clock: Clock,
): Promise<ReadOutcome> {
  return new Promise<ReadOutcome>((resolve) => {
    let settled = false;
```

Concern 4 excerpt (package-discovery.ts:214, 221-224):
```ts
function packageRoots(fs: FileSystem): readonly PackageRoot[] {
  const cwd = fs.cwd();
  …
  const configDir = fs.configDirName();
  const globalAgentDir = fs.globalAgentDir();
  return [
    { path: joinPosix(cwd, `${configDir}/npm`), layout: "npm" },
```

Concern 5 excerpt (package-discovery.ts:361-368 — `resolvePiThetas`, 105 LOC,
self-contained: takes `fs`/`pkgRoot`/`pkgName`/`entries`/`diagnostics`/`roots`):
```ts
async function resolvePiThetas(
  fs: FileSystem,
  pkgRoot: string,
  pkgName: string,
  entries: readonly string[],
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<Map<string, string>> {
  const plain: string[] = [];
```

Concern 6 excerpt (package-discovery.ts:613-619):
```ts
export async function discoverPackageThetas(
  input: PackageDiscoveryInput,
): Promise<PackageDiscoveryResult> {
  const { fs, clock, settings } = input;
  const thetas: PackageDiscoveredTheta[] = [];
  const diagnostics: Diagnostic[] = [];
  const roots = new Set<string>();
```

Every member above is file-private except the exports the map lists at 0
src-importers (`PackageDiscoveryInput` 0/6, `PackageDiscoveredTheta` 0/5,
`PackageDiscoveryResult` 0/1 — test-only) and `discoverPackageThetas` itself
(1 src / 7 test importers) — the single production call site
(`extension/production-composition.ts`, per PTQ-0064's own confirmed search).
Two functions the map separately flags over the function threshold sit
inside concerns 5 and 6: `resolvePiThetas` (361-465, 105 LOC, concern 5) and
`discoverPackageThetas` (613-710, 98 LOC, concern 6).

## Why this is a problem
The zone band files on the 2-or-more-concern inventory itself; the table
above shows six, each with its own closed input set and no cross-concern
mutable state:
- Concerns 1-4 (types/constants, path/JSON helpers, the deadline-race
  primitive, and root enumeration) share no runtime state with each other —
  each is called at most once from concern 6's driver or concern 5's walk,
  through ordinary parameters (`fs`, `clock`, `root`, `path`, `deadlineMs`).
- Concern 5 (`resolvePiThetas` plus its tree-walk/override-match
  neighbours) implements the identical DISC-5 four-step override order
  (plain includes → `!` drops → `+` re-admits → `-` removes) that
  `discovery-walk.ts`'s sibling `resolveSettingsSource` implements for the
  settings source — a comparable single-function shared-state case
  (`plain`/`bang`/`plus`/`minus`/`selected`/`universe`/`unreadable`/`thetas`
  all threaded through one connected pipeline), which defends
  `resolvePiThetas`'s own body staying intact when relocated, not the
  surrounding concerns staying bundled with it.
- Concern 6 (`discoverPackageThetas`) is the DISC-6 bounded-walk driver
  (`start`/`filesRead`/`aborted`/`registered`/`seenPackages` threaded
  through one double loop) — again a reason for that one function's body
  to stay whole, not a reason concerns 1-5 must share its file.
Reasons considered for the file as a whole: closed-enumeration dispatch does
not apply (no spec-named closed set spans the six concerns); data-only
module does not apply (concern 1's 28 LOC is 4% of 710, far under 80%); one
grammar production family does not apply (not a parser); generated code does
not apply (hand-authored bug/spec citations throughout, e.g. DISC-5, DISC-6,
bug 0339). None of the six concerns needs the others in the same file to
stay internally coherent.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one.
- Seam A: move concern 5 (package-tree enumeration + DISC-5 `pi.theta`
  override resolution, `TreeEntry` … `isStringArray`, whole — including
  `resolvePiThetas`/`thetasInDirectory` kept intact per their own
  shared-state shape) -> a new `package-manifest-resolve.ts` (hypothesis) -
  209 LOC (292-554), 0 currently-exported symbols (0/0 importers today),
  called from concern 6's `resolvePackage`; cross-references back into
  concern 1's diagnostic-code consts and the shared
  `discovery-path-classify.ts` helpers already imported here.
- Seam B: move concern 3 (bounded filesystem probes + the per-read deadline
  race, `isDirectory` … `readWithDeadline`) -> a new
  `bounded-read.ts` (hypothesis) - 55 LOC (129-194), 0 currently-exported
  symbols, called once today (from concern 6's `discoverPackageThetas`); no
  cross-reference back into this file beyond the call itself.
- Seam C: move concern 4 (candidate-package root enumeration, `RootLayout`
  … `enumerateRoot`) -> a new `package-roots.ts` (hypothesis) - 69 LOC
  (200-286), 0 currently-exported symbols, called once today (from
  `discoverPackageThetas`); cross-references back into the shared
  `discovery-path-classify.ts` `joinPosix` import already present.

## False-positive check
- Band: zone (710 LOC; FILE_BANDS zone=600/justify=1000/strong=2000) — filed
  on the 6-row concern inventory above (≥2 required).
- Reasons-considered: closed-enumeration dispatch, data-only module, one
  grammar production family, and generated code all checked and defeated
  above with counts; single-algorithm-with-shared-state is real for
  `resolvePiThetas` and `discoverPackageThetas` individually (each threads
  ≥5 mutable locals through one loop/closure set) but that argues for
  keeping each function's own body whole on relocation, not for keeping
  concerns 1-4 bundled with them.
- Exemptions check: `quality/exemptions.json` has one entry
  (`D9:src/binder/binder-system-prompt.ts#normaliseParamLineBreaks`) — none
  for this file or any of its functions.
- Generated-code check: no generator marker; hand-authored comments cite
  DISC-5/DISC-6 and specific bugs (0339, 0363's sibling reasoning) in prose.
- Spec-mirror check: `package-and-settings.md` documents the five
  installed-package roots, the `pi.theta` override grammar, and the DISC-6
  bounded-walk/per-read-deadline rule as separate normative subsections;
  nothing mandates single-file implementation, and the file's own concern
  boundaries track those subsections closely.
- Duplication-adjacent check: `PTQ-0286`/`PTQ-0287` (resolved, D4) already
  cover this file's POSIX-helper and `listTree`-walker duplication against
  `discovery-walk.ts`; `PTQ-0284` (resolved, D4) covers its inline
  `<kind>:"<value>"` descriptor triplication; `PTQ-0064` (resolved, D2)
  covers the three now-unexported bound-default constants. None of the
  three addresses this file's own internal concern bundling, which is what
  this filing is about.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — re-ran `node tools/quality/size-scan.mjs map`: reproduces 710 LOC/band zone and every concern's line-range/LOC sum (28/27/55/69/209/137) exactly from the tool's own per-declaration table, and independent grep reproduces the exact importer counts cited (PackageDiscoveryInput 0/6, PackageDiscoveredTheta 0/5, PackageDiscoveryResult 0/1, discoverPackageThetas 1/7); zero module-level mutable state confirms the no-shared-state claim; reasons-considered (closed-enumeration dispatch, data-only module at 4%, grammar family, generated code) correctly defeated, and the single-function shared-state case for resolvePiThetas/discoverPackageThetas is correctly scoped to those bodies, not the file; exemptions.json and the package-and-settings.md spec-mirror claims both reproduce as stated; two illustrative excerpts (concern 4's second half, concern 6's last line) cite lines ~4 off their true position (225-228/622 vs. the stated 221-224/613-619) though the quoted text is verbatim nearby — per D9 policy an accurate breakdown accounting caps at questionable, never confirmed, pending a human-ratified seam (triage: claude-opus-5)
