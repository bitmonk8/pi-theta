# Bug 0520 — a code-side `bash(...)` call whose command prints nothing binds `Ok("(no output)")`, not `Ok("")`: the host bash tool puts a model-facing placeholder into `content`, the tool-execution lowering passes it through verbatim, and no spec page warns that a code-side Pi-tool string is the host's model-facing rendering, so a theta's `== ""` / `!= ""` emptiness test on command output is silently inverted

- **Status:** open — filed 2026-10-05 from the LPS tooling build (incident
  `docs/process/pi-theta-incidents/20261005T071616Z-lane-incidents-S-001.md`,
  run r-20261004T132829, step S-001; incident text under "Observed",
  offline repro under "Repro" below)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2. S2: a silent wrong value that drives control
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

## Options

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

Tentative recommendation: A now, because it is the honest contract at no
cost, with C as the follow-up if an exact-output code-side `bash` is wanted.
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
