---
id: PTQ-0696
title: shadowed-callable-call.test.ts's rootDouble/ctxDouble/producer/recordingPiTool/snapshot/thetaWithSet/bind block is a near-byte-identical copy of tool-arg-shape-enforcement.test.ts's
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/shadowed-callable-call.test.ts:471-541
  - tests/tool-arg-shape-enforcement.test.ts:397,557-616
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# shadowed-callable-call.test.ts's rootDouble/ctxDouble/producer/recordingPiTool/snapshot/thetaWithSet/bind block is a near-byte-identical copy of tool-arg-shape-enforcement.test.ts's

## Observation
`tests/shadowed-callable-call.test.ts` declares a `NOOP_CHECKPOINT` constant
and `rootDouble`, `ctxDouble`, `producer`, `recordingPiTool`, `snapshot`,
`thetaWithSet` and `bind` functions to drive
`createProductionProducerDeps(...).bindPromptConversation` over a recording
`pi-tool` callable-set entry. `tests/tool-arg-shape-enforcement.test.ts`
declares the same seven names with the same bodies (apart from the
slash/source-path string and `shadowed-callable-call.test.ts`'s `bind` taking
an extra optional `paramBindings` argument the other file has no use for).
Bug 0016's own report names this explicitly: "the full §Reproduction matrix"
is driven "via the production binding harness (the
`tests/tool-arg-shape-enforcement.test.ts` producer-level pattern:
`parseThetaDocument` on real fenced source → `createProductionProducerDeps` →
`bindPromptConversation` with a recording `pi-tool` snapshot entry …)". No
`tests/helpers/` module exports this family.

## Evidence
tests/shadowed-callable-call.test.ts:477-500 (re-read immediately before
filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function producer() {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** A recording `pi-tool` snapshot entry capturing every dispatched params object. */
function recordingPiTool(toolName: string): {
```

tests/tool-arg-shape-enforcement.test.ts:557-580 (the same seven functions,
byte-identical apart from the slash name below):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

function producer() {
  return createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

/** A recording `pi-tool` snapshot entry capturing every dispatched params object. */
function recordingPiTool(toolName: string): {
```

tests/shadowed-callable-call.test.ts:522-532 (`thetaWithSet`, differing from
the other file only in the `slashName`/`sourcePath` string literals):
```ts
function thetaWithSet(programBody: ThetaBody, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "bug0016",
    sourcePath: "/theta/bug0016.theta",
    frontmatter,
    body: programBody,
    callableSet,
  };
}
```

tests/tool-arg-shape-enforcement.test.ts:602-611 (the same function, the only
difference being the `bug0003` slash name/source path):
```ts
function thetaWithSet(programBody: ThetaBody, callableSet: CallableSetSnapshot): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" };
  return {
    slashName: "bug0003",
    sourcePath: "/theta/bug0003.theta",
    frontmatter,
    body: programBody,
    callableSet,
  };
}
```

Exact search: `grep -n "^function rootDouble\|^function ctxDouble\|^function producer\|^function recordingPiTool\|^function snapshot\|^function thetaWithSet\|^function bind\b" tests/*.test.ts` returns these two files only (shadowed-callable-call.test.ts:477,487,491,500,515,522,533;
tool-arg-shape-enforcement.test.ts:557,567,571,580,595,602,613); `grep -n "^const NOOP_CHECKPOINT" tests/*.test.ts` likewise returns the two files
(shadowed-callable-call.test.ts:471; tool-arg-shape-enforcement.test.ts:397).

## Why this is a problem
Bug 0016's own report calls this the "`tests/tool-arg-shape-enforcement.test.ts`
producer-level pattern", i.e. the second file's authors already knew the
first file owned this shape and reproduced it rather than importing it. A
change to how `createProductionProducerDeps` wires a `RuntimeRoot`/
`ExtensionCommandContext` double, or to the recording `pi-tool` entry shape
`ResolvedCallable` expects, must be hand-applied in both files today.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently hosts a "recording pi-tool +
`createProductionProducerDeps` root/ctx double + callable-set snapshot"
harness; the two files' independent, near-identical redeclarations are the
observation that one is missing, not a design for it.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin.
- Recording-double check: `recordingPiTool`'s `params` array backs genuine
  positive assertions (`expect(cell.params).toEqual([{ path: "p" }])`) and
  one negative witness (`expect(cell.params).toEqual([])` for a call that
  must never dispatch) in both files; this finding targets the redeclared
  harness definition, not the validity of either assertion built on it.
- docs/bugs/ signature search: docs/bugs/0016-shadowed-tool-name-runtime-dispatch.md
  is Status fixed (0.22.0) and docs/bugs/0003-tool-arg-shape-rule-not-enforced.md
  is the origin of the mirrored pattern; neither is a documented
  correct-reason red for either file (both suites are green at HEAD). This
  finding proposes no merge, rename or deletion of either file or any
  `it()`/`describe()` inside them — only that the shared setup could be
  imported rather than redeclared.
- coverage-matrix/bug-doc citation search: `grep -n "shadowed-callable-call.test.ts\|tool-arg-shape-enforcement.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits (both files are however named
  in several other bug docs' witness lists, e.g. docs/bugs/0106,
  docs/bugs/0107, docs/bugs/0131 — none of those citations concerns the
  producer-level harness this finding targets, and this finding does not
  propose merging, renaming or deleting either file).
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of each file's double is exercised by that
  file's own tests.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently diffed shadowed-callable-call.test.ts:471-545 against tool-arg-shape-enforcement.test.ts:397-401+557-616: byte-identical except the bug0016/bug0003 slug pair and bind's optional paramBindings; bug 0016 doc line 129 carries the quoted "producer-level pattern" admission; both bug docs fixed, coverage-matrix 0 hits, neither file a gate, no tracked PTQ names either file and repo precedent (PTQ-0238/0384/0397) treats a pair-specific multi-function harness as distinct from PTQ-0209's bare trio — in-scope D7 copy-paste fixture; two evidentiary claims must be corrected before ticketing: the "returns these two files only" search is false (only recordingPiTool and bind are unique; rootDouble/ctxDouble/producer/snapshot/thetaWithSet/NOOP_CHECKPOINT recur in ~90 test files), and "no tests/helpers/ module exports this family" is false — tests/helpers/tool-call-dispatch-harness.ts (PTQ-0238's fix, commit 11820751, imported by 4 sibling files) already exports NOOP_CHECKPOINT/rootDouble/ctxDouble/producer/snapshot/thetaWithSet plus a recording builtinEntry, which strengthens the consolidation case since a working helper is being bypassed (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
