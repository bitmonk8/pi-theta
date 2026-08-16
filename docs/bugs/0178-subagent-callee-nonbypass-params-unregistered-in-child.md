# Bug 0178 — A `mode: subagent` callee whose `params:` block is not binder-bypass-eligible (a named `enum` or `schema` type, any non-`string` type, more than one field, any default) fails to register inside its own spawned child with `theta/load/binder-model-unresolved`, because the load-time binder-model gate is blind to the subagent-root regime that PIC-60 exempts from the binder entirely; the child's `-p "/<slug>"` then degrades to an ordinary user prompt, spends one unbudgeted model turn against the callee's own `--tools` allowlist, and exits 0 with no `theta_result` envelope — so the parent reports `subagent child exited without a return envelope: exited code 0`, an exit detail rather than the cause

- **Status:** open. §Fix is constraint-pinned, not settled: two candidate routes
  are named with their measured reach, and the choice between them decides
  whether a spec sentence moves and whether a registry row is added. Ordering:
  nothing blocks this report from starting. It **blocks the child-side half of
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)** —
  that report's `## Fix (0.97.0)` wired the marshalled-params intake through
  `bindParamsInbound` and recorded that no witness could be written for it
  because this defect kills the child (`.pi/tmp/fixes/0172-report.md`
  §*Residuals/notes* → *For the parent to file* item 1). The child-side
  projection stays unwitnessed until this lands.
- **Sev/Diff estimate:** S2/D3 — S2 because the primary observable is a **loud,
  fail-closed refusal of legal input**: the parent receives
  `Err(InvokeInfraError { kind: "invoke_infra", cause: "internal_error" })` with
  `message: "subagent child exited without a return envelope: exited code 0"`
  and the pinned `theta/runtime/subagent-exit-without-envelope` diagnostic
  (§Reproduction (a), (b)). No value is corrupted, no comparison flips, and
  PIC-59's never-fabricate-a-value rule holds. What is wrong is the *reason*:
  the message names an exit code where the cause is a load refusal in another
  process, and no channel the parent can read carries that refusal (measured:
  zero stderr lines, no `theta_result` line). The S1 reading is stated and
  rejected on a measured fact rather than on judgement — the S1 clause that
  fits is "leaks", because the failing child spends one full assistant turn on
  the literal text `/<slug>` (measured: 30–31 stdout event lines against 2 on a
  registered child, §Reproduction (b)) on a path PIC-60 exists to keep
  model-free, and that turn runs with whatever `--tools` allowlist the callee's
  own callable set produced (`assembleSubagentArgv`,
  `src/runtime/subagent-launcher.ts:443`); but the tools half is **traced from
  the argv assembly, not driven** — every fixture measured here ran under
  `--no-tools` — so it does not carry the band on its own. D3 because §Fix needs
  in-run adjudication: the gate is three lines
  (`src/extension/production-composition.ts:829–844`) but *what* it should be
  conditioned on is not settled (the whole child, or only the marked root slug),
  the route decides whether `docs/spec_topics/binder/binder-model-and-context.md:5`'s
  refusal condition gains a regime clause, and the second half — making a
  child-side load refusal of the marked root theta reach the parent at all —
  is a separate surface that may need its own registered code and is shared with
  [0179](./0179-array-sink-refuses-unresolvable-value-type.md).
- **Kind:** defect — a load-time precondition is enforced for a code path the
  process provably never takes, and its refusal reaches the caller as an
  unrelated exit detail. Two elements, each measured at HEAD `0d0f8a6d`,
  v0.97.0.
  1. *The binder-model load gate is regime-blind.* `runComposePass`
     (`src/extension/production-composition.ts:405`) classifies each parsed
     theta's bypass eligibility from its static `params:` fields
     (`:829–830`, over `classifyBinderBypass`,
     `src/binder/binder-envelope.ts:204`), resolves the binder model for every
     non-bypass theta (`:831–840`, over `resolveBinderModel`,
     `src/binder/binder-model.ts:179`), and `continue`s past registration when
     the two-step chain resolves to nothing (`:842–844`), emitting
     `theta/load/binder-model-unresolved` (`binder-model.ts:55`, `:193–205`).
     The same function has already detected the subagent-root regime 314 lines
     earlier (`:515`, `detectSubagentRootRegime`,
     `src/runtime/subagent-root-regime.ts:53`) and threads it into the producer
     (`:590`), but the gate reads none of it. Inside a spawned subagent child
     the binder is not merely unused — PIC-60 fixes that it is "skipped
     entirely" (`docs/spec_topics/pi-integration-contract/subagent.md:99`) and
     the child-side intake binds the marshalled params directly
     (`#intakeSubagentRootParams`,
     `src/extension/production-theta-producer.ts:2046`; the intake call at
     `:2166`; the projection at `:2180`). The precondition is enforced against
     a call that cannot occur.
  2. *An unregistered marked root slug degrades to a model prompt and a silent
     exit 0.* The launch contract sends the callee slug as `-p "/<slug>"`
     (`subagent.md:47`; `assembleSubagentArgv`, `subagent-launcher.ts:380`, the
     push at `:429–437`). When the child refused to register that slug, the
     argument is no longer a slash command: the host treats it as ordinary
     prompt text, runs one assistant turn, and exits 0. The theta runtime in the
     child emits nothing — `driveSubagentRootRegime`
     (`production-theta-producer.ts:2112`) is never entered, so no `theta_result`
     line is written on either arm — and the parent's `driveSubagentChild`
     (`src/runtime/subagent-json-driver.ts:87`) takes its no-envelope exit path
     (`:141`) and mints
     `theta/runtime/subagent-exit-without-envelope`
     (`src/runtime/subagent-envelope.ts:83`). Measured: zero stderr lines on
     every failing run, so the `hint` slot that would carry a last-stderr line
     is empty too.
- **Related:**
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open** (face 1 fixed at 0.97.0, commit `c2d22aad`). **This report is that
    fix's residual 1**, recorded in its report but not filed there (a fix run
    creates no bug docs). 0172's face-1 fix routed the child-side marshalled-params
    projection through `bindParamsInbound`
    (`src/runtime/inbound-boundary.ts:114`), and its own witness file states why
    that leg could not be pinned: "a `params:` field declared as a named `enum`
    or a named `schema` on a `mode: subagent` callee makes the grandchild exit 0
    with no `theta_result` envelope, so the intake's binding is never
    observable" (`tests/inbound-boundary-binder-args.test.ts:81–83`, inside its
    §*THE CHILD SIDE IS NOT WITNESSED HERE* paragraph, `:76–85`).
    **Boundary.** 0172 owns whether the inbound translation pass runs at a
    boundary; this report owns whether the process that would run it ever starts
    its theta. The two are disjoint on mechanism — §Reproduction (c) measures
    `bindParamsInbound` binding all three subject shapes correctly in-process,
    including the two whose child dies — and disjoint on fix surface (0172 adds
    call sites in the runtime; this report changes a load-pass gate in the
    composition root).
  - **0179** —
    [`0179-array-sink-refuses-unresolvable-value-type.md`](./0179-array-sink-refuses-unresolvable-value-type.md),
    **open**, filed concurrently from the same fix's residual 2. **Same
    surfacing, different cause, and together they define the class.** 0179's
    subject is `decide`'s array arm refusing a nominal operand at parse time
    (`src/parser/type-compat.ts:213–215`); its §Reproduction (b) observes the
    same spawned-child exit-0-without-envelope and records that "what is lost is
    the refusal's reason, not the value". The class both instances belong to is
    stated here rather than there: **any** load- or parse-time refusal of the
    marked root theta inside a spawned child degrades to an exit detail in the
    parent, because the child's diagnostic channel is process-local and the
    envelope is written only from inside `driveSubagentRootRegime`. 0179
    deliberately does not claim that degradation as a defect; §Fix element (b)
    here does. The two fixes are disjoint in `src/` and neither changes the
    other's verdicts.
  - **0002** —
    [`0002-subagent-child-hangs-under-acceptance-pi-p.md`](./0002-subagent-child-hangs-under-acceptance-pi-p.md),
    **fixed (0.12.0)**, the precedent for this failure shape. Its defect 2 is
    the same class one level out: a child that binds a *different* theta build
    than the parent believes, observable to the parent only as a wrong or absent
    result. Its fix produced the `#subagent-child-pins` obligations this
    report's probe satisfies, and its investigation
    (`docs/bugs/0002-investigation.md`) is where
    `theta/runtime/subagent-exit-without-envelope` was first used as a triage
    signal that names an exit and not a cause.
  - **0065** —
    [`0065-anthropic-overflow-status-gate-unsatisfiable.md`](./0065-anthropic-overflow-status-gate-unsatisfiable.md),
    **open.** Not touched. Named only to record that no live provider surface is
    involved here: every measurement below is offline except the wasted turns
    the defect itself causes, and no overflow, retry or provider-error path is
    reached.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift. At this
    HEAD `src/extension/production-theta-producer.ts` is 6277 lines and
    `src/extension/production-composition.ts` is 2567, and every open report
    inserts into both, which is why each volatile position below is named by
    symbol beside its line and stamped with the commit it was read at.
- **Affected** (every citation re-verified against the tree at HEAD `0d0f8a6d`,
  v0.97.0; symbols named beside lines):
  - **The gate.** `runComposePass`
    (`src/extension/production-composition.ts:405`) and its registration loop
    (`:684`, `for (const input of parsedInputs)`); the bypass classification
    (`:829–830`); the `resolveBinderModel` call (`:831–840`); the diagnostic
    emission (`:841`); the refusal (`:842–844`, `continue`). The regime the gate
    does not read: `detectSubagentRootRegime(readParentEnv())` (`:515`) and its
    hand-off to the producer (`:590`).
  - **The bypass classification.** `classifyBinderBypass`
    (`src/binder/binder-envelope.ts:204`): the no-params arm (`:209–211`), the
    single-string arm (`:212–223` — exactly one field, type `string`, no
    default, not optional, not nullable), and the `binder` fallthrough
    (`:224`) every other shape reaches.
  - **The resolution.** `resolveBinderModel` (`src/binder/binder-model.ts:179`),
    its bypass short-circuit (`:185–187`, `{ resolved: true, diagnostics: [] }`),
    the two-step chain (`:192`) and the unresolved arm (`:193–205`);
    `BINDER_MODEL_UNRESOLVED_CODE` (`:55`) and
    `BINDER_MODEL_UNRESOLVED_MESSAGE` (`:70`).
  - **The launch contract the refusal breaks.** `assembleSubagentArgv`
    (`src/runtime/subagent-launcher.ts:380`), the `-p` / `/<slug>` push
    (`:429–437`), and the callable-set flags (`:440–444` — `--no-tools` for an
    empty set, `--tools <names>` otherwise). The callable names those flags
    carry are the callee's own (`emptyCallableSet`,
    `src/extension/production-theta-producer.ts:1756`; `tools: callableNames`,
    `:1914`). `launchSubagentChild` (`subagent-launcher.ts:568`) and
    `buildSubagentChildEnv`'s root-marker write (`:466`, the write at `:480`,
    over `SUBAGENT_ROOT_ENV_MARKER`, `src/runtime/subagent-root-regime.ts:41`).
    `marshalParams` (`src/runtime/subagent-params.ts:153`), whose env patch the
    probe below reproduces byte-for-byte.
  - **The child-side path that is never entered.** `isSubagentRootFor`
    (`src/extension/production-theta-producer.ts:2093`),
    `driveSubagentRootRegime` (`:2112`), `#intakeSubagentRootParams` (`:2046`),
    the intake call (`:2166`) and the `bindParamsInbound` projection (`:2180`);
    `intakeChildParams` (`src/runtime/subagent-params.ts:283`) and
    `bindParamsInbound` (`src/runtime/inbound-boundary.ts:114`). The dispatch
    that selects it (`src/extension/theta-composition-producer.ts:376–379`)
    runs only for a theta that registered.
  - **The parent's mapping.** `driveSubagentChild`
    (`src/runtime/subagent-json-driver.ts:87`), its stdout envelope scan
    (`:108–139`) and its no-envelope exit arm (`:141`);
    `SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE`
    (`src/runtime/subagent-envelope.ts:83`).
  - **The parent-side callee resolution that admits the callee anyway.**
    `src/parser/callable-set.ts` gates a `tools:` `.theta` entry on path
    resolution, `mode:` (`theta/load/prompt-mode-callable`, `:408`) and rename
    validity, and contains no binder-model or bypass reference at all
    (`rg -n "binder|bindModel" src/parser/callable-set.ts` → no matches at this
    HEAD). The parent therefore accepts the callee as callable, spawns for it,
    and learns only from the exit code that the child refused it.
  - **Spec.**
    `docs/spec_topics/binder/binder-model-and-context.md:5` (the refusal rule
    and its bypass condition — the sentence a route may have to amend);
    `docs/spec_topics/binder/binder-bypass-and-envelope.md:6` (the two bypass
    cases are decided "at theta-load time from the static schema"), `:10`
    (no-params bypass), `:11` (single-string bypass), `:13` ("All other
    shapes — multiple fields, non-string types, defaults present, optional or
    nullable types — go through the binder");
    `docs/spec_topics/pi-integration-contract/subagent.md:93` (PIC-60 header),
    `:99` (the binder "is skipped entirely" on the marshalled path), `:31`
    (PIC-58, the regime and its env-marker selection rule), `:47` (the launch
    contract row `-p "/<slug>"`, one invocation per process), `:101` (PIC-59,
    the envelope), `:113` (the fail-closed child-exit-without-envelope rule and
    its `crash, kill, timeout` enumeration);
    `docs/spec_topics/invocation.md:36` (INV-5, the same rule from the caller's
    side);
    `docs/spec_topics/diagnostics/code-registry-load.md:34`
    (`theta/load/binder-model-unresolved`'s registered row);
    `docs/spec_topics/diagnostics/code-registry-runtime.md:30`
    (`theta/runtime/subagent-exit-without-envelope`'s row, whose Description
    reads "crash, kill, or teardown timeout");
    `docs/spec_topics/discovery/package-and-settings.md:67` (`theta.binderModel`
    "**Required when any non-bypass theta is in scope**"). Reference mirrors:
    `docs/reference/frontmatter.md:48`, `docs/reference/discovery-cli.md:143–144`,
    `docs/reference/diagnostics.md:203`.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; 17 declare `params:`; 15 of those are `mode: subagent`. Exactly two
    are non-bypass: `docs/examples/arg-binding.theta` (two `string` fields;
    carries `bind_model: claude-haiku`) and `docs/examples/import-thetalib.theta`
    (one field typed as the named schema `Author`, **no `bind_model:`**). Every
    remaining subagent theta is single-string or no-params. Decisively: **every
    shipped `tools:` `.theta` callee is single-string-bypass** —
    `ralph.theta` → `ralph-step.theta` (`objective: string`),
    `refine.theta` → `reviewer.theta` (`draft: string`),
    `typed-return.theta` → `sentiment.theta` (`text: string`),
    `typed-params-across-boundary.theta` → `summarise-doc.theta`
    (`document: string`) — so no shipped example spawns a child that can hit
    this.
  - **Committed coverage of the class, counted at HEAD.** No committed test
    drives a spawned subagent child whose callee declares a non-bypass
    `params:` block. The four files that reach a real child spawn
    (`tests/subagent-child-real-spawn.test.ts`,
    `tests/subagent-invoke-inbound-enum-tag.test.ts`,
    `tests/inbound-boundary-theta-callable.test.ts`,
    `tests/subagent-theta-roots-forwarding.test.ts`) declare no `params:` on any
    fixture. The only non-bypass committed fixture,
    `tests/live/acceptance/fixtures/acc-params-binder.theta`
    (`topic: string`, `count: number = 3`), is `mode: prompt` and carries
    `bind_model: anthropic/claude-sonnet-5`, so it is never spawned and never
    unresolved. `tests/binder-model-resolution.test.ts` (11 tests) and
    `tests/binder-bypass-envelope.test.ts` (15 tests) pin the gate's own
    behaviour in isolation and say nothing about the regime.
- **Observed at:** v0.97.0 (`0d0f8a6d`). One scratch vitest probe, written for
  this filing, run, and deleted; the tree carried no scratch file of mine before
  or after. It drove **real spawned `pi` children through the production launch
  path** (`launchSubagentChild` + `createProductionSpawnFn` +
  `driveSubagentChild`) with all three `AGENTS.md` `#subagent-child-pins` set —
  `process.argv[1]` replaced by the repo's own pi CLI entry through the injected
  `ExecutableHost`, `PI_THETA_SUBAGENT_EXTENSION_PIN` naming this working tree's
  `extensions/`, and `parentPid: process.pid` written beside it so the
  AUTHENTICATED control plane (`subagent.md:76`) did not strip the pin. Every
  theta body is a pure tail expression, so **a child that registers its slug
  spends no model turn**; the failing children each spent exactly one, which is
  the defect and not the harness. Part (c) is in-process over the shipped seams.
  Every value quoted below is that probe's output.
  `~/.pi/agent/settings.json` is `{}` at measurement time and no
  `.pi/settings.json` exists in this repository, so `theta.binderModel` is
  absent — the condition `docs/spec_topics/discovery/package-and-settings.md:67`
  names as making the setting required.

## Summary

PIC-60 (`subagent.md:93`, `:99`) exists so that a subagent callee's params never
re-enter the binder: "Routing them through the slash string `-p "/<slug> …"`
would re-enter the binder — a model turn — and lose typing", so the runtime
marshals them structurally and "The **binder is skipped entirely** on the
marshalled path". The child-side implementation matches:
`driveSubagentRootRegime` intakes the marshalled JSON, validates it against the
callee's own `params:` schema, and binds it directly with the binder bypassed
(`production-theta-producer.ts:2112`, `:2166`, `:2180`).

The load pass that runs first in that same child does not know this. For every
theta whose `params:` is not bypass-eligible it resolves a binder model
(`production-composition.ts:829–840`) and, when the two-step chain
`bind_model:` → `theta.binderModel` yields nothing, refuses to register the
theta (`:842–844`). Bypass eligibility is narrow by specification
(`binder-bypass-and-envelope.md:13`): anything other than no params or exactly
one default-free `string` field goes through the binder. A `params:` field
typed as a named `enum` or a named `schema` is therefore non-bypass — and so is
`array<string>`, and so are two `string` fields.

The child is launched with `-p "/<slug>"` (`subagent.md:47`). With the slug
unregistered that argument is no longer a command: the host sends it to the
model as prompt text, one assistant turn runs, and the process exits 0. Nothing
theta owns is written to stdout or stderr. The parent maps the missing envelope
fail-closed — correctly, per PIC-59 — and reports

```
theta/runtime/subagent-exit-without-envelope:
  subagent child exited without a return envelope: exited code 0
```

Measured differentially at HEAD, holding everything but the callee's `params:`
type constant:

| callee `params:` | bypass class | `bind_model:` | outcome |
| --- | --- | --- | --- |
| `sev: string` | single-string | absent | `Ok("high")`, 2 stdout lines |
| `sev: Sev` (named enum) | binder | absent | exit-without-envelope, 31 stdout lines |
| `box: Box` (named schema) | binder | absent | exit-without-envelope, 30 stdout lines |
| `xs: array<string>` | binder | absent | exit-without-envelope, 30 stdout lines |
| `sev: Sev` | binder | `anthropic/claude-haiku-4-5` | `Ok("high")`, 2 stdout lines |
| `box: Box` | binder | `anthropic/claude-haiku-4-5` | `Ok("w")`, 2 stdout lines |
| `xs: array<string>` | binder | `anthropic/claude-haiku-4-5` | `Ok("a")`, 2 stdout lines |

The stdout-line count is the model-turn observable: 2 lines is the session line
plus the envelope, with no turn; 30–31 lines is a full streamed assistant turn.
The bottom three rows are the decisive control — the same three non-bypass
shapes, the same marshalled params, the same intake, differing only in whether
a binder model resolves at load. The binder still never runs on any of them.

`array<string>` failing alongside the two named types is what fixes the subject:
this is not about named types. The trigger is the bypass class, and the
bug-0172 differential that first observed it (`string` vs `Sev` vs `Box`)
happened to use a bypass-eligible control.

The child-side seam 0172's fix wired is not implicated. Driven in-process over
the shipped code (§Reproduction (c)), `bindParamsInbound` binds all three
subject shapes correctly, including the two whose spawned child dies.

## Reproduction

Offline except for the model turns the defect itself causes, deterministic, at
HEAD `0d0f8a6d`. Each `driveDirect(...)` below launches one real `pi` child
through `launchSubagentChild` with the production spawn function and drives it
with `driveSubagentChild`; `PI_THETA_PARAMS` carries exactly what `marshalParams`
(`src/runtime/subagent-params.ts:153`) would have written on the env channel.

### (a) The reported production surface — a `tools:`-named callee, through a grandchild spawn

Root theta (`mode: subagent`, no `params:`, so it registers) with
`tools: - ./<callee>.theta`, body `let r = <callee>(…)` then `r?`. The harness
drives the root; the root spawns the callee as its own child.

```
top_kidstr  (params: sev: string)
     ok=true payload="high"
     exit={"code":0,"signal":null} stdoutLines=2 stderrLines=0
     diags=[]

top_kidenum (params: sev: Sev)
     ok=false payload={"kind":"invoke_infra",
       "message":"subagent child exited without a return envelope: exited code 0",
       "callee_path":"…\\thetas\\kidenum.theta","cause":"internal_error"}
     exit={"code":0,"signal":null} stdoutLines=4 stderrLines=0
     diags=[]

top_kidsch  (params: box: Box)
     ok=false payload={"kind":"invoke_infra",
       "message":"subagent child exited without a return envelope: exited code 0",
       "callee_path":"…\\thetas\\kidsch.theta","cause":"internal_error"}
     exit={"code":0,"signal":null} stdoutLines=4 stderrLines=0
     diags=[]
```

`diags=[]` at the harness because the `subagent-exit-without-envelope`
diagnostic is emitted inside the root child, one process below. This reproduces
the bug-0172 report's observation verbatim, including the empty diagnostic
drain.

### (b) The same callees driven DIRECTLY as the harness's own child

The dying process is now the harness's own child, so its exit, stderr and stdout
are readable and the parent-side diagnostic is collected.

```
pstr    PI_THETA_PARAMS={"sev":"high"}
     ok=true payload="high"
     exit={"code":0,"signal":null} stdoutLines=2 stderrLines=0
     diags=[]

penum   PI_THETA_PARAMS={"sev":"high"}
     ok=false payload={"kind":"invoke_infra",
       "message":"subagent child exited without a return envelope: exited code 0",
       "callee_path":"…\\thetas\\penum.theta","cause":"internal_error"}
     exit={"code":0,"signal":null} stdoutLines=31 stderrLines=0
     diags=["theta/runtime/subagent-exit-without-envelope: subagent child exited
             without a return envelope: exited code 0"]

psch    PI_THETA_PARAMS={"box":{"who":"w"}}
     ok=false  (same carrier, callee_path …\psch.theta)
     exit={"code":0,"signal":null} stdoutLines=30 stderrLines=0

parr    PI_THETA_PARAMS={"xs":["a"]}
     ok=false  (same carrier, callee_path …\parr.theta)
     exit={"code":0,"signal":null} stdoutLines=30 stderrLines=0

penumbm PI_THETA_PARAMS={"sev":"high"}          bind_model: anthropic/claude-haiku-4-5
     ok=true payload="high"
     exit={"code":0,"signal":null} stdoutLines=2 stderrLines=0  diags=[]

pschbm  PI_THETA_PARAMS={"box":{"who":"w"}}     bind_model: anthropic/claude-haiku-4-5
     ok=true payload="w"
     exit={"code":0,"signal":null} stdoutLines=2 stderrLines=0  diags=[]

parrbm  PI_THETA_PARAMS={"xs":["a"]}            bind_model: anthropic/claude-haiku-4-5
     ok=true payload="a"
     exit={"code":0,"signal":null} stdoutLines=2 stderrLines=0  diags=[]
```

Every fixture body is a pure tail expression (`sev`, `box.who`, `xs[0]`). The
`bind_model:` rows are byte-identical to the failing rows apart from that one
frontmatter line, and they return the marshalled param's value through the
envelope — so the intake, the validation and the binding all work; only
registration was missing.

**The refusal is not readable from the parent.** On every failing run
`stderrLines=0` and no line of stdout carries a `theta_result` key. The refusal's
text is observable only inside the child's own assistant turn — the turn the
defect causes — where the model, handed the load diagnostics as context, reasons
about "unresolved binder model errors needing a `bind_model` setting". By the
time that text exists on the wire, the wasted turn has already started.

**Two further failing-arm probes, same result, recorded to bound the cause.**
`penum` driven with a schema-invalid payload (`{"sev":"zzz"}`) and with the
params carrier entirely absent both produce the identical
exit-without-envelope carrier and `exit code 0`. Neither reaches
`intakeChildParams`' validation refusal
(`theta/runtime/subagent-params-validation-failed`), which is what a failure
inside the intake would have produced. The theta never runs at all.

### (c) The child-side intake seam, in-process — not implicated

The shipped seams over the same fixtures: the real `parseThetaDocument`, the
real `params:` lowering, the real `classifyBinderBypass`, the real
`buildInboundTranslationPlan`, and the real `bindParamsInbound` 0172's fix
wired.

```
pstr     diags=[] bypass={"kind":"single-string-bypass","wireName":"sev"}
  lowered {"type":"object","properties":{"sev":{"type":"string"}},
           "required":["sev"],"additionalProperties":false}
  plan.rootDef=#root sidecars=["#root"]   bound=[["sev","high"]]

penum    diags=[] bypass={"kind":"binder"}
  lowered {"type":"object","properties":{"sev":{"$ref":"#/$defs/Sev"}},
           "required":["sev"],"additionalProperties":false,
           "$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
  plan.rootDef=#root sidecars=["Sev","#root"]   bound=[["sev","high"]]

psch     diags=[] bypass={"kind":"binder"}
  lowered {"type":"object","properties":{"box":{"$ref":"#/$defs/Box"}},
           "required":["box"],"additionalProperties":false,
           "$defs":{"Box":{"type":"object","properties":{"who":{"type":"string"}},
                           "required":["who"],"additionalProperties":false}}}
  plan.rootDef=#root sidecars=["Box","#root"]   bound=[["box",{"who":"w"}]]

parr     diags=[] bypass={"kind":"binder"}
  lowered {"type":"object","properties":{"xs":{"type":"array","items":{"type":"string"}}},
           "required":["xs"],"additionalProperties":false}
  plan.rootDef=#root sidecars=["#root"]   bound=[["xs",["a"]]]
```

Every shape parses with zero diagnostics, lowers to a closed document, derives a
plan and binds. `bypass` is `{"kind":"binder"}` for exactly the three shapes
whose child dies and `single-string-bypass` for the one that lives — the
classification is the discriminator, and it is computed from the static
`params:` schema with no reference to `mode:` or to the regime.

## Expected behaviour

- **`docs/spec_topics/pi-integration-contract/subagent.md:99` (PIC-60)** — "The
  **binder is skipped entirely** on the marshalled path: binder inference
  remains exclusive to human slash invocation". A precondition whose only
  purpose is to make a binder call possible has nothing to guard on a path the
  same document says never makes one. `:93` states the motive the defect
  defeats: routing params through the slash string "would re-enter the binder —
  a model turn"; the defect produces a model turn anyway, and one that is not
  even a binder turn.
- **`docs/spec_topics/pi-integration-contract/subagent.md:31` (PIC-58)** — the
  subagent-root regime is "the invocation regime of a `mode: subagent` theta
  that is the root theta of its own child `pi` process", selected by the
  parent-set env marker. The regime is a first-class, load-time-detectable
  property of the process (`production-composition.ts:515` detects it before the
  registration loop at `:684`). Registration deciding a theta's fate without
  consulting it is what makes the child refuse the one theta it was launched to
  run.
- **`docs/spec_topics/pi-integration-contract/subagent.md:47`** — the launch
  contract binds "the callee slug" to `-p "/<slug>"`, "one invocation per
  process". The argv is the whole of the child's instruction. A child that
  cannot honour it is specified nowhere to reinterpret it as prompt text.
- **`docs/spec_topics/pi-integration-contract/subagent.md:113` (PIC-59)** — "A
  child that exits without emitting an envelope (**crash, kill, timeout**) MUST
  map to `Err(InvokeInfraError { cause: "internal_error", ... })` with the exit
  detail — never a fabricated value". The enumeration is crash, kill and
  timeout. A clean exit 0 after a completed model turn is none of the three, and
  the "exit detail" the rule prescribes carries no information about it.
  `docs/spec_topics/invocation.md:36` (INV-5) states the same rule from the
  caller's side with the same three-item parenthetical.
- **`docs/spec_topics/diagnostics/code-registry-runtime.md:30`** — the
  `theta/runtime/subagent-exit-without-envelope` row's Description reads "The
  subagent child process exited (**crash, kill, or teardown timeout**) without
  emitting a `theta_result` envelope", with "`message` carries the exit detail
  (code / signal / 'killed after teardown timeout')". The row does not describe
  what is happening here, and its Message column has no slot that could.
- **`docs/spec_topics/binder/binder-model-and-context.md:5`** — "When neither
  source resolves and the theta is not bypass-eligible …, the theta fails to
  load with `theta/load/binder-model-unresolved`; the theta is reported through
  the diagnostics channel and its slash command is **not** registered." This is
  the rule the implementation follows exactly. It is written for the slash
  surface — the surface the binder serves — and says nothing about a process
  whose only invocation is a marshalled one. Whether it gains a regime clause is
  §Fix (a)'s question.
- **`docs/spec_topics/binder/binder-bypass-and-envelope.md:13`** — "All other
  shapes — multiple fields, non-string types, defaults present, optional or
  nullable types — go through the binder." This bounds the defect's domain
  exactly and is why `array<string>` fails beside the two named types.

## Actual behaviour / root cause

**1. Registration is gated on a capability the process does not need.** The
composition root's per-theta loop (`production-composition.ts:684`) reaches, for
every parsed theta:

```ts
const bypassEligible =
  classifyBinderBypass(input.frontmatter.params?.fields).kind !== "binder";
const binderModelResolution = resolveBinderModel({ …, bypassEligible, … });
sink.emitGroup(binderModelResolution.diagnostics);
if (!binderModelResolution.resolved) {
  // A non-bypass theta with no resolvable binder model fails to load.
  continue;
}
```

`resolveBinderModel` returns `{ resolved: true, diagnostics: [] }` immediately
for a bypass-eligible theta (`binder-model.ts:185–187`) and otherwise resolves
the chain and mints the refusal (`:193–205`). The `continue` skips every
remaining step, registration included. Nothing in the expression consults
`mode:`, and nothing consults the regime the same function detected at `:515`.

**2. The bypass classification is narrow, and correctly so.**
`classifyBinderBypass` (`binder-envelope.ts:204`) admits exactly two shapes: no
fields (`:209–211`) and one non-defaulted, non-optional, non-nullable field
whose type is the literal string `"string"` (`:212–223`). A named `enum`, a
named `schema`, `array<string>`, two fields, or one field with a default all
reach `{ kind: "binder" }` (`:224`). Measured in §Reproduction (c). The
classification is right for the slash surface. Inside a child it is the wrong
question.

**3. The child's instruction is argv, and argv is not validated against
registration.** `assembleSubagentArgv` (`subagent-launcher.ts:380`) pushes
`-p` and `/${input.slug}` (`:433`) and then the callable-set flags (`:440–444`).
Nothing downstream confirms that `/<slug>` names a registered command in the
child, and nothing can: registration happens inside the child, after the argv is
fixed. When it did not happen, the host's ordinary handling of an unrecognised
leading-slash prompt applies and the text is sent to the model.

**4. The theta runtime in the child never gets to speak.** The envelope is
written only from `driveSubagentRootRegime`
(`production-theta-producer.ts:2112`), which is reached through
`theta-composition-producer.ts:376–379` — the composed theta's own bind path.
An unregistered theta has no bind path, so neither the `Ok` arm nor any of the
`Err` arms (including the params-validation refusal at `:2167–2170`) can fire.
The load diagnostic goes to the child's own `LoadDiagnosticSink` and stays in
that process. Measured: zero stderr lines and no `theta_result` line on every
failing run, so the `hint` slot `driveSubagentChild` fills from the last stderr
line (`subagent-json-driver.ts:104–106`) is empty as well.

**5. The parent's mapping is correct and uninformative.**
`driveSubagentChild`'s exit arm (`:141`) is the specified fail-closed path and
it does not fabricate a value. Its message is built from the exit detail alone,
so a load refusal in another process is rendered as `exited code 0` — a phrase
that reads as a successful termination and matches none of PIC-59's three named
causes. An operator following it looks for a crash that did not happen.

**6. The parent had already accepted the callee.** A `tools:` `.theta` entry is
resolved by `src/parser/callable-set.ts`, which checks the path, the callee's
`mode:` and the rename target and holds no binder-model or bypass concept at
all. So the parent registers the calling theta, presents the callee as a
callable, spawns a process for it, and only the exit code reports that the child
disagreed. The disagreement is not even stable across machines: it is decided by
`theta.binderModel`, a setting read from `~/.pi/agent/settings.json` and
`<cwd>/.pi/settings.json` (`package-and-settings.md:67`), so the same theta pair
runs on one install and fails on another.

**7. The wasted turn is unbudgeted and carries the callee's tools.** The child
was launched with `--tools <callee's callable names>` whenever that set is
non-empty (`subagent-launcher.ts:440–444`, fed by
`production-theta-producer.ts:1756` and `:1914`). The turn that runs on the
literal text `/<slug>` therefore runs with those tools active. Every fixture
measured here had an empty callable set, so this arm is **traced from the argv
assembly, not driven**; what is measured is that a full assistant turn happens
at all (30–31 stdout event lines against 2), on a path PIC-60 exists to keep
model-free.

## Why it matters

- **A spec-sanctioned program cannot execute, and its failure names the wrong
  thing.** `docs/examples/typed-params-across-boundary.theta`'s own description
  is "Pass a typed (possibly large) string param to a subagent"; its prose
  promises "no loss of typing". A callee whose param is typed as a declared
  `schema` or `enum` — the typing the language exists to provide — cannot be
  invoked as a subagent at all unless a binder model happens to resolve, and the
  author's only evidence is `exited code 0`.
- **The condition is an unrelated setting.** `theta.binderModel` exists to serve
  the human slash binder. Whether it is set decides whether a marshalled,
  binder-free process boundary works. Nothing tells an author that, and the
  setting's own documentation (`package-and-settings.md:67`) frames its
  requirement in terms of "any non-bypass theta … in scope", which on the child
  side means a theta that will never call the binder.
- **The failure spends provider budget on a private transcript.** The child's
  session is `--no-session` and its transcript is discarded (PIC-58). The turn
  it runs is therefore invisible after the fact, is attributable to no theta,
  and — traced from the argv assembly — would carry the callee's own tool
  allowlist. The one design goal PIC-60 states for the marshalled channel is
  avoiding exactly one model turn.
- **It costs the corpus a witness.** Bug 0172's face-1 fix wired the child-side
  marshalled-params projection through `bindParamsInbound` and could not pin it;
  its own witness file records why in a comment
  (`tests/inbound-boundary-binder-args.test.ts:81–83`). That leg stays untested
  until this is fixed.
- **It is the second instance of one unnamed class.**
  [0179](./0179-array-sink-refuses-unresolvable-value-type.md) reaches the same
  exit-0-without-envelope through a parse-time refusal instead of a load-time
  one. Two independent causes producing one indistinguishable symptom is what
  makes the symptom worth its own fix element: any future child-side refusal
  will present identically.
- **Nothing gates it.** Every shipped `tools:` `.theta` callee is
  single-string-bypass (census above), and no committed test spawns a child
  whose callee declares a non-bypass `params:` block. The two committed test
  files that exercise the binder-model gate drive it in isolation, with no
  process and no regime.

## Fix

Not settled. Two elements are pinned below. Element (a) is the defect proper and
carries a route choice; element (b) is the surfacing degradation the class needs
and is shared with 0179. Every route carries the constraints in (c).

### (a) The gate must not refuse the theta the child was launched to run

The load-time binder-model resolution serves the slash binder. Inside a spawned
subagent child the binder is unreachable by specification
(`subagent.md:99`), so the refusal must not apply. The regime is already in
scope at the decision site — `runComposePass` binds it at
`production-composition.ts:515` and the loop that refuses is at `:684` — so the
change is local; what needs adjudication is its *scope*:

1. **Root-slug only.** Skip binder-model resolution for the single theta whose
   slash name equals `subagentRootRegime.slug`, exactly matching
   `isSubagentRootFor`'s own test (`production-theta-producer.ts:2093`).
   Narrowest, and it leaves every other theta in the child under the ordinary
   rule. It also leaves a residue: a nested `mode: subagent` callee registered in
   the same child spawns its own grandchild and is likewise never bound by the
   binder there, so the same refusal can still fire one level down.
2. **Whole child.** Skip resolution for every theta whenever the regime is
   active, on the ground that a subagent child runs exactly one invocation
   (`subagent.md:47`) and that invocation is marshalled. Covers the nested case
   in (1) by construction. It is the broader claim and needs the argument
   written down, because it asserts that no theta in a subagent child can ever
   reach the binder.

A route states which it takes and why, and states whether
`binder-model-and-context.md:5`'s refusal condition (currently "the theta is not
bypass-eligible") gains a regime clause — if the behaviour is conditioned on the
regime, the sentence that fixes the behaviour must say so, or the spec and the
implementation disagree in the other direction.

### (b) A child-side refusal of the marked root theta must reach the parent

Independently of (a), a child that refuses to register its marked root slug
today exits 0 with nothing on any channel, and the parent renders that as an
exit detail. The composition root knows both facts at the moment of refusal: it
holds `subagentRootRegime.slug` (`:515`) and it is deciding about that very
theta (`:842`). The remedy shape is to emit a `theta_result` `err` envelope
naming the refusal instead of letting the process fall through to the host's
prompt handling — the same writer `driveSubagentRootRegime` uses
(`emitResultEnvelope`, wired at `production-composition.ts:592`).

Open questions a route must answer, not assume:

- **Which `QueryError` carrier.** `InvokeInfraError { cause: "validation" }` is
  the closest existing arm (it already carries the params-validation refusal)
  but this is a load refusal, not a params one; a new `cause` value is a
  spec-versioned change to the enum fixed in
  `errors-and-results/queryerror-variants.md`.
- **Whether a registered diagnostic code is added** for "the marked root theta
  did not register", or whether the existing load code is carried through the
  envelope's message.
- **Whether the stray model turn is prevented.** Emitting the envelope does not
  by itself stop the host from processing the argv prompt. Preventing the turn
  is a separate obligation and may not be reachable from the extension surface
  at all; a route states what it can and cannot guarantee, and measures the
  stdout-line count as the observable.

Element (b) is what 0179 needs as well, and 0179 explicitly does not claim it.
Whichever report lands it, the other's §Reproduction (b) becomes legible; the
two do not otherwise touch.

### (c) Constraints every route carries

1. **The slash surface does not move.** A non-bypass theta with no resolvable
   binder model must still fail to load, with the same code and the same
   message, in an ordinary session (`binder-model-and-context.md:5`). The
   condition that changes is the regime, nothing else.
   `tests/binder-model-resolution.test.ts` (11 tests) and
   `tests/binder-bypass-envelope.test.ts` (15 tests) are the locks; no assertion
   in either is edited.
2. **The bypass classification is untouched.** `classifyBinderBypass`
   (`binder-envelope.ts:204`) is correct for what it is asked. A route that
   widens the bypass set to admit named types would change the slash surface and
   is out of scope (§Non-goals).
3. **The strict-capability probe follows the same condition.**
   `resolveBinderModel` runs the probe only after resolution succeeds
   (`binder-model.ts:211`, the `false` arm at `:212–224`), and the
   specification short-circuits it
   identically for bypass-eligible thetas (`binder-model-and-context.md:10`,
   final sentence). A route that skips resolution under the regime skips the
   probe with it, or `theta/load/binder-model-not-strict-capable` becomes the
   next refusal on the same path.
4. **PIC-59's fail-closed mapping stays.** `driveSubagentChild`'s exit arm
   (`subagent-json-driver.ts:141`) must keep mapping a genuinely
   envelope-less exit to `Err(InvokeInfraError { cause: "internal_error" })` —
   element (b) removes an occasion for that arm, it does not soften it.
   `docs/spec_topics/pi-integration-contract/subagent.md:113` and INV-5
   (`invocation.md:36`) are unchanged.
5. **Test witness — one integration tier, offline and provider-free.** The
   witness re-drives §Reproduction (b)'s failing rows through real spawned
   children on the `tests/inbound-boundary-theta-callable.test.ts` harness
   pattern (all three `#subagent-child-pins`, pure tail-expression bodies), with
   the `bind_model:` rows kept as the over-reach fence and `pstr` as the
   unchanged-behaviour control. The `stdoutLines` count is asserted alongside
   the envelope, because it is what distinguishes "registered and ran" from
   "prompted a model and exited": a green envelope with a 30-line stdout would
   mean the turn still happened. The witness must have no `theta.binderModel` in
   scope — a route states how it guarantees that, since the setting is read from
   the operator's own files and a machine that has it set would make the witness
   vacuous.
6. **The witness 0172 could not write becomes writable.** With this fixed, the
   child-side `bindParamsInbound` projection
   (`production-theta-producer.ts:2180`) is observable: a callee with
   `params: sev: Sev` returning `sev` crosses a real child boundary. A route
   records whether it lands that witness or hands it back to 0172; the comment
   in `tests/inbound-boundary-binder-args.test.ts:81–83` that says it cannot be
   written is falsified by the fix either way and is corrected in the same
   commit.
7. **GOV-15 observable**
   (`docs/spec_topics/governance/source-language-stability.md:5`). No route
   refuses an input that succeeds today. What moves is a refusal becoming a
   success (element (a)) and an exit detail becoming a named error (element
   (b)). A route enumerates the second as a message change, since operators and
   tests may match on the current text.

## Non-goals

- **Widening the binder-bypass set.** Admitting named `enum` / `schema` params
  into the single-string bypass would change what the human slash surface does
  with a raw argument string and is a language change, not a fix for this.
  `binder-bypass-and-envelope.md:13` fixes the current set.
- **Whether `theta.binderModel` should have a default.**
  `binder-model-and-context.md:5` states there is "**no further fallback** — no
  'tier-2' default, and the theta's own `model:` is not consulted", with the
  reason. This report does not reopen it; it argues that the requirement should
  not reach a process that cannot call the binder.
- **The load refusal on the ordinary slash surface.**
  `docs/examples/import-thetalib.theta` (`mode: subagent`,
  `params: reviewer: Author`, no `bind_model:`) fails to load on any install
  without `theta.binderModel`, and the how-to that documents its command
  (`docs/how-to/import-a-thetalib-module.md:55`) does not say so. That is the
  specified, loud behaviour of a top-level invocation — recorded here as the
  census's most conspicuous instance, not filed and not fixed by this report.
- **0179's `decide` array arm.**
  [0179](./0179-array-sink-refuses-unresolvable-value-type.md) owns the parse
  refusal itself (`src/parser/type-compat.ts:213–215`). This report shares only
  its §Fix element (b) surfacing question and changes nothing in
  `src/parser/`.
- **The inbound translation pass and its boundaries.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  remaining face-2 (`anyOf` arm dispatch) and its enforced-entry-point question.
  §Reproduction (c) measures that the child-side intake seam is correct; this
  report unblocks its witness and decides nothing about it.
- **Whether the host should refuse an unrecognised `-p "/slug"` instead of
  prompting.** That is the host's argv handling, outside this extension's
  surface. §Fix element (b) addresses what theta can do from inside the child,
  and its third open question records the limit explicitly.
- **The `hint` slot on `subagent-child-crashed`.** The companion diagnostic
  carries the last stderr line for operator triage; here stderr is empty because
  the child did not crash. Enriching that slot is not a route to this defect's
  information.

## Provenance

Filed as residual 1 of the bug 0172 fix (v0.97.0, commit `c2d22aad`), recorded
in that run's report (`.pi/tmp/fixes/0172-report.md` §*Residuals/notes* →
*For the parent to file*, item 1) and not filed there — a fix run creates no bug
docs. That residual states the differential it measured through the test
writer's harness at the previous HEAD `21988875`: `params: sev: string` →
`{"ok":true,…}`; `params: sev: Sev` → `theta/runtime/subagent-exit-without-envelope`,
"subagent child exited without a return envelope: exited code 0", `DIAGS []`;
`params: box: Box` → the same.

**Re-measured at HEAD `0d0f8a6d` for this filing, not copied.** All three of the
residual's rows reproduce exactly, including the empty diagnostic drain
(§Reproduction (a)). Three findings are this filing's, not the residual's, and
each changes what the report is about:

- **The trigger is the binder-bypass class, not the named type.**
  `params: xs: array<string>` — no named type anywhere — fails identically.
  The residual's `string` control happened to be the one bypass-eligible shape.
- **The mechanism is a load-time registration refusal, not a throw in the
  intake.** The decisive control is the `bind_model:` differential: three
  byte-identical fixtures plus one frontmatter line return their marshalled
  params through the envelope in ~1.3 s with two stdout lines each. The
  residual's suggested probe points — the child-side marshalled-params intake
  and `bindParamsInbound` — are measured correct in-process for every subject
  shape (§Reproduction (c)).
- **The failing child spends a model turn.** 30–31 streamed stdout event lines
  against 2, on a path PIC-60 exists to keep model-free.

**Measurement method.** One scratch vitest probe, written for this filing, run,
and deleted; `git status --short` showed no scratch file of mine before or
after. It drove real spawned `pi` children through the production launch path
(`launchSubagentChild` + `createProductionSpawnFn` + `driveSubagentChild`) with
all three `AGENTS.md` `#subagent-child-pins` set, including the
`PI_THETA_SUBAGENT_PARENT_PID` carriage the AUTHENTICATED control plane
(`subagent.md:76`) requires; the params rode `PI_THETA_PARAMS` exactly as
`marshalParams` writes it. Part (c) ran in-process over the shipped
`parseThetaDocument`, the real `params:` lowering, `classifyBinderBypass`,
`buildInboundTranslationPlan` and `bindParamsInbound`. Every theta body is a
pure tail expression; the only model turns spent are the ones the defect causes.

**One sibling citation is stale and is recorded here, not corrected there.**
`tests/inbound-boundary-binder-args.test.ts:78` cites the child-side intake at
`production-theta-producer.ts:2019` and its projection at `:2145`; at this HEAD
they are `:2046` and `:2180`. That comment was written two commits ago, in the
bug-0172 fix run, and is already 27 and 35 lines out — bug
[0134](./0134-params-shift-induced-stale-citations.md)'s class. The file is
another report's witness and is not edited by this filing; §Fix (c)(6) already
requires the same comment to be corrected when this fix lands.

**Everything cited above was checked against the tree at this HEAD with `rg` and
by reading the file**, not carried from the residual or from a sibling report.
Specifically re-read in full: `runComposePass`'s binder-model gate
(`production-composition.ts:826–845`) and its regime detection (`:505–520`);
`classifyBinderBypass` (`binder-envelope.ts:204–226`); `resolveBinderModel`
(`binder-model.ts:179–220`); `assembleSubagentArgv`'s argv assembly
(`subagent-launcher.ts:400–448`); `driveSubagentRootRegime` and
`#intakeSubagentRootParams` (`production-theta-producer.ts:2040–2200`);
`driveSubagentChild` (`subagent-json-driver.ts:80–145`); `bindParamsInbound`
(`inbound-boundary.ts:114–140`); and the spec sentences at
`binder-model-and-context.md:5`, `binder-bypass-and-envelope.md:6`–`:13`,
`subagent.md:31`, `:47`, `:76`, `:93`, `:99`, `:101`, `:113`, and
`invocation.md:36`. The corpus census and the committed-coverage count were
re-derived from `git ls-files` at this HEAD.

Volatile positions are named by symbol beside their line numbers per bug
[0134](./0134-params-shift-induced-stale-citations.md);
`src/extension/production-theta-producer.ts` is 6277 lines and
`src/extension/production-composition.ts` 2567 lines at this HEAD.
