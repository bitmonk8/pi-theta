---
id: PTQ-1216
title: The cross-stdlib signature substrate (StdlibParamKind, StdlibMemberSignature, and the two argument belts) lives in stdlib-string.ts by alphabetical accident, touching 0 string members while 4 external modules import it
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/runtime/stdlib-string.ts:47-47
  - src/runtime/stdlib-string.ts:57-61
  - src/runtime/stdlib-string.ts:81-102
  - src/runtime/stdlib-string.ts:116-128
sites: 4
fix_scope: cross-module
d9_class: misplacement
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# The cross-stdlib signature substrate (StdlibParamKind, StdlibMemberSignature, and the two argument belts) lives in stdlib-string.ts by alphabetical accident, touching 0 string members while 4 external modules import it

## Observation
`src/runtime/stdlib-string.ts` (the V3f `string` stdlib member seam) hosts four
declarations that are the shared signature substrate for all three stdlib
member surfaces (`string` / `array<T>` / `object`) and for the parser's
stdlib argument checks: `StdlibParamKind` (line 47), `StdlibMemberSignature`
(57-61), `assertStdlibArgumentKinds` (81-102), and
`assertStdlibMemberArguments` (116-128), ~41 LOC. Their own doc comment states
the placement was chosen alphabetically, not by affinity.

## Evidence
The placement rationale in the code (src/runtime/stdlib-string.ts:40-46):

```ts
 * and "any `array<U>`" (for `concat`) respectively; neither descriptor is
 * meaningful outside an array receiver, so `string`/`object` signatures never
 * spell them. Defined once here (the first stdlib module read alphabetically)
 * and imported by `stdlib-array.ts` / `stdlib-object.ts` rather than
 * redeclared three times, so the parser's type-check arm and the three
 * runtime-belt dispatchers all read ONE shape.
 */
export type StdlibParamKind = "string" | "integer" | "element" | "array";
```

Affinity counted both ways:
- The four declarations reference 0 members of stdlib-string's own string
  surface (`STRING_MEMBERS`, `STRING_MEMBER_SIGNATURES`, `evaluateStringMember`,
  `replaceLiteral`, `concatElementType` — none touched). They touch 3 foreign
  members: `ThetaValue` (`./value`), `StdlibMethodArgumentDefectError` and
  `StdlibMethodArgumentKindDefectError` (`./runtime-panics`, lines 90/93/96/124).
- Consumers: 4 external src modules import them —
  `src/runtime/stdlib-array.ts:29` (`assertStdlibMemberArguments`,
  `StdlibMemberSignature`), `src/runtime/stdlib-object.ts:52` (same pair),
  `src/parser/stdlib-arg-diagnostics.ts:38` (`StdlibMemberSignature`,
  `StdlibParamKind`), `src/parser/type-layer-checks.ts:96-99`
  (`StdlibMemberSignature`) — versus exactly 1 in-module use
  (`evaluateStringMember`, line 190, calls `assertStdlibMemberArguments`).
  Structural map: `StdlibMemberSignature` 4 src importers,
  `assertStdlibMemberArguments` 2 src importers.
- Two of `StdlibParamKind`'s four arms (`"element"`, `"array"`) are, per its own
  doc (lines 39-42), meaningful only for the `array<T>` table in
  `stdlib-array.ts` — foreign to every string signature.

Sibling pattern: the OTHER shared stdlib substrate — the defect errors the
belts throw — already lives in a shared module, not in one concrete surface:
`StdlibMethodArgumentDefectError` (src/runtime/runtime-panics.ts:698) and
`StdlibMethodArgumentKindDefectError` (src/runtime/runtime-panics.ts:730),
imported by stdlib-string.

## Why this is a problem
Generic machinery serving three peer surfaces and two parser checks sits inside
one of the peers, chosen (by the comment's own admission) because that peer
sorts first alphabetically. The counts show the affinity: 0 references to the
host's own surface, 3 references to shared foreign modules, 4 external
importers versus 1 in-module use, and half of `StdlibParamKind`'s arms
documented as array-only. It also makes two parser-layer modules import the
runtime `string` surface module to obtain shape types that have nothing
string-specific about them.

## Suggested direction (non-binding, optional)
Hypothesis (unproven; the human ratifies): move the four declarations to a
shared home — e.g. a new `src/runtime/stdlib-signature.ts` (~41 LOC, 4 exported
symbols, external importers today 4 src per the counts above), next to the
sibling substrate in `runtime-panics.ts` — with stdlib-string becoming a plain
consumer like its two peers. No cross-references back into stdlib-string would
remain from the moved code.

## False-positive check
- Affinity counted both ways (0 own-member touches vs 3 foreign; 4 external
  importers vs 1 in-module use), member names listed.
- Sibling-pattern citation: runtime-panics.ts:698/730 hosts the belts' shared
  defect errors in a shared module.
- Barrel/facade check: stdlib-string is not a re-export barrel; the substrate is
  declared here, and the "defined once here" comment argues against
  *re-declaration*, not for this specific host — the dedup survives a move
  unchanged.
- Deliberate-placement check: the comment's stated reason is alphabetical order,
  not affinity; no exemption in quality/exemptions.json for this path; no prior
  PTQ/intake finding covers this placement (PTQ-1119 covers the three
  dispatchers' cloned switch shape, a D4 concern distinct from where the shared
  signature types live).
- Band: exempt for breakdown (269 LOC file); placement review is
  size-independent.

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: the four declarations sit at stdlib-string.ts:47/57-61/81-102/116-128 and touch 0 own-host members (STRING_MEMBERS/STRING_MEMBER_SIGNATURES/evaluateStringMember/replaceLiteral/concatElementType untouched) vs 3 foreign (ThetaValue, StdlibMethodArgumentDefectError, StdlibMethodArgumentKindDefectError), the doc's "first stdlib module read alphabetically" rationale is byte-exact at 42-43, external importers re-grep to exactly 4 (stdlib-array.ts:29, stdlib-object.ts:52, parser/stdlib-arg-diagnostics.ts:38, parser/type-layer-checks.ts:98) vs 1 in-module call (line 187, 3-line drift from the cited 190), the sibling substrate lives in runtime-panics.ts:698/730 as claimed, no quality/exemptions.json row for the host, not a barrel, and PTQ-1119 (D4 dispatcher clone, fixed) is a distinct root cause; the fix stage should note tests/b0419-b0366-header-reversed-belt-design-gate.test.ts cell A pins the StdlibMemberSignature doc and the assertStdlibArgumentKinds call to src/runtime/stdlib-string.ts by path, so a move must carry that gate (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
