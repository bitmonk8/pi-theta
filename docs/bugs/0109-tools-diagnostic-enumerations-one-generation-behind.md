# Bug 0109 — Two shipped enumerations of the `tools:` diagnostic family are one generation behind the closed registry: `preEvalCauseOf`'s ERR-6 `tools-resolution` batch names six of the eight `tools:`-surface codes, so `theta/load/malformed-tool-entry` and `theta/load/unresolvable-theta-path` are classified as the ERR-3 `frontmatter` cause; and `functions.md` FN-7's `with { tools: … }` reuse list names five of the seven codes the entry resolver emits, omitting `theta/load/malformed-tool-entry` (landed by 0069, 0.62.0) and `theta/load/invalid-derived-tool-name` (landed by 0070, 0.63.0)

- **Status:** fixed (0.234.0). §Fix was settled: two independent, mechanical edits — two
  conditions added to one `if` in `src/extension/production-composition.ts`, two
  codes added to one sentence in `docs/spec_topics/functions.md` — plus one
  witness for the first. Neither edit adds or removes a `theta/*` code, and no
  runtime observable moves. One coordination clause, not an ordering
  dependency: [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md)
  §Non-goals names finding 1's subject and records it "Unfiled"; this report is
  that filing, so the fix retenses that bullet to point here.
- **Sev/Diff estimate:** S4/D2 — both findings are documentation-fidelity
  defects with no behavioural observable (routing is cause-invariant, and the
  `with { tools: … }` clause emits no `tools:` code today), so the benefit is
  corpus fidelity, not corrected behaviour; D2 because the finding-1 witness
  asserts a module-private mapping and therefore needs `preEvalCauseOf`
  exported plus a per-code cell, which exceeds a one-file no-witness edit.
- **Kind:** two instances of one defect class — an enumeration that claims to
  list the `tools:` diagnostic family, written before the family's last two
  members existed and not extended when they landed. The two instances are
  disjoint in file, in reader, and in the codes they omit.
  1. *Implementation-side.* `preEvalCauseOf`
     (`src/extension/production-composition.ts:267–291`) maps each shipped
     load-path diagnostic code to the pre-evaluation failure cause it realises.
     Its ERR-6 `tools-resolution` batch (`:274–283`) lists six codes; the
     `tools:` surface emits eight; the two absent codes fall to the ERR-3
     `frontmatter` default (`:287–289`).
  2. *Spec-side.* `docs/spec_topics/functions.md:70` (FN-7) enumerates the
     `tools:` diagnostics a `subagent fn`'s `with { tools: … }` clause reuses.
     It names five of the seven codes `resolveCallableSet` emits.
- **Related:**
  - [0070](./0070-theta-callable-default-name-unvalidated.md) — **fixed
    (0.63.0)**, the parent. Its fix added `theta/load/invalid-derived-tool-name`
    to the ERR-6 batch (the added line is `production-composition.ts:278`),
    which is what exposed finding 1, and left FN-7 alone: §Fix *Residuals*
    item 4 (`:475–479`) records finding 1 ("Not fixed here: neither code is
    this bug's") and item 5 (`:480–483`) records finding 2 ("Left alone rather
    than half-corrected"). Its fixer report states the reason for the second
    disposition — the list is left "uniformly one generation behind rather than
    inconsistently patched" — and recommends filing item 5 "with residual 4 —
    same class, same commit's worth of work". No ordering dependency: 0070
    shipped in 0.63.0 and is the tree this report measures.
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed
    (0.62.0)**, which landed `theta/load/malformed-tool-entry`, the one code
    both enumerations omit. Its fix record (`:125–137`) shows the same class
    caught once in review: the §`tools` rejection-family enumeration in
    `frontmatter-fields-b-and-templates.md` "omitting the new member" was one
    of three prose defects orchestrator review added to that fix's round-1
    finding, and all four were discharged in the same commit. That enumeration
    is current today; these two are not.
  - [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) — open.
    Its §Non-goals (`:703–711`) scopes finding 1 out in the same terms this
    report re-derives, cites `production-composition.ts:274–282` and
    `:257–260`, and closes "Unfiled". The two reports do not collide: 0106's
    subject is three `tools:`-entry grammar derivations that re-split entry text
    outside the lock-step 0069 closed (`toolsEntrySpec`, `toolCallableName`,
    `piToolCallableName`), which this report does not touch, and this report's
    finding-1 edit is confined to the `if` at `:274–283`.
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md),
    [0105](./0105-malformed-tool-entry-message-embeds-raw-newline.md),
    [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md) — open, the
    rest of the `tools:`-surface wave. All disjoint from these two edits: 0104
    is the field-level value shape in `extractToolsList`, 0105 is
    `malformed-tool-entry`'s rendered message, 0107 is the shape of 0069's
    lock-step witness. A fourth sibling, 0108, is named in the same wave; no
    `docs/bugs/0108-*.md` exists at HEAD, so no link is given here.
- **Affected** (every citation verified at HEAD `846c110a`, 0.63.0):
  - `src/extension/production-composition.ts:267–291` — `preEvalCauseOf`.
    `:274–283` is the ERR-6 `tools-resolution` batch: `theta/load/unknown-tool`,
    `theta/load/tool-name-collision`, `theta/load/invalid-tool-rename`,
    `theta/load/invalid-derived-tool-name`, `theta/load/prompt-mode-callable`,
    `theta/load/callee-has-errors`. `:287–289` is the `theta/load/` prefix
    default returning `"frontmatter"` — the arm both omitted codes reach.
  - `src/extension/production-composition.ts:254–266` — the same function's doc
    comment, which states the contract the batch fails: "an honest mapping
    documents which pre-eval cause each shipped load-path diagnostic realises"
    (`:260–261`), and which names the routing-neutrality this report verifies
    (`:257–260`: the discriminant "is carried for caller / reload-integration
    reuse rather than driving routing").
  - `src/parser/callable-set.ts:195`, `:208`, `:249`, `:261`, `:372`, `:391`,
    `:408` — the seven `code: "theta/load/…"` literals `resolveCallableSet`
    emits: `malformed-tool-entry`, `invalid-tool-rename`,
    `invalid-derived-tool-name`, `tool-name-collision`, `unknown-tool`,
    `unresolvable-theta-path`, `prompt-mode-callable`. This is the family both
    enumerations claim to cover.
  - `src/extension/production-composition.ts:1431–1443` — the eighth
    `tools:`-surface code: `checkCalleeHasErrors({ … surface: "tools" … })` for
    a readable `.theta` callee carrying its own errors, pushed into the same
    diagnostic array `resolveCallableSet`'s output joins (`:1480–1485`).
  - `src/extension/production-composition.ts:699` —
    `sink.emitGroup(toolResult.diagnostics)`, the single delivery point for all
    eight codes on the compose pass.
  - `src/extension/production-composition.ts:1119–1122`, `:1156–1167` — the
    `loadSink` whose `emitGroup` is `emitLoadNoteGroup`, and the
    `runComposePass(…, loadSink, …)` call that installs it for the shipped
    `session_start` path. `:1098–1115` is `emitLoadNoteGroup`, whose `:1103`
    calls `preEvalRouter.routePreEvalFailure(preEvalCauseOf(diagnostic.code), …)`
    once per error-severity diagnostic. `:1154` (`const emitErr7 = loadSink`)
    routes the watcher-time re-compose through the same mapping, so
    `preEvalCauseOf` is the only code-to-cause reader in the tree for both
    paths.
  - `src/extension/production-composition.ts:342–360` —
    `discoverAndComposeFixtures`, the harness entry, which passes
    `sinkOverPerDiagnosticEmit(makeLoadEmit(ctx))` (`:355`) instead. The two
    sinks share the compose pass and differ in delivery, as `runComposePass`'
    doc comment states (`:370–371`): "toast/stderr on the helper path; the
    `theta-system-note` channel on the shipped `session_start` and watcher-time
    ERR-7 paths alike". Consequence for §Reproduction: harness-driven tests
    prove code emission, not the cause mapping.
  - `src/extension/load-pre-eval.ts:125–137` — `routePreEvalFailure`. The body
    is `void cause;` (`:135`) followed by one `sendSystemNote(note, deps.channel)`
    (`:136`). No branch reads `cause`; this is the routing-neutrality claim's
    whole evidence.
  - `docs/spec_topics/functions.md:70` — FN-7. Its `tools` clause reads, verbatim:
    "a `tools` entry through `theta/load/unknown-tool` /
    `theta/load/unresolvable-theta-path` / `theta/load/prompt-mode-callable` /
    `theta/load/tool-name-collision` / `theta/load/invalid-tool-rename`". Five
    of seven; `theta/load/malformed-tool-entry` and
    `theta/load/invalid-derived-tool-name` are absent.
  - `src/parser/theta-document.ts:943–994` — `resolveSubagentSessionConfig`, the
    FN-7 projection. Its `tools` arm (`:973–975`) assigns
    `toolNameList(field.value)` and sets `toolsOverridden`, raising no
    diagnostic; `toolNameList` (`:1056–1069`) collects identifier and string
    elements and drops everything else silently.
  - `src/parser/theta-document.ts:2231–2262` — `parseWithClause`. The only
    diagnostic it raises is `theta/load/unknown-frontmatter-field` for a key
    outside the five (`:2243–2251`). No value shape is judged here.
  - `src/extension/subagent-fn-static-checks.ts:296–324` —
    `checkSubagentFnModelOverrides`, the whole of the shipped load-time
    with-clause validation. Its single `withClause` read (`:303`) selects
    `field.key === "model"`; the file contains no `tools` arm.
  - `src/extension/production-theta-producer.ts:3369–3397` —
    `subagentFnCallableSet`, where a `with { tools: … }` override takes effect at
    dispatch. It intersects the named set with the calling theta's frozen
    callable set, and its doc comment states the disposition: "a name absent
    from the calling set simply does not appear". No diagnostic, no refusal.
  - `docs/spec_topics/diagnostics/code-registry-load.md:25–31` — the seven
    resolver-emitted rows in registry order; `:39` the `callee-has-errors` row
    whose *Severity is per surface* clause makes the `tools:` surface `E`. This
    page and its mirror are the authorities the enumerations must agree with.
  - `docs/reference/diagnostics.md:188–191`, `:194–196` — the mirror rows for
    the same seven codes (`:192–193` are two unrelated load codes interleaved);
    `:204` the `callee-has-errors` mirror. `:302–306` is the mirror's `subagent fn` note,
    which delegates rather than enumerating ("a `with { … }` session-config
    clause reuses the like-named frontmatter fields' load-time codes (see
    [Functions — FN-6…FN-9])"), so finding 2 has no `docs/reference/` mirror to
    correct.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` —
    the §`tools` rejection-family enumeration, current: it names all seven
    resolver codes plus `theta/load/callee-has-errors`, including both codes
    the two stale enumerations omit. The positive precedent.
  - `docs/reference/frontmatter.md:117–141` — §"Two entry kinds", the second
    current enumeration: `:129` carries `theta/load/invalid-derived-tool-name`
    (0070), `:139` carries `theta/load/malformed-tool-entry` (0069), `:136`
    carries `theta/load/callee-has-errors`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, the closed
    registry rule this report anchors on.
  - `docs/spec_topics/errors-and-results/error-model.md:20` — ERR-6, whose text
    is "`tools:` resolution failure" plus a link to the §`tools` rules. That is
    the label finding 1's two codes do not receive.
  - `tests/pre-evaluation-failures.test.ts:159–173`, `:201–223` — the two cells
    that exercise the ERR-6 cause. Both construct the `(cause, code)` pair by
    hand and hand it to `routePreEvalFailure`; neither reads `preEvalCauseOf`,
    which is module-private (no `export`). No test in the tree pins the mapping.
  - `tests/tools-entry-closed-grammar.test.ts:364–380` (group (B1); groups
    (B2)–(B6) follow through `:470`) — `theta/load/malformed-tool-entry` proven
    reachable through the shipped compose pass over a real on-disk `.pi/theta/`
    workspace.
  - `tests/callable-set.test.ts:113–124` —
    `theta/load/unresolvable-theta-path` proven at the `resolveCallableSet`
    seam. Its production reachability is stated at
    `production-composition.ts:1601–1603` (an unreadable callee "drives
    `theta/load/unresolvable-theta-path` through `resolveCallableSet`") and was
    measured live by 0070's fix (`:498–502`: `./nosuch.bar.theta` fired the code
    as that probe's negative control).
- **Observed at:** `0.63.0` (HEAD `846c110a`), Windows. Offline, deterministic;
  no live model, no provider. Established by source inspection at HEAD plus the
  three existing test files named above, run green (53 tests).

## Summary

Two shipped enumerations of the `tools:` load-diagnostic family are one
generation behind the registry. Both were written before the family's last two
members existed; neither was extended when they landed.

1. `preEvalCauseOf` maps a load diagnostic's code to the pre-evaluation failure
   cause it realises. The `tools:` surface emits eight codes; the ERR-6
   `tools-resolution` batch names six. `theta/load/malformed-tool-entry`
   (0069, 0.62.0) and `theta/load/unresolvable-theta-path` (older than both)
   fall through to the `theta/load/` prefix default and are reported as ERR-3
   `frontmatter`.
2. FN-7 states which diagnostics a `subagent fn`'s `with { tools: … }` clause
   reuses. It names five of the seven codes the entry resolver emits, omitting
   `theta/load/malformed-tool-entry` (0069, 0.62.0) and
   `theta/load/invalid-derived-tool-name` (0070, 0.63.0).

Neither is a wrong runtime observable. Finding 1 is routing-neutral:
`routePreEvalFailure` discards its `cause` argument and delivers every cause
over one channel with one fixed option set. Finding 2 describes a validation
path the implementation does not yet run: the shipped `with { tools: … }` clause
selects a subset of the calling theta's already-resolved callable set and emits
no `tools:` code at all. Both are therefore fidelity defects — a shipped
statement about the diagnostic family that the family has outgrown.

The two are independent edits with a shared cause. They touch different files,
serve different readers, and omit different codes; the only thing they share is
that a fix which added a `tools:` code did not extend them. They are filed
together because that is one commit's worth of work, as 0070's fix record
recommends.

## Reproduction

Both findings are established by reading the tree at HEAD; neither produces a
distinguishable runtime observable (§Actual behaviour proves why). Every command
below is offline.

**Finding 1 — the ERR-6 batch against the family it claims.**

```sh
# The batch: six codes. `malformed-tool-entry` and `unresolvable-theta-path`
# are absent; the `theta/load/` prefix default at :287-289 catches them.
sed -n '254,291p' src/extension/production-composition.ts

# The family the entry resolver emits: seven codes.
rg -n 'code: "theta/load' src/parser/callable-set.ts

# The eighth `tools:`-surface code, added on the load path.
rg -n 'surface: "tools"' src/extension/production-composition.ts
```

Set difference of the second and third outputs against the first:
`theta/load/malformed-tool-entry`, `theta/load/unresolvable-theta-path`.

**Finding 1 — the neutrality of the mapping.**

```sh
# `void cause;` then one `sendSystemNote`. No branch reads the discriminant.
sed -n '121,140p' src/extension/load-pre-eval.ts
```

**Finding 1 — both omitted codes reach the mapping.**

```sh
# `malformed-tool-entry` through the shipped compose pass (groups B1-B6);
# `unresolvable-theta-path` at the resolver seam. Green at HEAD.
npx vitest run tests/tools-entry-closed-grammar.test.ts tests/callable-set.test.ts
```

Those tests drive `discoverAndComposeFixtures`, whose sink is the toast/stderr
router, so they witness emission, not cause. The mapping is reached because
`composeInstance` passes `loadSink` into the same compose pass
(`production-composition.ts:1156–1167`), and `emitLoadNoteGroup` calls
`preEvalCauseOf` on every error-severity diagnostic that pass emits (`:1103`).

**Finding 2 — the enumeration and its reachability.**

```sh
# FN-7's `tools` clause: five codes.
sed -n '70p' docs/spec_topics/functions.md

# The whole shipped with-clause load-time validation: `model` only.
rg -n 'withClause' src/extension/subagent-fn-static-checks.ts

# The with-clause `tools` projection: a name list, no validation.
sed -n '943,994p' src/parser/theta-document.ts

# Where the override takes effect: subset selection against the calling
# theta's frozen callable set, silent on an absent name.
sed -n '3369,3397p' src/extension/production-theta-producer.ts
```

No shipped path resolves a `with { tools: … }` entry through
`resolveCallableSet`, so the clause emits none of the seven codes today —
including the five FN-7 does name. The finding is that FN-7's list of the family
is incomplete, not that a specific emission is missing.

## Expected behaviour

DIAG-2 (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`) closes the
registry: "Adding a new code, removing a code, or changing a code's namespace,
severity, or trigger are all spec changes — not implementation changes. New
diagnostic sites added by future spec work MUST land their codes in this table
at the same time." A corpus implements that discipline by keeping every
enumeration that claims to list a family in step with the family, so that adding
a code is one commit and not a commit plus a backlog.

The authorities the enumerations must agree with are the two registry pages:
`docs/spec_topics/diagnostics/code-registry-load.md:25–31` and its mirror
`docs/reference/diagnostics.md:188–191`, `:194–196`. The current full `tools:`
rejection family, in registry order, is:

| Code | Emitted by | Landed |
|---|---|---|
| `theta/load/malformed-tool-entry` | `callable-set.ts:195` | 0069, 0.62.0 |
| `theta/load/unknown-tool` | `callable-set.ts:372` | pre-existing |
| `theta/load/unresolvable-theta-path` | `callable-set.ts:391` | pre-existing |
| `theta/load/prompt-mode-callable` | `callable-set.ts:408` | pre-existing |
| `theta/load/tool-name-collision` | `callable-set.ts:261` | pre-existing |
| `theta/load/invalid-tool-rename` | `callable-set.ts:208` | pre-existing |
| `theta/load/invalid-derived-tool-name` | `callable-set.ts:249` | 0070, 0.63.0 |
| `theta/load/callee-has-errors` (`tools:` surface, `E`) | `production-composition.ts:1431–1443` | pre-existing |

Expected, per finding:

1. `preEvalCauseOf` classifies every one of those eight as ERR-6
   `tools-resolution` — the cause `error-model.md:20` defines as "`tools:`
   resolution failure" — because that is what its doc comment promises
   (`production-composition.ts:260–261`) and because the ERR-3 arm's own comment
   scopes itself to "frontmatter / params value rejections" (`:288`).
2. FN-7 names every code a `with { tools: … }` entry can reuse under the
   frontmatter `tools:` rules, so that the list is a complete statement of the
   reuse contract rather than a snapshot of it.

`docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` and
`docs/reference/frontmatter.md:117–141` are the positive precedent: both
enumerate the family, both were extended by 0069 (`0069-…:104–108`) and again by
0070 (`0070-…:274–278`), and both are current at HEAD. 0069's fix record shows
the obligation being enforced in review — the omission of the new member from
the first of those two was one of three prose defects orchestrator review added
to that fix's round-1 finding, and all four were discharged in the same commit
(`0069-…:125–137`). The obligation
is understood in this corpus, which is what makes these two enumerations defects
rather than open questions.

## Actual behaviour / root cause

### Finding 1 — the ERR-6 batch

`preEvalCauseOf` is a code-prefix cascade: two singleton codes, then the ERR-6
`tools:` batch, then a `theta/parse/` prefix arm, then a `theta/load/` prefix
arm returning `"frontmatter"`, then a default. The batch is a literal
disjunction of six string equalities (`:274–283`). A `tools:`-surface code
absent from that disjunction is not unmatched — it matches the `theta/load/`
prefix arm one branch later and is reported as ERR-3.

Root cause: the batch is a hand-maintained copy of a set that lives elsewhere.
`resolveCallableSet` owns the family; the batch restates part of it. Nothing
links the two, and nothing fails when they diverge. 0069 added
`theta/load/malformed-tool-entry` to the resolver and to two prose enumerations
without touching the batch; `theta/load/unresolvable-theta-path` was never in
it. 0070 added its own new code (`production-composition.ts:278`), which is what
made the two absences visible.

**The mapping drives nothing today.** `routePreEvalFailure`
(`load-pre-eval.ts:125–137`) takes the cause as its first parameter, discards it
with `void cause;` (`:135`), and calls `sendSystemNote(note, deps.channel)`
(`:136`). One channel, one fixed option set, seven causes. So a `tools:`
rejection reported as ERR-3 delivers exactly the note it would deliver as ERR-6:
same `theta-system-note` channel, same `triggerTurn:false`, same rendered
content, same `details.diagnostics`. There is no observable to correct.

What would change if the router ever branched on cause: every per-cause
behaviour would be selected wrongly for these two codes. Concretely, the seams a
branch would plausibly use are the ones ERR-16 already uses — a cause-specific
note template, a cause-specific `details` shape (`:168–176` builds
`details: { event: … }` for the cross-route), or a cause-specific consumer on the
reload-integration path the discriminant is retained for (`:257–258`). Under any
of those, a malformed `tools:` entry and an unresolvable `.theta` path would be
handled as frontmatter value rejections: the wrong template, the wrong payload,
or the wrong consumer. The mapping is also the only code-to-cause reader in the
tree, and both the `session_start` path and the watcher-time re-compose path
read it (`production-composition.ts:1103`, `:1154`), so the error would land on
both.

### Finding 2 — FN-7's reuse list

FN-7 states that the `with { … }` clause "is validated at load time against the
same rules that govern the corresponding frontmatter fields … and reuses those
fields' diagnostics rather than coining parallel codes", then enumerates the
reuse per key. The `tools` entry in that enumeration reads, verbatim
(`functions.md:70`):

> a `tools` entry through `theta/load/unknown-tool` /
> `theta/load/unresolvable-theta-path` / `theta/load/prompt-mode-callable` /
> `theta/load/tool-name-collision` / `theta/load/invalid-tool-rename`

Five codes. The frontmatter `tools:` rules those five are drawn from now reject
on seven (§Expected behaviour). `theta/load/malformed-tool-entry` closes the
per-entry grammar as of 0069 and is the disposition of every token sequence
outside it; `theta/load/invalid-derived-tool-name` judges a `.theta` entry's
derived default name as of 0070. A clause entry is subject to both under the
sentence's own "same rules" premise, and neither appears.

Root cause is the same shape as finding 1 — a restatement with no link to the
source — with one difference: 0070's fix saw this one and left it, deliberately.
Its §Fix *Residuals* item 5 records "Left alone rather than half-corrected"
(`0070-…:483`), and its fixer report gives the reason: the list stays "uniformly
one generation behind rather than inconsistently patched". Adding only 0070's
own code would have left a list that is stale in one member and current in
another, with nothing to say which.

**Reachability, scoped.** The `with { tools: … }` clause does not route through
`resolveCallableSet` in the shipped implementation, so it cannot emit any of the
seven codes — the two omitted or the five named:

- The parser projects the clause's `tools` value into the session config as a
  bare name list (`theta-document.ts:973–975`, `toolNameList` at `:1056–1069`)
  and raises no diagnostic. `parseWithClause` (`:2231–2262`) raises only
  `theta/load/unknown-frontmatter-field`, and only for a key outside the five.
- Load-time with-clause validation covers `model` and nothing else:
  `checkSubagentFnModelOverrides` (`subagent-fn-static-checks.ts:296–324`) is
  the only consumer of `withClause` outside the parser, and it selects
  `field.key === "model"` (`:303`).
- At dispatch, `subagentFnCallableSet`
  (`production-theta-producer.ts:3369–3397`) intersects the named set with the
  calling theta's frozen callable set and drops unmatched names silently, as its
  doc comment states.

So FN-7's `tools` clause is a specified obligation with no implementing site
yet. That does not make the omission harmless — the list is what an
implementation of that obligation will read, and it is the corpus's only
statement of which codes the clause reuses — but it does bound the fix: the
finding is spec-prose only, and correcting it moves no observable and creates no
emission.

## Why it matters

- **The mapping's stated purpose is defeated for two codes.** Its doc comment
  offers "an honest mapping" of which pre-eval cause each shipped diagnostic
  realises (`production-composition.ts:260–261`). For
  `theta/load/malformed-tool-entry` and `theta/load/unresolvable-theta-path` it
  is a wrong one, and the wrongness is invisible: no test reads the function,
  and no observable differs.
- **It is a latent defect behind a neutrality that is not contractual.** The
  discriminant is retained precisely so callers and the reload integration can
  read it (`:257–258`). The first reader that branches on cause inherits two
  misclassified `tools:` codes, and the misclassification is silent at that
  point too.
- **A stale reuse list is the input to the work that implements it.** FN-7's
  five-code list is the corpus's only statement of the `with { tools: … }` reuse
  contract; `docs/reference/diagnostics.md:302–306` delegates to it rather than
  restating it. Whoever wires with-clause `tools` validation reads that list and
  reproduces its gaps.
- **The class re-offends.** Three enumerations of this family are current
  (`frontmatter-fields-b-and-templates.md:18`, `docs/reference/frontmatter.md`
  §"Two entry kinds", the two registry pages); two are one generation behind.
  The corpus has already caught the class once in review (0069) and once in
  residuals (0070). Closing both instances and pinning the code-side one with a
  witness removes the part of it that no reviewer can see.

## Non-goals

- **Whether either omitted code *belongs* to ERR-6 on the merits.** ERR-6 is
  "`tools:` resolution failure" (`error-model.md:20`) and both codes are
  `tools:` entry rejections raised by the callable-set resolver, so the answer
  is settled by the cause's own definition. This report does not reopen the
  ERR-1…ERR-6/ERR-16 cause taxonomy, the prefix-cascade shape of
  `preEvalCauseOf`, or the ERR-3 arm's scope.
- **Making `routePreEvalFailure` branch on cause.** Its one-surface design is
  pinned by `load-pre-eval.ts:3–7` and witnessed by
  `tests/pre-evaluation-failures.test.ts`. This report measures the mapping's
  fidelity, not the router's shape.
- **Implementing FN-7's `with { tools: … }` load-time validation.** The clause
  emits no `tools:` code today (§Actual behaviour finding 2). That divergence
  between FN-7's "validated at load time" sentence and the shipped
  subset-selection behaviour is real, distinct from an enumeration gap, and
  unfiled. This report neither widens nor narrows FN-7's contract; it completes
  the list the contract already states.
- **The two older absences from FN-7's list.**
  `theta/load/callee-has-errors` — the eighth `tools:`-surface code, `E` on that
  surface per `code-registry-load.md:39` — is also absent from FN-7, and
  `theta/load/invoke-path-escape`'s registry trigger (`:33`) names "a `tools:`
  `.theta` entry" although the only shipped sites walk
  `collectInvokeExprs(input.body)` (`invoke-static-checks.ts:195`, `:240`) and
  never a `tools:` entry. Both predate FN-7's drafting, so neither is an instance
  of this report's class — an enumeration a later fix failed to extend — and
  both are left where they are so the fix stays the two-code lock-step repair.
  Unfiled.
- **`docs/bugs/README.md`.** Updated centrally, not here.

## Fix

Two edits, one commit. Neither adds nor removes a `theta/*` code, so DIAG-2 is
satisfied by the registry rows that already exist
(`code-registry-load.md:25–31`, mirrored at
`docs/reference/diagnostics.md:188–191`, `:194–196`),
GOV-15's three observables are untouched, and the diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:23–24`) is not
engaged: no input's emitted code sequence or `theta-system-note` content
changes.

**Step 1 — `preEvalCauseOf`'s ERR-6 batch.** Add
`code === "theta/load/malformed-tool-entry"` and
`code === "theta/load/unresolvable-theta-path"` to the disjunction at
`src/extension/production-composition.ts:274–283`, so the batch names all eight
`tools:`-surface codes. Keep registry order. Behaviour-preserving by
`routePreEvalFailure`'s cause-invariance (`load-pre-eval.ts:135–136`), so no
existing assertion moves and the change is additive in the batch only. Leave
the doc comment's contract sentence as it stands; the edit makes it true rather
than restating it.

**Step 2 — FN-7's reuse enumeration.** Add
`theta/load/malformed-tool-entry` and `theta/load/invalid-derived-tool-name` to
the `tools` clause at `docs/spec_topics/functions.md:70`, in registry order
against `code-registry-load.md:25–31`. No `docs/reference/` mirror edit is owed:
`docs/reference/diagnostics.md:302–306` delegates to FN-7 instead of restating
the list, and `docs/reference/frontmatter.md:117–141` already carries both
codes. No code change, no registry change.

**Step 3 — retense the sibling non-goal.**
[0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) §Non-goals
(`:703–711`) states finding 1 in the present tense and closes "Unfiled". After
step 1 the description is false and the disposition is stale; rewrite that
bullet to record the subject as fixed and to cite this report. Its adjacent
citation `production-composition.ts:274–282` also needs re-pointing at the
widened batch.

**Witness (owed, for step 1).** The mapping has no observable, which is why the
divergence survived two releases — so the witness asserts the mapping directly
rather than a routed note. `preEvalCauseOf` is module-private today
(`production-composition.ts:267`); export it (no runtime observable changes; the
function is pure and total on `string`) and add one table-driven cell that
asserts the cause for each code in the family, extending
`tests/pre-evaluation-failures.test.ts`:

- all eight `tools:`-surface codes → `"tools-resolution"`;
- `theta/load/host-incompatible` → `"capability-probe"`;
- `theta/load/binder-model-unresolved` → `"binder-model"`;
- one non-`tools:` load code (`theta/load/missing-mode`) → `"frontmatter"`, so
  the cell reds if the fix over-widens the batch into the ERR-3 arm;
- one `theta/parse/` code → `"lex-parse-type"`.

The cell reds today on exactly the two omitted codes, and reds on a future
`tools:` code added to the resolver but not the batch — the class this report
files. Prove both directions before landing: it must red with the two new
conditions removed, and it must red with a ninth `tools:` code added to the
family and not to the batch.

Step 2 is owed no witness: FN-7 is prose about a contract with no shipped
emission site, and the corpus has no spec-prose enumeration gate to extend.
Existing green cells to keep green:
`tests/pre-evaluation-failures.test.ts` (8 tests),
`tests/tools-entry-closed-grammar.test.ts` (28),
`tests/callable-set.test.ts`, plus the default suite.

## Provenance

- Spec measured against:
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2, closed
  registry), `docs/spec_topics/diagnostics/code-registry-load.md:25–31`, `:33`,
  `:39` (the `tools:` family rows), `docs/reference/diagnostics.md:188–191`,
  `:194–196`, `:204`, `:302–306` (the mirror and its FN-7 delegation),
  `docs/spec_topics/functions.md:70` (FN-7),
  `docs/spec_topics/errors-and-results/error-model.md:20` (ERR-6),
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` and
  `docs/reference/frontmatter.md:117–141` (the two current enumerations),
  `docs/spec_topics/governance/source-language-stability.md:23–24` (the
  diagnostic-registry carve-out, not engaged).
- Implementation: `src/extension/production-composition.ts`
  (`preEvalCauseOf:267–291`, its doc comment `:254–266`, the `tools:` delivery
  point `:699`, the `tools:`-surface `callee-has-errors` push `:1431–1443`,
  `emitLoadNoteGroup:1098–1115`, `loadSink:1119–1122`, the shipped
  `runComposePass` call `:1156–1167`, `emitErr7:1154`,
  `discoverAndComposeFixtures:342–360`), `src/extension/load-pre-eval.ts:125–137`
  (`routePreEvalFailure`), `src/parser/callable-set.ts` (the seven emission
  sites), `src/parser/theta-document.ts`
  (`resolveSubagentSessionConfig:943–994`, `toolNameList:1056–1069`,
  `parseWithClause:2231–2262`),
  `src/extension/subagent-fn-static-checks.ts:296–324`,
  `src/extension/production-theta-producer.ts:3369–3397`,
  `src/extension/invoke-static-checks.ts:195`, `:240`.
- Evidence: source inspection at HEAD `846c110a` (0.63.0), plus
  `npx vitest run tests/tools-entry-closed-grammar.test.ts tests/callable-set.test.ts tests/pre-evaluation-failures.test.ts`
  → 3 files / 53 tests green, whose stderr shows the shipped compose pass
  emitting `theta/load/malformed-tool-entry` for six planted workspaces. No
  scratch fixture was added; no file outside this report was modified.
- Filing origin: [0070](./0070-theta-callable-default-name-unvalidated.md) §Fix
  *Residuals* items 4 (`:475–479`) and 5 (`:480–483`), and that fix's fixer
  report, which recommends filing the two together. Prior sighting of finding 1:
  [0106](./0106-tools-entry-grammar-derivations-outside-lockstep.md) §Non-goals
  (`:703–711`). Prior sighting of the class:
  [0069](./0069-tools-entry-residue-silently-dropped.md) §Fix (`:125–137`).

## Fix (0.234.0)

- What shipped:
  - `src/extension/production-composition.ts` — `preEvalCauseOf`'s ERR-6
    `tools-resolution` disjunction widened by THREE codes and put in registry
    order (§Fix step 1, widened per 0108 §Fix *Residual 2*):
    `theta/load/malformed-tool-entry`, `theta/load/unresolvable-theta-path` and
    `theta/load/invalid-pi-tool-name` (0108's row, which post-dates this
    report's filing). The arm now names all nine codes of the `tools:`
    ENTRY-resolution family — the eight `resolveCallableSet`
    (`src/parser/callable-set.ts`) emits plus the `tools:`-surface
    `theta/load/callee-has-errors` `checkCalleeHasErrors` pushes. The doc
    comment's contract sentence and the ERR-3 arm are untouched; the reorder is
    behaviour-neutral (a disjunction of `===` comparisons).
  - `src/extension/production-composition.ts` — `preEvalCauseOf` gained
    `export`, the witness's stated prerequisite (§Fix *Witness*). The function
    is pure and total on `string`; no runtime observable moves.
  - `tests/pre-evaluation-failures.test.ts` — one table-driven witness cell for
    the mapping, the §Fix-owed witness for step 1.
  - `docs/spec_topics/functions.md` — FN-7's `with { tools: … }` reuse list
    widened by THREE codes in registry order (§Fix step 2, likewise widened by
    0108's row): `theta/load/malformed-tool-entry`,
    `theta/load/invalid-derived-tool-name`, `theta/load/invalid-pi-tool-name`.
    No `docs/reference/` mirror was owed and none was edited:
    `docs/reference/diagnostics.md`'s `subagent fn` note delegates to FN-7
    instead of restating the list, and `docs/reference/frontmatter.md`
    §"Two entry kinds" already carries all three codes.
  - `docs/bugs/0106-tools-entry-grammar-derivations-outside-lockstep.md` —
    §Non-goals' `preEvalCauseOf` bullet retensed (§Fix step 3): the subject is
    recorded as filed and fixed here, the stale
    `production-composition.ts` line-range citation is replaced with symbol
    form, and the count is scoped to the entry-resolution family so the bullet
    states no new totality.
  - Not touched, per the lane's delta: `package.json`, `CHANGELOG.md`,
    `docs/bugs/README.md`. The version above is a placeholder the merge
    assigns.
- Gates: witness cell RED before step 1 on exactly the three omitted codes
  (`theta/load/malformed-tool-entry` / `theta/load/unresolvable-theta-path` /
  `theta/load/invalid-pi-tool-name`, each `expected 'frontmatter' to be
  'tools-resolution'`) and 9/9 GREEN after; full default suite
  `415 passed (415)` files / `8710 passed (8710)` tests; `npm run typecheck`
  clean; `npm run lint` clean. Live: existing H8a
  `tests/live/live-production-acceptance.test.ts` `89 passed (89)` under the
  live lock, including the bug 0070 / 0071 / 0110 / 0111 `tools:` cells.
- Review: 3 rounds. Round 1 (deep) — 2 findings: the witness restates the
  family rather than deriving it, so it cannot red on a future resolver code
  never added to its table (narrowing recorded, residual 2 below); and the
  retensed 0106 bullet minted a fresh false totality by ignoring
  `theta/load/malformed-tools-field`. Round 2 (fast) — both discharged, one new
  prose finding: the cell's `it(...)` title still said "every `tools:`-surface
  code". Round 3 (fast, confirmation) — CLEAN. Both fixer rounds were
  `bug-fix-fixer-light` and touched only comments, spec/bug prose and one test
  title; no assertion and no executable branch moved.
- Verification: SOLID on all four obligations. (1) The witness reds: removing
  the three added conditions reds naming exactly those three codes; adding a
  tenth enumerated row for a code absent from the batch reds; replacing the
  batch with a `theta/load/` prefix arm reds the `theta/load/missing-mode`
  over-widening guard — every neutralisation restored byte-exact, both mutated
  files' `git hash-object` values equal to their pre-probe captures
  (`73c43300b1fe1e34944b65af09373336fe6b4f83`,
  `a95401237236aef167e33738891e307f721a8e82`). (2) Default suite green,
  415 / 8710. (3) A live surface exercises the neighbouring tools-load seam for
  real, green 89/89; the fix adds no emission — `preEvalCauseOf`'s only consumer
  is `emitLoadNoteGroup`, and `routePreEvalFailure`
  (`src/extension/load-pre-eval.ts`) discards its cause argument — so no code
  becomes newly reachable from an ordinary `pi -p` run and no
  `tests/fixtures/h7a/permitted-codes.json` append is owed. (4) Lint and
  typecheck clean.
- Residuals:
  1. **`theta/load/malformed-tools-field` still maps to ERR-3 `frontmatter`.**
     It is a `tools:`-surface code — the FIELD-shape rejection
     `src/parser/frontmatter.ts` emits, landed by bug 0104 after this report was
     filed — so the ERR-6 arm is complete for the ENTRY family only, not for the
     whole `tools:` surface. Its classification is outside this report's settled
     §Fix (which names two codes, widened to three by 0108's authority), and
     reclassifying it would be an unauthorised semantic flip of a mapping row.
     Left for the owning report; the witness asserts nothing about it and says so
     in its header. `theta/load/extension-tool-unreachable` is excluded on the
     same footing.
  2. **The witness cannot red on a future resolver code never added to its
     table.** It restates the family rather than deriving it from source, so it
     discriminates any code it lists (proven by mutation, obligation 1 probe (b))
     but not an unlisted one. §Fix's second landing direction ("reds on a future
     `tools:` code added to the resolver but not the batch") therefore holds for
     enumerated codes only, and the narrowing is stated verbatim in the cell's
     header. A source-derived family gate is open bug 0107's axis, out of scope
     here.
  3. **This change shifts `src/extension/production-composition.ts` line
     numbers by +3 below `preEvalCauseOf`.** Pre-existing `path:line` citations
     into that file from `tests/**` and from bug documents are not re-derived:
     the file is not in `tests/citation-symbol-form-gate.test.ts`'s
     `CONVERTED_FILES` ratchet, and it churned repeatedly in the releases
     between this report's filing and the fix (this report's own line citations
     were already stale at HEAD — `preEvalCauseOf` had moved from `:267` to
     `:293`, the `surface: "tools"` push from `:1431` to `:1729`). Every
     citation this fix authored or moved uses FILE + SYMBOL form.
- Discharge notes appended: `docs/bugs/0106-…md` §Non-goals (step 3, above).
  0108 §Fix *Residual 2*'s obligation ("a sibling orchestrator closing 0109 must
  widen its edit by this one code") is discharged by the three-code widening in
  both enumerations; that record is left as written.
- Pinned dispositions / non-goals: §Non-goals holds unchanged. The ERR-1…ERR-6 /
  ERR-16 cause taxonomy, `preEvalCauseOf`'s prefix-cascade shape and the ERR-3
  arm's scope are untouched; `routePreEvalFailure` still discards its cause and
  was not made to branch on it; FN-7's `with { tools: … }` load-time validation
  is still unimplemented and this fix neither widens nor narrows that contract;
  FN-7's two older absences (`theta/load/callee-has-errors`,
  `theta/load/invoke-path-escape`'s registry trigger) are left where they are.
  No registry row was added, removed or reworded (DIAG-2, DIAG-4).
