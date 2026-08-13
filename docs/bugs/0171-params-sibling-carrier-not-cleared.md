# Bug 0171 — `marshalParams` named only the carrier its own payload chose, and the launch path spreads that patch over the launching process's inherited environment, which is itself frequently a subagent child's live carrier: a level-1 child launched with SMALL params handed a level-2 callee whose params crossed the 8 KB threshold BOTH carriers, and `readMarshalledParams` resolves a two-carrier env by PREFERENCE (inline first, returning before the file carrier is consulted) rather than by refusal — so the callee ran on its CALLER's arguments, never opened its own temp file, and drew no diagnostic on any channel; the callable-hash carrier's conditional spread carried the same defect at the neighbouring key

- **Status:** fixed (0.89.0) — landed at HEAD `3752003f` on `feat/omp-host-support`
  (external PR #1, host-agnostic fix 6; the callable-hash half added in review
  round 1 as finding F11). `package.json` reads `0.88.0` at that commit: the
  release commit assigns the number.
- **Sev/Diff estimate:** S1/D2 — S1 because a callee binds an argument set the
  parent did not marshal for it, with no diagnostic on any channel and its own
  temp file left unopened (measured, §Reproduction (a)–(b)): the substituted
  payload is a different invocation's data crossing a process boundary whose
  marshalled-artefact enumeration the spec closes at four
  (`subagent.md:176`), and the caller picks the payload size, so crossing the
  threshold is a controllable trigger. D2 because the settled fix is one
  return-shape change in one module plus one conditional spread in its single
  caller, one spec bullet and one sentence, no new registered code, no Message
  template touched, and one ordinary offline witness file.
- **Kind:** defect — the parent's env patch described half the channel state
  while the launch path applies it to an environment that already carries the
  other half, and the child's read resolves the resulting ambiguity by
  preference. Five elements, each cited at HEAD `3752003f`, with the pre-fix
  element read from `faac6841` (v0.88.0) by `git show`.
  1. *The patch named one key.* Pre-fix `marshalParams`
     (`git show 7f360d20^:src/runtime/subagent-params.ts`, `:136`–`:161`)
     returned `env: { [SUBAGENT_PARAMS_ENV]: plan.value }` on the below-threshold
     branch (`:146`) and `env: { [SUBAGENT_PARAMS_FILE_ENV]: tempFilePath }` on
     the at/above-threshold branch (`:155`). Neither branch mentioned the other
     carrier, so neither could overwrite it.
  2. *The patch is applied to an environment that already holds the sibling.*
     `spawnSubagentConversation`
     (`src/extension/production-theta-producer.ts:1645`) builds the child env as
     `{ ...baseParentEnv, ...marshalled.env, … }` (`:1858`–`:1865`), where
     `baseParentEnv` is `this.#input.subagentParentEnv` (`:1847`) — the process
     environment captured once at composition (`readParentEnv()`,
     `src/extension/production-composition.ts:582`). In a subagent child that
     same map is the child's own params source: `#intakeSubagentRootParams`
     reads `this.#input.subagentParentEnv` (`:2017`–`:2018`). Nothing removes
     the carrier after intake (no `delete process.env` exists in `src/`), so the
     child's own carrier is live for the process lifetime and is the base of
     every launch it performs.
  3. *The child's read prefers, it does not refuse.* `readMarshalledParams`
     (`src/runtime/subagent-params.ts:224`) returns the parsed inline value at
     `:237`–`:240` and reaches the file carrier at `:243`–`:248` only when the
     inline key is `undefined`. A two-carrier env is therefore resolved silently
     in favour of the inline one, whatever its provenance.
  4. *Nothing downstream refuses the substitution.* The child binds
     `intake.params` entry-by-entry into `paramBindings`
     (`production-theta-producer.ts:2143`–`:2150`) and drives the body with them
     (`:2151`–`:2154`, `:2161`). A callee declaring no `params:` admits any
     payload unvalidated (`:2034`–`:2037`). A callee declaring `params:`
     validates the received payload against its own lowered schema (`:2038`–`:2051`), which
     accepts the caller's payload whenever the two declarations agree — and
     refuses it otherwise with `theta/runtime/subagent-params-validation-failed`,
     a message naming a schema failure whose cause is the carrier layering.
  5. *The sibling key had the same shape.* The callable-hash carrier was a
     conditional spread — `...(Object.keys(callableHashes).length > 0 ? {
     [SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify(callableHashes) } : {})`
     (`git show faac6841:src/extension/production-theta-producer.ts`,
     `:1847`–`:1849`) — so a launch marshalling no hashes added nothing and an
     inherited map reached the grandchild, whose verification
     (`refuseDivergedChildCallables`, `production-composition.ts:944`) then
     checks the CALLER's callable names against its own discovery.
- **Related:**
  - **0165** —
    [`0165-empty-params-default-literal-admitted-and-never-bound.md`](./0165-empty-params-default-literal-admitted-and-never-bound.md),
    **open.** **Boundary.** Both reports end with a `params:` value the author
    did not write reaching body scope, by disjoint mechanisms at opposite ends
    of the pipeline. 0165 is parser-side and single-process: `splitParamValue`
    records an empty `defaultSource`, invocation-time recovery cannot parse it,
    and the field binds `null` — no child process, no env carrier, no second
    invocation involved. This report is transport-side and cross-process: the
    values are already typed and correctly marshalled, and the defect is which
    invocation's marshalled bytes the child reads. A fix at either site leaves
    the other's evidence unchanged: 0165's fix refuses a declaration at load;
    this one clears an env key at launch.
  - **0167** —
    [`0167-clean-leaf-walk-warns-on-absent-conventional-root.md`](./0167-clean-leaf-walk-warns-on-absent-conventional-root.md),
    **fixed.** The other report filed from the same change. Disjoint subject
    (discovery-root classification); named here only because the two share a
    landing commit and a provenance.
  - **0169** —
    [`0169-bare-id-model-preflight-ambiguous-refusal.md`](./0169-bare-id-model-preflight-ambiguous-refusal.md),
    **fixed (0.89.0).** The sibling report from the same PR, at the neighbouring
    child-side seam: PIC-62's model pre-flight, which runs immediately before the
    PIC-60 intake this report is about (`production-theta-producer.ts:2092`
    onward, then `:2137`). Disjoint mechanism — a resolution key, not an env
    carrier — and disjoint outcome: 0169 refuses loudly, this one proceeds
    silently.
  - **0002** —
    [`0002-investigation.md`](./0002-investigation.md) *Defect 2* (`:208`,
    `:387`), the nearest prior instance of the class: an inherited ambient value
    (there, the extension a child resolves) winning over the value the launch
    intended, with no signal. Its remedy was the opt-in
    `PI_THETA_SUBAGENT_EXTENSION_PIN`; this report's is the reverse operation on
    the same channel — making the launch patch authoritative by naming what it
    clears.
- **Affected** (every citation verified against the tree at HEAD `3752003f`;
  symbols named beside lines):
  - **The patch's shape.** `marshalParams` (`src/runtime/subagent-params.ts:153`),
    its SPAWN-08 note (`:159`–`:177`), the below-threshold return (`:181`–`:187`)
    and the at/above-threshold return (`:193`–`:202`); the `MarshalledParams.env`
    contract (`:122`–`:137`), which states `undefined` as the DELETE signal;
    `chooseParamsChannel` (`:99`) and `SUBAGENT_PARAMS_THRESHOLD_BYTES` (`:52`,
    8192); the two carrier constants (`:40`, `:43`); the temp-file mode (`:55`,
    0600).
  - **The read.** `readMarshalledParams` (`:224`), its emission-invariant note
    (`:228`–`:236`), the inline arm (`:237`–`:240`) and the file arm
    (`:243`–`:248`); `intakeChildParams` (`:283`) and the refusal code
    `SUBAGENT_PARAMS_VALIDATION_FAILED_CODE` (`:58`).
  - **The launch path.** `spawnSubagentConversation`
    (`src/extension/production-theta-producer.ts:1645`); the param collection
    (`:1838`–`:1843`), the `marshalParams` call (`:1844`), the cleanup handle
    (`:1845`), `baseParentEnv` (`:1847`), the hash-carrier note (`:1848`–`:1857`)
    and the assembled `parentEnv` (`:1858`–`:1865`); the callable-hash map
    (`:1741`–`:1746`); `launchSubagentChild`
    (`src/runtime/subagent-launcher.ts:568`), which layers its own markers over
    the same map through `buildSubagentChildEnv` (`:466`–`:484`, called at
    `:595`) and hands the result to the spawn seam (`:602`); the teardown
    backstop that deletes the unread temp file (`production-theta-producer.ts:1955`,
    `paramsCleanup()` at `:1960`).
  - **The spawn boundary.** `createProductionSpawnFn`
    (`src/extension/production-subagent-host.ts:452`), which passes the assembled
    map straight to `child_process.spawn` as `env: options.env` (`:456`) — the
    step that turns an `undefined` entry into an absent variable.
  - **The env the patch lands on.** `readParentEnv`
    (`src/extension/production-subagent-host.ts:182`) and
    `authenticateControlPlane` (`:194`), wired at
    `src/extension/production-composition.ts:582`. The authentication does not
    narrow this path: it returns the environment unchanged when
    `PI_THETA_SUBAGENT_PARENT_PID` equals the reading process's real parent pid
    (`production-subagent-host.ts:198`–`:200`), which is exactly what a genuine
    child carries (`buildSubagentChildEnv`, `subagent-launcher.ts:481`). Both
    params carriers are in `CONTROL_PLANE_ENV_KEYS`
    (`production-subagent-host.ts:142`–`:150`).
  - **The child side.** `#intakeSubagentRootParams`
    (`production-theta-producer.ts:2017`), its env source (`:2018`), the
    no-`params:` admit-anything arm (`:2034`–`:2037`) and the schema arm
    (`:2038`–`:2051`); the call site (`:2137`), the refusal branch
    (`:2138`–`:2142`), the binding loop (`:2143`–`:2150`), the root bind input
    (`:2151`–`:2154`) and the body drive (`:2161`). The lowered schema the
    second arm compiles carries
    `additionalProperties: false` and an explicit `required`
    (`src/parser/params.ts:404`–`:409`).
  - **The hash sibling.** `SUBAGENT_CALLABLE_HASHES_ENV`
    (`src/runtime/subagent-callable-hash.ts:31`);
    `refuseDivergedChildCallables` (`src/extension/production-composition.ts:944`)
    and its `readParentEnv()` read (`:958`); `readMarshalledCallableHashes`
    (`src/runtime/subagent-child-hash-verify.ts:68`), which requires the root
    marker (`:71`–`:73`) and then the map (`:74`–`:77`);
    `verifyChildCallableHashes` (`:127`).
  - **Spec.** `docs/spec_topics/pi-integration-contract/subagent.md:41` (the
    launch contract's full-environment inheritance), `:52` (the params row of
    the launch-contract table), `:91` (`#subagent-theta-callable-hash`,
    including the hash-carrier sentence this change added), `:93` (PIC-60's lead
    — marshal the callee's own values, validate against the same schema), `:95`
    and `:96` (the two threshold bullets), `:97` (the *Both carriers are named
    on every launch* bullet this change added), `:165` (the state-isolation
    matrix's closed enumeration), `:172` (the captured-`params` row), `:176`
    (the closed explicitly-marshalled enumeration), `:187` (the PIC-60 teardown
    backstop);
    `docs/spec_topics/diagnostics/code-registry-runtime.md`
    (`theta/runtime/subagent-params-validation-failed`,
    `theta/runtime/subagent-callable-hash-mismatch`).
  - **The witnesses.** `tests/subagent-params-carrier.test.ts` (334 lines, new
    in this change): the patch-shape cells (`:147`, `:160`, `:171`), the two
    stale-carrier directions layered over a parent env (`:186`, `:220`), the
    real-spawn `undefined`-deletes probe (`:244`), and the round-trips at both
    sizes (`:289`, `:297`). `tests/production-subagent-query-model.test.ts:194`
    — the hash-carrier clearing cell (`:195`).
  - **The gate that did not score it.**
    `tests/subagent-params-marshalling.test.ts` cells `:177` and `:188` assert
    `marshalled.env[<unused carrier>]` is `undefined` on a patch examined in
    isolation. A missing key and a key set to `undefined` read identically
    there, so both cells passed before and after the change; the file is
    untouched by it (`git diff faac6841 HEAD -- …` is empty).
- **Observed at:** HEAD `3752003f` for the fixed behaviour and every citation;
  v0.88.0 (`faac6841`) for the defect, measured by running the shipped
  `readMarshalledParams` against patches produced by the pre-fix `marshalParams`
  reconstructed verbatim from `git show 7f360d20^:src/runtime/subagent-params.ts`.
  Offline, deterministic, provider-free: one scratch vitest probe over the
  shipped module with the launch path's own spread reproduced; written, run,
  deleted. Reachable since v0.9.0 (`4866d4d2`, the commit that introduced
  `marshalParams`) for the params carriers, and since v0.8.0 (`fda23a4b`) for
  the hash carrier.

## Summary

The parent marshals a callee's already-typed params onto one of two env
carriers, keyed on an 8 KB threshold: the canonical JSON on `PI_THETA_PARAMS`
below it, a 0600 temp file's path on `PI_THETA_PARAMS_FILE` at or above it. The
returned patch named only the carrier that invocation chose. The launch path
spreads that patch over the launching process's own environment
(`production-theta-producer.ts:1858`–`:1860`), and a subagent child is itself a
launching process whose environment still holds the carrier of the invocation
that launched it — the same map its own intake read (`:2018`), never cleared
after use.

The two facts meet in one of the four caller/callee size combinations. A level-1
child launched with small params holds `PI_THETA_PARAMS`; when it invokes a
callee whose params cross the threshold, the patch sets `PI_THETA_PARAMS_FILE`
and leaves the inherited inline value standing. `readMarshalledParams` returns
on the inline carrier before it consults the file one, so the grandchild parses
its caller's arguments, binds them, and never opens the temp file the parent
wrote for it — which the parent's teardown then deletes unread. Measured: the
child runs on `caller`, zero files opened. The substituted payload need not come
from the immediate parent — pre-fix the inline key was only ever added, so it
carries the values of the most recent ancestor that stayed below the threshold,
which a three-level chain shows two levels up.

Nothing on the path refuses it. A callee declaring no `params:` admits any
payload unvalidated; a callee whose declaration matches its caller's binds the
wrong values silently; and any other callee fails closed with
`theta/runtime/subagent-params-validation-failed`, naming a schema failure whose
cause is the carrier layering. The caller picks the payload, so crossing the
threshold is a controllable trigger.

The callable-hash carrier stood on the same conditional spread one key to the
left: a launch marshalling no hashes added nothing, and the inherited map
reached the grandchild's verification, which then checks the caller's callable
names against its own discovery.

## Reproduction

Offline, deterministic, provider-free. Harness: the shipped
`src/runtime/subagent-params.ts` — `marshalParams`, `readMarshalledParams`,
`canonicalizeParamsJson`, `chooseParamsChannel` — with the pre-fix
`marshalParams` reconstructed verbatim from
`git show 7f360d20^:src/runtime/subagent-params.ts:136`–`:161` beside it, fake
fs seams in the style of `tests/subagent-params-carrier.test.ts`, and the launch
path's spread reproduced exactly as `production-theta-producer.ts:1858`–`:1860`
builds it (`{ ...parentEnv, ...patch }`). Payloads: `{ who: "caller" | "callee",
… }` sized either side of `SUBAGENT_PARAMS_THRESHOLD_BYTES` (8192) — canonical
lengths 39 bytes (small) and 8218 bytes (large), measured.

### (a) The four caller/callee size combinations

`inline` / `file` describe the key in the assembled child env: `set` (a value),
`cleared` (present and `undefined`), `absent` (no such key). *child ran on* is
the `who` field of whatever `readMarshalledParams` returned. *files opened* is
the count of `readFile` calls the intake seam recorded.

```
PRE  caller=small callee=small | inline=set     file=absent  | child ran on: callee | files opened: 0
PRE  caller=small callee=large | inline=set     file=set     | child ran on: caller | files opened: 0
PRE  caller=large callee=small | inline=set     file=set     | child ran on: callee | files opened: 0
PRE  caller=large callee=large | inline=absent  file=set     | child ran on: callee | files opened: 1
POST caller=small callee=small | inline=set     file=cleared | child ran on: callee | files opened: 0
POST caller=small callee=large | inline=cleared file=set     | child ran on: callee | files opened: 1
POST caller=large callee=small | inline=set     file=cleared | child ran on: callee | files opened: 0
POST caller=large callee=large | inline=cleared file=set     | child ran on: callee | files opened: 1
```

Row 2 — `child ran on: caller` — is the break, and it is the only broken cell of
the four. Row 3 carries a
stale file path into the child env and still reads correctly, because the inline
preference short-circuits ahead of it — the stale path survives to be inherited
further down the chain. Row 4 clears nothing and needs nothing cleared, because
the pre-fix file branch overwrites the same key it inherited.

### (b) The stale value comes from the chain, not from the parent

A three-level chain: level 1 small (inline carrier), level 2 large (file
carrier), level 3 large (file carrier).

```
PRE  3-level chain: L2 ran on caller, L3 ran on caller, files opened: 0
POST 3-level chain: L2 ran on mid,    L3 ran on callee, files opened: 2
```

Pre-fix, level 3 binds level 1's arguments — two levels up — and neither level 2
nor level 3 opens the temp file written for it. The inline key is only ever
added by the pre-fix patch, never removed, so it carries the values of the most
recent ancestor whose payload stayed below the threshold, for the whole depth of
the chain (`INVOKE_DEPTH_CAP = 32`, `src/runtime/runtime-panics.ts:59`).

### (c) What the child does with the substituted payload

Traced from source at HEAD, not driven. `#intakeSubagentRootParams`
(`production-theta-producer.ts:2017`) hands the parsed value to a validator
built from the callee's own lowered `params:` schema, and the outcome is one of
three:

| callee declaration | verdict | outcome |
| --- | --- | --- |
| no `params:` | admitted unvalidated (`:2034`–`:2037`) | the caller's fields are bound (`:2143`–`:2150`) and the body runs |
| `params:` the caller's payload satisfies | `ok` (`:2038`–`:2051`) | the body runs on the caller's values, no diagnostic |
| any other `params:` | refusal (`intakeChildParams`, `subagent-params.ts:294`–`:296`) | `theta/runtime/subagent-params-validation-failed` + `Err(InvokeInfraError { cause: "validation" })` |

The middle row is exact-shape agreement, not looseness: the lowered schema
carries `additionalProperties: false` and an explicit `required`
(`src/parser/params.ts:404`–`:409`), so it is reached when caller and callee
declare the same field set — the ordinary shape of a chain that forwards its own
arguments. In all three rows the callee's own params never reach it, and its
temp file is deleted unread by the parent's teardown backstop
(`production-theta-producer.ts:1960`).

### (d) The hash carrier

Traced from source. Pre-fix, `parentEnv` spread
`...(Object.keys(callableHashes).length > 0 ? { [SUBAGENT_CALLABLE_HASHES_ENV]:
… } : {})` (`git show faac6841:src/extension/production-theta-producer.ts:1847`–`:1849`).
A launch whose callee has no `.theta` callables adds no key, so an inherited map
survives into the grandchild. `readMarshalledCallableHashes`
(`src/runtime/subagent-child-hash-verify.ts:68`) requires only the root marker
(`:71`–`:73`) — which the launcher writes for every child
(`subagent-launcher.ts:480`) — and a non-empty map (`:74`–`:77`), so the stale
map is read and `verifyChildCallableHashes` (`:127`) recomputes hashes for the
caller's callable names against the grandchild's own discovery. Unchanged files
re-hash identically; a `.theta` edited, moved or deleted between the two launches
draws `theta/runtime/subagent-callable-hash-mismatch` and is dropped from a child
that never calls it (`refuseDivergedChildCallables`,
`production-composition.ts:944`, dropping at `:993`–`:1004`).

## Expected behaviour

- `docs/spec_topics/pi-integration-contract/subagent.md:93` (PIC-60) — "The
  parent already holds the callee's **already-typed** param values … the runtime
  MUST marshal them structurally as canonical JSON per the theta's `params:`
  schema and the child MUST validate the received JSON against **the same
  schema** before running the callee." The referent of "them" is the callee's
  values. A child that parses its caller's payload validates the wrong document
  against the right schema, and one that declares no `params:` validates
  nothing at all.
- `:176` — "Exactly four artefacts cross the process boundary as marshalled
  data, on named channels: (1) **params** — canonical JSON on `PI_THETA_PARAMS`
  / `PI_THETA_PARAMS_FILE` … Adding a fifth marshalled artefact is a
  spec-versioned change." The enumeration is closed over what crosses; it does
  not admit one invocation's artefact arriving at another's child.
- `:165` — "The matrix is the canonical enumeration of what the child inherits
  … The middle column is deliberately **narrow**: under this design nothing of
  `ExtensionCommandContext` crosses into the child except `cwd` and the
  marshalled model reference. Everything else the child needs is **explicitly
  marshalled** on named channels — the enumeration is closed at four." `:172`
  puts captured
  `params` in the explicitly-marshalled column.
- `:41` — "The child inherits the parent's **full environment**". Full
  inheritance is the design, so a launch patch is the only mechanism that can
  make the parent's channel choice authoritative; a patch that names one carrier
  states half of it.
- `:52` — the launch-contract row: "already-typed `params` values | marshalled
  structurally on `PI_THETA_PARAMS` / `PI_THETA_PARAMS_FILE`". Two named
  carriers for one artefact, with the choice made per launch.
- `:91` (`#subagent-theta-callable-hash`) — the parent "marshals those hashes to
  the child" and the child "verifies each hash after its own parse and **refuses
  the invocation on mismatch**". The hashes to verify are the ones this launch
  marshalled; a mismatch is a claim about this callee's files.
- `docs/spec_topics/diagnostics/code-registry-runtime.md:33` —
  `theta/runtime/subagent-callable-hash-mismatch`'s registered *Trigger* is a
  verification that "did not match the hash the parent recorded at load time —
  the callee's source was edited between parent load and child spawn". Hashes
  recorded for a different launch's callables are not the hashes this parent
  recorded for this callee, so a refusal drawn from them fires outside the row.

## Actual behaviour / root cause

Four joins have to hold for a callee to run on its caller's arguments, and
pre-fix all four did.

**1. The patch describes half the channel state.** Pre-fix `marshalParams`
returned, on the below-threshold branch:

```ts
    return {
      env: { [SUBAGENT_PARAMS_ENV]: plan.value },
      cleanup: (): void => {},
    };
```

and the symmetric single-key object on the file branch. Read on its own the
patch is complete — it names the carrier in use. Read as a patch it is not: the
absent key means "leave whatever is there", and what is there is the other
carrier.

**2. The environment it patches is the launching process's live carrier.** The
child env is `{ ...baseParentEnv, ...marshalled.env, … }`
(`production-theta-producer.ts:1858`–`:1865`) where `baseParentEnv` is
`subagentParentEnv` (`:1847`) — the map `readParentEnv()` captured at
composition (`production-composition.ts:582`). In a subagent child that map is
the process environment its launcher wrote, and it is the same map
`#intakeSubagentRootParams` read to obtain its own params (`:2018`). Intake does
not clear it: no `delete process.env` exists anywhere in `src/`, and the
carrier's job is finished the moment the child parses it. So every launch a
subagent child performs starts from an environment that already answers the
params question.

The control-plane authentication added in the same change does not narrow this.
`authenticateControlPlane` (`production-subagent-host.ts:194`) returns the map
untouched when `PI_THETA_SUBAGENT_PARENT_PID` equals the reading process's real
parent pid (`:198`–`:200`), and a genuine child always carries that — its
launcher writes it (`subagent-launcher.ts:481`). The authentication drops the
control plane for a process no pi-theta parent launched, which is the case that
has no stale carrier to begin with.

**3. The read resolves the ambiguity instead of reporting it.**

```ts
  const inlineJson = env[SUBAGENT_PARAMS_ENV];
  if (inlineJson !== undefined) {
    return parseParamsJson(inlineJson);
  }
```

`readMarshalledParams` (`subagent-params.ts:237`–`:240`) returns before
`env[SUBAGENT_PARAMS_FILE_ENV]` is read at all (`:243`). The preference is a correct optimisation for a
single-carrier env — the fast path touches no filesystem — and the whole defect
for a two-carrier one: the file carrier this launch set is unreachable
behind an inherited inline value. Nothing in the function compares the two or
notices there are two.

**4. The value that arrives is bound, and the refusal that could fire names the
wrong cause.** The child binds each entry of the parsed object into
`paramBindings` (`:2143`–`:2150`) and drives the body with it (`:2161`). Where
the callee declares no `params:` the validator admits anything (`:2034`–`:2037`) — the
"nothing to validate" arm, correct for its own premise that the received payload
is the one the parent marshalled. Where the callee's declaration happens to
accept the caller's payload, the body runs on values the parent never marshalled
for it, with no diagnostic on any channel. Where it does not, the invocation
fails closed with `theta/runtime/subagent-params-validation-failed`, whose
message reports a schema failure at a field path — accurate about the payload it
was handed and silent about the payload having been the wrong one.

The temp file the parent wrote for the callee is never opened (measured: `files
opened: 0`), and the teardown backstop deletes it (`:1960`), so the substitution
leaves nothing on disk to find afterwards.

The hash carrier's mechanism is the same shape with a different consequence.
Its conditional spread could add a key but never remove one, so a launch that
marshals no hashes leaves the inherited map in place. The grandchild's
verification is gated on the root marker and a non-empty map
(`subagent-child-hash-verify.ts:71`–`:77`), both of which a stale map satisfies,
and it then recomputes hashes for callable names the child's own callee never
mentions. Unchanged files re-hash identically, so the outcome is benign until a
`.theta` in the caller's callable set changes between the two launches.

## Why it matters

- **A callee binds another invocation's arguments with no diagnostic.**
  Measured: `child ran on: caller`, `files opened: 0` (§Reproduction (a) row 2).
  The parent's marshalled payload is discarded unread and a different
  invocation's payload is bound in its place, on the shipped production launch
  path.
- **The trigger is caller-controlled.** The channel is chosen by payload size
  (`chooseParamsChannel`, `subagent-params.ts:99`; threshold 8192 bytes), and
  the caller supplies the payload. Crossing the threshold in a nested invocation
  is enough.
- **The substitution crosses a boundary the spec closes.** `:176` enumerates
  exactly four marshalled artefacts and calls a fifth a spec-versioned change.
  One invocation's params arriving at another invocation's child is that
  enumeration failing at the artefact it names first.
- **The stale value can originate several levels up.** Pre-fix the inline key
  was only ever added, so a chain carries the most recent below-threshold
  ancestor's arguments downward indefinitely (§Reproduction (b): level 3 runs on
  level 1's, depth cap 32).
- **A callee with no `params:` is the least protected, not the most.** The
  admit-anything arm (`:2034`–`:2037`) is correct only under the premise that
  the received payload is this invocation's. Under the defect it is the arm that
  admits the disclosure.
- **The refusal that does fire misdirects triage.**
  `theta/runtime/subagent-params-validation-failed` names a field path in a
  schema, so the operator reads a wrong-arguments bug at the callee's
  declaration; the cause is an env key an earlier launch in the chain wrote.
- **No committed gate scored it.**
  `tests/subagent-params-marshalling.test.ts:177` and `:188` assert the unused
  carrier reads back `undefined` — true of an absent key and of a cleared one
  alike, because the patch is examined in isolation and never layered over a
  populated parent env. Both cells pass at both commits, and the file is
  untouched by the change.
- **The sibling key spends the same silence on a fail-closed path.** A stale
  hash map makes the grandchild verify the caller's callable names, so a `.theta`
  edited between the two launches draws
  `theta/runtime/subagent-callable-hash-mismatch` in a child that never calls it
  — a refusal outside the code's registered trigger.

## Fix (0.89.0)

Landed at HEAD `3752003f`; implementation, spec and witnesses in the same
change. Nothing blocks or is blocked: no other open report shares the site.

**Implementation — the params carriers.** `marshalParams`
(`src/runtime/subagent-params.ts:153`) names both carriers on both branches, the
unused one explicitly `undefined`: `{ [SUBAGENT_PARAMS_ENV]: plan.value,
[SUBAGENT_PARAMS_FILE_ENV]: undefined }` below the threshold (`:181`–`:187`) and
the mirror image at or above it (`:193`–`:202`). `undefined` is the delete
signal rather than an empty value because the patch is spread into the child env
and handed to the spawn seam, which drops `undefined` entries when it builds the
environment block — so the cleared carrier is absent in the child, never
present-and-empty, which `readMarshalledParams`'s `!== undefined` test would
accept and then fail closed on at parse. The threshold, the canonicalisation,
the 0600 temp file, the child's delete-on-read and the parent's teardown backstop
are unchanged; the patch's key set is exactly two.

`readMarshalledParams` keeps its inline-first preference and gains the invariant
that licenses it (`:228`–`:236`): the child env can hold at most the carrier this
invocation chose, so relaxing the emission rule requires making the read refuse a
two-carrier env outright.

**Implementation — the hash carrier.** `spawnSubagentConversation` names
`SUBAGENT_CALLABLE_HASHES_ENV` on every launch, carrying this launch's map or
`undefined` when it marshals none (`production-theta-producer.ts:1861`–`:1864`,
inside the `parentEnv` assembly at `:1858`–`:1865`), replacing the conditional
spread. The clear is per-key: unrelated inherited
environment is untouched, which the launch contract's full-environment
inheritance (`subagent.md:41`) requires. `verifyChildCallableHashes`,
`readMarshalledCallableHashes`, the registered code and its message are
unchanged.

**Spec.** PIC-60 gained the *Both carriers are named on every launch* bullet
(`docs/spec_topics/pi-integration-contract/subagent.md:97`): the parent's env
patch MUST name both variables on every launch, the unused one explicitly
cleared — absent in the child, not present-and-empty — with the layering reason
and the consequence stated ("a callee whose own params crossed the threshold
would silently run on the inline payload it inherited from its caller instead of
on its own, with no refusal anywhere on the path"). `#subagent-theta-callable-hash`
(`:91`) gained the matching sentence for the hash carrier, naming PIC-60 as the
reason. The threshold bullets (`:95`, `:96`), the launch-contract row (`:52`) and
the teardown sentence (`:187`) are unchanged.

**Witnesses.** Two files, both offline and provider-free; both green at HEAD
(8 + 5 tests, run).

- `tests/subagent-params-carrier.test.ts` — new, 334 lines. Patch shape: the
  unused carrier is `Object.hasOwn`-present and `undefined` at both sizes
  (`:147`, `:160`), and the key set is exactly the two carriers (`:171`), so a
  clear can never widen the patch. The regression itself, layered over a
  populated parent env exactly as the launch path builds it: stale inline +
  large payload reads the callee's own temp file and not the caller's JSON
  (`:186`), and stale file + small payload reads the new inline value while an
  intake seam that throws on an unknown path records zero reads (`:220`). The
  host behaviour the clear depends on is probed against a real child process
  rather than assumed — `spawnSync(process.execPath, …)` reports the cleared
  carrier absent from `process.env` and the chosen one present (`:244`).
  Round-trips at both sizes, the large one through a real 0600 temp file
  (`:289`, `:297`).
- `tests/production-subagent-query-model.test.ts:194` — the hash-carrier cell
  (`:195`): a launcher env carrying a stale
  `PI_THETA_SUBAGENT_CALLABLE_HASHES` and a callee with no `.theta` callables;
  the spawned env has the key present and `undefined`, and `PATH` intact.

The pre-existing `tests/subagent-params-marshalling.test.ts` is untouched: its
isolation-view assertions hold under both patch shapes, which is why it never
scored the defect.

## Non-goals

- **The inline-first preference.** `readMarshalledParams` still prefers the
  inline carrier and still returns before consulting the file carrier. Making it
  refuse a two-carrier env outright is the alternative disposition; the emission
  invariant (`subagent-params.ts:228`–`:236`) is what makes the preference safe,
  and relaxing one without the other is the failure this report records.
- **Full environment inheritance.** The child continues to inherit the parent's
  whole environment (`subagent.md:41`) — the credential mechanism. The clear is
  surgical and per-carrier; the witnesses assert unrelated variables survive.
- **The threshold and the channel cutover.** 8192 bytes, the 0600 mode, the
  child's delete-on-read and the parent's backstop delete are unchanged, and
  `tests/subagent-params-marshalling.test.ts` remains their witness.
- **The control-plane authentication.** `authenticateControlPlane` is a separate
  change in the same commit range with its own witnesses; it neither caused nor
  mitigated this defect. Both params carriers are in its key list
  (`production-subagent-host.ts:145`–`:146`), which is why a top-of-chain
  harness that plants a carrier without the parent-pid carriage sees it dropped
  — a separate rule, recorded at `AGENTS.md:66`.
- **The registered runtime codes.** Neither
  `theta/runtime/subagent-params-validation-failed` nor
  `theta/runtime/subagent-callable-hash-mismatch` changes trigger, message or
  severity. This fix removes a way to reach them for the wrong reason; it does
  not restate what they mean.
- **Bug 0165's parser-side default binding.** A `params:` default that binds
  `null` at load time is a single-process defect at a different seam and is
  untouched here.

## Provenance

- Filed from external PR #1 (`feat/omp-host-support`), part 1 host-agnostic fix
  6. The landing commit `7f360d20` states it as "the parent's env patch now
  names BOTH carrier variables on every launch, clearing the unused one. The
  patch layers over the launching process's own environment, which may already
  carry the other carrier, and the child's read prefers the inline carrier — so
  a nested callee could observe its caller's params."
- Review round 1 finding F11 (`.pi/tmp/pr1/review-r1.md:220`) extended the same
  principle to `PI_THETA_SUBAGENT_CALLABLE_HASHES`, which the PR had left as a
  conditional spread one key to the left; `3752003f` landed that half with its
  spec sentence and spawn-env witness. F11's own blast-radius argument
  (unchanged files re-hash identically) is reproduced in §Reproduction (d)
  rather than accepted as a residual.
- `SPAWN-08` is the PR's own label for this defect. It is not a registered
  identifier in the corpus; it appears in the code comments and test headers
  that carry the invariant (`subagent-params.ts:18`, `:151`, `:159`, `:231`;
  `production-theta-producer.ts:1850`;
  `tests/subagent-params-carrier.test.ts:1`).
- Every `src/`, `tests/` and spec citation above was verified against the tree
  at HEAD `3752003f`; the pre-fix elements were read with
  `git show 7f360d20^:…` and `git show faac6841:…` (the same commit, v0.88.0).
  The introduction points were located with
  `git log -S 'export function marshalParams' -- src/runtime/subagent-params.ts`
  → `4866d4d2` (v0.9.0, RFC-0006 child-process theta execution), and
  `git log -S '[SUBAGENT_CALLABLE_HASHES_ENV]: JSON.stringify(callableHashes)'`
  → `fda23a4b` (v0.8.0, RFC-0005 child-process subagent sessions) and
  `3752003f` (the fix), nothing between.
- §Reproduction (a) and (b) are one scratch vitest probe's verbatim output, run
  at HEAD over the shipped module with the pre-fix `marshalParams` reconstructed
  from the `7f360d20^` blob; written, run, deleted, tree re-checked clean.
  §Reproduction (c) and (d) are source traces, marked as such: driving them
  needs a real nested child pair, which the committed witnesses cover at the
  seam instead.
- The two witness files were run at HEAD (13 tests, green); their red direction
  is recorded from the pre-fix measurement in §Reproduction (a), not by
  reverting a shipped hunk.
