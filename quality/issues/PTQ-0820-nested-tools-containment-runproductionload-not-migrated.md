---
id: PTQ-0820
title: nested-tools-entry-containment.test.ts re-derives the LoadOutcome/runProductionLoad fake-host wiring production-load-harness.ts already exports
lens: D7
status: open
verdict: confirmed
locations:
  - tests/nested-tools-entry-containment.test.ts:141-197
  - tests/helpers/production-load-harness.ts:1-22
  - tests/helpers/production-load-harness.ts:31-38
  - tests/helpers/production-load-harness.ts:56-77
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# nested-tools-entry-containment.test.ts re-derives the LoadOutcome/runProductionLoad fake-host wiring production-load-harness.ts already exports

## Observation
tests/nested-tools-entry-containment.test.ts declares its own module-scope
`LoadOutcome` interface (`registered`/`fixtures`/`notifications`), its own
`makePi()` fake `ExtensionAPI` builder, and its own `async function
runProductionLoad(cwd)` that builds a fake `ExtensionContext` and calls the
real `discoverAndComposeFixtures`, returning a reshaped
`{registered, fixtures, notifications}`. `tests/helpers/production-load-harness.ts`
already exports a `LoadOutcome` interface with the identical
`registered`/`notifications`/`fixtures` fields (plus a `diagnosticLines`
field this file does not need) and an exported `runProductionLoad(cwd, opts)`
that builds the same shape of fake `pi`/`ctx` host around the same
`discoverAndComposeFixtures` call and returns the same
`{registered, notifications, fixtures}` reshape. The helper module's own
header states it exists precisely because "[s]everal test files independently
redeclared the same `LoadOutcome` shape and the same `runProductionLoad`
function." Neither `production-load-harness.ts` nor its exports are imported
anywhere in this file.

## Evidence
tests/nested-tools-entry-containment.test.ts:141-197 (re-read immediately
before filing):
```ts
interface LoadOutcome {
  /** Slash names the production compose helper returned. */
  readonly registered: readonly string[];
  readonly fixtures: readonly ThetaFixture[];
  /** Diagnostic messages surfaced via `ctx.ui.notify`. */
  readonly notifications: readonly string[];
}
...
function makePi(): ExtensionAPI {
  return {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (message: { content?: unknown }): void => {
      if (typeof message.content === "string") systemNotes.push(message.content);
    },
    sendUserMessage: (): void => {},
    registerMessageRenderer: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
}

async function runProductionLoad(cwd: string): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const ctx = {
    cwd,
    hasUI: true,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    makePi(),
    ctx,
  );
  return {
    registered: fixtures.map((f) => f.slashName),
    fixtures,
    notifications,
  };
}
```

tests/helpers/production-load-harness.ts:1-22 (header naming exactly this
redeclaration as its reason for existing):
```ts
// A shared "run the shipped composition root over a fake host, mirroring its
// stderr diagnostic channel" load harness (PTQ-0210), plus the temp
// discovery-workspace plant/dispose lifecycle every caller drives it through
// (PTQ-0312).
//
// WHY THIS FILE EXISTS. Several test files independently redeclared the same
// `LoadOutcome` shape and the same `runProductionLoad` function: a fake,
// no-UI `ExtensionAPI` / `ExtensionContext` pair sized to
// `discoverAndComposeFixtures`, a `process.stderr.write` interposition that
// captures `makeLoadEmit`'s rendered diagnostic lines (the load's no-UI
// mirror) around one `discoverAndComposeFixtures` call, and a reshape of the
// result into `{registered, notifications, diagnosticLines}`. The same files
// also independently redeclared the temp-workspace lifecycle WRAPPED around
// that call...
```

tests/helpers/production-load-harness.ts:31-38 (the canonical `LoadOutcome`,
carrying the identical `registered`/`notifications`/`fixtures` fields):
```ts
export interface LoadOutcome {
  readonly registered: readonly string[];
  readonly notifications: readonly string[];
  /** `theta: <file>:<line>:<col>: <code>: <message>`, one per diagnostic. */
  readonly diagnosticLines: readonly string[];
  /** The composed fixtures the pass produced (discovery order), for callers that need more than `registered`. */
  readonly fixtures: readonly ThetaFixture[];
}
```

tests/helpers/production-load-harness.ts:56-77 (the canonical
`runProductionLoad`, same `pi.getFlag`/`getCommands`/`sendMessage`/
`sendUserMessage`/`getActiveTools`/`setActiveTools` member set and the same
`ctx.cwd`/`modelRegistry.getAvailable`/`ui.notify` shape around the same
`discoverAndComposeFixtures` call):
```ts
export async function runProductionLoad(
  cwd: string,
  opts: ProductionLoadOptions = {},
): Promise<LoadOutcome> {
  const notifications: string[] = [];
  const chunks: string[] = [];
  const pi = {
    getFlag: (name: string): string | undefined => (name === "theta" ? opts.thetaFlag : undefined),
    getCommands: (): readonly { name: string; source: string }[] => opts.piOwnedCommands ?? [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    modelRegistry: { getAvailable: (): readonly unknown[] => opts.availableModels ?? [] },
    ui: {
      notify: (message: string, _type: "error"): void => {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;
```

Search performed: `grep -n "production-load-harness" tests/nested-tools-entry-containment.test.ts`
→ 0 hits; the file's only `tests/helpers` import is `readRegistry` from
`./helpers/registry-oracle`. `grep -n "interface LoadOutcome\|function runProductionLoad"
tests/nested-tools-entry-containment.test.ts` → the single definitions cited above.

## Why this is a problem
The shared helper module's own header names the exact symptom this file
reproduces — an independently redeclared `LoadOutcome` shape and
`runProductionLoad` function wrapping the same `discoverAndComposeFixtures`
call over the same shape of fake `pi`/`ctx` host — as its reason for existing,
and its exported `LoadOutcome` already carries every field
(`registered`/`notifications`/`fixtures`) this file's local interface
declares. A future change to the fake host's required member set (an added
`pi` method `discoverAndComposeFixtures` starts requiring, or a change to how
`ctx.ui.notify` is wired) has to be applied to this file's copy independently
of the helper's, with nothing tying the two together once they diverge.

## Suggested direction (non-binding, optional)
`tests/helpers/production-load-harness.ts`'s exported `runProductionLoad` and
`LoadOutcome` already cover the `registered`/`notifications`/`fixtures` shape
this file reads from its own `outcome`; this file's extra needs (capturing
`sendMessage` content into `systemNotes`, `ctx.hasUI`, `registerMessageRenderer`)
are the parts that would stay local to a thin wrapper around the shared call.

## False-positive check
- Gate-pin check: `nested-tools-entry-containment.test.ts` is not a
  `*gate*.test.ts` file or a named kin; the cited lines are harness setup, not
  a pinned count or inventory assertion.
- Recording-double check: `runProductionLoad`'s `notifications` array records
  `ctx.ui.notify` calls so later `toContain`/`not.toContain` assertions can
  read their content — not a "never called" MUST-NOT witness on the harness
  itself; this finding is about the duplicated fake-host wiring, not about the
  legitimacy of any assertion built on its output.
- docs/bugs/ signature search: `grep -rl "nested-tools-entry-containment"
  docs/bugs/*.md` → hits only docs/bugs/0111-*.md (the file's own governing
  bug, cited throughout the file's header as its scope and target contract);
  it gives no rationale for keeping the `LoadOutcome`/`runProductionLoad`
  wiring local rather than imported.
- coverage-matrix/bug-doc citation search: `grep -n
  "nested-tools-entry-containment" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or any
  `describe()`/`it()` — only that the local `LoadOutcome`/`makePi`/
  `runProductionLoad` block could wrap the existing helper's exports instead
  of rebuilding their shape.
- Prior-finding overlap check: `grep -rl "nested-tools-entry-containment"
  quality/issues/*.md quality/intake/*.md` before this filing showed only
  PTQ-0712 (a different function in this file, `callableSetOf`, matched
  against two sibling files — it does not mention `LoadOutcome` or
  `runProductionLoad`). The resolved-pattern siblings PTQ-0517 and PTQ-0600
  cite `tests/tools-derived-name-shape.test.ts`,
  `tests/tools-entry-closed-grammar.test.ts`,
  `tests/tools-entry-containment.test.ts`, and
  `tests/production-tools-load-resolution.test.ts` for this exact
  `LoadOutcome`/`runProductionLoad` root cause — none of them names
  `tests/nested-tools-entry-containment.test.ts` (the distinctly-named
  `nested-` file, not `tools-entry-containment.test.ts`), so this is the
  first filing against this specific file for this root cause.
- Coverage-drift check: the claim is about a repeated harness DEFINITION this
  file's own ~30 `it()` bodies already exercise via `outcome.registered` /
  `outcome.fixtures` / `outcome.notifications`; no claim that any diagnostic
  path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines (test.ts:141-197 `interface LoadOutcome`/`makePi`/`runProductionLoad`; harness.ts:1-22, 31-38, 56-77), the file imports only `./helpers/registry-oracle` (grep production-load-harness → 0 hits; 8 importers of the helper, not this one), the local pi/ctx double matches the helper's six pi members and cwd/modelRegistry/ui.notify ctx shape field-for-field with the same `discoverAndComposeFixtures` call and the same `{registered, fixtures, notifications}` reshape, and `ctx.ui.notify` fires on error regardless of `hasUI` (production-composition.ts:318-320; `hasUI` gates only the stderr mirror at :349, which the helper neutralises by interposition) so `notifications` is content-identical; the two local extras are accounted — `registerMessageRenderer` is never reached on the compose path (factory.ts:649 only) and the capturing `sendMessage` feeding `systemNotes` for cells 8/9 (:862, :901) has no `ProductionLoadOptions` counterpart, so the dedupe is a mechanical options widening of the kind PTQ-0739 accepted, which the direction paragraph already discloses; git: test created 2026-08-22 (1c7bd36a) before the helper (2026-09-11, 2594cd44) and never migrated (last touch cc0a8fe7 2026-09-18 did not); not a gate file, positive/negative content reads through a recording double (not a MUST-NOT witness), coverage-matrix 0 hits, and the FP-check's docs/bugs claim is incomplete (0111/0248/0280/0293 all cite the file) but none mentions `runProductionLoad`/`makePi`/`LoadOutcome` (0 hits each) — they pin cells and cell counts, and no it()/describe() is renamed, merged or deleted; not a duplicate — PTQ-0712 covers this file's `callableSetOf` only, and PTQ-0210/0240/0259/0312/0358/0517/0600/0635/0717/0722/0723/0739 plus same-wave d7-02-drivecomposepass/d7-06-composedrunnablecount each cite different files for this copy-paste-double class (triage: claude-fable-5-1)
