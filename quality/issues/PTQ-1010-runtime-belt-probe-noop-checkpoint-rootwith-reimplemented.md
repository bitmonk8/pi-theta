---
id: PTQ-1010
title: runtime-belt-probe-harness.ts retypes invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT and fixture-dispatch-harness.ts's rootWith() shape at three internal sites instead of importing either
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/runtime-belt-probe-harness.ts:67-85
  - tests/helpers/runtime-belt-probe-harness.ts:330-334
  - tests/helpers/runtime-belt-probe-harness.ts:369-372
  - tests/helpers/invoke-seam-scaffold.ts:39-44
  - tests/helpers/fixture-dispatch-harness.ts:154-164
sites: 3
fix_scope: module
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# runtime-belt-probe-harness.ts retypes invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT and fixture-dispatch-harness.ts's rootWith() shape at three internal sites instead of importing either

## Observation
`tests/helpers/invoke-seam-scaffold.ts` exports `SEAM_NOOP_CHECKPOINT`, a
`Checkpoint` whose `before()` resolves immediately.
`tests/helpers/fixture-dispatch-harness.ts` exports `rootWith(checkpoint,
invocationId = "inv-1", clock?)`, which returns `{ checkpoint, idSource: {
newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
...(clock and) }`. `tests/helpers/runtime-belt-probe-harness.ts` imports
neither export (its import list carries no `./invoke-seam-scaffold` or
`./fixture-dispatch-harness` specifier) and instead retypes the same
checkpoint-plus-idSource shape three times inside its own body: once in the
exported `rootDouble()`, once as a private module-scope `NOOP_CHECKPOINT`
constant, and once as the inline `RuntimeRoot` literal inside
`runNumericFixture()` that consumes that same constant.

## Evidence
`tests/helpers/invoke-seam-scaffold.ts:39-44` (the canonical no-op
checkpoint):
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/fixture-dispatch-harness.ts:154-164` (the canonical
`RuntimeRoot` builder, whose two-argument-default call already produces the
`checkpoint`+`idSource` shape below):
```ts
export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/runtime-belt-probe-harness.ts:67-85` (site 1 — `rootDouble()`
retypes the same `checkpoint`+`idSource` pair inline, then adds its own
synchronous `clock`):
```ts
export function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the fixed-clock harness contract this module's
    // callers share).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/runtime-belt-probe-harness.ts:330-334` (site 2 — a private
`NOOP_CHECKPOINT` whose body is byte-identical to
`SEAM_NOOP_CHECKPOINT` above):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/runtime-belt-probe-harness.ts:369-372` (site 3 — the inline
`RuntimeRoot` literal in `runNumericFixture()`, consuming the site-2 constant
and retyping the same `idSource` pair a third time in this file):
```ts
  const binding = producer({
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot).bindPromptConversation(bindInput);
```

## Why this is a problem
`rootWith(SEAM_NOOP_CHECKPOINT)` (leaving `invocationId` and `clock` at their
defaults) already evaluates to `{ checkpoint: SEAM_NOOP_CHECKPOINT, idSource:
{ newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" } }` —
field-for-field the object site 3 builds by hand, and the same
`checkpoint`/`idSource` pair site 1 opens with before appending its own
`clock`. All three sites independently spell out the same `"inv-1"`/`"tc-1"`
id-minting pair and, at sites 2 and 3, the same `before()` resolve-immediately
body that `SEAM_NOOP_CHECKPOINT` already names and exports one file over.
This is not a case of the canonical shapes being hard to find: this same
file's own header names `invoke-seam-scaffold.ts`'s no-op triple by name in
its "WHY THIS FILE EXISTS" note about a *different* bug family, so the
module is already known to this codebase's authors while writing this file.

## Suggested direction (non-binding, optional)
`rootDouble()` and the `runNumericFixture()` inline literal could both call
`rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", <clock>)` (imported from
`fixture-dispatch-harness.ts`, threading `SEAM_NOOP_CHECKPOINT` from
`invoke-seam-scaffold.ts`) in place of retyping the checkpoint and idSource
pair; the private `NOOP_CHECKPOINT` constant would then have no remaining
caller.

## False-positive check
- Gate-pin check: `runtime-belt-probe-harness.ts` is a `tests/helpers/`
  module, not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: none of the three sites records a call or backs a
  MUST-NOT-be-called witness — all are inert stand-ins for a positive
  execution path (an immediately-resolving checkpoint and a fixed id
  source); the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "NOOP_CHECKPOINT\|newToolCallId" docs/bugs/` → 0 hits; no documented correct-reason red cites any of the three declarations.
- coverage-matrix/bug-doc citation search: `grep -n "runtime-belt-probe-harness" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block or of either helper file — only that the internal reimplementations call the already-exported builders — so no pinned citation is disturbed.
- Overlap check: `grep -rl "runtime-belt-probe-harness" quality/intake quality/issues quality/resolved` turns up only callers of this file's exports (e.g. `PTQ-0883`, which flags a *test file* for not importing `rootDouble`/`producer` from here) and the resolved `PTQ-0481` (a different pair of exports, `render`/probe helpers). None compares this file's own `rootDouble()`/`NOOP_CHECKPOINT`/`runNumericFixture()` internals against `invoke-seam-scaffold.ts` or `fixture-dispatch-harness.ts`; this is the first filing on that specific root cause. The claim is entirely about duplicated double-definitions inside an existing, exercised helper module — no behaviour or path is claimed untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all five excerpts reproduce verbatim at the cited lines (rootDouble :67-85, private NOOP_CHECKPOINT :330-334, runNumericFixture literal :369-372, SEAM_NOOP_CHECKPOINT :39-44, rootWith :154-164); NOOP_CHECKPOINT's body is byte-identical to SEAM_NOOP_CHECKPOINT and both satisfy src/seams/checkpoint.ts `before(kind, site): Promise<void>` with a bare `Promise.resolve()`, the :369-372 literal is field-for-field `rootWith(SEAM_NOOP_CHECKPOINT)` at its defaults, and rootDouble's checkpoint/idSource pair plus its inline clock (assignable to src/seams/clock.ts `Clock`) fits `rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", clock)`, so all three swaps are mechanical; the helper imports nothing from `./` (grep `from "./` → 0), no reverse import from fixture-dispatch-harness / invoke-seam-scaffold / production-load-harness so no cycle risk; all copies live (helper imported by 19 test files, runNumericFixture by division-/modulo-zero-result-type-number, NOOP_CHECKPOINT consumed at :371; rootWith 10 / SEAM_NOOP_CHECKPOINT 29 importers), b0368 + non-object-receiver-gate green at HEAD (56/56); docs/bugs 0 and coverage-matrix 0 reproduce, all locations under tests/, D7 copy-paste-double, helper not gate kin, inert not recording doubles, no it()/describe() merge/rename/delete; not a duplicate — resolved PTQ-0862 is the identical shape on prompt-value-harness.ts (per-file convention: distinct root cause), PTQ-0883/0873/0846/0636 cite this helper only as the canonical *target* for test-file copies, PTQ-0481 (resolved) covered render/probe exports, and same-wave d7-06 covers producer()'s `pi` triple not the RuntimeRoot shape; one evidentiary claim is false and should be corrected at ticketing: the "Why" asserts this file's header names invoke-seam-scaffold's no-op triple — grep for `SEAM_NOOP|invoke-seam-scaffold|no-op triple` in runtime-belt-probe-harness.ts → 0 and `git log -S"invoke-seam-scaffold"` on the file → no commits (the reviewer read invoke-seam-scaffold's own header); non-refuting since the anchor is the duplication itself, not discoverability (triage: claude-fable-5-1)
