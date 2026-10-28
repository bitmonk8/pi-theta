---
id: PTQ-1696
title: "Bug 0510's query and scripted-invoke reference pins now assert Result values without a coordination note."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0510-block-trailing-call-value-discarded.md:369-376
  - docs/bugs/0510-block-trailing-call-value-discarded.md:460-465
  - docs/bugs/0510-block-trailing-call-value-discarded.md:481-482
  - tests/b0510-block-trailing-call-tail.test.ts:309-317
  - tests/b0510-block-trailing-call-tail.test.ts:365-372
  - docs/bugs/0514-fn-query-tail-unwrapped-at-call-boundary.md:350-355
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0510's query and scripted-invoke reference pins now assert Result values without a coordination note.

## Observation
Bug 0510 names its block-tail witness and describes the fn query-tail boundary as returning an unwrapped outcome, including the single-form reference. Commit 76f2a5b4 changed the query reference and scripted-invoke expectations in that witness to exact `makeOk` values. Bug 0514 expressly identifies these legacy re-pins. Bug 0510 retains its unwrapped-result account without an appended coordination note identifying the changed witness disposition.

## Evidence
Named evidence, `docs/bugs/0510-block-trailing-call-value-discarded.md:369-376`:
```text
- Tests that lock it: `tests/b0510-block-trailing-call-tail.test.ts`, 54
  cells.
  - 14 bug cells:
    - parse shape: call, invoke and query tails; the ParForBody tail; the
      BlockExpr `block-expr-missing-tail`;
    - runtime values: fn body, par-for body, the inline minimal repro, E5,
      E2, BlockExpr, a trailing invoke, and a trailing query (as
      single-form parity).
```
The execution/cell totals identify the historical witness entry; this finding does not challenge them.

Claim, same record, `:460-465`:
```text
  4. A fn whose tail is a query does not re-wrap the query outcome at its
     call boundary. `fn f() { let z = 1⏎ @`q` }; match f() { Ok(v) => …,
     Err(e) => … }` panics with `MatchError: no arm matched settled-reply`,
     although FN-3 infers `Result<string, QueryError>`. The single-form
     `{ @`q` }` behaves the same way, and did before the fix. Before the
     fix the multi-statement form was a QRY-19 parse error.
```

Coordination state, same record, `:481-482`:
```text
- Discharge notes appended: none. This fix does not touch 0082's residuals
  or 0504–0509.
```

Changed trailing-invoke pin, `tests/b0510-block-trailing-call-tail.test.ts:309-317`:
```ts
  it("fn body ending in a bare `invoke(...)` returns the invoke's value", async () => {
    const execution = await runScriptedInvoke(
      'fn f(n: number) { let z = 1\n invoke("./c.theta", n) }\nlet r = f(1)\nr',
    );
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(
      execution.result.value,
      "FN-5: `f(1)`'s final value is the tail invoke's value — the same value the single-form control yields",
    ).toEqual(makeOk(INVOKE_PAYLOAD));
```

Changed single-form reference pins, same test, `:365-372`:
```ts
  it("single-form fn tail `@`-query and `invoke(...)` yield their values (the RED cells' reference values)", async () => {
    const q = await lenient.driveInterp("fn f(n: number) { @`q ${n}` }\nlet r = f(1)\nr");
    if (q.kind === "threw") {
      throw new Error(`query drive threw ${String(q.thrown)}`);
    }
    expect(q.value, "single-form query tail").toEqual(makeOk("settled-reply"));
    const i = await runScriptedInvoke('fn f(n: number) { invoke("./c.theta", n) }\nlet r = f(1)\nr');
    expect(i.result.value, "single-form invoke tail").toEqual(makeOk(INVOKE_PAYLOAD));
```

Successor confirmation, `docs/bugs/0514-fn-query-tail-unwrapped-at-call-boundary.md:350-355`:
```text
or made. The three planned legacy expectations in
`tests/b0510-block-trailing-call-tail.test.ts:317,370,372` now assert exact
`makeOk(payload)` rather than a raw payload: one query reference and two raw
scripted-invoke seam references. Fixtures and all remaining assertions stay
intact. The production invoke path already carries Result; the raw seam is
not a claim about production untyped invoke payloads.
```

Searches run in this session:
- `git log --format='%h %s' -S'toEqual(makeOk("settled-reply"))' -- tests/b0510-block-trailing-call-tail.test.ts` — 1 commit hit, 76f2a5b4. `git show 76f2a5b4 -- tests/b0510-block-trailing-call-tail.test.ts` confirms each of the separately quoted expectations changed from raw payload equality to `makeOk` equality.
- `grep -nE '0514|76f2a5b4|coordination|Discharge notes' docs/bugs/0510-block-trailing-call-value-discarded.md` — 1 matching line, :481, the historical discharge statement; no later 0514 coordination note. The complete end of the record was read as well.

## Why this is a problem
The claim→evidence chain leads from an unwrapped fn-query outcome account to a reference assertion that now requires a wrapped Result. The successor confirms the deliberate re-pin, so this is evidence-pointer decay rather than a judgment about whether either behavior is correct. The historical fix record can remain intact while an appended coordination note makes its witness's current disposition explicit.

## Suggested direction (non-binding, optional)
Append a dated coordination note identifying 76f2a5b4 / bug 0514 and the query and scripted-invoke reference re-pins, preserving the successor's distinction between the raw scripted seam and production invoke behavior.

## False-positive check
Each changed assertion was opened separately, and the successor record and Git diff independently identify the same changes. Single/multi query parity remains true; the finding is the raw-versus-Result reference disposition and absent coordination, not loss of parity. The scripted invoke seam is not treated as proof of a production invoke defect. These default-suite assertions are current evidence under the supplied green preflight; no tests were run. No citation-form gate, intentionally deleted scratch probe, or merely unverified live path is challenged. The other 0510 final-par-for re-pin belongs to a different commit and is not included here.

## Triage
verdict: confirmed — Both stated searches reproduce; 76f2a5b4 and bug 0514 explicitly confirm all three raw-to-Result re-pins, and 0510 has no coordination note. The successor prohibits rewriting historical records, not appending a coordination note; no duplicate was found and no tests were executed. Append verbatim (\n denotes a newline): "### Coordination note — 2026-10-28, bug 0514 (unreleased - commit/push only)\n\nCommit 76f2a5b4 (bug 0514 fix, unreleased - commit/push only; no new package release) re-pinned three expectations in tests/b0510-block-trailing-call-tail.test.ts: the trailing-invoke fn cell at :317 and single-form invoke reference at :372 now assert makeOk(INVOKE_PAYLOAD), and the single-form query reference at :370 now asserts makeOk(\"settled-reply\"). The invoke references use the raw scripted seam; production invoke already carries Result. Single-/multi-form query parity remains intact. The wording above stands as a dated record; current disposition: docs/bugs/0514-fn-query-tail-unwrapped-at-call-boundary.md." (triage: claude-opus-5-5)
