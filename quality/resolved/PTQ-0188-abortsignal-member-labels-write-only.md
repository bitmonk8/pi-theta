---
id: PTQ-0188
title: The seven member-name labels in runCapabilityProbe's step-(b) typeofMembers table are constructed and never read
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
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
verdict: questionable — labels verified unread by any code (typeofMembers only at :299/:311, `[, get]` discards them, no member field on the abortsignal-shape arm, no test/tool reader), but capability-probe.md ¶6 and sub-step (b) pin the AbortSignal/AbortController member-name list as a constant living in the extension module, so these strings are a spec-mirroring record rather than proven cruft — a human should rule (triage: claude-opus-5)
verdict: questionable — reproduces mechanically (typeofMembers only at :299/:311 with 2-line drift, `[, get]` discards the labels, the abortsignal-shape arm at :316 carries no member and spec/registry pin `details.member` to sdk-capability-missing only, no test/tool/literal-read assertion reads the seven strings), but git shows the labels were authored discarded in the module's first commit b00cdc36 so no vestige exists, and capability-probe.md ¶6 + sub-step (b) direct the member-name list to live co-located in this module as the spec's pinned record — the strings are a spec-mirroring roster encoded as data, so the anchor reduces to taste and a human should rule (triage: claude-opus-5)
verdict: confirmed — independently re-checked the two priors' own rebuttal ground and it does not hold: capability-probe.md's clause says this table is "co-located ... in the pinned-constants block that the build-time surface-inventory assertion also consumes", but no such assertion exists for AbortSignal/AbortController anywhere in the repo — version-bump-gates.ts's seven gates and sdk-inventory.ts's SDK_SURFACE_INVENTORY reconcile only Node floor, FACTORY_PROBABLE_CAPABILITIES, PEER_DEP_PACKAGES, session-shutdown reasons, provider seed fields and the strict-capability probe (grep for "Abort" across version-bump-gates.ts, version-bump-acceptance.ts, sdk-inventory.ts and their test files: 0 hits), and tests/capability-probe.test.ts's two abortsignal-shape cases assert only observed/required, never a member; ProbeFailureDetails.member's own doc (:171-172) and clause (ii) pin `details.member` to sdk-capability-missing alone, so the payload structurally cannot read these labels; each getter's own `readProp(x,"prop")` literal already names the member the label repeats, so the string carries no information the line lacks; git log -S"typeofMembers" shows the array was authored complete with the `[, get]` discard in the module's first commit (b00cdc36) — never-had-a-reader, not a later-orphaned vestige — which is the same shape PTQ-0172 (SubagentChildProcess.pid, "has never had a reader" per its own git-log check) and PTQ-0001 confirmed rather than excused; the "spec-mirroring roster" defense therefore rests on a spec clause whose code-side half does not exist (triage: claude-opus-5)
