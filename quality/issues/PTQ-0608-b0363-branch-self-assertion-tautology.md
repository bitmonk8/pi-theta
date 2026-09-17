---
id: PTQ-0608
title: Six `expect(caseInsensitive).toBe(true/false)` calls inside the branch their own value selected can never fail
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:132-133
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:150-151
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:178-179
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:197-198
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:226-227
  - tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:239-240
sites: 6
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Six `expect(caseInsensitive).toBe(true/false)` calls inside the branch their own value selected can never fail

## Observation
`filesystemIsCaseInsensitive(dir: string): boolean` (tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:89-103) has exactly two return paths: a literal `return true;` in the try-success arm and a literal `return false;` in the caught-ENOENT arm (any other error rethrows). Each of the file's three test bodies stores this call's result in `const caseInsensitive` and immediately branches on it: `if (caseInsensitive) { expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true); ... } else { expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false); ... }`. Six such `expect` calls exist (three `if`-arm, three `else`-arm), one pair per test body.

## Evidence

tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:129-133 (re-read immediately before filing):
```ts
    const caseInsensitive = filesystemIsCaseInsensitive(scratchDir);

    if (caseInsensitive) {
      expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true);
      // RED pre-fix: the lowercase reference resolves to on-disk `Plan.theta`
```

tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:148-151:
```ts
      expect(basename(posix(invalid[0]!.file!))).toBe("Plan.theta");
      expect(invalid[0]!.severity).toBe("error");
    } else {
      expect(caseInsensitive, "case-sensitive filesystem branch").toBe(false);
```

The remaining four sites (176-179, 195-198, 224-227, 237-240) are the identical `if (caseInsensitive) { expect(caseInsensitive, ...).toBe(true); ... } else { expect(caseInsensitive, ...).toBe(false); ... }` shape, one pair per test body, confirmed by direct read at each cited line range.

`filesystemIsCaseInsensitive`'s two-armed return, tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts:89-103:
```ts
function filesystemIsCaseInsensitive(dir: string): boolean {
  const lower = join(dir, "b0363-case-probe-aa");
  writeFileSync(lower, "x", "utf8");
  try {
    readFileSync(join(dir, "b0363-case-probe-AA"), "utf8");
    return true;
  } catch (probeError: unknown) {
    const code = (probeError as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw probeError;
    }
    return false;
  } finally {
    rmSync(lower, { force: true });
  }
}
```

## Why this is a problem
The function's return type is `boolean` and its only two return statements are the literals `true` and `false` (any other outcome throws, escaping the caller entirely rather than reaching either `expect`). Once `const caseInsensitive = filesystemIsCaseInsensitive(...)` has been assigned, `if (caseInsensitive)` can only be true when `caseInsensitive === true`, and `if`'s `else` can only run when `caseInsensitive === false`. `expect(caseInsensitive, "case-insensitive filesystem branch").toBe(true)` inside the `if`-arm is therefore re-asserting the exact condition that selected that arm — there is no code path that reaches that line with `caseInsensitive` unequal to `true`, and symmetrically for `.toBe(false)` in the `else`-arm. Each of the six `expect` calls asserts a value already fixed by the control flow that guards it; none can observe a different value than the one it asserts.

## Suggested direction (non-binding, optional)
The `"case-insensitive filesystem branch"` / `"case-sensitive filesystem branch"` strings function as narration labelling which fork the run took; that labelling purpose does not require a separate `expect` call on the same value the `if` already tested.

## False-positive check
- Gate-pin: this file is not `*gate*.test.ts` or a named kin; the cited calls are branch-labelling assertions, not a pinned count or inventory.
- Recording-double: `caseInsensitive` is a plain local boolean from a real filesystem probe, not a recording double; the six sites assert on the branch's own selector value, not on whether some double was ever/never called — the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0363-file-entry-stem-judged-on-entry-spelling.md is `Status: fixed (0.355.0)`; `npx vitest run tests/b0363-file-entry-stem-judged-on-entry-spelling.test.ts` → 4 passed (4) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0363-file-entry-stem-judged-on-entry-spelling" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any `it()`/`describe()` — only that six specific `expect` calls assert nothing beyond the branch that already guards them — so no citation is affected.
- Coverage check: the claim is about six assertions that cannot fail given the guarding control flow, not about a missing test path; the surrounding assertions in each branch (on `thetas`, `diagnostics`, message text) are real observables on the system under test and are unaffected by this finding.

## Triage
verdict: confirmed — all six sites verified byte-exact at 132/150/178/197/226/239 and filesystemIsCaseInsensitive (89-103) returns only the literals true/false or throws, so inside each arm of `if (caseInsensitive) … else …` the unreassigned const is already fixed to the value the `expect(...).toBe(true|false)` asserts — D7 "assertion that cannot fail", identical shape to resolved PTQ-0243 whose fix removed the b0329 pair (only the guard remains at b0329:344/346) while explicitly declining to file against these b0363 copies ("no claim is filed against them"), so this is a new root-cause instance not a duplicate (sibling intake d7-61 is probe-copy duplication, a different root cause); re-ran the carve-out checks — not a gate test, asserts read a local const not a recording double, bug 0363 is `Status: fixed (0.355.0)` with 4/4 green at HEAD, 0 coverage-matrix hits, the sole docs/bugs mention (0329:163) describes b0329 not this file, and no it()/describe() rename or deletion is proposed (triage: claude-fable-5-1)
