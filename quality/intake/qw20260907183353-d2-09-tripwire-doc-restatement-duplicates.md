---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Three doc comments in session-swap-tripwire.ts carry a second paragraph that restates the first paragraph's content verbatim-in-substance
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/session-swap-tripwire.ts:88-96
  - src/extension/session-swap-tripwire.ts:129-140
  - src/extension/session-swap-tripwire.ts:152-162
sites: 3
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Three doc comments in session-swap-tripwire.ts carry a second paragraph that restates the first paragraph's content verbatim-in-substance

## Observation
Three exported functions in session-swap-tripwire.ts —
`sessionSwapInstanceSurvivedDiagnostic`, `guardSessionSwapTripwire`, and
`runGuardedSlashHandler` — each carry a doc comment whose trailing paragraph
repeats what the opening paragraph already said, in one case repeating the
same sentence nearly word-for-word. The duplicated paragraphs add no new fact
(no extra spec anchor, no extra behaviour) beyond the first statement.

## Evidence
src/extension/session-swap-tripwire.ts:88-96 — the interpolation sentence
appears twice in one comment:

```ts
/**
 * Build the `theta/host/session-swap-instance-survived` (E, runtime) diagnostic
 * carrying `details: { event: { reason } }` with the armed session-only reason
 * (diagnostics/code-registry-host.md; the message is the registry *Message*
 * column with `<reason>` interpolated).
 *
 * The message is the registry *Message* column with `<reason>` interpolated
 * (diagnostics/code-registry-host.md; sourced verbatim).
 */
```

src/extension/session-swap-tripwire.ts:129-140 — paragraph 2 restates
paragraph 1 (read flag → emit one survived diagnostic → fail-fast-terminate;
no-op when unarmed / dormant under governed-by-rebind):

```ts
/**
 * The trip-site guard every theta-registered slash `handler` (at entry, before
 * any dispatch or `readDrainState` branch) and the `session_start` handler run:
 * read `sessionSwapTornDown`; if armed, emit exactly one
 * `theta/host/session-swap-instance-survived` diagnostic via `console.error` and
 * then fail-fast-terminate the process. A no-op (dormant) when the tripwire is
 * unset (the proven governed-by-rebind steady state).
 *
 * Fires only on the ARMED tripwire (the proven governed-by-rebind steady state
 * leaves it dormant): emit exactly one survived diagnostic, then fail-fast-
 * terminate (control does not return past the trip). A no-op when unarmed.
 */
```

src/extension/session-swap-tripwire.ts:152-162 — paragraph 2 restates
paragraph 1's first sentence (guard at entry; terminate before `dispatch` on
armed; otherwise no-op then `dispatch` runs):

```ts
/**
 * Wrap a theta-registered slash `handler` / `session_start` body so the trip-site
 * guard runs AT ENTRY, before any dispatch: the guard fail-fast-terminates on an
 * armed tripwire (so `dispatch` never runs past the trip) and is a no-op
 * otherwise, then `dispatch` runs. The Pi-owned `/reload` command is not a
 * theta-registered handler and is never wrapped by this function, so it is not
 * guarded (host-prerequisites clause (c-i)).
 *
 * The guard runs at entry: on an armed tripwire it fail-fast-terminates before
 * `dispatch` is ever called; otherwise it is a no-op and `dispatch` runs.
 */
```

## Why this is a problem
Leftover editing residue: each comment states its contract twice, so the
second paragraph is duplicate text with no independent content — the classic
shape of an edit that appended a rephrased paragraph without deleting the
original. Duplicated statements of the same rule inside one comment can drift
apart independently on the next edit, and they pad three short functions'
documentation with repetition a reader must diff to confirm says nothing new.
The pattern matches sibling filings on duplicated doc paragraphs
(qw20260907130901-d2-03-parse-theta-document-doc-duplicate-paragraph,
qw20260907183353-d2-06-route-drain-state-arm-doc-duplicate), neither of which
covers this file.

## Suggested direction (non-binding, optional)
Keep one statement of each contract per comment — for each of the three sites,
drop whichever paragraph carries less information (the trailing restatement in
all three cases) and fold any residual detail ("control does not return past
the trip", "sourced verbatim") into the surviving paragraph.

## False-positive check
- Verified each pair states the same facts by side-by-side reading: no extra
  spec anchor, precondition, or behaviour appears only in the second paragraph
  (the `<reason>` interpolation sentence is repeated with the same registry
  citation; the guard/wrapper paragraphs repeat armed→terminate / unarmed→no-op).
- Checked the fourth doc comment in the file (`armSessionSwapTripwireForReason`,
  :108-119): its second paragraph adds the unknown-coerced-reason case, so it
  is additive, not duplicate — excluded.
- Duplicate-filing check: read qw20260907183353-d2-06-route-drain-state-arm-doc-duplicate
  and qw20260907130901-d2-03-parse-theta-document-doc-duplicate-paragraph
  location lists — neither cites session-swap-tripwire.ts.
- Comments only; no code-behaviour claim is made.

## Triage
