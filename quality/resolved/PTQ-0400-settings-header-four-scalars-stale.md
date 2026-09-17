---
id: PTQ-0400
title: settings.ts's header says the extension owns "the four thetas.* scalars", but seven scalar keys (plus one object-valued key) are now recognised
lens: D2                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/discovery/settings.ts:1-4
  - src/discovery/settings.ts:176-184
  - src/discovery/settings.ts:186-190
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917095931
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# settings.ts's header says the extension owns "the four thetas.* scalars", but seven scalar keys (plus one object-valued key) are now recognised

## Observation
`settings.ts`'s top-of-file header says the theta extension "owns its own `settings.json` keys (`thetaPaths` plus the four `thetas.*` scalars)". The module's own `THETAS_SCALAR_KEYS` constant — the fixed inspection-order list the validator (`cleanSettingsFile`) iterates — currently lists seven scalar keys, not four, and the module additionally recognises one further, object-valued `thetas.*` key (`subagentPlacementExec`, validated separately via `THETAS_EXEC_TEMPLATE_KEY`) that the header's "scalars" phrasing does not cover at all.

## Evidence
`src/discovery/settings.ts:1-4` — the header's claim:
```ts
// V10c / V10c-T — Settings-source reads, validation, and merge.
//
// The theta extension owns its own `settings.json` keys (`thetaPaths` plus the
// four `thetas.*` scalars); Pi does not surface them. The extension reads the
```

`src/discovery/settings.ts:176-184` — the actual scalar-key roster the validator inspects, seven entries:
```ts
const THETAS_SCALAR_KEYS = [
  "binderModel",
  "scanPackages",
  "scanPackagesMaxFiles",
  "scanPackagesTimeoutMs",
  "progress",
  "subagentPlacement",
  "subagentPlacementMaxVisible",
] as const;
```

`src/discovery/settings.ts:186-190` — the eighth recognised `thetas.*` key, object-valued (not a scalar), validated through its own branch in `cleanSettingsFile` rather than `isScalarKeyValid`:
```ts
/**
 * RFC 0012 §4: the one object-valued `thetas.*` key, validated by the `exec`
 * template parser and honoured from the global file only.
 */
const THETAS_EXEC_TEMPLATE_KEY = "subagentPlacementExec";
```

`ThetasSettings` (the recognised, post-validation view interface, lines ~35-72 of the file) carries all eight fields as documented members: `binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`, `progress`, `subagentPlacement`, `subagentPlacementMaxVisible`, `subagentPlacementExec`.

## Why this is a problem
The header's key count is a factual claim about the module's surface ("the four `thetas.* `scalars"), and it no longer matches what the module validates: seven scalars (not four) plus a further non-scalar key the "scalars" phrasing excludes. The header reads as though it still describes V10c's original four-key `thetas.*` namespace (`binderModel`/`scanPackages`/`scanPackagesMaxFiles`/`scanPackagesTimeoutMs` — the RFC 0010 `progress` key and the RFC 0012 `subagentPlacement*` keys were added later), but the surrounding module has moved on while this summary line did not.

## Suggested direction (non-binding, optional)
Either drop the specific count from the header ("the `thetas.*` scalars" with no number) or update it to match `THETAS_SCALAR_KEYS`'s current length and mention the one object-valued key separately, so a reader is not sent looking for four keys and finding eight.

## False-positive check
- Read `THETAS_SCALAR_KEYS` in full (lines 176-184): seven string literals.
- Read `THETAS_EXEC_TEMPLATE_KEY` and its validation branch in `cleanSettingsFile` (the `subagentPlacementExec` handling that dispatches on `scope`): confirmed it is a distinct, object-valued key validated outside `isScalarKeyValid`/`THETAS_SCALAR_KEYS`.
- Read the `ThetasSettings` interface: all eight keys are present as documented optional members, each traceable to either `THETAS_SCALAR_KEYS` or `THETAS_EXEC_TEMPLATE_KEY`.
- Searched `quality/resolved/` and `quality/issues/` for `"thetas.\* scalars"` / `"four .*scalars"` — no prior filing on this header line.

## Triage
verdict: confirmed — header at settings.ts:3-4 still says "four `thetas.*` scalars" while THETAS_SCALAR_KEYS (:176-184) lists seven and THETAS_EXEC_TEMPLATE_KEY (:190) adds an eighth, object-valued key validated in its own cleanSettingsFile branch (:349-370); phrase predates commits 1dad42ac/4ec891b9 that added the keys; no prior PTQ on this line (triage: claude-fable-5-1)
verdict: confirmed — re-verified: settings.ts:3-4 still reads "four `thetas.*` scalars" (only "four" in the file) while THETAS_SCALAR_KEYS (:176-184) lists seven literals and THETAS_EXEC_TEMPLATE_KEY (:190) is an eighth, object-valued key validated in its own cleanSettingsFile scope-dispatch branch (:348-370); git -S confirms `progress` landed in 1dad42ac (RFC 0010) and subagentPlacement* in 4ec891b9 (RFC 0012) after the header was written; PTQ-0062 touched this header's :13-16 stub narration only, not the key count — no duplicate (triage: claude-fable-5-1)
