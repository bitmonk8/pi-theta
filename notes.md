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
