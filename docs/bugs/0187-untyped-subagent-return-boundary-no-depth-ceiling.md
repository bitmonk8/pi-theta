# Bug 0187 — PIC-59's fail-closed rule (`subagent.md:114`) says a terminal `Ok` payload carrying a non-finite `number` "anywhere within it MUST refuse", and the shipped check stops at `MAX_JSON_DEPTH`: on a `tools:`-declared `.theta`-callable return — the one return boundary that runs no depth walk, because `#validateInvokeReturn` returns at `:3627` before `enforceInvokeReturnDepth` when `inferCalleeReturnAnnotation` names no type — a callee whose tail is `[[[[[[1 / 0]]]]]]` settles `{"ok":true,"value":[[[[[[null]]]]]]}` with `diagnostics: []`, so the caller binds a fabricated `null` at level 7 where the same value at level 5 refuses, and a `>cap` FINITE payload crosses that boundary unchecked too

- **Status:** fixed (0.116.0). §Fix (0.116.0) below records what shipped:
  route (b), parent-adjudicated before the run. §Fix *as filed* was
  constraint-pinned rather than settled — four candidates sat
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

## Fix (0.116.0)

**Route: §Fix (b) — refuse child-side at the envelope writer.** §Fix was
constraint-pinned across four candidates and the run did not select among them:
the route was **adjudicated by the parent on the record before the run started**,
and that adjudication is reproduced here as the route authority.

> **ROUTE (b)** — run the existing bounded fast-failing depth walk over the
> terminal `Ok` payload in `driveSubagentRootRegime` BEFORE `serializeOkEnvelope`
> and BEFORE the non-finite search (CIO-3's first-sub-check discipline), mapping a
> breach to a fail-closed `err` envelope beside `mapNonRepresentableReturnValue`.
> Grounds: (i) only (b) makes PIC-59's `:110` AND `:114` true for **every**
> consumer — under (a) the child still EMITS the fabricated `ok` arm (the parent
> masks it for `invoke` callers only) and the top-level `/name` leg keeps
> fabricating; (ii) (b) makes the non-finite search's cap genuinely costless
> (past the cap nothing crosses at all — the doc's own framing); (iii) (b) needs
> no unbounded recursion (the walk fast-fails — CIO-3 satisfied); (iv) (c) is
> foreclosed by 0180's recorded prohibition and closes only half; (d) alone
> leaves the S1 fabrication live; (a) is strictly weaker per (i) and additionally
> carries the five-site co-edit question. Under (b) `#validateInvokeReturn`,
> `#resolveReturnSite` and `inferCalleeReturnAnnotation` are all BYTE-UNTOUCHED.

**Premise verification (the adjudication's stop valve, discharged before Phase 1).**
Every stated ground was measured at HEAD `153eec85`, not assumed. §Reproduction
(b)'s six rows were re-derived with one scratch probe over real spawned children
(written, run, deleted) and reproduce **byte-identically** to the doc's
`bf32ad03` measurement: row A `{"ok":true,"value":[[[[[[null]]]]]]}` diagnostics
`[]`, row B `subagent return value is not JSON-representable at /0/0/0/0:
Infinity`, row B2 `[[[[[null]]]]]`, row C `[[[[[[1]]]]]]`, rows D and E
`JSON document depth exceeds 5`; every child exited `0` / `signal: null` and the
parent drain was `[]` on all six. Route (b) was then prototyped and the FULL
default suite run against it: **318 files / 5441 tests green, zero reds** — (b)
flips nothing in the committed suite, so `CONTROL (FENCE-DEPTH)`'s four
assertions were measured to survive unchanged and the re-pin is comment-only. The
prototype was reverted blob-hash-verified (`2d4e849a…`, `151950f1…`) before Phase 1.
No stated ground was falsified.

**Corpus census, re-run at this HEAD.** 34 committed `.theta` / `.thetalib`;
`git diff --stat bf32ad03 HEAD -- '*.theta' '*.thetalib'` is empty, so the
0-of-34 divide/modulo and zero-nested-array-literal counts hold unchanged. Vehicle
sweep over all 365 committed test files: the only `[[[[` occurrences are the two
depth-fixture **comments** (`tests/production-live-resolvers.test.ts:348`,
`tests/tool-arg-runtime-schema-validation.test.ts:472`), neither a vehicle; no
`DEPTH_6`-bearing test drives a subagent return envelope. H9a fixture census: 2 of
11 are `mode: subagent` and none nests an array literal. The zero-red prototype
run is the mechanical corroboration.

- **What shipped:**
  - `src/runtime/subagent-envelope.ts` — `mapTooDeepReturnValue(value, calleePath)`,
    returning `InvokeInfraError | undefined`, placed before
    `mapNonRepresentableReturnValue`; backed by the module-private bounded
    fast-failing walk `wireFormExceedsDepthCap`. The `(f)(4)` doc-comment
    correction: the cap-is-costless clause is now unconditional and the scoped-gap
    paragraph is **deleted**. Module header's fail-closed inventory four → five,
    explicit that the fifth carries no diagnostic; `EnvelopeOk` and
    `serializeOkEnvelope` doc-comments now say representability **and** depth are
    established before the envelope is written.
  - `src/extension/production-theta-producer.ts` — the call site:
    `driveSubagentRootRegime`'s `terminal.ok` arm runs the depth refusal FIRST,
    then 0180's non-representability search, then `serializeOkEnvelope`.
    `#validateInvokeReturn`, `#resolveReturnSite` and the ceiling-#4 gate are
    byte-untouched; the file's only two executable hunks are the import and that arm.
  - `docs/spec_topics/pi-integration-contract/subagent.md` — the (f)(1) and (f)(2)
    corrections plus PIC-59's new **Fail-closed over-deep `Ok` payload**
    requirement bullet and the anchored *Result-carriage bound*
    (`#subagent-envelope-result-carriage-bound`).
  - `docs/spec_topics/diagnostics/code-registry-runtime.md` — the (f)(3) *Trigger*
    rewrite. No row added, removed or renamed; no header arithmetic moved.
  - `docs/spec_topics/errors-and-results/queryerror-variants.md` — the
    `"return_validation"` gloss's third member. **No enum member added or moved.**
  - `tests/subagent-return-depth-refusal.test.ts` — the witness, 13 cells.
  - `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` — **comment-only**: the
    `CONTROL (FENCE-DEPTH)` re-pin and citation corrections. All 27 assertions
    byte-identical (`git diff | grep '^[+-]' | grep 'expect('` → 0 lines).
  - cell 53 of `tests/live/live-production-acceptance.test.ts` — the live witness.

- **Code-identity adjudication (in-run, §Fix (b) bullet 3): the canonical depth
  message under the existing cause, with NO registered code.** The refusal carries
  ceiling #4's pinned `JSON document depth exceeds 5` (`schema-subset.md:49`, via
  `DEPTH_VIOLATION_MESSAGE`, imported not restated) on the existing
  `cause: "return_validation"`, and emits no diagnostic. Grounds: (1) **zero**
  registry rows exist for a ceiling-#4 depth breach at any of its five enforcement
  points — the only row that mentions the cap is
  `theta/runtime/subagent-return-value-not-representable`, and only to bound its
  own reach; a code here would make this the sole depth breach in the language
  carrying one, an asymmetry an operator would read as "different in kind", which
  it is not. (2) PIC-59 already ships a **child-side** fail-closed envelope class
  that mints no code — *Marked-root registration refusal* — so "child-side ⇒ needs
  a code" is false as a general claim. (3) A registry row whose *Message* duplicated
  a pinned canonical string would create the second-shipped-record-of-one-string
  defect this report exists to close. (4) `return_validation` already exists in
  `InvokeInfraCause` and is already the ceiling-#4 `invoke<T>`-return row's cause,
  so no spec-versioned enum change arises, and GOV-15's diagnostic-registry
  carve-out is not needed. Operator reach is unimpaired: the `Err` reaches an
  `invoke` parent unwrapped and a slash surface as an SLSH-3 note.
  **Honesty analysis for the widening option, which was REFUSED.** Widening
  `theta/runtime/subagent-return-value-not-representable`'s *Trigger* to cover this
  class would **misdescribe** it: row C is a FINITE `>cap` payload, which *is*
  JSON-representable, so the row's name, its Trigger sentence and its `<value>`
  placeholder — which has no offending value to render for a depth breach — would
  each be false of the input. The dishonesty is not incidental to the wording; it
  is the row's identity. Minting a distinct code was likewise refused, per (1)–(3).

- **The `Result`-carriage bound — the in-run discovery, and why it is a stated
  bound rather than a widening.** Review round 2 measured that neither
  envelope-writer walk descends a `Result`: `[Ok([[[[[1]]]]]), 1]` serialises to
  `[{"ok":true,"value":[[[[[1]]]]]},1]`, wire depth **8**, and is not refused;
  `[Ok(1 / 0), 1]` writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}`
  — a fabricated `null`. Both parse with `[]` diagnostics. The **non-finite half
  is pre-existing at HEAD** in 0180's `firstNonFiniteNumber`, which this fix leaves
  byte-untouched; this fix neither creates nor worsens it, and the depth half
  inherits the same disposition by design. Widening either walk was **refused** on
  three grounds: §Non-goals reserves 0180's mechanism ("settled and are not
  reopened"); 0180 §Non-goals fixes that a route finding a second hole in the same
  class "records it rather than widening" (the `-0` precedent, discharged with a
  fence plus a residual and later filed as 0188); and
  `src/runtime/wire-translation.ts:654`'s own `isResultValue` arm — the shipped
  statement that a `Result` is not a lowerable type form and does not cross the
  wire by specification (`schema-subset.md` §Lowering Algorithm step 3, rejecting
  one at parse time as `theta/parse/result-in-schema-position`) — is the ground
  both walks rest on, and that file is byte-frozen by §Fix (e)(7). The authorised
  remedy is §Expected behaviour's own first bullet — "a normative MUST is true, or
  it is qualified" — so the bound is stated normatively in PIC-59, deferred to by
  the registry *Trigger*, stated in both walks' doc-comments and at the call site,
  and pinned in both directions by `CONTROL (FENCE-NESTED-RESULT)` so a later
  widening cannot happen silently.

- **A second in-run discovery: the wire form, not the carrier.** Review round 1
  measured that running the shipped `depthWalk` over the *interpreter's* value
  refuses payloads whose JSON document is within the cap:
  `Object.keys(new String("red"))` is `["0","1","2"]`, so `depthWalk` counts an
  enum carrier's character indices as children, and clean source
  `enum Colour { Red = "red" }` + tail `[[[[Colour.Red]]]]` — wire form
  `[[[["red"]]]]`, document depth **5** — was newly refused with a message false of
  it, prescribed by no requirement. The seam's verdict is therefore computed over
  the payload's **wire form** by a module-private bounded walk mirroring
  `firstNonFiniteNumber`'s already-reviewed carrier arms, so this module's two
  walks answer the carrier question the same way. `src/runtime/depth-walk.ts` is
  byte-untouched: adding the arm there would move all five AJV enforcement points,
  four of which are handed already-parsed JSON where a boxed `String` cannot occur.

- **(f) same-commit corrections, all four discharged, plus the new bullet.**
  1. **PIC-59's fail-closed non-representable bullet** — "anywhere within it" was
     measured false at levels 6 and 7. It now states what holds and by which
     mechanism at which site: within the cap the named non-representability
     refusal; past it the new depth requirement refuses the whole payload before
     the search is reached — under the *Result-carriage bound*.
  2. **PIC-59's `Ok`-values bullet** — the same unqualified claim, moved with it.
  3. **The registry *Trigger*** — the "A return boundary that runs no depth check
     has no such backstop … crosses it unrefused" clause is **false under (b)** and
     is rewritten: nothing past the cap *as the envelope writer's walk measures it*
     crosses there, and that measurement carries PIC-59's bound by reference, so
     the two records of the rule agree. Verified that
     `docs/reference/diagnostics.md`'s mirror carries only Code / Sev / Phase /
     Message and therefore does not move (byte-identical, `4ef71d91…`).
  4. **The walk's doc-comment** — the cap-is-costless clause is unconditional and
     the scoped-gap paragraph is **deleted**, not softened: a resolved gap is not
     described as open.
  - **New PIC-59 requirement bullet** — *Fail-closed over-deep `Ok` payload*, in
    the voice of its siblings, stating the carrier, the no-code grounds, the
    FIRST-sub-check ordering, the subagent-leg confinement, the `invoke`-parent and
    SLSH-3 destinations, and that the envelope writer is not an AJV boundary so
    ceiling #4's five-site table is unchanged.
  - **The five-site co-edit obligation is NOT engaged.**
    `ceiling-invariants-and-audit.md:47` keys it to rows of the per-boundary table,
    which "is the canonical enumeration of the **AJV** enforcement points"; the
    envelope writer validates nothing and compiles no schema. CIO-3's enumeration,
    PIC-1's mask-domain table, `docs/reference/hard-ceilings.md` and
    `docs/reference/schema-subset.md` are all byte-identical.

- **(e) constraints, each discharged.** (1) 0180's two witnesses are green and
  semantically unweakened — the 27-cell file's diff is comment-only with every
  assertion byte-identical, and `CONTROL (FENCE-NEGATIVE-ZERO)` (0188's) is
  untouched. (2) GOV-15 — the enumeration and the carve-out adjudication are below.
  (3) No unbounded recursion: both envelope-writer walks fast-fail the moment a
  node's level would exceed the cap. (4) `FENCE-DEPTH` — see below. (5) The
  ceiling-#4 walk is still the first sub-check at the typed boundary and nothing
  was reordered (`tests/invoke-ceiling-depth.test.ts` 5/5). (6) The derivation is
  not widened: `src/parser/functions.ts` is byte-identical (`ba7fec82…`) and
  0172's derivation-floor cells are green and untouched. (7)
  `src/runtime/wire-translation.ts` is byte-identical (`8196c2d9…`),
  `#validateInvokeReturn` is untouched, and 0174's two witnesses are green (16/16
  and 1/1). (8) The witness is integration-tier over real spawned children through
  `createProductionSpawnFn` with all three `#subagent-child-pins` as loud
  preconditions, re-driving all six rows plus six enumeration rows; every new
  assertion is proved both directions.

- **(e)(4) `FENCE-DEPTH` re-pinned under this report's authority — comment-only,
  zero assertion changes, measured.** All four of the cell's assertions stay TRUE
  under route (b) and were measured green against the prototype before Phase 1:
  `MAX_JSON_DEPTH` is 5; a level-7 `Infinity` is still "not this walk's to find"
  (the non-finite search's bound does not move); `enforceInvokeReturnDepth` still
  refuses that payload; a level-4 `Infinity` is still within the cap so ceiling #4
  defers. What changed is the cell's **reason**, and the comment is re-derived to
  say it: the cell fences the search's own BOUND rather than a GAP, because a
  `>cap` payload no longer reaches that search at all — `mapTooDeepReturnValue`
  refuses it one sub-check earlier — so the clause "nothing reaches the parent
  carrying a substituted null" now holds **unconditionally** instead of only where
  `enforceInvokeReturnDepth` itself runs. Bug 0187 is named in the cell as the
  re-pin authority. No additive cells were placed in that protected file; the
  within-cap control, the `>cap` refusal and the exact cap boundary §Fix (e)(4)
  contemplates live in this report's own witness instead, so the 27 protected cells
  receive prose and nothing else.

- **(e)(2) GOV-15 — the flips, enumerated exactly. The parent's pre-run
  enumeration was INCOMPLETE and pre-measurement plus review grew it; the complete
  set is below.** Every flip is on the **subagent leg only**, and every one is
  entailed by the adjudicated route: the child writes the envelope one process away
  from the caller and cannot see the caller's call form, so no implementation of
  (b) avoids them.
  - **(i)** the uninferred `tools:`-declared `.theta`-callable boundary, `>cap`
    payload, finite or non-finite-carrying: `Ok` → `Err`. Rows A, B2, C —
    `[[[[[[null]]]]]]`, `[[[[[null]]]]]`, `[[[[[[1]]]]]]` become
    `Err … JSON document depth exceeds 5`. **The deliberate S1-arm removal.**
    Observable (a).
  - **(ii)** the typed `invoke<T>` boundary, `>cap`: already `Err` both sides and
    the **message and cause are byte-identical** (row D: `JSON document depth
    exceeds 5` / `return_validation` either side), so observable (a) is unchanged
    there in message class — **but `callee_path` flips**, from the caller's literal
    `"./deepfin.theta"` to the child's resolved absolute path (row D2, measured
    both sides). This is not a new asymmetry: 0180's child-side refusal already
    spells `callee_path` that way at HEAD (row B3 measures it), so route (b)'s
    carrier property is merely extended to the depth class.
  - **(iii)** a slash-dispatch boundary whose terminal is the propagated `Err` —
    including a top-level `/name` of a `mode: subagent` theta: silent success → one
    SLSH-3 `theta-system-note`. Observable **(c)**. This is the flip the live cell
    measures (absence → presence).
  - **(iv)** **UNTYPED `invoke("./sub.theta")`** of a subagent-mode callee
    returning `>cap`: `Ok(null)` → `Err` (row F, measured `"OK-DISCARD"` → the
    depth message). At HEAD the untyped form's `Ok(null)` is the *specified
    discard* (`invocation.md:28`; 0068 settled the design as wontfix), so that
    input was not corrupt and it newly refuses. **Structurally entailed** — the
    child cannot see the call form, so no implementation of (b) can exempt this
    arm. `invoke_infra` is passed through unwrapped, so the caller observes the
    refusal directly. Observable (a). This is 0180 flip (iv)'s precedent repeated
    for the depth class; the registry/spec carve-out statement is that no
    registered code and no spec surface changes for it — `invocation.md` is
    byte-untouched and 0068 is not reopened.
  - **(v)** grandchild chains refuse at **each child's own envelope** and propagate
    (row H, measured `"OK"` → the depth message): an intermediate uninferred hop
    does not launder a `>cap` payload.
  - **(vi)** prompt-mode legs: **ZERO flips**. Rows I (untyped `invoke` of a
    prompt-mode callee: `"OK-DISCARD"` both sides) and J (typed `invoke<number>`:
    the parent-side walk's message, unchanged both sides) carry the evidence. Note
    the `tools:` boundary carries none of it: a `tools:` entry naming a prompt-mode
    callee is refused at load by `theta/load/prompt-mode-callable`.
  - **(vii)** the overlap class — a payload BOTH `>cap` AND carrying a within-cap
    non-finite `number` — changes its `Err` **message class** from 0180's
    `subagent return value is not JSON-representable at …` to `JSON document depth
    exceeds 5`, and **0180's registered code is no longer emitted for those
    inputs**, because the depth refusal pre-empts the search. Already `Err` either
    side; observables (a)-message and (b). This is the mirror of 0180's own
    (e)(7)(vii). It is licensed as the same-commit (f)(3) *Trigger* rewrite under
    DIAG-2's trigger-change disposition — a removal for the inputs taken out of the
    code's emission set — and is witnessed by `RED (ORDER-BOTH)`.
  - **(viii)** the enum-carrier class, which route (b) must **not** flip and does
    not: a payload whose enum carrier sits at level 5 (wire depth 5) still crosses.
    Fenced by `CONTROL (SEAM-ENUM-CARRIER)`, `CONTROL (ORDER-ENUM-CARRIER)` and
    integration row K.
  - **No payload within the cap changes anywhere**, and no `Result`-carried depth
    changes (the stated bound). The zero-red full-suite prototype run is the
    corpus-level evidence.

- **(e)(2) Ceiling-set carve-out adjudication (`source-language-stability.md:13`),
  decided on the record.** **This release performs NO ceiling-set change, so the
  carve-out is neither triggered nor borrowed.** Grounds: the carve-out is
  expressly "keyed to ceiling-set changes only", and the four-item ceiling list,
  ceiling #4's owner pages, the CIO ordering and the five-site AJV table are all
  byte-identical; the "never having been ceilinged on the other side" phrase — which
  reads onto rows A and C — sits *inside* the in-scope predicate that scopes a
  ceiling-set-change release's diff, and with no such change there is nothing for it
  to scope. The alternative reading — that adding a check at the envelope writer
  *broadens ceiling #4's enforcement-point surface* — is **rejected on the record**,
  because §Operational definitions classifies "broaden the enforcement-point
  surface" as a ***Tighten***, and "Until that suite ships, *Tighten* is forbidden
  under theta 1.x", with the same paragraph stating that *Tighten*-affected inputs
  remain bound by the equivalence promise "without any *Tighten*-specific
  carve-out". Taking that reading would indict the settled route itself. The
  defensible framing is the one shipped: the envelope writer validates nothing and
  compiles no schema, so it is not one of ceiling #4's enforcement points and no
  ceiling-set verb applies; what lands is a **new PIC-59 fail-closed class** beside
  parse-failure, skew, exit-without-envelope, non-representability and marked-root
  refusal, reusing the canonical message because `schema-subset.md:49` fixes it for
  every depth breach. What licenses the flips instead: GOV-15 is a release-process
  goal, not a verifiable obligation, and the flips are recorded as a **deliberate
  departure toward specified behaviour** — INV-5's "never a fabricated `Ok`"
  (`invocation.md:36`) and PIC-59's own fail-closed inventory — under the
  0172-face-1 / 0180 precedent: *recorded, not blessed*. Because no code is added,
  no diagnostic-registry carve-out covers the `Ok`→`Err` flips either (it covers
  only (vii)'s trigger change), so this record's honesty rests entirely on the
  enumeration above being complete.

- **Gates** (each re-run by the orchestrator, not taken on a worker's word):
  - Witness, red-before: `tests/subagent-return-depth-refusal.test.ts`
    `Tests 8 failed | 2 passed (10)` at Phase 1, the integration reds quoting the
    HEAD column verbatim — `(A) settled {"ok":true,"value":[[[[[[null]]]]]]}`,
    `(B2) [[[[[null]]]]]`, `(C) [[[[[[1]]]]]]`, `(D2) "./deepfin.theta"`,
    `(F) "OK-DISCARD"`, `(H) "OK"` — and the ORDER reds quoting the `ok` arm
    `{"theta_result":{"v":1,"ok":[[[[[[1]]]]]]}}`.
  - Witness, green-after: `Test Files 1 passed (1)` / `Tests 13 passed (13)`.
  - Full default suite: `Test Files 318 passed (318)` / `Tests 5453 passed (5453)`
    (baseline at dispatch 317 / 5440; the witness adds 1 file / 13 tests).
  - `npm run typecheck` clean; `npm run lint` clean.
  - Live, run for real:
    `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "bug 0187"`
    → `Tests 1 passed | 52 skipped (53)`, 1.2 s wall, zero model turns.
  - H9a, run for real:
    `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/`
    → `Test Files 2 passed (2)` / `Tests 11 passed (11)`.

- **Review:** 3 rounds, plus one pre-review correction round and one prose polish.
  - *Pre-review correction round* (not a review round; round numbering unaffected)
    — the implementation shifted `src/runtime/subagent-envelope.ts` by ~49 lines
    and `subagent.md` by one, staling citations **inside the two test files this
    same commit touches**. Corrected, citation/comment-only, seven hunks, every
    hunk classified, every new number re-derived by `grep -n`; `src/` and `docs/`
    byte-identical across the round; gates re-run green. Bug 0134's do-not-chase
    class was deliberately NOT chased.
  - *Round 1* (`bug-fix-reviewer`) — **DEFECTS FOUND (1 blocker, 2 should-fix,
    3 nits)**: the depth verdict was computed over the interpreter's carrier
    representation, so an enum carrier at level 5 was falsely refused
    (correctness/spec — remedied by the wire-form walk); a redundant
    `as unknown as QueryError` cast (house-rule); the GOV-15 enumeration additions
    (fidelity, orchestrator-owned); a `schema_keyword` over-claim, two
    wider-than-scope sentences, and a bare cleanup `catch {}` ruled acceptable by
    the 0180-harness precedent. Round 1 also produced the ceiling-set carve-out
    adjudication recorded above.
  - *Round 2* (`bug-fix-reviewer-fast`) — **DEFECTS FOUND (1 blocker)** and
    `recommend-deep-review`: the `Result`-carriage under-count, measured against the
    real production writer. Remedied by qualification, doc-comments and a fence, per
    the adjudication above; the code was not widened.
  - *Round 3* (`bug-fix-reviewer`, deep) — **DEFECTS FOUND (1 blocker, spec)**: the
    (f)(3) *Trigger* rewrite still claimed a totality PIC-59 had by then qualified
    away, so the two records did not agree — the fix's own obligation. Remedied by
    one sentence deferring to the anchored bound, plus the call-site comment. That
    fixer round was **prose-only** — a comment-stripped projection of
    `src/extension/production-theta-producer.ts` is identical across it — so per the
    post-polish rule the confirmation review round was skipped: polish verified by
    gate-diff (`git diff -U0` shows only the round-1 executable hunks) and by the
    orchestrator reading the corrected sentence against the measurement.
    Round 3 also swept for a third walk/wire-form divergence and found none
    reachable.

- **Verification** (`bug-fix-verifier`): **SOLID**, all four obligations
  discharged with quoted evidence.
  1. *The witness genuinely witnesses the bug* — three independent neutralisations,
     each restored and proved byte-exact by `git hash-object`
     (`7d8f77bf…`, `ac62d54f…`), with no `git stash` at any point: **N1** bypass the
     call site → 3 failed / 10 passed, the integration rows reporting the ORIGINAL
     fabrication signature byte-identically; **N2** `mapTooDeepReturnValue` always
     `undefined` → 9 failed / 4 passed, the four survivors being exactly the
     "admitted" control fences; **N3** carrier-blind walk → **exactly** the three
     carrier fences red and every other row green, which proves the cells
     discriminate rather than pass together. Under N1 and N2,
     `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` stayed **27/27** — it
     never exercises this path, which is why the gap existed.
  2. *Full default suite green* — 318 / 5453.
  3. *A live test exercises the fixed path, run for real* — no pre-existing live
     cell did (verified across all of `tests/live/**`: no match for the cap, the
     message, or this boundary), so cell 53 was added **additively** (158
     insertions, 0 deletions): a `mode: prompt` parent whose sole statement is
     `b187livekid()?` through a `tools:`-declared **uninferred** boundary, and a
     `mode: subagent` kid whose pure tail is `[[[[[[1]]]]]]` — finite and depth 7,
     so the cell isolates the DEPTH half. Driven through a REAL spawned RFC-0006
     child on the harness's three `#subagent-child-pins`, asserting on the
     `theta-system-note` channel read off the settled `SessionManager` plus empty
     `userTexts` for the zero-turn claim. Both directions proved: under N1 the cell
     reds `systemNotes: []: expected [] to have a length of 1` — the defect itself;
     restored → green.
  4. *Lint and typecheck* clean.
  One H9a cell (`(g) imports / invoke across thetas`) hit the documented ~180 s
  stall class on the first run; `docs/bugs/` carries no open report with a matching
  signature; isolated re-run passed in 3.5 s and the full directory then passed
  11/11.

- **permitted-codes decision, taken on the REAL run and not on assumption:**
  `tests/fixtures/h7a/permitted-codes.json` is **NOT** appended. Evidence, three
  independent strands: the real H9a run passed 11/11 with the empty-capture stderr
  gate live and every `permittedCodesSubset` cell's `outside` set empty, so nothing
  outside the committed allowlist was emitted; this fix registers **no** code at all,
  so there is nothing to append (`mapTooDeepReturnValue` returns a bare
  `InvokeInfraError` with no `diagnostic` member); and the H9a fixture census finds
  no `mode: subagent` callee returning a nested payload of any depth.

- **Residuals:**
  1. **A `Result` nested inside a compound `Ok` payload is not descended by either
     envelope-writer walk**, so a payload whose wire depth is contributed only from
     inside the carrier crosses unrefused. Measured: `[Ok([[[[[1]]]]]), 1]` →
     `[{"ok":true,"value":[[[[[1]]]]]},1]`, `jsonDepth` **8**, admitted; a `Result`
     at a position that already exceeds the cap **is** still refused. The
     **non-finite half is pre-existing at HEAD** in 0180's `firstNonFiniteNumber`:
     `[Ok(1 / 0), 1]` writes `{"theta_result":{"v":1,"ok":[{"ok":true,"value":null},1]}}`
     with an empty drain — 0180's own S1 fabrication class, alive through this
     vector, neither created nor worsened here. Both sources parse with `[]`
     diagnostics. Widening was refused on 0180's settled-mechanism grounds; the bound
     is stated normatively (PIC-59's *Result-carriage bound*), deferred to by the
     registry *Trigger*, stated in both walks' doc-comments, and pinned in both
     directions by `CONTROL (FENCE-NESTED-RESULT)`. **Not filed** (a fix run creates
     no bug docs).
     **Discharged at 0.118.0** by
     [0201](./0201-result-carried-payloads-skip-envelope-walks.md), which was filed
     against this residual and shipped its route (a): both walks now descend a
     `Result`'s wire form through one shared classifier, counting the carrier as one
     level, so both halves refuse — the depth half with ceiling #4's canonical
     message and the non-finite half with 0180's registered code and a wire-form
     RFC-6901 pointer. `CONTROL (FENCE-NESTED-RESULT)` was re-pinned in place under
     0201's authority, as §Fix (d)(2) of that report provides.
  2. **`cause: "return_validation"` now carries three semantically distinct
     failures** — a parent-side AJV mismatch, 0180's child-side non-representability
     refusal, and this child-side depth refusal. The third carries **no** registered
     code, so `.message` is its sole discriminator; the gloss at
     `queryerror-variants.md` states all three. This extends 0180's own residual 3.
  3. **`docs/reference/errors-and-results.md:295`'s `return_validation` gloss still
     reads "typed invoke: return value failed AJV validation"** — narrower than the
     spec-topic gloss has been since 0.105.0. That reference page was not touched by
     0180 either; it is bug 0134's do-not-chase class and 0180's scope decision, not
     this fix's. **Not filed.**
  4. **Three pre-existing stale citations were deliberately not chased**:
     `tests/invoke-prompt-cell-enum-return.test.ts:15` and
     `tests/invoke-return-enum-carrier-projection.test.ts:850` cite
     `src/runtime/subagent-envelope.ts:94`/`:149`, already stale before this commit
     (bug 0174's files); and every `production-theta-producer.ts:NNNN` citation in
     `docs/bugs/*.md` is 0134's named class. Byte-identity verified for both test
     files.

- **Discharge notes appended:**
  `0180-invoke-return-nonfinite-number-mode-variance.md` — its `## Fix (0.105.0)`
  §*Residuals* item 2, and item 3 of `.pi/tmp/fixes/0180-report.md` §*Residuals /
  notes*, are discharged by this fix. Its two **stated-not-hidden** records of the
  gap — the registry row's *Trigger* and the walk's doc-comment — are exactly the
  two this commit corrected.

- **Pinned dispositions / non-goals:** routes (a), (c) and (d) are **not** taken and
  are not reopened by this record — (a) is strictly weaker (the child still emits the
  fabricated `ok` arm and the top-level leg keeps fabricating) and carries the
  five-site co-edit question; (c) spends 0180's recorded prohibition on unbounded
  recursion to close only half the report; (d) leaves the S1 fabrication live.
  `inferCalleeReturnAnnotation` is **not** widened — 0172's residual 1 owns that
  question and its derivation-floor cells still pin the floor in both directions.
  0180's within-cap refusal — its mechanism, message, RFC-6901 pointer rendering,
  registered code and `cause` reuse — is byte-untouched and not reopened. `-0`
  remains 0188's: `CONTROL (FENCE-NEGATIVE-ZERO)` and the `negOk`/`negVal` rows are
  byte-untouched. `src/runtime/depth-walk.ts` keeps no carrier arm, so ceiling #4's
  five AJV enforcement points are unmoved. The pre-existing sibling of the
  wire-form/carrier divergence at the **parent-side typed** boundary
  (`enforceInvokeReturnDepth` walks the raw theta value at `#validateInvokeReturn`)
  is out of scope by §Fix (e)(7) and is recorded here rather than changed.
  **Discharged at 0.119.0** by
  [0202](./0202-parent-depth-walk-counts-carrier-not-wire-depth.md), filed against
  this disposition and against item 2 of `.pi/tmp/fixes/0187-report.md`
  §*Residuals / notes*: all three of ceiling #4's theta-value enforcement points
  now measure the payload's wire form through a bounded walk
  (`src/runtime/wire-form-depth-walk.ts`) consulting the same shared
  `classifyWireNode` this fix's successor exported, so the two return gates agree
  about one payload and `depth-walk.ts` — still carrier-free, still byte-frozen —
  answers only for the parsed-JSON sites. That report also corrected the sentence
  in `wireFormExceedsDepthCap`'s doc-comment this record shipped: three of the
  five enforcement points are handed interpreter values, not four handed parsed
  JSON. No static
  type, no evaluation semantics, and no parser file moved.
