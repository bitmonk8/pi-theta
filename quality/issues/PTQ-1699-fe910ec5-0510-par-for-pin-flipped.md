---
id: PTQ-1699
title: "Bug 0510 still describes its final-par-for control as unpromoted after fe910ec5 re-pinned its structural shape."
lens: D10
status: open
verdict: confirmed
locations:
  - docs/bugs/0510-block-trailing-call-value-discarded.md:308-311
  - docs/bugs/0510-block-trailing-call-value-discarded.md:377-379
  - docs/bugs/0510-block-trailing-call-value-discarded.md:468-471
  - docs/bugs/0510-block-trailing-call-value-discarded.md:481-482
  - tests/b0510-block-trailing-call-tail.test.ts:426-435
  - docs/bugs/0516-statement-position-par-for-trailing-value-kept.md:236-242
sites: 1
fix_scope: localized
d10_class: decayed-pointer
wave: qw20261028153325
reported_by: lens-d10-verification (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Bug 0510 still describes its final-par-for control as unpromoted after fe910ec5 re-pinned its structural shape.

## Observation
Bug 0510 describes the final statement-position par-for as excluded from promotion and names a witness control for its trailing-statement value. Commit fe910ec5 changed that control's structural oracle from an expression statement with no tail to a real par-for tail. The current cell explicitly attributes the re-pin to bug 0516, whose record authorizes it. Bug 0510 contains no coordination note explaining that its named control now pins the later structural disposition.

## Evidence
Claim, `docs/bugs/0510-block-trailing-call-value-discarded.md:308-311`:
```text
    - `"line-start"` keeps the `lineStart` gate and its postfix-`?` / `}`
      restoration. `parseIf` (then and else), `parseWhile`, `parseFor`, the
      depth-0 `parseBody` and `parseSingleExpressionWithResidue` use it.
    - A statement-position `par for` is never a promotion candidate.
```

Named control, same record, `:377-379`:
```text
  - Controls: single-form promotion, ident and match tails, `?`- and
    `}`-preceded tails, the depth-0 tail, the StmtBlock discard, and a
    statement-position `par for`.
```

Witness-linked disposition, same record, `:468-471`:
```text
  6. A statement-position `par for` that ends a block yields its value
     (`[Ok(42)]`) through `executeBlock`'s trailing-`expr` rule, although
     grammar.md §Blocks calls that value discarded. The witness control pins
     the observed value.
```

Coordination state, same record, `:481-482`:
```text
- Discharge notes appended: none. This fix does not touch 0082's residuals
  or 0504–0509.
```

Current control, `tests/b0510-block-trailing-call-tail.test.ts:426-435`:
```ts
  it("a final par for is a structural tail and retains its value (bug 0516)", async () => {
    // A final `par for` is a structural tail and retains its value under the
    // approved bug-0516 ruling; non-final and StmtBlock uses discard.
    const src = 'fn pure(n: number): number { n + 41 }\nfn wrap() { let z = 1\n par for m in [1] max 2 { pure(m) } }\nwrap()';
    const body = fnBody(parseClean(src), "wrap");
    expect(shapeOf(body), "the final par-for is the structural tail").toBe("tail=par-for statements=[let]");
    expect(body.tail?.kind, "the tail directly holds the par-for").toBe("par-for");
    const execution = await valueOf(src, "statement-position par for");
    expect(execution.outcome, "the body succeeds").toBe("success");
    expect(execution.result.value, `approved retained value: ${render(execution.result.value)}`).toEqual([makeOk(42)]);
```

Successor authorization, `docs/bugs/0516-statement-position-par-for-trailing-value-kept.md:236-242`:
```text
Either way, the 0510 control cell
(`tests/b0510-block-trailing-call-tail.test.ts:426-442`) is the authorized
re-pin: under (a) its `:441` value pin stays and its comment states the
specified rule; under (b) `:441` flips to `toBeNull()`. A new witness cell per
affected position (`FnBody` single and multi, `ThetaBody`, `ParForBody`
element, `void` control, `StmtBlock` and not-last controls, `BlockExpr`
control) pins the adjudicated value.
```

Searches run in this session:
- `git log --format='%h %s' -S'a final par for is a structural tail' -- tests/b0510-block-trailing-call-tail.test.ts` — 1 commit hit, fe910ec5. `git show fe910ec5 -- tests/b0510-block-trailing-call-tail.test.ts` confirms the old `tail=null statements=[let,expr]` assertion was replaced by the quoted structural-tail assertions; the runtime array equality was retained.
- `grep -nE '0516|fe910ec5|coordination|Discharge notes' docs/bugs/0510-block-trailing-call-value-discarded.md` — 1 matching line, :481, the historical discharge statement. The full record ending was also read; it has no later note recording this re-pin.

## Why this is a problem
The claim→evidence chain now reaches a structural-tail assertion where the record describes an unpromoted trailing expression statement. The successor and changed cell confirm the deliberate structural flip, even though the runtime value did not change. This is pointer/witness decay, not adjudication of the par-for ruling or a request to rewrite the dated account.

## Suggested direction (non-binding, optional)
Append a dated coordination note identifying fe910ec5 / bug 0516, the final-par-for structural re-pin, and the unchanged runtime value oracle.

## False-positive check
Both the structural and runtime assertions were opened: only the former changed disposition. The current comment explicitly names the approved successor ruling, and its record identifies the old control as an authorized re-pin. This default-suite witness is current proof under the supplied green preflight; no tests were executed. Non-final and StmtBlock discard behavior is not challenged. This is not line-number citation drift or a gate-enforced citation-form issue. The separate Result reference re-pins in the same witness came from 76f2a5b4 and are not attributed to this commit.

## Triage
verdict: confirmed — Both stated searches reproduce; fe910ec5 and bug 0516 confirm the structural re-pin, while 0510 has no coordination note and the successor records no deliberate no-note choice. No duplicate was found; no tests were executed. Append verbatim (\n denotes a newline): "### Coordination note — 2026-10-28, bug 0516 (unreleased - commit/push only)\n\nCommit fe910ec5 (bug 0516 fix, unreleased - commit/push only; no new package release) re-pinned the final-par-for control in tests/b0510-block-trailing-call-tail.test.ts:426-435, titled 'a final par for is a structural tail and retains its value (bug 0516)'. Its structural assertions now require tail=par-for statements=[let] and body.tail.kind=par-for instead of an unpromoted trailing expression statement; its runtime equality remains [makeOk(42)]. The wording above stands as a dated record; current disposition: docs/bugs/0516-statement-position-par-for-trailing-value-kept.md." (triage: claude-opus-5-5)
