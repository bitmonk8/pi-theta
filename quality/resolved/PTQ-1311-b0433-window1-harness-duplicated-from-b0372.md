---
id: PTQ-1311
title: b0433's window-1 InstantSettleSession/RestoreThrowingGate/driveQuery harness is a near-identical copy of b0372's own harness
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0433-active-set-advisory-note-no-details.test.ts:174-372
  - tests/b0372-active-set-restore-protocol.test.ts:295-430
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# b0433's window-1 InstantSettleSession/RestoreThrowingGate/driveQuery harness is a near-identical copy of b0372's own harness

## Observation
tests/b0433-active-set-advisory-note-no-details.test.ts declares its own `RestoreThrowingGate`, `InstantSettleSession`, `parse`, `rootDouble`, `piDouble`, `ctxDouble`, and `driveQueryRestoreThrow` (lines 174-372) to drive one production prompt-mode query window. The file's own header comment (lines 116-125) states this is a reuse: "Reuses the `InstantSettleSession` + `driveQuery` window-1 harness of tests/b0372-active-set-restore-protocol.test.ts, but the `sendMessage` capture records `details` too." tests/b0372-active-set-restore-protocol.test.ts already declares the equivalent `InstantSettleSession` (295-337), `rootDouble` (359-361), `piDouble` (363-373), `ctxDouble` (375-388), `parse` (350-357), and `driveQuery` (403-430+) to drive the same window. The two harnesses are structurally identical (same fields, same method bodies, same session/gate/root/pi/ctx wiring), diverging only in the gate's fixed double-throw behaviour and one extra field captured on `sendMessage`.

## Evidence
tests/b0433-active-set-advisory-note-no-details.test.ts:230-277 (`InstantSettleSession`):
```
class InstantSettleSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly wire: WireMessage[] = [];

  constructor(readonly reply: string) {}

  sendUserMessage(text: string): void {
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  isIdle(): boolean {
    return true;
  }
  ...
  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
```

tests/b0372-active-set-restore-protocol.test.ts:295-330 (`InstantSettleSession`):
```
class InstantSettleSession {
  readonly entries: SessionEntryDouble[] = [];
  readonly notes: RecordedNote[] = [];

  constructor(readonly reply: string) {}

  sendUserMessage(text: string): void {
    this.#appendUser(text);
    this.#appendAssistant(this.reply);
  }

  isIdle(): boolean {
    return true;
  }
  ...
  #appendUser(text: string): void {
    this.#append({ role: "user", content: [{ type: "text", text }], timestamp: 0 });
  }

  #appendAssistant(text: string): void {
    this.#append({
```

tests/b0433-active-set-advisory-note-no-details.test.ts:305-343 (`piDouble`/`ctxDouble`/`driveQueryRestoreThrow` signature) vs tests/b0372-active-set-restore-protocol.test.ts:363-388 (`piDouble`/`ctxDouble`), same field shapes:
```
function piDouble(session: InstantSettleSession, gate: RestoreThrowingGate): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => gate.getActiveTools(),
    setActiveTools: (names: string[]): void => gate.setActiveTools(names),
    registerTool: (): void => {},
    on: (): void => {},
```
```
function piDouble(session: InstantSettleSession, gate: RecordingActiveSet): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => gate.getActiveTools(),
    setActiveTools: (names: string[]): void => gate.setActiveTools(names),
    registerTool: (): void => {},
    on: (): void => {},
```

`ctxDouble` bodies are byte-identical in both files (b0433:321-331, b0372:375-388):
```
function ctxDouble(session: InstantSettleSession): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
      getBranch: (): readonly SessionEntryDouble[] => sessionBranch(session.entries),
    },
  } as unknown as ExtensionCommandContext;
}
```

## Why this is a problem
The class and its four companion functions (`rootDouble`, `piDouble`, `ctxDouble`, `parse`/`driveQuery`) are re-declared in b0433 with the same field names, method bodies, and wiring order as the same-named declarations in b0372, and the b0433 file's own comment (lines 116-125, 213-216) names b0372 as the harness it is reusing rather than sharing. Every future change to this window's wiring (e.g. how `sendMessage`/`sessionManager`/`clock` fields are shaped) must be applied in both files by hand or they silently drift apart — the harness exists as source text in two places, not as one shared definition.

## Suggested direction (non-binding, optional)
The window-1 production-query drive (`InstantSettleSession` + `rootDouble`/`piDouble`/`ctxDouble`/`driveQuery`) is a candidate for a shared file under tests/helpers/, parameterised over the gate double, so both b0372 and b0433 (and any later active-set-restore witness) call one definition instead of each carrying its own copy.

## False-positive check
Gate-pin carve-out: neither file matches `*gate*.test.ts`; not applicable. Recording-double carve-out: `InstantSettleSession`/`RestoreThrowingGate` record calls for setup purposes (driving the window), not as MUST-NOT witnesses over a call history, so the negative-witness carve-out does not apply here — this finding is about the harness's static duplication, not about any assertion being unfalsifiable. docs/bugs/ search: bug 0433's own doc and the b0433 test's header cite bug 0372 as the harness source explicitly (confirmed by reading both files); this is an acknowledged copy, not a documented correct-reason red. Coverage-matrix/bug-doc citation search: grepped docs/reference/coverage-matrix.md and found no citation of either file's harness functions by name (only test titles would be cited, and none of `InstantSettleSession`/`rootDouble`/`piDouble`/`ctxDouble`/`driveQuery` are referenced there), so no citing document blocks a merge-direction observation. This finding does not propose a coverage change — both tests keep asserting what they assert; only the duplicated harness code is observed.

## Triage
verdict: confirmed — independently re-verified: every excerpt reproduces at the cited lines (b0433:113-124 header "Reuses the `InstantSettleSession` + `driveQuery` window-1 harness of tests/b0372-…", 230-277 `InstantSettleSession`, 305-331 `piDouble`/`ctxDouble`, 333-372 `QueryDriveResult`/`driveQueryRestoreThrow`; b0372:295-337 `InstantSettleSession`, 363-388 `piDouble`/`ctxDouble`, 390-459 `QueryDriveResult`/`driveQuery`), plus the same `ANTHROPIC_MODEL`/`QUERY_SNAPSHOT`/`QUERY_REPLY`/`ONE_QUERY_THETA` constants and `SessionEntryDouble` interface in both; `ctxDouble` and the `#appendUser`/`#appendAssistant`/`#append` bodies are byte-identical, `piDouble`/`driveQuery` differ only in the gate type and the `details` field on the sendMessage capture — D7 copy-paste-fixture class, both files under tests/, both live and green (vitest 9/9); stated searches reproduce (coverage-matrix cites of either file or harness name → 0; docs/bugs/0433 names b0372 as the harness source at :117/:170), not a `*gate*` file, doubles drive positive assertions not negative witnesses, no merge/rename/delete of a test proposed; not a duplicate — PTQ-0534 (b0372 rootDouble vs belt harness), PTQ-0993 (b0433 parseDeps) and PTQ-0828 (the ActiveSet gate doubles) each covered a different member of these files, none the InstantSettleSession/piDouble/ctxDouble/driveQuery window drive, and REVIEW_LOG shard-03/shard-07 explicitly left this pair unfiled; two corrections on record: post-PTQ-0534 b0372's `rootDouble` (359-361) is now `{...beltRootDouble(), schemaValidator: ajv()}` so b0433's hand-inlined `rootDouble` (287-303) is a not-migrated residual of that class rather than a same-body copy of b0372's, and post-PTQ-0993 `parse` differs (b0433 wraps `parseDoc`, b0372 still wraps `parseThetaDocument` + local `parseDeps`) — the dedupe target is the session/pi/ctx/drive quartet parameterised over the gate, as the direction says (triage: claude-fable-5-1)
