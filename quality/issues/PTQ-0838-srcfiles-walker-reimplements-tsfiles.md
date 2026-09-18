---
id: PTQ-0838
title: ternary-common-type-trigger-adjudication.test.ts redeclares a recursive src/ .ts-file walker that duplicates tests/helpers/ts-files.ts's tsFiles
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/ternary-common-type-trigger-adjudication.test.ts:643-662
  - tests/helpers/ts-files.ts:19-30
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# ternary-common-type-trigger-adjudication.test.ts redeclares a recursive src/ .ts-file walker that duplicates tests/helpers/ts-files.ts's tsFiles

## Observation
`tests/ternary-common-type-trigger-adjudication.test.ts` declares a
module-local `srcFiles()` that recursively walks `src/` collecting every
`.ts` file via `readdirSync`/`statSync`, used by its group-(C) structural
pins (`C1`, `C2`) to grep every source file for `checkCommonType` /
`checkArrayLiteral` references. `tests/helpers/ts-files.ts` already exports
`tsFiles(dir)`, which performs the same recursive real-filesystem `.ts`-file
enumeration, built (per its own header) after three other test files each
independently declared this exact walker shape for their own architectural
scans.

## Evidence
`tests/ternary-common-type-trigger-adjudication.test.ts:643-662` (re-read
immediately before filing):
```ts
/** Every `.ts` file under `src/`, recursively. */
function srcFiles(): string[] {
  // Slash-normalised so the `src/`-relative rendering below is identical on
  // POSIX and Windows hosts.
  const root = fileURLToPath(new URL("../src", import.meta.url)).replace(/\\/g, "/");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk(root);
  if (out.length === 0) {
    throw new Error(
      "harness: no `.ts` files found under `src/` — this cell reads the shipped source as its oracle, so an empty scan is a harness failure, never a skip",
    );
  }
  return out;
}
```

`tests/helpers/ts-files.ts:19-30` — the canonical walker already built for
this exact shape of redeclaration:
```ts
export function tsFiles(dir: string): string[] {
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

Both functions perform the identical recursive real-filesystem `.ts`-file
enumeration under a directory; they differ only in how the root is located
(`fileURLToPath(new URL("../src", import.meta.url))` vs a caller-supplied
`dir`), path separator handling (a manual `.replace(/\\/g, "/")` at the root
plus template-string joins vs `path.join`), the empty-result guard (the
local copy throws by name; the helper does not), and `.test.ts` exclusion
(the helper excludes test files by name; `src/` contains none, so both
enumerate the same set on this tree today).

Exact search: `grep -rln "function srcFiles" tests/*.test.ts` → this file is
the only in-scope hit for this shape; `grep -n "ts-files" tests/ternary-common-type-trigger-adjudication.test.ts` → 0 hits (the file never imports the helper).

## Why this is a problem
`tests/helpers/ts-files.ts`'s own header states the shared reason it exists:
several files "each independently declared the same `tsFiles(dir)` function
to walk the real `src/**` tree for a different architectural invariant …
This module centralises that one shared declaration." This file is a further
occurrence of the same near-verbatim redeclaration, for a fifth
architectural invariant (`checkCommonType`'s call-site fidelity), rather than
importing the helper and keeping only its own regex-based call-site logic
local.

## Suggested direction (non-binding, optional)
`tests/helpers/ts-files.ts` (`tsFiles`) is the natural shared home this
file's `srcFiles()` already duplicates; the member-name-regex call-site scan
built on top of the file list is this file's own genuinely local piece.

## False-positive check
- Gate-pin check: the file is not named `*gate*.test.ts` and is not one of
  the named gate kin; group (C) describes itself as a structural pin, but the
  carve-out is restricted to named gate-shaped files, and this finding
  targets only the directory-walk helper, not the pinned call-site count.
- Recording-double check: not applicable — `srcFiles()` is a real-filesystem
  reader, not a fake, double, or recording witness.
- docs/bugs/ signature search: `grep -rl "srcFiles\|tsFiles" docs/bugs/` →
  0 hits; no documented correct-reason red cites either walker.
- coverage-matrix/bug-doc citation search: `grep -n "ternary-common-type-trigger-adjudication" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "ternary-common-type-trigger-adjudication" docs/bugs/` → docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md, which names this file as bug 0155's regression-test witness by section letter, not by its internal `srcFiles` helper. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` cited there.
- Prior-filing overlap check: `grep -rl "srcFiles" quality/issues/*.md quality/intake/*.md` → quality/issues/PTQ-0746-for-empty-array-srcfiles-duplicated.md, whose own triage note explicitly flags this file's `srcFiles()` (line 668 in that triage's numbering, 643 at current HEAD) as "a fifth, differently-bodied `srcFiles()` not filed anywhere," inviting a separate filing rather than folding it silently; PTQ-0746 itself cites a different file (`tests/for-empty-array-iterand-adjudication.test.ts`) as its own site, so this is not a re-file of that finding.
- Coverage check: the claim is about a repeated helper DEFINITION already exercised by the file's own C1/C2 assertions; no coverage/untested-path claim is made.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: `srcFiles()` at tests/ternary-common-type-trigger-adjudication.test.ts:643-662 and `tsFiles` at tests/helpers/ts-files.ts:19-30 match the excerpts verbatim and both recursively enumerate `.ts` files under `src/` via readdirSync/statSync (find src -name '*.test.ts' = 0, so the helper's exclusion is a no-op and both return the same set modulo path format/throw guard); the file never imports helpers/ts-files (grep → 0; only the three PTQ-0265 files do), git shows the test (8cf9ea7d 2026-08-22) predates the helper (ec2d7eaf 2026-09-12) so it was never migrated; the copy is live (called at :674 and :704, file runs 23/23 green); both locations under tests/, D7 boilerplate-duplication class; not a gate-kin, coverage-matrix → 0, docs/bugs cite the file (0144/0155/0158) by cell letter with 0 hits for `srcFiles`, and no merge/rename/delete is proposed; the filing's "only in-scope hit" claim for `function srcFiles` is wrong (2 hits — the other is PTQ-0746's for-empty-array file) but immaterial; not a duplicate — PTQ-0265 (resolved) and PTQ-0746 (open) each cite different files and PTQ-0746's triage explicitly recorded this site as "not filed anywhere", consistent with the store's per-file tracking of not-migrated helpers (the fixer may still fold it into PTQ-0746's pass; note the local copy slash-normalises for its `lastIndexOf("/src/")` rendering, so migration needs that normalisation kept local) (triage: claude-fable-5-1)
