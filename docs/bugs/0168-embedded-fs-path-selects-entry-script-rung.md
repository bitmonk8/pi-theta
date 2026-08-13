# Bug 0168 — The executable-resolution ladder's rung-1 existence check answered `true` for a `process.argv[1]` inside a compiled host binary's OWN embedded filesystem, so every subagent invocation on a compiled-binary install selected the entry-script rung and spawned `<host-binary> /$bunfs/root/…/cli.js --mode json -p "/<slug>" …` — where the embedded path is not an entry script the binary can run but a stray leading POSITIONAL argument, which the host CLI parses into `messages` and print mode prompts as an unauthored user turn ahead of the callee, with no diagnostic on any surface

- **Status:** fixed (0.89.0) — in the host-portability change (external PR #1,
  part 1) at HEAD `3752003f`. Both halves landed in that change: the production
  existence check now rejects an embedded-filesystem path ahead of the disk
  probe, and the spec's rung-1 sentence gained the MUST that names the
  obligation. The ladder itself (`resolveSubagentExecutable`) is unchanged —
  the defect and the fix are both entirely in what `fileExists` answers.
- **Sev/Diff estimate:** S1/D2 — S1 because the outcome is silent wrong
  behaviour on the production path with no diagnostic on any surface: on a
  compiled-binary install every subagent invocation spawned a child whose
  private conversation carries an unauthored user turn — a spent model turn on
  a nonsense path string — ahead of the callee's slash invocation, and the
  parent's envelope scan is stray-line tolerant (`scanStreamForEnvelope`), so
  the invocation reports success and nothing names the cause; the same
  selection makes the Step 0 (f) probe's "assert a runnable child entry point"
  pass on a rung whose own premise ("the child is the exact same binary + entry
  script as the parent") is false. D2 because the fix is one exported predicate
  composed ahead of one `existsSync` in one file plus one spec sentence, with no
  new registry row — D2 rather than D1 because the predicate's ANCHORING is the
  load-bearing decision and it carries a two-directional witness obligation: a
  bare substring test also rejects a real installation under a directory named
  `~BUNDLE`, and a wrong rejection here is not harmless, because it falls
  through to rung 2 and, under a generic runtime, to the closed refusal that
  disables every subagent invocation.
- **Kind:** defect — the implementation answered a question the ladder's premise
  does not ask, and the specification's rung-1 sentence stated no obligation
  that would have caught it. Three elements, cited at HEAD `3752003f`.
  1. *The rung-1 arm is decided entirely by `fileExists`.*
     `resolveSubagentExecutable` (`src/runtime/subagent-launcher.ts`) selects
     rung 1 on `host.argv1 !== undefined && host.fileExists(host.argv1)` and
     returns `{ rung: 1, execPath: host.execPath, scriptArgs: [host.argv1] }`.
     The ladder holds no filesystem access of its own, so the correctness of
     rung-1 selection is wholly delegated to the injected host's predicate.
  2. *The production discharge asked "can THIS process stat it?".* Before the
     fix, `createProductionExecutableHost().fileExists`
     (`src/extension/production-subagent-host.ts`) was a bare
     `existsSync(path)`. Inside a compiled host binary — Pi ships a Bun
     single-file executable — `process.argv[1]` is a path in the executable's
     own embedded filesystem (`/$bunfs/root/…/cli.js` POSIX,
     `<drive>:\~BUN\…` Windows). The running process can stat that path, so
     `existsSync` answers `true`; no spawned child can open it. The question
     rung 1 needs answered is "could a CHILD open this?", and `existsSync` does
     not answer it. That host is the sole production `ExecutableHost`: it is
     constructed once in `composePass`
     (`src/extension/production-composition.ts`, `passExecutableHost ??
     createProductionExecutableHost()`) and the same instance feeds both the
     Step 0 (f) probe (`probeSubagentExecutable`) and every launch
     (`launchSubagentChild`), so the wrong answer is deployment-wide rather
     than per-theta.
  3. *The spec named no obligation.* Rung 1 of
     `docs/spec_topics/pi-integration-contract/subagent.md#subagent-executable-resolution`
     said only that `process.argv[1]` "names an existing file". No sentence in
     the section, in `capability-probe.md` sub-step (f), or in the
     `theta/load/subagent-executable-unresolved` registry row
     (`docs/spec_topics/diagnostics/code-registry-load.md`) required the check
     to answer false for a path no child can open, and `(f)` is pinned as
     `filesystem-existence`-only, which a bare `existsSync` satisfies to the
     letter.
- **Related:**
  - **0002** —
    [`0002-subagent-child-hangs-under-acceptance-pi-p.md`](./0002-subagent-child-hangs-under-acceptance-pi-p.md),
    **fixed (0.12.0)**. Same launch surface, different half: 0002 owned the
    child's stdio (an open parent-held stdin pipe deadlocked the pair before the
    argv prompt was processed), this report owns the child's argv. The two are
    disjoint and neither fix moves the other's bytes; the stdin-closed spawn
    0002 installed is what lets the argv defect surface as a completed
    invocation rather than a hang.
  - **0008** —
    [`0008-subagent-child-drops-all-but-last-theta-root.md`](./0008-subagent-child-drops-all-but-last-theta-root.md),
    **fixed (0.17.0)**. The other assembled-argv defect, and the neighbouring
    rule this report must not disturb: 0008 pinned ONE `--theta` flag joining
    every discovery root with `path.delimiter`, because the host resolves a
    repeated extension string flag to its last occurrence. This report changes
    nothing `assembleSubagentArgv` emits — only whether `scriptArgs` is
    prepended to it.
  - **The same change's `HostCliDialect` work.** `HostCliDialect`,
    `PI_CLI_DIALECT`, `OMP_CLI_DIALECT` and `resolveHostCliDialect`
    (`src/runtime/subagent-launcher.ts`) landed in the same PR and touch the
    same two files, by a disjoint mechanism: the dialect governs which FLAGS the
    assembled argv spells an intent with, this report governs whether a
    positional is prepended to that argv at all. Neither reads the other's
    inputs — the dialect is resolved from the host's own `CONFIG_DIR_NAME`, the
    rung from `argv1`.
- **Affected** (citations verified against the tree at HEAD `3752003f`; symbols
  named rather than lines, per
  [0134](./0134-params-shift-induced-stale-citations.md)'s do-not-chase class):
  - **The ladder.** `resolveSubagentExecutable`, `ExecutableHost` (its
    `fileExists` member and the rung-1 obligation now documented on it),
    `ExecutableResolution`, and `launchSubagentChild`'s argv composition
    `[...resolution.scriptArgs, ...assembleSubagentArgv(argvInput, dialect)]` —
    all `src/runtime/subagent-launcher.ts`.
  - **The production discharge.** `EMBEDDED_FS_ROOT`, `isEmbeddedFsPath` and
    `createProductionExecutableHost` (its `fileExists`, `configDirName`,
    `isGenericRuntime` members) — all
    `src/extension/production-subagent-host.ts`.
  - **The composition root.** `composePass`'s
    `passExecutableHost ?? createProductionExecutableHost()` and the
    `ComposeSeamOverrides.subagentExecutableHost` test-injection seam
    (`src/extension/production-composition.ts`), which is the reason the
    resolved host is one instance per pass shared by probe and launch.
  - **The probe.** `probeSubagentExecutable` and
    `SUBAGENT_EXECUTABLE_UNRESOLVED_CODE` /
    `SUBAGENT_EXECUTABLE_UNRESOLVED_MESSAGE`
    (`src/extension/capability-probe.ts`, `src/runtime/subagent-launcher.ts`) —
    the load-time gate that passed on the mis-selected rung.
  - **The parent-side reader that absorbed the extra output.**
    `scanStreamForEnvelope` (`src/runtime/subagent-envelope.ts`), documented in
    its own module header as "stray-line-tolerant stream scanning", and
    `SUBAGENT_EXIT_WITHOUT_ENVELOPE_CODE`, the diagnostic that did NOT fire.
  - **Spec.** `docs/spec_topics/pi-integration-contract/subagent.md`
    `#subagent-executable-resolution` rung 1 (the anchor; it now carries the
    MUST) and rung 2 (the rung that is runnable on this deployment);
    `docs/spec_topics/pi-integration-contract/capability-probe.md` sub-step
    `(f)` and `#pic-5` (the `filesystem-existence`-only carve-out, unchanged);
    `docs/spec_topics/diagnostics/code-registry-load.md`, the
    `theta/load/subagent-executable-unresolved` row (unchanged — no new code,
    and no new input enters its emission set on the Pi host).
  - **The vendored host CLI, read as evidence.** `parseArgs`
    (`node_modules/@earendil-works/pi-coding-agent/dist/cli/args.js`), whose
    final arm pushes any argument not starting with `-` or `@` onto
    `result.messages`; `main(process.argv.slice(2))`
    (`dist/cli.js`); and `runPrintMode`
    (`dist/modes/print-mode.js`), which iterates `messages` and awaits
    `session.prompt(message)` for each, in order.
  - **The witnesses.** `tests/subagent-child-launch.test.ts`, the describe
    block *"rung 1 — embedded-filesystem paths are rejected (`isEmbeddedFsPath`
    + the production `fileExists`)"* — four cells: every spelled form of the
    embedded root; the anchor negatives; the composed `fileExists`; and the
    ladder fall-through on a modelled compiled-binary host whose stat answers
    true.
- **Observed at:** v0.88.0 and every release back to the RFC-0005
  executable-resolution ladder (0.8.0; the `--mode json -p "/<slug>"` child argv
  this report's mechanism describes dates from the RFC-0006 rebase in 0.9.0 —
  both per `CHANGELOG.md`). Established by source trace over the shipped ladder,
  probe and composition root at HEAD `3752003f`, plus a driven, offline
  measurement of the vendored host CLI's `parseArgs` over the corrupted argv
  (§Reproduction (c)). The one premise NOT re-measured here is the compiled-
  binary `existsSync` verdict itself: this session had no compiled host binary
  to run, so "the running process can stat its own embedded-filesystem path"
  is taken from the fix's own design note and the host's single-file-executable
  layout, not from a measurement.

## Summary

The executable-resolution ladder delegates rung-1 selection wholly to the
injected host's `fileExists`. The production discharge implemented that
predicate as `existsSync`, which answers "can THIS process stat the path?" —
not the question rung 1 asks, which is "could a spawned CHILD open it?". The
two answers agree everywhere except the one deployment where the difference
decides the rung: inside a compiled host binary, `process.argv[1]` is a path
into the executable's own embedded filesystem, statable by the running process
and openable by nobody else.

There, `fileExists` answered `true`, rung 1 was selected, and
`launchSubagentChild` prepended the embedded path to the assembled argv — so
the child was spawned as `<host-binary> /$bunfs/root/…/cli.js --theta <dirs>
--mode json -p "/<slug>" …`. The host binary does not read that leading
argument as an entry script; it reads it as a positional. Pi's `parseArgs` puts
it in `result.messages` ahead of the slug that `-p` contributes, and
`runPrintMode` prompts every entry of `messages` in order. The child therefore
ran one unauthored user turn on the embedded path string before the callee's
slash invocation, on every subagent invocation of that install.

Nothing reported it. The Step 0 (f) probe passed, because it asserts a runnable
entry point by running the same ladder. The parent's envelope scan is
stray-line tolerant, so the extra turn's `--mode json` events were absorbed and
the `theta_result` envelope was still found. The spec's rung-1 sentence said
only "names an existing file", so the implementation was conformant to the text.

## Reproduction

Source trace at HEAD `3752003f` over the shipped ladder and composition root,
plus one driven offline measurement of the vendored host CLI. Input: a host
process whose `process.argv[1]` is an embedded-filesystem path and whose
`process.execPath` is the compiled host binary.

### (a) The ladder's verdict is decided by `fileExists` alone

`resolveSubagentExecutable` (`src/runtime/subagent-launcher.ts`) is unchanged by
the fix. Its rung-1 arm is a two-term conjunction over the injected host, so the
pre-fix and post-fix verdicts differ only in what the predicate answers:

| `fileExists(argv1)` | verdict | spawned as |
| --- | --- | --- |
| `true` (pre-fix `existsSync` under a compiled binary) | rung 1 | `execPath` + `scriptArgs: [argv1]` |
| `false` (post-fix) | rung 2 | `execPath` + `scriptArgs: []` |

The shipped witness pins the second row directly — the cell *"an embedded
`argv1` falls through rung 1 to rung 2 on a modelled compiled-binary host (stat
answers true)"* (`tests/subagent-child-launch.test.ts`) injects
`fileExists: (path) => !isEmbeddedFsPath(path)`, which is a compiled-binary host
with the fix in place, and measures `rung 2`, `execPath` `/opt/pi/pi`,
`scriptArgs` `[]`. The first row is the same function under the same-file cell
*"rung 1: when `argv[1]` names an existing file, spawn `execPath` … with that
script"*, whose host answers existence `true`.

### (b) The argv rung 1 assembles

`launchSubagentChild` composes
`[...resolution.scriptArgs, ...assembleSubagentArgv(argvInput, dialect)]`. With
no extension pin (the production default) `assembleSubagentArgv` starts at
`--theta`, so the child argv is:

```
/$bunfs/root/cli.js --theta <roots> --mode json -p "/<slug>" --no-session
  --system-prompt <sp> --tools <csv> --provider <p> --model <id>
  --no-skills --no-prompt-templates --no-themes --no-context-files --no-approve
```

The embedded path occupies position 0 — ahead of every flag — because
`scriptArgs` is prepended.

### (c) What the host CLI does with that argv — driven

Measured against the vendored Pi SDK at HEAD by importing `parseArgs`
(`node_modules/@earendil-works/pi-coding-agent/dist/cli/args.js`) and passing the
argv above. Verbatim output:

```
messages          = ["/$bunfs/root/cli.js","/callee"]
print             = true    mode = json    diagnostics = []

windows spelling  = ["B:\\~BUN\\root\\cli.js","/callee"]   diagnostics = []

control (no prepended path)
messages          = ["/callee"]
```

The mechanism is `parseArgs`'s final arm: an argument that starts with neither
`-` nor `@` is pushed onto `result.messages`. A POSIX embedded path starts with
`/` and a Windows one with a drive letter, so both take that arm; neither
produces a parse diagnostic, so `main`'s error-exit gate does not fire. `-p`
then contributes `/<slug>` as the second message.

Under a compiled binary the child's own runtime supplies `process.argv[1]`
itself, and `dist/cli.js` calls `main(process.argv.slice(2))` — so the path the
parent passed is the first argument the CLI parses, exactly as measured above.

### (d) What print mode does with two messages

`runPrintMode` (`dist/modes/print-mode.js`) destructures `messages` and runs:

```js
for (const message of messages) {
    await session.prompt(message);
}
```

One full agent turn per entry, in order. The child therefore drives a model turn
on `/$bunfs/root/cli.js` as a plain user message, and only then invokes
`/<slug>`.

### (e) Why the parent observed success

`scanStreamForEnvelope` (`src/runtime/subagent-envelope.ts`) is stray-line
tolerant by construction — its module header states it — so the extra turn's
`--mode json` event lines are skipped and the callee's `theta_result` envelope
is still found. `theta/runtime/subagent-exit-without-envelope` does not fire,
and no other diagnostic covers the case. The invocation completes and reports
success.

### (f) Why the load-time gate did not catch it

`probeSubagentExecutable` (`src/extension/capability-probe.ts`) asserts a
runnable entry point by calling `resolveSubagentExecutable` and accepting any
`ok` verdict. Rung 1 was `ok`, so Step 0 (f) passed and
`theta/load/subagent-executable-unresolved` was never constructed. The probe is
`filesystem-existence`-only by `#pic-5`, so it could not have detected the
difference on its own; the detection has to live in the predicate.

## Expected behaviour

- `docs/spec_topics/pi-integration-contract/subagent.md#subagent-executable-resolution`
  rung 1 — "spawn `process.execPath` (the Node/Bun binary) with that script as
  its first argument. The child is the exact same binary + entry script as the
  parent." A path no child can open does not satisfy that premise: the spawned
  process is not "the same binary + entry script", it is the same binary plus a
  string it will read as input.
- The same section, rung 2 — "When `process.argv[1]` is unusable and
  `process.execPath` is not a generic runtime … Pi itself is the executable."
  A compiled-binary deployment is precisely the deployment rung 2 exists for,
  and `argv1` pointing into the binary's own embedded filesystem is precisely
  what "unusable" has to mean there, or rung 2 is unreachable on the only
  deployment that needs it.
- The same section — "If both rungs fail, resolution fails closed at load time."
  The design's stated posture is that an unverifiable capability refuses loudly
  rather than degrading silently. Selecting a rung that spawns a child with a
  corrupted argv is a silent degradation, which the posture excludes.
- `docs/spec_topics/pi-integration-contract/capability-probe.md` sub-step `(f)`
  — the check exists to "assert a runnable child `pi` entry point". An assertion
  that passes on an entry point that is not runnable as an entry point asserts
  nothing on that deployment.
- `docs/STYLE.md` §Claims — a normative sentence that states a check ("names an
  existing file") without stating the property the check exists to establish is
  a sentence an implementation can satisfy while defeating its purpose.

## Actual behaviour / root cause

The root cause is a question mismatch, not a wrong filesystem call. `existsSync`
is a correct implementation of "does this path exist for me". Rung 1 needs "is
this path an entry script a child process can execute", and on every ordinary
deployment those two questions have the same answer, so the substitution is
invisible until a host ships as a single-file executable. At that point
`process.argv[1]` names a real, statable entry inside a virtual root that exists
only in the running process's address space.

The ladder cannot discharge the obligation itself: it is deliberately
ambient-free and holds no filesystem access, taking `fileExists` as an injected
member of `ExecutableHost`. So the obligation has to be stated on the seam and
met by the production discharge — and before the fix it was stated in neither
place. The spec sentence described the mechanism ("names an existing file")
rather than the property, and the production host implemented the mechanism
exactly.

The consequence compounds because rung 1's failure mode is not a failure. Had
the embedded path caused the spawn to throw, `launchSubagentChild` would have
emitted `theta/runtime/subagent-spawn-failed` and the invocation would have been
routed fail-closed. Instead the spawn succeeds — the executable is the host
binary either way — and the only difference is one extra argument, which the
host CLI absorbs as input rather than rejecting. Every downstream surface that
could have reported the anomaly is, correctly, tolerant: `parseArgs` records no
diagnostic for a positional, print mode prompts what it is given, and
`scanStreamForEnvelope` skips lines it does not recognise.

## Why it matters

- **The callee ran in a conversation it did not author.** The child's private
  transcript opened with a user turn nobody wrote, and the model's answer to it
  is context for every query the callee subsequently makes. The callee's final
  value is derived from a conversation whose first exchange is an artefact of
  argv assembly.
- **One unbudgeted model turn per subagent invocation.** `session.prompt` is a
  full agent turn. On a compiled-binary install, every subagent-mode slash
  invocation, every `invoke(...)` of a subagent-mode callee, and every `.theta`
  callable call paid for one.
- **It was silent on every surface.** No load diagnostic, no runtime
  diagnostic, no envelope failure, no non-zero exit. An operator seeing an odd
  first turn in a child that is documented as private has no channel that names
  argv assembly as the cause.
- **It made the load-time capability assertion vacuous where it mattered
  most.** Step 0 (f) exists so that an unresolvable child executable refuses at
  load instead of failing at first spawn. On the deployment where rung 1 is not
  runnable, it passed on rung 1.
- **Host portability widens the exposure rather than narrowing it.** The same
  change that fixes this adds a second supported host with its own CLI. A
  compiled-binary distribution is the ordinary shipping form for such a host,
  so the set of installs on which the pre-fix predicate answers wrongly grows.
- **The failure direction of an over-eager fix is total.** Rejecting a path that
  is NOT embedded falls through to rung 2 and, under a generic `node` / `bun`
  runtime, to the closed both-rungs-fail refusal, which un-registers every
  subagent-mode theta at load. That is why the shipped predicate is anchored
  rather than a substring test, and why the anchor is witnessed in both
  directions.

## Fix (0.89.0)

Landed with the host-portability change (external PR #1, part 1); both halves in
the same pass.

**Implementation.** `isEmbeddedFsPath` (`src/extension/production-subagent-host.ts`)
is an exported predicate over `EMBEDDED_FS_ROOT`, a case-insensitive regex
matching the three marker spellings the host's own `isBunBinary` tests —
`$bunfs`, `~BUN`, and the URL-encoded `%7EBUN` — in bare, drive-lettered and
`file://`-URL forms, with either slash. `createProductionExecutableHost`'s
`fileExists` composes it AHEAD of the disk probe: an embedded path returns
`false` without consulting the filesystem; every other path falls through to
`existsSync` unchanged. `resolveSubagentExecutable`, `assembleSubagentArgv`,
`launchSubagentChild`, `probeSubagentExecutable` and the composition root are
untouched — an embedded `argv1` now fails the rung-1 conjunction and the ladder
proceeds to rung 2 by its existing arm, which is the rung a compiled-binary
deployment needs.

The regex is ANCHORED to the virtual root, not matched as a bare substring
anywhere in the path. A substring test rejects a legitimate installation under a
directory named `~BUNDLE`, and a wrong rejection is not the safe direction it
looks like: it falls through to rung 2 and, under a generic runtime, to the
closed refusal that disables every subagent invocation. The predicate is
exported rather than kept private because the composed `fileExists` cannot
witness it outside a compiled binary — on an ordinary runner `existsSync`
answers `false` for those paths anyway, measured — so the tests pin the
predicate directly and the composition around it.

**Spec.** Rung 1 of
`docs/spec_topics/pi-integration-contract/subagent.md#subagent-executable-resolution`
now carries the obligation as a MUST: the existence check MUST answer false for
a path inside a compiled binary's own embedded filesystem; such a path is one
the running process can stat but no spawned child can open, and it is not an
entry script the binary can run but a stray leading positional argument, which a
host reads as the child's prompt instead of the callee. Rung 2, the no-`PATH`-
fallback rule, the fail-closed load-time refusal, sub-step `(f)`, `#pic-5`'s
`filesystem-existence`-only carve-out and the
`theta/load/subagent-executable-unresolved` registry row are unchanged.

**Witnesses.** `tests/subagent-child-launch.test.ts`, the describe block *"rung
1 — embedded-filesystem paths are rejected (`isEmbeddedFsPath` + the production
`fileExists`)"*, four cells:

1. every spelled form of the embedded root is recognised — POSIX, backslash,
   Windows drive, lower-case, bare `%7EBUN`, and both URL forms;
2. the anchor negatives — `~BUNDLE` under POSIX and Windows spellings, a
   `$bunfs-lookalike` directory, a `%7EBUNsuffix` directory, and an ordinary
   install path — are NOT embedded;
3. the composed production `fileExists` answers `true` for a real file and for a
   real file under a marker-CONTAINING directory, and `false` for an embedded
   path regardless of the disk;
4. the ladder falls through rung 1 to rung 2 on a modelled compiled-binary host
   whose stat answers true, yielding `execPath` with empty `scriptArgs`.

The block was added by the PR's round-1 review fix-ups and red-proven there by
neutralising the predicate. The file is green at HEAD: 31 tests pass, offline
and provider-free.

## Non-goals

- **The `HostCliDialect` work in the same change.** Which flags express an
  isolation intent on which host is a separate mechanism in the same two files;
  this report changes nothing about flag selection, and the dialect changes
  nothing about rung selection.
- **Bug 0002's child stdio.** The stdin-closed spawn stays as 0002 left it.
- **Bug 0008's single-`--theta` rule.** `assembleSubagentArgv`'s output is
  byte-identical before and after; only the prepended `scriptArgs` moved.
- **The `(f)` probe's shape.** `#pic-5` pins it as `filesystem-existence`-only
  and forbids spawning the resolved executable. The fix keeps it there: the
  correction lives in the predicate the probe already calls, so no probe gains
  reach.
- **Non-Bun embedded-filesystem markers.** The predicate's vocabulary is the
  three spellings the host's own binary-detection uses. A different
  single-file-executable toolchain with a different virtual root is out of frame
  until a host ships one.
- **The Oh-My-Pi host's own handling of a stray leading positional.** That host
  is not installed in this tree, so §Reproduction (c) measures the Pi CLI only.
  The fix removes the positional on both hosts, so the difference does not
  affect the disposition; the spec sentence states the consequence
  host-generically.

## Provenance

- Filed from the external PR #1 part-1 fix. The defect was found while adding
  support for a second host and a compiled-binary distribution, which is the
  deployment shape on which the pre-fix predicate answers wrongly.
- The witnesses were added by that PR's round-1 review fix-ups (review item F4),
  which also red-proved them by neutralising `isEmbeddedFsPath`. The anchoring
  of `EMBEDDED_FS_ROOT` — as against a bare substring test — is that review's
  correction, and its rationale is recorded in the predicate's own doc comment.
- Independently re-derived at HEAD `3752003f` for this filing: the ladder,
  production host, composition root, probe and envelope-scan citations were read
  in source; `tests/subagent-child-launch.test.ts` was run (31 passed); and the
  argv-parsing claim was measured by importing `parseArgs` from the vendored
  `@earendil-works/pi-coding-agent` and passing the corrupted argv, with the
  `runPrintMode` loop and `main(process.argv.slice(2))` read in the same
  vendored `dist/`.
- The version window in §Observed at comes from `CHANGELOG.md`: the ladder and
  its production discharge landed in 0.8.0 with RFC 0005, and the `--mode json
  -p "/<slug>"` child argv in 0.9.0 with the RFC 0006 rebase. No history walk
  was performed in this session, so the claim that the discharge was a bare
  `existsSync` throughout that window rests on the CHANGELOG's account of what
  each release changed and on the fix's own framing, not on a per-release
  measurement.
