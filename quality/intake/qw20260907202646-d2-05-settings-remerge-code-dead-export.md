---
id: pending
title: SETTINGS_REMERGE_FAILED_CODE is exported from reload-wiring.ts but read only by the injector arm in the same module
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/reload-wiring.ts:305-313
  - src/extension/reload-wiring.ts:415-421
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SETTINGS_REMERGE_FAILED_CODE is exported from reload-wiring.ts but read only by the injector arm in the same module

## Observation
`reload-wiring.ts` declares `SETTINGS_REMERGE_FAILED_CODE` as an `export const`
next to `REGISTRY_SWAP_FAILED_CODE`. Its single read is inside the same module,
in the `settings-remerge` arm of `createReloadFailureInjector`. No module in
`src/`, `extensions/`, or `tools/` imports the name, and no test imports it
either — unlike its sibling `REGISTRY_SWAP_FAILED_CODE`, which several modules
and tests do import.

## Evidence
src/extension/reload-wiring.ts:305-313 — the declaration:

```ts
/**
 * The diagnostics-registry code the watcher-time settings-re-merge arm re-
 * produces (V10d). Per package-and-settings.md §"Watcher-time reload failures"
 * the re-merge arm re-emits a load-phase `theta/load/settings-*` diagnostic (a
 * re-merge of a changed settings file that fails to re-parse), not the
 * registry-swap arm's `theta/runtime/registry-swap-failed` — this is the
 * "re-parse / re-merge diagnostic" arm V4g distinguishes from the swap arm.
 */
export const SETTINGS_REMERGE_FAILED_CODE = "theta/load/settings-invalid-json";
```

src/extension/reload-wiring.ts:415-421 — the only read, module-internal:

```ts
      if (arm === "settings-remerge") {
        deps.emitDiagnostic({
          severity: "error",
          code: SETTINGS_REMERGE_FAILED_CODE,
          message: `settings re-merge failed: <injected:${arm}>`,
          hint: error.message,
        });
      }
```

Reference search: `grep -rnw "SETTINGS_REMERGE_FAILED_CODE"` across `src/`,
`tests/`, `tools/`, `extensions/`, `docs/`, `skills/`, `config/` for `*.ts`,
`*.md`, `*.json` → 2 hits, exactly the declaration and the read above.

## Why this is a problem
Dead export surface, proven dead: the constant is alive (the injector arm reads
it) but the `export` modifier reaches nothing — no import in `src/`,
`extensions/`, `tools/`, or `tests/`, no namespace import, no barrel re-export,
no string-keyed access. The neighbouring `REGISTRY_SWAP_FAILED_CODE` shows what
a consumed export of this shape looks like in the same file (imported by three
test files), so the asymmetry is visible in place: one of the two code constants
publishes a contract that no importer anywhere consumes.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the code constant is module-private, as the
injector arm is its only reader.

## False-positive check
- Reference searches run: `grep -rnw "SETTINGS_REMERGE_FAILED_CODE"` over `src`,
  `tests`, `tools`, `extensions`, `docs`, `skills`, `config` (`*.ts`, `*.md`,
  `*.json`) → the two in-module hits only.
- Quoted / dynamic access: grep for `"SETTINGS_REMERGE_FAILED_CODE"` as a string
  literal and for `export *` / `import * as` involving `reload-wiring` → 0 hits.
- Distinguished from the code's literal value: the string
  `"theta/load/settings-invalid-json"` is referenced elsewhere (settings parsing
  and its tests) by its own literal, not through this constant, so removing the
  export changes no consumer's access path. That other-site literal use is a
  separate matter and is not claimed here.
- Tests-only-caller rule considered: not applicable — no test references the
  identifier at all, so this is not test-only-reachable production code.
- Sibling comparison verified: `grep -rn "REGISTRY_SWAP_FAILED_CODE" src tests
  --include=*.ts` → imported outside the module by
  tests/registration-reload-wiring.test.ts:14,
  tests/hot-reload-stale-ctx-replacement.test.ts:69 and
  tests/watcher-hot-reload-integration.test.ts:17, confirming that consumed
  exports of this shape do appear in importers.
- Duplicate check: `grep -rn "SETTINGS_REMERGE\|reload-wiring" quality/intake` →
  qw20260907130901-d2-05-system-note-four-arm-comment-stale.md and
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md (citing
  :17-19, :221-222, :249-250, :261); neither covers this constant.

## Triage
