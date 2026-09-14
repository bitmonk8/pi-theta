# Bug 0473 — the spec's cross-file static `invoke<Schema>` return-type check is unimplemented: a statically-resolvable literal-path callee with an incompatible (or empty-tail `null`) final value loads with zero diagnostics, and the mismatch only surfaces at runtime as `return_validation`

- **Status:** open.
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
- cell A — TRIPWIRE: pins today's cross-file zero-diagnostic behaviour and
  REDDENS the day a cross-file return check lands (update it and this bug
  together).
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
