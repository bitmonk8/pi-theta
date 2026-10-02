# Bug 0504 — an `invoke(...)` inside an imported `.thetalib` `fn` resolves its callee path against the CALLING theta's directory, not the declaring `.thetalib` file's location: a lib-relative callee that exists beside the library fails `invoke_infra` "could not be loaded", and a same-named file beside the caller is silently invoked instead

- **Status:** fixed (0.495.0) — filed 2026-10-02 from independent
  verification of the LPS process tooling (step-lane lane probes; repro
  under "Repro" below)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2 — S2: the documented library pattern (a
  shared `.thetalib` helper wrapping `invoke(...)` of a worker that sits
  beside the library) fails `Err(invoke_infra, cause: "load_failure")` for
  every importer that does not share the library's directory, after loading
  clean — and the failure is a WRONG-TARGET hazard, not just a refusal: the
  caller-relative resolution means a file with the callee's name beside the
  CALLING theta is loaded and invoked where the spec pins the library-side
  file, so two same-named workers in different discovery roots silently
  select by caller location (probe arm 6 below invokes a caller-side file
  through a lib fn whose own directory holds no such file — the spec says
  that path must not resolve). Masked whenever caller and library share a
  directory, which is why co-located layouts (callers in the same
  `thetaPaths` root as their lib) never see it. D2: the runtime already
  carries the declaring-module machinery this fix needs — bug 0303's
  `moduleEnv` rides every imported-fn activation and
  `LexicalEnvironment.currentResidence()` reads the executing body's
  declaring file — the invoke boundary just never consults it; the fix is
  threading the executing residence into the two resolution sites instead
  of the root theta's `sourcePath`; one new conformance cell per context
  (root / subagent caller × lib-relative / caller-relative shape).
- **Where (pi-theta, main 1d0ad2d4, 0.494.0):**
  - `src/extension/invoke-machinery.ts:121-124` — `resolveInvoke`'s own
    contract comment: "resolve+parse the callee against the caller's
    directory" — the caller-relative rule, stated as intended behaviour at
    the one seam every `invoke(...)` crosses, with no declaring-file arm.
  - `src/extension/invoke-machinery.ts:603` — `#parseCalleeOrErr` resolves
    the callee via `this.#input.parseCallee?.(theta.sourcePath, calleePath)`
    where `theta` is the CALLING theta's bind input: the resolution base is
    always the root/calling theta's `sourcePath`, never the `.thetalib`
    that lexically contains the `invoke` expression; `:609` mints the
    observed `invoke callee '<path>' could not be loaded`.
  - `src/extension/invoke-machinery.ts:699-703` — `#recheckCalleeContainment`
    uses the same base (`dirname(theta.sourcePath)`), so the INV-1 runtime
    containment recheck judges the wrong resolved path consistently.
  - The runtime KNOWS the declaring file at execution time:
    `src/runtime/statement-executor.ts:325-326` reads
    `moduleEnv.currentResidence()` (bug 0303's declaring-module carrier) to
    classify cross-file fn frames for INV-4 — the invoke effect dispatched
    from inside that fn body discards this and falls back to the root
    theta's identity.
- **Spec:** `docs/spec_topics/imports.md:17` — "May call `invoke(...)`.
  **The path resolves relative to the `.thetalib` file's location**; the
  invocation executes against the *calling* `.theta`'s conversation …" —
  the conversation/effect ANCHOR is caller-scoped, the PATH is
  declaring-file-scoped. The implementation scopes both to the caller.

## Symptom

A `.thetalib` fn wrapping `invoke("./worker.theta", …)`, with
`worker.theta` sitting beside the library, works for an importer in the
same directory and fails `Err(invoke_infra, cause: "load_failure",
message: "invoke callee './worker.theta' could not be loaded")` for an
importer one directory up — same library, same callee, same green load.
Conversely a file named `worker.theta` beside the CALLER is found and
invoked through a library whose own directory holds no such file.

## Expected (spec citations)

`imports.md:17`: the invoke path written in a `.thetalib` fn resolves
relative to that `.thetalib` file's location, regardless of which theta
imported the fn. Only the conversation anchor (which session the child
binds to / spawns from) follows the caller. The declaring-scope posture is
the same one imports.md pins for free names ("resolves in the DECLARING
`.thetalib`'s own scope … regardless of what the calling `.theta` …
happens to declare").

## Actual (implementation citations)

`invoke-machinery.ts:603` resolves every invoke callee against
`theta.sourcePath` — the calling theta — because the effect host carries no
record of the lexical file that contains the `InvokeExpr`; the containment
recheck (`:699-703`) and the load/parse classifier (`:609`) then operate on
that caller-relative path. Probe results (0.494.0, pi 0.87.x host,
2026-10-02):

| arm | shape | result |
|---|---|---|
| lib fn invoking `./rchild.theta` (exists beside the LIB only), caller one dir up | sequential AND inside `par for` | `Err(invoke_infra … could not be loaded)` |
| same, caller co-located with the lib (subagent worker) | sequential AND `par for` tail-call | works — returns the child's value |
| lib fn invoking `./rchild2.theta` that exists ONLY beside the CALLER | sequential | **loads and runs** (spec: must not resolve) |
| caller's own direct `invoke("./workers/rchild.theta")` | any | works (caller-relative is correct for caller-written paths) |

## Root cause

One resolution base for every `invoke(...)`: the conversation bind input's
`theta.sourcePath`. The executor's imported-fn activation knows the
declaring residence (`moduleEnv` / `currentResidence()`, bug 0303) but the
effect-host boundary (`resolveQuery`/`resolveInvoke` deps) does not thread
it to `InvokeMachinery`, so the machinery defaults to the only file it
holds — the caller's.

## Fix direction

Thread the executing body's residence (`env.currentResidence() ??
deps.file`) through the `resolveInvoke` seam as the path-resolution base,
keeping `theta` for the conversation/spawn anchor; apply the same base in
`#recheckCalleeContainment`. Cycle detection already "walks invoke paths
originating from thetalib functions" (imports.md:17), so the static walk's
base should be cross-checked for the same divergence (a static walk that
resolves lib-side edges lib-relatively while the runtime resolves them
caller-relatively can pass load and fail at runtime, which is the observed
shape: load green, runtime `load_failure`).

## Repro

`D:/UnitySrc/lps-build-scratch/repro-3/` (headless, no model turns in the
thetas; children are query-less subagents):

```
.pi/settings.json                  thetaPaths ["theta/workers"], placement pipe
.pi/theta/repro.theta              prompt-mode driver, imports both libs, 8 arms
.pi/theta/rchild2.theta            caller-side decoy (arm 6)
.pi/theta/workers/rlib.thetalib    via_lib(s)        = invoke("./rchild.theta")
                                   via_lib_schema(s) = invoke("./rchild-schema.theta")
.pi/theta/workers/rlib2.thetalib   via_lib2(s)       = invoke("./rchild2.theta")  [no such file in workers/]
.pi/theta/workers/rchild.theta     returns "got-" + s
.pi/theta/workers/rchild-schema.theta  returns ROut { tag, n }
.pi/theta/workers/rmid.theta       subagent: par tail-calls via_lib (co-located control)
.pi/theta/workers/rmid2.theta      subagent: par tail-calls via_lib_schema (co-located control)
```

Run: `pi --session-dir sessions -a -p "/repro"` with cwd = repro-3.
Observed (files the driver writes):

```
arm1-lib-tail.txt:  ok=INVERR:invoke_infra msg=invoke callee './rchild.theta' could not be loaded|…   (×2)
arm2-lib-let.txt:   same ×2
arm3-inline.txt:    ok=CHILD:got-a|ok=CHILD:got-b          (caller-written path: fine)
arm4-seq.txt:       ok=INVERR:invoke_infra msg=invoke callee './rchild.theta' could not be loaded
arm5-root-invoke.txt: ok=CHILD:got-d                       (caller-written path: fine)
arm6-caller-dir.txt:  ok=CHILD2:got-e                      (WRONG-TARGET arm: lib-side path resolved caller-side)
arm7-subagent-par-libfn.txt: ok=CHILD:got-w1|ok=CHILD:got-w2 / seq=CHILD:got-w3   (co-located: masked)
arm8-schema-par-libfn.txt:   ok=got-z1|ok=got-z2                                  (co-located: masked)
```

Arms 7/8 are additionally negative evidence for a separately-claimed
"par for body tail-calling an invoke-bearing imported fn yields Ok(null)"
defect: in the co-located layout the par tail-call of an invoke-bearing
lib fn returns correct typed values (string and schema alike) — no
`Ok(null)` was observed in any arm on this version.

## Fix (0.495.0)

- What shipped (keyed to §Fix direction):
  - `src/extension/invoke-machinery.ts` — `resolveInvoke` derives the
    PATH-resolution base as `env.currentResidence() ?? theta.sourcePath`
    (bug 0354's `moduleResidence` stamp, carried on bug 0303's `moduleEnv`)
    and threads it as an explicit `resolutionBase` parameter through
    `#buildInvokeChild` → `#driveCallee` → `#guardInvokeBoundary` into both
    `#parseCalleeOrErr` (the `parseCallee` base) and
    `#recheckCalleeContainment` (the INV-1 runtime re-check). One module
    helper, `resolveCalleeAgainstBase`, is the single construction point for
    the resolved callee path. `theta` stays the conversation/spawn anchor and
    the source of mode and frontmatter. `resolveCallAsInvoke` (the
    `.theta`-callable `tools:` route) passes `theta.sourcePath` explicitly:
    its path comes from the calling theta's own `tools:` list, and a
    `.thetalib` has no frontmatter.
  - `src/runtime/invoke-cancellation.ts` — optional
    `InvokeChild.resolvedCalleePath`, set by `#buildInvokeChild` from the same
    helper.
  - `src/runtime/effectful-statement-host.ts` — `wrapInvokeCalleeFailure`
    hands the SLSH-5 hop ledger `child.resolvedCalleePath ?? child.calleePath`,
    so `<callee_path>` names the file the boundary resolved, re-checked and ran
    (slash-invocation.md:64 requires the containment path). Without it a
    lib-body hop was dropped silently or named a caller-side decoy (review
    round 1, F1).
  - `src/extension/production-theta-producer.ts`,
    `src/runtime/invoke-provenance-ledger.ts` — doc-only (the hop ledger
    passes an absolute path through unchanged; production-theta-producer.ts
    line count unchanged at 1460).
  - `src/extension/production-producer-deps.ts`,
    `src/extension/production-composition.ts` — the `parseCallee` parameter
    renamed `callerPath` → `baseFile` and its contract restated (line counts
    unchanged at 548 / 5306).
  - Threading route chosen: the base is computed inside
    `InvokeMachinery.resolveInvoke` from the `env` the seam already carries;
    no host-deps signature changed.
  - Static cycle-walk cross-check: `buildInvokeGraph`
    (`src/extension/invoke-static-checks.ts`) walks only each discovered
    theta's own body (`collectInvokeExprs(input.body)`); it never visits an
    invoke site inside an imported `.thetalib` fn body. So the static walk has
    no lib edges at all, rather than lib edges on a different base. That gap is
    residual 4, not changed here.
- Gates:
  - Witness `tests/b0504-thetalib-invoke-resolves-lib-relative.test.ts`: RED
    at 64c6c2e9 (4 failed | 2 passed of the first 6 cells: (A)/(A-par)
    `invoke callee './child.theta' could not be loaded`, (B)
    `Ok("DECOY-BESIDE-CALLER")`, (D) `invoke path './child.theta' resolves
    outside every active discovery root`); GREEN after the fix (8 passed).
  - `npm test`: 714 files / 12023 tests passed.
  - `npm run typecheck`: exit 0. `npm run lint`: exit 0.
- Review: 2 rounds.
  - Round 1 (`bug-fix-reviewer`): FINDINGS — F1 correctness blocker (the
    SLSH-5 hop ledger still resolved a lib-body invoke against the calling
    theta), F2 prose (the `parseCallee` contract still said "caller"), F3
    prose (a doc claimed return-site resolution correctly stays on the caller),
    F4 prose (a dead symbol reference, comment placement, file vs directory,
    attribution), F5 test (no subagent-caller cell). All fixed in one
    `bug-fix-fixer` round; F1 gained witness cells (E1)/(E2), RED with F1
    neutralised and GREEN with it restored.
  - Round 2 (`bug-fix-reviewer-fast`): CLEAN. One cosmetic note: the trailing
    end-of-line parameter comment in `parseCalleeTheta` is the only one of its
    kind in that file.
- Verification: SOLID (`bug-fix-verifier`).
  - Witness genuineness: two byte-edit neutralisations (the residence read,
    and the hop-ledger hand-off) gave 6 failed | 2 passed (controls (C1)/(C2)
    green). Both files were restored byte-exact (`git hash-object`
    `67012756…` / `fb87105b…` matched the pre-edit hashes), then 8/8 passed.
  - Default suite: 714 / 12023 passed.
  - Live: H8a `tests/live/live-production-acceptance.test.ts` 90/90. H9a
    `tests/live/acceptance/` 57/58; the one red is area (f), whose ENOENT
    signature matches open bug 0495. A scratch live probe through the real
    `pi -p` host (root prompt-mode caller, and a subagent-mode caller in a real
    child process) passed 2/2 with the fix. With the residence read neutralised
    it failed 2/2 (`invoke of ./child.theta failed (load_failure)`). The probe
    was then restored, hash-verified and deleted.
  - Typecheck and lint: exit 0.
- Residuals:
  1. An invoked prompt-mode callee that attaches in-process gets no
     materialised imports: `parseCalleeTheta`'s return carries no `imports`, so
     a callee that calls its own imported fn fails `code_tool: code-side call
     names no resolvable host tool '<fn>'` (review round 1, R1).
     Pre-existing.
  2. `invoke<Schema>` written in a `.thetalib` fn body resolves `Schema`
     against the calling theta (`resolveReturnSite`'s `annotated` arm in
     `src/extension/invoke-return-validation.ts`), but imports.md:16 pins the declaring
     lib. Two symptoms: with no caller `ROut`, a wrong-shape child value comes
     back `Ok`; with a caller `schema ROut { other: boolean }`, a correct lib
     `ROut` fails `return_validation` (review round 1, R2). Pre-existing.
  3. SLSH-5 `<parent_path>` for a lib-body hop names the calling theta paired
     with the `invoke` token's line in the `.thetalib` (`#recordInvokeHop`'s
     `parentPath: sourcePath`); this needs a spec ruling on lib-body hops
     (review round 1, R3). Pre-existing.
  4. No load-time invoke check walks imported `.thetalib` fn bodies.
     `buildInvokeGraph` and `checkInvokeStaticResolution` both walk only
     `collectCallSites(input.body)`, and `import-static-checks.ts` has no
     invoke walk. Lib-body invoke sites therefore miss cycle detection
     (imports.md:17 "Cycle detection … walks invoke paths originating from
     thetalib functions too"), INV-1's load-time escape arm, INV-3 arity and
     the `invoke<Schema>` return-type check. A lib-edge walk must use the lib
     residence as its base (review round 1, R4). Pre-existing.
  5. `docs/spec_topics/invocation.md:10` and
     `docs/reference/discovery-cli.md:305-306` state caller-relative invoke
     resolution with no cross-reference to the `.thetalib` rule in
     imports.md:17 (review round 1, R5). Prose.
- Discharge notes appended: none. No filed doc claims the "par for body
  tail-calling an invoke-bearing imported fn yields `Ok(null)`" defect that
  arms 7/8 above disprove.
- Pinned dispositions / non-goals: caller-written invoke paths in a plain
  `.theta` stay caller-relative (cell (C2)); the `tools:`-callable route stays
  caller-relative; no new diagnostic code, and the H9a permitted-code list is
  untouched; the static walk gained no lib edges (residual 4).
