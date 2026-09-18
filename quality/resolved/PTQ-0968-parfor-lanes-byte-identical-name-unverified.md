---
id: PTQ-0968
title: execution-status-parfor-lanes.test.ts's "byte-identical" test only asserts exec.outcome, never a value or effect comparison
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-parfor-lanes.test.ts:113-128
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# execution-status-parfor-lanes.test.ts's "byte-identical" test only asserts exec.outcome, never a value or effect comparison

## Observation
The test named `"is a no-op interplay: an absent statusLanes field leaves evalParFor byte-identical (S6: b03xx/b0438 shapes untouched)"` drives the same `par for` body as the preceding test but with `statusLanes` omitted from `ExecuteBodyDeps`, and its entire assertion surface is `expect(exec.outcome).toBe("success")`. It never reads `exec.result.value`, never counts the runtime's effect/checkpoint calls, and never compares anything against the sibling test's (with-hooks) outcome or result.

## Evidence

`tests/execution-status-parfor-lanes.test.ts:113-128`:
```ts
  it("is a no-op interplay: an absent statusLanes field leaves evalParFor byte-identical (S6: b03xx/b0438 shapes untouched)", async () => {
    const host = new RecordingParForHost();
    const body = bodyOf('par for f in [1, 2, 3] max 2 { invoke("./c.theta", f) f }');
    const deps: ExecuteBodyDeps = {
      env: buildEnvironment({ body }),
      host,
      checkpoint: SEAM_NOOP_CHECKPOINT,
      signal: new AbortController().signal,
      mutator: { ...SEAM_NOOP_MUTATOR },
      mode: "prompt",
      file: "test.theta",
      // statusLanes intentionally absent
    };
    const exec = await executeBody(body, deps);
    expect(exec.outcome).toBe("success");
  });
```
For comparison, the preceding test in the same file (`:98-111`) drives the identical body with `statusLanes` present and asserts specific hook-call events (`open(3,2)`, `claim(0)`, `settle(0,done)`, `close()`) in addition to `exec.outcome`. The "byte-identical" test asserts none of the analogous facts about the resulting value, and does not capture or compare `exec.result.value` from either run.

## Why this is a problem
The name asserts an equivalence claim — "leaves evalParFor byte-identical" — that promises the reader a comparison proving the presence/absence of `statusLanes` changes nothing observable about the drive. A reader relying on the name would conclude the test demonstrates that the produced value, diagnostics, or effect sequence is unchanged. The body demonstrates only that the drive does not error when `statusLanes` is omitted (`outcome === "success"`); it takes no reading of `exec.result.value` at all, in either this test or the sibling one, so there is no value for "byte-identical" to be measured against. A change that altered the `par for` body's *result value* only when `statusLanes` is absent (a real regression the name claims is ruled out) would not be caught by this assertion.

## Suggested direction (non-binding, optional)
Naming this test for what it verifies — that omitting `statusLanes` does not raise or change `exec.outcome` — would remove the promise of an equivalence check the body does not perform.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named kin.
- Recording-double check: this test constructs no recording double and backs no "never called" negative witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "execution-status-parfor-lanes" docs/bugs/*.md` → 0 hits; no documented correct-reason-red or pinned failure signature covers this test.
- coverage-matrix/bug-doc citation search: `grep -n "execution-status-parfor-lanes" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the test — only that its name overclaims what its body checks.
- This is a bug-vs-D7 boundary check: the finding is not "the behaviour is wrong" (a bug) but "the test's own name claims a verification (byte-identical output) its own assertion body does not perform" (a name/body mismatch), which is squarely the misleading-test-name D7 class.
- Coverage check: not a claim that a path is untested — `exec.outcome` for the absent-`statusLanes` case IS tested; the claim is limited to the gap between the name's equivalence claim and the body's narrower assertion.

## Triage
verdict: confirmed — independently re-verified: excerpt reproduces verbatim at tests/execution-status-parfor-lanes.test.ts:113-128; the `it` title claims an equivalence ("leaves evalParFor byte-identical") but the body's sole assertion is `expect(exec.outcome).toBe("success")` (:127), and `grep -n "exec.result" tests/execution-status-parfor-lanes.test.ts` → 0 hits in either test, so no value/diagnostic/effect observable is captured on either side for "byte-identical" to be measured against — only "does not error when absent" is witnessed, though the runtime's `deps.statusLanes?.open/claim/settle` (statement-executor.ts:2259,2283,2294) is exactly the surface EXST-3 requires to be observation-neutral; D7 misleading-name class in tests/, same title-overclaims-body pattern confirmed for PTQ-0784/0791/0943; suite green (2 passed), not a *gate* file, `RecordingParForHost` records nothing here (no negative-witness carve-out), docs/bugs and coverage-matrix greps → 0 reproduce, no rename/merge/delete of a pinned test proposed; not a duplicate — PTQ-0406 (LaneState dead type), PTQ-0692 (par-for harness sixth copy) and PTQ-0929 cite this file for unrelated root causes (triage: claude-fable-5-1)
