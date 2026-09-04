# Bug 0452 — The bug-0422 route (c) system-render-fail note ships a `details: { diagnostics: [d] }` payload whose (selector, content) pair matches NO per-variant matrix row: its content is unpinned prose ("'system:' interpolation for '<name>' failed to render (<code>); refusing to spawn…"), not the serialised line the diagnostics-batch row mandates, and its diagnostic is `theta/parse/interpolated-result` — the one parse-namespaced code the panic row claims — routed as a non-panic operator-facing note, a combination no partition sentence sanctions

- **Status:** open.
- **Sev/Diff estimate:** S5/D2 — S5: doc/registry inconsistency, crisp and
  consumer-relevant: the matrix header declares the pairings normative and
  0434's fix re-established (two versions before this note landed) that
  every conformant note class selects exactly one row; a matrix-driven
  checker rejects this note on every row. D2: adjudication — either the
  content moves to the serialised line(s) (behavioural, selects the
  generalised batch row), or a spec sentence pins the note (a row, or
  membership in an informational-style carve-out it cannot take since it
  carries `details`); the parse-namespaced-code-as-note routing also needs
  a partition sentence either way.
- **Kind:** spec gap — the emission is deliberate (bug 0422's fix record
  prescribes it) but the channel page was not reconciled; the shipped
  bytes are sanctioned by no normative pairing.
- **Related:**
  - 0434 (fixed 0.433.0) — closed the 21-class rowless family by
    generalising the diagnostics-batch row's selector; this note landed in
    v0.435.0 (fix 0422), two versions later, and re-opens the class from a
    direction the 0434 witness cannot see (its coverage test is driven by
    the `theta/runtime/*` registry rows; this diagnostic is
    `theta/parse/*`).
  - 0422 (fixed 0.435.0) — introduced the note (§Fix route (c)); its spec
    edits touched `code-registry-load.md`, `docs/reference/diagnostics.md`
    and the frontmatter page — not `runtime-event-channel.md`.
  - 0404 (fixed 0.414.0) — established the (selector, content) pairing
    discipline this note fails on both halves.
  - 0398 (fixed 0.391.0) — the group-B bullet's "registered
    `theta/runtime/*` diagnostics routed as operator-facing notes" class;
    this note is its parse-namespaced sibling, which the bullet does not
    admit.
- **Affected** (verified at `401a425b`, v0.437.0):
  - `src/extension/production-theta-producer.ts:2338–2362` — the spawn-site
    `!ok` render arm: `sendSystemNote({ content: "'system:' interpolation
    for '${theta.slashName}' failed to render (${rendered.diagnostic.code});
    refusing to spawn rather than silently drop the system prompt",
    display: true, details: { diagnostics: [rendered.diagnostic] } },
    renderFailChannel)` (content at `:2351`).
  - `src/render/query-render.ts:430–441` — the only `!ok` arm
    `stringifyInterpolatedValue` returns: `code:
    "theta/parse/interpolated-result"`, `message: "Result value cannot be
    interpolated; unwrap with ? or match first"` (location-less).
  - `docs/spec_topics/pi-integration-contract/runtime-event-channel.md:32`
    — diagnostics-batch row: selector "parse / load / type batch, or a
    registered operator-facing `theta/runtime/*` diagnostic routed as a
    note rather than a top-level panic"; content cell "serialised
    `<file>:<line>:<col>: <code>: <message>` line(s) … — non-empty". `:33`
    — panic row: selector names "the one parse-namespaced exception"
    (`theta/parse/interpolated-result`) but requires "routed as a
    top-level panic" and the `aborted:` framing. `:34` — BNDR-9 row
    (content pinned to the custom-type-unsafe template). `:43` — the
    informational clause covers only no-`details` notes. `:63` — the
    group-B bullet admits registered `theta/runtime/*` diagnostics routed
    as operator-facing notes, "specifically the BNDR-9 … rejection";
    nothing admits a `theta/parse/*` diagnostic routed as a non-panic
    note.
  - `tests/b0422-imported-schema-field-invisibility-load-refusal.test.ts:326`
    — the committed route (c) witness (asserts note presence + `/system/i`
    content; pins neither `details` nor a matrix pairing).
- **Observed at:** v0.437.0 (`401a425b`), offline, deterministic. Probe P4
  (scratch `tests/scratch-route-c-bytes.test.ts`, deleted): the b0422
  route (c) cell re-driven with a full-message capture.

## Summary

Bug 0422's route (c) added an operator-visible note at the subagent spawn
site for a failing `system:` render. The shipped bytes (P4, verbatim):

```json
{
  "customType": "theta-system-note",
  "content": "'system:' interpolation for 'app' failed to render (theta/parse/interpolated-result); refusing to spawn rather than silently drop the system prompt",
  "display": true,
  "details": { "diagnostics": [ { "severity": "error",
    "code": "theta/parse/interpolated-result",
    "message": "Result value cannot be interpolated; unwrap with ? or match first" } ] }
}
```

Under the matrix's (selector, content) pairing — the uniqueness mechanism
0434's fix ratified — this note selects nothing:

- Row `:32` (diagnostics batch): the selector's first branch ("parse /
  load / type batch") label-ADMITS the single-element parse batch — the
  DECISIVE failing cell is content: the cell mandates the serialised
  line(s), and the location-less serialised form (`diagnostic-shape.md:63`)
  here would be
  `theta/parse/interpolated-result: Result value cannot be interpolated;
  unwrap with ? or match first` — the shipped content is custom prose that
  embeds the code in parentheses instead. Content cell FAILS.
- Row `:33` (panic): the selector names this exact code as the one
  parse-namespaced exception, but requires top-level-panic routing and the
  `"theta /<name> aborted: <message>"` framing; this note is an
  operator-facing pre-spawn refusal with neither. Both halves FAIL.
- Row `:34` (BNDR-9): content is the custom-type-unsafe template. FAILS.
- The `:43` informational clause requires `details` absent; this note
  carries `details`. Not a member.

The partition prose is equally silent: the group-B bullet admits
`theta/runtime/*` diagnostics routed as operator-facing notes (BNDR-9),
and separately claims `theta/parse/interpolated-result` for the
panic-framing route; a `theta/parse/*` diagnostic routed as a NON-panic
operator-facing note exists in no sentence. No spec file contains the
note's content template (`rg "refusing to spawn" docs/` is empty).

## Reproduction

Offline (probe P4, deleted; ~90 lines, the b0422 route (c) cell with a
full-payload recorder):

1. Parse the b0422 fixture theta (`mode: subagent`, `system: 'Hi
   ${author}'`, `params: author: Author`, importing `Author` from a
   `.thetalib`).
2. `createProductionProducerDeps({ pi: <recording sendMessage>, root:
   <clock/idSource double>, modelRegistry: {}, subagentSpawn: <fake>,
   subagentExecutableHost: fakeExecutableHost(), … })`.
3. `deps.spawnSubagentConversation({ theta, args: "", ctx, thetaAbort,
   paramBindings: new Map([["author", makeOk(1)]]) })` — the bound
   `Result` fails the value-driven render.
4. Captured wire bytes as quoted above; attempt to select a matrix row:
   every row fails on selector, content, or both (walk in §Summary).

## Expected behaviour

The matrix header (`:28` "Per-variant `display` / `content` pairings
(normative)") plus the 0434-fixed premise: every conformant note class on
the channel is selected by exactly one row via its (selector, content)
pair. A deliberately-added operator-facing note either carries a row's
content (the serialised diagnostic line, which the generalised row `:32`
already pairs with a diagnostics-batch payload) or gets its own normative
sanction in the same edit (DIAG-2 discipline: the spec sentence lands
first or same-commit).

## Actual behaviour / root cause

Bug 0422's parent adjudication scoped route (c) as an emission + refusal
("emits a `theta-system-note` naming the failed `system:` slot and refuses
the spawn"); the note's channel-page reconciliation was in no one's lane.
The content template was invented at the site, and the diagnostic reused
(`rendered.diagnostic`) is parse-namespaced, so the 0434 witness
(registry-driven over `theta/runtime/*` rows) structurally cannot flag the
new rowless class.

## Why it matters

- A matrix-driven conformance checker or renderer — the consumer the page
  builds, and the premise of the 0401/0404/0432/0434 ladder — finds no row
  for a shipped, committed-witnessed note class; the page's normative
  coverage claim is false again two versions after 0434 restored it.
- The precedent is the hazard: 0422 demonstrates that any fix adding an
  operator-facing note with ad-hoc content re-opens the class invisibly,
  because the only coverage gate enumerates runtime-registry rows.
- The `theta/parse/interpolated-result`-as-note routing muddies the one
  parse-namespaced exception's story: the panic row says that code is
  panic-framed; a consumer keying panic detection on it now gets a
  non-panic hit.

## Non-goals

- Route (c)'s refusal semantics and the `InvokeInfraCauseError` carrier
  (`:2357–2360`) — conformant per 0422's adjudication; only the note's
  pairing is at issue.
- Route (a)'s load refusal and the `theta/load/system-interp-bad-field`
  registry row (0422, closed).
- The delivery mechanics (the site correctly routes through
  `sendSystemNote` over the extension-instance channel — 0437-conformant).
- The 0434-generalised row's selector wording for the 21 runtime classes
  (settled).

## Fix

Options:

1. Pin the content to the serialised diagnostic line(s):
   `content: renderDiagnosticBatch([rendered.diagnostic])` (the group-B
   funnel form). The note then selects row `:32` under the settled
   pairing with zero spec edits — but loses the "refusing to spawn"
   operator hint unless it moves into the diagnostic's `hint` field
   (which `renderDiagnosticLine` renders). Smallest spec surface;
   behavioural change to `content` bytes only.
2. Spec-side sanction: add the note to the channel page — either widen row
   `:32`'s selector/content to admit "a load/parse-phase diagnostic routed
   as an operator-facing refusal note" with a content alternative, or add
   a sibling row for the spawn-refusal note with its verbatim template
   (b0265 constraint: the new line must not contain `runtime panic
   (single-element batch`). Keeps shipped bytes; grows the matrix by an
   emission-site-specific row.
3. Re-shape as the panic route the code already claims: frame it
   `theta /<name> aborted: <message>` via `emitPanicNote` and let the spawn
   refusal ride the existing internal-error surface. Heaviest; changes
   user-visible framing and double-frames with the `invoke_infra` cascade
   the thrown `InvokeInfraCauseError` produces.

Whichever lands, extend the b0434-style coverage witness to enumerate
NOTE-EMISSION SITES (or at least assert this note class selects exactly
one row) so the next site-invented content reds. Recommendation: option 1
+ the witness extension.

## Provenance

Seed 4 of the wave-6 brief (matrix-pairing sweep over fresh emission
sites) → `rg "sendSystemNote\(" production-theta-producer.ts` triage → the
`:2349` site's content flagged as non-serialised. Spec read:
`runtime-event-channel.md:28–43,63`. Implementation read:
`production-theta-producer.ts:2300–2365`,
`system-interpolation.ts:550–585`, `query-render.ts:380–445`. Probe P4 run
at `401a425b` (scratch deleted; bytes quoted). Dup check: README index;
0422 (fix record §What shipped — no channel-page edit), 0434 (witness
scope), 0404/0398/0401 read in full; the b0422 witness pins presence, not
pairing.
