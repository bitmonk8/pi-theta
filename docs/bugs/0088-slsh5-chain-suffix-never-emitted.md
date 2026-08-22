# Bug 0088 — The SLSH-5 chain-attribution suffix is never emitted: both production callers of `renderTopLevelErrNote` pass `chain: []`, and its producer `recordInvocationProvenance` has no `src/` caller, so a failure cascaded three thetas deep renders byte-identical to the same failure raised in the entry theta

- **Status:** fixed (0.205.0). Live-confirmed against a real provider, zero provider
  turns; the fix carries its own live witness on the same zero-turn cascade.
- **Kind:** defect. SLSH-5 is a `MUST` on the renderer; the renderer implements
  it correctly and is pinned green by a unit test that hand-builds its input.
  Neither production call site constructs that input, and the seam that would
  produce it (`recordInvocationProvenance`, a whole module with its own unit
  test) is called from nowhere in `src/`. The omission is recorded in two
  source comments as a "deferred refinement"; no spec page defers it and no bug
  report covers it.
- **Related:**
  - [0068](./0068-prompt-callee-invoke-final-value-null.md)
    (open) is the other open defect on the `invoke` success path
    (`Ok(null)` on the prompt→prompt cell). This report is the `invoke`
    **failure** path's user-facing surface. Independent; a fix to either leaves
    the other.
  - [0073](./0073-cancelled-by-session-shutdown-never-emitted.md)
    and [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)
    (both open) are the same *shape* — a conformant renderer in-tree, pinned
    green by a unit test, with no production caller able to select it. Cited
    for class, not for content: this one is on the SLSH-3/SLSH-4/SLSH-5
    slash-dispatch boundary and its missing input is a per-hop provenance
    record, not a note template.
  - [0047](./0047-h9a-code-gate-blind-to-host-namespace.md)
    (open) explains part of why no live gate catches this: the H9a permitted-
    code gate scores note *codes*, not note *shape*, and no live assertion in
    either suite drives a cascaded `invoke_callee` to the slash boundary.
- **Affected** (citations verified at HEAD `07ef0271`):
  - `renderTopLevelErrNote` (`src/runtime/err-note-render.ts:175`) — walks
    `inner` to the leaf (`:178–181`), renders the leaf's SNK row (`:182`), and
    builds the SLSH-5 suffix strictly from `input.chain` (`:187–195`).
    Conformant; the suffix is `""` for an empty chain.
  - Production call site 1 — `emitTopLevelErrNote`
    (`src/extension/production-theta-producer.ts:1275`):
    `renderTopLevelErrNote({ thetaName, error, chain: [] })`. The literal
    `chain: []` is hard-coded. Its docstring (`:1264–1267`) states: "`chain: []`
    renders the correct leaf row for every reachable kind […]; the SLSH-5 chain
    suffix is a deferred refinement — no readily-usable invoke provenance
    reaches this boundary."
  - Production call site 2 — the SLSH-3 branch of the composition producer
    (`src/extension/theta-composition-producer.ts:430–432`), which calls
    `deps.emitTopLevelErrNote(theta.slashName, terminal.error …)`. Its comment
    (`:425–428`) repeats the same "deferred refinement" note. There is no third
    caller: `rg -n "renderTopLevelErrNote" src/` returns the definition, the
    import at `production-theta-producer.ts:302`, and `:1275`.
  - `recordInvocationProvenance` (`src/runtime/invoke-provenance.ts:111`) —
    the producer of the `InvocationRecord` (`:66`) carrying
    `parentPath` + `callSiteLine`, exactly the two SLSH-5 placeholders. `rg -n
    "recordInvocationProvenance" src/ extensions/` returns only its own
    definition. Its sole exercise is `tests/invoke-provenance.test.ts:53`,
    `:70`, `:93`.
  - The only place a populated `chain` exists in the repository is a test
    fixture: `tests/e2e-s5-slsh-chain-suffix.test.ts:175` builds
    `chain: [hop("/abs/child.theta", "/abs/parent.theta", 42)]` by hand. That
    file's own header (`:11–16`) describes the positive case as "covered in
    tests/err-note-render.test.ts" — also a direct seam call.
- **Observed at:** 0.53.0 (`07ef0271`), **live**, harness
  `tests/live/harness.ts` (`bootShippedExtension` + `driveSlashCaptureTurn`),
  real provider, session model `claude-sonnet-5`. The reproduction spends zero
  provider turns: the leaf failure is the pre-provider empty-template
  short-circuit.

## Summary

SLSH-5 makes the chain suffix a `MUST` on every SNK row whenever the failure
cascaded out of an invoked child: renderers append
` from <callee_path> invoked at <parent_path>:<line>` per `invoke_callee` hop,
leaf-first. The renderer does this. The two production call sites both pass an
empty chain, so no theta invocation at any depth ever produces a suffix. The
operator sees a failure attributed to the entry theta with no indication that
it originated in another file, which file, or at which line.

## Reproduction

Live, in-process, through the shipped extension entry. Three `.theta` files
under one project discovery root; the leaf failure is
`Err(ValidationError { cause: "empty_template" })`, which fires with
`attempts: 0` before any provider turn.

`chainchild.theta`:

```
---
mode: prompt
---
let s = ""
@`${s}`?
```

`chainparent.theta` (the `invoke(` token is on line 4):

```
---
mode: prompt
---
invoke("./chainchild.theta")?
```

`chaintop.theta` (line 4):

```
---
mode: prompt
---
invoke("./chainparent.theta")?
```

`chaindirect.theta` is a byte copy of `chainchild.theta`, registered under its
own name as the no-hop control.

```
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/scratch-conv-chain.test.ts
```

`theta-system-note` entries read off the settled in-memory `SessionManager`
after each `session.prompt(...)` resolves:

```
=== /chaindirect notes=1
  "theta /chaindirect returned Err: rendered query template was empty — no provider turn was issued"
=== /chainparent notes=1
  "theta /chainparent returned Err: rendered query template was empty — no provider turn was issued"
=== /chaintop notes=1
  "theta /chaintop returned Err: rendered query template was empty — no provider turn was issued"
```

The one-hop and two-hop cascades are byte-identical to the zero-hop control
modulo the theta name. Neither ` from ` nor `invoked at` appears in any note.

That the wrapper *is* an `invoke_callee` is witnessed by the notes themselves:
`renderTopLevelErrNote` only reaches the SNK-b row after
`isInvokeCalleeError` unwraps to the leaf (`:178–181`); an unwrapped
`invoke_callee` would have taken the SNK-k catch-all and rendered
`… returned Err: invoke_callee — …`.

## Expected behaviour

- `docs/spec_topics/slash-invocation.md:54` (SLSH-5) — "renderers **MUST**
  append a chain suffix to the per-`kind` row above. The suffix is built by
  walking `inner` recursively to the leaf and emitting, for each
  `invoke_callee` hop encountered, the literal text
  ` from <callee_path> invoked at <parent_path>:<line>`, in leaf-first order
  (innermost hop first), each hop separated from the next by a single space."
  `<callee_path>` / `<parent_path>` are "the post-`realpath` absolute paths
  recorded at the invocation site"; `<line>` is "the 1-indexed source line […]
  of the call-site token […] — the `invoke(` token of a literal `invoke(...)`
  expression".
- `:50` — "The chain suffix applies to every row, including the catch-all,
  whenever the failure cascaded from an invoked child."
- SLSH-5's own worked examples (`:56–59`) pin the single-hop and three-level
  multi-hop forms.

Expected for the reproduction (`<abs>` = the realpath'd temp workspace root):

```
theta /chainparent returned Err: rendered query template was empty — no provider turn was issued from <abs>/chainchild.theta invoked at <abs>/chainparent.theta:4
theta /chaintop returned Err: rendered query template was empty — no provider turn was issued from <abs>/chainchild.theta invoked at <abs>/chainparent.theta:4 from <abs>/chainparent.theta invoked at <abs>/chaintop.theta:4
```

## Actual behaviour / root cause

Both call sites hard-code `chain: []`:

```ts
// production-theta-producer.ts:1275
content: renderTopLevelErrNote({ thetaName, error, chain: [] }),
```

so `input.chain.slice().reverse().map(...).join("")` (`:187–195`) is always
`""`.

The stated reason — "no readily-usable invoke provenance reaches this
boundary" — is accurate about the *plumbing*, not about the *data*. The two
halves SLSH-5 needs both exist and are separately correct:

- `<callee_path>` is already on the wire: it is
  `InvokeCalleeError.callee_path` on each wrapper, and the renderer's own
  `ChainHop.calleePath` field (`err-note-render.ts:62–70`) is documented as
  reading it off the wrapper.
- `<parent_path>:<line>` is what `recordInvocationProvenance`
  (`invoke-provenance.ts:111`) produces, `realpath`-normalising the parent
  through the injected `FileSystem` seam and recording the call-site token's
  1-indexed line (`:116–120`). `InvokeCallSite` (`:37`) already enumerates both
  theta 1.0 surfaces (`literal_invoke` and the `.theta`-callable bare
  identifier).

What is missing is the per-frame retention: nothing calls the producer at the
`invoke` hop, and nothing carries the resulting records out to the slash
boundary alongside the error. The wrapper chain reaching
`emitTopLevelErrNote` therefore has `callee_path` but no matching parent/line
record, and the call site fills the gap with `[]` rather than a partial
suffix.

## Why it matters

1. The operator is given a wrong attribution, not a partial one. The note reads
   `theta /chaintop returned Err: …` for a failure raised inside
   `chainchild.theta` two files away. Nothing in the note, the transcript, or
   the runtime event channel says a child ran at all.
2. For a **subagent-mode** callee this note is the *only* user-facing surface
   for the failure (`slash-invocation.md:26`, SLSH-3): the child's transcript
   is private by construction, so the suffix is the entire provenance channel.
   Losing it makes a failed subagent cascade indistinguishable from a local
   failure.
3. SLSH-4 pins these strings as spec-versioned normative templates that
   "conformance tests MAY assert on". A conformance test written against
   SLSH-5's worked examples fails at HEAD for every input.
4. The gap is invisible to every existing gate. The unit tests supply the
   `ChainHop` themselves, so the renderer is green; no live test drives a
   cascaded `invoke_callee` to the slash boundary; and the H9a note gate scores
   codes rather than shapes (bug 0047).

## Non-goals

- Not about the SNK per-kind rows. All rows in `renderLeafKindNote`
  (`err-note-render.ts:109–166`) were read against the SLSH-4 table at this
  HEAD and match, including the em-dash, the SNK-a/SNK-b `cause` split, and the
  SNK-h `respond` fallback. SNK-b was additionally confirmed live above.
- Not about the leaf-walk. `renderTopLevelErrNote` recurses through `inner`
  correctly, which the live control pair demonstrates.
- Not about the model-invoked `.theta`-callable surface, which SLSH-5 (`:54`)
  explicitly exempts and `tests/e2e-s5-slsh-chain-suffix.test.ts` already
  pins.
- Not a proposal to change the suffix text, ordering, or path normalisation.

## Fix

Carry the provenance the producer already knows how to build.

1. Call `recordInvocationProvenance` at each executed `invoke` hop — the two
   surfaces are already enumerated by `InvokeCallSite`
   (`invoke-provenance.ts:37`) — and retain the returned `InvocationRecord` on
   the hop's frame, beside the `InvokeChain` value the producer threads today
   (`production-theta-producer.ts:2158`, `:2991`, `:3025`, `:3044`, `:3111`).
2. When an `invoke_callee` wrapper is constructed, pair the wrapper's
   `callee_path` with that frame's record, so the wrapper chain and the record
   chain stay index-aligned by construction.
3. At the two call sites, walk the wrapper chain outermost-first (the order
   `ErrNoteInput.chain` documents at `err-note-render.ts:89–94`) and pass the
   assembled `ChainHop[]` instead of `[]`. The renderer already reverses to
   leaf-first.

Constraints any fix must satisfy:

- Paths are post-`realpath` absolute (`slash-invocation.md:54`), the same
  normalisation discovery-root containment uses. `recordInvocationProvenance`
  already routes through the `FileSystem` seam for this; do not re-derive at
  the render seam (`err-note-render.ts:57–61` states the record is consumed,
  never re-derived).
- `<line>` is the call-site token's line, never a receiving binding's.
- `chain` must stay empty for a non-cascaded error and for the model-invoked
  `.theta`-callable surface, or the exemption test
  (`tests/e2e-s5-slsh-chain-suffix.test.ts`) reds for the right reason.
- The suffix applies to the SNK-k catch-all too (`:50`).

Recommended order: land the retention (1)+(2) first — it is inert until a
consumer reads it — then (3), which flips the observable in one line per call
site. A live regression witness is cheap and provider-free: the reproduction
above spends zero tokens, so it can be added to `tests/live/` as a
`from …/child.theta invoked at …/parent.theta:4` assertion, with the red
direction proven by asserting the pre-fix (suffix-free) string first.

## Provenance

- Spec: `docs/spec_topics/slash-invocation.md:26` (SLSH-3, subagent-mode
  boundary), `:33` (SLSH-4), `:50`, `:54` (SLSH-5 and its worked examples);
  `docs/reference/discovery-cli.md:219`, `:281`.
- Implementation: `src/runtime/err-note-render.ts:46`, `:55–96`, `:109–166`,
  `:175–197`; `src/runtime/invoke-provenance.ts:37`, `:66–80`, `:111–120`;
  `src/extension/production-theta-producer.ts:302`, `:1258–1279`;
  `src/extension/theta-composition-producer.ts:301`, `:420–432`.
- Tests establishing the seam is exercised only by hand:
  `tests/invoke-provenance.test.ts:53`, `:70`, `:93`;
  `tests/e2e-s5-slsh-chain-suffix.test.ts:108`, `:175`;
  `tests/err-note-render.test.ts:39`.
- Existing reports read in full for duplicate separation: 0024, 0030, 0047,
  0048, 0064, 0068; skimmed 0010, 0011, 0073, 0079.
- Observations: throwaway live vitest probe
  (`tests/live/scratch-conv-chain.test.ts`) over `tests/live/harness.ts` at
  `07ef0271`, deleted after the run.

## Fix (0.205.0)

- What shipped:
  - `src/runtime/invoke-provenance-ledger.ts` (new) — §Fix (2)'s retention seam:
    a producer-instance-scoped `WeakMap<InvokeCalleeError, ChainHop>` built by
    `createInvocationProvenanceLedger` (a factory return, no module state).
    `attach` pairs a wrapper with the `InvocationRecord`
    `recordInvocationProvenance` produces and the callee path normalised by the
    same `FileSystem.realpath` seam call, and never rejects: a `realpath`
    rejection records no hop rather than converting a returned `Err` value into
    a thrown abort. `chainFor` walks the wrapper chain outermost-first, the
    order `ErrNoteInput.chain` documents.
  - `src/runtime/effectful-statement-host.ts` — §Fix (1): an optional
    `recordInvokeHop?` seam on `EffectfulStatementHostDeps` (the same
    progressive-enhancement shape as `classifyCall?`/`resolveCallAsInvoke?`),
    called in `runInvokeEffect` immediately after the `invoke_callee` wrapper is
    built, with the `invoke(` token's own position as the call site.
  - `src/extension/production-theta-producer.ts` — §Fix (1)+(3): one ledger per
    producer instance, `#recordInvokeHop` resolving the callee against
    `theta.sourcePath`'s directory exactly as `#recheckCalleeContainment` does,
    the dep wired into all three `EffectfulStatementHostDeps` construction
    sites, and `emitTopLevelErrNote` passing the assembled chain instead of the
    hard-coded `[]`.
  - `src/extension/theta-composition-producer.ts` — comment only; the SLSH-3
    call site's code is unchanged (it passes the raw top-level error, and the
    chain is assembled inside `emitTopLevelErrNote`).
- Gates: witness `tests/slsh5-invoke-cascade-chain-suffix.test.ts` 4/4 and
  `tests/slsh5-invoke-ledger-realpath-rejection.test.ts` 2/2 green, each
  red-proven by neutralising the fix and restored byte-exact; full `npm test`
  `Test Files 389 passed (389)` / `Tests 8014 passed (8014)`;
  `npm run typecheck` clean; `npm run lint` clean; live
  `tests/live/slsh5-invoke-cascade-chain-suffix-live-cell.test.ts` 1/1 green
  under the shared live lock, also red-proven and restored.
- Review: 2 rounds. Round 1 (deep) — 5 findings: an unguarded `realpath`
  rejection able to turn an `Err` value into a thrown abort (fixed, with its own
  witness); the code-side `.theta`-callable surface uncovered (adjudicated as
  recorded exclusion, R1); the callee path form (adjudicated: bare `realpath`
  stays, matching the untouched `recordInvocationProvenance`; prose corrected);
  stale/pre-fix-world citations in the witness header (re-derived, symbol form);
  an unverifiable "recorded residual" claim in a doc comment (reworded).
  Round 2 (fast) — CLEAN, with one non-blocking observation (R6).
- Verification: SOLID. Witnesses red on neutralisation and green on byte-exact
  restoration (`git hash-object` quoted both times, no `git checkout`/`restore`/
  `stash`); default suite green in one unfiltered run; a real H8a live run
  exercises the one-hop and two-hop cascade and the no-hop control end to end
  through the shipped extension with zero provider turns; lint and typecheck
  clean.
- Residuals:
  1. The code-side `.theta`-callable bare-identifier call
     (`InvokeCallSite`'s `theta_callable_bare`) carries no hop: the
     theta-callable branch of `runToolCallEffect` returns the callee's own
     `Result` through unchanged (FN-5) and constructs no `invoke_callee`
     wrapper, so there is nothing for the ledger to key on. Covering it means
     changing that pass-through — a behavioural change outside this §Fix's three
     steps — and is excluded here by adjudication, not by oversight. Evidence:
     the only two `invoke_callee` constructors in `src/` are
     `surfaceThetaCallableCalleeFailure` (`src/runtime/tool-call.ts`, reached
     from `runInvokeEffect`) and `subagentCalleeError`
     (`src/runtime/statement-executor.ts`).
  2. A cascade that crosses the RFC-0006 subagent envelope renders a PARTIAL
     chain: a wrapper rebuilt from JSON in another process has no object
     identity and therefore no ledger entry, so its hop is omitted. Each
     `ChainHop` is self-contained, so an omitted hop shortens the suffix and
     never mis-attributes one.
  3. `src/runtime/invoke-provenance.ts`'s module header states the parent path
     is obtained "via the shared `canonicalizePath` identity" while its
     implementation applies a bare `realpath`. Pre-existing prose discrepancy in
     a file this fix does not touch; the ledger matches the implementation, so
     both placeholders of one rendered suffix are in one identical form.
  4. The change adds lines above the cited regions of
     `production-theta-producer.ts` (+65 before its former `:1489`),
     `effectful-statement-host.ts` (+24) and `theta-composition-producer.ts`
     (+1), so pre-existing `path:line` citations into those files from other
     test files shift. A round-1 14-citation sample found every one of them
     already stale before this change (the bug-0134 decay class); this fix's own
     new citations are symbol form.
  5. The H9a permitted-code gate is untouched and unanswered: the live run was
     H8a only, and that question is decided by a real H9a run alone.
  6. `attach`'s rejection-to-`undefined` guard is broader than the ENOENT/EPERM
     race it documents — any rejection degrades to "no hop recorded". This is
     the adjudicated remedy (an `attach` that cannot reject) and mirrors the
     existing `readBytes`/`checkInvokePathAtLoad` idiom in
     `src/extension/production-composition.ts`.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the renderer
  (`src/runtime/err-note-render.ts`) is unchanged — it was already conformant.
  The suffix text, hop ordering and path normalisation are unchanged (§Non-goals).
  The wrapper's theta-visible `callee_path` field is left as authored. The
  model-invoked `.theta`-callable exemption holds by construction (that surface
  builds no wrapper) and `tests/e2e-s5-slsh-chain-suffix.test.ts` stays green and
  unedited.
