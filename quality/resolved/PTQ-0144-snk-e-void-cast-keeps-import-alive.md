---
id: PTQ-0144
title: err-note-render's SNK-e arm carries a `void (leaf as ContextOverflowError)` statement whose only effect is keeping the otherwise-unreferenced ContextOverflowError import alive
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/err-note-render.ts:149-153
  - src/runtime/err-note-render.ts:35-45
  - src/runtime/err-note-render.ts:154-157
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# err-note-render's SNK-e arm carries a `void (leaf as ContextOverflowError)` statement whose only effect is keeping the otherwise-unreferenced ContextOverflowError import alive

## Observation
`renderLeafKindNote` casts the leaf error to its per-variant interface in every
arm that reads a field off it (`e.attempts`, `e.message`, `e.tool_name`,
`e.rounds`, …). The `context_overflow` arm (SNK-e) renders a fixed string with
no interpolation, so it has no field to read; it nonetheless performs the cast
and discards it with `void`. `ContextOverflowError` is referenced in exactly two
places in the file — the type-import list and that `void` expression — so the
statement is the sole consumer of the import. The neighbouring `cancelled` arm
(SNK-f) also renders a fixed string and carries no such cast.

## Evidence
src/runtime/err-note-render.ts:149-153 — the arm; the returned template
interpolates only `prefix`:

```ts
    case "context_overflow": {
      // SNK-e
      void (leaf as ContextOverflowError);
      return `${prefix} returned Err: context overflow`;
    }
```

src/runtime/err-note-render.ts:154-157 — the sibling fixed-string arm, with no
cast and no `void`:

```ts
    case "cancelled": {
      // SNK-f
      return `${prefix} cancelled`;
    }
```

src/runtime/err-note-render.ts:35-45 — the import list carrying
`ContextOverflowError`:

```ts
import type {
  CodeToolError,
  ContextOverflowError,
  InvokeCalleeError,
  InvokeInfraError,
  ModelToolError,
  QueryError,
  ToolLoopExhaustedError,
  TransportError,
  ValidationError,
} from "./query-error";
```

`grep -n "ContextOverflowError" src/runtime/err-note-render.ts` → exactly two
hits: `:37` (the import) and `:151` (the `void` expression). Every other
imported variant type is read by a real field access: `ValidationError` :129,
`TransportError` :141, `ModelToolError` :146, `CodeToolError` :160,
`ToolLoopExhaustedError` :175, `InvokeInfraError` :180, `InvokeCalleeError`
:229 (`isInvokeCalleeError`'s narrowing), `QueryError` throughout.

The registry row the arm implements carries no placeholder, so there is no
field for the arm to read: `docs/spec_topics/slash-invocation.md:43` —
`| **SNK-e.** | context_overflow | "theta /<name> returned Err: context
overflow" |`.

## Why this is a problem
Leftover scaffolding: a statement with no effect on the produced value, kept
alive only so an unused import does not trip the compiler's unused-symbol
check. It reads as if the arm depends on the `ContextOverflowError` shape when
the template it returns is a constant; the SNK-f arm three lines below shows the
form a payload-free row otherwise takes in this same function. Nothing outside
the file observes it: the expression is discarded by `void`, and `grep -rn
"ContextOverflowError" --include=*.ts src/ tests/` shows the other consumers
import it directly from `./query-error`, not through this module.

## Suggested direction (non-binding, optional)
Let the payload-free arm look like its SNK-f neighbour and let the import list
follow whatever the arms actually read.

## False-positive check
- Reference searches for the import: `grep -n "ContextOverflowError"
  src/runtime/err-note-render.ts` → :37, :151 only. `grep -rn
  "ContextOverflowError" --include=*.ts src/ tests/ extensions/ tools/` → the
  declaration in `src/runtime/query-error.ts`, direct importers in other
  modules, and these two lines; no re-export of it through err-note-render.ts
  (`grep -n "export .*ContextOverflow" src/runtime/err-note-render.ts` → no
  hits).
- Dynamic-access check: the discarded value is not stored, returned, or keyed;
  `grep -n "void (" src/runtime/err-note-render.ts` → :151 is the only `void`
  expression in the file.
- Not a test-only-reachability case: the arm itself is live
  (`renderLeafKindNote` is called by `renderTopLevelErrNote` :206, which
  production calls at src/extension/production-theta-producer.ts:1707). The
  finding is about the discarded statement inside the live arm, not the arm.
- Spec check: read the SNK-e registry row (slash-invocation.md:43) to confirm
  the template has no placeholder, so no field read was dropped by mistake.
- Duplicate check: `grep -rn "err-note-render" quality/intake/` → only
  qw20260907183353-d2-01-runtime-seams-stub-narration-stale, which cites :25-30,
  :119 and :196-197 (stub narration) — different lines, different root cause.

## Triage
verdict: confirmed — reproduced: :151 `void (leaf as ContextOverflowError)` is an erased-cast no-op in a live arm (producer:1707 → :206) and the sole consumer of the :37 import (grep in-file = :37/:151 only, no re-export, no dynamic use; other modules import from ./query-error), SNK-e row has no placeholder, sibling SNK-f arm needs no cast; the "unused-symbol check" motive is unsupported (tsconfig has no noUnusedLocals, eslint enables only the three theta-local rules) and the cast is no type witness either since QueryError already includes the variant — both only strengthen the no-op claim; distinct from the ClassifiedOverflow and stub-narration candidates (triage: claude-opus-5)
