# Bug 0520 — a code-side `bash(...)` call whose command prints nothing binds `Ok("(no output)")`, not `Ok("")`: the host bash tool puts a model-facing placeholder into `content`, the tool-execution lowering passes it through verbatim, and no spec page warns that a code-side Pi-tool string is the host's model-facing rendering, so a theta's `== ""` / `!= ""` emptiness test on command output is silently inverted

- **Status:** fixed (unreleased - commit/push only) — documentation/test fix;
  rendered-text runtime behavior is unchanged. No new package release is
  published. The existing published package version does not contain this fix;
  no resolving commit SHA is assigned here.
- **Filed:** 2026-10-05 from the LPS tooling build (incident
  `docs/process/pi-theta-incidents/20261005T071616Z-lane-incidents-S-001.md`,
  run r-20261004T132829, step S-001; incident text under "Observed",
  offline repro under "Repro" below).
- **Decision:** Option A implemented — document rendered-text pass-through;
  no placeholder normalization. See §Approved ruling and §Fix record.
  Exact-output capture is separate future work.
- **Owning repo:** pi-theta
- **Sev/Diff estimate (at filing, before ruling):** S2/D2. S2: a silent wrong value that drives control
  flow. A command that prints nothing yields the 11-byte string
  `(no output)`. `.trim()` keeps it, so `out == ""` is `false` and
  `out != ""` is `true`. Nothing fails: no `Err`, no note, no diagnostic. In
  the LPS incident the inverted test ran a destructive
  `git reset --hard HEAD; git clean -fdq` on a resumed lane, then logged a
  false "discarded a dead lane's uncommitted leftovers" incident. The tree was
  clean, so nothing was lost this time. Every resumed lane takes the same
  branch. D2: the code change is small, but the fix needs a spec decision
  first. The choice is between documenting verbatim pass-through and
  normalising a host placeholder; the second conflicts with the spec's
  stance against matching host wording (see Options).
- **Where (pi-theta, main 14cef640, 0.496.0):**
  - `src/runtime/tool-call-execute.ts:147-166` — `filterJoinToolText` keeps
    the `type === "text"` blocks and joins their `.text` with `"\n"`.
    `:179-189` — `lowerResolvedToolEnvelope` returns
    `makeOk(filterJoinToolText(envelope.content))`. This matches the spec as
    written. It has no knowledge of host placeholders.
- **Where (host — the placeholder):**
  - pi-coding-agent 0.80.10 (repo devDependency)
    `dist/core/tools/bash.js:273-275` — `formatOutput(snapshot, emptyText =
    "(no output)")` sets `text = snapshot.content || emptyText`. `:322-323`
    — on exit code 0 the tool returns
    `{ content: [{ type: "text", text: outputText }], details }`, and
    `details` is `undefined` when output was not truncated. The throw paths
    pass `emptyText = ""` (`:308`). The placeholder appears only on the
    success path.
  - pi-coding-agent 0.87.1 (operator's global install)
    `dist/core/tools/bash.js:219-221`, `:272` — same code.
  - The same verbatim pass-through also carries the host's model-facing
    truncation trailer (`\n\n[Showing lines …. Full output: …]`,
    0.80.10 `:279-290`) into the bound string. That trailer is the same class
    of problem but is out of scope for this record.
- **Spec:**
  - `docs/spec_topics/tool-calls.md:37` (*Return type*, Pi tool row): "theta
    1.0 returns the tool's final output as a single `string`".
  - `docs/spec_topics/pi-integration-contract/host-interfaces-core.md:110`
    (*Tool execution from theta code*): theta reads only `content`, joins
    the text blocks, and "An empty result string — either `content: []` or a
    content array with no surviving text blocks — is a legal `Ok("")`
    value"; `:112` (*Outcome routing summary*): "a cleanly-resolving
    `AgentToolResult` lowers to `Ok(<filtered/joined text>)` (possibly
    `Ok("")`)".
  - `docs/spec_topics/tool-calls.md:47` (`compact` arm): "the runtime MUST
    NOT string-match or classify the host wording". This is the house stance
    that Option B below would depart from.

The symptom, observations, expected/actual descriptions, root-cause analysis,
options and offline repro below preserve the filing-time record. The current
fix, verification and remaining limits are recorded in §Fix record.

## Symptom

A theta calls the host `bash` tool from code, e.g.
`let left = bash({ command: "git status --porcelain 2>&1 | head -40" })?.trim()`.
The command exits 0 with empty stdout/stderr. `left` binds `"(no output)"`,
and `left != ""` takes the "there is output" branch.

## Observed (LPS tooling build, 2026-10-05)

- Incident bundle (verbatim item):
  `resume: discarded a dead lane's uncommitted leftovers: (no output)`.
- Producer: `LocalProjectService/.pi/theta/workers/step-lane.theta:215-225`
  (same text in `step-lane-xhigh.theta`). A resumed lane (`mode == "full"`,
  branch already carrying commits) runs
  `git status --porcelain --untracked-files=all 2>&1 | head -40`, trims the
  result, and if `left != ""` runs
  `git reset -q --hard HEAD; git clean -fdq` and records the incident. The
  recorded leftovers are the literal placeholder, which shows the porcelain
  output was empty and the branch ran on a clean tree.
- The bundle's open-bug line (0494/0497/0502/0503) is the standing
  THETAS §11 re-citation. None of those four is involved here.
- No pi run or model turn was made for this filing. The host behaviour was
  reproduced offline (Repro), and the code facts above were read at main
  14cef640.

## Expected

The spec's two descriptions disagree for this case. "the tool's final
output" (`tool-calls.md:37`) reads as the command's output, which is empty.
The lowering rule (`host-interfaces-core.md:110`) binds the host's `content`
text, which is not empty. Either the code-side value is `Ok("")` for a
command that printed nothing, or the spec says plainly that a code-side Pi-tool
call binds the host's model-facing rendering and names the host `bash`
placeholders a theta author will see. Today neither holds.

## Actual

`Ok("(no output)")`. It cannot be told apart from a command that really
printed `(no output)`, and no spec page, reference page or diagnostic mentions
it. Thetas that test command output for emptiness (25 files under LPS
`.pi/theta/` contain an `== ""` / `!= ""` comparison; not all of them are on
`bash` output) are wrong in the empty case unless the author appended a
sentinel.

## Root cause

The host `bash` tool's `content` is written for a model reader, and an empty
tool result is replaced with a human-readable placeholder. pi-theta's
code-side lowering takes that model-facing `content` as the program value
without change. The spec defines the value by the envelope shape
(`content` → joined text) and never says that the text is presentation, not
data.

## Approved ruling

The operator approved Option A: code-side Pi-tool calls bind the host's
model-facing rendered text verbatim, not exact command output. Document this
contract prominently, including bash's empty-output placeholder and truncation
text, and pin pass-through in a witness test. Do not normalize `(no output)`:
the envelope cannot distinguish the placeholder from genuine command output.

The supported immediate mitigation is explicit caller-generated sentinels or
structured markers for machine decisions. In particular, do not decide whether
to run destructive cleanup by comparing rendered bash text to `""`.

Exact-output capture is a separate future capability, not authorized runtime
work under this ruling. Option C remains worth designing if that capability is
wanted, with backend compatibility, truncation, and resource limits verified.
This ruling authorizes the documentation/test fix, not placeholder matching.

## Options (historical analysis; A approved)

- **A — spec only (D1).** State in `tool-calls.md` (*Return type*) and
  `host-interfaces-core.md` (*Tool execution from theta code*) that a
  code-side Pi-tool call binds the host's model-facing text verbatim. List
  the built-in `bash` artefacts: `(no output)` for empty success output, the
  truncation trailer, and the `Command exited with code N` suffix on the
  `Err` message. Add an editorial-review checklist item under the Pi
  version-bump procedure, since no typed contract pins the wording. Pro: no
  host-wording matching, so it fits the `compact` stance. Con: the trap
  stays in place. Each author has to add their own sentinel
  (`…; echo __END__`) or exit-code probe.
- **B — normalise the one placeholder (D2).** When the callee is the host
  built-in `bash`, the envelope is exactly one text block equal to
  `(no output)`, and `details` is `undefined`, lower to `Ok("")`. Pro: the
  natural `== ""` test works. Con: it matches host wording, which goes against the
  `tool-calls.md:47` stance. A command that literally prints `(no output)`
  then binds `""`. It needs a surface-inventory or checklist pin so that a
  rewording in a Pi minor is caught. It does nothing for the truncation
  trailer.
- **C — runtime-owned capture for code-side `bash` (D3).** Dispatch code-side
  `bash` through the host's `createBashToolDefinition` with runtime-supplied
  `operations` whose `exec` forwards to the local implementation and also
  collects the raw `onData` bytes, then bind the raw capture rather than the
  model-facing `content`. Pro: exact output with no placeholder and no
  trailer. Con: the code-side and model-facing `bash` diverge on purpose.
  It interacts with the host's truncation and temp-file policy. It is
  bash-specific, and it is unverified that every operator-configured bash
  backend (spawn hooks, remote operations) can be wrapped this way.

Approved recommendation: A now, because it is the honest contract without a
runtime behavior change, with C a separate follow-up if an exact-output
code-side `bash` is wanted.
B is listed for completeness. It is the smallest change that fixes the
common case, but it is the only option that breaks the no-host-wording
stance.

## Repro (offline, no model)

1. In an empty git repo, with pi-theta's devDependency host:
   ```js
   const m = await import("file:///C:/UnitySrc/pi-theta/node_modules/@earendil-works/pi-coding-agent/dist/index.js");
   const def = m.createBashToolDefinition(process.cwd());
   for (const command of ["true", "git status --porcelain --untracked-files=all 2>&1 | head -40", "printf ''"]) {
     const r = await def.execute("repro", { command }, undefined, undefined, undefined);
     console.log(JSON.stringify(command), "->", JSON.stringify(r.content), JSON.stringify(r.details));
   }
   ```
2. Observed (0.80.10, 2026-10-05): all three print
   `[{"type":"text","text":"(no output)"}] undefined`.
3. `filterJoinToolText` over that envelope returns `"(no output)"`, so a
   theta `bash({ command: "true" })?` binds `"(no output)"` and
   `bash({ command: "true" })? == ""` is `false`. A witness test should
   assert the chosen contract with a stub `bash` tool that returns this
   exact envelope: under A, the spec text plus a pinned `Ok("(no output)")`
   test; under B or C, `Ok("")`.

## LPS incident

`LocalProjectService/docs/process/pi-theta-incidents/20261005T071616Z-lane-incidents-S-001.md`

## Fix record

**Fixed in the working checkout, unreleased - commit/push only.** This closes
only the approved documentation/test defect. A successful empty bash command
still binds `Ok("(no output)")`; a genuine literal `(no output)` still binds the
same value. No placeholder normalization, raw-output API or error-routing
change is included. No new package release is published, and the existing
published package version does not contain this fix. The shipment commit will
supply any resolving SHA; the validation base below is not a fixing commit.

### Cause and actual change

The host formats a model-facing text channel, not raw process output.
At the repo-pinned Pi 1.3.0 host, `formatOutput`
(`node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js:233–250`)
uses `snapshot.content || "(no output)"` and can append a truncation trailer.
`resolvePiTool` (`src/extension/callable-pi-tool-resolver.ts:144–158`) retains
only `result.content`. `filterJoinToolText` and `lowerResolvedToolEnvelope`
(`src/runtime/tool-call-execute.ts:154–187`) preserve surviving text blocks,
join them with one LF, and wrap the string in Ok. Equality and trim are not
broken. The missing warning encouraged a raw-output assumption that the
existing lowering contract does not support.

The exact S1–S5 proposal, approved by the controller-recorded delegated Astra
decision `6063b0f3-ca4d-43d8-9b61-33cf45609f24`, implements the owner's Option A:

- [Tool Calls — Return type](../spec_topics/tool-calls.md) now defines the
  Pi-tool string as model-facing host `content`, not raw capture, and warns
  about empty/literal ambiguity, truncation/status presentation and unsafe
  emptiness comparisons (`:64,70–74` in the validated checkout).
- [Tool execution from theta code — Rendered-text boundary](../spec_topics/pi-integration-contract/host-interfaces-core.md#tool-execution-from-theta-code)
  makes verbatim pass-through explicit while preserving legal `Ok("")` for
  truly empty/no-text envelopes (`:110–118`). Empty envelope and empty shell
  command are distinct cases. Caller markers require validation; missing,
  malformed or truncated markers do not prove emptiness or success and must
  not authorize destructive cleanup.
- [Version-bump checklist item (aw)](../spec_topics/pi-integration-contract/version-bump-step2.md#bump-checklist-code-side-rendered-tool-text)
  adds a SHOULD-level host-rendering audit with mandatory per-item outcome
  recording; exactly four preamble range endpoints extend to (aw). Existing
  (av) and checklist CRLF line endings are preserved.
- Added `tests/live/acceptance/b0520-rendered-bash-output.test.ts` and
  `tests/b0520-rendered-bash-output.test.ts`. Their accepted red-source bytes,
  assertions and witness commands/signatures are unchanged after the fix.

No runtime, harness, dependency, package-version or other bug fix is included.

### Red → green evidence, controls and review

Run artifacts are retained under:

```text
.pi/tmp/fix-bug-0520-75977a6f-ad5b-44c5-9d6b-00481c627316/
```

The run starts from validation base
`1378c0abd44f0bafa35bedf993b296e72a580f7c`. `close.md` in that directory records
full command/capture details, authority, hashes and closure checks. Earlier
reports, interrupted attempts, decisions and original red artifacts remain
intact.

Exact witness commands (from the checkout root):

```sh
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0520-rendered-bash-output.test.ts
npx vitest run tests/b0520-rendered-bash-output.test.ts tests/tool-calls-execute-lowering.test.ts
```

| Evidence | Exit | Retained artifact / result |
| --- | --- | --- |
| Accepted pre-fix live witness | 1 | `reproduce-attempt-2-live-doc-red.log`; missing-documentation assertion after real-host controls succeed. |
| Pre-fix offline isolation | 1 | `diagnose-attempt-1-unit-red-controls.log`; 11 documentation failures, 37 passing controls. Independent evidence review repeats this in `evidence-review-independent-unit.log`. |
| Post-fix live witness | 0 | `implement-attempt-1-live-green.log`; unchanged case passes. Controller repeats in `green-1-0.json` and `gate-1-initial-2.json`; independent review repeats in `fix-review-independent-live.log`. |
| Post-fix offline witness | 0 | `implement-attempt-1-unit-green.log`; 48/48 pass. Controller repeats in `green-1-1.json`; independent review repeats in `fix-review-independent-unit.log`. |
| Full offline gate, `npm test` | 0 | `implement-attempt-2-default.log` and controller `gate-1-initial-1.json`; each has 758 passing files / 12,926 passing tests, including committed-fixture and provider-free real-child controls. |
| Typecheck, `npm run typecheck` | 0 | `implement-attempt-1-typecheck.log` and controller `gate-1-initial-0.json`; no diagnostics. |
| Lint, `npm run lint` | 0 | `implement-attempt-1-lint.log`; no diagnostics. |
| Operator Pi 1.4.0 real-host control | 0 | `fix-review-operator-host.log`; checkout extension and preserved witness theta exercise the same empty/healthy/literal/sentinel values. |

The accepted live red is specifically:

```text
AssertionError: B0520 tool-calls rendered bash warning: empty placeholder: expected false to be true // Object.is equality
```

This is a documentation red with a real production-path prerequisite, not an
invented runtime-normalization failure or provider error. The original green
runtime-control capture is separately preserved. The delegated reproduce
decision `a57eeef8-c58f-44cb-b3aa-e1ad8ebf59f9` authorizes this bounded hybrid
witness; it does not waive host/provider assertions.

Live captures prove production discovery, registration, interpreter, direct
built-in bash, lowering, query interpolation and an actual successful
`openai/gpt-6.1-sol` turn. The full JSONL streams show host exit 0, empty stderr,
no `theta_result` envelope or fail-closed system note, exact theta-computed
bindings, and one assistant with stop reason `stop` and arithmetic answer
`777`. Empty and trimmed-empty comparisons are false; healthy output, genuine
literal output and the caller sentinel are checked separately. Runtime-oracle
controls reject normalization, inverted emptiness and a lost sentinel.
Editorial controls independently reject each removed topic marker; offline
controls additionally preserve true empty/no-text envelopes, whitespace,
synthetic trailers and content-only lowering despite auxiliary metadata.

`reviews.md` records **CLEAN — no actionable in-scope must-fix findings for fix
focus**. The independent review checks actual prose semantics, exact approved
bytes, literal ambiguity, marker limitations, checklist ranges/recording,
original red preservation and green gates; it is not a token-only review.
`evidence-review.md` separately records CLEAN evidence review.

The first `npm test` attempt was interrupted by a 240-second tool timeout;
`implement-attempt-1-default.log` has no final result or saved exit and is not
counted as a pass. The recorded existing-scope retry completed the unchanged
full gate with a 900-second tool budget. No quality loop, gate waiver, test
weakening, staging, commit, push, tag or publication occurred in this fix run's
stage work.

### Residuals and limits

- The broader preexisting `isError`/nonzero-routing and host-shape prose
  inconsistency remains: `tool-calls.md:76,93` describes an `isError` failure
  arm, while `host-interfaces-core.md:110` and the content-only direct adapter
  describe different consumption. The new warning documents nonzero text as
  presentation only; it neither resolves nor newly endorses that discrepancy.
- Real truncation and nonzero execution are source-supported examples, not
  live-exercised B0520 cases. A synthetic trailer proves pass-through only.
  Remote/custom/subagent bash, exact stdout/stderr/status capture and the
  historical external LPS destructive incident are not established here.
- The operator-host control additionally covers Pi 1.4.0; it is not a claim
  about every compatible host or backend. Checklist (aw) addresses future
  wording drift without classifying host text in the runtime.
- Exact-output capture remains separate future work. Caller markers are not
  guaranteed complete capture or trustworthy status channels. External LPS
  callers were not changed and no destructive cleanup was run.
- Related open [0495](./0495-h9a-area-f-code-tool-loop-vacuous-enoent.md) and
  [0505](./0505-invoked-prompt-callee-missing-imports.md) remain outside this
  fix. No full unrelated live-suite success is claimed and no known failing
  gate was waived.

## Provenance

Historical incident and offline observations above retain their original
filing attribution. The current cause is supported by the installed host
formatter, `resolvePiTool`, `filterJoinToolText` and
`lowerResolvedToolEnvelope`; the contract comes from the owner's §Approved
ruling and exact recorded S1–S5 approval. Current red/green, gate and review
claims come from the named captures and reports in the retained run directory,
not from the existing published package version or an invented fixing SHA.
