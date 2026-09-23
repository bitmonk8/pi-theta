---
id: pending
title: Stdlib parameter descriptor classification is duplicated between parse-time and runtime checks
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/stdlib-arg-diagnostics.ts:153-219
  - src/runtime/stdlib-signature.ts:116-131
sites: 2
fix_scope: cross-module
d4_class: parallel
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# Stdlib parameter descriptor classification is duplicated between parse-time and runtime checks

## Observation
`src/parser/stdlib-arg-diagnostics.ts` owns the parse-time `stdlib-arg-type-mismatch`
check for built-in method calls (`checkStdlibMethodCall`). After the arity check,
it walks `signature.params[i]` and classifies each `StdlibParamKind` descriptor
(`"string"`, `"integer"`, `"element"`, `"array"`) to decide whether the static
argument type is acceptable. `src/runtime/stdlib-signature.ts` owns the runtime
belt `assertStdlibArgumentKinds`, which walks the same `signature.params[i]` and
classifies the same four descriptors against the actual runtime argument values.
The two switch-like classifications are written in different idioms (type-layer
`checkCompatible` vs. JavaScript `typeof`/`Array.isArray`) but enumerate the same
discriminant set.

## Evidence
**Site 1 — `src/parser/stdlib-arg-diagnostics.ts:153-219` (`checkStdlibMethodCall`):**
```ts
  for (let i = 0; i < signature.params.length && i < argCount; i++) {
    const descriptor = signature.params[i] as StdlibParamKind;
    const argType = argTypeAt(i);
    // The caller could not prove a verdict for this slot (statically
    // unresolvable, or a withheld binder read out under `TypeEnv`) — defer to
    // the runtime belt rather than call `checkCompatible` on a manufactured
    // type (mirrors `checkInvokeArgTypes`'s slot-absent deferral).
    if (argType === undefined) {
      continue;
    }
    if (descriptor === "array") {
      // `concat(other)` accepts ANY `array<U>` — there is no single concrete
      // sup type `checkCompatible` could be asked about, so the array-ness
      // test is inlined here instead of resolved through the compatibility
      // relation. An unresolved `named` argument type defers, exactly as
      // `checkCompatible` would for every other descriptor.
```

**Site 2 — `src/runtime/stdlib-signature.ts:116-131` (`assertStdlibArgumentKinds`):**
```ts
  for (let i = 0; i < args.length; i += 1) {
    const kind = signature.params[i];
    const arg = args[i] as ThetaValue;
    if (kind === "string" && typeof arg !== "string") {
      throw new StdlibMethodArgumentKindDefectError(member, i, "a string", arg);
    }
    if (kind === "integer" && (typeof arg !== "number" || !Number.isInteger(arg))) {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an integer", arg);
    }
    if (kind === "array" && !Array.isArray(arg)) {
      throw new StdlibMethodArgumentKindDefectError(member, i, "an array", arg);
    }
    // "element" / undefined: unchecked — includes/indexOf are total over any
    // argument kind (V2c valuesEqual), and an omitted optional arg has no
    // descriptor to check.
  }
```

**Diff verdict:** parallel (not a token clone). Both sites read the same
`StdlibParamKind` discriminant (`src/runtime/stdlib-signature.ts:77`), but the
parser side maps each descriptor to a static `CompatType` expectation and the
runtime side maps it to a JavaScript value predicate.

## Why this is a problem
The `StdlibParamKind` type is the shared source of truth, yet the *semantics* of
each descriptor are encoded twice: once for static type checking and once for
runtime kind assertion. When the descriptor set or the classification rules for
a descriptor change, both passes must be updated together or the same method call
will be accepted by one layer and rejected by the other. For example, a new
`"boolean"` descriptor would need both a static `prim "boolean"` expectation and
a runtime `typeof arg !== "boolean"` guard; adding it to only one side creates
either a latent runtime `StdlibMethodArgumentKindDefectError` for code the parser
accepted, or a false-positive `stdlib-arg-type-mismatch` for code the runtime
would have allowed. The static side's own comment explicitly defers unresolved
static types to the runtime belt, so the two passes are intended to agree.

## Suggested direction (non-binding, optional)
The natural shared source of truth is `src/runtime/stdlib-signature.ts`, which
already owns the `StdlibParamKind` type and the runtime classification. A
single descriptor-to-check helper could be owned there and adapted by the parser
for `CompatType` expectations, so the four-arm classification is maintained in
one place.

## False-positive check
- Re-read both cited spans immediately before filing; both are live production code.
- Verified `checkStdlibMethodCall` is called from `src/parser/type-layer-operand-checks.ts`
  and `assertStdlibArgumentKinds` is called from `src/runtime/stdlib-{array,string,object}.ts`.
- `StdlibParamKind` is defined once at `src/runtime/stdlib-signature.ts:77`; only
  `src/parser/stdlib-arg-diagnostics.ts` and `src/runtime/stdlib-signature.ts`
  contain code that switches over it.
- No `tests/` files are involved; no spec-normative vector table is repeated;
  the code is not generated.
- Searched `quality/intake/` and `quality/resolved/` for existing D4 filings
  matching `checkStdlibMethodCall`, `assertStdlibArgumentKinds`, or `StdlibParamKind`
  parallel classification; none found (PTQ-1119, PTQ-1215, PTQ-1216, and
  PTQ-1301 target unrelated stdlib dispatcher/size concerns).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified with one correction; the shared source of truth is a design decision for a human ruling: excerpts reproduce at stdlib-arg-diagnostics.ts:153-219 and stdlib-signature.ts:116-131, clone-scan map lists no group (parallel, not a token clone), both sites are live (type-layer-operand-checks.ts:206; stdlib-array/string/object.ts belts) and `grep StdlibParamKind src extensions tools tests` confirms only these two files read the discriminant; the parser classifies all 4 descriptors (array arm :162-189, element→elementType, string/integer via a two-way prim ternary :190-193) while the runtime enforces 3 of 4 — `"element"` is deliberately unchecked per :128-130, so "classifies the same four descriptors" overstates the runtime side; the drift hazard is nonetheless mechanical (neither site is an exhaustive switch, so widening the union compiles silently on both — the parser ternary would map a new descriptor to `integer`, the runtime would skip it) and the runtime header :96-99 states the shared type exists "so the runtime and parse checks never drift"; not a duplicate (PTQ-1119 dispatcher clone, PTQ-1215 D9 breakdown, PTQ-1216/1217 D9 misplacement target other root causes); whether a static CompatType projection and a runtime value predicate should be fused behind one descriptor table needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified with corrections; the shared source of truth is a design decision for a human ruling: both excerpts reproduce verbatim (stdlib-arg-diagnostics.ts:153-219, stdlib-signature.ts:116-131), clone-scan map on stdlib-arg-diagnostics.ts reports no clone groups (parallel, not a clone), and grep of StdlibParamKind across src/extensions/tools/tests hits only these two files; both sites are live (checkStdlibMethodCall ← type-layer-operand-checks.ts:206; assertStdlibArgumentKinds ← assertStdlibMemberArguments at stdlib-signature.ts:156, which stdlib-array/string/object.ts import — the filing's "called from stdlib-{array,string,object}.ts" skips that hop); coverage is 4 descriptor arms statically (array inline, element→elementType, string/integer via a two-way ternary) vs 3 enforced at runtime with "element" deliberately unchecked (:128-130), so "classifies the same four" overstates the runtime side; the drift hazard is mechanical (neither site is exhaustive — a new union member silently maps to integer in the parser ternary and is skipped at runtime) and the header :96-99 states the shared descriptors exist so parse and runtime "never drift"; not a duplicate of resolved PTQ-1119 (dispatcher clone), PTQ-1215 (D9 breakdown), PTQ-1216/1217 (D9 misplacement) (triage: claude-opus-5-5)
verdict: questionable — accounting verified with one correction; the shared source of truth is a design decision for a human ruling: both excerpts match at stdlib-arg-diagnostics.ts:153-219 and stdlib-signature.ts:116-131; clone-scan map reports no clone groups, so this is parallel code, not a token clone; `StdlibParamKind` appears only in these two files across src/extensions/tools/tests; both sites are live (type-layer-operand-checks.ts:206; the belt runs through assertStdlibMemberArguments :156, which stdlib-array.ts:89, stdlib-string.ts:73 and stdlib-object.ts:136 call); the parser handles all 4 descriptors, but the runtime checks only 3 because "element" is deliberately left unchecked (:128-130), so "classifies the same four" overstates the runtime side; the drift risk is real and mechanical: neither site uses an exhaustive switch, so a new union member would compile silently, the parser's two-way ternary at :190-193 would treat it as integer, and the runtime would skip it; the header at :96-99 says the shared descriptors exist so the two checks "never drift"; not a duplicate of PTQ-1119/1301 (dispatcher clones), PTQ-1215 (D9 breakdown), PTQ-1216/1217/1271 (D9 misplacement) or PTQ-0024 (doc placement) (triage: claude-opus-5-5)
