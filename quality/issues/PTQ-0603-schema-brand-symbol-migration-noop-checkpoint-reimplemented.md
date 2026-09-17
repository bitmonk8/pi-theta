---
id: PTQ-0603
title: schema-brand-symbol-migration.test.ts redeclares NOOP_CHECKPOINT instead of importing tests/helpers/invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/schema-brand-symbol-migration.test.ts:195-199
  - tests/helpers/invoke-seam-scaffold.ts:29-35
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# schema-brand-symbol-migration.test.ts redeclares NOOP_CHECKPOINT instead of importing tests/helpers/invoke-seam-scaffold.ts's SEAM_NOOP_CHECKPOINT

## Observation
tests/schema-brand-symbol-migration.test.ts declares a local module-scope
`NOOP_CHECKPOINT: Checkpoint` constant whose `before()` unconditionally
resolves, and threads it into both of its `RuntimeRoot` doubles
(`rootDouble()` for the non-query executor path and `rootLive()` for the QRY-18
render witness). `tests/helpers/invoke-seam-scaffold.ts` already exports
`SEAM_NOOP_CHECKPOINT: Checkpoint` with the byte-identical body, built from
the same `Checkpoint` type (`src/seams/checkpoint`) the reviewed file also
imports, for exactly this "the checkpoint seam is not itself under test"
purpose.

## Evidence
tests/schema-brand-symbol-migration.test.ts:195-199 (re-read immediately
before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

tests/helpers/invoke-seam-scaffold.ts:29-35 — the canonical, already-exported
equivalent (identical body, same imported `Checkpoint` type):
```ts
/** A `Checkpoint` whose `before()` resolves immediately — the seam is not
 *  itself under test at the call sites that use this scaffold. */
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

Search: `grep -n "helpers/invoke-seam-scaffold" tests/schema-brand-symbol-migration.test.ts` → 0 hits; the file instead imports the bare `Checkpoint` type
from `../src/seams/checkpoint` (its own line 31 import) and constructs the
no-op object locally.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts`'s own header states its
`SEAM_NOOP_CHECKPOINT` (among the rest of its no-op triple) was extracted
because it was "byte-for-byte identical across several
`executeBody`-driving invoke/code-call bug-witness files." The reviewed
file drives `executeBody` twice (via `bindPromptConversation`, both for the
plain ctor-execution path and for the live-session query-render path) using
exactly this same shape of inert checkpoint, but declares its own copy
rather than importing the one three sibling files already import.

## Suggested direction (non-binding, optional)
`tests/helpers/invoke-seam-scaffold.ts` already exports
`SEAM_NOOP_CHECKPOINT` built from the identical `Checkpoint` no-op the
reviewed file declares locally; importing it (with a local alias, as the
`b0274`-family file does for the sibling registry-oracle bundle) is the
existing target for this exact shape.

## False-positive check
- Gate-pin check: schema-brand-symbol-migration.test.ts does not match
  `*gate*.test.ts` or the named kin; the cited lines are a no-op fixture
  constant, not a pinned count or inventory assertion.
- Recording-double check: `NOOP_CHECKPOINT`'s `before()` is an unconditional
  no-op that records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0026-ctor-field-named-thetaschema-destroyed-by-brand.md
  is this file's own subject; its documented RED groups concern the
  `brandSchemaValue` output assertions, not the `Checkpoint` double this
  finding cites — the checkpoint seam is explicitly not under test at either
  call site (per the file's own harness-notes section), so no documented
  correct-reason red bears on this claim.
- coverage-matrix/bug-doc citation search: `grep -rn
  "schema-brand-symbol-migration" docs/reference/coverage-matrix.md` → 0
  hits; docs/bugs/0026 cites the file by name for its groups/cell ids, not
  for lines 195-199. This finding proposes no merge, rename, or deletion of
  any test, `it()`, or `describe()` — only that a no-op constant could be
  imported rather than redeclared.
- Coverage check: the claim is about a repeated no-op fixture DEFINITION,
  not a missing test path; both call sites that use it continue to exercise
  the same production `executeBody`/`bindPromptConversation` paths under the
  current inline definition.
- Overlap/duplicate check: `grep -rl "helpers/invoke-seam-scaffold"
  quality/intake quality/resolved` (excluding this shard's own manifest)
  found several prior "noop-checkpoint ... invoke-seam-scaffold" findings,
  none of which name or cite tests/schema-brand-symbol-migration.test.ts in
  their own `locations` field (each cites a distinct, unrelated test file);
  this is a previously unfiled instance of the pattern at this specific
  site. This finding is also distinct in root cause from
  `qw20260917154546-d7-02-schema-brand-symbol-migration-livesessiondouble-not-migrated.md`
  filed in this same shard, which concerns a different helper module
  (`tests/helpers/scripted-live-session-harness.ts`) and a different set of
  duplicated symbols (`ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps`/
  `ajv`/`LiveSessionDouble`), none of which include `NOOP_CHECKPOINT`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the `NOOP_CHECKPOINT` body at tests/schema-brand-symbol-migration.test.ts:195-199 is byte-identical to the exported `SEAM_NOOP_CHECKPOINT` at tests/helpers/invoke-seam-scaffold.ts:29-35 (same `src/seams/checkpoint` type), is threaded into both `rootDouble()` (:249) and `rootLive()` (:394) feeding `bindPromptConversation → executeBody` (:280-281, :450-456) where the checkpoint seam is inert, the file has zero `helpers/invoke-seam-scaffold` imports while exactly the three claimed siblings (b0295/b0347/b0349) import the helper; in-scope D7 copy-paste-fixture confined to tests/ with no gate/recording-double/bug-doc/coverage-matrix carve-out; not a duplicate — none of this wave's pending noop-checkpoint filings cites this file and resolved PTQ-0209 (95-file `NOOP_CHECKPOINT` count) migrated only its 4 cited files (84 local declarations remain), so per PTQ-0301/PTQ-0344 precedent this is a confirmed un-migrated residual; fixer note: tests/helpers/call-with-clause-harness.ts's exported `rootDouble()` (PTQ-0209's home) already wraps this identical no-op checkpoint plus the identical `idSource` stub, so it is a second existing target (triage: claude-fable-5-1)
