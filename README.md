<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/bitmonk8/pi-theta/main/ThetaBlackLogo.jpg">
    <img alt="Theta" src="https://raw.githubusercontent.com/bitmonk8/pi-theta/main/ThetaWhiteLogo.jpg" width="220">
  </picture>
</p>

# pi-theta

`pi-theta` is a [Pi Coding Agent](https://github.com/earendil-works/pi-mono)
extension that adds **Theta**, a scripting language for Pi agents. Write the
predictable parts of an agent task as code and leave only the genuinely fuzzy
parts to the model — no custom extension required.

A `.theta` file mixes ordinary code — variables, loops, conditionals, functions —
with the text you send to the model. Running a theta adds turns to a conversation:
either the caller's current one (*prompt mode*) or a fresh, isolated one
(*subagent mode*). When it succeeds it can also return a
[*final value*](./docs/reference/errors-and-results.md#final-value-fn-5) — the
theta's last expression, or the value you `return` — which callers can use and pass
back across the subagent boundary. Thetas can't write files, use the network, or
spawn processes on their own; those effects happen only through the Pi tools a
theta is allowed to call (its
[callable set](./docs/reference/frontmatter.md#tools-callable-set)).
`.thetalib` files are library modules that share Theta's grammar and types and are
imported by `.theta` files; they are never run directly.

## The problem

Pi's built-in `prompt` and `subagent` features are just Markdown with some
fill-in-the-blanks — static text with YAML frontmatter. They can't branch, loop,
read a model's response, carry a conversation across several turns, or hand a
typed value back to the caller. Theta does all of that: your code decides what text
goes to the model, the model's replies come back as values, and every run ends in
one of three ways — success, failure, or cancellation — defined in
[Errors and Results](./docs/reference/errors-and-results.md#terminal-outcomes-closed-set).

## Example: an agent loop

The pattern people call an *agent loop* (or a *Ralph loop*) is: run the model,
check the result, then stop or go again. The usual version is a shell loop that
re-runs the model and hopes it eventually declares itself done. In Theta the loop
is real code, so your code owns the stop condition and the model just does the
work inside each round.

The worker [`docs/examples/ralph-step.theta`](./docs/examples/ralph-step.theta) does
one round of work on a fresh context and hands back a typed result. State lives on
disk — the files it edits, the commits it makes — not in the conversation:

```theta
---
description: Do the next task toward the objective on a fresh context, then report status
mode: subagent
params:
  objective: string
tools:
  - read
  - bash
---
schema Progress {
  done: boolean,
  summary: string
}

let status: Progress = @`Objective: ${objective}

Inspect the current state of the project, do the single most important unfinished
task toward the objective, run the test suite with bash, commit the result, and
report whether the objective is now fully met.`?
status
```

The loop [`docs/examples/ralph.theta`](./docs/examples/ralph.theta) takes an
objective, passes it to the worker, and re-runs the worker on a fresh context
until it reports `done` — or hits the round ceiling:

```theta
---
description: Re-run the worker on a fresh context until the objective is met (a Ralph loop)
mode: subagent
params:
  objective: string
tools:
  - ./ralph-step.theta
---
let mut round = 0
while round < 20 {
  round += 1
  let status = ralph_step(objective)?
  if status.done {
    return status.summary
  }
}
"stopped at the 20-round ceiling"
```

Put both files on the discovery path with `--theta`, and `ralph.theta` is available
as the `/ralph` slash command — the argument becomes its `objective`:

```
pi --theta docs/examples -p "/ralph get the integration tests passing"
```

Or, from inside a running `pi` session (once the directory is on your theta
discovery path), just type the slash command:

```
/ralph get the integration tests passing
```

The `while` bound, the `done` check, and the round ceiling are ordinary code —
not a magic "done" string grepped out of the model's prose. The two files can also
be collapsed into one: a `subagent fn` (theta 1.2) is a `fn` whose body runs in a
fresh isolated session per call, so the worker becomes an in-file function and the
loop calls it by name — see
[`docs/examples/ralph-inline.theta`](./docs/examples/ralph-inline.theta) and
[How to write an agent loop](./docs/how-to/write-an-agent-loop.md), which also has
a second, self-contained example you can run without any external tools.

## Status

Theta is at **0.9.x**. The whole documented language works and is tested
end-to-end, but this is an early release and may still contain bugs. As of
0.9.0, a subagent-mode invocation runs the whole callee theta — interpreter
included — in a spawned child `pi` process (params and the typed return value
cross the process boundary structurally), and a subagent theta's `tools:` list
can name extension-registered Pi tools (model-facing only) in addition to the
built-ins — see the
[CHANGELOG](./CHANGELOG.md) and
[Guide — Extension tools in a subagent](./docs/guide.md#extension-tools-in-a-subagent).

Report issues against the behaviour the [Reference](./docs/reference/) defines.

## Documentation

- **[Guide](./docs/guide.md)** — how Theta works: mixing code with the text you
  send to the model, prompt vs. subagent mode, `.theta` vs. `.thetalib`, and the final
  value.
- **[Tutorial](./docs/tutorial.md)** — build your first theta, from an empty file
  to a working one.
- **[How-to guides](./docs/how-to/)** — short recipes for specific tasks, including
  [writing an agent loop](./docs/how-to/write-an-agent-loop.md) and
  [fanning out in parallel](./docs/how-to/fan-out-in-parallel.md).
- **[Reference](./docs/reference/)** — the full details: grammar, type system,
  frontmatter fields, errors and results, limits, diagnostics, and the CLI.
</content>
</invoke>
