---
id: PTQ-0098
title: The factory.ts module header says the bootstrap-failed diagnostics are added by V9a and that this leaf establishes only the never-throw boundary and the fixture registration seam, while the file itself now owns both and much more
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/factory.ts:22-25
  - src/extension/factory.ts:77-86
  - src/extension/factory.ts:1244-1250
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The factory.ts module header says the bootstrap-failed diagnostics are added by V9a and that this leaf establishes only the never-throw boundary and the fixture registration seam, while the file itself now owns both and much more

## Observation
The module header closes by scoping the file to its original increment: the
capability-probe refusal logic and the `theta/load/extension-bootstrap-failed`
diagnostics "are added by `V9a`", and "this leaf establishes only the
never-throw factory boundary and the per-theta command-registration seam".
Today the same file declares `EXTENSION_BOOTSTRAP_FAILED_CODE` (attributed by
its own doc comment to `V9k`, not `V9a`), constructs and emits those
diagnostics (`bootstrapFailedDiagnostic`, :158), and ships the production
default export that runs the capability probe and wires the refusal — plus
the supersession pass, drain-gated dispatch, and the `session_shutdown`
teardown wiring.

## Evidence
src/extension/factory.ts:22-25 — the header's scoping claim:
```ts
// registration-steps.md). The capability-probe refusal logic and the
// `theta/load/extension-bootstrap-failed` diagnostics are added by `V9a`; this
// leaf establishes only the never-throw factory boundary and the per-theta
// command-registration seam the in-memory fixture supply drives.
```

src/extension/factory.ts:77-86 — the same file declares the diagnostic code,
and its doc comment attributes it to `V9k`/`V9k-T`, contradicting the
header's `V9a` attribution:
```ts
/**
 * The diagnostics-registry code a factory-time bootstrap registration /
 * subscription failure surfaces (diagnostics/code-registry-load.md
 * `theta/load/extension-bootstrap-failed`). The paired `V9k` implementation
 * constructs this diagnostic when a factory-time `pi.registerFlag` or
 * `pi.on(...)` call throws; `V9k-T` declares the code so the failing tests can
 * anchor against it.
 */
export const EXTENSION_BOOTSTRAP_FAILED_CODE =
  "theta/load/extension-bootstrap-failed";
```

src/extension/factory.ts:1244-1250 — the file's default export runs the
capability probe and emits the refusal, the work the header defers to `V9a`:
```ts
  // `theta/load/host-incompatible` refusal through the tier-1 sink (no `ctx`
  // exists yet). Sub-step (f) (`probeSubagentExecutable`) is NOT run here: it
  // stays inside the per-theta compose pass (production-composition.ts), one
  // step later than capability-probe.md's short-circuit sequence places it —
  // a documented ordering discrepancy, not an omission (bug 0023 §Fix item 3).
  const probe = runCapabilityProbe(createProductionProbeHost(pi));
  if (!probe.ok) {
```

## Why this is a problem
Historical narration whose superseding feature has landed in the same file.
The "this leaf establishes only …" sentence described the `H4a` increment's
original scope; the file has since absorbed the `V9k` bootstrap-diagnostic
construction (:77-158), the probe-running production default export
(:1230-1276, `runCapabilityProbe` imported from `./capability-probe`), the
repeat-start supersession pass, and the teardown wiring. The header also
misattributes the bootstrap-failed diagnostics to `V9a` when the file's own
constant doc pins them to `V9k` — two provenance claims eight hundred lines
apart that cannot both be right. A reader orienting from the header is told
the file is a thin registration shell and that the refusal machinery lives
elsewhere; both statements are contradicted by the code below.

## Suggested direction (non-binding, optional)
Trim the header's last sentence to describe the file's current contents (or
recast the increment history into past tense), keeping the still-true
never-throw-boundary and registration-timing paragraphs.

## False-positive check
Verified the header's claims against current code: word-boundary grep for
`EXTENSION_BOOTSTRAP_FAILED_CODE` and `bootstrapFailedDiagnostic` shows both
declared and used in this file; `runCapabilityProbe` /
`hostIncompatibleDiagnostic` are imported at :69-73 and called at :1246-1248.
Confirmed the probe logic itself does live in `capability-probe.ts` (`V9a`),
so only the diagnostics half of the sentence and the "establishes only"
scoping are stale — the finding is confined to those claims. Git intent
check: `git log` on factory.ts shows the bug-0451/0453/0401 lifecycle-note
and supersession work landing after the header was written. Duplicate check:
grepped the filed corpus for factory.ts header citations — the filed
factory.ts findings (`theta-extension-deps-registry-unread`,
`whenidle-awaitcapms-vestigial-param`) cite :363-371, :1019, :1155-1160, not
the header; no filed finding cites factory.ts:22-25.

## Triage
verdict: confirmed — header:22-25 verbatim as cited; the diagnostics it defers to `V9a` are declared (:85), constructed (:158) and emitted at 11 sites in this same file and pinned to `V9k` by four other in-file comments (:80,:82,:121,:321), and the "establishes only" clause is contradicted by the probe-running default export (:1246-1249), supersession residue (:133-143) and teardown/drain wiring in a 1278-line file; `git log -L 23,25` shows the line untouched since the Jul-2026 rename while bug-0451/0453/0401 work landed after (triage: claude-opus-5)
