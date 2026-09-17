---
id: PTQ-0396
title: b0462-package-identity-dedup and b0462-package-merge-priority-adjudication each redeclare the same promptTheta/plant-package-theta fixture builders
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0462-package-identity-dedup.test.ts:44-65
  - tests/b0462-package-merge-priority-adjudication.test.ts:45-66
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917045205
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0462-package-identity-dedup and b0462-package-merge-priority-adjudication each redeclare the same promptTheta/plant-package-theta fixture builders

## Observation
tests/b0462-package-identity-dedup.test.ts and
tests/b0462-package-merge-priority-adjudication.test.ts each declare, module
scope, a `promptTheta(description, body)` fixture-string builder and a
plant-a-package-theta-on-disk helper (`plantPackageThetaAt` and
`plantPackageTheta` respectively). `promptTheta`'s bodies are byte-identical
in both files. The plant helpers perform the identical three-write sequence
(`mkdirSync` the package's `theta/` directory, `writeFileSync` its
`package.json`, `writeFileSync` its `<stem>.theta`), differing only in that
`plantPackageThetaAt` takes the package's parent root as an explicit
parameter — needed because that file plants the same package under both a
`node_modules` root and a `.pi/agent/npm` root — where `plantPackageTheta`
hardcodes the `node_modules` segment internally. Both files already import
`mintWorkspace`/`makeHarness`/`byCode`/`byFragment` from the sibling
tests/helpers/package-merge-e2e-harness.ts in the lines immediately
preceding these declarations.

## Evidence
tests/b0462-package-identity-dedup.test.ts:44-65:
```ts
function promptTheta(description: string, body: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", `@\`${body}\``, ""].join(
    "\n",
  );
}

/** Write a package's `package.json` + one theta under `<root>/<pkg>/theta/`. */
function plantPackageThetaAt(
  packageRoot: string,
  pkg: string,
  stem: string,
  contents: string,
): void {
  const dir = join(packageRoot, pkg, "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(packageRoot, pkg, "package.json"),
    JSON.stringify({ name: pkg, version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(join(dir, `${stem}.theta`), contents, "utf8");
}
```

tests/b0462-package-merge-priority-adjudication.test.ts:45-66 — `promptTheta`
byte-identical; the plant helper differing only in the hardcoded
`"node_modules"` segment and the corresponding single-parameter signature:
```ts
function promptTheta(description: string, body: string): string {
  return ["---", "mode: prompt", `description: ${description}`, "---", `@\`${body}\``, ""].join(
    "\n",
  );
}

/** Write a package's `package.json` + one theta under `<workspace>/node_modules/<pkg>/theta/`. */
function plantPackageTheta(
  workspace: string,
  pkg: string,
  stem: string,
  contents: string,
): void {
  const dir = join(workspace, "node_modules", pkg, "theta");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(workspace, "node_modules", pkg, "package.json"),
    JSON.stringify({ name: pkg, version: "1.0.0" }),
    "utf8",
  );
  writeFileSync(join(dir, `${stem}.theta`), contents, "utf8");
}
```

Diff (re-run immediately before filing): the two `promptTheta` bodies (44-48
and 45-49) are byte-identical. The two plant helpers' `mkdirSync`/
`writeFileSync` sequence is identical line-for-line; calling
`plantPackageThetaAt(join(workspace, "node_modules"), pkg, stem, contents)`
reproduces `plantPackageTheta(workspace, pkg, stem, contents)`'s effect
exactly — the merge-priority file's version is the identity-dedup file's
version with the root argument's value inlined rather than passed in.

Exact search: `grep -rn "^function promptTheta(description: string, body: string): string {"
tests --include="*.test.ts"` → exactly 2 hits, the two files above; no
tests/helpers/ module exports a `promptTheta` or `plantPackageTheta`/
`plantPackageThetaAt`-shaped fixture builder (`ls tests/helpers/` lists
`package-merge-e2e-harness.ts`, whose own exports are `CapturedNote`,
`Harness`, `makeHarness`, `byCode`, `byFragment`, `PackageMergeWorkspace`,
`mintWorkspace` — none of them a theta-fixture-string or package-planting
helper).

## Why this is a problem
This is the "Boilerplate duplication" class. `promptTheta` is reproduced with
zero deviation across the two files; the plant helper is reproduced with one
parameterisation difference, one file's version being a strict
generalisation of the other's. Both files are already positioned to share
these — they import four other symbols from the same sibling helper module
(tests/helpers/package-merge-e2e-harness.ts, itself created to centralise
this exact pair's `CapturedNote`/`Harness`/`makeHarness`/env-redirection
scaffolding per PTQ-0258, resolved) in the lines immediately preceding these
declarations — yet each file's own fixture-construction helpers are authored
as separate, independent declarations rather than added to that same shared
module.

## Suggested direction (non-binding, optional)
tests/helpers/package-merge-e2e-harness.ts already centralises this pair's
shared e2e double and env-redirection scaffolding (PTQ-0258); a
`promptTheta`/plant-package-theta pair sits naturally beside that existing
consolidation, since the more general `plantPackageThetaAt` shape already
covers both files' need.

## False-positive check
- Gate-pin check: neither tests/b0462-package-identity-dedup.test.ts nor
  tests/b0462-package-merge-priority-adjudication.test.ts matches
  `*gate*.test.ts` or the named kin.
- Recording-double check: `promptTheta`/`plantPackageTheta` write fixture
  content to disk; they record no calls and back no "never called" witness
  in either file, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0462-package-merge-bypasses-priority-adjudication.md
  — Status fixed (0.447.0). `npx vitest run tests/b0462-package-identity-dedup.test.ts
  tests/b0462-package-merge-priority-adjudication.test.ts` → 2 files, 5 tests
  passing at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0462-package-identity-dedup\|b0462-package-merge-priority-adjudication"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for either filename
  across docs/bugs/*.md (excluding their own shared bug document) → 0 hits.
  This finding proposes no merge, rename, or deletion of any file or
  `it()`/`describe()` — only that the two fixture-builder helpers could be
  shared rather than redeclared.
- Coverage check: the claim is about repeated helper DEFINITIONS, not a
  missing test path; each copy is exercised by its own file's tests (5/5
  passing, confirmed above).
- Prior-finding overlap check: PTQ-0258 (resolved) already covers the
  `CapturedNote`/`Harness`/`makeHarness` triple and env-redirection pair
  these same two files (plus b0458 and b0463) shared, explicitly scoping
  itself to that harness/return-shape code; it does not cite `promptTheta`
  or `plantPackageTheta`/`plantPackageThetaAt`, so this is a distinct,
  unremediated root cause in the same file pair rather than a re-filing.

## Triage
verdict: confirmed — independently re-verified: excerpts match verbatim at the cited lines, both promptTheta bodies are byte-identical, and the plant helpers' mkdirSync/writeFileSync sequences match line-for-line (plantPackageThetaAt is in fact called with both a node_modules and a .pi/agent/npm root at lines 83-96, confirming the stated generalisation); the cited grep reproduces exactly 2 hits, no tests/helpers/ module exports either helper, docs/bugs/0462 is Status fixed (0.447.0) with 5/5 tests passing at HEAD, coverage-matrix.md and docs/bugs/*.md cite neither filename, and resolved PTQ-0258 is scoped only to the disjoint CapturedNote/Harness/makeHarness/env-redirection symbol set — this is a distinct, unfiled boilerplate-duplication root cause (triage: claude-opus-5)
