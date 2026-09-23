---
id: pending
title: toolCallableName and piToolCallableName inline the tools-entry bare-identifier classifier that callable-set.ts exports as isBareIdentifier
lens: D8
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1406
  - src/parser/theta-document.ts:1448
  - src/parser/callable-set.ts:568-575
sites: 2
fix_scope: module
d8_class: reimplemented
d8_host: src/parser/theta-document.ts#toolCallableName
wave: qw20260923145222
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# toolCallableName and piToolCallableName inline the tools-entry bare-identifier classifier that callable-set.ts exports as isBareIdentifier

## Observation
`theta-document.ts` derives presented callable names for `tools:` entries at
parse time in two sibling helpers, `toolCallableName` (1400-1410) and
`piToolCallableName` (1445-1452). Both classify the entry's spec token as
"bare Pi-tool name vs `.theta` path" by testing `/^[A-Za-z_][A-Za-z0-9_]*$/`
inline. `callable-set.ts` — the module this file already imports
`thetaDefaultName` from (theta-document.ts:75, the PTQ-1236 fix) — exports
`isBareIdentifier(spec)` whose body is exactly that test, documented as "the
shape that marks a `tools:` entry as a Pi-tool name rather than a `.theta`
path literal". `piToolCallableName`'s own doc comment names the borrow: "the
same shape test `callable-set.ts`'s `resolveEntry` classifies entries by".

## Evidence
src/parser/theta-document.ts:1401-1410 (`toolCallableName`; line 1406 is the inline test):

```ts
function toolCallableName(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length >= 3 && parts[1] === "as") {
    return parts[2] ?? "";
  }
  const spec = parts[0] ?? "";
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return spec;
  }
  return thetaDefaultName(spec);
}
```

src/parser/theta-document.ts:1445-1452 (`piToolCallableName`; line 1448 is the inline test):

```ts
function piToolCallableName(entry: string): string | undefined {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  const spec = parts[0] ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return undefined;
  }
  return parts.length >= 3 && parts[1] === "as" ? parts[2] : spec;
}
```

The facility, src/parser/callable-set.ts:568-575 (doc + body, verbatim):

```ts
/**
 * A bare theta identifier `[A-Za-z_][A-Za-z0-9_]*` with no path separator or
 * extension — the shape that marks a `tools:` entry as a Pi-tool name rather
 * than a `.theta` path literal.
 */
export function isBareIdentifier(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}
```

Feature-for-feature at the call sites' real needs: both helpers apply the test
to `parts[0]` — a whitespace-free token (both split on `/\s+/` first) — to
decide the Pi-tool-vs-`.theta`-path route, the identical question
`resolveCallableSet` answers via `isBareIdentifier` at callable-set.ts:429.
`isBareIdentifier` takes the same `string` and returns the same boolean; no
behavioural difference exists for any input. Every other production consumer
of this classification already delegates: callable-lowering.ts:261 and
tools-entry-gate.ts:49 (both fixed under PTQ-1435), runtime-tools.ts:100.
`grep -n "isBareIdentifier" src/parser/theta-document.ts` — 0 hits; these two
inline tests are the remaining production copies of the tools-entry classifier
(the other `^[A-Za-z_][A-Za-z0-9_]*$` hits across src/ answer different
questions — field-name shape, runtime `<key>` rendering — not the `tools:`
entry route).

## Why this is a problem
The classifier that decides which grammar a `tools:` entry is read under is
minted in one exported place precisely so readers cannot drift (the same
single-implementation posture `thetaDefaultName`'s doc pins, which
theta-document.ts already honours since PTQ-1236, and which PTQ-1435
re-established for callable-lowering/tools-entry-gate). These two hand-spelled
copies re-open the drift channel: a future widening or tightening of the
bare-name shape in `isBareIdentifier` (e.g. admitting a new spec form) changes
load-time routing while the parse-time seed/carve-out helpers here silently
keep the old shape, splitting the parse-layer and load-layer classification of
the same entry.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `isBareIdentifier` alongside the existing
`thetaDefaultName` import from `./callable-set` and replace the two inline
regex tests. The "DELIBERATELY wider than `parseToolsEntry`" rationale both
doc comments carry concerns not delegating the whole-entry parse to
`parseToolsEntry`; it does not bear on the spec-shape predicate itself, which
would remain byte-identical.

## False-positive check
- Dedupe: PTQ-1236 (fixed) covered `toolCallableName`'s `.theta`-path arm
  (`thetaDefaultName`), not this classifier; PTQ-1435 (fixed) covered the
  identical classifier at callable-lowering.ts / tools-entry-gate.ts, not
  these theta-document sites (its Evidence names only those two hosts). No
  intake/issue file names theta-document's inline bare-ident test.
- Rationale check (D2 precedent): the in-code "DELIBERATELY wider" rationale
  (bug 0106 §Fix constraint 7) argues against delegating to `parseToolsEntry`'s
  closed grammar — delegating the shape test to `isBareIdentifier` preserves
  that tolerance exactly, so no stated design decision is contradicted.
- Cycle check: theta-document.ts:75 already imports from `./callable-set`, so
  delegation introduces no new edge.
- Spec check: frontmatter-fields-a.md's default-name/entry-shape rules are
  unaffected — the predicate's behaviour is unchanged; no clause is challenged.
- Exemption check: no D8 exemption exists for either host (`store.mjs
  exemptions --lens D8` list in the brief names only discovery-walk.ts and
  production-theta-producer.ts).

## Triage
verdict: questionable — accounting verified: both inline `/^[A-Za-z_][A-Za-z0-9_]*$/` tests reproduce at theta-document.ts:1406 (`toolCallableName`) and :1448 (`piToolCallableName`) on the whitespace-split `parts[0]` token, `isBareIdentifier` at callable-set.ts:573-575 is byte-identical with the quoted "Pi-tool name rather than a `.theta` path literal" doc and is what `resolveEntry` classifies by at :429, theta-document.ts:75 already imports `thetaDefaultName` from `./callable-set` (no new edge), `grep isBareIdentifier src/parser/theta-document.ts` = 0 hits while callable-lowering.ts:261 / tools-entry-gate.ts:49 / runtime-tools.ts:100 all delegate; PTQ-1435 (resolved) cited only callable-lowering/tools-entry-gate and PTQ-1236 (resolved) covered `thetaDefaultName` not this predicate, so not a duplicate; no D8 exemption for theta-document.ts; the in-code "DELIBERATELY wider than `parseToolsEntry`" rationale bears on whole-entry parsing, not the spec-shape predicate, and no spec clause is affected — the simpler shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: inline `/^[A-Za-z_][A-Za-z0-9_]*$/` tests stand at theta-document.ts:1406 (toolCallableName) and :1448 (piToolCallableName), both on the whitespace-split parts[0] spec; callable-set.ts:568-575 exports isBareIdentifier byte-identical with the quoted Pi-tool-vs-.theta-path doc and resolveEntry routes on it at :429; theta-document.ts:75 already imports thetaDefaultName from ./callable-set (no new edge); grep isBareIdentifier src/ shows callable-lowering.ts:261, tools-entry-gate.ts:49, runtime-tools.ts:100 delegate and theta-document has 0 hits; the other src hits of the regex answer different questions (field/param idents, key rendering); the bug-0106 "DELIBERATELY wider" rationale covers only the parts.length >= 3 split vs parseToolsEntry, not the spec predicate, so no behaviour or spec clause changes; resolved PTQ-1435 named only callable-lowering/tools-entry-gate and PTQ-1236 only the thetaDefaultName arm, so not a duplicate; no D8 exemption for theta-document.ts; D8 reimplemented never confirms — the delegation is a design decision for a human ruling (triage: claude-opus-5-5)
