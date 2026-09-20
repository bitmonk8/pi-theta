---
id: pending
title: ProductionThetaProducer.#driveSubagentFnEntry runs six separable phases, including a 34-LOC inline params validator, in one 178-LOC body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:3294-3471
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-theta-producer.ts#ProductionThetaProducer.#driveSubagentFnEntry
d9_band: justify
wave: qw20260920223212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# ProductionThetaProducer.#driveSubagentFnEntry runs six separable phases, including a 34-LOC inline params validator, in one 178-LOC body

## Observation
`#driveSubagentFnEntry` (src/extension/production-theta-producer.ts:3294-3471, 178 LOC, band justify per the structural map) is the child side of a `subagent fn` call (RFC 0012 §10 per its doc comment). One body performs declaration resolution, construction of an inline `ParamsSchemaValidator` object literal, file-channel params intake, inbound wire-value decoding, FN-7 config + conversation bind, and body execution with terminal-envelope mapping.

## Evidence
Step inventory (line ranges from the current file; locals each phase writes → later phases read):

| phase | lines | LOC | writes | read by later phases |
|---|---|---|---|---|
| resolve fn declaration + mintInfra guard | 3294-3318 | 25 | `emitDiagnostic`, `mintInfra`, `lookupEnv`, `fn` | all |
| lowered params + inline validator | 3319-3367 | 49 | `imported`, `declSite`, `schemaDecls`, `enumDecls`, `loweredParams`, `validator` | intake, decode |
| file-channel params intake | 3368-3384 | 17 | `intake` | decode |
| inbound decode of arg values | 3385-3409 | 25 | `received`, `schemaNames`, `enumNames`, `declaringPath`, `argValues` | execute |
| FN-7 config + bind | 3410-3417 | 8 | `configured`, `binding` | execute, finally |
| execute body + terminal envelope mapping | 3418-3471 | 54 | `scope`, `execution`, `value`, `tail`, `payload`, `tooDeep`, `nonRepresentable` | — |

The validator phase is a self-contained 34-LOC object literal (3335-3367, excerpt):

```ts
    const validator: ParamsSchemaValidator = {
      validate: (params: unknown) => {
        const received = params ?? {};
        if (typeof received !== "object" || Array.isArray(received)) {
          return { ok: false as const, errorPath: "", detail: "fn arguments must be an object keyed by parameter name" };
        }
        const record = received as Record<string, unknown>;
        const declared = fn.params.map((param) => param.name);
```
It closes over exactly four values (`fn.params`, `fnName`, `loweredParams`, `this.#input.root.schemaValidator`). The terminal-mapping tail (3418-3458) reads only `execution`, `calleePath`, and the three `emit*` callbacks.

## Why this is a problem
Justify band (178 LOC ≥ 100): presumption of breakdown unless a concrete reason is found. Reasons considered and defeated: (a) closed-enumeration dispatch — no switch/if-chain over a spec-named set; the body is sequential phases; (b) single algorithm with shared local state — no single seam threads 6+ locals: the validator extraction threads 4 (named above), the terminal-mapping extraction threads 4 (`execution`, `calleePath`, `emitErr`/`emitEnvelope`), and the decode extraction threads 5 (`received`, `loweredParams`, `fn.params`, `schemaNames`/`enumNames`, `declaringPath`); (c) data-only — 0% tables; (d) grammar production family — not a parser; (e) generated — hand-authored (bug-numbered comments). The RFC 0012 §10 citation in the doc comment names the feature, not a single critical section: the phases are separated by awaited seams (`intakeChildParams`, `bindPromptConversation`, `executeBody`) already.

## Suggested direction (non-binding, optional)
All hypotheses unproven. Seam A: the inline params validator (3335-3367) -> `#subagentFnParamsValidator` helper (hypothesis) — 34 LOC, 0 exported symbols, 0 external importers, 4 cross-references back into the host (`fn.params`, `fnName`, `loweredParams`, schemaValidator). Seam B: the terminal envelope mapping (3418-3458) -> `#emitFnBodyTerminal` helper (hypothesis) — ~41 LOC, 0 exports, cross-refs `calleePath` and the emit callbacks. Seam C: the inbound decode block (3385-3409) -> shared helper with the arg-decode loop pattern (hypothesis) — ~25 LOC.

## False-positive check
Band: 178 LOC, justify — quoted from the structural map, not recounted. Reasons-considered list recorded above with the defeating counts per reason. Exemptions check: quality/exemptions.json holds one entry for this file (`D8:...#firstAdmittingArmProperties`), no D9 host entry for this member. Generated-code check: hand-authored (narrative bug-0303/PIC-60 comments). Spec-mirror check: no closed enumeration; RFC 0012 §10 names the feature area only. Duplicate check: prior-wave member filings on this file (qw20260920202922-d9-02..08) target spawnSubagentConversation, driveSubagentRootRegime, #driveCallee, bindPromptConversation, runBinder, #resolvePromptQuery — none targets #driveSubagentFnEntry; the file-level d9-01 inventories the cluster but files no member-level accounting for this host.

## Triage
verdict: questionable — accounting verified with one correction: size-scan map reproduces #driveSubagentFnEntry 3294-3471 / 178 LOC / band justify, quality/exemptions.json carries only the D8 #firstAdmittingArmProperties row for this file, all six inventory rows are real distinct phases at the cited lines (±1; validator literal 3335-3367 is 33 LOC, `try` opens 3417) each writing its own locals with no cross-row mutation, RFC 0012 §10 (659-732) describes the feature and pins no single critical section, git log -S shows only the introducing rfc-0012-step-7 commit and one bug-0479 edit (no prior split/revert), and no same-host filing exists (202922-d9-01 keys the file, d9-04/d9-07 key #driveCallee/driveSubagentRootRegime); correction — the filing undercounts two of its three seams: the terminal-mapping tail (3427-3458) reads execution, calleePath, emitErr, emitEnvelope, emitOutcome, ctx (3457) = 6 not 4, and the decode block (3385-3409) reads intake, schemaDecls, enumDecls, imported, lookupEnv, fnName, theta, fn, loweredParams = 9 not 5 (schemaNames/enumNames/declaringPath are computed inside the range), so beyond the validator the body is one data pipeline; reason (b) is still defeated because seam A closes over exactly fn, fnName, loweredParams + this (3), but whether a 33-LOC extraction leaving ~145 LOC (still justify) is worth it is a design decision for a human ruling (triage: claude-fable-5-1)
