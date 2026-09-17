---
id: PTQ-0477
title: lex-drop-single-delivery.test.ts redeclares extension-bootstrap-sink-liveness.test.ts's makeHost/plant-theta harness rather than sharing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/lex-drop-single-delivery.test.ts:169-249
  - tests/extension-bootstrap-sink-liveness.test.ts:151-233
  - tests/extension-bootstrap-sink-liveness.test.ts:734-757
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# lex-drop-single-delivery.test.ts redeclares extension-bootstrap-sink-liveness.test.ts's makeHost/plant-theta harness rather than sharing it

## Observation
tests/lex-drop-single-delivery.test.ts declares its own `HostDouble`
interface, `makeHost(cwd)` function, `ComposeWorkspace` interface, and
`plantTheta(stem, body)` function to drive `composeExtensionInstance` over a
temp-directory workspace. Its own header comment states these doubles are
"MODELLED ON (duplicated from, not shared with)
tests/extension-bootstrap-sink-liveness.test.ts — `makeHost` (:186–251) and
`plantMalformedTheta` (:741–757)". That file declares the structurally
identical `HostDouble` shape, the identical `pi`/`ctx` stub-method roster, and
the identical "mkdtemp → mkdir .pi/theta → writeFileSync the fixture →
writeFileSync a minimal settings.json → return { cwd, dispose }" plant
sequence.

## Evidence
tests/lex-drop-single-delivery.test.ts:178-221 (`makeHost`):
```ts
function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

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
    registerMessageRenderer: (): void => {},
    sendMessage: (message: {
      customType: string;
      content: string;
      details: unknown;
    }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;
```

tests/extension-bootstrap-sink-liveness.test.ts:186-206 (the counterpart —
same stub roster, same `pi`/`ctx` shape, differing only in the extra
`sendAttempts`/`invalidated`/`sendThrows` instrumentation this file's own
tier-selection tests need):
```ts
function makeHost(options: HostOptions = {}): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();
  let sendAttempts = 0;
  let notifyAttempts = 0;

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
    registerMessageRenderer: (): void => {},
```

tests/lex-drop-single-delivery.test.ts:245-257 (`plantTheta`):
```ts
function plantTheta(stem: string, body: string): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-b0255-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  const thetaPath = join(cwd, ".pi", "theta", `${stem}.theta`);
  writeFileSync(thetaPath, `${FM}${body}\n`, "utf8");
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    thetaPath: normalisePath(thetaPath),
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

tests/extension-bootstrap-sink-liveness.test.ts:741-753 (`plantMalformedTheta`
— the same mkdtemp/mkdir/write-fixture/write-settings/return-dispose
sequence, same comment about the settings-file plant being hermeticity):
```ts
function plantMalformedTheta(): ComposeWorkspace {
  const cwd = mkdtempSync(join(tmpdir(), "theta-0023-gate-"));
  mkdirSync(join(cwd, ".pi", "theta"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "theta", "malformed-0023.theta"),
    BLOCK_COMMENT_THETA,
    "utf8",
  );
  // A minimal valid settings file pins the fixture's settings read to a known
  // value. An ABSENT settings file is silent (package-and-settings.md
  // §Failure modes), so the plant is hermeticity, not noise suppression.
  writeFileSync(join(cwd, ".pi", "settings.json"), "{}", "utf8");
  return {
    cwd,
    dispose: (): void => rmSync(cwd, { recursive: true, force: true }),
  };
}
```

Both files' own `ComposeWorkspace` interfaces are also identical apart from
`lex-drop-single-delivery.test.ts` adding the `thetaPath` field
(lex-drop-single-delivery.test.ts:226-236 vs.
extension-bootstrap-sink-liveness.test.ts:734-736), and the "even the
same one-sentence settings-file comment" wording is byte-identical between
the two `plant*` functions.

## Why this is a problem
tests/lex-drop-single-delivery.test.ts's own header comment names the exact
lines of tests/extension-bootstrap-sink-liveness.test.ts it copied
(`makeHost` `:186–251`, `plantMalformedTheta` `:741–757`) and states the copy
is deliberate ("MODELLED ON … duplicated from, not shared with"). The two
`HostDouble`/`ExtensionAPI`/`ExtensionContext` stub rosters and the
mkdtemp-plant-dispose sequence are the same harness declared twice, one
instance carrying strictly less (no `sendAttempts`/`invalidated` tier
instrumentation, no multi-fixture stem parameter generalised into the other
file's single-fixture form).

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module for the "stub ExtensionAPI/ExtensionContext
host that records sendMessage/notify" double and the "mkdtemp a workspace,
plant a `.pi/theta/<name>.theta` + `.pi/settings.json`, return
{ cwd, dispose }" sequence is the natural home the copied file's own header
comment already points reviewers toward.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named gate kin; not
  a census/pin gate.
- Recording-double: `HostDouble.notes`/`notified` do record calls, but
  neither file asserts a MUST-NOT-be-called negative witness off this
  specific duplication — both drive the doubles to observe POSITIVE delivery
  counts, so the recording-double carve-out (a legitimate MUST-NOT witness)
  does not shield the harness-declaration duplication itself.
- docs/bugs/ signature search: `grep -rn "lex-drop-single-delivery\|extension-bootstrap-sink-liveness" docs/bugs/` finds only docs/bugs/0255-*.md and docs/bugs/0023-*.md discussing each file's own behavioural subject, no bug document addressing this harness duplication.
- coverage-matrix/bug-doc citation search: `grep -rn "lex-drop-single-delivery.test.ts\|extension-bootstrap-sink-liveness.test.ts" docs/reference/coverage-matrix.md` found no citation by name pinning either file's internal structure; this finding proposes no test rename/merge/delete, only a harness-location observation.
- Coverage check: the claim is about a repeated harness DEFINITION already
  self-labelled a copy by the newer file's own comment, not about a missing
  test path.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified: every excerpt reproduces at the cited lines and the D7 copy-paste-double class holds, but the load-bearing counterpart is tests/helpers/compose-workspace-harness.ts (landed 2026-09-11 in the PTQ-0213 fix, after this 2026-08-23 file), which lex-drop-single-delivery.test.ts never imports (grep helpers/ → none; 7 sibling files do): its `makeHost` is identical to the helper's export modulo line-wrapping (diff -w :178-221 vs helper :65-107 shows only the sendMessage signature reflow), and `PiHandler`/`RecordedNote`/`HostDouble`/`normalisePath`/`LoadPass`/`runLoadPass`/`noteDiagnostics`/`allDiagnostics`/`describeNotes`/`normativeMessagePattern` plus plantTheta's settings-write/dispose tail (= `finishWorkspace`) are likewise redeclared — a mechanical import swap; the cited extension-bootstrap-sink-liveness.test.ts `makeHost` is NOT a copy (it is a diverged options double with `invalidated`/`sendThrows`/`sendAttempts`/`notifyAttempts`/`triggerTurn` that bug 0023's tier tests require) so only its `plantMalformedTheta` tail is in the family; not a duplicate — resolved PTQ-0220/PTQ-0221 covered other files against the same helper and same-wave intake d7-152-01 covers thetalib-reparse-walk-single-delivery.test.ts (triage: claude-fable-5-1)
