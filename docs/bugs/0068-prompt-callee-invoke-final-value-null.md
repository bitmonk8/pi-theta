# Bug 0068 — An `invoke` of a `mode: prompt` callee resolves `Ok(null)`: the callee's final value is dropped on the in-process prompt→prompt cell, where the identical body returns its value correctly when the same file is `mode: subagent`

- **Status:** open.
- **Kind:** defect — `invocation.md:36` states that a prompt-mode child
  "attaches to the caller's current conversation, but **the final value still
  propagates through the same return surface**". Observed: the parent receives
  `Ok(null)`. The literal `null` is indistinguishable from a callee that
  genuinely returned `null`, so the caller cannot detect the loss.
- **Affects:** the prompt→prompt cell of `#driveCallee`
  (`src/extension/production-theta-producer.ts:3169–3207`) — the branch guarded
  by `callerMode === "prompt" && callee.frontmatter.mode === "prompt"` at
  `:3169`. Not the subagent spawn path (`:3213–3241`), which returns the
  callee's value correctly.
- **Observed at:** `0.52.0` (`d06daae3`), Windows, inside a real spawned
  subagent-root child (`pi --mode json -p "/top" --no-session`), provider-free.
- **Scope caveat — read before triaging.** The caller in the reproduction is a
  `mode: subagent` theta running as its own process root, whose invokes are
  bound through `bindPromptConversation` and therefore carry `callerMode
  "prompt"` (`production-theta-producer.ts:1477`). The branch taken is the
  ordinary prompt→prompt cell, so this is most likely a **general** `invoke`
  defect rather than a subagent-specific one — it was found from a
  subagent-area probe and is filed here so it is not lost, but its natural
  owner is the invocation / cross-mode area. **The mechanism was not isolated**
  (see *Open questions*).

## Summary

Two `.theta` files with byte-identical bodies differ only in their `mode:`
frontmatter. Invoked from the same caller in the same run:

- `mode: subagent` callee → parent observes the callee's final value.
- `mode: prompt` callee → parent observes `Ok(null)`.

No diagnostic is emitted on either path.

## Reproduction

Provider-free, real child process, ~3 s wall. Fixtures in one discovery root,
driven through the production launch path as
`tests/subagent-child-real-spawn.test.ts` drives it (`launchSubagentChild` +
`createProductionSpawnFn` + `driveSubagentChild`, `process.argv[1]` pinned to
the repo's pi CLI entry and `PI_THETA_SUBAGENT_EXTENSION_PIN` pinned to this
tree's `extensions/`).

`kidp2.theta` — a prompt-mode callee whose whole body is one string literal:

```
---
mode: prompt
---
"PSTR"
```

`kidp.theta` — a prompt-mode callee whose final value is an enum variant:

```
---
mode: prompt
---
enum Sev { High = "high" }
Sev.High
```

`topp.theta` — the caller (its own process root; runs a real `invoke`, no model
turn):

```
---
mode: subagent
---
enum Sev { High = "high" }
schema R { crossed: boolean, viaLet: boolean, rawEnum: string, rawStr: string }
let x = Sev.High
let rp = invoke("./kidp.theta")
let vp = rp?
let rq = invoke("./kidp2.theta")
let vq = rq?
R { crossed: vp == Sev.High, viaLet: x == Sev.High, rawEnum: vp, rawStr: vq }
```

Observed envelope line on the caller's fd 1 (verbatim):

```
{"theta_result":{"v":1,"ok":{"crossed":false,"viaLet":true,"rawEnum":null,"rawStr":null}}}
```

and the parent-side drive result:

```
TOPP RESULT {"ok":true,"value":{"crossed":false,"viaLet":true,"rawEnum":null,"rawStr":null}}
TOPP DIAGS []
```

`rawStr: null` is the defect: `kidp2.theta`'s final value is the string
`"PSTR"`, and `rq?` bound `null`. `rawEnum: null` is the same loss for the
second callee. `viaLet: true` is the control — the caller's own body executes
and its expressions evaluate.

The contrast case in the same run, same caller shape, callee switched to
`mode: subagent` (`kid.theta`, body `enum Sev { High = "high" }` / `Sev.High`):

```
{"theta_result":{"v":1,"ok":"high"}}                       ← the callee's own envelope
{"theta_result":{"v":1,"ok":{"crossed":false,"local":true}}} ← the caller's
```

The callee's value reaches the caller (as a bare string — that loss is a
separate defect, filed as candidate 01). It is not `null`.

## Expected behaviour (what the spec says)

- `docs/spec_topics/invocation.md:36`, *Final-value propagation across
  callees*: "A callee's *final value* … flows to an `invoke` parent only on the
  callee's success outcome. A `prompt`-mode child attaches to the caller's
  current conversation, but the final value still propagates through the same
  return surface."
- `docs/spec_topics/invocation.md:68`, the prompt→prompt cell: `invoke(...)` to
  a prompt-mode callee "suspends the parent's body at the call site until the
  child returns". Nothing in that paragraph disposes of the returned value
  differently from the subagent cell.
- The implementation's own contract comment at
  `production-theta-producer.ts:3190–3199` states the intent explicitly: "an
  invoke callee returns its body's terminal FINAL VALUE across the boundary —
  NOT the PIC-53 trailing-turn text that `childBinding.surface` computes for a
  top-level prompt dispatch."

## Actual behaviour / what is established

The prompt→prompt branch (`:3169`) builds a child binding via
`bindPromptConversation`, runs `runPromptSuspendInvoke`
(`src/runtime/invoke-prompt-suspend.ts:99–125`, which is a pass-through around
`childBody()` plus the active-tool snapshot/restore), and projects the
execution with `surfaceCalleeFinalValue`
(`production-theta-producer.ts:3357–3367`):

```ts
if (execution.outcome === "success") {
  const value = execution.result.value ?? null;
  return isResultValue(value) ? value : makeOk(value);
}
```

`Ok(null)` therefore means `execution.result.value` was `undefined` (or `null`)
— i.e. `executeBody` (`src/runtime/statement-executor.ts:1690–1715`) returned
`functionResult("success", flow.value)` with `flow.value` empty, which
`executeBlock` produces as `{ kind: "normal", value: null }`
(`statement-executor.ts:1674`) when no tail-expression value was recorded.

What is **not** established is which input makes the tail value empty here. Two
candidates, not discriminated:

- the callee body handed to `executeBody` comes from
  `this.#input.parseCallee?.(theta.sourcePath, calleePath)`
  (`production-theta-producer.ts:3141`), a different parse entry point from the
  one a process-root theta goes through — the callee's tail expression may not
  survive that parse;
- the child `ExecuteBodyDeps` built by `bindPromptConversation` carries
  `mode: "prompt"`, and the tail statement may be dispatched as a turn rather
  than recorded as the final value under that mode.

Both are reachable by reading; neither was confirmed.

## Why it matters

- **Silently wrong value, not a failure.** `Ok(null)` passes `?` unwrapping,
  passes an untyped `invoke`, and reads as a legitimate `null` final value. A
  caller that returns or branches on the callee's answer gets `null` with no
  diagnostic (`TOPP DIAGS []`).
- **The one shipped acceptance fixture cannot see it.** `tests/live/acceptance/
  fixtures/acc-imports-invoke.theta` calls `invoke("./acc-child.theta")` for
  effect and discards the result (its own final value comes from `tagline()`),
  and its callee is `mode: subagent` anyway — its inline comment records "a
  `.theta` callee must be subagent-mode", which is not what `invocation.md:68`
  says.
- **Mode-dependent semantics for identical source**, the same divergence class
  as candidate 01 but with a larger delta: not a lost brand, the whole value.

## Open questions for the investigator

1. **Does this reproduce with a `mode: prompt` caller outside any subagent
   root?** The reproduction's caller is a subagent-root process. The branch
   taken is the same, but that has not been demonstrated end-to-end from a
   plain `pi` session. If it does reproduce, this is an invocation-area defect
   and should be re-filed as one.
2. **Which of the two candidate inputs empties the tail value** — the
   `parseCallee` body, or the prompt-mode `ExecuteBodyDeps`? Instrumenting
   `executeBody`'s `flow` for the callee separates them in one run.
3. **Is the `null` reached on every callee body shape, or only on a body whose
   tail is a pure expression?** Both probed callees have pure-expression tails.
   A callee ending in a query (the shape the prompt→prompt cell exists for) was
   not probed and is the shape most likely to behave differently.

## Non-goals

- Not about the enum-tag loss — that is a distinct defect on a distinct cell
  (candidate 01, the subagent envelope). `crossed: false` appears in this
  reproduction's output only because the same fixture measures both.
- Not a request to change `surfaceCalleeFinalValue`'s `?? null` default, which
  is correct for a genuinely value-less body.

## Related

- [0067](./0067-subagent-envelope-drops-enum-tag.md) (subagent envelope drops the enum tag) — found in the same
  probe; shares the fixture, not the mechanism.
- 0007 (off-session queries swallow a `stopReason: "error"` completion as
  `Ok("")`) — same shape: a fail-quiet path delivering a well-formed but empty
  `Ok` where the real outcome was different.

## Provenance

- Spec measured against: `docs/spec_topics/invocation.md:36`, `:55`, `:68`.
- Implementation read at `d06daae3`:
  `src/extension/production-theta-producer.ts:1477`, `:3141`, `:3169–3207`,
  `:3357–3367`; `src/runtime/invoke-prompt-suspend.ts:99–125`;
  `src/runtime/statement-executor.ts:1674`, `:1690–1715`.
- **Live-observed**, provider-free, through a real spawned
  `pi --mode json -p` child on the production launch path (scratch probe
  modelled on `tests/subagent-child-real-spawn.test.ts`, child pins applied,
  deleted after the run). The envelope bytes above are verbatim. The mechanism
  is **not** isolated and the general-vs-subagent-specific question is open —
  see *Open questions*.
