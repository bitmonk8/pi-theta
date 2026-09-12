---
id: pending
title: Two private reimplementations of the §6 underlying-error coercion guard the `.message` read that the exported canonical version does not
lens: D4
status: intake
verdict: pending
locations:
  - src/diagnostics/placeholder.ts:247-273
  - src/extension/capability-probe.ts:220-245
  - src/extension/session-shutdown.ts:168-194
sites: 3
fix_scope: cross-module
d4_class: drift
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# Two private reimplementations of the §6 underlying-error coercion guard the `.message` read that the exported canonical version does not

## Observation
`src/diagnostics/placeholder.ts` exports `coerceUnderlyingString`, the canonical implementation of "the diagnostics underlying-error coercion" (its own doc cites "the §6 underlying-error coercion"), imported and used at six call sites across `extension/factory.ts`, `extension/production-theta-producer.ts`, `runtime/prompt-transport-mapping.ts`, `runtime/tool-registration.ts`, `runtime/tool-call-execute.ts`, and `runtime/tool-batch.ts`. `capability-probe.ts` and `session-shutdown.ts` each declare their own private, unimported copy of the identical algorithm (`coerceCause`, `coerceUnderlyingError`) instead of calling the exported one — and both private copies wrap the `.message` property read in its own `try`/`catch`, a guard the exported canonical version does not have.

## Evidence
Clone-map group G034 (renamed-only, 91 tokens) anchors the `capability-probe.ts` / `session-shutdown.ts` pair as mutual clones of each other. The third copy below, `placeholder.ts`'s exported `coerceUnderlyingString`, is not in the map (it is structurally shorter by one `try`/`catch` wrapper, which drops it out of the scanner's renamed-only match) but is named by both other copies' own doc comments as the specification they implement, and was found by reading.

Copy 1 (canonical, exported, widely used) — `src/diagnostics/placeholder.ts:247-273`:
```ts
/**
 * Coerce a caught thrown value to its underlying string per the §6
 * underlying-error coercion: when `v` is an object whose `.message` is a
 * string, that `.message`; otherwise `String(v)`, or the literal `<unreadable>`
 * when the `String(v)` coercion itself throws.
 */
export function coerceUnderlyingString(v: unknown): string {
  if (typeof v === "object" && v !== null) {
    const message = (v as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  try {
    return String(v);
  } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — Specific exception types only
    void e;
    return "<unreadable>";
  }
}
```

Copy 2 (private) — `src/extension/capability-probe.ts:220-245`:
```ts
/**
 * Coerce a caught thrown value to its underlying string per the diagnostics
 * underlying-error coercion (placeholder-rendering-b.md #underlying-error-
 * coercion): an object with a string `.message` yields that message; otherwise
 * `String(v)`, or the literal `<unreadable>` when either the `.message` access
 * or the `String(v)` coercion itself throws (PIC-6 — a hostile getter MUST NOT
 * escape the probe).
 */
function coerceCause(v: unknown): string {
  try {
    if (typeof v === "object" && v !== null) {
      const message = (v as Record<string, unknown>).message;
      if (typeof message === "string") {
        return message;
      }
    }
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    void e;
  }
  try {
    return String(v);
  } catch (e: unknown) { // allow-broad-catch: PIC-6 — pi-integration-contract/capability-probe.md
    void e;
    return "<unreadable>";
  }
}
```

Copy 3 (private) — `src/extension/session-shutdown.ts:168-194`:
```ts
/**
 * Coerce a caught throw to its underlying string per the diagnostics
 * underlying-error coercion (placeholder-rendering-b.md #underlying-error-
 * coercion): an object with a string `.message` yields that message; otherwise
 * `String(error)`, falling back to the literal `"<unreadable>"` when either the
 * `.message` access or the `String(...)` coercion itself throws (the same
 * `"<unreadable>"` convention `session-shutdown-reason-unknown`'s
 * `details.observed` applies, per the **Per-step isolation** paragraph).
 */
function coerceUnderlyingError(error: unknown): string {
  try {
    if (typeof error === "object" && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string") {
        return message;
      }
    }
  } catch (messageError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void messageError;
  }
  try {
    return String(error);
  } catch (coerceError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void coerceError;
    return "<unreadable>";
  }
}
```

Diff verdict: copies 2 and 3 are renamed-only clones of each other (matches G034). Both diverge from copy 1 at the same point: copies 2/3 wrap the `typeof v === "object" ... message` read in its own `try { … } catch { void e; }` block that copy 1 does not have — copy 1 lets a throwing `.message` getter propagate uncaught. The normative source both copies 2/3 cite by name, `docs/spec_topics/diagnostics/placeholder-rendering-b.md` (`#underlying-error-coercion`, lines 30-31), states the coercion as exactly two steps and pins the `<unreadable>` guard to *only* step 2 ("otherwise the underlying string is `String(v)`, or the literal text `<unreadable>` when the `String(v)` coercion itself throws") — it does not mention guarding the `.message` read.

## Why this is a problem
Three independent implementations of the exact same named algorithm exist where one (exported, already reused at six call sites) is meant to be canonical, yet the two un-shared private copies have each grown an extra defensive layer the canonical copy and the cited spec text do not have. What breaks on disagreement: called on a hostile caught value whose `.message` is a throwing getter, `coerceUnderlyingString` (copy 1) propagates that throw to its caller, while `coerceCause`/`coerceUnderlyingError` (copies 2/3) swallow it and fall through to `String(v)`/`<unreadable>`. `capability-probe.ts`'s own comment supplies an independent normative basis for its extra guard (PIC-6: "a hostile getter MUST NOT escape the probe"), but `session-shutdown.ts`'s comment cites only the "Per-step isolation" paragraph, which governs wrapping whole teardown *steps* in `try`/`catch` (`docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:15`) and does not itself state a requirement to guard a `.message` property read inside a coercion helper.

## Suggested direction (non-binding, optional)
`coerceUnderlyingString` is the already-exported, already-widely-used shared source of truth this hypothesis points at; whether `capability-probe.ts`'s stricter, PIC-6-justified variant should instead become the one shared implementation (with `session-shutdown.ts` adopting it too) is the kind of behaviour choice this filing defers to a human, not this lens.

## False-positive check
Re-read all three functions at the cited lines immediately before filing. Confirmed `coerceUnderlyingString` is exported and live via `grep -n "coerceUnderlyingString\|renderUnderlyingError"` across `src/` (hits in `extension/factory.ts`, `extension/production-theta-producer.ts`, `runtime/prompt-transport-mapping.ts`, `runtime/tool-registration.ts`, `runtime/tool-call-execute.ts`, `runtime/tool-batch.ts`). Confirmed `coerceCause`/`coerceUnderlyingError` are each called from within their own file (not dead). Read `docs/spec_topics/diagnostics/placeholder-rendering-b.md:27-32` directly to confirm the spec's own two-step coercion text guards only the `String(v)` step. Read `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:15`'s "Per-step isolation" paragraph directly and confirmed it addresses per-step `try`/`catch` wrapping of the five teardown sub-steps, not the internal shape of an error-coercion helper.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — all three excerpts, the G034 renamed-only clone-scan match (91 tokens, capability-probe.ts/session-shutdown.ts), the §6 spec's plain 2-step text (placeholder-rendering-b.md:30-31), and the "Per-step isolation" paragraph's unrelated scope all reproduce exactly, and the behavioural divergence (uncaught throw vs. swallowed-and-fallback) is real; but capability-probe.md's own self-failure text independently requires guarding a throwing `.message` read to hold PIC-6 ("MUST NOT throw"), so whether the canonical `coerceUnderlyingString` should gain the guard or the private copies should shed it is unresolved — a behaviour choice the filing itself correctly defers to a human (triage: claude-opus-5)
