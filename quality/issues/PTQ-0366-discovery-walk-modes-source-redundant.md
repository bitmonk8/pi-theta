---
id: PTQ-0366
title: enumerateDirectory, resolveEntry, and collectFromEntries each carry a FailureModes parameter whose value is fully determined by the DiscoverySource parameter already passed
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-walk.ts:106-113
  - src/discovery/discovery-walk.ts:239-249
  - src/discovery/discovery-walk.ts:252-254
  - src/discovery/discovery-walk.ts:561-564
  - src/discovery/discovery-walk.ts:685-699
  - src/discovery/discovery-walk.ts:730-739
  - src/discovery/discovery-walk.ts:773-790
  - src/discovery/discovery-walk.ts:821-855
  - src/discovery/discovery-walk.ts:840-850
  - src/discovery/discovery-model.ts:138-144
  - src/discovery/discovery-model.ts:153-167
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/discovery/discovery-walk.ts # D8 only: the exemption key
wave: qw20260915044704
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-15
---

# enumerateDirectory, resolveEntry, and collectFromEntries each carry a FailureModes parameter whose value is fully determined by the DiscoverySource parameter already passed

## Observation
Three module-private functions in `discovery-walk.ts` — `enumerateDirectory`, `resolveEntry`, and `collectFromEntries` — each declare both a `source: DiscoverySource` parameter and a `modes: FailureModes` parameter, and thread `modes` untouched through every call in the chain. At every real call expression in the file, `modes`'s value is completely determined by which `source` value is passed alongside it: `"cli"` always pairs with `CLI_MODES`, `"settings"` always pairs with `SETTINGS_MODES`, and `"project"`/`"global"` always pair with `CONVENTIONAL_MODES` — a fixed three-way function of the five-member `DiscoverySource` union, never an independently-chosen value. The job these three functions do — enumerate or classify one discovery-source entry and pick a diagnostic severity on failure — needs only the one discriminant (`source`) already being passed; `modes` is a second, always-redundant parameter with no independent degree of freedom in the code as written.

## Evidence

**`enumerateDirectory`'s signature, discovery-walk.ts:106-113 — both parameters declared:**
```ts
async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
```

**`resolveEntry`'s signature, discovery-walk.ts:239-249 — same pair, one function up the chain:**
```ts
async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string | undefined,
  source: DiscoverySource,
  descriptorValue: string,
  modes: FailureModes,
  enoentPolicy: EnoentPolicy,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<RawCandidate[]> {
```

**`resolveEntry` forwards both, unmodified, into `enumerateDirectory` — discovery-walk.ts:252-254:**
```ts
    case "dir":
      roots.add(normalizePath(path));
      return enumerateDirectory(fs, path, source, descriptorValue, modes, diagnostics);
```

**`collectFromEntries`'s signature (excerpt), discovery-walk.ts:828-837 of 821-855 — same pair, one function further up:**
```ts
    readonly descriptor?: string;
    readonly enoentPolicy: EnoentPolicy;
    readonly descriptorValue: string;
  }[],
  source: DiscoverySource,
  modes: FailureModes,
  out: SourcedCandidate[],
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<void> {
```

**`collectFromEntries` forwards both, unmodified, into `resolveEntry` — discovery-walk.ts:840-850:**
```ts
    const raw = await resolveEntry(
      fs,
      entry.path,
      entry.descriptor,
      source,
      entry.descriptorValue,
      modes,
      entry.enoentPolicy,
      diagnostics,
      roots,
    );
```

**Site 1 — CLI, discovery-walk.ts:685-699 — `"cli"` paired with `CLI_MODES`:**
```ts
  await collectFromEntries(
    fs,
    cliPaths.map((raw, index) => ({
      path: expandHome(raw, fs),
      descriptor: `--theta flag #${index + 1}`,
      // Computed from the RAW operand, before `expandHome`: the DISC-5 prefix
      // question is about what the operator typed, and `~` expansion cannot
      // itself introduce or remove a leading `!`/`+`/`-`.
      enoentPolicy: hasOverridePrefix(raw) ? ("missing" as const) : ("ancestor-walk" as const),
      // The cli-flag descriptor VALUE is the raw operand as passed — verbatim,
      // no `expandHome`/`normalizePath` (placeholder-rendering-b.md §5).
      descriptorValue: `--theta ${raw}`,
    })),
    "cli",
    CLI_MODES,
```

**Site 2 — project/global, discovery-walk.ts:730-739 — the only two `source` values ever paired with `CONVENTIONAL_MODES`:**
```ts
  }[] = [
    {
      source: "project" as const,
      path: joinPosix(fs.cwd(), `${configDir}/theta`),
    },
    {
      source: "global" as const,
      path: joinPosix(fs.globalAgentDir(), "theta"),
    },
  ];
```
…and the shared call both loop iterations reach, discovery-walk.ts:784-790 of 773-790:
```ts
      ],
      root.source,
      CONVENTIONAL_MODES,
      candidates,
      diagnostics,
      roots,
    );
```

**Site 3 — settings, discovery-walk.ts:561-564 — `"settings"` paired with `SETTINGS_MODES`, a literal call bypassing `collectFromEntries`:**
```ts
  const addDir = async (dir: string, descriptorValue: string): Promise<void> => {
    roots.add(normalizePath(dir));
    for (const cand of await enumerateDirectory(fs, dir, "settings", descriptorValue, SETTINGS_MODES, diagnostics)) {
      selected.set(cand.path, { ...cand, descriptorValue });
```

**The three `FailureModes` constants these three sites draw from, and the sibling `PRIORITY` table already keyed directly off `DiscoverySource` — discovery-model.ts:138-144 and :153-167:**
```ts
export const PRIORITY: Record<DiscoverySource, number> = {
  cli: 1,
  settings: 2,
  project: 3,
  package: 4,
  global: 5,
} as const;
```
```ts
export const CONVENTIONAL_MODES: FailureModes = {
  missing: null,
  unreadable: "warning",
  wrongType: "warning",
} as const;
export const SETTINGS_MODES: FailureModes = {
  missing: "error",
  unreadable: "warning",
  wrongType: "error",
} as const;
export const CLI_MODES: FailureModes = {
  missing: "error",
  unreadable: "error",
  wrongType: "error",
} as const;
```

All three functions are module-private (0 src / 0 test importers per the structural map for `enumerateDirectory`, `resolveEntry`, and `collectFromEntries`), so `discoverThetas` — the file's sole exported entry point — is the only possible source of a `(source, modes)` pair, and the three call expressions above (`collectFromEntries` ×2, the literal `enumerateDirectory` call ×1) are the only places any such pair is ever constructed. "package" never reaches any of these three functions at all (package candidates are pushed directly as `SourcedCandidate`s, discovery-walk.ts:793-804), so the correlation is total over every reachable case: `cli → CLI_MODES`, `settings → SETTINGS_MODES`, `{project, global} → CONVENTIONAL_MODES`, 3-for-3.

## Why this is a problem
Neither the type system nor any comment ties `modes` to `source`: `modes: FailureModes` carries no compile-time link to the `DiscoverySource` literal passed beside it, so a future call site inside this file could pass a mismatched pair (e.g. `source: "project"` with `CLI_MODES`) and nothing would catch it — the mismatch would silently upgrade or downgrade a source's failure severities relative to what `discovery-sources.md`'s per-source table intends, with no diagnostic, no type error, and no test failure unless a test happened to exercise that exact combination. This file has already had this exact class of risk — two independently-threaded values that must stay in lockstep but are not derived from one another — named and fixed once before, a few lines away: `emitSourceFailure`'s own current body derives its `code` from its `kind` parameter (discovery-walk.ts:321-322, `` `code` is a fixed 1:1 function of `kind` ``) specifically so the two cannot drift apart, and `resolveEntry`'s `classifyForSource` call now reads `descriptor !== undefined` in place of a separate `explicitFile` boolean for the same reason (both fixed under PTQ-0318, confirmed and ratified for this file). The `source`/`modes` pair in `enumerateDirectory` / `resolveEntry` / `collectFromEntries` is the same shape of redundancy, left unreconciled in the three sibling functions one call-hop away from where that exact lesson was already applied. The sibling module `discovery-model.ts` even already keys a per-source policy value directly off `DiscoverySource` via `PRIORITY: Record<DiscoverySource, number>` (cited above) — the established idiom this file's own `PRIORITY[candidate.source]` reads lean on elsewhere — so threading `modes` as a second, independent parameter is an extra concept the codebase's own precedent shows is unnecessary for a value that is, in fact, a pure function of `source`.

## Suggested direction (non-binding, optional)
Unproven hypothesis: add a `Record<DiscoverySource, FailureModes>` lookup beside `PRIORITY` in `discovery-model.ts` (covering the three sources that reach these functions; `package` and `settings`-via-`resolveSettingsSource`'s own already-inlined `SETTINGS_MODES` reads are unaffected) and have `enumerateDirectory` / `resolveEntry` / `collectFromEntries` derive `modes` from `source` internally, dropping the `modes` parameter from all three signatures. A human confirms no call site (inside or outside this file) ever needs to pass a `source`/`modes` combination the lookup would not produce.

## False-positive check
Grepped every call of `enumerateDirectory(`, `resolveEntry(`, and `collectFromEntries(` in `discovery-walk.ts` (8 total hits: 3 declarations + 5 call expressions) and read each in full context; the `source`→`modes` correlation holds at 100% of the 3 distinct call expressions that construct a fresh pair (the other 2 hits are pure forwards of an already-correlated pair, cited above). Confirmed via the structural map that all three functions are module-private with 0 src/test importers, so no external caller — production or test — could be relying on an independent combination this review did not see; only `discoverThetas` inside this same file can ever originate a `(source, modes)` pair, and every one of its three origin points was read. Checked for a stated rationale for the redundancy (the D2 "knob whose rationale is stated in code… is a design decision" carve-out): `enumerateDirectory`'s doc comment explains why `modes`/`descriptorValue` are threaded at all ("so the failure emits from the one place the rejection is observed") but never explains why `source` must ALSO be threaded independently rather than being the sole discriminant `modes` is derived from; no comment anywhere states a reason two sources could ever need the same `modes` value passed under a different label, or vice versa — this is not a documented design decision being second-guessed. No `docs/spec_topics/` clause names a `source`/`modes` PARAMETER shape (discovery-sources.md's failure-mode table is a per-source POLICY table, which a `Record<DiscoverySource, FailureModes>` — the same shape `PRIORITY` already uses — preserves exactly), so no `challenges_spec` applies. Exemption check: the D8 durable-exemption list carries one entry for this file, `discovery-walk.ts#enumerateDirectory` (`heavier-than-scale`, ratified 2026-09-14, about an extra `fs.readdir` call) — this filing's `d8_class` is `overbuilt`, a distinct class from that ruling, and the ruling itself says nothing about `enumerateDirectory`'s parameter shape, so re-filing against this file with a distinct class is within the stated allowance. Distinct from PTQ-0318 (confirmed, fixed, this same file): that finding's two concepts were `emitSourceFailure`'s `code`/`kind` pair and `resolveEntry`'s `descriptor`/`explicitFile` pair, both already absent from the current `emitSourceFailure`/`resolveEntry` signatures re-read above — this filing names a third, still-present pair (`source`/`modes`) neither of PTQ-0318's two concepts covered. Also distinct from the do-not-refile list's `PTQ-0298` (a D4 finding about a repeated Map bucket-building loop, since fixed) and the wave's own D2/D4 intake files on this file (header-citation staleness and a `compareCodePoint` clone) — none of those name a parameter-redundancy shape.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting independently re-verified (source→modes correlates 1:1 at all 3 fresh construction sites: cli/CLI_MODES :685-699, {project,global}/CONVENTIONAL_MODES :773-790, settings/SETTINGS_MODES :561-564; the 2 forwarding call sites :254/:840 preserve it; all three functions confirmed module-private, 0 external importers), distinct from PTQ-0318 (its code/kind and descriptor/explicitFile pairs are confirmed already fixed in current code) and not covered by the enumerateDirectory heavier-than-scale exemption (differing d8_class); per D8 protocol an accurate redundant-parameter accounting caps at questionable — adopting the simpler Record<DiscoverySource,FailureModes> shape is a human design call (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-15): drop the redundant parameter. Add beside PRIORITY in discovery-model.ts a per-source failure-mode lookup mirroring the DISC-2 table (hypothesis MODES_BY_SOURCE): cli -> CLI_MODES, settings -> SETTINGS_MODES, project and global -> CONVENTIONAL_MODES. Do NOT invent a row for package (it never reaches these functions): type the lookup Record<Exclude<DiscoverySource, 'package'>, FailureModes> and narrow the three functions' source parameter to the same key type, so a package call fails tsc. enumerateDirectory / resolveEntry / collectFromEntries derive modes from source internally and lose the modes parameter; the three constants stay (the lookup references them; resolveSettingsSource's inline SETTINGS_MODES read is unchanged). Identical severities at every call site; tests unchanged. Host-lane: runs after the D9 lane on discovery-walk.ts — if Seam B has moved enumerateDirectory/resolveEntry into discovery-source-enumerate.ts by then, apply the change there (follow the functions; the d8_host key is stale in that case).
