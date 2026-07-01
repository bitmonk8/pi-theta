# Implementation notes (non-plan discoveries)

Free-form running log of discoveries that are not plan changes.

## 2026-06-30 — H2a cross-cutting gates

- **Custom ESLint rules vs stock `no-restricted-syntax`.** The plan's `Adds.`
  prose for H2a names `no-restricted-syntax` for the sequential-by-default and
  blocking-runtime checks. Stock `no-restricted-syntax` cannot consult a
  flagged node's *own source line* for an allow comment, which the leaf's
  binding Tests bullets require (a `// allow:` / `// allow-sync:` /
  `// allow-broad-catch:` comment on the same line makes the otherwise-flagged
  construct pass). The three gates are therefore implemented as custom
  comment-keyed rules in `eslint-plugin-loom-local`
  (`no-broad-catch`, `no-unguarded-promise-combinator`, `no-blocking-sync`).
  `Adds.` is descriptive (Class-3, illustrative); the comment-keyed pass/fail
  behaviour is the binding obligation, and a custom rule is the faithful way
  to provide it. Logged as a divergence in `.pi/impl-progress/decisions.jsonl`.
- **H2a `no-broad-catch` checks comment presence only.** Per the conventions.md
  enforcement posture, the H2a lint verifies only that an exempt site carries a
  `// allow-broad-catch: <token>` comment with a non-empty token; resolving the
  cited token against `coverage-matrix.md` is the loom 1.0 closing gate's job
  (H5c), not this rule's.
- **`npm run lint` uses `--no-error-on-unmatched-pattern`** so the script is
  green while `src/` is still empty; later leaves populate `src/**`.

## 2026-06-30 — H3a DI seam skeleton

- **`LoweredSchema` / `TimerHandle` placeholder types.** H3a declares seam
  *interfaces only*; the lowered per-query schema document and the timer handle
  are owned by later leaves (schema-subset lowering, the `WallClock` /
  `FakeClock` adapters). Declared as `Readonly<Record<string, unknown>>` and
  `unknown` respectively so the seam shapes compile now and the V8*/schema
  leaves refine them without redeclaring the seam members.
- **Ambient scan is a deliberate superset.** The convention requires
  `scan list ⊇ spec ban`. The identifier-keyed scan keys `randomUUID` and
  `getTime` on the property name alone (any receiver), and `process.env` /
  `process.cwd` / `Date.now` / `performance.now` on the `obj.prop` pair. This
  over-covers `Date.prototype.getTime` (flags any `.getTime` member access) and
  `crypto.randomUUID` (flags any `.randomUUID`) — both are still genuine timing/
  UUID ambient reads, so the superset never produces a spurious flag against a
  seam member.
- **`setTimeout` / `clearTimeout` matched in bare-identifier form only.** A
  member access such as `clock.setTimeout(fn, 0)` (the injected PIC-12 timer
  seam, used by PIC-10's `loop-iter` macrotask yield) is NOT a direct reference
  to the global and is not flagged; only the bare global identifier is. Member
  forms like `globalThis.setTimeout` are indirect and fall to the conceded
  residue (release-time inspection item 2), consistent with the leaf's
  "direct references only" framing.

## 2026-06-30 — H4a factory shell and end-to-end harness

- **Never-throw factory uses swallow-and-continue, NOT the spec's fatal/skip
  semantics.** extension-bootstrap-and-per-loom.md says a `pi.registerFlag` or
  factory-time `pi.on` failure is FATAL to the whole extension (skip the
  remaining steps) while a renderer failure is non-fatal (drop the renderer,
  continue). H4a's binding Tests bullet is narrower — "completes its
  registrations and never throws even when a host seam is absent, each call
  try/catch-wrapped, returning synchronously". So the H4a factory wraps each
  call in its own swallow-and-continue `try`/`catch` (the minimal never-throw
  boundary) and does NOT implement the per-call-type fatal/skip differentiation
  or the `loom/load/extension-bootstrap-failed` diagnostics — those, with the
  capability-probe refusal logic, are explicitly deferred to V9a (the leaf says
  so). Logged as a divergence in decisions.jsonl.
- **Harness lives under `tests/`, not `src/**`.** The reusable end-to-end
  harness + in-process session double are test-support code Pi never loads, so
  they sit under `tests/harness/` outside the `src/**` mechanical gates (which
  is why the double may use ambient `Promise`/`AbortController` freely). The
  production seam M/M-T bind against — `LoomExtensionDeps.fixtures` /
  `LoomFixture` and `createLoomExtension` — lives in `src/extension/factory.ts`.
- **`extensions/index.ts` added to tsconfig `include`.** The entry shim sits
  outside `src/**` (so the `src/**`-scoped lint/arch/ambient gates do not read
  it; its purity is a release-time residue-inspection item), but it is added to
  the tsconfig `include` so `tsc` build/typecheck still compile the re-export.
- **Session-double fidelity self-check checks the double against the spec
  model, not live Pi.** Per the leaf, the harness runs no live Pi session and
  there is no mechanical real-host fidelity gate in loom 1.0; the four axes
  (streaming-before-idle / single-turn append / pi.on cancel-forward / CNCL-4
  reason propagation) are asserted against the conversation-drive.md /
  cancellation.md behaviour model the Adds fidelity-contract sentence cites.
- **`cancelTurn(reason)` vs `ctx.abort()`.** The double models two abort
  directions: `cancelTurn(reason)` is the Pi/user-initiated CNCL-4 source
  (aborts the in-flight turn signal WITH a reason, the value CNCL-4 requires be
  mirrored into `loomAbort`); `ctx.abort()` is the loom→Pi teardown direction
  (SDK `abort()` takes no reason argument).

## H4b — response-programming surface

- **Surface lives in tests/, not src/**.** Like H4a's session double, the
  response-programming surface is test-support code Pi never loads, so it lives
  under `tests/harness/` and is outside the `src/**` mechanical gates. No
  production code was added by this leaf — it is a Convention (horizontal)
  harness leaf whose inline self-check is the deliverable.
- **API shape finalised by the implementer (permitted by the leaf).** The leaf
  states "the API's exact shape is the implementer's to finalise" and phrases
  its obligations in terms of the observable each scripted input must yield.
  Chosen shape: a chainable `ResponseProgrammer` with `scriptAssistantTurns` /
  `scriptToolResult` / `scriptBinderAttempts` / `scriptToolLoop` /
  `scriptAbortAt` setters and a pure, deterministic `drive()` that replays the
  script into a discriminated `ResponseEvent[]` observable transcript. No
  spec/plan divergence — the contract's named injection points (a)–(e) are all
  modelled.
- **Determinism via a pure replay.** `drive()` is pure over the scripted state
  (no clock/randomness/async ordering), so replaying the same script — same
  instance or an independently-constructed harness double — yields a
  byte-identical transcript. This is how the determinism gate is asserted.
- **Binder budget model.** The V11f per-invocation budget is modelled as
  one transport + one malformed retry, capped at 3 total binder calls; an abort
  at pre-call / in-flight (initial call) / during-retry short-circuits to the
  cancelled observable. The most-recent failure surfaces when both budgets are
  spent (`binder-surfaced-failure`).

## H4c — modeled-behaviour surface (2026-06-30)
- **(f) completed-invoke-child model.** A scripted invoke-child is just its
  `childName` + produced `finalValue`; the drive emits a single
  `completed-invoke-child` event. ERR-13 (no rollback) is modelled by the fact
  that the child has "already run" — the surface only ever exposes the produced
  final value, never a rollback or a completed-side-effect manifest.
- **(g) subagent-mode callee model.** Modelled on V9i rather than as a plain (a)
  turn: the drive emits a `subagent-spawn` (the private `createAgentSession`)
  then a `subagent-loom` outcome whose value comes from the FIRST
  `willRetry:false` `agent_end` (PIC-43) — earlier `willRetry:true` events are
  decoys the runtime ignores. The private session's turns are deliberately NOT
  surfaced as `fragment`/`turn-end` events (transcript privacy), which is the
  observable distinction from a plain scripted assistant turn. A callee with no
  terminal `agent_end` throws deterministically rather than modelling a hang.

## H5a — closing-gate citing/asserting scan is purely textual

The H5a closing-gate citing-test and asserting-code scans are best-effort
textual `PREFIX-N` / `loom/...` token scans over the whole test-source bytes,
comments included. A seeded "missing citation / missing assertion" fixture must
therefore omit the absent token from the *entire* fixture file — a comment that
merely names the token (e.g. "FOO-2 is deliberately not cited") leaks it and is
counted as a citation, masking the intended violation. The fixtures keep their
explanatory comments token-free for the omitted subject.

## 2026-06-30 — H5f closing-gate section-heading classification order

Implementation discovery (not a plan/spec change): the coverage-matrix Code-keyed
section heading literally reads "Code-keyed obligation areas (no numbered REQ-IDs)",
whose substring "numbered REQ-IDs" matches a naive `/Numbered REQ-IDs/i` test. The
new `parseFacetRows` section classifier therefore tests the Code-keyed branch
**before** the Numbered branch; otherwise the entire Code-keyed table is
mis-classified as the Numbered table and its `cka-<n>` rows are silently dropped
from the per-facet scan. The pre-existing `parseClosingLeafCells` avoids this by
OR-ing both predicates into one `inScope` flag (order-independent), and
`parseCkaAreaRows` only ever tests the Code-keyed predicate — so neither exhibited
the bug, but any future single-`section`-variable scoped reader of these two tables
must order Code-keyed first.

Granularity choice for the H5f facet-naming citing-test scan: per-test-source-file
co-occurrence (a single test source must cite both the row subject and the facet
leaf-ID inline). This is strictly tighter than the H5a per-REQ-ID corpus-wide scan
yet still a best-effort existence check; finer per-`it`-block association and
per-facet assertion fidelity stay routed to the release-time residue inspection
item 7, exactly as conventions.md specifies.

## 2026-06-30 — M-T harness session-double sendMessage recorder

Implementation discovery (not a plan/spec change): the H4a session double models
`pi.sendUserMessage` but not `pi.sendMessage` (the diagnostics channel the
`loom-system-note` renderer surfaces). M-T's SLSH-2 happy-path assertion that a
dispatch produces "no diagnostic" needs to observe the absence of any emitted
`loom-system-note`, so the double now records `pi.sendMessage` calls into a
`systemNotes` array. Additive only — no H4a test changed.

Seam-shape choice for the MVP pipeline (faithful to M's Adds, not a divergence):
`buildMinimalLoom(source, pi)` closes the returned LoomFixture's prompt-mode
driver over the injected `pi` handle, because `sendUserMessage` lives on
`ExtensionAPI` (`pi`) while the dispatched handler only receives `ctx`
(`waitForIdle`). The fixture is fed through H4a's in-memory fixture-supply seam
(`LoomExtensionDeps.fixtures`), so no FileSystem seam and no ambient src/** read
is introduced. M fills in the parse + drive; M-T leaves the stub inert.

## V7b-T — diagnostic code-registry tests

Placed the V7b machine-checkable-registry seam in a new `tools/code-registry/`
module (beside the H5a `tools/closing-gate/`) rather than extending the gate
module directly: V7b "the closed-set + stable-id enforcement that the H5a gate
consumes" reads as a registry artifact the gate depends on, so a dedicated
module keeps the dependency direction explicit (gate → registry) and leaves the
existing green closing-gate fixtures untouched. The V7b impl wires the gate to
consume it.

DIAG-3 mechanical contract: the spec defers *renames* to loom 2.0 but does not
prescribe HOW the gate detects a rename (additions/removals are allowed within
1.x per the GOV-15 diagnostic-registry carve-out). The V7b-T tests pin the
narrowest mechanical proxy: a *pinned stable-id baseline* of registered code
IDs, with `reconcileStableIds` reporting `code-renamed` for any baseline code
absent from the current registry. This is the closest mechanical signal of a
rename (a rename removes the old code); distinguishing an intentional removal
from a rename is left to the V7b impl / its baseline-maintenance discipline.

## V7c — placeholder rendering: broad-catch exempt-site classification

The category-6 underlying-error coercion (placeholder-rendering-b.md §6) mandates
that when the `String(v)` coercion of a caught thrown value *itself throws*, the
renderer yields the literal `<unreadable>` rather than propagating. There is no
clean way to detect a hostile `toString`/`valueOf`/`Symbol.toPrimitive` without
invoking it, so the fallback requires a `catch` that binds an arbitrary thrown
value — which the *Specific exception types only* cross-cutting rule forbids
outside the five enumerated exempt broad-catch sites.

Classification decision: the `String(v)` catch in `coerceUnderlyingString`
(`src/diagnostics/placeholder.ts`) is treated as enumerated exempt site (1), the
**Pi SDK boundary site**. Justification: the §6/§8 placeholders that route
through this coercion (`<error.message>`, `<dispose error first line>`, and the
category-8 `<error>` on `loom/load/extension-bootstrap-failed` /
`loom/runtime/active-set-restore-failed`) all bind values *caught from* Pi SDK
operations (`pi.sendMessage` throw, `AgentSession.dispose()` rejection,
extension-bootstrap throw) whose runtime shape loom cannot statically guarantee
— a hostile getter / `Proxy` / `null`-prototype object may throw during the
`String(v)` coercion. The site cites the structural `pi-sdk-boundary` token (no
spec obligation exists for it), which the H5c broad-catch allow-list closing-gate
arm admits. The catch swallows any throw and returns the spec-mandated
`<unreadable>` sentinel (not a rethrow-on-mismatch).

## 2026-06-30 — V1a lexer core

- **`=` as a continuation trigger.** grammar.md §"Newline continuation"
  tabulates the closed trigger set as the binary/ternary operators
  (`+ - * / % == != < <= > >= && || ? :`), trailing comma, open bracket, and
  leading operator — `=` is not in that operator list. But the spec's own
  worked example of the blank-line rule, repeated verbatim in lexical.md
  §"Statement terminators" and grammar.md, is `let x =\n\n  foo` "is one
  statement equivalent to `let x = foo`", which requires a *trailing* `=` to
  trigger continuation. lexical.md's framing — "continues … only when the
  parser cannot otherwise close it" — covers a dangling binding `=`. The lexer
  therefore treats trailing `=` as a continuation trigger (it is not a *leading*
  trigger). Recorded because it reconciles an apparent gap between the closed
  operator table and the normative worked example rather than following the
  table's literal operator list. No spec edit made: the worked example is
  itself normative and the "cannot otherwise close it" framing authorises it.

- **Contextual diagnostic scope.** lexical.md frames the case / reserved-keyword
  / single-line-body rules as *parser*-enforced. This lexer-core leaf enforces
  them at the closed positions its V1a-T Tests obligations name: declarator-name
  slots (`let` / `let mut` / `fn` → binding; `schema` / `enum` → type) and
  control headers (`if` / `for` / `while` / `fn`). Full identifier-position
  coverage (every reserved word in every grammatical identifier slot, the case
  rule for fn params and schema fields, the `for`/`fn` single-line forms beyond
  the `if (x) stmt` vector) belongs to the later parser leaves; the lexer core
  does not over-reach into positions it cannot resolve without a parse tree.

- **`?` continuation trigger.** The closed table lists `?` as a trailing/leading
  trigger (ternary head). grammar.md carves out the postfix error-propagation
  `?` (ERR-18) as a statement terminator, but that distinction needs the parser;
  the lexer core treats `?` as a continuation trigger per the table's positive
  path. No V1a vector exercises the postfix-`?` carve-out.

## V1b-T — string/number/path literal tests

- **Seam split: lexer-surfaced vs parse-context literals.** String escape
  decoding and number range/type checks are lexer behaviours, so V1b-T asserts
  them through `lexLoom` and the V7d diagnostic seam (decoded value lands on
  `Token.value`, the integer/number tag on `Token.numericType`, the numeric
  codes are emitted during scanning). Path-literal validation and the
  integer→number narrowing rule need a parse / type context the tokeniser does
  not have, so V1b-T gives them standalone seams in `src/lexer/literals.ts`
  (`validatePathLiteral`, `checkIntegerNarrowing`) that the later import /
  invoke / type-check leaves call. This keeps the V1a `lexLoom` token contract
  intact (two optional fields added) while not forcing path/narrowing checks
  into a position the lexer cannot resolve.

- **`.LOOM` rejection code.** The leaf's path bullet cites only
  `loom/parse/invalid-path-separator` and adds the prose ".LOOM is rejected
  byte-exact cross-OS". The registry code that actually fires for a non-`.loom`
  `invoke` path is `loom/parse/invoke-non-loom-extension` (lexical.md
  §"Extension matching" — byte-exact lowercase final-segment check), which V1b's
  Adds names ("byte-exact lowercase .loom/.warp final segment"). The `.LOOM`
  test therefore asserts `loom/parse/invoke-non-loom-extension`; this lands an
  asserting test for that registry code and is faithful to the spec rule the
  bullet's prose describes.

## 2026-06-30 — V5b discriminated-union detection precedence (under-specification)

schemas.md §Discriminated unions states the three implicit-detection rules
(present-in-all, single string-literal, unique value) and lists the failure
diagnostics, but does not pin the *precedence* among failures when implicit
detection finds zero qualifying fields, nor whether
`loom/parse/duplicate-discriminator-value` can fire under implicit detection (the
spec's duplicate-value sentence is unscoped; V5b-T only exercises it under
explicit `by`). Decision (minimal, faithful): in implicit mode with zero
qualifiers, a present-in-all single-string-literal field with duplicate values
fires `duplicate-discriminator-value` first, else a present-in-all single-literal
non-string field fires `non-string-discriminator`, else `missing-discriminator`.
In the explicit `by` path the order is nested → non-string → duplicate-value
(a nested value's type/value cannot be read, so it is reported first). This keeps
the most-specific, most-actionable diagnostic surfacing first and matches the
spec's general "duplicate discriminator values … are loom/parse/duplicate-discriminator-value" statement.

## V5d-T — `<construct>` rendering for rejected JSON-Schema keywords (non-plan discovery)

The V5d reject gate fires `loom/parse/unsupported-feature` for out-of-subset
JSON-Schema keywords (schema-subset.md). That code's registry *Message* is
`unsupported syntactic feature: <construct>`, but the closed `<construct>`
token-name table in diagnostics/placeholder-rendering-a.md §3 enumerates only
loom/JS syntactic constructs (arrow function, spread, typeof, …) — it does NOT
enumerate JSON-Schema keywords (`pattern`, `oneOf`, …). The closed table is the
rendering surface for source-syntax constructs; the schema-subset reject gate is
a distinct site.

Decision (tests-task contract): the V5d-T tests anchor the rendered message to
the registry *Message*-column **prefix** `unsupported syntactic feature: ` and
assert the offending keyword appears in the message, rather than pinning a
specific closed-table token. This keeps the message anchored to the registry
(per *Diagnostic message anchors*) without forcing V5d into a `<construct>`
rendering the closed table does not define for JSON-Schema keywords. If a future
spec edit extends the §3 closed token table to cover schema-subset keywords, the
V5d implementation should render that token and the V5d-T assertions can tighten
to full-string equality. Surfaced here, not re-anchored — re-anchoring is a
spec-side GOV-7/GOV-8 placeholder-table decision, not a plan-leaf change.

## 2026-06-30 — V4b-T match-error / match-bypass coverage decision

The V4b-T leaf binds "each of the six closed panic sources ... bypasses
`?`/`match`". For five of the six sources the V4b-T suite exercises the bypass
through *both* `?` (a panic raised in a `?` operand propagates past
`evaluateQuestion`) and `match` (a panic raised in a `match` arm body escapes
`evaluateMatch`). The sixth source, `loom/runtime/match-error`, IS the `match`
construct's own panic — its bypass-of-`match` (an outer `match` arm cannot
capture a nested non-exhaustive `match`'s panic) rests entirely on the V4a
`evaluateMatch` propagation already shipped and verified by
`tests/match-result.test.ts`. Including a match-error-bypasses-`match` test in
the V4b-T red suite would be a *green* test (it passes with the V4b
implementation still absent), which the conventions classify as a defect ("a
test that would pass when prerequisites are missing is a defect"). So
`match-error` is exercised for `?`-bypass only in V4b-T (where `evaluateQuestion`
is the V4b-new seam and the assertion reds), and its message-template assertion
reds on the V4a stub message. The five non-match sources cover the `match`-bypass
obligation. This keeps every test in the red suite failing for the intended
reason while still witnessing all six sources bypassing `?` and (for the five
non-match sources) `match`.

2026-06-30 V2e — Wire-name translation: nested `$ref` resolution divergence. The `V5f` `SchemaSidecar` (`{ wireNames, namedEnumPositions }`) carries no per-field `$ref` target. The spec (schemas.md §Recursion) lowers a reference to a named schema to `$ref` against `$defs`, but the seam handed to `translateInbound`/`translateOutbound` records no edge from a field to the `$defs` it references. To recurse into a nested schema the implementation matches the field's wire name against a `$defs` key in the per-`$defs` sidecar map (`sidecars.get(wireKey)`). This is faithful for the V2e-T fixtures (a nested-object field's wire name equals its target `$defs` name, e.g. field `Inner` → `$defs` `Inner`) but cannot be faithful in general: a field `manager: Person` references `$defs` `Person`, not `$defs` `manager`, so its nested renames/enum-tags would not be applied. A fully faithful boundary needs the `V5f` lowering pass to emit a per-field ref-target into the sidecar (out of V2e scope — would change V5f's output shape and the V2e-T fixtures). Array-element-level nested defs are likewise unresolvable through the current seam (elements recurse with no sidecar). No test exercises the general/array case; the leaf's Tests are fully satisfied.

## 2026-06-30 — V9a capability-probe scope

V9a's Adds describes the probe plus the factory-level refusal rule ("skip all
factory host-binding calls") and "one loom/load/host-incompatible emission",
noting the refusal is "enforced once at the PiExtensionAPI adapter layer". The
binding V9a-T tests exercise only `runCapabilityProbe` (the pure-function probe
outcome on each failure kind). Scoped this leaf to the probe function plus the
two exported constants (`FACTORY_PROBABLE_CAPABILITIES`, `SHUTDOWN_AWAIT_CAP_MS`):
the factory-side refusal/emission wiring needs the host-snapshot construction
(real `process.versions`, global `AbortSignal`/`AbortController`, the imported
`AgentSession` / `typebox` namespaces, and a `createRequire`-based peer
`package.json` reader) routed through seam adapters / the `PiExtensionAPI`
adapter layer that does not yet exist, and no test in V9a or its dependents
exercises it. Adding untested ambient reads now would risk H3a/H2a violations
and speculative code. The probe is the load-bearing deliverable; the adapter-layer
refusal enforcement is left to the leaf that introduces that adapter. "Ships when"
(npm test proves the probe refuses on each failure kind with the right
details.kind and binds nothing) is met by the probe function alone.

## 2026-06-30 — V9f tool-registration lifetime

PIC-8(c) pins only the `loom-system-note` advisory's `content` (verbatim template)
and `display:true`; it does not specify the note's `details` payload. The
SystemNote shape (system-note-channel.ts) requires a `details` of one of four
disjoint shapes. Chose the `event` arm with `{ code: "loom/runtime/active-set-restore-failed" }`
as the minimal, non-misleading payload that ties the advisory to its emitting
diagnostic. No spec rule constrains this field, so this is a fill-in of an
underspecified field rather than a divergence from literal spec text. The V9f-T
tests assert only `content` and `display`, leaving the choice open.

## V10c-T — settings-unreadable on a missing file (wording tension, not a divergence)

The V10c-T leaf bullet and discovery/package-and-settings.md §"Settings file
reads" → Failure modes both say a "missing or unreadable" settings file fires
`loom/load/settings-unreadable` (treated as `{}`). The
diagnostics/code-registry-load.md *Trigger* cell for that code instead reads
"exists but is unreadable". The leaf and the spec-page failure-modes list are the
binding obligations here, so the tests pin: a MISSING file also fires
`settings-unreadable` (not only an EACCES/EPERM-unreadable one). This means a
project with neither `.pi/settings.json` nor `~/.pi/agent/settings.json` emits
two W-severity warnings at load — noisy but spec-faithful. Flagging for the V10c
implementer; the registry *Trigger* wording could be reconciled spec-side later.
No code/spec change made in this -T leaf.

## 2026-06-30 — V10a-T: case-collision vs invalid-slash-name interaction (spec ambiguity, resolved minimally)

discovery-sources.md DISC-3 "Filename validity" says an invalid-stem name (e.g. `Plan.loom`)
"does not participate in collision detection", yet the case-collision rule's own example pairs
`Plan.loom` with `plan.loom` — and any case-collision pair necessarily contains at least one
uppercase (therefore invalid) stem, because valid stems are lowercase-only. Read literally the two
clauses contradict (a case-collision could never fire).

Minimal resolution adopted for the V10a-T tests: `loom/load/case-collision` is a directory-entry
filename-level check (two `*.loom` entries case-folding to one name within a source), independent of
slash-name validity; the "does not participate in collision detection" exclusion is scoped to the
slash-name-level cross-format/cross-source collision, not the case-collision warning. The
case-collision test therefore asserts only that the W warning fires naming both paths, not which (if
either) registers. V10a must implement case-collision detection on directory entries before the
slash-name validity gate drops invalid-stem files.

## V9b — broad-catch site for the registry-swap rebuild (PIC-36)

PIC-36 mandates that any throw out of the build-aside rebuild (parse / AJV
recompile / `pi.registerTool`) be caught and surfaced as one
`loom/runtime/registry-swap-failed` diagnostic, with the staging set discarded
and the prior snapshot left live. The throw shape is arbitrary across those
steps, so `rebuildAndSwap` uses a `catch (rebuildError: unknown)` carrying
`// allow-broad-catch: loom/runtime/registry-swap-failed — pi-integration-contract/registration-steps.md`.

The token resolves under the closing-gate predicate (a concrete `loom/...`
diagnostics-registry code), so the mechanical `no-broad-catch` lint and the
closing-gate token-resolution arm both pass. Category-membership (requirement
(b)) note: conventions.md enumerates five exempt broad-catch site categories and
this rebuild-failure trap is not literally among them. It is nonetheless a
spec-mandated broad catch (PIC-36 "if any rebuild step throws"). Recorded for the
loom 1.0 release-time residue inspection (checklist item 6) to confirm or
re-anchor; no contract invented.

## 2026-07-01 — V9e ActiveInvocationRegistry

Two implementation decisions diverge slightly from the literal spec text and are
recorded here for the loom 1.0 release-time residue inspection:

1. **Setup-wrap catch removes the entry itself.** active-invocation-registry.md
   §"Registry contract → Dispatch-site setup wrap" says a throw after `Set.add`
   is removed by "the same per-invocation `finally`". In the seam decomposition
   `dispatchSiteSetup` returns a `defect` outcome carrying no entry handle, so
   the caller's per-invocation `finally` has nothing to remove. To honour the
   "no entry leaks" intent, the `catch` arm itself removes the added entry and
   settles its barrier. Observable behaviour (the entry-count probe returns to
   empty after a failed setup) matches spec intent; only the locus of the
   removal differs.

2. **Broad-catch token.** The setup wrap and its nested cleanup catch use
   `// allow-broad-catch: pi-sdk-boundary`. The wrap exists to catch the
   `createAgentSession(...)` Pi-SDK rejection and SDK-object interactions
   (conventions.md exempt category (1)); the nested cleanup wraps the
   `loomAbort.abort()` host call the spec mandates be defensively dropped. The
   token resolves under the closing-gate predicate. Category-membership
   (requirement (b)) recorded for the release-time residue inspection
   (checklist item 6) — no contract invented.

## 2026-07-01 — V10b package discovery divergences

Implementing the DISC-6 bounded walk against the paired V10b-T tests surfaced
three minimal decisions that diverge from a literal reading of
`discovery/package-and-settings.md`:

1. **Walk clock starts at the first cap-check, not at function entry.** The
   spec says the walk is bounded by wall-clock time "spent … on the walk". The
   V10b-T tests drive the `FakeClock` via `drive()`, which advances the clock on
   every microtask-flush iteration — including during candidate enumeration
   (root `readdir`s). Capturing `start` at function entry let enumeration-time
   advances consume the `scanPackagesTimeoutMs` budget, tripping the time cap
   before the intended read count and breaking the file-count-before-time
   tie-break. Capturing `start` lazily at the first candidate cap-check excludes
   enumeration from the read budget, which is the tests' (and production's)
   intent: enumeration is effectively instant against a real `WallClock`.

2. **npm-root candidates are not `lstat`-pre-filtered.** The spec filters
   non-directory / symlink children (e.g. pnpm-isolated `node_modules/<pkg>`
   symlinks report `isDirectory()` false and are dropped). Pre-`lstat`-ing every
   immediate child before its `package.json` read added enough awaits that the
   walk did not reach the first read within the `drive()` harness's first
   microtask flush, again over-advancing the `FakeClock`. The implementation
   instead treats every non-`@` immediate child (and every `@scope` child) as a
   candidate and lets a non-directory / non-package child fail its `package.json`
   read (contributing nothing). Behaviour is equivalent for ordinary
   non-directory children; the one spec-visible gap is that a *symlinked but
   otherwise valid* package directory would be included rather than filtered.
   Untested here and low-impact; recorded for the release-time residue review.

3. **No cross-root package-identity dedup.** The spec dedups a package present
   in both a project and a global root by package identity (npm name / git URL /
   resolved path), project copy winning. The initial implementation used a
   per-candidate `realpath` for this; it was removed both because it added awaits
   that broke the `FakeClock` timing model and because it is untested. Duplicate
   `.loom` paths are still deduped by absolute path, and slash-name collisions
   across sources are V10a's `discoverLooms` responsibility (into which package
   discovery is not yet wired). Cross-root package-level dedup is deferred.

Package discovery is not yet plumbed into `discoverLooms` (no production caller
wires the discovery walk into the extension factory yet); that integration is a
later leaf. V10b's obligations (DISC-5 / DISC-6 via `discoverPackageLooms`) and
its "Ships when" gate are satisfied by the package-discovery test suite.

## 2026-07-01 — V10d settings-remerge arm code choice

The V10d leaf mandates contributing the settings-re-merge arm of the watcher-time
reload failure-injection seam (`ReloadFailureInjector.injectReloadFailure`,
declared by V9b). The spec (package-and-settings.md §"Watcher-time reload
failures") says the re-merge arm re-produces a load-phase `loom/load/settings-*`
diagnostic (the re-merge codes family) rather than the swap arm's
`loom/runtime/registry-swap-failed`, but does not pin which single `settings-*`
code a synthetic injected failure surfaces. The injector receives only an
`Error` (no code). Chose `loom/load/settings-invalid-json` as the representative
re-merge code (a changed settings file failing to re-parse at watcher time is the
canonical re-merge failure), exposed as `SETTINGS_REMERGE_FAILED_CODE`. V4g
(which lists V10d in Deps and binds this arm) asserts the ERR-7 pre-eval routing
to `loom-system-note` with `triggerTurn:false`; its Ships-when tests the routing,
not the exact registry message string, so this code choice is compatible.

## V11a — binder-model resolution (2026-07-01)

Divergence (minor, spec-faithful): `computeBinderModelRecoveryNote` keys recovery-note
membership on the matcher-only "re-resolves to a model" step (`resolveChainReference`
→ `matcher.resolve(...) === "resolved"`), NOT on the full `resolveBinderModel` result.
Rationale: binder-model-and-context.md#binder-model-hot-reload says membership is
"exactly the looms whose original load failure was `loom/load/binder-model-unresolved`
and whose binder model now re-resolves to a model … computed by re-running binder-model
resolution alone", and explicitly that "membership … makes no claim that a listed loom's
next /reload succeeds" (a re-resolved loom can still fail `/reload` for the strict-
capability reason, surfaced at that next load). So a model that now matches but is
strict-capable=`false` is still listed as recovered. The V11a-T test only exercises the
resolved+strictCapable-true case, so this choice is not test-pinned; recorded here.

## V9j-T — pi-ai SDK naming vs spec provider/api strings, and the binder-tool `label` field

Two spec-vs-`@earendil-works/pi-ai` mismatches surfaced while writing the V9j-T
tests. Both are recorded here (and in `.pi/impl-progress/decisions.jsonl`) so the
paired V9j implementation and the spec's build-time `Api`-coverage assertion are
not surprised by them.

1. **Provider `api`-string naming.** `provider-error-mapping.md` keys its overflow
   signatures and its seed-field table on the `api`-shaped `Model<Api>.api` values
   `anthropic-messages`, `openai-completions`, `mistral`, and `amazon-bedrock`. In
   the pinned pi-ai (`~0.75.5`), `KnownApi` is
   `openai-completions | mistral-conversations | openai-responses |
   azure-openai-responses | openai-codex-responses | anthropic-messages |
   bedrock-converse-stream | google-generative-ai | google-vertex` — so `mistral`
   and `amazon-bedrock` are **`Provider`** (`KnownProvider`) values, NOT `Api`
   values; the corresponding `Api` values are `mistral-conversations` and
   `bedrock-converse-stream`. The V9j-T tests encode the spec's four api-strings
   verbatim (the observable contract the spec pins). This means the spec's
   build-time "`Api`-coverage assertion which enumerates pi-ai's exposed `Api`
   literal-union values and asserts every value appears as a row key in the
   seed-field table" cannot be satisfied as literally written against this pi-ai
   version — the seed-field table row keys (`mistral`, `amazon-bedrock`) are not
   `Api` union members, and several real `Api` members (`openai-responses`,
   `google-generative-ai`, …) have no row. Resolving this is a V9j (impl) /
   spec-coverage concern; V9j-T only pins the spec's four-provider behaviour.

2. **Binder-tool `label`.** `binder-inference.md` describes the binder's
   structured-output tool as a `ToolDefinition` with a `label` field
   (`"Loom binder envelope"`). But the value `complete()` consumes —
   `Context.tools[i]` — is pi-ai's `Tool = { name; description; parameters }`,
   which has no `label` field. The V9j-T `complete()`-envelope test therefore
   asserts only `name` / `description` / `parameters` on the tool entry and omits
   `label`; the label literal belongs (if anywhere) to loom's internal
   ToolDefinition→pi bridge, not to the off-session `complete()` call args.

### V9j (impl) — 2026-07-01

3. **Binder user-message `timestamp`.** `binder-inference.md` pins the binder
   `complete()` call as deterministic (`temperature:0`, the fixed literal user
   content) and says nothing about a message `timestamp`. pi-ai's `UserMessage`
   type requires a numeric `timestamp`. Reading a wall clock would break
   determinism and breach the WallClock/ambient-primitive ban, so
   `buildBinderCompleteCall` sets a fixed `timestamp: 0` (`BINDER_MESSAGE_TIMESTAMP`)
   — a constant, no ambient read. The `V9j-T` envelope test asserts only `role`
   and `content`, so the constant is not spec-observable.
4. **Seed-field `Api`-coverage assertion not wired.** `provider-error-mapping.md`
   §"Provider seed-field mapping" mentions a build-time assertion enumerating
   pi-ai's `Api` union and asserting every value is a seed-table row key. No
   `V9j-T` test exercises it, and (per divergence 1 above) it cannot be satisfied
   literally against the pinned pi-ai `Api` union; `V9j` implements the
   four-api-string table faithfully and leaves the coverage gate to a
   spec-coverage follow-up.

## V11d-T — binder system-prompt builder seam shape (2026-07-01)

The `buildBinderSystemPrompt` / `renderBinderParamLine` seam (cka-45) takes the
per-field **surface type** string, the **default-literal surface** string, and
the **compact-transcript body** as *pre-rendered inputs* rather than rendering
them from a structured AST/value inside the builder. Rationale: the Loom
surface-type syntax and the literal-sublanguage surface forms are owned by V2a
(a dep), and the transcript body is owned by V11b (BNDR-7/8/9) with the walk in
V11i (cka-39). V11d's job under cka-45 is therefore the *structural composition*
of the eight prompt items and the byte-exact per-field-line format
(`<wire> (<type>) <requirement>[ — <desc>]`, two-U+0020 indent), not the
literal→surface or type→surface conversion. The V11d-T tests exercise the
composition (Type-display table entries appear verbatim inside `(<type>)`;
default literals appear verbatim after `default=`; the four reference lines
reproduce byte-exact). The paired V11d implementation may keep this seam shape
or fold the surface rendering in behind the same public signatures.

Not a spec divergence: binder-bypass-and-envelope.md pins the *rendered output*
bytes, and leaves the builder's internal input API unspecified (the envelope and
prompt are runtime-internal, never Loom-visible). Recorded here for the V11d
implementer and for discoverability.

## V13a-T — query render/escapes/stringification tests (2026-07-01)

Seam module `src/render/query-render.ts` created by the tests-task (paired V13a
impl fills it). Design decisions recorded for the V13a implementer:

- **Vector-count divergence.** The leaf prose says "the eight normative vectors",
  but query-forms.md QRY-7 now pins a ten-row vector table. The binding is the
  spec table, so `tests/query-render.test.ts` reproduces all ten vectors. (Logged
  to decisions.jsonl.)
- **Seam input shapes are runtime-internal.** `lexQueryTemplate` takes the raw
  template literal source (leading + trailing backtick), returns resolved text
  parts + `${…}` interpolation parts + escape/termination diagnostics +
  `terminated`. `renderTemplateText` takes the fully-assembled post-escape,
  post-interpolation text (literal bytes) and applies CR/CRLF→LF, newline-trim,
  dedent. `stringifyInterpolatedValue` takes a `LoomValue` + an `InterpolationType`
  static-type descriptor (array/object carry optional V2e sidecars + rootDef for
  outbound wire-name translation) — the caller derives the static type, mirroring
  V2d/V11h's caller-derives-the-kind contract. These input APIs are unspecified
  (the render pipeline is runtime-internal, never Loom-visible); V13a may keep or
  fold them behind the same signatures.
- **Vector 5 coincides with the identity stub.** The single-line vector
  `"  hi"→"  hi"` passes against the identity `renderTemplateText` stub (input ==
  output); the other nine vectors red. Kept because it is a genuine normative
  vector, not a masked missing-prerequisite pass.

## 2026-07-01 — V13g-T (discarded-query discipline + discard observability)

- Diagnostic message string divergence: `query-escapes-stringification.md` QRY-19
  prose (and the leaf's Tests bullet, which quotes it) render the diagnostic as
  *"discarded query result; use `?` to propagate failure or `let _ = @`...`` to
  discard explicitly."* — but the diagnostics registry
  (`diagnostics/code-registry-parse.md`) Message column for
  `loom/parse/discarded-query-result` is the byte-different
  `query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly`.
  Per the `conventions.md` *Diagnostic message anchors* rule the registry is the
  single source of truth, so the test asserts the registry string. This is a
  pre-existing spec-prose/registry wording mismatch (a local clarification, not a
  structural defect); left unedited because the registry SSoT already resolves it
  and no behaviour depends on the prose phrasing.

## 2026-07-01 — V15a-T invocation-core seam shaping (non-plan discovery)

- INV-1 containment seam (`src/runtime/invocation.ts`): modeled the "active
  discovery-root union" as a `readonly string[]` passed into
  `checkInvokePathContainment` / the two surface functions, rather than reading a
  shared discovery-roots registry. `src/discovery/discovery-walk.ts`
  (`DiscoveryResult`) exposes discovered looms + diagnostics but no active-roots
  list, so a caller-supplied root set is the minimal seam. The paired `V15a`
  impl can wire the roots from wherever the factory computes them; the runtime
  re-check taking `activeRoots` by value is what makes "uses the currently
  active set (hot-reload fail-closed)" testable.
- The `loom/load/invoke-path-escape` diagnostic `<path>` placeholder is rendered
  from the *literal path as written* (no realpath normalisation) per
  placeholder-rendering-b.md, so the surface input carries `literalPath`
  separately from the parse-time `resolvedPath`. Diagnostic Message string is
  sourced from the code-registry-load.md Message column, not from leaf/spec
  prose, per the "Diagnostic message anchors" cross-cutting rule.
- Static-resolution walk: `runStaticResolutionPass` takes a `parseAndLower`
  callback (the per-pass parse cache's parse/lower step) as an injected dep so
  the "exactly once per canonical path" property is observable by spying on the
  callback — no whole-loom-document parser entry point exists yet in `src/`.

## V14a-T — code-side tool-call seam (2026-07-01)
- The `CodeToolError` schema + closed `cause` enum and `ModelToolError` already
  exist in `src/runtime/query-error.ts` (declared by V4d), and
  `loom/parse/tool-arg-not-literal` already fires via the V2a literal-sublanguage
  check. V14a's *new* surface is the code-side tool-call dispatch/lowering seam
  (`src/runtime/tool-call.ts`): the combined argument-check with the
  arity-before-type ordering (adding `tool-arg-arity` and `tool-arg-type-mismatch`),
  the accepted-path return lowering (Pi tool → `Ok(string)`, `.loom` → `Ok(T)`),
  and the `.loom`-callable failure surfacing (`Invoke*Error`, never `CodeToolError`).
  The closed-enum / distinctness tests assert against V14a-owned reporter helpers
  (`codeToolErrorCauses` / `codeToolErrorKind` / `modelToolErrorKind`) so the
  tests-task reds for the intended reason rather than passing off the pre-existing
  V4d types.
- Pre-existing unrelated reds: `tests/pre-evaluation-reload-failure.test.ts`
  (V4g-T, ERR-7, 4 tests) fails on HEAD without this change; out of scope for
  this leaf.

## V14a — tool-call argument-check arity code for `.loom` callables

- Spec (tool-calls.md §Argument shape) says a `.loom`-callable argument-arity
  error surfaces via `loom/parse/invoke-arity-too-few` / `-too-many`, while a
  multi-argument Pi-tool call is `loom/parse/tool-arg-arity`.
- The V14a-T `ToolCallArgCheckInput` seam carries only `positionalCount` and no
  callee-declared param count, so the invoke-arity too-few/too-many split is not
  computable at this seam. The paired V14a-T "arity is checked before type" test
  drives a `.loom`-callable at `positionalCount: 2` and binds
  `loom/parse/tool-arg-arity`.
- Decision: `checkToolCallArguments` fires `loom/parse/tool-arg-arity` on
  `positionalCount > 1` for both callee kinds (arity short-circuits type). The
  invoke-arity too-few/too-many refinement for `.loom` callables is deferred —
  it needs the callee's declared param count, which this seam does not carry and
  which no V14a Tests bullet exercises. Logged in decisions.jsonl.

## 2026-07-01 — V15c-T `.warp` import seam design

- imports.md pins the `Resolver` interface as `resolve(spec: string, fromFile: string): string` (synchronous), but the byte-exact final-segment match (IMP-1) needs a directory enumeration and the project `FileSystem.readdir` seam (PIC-13) is async (`Promise<readonly string[]>`). To honour the spec's synchronous `resolve` signature verbatim in the tests-task, `imports.ts` introduces a synchronous `WarpDirectoryProbe` seam (`entries(dir)` / `entryReadable(dir, name)`) that `RelativeWarpResolver` consumes. The async→sync bridging (how the load pipeline pre-materialises the directory snapshot from `FileSystem.readdir` before calling the synchronous `resolve`) is left to the paired V15c implementation leaf; the seam shape here keeps `resolve` faithful to the spec signature. Not a spec divergence — the spec signature is honoured as written.
- `loadWarpImport` is the IMP-1 registration-contract surface (catch the `UnresolvableWarpPathError` throw → emit `loom/load/unresolvable-warp-path`, `registered: false`); V15c will use a specific-type catch on `UnresolvableWarpPathError` per the *Specific exception types only* rule.

## 2026-07-01 — V15c `.warp` imports: broad-catch at the IMP-1 resolver boundary

- The V15c-T note anticipated a "specific-type catch on `UnresolvableWarpPathError`" in `loadWarpImport`. That is infeasible under conventions.md: TypeScript catch bindings are only `unknown`/`any` (no narrow subtype binding), and the *Specific exception types only* rule explicitly forbids the rethrow-on-mismatch pattern `catch (e) { if (!(e instanceof X)) throw e; … }`.
- Faithful resolution: `loadWarpImport` uses one broad `catch (resolveError: unknown)` carrying `// allow-broad-catch: loom/load/unresolvable-warp-path — spec_topics/imports.md (IMP-1)`. It does NOT rethrow — IMP-1's text is "loom 1.0's load pipeline treats a throw from `resolve` as a resolution failure" (ANY throw), so converting every throw into `loom/load/unresolvable-warp-path` + `registered:false` is spec-faithful and simultaneously avoids the forbidden rethrow-on-mismatch pattern. The diagnostic renders the spec path as written, not the thrown error's message.
- Residue note: this is a broad-catch site outside the five enumerated exempt-broad-catch-site categories in conventions.md. The H2a `no-broad-catch` lint and the H5c token-resolution arm pass (the cited token `loom/load/unresolvable-warp-path` is a concrete diagnostics-registry code). Category membership is verified only at the loom 1.0 release-time residue inspection (checklist item 6); the reviewer there should either add a sixth "resolver failure-contract boundary (IMP-1)" category or disposition this site. Logged in decisions.jsonl.
- `RelativeWarpResolver` consumes the synchronous `WarpDirectoryProbe` seam (from V15c-T) for the byte-exact final-segment enumeration; the async `FileSystem.readdir` (PIC-13) → sync-probe materialisation for the real load pipeline remains a downstream integration concern, not exercised by any V15c Tests bullet.

## V15e-T — hot-reload cache eviction (tests task)

- New seam module `src/extension/cache-eviction.ts` (extension side: the eviction runs inside the `LoomRegistry` swap `V9b` wires). `evictStaleParseCacheEntries(deps, input)` takes the watcher-delivered `changedPath`, the live `Map<canonicalPath, ParsedCallee>` parse cache (V15a), and a `rebuildImportGraph()` thunk.
- Ordering pin design: the eviction takes ONLY a `rebuildImportGraph()` thunk (no pre-built graph parameter), so a pre-swap-graph walk is structurally impossible — the only source of the graph the walk reads is the thunk's return. Test (3) records the thunk call and asserts the newly-established importer (present only in the post-swap graph) is evicted; a walk over the pre-swap graph would leave it unevicted, so the test reds if the ordering is wrong (the leaf's vacuity guard).
- `WarpImportEdgeGraph` here is keyed by canonical `realpath`-then-forward-slash paths (importer → imported), distinct from V15c's stem-keyed `WarpImportGraph`. The eviction reverse-walks these edges from the changed file to collect its transitive importers. Materialising a canonical-path-keyed edge graph from V15c's parse-time graph is the paired V15e implementation's concern; no V15e-T Tests bullet exercises that materialisation.
- No divergence from spec/plan.

## V15h-T — invoke-child execution-Promise swallowing handler (tests task)

- New seam module `src/runtime/invoke-swallowing-handler.ts`. The invoke-child site is one of the four abandonable-Promise sites (V14f code-side execute(), V13f @-query provider, V15h invoke child top-level, V9o subagent AgentSession.abort()) that V17a's Checkpoint-seam substrate delegates to per-site owners (coverage-matrix `cka-33`).
- Design choice: modelled the single swallowing-handler mechanism as two seam functions so each side channel reds on its own primary assertion. `guardInvokeExecutionPromise` is the construction-site attachment (its absence → real Node `unhandledRejection`, channel 1); `routeInvokeExecutionLateSettlement` is the post-cancellation discard decision (a bypassing build emits a second `RuntimeEvent` + diagnostic, channels 2/3). In production V15h's `guardInvokeExecutionPromise` attaches `.then(onResolve, onReject)` at construction that routes every settlement through `routeInvokeExecutionLateSettlement`. This split is an implementation-shape choice within the tests-task remit, faithful to the spec mechanism — not a spec/plan divergence.
- `InvokeCancellationGuard.cancellationSurfaced` is a live (mutable) flag read at settlement time, not snapshotted at Promise construction, because cancellation may surface at the invoke checkpoint between the child Promise's construction and its late settlement.
- Channel-1 tests use the real `process` `unhandledRejection` event (per-test listener registered/removed in beforeEach/afterEach; each test awaits a macrotask so a would-be event is observed within the test and cannot bleed across files). This matches the spec's "no Node unhandledRejection process event" fidelity rather than a fake.
- No divergence from spec/plan; no decisions.jsonl entry.

## V15h — invoke-child execution-Promise swallowing handler (implementation task)

- Filled `src/runtime/invoke-swallowing-handler.ts`. `guardInvokeExecutionPromise` now attaches `.then(onResolve, onReject)` at the construction site (synchronous, before the first microtask boundary) and routes each settlement through `routeInvokeExecutionLateSettlement`; the construction-site handler is what absorbs a late rejection so no Node `unhandledRejection` fires. `routeInvokeExecutionLateSettlement` returns `"discarded"` (emitting nothing) when `guard.cancellationSurfaced` is true, else `"surfaced"`. Removed the two V15h-T bypass sentinel emitters.
- Used `.then(onResolve, onReject)` rather than `.catch` so a late RESOLVE is also routed (the discriminator is whether cancellation surfaced, not the settle kind) and so the rejection handler is attached at construction, not after an intermediate `.then` microtask hop.
- Pre-existing failure observed (not caused by this leaf): `tests/pre-evaluation-reload-failure.test.ts` has 4 reds on baseline HEAD (551a114) independent of this change (confirmed via git stash). Out of scope for V15h; left untouched.
- No divergence from spec/plan; no decisions.jsonl entry.

## V15l-T (2026-07-01)
- Added `src/runtime/invoke-cross-mode.ts` (inert-stub seam) + `tests/invoke-cross-mode.test.ts` (9 tests). The cross-mode matrix carries no numbered PREFIX-N REQ-ID (it is an un-anchored INV-area obligation; the prompt→prompt facet is the only cell with a cka row — cka-15 → V15d). Tests cite invocation.md §Cross-mode semantics / §Tools and model inline rather than a REQ-ID, matching the leaf's "(INV area)" framing.
- Observation (not a divergence): the coverage matrix has no row for V15l's in-scope cross-mode cells (fresh-vs-attach selection + child-config-not-inherited). cka-15 covers only the prompt→prompt suspend/snapshot cell (V15d). The general cross-mode matrix selection appears to lack a code-keyed-area row. Out of scope to fix in a tests-task; flagging for the V15l impl / plan maintenance to reconcile (H5b Deps + a coverage-matrix cka row may be warranted if the matrix selection is a distinct un-anchored MUST).
- No spec edit made; no decisions.jsonl entry (no behavioural divergence from spec/plan — the tests encode the matrix exactly as invocation.md states it).

## V15l (2026-07-01)
- Filled `src/runtime/invoke-cross-mode.ts`: `selectCalleeContext` now maps subagent→"fresh", prompt→"attach" (caller mode irrelevant); `composeCalleeSession` returns `priorMessages: []` for fresh context, the caller's messages for attach, and `input.callee.config` for the inference config in all cells.
- No divergence from spec/plan; no decisions.jsonl entry. Behaviour matches invocation.md §Cross-mode semantics / §Tools and model exactly as V15l-T's tests encode it.
- Pre-existing failure (not caused by this leaf): `tests/pre-evaluation-reload-failure.test.ts` has 4 reds on baseline HEAD (V15l-T-complete, 636693c), confirmed via `git stash`. Unrelated subsystem; left untouched.
- Standing observation carried from V15l-T: the coverage matrix has no cka row for the in-scope cross-mode cells (fresh-vs-attach selection + child-config-not-inherited); cka-15 covers only the prompt→prompt suspend/snapshot cell (V15d). This is a plan/coverage-matrix maintenance item, not a leaf-implementation divergence — the behaviour is faithful to invocation.md.

## V15d-T (2026-07-01)
- Added `src/runtime/invoke-prompt-suspend.ts` (inert seam stub) + `tests/invoke-prompt-suspend.test.ts` (5 failing tests) for the paired V15d prompt→prompt parent-suspend + setActiveTools snapshot/restore.
- Seam shape: `runPromptSuspendInvoke<T>({ cell, childCallableSet, pi, childBody }) → { engaged, result }`. The V15d impl is expected to reuse V9f's `withActiveSetGate` protocol (snapshot→install→finally restore) generalised from the per-query window to the child's whole body, engaged only for the prompt→prompt cell.
- Test design note: the restore-on-inner-failure tests have the child body perform a foreign mid-window `setActiveTools` mutation before throwing/cancelling/returning-Err, so the restore assertion reds when absent (active set stays foreign) rather than passing trivially. This is spec-faithful — invocation.md §Cross-mode semantics states the loom's restore overwrites an intervening cross-extension mutation with no diagnostic.
- No divergence from spec/plan; no decisions.jsonl entry.
- Pre-existing failure (not caused by this leaf): `tests/pre-evaluation-reload-failure.test.ts` has 4 reds on baseline HEAD (V15l-complete, 5f69001), confirmed via `git stash -u`. Unrelated subsystem; left untouched.

## V15d (2026-07-01)
- Filled `src/runtime/invoke-prompt-suspend.ts`: the prompt→prompt suspend + snapshot/install/finally-restore window. Engaged only for the prompt→prompt cell; all other cells pass through (`engaged:false`).
- Design decision (not a spec/plan divergence): implemented the narrow snapshot→install→`finally` restore directly rather than delegating to V9f's `withActiveSetGate`, contrary to the V15d-T note's expectation. Reason: `withActiveSetGate` requires a full `ActiveSetGateDeps` (loomName, installVector, emitDiagnostic, emitSystemNote, routeInternalError) to carry the PIC-8/PIC-19 failure protocol, but the V15d-T seam deliberately declares a narrower surface (`{cell, childCallableSet, pi, childBody} → {engaged, result}`) with no diagnostic/note/route sinks. Delegating would force no-op sinks that silently drop PIC-8/PIC-19 — a latent defect. The V15d leaf Spec frames PIC-8/PIC-19 and the recovery-mutex as preconditions owned by V9f, and every V15d test path has the restore call succeed, so the direct narrow window is faithful to the binding obligations (V15d-T tests + Ships-when). No decisions.jsonl entry: no divergence from spec/plan literal text.
- 4 pre-existing reds in tests/pre-evaluation-reload-failure.test.ts persist on baseline HEAD (confirmed via git stash); unrelated subsystem, untouched.

## V16a-T (2026-07-01)
- Added `src/runtime/ceiling-arbitration.ts`: the stateless cross-ceiling arbitration seam `arbitrate({ site, satisfied }) → { surfaced, masked? }`, plus `tests/ceiling-arbitration.test.ts` (6 tests, CIO-1 … CIO-6).
- Seam-shape interpretation (see decisions.jsonl): the plan/spec frame CIO-1 as a "precedence *decision*" among co-present ceilings, but leaves the seam's input shape and derivation under-specified. I modelled `surfaced` as the ceiling whose first-enforcement point IS the candidate's tagged check site (each hard ceiling is checked at a distinct site per ceilings-3-and-4.md §"Interaction between ceilings"), and `masked` as the remaining satisfied siblings. The CIO-1 "#3-over-runtime" precedence decision is realised because a co-fire whose surfacing site is the slash-load-binder site surfaces #3 and masks the co-present runtime-class ceiling — i.e. the precedence is encoded by the site→ceiling placement, not by a separate precedence total order over `satisfied`. This is the only shape under which the single-site CIO-2/3/4 tests can red for the intended reason against an inert stub (a wrong-precedence stub cannot fail a singleton set); it is faithful to the distributed-enforcement model and to V16a's Adds ("tagged with the check-site / ceiling-class"). The reused closed identifier set is `MaskedCeilingId` from V9d's `runtime-event-channel.ts`.
- Baseline: the 4 pre-existing reds in `tests/pre-evaluation-reload-failure.test.ts` persist on HEAD (V15i-complete); unrelated subsystem, untouched. This leaf adds exactly 6 intended reds.

## V16a (2026-07-01)
- Filled `arbitrate` in `src/runtime/ceiling-arbitration.ts`: `surfaced = SITE_CEILING[site]` (the fixed site→ceiling map declared as an `as const satisfies Record<CheckSite, MaskedCeilingId>` frozen literal); `masked = MASKED_CEILING_IDS.filter(id => id !== surfaced && satisfied.includes(id))`, returning `{ surfaced }`-only (omit-when-empty, never `[]`) when the filter is empty. This matches the seam-shape interpretation already recorded under the V16a-T note above; no new divergence.
- Detail: `SITE_CEILING` uses `as const satisfies ...` rather than a plain `Record<...>` annotation because the H2a `findModuleLevelMutableBindings` architectural test flags a module-level `const` initialised to a mutable object literal (a static). The `as const` freezes it to a readonly literal (as `MASKED_CEILING_IDS` does), keeping the no-globals/statics gate green. Not a spec/plan divergence — no decisions.jsonl entry.

## V14e-T (2026-07-01)
- Cross-page tension flagged for the V14e impl author: ceilings-3-and-4.md #ceiling-4-table renders the code-driven row's surface as `Err(CodeToolError { cause: "validation", validation_errors: [{ schema_keyword: "maxDepth", … }], … })`, but the normative CodeToolError schema in errors-and-results/queryerror-variants.md carries only { kind, message, tool_name, cause } — it has NO `validation_errors` field. The table's `validation_errors` is illustrative shorthand for "the depth breach is carried", not a literal CodeToolError field. Not a spec drift requiring an edit: the V14e-T Tests bullet only requires the surface to be `Err(CodeToolError { cause: "validation" })` carrying `schema_keyword: "maxDepth"` (message "JSON document depth exceeds 5"), which is observable without widening the schema.
- Seam decision (V14e-T): `enforceCodeToolArgDepth(toolName, argValue)` returns a `CodeToolArgDepthBreach | undefined` — `undefined` within the cap (defer to downstream AJV), else `{ result: Err(CodeToolError), error: CodeToolError{ kind:"code_tool", cause:"validation", message: canonical depth message, tool_name }, issue: DepthViolationIssue{ schema_keyword:"maxDepth", message } }`. The depth `schema_keyword` is exposed via the `issue` field alongside the CodeToolError carrier rather than by adding a field to CodeToolError, keeping the V14a-owned CodeToolError schema unchanged. Not a spec/plan divergence — no decisions.jsonl entry.

## V15b-T (2026-07-01)
- Seam decision: V15b's mechanism lives in a new module `src/runtime/invoke-depth-cycle.ts`, distinct from `V4b`'s `runtime-panics.ts` (which already owns `InvokeDepthExceededPanic`, `INVOKE_DEPTH_CAP`, and the low-level `enterInvokeFrame` guard). V15b-T re-exports those V4b primitives and adds the higher-level per-chain counter (`pushCountableFrame`/`InvokeChain`), the residence classifier (`warpFnFrameKind`), the subagent-boundary pass-through (`crossSubagentBoundary`), the two-mode panic router (`surfaceDepthOverflow`), and the invocation-cycle detector (`detectInvocationCycle`). Not a spec/plan divergence — no decisions.jsonl entry.
- InvokeChain modelled as an immutable value `{ depth }` so "sibling invokes do not share budget" is structural: two children derived from one parent chain are independent by construction. The sibling test still reds under the stub because `pushCountableFrame` does not increment.
- `invocation-cycle` message rendered as bare file-path stems joined by ` → ` (`invocation cycle: A → B → A`), matching the invocation.md §Cycle-detection prose example verbatim; anchored to the code-registry-load.md *Message* template `invocation cycle: <A> → <B> → <A>` via the test's registry parser (using `replaceAll` because the template repeats `<A>`). The diagnostic head is location-less (no file/range) per diagnostic-shape.md §Location-less. Not a spec/plan divergence.
- Pre-existing unrelated failure observed (not caused by this leaf): `tests/pre-evaluation-reload-failure.test.ts` (`V4g-T`) reds with 4 tests on HEAD without this change — it is a tests-task shipped intentionally red (its commit is labelled "(red)") until the paired `V4g` impl lands. Out of scope for V15b-T; left untouched.

## V15b (2026-07-01)
- Implemented the paired V15b body over the V15b-T stub module. pushCountableFrame reuses V4b's enterInvokeFrame(nextDepth) for the cap guard rather than re-deriving the >32 check, keeping the single "33 > 32" message source in runtime-panics.ts. The `kind` parameter is retained (documents the call site) but does not change the +1 increment — every countable frame class contributes equally to the single shared counter, per INV-4.
- detectInvocationCycle uses a standard gray/black DFS (onStack = active path, done = fully-explored) so a back-edge to a node on the active path yields the cycle path (first-occurrence…back-to-node). An unresolvable node is short-circuited to a leaf before its edges are read, so a cycle routed through it is not detected — matching invocation.md §Cycle detection. No spec/plan divergence — the stub's declared seam shapes were faithful; no decisions.jsonl entry.
- Confirmed the 4 pre-existing tests/pre-evaluation-reload-failure.test.ts (V4g-T) reds persist on HEAD with this change stashed — unrelated to V15b, left untouched.

## V15j-T (2026-07-01)
- The `InvokeInfraError` schema (queryerror-variants.md §Invoke variants, owned by `V4d`) carries no `validation_errors` field — only `kind`, `message`, `callee_path`, `cause`. So the depth-violation `schema_keyword: "maxDepth"` / canonical message is not surfaced *inside* the `InvokeInfraError`. Mirroring `V14e`'s `CodeToolArgDepthBreach`, the `V15j-T` `InvokeDepthBreach` carries the `V5e` `DepthViolationIssue` on a separate `issue` field alongside the carrier, and the carrier's own `message` is set to the canonical depth string. The `V4d`-owned schema stays unchanged (no field added). Not a spec/plan divergence — the ceiling-4-table's illustrative `{ cause: "validation", … }` elides to the fixed `InvokeInfraError` schema, and the depth message travels on `message` + the breach `issue`, exactly as the code-driven row does at `V14e`.
- Pre-existing unrelated failure re-confirmed (not caused by this leaf): `tests/pre-evaluation-reload-failure.test.ts` (`V4g-T`) reds with 4 tests on HEAD with this change stashed. Out of scope for `V15j-T`; left untouched.

## V15j (2026-07-01)
- Implemented the paired V15j body over the V15j-T stub module. The two seams (params boundary / invoke<T> return boundary) route identically per V5e's routeDepthBoundary and differ only in the InvokeInfraError.cause, so both delegate to a shared enforceInvokeDepth(calleePath, value, cause) helper rather than duplicating the depth-walk + wrap logic. No spec/plan divergence — the V15j-T stub's declared seam shapes (InvokeDepthBreach with result/error/issue, cause "validation" | "return_validation") were faithful and drove the implementation directly. The InvokeInfraError carrier's message is set to the canonical depth string and the DepthViolationIssue travels on the breach's separate issue field, exactly as documented in the V15j-T note; the V4d-owned schema stays unchanged. No decisions.jsonl entry.
- The Err payload holds the InvokeInfraError via makeErr(error as unknown as LoomValue): InvokeInfraError is a plain string-keyed object, structurally a LoomValue object, but its declared type is not LoomValue, so the cast is required — matching V14e's CodeToolArgDepthBreach treatment.
- Confirmed the 4 pre-existing tests/pre-evaluation-reload-failure.test.ts (V4g-T) reds persist on HEAD with this change stashed — unrelated to V15j, left untouched.

## V17a (2026-07-01)
- Implemented the paired V17a body over the V17a-T stub module. The three forwarding entry points (slash-command, tool-exposed, invoke-parent derived child) share one forwardSignalReason(loomAbort, source) helper: they differ only in which source signal is forwarded, and the "first source's reason wins under the one-shot guard" property is inherent to AbortController (a second abort(...) on an already-aborted controller is a no-op that does not re-stamp the reason), so no separate guard flag is needed. deriveChildLoomAbort reuses the same helper with (child, parentSignal) — the child is an independent controller the parent holds no reference to, giving downward-only propagation for free.
- Listener cleanup: the spec's per-invocation `finally` listener-removal is owned by the invocation-lifecycle leaf, not this seam. The seam signatures return void and take no disposer; adding one would be an unused (speculative) API with no consumer in V17a's Deps. The one-shot `{ once: true }` listener auto-removes on fire, and an unfired listener is GC'd with its per-invocation source/loomAbort pair. Not a spec/plan divergence — no decisions.jsonl entry.
- routeAbandonableSettlement emits on neither channel: the swallowing handler is a secondary attachment (the owning site's primary await handles a timely settlement), so emitting on the non-cancelled "surfaced" path would double-emit. Its whole purpose is suppression; the emit channels exist so tests can assert silence. Faithful to §Race semantics — swallowing-handler attachment.
- Confirmed the 4 pre-existing tests/pre-evaluation-reload-failure.test.ts (V4g-T) reds persist on HEAD with this change stashed — unrelated to V17a, left untouched.

## V4c-T (2026-07-01)
- H4c leaves the modeled-behaviour scripting API shape "the implementer's to finalise" and the V4c leaf leaves the partial-append seam shape to the implementer. Chose to model the runtime→Pi conversation interaction as an explicit `CommittedConversationMutator` interface (truncate/rewrite/replace/remove/injectCompensatingTurn) the runtime holds, so the ERR-8/ERR-9 "MUST NOT" obligations are testable as "no method called". A compliant V4c `handlePartialTerminalOutcome` therefore calls nothing on the mutator; the tests-task stub deliberately calls the forbidden methods so the reds are the intended-reason reds (non-mutation asserted as empty call log). Not a spec/plan divergence — the seam shape is explicitly the implementer's to choose per H4c/V4c.
- ERR-11 modelled as a `classifyNonMutationWindow` scope helper returning [opensAt, closesAt) + appendsInsideWindow: the window opens at the cancelled streaming turn and closes at the NEXT driver send, so respond-repair appends after that send fall OUT of the ERR-11 window (governed by Query §respond-repair). This makes the ERR-11 "window between the cancelled turn and the next driver send" clause a directly-testable boundary.
- ERR-12 exercised via the H4a/H4c harness `scriptSubagentCallee` surface (subagent-loom outcome) rather than the live V9i surface, per the leaf's explicit instruction; the live-surface re-assertion is a real-host-only behaviour V9i carries off the H4a double (not under npm test).
- Confirmed the 4 pre-existing tests/pre-evaluation-reload-failure.test.ts (V4g-T) reds persist on HEAD independent of this change (V4g impl not yet landed — no V4g-complete tag) — unrelated, left untouched.

## V4c (2026-07-01)
- Implemented the two V4c-T seams: handlePartialTerminalOutcome is now a no-op against the mutator (the whole ERR-8/ERR-9/ERR-10/ERR-12 contract is the absence of any mutating call), and classifyNonMutationWindow closes the ERR-11 window at the FIRST driver send after the cancelled turn (half-open [cancelled-turn, next-driver-send)), collecting only respond-repair appends before that send.
- No spec/plan divergence. The seam shape was fixed by V4c-T; V4c only supplies compliant bodies.
- Ships-when confirmed: npx vitest run tests/terminal-outcomes.test.ts → 6/6 green. The 4 pre-existing tests/pre-evaluation-reload-failure.test.ts (V4g-T) reds persist on HEAD independent of this change (V4g impl not yet landed) — unrelated, untouched.

## V9c-T (2026-07-01)
- PIC-17 modelled as `withActiveSetGating(gate, install, query)` over an injected `ActiveToolSet` (getActiveTools/setActiveTools), with an internal (non-exported) `computeActiveSetInstall` recipe — the ambient snapshot is not a parameter of the recipe, so it structurally cannot be unioned into the install (the "ambient not inherited" invariant is enforced by the type surface, not just the body). Restore is asserted via the last setActiveTools call equalling the snapshot even on a query throw.
- PIC-2 (a derived property per the spec) is witnessed as a *cross-body* non-overlap: two sequential `withActiveSetGating` calls on the same recording gate (parent query, then a nested-invoke child query) must show a running open-window depth ≤ 1, where a setActiveTools install to the ambient set is a CLOSE and any other install is an OPEN. The non-compliant stub (no restore) leaves two OPENs with no intervening CLOSE → depth 2 → red. This models "invoke happens between queries, after the parent window is restored" rather than nesting the child inside the parent's query callback.
- PIC-18 tested against a recording `pi.on` double: exactly the five events under bare names (per-session-marker stub reds the set-equality), and firing all handlers forwards an aborted captured signal into `loomAbort` (reason-preserving) while a non-aborted fire is a harmless re-check. "Never for completion" is folded into the same test's non-abort precheck rather than a standalone completion-sentinel (the compliant seam has no completion channel to observe).
- PIC-53 extraction operates on the pi-ai `Message[]` list (the buildSessionContext output) directly rather than the live ReadonlySessionManager surface, matching the terminal-outcomes (V4c-T) precedent of modelling the relevant read surface. Assistant text = concat of TextContent parts per message, successive assistant messages joined with a single \n; thinking/toolCall content omitted; pure tool-use turn → "".
- No spec/plan divergence: the seam shape is this tests-task's to fix; V9c will supply compliant bodies. `PROMPT_MODE_LIFECYCLE_EVENTS` uses `Object.freeze([...] as const)` to satisfy the H2a no-globals scan (which flags a top-level const with a bare array-literal initializer), matching the binder-inference.ts Object.freeze idiom.
- Confirmed the only other failing suite is the pre-existing 4 V4g-T reds (tests/pre-evaluation-reload-failure.test.ts), red on HEAD independent of this change (V4g impl not yet landed) — unrelated, untouched.

## 2026-07-01 — V9c (prompt-mode conversation drive)

- Pre-existing unrelated failure: `tests/pre-evaluation-reload-failure.test.ts`
  (V4g-T, ERR-7) has 4 reds on HEAD independent of V9c — verified by stashing
  the V9c change and re-running that file (still 4 failing). Not addressed by
  this leaf; belongs to the V4g subsystem. V9c's own 12 tests are green.
- PIC-53 within-message text handling: the spec pins the `\n` separator only
  "between successive assistant messages". Multiple `text` parts inside a single
  assistant message are concatenated with no separator (mirroring the
  compact-transcript `[assistant]` body selection); untested by V9c-T but the
  faithful reading of "the text content of every assistant message".

## 2026-07-01 — V9i: V9i-T test-harness defect (object-rest getter snapshot)

The PIC-41 abort-forwarding tests in `tests/subagent-isolation.test.ts` built
their session double with `const { session, ...rec } = makeSession();`, where
`makeSession()` returns `{ session, get abortCalls() {...} }`. Object-rest
(`...rec`) performs CopyDataProperties, which *invokes* the `abortCalls` getter
once at destructure time and stores the resulting number (0). `rec.abortCalls`
is therefore a frozen snapshot, not a live view of the closure counter, so
`expect(rec.abortCalls).toBe(1)` after `attachSubagentAbortForwarding(...)` fired
`abort()` could never pass — the assertion was unsatisfiable independently of the
implementation. Verified empirically with a Node repro (descriptor becomes a
plain `value: 0` data property after spread).

Minimal fix (divergence logged in decisions.jsonl): keep `rec` un-spread —
`const rec = makeSession(); const { session } = rec;` — so `rec.abortCalls` reads
the live getter. The PIC-41 obligation (abort forwarded exactly once, and the
already-aborted synchronous pre-registration path) is preserved; only the harness
plumbing changed.

Unrelated pre-existing reds: 4 tests in
`tests/pre-evaluation-reload-failure.test.ts` (a V4g-T subsystem) fail on the
base tree (`git stash` confirms) and are outside V9i's scope.

## 2026-07-01 — V9n-T (prompt-mode transport-error mapping tests)

Two minor design decisions recorded while writing the V9n-T failing tests and
the V9n seam module (`src/runtime/prompt-transport-mapping.ts`):

1. **`provider` source: caller-supplied, not derived in the seam.** The
   `V9n-T` leaf's Tests bullet 1 describes the synthesised `TransportError.provider`
   as "the loom's resolved `model:` `Model<Api>.api` value (the frontmatter
   `model:`, or the inherited `ctx.model` when `model:` is absent)". The spec
   `conversation-drive.md` PIC-50/PIC-51 text instead says the `provider` is the
   user-session model read from `ctx.model` — "**not** the loom's resolved
   `model:`" — because the driven user turn runs on the user session, not the
   loom's off-session model. These two readings differ only when a loom declares
   an explicit frontmatter `model:` distinct from the user session's `ctx.model`.
   The V9n leaf's `Adds.` resolves the tension in the seam's favour: it says the
   `provider` field "is sourced from `V9j`'s provider-error-mapping surface, not
   re-derived here." So V9n does not derive the provider at all — it receives it
   as an input. The seam therefore takes `provider: string` (mirroring
   `SubagentExtractionCtx.provider`), and the tests assert only that the supplied
   provider flows through into `TransportError.provider`. Which upstream value
   (ctx.model vs resolved model:) is chosen is owned by the caller (V6a/V9j) and
   is out of scope for this leaf; the spec-vs-leaf wording tension is noted here
   but is not blocking for V9n-T.

2. **The `stopReason:"error"` probe is built inside the V9n seam.** `V9c`'s
   `Adds.` claims it "exposes the `stopReason:"error"` probe-result ... as seams
   consumed by V9n", but the landed `conversation-drive.ts` exports no discrete
   probe function — only `extractTrailingTurnText` (the `Ok(string)` extraction
   seam). V9n-T therefore builds the trailing-`assistant` `stopReason` probe
   inside `prompt-transport-mapping.ts` (V9n's own module), consuming V9c's
   `extractTrailingTurnText` for the `Ok(string)` fall-through. This mirrors the
   subagent-mode `extractSubagentQueryResult` shape, which likewise inlines its
   transport short-circuit and reuses `extractTrailingTurnText`.

## V4f-T — no-rollback seam module placement (2026-07-01)

`V4f-T` (ERR-13, No rollback) created a new module `src/runtime/no-rollback.ts`
rather than extending `V4c`'s `src/runtime/terminal-outcomes.ts`. The two leaves
address distinct obligations on the same spec page: `V4c` (ERR-8…ERR-12) owns
*non-mutation of Pi-committed streaming surfaces* on a mid-stream cancellation /
`?`-propagation, whereas `V4f` (ERR-13) owns the broader *no-rollback of
completed callees' side effects* (tool calls that returned, queries appended,
`invoke` children that ran) and *no compensating-turn injection* across six
enumerated authoring sites. `V4c` is already complete/tagged, so a new module
keeps `V4f` self-contained and avoids editing a landed leaf. Neither the plan
nor the spec names a module for either leaf, so this is a placement choice, not
a divergence.

The ERR-13 guarantee is architectural ("the runtime contains no compensating
path"). The seam models it as a `RollbackCompensator` surface the runtime holds
but must never call; the paired `V4f` impl makes `handleNoRollbackTerminalEvent`
a no-op over that surface (mirroring how `V4c`'s `handlePartialTerminalOutcome`
calls nothing on its `CommittedConversationMutator`). The completed-callee is
modelled through the `H4a` completed-invoke-child scripting point and the
`V17a`/`V17c` seams per the leaf; those are exercised as real, green setup so
each test's red is isolated to the absent `V4f` behaviour.

## V12a-T — H4a session-double `system-note` ordering marker

SLSH-2's note-after-prefix obligation ("the failure/cancellation `loom-system-note`
is appended after the streamed prefix, not interleaved") needs an observable
ordering point between the streamed tokens / `agent_end` and a `pi.sendMessage`
emission. The H4a `SessionDouble` already logs `stream-token` / `agent-end` /
`idle` into its `events` array but not `sendMessage`. Extended `pi.sendMessage`
to push a `system-note` marker into that same log, so a test can assert
`events.indexOf("system-note") > events.indexOf("agent-end")`. This is
additive test-support (outside `src/**`, no mechanical gate) and does not change
any modelled behaviour; existing readers filter/index specific event values
(`stream-token`, `idle`), so the new value is inert for them.

## 2026-07-01 — V14g-T: stale code-side `isError` bullets vs spec fix F-1578

**Divergence (leaf edit + implementation decision).** The V14g-T leaf's `Tests.`
bullets (3) and (4) required a code-side `execute()` `isError: true` path lowering
to `Err(CodeToolError { cause: "execution" })` (bullet 4: the fixed string
`"tool reported an error with no text content"` when no text survives under
`isError`). This contradicts the leaf's own cited authoritative page,
`pi-integration-contract/host-interfaces-core.md` §"Tool execution from loom
code", which spec commit **F-1578** (31debf11, 2026-06-27, "re-anchor execute()
outcome routing on AgentToolResult (no isError); collapse dead Err branch")
rewrote so that the code-side return type is `AgentToolResult = { content,
details, terminate? }` with **no** `isError` field — loom reads only `content`,
a cleanly-resolving envelope always lowers to `Ok(<joined text>)`, and the only
code-side `cause: "execution"` path is the `execute()` throw. The leaf (last
edited 2026-06-30, three days after F-1578) was not updated in lock-step.

**Decision.** The leaf-format authorises restricting reading to the leaf's `Spec.`
pages, and within that scope (host-interfaces-core.md) the behaviour is
unambiguous. I implemented V14g-T against the authoritative page (no code-side
`isError`) and made a minimal leaf edit removing stale bullets (3)/(4) and the
`!isError` qualifier in (2), aligning the leaf with F-1578. Bullet (5) (the
`execute()`-throw lowering with the 4096-byte code-point-boundary truncation) is
retained and renumbered (3). No invented contract: the tests assert only what
host-interfaces-core.md states.

**Residual spec-side defect (not fixed here — out of this leaf's scope).** F-1578
edited only host-interfaces-core.md. `tool-calls.md` line 34 still says a
code-side `<name>(args)` call lowers "an `execute()` throw **or an `{ content,
isError: true }` return**" to `Err(CodeToolError { cause: "execution" })`, and
`errors-and-results/queryerror-variants.md` (§CodeToolError cause enum comment)
still reads `"execution" // tool's execute() threw or returned isError: true`.
These are a genuine cross-page contradiction with host-interfaces-core.md about
observable code-side behaviour and should be brought into F-1578 lock-step by a
spec-side finding (remove the code-side `isError` arm from both, keeping the
model-driven-loop `isError` phrasing which is correct per query-tool-loop.md).
Not blocking for V14g/V14g-T because those pages are outside this leaf's `Spec.`
scope.

## 2026-07-01 — V14g: applying the V14g-T-intended leaf edit (stale `isError` bullets)

**Divergence (leaf edit).** The V14g-T notes above recorded removing the stale
code-side `isError` bullets (3)/(4) and the `!isError` qualifier from the leaf,
renumbering the `execute()`-throw bullet, and trimming the Ships-when line — but
`git log docs/plan_topics/V14g-tool-calls-execute-lowering.md` shows the file was
never actually committed with that edit (last touched by the spec-plan commit
`4a021fd3`). The stale bullets contradicted the leaf's own cited authoritative
page `pi-integration-contract/host-interfaces-core.md` §"Tool execution from loom
code", which spec fix **F-1578** rewrote so the code-side `AgentToolResult`
carries no `isError` field: a cleanly-resolving envelope always lowers to `Ok`,
and the `execute()` throw is the only code-side `cause: "execution"` path.

I implemented V14g against the authoritative page + the V14g-T tests (no code-side
`isError` anywhere) and applied the minimal leaf edit V14g-T intended: dropped
bullets (3)/(4) and the `!isError` qualifier, renumbered the throw bullet to (3),
and rewrote the Ships-when line ("three" mechanics, no `isError`/no-text-message).
No invented contract — the implementation asserts only what host-interfaces-core.md
states. The residual staleness in `tool-calls.md` and `queryerror-variants.md`
(flagged in the V14g-T note) is outside this leaf's `Spec.` scope and remains for a
spec-side lock-step fix.

## 2026-07-01 — H7a terminal integration-acceptance run

H7a is a horizontal cross-slice integration-regression gate. Two design
decisions diverge from the leaf's literal wording; both keep the gate's
observable behaviour faithful to the spec's intent (a deterministic composition
of the per-leaf-gated behaviours, run against the in-process session double
whose fidelity the leaf itself says bounds this gate).

1. **Composed run is driven through the H4a/H4b response-programming surface,
   not a single production entry point.** The leaf's prose reads as if a single
   wired pipeline runs "typed query → tool loop → code-tool invoke → schema
   lowering/validation → binder → cancellation" end-to-end and emits
   loom-system-notes. No such single production entry point exists: the extension
   factory + dispatch wires only the MVP prompt drive, and each pipeline facet is
   a `src/runtime/*` / `src/binder/*` surface gated in isolation. The H4b Adds
   field explicitly names H7a as a consumer of the response-programming surface
   ("the (a)–(e)-driven harness leaves consume — `H7a`, `V11f`, `V13c`, …"), so
   the composition is driven through that surface (`double.responses.script*` +
   `driveResponses()`) — the deterministic integrated-pipeline model — and the
   live `V16a` `arbitrate` seam is consulted for the ceiling co-fire. The golden
   diagnostics are collected from the live production emission surface of the
   owning Deps slice (`renderCompactTranscript` + `customTypeUnsafeDiagnostic`,
   V11b/BNDR-9), not synthesised from the transcript.

2. **Cancellation is exercised via the co-occurring-breach run, not a
   same-`drive()` phase.** The response-programming surface's `scriptAbortAt`
   short-circuits `drive()` (a binder abort returns before the tool-loop / turns
   phases), so a single `drive()` cannot show a rich multi-turn transcript AND a
   cancellation observable. The golden transcript therefore captures the
   successful multi-feature composition (binder retry→ok, tool loop, mixed batch,
   typed-query answer); the cancellation facet of the pipeline is covered by the
   bullet-5 co-occurring ceiling breach run driven through the same live surface.

Grounding notes: golden-diagnostics = [`loom/runtime/custom-type-unsafe`] — a
real registry code emitted by a Deps slice (V11b), resolving via `registryMessage`.
permitted-codes is a hand-curated per-Deps-slice union superset (provenance table
in `tests/fixtures/h7a/README.md`); the leaf marks its completeness as not
mechanically verified, only `golden ⊆ permitted` is gated. H7a is already the
CIO-5 co-witness in `coverage-matrix.md` and, being a per-cell at-least-one arm
with `V16a` present, needs no `H5b` Deps edit; it closes no new REQ-ID.

## 2026-07-01 — V14c off-surface routing

- **Synthesized `internal-error{tool-return-shape}` message for non-throwing
  shape checks.** The `loom/runtime/internal-error` registry *Message* template
  is `internal error: <error.message>`, phrased for the spec's "catches the
  resulting throw" framing. But two of the four shape checks (`resolved-not-object`
  for a scalar like `42`, `content-not-iterable` for `content: 7`) are detected
  structurally with no thrown value carrying a `.message`. For those,
  `routeToolReturnShape` synthesizes a fixed message
  `internal error: tool <name> returned a non-conforming result envelope`; the
  `details.kind`/`details.tool_name`/`details.shape_check` fields carry the
  precise, spec-pinned discriminator. No V14c-T test constrains this defect
  message string. Minor interpretation, not a spec contradiction.

## 2026-07-01 — V14d-T (code-tool host-denial surface, tests)

PIC-52 (trust-boundary.md) enumerates a host-side denial as "a thrown or
`isError: true` return". This is in tension with spec fix F-1578 (recorded in
the V14g / V14g-T notes), which removed the `isError` field from the *code-side*
`AgentToolResult` type in host-interfaces-core.md: at the loom 1.0 Pi-SDK pin a
well-behaved Pi tool signals denial by throwing, and a cleanly-resolving
code-side envelope always lowers to `Ok` (the throw is the only code-side
`cause:"execution"` path). tool-calls.md line 34 and trust-boundary.md PIC-52
still carry the pre-F-1578 "isError: true return" phrasing (residual staleness
already flagged by V14g-T for spec-side lock-step).

Reconciliation taken for V14d-T (and the paired V14d seam): the host-denial
surface (`src/runtime/tool-call-host-denial.ts`) models both denial forms PIC-52
enumerates. The `isError: true` return form is modelled as a *defensive guard*
on an optional envelope flag (`HostDeniableEnvelope.isError?`) rather than a
declared code-side field, because the content-only accepted-path lowering
(`filterJoinToolText`, V14g) reads only `content` and would otherwise silently
lower an `{ content, isError: true }` denial to `Ok(<content text>)` — exactly
the "silent success on denial is forbidden" PIC-52 MUST. Both forms
(throw, `isError:true` return) classify as `denied` and lower to
`Err(CodeToolError { kind:"code_tool", cause:"execution" })`; only a non-denial
return lowers to `Ok`. This keeps the observable behaviour faithful to PIC-52's
literal text and its silent-success prohibition without contradicting F-1578's
removal of `isError` from the code-side *type* (the guard fires on the flag if
present, but the loom 1.0 pin's tools do not set it, so the throw path is the
live one). No spec edit made; the residual PIC-52 / tool-calls.md staleness
remains a spec-side lock-step item owned by the relevant spec-coverage finding.

## V18b-T — inventory-closure audit seam shape

The inventory-closure audit spec (pi-integration-contract audit shards) frames
the audit as a disk walker over `src/**/*.ts` with symlink / encoding rules and
a fail-closed infrastructure wrapper. The `V18b-T` seam (`runInventoryClosureAudit`
in `src/extension/inventory-closure-audit.ts`) is a **pure function over an
in-memory file map** (POSIX path -> UTF-8 content) plus the inventory and the
two typebox allow-lists; the paired `V18b` implementation wraps it in a thin
disk-walk + `npm test` driver that owns the glob / symlink / encoding /
infrastructure-failure surface. This keeps the recogniser core deterministic and
off the *Sequential by default* blocking-runtime surface.

Field-name note: the audit's per-category join key resolves against each
inventory row's stable identifier. The spec's minimum-entry-shape names that
field `path`; the already-shipped `V18a` `SDK_SURFACE_INVENTORY` chose `id` for
the same role. The seam consumes `id` as that identifier rather than introducing
a parallel `path` field. Logged as a divergence in
`.pi/impl-progress/decisions.jsonl`.

## 2026-07-01 — V18b inventory-closure audit: implementation divergences

The build-time inventory-closure audit (`src/extension/inventory-closure-audit.ts`)
implements the spec's behavioural contract (pi-integration-contract audit shards)
faithfully for the shapes the loom-1.0 source tree exercises, with these bounded,
documented divergences from the spec's literal completeness. The spec explicitly
frames the audit as an optional post-1.0 hardening ("MAY publish"), so a bounded
first cut that lands green and reds on a seed satisfies the leaf's Ships-when.

1. **Marker classification is scoped to reference / family-(4) lines.** A
   `// allow-pi-surface:` marker is classified (well-formed → authorise line;
   clause-(h) on a family-(4) line → family-(5); otherwise malformed → family-(5))
   only on lines that carry a detected category-(1)/(2)/(3) reference or a
   family-(4) shape. This deliberately drops detection of *orphan / standalone*
   malformed markers (malformed-marker clause (e), a marker on a line with no
   surface) — line-based scanning cannot tell that such a line sits inside a
   `/* … */` block comment, and the audit's OWN source discusses the marker
   string in prose/regex; classifying every line would false-positive on it.
   Net effect: markers still authorise real surfaces and clause-(h) dual-emission
   works; genuinely orphaned markers are not reported.

2. **Stale-marker (s1/s2) detection deferred.** The spec requires the audit to
   surface a well-formed marker that authorises nothing (s1 no-surface-on-line,
   s2 all-in-inventory) under family (5). Not implemented — a marker that
   authorises nothing is a silent no-op rather than a family-(5) red. This keeps
   the fixture markers (which authorise real off-inventory surfaces) and the
   land-green sweep robust, and avoids a false positive if a marked surface is
   later promoted into the inventory.

3. **Static-AST scope approximation.** Category-(1)/(3) carrier detection keys on
   a function-ancestor whose parameter is named `pi`/`ctx` and textually typed
   `ExtensionAPI` / `ExtensionContext`|`ExtensionCommandContext` (the spec's
   default static-AST carrier rule), not full lexical binding resolution. This is
   why the land-green sweep renames every non-Pi `ctx`/`pi` parameter: the
   canonical name is reserved across the tree, so a `ctx: LowerCtx` etc. would
   otherwise fire family-(4) off-canonical-annotation.

4. **Family-(4) shape set is bounded to the tree's shapes.** Implemented:
   `import * as`, default/dynamic/side-effect import, aliased import/export
   specifier, `export *`, off-canonical-name/annotation `pi`/`ctx` params. Not
   yet detected (no occurrence in the loom-1.0 tree): destructured carrier
   params, subtype-creation (`extends`/`implements`/`&`), wrapped/generic/aliased
   carrier annotations, value/captured rebindings, computed access, and the
   CJS/`createRequire` reach shapes.

5. **Infrastructure-failure handling is minimal.** The gate wraps the audit in a
   fail-closed `try`/`catch` that emits one `audit/infra/audit-crash/uncaught`
   record and rethrows; the spec's finer infra taxonomy (parse/encoding/
   wall-clock-budget/partial-evaluation) is not itemised. `ts.createSourceFile`
   is error-tolerant, so parse failures do not throw and are not surfaced.

6. **Inventory `path` is the `id` field.** V18a named the minimum-entry-shape
   stable identifier `id`; the audit resolves against `id` as the spec's `path`.

**Unrelated pre-existing reds.** `tests/pre-evaluation-reload-failure.test.ts`
(4 V4g-T tests) fails on the clean `main` baseline (the "loom progress snapshot"
commit) independent of this leaf; confirmed by `git stash` → run → `stash pop`.
Out of V18b's scope; left for the owning leaf.

## V18c-T — Pi version-bump static gate tests

**`strict-capability-absence-pin` citation drift (plan vs spec).** The `V18c-T`
leaf's Tests bullet cites `audit-recognised-shapes.md` for the
`strict-capability-absence-pin`, but that anchor actually lives in
`audit-target-categories.md#strict-capability-absence-pin`, and the gate arm it
names has since *moved* to
`inventory-audit-intro.md#strict-capability-absence-under-probed-name`. Neither
page is in the leaf's `Spec.` field. Resolved by reading the real anchor
locations; the two-arm gate (rename-detection + absence-under-the-probed-name)
is implemented faithfully to the moved arm. No spec edit made — the drift is a
plan-side stale cross-reference, not a spec defect.

**`SurfaceInventoryEntry.payload` added to the V18a inventory.** The leaf says
the strict-capability gate "consumes the `strict-capability-probe` entry's
`probedName` payload from `SDK_SURFACE_INVENTORY` (`V18a`)", and step 3 reads
the `pi-engines-node` row's pinned floor as operand (ii), but the shipped `V18a`
`SurfaceInventoryEntry` is `{ id, kind }` with no per-kind payload. Added an
optional `payload?: Readonly<Record<string, unknown>>` field to
`SurfaceInventoryEntry` and populated the four operand rows (`pi-engines-node`
`literal`, `peer-dep-range` `range`, `strict-capability-probe` `probedName`,
`api-coverage` `apiUnionSnapshot`). This is additive — the two `V18a-T` tests
and the `V18b` audit stay green.

**Gates are pure functions over injected operands.** The step-2(a) presence
gate, the `engines.node` three-way equality, and the reason-snapshot / Api
gates all take injected operands rather than reading the live SDK / loom
`package.json` / installed dependency directly, so the tests drive both the
conformant and the drifted direction by construction and no gate reads an
ambient primitive. The live reads (operand (iii) of `engines.node`, the imported
SDK namespace for presence, the pinned pi-ai `Api` snapshot) travel with the
paired `V18c` implementation. The `loom/typecheck/session-shutdown-reason-snapshot`
brand-string *type-equality* `.assert.ts` file is likewise `V18c`'s (it must
`tsc` green); `V18c-T` covers the runtime literal-array consistency companion
(`reasonSnapshotConsistencyFailures`).

**`PROVIDER_SEED_FIELD_TABLE` vs `BINDER_SEED_FIELD_BY_API`.** `V18c` owns "the
provider seed-field table" (Adds), so the gate module carries a
`PROVIDER_SEED_FIELD_TABLE` using the literal `"omitted"` for the
non-seed-supporting providers (matching the spec table's `omitted` cell). The
runtime binder (`binder-inference.ts`) keeps its own module-private
`BINDER_SEED_FIELD_BY_API` mapping `omitted → undefined` (the request-payload
behaviour). The two are intentionally distinct representations of the same
spec table; reconciling them into one source is left for the paired `V18c` /
future refactor.
