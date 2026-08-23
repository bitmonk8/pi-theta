# Bug 0248 — The bug-0106 grammar gate suppresses the INV-1 containment refusal for a malformed `tools:` entry at depth 0 while the bug-0111 nested loop still reports it at depth 1: the identical `<out-of-root>.theta junk` entry draws `theta/load/malformed-tool-entry` alone when the caller writes it and `theta/load/invoke-path-escape` when a callee writes it, and no cell in the tree pins either half

- **Status:** fixed (0.231.0)
- **Sev/Diff estimate:** S3/D1 — the primary defect is a verification gap: the
  0.216.0 gate narrowed the escape loop's input set and the fix record says so
  ("it is unwitnessed: no cell pairs a malformed entry with an escaping first
  token"), so a route that later ungates the cache, or gates the nested loop,
  reds nothing. D1 because the repair is a three-line predicate in one file
  plus cells in existing witness files, with no new registry row and no spec
  sentence added. The composed measurement raises one behavioural face beside
  the gap — the same entry shape draws different codes at the two depths, the
  disagreement class bug
  [0111](./0111-nested-callee-tools-entries-no-load-time-containment.md)
  closed — which is arguably S2; the disposition is settled below by the
  registry *Trigger*, so it does not add adjudication cost.
- **Kind:** defect — implementation (one behavioural face) and verification gap
  (the headline). Two callers of the same projection answer opposite questions:
  the pre-parse callee-cache loop in `resolveThetaToolsAtLoad`
  (`src/extension/production-composition.ts`) gates on `parseToolsEntry`
  (`src/parser/callable-set.ts`) before `toolsEntrySpec` runs, so a malformed
  entry never enters `calleeCache` and neither the V15f `callee-has-errors`
  loop nor the INV-1 escape loop over that cache has a member for it;
  `checkNestedToolsContainment` (same file, bug 0111's depth-1 surface) routes
  by `isBareToolName` alone and judges containment for a malformed entry.
- **Affected:**
  - `src/extension/production-composition.ts` — `resolveThetaToolsAtLoad`
    (the `parseToolsEntry` gate on the callee-cache loop, and the escape loop
    over `calleeCache.values()` that drains `callee.escape` and
    `callee.nestedToolsEscapes`), `checkNestedToolsContainment` (the ungated
    `toolsEntrySpec` entry loop), `toolsEntrySpec` (the doc comment stating
    each caller's own grammar decision).
  - `tests/tools-entry-grammar-derivations-lockstep.test.ts` — bug 0106's
    24-cell witness. Its group (A) pairs a malformed entry with an erroneous
    in-root callee and with a missing file; no cell pairs one with an
    out-of-root path.
  - `tests/tools-entry-containment.test.ts` (bug 0110, depth 0) and
    `tests/nested-tools-entry-containment.test.ts` (bug 0111, depth 1) — every
    escaping entry in both files is well-formed; neither file mentions a
    malformed entry.
  - No spec page. `theta/load/invoke-path-escape` keeps its row, its severity
    and its *Trigger* under the fix below.
- **Observed at:** HEAD `b9cf2f26`, v0.219.0 (`package.json:3`). Measured by a
  scratch vitest probe through `discoverAndComposeFixtures`
  (`src/extension/production-composition.ts`) over a real on-disk `.pi/theta/`
  workspace plus a second `mkdtemp` directory outside every active discovery
  root, reading codes off the headless stderr mirror (`makeLoadEmit`) — the
  harness shape of bug 0106's own witness. Written, run, deleted.

## Summary

Bug 0106's fix (0.216.0) put a `parseToolsEntry` gate at the head of the
pre-parse callee-cache loop in `resolveThetaToolsAtLoad`: an entry whose token
sequence the closed grammar rejects is skipped before `toolsEntrySpec` reads its
first token, so no callee is read or parsed for it. The intended effect was to
close the `theta/load/callee-has-errors` co-fire. The cache also feeds the INV-1
escape loop (bug 0110, widened by bug 0111), so the gate also removed
`theta/load/invoke-path-escape` from every malformed entry. 0106's §Fix records
the narrowing as residual 2 and states its status: trigger-conformant,
registration unchanged, "but it is unwitnessed: no cell pairs a malformed entry
with an escaping first token. … A control cell belongs to whoever next owns that
surface."

That is still true at HEAD, and the composed case is measured here for the first
time. A caller whose entry is both malformed and escaping draws
`theta/load/malformed-tool-entry` alone; the well-formed control drawing
`theta/load/invoke-path-escape` alone confirms the escape surface is live in the
same run. Three malformed spellings and two escaping spellings behave alike, and
nothing registers either way.

The measurement also finds one face the residual does not name.
`checkNestedToolsContainment`, bug 0111's depth-1 containment surface, did not
receive the gate: it routes entries by `isBareToolName` and judges containment
for a malformed one. So the identical entry text — `<out-of-root>/far.theta
junk` — draws `theta/load/malformed-tool-entry` when the discovered caller
writes it, and `theta/load/invoke-path-escape` against the caller's file when a
`tools:`-reached callee writes it. Bug 0111's headline was that the identical
entry shape must draw the identical report whichever depth names it; for this
shape class the two depths disagree again, in the opposite direction from 0111's.

Neither half is pinned. Removing the gate, or adding it to the nested loop, reds
no cell in the tree.

## Reproduction

Offline, at `b9cf2f26`. One scratch vitest file. A workspace `mkdtemp`
directory holds `.pi/theta/` with the planted callers and the in-root callees
plus a `{}` `.pi/settings.json`; a second `mkdtemp` directory holds the
out-of-root callees and is named by absolute forward-slash spec (and, for one
cell, by a `..`-relative spec). `discoverAndComposeFixtures(pi, ctx)` runs with
`ctx.cwd` = the workspace; codes come off the stderr mirror, `REGISTERED` from
the returned fixtures' slash names. Every caller's body is `` @`hi` ``; every
caller is `mode: subagent`. `<OUT>` stands for the out-of-root directory.

Planted callees:

```
<OUT>/far.theta          `mode: subagent` + `@`hi``                    [clean, out of root]
<OUT>/farbroken.theta    + `params:` `x: NoSuchType`                   [erroneous, out of root]
.pi/theta/zbroken.theta  + `params:` `x: NoSuchType`                   [erroneous, in root]
.pi/theta/zgood.theta    `mode: subagent` + `@`hi``                    [clean, in root]
```

### Depth 0 — the composed case and its controls

```
@@ ctlesc        tools: [ - <OUT>/far.theta ]              [CONTROL: well-formed, escaping]
   theta/load/invoke-path-escape: invoke path '<OUT>/far.theta' resolves outside every active
                                  discovery root                            (located 1:1, + hint)
@@ mesc2         tools: [ - <OUT>/far.theta junk ]         [COMPOSED: malformed + escaping]
   theta/load/malformed-tool-entry: malformed 'tools:' entry '<OUT>/far.theta junk'; expected a
                                  Pi tool name or a .theta path, optionally followed by an 'as'
                                  clause                                    (file-only, no hint)
@@ mescas        tools: [ - <OUT>/far.theta as ]           [COMPOSED, dangling `as`]
   theta/load/malformed-tool-entry: … entry '<OUT>/far.theta as'; …
@@ mesc4         tools: [ - <OUT>/far.theta as r junk ]    [COMPOSED, 4 tokens]
   theta/load/malformed-tool-entry: … entry '<OUT>/far.theta as r junk'; …
@@ mescrel       tools: [ - ../../../<OUT>/far.theta junk ] [COMPOSED, `..`-relative spelling]
   theta/load/malformed-tool-entry: … entry '../../../<OUT>/far.theta junk'; …

@@ ctlescbroken  tools: [ - <OUT>/farbroken.theta ]        [CONTROL: well-formed, escaping, erroneous]
   theta/load/invoke-path-escape: … '<OUT>/farbroken.theta' …
@@ mescbroken    tools: [ - <OUT>/farbroken.theta junk ]   [COMPOSED, escaping AND erroneous]
   theta/load/malformed-tool-entry: … entry '<OUT>/farbroken.theta junk'; …
@@ cofire        tools: [ - ./zbroken.theta junk ]         [CONTROL: 0106 (A1), in-root erroneous]
   theta/load/malformed-tool-entry: … entry './zbroken.theta junk'; …
@@ ctlgood       tools: [ - ./zgood.theta ]                [CONTROL: well-formed, in root]
   []

REGISTERED :: ["ctlgood","zgood"]
```

Every composed row draws the grammar rejection alone. The two well-formed
escaping controls draw the containment refusal alone, at `1:1` with the
registered *Hint*, so the escape surface is live in the same run and the
composed rows' silence is the gate, not a missing precondition. `mescbroken`
shows the two suppressions compose: neither `invoke-path-escape` nor
`callee-has-errors` reaches an entry the grammar rejects. Registration is
identical to bug 0106's measured baseline — only the two clean fixtures survive,
and no composed row registers.

### Depth 1 — the same entry text, one level in

```
@@ nestmesc      tools: [ - <OUT>/far.theta junk ]     [the callee, discovered in its own right]
   theta/load/malformed-tool-entry: … entry '<OUT>/far.theta junk'; …
@@ callnestmesc  tools: [ - ./nestmesc.theta ]         [caller, WELL-FORMED entry naming it]
   theta/load/invoke-path-escape: invoke path '<OUT>/far.theta' resolves outside every active
                                  discovery root                            (located 1:1, + hint)

@@ nestwesc      tools: [ - <OUT>/far.theta ]          [CONTROL: the callee's entry well-formed]
   theta/load/invoke-path-escape: … '<OUT>/far.theta' …
@@ callnestwesc  tools: [ - ./nestwesc.theta ]         [CONTROL: caller, 0111's shipped class]
   theta/load/invoke-path-escape: … '<OUT>/far.theta' …
```

`callnestmesc` and `mesc2` name the same entry text against the same
out-of-root file. `mesc2` draws the grammar rejection alone; `callnestmesc`
draws the containment refusal, ranged at its own file head exactly as bug 0111
prescribes. The `callnestmesc` / `callnestwesc` pair is byte-identical in
output, so at depth 1 the malformed and the well-formed entry are
indistinguishable — the state depth 0 left in 0.216.0.

### The witness search

`rg -l "invoke-path-escape" tests/` returns five files; none of them mentions
`malformed-tool-entry` or a multi-token entry. Bug 0106's witness
(`tests/tools-entry-grammar-derivations-lockstep.test.ts`, 24 `it` cells) names
no out-of-root path. Every escaping entry in `tests/tools-entry-containment.test.ts`
(30 cells) and `tests/nested-tools-entry-containment.test.ts` (29 cells) is
single-token. No cell in the tree observes any row above.

## Expected behaviour

- **A narrowing of a shipped refusal's input set is pinned by a cell.** The
  0.216.0 gate moved `theta/load/invoke-path-escape` off an input class it
  previously fired for. Whether that is right or wrong, the tree records no
  observation of it: with the gate removed, cells (A1)–(A3) of bug 0106's
  witness red on the `callee-has-errors` co-fire and nothing reds on the escape
  half. This is bug 0106 §Fix residual 2's own statement of the obligation —
  "A control cell belongs to whoever next owns that surface."
- **The *Trigger*'s subject test does not depend on depth.**
  `theta/load/invoke-path-escape`'s *Trigger* is "An `invoke(...)` literal or a
  `tools:` `.theta` entry resolves (post-realpath) to a path that lies outside
  every active discovery root" (`code-registry-load.md:35`). The closed grammar
  says a malformed token sequence is not an entry of either admitted kind
  (`frontmatter-fields-a.md:88`), so it is not that *Trigger*'s subject — the
  reasoning the 0.216.0 gate records at its site. Bug 0111 settled that the
  *Trigger* "names the entry kind, not the entry's depth", and closed a
  two-depth disagreement on exactly that ground. The same subject test therefore
  has to give the same answer at depth 1, and at HEAD it does not.
- **The identical entry shape draws the identical report whichever depth names
  it.** Bug 0111's headline requirement, stated in the escape loop's own comment
  in `resolveThetaToolsAtLoad`. Measured above: `<OUT>/far.theta junk` draws
  `theta/load/malformed-tool-entry` at depth 0 and `theta/load/invoke-path-escape`
  at depth 1.
- **One authoring mistake draws one diagnostic that names it.** The reason bug
  0106 closed the depth-0 co-fire (`code-registry-load.md:25`: one malformed
  entry un-registers the whole theta — the rejection is the entry's own
  disposition). At depth 1 the author of `nestmesc` receives the grammar
  rejection on their own file and, separately, an escape refusal on every caller
  that names them, for an entry that creates no callable under either reading.
- **No spec sentence orders the two rules.** The §`tools` rejection family
  (`frontmatter-fields-b-and-templates.md:18`) lists ten codes, does not include
  `theta/load/invoke-path-escape`, and orders none of them.
  `frontmatter-fields-a.md:88`, `tool-calls.md:14` and `invocation.md:12` each
  state their own rule without reference to the other. So
  grammar-before-containment is not a spec'd ordering; it follows from the
  *Trigger*'s subject test alone, and that is where it must be recorded and
  applied uniformly.

## Actual behaviour / root cause

**One projection, two callers, opposite grammar decisions.** `toolsEntrySpec` is
a pure first-token projection; its doc comment says each of its two callers
applies the grammar decision on its own side, and names them:

- `resolveThetaToolsAtLoad`'s pre-parse callee-cache loop gates on
  `parseToolsEntry(entry.trim()).kind !== "ok"` and `continue`s, so a malformed
  entry never becomes a `calleeCache` key.
- `checkNestedToolsContainment` "applies its own path-shaped routing
  (`isBareToolName`) rather than the closed grammar, because it judges only
  discovery-root containment, not entry well-formedness".

Both sentences are in the same file. The first says a malformed sequence is not
the containment rule's subject; the second says entry well-formedness is not the
containment rule's concern. They cannot both hold: the two loops apply the same
rule, `checkInvokePathAtLoad`, to entries drawn from the same grammar.

**The cache is the single input to both post-cache loops.** After the gated
loop builds `calleeCache`, `resolveThetaToolsAtLoad` walks it twice: the INV-1
loop over `calleeCache.values()` pushes `callee.escape` and each
`callee.nestedToolsEscapes` member, re-located at the caller's file; the V15f
loop over `calleeCache` entries pushes `callee-has-errors`. A gate at the cache
head therefore narrows both rules at once. Bug 0106's fix names
`callee-has-errors` as its subject and records the escape narrowing as a
consequence; the escape half received no cell.

**Depth 1 reaches the containment check by a different path.**
`parseCalleeForTools` runs `checkNestedToolsContainment` over the callee's own
`tools:` list and returns the escapes as `nestedToolsEscapes`. That list is the
callee's raw frontmatter entries, and the function's loop skips only empty specs,
bare Pi-tool names and already-judged specs. A malformed entry survives all
three, so `toolsEntrySpec` hands it a first token and the containment check
judges it — the pre-0.216.0 depth-0 behaviour, still live one level in.

**Two spec citations in the gate comment are off by one.** The gate comment
cites `code-registry-load.md:34` for `theta/load/invoke-path-escape`'s *Trigger*
and `:40` for `theta/load/callee-has-errors`'. At HEAD those rows are `:35` and
`:41`; `:34` is `theta/load/invocation-cycle` and `:40` is
`theta/load/argument-hint-not-displayed`. Both were already off by one in the
0.216.0 commit itself (`77592027`), so this is a transcription defect at
filing, not registry drift.

**Zero corpus exposure.** 35 committed `.theta` / `.thetalib` files, 12 with a
top-level `tools:`, 16 entries, every one a single token, zero `as` clauses,
zero out-of-root paths. No committed file reaches any row above.

## Why it matters

- **A shipped refusal lost an input class with no observation.** Between
  0.215.0 and 0.216.0 the set of inputs drawing `theta/load/invoke-path-escape`
  shrank, and no cell in the tree records that it did (the witness search
  above). The next edit to
  the cache-head gate — widening it, moving it, or replacing `parseToolsEntry`
  with a re-tokenisation — changes the escape surface silently in either
  direction.
- **The two depths disagree about the same bytes.** Bug 0111 was filed and
  fixed because "the identical entry un-registers its caller at depth 0 and
  mints its callable at depth 1". For the malformed-and-escaping class the
  disagreement is back with the depths swapped: refused on the grammar at depth
  0, refused on containment at depth 1. Nothing observes the pair, so a reader
  of either witness file sees a coherent surface.
- **The depth-1 emission names a subject the closed grammar denies.** This is
  the co-fire class bug 0106 closed at depth 0, one level in: `callnestmesc`'s
  author is told a `tools:` `.theta` entry escapes the discovery roots, for a
  token sequence that is not a `tools:` `.theta` entry.
- **No sandbox consequence, measured.** Every row un-registers its caller — the
  grammar rejection at depth 0, the escape at depth 1 — so no malformed escaping
  entry mints a callable under either reading, and `REGISTERED` is unchanged
  from bug 0106's baseline. What is wrong is which code the author receives and
  the absence of any cell fixing it.
- **The residual named an owner that has not appeared.** Three fix rounds have
  landed since 0.216.0 (0.217.0, 0.218.0, 0.219.0) and
  `src/extension/production-composition.ts` is unmodified across all three
  (`git log 77592027..HEAD -- src/extension/production-composition.ts` is
  empty). The residual's "whoever next owns that surface" is this report.

## Non-goals

- **Reopening the entry grammar, or the closed-grammar rejection's message,
  severity or all-or-nothing posture.** `frontmatter-fields-a.md:88` and
  `code-registry-load.md:25` are settled; every row above draws the rejection
  the spec prescribes at depth 0.
- **Reopening bug 0106's depth-0 disposition on `callee-has-errors`.** The
  co-fire closure and its cells (A1)–(A6) stand unchanged; this report adds a
  sibling axis to the same gate.
- **Bug 0106 §Fix residual 1, the parse-time substitution.** `pshape` and
  `pshadow` keep their adjudicated disposition; no row here involves
  `toolCallableName` or `piToolCallableName`.
- **Bug 0111's scope bound.** A callee reached by an `invoke(...)` literal
  rather than a `tools:` entry still has its own nested `tools:` unjudged; that
  residual is 0111's and is untouched here.
- **The empty `relatedSites` on the `tools:`-surface `callee-has-errors`
  emission,** and `preEvalCauseOf`'s ERR-6 enumeration (bug 0109). Both
  pre-existing and orthogonal.
- **Bug 0106 §Fix residual 3, the 69 files carrying shifted line citations.**
  The two off-by-one spec citations repaired below are inside the gate comment
  this fix edits; no other file's citations are renumbered.

## Fix

Apply the same grammar gate at depth 1, so one subject test governs the
containment rule at both depths, and pin both halves with cells.

**(a) Gate `checkNestedToolsContainment`'s entry loop on `parseToolsEntry`.**
The loop skips an entry whose `parseToolsEntry(entry.trim())` is not `ok`,
before `toolsEntrySpec` runs — the same three lines, in the same position, as
the depth-0 cache loop. A malformed token sequence is then no subject for
`theta/load/invoke-path-escape` at either depth, which is what
`code-registry-load.md:35`'s *Trigger* reads together with
`frontmatter-fields-a.md:88`, and what bug 0111 settled when it ruled the
*Trigger* names the entry kind and not its depth. The callee still draws
`theta/load/malformed-tool-entry` on its own file when it is discovered, so no
input loses its refusal.

**(b) Rewrite `toolsEntrySpec`'s doc comment.** It currently records two
opposite rationales for its two callers. After (a) both callers gate on
`parseToolsEntry` before calling it, so the comment states one rule: the
projection is grammar-free and every caller applies the closed grammar first.

**(c) Repair the two off-by-one spec citations in the cache-head gate
comment** — `code-registry-load.md:34` → `:35`, `:40` → `:41` — verified by
reading both rows at the fix baseline. Comment text only.

**(d) Witness.** Cells added to
`tests/tools-entry-grammar-derivations-lockstep.test.ts` (the gate's own
witness) rather than split across the two containment files, so one file pins
the gate's whole input set:

1. Depth 0, composed: the three malformed spellings against an out-of-root
   callee draw `[theta/load/malformed-tool-entry]` exactly.
2. Depth 0, control: the well-formed escaping entry draws
   `[theta/load/invoke-path-escape]` exactly, located `1:1` with the *Hint*.
   Without it, cell 1 passes when the escape surface is dead.
3. Depth 1, composed: a caller naming — with a well-formed entry — a contained
   callee whose own entry is malformed and escaping draws no
   `theta/load/invoke-path-escape`; the callee draws
   `theta/load/malformed-tool-entry` on its own file. This is the cell the fix
   turns from red to green.
4. Depth 1, control: bug 0111's shipped class — the callee's escaping entry
   well-formed — keeps `[theta/load/invoke-path-escape]` at the caller's file.
5. Registration: the composed rows register nothing, and the clean control
   registers, in the same run.

Constraints on the implementation:

1. **Registration is unchanged and pinned as such.** Measured:
   `REGISTERED :: ["ctlgood","zgood"]` with the depth-1 fixtures planted. No
   caller in any row above may register after the fix, and the clean control
   must keep registering.
2. **The well-formed containment surface is byte-identical at both depths.**
   `tests/tools-entry-containment.test.ts` (30 cells) and
   `tests/nested-tools-entry-containment.test.ts` (29 cells) pass unmodified;
   the fix adds a `continue` on an input class neither file plants.
3. **Bug 0106's cells (A1)–(A6) and the parse-time groups pass unmodified.**
   The depth-0 gate is not moved, widened or narrowed.
4. **No new diagnostic code, no registry edit, no spec sentence.** The fix
   makes one existing *Trigger*'s subject test uniform across two call sites;
   DIAG-2 (`diagnostic-shape.md:72`) is not reached. If a route instead
   concludes that containment must precede the grammar at both depths, that is
   the opposite uniformity and reaches `code-registry-load.md:35` and bug
   0106's landed disposition — it is rejected here, because it re-opens the
   co-fire bug 0106 closed on the same *Trigger* reasoning.
5. **GOV-15.** No input moves from loads-cleanly to refused: every row above
   already carries an error-severity diagnostic and un-registers. What changes
   is the code one depth-1 caller receives. Corpus census re-run at the fix
   baseline; at this HEAD it is zero — 35 committed `.theta` / `.thetalib`, 12
   with `tools:`, 16 single-token entries, no out-of-root path.
6. **Offline, provider-free, behavioural witness.** Every cell settles in one
   `discoverAndComposeFixtures` call over a planted workspace plus a second
   out-of-root `mkdtemp` directory. No integration or live tier is reachable
   for a load-time observable that settles before any model or transport
   exists.
7. **No ordering dependency.** Bugs 0106, 0110 and 0111 are fixed and shipped
   (0.216.0, 0.66.0, 0.206.0); their witness rows are unmodified by this fix, so
   no pinned-byte coordination is required.

## Fix (0.231.0)

- What shipped:
  - `src/extension/production-composition.ts` —
    `checkNestedToolsContainment`'s entry loop gates on
    `parseToolsEntry(entry.trim()).kind !== "ok"` before `toolsEntrySpec` runs,
    the same three lines in the same position as the depth-0 cache-head gate
    (§Fix (a); the loop body's `judged` set is reached only by entries the
    grammar admits, so a malformed spelling can no longer pre-empt a
    well-formed duplicate's judgement).
  - `src/extension/production-composition.ts` — `toolsEntrySpec`'s doc comment
    states ONE rule: the projection is grammar-free and every caller gates on
    `parseToolsEntry` first (§Fix (b)). The adjoining `parseCalleeForTools` /
    `checkNestedToolsContainment` doc comments name where that gate now sits.
  - `src/extension/production-composition.ts` — the depth-0 cache-head gate
    comment's two off-by-one citations repaired, `code-registry-load.md:34` →
    `:35` and `:40` → `:41` (§Fix (c)), both rows re-read at the fix baseline
    (`:34` is `theta/load/invocation-cycle`, `:40` is
    `theta/load/argument-hint-not-displayed`).
  - `tests/tools-entry-grammar-derivations-lockstep.test.ts` — group (D),
    insert-only (+503/−0), with its OWN planted workspace, out-of-root
    `mkdtemp` directory and production load, so bug 0106's plant set, its
    shared outcome and its (A6) registration lock are untouched: (D0) the
    walk-discovered precondition, (D1) the three malformed escaping spellings
    draw `[theta/load/malformed-tool-entry]`, (D2) the well-formed escaping
    control draws `[theta/load/invoke-path-escape]` at the file head with its
    registered *Hint*, (D3) the depth-1 composed row draws no containment
    refusal, (D4) bug 0111's shipped class keeps it, (D5) the group's exact
    registration outcome.
  - `tests/live/b0248live-nested-malformed-escape-live-cell.test.ts` — new live
    sibling of bug 0106's own live cell: the same observable through the
    shipped composition root (`session_start` → `resources_discover` →
    `composeExtensionInstance`), read off the settled `theta-system-note`
    channel and the real registration step. No `prompt()` drive, so no tokens
    beyond credential resolution.
  - No spec sentence, no registry row, no new diagnostic code, and
    `tests/fixtures/h7a/permitted-codes.json` unmodified — the fix REMOVES an
    emission (§Fix constraint 4).
- Gates: witness `npx vitest run
  tests/tools-entry-grammar-derivations-lockstep.test.ts` → 32 passed (24
  pre-existing 0106 cells + group (D)); constraint-2 files
  `tests/tools-entry-containment.test.ts` (37) and
  `tests/nested-tools-entry-containment.test.ts` (29) unmodified and green;
  full default suite `npm test` → 409 files / 8607 tests passed;
  `npm run typecheck` clean; `npm run lint` clean;
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/b0248live-nested-malformed-escape-live-cell.test.ts` → 1 passed.
- Review: 1 round — clean, no findings. The reviewer re-derived the five
  registry-row citations, proved the 0106 file's diff carries zero deleted
  lines, and red-pathed both gates (removing the depth-1 gate reds (D3)/(D5);
  removing the depth-0 gate reds (D1) and 0106's (A1)–(A3)). One correction
  round preceded review: the group's cells were moved onto their own workspace
  and their registration expectations corrected (below).
- Verification: SOLID. Witness validity — the depth-1 gate neutralised by
  targeted byte edit reds (D3) and (D5) with the depth-1
  `theta/load/invoke-path-escape` signature, restored byte-exact
  (`git hash-object` re-matched) and green. Default suite green. Live — the
  live cell passes with the fix, reds under the same neutralisation (the
  composed caller un-registers and the escape note appears), restored
  byte-exact and green again; no open bug doc carries a matching pinned
  signature. Lint and typecheck clean.
- Residuals:
  1. **§Fix constraint 1 is factually wrong about registration, and the fix
     record supersedes it.** Post-fix the depth-1 composed caller — a
     well-formed, in-root, error-free entry naming a contained callee whose OWN
     entry is malformed and escaping — draws no diagnostic and REGISTERS, where
     before the fix the escape refusal un-registered it. This is forced by
     §Fix (a) rather than chosen: `parseCalleeForTools` derives `hasErrors`
     from `parseThetaDocument`'s diagnostics, while
     `theta/load/malformed-tool-entry` is raised later by `resolveCallableSet`,
     so `theta/load/callee-has-errors`' V15f input can never see an
     entry-grammar rejection at any depth. Measured evidence that this is the
     shipped class and not a new one: a caller naming a callee whose own entry
     is malformed but IN-ROOT already registers today and is untouched by the
     gate, so the fix makes the out-of-root class agree with the in-root class.
     GOV-15 direction is a removed refusal, not a new one. Cells (D3) and (D5)
     pin the outcome; the live cell pins it through the shipped root.
  2. **No out-of-root callable is minted by that registration.** The callee's
     own callable-set resolution rejects the malformed entry by the same closed
     grammar at its own load and again on the dispatch parse, where an
     error-severity diagnostic leaves the child with the empty callable set; the
     runtime open-time re-check remains the backstop. Traced, not measured by a
     dedicated cell.
  3. **Whether a caller SHOULD be told that its callee's own `tools:` entry is
     malformed** is untouched here. Neither depth reports it, in-root or
     out-of-root, because the V15f input cannot see it. Widening
     `callee-has-errors` to entry-grammar rejections would move an input class
     from loads-cleanly to refused (GOV-15) and needs its own report.
  4. **Bug 0106 §Fix residual 3** (the 69 files carrying shifted line
     citations) stays open: only the two citations inside the gate comment this
     fix edits were repaired.
- Discharge notes appended: none. Bug 0106 §Fix residual 2 — "a control cell
  belongs to whoever next owns that surface" — is discharged by (D1)/(D2)
  here; the residual's own `code-registry-load.md:34` citation is corrected in
  the gate comment rather than in 0106's record.
- Pinned dispositions / non-goals: the entry grammar, its message, severity and
  all-or-nothing posture; bug 0106's depth-0 `callee-has-errors` disposition and
  its cells (A1)–(A6); bug 0106 §Fix residual 1 (`pshape`/`pshadow`); bug 0111's
  scope bound (an `invoke(...)`-reached callee's nested `tools:` stays
  unjudged); the empty `relatedSites` on the `tools:`-surface
  `callee-has-errors` emission and `preEvalCauseOf`'s ERR-6 enumeration.
  Containment-before-grammar was rejected at filing and stays rejected: it
  re-opens the co-fire bug 0106 closed on the same *Trigger* reasoning.

## Provenance

- Origin: bug
  [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md)
  `## Fix (0.216.0)` §Residuals item 2, "**The gate also narrows the INV-1
  escape loop.** … Trigger-conformant on the same reasoning
  (`code-registry-load.md:34` presupposes 'a `tools:` `.theta` entry') and
  registration is unchanged, but it is unwitnessed: no cell pairs a malformed
  entry with an escaping first token. Recorded in the gate comment. A control
  cell belongs to whoever next owns that surface." The same round's review
  round 1 recorded it as one of three non-blocking residuals ("the unrecorded
  second narrowing of the INV-1 escape loop"). This report is that filing. What
  the residual states and this report measures: the composed depth-0 case,
  three malformed spellings, two escaping spellings, with the well-formed
  escaping control that proves the surface live. What the residual does not
  state and this report adds: `checkNestedToolsContainment` did not receive the
  gate, so the identical entry draws a different code at depth 1; and the
  residual's own `code-registry-load.md:34` is off by one at HEAD and was off by
  one in the 0.216.0 commit.
- Spec: `docs/spec_topics/diagnostics/code-registry-load.md:25`
  (`theta/load/malformed-tool-entry` and its *Trigger*), `:35`
  (`theta/load/invoke-path-escape`, its *Trigger*, its `load, runtime` phase
  column and its *Hint*), `:41` (`theta/load/callee-has-errors`);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:88` (the closed
  per-entry grammar);
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` (the
  §`tools` rejection family — ten codes, `invoke-path-escape` absent, no
  order); `docs/spec_topics/tool-calls.md:14` (a `tools:` `.theta` path that
  escapes "is rejected with `theta/load/invoke-path-escape` and the callable is
  not created"); `docs/spec_topics/invocation.md:12` (the realpath +
  discovery-root containment rule, and "a `tools:` `.theta` entry that escapes
  likewise fails to register the callable"), `:14` (INV-1);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4).
- Implementation evidence at `b9cf2f26`, all in
  `src/extension/production-composition.ts` unless noted:
  `resolveThetaToolsAtLoad` — the pre-parse callee-cache loop with its
  `parseToolsEntry` gate and its `toolsEntrySpec` / `isBareToolName` routing,
  the INV-1 loop over `calleeCache.values()` draining `callee.escape` and
  `callee.nestedToolsEscapes`, and the V15f `checkCalleeHasErrors` loop over the
  same cache; `toolsEntrySpec` and its doc comment naming both callers;
  `isBareToolName`; `parseCalleeForTools` and its doc comment (containment
  judged after the read and before `parseThetaDocument`, `nestedToolsEscapes`
  attached to the result); `checkNestedToolsContainment` and its doc comment
  (the `isBareToolName` routing, the `judged` set, the `checkInvokePathAtLoad`
  call, the rejection-to-`undefined` idiom); `makeLoadEmit` (the stderr mirror
  the probe reads); `TOOLS_DIAGNOSTIC_RANGE`. In `src/parser/callable-set.ts`:
  `parseToolsEntry` (the closed token-count test) and its use inside
  `resolveCallableSet`.
- Test and corpus evidence at `b9cf2f26`:
  `tests/tools-entry-grammar-derivations-lockstep.test.ts` (bug 0106's witness,
  24 `it` cells; group (A) is the co-fire matrix whose harness this report's
  probe reuses); `tests/tools-entry-containment.test.ts` (bug 0110, 30 cells,
  every escaping entry single-token); `tests/nested-tools-entry-containment.test.ts`
  (bug 0111, 29 cells, same); `rg -l "invoke-path-escape" tests/` → five files,
  none mentioning `malformed-tool-entry` or a multi-token entry; the corpus
  census — `find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
  "./node_modules/*" -not -path "./.git/*"` (35 files) and a per-file scan of
  every `tools:` block (12 files, 16 entries, all single-token, 5 of them
  `.theta` paths, none out of root).
- Related: bug [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md)
  (the depth-0 containment check, fixed 0.66.0); bug
  [0111](./0111-nested-callee-tools-entries-no-load-time-containment.md) (the
  depth-1 widening and the depth-independence ruling, fixed 0.206.0); bug
  [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) (the gate,
  fixed 0.216.0); bug
  [0069](./0069-tools-entry-residue-silently-dropped.md) (the closed grammar and
  the `parseToolsEntry` export).
- Reproduction: one scratch vitest probe at `b9cf2f26` — nine depth-0 fixtures
  (four composed spellings, four controls, one clean control), four depth-1
  fixtures (composed and control, caller and callee), four planted callees
  across two directories, run through `discoverAndComposeFixtures` over a real
  on-disk workspace with the out-of-root directory created by a second
  `mkdtempSync`, codes and order read off the stderr mirror and registration off
  the returned fixtures. Run on the outputs quoted above, then deleted per
  scratch policy. `src/`, `tests/`, `docs/bugs/README.md` and every other bug
  doc are unmodified by this filing.
