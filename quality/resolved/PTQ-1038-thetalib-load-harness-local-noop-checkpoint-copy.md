---
id: PTQ-1038
title: thetalib-load-harness.ts declares its own module-private NOOP_CHECKPOINT byte-identical to the canonical SEAM_NOOP_CHECKPOINT two sibling in-scope files already import
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/helpers/thetalib-load-harness.ts:249-253
  - tests/helpers/invoke-seam-scaffold.ts:48-51
  - tests/helpers/subagent-fn-child-regime.ts:33
  - tests/helpers/tool-call-dispatch-harness.ts:52
sites: 1
fix_scope: localized
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# thetalib-load-harness.ts declares its own module-private NOOP_CHECKPOINT byte-identical to the canonical SEAM_NOOP_CHECKPOINT two sibling in-scope files already import

## Observation
`tests/helpers/thetalib-load-harness.ts` declares a module-private `const NOOP_CHECKPOINT: Checkpoint` whose `before()` body is byte-identical to `SEAM_NOOP_CHECKPOINT`, the canonical no-op `Checkpoint` exported from `tests/helpers/invoke-seam-scaffold.ts`. The file imports only the `Checkpoint` type from `../../src/seams/checkpoint` and never imports `invoke-seam-scaffold.ts`. Two OTHER files inside this same review's scope — `tests/helpers/subagent-fn-child-regime.ts` and `tests/helpers/tool-call-dispatch-harness.ts` — already import `SEAM_NOOP_CHECKPOINT` from `invoke-seam-scaffold.ts` instead of declaring their own.

## Evidence

`tests/helpers/thetalib-load-harness.ts:249-253` (re-read immediately before filing):
```ts
/** A no-op `Checkpoint`: `bindImportedBody`'s cells checkpoint nothing observable. */
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

`tests/helpers/invoke-seam-scaffold.ts:48-51` (the canonical export, re-read immediately before filing):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

The `before(): Promise<void> { return Promise.resolve(); }` body is byte-identical between the two declarations; the only difference is the `export` keyword and the identifier name.

`tests/helpers/subagent-fn-child-regime.ts:33` (a sibling in-scope file already importing the canonical export):
```ts
import { SEAM_NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
```

`tests/helpers/tool-call-dispatch-harness.ts:52` (a second sibling in-scope file already importing it, aliased):
```ts
import { SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT } from "./invoke-seam-scaffold";
```

Exact search run: `grep -n "^import" tests/helpers/thetalib-load-harness.ts` returns 12 import lines, none naming `invoke-seam-scaffold`; `grep -n "SEAM_NOOP_CHECKPOINT" tests/helpers/*.ts` returns hits in 6 files (`invoke-seam-scaffold.ts`, `par-for-harness.ts`, `prompt-value-harness.ts`, `runtime-belt-probe-harness.ts`, `subagent-fn-child-regime.ts`, `tool-call-dispatch-harness.ts`) — `thetalib-load-harness.ts` is not among them.

## Why this is a problem
`thetalib-load-harness.ts`'s `NOOP_CHECKPOINT` is consumed at two call sites inside the same file (`checkpoint: NOOP_CHECKPOINT` in `bindImportedBodyOverFs`, per the file's own doc comment) and is itself treated as the reference original in five separate prior findings (PTQ-0347, PTQ-0625, PTQ-0866, PTQ-0875, PTQ-0532) that flag OTHER test files for hand-rolling a copy of it instead of importing `bindImportedBody`. None of those findings notice that this "reference" declaration is itself a retyped copy of an even more canonical fixture that two files in this exact review's scope already import by name. A change to the shared no-op checkpoint shape (e.g. adding a second `Checkpoint` member, or renaming `before`) has three independently-typed copies to keep in step across just the files reviewed here, when two of the three already resolved this by importing the shared export.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_CHECKPOINT` from `./invoke-seam-scaffold` — the same import two sibling files in this review already use — is the shape this file's own neighbours already point toward.

## False-positive check
- Gate-pin check: `thetalib-load-harness.ts` is a `tests/helpers/` module, not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: `NOOP_CHECKPOINT` is an inert stand-in (`before()` always resolves), not a recording double backing a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "NOOP_CHECKPOINT" docs/bugs/*.md` → 0 hits; no documented correct-reason red names either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "thetalib-load-harness" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any test or exported function — only that the local constant could resolve to the existing shared export.
- Prior-finding overlap check: `grep -rln "NOOP_CHECKPOINT" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` found six files (PTQ-0328, PTQ-0347, PTQ-0532, PTQ-0625, PTQ-0866, PTQ-0875, PTQ-1015); all six treat `thetalib-load-harness.ts`'s `NOOP_CHECKPOINT` as the canonical original that OTHER test files fail to import, never as a copy of `SEAM_NOOP_CHECKPOINT` itself — this finding's root cause (the "canonical" helper is itself an unmigrated duplicate) is not covered by any of them.
- Coverage check: the claim is about a duplicated fixture-constant declaration inside one existing, passing helper module; both call sites that use it are live and green at HEAD.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (thetalib-load-harness.ts:249-253 module-private `NOOP_CHECKPOINT`, invoke-seam-scaffold.ts:48-51 exported `SEAM_NOOP_CHECKPOINT`; `before()` bodies byte-identical), the local copy is live (consumed once at :340 `checkpoint: NOOP_CHECKPOINT` — the candidate's "two call sites" counts the declaration, minor overstatement), the file's 12 import lines name neither `invoke-seam-scaffold` nor any `SEAM_*` export, and importing would not cycle (invoke-seam-scaffold.ts does not import thetalib-load-harness.ts); sibling imports at subagent-fn-child-regime.ts:33 and tool-call-dispatch-harness.ts:52 are exactly as quoted; one search drift, immaterial: `SEAM_NOOP_CHECKPOINT` now hits 7 tests/helpers files (typed-query-harness.ts added), not 6; carve-outs as stated (helper module, not a gate; inert stand-in, not a recording double; docs/bugs and coverage-matrix greps → 0); dedupe: PTQ-1005 (fixed) migrated this exact class in the two siblings only and closed without listing this file, PTQ-0886/0955/1010 cover other hosts, and PTQ-0347/0532/0625/0866/0875/1015 all treat this file as the canonical rather than its `NOOP_CHECKPOINT` as a copy — untracked; D7 copy-paste fixture/double with a mechanical one-import fix (triage: claude-fable-5-1)
