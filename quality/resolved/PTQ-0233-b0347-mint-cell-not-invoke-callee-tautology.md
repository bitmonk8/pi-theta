---
id: PTQ-0233
title: b0347 child-mint cell asserts surfaced.kind is not "invoke_callee" after already binding it to the literal "invoke_infra", so the second assertion cannot independently fail
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:470-482
  - tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:430-442
sites: 1
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0347 child-mint cell asserts surfaced.kind is not "invoke_callee" after already binding it to the literal "invoke_infra", so the second assertion cannot independently fail

## Observation
In bug 0347's INV-5 oracle `describe` block, the cell for the child-side-mint
case first asserts `surfaced.kind` (a plain `string` field `surfaceInvoke`
returns) equals the literal `"invoke_infra"` via `.toBe(...)`, then
immediately asserts the same `surfaced.kind` `.not.toBe("invoke_callee")`.
`.toBe` is `Object.is` strict equality, so once the first assertion passes,
`surfaced.kind` is bound to the exact string `"invoke_infra"` for the rest of
the test; `"invoke_infra"` and `"invoke_callee"` are distinct string literals
that can never be equal, so the second assertion cannot fail in any run that
reaches it.

## Evidence
`tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:470-482`
(the whole cell):
```ts
  it("child-side mint invoke_infra(load_failure): the subagent leg stays boundary-minted and surfaces the leaf BARE", async () => {
    // A genuine child-side mint carries `err_provenance:"mint"` and must stay
    // bare — the disposition today's bare tagging already gets right and the fix
    // preserves. GREEN both at fork and post-fix (proxy coincides with the mint).
    const mintSource = await driveSource(stampedEnvelope("load_failure", "mint"));
    const surfaced = await surfaceInvoke(mintSource, propagatedLeaf());
    expect(mintSource, "an explicit `mint` marker keeps the leaf boundary-minted").toBe("boundary-minted");
    expect(
      surfaced.kind,
      "a boundary-minted leaf passes bare through the XMODE-1 gate — kind stays invoke_infra, no wrap",
    ).toBe("invoke_infra");
    expect(surfaced.kind).not.toBe("invoke_callee");
  });
```

`surfaceInvoke`'s return type, showing `kind` is a plain `string` with no
side channel the two assertions could disagree about,
`tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:430-442`:
```ts
async function surfaceInvoke(
  source: InvokeResultSource,
  leaf: QueryError,
): Promise<{ readonly kind: string; readonly hops: readonly RecordedHop[] }> {
  const hops: RecordedHop[] = [];
  const invoke = invokeChildWithSource(WORKER, leaf, source);
  const deps = seamDeps(invoke, (hop) => hops.push(hop));
  const exec = await executeBody(tailBody(invokeExpr(WORKER)), deps);
  const value = exec.result.value as ResultValue;
  expect(value.ok, "a driven Err invoke surfaces an Err at the parent tail").toBe(false);
  const err = (value as unknown as { readonly error: QueryError }).error;
  return { kind: (err as unknown as { readonly kind: string }).kind, hops };
}
```

Exact search: `grep -n "\.not\.toBe(" tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`
→ 1 hit, line 481 (the line cited above) — this is the only instance of this
shape in the file.

## Why this is a problem
`expect(surfaced.kind, "...").toBe("invoke_infra")` (lines 477-480) executes
only when control reaches it, and passing it fixes `surfaced.kind` to the
literal string `"invoke_infra"` for any later read in the same test. The very
next line, `expect(surfaced.kind).not.toBe("invoke_callee")` (line 481),
re-reads the same field, already known to hold `"invoke_infra"`;
`"invoke_infra"` and `"invoke_callee"` are different string literals
independent of anything the test drives, so the second expectation is
entailed by the first and contributes no additional failure-detecting power
— no code path that reaches line 481 can make it throw. This is the
"tautologies" instance of D7's "assertions that cannot fail" class (AGENTS.md
"Assert on real observables"). A reader relying on line 481 as a guard
against a regression where the XMODE-1 gate starts wrapping a genuine
child-side mint into `invoke_callee` would be relying on a check that could
never catch that regression — the `.toBe("invoke_infra")` assertion
immediately above it would already have failed first, for the same reason.

## Suggested direction (non-binding, optional)
None offered beyond the observation above; the fix stage owns whether a
distinct assertion (e.g. against `hops.length` staying `0`, which the
sibling cell in the adjacent SLSH-5 `describe` block already checks) belongs
in line 481's place.

## False-positive check
- Gate-pin check: `tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts`
  does not match `*gate*.test.ts` or its named kin.
- Recording-double check: `surfaced.kind` is a plain field read off an
  already-returned value (via `surfaceInvoke`), not a call-recording
  double; the cited assertion is not a MUST-NOT-called negative witness
  (the file's genuine negative witnesses are the `hops.length` counts in
  the adjacent SLSH-5 `describe` block, which this finding does not touch),
  so that carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0347-subagent-leg-propagated-mintable-invoke-infra-stays-bare.md`
  is this test's own originating bug (open at HEAD); its witness summary
  lists this cell among those "GREEN at this fork" ("every mintable
  stamped-`mint`... cell"), but states no rationale for the
  `toBe`/`not.toBe` pairing being deliberate.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0347-subagent-leg-propagated-mintable-wrapped-unit"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of the cell — only that one line within it is
  redundant given the line immediately above it — so no witness-list
  citation is disturbed.
- Pattern context (not claimed as an additional in-scope site): the same
  shape (a `.toBe(<other kind>)` immediately followed by
  `expect(...).not.toBe("invoke_callee")` on the same field) also recurs in
  `tests/b0295-child-internal-cancel-wrap-arm.test.ts:365-370` — filed this
  wave as `qw20260912091742-d7-04-redundant-not-invoke-callee-assertion.md`,
  which itself names this exact `b0347:481` line only as pattern context and
  explicitly declines to claim it as an in-scope location because b0347 was
  outside that shard's review scope — and in
  `tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:440,497`
  (outside this wave's scope entirely, per that same finding). This finding
  is the one that claims `tests/b0347-...` as its own location, since b0347
  is this shard's assigned scope.
- Coverage check: this finding does not claim a missing assertion or path;
  it is limited to one existing line's inability to independently fail
  given the line immediately preceding it.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified verbatim: line 480's passing `.toBe("invoke_infra")` (Object.is) fixes the immutable `surfaced.kind`, so line 481's `.not.toBe("invoke_callee")` can never independently fail; excerpts, line ranges, the 1-hit grep, the 0-hit coverage-matrix search, and gate/negative-witness carve-outs all reproduce, and no duplicate exists (sibling waves' b0295/b0349 findings cite this exact line only as pattern context and explicitly decline to claim it) (triage: claude-opus-5)
