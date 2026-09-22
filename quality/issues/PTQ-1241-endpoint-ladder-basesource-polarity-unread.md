---
id: PTQ-1241
title: resolveHeatEndpoints computes baseSource and polarity fields that no caller reads
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/execution-status/render/endpoint-ladder.ts:33-37
  - src/extension/execution-status/render/endpoint-ladder.ts:48-68
  - src/extension/execution-status/run-card-renderer.ts:298-309
sites: 1
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# resolveHeatEndpoints computes baseSource and polarity fields that no caller reads

## Observation
`resolveHeatEndpoints` returns a `ResolvedEndpoints` object with four fields:
`base`, `hot` (from `HeatEndpoints`), plus `baseSource: BaseSource` and
`polarity: BackgroundPolarity`, both computed on every call. The sole
production call site, `ensureLut` in `run-card-renderer.ts`, destructures only
`endpoints.base` and `endpoints.hot` to build the LUT cache key and to build
the heat LUT; it never reads `endpoints.baseSource` or `endpoints.polarity`.

## Evidence
`src/extension/execution-status/render/endpoint-ladder.ts:33-37`:
```ts
/** Which ladder rung supplied the BASE (recorded for tests / diagnostics). */
export type BaseSource = "osc11" | "polarity";

export interface ResolvedEndpoints extends HeatEndpoints {
  readonly baseSource: BaseSource;
  readonly polarity: BackgroundPolarity;
}
```

`src/extension/execution-status/render/endpoint-ladder.ts:48-68` (the function
body computing and returning both fields):
```ts
export function resolveHeatEndpoints(inputs: EndpointLadderInputs): ResolvedEndpoints {
  const polarity: BackgroundPolarity =
    inputs.terminalBg !== undefined
      ? isLightBackground(inputs.terminalBg)
        ? "light"
        : "dark"
      : inputs.themeTextFg !== undefined
        ? polarityFromTextFg(inputs.themeTextFg)
        : "dark";
  const base = ...
  const hot = ...
  return {
    base,
    hot,
    baseSource: inputs.terminalBg !== undefined ? "osc11" : "polarity",
    polarity,
  };
}
```

`src/extension/execution-status/run-card-renderer.ts:298-309` (the only
production call site, destructuring only `base`/`hot`):
```ts
    const endpoints = resolveHeatEndpoints({
      ...(terminalBg !== undefined ? { terminalBg } : {}),
      ...(((): { themeTextFg?: Rgb } => { ... })()),
      ...(((): { themeAccentFg?: Rgb } => { ... })()),
    });
    const key = `${colorMode}|${endpoints.base.r},${endpoints.base.g},${endpoints.base.b}|${endpoints.hot.r},${endpoints.hot.g},${endpoints.hot.b}`;
    if (lut === undefined || lutKey !== key) {
      lut = buildHeatLut(endpoints.base, endpoints.hot, colorMode);
      lutKey = key;
    }
```

Searches run and their hit counts:
- `grep -rn "baseSource" --include=*.ts` (repo-wide, excluding node_modules):
  2 hits, both in `endpoint-ladder.ts` itself (the type alias declaration and
  the return-site assignment) — zero readers anywhere.
- `grep -rn "\.polarity\b" --include=*.ts` (repo-wide): 0 hits outside the
  declaration/assignment inside `endpoint-ladder.ts`.
- `grep -rln "endpoint-ladder\|resolveHeatEndpoints" tests/`: 0 matches — no
  test file imports this module or the function at all.
- `grep -rn "ResolvedEndpoints\|EndpointLadderInputs\|resolveHeatEndpoints" --include=*.ts` repo-wide: 5 hits total — the 3 declaration sites in
  `endpoint-ladder.ts` and the 2 usage sites (import + call) in
  `run-card-renderer.ts`, confirming there is exactly one call site and it is
  covered above.

## Why this is a problem
`baseSource` and `polarity` are non-trivial derived values (a branch over
`terminalBg`/`themeTextFg` for `polarity`, and a further branch for
`baseSource`) computed on every LUT-cache-key rebuild, with no reader in
production code and no witness test exercising them at all — this is not the
MUST-NOT-witness-test shape (there is no test present), it is two fields with
zero consumers of any kind. The header comment on `BaseSource`
("recorded for tests / diagnostics") states an intended purpose that the
current tree does not fulfill: no test and no diagnostic reads either field.

## Suggested direction (non-binding, optional)
Confirm whether a planned diagnostics/test consumer was dropped during a prior
change; if the fields have no forthcoming reader, the fields (and the
`BaseSource` type) can be dropped from the return shape without touching the
`base`/`hot` computation callers depend on.

## False-positive check
- Searched `baseSource` across the repo (excluding node_modules): only the
  type declaration and the assignment inside `endpoint-ladder.ts` itself.
- Searched `.polarity` across the repo: only the declaration/assignment inside
  the same file.
- Searched for any test file referencing `endpoint-ladder` or
  `resolveHeatEndpoints` by name: none found, so this is not a
  test-only-reachable case (which would not be filed) — there is no reachable
  caller of either field at all, production or test.
- Confirmed the sole production caller (`run-card-renderer.ts:298`)
  destructures only `endpoints.base` / `endpoints.hot`, never `.baseSource`
  or `.polarity`, by reading the surrounding 15 lines.

## Triage
verdict: confirmed — excerpts match at endpoint-ladder.ts:33-37/48-68 and run-card-renderer.ts:298-312; re-ran the hunt: `baseSource`/`BaseSource`/`"osc11"` hit only the 3 declaration/assignment lines inside endpoint-ladder.ts, `.polarity` as a returned field has no reader anywhere in src/tests/tools/extensions/docs, resolveHeatEndpoints has exactly one importer+call (run-card-renderer.ts:66/:298) which reads only `.base`/`.hot` (lines 309, 311) and never spreads or forwards the `endpoints` object, no test imports the module (so not the test-only-caller carve-out), single-commit history (e4c4f5d5) shows the "recorded for tests / diagnostics" consumer never landed; the local `polarity` stays live as the base/hot intermediate — only the two return fields and the BaseSource type are dead; no existing PTQ or exemption covers the host (triage: claude-fable-5-1)
