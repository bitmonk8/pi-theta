# How to place subagents in a multiplexer

Placement (theta 1.4) separates *where* a subagent child runs from *what it
receives and returns* ([Subagent — Placement](../spec_topics/pi-integration-contract/subagent.md#subagent-placement)).
Every subagent-spawning surface — a `mode: subagent` slash command, an
`invoke(...)` of a subagent-mode callee, a `.theta` callable call, a `par for`
iteration, a `subagent fn` call (the pattern in
[`docs/examples/ralph-inline.theta`](../examples/ralph-inline.theta)) — is
identical across every placement: same executable resolution, argv assembly,
`--tools`, trust inference, model and params marshalling, closure hashes,
depth carriage, and the return envelope. Only where the child process lands
changes.

## The four operator situations

### 1. Headless, CI, no multiplexer

Nothing to configure. The default placement is `pipe` — the child runs in the
parent's own process tree, byte-identical to the pre-1.4 launch.

### 2. tmux / Zellij / WezTerm with no backend package

Add an `exec` placement template to the **global** settings file
(`~/.pi/agent/settings.json`) — a project-local `.pi/settings.json` entry is
ignored (`theta/load/settings-invalid-entry`): a checked-out repository must
not be able to make a theta run an arbitrary command on its first subagent
launch.

```json
{
  "theta": {
    "subagentPlacement": "auto",
    "subagentPlacementExec": {
      "when":  { "env": "TMUX" },
      "spawn": ["tmux", "new-window", "-d", "-P", "-F", "#{pane_id}", "-c", "{cwd}", "-n", "{label}", "{argv}"],
      "kill":  ["tmux", "kill-pane", "-t", "{handle}"]
    }
  }
}
```

Start `pi` inside tmux; `auto` selects `exec` because `TMUX` is set (`when`
only gates `auto` — an explicit `"exec"` selection ignores it). A Zellij or
WezTerm template differs only in the three arrays.

Substitutions:

- **`{argv}`** — expands **in place** to the executable followed by every
  launch argv element, never joined into one string; `spawn` MUST contain
  exactly one `{argv}` element.
- **`{cwd}`**, **`{label}`** — substitute anywhere in `spawn`.
- **`{handle}`** — substitutes anywhere in `kill`; the `handle` is the
  spawn command's first stdout line. `kill` absent ⇒ `kill()` is a no-op.
- **`env: "inherit" | "none"`** (default `"none"`) — whether the launcher
  passes the parent environment through to the spawned command.

The template is honoured from the **global** settings file only, so a
malicious or careless project checkout cannot make a theta spawn an
arbitrary command via a repo-committed `.pi/settings.json` — only an
operator's own global settings can define what `exec` runs.

### 3. A backend package

A companion package — e.g. `@bitmonk8/pi-theta-herdr` (outside this
repository) — registers a placement backend over `pi.events` at compose time.

1. `pi install git:github.com/bitmonk8/pi-theta-herdr` (the companion is
   git-distributed, not published to npm; substitute whatever source your
   backend ships under). An operator running pi-config gets the companion as
   a dependency and installs nothing.
2. Nothing else. `auto` (the default) selects the highest-`priority`
   registered backend whose `detect()` is true; outside that backend's
   environment `auto` falls through to `exec` (if configured) or `pipe` — no
   error, no configuration change.

Optional pinning, in either settings file:

```json
{ "theta": { "subagentPlacement": "herdr", "subagentPlacementMaxVisible": 8 } }
```

With a backend name pinned, starting `pi` outside that backend's environment
refuses to register every `mode: subagent` theta and every theta declaring a
top-level `subagent fn` — `theta/load/subagent-placement-unavailable`, naming
the choice and the fix. There is no silent degradation to `pipe`: a silently
headless child *looks* like it worked, and the fail-closed refusal exists to
prevent exactly that. One-off override for a single run:

```
PI_THETA_SUBAGENT_PLACEMENT=pipe pi
```

### 4. Oh-My-Pi

Identical to situation 3: the host dialect is selected as usual, the
companion package registers over the same `pi.events` bus, and `exec`
covers any multiplexer with a CLI the same way it does on Pi.

## What a visible child looks like

Under a placement whose backend declares `visible: true`, the child launches
as an interactive TUI titled `<slug>#<id>` (`<slug>#<fn>#<id>` for a
`subagent fn` call; `<id>` = the invocation id's first eight hex characters)
and runs the slash command as its initial message — the same callee,
the same regime, a different presentation. `--no-session` applies unless
the backend declares `persistSession: true`. After an `Ok` envelope the child
calls `ctx.shutdown()` and its pane closes; after an `Err` envelope it does
not — the pane lingers with the live session so a human can read or continue
it.

## The visible cap

`theta.subagentPlacementMaxVisible` (default `8`): while that many placed
children are live, further launches use `pipe` regardless of selection, so a
`par for` over many items opens at most that many panes and the rest run
headless.

## Credentials

A backend with `inheritsEnv: false` runs the child under the mux server's
own environment, not the parent's. If the resolved model's provider
credential exists only in the parent's environment (`AuthStatus.source ===
"environment"`), that child is placed by `pipe` instead and one
`theta-system-note` is emitted:

```
theta: placement '<name>' does not carry environment credentials for <provider>; running /<callee> headless
```

This is fail-safe, not fail-closed — the theta still runs; the operator
learns why no pane appeared. A disk-stored credential (API-key file,
credential-manager entry) is unaffected and places normally under any
backend.

## `subagent fn` calls are children too

Each `subagent fn` call is its own spawn — a process-startup cost of seconds,
on top of whatever model time the call's queries take. A `par for` over a
short-bodied `subagent fn` pays that cost once per iteration, not once for
the loop.

## Seeing where a child is placed

`/theta-status` and the invocation-tree widget show a `placement` field for a
visible child: `live in <backend> <handle>` — the compact reference to a
session you can already see, in place of a re-streamed transcript. See
[How to watch a running theta](./watch-a-running-theta.md).

## Provenance

- Placement seam, built-in `pipe` / `exec`, registered backends, selection,
  visible cap, presentation, credential guard, launch file, result channel,
  cancellation/teardown: `docs/spec_topics/pi-integration-contract/subagent.md`
  `#subagent-placement`.
- Visible-presentation argv form (`--name`, bare trailing positional,
  `ctx.shutdown()` on `Ok`, linger on `Err`):
  `docs/spec_topics/pi-integration-contract/subagent.md`
  `#subagent-host-cli-dialect`.
- Launch file (second control-plane carriage) and its authentication:
  `docs/spec_topics/pi-integration-contract/subagent.md`
  `#subagent-control-plane-authentication`.
- Settings keys `theta.subagentPlacement` / `theta.subagentPlacementMaxVisible`
  / `theta.subagentPlacementExec` (global-only) and their validation:
  `docs/spec_topics/discovery/package-and-settings.md` `#settings-keys-read`.
- Child-activity tap degradation to heartbeat liveness and the `placement`
  field under a visible placement: `docs/spec_topics/execution-status.md`
  `#exst-5`.
- `subagent fn` isolation and the call-site `with { cwd }` clause:
  `docs/spec_topics/functions.md` `#fn-6`.
- Load-time diagnostics `theta/load/subagent-placement-unavailable` /
  `theta/load/subagent-placement-invalid`: `docs/spec_topics/diagnostics/code-registry-load.md`.
- Recipes above adapted from the accepted RFC's operator-facing walkthrough,
  corrected against the spec pages above where they differ:
  `docs/rfcs/0012-configurable-subagent-placement.md` §"Operator view — what
  a user does".
