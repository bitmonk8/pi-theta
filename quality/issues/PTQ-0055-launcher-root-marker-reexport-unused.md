---
id: PTQ-0055
title: subagent-launcher.ts re-exports SUBAGENT_ROOT_ENV_MARKER "so launcher-side consumers resolve it here" but every consumer imports it from subagent-root-regime directly
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-launcher.ts:53-61
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# subagent-launcher.ts re-exports SUBAGENT_ROOT_ENV_MARKER "so launcher-side consumers resolve it here" but every consumer imports it from subagent-root-regime directly

## Observation
subagent-launcher.ts imports `SUBAGENT_ROOT_ENV_MARKER` from
subagent-root-regime.ts for its own use in `buildSubagentChildEnv`, and
additionally re-exports it with a doc block saying the re-export exists "so
launcher-side consumers resolve it here". No consumer anywhere resolves the
marker through the launcher: every importer of the constant — including the
launcher-adjacent production-subagent-host.ts, which imports other launcher
constants in the very same import section — takes it from
subagent-root-regime.ts directly.

## Evidence
src/runtime/subagent-launcher.ts:53-61 — the re-export and its rationale:

```ts
/**
 * RFC-0006 (PIC-58): the subagent-root regime marker (`PI_THETA_SUBAGENT_ROOT=<slug>`)
 * SUBSUMES RFC-0005's `PI_THETA_SUBAGENT_CHILD` marker and carries its duties
 * (watcher suppression, no-recursion guard, parent-PID carriage) alongside regime
 * selection. The old boolean child marker is retired — its presence is now
 * expressed by the presence of the root-slug marker. Re-exported from the regime
 * module (single source of truth) so launcher-side consumers resolve it here.
 */
export { SUBAGENT_ROOT_ENV_MARKER };
```

Importer search for the identifier (all *.ts in src/, tests/, extensions/,
tools/; import statements inspected per file including multi-line blocks) — 12
importing files, every one resolving from subagent-root-regime:
src/extension/factory.ts:73, src/runtime/subagent-child-hash-verify.ts:35,
src/extension/production-subagent-host.ts:44-47, and the test files
b0328-root-closure-hash-marshalled.test.ts:65,
b0329-hash-mismatch-refuses-invocation.test.ts:24,
b0331-root-winner-preempt.test.ts:48, b0343-proto-hash-carrier-row.test.ts:57,
control-plane-authentication.test.ts:29,
live/double-session-start-live.test.ts:76,
subagent-child-hash-refusal-e2e.test.ts:14,
subagent-child-hash-verify.test.ts:13, subagent-child-launch.test.ts:38.

src/extension/production-subagent-host.ts:39-47 — the file that imports other
launcher exports still takes the marker from the regime module:

```ts
import {
  SUBAGENT_EXTENSION_PIN_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_PARENT_PID_ENV,
} from "../runtime/subagent-launcher";
import {
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
} from "../runtime/subagent-root-regime";
```

## Why this is a problem
Redundant pass-through: a re-export binding nothing imports through, whose
stated purpose ("launcher-side consumers resolve it here") is demonstrably
unfulfilled — the launcher-side consumer that exists imports the marker from
the owning module in the same breath as its launcher imports. The launcher's
own use of the constant needs only the import at :27, not the export. The extra
resolution path adds a second public home for a constant whose doc stresses a
"single source of truth".

## Suggested direction (non-binding, optional)
Delete the `export { SUBAGENT_ROOT_ENV_MARKER };` line (keeping the import and
the PIC-58 subsumption note if wanted); consumers already resolve the marker
from subagent-root-regime.ts.

## False-positive check
- Identifier search: `grep -rn "SUBAGENT_ROOT_ENV_MARKER" --include="*.ts" src/ tests/ extensions/ tools/` → declaration + uses in subagent-root-regime.ts, the launcher's import/use/re-export, and the 12 importing files above; each importing file's import block read directly (multi-line blocks included) — zero resolve from subagent-launcher.
- Dynamic access: the marker string `PI_THETA_SUBAGENT_ROOT` as a literal appears only in the regime module's declaration and in doc text; no `export * from "./subagent-launcher"` or barrel file forwards the launcher's exports.
- Tests-only-caller rule: not applicable — no caller (test or production) uses this binding at all; the underlying constant stays fully alive in its owning module.
- Distinct from the subagent-isolation re-export finding (filed separately): different file, different compatibility rationale, independently removable.

## Triage
verdict: confirmed — both excerpts verify verbatim (launcher :53-61, production-subagent-host.ts :39-47) and my own identifier hunt found 14 importing files (candidate undercounted at 12; it also missed literal `process.env["PI_THETA_SUBAGENT_ROOT"]` reads in two tests — both immaterial), every one resolving from subagent-root-regime and zero through the launcher, with no `export *`, barrel, or namespace import able to reach the binding; `git log -L 61,61` proves the line is an RFC-0006/PIC-58 migration vestige that replaced the retired launcher-owned `SUBAGENT_CHILD_ENV_MARKER` and was never imported through the launcher in any commit, so the doc's "so launcher-side consumers resolve it here" is falsified by the one launcher-side consumer taking it from the owning module; in-scope D2 cruft in src/, no tests-only-caller exemption (the binding has zero callers of any kind while the constant stays alive in its owner), and no existing issue or intake file cites subagent-launcher.ts:61 (triage: claude-opus-5)
