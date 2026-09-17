---
id: PTQ-0433
title: b0294-unit redeclares the SEAM_NOOP/span scaffold that tests/helpers/invoke-seam-scaffold.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:458-486
  - tests/helpers/invoke-seam-scaffold.ts:29-56
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0294-unit redeclares the SEAM_NOOP/span scaffold that tests/helpers/invoke-seam-scaffold.ts already exports

## Observation
tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts declares, module
scope (in its (G) section), a `span()` helper and a
`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` no-op triple used
to assemble an `ExecuteBodyDeps` around an injected `InvokeChild` boundary
double. `tests/helpers/invoke-seam-scaffold.ts` already exports all four under
the identical names with identical bodies; its own header states it
centralises exactly this bundle because it is "byte-for-byte identical across
several `executeBody`-driving invoke/code-call bug-witness files (bug 0294,
bug 0295, bug 0347, bug 0349)," naming bug 0294 by number as one of its four
source files. This test file imports nothing from `tests/helpers/` for this
bundle.

## Evidence

tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:458-486 (re-read immediately before filing):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function invokeExpr(path: string): InvokeExpr {
  return { kind: "invoke", path, returnSchema: null, args: [], range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}

const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```

tests/helpers/invoke-seam-scaffold.ts:29-56 — the canonical exports, body-identical apart from the `export` keyword and doc comments:
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

Exact searches: `grep -rln "^const SEAM_NOOP_CHECKPOINT" tests --include="*.test.ts"`
→ 1 hit (this file only — no other `.test.ts` still redeclares this
identifier). `grep -rl "invoke-seam-scaffold" tests --include="*.test.ts"` →
3 hits (tests/b0295-child-internal-cancel-wrap-arm.test.ts,
tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts,
tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts) — this file is
not among them.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: `tests/helpers/invoke-seam-scaffold.ts`
exports the identical no-op `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator`
triple and `span()` that this file declares locally, and the helper's own
header names bug 0294 by number as one of the files this exact bundle was
drawn from. Prior D7 findings (PTQ-0244, confirmed/fixed; PTQ-0301,
confirmed/fixed) established this same recurring bundle across
b0294/b0295/b0347/b0349 and drove the creation of this helper module, but
both of those findings' own scope statements explicitly excluded
b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts as "outside this
wave's assigned scope; cited only as pattern context." The other three
sibling files (b0295, b0347, b0349) now import the shared module; this file,
now in scope, still carries its own byte-identical copy.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports this exact
four-symbol bundle under the identical names, and its own header names bug
0294 as one of the files it was extracted to centralise; it is the existing
home this file's own (G)-section scaffold could import instead of
redeclaring.

## False-positive check
- Gate-pin check: this file does not match `*gate*.test.ts` or the named
  kin; the cited lines are inert seam scaffolding, not a pinned count or
  inventory assertion.
- Recording-double check: this finding does not claim any assertion built on
  the scaffold cannot fail — it claims the scaffold's own DEFINITIONS are
  copy-pasted rather than shared, a distinct claim the negative-witness
  carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md
  Status "fixed (0.326.0)" — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0294-callee-propagated-invoke-infra-wrapped-unit" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` block — only that four internal scaffold
  symbols could be imported rather than redeclared — so no citation is
  affected.
- Overlap check against already-filed/resolved topics: PTQ-0244 and
  PTQ-0301 are the closest prior findings (same bundle, same helper module);
  both explicitly confined their `locations`/scope to a different sibling
  file (b0349, then b0295 respectively) and both named this file only as
  out-of-scope pattern context at the time. This finding is the residual
  those findings declined to claim against this file, the same
  "fix landed elsewhere, this file was left out of scope" shape already
  accepted at PTQ-0228/PTQ-0301.
- Coverage check: the claim is about a repeated scaffold DEFINITION, not a
  missing test path; every cited symbol is exercised by this file's own
  currently-passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: b0294-unit:458-460/470-487 is body-identical to tests/helpers/invoke-seam-scaffold.ts:31-56 apart from `export`/doc comments (helper header names bug 0294 as a source file), the file's only helpers/ import is fake-rpc-child (line 76) with none of the four scaffold names imported, the cited greps reproduce (`^const SEAM_NOOP_CHECKPOINT` in *.test.ts → only this file; scaffold importers → exactly b0295/b0347/b0349), coverage-matrix 0 hits, bug 0294 fixed (0.326.0), 16/16 vitest pass, and resolved PTQ-0244 (b0349), PTQ-0301 (b0295) and PTQ-0344 (b0347) each explicitly scoped this file out as pattern-context only while the same-wave siblings d7-02-b0294-unit-driver-harness target a different bundle — leaving this residual copy genuinely un-migrated, the same shape PTQ-0301/PTQ-0344 were ratified on (triage: claude-fable-5-1)
