---
id: PTQ-0158
title: "#buildBinderSessionContext re-tests walk.applies after an early return that already establishes both conditions walkSessionContext computes it from"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:1409-1425
  - src/binder/session-context-walk.ts:94-98
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# #buildBinderSessionContext re-tests walk.applies after an early return that already establishes both conditions walkSessionContext computes it from

## Observation
`#buildBinderSessionContext` opens with an early return unless
`fm.bindContext === "session"` and `fm.mode === "prompt"`. It then calls
`walkSessionContext` with `bindContext: "session"` as a literal and
`mode: fm.mode`, and routes on `!walk.applies || walk.includedMessages.length
=== 0`. `walkSessionContext` computes `applies` as exactly
`input.bindContext === "session" && input.mode === "prompt"` — the conjunction
the early return already established — so the `!walk.applies` disjunct is
constant-false at this, the only production call site.

## Evidence
src/extension/production-theta-producer.ts:1409-1425 — the guard, the call, and
the re-test:

```ts
    const fm = binderInput.theta.frontmatter;
    if (fm.bindContext !== "session" || fm.mode !== "prompt") {
      return { kind: "none" };
    }
    const messages = buildSessionContext(
      binderInput.ctx.sessionManager.getEntries(),
      binderInput.ctx.sessionManager.getLeafId(),
    ).messages as unknown as readonly import("@earendil-works/pi-agent-core").AgentMessage[];
    const walk = walkSessionContext({
      messages,
      estimator: this.#input.root.tokenEstimator,
      mode: fm.mode,
      bindContext: "session",
    });
    if (!walk.applies || walk.includedMessages.length === 0) {
      return { kind: "none" };
    }
```

src/binder/session-context-walk.ts:94-98 — the definition of `applies`:

```ts
  // BNDR-10: at slash-invocation time a `bind_context: session` declaration on a
  // `mode: subagent` theta is treated as `bind_context: none` — the walk is
  // skipped and no *Recent session context* block is emitted. The walk applies
  // only when session context is requested on a prompt-mode theta.
  const applies = input.bindContext === "session" && input.mode === "prompt";
```

`grep -rn "walkSessionContext(" --include=*.ts src tests` → two call sites:
`src/extension/production-theta-producer.ts:1417` (the one above) and
`tests/session-context-truncation.test.ts:76`. The production site is the only
one that hardcodes `bindContext: "session"`; the test harness varies both
inputs, so the leaf's `applies` computation itself has a live exerciser.

## Why this is a problem
A guard subsumed by an earlier guard in the same function: after line 1410-1412
returns, `fm.mode` is narrowed to `"prompt"` and `bindContext` is passed as the
string literal `"session"`, so `walk.applies` is `true` on every path that
reaches line 1423 and the first disjunct can never decide the branch. The
sibling disjunct (`walk.includedMessages.length === 0`, the BNDR-7i
void-truncation case) is the one that does the work, and the doc above the
method already names only that case plus the frontmatter cases the early return
handles ("Returns `none` when the feature is off (subagent-mode,
`bind_context: none`, or the walk produced zero turns — BNDR-7i void
truncation)"). The redundant disjunct reads as a second, independent
subagent-mode fence where none exists, and pairs with a `bindContext: "session"`
argument that carries no information at this call site.

## Suggested direction (non-binding, optional)
Either drop the `!walk.applies` disjunct (and let the frontmatter guard be the
single BNDR-10 fence), or drop the frontmatter guard and let `walk.applies`
answer, so the condition is stated once.

## False-positive check
- Verified `applies` has no other producer: `grep -n "applies" src/binder/
  session-context-walk.ts` → the doc at 60/66, the result-field declaration at 74, the computation at 98,
  the `!applies` early return at 99, the `applies: false` literal at 101 and
  the `applies: true` literal at 167; no path sets it from anything other than
  the cited conjunction.
- Verified the narrowing holds: line 1410's condition is
  `fm.bindContext !== "session" || fm.mode !== "prompt"` with an unconditional
  `return`, so both equalities hold below it; line 1421 passes the literal
  `"session"` rather than `fm.bindContext`.
- Verified this is the only production caller:
  `grep -rn "walkSessionContext" --include=*.ts src extensions tools tests` →
  the export at `session-context-walk.ts:91`, the call at
  `production-theta-producer.ts:1417`, the import at
  `production-theta-producer.ts:335`, and `tests/session-context-truncation.
  test.ts:76`. The leaf and its `applies` arm are exercised by that witness
  test, so nothing in `session-context-walk.ts` is claimed dead.
- Not a spec-mandated fail-closed branch: BNDR-10's refusal is a "treat as
  `bind_context: none`" fold, already performed by the earlier return; the
  re-test adds no refusal the code does not already make.
- Git intent: `git blame -L 1417,1425` → `57a62e6b` (2026-07-12,
  "feat(binder): honour bind_context: session (BNDR-10)") for the call, the
  literal argument and the re-test alike, i.e. both fences landed together
  rather than one being left behind by a later change.

## Triage
verdict: confirmed — reproduced verbatim at 1409-1425 and :98; the 1410 early return plus the literal `bindContext: "session"` make `!walk.applies` constant-false at the sole production call site (and `applies: false` already returns empty `includedMessages`), so the disjunct can never decide the branch (triage: claude-opus-5)
