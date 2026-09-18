---
id: PTQ-0492
title: A RecordingCheckpoint `Checkpoint` double recording fired kinds/sites is redeclared near-identically across seven test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/checkpoint-granularity.test.ts:50-65
  - tests/invoke-cancellation-facets.test.ts:47-63
  - tests/production-cancellation-wiring.test.ts:92-100
  - tests/query-tool-loop.test.ts:68-84
  - tests/tool-calls-execute-lowering.test.ts:59-75
  - tests/query-tool-loop-noncompliance.test.ts:76-83
  - tests/session-control-dispatch.test.ts:98-104
sites: 7
fix_scope: cross-module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# A RecordingCheckpoint `Checkpoint` double recording fired kinds/sites is redeclared near-identically across seven test files

## Observation
Each of the seven files below declares its own class named `RecordingCheckpoint implements Checkpoint`, whose `before(kind, site)` method pushes the observed `kind` (and, in most copies, the `site`) into an array field so the test can assert which checkpoint kinds fired and in what order. The class body is byte-identical or near-identical (field order, an optional `log`/`sites` field, and the log-prefix string are the only variations) across all seven sites. `tests/helpers/` holds no module exporting this double; each file re-derives it locally.

## Evidence
tests/checkpoint-granularity.test.ts:50-65 (in scope for this review):
```ts
class RecordingCheckpoint implements Checkpoint {
  readonly log: string[];
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];

  constructor(log: string[]) {
    this.log = log;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    this.log.push(`before:${kind}`);
    return Promise.resolve();
  }
}
```

tests/invoke-cancellation-facets.test.ts:47-63 — same fields (reordered), same constructor, same body, log prefix `checkpoint:` instead of `before:`:
```ts
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    this.log.push(`checkpoint:${kind}`);
    return Promise.resolve();
  }
}
```

tests/query-tool-loop.test.ts:68-84 and tests/tool-calls-execute-lowering.test.ts:59-75 — both byte-identical to the invoke-cancellation-facets.test.ts excerpt above (verified independently; omitted here to avoid repeating the same 16 lines twice).

tests/production-cancellation-wiring.test.ts:92-100 — the same `kinds`/`sites` fields and `before` body, minus the `log` field and constructor:
```ts
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  readonly sites: CheckpointSite[] = [];
  before(kind: CheckpointKind, site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    this.sites.push(site);
    return Promise.resolve();
  }
}
```

tests/query-tool-loop-noncompliance.test.ts:76-83 and tests/session-control-dispatch.test.ts:98-104 — the same class name and the same one-field/one-line-body shape, `sites` dropped:
```ts
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];

  before(kind: CheckpointKind): Promise<void> {
    this.kinds.push(kind);
    return Promise.resolve();
  }
}
```
```ts
class RecordingCheckpoint implements Checkpoint {
  readonly kinds: CheckpointKind[] = [];
  before(kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    this.kinds.push(kind);
    return Promise.resolve();
  }
}
```

Exact search: `grep -n "class RecordingCheckpoint implements Checkpoint" tests/*.test.ts` returns exactly these seven files, one match each. `ls tests/helpers/` lists 38 modules (fake-clock.ts, fake-id-source.ts, fake-file-system.ts, ... — checked in full) and none is named for, or exports, a `Checkpoint` recording double.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the same fake — a `Checkpoint` implementation that records the kinds (and usually sites) it was called with — is hand-rolled seven separate times under the same class name rather than imported once. `tests/helpers/` is this suite's established home for shared fakes (`fake-clock.ts`, `fake-id-source.ts`, `fake-file-system.ts`, and 35 others follow this convention), which is why the absence of a matching module here is observable rather than incidental: every one of the seven sites had to re-derive the same class instead of importing it.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting a `RecordingCheckpoint` (parameterised over whether it tracks `sites` and a `log`) is the home the existing `fake-*.ts` convention already points at; the fix stage owns the actual extraction and any per-call-site adaptation.

## False-positive check
- Gate-pin carve-out: none of the seven files match `*gate*.test.ts` or a kin pattern, and this finding does not touch a pinned count or inventory; not applicable.
- Recording-double carve-out: the carve-out exempts a recording double's NEGATIVE-witness *assertion* ("never called") from being filed as an unfallible assertion (class 2); it does not exempt the double's own repeated hand-written implementation from the duplication class (class 3), which is what this finding cites. Checked and confirmed distinct.
- docs/bugs/ signature search: `grep -rl "RecordingCheckpoint" docs/bugs/` returns no hits — no documented correct-reason-red signature names this class.
- coverage-matrix/bug-doc citation search: `grep -n "checkpoint-granularity.test.ts\|invoke-cancellation-facets.test.ts\|production-cancellation-wiring.test.ts\|query-tool-loop.test.ts\|tool-calls-execute-lowering.test.ts\|query-tool-loop-noncompliance.test.ts\|session-control-dispatch.test.ts" docs/reference/coverage-matrix.md` returned no hits; this finding does not propose merging, renaming, or deleting any of the seven files, only that the duplicated fixture class could be imported rather than re-derived.
- Prior-filing search: `grep -rl "RecordingCheckpoint" quality/intake quality/resolved` hits only PTQ-0403 (fixed), whose cited `RecordingCheckpoint` in tests/active-invocation-wiring.test.ts is a distinct no-op double (`before` returns `Promise.resolve()` with no fields, no recording) bundled with an unrelated `rootWith`/`noopPi`/`driveCtx`/`tick` dispatch harness — not the kinds/sites-recording double cited here. No existing filing covers this specific fixture.
- Coverage-drift check: the finding is about a fixture that exists in test code today and does not assert any behaviour path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: all seven excerpts match byte-for-byte at the cited lines (four copies identical modulo field order / `before:` vs `checkpoint:` log prefix, three reduced copies dropping log and/or sites, same class name and `before`-pushes-kind body in all); tests/helpers/ exports only no-op/passthrough Checkpoint doubles (NOOP_CHECKPOINT ×3, SEAM_NOOP_CHECKPOINT, PassthroughCheckpoint), no recording one; all locations in tests/, no gate/coverage-matrix/docs-bugs carve-out applies (RecordingCheckpoint absent from docs/bugs/, none of the seven files in coverage-matrix.md), and PTQ-0403 covers the no-op dispatch-scaffold double, not this kinds/sites recorder; the stated grep count is wrong — it returns 12 files, not 7, but the five uncited are four no-op doubles (production-subagent-query-model:42, subagent-model-theta-tool:215, subagent-root-drive-wiring:41, tool-return-shape-one-note-production-wired:65 — PTQ-0403's class) plus tests/execution-status-checkpoint-decorator.test.ts:40-47, an eighth recording copy shaped as a `calls: {kind,site}[]` array, so sites:7 undercounts rather than refutes (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
