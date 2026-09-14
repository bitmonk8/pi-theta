---
id: PTQ-0332
title: runCapabilityProbe's SDK-member check builds an array of name/closure tuples for a uniform access pattern its neighboring heterogeneous check does not need
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/capability-probe.ts:294-303
  - src/extension/capability-probe.ts:337-361
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/capability-probe.ts#runCapabilityProbe # D8 only: the exemption key
wave: qw20260914091051
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# runCapabilityProbe's SDK-member check builds an array of name/closure tuples for a uniform access pattern its neighboring heterogeneous check does not need

## Observation
`runCapabilityProbe`'s step (c) reads `FACTORY_PROBED_SDK_MEMBERS` (a flat
`readonly string[]` of eight `"pi.<member>"` names) and, instead of testing
each name directly, first `.map()`s the array into an array of
`[string, () => unknown]` tuples — one closure per member, each wrapping the
identical access shape `readProp(pi, name.slice("pi.".length))` — then
iterates that tuple array, destructuring `[member, get]` and calling `get()`.
Step (b), immediately above it in the same function, also builds an array of
closures, but there each of its seven closures reads a DIFFERENT, individually
written property-access expression (`abortController` itself, then three
nested `readProp(readProp(...), ...)` paths of differing depth and target).
Step (c)'s eight closures share one identical shape differing only in the
`name` string already available directly from `FACTORY_PROBED_SDK_MEMBERS`.

## Evidence

**Step (b) — a genuinely heterogeneous per-item closure array (each closure
reads a DIFFERENT expression) — capability-probe.ts:294-303:**
```ts
    const abortController = host.abortController;
    const abortSignal = host.abortSignal;
    // `typeof`-checked members, in the table's listed order (constructors,
    // prototype-methods, static-methods) — short-circuit at the first.
    const typeofMembers: ReadonlyArray<() => unknown> = [
      () => abortController,
      () => abortSignal,
      () => readProp(readProp(abortController, "prototype"), "abort"),
      () => readProp(abortSignal, "any"),
      () => readProp(abortSignal, "timeout"),
```

**Step (c) — eight closures sharing one identical access shape, differing
only in the string already at hand — capability-probe.ts:337-361:**
```ts
  try {
    const pi = host.pi;
    const sdkMembers: ReadonlyArray<readonly [string, () => unknown]> =
      FACTORY_PROBED_SDK_MEMBERS.map(
        (name): readonly [string, () => unknown] => [
          name,
          () => readProp(pi, name.slice("pi.".length)),
        ],
      );
    for (const [member, get] of sdkMembers) {
      const observed = typeof get();
      if (observed !== "function") {
        return {
          ok: false,
          details: {
            kind: "sdk-capability-missing",
            observed,
            required: "function",
            member,
          },
        };
      }
    }
```

## Why this is a problem
The job step (c) does is: for each of eight known name strings, test
`typeof pi[<member-minus-"pi.">] === "function"` and stop at the first
mismatch, reporting that name. `FACTORY_PROBED_SDK_MEMBERS` already supplies
the eight names directly; nothing about the check varies per member beyond
the string itself. Building `sdkMembers` first requires three concepts the
direct check does not: an intermediate tuple-array type
(`ReadonlyArray<readonly [string, () => unknown]>`), a `.map()` transform to
produce it, and a closure wrapping `readProp(pi, ...)` per member before the
loop ever calls it. Step (b)'s own closure array, three lines above, shows
why that shape is warranted THERE: its seven members read seven differently
shaped expressions (a bare variable, a double-nested `readProp`, single-nested
reads on two different roots) that cannot be expressed as one data-driven loop
over a flat name list without a per-item special case. Step (c)'s access
shape has no such variation, so building per-item closures buys it nothing a
loop over `FACTORY_PROBED_SDK_MEMBERS` reading `readProp(pi,
name.slice("pi.".length))` inline does not already give it.

## Suggested direction (non-binding, optional)
Unproven hypothesis: replace the `sdkMembers` construction and its
`for...of` destructuring with a direct loop over `FACTORY_PROBED_SDK_MEMBERS`,
computing `observed` from `readProp(pi, member.slice("pi.".length))` inline
inside the loop body, dropping the intermediate tuple array and its type
entirely. A human confirms nothing downstream (a test double or another
reader) depends on `sdkMembers` existing as a named, inspectable value.

## False-positive check
Read both cited blocks directly from the current working tree immediately
before filing; both match verbatim at the stated lines. Confirmed via the
structural map that `runCapabilityProbe` (273-425, 153 LOC) sits in a file the
map marks file-level exempt (500 LOC) — this filing is not a size/breakdown
claim (D9's territory) and names no LOC threshold; it is a concept-count claim
against the "overbuilt" class's own definition ("concepts / indirection
layers … disproportionate to the job"). Checked for a stated rationale:
neither the step (c) comment ("RFC-0005 …") nor `FACTORY_PROBED_SDK_MEMBERS`'s
own doc comment states a reason this step must build closures rather than
read the array directly — both explain WHAT is being checked and WHY these
eight members matter, never why the per-item closure indirection is needed —
so the D2/D8 rationale-stated-knob carve-out does not apply. Confirmed the
loop's short-circuit-on-first-mismatch semantics and the `member`/`observed`
values reported in the failure `details` are unchanged by inlining the access
(the closure's own body, `readProp(pi, name.slice("pi.".length))`, is exactly
what an inline expression would evaluate). No `docs/spec_topics/` clause
(capability-probe.md Step 0 (c)) mandates a tuple-array implementation shape —
it specifies which eight members are checked and in what order, which an
inline loop over the same ordered array preserves — so no `challenges_spec`
applies. Distinct from `PTQ-0160` (a D2 finding about stale consumer-roster
prose on two OTHER constants in this same file, `SHUTDOWN_AWAIT_CAP_MS` and
`FACTORY_PROBABLE_CAPABILITIES`) and from the structural map's own
`runCapabilityProbe` breakdown note (153 LOC, band justify inside an
exempt-banded file, so no D9 breakdown finding may be filed against it at
all) — this claim names neither stale prose nor function size, only the
step (c) closure-array's disproportion to its own uniform job.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified independently at capability-probe.ts:294-308/337-361 (step (c)'s tuple-type + `.map()` + per-item closure genuinely add nothing over an inline `readProp(pi, name.slice(...))` loop, unlike step (b)'s seven closures which read seven differently-shaped expressions); capability-probe.md Step 0 (c) mandates only ordered `typeof <path>` checks, not a tuple/closure shape, so no spec conflict; host is not in quality/exemptions.json; PTQ-0302's ratified fix sourced this array from `FACTORY_PROBED_SDK_MEMBERS` but only ruled on deduplication, never on whether the closures themselves are needed — so the simpler shape remains an open design decision for a human, capped at questionable per the D8 rubric (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): inline the loop. In runCapabilityProbe step (c) (capability-probe.ts), replace the sdkMembers tuple array, its type and its .map with a direct for...of over FACTORY_PROBED_SDK_MEMBERS that computes observed = typeof readProp(pi, name.slice("pi.".length)) inline and keeps the identical short-circuit refusal ({ kind: "sdk-capability-missing", observed, required: "function", member: name }) inside the same PIC-6 try/catch. Step (b)'s heterogeneous closures are untouched. Behaviour identical; tests unchanged.
