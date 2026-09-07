---
id: pending
title: toInterpolationType's discriminated-union and opaque-object arms are unreachable from every call site, and the opaque-object arm's comment describes a data flow that does not exist
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/system-interpolation.ts:527-534
  - src/parser/system-interpolation.ts:462-474
  - src/parser/system-interpolation.ts:477-485
  - src/extension/import-static-checks.ts:1597-1599
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# toInterpolationType's discriminated-union and opaque-object arms are unreachable from every call site, and the opaque-object arm's comment describes a data flow that does not exist

## Observation
`toInterpolationType` switches over all nine `SystemParamType` kinds. Two of
those arms — `discriminated-union` and `opaque-object` — cannot be entered from
any of the function's three call sites. The two in-module call sites sit after
`parseInterpolationPath`'s terminal returns for exactly those two kinds, which
build the `{ kind: "object" }` `InterpolationType` inline instead of calling
this function. The one out-of-module call site is guarded to
`shape.kind === "object"`. The `opaque-object` arm carries a comment explaining
why its result is harmless — "`renderSystemPrompt` overrides this with the
resolved value's own runtime kind" — which presupposes the arm's return value
reaching a template part; it never does, because the arm is not entered.

## Evidence
src/parser/system-interpolation.ts:527-534 — the two arms:

```ts
    case "discriminated-union":
      return { kind: "object" };
    case "opaque-object":
      // Fallback only — an `opaque-object` terminal is always paired with
      // `valueDriven: true` (parseInterpolationPath's terminal `return`), so
      // `renderSystemPrompt` overrides this with the resolved value's own
      // runtime kind before it reaches `stringifyInterpolatedValue`.
      return { kind: "object" };
```

src/parser/system-interpolation.ts:462-474 — `parseInterpolationPath`'s two
terminal returns for those kinds, both of which write `type: { kind: "object" }`
directly and return before either `toInterpolationType` call below them:

```ts
  if (current.kind === "discriminated-union" && current.arms !== undefined) {
    return {
      kind: "path",
      segments,
      type: { kind: "object" },
      valueDriven: true,
      unionArms: current.arms,
    };
  }
  if (current.kind === "opaque-object" || current.kind === "discriminated-union") {
    return { kind: "path", segments, type: { kind: "object" }, valueDriven: true };
  }
```

src/parser/system-interpolation.ts:477-485 — the two in-module call sites, both
below those returns:

```ts
  if (current.kind === "array" && current.elementArms !== undefined) {
    return {
      kind: "path",
      segments,
      type: toInterpolationType(current),
      elementArms: current.elementArms,
    };
  }
  return { kind: "path", segments, type: toInterpolationType(current) };
```

src/extension/import-static-checks.ts:1597-1599 — the third call site's guard,
which `continue`s on every non-`object` shape before the `toInterpolationType`
call at :1631:

```ts
      if (shape.kind !== "object") {
        continue;
      }
```

## Why this is a problem
Two switch arms exist for input classes no caller can present, and one of them
carries a rationale asserting a route through `renderSystemPrompt` that the
current control flow forecloses. The `{ kind: "object" }` value the arms produce
is also written verbatim, twice, at the two `parseInterpolationPath` returns
that pre-empt them, so the arms are a second copy of a decision already taken
one level up. A reader auditing how a `discriminated-union` terminal renders is
pointed at an arm that is never consulted, and the `opaque-object` comment
supplies a false trace to follow. `docs/bugs/0408-scalar-union-params-render-json-row.md:25`
cites `toInterpolationType`'s union mapping as the live route it was at the
time, which the later `valueDriven` terminal returns displaced.

## Suggested direction (non-binding, optional)
Whatever shape the two arms end up with, the `opaque-object` comment's stated
route (through `renderSystemPrompt`) is the part that is checkably wrong and
should not survive unchanged; the exhaustiveness obligation on the exported
signature's parameter type is a separate question from what the comment claims.

## False-positive check
- `grep -rn "toInterpolationType" .` (excluding `node_modules`, `.git`, `dist`)
  — three call sites in shipped code: `src/parser/system-interpolation.ts:481`,
  `:485`, and `src/extension/import-static-checks.ts:1631`; plus the definition
  at `:501`, the `import` at `import-static-checks.ts:98`, and comment-only
  mentions in `tests/b0408-scalar-union-params-render-json-row.test.ts:13` and
  in `docs/bugs/`. No test calls it directly, so this is not a
  test-only-reachability question.
- Reachability of `:481` / `:485`: both sit after the `opaque-object` /
  `discriminated-union` returns at `:462-474` in the same straight-line
  function, so `current.kind` is neither of those two at either call.
- Reachability of `import-static-checks.ts:1631`: the enclosing loop body
  `continue`s at `:1597-1599` for every `shape.kind !== "object"`, and `shape`
  is not reassigned between that guard and `:1631`.
- Re-export search: `grep -rn "system-interpolation" src/ extensions/ tools/` —
  the only importer of this symbol is `import-static-checks.ts`; no barrel
  re-exports it.
- String-keyed / dynamic access: `grep -rn "\[.toInterpolationType.\]"` — no hits.

## Triage
