# Bug 0216 — The `session_shutdown` reason-classification seam has no production caller: `classifyShutdownReason` is imported by one test file and nothing else, `SessionShutdownDeps.inventory` is declared and never read, and `src/extension/factory.ts:1051` passes `inventory: undefined` — so the two registered rows `theta/host/session-shutdown-reason-unknown` and `theta/host/session-shutdown-pinned-constant-unreadable` cannot fire from any input, and PIC-45 / PIC-46 / PIC-47 hold only inside a unit test

- **Status:** open. §Fix is constraint-pinned: two dispositions are left to the
  run — wire the classifier into the shipped teardown handler, or retire both
  rows under DIAG-2 and re-derive the prose that hangs on them. Measured below:
  the shipped handler computes its captured reason with a private
  `coerceReasonString` that performs no snapshot read and no membership check,
  so no emission-reach-only fix (a call site added with no other change) is
  available without deciding which seam owns the read.
- **Sev/Diff estimate:** S3/D2 — two registered rows no input can fire and a
  24-cell unit suite that is green against a function the shipped extension
  never calls; D2 because the wiring is confined to the teardown subsystem
  (`factory.ts`'s deps literal plus `runSessionShutdown`'s reason read) and adds
  no registry row, while the retire disposition is a DIAG-2 registry edit with
  its same-commit mirror.
- **Kind:** production-wiring gap behind spec prose and two registered
  diagnostic rows. No spec sentence is contradicted by the code's *behaviour* on
  the closed-set path (a closed-set reason is coerced and stamped correctly);
  the defect is that three PIC obligations and both rows have no reachable
  implementation.
- **Affected** (every citation verified at HEAD `689fc630`, v0.137.0; symbols
  are the durable anchor, line numbers drift):
  - `src/extension/unknown-reason-rule.ts` — `classifyShutdownReason(event,
    inventory)` (`:96`), the whole four-arm classification: the snapshot
    lookup-and-`literals` read, the `event.reason` read in the pinned order, the
    closed-set membership verdict, and the at-most-one diagnostic. Its two code
    constants (`:25`, `:27`) are the only occurrences of either row's code in
    `src/`. The module has exactly one importer in the tree, the test file
    below.
  - `src/extension/session-shutdown.ts` — `SessionShutdownDeps.inventory`
    (`:144–145`, "The injected `SDK_SURFACE_INVENTORY` the unknown-reason rule
    reads (V9h)"). `rg -n 'inventory' src/extension/session-shutdown.ts` returns
    those two lines and nothing else: the field is declared and never read.
  - `src/extension/session-shutdown.ts` — `runSessionShutdown` (`:534`), the
    shipped five-sub-step handler. `:538` is its only reason computation:
    `const capturedReason = coerceReasonString(event.reason);`. That helper
    (`:200–210`) is `typeof reason === "string" ? reason : String(reason)` with
    an `"<unreadable>"` coercion-throw fallback — no snapshot read, no
    membership check, no diagnostic. `capturedReason` reaches two consumers:
    the sub-step-2 stamp (`:561`) and `armSessionSwapTripwireForReason` (`:630`).
  - `src/extension/factory.ts:1051` — `inventory: undefined,` in the
    `SessionShutdownDeps` literal the `session_shutdown` subscription builds.
    The single `inventory` occurrence in the file.
  - `src/extension/factory.ts:1074` — `return runSessionShutdown({ reason:
    event.reason }, shutdownDeps);`. The property read happens here, inside the
    subscription's own `try` whose `catch` (`:1075`) emits
    `theta/load/extension-bootstrap-failed` via `bootstrapFailedDiagnostic`
    (`:144`). So a throwing `event.reason` getter surfaces a bootstrap-failed
    row, not the `session-shutdown-reason-unknown` row PIC-47 assigns to that
    path.
  - `src/extension/sdk-inventory.ts:184–189` — the pinned snapshot row the rule
    is specified to consume: `{ id: "SessionShutdownEvent.reason", kind:
    "type-union-snapshot", path: "SessionShutdownEvent.reason", literals:
    ["quit", "reload", "new", "resume", "fork"] }`. Present and correct; nothing
    on the teardown path reads it. `:108–118` document the composite predicate
    (`kind === "type-union-snapshot" && path === "SessionShutdownEvent.reason"`)
    and that "the unknown-reason rule's set-membership check consumes this field
    directly with no separate copy in the handler".
  - `docs/spec_topics/diagnostics/code-registry-host.md:11` — the
    `theta/host/session-shutdown-reason-unknown` row (W, runtime). Its *Trigger*
    states the handler "observed an `event.reason` outside the closed set
    `{"quit", "reload", "new", "resume", "fork"}`, or the read of `event.reason`
    itself threw", emitted "exactly once per `session_shutdown` event, *before*
    sub-step 1 runs". No code path evaluates that predicate.
  - `docs/spec_topics/diagnostics/code-registry-host.md:12` — the
    `theta/host/session-shutdown-pinned-constant-unreadable` row (W, runtime).
    Its *Trigger* is the snapshot-entry lookup or `literals`-read failure, with
    the closed `details.failure` discriminator set (`"missing-entry"`,
    `"literals-shape-invalid"`, `"throw:<String(error)>"`), and states the two
    codes are **mutually exclusive** per event. No code path performs that
    lookup.
  - `docs/reference/diagnostics.md:290`, `:291` — the DIAG-2 user-facing mirror
    of both rows.
  - `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md:6` —
    PIC-45 (closed-set membership check against the snapshot's `literals`
    field), PIC-46 (constant-source pinning: the runtime's check consumes that
    snapshot entry's `literals` field "with no separate copy in the handler"),
    PIC-47 (handler-entry `try`/`catch` over both reads in the fixed
    snapshot-then-`event.reason` order, the catch-arm-per-failing-read
    discriminator, and the `pinned-constant-unreadable` row), PIC-48 (the two
    codes as anchor-stable contract surface).
  - `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`
    — sub-step 2 stamps "the handler-scoped captured `event.reason` string (per
    the **Unknown-reason rule** above — the closed-set member, the
    `String(event.reason)` unknown-reason coercion, the throwing-access
    `"<unreadable>"`, or the snapshot-failure `"<unreadable>"`)". The fourth
    alternative names a state only the classifier produces; the shipped stamp
    can never carry it.
  - `docs/spec_topics/session-model-and-appendix.md:11` — SM-2, which routes an
    `event.reason` outside the closed set "through the full teardown sequence"
    and requires it to emit "one `theta/host/session-shutdown-reason-unknown`
    (W, runtime) diagnostic via the teardown-handler last-resort sink".
  - `docs/spec_topics/pi-integration-contract/version-bump-triggers.md:3`
    (step 5) — "the `SessionShutdownEvent['reason']` closed-set snapshot entry
    in the pinned-constants block, whose literal-array field is consumed at
    runtime by the [Unknown-reason rule] … (the runtime's set-membership check
    reads that field)". The runtime consumption the bump procedure relies on
    does not exist.
  - `tests/unknown-reason-rule.test.ts` — 24 cells across seven `describe`
    blocks (PIC-45 `:75`, PIC-46 `:166`, PIC-47 `:199`, `:266`, `:291`, `:317`,
    PIC-48 `:375`), every one calling `classifyShutdownReason` directly with an
    inline `SessionShutdownEventLike` and an inline inventory array. It is the
    module's only importer (`:6`), so the whole suite is green over a function
    no shipped path calls.
  - `tests/code-registry.test.ts` — the DIAG-2/DIAG-3/DIAG-4 registry gates
    (`:58`, `:128`, `:165`). They check closure, id stability and the *Message*
    column; none asserts that a registered code has a reachable emission site,
    which is why this class survives a green suite.
- **Related:**
  - [0208](./0208-post-deadline-dual-surface-clean-cancel-and-teardown-timeout.md)
    — fixed (0.137.0). Its round-2 review measured this gap and dispositioned it
    as a pre-existing out-of-lane `src/` defect (its §Fix *Residuals* item 1);
    this report is that filing. 0208's own prose now keys the stamp-throw cause
    on the `session-shutdown-reason-unknown` row's *reported value*, so its
    discriminator has two arms that cannot be reached until this wiring lands.
  - [0073](./0073-cancelled-by-session-shutdown-never-emitted.md) — fixed
    (0.130.0). Same class in the same subsystem: a per-invocation row whose
    diagnostic-constructing function had no production caller. Its fix is the
    shape precedent — the emission was added at the seam that already held the
    facts (`#emitCleanCancelNote` in both per-invocation `finally` bodies), plus
    one property on the existing `createProductionProducerDeps({…})` call in
    `src/extension/production-composition.ts` to inject what the emission
    needed.
  - [0189](./0189-registry-placeholders-outside-closed-categories.md) — fixed
    (0.129.0). The registry-governs precedent: where shipped rows and the
    governing spec prose disagree, the report adjudicates which side moves
    rather than assuming the rows are correct. The same choice is open here
    between wiring and retirement.
- **Observed at:** v0.137.0 (`689fc630`, `package.json:3`). Offline,
  deterministic, provider-free: `rg` and file reads only. No test was run and no
  probe was written — the finding is settled by the absence of a call site,
  which `rg` decides.

## Summary

The unknown-reason rule exists as a pure function and is wired to nothing.

`classifyShutdownReason` (`src/extension/unknown-reason-rule.ts:96`) implements
PIC-45/46/47 in full: it reads the `SessionShutdownEvent.reason`
`type-union-snapshot` row out of the injected inventory, then reads
`event.reason`, in that order; it returns `capturedEventReason`,
`pinnedConstantReadOk`, `isClosedSetMember`, and at most one of the two
teardown-handler diagnostics. `rg -n 'unknown-reason-rule"' src/ tests/
extensions/` returns exactly one importer: `tests/unknown-reason-rule.test.ts`.

The shipped teardown handler computes its reason independently.
`runSessionShutdown` (`session-shutdown.ts:534`) opens with
`coerceReasonString(event.reason)` (`:538`, helper at `:200–210`) — a
`String()` coercion with an `"<unreadable>"` throw fallback. It performs no
snapshot lookup, evaluates no membership predicate, and emits neither row. The
deps field that would carry the snapshot, `SessionShutdownDeps.inventory`
(`:144–145`), is declared and never read, and the shipped composition passes
`inventory: undefined` (`factory.ts:1051`) — so even a future read would see
nothing, while `SDK_SURFACE_INVENTORY` sits complete and correct at
`sdk-inventory.ts:184–189`.

Three consequences are measurable at HEAD:

- **Neither registered row can fire.** `code-registry-host.md:11` and `:12` are
  live rows with *Trigger*, *Message*, `details` shapes, a mutual-exclusion
  clause and a mirror at `docs/reference/diagnostics.md:290–291`, and no input
  reaches either. Their codes appear in `src/` only as the two unread constants
  in the unwired module.
- **An unknown `event.reason` is stamped and forgotten.** A reason outside the
  closed set is coerced by `coerceReasonString`, stamped onto every entry
  (`:561`), and consumed by the tripwire (`:630`) with no diagnostic. SM-2
  (`session-model-and-appendix.md:11`) requires one
  `session-shutdown-reason-unknown` on exactly this path.
- **A throwing `event.reason` getter reports the wrong code.** The read happens
  at `factory.ts:1074`, inside the subscription `try`, so a throw routes to the
  `catch` at `:1075` and emits `theta/load/extension-bootstrap-failed`. PIC-47
  assigns that path to `session-shutdown-reason-unknown` with
  `details.observed = "<unreadable>"`.

The prose that assumes the wiring is not confined to the rule's own page.
`session-shutdown-semantics.md:10` lists "the snapshot-failure `"<unreadable>"`"
as one of four values sub-step 2 may stamp — a value only the classifier
produces. `version-bump-triggers.md:3` (step 5) rests its trigger-(ii) design
on the snapshot entry's `literals` field being "consumed at runtime by the
Unknown-reason rule".

Nothing in the default suite can red on this. `tests/unknown-reason-rule.test.ts`
drives the function directly across 24 cells, so the rule's own coverage is
green whether or not a caller exists, and `tests/code-registry.test.ts` gates
registry closure, id stability and *Message* text but not emission reach.

## Reproduction

Offline, at `689fc630`. Four `rg` runs and two file reads; verbatim output
(paths as `rg` prints them on Windows):

```
$ rg -n "classifyShutdownReason" src/ extensions/
src/extension\unknown-reason-rule.ts:13:// `classifyShutdownReason` so the failing tests compile and red on their own
src/extension\unknown-reason-rule.ts:96:export function classifyShutdownReason(

$ rg -n 'unknown-reason-rule"' src/ tests/ extensions/
tests/unknown-reason-rule.test.ts:6:} from "../src/extension/unknown-reason-rule";

$ rg -n "inventory" src/extension/factory.ts
1051:            inventory: undefined,

$ rg -n "inventory|SDK_SURFACE_INVENTORY" src/extension/session-shutdown.ts
144:  /** The injected `SDK_SURFACE_INVENTORY` the unknown-reason rule reads (V9h). */
145:  readonly inventory: readonly { readonly kind: string; readonly path?: string; readonly literals?: unknown }[] | undefined;
```

The first run's only two hits are a comment and the declaration — no call. The
second run establishes that the module's sole importer is a test file. The third
and fourth establish that the injection point passes `undefined` and that the
receiving field is declared once and read nowhere.

The shipped reason computation, `src/extension/session-shutdown.ts:538` and its
helper at `:200–210`, verbatim:

```
  const capturedReason = coerceReasonString(event.reason);
```

```
function coerceReasonString(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }
  try {
    return String(reason);
  } catch (coerceError: unknown) { // allow-broad-catch: PIC-7 — pi-integration-contract/session-shutdown-semantics.md
    void coerceError;
    return "<unreadable>";
  }
}
```

The injection site, `src/extension/factory.ts:1051` in context (`:1049–1057`),
and the call that follows it (`:1074`), verbatim:

```
            forwardingSignals: mergedForwardingSignals,
            inventory: undefined,
            sink: {
              emit: (line: unknown): void => {
                console.error(line);
              },
              serialise: (d: Diagnostic): string => JSON.stringify(d),
            },
```

```
          return runSessionShutdown({ reason: event.reason }, shutdownDeps);
        } catch (e: unknown) { // allow-broad-catch: pi-sdk-boundary — conventions.md Specific exception types only
          deps.emitDiagnostic?.(
            bootstrapFailedDiagnostic("pi.on", e, { event: "session_shutdown" }),
          );
```

## Expected behaviour

Per PIC-45/PIC-46/PIC-47 (`unknown-reason-rule.md:6`) and the two rows at
`code-registry-host.md:11–12`, one `session_shutdown` delivery runs, before
sub-step 1:

1. the snapshot lookup for `(kind === "type-union-snapshot", path ===
   "SessionShutdownEvent.reason")` and the read of its `literals` field, from
   the pinned-constants block — not from a copy in the handler;
2. then the `event.reason` read;

and routes to exactly one of three outcomes: a closed-set member (no
diagnostic), an unknown or throwing-access reason (one
`theta/host/session-shutdown-reason-unknown` carrying `details.observed`), or a
snapshot-read failure (one
`theta/host/session-shutdown-pinned-constant-unreadable` carrying the closed
`details.failure` discriminator, and never the other row). The captured reason
that sub-step 2 stamps is the one that classification produced, including the
snapshot-failure `"<unreadable>"` that `session-shutdown-semantics.md:10`
enumerates.

## Actual behaviour / root cause

`runSessionShutdown` computes its own captured reason with a private
`String()`-coercion helper and never consults the classifier. The seam that
would carry the snapshot into the handler (`SessionShutdownDeps.inventory`) is
declared but unread, and the shipped composition passes `undefined` into it.
`classifyShutdownReason` is therefore dead in production: one test file imports
it, no `src/` module does.

Root cause is a missing wiring step, not a wrong algorithm. The V9h-T /
V9h split declared the rule as its own module with an injected inventory
(`unknown-reason-rule.ts:11–16`, `sdk-inventory.ts:66–67`), and the paired
handler leaf shipped its own inline reason read. The deps field and the
`inventory: undefined` literal are the residue of the intended injection; no
commit closed it. Neither the registry gates nor the rule's unit suite can
observe the omission, because the former does not test emission reach and the
latter calls the function directly.

Consequences, each measured above: both rows are unreachable; an out-of-set
reason produces no diagnostic on a path SM-2 requires one for; a throwing
`event.reason` getter emits `theta/load/extension-bootstrap-failed` from
`factory.ts:1075` instead of the assigned host row; and the fourth stamp value
`session-shutdown-semantics.md:10` enumerates is unproducible.

## Why it matters

- **Two registered rows no input can fire.** DIAG-2 (`diagnostic-shape.md:72`)
  makes the registry closed and its rows normative. A row with no reachable
  emission site is a claim about runtime behaviour that no test can red and no
  operator will ever see, and both rows carry detailed `details` contracts
  (`observed`, the three-literal `failure` discriminator) that consumers are
  directed to key on.
- **A version bump loses its runtime half.** `version-bump-triggers.md:3`
  step 5 treats the snapshot entry as consumed at runtime by the membership
  check. At HEAD the entry is consumed only by build-time and test-time gates,
  so a Pi patch that widens `SessionShutdownEvent['reason']` produces no runtime
  signal at all on a user machine inside the patch-skew window — the outcome the
  runtime fallback exists to prevent.
- **The mis-routed getter throw hides the cause.** A throwing `event.reason`
  currently emits `theta/load/extension-bootstrap-failed` with `details.event =
  "session_shutdown"`, which names the subscription, not the closed-set drift.
  An operator diagnosing an SDK-shape change reads a bootstrap failure.
- **Downstream prose is unprovable.** 0208's discriminator (its §Fix, shipped
  0.137.0) partitions three shutdown causes using both host rows; two of its
  three arms are vacuous against current `src/`, as its own round-3 review
  recorded. Every further edit that keys on those rows compounds the gap.
- **The rule's coverage overstates itself.** 24 green cells cite PIC-45 through
  PIC-48 inline. Read as coverage, they say the obligations hold; they hold in
  the test's own call, which the shipped extension does not make.

## Fix

**Give the reason classification exactly one production caller, or retire the
two rows.** The two dispositions are named below; the run adjudicates. They are
mutually exclusive and each is self-contained — no third option (for example
emitting the rows from the factory subscription without moving the reads) is
admissible, because PIC-47 pins the read order and the `try`/`catch` discipline
to the handler.

*Disposition A — wire the classifier.* `runSessionShutdown` becomes the single
caller: replace the `coerceReasonString(event.reason)` computation at
`session-shutdown.ts:538` with `classifyShutdownReason(event, deps.inventory)`,
emit the returned `diagnostic` (if any) through the existing `deps.sink` before
sub-step 1, and feed `capturedEventReason` to the two existing consumers (the
sub-step-2 stamp at `:561`, `armSessionSwapTripwireForReason` at `:630`).
`SessionShutdownDeps.inventory` becomes read rather than declared, and
`factory.ts:1051` passes `SDK_SURFACE_INVENTORY` (`sdk-inventory.ts`) in place
of `undefined` — the same shape as 0073's one-property injection at the
composition call. PIC-47's read-order and handler-entry `try`/`catch`
obligations are satisfied by the classifier's own body, so the factory's
`{ reason: event.reason }` copy at `:1074` must stop pre-reading the property:
the read has to happen inside the classifier for a throwing getter to route to
`session-shutdown-reason-unknown` instead of the subscription's
bootstrap-failed `catch`. Constraints: no second copy of the closed set enters
the handler (PIC-46); exactly one of the two rows is emitted per event
(PIC-47 mutual exclusivity); emission precedes sub-step 1 (both *Trigger*
columns); `coerceReasonString` is removed or reduced to the classifier's
internal fallback so the tree holds one coercion rule.

*Disposition B — retire both rows.* Remove `theta/host/session-shutdown-reason-
unknown` and `theta/host/session-shutdown-pinned-constant-unreadable` from
`code-registry-host.md:11–12` and the mirror at
`docs/reference/diagnostics.md:290–291` in the same commit (DIAG-2,
`diagnostic-shape.md:72`, with the GOV-15 diagnostic-registry carve-out that
disposes a removal within a 1.x minor), delete `unknown-reason-rule.ts` and its
24-cell suite, and re-derive every sentence that assumes the classification:
`unknown-reason-rule.md:6` (PIC-45/46/47/48 in full — PIC-48 additionally makes
both codes anchor-stable contract surface, so the removal triggers its own
inbound-reference sweep across `docs/spec.md` and `docs/spec_topics/`),
`session-shutdown-semantics.md:10` (drop the snapshot-failure stamp
alternative), `session-model-and-appendix.md:11` (SM-2's required emission),
`version-bump-triggers.md:3` step 5 (the runtime-consumption premise, and
whether trigger (ii) still has a runtime half),
`placeholder-rendering-b.md:64` and `:96` (the `<reason>` unknown-path rendering
and the `<failure>` carve-out, both of which exist for these rows), and 0208's
shipped discriminator, which keys two of its three arms on them. This
disposition also decides what the handler does with an out-of-set reason, since
SM-2's routing obligation loses its diagnostic.

*Ordering.* No dependency on another open report. Disposition A is the smaller
edit and leaves every cited page true as written; disposition B is a spec change
across six pages plus a registry removal. Whichever is chosen, the fix must state
which of the two rows (if any) a witness can drive end to end, because the
absence of such a witness is what let the gap persist through two shipped
versions of the surrounding prose.

*Witness.* A witness that cannot red on the wiring alone is not sufficient: the
new cell must drive the shipped `runSessionShutdown` (not `classifyShutdownReason`
directly) with an out-of-set reason and assert exactly one
`session-shutdown-reason-unknown` on the injected sink, and with a
shape-invalid inventory assert exactly one `pinned-constant-unreadable` and no
`reason-unknown`. Under disposition B the same cells assert zero rows of either
code and the registry gate's closed set no longer contains them.

## Provenance

- Origin: the bug 0208 fix (0.137.0), whose round-2 review raised this as
  finding F1 and whose §Fix *Residuals* item 1 records it verbatim as a
  pre-existing out-of-lane `src/` defect needing its own report ("Both
  `"<unreadable>"`-reporting host rows are unwired in production… Needs its own
  bug report against the wiring"). This report adds what the residual does not:
  the single-importer measurement, the shipped reason computation that stands in
  for the classifier, the mis-routed getter-throw path at `factory.ts:1074–1075`,
  the inventory row that is present and unread, the prose inventory beyond the
  rule's own page, and the two named dispositions with their edit sets.
- Spec: `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md:6`
  (PIC-45/46/47/48);
  `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md:10`
  (sub-step 2's four stamp alternatives), `:15` (per-step isolation);
  `docs/spec_topics/session-model-and-appendix.md:11` (SM-2);
  `docs/spec_topics/pi-integration-contract/version-bump-triggers.md:3` (step 5,
  grouping (ii) and trigger (ii));
  `docs/spec_topics/diagnostics/code-registry-host.md:11`, `:12` (the two rows);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 and its GOV-15
  carve-out routing), `:48` (both rows as location-less);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:64` (the `<reason>`
  unknown-path rendering), `:96` (the `<failure>` carve-out, which exists for
  the `pinned-constant-unreadable` row). User-facing mirror:
  `docs/reference/diagnostics.md:290`, `:291`.
- Implementation evidence at `689fc630`:
  `src/extension/unknown-reason-rule.ts:11–16` (the V9h-T seam note), `:25`,
  `:27` (the two code constants), `:96` (`classifyShutdownReason`);
  `src/extension/session-shutdown.ts:144–145` (`inventory`), `:200–210`
  (`coerceReasonString`), `:534` (`runSessionShutdown`), `:538` (its reason
  computation), `:561` (the sub-step-2 stamp), `:630`
  (`armSessionSwapTripwireForReason`);
  `src/extension/factory.ts:144` (`bootstrapFailedDiagnostic`), `:1051`
  (`inventory: undefined`), `:1074` (the handler call and its `event.reason`
  pre-read), `:1075` (the `catch` that reports a getter throw as
  `theta/load/extension-bootstrap-failed`);
  `src/extension/sdk-inventory.ts:66–67`, `:108–118` (the composite predicate
  and the `literals` contract), `:184–189` (the pinned snapshot row).
- Test evidence at `689fc630`: `tests/unknown-reason-rule.test.ts:6` (the sole
  importer), `:75`, `:166`, `:199`, `:266`, `:291`, `:317`, `:375` (the seven
  `describe` blocks, 24 cells, all direct calls); `tests/code-registry.test.ts:58`,
  `:128`, `:165` (the DIAG-2/3/4 gates, none of which tests emission reach);
  `tests/cross-cutting-gates.test.ts:59` (the only other tree occurrence of
  either code, an `allow-broad-catch` fixture string, not an emission).
- Reproduction: four `rg` invocations and two file reads, quoted verbatim in
  §Reproduction. No test was run, no probe written, no file created.
