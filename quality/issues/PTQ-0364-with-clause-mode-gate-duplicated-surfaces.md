---
id: PTQ-0364
title: RFC 0009's prompt-mode with-clause gate is hand-duplicated across the invoke(...) and .theta-callable call surfaces
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:939-958
  - src/extension/invoke-static-checks.ts:1241-1259
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: parallel           # D4 only: clone | drift | parallel
wave: qw20260915044704
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-15
fix_skips: 1
---

# RFC 0009's prompt-mode with-clause gate is hand-duplicated across the invoke(...) and .theta-callable call surfaces

## Observation
`checkInvokeStaticResolution` judges a call-site `with` clause on exactly two surfaces: the inline `invoke(...)` loop and the delegated `.theta`-callable loop (`checkThetaCallableCallSurface`). RFC 0009 / invocation.md INV-8's "reject a clause on a statically-resolvable PROMPT-mode callee" rule is coded as two independent, hand-written blocks, one per surface — each surface's own comment names the other as its counterpart. The sibling INV-6 rule (the clause's `cwd` value) is unified behind one shared function, `checkClauseCwdType`, that both surfaces already call with a `surface` discriminant; the mode gate never received that treatment.

## Evidence

**Copy 1 — inside `checkThetaCallableCallSurface` (module-private, defined at line 914), invoke-static-checks.ts:939-958:**
```ts
    // RFC 0009 (invocation.md INV-8 static mode gate), the `.theta`-callable
    // half of the invoke arm's gate above. PRODUCTION-UNREACHABLE: a
    // prompt-mode `.theta` in `tools:` already un-registers the theta at load
    // (`theta/load/prompt-mode-callable`, tool-calls.md), so no registered
    // caller can hold this site — the arm exists so the gate is uniform
    // across both clause-bearing surfaces (and for harness inputs). `<callee>`
    // is the PRESENTED callable name here, not the callee path
    // (placeholder-rendering-b.md §7), as this surface's other rows render it.
    let clauseRefused = false;
    if (site.call.withClause !== undefined && arity.mode === "prompt") {
      diagnostics.push({
        severity: "error",
        code: WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
        file: callerPath,
        range: site.call.range,
        message: withClausePromptModeCalleeMessage(site.name),
        hint: WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
      });
      clauseRefused = true;
    }
```

**Copy 2 — inside `checkInvokeStaticResolution`'s `invoke(...)` loop (exported, defined at line 1149), invoke-static-checks.ts:1241-1259:**
```ts
      // RFC 0009 (invocation.md INV-8 static mode gate): a call-site `with`
      // clause addresses the spawned child process, so a statically-resolvable
      // PROMPT-mode callee under a clause is refused here, before the
      // arity/type block. `arity === undefined` means the callee is not
      // statically resolvable, and then NO parse code fires — the runtime
      // validation arm owns that case (registry row Trigger). `<callee>`
      // renders the verbatim path literal, this arm's existing rendering rule.
      let clauseRefused = false;
      if (invoke.withClause !== undefined && arity !== undefined && arity.mode === "prompt") {
        diagnostics.push({
          severity: "error",
          code: WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE,
          file: site.file,
          range: site.range,
          message: withClausePromptModeCalleeMessage(invoke.path),
          hint: WITH_CLAUSE_PROMPT_MODE_CALLEE_HINT,
        });
        clauseRefused = true;
      }
```

**Diff verdict: renamed-only, plus one necessary structural addition and one spec-mandated argument difference** (no clone-map group id — the scanner's token window did not surface this pair; found by reading, per this review's mandate to hunt load-bearing parallels the mechanical scan cannot see):
- `site.call.withClause` ↔ `invoke.withClause` — the same field read off a different node shape (renamed accessor).
- Copy 2 carries an extra `arity !== undefined &&` conjunct Copy 1 omits: Copy 1's enclosing loop already returned earlier (`if (arity === undefined) { continue; }`, lines 936-938) so `arity` is narrowed non-`undefined` by the time its gate runs; Copy 2's gate runs before any such narrowing on the `invoke(...)` surface, so it must test the possibility itself — a real, position-driven structural difference, not a careless one.
- `withClausePromptModeCalleeMessage(site.name)` (the PRESENTED callable name) ↔ `withClausePromptModeCalleeMessage(invoke.path)` (the verbatim path literal) — required by placeholder-rendering-b.md §7, cited in both copies' own comments, not an accidental divergence.
- `file`/`range` sources (`callerPath`/`site.call.range` vs `site.file`/`site.range`) are the same values reached through different local bindings in the two functions.

## Why this is a problem
Both copies exist to enforce one spec rule (RFC 0009 / invocation.md INV-8) on exactly the two surfaces the spec binds together — each copy's own comment names the other ("the `.theta`-callable half of the invoke arm's gate above" / "the arm exists so the gate is uniform across both clause-bearing surfaces"), which is the load-bearing claim, not an incidental resemblance. Nothing structural enforces the pairing: INV-6's sibling rule (the `cwd` check) is one function, `checkClauseCwdType`, both surfaces call with a `surface: {kind: "invoke"|"theta-callable"}` discriminant — proving the codebase already has, and uses, a pattern for unifying exactly this kind of per-surface rule. INV-8's mode gate is instead two independent, hand-maintained copies with no shared function and no exhaustive-switch/compiler tie between them: a change to one has no mechanical prompt to reach the other.

Today 2 of 2 clause-bearing surfaces carry the gate (full parity), but the safety net is asymmetric. `grep -rn "with-clause-prompt-mode-callee" tests/` finds it in exactly two files: `tests/call-with-clause-static-checks.test.ts` (the code constant plus one behavioural test, "Row 6") and `tests/rfc-0009-spec-surface-gate.test.ts` (which only asserts the code string appears in a spec/registry document, not that either check fires). "Row 6" drives `checkInvokeStaticResolution` with a hand-built `InvokeExpr` — the `invoke(...)` surface, Copy 2 — and is the ONLY behavioural assertion on this diagnostic code in the whole test suite. No test drives a `tools:`-classified `.theta`-callable call site with a prompt-mode callee under a clause, so Copy 1 — itself marked "PRODUCTION-UNREACHABLE" by its own comment, kept alive only "for harness inputs" — has no harness actually exercising it. The one copy most likely to silently diverge from its sibling on a future spec/rendering change is also the one no test would catch drifting.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis): extend `checkClauseCwdType`'s existing `surface`-discriminated-union pattern (or add a sibling function beside it) to also decide the mode gate, mirroring how INV-6's own check already unifies both surfaces — named as an observation of a pattern already proven out one function away in this same file, not a design.

## False-positive check
- Both copies re-read verbatim immediately before filing at the cited line ranges (939-958, 1241-1259).
- Liveness: `checkThetaCallableCallSurface` is invoked from `checkInvokeStaticResolution` at invoke-static-checks.ts:1337-1345 (`diagnostics.push(...(await checkThetaCallableCallSurface(...)))`), and `checkInvokeStaticResolution` is exported and called from `production-composition.ts` (confirmed live per PTQ-0351's own citation of that call site, independently re-verified: `export async function checkInvokeStaticResolution` at line 1149 in the current file) — both copies are live production code; neither is a dead copy (D2's territory).
- Not tests/: both citations are in `src/extension/invoke-static-checks.ts`.
- Not generated: no `@generated`/`DO NOT EDIT` marker anywhere in the file.
- Not a spec-repeated normative vector table: this is imperative diagnostic-emitting code, not a data table invocation.md itself repeats in more than one place.
- Test-coverage check: `grep -rn "with-clause-prompt-mode-callee" tests/` — 2 files, 5 total hits; the sole behavioural test ("Row 6" in `call-with-clause-static-checks.test.ts`) constructs an `InvokeExpr` and calls `checkInvokeStaticResolution` directly — the `invoke(...)` surface only; no test constructs a `tools:`-classified `.theta`-callable call site to exercise Copy 1.
- Duplicate-finding check: grepped `quality/issues` + `quality/resolved` + `quality/intake` for `with-clause-prompt-mode`, `WITH_CLAUSE_PROMPT_MODE`, `clauseRefused`, `mode gate`, `INV-8` — hits are PTQ-0170, PTQ-0176, PTQ-0187 (all D2, stale header-roster citations), PTQ-0282 (unrelated file), and PTQ-0321/PTQ-0351 (D9 breakdown of `checkInvokeStaticResolution`'s phase count/LOC — a size concern about the SAME function, not this cross-surface content-duplication claim). None names this pairing as a duplication/drift concern; not a re-file.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — reality reproduces exactly (both excerpts byte-match at 939-958/1241-1259, the arity-narrowing structural difference is real, checkClauseCwdType is confirmed as the existing shared INV-6 pattern both surfaces already call, clone-scan.mjs independently re-run shows no group covering this pair, both copies confirmed live via call sites at :1337 and production-composition.ts:1167, and the test-coverage asymmetry is accurate — grep reproduces 2 files/5 hits with Row 6 exercising only the invoke(...) surface); d4_class: parallel caps accurate accounting at questionable by design — the shared source of truth is a human ruling, never a triage confirmation (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-15): one shared source of truth for the INV-8 static mode gate, the shape checkClauseCwdType already proves for INV-6 one function away. Add a module-private helper beside it (hypothesis withClausePromptModeRefusal) taking { clause?: CallWithClause; mode: <the statically-resolved callee mode> | undefined; file; range; presented: string } and returning the one Diagnostic or undefined; both surfaces call it — the invoke(...) loop passing arity?.mode and invoke.path (so the arity === undefined narrowing is preserved by the undefined mode), checkThetaCallableCallSurface passing arity.mode and site.name — and set clauseRefused from the result. Diagnostics byte-identical (code, message, hint, file, range); the theta-callable site's PRODUCTION-UNREACHABLE comment stays at its call site. No behaviour change; tests unchanged. Fix surface is invoke-static-checks.ts — runs after its D9 lane (the checkImported* move) lands.

## Fix attempts
- qw20260916144930: skipped — PTQ-0364: Reproduced verbatim at the current mode-gate blocks in checkThetaCallableCallSurface and in checkInvokeStaticResolution's invoke(...) loop. Implemented the human-ratified fix exactly: added module-private withClausePromptModeRefusal({clause?, mode, file, range, presented}) beside checkClauseCwdType in invoke-static-checks.ts; both surfaces now call it (invoke loop passes arity?.mode/invoke.path, the theta-callable arm passes arity.mode/site.name). Diagnostics are byte-identical; the PRODUCTION-UNREACHABLE rationale stayed at its call site as ratified. / PTQ-0371: Reproduced — neither the module header nor checkInvokeStaticResolution's own doc comment mentioned the RFC 0011 §5.2 runtime-tool call-surface check. Added one bullet to each, naming checkRuntimeToolCallSurface and the checkers it reuses. / PTQ-0372: Reproduced — the module header's Erratum A′ bullet still claimed the default-reject loop convicts every non-theta bare-ident callee. Updated it to name Erratum B, the same-file subagent fn exemption, and the deferral to checkImportedWithClauseCallees, matching the already-corrected wording next to checkInvokeStaticResolution. / PTQ-0373: Reproduced (the four checkImported* functions had already relocated, via the previously-landed PTQ-0370, into src/extension/invoke-imported-checks.ts, 548 LOC — well under the D4 justify band). Added module-private isShadowedImportName(name, shadowedNames) there and replaced all four inline shadowedNames.has(...) + repeated-comment guards with a call to it. No test changes needed (behavior-preserving refactor of internal implementation only). / PTQ-0374: Skipped. Both copies (in checkThetaCallableCallSurface/checkRuntimeToolCallSurface) reproduce verbatim, but both live in invoke-static-checks.ts (1759 LOC, over the D4 justify band), so HOME BAND disqualifies it as the helper's home even though the copies live there. The compliant fallback — a new sibling module — would need collectProvableArgTypes/renderCollectedTypes, which exist only in that oversized host, are used by several other functions there, and are cited by file name across ~15 test files; relocating them (the rule's only sanctioned way to avoid a host↔sibling import cycle) is disproportionate to this issue's two 30-line loops. Left in place per the HOME BAND/Imports rule's own "else SKIP with a note (a runtime import cycle is not an acceptable outcome)" clause; no code touched. / PTQ-0375: Skipped. checkImportedFnCallArgs (invoke-imported-checks.ts) and checkFnCallArgs (type-layer-checks.ts) still hand-duplicate the identical junk-annotation guard verbatim. The copies straddle extension/parser/, and their only common dependency (annotationToCompatType/annotationSourceIsNotTypeExpression) lives in type-layer-checks.ts (4006 LOC, over the justify band) — so the "directory both sides already import" is itself HOME-BAND-disqualified, and those two primitives are used dozens of times through that file and others. Relocating them to avoid the resulting cycle is far outside this issue's scope. Skipped per the same SKIP clause; no code touched. / PTQ-0378: Reproduced at all four cited sites. Fixed all four: the first ("the invoke arm's gate above") was superseded by PTQ-0364's rewrite, which replaced the stale directional word with a name-only reference instead of re-asserting a direction; the other three ("arm above renders" at the arity-rendering comment, "emptyCalleeAnnotationEnv below", "arm below caps") had their above/below swapped to match Seam A's actual current order (checkThetaCallableCallSurface now physically precedes checkInvokeStaticResolution). / Verification: ran the exact required command (env unset + npx tsc --noEmit && npm test -- --minWorkers=1 --maxWorkers=3) after all edits — tsc clean, 680 test files / 11483 tests passed. Only src/extension/invoke-static-checks.ts and src/extension/invoke-imported-checks.ts were modified. | review unconfirmed: PTQ-0364-with-clause-mode-gate-duplicated-surfaces.md — partial: the duplication itself is verifiably gone (one withClausePromptModeRefusal helper, invoke-static-checks.ts:441-459, called from both surfaces at :1015 and :1680; diagnostics byte-identical; arity?.mode preserves the invoke arm's undefined-narrowing; typecheck, lint, and the full 11483-test suite green), but the helper landed inside src/extension/invoke-static-checks.ts, which node tools/quality/size-scan.mjs loc --host reports at 1819 LOC — over the D4 Home-band bar (under 1000 LOC), which quality/README.md's D4 section says binds "not even the module the issue names or one a copy lives in"; extract withClausePromptModeRefusal into a new sibling module under src/extension/ (with a header comment) and have invoke-static-checks.ts import it back like any other caller. PTQ-0374-callable-surface-argument-loop-cloned.md — untouched (shed by the fixer): the per-argument type-mismatch loops in checkThetaCallableCallSurface (invoke-static-checks.ts:1096-1127) and checkRuntimeToolCallSurface (:1209-1233) remain the same renamed-only clone — clone-scan.mjs still reports it as group G008 (110 tokens, renamed-only(6)); no shared helper was extracted between the two surfaces' shared checkInvokeArity/checkToolCallArguments calls. PTQ-0375-fn-param-junk-guard-cross-module-clone.md — untouched (shed by the fixer): the parameter-annotation-junk guard remains duplicated between checkImportedFnCallArgs (now src/extension/invoke-imported-checks.ts:227-240, after the prior PTQ-0370 file move) and checkFnCallArgs (src/parser/type-layer-checks.ts:2673-2687) — clone-scan.mjs still reports it as group G057 (65 tokens, renamed-only(6)); no shared predicate was added beside annotationToCompatType / annotationSourceIsNotTypeExpression in parser/.
