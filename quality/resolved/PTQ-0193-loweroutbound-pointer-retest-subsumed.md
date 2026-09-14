---
id: PTQ-0193
title: lowerOutbound re-tests `pointer === ""` for a field's wire key, a condition its own `thetaToWire` construction already decided
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/wire-translation.ts:615-620
  - src/runtime/wire-translation.ts:648-653
  - src/runtime/wire-translation.ts:659-664
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910133034
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# lowerOutbound re-tests `pointer === ""` for a field's wire key, a condition its own `thetaToWire` construction already decided

## Observation
`lowerOutbound` takes `sidecar: SchemaSidecar | undefined` and
`pointer: string` as parameters and never reassigns either within the
function body. It builds the local rename map `thetaToWire` only when
`sidecar !== undefined && pointer === ""`; on every call where that test is
false, `thetaToWire` stays the empty `Map` it was constructed as. Later in the
very same call, the field loop computes each entry's wire key with
`(pointer === "" ? thetaToWire.get(thetaKey) : undefined) ?? thetaKey`,
re-testing `pointer === ""` a second time before reading the map whose
population that identical test already gated.

## Evidence
src/runtime/wire-translation.ts:615-620 — `sidecar` and `pointer` are plain
parameters of `lowerOutbound`, not reassigned anywhere below:

```ts
function lowerOutbound(
  value: ThetaValue,
  sidecar: SchemaSidecar | undefined,
  pointer: string,
  sidecars: ReadonlyMap<string, SchemaSidecar>,
): unknown {
```

src/runtime/wire-translation.ts:648-653 — `thetaToWire`'s only mutation site,
gated by `sidecar !== undefined && pointer === ""`:

```ts
  const thetaToWire = new Map<string, string>();
  if (sidecar !== undefined && pointer === "") {
    for (const entry of sidecar.wireNames) {
      thetaToWire.set(entry.theta, entry.wire);
    }
  }
```

src/runtime/wire-translation.ts:659-664 — the read, re-testing the same
`pointer === ""` condition before consulting the map:

```ts
  const result: { [k: string]: unknown } = Object.create(null) as { [k: string]: unknown };
  for (const [thetaKey, fieldValue] of Object.entries(value)) {
    const wireKey = (pointer === "" ? thetaToWire.get(thetaKey) : undefined) ?? thetaKey;
    const fieldPointer = `${pointer}/properties/${encodePointerSegment(wireKey)}`;
    result[wireKey] = lowerOutbound(fieldValue as ThetaValue, sidecar, fieldPointer, sidecars);
  }
```

## Why this is a problem
The `pointer === ""` test at :661 discriminates nothing that the map's own
construction has not already decided in this same call. `thetaToWire` is
mutated only inside the :649 guard, so whenever that guard's condition is
false — either because `pointer !== ""` or because `sidecar === undefined` —
`thetaToWire` is the empty map it started as, and `thetaToWire.get(thetaKey)`
already evaluates to `undefined` without needing the :661 ternary to supply
that value by hand. Checking all four combinations of
`{sidecar defined, sidecar undefined} × {pointer === "", pointer !== ""}`
against both the guard at :649 and the read at :661 gives the same result in
each: `thetaToWire.get(thetaKey)` alone equals what the ternary
`pointer === "" ? thetaToWire.get(thetaKey) : undefined` computes, in every
case. The condition at :661 is therefore not choosing between two different
outcomes; it is re-asserting, one statement removed from where the map was
built, a fact the map's own construction already guarantees.

## Suggested direction (non-binding, optional)
The rename lookup could read `thetaToWire.get(thetaKey) ?? thetaKey` directly
and drop the `pointer === "" ? … : undefined` wrapper, relying on the map
being empty off-root exactly as its construction already arranges.

## False-positive check
- Confirmed `pointer` and `sidecar` are never reassigned in `lowerOutbound`:
  `awk 'NR>=615 && NR<=666' src/runtime/wire-translation.ts | grep -nE
  "pointer[[:space:]]*=[^=]|sidecar[[:space:]]*=[^=]"` → zero matches (every
  occurrence is a `===`/`!==`/`?.` read or a same-named argument in a
  recursive call).
- Verified `thetaToWire`'s only `.set` call site is the one shown at :650-651,
  itself inside the :649 guard — no other assignment or mutation of
  `thetaToWire` exists in the function.
- Enumerated the four `{sidecar defined/undefined} × {pointer === ""/!== ""}`
  combinations by hand against both the :649 guard and the :661 read and
  confirmed `thetaToWire.get(thetaKey)` alone matches the ternary's value in
  every one (both reduce to `undefined` off-root regardless of `sidecar`, and
  to the same `.get()` call on-root).
- Checked this is not a compiler-forced narrowing (unlike the `index?.`
  chain the file's `orderedEntries`/`rebuildInbound` pairing relies on,
  already excluded from the resolved finding about the adjacent
  `rebuildInbound` pointer ternary): `Map.get` returns `string | undefined`
  and the ternary's other arm is the literal `undefined`, so
  `thetaToWire.get(thetaKey)` alone type-checks identically to the current
  expression — no assertion or restructuring is needed to make the types
  agree.
- Confirmed this is a different location from the already-resolved
  `PTQ-0122` (`rebuildInbound`'s `pointer === ""` ternary at former :408,
  inside the INBOUND walk) — this finding is in `lowerOutbound`, the OUTBOUND
  walk, a separate function with its own parameter bindings.
- Confirmed the most recent commit touching this file
  (`ae6733f3`, "quality: qw20260910054544 D2 fix src/runtime", which fixed
  `PTQ-0122` and several stale citations) did not touch `lowerOutbound`:
  `git show ae6733f3 -- src/runtime/wire-translation.ts` shows no hunk inside
  this function.
- Searched the already-filed and resolved issue lists for this wave and prior
  waves for `lowerOutbound` / `thetaToWire`: no match, so this is not a
  re-filing of prior work.

## Triage
<!-- triage appends here -->
verdict: confirmed — all three excerpts byte-match at :615-620/:648-653/:659-664; independently re-derived the four-case table {sidecar defined/undefined}×{pointer===""/!==""} against the :649 guard and :661 read and confirmed `thetaToWire.get(thetaKey)` alone equals the ternary's value in every case (the map is empty in exactly the cases where the ternary's false arm would fire, since both are gated by the same unreassigned `pointer`/`sidecar`); confirmed no compiler-forced narrowing (`Map<string,string>.get` already types as `string | undefined`, identical to the ternary); confirmed `ae6733f3` (the commit that fixed sibling PTQ-0122 in `rebuildInbound`) never touched `lowerOutbound`'s body, and no filed/resolved issue names `lowerOutbound`/`thetaToWire`, so this is a live, distinct instance of the same subsumed-condition pattern, not a duplicate (triage: claude-opus-5)
