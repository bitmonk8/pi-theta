---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: FollowUpSurfacingTurn.turnKind declares a "free_phase" arm that no producer in the repository ever constructs
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/query-respond-repair.ts:105-117
  - src/runtime/typed-query-validation.ts:286-289
  - src/runtime/typed-query-validation.ts:332
  - src/runtime/query-tool-loop.ts:814-821
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# FollowUpSurfacingTurn.turnKind declares a "free_phase" arm that no producer in the repository ever constructs

## Observation
`FollowUpSurfacingTurn` (the respond-repair follow-up's PIC-1 (d) surfacing
scalars) types its `turnKind` as `"forced_respond" | "free_phase"`. Every
construction of a `FollowUpSurfacingTurn` in the repository — production and
tests alike — sets `turnKind: "forced_respond"`. The single consumer read
falls back to `"forced_respond"` when the record is absent, so the expression
that consumes the field can only ever evaluate to `"forced_respond"` today.

## Evidence
src/runtime/query-respond-repair.ts:114-117 (declaration):
```ts
export interface FollowUpSurfacingTurn {
  readonly slotCountAtDispatch: number;
  readonly turnKind: "forced_respond" | "free_phase";
}
```

All constructions (search `turnKind` across all `*.ts` in src/, tests/,
extensions/, tools/ — every `FollowUpSurfacingTurn` producer listed):
src/runtime/typed-query-validation.ts:286-289:
```ts
          const surfacing: FollowUpSurfacingTurn = {
            slotCountAtDispatch: reply.slotCountAtDispatch ?? 0,
            turnKind: "forced_respond",
          };
```
src/runtime/typed-query-validation.ts:332:
```ts
          surfacing: { slotCountAtDispatch: 0, turnKind: "forced_respond" },
```
tests/query-tool-loop.test.ts:335 and
tests/inline-object-quoted-field-name-refusal.test.ts:815 likewise construct
`turnKind: "forced_respond"`. Zero `"free_phase"` constructions of this type
exist (the two `"free_phase"` literals in tests/runtime-event-channel.test.ts:118,122
target `computeMasked`'s own input type, runtime-event-channel.ts:106, a
different declaration).

The only read, src/runtime/query-tool-loop.ts:816-821:
```ts
  const followUpSurfacing = error.attempts >= 1 ? surfacing : undefined;
  const masked = computeMasked({
    kind: "validation",
    validationCause: error.cause,
    atTypedQueryResponse: true,
    turnKind: followUpSurfacing?.turnKind ?? "forced_respond",
```

## Why this is a problem
Speculative generality on a union arm: the `"free_phase"` alternative has zero
instantiations anywhere in the repository (production, tests, extensions,
tools), and the sole consumer neutralises absence to `"forced_respond"`, so
the arm models a case no code path can produce. `computeMasked`
(runtime-event-channel.ts:138) requires `turnKind === "forced_respond"` for
its only positive outcome, so even a hypothetical `"free_phase"` value could
only reproduce the already-default negative result. The arm widens the type
without a producer or a distinguishable consumer effect.

## Suggested direction (non-binding, optional)
Narrow `FollowUpSurfacingTurn.turnKind` to the one value producers mint (it
remains assignable to `computeMasked`'s wider input), or land a real
free-phase surfacing producer if one is specified; the current arm is carried
by no code.

## False-positive check
- Producer search: `turnKind` grepped across all `*.ts` under src/, tests/,
  extensions/, tools/ — 12 hits total, all enumerated above; every
  `FollowUpSurfacingTurn` construction is `"forced_respond"`.
- Type-confusion check: the two `"free_phase"` literals found are arguments to
  `computeMasked` in tests/runtime-event-channel.test.ts, exercising
  runtime-event-channel.ts:106's separate `turnKind` member — that module is
  outside this claim and its arm IS test-exercised.
- Dynamic access: no string-keyed access or spread-based construction of
  `FollowUpSurfacingTurn` found beyond the object literals cited.
- Test-only-caller rule: respected — no test constructs the `"free_phase"`
  arm either, so this is not test-reachable production code being misfiled.
- Assignability check: narrowing the member would not break the consumer —
  `followUpSurfacing?.turnKind ?? "forced_respond"` stays assignable to
  `computeMasked`'s `"forced_respond" | "free_phase"` input.

## Triage
verdict: questionable — all four excerpts and the zero-`free_phase`-producer search reproduce exactly, but the anchor is taste: the arm mirrors the spec-named two-valued scalar it feeds (`MaskedPredicateInput.turnKind`, runtime-event-channel.ts:106 / PIC-1 (d), whose `free_phase` IS exercised), the "no distinguishable consumer effect" claim is refuted (the `?? "forced_respond"` default is `computeMasked`'s positive-enabling arm, so a `free_phase` value would suppress an otherwise-emitted `["ceiling#2"]`), and the commit that introduced it (0dc66dcf) already logged this as non-blocking residual R2 in docs/bugs/0355-repair-terminal-masked-parent-slot-count.md:270 — a human should rule (triage: claude-opus-5)
verdict: questionable — independently re-verified at HEAD: declaration :114-117, both mints (typed-query-validation.ts:287/:332), consumer :816-822, `computeMasked` :106/:138 and the 12-hit `turnKind` grep all reproduce with zero `"free_phase"` producers (candidate enumerates 10 of 12 — omits query-tool-loop.ts:726 and runtime-event-channel.test.ts:100, and mislabels tests/query-tool-loop.test.ts:335 as a `FollowUpSurfacingTurn` construction; all three are `"forced_respond"` literals fed straight to `computeMasked`, so none is counter-evidence), and the arm is in fact structurally unreachable — the upstream producer seam `FollowUpRespondOutcome` (typed-query-validation.ts:106-118) carries only `slotCountAtDispatch`, so both mints hard-code the literal; but the anchor's second leg is false (the `??` default is `computeMasked`'s positive-enabling arm, so a produced `"free_phase"` would suppress an otherwise-reachable `["ceiling#2"]` — the arm is unused, not inert), leaving "type admits a value nobody mints" against a type that is by design the cached pair of PIC-1 (d)'s two spec-named scalars (runtime-event-channel.md:128/:132, mirroring `MaskedPredicateInput.turnKind` :106), and the git-intent check the candidate skipped shows the introducing fix 0dc66dcf's review flagged exactly this as non-blocking residual R2 (docs/bugs/0355:270) and kept it — a settled shape-vs-precision design call a human should rule (triage: claude-opus-5)
verdict: questionable — independently reproduced at HEAD (own grep of `turnKind` across src/, tests/, extensions/, tools/: same 12 hits, zero `free_phase` producers for `FollowUpSurfacingTurn`; both `computeMasked` call sites, query-tool-loop.ts:712 and :807, and the `?? "forced_respond"` fallback all resolve to the literal `"forced_respond"`, so the arm is genuinely unreachable, not just unproduced) but the anchor is a settled, reviewed design call rather than an oversight: docs/bugs/0355-repair-terminal-masked-parent-slot-count.md:270 shows the introducing fix's own review (0dc66dcf) named this exact trait — "`turnKind` union admits an unused `"free_phase"`" — as non-blocking residual R2 and the team kept it, and the shape deliberately mirrors PIC-1(d)'s normative two-valued `turnKind` scalar shared with `MaskedPredicateInput` (runtime-event-channel.md, PIC-1(d): "the surfacing turn kind (forced-respond vs. free-phase)"), which the candidate's filed False-positive checks never surface (no git-intent check run) — a human should rule (triage: claude-opus-5)
