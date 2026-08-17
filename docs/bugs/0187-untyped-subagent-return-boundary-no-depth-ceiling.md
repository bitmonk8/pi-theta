# Bug 0187 — PIC-59's fail-closed rule (`subagent.md:114`) says a terminal `Ok` payload carrying a non-finite `number` "anywhere within it MUST refuse", and the shipped check stops at `MAX_JSON_DEPTH`: on a `tools:`-declared `.theta`-callable return — the one return boundary that runs no depth walk, because `#validateInvokeReturn` returns at `:3627` before `enforceInvokeReturnDepth` when `inferCalleeReturnAnnotation` names no type — a callee whose tail is `[[[[[[1 / 0]]]]]]` settles `{"ok":true,"value":[[[[[[null]]]]]]}` with `diagnostics: []`, so the caller binds a fabricated `null` at level 7 where the same value at level 5 refuses, and a `>cap` FINITE payload crosses that boundary unchecked too

- **Status:** open. §Fix is constraint-pinned, not settled: four candidates sit
  at three different sites — the parent-side gate, the child-side envelope
  writer, the child-side search cap, and the spec page — and three of the four
  newly refuse a payload that crosses today, which is a GOV-15 question
  (`docs/spec_topics/governance/source-language-stability.md:5`) whose answer
  depends on whether widening ceiling #4's enforcement points counts as a
  ceiling-set change under that requirement's own carve-out (`:13`). The
  constraints are in §Fix (e) and the same-commit corrections in §Fix (f); the
  run selects one route and states the evidence that decided it.
  Ordering: nothing blocks this report from starting and it blocks nothing.
  [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
  (0.105.0)**, commit `bf32ad03` — the provenance, and the owner of every byte a
  route here would move. Its two shipped witnesses
  (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts`, 27 cells, and
  `tests/subagent-invoke-nonfinite-return-refusal.test.ts`) are behavioural
  locks; the `FENCE-DEPTH` cell (`:821`) pins today's cross-unrefused behaviour
  as a *fence*, so a route that changes it re-pins it under its own authority
  (§Fix (e)(4)).
- **Sev/Diff estimate:** S1/D3 — S1 because a caller binds a value its callee
  never produced with nothing on any channel. Measured (§Reproduction (b), row
  A): a `mode: subagent` callee reached through frontmatter `tools:` whose tail
  is `[[[[[[1 / 0]]]]]]` settles at its caller as
  `{"ok":true,"value":[[[[[[null]]]]]]}` with `diagnostics: []` — no `Err`, no
  registered code, no `theta-system-note` — where the byte-identical value one
  level shallower (`[[[[1 / 0]]]]`, row B) refuses with
  `subagent return value is not JSON-representable at /0/0/0/0: Infinity`. The
  discriminator is the depth cap, and it decides fabricate-vs-refuse. Two
  conjuncts narrow reachability: the return site must name no type (measured: 5
  of the 5 committed `tools:`-declared `.theta`-callable call sites are on that
  boundary, §Affected) *and* the payload must nest a non-finite `number` past
  level 5 (no committed `.theta` / `.thetalib` nests an array literal at all,
  and 0 of 34 divide or take a modulo). So the class is reachable from clean
  source and unreached by the corpus — the same reachability shape 0180 carried,
  one conjunct narrower. D3 because §Fix needs in-run adjudication across four
  candidate sites, because three of them collide with GOV-15 from different
  sides, because the two files a route would touch
  (`src/runtime/subagent-envelope.ts`, `src/extension/production-theta-producer.ts`)
  are 0180's own hunks with pinned-byte fences to re-derive, and because every
  observable here needs a real spawned child (integration tier — the unit tier
  cannot reach what a caller binds).
- **Kind:** defect, three elements, each measured at HEAD `bf32ad03` (v0.105.0)
  through real spawned `pi` children.
  1. *A normative MUST is false past the depth cap.* PIC-59's fail-closed
     inventory gained a member in `bf32ad03`:
     `docs/spec_topics/pi-integration-contract/subagent.md:114` — "A terminal
     `Ok` payload carrying a non-finite `number` (`Infinity`, `-Infinity`,
     `NaN`) **anywhere within it** MUST refuse rather than serialise". The same
     commit's `Ok`-values bullet (`:110`) states it unqualified too: "the child
     refuses to emit an `ok` arm for a payload carrying a non-finite `number`".
     The shipped check is bounded: `firstNonFiniteNumber`
     (`src/runtime/subagent-envelope.ts:359`) returns `undefined` at
     `level > MAX_JSON_DEPTH` (`:364–366`, `MAX_JSON_DEPTH = 5` at
     `src/runtime/depth-walk.ts:40`). Measured: a non-finite `number` at level 6
     and at level 7 does not refuse (§Reproduction (b), rows B2 and A). The
     registry row states the bound correctly — "at any position within the
     ceiling-#4 JSON-document depth cap"
     (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`) — so two
     shipped records of one rule disagree, and the normative one is the wrong
     one.
  2. *The boundary that would have backstopped it enforces nothing.*
     `#validateInvokeReturn` (`src/extension/production-theta-producer.ts:3622`)
     returns at `:3627` when `returnSite === null`, which is *before*
     `enforceInvokeReturnDepth` at `:3636`. `#resolveReturnSite` (`:3559`)
     answers `null` for a bare `invoke(...)` (`:3567–3568`) and for a
     `tools:`-declared `.theta`-callable call whose
     `inferCalleeReturnAnnotation` (`src/parser/functions.ts:494`) names no type
     (`:3575`). That derivation names one only for a schema-constructor tail
     (`functions.ts:503–509`) or an enum-variant tail (`:510–517`) in a body
     carrying no `return` (`:499–501`); every other tail is `null` (`:518`). So
     that call's return runs no depth walk and no AJV check. Measured
     (§Reproduction (b)): a `>cap` FINITE payload crosses it unrefused (row C)
     while the same payload at a typed `invoke<number>` boundary is
     `Err … JSON document depth exceeds 5` (row D), and the same `tools:` call
     whose callee tail *is* a schema constructor refuses on depth (row E). The
     discriminator is the derivation, not the boundary.
  3. *The two together are the silent fabrication 0180 closed elsewhere.* The
     child writes `{"theta_result":{"v":1,"ok":[[[[[[null]]]]]]}}` because
     `serializeOkEnvelope` is `JSON.stringify` and `JSON.stringify(Infinity)` is
     `null`; the parent parses it, and with no return type at the site there is
     nothing to reject it. Measured (row A): the caller binds
     `[[[[[[null]]]]]]` for a callee that produced `[[[[[[Infinity]]]]]]`, with
     an empty diagnostic drain. This is INV-5's "never a fabricated `Ok`"
     (`docs/spec_topics/invocation.md:36`) and PIC-59's never-fabricate
     principle failing on the one leg where nothing else looks.
- **Related:**
  - [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) — **fixed
    (0.105.0)**, commit `bf32ad03`. Provenance and owner. Its
    `## Fix (0.105.0)` §*Residuals* item 2 (`:1289–1305`) is this report's
    subject, measured in that run's review round 2 and repeated verbatim in
    `.pi/tmp/fixes/0180-report.md` §*Residuals / notes* item 3; both close
    "**Not filed**". That fix stated the gap in two shipped places rather than
    hiding it — the registry row's *Trigger*
    (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`) and the walk's
    doc-comment (`src/runtime/subagent-envelope.ts:341–349`) — and refused to
    widen the child-side walk past the cap because unbounded recursion in the
    envelope writer is forbidden. This report owns what those two sentences
    describe. It adds no finding to 0180 and its §Fix (e) treats 0180's
    witnesses as locks.
  - [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) —
    **fixed (0.102.0)**, two faces. Its `## Fix (0.97.0)` §*Residuals* item 1
    (`:1209–1216`) is the floor this report is the consequence of: "A callee
    whose FN-3 return type is legible only to the type layer — a `let`-bound
    tail, a conditional tail, any body carrying a `return` — still crosses with
    no schema, so neither AJV nor the pass runs on it." Element 2 above is that
    sentence read for *depth*, and element 3 is the value it lets through. That
    residual's own locks — the derivation-floor control cells (d) and (e) in
    `tests/inbound-boundary-theta-callable.test.ts:330–334` and `:341–345` —
    exist so a widening "cannot happen silently", and a route here that widens
    the derivation trips them by design (§Non-goals).
  - [0068](./0068-prompt-callee-invoke-final-value-null.md) — **wontfix**. Bounds
    the *untyped* arm: `invocation.md:28` fixes that bare `invoke(...)` returns
    `Result<null, QueryError>` and "the runtime discards the child's return value
    entirely", so no caller binds the fabrication on that arm. It shares the
    `returnSite === null` path with the uninferred `tools:` arm
    (`#resolveReturnSite:3567–3568`), which is why a route placing the depth walk
    above `:3627` reaches it too (§Fix (a)). The fabrication happens child-side
    either way; what 0068 settles is only what the parent does with it.
  - [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) — **fixed
    (0.98.0)**. Owner of `projectForValidation` and of the split between the
    validated projection and the bound original inside `#validateInvokeReturn`.
    No route here touches `src/runtime/wire-translation.ts`; a route editing
    `#validateInvokeReturn` rebases onto 0174's hunks and re-runs its two
    witnesses.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, and the
    class this report is not. Every `src/extension/production-theta-producer.ts`
    line below was re-derived at HEAD against the symbol beside it (the file is
    6350 lines); 0180's own record notes that its predecessor's citations into
    this file were all stale by six releases.
- **Affected** (every citation re-verified against the tree at HEAD `bf32ad03`,
  v0.105.0, by `git show HEAD:<path>` and `rg`; volatile positions in
  `src/extension/production-theta-producer.ts` are named by symbol beside their
  line numbers per [0134](./0134-params-shift-induced-stale-citations.md)):
  - **The false normative sentences.**
    `docs/spec_topics/pi-integration-contract/subagent.md:114` (PIC-59's
    fail-closed inventory, new in `bf32ad03`), verbatim:

    ```
    - **Fail-closed non-representable `Ok` payload.** A terminal `Ok` payload carrying a non-finite `number` (`Infinity`, `-Infinity`, `NaN`) anywhere within it MUST refuse rather than serialise: the child maps it to `Err(InvokeInfraError { cause: "return_validation", ... })`, whose `message` names the offending value and, where it is nested, its position, and emits `theta/runtime/subagent-return-value-not-representable` … rather than writing an `ok` arm that `JSON.stringify` would otherwise substitute `null` into.
    ```

    and `:110` (the `Ok`-values bullet, rewritten by the same commit): "the
    child refuses to emit an `ok` arm for a payload carrying a non-finite
    `number` (see the fail-closed requirement below) and the parent receives the
    named `Err` instead." Neither carries a depth qualifier. PIC-59 itself is
    anchored at `:101`.
  - **The shipped record that states the bound correctly.**
    `docs/spec_topics/diagnostics/code-registry-runtime.md:32`, the *Trigger*
    cell of `theta/runtime/subagent-return-value-not-representable`: "refuses a
    terminal `Ok` payload that carries a non-finite `number` … **at any position
    within the ceiling-#4 JSON-document depth cap** … This code's own reach stops
    at that same depth cap. At a typed `invoke<T>` return boundary a payload
    nested deeper is already refused whatever it carries … A return boundary that
    runs no depth check has no such backstop: a subagent-mode `.theta` callable
    called as a tool, where the callee's inferred return type does not flow into
    the call site …, enforces nothing against that return, so a non-finite
    `number` nested deeper than the cap crosses it unrefused." The reference
    mirror (`docs/reference/diagnostics.md:260`) carries only Code / Sev / Phase
    / Message, so it neither states nor contradicts the bound.
  - **The bounded child-side search.** `src/runtime/subagent-envelope.ts`:
    `SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE` (`:92`);
    `firstNonFiniteNumber` (`:359`) with its bound at `:364–366`
    (`if (level > MAX_JSON_DEPTH) { return undefined; }`, called with
    `level = 1` at the payload root from `:420`);
    `mapNonRepresentableReturnValue` (`:416`) and its message construction
    (`:424–425`, an ` at <pointer>` segment only below the root). The walk's
    doc-comment carries the whole safety argument at `:327–358`: the
    cap-is-costless clause at `:334–339` ("The bound costs nothing at a TYPED
    `invoke<T>` return boundary … so descending further here could only
    re-decide a value that gate refuses") and the scoped correction 0180's
    review round 1 forced at `:341–349` ("That backstop reaches only a boundary
    that HAS a return type … A non-finite `number` nested deeper than the cap
    crosses THAT boundary unrefused, here and parent-side both"). `MAX_JSON_DEPTH
    = 5` is `src/runtime/depth-walk.ts:40`.
  - **The child-side call site.**
    `src/extension/production-theta-producer.ts:2253–2261`
    (`driveSubagentRootRegime`, `:2150`) — `mapNonRepresentableReturnValue` is
    consulted inside the `terminal.ok` arm (`:2248`) and, on a hit, the
    diagnostic plus an `err` envelope replace the `ok` write; otherwise
    `serializeOkEnvelope(terminal.value)` runs (`:2261`).
  - **The parent-side gate that skips the ceiling.**
    `src/extension/production-theta-producer.ts`: `#validateInvokeReturn`
    (`:3622`), its early return (`:3627–3629`,
    `if (returnSite === null || !result.ok) { return result; }`), and the
    ceiling-#4 walk it precedes (`:3636`,
    `enforceInvokeReturnDepth(calleePath, result.value)`, whose CIO-3 comment at
    `:3631–3635` calls the walk "the FIRST sub-check at the return-value AJV
    boundary"). The two call sites are `:3462` (the prompt→prompt attach cell)
    and `:3500` (the subagent spawn cell). The site resolution is
    `#resolveReturnSite` (`:3559`): `case "untyped": return null` (`:3567–3568`)
    and `case "callee-inferred"` (`:3569–3576`), whose `:3575` returns `null`
    whenever the derivation does. `enforceInvokeReturnDepth` itself is
    `src/runtime/invoke-ceiling-depth.ts:99`.
  - **The derivation that decides it.** `src/parser/functions.ts:494`
    (`inferCalleeReturnAnnotation`): `null` for an absent tail or any body
    carrying a `return` (`:499–501`); the declared-`schema` constructor tail
    (`:503–509`); the declared-`enum` variant tail (`:510–517`); `null` otherwise
    (`:518`). Its doc-comment (`:455–493`) states the floor's rationale at
    `:485–488`: "It is a conservative floor by design: naming a WIDER type than
    the callee actually returns would refuse a conforming return."
  - **The spec surfaces that fix where a depth check runs.**
    `docs/spec_topics/schema-subset.md:13` (the cap), `:20` (§Depth
    Enforcement), `:24–30` (the counting algorithm; `:30` "The cap is
    `depth ≤ 5`"), `:39` ("It runs at every site where a Theta-declared schema is
    validated against runtime JSON"), `:45` (site 5, "when `invoke<Schema>(...)`
    succeeds and the callee's return value is AJV-validated against `<Schema>`"),
    and `:47` (the walk runs before AJV).
    `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md:19` (the five
    enforcement points), `:27` (the `invoke<T>` return-value row → `invoke
    parent` → `Err(InvokeInfraError { cause: "return_validation" })`), and `:41`
    (CIO-3: "Ceiling #4 … is the first sub-check at every AJV validation
    boundary"). `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md:47`
    is the *Five-site list co-edit obligation*: a leaf that "adds, removes, or
    splits a row of that table MUST update the five-site enumeration in CIO-3 …
    and the per-site reachable-mask-domain table in … PIC-1 in the same commit".
  - **The boundary's own typing rule.** `docs/spec_topics/tool-calls.md:23`, the
    *Registered theta (subagent-mode)* row: `Result<T, QueryError>` where `T` is
    the callee's inferred return type, "flows into the call site" when the callee
    is statically resolvable, "Otherwise the runtime AJV check enforces it" — the
    fallback that leaves a typeless boundary enforcing nothing.
  - **GOV-15.** `docs/spec_topics/governance/source-language-stability.md:5`
    (observables (a) return values, (b) ordered diagnostic-code sequences, (c)
    `theta-system-note` content) and `:13` (*Ceiling-set carve-out*), whose
    in-scope set excludes an input that "trips a ceiling under one release but
    succeeds under the other (whether via the ceiling being introduced, retired,
    relaxed, or **never having been ceilinged on the other side**)" while also
    fixing that "the carve-out is keyed to ceiling-set changes only".
  - **0180's shipped witnesses — the locks.**
    `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (1363 lines, 27
    cells): `CONTROL (FENCE-DEPTH)` at `:821` asserts `MAX_JSON_DEPTH` is 5,
    that a level-7 `Infinity` "is not this walk's to find"
    (`refusalFor(tooDeep)` is `undefined`), that `enforceInvokeReturnDepth`
    refuses that payload anyway, and that a level-4 `Infinity` is within the cap
    so ceiling #4 defers. `RED (SEAM-NESTED)` at `:728` is its within-cap
    companion. `tests/subagent-invoke-nonfinite-return-refusal.test.ts` (587
    lines, one `it` over real spawned children, soft cells) measures what a
    *typed* `invoke` parent binds. Neither drives a `tools:`-declared callable,
    and neither drives a payload past the cap at a parent boundary.
    `tests/invoke-ceiling-depth.test.ts:105` pins the walk's position at the
    typed boundary over `DEPTH_6_VALUE` (`:39`).
  - **The corpus census.** 34 committed `.theta` / `.thetalib` at HEAD,
    unchanged since 0180's baseline `34db8505`
    (`git diff --stat 34db8505 HEAD -- '*.theta' '*.thetalib'` is empty). Five
    declare a `.theta` entry in `tools:` — `docs/examples/fan-out-reviews.theta`,
    `ralph.theta`, `refine.theta`, `typed-params-across-boundary.theta`,
    `typed-return.theta` — and each calls its callee from code
    (`review_lens(path)`, `ralph_step(objective)`, `reviewer(draft)`,
    `summarise_doc(document)`, `sentiment(text)`). All five callees
    (`docs/examples/review-lens.theta`, `ralph-step.theta`, `reviewer.theta`,
    `summarise-doc.theta`, `sentiment.theta`) carry zero `return` statements and
    a bare **identifier** tail (`review`, `status`, `v`, `s`, `result`), which is
    neither `tail.kind === "object"` nor `tail.kind === "member"`, so
    `inferCalleeReturnAnnotation` answers `null` for every one: **5 of 5**
    committed `tools:`-callable call sites are on the boundary that enforces
    nothing. No committed `.theta` / `.thetalib` divides or takes a modulo (0 of
    34) and none nests an array literal (`grep '\[\['` returns nothing), so
    nothing in the corpus reaches the fabrication today. No test file nests four
    array literals except two depth-fixture comments
    (`tests/production-live-resolvers.test.ts:348`,
    `tests/tool-arg-runtime-schema-validation.test.ts:472`), neither on this
    boundary.
- **Observed at:** v0.105.0 (`bf32ad03`, `package.json:3`), the fix commit for
  0180. Windows. Measured by one scratch vitest probe (written, run, deleted)
  over real spawned `pi` children through the production spawn path, with all
  three AGENTS.md `#subagent-child-pins` set; provider-free and zero model turns
  — every fixture body is a `let` chain ending in a pure tail expression, so no
  query is issued. Wall time 12.6 s for six root drives. A sibling session's
  untracked `tests/scratch-0188-negzero-probe.test.ts` was present during the
  run; it is not a file this report cites and every citation above is read from
  `git show HEAD:<path>`.

## Summary

Commit `bf32ad03` closed bug 0180 by making the subagent return envelope fail
closed on a non-finite `number`: the child refuses instead of letting
`JSON.stringify` substitute `null`. The search that finds the offending value is
bounded by `MAX_JSON_DEPTH` (`subagent-envelope.ts:364`), deliberately — an
unbounded recursion in the envelope writer is what CIO-3's discipline forbids.

The safety argument for that bound is written at `subagent-envelope.ts:334–339`:
past the cap, the typed `invoke<T>` return boundary refuses the payload anyway,
"whatever it carries", so descending further would only re-decide a value that
gate refuses. The clause immediately after it (`:341–349`) records that the
argument holds only where the gate runs, and that one boundary has no gate.

That boundary is a `tools:`-declared `.theta`-callable call.
`#validateInvokeReturn` returns at `:3627` when the return site names no type,
before the ceiling-#4 walk at `:3636`, and
`inferCalleeReturnAnnotation` names a type only for a schema-constructor or
enum-variant tail. So for a callee whose tail is anything else — including the
`let`-bound identifier every one of the five committed corpus callees ends with
— the return crosses with no depth walk and no AJV check.

Composing the two: a `mode: subagent` callee reached through `tools:` whose tail
is `[[[[[[1 / 0]]]]]]` writes `{"theta_result":{"v":1,"ok":[[[[[[null]]]]]]}}`,
and the caller binds `[[[[[[null]]]]]]` with an empty diagnostic drain. The
same value at level 5 refuses by name. Nothing on the path reports the
difference, and PIC-59's own normative sentence (`subagent.md:114`) says the
level-7 case MUST refuse.

The depth half stands alone as well: a `>cap` payload carrying only finite
numbers also crosses that boundary unchecked, where the identical payload at a
typed `invoke<number>` boundary is `Err … JSON document depth exceeds 5`, and
where the identical `tools:` call whose callee tail *is* a schema constructor
refuses on depth. The discriminator is the derivation at `functions.ts:494`, not
the boundary and not the payload.

## Reproduction

At HEAD `bf32ad03` (v0.105.0). Step (a) is a read; step (b) is one probe over
real spawned children.

**(a) The two records of one rule, and the code they describe.**

```sh
git show HEAD:docs/spec_topics/pi-integration-contract/subagent.md | sed -n '110p;114p'
git show HEAD:docs/spec_topics/diagnostics/code-registry-runtime.md | sed -n '32p'
git show HEAD:src/runtime/subagent-envelope.ts | sed -n '327,366p'
git show HEAD:src/extension/production-theta-producer.ts | sed -n '3622,3637p'
git show HEAD:src/parser/functions.ts | sed -n '494,519p'
```

`subagent.md:114` says "anywhere within it MUST refuse". `:110` says the child
"refuses to emit an `ok` arm for a payload carrying a non-finite `number`".
`code-registry-runtime.md:32` says "at any position within the ceiling-#4
JSON-document depth cap" and then names the uncovered boundary in full.
`subagent-envelope.ts:364` is the bound. `production-theta-producer.ts:3627` is
the early return that precedes `:3636`'s depth walk. `functions.ts:518` is the
`null` every non-schema, non-enum tail takes.

**(b) The measurement.** One scratch vitest probe, deleted after the run, over
the real production spawn path: `launchSubagentChild` +
`createProductionSpawnFn()` + `driveSubagentChild`, with `process.argv[1]`
pointed at `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`,
`PI_THETA_SUBAGENT_EXTENSION_PIN` set to this tree's `extensions/`, and
`parentPid: process.pid` beside it (AGENTS.md `#subagent-child-pins`; the pin is
authenticated, so omitting the pid strips it in silence). Harness shape mirrors
`tests/subagent-invoke-nonfinite-return-refusal.test.ts`.

Six root thetas, each driven in its own spawned child, each spawning one
grandchild. Every callee is `mode: subagent` with a pure tail expression. Rows A,
B2 and C propagate with `?` and return the bound value, so the root's own settled
`value` **is** what the caller bound; rows B, D and E reduce through
`match r { Ok(v) => "OK", Err(e) => e.message }` and return the message, so a
refusal is data rather than an unwind.

| Row | Return boundary | Callee tail | Non-finite at | Settled at the caller |
|---|---|---|---|---|
| **A** | `tools:` callable, derivation `null` | `[[[[[[1 / 0]]]]]]` | level 7 | `{"ok":true,"value":[[[[[[null]]]]]]}` |
| **B** | `tools:` callable, derivation `null` | `[[[[1 / 0]]]]` | level 5 | `Err` — `subagent return value is not JSON-representable at /0/0/0/0: Infinity` |
| **B2** | `tools:` callable, derivation `null` | `[[[[[1 / 0]]]]]` | level 6 | `{"ok":true,"value":[[[[[null]]]]]}` |
| **C** | `tools:` callable, derivation `null` | `[[[[[[1]]]]]]` | — (finite, depth 7) | `{"ok":true,"value":[[[[[[1]]]]]]}` |
| **D** | `invoke<number>("./deepfin.theta")` | `[[[[[[1]]]]]]` | — (finite, depth 7) | `Err` — `JSON document depth exceeds 5` |
| **E** | `tools:` callable, derivation `W` | `W { a: [[[[[1]]]]] }` | — (finite, depth 7) | `Err` — `JSON document depth exceeds 5` |

The parent-side diagnostic drain is `[]` on all six rows, and every child exits
`0` with `signal: null` (PIC-59: one invocation per process).

Row A is the primary. It is byte-identical to what 0180's review round 2
measured and its fix record carries as residual 2: a `tools:` callee whose tail
is `[[[[[[1 / 0]]]]]]` settles `{"ok":true,"value":[[[[[[null]]]]]]}` with
`diagnostics: []`.

Rows A / B / B2 together isolate the discriminator to the cap: level 5 refuses,
level 6 and level 7 fabricate. The boundary is exactly `MAX_JSON_DEPTH` —
`firstNonFiniteNumber` is entered with `level = 1` at the root, so an array of
arrays nests one level per bracket and the fifth bracket's element is the
deepest value it inspects.

Row C is the depth half on its own: nothing about non-finiteness is needed for a
`>cap` payload to cross this boundary. Row D is the same payload at a boundary
that *does* run the walk, and row E is the same *boundary* with a callee tail
the derivation can name. So neither the payload nor the boundary explains the
verdict — the callee's tail syntax does.

Fixture shapes, verbatim (`SUB` is `---\nmode: subagent\n---\n`):

```
deepnf.theta       SUB + "[[[[[[1 / 0]]]]]]\n"
capsix.theta       SUB + "[[[[[1 / 0]]]]]\n"
capnf.theta        SUB + "[[[[1 / 0]]]]\n"
deepfin.theta      SUB + "[[[[[[1]]]]]]\n"
deepschema.theta   SUB + "schema W { a: array<array<array<array<array<number>>>>> }\nW { a: [[[[[1]]]]] }\n"
```

```
top-a.theta        ---\nmode: subagent\ntools:\n  - ./deepnf.theta\n---\nlet r = deepnf()\nlet v = r?\nv
top-b.theta        ---\nmode: subagent\ntools:\n  - ./capnf.theta\n---\nlet r = capnf()\nlet m = match r { Ok(v) => "OK", Err(e) => e.message }\nm
top-d.theta        ---\nmode: subagent\n---\nlet r = invoke<number>("./deepfin.theta")\nlet m = match r { Ok(v) => "OK", Err(e) => e.message }\nm
```

Every fixture parses and loads with no diagnostic: a nested array literal is
ordinary theta source, and no load- or parse-time check bounds a value's
nesting.

## Expected behaviour

- **A normative MUST is true, or it is qualified.** `docs/STYLE.md:28`: "Every
  claim is testable or is removed." `subagent.md:114`'s "anywhere within it" is
  decided by one probe, and at HEAD the answer is no. Either the implementation
  reaches everywhere the sentence claims, or the sentence states the bound the
  registry row (`code-registry-runtime.md:32`) already states.
- **Two shipped records of one rule agree.** The registry *Trigger* bounds the
  refusal to the ceiling-#4 cap and names the uncovered boundary; PIC-59 bounds
  it nowhere. One of the two is wrong about the code they both describe, in the
  commit that wrote both.
- **A caller does not bind a value its callee did not produce.** INV-5
  (`invocation.md:36`) requires the parent to derive the `invoke` result solely
  from the envelope and fixes "never a fabricated `Ok`" for the
  exit-without-envelope case; PIC-59's fail-closed members each restate the
  never-fabricate principle. A `null` where the callee produced `Infinity` is a
  fabricated value whichever depth it sits at.
- **Whether a return value is checked does not depend on the callee's tail
  syntax.** `tool-calls.md:23` types the row by the callee's inferred return
  type and leaves "otherwise the runtime AJV check enforces it" — a fallback
  that enforces nothing where there is no type. Measured, that turns a
  `let`-bound tail into the difference between a refusal and a fabrication for
  the identical value (rows A/B vs row E), and the corpus's five callee tails
  are all on the unenforced side.
- **The depth cap means the same thing at every return boundary.**
  `schema-subset.md:13` states the cap as "a property of the runtime JSON
  value"; `:39` ties enforcement to schema-validation sites. A boundary that
  validates nothing therefore enforces nothing, which is consistent — but the
  child-side representability check's safety argument
  (`subagent-envelope.ts:334–339`) leans on that enforcement existing. Either
  the enforcement exists at the boundary the argument needs, or the argument is
  scoped and the residual is stated normatively rather than only in a registry
  *Trigger* and a doc-comment.

## Actual behaviour / root cause

### 1. The bound, and what it was argued from

`mapNonRepresentableReturnValue` (`subagent-envelope.ts:416`) calls
`firstNonFiniteNumber(value, 1, "")` (`:420`), whose first statement is

```ts
if (level > MAX_JSON_DEPTH) {
  return undefined;
}
```

(`:364–366`). The root is level 1 and each descent adds one, so the deepest
value inspected sits at level 5. The bound is deliberate and its WHY is at
`:334–339`: "unbounded recursion inside the envelope writer is forbidden
(CIO-3). The bound costs nothing at a TYPED `invoke<T>` return boundary: there a
payload nested deeper than the cap is already refused whatever it carries, by
the ceiling-#4 depth walk … so descending further here could only re-decide a
value that gate refuses."

That claim is true where it is scoped, and 0180's review round 1 forced the
scoping. The next paragraph (`:341–349`) is the whole of this report's element 2,
in the shipped code: "That backstop reaches only a boundary that HAS a return
type … so a `.theta`-callable call through `tools:` whose callee tail is anything
else (a `let`-bound identifier, an array literal, arithmetic) runs no depth walk
at all."

### 2. Why the boundary runs nothing

Three positions compose:

1. `#validateInvokeReturn` (`production-theta-producer.ts:3622`) opens with
   `if (returnSite === null || !result.ok) { return result; }` (`:3627–3629`).
   The ceiling-#4 walk is nine lines later (`:3636`), so a `null` site skips it
   along with the lowering, the AJV call and the inbound translation pass.
2. `#resolveReturnSite` (`:3559`) produces that `null` two ways: `case
   "untyped"` returns it outright (`:3567–3568`), and `case "callee-inferred"`
   returns it whenever `inferCalleeReturnAnnotation` does (`:3575`).
3. `inferCalleeReturnAnnotation` (`functions.ts:494`) names a type only for a
   declared-`schema` constructor tail (`:503–509`) or a declared-`enum` variant
   tail (`:510–517`), in a body with no `return` (`:499–501`). Everything else is
   `null` (`:518`).

The floor at (3) is deliberate and correct on its own terms — its doc-comment
(`:485–488`) records that "naming a WIDER type than the callee actually returns
would refuse a conforming return" — and bug 0172's `## Fix (0.97.0)` residual 1
records exactly what it leaves unenforced. What is new here is that the *depth*
consequence of that floor is now load-bearing for a fail-closed guarantee
written one release later.

Measured, the three positions produce the full matrix in §Reproduction (b):
row C (no type → no walk → a depth-7 payload crosses), row D (typed → walk →
refused), row E (same boundary, schema-constructor tail → type → walk →
refused).

### 3. What the caller ends up holding

For row A the child's `terminal.ok` arm consults
`mapNonRepresentableReturnValue` (`production-theta-producer.ts:2253–2256`),
gets `undefined` because the `Infinity` sits at level 7, and takes the `else`
branch: `emitEnvelope(serializeOkEnvelope(terminal.value))` (`:2261`).
`JSON.stringify` has no non-finite form, so the line is
`{"theta_result":{"v":1,"ok":[[[[[[null]]]]]]}}`. The parent parses it, settles
`{ok: true, value: [[[[[[null]]]]]]}`, and hands it to `#validateInvokeReturn`
at `:3500`, which returns it unchanged at `:3627` because the site names no
type. The root theta's `let v = r?` binds the fabricated array and its tail
returns it.

Nothing reports the substitution. The child's diagnostic channel is
process-local and emitted only on the refusal path it did not take; the parent's
drain is empty (measured, all six rows); no `theta-system-note` fires because
nothing failed; `invoke_infra` never arises. The author reads a `null` at
`v[0][0][0][0][0][0]` and has no channel that distinguishes it from a callee
that returned `null` there.

### 4. Why the loud arm one level up makes this worse, not better

Row B refuses with a message naming the value and its RFC-6901 position:
`subagent return value is not JSON-representable at /0/0/0/0: Infinity`. So the
same author, on the same boundary, with the same operator (`/`), sees a precise
named refusal at level 5 and a silent fabricated `null` at level 6. The
behaviour is discontinuous at a threshold neither the message nor
`subagent.md:114` mentions, and the only shipped place that mentions it at all
is a registry *Trigger* cell and a code comment.

### 5. The depth half is independent of the value class

Row C carries no non-finite value and still crosses a boundary where
`schema-subset.md:30`'s "`depth ≤ 5`" is otherwise enforced at every AJV site
(`:39`, `:45`; CIO-3 at `ceilings-3-and-4.md:41`). That is consistent with the
spec as written — the cap is enforced *at AJV boundaries*, and this boundary has
no AJV — but it means a fix that only widens the child-side non-finite search
would leave row C exactly as it is, and would leave the discontinuity in row
A/B/B2 replaced by a different one (unbounded recursion, which 0180 refused).

### 6. Nothing is witnessed

0180's `FENCE-DEPTH` cell
(`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:821`) asserts that a
level-7 `Infinity` "is not this walk's to find" and that
`enforceInvokeReturnDepth` refuses that payload — both true, and together they
pin the *typed* composition. They do not reach a boundary with no return type,
because `enforceInvokeReturnDepth` is called directly in that cell rather than
through `#validateInvokeReturn`. 0180's integration witness
(`tests/subagent-invoke-nonfinite-return-refusal.test.ts`) drives only typed
`invoke<T>` sites. 0172's derivation-floor cells
(`tests/inbound-boundary-theta-callable.test.ts:330–334`, `:341–345`) pin that
the uninferred boundary performs no *translation*, over within-cap payloads. No
committed test composes an uninferred boundary with a `>cap` payload in either
direction.

## Why it matters

- **A caller binds a value the callee never produced, with nothing on any
  channel.** Measured (row A): `[[[[[[null]]]]]]` for `[[[[[[Infinity]]]]]]`,
  `diagnostics: []`. This is the S1 class 0180 was filed to close, alive on the
  one return boundary 0180's own fix could not reach.
- **A shipped normative MUST is false.** `subagent.md:114` is new in
  `bf32ad03` and says "anywhere within it". A reader implementing against PIC-59
  — or auditing the fail-closed inventory — is told a guarantee the runtime does
  not provide, in the commit that added it.
- **The two records disagree with each other.** The registry *Trigger*
  (`code-registry-runtime.md:32`) states the cap and names the uncovered
  boundary; PIC-59 states neither. Which one an implementer or a later fix
  believes changes what they build.
- **The verdict turns on the callee's tail syntax.** Rows A and E differ only in
  whether the callee's last expression is an array literal or a schema
  constructor, and that decides fabricate-vs-refuse. All five committed corpus
  callees end in a `let`-bound identifier, so the corpus's own idiom is on the
  unenforced side of that split.
- **The discontinuity is at an undocumented threshold.** Level 5 refuses by
  name; level 6 fabricates in silence. No author-facing surface states the
  number.
- **The safety argument for a shipped bound rests on a gate that is absent for
  one consumer.** `subagent-envelope.ts:334–339` argues the cap is costless;
  `:341–349` records that it is not, for this consumer. A future change to
  either the cap or the derivation has no witness telling it what it broke.
- **Nothing gates it in either direction.** No committed test drives an
  uninferred return boundary with a payload past the cap, so a later widening of
  `inferCalleeReturnAnnotation` (which would *close* this by accident) and a
  later loosening (which would widen it) are both invisible to the suite.

## Fix

Not settled. The two halves and the false sentences are fixed and measured;
*which site moves* is not. Four candidates sit at four sites and three of them
newly refuse a payload that crosses today. Every route carries the constraints in
(e) and the same-commit corrections in (f).

### (a) Run the ceiling-#4 walk at a return boundary that has no return type

Move `enforceInvokeReturnDepth` (`production-theta-producer.ts:3636`) above
`#validateInvokeReturn`'s early return (`:3627`), or hoist it into
`#driveCallee`'s two call sites (`:3462`, `:3500`), so a depth breach is refused
whether or not the site names a type.

- **It closes both halves at one position** and it reuses the existing carrier:
  a breach already surfaces as
  `Err(InvokeInfraError { cause: "return_validation" })` with the canonical
  `JSON document depth exceeds 5` message and `schema_keyword: "maxDepth"`
  (`invoke-ceiling-depth.ts:99`; `ceilings-3-and-4.md:27`). **No registered code
  is needed** — a ceiling-#4 breach carries no `theta/*` code at this boundary
  today, so DIAG-2 is not engaged. A route taking (a) states that finding
  explicitly rather than adding a row by reflex.
- **It reaches the untyped `invoke(...)` arm too**, because that arm shares the
  `returnSite === null` path (`:3567–3568`). `invocation.md:28` discards the
  untyped form's value, so a route here would refuse a payload nobody reads.
  The narrow placement is a walk gated on `returnTyping.kind !==
  "untyped"` — i.e. the *uninferred* arm only — which requires threading
  `returnTyping` (or a boolean derived from it) past `#resolveReturnSite`'s
  `null` collapse, since `InvokeReturnSite | null` cannot currently distinguish
  "untyped" from "inferred nothing". A route taking (a) states which of the two
  placements it takes and what the other would have flipped.
- **It is a five-site question.** `schema-subset.md:39` ties the depth check to
  "every site where a Theta-declared schema is validated against runtime JSON"
  and `:45` spells site 5 as `invoke<Schema>(...)`; CIO-3
  (`ceilings-3-and-4.md:41`) fixes the walk as "the first sub-check at every
  AJV validation boundary". A boundary with no schema is not one of those sites,
  so enforcing there either widens site 5's definition or splits a new row —
  and `ceiling-invariants-and-audit.md:47`'s *Five-site list co-edit obligation*
  then requires CIO-3's enumeration and PIC-1's per-site reachable-mask-domain
  table to move in the same commit. A route taking (a) discharges that
  obligation or argues the row is unchanged.
- **It moves GOV-15 observable (a) for a today-succeeding input.** Row C
  currently binds `[[[[[[1]]]]]]`; under (a) it becomes `Err`. Row A currently
  binds `[[[[[[null]]]]]]`; under (a) it becomes `Err`. Neither input is
  refused today by anything, and both load cleanly. See (e)(2).

### (b) Refuse a too-deep `Ok` payload child-side, at the envelope writer

Run the existing `depthWalk` (`src/runtime/depth-walk.ts`) over the terminal
`Ok` payload in `driveSubagentRootRegime` (`production-theta-producer.ts:2248`)
before `serializeOkEnvelope`, and map a breach to a fail-closed `err` envelope
beside `mapNonRepresentableReturnValue`.

- **It needs no unbounded recursion.** `depthWalk` fast-fails at the first node
  exceeding 5 (`schema-subset.md:47`), so the work is bounded by construction —
  which is the objection (c) cannot answer.
- **It closes both halves for every parent**, typed or not, because the refusal
  happens before the value leaves the child. It also makes the child-side
  non-finite search's bound genuinely costless: past the cap, nothing crosses at
  all, so `subagent-envelope.ts:334–339`'s argument becomes true without
  qualification.
- **The envelope writer is not an AJV boundary**, so this is a *new* fail-closed
  class rather than a widening of ceiling #4's five sites. That means a new
  PIC-59 requirement bullet in the voice of its siblings and — because the
  breach is child-side and must reach an operator through the child's own
  diagnostic channel — a **registered code** with its DIAG-2 same-commit
  registry row and reference mirror, exactly as `bf32ad03` added
  `theta/runtime/subagent-return-value-not-representable`. A route taking (b)
  states whether the existing canonical depth message and
  `cause: "return_validation"` are reused (they carry the right words) or
  whether a distinct code is minted, and why.
- **It flips more inputs than (a).** Every subagent-mode callee returning a
  `>cap` payload newly refuses, including at a *typed* parent that today gets
  the same refusal with a different origin, and including a top-level `/name`
  dispatch of a `mode: subagent` theta, which flips silent success → one SLSH-3
  `theta-system-note` (GOV-15 observable (c)). A route taking (b) enumerates
  them in the form 0180's `## Fix (0.105.0)` (e)(7) uses.

### (c) Raise or remove the child-side non-finite search cap

Let `firstNonFiniteNumber` (`subagent-envelope.ts:359`) descend past
`MAX_JSON_DEPTH`.

- **0180 refused this and the reasons are recorded and still hold.** The walk's
  own doc-comment states the prohibition (`:334–335`: "unbounded recursion
  inside the envelope writer is forbidden (CIO-3)"), the fix record states it as
  the remedy it declined ("Widening the walk past the cap is forbidden … so the
  remedy was to scope the claim"), and the `FENCE-DEPTH` cell (`:821`) pins the
  bound so a later change cannot widen it unnoticed. The envelope writer runs on
  a value the interpreter built, with no prior depth gate on this leg (row C), so
  removing the bound is unbounded recursion on author-controlled nesting.
- **It closes only half the report.** Row C carries no non-finite value and is
  untouched by any change to a non-finite search. So (c) leaves the depth half
  live while spending the prohibition.
- **A bounded variant — raise the cap to a larger constant — buys nothing
  principled.** The discontinuity moves to the new number and
  `subagent.md:114`'s "anywhere within it" stays false. A route taking (c)
  states which value and on what authority, and still owes (f).

### (d) State the bound normatively and close nothing

Correct `subagent.md:110` and `:114` to state the depth bound the registry row
already states, name the uncovered boundary there as the row does, and stop.

- **It is the honest floor and it moves no input.** GOV-15 observables (a), (b)
  and (c) are untouched; a false MUST becomes a true bounded one; the two
  shipped records agree.
- **It leaves the fabrication live.** A caller still binds `[[[[[[null]]]]]]`
  for `[[[[[[Infinity]]]]]]` with no diagnostic. A route taking only (d) states
  why a fabricated value at a boundary with no type is acceptable, given that
  the whole of 0180 was that it is not.
- **It is a genuine saving only if (a), (b) and (c) are all refused.** Otherwise
  the sentence is written twice — once here and once by whichever route lands,
  since (f)(1) is owed either way.

### (e) Constraints every route carries

1. **0180's shipped witnesses are locks.**
   `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (27 cells) and
   `tests/subagent-invoke-nonfinite-return-refusal.test.ts` stay green. In
   particular the within-cap refusal, its pointer rendering, the finite
   controls, and `CONTROL (FENCE-NEGATIVE-ZERO)` are untouched: this report's
   class is what happens *past* the cap.
2. **GOV-15 is named, not absorbed.** Routes (a), (b) and (c) each newly refuse
   at least one input that loads cleanly and succeeds today (rows A, B2, C at
   minimum). The chosen route enumerates every spelling that flips and in which
   direction, and adjudicates the *Ceiling-set carve-out*
   (`source-language-stability.md:13`) explicitly: its in-scope set excludes an
   input that succeeds under one release and trips a ceiling under the other
   "never having been ceilinged on the other side", which reads onto rows A and
   C — while the same paragraph fixes that "the carve-out is keyed to
   ceiling-set changes only", and widening an existing ceiling's enforcement
   points leaves the four-item ceiling list unchanged. That tension is decided
   on the record, not assumed either way.
3. **No unbounded recursion in the envelope writer.** CIO-3's discipline and
   `subagent-envelope.ts:334–335` bind every route. A route that walks deeper
   than today does so with a fast-failing bounded walk (`depthWalk`), not a
   hand-rolled descent.
4. **`FENCE-DEPTH` is re-pinned under the landing route's own authority.**
   `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:821` currently asserts
   three things: that `MAX_JSON_DEPTH` is 5, that a level-7 `Infinity` is "not
   this walk's to find", and that `enforceInvokeReturnDepth` refuses that
   payload anyway. Route (a) leaves all three true (the child-side walk is
   unchanged) and the cell's *reason* changes — it is no longer a fence over a
   gap. Route (b) leaves the first two true and adds a second refusal path
   before the walk is reached. Route (c) falsifies the second. Whichever lands
   states which assertions it re-pins and why the cell still means what its
   comment says.
5. **The ceiling-#4 walk stays before AJV wherever it runs.** CIO-3
   (`ceilings-3-and-4.md:41`) and `tests/invoke-ceiling-depth.test.ts:105` fix
   the order at the typed boundary. A route adding the walk at a new position
   adds it *before* any validation at that position, and does not reorder the
   typed one.
6. **The derivation is not widened.** `inferCalleeReturnAnnotation`'s
   conservative floor (`functions.ts:485–488`) and 0172's control cells
   (`tests/inbound-boundary-theta-callable.test.ts:330–334`, `:341–345`) stay
   as they are; see §Non-goals.
7. **`src/runtime/wire-translation.ts` does not move.** Bug 0174's
   `projectForValidation` and the validated-projection / bound-original split
   are settled; no route here touches them, and a route editing
   `#validateInvokeReturn` re-runs 0174's two witnesses green.
8. **Witness — integration tier, offline, provider-free.** The observable is
   what a *caller* binds, which is produced by a chain beginning with a real
   child process's stdout, so the witness spawns real children through
   `createProductionSpawnFn` with all three `#subagent-child-pins` as loud
   preconditions, and re-drives §Reproduction (b)'s six rows: the fabrication
   (A), the within-cap refusal (B), the exact cap boundary (B2), the finite
   `>cap` crossing (C), the typed control (D), and the inference control (E).
   Rows B, D and E are green-now-green-after fences; rows A, B2 and C are the
   reds. Zero model turns — every fixture body is a `let` chain ending in a pure
   tail expression. Each new assertion is proved both directions once.

### (f) Same-commit corrections every route carries

1. **PIC-59's fail-closed bullet**
   (`docs/spec_topics/pi-integration-contract/subagent.md:114`) — "anywhere
   within it" is measured false at level 6 and level 7. Corrected to state what
   holds under the chosen route: under (a) or (b), that nothing carrying a
   non-finite `number` reaches a caller at any depth (and by which mechanism at
   which site); under (c) or (d), the bound, in the registry row's own terms.
2. **PIC-59's `Ok`-values bullet** (`:110`) — the same unqualified claim, in the
   bullet the envelope's whole `Ok` arm rests on. Moves with (f)(1).
3. **The registry *Trigger*** (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`)
   — its "A return boundary that runs no depth check has no such backstop …
   crosses it unrefused" clause is a statement about HEAD. Under (a) or (b) it
   becomes false and is rewritten; under (c) or (d) it is the sentence PIC-59 is
   reconciled *to*. Either way the row and PIC-59 agree afterwards.
4. **The walk's doc-comment** (`src/runtime/subagent-envelope.ts:334–349`) —
   both the cap-is-costless clause and the scoped gap statement describe HEAD.
   They move with the route, and a route that closes the gap deletes the second
   paragraph rather than leaving a resolved gap described as open.

### (g) Ordering

Nothing blocks this report and it blocks nothing.
[0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
(0.105.0)** and owns every byte a route here would move in
`src/runtime/subagent-envelope.ts` and
`src/extension/production-theta-producer.ts`; a route rebases onto its hunks and
re-runs its two witnesses.
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) is
**fixed (0.102.0)** and owns `inferCalleeReturnAnnotation` and the
derivation-floor cells; no route here moves them.

## Non-goals

- **Widening `inferCalleeReturnAnnotation`.** Naming a type for a `let`-bound,
  conditional or `return`-carrying tail would give this boundary a schema and
  close the gap as a side effect. It is refused on the floor's own recorded
  grounds (`src/parser/functions.ts:485–488`: "naming a WIDER type than the
  callee actually returns would refuse a conforming return") and because
  computing FN-3's least upper bound needs the type layer's environment a
  runtime call site does not hold (`:468–470`). 0172's residual 1 owns that
  question and its control cells
  (`tests/inbound-boundary-theta-callable.test.ts:330–334`, `:341–345`) pin the
  floor in both directions.
- **0180's within-cap refusal.** Landed at 0.105.0 and correct: row B refuses
  by name with an RFC-6901 position. Its mechanism, message, pointer rendering,
  registered code and `cause: "return_validation"` reuse are settled and are not
  reopened.
- **`-0` at the envelope.** `0 * -1` crosses as `+0` because `-0` is finite and
  `JSON.stringify` renders it `0`; that is a separate JSON hole, pinned as a
  non-goal by 0180's `CONTROL (FENCE-NEGATIVE-ZERO)` cell and filed
  concurrently as
  [0188](./0188-negative-zero-loses-sign-across-subagent-envelope.md). No route
  here widens the non-finite detection into sign preservation.
- **What `/` and `%` produce.** `docs/spec_topics/expressions.md:232` fixes
  that division and modulo by zero yield IEEE-754 `Infinity` / `-Infinity` /
  `NaN` without panicking, and `code-registry-runtime.md:44` records the
  exclusion from the panic catalogue as deliberate (0180's own text cites `:43`
  for that sentence; it sits at `:44` at HEAD). No route adds a panic, a
  diagnostic at the operator, or a static-type change.
- **The value of `MAX_JSON_DEPTH`.** `schema-subset.md:13` states 5 as "a
  conservative ceiling theta fixes for itself". Whether 5 is the right number is
  a ceiling-set question under GOV-15's carve-out, not this report's; every
  route here works at whatever the cap is.
- **The untyped `invoke(...)` discard.** `invocation.md:28` fixes that the
  untyped form returns `Result<null, QueryError>` and discards the callee's
  value; [0068](./0068-prompt-callee-invoke-final-value-null.md) settled the
  design as wontfix. No caller binds the fabrication on that arm. It appears
  above only because it shares the `returnSite === null` path, which is a
  placement constraint on §Fix (a), not a surface to change.
- **The prompt→prompt attach leg.** It does not serialise, so no value is
  substituted there; PIC-59's corrected `Ok`-values bullet (`:110`) already
  states that residual mode-variance normatively and 0180 fixed it as the
  intended end state. No route here revisits it.
- **The wording of the canonical depth message.**
  `JSON document depth exceeds 5` and `schema_keyword: "maxDepth"` are pinned at
  `schema-subset.md:49` and reused verbatim by every ceiling-#4 site. A route
  adding a site reuses them.
- **Bug-document prose elsewhere.** 0180's `## Fix (0.105.0)` residual 2 and
  `.pi/tmp/fixes/0180-report.md` describe this gap as unfiled. They are correct
  as records of that run; this report does not edit them.

## Provenance

Filed as residual **item 2** of the bug 0180 fix (0.105.0, commit `bf32ad03`),
recorded in that run's report (`.pi/tmp/fixes/0180-report.md` §*Residuals /
notes* item 3 — "A return boundary that runs no depth check has no backstop past
the depth cap … **No committed regression witness covers this combined
parent+child path.** **Not filed.**") and in that document's `## Fix (0.105.0)`
§*Residuals* item 2 (`:1289–1305`). It was measured during that fix's review
round 2, by `bug-fix-reviewer-fast`, with a real spawned child.

**Re-measured at HEAD `bf32ad03` for this filing, not copied.** The residual's
one headline row reproduces byte-identically: a `tools:` callee whose tail is
`[[[[[[1 / 0]]]]]]` settles `{"ok":true,"value":[[[[[[null]]]]]]}` with
`diagnostics: []` (§Reproduction (b), row A). Five things the residual does not
establish, measured here:

- **The cap is the discriminator, exactly.** The residual gives one depth. Rows
  B (level 5, refuses by name), B2 (level 6, fabricates) and A (level 7,
  fabricates) bracket the threshold at `MAX_JSON_DEPTH` from both sides, so the
  behaviour is not "deep payloads are different" but "the fifth level is the
  last one inspected".
- **The depth half is independent of the value class.** The residual states the
  gap only for a non-finite `number`. Row C measures a `>cap` payload carrying
  only finite numbers crossing the same boundary unrefused, which no
  non-finite-search change can close.
- **The boundary is not the cause; the derivation is.** Row E drives the same
  `tools:` boundary with a callee whose tail is a schema constructor
  (`W { a: [[[[[1]]]]] }`) and gets `JSON document depth exceeds 5`. Row D
  drives the same payload at a typed `invoke<number>` site and gets the same
  refusal. So the verdict is decided by `inferCalleeReturnAnnotation`, not by
  the call form.
- **PIC-59's new normative bullet is false for this class.** The residual points
  at the registry *Trigger* and the doc-comment as the places the gap is
  "stated, not hidden". It does not observe that `subagent.md:114` — added by the
  same commit — states the refusal as covering a payload "anywhere within it",
  nor that `:110` restates it unqualified. Both are falsified by rows A and B2,
  and both disagree with the registry row that bounds the same rule.
- **The corpus is entirely on the unenforced side of the split.** All five
  committed `tools:`-declared `.theta`-callable call sites resolve to callees
  whose tail is a bare `let`-bound identifier and whose bodies carry no
  `return`, so `inferCalleeReturnAnnotation` answers `null` for 5 of 5 (§Affected).
  The residual does not census this.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted; `git status --short` verified afterwards, and a case-insensitive
`scratch` sweep over `tests/` reported). It drove six root thetas as real
spawned `pi` children through `launchSubagentChild` +
`createProductionSpawnFn()` + `driveSubagentChild`, each spawning one
grandchild, with all three AGENTS.md `#subagent-child-pins` set as loud
preconditions and the harness shape mirroring
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` (new at 0.105.0). Zero
model turns and no provider contacted — every fixture body is a `let` chain
ending in a pure tail expression, and the marshalled `--provider`/`--model`
reference only satisfies the launch argv shape. Wall time 12.6 s for all six
drives; every child exited `0` with `signal: null` and the parent-side
diagnostic drain was `[]` on all six.

**Read from source rather than driven, and marked as such in the text.** Two
positions: the child-side branch selection at
`production-theta-producer.ts:2253–2261` (the probe observes the envelope's
effect at the caller, not the branch taken), and `#validateInvokeReturn`'s early
return at `:3627` (the probe observes that no depth refusal occurs, which is that
return's consequence and is corroborated by rows D and E taking the other path).
Both positions were read at HEAD.

Every `src/`, `tests/`, spec and reference citation above was read at HEAD
`bf32ad03` with `git show HEAD:<path>`; volatile positions in
`src/extension/production-theta-producer.ts` (6350 lines) are named by symbol
beside their line numbers, per
[0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.
