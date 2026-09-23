---
id: pending
title: ProductionThetaProducer.#driveSubagentFnChild sequences argument-boundary guards, child launch assembly, and drive-plus-return-validation in one 97-LOC method
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:3666-3762
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#driveSubagentFnChild
d9_band: zone
wave: qw20260922211400
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# ProductionThetaProducer.#driveSubagentFnChild sequences argument-boundary guards, child launch assembly, and drive-plus-return-validation in one 97-LOC method

## Observation
`#driveSubagentFnChild` (src/extension/production-theta-producer.ts:3666-3762, 97 LOC per the wave's size-scan map, zone band) is the parent-side drive of a `subagent fn` child. It first runs two argument-boundary guards (ceiling #4 depth walk per positional arg; INV-6 `with { cwd }` validation/resolution), then assembles and spawns the child (FN-7 config, PIC-60 param bindings, `spawnSubagentConversation`), then drives the child and FN-6-validates its return inside a try/finally that tears the child down.

## Evidence
Distinct-concern inventory (zone band requires ≥ 2 rows):

| concern | members | line ranges | LOC |
|---|---|---|---|
| argument-boundary guards | ceiling-#4 per-arg `enforceInvokeParamsDepth` loop; INV-6 `rawCwd` string/empty validation + `resolvePath` | 3678-3705 | 28 |
| child launch assembly | `#applySubagentFnConfig` (FN-7), PIC-60 `paramBindings` map fill, `spawnSubagentConversation({...})` call | 3706-3730 | 25 |
| drive and return validation with teardown | `binding.drive()`, `driveFnTail`/`driveSource` reads, `#validateInvokeReturn` (FN-6), boundary-minted projection, `finally` teardown | 3731-3762 | 32 |

Excerpt of the guard concern's INV-6 arm (3687-3705, trimmed):

```ts
    let resolvedCwd: string | undefined;
    if (rawCwd !== undefined) {
      if (typeof rawCwd !== "string" || rawCwd === "") {
        const error: InvokeInfraError = {
          kind: "invoke_infra",
          message:
            typeof rawCwd !== "string"
              ? `subagent fn '${calleePath}' with-clause cwd is not a string`
              : `subagent fn '${calleePath}' with-clause cwd is empty`,
          callee_path: calleePath,
          cause: "validation",
        };
```

The same two guards exist as the opening half of `#guardInvokeBoundary` (5140-5255: per-arg depth loop at ~5178-5185, cwd validation at ~5187-5218, message text differing only in `subagent fn` vs `invoke callee`), so the guard concern already has a sibling-shaped home in this class. Cross-concern locals: `calleePath` (all three), `resolvedCwd` (guards → launch), `configured`/`paramBindings` (die inside launch assembly), `binding` (launch → drive/teardown) — 3 locals actually cross a row boundary.

## Why this is a problem
Zone band (97 LOC, FN zone ≥ 60): no presumption, so this files on the ≥ 2-concern inventory above — three concerns with noun names, each a contiguous range. Reasons considered and defeated: closed-enumeration dispatch — the phases cite three unrelated clause families (ceilings-3-and-4.md ceiling-4 / invocation.md INV-6, RFC 0012 FN-7 / PIC-60, invocation.md FN-6), not one spec-named closed set; single algorithm with shared local state — only 3 locals cross row boundaries (`calleePath`, `resolvedCwd`, `binding`), under the 6-local bar, and the `finally` critical section reads only `binding`; data-only, grammar-production, generated code — not applicable (imperative method, no generator banner). No exemptions.json row keys this host.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the two argument-boundary guards (3678-3705) -> a shared boundary-guard helper also usable by `#guardInvokeBoundary`'s identical first two guards (hypothesis) — ~28 LOC, no exported symbols, 0 external importers (src/tests), returns breach-or-`resolvedCwd` to the host. Seam B: drive + FN-6 validation + teardown (3731-3762) -> `#driveAndValidateFnChild` helper (hypothesis) — ~32 LOC, no exported symbols, 0 external importers, threads `binding`, `calleePath`, and the two return-site lookups back into the host. Seam C: none identified yet for the launch-assembly middle (it threads 7+ locals; leaving it in place keeps the host under the zone threshold once A or B lands).

## False-positive check
Band check: map row `#driveSubagentFnChild — 3666-3762 — 97 LOC — band zone` quoted from the wave's authoritative map; zone filings require the ≥ 2-concern inventory, given above. Reasons-considered list with defeating evidence recorded in "Why this is a problem". Exemptions check: quality/exemptions.json holds no D9 row for this file (only `D8:...#firstAdmittingArmProperties` and unrelated hosts). Generated-code check: no generator banner; hand-maintained comments cite bugs 0294/0342 and RFCs. Spec-mirror check: the three phases cite three different clause families, so no single spec table pins the body as one enumeration. Duplicate check: PTQ-1204 keys `#driveSubagentFnEntry` (the child-side entry, a different method), PTQ-1168 keys `spawnSubagentConversation`, PTQ-1150 keys the file; no prior filing keys this host. The guard-block duplication with `#guardInvokeBoundary` is D4 territory and is used here only as sibling-shape evidence, not as the finding.

## Triage
verdict: questionable — accounting verified against current code: size-scan map (one-line manifest) reports `#driveSubagentFnChild — 3666-3762 — 97 LOC — band zone` exactly as filed, quality/exemptions.json carries only the D8 `#firstAdmittingArmProperties` row for this file (no D9 key), and the 3687-3705 excerpt matches byte-for-byte; the three inventory rows re-read as real contiguous distinct phases (ceiling-#4 per-arg `enforceInvokeParamsDepth` loop + INV-6 cwd validate/`resolvePath` early-returns at 3678-3705; FN-7 `#applySubagentFnConfig` + PIC-60 `paramBindings` fill + `spawnSubagentConversation` literal at 3706-3730; `binding.drive()`/`driveFnTail`/`driveSource` + FN-6 `#validateInvokeReturn` + `finally` teardown at 3731-3762), with cross-row locals exactly `calleePath` (1→3), `resolvedCwd` (1→2), `binding` (2→3) = 3 < 6 and the `finally` reading only `binding`, so no shared-local-state reason was overlooked; no closed enumeration (three separate clause families), ~15 comment lines of 97 (not comment-dominated), no generator banner; `git log -S` shows the method minted whole in 89faa7c5 (RFC 0012 step 7) with no reverted split, sole caller at 3645; the guard-pair duplication with `#guardInvokeBoundary` is correctly left to D4 (REVIEW_LOG:619, 777); not a duplicate — PTQ-1274 keys `#guardInvokeBoundary`, PTQ-1204 keys `#driveSubagentFnEntry`, PTQ-1150/PTQ-1285 are file-level hosts listing this method only as a member, and the earlier same-host "kept whole" notes (REVIEW_LOG:619, 636) are worker reads without a filed inventory, not triage rulings; which seam (A guards / B drive+validate+teardown) and its home is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently against current code: size-scan map (one-line manifest) reports `#driveSubagentFnChild — 3666-3762 — 97 LOC — band zone` as filed; quality/exemptions.json holds only the D8 `#firstAdmittingArmProperties` key for this file (no D9 row); the 3687-3705 excerpt matches byte-for-byte; the ≥ 2-concern inventory holds — three contiguous phases with disjoint member sets (ceiling-#4 `enforceInvokeParamsDepth` loop + INV-6 cwd validate/`resolvePath` early-returns 3678-3705; FN-7 `#applySubagentFnConfig` + PIC-60 `paramBindings` + `spawnSubagentConversation` literal 3706-3730; `binding.drive()`/`driveFnTail`/`driveSource` + FN-6 `#validateInvokeReturn` + `finally` teardown 3731-3762) sharing only `calleePath`, `resolvedCwd`, `binding` across row boundaries (3 < 6), the `finally` reading only `binding`; no closed enumeration (three clause families), no generator banner, no spec_topics clause names the method, `git log -S` shows one minting commit 89faa7c5 with no reverted split, sole caller at 3645; the sibling guard pair in `#guardInvokeBoundary` (~5178-5218, messages differ only `invoke callee` vs `subagent fn`) is real and correctly left to D4; not a duplicate — PTQ-1274 keys `#guardInvokeBoundary` (cites this method only as a separability witness), PTQ-1204 keys `#driveSubagentFnEntry`, PTQ-1150/PTQ-1285 are file-level hosts, REVIEW_LOG:777 records only this filing; which seam and its home is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current code with a +127 line drift (size-scan map one-line manifest: `#driveSubagentFnChild — 3793-3889 — 97 LOC — band zone`, FN zone ≥ 60; quality/exemptions.json carries no D9 key for this file, only the D8 `#firstAdmittingArmProperties` row); the body at 3793-3889 matches the filed excerpt byte-for-byte and the three inventory rows are real contiguous phases with disjoint members (ceiling-#4 `enforceInvokeParamsDepth` loop + INV-6 cwd validate/`resolvePath` 3805-3832; FN-7 `#applySubagentFnConfig` + PIC-60 `paramBindings` + `spawnSubagentConversation` literal 3833-3857; `binding.drive()`/`driveFnTail`/`driveSource` + FN-6 `#validateInvokeReturn` + `finally` teardown 3858-3888), cross-row locals exactly `calleePath`/`resolvedCwd`/`binding` = 3 < 6 with `configured`/`paramBindings` dying in row 2, no closed enumeration, no generator banner, single minting commit 89faa7c5 with no reverted split, sole caller at 3772; STATE CHANGE since filing that the human ruling should weigh: PTQ-1274 has been FIXED and `#guardInvokeBoundary` (now 53 LOC) delegates to a file-local `invokeBoundaryArgGuards(calleePath, argValues, ctx, rawCwd)` at 5613-5646 whose body is this method's row 1 verbatim except the `invoke callee` vs `subagent fn` message prefix — so Seam A's home already exists and row 1 is now a D4-class clone of it (a mechanical dedupe would leave ~74 LOC, still zone), while rows 2-3 remain a two-concern breakdown whose seam is a design decision; not a duplicate (PTQ-1274 keyed `#guardInvokeBoundary`, PTQ-1204 keys `#driveSubagentFnEntry`, PTQ-1285 is file-level, REVIEW_LOG:803 lists this host as "pending intake") (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
