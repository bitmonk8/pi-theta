# Bug 0322 — `CodeToolError.cause: "unknown_tool"` has no producer: `rg '"unknown_tool"' src/` matches only the union declaration and the `codeToolErrorCauses()` contract list, the reference page's flat claim "the `unknown_tool` cause … is reachable only via the file-watcher reload path" names a path its own spec_topics expansion describes as intercepted at load (`theta/load/unknown-tool` + refusal to register), and the closest reachable input — a snapshot miss at dispatch — mints `cause: "execution"` instead

- **Status:** fixed (0.346.0).
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
error-severity" (`production-composition.ts:2010`); the watcher rebuild
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

## Fix (0.346.0)

The settled COMBINED route (mint-at-the-seam PLUS the reachability correction),
adjudicated by the parent and shipped. The `## Fix` text above is the original
filing (options open) and is preserved unedited; this section records what
shipped.

- Parent adjudication (verbatim): "COMBINED route — mint-at-the-seam PLUS the
  reachability correction. (a) SRC: the regime-INACTIVE `tool === undefined` arm
  stops rejecting with the execution-bound UnknownHostToolError and instead
  produces the typed carrier lowering to Err(CodeToolError{ cause: 'unknown_tool',
  … }) with the human-visible message text UNCHANGED and the same refusal surface
  (the call never dispatches; the loop/round accounting unchanged); the
  subagent-root-regime branch (PIC-58 ladder) is UNTOUCHED (doc non-goal); exact
  carrier mechanics = lane's choice within these constraints (thread the existing
  seam's tool name into the carrier's fields per the CodeToolError schema; do NOT
  invent new fields), recorded in the fix record. Rationale: unlike 0321 (retired
  this same batch — no input class remained), here a concrete seam already
  ISOLATES exactly the named condition ('the name is not in the frozen snapshot
  at dispatch' IS 'unknown tool' literally) and currently answers with a
  documented-false cause; minting there is a cause-correctness fix that flips no
  committed cell (the doc: the arm is untested from registered thetas —
  premeasure MUST verify), weakens neither load-refusal nor the strong-reference
  dispatch model (structural guarantees intact — the arm stays harness-only-
  reachable from theta-1.0 inputs), and makes the member's name,
  codeToolErrorCauses()'s contract, and tool-calls.md:38's safety-net sentence
  TRUE. (b) SPEC: reference/frontmatter.md:265-266's flat reload claim is
  CORRECTED under either voice — the reload path is intercepted at load (cite the
  fields-b expansion's mechanism); the truthful statement: unknown_tool is the
  dispatch-time safety net's answer, with NO theta-1.0 load-admitted reachable
  case (the last_tool_name|null precedent wording); (c) tool-calls.md:27's
  parenthetical reconciled to the same story (the 'cannot occur during the
  lifetime of a single invocation' clause is TRUE and stays; the reload
  implication goes); :38 as landed by 0349 — under this fix its safety-net
  assertion becomes TRUE; adjudicate in-lane whether it needs ANY edit (prefer
  none or a minimal truth-tightening; record); (d)
  frontmatter-fields-b-and-templates.md:25's expansion names the actual seam
  (dispatch-time snapshot miss answers unknown_tool) alongside its correct
  interception story; (e) queryerror-variants.md:160-168: the enum comment at
  :167 ('callable was lost across a file-watcher reload') → truthful safety-net
  wording — EDIT ONLY the CodeToolError section; the §model_tool region above
  (:110-119) carries 0321's fresh edits — do not touch it. NO new diagnostic code
  (the carrier is an existing QueryError variant — permitted-codes stays
  byte-identical). NO change to the other three causes' producers."

- In-lane adjudications (recorded):
  - tool-calls.md:38 — NO EDIT. `.theta`-callable calls classify as
    `"theta-callable"` (`#classifyCall`) and route through the invoke trampoline,
    never `#resolveToolCall`; the fix mints `unknown_tool` only on the
    `"pi-tool"`-classified dispatch arm. The sentence's plain reading is
    compatible with the enum-level enumeration at `:27` (which WAS corrected);
    minimal-touch per the steer.
  - errors-and-results.md:310 — bounded, recorded self-authorization: the
    CodeToolError enum comment there is a byte-identical mirror of
    queryerror-variants.md:167 (0321 touched only that file's ModelToolError
    section); fixing one and not the other would reintroduce the very
    spec-internal divergence this bug is about. Comment/prose-only, no
    assertion, no behaviour. Evidence: (1) the two comments are byte-identical
    mirrors of the same enum; (2) the bug IS spec-internal inconsistency — a
    split mirror reintroduces it; (3) prose-only. STOP valve (unused): if not a
    plain mirror, stop and report.

- What shipped (keyed to §Fix):
  - `src/runtime/tool-call.ts` — new `buildCodeToolUnknownTool(toolName)`
    producer (co-located with `buildCodeToolArgSchemaViolation` /
    `codeToolErrorCauses()`) minting `Err(CodeToolError{ cause: "unknown_tool",
    tool_name, message })`; message byte-identical to the pre-fix lowered text
    `code-side call names no resolvable host tool '<name>'`. §Fix (a).
  - `src/runtime/tool-call-execute.ts` — `unknownHostTool` pre-dispatch carrier
    field on `CodeSideToolCall`, the `unknown-tool-error` `ToolCallExecOutcome`
    kind, and the short-circuit in `runCodeSideToolCall` (before dispatch,
    beside `argSchemaViolation`; `committed: []`). §Fix (a).
  - `src/runtime/effectful-statement-host.ts` — `case "unknown-tool-error"`
    grouped with `arg-schema-error`, surfacing the `Err` as the tool-call
    expression value. §Fix (a).
  - `src/extension/production-theta-producer.ts` — `#resolveToolCall` evaluates
    the regime at resolve time and sets the `unknownHostTool` carrier when
    `tool === undefined && !regime.active`; the regime-inactive dispatch reject
    became an unreachable defensive `throw` (kept for type-narrowing and to keep
    `UnknownHostToolError` referenced by the PIC-58 ladder rungs); the
    regime-ACTIVE ladder branch is untouched. Arm comments updated to the new
    disposition. §Fix (a).
  - `docs/reference/frontmatter.md` — the flat "reachable only via the
    file-watcher reload path" claim corrected: reload intercepted at load;
    unknown_tool is the dispatch-time safety-net answer, no load-admitted case.
    §Fix (b).
  - `docs/spec_topics/tool-calls.md` — `:27` parenthetical keeps the true
    "cannot occur during the lifetime of a single invocation … strong
    references" clause and drops the reload implication for the dispatch-time
    safety-net truth. `:36` (0321's) and `:38` untouched. §Fix (c).
  - `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md` — `:25`
    keeps the correct load-interception mechanism and names the actual
    dispatch-time snapshot-miss seam (harness-only-reachable). §Fix (d).
  - `docs/spec_topics/errors-and-results/queryerror-variants.md` — the
    CodeToolError enum comment `:167` truth-tightened to the dispatch-time
    snapshot-miss wording; the §model_tool region (0321's) untouched. §Fix (e).
  - `docs/reference/errors-and-results.md` — the byte-mirror CodeToolError enum
    comment `:310` given the same wording (bounded mirror above). §Fix (e).
  - `tests/b0322-unknown-tool-dispatch-safety-net.test.ts` (NEW) — the witness:
    (A) the regime-inactive snapshot miss surfaces cause `unknown_tool` with the
    same message/kind/tool_name/ok (RED `execution` at fork → GREEN
    `unknown_tool`); (B) known-tool dispatch control (byte-identical `Ok`); (C)
    the closed four-member `codeToolErrorCauses()` contract cell; (D) the PIC-58
    regime-active control (ladder route untouched).
  - Comment/citation-only line-drift reconciliations caused by the src
    insertions: `tests/b0295-child-internal-cancel-wrap-arm.test.ts`
    (:453→:507), `tests/effectful-statement-host.test.ts` (:804→:833),
    `tests/invoke-depth-wire-form-metric.test.ts` (:743→:772). No assertion or
    executable change.

- Gates: witness — RED-to-GREEN by revert-in-place (verifier neutralised the
  mint → case (A) reds observing cause `execution` vs `unknown_tool`; restored
  byte-exact → 4/4 green). Full default suite `npm test` 526 files / 9918 tests
  passed (baseline 525/9914 + the new witness file 1/4; zero flips).
  `npm run typecheck` (tsc --noEmit) exit 0. `npm run lint` (eslint) exit 0.
  permitted-codes.json hash byte-identical
  (`a4a8da04209f90e13d815edd92c1fc682e2a2236`); LPA held at 14864 lines
  (grepped, not edited).
- Review: 1 round. R1 (`bug-fix-reviewer`, deep) — CLEAN, zero
  correctness/fidelity/spec/test/house-rule findings; confirmed 0321/0322 hunk
  disjointness, message byte-identity, the never-dispatched short-circuit,
  regime-active untouched, no new fields / no diagnostic, 0343 N/A, spec (b)-(e)
  mutually consistent, witness cases A-D. A comment/citation-only pre-review
  correction round (witness file line-citation refresh) preceded it and is not a
  review round.
- Verification: SOLID (`bug-fix-verifier`). (1) witness reds without the fix and
  greens after a byte-exact restore; (2) full suite 526/9918 green; (3) LIVE —
  not owed: the minted seam is harness-only-reachable (parse denies an
  out-of-scope callee; load-time admission freezes every `tools:` name), so
  registration and drive outcomes for load-admitted thetas are unchanged
  (`git grep` over `tests/live` for the seam / `unknown_tool` empty; the fix
  touches no registration/load path); (4) typecheck + lint exit 0.
- Residuals:
  1. R1 (non-blocking, house-rule): `buildCodeToolUnknownTool` reuses the
     `CodeToolArgSchemaViolation` return-type name (shape-identical `{ result,
     error }`); the docstring explains the reuse. A neutral shared alias would
     read cleaner. No behavioural effect.
  2. R2 (non-blocking, test): the mint does not apply the 4096-byte
     `truncateUtf8CodePointBoundary` cap the pre-fix `execute()`-throw lowering
     applied; it diverges only for a ≥~4KB harness-injected callee name (the
     seam is itself harness-only). The sibling `validation` builder does not
     truncate either; message-identity holds for the entire realistic input
     class.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the `theta/load/unknown-tool` load
  diagnostic, the strong-reference dispatch model (bug 0016), and load-refusal
  are unweakened (§Non-goals). The regime-ACTIVE PIC-58 ladder branch and the
  other three `CodeToolCause` producers are untouched. No new CodeToolError
  fields; no new diagnostic code. `unknown_tool` is now the truthful disposition
  of the dispatch-time snapshot miss; no theta-1.0 load-admitted reachable case
  exists.

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
