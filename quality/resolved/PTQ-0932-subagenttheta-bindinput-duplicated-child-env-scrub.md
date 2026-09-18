---
id: PTQ-0932
title: production-subagent-query-model.test.ts's subagentTheta/bindInput pair is byte-identical to subagent-child-env-scrub.test.ts's
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/production-subagent-query-model.test.ts:68-78
  - tests/production-subagent-query-model.test.ts:99-106
  - tests/subagent-child-env-scrub.test.ts:187-197
  - tests/subagent-child-env-scrub.test.ts:199-206
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# production-subagent-query-model.test.ts's subagentTheta/bindInput pair is byte-identical to subagent-child-env-scrub.test.ts's

## Observation
`tests/production-subagent-query-model.test.ts` declares module-scope
`subagentTheta()` (a fixed `ThetaCompositionInput` builder for a one-callable
`subagent` theta whose tail is `"unused-parent-side"`) and `bindInput()` (a
`ConversationBindInput` builder wrapping that theta with a fixed
`ExtensionCommandContext` and a fresh `AbortController`). `tests/subagent-child-env-scrub.test.ts`
declares functions of the same two names with character-for-character
identical bodies, both used for the same purpose — driving
`createProductionProducerDeps(...).spawnSubagentConversation` — in each
file's own describe blocks.

## Evidence

`tests/production-subagent-query-model.test.ts:68-78`:
```ts
function subagentTheta(): ThetaCompositionInput {
  const frontmatter = { mode: "subagent" } as unknown as ParsedFrontmatter;
  const body: ThetaBody = { statements: [], tail: parseExpressionSource('"unused-parent-side"') };
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter,
    body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}
```

`tests/production-subagent-query-model.test.ts:99-106`:
```ts
function bindInput(): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta: subagentTheta(), args: "", ctx, thetaAbort: new AbortController() };
}
```

`tests/subagent-child-env-scrub.test.ts:187-197` — `subagentTheta`,
byte-identical:
```ts
function subagentTheta(): ThetaCompositionInput {
  const frontmatter = { mode: "subagent" } as unknown as ParsedFrontmatter;
  const body: ThetaBody = { statements: [], tail: parseExpressionSource('"unused-parent-side"') };
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter,
    body,
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}
```

`tests/subagent-child-env-scrub.test.ts:199-206` — `bindInput`,
byte-identical:
```ts
function bindInput(): ConversationBindInput {
  const ctx = {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
  } as unknown as ExtensionCommandContext;
  return { theta: subagentTheta(), args: "", ctx, thetaAbort: new AbortController() };
}
```

Search performed: `grep -n "^function subagentTheta()\|^function bindInput(" tests/*.test.ts` returns exactly these two files for this exact parameterless `subagentTheta()` / `bindInput()` pairing (a differently-shaped, parameterised `subagentTheta(tail)` exists in `tests/subagent-root-drive-wiring.test.ts` / `tests/subagent-visible-regime.test.ts`, already tracked separately by the resolved `PTQ-0482`, and is not counted here). A `mktemp`-extracted diff of the two 11-line `subagentTheta` bodies and the two 8-line `bindInput` bodies is empty in both cases.

## Why this is a problem
Two files in the same `spawnSubagentConversation`/`createProductionProducerDeps` lineage each declare the identical fixture pair rather than importing one shared declaration. No `tests/helpers/` module exports either name (`grep -rn "subagentTheta\|function bindInput" tests/helpers/*.ts` → 0 hits), so a change to the fixed theta shape or the fixed bind-input shape has two hand-synchronised copies to keep in step.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting this `subagentTheta()`/`bindInput()` pair — distinct from the already-`tests/helpers/`-eligible `subagentTheta(tail)`/`childCtx(...)` quartet PTQ-0482 already named — is the home the two files' identical fixture pair already points toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named gate kin; the cited lines are fixture-builder declarations, not a pinned count or inventory assertion.
- Recording-double check: neither `subagentTheta` nor `bindInput` is a recording double backing a "never called" MUST-NOT witness; both are pure builders returning a fixed literal shape. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "production-subagent-query-model\|subagent-child-env-scrub" docs/bugs/*.md` → docs/bugs/0474 (the child-env-scrub file's own subject) is the only hit, and it discusses the parent-environment-poisoning defect, not this fixture-pair duplication.
- coverage-matrix/bug-doc citation search: `grep -n "production-subagent-query-model\|subagent-child-env-scrub" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block, only that the shared fixture pair could be imported from one place.
- Prior-filing search: `grep -rl "subagent-child-env-scrub" quality/intake quality/issues quality/resolved` hits the resolved `PTQ-0482` (a differently-shaped, parameterised `subagentTheta(tail)`/`childCtx` quartet in two OTHER files, `subagent-root-drive-wiring.test.ts`/`subagent-visible-regime.test.ts`, whose own triage explicitly notes `production-subagent-query-model.test.ts` builds "differently-shaped" — i.e. NOT this pairing) and `PTQ-0465` (the unrelated `fakeExecutableHost` double). Neither names this `subagentTheta()`/`bindInput()` byte-identical pair.
- Coverage check: the claim is about a repeated fixture-pair DEFINITION, not a missing test path; both copies are exercised by their own files' passing tests.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines and mktemp `diff` of the 11-line `subagentTheta` bodies (:68-78 vs :187-197) and the 8-line `bindInput` bodies (:99-106 vs :199-206) is empty in both cases; both copies are live (`bindInput()` called at query-model :117/:212 and env-scrub :224, each feeding `deps.spawnSubagentConversation`); git lineage shows query-model's pair born 20540abc 2026-07-03 and env-scrub's copy pasted in ce3ca3f2 2026-09-11 — D7 copy-paste-fixture class; neither file is a *gate* test, coverage-matrix grep → 0, docs/bugs/0474 cites env-scrub only as its witness and does not call for a per-file fixture, no recording-double/red-test carve-out applies; not a duplicate: fixed PTQ-0482 covers root-drive-wiring/visible-regime's `subagentTheta(tail)`/`childCtx` quartet in OTHER files, open PTQ-0767 is the tests/live `subagentTheta(): string` five-line source fixture, PTQ-0465/PTQ-0492 are `fakeExecutableHost`/`RecordingCheckpoint`; two FP-check inaccuracies that redirect the fix rather than refute it: (a) the "no tests/helpers export → 0 hits" claim is false — PTQ-0482's fix landed `export function subagentTheta(tail)` at tests/helpers/subagent-fn-child-regime.ts:180 producing this exact shape for tail `'"unused-parent-side"'` (8 importers already), so the dedupe is an import of the existing helper rather than a new module (note helper `childCtx` adds a `sessionManager` field, so `bindInput`'s bare ctx is not the same double); (b) the stated grep misses a third parameterless `subagentTheta()` at tests/subagent-drive-teardown.test.ts:62, which is differently shaped (`classify` slug, `emptyBody()`, no `callableSet`) and correctly not a copy (triage: claude-fable-5-1)
