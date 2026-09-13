---
id: PTQ-0299
title: b0280's plantWorkspace restates finishWorkspace's tail instead of calling the already-imported export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:6-18
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:180-181
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:188-202
  - tests/helpers/compose-workspace-harness.ts:108-121
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:226-229
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:240-242
sites: 6                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260913183958
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# b0280's plantWorkspace restates finishWorkspace's tail instead of calling the already-imported export

## Observation
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts imports eight
symbols (`allDiagnostics`, `describeNotes`, `errorFilesOf`, `errorRowsAt`,
`normalisePath`, `normativeMessagePattern`, `requireDriven`, `runLoadPass`, plus
the `ComposeWorkspace`/`LoadPass` types) from `tests/helpers/compose-workspace-harness.ts`
in one statement, immediately preceded two lines above its own `plantWorkspace`
by a comment naming that same module by PTQ number, but does not import that
module's `finishWorkspace` export. Its own `plantWorkspace` ends by writing a
minimal `.pi/settings.json` and returning an object literal `{ cwd, path,
dispose }` — a tail that matches `finishWorkspace(cwd)`'s body line for line.
Of the four tests/ files that both declare a `plantWorkspace` function and
import from `tests/helpers/compose-workspace-harness.ts` (b0275, b0280, b0320,
tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts), three
— including b0275, the file b0280's own header says this harness is "modelled
on, and duplicated from rather than shared with" — end `plantWorkspace` with
`return finishWorkspace(cwd);`; only b0280 restates the tail instead.

## Evidence

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:6-18 — the
existing import statement, `finishWorkspace` absent from it:
```ts
import {
  allDiagnostics,
  describeNotes,
  errorFilesOf,
  errorRowsAt,
  normalisePath,
  normativeMessagePattern as normativeMessagePatternCore,
  requireDriven as requireDrivenCore,
  runLoadPass,
  type ComposeWorkspace,
  type LoadPass,
} from "./helpers/compose-workspace-harness";
import { REGISTRY } from "./helpers/registry-oracle";
```

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:180-181 —
the comment immediately preceding `plantWorkspace`, naming the very module that
exports `finishWorkspace`:
```ts
// `ComposeWorkspace` and `normalisePath` are the shared harness in
// `tests/helpers/compose-workspace-harness.ts` (PTQ-0213).
```

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:188-202 —
`plantWorkspace`'s own tail:
```ts
function plantWorkspace(files: Readonly<Record<string, string>>): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0280-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, ".pi", "theta", name), body, "utf8");
  }
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md §Failure
  // modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
```

tests/helpers/compose-workspace-harness.ts:108-121 — the canonical export
solving the identical problem, comment included:
```ts
/**
 * Finish planting a temp compose workspace at `cwd`, once a caller has written
 * its own `.pi/theta/` (and optional `outside/`) fixture files there: write a
 * minimal valid settings file — an ABSENT settings file is silent
 * (package-and-settings.md §Failure modes), so the plant is hermeticity, not
 * noise suppression — and return the `ComposeWorkspace` handle.
 */
export function finishWorkspace(cwd: string): ComposeWorkspace {
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    path: (name: string): string => normalisePath(join(cwd, ".pi", "theta", name)),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:226-229 and
:240-242 — the sibling file's own `plantWorkspace`, calling the canonical
helper for the identical purpose instead of restating it:
```ts
function plantWorkspace(
  files: Readonly<Record<string, PlantedBody>>,
  outside?: Readonly<Record<string, PlantedBody>>,
): ComposeWorkspace {
```
```ts
  }
  return finishWorkspace(cwd);
}
```

Exact search: `grep -rln "^function plantWorkspace" tests --include="*.test.ts"`
→ 15 files repo-wide share the function name; crossed with `grep -l
"compose-workspace-harness"`, exactly 4 of those also import from
`tests/helpers/compose-workspace-harness.ts` (b0275, b0280, b0320-tools-entry-extension-rule-unenforced,
grandchild-callee-drop-un-registers-depth-two-caller). `grep -rl "return
finishWorkspace" tests --include="*.test.ts"` → exactly 3 of those 4 (b0275,
b0320, grandchild-callee-drop); b0280 is the one file importing from the
module whose own `plantWorkspace` does not end that way.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/compose-workspace-harness.ts`
already exports `finishWorkspace(cwd)`, whose entire body (the settings-file
write plus the `{cwd, path, dispose}` return, comment included) b0280's
`plantWorkspace` restates rather than calls — even though b0280 already
imports eight other symbols from that exact module two lines above, and even
though three sibling files that import from the same module (including
b0275, which b0280's own header says this harness is copied from) all call
`finishWorkspace(cwd)` for this identical tail. Two prior D7 fixes tracked in
this file's own surrounding comments (PTQ-0213, cited immediately above
`plantWorkspace`; PTQ-0230, cited immediately above `requireDriven` further
down) already migrated every other piece of this file's host/load-pass
harness to import from that module; `plantWorkspace`'s tail is the one piece
those fixes left as a local reimplementation.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts` already exports `finishWorkspace(cwd)`,
which three sibling files (including b0275, the one this file's own header
names as its model) already call for the identical tail; it is the existing,
already-imported-from module this file's own `plantWorkspace` could call into
instead of restating its body.

## False-positive check
- Gate-pin check: tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts
  does not match `*gate*.test.ts` or the named kin; not applicable, and the
  cited lines are fixture-planting scaffolding, not a pinned count or
  inventory assertion.
- Recording-double check: `plantWorkspace`/`finishWorkspace` build a
  temp-directory handle, not a recording double, and back no "never called"
  witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0280-prompt-mode-declaration-below-immediate-callee-never-read.md
  — Status "fixed (0.276.0)"; docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md
  — Status "fixed (0.274.0)". `npx vitest run
  tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` → 10 passed
  (10) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0280-prompt-mode-declaration-below-immediate-callee"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl
  "b0280-prompt-mode-declaration-below-immediate-callee" docs/bugs/` → only
  its own bug document. This finding proposes no merge, rename or deletion of
  the file or any `it()`/`describe()` — only that one helper's tail could
  call an existing export rather than restate it — so no citation is
  affected.
- Overlap check against already-filed/resolved topics: PTQ-0213 (fixed)
  covers b0275's `makeHost`/`ComposeWorkspace`/`plantWorkspace`-shell
  duplication against tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts,
  and its own remediation is what produced `finishWorkspace` inside
  `tests/helpers/compose-workspace-harness.ts`; PTQ-0230 (fixed) covers the
  eight-function load-pass/diagnostic-reading harness (`runLoadPass`,
  `errorRowsAt`, etc.) recurring across b0275/b0280/others. Neither finding's
  Evidence or `locations` cites `plantWorkspace`'s settings-file-and-return
  tail as a residual in b0280. `git show c85b0239` and `git show f0333c15`
  (the two commits that fixed PTQ-0230/PTQ-0237 in this exact file) show
  `plantWorkspace`'s body carried through byte-unchanged while everything
  around it (the old local `makeHost`, `ComposeWorkspace`, `LoadPass`,
  two-page `REGISTRY`) was deleted in favour of the shared imports — this is
  that untouched residual, not a re-statement of either fixed finding.
- Coverage check: the claim is about a repeated function-body DEFINITION, not
  a missing test path; `plantWorkspace` is exercised by every test in its own
  file (5/5 passing, confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt, line range and search count reproduces exactly (15 files declare `plantWorkspace`, 4 also import `compose-workspace-harness`, only 3 of those 4 end with `return finishWorkspace(cwd)`, b0280 is the sole holdout), b0280's tail is byte-identical to the `finishWorkspace(cwd)` it already imports seven sibling symbols from, git shows both migration commits (c85b0239, f0333c15) replaced everything else around it with imports while leaving this exact body untouched, tests pass 10/10 at HEAD, and neither resolved PTQ-0213/PTQ-0230/PTQ-0237 nor coverage-matrix.md cites this residual. (triage: claude-opus-5)
