---
id: PTQ-0160
title: capability-probe.ts constant doc-comments name V17a and V18c as consumers of SHUTDOWN_AWAIT_CAP_MS / FACTORY_PROBABLE_CAPABILITIES, and neither leaf holds any reference to either constant
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/capability-probe.ts:68-78
  - src/extension/capability-probe.ts:51-66
sites: 2
fix_scope: localized
wave: qw20260908115521
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-08
---

# capability-probe.ts constant doc-comments name V17a and V18c as consumers of SHUTDOWN_AWAIT_CAP_MS / FACTORY_PROBABLE_CAPABILITIES, and neither leaf holds any reference to either constant

## Observation
Two exported constants in `capability-probe.ts` (leaf `V9a`) carry doc comments
that enumerate, by leaf label, which other leaves consume them. The
`SHUTDOWN_AWAIT_CAP_MS` comment names three consumers — `V9g`, `V17a`, and a
`V18c` build-time literal-read assertion. The `FACTORY_PROBABLE_CAPABILITIES`
comment names two — `V18a` and `V18c`. Of the five named consumers, `V9g`
(`src/extension/session-shutdown.ts`) and `V18a`
(`src/extension/sdk-inventory.ts`) do import their respective constant. `V17a`
(`src/runtime/cancellation-core.ts`) and `V18c`
(`src/extension/version-bump-gates.ts`) contain zero references to either
constant, in source or in their paired test files.

## Evidence
src/extension/capability-probe.ts:68-78 — the `SHUTDOWN_AWAIT_CAP_MS` doc and
declaration:

```ts
/**
 * Cancellation-runtime constant: the bounded wait (milliseconds) the
 * `session_shutdown` teardown awaits in-flight invocation drainage before
 * proceeding. Semantics are owned by `V17a`; the value is sourced from
 * session-shutdown-semantics.md §`session_shutdown` sub-step 3. `V9a` is the
 * single declaration site the shutdown-leg consumers `V9g` and `V17a` import
 * (rather than redeclare) and that `V18c`'s build-time literal-read assertion
 * reads. `V9i` no longer imports it: bug 0468 decoupled the per-invocation
 * subagent child-exit wait onto its own `SUBAGENT_DISPOSE_BUDGET_MS`.
 */
export const SHUTDOWN_AWAIT_CAP_MS = 2000;
```

`grep -rn "SHUTDOWN_AWAIT_CAP_MS" src --include=*.ts` returns 16 lines across
exactly three files: `src/extension/capability-probe.ts` (4 lines — the
declaration at `:78` and three lines of the neighbouring
`SUPERSESSION_QUIESCE_CAP_MS` doc/declaration at `:86`, `:87`, `:92`),
`src/extension/session-shutdown.ts` (11 lines — the `V9g` leaf, the one real
importer, at `:28`, re-exporting at `:37`), and
`src/runtime/subagent-isolation.ts:38` (a prose mention inside a doc comment, no
import). The leaf labelled `V17a` is
`src/runtime/cancellation-core.ts:1` (`// V17a — the cancellation core
(implementation).`); `grep -c "SHUTDOWN_AWAIT_CAP_MS" src/runtime/cancellation-core.ts`
returns `0`. The leaf labelled `V18c` is `src/extension/version-bump-gates.ts:1`
(`// V18c / V18c-T — the Pi version-bump static build-time gates.`);
`grep -c "SHUTDOWN_AWAIT_CAP_MS" src/extension/version-bump-gates.ts` returns
`0`, and `grep -c` over its paired `tests/version-bump-gates.test.ts` also
returns `0`.

src/extension/capability-probe.ts:51-66 — the `FACTORY_PROBABLE_CAPABILITIES`
doc and declaration (excerpt of the roster sentence and the declaration):

```ts
 * factory-probable `typeof` member loop. This is the importable symbol
 * `V18a`/`V18c` reconcile their factory-probed partition flags against (it is
 * the partition target, not the probe's eight-member iteration target).
 *
 * `Object.freeze` keeps this module-level constant off the *No globals,
 * statics, singletons* mutable-binding scan (a frozen runtime-immutable list).
 */
export const FACTORY_PROBABLE_CAPABILITIES: readonly CapabilityId[] =
  Object.freeze([1, 2, 4, 6]);
```

`grep -rn "FACTORY_PROBABLE_CAPABILITIES" src extensions tools tests
--include=*.ts` returns hits in exactly three files: the declaring module,
`src/extension/sdk-inventory.ts` (the `V18a` leaf — imports at `:35`, reads at
`:150`), and two test files (`tests/capability-probe.test.ts`,
`tests/sdk-inventory.test.ts`).
`grep -c "FACTORY_PROBABLE_CAPABILITIES" src/extension/version-bump-gates.ts`
returns `0`; the same count over `tests/version-bump-gates.test.ts` returns `0`.

## Why this is a problem
These are consumer rosters, not prose: their stated purpose is to record which
leaves import the single declaration site "rather than redeclare" it, so a
reader deciding whether the constant may be moved or narrowed reads the comment
instead of searching. Two of the five named consumers hold no reference at all,
so the roster over-reports the constant's reach: a reader following it walks to
`cancellation-core.ts` and `version-bump-gates.ts` and finds nothing, and a
reader trusting it believes the constant is pinned by a build-time gate that
does not read it. The comment's own bookkeeping already tracks retirement in
one direction (`"V9i` no longer imports it"), which is the mechanism this
roster is meant to be maintained by; the two stale entries are that mechanism
not having been applied.

## Suggested direction (non-binding, optional)
The roster entries could be reduced to the leaves a reference search actually
finds, or the labels dropped in favour of naming the consuming behaviour, so
the comment cannot drift out of step with the import graph again.

## False-positive check
- Identifier searches: `grep -rn "SHUTDOWN_AWAIT_CAP_MS"` and `grep -rn
  "FACTORY_PROBABLE_CAPABILITIES"` across `src`, `extensions`, `tools`, `tests`
  with `--include=*.ts`; both constants' full hit lists are reproduced above and
  neither includes `cancellation-core.ts` or `version-bump-gates.ts`.
- Leaf-label resolution: `grep -rn "\bV17a\b" src`, `grep -rn "\bV18c\b" src
  tests`, `grep -rn "\bV18a\b" src`, `grep -rn "\bV9g\b" src` — the module-header
  lines resolve `V17a` → `src/runtime/cancellation-core.ts:1`, `V18c` →
  `src/extension/version-bump-gates.ts:1`, `V18a` →
  `src/extension/sdk-inventory.ts:1`, `V9g` →
  `src/extension/session-shutdown.ts:1`, so the labels are unambiguous and are
  not aliases for the modules that do import.
- Re-export check: `grep -rn "from \"./capability-probe\"" src` plus
  `grep -rn "capability-probe\"" src tests extensions tools --include=*.ts` — the
  only re-export of `SHUTDOWN_AWAIT_CAP_MS` is `session-shutdown.ts:37`
  (`export { SHUTDOWN_AWAIT_CAP_MS };`), and neither named leaf imports from
  `session-shutdown.ts` either (`grep -n "session-shutdown"
  src/runtime/cancellation-core.ts` returns nothing).
- Test-only-caller check: this is not a deadness claim — both constants have
  live production importers. The claim is only that two named entries in the
  rosters have no referent; the paired `V18c-T` test file was searched too and
  also has zero hits, so "build-time assertion" does not resolve to a test
  either.
- Dynamic access: `grep -rn "'SHUTDOWN_AWAIT_CAP_MS'\|\"SHUTDOWN_AWAIT_CAP_MS\""`
  and the same for `FACTORY_PROBABLE_CAPABILITIES` — no string-keyed access.

## Triage
verdict: confirmed — re-ran both identifier hunts across src/extensions/tools/tests and neither cancellation-core.ts (V17a) nor version-bump-gates.ts (V18c) references either constant (V18c's sole import is SDK_SURFACE_INVENTORY), no re-export or dynamic path reaches them, `git log -S` shows neither leaf ever did, and version-bump-triggers.md step 5 puts SHUTDOWN_AWAIT_CAP_MS out of gate scope, so the roster clauses are false present-tense claims rather than pending obligations (triage: claude-opus-5)
