---
id: pending
title: HostIncompatibleKind is exported from capability-probe.ts with no importer anywhere; its only use is one field annotation inside the same module
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/capability-probe.ts:36-46
  - src/extension/capability-probe.ts:167-169
sites: 2
fix_scope: localized
wave: qw20260908115521
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-08
---

# HostIncompatibleKind is exported from capability-probe.ts with no importer anywhere; its only use is one field annotation inside the same module

## Observation
`capability-probe.ts` exports the type alias `HostIncompatibleKind`, the closed
seven-member `details.kind` discriminator set for
`theta/load/host-incompatible`. Across `src/`, `extensions/`, `tools/` and
`tests/` the identifier appears in exactly three places, all inside the
declaring file: the declaration itself, one prose mention in the
`HOST_INCOMPATIBLE_CODE` doc comment, and one field annotation on
`ProbeFailureDetails.kind`. No module or test imports it. The renderer that
consumes the same payload declares its own `kind: string` field rather than
importing this union, so the type's exported form has no consumer.

## Evidence
src/extension/capability-probe.ts:36-46 — the declaration:

```ts
/**
 * The closed `theta/load/host-incompatible` `details.kind` discriminator set
 * (capability-probe.md "On failure: refusal and diagnostic" clause (ii)).
 */
export type HostIncompatibleKind =
  | "node-floor"
  | "abortsignal-shape"
  | "sdk-capability-missing"
  | "peer-dep-out-of-range"
  | "peer-dep-malformed-version"
  | "typebox-shape"
  | "probe-failed";
```

src/extension/capability-probe.ts:167-169 — the only use of the name in code
position, in the same module:

```ts
export interface ProbeFailureDetails {
  readonly kind: HostIncompatibleKind;
  readonly observed: string;
```

`grep -rn "HostIncompatibleKind" .` (excluding `node_modules/`, `.git/`,
`dist/` build output and `.pi/tmp/` scratch) returns exactly three lines, all in
the declaring file:

```
./src/extension/capability-probe.ts:39:export type HostIncompatibleKind =
./src/extension/capability-probe.ts:96: * `HostIncompatibleKind` outcomes (bug 0023 element 3;
./src/extension/capability-probe.ts:168:  readonly kind: HostIncompatibleKind;
```

The consumer of the same payload, `renderHostIncompatible`, declares its own
input shape and widens the discriminator to `string`
(src/diagnostics/placeholder.ts:356-363):

```ts
/** The `theta/load/host-incompatible` payload the renderer interpolates. */
export interface HostIncompatibleDetails {
  readonly kind: string;
  /** The raw `<observed>` input (host-derived for `node-floor`). */
  readonly observed: string;
  /** The `<required>` substring (pinned per `kind`). */
  readonly required: string;
}
```

## Why this is a problem
An `export` is a published surface: it states that a name is part of the
module's contract with other modules and must keep working for them. This one
has no other module — the type is used exactly once, on a field of an interface
declared 130 lines below it in the same file, which needs no export to see it.
The one place in the tree that receives the payload the union describes
(`renderHostIncompatible`) declares a parallel input shape typed `kind: string`,
so even the natural consumer does not resolve through this export. The exported
form is therefore surface with no user, and no second user is in sight: the
probe is the only producer of the discriminator and the renderer has already
chosen not to take it.

## Suggested direction (non-binding, optional)
The alias could stay module-private (dropping `export`) so the closed set
remains the single spelling of clause (ii)'s discriminator without publishing a
surface nothing consumes.

## False-positive check
- Identifier search across every scope in the brief: `grep -rn
  "HostIncompatibleKind" src extensions tools tests --include=*.ts` — three hits,
  all in `src/extension/capability-probe.ts`, reproduced above.
- Whole-tree search (to catch non-`.ts` consumers and generated re-exports):
  `grep -rn "HostIncompatibleKind" .` — additional hits only in `dist/` (compiled
  build output of this same file) and `.pi/tmp/fixes/` (scratch review notes),
  neither of which is a source consumer.
- String-keyed / dynamic access: `grep -rn "\"HostIncompatibleKind\"\|'HostIncompatibleKind'" .`
  — no hits.
- Re-export check: `grep -rn "from \"./capability-probe\"" src` and `grep -rn
  "capability-probe\"" src tests extensions tools --include=*.ts` — the three
  importing modules are `factory.ts:72`, `production-composition.ts:85` and
  `sdk-inventory.ts:35-36`; their import lists take
  `hostIncompatibleDiagnostic` / `runCapabilityProbe` /
  `SUPERSESSION_QUIESCE_CAP_MS` / `PEER_DEP_PACKAGES` /
  `probeSubagentExecutable` / `ProbeHost` / `FACTORY_PROBABLE_CAPABILITIES` /
  `CapabilityId`, and none of them names `HostIncompatibleKind`. No barrel file
  re-exports this module.
- Test-only-caller check: the test files that import from this module
  (`tests/capability-probe.test.ts:8`,
  `tests/extension-bootstrap-sink-liveness.test.ts:17`,
  `tests/b0323-subagent-executable-probe-wrap.test.ts:42`) import
  `ProbeFailureDetails`, `ProbeOutcome`, `ProbeHost`,
  `FACTORY_PROBABLE_CAPABILITIES`, `HOST_INCOMPATIBLE_CODE`,
  `runCapabilityProbe` and `probeSubagentExecutable` — not
  `HostIncompatibleKind`. So this is not a case of tests being the only
  legitimate caller; there is no caller.
- Liveness of the type itself: the seven members are each constructed inside
  `runCapabilityProbe` / `probeSubagentExecutable`, so the union is alive. Only
  its `export` has no consumer — this finding does not claim the alias is dead.

## Triage
verdict: questionable — searches reproduce exactly (3 hits, all in-file; no importer, dynamic access or re-export), but nothing is dead and the anchor is export-surface taste: 228 of 699 exported types in src/ have no out-of-file referencer, including structurally identical kind discriminators (AssignTargetKind, CommittedSideEffectKind), and ProbeFailureDetails carrying the union is imported out-of-module — house style, so a human should rule (triage: claude-opus-5)
verdict: questionable — every fact reproduces (3 in-file hits at :39/:96/:168; no importer, `export *`, or string-keyed access; placeholder.ts excerpt drifts 3 lines to :354-357; `git log -S` places the export at the module's founding commit e795597b with no importer ever added since), but the anchor is taste, not a proven defect: nothing is dead, the carrier ProbeFailureDetails is live in production cross-module (not just tests) — `hostIncompatibleDiagnostic(details: ProbeFailureDetails)` is imported and called by factory.ts:80/1375 — the renderer's parallel `kind: string` avoids an extension→diagnostics→extension import cycle (capability-probe.ts already imports placeholder.ts) rather than snubbing the union, and my own independent check of the ten named siblings (AssignTargetKind, CommittedSideEffectKind, PathLiteralKind, ThetaLibDeclarationKind, IndexReceiverKind, NumberKind, SlashCallerKind, PromptTurnKind, CommittedSurfaceKind, ToolCallCalleeKind) confirms each is exported, used only in its own file, and reaches zero out-of-file referencer — the identical shape recurs by design, so this fails PTQ-0150's proven-outlier test and is house convention; a human should rule (triage: claude-opus-5)
verdict: questionable — independently re-verified every claim (3 in-file hits at :39/:96/:168; no importer/dynamic-access/re-export/barrel across src, extensions, tools, tests; placeholder.ts's `HostIncompatibleDetails` now at :354-357, content-identical; e795597b founding commit never gained an importer per `git log --follow -S`) but the anchor doesn't clear taste: `ProbeFailureDetails` (the interface carrying the `kind: HostIncompatibleKind` field) is imported and called cross-module in production, not tests, at factory.ts:1373/1375 via `runCapabilityProbe`/`hostIncompatibleDiagnostic`, so the type is not scaffolding for an unlanded feature; and my own grep of the ten named sibling `*Kind` aliases confirms each resolves to exactly one file with zero out-of-file referencer, plus a from-scratch repo census (725 exported `type`/`interface` names in src/, 404 with no other-src-file referencer) shows this profile is pervasive rather than exceptional — a human should rule (triage: claude-opus-5)
verdict: questionable — own from-scratch re-verification concurs: all cited excerpts and line numbers reproduce (declaration :36-46/:39, roster mention :96, field use :168; placeholder.ts's `HostIncompatibleDetails` at :354-357 is content-identical and the file has zero import statements at all, confirming its `kind: string` sidesteps a capability-probe↔placeholder cycle rather than snubbing the union); grep confirms zero external importer/dynamic-access/re-export across src, extensions, tools, tests, and dist/.pi/tmp are the only other hits — but nothing is dead: the alias is used internally and its carrier `ProbeFailureDetails` reaches production (factory.ts:1373/1375 via `runCapabilityProbe`/`hostIncompatibleDiagnostic`), not just tests; my own independent census (721 exported type/interface names in src/, 404 with zero cross-file referencer) and a 10/10 spot-check of the named sibling `*Kind` aliases (each solo-file) reproduces the prior rounds' numbers closely enough to confirm the pattern is house convention, not a proven outlier — anchor is export-surface taste, a human should rule (triage: claude-opus-5)
