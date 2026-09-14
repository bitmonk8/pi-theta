---
id: PTQ-0302
title: capability-probe.ts's runtime SDK-member probe list and sdk-inventory.ts's build-time inventory duplicate the same eight pi.<member> names
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/capability-probe.ts:310-322
  - src/extension/sdk-inventory.ts:225-238
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260913183958
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-13
---

# capability-probe.ts's runtime SDK-member probe list and sdk-inventory.ts's build-time inventory duplicate the same eight pi.<member> names

## Observation
`capability-probe.ts`'s Step 0 (c) runtime probe and `sdk-inventory.ts`'s
build-time `SDK_SURFACE_INVENTORY` each separately enumerate the same eight
`pi.<member>` function names, in the same order, as two independent lists with
no shared declaration. `capability-probe.ts`'s list is a function-local
`const sdkMembers` inside `runCapabilityProbe` (not exported, so
`sdk-inventory.ts` has no way to import it even if it wanted to); it drives
the factory-time refusal (`theta/load/host-incompatible`,
`sdk-capability-missing`) when a host is missing one of the eight. Ten lines
away in the SAME file, `FACTORY_PROBABLE_CAPABILITIES` (the four
factory-probed *capability IDs*, `[1, 2, 4, 6]`) is `export`ed and *is*
imported by `sdk-inventory.ts` — so the file already uses the "one shared
array" pattern for the adjacent concern (which capabilities are factory-probed)
but not for this one (which member paths those capabilities require).

## Evidence

Site 1 — src/extension/capability-probe.ts:310-322 (the runtime probe list,
inside `runCapabilityProbe`'s try block for step (c)):
```ts
    const sdkMembers: ReadonlyArray<readonly [string, () => unknown]> = [
      ["pi.registerCommand", () => readProp(pi, "registerCommand")],
      ["pi.sendUserMessage", () => readProp(pi, "sendUserMessage")],
      ["pi.registerTool", () => readProp(pi, "registerTool")],
      ["pi.setActiveTools", () => readProp(pi, "setActiveTools")],
      ["pi.getActiveTools", () => readProp(pi, "getActiveTools")],
      // Bug 0001 / PIC-64: the capability-4 registry-snapshot read behind
      // mode-independent `tools:` admission and both extension-tool reach
      // paths (capability-inventory-items.md item 4). Absence refuses
      // fail-closed via the same sdk-capability-missing kind.
      ["pi.getAllTools", () => readProp(pi, "getAllTools")],
      ["pi.registerMessageRenderer", () => readProp(pi, "registerMessageRenderer")],
      ["pi.sendMessage", () => readProp(pi, "sendMessage")],
    ];
```

Site 2 — src/extension/sdk-inventory.ts:225-238 (the build-time inventory's
matching rows, inside the frozen `SDK_SURFACE_INVENTORY` array):
```ts
    { id: "pi.registerCommand", kind: "namespace-function" },
    { id: "pi.sendUserMessage", kind: "namespace-function" },
    { id: "pi.registerTool", kind: "namespace-function" },
    { id: "pi.setActiveTools", kind: "namespace-function" },
    { id: "pi.getActiveTools", kind: "namespace-function" },
    // Bug 0001 / PIC-64: `pi.getAllTools` is capability 4's fourth
    // factory-probable member (capability-inventory-items.md item 4) — the
    // registry-snapshot read behind mode-independent `tools:` admission, the
    // subagent-launch trust inference (sourceInfo.scope), and both
    // extension-tool reach paths. One row only; the former pi-member
    // trust-scope row is reconciled into this one, not duplicated.
    { id: "pi.getAllTools", kind: "namespace-function" },
    { id: "pi.registerMessageRenderer", kind: "namespace-function" },
    { id: "pi.sendMessage", kind: "namespace-function" },
```

Diff verdict: **parallel, not clone-shaped**. The eight string literals
(`pi.registerCommand` … `pi.sendMessage`) are identical, in the identical
order, on both sides — a counted match of 8 of 8 — but the surrounding
structure is not a copy-paste of one token stream: site 1 is an array of
2-tuples `[name, () => readProp(...)]` feeding a `typeof` loop, site 2 is an
array of `{ id, kind: "namespace-function" }` object rows feeding a presence
filter (`surfaceInventoryPresenceFailures`, version-bump-gates.ts). This is
why the mechanical clone map lists no group for either file: the two
enumerations genuinely differ in shape, but the underlying *set* they both
answer for ("which `pi.<member>` names does the factory-probable capability
subset require") is the same set, mirrored by hand in two places.

## Why this is a problem
Both lists are independently load-bearing gates over the same underlying
question, at two different times: `capability-probe.ts`'s list gates
*runtime* host compatibility (a host missing one of the eight refuses theta
registration with `sdk-capability-missing`), and `sdk-inventory.ts`'s
matching rows gate *build-time* SDK version bumps
(`surfaceInventoryPresenceFailures` fails the gate when a pinned SDK version's
surface is missing an inventoried `namespace-function` id). If the two lists
diverge — a ninth factory-probable member added to one and not the other, or
a name renamed on only one side — the runtime probe and the build-time gate
would silently stop agreeing on what the SDK must expose: a host could pass
the build-time inventory check yet be refused at runtime by a member the
inventory never lists, or a version bump could be waved through by the
build-time gate while the runtime probe still demands a member the gate never
verified. Neither file can import the other's copy today:
`capability-probe.ts`'s `sdkMembers` is declared *inside* the function body,
not exported, so there is no symbol for `sdk-inventory.ts` to import even if
it wanted to. Grepping `tests/sdk-inventory.test.ts` and
`tests/capability-probe.test.ts` for any cross-check between the two lists
finds none — each test file exercises only its own module's list, so nothing
(not even a test) currently notices if the two enumerations drift apart.

## Suggested direction (non-binding, optional)
`capability-probe.ts` is the natural shared home (hypothesis): it already
exports `FACTORY_PROBABLE_CAPABILITIES` for `sdk-inventory.ts` to import for
the adjacent (capability-ID) concern, so exporting the eight member-path
strings (or the tuple array itself, if the probe's per-member `readProp`
closures are kept function-local) alongside it would let
`SDK_SURFACE_INVENTORY`'s eight rows be built from the same list the runtime
probe iterates, instead of a hand-kept second copy.

## False-positive check
- Both-live check: `capability-probe.ts`'s `sdkMembers` loop runs inside
  `runCapabilityProbe`, the exported Step 0 entry point
  (`export function runCapabilityProbe`); `sdk-inventory.ts`'s
  `SDK_SURFACE_INVENTORY` is exported and consumed by
  `surfaceInventoryPresenceFailures` (src/extension/version-bump-gates.ts) —
  neither is a dead copy.
- No shared declaration: `capability-probe.ts`'s `sdkMembers` is a
  function-local `const` (not module-level, not exported) — confirmed by
  reading the enclosing `runCapabilityProbe` body — so `sdk-inventory.ts`
  cannot be importing it under a different name; the only symbol the two
  modules share is `FACTORY_PROBABLE_CAPABILITIES` (the capability-ID array),
  which is a different list (four integers, not the eight member-path
  strings).
- Test cross-check search: `grep -n "sdkMembers\|namespace-function"
  tests/sdk-inventory.test.ts tests/capability-probe.test.ts` shows each file
  asserting only against its own module's own list; no test imports both
  modules together to compare the two eight-member sets.
- Order/content re-verification: both cited excerpts re-read immediately
  before filing; the eight names and their order are identical on both sides
  (`pi.registerCommand`, `pi.sendUserMessage`, `pi.registerTool`,
  `pi.setActiveTools`, `pi.getActiveTools`, `pi.getAllTools`,
  `pi.registerMessageRenderer`, `pi.sendMessage`).
- Carve-out check: not a spec-repeated normative vector table (the spec
  states the eight-member *set* once, capability-probe.md Step 0 (c); the
  repetition is in this repo's two implementations, not in the spec); not two
  AST passes over `Expr`/`Stmt` kinds (filed as `parallel` on the "per-mode
  table" branch of that class, per the brief's own examples); both files are
  production `src/**` modules, not tests/.
- Clone-map re-check: the shard's map lists "(no clone groups)" for
  `src/extension/capability-probe.ts`; consistent with this being parallel
  (no clone-level token-stream similarity) rather than a missed clone.

## Triage
verdict: questionable — reality reproduces exactly (both eight-member lists byte-match at the cited lines in identical order, capability-probe.ts:310's `sdkMembers` is confirmed function-local and unexported so no shared declaration exists, FACTORY_PROBABLE_CAPABILITIES is confirmed exported/imported as the adjacent counter-example, clone-scan.mjs reports "(no clone groups)" for both files, and grepping both test files finds no cross-check between the two lists); d4_class: parallel caps accurate accounting at questionable by design — a shared source of truth is a human ruling, never a triage confirmation (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-13): capability-probe.ts is the shared home. Export a readonly tuple of the eight pi.<member> names (FACTORY_PROBED_SDK_MEMBERS, e.g. as const of "pi.registerCommand" ... "pi.sendMessage" in today's order) beside FACTORY_PROBABLE_CAPABILITIES; runCapabilityProbe builds its [name, () => readProp(pi, <member>)] tuples from that list (member = the name after the pi. prefix); SDK_SURFACE_INVENTORY's eight namespace-function rows are produced from the same list (spread of a map to { id, kind: "namespace-function" }) in place of the eight hand-written rows, keeping their position and the Bug 0001 / PIC-64 comment. No new import edge (sdk-inventory.ts already imports from capability-probe.ts). Behaviour identical; both existing test files stay green unchanged.
