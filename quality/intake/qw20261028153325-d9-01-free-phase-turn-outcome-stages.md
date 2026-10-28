---
id: pending
title: LivePromptQueryModel.nextFreePhaseTurn holds first-turn setup and post-turn outcome selection in one 113-LOC body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/live-prompt-query-driver.ts:322-434
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/live-prompt-query-driver.ts#LivePromptQueryModel.nextFreePhaseTurn
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# LivePromptQueryModel.nextFreePhaseTurn holds first-turn setup and post-turn outcome selection in one 113-LOC body

## Observation
The authoritative map measures `LivePromptQueryModel.nextFreePhaseTurn` at 113 LOC, function band justify, in the 1506-LOC live prompt-query driver. The header describes an on-session `QueryModelDriver` and repair-outcome mapping, with settlement, capture, and off-session dispatch delegated to siblings. This member opens the initial query window and drives a turn, selects the resulting free-phase outcome, and supplies synthetic exhaustion rounds on subsequent calls. The drive itself already lives in `#driveUserVisibleTurn`; the post-drive selection remains inline here.

## Evidence
Step inventory, with inclusive span LOC subordinate to the map's 113-LOC total:

| phase | line ranges | LOC | locals and state read/written |
|---|---|---|---|
| round selection, provider gate, query-window capture, first drive | 322-348 | 27 | reads parameter `round`, `#respond`, `#readMessages`, `#readContextPath`; writes `#queryWindowStart`, `#queryPathBefore`, `#freePhaseDriven`; calls `#driveUserVisibleTurn(true)` |
| interleaving, send failure, blocked budget, finalization, captured-recovery selection | 349-383 | 35 | creates/consumes `interleaving` and `finalized` locally; reads `#thetaAbort`, `#transportFromThrow`, `#exhaustion`, `#lostFinalOutput`, `#respond`, `#provider`, `#endedOnCapturedRecovery`; calls existing outcome/finalization helpers |
| post-turn probe, unblocked budget boundary, text extraction | 384-417 | 34 | creates/consumes `failure` locally; reads `#acceptedMessages`, `#thetaAbort`, `#provider`, `#exhaustion`; calls `#budgetConsumedWithoutBlock`, `#emitUntypedBoundaryDiscardNote`, `#exhaustionTurn` |
| subsequent synthetic rounds and totality return | 418-434 | 17 | reads `#exhaustion`; calls `#budgetConsumedWithoutBlock`, `#exhaustionTurn`; no local result crosses back to the initial-drive branch |

There are **zero locally declared values crossing these phase boundaries**: `interleaving` and `finalized` stay in the second row; `failure` stays in the third. The parameter `round` selects the outer branch; the post-drive outcome block does not read it. The shared observations are already instance fields, accessible to an in-class helper without inventing a state object or threading local variables.

Window setup and the existing drive seam, `src/extension/live-prompt-query-driver.ts:338-339,347-350`:

```ts
      this.#queryWindowStart ??= this.#readMessages().length;
      this.#queryPathBefore ??= new Set(this.#readContextPath().map((entry) => entry.id));
```

```ts
      await this.#driveUserVisibleTurn(true);
      this.#freePhaseDriven = true;
      const interleaving = this.#typedInterleavingFailure();
      if (interleaving !== undefined && !this.#thetaAbort.signal.aborted) return { kind: "transport", error: interleaving };
```

The new-output finalization selection is a post-drive return, not part of window setup (`:367-372`):

```ts
      if (this.#lostFinalOutput) {
        if (this.#respond !== undefined) return { kind: "text", text: "" };
        if (this.#budgetConsumedWithoutBlock()) return this.#exhaustionTurn(this.#exhaustion?.lastAllowedToolName);
        const finalized = await this.#finalize();
        return finalized.kind === "text" || finalized.kind === "transport" ? finalized : finalizationFailure(this.#provider, "unexpected typed result");
      }
```

The probe consumes only instance observations (`:392-399`):

```ts
      const failure = probePostTurnFailure(this.#acceptedMessages, {
        aborted: this.#thetaAbort.signal.aborted,
        provider: this.#provider,
        excludeCancelled: true,
      });
      if (failure !== undefined) {
        return { kind: "transport", error: failure as TransportError | ContextOverflowError };
      }
```

The map lists the non-exported `LivePromptQueryModel` class at **0 src / 0 tests importers**; it does not list separate importer counts for members. This finding changes no exported contract.

## Why this is a problem
The justify band presumes breakdown unless a concrete reason is recorded. The method contains separable first-turn setup and post-turn interpretation, with no local state flowing between them and an existing await boundary between driving and interpreting the turn.

Reasons considered:

- **Single algorithm with shared local state:** the inventory has zero cross-phase local declarations, below the six-local reason. A private outcome helper reads the same existing fields; no new carrier is required.
- **Closed-enumeration dispatch / spec mirror:** PIC-50, PIC-51/PIC-51b, PIC-78's captured-recovery sub-case, and bounded output finalization in `docs/spec_topics/pi-integration-contract/conversation-drive.md` prescribe precedence among outcomes, not one short arm per member of a closed table. The proposed outcome block can retain that precedence intact. The method is not the send/start/end/settle critical section governed by PIC-70/PIC-78.
- **Data-only/type family:** the inventory consists of executable gating, awaited drive/finalization calls, and returns; there is no literal registry or type family accounting for 80% of this body.
- **Grammar production:** this is a runtime driver method, not a recognizer.
- **Generated code:** no generator marker; its current changes are hand-written fixes, including `e071eada` (output finalization) and `22d1e095` (owned-turn projection/omission handling).

Comments contribute to the scanner's LOC; this report does not substitute an executable-statement recount for the supplied measurement.

## Suggested direction (non-binding, optional)
**Unproven hypothesis; human ratification required.** Seam A: post-drive outcome selection (`349-416`) -> private `#freePhaseOutcome` helper (hypothesis) — 68 LOC, 0 exported symbols moved, 0 external importers of moved exports (there are none); cross-references back into the host: existing observation fields listed in the inventory and `#typedInterleavingFailure`, `#budgetConsumedWithoutBlock`, `#exhaustionTurn`, `#finalize`, `#emitUntypedBoundaryDiscardNote`. The precedence sequence would move as one block; this is not a proposal to reorder its checks.

## False-positive check
- **Band:** 113 LOC / justify from the authoritative map, not a hand recount. Every inventory range and excerpt was re-read immediately before filing.
- **Reasons considered:** enumerated above with the local seam cost and distinction from the actual driven-turn critical section.
- **Exemptions:** `quality/exemptions.json` has no key for this member or this file.
- **Generated-code check:** no generation banner; recent file history names the hand-written bug fixes cited above.
- **Spec-mirror check:** the cited PIC clauses impose outcome ordering, not an enumeration whose arm count accounts for this length.
- **Duplicate / prior ruling:** PTQ-1276 concerns the file's former capture/settlement/off-session families, now delegated; PTQ-1210 concerns `driveRepairAttempt`, whose restarted phase is already a separate method. Neither is this member's setup/outcome boundary. The rejected `#driveUserVisibleTurn` filing recorded in `quality/TRIAGE_LOG.md:277` concerns a different member with shared locals and nested cleanup scopes; none of those scopes or locals is in this body. Searches for `d9_host:.*nextFreePhaseTurn` in `quality/{issues,resolved,intake}` found no existing host filing before this report was written. No dead-code, naming, duplication, or test claim is filed here.

## Triage
verdict: questionable — accounting verified: size-scan reproduces nextFreePhaseTurn at 322-434, 113 LOC / justify, in the 1506-LOC file; excerpts and inventory ranges match, with distinct window setup/drive, post-drive interpretation and subsequent synthetic-round handling, and zero locally declared values crossing those boundaries. No host exemption or applicable shared-local critical section, closed-enumeration table, data/type, grammar or generated-code reason was found; PIC-50/51/51b/78 and bounded finalization constrain outcome precedence, not one method body. PTQ-1276, PTQ-1210 and the prior #driveUserVisibleTurn rejection concern different breakdowns; no same-host filing was found. The target breakdown needs a human ruling. (triage: claude-opus-5-5)
