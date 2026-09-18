---
id: PTQ-0821
title: subagent-fn-extension-tool-dispatch-e2e.test.ts retypes extension-tool-unreachable-load-refusal-e2e.test.ts's surfaces-absent pi/ctx PIC-64 host fixture
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:254-284
  - tests/extension-tool-unreachable-load-refusal-e2e.test.ts:241-291
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-fn-extension-tool-dispatch-e2e.test.ts retypes extension-tool-unreachable-load-refusal-e2e.test.ts's surfaces-absent pi/ctx PIC-64 host fixture

## Observation
`tests/subagent-fn-extension-tool-dispatch-e2e.test.ts`'s "no-rung" `it()`
constructs a fake `pi`/`ctx` pair modelling a host with no establishable
PIC-64 host-loop-dispatch rung (no `registerProvider`/`unregisterProvider`/
`setModel`), passed directly to `composeExtensionInstance`.
`tests/extension-tool-unreachable-load-refusal-e2e.test.ts`'s `runLoad`
helper builds the identical `pi`/`ctx` shape for its own surfaces-absent
branch (`options?.hostLoopSurfaces` false), member-for-member and value-for-
value identical apart from the `parameters` field on the registered tool and
the two conditional `...` spreads `runLoad` uses to also cover its
surfaces-present and `getToolDefinitionMember` branches. Neither file imports
this fixture from a shared module.

## Evidence
tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:254-284:
```ts
    const pi = {
      getFlag: (): undefined => undefined,
      getCommands: (): readonly unknown[] => [],
      sendMessage: (message: { content?: unknown }): void => {
        if (typeof message.content === "string") {
          noteContent.push(message.content);
        }
      },
      sendUserMessage: (): void => {},
      getActiveTools: (): readonly string[] => [],
      setActiveTools: (): void => {},
      getAllTools: (): readonly unknown[] => [
        { name: "my_tool", parameters: MY_TOOL_SCHEMA, sourceInfo: { scope: "user" } },
      ],
      registerMessageRenderer: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: noRungDir,
      hasUI: true,
      model: { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      isIdle: (): boolean => true,
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [
          { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
        ],
        find: (): undefined => undefined,
      },
      sessionManager: { getEntries: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
```

tests/extension-tool-unreachable-load-refusal-e2e.test.ts:241-291 (re-read
immediately before filing):
```ts
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") {
        noteContent.push(message.content);
      }
    },
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
    getAllTools: (): readonly unknown[] => [
      { name: "my_tool", parameters: {}, sourceInfo: { scope: "user" } },
    ],
    registerMessageRenderer: (): void => {},
    ...(surfaces
      ? {
          registerProvider: (): void => {},
          unregisterProvider: (): void => {},
          setModel: (): Promise<boolean> => Promise.resolve(true),
        }
      : {}),
    ...(options?.getToolDefinitionMember === true
      ? { getToolDefinition: (): undefined => undefined }
      : {}),
    on: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: true,
    model: { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
    isIdle: (): boolean => true,
    modelRegistry: {
      getAvailable: (): readonly unknown[] => [
        { id: "claude-test", provider: "anthropic", api: "anthropic-messages" },
      ],
      find: (): undefined => undefined,
    },
    sessionManager: { getEntries: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
```

With `surfaces` false and `options?.getToolDefinitionMember` unset (the
branch that produces the same no-rung shape the first file hardcodes), the
two `pi` object literals resolve to the identical member set
(`getFlag`/`getCommands`/`sendMessage`/`sendUserMessage`/`getActiveTools`/
`setActiveTools`/`getAllTools`/`registerMessageRenderer`/`on`, each with the
identical body) and the two `ctx` object literals are byte-identical apart
from the `cwd` variable name.

Search performed: `grep -n "hostLoopSurfaces\|no-rung host\|registerProvider.*unregisterProvider.*setModel" tests/helpers/*.ts` → 0 hits; no `tests/helpers/` module exports a PIC-64 host-loop-dispatch fixture builder (the only adjacent helper, `tests/helpers/production-load-harness.ts`'s `runProductionLoad`, builds a narrower `pi`/`ctx` pair with no `getAllTools`/`model`/`modelRegistry.getAvailable` members and is not used by either file).

## Why this is a problem
Both files independently type out the same ~30-line "PIC-64 host with no
establishable dispatch rung" `pi`/`ctx` fixture rather than importing it from
one place. A change to the shape `composeExtensionInstance` reads off `pi`/
`ctx` for this scenario (e.g. a new member the host-loop-dispatch probe
starts reading) must be applied identically in both files to keep the
no-rung branch meaningful in each.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted builder for the PIC-64 host-loop-dispatch `pi`/`ctx`
pair (parameterised by whether the dispatch-rung surfaces and the
`getToolDefinition` member are present, and by the registered tool's
`parameters`) would sit beside `tests/helpers/production-load-harness.ts`,
serving both this no-rung branch and `extension-tool-unreachable-load-refusal-e2e.test.ts`'s surfaces-present/`getToolDefinitionMember` branches from one definition.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; the cited lines are a fake-host fixture, not a pinned count or
  inventory.
- Recording-double check: `noteContent`/`sendMessage` is a positive
  read-back recorder (both files assert on what WAS notified), not a
  "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "subagent-fn-extension-tool-dispatch-e2e\|extension-tool-unreachable-load-refusal-e2e" docs/bugs/*.md` → hits in 0183/0207/0240/0474, all citing these files as witnesses for unrelated comment-naming/control-plane bugs, none marking this fixture object itself as a documented correct-reason red or excusing its duplication.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-fn-extension-tool-dispatch-e2e\|extension-tool-unreachable-load-refusal-e2e" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the shared fixture shape could be imported once.
- Coverage check: the claim is about a repeated fixture DEFINITION; each file's own suite already exercises its own copy, so this is not a coverage-gap claim.
- Distinct from PTQ-0681: PTQ-0681 (open, prior wave) covers the `FakeParentHost` PARENT-leg adapter class shared between `subagent-fn-extension-tool-dispatch-e2e.test.ts` and `prompt-mode-extension-tool-reach-e2e.test.ts`; this finding's cited lines are the separate NO-RUNG-leg `pi`/`ctx` literal shared with a third, different file (`extension-tool-unreachable-load-refusal-e2e.test.ts`), a disjoint code block and file pair.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:254-284 and tests/extension-tool-unreachable-load-refusal-e2e.test.ts:241-291; sed-extracted both blocks, stripped the second copy's comments and its two conditional `...` spreads, normalised `parameters: {}`→`MY_TOOL_SCHEMA` and `cwd`→`cwd: noRungDir` → zero diff; both copies live (`composeExtensionInstance(pi, ctx, …)` at :286/:312, `runLoad` 18 call sites, 8 with `hostLoopSurfaces: false`); the `my_tool`/`getAllTools` fake-host shape greps to exactly these two files (sites: 2 accurate); no tests/helpers module exports a `pi`/`ctx` builder with the registered tool, `ctx.model`, and rung-surface toggle (compose-workspace/fixture-dispatch/subagent-fn-child-regime/production-load-harness all checked — the filing's aside that production-load-harness lacks `modelRegistry.getAvailable` is wrong at :72 but immaterial, it still lacks `getAllTools`/`model`); both under tests/, D7 copy-paste-fixture class, no gate/recording-double/red-test carve-out, docs/bugs 0183/0207/0240/0474 and 0 coverage-matrix hits reproduce, no merge/rename/delete proposed; not tracked — PTQ-0681 covers the disjoint `FakeParentHost` class at :87-199 with a different partner file, PTQ-0570/0328/0343 (resolved) concern other doubles, same-wave d7-02/d7-03 cite different helpers (triage: claude-fable-5-1)
