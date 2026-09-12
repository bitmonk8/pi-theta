---
id: PTQ-0267
title: b0320 redeclares the runLoadPass/noteDiagnostics/allDiagnostics/describeNotes/requireDriven/normativeMessagePattern load-pass harness already flagged as duplicated across sibling composition-root test files
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0320-tools-entry-extension-rule-unenforced.test.ts:137-148
  - tests/b0320-tools-entry-extension-rule-unenforced.test.ts:179-255
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:214-225
  - tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:266-339
sites: 4
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0320 redeclares the runLoadPass/noteDiagnostics/allDiagnostics/describeNotes/requireDriven/normativeMessagePattern load-pass harness already flagged as duplicated across sibling composition-root test files

## Observation
tests/b0320-tools-entry-extension-rule-unenforced.test.ts declares, module
scope, its own `normativeMessagePattern`, `LoadPass` interface,
`runLoadPass`, `noteDiagnostics`, `allDiagnostics`, `describeNotes`,
`errorCodesAt` and `requireDriven` — a bundle that drives
`composeExtensionInstance` and reads its diagnostics back off the recorded
`theta-system-note` channel. Five of these (`normativeMessagePattern`,
`runLoadPass`, `noteDiagnostics`, `allDiagnostics`, `describeNotes`,
`requireDriven`) are byte-identical or near-byte-identical (differing only
by an interpolated bug number or an incidental error-message clause) to the
same-named functions already carried by
tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts,
tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts and
tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts — the
exact file family the open finding PTQ-0230 already names for this harness.
PTQ-0230's own pattern-wide searches (`function noteDiagnostics…` → 12
files, `allDiagnostics…` → 9, `describeNotes…` → 9, `requireDriven…` → 9,
`normativeMessagePattern…` → 15, `runLoadPass…` → 10) already count b0320
among the hits, but PTQ-0230 cites only three files plus
tests/helpers/compose-workspace-harness.ts as its `locations`; b0320 is not
one of them and imports none of these eight functions from anywhere.

## Evidence
tests/b0320-tools-entry-extension-rule-unenforced.test.ts:137-148 —
`normativeMessagePattern`:
```ts
function normativeMessagePattern(code: string): RegExp {
  const message = registryMessage(REGISTRY, code) as string | undefined;
  if (typeof message !== "string" || message.length === 0) {
    throw new Error(
      "harness: docs/spec_topics/diagnostics/code-registry-parse.md carries no Message row for " +
        `${code} — the DIAG-4 column is this file's only message oracle, so a missing row is a ` +
        "harness failure, never a skip",
    );
  }
  const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/<[a-z-]+>/g, ".+"));
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:214-225 — the
same function, differing only in the wording of the thrown message's first
clause:
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

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:179-187 —
`LoadPass`:
```ts
interface LoadPass {
  /** Every `theta-system-note` the pass put on the channel, in order. */
  readonly notes: readonly RecordedNote[];
  readonly offChannel: readonly RecordedNote[];
  readonly notified: readonly (readonly [string, string])[];
  /** Slash names the pass actually registered. */
  readonly registered: readonly string[];
  readonly thetas: readonly ParsedTheta[];
}
```
byte-identical to tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:266-274.

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:213-226 —
`noteDiagnostics` + `allDiagnostics`:
```ts
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

function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:295-308 —
byte-identical:
```ts
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

function allDiagnostics(notes: readonly RecordedNote[]): readonly Diagnostic[] {
  return notes.flatMap((note) => [...noteDiagnostics(note)]);
}
```

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:228-232 —
`describeNotes`:
```ts
function describeNotes(notes: readonly RecordedNote[]): string {
  return notes.length === 0
    ? "[] (NO NOTE ON THE CHANNEL)"
    : notes.map((n, i) => `[${i}] ${n.content}`).join("\n");
}
```
byte-identical to tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:310-314.

tests/b0320-tools-entry-extension-rule-unenforced.test.ts:246-254 —
`requireDriven`, whose only variation from the sibling is the interpolated
bug number:
```ts
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        "theta-system-note channel — the bug-0320 fixture no longer reaches the load pass, " +
        "so nothing below is verified",
    );
  }
}
```

tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:332-339 —
identical apart from "bug-0275" in place of "bug-0320":
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

`runLoadPass` (tests/b0320-tools-entry-extension-rule-unenforced.test.ts:194-209)
matches tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts:281-289
call-for-call (`makeHost`, then `composeExtensionInstance(host.pi, host.ctx,
undefined, new RendererGate())`, then the same five-field return shape),
differing only in source formatting (b0320 wraps the four call arguments
one per line; b0275 keeps them on one line).

Pattern-wide search, re-run against the current tree (`tests/**/*.test.ts`):
`function noteDiagnostics(note: RecordedNote): readonly Diagnostic\[\]` → 12
files, including tests/b0320-tools-entry-extension-rule-unenforced.test.ts;
`function allDiagnostics(notes: readonly RecordedNote\[\]): readonly
Diagnostic\[\]` → 9 files, including b0320;
`function describeNotes(notes: readonly RecordedNote\[\]): string` → 9
files, including b0320; `function requireDriven(pass: LoadPass): void` → 9
files, including b0320; `function normativeMessagePattern(code: string):
RegExp` → 15 files, including b0320; `async function
runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass>` → 10 files,
including b0320. Every one of these six counts, and every file in each
count, reproduces PTQ-0230's own stated pattern-search results exactly;
b0320 is present in all six but is not among PTQ-0230's four cited
`locations`.

## Why this is a problem
This is the same "Boilerplate duplication" root cause PTQ-0230 already
filed and this store confirmed: a multi-function harness for driving
`composeExtensionInstance` and reading its diagnostics back off the
recorded system notes, with no `tests/helpers/` module hosting it, is
retyped whole into each of a family of composition-root test files rather
than shared. PTQ-0230's own text states the pattern recurs "across up to 15
sibling composition-root test files" and its pattern searches count b0320
among them, but its `locations` — the files its remediation would actually
touch — name only tests/b0275-…, tests/b0280-… and
tests/grandchild-callee-drop-…-two-caller.test.ts. b0320 predates none of
those three and was already present when PTQ-0230 ran its searches, yet was
left uncited, so it remains an unremediated copy of the identical
functions. This is structurally the same gap this same lens already found,
filed and had confirmed once before for this exact file, on a different
harness half: PTQ-0220 found b0320's `makeHost`/`HostDouble` bundle was
present in PTQ-0213's pattern search but absent from PTQ-0213's cited
locations, and PTQ-0220 was confirmed as "a distinct, unremediated
occurrence rather than a duplicate of [the prior finding]'s narrower closed
scope." b0320 has since migrated exactly the `makeHost` half PTQ-0220
covers (it now imports `makeHost`/`finishWorkspace`/`normalisePath` from
tests/helpers/compose-workspace-harness.ts) while the adjacent
load-pass/diagnostic-reading half PTQ-0230 covers remains a local copy.

## Suggested direction (non-binding, optional)
PTQ-0230 already names tests/helpers/compose-workspace-harness.ts — which
b0320 already imports `makeHost`/`finishWorkspace`/`normalisePath`/
`ComposeWorkspace`/`RecordedNote` from — as the natural extension point for
the remaining load-pass/diagnostic-reading half; nothing about b0320's copy
is specific to bug 0320 beyond the interpolated bug number inside
`requireDriven`'s thrown message.

## False-positive check
- Gate-pin check: tests/b0320-tools-entry-extension-rule-unenforced.test.ts
  does not match `*gate*.test.ts` or the named kin; none of the eight cited
  functions is a pinned-count or inventory assertion — all are plain helper
  functions.
- Recording-double check: `noteDiagnostics`/`allDiagnostics` read an
  already-recorded `RecordedNote[]` produced by the `makeHost` recording
  double; this finding does not claim any assertion built on them is
  vacuous — only that the reading functions' own DEFINITIONS are
  copy-pasted rather than imported, the same distinct claim PTQ-0230 (and,
  for the neighbouring host-double half, PTQ-0220/PTQ-0213) already filed
  and had confirmed for other files.
- docs/bugs/ signature search: docs/bugs/0320-tools-entry-extension-rule-unenforced.md
  — Status "fixed (0.327.0)". `npx vitest run
  tests/b0320-tools-entry-extension-rule-unenforced.test.ts` → 10 passed
  (10) at HEAD, so this is not a documented correct-reason red, and the bug
  document states no rationale for keeping this harness un-shared.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0320-tools-entry-extension-rule-unenforced"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl
  "b0320-tools-entry-extension-rule-unenforced" docs/bugs/` → only its own
  bug document. This finding proposes no merge, rename, or deletion of the
  file or any `it()`/`describe()` inside it — only that the eight internal
  helper functions could be imported rather than redeclared — so no
  citation is affected.
- Overlap check against PTQ-0230 (open, in the do-not-re-file list): this
  finding's claim is not a new root cause — it is the identical harness
  PTQ-0230 already names, cited at an additional occurrence
  (tests/b0320-tools-entry-extension-rule-unenforced.test.ts) that
  PTQ-0230's own `locations` list omits despite counting it in every one of
  PTQ-0230's six pattern searches (reproduced above). This repository's own
  triage has already treated an identical shape of gap as a distinct,
  confirmable filing rather than a duplicate: PTQ-0220 (confirmed) cites
  b0320 specifically because PTQ-0213 counted but did not migrate it,
  reasoning "consistent with this store's per-occurrence filing convention
  (cf. PTQ-0206/PTQ-0207)." This finding is filed on that same, already-
  established convention; if this wave's triage instead treats
  "counted-but-uncited" as fully covered by PTQ-0230's existing text, the
  correct disposition is `duplicate`, and that determination is left to
  triage rather than assumed here.
- Overlap check against PTQ-0220 (resolved/fixed): PTQ-0220 covers a
  disjoint set of functions in this same file
  (`PiHandler`/`RecordedNote`/`HostDouble`/`makeHost`/`ComposeWorkspace`/
  `normalisePath`/`plantWorkspace`'s settings tail, lines 147-241 in its own
  numbering) that b0320 has since migrated to import from
  tests/helpers/compose-workspace-harness.ts; this finding's cited lines
  (137-148, 179-255) are the load-pass/diagnostic-reading functions that
  remain local after that migration and were never PTQ-0220's subject.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every cited function is exercised by the tests in its
  own file (10/10 passing, confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt and line number (normativeMessagePattern 137-148, LoadPass 179-187, runLoadPass 194-209, noteDiagnostics/allDiagnostics 213-226, describeNotes 228-232, requireDriven 246-254) and all six pattern-search counts (12/9/9/9/15/10, b0320 present in each) independently reproduce, docs/bugs/0320 is fixed with 10/10 passing and no un-sharing rationale, and b0320's copies are byte- or near-byte-identical (bug-number substitution only) to the same functions PTQ-0230 already cites in b0275; b0320 is counted in PTQ-0230's own six pattern searches but absent from its `locations`, the same shape of gap this store has twice already ruled a distinct, confirmable D7 boilerplate-duplication occurrence rather than a duplicate of the related finding's narrower cited scope (PTQ-0220 vs PTQ-0213, PTQ-0228 vs PTQ-0206 — both showing the actual landed fix ran narrower than even the parent ticket's own cited locations), and disjoint from resolved PTQ-0220's makeHost/HostDouble half of this same file (triage: claude-opus-5)
