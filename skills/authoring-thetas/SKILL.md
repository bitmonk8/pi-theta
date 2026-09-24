---
name: authoring-thetas
description: Write .theta / .thetalib scripts for the pi-theta extension. Use when the user asks you to create, edit, or debug a theta, or to script a multi-step / looping agent task in code instead of a plain prompt.
license: MIT OR Apache-2.0
---

# Authoring thetas

Theta is a scripting language for Pi agents. A `.theta` file mixes ordinary code —
variables, loops, conditionals, functions — with the text sent to the model, so
the deterministic parts of a task are code and only the open-ended parts go to the
model. `.thetalib` files are library modules (declarations only) that `.theta` files
`import`; they are never invoked directly.

Running a theta appends turns to a conversation and produces a **final value** (the
tail expression, or the operand of `return`).

## Anatomy

```theta
---
mode: subagent          # REQUIRED: prompt | subagent
description: One line    # optional; shown for the slash command
params:                  # optional; typed inputs
  topic: string
tools:                   # optional callable set (empty if absent)
  - grep                 # a Pi tool by name (read, bash, grep, ...)
  - ./helper.theta        # a subagent-mode .theta callable (hyphens -> underscores)
---
let intro = @`Write one sentence about ${topic}.`?   # a query -> the model's reply
intro                                                 # tail expression = final value
```

- **`mode: prompt`** drives the caller's current conversation (assistant text
  streams into the transcript).
- **`mode: subagent`** spawns a fresh, isolated conversation; its transcript is
  private (persisted only as an operator session log), only the final value crosses back.

## Queries — how you talk to the model

- `` @`text ${expr}` `` issues a turn and evaluates to the model's reply.
  Interpolation (`${...}`) and multi-line text are allowed **only inside**
  `` @`...` `` templates.
- Untyped query → `Result<string, QueryError>`. Typed query validates the reply
  against a schema:
  ```theta
  schema Verdict { ok: boolean, note: string }
  let v: Verdict = @`Judge this. Reply ok + note.`?
  ```
- Unwrap a `Result` with postfix `?` (early-returns the `Err`), or branch with
  `match`:
  ```theta
  let text = match @`...` {
    Ok(t) => t,
    Err(_) => "fallback",
  }
  ```

## Language essentials

- Bindings: `let x = ...` (immutable); `let mut x = ...` (reassignable, `=`/`+=`).
- Control flow: `if/else`, `for x in array`, `while cond` (condition must be
  `boolean` — no coercion), `break`, `continue`.
- `return expr` exits the theta/function; at top level it sets the final value.
- Functions: `fn name(a: T): R { ... }`. Types: `string number integer boolean`,
  `array<T>`, object schemas, `enum`, literal unions (`"a" | "b"`).
- **String literals are double-quoted and have no interpolation** — put dynamic
  text in a `` @`...` `` query template instead.
- Effects (file/network/process) happen only through admitted Pi tools; a theta has
  no such primitive of its own. Call a tool or a `.theta` callable as `name(args)`.

## Agent loops

A subagent callable gives a fresh context each call, and its typed final value
lets code decide when to stop — the deterministic version of a "Ralph loop":

```theta
let mut round = 0
while round < 20 {
  round += 1
  let status = worker(objective)?   # worker() = a ./worker.theta subagent callable
  if status.done { return status.summary }
}
"stopped at the ceiling"
```

Always cap a loop with a round ceiling. `invoke`-chain **nesting** is capped at 32
(a flat loop that calls a worker many times in sequence does not nest).

## Before you finish

- `mode:` is mandatory; a `.theta` callable in another theta's `tools:` must be
  `mode: subagent`.
- Keep a loop bounded. Prefer typed queries when you branch on the reply.

## Where the authoritative detail lives

When a fact is not covered above, read the docs rather than guessing. In a pi-theta
**checkout** they are under `docs/`; when the extension is installed from npm they
are not shipped in the package — read them on GitHub instead:
https://github.com/bitmonk8/pi-theta/tree/main/docs

- `guide.md` — the mental model.
- `tutorial.md` — build your first theta step by step.
- `how-to/` — task recipes (calling tools, typed returns, agent loops, thetalib imports).
- `reference/` — normative grammar, type system, frontmatter, errors, ceilings, diagnostics.
- `examples/` — small runnable `.theta` / `.thetalib` files.
