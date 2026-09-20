# Bug 0473 — the spec's cross-file static `invoke<Schema>` return-type check is unimplemented: a statically-resolvable literal-path callee with an incompatible (or empty-tail `null`) final value loads with zero diagnostics, and the mismatch only surfaces at runtime as `return_validation`

- **Status:** fixed (0.484.0).
- **Sev/Diff estimate:** S3/D3 — S3 because the fail-closed runtime net
  (`#validateInvokeReturn`, AJV against the `invoke<Schema>` annotation) does
  hold: no wrong value crosses the boundary, so shipped behaviour degrades
  from "refuse at load" to "Err at first call", never to silent wrongness. D3
  because the fix belongs in the load pass's cross-file static-check walk,
  which today resolves callees for arity, per-slot argument types, cycles and
  root containment but has no return-type leg, and the parse-time checker it
  would reuse is currently reachable only from the in-file `subagent fn` path.
- **Kind:** defect — spec–implementation divergence (spec promises, impl
  lacks).
- **Spec basis** (at `a6753d5c`, v0.467.0):
  - `docs/spec_topics/invocation.md` §"Typed return": "When both the annotated
    `Schema` and the callee are statically resolvable (per [Static
    resolution]) the parser checks `T_calleeReturn ⊑ Schema` … Mismatch is a
    parse error `theta/parse/invoke-return-type-mismatch`."
  - §"Static resolution" explicitly includes "a callee referenced by a literal
    `invoke("./path.theta", ...)`" and names "cross-theta return-type
    inference" as one of the shared parse-cache's consumers.
  - The *Empty-tail callee compatibility* clause pins the empty-tail case:
    `invoke<Schema>` against a no-tail callee "is
    `theta/parse/invoke-return-type-mismatch` when statically resolvable".
- **Affected** (at `a6753d5c`):
  - `src/parser/invoke-diagnostics.ts:342` — `checkInvokeReturnType` exists
    but has exactly one call site.
  - `src/parser/type-layer-checks.ts:2175` — that call site is
    `checkSubagentReturnAnnotation` (`calleeResolvable: true` hardcoded),
    reached only from an in-file `subagent fn f(): T` declaration.
  - `src/extension/invoke-static-checks.ts` — the load pass's cross-file walk:
    resolves literal-path callees for arity, per-slot argument types, cycle
    detection and root containment; performs no return-type comparison.

## Symptom

A `mode: prompt` theta calling
`invoke<TreeFixReport>("./workers/fix-cluster-tree.theta", …)` against a
callee whose body ends in an `if` STATEMENT (no tail expression → inferred
final value `null`) loads cleanly — zero diagnostics, both thetas register —
despite the spec's parse-error promise. The first call then fails at runtime
with `Err(InvokeInfraError { cause: "return_validation" })` ("invoke<…>
return value failed validation"). Probed through the real load path
(`discoverAndComposeFixtures`): cross-file ⇒ zero diagnostics; the in-file
`subagent fn` analogue of the same shape ⇒
`theta/parse/invoke-return-type-mismatch` and the theta does not register.

## Discovery context

The 2026-09-10 quality-loop wave abort: the (pre-`?`-era) orchestrator read
`.ok` off a wrapper return that had marshalled as `Ok(null)` because the
wrapper's tail was a trailing if/else (a statement). Typing the call site
(`invoke<TreeFixReport>`) was expected to convert that whole defect class
into a load-time refusal per the spec; it does not, because this check is
missing — the typed annotation instead buys the runtime AJV net.

## Witnesses (landed with this report)

`tests/quality-loop-empty-tail-return-validation.test.ts`:
- cell A — asserts that a cross-file `invoke<Schema>` of an empty-tail (final
  value `null`) callee fires `theta/parse/invoke-return-type-mismatch` and
  un-registers the caller: the cross-file mirror of cell B.
- cell B — the in-file `subagent fn` contrast (the check firing where it is
  implemented).
- cells C–E — the runtime net: conforming report ⇒ `Ok`; missing field /
  `null` ⇒ `Err(return_validation)` with the pinned message shape.

## Fix sketch

Add a return-type leg to `invoke-static-checks.ts`'s existing cross-file
walk: for each literal-path `invoke<Schema>` site whose callee is in the
per-load-pass parse cache, compute the callee's final-value type (the same
inference the in-file path uses) and run `checkInvokeReturnType`; emit
`theta/parse/invoke-return-type-mismatch` and refuse registration exactly as
the in-file path does. No new diagnostic code (DIAG-2: the code exists in the
registry; this extends its firing surface to where the spec already pins it).

### Bug 0187 control repair (authorized 2026-09-20, operator)

The new load-time check REDS three rows of the protected sibling witness
`tests/subagent-return-depth-refusal.test.ts` (bug 0187): rows D, D2, and J
spawn `invoke<number>("./deepfin.theta")` / `invoke<number>("./pdeepfin.theta")`
where the callee returns a depth-7 array literal (`[[[[[[1]]]]]]`, inferred
`array<array<array<array<array<array<integer>>>>>>`). The `<number>` annotation
was an arbitrary VEHICLE to reach the runtime depth walk (the actual subject of
bug 0187) — and array-vs-number is precisely the incompatibility this fix now
correctly refuses at load, so the rows never reach the runtime walk.

**Repair (behaviour-preserving, authorized):** re-annotate rows D/D2/J to a
type COMPATIBLE with the callee's own inferred deep return (so
`T_calleeReturn ⊑ Schema` holds and load passes), leaving the depth-7 payload
unchanged so the runtime depth walk still fires and still refuses with the
canonical `JSON document depth exceeds 5` message. Bug 0187's coverage — "a
typed `invoke<Schema>` boundary runs the runtime depth walk over a too-deep
return" — is preserved exactly; only the annotation's type changes, not the
asserted runtime outcome. Ceiling #4 is a RUNTIME (AJV-boundary) check, not a
load-time annotation-depth check, so a deep-but-compatible annotation does not
trip a separate load refusal (row E, the `tools:`-surface control, is
unaffected and confirms the fix is scoped to the `invoke<Schema>` surface). If
the re-annotation unexpectedly reds any OTHER row or trips a load check, STOP
and report rather than widening further. A discharge note is appended to
`docs/bugs/0187-*.md` recording that its rows D/D2/J annotations were adjusted
by the 0473 fix with coverage preserved.

## Fix (0.484.0)

- What shipped:
  - `src/parser/type-layer-checks.ts` — extracted `buildTypeLayerWalk` (shared
    pass/env/checker construction, reused byte-identically by `checkTypeLayer`);
    added `TypeLayerWalk.inferFinalValuePayload` (the same `resolveReturnType` +
    withheld-binder deferral the in-file `checkSubagentReturnAnnotation` runs);
    exported `inferCalleeReturnPayload(body, file, paramsFields)`. Cross-namespace
    safety: returns `undefined` (defer to the runtime AJV net) when the inferred
    payload contains any `named` type — a callee-namespace name is not resolvable
    in the caller's `TypeEnv`, where the `⊑` relation runs (§"Static resolution").
  - `src/extension/production-composition.ts` — `resolveCalleeReturnType`
    (readBytes → `parseViaPassCache` → `inferCalleeReturnPayload`), wired as a
    dep into `checkInvokeStaticResolution` (parallel to `resolveCalleeArity`).
  - `src/extension/invoke-static-checks.ts` — threaded `resolveCalleeReturnType`
    through to `checkInvokeExprCallSurface`; header doc-comment bullet for the
    new return-type leg.
  - `src/extension/invoke-expr-call-surface.ts` — the return-type leg: for each
    literal-path `invoke<Schema>` site whose containment succeeds and whose
    `returnSchema` is written, resolve the callee's final-value payload and run
    the existing `checkInvokeReturnType` against the caller's `typeEnv`, emitting
    `theta/parse/invoke-return-type-mismatch` and refusing registration exactly
    as the in-file path does. No new diagnostic code (DIAG-2).
  - `tests/quality-loop-empty-tail-return-validation.test.ts` — cell A flipped
    from the tripwire to the spec-correct assertion (cross-file `invoke<R>` of an
    empty-tail callee FIRES `theta/parse/invoke-return-type-mismatch` and
    un-registers the caller); header comment rewritten to the landed state.
  - `tests/subagent-return-depth-refusal.test.ts` — operator-authorized bug-0187
    control repair: rows D/D2/J re-annotated `invoke<number>` →
    `invoke<array<array<array<array<array<array<number>>>>>>>` (compatible with
    the callee's inferred `array^6<integer>`), payloads and asserted runtime
    outcomes unchanged.
- Gates: witness `npx vitest run tests/quality-loop-empty-tail-return-validation.test.ts`
  → 5/5; full `npm test` → 690 files / 11589 passed / 0 failed (incl.
  `tests/subagent-return-depth-refusal.test.ts` 13/13); `npm run typecheck`
  clean; `npm run lint` clean.
- Review: 1 round. `bug-fix-reviewer` → 3 findings, all fidelity/prose, zero
  correctness/spec/behavioural: F1 (0187 discharge note missing), F2 (stale
  witness header describing the fix as unimplemented), F3 (0473 cell-A witness
  bullet still describing the tripwire). All resolved by a `bug-fix-fixer-light`
  doc/comment-only round; polish verified by gate-diff, confirmation round
  skipped. Residual R1 (non-blocking): a WHY sentence at the new leg's
  `annotationToCompatType` call site suggested for the next touch of that file.
- Verification: `bug-fix-verifier` → SOLID. Witness genuinely reds (neutralized
  the leg → cell A red with "expected [ 'caller', 'child' ] to not include
  'caller'", restored byte-exact → green); full suite green; live
  `tests/live/hardening/session-invoke-attach.test.ts` (real cross-file
  `invoke<Schema>` boundary) 2/2; lint + typecheck clean.
- Residuals: R1 above (WHY comment, non-blocking). The incompatible-schema
  refusal firing live has no dedicated live test — proven by the deterministic
  unit witness (cell A), the correct home for a parse-time check.
- Discharge notes appended: `docs/bugs/0187-untyped-subagent-return-boundary-no-depth-ceiling.md`
  (rows D/D2/J re-annotation, coverage preserved).
- Pinned dispositions / non-goals: named-payload callee returns defer to the
  runtime AJV net by design (cross-namespace guard); the `tools:`-callable
  surface is unaffected (return typing there is callee-tail inference, no
  author annotation to compare — row E control).
