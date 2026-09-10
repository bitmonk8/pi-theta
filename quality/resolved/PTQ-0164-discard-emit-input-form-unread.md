---
id: PTQ-0164
title: DiscardEmitInput's required form field (and the DiscardForm type that exists only to type it) is written at every construction site and read by no code anywhere
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/query-discard.ts:127-136
  - src/runtime/query-discard.ts:147-158
  - src/runtime/query-discard.ts:170-197
  - src/runtime/query-discard.ts:205-220
  - tests/query-discard.test.ts:93-99
  - tests/query-discard.test.ts:152
  - tests/query-discard.test.ts:176
sites: 7                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# DiscardEmitInput's required form field (and the DiscardForm type that exists only to type it) is written at every construction site and read by no code anywhere

## Observation
The QRY-20 discard-observability input record `DiscardEmitInput` declares a
required `form: DiscardForm` member ("let-underscore" | "void-tail"). Its own
doc comment places the field's only behavioural role upstream of the seam —
"selects the `discard_site` derivation upstream" — and the adjacent
`discardSite` member is documented as "already derived per `form`". Neither of
the two functions that receive a `DiscardEmitInput` (`buildDiscardEvent`,
`emitDiscardObservability`) reads `form`, no other code reads it, and even the
module's witness tests only construct it. `DiscardForm` is referenced nowhere
except this field's declaration.

## Evidence
src/runtime/query-discard.ts:147-158 (the interface; `form` required):
```ts
export interface DiscardEmitInput {
  /** The settled query outcome. */
  readonly outcome: DiscardedOutcome;
  /** The discard form (selects the `discard_site` derivation upstream). */
  readonly form: DiscardForm;
  /** The `discard_site` location (already derived per `form`). */
  readonly discardSite: DiscardSite;
```

src/runtime/query-discard.ts:170-197 — `buildDiscardEvent` reads
`input.theta`, `input.invocationId`, `input.discardSite`, `input.occurredAt`,
`input.querySite`, and the error's own fields; `form` appears nowhere in the
body:
```ts
  const event: RuntimeEvent = {
    kind: error.kind,
    theta: input.theta,
    invocation_id: input.invocationId,
    message: error.message,
    discard_site: input.discardSite,
    occurred_at: input.occurredAt,
  };
```

src/runtime/query-discard.ts:205-220 — `emitDiscardObservability` reads only
`input.outcome` and forwards the whole record to `buildDiscardEvent`; `form`
appears nowhere in the body.

src/runtime/query-discard.ts:127-136 — `DiscardForm`'s declaration; its doc
already assigns the derivation to a caller upstream:
```ts
 * Which discard form produced the observability event (QRY-20). The
 * `discard_site` is the location of the discarding `let _ =` binding for the
 * expression-statement form, or the start of the tail `@`...`` expression for
 * the void-tail-function form.
 */
export type DiscardForm = "let-underscore" | "void-tail";
```

All construction sites (the complete set anywhere in the repository — grep
`DiscardEmitInput` across src/, extensions/, tools/, tests/ shows constructions
only in tests/query-discard.test.ts): the `emitInput` helper at :93-99
(`form: "let-underscore"` at :96) and its two overrides at :152
(`{ form: "let-underscore", discardSite }`) and :176
(`{ form: "void-tail", discardSite: tailSite }`). Production constructs none:
src/extension/production-theta-producer.ts mentions `buildDiscardEvent` only in
a comment (:1739) and builds its boundary event inline (:1730-1747) without
this type.

Reads: grep `\.form\b` across src/, extensions/, tools/, tests/ — 2 hits, both
`decl.form` on the unrelated `ByClauseDecl` (src/parser/schema-declarations.ts:792,
:807); grep `["form"]` / `['form']` bracket access — 0 hits; grep `DiscardForm`
— 2 hits, the type declaration (:136) and the field (:151).

## Why this is a problem
Vestigial field: "the value is never read" holds mechanically — the two
receiving functions never reference `form`, no destructuring or string-keyed
access exists anywhere, and the built `RuntimeEvent` carries no form member
(QRY-20's observable is `discard_site`, which arrives already derived). Every
construction site (three, all cited) is forced by the required member to supply
a value that influences nothing, and the `DiscardForm` union exists solely to
type the unread member. Unlike the module's witness-read outputs (the event's
`kind`/`message`/`discard_site`, asserted by tests/query-discard.test.ts), not
even a test reads `form` back — the same standard the accepted-shape
`Resolution.mutable` filing (qw20260907130901-d2-01) applied.

## Suggested direction (non-binding, optional)
Drop the `form` member (and with it `DiscardForm`) from `DiscardEmitInput`, or
give it its one documented job by stamping the discard form onto the built
event — whichever the QRY-20 owners intend; today the discriminator
discriminates nothing.

## False-positive check
- Reference searches: `\.form\b`, `["form"]`, `['form']`, `DiscardForm`,
  `DiscardEmitInput` grepped across src/, extensions/, tools/, tests/ — all
  hits enumerated above; no read of the member exists in any tree.
- Test-only-caller rule: respected — no deadness claim is made against
  `emitDiscardObservability` / `buildDiscardEvent` themselves (they are
  witness-test-reachable, and `buildDiscardEvent`'s shape is production's
  documented template at production-theta-producer.ts:1739); the claim is
  confined to the `form` member, which even the witness tests only write,
  never assert on (tests/query-discard.test.ts asserts `kind`, `message`,
  `display`, `discard_site` — grep `form` in that file shows only the three
  construction sites).
- Re-exports / dynamic access: no `export *` exists under src/ (grep); no
  string-keyed consumer found.
- Spec check: query-escapes-stringification.md QRY-20 pins the event's
  `discard_site` and preserved `kind`/`message` (the module header restates
  this at :12-21); no spec obligation names a `form` member on the event or
  the input.
- Overlap check: qw20260907130901-d2-04-discarded-query-check-constant-inputs
  covers the same file's OTHER function (`checkDiscardedQueryResult`'s QRY-19
  inputs at its parser call site); this finding is confined to the QRY-20
  emit-input record and shares no cited line or claim with it.

## Triage
verdict: questionable — `form` verifiably has zero readers ever (pickaxe `input.form`: no commit; no dynamic/spread access), but its whole seam has no production caller by recorded design (.pi/bug-hunt/logs/note-channel-6.md:51-54 "filed residual/non-goal"), so prune-vs-stamp is the QRY-20 owner's call, and the site set is mis-stated (4 writes incl. tests/query-discard.test.ts:186-189, which iterates both DiscardForm members, not 3) (triage: claude-opus-5)
verdict: confirmed — reproduces independently: `form` (:151) and `DiscardForm` (:136) have zero readers across src/, extensions/, tools/, tests/ (`\.form\b` hits only `decl.form` on ByClauseDecl at schema-declarations.ts:792/807; no bracket, destructure or spread access; no `export *`), pickaxe `input.form` is empty across all history, and d88e07ec declared the field alongside an already-derived `discardSite` with stub bodies that never touched it while cbd64750 added no reader — inert from birth, not orphaned by a redesign; the event carries no form (runtime-event-channel.ts:45 and spec runtime-event-channel.md:88 pin `discard_site` as the only discard field), so the "stamp" alternative is a spec extension, not a restoration, leaving pruning as the only spec-consistent direction; the test-only-caller rule is not engaged because no test observes `form` either — the :187-189 loop over both members yields identical behaviour, so the member is inert even to its witnesses (the PTQ-0007 standard), and the seam's recorded production-unwired status (note-channel-6.md:51-54) is orthogonal to a member its own implementation ignores; two filing inaccuracies, neither bearing on the claim: 4 write sites not 3 (misses tests/query-discard.test.ts:187-189) and the producer citation drifted :1739→:1771 (triage: claude-opus-5)
