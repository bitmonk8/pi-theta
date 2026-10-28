---
id: PTQ-1770
title: query-schema-transitive-defs.test.ts redeclares the canonical RespondingModel double.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/query-schema-transitive-defs.test.ts:258-269
  - tests/query-schema-transitive-defs.test.ts:282-289
  - tests/helpers/typed-query-harness.ts:41-54
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# query-schema-transitive-defs.test.ts redeclares the canonical RespondingModel double.

## Observation
`tests/query-schema-transitive-defs.test.ts` declares a local `RespondingModel` and constructs it for the typed-query validation witness. `tests/helpers/typed-query-harness.ts` already exports a double with the same name, constructor, method signatures, throw messages and forced-response payload. The implementations differ only by the helper's export modifier and explanatory comment. This is one local double reimplementation, compared with its existing helper definition.

## Evidence
Local double, `tests/query-schema-transitive-defs.test.ts:258-269`:
```ts
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

Canonical double, `tests/helpers/typed-query-harness.ts:41-54`:
```ts
export class RespondingModel implements QueryModelDriver {
  constructor(private readonly payload: unknown) {}
  nextFreePhaseTurn(): Promise<FreePhaseTurn> {
    // A `max_rounds: 0` typed query never reads a free-phase turn; fail loudly
    // rather than hang if a broken loop ever reaches here.
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

Existing use, `tests/query-schema-transitive-defs.test.ts:282-289`:
```ts
    const outcome = await runTypedQueryLoop(
      NOOP_CHECKPOINT,
      liveSignal(),
      new RespondingModel([VALID_ITEM]),
      config(),
      validation,
    );
```

## Why this is a problem
This is the D7 copy-paste-double class: the test reimplements an existing canonical helper rather than supplying only its fixture-specific payload. The quoted definitions independently encode the same two forbidden-turn guards and the same forced-response wrapper; there is no test-specific behaviour in the local implementation. The existing shared home is `tests/helpers/typed-query-harness.ts`.

## False-positive check
- Gate-pin check: the scoped file is a schema-validation bug-witness suite, not a census/pin gate. The finding concerns its model double, not its expected definition inventories.
- Recording-double check: both quoted classes are scripted stimulus doubles; neither records calls or supplies a MUST-NOT assertion. Their forbidden-turn throws are preserved in both definitions and are not alleged to be silent skips.
- docs/bugs/ signature search: `rg -n 'query-discard\.test|transportErr|query-error-fixtures|typed-query-harness|RespondingModel' docs/bugs docs/reference/coverage-matrix.md` returned no matches. A separate `query-schema-transitive-defs` search found the suite citations in bugs 0004 and 0028; both reports record fixed defects. This filing makes no claim that historical red witnesses should be disabled or changed.
- Coverage-matrix/bug-doc citation check: the separate suite-name search returned no coverage-matrix match and did find `docs/bugs/0004-generic-annotation-drops-transitive-defs.md` and `docs/bugs/0028-unresolved-annotation-silent-permissive-lowering.md`. No test merge, rename or deletion is proposed; the cited witnesses and assertions remain outside this observation.
- Local reference check: `rg -n 'RespondingModel|typed-query-harness|instanceof' tests/query-schema-transitive-defs.test.ts` returned the declaration and direct construction quoted above, with no helper import or identity check. No dead-code or production-caller claim is made.
- History/duplicate-topic check: git history shows the local class in commit `018866b3` and the exported helper introduced by `118fa3e7`. PTQ-0644 concerns production-typed-query-validation/e2e-s3, not this local class. PTQ-0432 explicitly lists this file as context only and excludes it from its finding locations. The other existing reports matching this scoped filename concern AJV or checkpoint helpers, not this double.
- Scope check: this judges an existing test double only. It does not request additional tests, change suite composition, or assert a runtime bug or coverage gap.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce; the live local RespondingModel at tests/query-schema-transitive-defs.test.ts:258-269 matches the exported helper exactly after removing export and comments, including both forbidden-turn guards and the response wrapper. This is D7 copy-paste-double duplication with no fixture-specific behaviour; bug 0004/0028 witnesses remain unchanged, and resolved PTQ-0432/0644/1079/1481 neither track this local double nor prescribe keeping it inline. (triage: claude-opus-5-5)
