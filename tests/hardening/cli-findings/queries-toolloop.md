# Real-CLI hardening — typed-query schema-validation, respond_repair, tool_loop, code-driven tool calls

Lens: Loom's core query round-trip machinery, driven through the **real `pi` CLI**
(`pi -ne -e ./extensions --loom <dir> --model claude-haiku-4-5 -p "/<stem>"`).
Observation channels: prompt-mode queries stream to stdout (every query is a
user-visible turn as of the QTL-1 fix — see QTL-1), `--mode json` `agent_end`/`message_end`/tool-use
events, deterministic marker files written by code-driven `bash(...)` calls, and
registration (a loom that fails to load is sent to the model as literal chat).

Method note (forced-fail vehicle): a fixed nest of five object schemas whose only
AJV-valid instance is JSON depth 6 (`{"z":{"a":{"b":{"c":{"d":1}}}}}`) makes a
typed-query response fail validation *deterministically* regardless of model
compliance — the model returns valid-shaped JSON and the depth walk (ceiling #4
row #1) rejects it. Used to exercise respond-repair and `?`-propagation without
relying on the model to misbehave.

Dedupe: distinct from `tests/hardening/findings/queries-schemas.md`
(QRY-1..6/18) and `tests/hardening/cli-findings/SUMMARY.md`
(EXPR-CLI-1, INVCEIL-1/2/3, IMPORTS-1/2, DISCLI-1, BND-2, FMC-1).

---

## FINDING QTL-1 [FIXED]: prompt-mode drops every query after the first from the user-visible conversation (chained queries run off-session)

**STATUS: FIXED** (Phase 3a, production-conformance program). The self-acknowledged
DIVERGENCE is removed: in prompt mode EVERY non-short-circuit query is now a
real user-visible streamed turn against the user session (SLSH-2). The off-session
chained-query path (`OffSessionQueryModel` / `offSessionComplete`) is no longer
routed to for prompt-mode real queries — the `queryOrdinal` gate that limited
visibility to the first query was deleted; `userVisible = !shortCircuits`. The
empty-template short-circuit still issues NO provider turn. Each query turn
installs the loom's callable-set active tools (QTL-4 set). This also resolves the
off-session empty-reply auth bug (the off-session path resolved no request auth,
so a chained query could return an empty error-stop reply).

Fix site: `src/extension/production-loom-producer.ts` `bindPromptConversation`
(`resolveQuery` closure — `userVisible` computation).

Live before/after (probe `tests/hardening/session-promptstream.test.ts`, a
prompt-mode loom with two sentinel-pinned body queries `Reply with exactly: AAA`
then `Reply with exactly: BBB`, observing the harness `assistantText` streamed-
text channel):

- BEFORE (pre-fix source): `assistantText: "AAA"`, `userTexts: ["Reply with
  exactly: AAA"]` — only the first query streamed; BBB ran off-session and never
  reached the transcript.
- AFTER (fix): `assistantText: "AAABBB"`, `userTexts: ["Reply with exactly: AAA",
  "Reply with exactly: BBB"]` — both replies stream, both are real non-empty turns.

Original finding (retained for provenance):

- repro:
  ```loom
  ---
  description: two
  mode: prompt
  ---
  @`Repeat verbatim, output nothing else: AAA=first`
  @`Repeat verbatim, output nothing else: BBB=second`
  ```
  `MSYS_NO_PATHCONV=1 timeout 90 pi -ne -e ./extensions --loom <dir> --model claude-haiku-4-5 --mode json -p "/two"`
  Also confirmed body-runs-fully with a bash-marker probe: a loom that writes a
  marker via `bash(...)` *before* and *after* a query writes **both** markers, so
  the body executes to completion — only the query's user-visible turn is dropped.
- expected: Both queries issue a turn in the caller's conversation. guide.md
  §modes: "In **prompt mode**, each query runs as a turn in the *caller's current*
  conversation … every turn is user-visible and nothing is hidden" and "Both modes
  drive a conversation across however many turns the code issues." The guide's
  recommended pattern — "An author who wants the user to see a result issues a
  final query whose text contains it" — presumes a trailing query is visible.
- observed: Only the **first** query round-trips through the session.
  `agent_end.messages` contains exactly one user + one assistant message; a single
  `responseId`; `BBB=second` never appears on stdout and is absent from the
  transcript. The mechanism is deliberate and self-documented in
  `src/extension/production-loom-producer.ts:497` ("Only the first query in a
  dispatch drives a user-visible streamed turn (SLSH-2); any subsequent query …
  is a chained follow-up run off-session (`complete()`, no transcript card) …
  **See the module header / status DIVERGENCE: a fuller design would stream every
  prompt-mode turn, which the shipped acceptance looms do not require**"). Chained
  queries still execute and return values to code — they are invisible, not
  skipped.
- verdict: **borderline** — a real, self-acknowledged spec-vs-impl divergence: the
  guide promises every prompt-mode turn is user-visible and recommends a trailing
  "result" query that this implementation hides whenever any prior query exists.
  The value-producing round-trip works; only user-visibility diverges. Flagged
  because it silently defeats the documented "final query shows the result"
  pattern and shapes every prompt-mode observation.

---

## FINDING QTL-2: code-driven `<name>(...)` resolves against Pi's whole builtin tool registry — the `tools:` callable set is not enforced and ambient tools are inherited

- repro (three variants, all deterministic — no model turn needed for the tool call):
  ```loom
  ---
  description: nobash
  mode: prompt
  ---
  let x = bash({ command: "echo LEAK" })?
  @`Repeat verbatim, output nothing else: BASH=${x}=END`
  ```
  ```loom
  ---
  description: notinset2
  mode: prompt
  tools: grep
  ---
  let x = read({ path: "docs/examples/hello.loom" })?   # read NOT in the callable set
  @`Repeat verbatim, output nothing else: NREAD=${x.length}=END`
  ```
  Also: `grep(...)`/`read(...)` with no `tools:` at all both execute and return
  real file content.
- expected: With `tools:` absent the callable set is empty and loom code has **no**
  `<name>(...)` callables; with `tools: grep` only `grep` is callable. frontmatter.md
  §`tools:`: "The Pi session's ambient tools are **not** inherited"; "Absent `tools:`
  → empty callable set … loom code has no `<name>(...)` callables"; Resolution
  snapshot: "Calls dispatch through the held reference; **the runtime never
  re-queries Pi's tool registry by name during execution**." call-a-tool-from-loom-code.md
  repeats "the callable set is empty by default and the host session's ambient
  tools are not inherited." An out-of-set / undeclared call should surface (per the
  frozen-table contract) rather than execute an ambient tool.
- observed: All calls execute. `nobash` → `BASH=LEAK` (bash ran with no `tools:`).
  `notinset2` → `NREAD=149` (read executed although the callable set is `{grep}`).
  Undeclared `grep`/`read` return real file content (3700 / 149 bytes). Only a
  truly-unknown name (`foobartool(...)`) fails (registers, then a runtime Err). Root
  cause in source: the code-driven resolver
  `production-composition.ts:579 resolvePiTool → builtinToolDefinition(name, ctx.cwd)`
  resolves **any** builtin tool by name, ignoring the per-loom callable set; the
  frozen `tools:` table is never consulted for a code-driven call.
- verdict: **bug** — the callable-set restriction is not enforced for code-driven
  calls and the host's ambient tools (read, write, edit, bash, grep, …) are fully
  inherited, directly contradicting the normative `tools:` contract. Security-
  relevant: a loom with `tools:` absent (or narrowly scoped) can still `bash(...)`
  arbitrary commands from code.

---

## FINDING QTL-3: depth-violation typed-query failures never enter respond-repair — `attempts` is 0 even under the default budget of 3

- repro (default respond_repair, i.e. `attempts: 3`):
  ```loom
  ---
  description: rrdef
  mode: prompt
  tools: bash
  ---
  schema L5 { d: integer }
  schema L4 { c: L5 }
  schema L3 { b: L4 }
  schema L2 { a: L3 }
  schema L1 { z: L2 }
  let e = match @<L1>`Reply with exactly this JSON and nothing else: {"z":{"a":{"b":{"c":{"d":1}}}}}` {
    Ok(_) => 900,
    Err(QueryError { kind: "validation", cause: "schema_validation", attempts }) => attempts,
    Err(QueryError { kind: "validation" }) => 800,
    Err(_) => 700,
  }
  # if-cascade writes the value of `e` to a marker file via bash(...)
  ```
  Ran with default `respond_repair`, `attempts: 1`, and `methodology: none`.
- expected: A depth-6 response is rejected at enforcement point #1 (typed-query
  response). schema-subset.md depth table + hard-ceilings.md ceiling #4: row #1 →
  `Err(QueryError { kind: "validation", cause: "schema_validation", validation_errors:
  [{ schema_keyword: "maxDepth" }] })`, and "Typed-query respond-repair applies
  **only at row #1**". So under the default budget the runtime should issue up to 3
  respond-repair follow-ups and report `attempts` accordingly (as it does for other
  validation misses).
- observed: The failure is correctly classified (`kind: "validation"`,
  `cause: "schema_validation"`, catchable), but **`attempts` is 0** for the default
  (3), for `attempts: 1`, and for `methodology: none` alike, and `--mode json` shows
  exactly **one** model response (no follow-up turn issued). Contrast: a non-depth
  AJV miss *does* drive repair — a `schema S { v: integer }` query coerced toward a
  float returned `attempts: 2` under `respond_repair.attempts: 2` (matching the
  budget) with multiple streamed turns. So respond-repair works, but depth-class
  validation failures bypass it.
- verdict: **borderline** — a reproducible divergence from the ceiling #4 / respond-
  repair routing (row #1 is documented as respond-repair's scope with no depth
  carve-out). Plausibly an intentional "structural failure is unrepairable" short-
  circuit, but it is undocumented and makes `attempts` silently 0 on a path the
  spec places inside the repair budget.

---

## FINDING QTL-4 [FIXED]: in prompt mode the model receives no tools during a query — the driver forces the active set to `[]`, so `tools:` is unusable by the model and ceiling #2 is unreachable

**STATUS: FIXED.** The `setActiveTools([])` under-permission was fixed in Phase 3a
(prompt-mode query turns now install the loom's callable set — see the QTL-4
repro line about `production-loom-producer.ts`). The follow-on
**ceiling #2 unreachability** ("model-driven tool loops … therefore ceiling #2
… are unreachable") is fixed in Phase 4 STAGE B: pi's native prompt-mode agentic
tool loop is now bounded to `tool_loop.max_rounds` through pi's `tool_call` /
`before_provider_request` hooks. See `session-findings/promptloop.md` (PL-1) for
the hook mechanism and live before/after.


- repro:
  ```loom
  ---
  description: tloop2
  mode: prompt
  tools: grep
  tool_loop:
    max_rounds: 1
  ---
  @`Do these ONE AT A TIME in separate grep tool calls: grep "aaa" in docs, then "bbb", "ccc", "ddd". Do not answer until all four are done.`
  ```
  `--mode json -p "/tloop2"`.
- expected: `tools: grep` is "available to the model during query-time tool loops"
  (frontmatter.md §`tools:` / `tool_loop`). A model instructed to loop grep should
  be able to call it, and exceeding `max_rounds` should surface
  `Err(kind: "tool_loop_exhausted", rounds: 1)` (hard-ceilings.md ceiling #2).
- observed: The model makes **0** `grep` tool calls (`"name":"grep"` count = 0 in the
  JSON) and finalises immediately. A separate typed-query run streamed the model's
  own words: *"I do not have access to the `__loom_respond_<slug>` tool. My available
  tools are listed as: **(none)**."* Source: the prompt driver
  `production-loom-producer.ts:1246` unconditionally calls `this.#pi.setActiveTools([])`
  for the query turn (comment intends "the loom's callable set (empty for these
  looms)" but hardcodes empty; a second driver at `:1537` does the same). Subagent
  mode, by contrast, passes the callable set to the model
  (`subagent-isolation.ts:229 tools: inputs.customTools.map(t => t.name)`). So the
  defect is prompt-mode specific.
- verdict: **bug** — in prompt mode a declared `tools:` entry is invisible to the
  model during a query; model-driven tool loops, and therefore ceiling #2
  (`tool_loop_exhausted`), are unreachable. Intent-vs-impl mismatch (the driver
  should install the loom's callable set, not `[]`). Under-permissive twin of QTL-2
  (code-driven calls, which over-reach into the ambient registry). No hang was ever
  observed — the loop always terminated cleanly.

---

## FINDING QTL-5: a bare `array` type in schema position (out of the documented subset) is silently accepted with no load diagnostic

- repro:
  ```loom
  ---
  description: barearray
  mode: prompt
  ---
  schema Bad { items: array }
  let r: Bad = @`give items`?
  @`Repeat verbatim, output nothing else: RAN=barearray`
  ```
- expected: `array` is not a Loom type. schema-subset.md §The subset: "Bare `array`
  is not a Loom type; use `array<T>`." A reasonable user (and the FMC-1 fix, which
  now mirrors dropped-loom load errors to stderr) expects a parse/type diagnostic
  and the loom to not register — as the empty-schema case (`loom/parse/empty-schema-body`)
  does.
- observed: The loom loads, registers, and runs; the typed query lowers `items` to
  an array schema and the model returns `{"items":[]}`. stderr is empty (no FMC-1
  diagnostic). Silent out-of-subset acceptance.
- verdict: **borderline** — a schema-subset declaration-validation gap (same class
  as queries-schemas.md QRY-5's unwired parse checks, on the type-grammar surface).
  Adjacent to the README's known type-layer diagnostic gap; reported because it is
  specifically the out-of-subset construct the lens was asked to probe and it
  surfaces no diagnostic on any channel.

---

## Verified-conformant (recorded to bound the search — not findings)

- **Typed-query happy path.** A rich schema exercising object, `integer`, `number`,
  `boolean`, literal-union (`"ok"|"warn"|"fail"`), `array<string>`, nested object,
  and `string | null` lowered to correct Draft-2020-12 JSON Schema (verified in the
  streamed user turn: `integer`/`number`/`boolean`/`enum`/`items`/`$ref`/`type:[…,null]`,
  `additionalProperties:false`, full `required`) and the response validated and
  bound; `r.v == 7` and nested/array reads confirmed via marker branches.
- **Schema-subset edges that should load, load.** `array<Leaf>` (array of objects),
  4-level nesting at depth 5, and a 6-member literal union all register and validate.
- **CodeToolError.** `read({ path: "nosuchfile" })` → `Err(QueryError { kind:
  "code_tool", cause: "execution" })`, catchable; `Err(QueryError { kind })`
  destructuring and `Err(QueryError { kind: "code_tool" })` const-matching both work.
- **Unhandled `?` on a failed typed query → clean fail.** Depth-forced failure
  propagated by `?` ends the loom without a host crash (exit 0); the pre-`?`
  `bash(...)` side effect remains (ERR-13 no-rollback) and the post-`?` statement is
  skipped (early return). No raw throw reached the host.
- **respond-repair terminates cleanly.** Every `respond_repair` config (default,
  `attempts: 1`, `methodology: none`) returned a catchable
  `Err(kind: "validation")` with no hang; `methodology: none` and `attempts: 1`
  reported the expected `attempts` on the *non-depth* path (see QTL-3 for the depth
  exception).
- **tool_loop terminates cleanly.** `max_rounds: 1` runs never hung; they exited 0
  (the cap could not be *tripped* only because the prompt-mode model gets no tools —
  QTL-4).

## Note on discarded leads

Early "match returns `null`" observations were a *test artefact*: a bare-backtick
`` `...${x}...` `` is not a Loom string form (grammar.md §String literals — only
`'...'`/`"..."`, no interpolation; interpolation lives in `@`...`` queries). In a
`let` RHS it correctly errors (`loom/parse/let-without-initialiser`); inside a
`match` arm body it evaluated to `null` instead of erroring — a minor lexer
inconsistency, not pursued (no author writes bare backticks).
