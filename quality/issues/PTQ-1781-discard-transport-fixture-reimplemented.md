---
id: PTQ-1781
title: query-discard.test.ts reimplements the shared transport error fixture.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/query-discard.test.ts:55-64
  - tests/query-discard.test.ts:120-129
  - tests/helpers/query-error-fixtures.ts:13-21
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# query-discard.test.ts reimplements the shared transport error fixture.

## Observation
`tests/query-discard.test.ts` declares `transportErr()` to construct a transport error used as the discarded query's outcome. `tests/helpers/query-error-fixtures.ts` already exports `transport(message)`, constructing the same five fields with the same fixed values. The only specialization in the scoped factory is the message `"provider connection reset"`, which is the shared factory's parameter. This is one local fixture reimplementation, compared with its canonical helper.

## Evidence
Scoped factory, `tests/query-discard.test.ts:55-64`:
```ts
/** A discarded `Err` payload (`transport`) whose kind/message the event preserves. */
function transportErr(): TransportError {
  return {
    kind: "transport",
    message: "provider connection reset",
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}
```

Canonical fixture, `tests/helpers/query-error-fixtures.ts:13-21`:
```ts
export function transport(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: true,
  };
}
```

Existing stimulus use, `tests/query-discard.test.ts:120-129`:
```ts
describe("V13g-T — QRY-20 discard observability", () => {
  it("QRY-20: a discarded query that settles to Err emits exactly one operator-facing event (display:false) preserving kind/message, discard_site = the `let _ =` location", () => {
    const { deps, sent } = makeChannel();
    const err: QueryError = transportErr();
    const discardSite = { file: "a.theta", line: 12, column: 1 };

    emitDiscardObservability(
      emitInput({ ok: false, error: err }, { discardSite }),
      deps,
    );
```

## Why this is a problem
This is the D7 copy-paste-fixture class. Substituting the scoped message into the shared factory yields exactly the local fixture's return value, including provider, HTTP status and retryability; the local factory adds no discard-specific field or behaviour. The fixture's structural contract is therefore independently encoded in the scoped test despite an existing shared home in `tests/helpers/query-error-fixtures.ts`. The observation concerns stimulus construction, not the test's independently asserted event fields.

## False-positive check
- Gate-pin check: `query-discard.test.ts` is a discarded-query parse/emission suite, not a census/pin gate. No expected inventory or pinned count is challenged.
- Recording-double check: `transportErr` is a value fixture, not a call recorder. The imported recording channel and the no-event assertion for discarded Ok are legitimate witnesses and are not part of this finding.
- docs/bugs/ signature search: `rg -n 'query-discard\.test|transportErr|query-error-fixtures|typed-query-harness|RespondingModel' docs/bugs docs/reference/coverage-matrix.md` returned no matches. The finding does not treat the file's historical TDD-red description as a silent skip or ask to change an intentionally red witness.
- Coverage-matrix/bug-doc citation check: the same search found no citation to this scoped test filename or fixture identifier. No test merge, rename or deletion is proposed, and no new test is requested.
- Reference check: `rg -n 'transportErr|query-error-fixtures' tests/query-discard.test.ts` returned the declaration and calls at lines 123, 149 and 167, with no shared-fixture import. The Evidence quotes one existing stimulus use; no unused-code claim is made.
- History/duplicate-topic check: git identifies `d88e07ec` as the local factory's introduction and `0c6dc4f1` as the shared export's introduction. PTQ-0609's leaf-fixture finding covers b0382, err-note-render and e2e-s5, not this file. Existing reports matching `query-discard.test.ts` concern recording-channel scaffolding, discard input fields, parser ownership or production event projection; none concerns this local transport factory.
- Scope check: this is an existing test-fixture duplication observation, not a coverage request, suite-composition objection, behaviour change or runtime-risk report.

## Triage
verdict: confirmed — excerpts and stated searches reproduce; transportErr's return body is identical to shared transport after substituting its message, and its three calls add no discard-specific behaviour. This is D7 copy-paste fixture duplication under tests/ with no applicable carve-out; history matches, and resolved PTQ-0609 covers other files without prescribing this local factory. No existing issue tracks this occurrence. (triage: claude-opus-5-5)
