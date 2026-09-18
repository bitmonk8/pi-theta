---
id: PTQ-0953
title: The eight-factory-probable-SDK-member ExtensionAPI stub is retyped byte-identically across four bootstrap test files
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/extension-bootstrap-failures.test.ts:212-222
  - tests/extension-bootstrap-production-wiring.test.ts:126-142
  - tests/extension-bootstrap-nonabort.test.ts:389-403
  - tests/extension-bootstrap-sink-liveness.test.ts:162-174
sites: 4
fix_scope: module
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The eight-factory-probable-SDK-member ExtensionAPI stub is retyped byte-identically across four bootstrap test files

## Observation
Each of the four `tests/extension-bootstrap-*.test.ts` files builds its own recording `ExtensionAPI` double that must carry the eight factory-probable SDK members (`registerCommand`, `sendUserMessage`, `registerTool`, `setActiveTools`, `getActiveTools`, `getAllTools`, `registerMessageRenderer`, `sendMessage`) named by capability-probe.md Step 0 (c), so the step-0 probe passes and the test reaches the surface it actually names. In every one of the four builders, the same six member declarations — `getFlag`, `sendUserMessage`, `registerTool`, `setActiveTools`, `getActiveTools`, `getAllTools` — appear with byte-identical text.

## Evidence
`tests/extension-bootstrap-failures.test.ts:212-222` (`makeProductionHost`):
```ts
  const pi = {
    registerFlag: (): void => guard("registerFlag"),
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (event: string): void => guard(`on:${event}`),
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
```

`tests/extension-bootstrap-production-wiring.test.ts:126-142` (`makeRecordingHost`):
```ts
  const surface: Record<string, unknown> = {
    registerFlag: (): void => guard("registerFlag"),
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      // `guard` throws before the handler is stored, so a failing subscription
      // leaves nothing installed for that event.
      guard(`on:${event}`);
      handlers.set(event, handler);
    },
    // The eight factory-probable SDK members (capability-probe.md Step 0 (c)).
    registerCommand: (name: string): void => guard(`registerCommand:${name}`),
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
```

`tests/extension-bootstrap-nonabort.test.ts:389-403` (`makeProductionRendererHost`):
```ts
  const pi = {
    registerFlag: (): void => {
      calls.push("registerFlag");
    },
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (event: string): void => {
      calls.push(`on:${event}`);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
```

`tests/extension-bootstrap-sink-liveness.test.ts:162-174` (`makeHost`):
```ts
  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
```

Search: `grep -n "getFlag: (): undefined => undefined,\|sendUserMessage: (): void => {},\|registerTool: (): void => {},\|setActiveTools: (): void => {},\|getActiveTools: (): readonly unknown\[\] => \[\],\|getAllTools: (): readonly unknown\[\] => \[\]," tests/extension-bootstrap-*.test.ts` returns exactly these four sites (plus one extra `getFlag`/`sendUserMessage` pair inside `extension-bootstrap-nonabort.test.ts`'s separate, non-capability-conformant `makeRecordingPi` builder at lines 121/130, which does not carry the other four members and is not counted as a fifth site of this six-line block).

## Why this is a problem
Six lines of stub-member declarations — asserting nothing themselves, present only so the shipped step-0 capability probe does not refuse the double — are retyped character-for-character in four separate test files instead of living once. `tests/helpers/compose-workspace-harness.ts:76-99` already exports a `makeHost(cwd)` builder whose `pi` object carries this identical six-line block (plus `registerFlag`/`registerCommand`/`registerMessageRenderer`/`sendMessage`) for other composition-root test files, which is the kind of home this block would naturally sit in instead of being retyped per bootstrap file.

## Suggested direction (non-binding, optional)
A shared "conformant SDK member base" object or factory under `tests/helpers/` — potentially the existing `compose-workspace-harness.ts` module — that each bootstrap file's double spreads and then overrides the one or two members its own scenario needs to fault would let all four files stop retyping the same six inert declarations.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double check: the cited six-line block (`getFlag`, `sendUserMessage`, `registerTool`, `setActiveTools`, `getActiveTools`, `getAllTools`) is inert filler present only to satisfy the step-0 probe's member-presence check; none of the four files' assertions read these members' call counts, so this is not a MUST-NOT negative witness.
- docs/bugs/ signature search: `grep -rln "extension-bootstrap-failures\|extension-bootstrap-nonabort\|extension-bootstrap-production-wiring\|extension-bootstrap-sink-liveness" docs/bugs/*.md` hits docs/bugs/0023, 0255, 0323, 0454 — each cites one or more of the four files as a witness suite for a distinct obligation (production wiring, lex double-delivery, probe-failed step, degraded-gate display-false notes); none of those citations pins the six-line stub block as required to diverge per file, and this finding proposes no merge/rename/delete of any test or suite.
- coverage-matrix citation search: `grep -n "extension-bootstrap-failures\|extension-bootstrap-nonabort\|extension-bootstrap-production-wiring\|extension-bootstrap-sink-liveness" docs/reference/coverage-matrix.md` returned no hits — none of the four files is pinned by name there.
- Coverage-drift check: this finding does not claim any path is untested; all four files' distinct behavioural assertions and the throw-configuration/omission logic surrounding the cited block are left untouched — only the six duplicated non-assertion member declarations are cited.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines and a mktemp diff of the six extracted member lines (getFlag/sendUserMessage/registerTool/setActiveTools/getActiveTools/getAllTools) is empty across all four files AND against tests/helpers/compose-workspace-harness.ts:77-86, so the block is byte-identical five ways; the stated grep reproduces (one non-disturbing omission: it also hits a getFlag/sendUserMessage pair at extension-bootstrap-failures.test.ts:65/67 in that file's top makeRecordingPi, which like nonabort:121/130 lacks the other four members and is not a fifth site); docs/spec_topics/pi-integration-contract/capability-probe.md Step 0 (c) does enumerate the eight members (pi.getAllTools at :37); D7 boilerplate-duplication inside tests/ with no carve-out — no gate test, coverage-matrix 0 hits, docs/bugs 0023/0255/0323/0454 cite the files only as witness suites and no merge/rename/delete is proposed, and none of the six stubs is read by any assertion (production-wiring:404 omits getAllTools for a presence-refusal test and sink-liveness:84-93 holds a name roster — both compatible with a spread base); the same block also appears byte-identically in b0435-fallback-diagnostic-reentry and thetalib-reparse-walk-single-delivery but those are already tracked as wholesale makeHost imports (open PTQ-0626/PTQ-0716), and PTQ-0477's triage ruled the bootstrap doubles are diverged option/guard doubles that cannot import makeHost wholesale, so this residual inert slice is the correctly-scoped remainder; not a duplicate — PTQ-0743/0744 cover different helpers (exactlyOne/SUBSCRIPTION_ORDER, captureConsoleError/requireHandler) in these same files and nothing tracks the pi stub slice (triage: claude-fable-5-1)
