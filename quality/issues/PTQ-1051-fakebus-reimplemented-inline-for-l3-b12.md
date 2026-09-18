---
id: PTQ-1051
title: execution-status-progress-tool.test.ts declares fakeBus(initialVerbosity) then re-inlines the identical closure for the L3-B12 test instead of calling it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-progress-tool.test.ts:46-61
  - tests/execution-status-progress-tool.test.ts:277-286
sites: 2
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# execution-status-progress-tool.test.ts declares fakeBus(initialVerbosity) then re-inlines the identical closure for the L3-B12 test instead of calling it

## Observation
`tests/execution-status-progress-tool.test.ts` declares a module-scope helper
`fakeBus(initialVerbosity = "names")` (lines 46-61) that wraps
`noopExecutionStatusBus` with a mutable `verbosity` closure variable and an
`authorMessage` override that records calls, returning `{ bus,
authorMessageCalls }`. Every other `describe` block in the file that needs a
bus with recorded `authorMessage` calls invokes `fakeBus()`. The "L3-B12:
verbosity off" test (lines 273-296) instead re-declares the identical
`noopExecutionStatusBus({...})` closure inline, with the same three
overridden members (`authorMessage`, `setVerbosity`, `verbosity`) and the same
mutable-`verbosity`-variable pattern, rather than calling `fakeBus("off")`.

## Evidence
tests/execution-status-progress-tool.test.ts:46-61:
```ts
function fakeBus(initialVerbosity: "off" | "counts" | "names" = "names"): {
  bus: ExecutionStatusBus;
  authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[];
} {
  const authorMessageCalls: { invocationId: string | undefined; payload: ProgressAuthorMessage }[] = [];
  let verbosity = initialVerbosity;
  const bus = noopExecutionStatusBus({
    authorMessage: (invocationId, payload): void => {
      authorMessageCalls.push({ invocationId, payload });
    },
    setVerbosity: (v): void => {
      verbosity = v;
    },
    verbosity: () => verbosity,
  });
  return { bus, authorMessageCalls };
}
```

tests/execution-status-progress-tool.test.ts:277-286:
```ts
    let verbosity: "off" | "counts" | "names" = "off";
    const authorMessageCalls: unknown[] = [];
    const bus = noopExecutionStatusBus({
      authorMessage: (_id, payload): void => {
        authorMessageCalls.push(payload);
      },
      setVerbosity: (v): void => {
        verbosity = v;
      },
      verbosity: () => verbosity,
    });
```

The only functional difference is that the inline copy pushes `payload`
alone onto `authorMessageCalls` where `fakeBus` pushes
`{ invocationId, payload }`; the test only asserts `authorMessageCalls`'
length, a property `fakeBus`'s richer record already satisfies, and
`fakeBus("off")` sets the identical starting `verbosity` value the inline
copy hardcodes.

## Why this is a problem
The parameterised `fakeBus(initialVerbosity)` helper exists specifically to
be reused with a non-default starting verbosity (its signature takes
`initialVerbosity` as its only parameter), and every sibling `describe` block
in this same file calls it. The L3-B12 test re-types the same three-member
override object instead, so the harness now has two independently
maintained copies of the identical bus-double closure in one file.

## Suggested direction (non-binding, optional)
`fakeBus("off")` already returns the equivalent double; the inline
declaration is the natural call to replace.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; not applicable.
Recording-double check: `authorMessageCalls` is a MUST-happen record
(asserted non-empty at the "names" call), not a MUST-NOT witness, so the
negative-witness carve-out does not apply to the duplication itself.
docs/bugs/ signature search: `grep -rn "fakeBus" docs/bugs/*.md` returns no
hits; not a documented correct-reason red. Coverage-matrix/bug-doc citation
search: `fakeBus` and "L3-B12" do not appear in
`docs/reference/coverage-matrix.md`; no pinned-test citation applies. This
finding proposes no removal of assertions or coverage, only the reuse of an
existing in-file helper.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/execution-status-progress-tool.test.ts:46-61 (`fakeBus`) and :277-286 (inline), the inline copy restates the same three overrides (`authorMessage` recorder, `setVerbosity` writer, `verbosity` reader) over the same imported `noopExecutionStatusBus` skeleton; grep confirms `fakeBus` is declared only here, called at 9 sites (:81, :136, :157, :184, :205, :230, :245, :258, :302), and `noopExecutionStatusBus(` appears in exactly 2 places in the file — the helper body and this one inline site — so "every sibling describe calls it" reproduces; docs/bugs (0 hits for `fakeBus`) and coverage-matrix (0 hits for `fakeBus`/`L3-B12`/the file) claims reproduce; not a gate test, the recorder is a MUST-happen witness (asserted length 1 at :294) so no negative-witness carve-out, no assertion removal proposed; not a duplicate — PTQ-0852 (fixed, ab12798a) covered the 14-method no-op skeleton and its fix is what left both sites on `noopExecutionStatusBus`, this residue (in-file parameterised helper bypassed for its one non-default-verbosity caller) is a distinct root cause, and PTQ-0667 expressly excluded the bus doubles. One accounting nit for the fixer, not refuting: the filing's "only functional difference" omits that the test reassigns the closure variable directly (`verbosity = "names"` at :293), which `fakeBus`'s return shape does not expose — the migration is `fakeBus("off")` plus `bus.setVerbosity("names")`, which writes the same closure variable via the helper's own override; production only reads `bus.verbosity()` (progress-tool.ts:236) and never calls `setVerbosity`, so behaviour is identical (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-0925-off-session-mock-scaffold-triplicated.md] PTQ-0925: Shared the mock/reset scaffold across all five triage-cited files using an opt-in helper. / PTQ-0935: Extracted the bind/assert/read tail for all three cited copies; retained every assertion. / PTQ-1036: Distinct descriptions now prove project precedence; a temporary package-wins override correctly failed the new assertion and was removed. / PTQ-1039: Migrated b0378 to the existing recording harness and note filter, adding optional flags support. No tests deleted; required gate passed for all changes: tsc and 11,569 tests across 687 files. ||
