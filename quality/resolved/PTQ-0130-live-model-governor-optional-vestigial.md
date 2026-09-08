---
id: PTQ-0130
title: LivePromptQueryModel's governor dependency is typed as possibly-undefined and guarded twice, while its single construction site passes a readonly field that is never undefined
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:5135-5136
  - src/extension/production-theta-producer.ts:5086
  - src/extension/production-theta-producer.ts:5645-5647
  - src/extension/production-theta-producer.ts:5885-5888
  - src/extension/production-theta-producer.ts:823-827
  - src/extension/production-theta-producer.ts:3244-3253
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# LivePromptQueryModel's governor dependency is typed as possibly-undefined and guarded twice, while its single construction site passes a readonly field that is never undefined

## Observation
`LivePromptQueryModel` declares its constructor dep and stored field as
`PromptToolLoopGovernor | undefined`, and both use sites re-test
`this.#governor !== undefined` before calling it. The class is module-private
and is constructed at exactly one place, which passes
`this.#promptToolLoopGovernor` — a `readonly` producer field initialised inline
with `new PromptToolLoopGovernor()` and never reassigned. The `undefined` half
of the union has no producer.

## Evidence
src/extension/production-theta-producer.ts:823-827 — the only value ever
supplied, a `readonly` field with an inline initialiser:

```ts
  /**
   * STAGE B (ceiling #2): bounds pi's native prompt-mode agentic tool loop to
   * the theta's `tool_loop.max_rounds`. Registered once on the host `pi` (lazily,
   * on the first prompt-mode query drive) and guarded by a per-drive active
   * state, so it never affects unrelated user turns.
   */
  readonly #promptToolLoopGovernor = new PromptToolLoopGovernor();
```

src/extension/production-theta-producer.ts:3244-3253 — the single construction
site of `LivePromptQueryModel`, passing that field:

```ts
    const liveModel = deps.userVisible
      ? new LivePromptQueryModel({
          pi: deps.pi,
          ctx: deps.ctx,
          clock: root.clock,
          queryText,
          readMessages: deps.readMessages,
          activeTools,
          thetaAbort: deps.thetaAbort,
          governor: this.#promptToolLoopGovernor,
```

src/extension/production-theta-producer.ts:5135-5136 — the constructor dep's
declared type:

```ts
    /** STAGE B / CIO-4: the round-cap governor for the driven free-phase turns. */
    readonly governor: PromptToolLoopGovernor | undefined;
```

src/extension/production-theta-producer.ts:5086 — the stored field:

```ts
  readonly #governor: PromptToolLoopGovernor | undefined;
```

src/extension/production-theta-producer.ts:5645-5647 and :5885-5888 — the two
guards on the never-taken `undefined` half:

```ts
    if (bound && this.#governor !== undefined) {
      this.#governor.begin(this.#maxRounds);
    }
```

```ts
      if (bound && this.#governor !== undefined) {
        this.#exhaustion = this.#governor.end();
      }
```

## Why this is a problem
Vestigial optionality: a declared possibility with no producer. `#governor`'s
`| undefined` arm can only be entered by a construction site that passes
`undefined`, and there is exactly one construction site, passing a field whose
declared type is `PromptToolLoopGovernor` (inline `new` initialiser, `readonly`,
no other assignment). The two `!== undefined` tests are therefore constant-true
whenever `bound` is true, and both bodies are the only governor calls in the
class — so the "governor absent" mode the type advertises (an ungoverned live
prompt turn) is not reachable and is not a mode anything can select. The
adjacent `respond?: RespondTurnContext` dep in the same constructor block
(line 5142) IS genuinely optional (the call site spreads it conditionally at
3266), which is what a real optional dep looks like here.

## Suggested direction (non-binding, optional)
Either narrow the dep and field to `PromptToolLoopGovernor` and drop the two
`!== undefined` conjuncts, or give the "no governor" mode a producer if an
ungoverned live turn is meant to be selectable.

## False-positive check
- `grep -rn "LivePromptQueryModel" --include=*.ts src tests extensions tools`:
  the class is declared at `production-theta-producer.ts:5077` with no
  `export`; the only `new LivePromptQueryModel(` is line 3245. Every other hit
  is prose in comments (`prompt-tool-loop-governor.ts:6`,
  `prompt-transport-mapping.ts:90`, `tests/b0288-…:9,60`). The b0288 test
  header itself records that the class "is not [exported]" and is reached only
  through the real producer, so no test constructs it with a different
  `governor`.
- `grep -n "governor\|#promptToolLoopGovernor" src/extension/production-theta-producer.ts`:
  `#promptToolLoopGovernor` appears at 827 (declaration+initialiser), 3235
  (`ensureRegistered`), and 3253 (the constructor argument) — no assignment
  anywhere, and it is declared `readonly`.
- Dynamic/string-keyed access: `#`-private ES fields admit none; searched for
  `"governor"` as a string literal and for bracket access in this file — no
  hits.
- Checked `deps.governor` is not re-derived: the constructor body assigns
  `this.#governor = deps.governor;` (5157) once and nothing else writes it.
- Not claimed dead code: `PromptToolLoopGovernor` and both call bodies are
  live; only the `undefined` arm of the dependency type and the two guards
  that test for it are claimed unreachable.

## Triage
verdict: confirmed — re-verified: every excerpt matches at the cited lines; `LivePromptQueryModel` is unexported with the sole `new` at 3245 passing the readonly inline-`new` `#promptToolLoopGovernor` (no reassignment, no dynamic/string-keyed access, tests reach it only via the real producer), and git 7030aa98 shows the `undefined` producer `governor: typed ? undefined : …` was retired when the typed exemption went, leaving both `!== undefined` guards constant-true while `bound: false` (5401) already selects the ungoverned mode (triage: claude-opus-5)
