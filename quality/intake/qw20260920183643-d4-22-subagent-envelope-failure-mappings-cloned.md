---
id: pending
title: subagent-envelope fail-closed mappings repeat InvokeInfraError-plus-diagnostic construction
lens: D4
status: intake
verdict: pending
locations:
  - src/runtime/subagent-envelope.ts:529-545
  - src/runtime/subagent-envelope.ts:584-603
  - src/runtime/subagent-envelope.ts:611-628
  - src/runtime/subagent-envelope.ts:932-945
  - src/runtime/subagent-envelope.ts:966-989
sites: 5
fix_scope: module
d4_class: clone
wave: qw20260920183643
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-20
---

# subagent-envelope fail-closed mappings repeat InvokeInfraError-plus-diagnostic construction

## Observation
`src/runtime/subagent-envelope.ts` owns the RFC-0006 fail-closed mappings that turn child-side envelope defects and parent-side envelope parse failures into the `InvokeInfraError` carrier consumed by `subagent-json-driver.ts`. Five exported builders (`mapEnvelopeParseFailure`, `mapEnvelopeSchemaSkew`, `mapExitWithoutEnvelope`, `mapTooDeepReturnValue`, `mapNonRepresentableReturnValue`) each construct the same `{ kind: "invoke_infra", message, callee_path, cause }` shape inline. The first four return an `EnvelopeFailureMapping` pairing that error with a `Diagnostic`; `mapTooDeepReturnValue` returns the error alone because ceiling-#4 depth refusal has no registry row.

## Evidence
`src/runtime/subagent-envelope.ts:529-545` (`mapEnvelopeParseFailure`):
```typescript
export function mapEnvelopeParseFailure(line: string, calleePath: string): EnvelopeFailureMapping {
  const summary = summarizeLine(renderHostDerivedTail(line));
  const message = `subagent return envelope parse failed: ${summary}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_ENVELOPE_PARSE_FAILED_CODE,
      message,
    },
  };
}
```

`src/runtime/subagent-envelope.ts:584-603` (`mapEnvelopeSchemaSkew`):
```typescript
export function mapEnvelopeSchemaSkew(
  observed: number,
  required: number,
  calleePath: string,
): EnvelopeFailureMapping {
  const message = `subagent return envelope schema skew: observed version ${observed}, parent requires ${required}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_ENVELOPE_SCHEMA_SKEW_CODE,
      message,
    },
  };
}
```

`src/runtime/subagent-envelope.ts:611-628` (`mapExitWithoutEnvelope`):
```typescript
export function mapExitWithoutEnvelope(exitDetail: string, calleePath: string): EnvelopeFailureMapping {
  // Fail-closed: a child that exits WITHOUT an envelope carries the exit detail
  // on the reconstructed `Err` — never a fabricated `Ok` value (PIC-59 / INV-5).
  const message = `subagent child exited without a return envelope: ${exitDetail}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "internal_error",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE,
      message,
    },
  };
}
```

`src/runtime/subagent-envelope.ts:932-945` (`mapTooDeepReturnValue`):
```typescript
export function mapTooDeepReturnValue(
  value: unknown,
  calleePath: string,
): InvokeInfraError | undefined {
  if (!wireFormExceedsDepthCap(value, 1)) {
    return undefined;
  }
  return {
    kind: "invoke_infra",
    message: DEPTH_VIOLATION_MESSAGE,
    callee_path: calleePath,
    cause: "return_validation",
  };
}
```

`src/runtime/subagent-envelope.ts:966-989` (`mapNonRepresentableReturnValue`):
```typescript
export function mapNonRepresentableReturnValue(
  value: unknown,
  calleePath: string,
): EnvelopeFailureMapping | undefined {
  const hit = firstNonFiniteNumber(value, 1, "");
  if (hit === undefined) {
    return undefined;
  }
  const location = hit.pointer.length > 0 ? ` at ${hit.pointer}` : "";
  const message = `subagent return value is not JSON-representable${location}: ${String(hit.value)}`;
  return {
    error: {
      kind: "invoke_infra",
      message,
      callee_path: calleePath,
      cause: "return_validation",
    },
    diagnostic: {
      severity: "error",
      code: SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE,
      message,
    },
  };
}
```

Diff verdict: **renamed-only / type-2 clone**. The object skeleton (`error: { kind: "invoke_infra", message, callee_path, cause }` plus, where present, `diagnostic: { severity: "error", code: <CODE>, message }`) is identical across all five sites. Only the local `message` assignment, the diagnostic `code` constant, and the `cause` literal change between copies.

## Why this is a problem
The PIC-59 / INV-5 contract requires every fail-closed child-side envelope refusal and parent-side envelope parse failure to surface as the same `InvokeInfraError` carrier shape so that `subagent-json-driver.ts` can route the result consistently. Because the carrier is assembled by hand in five places, a future shape change (adding a field, renaming `callee_path`, or changing `kind`) must be edited in every copy. A missed copy would silently drift the wire-visible error shape for one failure class, breaking downstream consumers that match on the carrier. The repetition is load-bearing, not incidental: the five functions share the same structural contract with the driver.

## Suggested direction (non-binding, optional)
Centralize the `InvokeInfraError` construction inside `src/runtime/subagent-envelope.ts`. A single helper that accepts `(message, cause, calleePath)` and returns the error object would remove the carrier-shape duplication; the four `EnvelopeFailureMapping` builders could then pair that helper with their diagnostic code and message. `mapTooDeepReturnValue` would return the helper directly (no diagnostic). The module is the natural home because all callers already live there.

## False-positive check
- Re-read every cited span immediately before filing; the excerpts above match the current file.
- Verified all five functions are live: `mapEnvelopeParseFailure`, `mapEnvelopeSchemaSkew`, and `mapExitWithoutEnvelope` are imported by `src/runtime/subagent-json-driver.ts`; `mapTooDeepReturnValue` and `mapNonRepresentableReturnValue` are imported by `src/extension/production-theta-producer.ts`.
- Searched `src/runtime` for an existing helper (`makeInvokeInfraError`, `buildEnvelopeFailure`, etc.) that could already be the shared home; none exists.
- Not in `tests/`, not generated, and not a spec-normative vector table repeated by the spec itself.
- The clone-scan map reported no groups for this file; the structural repetition was found by reading. The scanner likely missed it because the literal message strings and code constants differ between copies, splitting the common block below its token-window floor.

## Triage
