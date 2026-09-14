---
id: PTQ-0344
title: b0347 hand-rolls the SEAM_NOOP_CHECKPOINT/SINK/MUTATOR + span() + RecordedHop scaffold that tests/helpers/invoke-seam-scaffold.ts already exports and its in-scope sibling b0349 already imports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:320-341
  - tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:362-366
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0347 hand-rolls the SEAM_NOOP_CHECKPOINT/SINK/MUTATOR + span() + RecordedHop scaffold that tests/helpers/invoke-seam-scaffold.ts already exports and its in-scope sibling b0349 already imports

## Observation
tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts declares, module scope, a `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` no-op triple, a `span()` helper, and a `RecordedHop` interface. tests/helpers/invoke-seam-scaffold.ts already exports all five names under identical identifiers and identical (or field-for-field equivalent) bodies. tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts — reviewed in this same wave — already imports all five from that module instead of redeclaring them; b0347 imports none of them and instead retypes the whole bundle locally.

## Evidence

tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:320-329 (re-read immediately before filing):
```ts
const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};


const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};
```

tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:331-341 (re-read immediately before filing):
```ts
const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};


function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:362-366 (re-read immediately before filing):
```ts
interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}
```

tests/helpers/invoke-seam-scaffold.ts:31-56 (the canonical export, re-read immediately before filing) — confirmed byte-identical to the three b0347 excerpts above apart from the `export` keyword and doc comments:
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

/** A `ToolLoweringSink` that discards every diagnostic/system-note. */
export const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

/** A `CommittedConversationMutator` whose every method is a no-op. */
export const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

/** A throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site that carries no
 *  real source position. */
export function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```
`tests/helpers/invoke-seam-scaffold.ts:60-64`'s `RecordedHop` export carries the identical three fields (`wrapper`, `calleePath`, `callSite`) as b0347's local copy above, differing only in its doc comment's wording.

tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:116-122 (re-read immediately before filing) — b0347's in-scope sibling already importing the same bundle instead of redeclaring it:
```ts
import {
  SEAM_NOOP_CHECKPOINT,
  SEAM_NOOP_SINK,
  SEAM_NOOP_MUTATOR,
  span,
  type RecordedHop,
} from "./helpers/invoke-seam-scaffold";
```

Exact searches: `grep -rn "SEAM_NOOP_CHECKPOINT" tests --include="*.test.ts"` finds it locally declared (not imported) only in tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts and tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts (b0294 is outside this wave's seven-file scope); `grep -rln "from \"./helpers/invoke-seam-scaffold\"" tests --include="*.test.ts"` finds exactly tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts and tests/b0295-child-internal-cancel-wrap-arm.test.ts (b0295 likewise outside this wave's scope) already importing it.

## Why this is a problem
tests/helpers/invoke-seam-scaffold.ts's own header states it exists precisely because this five-piece no-op scaffold "is byte-for-byte identical across several `executeBody`-driving invoke/code-call bug-witness files (bug 0294, bug 0295, bug 0347, bug 0349)" and centralises it so "a file that needs them can import rather than retype them." b0347 is one of the four files that module's own header names as a source of the duplication it was built to end, and its sibling b0349 (reviewed in this same wave) already imports the identical bundle from that module. b0347 still carries its own byte-for-byte (or field-for-field identical) copy of all five names, unmigrated.

## Suggested direction (non-binding, optional)
tests/helpers/invoke-seam-scaffold.ts already exports this exact five-piece bundle under the identical names, and b0347's own in-scope sibling b0349 already imports it in place of a local declaration — the home b0347's own unmigrated copy already has a working precedent to follow.

## False-positive check
- Gate-pin check: tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are no-op harness scaffolding, not a pinned count or inventory assertion.
- Recording-double check: `RecordedHop`-typed hop lists back genuine MUST-NOT/count witnesses inside b0347's own test bodies (e.g. `hops.length` assertions in its (G) describe blocks), but this finding does not claim any such assertion cannot fail — it claims the no-op scaffold's and interface's own DEFINITIONS are copy-pasted rather than imported, a distinct claim the negative-witness carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0347-subagent-leg-propagated-mintable-invoke-infra-stays-bare.md Status "fixed (0.347.0)". `npx vitest run tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts` → 32 passed (32) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0347-subagent-leg-propagated-mintable-wrapped-unit" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0347-subagent-leg-propagated-mintable-wrapped-unit" docs/bugs/*.md` → only its own bug document. This finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` — only that the five harness pieces could be imported rather than redeclared — so no citation is affected.
- Scope note: tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts and tests/b0295-child-internal-cancel-wrap-arm.test.ts are outside this wave's assigned seven-file scope; they are cited only as pattern context (confirming the bundle's canonical home already exists and is already adopted elsewhere), not claimed as additional `locations` — mirroring PTQ-0244's own in-scope/pattern-context boundary for this identical four-file family.
- Coverage check: this finding does not claim a missing test path; every cited function is exercised by b0347's own 32/32 passing tests (confirmed above). The claim is confined to a repeated DEFINITION now available for import, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: b0347:320-341/362-366 diff byte-identical to tests/helpers/invoke-seam-scaffold.ts:31-64 apart from `export`/doc comments (helper's own header names bug 0347 as a source file), b0347 imports none of the five names while in-scope sibling b0349:116-122 already imports the identical bundle, the cited grep counts (raw `const SEAM_NOOP_CHECKPOINT` declarations only in b0294/b0347; `^interface RecordedHop` only in b0347 now that PTQ-0301 migrated b0295; scaffold-import only in b0295/b0349) and docs/bugs status/32-of-32 vitest pass/0 coverage-matrix hits all reproduce, and no existing PTQ covers this file — PTQ-0244 (b0349) and PTQ-0301 (b0295) both explicitly scoped b0347 out as pattern-context only, leaving this residual copy genuinely un-migrated, the same shape PTQ-0301 itself was ratified on for b0295 (triage: claude-opus-5)
