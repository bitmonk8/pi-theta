---
id: pending
title: emitTopLevelErrNote's comment describes its optional event parameter as a not-yet-used forward hook, while the method's only caller has threaded the origin event since bug 0399
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1712-1719
  - src/extension/theta-composition-producer.ts:580-585
  - src/runtime/statement-executor.ts:2398-2403
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# emitTopLevelErrNote's comment describes its optional event parameter as a not-yet-used forward hook, while the method's only caller has threaded the origin event since bug 0399

## Observation
`emitTopLevelErrNote(thetaName, error, event?)` reconstructs a `RuntimeEvent`
from the leaf error unless a caller supplies one (`event ?? (() => { … })()`).
The comment above that expression describes the parameter in the future tense —
a "forward hook" whose literal-value guarantee arrives "once an origin-site
emission threads its exact value here". The method's single call site does
thread it: `theta-composition-producer.ts` passes `execution?.originEvent`, a
field the executor populates from the terminal flow's own `event`.

## Evidence
src/extension/production-theta-producer.ts:1712-1719 — the comment:

```ts
    // This boundary construction IS the origin emission of record for this
    // path until the wider origin-site always-log surface lands (a filed
    // residual / non-goal — no `topLevelCascade: true` caller exists today).
    // The optional `event` is the forward hook: once an origin-site emission
    // threads its exact value here, slash-invocation.md:63's "same value"
    // holds literally instead of by reconstruction. Mirror the renderer's leaf
    // walk and reuse the shared note builder rather than forking a second
    // RuntimeEvent constructor.
```

src/extension/theta-composition-producer.ts:580-585 — the only call site,
threading the origin event:

```ts
          if (!terminal.ok) {
            deps.emitTopLevelErrNote(
              theta.slashName,
              terminal.error as unknown as QueryError,
              execution?.originEvent,
            );
          }
```

src/runtime/statement-executor.ts:2398-2403 — the producer of that field, which
carries the terminal flow's own `RuntimeEvent`:

```ts
      return {
        outcome: "fail",
        result: functionResult("fail", null),
        error: flow.error,
        ...(flow.event !== undefined ? { originEvent: flow.event } : {}),
      };
```

`grep -rn "emitTopLevelErrNote" --include=*.ts src extensions tools` → the
interface member (`theta-composition-producer.ts:376`), this implementation
(`production-theta-producer.ts:1706`), the single call
(`theta-composition-producer.ts:581`), and two comment mentions
(`production-theta-producer.ts:849`, `invoke-provenance-ledger.ts:4`). There is
no second call site the comment could be reserving the hook for.

## Why this is a problem
Historical narration in the future tense that the code has overtaken. The
sentence tells a reader that the `event` parameter is an unexercised hook and
that the note's `details.event` is therefore a reconstruction on this path;
today the parameter is supplied by the one caller and the reconstruction arm is
the fallback, not the norm. That inverts the reading of the `event ?? (…)()`
expression directly beneath it, which is the expression a reader consults to
answer "where does this note's `RuntimeEvent` come from". `git blame` dates the
comment to `094f1dc2` (2026-09-02, "fix(bug-0383): SLSH-4 note details carry a
real RuntimeEvent — v0.360.0") and both the caller's third argument and the
executor's `originEvent` field to `ec2a8ac2` (2026-09-03, "fix(bug-0397, bug
-0399): binder-failure notes carry sourced RuntimeEvents; boundary event
completes — v0.392.0 / v0.393.0"), so the hook was wired the day after the
comment claimed it was not.

## Suggested direction (non-binding, optional)
Restate the paragraph in the present tense — the origin event arrives from the
caller when the terminal flow carried one, and the leaf-walk reconstruction is
the fallback for the flows that do not.

## False-positive check
- Confirmed the third argument is a real value channel and not always
  `undefined`: `grep -rn "originEvent" --include=*.ts src` → the declaration
  `src/runtime/statement-executor.ts:248`, the population at `:2402` (guarded
  on `flow.event !== undefined`), the caller at
  `theta-composition-producer.ts:584`, and a comment at `:558`. `flow.event`
  itself is threaded from `OperationResult.event` through
  `statement-executor.ts:311, 522, 1052, 1294`, so a terminal typed-query
  `validation` outcome supplies it.
- Confirmed the call-site count: the grep above shows exactly one call. Tests
  also call the member directly (`tests/b0383-slsh4-note-details-event.test.ts:180,
  235, 248, 263, 286, 315` and `tests/b0399-…:216, 238, 259, 277, 623`),
  including one three-argument call at `b0399:623` — witness callers, not
  production ones, so they are cited only as corroboration that the parameter
  is exercised.
- Verified this is narration, not dead code: the `event ?? (…)` expression and
  both of its arms are live; only the comment's tense/claim is at issue.
- Checked already-filed intake: the standing producer findings cover
  line-citation drift, detached doc comments, "test thetas" narration and the
  RFC-0005 adapter satellites; the ledger finding
  (qw20260907130901-d2-06-ledger-errnote-call-site-count-stale) is about
  `invoke-provenance-ledger.ts`'s header call-site count, not this comment.
- Git intent: `git blame -L 1712,1719` → `094f1dc2` (2026-09-02);
  `git blame -L 581,585 src/extension/theta-composition-producer.ts` and
  `-L 2398,2403 src/runtime/statement-executor.ts` → `ec2a8ac2` (2026-09-03).
  The comment predates the wiring, so this is drift rather than a deliberate
  statement about a hook left unused.

## Triage
