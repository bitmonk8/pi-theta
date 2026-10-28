---
id: pending
title: SubagentSpawnRegime.#launchSubagentChild combines session policy, placement and launch settlement in 136 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/subagent-spawn-regime.ts:512-647
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/subagent-spawn-regime.ts#SubagentSpawnRegime.#launchSubagentChild
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# SubagentSpawnRegime.#launchSubagentChild combines session policy, placement and launch settlement in 136 LOC

## Observation
The structural map measures `#launchSubagentChild` at 136 LOC, justify band (100-199 function LOC). The enclosing module's header assigns it the parent-side eager launch half of the producer's subagent regime. This helper handles collaborator availability, child session-log policy failure, placement-lease acquisition, launch-request assembly, and failed-launch settlement. It is the helper introduced by the earlier spawn-conversation extraction, not the already-filed `spawnSubagentConversation` host.

## Evidence
The host total and band are from the supplied map; phase spans below partition that mapped range.

| phase | line range | LOC | locals read | locals written / lifetime |
|---|---|---|---|---|
| launch input contract | 512-529 | 18 | input type dependencies | input parameter; used throughout |
| collaborator availability | 530-545 | 16 | input; #input.subagentExecutableHost; #placementResolver | theta, model, emitDiagnostic, paramsCleanup, finishInvocation, executableHost, placementResolver; retained after guard |
| session-log derivation and refusal | 546-567 | 22 | input.label, theta, emitDiagnostic, paramsCleanup, finishInvocation; #input.subagentChildSessionPath | childSessionPath for argv; policyThrow/reason die in catch |
| placement lease and presentation | 568-579 | 12 | placementResolver, model, theta | placementLease, placement, presentation; consumed by launch/settlement |
| configured child launch | 580-623 | 44 | input fields, theta, model, childSessionPath, placement, presentation, executableHost, emitDiagnostic; #input.activeRoots/subagentParentPid/subagentOpenWire | launch; consumed by failed-launch and return arms |
| failed-launch settlement | 624-640 | 17 | launch, placementLease, paramsCleanup, finishInvocation, theta, emitDiagnostic | reason; dies in refusal arm |
| placed-child projection | 641-647 | 7 | launch, placement, placementLease | returned child/placement/lease/handle |

Session-policy hand-off (553-559):
```ts
    let childSessionPath: string | undefined;
    try {
      childSessionPath = this.#input.subagentChildSessionPath?.(input.label);
    } catch (policyThrow: unknown) { // allow-broad-catch: session-log-derivation-failure — pi-integration-contract/subagent.md#subagent-session-log-derivation-failure (any policy failure is a loud launch failure: params cleaned, registry entry finished, PIC-65 internal-error routing; never a silently unlogged child)
      paramsCleanup();
      finishInvocation();
      const reason = `subagent child session-log path derivation failed: ${policyThrow instanceof Error ? policyThrow.message : String(policyThrow)}`;
```
Placement transition (570-574):
```ts
    const placementLease = placementResolver({
      provider: String(model.provider),
      callee: `/${theta.slashName}`,
    });
    const placement = placementLease.backend;
```
Failed-launch settlement (629-639):
```ts
      placementLease.release();
      paramsCleanup();
      finishInvocation();
      const reason =
        launch.reason === "unresolved"
          ? "subagent child executable unresolved"
          : "subagent child spawn failed";
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
      throw new SubagentSpawnFailedError(reason);
```

Map-quoted importer counts: enclosing exported `SubagentSpawnRegime` 1 src / 0 tests; this private method has no independent exported symbol/importers (0/0). Its caller is the regime's parent launch binding, not an external module import.

## Why this is a problem
Justify presumes breakdown absent a concrete reason. Single algorithm/shared local state was considered: the launch and settlement phases do use a shared lease, but the session-policy block is before the lease exists, writes exactly one success-path output (`childSessionPath`), and consumes five existing values (`input.label`, `theta`, `emitDiagnostic`, `paramsCleanup`, `finishInvocation`) plus one host seam. Therefore not every possible helper boundary requires six or more locals; no new shared state object is forced by this block. The 44-LOC configured-launch phase is a separate construction/await boundary already consuming the input record and acquired placement.

Closed-enumeration dispatch does not explain the sequential policy, acquisition and construction phases; the two failed-launch reason literals are only a subexpression. The 18-LOC input type is not an 80%-data/type body. This is neither a grammar recognizer nor generated code. The spec's session-log failure rule (`docs/spec_topics/pi-integration-contract/subagent.md:58`, anchor `subagent-session-log-derivation-failure`) requires refusal BEFORE placement, params cleanup, ticket finish and PIC-65 routing. That ordering is explicit at 553-570; it does not require policy derivation and launch-request construction to occupy one method body. This is a structural observation, not a claim of incorrect current cleanup.

## Suggested direction (non-binding, optional)
All hypotheses unproven; human ratification required. Seam A: session-log derivation/refusal block -> `#deriveChildSessionPathOrRefuse` (hypothesis) - 22 LOC, 0 exported symbols moved, external importers 0/0, cross-references back: `#input.subagentChildSessionPath`, input label, theta, the diagnostic callback and the two cleanup callbacks; returns the existing `childSessionPath` before lease acquisition. Seam B: configured-child launch phase -> `#placeConfiguredSubagentChild` (hypothesis) - 44 LOC, 0 exported symbols moved, external importers 0/0, cross-references back: the existing launch input, acquired placement/presentation, executable host, derived session path and `#input` launch seams. These are alternatives for review, not a prescribed split.

## False-positive check
Band: supplied map 136 LOC / justify; phase spans do not replace the authoritative total. Reasons-considered list above covers shared locals, closed enumeration, type/data, grammar, generated code and spec ordering. Exemptions check: no D9 row for this path/member in `quality/exemptions.json`. Generated-code check: bug-0489/0491 policy commentary and no generator banner. Spec-mirror check: the method combines session policy, RFC-0012 placement and PIC-65 failure settlement, not one closed dispatch table. Duplicate check: `rg -n '^d9_host:.*launchSubagentChild' quality --glob '*.md'` returned no existing host row before filing. PTQ-1288 files the former parent `spawnSubagentConversation` and proposed extracting this helper; it does not file this helper's current session-policy phase. PTQ-1548 concerns a different unguarded marshal step and is not re-filed. The companion file-level regime finding inventories module families, not this function's phase boundary.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 512-647 = 136 LOC / justify and the 1/0 class importer count; all excerpts and phase ranges match. Session-log derivation/refusal is a distinct pre-lease concern producing one launch input, separate from placement acquisition, request assembly and settlement; its five existing value dependencies do not establish an unavoidable six-local shared-state boundary. The cited spec pins ordering and cleanup, not one method body; no exemption, generated/type-heavy body, closed dispatch or reverted split was found. PTQ-1288 tracks the former parent extraction, PTQ-1548 tracks marshal error posture, and the companion finding tracks file-level families, not this root cause. Accounting verified; the target breakdown shape needs a human ruling. (triage: claude-opus-5-5)
