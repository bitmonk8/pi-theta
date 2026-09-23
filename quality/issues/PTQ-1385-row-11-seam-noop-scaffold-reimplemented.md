---
id: PTQ-1385
title: call-with-clause-failure-arms.test.ts row-11 cell redeclares SEAM_NOOP_SINK and SEAM_NOOP_MUTATOR byte-identically to tests/helpers/invoke-seam-scaffold.ts's exported SEAM_NOOP_SINK/SEAM_NOOP_MUTATOR instead of importing them
lens: D7
status: open
verdict: confirmed
locations:
  - tests/call-with-clause-failure-arms.test.ts:430-441
  - tests/helpers/invoke-seam-scaffold.ts:70-80
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# call-with-clause-failure-arms.test.ts row-11 cell redeclares SEAM_NOOP_SINK and SEAM_NOOP_MUTATOR byte-identically to tests/helpers/invoke-seam-scaffold.ts's exported SEAM_NOOP_SINK/SEAM_NOOP_MUTATOR instead of importing them

## Observation
`tests/call-with-clause-failure-arms.test.ts` module-scope-declares its own `SEAM_NOOP_SINK` (a `ToolLoweringSink` whose two methods are no-ops) and `SEAM_NOOP_MUTATOR` (a `CommittedConversationMutator` whose five methods are no-ops), used by its row-11 `executeBody`-driving cell. `tests/helpers/invoke-seam-scaffold.ts` exports a `SEAM_NOOP_SINK` and `SEAM_NOOP_MUTATOR` of the identical shape and identical member bodies, built for exactly this "drive the real `executeBody` over an injected boundary double" pattern (its own header: "so a file that needs them can import rather than retype them"). `call-with-clause-failure-arms.test.ts` imports only TYPES from `../src/runtime/tool-call-execute` and `../src/runtime/terminal-outcomes` (`ToolLoweringSink`, `CommittedConversationMutator`, `CommittedSurface`) — it never imports `tests/helpers/invoke-seam-scaffold.ts`.

## Evidence
`tests/call-with-clause-failure-arms.test.ts:430-441` (re-read verbatim immediately before filing):
```ts
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

`tests/helpers/invoke-seam-scaffold.ts:70-80` (the exported canonical originals, byte-identical members):
```ts
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
```

Search: `grep -n "invoke-seam-scaffold\|SEAM_NOOP" tests/call-with-clause-failure-arms.test.ts` → the only two hits are the file's own local `const SEAM_NOOP_SINK`/`const SEAM_NOOP_MUTATOR` declarations (lines 430, 435) and their two use sites (lines 457, 485); zero import of `./helpers/invoke-seam-scaffold`.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts` exists specifically so that a file driving `executeBody`/`createEffectfulStatementHost` over an injected boundary double can import this no-op triple "rather than retype them" (its own header comment), and its prior fix (PTQ-0244) already consolidated four sibling files onto this exact scaffold. `call-with-clause-failure-arms.test.ts`'s row-11 cell drives the identical real-executor seam (`createEffectfulStatementHost`/`executeBody`, a `ToolLoweringSink` and a `CommittedConversationMutator` both wired in as pure no-op stand-ins) but redeclares both no-op values under the same names byte-for-byte instead of importing the canonical exports.

## Suggested direction (non-binding, optional)
Importing `SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` from `./helpers/invoke-seam-scaffold` in place of the two local `const` declarations is the import this file's own scaffold-driving shape already points toward, matching the route the PTQ-0244 fix took for its four sibling files.

## False-positive check
Gate-pin check: `call-with-clause-failure-arms.test.ts` does not match `*gate*.test.ts` or the named kin; not applicable. Recording-double check: `SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` are pure no-op stand-ins with no recording state and back no MUST-NOT witness assertion in this file — the finding is about the double's construction being reimplemented, not about a witness's legitimacy. docs/bugs/ signature search: `grep -rl "call-with-clause-failure-arms" docs/bugs/` → no hits; this is not a documented correct-reason red (the row-11 cell is a currently-red RFC-0009 cell per its own header, but its redness is about the missing runtime belt, not about this scaffold declaration, and the scaffold duplication claim holds independent of red/green status). coverage-matrix/bug-doc citation search: `grep -rl "call-with-clause-failure-arms" docs/reference/coverage-matrix.md` → no hits; no rename/merge/delete of a cited test is proposed — only that two module-scope `const` declarations could be imports. This does not drift into coverage: the claim is that the code that exists reimplements an available helper's exports, not that a test path is missing. Distinguished from the prior PTQ-0244 finding: PTQ-0244 explicitly excluded this exact file/pattern as one instance of a "wider convention" not part of its four-file bundle claim (it names `tests/call-with-clause-failure-arms.test.ts`'s lone `SEAM_NOOP_MUTATOR` directly in that ruling's false-positive section) and did not itself file this file's duplication; this finding is the first to name it, filed now that `tests/helpers/invoke-seam-scaffold.ts` (created as PTQ-0244's own fix) offers the specific, importable, byte-identical pair this file could use instead.

## Triage
verdict: confirmed — independently re-verified: the local declarations reproduce verbatim at call-with-clause-failure-arms.test.ts:430-441 and a scratch diff (export-stripped, doc-comments removed) against invoke-seam-scaffold.ts:73-84 (small drift from the cited 70-80) is empty — byte-identical; grep confirms the only SEAM_NOOP hits in the test file are the two local consts (430, 435) and their two use sites (457, 485) with zero import of ./helpers/invoke-seam-scaffold; both copies are live (hostDeps.sink / execDeps.mutator feed the real createEffectfulStatementHost/executeBody); the helper (f593d10e, 2026-09-12) postdates the test's declarations (96303cc3, 2026-09-09) and its header names this exact SEAM_NOOP_SINK/SEAM_NOOP_MUTATOR triple as the thing to "import rather than retype"; no carve-out applies — not a *gate* file, the doubles are inert no-ops not recording witnesses, the file's RED posture is an in-file RFC 0009 correct-reason red untouched by an import swap, and grep of docs/bugs/ and docs/reference/coverage-matrix.md for the file name → 0 hits; not a duplicate — resolved PTQ-0244:219 explicitly named this file's SEAM_NOOP_MUTATOR as excluded pattern context, resolved PTQ-0273/0278/0471/0557/0702 cover other surfaces of this file (R2 host()/launchRequest, R(), static-check deps), and same-wave sibling d7-02-noop-order-mutator targets b0370-reassign-target-scope.test.ts, not this file (triage: claude-fable-5-1)
