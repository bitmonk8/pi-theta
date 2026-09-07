---
id: pending
title: emitNestedShapeDiagnostic's doc says its serialiser-throw arm can emit the three-token per-invocation fallback, but that arm's only emit is the two-token form
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/session-shutdown.ts:375-383
  - src/extension/session-shutdown.ts:411-430
  - src/extension/session-shutdown.ts:345-353
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# emitNestedShapeDiagnostic's doc says its serialiser-throw arm can emit the three-token per-invocation fallback, but that arm's only emit is the two-token form

## Observation
`emitNestedShapeDiagnostic`'s doc comment states that on a serialiser throw the
catch arm emits the two-token `` `${code} ${detailsEventReason}` `` form "or the
three-token `` `${code} ${entry.theta} <unreadable>` `` form for the
per-invocation note". The serialiser-throw catch arm in the body contains a
single `sink.emit`, unconditionally the two-token form, and never reads `entry`.
The inline comment immediately above that arm says the opposite of the doc: the
two-token form is emitted "for both nested-shape codes". The three-token form is
built only by `emitConstructionSiteFallback`, which the same doc comment
separately attributes to the construction-site wrap.

## Evidence
src/extension/session-shutdown.ts:375-383 — the doc comment:

```ts
/**
 * Emit a nested-shape teardown-handler diagnostic (`runtime-degraded` /
 * `cancelled-by-session-shutdown`). On a serialiser throw the catch arm emits
 * the two-token `` `${code} ${detailsEventReason}` `` form, or the three-token
 * `` `${code} ${entry.theta} <unreadable>` `` form for the per-invocation note
 * (PIC-25). A throw out of the payload-construction site is caught by a
 * dedicated self-wrap that emits the `` `${code} <unreadable>` `` /
 * `` `${code} ${entry.theta} <unreadable>` `` fallback and swallows an inner
 * `console.error` throw (PIC-26/27). Count is invocation-site framed (PIC-28).
```

src/extension/session-shutdown.ts:411-425 (the arm runs to :430) — the arm the
first sentence describes, with its own contradicting inline comment:

```ts
  // Wrapped serialisation-and-emission sequence (PIC-24/25/27): on a serialiser
  // throw the catch arm emits the two-token `${code} ${detailsEventReason}` form
  // — preserving the `details.event.reason` dedup discriminator — for both
  // nested-shape codes; a throw out of `console.error` is swallowed with no
  // retry.
  let serialiseOk = false;
  try {
    const line = sink.serialise(diagnostic);
    serialiseOk = true;
    sink.emit(line);
  } catch (emitError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/diagnostic-emission-isolation.md
    void emitError;
    if (!serialiseOk) {
      try {
        sink.emit(`${code} ${detailsEventReason}`);
```

src/extension/session-shutdown.ts:345-353 — the only builder of the three-token
form, reached from the construction-site wrap (:401-409), not from the
serialiser-throw arm:

```ts
function emitConstructionSiteFallback(
  sink: EmissionSink,
  code: NestedShapeEmission["code"],
  entry: ActiveInvocationEntry | undefined,
): void {
  const fallback =
    entry !== undefined
      ? `${code} ${entry.theta} <unreadable>`
      : `${code} <unreadable>`;
```

## Why this is a problem
Narration that the annotated code contradicts, and that the same function
contradicts twice over: the doc's first sentence promises a fallback form the
serialiser-throw arm has no branch to produce (the arm neither reads `entry` nor
calls `emitConstructionSiteFallback`), and the inline comment fifteen lines
below states the two-token form applies "for both nested-shape codes". `git
blame` shows the doc sentence came from the tests-task declaration `643fe3b47`
(2026-07-01) and the implementing arm plus its inline comment from
`2f4ae337e` (same day), so the three-token clause describes an intended arm that
the paired implementation never grew. A reader reconciling operator dedup keys
against the emitted strings has to run the function to learn which of the two
in-file statements holds.

## Suggested direction (non-binding, optional)
Make the doc's fallback-form sentence agree with the single emit in the
serialiser-throw arm (leaving the construction-site sentence, which already
matches `emitConstructionSiteFallback`, untouched).

## False-positive check
- Read the whole function body (:388-431): exactly two `sink.emit` reach points
  exist — `emitConstructionSiteFallback` via the construction wrap
  (:401-409) and the two-token literal at :425. No `entry`-conditional emit
  exists in the serialiser-throw arm.
- Checked the callers for a second implementation that might supply the
  three-token form on a serialiser throw: `emitNestedShapeDiagnostic` is called
  from `emitCancelledBySessionShutdownNote` (:479-484) with `entry` set, and
  that caller adds no emit of its own; its own construction catch delegates to
  `emitConstructionSiteFallback` (:476).
- Corroborated the behaviour against the current tree's witness: the
  per-invocation serialiser-throw case in tests/session-shutdown.test.ts:533-545
  asserts `` `${CANCELLED_BY_SESSION_SHUTDOWN_CODE} reload` `` (two tokens) with
  its own inline comment "Two-token reason form on serialiser throw preserves
  the reason discriminator"; the three-token form is asserted only for the
  construction-site case (:566-580). No claim is filed about the test itself.
- Not dead code: the arm runs on every serialiser throw for both nested-shape
  codes; this is a comment/code mismatch, not unreachable code.
- Duplicate check: `grep -rn "three-token\|two-token" quality/intake` → no
  existing candidate mentions either form;
  qw20260907183353-d2-07-extension-modules-stub-narration-stale.md cites
  session-shutdown.ts:385-386 (the `V9g-T stub` sentence in the same doc block)
  but not the fallback-form sentence at :377-380.
- History intent: `git blame -L 375,384` → `643fe3b47` (2026-07-01, tests-task
  declaration) with `2bc691576` (the loom→theta rename) on the two identifier
  lines; `git blame -L 411,430` → `2f4ae337e` (2026-07-01, the implementation).

## Triage
