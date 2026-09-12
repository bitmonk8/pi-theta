---
id: PTQ-0265
title: The tsFiles() recursive src/**-tree .ts-file walker is redefined byte-for-byte across three test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/clock-id-seams.test.ts:47-58
  - tests/cross-cutting-gates.test.ts:209-220
  - tests/di-seam-skeleton.test.ts:229-240
sites: 3
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# The tsFiles() recursive src/**-tree .ts-file walker is redefined byte-for-byte across three test files

## Observation
`tests/clock-id-seams.test.ts`, `tests/cross-cutting-gates.test.ts`, and
`tests/di-seam-skeleton.test.ts` each declare a private `tsFiles(dir: string):
string[]` function that recursively lists every non-test `.ts` file under a
directory, then use it to walk the real `src/**` tree in a "holds over the
real production tree" test for a different architectural invariant (V8d-T's
ambient-timing/crypto ban, H2a's module-level-mutable-binding ban, and H3a's
ambient-primitive ban, respectively). The function body is byte-for-byte
identical in all three files — only the surrounding indentation differs,
since two of the three nest it one level inside a `describe` block — and each
is paired with an identically duplicated `const srcRoot =
fileURLToPath(new URL("../src", import.meta.url));` line immediately above it.

## Evidence
`tests/clock-id-seams.test.ts:47-58`:
```ts
function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}
```

`tests/cross-cutting-gates.test.ts:209-220`:
```ts
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...tsFiles(full));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        out.push(full);
      }
    }
    return out;
  }
```

`tests/di-seam-skeleton.test.ts:229-240` — the same body again:
```ts
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...tsFiles(full));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        out.push(full);
      }
    }
    return out;
  }
```

Exact search: `grep -rn 'entry.endsWith(".ts") && !entry.endsWith(".test.ts")' tests/*.test.ts`
returns exactly 3 hits — `clock-id-seams.test.ts:53`, `cross-cutting-gates.test.ts:215`,
`di-seam-skeleton.test.ts:235` — one per file, each the sole occurrence of
this guard, inside its own `tsFiles`. A second, matching search — `grep -rn
'fileURLToPath(new URL("\.\./src"' tests/*.test.ts` — returns the same three
files (plus one unrelated file, `ternary-common-type-trigger-adjudication.test.ts`,
using a differently-named, differently-bodied walker for an unrelated check).

## Why this is a problem
Three independent test files, each proving a different architectural
invariant over the shipped `src/**` tree, each pay for their own
from-scratch reimplementation of "recursively list every non-test `.ts` file
under a directory" rather than sharing one definition. `tests/helpers/`
already holds several modules built for exactly this class of repeated
plumbing (e.g. `tests/helpers/theta-corpus.ts` centralises an analogous
"discover files under a root, fail loud if empty" step for the
`.theta`/`.thetalib` corpus walk), but no module there exports a `src/**`
`.ts`-file lister, so each of these three gate files re-derives the identical
block in place. None of the three files carries a comment acknowledging
either of the other two as its source or as a sibling copy.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting a "list every non-test `.ts` file under a
directory" walker is the natural home this duplicated function already
gravitated toward independently three times; each file's own choice of what
invariant to scan the returned list for would stay local.

## False-positive check
- Gate-pin check: `tests/cross-cutting-gates.test.ts` is named among the
  brief's carve-out "kin" (`cross-cutting-gates`) and its filename matches
  `*gate*.test.ts`; the carve-out shields PINNED-COUNT/inventory assertions
  ("the test asserted a value it fixed itself") from being filed as such — it
  does not immunise a gate file against an unrelated D7 claim about a helper
  FUNCTION redefined verbatim across files. This finding makes no claim about
  any pinned count or inventory in any of the three files; it is scoped
  entirely to the `tsFiles` walker's repeated definition. Neither
  `tests/clock-id-seams.test.ts` nor `tests/di-seam-skeleton.test.ts` matches
  `*gate*.test.ts` or any named kin.
- Recording-double check: not applicable — `tsFiles` reads the real
  filesystem via `readdirSync`/`statSync`; it is not a fake, double, or
  MUST-NOT witness.
- docs/bugs/ signature search: `grep -rln "tsFiles\|ambient-primitive" docs/bugs/`
  returns no files; no open bug document names this duplication or gives a
  documented-correct-reason rationale for keeping the three copies separate.
- coverage-matrix/bug-doc citation search: `grep -n "clock-id-seams.test.ts\|cross-cutting-gates.test.ts\|di-seam-skeleton.test.ts" docs/reference/coverage-matrix.md`
  returns no hits. `docs/bugs/0107-tools-lockstep-witness-is-source-shape-gate.md:172`
  cites `tests/di-seam-skeleton.test.ts:225–247` (a range spanning this
  finding's cited block) as an analogy example for a "source-shape scan is a
  direct measurement" argument, and `docs/bugs/0216-shutdown-reason-classification-unwired.md:429`
  cites `tests/cross-cutting-gates.test.ts:59` (an unrelated `allow-broad-catch`
  fixture string, outside the cited range). Neither citation discusses, pins,
  or depends on the `tsFiles` walker's implementation being locally defined;
  both concern the PROPERTY each test measures (a scan over real `src/**`),
  which this finding leaves untouched. This finding proposes no merge,
  rename, or deletion of any test.
- Coverage check: all three files currently pass in full (`npx vitest run
  tests/clock-id-seams.test.ts tests/cross-cutting-gates.test.ts
  tests/di-seam-skeleton.test.ts` → 3 files, 42 tests passed); the claim is
  entirely about a repeated harness definition, not a missing or wrong test.

## Triage
verdict: confirmed — re-verified independently: tsFiles()/srcRoot bodies are byte-for-byte identical at all three cited ranges, the exact-guard grep and the fileURLToPath("../src") grep both reproduce as claimed (3 hits + 1 unrelated differently-shaped walker), no tests/helpers/ module exports this walker, no docs/bugs/ or coverage-matrix.md citation pins the local definition (the two bug-doc hits found cite the scanned property, not the helper's implementation), the gate carve-out doesn't apply (claim isn't about a pinned count/inventory), and all 42 tests across the three files still pass — a mechanically-anchored D7 boilerplate-duplication finding, not a duplicate of any listed issue (triage: claude-opus-5)
