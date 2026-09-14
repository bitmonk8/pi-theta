---
id: PTQ-0347
title: b0361's run() re-derives bindImportedBody's parse/checkThetaImports/createProductionProducerDeps/bind driver sequence instead of importing tests/helpers/thetalib-load-harness.ts's canonical helper
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0361-case-variant-import-dir-identity.test.ts:119-189
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0361's run() re-derives bindImportedBody's parse/checkThetaImports/createProductionProducerDeps/bind driver sequence instead of importing tests/helpers/thetalib-load-harness.ts's canonical helper

## Observation
tests/b0361-case-variant-import-dir-identity.test.ts declares its own module-scope `run()` function that parses the importing theta, asserts its frontmatter parsed, drives `checkThetaImports`, builds a `createProductionProducerDeps` instance, assembles a `ThetaCompositionInput`/`ConversationBindInput` pair, and calls `bindPromptConversation` — the identical sequence tests/helpers/thetalib-load-harness.ts's exported `bindImportedBody` already performs and that this same helper's own header states was centralised specifically to end this repeated pattern (PTQ-0315, citing tests/b0303, tests/b0305 and tests/b0306 as the three prior copies). b0361 does not import `bindImportedBody`; every line of the theta/bindInput/binding-construction block is byte-identical to the helper's own block bar one necessary parameterisation (a real `sourcePath` versus the helper's hardcoded fake one), and the surrounding `createProductionProducerDeps` call differs only in inlining values (`modelRegistry`, `resolvePiTool`) the helper already carries as reusable pieces internal to it (a caller-supplied parameter and the module-private `ambientResolvePiTool`, respectively).

## Evidence

tests/b0361-case-variant-import-dir-identity.test.ts:156-169 (re-read immediately before filing) — the theta/bindInput/binding-construction block:
```ts
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath,
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
```

tests/helpers/thetalib-load-harness.ts:237-250 (re-read immediately before filing) — `bindImportedBody`'s equivalent block: `diff` against the b0361 excerpt directly above produces exactly one changed line (`sourcePath: "/proj/app.theta"` here versus the bare `sourcePath` parameter in b0361 — required because b0361 drives a real on-disk path through `PiFileSystem` where the helper drives a synthetic path through an in-memory double), all 13 other lines byte-identical:
```ts
  const theta: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
    callableSet: Object.freeze({ entries: new Map() }),
    ...(imports.length > 0 ? { imports } : {}),
  } as ThetaCompositionInput;
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = deps.bindPromptConversation(bindInput);
```

tests/b0361-case-variant-import-dir-identity.test.ts:140-154 (re-read immediately before filing) — the `createProductionProducerDeps` call:
```ts
  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry: {} as unknown as ModelRegistry,
    resolvePiTool: (name: string): PiToolDispatch => ({
      toolName: name,
      execute: (): Promise<AgentToolResultEnvelope> =>
        Promise.resolve({ content: [{ type: "text", text: "AMBIENT" }] }),
    }),
```

tests/helpers/thetalib-load-harness.ts:225-236 — `bindImportedBody`'s equivalent call: `diff` against the b0361 excerpt directly above shows 8 of 12 lines byte-identical (`createProductionProducerDeps({`, the `pi`/`root`/`checkpoint`/`idSource`/`newInvocationId`/`newToolCallId` block, the closing `} as unknown as RuntimeRoot,`), differing only in `modelRegistry`/`resolvePiTool`, where the helper reuses a parameter and its own module-private `ambientResolvePiTool` (declared once, at thetalib-load-harness.ts:161-167 — not itself exported, so no outside caller could import it even if it wished to) instead of the inline arrow function b0361 retypes with the identical body:
```ts
  const deps = createProductionProducerDeps({
    pi: {} as unknown as ExtensionAPI,
    root: {
      checkpoint: NOOP_CHECKPOINT,
      idSource: {
        newInvocationId: (): string => "inv-1",
        newToolCallId: (): string => "tc-1",
      },
    } as unknown as RuntimeRoot,
    modelRegistry,
    resolvePiTool: ambientResolvePiTool,
  });
```

b0361 also declares its own local `NOOP_CHECKPOINT` (tests/b0361-case-variant-import-dir-identity.test.ts:92-96) byte-identical to the helper's own module-private `NOOP_CHECKPOINT` (tests/helpers/thetalib-load-harness.ts:154-158), and its own `parseApp`/`parse` pair (tests/b0361-case-variant-import-dir-identity.test.ts:84-90) performing the identical `parseThetaDocument` + frontmatter-prepend construction the helper's `bindImportedBody` opens with (thetalib-load-harness.ts:202-211), parameterised only by a caller-supplied `sourcePath` in place of the helper's hardcoded `/proj/app.theta`.

Exact search: `grep -n "createProductionProducerDeps({" tests/b0361-case-variant-import-dir-identity.test.ts tests/helpers/thetalib-load-harness.ts` → one call site in each file, the two compared directly above.

## Why this is a problem
tests/helpers/thetalib-load-harness.ts's own header states that `bindImportedBody` exists because tests/b0303, tests/b0305 and tests/b0306 "each independently redeclared" this exact parse/check/bind sequence, and centralises it "so the three files import it rather than redeclare it" (PTQ-0315). tests/b0361-case-variant-import-dir-identity.test.ts — filed after that helper already existed — reproduces the identical sequence a fourth time: its theta/bindInput/binding-construction block is byte-identical to the helper's bar one load-bearing parameterisation, and its surrounding `createProductionProducerDeps` call, `NOOP_CHECKPOINT`, and parse-and-prepend-frontmatter opening all match the helper's own internal pieces line-for-line apart from inlining values the helper already exposes as a parameter or already carries internally. `bindImportedBody` cannot be called as-is because it hardcodes `fs: fakeThetaLibFs(libs)` where b0361's own header explains at length why a real `PiFileSystem` is mandatory for this bug's witness — so b0361 could not adopt the existing helper without a change to it, and instead retyped the whole surrounding sequence locally.

## Suggested direction (non-binding, optional)
tests/helpers/thetalib-load-harness.ts already centralises every line of this sequence except the filesystem argument `checkThetaImports` is driven over; the natural home for b0361's own copy is that same module, already used by three sibling bug-witness files for the identical sequence.

## False-positive check
- Gate-pin check: tests/b0361-case-variant-import-dir-identity.test.ts does not match `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); the cited lines are harness/driver plumbing, not a pinned count or inventory assertion.
- Recording-double check: `run()` returns a value the test's own `it()` bodies assert on; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0361-case-variant-import-dir-splits-declaring-identity.md Status "fixed (0.353.0)". `npx vitest run tests/b0361-case-variant-import-dir-identity.test.ts` → 5 passed (5) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0361-case-variant-import-dir-identity" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl "b0361-case-variant-import-dir-identity" docs/bugs/*.md` → only its own bug document. This finding proposes no merge, rename or deletion of the file or any `it()`/`describe()` — only that the driver sequence could be imported (with the helper's `fs` argument made substitutable) rather than redeclared — so no citation is affected.
- Overlap check against the already-resolved sibling finding: PTQ-0315 (fixed) covers tests/b0303, tests/b0305 and tests/b0306's redeclaration of this same sequence and resulted in `bindImportedBody`'s creation; that finding's own file list does not include tests/b0361-case-variant-import-dir-identity.test.ts (it was filed against a different wave's six-file scope that did not include b0361), so this finding is not a re-file of PTQ-0315 — it is the same root cause recurring in a file PTQ-0315 never reached, for a reason (the hardcoded fake filesystem) PTQ-0315's fix did not address.
- Coverage check: this finding does not claim a missing test path; every cited function is exercised by b0361's own 5/5 passing tests (confirmed above). The claim is confined to a repeated DEFINITION, not to test behaviour or coverage.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-diffed every cited range (b0361:156-169 vs harness:237-250 differ in exactly 1/14 lines; b0361:140-154 vs harness:225-236 differ only in modelRegistry/resolvePiTool; NOOP_CHECKPOINT and the parse/parseApp opening match the helper's own pieces byte-for-byte), reproduced all cited searches (single createProductionProducerDeps hit per file, 0 coverage-matrix hits, docs/bugs status fixed, vitest 5/5 pass), and confirmed b0361 is not among bindImportedBody's three callers and PTQ-0315's six-file scope never reached it (not a duplicate) — real, mechanically-evidenced D7 boilerplate duplication in tests/ (triage: claude-opus-5)
