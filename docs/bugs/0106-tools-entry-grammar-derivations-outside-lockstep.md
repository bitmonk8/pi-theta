# Bug 0106 — Three `tools:` entry-grammar derivations stayed outside the lock-step bug 0069 closed, each re-deriving a spec or a presented name with its own whitespace split: `toolsEntrySpec` makes the pre-parse callee cache resolve a malformed entry's first token, so `- ./broken.theta junk` draws `theta/load/callee-has-errors` AND `theta/load/malformed-tool-entry` for one entry; `toolCallableName` / `piToolCallableName` derive a presented name from a malformed entry at parse time, so `tools: [- read bash]` plus `read("x")` draws `theta/parse/tool-arg-not-object-literal` naming a Pi tool the resolver rejects and `let read = "s"` plus `read({ … })` draws `theta/parse/shadowed-callable-call` naming a callable-set entry the theta never has — and because an error-severity parse diagnostic drops the theta before `tools:` resolution runs, those two spellings never reach the grammar rejection at all

- **Status:** fixed (0.216.0). §Fix was constraint-pinned, not settled: three
  dispositions were adjudicated in the run — whether each of the three
  derivations moves to `parseToolsEntry`, whether the pre-parse callee cache
  gates on the grammar and where that gate belongs, and whether the parse-time
  pair keeps its own shape because delegating it substitutes two downstream
  parse diagnostics for one load-time rejection. No ordering dependency:
  [0069](./0069-tools-entry-residue-silently-dropped.md) shipped in 0.62.0 and
  exported the shared grammar (`parseToolsEntry`) this report measures against.
- **Sev/Diff estimate:** S2/D3 — one authoring mistake draws two error-severity
  diagnostics on one path and, on another, draws a diagnostic whose normative
  message asserts a callable-set entry the closed grammar rejects while the
  grammar's own rejection never fires; D3 because the route is an in-run
  adjudication spanning the parser and the composition root and each of the
  three derivations serves a different phase.
- **Kind:** lock-step gap — one closed grammar, four implementations. Bug 0069
  closed the per-entry grammar in `parseToolsEntry`
  (`src/parser/callable-set.ts:307–316`) and moved one of the two re-derivations
  it named onto it. Three others were outside its §Fix constraint 5 and each
  still carries the pre-0069 token shape verbatim: `parts[0]` as the spec,
  `parts[2]` when `parts[1] === "as"`, a `parts.length >= 3` test rather than
  `=== 3`, and every other token discarded unexamined.
  1. *Composition-time spec extraction.* `toolsEntrySpec`
     (`src/extension/production-composition.ts:1583–1586`, the split at `:1584`)
     — sole caller `:1418`, the pre-parse callee cache. It returns `parts[0]` for
     any token count, so the cache resolves, reads and parses the callee named by
     a malformed entry's first token.
  2. *Parse-time presented-name derivation, every entry kind.*
     `toolCallableName` (`src/parser/theta-document.ts:4505–4519`, the split at
     `:4506`) — callers `:4558` (`collectIdentRoots`, the whole-file identifier
     root scope) and `:5208` (`checkLexicalCallSites`, the `callables` set).
  3. *Parse-time presented-name derivation, Pi-tool entries only.*
     `piToolCallableName` (`src/parser/theta-document.ts:4824–4831`, the split at
     `:4825`) — caller `:5204` (`checkLexicalCallSites`, the `piTools` set).
- **Related:**
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    the parent; this report is its §Fix *Residuals* item 3 (reviewer finding R3).
    That item names all three derivations and scopes them out in terms this
    report re-derives: "§Fix constraint 5 names only `presentedCallableNames`,
    and none of the three can contradict the load observable because a malformed
    entry un-registers the theta outright. One visible corner: the pre-parse
    callee cache derives specs from malformed entries too, so a malformed entry
    whose first token names an existing erroneous `.theta` can co-fire
    `theta/load/callee-has-errors` alongside the grammar rejection — the
    un-registration outcome is unchanged." Both halves hold as written and are
    measured here: the registration outcome is identical across every malformed
    spelling, and the co-fire reproduces. What the residual does not state is the
    parse-time half — the two parse-time derivations reach three parse-layer
    gates whose diagnostics fire *before* `tools:` resolution and can pre-empt it
    entirely (§Reproduction, third block).
  - 0069 §Fix constraint 5 states the obligation the lock-step half of this
    report measures against: `presentedCallableNames`' fallback "re-implements
    the same grammar for harness fixtures; it must move in lock-step or it will
    disagree with the resolver about which entries exist." The three derivations
    here are the same disagreement at three other readers.
  - 0107 (filed in this same wave) — the shape of 0069's constraint-5 witness.
    `tests/tools-entry-closed-grammar-lockstep.test.ts` group (D1) is a
    SOURCE-SHAPE scan over `presentedCallableNames`' body only (`:87`, `:89–104`:
    no `split(`, no quoted `as`), so it cannot observe a drift in
    `toolsEntrySpec`, `toolCallableName` or `piToolCallableName` — which is why a
    regression in any of the three would go unwitnessed. Adjacent; that report
    owns the witness's shape, this one owns the three unlocked readers.
  - [0070](./0070-theta-callable-default-name-unvalidated.md) — **open**, and
    named in 0069's fix record as the next orchestrator over the same region of
    `src/parser/callable-set.ts`. Its subject is the `.theta` derived default
    name, which `toolCallableName` (`theta-document.ts:4514–4518`) and
    `thetaDefaultName` (`callable-set.ts:387–391`) each derive independently, so
    a route here that delegates `toolCallableName` moves which function owns that
    derivation. See §Fix constraint 8.
  - 0104 and 0105 (filed in this same wave) — the other two 0069 residuals (the
    whole-field non-scalar `tools:` value, and the raw newline a multi-line
    recovered slice embeds in a rendered message). Disjoint input classes: those
    two are reached by a `tools:` VALUE or a sequence-item shape the frontmatter
    layer recovers, this one by an entry the closed grammar already rejects.
- **Affected** (every citation verified at HEAD `99b65438`, 0.62.0):
  - `src/parser/callable-set.ts:307–316` — `parseToolsEntry`, the shared grammar
    0069 exported. `:308` the split, `:309–311` the one-token arm, `:312–314` the
    three-token `as` arm, `:315` `return { kind: "malformed" }`. Its doc comment
    (`:292–306`) states the export's purpose: "Exported so
    `presentedCallableNames` (src/extension/production-theta-producer.ts) answers
    \"which entries exist\" from the SAME grammar `resolveCallableSet` enforces,
    rather than re-implementing its own token split (bug 0069 §Fix
    constraint 5)." The sentence names one consumer.
  - `src/parser/callable-set.ts:173–248` — `resolveCallableSet`. `:181` the
    per-entry `parseToolsEntry` call, `:189–197` the malformed arm that raises
    `theta/load/malformed-tool-entry` and `continue`s, `:238` the
    registers-iff-no-error computation. A malformed entry contributes no callable
    and no rename target.
  - `src/extension/production-theta-producer.ts:3600–3620` —
    `presentedCallableNames`, the one derivation 0069 moved. `:3607` consumes
    `parseToolsEntry`; `:3608–3610` drops a non-`ok` parse. Its doc comment
    (`:3586–3599`) states the closed contract: the fallback answers which entries
    exist "from the SAME closed grammar `resolveCallableSet` enforces
    (`parseToolsEntry`) rather than re-tokenising the entry itself, so the two
    cannot disagree about a malformed entry".
  - **The same fallback shares the grammar but not the name-shape rule** — a
    second lock-step axis, opened after this report's measurements by the bug
    0070 fix (`0.63.0`, commit `846c110a`). That fix added the derived-default
    name check (`theta/load/invalid-derived-tool-name`) to `resolveCallableSet`
    ALONE. `presentedCallableNames`' snapshot-absent fallback therefore still
    derives a presented name without the shape test, so a harness-only fixture
    carrying `- ./2fast.theta` and no frozen snapshot would expose `2fast` where
    the resolver un-registers the theta. Pre-existing in kind — the same
    fallback already skips the rename-validity and unknown-tool checks — and
    unreachable in production, where the snapshot arm always wins. It is
    recorded here because it is this report's subject on a second axis: the
    lock-step 0069 closed for the GRAMMAR is not closed for the RULES applied to
    the grammar's output. Evidence: the bug 0070 fix report's residual 2
    (`.pi/tmp/fixes/0070-report.md`), which recommends it be folded here rather
    than filed separately.
  - `src/extension/production-composition.ts:1583–1586` — **derivation 1.**
    `toolsEntrySpec`, whose doc comment (`:1578–1582`) says it "Mirrors the
    callable-set per-entry grammar (`<spec> ('as' <name>)?`)". The body is the
    split (`:1584`) and `return parts[0] ?? ""` (`:1585`): no token-count test,
    so every malformed spelling yields its first token.
  - `src/extension/production-composition.ts:1391–1510` —
    `resolveThetaToolsAtLoad`, the V20a load-time resolution, and the frame both
    diagnostics are raised in. `:1416–1425` the pre-parse callee cache
    (`toolsEntrySpec` at `:1418`, the `!isBareToolName(spec)` route at `:1419`,
    `parseCalleeForTools` at `:1422`); `:1427–1442` the V15f callee-has-errors
    loop over that cache, which pushes its diagnostics FIRST; `:1479–1483` the
    `resolveCallableSet` call, `:1484` the append of its diagnostics; `:1488–1491`
    the shared registers-iff-no-error test. Nothing between the cache and the
    resolver consults the grammar, so the cache's membership and the resolver's
    entry set are computed from two different readings of the same strings.
  - `src/extension/production-composition.ts:1593–1595` — `isBareToolName`, the
    `.theta`-vs-Pi-tool routing the cache applies to `toolsEntrySpec`'s output.
    A malformed entry whose first token is a bare identifier (`read bash`) never
    enters the cache; one whose first token is a path literal does.
  - `src/extension/production-composition.ts:1604–1630` —
    `parseCalleeForTools`, which reads and parses the resolved callee and reports
    `hasErrors` from `hasLoadParseError(document.diagnostics)` (`:1628`). This is
    the work a malformed entry's first token still commissions.
  - `src/extension/production-composition.ts:698–701` — the pass's
    `sink.emitGroup(toolResult.diagnostics)` and the un-registration `continue`.
    Both co-fired diagnostics reach the sink in one group, in the order above.
  - `src/extension/production-composition.ts:1097–1107` — the shipped
    `session_start` sink's group arm. Every error-severity member routes
    individually through `preEvalRouter.routePreEvalFailure` with
    `details: { diagnostics: [diagnostic] }`, so a two-member group delivers two
    notes. `:241–252` (`sinkOverPerDiagnosticEmit`) is the helper path's sink,
    which fans a group out the same way.
  - `src/extension/production-composition.ts:267–290` — `preEvalCauseOf`. Its
    ERR-6 `tools-resolution` arm (`:274–282`) enumerates five codes;
    `theta/load/malformed-tool-entry` and `theta/load/unresolvable-theta-path`
    are absent, so both fall to the `theta/load/` arm (`:286–288`) and are
    classified ERR-3 `frontmatter`. The two co-fired diagnostics therefore carry
    different pre-eval causes (see §Non-goals — the mapping is not this report's
    subject).
  - `src/extension/production-composition.ts:1938–1993` —
    `parseDiscoveredTheta`, and `:1951` its drop gate
    (`document.frontmatter === null || hasLoadParseError(document.diagnostics)`),
    `:1979` the returned dropped batch. A theta carrying an error-severity parse
    diagnostic never reaches `resolveThetaToolsAtLoad`, so the closed grammar
    never judges its `tools:` entries. This is what makes the parse-time
    derivations able to pre-empt the grammar rejection rather than merely
    duplicate it.
  - `src/parser/theta-document.ts:4505–4519` — **derivation 2.**
    `toolCallableName`. `:4506` the split; `:4507–4509` returns `parts[2]`
    whenever `parts.length >= 3 && parts[1] === "as"` (so a 4-token entry's
    rename target is taken); `:4510–4513` returns a bare-identifier `parts[0]`
    verbatim; `:4514–4518` the basename / hyphen→underscore derivation for a
    path spec. Its doc comment (`:4498–4504`) says it mirrors `callable-set.ts`.
  - `src/parser/theta-document.ts:4824–4831` — **derivation 3.**
    `piToolCallableName`. `:4825` the split; `:4826–4829` returns `undefined`
    unless `parts[0]` is bare-identifier-shaped; `:4830` returns `parts[2]` for
    `parts.length >= 3 && parts[1] === "as"`, else the spec. Its doc comment
    (`:4812–4823`) names `toolCallableName` as its companion.
  - `src/parser/theta-document.ts:4528–4565` — `collectIdentRoots`, and
    `:4557–4562` its `tools:` arm: every entry's `toolCallableName` result, when
    non-empty, becomes a whole-file identifier root. A malformed entry therefore
    binds a name for `theta/parse/unknown-identifier` purposes.
  - `src/parser/theta-document.ts:5196–5212` — `checkLexicalCallSites`' `tools:`
    loop: `:5204` fills `piTools` from `piToolCallableName`, `:5208` fills
    `callables` from `toolCallableName`. `:5356–5360` the
    `walkCtx.callables.has(e.callee)` test that emits
    `theta/parse/shadowed-callable-call`; `:5363–5366` the `resolvesToPiTool`
    predicate keyed on `walkCtx.piTools`; `:5371–5377` the
    `theta/parse/tool-arg-not-object-literal` emission; `:5383–5391` the
    `theta/parse/bare-object-literal` arm that the same predicate stands down.
    Three parse-layer gates read a name a malformed entry supplied.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:88` — the closed-grammar
    sentence 0069 landed: "The per-entry grammar is closed: an entry is exactly a
    Pi tool name or a `.theta` path, optionally followed by an `as <name>`
    clause. Any other token sequence in an entry, and any `tools:` sequence item
    that is not a YAML scalar, is `theta/load/malformed-tool-entry` and the theta
    does not register." `:76–86` the two entry kinds and the naming rules the
    three derivations reimplement. Mirrored at
    `docs/reference/frontmatter.md:134–137`.
  - `docs/spec_topics/diagnostics/code-registry-load.md:25` — the
    `theta/load/malformed-tool-entry` row. Its *Trigger* closes the grammar to
    "one token (a bare spec), or three tokens with `as` in the middle (a spec
    plus a rename target)" and ends "As with `theta/load/unknown-tool` below, one
    malformed entry un-registers the whole theta." Mirrored at
    `docs/reference/diagnostics.md:188`.
  - `docs/spec_topics/diagnostics/code-registry-load.md:38` — the
    `theta/load/callee-has-errors` row. Its *Trigger* opens "A `.theta` callee
    referenced by an `invoke(...)` literal or a `tools:` `.theta` entry failed to
    parse, lower, or pass its own structural checks during the parent's
    per-load-pass static-resolution walk", and its severity clause reads
    "`tools:` `.theta` entries are `E` (the callable cannot be created and the
    parent does not register)". Both presuppose an entry of the `.theta` kind.
    Mirrored at `docs/reference/diagnostics.md:203`.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:51` — the
    `theta/parse/tool-arg-not-object-literal` row, whose *Trigger* opens "A
    Pi-tool call site's single positional argument is not written inline as a
    bare object literal". `:62` — the `theta/parse/shadowed-callable-call` row,
    whose *Trigger* is "A bare-identifier call whose callee resolves to a local
    binding … that shadows a name in the theta's callable set" and whose
    DIAG-4 *Message* is `call of '<name>' resolves to the local <binder> that
    shadows the callable-set entry '<name>'; locals are not callable`. `:47` —
    `theta/parse/bare-object-literal`; `:61` — `theta/parse/unknown-identifier`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` — the
    §`tools` rejection family, which lists all seven codes flat ("all surface
    through the theta diagnostics channel … and prevent the theta from being
    registered") and orders none of them.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:65` (multi-error reporting
    — "Authors get every problem in the file at once"), `:71` (DIAG-1), `:72`
    (DIAG-2, the registry is closed), `:74` (DIAG-4, the *Message* column is
    normative).
  - `docs/spec_topics/errors-and-results/error-model.md:17` (ERR-3, frontmatter
    rejection), `:20` (ERR-6, "`tools:` resolution failure").
  - `tests/tools-entry-closed-grammar.test.ts` — 0069's behavioural witness.
    Group (B) (`:190–513`) is the production-load matrix over a real on-disk
    `.pi/theta/` workspace; every planted body is `@`hi`` (`:211–283`), chosen so
    "the only reachable diagnostic is the `tools:` one" (`:207–209`), so no cell
    reaches a parse-layer gate through a body call. Group (C) (`:515–665`) calls
    `resolveCallableSet` directly. No cell in the file pairs a malformed entry
    with an existing erroneous `.theta` callee, and none pairs one with a body
    call of the derived name.
  - `tests/tools-entry-closed-grammar-lockstep.test.ts:86–105` — group (D1), the
    source-shape scan, whose subject is `presentedCallableNames` alone
    (`topLevelFunctionBody(PRODUCER_SOURCE, "presentedCallableNames")`, `:87`).
    `:144–163` group (D2), the presented-name derivation for the three
    well-formed shapes.
  - `tests/production-tools-load-resolution.test.ts:154–166` — the shipped
    `callee-has-errors` cells (`calleeerrors` naming `./broken.theta`, and
    `broken` carrying `params: x: NoSuchType`). The fixture shape this report's
    probe reuses; its caller's entry is well-formed, so the pairing this report
    measures is absent. (These fixtures sat at `:125–136` when this report was
    written; the bug 0070 fix, `0.63.0`, inserted three planted thetas earlier
    in the same `THETAS` array and shifted them down.)
  - `tests/shadowed-callable-call.test.ts:325–341` — the `.theta`-callable
    shadowing cell, which records that "`toolCallableName` exposes the
    post-rename presented name at parse". `:433–438` the `read as Read` cell (a
    well-formed three-token entry). No cell in the file carries a malformed
    entry.
  - **The corpus.** 35 committed `.theta` / `.thetalib` files
    (`find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
    "./node_modules/*" -not -path "./.git/*"`). Fourteen carry a top-level
    `tools:` field, 18 entries in total, every one a single token — 2 comma short
    forms (`tools: grep`, `docs/examples/call-tool.theta:4`,
    `docs/examples/configure-tool-loop.theta:4`) and 16 sequence items, of which
    5 are `.theta` paths (`./review-lens.theta`, `./ralph-step.theta`,
    `./reviewer.theta`, `./summarise-doc.theta`, `./sentiment.theta`). Zero `as`
    clauses, zero multi-token entries, zero entries naming a callee that carries
    its own errors. One further `tools:` occurrence is the inline `subagent fn`
    option `tools: [read, bash]` (`docs/examples/ralph-inline.theta:22`), a
    different surface and also single-token.
- **Observed at:** `0.62.0` (HEAD `99b65438`). Offline, deterministic; no live
  model, no provider. Two scratch vitest probes: the shipped production load path
  (`discoverAndComposeFixtures`, the `session_start` composition root) over a
  real on-disk `.pi/theta/` discovery workspace on the
  `tests/tools-entry-closed-grammar.test.ts` group (B) harness, with the
  diagnostic codes and their order read off the rendered stderr mirror
  (`makeLoadEmit`, `src/extension/production-composition.ts:190–211`) and the
  messages off `ctx.ui.notify`; and the real `parseThetaDocument` over a
  production-shaped `ParseThetaDocumentDeps`. Written, run, deleted.

## Summary

Bug 0069 closed the `tools:` per-entry grammar: `parseToolsEntry`
(`src/parser/callable-set.ts:307–316`) admits exactly one token or three tokens
with `as` in the middle, `resolveCallableSet` raises
`theta/load/malformed-tool-entry` for anything else, and the theta does not
register. Its §Fix constraint 5 named one other implementation of the same
grammar — `presentedCallableNames` — and moved it onto the shared export.

Three further derivations were outside that constraint and still carry the
pre-0069 token shape (and, since the bug 0070 fix at `0.63.0`, the moved
derivation shares the grammar without sharing the name-shape rule applied to its
output — see the last §Affected bullet):

| Derivation | Site | Reads | Feeds |
|---|---|---|---|
| `toolsEntrySpec` | `production-composition.ts:1583–1586` | `parts[0]`, any token count | the pre-parse `.theta` callee cache (`:1418`) |
| `toolCallableName` | `theta-document.ts:4505–4519` | `parts[2]` when `parts.length >= 3 && parts[1] === "as"`, else `parts[0]` | the identifier root scope (`:4558`) and the `callables` set (`:5208`) |
| `piToolCallableName` | `theta-document.ts:4824–4831` | the same, restricted to a bare-identifier spec | the `piTools` set (`:5204`) |

Each answers "what does this entry name" for an entry the grammar rejects. Two
consequences are measured.

**The load-time co-fire.** `toolsEntrySpec` gives the callee cache a malformed
entry's first token, so the cache resolves, reads and parses the file it names.
When that file is an existing `.theta` carrying its own error-severity
diagnostic, the V15f check fires for it and the grammar rejection fires for the
entry — two error-severity diagnostics for one entry, in that order:

```
theta/load/callee-has-errors:      callee './zbroken.theta' has errors; see related diagnostics
theta/load/malformed-tool-entry:   malformed 'tools:' entry './zbroken.theta junk'; expected a Pi tool
                                   name or a .theta path, optionally followed by an 'as' clause
```

Both spellings of a two-token entry and the four-token residue spelling produce
the pair. The registration outcome is identical to the single-diagnostic control:
the theta does not register either way.

**The parse-time substitution.** `toolCallableName` and `piToolCallableName` run
in `parseThetaDocument`, before any `tools:` resolution exists. A malformed entry
therefore seeds a presented name into three parse-layer gates, and each gate
behaves as though the entry were well-formed. `tools: [- read bash]` (0069's
load-bearing dropped-comma spelling) plus a body call of `read` yields:

- `read({ path: "x" })` — parse diagnostics `[]`, byte-identical to the
  well-formed `- read` control. Without any entry the same body raises
  `theta/parse/unknown-identifier` and `theta/parse/bare-object-literal`.
- `read("x")` — `theta/parse/tool-arg-not-object-literal: Pi tool 'read' argument
  must be written inline as a bare object literal { ... }`, identical to the
  well-formed control. Without the entry: `unknown-identifier`.
- `let read = "s"` then `read({ path: "y" })` —
  `theta/parse/shadowed-callable-call: call of 'read' resolves to the local let
  binding at line 6 that shadows the callable-set entry 'read'`, identical to the
  well-formed control. Without the entry: `bare-object-literal` alone.

The last two are error-severity parse diagnostics, and `parseDiscoveredTheta`
drops a theta carrying one before `resolveThetaToolsAtLoad` runs
(`production-composition.ts:1951`). So for those two spellings the grammar
rejection is never reached: the only diagnostics the author receives name a Pi
tool and a callable-set entry that the closed grammar rejects and that the theta,
un-registered, never has.

## Reproduction

Offline, at `99b65438`.

### The load-time co-fire

Scratch vitest on the `tests/tools-entry-closed-grammar.test.ts` group (B)
harness: the planted files below written under `<workspace>/.pi/theta/` (plus a
`{}` `.pi/settings.json` for the bug-0013 warning surface),
`discoverAndComposeFixtures(pi, ctx)` with `ctx.cwd = <workspace>`, `ctx.ui.notify`
collecting messages and the stderr mirror collecting `<file>: <code>: <message>`.
`REGISTERED` is the returned fixtures' slash names. Every caller's body is
`@`hi``; callers carrying a `.theta` entry are `mode: subagent`, `ctlpitool` (a
bare Pi-tool spec) is `mode: prompt`. Paths are shown basename-only.

```
@@ zbroken.theta   `mode: subagent` + `params:` `x: NoSuchType` + `@`broken``   [the erroneous callee]
   own parse    :: zbroken.theta:4:6: theta/parse/unresolved-named-type: unresolved named type 'NoSuchType'
@@ zgood.theta    `mode: subagent` + `@`good``                                  [the clean callee]
   own parse    :: []

@@ cofire.theta      tools: [ - ./zbroken.theta junk ]              [2 tokens, no `as`]
   cofire.theta:1:1: theta/load/callee-has-errors: callee './zbroken.theta' has errors; see related diagnostics
   cofire.theta:      theta/load/malformed-tool-entry: malformed 'tools:' entry './zbroken.theta junk'; …
@@ cofireas.theta    tools: [ - ./zbroken.theta as ]                [2 tokens, dangling `as`]
   cofireas.theta:1:1: theta/load/callee-has-errors: callee './zbroken.theta' has errors; …
   cofireas.theta:      theta/load/malformed-tool-entry: malformed 'tools:' entry './zbroken.theta as'; …
@@ cofire4.theta     tools: [ - ./zbroken.theta as reviewer junk ]   [4 tokens]
   cofire4.theta:1:1: theta/load/callee-has-errors: callee './zbroken.theta' has errors; …
   cofire4.theta:      theta/load/malformed-tool-entry: malformed 'tools:' entry './zbroken.theta as reviewer junk'; …

@@ ctlwell.theta     tools: [ - ./zbroken.theta ]        [control: well-formed, erroneous callee]
   ctlwell.theta:1:1: theta/load/callee-has-errors: callee './zbroken.theta' has errors; …
@@ ctlnofile.theta   tools: [ - ./nosuchfile.theta junk ]  [control: malformed, names no file]
   ctlnofile.theta:   theta/load/malformed-tool-entry: malformed 'tools:' entry './nosuchfile.theta junk'; …
@@ ctlgoodres.theta  tools: [ - ./zgood.theta junk ]     [control: malformed, error-free callee]
   ctlgoodres.theta:  theta/load/malformed-tool-entry: malformed 'tools:' entry './zgood.theta junk'; …
@@ ctlpitool.theta   tools: [ - read bash ]              [control: malformed, bare Pi-tool spec]
   ctlpitool.theta:   theta/load/malformed-tool-entry: malformed 'tools:' entry 'read bash'; …
@@ ctlgood.theta     tools: [ - ./zgood.theta ]          [control: well-formed, clean callee]
   ctlgood.theta:     []

REGISTERED :: ["ctlgood","zgood"]
```

The co-fire reproduces on all three malformed `.theta`-path spellings, always in
the order `callee-has-errors` → `malformed-tool-entry` (the V15f loop pushes at
`production-composition.ts:1427–1442`, the resolver's diagnostics are appended at
`:1484`). The four controls partition the cause: a well-formed entry naming the
erroneous callee draws `callee-has-errors` alone; a malformed entry naming no
existing file, a malformed entry naming an error-free callee, and a malformed
entry whose first token is a bare Pi-tool name each draw the grammar code alone —
the last because `isBareToolName` (`:1419`) keeps a bare identifier out of the
cache. `callee-has-errors` is located (`:1:1`, `TOOLS_DIAGNOSTIC_RANGE`,
`:1329–1332`) and carries the registry *Hint*; `malformed-tool-entry` is
file-only. Registration is unchanged: only the two clean fixtures survive.

### The parse-time derivations

The real `parseThetaDocument` over a production-shaped `ParseThetaDocumentDeps`
(the `makeDeps` shape of `tests/tool-arg-shape-enforcement.test.ts:136–146`).
Rows are `<frontmatter tools: entry>` + `<body>` → the document's own
diagnostics.

```
@@ [- read]              + `let r = read({ path: "x" })` + `r`   [control, well-formed]  []
@@ [- read bash]         + same body                            [MALFORMED]             []
@@ (no tools:)           + same body                            [control, no entry]
   ["error theta/parse/unknown-identifier: unknown identifier 'read'",
    "error theta/parse/bare-object-literal: bare object literal not permitted in this position; …"]
@@ [- read bash]         + `let r = bash({ command: "x" })` + `r`   [the DISCARDED token]
   ["error theta/parse/unknown-identifier: unknown identifier 'bash'",
    "error theta/parse/bare-object-literal: …"]

@@ [- read as]                 + `read({ path: "x" })` body      [MALFORMED, dangling `as`]   []
@@ [- read is file_read]       + `read({ path: "x" })` body      [MALFORMED, middle not `as`] []
@@ [- read as file_read junk]  + `file_read({ path: "x" })` body [MALFORMED, 4 tokens]        []
@@ [- ./zbroken.theta junk]    + `let r = zbroken("x")` + `r`    [MALFORMED, path spec]       []
@@ (no tools:)                 + `let r = zbroken("x")` + `r`    [control]
   ["error theta/parse/unknown-identifier: unknown identifier 'zbroken'"]
```

Every malformed spelling seeds exactly the name the pre-0069 grammar would have
kept: the first token, or the `as` target when three or more tokens carry `as` in
position 2. The second token of `- read bash` is discarded, so the name the
author's dropped comma lost is the one that reads as unknown — 0069's §Why it
matters observable, unchanged and correct.

Two gates beyond the root scope read the same derived names:

```
@@ [- read bash] + `let r = read("x")` + `r`    [MALFORMED]
   ["error theta/parse/tool-arg-not-object-literal: Pi tool 'read' argument must be written inline
     as a bare object literal { ... }; a let-bound value cannot supply the field shape"]
@@ [- read]      + same body                    [control, well-formed]   the same one diagnostic
@@ (no tools:)   + same body                    [control, no entry]
   ["error theta/parse/unknown-identifier: unknown identifier 'read'"]

@@ [- read bash] + `let read = "s"` + `let r = read({ path: "y" })` + `r`    [MALFORMED]
   ["error theta/parse/shadowed-callable-call: call of 'read' resolves to the local let binding at
     line 6 that shadows the callable-set entry 'read'; locals are not callable",
    "error theta/parse/bare-object-literal: …"]
@@ [- read]      + same body                    [control, well-formed]   the same two diagnostics
@@ (no tools:)   + same body                    [control, no entry]
   ["error theta/parse/bare-object-literal: …"]
```

The malformed row and the well-formed row are indistinguishable at parse. The
message in the second pair asserts a callable-set entry `read`; the resolver
rejects that entry and the theta has no callable set at all.

### The grammar rejection those two spellings never reach

The same two bodies planted as `mode: prompt` discovered thetas in the workspace
above:

```
@@ pshape.theta    tools: [ - read bash ]  + `let r = read("x")` + `r`
   pshape.theta:6:14: theta/parse/tool-arg-not-object-literal: Pi tool 'read' argument must be …
   (no theta/load/malformed-tool-entry line for this file)
@@ pshadow.theta   tools: [ - read bash ]  + `let read = "s"` + `let r = read({ path: "y" })` + `r`
   pshadow.theta:7:9:  theta/parse/shadowed-callable-call: call of 'read' resolves to the local let
                       binding at line 6 that shadows the callable-set entry 'read'; …
   pshadow.theta:7:14: theta/parse/bare-object-literal: …
   (no theta/load/malformed-tool-entry line for this file)
@@ pshapectl.theta tools: [ - read ]       + `let r = read("x")` + `r`   [control, well-formed]
   pshapectl.theta:6:14: theta/parse/tool-arg-not-object-literal: Pi tool 'read' argument must be …
```

`parseDiscoveredTheta` drops a theta carrying an error-severity parse diagnostic
at `production-composition.ts:1951` and returns that batch (`:1979`), so
`resolveThetaToolsAtLoad` (`:1391`) is never called for `pshape` or `pshadow`.
The malformed entry is never judged by the grammar; the diagnostics delivered are
the two derived-name ones, byte-identical to the well-formed control.

## Expected behaviour

- **One grammar, one implementation.** This is 0069 §Fix constraint 5's own
  statement of the obligation: a second implementation of the entry grammar
  "must move in lock-step or it will disagree with the resolver about which
  entries exist". `parseToolsEntry`'s doc comment
  (`src/parser/callable-set.ts:302–306`) records the same reason for the export.
  Three readers still hold their own token grammar, so four answers to "which
  entries exist" ship in one tree, and three of them admit the residue the
  fourth rejects.
- **`theta/load/callee-has-errors`' *Trigger* presupposes an entry that resolves
  to a callee.** `code-registry-load.md:38` scopes it to "A `.theta` callee
  referenced by an `invoke(...)` literal or a `tools:` `.theta` entry", and its
  severity clause reads "`tools:` `.theta` entries are `E` (the callable cannot
  be created and the parent does not register)".
  `frontmatter-fields-a.md:88` closes the grammar to two entry kinds and makes
  "any other token sequence in an entry" `theta/load/malformed-tool-entry`. A
  malformed token sequence is neither entry kind, so it references no callee and
  requests no callable: the code's subject does not exist for that input, and
  under DIAG-2 (`diagnostic-shape.md:72`) a *Trigger* is the normative condition,
  not a description of the current emission set.
- **One authoring mistake draws one diagnostic that names it.** The registry row
  for the grammar rejection already states the whole-theta consequence ("one
  malformed entry un-registers the whole theta",
  `code-registry-load.md:25`), and `diagnostic-shape.md:65` gives the
  completeness rule: authors get every problem in the file at once. Neither
  sentence licenses a second code for one entry whose own trigger is unmet. The
  §`tools` rejection family (`frontmatter-fields-b-and-templates.md:18`) lists
  seven codes and orders none of them, so no prose says the co-fire is the
  intended sequence.
- **A parse-layer gate keyed on the callable set does not fire for an entry the
  callable set rejects.** `theta/parse/shadowed-callable-call`'s *Trigger*
  (`code-registry-parse.md:62`) is a call whose callee "shadows a name in the
  theta's callable set", and its DIAG-4 *Message* names "the callable-set entry
  '<name>'". `theta/parse/tool-arg-not-object-literal`'s *Trigger* (`:51`) is "A
  Pi-tool call site's". Under the closed grammar a malformed entry contributes
  neither a callable-set name nor a Pi-tool callee, so both messages are false
  of their input.
- **The load-time rejection is reachable for every malformed entry.** The
  grammar's registry row is written as the disposition of "any other token
  sequence in an entry". Two spellings measured above never reach it, because a
  name the same malformed entry seeded produced an error-severity parse
  diagnostic first and the drop gate (`production-composition.ts:1951`)
  short-circuits the pass. An input the spec says draws
  `theta/load/malformed-tool-entry` draws one or two other codes instead.

## Actual behaviour / root cause

**Three functions kept the pre-0069 token shape.** The shared grammar is a
closed token-count test:

```ts
export function parseToolsEntry(raw: string): ToolsEntryParse {
  const parts = raw.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 1) {
    return { kind: "ok", spec: parts[0] ?? "" };
  }
  if (parts.length === 3 && parts[1] === "as") {
    return { kind: "ok", spec: parts[0] ?? "", rename: parts[2] ?? "" };
  }
  return { kind: "malformed" };
}
```

`src/parser/callable-set.ts:307–316`. The three unlocked readers each open with
the same split and then answer without a token-count test:

```ts
function toolsEntrySpec(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  return parts[0] ?? "";
}
```

`src/extension/production-composition.ts:1583–1586`.

```ts
function toolCallableName(entry: string): string {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length >= 3 && parts[1] === "as") {
    return parts[2] ?? "";
  }
  const spec = parts[0] ?? "";
  …
```

`src/parser/theta-document.ts:4505–4510`.

```ts
function piToolCallableName(entry: string): string | undefined {
  const parts = entry.trim().split(/\s+/).filter((p) => p.length > 0);
  const spec = parts[0] ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return undefined;
  }
  return parts.length >= 3 && parts[1] === "as" ? parts[2] : spec;
}
```

`src/parser/theta-document.ts:4824–4831`. All three use `>= 3` where the grammar
uses `=== 3`, none rejects two tokens, and none reports a malformed entry as
nameless. That is exactly the pre-fix `parseEntry` behaviour 0069 §Actual
behaviour quotes.

**The load path computes the callee set and the entry set from two different
readings.** In `resolveThetaToolsAtLoad`:

```ts
  const calleeCache = new Map<string, CalleeParse>();
  for (const entry of toolsList) {
    const spec = toolsEntrySpec(entry);
    if (spec.length > 0 && !isBareToolName(spec) && !calleeCache.has(spec)) {
      calleeCache.set(
        spec,
        await parseCalleeForTools(fs, callerDir, spec, parseDeps),
      );
    }
  }
```

`src/extension/production-composition.ts:1416–1425`. The cache is keyed by
`toolsEntrySpec`'s answer, so `./zbroken.theta junk` puts `./zbroken.theta` in it
and `parseCalleeForTools` (`:1604–1630`) reads and parses that file. The V15f
loop then walks the cache (`:1427–1442`) and pushes `theta/load/callee-has-errors`
for any member with `fileExists && hasErrors`. Only afterwards does
`resolveCallableSet` (`:1479–1483`) apply the closed grammar and append its
rejection. Both land in one group at `:698`, and the group's error members route
individually on the shipped sink (`:1097–1107`), so the author receives two notes.
The two codes also carry different pre-eval causes: `preEvalCauseOf`'s ERR-6 arm
(`:274–282`) does not list `theta/load/malformed-tool-entry`, so it falls to the
`theta/load/` arm (`:286–288`) and is classified ERR-3 while its co-fired sibling
is ERR-6.

**The parse-time pair runs in a phase where no callable set exists yet, and
three gates trust it.** `checkLexicalCallSites` builds both sets from the raw
entries:

```ts
  for (const entry of frontmatter?.tools ?? []) {
    const piName = piToolCallableName(entry);
    if (piName !== undefined && piName.length > 0) {
      piTools.add(piName);
    }
    const presented = toolCallableName(entry);
    if (presented.length > 0) {
      callables.add(presented);
    }
  }
```

`src/parser/theta-document.ts:5203–5212`. `callables` is the whole of
`theta/parse/shadowed-callable-call`'s admission test (`:5356–5360`); `piTools`
is the whole of the `resolvesToPiTool` predicate (`:5363–5366`) that decides
whether `theta/parse/tool-arg-not-object-literal` applies (`:5371–5377`) and
whether the bare-object carve-out stands (`:5383–5391`). `collectIdentRoots`
(`:4557–4562`) adds the same derived name to the whole-file identifier root
scope. Each of the three gates behaves correctly on the name it is given; the
name is derived from an entry that will not survive resolution.

**The parse phase precedes the drop gate, so the two error-severity parse gates
can pre-empt the grammar.**

```ts
  const document = parseThetaDocument({ path: theta.path, bytes }, deps);
  if (document.frontmatter === null || hasLoadParseError(document.diagnostics)) {
```

`src/extension/production-composition.ts:1950–1951`, returning
`{ dropped: [...document.diagnostics, ...subagentFnFraming] }` at `:1979`. The
pass's per-input loop (`:674`) only reaches `resolveThetaToolsAtLoad` (`:688`)
for inputs that survived that gate. So a malformed entry whose derived name makes
a body call erroneous is never judged by the closed grammar at all, and the
author's whole diagnostic set is the derived-name ones — measured for `pshape`
(one) and `pshadow` (two) in §Reproduction.

**Nothing in the tree scores a drift in the three.** 0069's behavioural witness
plants only `@`hi`` bodies, on purpose ("the only reachable diagnostic is the
`tools:` one", `tests/tools-entry-closed-grammar.test.ts:207–209`), so no cell
reaches a parse-layer gate through a body call, and no cell pairs a malformed
entry with an erroneous `.theta` callee. The constraint-5 witness scans one
function's source text (`tools-entry-closed-grammar-lockstep.test.ts:87`). The
`callee-has-errors` cells that do exist
(`tests/production-tools-load-resolution.test.ts:154–166`) use a well-formed
entry.

## Why it matters

- **One entry, two error-severity diagnostics.** Measured on three malformed
  spellings. The first of the two, `theta/load/callee-has-errors`, has a *Trigger*
  that names a `tools:` `.theta` entry referencing a callee; the input references
  nothing, because the closed grammar admits it as no entry at all. The author is
  told to open and fix a callee whose errors are not what refused their theta.
- **A false statement in a DIAG-4-normative message.** `call of 'read' resolves
  to the local let binding at line 6 that shadows the callable-set entry 'read'`
  is emitted for a theta whose `tools:` entry the resolver rejects and which
  therefore has no callable set. `Pi tool 'read' argument must be written
  inline …` is emitted for a theta that admits no Pi tool. Both messages are
  character-for-character the registry's, so the falsehood is in the input the
  gate was given, not in the rendering.
- **The rejection the spec prescribes is unreachable for two spellings.**
  `frontmatter-fields-a.md:88` says any other token sequence "is
  `theta/load/malformed-tool-entry` and the theta does not register". For
  `- read bash` plus `read("x")` and plus a shadowed `read`, the second half
  holds and the first does not: the code never fires. An author debugging why
  `/pshape` vanished is pointed at their call site, not at the dropped comma that
  caused it.
- **`- read bash` is 0069's load-bearing spelling.** 0069 §Why it matters:
  "`tools: read, grep, bash` → `tools: read grep, bash` keeps `bash` and loses
  `grep`". A theta whose body calls the surviving first name is exactly the
  common shape, and it is the shape whose grammar rejection the parse-time
  derivations can replace or precede.
- **Four implementations of one closed grammar.** 0069 closed the grammar and
  exported it so two readers could not disagree; three readers still disagree,
  and each disagreement is silent in the sense that matters here — no gate
  observes it. A later change to `parseToolsEntry` (bug 0070 edits the same
  region) moves one answer and leaves three.
- **No witness covers the three.** The constraint-5 witness is a source scan over
  a different function (0107); the behavioural witness's bodies are query-only by
  design; the `callee-has-errors` fixtures use well-formed entries. A regression
  or a divergence in `toolsEntrySpec`, `toolCallableName` or
  `piToolCallableName` reds nothing.
- **Zero corpus exposure today.** All 14 committed thetas carrying `tools:` use
  single-token entries, so no committed file reaches any of the divergences
  above. The behaviour is reachable by an author dropping a comma or leaving a
  rename half written — the same input class 0069 filed.

## Non-goals

- **Widening or reopening the entry grammar.** `frontmatter-fields-a.md:88` and
  `code-registry-load.md:25` are 0069's settled closure. This report measures
  readers that disagree with it; it does not question it.
- **`theta/load/malformed-tool-entry`'s message, severity or all-or-nothing
  posture.** Unchanged under any route, and DIAG-3 / DIAG-4 defer a rename or
  reword to theta 2.0 in any case.
- **`preEvalCauseOf`'s `tools:` enumeration.** Filed and fixed by
  [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md):
  `preEvalCauseOf`'s ERR-6 arm in `src/extension/production-composition.ts` now
  names all nine codes of the ENTRY-resolution family — the eight
  `resolveCallableSet` emits (the two this bullet named,
  `theta/load/unresolvable-theta-path` and `theta/load/malformed-tool-entry`,
  plus `theta/load/invalid-pi-tool-name`, widened in by bug 0108, among the
  others) plus the `tools:`-surface `theta/load/callee-has-errors`. That is
  not every `tools:`-surface code: `theta/load/malformed-tools-field`, the
  FIELD-shape code `src/parser/frontmatter.ts` emits (bug 0104), is also a
  `tools:`-surface code and stays ERR-3 `frontmatter`; it is recorded as a
  residual in 0109's fix record rather than folded into ERR-6. ERR-6 is
  "`tools:` resolution failure" (`errors-and-results/error-model.md:20`). The
  mapping drives no routing today (the discriminant "is carried for caller /
  reload-integration reuse rather than driving routing"), so 0109's fix is a
  fidelity correction, not a behavioural one.
- **The empty `relatedSites` on the `tools:`-surface `callee-has-errors`
  emission.** `production-composition.ts:1437` passes `relatedSites: []` while
  the registry row (`code-registry-load.md:38`) says the "`related` array carries
  one entry per underlying error site in the callee". Visible in §Reproduction as
  a diagnostic with a hint and no related sites. Pre-existing, orthogonal to the
  grammar lock-step, unfiled.
- **The shape of 0069's constraint-5 witness.** Group (D1)'s evadability by a
  novel re-tokenisation is 0107's subject. This report needs a witness over the
  three derivations; whether (D1) itself is reshaped is decided there.
- **`theta/parse/shadowed-callable-call`, `theta/parse/tool-arg-not-object-literal`
  and `theta/parse/bare-object-literal` as rules.** All three are correct on the
  callable-set membership they are given (measured: each behaves identically for
  the well-formed control). Only their input is at issue.
- **The other two 0069 residuals.** The whole-field non-scalar `tools:` value and
  the raw newline in a multi-line recovered slice (0104, 0105) reach the grammar
  from the frontmatter layer, not from a reader that bypasses it.

## Fix

Route not settled. Three dispositions are adjudicated in the run; the constraints
below bound any of them. No new diagnostic code is needed under any route, so
DIAG-2 is not reached (constraint 4).

**(a) Each of the three derivations gets its own disposition.** The structural
close is to delegate to `parseToolsEntry`, the export 0069 created for exactly
this purpose. The three serve different phases and the measured consequences of
delegating differ, so they are assessed separately rather than as one move:

1. `toolsEntrySpec` (`production-composition.ts:1583–1586`) has one caller, in
   the same load pass and the same phase as the resolver, and its answer for a
   malformed entry is used for nothing else. Delegating it — or gating its caller
   (see (b)) — removes the co-fire and changes no other observable. Under
   delegation the function's whole body becomes a `parseToolsEntry` call plus the
   `ok`-arm `spec`, so the function may disappear into `:1418`.
2. `toolCallableName` (`theta-document.ts:4505–4519`) runs at parse, strictly
   before any resolution, and feeds the identifier root scope and the `callables`
   set. Delegating it makes a malformed entry contribute no name, which turns
   every body reference to that name into `theta/parse/unknown-identifier` plus,
   for a sole-bare-object call, `theta/parse/bare-object-literal` — measured as
   the "no `tools:`" control rows in §Reproduction. That trades one load-time
   diagnostic that names the actual mistake for two parse diagnostics that do
   not, and it makes the grammar rejection unreachable for a wider set of
   spellings than today (the drop gate at `:1951` fires on the new parse errors).
   The disposition therefore has to state which observable it is optimising: the
   route must either accept the extra parse diagnostics, or keep the tolerant
   derivation and record why parse-time name derivation is deliberately wider
   than the resolver's admission test.
3. `piToolCallableName` (`theta-document.ts:4824–4831`) is the same phase as (2)
   but a narrower question: it decides only whether a call site is a Pi-tool call
   site, which gates `theta/parse/tool-arg-not-object-literal` and stands the
   bare-object rejection down. Its two measured false statements
   (`Pi tool 'read' …`, and — through `toolCallableName` — `the callable-set
   entry 'read'`) are the strongest argument for delegation; its cost is the same
   as (2)'s.

**(b) The pre-parse callee cache.** The gate that removes the co-fire is a
grammar test before the cache insertion: either `toolsEntrySpec` returns nothing
for a malformed entry (disposition (a)(1)), or the loop at
`production-composition.ts:1416–1425` skips an entry whose `parseToolsEntry`
result is `malformed`. The second placement keeps the grammar decision at the
call site where the `isBareToolName` routing already lives and leaves
`toolsEntrySpec` a pure projection; the first keeps every caller honest by
construction. Either way the V15f loop (`:1427–1442`) is unchanged — it walks the
cache, and the cache is what narrows.

**(c) No new registry row, and no suppression that contradicts a *Trigger*.**
Both codes already exist with their rows. Skipping `callee-has-errors` for a
malformed entry is not a *Trigger* narrowing: `code-registry-load.md:38` scopes
that code to a callee "referenced by an `invoke(...)` literal or a `tools:`
`.theta` entry", and `frontmatter-fields-a.md:88` already says a malformed token
sequence is not an entry of either kind, so the skip brings the emission set to
what the row states rather than away from it. The fix must re-read both sentences
at its own baseline and record that finding; if a route instead chooses to
suppress `malformed-tool-entry` when `callee-has-errors` fired, that WOULD
contradict `code-registry-load.md:25` ("one malformed entry un-registers the
whole theta" — the rejection is the entry's own disposition) and is rejected
here. DIAG-2 is reached only by a code addition, removal, namespace, severity or
*Trigger* change; none is required.

**(d) The lock-step witness does not cover these three.**
`tests/tools-entry-closed-grammar-lockstep.test.ts` group (D1) (`:86–105`) reads
`presentedCallableNames`' body out of the shipped source and asserts it carries
no `split(` and no quoted `as`. Its subject is that one function, so a drift in
`toolsEntrySpec`, `toolCallableName` or `piToolCallableName` reds nothing there.
0069 recorded the same limit from the other side (residual 4: the scan "reds
correctly against the pre-fix body … but a novel re-tokenisation
(`match(/\S+/g)`, `includes(" as ")`) would evade it"). See 0107, which owns that
witness's shape. Whatever this fix keeps un-delegated needs a behavioural witness
instead of a source scan — every observable in §Reproduction is one
`discoverAndComposeFixtures` call or one `parseThetaDocument` call.

Constraints on any implementation:

1. **The registration outcome is unchanged, and pinned as such.** Measured:
   `REGISTERED :: ["ctlgood","zgood"]` — every malformed spelling un-registers
   its theta with or without the co-fire, and the well-formed control naming the
   erroneous callee un-registers too. No route may make a malformed entry
   register, and no route may make a well-formed entry naming an erroneous callee
   register.
2. **The four controls stay separable.** A well-formed entry naming an erroneous
   callee keeps `theta/load/callee-has-errors` alone; a malformed entry naming no
   existing file, one naming an error-free callee, and one whose first token is a
   bare Pi-tool name each keep `theta/load/malformed-tool-entry` alone. These are
   what distinguish "the co-fire is closed" from "the V15f check is broken".
3. **`theta/load/unresolvable-theta-path` and `theta/load/prompt-mode-callable`
   are untouched.** Both are raised inside `resolveEntry`
   (`src/parser/callable-set.ts:347–378`) from an `ok` parse, downstream of the
   grammar arm, so a malformed entry cannot reach either. Gating the callee cache
   must not change which of them a well-formed `.theta` entry draws — in
   particular a well-formed entry naming a missing file still draws
   `unresolvable-theta-path` through the `!callee.fileExists` arm of the
   `resolveThetaCallee` dep (`:1465–1468`).
4. **No new diagnostic code, no registry edit, no spec sentence added.** See (c).
   If the adjudication concludes otherwise, that is a DIAG-2 change with its
   `docs/reference/diagnostics.md` mirror in the same commit, and the reason must
   be recorded rather than assumed.
5. **GOV-15.** Every input in §Reproduction already emits an error-severity
   diagnostic and un-registers, so no route moves an input from loads-cleanly to
   refused. What can change is the diagnostic SEQUENCE for an already-refused
   input: closing the co-fire removes a code from one input's sequence, and
   delegating the parse-time pair adds `theta/parse/unknown-identifier` /
   `theta/parse/bare-object-literal` to another's. The census is re-run at the
   fix baseline; measured occurrences in the tree today: **zero** — 35 committed
   `.theta` / `.thetalib` files, 14 with `tools:`, every entry a single token, no
   `as` clause, no entry naming a callee that carries its own errors.
6. **Test witness — offline, provider-free, behavioural.** Required: the three
   co-fire rows and the four single-diagnostic controls, asserted on the diagnostic
   CODES and their order for one caller, plus the registered set; the parse-time
   rows for each malformed shape with their well-formed and no-entry controls, so
   whichever tolerance survives is pinned in both directions; and the two
   pre-emption rows (`pshape`, `pshadow`) asserting that the grammar rejection is
   or is not reached. Every cell settles in one `discoverAndComposeFixtures` call
   over a planted `.pi/theta/` workspace or one `parseThetaDocument` call over a
   string; no integration or live tier is reachable for a load-time observable
   that settles before any model or transport exists.
7. **Whatever stays un-delegated is recorded at the site.** Each of the three
   functions carries a doc comment claiming to mirror the callable-set grammar
   (`production-composition.ts:1578–1582` "Mirrors the callable-set per-entry
   grammar"; `theta-document.ts:4498–4504` "mirroring `callable-set.ts`";
   `:4812–4823` naming `toolCallableName` as its companion). A derivation that
   deliberately keeps a wider reading must say so in that comment, with the
   observable it preserves, so the next reader does not close it as an oversight.
8. **Bug [0070](./0070-theta-callable-default-name-unvalidated.md)
   coordination.** 0070 (open) edits the same region of
   `src/parser/callable-set.ts` (0069's fix record names `thetaDefaultName`,
   `isBareIdentifier`, `isLowercaseFirstIdentifier`, `resolveEntry` and
   `splitEntries` as byte-unchanged there, and `parseToolsEntry` as the new
   arrival). `toolCallableName` and `toolsEntrySpec` both re-derive the
   `.theta` default name that 0070's subject governs, so a route that delegates
   either one changes which function owns that derivation. Sequence against 0070
   rather than landing both blind.

## Provenance

- Origin: the bug 0069 fix (0.62.0),
  [§Fix *Residuals* item 3](./0069-tools-entry-residue-silently-dropped.md)
  (reviewer finding R3), which names all three derivations, their sites, and the
  reason they were left: "§Fix constraint 5 names only `presentedCallableNames`,
  and none of the three can contradict the load observable because a malformed
  entry un-registers the theta outright. One visible corner: the pre-parse callee
  cache derives specs from malformed entries too, so a malformed entry whose
  first token names an existing erroneous `.theta` can co-fire
  `theta/load/callee-has-errors` alongside the grammar rejection — the
  un-registration outcome is unchanged." This report is that filing. The residual
  recorded the co-fire as a code-reading finding; it is measured here (three
  spellings, four controls, the emission order, the registered set). What the
  residual does not state and this report adds: the parse-time half — that
  `toolCallableName` / `piToolCallableName` feed three parse-layer gates whose
  diagnostics precede `tools:` resolution, that two of those gates emit messages
  asserting a Pi tool and a callable-set entry the grammar rejects, and that an
  error-severity parse diagnostic drops the theta at
  `production-composition.ts:1951` before the grammar rejection can fire at all.
  The residual's three anchors (`production-composition.ts:1584`,
  `theta-document.ts:4506`, `:4825`) each name the whitespace-split LINE rather
  than the enclosing declaration (`:1583`, `:4505`, `:4824`); all three are exact
  at HEAD read that way.
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:76–86` (the two
  entry kinds and the naming rules), `:88` (the closed-grammar sentence);
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:18` (the
  §`tools` rejection family, unordered);
  `docs/spec_topics/diagnostics/code-registry-load.md:25`
  (`theta/load/malformed-tool-entry` and its *Trigger*), `:38`
  (`theta/load/callee-has-errors`, its *Trigger* and its per-surface severity
  clause); `docs/spec_topics/diagnostics/code-registry-parse.md:47`
  (`bare-object-literal`), `:51` (`tool-arg-not-object-literal`), `:61`
  (`unknown-identifier`), `:62` (`shadowed-callable-call` and its *Message*);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:65` (multi-error reporting),
  `:71` (DIAG-1), `:72` (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/errors-and-results/error-model.md:17` (ERR-3), `:20`
  (ERR-6). User-facing mirrors: `docs/reference/frontmatter.md:134–137`,
  `docs/reference/diagnostics.md:188`, `:203`.
- Implementation evidence at `99b65438`: `src/parser/callable-set.ts:173–248`
  (`resolveCallableSet`, the malformed arm `:189–197`, the registration test
  `:238`), `:257–259` (`ToolsEntryParse`), `:292–315` (`parseToolsEntry` and its
  doc comment, the export rationale at `:302–306`), `:347–378` (`resolveEntry`'s
  two `.theta` rejections), `:387–391` (`thetaDefaultName`), `:398–400`
  (`isBareIdentifier`);
  `src/extension/production-composition.ts:190–211` (`makeLoadEmit`, the stderr
  mirror the probe reads), `:241–252` (`sinkOverPerDiagnosticEmit`), `:267–290`
  (`preEvalCauseOf`, the ERR-6 arm `:274–282`, the `theta/load/` arm
  `:286–288`), `:698–701` (the pass's tools-group emit and un-registration
  `continue`), `:1097–1107` (the shipped sink's per-error routing),
  `:1329–1332` (`TOOLS_DIAGNOSTIC_RANGE`), `:1391–1510`
  (`resolveThetaToolsAtLoad`: the callee cache `:1416–1425` with
  `toolsEntrySpec` at `:1418` and `isBareToolName` at `:1419`, the V15f loop
  `:1427–1442` with `relatedSites: []` at `:1437`, the resolver call `:1479–1483`
  and the append at `:1484`, the registration test `:1488–1491`), `:1578–1586`
  (`toolsEntrySpec` and its doc comment), `:1593–1595` (`isBareToolName`),
  `:1604–1630` (`parseCalleeForTools`, `hasErrors` at `:1628`), `:1904–1911`
  (`hasLoadParseError`), `:1938–1993` (`parseDiscoveredTheta`, the drop gate
  `:1951`, the dropped batch `:1979`);
  `src/parser/theta-document.ts:4498–4519` (`toolCallableName` and its doc
  comment), `:4528–4565` (`collectIdentRoots`, the `tools:` arm `:4557–4562`),
  `:4812–4831` (`piToolCallableName` and its doc comment), `:5196–5212`
  (`checkLexicalCallSites`' `tools:` loop), `:5356–5360` (the
  shadowed-callable emission), `:5363–5366` (`resolvesToPiTool`), `:5371–5377`
  (the tool-arg shape emission), `:5383–5391` (the bare-object arm);
  `src/extension/production-theta-producer.ts:222` (the `parseToolsEntry`
  import), `:3586–3620` (`presentedCallableNames` and its doc comment, the
  delegation at `:3607`).
- Test and corpus evidence at `99b65438`:
  `tests/tools-entry-closed-grammar.test.ts:190–513` (group (B), the
  production-load matrix; the query-only-body rationale at `:207–209`; the
  harness `:295–317`), `:515–665` (group (C));
  `tests/tools-entry-closed-grammar-lockstep.test.ts:64–80`
  (`topLevelFunctionBody`), `:86–105` (group (D1)), `:144–163` (group (D2));
  `tests/production-tools-load-resolution.test.ts:154–166` (the shipped
  `callee-has-errors` fixture pair, re-anchored after the bug 0070 fix,
  `0.63.0`, planted three further thetas above them);
  `tests/shadowed-callable-call.test.ts:325–341`, `:433–438`;
  `tests/tool-arg-shape-enforcement.test.ts:136–151` (the `makeDeps` /
  `diagsOf` parse-layer shape this report's probe reuses); the corpus census —
  `find . \( -name "*.theta" -o -name "*.thetalib" \) -not -path
  "./node_modules/*" -not -path "./.git/*"` (35 files), and a per-file scan of
  every `tools:` block (14 files, 18 entries, all single-token, 5 of them
  `.theta` paths).
- Reproduction: two scratch vitest probes at `99b65438` — the production-load
  co-fire matrix (three malformed `.theta`-path spellings, four
  single-diagnostic controls, one clean control, the two callees, and the two
  pre-emption cells) over a real on-disk `.pi/theta/` workspace through
  `discoverAndComposeFixtures`, with codes and order read off the stderr mirror;
  and the parse-time derivation matrix (six malformed entry shapes against their
  well-formed and no-entry controls, across the identifier root scope, the
  tool-argument shape rule and the shadowed-callable check) through the real
  `parseThetaDocument`. Run on the outputs quoted above, then deleted per scratch
  policy. No file in the tree was written by the probes; `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug doc are unmodified by this filing.

## Fix (0.216.0)

- What shipped:
  - `src/extension/production-composition.ts` — §Fix (b), **second placement**:
    the pre-parse callee-cache loop in `resolveThetaToolsAtLoad` skips an entry
    whose `parseToolsEntry(entry.trim())` is not `ok`, before `toolsEntrySpec`
    runs. A malformed entry therefore commissions no callee read/parse, so the
    V15f loop has no cache member for it and only the grammar's own
    `theta/load/malformed-tool-entry` fires. The site records why: a malformed
    token sequence is not an entry of either admitted kind
    (`frontmatter-fields-a.md:88`), so `theta/load/callee-has-errors`' *Trigger*
    (`code-registry-load.md:40`) has no subject, and the entry's own disposition
    is already the rejection (`:25`).
  - `src/extension/production-composition.ts` — `toolsEntrySpec` stays an
    undelegated **pure first-token projection** (§Fix constraint 7 recorded in
    its doc comment). Disposition (a)(1) chose the caller-side gate over
    delegation because the function gained a SECOND caller after this report was
    written — `checkNestedToolsContainment` (bug 0111), which judges
    discovery-root containment, not entry well-formedness, and is outside this
    report's subject.
  - `src/parser/theta-document.ts` — dispositions (a)(2) and (a)(3):
    `toolCallableName` and `piToolCallableName` keep their bodies byte-unchanged
    and record at each site that the wider-than-the-resolver reading is
    deliberate, with the observable it preserves (§Fix constraint 7).
  - `tests/tools-entry-grammar-derivations-lockstep.test.ts` (new, 24 cells) —
    the behavioural witness §Fix constraint 6 requires.
  - `tests/live/b0106live-cofire-refusal-live-cell.test.ts` (new) — the
    standalone H8a load/registration live cell over the shipped composition root.
  - `tests/tools-entry-closed-grammar.test.ts`,
    `tests/tools-entry-containment.test.ts`,
    `tests/tools-field-shape-refusal.test.ts`,
    `tests/tools-field-zero-entry-scalar-refusal.test.ts` — comment-only
    citation re-derivation for the lines this fix moved (no assertion touched).
- The parse-time dispositions, and the measurement that settled them. Both
  parse-time derivations were prototyped and measured over the shipped load
  path before Phase 1. The observable optimised is REACHABILITY of
  `theta/load/malformed-tool-entry`, the one diagnostic that names the actual
  authoring mistake:
  - Delegating BOTH: `tools: [- read bash]` + `read({ path: "x" })` (bug 0069's
    load-bearing dropped-comma spelling) draws `theta/parse/unknown-identifier`
    + `theta/parse/bare-object-literal`, so the drop gate fires and the grammar
    rejection never runs — where today it does. Same loss for
    `tools: [- ./x.theta junk]` + a call of the derived name.
  - Delegating only `piToolCallableName`: restores the rejection for
    `read("x")` but loses it for the sole-bare-object-argument call. No net
    reachability gain, a loss on the commonest shape.
  - Hence the tolerance stays: keeping a malformed entry's body references
    parse-clean is what lets the entry reach the closed grammar at load. The two
    false parse-layer messages this leaves (`pshape`, `pshadow`) are pinned as
    the recorded disposition by cells (C1)/(C2), not closed.
- Gates (all re-run by the orchestrator independently of every nested worker):
  - Witness RED before / GREEN after: with the 3-line gate removed, exactly
    cells (A1)(A2)(A3) red — `expected [ "theta/load/callee-has-errors",
    "theta/load/malformed-tool-entry" ] to deeply equal
    [ "theta/load/malformed-tool-entry" ]`, the co-fire pair in the emission
    order — 21 cells green; restored byte-exact (`git hash-object` 68489153),
    24/24 green.
  - Full default suite: `Test Files 401 passed (401) / Tests 8356 passed (8356)`.
  - `npm run typecheck` clean; `npm run lint` clean;
    `tests/citation-symbol-form-gate.test.ts` 3/3;
    `tests/committed-fixture-parse-gate.test.ts` 36/36.
  - Live, run for real under the shared lock:
    `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/b0106live-cofire-refusal-live-cell.test.ts` → 1/1 passed.
- Review: 1 round. Round 1 (`bug-fix-reviewer`) — CLEAN, no finding in any of
  correctness / fidelity / spec / house-rule / test / prose; three non-blocking
  residuals (a stale `:1702` inside an assertion message, the unrecorded second
  narrowing of the INV-1 escape loop, and line-form citations of TypeScript
  constructs in the two new files). All three were then discharged by one
  `bug-fix-fixer-light` polish round whose every hunk is comment / string /
  prose; polish verified by gate-diff, confirmation round skipped. One
  pre-review citation-correction round ran before round 1 (not a review round):
  it re-derived the citations this fix's line insertions moved and corrected
  four that were stale at HEAD.
- Verification (`bug-fix-verifier`): SOLID. (1) The witness reds on the fix's
  removal and only on cells A1–A3, restored byte-exact. (2) Default suite
  401/8356 green. (3) Lint, typecheck, citation gate and the committed-fixture
  parse gate green. (4) The live cell ran for real under the lock (acquired by
  `mkdir`, no contention, released by the same command chain) and passed.
- Constraint discharge: 1 — registration unchanged, pinned by cell (A6)
  (`["ctlgood","zgood"]`). 2 — the four controls stay separable, pinned by (A4).
  3 — a well-formed entry naming a missing file still draws
  `theta/load/unresolvable-theta-path` alone, pinned by (A5); the well-formed
  path through the cache is byte-identical, so `theta/load/prompt-mode-callable`
  is untouched. 4 — no new code, no registry edit, no spec sentence; no file
  under `docs/spec_topics/**` or `docs/reference/**` is modified. 5 — GOV-15
  census re-run at this baseline: 35 committed `.theta` / `.thetalib`, 14 with a
  top-level `tools:`, 18 entries, every one a single token, zero `as` clauses,
  zero multi-token entries — zero corpus exposure, and no input moves from
  loads-cleanly to refused (every input in §Reproduction already un-registers).
  6 — the witness is offline, provider-free and behavioural, over one
  `discoverAndComposeFixtures` call and one `parseThetaDocument` call. 7 — all
  three un-delegated derivations record their disposition at the site. 8 — 0070
  shipped in 0.63.0; no derivation ownership moves, so no sequencing was needed.
- Residuals:
  1. **The parse-time substitution is NOT closed.** `pshape`
     (`tools: [- read bash]` + `read("x")`) and `pshadow` (+ a shadowing local)
     still draw parse diagnostics whose DIAG-4 messages name a Pi tool and a
     callable-set entry the closed grammar rejects, and the grammar rejection is
     still unreachable for those two spellings. This is the adjudicated
     disposition, not an oversight: every measured alternative reduced the
     rejection's reachability elsewhere. Evidence: the prototype matrix above;
     cells (C1)/(C2) pin the outcome in both directions, so a future route that
     wants a different trade must red them deliberately. A separable follow-up
     would have to move the drop gate or the phase ordering, not the
     derivations.
  2. **The gate also narrows the INV-1 escape loop.** Both the V15f loop and the
     `nestedToolsEscapes` escape loop (bug 0110/0111) walk the same
     `calleeCache`, so a malformed entry whose first token escapes every active
     root no longer draws `theta/load/invoke-path-escape` either. Trigger-
     conformant on the same reasoning (`code-registry-load.md:34` presupposes "a
     `tools:` `.theta` entry") and registration is unchanged, but it is
     unwitnessed: no cell pairs a malformed entry with an escaping first token.
     Recorded in the gate comment. A control cell belongs to whoever next owns
     that surface.
  3. **69 other test files carry `production-composition.ts:N` /
     `theta-document.ts:N` citations shifted by this fix's comment insertions**
     (+1 at `:122`, +16 at `:1658`, +8 at `:1869`; +17 and +11 in
     `theta-document.ts`). They were NOT renumbered: several were already stale
     at HEAD independently of this change, and a blind renumber would assert a
     re-derivation nobody performed. Only citations in files this fix touched
     were re-derived, each verified by reading the cited line. The durable
     remedy is symbol form (`docs/STYLE.md` §Citations) as those files are next
     edited.
  4. **The `presentedCallableNames` name-shape axis is NOT claimed here.** The
     last §Affected bullet (the snapshot-absent fallback deriving a presented
     name without the shape rule bug 0070 added) is left to bug 0108, whose §Fix
     constraint 5 says the two reports must not both claim it. Untouched by this
     fix.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: every §Non-goals bullet holds unchanged —
  the grammar is not reopened; `theta/load/malformed-tool-entry`'s message,
  severity and all-or-nothing posture are untouched; `preEvalCauseOf`'s ERR-6
  enumeration is not edited (bug 0109 owns it); the empty `relatedSites` on the
  `tools:`-surface `callee-has-errors` emission is untouched; the shape of
  0069's constraint-5 witness is untouched (bug 0107 owns it); the three
  parse-layer rules are unchanged as rules.

