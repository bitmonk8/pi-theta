---
id: PTQ-0679
title: ERR-15 "future tag is assignable" test asserts typeof a string literal, which cannot fail regardless of QueryError's declared type
lens: D7
status: open
verdict: confirmed
locations:
  - tests/queryerror-variants.test.ts:125-132
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# ERR-15 "future tag is assignable" test asserts typeof a string literal, which cannot fail regardless of QueryError's declared type

## Observation
The test declares `const futureKind: QueryError["kind"] = "binder";` and then runs `expect(typeof futureKind).toBe("string")`. The comment states the real claim is a compile-time one — "If `kind` were a closed enum of the nine tags, this assignment would not type-check … The runtime value is irrelevant; the assertion is that this builds." The suite is run via `vitest run` (`package.json`'s `"test"` script), whose `vitest.config.ts` configures no type-checking plugin; TypeScript type errors are caught only by the separate `"typecheck": "tsc -p tsconfig.json --noEmit"` script, which `vitest run` does not invoke.

## Evidence
tests/queryerror-variants.test.ts:125-132:
```ts
  it("ERR-15: `kind` is typed `string` at the type level, so a future tag is assignable", () => {
    // Type-system witness: a hypothetical tenth variant's `kind` string is a
    // valid `QueryError["kind"]`. If `kind` were a closed enum of the nine
    // tags, this assignment would not type-check — its compilation is the open
    // seam. The runtime value is irrelevant; the assertion is that this builds.
    const futureKind: QueryError["kind"] = "binder";
    expect(typeof futureKind).toBe("string");
  });
```

`vitest.config.ts` (repo root), in full:
```ts
import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/live/**"],
    environment: "node",
  },
});
```

`package.json`'s scripts (relevant subset):
```json
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
```

## Why this is a problem
`futureKind` is bound to the string literal `"binder"` on the line immediately above the assertion; `typeof "binder"` is `"string"` unconditionally, independent of what `QueryError["kind"]`'s declared type is, whether the assignment type-checks, or what value is substituted for `"binder"`. No production behaviour, no runtime branch, and no data shape feeds this assertion — it reduces to `expect("string").toBe("string")`. The comment's actual claim — that a closed nine-tag union would make the preceding assignment fail to compile — is a `tsc` type-check outcome, and `vitest run` (the command `npm test` and this suite invoke) transpiles TypeScript without type-checking it and runs no separate `tsc` step; a narrowing of `QueryError["kind"]` to the closed nine-tag union would not turn this `it` red under `npm test`, only under the separate, not-test-suite `npm run typecheck` command. The test therefore cannot fail via any mechanism internal to the test run it lives in.

## Suggested direction (non-binding, optional)
None proposed beyond the observation; if a compile-time witness for this seam is wanted inside the test run, it would need to be enforced by something the test run itself invokes.

## False-positive check
- Gate-pin check: `tests/queryerror-variants.test.ts` does not match `*gate*.test.ts` or any named gate kin; not applicable.
- Recording-double check: no recording double or MUST-NOT-called witness is involved; the cited assertion is a direct `expect(typeof ...)` on a local literal-typed constant.
- docs/bugs/ signature search: `grep -rn "ERR-15\|queryerror-variants" docs/bugs/*.md` — 0 hits; no documented correct-reason-red signature covers this test, and it is not left red (it passes, vacuously, at HEAD).
- coverage-matrix/bug-doc citation search: `grep -n "queryerror-variants" docs/reference/coverage-matrix.md` — 0 hits; this finding proposes no merge, rename, or deletion of the test, only that its runtime assertion is a tautology within the suite that executes it.
- Coverage check: this finding is about an existing assertion's inability to fail inside the test run, not about a missing test path; it takes no position on whether ERR-15's type-level openness deserves a differently-shaped test.
- Verified the vacuity mechanically: `typeof <any string value>` is `"string"` in JavaScript regardless of TypeScript static types, and the file's own comment concedes "the runtime value is irrelevant" — confirming the assertion is decorative around a compile-time claim the test run does not enforce.

## Triage
<!-- appended by triage -->
verdict: confirmed — verified verbatim at tests/queryerror-variants.test.ts:125-132: `futureKind` is bound to the literal `"binder"` one line above `expect(typeof futureKind).toBe("string")`, so the assertion reduces to `"string" === "string"` with no production value, branch, or type feeding it (the test's own comment concedes "the runtime value is irrelevant"); the compile-time claim it stands in for is enforced only by `npm run typecheck` (tsconfig includes tests/; vitest 2.1.9 config has no `test.typecheck` block, so `vitest run` esbuild-strips types and would stay green if `QueryError["kind"]` narrowed to the nine-tag union) — a D7 cannot-fail assertion in tests/, same class as resolved PTQ-0277/0261; suite is 13/13 green, file matches no gate kin, no recording double, coverage-matrix has 0 hits, and the docs/bugs hits I found (the candidate's "0 hits" was inaccurate: 0009/0308, both fixed) cite only the ERR-19 tests in this file, so no documented-red or witness-list carve-out applies; no tracked PTQ covers this file (triage: claude-fable-5-1)
