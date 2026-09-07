---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: The seven member-name labels in runCapabilityProbe's step-(b) typeofMembers table are constructed and never read
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/capability-probe.ts:297-309
  - src/extension/capability-probe.ts:339-353
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The seven member-name labels in runCapabilityProbe's step-(b) typeofMembers table are constructed and never read

## Observation
Step (b) of `runCapabilityProbe` builds `typeofMembers`, a local table of
seven `[label, getter]` tuples. The consuming loop destructures only the
getter (`for (const [, get] of typeofMembers)`), and the failure outcome it
builds carries no member field — so the seven label strings
(`"AbortController"`, `"AbortSignal"`, `"AbortController.prototype.abort"`,
`"AbortSignal.any"`, `"AbortSignal.timeout"`,
`"AbortSignal.prototype.throwIfAborted"`,
`"AbortSignal.prototype.addEventListener"`) are constructed on every probe run
and read by nothing. The sibling step-(c) table uses the identical tuple shape
and does read its labels into the failure details.

## Evidence
src/extension/capability-probe.ts:297-309 — the table and the loop that
discards the first tuple element:
```ts
    const typeofMembers: ReadonlyArray<readonly [string, () => unknown]> = [
      ["AbortController", () => abortController],
      ["AbortSignal", () => abortSignal],
      ["AbortController.prototype.abort", () =>
        readProp(readProp(abortController, "prototype"), "abort")],
      ["AbortSignal.any", () => readProp(abortSignal, "any")],
      ["AbortSignal.timeout", () => readProp(abortSignal, "timeout")],
      ["AbortSignal.prototype.throwIfAborted", () =>
        readProp(readProp(abortSignal, "prototype"), "throwIfAborted")],
      ["AbortSignal.prototype.addEventListener", () =>
        readProp(readProp(abortSignal, "prototype"), "addEventListener")],
    ];
    for (const [, get] of typeofMembers) {
```
The failure arm at :310-315 builds
`details: { kind: "abortsignal-shape", observed, required: "function" }` —
no label is interpolated.

src/extension/capability-probe.ts:339-353 — the step-(c) contrast: the same
tuple shape, whose loop DOES read the label into the outcome
(`member` lands in `details.member` at :358-361):
```ts
    const sdkMembers: ReadonlyArray<readonly [string, () => unknown]> = [
      ["pi.registerCommand", () => readProp(pi, "registerCommand")],
```
```ts
    for (const [member, get] of sdkMembers) {
```

## Why this is a problem
Vestigial fields: a value constructed at every call and never read. The
`typeofMembers` table is a local `const` whose only consumer is the loop at
:309, and that loop's destructuring pattern (`[, get]`) discards the string
half of all seven tuples; no other reference to `typeofMembers` exists in the
file. The labels mirror step (c)'s shape, where the label is load-bearing
(`details.member`), but step (b)'s `abortsignal-shape` outcome carries no
member field — so the string half of the table is shape parity without a
reader. What each getter checks is already stated by the getter expression
itself (`readProp(abortSignal, "any")`), so the labels do not carry
information the line does not.

## Suggested direction (non-binding, optional)
Either drop the label half of the step-(b) table (a list of getters suffices)
or read the label into the failure outcome the way step (c) does — whichever
the diagnostics registry's pinned `abortsignal-shape` payload permits; the fix
stage owns the choice.

## False-positive check
Reference search: `typeofMembers` appears in `src/extension/capability-probe.ts`
at :297 (declaration) and :309 (loop) only; word-boundary grep across `src/`,
`extensions/`, `tools/`, `tests/` finds no other reference, so no test or
tool reads the labels either (grep for `"abortsignal"` across the filed
corpus also shows no prior finding on this table). Spec check: the failure
details the registry pins for `abortsignal-shape` (capability-probe.md clause
(ii), mirrored by `ProbeFailureDetails`) carry `member` only for
`sdk-capability-missing` — the code's own `ProbeFailureDetails.member` doc at
:169 says "Failing member path for `sdk-capability-missing` (Step 0 (c))" —
so no fail-closed obligation reads the step-(b) labels. The comment at
:295-296 ("in the table's listed order") describes iteration order, which the
getter list alone preserves; it does not depend on the labels.

## Triage
