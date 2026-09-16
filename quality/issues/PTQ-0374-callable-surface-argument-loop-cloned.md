---
id: PTQ-0374
title: checkThetaCallableCallSurface and checkRuntimeToolCallSurface hand-duplicate the per-argument type-mismatch loop between their shared arity and diagnostic calls
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1061-1092
  - src/extension/invoke-static-checks.ts:1174-1198
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260916045442
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# checkThetaCallableCallSurface and checkRuntimeToolCallSurface hand-duplicate the per-argument type-mismatch loop between their shared arity and diagnostic calls

## Observation
`checkThetaCallableCallSurface` (RFC 0009, `.theta`-callable call sites) and
`checkRuntimeToolCallSurface` (RFC 0011 §5.2, fixed-signature runtime-tool call sites) each
enforce bug 0072's per-argument arity-then-type-mismatch discipline for their own callable
kind. `checkRuntimeToolCallSurface`'s own doc comment states it "Mirrors
`checkThetaCallableCallSurface`'s structure: per call site, arity via `checkInvokeArity`, type
via `checkToolCallArguments` … first-mismatch-only." Both surfaces already share
`checkInvokeArity` (arity) and `checkToolCallArguments` (diagnostic emission) as named,
callable functions; the loop BETWEEN those two shared calls — deriving each argument's
expected type, testing every provable value against it, and emitting on first mismatch — is
instead a second, hand-written copy.

## Evidence

**checkThetaCallableCallSurface — invoke-static-checks.ts:1061-1092:**
```ts
    for (const [i, argExpr] of site.call.args.entries()) {
      const field = arity.fields[i];
      if (field === undefined) {
        continue;
      }
      const expectedType = annotationToCompatType(field.typeSource);
      if (expectedType === undefined) {
        continue;
      }
      const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
      if (argTypes === undefined) {
        // A value-contributing position past the parser's static view: the
        // argument can take a value of unknown type, which defers to the
        // callee's own runtime AJV load — see `collectProvableArgTypes`.
        continue;
      }
      if (
        !argTypes.every(
          (argType) =>
            checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) ===
            "incompatible",
        )
      ) {
        // Only an explicit incompatibility on EVERY value the argument can
        // take is provable. One arm the `params:` field accepts — or answers
        // `"unknown"` / `"integer-narrowing"` for — means a runtime value may
        // well type-check, so the site defers to the runtime AJV net.
        continue;
      }
      diagnostics.push(
        ...checkToolCallArguments({
          toolName: site.name,
```

**checkRuntimeToolCallSurface — invoke-static-checks.ts:1174-1198:**
```ts
    for (const [i, argExpr] of call.args.entries()) {
      const param = sig.params[i];
      if (param === undefined) {
        continue;
      }
      const expectedType = annotationToCompatType(param.typeSource);
      if (expectedType === undefined) {
        continue;
      }
      const argTypes = collectProvableArgTypes(argExpr, typeEnv, typePass);
      if (argTypes === undefined) {
        continue;
      }
      if (
        !argTypes.every(
          (argType) =>
            checkCompatible(argType, expectedType, emptyCalleeAnnotationEnv) ===
            "incompatible",
        )
      ) {
        continue;
      }
      diagnostics.push(
        ...checkToolCallArguments({
          toolName: presentedName,
```

**Diff verdict: renamed-only** (clone-map group **G008**, 110 tokens, renamed-only(6),
re-verified unchanged at both cited spans). Renames: `site.call.args` ↔ `call.args`;
`field` ↔ `param`; `arity.fields[i]` ↔ `sig.params[i]`; `site.name` ↔ `presentedName`;
`site.call.range` ↔ `call.range` (just past this excerpt, both feed the same
`checkToolCallArguments` shape); `"theta-callable"` ↔ `"runtime-tool"` `calleeKind` literal
(also just past this excerpt). The control flow — guard on missing field/param, derive
expected type, bail if unannotated, collect provable argument types, bail if unprovable, test
every provable value for explicit incompatibility, bail otherwise, push the shared diagnostic
emitter, `break` after first mismatch — is otherwise identical, including which branches carry
a comment and which the sibling states elides (the second copy's comments are trimmed
restatements of the first's).

## Why this is a problem
tool-calls.md's "Argument shape" clause states the per-argument type-mismatch rule once,
uniformly, for every statically-resolvable callee kind — not once per surface. `PTQ-0364`
(already filed against this same pair of functions, confirmed and ratified, status open)
already found ONE piece of this exact pattern hand-duplicated between these same two
functions — the RFC 0009 INV-8 with-clause mode gate at `invoke-static-checks.ts:939-958` /
`:1241-1259`, a different code block than the one cited here — and that filing's own
reasoning applies again: the sibling INV-6 rule (the clause's `cwd` type) is unified behind
one shared function, `checkClauseCwdType`, that both surfaces already call with a
`surface`-discriminated parameter, proving the codebase already has, and uses, a pattern for
unifying exactly this kind of per-surface rule — but this loop, like that gate, never received
it. Arity and diagnostic emission ARE already centralised (`checkInvokeArity`,
`checkToolCallArguments`); only the middle decision — which argument, what is its expected
type, is every provable value incompatible with it — is written out twice. If bug 0072's rule
is later refined (e.g. which arm counts as an "explicit incompatibility," or the
first-mismatch-only cap moves) on one copy and missed on the other, the two callable kinds
would silently diverge on a call site tool-calls.md's own uniform *Trigger* wording says must
be judged identically.

## Suggested direction (non-binding, optional)
The natural shared home (hypothesis) is a module-private helper beside `checkToolCallArguments`
and `checkInvokeArity` — taking the per-slot field list, the call's arguments, `calleeKind`,
`toolName`, and range, and performing this loop once — called from both surfaces, mirroring
`checkClauseCwdType`'s already-proven surface-discriminated pattern one function away in this
same file (the same precedent `PTQ-0364` names for the neighbouring gate). Named as an
observation of a pattern already proven out in this file, not a design.

## False-positive check
- Both excerpts re-read verbatim at the cited lines immediately before filing; content
  matches clone-map group G008's own boundaries.
- Both copies live: `checkThetaCallableCallSurface` and `checkRuntimeToolCallSurface` are both
  invoked from `checkInvokeStaticResolution` in the same file (confirmed by reading the
  surrounding call sites), which `PTQ-0351`/`PTQ-0364` already establish as called from
  `production-composition.ts` — not a D2 dead-copy concern.
- Not tests/, not generated: both sites are in `src/extension/invoke-static-checks.ts`,
  hand-authored production code with no `@generated` marker.
- Not a spec-repeated normative vector: tool-calls.md states the argument-shape rule once; the
  duplication is two CODE implementations of it, not two spec citations.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for
  `checkRuntimeToolCallSurface` and `checkThetaCallableCallSurface` — the only D4 hit is
  `PTQ-0364` (status open, confirmed, `d4_class: parallel`), whose own cited lines
  (`939-958`/`1241-1259`) are the with-clause mode gate, entirely disjoint from this filing's
  cited lines (`1061-1092`/`1174-1198`, the per-argument type-mismatch loop) — a distinct root
  cause in the same two functions, not a re-file. Other hits (`PTQ-0321`, `PTQ-0350`,
  `PTQ-0351`) are D9 size/phase-count claims on `checkInvokeStaticResolution`, unrelated to
  this pair's internal content duplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts byte-match at 1061-1092/1174-1198, independently reproduced by `node tools/quality/clone-scan.mjs map` as group G008 (110 tokens, renamed-only(6), identical spans), both functions confirmed live (called from checkInvokeStaticResolution, itself called from production-composition.ts:1397), checkClauseCwdType confirmed as the existing shared-precedent pattern, and the cited PTQ-0364 block (939-958/1241-1259) confirmed disjoint from this one (1061-1092/1174-1198) — a distinct root cause in the same two functions, not a re-file; d4_class: clone accurately classified since the two copies are behaviourally identical (mechanical dedupe, no behaviour choice needed) (triage: claude-opus-5)
