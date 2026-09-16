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
fix_skips: 1
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

## Fix attempts
- qw20260916144930: skipped — PTQ-0364: Reproduced verbatim at the current mode-gate blocks in checkThetaCallableCallSurface and in checkInvokeStaticResolution's invoke(...) loop. Implemented the human-ratified fix exactly: added module-private withClausePromptModeRefusal({clause?, mode, file, range, presented}) beside checkClauseCwdType in invoke-static-checks.ts; both surfaces now call it (invoke loop passes arity?.mode/invoke.path, the theta-callable arm passes arity.mode/site.name). Diagnostics are byte-identical; the PRODUCTION-UNREACHABLE rationale stayed at its call site as ratified. / PTQ-0371: Reproduced — neither the module header nor checkInvokeStaticResolution's own doc comment mentioned the RFC 0011 §5.2 runtime-tool call-surface check. Added one bullet to each, naming checkRuntimeToolCallSurface and the checkers it reuses. / PTQ-0372: Reproduced — the module header's Erratum A′ bullet still claimed the default-reject loop convicts every non-theta bare-ident callee. Updated it to name Erratum B, the same-file subagent fn exemption, and the deferral to checkImportedWithClauseCallees, matching the already-corrected wording next to checkInvokeStaticResolution. / PTQ-0373: Reproduced (the four checkImported* functions had already relocated, via the previously-landed PTQ-0370, into src/extension/invoke-imported-checks.ts, 548 LOC — well under the D4 justify band). Added module-private isShadowedImportName(name, shadowedNames) there and replaced all four inline shadowedNames.has(...) + repeated-comment guards with a call to it. No test changes needed (behavior-preserving refactor of internal implementation only). / PTQ-0374: Skipped. Both copies (in checkThetaCallableCallSurface/checkRuntimeToolCallSurface) reproduce verbatim, but both live in invoke-static-checks.ts (1759 LOC, over the D4 justify band), so HOME BAND disqualifies it as the helper's home even though the copies live there. The compliant fallback — a new sibling module — would need collectProvableArgTypes/renderCollectedTypes, which exist only in that oversized host, are used by several other functions there, and are cited by file name across ~15 test files; relocating them (the rule's only sanctioned way to avoid a host↔sibling import cycle) is disproportionate to this issue's two 30-line loops. Left in place per the HOME BAND/Imports rule's own "else SKIP with a note (a runtime import cycle is not an acceptable outcome)" clause; no code touched. / PTQ-0375: Skipped. checkImportedFnCallArgs (invoke-imported-checks.ts) and checkFnCallArgs (type-layer-checks.ts) still hand-duplicate the identical junk-annotation guard verbatim. The copies straddle extension/parser/, and their only common dependency (annotationToCompatType/annotationSourceIsNotTypeExpression) lives in type-layer-checks.ts (4006 LOC, over the justify band) — so the "directory both sides already import" is itself HOME-BAND-disqualified, and those two primitives are used dozens of times through that file and others. Relocating them to avoid the resulting cycle is far outside this issue's scope. Skipped per the same SKIP clause; no code touched. / PTQ-0378: Reproduced at all four cited sites. Fixed all four: the first ("the invoke arm's gate above") was superseded by PTQ-0364's rewrite, which replaced the stale directional word with a name-only reference instead of re-asserting a direction; the other three ("arm above renders" at the arity-rendering comment, "emptyCalleeAnnotationEnv below", "arm below caps") had their above/below swapped to match Seam A's actual current order (checkThetaCallableCallSurface now physically precedes checkInvokeStaticResolution). / Verification: ran the exact required command (env unset + npx tsc --noEmit && npm test -- --minWorkers=1 --maxWorkers=3) after all edits — tsc clean, 680 test files / 11483 tests passed. Only src/extension/invoke-static-checks.ts and src/extension/invoke-imported-checks.ts were modified. | review unconfirmed: PTQ-0364-with-clause-mode-gate-duplicated-surfaces.md — partial: the duplication itself is verifiably gone (one withClausePromptModeRefusal helper, invoke-static-checks.ts:441-459, called from both surfaces at :1015 and :1680; diagnostics byte-identical; arity?.mode preserves the invoke arm's undefined-narrowing; typecheck, lint, and the full 11483-test suite green), but the helper landed inside src/extension/invoke-static-checks.ts, which node tools/quality/size-scan.mjs loc --host reports at 1819 LOC — over the D4 Home-band bar (under 1000 LOC), which quality/README.md's D4 section says binds "not even the module the issue names or one a copy lives in"; extract withClausePromptModeRefusal into a new sibling module under src/extension/ (with a header comment) and have invoke-static-checks.ts import it back like any other caller. PTQ-0374-callable-surface-argument-loop-cloned.md — untouched (shed by the fixer): the per-argument type-mismatch loops in checkThetaCallableCallSurface (invoke-static-checks.ts:1096-1127) and checkRuntimeToolCallSurface (:1209-1233) remain the same renamed-only clone — clone-scan.mjs still reports it as group G008 (110 tokens, renamed-only(6)); no shared helper was extracted between the two surfaces' shared checkInvokeArity/checkToolCallArguments calls. PTQ-0375-fn-param-junk-guard-cross-module-clone.md — untouched (shed by the fixer): the parameter-annotation-junk guard remains duplicated between checkImportedFnCallArgs (now src/extension/invoke-imported-checks.ts:227-240, after the prior PTQ-0370 file move) and checkFnCallArgs (src/parser/type-layer-checks.ts:2673-2687) — clone-scan.mjs still reports it as group G057 (65 tokens, renamed-only(6)); no shared predicate was added beside annotationToCompatType / annotationSourceIsNotTypeExpression in parser/.
