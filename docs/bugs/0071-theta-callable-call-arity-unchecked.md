# Bug 0071 — `theta/parse/invoke-arity-too-few` / `-too-many` fire for `invoke("./x.theta", …)` but never for the `.theta`-callable call form the spec says they "apply equally" to: `twoparam("a")`, `twoparam()` and `twoparam("a","b","c")` all load clean

- **Status:** fixed (0.64.0).
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

## Fix (0.64.0)

**Route: §Fix constraint 1's own recommendation**, taken as written. The existing
invoke static-check compose pass (`checkInvokeStaticResolution`,
`src/extension/invoke-static-checks.ts`) is extended to collect `.theta`-callable
call sites alongside the `invoke(...)` sites it already walks, so the async callee
read stays on the one path that already performs it. Hoisting the check into
`checkLexicalCallSites` was not attempted: that walk is synchronous and has no
channel for callee arity, and bug 0016 owns its three emissions and its
shared-builder message invariant. `src/parser/theta-document.ts` is byte-unchanged.

**The settled `<callee>` rendering (§Fix constraint 3).** At a `.theta`-callable
call site `<callee>` renders the **presented callable name** — the post-`as`,
post-hyphen→underscore identifier bound in the caller's callable set. The
`invoke(...)` surface keeps rendering the verbatim path literal. The reason is the
hazard constraint 3 names: the diagnostic's range is the call site, and the callee
path appears nowhere on that line, so rendering the path would cite text absent
from the line the diagnostic points at. The presented name is unique within a
caller (the collision rule guarantees it), so it identifies the callee without
ambiguity, and it is the identifier form §7 already classifies `<callee>` under.

**Registry consequence of that decision.** Neither registry row moved. Both
*Trigger* columns already read "`invoke(...)` or `.theta` callable call", so there
is no trigger widening; both *Message* templates are unchanged, so
`docs/reference/diagnostics.md` — which transcribes Code / Sev / Phase / Message
only — needs no mirror edit and has none. What moved is the `<callee>` sub-rule in
`placeholder-rendering-b.md` §7, the authoritative home for that placeholder's
rendering, plus its §Edge-cases bullet so the path arm and the name arm of one code
are not read as contradicting each other. **No placeholder was introduced, retired
or moved between categories**, so `placeholder-rendering-a.md` §Closure and its
GOV-7 / GOV-8 posture are untouched.

**How §Fix constraint 4 is enforced.** Structurally, in two layers, both documented
at the emission site. (1) `runComposePass` `continue`s on any error-severity
`tools:`-resolution diagnostic before the pass runs, and `resolveCallableSet`
returns a snapshot only when no error fired — so `deps.callableSet` can never carry
a rejected entry, and an unresolvable path or an erroring callee attracts exactly
one rejection. (2) `deps.resolveCalleeArity` returns `undefined` for a callee that
is unreadable or carries its own load/parse error, and the loop `continue`s.

### What shipped

- `src/extension/invoke-static-checks.ts` — the one call-site walk
  (`walkBlock` / `walkStmt` / `walkExpr`) now accumulates `CollectedCallSites
  { invokeExprs, callExprs }` instead of `InvokeExpr[]`, so both call surfaces are
  gathered by one traversal and cannot drift apart as the node shapes evolve;
  `collectInvokeExprs` keeps its exported signature over that shared walk. New
  exported `ThetaCallableCallSite` / `collectThetaCallableCallSites(body,
  callableSet)` resolve collected `CallExpr`s against the frozen snapshot, keeping
  `kind === "theta"` entries and reading `calleePath` off the entry — never
  re-derived from the presented name (§Fix constraint 2). The snapshot is read
  through `Map.get` plus an explicit `!== undefined` test and never copied into a
  plain object, because a callable name is author-controlled source text (the 0031
  / 0038 hazard class). `checkInvokeStaticResolution`'s deps gained
  `callableSet?: CallableSetSnapshot`, and a second loop after the `invoke(...)`
  loop emits `checkInvokeArity` per `.theta`-callable site with `providedCount =
  site.call.args.length` (no leading path-literal argument to exclude) and
  `staticallyResolvable: true` — which invocation.md §Static resolution makes true
  by definition for a `.theta` entry in `tools:`, not by inference from reaching
  the loop.
- `src/extension/invoke-static-checks.ts`, `walkExpr` — a `par-for` arm walking
  `iterand`, `max` and `body`. `ParForExpr` is a member of the `Expr` union and was
  reaching the leaf `default`, so every call site inside a `par for` was invisible
  to the walk while control-flow.md CTRL-4 explicitly admits `.theta` callable
  calls, `invoke(...)`, `subagent fn` calls and Pi-tool calls there. Because the
  walk is shared, this one arm also carries the `invoke(...)` surface's INV-3
  arity, INV-5 path-escape and `checkCalleeHasErrors`, and `buildInvokeGraph`'s
  INV-4 cycle edges, into `par for` for the first time — the single-walker
  invariant paying out rather than a second rule bolted on. Verified safe: the
  newly-reached invoke-surface `checkCalleeHasErrors` is warning severity on the
  `invoke` surface and does not un-register a caller that registered before, and
  the INV-4 graph is control-flow-insensitive (a literal self-`invoke` is rejected
  at every other position already).
- `src/extension/production-composition.ts` — `toolResult.callableSet` threaded
  into the pass by guarded spread (`exactOptionalPropertyTypes` distinguishes an
  omitted key from one set to `undefined`).
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — §7's
  identifier-shaped bullet gained the `.theta`-callable-call `<callee>` arm; the
  §Edge-cases "Category 7 `<callee>` fallback" bullet reconciles the two arms.
- `docs/spec_topics/tool-calls.md` §"Argument shape" — one sentence pinning the
  rendered `<callee>` on this surface and that the callee resolves through the
  caller's frozen callable-set entry, so the `as` rename and the
  hyphen→underscore rewrite are honoured. Spec vocabulary only.

### Witness inventory

- `tests/theta-callable-call-arity.test.ts` — **new**, 39 cells over a real
  `mkdtempSync` workspace, planted `.pi/theta/`, `discoverAndComposeFixtures(pi,
  ctx)` and a `ctx.ui.notify` collector. **(A)** the two registry rows read through
  `parseRegistry` / `registryMessage` (`tools/code-registry/index.js`), so every
  expected string in the file is substituted from the *Message* column rather than
  copied prose (DIAG-4). **(B0)** a loud precondition guard that no empty discovery
  walk can satisfy. **(B1–B3)** too-many, too-few and zero-argument at a
  two-required-param callee: caller un-registers, message renders the presented
  name. **(B4)** exact arity registers. **(B5)** a defaulted tail param makes
  too-few legal and the caller registers — paired with **(B6)**, where too-many at
  the same callee still un-registers, so `requiredCount` and `totalCount` are
  forced onto different edges. **(B7)** §Fix constraint 2: `./two-param-hyph.theta
  as renamed` called with one argument — the only cell a re-derivation from the
  presented name cannot satisfy. **(B8/B9)** §Fix constraint 4 in both layers: an
  unresolvable entry and a callee carrying its own errors each raise exactly their
  own rejection and no arity message naming them. **(B10)** the `invoke(...)`
  surface unchanged and rendering the path, which pins the rendering divergence at
  the same callee. **(B11–B15)** the three `ParForExpr` operand positions —
  body (`.theta`-callable and `invoke` alike), `max`, and iterand. **(C)** the
  exported `collectThetaCallableCallSites` called directly against a
  `parseThetaDocument`-derived body and a hand-built frozen snapshot, because the
  compose pass resolves off the walk result it already holds and so leaves that
  export — bug 0072's reuse surface — with no in-tree consumer.
  Every callee stem is chosen so no callee's presented name is a substring of
  another's, since the notification collector is workspace-global.
- `tests/production-tools-load-resolution.test.ts` — **additive only** (209
  insertions, 0 deletions), under §Fix constraint 5's explicit pre-authorisation:
  the three failing forms plus the exact-arity control and the defaulted-param
  callee, with `b71`-prefixed fixtures and `MSG` entries in the file's own local
  convention. No existing cell, planted theta, assertion or comment was weakened,
  reworded, reordered or deleted.
- `tests/live/live-production-acceptance.test.ts` — **additive only** (133
  insertions, 0 deletions): one H8a cell driving the same registration observable
  through the real `session_start` → `resources_discover` →
  `composeExtensionInstance` → `discoverAndComposeFixtures` path against a live
  host. Added because no fixture anywhere under `tests/live/**` declares a
  `.theta`-path `tools:` entry — every live `tools:` occurrence is the bare Pi-tool
  token `read`, which this arm excludes — so the fixed arm otherwise had no live
  reach at all. Registration-only (374 ms, zero tokens); `requireLiveProvider()`
  fails loudly on a missing provider.

### Gates

```
npx vitest run tests/theta-callable-call-arity.test.ts tests/production-tools-load-resolution.test.ts
  BEFORE (HEAD 60102e82):  Test Files 2 failed (2) / Tests 16 failed | 33 passed (49)
  AFTER:                   Test Files 2 passed (2) / Tests 62 passed (62)

npm test                 -> Test Files 255 passed (255) / Tests 3643 passed (3643)
                            (baseline at HEAD: 254 / 3596)
npm run typecheck        -> tsc -p tsconfig.json --noEmit, zero `error TS`
npm run lint             -> eslint "src/**/*.ts" clean

npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts
  -> Test Files 1 passed (1) / Tests 9 passed (9)
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/
  -> Test Files 2 passed (2) / Tests 11 passed (11)          (59.4 s)
```

Every pre-fix red was the bug's own symptom — the caller present in `Registered:`
or the arity notification absent from the notify collector — never a compile error
and never a harness throw. No 0064 / 0065 live signature appeared and no H9a area
stalled.

### `tests/fixtures/h7a/permitted-codes.json`: DO NOT APPEND

Decided by the real H9a run, not by assumption. All nine feature areas passed
`assertCodesSubsetOfPermitted` and `assertStderrClean` with neither
`theta/parse/invoke-arity-too-few` nor `-too-many` in any capture. The new arm
fires only for a callable-set entry of kind `theta`, and every `tools:` occurrence
under `tests/live/**` is the bare Pi-tool token `read`, so the emission is
structurally unreachable from an ordinary `pi -p` run. The file is unedited.

### Stale-citation map

This report's citations were taken at `0.52.0` (`d06daae3`); the fix baseline is
`0.63.0` (`60102e82`), after 0069 (`0.62.0`) rewrote `src/parser/callable-set.ts`
and 0070 (`0.63.0`) added a rejection arm there plus a line in
`src/extension/production-composition.ts`. Every anchor was re-verified and the
reproduction observables re-derived with a scratch probe (written, run, deleted)
before any assertion was pinned.

| Cited (0.52.0) | Actual at 60102e82 |
|---|---|
| `invoke-static-checks.ts:293–306` (INV-3 arity block) | `:291–306` — comment `:291`, `providedCount` `:294`, `resolveCalleeArity` `:295` |
| `invoke-diagnostics.ts:66–69` (both code constants) | exact |
| `invoke-diagnostics.ts:331` (`checkInvokeArity`) | exact |
| `production-composition.ts:118` (pass wiring) | the import spans `:114–118`; the sole call site is `:734` |
| `theta-document.ts:5146` (`checkLexicalCallSites`) | `:5196` |
| `callable-set.ts:70–77` (`calleePath`) | doc comment `:71–78`, field declaration `:79` |
| `production-composition.ts:1430` (`calleeCache`) | `:1417` |

Per 0070's handoff note, the fix's own prose cites **symbols, not lines**; the
table above is the only line-anchored artefact and is dated to its two commits.

The re-derived pre-fix baseline reproduced §Reproduction exactly — the six-caller
matrix, the registered set, and the three unrelated
`theta/load/binder-model-unresolved` notifications from the non-bypass callees,
which do not affect `tools:` resolution:

```
REGISTERED:    ["callabletoofew","callabletoomany","callablezero","calldefaulted",
                "callrenamed","ctlcallable","ctlinvoke"]
NOTIFICATIONS: ["binder model unresolved: …" ×3,
                "invoke './twoparam.theta' passes too few arguments: expected 2 non-defaulted, got 1",
                "invoke './twoparam.theta' passes too many arguments: expected at most 2, got 3"]
```

### Review rounds

3 review rounds, 2 fixer rounds.

- **Round 1 (`bug-fix-reviewer`): 2 findings + 1 residual.** (i) `correctness` —
  `walkExpr` had no `par-for` arm, so every call site inside a `par for` iterand /
  `max` / body was unwalked; proven with a production-load probe. (ii) `test` — six
  `path:line` citations, two of them born stale against the very file the fix
  rewrites. (iii) `house-rule` — the pass walked the body twice.
- **Fixer round 1 (`bug-fix-fixer`)** discharged all three: the `par-for` arm plus
  cells B11–B14, every citation converted to a symbol or section anchor, and a
  single traversal (`collectCallSites` once, resolution split into a private
  resolver behind the unchanged export). Red direction proven by removing the arm
  (6 red) with a hash-verified byte-exact restore.
- **Round 2 (`bug-fix-reviewer-fast`): 1 finding + 2 residuals.** (i) `fidelity` —
  the INV-5 doc-comment bullet claimed a `.theta`-callable call's containment "is
  enforced by the `tools:` admission path", which is false; confirmed by an
  independent orchestrator probe (see *Where this report turned out to be wrong*).
  (ii) `test` — the bug-0072 handoff export had no direct test. (iii) `test` — no
  cell covered the `par for` iterand position.
- **Fixer round 2 (`bug-fix-fixer`)** discharged all three: the bullet rewritten to
  the verified invariant, cell C added, cell B15 added. B15 wraps its call in an
  array literal because a bare call as iterand reds on `theta/parse/non-array-iterand`
  (CTRL-2) first and would pass vacuously; red direction proven by removing exactly
  `walkExpr(expr.iterand, out)` (2 red), hash-verified restore.
- **Round 3 (`bug-fix-reviewer`, deep — routed there because the fast round raised
  a `fidelity` finding): CLEAN, 0 defects**, 1 `prose` residual (a header
  enumeration stale after B15), corrected in place. The round re-audited the fix as
  one artefact against all five constraints, re-read the 1064-line witness file end
  to end, verified callee-stem substring uniqueness programmatically, and hunted
  false positives across nine shadowing / arity classes with probes.

### Verification

`bug-fix-verifier` → **SOLID**, all four obligations discharged with quoted
evidence; independently re-confirmed.

1. **The witnesses genuinely witness.** Four neutralisations by targeted byte edit,
   each restored byte-exact and hash-verified against
   `eac75ed0…` (re-hashed independently at the end). Removing the whole
   `.theta`-callable loop → 20 red across both files, every one the bug's symptom,
   with every `invoke`-surface control still green. Rendering `<callee>` as the
   path instead of the name → exactly the 10 message-form cells red and B10 / B13 /
   B14 green, so the tests pin the constraint-3 decision and not merely the
   emission. Re-deriving `calleePath` from the presented name → exactly B7 (plus
   C1 / C4, which exercise the same resolver directly), with the plain-stem cells
   green. The fourth (the `arity === undefined` guard) reds nothing in either
   witness file — recorded as residual 1 with its evidence.
2. **Full default suite green** — 255 files / 3643 tests; typecheck and lint clean.
   Re-run independently at every phase boundary.
3. **Live end-to-end over the fixed path** — H8a 9/9 (including the new cell) and
   H9a 11/11, both run for real. The new cell's red direction was proven under the
   same neutralisation and the source restored byte-exact.
4. **Permitted-codes decided by the run** — do not append; the file is unedited.

### Residuals

All recorded for filing by the parent session; no new bug documents were created
here.

1. **The `arity === undefined` guard in the `.theta`-callable loop is unwitnessed
   by both full-pass witness files.** Neutralising it leaves 62/62 green. The
   reason is structural: a `tools:` entry whose callee carries its own errors is
   error severity on the `tools:` surface and un-registers the caller upstream, and
   `resolveCalleeArity`'s parse is deterministically the same parse over the same
   bytes as the admission's own — so no `.theta`-callable site can reach the loop
   with a present snapshot entry and an absent arity. The guard is nonetheless
   load-bearing: a scratch probe calling `checkInvokeStaticResolution` directly with
   a crafted `deps.resolveCalleeArity` returning `undefined` against a present
   `theta` entry passes with the guard and fails `TypeError: Cannot read properties
   of undefined (reading 'requiredCount')` without it. Constraint 4's *behavioural*
   guarantee is witnessed (B8 / B9, both layers); only this defensive branch is
   not. A narrow seam-level cell of the probe's shape would close it. Same family
   as 0070 residual 1.
2. **`.theta` `tools:` entries have no load-time discovery-root containment check,
   while `tool-calls.md` §"Argument shape" states the rule with a `theta/load/`
   code.** Orchestrator probe: one callee planted far outside every active root,
   reached two ways from the same workspace — `invoke("<abs path>")` fires
   `theta/load/invoke-path-escape` and un-registers, while `tools: - <the same abs
   path>` raises no containment diagnostic at all (that caller un-registered only
   because of this fix's own new arity check, which is how the gap surfaced).
   `parseCalleeForTools` resolves with a bare path resolve plus `readBytes` — no
   `realpath`, no active-root test — and `checkInvokePathAtLoad` has exactly one
   call site in the tree, the `invoke(...)` loop. The enforcement that exists is
   the runtime open-time re-check (`#driveCallee` → `#recheckCalleeContainment`),
   which fails the call closed rather than un-registering the caller. Out of scope
   here (a different rule and a different code); §Non-goals keeps 0071 on arity.
3. **A consequence of residual 2 worth stating separately: the new arity check can
   now emit against an out-of-root callee.** The arity verdict is correct on its own
   terms — the callee was read and parsed — but it fires for a callable the spec
   says should never have been created. Ordering, not correctness: a load-time
   containment check would reject the entry first.
4. **`resolveCalleeArity` is uncached, so a callee is re-read and re-parsed once per
   call site.** Pre-existing on the `invoke(...)` surface and inherited unchanged;
   a theta with N calls at one callee performs N reads. Not a correctness issue and
   not this bug's; worth a memo per load pass if it ever shows up.
5. **Two open sibling reports carry line citations into
   `src/extension/invoke-static-checks.ts` that this fix shifted** (the file grew
   from 302 to 511 lines): 0109 cites `:195` / `:240`, 0050 cites `:298`. Both were
   checked for substance, not just position — 0109's non-goal ("the only shipped
   sites walk `collectInvokeExprs(input.body)` … never a `tools:` entry") remains
   true, since INV-5 stays `invoke(...)`-only by this fix's own explicit design, and
   nothing 0050 pins is behaviourally touched. Citation drift only; both documents
   are sibling-owned and were not edited.

### Handoff to bug 0072 (same plumbing, runs next)

0072 needs per-argument TYPE facts at the same call sites, so the collector yields
the call node rather than pre-reduced counts. Exported from
`src/extension/invoke-static-checks.ts`:
`interface ThetaCallableCallSite { name; calleePath; call }` and
`collectThetaCallableCallSites(body: ThetaBody, callableSet: CallableSetSnapshot |
undefined): ThetaCallableCallSite[]`; `site.call.args[i]` is each argument `Expr`
and `site.call.range` the located site. `checkInvokeStaticResolution`'s deps gained
`callableSet?: CallableSetSnapshot`, threaded from `toolResult.callableSet`. Inside
the pass, use `collectCallSites` + the private `resolveThetaCallableCallSites` —
do not add a second body traversal, and do not fork the walk. Full detail in
`.pi/tmp/fixes/0071-report.md` §Handoff.

### Pinned dispositions / non-goals

Unchanged and untouched: `src/parser/theta-document.ts` (`checkLexicalCallSites`,
bug 0016's walk), both `code-registry-parse.md` rows, `docs/reference/diagnostics.md`,
`tests/fixtures/h7a/permitted-codes.json`, `checkInvokeArity` and its message
builders, `resolveCalleeArity`, the runtime `params:` AJV net, and the `params:`-type
compatibility check on the same call (bug 0072). `optional` on a `params:` field is
never set by the parser today, so `resolveCalleeArity`'s `optional !== true`
conjunct is inert on both surfaces alike — unchanged here.

### Where this report turned out to be wrong

§Expected behaviour states: "The path-restriction half of that sentence *is*
implemented for `tools:` entries (`theta/load/invoke-path-escape`); the arity half
is not." The first clause is false at the fix baseline. Path restriction is
implemented for the `invoke(...)` surface at load and for the `.theta`-callable
surface only at runtime, at dispatch — nothing on the load path checks a `tools:`
entry's containment. The probe evidence is residual 2. The route is unaffected: the
sentence was cited as background for the arity half, which this fix implements, and
the containment half is a separate rule with a separate code.

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

### Discharge note — bug 0110 (0.66.0)

discharged by the 0110 fix (0.66.0): residuals 2 and 3 above are both closed. A
`tools:` `.theta` entry's resolved path is now checked for discovery-root
containment at load, in `resolveThetaToolsAtLoad` / `parseCalleeForTools`, through
the same `checkInvokePathAtLoad` checker the `invoke(...)` surface calls, and an
escape is `theta/load/invoke-path-escape` at error severity — so the caller does
not register and no frozen callable-set snapshot is built. Residual 3 is closed
structurally rather than by placement: the compose pass `continue`s on any
error-severity `tools:` diagnostic strictly before the invoke static-check pass
runs, so this fix's arity loop is unreachable for an out-of-root callee, and the
0110 witness asserts both halves — the containment diagnostic present, and no
`passes too` message naming that callee.

The same fix makes §Expected behaviour's clause "The path-restriction half of that
sentence *is* implemented for `tools:` entries (`theta/load/invoke-path-escape`)"
TRUE. §Fix (0.64.0) *Where this report turned out to be wrong* retracted that
clause as false at its own baseline, and that retraction stands as the record of
0.64.0; from 0.66.0 the clause holds on the load path as well as at runtime. Bug
0110 carries the measurement, the route decision and the witness inventory.

This fix's own code and tests are untouched by 0110:
`src/extension/invoke-static-checks.ts` took one comment-only hunk (its INV-5
doc-comment bullet stated the gap 0110 closed) and
`tests/theta-callable-call-arity.test.ts` is byte-unchanged and green.
