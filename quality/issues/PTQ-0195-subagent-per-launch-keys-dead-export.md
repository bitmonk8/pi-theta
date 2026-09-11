---
id: PTQ-0195
title: SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS is exported from subagent-launcher.ts but imported by nothing outside the file, including its own bug-0474 witness test
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-launcher.ts:512-518
  - src/runtime/subagent-launcher.ts:528-530
  - src/runtime/subagent-launcher.ts:564-566
  - tests/subagent-child-env-scrub.test.ts:59-72
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911055804
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS is exported from subagent-launcher.ts but imported by nothing outside the file, including its own bug-0474 witness test

## Observation
`subagent-launcher.ts` declares `SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS` as
an `export const`: `SUBAGENT_CONTROL_PLANE_ENV_KEYS` filtered to drop the
extension-pin key. Its one read is inside the same file, in
`buildSubagentChildEnv`'s per-launch scrub loop. No file in `src/`,
`extensions/`, `tools/`, or `tests/` imports the name. The bug-0474 regression
test written specifically to exercise this scrub,
`tests/subagent-child-env-scrub.test.ts`, declares its own separately
maintained seven-key array for the same purpose instead of importing the
production constant.

## Evidence
src/runtime/subagent-launcher.ts:512-518 — the doc naming the derivation:

```ts
/**
 * The control-plane keys that are PER-LAUNCH — re-derived by every launch and
 * therefore scrubbed out of the inherited environment before this launch's own
 * values are applied (bug 0474). The set is the control plane above MINUS the
 * extension pin, which is deliberately heritable down the process tree
 * (#subagent-extension-pin: a harness pins the top of the chain once and every
 * nesting level must keep loading that build).
```

src/runtime/subagent-launcher.ts:528-530 — the export:

```ts
export const SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS: readonly string[] = Object.freeze(
  SUBAGENT_CONTROL_PLANE_ENV_KEYS.filter((key) => key !== SUBAGENT_EXTENSION_PIN_ENV),
);
```

src/runtime/subagent-launcher.ts:564-566 — the only read anywhere, and it is
module-internal:

```ts
  for (const key of SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS) {
    delete inherited[key];
  }
```

tests/subagent-child-env-scrub.test.ts:59-72 — the bug-0474 witness test's own,
independently maintained equivalent, built from the individual key constants
rather than from the launcher's combined export:

```ts
/**
 * The per-launch control-plane carriers: every control-plane key EXCEPT the
 * deliberately heritable extension pin. A child env composed by a launch that
 * does not itself name one of these must not carry it at all.
 */
const PER_LAUNCH_CONTROL_KEYS: readonly string[] = [
  SUBAGENT_ROOT_ENV_MARKER,
  SUBAGENT_ROOT_WINNER_ENV,
  SUBAGENT_PARAMS_ENV,
  SUBAGENT_PARAMS_FILE_ENV,
  SUBAGENT_INVOKE_DEPTH_ENV,
  SUBAGENT_CALLABLE_HASHES_ENV,
  SUBAGENT_PARENT_PID_ENV,
];
```

Search: `grep -rn "SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS" --include="*.ts" --include="*.tsx" --include="*.js" .` (repo root, excluding `node_modules/`) →
3 hits, all inside `src/runtime/subagent-launcher.ts` itself: the declaration
(:528), the one doc-comment mention (:534, "see
`SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS`"), and the one read (:564). Zero
hits in `tests/`, `extensions/`, or `tools/`, and zero in any other `src/`
file.

## Why this is a problem
Dead export surface: the constant's value is alive (`buildSubagentChildEnv`
reads it to scrub stale control-plane carriers before applying this launch's
own), but its `export` modifier reaches nothing — no import in `src/`,
`extensions/`, `tools/`, or `tests/`, no namespace (`import * as`) import of the
module, no re-export barrel, and no string-keyed access. The sibling array one
property above it, `SUBAGENT_CONTROL_PLANE_ENV_KEYS`, shows what a consumed
export of this shape looks like in the same file: it is imported by
`src/extension/production-subagent-host.ts:39-42` and read at `:175`. The
constant was introduced in the single commit that also added its own
regression test (`ce3ca3f2`, "bug 0474 — stale control-plane env carriers
scrubbed at child-env composition"), and that same commit's test hand-writes
an equivalent `PER_LAUNCH_CONTROL_KEYS` array rather than importing the new
export — so even the change that created the export never exercised it from
outside the file.

## Suggested direction (non-binding, optional)
Drop the `export` modifier so the derived list becomes module-private, since
`buildSubagentChildEnv` is its only reader; nothing outside the file resolves
it today.

## False-positive check
- Reference search: `grep -rn "SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS" --include="*.ts" --include="*.tsx" --include="*.js" .` → 3 hits, all in
  `src/runtime/subagent-launcher.ts` (declaration, doc mention, read); zero in
  `tests/`, `extensions/`, `tools/`, or any other `src/` file.
- Checked the gitignored `dist/src/runtime/subagent-launcher.d.ts` separately
  (`git check-ignore -v` confirms it is untracked build output, and
  `git log -1 -- dist/...` returns nothing): it predates bug 0474 and contains
  no `CONTROL_PLANE` text at all, so it is not a live consumer. Also excluded
  the untracked `.pi/tmp/fixes/0066-scratch-orig/` copy on the same
  `git check-ignore` grounds.
- String-keyed / dynamic access: no `"SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS"`
  string literal and no `export *` targeting `subagent-launcher` anywhere in the
  repo (re-confirmed the same absence the earlier, already-fixed
  launcher-root-marker re-export finding established for this file's other
  exports).
- Tests-only-caller rule considered: NOT applicable — no test references the
  identifier at all; its own bug-0474 witness test re-derives the list locally
  instead of importing it, so this is not test-only-reachable production code —
  the export is unreferenced by tests too, not merely by production.
- Git intent check: `git log --oneline -S "SUBAGENT_PER_LAUNCH_CONTROL_PLANE_ENV_KEYS" -- src/runtime/subagent-launcher.ts`
  → exactly one commit, `ce3ca3f2` (2026-09-11, "bug 0474 — stale control-plane
  env carriers scrubbed at child-env composition"), the constant's introduction;
  no later commit added an importer.
- Sibling comparison: `SUBAGENT_CONTROL_PLANE_ENV_KEYS`, declared a few lines
  above it in the same file, is imported externally at
  `src/extension/production-subagent-host.ts:39-42` and read at `:175`,
  confirming a consumed export of the same shape exists in this file for
  contrast.

## Triage
verdict: confirmed — every excerpt and line range reproduces verbatim; independent repo-wide grep (src/, extensions/, tools/, tests/, plus docs/) finds only the declaration/doc-mention/read inside subagent-launcher.ts itself and one unrelated prose mention in docs/bugs/0474, no code importer anywhere; `git log -S` shows the single introducing commit ce3ca3f2 with no later importer added; the bug-0474 witness test independently re-derives `PER_LAUNCH_CONTROL_KEYS` rather than importing the export, so no test-only-caller exemption applies; sibling `SUBAGENT_CONTROL_PLANE_ENV_KEYS` is confirmed externally consumed (production-subagent-host.ts:40,175), ruling out "unreferenced export is just convention"; not a duplicate of PTQ-0055 (different export, same file, already fixed) or PTQ-0191 (different constant, doc-completeness not deadness) (triage: claude-opus-5)
