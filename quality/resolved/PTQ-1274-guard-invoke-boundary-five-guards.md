---
id: PTQ-1274
title: ProductionThetaProducer.#guardInvokeBoundary runs five separable boundary guards in one 116-LOC body
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:5137-5252
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#guardInvokeBoundary
d9_band: justify
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# ProductionThetaProducer.#guardInvokeBoundary runs five separable boundary guards in one 116-LOC body

## Observation
`#guardInvokeBoundary` (src/extension/production-theta-producer.ts:5137-5252, 116 LOC, justify band per the wave map) is the pre-drive gate for an `invoke(...)` hop. It runs five guards in sequence, each terminating early with a boundary-minted `Err`, and on full pass returns `{ callee, resolvedCwd }`. The host file is itself strong-band (6477 LOC; file-level breakdown already on record as PTQ-1150).

## Evidence
Step inventory (ranges re-read before filing):

| phase | line range | LOC | locals read / written |
|---|---|---|---|
| per-arg depth-≤5 cap (Ceiling #4, CIO-3) | 5147-5169 | 23 | reads `calleePath`, `argValues`; early return |
| with-clause `cwd` validation + resolve (INV-6) | 5170-5200 | 31 | reads `rawCwd`, `ctx.cwd`, `calleePath`; writes `resolvedCwd` |
| containment re-check (INV-1) | 5202-5206 | 5 | reads `theta`, `calleePath`; awaits `#recheckCalleeContainment` |
| callee parse/load classification (bug 0293) | 5207-5236 | 30 | reads `this.#input.parseCallee`, `theta.sourcePath`; writes `parsed`, `callee` |
| prompt-mode-under-clause refusal (INV-8) | 5237-5250 | 14 | reads `resolvedCwd`, `callee.frontmatter.mode` |

Excerpt of the phase boundary shape (5161-5169):
```ts
    for (const argValue of argValues) {
      const breach = enforceInvokeParamsDepth(calleePath, argValue);
      if (breach !== undefined) {
        // This ceiling refusal is THIS hop's own guard on the caller-supplied
        // argument — the callee never ran (bug 0294 provenance).
        return { source: "boundary-minted", result: breach.result };
      }
    }
```
Separability witness: phases 1 and 2 are already duplicated nearly verbatim in `#driveSubagentFnChild` at 3681-3706 (`enforceInvokeParamsDepth` loop at 3681-3686, cwd validation/`resolvePath(ctx.cwd, rawCwd)` at 3687-3705) — the guards already live independently of this body's remaining state.

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to keep whole is found. Reasons considered and defeated: (1) closed-enumeration dispatch — no switch/if-chain mirroring a spec-named closed set; the five guards are distinct spec clauses (Ceiling #4, INV-6, INV-1, bug 0293, INV-8), not one enumeration. (2) Single algorithm with shared local state — cross-phase state is exactly two locals (`resolvedCwd` written in phase 2 and read in phase 5; `callee` written in phase 4 and returned), far below the 6-local threading cost. (3) Data-only — 0% of LOC are declarations/tables. (4) Grammar production — not a parser. (5) Generated — hand-written. The ordering the comments pin ("Runs before the containment re-check", "Placed BEFORE the prompt-attach branch") is a caller-visible early-return order that a thin ordered driver over extracted guards preserves; no observable step would interleave.

## Suggested direction (non-binding, optional)
Seam A (hypothesis, unproven): per-arg depth walk + cwd validation (5147-5200) -> `invokeBoundaryArgGuards` helper (new module or file-local function) — ~54 LOC, 0 exported symbols today, 0 external importers, no cross-references back into the host; would also serve the duplicate at 3681-3706. Seam B (hypothesis, unproven): callee parse/load classification (5207-5236) -> `#parseCalleeOrErr` private method — ~30 LOC, 0 exports, one back-reference (`this.#input.parseCallee`). Seam C: none identified yet for INV-8 beyond folding into Seam A's module.

## False-positive check
Band confirmed from the wave map (116 LOC, justify). Reasons-considered list above with defeating evidence per reason. Exemptions check: quality/exemptions.json holds one entry for this file (`D8:...#firstAdmittingArmProperties`) — not this host, not D9. Generated-code check: hand-written, no generator header. Spec-mirror check: the cited clauses (INV-1/INV-6/INV-8, ceiling-4 table) are five different spec sections, not one closed enumeration this body's length mirrors. Duplicate-filing check: no existing PTQ names `#guardInvokeBoundary` (PTQ-1183 covers `#driveCallee`; PTQ-1150 is the file-level filing). The 3681-3706 duplication itself is D4 territory and is routed in the shard notes, not filed here.

## Triage
verdict: questionable — accounting verified: size-scan map (one-line manifest) reports #guardInvokeBoundary 5137-5252 / 116 LOC / band justify and quality/exemptions.json holds only the D8 #firstAdmittingArmProperties key for this file (no D9 row); all five inventory rows re-read at the cited lines and are distinct independent early-return guards citing five different clauses (ceiling-#4 per-arg walk, INV-6 cwd validate/resolve, INV-1 containment re-check, bug-0293 load/parse classification, INV-8 prompt-mode refusal) with `parsed` confined to row 4 and cross-row locals exactly resolvedCwd (row 2→5) and callee (row 4→return) = 2 < 6, no try/finally or shared mutable holder, ordering comments are sequential-call-preserving; the separability witness reproduces (#driveSubagentFnChild 3681-3706 carries the same depth-cap + cwd pair, correctly routed to D4 in REVIEW_LOG:619, not filed here); git log -S shows the method was minted by the PTQ-1183 fix commit 475e62db with no split ever reverted; not a duplicate — PTQ-1183 (fixed) keyed #driveCallee and this is the fresh justify-band residual its Seam A produced (PTQ-0351-style follow-up), PTQ-1150 is the file-level host; target seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map (one-line manifest) reports #guardInvokeBoundary 5134-5249 / 116 LOC / band justify (3-line drift from the cited 5137-5252, content matches), quality/exemptions.json carries only the D8 #firstAdmittingArmProperties key for this file (no D9 row), the five inventory rows are real distinct early-return guards each citing its own clause (Ceiling #4 per-arg walk, INV-6 cwd validate/resolve, INV-1 containment re-check, bug-0293 load/parse classification, INV-8 prompt-mode refusal) with exactly two cross-row locals (resolvedCwd row 2→5, callee row 4→return) so no strong keep-whole reason was overlooked, the separability witness reproduces at #driveSubagentFnChild 3678-3703 (same depth-cap loop + cwd block, D4-routed per REVIEW_LOG:619), sole caller at 4970, method minted by PTQ-1183 fix commit 475e62db with no reverted split; not a duplicate — PTQ-1183 (resolved) keyed #driveCallee and named this method only as its Seam A hypothesis, PTQ-1150 and the qw20260922164435-d9-01 residual are file-level filings that merely list it as a member; the target seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against current code: size-scan map (one-line manifest) reports `#guardInvokeBoundary — 5132-5247 — 116 LOC — band justify` (5-line drift from the cited 5137-5252, content matches byte-for-byte incl. the 5161-5169 excerpt), quality/exemptions.json carries only the D8 `#firstAdmittingArmProperties` row for this file (no D9 key for this host or file); the five inventory rows are real distinct early-return guards each anchored to its own clause (Ceiling #4 per-arg `enforceInvokeParamsDepth` loop, INV-6 cwd validate + `resolvePath(ctx.cwd, rawCwd)`, INV-1 `#recheckCalleeContainment`, bug-0293 `parseCallee` load/parse classification, INV-8 prompt-mode-under-clause refusal), `parsed` confined to row 4, cross-row locals exactly `resolvedCwd` (row 2→5) and `callee` (row 4→return) = 2 < 6, no try/finally or shared mutable holder, so no concrete/strong keep-whole reason was overlooked; separability witness reproduces at `#driveSubagentFnChild` 3676-3701 (same depth loop + cwd block, D4-routed per REVIEW_LOG:619, correctly not filed here); sole caller at 4968; `git log -S` shows the method minted by PTQ-1183 fix commit 475e62db with no reverted split; not a duplicate — PTQ-1183 (resolved) keyed `#driveCallee` and named this method only as its Seam A hypothesis, PTQ-1150 and the qw20260922164435-d9-01 residual are file-level filings listing it as one member of an "invoke machinery" row; the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-22): confirmed - batch ruling over the RFC-0015-era review wave; triage verification trusted.
