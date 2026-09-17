---
id: PTQ-0580
title: typed-query-schema-integration.test.ts redeclares the NOOP_CHECKPOINT/liveSignal/config/RespondingModel scripted-forced-respond substrate tests/e2e-s3-typed-query-conformance.test.ts already carries
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/typed-query-schema-integration.test.ts:87-122
  - tests/e2e-s3-typed-query-conformance.test.ts:61-96
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# typed-query-schema-integration.test.ts redeclares the tests/e2e-s3-typed-query-conformance.test.ts scripted-forced-respond typed-query substrate

## Observation
`tests/typed-query-schema-integration.test.ts` declares, module-scope, its own
`config()` (a `QueryToolLoopConfig` builder), `liveSignal()`, `NOOP_CHECKPOINT`
and `RespondingModel` (a scripted `QueryModelDriver` whose forced-respond turn
carries a fixed payload) — the same four-piece "drive a typed query through
the real `runTypedQueryLoop` with a scripted forced-respond driver" substrate
`tests/e2e-s3-typed-query-conformance.test.ts` declares at lines 61-96, in the
same order, with the `RespondingModel` class body byte-identical between the
two files. A prior finding filed earlier in this same wave
(`qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md`) already
identified this exact substrate duplicated between
`tests/b0292-validation-errors-canonical-order.test.ts` and
`tests/e2e-s3-typed-query-conformance.test.ts`, and named
`tests/typed-query-schema-integration.test.ts` as a file where "the pattern
also recurs (same `RespondingModel` class name and shape)" but explicitly
stated that file was "outside this review's scope and not cited as a location
of this filing." This review's scope includes
`tests/typed-query-schema-integration.test.ts` directly, so this finding cites
it as a location for the first time.

## Evidence

`tests/typed-query-schema-integration.test.ts:87-122`:
```ts
function config(): QueryToolLoopConfig {
  // A typed query dispatches only the forced-respond terminator (no free-phase
  // provider call), so `max_rounds: 0` fires the `max_rounds`-final branch at
  // typed-query start and the forced respond turn is the only turn.
  return {
    maxRounds: 0,
    querySite: QUERY_SITE,
    thetaSlashName: "/report",
    invocationId: "00000000-0000-4000-8000-000000000000",
    occurredAt: 1_700_000_000_000,
  };
}

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A scripted `QueryModelDriver` whose forced respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    // A `max_rounds: 0` typed query never reads a free-phase turn; fail loudly
    // rather than hang if a broken loop ever reaches here.
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(_batch: readonly ToolCallRequest[]): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}
```

`tests/e2e-s3-typed-query-conformance.test.ts:61-96` — the counterpart, same
order, same declarations, `RespondingModel` body byte-identical:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function liveSignal(): AbortSignal {
  return new AbortController().signal;
}

function config(): QueryToolLoopConfig {
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — no free-phase provider call — so the scripted driver
  // supplies only the forced-respond payload.
  return {
    maxRounds: 0,
    querySite: { file: "triage.theta", line: 1, column: 1 },
    thetaSlashName: "/triage",
    invocationId: "inv-s3",
    occurredAt: 0,
  };
}

/** A scripted `QueryModelDriver` whose forced-respond turn carries `payload`. */
class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    throw new Error("no free-phase turn on a max_rounds:0 typed query");
  }
  runToolBatch(): Promise<readonly never[]> {
    throw new Error("no tool batch on a max_rounds:0 typed query");
  }
  forcedRespondTurn(): Promise<ForcedRespondTurn> {
    return Promise.resolve({ kind: "respond", payload: this.payload });
  }
}
```

Verification performed during this review: the `RespondingModel` class bodies
are identical apart from a code comment in the `nextFreePhaseTurn` throw arm
and the `_batch`/no-parameter naming of the unused `runToolBatch` argument; the
`NOOP_CHECKPOINT`/`liveSignal` declarations are byte-identical; `config()`
differs only in its doc comment and its fixture-specific literals
(`QUERY_SITE`/`"/report"`/a UUID invocation id vs. an inline site
literal/`"/triage"`/`"inv-s3"`).

## Why this is a problem
Two files each type the identical four-piece "drive a typed query through the
real `runTypedQueryLoop` with a scripted forced-respond driver" scaffold — a
`Checkpoint` double, a live `AbortSignal` factory, a `QueryToolLoopConfig`
builder, and a `QueryModelDriver` fake whose class body is byte-identical
across the two files — rather than importing one shared declaration. This
same substrate was already found duplicated across three other files in this
wave (`b0292-validation-errors-canonical-order.test.ts`,
`e2e-s3-typed-query-conformance.test.ts`,
`production-typed-query-validation.test.ts`), each filed as a separate finding
because each was newly in-scope; this finding extends that same observation to
`tests/typed-query-schema-integration.test.ts`, now in-scope for this review.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module for the "scripted-forced-respond typed-query
substrate" (the same shape the sibling findings in this wave already propose
for the b0292/e2e-s3/production-typed-query-validation trio) would be the
natural home for this file's copy too, parameterised by the fixture-specific
literals (query site, slash name, invocation id) that are the only lines that
actually vary.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are scaffolding declarations, not a pinned
  count/inventory assertion.
- Recording-double check: `RespondingModel` is a scripted stimulus double (its
  `forcedRespondTurn` returns a fixed payload), not a "never called" negative
  witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "typed-query-schema-integration" docs/bugs/` and `grep -n "typed-query-schema-integration" docs/reference/coverage-matrix.md` both return 0 hits — no bug doc or coverage-matrix entry pins this file's substrate as a documented correct-reason red or as a named citation requiring the current shape.
- Prior-finding check: `qw20260917154546-d7-01-b0292-typed-query-substrate-mirrored.md` names this exact file for context ("The pattern also recurs … in … tests/typed-query-schema-integration.test.ts") but explicitly excludes it from that filing's locations because it was out of that review's scope; this review's scope includes it, so this is a new, non-duplicate filing against a previously-uncited location, matching the precedent already set by the sibling `qw20260917154546-d7-11-typed-query-validation-substrate-mirrors-e2e-s3.md` filing for `production-typed-query-validation.test.ts`.
- Coverage check: the claim is entirely about a repeated harness/fixture
  DEFINITION; each file's own tests exercise their own copy, so this is not a
  coverage-gap claim.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match at the cited lines; diff of typed-query-schema-integration:87-122 vs e2e-s3:61-96 shows NOOP_CHECKPOINT and liveSignal byte-identical, RespondingModel code-identical bar one comment and the `_batch` parameter spelling (not strictly byte-identical as the title says, but the body's verification paragraph states the same), config() differing only in fixture literals; `class RespondingModel` greps to 6 test files with no tests/helpers/ provider; both locations in tests/, neither gate nor tests/live, RespondingModel is a stimulus double not a negative-witness recorder; candidate's "0 hits in docs/bugs/" claim is wrong (docs/bugs/0010:438,527 and 0055:495,712,892 cite the file) but both are fixed bugs naming it only as a mechanism-agnostic witness suite / LOWERED-constant edit site, with no merge/rename/delete proposed, so no carve-out applies; not a duplicate — sibling d7-01-b0292 (confirmed) cites the disjoint b0292/e2e-s3 pair and named this file as context only, and the store's per-pair convention (PTQ-0222/0237/0250/0311/0313 registry-oracle rows) treats each newly-cited location as its own row (triage: claude-fable-5-1)
