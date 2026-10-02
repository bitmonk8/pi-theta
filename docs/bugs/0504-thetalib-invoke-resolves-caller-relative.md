# Bug 0504 — an `invoke(...)` inside an imported `.thetalib` `fn` resolves its callee path against the CALLING theta's directory, not the declaring `.thetalib` file's location: a lib-relative callee that exists beside the library fails `invoke_infra` "could not be loaded", and a same-named file beside the caller is silently invoked instead

- **Status:** open — filed 2026-10-02 from independent verification
  of the LPS process tooling (step-lane lane probes; repro under
  "Repro" below)
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
