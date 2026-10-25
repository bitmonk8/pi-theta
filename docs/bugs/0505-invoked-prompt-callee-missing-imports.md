# Bug 0505 — an `invoke(...)`d prompt-mode callee that attaches to a prompt-mode caller's session runs with no materialised imports: `parseCalleeTheta` builds the callee's composition input without `imports`, so a call to the callee's own imported `fn` fails `code_tool` / `unknown_tool` and an imported `enum` variant panics, while the same file run as a slash command resolves both

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published; the existing package version does not contain this fix. See the
  fix record below; no resolving commit is assigned here.
- **Filed:** 2026-10-02 as residual 1 of the bug-0504 fix
  ([0504](./0504-thetalib-invoke-resolves-caller-relative.md), `## Fix
  (0.495.0)` Residuals; review round 1, R1)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D1 — S2: a conformant callee (a `mode: prompt`
  `.theta` with a top-level `import` it calls) loads clean and then fails at
  runtime on the prompt→prompt invoke route with a misleading diagnostic
  (`code_tool` `unknown_tool`, a cause bug 0322 documents as unreachable for
  a registered theta) or a panic; fail-closed, no wrong value observed. D1:
  the import pass already runs inside `parseCalleeTheta`'s structural check,
  and its `imports` result is discarded; the fix surfaces that result and
  spreads it onto the callee input in one file
  (`src/extension/production-composition.ts`), no new registry row, one
  witness file.
- **Where (pi-theta, main 12f1ccfd, 0.495.0):**
  - `src/extension/production-composition.ts:4657` — `parseCalleeTheta`, the
    dispatch parse behind `parseCallee` (wired at `:1820-1829`). Its
    composition input (`:4717-4742`) carries `slashName`, `sourcePath`,
    `frontmatter` (with `patchedSystemTemplate` threaded at `:4728-4731`),
    `body`, and `importedTypeDecls` (`:4739-4741`); it carries no `imports`.
    The final return (`:4787-4800`) adds `callableSet` and
    `rootClosureHash`, still no `imports`. The comment at `:4733-4738` says
    `importedTypeDecls` is threaded "mirroring how
    `imports`/`patchedSystemTemplate` are threaded here"; `imports` is not
    threaded here.
  - `src/extension/production-composition.ts:4257` —
    `calleeFailsOwnStructuralChecksBody` runs
    `checkThetaImports(calleeInput, { fs, parseDeps: deps, claimDelivery:
    false })` at `:4290-4294` and returns `patchedSystemTemplate` and
    `importedTypeDecls` from that result (`:4303`, `:4308-4311`, returned at
    `:4325-4326` / `:4355-4356`); `importCheck.imports` is computed and
    dropped. `claimDelivery: false` governs only the `undelivered`
    diagnostic remainder (`src/extension/import-static-checks.ts:620-623`);
    the materialised `imports` list is built regardless.
  - The slash-registration route DOES materialise imports:
    `composeOneTheta` (`src/extension/production-composition.ts:1880`) runs
    `checkThetaImports` at `:2061-2064` and spreads
    `importCheck.imports` onto the composed input at `:2194`.
  - `src/extension/invoke-machinery.ts:379-390` — the prompt→prompt cell of
    `#driveCallee` hands the parsed `callee` to
    `#driveAttachedPromptCallee`, which binds it in-process through
    `bindPromptConversation({ theta: callee, … })` (`:421-433`) and runs
    `executeBody(callee.body, childBinding.executeDeps)` (`:460`).
  - `src/extension/production-theta-producer.ts:890-896` —
    `bindPromptConversation` builds the body's environment with
    `buildBoundEnvironment(theta.body, bindInput.paramBindings,
    theta.imports, …)`. With `theta.imports` undefined,
    `LexicalEnvironment.materializeImports`
    (`src/runtime/lexical-environment.ts:455-499`) registers nothing, so
    `resolve` arm 3, "imported `.thetalib` symbol" (`:606-619`), never
    matches.
  - `src/runtime/tool-call.ts:328-334` — `buildCodeToolUnknownTool` mints
    the observed `code-side call names no resolvable host tool '<fn>'`. Its
    doc comment (`:314-327`) states this carrier is "harness-only-reachable"
    for a registered theta; this route reaches it in production.
- **Spec:** `docs/spec_topics/imports.md:3` — "`.theta` files import
  schemas and functions from **`.thetalib`** files"; `:20` — "A top-level
  import stays legal in both hosts — it is how a `.theta` or a `.thetalib`
  consumes a lib"; `docs/spec_topics/expressions.md:44-49` — a call-position
  identifier resolves, third, to "A symbol imported from a `.thetalib`
  file". `docs/spec_topics/invocation.md:69` (prompt→prompt row: "Child
  attaches to caller's current conversation") and `:76` ("The child uses
  *its own* frontmatter `model`, `tools`, and `system`. The caller's
  settings are not inherited.") change only the conversation anchor and the
  settings source. Neither sentence, nor any other in invocation.md, removes
  the callee's own imports.

## Symptom

A `mode: prompt` callee `callee.theta`:

```
import { via_lib } from "./lib.thetalib"
via_lib()
```

returns `"FROM-LIB"` when run as `/callee`. Invoked from a `mode: prompt`
caller (`let v = invoke<string>("./callee.theta")?`), the same file loads,
attaches, and fails:

```
theta /caller returned Err: tool via_lib call failed (unknown_tool) — code-side call names no resolvable host tool 'via_lib' from <cwd>/.pi/theta/callee.theta invoked at <cwd>/.pi/theta/caller.theta:4
```

A callee that references an imported `enum` variant (`let c = Color.Red`)
fails the same route with `invoke of ./callee.theta failed (panic)`. A
callee that calls its own same-file `fn` succeeds through the same route.

## Expected (spec citations)

An invoked callee's body resolves its own top-level `import` declarations
exactly as it does when it runs as a slash command: an imported `fn` is
callable, an imported `schema` is a constructor, and an imported `enum`'s
variants resolve (imports.md:3, :20; expressions.md:44-49 arm 3). The
prompt→prompt cell changes which conversation the callee's queries run
against (invocation.md:69) and makes the callee use its own frontmatter
(invocation.md:76). The callee's name scope stays its own file's scope,
including its imports.

## Actual (implementation citations)

`parseCalleeTheta` (`production-composition.ts:4657`) returns a
composition input with no `imports` key. On the prompt→prompt leg the
parent binds that input in-process (`invoke-machinery.ts:421-433`), and
`bindPromptConversation` passes `theta.imports` (undefined) to
`buildBoundEnvironment` (`production-theta-producer.ts:890-896`). The
callee's imported names reach no resolution arm. An imported `fn` call
falls through to the code-side tool dispatch and mints `CodeToolError {
cause: "unknown_tool" }` (`tool-call.ts:328-334`). An imported `enum`
member access panics. Load raises no diagnostic: the structural check at
`:4696-4713` runs the import pass, the pass succeeds, and only its
`imports` output is discarded.

Probe results (scratch test over the shipped composition root,
`discoverAndComposeFixtures` + `fixture.run`, provider-free; HEAD 12f1ccfd,
0.495.0, 2026-10-02). Layout: `.pi/theta/lib.thetalib` (`fn via_lib() {
"FROM-LIB" }`, `enum Color { Red, Blue }`), `.pi/theta/callee.theta`
(prompt mode), `.pi/theta/caller.theta` (prompt mode, `let v =
invoke<string>("./callee.theta")?` then `v`):

| arm | callee body | dispatched | result |
|---|---|---|---|
| A | imports and calls `via_lib()` | `/caller` | `Err`: `tool via_lib call failed (unknown_tool) — code-side call names no resolvable host tool 'via_lib'` |
| B | same as A | `/callee` | success (no `Err` note) |
| C | imports `Color`, evaluates `Color.Red` | `/caller` | `Err`: `invoke of ./callee.theta failed (panic)` |
| D | same as C | `/callee` | success (no `Err` note) |
| E | calls a same-file `fn` | `/caller` | success (no `Err` note) |

The bug-0504 round-1 reviewer's scratch probe on 0.495.0 recorded the same
arm-A signature.

The subagent leg (`#driveSpawnedSubagentCallee`,
`invoke-machinery.ts:495-574`) is outside this report: in production it
settles through `binding.drive()`, so the callee body runs in the spawned
child, which composes the callee through its own registration pass rather
than from the parent's `parseCalleeTheta` input.

## Root cause

Two routes compose a runnable theta input. `composeOneTheta` threads every
output of `checkThetaImports` it needs (`imports`, `importedTypeDecls`,
`patchedSystemTemplate`). `parseCalleeTheta` reads the same pass through
`calleeFailsOwnStructuralChecksBody`. Bug 0423 surfaced
`patchedSystemTemplate` from that body and bug 0465 surfaced
`importedTypeDecls`; neither surfaced `imports`. The attached prompt-mode
leg is the only consumer that executes the parent-side callee input's body,
so the omission shows only there.

## Fix direction

In `src/extension/production-composition.ts`:

1. `calleeFailsOwnStructuralChecksBody` returns `importCheck.imports` when
   non-empty, beside `patchedSystemTemplate` and `importedTypeDecls`, on
   both success returns (`:4321-4327` and `:4351-4357`), and
   `calleeFailsOwnStructuralChecksWithTaint` declares it in its return type.
   The memo-HIT arm (`:4397-4410`) returns no `imports`, the same posture it
   takes for `patchedSystemTemplate`. The dispatch gate never hits the memo:
   `parseCallee` builds a fresh registry-snapshot closure per dispatch
   (`:4400-4408`).
2. `parseCalleeTheta` spreads `imports` onto its composition input when
   present, the same spread-when-non-empty shape as `composeOneTheta:2194`,
   so a callee with no `import` stays byte-identical.
3. With step 2 in place, the comment at `:4733-4738` ("mirroring how
   `imports`/`patchedSystemTemplate` are threaded here") is true as
   written.

No second import pass, no new diagnostic code, no spec edit.

Witness: through the shipped composition root, a prompt→prompt invoke of a
callee that (a) calls an imported `fn`, (b) evaluates an imported `enum`
variant, and (c) constructs an imported `schema` returns the callee's
value. Each cell is RED at 12f1ccfd with the arm-A / arm-C signatures above.
Controls: the same callee dispatched directly, and a callee with a same-file
`fn`, stay green.

## Related

- [0504](./0504-thetalib-invoke-resolves-caller-relative.md) — parent fix;
  this report is its residual 1.
- [0465](./0465-imported-annotation-vacuous-typed-query-validation.md) —
  threaded `importedTypeDecls` onto the `parseCalleeTheta` input. Its fix
  record says the spread mirrors `imports`, which that input does not carry.
- [0423](./0423-imported-schema-bare-render-theta-side-names.md) —
  threaded `patchedSystemTemplate` through the same structural-check read.
- [0322](./0322-unknown-tool-cause-no-producer.md) — introduced
  `buildCodeToolUnknownTool` as a harness-only safety net; this route
  reaches it for a registered theta.

## Fix (unreleased - commit/push only)

The invoked-callee composition route now retains the callee's materialised
runtime imports. No new package release is published. The existing package
version, 0.497.0, does not contain this fix; it identifies the pre-fix checkout,
not a resolving release. Commit/push and any later publication are outside this
record. No resolving SHA is invented.

The sections above preserve the filing-era evidence and positions. The current
regression evidence uses base HEAD
`61d4faecde2a63a0f473d08e0b7471775e3edeb4` plus the scoped worktree patch.

### Cause and actual change

`calleeFailsOwnStructuralChecksBody`
(`src/extension/production-composition.ts`) already runs `checkThetaImports`
with `claimDelivery: false`. That flag controls diagnostic delivery accounting,
not runtime materialisation. Both successful structural-result branches dropped
the computed `imports`, while retaining patched system and imported type data.
`parseCalleeTheta` therefore handed the attached prompt body an input without
runtime bindings. `bindPromptConversation`
(`src/extension/production-theta-producer.ts`) consumes `theta.imports`; the
missing channel explains the unresolved function and enum symptoms.

The patch changes only `src/extension/production-composition.ts`:

- Both structural-result types expose optional runtime imports, and both
  ordinary return branches forward the existing complete list when nonempty.
- `parseCalleeTheta` attaches that list to the callee input, matching direct
  slash composition. It does not repeat import resolution, reconstruct partial
  records, substitute caller scope, or merge caller imports.
- The verdict-memo comment names the omitted materialisation channels. Memo
  contents/keys and the fresh dispatch registry snapshot remain unchanged.
  Repeated dispatch tests complete both iterations after the fix.

No-import inputs still omit the `imports` key. Import-error refusal, diagnostic
accounting, type/system channels, tools, containment, callable hashes,
cancellation and panic handling remain unchanged. No specification edit is
needed: [Imports](../spec_topics/imports.md), identifier-resolution arm 3 in
[Expressions](../spec_topics/expressions.md#identifier-resolution), and the
prompt-to-prompt attachment rule in [Invocation](../spec_topics/invocation.md)
already preserve the callee's own file scope.

### Preserved red and post-fix green evidence

Run artifacts are retained outside the disposable worktree at:

```text
/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0505-1f86a237-4276-4ae7-8850-054cf10fb382
```

`RUN` below is that exact absolute path. Each command runs from the dedicated
bugfix worktree. The immutable `witnesses.json` supplies exact argv and specific
assertion-failure signatures; original captures are not overwritten.

| Command | Pre-fix exit / evidence | Post-fix exit / evidence |
|---|---|---|
| `env TMPDIR="$RUN" npx vitest run tests/b0505-invoked-prompt-imports-production.test.ts` | 1; `red-0.json`, original `reproduce-a1-composition-final-red.log`: 2 failures, 6 controls pass | 0; `green-1-0.json`, `implement-a1-composition-green.log`: all 8 pass |
| `env TMPDIR="$RUN" npx vitest run --config config/vitest/vitest.live.config.ts tests/live/acceptance/b0505live-invoked-prompt-imports.test.ts` | 1; `red-1.json`, original `reproduce-a1-live-final-red.log`: 2 failures, 6 controls pass | 0; `green-1-1.json`, repeated `gate-1-initial-2.json`, `implement-a1-live-green.log`: all 8 pass |
| `env TMPDIR="$RUN" npx vitest run tests/b0505-callee-import-carriage-unit.test.ts tests/b0505-import-runtime-isolation.test.ts` | 1; `red-2.json`, `diagnose-a1-unit-final-red.log`: 6 carriage failures, 9 controls pass | 0; `green-1-2.json`, `implement-a1-unit-green.log`: all 15 pass |

The production witness first checks clean registration, then requires no settled
failure note. Before the fix, the invoked function produces `unknown_tool` and
the enum produces a callee panic. The real-host witness first completes a healthy
OpenAI `gpt-6.1-sol` caller turn, then fails the specific no-system-note assertion
for both invokes. The live function's detailed cause is Result interpolation of
the unresolved call's error; the enum's is `null member access: .Red`. The live
function red is not claimed as the offline `unknown_tool` text. Provider errors
and earlier invalid fixtures are not accepted bug evidence.

After the fix, full real-host JSONL captures show no outer `theta_result`, no
failure note, exit 0, empty stderr, exact theta-computed user-text sequences and
all 16 expected nonempty assistant turns stopped normally. Each invoked cell
contains caller preflight, child query with computed 777, then caller query with
returned 777. This proves more than `prompt()` resolving or a model answering
arithmetic. The frozen harness uses repository Pi 1.3.0; the independent fix
review additionally passes all eight cells on the operator's Pi 1.4.0 in
`audit-fix-operator-host.log` without replacing the frozen witness.

Controls retain the same callee dispatched directly, same-file functions,
no-import key absence, full fn/enum/schema metadata with/without tools, both
repeated dispatches, and explicit omitted-import runtime behavior. The simple
schema constructor/field read was already green before the fix: the unresolved
constructor fallback preserves its field object. It remains a compatibility
control, not a fabricated third runtime red; the schema metadata seam did fail
before the fix and now passes.

### Gates and review

All listed passing commands exit 0; complete logs remain in RUN:

- `npm run typecheck`: `implement-a1-typecheck.log` and independent
  `gate-1-initial-0.json`.
- `npm run lint`: `implement-a1-lint.log`.
- `env TMPDIR=/tmp/pi-theta-b0505-gate-3aNX7z npm test`: all 768 files /
  13,181 tests pass in `implement-a2-default-isolated.log`, including 67
  committed-fixture parse tests and all 20 peer-version/model tests. The parent
  repeats `npm test` successfully in `gate-1-initial-1.json` with the same totals.
- Adjacent offline checks: 16 files / 199 tests pass in
  `implement-a1-adjacent-offline.log`; adjacent live attachment/0506 checks:
  2 files / 23 tests pass in `implement-a1-adjacent-live.log`. Exact file argv
  appear in those logs and the archived implementation command ledger.
- Independent fix audit: all 23 offline regression tests pass in
  `audit-fix-offline.log`; `reviews.md` records **CLEAN — no actionable in-scope
  must-fix findings**. The earlier `evidence-review.md` independently accepts
  the pre-fix evidence/design, not shipment.

The initial full default command with `TMPDIR=RUN` exits 1 in
`implement-a1-default.log`: four unchanged peer-version fixtures see an ancestor
installed peer instead of their required fallback/absence. That failed gate is
preserved, not waived. Controller-recorded Astra authority in
`decision-authorizations.md` permits only a fresh isolated transient TMPDIR for
the complete default rerun, without test/source/spec changes or exclusions.
The authorized rerun actually passes. The peer tests remain sensitive to
TMPDIR ancestry; this is not repaired or hidden by the import-carriage patch.

### Boundaries and residuals

The deterministic production witness doubles the outer host; the separate H9a
witness supplies the real CLI/registration/provider boundary. Bug 0505's
prompt-to-prompt route does not spawn a theta subagent child. Adjacent 0506
coverage exercises real subagents, not a new claim about this bug's topology.
No exhaustive alias/re-export, hot-reload, schema-branding or wire-corner
coverage is claimed. No new residual correctness bug is established. Related
0507 provenance and 0518 imported-schema static typing remain outside this fix;
their status is not changed here. Earlier report sections remain historical.
No quality loop, commit, staging, push, tag, version bump or publication occurs
in this closure stage.

## Provenance

- Established contract: `docs/spec_topics/imports.md` (top-level imports and
  declaring-library scope), `docs/spec_topics/expressions.md` (identifier
  resolution), `docs/spec_topics/invocation.md` (attached prompt callee).
- Actual patch: `calleeFailsOwnStructuralChecksBody`,
  `calleeFailsOwnStructuralChecksWithTaint`, `parseCalleeTheta`
  (`src/extension/production-composition.ts`); runtime consumer:
  `bindPromptConversation` (`src/extension/production-theta-producer.ts`).
- Regression sources: `tests/b0505-callee-import-carriage-unit.test.ts`,
  `tests/b0505-import-runtime-isolation.test.ts`,
  `tests/b0505-invoked-prompt-imports-production.test.ts`,
  `tests/helpers/b0505-prompt-import-fixtures.ts`,
  `tests/live/acceptance/b0505live-invoked-prompt-imports.test.ts`.
- RUN contains `reproduce.md`, `diagnose.md`, immutable `plan.md` and
  `spec-proposal.md`, `implement.md`, preserved `history/`, scoped authorization,
  controller red/green/gate captures, `evidence-review.md`, `reviews.md`, and
  `close.md` with the closure command ledger, preservation checks and limits.
