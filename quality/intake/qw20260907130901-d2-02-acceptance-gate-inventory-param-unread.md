---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: runtimeEvidenceAcceptanceFailures takes a surfaceInventory operand it explicitly voids, and every call site passes the same literal
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/version-bump-acceptance.ts:67-70
  - src/extension/version-bump-acceptance.ts:86-92
  - tests/version-bump-acceptance.test.ts:125-127
  - tests/version-bump-acceptance.test.ts:140-145
  - tests/version-bump-acceptance.test.ts:158-160
sites: 5                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# runtimeEvidenceAcceptanceFailures takes a surfaceInventory operand it explicitly voids, and every call site passes the same literal

## Observation
`runtimeEvidenceAcceptanceFailures(harnessRun, surfaceInventory)` discards its
second parameter on the first statement of its body (`void surfaceInventory;`)
and never reads it. The interface `SurfaceInventoryOutcome` exists solely to
type that parameter and has no other reference in the repository. All three
call sites in the repository pass the identical literal `{ green: true }`.

## Evidence
src/extension/version-bump-acceptance.ts:86-92 — the signature and the
immediate discard:
```ts
export function runtimeEvidenceAcceptanceFailures(
  harnessRun: HarnessRunOutcome,
  surfaceInventory: SurfaceInventoryOutcome,
): readonly string[] {
  // A green surface inventory (output (a)) does not exercise the theta against
  // the bumped SDK at runtime, so it is deliberately not consulted here.
  void surfaceInventory;
```

src/extension/version-bump-acceptance.ts:67-70 — the carrier type, used
nowhere else:
```ts
/** The build-time surface-inventory verdict (output (a)). */
export interface SurfaceInventoryOutcome {
  readonly green: boolean;
}
```

All call sites (exact search: `grep -rn
"runtimeEvidenceAcceptanceFailures|SurfaceInventoryOutcome" --include=*.ts .`
— 7 hits total: the two declaration sites above, one import, and these three
calls, each passing `{ green: true }`):

tests/version-bump-acceptance.test.ts:125-127:
```ts
    expect(
      runtimeEvidenceAcceptanceFailures(fullGreenRun, { green: true }),
    ).toEqual([]);
```

tests/version-bump-acceptance.test.ts:141-144:
```ts
    expect(
      runtimeEvidenceAcceptanceFailures(inventoryGreenNoHarnessRun, {
        green: true,
      }).length,
```

tests/version-bump-acceptance.test.ts:158-160:
```ts
    expect(
      runtimeEvidenceAcceptanceFailures(missingSurface, { green: true }).length,
    ).toBeGreaterThan(0);
```

## Why this is a problem
Vestigial parameter on both prongs of the D2 test: the value is never read
(the body voids it), and every call site passes the same value (`{ green:
true }` at all three). The doc justifies it as "accepted as an operand for
shape parity with output (a)", but no interface, callback type, or dispatch
table constrains this function's arity — it is a free function whose only
callers are the unit tests, so there is nothing to be parity-shaped with. The
parameter drags a whole otherwise-unreferenced interface
(`SurfaceInventoryOutcome`) along with it, and its presence suggests the
inventory verdict participates in the acceptance decision when the gate's own
contract (and body) says it must not.

## Suggested direction (non-binding, optional)
Drop the `surfaceInventory` parameter and the `SurfaceInventoryOutcome`
interface; the function's doc comment already carries the normative statement
that a green surface inventory never substitutes for the harness run, which is
the whole content the parameter was gesturing at.

## False-positive check
- Reference search: `grep -rn "runtimeEvidenceAcceptanceFailures|
  SurfaceInventoryOutcome" --include=*.ts .` — hits only in
  src/extension/version-bump-acceptance.ts (declarations) and
  tests/version-bump-acceptance.test.ts (import + the three calls quoted
  above). No other src/, tools/, or extensions/ reference; no re-export.
- String-keyed/dynamic access: no string `"surfaceInventory"` or
  `"SurfaceInventoryOutcome"` appears anywhere outside these two files.
- Test-only-caller rule: the FUNCTION being test-only-reachable is not the
  claim (the module doc states no shipped composition feeds these seams, and
  that is deliberate); the claim is confined to the parameter, whose value no
  caller varies and no body statement reads.
- Body read check: the only occurrence of `surfaceInventory` inside the
  function is the `void surfaceInventory;` discard at :92.
- Git intent: `git log -S "surfaceInventory" --
  src/extension/version-bump-acceptance.ts` → single commit 0787237f
  ("V18d-T — version-bump runtime-evidence acceptance-gate + revert-path
  failing tests"); the parameter was born voided and no later commit added a
  read.

## Triage
