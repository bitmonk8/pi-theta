---
id: PTQ-0026
title: Hard-pinned line-number citations in wire-form-depth-walk.ts and wire-translation.ts comments no longer point at the code they name
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/wire-form-depth-walk.ts:18-19
  - src/runtime/wire-translation.ts:380-381
  - src/runtime/wire-translation.ts:388-390
  - src/runtime/wire-translation.ts:396-397
  - src/runtime/wire-translation.ts:695-696
  - src/runtime/wire-translation.ts:714-715
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Hard-pinned line-number citations in wire-form-depth-walk.ts and wire-translation.ts comments no longer point at the code they name

## Observation
Comments in these two modules cite collaborating code by hard-pinned line
number (`subagent-envelope.ts:555`, `type-layer-checks.ts:317`,
`type-compat.ts:98-109`, and intra-file `:212`/`:217`/`:221`/`:225`/`:320`/
`:578`). Every one of these citations has drifted: the named declaration now
sits tens to hundreds of lines away, and the cited line holds unrelated text
(a closing brace, a different function's doc comment, a parameter line). The
prose claims themselves remain true; only the pinned positions are stale.

## Evidence
src/runtime/wire-form-depth-walk.ts:18-19 — cites `classifyWireNode` at
`subagent-envelope.ts:555`:

```
// `:24–30`), so this walk classifies every node through `classifyWireNode`
// (`./subagent-envelope.ts:555`) — the one function bug 0201 already exported
```

Actual: `classifyWireNode` is declared at src/runtime/subagent-envelope.ts:644
(`export function classifyWireNode(value: unknown): WireNode {`); line 555 is
a bare `}`.

src/runtime/wire-translation.ts:380-381 — cites `collectTypeEnv`'s design note
at `type-layer-checks.ts:317`:

```
  // Null-prototype for the same class of hazard `collectTypeEnv`'s design
  // note (`../parser/type-layer-checks.ts:317`) states for a `NamedType`
```

Actual: `collectTypeEnv` is declared at src/parser/type-layer-checks.ts:434 and
its null-prototype design note spans :422-433; line 317 is inside a different
function's doc comment (`* ('./theta-document.ts': 'frontmatter?.params?...`).

src/runtime/wire-translation.ts:388-390 — four intra-file pins:

```
  // No read in this module needs a matching own-key guard. The three
  // per-position lookups are `Map`s (`indexOf`, `:212`; `wireToTheta`
  // `:217`, `enumByPointer` `:221`, `refByPointer` `:225`), and a `Map`
```

Actual: `function indexOf` is at :240, `const wireToTheta = new Map` at :245,
`const enumByPointer = new Map` at :249, `const refByPointer = new Map` at
:253. Today :212 is `readonly enumDeclaringPath: string | undefined;`, :217 is
doc text, :221 is `return walk.enumDeclaringPath === undefined`, :225 is blank.

src/runtime/wire-translation.ts:396-397 — cites `resolveNamed` at
`type-compat.ts:98-109`:

```
  // A lookup this walk adds later by an author- or payload-controlled key
  // uses `Object.hasOwn`, per `type-compat.ts:98-109` (`resolveNamed`).
```

Actual: `export function resolveNamed` is at src/parser/type-compat.ts:146
(its `Object.hasOwn` note at :120-124); :98-109 today holds the `NamedDecl`
type declaration.

src/runtime/wire-translation.ts:695-696 — cites `lowerOutbound`'s enum
collapse at `:578`:

```
    // The boxed enum carrier's wire form is its bare string — the same
    // collapse `lowerOutbound` performs for the outbound direction (`:578`).
```

Actual: `lowerOutbound`'s `if (value instanceof String)` collapse is at :622;
:578 today is a bare `}`.

src/runtime/wire-translation.ts:714-715 — cites `rebuildInbound`'s
`isResultValue` arm at `:320`:

```
    // places no constraint on, and this projection exists solely for AJV's
    // eyes. Mirrors `rebuildInbound`'s own `isResultValue` arm (`:320`).
```

Actual: `if (isResultValue(value as ThetaValue)) {` inside `rebuildInbound` is
at :348; :320 today is `  sidecar: SchemaSidecar | undefined,` (a parameter of
`rebuildInbound`'s signature).

## Why this is a problem
Stale documentation pointers: each citation was written to route a reader to a
specific declaration, and each now lands on unrelated text, so the comments
assert locations the current code contradicts. The count is exhaustive for
these two files — every other pinned citation in them was checked and is
accurate (`value.ts:135` for `makeEnumValue`; `inbound-boundary.ts:68`;
`schema-subset.md:13`, `:22`, `:24-30`), which shows the drifted six are decay,
not a deliberate convention of approximate pointers.

## Suggested direction (non-binding, optional)
Re-anchor the six citations on the named identifiers alone (module + symbol
name, which the surrounding prose already carries) or refresh the numbers;
symbol-only references cannot drift this way.

## False-positive check
- Verified each cited target's current declaration line with grep:
  `classifyWireNode` (subagent-envelope.ts:644), `collectTypeEnv`
  (type-layer-checks.ts:434, note :422-433), `resolveNamed`
  (type-compat.ts:146), `indexOf` (wire-translation.ts:240), `wireToTheta`
  (:245), `enumByPointer` (:249), `refByPointer` (:253), `lowerOutbound`
  String collapse (:622), `rebuildInbound` `isResultValue` arm (:348).
- Verified what sits at each cited line today with `sed -n
  '212p;217p;221p;225p;320p;578p' src/runtime/wire-translation.ts`, `sed -n
  '555p' src/runtime/subagent-envelope.ts`, `sed -n '317p'
  src/parser/type-layer-checks.ts` — none holds the named code.
- Checked the remaining pinned citations in both files for accuracy so the
  finding does not overstate: `value.ts:135` (correct — `makeEnumValue` is at
  :135), `inbound-boundary.ts:68` (correct — inside the doc comment making the
  stated claim), `schema-subset.md:13/:22/:24-30` (correct — the Depth bullet,
  the Depth Enforcement opening, and the counting algorithm).
- Checked the wave's already-filed staleness findings
  (d2-02-ceiling-arbitration-consult-narration-stale,
  d2-03-countable-frame-three-count-stale,
  d2-04-interpolation-source-stale-call-site-count,
  d2-04-sdk-inventory-createagentsession-comment-stale,
  d2-05-system-note-four-arm-comment-stale, d2-06-detached-doc-comments): none
  cites wire-form-depth-walk.ts or wire-translation.ts.

## Triage
verdict: confirmed — re-verified all 6 excerpts verbatim and every pin wrong (555→644, 317→434, 212/217/221/225→240/245/249/253, 98-109→146, 578→622, 320→348); git shows the 555 pin was correct when written, proving decay, and the 3 pins its FP-check omitted are in fact accurate so the count does not overstate (triage: claude-opus-5)
