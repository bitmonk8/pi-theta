---
id: PTQ-1444
title: subagent ok-envelope depth/representability guard cloned in root and fn entry
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/extension/subagent-spawn-regime.ts:950-968
  - src/extension/subagent-spawn-regime.ts:1216-1233
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260923035927
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# subagent ok-envelope depth/representability guard cloned in root and fn entry

## Observation
`SubagentSpawnRegime` writes the child-side `theta_result` envelope on a successful callee return in two places: `#driveSubagentRootRegime` for a theta-body root invocation and `#driveSubagentFnEntry` for a `subagent fn` entry. Both sites run `mapTooDeepReturnValue`, then `mapNonRepresentableReturnValue` when depth is within the cap, then emit an `Err` envelope for either refusal or serialize the `Ok` envelope with forwarded enum tags, emit the outcome event, and request visible-child shutdown. The two blocks are type-2 clones: the same guard ordering and envelope emission, differing only in the local value identifier (`terminal.value` vs `payload`) and the diagnostic emitter used for the non-representable refusal.

## Evidence

`src/extension/subagent-spawn-regime.ts:950-968` (root theta ok arm):

```typescript
        const tooDeep = mapTooDeepReturnValue(terminal.value as unknown, calleePath);
        const nonRepresentable =
          tooDeep === undefined
            ? mapNonRepresentableReturnValue(terminal.value as unknown, calleePath)
            : undefined;
        if (tooDeep !== undefined) {
          emitErr(tooDeep, "mint");
        } else if (nonRepresentable !== undefined) {
          (this.#input.emitDiagnostic ?? ((): void => {}))(nonRepresentable.diagnostic);
          emitErr(nonRepresentable.error, "mint");
        } else {
          // Bug 0342 §Fix (D3 carriage): record each enum-boxed position's
          // declaring tag before this envelope collapses the carrier to its
          // bare wire string, so the parent's decode can restore it after the
          // ordinary immediate-callee retag (`#validateInvokeReturn`).
          emitEnvelope(
            serializeOkEnvelope(
              terminal.value as unknown,
              collectForwardedEnumTags(terminal.value as ThetaValue),
            ),
          );
          // RFC 0012 §7: outcome BEFORE the shutdown request, so a
          // subscriber can enqueue its last report before the host begins
          // deferring toward shutdown.
          emitOutcome("ok");
```

`src/extension/subagent-spawn-regime.ts:1216-1233` (`subagent fn` ok arm):

```typescript
      const payload = isResultValue(value) && value.ok ? value.value : value;
      const tooDeep = mapTooDeepReturnValue(payload as unknown, calleePath);
      const nonRepresentable =
        tooDeep === undefined ? mapNonRepresentableReturnValue(payload as unknown, calleePath) : undefined;
      if (tooDeep !== undefined) {
        emitErr(tooDeep, "mint");
      } else if (nonRepresentable !== undefined) {
        emitDiagnostic(nonRepresentable.diagnostic);
        emitErr(nonRepresentable.error, "mint");
      } else {
        emitEnvelope(
          serializeOkEnvelope(payload as unknown, collectForwardedEnumTags(payload as ThetaValue), tail),
        );
        emitOutcome("ok");
        this.#requestVisibleChildShutdown(ctx);
      }
```

Diff verdict: **renamed-only**. The root arm uses `terminal.value` and `(this.#input.emitDiagnostic ?? ((): void => {}))`; the `subagent fn` arm uses `payload` and the local `emitDiagnostic` alias. Everything else — the depth-first ordering, the `undefined` short-circuit, the diagnostic-then-`emitErr` sequence, the `serializeOkEnvelope` call with `collectForwardedEnumTags`, the `emitOutcome("ok")`, and the shutdown request — is the same. No clone-map group exists for this shard.

## Why this is a problem
The guard is load-bearing: PIC-59's fail-closed return boundary (subagent.md) must refuse a terminal `Ok` payload that is too deep or carries a non-finite number anywhere inside it. `mapTooDeepReturnValue` must run before `mapNonRepresentableReturnValue` so a deep payload is refused with ceiling #4's canonical message and no diagnostic, while a within-cap non-finite payload is refused with the registered `subagent-return-value-not-representable` diagnostic. If one of the two child-entry paths drifts — for example by reversing the order, omitting the enum-tag collection, or dropping the diagnostic — the same `.theta` callable would accept or refuse values differently depending on whether it was invoked as a root subagent or as a `subagent fn`. The root arm is the authoritative right copy: it received the bug-0187 depth-first fix (commit 940206cb) and its surrounding comment explicitly pins the ordering rationale.

## Suggested direction (non-binding, optional)
The natural shared home is a private helper inside `SubagentSpawnRegime` (e.g. `#emitOkEnvelope(payload, calleePath, tail, emitEnvelope, emitErr, emitOutcome, emitDiagnostic, ctx)`) that both `#driveSubagentRootRegime` and `#driveSubagentFnEntry` call.

## False-positive check
- Re-verified both cited spans in current code; the ok-arm shape matches.
- Both sites are live: `#driveSubagentRootRegime` is the child-side subagent-root drive; `#driveSubagentFnEntry` is called from `#driveSubagentFnChild` at :1323.
- `grep "mapTooDeepReturnValue"` across `src/extension` found only these two call sites in the subagent-spawn-regime module plus references in runtime modules; no other production site duplicates the depth-then-representability ordering for envelope writing.
- The blocks are not spec-normative vector tables; subagent.md describes the fail-closed requirement, not the inline guard expression.
- Not tests/.
- No prior filing matches this two-site clone.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
