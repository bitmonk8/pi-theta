---
id: PTQ-1335
title: prompt-provider-field-derivation.test.ts hand-rolls a local rootDouble instead of the canonical override-shaped rootDouble it already imports the sibling helper from
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-provider-field-derivation.test.ts:208-224
  - tests/helpers/scripted-live-session-harness.ts:148-155
  - tests/helpers/runtime-belt-probe-harness.ts:90-95
  - tests/helpers/fixture-dispatch-harness.ts:182-192
  - tests/helpers/invoke-seam-scaffold.ts:66-70
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# prompt-provider-field-derivation.test.ts hand-rolls a local rootDouble instead of the canonical override-shaped rootDouble it already imports the sibling helper from

## Observation
`tests/prompt-provider-field-derivation.test.ts` imports six names from `tests/helpers/scripted-live-session-harness.ts` (`ANTHROPIC_MODEL`, `SessionEntryDouble`, `ajv`, `parse`, `appendUserEntry`, `appendAssistantEntry`, `sessionBranch`) but declares its own local `rootDouble(session)` function rather than importing that same module's exported `rootDouble(overrides)`, even though the local function's `checkpoint`, `idSource`, and `schemaValidator` fields reproduce the canonical helper's default construction field-for-field, and its only genuinely test-specific piece — the session-driven `clock.setTimeout` — is exactly the shape the canonical `rootDouble`'s `overrides.clock` parameter is built to accept.

## Evidence

`tests/prompt-provider-field-derivation.test.ts:208-224` (the local double):
```ts
function rootDouble(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/scripted-live-session-harness.ts:148-155` (the exported, already-imported-from helper — accepts a `clock` override and otherwise builds the identical checkpoint/idSource/schemaValidator):
```ts
export function rootDouble(overrides: {
  readonly clock?: Partial<RuntimeRoot["clock"]>;
  readonly tokenEstimator?: RuntimeRoot["tokenEstimator"];
  readonly fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">;
} = {}): RuntimeRoot {
  return { ...fixedClockRoot(), schemaValidator: ajv(), ...overrides } as unknown as RuntimeRoot;
}
```

`tests/helpers/runtime-belt-probe-harness.ts:90-95` (`fixedClockRoot`, i.e. the `rootDouble` imported into the helper above as `fixedClockRoot`):
```ts
export function rootDouble(): RuntimeRoot {
  return rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", {
    now: (): number => 0,
    wallNow: (): number => 0,
    setTimeout: (fn: () => void): unknown => {
      fn();
      return 0;
    },
    clearTimeout: (): void => {},
  });
}
```

`tests/helpers/fixture-dispatch-harness.ts:182-192` (`rootWith` — the `idSource` shape both doubles share):
```ts
export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/invoke-seam-scaffold.ts:66-70` (`SEAM_NOOP_CHECKPOINT` — the same `checkpoint` shape the local double hand-writes inline):
```ts
export const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};
```

## Why this is a problem
Tracing the fields: the local `checkpoint: { before: () => Promise.resolve() }` is `SEAM_NOOP_CHECKPOINT`'s body written out again; `idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" }` is `rootWith`'s default `idSource` written out again; `schemaValidator: ajv()` is the canonical `rootDouble`'s own default `schemaValidator: ajv()` (using the very `ajv` this file already imports from the same helper). The only field that differs from the canonical default is `clock.setTimeout`, which ticks the session double before firing — and that is precisely the shape `rootDouble`'s `overrides.clock` parameter exists to carry (`rootDouble({ clock: { now, wallNow, setTimeout: (fn) => { session.tick(); fn(); return 0; }, clearTimeout: () => {} } })` reproduces the local function's output field-for-field). A prior finding on this same file (PTQ-0668, resolved) already migrated `ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps`/`parse`/`ajv` onto this helper's exports but did not touch `rootDouble`, leaving this one double re-implemented in the file that already imports the module exporting its canonical replacement.

## Suggested direction (non-binding, optional)
The already-imported `tests/helpers/scripted-live-session-harness.ts` exports a `rootDouble(overrides)` whose `clock` override parameter is shaped for exactly this session-ticking use; passing the session-driven clock as an override is the existing, purpose-built path for this construction.

## False-positive check
- Gate-pin check: `tests/prompt-provider-field-derivation.test.ts` does not match `*gate*.test.ts` or the named gate kin; the cited lines are a runtime-root double constructor, not a pinned count or inventory assertion.
- Recording-double check: the local `rootDouble` builds a `RuntimeRoot`, not a recording double asserting a call never happened; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "prompt-provider-field-derivation" docs/bugs/` finds only docs/bugs/0009 (the file's own subject, the `.provider`-vs-`.api` derivation), which does not discuss this harness-construction shape.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-provider-field-derivation" docs/reference/coverage-matrix.md docs/bugs/*.md` shows no citation of specific line ranges inside the harness setup (lines 208-224); no merge, rename or deletion of any `it()`/`describe()` is proposed.
- Coverage check: the claim is about a duplicated double construction, not a missing test path; every cell in the file that uses `rootDouble(session)` continues to exercise the same production seam under the current inline definition.
- Prior-finding check: `quality/resolved/PTQ-0668-provider-field-derivation-scripted-session-not-migrated.md` covers this exact file's duplication of `ANTHROPIC_MODEL`/`SessionEntryDouble`/`parseDeps`/`parse`/`ajv` against the same helper module (now fixed — the file imports those five). It does not cite or discuss `rootDouble` (grep of that finding's body for "rootDouble" is empty), so this is a distinct root cause left over after that fix, not a re-file.

## Triage
verdict: confirmed — all five excerpts reproduce at the cited lines (local rootDouble at tests/prompt-provider-field-derivation.test.ts:208-224; canonical `rootDouble(overrides)` at scripted-live-session-harness.ts:148-155 spreading fixedClockRoot()+ajv(); rootWith/SEAM_NOOP_CHECKPOINT shapes match field-for-field), the file already imports 7 names from that module (line 55) yet hand-writes checkpoint/idSource/schemaValidator identically, the only variation (session.tick() in clock.setTimeout) is carried by the exported `overrides.clock` parameter which a sibling already uses (binder-param-type-projection.test.ts:578-579); D7 copy-paste-double class, tests/-only, not a gate file, no coverage-matrix/bug-doc citation of lines 208-224; not a duplicate — PTQ-0668 (resolved) has 0 hits for "rootDouble", and the other rootDouble filings (PTQ-0862/0873/0982/1006/1014/1022/1090) cite different files (triage: claude-fable-5-1)
