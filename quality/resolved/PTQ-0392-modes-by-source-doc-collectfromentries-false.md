---
id: PTQ-0392
title: discovery-model.ts's MODES_BY_SOURCE doc comment claims collectFromEntries derives modes through the lookup, but that function never references MODES_BY_SOURCE
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/discovery-model.ts:169-176
  - src/discovery/discovery-source-enumerate.ts:64-71
  - src/discovery/discovery-source-enumerate.ts:197-207
  - src/discovery/discovery-walk.ts:594-608
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# discovery-model.ts's MODES_BY_SOURCE doc comment claims collectFromEntries derives modes through the lookup, but that function never references MODES_BY_SOURCE

## Observation
`discovery-model.ts`'s doc comment on `MODES_BY_SOURCE` states that `enumerateDirectory`, `resolveEntry`, and `collectFromEntries` "derive `modes` from `source` through this lookup instead of threading it alongside `source` as a second, independently suppliable parameter." `enumerateDirectory` and `resolveEntry` (both in `discovery-source-enumerate.ts`) do index `MODES_BY_SOURCE[source]` directly. `collectFromEntries` (in `discovery-walk.ts`) does not: its body never reads `modes` or `MODES_BY_SOURCE`; it only forwards its own `source` parameter into a call to `resolveEntry`, which performs the lookup internally.

## Evidence
`src/discovery/discovery-model.ts:169-176` — the doc comment naming all three functions as deriving `modes` through the lookup:
```ts
/** Per-source failure-mode severities, keyed directly off `DiscoverySource`
 *  the same way `PRIORITY` already is. `enumerateDirectory` / `resolveEntry`
 *  / `collectFromEntries` derive `modes` from `source` through this lookup
 *  instead of threading it alongside `source` as a second, independently
 *  suppliable parameter — the two never varied independently at any call
 *  site (PTQ-0366). `package` is excluded from the key type: its candidates
 *  are pushed directly as `SourcedCandidate`s and never reach those three
 *  functions, so there is no row to give it. */
```

`src/discovery/discovery-source-enumerate.ts:64-71` — `enumerateDirectory` genuinely deriving `modes` via the lookup:
```ts
export async function enumerateDirectory(
  fs: FileSystem,
  dir: string,
  source: Exclude<DiscoverySource, "package">,
  descriptorValue: string,
  diagnostics: Diagnostic[],
): Promise<RawCandidate[]> {
  const modes = MODES_BY_SOURCE[source];
```

`src/discovery/discovery-source-enumerate.ts:197-207` — `resolveEntry` likewise:
```ts
export async function resolveEntry(
  fs: FileSystem,
  path: string,
  descriptor: string | undefined,
  source: Exclude<DiscoverySource, "package">,
  descriptorValue: string,
  enoentPolicy: EnoentPolicy,
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<RawCandidate[]> {
  const modes = MODES_BY_SOURCE[source];
```

`src/discovery/discovery-walk.ts:594-608` — `collectFromEntries`'s `source` parameter and its complete remaining use, forwarded straight to `resolveEntry` with no `modes`/`MODES_BY_SOURCE` step of its own:
```ts
  source: Exclude<DiscoverySource, "package">,
  out: SourcedCandidate[],
  diagnostics: Diagnostic[],
  roots: Set<string>,
): Promise<void> {
  const sourceLabel = sourceLabelOf(source);
  for (const entry of entries) {
    const raw = await resolveEntry(
      fs,
      entry.path,
      entry.descriptor,
      source,
      entry.descriptorValue,
      entry.enoentPolicy,
      diagnostics,
```

## Why this is a problem
The comment's purpose is to justify why `MODES_BY_SOURCE` exists (PTQ-0366's fix: derive `modes` from `source` instead of threading a redundant, correlated second parameter), and it names `collectFromEntries` as one of the three sites that perform that derivation. `collectFromEntries` was one of the functions whose `modes: FailureModes` parameter PTQ-0366's fix deleted, but the fix did not give `collectFromEntries` an internal `MODES_BY_SOURCE` lookup to replace it — it gave that lookup to `resolveEntry` alone, and `collectFromEntries` simply stopped needing `modes` in any form. A reader relying on this comment to find every `MODES_BY_SOURCE` call site would look for one inside `collectFromEntries` and find none.

## Suggested direction (non-binding, optional)
Narrow the doc comment's roster at lines 170-171 to the two functions that actually index `MODES_BY_SOURCE` (`enumerateDirectory`, `resolveEntry`), describing `collectFromEntries` separately as a pass-through that no longer touches `modes` in any form.

## False-positive check
- Ran `grep -n "MODES_BY_SOURCE" src/discovery/discovery-walk.ts` → no matches (exit code 1), confirming `collectFromEntries` (the only function in that file this comment names) never references the constant.
- Ran `grep -n "MODES_BY_SOURCE" src/discovery/discovery-source-enumerate.ts` → four hits: the import, this file's own doc-comment cross-reference, and the two `const modes = MODES_BY_SOURCE[source];` reads inside `enumerateDirectory` (line 71) and `resolveEntry` (line 207).
- Read `collectFromEntries` in full (`src/discovery/discovery-walk.ts:583-615`): its only use of `source` is to pass it straight through to `sourceLabelOf` and `resolveEntry`; no local named `modes` exists anywhere in the function.
- Ran `git show dc761274 -- src/discovery/discovery-walk.ts` (the PTQ-0366 fix commit): confirms it deletes `collectFromEntries`'s `modes: FailureModes` parameter and every call-site argument that supplied it, without adding any replacement read of `MODES_BY_SOURCE` inside that function.
- Checked the do-not-refile list and `quality/resolved/`: PTQ-0366 (resolved) covers the vestigial-parameter fix itself and is the commit that added `MODES_BY_SOURCE`; it does not discuss this residual overclaim in the new constant's own doc comment, and no other filing names it.
- This is a comment-accuracy claim, not a deadness claim: `MODES_BY_SOURCE`, `enumerateDirectory`, and `resolveEntry` are all live and correctly described; only `collectFromEntries`'s inclusion in the roster is inaccurate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — byte-exact at all four cited ranges; grep + full-body read confirm collectFromEntries (discovery-walk.ts:583-616) never touches modes/MODES_BY_SOURCE, and git show dc761274 (the cited fix, which authored this comment) shows it added the internal MODES_BY_SOURCE lookup only to enumerateDirectory/resolveEntry, never to collectFromEntries, confirming the comment's three-function roster overclaims it; distinct root cause from sibling qw20260917045205-d2-01 (different file/claim), no duplicate found (triage: claude-opus-5)
