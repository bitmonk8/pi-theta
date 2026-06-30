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
