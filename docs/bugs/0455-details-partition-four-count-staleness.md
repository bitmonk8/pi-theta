# Bug 0455 — Ten surfaces still describe the `theta-system-note` `details` partition as four-membered (or enumerate its diagnostic-batch classes at four terms) after bug 0432's fifth `shutdown` arm and bug 0434's generalised operator-facing row: `overview-and-orientation.md:65`'s ownership sentence, the channel bullet's own three-arm content tail, `coverage-matrix.md:183`'s cka-58 row, `runtime-event-channel.ts:4`, and six test headers — including the b0436 gate, whose comments say "four" while its own control cell asserts five

- **Status:** fixed (0.443.0).
- **Sev/Diff estimate:** S5/D1 — S5: pure doc/comment drift, but every
  instance is a count word or enumeration a reader (or a matrix-driven
  conformance author) takes as the closed set, and every one is falsified
  by normative text the corpus already carries (`runtime-event-channel.md:20`
  "one of five normative payload shapes"; `:41` "The five `details` shapes
  are disjoint by key"). D1: mechanical count-word / enumeration edits;
  the only non-comment surfaces are it()/describe() titles and assertion
  messages in `tests/b0404-…` (name churn only — no matcher, no expected
  value, no verdict moves).
- **Kind:** spec gap (doc-internal inconsistency; no implementation
  divergence claimed — the emitted bytes and the partition itself are
  correct and untouched).
- **Related:**
  - 0432 (fixed 0.424.0, commit `4086e798`) — added the fifth `shutdown` partition arm; its
    §Fix Residual 2 names instances (c), (d), and the b0383/b0398/b0404
    test headers verbatim: "Corpus-wide 'four shapes' / 'four normative
    arms' enumeration staleness (`coverage-matrix.md`:183,
    `src/runtime/runtime-event-channel.ts`:4, test headers
    b0383/b0398/b0404) — bug **0436**'s ground
    (shape-enumeration-sentences-stale); deliberately left for 0436."
  - 0436 (fixed 0.428.0, commit `ccaf59da`) — the enumeration-sentences fix this residual was
    left for, but its ratified scope was TWO edits
    (`runtime-event-channel.md:22` head + `diagnostic-shape.md:20/:42`)
    plus one induced-stale b0383 re-pin ("assume both" → "assume more than
    one"); none of the sites below was in it. Its own §Fix Residual 1
    names instance (a) verbatim: "`docs/spec_topics/overview-and-orientation.md:65`
    carries a third instance of the same four-term enumeration ('parse /
    load / type / runtime-panic diagnostic batches'), an ownership (not
    closed-set) claim at a site §Affected does not name — out of the
    ratified two-edit scope; follow-on card material."
  - 0434 (fixed 0.433.0, commit `e97dc98c`) — generalised matrix row so the 21 operator-facing
    note classes select it; its §Fix Residual 1 names instance (b)
    verbatim: "the `details: { diagnostics }` five-shape partition
    bullet's per-case content tail still enumerates three arms while the
    matrix owns the 21-class serialised content … Incompleteness (not
    contradiction) under the settled restrictive-parenthetical reading …
    0436-genre follow-on, out of OPTION 1's one-line scope."
  - 0404 (fixed 0.414.0) — authored the "four-shape" vocabulary the b0404
    witness pins; accurate at its fork (v0.414.0 partition had four
    shapes).
  - 0109/0117 precedents — enumeration-lagging-implementation filed as
    fix-worthy doc drift when crisp.
  - [0134] (fixed 0.198.0) — boundary: the drift here is SEMANTIC (a
    falsified count word / closed-set enumeration), not positional
    line-cite drift, so 0134's pre-existing position-only do-not-file
    class does not apply. Every instance was made false by an identified
    commit: `4086e798` (0432, v0.424.0) added the fifth `shutdown` arm and
    falsified every "four" site; `e97dc98c` (0434, v0.433.0) generalised
    matrix row `:32`, which is what makes instance (b)'s missing tail arm
    an incompleteness; `ccaf59da` (0436, v0.428.0) authored instance (h)
    stale-at-birth from a pre-0432 fork.
- **Affected** (every quote verified byte-exact at `401a425b`, v0.437.0;
  spec truth: `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:20`
  "The `details` field carries one of five normative payload shapes,
  distinguished by which key is present" and `:41` "The five `details`
  shapes are disjoint by key"):
  - (a) `docs/spec_topics/overview-and-orientation.md:65` — the *Runtime
    observability* bullet: "the parse / load / type / runtime-panic
    diagnostic batches that share the channel are owned by
    [Diagnostics](./diagnostics.md)". Third instance of the four-term
    enumeration; the channel bullet it summarises was widened by 0436 to
    "a parse / load / type / runtime-panic / operator-facing-routed
    diagnostic batch" (`runtime-event-channel.md:22`), and the
    operator-facing-routed class (21 registry rows per 0434) is likewise
    owned by Diagnostics — the ownership sentence's enumeration excludes
    it.
  - (b) `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22`
    — the `details: { diagnostics: Diagnostic[] }` bullet: the HEAD (post-
    0436) names five batch classes, but the content TAIL still enumerates
    exactly three arms — "The companion `content` is the serialised
    `<file>:<line>:<col>: <code>: <message>` line(s) for parse / load /
    type batches; for the runtime-panic case (…) the companion `content`
    is the user-facing framing …; for a registered `theta/runtime/*`
    diagnostic routed as an operator-facing note rather than a top-level
    panic (the BNDR-9 custom-type-unsafe rejection) the companion
    `content` is the [Failure-mode templates] row …" — so the head's
    fifth term (the non-BNDR-9 operator-facing-routed batch, whose
    serialised content the generalised matrix row `:32` owns) has no
    content arm in the bullet that introduces it.
  - (c) `docs/plan_topics/coverage-matrix.md:183` — the `cka-58` row:
    "the four `details` shapes are disjoint (renderers MUST NOT assume
    more than one)".
  - (d) `src/runtime/runtime-event-channel.ts:4` — module header: "the
    `display`/`content` matrix across the four `details` variants" (the
    matrix at `runtime-event-channel.md:28–40` pairs five variants over
    eight rows).
  - (e) `tests/b0383-slsh4-note-details-event.test.ts:135` — classifier
    doc comment: "the four normative arms a `details` payload selects —
    the partition rule the". The classifier itself
    (`presentDetailsKey`, `:139–145`) also has no `shutdown` arm (a
    `{ shutdown }` payload classifies `"none"`) — behaviour-neutral for
    this file's SLSH-4 cells, but the comment's "four normative arms"
    claim is false.
  - (f) `tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts:101`
    — the same sentence on the same classifier twin.
  - (g) `tests/b0404-custom-type-unsafe-note-matrix-row.test.ts` — 13
    "four-shape" sites: header comments `:13` ("four-shape `details:
    { diagnostics }` bullet and the per-variant `display` /"), `:23`,
    `:42`, `:48`, `:52` ("runtime-event-channel.md line 22 — the
    four-shape"); helper `:201` ("/** The four-shape `details:
    { diagnostics }` bullet (single physical line). */") and its locate
    label `:204` ("four-shape `details: { diagnostics: Diagnostic[] }`
    payload bullet"); describe/it titles `:230`, `:257`, `:295`; assertion
    messages `:262`, `:301`, `:305`. All name the bullet "four-shape"
    against a partition of five (the helper name
    `fourShapeDiagnosticsBullet` at `:202` is adjacent material).
  - (h) `tests/b0436-shape-enumeration-sentences-gate.test.ts` — the gate's
    own header contradicts its control cell: `:27` "four-shape bullets",
    `:38` "all four shapes", `:41–42` "(four `details` shapes:
    diagnostics, event, structural, recovery)", `:46` "four normative
    payload shapes", `:47` "the four `- `details: { <key> }``", `:120`
    "DERIVED by reading the four", `:177` "the fixed four-shape" — while
    cell `:201–213` asserts "the channel page lists exactly five `details`
    payload shapes" and keys
    `["diagnostics", "event", "structural", "recovery", "shutdown"]`
    (composed at the 0436 merge on top of 0432; the comments kept the
    fork's vocabulary). The variable name `fourShapeIntro` (`:205`) is
    adjacent material.
  - (i) `tests/tool-registration-lifetime.test.ts:85` — "the four-shape
    `SystemNote` type"; the referent
    (`src/extension/system-note-channel.ts:109`) reads "The five normative
    `details` payload shapes the `theta-system-note` channel" and carries
    the fifth `{ shutdown }` arm at `:126`.
  - (j) `tests/b0401-informational-notes-omit-details.test.ts:5–7` —
    header: "`theta-system-note`'s `details` field is a CLOSED four-arm
    partition keyed on WHICH KEY IS PRESENT (runtime-event-channel.md
    #system-note-details-shapes): `{ diagnostics }`, `{ event }`,
    `{ structural }`, `{ recovery }`" — the four-arm claim plus a
    four-key enumeration missing `{ shutdown }`; same class as
    (e)/(f)/(i).
- **Observed at:** v0.437.0 (`401a425b`), documentary — every cited line
  read at the pin; the spec truth lines (`runtime-event-channel.md:20/:22/
  :32/:41`, `system-note-channel.ts:109/:126`) read at the pin; no probe
  needed (no behavioural claim).

## Summary

Bug 0432 (0.424.0) grew the channel's closed partition to five shapes and
bug 0434 (0.433.0) generalised the matrix's first row to own the 21-class
operator-facing serialised content; bug 0436 (0.428.0) then repaired
exactly two summary sentences plus one induced-stale quote. Everything
else that counts the partition — the overview page's ownership sentence,
the plan-side coverage row, the runtime module header, and six test-file
headers (one of them the b0436 gate itself, whose merge updated the
assertions but not the narration) — still says "four", and the channel
bullet that 0436 head-widened to five terms still prescribes content for
only three of them. All three owning fix records name this exact ground
as follow-on material (0432 R2, 0434 R1, 0436 R1); none of it was in any
ratified scope, and no card was filed.

## Reproduction

Documentary:

```
grep -n "carries one of five" docs/spec_topics/pi-integration-contract/runtime-event-channel.md   # :20
grep -n "The five \`details\` shapes are disjoint" docs/spec_topics/pi-integration-contract/runtime-event-channel.md  # :41
grep -n "parse / load / type / runtime-panic diagnostic batches" docs/spec_topics/overview-and-orientation.md  # :65 (four terms)
sed -n '183p' docs/plan_topics/coverage-matrix.md      # "the four `details` shapes are disjoint"
sed -n '4p'   src/runtime/runtime-event-channel.ts     # "across the four `details` variants"
grep -n "four normative arms" tests/b0383-slsh4-note-details-event.test.ts tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts
grep -n "four-shape" tests/b0404-custom-type-unsafe-note-matrix-row.test.ts tests/b0436-shape-enumeration-sentences-gate.test.ts tests/tool-registration-lifetime.test.ts
grep -n "four-arm partition" tests/b0401-informational-notes-omit-details.test.ts  # :5 (key list :6–7 stops at recovery)
```

For instance (b): read `runtime-event-channel.md:22` — the head names five
batch classes; count the tail's "for …" content arms (three); then read the
matrix row at `:32`, whose selector "or a registered operator-facing
`theta/runtime/*` diagnostic routed as a note rather than a top-level
panic" pairs that class with serialised-line content the bullet never
states.

## Expected behaviour

Count words and enumerations match the partition they summarise
(`runtime-event-channel.md:20/:41` — five, disjoint by key): (a) the
overview ownership sentence names the operator-facing-routed batch class
(or drops the enumeration in favour of "the diagnostic batches that share
the channel"); (b) the bullet's tail carries a fourth content arm for the
non-BNDR-9 operator-facing-routed case ("the serialised
`<code>: <message>` line(s)" — the matrix `:32` cell) or defers the tail
wholesale to the matrix as content owner; (c)–(j) read "five" / name the
five-shape partition.

## Actual behaviour / root cause

0432's fix composed the fifth arm into the channel page, diagnostic-shape
and the emitter type, and recorded every summarising surface it did not
own as Residual 2 "left for 0436"; 0436's ratified scope was the two
sentences its own §Affected enumerated, so the residual ground was never
covered, and 0436's gate comments were authored at a pre-0432 fork and
merged with only the assertions recomposed. Nothing gates count-word
consistency against the partition (the b0436 gate derives keys but asserts
only that diagnostic-shape.md's summary names them).

## Why it matters

- Lowest impact class, but the stale sites include the first page a new
  reader meets (overview-and-orientation), the module header of the
  runtime's own channel implementation, and the coverage row conformance
  tooling would consult — each currently teaches a four-member closed set
  the spec falsified two fixes ago.
- Instance (b) is normative-page-internal: the bullet that introduces the
  five classes prescribes content for three, so a reader implementing from
  the bullet (rather than the matrix) has no content rule for the 21-class
  case 0434 just made selectable.
- The b0436 gate contradicting itself (comments "four", assertion "five")
  is the exact confusion a witness file exists to prevent.

## Non-goals

- The partition, the matrix rows, the emitted bytes, and the b0265-pinned
  panic-row substring — all untouched (docs/comments only).
- The "four" counts that are still true: the four registry TABLE pages
  (`code-registry-parse.md:5`, `diagnostic-shape.md:80`,
  `placeholder-rendering-a.md:7`), the four dedicated `internal-error`
  carve-out codes (`code-registry-runtime.md:24`), the four captured
  `details.event.reason` forms (`code-registry-runtime.md:41`,
  `placeholder-rendering-b.md:65`), b0265's "four panic-note sites", and
  every non-channel "four" — verified non-instances.
- Era-pinned `docs/bugs/**` prose (frozen at filing).
- The b0383/b0398 `presentDetailsKey` classifiers' missing `shutdown` arm
  as a BEHAVIOURAL gap — those cells never feed a shutdown note; only the
  comment claim is in scope (a fixer MAY add the arm for honesty, but no
  verdict depends on it).
- The adjacent counts in the same b0401 header — `:1` "the four
  matrix-less production informational notes" and `:12` "these five
  informational notes" — count the informational-note POPULATION, a
  different referent (widened separately by 0433's PIC-8(c) advisory
  note), not the `details` partition; a fixer sweeping (j) meets them and
  leaves them alone here.

## Fix

One mechanical sweep, comment/prose/count-word only:

1. (a) `overview-and-orientation.md:65`: widen to "the parse / load /
   type / runtime-panic / operator-facing-routed diagnostic batches"
   (mirrors the 0436 head edit), or reword to the ownerless form "the
   diagnostic batches that share the channel are owned by [Diagnostics]".
2. (b) `runtime-event-channel.md:22`: append a fourth content arm — "for
   a registered operator-facing `theta/runtime/*` diagnostic routed as a
   note other than the BNDR-9 rejection, the companion `content` is the
   serialised line(s), per the per-variant matrix below" — keeping the
   bullet one physical line, the `- `details: { diagnostics:
   Diagnostic[] }`` prefix, and the "runtime-panic case" substring (the
   b0265/b0404 locate predicates; 0436's head edit proved tolerance).
   Alternative: replace the tail with a deferral to the matrix as single
   content owner (larger delta against the b0404 cell-2/cell-5 content
   predicates — check `FAILURE_TEMPLATE_PHRASE` and the errors-and-results
   cross-reference survive).
3. (c)–(j): "four" → "five" (and "four-shape" → "five-shape" or a
   count-free "partition bullet" spelling) at the enumerated sites — for
   (j), also add `{ shutdown }` to the key enumeration; in
   `b0404-…` prefer count-free wording so the file stops re-staling on the
   next partition growth; in `b0436-…` align the header narration with the
   already-five control cell. Test-title edits change reported test names
   only; no matcher or expected value moves.

Witness: extend `tests/b0436-shape-enumeration-sentences-gate.test.ts`
with a cell asserting the overview sentence names every term the channel
bullet's head enumeration carries (red today), or fold (a)/(b) into its
existing derive-then-demand pattern.

## Provenance

Seeds 1, 2, and 6 of the doc-truthing-6 brief (0436 §Fix Residual 1, 0434
§Fix Residual 1, 0432 §Fix Residual 2 — all fixer-named, none filed).
Corpus sweep: `grep -rn "four"` over `docs/spec_topics/`,
`docs/reference/`, `docs/plan_topics/`, `src/`, `tests/` filtered to
shape/payload/variant/partition/arm/details contexts; every hit
adjudicated (instances above; non-instances listed in §Non-goals).
Truth lines read at the pin: `runtime-event-channel.md:20/:22/:28/:32/:41`,
`diagnostic-shape.md:20/:42` (current — 0432+0436 composed),
`system-note-channel.ts:62/:109/:126`. Dup check: README index (462
lines) — 0432/0434/0436 fixed with the residuals quoted above; no open or
candidate report covers any instance. Sibling: [bug 0456](./0456-imports-and-lpa-stale-line-cites.md)
(citation drift), doc-truthing-6/03 (retired-quote drift) — disjoint
instance sets.

## Fix (0.443.0)

- What shipped: one mechanical comment/prose/count-word sweep, ten surfaces, zero behaviour change.
  - `docs/spec_topics/overview-and-orientation.md:65` — the Runtime-observability ownership sentence widened to "parse / load / type / runtime-panic / operator-facing-routed diagnostic batches" (mirrors the 0436 head edit), naming the fifth batch class Diagnostics owns.
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:22` — the `details: { diagnostics }` bullet gained a fourth content arm for the non-BNDR-9 operator-facing-routed case ("routed as a note other than the BNDR-9 rejection … the serialised line(s), per the per-variant matrix below"); kept one physical line, the bullet prefix, the "runtime-panic case" substring, and the errors-and-results cross-reference.
  - `docs/plan_topics/coverage-matrix.md:183` (cka-58) and `src/runtime/runtime-event-channel.ts:4` — "four `details` shapes/variants" → "five".
  - `tests/b0383-…:135`, `tests/b0398-…:101` — classifier doc comment "four normative arms" → "five" (classifier code untouched, §Non-goals).
  - `tests/b0404-…` (13 sites) — "four-shape" → count-free "partition bullet" / "`details: { diagnostics }`" wording so the file stops re-staling; `fourShapeDiagnosticsBullet`/`fourShapeIntro` identifiers left (adjacent material).
  - `tests/b0436-…` — header narration aligned to five, including the :47-48 line-range (22–26) and key parenthetical gaining `shutdown` (round-2 finding); `fourShapeIntro` identifier left.
  - `tests/tool-registration-lifetime.test.ts:85` — "four-shape `SystemNote`" → "five-shape".
  - `tests/b0401-…:5-7` — "four-arm partition" → "five-arm" and `{ shutdown }` added to the key enumeration; the population counts at :1/:12 left (different referent, §Non-goals).
- Witness: `tests/b0455-details-partition-count-consistency-gate.test.ts` (new) — cells A–E RED at fork (stale "four"), cell F green control; cell E's corpus scan bans the retired partition phrases (including the generic "four-shape") over the six header files.
- Gates: witness → 6/6; six touched test files → 39/39; `tests/citation-symbol-form-gate.test.ts` → green (the new gate files carry zero bare `:<line>` continuations); `npx tsc --noEmit` clean; `npm run lint` clean; full default suite green (parallel-load flakes only, all green isolated).
- Review: 2 rounds. R1 (bug-fix-reviewer) — 2 findings: F1 [fidelity] b0436:47-48 count-vs-enumeration contradiction; F2 [test] cell E missed instance (i)'s "four-shape `SystemNote`" spelling. R2 (bug-fix-reviewer-fast) — CLEAN after both fixed. Round 3 (bug-fix-reviewer-fast, shared with 0456/0457) confirmed the citation-ratchet remediation — CLEAN.
- Verification: SOLID (bug-fix-verifier) — witness reverts→red→restores→green (coverage-matrix:183 four↔five); full default suite green isolated; typecheck + lint clean.
- Residuals: none.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the legitimate "four" counts (four registry table pages, four internal-error carve-out codes, four captured event.reason forms, b0401's informational-note population) left intact; the partition, the matrix rows, and the emitted bytes untouched (docs/comments only).
