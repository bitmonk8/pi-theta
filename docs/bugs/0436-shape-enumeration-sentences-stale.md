# Bug 0436 — Two shape-enumeration sentences lag the partition they describe: the four-shape bullet's head still reads "a parse / load / type / runtime-panic diagnostic batch" while its own tail carries the 0404 operator-facing third content case, and diagnostic-shape.md still says "the two `details` payload shapes" / outer `details` "stays closed to `{ diagnostics: Diagnostic[] }` plus … `{ event: RuntimeEvent }`" against a channel that pins four shapes plus a no-`details` class

- **Status:** fixed (0.428.0).
- **Sev/Diff estimate:** S5/D1 — S5: pure doc drift, but each instance is a
  head/summary sentence a reader (or conformance tooling) takes as the
  closed enumeration, and each is falsified by normative text the same
  corpus already carries. D1: two editorial line edits, both tolerated by
  the b0265 predicates (verified below).
- **Kind:** spec gap (doc-internal inconsistency; no implementation
  divergence claimed).
- **Related:**
  - 0404 (fixed 0.414.0) — §Fix Residual 2 names instance (a) verbatim:
    "The four-shape bullet's head still classifies the shape as 'parse /
    load / type / runtime-panic diagnostic batch' while its tail now
    carries a fifth content companion; a follow-on editorial head-widening
    (tolerated by the b0265 predicates) would remove the tension (reviewer
    R2)." No follow-on was filed; this is it.
  - 0398 (fixed 0.391.0) — added the group-B operator-facing classification
    instance (b)'s sentences never absorbed.
  - 0401 (fixed 0.390.0) — added the informational no-`details` class that
    falsifies instance (b)'s closed-set claim from a second direction.
  - [bug 0432](./0432-cancelled-note-event-reason-outside-partition.md) — relies on instance (b)'s closed-set
    sentence as one of its two conflicting surfaces; that card proposes the
    partition change, this one the editorial repair of the enumeration
    heads (independent: this card is worth doing even if 01 is rejected).
  - [bug 0434](./0434-operator-facing-diagnostics-notes-rowless.md) — the matrix-ROW half of the same 0404
    residual pair (§Fix Residual 1; this card is Residual 2's editorial
    half). Rows vs summary sentences; no shared edit.
- **Affected** (verified at `04579e12`, v0.415.0):
  - (a) `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22`
    — the `diagnostics` bullet's HEAD: "`details: { diagnostics:
    Diagnostic[] }` — a parse / load / type / runtime-panic diagnostic
    batch, exactly the shape defined in [Diagnostics]…". Its own TAIL (same
    line, post-0404): "… for a registered `theta/runtime/*` diagnostic
    routed as an operator-facing note rather than a top-level panic (the
    BNDR-9 custom-type-unsafe rejection) the companion `content` is the
    [Failure-mode templates] row …" — a third batch class the head's
    four-term enumeration does not name.
  - (b) `docs/spec_topics/diagnostics/diagnostic-shape.md:20` — "the two
    `details` payload shapes are disjoint by key and are specified under
    'System notes' and 'Runtime event channel' in [Pi Integration
    Contract]"; and `:42` — "not on the outer `CustomMessage.details`,
    which stays closed to `{ diagnostics: Diagnostic[] }` plus the
    runtime-event-channel carve-out (`details: { event: RuntimeEvent }`)
    noted above." The channel page pins FOUR shapes (`runtime-event-
    channel.md:20–25`: diagnostics, event, structural, recovery), plus the
    informational no-`details` class (`:41`); the structural and recovery
    notes ride the same outer `CustomMessage.details` these sentences close
    at two.
- **Observed at:** v0.415.0 (`04579e12`), documentary — all cited lines
  read at the pin; b0265 predicate compatibility checked against
  `tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts` (`locateSite`
  content predicates: the `:21` bullet must stay one physical line starting
  `` - `details: { diagnostics: Diagnostic[] }` `` and containing
  "runtime-panic case"; a head-widening that preserves both survives the
  gate — 0404 R2's own tolerance analysis, re-verified).

## Summary

The channel's shape vocabulary grew three times (structural/recovery
variants; 0398's group-B operator-facing class; 0401's informational
no-`details` class; 0404's third content case) and two summary sentences
were never widened. Instance (a) is intra-line: the bullet's head
enumerates "parse / load / type / runtime-panic" while its own tail, one
clause later, adds the operator-facing case — a reader classifying by the
head wrongly concludes the BNDR-9 note (and any card-03 follow-on rows)
mis-ships. Instance (b) is cross-page: diagnostic-shape.md's "two shapes"
and "stays closed to …" sentences predate the structural/recovery variants
and are now false for two shipped, matrix-rowed note shapes on the same
outer field — a consumer implementing validation from diagnostic-shape.md
alone (the diagnostics page is where diagnostic tooling starts) rejects
every structural and recovery note as malformed.

## Reproduction

Documentary:

1. Read `runtime-event-channel.md:22` head, then its tail's third content
   case (quoted above) — the head enumerates two batch families + panic,
   the tail carries three content companions.
2. Read `diagnostic-shape.md:20` ("the two `details` payload shapes") and
   `:42` ("stays closed to … plus …"), then `runtime-event-channel.md:20–25`
   (four shapes) and `:36–37` (structural/recovery matrix rows) — the
   closed-at-two claim excludes two normative shapes.
3. Cross-check: `structuralChangeNote` (`src/extension/reload-wiring.ts`;
   structural) and `computeBinderModelRecoveryNote`
   (`src/binder/binder-model.ts`; recovery) ship those outer `details`
   shapes in production, matrix-conformant per 0401's §Related.

## Expected behaviour

Enumeration/summary sentences match the partition they summarise: (a) the
bullet head names the operator-facing routed-diagnostic case (or drops the
enumeration in favour of "a diagnostic batch — see the content cases
below"); (b) diagnostic-shape.md's two sentences either enumerate all four
shapes + the informational no-`details` class or defer wholesale to the
channel page as the single owner ("the outer `CustomMessage.details`
carries one of the payload shapes owned by [PIC — Runtime event channel]").

## Actual behaviour / root cause

Additive shape work landed on the channel page (its owner) with
b0265-constrained minimal edits; the summarising prose on the sibling page
and in the bullet head was out of every fix lane's ratified scope (0404
R2 recorded exactly this for instance (a)). Nothing gates cross-page
enumeration consistency, so the drift persists silently.

## Why it matters

- Lowest impact class, but these are the two sentences a new consumer or
  conformance test author reads FIRST; both currently teach a wrong closed
  set, and instance (b) actively invalidates two conformant production note
  shapes.
- The corpus's own convention (0109, 0062, 0063 precedents) treats
  enumeration-lagging-implementation as fix-worthy doc drift when crisp;
  both instances are quotable single sentences.

## Non-goals

- Any change to the partition itself, the matrix rows, or emission bytes.
- The cancelled-note partition hole ([bug 0432](./0432-cancelled-note-event-reason-outside-partition.md)) —
  if that fix lands a fifth arm, the widened sentences here must name it
  too, but this card stands regardless.
- The four-shape count word at `runtime-event-channel.md:20/:39` ("four")
  — accurate today for `details`-carrying shapes; only the head enumeration
  and the sibling page's summaries are wrong.

## Fix

Two editorial edits, DIAG-2-corpus-gate and b0265-gate compatible:

1. `runtime-event-channel.md:22` head: widen to "a parse / load / type /
   runtime-panic / operator-facing-routed diagnostic batch" (stays one
   line; keeps the leading `` - `details: { diagnostics: Diagnostic[] }` ``
   prefix and the "runtime-panic case" substring the b0265 predicate
   requires).
2. `diagnostic-shape.md:20/:42`: replace the two-shape and closed-at-two
   claims with a deferral to the channel page's partition (single-owner
   phrasing), or enumerate `{ diagnostics }`, `{ event: RuntimeEvent }`,
   `{ structural }`, `{ recovery }`, and the informational no-`details`
   class.

Witness: extend the citation/consistency gate style already in-tree
(`tests/citation-symbol-form-gate.test.ts` pattern) with a cell asserting
diagnostic-shape.md's enumeration names every shape the channel page's
partition carries — red today.

## Provenance

0404 §Fix Residual 2 (instance (a), reviewer R2, named-but-unfiled);
instance (b) found by the seed-1 partition re-pin (reading
diagnostic-shape.md in full against the channel page). b0265 gate read
(`tests/b0265-panic-scoping-remnant-surfaces-gate.test.ts` locateSite
predicates) to verify edit tolerance. Dup check: README index; 0404, 0398,
0401, 0383 fix records; no report covers either sentence.

## Fix (0.428.0)

- What shipped: two editorial edits (ENUMERATE option for instance (b)) plus one
  induced-stale citation re-pin:
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22` — the
    `details: { diagnostics }` bullet HEAD widened "a parse / load / type /
    runtime-panic diagnostic batch" → "… / operator-facing-routed diagnostic
    batch" (instance (a)); the b0265/b0404-pinned prefix and "runtime-panic case"
    substring preserved; the "four" count words at :20/:39 untouched (§Non-goals).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:20` and `:42` — the two
    closed-at-two summary sentences rewritten to name all four outer `details`
    shapes (`{ diagnostics }`, `{ event: RuntimeEvent }`, `{ structural: … }`,
    `{ recovery: … }`) plus the informational no-`details` class; "MUST NOT
    assume both" → "MUST NOT assume more than one" (mirrors :39) (instance (b)).
  - `tests/b0383-slsh4-note-details-event.test.ts:10` — comment verbatim quote of
    diagnostic-shape.md:20 refreshed "assume both" → "assume more than one"
    (induced-stale re-pin in the same change; the `:20` line-cite unchanged since
    the spec edit was intra-line).
  - `tests/b0436-shape-enumeration-sentences-gate.test.ts` (new) — content-anchored
    gate: cell (a) locks the head names the operator-facing-routed case; cell (b)
    derives the four partition keys from the channel page and asserts
    diagnostic-shape.md's summary names each; a SPEC-TRUTH control.
- Gates: witness RED at fork (cells (a) & (b); control green), GREEN after (3/3);
  targeted suite over the witness + b0383 + b0265 + b0404 + citation-symbol-form
  gates green (23/23); `npm run typecheck` clean; `npm run lint` clean;
  chain-level live cell green under the global lock. Full `npm test` 590/10556
  green.
- Review: 1 round. R1 (bug-fix-reviewer, deep) — CLEAN (no blocking findings).
  Residuals R1 (overview-and-orientation.md:65 third enumeration instance,
  unenumerated/pre-existing — follow-on), R2 (b0383 induced-stale quote — FIXED
  this change under a recorded bounded self-authorization: same-commit re-pin per
  the lane's 0389 discipline), R3 (witness cell (b) per-key hardening — the
  genuinely-enforced keys structural/recovery are the defect). Post-polish
  confirmation of the b0383 comment fix: single comment hunk, no executable line;
  verified by gate-diff (23/23 green), confirmation round skipped.
- Verification: SOLID. Witness genuinely reds — reverting the two spec files to
  fork bytes turns cells (a) & (b) RED (control green), restore byte-identical with
  CRLF profile intact (runtime-event-channel.md 138 CRLF, diagnostic-shape.md 86
  CRLF). Targeted suite green. Typecheck + lint clean. b0265/b0404 tolerant; no
  "assume both" remains in tests/src/spec. Live: chain-level cell green under the lock.
- Residuals:
  1. `docs/spec_topics/overview-and-orientation.md:65` carries a third instance of
     the same four-term enumeration ("parse / load / type / runtime-panic diagnostic
     batches"), an ownership (not closed-set) claim at a site §Affected does not name
     — out of the ratified two-edit scope; follow-on card material.
  2. Witness cell (b) uses bare-substring key matching; `diagnostics`/`event` are
     structurally always present in the located region, so only `structural`/`recovery`
     (and any future fifth key) are genuinely enforced — hardening material, not a defect
     (those two keys were the drift).
- Discharge notes appended: none.
- Pinned dispositions / non-goals: partition, matrix rows, "four" count words, and
  emission bytes untouched; CRLF preserved on both spec files; the cancelled-note
  partition hole (bug 0432) is independent.
