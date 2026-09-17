---
id: PTQ-0520
title: production-live-resolvers.test.ts's "surfaces Err(execution)" test never reads the error's cause field
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-live-resolvers.test.ts:224-232
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# production-live-resolvers.test.ts's "surfaces Err(execution)" test never reads the error's cause field

## Observation
The test named `"an unresolved host tool name surfaces Err(execution) rather
than fabricating a value"` drives a code-side call to a tool name with no
`resolvePiTool` collaborator and asserts only that the outer `Result` is not
`ok`. It never reads the error's `kind` or `cause` field, so nothing in the
test body distinguishes the specific `CodeToolError{cause:"execution"}` the
name names from any other `Err(...)` shape (e.g. a validation error, an
`invoke_infra` error, or any future error kind the production code might
start returning here).

## Evidence
tests/production-live-resolvers.test.ts:224-232
```ts
it("an unresolved host tool name surfaces Err(execution) rather than fabricating a value", async () => {
    // No `resolvePiTool` collaborator: the code-side call names no resolvable
    // host tool, so the dispatch throws and lowers to the execution Err.
    const inner = (await runBody(
      producer({}),
      promptTheta(callExpr("no_such_tool")),
    )) as ResultValue;
    expect(inner.ok, "an unresolved host tool surfaces Err, never Ok('')").toBe(false);
  });
```
The two sibling tests in the same `describe` block (lines 183-223) DO read
`err.cause` after a comparable `.ok === false` check (e.g. line 216:
`expect(err.cause, "the execute() throw lowers to CodeToolError cause
'execution'").toBe("execution");`), showing the pattern the test at 224-232
omits.

## Why this is a problem
The test's title is a specific behavioural claim: the error is a
`CodeToolError` whose `cause` is `"execution"`. A reader relying on the name
would believe that claim was checked, as its sibling tests in the same
`describe` block do check the analogous claim. The body instead asserts only
`inner.ok === false`, which any `Err(...)` shape satisfies — a regression
that changed the error's `kind` or `cause` to something else entirely (for
example `InvokeInfraError{cause:"load_failure"}`) would leave this test green
while silently no longer matching what its own name says it verifies.

## Suggested direction (non-binding, optional)
The sibling tests in the same file (lines 206-223, 240-270) already show the
local pattern — reading `err.kind`/`err.cause` off the same `ResultValue`
cast — that this test's own name calls for.

## False-positive check
- Gate-pin: `tests/production-live-resolvers.test.ts` does not match
  `*gate*.test.ts` or any of the named gate kin; not applicable.
- Recording-double: `inner.ok`/`err.cause` are read off a real production
  `Result` value the executed code path produced, not a "never called"
  negative witness backed by a recording double; the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "no_such_tool\|unresolved host tool"
  docs/bugs/` → 0 hits. No open bug document cites this test by name or gives
  a documented correct-reason for the narrower assertion.
- coverage-matrix/bug-doc citation search: `grep -n "an unresolved host tool
  name surfaces" docs/reference/coverage-matrix.md` → 0 hits. This finding
  proposes no rename, merge, or deletion of the test, only that its body
  does not verify what its name claims — the mismatch itself is the whole
  claim, not "this path is untested" (the `cause` field IS reachable and
  checked by the adjacent sibling tests over the identical code path shape).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified: excerpt matches tests/production-live-resolvers.test.ts:224-232 verbatim and the body reads only `inner.ok`; siblings at 206-223 and 240-256 read `err.cause`/`err.kind` off the same cast; docs/bugs and coverage-matrix greps reproduce at 0 hits and no PTQ tracks this test; a scratch run of the identical drive prints `kind=code_tool cause=unknown_tool` — the title's `Err(execution)` is a superseded claim (bug 0322 §Fix, production-theta-producer.ts:4417-4427: regime-inactive snapshot miss mints the `unknown_tool` carrier and never calls dispatch()), so the unchecked-cause body is what keeps a misleading name green — D7 misleading-name per the PTQ-0266/PTQ-0280 precedent (triage: claude-fable-5-1)
