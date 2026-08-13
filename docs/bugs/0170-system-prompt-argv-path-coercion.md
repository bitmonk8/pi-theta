# Bug 0170 — `assembleSubagentArgv` marshalled the callee's resolved-and-interpolated `system:` text verbatim as `--system-prompt <value>`, and both hosts PATH-COERCE that argument — Pi runs `existsSync(value)` and returns the named file's bytes, Oh-My-Pi opens any newline-free value with `Bun.file(value).text()` and falls back to the literal only on a read failure — so a value that named a readable file replaced the child's system prompt with that file's contents, on a channel whose `${param}` interpolands are filled from MODEL output on the binder path and whose child can relay what it read back to the parent through the PIC-59 return envelope

- **Status:** fixed (0.89.0). Both halves landed in the Oh-My-Pi host-support
  change (external PR #1, HEAD `3752003f`): the emission site prefixes a single
  `\n` to a non-empty resolved prompt and leaves the empty prompt exactly empty,
  and `pi-integration-contract/subagent.md` gained the normative paragraph
  [*`--system-prompt` is emitted as text*](../spec_topics/pi-integration-contract/subagent.md#subagent-system-prompt-text)
  (`:78`–`:79`) plus the launch-contract row clause that points at it (`:46`).
  No registry row moved; no other argv element changed.
- **Sev/Diff estimate:** S1/D2 — S1 because the substitution is silent wrong
  behaviour on a production path: the child adopts a file's bytes as its complete
  system prompt, no diagnostic is emitted on any surface, the parent observes a
  well-formed PIC-59 envelope, and the value that selects the file is model
  output on the binder path. D2 because the settled fix is one expression at one
  emission site inside one subsystem, plus one spec paragraph and one table-row
  clause in the same commit; no new registered code, no new seam, and the
  witnesses are two offline unit files.
- **Kind:** defect — the implementation hands a host-interpreted argument a value
  it does not control, on a channel the contract describes as text. Three
  elements, cited at HEAD `3752003f` (the pre-fix state is cited at `faac6841`,
  v0.88.0).
  1. *The emission was verbatim.* `assembleSubagentArgv`
     (`src/runtime/subagent-launcher.ts:380`) pushed
     `"--system-prompt", input.systemPrompt` unchanged. That spelling is the
     original one: `git show fda23a4b:src/runtime/subagent-launcher.ts` (v0.8.0,
     the RFC-0005 child-process launch) emits `input.systemPrompt` at its own
     `:193`, and `git log -S` over the file reports no intervening change to that
     argument between v0.8.0 and v0.88.0. Nothing between the frontmatter and the
     host inspected the value.
  2. *Both hosts read the argument as a path first.* On Pi the flag parser stores
     the raw argv token (`node_modules/@earendil-works/pi-coding-agent/dist/cli/args.js:46–47`,
     host v0.80.10 — the version the contract pins at `subagent.md:160`), `main.js:537`
     forwards it as the resource loader's `systemPrompt`, and `resolvePromptInput`
     (`dist/core/resource-loader.js:15–29`) answers `readFileSync(input, "utf-8")`
     whenever `existsSync(input)` holds. The result becomes `customPrompt`
     (`dist/core/agent-session.js:730`, `:739`) and thus the child's complete
     system prompt. The Oh-My-Pi arm is the same shape with the opposite
     short-circuit — any newline-free value is opened with `Bun.file(value).text()`
     and the literal is used only when that read fails — recorded normatively at
     `subagent.md:79` (this repository carries no copy of that host; see
     §Reproduction for what is measured and what is cited).
  3. *The value is model-reachable.* `spawnSubagentConversation`
     (`src/extension/production-theta-producer.ts:1645`) renders the callee's
     `system:` template against the bound params at `:1702`–`:1714`
     (`renderSystemPrompt`, `src/parser/system-interpolation.ts:467`) and hands
     the result to the launcher at `:1884`. Those params arrive from
     `paramBindingsFrom(binderResult.args)`
     (`src/extension/theta-composition-producer.ts:396`, fed by the `runBinder`
     call at `:389`), so on the slash path every interpoland is a value the
     binder model produced. `frontmatter-fields-b-and-templates.md:33` admits a
     bare `Path` body, so `system: "${p}"` renders to the param's string
     unchanged: one `string`-typed param can be the whole emitted value.
- **Related:**
  - **The host CLI dialect seam** — `HostCliDialect`
    (`src/runtime/subagent-launcher.ts:243`), `PI_CLI_DIALECT` (`:255`),
    `OMP_CLI_DIALECT` (`:275`), `resolveHostCliDialect` (`:314`), spec
    [*Host CLI dialect*](../spec_topics/pi-integration-contract/subagent.md#subagent-host-cli-dialect)
    (`subagent.md:61`–`:73`). Same function, same change. **Boundary.** The
    dialect supplies the four intent-level flag GROUPS around this value; this
    report owns the VALUE of one host-invariant flag. The two are independent by
    construction: `--system-prompt` is in the invariant core of the assembly, the
    prefix is applied before either dialect's groups are appended, and both
    witnesses assert it under `PI_CLI_DIALECT` and `OMP_CLI_DIALECT` alike
    (`tests/host-cli-dialect.test.ts:130`, `:156`).
  - **0060** —
    [`0060-binder-parameters-line-shape-violable-by-embedded-newlines.md`](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md),
    **fixed (0.61.0)**, and **0103** —
    [`0103-binder-description-argument-hint-lines-forgeable-by-newline.md`](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md),
    **open.** **Boundary, and the opposite direction.** Both own the parent-side
    binder system prompt, whose reader parses a LINE-ORIENTED item list, so an
    embedded newline in an author-controlled token forges structure and 0060's
    fix normalises breaks away at the render seam. The child's `--system-prompt`
    is a single opaque argv token: no host parses it into items, nothing after
    the leading `\n` changes meaning, and the reader this report is about
    discriminates on existence rather than on line structure. The two treatments
    therefore do not conflict — 0060/0103 remove newlines from a surface where a
    newline is structure, this report adds one to a surface where a newline is
    inert and is the only property that defeats a path test. 0103 stays open and
    is untouched: its channel is the parent's own prompt bytes, assembled
    in-process by `buildBinderSystemPrompt`, never argv.
  - **0002** —
    [`0002-subagent-child-hangs-under-acceptance-pi-p.md`](./0002-subagent-child-hangs-under-acceptance-pi-p.md),
    **fixed (0.12.0)**, and **0008** —
    [`0008-subagent-child-drops-all-but-last-theta-root.md`](./0008-subagent-child-drops-all-but-last-theta-root.md),
    **fixed (0.17.0).** The two prior defects in this launch's carriage — child
    stdio, and the repeated `--theta` flag the host collapses to its last
    occurrence. Both are recorded as in-file comments at
    `subagent-launcher.ts:393`–`:405` (the single joined `--theta` flag) and
    `:505`–`:508` (the child's stdin spawned closed), and both are unchanged here; this
    is the third carriage element whose host-side reading differed from the
    assembly's assumption about it.
- **Affected** (every citation verified against the tree at HEAD `3752003f`;
  symbols named beside lines):
  - **The emission site.** `assembleSubagentArgv`
    (`src/runtime/subagent-launcher.ts:380`), its launch-contract doc comment
    (`:361`–`:379`), the `SubagentArgvInput.systemPrompt` field and its doc
    (`:340`–`:341`), the text-not-path comment (`:409`–`:428`) and the emitting
    `argv.push` (`:429`–`:437`) whose seventh element is the fix
    (`:436`). `launchSubagentChild` (`:568`) and the argv join (`:592`) are the
    single production consumer.
  - **The value's provenance.** `spawnSubagentConversation`
    (`src/extension/production-theta-producer.ts:1645`), its SUBAG-1 comment
    (`:1697`–`:1701`), the render block (`:1702`–`:1714`), the launch call
    (`:1879`) and the `systemPrompt: systemPrompt ?? ""` argument (`:1884`);
    `renderSystemPrompt` (`src/parser/system-interpolation.ts:467`) and
    `resolvePath` (`:490`); the binder route
    (`src/extension/theta-composition-producer.ts:389`–`:401`) and
    `paramBindingsFrom` (`:90`). The non-slash route reaches the same launcher
    with theta-computed arguments (`production-theta-producer.ts:3279`–`:3282`,
    `:3340`).
  - **The Pi host, at the pinned version.**
    `node_modules/@earendil-works/pi-coding-agent/dist/cli/args.js:46`–`:47`
    (argv → `parsed.systemPrompt`), `dist/main.js:537` (→ resource-loader
    option), `dist/core/resource-loader.js:15`–`:29` (`resolvePromptInput`: the
    `!input` falsy arm, the `existsSync` arm, the `readFileSync` read, the
    read-failure fallback to the literal), `:332` (the `??` that lets a non-empty
    flag value pre-empt `discoverSystemPromptFile`, `:750`–`:760`),
    `dist/core/agent-session.js:730`, `:739` (the loader value becomes
    `customPrompt`), `dist/core/system-prompt.js:7` and `:13` (`buildSystemPrompt`
    uses `customPrompt` when truthy and builds the host's own prompt otherwise).
    Installed host version 0.80.10, which is the version `subagent.md:160` pins
    the consumed-flag audit to.
  - **Spec.** `docs/spec_topics/pi-integration-contract/subagent.md:19` (the
    flag-inventory row), `:34` (the `system:` delivery bullet), `:40`
    (`#subagent-launch-contract`), `:46` (the launch-contract row, which gained
    the newline-prefix clause and the pointer), `:78`–`:79`
    (`#subagent-system-prompt-text`, added by the change — the normative
    sentence, the two hosts' coercions, the reason the empty value is left
    alone), `:101` (PIC-59, the return envelope the child's reading can reach),
    `:160` (the consumed-flag list and its host-version pin), `:169` (the
    state-isolation matrix row that names `system:` → `--system-prompt`);
    `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:31` (the
    `system:` field, subagent-mode only), `:33` (bare-identifier-path
    interpolation), `:46` (stringification of the resolved value).
  - **Witnesses.** `tests/host-cli-dialect.test.ts:119`–`:161` — the SPAWN-04
    `describe` added by the change (SPAWN-04 is that change's own item label, not
    a registered REQ-ID): the path-shaped value prefixed under both dialects with
    the newline asserted directly (`:123`–`:142`), the verbatim-after-prefix
    property over a multi-line prompt (`:144`–`:149`), and the empty-stays-empty
    cell under both dialects (`:151`–`:160`). `:189` re-asserts the prefixed
    value as an adjacent flag+value run inside the omp host-invariant-core test.
    `tests/subagent-child-launch.test.ts:234`–`:237` — the updated assembly
    assertion, `"\nyou are a subagent"`. Both files green at HEAD (54 tests,
    `npx vitest run tests/host-cli-dialect.test.ts tests/subagent-child-launch.test.ts`).
- **Observed at:** v0.88.0 (`faac6841`) — the last release carrying the verbatim
  emission; present unchanged since v0.8.0 (`fda23a4b`). Verified fixed at HEAD
  `3752003f`. Offline, deterministic, provider-free: a scratch vitest probe over
  the shipped `assembleSubagentArgv` under both dialects, composed with the Pi
  host's `resolvePromptInput` transcribed byte-for-byte from
  `dist/core/resource-loader.js:15`–`:29` and driven against a real temporary
  file; written, run, deleted. Every value in §Reproduction is that run's output.
  The tree was clean (`git status --short`) before and after.

## Summary

The subagent launch contract delivers the callee's `system:` prompt as
`--system-prompt <text>`. Before this change the text was passed exactly as
resolved. Both hosts read that argument as a path before they read it as text:
Pi returns the named file's bytes whenever `existsSync` holds on the value, and
Oh-My-Pi opens any newline-free value with `Bun.file(value).text()` and keeps the
literal only when that read fails. A value naming a readable file therefore
became that file's contents, and those contents became the child's complete
system prompt.

The value is not a constant. `system:` supports `${param}` interpolation against
the theta's typed params, a bare path body is admitted, and on the slash path the
params are filled by the binder model. A theta whose `system:` is
`"${p}"`, or whose interpolands are concatenated into something that resolves to
an absolute path, hands the model the ability to select which file the child
reads. The child then acts on those bytes for the whole invocation and can put
what it read into its final value, which reaches the parent through the PIC-59
return envelope. No diagnostic fires anywhere on that route: the emission is
well-formed argv, the child starts normally, and the envelope is well-formed.

The fix emits a non-empty resolved prompt with one leading newline and leaves an
empty prompt exactly empty. The prefix defeats the coercion at both hosts while
changing nothing the model sees beyond one blank first line; the empty case is
preserved untouched because both hosts read a falsy value as "no CLI system
prompt" and fall back to their built-in default, which is what a theta declaring
no `system:` intends.

## Reproduction

Offline, deterministic, at HEAD `3752003f`. Harness: the shipped
`assembleSubagentArgv` imported from `src/runtime/subagent-launcher`, under both
`PI_CLI_DIALECT` and `OMP_CLI_DIALECT`, composed with `resolvePromptInput`
transcribed from the installed Pi host
(`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:15`–`:29`)
and a real file written into a fresh `mkdtemp` directory. The pre-fix emission is
reproduced by passing the same input through the verbatim expression the file
carried at `faac6841`. The run is on Windows; `<tmp>` below stands for the
`mkdtemp` directory and the real values carry that platform's separator. Which
platform ran it matters for one row only, marked in (b).

### (a) The emission, before and after

```
input.systemPrompt = "<tmp>/id_ed25519"

pre-fix  emitted --system-prompt value :: "<tmp>/id_ed25519"
at HEAD  emitted --system-prompt value :: "\n<tmp>/id_ed25519"   (identical under both dialects)
```

The value is the assembly's own output, read as `argv[argv.indexOf("--system-prompt") + 1]`.

### (b) The Pi host's reading of each emission

`resolvePromptInput` over the value from (a), with `<tmp>/id_ed25519` containing
`-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET\n`:

```
pre-fix value  -> "-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET\n"      (the file's bytes)
HEAD value     -> "\n<tmp>/id_ed25519"                                  (the literal)
```

The pre-fix row is platform-independent: the value is a real path and
`existsSync` holds on it. The HEAD row is the platform-marked one — this run is
on Windows, where a newline cannot occur in a path at all, so `existsSync`
cannot hold on the prefixed value by construction. On POSIX the same row holds
for every ordinary tree, and the bound is stated in §Non-goals.

That return value is what becomes `customPrompt`
(`dist/core/agent-session.js:739`) and thence the child's system prompt. The
pre-fix row is the defect in one line: the intended prompt is gone and a file the
launcher never named is in its place.

The Oh-My-Pi arm is **not** measured here — this repository carries no copy of
that host. It is taken from the normative sentence the change added
(`subagent.md:79`) and from the same characterisation recorded at the emission
site (`src/runtime/subagent-launcher.ts:411`–`:413`): that host opens any
newline-free value as a file and falls back to the literal only on a read
failure, so the leading newline short-circuits it to the literal before any
filesystem access. §Provenance records this split.

### (c) The empty prompt, at HEAD

```
input.systemPrompt = ""

emitted --system-prompt value :: ""            (both dialects)
resolvePromptInput("")       :: undefined      (the !input arm)
```

`undefined` reaches `customPrompt` as `undefined`
(`agent-session.js:739`), so the host builds its own default prompt. Prefixing
this case would emit `"\n"`, which is truthy, and the child would run under a
one-blank-line system prompt with the host default discarded.

### (d) The reachability trace

Traced, not driven — driving it costs a binder model call:

1. `runBinder` returns `{bound: true, args}` where `args` is the model's bound
   params object (`src/extension/theta-composition-producer.ts:389`).
2. `paramBindingsFrom(binderResult.args)` (`:396`, `:90`) projects it to
   `bindInput.paramBindings`.
3. `mode: subagent` routes to `spawnSubagentConversation` (`:399`–`:400`).
4. That method copies the bindings into `params`
   (`src/extension/production-theta-producer.ts:1704`–`:1710`) and calls
   `renderSystemPrompt({ template, params })` (`:1711`), which resolves each
   `${path}` against the params object and concatenates the literal runs
   (`src/parser/system-interpolation.ts:470`–`:485`).
5. The rendered text is the launcher's `systemPrompt` input (`:1884`) and lands
   at the emission site with no further inspection.

`frontmatter-fields-b-and-templates.md:33` admits a bare `Path` body, so a
`system:` of exactly `${p}` renders to the param string verbatim. The `invoke`
route reaches the same launcher with theta-computed argument values
(`production-theta-producer.ts:3279`–`:3282`, `:3340`) rather than binder output.

## Expected behaviour

- `docs/spec_topics/pi-integration-contract/subagent.md:34` — "The
  resolved-and-interpolated frontmatter `system:` is installed as the child
  session's system prompt, delivered via `--system-prompt <text>` at launch." The
  carrier is named `<text>`, and the thing installed is the resolved `system:`
  value — not a document the value happens to name.
- `:169` (state-isolation matrix) — the child's system prompt is "inherited from
  the theta's frontmatter", and `:170` states the isolation property in the same
  row set: "the child's `--system-prompt` is the *complete* prompt; no
  user/project context, files, skills, templates, or context files are
  inherited". A path coercion inserts exactly such a file into the one channel
  that row declares complete and closed.
- `:79` (`#subagent-system-prompt-text`, the rule this change added) — "A
  non-empty resolved `system:` value MUST be passed newline-prefixed (a single
  leading `\n`); an empty value MUST be passed exactly as-is."
- `:101` (PIC-59) — the child's final value reaches the parent with `Result`
  fidelity through the `theta_result` envelope. Whatever the child was told, and
  therefore whatever it may repeat, has a route back to the caller's session.
- `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:33`,
  `:46` — `system:` interpolation resolves a declared param path and renders the
  value through the canonical stringification table. The contract for the slot is
  that the author's text with the params substituted is what the model receives.

## Actual behaviour / root cause

The root cause is a type mismatch across a process boundary that neither side
states: the launcher treats the argument as a string, and the host treats it as
*either* a string or a filename, deciding by probing the filesystem.

`assembleSubagentArgv` had no defence because it had no reason to expect one to
be needed — every other argv element it assembles is either a fixed literal
(`--mode json`, `--no-session`), a launcher-derived path set (`--theta`), an
identifier (`-p /<slug>`, `--provider`, `--model`), or a name list (`--tools`).
`--system-prompt` is the only element carrying free text, and it is also the only
element whose content can originate outside the theta author: params ride the
PIC-60 env/temp-file channel and the return value rides stdout, so argv is
otherwise closed to model output.

On the host side the coercion is a convenience with no opt-out. `resolvePromptInput`
(`dist/core/resource-loader.js:15`–`:29`) exists so an operator can write
`--system-prompt ./prompt.md`, and it distinguishes the two intents by a bare
`existsSync`. Nothing in the flag's surface lets a caller say "this is text". The
two hosts even disagree about which way to fail — Pi keeps the literal when the
path does not exist, Oh-My-Pi keeps the literal when the read fails — which is
why a fix keyed on host detection would have had to be right twice, and why the
one adopted is keyed on a property of the VALUE that both hosts' probes reject.

The interpolation seam is where the value stops being author-controlled.
`renderSystemPrompt` is correct: it resolves declared paths against a validated
params object and stringifies through the canonical table. It has no notion of
the resulting text being handed to a filesystem probe, and it is the wrong place
to acquire one — the same rendered text is legitimate content everywhere else it
goes.

## Why it matters

- **The child's instructions are replaced, silently, on a production path.** The
  intended system prompt is discarded and a file's bytes take its place. No
  diagnostic is emitted by the parent, the child, or either host — the child
  starts, runs the callee, and returns a well-formed PIC-59 envelope. The parent
  observes a normal invocation.
- **The selecting value is model output on the binder path.** §Reproduction (d)
  traces binder args → `paramBindings` → `${param}` → the emitted argv token. A
  theta that interpolates a param into `system:` gives the binder model a channel
  into the file-selection decision. Every other consumer of those args
  schema-validates them first (`buildBinderEnvelopeSchema`,
  `src/binder/binder-envelope.ts:86`, and the post-default-merge AJV hook), and a
  schema constrains a value's shape, not the file its text names: a `string`-typed
  param validates whether it reads `summarise tersely` or `/home/u/.ssh/id_ed25519`.
- **What the child reads has a route back to the caller.** The child acts on the
  substituted prompt for the whole invocation and its final value crosses to the
  parent through PIC-59 (`subagent.md:101`), landing in the caller's session. The
  file's contents therefore have a path out of the child process, not merely into
  it.
- **It fires without an adversary.** A theta whose param legitimately carries a
  file path — a reviewer theta taking a spec path, a summariser taking a document
  path — and whose `system:` interpolates that param whole is enough. The prompt
  is replaced by the document the author meant to name, and the failure looks
  like a model behaving oddly.
- **It contradicts the one isolation property the child's prompt is supposed to
  have.** `subagent.md:170` states the child's `--system-prompt` IS the complete
  prompt and that no files are inherited. The coercion imports one.
- **It was the only unguarded free-text argv element, and it had been there since
  v0.8.0.** Every other model-derived value already travels on a channel that
  cannot be re-interpreted (PIC-60 for params, stdout for the result). This one
  crossed on argv for eighty minor versions with no witness asserting anything
  about its content.

## Fix (0.89.0)

Landed in the Oh-My-Pi host-support change; both halves in the same commit.

**Implementation.** `assembleSubagentArgv`
(`src/runtime/subagent-launcher.ts:380`) emits the value through one conditional
(`:436`):

```ts
    "--system-prompt",
    input.systemPrompt === "" ? "" : `\n${input.systemPrompt}`,
```

A non-empty resolved prompt gains one leading newline; the empty prompt is passed
through untouched. Nothing else in the assembly moves: the flag stays in the
host-invariant core, the prefix is applied before either dialect's groups are
appended, and the prompt text after the prefix is byte-identical to the input.

Why the newline is the right key. It is a property of the value that both hosts'
probes reject rather than a property of the host, so one expression closes both
arms and an unrecognised third host inherits the same treatment. Oh-My-Pi
short-circuits to the literal on seeing a newline, before any filesystem access.
Pi's `existsSync` is defeated because the prefixed value names no path that
exists — on Windows a newline is not a legal path character at all, and on POSIX
it would require a real directory whose first path component is a literal newline
(§Non-goals records that residual). A leading blank line is inert in a system
prompt, so the model's instructions are unchanged.

Why the empty case is excluded. Both hosts read a falsy value as "no CLI system
prompt" and fall back to their built-in default — measured for Pi at
§Reproduction (c), the `!input` arm of `resolvePromptInput` feeding a falsy
`customPrompt` into `buildSystemPrompt`
(`dist/core/system-prompt.js:7`, `:13`), which then builds the host's own prompt.
`subagent.md:79` fixes that disposition normatively. Prefixing would make the
value truthy and install a one-blank-line prompt in its place, discarding it.

**Spec.** `subagent.md` gained
[*`--system-prompt` is emitted as text*](../spec_topics/pi-integration-contract/subagent.md#subagent-system-prompt-text)
(`:78`–`:79`): the MUST for the non-empty prefix, the MUST for passing the empty
value as-is, both hosts' coercions, the model-output reachability that makes it
reachable, and the reason the empty value is left alone. The launch-contract row
for the `system:` carrier (`:46`) states the requirement inline and links to it,
so a reader of the table does not have to reach the paragraph to learn the
carrier is constrained. No registry row and no other table row changed.

**Witnesses.** `tests/host-cli-dialect.test.ts:119`–`:161` (SPAWN-04) pins three
properties, each under both dialects where the dialect is observable: a
path-shaped value is emitted prefixed and the emitted value contains a newline
(`:123`–`:142`, asserting the defeating property directly rather than only the
resulting string); a multi-line prompt survives the prefix byte-identically
(`:144`–`:149`); an empty prompt stays empty (`:151`–`:160`). `:189` re-checks
the prefixed value as an adjacent flag+value run, so a future edit cannot split
the pair. `tests/subagent-child-launch.test.ts:237` carries the updated assembly
assertion with the reason stated at `:234`–`:236`.

## Non-goals

- **A POSIX path whose first component is a literal newline.** POSIX filenames
  admit every byte but `/` and NUL, so `existsSync("\n<rest>")` is not
  unsatisfiable in principle on that family: a writer able to create a directory
  named `"\n"` at the resolution root could still get the prefixed value read as
  a path. The Oh-My-Pi arm is closed regardless (it never probes a
  newline-bearing value), and on Windows the character is illegal in a path.
  Closing the residual outright needs the host to offer a text-only spelling of
  the flag, which is a host change, not a theta one. Both the spec sentence
  (`subagent.md:79`) and the witness comment
  (`tests/host-cli-dialect.test.ts:137`–`:139`) state the rationale absolutely
  ("no path can contain a newline"); the bound above is the precise form.
- **What a child with no `system:` runs under.**
  `frontmatter-fields-b-and-templates.md:31` says "If omitted, the spawned
  conversation has no system prompt (the model behaves under its training
  defaults)", while the measured Pi path builds that host's own default prompt
  from a falsy `customPrompt` (`dist/core/system-prompt.js:13` onward). The
  divergence is between the spec sentence and the host, predates this report on
  both sides of the fix, and is unchanged by it — the empty value was passed
  as-is before and is passed as-is now. It is recorded here because §Fix rests on
  the empty case's disposition, not because this report adjudicates it.
- **The host's path coercion itself.** `resolvePromptInput` serves an operator
  spelling (`--system-prompt ./prompt.md`) that predates this contract and is not
  this repository's to change. This report constrains what the launcher emits,
  not what the host does with an arbitrary value.
- **The empty value versus flag omission.** Passing `--system-prompt ""` is not
  identical to omitting the flag on Pi: the `??` at
  `dist/core/resource-loader.js:332` short-circuits on the empty string, so the
  host's discovered `SYSTEM.md` (`:750`–`:760`) is skipped and the built-in
  default is used. The launch contract has always passed the flag
  unconditionally, and this change does not move that; a child inheriting the
  operator's `SYSTEM.md` would contradict the isolation row at `subagent.md:170`
  in any case.
- **`${param}` interpolation as a channel.** That model output reaches the
  child's system prompt at all is the design (`subagent.md:34`, `:169`) and is
  unchanged. This report is about that text being re-read as a filename, not
  about who authors it.
- **The binder prompt's line structure.** Bugs
  [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
  and [0103](./0103-binder-description-argument-hint-lines-forgeable-by-newline.md)
  own newlines in the parent-side binder system prompt, where a break forges
  structure. The child argv token has no line structure, and neither report's
  subject is touched here.
- **The other launch-contract carriers.** `--theta` (bug 0008), child stdio (bug
  0002), the PIC-60 params channel and the PIC-59 envelope are unchanged; no
  other argv element carries free text.

## Provenance

- Filed from part 1, fix (5) of external PR #1 (Oh-My-Pi host support), whose
  review found the emission while auditing `assembleSubagentArgv` for the
  second host's flag vocabulary: the dialect work made both hosts' handling of
  each argv element explicit, and this element's handling differed from the
  contract's description of it on both. The fix and its spec paragraph landed in
  the same change; this document is the retrospective report, written after the
  fix.
- Every `src/`, `tests/`, spec and host citation above was verified against the
  tree at HEAD `3752003f` with the working tree clean. The pre-fix emission was
  read from `git show fda23a4b:src/runtime/subagent-launcher.ts` (v0.8.0) and
  from the `faac6841` state of the file, and `git log -S` over the file confirms
  the argument was unchanged between them.
- The Pi arm of the coercion is measured, not quoted: `resolvePromptInput` was
  transcribed byte-for-byte from the installed host
  (`dist/core/resource-loader.js:15`–`:29`, v0.80.10 — the version
  `subagent.md:160` pins) and driven against a real temporary file, composed with
  the shipped `assembleSubagentArgv`. The probe was written into `tests/`, run,
  and deleted; the tree was clean before and after.
- The Oh-My-Pi arm is **cited, not measured** — that host is not a dependency of
  this repository and no copy of it is present at this HEAD. Its behaviour is
  taken from `subagent.md:79` and the matching characterisation at
  `src/runtime/subagent-launcher.ts:411`–`:413`, both added by the change that
  fixed this. The fix does not depend on that arm's details: the newline prefix
  is emitted unconditionally, and the Pi arm alone is measured closed.
- The two witness files were run at HEAD and are green
  (54 tests). SPAWN-04 is the change's own item label for this fix, carried in
  the two test files; it is not a registered REQ-ID and no registry row was
  added.
