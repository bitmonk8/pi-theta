---
id: PTQ-0046
title: SystemNote doc comment describes SystemNoteDetails as a "closed 4-arm" union "below" with no possible "fifth member", but the union has five arms and sits above
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/system-note-channel.ts:128-136
  - src/extension/system-note-channel.ts:106-126
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SystemNote doc comment describes SystemNoteDetails as a "closed 4-arm" union "below" with no possible "fifth member", but the union has five arms and sits above

## Observation
The doc comment on `SystemNote` (the bug-0401/0437 details-optional rationale)
refers to "The closed 4-arm `SystemNoteDetails` union below" and reasons that
absence "is `undefined`/omission, not a fifth union member". In the current
file the union has five arms — `diagnostics`, `event`, `structural`,
`recovery`, and the bug-0432 `shutdown` arm — its own doc comment says "The
five normative `details` payload shapes", and it is declared above
`SystemNote`, not below.

## Evidence
src/extension/system-note-channel.ts:130-136 — the stale narration:
```ts
 * `details` is OPTIONAL: an informational note (bug 0401) carries NO
 * `details` key on the wire — that details-ABSENT wire shape is normative,
 * so this chain type widens to match it. The closed 4-arm `SystemNoteDetails`
 * union below is unchanged; there is no "absent" arm because absence is
 * `undefined`/omission, not a fifth union member.
 */
export interface SystemNote {
```

src/extension/system-note-channel.ts:108-126 — the union it describes: five
arms, documented as five, declared above:
```ts
 * The five normative `details` payload shapes the `theta-system-note` channel
 * carries, distinguished by which key is present (runtime-event-channel.md
 * §"system-note-details-shapes"). The shapes are disjoint by key.
 */
export type SystemNoteDetails =
  | { readonly diagnostics: readonly Diagnostic[] }
  | { readonly event: Record<string, unknown> }
  | {
      readonly structural: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
      };
    }
  | { readonly recovery: { readonly thetas: readonly string[] } }
```
(the fifth arm, `| { readonly shutdown: Record<string, unknown> };`, follows at
:126 with its bug-0432 attribution comment at :123-125.)

## Why this is a problem
Historical narration contradicting current code, in three particulars within
one comment block: the arm count ("4-arm" vs five arms), the positional
reference ("below" vs the union declared 21 lines above), and the
counterfactual ("not a fifth union member" — the union already has a fifth
member, so the absent-details case would be a sixth). Git shows the mismatch
concretely: the `shutdown` arm landed in commit 4086e798 (bug 0432,
2026-09-04 18:02) and the "closed 4-arm" text landed 24 minutes later in
3742e17c (bug 0437), restating a pre-0432 shape. A reader reconciling the
wire-shape count against runtime-event-channel.md is handed two conflicting
counts in the same file, and the one attached to `SystemNote` — the type
producers actually construct — is the wrong one.

## Suggested direction (non-binding, optional)
Reword the `SystemNote` comment to stop counting and pointing ("the closed
`SystemNoteDetails` union above is unchanged; absence is `undefined`/omission,
not a union member"), so the sentence stays true if the arm count moves again.

## False-positive check
- Arm count verified against the declaration: `SystemNoteDetails` at :113-126
  has exactly five members (`diagnostics`, `event`, `structural`, `recovery`,
  `shutdown`); the union's own doc at :109 says "five normative".
- Position verified: the union is declared at :113-126; `SystemNote` at
  :137-141; nothing named `SystemNoteDetails` is declared after `SystemNote`
  (single declaration in the file; `grep -n "SystemNoteDetails"
  src/extension/system-note-channel.ts`).
- Consumer check (comment-only claim, no code deadness asserted): the union
  and all five arms are live — `shutdown` is constructed in
  session-shutdown.ts (`details: { shutdown }`), `recovery`/`structural`/
  `diagnostics`/`event` are constructed across hot-reload.ts,
  reload-wiring.ts, watcher-recovery.ts, and the producers.
- Git intent: `git log -S "readonly shutdown: Record" --
  src/extension/system-note-channel.ts` → 4086e798 (bug 0432) added the fifth
  arm; `git log -S "closed 4-arm"` → 3742e17c (bug 0437) added the comment
  after that arm existed; no later commit corrected the count.
- Prior-filing check: not covered by the wave's stale-tests-task-stub-
  narration candidates (different files, different root cause — this is a
  bug-fix comment restating a superseded union shape, not V*-T stub
  scaffolding narration).

## Triage
verdict: confirmed — re-verified: :133-135 says "closed 4-arm ... union below ... not a fifth union member" while the union at :113-126 has five arms, its own doc at :109 says "five normative", it is declared above SystemNote (:137), and git shows 3742e17c added the text 23min after 4086e798 landed the fifth arm (stale-at-birth); all five arms are live in production src. (triage: claude-opus-5)
