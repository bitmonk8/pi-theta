---
id: PTQ-1680
title: The polarity-constant "last rung" is selected two ways — polarity.ts exports defaultHeatEndpoints as the ladder's last rung while endpoint-ladder.ts re-selects the constants inline and never calls it
lens: D1
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/render/polarity.ts:60-71
  - src/extension/execution-status/render/endpoint-ladder.ts:40-55
  - tests/execution-status-render-color.test.ts:298-307
sites: 3
fix_scope: module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The polarity-constant "last rung" is selected two ways — polarity.ts exports defaultHeatEndpoints as the ladder's last rung while endpoint-ladder.ts re-selects the constants inline and never calls it

## Observation
`render/polarity.ts` exports `defaultHeatEndpoints(polarity)` and documents it as "Select the constant endpoint pair for a polarity (the ladder's last rung)". `render/endpoint-ladder.ts` is that ladder (`resolveHeatEndpoints`); it imports the four polarity constants directly and selects them with two inline ternaries keyed on the same `polarity` value, and does not import or call `defaultHeatEndpoints`. The only callers of `defaultHeatEndpoints` are in `tests/execution-status-render-color.test.ts`, in a case titled "polarity constants are internally consistent". Both selection paths have existed side by side since D5 landed (e4c4f5d5); the ladder never called the helper.

## Evidence

Way A — `src/extension/execution-status/render/polarity.ts:60-71` (in scope):
```ts
/** The base/hot endpoint pair a heat LUT is built from. */
export interface HeatEndpoints {
  readonly base: Rgb;
  readonly hot: Rgb;
}

/** Select the constant endpoint pair for a polarity (the ladder's last rung). */
export function defaultHeatEndpoints(polarity: BackgroundPolarity): HeatEndpoints {
  return polarity === "dark"
    ? { base: DARK_POLARITY_BASE, hot: DARK_POLARITY_HOT }
    : { base: LIGHT_POLARITY_BASE, hot: LIGHT_POLARITY_HOT };
}
```

Way B — `src/extension/execution-status/render/endpoint-ladder.ts:40-55` (in scope; the ladder the docstring above names):
```ts
export function resolveHeatEndpoints(inputs: EndpointLadderInputs): HeatEndpoints {
  const polarity: BackgroundPolarity =
    inputs.terminalBg !== undefined
      ? // The strongest witness: classify the REAL background directly.
        isLightBackground(inputs.terminalBg)
        ? "light"
        : "dark"
      : inputs.themeTextFg !== undefined
        ? polarityFromTextFg(inputs.themeTextFg)
        : "dark";
  const base =
    inputs.terminalBg ?? (polarity === "dark" ? DARK_POLARITY_BASE : LIGHT_POLARITY_BASE);
  const hot =
    inputs.themeAccentFg ?? (polarity === "dark" ? DARK_POLARITY_HOT : LIGHT_POLARITY_HOT);
  return { base, hot };
}
```
Its import list — `src/extension/execution-status/render/endpoint-ladder.ts:11-20`:
```ts
import {
  DARK_POLARITY_BASE,
  DARK_POLARITY_HOT,
  LIGHT_POLARITY_BASE,
  LIGHT_POLARITY_HOT,
  isLightBackground,
  polarityFromTextFg,
  type BackgroundPolarity,
  type HeatEndpoints,
} from "./polarity";
```

Caller census for Way A — command: `grep -rn "defaultHeatEndpoints" src/ tests/ tools/ --include=*.ts --include=*.mjs` — 4 hits (all pasted):
```
src/extension/execution-status/render/polarity.ts:67:export function defaultHeatEndpoints(polarity: BackgroundPolarity): HeatEndpoints {
tests/execution-status-render-color.test.ts:34:  defaultHeatEndpoints,
tests/execution-status-render-color.test.ts:300:    expect(defaultHeatEndpoints("dark")).toEqual({
tests/execution-status-render-color.test.ts:304:    expect(defaultHeatEndpoints("light")).toEqual({
```
Production callers: 0. Test callers: 1 file, 2 calls.

Consumer census for the constants (who selects them) — command: `grep -rn "DARK_POLARITY_BASE\|LIGHT_POLARITY_BASE\|DARK_POLARITY_HOT\|LIGHT_POLARITY_HOT" src/ --include=*.ts` — 12 hits (first 10 pasted, total 12):
```
src/extension/execution-status/render/endpoint-ladder.ts:12:  DARK_POLARITY_BASE,
src/extension/execution-status/render/endpoint-ladder.ts:13:  DARK_POLARITY_HOT,
src/extension/execution-status/render/endpoint-ladder.ts:14:  LIGHT_POLARITY_BASE,
src/extension/execution-status/render/endpoint-ladder.ts:15:  LIGHT_POLARITY_HOT,
src/extension/execution-status/render/endpoint-ladder.ts:51:    inputs.terminalBg ?? (polarity === "dark" ? DARK_POLARITY_BASE : LIGHT_POLARITY_BASE);
src/extension/execution-status/render/endpoint-ladder.ts:53:    inputs.themeAccentFg ?? (polarity === "dark" ? DARK_POLARITY_HOT : LIGHT_POLARITY_HOT);
src/extension/execution-status/render/polarity.ts:50:export const DARK_POLARITY_BASE: Rgb = Object.freeze({ r: 0x1e, g: 0x1e, b: 0x1e });
src/extension/execution-status/render/polarity.ts:53:export const DARK_POLARITY_HOT: Rgb = Object.freeze({ r: 0xb0, g: 0x4a, b: 0x00 });
src/extension/execution-status/render/polarity.ts:55:export const LIGHT_POLARITY_BASE: Rgb = Object.freeze({ r: 0xff, g: 0xff, b: 0xff });
src/extension/execution-status/render/polarity.ts:58:export const LIGHT_POLARITY_HOT: Rgb = Object.freeze({ r: 0xff, g: 0xb3, b: 0x80 });
```
(remaining 2: `polarity.ts:69` and `polarity.ts:70`, the two arms of `defaultHeatEndpoints`.) Exactly two selection sites exist: the helper's body and the ladder's ternaries.

The test that pins Way A as the production rung — `tests/execution-status-render-color.test.ts:298-307`:
```ts
  it("polarity constants are internally consistent", () => {
    expect(defaultHeatEndpoints("dark")).toEqual({
      base: DARK_POLARITY_BASE,
      hot: DARK_POLARITY_HOT,
    });
    expect(defaultHeatEndpoints("light")).toEqual({
      base: LIGHT_POLARITY_BASE,
      hot: LIGHT_POLARITY_HOT,
    });
```

History — `git log --oneline -S"defaultHeatEndpoints" -- src/ tests/` → 1 commit, `0ac5ec05 feat(rfc-0015): D4 pure render substrate — v0.488.4` (the helper and its test were born together, before the ladder). `git show e4c4f5d5:src/extension/execution-status/render/endpoint-ladder.ts | grep -n "defaultHeatEndpoints\|POLARITY_BASE\|POLARITY_HOT"` → 6 hits, all constant imports/ternaries (`:12-15`, `:59`, `:61`), 0 for `defaultHeatEndpoints` — the ladder never called the helper from its first commit (D5). No written rule names which mechanism the ladder must use.

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited below.

## Why this is a problem
The polarity module states, in the helper's own docstring, that `defaultHeatEndpoints` IS the ladder's last rung, and the test file pins that helper under the title "polarity constants are internally consistent"; the ladder that actually runs in production (`resolveHeatEndpoints`, the only production path — heat-lut-cache.ts:39) selects the constants by a second mechanism that shares no code with the helper. The concrete misread this invites: a maintainer who retunes the last rung by editing `defaultHeatEndpoints` (for instance, deriving the light-polarity hot endpoint differently) sees the pinned test move and reads production as changed while the LUT is still built from the inline ternaries; conversely, a maintainer editing the ladder's ternaries leaves the helper and its "internally consistent" test green, so the test no longer witnesses the rung it is named for. Two encodings of one two-row table, one of them reachable only from tests, is the divergence; the docstring and test title that route a reader to the wrong one is the cost.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the ladder's two ternaries are `defaultHeatEndpoints(polarity)` destructured — `const defaults = defaultHeatEndpoints(polarity); base = inputs.terminalBg ?? defaults.base; hot = inputs.themeAccentFg ?? defaults.hot` — which would make the helper the single last rung its docstring claims; alternatively the helper could be dropped in favour of the ladder with its test re-aimed at `resolveHeatEndpoints({})`. Either way one selection site should remain.

## False-positive check
- Clone-map check: the injected clone map lists no group for `render/polarity.ts` or `render/endpoint-ladder.ts` ("no clone groups" for both); the two bodies are not token copies (one returns a pair object, the other selects per-endpoint behind `??` fallbacks).
- D9-affinity check: not a wrong-home claim — both mechanisms sit in the render sub-module; the finding is that the ladder re-encodes a selection its sibling exports, not that either function lives in the wrong file.
- D2-deadness check: both sides live — `resolveHeatEndpoints` is called from `heat-lut-cache.ts:39` (production); `defaultHeatEndpoints` has 2 test calls (`tests/execution-status-render-color.test.ts:300`, `:304`), and per the brief a test-only caller set is NOT dead, so this is not a D2 filing.
- Prior-filing check: resolved PTQ-1241 (endpoint-ladder `baseSource`/`polarity` return fields unread) was opened and read; its fix scope was the two dead return fields of `resolveHeatEndpoints`, not its constant-selection mechanism, and its text does not mention `defaultHeatEndpoints`. `grep -rln "defaultHeatEndpoints" quality/` → hits only under `quality/bench/` (benchmark reports) — no issue, resolved, or intake file.
- Export-style exemption: not invoked — this is a divergent-solutions filing, not a wide-surface one; the export of `defaultHeatEndpoints` is not itself the claim.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.
- Routing note: resolved precedents PTQ-1236/PTQ-1428 file "production site re-derives what a sibling helper exports" under D8 `reimplemented`; this candidate is filed as D1 because the two selection sites are peers of one RFC (D4 and D5 increments, two commits apart) rather than a canonical facility and a stray re-derivation, and because the cost is the docstring/test routing a reader to the non-production encoding. If triage reads the shape as D8 `reimplemented`, the evidence above is lens-neutral.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both selection ways match their excerpts (polarity.ts:66-71 defaultHeatEndpoints, docstring "the ladder's last rung"; endpoint-ladder.ts:50-53 inline ternaries, imports at :11-20 leave the helper out). Both stated greps reproduce line for line (4 hits for defaultHeatEndpoints, 0 of them production; 12 constant hits). git -S gives only 0ac5ec05, and e4c4f5d5's ladder already used the ternaries (:59/:61). The clone-scan map lists no clone groups for either file, so this is not D4's. resolveHeatEndpoints is live (heat-lut-cache.ts:39) and the helper has test callers, so this is not D2's. No other intake file or PTQ tracks it (PTQ-1241 covered only the unread return fields). It is not symmetry-only: the docstring's claim about the production path is false today. But the cost is prospective: no drift commit or bug record exists, and both encodings currently select the same constants (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: the ladder's last rung IS defaultHeatEndpoints. In src/extension/execution-status/render/endpoint-ladder.ts resolveHeatEndpoints (:40-55): `const defaults = defaultHeatEndpoints(polarity);` then `const base = inputs.terminalBg ?? defaults.base; const hot = inputs.themeAccentFg ?? defaults.hot;` — dropping the four direct polarity-constant imports the two inline ternaries used. Behaviour identical (same constants, same selection). The "polarity constants are internally consistent" test now witnesses the rung production actually runs, and the helper's "the ladder's last rung" docstring becomes true.
