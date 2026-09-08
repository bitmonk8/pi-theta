---
id: pending
title: resolveSubagentSessionConfigAt is a same-signature wrapper whose body forwards its two parameters unchanged to resolveSubagentSessionConfig
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1486-1500
  - src/parser/theta-document.ts:1433-1436
  - src/extension/import-static-checks.ts:437
sites: 1
fix_scope: module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# resolveSubagentSessionConfigAt is a same-signature wrapper whose body forwards its two parameters unchanged to resolveSubagentSessionConfig

## Observation
`resolveSubagentSessionConfigAt` is exported from theta-document.ts. Its body is
a single `return` that forwards both parameters, in order, to the module-private
`resolveSubagentSessionConfig`. The two functions have identical parameter types
and identical return types; the only differences are the exported name and the
parameter spelling (`frontmatter` vs `callingFrontmatter`). The wrapper's own
doc comment closes with the statement that for an in-file `subagent fn` "this is
identical to the parse-time resolution".

## Evidence
src/parser/theta-document.ts:1486-1500 — the wrapper, doc and body:

```ts
/**
 * Re-resolve a `subagent fn`'s session config against a DIFFERENT enclosing
 * frontmatter than the one it was parsed under (RFC 0001 FN-9). A `.thetalib`
 * helper has no frontmatter of its own, so its `model` / `tools` /
 * `tool_loop` / `respond_repair` inheritance resolves against the CALLING
 * theta's frontmatter at dispatch time; its `with { … }` overrides still apply
 * on top. For an in-file `subagent fn` (parse-time frontmatter already the
 * enclosing theta's) this is identical to the parse-time resolution.
 */
export function resolveSubagentSessionConfigAt(
  fn: FnDecl,
  callingFrontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
  return resolveSubagentSessionConfig(fn, callingFrontmatter);
}
```

src/parser/theta-document.ts:1433-1436 — the wrapped function's signature, which
matches parameter-for-parameter:

```ts
function resolveSubagentSessionConfig(
  fn: FnDecl,
  frontmatter: ParsedFrontmatter | null,
): SubagentSessionConfig {
```

src/extension/import-static-checks.ts:437 — the sole production caller of the
wrapper, which passes exactly the two forwarded arguments:

```ts
              sessionConfig: resolveSubagentSessionConfigAt(stmt, callingFrontmatter),
```

## Why this is a problem
A pass-through wrapper that adds no behaviour: no argument transformation, no
default, no narrowing, no ordering change, no additional work before or after
the call. It exists only to make the module-private function reachable under a
second name, so every reader of the FN-9 call site has one extra hop to walk
before reaching the code that actually resolves the config, and the two doc
blocks (1423-1432 and 1486-1494) restate overlapping halves of the same
inheritance rule at two places that must now be kept in step.

## Suggested direction (non-binding, optional)
One name for one behaviour — either export `resolveSubagentSessionConfig`
directly and have the FN-9 call site use it, or keep the FN-9 spelling as the
single exported entry and let the parse-time site call it.

## False-positive check
- Identifier search across production and tests: `grep -rn
  "resolveSubagentSessionConfigAt" src extensions tools tests --include=*.ts` →
  the definition (theta-document.ts:1495), one prose mention (1431), one
  production import + call (import-static-checks.ts:82, :437), and three test
  references (tests/subagent-fn.test.ts:8, :1309, :1331). Test callers do not
  make it dead and this finding does not claim it is dead — the claim is that
  its body adds nothing.
- Callers of the wrapped function: `grep -n "resolveSubagentSessionConfig(" 
  src/parser/theta-document.ts` → 1433 (definition), 1418 (inside
  `attachSubagentSessionConfigs`), 1499 (inside the wrapper). No other caller.
- String-keyed / dynamic access: `grep -rn "\"resolveSubagentSessionConfigAt\""
  src extensions tools tests --include=*.ts` → no hits.
- Re-exports: src/parser has no barrel file (`ls src/parser` lists leaf modules
  only), so the export reaches consumers only through the direct import above.
- Verified the bodies are not divergent: `resolveSubagentSessionConfig`
  (1433-1484) reads only its two parameters, and the wrapper passes both
  through in the same order with no pre- or post-processing.

## Triage

verdict: questionable — wrapper reproduces verbatim at :1486-1500 as a pure two-arg forward to :1433 (identical param/return types, sole production caller import-static-checks.ts:437, no barrel/re-export/dynamic access), but it is live not dead and the anchor is simplicity taste: `...At` is the deliberately documented FN-9 dispatch-time seam the tests bind to (subagent-fn.test.ts:1289 "the offline seam for the FN-9 obligation") and collapsing it merges two distinct RFC doc blocks, so a human should rule (triage: claude-opus-5)
