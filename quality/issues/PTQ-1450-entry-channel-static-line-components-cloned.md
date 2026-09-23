---
id: PTQ-1450
title: entry-channel static line components share identical render body
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/entry-channel.ts:143-157
  - src/extension/execution-status/entry-channel.ts:229-243
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# entry-channel static line components share identical render body

## Observation
`src/extension/execution-status/entry-channel.ts` contains two private
`Component` classes used by its static renderers. `MilestoneLineComponent`
wraps one pre-fitted line; `StaticEntryLinesComponent` wraps many. Their
`render(width)` and `invalidate()` bodies are byte-identical apart from the
constructor parameter type, and the comment on `StaticEntryLinesComponent`
states outright that it "Mirrors `MilestoneLineComponent`'s contract".

## Evidence
`src/extension/execution-status/entry-channel.ts:143-157`:

```typescript
class MilestoneLineComponent implements Component {
  readonly lines: readonly string[];

  constructor(line: string) {
    this.lines = [line];
  }

  render(width: number): string[] {
    return this.lines.map((line) =>
      width > 0 && line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line,
    );
  }

  invalidate(): void {}
}
```

`src/extension/execution-status/entry-channel.ts:229-243`:

```typescript
class StaticEntryLinesComponent implements Component {
  readonly lines: readonly string[];

  constructor(lines: readonly string[]) {
    this.lines = lines;
  }

  render(width: number): string[] {
    return this.lines.map((line) =>
      width > 0 && line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line,
    );
  }

  invalidate(): void {}
}
```

Diff verdict: **identical** implementation; the only differences are the
class name and whether the constructor accepts `string` or
`readonly string[]`. Clone-scan map lists no group for this pair (hand-found).

## Why this is a problem
The two classes are not independent: both enforce the same static-entry
render contract (pre-fitted lines as own enumerable property, hard-clip at
width, never throw). If a future change fixes clipping, adds padding, or
adjusts the ellipsis logic for one entry type but not the other, the
`theta-progress-entry` milestone and the `theta-run`/`theta-run-summary`
static cards will render inconsistently. The comment explicitly frames the
second class as a mirror of the first, which is the load-bearing signal that
they must stay in step.

## Suggested direction (non-binding, optional)
Both classes live in `src/extension/execution-status/entry-channel.ts`, so a
single shared helper in the same module is the natural home: one
`StaticLinesComponent` accepting `readonly string[]` would let
`MilestoneLineComponent` (or its call site) wrap a single line in an array.

## False-positive check
- Re-read both ranges at HEAD immediately before filing; excerpts above are
  verbatim.
- `grep -R "MilestoneLineComponent\|StaticEntryLinesComponent" src/` confirms
  both classes are defined only here and are live callers in the same file
  (`createProgressEntryRenderer` and `createThetaRunEntryRenderer` /
  `createThetaRunSummaryRenderer`).
- Not a spec-normative vector table: this is rendering behaviour, not a
  repeated spec clause.
- Not in tests/.
- No existing finding in the provided already-filed list matches this
  component-render clone (`PTQ-1295` covers append methods, not the render
  classes).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at entry-channel.ts:143-157 and :229-243 (`lines` field, `render` clip-with-ellipsis body and no-op `invalidate` byte-identical; only the ctor parameter differs, `string` wrapped into `[line]` vs `readonly string[]`); both copies are live (`new MilestoneLineComponent` at :204, `new StaticEntryLinesComponent` at :298 and :353; no other references in src/ tests/ tools/); clone-scan map lists no group for the file so the hand-diff stands; the :224 comment "Mirrors `MilestoneLineComponent`'s contract" pins the must-stay-in-step coupling; not a spec vector table; no existing filing tracks this pair (PTQ-1295, resolved, covers the append methods at :97-128 only; the D8 shard-03 route note names the clip idiom but no D4 filing was ever made) — a mechanical dedupe (milestone site wraps its one line in the array-taking class) (triage: claude-fable-5-1)
