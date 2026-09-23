---
id: PTQ-1407
title: tools-entry-closed-grammar-lockstep.test.ts hand-rolls NOOP_CHECKPOINT/rootDouble/ctxDouble instead of importing tests/helpers/tool-call-dispatch-harness.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-closed-grammar-lockstep.test.ts:247-263
  - tests/helpers/tool-call-dispatch-harness.ts:122-146
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tools-entry-closed-grammar-lockstep.test.ts hand-rolls NOOP_CHECKPOINT/rootDouble/ctxDouble instead of importing tests/helpers/tool-call-dispatch-harness.ts

## Observation
`tools-entry-closed-grammar-lockstep.test.ts` declares a module-local
`NOOP_CHECKPOINT`, `rootDouble()` and `ctxDouble()` (lines 247-263) that
construct a `RuntimeRoot`/`ExtensionCommandContext` double for driving
`createProductionProducerDeps(...).bindPromptConversation`. The same file's
own sibling in this review scope, `tool-arg-shape-enforcement.test.ts`,
already imports `bind, recordingPiTool, snapshot, thetaWithSet` from
`tests/helpers/tool-call-dispatch-harness.ts`, which exports a
`NOOP_CHECKPOINT`, `rootDouble()` and `ctxDouble()` of the identical shape
(same `idSource` sentinel IDs `"inv-1"`/`"tc-1"`, same checkpoint no-op, same
empty-object `ExtensionCommandContext` cast).

## Evidence

`tests/tools-entry-closed-grammar-lockstep.test.ts:247-263`:
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
    clock: { wallNow: () => 0 },
  } as unknown as RuntimeRoot;
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

`tests/helpers/tool-call-dispatch-harness.ts:122-146` (the canonical helper,
already imported by another file in this same review scope):
```ts
export { NOOP_CHECKPOINT };

/**
 * A `RuntimeRoot` double exposing the members the code-side tool-call path
 * reads. `schemaValidator` is the REAL AJV-backed seam so a snapshot entry
 * that carries a schema validates through the production validator rather
 * than a fake's.
 */
export function rootDouble(): RuntimeRoot {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return {
    checkpoint: NOOP_CHECKPOINT,
    schemaValidator: new AjvSchemaValidator({ emit: (): void => {}, slugOf }),
    idSource: {
      newInvocationId: () => "inv-1",
      newToolCallId: () => "tc-1",
    },
  } as unknown as RuntimeRoot;
}

export function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}
```

`tests/tool-arg-shape-enforcement.test.ts:4` (the sibling in this same review
scope that already imports the canonical module):
```ts
import { bind, recordingPiTool, snapshot, thetaWithSet } from "./helpers/tool-call-dispatch-harness";
```

Both `idSource` sentinel closures (`newInvocationId: () => "inv-1"`,
`newToolCallId: () => "tc-1"`) and both `NOOP_CHECKPOINT`/checkpoint-double
shapes are the same construction, re-derived instead of imported. (Six other
`tests/helpers/*.ts` files independently carry the same `"inv-1"`/`"tc-1"`
idSource literal — `call-with-clause-harness.ts`, `parent-producer-harness.ts`,
`scripted-live-session-harness.ts`, `subagent-fn-child-regime.ts`,
`thetalib-load-harness.ts`, `tool-call-dispatch-harness.ts` — confirming this
is an established, already-canonicalised fixture rather than an ad hoc value.)

## Why this is a problem
The exact harness this file needs (a `RuntimeRoot` double wired for
`createProductionProducerDeps`, plus a matching `ExtensionCommandContext`
double) is exported by name from `tests/helpers/tool-call-dispatch-harness.ts`
and is already imported into this review scope by
`tool-arg-shape-enforcement.test.ts`. `tools-entry-closed-grammar-lockstep.test.ts`
re-derives the same construction locally instead, so the two files'
`RuntimeRoot`/`ExtensionCommandContext` doubles can drift out of step with no
compiler or test signal tying them together.

## Suggested direction (non-binding, optional)
Import `rootDouble`/`ctxDouble`/`NOOP_CHECKPOINT` from
`tests/helpers/tool-call-dispatch-harness.ts` rather than re-declaring them
locally.

## False-positive check
- Gate-pin check: the file is not `*gate*.test.ts` or a census/pin-count
  test; not applicable.
- Recording-double check: `rootDouble`/`ctxDouble` are plain value doubles,
  not negative-witness recording fakes; the carve-out for MUST-NOT witnesses
  does not apply.
- docs/bugs/ signature search: `grep -ril "rootDouble\|ctxDouble" docs/bugs/`
  returned no hits; this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search:
  `grep -n "tools-entry-closed-grammar-lockstep" docs/reference/coverage-matrix.md`
  and a scan of `docs/bugs/*.md` for this test file's name returned no hits —
  the file is not pinned by name in either, so no rename/merge citation
  obligation applies (and this finding proposes no rename/merge in any case).
- Not a coverage claim: this finding is about an existing local
  reimplementation of an existing, already-imported-in-scope helper, not
  about a missing test.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — excerpts match at tests/tools-entry-closed-grammar-lockstep.test.ts:247-263 and tests/helpers/tool-call-dispatch-harness.ts:122-146; the canonical module exports NOOP_CHECKPOINT/rootDouble/ctxDouble and is already imported by scope-sibling tool-arg-shape-enforcement.test.ts:4; the local double's only divergences are inert on the path this file drives (its extra `clock.wallNow` is read only at production-theta-producer.ts:1665/1894/3961 — slash-entry note, top-level Err note, typed-query event — none reachable via bindPromptConversation→executeBody, and its missing `schemaValidator` is what the canonical adds), so the copy is a copy-paste double not a purpose-varied fake; not a gate/census test, not a recording negative-witness, not cited by coverage-matrix.md, and the one docs/bugs hit for rootDouble (0172) does not cite this file; not a duplicate — PTQ-0998/0936/1236 on this file cover parseDeps/readFileSync/toolCallableName, and PTQ-0873/1005/1090/0603 target other files (triage: claude-fable-5-1)
