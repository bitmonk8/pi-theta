---
id: PTQ-0620
title: production-subagent-query-model.test.ts's "full fidelity" transport-envelope test checks 2 of the envelope's 5 fields
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-subagent-query-model.test.ts:144-163
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# production-subagent-query-model.test.ts's "full fidelity" transport-envelope test checks 2 of the envelope's 5 fields

## Observation
The test named `"surfaces the child's Err(transport) envelope with full
fidelity — never a fabricated Ok"` constructs a `TransportError` fixture
carrying five fields (`kind`, `message`, `http_status`, `provider`,
`retryable`) and drives it through the production drive. Its assertions read
back only two of those five fields (`kind`, `http_status`); `message`,
`provider`, and `retryable` are set on the fixture but never read back off
`result.error`.

## Evidence
tests/production-subagent-query-model.test.ts:144-163
```ts
it("surfaces the child's Err(transport) envelope with full fidelity — never a fabricated Ok", async () => {
    const h = await bindAndLaunch();
    const driving = h.drive();
    const transport: TransportError = {
      kind: "transport",
      message: "provider 503",
      http_status: 503,
      provider: "anthropic",
      retryable: true,
    };
    h.child.emitErrEnvelope(transport as QueryError);
    const result = await driving;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as unknown as TransportError).kind).toBe("transport");
      expect((result.error as unknown as TransportError).http_status).toBe(503);
    }
    await h.teardown?.();
    h.finishInvocation?.();
  });
```
`message`, `provider`, and `retryable` are assigned into `transport` at lines
149, 151-152 but appear nowhere else in the test body — no
`expect((result.error as unknown as TransportError).message)`,
`.provider`, or `.retryable` line exists.

## Why this is a problem
"Full fidelity" is the test's own claim about what crossing the boundary
preserves — every field of the envelope, not a subset. The body checks two
of the five fields the fixture sets, so a regression that dropped, renamed,
or corrupted `message`, `provider`, or `retryable` while marshalling the
error across the child boundary would leave this test green even though the
very claim its name makes ("full fidelity") would be false for that
regression. A reader relying on the name has no way to know, from the test
alone, that three of the five fields it appears to construct for verification
are never read back.

## Suggested direction (non-binding, optional)
Asserting the whole `result.error` against the `transport` fixture object
(e.g. `toEqual(transport)`) would make every field the fixture sets part of
what "full fidelity" actually checks.

## False-positive check
- Gate-pin: `tests/production-subagent-query-model.test.ts` does not match
  `*gate*.test.ts` or the named gate kin.
- Recording-double: `h.child.emitErrEnvelope` drives a fake JSON child
  through its real production consumer; the assertion under review is a
  positive-value check on the returned `Result`, not a "never called"
  MUST-NOT witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "full fidelity\|subagent-error-
  fidelity" docs/bugs/` → one unrelated hit (docs/bugs/0067, a different
  file discussing `#subagent-error-fidelity` in the context of enum-tag
  reconstruction, not this test or its field coverage). No open bug document
  cites this test by name or documents a correct reason for the narrower
  check.
- coverage-matrix/bug-doc citation search: `grep -n "surfaces the child's
  Err(transport) envelope" docs/reference/coverage-matrix.md` → 0 hits. This
  finding does not argue a new test path is missing; it is that the
  existing test's own name overstates what its own existing assertions
  check on the fixture the test itself already constructs.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim at tests/production-subagent-query-model.test.ts:144-163 (file green 5/5 at HEAD): the fixture sets 5 TransportError fields and the body reads back only `kind` and `http_status`, while "full fidelity" echoes the spec's #subagent-error-fidelity clause (subagent.md:222, "expected fidelity loss of zero") and the production path passes the envelope's `err` through unchanged (subagent-envelope.ts:458-462 `error: record.err as QueryError`; subagent-json-driver.ts:276-280 `error: parse.error`), so a parse-side regression dropping `message`/`provider`/`retryable` would leave this test green against its own name; the sibling Ok-arm cell (:132-142) already uses whole-value `toEqual`, showing the file's own convention; stated searches reproduce (docs/bugs hit is only 0067:403 on the enum-tag arm; 0 coverage-matrix hits; no bug doc documents the narrower check); same misleading-name shape confirmed in PTQ-0217/0235/0248/0249/0383; no store entry tracks this cell — the three same-wave siblings on this file are fixture-duplication filings, a different root cause (triage: claude-fable-5-1)
