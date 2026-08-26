# Bug 0322 — `CodeToolError.cause: "unknown_tool"` has no producer: `rg '"unknown_tool"' src/` matches only the union declaration and the `codeToolErrorCauses()` contract list, the reference page's flat claim "the `unknown_tool` cause … is reachable only via the file-watcher reload path" names a path its own spec_topics expansion describes as intercepted at load (`theta/load/unknown-tool` + refusal to register), and the closest reachable input — a snapshot miss at dispatch — mints `cause: "execution"` instead

- **Status:** open.
- **Sev/Diff estimate:** S4/D3 — S4 because the observable cost is a dead
  author-facing `match` arm plus an unfalsifiable conformance member, with no
  silent acceptance and no wrong value on a reachable path: the reload path
  the spec names really is intercepted at load (the rebuilt theta refuses to
  register, so no call can happen), and the one adjacent runtime input class
  (a name the frozen snapshot does not hold at dispatch) is
  harness-only-reachable by the producer's own analysis. Not S3: unlike the
  `model_tool` sibling, no ordinary input class arrives under the wrong
  variant — the arm's emptiness is mostly a documentation-truth problem plus
  a safety-net that answers with the wrong cause if it ever fires. D3
  because the fix is an adjudication across four spec pages (which of the
  contradictory sentences wins) rather than a wiring change with an obvious
  seam.
- **Kind:** defect / spec inconsistency — the spec asserts producibility in
  three places while its own mechanism description forecloses it, and the
  implementation mints nothing. Elements at `ee681f7b` (v0.287.0):
  1. *The producibility claims.* `docs/reference/frontmatter.md:265–266`:
     "The `unknown_tool` cause on `CodeToolError` is reachable only via the
     file-watcher reload path." (flat, no expansion).
     `tool-calls.md:27`: "`unknown_tool` (callable was lost across a
     file-watcher reload — cannot occur during the lifetime of a single
     invocation, since the load-time `tools:` table holds strong references
     …)" — the "single invocation" qualifier implies occurrence across
     invocations. `tool-calls.md:38`: "The only situation where
     `CodeToolError` arises for a `.theta` callable is theta 1.0's
     `"unknown_tool"` safety net" — asserting the situation exists.
     `queryerror-variants.md:167`: the enum comment "callable was lost across
     a file-watcher reload".
  2. *The same spec's mechanism forecloses the path.*
     `frontmatter-fields-b-and-templates.md:25` expands the head claim:
     "…reachable only via the file-watcher reload path: when the watcher
     rebuilds a theta's table and a previously-resolved Pi tool is no longer
     in Pi's registry, the *next* invocation of the rebuilt theta records
     `theta/load/unknown-tool` and refuses to register; in-flight invocations
     against the previously-built table run to completion." A refused
     registration cannot be invoked and a completed in-flight invocation
     holds strong references — the described path mints the cause nowhere.
  3. *No emitter exists.* `rg -n '"unknown_tool"' src/` →
     `src/runtime/query-error.ts:111` (the `CodeToolCause` union) and
     `src/runtime/tool-call.ts:500` (`codeToolErrorCauses()`, the
     author-contract list consumed by conformance tests) plus comments. The
     other three causes have producers (`validation`:
     `tool-call.ts:629`/`:679`; `execution`: `tool-call-execute.ts:243`,
     `tool-call-host-denial.ts:151`; `cancelled`:
     `tool-call-off-surface.ts:365`).
  4. *The adjacent input class mints a different cause.* The one dispatch
     seam where a lost callable could present — `#resolveToolCall`'s
     `tool === undefined` arm
     (`src/extension/production-theta-producer.ts:3275`) — documents itself
     "unreachable from a REGISTERED theta" and, regime-inactive, rejects with
     `UnknownHostToolError` (`:3303`), which `runCodeSideToolCall` lowers as
     an `execute()` throw to `cause: "execution"`
     (`src/runtime/tool-call-execute.ts:234–246`). If the safety net ever
     fires, it answers with the wrong cause.
- **Related:**
  - **0293** (open) — the same no-emitter pattern on `InvokeInfraError`
    (`parse_failure`); this report cites it as the pattern parent.
  - **0016** (fixed 0.22.0) — established the callable-table dispatch model
    whose strong references make the arm structurally unreachable
    intra-invocation.
  - [0321](./0321-model-tool-error-variant-no-producer.md) — the sibling
    dead member one level up; differs in that `model_tool` has ordinary
    reachable input classes arriving under the wrong variant, where
    `unknown_tool`'s named path is genuinely intercepted.
- **Affected** (verified at `ee681f7b`, v0.287.0):
  - `src/runtime/query-error.ts:111` (`CodeToolCause` declares the member).
  - `src/runtime/tool-call.ts:494–500` (`codeToolErrorCauses()` exports it as
    the author contract), `:799` (the `.theta`-callable "safety-net" comment
    mirroring tool-calls.md:38).
  - `src/extension/production-theta-producer.ts:3275–3306` (the
    `tool === undefined` arm and its `execution`-bound rejection),
    `src/runtime/tool-call-execute.ts:234–246` (`lowerToolExecuteThrow`).
  - Renderer: SNK-g interpolates `<cause>` verbatim
    (`renderLeafKindNote`, `src/runtime/err-note-render.ts`, by symbol) — no
    per-cause deadness there, listed for completeness.
  - Spec: `docs/reference/frontmatter.md:265–266`;
    `docs/spec_topics/tool-calls.md:27`, `:38`;
    `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:25`;
    `docs/spec_topics/errors-and-results/queryerror-variants.md:160–168`.
- **Observed at:** v0.287.0 (`ee681f7b`). Offline, by census and source
  trace: whole-tree `rg` for the cause string (all hits read), the reload
  rebuild path read (`reload-wiring.ts` registry swap; `resolveCallableSet`
  refusal on unknown tools), the dispatch seam read
  (`#resolveToolCall` → `runCodeSideToolCall` lowering). No probe: the claim
  is a whole-tree negative plus spec-text comparison; the reload-refusal
  behaviour is pinned by existing reload suites.

## Summary

`CodeToolCause` is a closed four-member enum and the contract surface for
theta authors (`codeToolErrorCauses()`, tool-calls.md:27). Three members
have producers. `unknown_tool` has none, and the spec is internally split
about it: the reference page and two tool-calls.md sentences assert the
member is producible (via watcher reload; as the `.theta`-callable safety
net), while the frontmatter page's own expansion of the reload path
describes interception at load — the rebuilt theta records
`theta/load/unknown-tool` and refuses to register, in-flight invocations
complete on strong references — leaving no moment at which a runtime call
could observe a lost callable. The implementation agrees with the
interception reading everywhere except the one seam where a snapshot miss
could still present (a harness bypassing load admission), and there it mints
`cause: "execution"`, not `unknown_tool`.

A reference reader gets a flat producibility claim
(`frontmatter.md:265–266`) with no hint the path is intercepted; an author
following tool-calls.md's cause-enum guidance writes an `unknown_tool`
`match` arm that no input can reach; a conformance test over the closed
cause set cannot witness the member.

## Reproduction

Census, at `ee681f7b`:

```
rg -n '"unknown_tool"' src/
  src/runtime/query-error.ts:111   (CodeToolCause union)
  src/runtime/tool-call.ts:500     (codeToolErrorCauses() contract list)
  (+ comments at tool-call.ts:22,494,799)
```

No construction. Reload-path interception: `resolveCallableSet` rejects an
unknown Pi tool with `theta/load/unknown-tool`
(`src/parser/callable-set.ts:392`) and the theta "registers iff no
error-severity" (`production-composition.ts:1847`); the watcher rebuild
republishes via the PIC-36 registry swap, so a rebuilt theta with a lost
tool is absent from the registry — uninvocable. Dispatch seam: read
`production-theta-producer.ts:3275–3306` (rejection typed
`UnknownHostToolError`) and `tool-call-execute.ts:234–246` (throw →
`cause: "execution"`).

## Expected behaviour

One of the two spec voices, consistently:

- If the member is producible (reference/frontmatter.md:265–266,
  tool-calls.md:27/:38): some input class must mint
  `Err(CodeToolError { cause: "unknown_tool", … })`, and the natural one is
  the dispatch-time snapshot miss the `tool === undefined` arm already
  isolates.
- If the member is a structurally-unreachable safety net
  (frontmatter-fields-b-and-templates.md:25's interception description): the
  producibility sentences must say so (the `last_tool_name | null`
  "retained for forward compatibility — no theta 1.0-reachable case"
  precedent wording), and the reference page's flat "is reachable" claim
  must be corrected.

## Actual behaviour / root cause

The enum member was declared with the dispatch model that makes it
unreachable: load-time strong references (bug 0016's table) close the
intra-invocation window, load-refusal closes the reload window, and the
build-aside-then-publish swap (PIC-36) leaves no torn state between them.
Nobody wired an emitter because the design leaves it no input; nobody
retired the spec sentences because the member reads like a live safety net.
The one residual seam (a snapshot miss at dispatch) predates none of this
and was given the `execution` disposition when host-denial lowering was
built, so even the safety-net reading is contradicted by the shipped cause
selection.

## Why it matters

- `cause` is the author's `match` discriminator (queryerror-variants.md:
  authors "destructure `cause`"); a documented member that no input produces
  is dead author code and an unfalsifiable conformance claim — the same
  argument 0293 element 3 makes for `parse_failure`.
- The reference page actively misleads: "is reachable only via the
  file-watcher reload path" tells an author to expect and handle the cause
  after reloads, when the actual reload behaviour is load-refusal with a
  load diagnostic.
- If the fail-safe arm ever does fire (a future host bypassing load
  admission, a regression in the swap), the author sees `execution` — the
  cause documented as "tool's `execute()` threw" — for a call that never
  dispatched anything.

## Non-goals

- `theta/load/unknown-tool` (the load diagnostic) is correctly wired and
  out of scope.
- The subagent-root-regime branch of the `tool === undefined` arm (ladder
  dispatch under PIC-58's allowlist) has its own fail-closed contract and is
  not claimed wrong here.
- The other three `CodeToolCause` members are wired and untouched.

## Fix

Not yet decided; the adjudication is which spec voice wins:

1. **Reserved-member reading** (matches shipped behaviour): reword
   `reference/frontmatter.md:265–266` and `tool-calls.md:27`/`:38` to state
   the member has no theta-1.0-reachable case (kept for forward
   compatibility), citing the interception mechanism
   frontmatter-fields-b-and-templates.md:25 already describes. Cheap,
   honest; leaves a four-member contract enum with a permanently-dead
   member.
2. **Safety-net reading** (matches the member's name): mint
   `cause: "unknown_tool"` at the `tool === undefined` dispatch arm
   (replacing the `execution`-bound `UnknownHostToolError` rejection with a
   typed carrier, message unchanged), making the member the truthful
   disposition for any future input that reaches the seam; update
   frontmatter-fields-b-and-templates.md:25's expansion to name that seam
   instead of the intercepted reload story. Flips no committed cell (the arm
   is untested from registered thetas); the e2e-s5 suite's hand-built
   `unknown_tool` fixture (`tests/e2e-s5-slsh-chain-suffix.test.ts:75–79`)
   becomes constructable for real.

Either fix must not weaken load-refusal or the strong-reference dispatch
model.

## Provenance

Dead-arms-sweep bug hunt, worktree `C:/UnitySrc/pi-theta-hunt` at `ee681f7b`
(v0.287.0). Surfaces read: `query-error.ts`, `tool-call.ts`
(`codeToolErrorCauses`, the `.theta`-callable comment),
`tool-call-execute.ts` (throw lowering), `#resolveToolCall`
(`production-theta-producer.ts`), `callable-set.ts` (load refusal),
`reload-wiring.ts` (registry swap); spec `tool-calls.md`,
`queryerror-variants.md`, `frontmatter-fields-b-and-templates.md:25`,
`reference/frontmatter.md:255–266`. Measurement: whole-tree `rg` census; all
hits and both spec voices read in full.
