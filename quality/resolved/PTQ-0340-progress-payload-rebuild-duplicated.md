---
id: PTQ-0340
title: child-tap.ts's theta_progress payload literal re-implements progress-tool.ts's clampAuthorMessage field rebuild instead of calling it
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/execution-status/progress-tool.ts:137-162
  - src/extension/execution-status/child-tap.ts:172-187
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260914130212
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-14
---

# child-tap.ts's theta_progress payload literal re-implements progress-tool.ts's clampAuthorMessage field rebuild instead of calling it

## Observation
`progress-tool.ts` exports `clampAuthorMessage` (lines 137-162): the single field-by-field rebuild of a `ProgressAuthorMessage` from a `{ message: string; scope?: unknown; done?: unknown; total?: unknown; dropped?: unknown }` source, anchored by a `HANDLED_PROGRESS_FIELDS satisfies Record<keyof ProgressAuthorMessage, true>` completeness ledger (lines 114-127). This function is the shared helper PTQ-0316's ratified fix (2026-09-14) created specifically so every hand-assembled `ProgressAuthorMessage` in this module goes through one place; `bus.ts`'s `clampFoldedAuthorMessage` (bus.ts:97-99) and `progress-tool.ts`'s own `clampProgressPayload` (169) both call it today. `child-tap.ts`'s `attachChildActivityTap` (the `theta_progress` wire-line decoder) still builds its own `ProgressAuthorMessage` object literal inline (lines 172-186), re-stating the identical message/scope/done/total assembly logic rather than calling `clampAuthorMessage` — even though its own local variable holding the untrusted fields is named `fields`, matching `clampAuthorMessage`'s own parameter name byte-for-byte.

## Evidence
Clone-map group **G014** — 100 tokens, identical — `src/extension/execution-status/child-tap.ts:172-186`, `src/extension/execution-status/progress-tool.ts:144-156`. Re-verified at both cited spans immediately before filing.

**Location 1 — `src/extension/execution-status/progress-tool.ts:137-162`** (`clampAuthorMessage`, full body):
```ts
export function clampAuthorMessage(fields: {
  readonly message: string;
  readonly scope?: unknown;
  readonly done?: unknown;
  readonly total?: unknown;
  readonly dropped?: unknown;
}): ProgressAuthorMessage {
  return {
    message: clampProgressField(fields.message, PROGRESS_MESSAGE_CLAMP_CHARS),
    ...(typeof fields.scope === "string"
      ? { scope: clampProgressField(fields.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
      : {}),
    // `done`/`total` are schema-enforced integers; they render verbatim.
    ...(typeof fields.done === "number" && Number.isInteger(fields.done)
      ? { done: fields.done }
      : {}),
```
```ts
    ...(typeof fields.total === "number" && Number.isInteger(fields.total)
      ? { total: fields.total }
      : {}),
    ...(typeof fields.dropped === "number" &&
    Number.isInteger(fields.dropped) &&
    fields.dropped > 0
      ? { dropped: fields.dropped }
      : {}),
  };
}
```

**Location 2 — `src/extension/execution-status/child-tap.ts:163-187`** (the `theta_progress` decoder's payload build; `carried` is computed just above the literal):
```ts
      const wireDropped =
        typeof fields.dropped === "number" &&
        Number.isInteger(fields.dropped) &&
        fields.dropped > 0
          ? fields.dropped
          : 0;
      const carried = wireDropped + tapDropped;
      tapDropped = 0;
      const payload: ProgressAuthorMessage = {
        // Defensive re-clamp + strip: the emitter clamped, but the wire is not
        // trusted to have done so (EXST-5's re-clamp obligation).
        message: clampProgressField(fields.message, PROGRESS_MESSAGE_CLAMP_CHARS),
        ...(typeof fields.scope === "string"
          ? { scope: clampProgressField(fields.scope, PROGRESS_SCOPE_CLAMP_CHARS) }
          : {}),
        // Non-conforming optional fields are discarded FIELD-WISE (PIC-74).
        ...(typeof fields.done === "number" && Number.isInteger(fields.done)
          ? { done: fields.done }
          : {}),
        ...(typeof fields.total === "number" && Number.isInteger(fields.total)
          ? { total: fields.total }
          : {}),
        ...(carried > 0 ? { dropped: carried } : {}),
      };
```

Diff verdict: **identical** for `message`/`scope`/`done`/`total` — byte-for-byte, including the shared identifier `fields` — matching the clone map's own "identical" verdict at its cited lines. Diverges only on `dropped`: Location 1 validates `fields.dropped` itself (`typeof … === "number" && Number.isInteger(…) && … > 0`); Location 2 gates on a pre-combined `carried` (`wireDropped + tapDropped`) instead. Tracing `carried`'s construction shows it is always a non-negative integer (`wireDropped` is `0` or an already-validated positive integer; `tapDropped` is a monotonically-incremented/reset local counter), so `Number.isInteger(carried) && carried > 0` always agrees with `carried > 0` alone — passing `dropped: carried` into `clampAuthorMessage` would be behaviour-preserving. The divergence is therefore not a behavioural disagreement today, only a duplicated implementation of the same four-field rule plus a differently-computed fifth field that could feed the same shared function unchanged.

## Why this is a problem
PTQ-0316 (fixed, ratified 2026-09-14) diagnosed exactly this duplication risk for `ProgressAuthorMessage`: "nothing about the type system stops [a hand-assembled site] from silently dropping a newly-added field," and its fix's stated goal was "ONE shared helper" so every rebuild site tracks `types.ts`'s field set together. That fix's own body explicitly named `child-tap.ts` ("Site 4") as a third hand-rolled site left **out** of its ratified scope ("No other edits"), on the grounds that at filing time Site 4 was "not clone-shaped" to the pre-fix functions — the pre-fix `bus.ts`/`progress-tool.ts` bodies used a bare `Number.isInteger(p.done)` guard, with no `typeof` prefix, unlike `child-tap.ts`'s `typeof x === "..." && Number.isInteger(x)` style. The fix's own chosen implementation of `clampAuthorMessage` adopted the `typeof`-prefixed guard style throughout (visible above) — which is what now makes it clone-similar to `child-tap.ts`'s copy, a fact the clone-scan tool independently confirms today (G014) and that did not hold at PTQ-0316's filing time.

`child-tap.ts`'s own `HANDLED_PROGRESS_FIELDS` ledger (lines 64-70, unaffected by this filing) only checks that every field NAME of `ProgressAuthorMessage` is mentioned somewhere in the file; it does not, and cannot, check that the VALIDATION EXPRESSION for each field agrees with `clampAuthorMessage`'s own. Counted: of the sites in `src/extension/execution-status/` that assemble a fresh `ProgressAuthorMessage` field-by-field, `clampAuthorMessage` (progress-tool.ts) is the one 2 of the type's other 2 known rebuild call paths now route through (`bus.ts:98`, `progress-tool.ts:169`); `child-tap.ts:172-186` is the one remaining independent copy. A future change to the message/scope/done/total clamp rules applied to `clampAuthorMessage` — now the designated shared site — would not reach `child-tap.ts`'s copy, or vice versa, letting the parent-regime bus and the child-regime wire decoder silently disagree about what counts as a valid `scope`/`done`/`total` for the identical PIC-74 wire contract both are required to honour identically.

## Suggested direction (non-binding, optional)
`child-tap.ts` already computes `carried` before building `payload`; calling the already-exported `clampAuthorMessage({ message: fields.message, scope: fields.scope, done: fields.done, total: fields.total, dropped: carried })` in place of the inline literal would let this third site ride the same ledger-anchored helper the other two already do. Named as a hypothesis only.

## False-positive check
Re-read both cited spans immediately before filing (quoted verbatim above). Re-ran `clone-scan.mjs map --files` against a manifest naming this shard's files plus `child-tap.ts`: reproduced G014 exactly at `progress-tool.ts:144-156` / `child-tap.ts:172-186`. Confirmed both copies live: `clampAuthorMessage` is called from `bus.ts:98` and `progress-tool.ts:169` (grep-confirmed); `child-tap.ts`'s literal feeds `publish({ type: "theta_progress", payload })`, the tap's sole channel for surfacing a wire `theta_progress` line to the parent bus. Grepped `src/extension/execution-status/` for `: ProgressAuthorMessage = {` and for `clampAuthorMessage(`: exactly the two call sites (`bus.ts:98`, `progress-tool.ts:169`) plus the one remaining inline literal (`child-tap.ts:172`) — no fourth reconstruction site; `footer-sink.ts`/`widget-sink.ts` only read an existing payload's fields to render a string, not reconstruct one, so they are excluded. Checked the do-not-refile list: PTQ-0292 (fixed) covered the wire encoder/decoder FIELD-SET pairing and was fixed by adding `child-tap.ts`'s `HANDLED_PROGRESS_FIELDS` ledger, untouched by this filing; PTQ-0316 (fixed) covered the `bus.ts`/`progress-tool.ts` pair and explicitly scoped `child-tap.ts` out at filing time for a reason (guard-shape mismatch) that the ratified fix's own implementation choice has since removed — this filing is a new, current fact about the post-fix code, not a re-file of either closed issue. Not a spec-repeated vector table: EXST-14/PIC-74 state the clamp rules in prose; the carve-out for a spec that itself repeats an enumeration does not apply to an object-construction routine.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — clone verified: clone-scan.mjs reproduces G014 exactly (progress-tool.ts:144-156 / child-tap.ts:172-186, identical), both copies live (bus.ts:98 and progress-tool.ts:169 call clampAuthorMessage; child-tap.ts:172's literal feeds publish()), no fourth reconstruction site (grep-confirmed), and the sole divergent `dropped` field is proven behaviour-preserving (`carried` is always a non-negative integer) — a mechanical dedupe (triage: claude-opus-5)
