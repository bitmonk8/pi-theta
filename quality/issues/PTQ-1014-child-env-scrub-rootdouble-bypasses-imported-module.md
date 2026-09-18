---
id: PTQ-1014
title: subagent-child-env-scrub.test.ts retypes NoopCheckpoint/rootDouble instead of importing them from the module it already imports bindInput from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-child-env-scrub.test.ts:162-179
  - tests/helpers/subagent-fn-child-regime.ts:152-169
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-child-env-scrub.test.ts retypes NoopCheckpoint/rootDouble instead of importing them from the module it already imports bindInput from

## Observation
`tests/subagent-child-env-scrub.test.ts` imports `bindInput` from `./helpers/subagent-fn-child-regime` (line 39). That same module exports `NoopCheckpoint` and `rootDouble()` (an exported `class NoopCheckpoint implements Checkpoint` and an exported `function rootDouble(checkpoint?)` building a `RuntimeRoot`). Rather than importing either, the test file declares its own module-scope `NoopCheckpoint` class and `rootDouble()` function with the near-identical body.

## Evidence

`tests/subagent-child-env-scrub.test.ts:162-179` (re-read immediately before filing):
```ts
class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/subagent-fn-child-regime.ts:152-169` — the exported pair from the module this file already imports `bindInput` from:
```ts
export class NoopCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

export function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}
```

The `NoopCheckpoint` bodies are byte-identical. The `rootDouble` bodies are identical in the `idSource` line and the entire four-line `clock` object (same field names, same arrow bodies, differing only in the `handle`/`h` parameter name); the local version omits the helper's optional `checkpoint` parameter and its `schemaValidator` field, neither of which this file's one call site (`rootDouble()` with no argument, then read only for `.checkpoint`/`.idSource`/`.clock`) needs.

## Why this is a problem
The import statement at line 39 shows the file already depends on `tests/helpers/subagent-fn-child-regime.ts` for one export from this exact fixture family; `NoopCheckpoint`/`rootDouble` are two more exports from the same module covering this file's exact no-checkpoint-override call shape, yet both were retyped locally instead of imported. A change to either shape (e.g. a new required `RuntimeRoot` field, mirroring the helper's already-added `schemaValidator`) is applied to the helper's export but not to this file's local copy unless someone remembers to sync them by hand.

## Suggested direction (non-binding, optional)
Importing `NoopCheckpoint`/`rootDouble` from `./helpers/subagent-fn-child-regime` in place of the local declarations is the direction the file's own existing import from that module already points toward.

## False-positive check
- Gate-pin check: `subagent-child-env-scrub.test.ts` does not match `*gate*.test.ts` or a named gate kin; the cited lines are fixture-double declarations, not a pinned count or inventory assertion.
- Recording-double check: neither `NoopCheckpoint` nor `rootDouble` records a call or backs a "never called" MUST-NOT witness; both are inert pass-through stand-ins backing the file's positive `spawnSubagentConversation` assertions. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "NoopCheckpoint\|rootDouble" docs/bugs/` → one hit, docs/bugs/0172-inbound-translation-pass-unperformed-at-three-boundaries.md, which discusses an unrelated inbound-translation defect and does not name this file, these lines, or either declaration as a witness.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-child-env-scrub.test.ts" docs/reference/coverage-matrix.md` → 0 hits; `grep -rl "subagent-child-env-scrub.test.ts" docs/bugs/` → only docs/bugs/0474 (this file's own subject bug, cited generally, not for these lines). This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the local double could be imported from the already-depended-on module.
- Coverage-drift check: the claim is about a repeated fixture-double DEFINITION inside an existing, passing test file; it makes no claim that any behaviour or path is untested.
- Sibling-finding check: same-wave `qw20260918155535-d7-04-noop-checkpoint-reimplemented-twice-in-scope.md` and `qw20260918155535-d7-05-childregime-rootdouble-idsource-clock-duplicated.md` both target duplication INSIDE `tests/helpers/` modules (tool-call-dispatch-harness.ts / invoke-seam-scaffold.ts, and subagent-fn-child-regime.ts's own two functions against each other); neither cites `tests/subagent-child-env-scrub.test.ts` or this test file's bypass of the module it already imports from, so this is a distinct root cause, not a duplicate of either.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-child-env-scrub.test.ts:162-179 and tests/helpers/subagent-fn-child-regime.ts:152-169; a mktemp diff of the two 5-line `NoopCheckpoint` classes is empty modulo `export`, and the 12-line `rootDouble` diff shows the helper is a strict superset (optional `checkpoint?` param, extra `schemaValidator` field, `h`/`handle` rename only) so the local copy's one call site (`root: rootDouble()` at :186, no argument) substitutes mechanically; the local copy is live (:170, :186) and both this file and the helper's importers are green (2 files, 29/29); the file does import `bindInput` from that helper at :39 (landed by the PTQ-0932 fix) while `NoopCheckpoint`/`rootDouble` — which subagent-visible-regime.test.ts:16 and subagent-root-drive-wiring.test.ts:19 already import from it — stayed local; stated searches reproduce (docs/bugs grep → only 0172, unrelated; coverage-matrix → 0; docs/bugs file cite → only 0474, which names the file as witness and does not call for a per-file root double); git: env-scrub's copy born ce3ca3f2 2026-09-11, helper's export landed 89faa7c5 2026-09-15 and later — a not-migrated copy-paste fixture, D7 class; not a *gate* test, no recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate: fixed PTQ-0932 covers this file's `subagentTheta`/`bindInput` pair, PTQ-0209/0816/0846/0873/0883 track other files' `NOOP_CHECKPOINT`/`rootDouble` copies against belt-probe/call-with-clause/prompt-value harnesses, same-wave d7-04 (helpers-internal NoopCheckpoint vs SEAM_NOOP_CHECKPOINT) and d7-05 (helper's in-file idSource/clock pair) cite this file only in their triage notes as a distinct root cause; fix is a mechanical import swap (triage: claude-fable-5-1)
