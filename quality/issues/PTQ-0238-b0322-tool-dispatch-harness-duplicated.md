---
id: PTQ-0238
title: b0322's code-side tool-call harness (span/objArg/rootDouble/runBody/errOf/builtinEntry) duplicates tests/tool-arg-runtime-schema-validation.test.ts near-verbatim
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0322-unknown-tool-dispatch-safety-net.test.ts:61-229
  - tests/tool-arg-runtime-schema-validation.test.ts:227-411
  - tests/prompt-mode-extension-tool-dispatch.test.ts:62-110
sites: 3
fix_scope: cross-module       # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0322's code-side tool-call harness duplicates tests/tool-arg-runtime-schema-validation.test.ts near-verbatim

## Observation
tests/b0322-unknown-tool-dispatch-safety-net.test.ts's own header names its
harness section "Harness — mirrors tests/tool-arg-runtime-schema-validation.test.ts."
Reading both files confirms the admission mechanically: `span`, `numExpr`,
`strExpr`, `objArg`, `callExpr`, `body`, `NOOP_CHECKPOINT`, `rootDouble`,
`ctxDouble`, `snapshot`, `thetaWithSet`, `runBody`, `errOf`, and `builtinEntry`
are declared in both files with identical or near-identical bodies (only
`ProducerOpts`/`producer` differ, by the one extra `subagentRootRegime` field
b0322's cell (D) needs, and `READ_SCHEMA` differs by one extra `offset`
property the other file's case D2 needs). A third file,
tests/prompt-mode-extension-tool-dispatch.test.ts, carries the overlapping
subset (`span`/`strExpr`/`numExpr`/`objArg`/`callExpr`/`body`/
`NOOP_CHECKPOINT`/`rootDouble`/`ctxDouble`/`snapshot`/`thetaWithSet`/
`producer`) under its own header comment "mirrors
callable-set-runtime-enforcement.test.ts" (a fourth file, whose `objArg` has
since diverged to a different two-string-argument signature). No
tests/helpers/ module exports this AST-node-builder-plus-production-tool-
dispatch-harness shape.

## Evidence
tests/b0322-unknown-tool-dispatch-safety-net.test.ts:61-71 (header admission,
then the first two AST-node builders):
```ts
// ---------------------------------------------------------------------------
// Harness — mirrors tests/tool-arg-runtime-schema-validation.test.ts.
// ---------------------------------------------------------------------------

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}
```

tests/tool-arg-runtime-schema-validation.test.ts:227-233 (byte-identical
apart from the absent mirror comment, which lives at this file's own line 62
"(b) + (c) Pre-dispatch enforcement at the real `#resolveToolCall`."):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}
```

tests/b0322-unknown-tool-dispatch-safety-net.test.ts:73-85 (`strExpr` +
`objArg`):
```ts
function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

/** The single bare object-literal argument a code-driven Pi-tool call takes. */
function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}
```

tests/tool-arg-runtime-schema-validation.test.ts:235-247 (byte-identical):
```ts
function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

/** The single bare object-literal argument a code-driven Pi-tool call takes. */
function objArg(fields: Readonly<Record<string, Expr>>): ObjectExpr {
  return {
    kind: "object",
    typeName: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
    range: span(),
  };
}
```

tests/b0322-unknown-tool-dispatch-safety-net.test.ts:107-120 (`rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
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
```

tests/tool-arg-runtime-schema-validation.test.ts:278-291 (byte-identical):
```ts
function rootDouble(): RuntimeRoot {
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
```

tests/b0322-unknown-tool-dispatch-safety-net.test.ts:174-186 (`runBody`):
```ts
async function runBody(
  deps: ReturnType<typeof producer>,
  input: ThetaCompositionInput,
): Promise<ThetaValue> {
  const bindInput: ConversationBindInput = { theta: input, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(input.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}
```

tests/tool-arg-runtime-schema-validation.test.ts:343-355 (byte-identical):
```ts
async function runBody(
  deps: ReturnType<typeof producer>,
  input: ThetaCompositionInput,
): Promise<ThetaValue> {
  const bindInput: ConversationBindInput = { theta: input, args: "", ctx: ctxDouble() };
  const binding = deps.bindPromptConversation(bindInput);
  const execution = await executeBody(input.body, binding.executeDeps);
  const outer = execution.result;
  if (!outer.present || outer.value === undefined) {
    throw new Error("body produced no final value");
  }
  return outer.value;
}
```

tests/b0322-unknown-tool-dispatch-safety-net.test.ts:213-227 (`builtinEntry`,
truncated one closing brace short of :229 to hold the 15-line excerpt cap):
```ts
function builtinEntry(
  toolName: string,
  parameters: unknown,
  record: { dispatched: boolean },
): ResolvedCallable {
  return {
    kind: "pi-tool",
    toolDefinition: {
      toolName,
      parameters,
      execute: (): Promise<AgentToolResultEnvelope> => {
        record.dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
      },
    },
```

tests/tool-arg-runtime-schema-validation.test.ts:376-390 (byte-identical over
the same truncation):
```ts
function builtinEntry(
  toolName: string,
  parameters: unknown,
  record: { dispatched: boolean },
): ResolvedCallable {
  return {
    kind: "pi-tool",
    toolDefinition: {
      toolName,
      parameters,
      execute: (): Promise<AgentToolResultEnvelope> => {
        record.dispatched = true;
        return Promise.resolve({ content: [{ type: "text", text: "TOOL-RAN" }] });
      },
    },
```

tests/prompt-mode-extension-tool-dispatch.test.ts:62-76 (a third file, the
overlapping subset, with its own header naming a fourth sibling):
```ts
// --- AST + double helpers (mirrors callable-set-runtime-enforcement.test.ts) --

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function strExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function numExpr(n: number): Expr {
  return { kind: "number", text: String(n), numericType: "integer", range: span() };
}

/** A single object-literal argument `{ ... }` (the tool-call convention). */
```

Pattern-wide search: `grep -rl "function objArg(fields: Readonly<Record<string,
Expr>>): ObjectExpr" tests/` → exactly 3 hits (the three files above);
`grep -rl "function builtinEntry(" tests/` → exactly 2 hits (b0322 and
tests/tool-arg-runtime-schema-validation.test.ts). `errOf` also matches
body-for-body between b0322:189-199 and tests/tool-arg-runtime-schema-validation.test.ts:395-405,
save that the latter writes the same return-type object on one long line
where b0322 wraps it across several — a formatting difference, not a
behavioural one.

## Why this is a problem
The same AST-node-builder-plus-production-harness — every piece needed to
hand-build a code-side Pi-tool call, wire it into a frozen
`CallableSetSnapshot`, and drive it through the real
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
path — is authored twice, near byte-for-byte, with the newer file's own
header naming the older one as the mirror. tests/prompt-mode-extension-tool-dispatch.test.ts
shows the same convergent shape recurring a third time (itself citing a
fourth, now-diverged, sibling). None of the three files import a shared
module for any of it; tests/helpers/call-with-clause-harness.ts (the nearest
existing harness of this general kind) builds a different, RFC-0009-specific
set of AST nodes and exports no `objArg`/`builtinEntry`/`errOf` of this
shape.

## Suggested direction (non-binding, optional)
The AST-node builders (`span`/`numExpr`/`strExpr`/`objArg`/`callExpr`/`body`),
`NOOP_CHECKPOINT`, `snapshot`, and `thetaWithSet` are identical across all
three files with no cell-specific variation; a tests/helpers/ module — the
convention `compose-workspace-harness.ts`, `load-row-harness.ts`, and
`registry-oracle.ts` already follow for other repeated harness families — is
the kind of home the suite already uses for exactly this shape of
duplication.

## False-positive check
- Gate-pin: none of the three cited files match `*gate*.test.ts` or the named
  kin; not applicable.
- Recording-double: `builtinEntry`'s `record.dispatched` flag backs a
  legitimate MUST/MUST-NOT-run witness inside each file's own tests, but this
  finding does not dispute any assertion built on it — it claims the
  double-constructing FUNCTION's definition is duplicated across files, a
  distinct claim the negative-witness carve-out does not cover.
- docs/bugs/ signature search: docs/bugs/0322-unknown-tool-cause-no-producer.md
  — Status "fixed (0.346.0)"; docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md
  (tests/tool-arg-runtime-schema-validation.test.ts's own bug) — Status "fixed
  (0.65.0)". `npx vitest run tests/b0322-unknown-tool-dispatch-safety-net.test.ts
  tests/tool-arg-runtime-schema-validation.test.ts
  tests/prompt-mode-extension-tool-dispatch.test.ts` passes 21/21 at HEAD, so
  this is not a documented correct-reason red; neither bug document offers a
  rationale against sharing the harness.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0322-unknown-tool-dispatch-safety-net\|tool-arg-runtime-schema-validation\|prompt-mode-extension-tool-dispatch"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any of the three files or their `it()`/
  `describe()` blocks — only that the shared harness pieces could be
  imported from one module rather than redeclared in each — so no citation is
  affected.
- Coverage check: the claim is about a repeated harness DEFINITION; every
  duplicated function is exercised by the tests in its own file (21/21
  passing, confirmed above), so no coverage claim is made.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt reproduces verbatim at the cited lines (span/numExpr/strExpr/objArg/rootDouble/runBody/errOf/builtinEntry byte-identical between b0322 and tool-arg-runtime-schema-validation.test.ts, differing only by producer's one extra subagentRootRegime field and READ_SCHEMA's one extra offset property; the third file's overlapping subset and the fourth file's diverged two-string objArg both check out), the objArg-signature (3) and builtinEntry (2) pattern-search counts reproduce exactly, tests/helpers/call-with-clause-harness.ts is confirmed to export a differently-shaped rootDouble (no schemaValidator) and none of objArg/builtinEntry/errOf, both bug docs are fixed with the cited run at 21/21, coverage-matrix has 0 hits, and no tracked PTQ cites these three files — a distinct, well-anchored D7 boilerplate-duplication finding (triage: claude-opus-5)
