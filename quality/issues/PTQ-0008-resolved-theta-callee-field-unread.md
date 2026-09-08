---
id: PTQ-0008
title: ResolvedThetaCallee.callee is written `undefined` by every production constructor and read by nothing, while its doc claims the snapshot holds a strong reference to the parsed callee
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/callable-set.ts:95-96
  - src/parser/callable-set.ts:65-69
  - src/parser/callable-set.ts:113-118
  - src/extension/production-composition.ts:2231-2239
  - src/extension/production-composition.ts:3031-3040
  - src/extension/production-theta-producer.ts:4681-4686
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ResolvedThetaCallee.callee is written `undefined` by every production constructor and read by nothing, while its doc claims the snapshot holds a strong reference to the parsed callee

## Observation

`ResolvedThetaCallee` (the `.theta` entry shape in the frozen `tools:` callable
snapshot) declares a `callee: unknown` field documented as a "strong reference
to the parsed callee + lowered tool spec". Both production constructors of
this shape write `callee: undefined`, and no code in `src/`, `extensions/`,
`tools/`, or `tests/` ever reads the field. The shipped pipeline instead
carries the entry's `calleePath` and re-parses the callee asynchronously at
spawn time, which a comment in `production-theta-producer.ts` states
explicitly. The sibling field `toolDefinition` on `ResolvedPiTool` is, by
contrast, read at six production sites, so the "held reference" design is live
only for the Pi-tool arm.

## Evidence

src/parser/callable-set.ts:95-96 — the field and its claim:

```ts
  /** Strong reference to the parsed callee + lowered tool spec (opaque here). */
  readonly callee: unknown;
```

src/parser/callable-set.ts:65-69 — the type-level doc repeats the claim:

```ts
/**
 * A `.theta` callee resolved against the per-load-pass parse cache — the
 * resolution snapshot holds a strong reference to the parsed callee plus its
 * lowered tool spec. `mode` gates the `theta/load/prompt-mode-callable` check.
 */
```

src/parser/callable-set.ts:113-118 — the snapshot doc says dispatch goes
through held references:

```ts
/**
 * The frozen per-theta resolution snapshot: a `{ post-rename name → resolved
 * callable }` table (frontmatter-fields-b-and-templates.md §Resolution
 * snapshot). Frozen so no ambient inheritance or post-load mutation can widen
 * the callable set; subsequent calls dispatch through the held references.
 */
```

src/extension/production-composition.ts:2231-2239 — production constructor 1
writes `undefined`:

```ts
      return {
        kind: "theta",
        mode: callee.mode,
        callee: undefined,
        calleePath: thetaPath,
        ...(callee.onDiskName !== undefined ? { onDiskName: callee.onDiskName } : {}),
      };
```

src/extension/production-composition.ts:3031-3040 — production constructor 2
writes `undefined`:

```ts
      const onDiskName = onDiskNames.get(thetaPath);
      return {
        kind: "theta",
        mode: declaredMode.get(thetaPath) ?? "subagent",
        callee: undefined,
        calleePath: thetaPath,
        ...(onDiskName !== undefined ? { onDiskName } : {}),
      };
```

src/extension/production-theta-producer.ts:4681-4686 — the consumer-side doc
states the field is never populated and the callee is re-resolved at spawn:

```ts
 * carry their real path). Mirrors `callableSetPiToolNames`; the callee schema /
 * param order / description are resolved asynchronously at spawn time via
 * `parseCallee` (production freezes each entry with `callee: undefined`, so the
 * parsed callee itself is not held on the snapshot). A theta with no snapshot
 * yields `[]`.
```

Reader search: `grep -rn "\.callee\b" src tests extensions tools` filtered of
`CallExpr.callee` / `calleePath` / fixture-local `input.callee` yields zero
reads of a snapshot entry's `callee`. Destructuring search (`{ callee }` /
`callee }`) matches only `invoke-diagnostics.ts` locals unrelated to this type.
Dynamic-access search (`["callee"]`, `['callee']`) — 0 hits. The one production
touch besides the constructors is `{ ...resolved, calleePath: spec }`
(src/parser/callable-set.ts:487), a spread copy, not a read.

## Why this is a problem

Dead code / vestigial field: a field every production writer sets to
`undefined` and no reader consumes is proven unread (searches above cover
src/, extensions/, tools/, and tests/, including string-keyed access and
destructuring). Tests construct the field with a dummy value
(tests/callable-set.test.ts:46, `callee: { mode }`) but never read it back, so
even under this repository's tests-are-legitimate-callers rule the field has
zero readers anywhere. The three doc comments (field, type, snapshot) describe
a held-parsed-callee design the shipped pipeline does not use — the confession
at production-theta-producer.ts:4683-4684 names the actual mechanism
(`calleePath` + spawn-time `parseCallee`) — so the field is a remnant of a
superseded design that now only misleads a reader about what the frozen
snapshot holds.

## Suggested direction (non-binding, optional)

Drop the `callee` field from `ResolvedThetaCallee` (and the dummy values at
its constructors and test helper), and let the field/type/snapshot doc
comments describe the `calleePath`-plus-spawn-time-parse mechanism that
actually ships.

## False-positive check

- Reference searches: `\.callee\b` across src/, tests/, extensions/, tools/
  (all hits are `CallExpr.callee`, `calleePath`, or fixture-local shapes);
  destructuring patterns `{ callee }` / `callee }` (only invoke-diagnostics
  locals); dynamic access `["callee"]` / `['callee']` (0 hits).
- Constructor census: production-composition.ts:2235 and :3035 both write
  `callee: undefined`; callable-set.ts's own `resolveEntry` failure arms
  (:431, :440, :473) write `undefined`; the only non-undefined writer is the
  test helper tests/callable-set.test.ts:46, and no test reads it back.
- Tests-only-caller rule: the field is not merely test-only-reachable — it is
  read by nothing, tests included, so the carve-out does not apply.
- Git history intent: bug-0379/0320/0253 commits reworked this module around
  `calleePath` / basename matching; the current design's own comment
  (production-theta-producer.ts:4683-4684) states the parsed callee is not
  held on the snapshot.

## Triage
verdict: confirmed — reproduced independently: all 5 production writers set `callee: undefined` (composition 2243/3053, callable-set 431/440/473) and zero readers exist (every `X.callee` receiver in src+tests is an AST `CallExpr` or an unrelated type; no dynamic/destructured/`keyof` access, no barrel or package-exports re-export), while three doc comments still assert a held parsed-callee the producer comment confesses is not held. (triage: claude-opus-5)

