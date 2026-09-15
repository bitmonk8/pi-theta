---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: attachChildActivityTap bundles ordinary child-event classification with the reserved-key theta_progress acceptance state machine
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/child-tap.ts:74-210
  - src/extension/execution-status/child-tap.ts:89-106
  - src/extension/execution-status/child-tap.ts:107-184
  - src/extension/execution-status/child-tap.ts:185-208
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/execution-status/child-tap.ts#attachChildActivityTap # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: justify              # D9 breakdown only: zone | justify | strong
wave: qw20260915044704
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-15
---

# attachChildActivityTap bundles ordinary child-event classification with the reserved-key theta_progress acceptance state machine

## Observation
`attachChildActivityTap` (src/extension/execution-status/child-tap.ts:74-210,
137 LOC) is the sole function-level over-threshold item in this file
(FN_BANDS justify is 100-199 LOC; the file itself is band-exempt at 210 LOC).
The file's own header states the tap recognises TWO distinct wire formats off
one stdout line stream: ordinary `--mode json` events (only `type` and, on
`tool_execution_start`, `toolName` are read) and the L3 reserved-key
`theta_progress` envelope (its own `v`/`seq`/`invocation_id` acceptance
guards plus five class-2 event fields, per EXST-5/EXST-15/PIC-74). Both
decode paths, plus a shared size-gate/parse/type-guard preamble, live in this
one function body.

## Evidence
Step inventory (line ranges/LOC re-verified by direct read; locals each
phase reads/writes):

| concern | members / phase | line ranges | LOC | locals read / written |
|---|---|---|---|---|
| line-level admission | size check, `JSON.parse` trap, non-object/null guard, `record` cast | 89-106 | 18 | reads `line`; writes `parsed`, `record` |
| reserved-key `theta_progress` envelope decode + PIC-74 acceptance state | version/seq/invocation-id/message-type guards, rate gate, clamp+carry | 107-184 | 78 | reads `record`, `clock`; reads/writes `lastSeq`, `latchedInvocationId`, `lastAcceptedAtMs`, `tapDropped`; calls `clampAuthorMessage`, `publish` |
| ordinary `--mode json` event classification | `switch (record.type)`, 4 named cases + default | 185-208 | 24 | reads `record.type`, `record.toolName`; calls `publish` — touches none of the four acceptance-state locals or `clock` |

Excerpt, the closure-scoped acceptance state only the middle phase reads/writes
(74-86):
```ts
export function attachChildActivityTap(
  child: Pick<SubagentChildProcess, "onStdoutLine">,
  publish: (event: ChildTapEvent) => void,
  opts?: ChildTapOptions,
): () => void {
  const clock = opts?.clock;
  let lastSeq = 0;
  let latchedInvocationId: string | undefined;
  let lastAcceptedAtMs: number | undefined;
  let tapDropped = 0;
```

Excerpt, the boundary from the reserved-key phase back into the ordinary-event
phase (182-188 — nothing between these two phases reads the acceptance
state):
```ts
      publish({ type: "theta_progress", payload });
      return;
    }
    // 4. Switch on `type` — the only universally-read field. Everything else
    //    (`message_update`, `tool_execution_update`, `agent_start`, the session
    //    header, a `theta_result` envelope line, unknown kinds) is ignored.
    switch (record.type) {
```

## Why this is a problem
Justify band (137 LOC) — presumption of breakdown unless a concrete reason
is found. Reasons considered and why each fails to rescue the whole function:
- Closed-enumeration dispatch: real, but only for the tail (185-208, 24 of
  137 LOC) — the `switch (record.type)` mirrors a closed set with short arms
  (3-8 lines each). It does not reach the 78-LOC reserved-key phase
  (107-184), which is a sequential guard chain, not a dispatch's arms.
- Single algorithm with shared local state: the reserved-key phase alone
  touches 4 mutable locals (`lastSeq`, `latchedInvocationId`,
  `lastAcceptedAtMs`, `tapDropped`) plus the closed-over `clock` — short of
  the "6 or more" bar this reason names, and more directly: the
  ordinary-event phase (185-208) reads and writes NONE of them, so a split
  along the 106/107 and 184/185 boundaries would not need to thread this
  state across the split at all. The two phases are evidenced-disjoint in
  state usage, which defeats rather than supports a shared-state defense
  spanning the whole function.
- Data-only module/type family, one grammar production family, generated
  code: none apply — this is hand-written control flow over two distinct
  wire formats, not tables, not a grammar production, not generated.

## Suggested direction (non-binding, optional)
Seam A: extract the reserved-key `theta_progress` envelope decode (107-184,
78 LOC) into its own helper (hypothesis: a `createProgressEnvelopeDecoder`
closure factory mirroring `attachChildActivityTap`'s own shape, returning a
`(record: unknown) => ChildTapEvent | undefined` closed over the 4-local
acceptance state) - 0 exported symbols today, 0 external importers (the
state is entirely private); the only cross-reference back into the host is
the `publish` callback already passed in and the one call site inside the
returned `onStdoutLine` listener.
Seam B: leave the reserved-key decode in place and instead extract only the
ordinary-event tail (185-208, 24 LOC) into a small named dispatch helper ->
hypothesis `classifyChildStdoutEvent(record): ChildTapEvent | undefined` for
the outer callback to `publish` - 0 exported symbols, 0 external importers,
no shared-state cross-reference (the disjointness shown above holds either
direction).

## False-positive check
- Band: justify (137 LOC; FN_BANDS zone=60/justify=100/strong=200).
- Reasons-considered: listed above, each defeated with a line-range/LOC
  count or a locals list.
- Exemptions check: `quality/exemptions.json` read in full — 4 entries, none
  naming `child-tap.ts` or `attachChildActivityTap`.
- Generated-code check: `grep -n "@generated\|DO NOT EDIT\|autogenerated"
  src/extension/execution-status/child-tap.ts` — no hits.
- Spec-mirror check: `execution-status.md` (EXST-5/EXST-15) and
  `subagent.md` (PIC-74), both cited in the file's own header, describe two
  SEPARATE things — the ordinary `--mode json` event fields and the
  `theta_progress` reserved-key envelope's own acceptance guards — matching
  the two-phase split proposed above rather than one spec table enumerating
  a single dispatch.
- Prior-finding check: searched `quality/resolved/`, `quality/issues/`, and
  this wave's own `quality/intake/` for `attachChildActivityTap`/`child-tap`
  — the only existing entry
  (`qw20260915044704-d2-02-child-tap-makelinepump-citation-stale.md`, this
  same wave) is a D2 citation-staleness finding on an unrelated doc comment,
  not a D9 breakdown claim; no overlap.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: size-scan.mjs reproduces 137 LOC/justify band for attachChildActivityTap (file itself exempt at 210 LOC), the 3-row inventory (89-106/107-184/185-208) matches direct read, and the ordinary-event tail is confirmed locals-disjoint from the 4 acceptance-state locals + clock (grep of 185-208 finds none); reasons-considered (dispatch, <6 shared locals, data-only, grammar, generated, spec-invariant) are each correctly defeated — but per D9 policy the split shape is a human design decision, never confirmed (triage: claude-opus-5)
