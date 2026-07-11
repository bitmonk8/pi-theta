# Session-semantics hardening — THE BINDER (typed-param extraction) + SLSH-1

Lens: the LLM binder that maps free-form slash arguments onto typed `params:`
(`docs/spec_topics/binder.md` + `binder/*`, `docs/reference/frontmatter.md`,
`docs/reference/discovery-cli.md` §Slash-command invocation / SLSH-1).

Driven through the SHIPPED extension against the LIVE model with
`tests/hardening/probe-harness.ts`; probes in
`tests/hardening/session-binder.test.ts`
(`npx vitest run --config vitest.hardening.config.ts tests/hardening/session-binder.test.ts`).

Observation channels: `turn.userTexts` (the loom body's computed query — the
body's `${param}` echo reveals what the binder extracted; the binder now runs
OFF-session and contributes NO user turn, so a bound single-query body shows
exactly ONE user turn), `turn.systemNotes` (SLSH-1 overflow + the bind_echo
success note + binder failure notes), `turn.assistantText` (asserted EMPTY of
any leaked envelope on a non-binding arm — BND-3 FIXED), `probe.registeredNames`,
`probe.diagnostics`.

Because the binder is model-driven, only CLEAR mis-binding is reported (wrong
value / crash / dropped param / wrong default); a defensible model
interpretation is not a finding.

**Dedupe.** BND-1 (success echo never emitted) and BND-3 (failure-envelope leak)
are now FIXED (Phase 1 production-conformance) in `cli-findings/binder.md`;
BND-2 (defaulted param → null) is FIXED. The confirmations below record the
fixed live-probe state. The finding below (BIND-1) is a distinct,
previously-unreported defect (also FIXED).

---

## FINDING BIND-1 (FIXED): a NamedType param (body-level `enum` or `schema`) mis-classifies the loom as no-params — the binder is skipped, the param arrives null, and a false SLSH-1 "this loom takes no parameters" note fires

> **STATUS: FIXED.** Root cause was the runtime `params:` lowering pass
> (`extractParsedParams` in `src/parser/frontmatter.ts`) calling
> `parseParams(fieldInputs, [], …)` with an EMPTY body-type list, so a
> `NamedType` param left `params.loweredSchema` `undefined` and the runBinder
> guard mis-routed to the no-params branch. Fix plumbs the real lowered
> body-level `schema`/`enum`/import fragments (via a new
> `src/parser/body-type-lowering.ts` shared helper + `collectBodyTypes` in
> `src/parser/loom-document.ts`, threaded through `FrontmatterBodyTypes.lowered`)
> into BOTH `parseParams` call sites. A body `enum` lowers to
> `{ type: "string", enum: [<wire values>] }`; a body `schema` to its object
> body; imports to a permissive `{}`.
>
> **Before (buggy)** `/triage the login page crashes on submit, high severity`
> → `turn.userTexts.length === 1` (no binder turn), body `TRI s=null`,
> `systemNotes == ["loom /triage: ignoring extra arguments — this loom takes no
> parameters"]`. Schema `/shape …` → same false no-params note.
>
> **After (fixed, live probe)** — updated for the OFF-session binder (Phase 1):
> the binder no longer drives a user-visible prompt turn, so a bound
> single-query body shows `turn.userTexts.length === 1` (the body turn only),
> and the loom sets `looms.binderModel` so it resolves a binder model. `/triage
> …` → `userTexts.length === 1`, body `TRI s=High`, `systemNotes ==
> ["Running /triage: sev=High"]` (the bind_echo success note). Schema `/shape
> …` → registers clean, `userTexts.length === 1`, `systemNotes ==
> ["Running /shape: p={hello, …}"]`. Mixed `sev: Severity, note: string | null`
> → `TRI2 s=High n=the login page crashes on submit` (both bound, neither
> null), `userTexts.length === 1`. No false SLSH-1 note in any case. Regression
> cases (primitive multi-param,
> string/boolean defaults, single-string bypass, `array<string>`,
> `string | null`, no-params SLSH-1 control, key=value) unchanged. Verified by
> `tests/hardening/session-binder.test.ts` (10/10 live probes green) and the
> full `npm test` suite (1599/1599).

- **repro** (enum manifestation):
  ```loom
  ---
  description: t
  mode: prompt
  params:
    sev: Severity
  ---
  enum Severity { Low, High }
  @`Reply with exactly: OK. TRI s=${sev}`
  ```
  Invocation: `/triage the login page crashes on submit, high severity`.

  Schema manifestation (identical outcome):
  ```loom
  ---
  description: s
  mode: prompt
  params:
    p: P
  ---
  schema P { a: string }
  @`Reply with exactly: OK. SHAPERAN`
  ```
  Invocation: `/shape make a equal to hello`.

- **expected.** A loom that declares a non-empty `params:` block is NOT a
  no-params loom, so the binder must run and the SLSH-1 overflow note must NOT
  fire. NamedType params are a spec-supported surface:
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md#bypass-cases` case 1:
    "**No-params bypass.** When `params:` is absent or `params: {}`, the loom
    takes no parameters and the binder does not run." (A `params:` block with a
    field is, by contradistinction, a genuine binder pass — "All other shapes …
    go through the binder.")
  - The same file's *Type display* table lists `Severity` (enum) and `Author`
    (named schema) as valid declared param types that render in the binder
    prompt, and the *Binder system prompt* example binds `author: Author`.
  - `docs/reference/frontmatter.md` §`params:` Type side: "A `NamedType`
    resolves against the file's body-level `schema`/`enum` declarations … .
    Resolution is whole-file — a frontmatter → body forward reference resolves."
  - `docs/reference/discovery-cli.md` **SLSH-1**: the overflow note is only for
    "a no-params loom".

  Expected observable for `/triage …`: a binder-prompt turn is issued, `sev`
  binds to `High` (or `Low`), the body renders `TRI s=High`, and no SLSH-1 note
  appears.

- **observed** (deterministic channels):
  - `probe.registeredNames` contains `triage` / `shape`; `probe.diagnostics` is
    empty — the loom registers with NO load warning or error.
  - `turn.userTexts.length === 1` for the enum loom (only the body turn; NO
    binder-prompt turn was ever issued) and `=== 0` for the schema loom (the
    body deref of the unbound param produced no turn).
  - Enum body (`turn.userTexts`): `Reply with exactly: OK. TRI s=null` — the
    enum param arrived as `null` in body scope.
  - `turn.systemNotes` for BOTH looms:
    `["loom /triage: ignoring extra arguments — this loom takes no parameters"]`
    / `["loom /shape: ignoring extra arguments — this loom takes no parameters"]`
    — the SLSH-1 no-params overflow note fires even though the loom declares a
    param.

  Isolation confirms the trigger is the NamedType reference, not the field
  count: `params: { city: string, days: integer }` (all primitive) runs the
  binder normally (2 user turns, `C=Paris D=3`); `params: { tags: array<string> }`
  runs the binder (`t=["red","green","blue"]`); `params: { note: string | null }`
  runs the binder (`ANN n=…`). Only a NamedType field (`enum`/`schema`) triggers
  the mis-classification — and a single NamedType field poisons the whole
  `params` block (the mixed `sev: Severity, note: string | null` loom drops
  BOTH params to null).

- **verdict: bug.** Root cause is visible in the shipped guard
  `src/extension/production-loom-producer.ts` `runBinder`:
  `if (params === undefined || params.loweredSchema === undefined) { …no-params
  branch… }`. A NamedType param leaves `params.loweredSchema` `undefined` (the
  params lowering does not produce a schema when a field references a body-level
  `enum`/`schema`), so the runtime takes the no-params branch: it emits the
  SLSH-1 overflow note and returns `{ bound: true, args: {} }`, the binder never
  runs, and the declared param reaches the body as `null`. This is a clear
  spec violation on a documented param-type surface (enum / named-schema
  params), it is silent (no load diagnostic), and it also emits a misleading
  "this loom takes no parameters" note contradicting the loom's own frontmatter.

---

## Confirmations of KNOWN / deferred state (not re-reported)

- **BND-1 (success echo) — FIXED (live probe).** With `looms.binderModel` set
  (`anthropic/claude-haiku-4-5`), the `greet` loom (`bind_echo: true`) now emits
  `Running /greet: topic=cats, tone=neutral (default), verbose=false (default)`
  and `forecast` emits `Running /forecast: city=Paris, days=3` on
  `turn.systemNotes`. A `bind_echo: false` loom (`/geo`) emits no echo note.
  Before: `turn.systemNotes` was `[]` in every success case. Matches the FIXED
  `cli-findings/binder.md` BND-1.

- **BND-3 (failure envelope leak) — FIXED (live probe).** The `register` loom
  (`params: { name: string, age: integer }`) invoked as `/register` (no bindable
  args) does NOT run its body (correct) and no longer leaks the envelope:
  `turn.assistantText` is empty and `turn.systemNotes` carries
  `loom /register: argument binding needs more info — Missing required
  parameters: name (string), age (integer)`. Before: the raw
  `{"kind":"needs_info",…}` envelope leaked as `assistantText` and `systemNotes`
  was `[]`. Also note the binder now runs OFF-session, so a bound loom shows
  ONE user turn (the body), not the pre-fix two (binder-prompt + body). Matches
  the FIXED `cli-findings/binder.md` BND-3.

---

## Verified-conformant (bounds the search — these behave per spec)

- **Multi-param extraction + integer coercion.**
  `params: { city: string, days: integer }`.
  `/forecast weather in Paris for three days` → body `FCAST C=Paris D=3`
  (word "three" coerced to integer `3`);
  `/forecast weather in Paris for 3 days` → `FCAST C=Paris D=3`. Both params
  extracted to the correct slots and the integer typed correctly.

- **Defaulting for STRING and BOOLEAN defaults (extends BND-2 fix).**
  `params: { topic: string, tone: string = "neutral", verbose: boolean = false }`,
  `/greet cats` → body `GREET t=cats tone=neutral v=false`. The binder omits the
  unsupplied defaulted fields; the runtime fills the string default `"neutral"`
  and the boolean default `false` before the body runs
  (`defaulting-system-note-echo.md#defaulting` fill-if-absent). Confirms the
  BND-2 fix covers string and boolean defaults, not only integer.

- **Required param unsatisfiable → body does not run.** `/register` with no
  bindable args does not execute the loom body (binding-failure path halts
  execution; the leak of the envelope is the separate known BND-3).

- **Single-string bypass.** `params: { q: string }` (one defaultless string):
  `/search foo bar baz qux` → body `BYPASS q=foo bar baz qux` (whole trimmed
  slash-argument string bound verbatim, no binder LLM turn), and
  `turn.systemNotes === []` (echo auto-suppressed). Matches
  `binder-bypass-and-envelope.md#bypass-cases` case 2.

- **`array<string>` param.** `params: { tags: array<string> }`, `/arr red green
  blue` → body `t=["red","green","blue"]` (binder runs, structural type lowers).

- **Nullable/optional param.** `params: { note: string | null }`, `/annotate add
  a note about the crash` → binder runs (2 user turns), body `ANN n=add a note
  about the crash`. Nullable-of-primitive lowers correctly (contrast BIND-1:
  only NamedType references break).

- **SLSH-1 no-params overflow (positive control).** A `params:`-less loom
  invoked with trailing text emits exactly
  `loom /nop: ignoring extra arguments — this loom takes no parameters` on
  `turn.systemNotes` and still runs the body. This is the legitimate SLSH-1
  path; BIND-1's defect is that a *params-declaring* loom wrongly reaches it.

- **key=value syntax (§Slash-command invocation: "not part of the loom 1.0
  surface").** `params: { city: string, country: string }`,
  `/geo city=Paris country=France` → body `GEO c=Paris co=France`. The binder
  defensibly parses the `k=v` tokens into the right slots rather than binding the
  literal `city=Paris` string; no crash, no mis-slotting. Verified-conformant
  (defensible model interpretation — not a finding).
