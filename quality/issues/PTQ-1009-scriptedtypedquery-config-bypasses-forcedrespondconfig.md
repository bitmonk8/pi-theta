---
id: PTQ-1009
title: scripted-typed-query-harness.ts's config() reimplements typed-query-harness.ts's forcedRespondConfig() instead of calling it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/scripted-typed-query-harness.ts:29-40
  - tests/helpers/typed-query-harness.ts:32-41
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# scripted-typed-query-harness.ts's config() reimplements typed-query-harness.ts's forcedRespondConfig() instead of calling it

## Observation
`tests/helpers/scripted-typed-query-harness.ts` already imports two names from `./typed-query-harness` (`ajv as sharedAjv`, `schemaDeclsOf as sharedSchemaDeclsOf`) and re-exports two more (`NOOP_CHECKPOINT`, `liveSignal`) from that same module, but declares its own `config(invocationId)` function that inlines the `maxRounds: 0` fixed-field literal `typed-query-harness.ts` already exports as `forcedRespondConfig()` for exactly this purpose — building a `QueryToolLoopConfig` for a `max_rounds: 0` forced-respond drive.

## Evidence
`tests/helpers/scripted-typed-query-harness.ts:29-40`:
```ts
export function config(invocationId: string): QueryToolLoopConfig {
  // A typed query at `max_rounds: 0` fires the forced-respond terminator as its
  // only turn (QRY-14) — the scripted model supplies only that turn, and the
  // follow-up rides the injected `driveFollowUp`.
  return {
    maxRounds: 0,
    querySite: { file: "probe.theta", line: 1, column: 1 },
    thetaSlashName: "/probe",
    invocationId,
    occurredAt: 0,
  };
}
```

`tests/helpers/typed-query-harness.ts:32-41` (the canonical builder, doc comment stating the identical rationale the local copy's comment restates):
```ts
/**
 * A typed query at `max_rounds: 0` fires the forced-respond terminator as its
 * only turn (QRY-14) — no free-phase provider call — so the scripted driver
 * supplies only the forced-respond payload.
 */
export function forcedRespondConfig(
  fixture: Omit<QueryToolLoopConfig, "maxRounds">,
): QueryToolLoopConfig {
  return { maxRounds: 0, ...fixture };
}
```

`config(invocationId)`'s body is exactly the call `forcedRespondConfig({ querySite: { file: "probe.theta", line: 1, column: 1 }, thetaSlashName: "/probe", invocationId, occurredAt: 0 })` would produce — every field name and the `maxRounds: 0` value match. Four other test files already use `forcedRespondConfig` for this exact wrapping pattern: `grep -rn "forcedRespondConfig" tests/*.test.ts` shows `b0292-validation-errors-canonical-order.test.ts:53`, `e2e-s3-typed-query-conformance.test.ts:51`, `production-typed-query-validation.test.ts:46` and `typed-query-schema-integration.test.ts:88` each declare `function config(): QueryToolLoopConfig { return forcedRespondConfig({ ... }); }` — the established convention `scripted-typed-query-harness.ts`'s own `config()` does not follow.

## Why this is a problem
`scripted-typed-query-harness.ts` already opens `./typed-query-harness` for two other exports and re-exports two more from it, so the module boundary carries no friction here; the file inlines the `maxRounds: 0` literal directly instead of calling the sibling function built for exactly this purpose, breaking with the pattern four other test files in the same suite already follow for the identical config shape.

## Suggested direction (non-binding, optional)
`config(invocationId)`'s body could call `forcedRespondConfig({ querySite: { file: "probe.theta", line: 1, column: 1 }, thetaSlashName: "/probe", invocationId, occurredAt: 0 })`, matching the wrapping pattern the four sibling test files already use.

## False-positive check
- Gate-pin check: `scripted-typed-query-harness.ts` is a `tests/helpers/` module, not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: `config()` returns a plain data literal, not a recording double backing a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "forcedRespondConfig\|scripted-typed-query-harness" docs/bugs/` → 0 hits; no documented correct-reason red cites this helper or file.
- coverage-matrix/bug-doc citation search: `grep -n "scripted-typed-query-harness\|b0352-initial-depth-breach-opens-repair\|b0353-followup-respond-payload-depth-walk" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either helper file or of the two test files that import `config()` (`b0352-initial-depth-breach-opens-repair.test.ts`, `b0353-followup-respond-payload-depth-walk.test.ts`) — only that the local function call the sibling helper it already sits beside.
- Coverage-drift check: this finding is about a duplicated fixture literal inside an existing, passing helper module; it makes no claim that any behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim (scripted-typed-query-harness.ts:29-40, typed-query-harness.ts:32-41); `config()` is live (10 call sites across b0352/b0353) and its body is byte-equivalent to `forcedRespondConfig({querySite, thetaSlashName, invocationId, occurredAt})` (spread yields the identical 5-field object, so the fold is behaviour-neutral); the four-file convention reproduces (`grep -rn forcedRespondConfig tests/` → exactly b0292:53, e2e-s3:51, production-typed-query-validation:46, typed-query-schema-integration:88, each `function config() { return forcedRespondConfig({...}) }`); docs/bugs (0) and coverage-matrix (0) searches reproduce; no gate/recording-double/red-test carve-out applies; distinct from the d7-02-config-builder false-positive (that proposed a NEW cross-file builder over varying fixtures — here the builder already exists in a module this file already imports from) and from resolved PTQ-0871, which covered the same helper pair's `NOOP_CHECKPOINT`/`liveSignal`/`schemaDeclsOf`/`ajv` quartet but never cited `config()`; commit 5bb58b2c (the PTQ-0871 fix) left `config()` untouched as unchanged context, so this is the leftover fifth piece of the same shape, a one-line mechanical dedupe (triage: claude-fable-5-1)
