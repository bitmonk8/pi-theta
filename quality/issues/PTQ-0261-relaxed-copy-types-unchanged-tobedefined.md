---
id: PTQ-0261
title: binder-bypass-envelope.test.ts's "types unchanged" clause is checked only by toBeDefined(), which passes for any type
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/binder-bypass-envelope.test.ts:133-155
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# binder-bypass-envelope.test.ts's "types unchanged" clause is checked only by toBeDefined(), which passes for any type

## Observation
tests/binder-bypass-envelope.test.ts:133 names a test "relaxed copy: each
defaulted field is removed from the ok arm's args.required, types
unchanged". The name states two claims: the defaulted field is dropped
from `required`, and the field's type is unchanged. The body verifies the
first claim with `toContain`/`not.toContain` comparisons against the actual
`required` array. For the second claim ("types unchanged") the body's only
corresponding line is `expect(argProps?.["focus"]).toBeDefined()` (line
154), which asserts non-`undefined` and reads no further into the value —
it does not compare `argProps.focus` (or its `type` member) against the
original `{ type: "string" }` descriptor the input declared.

## Evidence
tests/binder-bypass-envelope.test.ts:133 — the test's own name:
```ts
  it("relaxed copy: each defaulted field is removed from the ok arm's args.required, types unchanged", () => {
```

tests/binder-bypass-envelope.test.ts:141-155 — the test body from the point
the envelope schema is built; the final two statements are the entirety of
what stands in for "types unchanged":
```ts
    const ok = armByKind(schema, "ok");
    const args = propOf(ok, "args");
    const argsRequired = Array.isArray((args as { required?: unknown } | undefined)?.required)
      ? ((args as { required: string[] }).required)
      : [];
    // The defaulted field is dropped from `required`; the required-without-default
    // field is unchanged; the relaxed copy keeps additionalProperties:false.
    expect(argsRequired).toContain("language");
    expect(argsRequired).not.toContain("focus");
    expect((args as { additionalProperties?: unknown } | undefined)?.additionalProperties).toBe(
      false,
    );
    const argProps = (args as { properties?: Record<string, unknown> } | undefined)?.properties;
    expect(argProps?.["focus"]).toBeDefined();
  });
```
`argProps?.["focus"]` is checked with `toBeDefined()` only. Any non-`undefined`
value at that key — `{}`, `{ type: "number" }`, `{ type: "string", extra: true }`
— satisfies this line; the input's declared descriptor for `focus`
(`{ type: "string" }`, set at line 136 of the same test) is never read back
or compared against what the copy produced.

## Why this is a problem
The test's own name commits to two observable facts about the relaxed
copy; the body demonstrates one of them with a real, falsifiable
comparison and stands in for the other with a check that passes
regardless of what the type descriptor becomes, so long as the key is
still present. A reader relying on the name — "if `focus`'s type is
dropped or mangled by the relaxed-copy transform, this test will fail" —
would be wrong: the test keeps passing under that mutation. This is not a
claim that a *different*, currently-absent test should exist (a coverage
question); it is that this one test, under the name it gives itself,
verifies less than the name states for half of what it names.

The same file shows the stronger check is not a technical reach: the
"$defs closure" test a few lines below (tests/binder-bypass-envelope.test.ts:167)
makes the same kind of "a property survives the args copy unchanged" claim
about `args.properties.author`, and verifies it with `.toEqual` against
the exact expected descriptor rather than a presence check:
```ts
    // tests/binder-bypass-envelope.test.ts:187-192
    expect((schema as { $defs?: unknown }).$defs).toEqual({ Author: authorDef });
    const args = propOf(armByKind(schema, "ok"), "args");
    expect(args?.["$defs"]).toBeUndefined();
    expect((args?.["properties"] as Record<string, unknown>)["author"]).toEqual({
      $ref: "#/$defs/Author",
    });
```
The file's own idiom for "this property came through the copy intact" is
already `.toEqual` against the full expected value; the cited test's
"types unchanged" line does not use it.

## Suggested direction (non-binding, optional)
None beyond observing that the file's own "$defs closure" test, a few
lines away, already shows the `.toEqual`-against-the-expected-descriptor
shape that would make the "types unchanged" clause check what its name
states.

## False-positive check
- Gate-pin check: tests/binder-bypass-envelope.test.ts does not match
  `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate) — this is a V11c-T unit-test file for
  `buildBinderEnvelopeSchema`/`classifyBinderBypass`, not a census/pin
  gate, so the pinned-count carve-out does not apply.
- Recording-double check: `buildBinderEnvelopeSchema` is a pure function;
  no recording double or MUST-NOT witness is involved in this test, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "binder-bypass-envelope" docs/bugs/`
  → docs/bugs/0011-binder-complete-no-forced-tool-free-text-envelope.md:145
  and docs/bugs/0178-subagent-callee-nonbypass-params-unregistered-in-child.md:236,693,1096.
  Both cite this file only by its aggregate test count ("15 tests") as
  regression/witness surface for their own, unrelated bugs (0011's
  wrapped-tool-attachment fix; 0178's non-bypass-params-in-child-spawn
  gap); neither discusses the "types unchanged" clause or states a
  rationale for checking presence instead of type identity here. `npx
  vitest run tests/binder-bypass-envelope.test.ts` → 15 passed (15) at
  HEAD, so this is not a documented correct-reason red (the suite is
  green).
- coverage-matrix/bug-doc citation search: `grep -n "binder-bypass-envelope"
  docs/reference/coverage-matrix.md` → 0 hits. The two docs/bugs/
  citations above pin the file's 15-test count as witness surface, not
  this individual assertion; this finding does not propose to merge,
  rename, or delete the test or change its count — only that one clause of
  its own name is under-verified — so neither citation is affected.
- Coverage-drift check: the claim is not "this behaviour is untested" —
  the test exists, runs, and passes today; the claim is that one clause of
  its own stated name is not what its body checks for. `src/binder/binder-envelope.ts:128-148`
  (`relaxParamsSchema`) was read only to confirm why the gap is currently
  latent (a blanket property spread happens to preserve types today,
  independent of this test) — no claim is made against that production
  code.

## Triage
verdict: confirmed — verified verbatim at tests/binder-bypass-envelope.test.ts:133-155: the name's "types unchanged" clause is checked only by `expect(argProps?.["focus"]).toBeDefined()` (line 154), which passes for any defined value regardless of type, while the file's own "$defs closure" test (line 190) uses `.toEqual` against the exact expected descriptor for the same kind of claim — a mechanically demonstrated misleading-name/cannot-fail D7 defect, not a coverage opinion, with no gate-pin, recording-double, red-suite, or bug-doc-witness carve-out applying (suite is 15/15 green) and no duplicate on the tracked list (triage: claude-opus-5)
