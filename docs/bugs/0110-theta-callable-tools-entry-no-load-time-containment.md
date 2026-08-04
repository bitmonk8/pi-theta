# Bug 0110 — Nothing on the load path applies the discovery-root containment rule to a `tools:` `.theta` entry: `tool-calls.md` §"Argument shape" says such a path "is rejected with `theta/load/invoke-path-escape` and the callable is not created", yet a caller whose `tools:` entry names a callee planted far outside every active discovery root registers with zero containment diagnostics — and, as an ordering consequence, bug 0071's new `.theta`-callable arity check now emits against that out-of-root callee, un-registering the caller on the wrong rule

- **Status:** open. §Fix is constraint-pinned, not settled: the check's home is
  adjudicated in-run between the invoke static-check compose pass and
  `tools:`-resolution time, and the registry disposition is decided against a
  *Trigger* that already names this surface. No new code is expected. No
  ordering dependency on another open report:
  [0071](./0071-theta-callable-call-arity-unchecked.md) shipped in 0.64.0 and is
  the baseline this report measures.
- **Sev/Diff estimate:** S1/D3 — a containment rule the spec states with a
  `theta/load/` code is unenforced on one of the two surfaces the registry
  *Trigger* names, and the caller registers with no diagnostic; D3 because the
  route is adjudicated in-run and lands on the same compose pass bug 0072 is
  editing.
- **Kind:** defect — a stated load-time rule with a registered code has no
  emitter on one of its two named surfaces. Two elements, one fix.
  1. *No load-time containment check for a `tools:` `.theta` entry.*
     `parseCalleeForTools` (`src/extension/production-composition.ts:1615`)
     resolves the entry with `isAbsolute(spec) ? spec : resolvePath(callerDir,
     spec)` and reads it with `fs.readBytes` — no `realpath`, no active-root
     comparison. `checkInvokePathAtLoad` (`src/runtime/invocation.ts:185`) has
     exactly one call site in `src/`: the `invoke(...)` loop of
     `checkInvokeStaticResolution` (`src/extension/invoke-static-checks.ts`,
     verified by `grep -rn checkInvokePathAtLoad`, four `src/` hits — the
     header comment, the import, that call, and the `invocation.ts` definition).
     No consumer of `activeRoots` sits on the `tools:` resolution path
     (`grep -rn activeRoots src/`: the compose derivation, the producer's
     runtime re-check, the invoke-pass thread-through, and the watcher set).
     The enforcement that exists for this surface is the runtime open-time
     re-check (`#driveCallee` → `#recheckCalleeContainment`,
     `src/extension/production-theta-producer.ts:3106`, `:3260`), which fails
     one call closed at dispatch and does not un-register the caller at load —
     so it does not deliver "the callable is not created".
  2. *The bug 0071 arity check can emit against an out-of-root callee.* The
     arity verdict is correct on its own terms — the callee was read and parsed
     — but it fires for a callable the spec says was never created. Ordering,
     not correctness: a load-time containment check placed before the arity loop
     rejects the entry first. Measured in §Reproduction, cell 4.
- **Related:**
  - [0071](./0071-theta-callable-call-arity-unchecked.md) — **fixed (0.64.0)**,
    the parent and the filing origin. This report is its §Fix (0.64.0)
    *Residuals* items 2 and 3, filed. 0071's §Expected behaviour asserts "The
    path-restriction half of that sentence *is* implemented for `tools:` entries
    (`theta/load/invoke-path-escape`); the arity half is not." 0071's own §Fix
    (0.64.0) *Where this report turned out to be wrong* records that clause as
    false at its fix baseline; this report is the correction, re-measured at the
    fix commit. No route dependency: 0071 implemented arity and left containment
    as found by explicit design, and its fix's `checkInvokeStaticResolution`
    doc comment states the gap in the source.
  - [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **open, being
    fixed concurrently**, the other half of the tool-call static-check story on
    the same compose pass. Disjoint rule: 0072 owns
    `theta/parse/tool-arg-arity` / `-schema-conflict` / `-type-mismatch` and the
    missing code-side runtime AJV net. It must **not** fix containment — a
    containment check is a `theta/load/` rule against the callee *path*, not a
    check against a call's *arguments*, and it must precede 0072's per-argument
    diagnostics for the same reason it must precede 0071's arity check
    (§Fix constraint 1). 0072 and this report will both edit
    `src/extension/invoke-static-checks.ts`; whichever lands second re-derives
    its citations.
  - [0069](./0069-tools-entry-residue-silently-dropped.md) (fixed, 0.62.0),
    [0070](./0070-theta-callable-default-name-unvalidated.md) (fixed, 0.63.0) —
    the two prior `tools:`-entry admission fixes. Both added rejection arms
    inside `resolveCallableSet` (`src/parser/callable-set.ts:176`), which is one
    of the two candidate homes in §Fix. 0069's constraint that the closed
    per-entry grammar is judged before resolution, and 0070's that a
    derived-name rejection precedes the collision test, are the same
    check-ordering discipline this report's element 2 asks for one level out.
  - 0075 / 0076 / 0077 / 0078 — the discovery-source family
    ([0075](./0075-symlinked-root-classified-wrong-type.md),
    [0076](./0076-existing-root-enumeration-failure-silent.md),
    [0077](./0077-settings-glob-matches-pattern-basename.md),
    [0078](./0078-cli-entries-not-resolved-by-thetapaths-schema.md)). **The
    boundary:** all four own `src/discovery/discovery-walk.ts`
    (`classifyPath:273`, `enumerateDirectory:301`, `globMatches:572`) — which
    candidate roots and entries yield discovered thetas. None owns the active-root union
    this check consults, and none mentions it (`grep -ln activeRoots
    docs/bugs/*.md` returns only 0008). `activeRoots` is derived one stage later,
    at `src/extension/production-composition.ts:498`, as
    `Array.from(new Set(discovered.map((theta) => dirname(theta.path))))` — the
    parent directory of every *discovered* theta, not the discovery-root list.
    Those four therefore change *which paths land in the union* (transitively,
    by changing what is discovered) and this report changes *which surfaces
    consult it*; the two are composable and neither blocks the other. 0075 is
    the nearest in subject — a symlinked root — and is still disjoint: it is
    about classifying a *root*, while §Fix constraint 3 here is about
    canonicalising a *callee*.
  - [0008](./0008-subagent-child-drops-all-but-last-theta-root.md) — fixed; the
    only other bug doc naming the active-root union. It concerns the union a
    subagent child reconstructs, and records that a shrunken union "fails as
    `theta/load/invoke-path-escape`" — the same code, the `invoke(...)` surface.
- **Affected** (every citation verified at HEAD `f8364db1`, 0.64.0; the two
  files another agent is editing concurrently for bug 0072 are cited by symbol
  only):
  - `src/extension/production-composition.ts:1615–1641` —
    **`parseCalleeForTools`, the whole of what a `tools:` `.theta` entry's path
    is subjected to at load.** `:1621` is the bare resolve
    (`isAbsolute(spec) ? spec : resolvePath(callerDir, spec)`); `:1622–1625` the
    `readBytes` with rejection-to-`undefined`; `:1626–1628` the
    `fileExists: false` return that drives
    `theta/load/unresolvable-theta-path`. There is no `realpath` call and no
    comparison against any root. Its doc comment (`:1608–1614`) enumerates what
    it reports — "readability, declared mode, and whether it carries its own
    error-severity load/parse diagnostics" — and containment is not in the list.
  - `src/extension/production-composition.ts:1402–1521` —
    `resolveThetaToolsAtLoad`, the caller. `:1433` invokes
    `parseCalleeForTools` once per distinct spec into `calleeCache`;
    `:1438–1453` is the V15f callee-has-errors arm; `:1476–1486` is
    `resolveThetaCallee`, which returns
    `{ kind: "theta", mode, callee: undefined, calleePath: thetaPath }` for any
    cached entry with `fileExists`; `:1490–1494` calls `resolveCallableSet`;
    `:1499` computes `registered` from error severity. The function's parameter
    list is `(parsed, fs, ctx, parseDeps, getAllTools)` — no `activeRoots`, so
    the containment inputs are not in scope here today.
  - `src/parser/callable-set.ts:176–283` — `resolveCallableSet`, and `:359–415`
    `resolveEntry`, whose `.theta` arm is `:382–414`. Six rejection arms exist
    for a `tools:` entry (`malformed-tool-entry`, `invalid-tool-rename`,
    `unknown-tool` / `unresolvable-theta-path` / `prompt-mode-callable` from
    `resolveEntry`, `invalid-derived-tool-name`, `tool-name-collision`); none is
    containment. The function is **synchronous**, and `deps.resolveThetaCallee`
    is a synchronous cache lookup, so an `await fs.realpath(...)` cannot be
    added inside it without either precomputing the verdict in
    `parseCalleeForTools` or making the resolver async — a §Fix constraint, not
    an incidental detail. `:386–395` is the `unresolvable-theta-path` message,
    which renders `<path>` as the entry `spec` verbatim: the precedent for how
    this surface renders that placeholder.
  - `src/extension/invoke-static-checks.ts` — `checkInvokeStaticResolution`.
    Its doc comment already states this defect, from the bug 0071 fix's second
    review round: INV-5 path-escape is "the `invoke(...)` surface **ONLY**. A
    `.theta`-callable call's containment is not checked on this load path at
    all: the `tools:` admission that produced `deps.callableSet`
    (`parseCalleeForTools`) reads the callee's bytes through a bare path
    resolve, with no `realpath` and no active-discovery-root test, so a `tools:`
    entry naming a callee outside every active root raises no containment
    diagnostic anywhere in this pass." The pass's deps carry `fs`,
    `activeRoots`, `graph`, `resolveCalleeArity` and — since 0071 —
    `callableSet`, so every input a containment check needs is already threaded
    into this function. Its `invoke(...)` loop calls `checkInvokePathAtLoad` and
    `continue`s on `kind === "escape"` before reaching that site's arity check;
    its `.theta`-callable loop (`resolveThetaCallableCallSites` →
    `checkInvokeArity`) has no containment step at all.
  - `src/runtime/invocation.ts:185–201` — `checkInvokePathAtLoad`, the load-time
    checker, and `:239–265` `recheckInvokePathAtRuntime`, the runtime one. Both
    delegate to `:98–126` `checkInvokePathContainment`, which canonicalises
    through `:142–147` `canonicalizePath` (`normalizePath(await
    fs.realpath(path))`) and applies segment-boundary containment
    (`:114–122`). `:208–215` `invokePathEscapeDiagnostic` builds the shared
    error-severity diagnostic. The checker is surface-agnostic — it takes
    `resolvedPath`, `literalPath` and `activeRoots` and knows nothing about
    `invoke(...)` — so nothing in it needs changing.
  - `src/extension/production-composition.ts:493–500` — the `activeRoots`
    derivation, and its comment: "the parent directory of every discovered
    theta. Every registrable theta sits inside an active discovery root … a
    callee resolving outside all of them escapes the sandbox." `:629` threads it
    to the producer (for the runtime re-check) and `:738` to the invoke
    static-check pass. Those are its only two behavioural consumers; `:1181`
    adds it to the file-watcher set.
  - `src/extension/production-composition.ts:689–702` — where the `tools:`
    resolution runs and where its error-severity diagnostics `continue` the
    per-theta loop, and `:730–754` — where `checkInvokeStaticResolution` runs.
    The first strictly precedes the second, which is the ordering §Fix
    constraint 1 requires containment to join.
  - `src/extension/production-theta-producer.ts:3106–3140` — `#driveCallee`, its
    INV-5-labelled comment (`:3116–3120`), and `:3137` its
    `#recheckCalleeContainment` call, reached before
    `this.#input.parseCallee?.(...)`; `:3260–3281` —
    `#recheckCalleeContainment`, which returns `undefined` when
    `fileSystem === undefined || activeRoots === undefined` (`:3266–3268`),
    resolves the callee against the caller's directory (`:3269–3273`), and
    returns `verdict.error` on escape. `:3020–3036` `#resolveCallAsInvoke` and
    `:3039–3096` `#buildInvokeChild` are the path a `.theta`-callable
    `<name>(args)` call takes to `#driveCallee`, so the re-check does cover this
    surface. What it guarantees: **one call** fails closed with
    `Err(InvokeInfraError { cause: "load_failure" })` at the moment of dispatch,
    against the *currently* active roots. What it does not: un-register the
    caller, emit at load, or prevent the callable's creation.
  - `src/extension/production-composition.ts:1791–1829` — `parseCalleeTheta`,
    the runtime callee parse. It calls `resolveThetaToolsAtLoad` (`:1827`) for
    the callee's own `tools:` and reads **only** `toolResult.callableSet`,
    falling back to `EMPTY_CALLABLE_SET`; the diagnostics are discarded. Its
    parameter list carries no `activeRoots`. A containment rejection added
    inside `resolveThetaToolsAtLoad` therefore reaches this path as a silently
    emptied callable set with no diagnostic — §Fix constraint 5.
  - `docs/spec_topics/tool-calls.md:14` — §"Argument shape", the sentence this
    report measures: "The path-restriction rule from [Invocation — Resolution]
    also applies to `.theta` paths used as `tools:` entries: a path that escapes
    the active discovery roots is rejected with `theta/load/invoke-path-escape`
    and the callable is not created." Same line carries the 0071 sentences on
    arity and on `<callee>` rendering. `:46` — §"Relationship with `invoke`":
    "both apply the arity, return-type-compatibility, and path-restriction rules
    from [Invocation]".
  - `docs/spec_topics/invocation.md:12` — §Resolution. Three clauses reach this
    surface: "A resolved path that escapes every active root is a load-time
    error `theta/load/invoke-path-escape`; the parent theta does not register
    the call site, and **a `tools:` `.theta` entry that escapes likewise fails
    to register the callable**"; "The realpath step is mandatory: a symlink farm
    inside a discovery root that resolves outside it is still rejected"; and
    "The same restriction applies to `.theta` paths used as `tools:` entries".
    The same paragraph fixes the comparison as byte-exact on
    `FileSystem.realpath` output with segment-boundary containment.
  - `docs/spec_topics/invocation.md:14`, `:16` — the INV-1
    symlink-resolution-hardening seam: "The load-time check (**parent theta
    registration / `tools:` `.theta` entry registration**) and the
    invocation-time re-check … MUST apply the identical
    `realpath`-then-discovery-root-containment semantics — including the
    segment-boundary within-root predicate". INV-1 names `tools:` entry
    registration as a load-time call site of the check, in the same breath as
    parent-theta registration.
  - `docs/spec_topics/diagnostics/code-registry-load.md:33` — the
    `theta/load/invoke-path-escape` row. *Sev* `E`, *Phase* `load, runtime`,
    *Trigger*: "An `invoke(...)` literal **or a `tools:` `.theta` entry**
    resolves (post-realpath) to a path that lies outside every active discovery
    root. Also fires from the runtime open re-check defined in [Invocation —
    Resolution]: a symlink that resolves outside every active root at
    invocation time, even if it was inside at load time." *Message*:
    `invoke path '<path>' resolves outside every active discovery root`. The
    *Trigger* names **both** surfaces, so the row is itself evidence the
    load-time check is owed here and needs no widening to license it.
  - `docs/reference/diagnostics.md:198` — the user-facing mirror. Its table
    header (`:172`) is `| Code | Sev | Phase | Message |` — no *Trigger*
    column, so a *Trigger*-only registry edit needs no mirror edit; a *Message*
    edit would, and DIAG-4 defers a *Message* reword to theta 2.0.
  - `docs/reference/discovery-cli.md:230–236` — §Resolution in the user-facing
    invoke reference: "The resolved path (post-`realpath`) must lie within the
    union of active discovery roots (segment-boundary containment, byte-exact on
    `realpath` output); an escape is `theta/load/invoke-path-escape`. The check
    re-runs at open time against the *currently* active roots (INV-1)." Stated
    for `invoke(...)`; the page does not restate it for `tools:`.
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:9` — category 5,
    `<path>`: "the literal text inside the path-literal quotes, with no realpath
    normalisation, no symlink resolution, no scheme prefixing". A `tools:` entry
    is unquoted YAML, so the rendered value is the entry spec as written — the
    reading `theta/load/unresolvable-theta-path` already implements
    (`src/parser/callable-set.ts:386–395`). `:55` — category 7, `<callee>`, and
    the `.theta`-callable-call arm bug 0071 added.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the registry
    is closed; a *trigger* change is a spec change), `:74` (DIAG-4 — the
    *Message* column is normative and a reword is deferred to theta 2.0).
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate — no diagnostic of effective severity `E`),
    `:25` (the diagnostic-registry carve-out, whose *trigger*-change arm is
    "in-scope as an addition for inputs newly brought into the code's emission
    set").
  - `docs/plan_topics/coverage-matrix.md:92` — `INV-1 | V15a`, the obligation
    row for the two-site-identical-containment pin. There is no coverage row
    naming the `tools:` surface's load-time containment separately.
  - `tests/invocation-core.test.ts:53–101` — four `checkInvokePathContainment`
    cells (in-root `within` keyed on the byte-exact `realpath` output `:54`,
    sibling-prefix escape `:63`, a symlink farm resolving outside every root
    `:74`, the union-of-roots case `:88`), all over a `FakeFileSystem` carrying a
    `symlinks` map. `:102–175` — the four load-time / runtime cells: an in-root
    load-time `within` (`:103`), a load-time escape emitting
    `theta/load/invoke-path-escape` at error severity (`:118`), a runtime escape
    on both channels (`:139`), and the removed-root fail-closed (`:159`). They
    exercise the *checker* on both of its two entry points; none drives a
    `tools:` entry, and
    `grep -rn "invoke-path-escape\|INVOKE_PATH_ESCAPE" tests/` returns hits in
    this file only. No test in the tree covers containment on the `tools:`
    surface in either direction.
  - `tests/theta-callable-call-arity.test.ts` — bug 0071's 39-cell witness over
    a planted `.pi/theta/` workspace and `discoverAndComposeFixtures`. Every
    callee it plants is inside the workspace, so no cell reaches containment.
    Its cell B9 (a callee carrying its own errors) is the nearest shape and is a
    different rule.
  - `tests/production-tools-load-resolution.test.ts` — the shipped `tools:`
    load-resolution witness. No containment cell.
  - **The corpus census** (`rg --files --glob '*.theta' --glob '*.thetalib'`,
    excluding `node_modules` and `dist`): **34** committed files, **14**
    declaring `tools:`, **5** declaring a `tools:` `.theta` entry —
    `docs/examples/ralph.theta:7` (`./ralph-step.theta`),
    `docs/examples/refine.theta:5` (`./reviewer.theta`),
    `docs/examples/typed-return.theta:5` (`./sentiment.theta`),
    `docs/examples/typed-params-across-boundary.theta:5`
    (`./summarise-doc.theta`), `docs/examples/fan-out-reviews.theta:5`
    (`./review-lens.theta`). All five are `./`-relative siblings in
    `docs/examples/`, all five callees exist there, and a sibling in the
    caller's own directory is inside the root that directory contributes. **Zero
    resolve outside their active roots.**
- **Observed at:** `0.64.0` (HEAD `f8364db1`). Offline, deterministic; no live
  model, no provider. One scratch vitest driving the shipped composition root
  (`discoverAndComposeFixtures`, `src/extension/production-composition.ts`) over
  a planted `mkdtempSync` `.pi/theta/` workspace with the out-of-root callees in
  a second, undiscovered `mkdtempSync` directory; three assertion cells plus an
  observable dump; written, run, deleted.

## Summary

`docs/spec_topics/tool-calls.md:14` states the rule and names the code:

> The path-restriction rule from [Invocation — Resolution] also applies to
> `.theta` paths used as `tools:` entries: a path that escapes the active
> discovery roots is rejected with `theta/load/invoke-path-escape` and the
> callable is not created.

`docs/spec_topics/invocation.md:12` states the same thing from the other side
("a `tools:` `.theta` entry that escapes likewise fails to register the
callable"), the INV-1 seam (`:14`, `:16`) names "`tools:` `.theta` entry
registration" as a load-time call site of the check, and the registry *Trigger*
(`code-registry-load.md:33`) names both surfaces in one sentence.

Nothing on the load path enforces it for a `tools:` entry. `parseCalleeForTools`
resolves the entry with a bare path resolve and reads its bytes; there is no
`realpath` and no comparison against `activeRoots`. `checkInvokePathAtLoad` has
one call site in `src/` — the `invoke(...)` loop of the invoke static-check
compose pass. No consumer of `activeRoots` sits on the `tools:` resolution path
at all. The callable is created and the caller registers.

Measured at `f8364db1`, one workspace, one callee planted outside every active
root, reached two ways with the arity the callee declares satisfied exactly on
both, so containment is the only rule that could reject either caller:

```
invoke("<abs>/farcallee.theta", "a", "b")   -> theta/load/invoke-path-escape, caller un-registers
tools: - <abs>/farcallee.theta  +  farcallee("a", "b")
                                            -> no containment diagnostic; caller REGISTERS
```

The enforcement that does exist for the `.theta`-callable surface is the runtime
open-time re-check (`#driveCallee` → `#recheckCalleeContainment`). It fails one
call closed at dispatch with `Err(InvokeInfraError { cause: "load_failure" })`
against the currently-active roots. It does not un-register the caller, does not
emit at load, and so does not deliver "the callable is not created".

A second, dependent element follows from the first. Bug 0071's fix (0.64.0)
added a `.theta`-callable arity check to the same compose pass, downstream of the
`tools:` resolution. That check now emits against an out-of-root callee: the
verdict is correct on its own terms — the callee was read and parsed — but it
fires for a callable the spec says was never created, and it is what un-registers
the caller, on the wrong rule. Measured in §Reproduction cell 4. This is
ordering, not correctness, and it is why the two elements share one fix:
containment judged before arity resolves both.

One corpus claim is corrected here. Bug 0071's §Expected behaviour asserts "The
path-restriction half of that sentence *is* implemented for `tools:` entries
(`theta/load/invoke-path-escape`); the arity half is not." That clause is false;
0071's own fix record says so in its *Where this report turned out to be wrong*
section, and this report is the correction, re-measured at the fix commit.

## Reproduction

Offline, at `f8364db1`. Scratch vitest, the shipped composition root: a fake
`pi` / `ctx` pair with `ctx.cwd` set to a `mkdtempSync` workspace carrying
`.pi/theta/` and a `{}` `.pi/settings.json`, then
`await discoverAndComposeFixtures(pi, ctx)`. Observables: the returned fixtures'
`slashName`s (`REGISTERED`) and every string reaching `ctx.ui.notify`
(`NOTIFICATIONS`) — the same two production observables bug 0071's witness file
uses.

The out-of-root callees sit in a **second** `mkdtempSync` directory that the
discovery walk never visits. `activeRoots` is
`Array.from(new Set(discovered.map((theta) => dirname(theta.path))))`
(`src/extension/production-composition.ts:498`), so with every discovered theta
in `<ws>/.pi/theta` the union is that one directory and the second temp
directory is outside it. Both out-of-root callees declare

```yaml
mode: subagent
params:
  x: string
  y: string
```

— `requiredCount` 2, `totalCount` 2.

### The eight planted workspace thetas

| # | Stem | `tools:` / body | Purpose |
|---|---|---|---|
| 0 | `ctl` | none; `@`hi`` | control |
| 1 | `nearcallee` | the same two-required `params:`, in-root | the in-root callee |
| 1 | `callnear` | `- ./nearcallee.theta`; `nearcallee("a", "b")?` | in-root control at exact arity |
| 2 | `invescape` | no `tools:`; `invoke("<abs>/farcallee.theta", "a", "b")?` | the `invoke(...)` surface, exact arity |
| 3 | `callescape` | `- <abs>/farcallee.theta`; `farcallee("a", "b")?` | **the decisive cell** |
| 3b | `callescapeq` | `- "<abs>/farcallee.theta"`; same body | the double-quoted YAML spelling |
| 3c | `callescaperel` | `- ../../../<tmp>/farcallee.theta`; same body | a `..`-relative escape |
| 4 | `callescapearity` | `- <abs>/wideparam.theta`; `wideparam("a")?` | element 2 — arity at an out-of-root callee |

Cells 2, 3, 3b and 3c all name the *same* callee and all pass exactly two
arguments to its two required params, so no arity, unresolvable-path,
prompt-mode, rename, derived-name or collision rule can reject any of them.
Containment is the only remaining rule. `farcallee` and `wideparam` are chosen so
neither presented name is a substring of the other: `ctx.ui.notify` carries the
message text with no caller attribution, so the collector is workspace-global.

### Verbatim run output

```
OUTSIDE_DIR:  C:/Users/…/Temp/theta-b110-out-T8qi4m
WORKSPACE:    C:/Users/…/Temp/theta-b110-ws-IcjLON
REGISTERED:   ["callescape","callescapeq","callescaperel","callnear","ctl"]
NOTIFICATIONS:
  - binder model unresolved: set 'bind_model:' in frontmatter or 'theta.binderModel' in settings
  - invoke 'wideparam' passes too few arguments: expected 2 non-defaulted, got 1
  - invoke path 'C:/Users/…/Temp/theta-b110-out-T8qi4m/farcallee.theta' resolves outside every active discovery root
```

Read against the table:

- **Cell 2 — `invescape` is absent from `REGISTERED`** and drew
  `theta/load/invoke-path-escape` naming the literal path. The `invoke(...)`
  surface enforces containment, and this cell is also the proof that the second
  temp directory is outside every active root at this point in the run.
- **Cells 3, 3b and 3c — `callescape`, `callescapeq` and `callescaperel` are all
  in `REGISTERED`**, and the whole run carries exactly **one** containment
  notification: cell 2's. Three spellings of the same out-of-root `tools:`
  entry — absolute plain scalar, absolute double-quoted scalar,
  `..`-relative — all mint the callable.
- **Cell 4 — `callescapearity` is absent from `REGISTERED`**, and the reason is
  `invoke 'wideparam' passes too few arguments: expected 2 non-defaulted, got 1`
  — bug 0071's arity check, not containment. There is no containment
  notification naming `wideparam` anywhere in the run. This is element 2, and it
  also proves element 1's positive half: the arity loop reads
  `deps.callableSet.entries`, keeps `kind === "theta"` entries and resolves
  `site.calleePath`, so it could not have produced this message unless the
  out-of-root callable had been created and frozen onto the snapshot.
- **Cell 1 — `callnear` is in `REGISTERED`** with no diagnostic, so the
  `tools:` `.theta` route resolves and admits normally; the absence of a
  containment diagnostic in cells 3/3b/3c is not a broken harness.
- The `binder model unresolved` notification is `nearcallee`'s own, unrelated:
  it declares `params:`, so it is a non-bypass theta with no `bind_model:`
  (`theta/load/binder-model-unresolved`, severity `E`,
  `code-registry-load.md:34`), which is why the in-root *callee* does not
  itself register. It is raised in the compose pass, not in
  `parseThetaDocument`, so it does not reach `parseCalleeForTools`'
  `hasErrors` and does not affect any `tools:` resolution — the registered
  `callnear` shows this.

### Asserted cells

The probe's four `it` blocks — the observable dump above plus three assertions —
all green at `f8364db1`:

```
the exact registered set                       ["callescape","callescapeq","callescaperel","callnear","ctl"]
exactly one containment notification, and it names farcallee.theta   (the invoke surface's)
exactly one "passes too" notification naming wideparam               (element 2)
```

### Not measured on this host

The `realpath`-vs-bare-resolve divergence (§Fix constraint 3) has no offline cell
here: `fs.symlinkSync` fails `EPERM` on this Windows host without elevation, so a
symlink inside the root resolving outside it could not be planted. The divergence
is established from source instead — `parseCalleeForTools` calls no `realpath`
(`src/extension/production-composition.ts:1621`), while
`checkInvokePathContainment` canonicalises both sides through
`canonicalizePath` → `fs.realpath` (`src/runtime/invocation.ts:98–126`,
`:142–147`) — and the corresponding cell must be planted at fix time, on a host
where symlink creation is permitted or through the test `FakeFileSystem` that
`tests/invocation-core.test.ts:74` already uses for exactly this shape.

## Expected behaviour

- **A `tools:` `.theta` entry whose path escapes every active root creates no
  callable.** `docs/spec_topics/tool-calls.md:14` states it in those words and
  names `theta/load/invoke-path-escape`. `docs/spec_topics/invocation.md:12`
  states the same disposition from §Resolution: "a `tools:` `.theta` entry that
  escapes likewise fails to register the callable". Neither sentence admits a
  runtime-only reading: `theta/load/` is a load-phase namespace, and "the
  callable is not created" is a statement about the frozen snapshot, which is
  built at load.
- **The two surfaces apply the same path-restriction rule.**
  `docs/spec_topics/tool-calls.md:46`, §"Relationship with `invoke`": "both apply
  the arity, return-type-compatibility, and path-restriction rules from
  [Invocation]". Bug 0071 discharged the arity third of that sentence for the
  `.theta`-callable surface. The path-restriction third is measured unenforced
  here on the same surface, with the same callee, in the same run.
- **The registry row already names this surface.**
  `code-registry-load.md:33`'s *Trigger* is "An `invoke(...)` literal **or a
  `tools:` `.theta` entry** resolves (post-realpath) to a path that lies outside
  every active discovery root". Under DIAG-2 the *Trigger* column is normative
  spec, so the registry itself is the statement that this surface owes the
  emission — the fix enforces a published trigger rather than widening one.
- **INV-1 names the `tools:` load-time call site explicitly.**
  `docs/spec_topics/invocation.md:16`: "The load-time check (**parent theta
  registration / `tools:` `.theta` entry registration**) and the
  invocation-time re-check … MUST apply the identical
  `realpath`-then-discovery-root-containment semantics — including the
  segment-boundary within-root predicate". INV-1 is a two-site pin. One of the
  two load-time sites it names has no check.
- **The resolution primitive is `realpath`, and it is mandatory.**
  `docs/spec_topics/invocation.md:12`: "The realpath step is mandatory: a
  symlink farm inside a discovery root that resolves outside it is still
  rejected", with the comparison fixed as byte-exact on `FileSystem.realpath`
  output under segment-boundary containment. `parseCalleeForTools` resolves
  without `realpath`, so the two surfaces cannot classify a symlinked callee
  identically until the fix uses the same primitive.
- **A load-time rule is not discharged by a runtime backstop.** The runtime
  re-check is specified as a re-check — `docs/spec_topics/invocation.md:12`,
  "The realpath + discovery-root containment check is re-run at the moment the
  runtime opens the callee for invocation" — whose stated purpose is to catch a
  symlink swapped *between load and invocation*. A re-check presupposes a first
  check. It also uses the currently-active roots by design, so it cannot stand
  in for a load-time verdict.
- **Containment is judged before any derived per-callee diagnostic.** For a
  callable the spec says is never created, no downstream rule about that
  callable has a subject. The `tools:`-resolution errors already sit before the
  arity loop (`src/extension/production-composition.ts:689–702` precedes
  `:730–754`); containment belongs in that same position, and bug 0069's
  grammar-before-resolution and bug 0070's derived-name-before-collision
  orderings are the same discipline inside `resolveCallableSet`.

## Actual behaviour / root cause

**A `tools:` `.theta` entry's path meets one resolve and one read.**

```ts
  const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
```

`src/extension/production-composition.ts:1621–1625`, inside
`parseCalleeForTools`. `resolvePath` normalises `.` and `..` and nothing else:
no symlink resolution, no canonical form, no root. The function's three return
shapes report `fileExists`, `mode` and `hasErrors`; containment is not among
them, and its doc comment (`:1608–1614`) does not claim it is.

**The one load-time containment call site is on the other surface.**
`checkInvokePathAtLoad` (`src/runtime/invocation.ts:185`) is called once in
`src/`, from the `invoke(...)` loop of `checkInvokeStaticResolution`
(`src/extension/invoke-static-checks.ts`). That loop `continue`s on
`containment.kind === "escape"`, which is why an escaping `invoke` callee never
reaches its own arity check. The pass's second loop —
`resolveThetaCallableCallSites` feeding `checkInvokeArity` — has no containment
step. The pass's own doc comment states this, added by the bug 0071 fix's second
review round after an independent probe: path-escape is "the `invoke(...)`
surface **ONLY**", and a `tools:` entry naming an out-of-root callee "raises no
containment diagnostic anywhere in this pass".

**The inputs are already in scope where the gap is.** `deps.activeRoots` and
`deps.fs` are threaded into `checkInvokeStaticResolution`
(`src/extension/production-composition.ts:730–754`), and bug 0071 added
`deps.callableSet` — the frozen snapshot whose `kind === "theta"` entries carry
`calleePath`. Nothing needs new plumbing to know which paths to check.

**`resolveCallableSet` has six rejection arms and none is containment.**
`src/parser/callable-set.ts:176–283`: malformed grammar, invalid `as` target,
`resolveEntry`'s unknown-tool / unresolvable-path / prompt-mode arm, invalid
derived name, name collision. `resolveEntry`'s `.theta` arm (`:382–414`) tests
only `deps.resolveThetaCallee(spec) === undefined` and `resolved.mode ===
"prompt"`. The function is synchronous and `deps.resolveThetaCallee` is a
synchronous `Map.get` over `calleeCache`, so the async `realpath` the check
needs has no seam here without a precomputed verdict.

**No consumer of `activeRoots` sits on the `tools:` path.**
`grep -rn activeRoots src/` yields the derivation
(`production-composition.ts:498`), the thread to the producer for the runtime
re-check (`:629`), the thread to the invoke static-check pass (`:738`), the
watcher set (`:1181`), the producer's own re-check
(`production-theta-producer.ts:3265–3278`), the pass's dep
(`invoke-static-checks.ts`), and the checker's parameters
(`runtime/invocation.ts`). `resolveThetaToolsAtLoad`
and `parseCalleeForTools` take no such parameter.

**The runtime re-check is the only enforcement, and it is a different
guarantee.** `#driveCallee` (`src/extension/production-theta-producer.ts:3106`)
calls `#recheckCalleeContainment` (`:3260`) before `parseCallee` (`:3141`), and
returns `makeErr(escape)` on a verdict of `"escape"` (`:3137–3139`). A code-side
`.theta`-callable call reaches it through `#resolveCallAsInvoke` (`:3020`) →
`#buildInvokeChild` (`:3039`) → `drive()` → `#driveCallee`, so the surface is
covered. What it delivers is one `Err(InvokeInfraError { cause: "load_failure",
callee_path })` at dispatch, computed against the *currently* active roots
(`recheckInvokePathAtRuntime`, `src/runtime/invocation.ts:239`). It runs after
registration, after the callable is in the frozen snapshot, and after the model
has been offered the callable in the theta's callable set. It also returns
`undefined` — no check — when `fileSystem` or `activeRoots` is absent on the
producer input (`:3266–3268`), which is the harness case.

**Element 2 is a consequence of element 1 plus the 0071 fix's position in the
pass.** The `tools:` resolution runs at
`src/extension/production-composition.ts:689` and `continue`s on error at
`:700–702`; `checkInvokeStaticResolution` runs at `:737`. Because containment is
absent from the first, an out-of-root entry survives into the frozen snapshot,
and the arity loop then reads it and emits. The 0071 fix's comment on that loop
states the invariant it relies on — "reached only for a `tools:` entry that
already resolved cleanly … `deps.callableSet` never carries a rejected entry
here" — which is true of the rejections that exist and vacuous for the one that
does not. The measured consequence (cell 4) is a caller un-registered by
`theta/parse/invoke-arity-too-few` naming a callee the spec says has no
callable.

**Nothing in the tree scores either element.**
`grep -rn "invoke-path-escape\|INVOKE_PATH_ESCAPE" tests/` hits
`tests/invocation-core.test.ts` only, where the eight INV-1 cells
(`:53–175`) drive `checkInvokePathContainment`, `checkInvokePathAtLoad` and
`recheckInvokePathAtRuntime` directly against a `FakeFileSystem`. Bug 0071's
witness (`tests/theta-callable-call-arity.test.ts`) plants every callee inside the
workspace. Nothing drives a `tools:` entry through containment in either
direction.

## Why it matters

- **A containment rule with a `theta/load/` code and an `E` severity is
  unenforced on one of the two surfaces its own registry *Trigger* names.**
  `code-registry-load.md:33` says "An `invoke(...)` literal or a `tools:`
  `.theta` entry"; measured, only the first fires. Under DIAG-2 the *Trigger*
  column is normative, so this is a published rule with no emitter, not an
  inference from prose.
- **The unenforced rule is the one the implementation names as the sandbox
  boundary.** `src/extension/production-composition.ts:493–500` describes the
  union it builds as the sandbox: "a callee resolving outside all of them escapes the
  sandbox". A `tools:` entry naming an absolute path anywhere on the filesystem
  mints a callable, and three spellings of that entry — absolute plain,
  absolute quoted, `..`-relative — are measured doing so. The callable then
  enters the caller's callable set, which `tool-calls.md:3` states "is what the
  model sees during a `@`...`` query", so the escaped callee is offered to the
  model as well as callable from code.
- **The same mistake at the same callee is caught through one call surface and
  not the other.** Measured in one run: `invoke("<abs>", "a", "b")`
  un-registers with the escape diagnostic; `tools: - <abs>` plus
  `farcallee("a", "b")` registers silently. `tool-calls.md:46` calls the two
  surfaces equivalent for exactly this rule, and §"Relationship with `invoke`"
  calls them "operationally equivalent" for subagent-mode callees. This is the
  same asymmetry bug 0071 filed for arity, one clause along the same sentence.
- **The failure moves from load to dispatch, and changes shape.** With no
  load-time check the first observable is one `Err(InvokeInfraError { cause:
  "load_failure" })` at the moment of a call — after registration, possibly
  inside a loop, possibly after a `@`-query in which the model chose the
  callable. `invocation.md:12` records why that `Err` is not a substitute for
  the diagnostic: "the parent's `Err` cannot distinguish escape from deletion,
  both of which are legitimate causes of `load_failure`", which is why the
  spec's escape report is two-channel. Only the runtime channel exists here.
- **A caller can be un-registered on the wrong rule.** Cell 4: an out-of-root
  callee with two required params, called with one argument, un-registers the
  caller as `theta/parse/invoke-arity-too-few`. The author is directed at their
  argument list; the entry's path is what the spec refuses. Fixing the arity
  call would leave the entry registered.
- **The two surfaces cannot classify a symlinked callee identically until they
  share the resolution primitive.** `invocation.md:12` makes `realpath`
  mandatory and names the symlink-farm case; `invocation.md:16` requires
  identical semantics at both load-time sites. `parseCalleeForTools` calls no
  `realpath`, so a symlink inside a root pointing outside it is a divergence
  between the surfaces by construction (unmeasured on this host — see
  §Reproduction).
- **The tree carries no witness in either direction.** No test drives a
  `tools:` entry through containment, so nothing reds if the check is added and
  later narrowed, and nothing red today records the gap.
- **The corpus does not exercise it.** All 5 committed `tools:` `.theta`
  entries are `./`-relative siblings inside `docs/examples/`, so the measured
  blast radius of newly refusing an out-of-root entry is **zero** files. The
  behaviour is reachable only by an author writing an absolute or `..`-relative
  entry.

## Non-goals

- **The `invoke(...)` surface's containment behaviour**, which is correct
  (measured: cell 2). This report adds a second load-time call site for the
  same checker; it changes nothing about the first.
- **The runtime open-time re-check**, which stays. It is the defence for a
  callee that is not statically resolvable at load and for a symlink swapped
  between load and invocation — `invocation.md:12` states both — and it is the
  only enforcement in a harness where `activeRoots` is absent from the producer
  input (`production-theta-producer.ts:3266–3268`). §Fix constraint 4 keeps it.
- **How `activeRoots` is computed.** The union is the parent directory of every
  discovered theta (`production-composition.ts:498`). Whether that is the right
  set — as against the discovery-root list itself, or the settings `thetaPaths`
  entries — is untouched here, and the discovery-source family
  ([0075](./0075-symlinked-root-classified-wrong-type.md) …
  [0078](./0078-cli-entries-not-resolved-by-thetapaths-schema.md)) owns the
  stage that feeds it.
- **The `theta/load/invoke-path-escape` *Message* text.** It reads `invoke path
  '<path>' resolves outside every active discovery root`, and on this surface
  the subject is a `tools:` entry rather than an `invoke` path. DIAG-4
  (`diagnostic-shape.md:74`) defers a *Message* reword to theta 2.0, so the
  wording is a constraint on the fix (§Fix constraint 2), not a defect this
  report asks to correct.
- **`resolveCalleeArity` being uncached**, so a callee is re-read and re-parsed
  once per call site. Bug 0071 residual 4; inherited from the `invoke(...)`
  surface; unchanged either way here.
- **The `INV-5` label drift in the source comments.**
  `src/extension/invoke-static-checks.ts` and
  `src/extension/production-theta-producer.ts:3116` both label the containment
  check "INV-5", while `docs/spec_topics/invocation.md`'s INV-5 (`:36`) is
  subagent return-value propagation over the envelope and its containment pin is
  INV-1 (`:14`). `docs/plan_topics/coverage-matrix.md:95` maps INV-5 to RFC
  0006, and `:92` maps INV-1 to `V15a`. The mislabel is a comment-level
  citation defect, unfiled, and noted here only so this report's citations
  resolve: where the source says INV-5 and means containment, the owning rule is
  invocation.md §Resolution plus the INV-1 seam.
- **Bug 0072's rules.** `theta/parse/tool-arg-arity`, `-schema-conflict`,
  `-type-mismatch` and the missing code-side runtime AJV net are
  [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md)'s, on the same pass
  and disjoint from this one.

## Fix

**Judge a `tools:` `.theta` entry's containment at load, before the callable is
created, with the same `realpath`-based checker the `invoke(...)` surface uses,
and emit `theta/load/invoke-path-escape` on escape.** The route is not settled;
the constraints below pin it.

*Where the check belongs — undecided.* Two candidate homes, both already holding
the facts:

- **Route A — in the invoke static-check compose pass**
  (`checkInvokeStaticResolution`, `src/extension/invoke-static-checks.ts`).
  `deps.fs`, `deps.activeRoots` and — since bug 0071 — `deps.callableSet` are
  all already threaded in, and `checkInvokePathAtLoad` is already imported and
  called there for the other surface. The check would iterate the snapshot's
  `kind === "theta"` entries (or the resolved `.theta`-callable call sites) and
  run the same call the `invoke(...)` loop runs. Cheapest wiring; but the
  callable already exists in the frozen snapshot by the time this pass runs, so
  the diagnostic un-registers the caller rather than preventing the callable's
  creation — a weaker reading of "the callable is not created" than the sentence
  states, though observationally equivalent for a registered theta.
- **Route B — at `tools:` resolution time** (`resolveCallableSet` /
  `resolveThetaToolsAtLoad`, `src/parser/callable-set.ts:176`,
  `src/extension/production-composition.ts:1402`). This is where "the callable
  is not created" belongs literally, and it makes the diagnostic a
  `tools:`-resolution error, which already precedes the arity loop
  (`production-composition.ts:689–702` before `:730–754`) — discharging the
  ordering requirement structurally rather than by placement inside one pass.
  The costs are measurable and must be paid explicitly. `resolveCallableSet` is
  **synchronous** and `deps.resolveThetaCallee` is a synchronous `Map.get`, so
  the verdict has to be precomputed in `parseCalleeForTools` (which is async and
  already reads the callee) and carried on `CalleeParse` — or the resolver has
  to become async, which touches every caller and every unit test that drives
  it (`tests/callable-set.test.ts`, `tests/tools-entry-closed-grammar.test.ts`,
  `tests/tools-derived-name-shape.test.ts`,
  `tests/tools-entry-closed-grammar-lockstep.test.ts`,
  `tests/subagent-fn.test.ts`). `resolveThetaToolsAtLoad` also takes no
  `activeRoots` today and would need it threaded.

Constraints on either route:

1. **Containment is judged before arity and before every other derived
   per-callee diagnostic.** This is what closes element 2. The order is
   the closed per-entry grammar (bug 0069), then the entry's own resolution
   errors *including containment*, then any rule derived from the callee's
   contents — bug 0071's `theta/parse/invoke-arity-too-{few,many}`, and bug
   0072's per-argument checks when they land. An out-of-root entry must attract
   its containment rejection and no derived diagnostic naming the same callee.
   Cell 4's message must disappear and be replaced by the containment one, and
   the test must assert both halves. The existing `tools:`-resolution errors
   already have this position; whichever route is chosen must reach it.
2. **The registry disposition is decided against a *Trigger* that already names
   this surface, and the *Message* is not touched.**
   `code-registry-load.md:33`'s *Trigger* reads "An `invoke(...)` literal or a
   `tools:` `.theta` entry resolves (post-realpath) to a path that lies outside
   every active discovery root", and its *Phase* cell is already `load,
   runtime`. On that reading the fix adds no code and widens no trigger: it
   makes an existing row's stated trigger reachable, and the registry needs no
   edit at all. Confirm that reading against the row as written rather than
   assuming it; if the *Trigger* needs widening after all, that is a
   DIAG-2 spec edit landed in the same commit, and
   `docs/reference/diagnostics.md` needs no mirror edit because its table
   (`:172`) carries no *Trigger* column. The *Message* stays byte-exact —
   `invoke path '<path>' resolves outside every active discovery root` — because
   DIAG-4 (`diagnostic-shape.md:74`) defers a reword to theta 2.0, so the
   diagnostic on this surface says "invoke path" about a `tools:` entry and that
   is the specified string. `<path>` renders the entry `spec` as written
   (category 5, `placeholder-rendering-b.md:9`), which is the reading
   `theta/load/unresolvable-theta-path` already implements on the same surface
   (`src/parser/callable-set.ts:386–395`); if the run reaches a different
   conclusion it records it in `placeholder-rendering-b.md` §5, the way bug 0071
   recorded the `<callee>` arm in §7. Whichever spec pages move, they move in
   the same commit as the code.
3. **The fix uses the same resolution primitive the `invoke(...)` surface
   uses.** `checkInvokePathContainment` canonicalises the callee path *and* each
   root through `canonicalizePath` → `fs.realpath`
   (`src/runtime/invocation.ts:98–126`, `:142–147`);
   `parseCalleeForTools` uses a bare `resolvePath`
   (`src/extension/production-composition.ts:1621`). `invocation.md:12` makes
   the `realpath` step mandatory and `invocation.md:16` requires identical
   semantics at both load-time sites, so a symlinked callee must classify
   identically on both surfaces. Call `checkInvokePathAtLoad` — do not
   reimplement the predicate, and do not substitute `resolvePath`. A witness
   cell for the symlink case is required and was not obtainable on the reporting
   host (`fs.symlinkSync` → `EPERM`); plant it through the `FakeFileSystem`
   shape `tests/invocation-core.test.ts:74` already uses if the fixing host
   cannot create real links either.
4. **The runtime re-check stays.** `#recheckCalleeContainment`
   (`src/extension/production-theta-producer.ts:3260`) is the defence for a
   callee that is not statically resolvable at load, for a symlink swapped
   between load and invocation, and for the currently-active-root semantics
   `invocation.md:12` pins to invocation time. It also returns `undefined` when
   the producer input carries no `fileSystem` / `activeRoots`, which is the
   harness case. This fix adds a load-time gate; it removes nothing.
   `tests/invocation-core.test.ts:139–175` stays green unmodified.
5. **A rejection must not silently empty a nested callee's callable set.**
   `parseCalleeTheta` (`src/extension/production-composition.ts:1791–1829`)
   calls `resolveThetaToolsAtLoad` for an invoked callee's own `tools:`, reads
   only `toolResult.callableSet`, discards the diagnostics, and falls back to
   `EMPTY_CALLABLE_SET`. Under route B, an escape there makes
   `resolveCallableSet` return `registered: false` with no snapshot, so the
   callee silently loses its entire callable set at dispatch with nothing on any
   channel. That path also has no `activeRoots` in scope. Route B must state
   what happens there — thread the roots and surface the diagnostic, or scope
   the new check to the discovered-theta pass — and route A must confirm the
   path is unaffected because the pass does not run for a nested callee.
6. **GOV-15: the refused set is enumerated and the census re-run.** All three
   escaping spellings load cleanly today (measured: registered, zero
   error-severity diagnostics), so they sit inside GOV-15's loads-cleanly input
   set (`source-language-stability.md:9`) and the change is covered by the
   diagnostic-registry carve-out (`:25`), whose *trigger*-change arm is
   "in-scope as an addition for inputs newly brought into the code's emission
   set". The carve-out is not the whole answer, and does not have to be: the
   spec sentence being enforced (`tool-calls.md:14`) already prescribes exactly
   this rejection, and the registry *Trigger* already names this surface, so the
   fix brings the implementation to a published rule rather than adding a
   refusal the corpus does not state. Measured blast radius at `f8364db1`: **zero** —
   34 committed `.theta` / `.thetalib` files, 14 with `tools:`, 5 with a
   `tools:` `.theta` entry, all five `./`-relative siblings in
   `docs/examples/` whose callees exist there. Re-run the census at the fix
   baseline as a measured claim, and extend it to `tools:` entries synthesised
   as TypeScript string literals in `tests/`, not committed corpus files only.
   Cell 4's input is already outside the loads-cleanly set (it emits
   `theta/parse/invoke-arity-too-few` today), so element 2's correction changes
   which code an already-refused input emits — record that as a code-sequence
   change on an out-of-set input.
7. **Test witness — offline, provider-free, both directions.** Every cell
   settles inside one `discoverAndComposeFixtures` over a planted workspace,
   in the shape `tests/theta-callable-call-arity.test.ts` uses. Required: the
   three escaping spellings (absolute plain scalar, absolute double-quoted
   scalar, `..`-relative) each un-registering their caller with
   `theta/load/invoke-path-escape` sourced from the registry *Message* column
   per DIAG-4; the in-root control (`callnear`) still registering silently; the
   `invoke(...)` surface cell unchanged, which pins that the fix added a call
   site rather than moved one; the element-2 ordering cell — an out-of-root
   callee called at the wrong arity draws the containment code and **no**
   `passes too` message; a `tools:` entry with an `as` rename at an out-of-root
   callee, since the presented name and the `calleePath` diverge there
   (bug 0071 §Fix constraint 2's hazard class); the symlink cell from
   constraint 3; and an assertion that the un-registration is caused by
   containment and not by a co-firing rule, by keeping every other entry rule
   satisfiable in each escaping cell (exact arity, resolvable path,
   subagent mode, lowercase-first derived name, no collision) exactly as
   §Reproduction does. Prove the red direction once by removing the new call
   and confirming the containment cells red, then restore byte-exact.
8. **Coordinate with bug 0072 on the same file.** 0072 is being fixed
   concurrently in `src/extension/invoke-static-checks.ts` and
   `src/parser/theta-document.ts`. Under route A both changes land in
   `checkInvokeStaticResolution`; whichever lands second re-derives its
   citations and re-runs the other's witness file. Do not fork the pass's single
   call-site traversal (`collectCallSites`) — bug 0071 §Fix's single-walker
   invariant — and do not add a second body walk.

## Provenance

- Origin: the bug 0071 fix (0.64.0, HEAD `f8364db1`), §Fix (0.64.0)
  *Residuals* items 2 and 3
  ([0071](./0071-theta-callable-call-arity-unchecked.md)) and its
  *Where this report turned out to be wrong* section, which retracts 0071
  §Expected behaviour's clause "The path-restriction half of that sentence *is*
  implemented for `tools:` entries". This report is that filing and that
  correction. What it adds beyond the residuals: the three escaping spellings
  measured (absolute plain, absolute quoted, `..`-relative) rather than one; the
  decisive-cell construction in which every non-containment entry rule is
  satisfied so the arity check cannot mask the verdict — the 0071 probe's
  `callescape` un-registered on arity and could not settle element 1 alone; the
  `checkInvokePathAtLoad` call-site count re-derived by grep; the verified
  absence of any `activeRoots` consumer on the `tools:` resolution path; the
  synchronous-`resolveCallableSet` and `parseCalleeTheta`-discards-diagnostics
  constraints on route B; the registry-*Trigger*-already-names-both-surfaces
  reading and its GOV-15 consequence; the corpus census; and the boundary
  against the discovery-source family.
- Spec: `docs/spec_topics/tool-calls.md:3` (the callable set is what the model
  sees), `:14` (§"Argument shape" — the containment sentence naming
  `theta/load/invoke-path-escape` and "the callable is not created"; also the
  0071 arity and `<callee>` sentences), `:46` (§"Relationship with `invoke`" —
  "both apply the arity, return-type-compatibility, and path-restriction
  rules"); `docs/spec_topics/invocation.md:12` (§Resolution — the `tools:`
  entry clause, the mandatory `realpath` step, the byte-exact
  segment-boundary predicate, the two-channel escape report and why the
  parent's `Err` cannot substitute, the currently-active-roots rule for the
  re-check), `:14`, `:16` (the INV-1 seam naming "`tools:` `.theta` entry
  registration" as a load-time call site), `:36` (INV-5 — envelope propagation,
  not containment), `:85` (INV-4);
  `docs/spec_topics/diagnostics/code-registry-load.md:33` (the
  `theta/load/invoke-path-escape` row — *Sev* `E`, *Phase* `load, runtime`,
  *Trigger* naming both surfaces, *Message*, *Hint*), `:34`
  (`theta/load/binder-model-unresolved`, severity `E` — the unrelated
  notification in §Reproduction);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/diagnostics/placeholder-rendering-b.md:9`
  (category 5 `<path>`), `:55` (category 7 `<callee>` and its
  `.theta`-callable arm);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out and
  its *trigger*-change arm);
  `docs/spec_topics/future-considerations/surface-extensions.md:41` (the
  deferred symlink-resolution hardening, which pins
  `theta/load/invoke-path-escape` as the code that survives it).
  Plan: `docs/plan_topics/coverage-matrix.md:92` (`INV-1 | V15a`), `:95`
  (`INV-5 | RFC 0006`). User-facing:
  `docs/reference/diagnostics.md:172` (the mirror table's header — no *Trigger*
  column), `:198` (the mirrored row);
  `docs/reference/discovery-cli.md:230–236` (§Resolution, stated for
  `invoke(...)`).
- Implementation evidence at `f8364db1`:
  `src/extension/production-composition.ts:493–500` (the `activeRoots`
  derivation and its sandbox comment), `:629` (thread to the producer),
  `:689–702` (the `tools:` resolution and its error-severity `continue`),
  `:730–754` (`checkInvokeStaticResolution`'s call site and the `callableSet`
  guarded spread), `:1181` (the watcher set),
  `:1402–1521` (`resolveThetaToolsAtLoad`: `:1433` the
  `parseCalleeForTools` call, `:1438–1453` callee-has-errors, `:1476–1486`
  `resolveThetaCallee`, `:1490–1494` `resolveCallableSet`, `:1499` the
  registered predicate), `:1615–1641` (`parseCalleeForTools`, `:1621` the bare
  resolve, `:1622–1625` the read), `:1791–1829` (`parseCalleeTheta`, `:1827`
  the second `resolveThetaToolsAtLoad` call whose diagnostics are discarded);
  `src/parser/callable-set.ts:176–283` (`resolveCallableSet` and its six
  rejection arms), `:359–415` (`resolveEntry`, `.theta` arm `:382–414`),
  `:386–395` (the `unresolvable-theta-path` message rendering `<path>` as the
  entry spec);
  `src/runtime/invocation.ts:57` (`invokePathEscapeMessage`), `:98–126`
  (`checkInvokePathContainment`), `:142–147` (`canonicalizePath`), `:185–201`
  (`checkInvokePathAtLoad`), `:208–215` (`invokePathEscapeDiagnostic`),
  `:239–265` (`recheckInvokePathAtRuntime`);
  `src/extension/production-theta-producer.ts:3020–3036`
  (`#resolveCallAsInvoke`), `:3039–3096` (`#buildInvokeChild`), `:3106–3140`
  (`#driveCallee`, `:3116–3120` the INV-5-labelled comment, `:3137` the re-check
  call), `:3260–3281` (`#recheckCalleeContainment`, `:3266–3268` the
  seams-absent early return);
  `src/extension/invoke-static-checks.ts` — cited by symbol only
  (`checkInvokeStaticResolution` and its doc comment, the `invoke(...)` loop's
  `checkInvokePathAtLoad` call and escape `continue`, the `.theta`-callable
  loop, `collectCallSites`, `resolveThetaCallableCallSites`), because bug 0072
  is editing the file concurrently.
  Grep-derived claims: `grep -rn checkInvokePathAtLoad` (four `src/` hits — the
  header comment, the import, one call, the definition; two `tests/` hits);
  `grep -rn activeRoots src/` (no consumer on the `tools:` resolution path);
  `grep -ln activeRoots docs/bugs/*.md` (only 0008).
- Test and corpus evidence at `f8364db1`:
  `tests/invocation-core.test.ts:53–175` (the eight INV-1 cells over a
  `FakeFileSystem`, including the symlink-farm cell at `:74`; the only
  `invoke-path-escape` occurrences in `tests/`);
  `tests/theta-callable-call-arity.test.ts` (bug 0071's 39-cell witness and the
  `discoverAndComposeFixtures` + `ctx.ui.notify` harness this report's probe
  reuses; every callee it plants is in-root);
  `tests/production-tools-load-resolution.test.ts` (the shipped `tools:`
  load-resolution witness, no containment cell);
  `tests/callable-set.test.ts`, `tests/tools-entry-closed-grammar.test.ts`,
  `tests/tools-entry-closed-grammar-lockstep.test.ts`,
  `tests/tools-derived-name-shape.test.ts`, `tests/subagent-fn.test.ts` (the
  five files calling `resolveCallableSet` synchronously — the cost side of
  §Fix route B);
  the corpus census — `rg --files --glob '*.theta' --glob '*.thetalib'`
  (34 files), `rg -l '^tools:'` (14), `rg -n '^\s*-\s*.*\.theta'` (5 entries:
  `docs/examples/fan-out-reviews.theta:5`, `docs/examples/ralph.theta:7`,
  `docs/examples/refine.theta:5`, `docs/examples/typed-return.theta:5`,
  `docs/examples/typed-params-across-boundary.theta:5`), each callee confirmed
  present in `docs/examples/`.
- Reproduction: one scratch vitest at `f8364db1` — eight planted thetas over a
  `mkdtempSync` `.pi/theta/` workspace plus a second, undiscovered `mkdtempSync`
  directory holding the two out-of-root callees; the shipped
  `discoverAndComposeFixtures` load; three assertion cells (the exact registered
  set, exactly one containment notification and that it names the `invoke`
  surface's literal, exactly one arity notification naming the out-of-root
  callee) and an observable dump quoted verbatim above. Run on the output
  quoted, then deleted per scratch policy. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug doc are unmodified by this filing.
