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
