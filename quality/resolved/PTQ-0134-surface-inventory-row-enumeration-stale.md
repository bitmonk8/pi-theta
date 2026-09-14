---
id: PTQ-0134
title: SDK_SURFACE_INVENTORY's doc comment and module header enumerate fourteen rows in three categories while the array holds sixty-four rows across nine kinds
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/sdk-inventory.ts:156-172
  - src/extension/sdk-inventory.ts:18-25
  - src/extension/sdk-inventory.ts:184-189
  - src/extension/sdk-inventory.ts:223-234
  - src/extension/sdk-inventory.ts:248-260
  - src/extension/sdk-inventory.ts:264-271
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SDK_SURFACE_INVENTORY's doc comment and module header enumerate fourteen rows in three categories while the array holds sixty-four rows across nine kinds

## Observation
`SDK_SURFACE_INVENTORY`'s doc comment introduces the constant with "It holds:"
followed by a three-bullet list: eight capability `namespace-function` members,
two non-capability `pi.registerFlag` / `pi.getFlag` surfaces, and four
non-`namespace-function` operand rows. That accounts for fourteen of the array's
sixty-four rows. The remaining fifty rows belong to five kinds the enumeration
never names: one `type-union-snapshot` row, five `pi-member` rows, eight
`ctx-member` rows, and thirty-six `peer-named-import` rows. The module header
repeats the same closed list.

## Evidence
src/extension/sdk-inventory.ts:156-164 — the doc comment's opening and first
bullet:

```ts
/**
 * The full Pi-side surface inventory — strictly broader than the seven
 * capabilities (inventory-audit-intro.md §SDK capability inventory). It holds:
 *
 *   • the eight `namespace-function` members of the factory-probable capability
 *     subset (capabilities 1/2/4/6, per Step 0 (c) of the capability probe;
 *     RFC-0005 retired capability 3's `createAgentSession` /
 *     `AgentSession.prototype.abort` members; bug 0001 / PIC-64 added
 *     capability 4's `pi.getAllTools`);
```

src/extension/sdk-inventory.ts:165-172 — the second and third (last) bullets:

```ts
 *   • the two non-capability category-(1) `pi.<member>` `namespace-function`
 *     surfaces `pi.registerFlag` / `pi.getFlag` (inventory-audit-intro.md
 *     §"Non-capability `pi.<member>` surfaces"); and
 *   • the four non-`namespace-function` operand rows the version-bump gates
 *     (`V18c`) read — the in-repo Node floor (`pi-engines-node`), the
 *     `peerDependencies` literal (`peer-dep-range`), the strict-capability
 *     probe (`strict-capability-probe`), and the provider seed-field gate
 *     (`api-coverage`).
```

src/extension/sdk-inventory.ts:18-25 — the module header's version of the same
list:

```ts
//   • `SDK_SURFACE_INVENTORY` — the full Pi-side surface set, strictly broader
//     than the seven capabilities (inventory-audit-intro.md §SDK capability
//     inventory). Beyond the capability members it carries the non-capability
//     `pi.<member>` surfaces (`pi.registerFlag` / `pi.getFlag`, per §"Non-
//     capability `pi.<member>` surfaces") and the `pi-engines-node`,
//     `peer-dep-range`, `strict-capability-probe`, and `api-coverage` rows the
//     version-bump gates read as operands. Each row is tagged with its kind
//     under the leaf-owned entry-kind taxonomy (`SurfaceEntryKind`).
```

Row census — exact searches over the file (the array body runs :178-372;
`kind:` appears only on rows, never in the `SurfaceEntryKind` declaration):
`grep -c 'kind: "'` → 64; per kind, `grep -c 'kind: "<k>"'` →
`namespace-function` 10, `peer-named-import` 36, `ctx-member` 8, `pi-member` 5,
`type-union-snapshot` 1, `engines-pin` 1, `peer-dep-range` 1,
`strict-capability-probe` 1, `api-coverage` 1.

The four unmentioned kinds, at their declaration sites:

src/extension/sdk-inventory.ts:184-189 — the single `type-union-snapshot` row:

```ts
    {
      id: "SessionShutdownEvent.reason",
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      literals: ["quit", "reload", "new", "resume", "fork"],
    },
```

src/extension/sdk-inventory.ts:223-234 — all five `pi-member` rows:

```ts
    { id: "pi.on", kind: "pi-member" },
    { id: "pi.getCommands", kind: "pi-member" },
    // RFC-0006 (PIC-64 rung 2): the host-loop dispatch
    // (`production-host-loop-dispatch.ts`) registers a theta-controlled provider
    // authoring the `tool_use`, switches the session model to it, and
    // unregisters it after the fabricated turn. These `pi.<member>` surfaces are
    // consumed through a narrow structural carrier (not a `pi: ExtensionAPI`
    // carrier), so they are inventoried for completeness / the version-bump
    // presence gate rather than to satisfy a member-access audit row.
    { id: "pi.registerProvider", kind: "pi-member" },
    { id: "pi.unregisterProvider", kind: "pi-member" },
    { id: "pi.setModel", kind: "pi-member" },
```

src/extension/sdk-inventory.ts:248-260 — seven of the eight `ctx-member` rows
(the eighth is `{ id: "ctx.waitForIdle", kind: "ctx-member" },` at :238):

```ts
    { id: "ctx.cwd", kind: "ctx-member" },
    { id: "ctx.modelRegistry", kind: "ctx-member" },
    { id: "ctx.ui", kind: "ctx-member" },
    { id: "ctx.hasUI", kind: "ctx-member" },
    // The H8a per-theta run-drive resolves a chained (non-first) query off-session
    // through pi-ai's `complete()` against the dispatch context's current model.
    { id: "ctx.model", kind: "ctx-member" },
    // The H8a per-theta prompt-mode run-drive reads the dispatch context's
    // cancellation signal (the `thetaAbort`-equivalent every checkpoint gates on)
    // and the read-only session manager (the PIC-53 trailing-turn message list,
    // via `buildSessionContext(getEntries(), getLeafId())`).
    { id: "ctx.signal", kind: "ctx-member" },
    { id: "ctx.sessionManager", kind: "ctx-member" },
```

src/extension/sdk-inventory.ts:264-271 — the first five of thirty-six
`peer-named-import` rows (the run continues to :320):

```ts
    { id: "ExtensionAPI", kind: "peer-named-import" },
    { id: "ExtensionContext", kind: "peer-named-import" },
    { id: "ExtensionCommandContext", kind: "peer-named-import" },
    // STAGE B (ceiling #2): the prompt-mode tool-loop governor bounds pi's
    // native agentic loop through the `tool_call` interception hook, whose
    // event and `{ block, reason }` result are these two peer surfaces.
    { id: "ToolCallEvent", kind: "peer-named-import" },
    { id: "ToolCallEventResult", kind: "peer-named-import" },
```

## Why this is a problem
Stale enumeration: the doc presents a closed census ("It holds:" plus three
bullets, the third of which counts "the four non-`namespace-function` operand
rows" while the array holds nine non-`namespace-function` kinds and fifty-four
such rows), and the header restates the same closed list. `git blame` dates both
enumerations to `8cc63a641` (2026-07-01 21:00, "V18a — SDK capability and
surface inventory"), while the `pi-member` / `peer-named-import` / `ctx-member`
kinds and their first rows arrived in `123f03980` (2026-07-01 22:36, "V18b —
Inventory-closure audit gate") and later commits (`3a8732da0` 2026-07-02,
`22306e5d4` 2026-07-25, `304929486` 2026-07-27). A reader asking what the
inventory contains — the question the doc exists to answer for the step-2(a)
presence gate and the closure audit — is handed a list that omits fifty of the
sixty-four rows those consumers read.

## Suggested direction (non-binding, optional)
Either extend the two enumerations to the kinds actually present, or replace the
category list with a pointer to `SurfaceEntryKind`, which already documents every
kind the array uses.

## False-positive check
- Counted rows mechanically rather than by eye: a node script tallying
  `kind: "…"` matches produced the nine-kind census above; the `grep -c` figures
  quoted in Evidence reproduce it (64 rows total).
- Verified the omitted rows are inventory members, not commentary: every cited
  line is an object literal inside the single `Object.freeze([...])` argument
  (:178-372), and `surfaceInventoryPresenceFailures`
  (src/extension/version-bump-gates.ts:134-146) filters this same array on
  `namespace-function` / `pi-member` / `ctx-member` / `peer-named-import`, so
  four of the five unmentioned kinds feed a gate.
- Checked whether a narrower reading rescues the bullets: bullet 3 names a count
  ("the four non-`namespace-function` operand rows") that the array contradicts,
  so the omission is not merely one of emphasis.
- Not stub narration: the already-filed
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md cites
  sdk-inventory.ts:27-30 (the `V18a-T` "empty frozen arrays" sentence); the two
  enumerations cited here are separate sites and appear in no pending finding.
- Duplicate check: `grep -rn "sdk-inventory" quality/intake` → the stub-narration
  finding above, qw20260907130901-d2-04-sdk-inventory-createagentsession-comment-stale.md
  (the `createAgentSession` contradiction at :190-194 / :209-215) and an
  unrelated wire-walk citation finding; none covers the row enumeration.
- History intent: `git blame -L 156,176` and `-L 18,25` → `8cc63a641`
  (2026-07-01 21:00); every widening commit is later, so this is drift rather
  than a deliberately partial description.

## Triage
verdict: confirmed — census reproduces exactly (`grep -c 'kind: "'` → 64; 8+2 `namespace-function` + 4 operand rows = 14 enumerated, leaving 50 rows in 4 kinds neither enumeration names), both comments are verbatim at :156-176/:18-25, blame shows every widening commit (123f0398 22:36 onward) postdates the closed "It holds: … ; and" list (8cc63a64 21:00) while the constant is live (factory.ts:1171, version-bump-gates.ts:134-146); two prose slips do not change the defect — bullet 3's "four … operand rows" is itself accurate (four payload rows) and the unnamed kinds number four, not five. (triage: claude-opus-5)
