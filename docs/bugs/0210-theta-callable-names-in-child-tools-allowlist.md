# Bug 0210 — The subagent launch contract puts `.theta` callable names into the child's `--tools` allowlist, which is a HOST tool-registry allowlist: on a host that validates it (Oh-My-Pi) the child exits 2 before any session starts, so EVERY theta registering a `.theta` callee in `tools:` is unrunnable there — load-clean, diagnostic-free, and silent under `-p`

- **Status:** fixed (0.132.0) — over pre-fix HEAD `69c78f4`, v0.131.0. Observed
  and diagnosed at `7f360d2` (v0.88.0); the defect was byte-identical at both
  HEADs — no intervening commit touched the launch-contract allowlist.
- **Sev/Diff estimate:** S1/D1 — S1 because the failure is total (no statement of
  the callee ever runs), silent (no diagnostic on any surface, and the SLSH-3 err
  note lands on a channel print mode does not render), and it hits the
  documented, recommended spelling for a repeated callee
  (`docs/how-to/return-a-typed-value-across-a-subagent-boundary.md:13-14`:
  "register the child path in `tools:` and call it by name"); D1 because the fix
  is to stop forwarding a name that already has its own carrier — one flag value,
  no new mechanism.
- **Kind:** defect — the implementation forwards a theta-side name on a host-side
  channel. The spec's own carrier table lists the `.theta` callable's carrier
  separately (presented name + marshalled closure hash), so the `--tools` entry
  was a duplication; the spec text nonetheless said the allowlist carries "the
  theta's callable set", which is what the implementation did.
- **Affected** (citations at pre-fix HEAD `69c78f4`, 0.131.0):
  - `src/extension/production-theta-producer.ts:1948-1954` — `callableNames`
    concatenates `callableSetPiToolNames(theta)` with
    `thetaCallableEntries.map((entry) => entry.presentedName)`, and `:2101` passes
    that merged list as `argv.tools`.
  - `src/runtime/subagent-launcher.ts:342-345` (`SubagentArgvInput.tools` /
    `.emptyCallableSet`), `:438-444` (the `--tools` / `--no-tools` arms).
  - `inferChildTrust` (`src/runtime/subagent-launcher.ts:190`) read the same
    merged list (`production-theta-producer.ts:1962`).
  - Spec: `docs/spec_topics/pi-integration-contract/subagent.md:48` ("the theta's
    callable set (`tools:` allowlist)"), `:87`
    (`#subagent-tools-allowlist-suppression`), `:174` (the state-isolation matrix
    row); reference: `docs/reference/frontmatter.md:182` ("receives the
    callable-set names as its active-tool allowlist").
  - Tests that pinned the defect as intended behaviour:
    `tests/subagent-model-theta-tool.test.ts:409` ("the `.theta` callable appears
    in the child's `--tools` allowlist"), `:458`, `:473` (Gap-2 renamed /
    hyphenated rows).
- **Observed at:** 0.88.0 on `omp/17.2.5` (Oh-My-Pi host), macOS arm64.

## Summary

`--tools` is a **host tool-registry** allowlist. A `.theta` callable's presented
name names nothing in that registry: it is resolved child-side against the
child's own *theta* registry, and the launch contract already carries it as the
presented name plus the marshalled closure hash. Forwarding it on `--tools` as
well was inert on Pi, which tolerates a name it cannot resolve, and fatal on
Oh-My-Pi, which validates the list:

```
$ omp --tools bash,child -p "hi"
Error: Unknown tool in --tools: child. Valid tools: read, bash, edit, …
$ echo $?
2
```

The child therefore dies before its session starts and emits no `theta_result`
envelope; the parent maps that fail-closed to
`Err(InvokeInfraError { cause: "internal_error" })` (PIC-59) and, at a slash
boundary, renders SLSH-3 on the `theta-system-note` channel — which the host's
print mode (`-p`) does not render. The operator sees the process print nothing
and exit 0.

## Reproduction

Two thetas in one discovery root; `child.theta` is `mode: subagent`, and the
parent's only sin is registering it in `tools:`:

```theta
--- # parent.theta
mode: subagent
tools:
  - bash
  - ./child.theta
---
let a = bash({ command: "echo PARENT-START >> /tmp/probe.log; printf OK", timeout: 0 })?
let r = child("t1")?
"PARENT-OK"
```

`omp --theta <dir> -p "/parent"` exits 0 in ~3 s having written nothing to
`/tmp/probe.log`: the FIRST statement never ran. Two controls isolate the cause
to the `tools:` entry, not to the callee:

| Variant | `tools:` | Observed |
|---|---|---|
| body identical, callee reached with `invoke<Out>("./child.theta", "t1")?` | `bash` | parent runs, child runs, typed value returns |
| callee registered but **never called** | `bash`, `./child.theta` | parent's first statement never runs |
| callee registered, `--mode json` | `bash`, `./child.theta` | only the `session` event; no model turn, so the slash name WAS registered and dispatched — the theta was not degraded to prose |

The offline load pass registers all four slash names with zero error-severity
diagnostics, so nothing at load time names the problem.

## Root cause

`spawnSubagentConversation` builds one flat list of "callable names" and uses it
for a host-side purpose:

```ts
const callableNames = [
  ...piToolNames,
  ...thetaCallableEntries.map((entry) => entry.presentedName),
];
```

The two halves of a callable set address two different registries. The host half
is host-registry names (already correctly reduced to each entry's *underlying*
registered name by `callableSetPiToolNames`, so an `as` rename does not leak);
the theta half is theta-side names whose carrier is
`PI_THETA_SUBAGENT_CALLABLE_HASHES` plus the child's own discovery. Merging them
made the argv value a lie on any host that reads it as documented.

The spec's wording (`:48`, "the theta's callable set (`tools:` allowlist)")
licensed the merge, while its own next row already gave the `.theta` half a
different carrier — an internal inconsistency, adjudicated here in favour of the
per-half carriers.

`inferChildTrust` read the same merged list, so a `.theta` callable whose
presented name happened to equal a *project-local* extension tool's name — a
tool not in the callable set at all — inflated the trust verdict and granted the
child project-local file trust. Same root cause, different blast radius.

## Fix

1. **`--tools` carries the host half only.**
   `production-theta-producer.ts` no longer builds a merged list: the argv input
   takes `hostTools: piToolNames`, and `noHostTools` (renamed from
   `emptyCallableSet`, whose name was the misconception) is
   `piToolNames.length === 0`. The rename is the point: the flag arm is chosen by
   "does the callable set hold a HOST tool", not by "is the callable set empty".
2. **`--no-tools` covers the theta-only callable set.** A theta whose callable
   set is all `.theta` callables now takes the explicit-empty arm rather than
   emitting `--tools <theta names>`. The child needs no host tool to run those
   callees — the theta runtime spawns their own children — and empty must stay
   distinguishable from omission, which would re-enable the host's built-ins.
3. **Trust inference reads the host half.** `inferChildTrust(piToolNames, …)`:
   only a host tool can carry a host source scope, so a theta-side name can no
   longer inflate the verdict.
4. **Spec + reference amended.** `subagent.md`'s carrier table splits the
   callable-set row by side, the `--no-tools` row is keyed on "no host tool", the
   `.theta` row states "**never** an argv `--tools` entry", and a new
   `#subagent-tools-host-names-only` subsection carries the rule, the host
   evidence, and the consequence for allowlist sub-property (2).
   `docs/reference/frontmatter.md:182` follows, as do the restatements at
   `invocation.md:70`, `tool-registration-lifetime.md:5`, the
   state-isolation-matrix row (`subagent.md:174`), `guide.md:241`, the
   subagent-extension-tool how-to and example, and the producer's PIC-58
   regime-arm comment.
5. **Tests retargeted.** The three cells that pinned the defect now pin the
   split: the fixture callable set holds `read` (host) **and** the `.theta`
   callee, `--tools` must equal `["read"]` and must not contain the callable
   name, the renamed / hyphenated Gap-2 rows keep their hash-carrier assertions
   and add the allowlist exclusion, and a new cell covers the theta-only callable
   set taking `--no-tools` while its hash still crosses. Two trust-verdict cells
   pin fix item 3 at the producer level: a `.theta` presented name colliding
   with a project-local tool's name draws `--no-approve` (reverting the
   `inferChildTrust` input to the merged list reds exactly this cell), and a
   project-scoped HOST tool in the set still earns `--approve` (control). A
   live-production-acceptance block (H8a-T) runs both fixed shapes — the mixed
   `read` + `.theta` set and the theta-only `--no-tools` set — end to end
   through REAL spawned children on a credentialed box.

Not changed: the closure-hash carrier, the child-side callable-set enforcement,
and the `as`-rename semantics (`--tools` already carried underlying names).

## Verification

- **Default gate** (`npx vitest run`, offline, rebased over `69c78f4` /
  v0.131.0): 321 files / 6054 tests pass; the ten reds (nine files) are
  PRE-EXISTING and environment-derived, not this change — the identical ten
  fail on a pristine `upstream/main` checkout on this box. All ten are
  real-child-spawn cells refused by the child's PIC-62 model pre-flight
  (`expected 'anthropic/claude-fable-5', child resolved '(unresolved: no
  matching model)'` — this box serves that id through a different provider).
  Note that the red is itself evidence the child spawns and runs its theta far
  enough to emit an envelope under the Pi dialect. Green in this run: the
  retargeted `tests/subagent-model-theta-tool.test.ts`, the four argv-shape
  files whose `SubagentArgvInput` literals were renamed (`host-cli-dialect`,
  `subagent-child-launch`, `subagent-child-real-spawn`,
  `subagent-theta-roots-forwarding`), and the eight post-0.88.0 upstream suites
  whose fake-launcher argv literals took the same rename
  (`inbound-boundary-theta-callable`, `inbound-union-arm-dispatch`,
  `invoke-prompt-cell-enum-return`, `subagent-envelope-result-carriage`,
  `subagent-invoke-inbound-enum-tag`, `subagent-invoke-nonfinite-return-refusal`,
  `subagent-return-depth-refusal`, `subagent-root-binder-model-exempt`).
- `tsc --noEmit` and `eslint src/**/*.ts`: clean.
- **Red direction proven:** re-merging the two halves at the argv site (nothing
  else changed) reds exactly the three new/retargeted allowlist cells —
  `expected [ 'read', 'child' ] to deeply equal [ 'read' ]`,
  `[ 'read', 'helper' ]`, `[ 'read', 'my_tool' ]` — then restored green.
  Re-merging the halves at the `inferChildTrust` input instead (argv split
  intact) reds exactly the new trust-collision cell (`expected […] to include
  '--no-approve'`) — then restored green (restoration verified byte-identical).
- **Live, on the host that exposed it** (`omp/17.2.5`, `--theta <dir> -p "/…"`):
  - §Reproduction `parent.theta`, unchanged (callee still registered in
    `tools:`, alongside `bash`): now runs end to end —
    `PARENT-START`, `CHILD-RAN`, `PARENT-SAW-t1` — so the host half of the
    allowlist survives and the code-side `bash` call still dispatches in both
    processes.
  - A theta whose callable set is ONLY a `.theta` callee (`--no-tools` arm): runs,
    and its callee runs (`CHILD-RAN`).
  - Model-facing reach intact: a subagent theta with `tools: [bash]` whose query
    instructs the model to run a shell command — the CHILD's model calls the host
    `bash` tool successfully (`MODEL-TOOL-RAN`), proving the allowlist is passed
    down and honoured, not merely accepted.
