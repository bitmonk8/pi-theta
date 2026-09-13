---
id: PTQ-0301
title: b0295 redeclares the SEAM_NOOP/span/RecordedHop scaffold that tests/helpers/invoke-seam-scaffold.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0295-child-internal-cancel-wrap-arm.test.ts:118-143
  - tests/b0295-child-internal-cancel-wrap-arm.test.ts:150-154
  - tests/helpers/invoke-seam-scaffold.ts:4-8
  - tests/helpers/invoke-seam-scaffold.ts:29-41
  - tests/helpers/invoke-seam-scaffold.ts:58-64
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260913183958
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-13
---

# b0295 redeclares the SEAM_NOOP/span/RecordedHop scaffold that tests/helpers/invoke-seam-scaffold.ts already exports

## Observation
tests/b0295-child-internal-cancel-wrap-arm.test.ts declares, module scope, a
`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` no-op triple, a
`span()` helper, and a `RecordedHop` interface, used to assemble an
`ExecuteBodyDeps` around an injected `InvokeChild` boundary double.
`tests/helpers/invoke-seam-scaffold.ts` already exports all five under the
identical names with identical bodies; its own header states it centralises
exactly this bundle because it is "byte-for-byte identical across several
`executeBody`-driving invoke/code-call bug-witness files (bug 0294, bug 0295,
bug 0347, bug 0349)," naming bug 0295 by number as one of its four source
files. tests/b0295-child-internal-cancel-wrap-arm.test.ts imports nothing
from tests/helpers/ at all.

## Evidence

tests/b0295-child-internal-cancel-wrap-arm.test.ts:118-120 — the file's own
framing of this block as a shared template:
```ts
// Seam scaffolding — mirrors the bug-0294 fence template's inert seams, driven
// by the real `executeBody` executor over an injected `InvokeChild` double.
// ===========================================================================
```

tests/b0295-child-internal-cancel-wrap-arm.test.ts:122-131:
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

tests/b0295-child-internal-cancel-wrap-arm.test.ts:133-143:
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

tests/b0295-child-internal-cancel-wrap-arm.test.ts:150-154:
```ts
interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}
```

tests/helpers/invoke-seam-scaffold.ts:4-8 — the helper's own header, naming
bug 0295 by number as a source of this exact bundle:
```ts
// WHY THIS FILE EXISTS. The `SEAM_NOOP_CHECKPOINT` / `SEAM_NOOP_SINK` /
// `SEAM_NOOP_MUTATOR` no-op triple, `span()`, and the `RecordedHop` SLSH-5
// hop-recording shape are byte-for-byte identical across several
// `executeBody`-driving invoke/code-call bug-witness files (bug 0294, bug
// 0295, bug 0347, bug 0349). This module centralises the pieces that are
```

tests/helpers/invoke-seam-scaffold.ts:29-41 — the canonical exports,
byte-identical to the two excerpts above apart from the `export` keyword:
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
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
```

tests/helpers/invoke-seam-scaffold.ts:58-64:
```ts
/** One recorded SLSH-5 hop (`deps.recordInvokeHop` fires only when a wrap
 *  decision constructs an `invoke_callee` wrapper). */
export interface RecordedHop {
  readonly wrapper: InvokeCalleeError;
  readonly calleePath: string;
  readonly callSite: InvokeCallSite;
}
```

Exact searches: `grep -rln "^const SEAM_NOOP_CHECKPOINT" tests
--include="*.test.ts"` → 3 files (b0294-callee-propagated-invoke-infra-wrapped-unit,
b0295-child-internal-cancel-wrap-arm, b0347-subagent-leg-propagated-mintable-wrapped-unit);
`grep -rl "invoke-seam-scaffold" tests --include="*.test.ts"` → exactly 1 file
(b0349-codecall-child-internal-cancel-wrap-arm); `grep -rln "^interface
RecordedHop" tests --include="*.test.ts"` → 2 files (b0295, b0347).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/invoke-seam-scaffold.ts`
exports the identical no-op `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator`
triple, `span()`, and `RecordedHop` shape that b0295 declares locally, and the
helper's own header names bug 0295 by number as one of the files this exact
bundle was drawn from. b0295 imports nothing from tests/helpers/ at all, so
none of the five symbols is shared. This is not a new observation about the
bundle's existence — a prior D7 finding (tracked in-repo as PTQ-0244) already
established that this bundle recurs across b0294/b0295/b0347/b0349 and its
remediation is what created `tests/helpers/invoke-seam-scaffold.ts` — but
that finding's own `locations`/evidence were confined to
tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts, with its own
False-positive check stating the other three files, including b0295, "are
outside this wave's assigned six-file scope; they are cited only as pattern
context…not claimed as additional `locations`." The module now exists and
only the one file that finding named (b0349) imports it; b0295, in scope for
the current review, still carries its own byte-identical copy.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports this exact
five-symbol bundle under the identical names, and its own header names bug
0295 as one of the files it was extracted to centralise; it is the existing
home this file's own scaffold could import instead of redeclaring.

## False-positive check
- Gate-pin check: tests/b0295-child-internal-cancel-wrap-arm.test.ts does not
  match `*gate*.test.ts` or the named kin; not applicable, and the cited
  lines are inert seam scaffolding, not a pinned count or inventory
  assertion.
- Recording-double check: `RecordedHop`-typed hop lists back a genuine
  positive witness inside this file's own cells (e.g. `hops.length`
  assertions), but this finding does not claim any such assertion cannot
  fail — it claims the double's and scaffold's own DEFINITIONS are
  copy-pasted rather than shared, a distinct claim the negative-witness
  carve-out does not cover (the same distinction PTQ-0244 itself draws for
  this identical bundle).
- docs/bugs/ signature search: docs/bugs/0295-child-internal-cancel-wrap-arm-unreachable.md
  — Status "fixed (0.337.0)". `npx vitest run
  tests/b0295-child-internal-cancel-wrap-arm.test.ts` → 7 passed (7) at HEAD,
  so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0295-child-internal-cancel-wrap-arm" docs/reference/coverage-matrix.md` →
  0 hits. `grep -rl "b0295-child-internal-cancel-wrap-arm" docs/bugs/` → its
  own bug document plus docs/bugs/0322-unknown-tool-cause-no-producer.md,
  which cites it only for an unrelated line-citation-drift note (a
  comment/citation reconciliation, not a witness-list pin). This finding
  proposes no merge, rename or deletion of the file or any
  `it()`/`describe()` — only that five internal scaffold symbols could be
  imported rather than redeclared — so no citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0244 ("b0349
  redeclares the SEAM_NOOP…harness tests/b0294, tests/b0295 and tests/b0347
  already established") is the closest prior finding; its own text states
  its `locations`/`sites` are confined to
  tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts and that
  b0294/b0295/b0347 "are outside this wave's assigned six-file scope; they
  are cited only as pattern context…not claimed as additional `locations`."
  At the time that candidate was filed, tests/helpers/invoke-seam-scaffold.ts
  did not yet exist (PTQ-0244's own Evidence states "no `tests/helpers/`
  module hosts any piece of this bundle"); it now does, built by that
  finding's own remediation, and only the one file (b0349) that finding
  named was migrated to import it. This finding is the residual PTQ-0244
  explicitly declined to claim against b0295 — the same "fix landed
  elsewhere, this file was left out of scope" shape already accepted at
  PTQ-0228.
- Coverage check: the claim is about a repeated scaffold DEFINITION, not a
  missing test path; every cited symbol is exercised by the tests in its own
  file (7/7 passing, confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: b0295's SEAM_NOOP_CHECKPOINT/SINK/MUTATOR+span()+RecordedHop excerpts match byte-for-byte at the cited lines against tests/helpers/invoke-seam-scaffold.ts's identical exports (header naming bug 0295 by number), b0295 has zero `helpers/` imports, only b0349 imports the helper, and PTQ-0244's own text plus the git history of its remediation commit (f593d10e) confirm its scope and fix were confined to b0349, leaving this residual copy genuinely un-migrated (triage: claude-opus-5)
