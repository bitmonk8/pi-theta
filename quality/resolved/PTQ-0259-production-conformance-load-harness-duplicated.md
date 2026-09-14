---
id: PTQ-0259
title: production-conformance.test.ts reimplements the canonical runProductionLoad load harness instead of importing tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/conformance/production-conformance.test.ts:234-264
  - tests/helpers/production-load-harness.ts:21-54
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# production-conformance.test.ts reimplements the canonical runProductionLoad load harness instead of importing tests/helpers/production-load-harness.ts

## Observation
tests/conformance/production-conformance.test.ts declares a private
`LoadOutcome` interface and a private `async function runProductionLoad(cwd):
Promise<LoadOutcome>` that builds a fake `ExtensionAPI`/`ExtensionContext`
pair and calls the real `discoverAndComposeFixtures`.
`tests/helpers/production-load-harness.ts` already exports a `LoadOutcome`/
`runProductionLoad` pair built to hold exactly this fixture; its fake `pi`
object and its `ctx` object (`cwd`, `modelRegistry.getAvailable`, `ui.notify`)
are byte-identical to the reviewed file's own copy. The reviewed file imports
nothing from that helper.

## Evidence
tests/conformance/production-conformance.test.ts:234-237 — the local
`LoadOutcome`:
```ts
interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
}
```

tests/conformance/production-conformance.test.ts:242-251 — the local
`runProductionLoad`'s signature and fake `pi`:
```ts
async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/conformance/production-conformance.test.ts:252-264 — the local `ctx`
and the call/reshape:
```ts
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(pi, ctx);
  return { registered: fixtures.map((f) => f.slashName), notifications };
}
```

tests/helpers/production-load-harness.ts:21-26 — the canonical, already-built
`LoadOutcome` (a superset: it adds `diagnosticLines`):
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
}
```

tests/helpers/production-load-harness.ts:35-45 — the canonical
`runProductionLoad`'s signature and fake `pi`, whose six methods, order,
bodies and cast are byte-identical to the reviewed file's own copy quoted
above:
```ts
export async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```

tests/helpers/production-load-harness.ts:46-54 — the canonical `ctx`,
byte-identical to the reviewed file's own copy quoted above:
```ts
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

Search: `grep -rl "function runProductionLoad" tests --include="*.test.ts"`
returns 20 files carrying their own local copy of this function, including
`tests/conformance/production-conformance.test.ts`; `grep -rl
"production-load-harness" tests --include="*.test.ts"` returns exactly one
importer (`tests/arg-mismatch-diagnostic-count-by-surface.test.ts`), which is
not the reviewed file.

## Why this is a problem
`tests/helpers/production-load-harness.ts`'s own header states its purpose:
"Several test files independently redeclared the same `LoadOutcome` shape and
the same `runProductionLoad` function... This module centralises that read."
The reviewed file's copy is not merely similar — its `pi` object (six methods,
same names, same order, same bodies) and its `ctx` object (`cwd`,
`modelRegistry.getAvailable`, `ui.notify` pushing into a `notifications`
array) are byte-identical to the canonical export quoted above; the only
difference is that the canonical helper additionally interposes on
`process.stderr.write` to capture `diagnosticLines`, a capability the
reviewed file does not use. The reviewed file even carries the same
`notifications` capture as the canonical helper, but never reads
`loadOutcome.notifications` in any assertion in the file (`grep -n
"notifications" tests/conformance/production-conformance.test.ts` shows only
the four lines internal to the function itself) — consistent with this being
copied structure rather than a fixture designed from scratch for this file's
own needs.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts` already exports a
`runProductionLoad` whose `pi`/`ctx` construction matches the reviewed file's
own copy byte-for-byte; the one thing the reviewed file's local copy omits
(the `diagnosticLines` capture) is additive, not a reason the shared export
could not serve this file directly.

## False-positive check
- Gate-pin check: `tests/conformance/production-conformance.test.ts` does not
  match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory.
- Recording-double check: `notifications` is a plain capture array, and (per
  the grep above) it backs no assertion in this file at all — it is not a
  MUST-NOT-called negative witness, so the recording-double carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rln "production-conformance"
  docs/bugs/*.md` hits 0019, 0079, 0081, 0107, 0178, 0183, 0185, 0207 — all
  pin this file's `runSource` harness (lines ~152-176), specific stale-comment
  lines (47-52, 189-190), or aggregate test counts, never the
  `LoadOutcome`/`runProductionLoad` block at lines 234-264 cited here; none
  documents a rationale for keeping this specific fixture local. `npx vitest
  run tests/conformance/production-conformance.test.ts` reproduces 27/27
  passing at HEAD (reverified during this review), so this is not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "production-conformance"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test — only that an internal fixture
  function could import the existing helper instead of redefining it — so no
  witness-list citation is disturbed.
- Distinct from prior findings: PTQ-0210 (fixed) cites five other files
  (arg-mismatch-diagnostic-count-by-surface, invoke-arg-type-mismatch-wired,
  division-result-type-number-invoke, invoke-arg-array-literal-provable,
  modulo-zero-result-type-number); PTQ-0240 (open, confirmed) cites a sixth,
  different file (b0297-bind-model-nonscalar-production-load). Neither lists
  `tests/conformance/production-conformance.test.ts`.
- git history: `tests/conformance/production-conformance.test.ts` was added
  2026-07-04 (`12626235`), predating `tests/helpers/production-load-harness.ts`
  (added 2026-09-11, PTQ-0210's fix commit). The reviewed file therefore had
  no helper to import at authoring time — but the helper exists in the tree
  today, byte-compatible and unused by this file, which is the same
  post-hoc-non-adoption shape PTQ-0240 confirmed for a different,
  later-authored file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — pi/ctx blocks diff byte-identical (verified via `diff`), git blame shows this block unchanged since 2026-07-04 (predating the 2026-09-11 canonical helper) and never migrated, no docs/bugs entry pins the block or excuses the local copy, and this is in-scope D7 copy-paste-fixture/double duplication distinct from PTQ-0210's five sites and PTQ-0240's sixth (triage: claude-opus-5)
