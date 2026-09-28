---
id: PTQ-1685
title: The `QueryError` → `RuntimeEvent` field projection (kind/message plus the guarded `attempts`/`tokens_used` carry-over) is hand-built independently in `buildDiscardEvent` (query-discard.ts) and in `emitTopLevelErrNote`'s boundary arm (production-theta-producer.ts), and bug 0399 already records the two drifting apart before the fix re-synced them by copy
lens: D1
status: open
verdict: confirmed
locations:
  - src/runtime/query-discard.ts:81-108
  - src/extension/production-theta-producer.ts:399-428
sites: 2
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The `QueryError` → `RuntimeEvent` field projection (kind/message plus the guarded `attempts`/`tokens_used` carry-over) is hand-built independently in `buildDiscardEvent` (query-discard.ts) and in `emitTopLevelErrNote`'s boundary arm (production-theta-producer.ts), and bug 0399 already records the two drifting apart before the fix re-synced them by copy

## Observation
Two places in `src/` project a `QueryError` union value onto the group-A `RuntimeEvent` shape by hand. `buildDiscardEvent` (src/runtime/query-discard.ts, the QRY-20 discard-observability builder) copies `kind`/`message` from the error verbatim, stamps `discard_site`, optionally `query_site`, and carries `attempts`/`tokens_used` through `"<field>" in error && typeof … === "number"` guards. `emitTopLevelErrNote`'s absent-event arm (src/extension/production-theta-producer.ts) first walks `invoke_callee` wrappers to the leaf, then builds the same five base fields from the leaf and repeats the same two guarded carry-overs, with a comment stating the arm is "exactly `buildDiscardEvent`-shaped" and that the intent was to "reuse the shared note builder rather than forking a second RuntimeEvent constructor". No function is shared between the two: the projection rule (which leaf fields ride the event, under which guard) exists twice. Bug 0399 (docs/bugs/0399-boundary-event-omits-attempts-tokens-masked.md) records the earlier state in which the producer-side projection lacked the `attempts`/`tokens_used` arm while `buildDiscardEvent` had it, and its fix (0.393.0) restored agreement by re-typing the rule at the producer rather than by sharing it.

## Evidence

Way A — the QRY-20 discard builder. src/runtime/query-discard.ts:81-108:
```ts
export function buildDiscardEvent(
  error: QueryError,
  input: DiscardEmitInput,
): RuntimeEvent {
  // …
  const event: RuntimeEvent = {
    kind: error.kind,
    theta: input.theta,
    invocation_id: input.invocationId,
    message: error.message,
    discard_site: input.discardSite,
    occurred_at: input.occurredAt,
  };
  if (input.querySite !== undefined) {
    event.query_site = input.querySite;
  }
  if ("attempts" in error && typeof error.attempts === "number") {
    event.attempts = error.attempts;
  }
  if ("tokens_used" in error && typeof error.tokens_used === "number") {
    event.tokens_used = error.tokens_used;
  }
  return event;
}
```

Way B — the SLSH-4 top-level boundary arm. src/extension/production-theta-producer.ts:399-428:
```ts
    const resolvedEvent = this.#buildGroupAEventOrFallback(
      content,
      (): RuntimeEvent =>
        event ??
        (() => {
          let leaf: QueryError = error;
          while (isInvokeCalleeError(leaf)) {
            leaf = leaf.inner;
          }
          const built: RuntimeEvent = {
            kind: leaf.kind,
            theta: `/${thetaName}`,
            invocation_id: this.#input.root.idSource.newInvocationId(),
            message: leaf.message,
            occurred_at: this.#input.root.clock.wallNow(),
          };
          // Bug 0399 constraint 2: preserve the leaf's own `attempts`
          // (validation) / `tokens_used` (context_overflow) exactly
          // `buildDiscardEvent`-shaped (query-discard.ts) — no other kind
          // defines these fields, and `tokens_used` is number-only so a `null`
          // provider count stays canonically absent rather than leaking `null`.
          if ("attempts" in leaf && typeof leaf.attempts === "number") {
            built.attempts = leaf.attempts;
          }
          if ("tokens_used" in leaf && typeof leaf.tokens_used === "number") {
            built.tokens_used = leaf.tokens_used;
          }
          return built;
        })(),
```
The stated intent immediately above it, src/extension/production-theta-producer.ts:394-397:
```ts
    // threads its exact value here, slash-invocation.md:63's "same value"
    // holds literally instead of by reconstruction. Mirror the renderer's leaf
    // walk and reuse the shared note builder rather than forking a second
    // RuntimeEvent constructor.
```

The guarded carry-over exists exactly at these two sites and nowhere else —
`$ grep -rn "\"attempts\" in " src --include=*.ts` → 2 hits:
```
src/extension/production-theta-producer.ts:420:          if ("attempts" in leaf && typeof leaf.attempts === "number") {
src/runtime/query-discard.ts:101:  if ("attempts" in error && typeof error.attempts === "number") {
```

Every `RuntimeEvent` construction site in `src/` (counted by the required `invocation_id:` key) —
`$ grep -rn "invocation_id:" src --include=*.ts` → 8 hits:
```
src/extension/binder-run.ts:843:        invocation_id: ticket.invocationId,
src/extension/execution-status/progress-tool.ts:307:      ? { theta: attributed.theta, invocation_id: attributed.invocationId }
src/extension/execution-status/progress-tool.ts:335:      invocation_id: root.invocationId,
src/extension/production-theta-producer.ts:411:            invocation_id: this.#input.root.idSource.newInvocationId(),
src/extension/teardown-emission.ts:87:        invocation_id: entry.invocationId,
src/runtime/query-discard.ts:93:    invocation_id: input.invocationId,
src/runtime/query-tool-loop.ts:812:    invocation_id: config.invocationId,
src/runtime/runtime-event-channel.ts:39:  invocation_id: string;
```
Of these, only query-discard.ts:93 and production-theta-producer.ts:411 project from a `QueryError` union value (binder-run.ts:843 projects a `BinderFailureSurface`; teardown-emission.ts:87 and progress-tool.ts:307/335 build shutdown/progress payloads; query-tool-loop.ts:812 `buildValidationEvent` is the typed origin-event builder over an already-narrowed `ValidationError` and reads `error.attempts` unguarded). So the union-projection rule has exactly two sites.

Drift that already happened — docs/bugs/0399-boundary-event-omits-attempts-tokens-masked.md, "Affected" (verified at `d63c5148`, v0.382.0):
```
  - `src/extension/production-theta-producer.ts:1634–1651` —
    `emitTopLevelErrNote`'s boundary construction: `kind`, `theta`,
    `invocation_id`, `message`, `occurred_at` only; no `attempts` /
    `tokens_used` / `masked` arm, though the leaf is in scope and carries them.
  - `src/runtime/query-discard.ts:171–196` — `buildDiscardEvent`, the sibling
    path's builder, which DOES preserve `attempts` and `tokens_used` from the
    same variants (…): the `display: false` operator channel
    is richer than the `display: true` user-facing one for the same error.
```
and its Fix (0.393.0):
```
  - `src/extension/production-theta-producer.ts` — `emitTopLevelErrNote`'s
    ABSENT-event (boundary-built) arm preserves `attempts` (validation) /
    `tokens_used` (context_overflow) from the leaf EXACTLY
    `buildDiscardEvent`-shaped (`"attempts" in leaf && typeof … === "number"`;
    `tokens_used` number-only so a `null` count stays canonically absent).
```

Current remaining divergences between the two ways (mechanism, not spelling): Way B walks `invoke_callee` wrappers to the leaf before projecting (`while (isInvokeCalleeError(leaf))`), Way A projects the wrapper itself, so for a wrapped `context_overflow` the two carry different `kind`/`message` and Way A's `"tokens_used" in error` guard tests the wrapper, not the leaf; Way A stamps `discard_site`/`query_site` from its input, Way B stamps neither; Way A takes `occurred_at`/`invocation_id` from its input, Way B mints fresh ones.

Reachability of each way (stated, not hidden):
`$ grep -rn "buildDiscardEvent\|emitDiscardObservability" src extensions tools --include=*.ts --include=*.mjs` → 5 hits:
```
src/extension/production-theta-producer.ts:417:          // `buildDiscardEvent`-shaped (query-discard.ts) — no other kind
src/runtime/query-discard.ts:21:// behaviour-bearing function: `emitDiscardObservability` emits the
src/runtime/query-discard.ts:81:export function buildDiscardEvent(
src/runtime/query-discard.ts:116:export function emitDiscardObservability(
src/runtime/query-discard.ts:129:  const event = buildDiscardEvent(input.outcome.error, input);
```
`$ grep -rn "buildDiscardEvent\|emitDiscardObservability" tests --include=*.ts` → 12 hits; first 10:
```
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:20:// `src/runtime/query-discard.ts:190–194` `buildDiscardEvent` preserves
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:28://        `attempts`/`tokens_used` from the leaf exactly `buildDiscardEvent`-
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:181:describe("bug 0399 (ii) — the boundary-built RuntimeEvent preserves attempts/tokens_used from the leaf (buildDiscardEvent-shaped)", () => {
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:197:    // preserved buildDiscardEvent-shaped.
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:223:    // sibling `buildDiscardEvent` is number-only (query-discard.ts:193), so a
tests/query-discard.test.ts:32:  buildDiscardEvent,
tests/query-discard.test.ts:33:  emitDiscardObservability,
tests/query-discard.test.ts:126:    emitDiscardObservability(
tests/query-discard.test.ts:148:    emitDiscardObservability(
tests/query-discard.test.ts:160:    emitDiscardObservability(emitInput({ ok: true }), deps);
```
Way A's only callers are tests (the QRY-20 runtime half is not yet wired to a production discard site); Way B is the live SLSH-4 boundary emission. Way A is nevertheless the documented template Way B was re-aligned to (bug 0399 §Fix, the b0399 witness's describe title, and the in-code comment at :417), which is what makes the pair owe each other consistency.

Self-inconsistency statement: no written rule exists that names one `QueryError`→`RuntimeEvent` projection function; the anchor is self-inconsistency plus the cost cited below.

## Why this is a problem
The projection rule — which `QueryError` variant fields ride a group-A `RuntimeEvent`, and under which guard (`typeof … === "number"`, so a `null` overflow count stays absent) — is maintained at two sites with no shared code, and the repository already paid for that once: bug 0399 found the boundary arm silently missing the `attempts`/`tokens_used` carry-over that the sibling builder had, with `content` and `details.event` disagreeing about the same fact on the user-facing note. The fix restored agreement by copying the rule and annotating it "exactly `buildDiscardEvent`-shaped", so the next change to the rule (a new variant field the shape pins as populated, a changed guard, or wiring the QRY-20 discard half to a real production site) has to be found and applied at both sites by a maintainer reading a comment, exactly the mechanism that failed before. The in-code intent at production-theta-producer.ts:395-397 ("reuse the shared note builder rather than forking a second RuntimeEvent constructor") describes the shape the code does not have. The two sites also currently answer "which object is projected" differently (wrapper vs. leaf), so a maintainer reasoning from one site about the other's `kind`/`tokens_used` for a wrapped overflow gets the wrong answer.

## Suggested direction (non-binding, optional)
Unproven hypothesis: one leaf-field projection helper (`QueryError` → the `kind`/`message`/`attempts?`/`tokens_used?` slice of `RuntimeEvent`), with each site adding only its own stamps (`discard_site`/`query_site` at the discard site; the wrapper walk and fresh ids at the boundary), so the guarded carry-over exists once. Whether the discard side should also walk to the leaf is a QRY-20 question the fix stage owns.

## False-positive check
- Clone-map check: the injected clone map lists no groups for src/runtime/query-discard.ts; no group covers this observation. The token-similar span is the two 6-line guard blocks; the claim here is the divergent mechanism around them (leaf walk vs. wrapper, site stamps, id/clock provenance) plus the recorded drift, not the copy itself.
- D9-affinity check: not a wrong-home claim — neither builder is argued to belong in the other's file; the claim is that the shared rule has no single home at all.
- D2-deadness check: both declarations are live by the repository's rule (test-only callers are not dead): Way B is on the production SLSH-4 path; Way A is reached by tests/query-discard.test.ts and tests/b0399-boundary-event-attempts-tokens-masked.test.ts (12 hits above) and is the documented template for Way B. Reachability of Way A is stated above rather than assumed.
- Prior filings: `$ grep -rln "buildDiscardEvent\|emitTopLevelErrNote" quality/` → 14 hits:
```
quality/intake/qw20260928124659-d1-01-invoke-callee-wrapper-minted-with-and-without-slsh5-hop.md
quality/intake/qw20260928124659-d1-01-queryerror-to-runtimeevent-projection-two-hand-built-sites-0399-drift.md
quality/issues/PTQ-1608-production-theta-producer-post-split-residual.md
quality/resolved/PTQ-0153-module-header-three-collaborators-agentsession.md
quality/resolved/PTQ-0164-discard-emit-input-form-unread.md
quality/resolved/PTQ-0190-tool-lowering-sink-runtime-event-unread.md
quality/resolved/PTQ-0197-ledger-errnote-call-site-count-stale.md
quality/resolved/PTQ-1150-production-theta-producer-fourteen-concerns.md
quality/resolved/PTQ-1285-production-theta-producer-residual-ten-concerns.md
quality/resolved/PTQ-1443-system-note-channel-fallback-cloned.md
quality/resolved/PTQ-1533-qry19-parse-check-homed-in-runtime.md
quality/REVIEW_LOG.md
quality/tmp/qw20260921183818/D8/shard-13.notes.txt
quality/tmp/qw20260923145222/D9/shard-08.notes.txt
```
  Read: PTQ-0164 (resolved; the unread `form` member of `DiscardEmitInput` — a different member, and it explicitly declines to claim against `buildDiscardEvent` itself); PTQ-1443 (resolved; the system-note fallback-channel clone — a different mechanism); PTQ-1608 (open D9 breakdown of the producer host — a size claim, not this pair); the sibling intake `…invoke-callee-wrapper-minted-with-and-without-slsh5-hop` (the `invoke_callee` wrapper/hop-recording split, which touches `emitTopLevelErrNote` only as the chain consumer); PTQ-1150/1285/0153/0190/0197/1533 name the function without citing the projection rule. None covers this pair.
- Behaviour-change guard: no bug is filed here; the wrapper-vs-leaf difference is cited only as what a maintainer misreads across the two sites.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above (bug 0399's recorded drift).

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Both ways match at the cited lines: buildDiscardEvent is at query-discard.ts:81-108, and the emitTopLevelErrNote absent-event arm is at production-theta-producer.ts:399-428, walking to the leaf before the same two guarded carry-overs, with the "reuse the shared note builder" comment at :394-397. The stated searches reproduce line for line: `"attempts" in` gives 2 hits, `invocation_id:` gives 8, the src/extensions/tools discard grep gives 5, and the tests grep gives 12 with the same first 10. The quality/ grep gives 15 hits, not 14; the extra one is quality/tmp/qw20260928124659/D1/shard-18.notes.txt, this wave's own notes, written at 15:57, after the candidate at 15:52, so it is not a fabrication. clone-scan map on query-discard.ts shows no clone groups, so this is not D4's. The cost is real: docs/bugs/0399 Affected (:36-44) records the boundary arm missing attempts/tokens_used while buildDiscardEvent had them, and its Fix (0.393.0, :211-216) re-synced the rule by copying it "EXACTLY buildDiscardEvent-shaped". Not a duplicate: PTQ-1608 is a D9 size breakdown, PTQ-0164 and PTQ-1443 cover other mechanisms, and the sibling D1 intake is about invoke_callee hop recording (triage: claude-opus-5-5)
verdict: confirmed — RATIFIED: one QueryError→RuntimeEvent field-projection rule. Export a helper from src/runtime/query-discard.ts (e.g. `projectQueryErrorFields(error)` → `{ kind, message, attempts?, tokens_used? }`, carrying attempts/tokens_used under the existing `"<f>" in error && typeof … === "number"` guards). buildDiscardEvent (:81-108) consumes it plus its own stamps (theta/invocation_id/discard_site/query_site/occurred_at); emitTopLevelErrNote's absent-event arm (production-theta-producer.ts:399-428 at triage, guards now :420+) consumes it AFTER its invoke_callee leaf walk, keeping its fresh id/clock stamps, and the "exactly buildDiscardEvent-shaped" comment becomes the import. Behaviour identical — the b0399 witness and tests/query-discard.test.ts stay green. Lane note: production-theta-producer.ts is PTQ-1608's D9 lane; this serializes behind it.
