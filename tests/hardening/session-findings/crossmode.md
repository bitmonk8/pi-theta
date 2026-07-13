# Session findings — CROSS-MODE INVOKE value passing

Lens: what value crosses an `invoke` boundary across the 4-cell caller×callee
matrix, plus the two invoke-failure envelopes (`InvokeCalleeError`,
`InvokeInfraError`), typed/untyped return, and object/array/enum survival.

Harness: `tests/hardening/session-crossmode.test.ts` (shipped extension, live
model). All child looms make ZERO model turns (literal tails / empty-template
short-circuit); the only live turn per probe is the top prompt loom's final `@`
query, observed via the deterministic `userTexts` channel.

    npx vitest run --config vitest.hardening.config.ts tests/hardening/session-crossmode.test.ts

Dedupe: INV-1..9 (`findings/invoke-crossmode-ceilings.md`) and INVCEIL-1/2/3
(`cli-findings/invoke-ceilings.md`) are prior findings and are NOT re-reported.
INVCEIL-2 (callee **panic** not wrapped) is distinct from XMODE-1 below (callee
**Err** not wrapped).

Bug-verdict count: **1** (XMODE-1). Plus one borderline (XMODE-2) and one
accepted-cut / not-realizable decision (XMODE-3).

---

## XMODE-1 — a callee that returns `Err` is not wrapped as `InvokeCalleeError`; the raw child `QueryError` propagates, and `e.inner` / `e.callee_path` access panics uncatchably — **FIXED**

> **STATUS: FIXED.** `runInvokeEffect` (`src/runtime/effectful-statement-host.ts`,
> `case "value"` branch) now wraps a callee-returned `Err` as
> `InvokeCalleeError` via the previously-unused
> `surfaceLoomCallableCalleeFailure(child.calleePath, inner, message)`
> (`src/runtime/tool-call.ts`). Only `invoke_infra` (trampoline-produced panic /
> internal_error / return_validation) and `cancelled` pass through unwrapped;
> every other callee `QueryError` — including a deeper hop's `invoke_callee` —
> is wrapped (each hop adds one wrapper, SLSH-5 chain). Applies to both untyped
> and typed invoke; the INVCEIL-3 `Ok`→`Ok(null)` behaviour is unchanged.
>
> **Before → after** (live probe, deterministic `userTexts`):
> - `/ek`  → was `K=K-validation`; now `K=K-callee` (`e.kind == "invoke_callee"`).
> - `/ekp` → was `KP=K-validation`; now `KP=K-callee` (prompt-mode callee).
> - `/ei`  → was `userTexts == []` (uncatchable panic on `e.inner.kind`); now
>   `I=INNER` (`e.inner.kind == "validation"` reads the callee's original error).
>
> Verified: `npm run typecheck` / `npm run lint` clean; `npm test` 1599 green;
> `session-crossmode.test.ts` 11 green against the live model.

- **repro:**
  ```
  # errchild.loom   (subagent — also tested identically as prompt)
  ---
  mode: subagent
  ---
  let _ = @` `?        // empty-template -> Err(ValidationError, cause=empty_template)
  1
  ```
  ```
  # ek.loom
  ---
  mode: prompt
  ---
  let r = match invoke("./errchild.loom") {
    Ok(_) => "NOERR",
    Err(e) => match e.kind {
      "invoke_callee" => "K-callee",
      "validation"    => "K-validation",
      _               => "K-other"
    }
  }
  @`K=${r}`
  ```
  Invocation: `/ek`. Corollary loom `ei.loom` replaces the inner arm with
  `Err(e) => match e.inner.kind { "validation" => "INNER", _ => "OTHER" }`.
  Companion `ekp.loom` invokes a **prompt**-mode `errpr.loom` with the same body.

- **expected:** `errors-and-results.md` §`InvokeCalleeError` — "Wraps an `Err` the
  callee itself returned; `inner: QueryError` is the callee's original failure",
  with `kind: "invoke_callee"`, `callee_path`, and `inner`. `invocation.md`
  §Failures repeats it ("`InvokeCalleeError` wraps an `Err` the callee itself
  returned; `inner: QueryError` is the callee's original failure") and
  §Final-value-propagation: on callee `Err` "the caller observes only the
  `InvokeCalleeError` (callee returned `Err`) … envelope". So the parent must see
  `e.kind == "invoke_callee"` and be able to read `e.inner.kind == "validation"`
  and `e.callee_path`. SLSH-5/SNK-i chain rendering (`discovery-cli.md`) also
  depends on the `invoke_callee` hop existing.

- **observed** (deterministic `userTexts`):
  - `/ek` → `K=K-validation` (subagent callee). The `Err` arm runs — the failure
    IS a catchable value — but `e.kind` is `"validation"` (the child's own error
    kind), **not** `"invoke_callee"`. No `InvokeCalleeError` wrapper is applied.
  - `/ekp` → `KP=K-validation` (prompt-mode callee). Identical: raw child error
    passes through unwrapped in the prompt→prompt cell too.
  - `/ei` → `userTexts == []`. Because `e` is the raw `ValidationError` (no
    `.inner` field), `e.inner.kind` hits `loom/runtime/missing-object-key` /
    `null-member-access` and **panics**, aborting the parent body before its query
    — the panic is not catchable by the surrounding `match`.

- **verdict: BUG.** The `InvokeCalleeError` envelope documented in two spec
  reference sections is never constructed for a callee `Err`; the callee's own
  `QueryError` crosses the boundary verbatim. Consequences for a parent written to
  the spec: (1) it cannot distinguish "my invoke's callee failed" from "my own
  query failed" — both present `kind: "validation"`; (2) it loses the
  `callee_path` context the envelope carries; (3) any access to `e.inner` or
  `e.callee_path` (the documented fields) **panics and aborts the parent
  uncatchably**, turning spec-conformant error-handling code into a crash. This is
  the `Err`-path analogue of INVCEIL-2 (which fixed the **panic** path →
  `InvokeInfraError{cause:"panic"}`); the `Err` path → `InvokeCalleeError` was
  never wired. Same root class as the campaign's dominant defect: a spec-mandated
  wrapper that is not applied in the shipped invoke boundary.

---

## XMODE-2 — an unsupported backtick-template / `match`-in-`${…}` value expression is silently accepted and evaluates to `null` instead of `loom/parse/unsupported-feature`

- **repro (A) — interpolating template as a `match`-arm value:**
  ```
  # tmatch.loom
  ---
  mode: prompt
  ---
  let r = match Ok(9) {
    Ok(n) => `V${n}`,
    Err(_) => "E"
  }
  let s = r + "!"
  @`C=${s}`
  ```
  Invocation: `/tmatch`.
- **repro (B) — `match` inside `${…}`:**
  ```
  # mdirect.loom
  ---
  mode: prompt
  ---
  @`D=${match Ok(9) { Ok(n) => n, Err(_) => 0 }}`
  ```
  Invocation: `/mdirect`.

- **expected:** `grammar.md` §Expression sublanguage — the supported forms list
  enumerates ``@`...` `` **query** templates as the only backtick form; a bare
  `` `...` `` template is not a value expression. The Not-supported list is
  explicit: "nested template strings inside `${...}`; ``@`...` `` and `match`
  inside `${...}`" → `loom/parse/unsupported-feature`. So both (A) and (B) should
  be rejected at parse with a diagnostic and the loom should not register — the
  way the parser already rejects the same construct elsewhere:
  `let r = \`V${w}\`` correctly emits `let binding 'r' has no initialiser` and
  fails to register, and a non-interpolating `` `STATIC` `` arm also fails to
  register.

- **observed** (deterministic `userTexts` / `diagnostics`):
  - (A) `/tmatch` → `C=null!`. The loom registers and runs; the interpolating
    template arm is accepted, but the `match` value is `null` (`null + "!"` →
    `"null!"`). The arm's computed string is silently dropped. Contrast (all
    conformant): `Ok(n) => n` → `9`; `Ok(_) => "PLAIN"` → `PLAIN`; a plain-string
    arm as a tail value → `TAILVAL`. Only the interpolating-template arm degrades.
  - (B) `/mdirect` → `D=null`, `registeredNames` contains `mdirect`,
    `diagnostics == []`. A construct the grammar lists as `unsupported-feature`
    registers cleanly and evaluates to `null` with no diagnostic on any channel.

- **verdict: borderline.** Not in the invoke value-passing contract per se — the
  root is a general expression/parser gap — but surfaced directly by the natural
  invoke error-handling idiom `match invoke(...) { Err(e) => \`err ${e.kind}\` }`,
  which silently yields `null`. Two related instances of the same shape: an
  unsupported expression form (interpolating backtick template as a value;
  `match`/``@`` inside `${…}`) is silently accepted and degrades to `null` instead
  of the documented `loom/parse/unsupported-feature`. The inconsistency is the
  instructive part — the identical `` `V${w}` `` is a clean parse rejection as a
  `let` initialiser but a silent-null when it lands in a `match` arm. Reported as
  borderline because the value-passing surface itself is unaffected and an author
  hitting it is using an unsupported construct; still a real footgun worth a
  diagnostic.

---

## XMODE-3 — subagent→prompt callee stays on the spawn-fresh path (does NOT attach to the caller subagent's session) — **NOT-REALIZABLE + observably-conformant, NOT a bug**

> **DECISION: keep spawn-fresh; do not force an attach.** The prompt→prompt cell
> was wired to attach to the user session (V15d / `invoke-prompt-suspend.ts`);
> the symmetric subagent→prompt cell was left on `spawnSubagentConversation`
> (the `#driveCallee` else branch). Investigation confirms this is correct:
> attach is **not realizable** at the loom 1.0 Pi-SDK pin, and the difference is
> **unobservable** in every deterministic channel, with the callee final value
> already crossing correctly.

- **spec quote (`invocation.md` §Cross-mode semantics).** The intro: "The
  callee's mode controls whether it gets a fresh conversation or attaches to its
  caller's current conversation. The caller's mode is irrelevant to that decision
  — a subagent's 'current conversation' is already its own private one, so a
  prompt-mode child writing into it stays inside that private context." The cell
  row: "| subagent | prompt | Child attaches to the caller's current
  conversation — which is the caller subagent's own private one. **Nothing leaks
  to the grandparent.** |". The tool-registration clause that pins the *mechanism*
  for this cell: "For the other three cells (any callee in subagent mode, **or a
  subagent caller invoking a prompt-mode child into the subagent's own private
  session**), the child's tools reach the model through `customTools` on the
  spawned `AgentSession` and die with the session; no active-set mutation is
  involved." And §Final-value propagation: "the final value still propagates
  through the same return surface."

- **the seam (`production-loom-producer.ts` `#driveCallee`, ~L1983).** The attach
  branch is guarded by BOTH modes: `if (callerMode === "prompt" &&
  callee.frontmatter.mode === "prompt") { bindPromptConversation +
  runPromptSuspendInvoke }`. A subagent caller (`callerMode === "subagent"`) fails
  the guard and falls to the else branch — `spawnSubagentConversation({ loom:
  callee, … })` — which installs the callee's `tools:` as `customTools` on a
  fresh in-memory `AgentSession`. That is exactly the mechanism the spec's
  tool-registration clause pins for this cell.

- **realizability proof — a prompt callee CANNOT attach to a subagent caller's
  `AgentSession` (two independent grounds).**
  1. *No `ExtensionCommandContext`/`ExtensionAPI` for the spawned session.* The
     prompt-mode query mechanism is hard-tied to the user session: a prompt
     query drives "real user-visible turns into the shared session" via
     `LivePromptQueryModel` → `driveStreamedUserTurn({ pi, ctx, … })` (pi's
     native turn loop), its read surface is `readMessages = () =>
     buildSessionContext(ctx.sessionManager.getEntries(),
     ctx.sessionManager.getLeafId())` (the user session transcript), its
     tool-loop bound is `#promptToolLoopGovernor.ensureRegistered(pi)` (pi's
     native prompt-mode loop), and its callable-set swap is `pi.setActiveTools`
     (the user session's ambient set). `bindPromptConversation` takes no session
     handle — it closes over the caller's user-session `pi`+`ctx`. A subagent
     caller runs in an in-memory `AgentSession` created by
     `spawnSubagentConversation` via `createAgentSession({ … noExtensions:true,
     noSkills:true, … sessionManager: SessionManager.inMemory(ctx.cwd) })`. That
     session has NO `ExtensionCommandContext` and NO loaded loom extension —
     `noExtensions:true` is deliberate (the comment: "it prevents the spawned
     session from re-loading this very loom extension (which would recurse)").
     There is therefore no `pi`+`ctx` bound to the subagent's session for a
     prompt-mode callee to stream into.
  2. *No "caller's current conversation" object to attach to.* A subagent
     caller's body queries resolve through `createSubagentQueryModel` →
     out-of-band `complete()` with query-driver-owned private `messages`
     (`SubagentQueryModel.#messages = [{ role:"user", content: queryText }]`),
     minted FRESH per `@`-query. Unlike the user session (where `readMessages`
     returns the whole accumulated transcript so query N sees turns 1..N-1), the
     subagent caller retains no accumulated conversation across queries. There is
     no transcript artifact for a prompt callee to "attach to" and see.

- **observability.** The attach-vs-spawn distinction has no deterministic
  observable consequence for this cell: (a) the callee's transcript is private
  and discarded in BOTH cases — spec "Nothing leaks to the grandparent"; a fresh
  in-memory `AgentSession` is equally private and invisible to the grandparent as
  a hypothetical attach would be; (b) the callee FINAL VALUE crosses identically
  — `spawnSubagentConversation.surface` and the prompt→prompt attach path both
  call the SAME `surfaceCalleeFinalValue` FN-5 projection. The only aspect attach
  would add — the callee's `@`-queries seeing the caller's prior turns as model
  context — is unreachable (no retained caller transcript, ground 2 above) and
  would in any case only manifest through non-deterministic model behaviour, not
  a deterministic channel. The live probe already confirms the value crosses
  correctly on the spawn path: **`top(prompt) → mid(subagent) → leaf(prompt)`**
  renders `SP=107` (see Verified-conformant below).

- **verdict: NOT-REALIZABLE + observably-conformant — accepted cut, not a bug.**
  Production's spawn-fresh satisfies every *observable* clause of the
  subagent→prompt cell (private context invisible to the grandparent;
  `customTools`-on-spawned-`AgentSession` tool registration; final value crosses
  via the shared FN-5 surface). The literal "attaches to the caller's current
  conversation" wording is a conceptual privacy framing whose only
  realizability-distinct consequence (callee sees caller's prior subagent turns)
  is architecturally unreachable at the loom 1.0 Pi-SDK pin — same shape as the
  binder forced-tool cut ("not realizable against the available provider") and
  the PIC-8 restore-failure cut ("not realizable at the loom 1.0 Pi-SDK pin").
  Forcing an attach would require either (a) loading the loom extension inside
  the spawned `AgentSession` (the exact recursion `noExtensions:true` prevents)
  or (b) retaining a subagent-caller transcript the current per-query ephemeral
  execution model does not build — both out of scope for 1.0 and neither
  producing an observable difference. **Deferral seam:** if a future architecture
  retains subagent-caller transcripts AND exposes a session-bound `pi`+`ctx` for
  a spawned `AgentSession`, the callee-sees-caller-turns aspect could be
  revisited; until then spawn-fresh is the conformant realization.

---

## Verified-conformant (bounds the search)

Confirmed working via deterministic `userTexts` (child looms spend zero tokens):

- **Object + array final value survives the subagent boundary intact.**
  `invoke<Thing>` of a subagent returning `{ name:"widget", count:7, tags:["alpha","beta"] }`
  → parent interpolates `OBJ=widget|7|alpha`. FN-5 propagation of structured
  values is correct across the boundary.
- **Enum final value survives.** `invoke<Wrap>` of a subagent returning
  `{ status: Status.Done }` → parent interpolates `ENUM=Done` (bare wire value, not
  quoted, not aborting).
- **subagent→subagent value flow.** `top(prompt) → mid(subagent) → leaf(subagent)`;
  `leaf` returns `5`, `mid` returns `w + 100`, top renders `SS=105`. Value flows up
  through two subagent boundaries.
- **subagent→prompt value flow.** `top(prompt) → mid(subagent) → leaf(prompt)`;
  `leaf` (prompt, literal tail `7`, spawned fresh into `mid`'s private context
  via the `#driveCallee` else branch — see XMODE-3) returns `7`, `mid` returns
  `107`, top renders `SP=107`. The literal tail makes attach-vs-spawn invisible;
  the final value crosses via the shared `surfaceCalleeFinalValue` either way.
- **Typed-return validation is catchable (INV-6 holds).** `invoke<number>` of a
  subagent returning the string `"a-string"` → catchable
  `Err(InvokeInfraError{kind:"invoke_infra", cause:"return_validation"})`; parent
  `match` resolves `Y=RETVAL`. Not a crash, not a silently-flowed value.
- **Untyped invoke returns `null` (INVCEIL-3 holds).** `let r = invoke("./numchild.loom")?`
  where the child's tail is `42` → `U=null` (child value discarded).
- **Callee `Err` is at least catchable (not a raw host throw).** The `Err` arm of a
  `match invoke(...)` runs when the callee returns `Err` — the failure reaches loom
  code as a value; the defect (XMODE-1) is only the missing wrapper/fields.
- **Plain-string and bare-value `match` arms, and `match` as a `let` initialiser or
  tail expression, all evaluate correctly** (`"PLAIN"` → PLAIN, `n` → 9,
  `"TAILVAL"` tail → TAILVAL) — isolating XMODE-2 to interpolating-template /
  `match`-in-`${…}` forms only.
