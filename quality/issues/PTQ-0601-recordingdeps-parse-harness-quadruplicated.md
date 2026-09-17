---
id: PTQ-0601
title: The recordingDeps()/parse() diagnostic-capturing harness is redeclared byte-for-byte in four parser test files, including the in-scope leading-bracket-statement-boundary.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/leading-bracket-statement-boundary.test.ts:52-84
  - tests/postfix-question-ternary-statement-boundary.test.ts:64-96
  - tests/subagent-fn-return-annotation.test.ts:76-108
  - tests/whole-program-parser.test.ts:57-89
sites: 4
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The recordingDeps()/parse() diagnostic-capturing harness is redeclared byte-for-byte in four parser test files, including the in-scope leading-bracket-statement-boundary.test.ts

## Observation
tests/leading-bracket-statement-boundary.test.ts declares a module-scope
`function recordingDeps()` that builds a `SystemNoteSender` capturing every
`sendMessage` call's `details.diagnostics` array into a `delivered:
Diagnostic[][]` accumulator, wraps it into `ParseThetaDocumentDeps` with an
always-`"resolved"` `modelMatcher`, and a `function parse(src, path)` that
encodes `src` into a `ThetaSource` and drives `parseThetaDocument` with those
deps (discarding the `delivered` half of `recordingDeps()`'s return value).
The identical pair — same field names, same doc comments, same
`"diagnostics" in message.details!` guard, same default `path = "test.theta"`
— is independently redeclared in three other test files under review's
sibling scope.

## Evidence

tests/leading-bracket-statement-boundary.test.ts:52-84 (re-read immediately
before filing):
```ts
function recordingDeps(): {
  deps: ParseThetaDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
      }
    },
  };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  // A trivially-resolving `model:` matcher — the frontmatter model hook is not
  // under test here.
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { deps: { systemNote, modelMatcher }, delivered };
}

/** Parse a UTF-8 `.theta` source string into a {@link ThetaDocument}. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const { deps } = recordingDeps();
  const source: ThetaSource = {
    path,
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, deps);
}
```

tests/postfix-question-ternary-statement-boundary.test.ts:64-96 — byte-identical:
```ts
function recordingDeps(): {
  deps: ParseThetaDocumentDeps;
  delivered: Diagnostic[][];
} {
  const delivered: Diagnostic[][] = [];
  const pi: SystemNoteSender = {
    sendMessage: (message): void => {
      if ("diagnostics" in message.details!) {
        delivered.push([...message.details!.diagnostics]);
      }
    },
  };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  // A trivially-resolving `model:` matcher — the frontmatter model hook is not
  // under test here.
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { deps: { systemNote, modelMatcher }, delivered };
}

/** Parse a UTF-8 `.theta` source string into a {@link ThetaDocument}. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const { deps } = recordingDeps();
  const source: ThetaSource = {
    path,
    bytes: new TextEncoder().encode(src),
```

tests/subagent-fn-return-annotation.test.ts:76-108 — byte-identical to the
same excerpt.

tests/whole-program-parser.test.ts:57-89 — byte-identical to the same
excerpt.

Search performed: `grep -rn "^function recordingDeps" tests/*.test.ts` → exactly
these four files; each file's `recordingDeps` body and paired `parse` function
are byte-for-byte identical apart from surrounding blank lines. In all four
files, `parse()` destructures only `{ deps }` from `recordingDeps()`'s return
value — the `delivered` array `recordingDeps()` builds and returns is never
read by any of the four files (`grep -n "delivered" <file>` shows it only
declared, pushed to, and returned, in each of the four).

## Why this is a problem
The same diagnostic-capturing `recordingDeps()`/`parse()` pair is typed a
fourth time in `tests/leading-bracket-statement-boundary.test.ts` rather than
declared once in `tests/helpers/`. `tests/helpers/e2e-s1.ts` already exports a
`parseDoc()` that drives `parseThetaDocument` the same way (minus the
`delivered`-capturing channel none of the four files reads), so the
capability of parsing a fixture through the whole-document entry point with
inert seams is already centralised; the `recordingDeps()`/`parse()` pair adds
an unread capture on top of that and is reproduced four times rather than
factored out once.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of this exact `recordingDeps()`/`parse()`
pair (or dropping the unread `delivered` accumulator and importing
`tests/helpers/e2e-s1.ts`'s existing `parseDoc()` directly) is the home four
independent copies already point toward.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or its named
  kin; the cited lines are harness/fixture declaration, not a pinned count or
  inventory.
- Recording-double check: the `delivered` accumulator is a positive
  read-back-shaped capture (an array a caller COULD assert against), but none
  of the four files reads it — it does not back a "never called" MUST-NOT
  witness in any of the four, so the negative-witness carve-out does not
  apply, and this finding does not claim it is a tautological assertion (no
  assertion reads `delivered` at all in the cited files).
- docs/bugs/ signature search: `grep -rln "leading-bracket-statement-boundary\|postfix-question-ternary-statement-boundary\|subagent-fn-return-annotation\|whole-program-parser" docs/bugs/*.md` → docs/bugs/0006, docs/bugs/0015, and docs/bugs/0005 each name one of these files as their own reproduction/witness file; none documents the harness-declaration DUPLICATION as a correct-reason red, and this finding proposes no merge, rename, or deletion of any of the four files or their `it()`/`describe()` blocks.
- coverage-matrix/bug-doc citation search: `grep -n "leading-bracket-statement-boundary\|postfix-question-ternary-statement-boundary\|subagent-fn-return-annotation\|whole-program-parser" docs/reference/coverage-matrix.md` → 0 hits.
- Overlap check: `grep -rli "recordingDeps" quality/intake/*.md quality/resolved/*.md` (excluding this file) → no hits; no prior finding names this duplication.
- Coverage-drift check: this finding is about a harness declaration repeated across files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `grep -rn "^function recordingDeps" tests/` yields exactly the four cited files at :52/:64/:76/:57, the 33-line recordingDeps()/parse() block extracted from each diffs byte-identical against the leading-bracket copy (diff exit 0 ×3), `delivered` is declared/pushed/returned but never read in any of the four (grep shows only :54/:56/:60/:74-pattern hits per file), none of the four imports anything from ./helpers while tests/helpers/e2e-s1.ts:37-46 exports the equivalent parseDeps()/parseDoc() (same default path, same resolving matcher, inert channel), all four files are green (vitest 4 files / 88 tests passed) so no documented-red posture is disturbed, coverage-matrix.md has 0 hits, docs/bugs/0005/0006/0015 name these as witness files without documenting the harness duplication, and no PTQ dedupes it (PTQ-0214/0239/0314/0386/0405 are the same class at other files; PTQ-0135 cites whole-program-parser only for header narration); nuance: whole-program-parser.test.ts (2026-07-02) predates e2e-s1.ts (2026-07-13) so it is the origin copy, but the three 2026-07-26/27 siblings copied it after the helper existed and the four-copy duplication is real regardless (triage: claude-fable-5-1)
