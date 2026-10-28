---
id: pending
title: subagent-spawn-regime.ts contains parent launch and child execution families at 1763 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/subagent-spawn-regime.ts:1-1763
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/subagent-spawn-regime.ts
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# subagent-spawn-regime.ts contains parent launch and child execution families at 1763 LOC

## Observation
The authoritative structural map measures this file at 1763 LOC, justify band, and `SubagentSpawnRegime` at 1523 LOC. Its header names both the parent-side eager process launch and the child-side process-root drive, extracted from `ProductionThetaProducer`. The module also implements both ends of a `subagent fn` call. The class stores only construction collaborators, `#input` and `#deps` (241-248); invocation state belongs to individual method calls.

## Evidence
Declaration-body LOC below are sums of the supplied map's member LOC, not a new size scan. These rows inventory executable member groups, not all header/import/comment lines in the file.

| concern | members | line ranges | LOC |
|---|---|---|---|
| parent process launch | spawnSubagentConversation, #buildControlPlaneEnv, #launchSubagentChild, #renderChildSystemPrompt, #marshalChildCallables, #placementResolver, #paramsMarshalDeps | 260-437; 447-500; 512-647; 650-717; 720-790; 799-811; 818-833 | 636 |
| child root and envelope settlement | #intakeSubagentRootParams, isSubagentRootFor, driveSubagentRootRegime, #bindMarshalledRootParams, #emitOkEnvelopeGuarded, #confirmChildModelOrRefuse, #requestVisibleChildShutdown, #subagentRootIntendedModelRef | 843-881; 890-901; 916-1032; 1042-1074; 1095-1126; 1129-1191; 1407-1409; 1441-1453 | 312 |
| child fn entry and configuration | #driveSubagentFnEntry, #subagentFnParamsValidator, #resolveSubagentFnDecl, #applySubagentFnConfig | 1219-1350; 1353-1391; 1418-1429; 1474-1506 | 216 |
| parent fn boundary and return projection | resolveSubagentFnChild, #driveSubagentFnChild, #guardSubagentFnArgs, #driveAndValidateFnChild, #resolveSubagentFnReturnSite, #subagentFnDeclaringPath | 1537-1579; 1582-1625; 1634-1667; 1674-1711; 1724-1754; 1757-1762 | 196 |

Parent placement telemetry (404-407):
```ts
      statusBus?.invocationPlaced(ticket.invocationId, {
        backend: placement.name,
        handle: placedHandle,
      });
```
Child body execution (989-992):
```ts
    // the body in-process against the child's session.
    const binding = this.#deps.bindPromptConversation(rootBindInput);
    try {
      const execution = await executeBody(theta.body, binding.executeDeps);
```
Child fn configuration and isolated scope (1304-1315):
```ts
    const configured = this.#applySubagentFnConfig(theta, fn.sessionConfig ?? {}, ctx);
    const binding = this.#deps.bindPromptConversation({
      ...bindInput,
      theta: configured.theta,
      ctx: configured.ctx,
    });
    try {
      // FN-6: arguments bind by value into a fresh isolated scope opened
      // against the DECLARING module (bug 0303) — no closure over anything.
      const bodyEnv = binding.executeDeps.env;
      const moduleEnv = bodyEnv.resolve(fnName).moduleEnv;
      const scope = (moduleEnv ?? bodyEnv).spawnIsolatedScope();
```
Parent fn result carriage (1688-1690):
```ts
      const result = await binding.drive();
      const fnTail = binding.driveFnTail?.();
      const bodySource: InvokeResultSource = binding.driveSource?.() ?? "callee-returned";
```

Map-quoted external importer counts (src/tests): `SubagentSpawnRegime` 1/0; `SubagentSpawnRegimeDeps` 0/0; `emitSubagentChildOutcomeContained` 1/0; `requestVisibleChildShutdown` 1/0. Private implementations in the inventory have no independent module exports/importers.

## Why this is a problem
The justify band carries a presumption of breakdown. Reasons considered: single algorithm with shared local state fails at file scope because the four groups execute in distinct parent/child invocations and the only two class fields are collaborator references, not a common algorithm's six-local working set. There are concrete shared calls: child root and child fn entry use `#emitOkEnvelopeGuarded`; parent launch and child fn entry use configuration/declaration helpers. Those are named method boundaries already, not shared stack locals requiring one source file. Closed-enumeration dispatch fails because launching a process, intaking its params, and driving its body are not arms of one spec-named enumeration. Data/type-family fails: the four method groups alone account for 1360 mapped LOC, while the standalone deps interface is 35 LOC. Grammar-production and generated-code reasons do not apply to these host adapters. The header cites PIC launch clauses, INV-4/INV-8, EXST and CANCEL-5 separately, not one file-wide critical section.

## Suggested direction (non-binding, optional)
All hypotheses unproven; human ratification required. Seam A: child root/envelope members plus child fn entry/validator -> `production-subagent-root-driver.ts` (hypothesis) - 483 mapped member LOC, 0 module-exported symbols moved, external importers of those implementations 0/0, cross-references back: `#resolveSubagentFnDecl`, `#applySubagentFnConfig`, construction `#input`/`#deps` (the latter already supplies bind/model/ticket callbacks). Seam B: parent process-launch group -> `production-subagent-launch.ts` (hypothesis) - 636 mapped member LOC, 0 module-exported symbols moved, external importers of those implementations 0/0, cross-references back: parent fn `#driveSubagentFnChild` calls `spawnSubagentConversation`; launch otherwise consumes `#input`/`#deps` and its own group. Counts do not assume moving the exported facade class.

## False-positive check
Band: 1763 LOC / justify from the supplied map. Reasons-considered list and defeating evidence appear above. Exemptions check: no D9 row for this path in `quality/exemptions.json`. Generated-code check: header and method bodies are hand-authored RFC/bug adapters, with no generator banner. Spec-mirror check: header 15-17 names several contracts; no closed enumeration spans these method groups. Placement/husk check: these are live extension-to-host adapters, not a re-export barrel or a hollow module. History check: `git log -5 --oneline --follow -- src/extension/subagent-spawn-regime.ts` includes extraction-era commit `48b6a1b7` and subsequent feature/bug work, not evidence of a reverted split. Duplicate check: PTQ-1285 and PTQ-1608 concern the producer file, whereas this finding keys the extracted regime file; PTQ-1168/1288/1192/1437/1204 concern individual methods and are not re-filed here. No existing intake/open D9 host row for this regime path was found. This finding is file placement/breakdown accounting only, not the launch-error posture in PTQ-1548.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 1763 LOC / justify, the 1523-LOC class, all member ranges, importer counts, and the four concern totals (636/312/216/196 LOC); all four excerpts match. Parent launch, child execution/settlement, child fn intake/configuration, and parent fn return validation are distinct live member families with only construction collaborators as fields, not one shared-local algorithm. No D9 exemption, generated/data-heavy structure, file-wide spec invariant or closed enumeration, or reverted split was found; history shows the extraction persisted. Existing producer-file and method-level findings do not track this file-level root cause. The target breakdown shape needs a human ruling. (triage: claude-opus-5-5)
