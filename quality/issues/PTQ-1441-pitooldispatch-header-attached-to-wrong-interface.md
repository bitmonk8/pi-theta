---
id: PTQ-1441
title: PiToolDispatch's H8b doc comment is attached to SubagentPlacementResolver instead
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-producer-deps.ts:56-79
sites: 1
fix_scope: localized
wave: qw20260923035927
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# PiToolDispatch's H8b doc comment is attached to SubagentPlacementResolver instead

## Observation
Two consecutive JSDoc blocks sit directly above `export interface
SubagentPlacementResolver` with no code between them, and the interface that
follows immediately after (`export interface PiToolDispatch`) has no leading
doc comment of its own. The first of the two stacked blocks describes
`PiToolDispatch`'s `execute` semantics (`H8b: one resolved host Pi tool the
code-side tool-call path dispatches 'execute' against …`), not
`SubagentPlacementResolver`'s per-launch placement-resolution role that the
second block (and the interface itself) actually describes.

## Evidence
`src/extension/production-producer-deps.ts:56-84`:
```
/**
 * H8b: one resolved host Pi tool the code-side tool-call path dispatches
 * `execute` against. `execute` invokes the host tool's `execute(...)` and maps
 * its `AgentToolResult` to the theta-load-bearing `AgentToolResultEnvelope`
 * (`content` only), or throws when the tool signals failure — the V14g lowering
 * (`runCodeSideToolCall`) turns a clean resolve into `Ok(text)` and a throw into
 * `Err(CodeToolError{cause:"execution"})`.
 */
/**
 * RFC-0012 §6: per-launch placement resolution. The composition root supplies
 * it over the registered-backend set, the operator's selection and the two
 * per-launch policies (visible cap, credential guard); the producer calls it
 * once per child launch with the facts those policies need.
 */
export interface SubagentPlacementResolver {
  (context: {
    /** The resolved model's provider (the credential guard's lookup key). */
    readonly provider: string;
    /** The callee rendering for the guard's system note (`/<slug>` or `/<slug>#<fn>`). */
    readonly callee: string;
  }): PlacementLease;
}

export interface PiToolDispatch {
  readonly toolName: string;
```
The H8b block's content ("one resolved host Pi tool the code-side tool-call
path dispatches `execute` against", "`AgentToolResult`", "`AgentToolResultEnvelope`",
"`runCodeSideToolCall`", "`CodeToolError{cause:"execution"}`") matches nothing
on `SubagentPlacementResolver` (a per-launch backend-selection callback that
returns a `PlacementLease`), and matches exactly what `PiToolDispatch` below it
is (the H8b resolved-tool dispatch contract whose `execute` maps
`AgentToolResult` to `AgentToolResultEnvelope`).

A scan for this stacked-doc-comment shape (`^ \*/$` immediately followed by a
line starting `/**`) across the five reviewed files finds exactly one hit,
this one:
```
$ awk '/^ \*\/$/{getline nxt; if (nxt ~ /^\/\*\*/) print FILENAME":"NR}' \
  src/extension/binder-run.ts src/extension/invoke-machinery.ts \
  src/extension/production-producer-deps.ts src/extension/production-theta-producer.ts \
  src/extension/subagent-spawn-regime.ts
src/extension/production-producer-deps.ts:64
```

## Why this is a problem
The module header (`production-producer-deps.ts:1-10`) advertises this file
as documenting `PiToolDispatch` among its named contracts, but the interface
itself carries no doc comment — its intended documentation dangles one
declaration early, above an unrelated interface, where a reader of
`SubagentPlacementResolver` encounters prose about a different contract's
`execute` mapping and a reader of `PiToolDispatch` finds no comment at all.

## Suggested direction (non-binding, optional)
Move the H8b block down to sit directly above `export interface
PiToolDispatch`, leaving the RFC-0012 §6 block as the sole doc comment on
`SubagentPlacementResolver`.

## False-positive check
Confirmed by direct read of `production-producer-deps.ts:56-84`: the two doc
blocks are adjacent with no intervening declaration, and the first block's
vocabulary (`execute`, `AgentToolResult`, `AgentToolResultEnvelope`,
`runCodeSideToolCall`, `CodeToolError`) appears nowhere in
`SubagentPlacementResolver`'s body but matches `PiToolDispatch`'s own
`execute` field and its later doc comments referencing the same terms
(`PiToolDispatch.execute`'s own inline doc at lines ~92-99 discusses the same
dispatch contract). Ran the stacked-doc-comment scan across all five
in-scope files; this is the only occurrence, so this is not a repo-wide
formatting convention. This is prose placement, not a code reference, so it
is not resolvable as a duplication (D4) or dead code (D2 deadness) claim —
filed as stale/misplaced header prose per the D2 brief's carve-out for header
prose that dangles or misattributes.

## Triage
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
