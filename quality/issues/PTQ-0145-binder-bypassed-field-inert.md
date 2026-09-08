---
id: PTQ-0145
title: ChildParamsIntake's binderBypassed field is typed as the literal true, set at its single construction site, and read by no production code
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-params.ts:270-273
  - src/runtime/subagent-params.ts:298-300
  - src/extension/production-theta-producer.ts:2873-2879
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ChildParamsIntake's binderBypassed field is typed as the literal true, set at its single construction site, and read by no production code

## Observation
The success arm of `ChildParamsIntake` carries a third member,
`binderBypassed`, whose declared type is the literal `true`. The only place
the arm is constructed sets it to `true`. The arm is already discriminated by
`ok: true`, and the only production consumer of `intakeChildParams` reads
`ok`, `diagnostic`, `error` and `params` and never `binderBypassed`. The
field therefore admits exactly one value and has no reader outside a single
test assertion that compares it against that same literal.

## Evidence
src/runtime/subagent-params.ts:270-273 — the declaration; `ok: true` already
discriminates the arm, and `binderBypassed` is pinned to one value by its type:

```ts
/** The child-side intake outcome: bound params (binder bypassed) or a fail-closed refusal. */
export type ChildParamsIntake =
  | { readonly ok: true; readonly params: Record<string, unknown>; readonly binderBypassed: true }
  | { readonly ok: false; readonly error: InvokeInfraError; readonly diagnostic: Diagnostic };
```

src/runtime/subagent-params.ts:298-300 — the single construction site:

```ts
  // PIC-60: the marshalled path never re-enters the binder — the validated params
  // are bound directly with the binder BYPASSED entirely.
  return { ok: true, params: parsed as Record<string, unknown>, binderBypassed: true };
```

src/extension/production-theta-producer.ts:2873-2879 — the only production
consumer of the intake result; it reads four members and not `binderBypassed`:

```ts
    if (!intake.ok) {
      (this.#input.emitDiagnostic ?? ((): void => {}))(intake.diagnostic);
      emitErr({ ...intake.error, callee_path: calleePath } as unknown as QueryError, "mint");
      return;
    }
    // `intake.params` is `undefined` when no params carrier was marshalled (a
    // callee with no `params:` / a no-arg invocation) — an empty binding set.
```

Full reference set for the identifier:

```
$ grep -rn "binderBypassed" --include=*.ts src extensions tools tests
src/runtime/subagent-params.ts:272:  | { readonly ok: true; readonly params: Record<string, unknown>; readonly binderBypassed: true }
src/runtime/subagent-params.ts:300:  return { ok: true, params: parsed as Record<string, unknown>, binderBypassed: true };
tests/subagent-params-marshalling.test.ts:269:      expect(intake.binderBypassed).toBe(true);
```

## Why this is a problem
Vestigial field with every site cited: the declared type is the singleton
literal `true`, so the field cannot distinguish any two intake outcomes — it
carries no information by construction, and the arm it sits on is already
discriminated by `ok`. There is exactly one construction site and it writes
the only value the type admits. The single read in the repository is a test
assertion of that literal against itself, so no code branches on it and no
consumer can observe a different value. This is the "field whose value is
never read" case rather than a reachability question: the field's information
content is zero regardless of who calls the function.

## Suggested direction (non-binding, optional)
The PIC-60 fact the field is meant to record — that the marshalled path never
re-enters the binder — is already stated by the comment above the return and
is a property of the function, not of an individual outcome value.

## False-positive check
- `grep -rn "binderBypassed" --include=*.ts src extensions tools tests` — three
  hits total: the declaration, the single construction site, and one test
  assertion. No other reader.
- `grep -rn "binderBypassed" --include=*.md docs` and a string-keyed search
  (`grep -rn '"binderBypassed"\|\x27binderBypassed\x27' src extensions tools tests`)
  — no hits, so there is no dynamic or serialized access to the member.
- `grep -rn "ChildParamsIntake" --include=*.ts src extensions tools tests` —
  the type is referenced by `production-theta-producer.ts` (import and the
  `#intakeSubagentRootParams` return type) and by `subagent-params.ts` itself;
  no re-export barrel republishes it.
- Traced the production consumer (`production-theta-producer.ts:2871-2890`):
  it destructures `ok`, `diagnostic`, `error`, `params` only.
- Not filed as deadness of `intakeChildParams`, which has a live production
  caller; the claim is confined to the one member whose type admits a single
  value.

## Triage
verdict: confirmed — reproduced every claim: singleton-`true` member on an arm already discriminated by `ok`, one write site, no production reader in all of git history, sole read a tautological test assertion, no dynamic/re-export access; unlike every other literal-typed member in src/ it discriminates nothing (triage: claude-opus-5)
