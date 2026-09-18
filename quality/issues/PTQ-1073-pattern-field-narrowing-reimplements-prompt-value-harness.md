---
id: PTQ-1073
title: pattern-field-literal-integer-narrowing-refusal.test.ts reimplements createParsedPromptHarness inline instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/pattern-field-literal-integer-narrowing-refusal.test.ts:385-436
  - tests/helpers/prompt-value-harness.ts:63-86
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:648
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# pattern-field-literal-integer-narrowing-refusal.test.ts reimplements createParsedPromptHarness inline instead of importing it

## Observation
`tests/helpers/prompt-value-harness.ts` exports `createParsedPromptHarness(bugTag, sourcePath)`, which returns an `{ execute, expectValue }` pair: `execute` builds a `ThetaCompositionInput` from an already-parsed `ThetaDocument`, binds it through `producer().bindPromptConversation`, and runs `executeBody`; `expectValue` awaits `execute` and asserts `outcome === "success"` then the returned value. `tests/pattern-field-literal-integer-narrowing-refusal.test.ts` does not import this module. It declares its own module-scope `NOOP_CHECKPOINT`, `rootDouble()`, `producer()`, `execute(doc)` and `expectValue(doc, value, why)`, whose bodies perform the identical sequence — same inert `pi` shape, same `bindPromptConversation` call, same `executeBody` call, same two-assertion `expectValue` — under the fixed strings `"bug0234"` / `"/bug0234-cells.theta"` in place of the harness's `bugTag` / `sourcePath` parameters. The sibling file in this same review's scope, `tests/reserved-keyword-object-pattern-head-refusal.test.ts`, imports `createParsedPromptHarness` at its own line 1 and obtains the identical `{ execute, expectValue }` pair from it at line 648 with one call: `createParsedPromptHarness("bug0219", "/theta/bug0219.theta")`.

## Evidence
`tests/pattern-field-literal-integer-narrowing-refusal.test.ts:385-436` (re-read immediately before filing):
```ts
const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer(): ReturnType<typeof createProductionProducerDeps> {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
}

async function execute(doc: ThetaDocument): Promise<BodyExecution> {
  const input: ThetaCompositionInput = {
    slashName: "bug0234",
    sourcePath: "/bug0234-cells.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta: input,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  return executeBody(input.body, binding.executeDeps);
}

async function expectValue(
  doc: ThetaDocument,
  value: ThetaValue,
  why: string,
): Promise<void> {
  const execution = await execute(doc);
  expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
  expect(execution.result.value, why).toEqual(value);
}
```

`tests/helpers/prompt-value-harness.ts:63-86` (the canonical export, re-read immediately before filing):
```ts
export function createParsedPromptHarness(bugTag: string, sourcePath: string) {
  async function execute(doc: ThetaDocument): Promise<BodyExecution> {
    const input: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    return bindAndExecute(producer(), input, {} as unknown as ExtensionCommandContext);
  }

  /** Assert the value an already-parsed body evaluates to. */
  async function expectValue(
    doc: ThetaDocument,
    value: ThetaValue,
    why: string,
  ): Promise<void> {
    const execution = await execute(doc);
    expect(execution.outcome, `${why}: the body reaches a value`).toBe("success");
    expect(execution.result.value, why).toEqual(value);
  }

  return { execute, expectValue };
}
```

`tests/reserved-keyword-object-pattern-head-refusal.test.ts:1,648` (the sibling in-scope file's use of the same helper for the same shape of witness):
```ts
import { createParsedPromptHarness } from "./helpers/prompt-value-harness";
...
const { execute, expectValue } = createParsedPromptHarness("bug0219", "/theta/bug0219.theta");
```

Search: `grep -n "createParsedPromptHarness\|createProductionProducerDeps" tests/pattern-field-literal-integer-narrowing-refusal.test.ts` shows the file imports `createProductionProducerDeps` directly (line 27) and never references `createParsedPromptHarness` or `./helpers/prompt-value-harness` anywhere in the file (0 hits for either string).

## Why this is a problem
`bindAndExecute`'s internals — the `ConversationBindInput` assembly, the `producer().bindPromptConversation` call, and the `executeBody` call — and the two-assertion `expectValue` body are restated character-for-character in this file under a fixture-specific `bugTag`/`sourcePath` pair the harness's own parameters already carry. The sibling file reviewed in this same wave demonstrates the one-line replacement (`createParsedPromptHarness("bug0219", "/theta/bug0219.theta")`) is sufficient for the identical witness shape, so the in-scope file's ~52-line restatement carries no fixture-specific behaviour the parameterised export does not already supply.

## Suggested direction (non-binding, optional)
Replacing lines 385-436 with `const { execute, expectValue } = createParsedPromptHarness("bug0234", "/bug0234-cells.theta");` (as the sibling file already does) would let the local `NOOP_CHECKPOINT`/`rootDouble`/`producer`/`execute`/`expectValue` declarations drop.

## False-positive check
- Gate-pin check: the file name matches none of `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `NOOP_CHECKPOINT`/`rootDouble` are inert doubles, not recording doubles asserting a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rl "pattern-field-literal-integer-narrowing-refusal" docs/bugs` → `docs/bugs/0234-pattern-field-literal-integer-narrowing-deferred.md` cites this file as its own witness, not as a documented correct-reason red for the harness code itself; the bug document does not describe or license this reimplementation.
- coverage-matrix citation search: `grep -n "pattern-field-literal-integer-narrowing-refusal" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename or deletion of any test, only a call-site substitution, so the citation question does not bind here regardless.
- Confirmed the canonical helper is a real, already-consumed export (not a dead or unreferenced module) via the sibling in-scope file's live import and call at line 648.

## Triage
verdict: confirmed — independently re-verified: the NOOP_CHECKPOINT/rootDouble/producer/execute/expectValue block reproduces verbatim at tests/pattern-field-literal-integer-narrowing-refusal.test.ts:385-436 and createParsedPromptHarness at tests/helpers/prompt-value-harness.ts:63-86; the file imports createProductionProducerDeps directly (line 27) and never references createParsedPromptHarness or prompt-value-harness (0 hits), while the helper is live in three siblings (reserved-keyword-object-pattern-head-refusal:1,648; object-pattern-head-field-set-refusal:3,399; object-pattern-head-unresolved-refusal:3,360); the canonical composition is shape-equivalent (noopPi() = same sendMessage/getActiveTools/setActiveTools triple, rootWith(SEAM_NOOP_CHECKPOINT) = same checkpoint + inv-1/tc-1 idSource, bindAndExecute = same ConversationBindInput→bindPromptConversation→executeBody sequence, identical two-assertion expectValue) and the three in-file call sites (:456, :467, :616) use the same signatures, so the swap is mechanical; git history shows commit 93ed4e00 (the PTQ-0646 fix) minted the helper and migrated the three siblings' runtime harness but left this file's, and no open/resolved row cites this file's :385-436 (PTQ-0209 resolved on a disjoint 4-file set; PTQ-0846 = blockexpr-production only; PTQ-0883 = member-access-declared-field-type only; PTQ-0498/0646/0226 cite other ranges of this file; same-wave d7-02 is the theta()/expectDiagnostics trio, a distinct root cause); no carve-out binds (not a gate file, inert not recording doubles, docs/bugs/0234 cites the file as witness not this scaffold, coverage-matrix 0 hits) — D7 boilerplate-duplication in tests/ only (triage: claude-fable-5-1)
