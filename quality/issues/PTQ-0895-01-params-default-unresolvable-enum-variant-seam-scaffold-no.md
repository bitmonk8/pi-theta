---
id: PTQ-0895
title: params-default-unresolvable-enum-variant.test.ts redeclares the NOOP_CHECKPOINT/NOOP_SINK/InertMutator/parseDeps quartet instead of importing tests/helpers/invoke-seam-scaffold.ts and tests/helpers/e2e-s1.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-unresolvable-enum-variant.test.ts:618-626
  - tests/params-default-unresolvable-enum-variant.test.ts:734-751
  - tests/helpers/invoke-seam-scaffold.ts:29-49
  - tests/helpers/e2e-s1.ts:28-41
  - tests/params-default-enum-access-merge.test.ts:1-7
sites: 1
fix_scope: localized
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# params-default-unresolvable-enum-variant.test.ts redeclares the NOOP_CHECKPOINT/NOOP_SINK/InertMutator/parseDeps quartet instead of importing tests/helpers/invoke-seam-scaffold.ts and tests/helpers/e2e-s1.ts

## Observation
`tests/params-default-unresolvable-enum-variant.test.ts` locally declares a
`parseDeps()` function (lines 618-626) and a `NOOP_CHECKPOINT` /
`NOOP_SINK` / `InertMutator` no-op triple (lines 734-751) that its own driving
harness uses for the shared "bug-0011 / e2e-s5 production-producer pattern"
(the file's own comment at line 613). Two canonical exports already carry the
same shapes: `tests/helpers/e2e-s1.ts` exports `parseDeps()`
(`ParseThetaDocumentDeps` built from an inert system-note channel plus a
trivially-resolving model matcher) and `tests/helpers/invoke-seam-scaffold.ts`
exports `SEAM_NOOP_CHECKPOINT`, `SEAM_NOOP_SINK` and `SEAM_NOOP_MUTATOR` — the
identical `Checkpoint` / `ToolLoweringSink` / `CommittedConversationMutator`
no-op shapes. The sibling file driving the same recovery
(`tests/params-default-enum-access-merge.test.ts`), which shares this file's
own bug-0011/e2e-s5 harness pattern, already imports all four from those two
helper modules instead of redeclaring them.

## Evidence
`tests/params-default-unresolvable-enum-variant.test.ts:618-626` (re-read
immediately before filing):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

`tests/params-default-unresolvable-enum-variant.test.ts:734-751`:
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

class InertMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

`tests/helpers/e2e-s1.ts:28-41` — the canonical export, semantically identical
(same inert `pi.sendMessage`/`ui.notify`/`emitDiagnostic` no-ops, same
trivially-resolving matcher, restructured through a private `inertSystemNote()`
helper):
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

`tests/helpers/invoke-seam-scaffold.ts:29-49` — the canonical
checkpoint/sink/mutator no-op triple, byte-identical in behaviour to the
in-scope file's local `NOOP_CHECKPOINT`/`NOOP_SINK`/`InertMutator`:
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
```

`tests/params-default-enum-access-merge.test.ts:1-7` — the sibling file
driving the same recovery, already migrated to both canonical modules:
```ts
import {
  SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT,
  SEAM_NOOP_SINK as NOOP_SINK,
  SEAM_NOOP_MUTATOR,
} from "./helpers/invoke-seam-scaffold";
import { parseDeps } from "./helpers/e2e-s1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Exact search: `grep -n "function parseDeps\|const NOOP_CHECKPOINT\|const NOOP_SINK\|class InertMutator" tests/params-default-unresolvable-enum-variant.test.ts` → 4 hits (lines 618, 734, 740, 745), all local declarations; the same file already imports `REGISTRY` from `./helpers/registry-oracle` and `committedThetaSources` from `./helpers/theta-corpus`, so it is not that the file avoids `tests/helpers/` imports in general — only these four pieces of the shared bug-0011/e2e-s5 harness were left un-migrated.

## Why this is a problem
Two canonical homes for this exact scaffolding already exist and are already imported by the sibling file that drives the identical recovery path (`#recoverDeclaredDefaults`) through the identical harness pattern the file's own comment names ("the bug-0011 / e2e-s5 production-producer pattern"). The in-scope file instead retypes the same four no-op shapes locally, so a change to any of the three interfaces (`Checkpoint`, `ToolLoweringSink`, `CommittedConversationMutator`) or to the inert parse-deps shape must be echoed by hand in this file while its sibling picks the change up through the import.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `tests/helpers/e2e-s1.ts` and `SEAM_NOOP_CHECKPOINT` / `SEAM_NOOP_SINK` / `SEAM_NOOP_MUTATOR` from `tests/helpers/invoke-seam-scaffold.ts`, the way the sibling file already does, would let this file drop the four local declarations.

## False-positive check
- Gate-pin check: file name matches no `*gate*.test.ts` pattern; not a census/pin gate.
- Recording-double check: `InertMutator`/`NOOP_CHECKPOINT`/`NOOP_SINK` discard every call and record nothing (no `calls` array read anywhere in the file) — these are inert no-op stand-ins, not MUST-NOT recording witnesses.
- docs/bugs/ signature search: `grep -rn "InertMutator\|NOOP_CHECKPOINT\|NOOP_SINK" docs/bugs/` → 0 hits; no documented correct-reason-red cites these declarations by name.
- coverage-matrix/bug-doc citation search: `grep -n "params-default-unresolvable-enum-variant" docs/reference/coverage-matrix.md` → 0 hits. `docs/bugs/0185-*.md` and `docs/bugs/0197-*.md` cite this test file by path in their witness/gates sections, but only the file as a whole (as the reproduction/witness vehicle for bugs 0185 and 0197) — no line range or `it()`/`describe()` name is pinned, and this finding proposes no merge, rename or deletion of any test name, only that the harness's four scaffold pieces could be imported rather than retyped.
- Coverage drift check: this finding is about code that exists (a reimplementation), not about a missing test; no coverage claim is made.
- Prior-wave routing note: `quality/tmp/qw20260918050411/D7/shard-47.notes.txt` (same wave, an earlier shard reviewing the sibling `params-default-enum-access-merge.test.ts`) explicitly left this exact pattern unfiled, naming it "the driveSlash/modelRegistry+pi-capture harness shared with params-default-unresolvable-enum-variant.test.ts (outside this shard's scope) … a future wave reviewing that file directly could weigh filing it" — this shard is that direct review.
- Do-not-re-file list check: `grep -rl "unresolvable-enum-variant" quality/intake quality/issues quality/resolved` shows PTQ-0499 (resolved: `RegistryRow`/`REGISTRY` reimplementation, already fixed — this file now imports `REGISTRY` from `tests/helpers/registry-oracle`), `qw20260918050411-d7-02-stranded-registrymessageof-throw-duplicated.md` (the `registryMessageOf` thrown-message pattern, a distinct root cause) and `PTQ-0657-03-ajv-args-note-helper-triplicated.md` (the `EM_DASH`/`ajvArgsNote` pattern, a distinct root cause) — none of these three already-filed items covers the `parseDeps`/`NOOP_CHECKPOINT`/`NOOP_SINK`/`InertMutator` quartet this finding cites.

## Triage
verdict: confirmed — independently re-verified: local `parseDeps` (:618-626) and `NOOP_CHECKPOINT`/`NOOP_SINK`/`InertMutator` (:734-751) reproduce verbatim and are live (used at :634, :761, :763, :781, :783); `diff -w` against tests/helpers/invoke-seam-scaffold.ts:29-49 shows only name/`export`/class-vs-const differences and e2e-s1.ts:28-41 `parseDeps` is behaviourally identical (same inert sendMessage/notify/emitDiagnostic, same `"resolved"` matcher); both locations under tests/, D7 boilerplate-duplication class; stated searches reproduce (docs/bugs identifier grep → 0, coverage-matrix → 0, bugs 0185/0197 cite the file only as a whole with no merge/rename/delete proposed), no gate/recording-double carve-out; dedupe: the only PTQs citing this file are resolved PTQ-0226/0499 and open PTQ-0657 (distinct roots), and PTQ-0655/0656 tracked this exact class on the sibling enum-access-merge file only (fixed, sibling now imports) — this file was never folded in, so the fix is a mechanical import swap (triage: claude-fable-5-1)

## Fix attempts
- qw20260919162231: skipped — [PTQ-0914-bug0058-bug0100-local-parse-reimplements-parsedoc.md] PTQ-0914: Replaced both local parse wrappers with shared parseDoc; all tests and assertions retained. / PTQ-0916: Reused shared REGISTRY and RegistryRow; retained local message readers as triage permits. / PTQ-0917: Strengthened the assertion to require exactly one error note, retaining diagnostic and envelope checks. / PTQ-0918: Reused plantThetaWorkspace and disposeWorkspace in both files; fixture writes unchanged. No tests deleted. Required gate passed for all four issues: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0919-assertframestointernalerror-reimplements-assertinternalerror.md] PTQ-0919: Both framing helpers delegate to assertInternalError, preserving all four checks; no tests deleted or renamed. / PTQ-0921: Reused the canonical parse-registry reader and message lookup, retaining the non-empty-message guard; no tests deleted or renamed. / PTQ-0922: Replaced the inline pi/ctx double with makeHarness; discovery assertions remain unchanged; no tests deleted or renamed. / PTQ-0926: Shared thetaInput and driveBinder across all three files, preserving per-file parsing, contexts, and fixtures; no tests deleted or renamed. Required gate passed for all four fixes: tsc clean, 689 test files and 11,586 tests passed. ||
