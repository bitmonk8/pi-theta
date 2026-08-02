# Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` fire for `invoke("./x.theta", …)` but never for the `.theta`-callable call form the spec says they "apply equally" to: `twoparam("a")`, `twoparam()` and `twoparam("a","b","c")` all load clean

- **Status:** open.
- **Kind:** defect — `tool-calls.md` §"Argument shape" binds the `.theta`-callable
  call site to invocation.md's arity rules by name, and the compose pass that
  implements those rules walks `invoke(...)` expressions only.
- **Related:**
  - 0050 (`theta/parse/fn-arg-type-mismatch` unreachable) — same class (a
    registered arity/type check that no production input reaches), different
    emitter; there the emitter has no caller at all, here the emitter is live
    but its caller walks one of the two call surfaces the spec names.
  - 0016 — the lexical call-site walk that already visits every `<name>(args)`
    site (`checkLexicalCallSites`, `src/parser/theta-document.ts:5146`) and is
    the natural host for the missing check.
- **Affected:**
  - `src/extension/invoke-static-checks.ts:293–306` (the INV-3 arity block: it
    runs inside the walk over `invoke` sites and is reached only from there),
  - `src/parser/invoke-diagnostics.ts:66–69, 331` (`checkInvokeArity`, the
    live emitter of both codes),
  - `src/extension/production-composition.ts:118` (the sole wiring of the
    invoke static-check pass),
  - `src/parser/theta-document.ts:5146` (`checkLexicalCallSites` — the walk that
    does visit `.theta`-callable call sites and emits nothing about arity).
- **Observed at:** `0.52.0` (`d06daae3`), Windows. Offline, through the shipped
  production load path (`discoverAndComposeFixtures`).

## Summary

`tools-calls.md` makes the two call surfaces onto a `.theta` callee equivalent
for arity: "Argument arity is checked under the same rules as `invoke(...)` — see
[Invocation — Argument arity] for the parse-time vs runtime split
(`theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-too-many` apply
equally to a `.theta` callable call)."

The implementation checks arity in the invoke static-check compose pass, whose
walk is over `invoke(...)` expressions. A `.theta`-callable call
(`twoparam(...)` after listing `./twoparam.theta` in `tools:`) is an ordinary
call node and is never visited. Both codes are therefore unreachable through the
`tools:` surface: too-few, too-many, and zero-argument calls at the same callee
all load with zero diagnostics.

## Reproduction

Offline, against the shipped composition root
(`tests/production-tools-load-resolution.test.ts` harness). One callee, two
required params:

`twoparam.theta`:

```theta
---
mode: subagent
params:
  x: string
  y: string
---
@`hi`
```

Six callers, all pointing at that one callee:

| Caller | Body | Registered? | Diagnostic |
|---|---|---|---|
| `invtoomany` | `invoke("./twoparam.theta", "a", "b", "c")?` | **no** | `theta/parse/invoke-arity-too-many: invoke './twoparam.theta' passes too many arguments: expected at most 2, got 3` |
| `invtoofew` | `invoke("./twoparam.theta", "a")?` | **no** | `theta/parse/invoke-arity-too-few: invoke './twoparam.theta' passes too few arguments: expected 2 non-defaulted, got 1` |
| `callabletoomany` | `twoparam("a", "b", "c")?` | **yes** | none |
| `callabletoofew` | `twoparam("a")?` | **yes** | none |
| `callablezero` | `twoparam()?` | **yes** | none |
| `ctlinvoke` / `ctlcallable` (controls, 2 args) | — | yes / yes | none |

The `.theta`-callable callers carry `tools:\n  - ./twoparam.theta` in
frontmatter; the `invoke` callers carry no `tools:`. Verbatim run output:

```
REGISTERED: ["callabletoofew","callabletoomany","callablezero",
             "ctlcallable","ctlinvoke"]
NOTIFICATIONS: ["invoke './twoparam.theta' passes too few arguments: expected 2 non-defaulted, got 1",
                "invoke './twoparam.theta' passes too many arguments: expected at most 2, got 3",
                "binder model unresolved: …"]
```

(The third notification is `twoparam.theta`'s own unrelated
`theta/load/binder-model-unresolved`; it does not affect the `tools:` resolution,
as the registered controls show.)

## Expected behaviour

- `docs/spec_topics/tool-calls.md` §"Argument shape": "Argument arity is checked
  under the same rules as `invoke(...)` — see [Invocation — Argument
  arity](./invocation.md#argument-binding) for the parse-time vs runtime split
  (`theta/parse/invoke-arity-too-few` / `theta/parse/invoke-arity-too-many` apply
  equally to a `.theta` callable call)." The sentence names both codes and both
  surfaces explicitly; it is not an inference.
- Same page, on the same callee kind: "`.theta` callables take their callee
  `params:` as already-typed values, positionally in declaration order — the same
  argument-binding rules `invoke(...)` uses".
- `docs/spec_topics/tool-calls.md` §"Relationship with `invoke`": "both apply the
  arity, return-type-compatibility, and path-restriction rules from
  [Invocation]". The path-restriction half of that sentence *is* implemented for
  `tools:` entries (`theta/load/invoke-path-escape`); the arity half is not.
- `docs/spec_topics/diagnostics/code-registry-parse.md` registers both codes
  against the arity rule with no carve-out for the call form.

## Actual behaviour / root cause

`checkInvokeArity` (`src/parser/invoke-diagnostics.ts:331`) is live and correct —
the `invoke` cells above are its output. Its only caller is the INV-3 block of
the invoke static-check compose pass:

```ts
// src/extension/invoke-static-checks.ts:292–306
// INV-3 (invocation.md §Argument arity): arity is checked against the
// statically-resolved callee's `params:` counts. …
const providedCount = Math.max(0, invoke.args.length - 1);
const arity = await deps.resolveCalleeArity(resolvedPath);
if (arity !== undefined) {
  diagnostics.push(...checkInvokeArity({ callee: invoke.path, staticallyResolvable: true, … }));
}
```

`invoke` is an element of the collected `invoke(...)` sites; the loop's subject
is the invoke expression list, so the callee's arity is fetched only where a
literal `invoke("./…", …)` was written. A `.theta`-callable call is a
`CallExpr` whose callee is a callable-set name — a different AST shape, collected
by nothing in this pass.

The lexical call-site walk that *does* visit those sites
(`checkLexicalCallSites`, `src/parser/theta-document.ts:5146`) owns three
emissions — `shadowed-callable-call`, `tool-arg-not-object-literal`,
`bare-object-literal` — and no arity emission; it also has no access to the
callee's `params:` counts, which live behind the compose pass's
`resolveCalleeArity` dep.

Runtime disposition of the un-rejected calls: positional arguments bind to the
callee's declared `params:` in declaration order, so a too-few call leaves the
tail params unbound and relies on the callee-side `params:` AJV net (surfacing,
per tool-calls.md §Failures, as `Err(InvokeInfraError { cause: "validation" })`),
and a too-many call has no destination for the extra values. Neither is the
parse-time rejection the spec pins, and the too-many case discards an authored
argument.

## Why it matters

- **The same mistake at the same callee is caught through one call form and not
  the other.** An author who migrates `invoke("./twoparam.theta", a, b)` to a
  `tools:` entry plus `twoparam(a, b)` — the migration the spec calls
  "operationally equivalent" — loses a static check silently.
- **A too-many call drops the author's argument with no diagnostic at either
  phase.** Positional binding has no destination for it (the registered
  `invoke-arity-too-many` hint says exactly this), and nothing downstream
  reports the surplus.
- **A too-few call is deferred to a runtime validation error inside the callee**,
  which surfaces as an infra-side `Err` attributed to the callee rather than as
  the caller's parse error, possibly deep in a loop and after a child process has
  already been spawned.
- The checks are already written, tested, and wired; only the call surface is
  missing.

## Non-goals

- The `params:`-type compatibility check on the same call
  (`theta/parse/tool-arg-type-mismatch`) — a separate report in this batch;
  fixing it will want the same callee-facts plumbing, but it is a different rule
  with a different registered code.
- `invoke(...)`'s own arity behaviour, which is correct.
- The runtime `params:` AJV net, which is the specified safety net for
  non-statically-resolvable callees and stays in place.

## Fix

Not yet decided. Constraints any fix must satisfy:

1. The check needs the callee's `requiredCount` / `totalCount`, which are
   produced by `deps.resolveCalleeArity` inside the compose pass — the same pass
   that already resolves every `tools:` `.theta` entry into `calleeCache`
   (`src/extension/production-composition.ts:1430`). Extending the existing
   invoke pass to also walk callable-set call sites keeps the async callee read
   on the one path that already performs it; hoisting the check into
   `checkLexicalCallSites` would require threading callee arity into the
   synchronous parser, which it has no channel for today.
2. Callee resolution must go through the frozen snapshot's `calleePath`
   (`src/parser/callable-set.ts:70–77`), not a re-derivation from the presented
   name — the presented name has already lost the `as` rename and the
   hyphen→underscore rewrite.
3. The emitted diagnostic's `<callee>` placeholder is registered as the callee
   path (`invoke './twoparam.theta' passes too many arguments…`). At a
   `.theta`-callable site the author wrote a name, not a path; the fix must
   decide which is rendered and record it in the registry row, or the message
   will cite text absent from the source line it points at.
4. A `.theta` entry that failed to resolve must not produce a second, derived
   arity diagnostic on top of its own rejection.
5. Pin both directions in `tests/production-tools-load-resolution.test.ts` (or a
   sibling): the three failing cells above red, and the correct-arity control
   plus a defaulted-param callee (where too-few is legal) stay green.

## Provenance

- Spec measured against: `docs/spec_topics/tool-calls.md` §"Argument shape"
  (the "apply equally to a `.theta` callable call" sentence), §"Relationship
  with `invoke`"; `docs/spec_topics/invocation.md` §Argument binding;
  `docs/spec_topics/diagnostics/code-registry-parse.md`
  (`theta/parse/invoke-arity-too-few` / `-too-many` rows).
- Implementation: `src/extension/invoke-static-checks.ts` (INV-3 block),
  `src/parser/invoke-diagnostics.ts` (`checkInvokeArity`),
  `src/extension/production-composition.ts` (pass wiring, `calleeCache`),
  `src/parser/theta-document.ts` (`checkLexicalCallSites`).
- Evidence: offline production-load A/B matrix (this report §Reproduction) run at
  `d06daae3` via a scratch vitest on the
  `tests/production-tools-load-resolution.test.ts` harness; scratch deleted.
