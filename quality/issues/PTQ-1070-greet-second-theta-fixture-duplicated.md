---
id: PTQ-1070
title: watcher-hot-reload-integration.test.ts's GREET_THETA/SECOND_THETA fixture strings are redeclared byte-identical in four sibling watcher test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/watcher-hot-reload-integration.test.ts:42-43
sites: 1
fix_scope: module
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# watcher-hot-reload-integration.test.ts's GREET_THETA/SECOND_THETA fixture strings are redeclared byte-identical in four sibling watcher test files

## Observation
`tests/watcher-hot-reload-integration.test.ts` declares two module-scope
constants, `GREET_THETA` and `SECOND_THETA`, each a one-line `.theta` source
text built via `["---", "mode: prompt", "---", "@\`hi\`"/"@\`yo\`", ""].join("\n")`.
The exact search `grep -rl 'GREET_THETA = \["---", "mode: prompt", "---", "@\`hi\`", ""\].join'
tests/*.test.ts` returns 5 files; this file's `GREET_THETA` declaration is
byte-identical to the other 4, and its `SECOND_THETA` declaration is
byte-identical to 3 of the other 4 (the fourth substitutes a different tail
literal for its own `SECOND_THETA`, which is not part of this claim). No
`tests/helpers/` module exports either constant.

## Evidence

`tests/watcher-hot-reload-integration.test.ts:42-43` (re-read immediately
before filing):
```ts
const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`yo`", ""].join("\n");
```

`tests/b0311-structural-note-derived-from-paths.test.ts:48-49` — byte-identical:
```ts
const GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join("\n");
const SECOND_THETA = ["---", "mode: prompt", "---", "@`yo`", ""].join("\n");
```

Exact search and hit count: `grep -rl 'GREET_THETA = \["---", "mode: prompt", "---", "@\`hi\`", ""\].join' tests/*.test.ts`
→ 5 files: `tests/b0311-structural-note-derived-from-paths.test.ts`,
`tests/double-session-start-supersession.test.ts`,
`tests/hot-reload-stale-ctx-replacement.test.ts`,
`tests/rebind-self-collision-reownership.test.ts`, and
`tests/watcher-hot-reload-integration.test.ts` (this review's scope). Direct
read of each file's `GREET_THETA`/`SECOND_THETA` pair confirms:
`b0311-structural-note-derived-from-paths.test.ts:48-49`,
`hot-reload-stale-ctx-replacement.test.ts:107-108`, and
`rebind-self-collision-reownership.test.ts:122-123` are byte-identical to
this file's pair on both lines; `double-session-start-supersession.test.ts:78-79`
matches on `GREET_THETA` only (its own `SECOND_THETA` reuses the `"@\`hi\`"`
tail rather than `"@\`yo\`"`). Only this file's own site is cited as a filed
location; the other 4 are named to size the pattern.

## Why this is a problem
`tests/helpers/watch-arming-harness.ts` — a module this file already imports
`makeRecordingHarness`/`RecordingHarness` from — exports `makeTheta`, a
fixture builder for a different in-memory shape (`ParsedTheta`), showing the
module already carries theta-fixture helpers for this exact watcher-test
family; it does not, however, export a raw `.theta` SOURCE TEXT builder or
constant, so each of the 5 files re-derives the identical two-line
frontmatter-plus-query source independently. A change to the minimal
`mode: prompt` fixture shape these watcher tests all plant (e.g. adding a
required frontmatter field) would need the identical two-constant edit
applied by hand across the 4 other files sharing this exact text, with
nothing in any of them signalling the other copies.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts`, already imported by this file for
`makeRecordingHarness`, is a plausible home for a shared `GREET_THETA`/
`SECOND_THETA` (or a small parametrised one-line-theta builder), since the
byte-identical copies this search found already point at fixture text that
does not vary by file.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named
  gate-kin patterns; the cited lines are a fixture-string declaration, not a
  pinned count or inventory assertion.
- Recording-double check: `GREET_THETA`/`SECOND_THETA` are inert source-text
  constants, not recording doubles and not a "never called" MUST-NOT
  witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "GREET_THETA\|SECOND_THETA" docs/bugs/*.md` → 0 hits; no documented correct-reason red names either constant.
- coverage-matrix/bug-doc citation search: `grep -n "watcher-hot-reload-integration" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test, `it()`, or `describe()` — only that the duplicated fixture-string pair could be shared from the module this file already imports from.
- Coverage check: the claim is about a repeated fixture-constant DEFINITION inside an already-passing test file; every cell in the file already plants and exercises both constants.
- Prior-filing overlap check: `grep -rl "GREET_THETA" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` (run before filing) returned 0 hits — no existing or prior-wave finding names either constant.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -rl 'GREET_THETA = ["---", "mode: prompt", "---", "@`hi`", ""].join' tests/` returns exactly the 5 named files and the `const GREET_THETA`/`const SECOND_THETA` pairs sit at the cited lines (watcher-hot-reload-integration:42-43, b0311:48-49, hot-reload-stale-ctx:107-108, rebind-self-collision:122-123 byte-identical on both lines; double-session-start:78-79 identical on GREET only, its SECOND reuses "@`hi`" as the candidate states), every copy is live (2-4 `writeFileSync` planting uses per file; 1+5 in the filed file), tests/helpers/ exports no such constant (watch-arming-harness.ts:192 `makeTheta` builds a ParsedTheta, not source text; the only exported source-text fixtures are GOOD_THETA/BAD_THETA/THETA_BODY/TWO_PARAM_THETA with different bodies), the file is not a gate suite, docs/bugs 0021/0310/0311/0470/0471 cite it only as a harness/witness and no merge/rename/delete is proposed, and no PTQ row names GREET_THETA/SECOND_THETA (PTQ-0491/0530/0715/0928 cover watcher harness/clock/boot code, PTQ-0606/0782 cover `theta()` builders in unrelated files) — a copy-paste fixture whose fix is a mechanical hoist into the already-imported watch-arming-harness (triage: claude-fable-5-1)
