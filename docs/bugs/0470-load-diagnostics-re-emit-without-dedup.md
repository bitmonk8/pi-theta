# Bug 0470 — every rescan re-emits the full load-diagnostic set as fresh `theta-system-note` messages with no dedup or supersede, so an unchanged project accumulates hundreds of byte-identical warning notes in one session (408 observed, in bursts of 60/minute), each one burning LLM context and each one an independent chance to detonate bug 0469

- **Status:** resolved via bug 0471 (0.465.0) — the proposed dedup is
  **spec-forbidden** and was deliberately NOT implemented (see
  §Resolution). The storm was a symptom of the spurious rescans bug 0471 fixed,
  not an independent defect.
- **Sev/Diff estimate:** S3/D2 — S3: nothing is functionally wrong, but three
  distinct costs compound. (a) Custom messages participate in LLM context
  (Pi's `docs/extensions.md`), so 408 copies of three warnings is roughly 25k
  tokens of pure duplication carried in a working session's context. (b) The
  operator-facing signal is destroyed: a genuinely new load error arrives
  indistinguishable from the 400th copy of a permanent warning, which is the
  same "the one signal that should mean something is now routine noise" failure
  0468 was raised for. (c) It sets the detonation probability for
  [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md) —
  each redundant emission is an independent draw at landing inside a
  tool-execution window. D2: the mechanical change is a per-file digest
  compared across scans, plus one adjudication (what, if anything, to emit when
  a set is unchanged) and a spec sentence.
- **Kind:** NOT a defect in the emission rule — the re-emission is
  **normatively specified**. [`diagnostics/diagnostic-shape.md`
  §"Re-scan deduplication"](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
  pins it with a MUST NOT: *"A watcher-triggered reload re-emits the persistent
  diagnostic for any file whose contents are still broken… the renderer MUST NOT
  attempt to suppress duplicates… Authors will therefore see the same diagnostic
  line recur after each reload until the underlying file is fixed; this is the
  theta 1.0 contract."* The code comment at `system-note-channel.ts:464` ("A
  re-scan re-emits with no dedup / supersede") faithfully implements that rule,
  and [`diagnostic-shape.md` §"Argument-mismatch multiplicity"] *depends* on it
  (it emits `tool-arg-type-mismatch` once-per-site precisely because a duplicate
  line "would render byte-identical… and Re-scan deduplication already forbids
  the renderer suppressing duplicate lines"). So the storm is a **symptom of the
  trigger defect [0471](./0471-non-theta-file-change-triggers-full-rescan.md)**
  (rescans firing on non-theta files), not a defect in the re-emission rule. The
  bug's original framing — that dedup is the fix — is withdrawn.
- **Related:**
  - [0469](./0469-watcher-note-mid-tool-execution-breaks-tool-adjacency.md)
    (open) — the failure this bug's volume converts from unlikely to nightly.
  - [0471](./0471-non-theta-file-change-triggers-full-rescan.md) (open) — why
    the rescans happen; fixing 0471 cuts the volume, fixing this one caps it.
  - [0013](./0013-load-warnings-dropped-by-both-production-sinks.md)
    (fixed 0.24.0) — the opposite failure on the same channel: load warnings
    that reached no sink at all. The fix for this bug must not regress 0013 —
    an unchanged-set suppression must still emit the set the first time.
  - [0468](./0468-subagent-teardown-budget-shared-2000ms.md) (fixed 0.464.0) —
    same "diagnostic that lies at scale" framing.
- **Affected** (at 359d27ef, v0.464.0):
  - `src/extension/system-note-channel.ts:458-470` — `emitDiagnosticBatch`,
    one `sendMessage` per scan carrying the full `Diagnostic[]`, with the
    no-dedup contract in its own comment at `:464`.
  - `src/extension/production-composition.ts:1694` — the load-pass warning
    emission, re-run in full by every rescan.
  - `src/binder/binder-model.ts:16-18` — the reason the set is *permanently*
    non-empty on current Pi: `strictCapable` is absent from `Model<Api>` at the
    pinned SDK, so `theta/load/binder-model-strict-capability-unknown` is the
    universal branch and fires once per non-bypass theta, every scan, forever.

## Symptom

From the seeding incident session (`01a06211…`), counted over the whole file:

```
total theta-system-notes: 423   of which load-diagnostic: 408
load-warning notes by minute (top 5):
  2026-09-07T21:48   60
  2026-09-07T21:49   60
  2026-09-07T21:50   59
  2026-09-07T21:47   32
  2026-09-08T21:05   24
```

Three thetas are registered in the project, each producing exactly one
`binder-model-strict-capability-unknown` warning, so 60 notes/minute is ~20
completed rescans per minute — for a project whose `.theta` files had not
changed at all. The three warnings are byte-identical every time, differing only
in `id`, `parentId`, and `timestamp`. The operator-visible effect is the same
three-line block pasted into the transcript over and over.

## Expected

The re-emission itself is expected and required: on a *legitimate* reload (a
theta/`.thetalib`/settings edit) the runtime re-emits the persistent diagnostics
for the re-parsed files, and MUST NOT suppress the duplicate
([Re-scan deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)).
What is NOT expected is a reload firing when no theta source changed at all —
that is bug 0471, and it is what turned an intended once-per-edit reminder into
a 408-note storm.

## Actual

`emitDiagnosticBatch` re-emits the full set every time it is called, exactly as
the Re-scan deduplication rule requires. The pathology was entirely upstream:
bug 0471 called it dozens of times per hour for file changes that touched no
theta source, so a spec-correct once-per-edit re-emission became a flood.

## Resolution (0.465.0) — the proposed dedup is spec-forbidden

The original report proposed a per-file digest that suppresses an unchanged
warning set on rescan. **That was withdrawn**: it directly contradicts the
normative [Re-scan deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
MUST NOT, and the [Argument-mismatch multiplicity] rule reasons *from* the
visibility of duplicates, so a silent emission-time dedup would also invalidate
that rule's design. A dedup would need to amend that contract — an RFC-level
spec change with review, not a bug-fix pass.

What shipped instead: **bug 0471's watcher-trigger filter**, which removes the
spurious rescans. After it, `emitDiagnosticBatch` is called only on a real
theta/settings edit, so the re-emission returns to its spec-intended cadence
(once per edit) and the storm cannot recur — during a `/quality-loop` run, which
edits no theta sources, there are now zero reloads and zero re-emissions.

### Residual, narrower concerns (not fixed here; route to RFC 0010 / spec work)

Two points remain that a *spec* change — not a silent dedup — could address:

1. **`binder-model-strict-capability-unknown` is a host-capability fact, not a
   "still-broken file".** The Re-scan deduplication rule is scoped to "any file
   whose contents are still broken"; this warning is not about file contents at
   all (it fires because `Model<Api>.strictCapable` is absent on the pinned
   SDK). Whether such a host-capability notice should re-emit per reload is a
   question for its emission policy in `binder-model-and-context.md`, not the
   general diagnostic rule.
2. **A single-file edit re-emits every theta's warnings.** registration-steps.md
   §"Hot-reload subsystem" says a reload "re-parses just the changed file plus
   every transitive `.thetalib` importer," but the implementation re-runs full
   discovery (`runComposePass`) and re-emits every theta's load diagnostics.
   Scoping reload re-emission to the changed file would align impl with that
   spec sentence — a separate, larger change tracked for follow-up.

The context-burn cost (custom messages participate in LLM context) is the
strongest argument for RFC 0010's move of operator-facing note classes to
`pi.appendEntry` (entries do not enter LLM context) — which is a spec-blessed
channel change, not a suppression, and therefore does not run afoul of Re-scan
deduplication.

## Test obligations

The dedup tests originally listed here are withdrawn (a dedup would violate
Re-scan deduplication). The behaviour that matters is covered by bug 0471's
witnesses:

- Offline (shipped): a non-theta write under a discovery root schedules no
  reload and emits no note; a real `.theta`/settings edit still does
  (`tests/watcher-hot-reload-integration.test.ts` (f)/(g)).
- If the residual concerns above are taken up as spec work: the
  host-capability-warning emission-policy change and the reload-scoping change
  each get their own witnesses at that time.

## Do NOT add

- An emission-time or renderer-time dedup / supersede of `theta-system-note`
  diagnostics. It is forbidden by
  [Re-scan deduplication](../spec_topics/diagnostics/diagnostic-shape.md#re-scan-deduplication)
  and depended on by Argument-mismatch multiplicity. A prior draft of this fix
  did exactly that and was reverted before merge.
