---
id: PTQ-0230
title: b0275 redefines an 8-function load-pass/diagnostic-reading harness that recurs verbatim across up to 15 sibling composition-root test files
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:214-225
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:281-340
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:181-192
  - tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:306-354
  - tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:409-464
  - tests/helpers/compose-workspace-harness.ts:1-13
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0275 redefines an 8-function load-pass/diagnostic-reading harness that recurs verbatim across up to 15 sibling composition-root test files

## Observation
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts declares,
module-scope, eight functions that drive `composeExtensionInstance` over a
`makeHost`-built double and read the result back:
`normativeMessagePattern`, `runLoadPass`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `errorRowsAt`, `errorFilesOf` and `requireDriven`. Each
recurs, at matching or near-matching signatures, in up to 15 other test files
under tests/ (exact search counts below). tests/helpers/compose-workspace-harness.ts
already centralises the adjacent, textually-preceding half of this same
harness (`makeHost`, `RecordedNote`, `HostDouble`, `ComposeWorkspace`,
`normalisePath`, `finishWorkspace` — the subject of the now-fixed PTQ-0213,
which named b0275 as one of the two files it cited), but its exports stop
short of the eight functions this finding covers; no tests/helpers/ module
hosts any of them.

## Evidence

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:214-225 —
`normativeMessagePattern`:
```ts
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:181-192 —
the same function, confirmed byte-identical to the excerpt above by `diff`:
```ts
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: the docs/spec_topics/diagnostics/ registry pages carry no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row ` +
        "is a harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:281-329 —
`runLoadPass` through `errorFilesOf`:
```ts
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
  };
}

function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}
```
(confirmed by `diff` to be byte-identical, function-for-function, to
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts:306-329 and
— for `runLoadPass` minus a two-line elapsed-time addition, and for
`noteDiagnostics` in full — to
tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:409-435.)

tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts:459-464 —
`errorFilesOf`, byte-identical to b0275's copy:
```ts
function errorFilesOf(pass: LoadPass, code: string): readonly string[] {
  return allDiagnostics(pass.notes)
    .filter((d) => d.severity === "error" && d.code === code)
    .map((d) => normalisePath(d.file ?? "?"))
    .sort();
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:332-340 —
`requireDriven`, whose only per-file variation is the interpolated bug number
inside the thrown message:
```ts
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0275 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}
```

tests/helpers/compose-workspace-harness.ts:1-13 — the sibling module that
already centralises the textually-adjacent half of this same harness (the host
double and workspace planter), showing the convention of factoring this class
of composition-root test plumbing into tests/helpers/ is already established
one layer up from where this finding's eight functions sit:
```ts
// A shared "recording host double + temp compose workspace" harness for the
// composition-root load-pass test files that drive `composeExtensionInstance`
// over a planted temp directory (PTQ-0213).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `PiHandler` type, `RecordedNote` / `HostDouble` interfaces, `makeHost`
// function, `ComposeWorkspace` interface, `normalisePath` function, and the
// settings-file-planting tail every temp workspace needs. This module
// centralises the parts that are byte-for-byte identical across those files;
```

Pattern-wide search (exact function signature, `tests/**/*.test.ts`):
`noteDiagnostics(note: RecordedNote): readonly Diagnostic[]` → 12 files;
`allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[]` → 9
files; `describeNotes(notes: readonly RecordedNote[]): string` → 9 files;
`errorRowsAt(pass: LoadPass, file: string): readonly Diagnostic[]` → 2 files
(b0275, b0280); `errorFilesOf(pass: LoadPass, code: string): readonly
string[]` → 4 files; `normativeMessagePattern(code: string): RegExp` → 15
files (including 5 under tests/live/); `async function
runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass>` → 10 files;
`requireDriven(pass: LoadPass): void` → 9 files. b0275 carries all eight
signatures; the full file lists were reproduced during this review via `grep
-rl` on each signature.

## Why this is a problem
This is the "Boilerplate duplication" class: an eight-function harness for
driving `composeExtensionInstance` and reading its diagnostics back off the
recorded system notes is retyped whole into each of a family of composition-
root test files rather than shared, and `diff` confirms several of the pieces
(`normativeMessagePattern`, `noteDiagnostics`, `allDiagnostics`,
`describeNotes`, `errorFilesOf`) are byte-identical across the files compared
directly, with the remainder (`runLoadPass`, `requireDriven`) differing only
by one added timing field or one interpolated bug number. The project already
factors the immediately adjacent half of the same harness
(makeHost/HostDouble/ComposeWorkspace) into tests/helpers/compose-workspace-harness.ts,
whose own header names the earlier duplication by PTQ number — the convention
of centralising this class of plumbing is established for the host-double
half and stops one layer short of the load-pass-driving and diagnostic-reading
half this finding cites.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts, which already exports the
`RecordedNote`/`ComposeWorkspace` types these eight functions are built on, is
the module the convention it documents already points at for the remaining,
still-duplicated half of the same harness.

## False-positive check
- Gate-pin: none of the cited files (b0275, b0280, grandchild-callee-drop-un-registers-depth-two-caller)
  matches `*gate*.test.ts` or the named kin; not applicable, and no cited
  function is a pinned-count or inventory assertion — all eight are plain
  helper functions.
- Recording-double: `noteDiagnostics`/`allDiagnostics` READ an already-recorded
  `RecordedNote[]` (itself produced by the `makeHost` recording double this
  finding does not touch); none of the eight functions itself backs a "never
  called" assertion, so the negative-witness carve-out does not apply to their
  definitions.
- docs/bugs/ signature search: docs/bugs/0275-escaping-tools-entry-below-immediate-callee-silent-at-caller.md
  Status "fixed (0.274.0)". `npx vitest run
  tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts` → 5 passed
  (5) at HEAD, so this is not a documented correct-reason red. Neither bug
  document's text offers a rationale against sharing these functions; PTQ-0213
  (fixed) already established, for the neighbouring makeHost/HostDouble
  bundle in this same file, that "duplicated from rather than shared with" in
  the file's own header is not a stated design rationale but a description of
  the gap.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0275-escaping-tools-entry-below-immediate-callee"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl
  "b0275-escaping-tools-entry-below-immediate-callee" docs/bugs/` → only its
  own bug document (docs/bugs/0275-...). This finding proposes no merge,
  rename or deletion of any file, `it()` or `describe()` — only that the eight
  internal helper functions could be imported rather than redeclared — so no
  citation is affected.
- Overlap check against this same wave's other D7 candidates: this finding's
  cited line ranges (214-225, 281-340) exclude the `RegistryRow`/`REGISTRY`
  declaration at tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:192-205,
  which performs a distinct, separately-parsed read of the diagnostics registry
  and is covered under its own root cause by the sibling candidate
  qw20260912091742-d7-03-b0275-registry-oracle-duplicated.md; the two findings
  cite disjoint line ranges in the same file for two different reasons.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited function is exercised by the tests in its own
  file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and byte-identical diff (normativeMessagePattern, runLoadPass, noteDiagnostics, allDiagnostics, describeNotes, errorFilesOf, requireDriven) and all eight pattern-search counts (12/9/9/2/4/15/10/9) reproduce exactly on independent recheck, no tests/helpers/ module hosts any of the eight, both bug docs are fixed with the test passing (5/5) and no stated rationale against sharing, and the finding is disjoint from resolved PTQ-0213 (host-double half) and PTQ-0215 (four-page registry-oracle bundle) and from its own in-wave sibling d7-03 (disjoint line ranges), matching this store's confirmed per-occurrence D7 boilerplate-duplication precedent (PTQ-0206/0207/0213/0215). (triage: claude-opus-5)
