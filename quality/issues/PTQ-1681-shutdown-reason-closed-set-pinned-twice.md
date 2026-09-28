---
id: PTQ-1681
title: The SessionShutdownEvent.reason closed set is pinned by two production mechanisms — the SDK_SURFACE_INVENTORY type-union-snapshot row the runtime reads, and version-bump-gates.ts#SESSION_SHUTDOWN_REASON_SNAPSHOT whose header says the runtime reads it — and the step-2(a) consistency gate plus every session-shutdown test harness is aimed at the copy no production code reads
lens: D1
status: open
verdict: confirmed
locations:
  - src/extension/version-bump-gates.ts:55-70
  - src/extension/sdk-inventory.ts:216-226
  - src/extension/unknown-reason-rule.ts:165-186
  - src/extension/extension-instance-shutdown.ts:194-197
  - tests/version-bump-gates.test.ts:136-149
  - tests/helpers/session-shutdown-harness.ts:97-104
sites: 2
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The SessionShutdownEvent.reason closed set is pinned by two production mechanisms — the SDK_SURFACE_INVENTORY type-union-snapshot row the runtime reads, and version-bump-gates.ts#SESSION_SHUTDOWN_REASON_SNAPSHOT whose header says the runtime reads it — and the step-2(a) consistency gate plus every session-shutdown test harness is aimed at the copy no production code reads

## Observation
The closed set `{"quit","reload","new","resume","fork"}` that the `session_shutdown` unknown-reason rule checks `event.reason` against is pinned in two production modules by two mechanisms. `src/extension/sdk-inventory.ts` carries it as a `type-union-snapshot` row of `SDK_SURFACE_INVENTORY`, located at runtime by the `(kind, path)` composite predicate in `unknown-reason-rule.ts#readSnapshotLiterals` and injected via `extension-instance-shutdown.ts:197`; its comment calls itself the "Single source of truth across the build-time surface-inventory test and the runtime `session_shutdown` handler". `src/extension/version-bump-gates.ts` carries the same five literals as a standalone frozen export `SESSION_SHUTDOWN_REASON_SNAPSHOT` whose header says `literals` "is the pinned closed set the runtime Unknown-reason rule reads". No production module imports `SESSION_SHUTDOWN_REASON_SNAPSHOT`; the step-2(a) `reasonSnapshotConsistencyFailures` gate is driven in tests from it, and the session-shutdown test harness builds its injected inventory row from it, so the runtime row and the gated constant are wired together by nothing but their literal equality.

## Evidence

**Way 1 — inventory row, located by predicate.** `src/extension/sdk-inventory.ts:216-226` (re-read before filing):
```ts
    // The `SessionShutdownEvent['reason']` closed-set snapshot the
    // unknown-reason rule (`V9h`) reads (PIC-45/PIC-46/PIC-48(c)). Single source
    // of truth across the build-time surface-inventory test and the runtime
    // `session_shutdown` handler; located by the composite
    // `(kind, path)` predicate, never by array position.
    {
      id: "SessionShutdownEvent.reason",
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      literals: ["quit", "reload", "new", "resume", "fork"],
    },
```
Its consumer, `src/extension/unknown-reason-rule.ts:174-186`:
```ts
    let match: PinnedConstantSnapshotSource | undefined;
    for (const entry of inventory) {
      // Composite predicate: both clauses (PIC-46). A per-entry `.kind`/`.path`
      // getter that throws propagates to the catch arm as a `"throw:"` value.
      if (
        entry.kind === "type-union-snapshot" &&
        entry.path === "SessionShutdownEvent.reason"
      ) {
        match = entry;
        break;
      }
    }
```
Production injection, `src/extension/extension-instance-shutdown.ts:194-197`:
```ts
      // PIC-46: the single injected copy of the closed-set snapshot
      // (`SessionShutdownEvent.reason`'s `type-union-snapshot` row); the
      // unknown-reason rule reads it, no separate copy lives here.
      inventory: SDK_SURFACE_INVENTORY,
```
Search `grep -rn "inventory: SDK_SURFACE_INVENTORY" src/` → 1 hit:
```
src/extension/extension-instance-shutdown.ts:197:      inventory: SDK_SURFACE_INVENTORY,
```

**Way 2 — standalone frozen constant.** `src/extension/version-bump-gates.ts:55-70`:
```ts
 * The `SessionShutdownEvent['reason']` closed-set snapshot entry
 * (version-bump-triggers.md step 5 grouping (ii)). `path` names the SDK type
 * whose reason union is snapshotted; `literals` is the pinned closed set the
 * runtime Unknown-reason rule reads and the step-2(a) literal-array consistency
 * check reconciles against the SDK union. At the theta 1.0 Pi-SDK pin the union
 * is `"quit" | "reload" | "new" | "resume" | "fork"` (session-model-and-appendix
 * SM-2). `Object.freeze` keeps it off the *No globals, statics, singletons*
 * mutable-binding scan (a frozen runtime-immutable snapshot).
 */
export const SESSION_SHUTDOWN_REASON_SNAPSHOT: {
  readonly path: string;
  readonly literals: readonly string[];
} = Object.freeze({
  path: "SessionShutdownEvent.reason",
  literals: Object.freeze(["quit", "reload", "new", "resume", "fork"]),
});
```

**Counts, both ways.** Producers of the five-literal array in production: search `grep -rn '"quit", "reload", "new", "resume", "fork"' src/ tests/` → 5 hits:
```
src/extension/sdk-inventory.ts:225:      literals: ["quit", "reload", "new", "resume", "fork"],
src/extension/version-bump-gates.ts:69:  literals: Object.freeze(["quit", "reload", "new", "resume", "fork"]),
tests/unknown-reason-rule.test.ts:41:// The (c) brace-form closed-set literal `{"quit", "reload", "new", "resume", "fork"}`.
tests/unknown-reason-rule.test.ts:42:const CLOSED_SET = ["quit", "reload", "new", "resume", "fork"] as const;
tests/version-bump-gates.test.ts:137:  const union = ["quit", "reload", "new", "resume", "fork"];
```
Consumers of Way 2 in production: search `grep -rn "SESSION_SHUTDOWN_REASON_SNAPSHOT" src/ extensions/ tools/` → 1 hit (the declaration only):
```
src/extension/version-bump-gates.ts:64:export const SESSION_SHUTDOWN_REASON_SNAPSHOT: {
```
Consumers of Way 2 in tests: search `grep -rn "SESSION_SHUTDOWN_REASON_SNAPSHOT" tests/` → 11 hits (first 10):
```
tests/helpers/session-shutdown-harness.ts:7:import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../../src/extension/version-bump-gates";
tests/helpers/session-shutdown-harness.ts:102:      literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
tests/session-shutdown.test.ts:52:import { SESSION_SHUTDOWN_REASON_SNAPSHOT } from "../src/extension/version-bump-gates";
tests/session-shutdown.test.ts:162:    for (const reason of SESSION_SHUTDOWN_REASON_SNAPSHOT.literals) {
tests/session-shutdown.test.ts:168:    expect([...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals]).toStrictEqual([
tests/session-shutdown.test.ts:650:    for (const reason of SESSION_SHUTDOWN_REASON_SNAPSHOT.literals) {
tests/version-bump-acceptance.test.ts:12:  SESSION_SHUTDOWN_REASON_SNAPSHOT,
tests/version-bump-acceptance.test.ts:163:    expect(SESSION_SHUTDOWN_REASON_SNAPSHOT.literals).toEqual(PRIOR_REASON_UNION);
tests/version-bump-gates.test.ts:10:  SESSION_SHUTDOWN_REASON_SNAPSHOT,
tests/version-bump-gates.test.ts:142:    expect(SESSION_SHUTDOWN_REASON_SNAPSHOT.literals).toEqual(union);
```
(total 11; the 11th is `tests/version-bump-gates.test.ts:147`.)

**The gate is aimed at Way 2, the runtime reads Way 1.** `tests/version-bump-gates.test.ts:136-149`:
```ts
describe("version-bump gate — step 2(a) reason-snapshot literal-array consistency", () => {
  const union = ["quit", "reload", "new", "resume", "fork"];

  it("step 2(a)/step 5 trigger (ii): the pinned snapshot literals match the SDK reason union bidirectionally; a widen or narrow reds", () => {
    // The pinned snapshot is well-formed data (non-empty, distinct) and matches
    // the theta 1.0 SDK reason union.
    expect(SESSION_SHUTDOWN_REASON_SNAPSHOT.literals).toEqual(union);

    // Consistent (snapshot set === union set) → no failures.
    expect(
      reasonSnapshotConsistencyFailures(
        SESSION_SHUTDOWN_REASON_SNAPSHOT.literals,
        union,
      ),
    ).toEqual([]);
```
Search `grep -rn "SDK_SURFACE_INVENTORY" tests/version-bump-gates.test.ts tests/version-bump-acceptance.test.ts tests/session-shutdown.test.ts tests/helpers/session-shutdown-harness.ts` → 7 hits, all in `tests/version-bump-gates.test.ts` (lines 7, 38, 40, 42, 45, 51, 60) and all reading operand rows by `id` for the presence/engines/peer-dep/api-coverage gates — none reads the `type-union-snapshot` row's `literals`. Search `grep -rn "reasonSnapshotConsistencyFailures" src/ tests/ tools/ extensions/` → 10 hits:
```
src/extension/version-bump-gates.ts:27://   • `reasonSnapshotConsistencyFailures` — step 2(a) literal-array consistency
src/extension/version-bump-gates.ts:222:export function reasonSnapshotConsistencyFailures(
tests/version-bump-acceptance.test.ts:15:  reasonSnapshotConsistencyFailures,
tests/version-bump-acceptance.test.ts:90:      failures: reasonSnapshotConsistencyFailures(
tests/version-bump-gates.test.ts:15:  reasonSnapshotConsistencyFailures,
tests/version-bump-gates.test.ts:146:      reasonSnapshotConsistencyFailures(
tests/version-bump-gates.test.ts:154:      reasonSnapshotConsistencyFailures([...union], [...union, "switch"]).length,
tests/version-bump-gates.test.ts:159:      reasonSnapshotConsistencyFailures([...union, "stale"], [...union]).length,
tests/version-bump-gates.test.ts:164:      reasonSnapshotConsistencyFailures([], [...union]).length,
tests/version-bump-gates.test.ts:169:      reasonSnapshotConsistencyFailures(["quit", "quit"], ["quit"]).length,
```
No production call exists (the two `src/` hits are the header roster and the definition). The one call that passes pinned production data is `tests/version-bump-gates.test.ts:146`, which passes `SESSION_SHUTDOWN_REASON_SNAPSHOT.literals`; the acceptance-test call at `:90` passes the test-local `PRIOR_REASON_UNION` literal (`tests/version-bump-acceptance.test.ts:39`). Neither reads the inventory row.

The session-shutdown harness likewise mints the handler's inventory from Way 2, `tests/helpers/session-shutdown-harness.ts:97-104`:
```ts
export function healthyInventory(): SessionShutdownDeps["inventory"] {
  return [
    {
      kind: "type-union-snapshot",
      path: "SessionShutdownEvent.reason",
      literals: [...SESSION_SHUTDOWN_REASON_SNAPSHOT.literals],
    },
  ];
}
```

**Drift that already happened.** Way 2's header ("the pinned closed set the runtime Unknown-reason rule reads", version-bump-gates.ts:57-58) was true for nineteen minutes: `git log --format='%h %ad %s' --date=iso -S'literals: Object.freeze(["quit"' -- src/extension/version-bump-gates.ts` → 1 hit:
```
6ae6d50c 2026-07-01 22:49:06 +0200 V18c-T — Pi version-bump static gate tests
```
`git log --format='%h %ad %s' --date=iso -S'literals: ["quit", "reload", "new", "resume", "fork"]' -- src/extension/sdk-inventory.ts` → 1 hit:
```
d6228bb9 2026-07-01 23:08:56 +0200 V9h — unknown-reason rule: closed-set membership, snapshot read order, four-arm routing
```
Since d6228bb9 the runtime has read Way 1 exclusively (unknown-reason-rule.ts excerpt above; `grep -rn "SESSION_SHUTDOWN_REASON_SNAPSHOT" src/` → definition only), and Way 2's header has not been corrected across the three later commits touching the file (`git log -3 --format='%h %ad %s' --date=short -- src/extension/version-bump-gates.ts` → `d4e28600 2026-09-14`, `4098e2dc 2026-09-11`, `33bf327e 2026-09-04`). The bug-0216 fix report (`.pi/tmp/fixes/0216-report.md:176-177`) records the reviewer having to classify "`SESSION_ONLY_REASONS` and `SESSION_SHUTDOWN_REASON_SNAPSHOT` as pre-existing non-PIC-46 constants" to establish there was "no second copy of the closed set on the teardown path" — the classification a reader has to redo every time because the header says otherwise.

**Self-inconsistency statement.** The spec pins one runtime source (`docs/spec_topics/pi-integration-contract/unknown-reason-rule.md:6`, PIC-46 "Constant-source pinning (single-site edit) — the rule that the closed set above is sourced from the `SessionShutdownEvent['reason']` snapshot entry in the extension module's source-of-truth pinned-constants block … with no separate copy in the handler") but writes no rule about a second build-time copy; the anchor for this filing is self-inconsistency — two modules each claiming to be the pin the runtime reads — plus the cost cited above.

## Why this is a problem
Principle: a pinned constant has one home, and the gate that guards it must read that home. Mechanically, a maintainer performing version-bump-triggers.md step 5 trigger (ii)'s "snapshot-edit-only sweep on the `SessionShutdownEvent['reason']` snapshot entry's `literals` field" edits the pinned-constants block (Way 1, the one the spec and the runtime name). The step-2(a) consistency gate — the mechanism the spec assigns to catch a stale snapshot — then keeps evaluating Way 2 and stays green regardless, and every `session-shutdown.test.ts` cell keeps driving the handler with Way 2's stale literals via `healthyInventory()`, so a renamed literal in production is neither gated nor exercised. Conversely a maintainer who follows Way 2's header and edits `SESSION_SHUTDOWN_REASON_SNAPSHOT` turns the gate red while the runtime still accepts the old set. Both misreads are invited by the headers as written: two comments, two "single source" claims, no cross-check between them (searches above).

## Suggested direction (non-binding, optional)
Unproven hypothesis: version-bump-gates.ts's constant could be derived from (or replaced by a typed read of) the `type-union-snapshot` row in `SDK_SURFACE_INVENTORY`, so the step-2(a) gate and the shutdown harness consume the row the runtime consumes; whether the gate should take the row's `literals` directly or a small accessor over the inventory is a fix-stage choice.

## False-positive check
- **Injected clone map:** no group covers version-bump-gates.ts or sdk-inventory.ts (the map lists "(no clone groups)" for version-bump-gates.ts; sdk-inventory.ts is outside the shard). The two ways are not copy-shaped — an inventory row located by a `(kind, path)` predicate through `PinnedConstantSnapshotSource` versus a standalone `Object.freeze` export — so this is a mechanism divergence, not a D4 token clone; the shared five-string literal is the payload, not the mechanism.
- **D9-affinity check:** not a wrong-home claim. version-bump-gates.ts legitimately hosts the step-2(a) gate function; the claim is that the pin it gates is a second pin, not that the gate is misplaced.
- **D2-deadness check:** both sides live. Way 1 is read at runtime (`extension-instance-shutdown.ts:197` → `classifyShutdownReason` at `session-shutdown.ts:191`). Way 2 has 11 test references across four files (search above); tests-only callers are not dead under this repository's D2 rule, and the header's spec citation (step 5 grouping (ii)) is live text.
- **Export-style exemption:** not applicable — divergent-solutions; no claim is made against the `export` keyword or `SurfaceInventoryEntry`'s optional `path`/`literals` fields (which are read by `readSnapshotLiterals`).
- **Prior filings:** PTQ-0134 (resolved, D2) corrected sdk-inventory.ts's row-count prose only; `grep -n "SESSION_SHUTDOWN_REASON_SNAPSHOT" quality/resolved/PTQ-0134-*.md` → 0 hits. PTQ-0509 / PTQ-0699 (resolved, D7) consolidated the session-shutdown deps harness and left `healthyInventory()` reading Way 2 — they did not touch the production pin. Bug 0216 (fixed) wired the runtime to Way 1 and explicitly scoped Way 2 out ("pre-existing non-PIC-46 constants"). No open or intake candidate names either constant: `grep -rln "SESSION_SHUTDOWN_REASON_SNAPSHOT\|type-union-snapshot" quality/issues quality/intake` → 1 hit, this file only (`quality/intake/qw20260928124659-d1-02-shutdown-reason-closed-set-pinned-twice.md`).
- **Self-inconsistency statement:** the only written rule (PIC-46) governs the runtime read and is satisfied; no written rule governs the build-time copy; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Every excerpt reproduces (version-bump-gates.ts:55-70, sdk-inventory.ts:216-226, unknown-reason-rule.ts:174-186, extension-instance-shutdown.ts:194-197, version-bump-gates.test.ts:136-149, session-shutdown-harness.ts:97-104), and all seven stated searches reproduce line for line (1/5/1/11/7/10 hits). SESSION_SHUTDOWN_REASON_SNAPSHOT has no src/ consumer beyond its declaration, but its header says the runtime reads it, which has been false since d6228bb9 (the -S logs reproduce 6ae6d50c → d6228bb9, 19 minutes apart). The 0216-report.md:176-177 reclassification is real, and clone-scan on version-bump-gates.ts → (no clone groups), so this is not D4. One overstatement: tests/unknown-reason-rule.test.ts:167-176 does pin the inventory row's literals, against a test-local CLOSED_SET, so an edit to Way 1 is not wholly unexercised; only the step-2(a) gate and healthyInventory() are aimed at Way 2. Not a duplicate: PTQ-0134/0509/0699 cover row-count prose and harness duplication only (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the SDK_SURFACE_INVENTORY row is the one pin; the gate constant derives from it. In src/extension/version-bump-gates.ts replace SESSION_SHUTDOWN_REASON_SNAPSHOT's literal array with a derivation from the inventory row: import SDK_SURFACE_INVENTORY from ./sdk-inventory (no cycle at HEAD), locate the row by the composite predicate `(kind === "type-union-snapshot" && path === "SessionShutdownEvent.reason")` — the same rule as unknown-reason-rule.ts:174-186 — and export the frozen `{ path, literals }` from it, throwing loudly at module init if the row is missing. Correct its header (:55-63): it is the step-2(a)/step-5(ii) gate's view of the runtime pin, DERIVED from the inventory row the runtime reads — not a second pin the runtime reads. Behaviour identical; the step-2(a) gate, tests/helpers/session-shutdown-harness.ts healthyInventory(), and all 11 test references now transitively consume the runtime row, so a snapshot-edit-only sweep on sdk-inventory.ts reaches every consumer and the gate cannot stay green against a stale copy.
