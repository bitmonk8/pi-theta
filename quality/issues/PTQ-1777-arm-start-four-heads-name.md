---
id: PTQ-1777
title: Schema alias cell n4b names four arm-start heads while asserting one query fixture.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-alias-union-decl.test.ts:302-307
  - tests/schema-alias-union-decl.test.ts:1610-1630
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Schema alias cell n4b names four arm-start heads while asserting one query fixture.

## Observation
Cell n4b is named `the same four heads stop where an arm must START, not only after one`. Its body parses only `F_EMPTY_RHS_THEN_QUERY`, which contains an empty alias right-hand side followed by a bare query. Its assertions inspect that document's statement signature, query tail and empty-body diagnostic; there is no iteration over the preceding query, typed-query, parenthesised-expression and array-literal arrangements.

## Evidence
`tests/schema-alias-union-decl.test.ts:302-307`:
```ts
const F_GENERIC_THEN_QUERY = "schema X = array<integer>\n@`ask something`\n";
const F_GENERIC_THEN_TYPED_QUERY = "schema X = array<integer>\n@<X>`ask`\n";
const F_GENERIC_THEN_PAREN = "schema X = array<integer>\n( 1 + 2 )\n";
const F_GENERIC_THEN_ARRAY_LIT = "schema X = array<integer>\n[1, 2]\n";
/** The ARM-START twin of g4: `=` is itself a trailing trigger. */
const F_EMPTY_RHS_THEN_QUERY = "schema X =\n@`ask`\n";
```

`tests/schema-alias-union-decl.test.ts:1610-1622`:
```ts
  it("n4b: the same four heads stop where an arm must START, not only after one", () => {
    // The punct twin of g4, and the reason the ARM-START position needs the
    // stop as well: `=` is itself a trailing trigger, so the capture opens
    // directly on the `@` with nothing behind it. Ending the capture there is
    // half the job — `finishAliasSchema`'s shapeless-RHS recovery
    // (`skipDeclarationShape`) runs next over the same tokens, and it stops at
    // the same punct heads for the same reason, or the statement the capture
    // refused is consumed by the recovery instead.
    const doc = parse(F_EMPTY_RHS_THEN_QUERY);
    expect(
      stmtSig(doc),
      `n4b — the recovered query is the tail; diagnostics=${JSON.stringify(diagLines(doc))}`,
    ).toEqual(["schema:X"]);
```

`tests/schema-alias-union-decl.test.ts:1623-1630`:
```ts
    expect(doc.body.tail).toMatchObject({
      kind: "query", schema: null, template: "ask",
      range: { start: { line: 5, column: 1 }, end: { line: 5, column: 7 } },
    });
    expect(diagLines(doc), "n4b — shapeless RHS still refuses; tail query is not discarded").toEqual([
      line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "X"]])),
    ]);
  });
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader of n4b's result would infer that the cell exercised four following-statement arrangements at the arm-start boundary. Mechanically, it parses one source and verifies one bare query's survival, so the name's four-arrangement claim exceeds the observable in its body. The finding concerns that existing name, not whether additional arrangements deserve tests.

## Suggested direction (non-binding, optional)
A naming-only correction could describe the bare query at an empty alias right-hand side. This would rename a pinned witness: `docs/bugs/0517-depth0-same-line-final-form-not-promoted.md:120` identifies n4b, its file and this exact query fixture; `docs/bugs/0510-block-trailing-call-value-discarded.md:315-320` also includes n4b in its witness discussion. Preserve the n4b witness identity when considering the name; no added cases, merge or deletion is proposed.

## False-positive check
- Gate-pin check: this is not a gate/census inventory test. The number in question is in the test name, not a deliberately pinned corpus count.
- Recording-double check: this cell reads a parsed document and its diagnostics, not a recording double's MUST-NOT witness.
- docs/bugs/ signature search: `rg -n 'n4b|same four heads' docs/bugs docs/reference/coverage-matrix.md` found n4b in bug 0510 and bug 0517, including bug 0517's query-only fixture row at `:120`. No result quotes `same four heads`. The finding does not challenge the recorded diagnostic change or a documented correct-reason red.
- Coverage-matrix/bug-doc citation search: the same search found no coverage-matrix entry; the bug-doc citations are acknowledged explicitly in the naming direction. Bug 0033 additionally names this file as its offline lock at `docs/bugs/0033-body-level-schema-alias-unsupported.md:184-192`.
- Intent/history check: `git log -S 'same four heads' --oneline -- tests/schema-alias-union-decl.test.ts` locates the name in `f959f8de`; reading that commit's n4b shows the same single `parse(F_EMPTY_RHS_THEN_QUERY)` body. The numerical naming claim was not made accurate by an earlier four-fixture body.
- Existing-topic check: before the first filing, the exact-string search for `same four heads` and `silent at the field position` across quality/issues, quality/resolved and quality/intake returned no matches. Rechecking `same four heads` before this filing found only the first candidate's recorded search command, not another finding about n4b.
- Coverage boundary: the claim compares an existing name with its existing body. It requests no new tests, broader assertions, runtime changes or suite-composition changes; the body's query witness is not disputed.

## Triage
verdict: confirmed — n4b claims “the same four heads” but parses only F_EMPTY_RHS_THEN_QUERY and asserts one bare query’s survival and empty-RHS diagnostic; f959f8de confirms the same single-fixture origin. This is an in-scope D7 misleading name, not a coverage request; the filing acknowledges the 0510/0517 witness citations and preserves n4b’s identity, and no duplicate or resolved naming prescription was found. (triage: claude-opus-5-5)
