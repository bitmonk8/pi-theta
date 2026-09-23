---
id: PTQ-1399
title: milestoneEntries walk over theta-progress-entry milestone payloads is redeclared across the two rfc0010-l3-progress live cells
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:83-96
  - tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:73-82
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# milestoneEntries walk over theta-progress-entry milestone payloads is redeclared across the two rfc0010-l3-progress live cells

## Observation
Both `tests/live/rfc0010-l3-progress-parent-live-cell.test.ts` and
`tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts` declare a
module-scope `milestoneEntries(entries)` function that walks a settled
`SessionManager` entry list looking for a `type: "custom"` entry with
`customType === "theta-progress-entry"` whose `data.milestone` is defined.
The two declarations differ only in return shape (one extracts and retypes
`data.milestone`, the other filters and returns the raw entry), not in the
underlying selection logic. Both files already share the same
`../helpers/execution-status-progress` import for `createRecordingUi`.

## Evidence
`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:83-96`:
```ts
function milestoneEntries(
  entries: readonly unknown[],
): readonly { readonly milestone: Record<string, unknown> }[] {
  const found: { readonly milestone: Record<string, unknown> }[] = [];
  for (const entry of entries) {
    const e = entry as { type?: string; customType?: string; data?: unknown };
    if (e.type !== "custom" || e.customType !== "theta-progress-entry") continue;
    const data = e.data as { milestone?: unknown } | undefined;
    if (data?.milestone !== undefined && typeof data.milestone === "object") {
      found.push({ milestone: data.milestone as Record<string, unknown> });
    }
  }
  return found;
}
```

`tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:73-82`:
```ts
function milestoneEntries(entries: readonly unknown[]): readonly unknown[] {
  return entries.filter((entry) => {
    const e = entry as { type?: string; customType?: string; data?: unknown };
    return (
      e.type === "custom" &&
      e.customType === "theta-progress-entry" &&
      (e.data as { milestone?: unknown } | undefined)?.milestone !== undefined
    );
  });
}
```

## Why this is a problem
Both functions test the identical three-part predicate
(`type === "custom"`, `customType === "theta-progress-entry"`,
`data.milestone !== undefined`) against the same settled-entry shape, each
declared locally in its own file rather than shared. Both files are part of
the same RFC 0010 L3 progress-entry pair and already import a shared helper
module (`../helpers/execution-status-progress`) for the related
`createRecordingUi` double, which is where this repeated selection logic
would naturally sit alongside it.

## Suggested direction (non-binding, optional)
A single milestone-entry selector exported from
`tests/helpers/execution-status-progress.ts` (or a sibling helper module)
would let both call sites read it and pick their own return shape locally, as
observation rather than design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts`.
- Recording-double check: `milestoneEntries` is a settled-entry reader, not a
  negative-witness recording double; the carve-out does not apply.
- docs/bugs/ signature search: neither file documents a correct-reason red
  tied to this selector; both cells are green-by-design live witnesses.
- coverage-matrix/bug-doc citation search: `grep -rn
  "rfc0010-l3-progress-parent-live-cell\|rfc0010-l3-progress-wire-child-live-cell"
  docs/reference/coverage-matrix.md docs/bugs/` found no hits; no
  merge/rename/delete of either test is proposed.

## Triage
verdict: confirmed — both excerpts match verbatim at the cited lines (parent 83-96, wire-child 73-82); `grep -rn milestoneEntries tests/` finds exactly these two module-scope declarations and no shared milestone selector exists in tests/helpers/ (the other `customType === "theta-progress-entry"` hits in tests/ are the collectSystemNotes note-channel reader, a different concern), both live green cells already import `createRecordingUi` from `../helpers/execution-status-progress`, the two copies apply the same type/customType/data.milestone predicate with one visible drift (parent adds a `typeof === "object"` guard the wire-child copy lacks), neither is a gate/recording-double/bug-doc-cited test, and the store's only prior filing on this pair (PTQ-0622) covered createRecordingUi, not this selector — D7 boilerplate duplication, 2 sites, mechanical dedupe (triage: claude-fable-5-1)
