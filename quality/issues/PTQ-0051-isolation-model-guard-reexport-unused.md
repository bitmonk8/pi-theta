---
id: PTQ-0051
title: subagent-isolation.ts re-exports four model-guard symbols "so existing RFC-0005 importers keep resolving them" but three have no importer through this path and no RFC-0005 importer remains
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-isolation.ts:48-61
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# subagent-isolation.ts re-exports four model-guard symbols "so existing RFC-0005 importers keep resolving them" but three have no importer through this path and no RFC-0005 importer remains

## Observation
subagent-isolation.ts carries a compatibility re-export block forwarding four
PIC-62 symbols from subagent-model-guard.ts, justified as keeping "existing
RFC-0005 importers (and the isolation suite)" resolving unchanged. Today no
src/ module imports any of the four through subagent-isolation (the only src/
importer of the module takes `runSubagentChildTeardown`), and the isolation
suite imports none of them either. Three of the four re-exported bindings
(`SUBAGENT_MODEL_UNRESOLVED_MESSAGE`, `SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE`,
`renderModelPreflightMismatchMessage`) have zero importers through this path
anywhere — src/, tests/, extensions/, tools/. One binding
(`SUBAGENT_MODEL_UNRESOLVED_CODE`) is imported through it by a single test
file; every other consumer of these symbols imports subagent-model-guard.ts
directly.

## Evidence
src/runtime/subagent-isolation.ts:48-61 — the block and its rationale:

```ts
// The pre-spawn model guard itself is the SINGLE-SOURCE-OF-TRUTH
// `guardResolvedModel` in the PIC-62 module (`subagent-model-guard.ts`); the
// dead RFC-0005 `preSpawnModelGuard` duplicate that used to live here is deleted.
// The diagnostic codes / message / renderer are re-exported from here so
// existing RFC-0005 importers (and the isolation suite) keep resolving them
// unchanged.
export {
  SUBAGENT_MODEL_UNRESOLVED_CODE,
  SUBAGENT_MODEL_UNRESOLVED_MESSAGE,
  SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE,
  renderModelPreflightMismatchMessage,
} from "./subagent-model-guard";
```

Importers of the module (search: `from ["'].*subagent-isolation["']` across all
*.ts) — 3 hits:
- src/extension/production-theta-producer.ts:34 — imports `runSubagentChildTeardown` only;
- tests/subagent-isolation.test.ts:37-47 — imports the dispose/teardown/parallel symbols; none of the four re-exports ("the isolation suite" claim is stale);
- tests/subagent-model-theta-tool.test.ts:82 — imports `SUBAGENT_MODEL_UNRESOLVED_CODE` (the one live use of the block).

Direct consumers resolve from the owning module instead (search for the four
identifiers across all *.ts):
- src/extension/production-theta-producer.ts:62-66 — `SUBAGENT_MODEL_UNRESOLVED_MESSAGE` from `../runtime/subagent-model-guard`;
- tests/host-peer-version-and-model.test.ts:39-43 — `SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE`, `renderModelPreflightMismatchMessage` from `../src/runtime/subagent-model-guard`;
- tests/subagent-model-guard.test.ts:26-31 — both codes from `../src/runtime/subagent-model-guard`.

## Why this is a problem
Redundant pass-through layer: for three of its four bindings the re-export
forwards symbols nothing imports through, and its stated beneficiaries no
longer exist — there are no RFC-0005 importers left in src/ (the RPC drive and
its importers were retired; `subagent-rpc-driver.ts` is deleted) and the
isolation suite imports the teardown surface only. The block's rationale
comment is stale alongside it. What remains is a second resolution path for
one constant that a single test could take from the single-source-of-truth
module the comment itself names.

## Suggested direction (non-binding, optional)
Drop the three unimported bindings (and the stale rationale sentence); either
retarget the one test import to subagent-model-guard.ts and remove the block
entirely, or keep the single binding it still serves.

## False-positive check
- Module-importer search: `grep -rn "from ["'].*subagent-isolation" --include="*.ts"` over src/, tests/, extensions/, tools/ → exactly the 3 files listed; inspected each import block verbatim.
- Per-symbol search: `grep -rn "SUBAGENT_MODEL_UNRESOLVED_MESSAGE|SUBAGENT_MODEL_PREFLIGHT_MISMATCH_CODE|renderModelPreflightMismatchMessage|SUBAGENT_MODEL_UNRESOLVED_CODE" --include="*.ts"` → every import site resolves from subagent-model-guard except tests/subagent-model-theta-tool.test.ts:82.
- Multi-line import blocks: checked each consuming file's import statements directly (sed) so identifier-inside-block imports were not missed.
- String-keyed/dynamic access: the diagnostic-code strings appear as literals only at their declaration and emission sites in subagent-model-guard.ts; no dynamic re-export (`export *`) of subagent-isolation exists anywhere.
- Tests-only-caller rule: applied — the one binding a test imports through the path is treated as alive; the finding is scoped to the three bindings with zero importers-through and the stale rationale.

## Triage
verdict: confirmed — reproduced: block at :54-65 verbatim; repo-wide grep shows the three bindings have zero importers-through (producer + both guard tests resolve from subagent-model-guard, no `export *`/dynamic path), the shim's named beneficiaries are gone (RPC driver deleted, isolation suite takes teardown symbols only), and the one test-imported binding is correctly kept alive; only flaw is the importer enumeration missing tests/b0468-subagent-teardown-budget-decoupled.test.ts:53, which imports teardown symbols only and does not disturb the conclusion (triage: claude-opus-5)
