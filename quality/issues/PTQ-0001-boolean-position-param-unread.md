---
id: PTQ-0001
title: checkBooleanPosition declares a `position` input field it never reads; the BooleanPosition union types nothing else
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/expression-evaluator.ts:567-584
  - src/parser/type-layer-checks.ts:2287-2292
  - src/parser/type-layer-checks.ts:3069-3074
  - src/parser/type-layer-checks.ts:3083-3088
  - src/parser/type-layer-checks.ts:3099-3104
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkBooleanPosition declares a `position` input field it never reads; the BooleanPosition union types nothing else

## Observation
`checkBooleanPosition` takes an options object with three fields: `position`,
`operandType`, and `site`. The body destructures only `operandType` and `site`;
`position` is never referenced anywhere in the function, and the emitted
diagnostic (`condition must be boolean; got <type>`) carries no position
information. Every call site — four in production, five in tests — constructs
and passes a `position` value the function discards. The exported
`BooleanPosition` union is used in exactly one place: as the type of this
unread field.

## Evidence
src/runtime/expression-evaluator.ts:567-584 — the field is declared, then
omitted from the destructure and never read (the body's remaining lines
584-612 reference only `operandType`, `site`, `booleanType`, and `r`):
```ts
export type BooleanPosition = "if" | "while" | "ternary-condition" | "&&" | "||" | "!";
...
export function checkBooleanPosition(opts: {
  readonly position: BooleanPosition;
  readonly operandType: CompatType;
  readonly site: CompatSite;
}): Diagnostic[] {
  const { operandType, site } = opts;
```

All four production call sites pass a `position` value:

src/parser/type-layer-checks.ts:2287-2292:
```ts
      ...checkBooleanPosition({
        position,
        operandType: this.typeOf(condition, bindings),
        site: { file: this.file, range: condition.range },
      }),
```
src/parser/type-layer-checks.ts:3069-3074 (`position: "ternary-condition"`),
src/parser/type-layer-checks.ts:3083-3088 (`position: e.op` for `&&`/`||`),
src/parser/type-layer-checks.ts:3099-3104 (`position: "!"`) — identical shape,
differing only in the `position` literal.

Search evidence: `grep -rn "checkBooleanPosition"` across the repo returns the
definition, the four `src/parser/type-layer-checks.ts` sites above, and five
test call sites (tests/expression-evaluator.test.ts:231, 243, 254, 266, 276),
plus comments. `grep -rn "BooleanPosition"` returns the type definition
(expression-evaluator.ts:567), the `opts.position` field type
(expression-evaluator.ts:580), and one test comment quoting the union
(tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:16) — no other use.

## Why this is a problem
Vestigial input field: the value is never read (the destructure at
expression-evaluator.ts:584 provably drops it, and `opts.position` appears
nowhere in the body), yet all nine call sites must classify their site and
supply a value. The registry message for `theta/parse/non-boolean-condition`
(rendered at expression-evaluator.ts:599-607) interpolates only the operand
type, so no output path can ever depend on the field. The `BooleanPosition`
union is carried along solely to type this dead field, so both the field and
the exported type add API surface with zero behavioural effect.

## Suggested direction (non-binding, optional)
Either drop the `position` field (and the now-orphaned `BooleanPosition`
export) from the options object, or start reading it — for example in the
diagnostic message — if per-site wording is ever wanted; the fix stage owns the
choice.

## False-positive check
- Reference search: `grep -rn checkBooleanPosition` over src/, extensions/,
  tools/, tests/ — 4 production call sites, 5 test call sites, 1 definition; no
  dynamic/string-keyed access found (`grep -rn "\"checkBooleanPosition\""` — 0
  hits outside the identifier uses cited).
- Field-read search: `opts.position` / `position` within the function body
  (expression-evaluator.ts:579-612) — only the declaration at :580; the
  destructure at :584 omits it.
- Type search: `grep -rn BooleanPosition` — definition, the field type, and one
  test comment; no import of the type anywhere.
- Test-only-caller check: not applicable — the function itself is
  production-reachable (type-layer-checks.ts); the claim is about an unread
  field, not dead code.
- Deliberate-design check: unlike `pushCountableFrame` (whose doc explicitly
  states its `kind` parameter is documentation-only and voids it), neither the
  function doc nor the field carries any statement that `position` is
  intentionally unused; the doc instead implies the position drives the report
  ("Reports ... for any of the six BooleanPosition values above").

## Triage
verdict: confirmed — re-verified: `position` is declared (expression-evaluator.ts:580) and never read (body 584-608 destructures only `operandType`/`site`; no `opts.position` in the file), git shows it left unwired when V3a filled the V3a-T `void opts` stub, all 4 production call sites (type-layer-checks.ts:2287/3069/3083/3099, plus the `checkBoolean` helper's pass-through param) and 5 test sites still supply it, and word-boundary grep over src/ tests/ tools/ extensions/ finds `BooleanPosition` only at its definition, this field's type, and one test comment — no barrel re-export, no string-keyed/`typeof`/`Parameters<>` consumer, and none of the repo's deliberate-ignore markers (`void kind` in pushCountableFrame, `_position` in checkLiteralSublanguage) are present here. (triage: claude-opus-5)
