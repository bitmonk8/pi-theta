# Triaged Plan Review — plan

_Generated: 2026-06-12T00:30:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T31) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 9 high, 20 medium retained; 9 low discarded; 9 low findings merged into 1 medium finding; 25 NIT dropped; 0 false dropped._

---

# T01 — "Sequential by default" omits the CLAUDE.md "Never block the async runtime" obligation

**Original heading:** "Sequential by default" omits CLAUDE.md "Never block the async runtime"
**Original section:** docs/plan_topics/conventions.md
**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

The project-level CLAUDE.md concurrency directive has two halves: *"Sequential by default"* and *"Never block the async runtime."* `conventions.md` adopts the first half verbatim as a cross-cutting rule, but that rule is scoped entirely to Promise-combinator concurrency — it forbids `Promise.all` / `Promise.race` / `Promise.allSettled` / `Promise.any` in `src/**` and defines the allow-list / closing-gate predicate for them. Nowhere in the plan corpus is the complementary half stated: synchronous blocking of the event loop (`fs.readFileSync`, `execSync`, busy-wait loops) is neither banned nor mentioned. A `grep` of the entire plan corpus for `readFileSync`, `execSync`, `busy-wait`, and `block`/`blocking` returns no hits.

This matters because the loom interpreter runs as plain async TypeScript on Pi's shared event loop (`spec_topics/implementation-notes.md` — "non-blocking at the runtime level, sequential at the language level"; "The loom interpreter runs as plain async TypeScript on Pi's event loop"). A synchronous blocking call in `src/**` would stall the host event loop for every concurrent invocation, which is exactly the failure the CLAUDE.md "Never block the async runtime" directive guards against — yet an implementer reading only the plan's "Sequential by default" rule sees only the Promise-combinator ban and has no documentary surface reminding them of the blocking-call prohibition.

The omission is also an enforcement-posture gap: the `no-restricted-syntax` lint wired by `H2a` matches only the four Promise-combinator forms. Blocking synchronous calls are not lint-detectable by that rule, so the blocking-runtime ban — even once stated — would carry no mechanical gate and would rest on the seam-adapter discipline (I/O routed through the `V8*` FileSystem seam) plus the Per-phase TDD ritual self-review step. The plan should state both the obligation and that it is unenforced mechanically.

## Plan Documents

- `docs/plan_topics/conventions.md` — *Sequential by default* cross-cutting rule; *Per-phase TDD ritual* self-review step (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — Convention / Tests bullet for *Sequential by default* (read-only) — confirms the `no-restricted-syntax` lint scope is Promise-combinators only

## Spec Documents

None

(`spec_topics/implementation-notes.md` grounds the "runs on Pi's event loop / non-blocking at the runtime level" property the fix cites, but the fix is internal to the plan and edits no spec page.)

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None

(Cross-cutting `conventions.md` doc-alignment fix. `H2a`'s lint scope is unchanged — the blocking-call ban is explicitly non-lint-detectable — so no leaf's acceptance criteria, Deps, or sequencing change.)

## Consequence

**Severity:** advisory

An implementer following only the plan corpus has no statement of the blocking-runtime prohibition; a `fs.readFileSync` / `execSync` / busy-wait in `src/**` would stall Pi's shared event loop for all concurrent invocations, and neither the `no-restricted-syntax` lint nor any closing-gate check would catch it. Implementers can still produce working leaves (the seam-adapter discipline routes I/O off the blocking path), so this is a guidance gap rather than a hard blocker.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** `288f191` (2026-05-04) — "Add implementation plan with horizontal/MVP/vertical-slice phases"
**History:** The *Sequential by default* rule entered the corpus in `288f191` (then in the single-file `plan.md`) scoped to Promise-combinators only, and carried unchanged through the per-topic split (`fecb504`) into `conventions.md` and the `docs/` move (`31ff060`). `git log -S "Never block the async"`, `git log -S "readFileSync" -- docs/`, and `git log -S "execSync" -- docs/` show the blocking-runtime ban has never appeared in the plan corpus. The gap is original to the rule's authoring, not introduced by a later edit.

## Solution Space

**Shape:** single

### Recommendation

Append to the *Sequential by default* cross-cutting rule in `docs/plan_topics/conventions.md` text stating that the rule subsumes the CLAUDE.md *"Never block the async runtime"* directive: synchronous blocking of the event loop in `src/**` (e.g. `fs.readFileSync`, `execSync`, busy-wait loops) is forbidden because the interpreter runs on Pi's shared event loop (cross-reference `spec_topics/implementation-notes.md`). State the enforcement posture explicitly: this half carries **no mechanical gate** — the `no-restricted-syntax` rule wired by `H2a` matches only the Promise-combinator forms — so the blocking-call ban is enforced by the seam-adapter discipline (file/process I/O routed through the `V8*` FileSystem seam) and the *Per-phase TDD ritual* self-review step.

Add a blocking-call check to the self-review enumeration in the *Per-phase TDD ritual* (the bullet that already enumerates the broad-catch, globals, and ambient-primitive checks), so the manual residue this ban concedes has a named review home — mirroring how the *No globals* and ambient-access rules route their non-mechanical residue to the same self-review step.

## Relationships

None

---

# T02 — `DISC-4` is split across two coverage-matrix rows instead of the canonical multi-close form

**Original heading:** `DISC-4` appears in two rows, differentiated only by paraphrase qualifiers
**Original section:** docs/plan_topics/coverage-matrix.md
**Kind:** traceability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

In `coverage-matrix.md`'s *Numbered REQ-IDs* table, the single executable REQ-ID `DISC-4` is mapped by two separate rows:

```
| DISC-4 (discovery/collision detection) | `V10a` |
| DISC-4 (superseded-entry dispatch)     | `V9b`  |
```

`DISC-4` is one REQ-ID (`spec_topics/discovery/discovery-sources.md` §DISC-4, "Slash-name collision rules"); `V10a` closes its discovery/collision-detection aspect and `V9b` closes the `LoomRegistry`-side superseded-entry-dispatch aspect (`spec_topics/pi-integration-contract/drain-state-contract.md` §superseded-entry-dispatch, which cites DISC-4). Both closures are correct.

Every other multi-leaf REQ-ID in the same table uses one row with a comma-separated leaf cell — `ERR-17 | V4d, V13d`, `ERR-19 | V4d, V13c`, `CIO-1 | V16a, V4e, V11f`, `CIO-5 | V16a, H7a`, `DIAG-4 | V7b, V7c`, `CNCL-4 | V17a, V9g`. `DISC-4` is the lone deviation: it carries two rows whose REQ-ID column holds free-text parenthetical qualifiers (`(discovery/collision detection)`, `(superseded-entry dispatch)`) that appear on no other row and are not part of the column's machine-readable `PREFIX-N` token contract. A REQ-ID extractor or closing-gate scan that builds a `Map<REQ-ID, leaves>` keyed on the bare token sees `DISC-4` twice; depending on implementation it either drops one closer (second row overwrites first) or fails to parse the qualified left cell, so two reasonable gate implementations diverge on whether `DISC-4` maps to `{V10a}`, `{V9b}`, or both.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — *Numbered REQ-IDs (runtime obligations)* table (edited)
- `docs/plan_topics/conventions.md` — §Leaf format (Deps note) / §REQ-ID discipline — defines the REQ-ID→closing-leaf mapping contract (read-only)
- `docs/plan_topics/V10a-discovery-walk.md` — DISC-4 collision-detection closure (read-only)
- `docs/plan_topics/V9b-registration-drain-state.md` — DISC-4 superseded-entry-dispatch closure (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — transitive-completeness reconciliation arm (read-only)

## Spec Documents

None — the fix is purely internal to plan files; both DISC-4 aspects already trace to existing spec anchors (`discovery-sources.md` §DISC-4, `drain-state-contract.md` §superseded-entry-dispatch).

## Affected Leaves

**Phases:** None

**Leaves (implementation order):**

None — the fix edits only `coverage-matrix.md`. `V10a` and `V9b` remain DISC-4's closing leaves with no change to their acceptance criteria; the finding lives in a cross-cutting plan file and does not propagate into any leaf file.

## Consequence

**Severity:** correctness

A tool or closing-gate scan that keys DISC-4's closing set on the bare REQ-ID token can silently drop one of the two closers (`V10a` or `V9b`) or fail to parse the qualified left cell, so the matrix no longer reliably records that DISC-4 has two distinct closers. A reviewer enumerating live REQ-IDs from the table double-counts DISC-4. Both manifest as a traceability/closure-coverage divergence rather than a hard build break.

## Issue introduction

**Verdict:** single-commit-introduction
**Introducing commits:** `9d61b210479fa7103ae2ab39e31580dd005f902d` (2026-06-11 20:44:09 +0200)
**History:** The plan corpus is git-tracked. `git log -S 'superseded-entry dispatch' -- docs/plan_topics/coverage-matrix.md` and `git show 9d61b21 -- docs/plan_topics/coverage-matrix.md` show DISC-4 was a single row `DISC-1, DISC-2, DISC-3, DISC-4 | V10a` until commit `9d61b21` ("resolve 'DISC-4 superseded-dispatch assertion belongs on V9b not V10a'"). That fix correctly added `V9b` as the superseded-entry-dispatch closer but expressed the two closers as two parenthetically-qualified rows instead of the canonical comma-separated multi-close form, introducing the deviation. No earlier revision contains the two-row form.

## Solution Space

**Shape:** single

### Recommendation

In `coverage-matrix.md`'s *Numbered REQ-IDs* table, replace the two `DISC-4` rows with a single row whose REQ-ID column holds the bare token `DISC-4` and whose leaf cell lists both closers comma-separated, matching the established multi-close form used by `ERR-17`, `CIO-1`, `DIAG-4`, etc. The per-leaf aspect labels may ride as parenthetical qualifiers on each leaf inside the leaf cell so the distinct closures stay legible — for example:

```
| DISC-4 | `V10a` (collision-detection closure), `V9b` (superseded-entry-dispatch closure) |
```

Place the consolidated row where `DISC-4` sorts (immediately after the `DISC-1, DISC-2, DISC-3 | V10a` row). Leave `DISC-1, DISC-2, DISC-3 | V10a` unchanged.

Implementer edge case: under the consolidated single row, `H5a`'s transitive-completeness arm treats `DISC-4` as a multi-leaf cell that stays green when only one listed leaf is in `H5b`'s `Deps.` (the primary/co-witness rule). Both `V10a` and `V9b` genuinely close distinct DISC-4 aspects, so confirm both remain present in `H5b`'s `Deps.` (they are today, via the `V10a`–`V10c` and `V9a`–`V9j` ranges) so neither aspect's closure can be dropped without the gate firing.

## Relationships

- T03 "`diagnostic-emission-isolation.md` and `session-shutdown-semantics.md` are closed by `V9g` but absent from the coverage-matrix code-keyed table" — same-cluster (same `coverage-matrix.md` traceability surface; resolves independently)

---

# T03 — `diagnostic-emission-isolation.md` and `session-shutdown-semantics.md` are closed by `V9g` but absent from the coverage-matrix code-keyed table

**Original heading:** Two PIC teardown pages covered by V9g but not enumerated as their own coverage-matrix rows
**Original section:** Cross-cutting / global
**Kind:** spec-coverage
**Importance:** medium
**Score:** 30
**MustFix:** true

## Finding

Two non-narrative `pi-integration-contract/` spec pages — `diagnostic-emission-isolation.md` and `session-shutdown-semantics.md` — carry normative MUST/MUST-NOT obligations that the `H5a` un-anchored-MUST recogniser surfaces: the obligations carry no numbered `PREFIX-N` REQ-ID, and at least several carry no `loom/...` registry code in their sentence. On `diagnostic-emission-isolation.md` these include the handler-isolation swallow obligation (`a throw out of console.error MUST be swallowed; the handler MUST continue to the next sub-step`) and the invocation-site count semantics. On `session-shutdown-semantics.md` these include the *Factory-ordering pin* (`The session_shutdown handler MUST be subscribed … only after the LoomRegistry and watcher handles … are constructed`; `a session_shutdown MUST NOT be reachable against a partially-constructed extension state`), the partial-append fate rule, and the `invoke`-parent observation rule.

Both pages are functionally covered by `V9g`: its **Spec** field lists both pages, and its **Tests** assert the wrapped host emissions, the bare/two-token/three-token serialiser-throw fallback forms, per-step isolation, and the per-invocation `loom/runtime/cancelled-by-session-shutdown` note. So there is no behavioural coverage gap. The gap is purely in the coverage-matrix *bookkeeping*: neither page name appears anywhere in `coverage-matrix.md`. The only matrix row that resolves to `V9g` is the `patch-skew-degradation.md` §`session_shutdown` sub-step 3 row, which closes a different obligation (the aggregate `Promise.allSettled` settle-all). The matrix's own *Code-keyed obligation areas* preamble states that every un-anchored MUST on a non-narrative `spec_topics/**` page is "one rule-driven row here with a named closing leaf"; these two pages have none.

## Plan Documents

- `docs/plan_topics/coverage-matrix.md` — Code-keyed obligation areas (no numbered REQ-IDs) table (edited)
- `docs/plan_topics/V9g-session-shutdown.md` — named closing leaf for the two new rows (read-only)
- `docs/plan_topics/H5a-closing-gate-automation.md` — un-anchored-MUST arm definition (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps already span `V9a`–`V9j` (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — hard-fail flip footing (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/diagnostic-emission-isolation.md` — teardown-time `console.error` isolation MUSTs (read-only)
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md` — session-swap / factory-ordering MUSTs (read-only)

## Affected Leaves

**Phases:** Vertical (V9), Horizontal (release gate)

**Leaves (implementation order):**

- `V9g` — Session-shutdown teardown and emission isolation — (modified) — the two new matrix rows name `V9g` as closing leaf; its body already covers both pages and needs no edit, and it is already in `H5b`'s `Deps.` via the `V9a`–`V9j` range, so the H5a transitive-completeness arm stays green
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (blocked) — its hard-fail flip reconciles the live `spec_topics/**` MUST set against the live matrix; the un-enumerated MUSTs keep it from going green

## Consequence

**Severity:** correctness

The plan corpus is internally inconsistent: `V9g` closes both pages, but the coverage matrix never records that, so the matrix and the implementation disagree. The `H5a` un-anchored-MUST arm — surfaced as warnings by the `H5b` live-corpus canary and binding at the `H6a` release-gate flip — would flag these two pages' un-anchored MUSTs as un-enumerated, since they are absent from the *Code-keyed obligation areas* table with a closing leaf. The release gate cannot cleanly go green (and the canary will report persistent findings) until the rows are added.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** The *Code-keyed obligation areas* table of `coverage-matrix.md` was authored in c6a664e and never carried rows for `diagnostic-emission-isolation.md` or `session-shutdown-semantics.md`; a pickaxe (`git log -S`) over the full file history finds neither page name ever present in the matrix. Later passes that enumerated sibling `pi-integration-contract/` pages (adb521f for the V9b/V9c/V9e areas, bad3b99 for the V9h pages, 659aa21 which added the `patch-skew-degradation.md` §sub-step-3 → `V9g` row) extended the table around these two pages without adding them, so the omission has persisted since the table's inception.

## Solution Space

**Shape:** single

### Recommendation

Add two rows to the *Code-keyed obligation areas (no numbered REQ-IDs)* table in `docs/plan_topics/coverage-matrix.md`, both with closing leaf `V9g`:

- `pi-integration-contract/diagnostic-emission-isolation.md` — the teardown-time `console.error` isolation MUSTs: the per-emission `try`/`catch` wrap of the serialisation-and-emission sequence, the bare-`code` / two-token / three-token serialiser-throw fallback forms, the construction-site self-wrap, the handler-isolation swallow obligation, and the invocation-site count semantics (un-anchored; GOV-22 residue).
- `pi-integration-contract/session-shutdown-semantics.md` — the session-swap MUSTs: per-invocation clean-cancel `loom/runtime/cancelled-by-session-shutdown` emission, partial-append fate during teardown, the `invoke`-parent observation rule, and the *Factory-ordering pin* (un-anchored; GOV-22 residue).

`V9g` is already a member of `H5b`'s `Deps.` (via the `V9a`–`V9j` range), so the new closing-leaf cells satisfy the H5a transitive-completeness arm without any further plan-maintenance edit. The two spec pages are read-only for this fix — do not edit them; the change is confined to `coverage-matrix.md`. No leaf body, no `H5b`/`H6a` edit, and no spec edit is required. Watch that the `patch-skew-degradation.md` §sub-step-3 row stays distinct — the new rows cover the emission-isolation and session-swap obligations, not the aggregate `Promise.allSettled` settle-all that row already owns.

## Relationships

- T21 "Per-loom registration `ToolDefinition` field-derivation MUSTs unnamed by any leaf" — same-cluster (another missing code-keyed coverage-matrix row; different page/leaf, resolves independently)
- T31 "Extension-bootstrap SDK-failure rule and `loom/load/extension-bootstrap-failed` have no closing leaf" — same-cluster (another un-enumerated code-keyed obligation needing a matrix row; independent page/leaf)
- T02 "`DISC-4` is split across two coverage-matrix rows instead of the canonical multi-close form" — same-cluster (same `coverage-matrix.md` traceability surface; resolves independently)

---

# T04 — H7a permitted-code-list provenance is bound to a Deps set narrower than the pipeline it gates

**Original heading:** H7a Deps may not enumerate every code-emitting / turn-producing slice the pipeline exercises
**Original section:** docs/plan_topics/H7a-integration-acceptance.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H7a`'s third Tests bullet defines the committed **permitted-code list** as "the union of `loom/...` codes the slices in **Deps** … *can* emit", and the fourth bullet binds the same per-Deps-slice provenance to the golden diagnostics list and golden transcript. `H7a`'s `Deps` are `H4a, V5d, V8a, V11f, V13c, V14a, V16a, V17a`. But the leaf's own `Adds.` and `Ships when.` describe the integrated pipeline as *typed query → tool loop → code-tool invoke → schema lowering/validation → binder → cancellation* — a path that necessarily exercises the full binder slice group (`V11a`–`V11f`) and the full typed-query slice group (`V13a`–`V13d`), of which only `V11f` and `V13c` are in `Deps`.

Several of the unlisted pipeline slices emit their own `loom/...` codes: `V11a` (`loom/load/binder-model-unresolved`, `loom/load/binder-model-not-strict-capable`, `loom/load/binder-model-strict-capability-unknown`), `V11b` (`loom/parse/bind-context-session-on-subagent`, `loom/runtime/custom-type-unsafe`), and `V13b` (`loom/parse/explicit-schema-mismatch`). Because the permitted-code list is computed strictly from `Deps`-slice provenance, none of these codes is in the list even though the pipeline `H7a` drives can produce them.

This breaks the leaf's stated invariant that the permitted-code list is a **superset** of every code the fixture path can emit, and it under-specifies the reference set that `H4a`'s real-host smoke pass criterion (e) and `H6a`'s release-gate evidence record check live runs against. The non-deterministic real-host run can legitimately emit a binder-model or schema-inference code from an unlisted slice; criterion (e)'s subset check would then flag a real, in-pipeline code as out of bounds.

## Plan Documents

- `docs/plan_topics/H7a-integration-acceptance.md` — Deps + Tests bullets 3–4 (permitted-code list / golden-diagnostics provenance) (edited)
- `docs/plan_topics/V11a-binder-model-resolution.md` — binder slice in the named pipeline, emits `loom/load/binder-model-*` codes (edited)
- `docs/plan_topics/V11b-bind-context-transcript.md` — binder slice, emits `loom/parse/bind-context-session-on-subagent`, `loom/runtime/custom-type-unsafe` (edited)
- `docs/plan_topics/V13b-query-schema-inference.md` — typed-query slice, emits `loom/parse/explicit-schema-mismatch` (edited)
- `docs/plan_topics/V11c-bypass-envelope.md`, `docs/plan_topics/V11d-defaulting-echo.md`, `docs/plan_topics/V11e-system-note-determinism.md`, `docs/plan_topics/V13a-query-render.md`, `docs/plan_topics/V13d-query-failure-repair.md` — remaining binder/query stages the pipeline exercises (read-only)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — real-host smoke pass criterion (e) consumes the permitted-code list (read-only)
- `docs/plan_topics/H6a-live-corpus-activation.md` — release-gate evidence record consumes the permitted-code list (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H7a — Terminal integration-acceptance run (cross-slice end-to-end gate) — (modified)

## Consequence

**Severity:** correctness

The permitted-code list is silently incomplete: a code emitted by an in-pipeline but un-`Deps` slice (`V11a`/`V11b`/`V13b`) is absent from it, so `H4a` criterion (e) / `H6a` evidence checks can falsely reject a legitimate live-run code, and if the deterministic fixture path emits such a code the golden-diagnostics-⊆-permitted-list invariant breaks at the in-process gate. Two implementers would also disagree on which slices' codes the list must cover.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** e7e51cc — pi-loom plan: resolve "Plan has no terminal end-to-end integration-acceptance leaf" (2026-06-10, Thomas Andersen); 052b019 — pi-loom plan: resolve "Real-host smoke pass criterion (e) names a permitted code set with no committed source" (2026-06-11, Thomas Andersen)
**History:** e7e51cc created `H7a` already naming the full *typed query → … → binder → cancellation* pipeline in its `Adds.`/`Ships when.` while its `Deps` listed only `H4a, V5d, V8a, V11f, V13c, V14a, V17a` — omitting the binder (`V11a`–`V11e`) and typed-query (`V13a`/`V13b`/`V13d`) sub-slices the pipeline exercises. The omission was latent until 052b019 added the committed permitted-code list and tied both it and the golden goldens to "the union of `loom/...` codes the slices in **Deps** can emit", binding the provenance to exactly that incomplete `Deps` set and turning the inception-time gap into a concrete incompleteness defect.

## Solution Space

**Shape:** single

### Recommendation

Extend `H7a`'s `Deps` to include the code-emitting pipeline slices the integrated path actually drives, so the per-Deps-slice provenance covers every slice that can emit a code on the integrated path. In `docs/plan_topics/H7a-integration-acceptance.md`, extend the `Deps.` line to include the code-emitting binder/query slices the pipeline exercises — at minimum `V11a`, `V11b`, `V13b` (the concrete code-emitters), and the remaining named-pipeline stages `V11c`, `V11d`, `V11e`, `V13a`, `V13d` for completeness. The Tests bullets that read "the slices in **Deps**" then resolve correctly with no further wording change. This restores the superset invariant verbatim, keeps the provenance rule and the goldens mechanically derivable, and stays consistent with the leaf's own pipeline description.

Edge case for the implementer: confirm each newly listed slice's emittable-code set is sourced from that slice's own leaf when deriving the list, and that the broadened `Deps` does not introduce a sequencing cycle (`H7a` lands terminal, so all additions sequence before it). Because the broadened `Deps` is read by `H5a`'s transitive-completeness/range arms, confirm the added entries are individually enumerable (they are non-range).

## Relationships

- T05 "Depth-6 (ceiling #4) wrapping that V5e delegates to V14a and V15a is asserted at neither carrier" — same-cluster (both concern whether downstream live-surface coverage of the integrated path is complete; resolve independently)

---

# T05 — Depth-6 (ceiling #4) wrapping that V5e delegates to V14a and V15a is asserted at neither carrier

**Original heading:** Routing decisions asserted in isolation; live-surface integration gate is external (informational)
**Original section:** docs/plan_topics/V4c-terminal-outcomes.md
**Kind:** validation
**Importance:** medium
**Score:** 30
**MustFix:** true

## Finding

`V5e` enforces hard ceiling #4 (JSON document depth) and, by design, asserts only the per-boundary *routing decision* in isolation against the `H4a` harness. It explicitly disclaims wrapping the breach into a live carrier and delegates that to the site owners: its Tests bullet states "the actual wrapping of a depth-6 breach into each carrier is asserted at the site owner: `ValidationError` at `V13c`, `CodeToolError` at `V14a`, `InvokeInfraError` at `V15a`, the slash-load cross-route at `V4e`." The same seam-decomposition pattern appears in `V4c` (terminal-outcome / no-rollback witnessed through the harness, live surfaces delegated downstream).

Two of the four delegation targets do not carry the assertion. `V13c` carries the depth-6 → `ValidationError` (`schema_keyword:"maxDepth"`) co-fire vector, and `V4e` carries the slash-load `params` ceiling-#4 cross-route (`ERR-16`). But neither `V14a` nor `V15a` mentions depth, `maxDepth`, or ceiling #4 anywhere in its Tests or Ships-when (`git log -S 'maxDepth'` confirms the token was never present in either file). For the code-driven-tool-args site (#3 → `CodeToolError`) and the `params`/`invoke<T>`-return site (#4 → `InvokeInfraError`), the routing decision is asserted only in isolation at `V5e` and is never witnessed end-to-end at the carrier that owns the surface.

`ceilings-3-and-4.md` lists all five enforcement sites as normative, so sites #3 and #4 require a live witness. As written, `V5e`'s delegation dangles: the wrapping of a depth-overflow breach into `CodeToolError` and into `InvokeInfraError` is the responsibility of no leaf.

## Plan Documents

- `docs/plan_topics/V14a-tool-calls.md` — Tests / Ships when (edited)
- `docs/plan_topics/V14a-T-tool-calls.md` — Tests (edited)
- `docs/plan_topics/V15a-invocation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/V15a-T-invocation-core.md` — Tests (edited)
- `docs/plan_topics/V5e-depth-enforcement.md` — Tests / routing-decision delegation (read-only)
- `docs/plan_topics/V13c-query-tool-loop.md` — Tests / depth-6 co-fire vector (read-only)
- `docs/plan_topics/V4e-pre-evaluation-failures.md` — `ERR-16` slash-load cross-route (read-only)
- `docs/plan_topics/V4c-terminal-outcomes.md` — Tests / `ERR-13` delegation (read-only)

## Spec Documents

- `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md` — the five ceiling-#4 enforcement sites (read-only)

## Affected Leaves

**Phases:** Vertical slices — V14, V15

**Leaves (implementation order):**

- `V14a-T` — Tool calls (code-side) and `CodeToolError` (tests) — (modified)
- `V14a` — Tool calls (code-side) and `CodeToolError` — (modified)
- `V15a-T` — Invocation core (tests) — (modified)
- `V15a` — Invocation core — (modified)

## Consequence

**Severity:** correctness

The depth-overflow breach at code-driven tool args and at `invoke` `params`/`invoke<T>` return is a normative ceiling-#4 enforcement site, but no leaf asserts that the breach is wrapped into `CodeToolError` (V14a) or `InvokeInfraError` (V15a). A V14a/V15a implementation that fails to run the depth walk before AJV, or that surfaces the breach as a bare AJV error rather than the ceiling-#4 `maxDepth` surface, reds no test; the per-boundary routing V5e asserts in isolation is never confirmed at the live carrier, so two reasonable implementers could wire those two sites differently and both pass.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 3fa39a9 — pi-loom plan: resolve "V5e per-boundary routing test asserts destination error surfaces its Deps cannot reach" (2026-06-11, Thomas Andersen)
**History:** The depth walk and per-boundary routing were present in the first plan commit (c6a664e, 2026-06-10), where `V5e` itself claimed to fire `maxDepth` "at each of the five sites" — overreaching beyond its Deps. Commit 3fa39a9 corrected that overreach by recasting `V5e` to assert the routing decision in isolation and delegating the actual depth-6 wrapping to the four carrier leaves (`V13c`/`V14a`/`V15a`/`V4e`). `V13c` and `V4e` already carried matching assertions, but `V14a` and `V15a` were never updated to receive the delegated obligation (`git log -S 'maxDepth'` shows the token was never present in either file), so the dangling delegation entered with 3fa39a9.

## Solution Space

**Shape:** single

### Recommendation

Add the delegated live-carrier assertions to the two leaves V5e points at:

- In `V15a` (and its `V15a-T` partner) Tests: a depth-6 value supplied as an `invoke` `params` argument and a depth-6 `invoke<T>` return value each trip the loom-owned depth walk before AJV and surface wrapped as `InvokeInfraError` with `cause:"validation"` and `schema_keyword:"maxDepth"` (message `"JSON document depth exceeds 5"`), and add the corresponding clause to V15a's Ships-when.
- In `V14a` (and its `V14a-T` partner) Tests: a depth-6 code-driven tool-call argument trips the depth walk before AJV and surfaces wrapped as `CodeToolError` with `cause:"validation"` and `schema_keyword:"maxDepth"`, and add the corresponding clause to V14a's Ships-when.

These close V5e's "asserted at the site owner: … `CodeToolError` at `V14a`, `InvokeInfraError` at `V15a`" delegation so each enforcement site has a live witness. `V5e` itself needs no edit once the carriers assert their rows; its decision-only Tests bullet is then accurate. `V13c` (`ValidationError`) and `V4e` (`ERR-16` slash-load cross-route) already satisfy their delegated rows and need no change. Watch the cross-ceiling case at the `params` boundary: per CIO-1 a ceiling-#4 breach at the binder `params` boundary is routed to ceiling #3 (already exercised by `V11f`), so the V15a `invoke`-`params` vector must target the runtime `invoke` boundary, not the binder slash-load `params` boundary, to avoid colliding with that cross-route.

## Relationships

- T04 "H7a permitted-code-list provenance is bound to a Deps set narrower than the pipeline it gates" — same-cluster (both concern whether downstream live-surface coverage of the integrated path is complete)

---

# T06 — SLSH-5 chain attribution presupposes per-hop call-site source-line provenance that no leaf records

**Original heading:** Chain attribution presupposes per-hop call-site source-line provenance without declaring its source
**Original section:** docs/plan_topics/V12b-top-level-err-chain.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V12b`'s `SLSH-5` test renders the recursive invoke-chain suffix ` from <callee> invoked at <parent>:<line>` for every `invoke_callee` hop, leaf-first. The `<line>` component is the 1-indexed source line of the call-site token in the parent loom (the `invoke(` token of a literal call, or the callee-name identifier of a `.loom`-callable bare-identifier call), and `<parent_path>` is the post-`realpath` parent loom path — per [`slash-invocation.md` SLSH-5](../spec_topics/slash-invocation.md), both drawn from "the immediate parent's invocation record". That per-hop `(parent_path, call-site line)` pair is therefore a provenance the renderer must read out of an invocation record at SLSH-5 render time.

No leaf in the plan declares where that provenance is produced. `V12b`'s `Deps` list `V12b-T, V12a, V4d, V15a`, but none of them threads it: the `InvokeCalleeError` schema `V4d` adds carries only `kind`, `message`, `callee_path`, and `inner` — it has no `parent_path` and no call-site `<line>` field, so the QueryError chain alone cannot supply the suffix. `V15a` (the invoke core, already a `Dep` of `V12b`) is the natural producer, but its `Adds` enumerate the invoke-core mechanisms (containment, parse cache, return-type check, cross-mode matrix, prompt→prompt suspend) without recording, per hop, the parent loom path and the call-site token's source line into a per-frame invocation record.

The result is a presupposed-but-unowned provenance: an implementer building `V15a` strictly from its `Adds` would not capture the call-site source line, and an implementer picking up `V12b` from its `Deps` is not told which leaf supplies it — leaving the SLSH-5 suffix unrenderable as specified.

## Plan Documents

- `docs/plan_topics/V15a-invocation-core.md` — Adds / invoke core (edited)
- `docs/plan_topics/V15a-T-invocation-core.md` — Tests (edited)
- `docs/plan_topics/V12b-top-level-err-chain.md` — SLSH-5 chain attribution (edited)
- `docs/plan_topics/V12b-T-top-level-err-chain.md` — SLSH-5 test (edited)
- `docs/plan_topics/V4d-queryerror-variants.md` — `InvokeCalleeError` variant shape (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** V4 — Errors and results; V12 — Slash invocation; V15 — Invocation and imports

**Leaves (implementation order):**

- `V4d` — `QueryError` variant schema — (blocked)
- `V12b` — Top-level `Err` formatting and chain attribution — (modified)
- `V12b-T` — Top-level `Err` formatting and chain attribution (tests) — (modified)
- `V15a` — Invocation core — (modified)
- `V15a-T` — Invocation core (tests) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: the `V15a` author, following its `Adds`, omits source-line capture, while the `V12b` author assumes the provenance arrives through the declared `Dep` on `V15a`. The SLSH-5 suffix then cannot render `<parent>:<line>` as specified, or the `V12b` implementer invents an ad-hoc capture mechanism off-script.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V12b` (with its SLSH-5 chain-attribution test) and `V15a` (the invoke core) were both authored in the plan's initial build commit c6a664e; `git log -S "invoked at"` shows SLSH-5 has no earlier occurrence. The provenance gap — SLSH-5 rendering `<parent>:<line>` while no leaf records per-hop call-site source-line provenance — has been present since that first commit. The four later edits to `V15a` (e2d385b, cddd2b4, 249cec5, 75a9bcd) addressed unrelated findings and never added source-line recording.

## Solution Space

**Shape:** single

### Recommendation

Make `V15a` the declared producer of the per-hop call-site provenance SLSH-5 consumes, and tell `V12b` it reads that provenance from `V15a`'s invocation record.

- In `docs/plan_topics/V15a-invocation-core.md`, extend the **Adds.** invoke-core enumeration to state that the invoke core records, per `invoke` hop, the invocation provenance the SLSH-5 chain suffix consumes: the post-`realpath` parent loom path and the 1-indexed source line of the call-site token (the `invoke(` token of a literal `invoke(...)` call, or the callee-name identifier of a `.loom`-callable bare-identifier call) into the per-frame invocation record. This is the same `realpath`-normalised parent path already recorded for discovery-root containment, augmented with the call-site line.
- In `docs/plan_topics/V15a-invocation-core.md` and `docs/plan_topics/V15a-T-invocation-core.md`, add an `INV` test asserting that, for an executed `invoke` hop, the invocation record exposes the parent loom's post-`realpath` path and the call-site token's 1-indexed source line (with a multi-line call confirming the line is the call-site token's, not a receiving binding's).
- In `docs/plan_topics/V12b-top-level-err-chain.md` and `docs/plan_topics/V12b-T-top-level-err-chain.md`, add a note to the SLSH-5 bullet that the per-hop `<parent_path>:<line>` provenance is consumed from `V15a`'s invocation record (`V15a` is already in `V12b`'s `Deps`), so this leaf renders from that record rather than deriving source positions itself.

Edge case: the `.loom`-callable bare-identifier surface (e.g. `summarise(doc)` resolving to `./summariser.loom`) must record the line of the callee-name identifier token, matching the literal-`invoke(...)` surface — the recording mechanism must cover both call forms because SLSH-5 treats them identically.

`V4d`'s `InvokeCalleeError` schema needs no new field: the spec already places `<parent_path>`/`<line>` in the invocation record, not on the wire variant, so the provenance stays out-of-band.

## Relationships

None

---

# T07 — V10b per-read-deadline formula variable `t` is undefined

**Original heading:** Per-read-deadline formula variable `t` is undefined
**Original section:** docs/plan_topics/V10b-package-discovery.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`V10b`'s **Adds.** field declares the per-package-read deadline as `max(200, floor(t/10))` but never binds `t`. The same clause names two distinct millisecond quantities the reader could plausibly substitute: the literal `timeoutMs` 2000 stated immediately before it (which makes the per-read deadline a constant 200 ms regardless of operator settings), or the operator-tunable, settings-merged `looms.scanPackagesTimeoutMs` (which makes the per-read deadline scale with the operator override). These are observably different timings.

The spec is unambiguous on the intended binding: `package-and-settings.md` §DISC-6 defines `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))` and states "raising the global cap automatically raises the per-read budget" — i.e. `t` is the merged `looms.scanPackagesTimeoutMs`, and the per-read deadline tracks the operator override (default `2000 ms` cap → `200 ms` per-read). V10b's abbreviated `t` drops this binding, so the leaf alone does not determine whether the per-read deadline is fixed or scaling.

V10b's Tests do not close the gap: the `DISC-6` settings-sourced vector asserts the *global* `scanPackagesTimeoutMs` trip point but never the per-read deadline's scaling, so the test gate passes for either reading.

## Plan Documents

- `docs/plan_topics/V10b-package-discovery.md` — Adds (edited)
- `docs/plan_topics/V10b-T-package-discovery.md` — Tests (edited)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — §DISC-6 (read-only; canonical source of the deadline formula)

## Affected Leaves

**Phases:** Vertical slices (V10 — Discovery and settings)

**Leaves (implementation order):**

- `V10b-T` — Package discovery (bounded walk) (tests) — (modified)
- `V10b` — Package discovery (bounded walk) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge on observable timing: one reads `t` as the fixed `2000` default and hardcodes a `200 ms` per-read deadline; the other reads it as the merged `looms.scanPackagesTimeoutMs` and scales the deadline with the operator override. The spec mandates the scaling form, so the constant-200 reading silently ships behaviour that contradicts DISC-6, and the existing V10b tests do not catch it.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e1194227df0702609667f3ee8be2e8c6b2 ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The plan corpus is git-tracked. `docs/plan_topics/V10b-package-discovery.md` was created in `c6a664e` carrying the `max(200, floor(t/10))` clause verbatim (`git log -S 'floor(t/10)'` returns only that commit; `git show c6a664e:docs/plan_topics/V10b-package-discovery.md` shows the unbound `t` in the Adds line at creation). The only later commit touching the file, `e965634` ("resolve 'V10c settings keys read but application not asserted'"), did not modify the formula. The defect has been present since the leaf was first authored.

## Solution Space

**Shape:** single

### Recommendation

In `V10b`'s **Adds.** field, replace the abbreviated `max(200, floor(t/10))` with the spec's fully-bound form and make the scaling explicit. Concretely, change the per-read-deadline clause to read:

> the per-read deadline `max(200, floor(looms.scanPackagesTimeoutMs / 10))` via `Clock.setTimeout` (default `2000 ms` global cap → `200 ms` per-read; a raised `looms.scanPackagesTimeoutMs` raises the per-read budget proportionally)

This binds `t` to the merged `looms.scanPackagesTimeoutMs` (matching `package-and-settings.md` §DISC-6) and states that the per-read deadline tracks the operator override rather than the literal `2000` default.

Edge case for the implementer: V10b's existing `DISC-6` settings-sourced Tests bullet pins the *global* cap's trip point but not the per-read deadline's scaling. Add a vector to `V10b`/`V10b-T` that drives a merged `looms.scanPackagesTimeoutMs` distinct from `2000` through the `FakeClock` seam and asserts the per-read `package-read-timeout` fires at `max(200, floor(override/10))`, so the constant-200 misreading reds a test rather than passing vacuously.

## Relationships

None

---

# T08 — V11d system-prompt-structure test bullet's leading "reproduces … exactly" over-asserts wording the spec leaves free

**Original heading:** "all eight structured items (1–8) exactly" risks over-asserting wording the spec leaves free
**Original section:** docs/plan_topics/V11d-defaulting-echo.md
**Kind:** implementability
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

The spec's *Binder system prompt* contract (`binder-bypass-and-envelope.md`, §*Binder system prompt* / §*System-prompt structure (normative)*) is explicit that the prompt's prose wording is **not** part of the contract: "The exact wording is not part of the contract; the structural obligations enumerated under *System-prompt structure (normative)* below are," and "an alternative renderer that satisfies every obligation in the structure list is equally conformant." Only three surfaces are byte-exact — the *Type display* reference renderings, the *Default-literal rendering* forms, and the four *Parameter-line reference renderings*. Everything else about the eight structured items is a structural / conditional-presence obligation (tokens, line-prefixes, presence-when-trigger / absent-when-no-trigger), not a fixed byte sequence.

V11d's and V11d-T's first Tests bullet opens with "the builder reproduces all eight structured items (1–8) **exactly**". Read literally, the leading "exactly" attaches to all eight items and reads as a byte-exact whole-prompt wording mandate, even though the bullet then correctly narrows to the genuinely-pinned surfaces (Type display, Default-literal, Parameter-line renderings). The leading phrase is at odds with the spec it cites in the same bullet.

A test author following the bullet's opening clause could assert byte-exact equality of the entire rendered prompt, locking in incidental wording the spec deliberately leaves free; such a test would red a conformant alternative renderer, directly contradicting the spec's "equally conformant" guarantee. The fix is to scope "exactly" to the pinned surfaces only — assert presence / conditional-presence of the eight items, and byte-exactness only for the Type-display, Default-literal, and Parameter-line renderings.

## Plan Documents

- `docs/plan_topics/V11d-defaulting-echo.md` — Tests bullet 1 (system-prompt structure) (edited)
- `docs/plan_topics/V11d-T-defaulting-echo.md` — Tests bullet 1 (system-prompt structure) (edited)

## Spec Documents

- `docs/spec_topics/binder/binder-bypass-and-envelope.md` — §Binder system prompt / §System-prompt structure (normative) (read-only)

## Affected Leaves

**Phases:** Vertical — V11 (Binder)

**Leaves (implementation order):**

- `V11d` — System-prompt builder, defaulting, and echo — (modified)
- `V11d-T` — System-prompt builder, defaulting, and echo (tests) — (modified)

## Consequence

**Severity:** advisory

A test author reading the bullet's leading "reproduces all eight structured items (1–8) exactly" could write a byte-exact whole-prompt assertion, pinning incidental wording the spec explicitly leaves free; that test would falsely red a conformant alternative renderer. The cited spec anchor is authoritative and the bullet self-corrects in its tail, so a careful implementer can still build the leaf — but the leading phrase invites a brittle, over-strict test.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 0ef467d — pi-loom plan: resolve "V11d binder system-prompt builder has no binding test" (2026-06-11, Thomas Andersen)
**History:** The system-prompt-structure Tests bullet did not exist before 0ef467d; `git log -S 'all eight structured items'` localises the phrase to that single commit, and `git show 0ef467d` confirms the bullet (with the leading "reproduces all eight structured items (1–8) exactly") was added to both `V11d-defaulting-echo.md` and `V11d-T-defaulting-echo.md` to close a prior review finding that V11d's binder system-prompt builder had no binding test. The fix that added the missing test simultaneously introduced the over-assertive "exactly" framing.

## Solution Space

**Shape:** single

### Recommendation

In both `docs/plan_topics/V11d-defaulting-echo.md` and `docs/plan_topics/V11d-T-defaulting-echo.md`, reword the leading clause of the first Tests bullet so "exactly" / byte-exactness attaches only to the spec-pinned surfaces, not to the eight items as a whole. Concretely, replace the opening "the builder reproduces all eight structured items (1–8) exactly, including …" with a form that asserts presence / conditional-presence (not byte-exact wording) for the eight items and reserves byte-exactness for the pinned renderings — e.g. "the builder satisfies all eight structured items (1–8), asserting the trigger-present **and** trigger-absent conditions for items 2/3/4/6, and reproduces byte-exact the *Type display*, *Default-literal rendering*, and *Parameter-line reference renderings*". Keep the existing tail (the Type-display table, the Default-literal forms, and the four Parameter-line renderings including the description-omitted form) — those are the correct byte-exact targets. Apply the identical edit to both files so the implementation leaf and its test pair stay in lockstep. The spec file is read-only for this fix; do not weaken or restate the spec's normative obligations.

## Relationships

- T20 "Systemic leaf over-bundling across the leaf corpus" — decision-dependency (the V11d split relocates the system-prompt builder; this wording fix applies to whichever leaf owns the system-prompt-builder bullet after the split)

---

# T09 — `ReloadFailureInjector` seam has two owners (V9b and V10c) with no canonical declaration site and no connecting Deps edge

**Original heading:** `ReloadFailureInjector` seam claimed "owned here" by both V9b and V10c with no canonical home and no Deps edge
**Original section:** docs/plan_topics/V9b-registration-drain-state.md
**Kind:** implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

The test-only `ReloadFailureInjector` interface (whose `injectReloadFailure` method routes a synthetic watcher-time reload failure onto the `loom-system-note` surfacing path) is the injection seam that `V4e`'s `ERR-7` test exercises. Both `V9b` and `V10c` claim it: `V9b`'s `Adds` says "the test-only `ReloadFailureInjector` interface … is owned here", and `V10c`'s `Adds` says "the settings-re-merge sub-arm of the watcher-time reload failure-injection seam — the test-only `ReloadFailureInjector` interface … is owned here". Two leaves thus declare the same named interface as owned locally.

Neither leaf lists the other in its `Deps` — `V9b`'s `Deps` are `V9b-T, V9a, V10a, V8b, V6a` and `V10c`'s are `V10c-T, V8b` — so there is no declared edge establishing which leaf depends on the other's declaration. `V4e`'s `ERR-7` test injects "via `ReloadFailureInjector.injectReloadFailure` … owned by `V9b` … and `V10c` … exercising both arms", binding the single method name across both arms with no statement of which module declares the interface a `V4e` implementer must import.

The spec frames `ERR-7` as one surface with two failure outcomes (`package-and-settings.md#watcher-time-reload-failures`: registry-swap failure plus re-parse/re-merge diagnostic), and `V4e` calls a single `injectReloadFailure` method — implying one interface — yet the plan stamps "owned here" on two leaves. An implementer of `V9b` declares `ReloadFailureInjector`; an implementer of `V10c`, reading the same "owned here" phrasing, declares it again, producing a duplicated and potentially divergent interface, or an undeclared cross-leaf import.

## Plan Documents

- `docs/plan_topics/V9b-registration-drain-state.md` — `Adds` (edited)
- `docs/plan_topics/V10c-settings-merge.md` — `Adds` / `Deps` (edited)
- `docs/plan_topics/V4e-pre-evaluation-failures.md` — `ERR-7` Tests / `Deps` (edited)
- `docs/plan_topics/V4e-T-pre-evaluation-failures.md` — `ERR-7` Tests / `Deps` (edited)
- `docs/plan_topics/conventions.md` — Leaf format (`Deps`) discipline (read-only)

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — `#watcher-time-reload-failures` (read-only)
- `docs/spec_topics/errors-and-results/error-model.md` — `#err-7` (read-only)

## Affected Leaves

**Phases:** V4 — Errors and results; V9 — Extension host integration; V10 — Discovery and settings

**Leaves (implementation order):**

- `V4e` — Pre-evaluation failures — (modified)
- `V4e-T` — Pre-evaluation failures (tests) — (modified)
- `V9b` — Registration steps and drain-state contract — (modified)
- `V10c` — Settings reads and merge — (both)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one declares `ReloadFailureInjector` in `V9b`, the other re-declares it in `V10c` under the same "owned here" licence, yielding two interfaces that can drift apart. `V4e`'s `ERR-7` test binds a single `injectReloadFailure` name across both arms with no stated import source, so it cannot reliably resolve against a single seam type — the test either fails to compile against a duplicated type or silently exercises only one arm.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** d64dce5 — pi-loom plan: resolve "Watcher-time reload failure-injection seam under-specified and ungated" (2026-06-11, Thomas Andersen)
**History:** The `ReloadFailureInjector` interface and the "is owned here" phrasing entered `V9b`, `V10c`, `V4e`, and `V4e-T` together in d64dce5, the commit that resolved the earlier "Watcher-time reload failure-injection seam under-specified and ungated" finding. That fix elaborated the seam across both producer leaves but stamped each with "owned here" for the same named interface without naming a single declaration site or adding a `V9b`↔`V10c` `Deps` edge, so the under-specification fix introduced the dual-ownership defect.

## Solution Space

**Shape:** single

### Recommendation

Treat `ReloadFailureInjector` as one interface for the whole watcher-time reload failure-injection seam, declared once in `V9b`; `V10c` contributes only the settings-re-merge arm against that interface. The spec exercises `ERR-7` through a single `injectReloadFailure` call across both arms, so a single interface is the lower-risk match for the spec's one-seam / one-method framing.

- `V9b` `Adds`: state that `V9b` is the single declaration site of the `ReloadFailureInjector` interface for all three arms (registry-swap, `.loom`/`.warp` re-parse, settings re-merge).
- `V10c` `Adds`: replace "the test-only `ReloadFailureInjector` interface … is owned here" with a statement that `V10c` contributes the settings-re-merge arm against the `ReloadFailureInjector` interface declared by `V9b`.
- `V10c` and `V10c-T` `Deps`: add `V9b`.
- `V4e` / `V4e-T` `ERR-7` prose: name `V9b` as the import source for the `ReloadFailureInjector` interface, while still attributing the settings-re-merge arm to `V10c`.

Edge case: the new edge must land on the leaf that does *not* declare (`V10c`→`V9b`), and `V4e`'s `ERR-7` prose must point its import at `V9b` while still naming `V10c` as the settings-re-merge arm owner. If `V9b` is later split, the declaration site must travel with the registration sub-leaf.

## Relationships

- T20 "Systemic leaf over-bundling across the leaf corpus" — decision-dependency (the V9b split folds the failure-injection seam into a registration sub-leaf; the canonical-home choice must land on whichever sub-leaf declares the interface)

---

# T10 — V9h cites "four discriminators" for `pinned-constant-unreadable` without enumerating them — and the count is ambiguous against the spec

**Original heading:** "four discriminators" referenced but not enumerated
**Original section:** docs/plan_topics/V9h-degraded-unknown-reason.md
**Kind:** clarity
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

`V9h`'s second Tests bullet (mirrored verbatim in the test-companion leaf `V9h-T`) reads: *"A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` with its four discriminators."* The phrase "its four discriminators" is neither enumerated in the leaf nor cross-referenced to the spec page that owns the set, so a test author cannot construct the discriminator-coverage assertion from the leaf alone.

The count is also ambiguous — and arguably wrong — against the spec. `pi-integration-contract/unknown-reason-rule.md` pins the `details.failure` discriminator set as a **closed set of three forms**: the two literals `"missing-entry"` and `"literals-shape-invalid"`, plus the `"throw:<String(error)>"` template family (the spec states explicitly: *"the three pinned-constant-unreadable discriminator literals"*). Separately, the same page describes the snapshot-side failure routing as *"four arms"* (two of which both collapse to `"missing-entry"`), and the `"literals-shape-invalid"` discriminator itself fans out into *four* structurally-distinct sub-cases each requiring its own conformance fixture. "Four discriminators" therefore maps to none of these cleanly: a reader cannot tell whether the bullet means the three discriminator literal forms, the four failure-routing arms, or the four `"literals-shape-invalid"` sub-cases.

## Plan Documents

- `docs/plan_topics/V9h-degraded-unknown-reason.md` — Tests bullet 2 (edited)
- `docs/plan_topics/V9h-T-degraded-unknown-reason.md` — Tests bullet 2 (edited)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/unknown-reason-rule.md` — `details.failure` discriminator set and sub-anchor `#unknown-reason-rule-handler-trycatch` / substring (d) (read-only)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `<failure>` carve-out (read-only)

## Affected Leaves

**Phases:** Vertical slices (V9 — Extension host integration)

**Leaves (implementation order):**

- `V9h-T` — Session-only degraded state and unknown-reason rule (tests) — (modified)
- `V9h` — Session-only degraded state and unknown-reason rule — (modified)

## Consequence

**Severity:** correctness

A test author implementing `V9h-T` cannot derive the required discriminator-coverage assertions from the leaf: a literal reading of "four discriminators" does not match the spec's three-form `details.failure` set, and two reasonable implementers diverge on whether to assert three discriminator values, four routing arms, or four `"literals-shape-invalid"` sub-case fixtures. The test-registry gate keys on the leaf's Tests bullets, so the imprecise count leaves discriminator coverage unverifiable at the leaf level.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e ("pi-loom plan: build/update plan for spec.md + review", 2026-06-10)
**History:** The plan corpus is git-tracked. `docs/plan_topics/V9h-degraded-unknown-reason.md` and its test twin `V9h-T-degraded-unknown-reason.md` were both added in c6a664e (the initial plan-build commit; confirmed via `git log --diff-filter=A`). `git log -S "four discriminators"` locates the token's only introduction in that same commit, and the later c6a664e→a70e2a7 edit ("resolve V9h degraded-state branch over unresolved host contradiction") did not touch the discriminators line. The imprecise phrasing has therefore been present since the leaf was authored; no later edit introduced or perturbed it.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/V9h-degraded-unknown-reason.md` Tests bullet 2, strike `with its four discriminators` and replace it with an enumeration cross-referenced to the discriminator set `unknown-reason-rule.md` owns. Concretely, rewrite the bullet to read: *"A snapshot read failure emits `loom/host/session-shutdown-pinned-constant-unreadable` carrying a `details.failure` discriminator from the closed set defined by [`unknown-reason-rule.md`](../spec_topics/pi-integration-contract/unknown-reason-rule.md#unknown-reason-rule-handler-trycatch) — the two literals `"missing-entry"` and `"literals-shape-invalid"`, plus the `"throw:<String(error)>"` template family — with the four `"literals-shape-invalid"` sub-cases each witnessed by their own fixture."* Apply the identical replacement to the mirrored Tests bullet 2 in `docs/plan_topics/V9h-T-degraded-unknown-reason.md` so the two leaves stay in lockstep.

This removes the bare "four" count and pins the acceptance criterion to the spec's authoritative three-form set while preserving the four-fixture obligation the spec attaches to `"literals-shape-invalid"`. The discriminator literals are anchor-stable contract surface (substring (d) of the unknown-reason rule), so cite them exactly as the spec spells them.

## Relationships

- T11 "V9h parks a blocking dependency and open-risk note in a non-standard inline `Precondition` field" — same-cluster (same V9h leaf; resolves independently)
- T25 "Degraded-state obligations are required green at loom 1.0 over an open spec contradiction" — same-cluster (touches V9h's snapshot-failure path, which stays in V9h; resolves independently)

---

# T11 — `V9h` parks a blocking dependency and open-risk note in a non-standard inline `Precondition` field

**Original heading:** Precondition block is misplaced inline normative/decide-later content
**Original section:** docs/plan_topics/V9h-degraded-unknown-reason.md
**Kind:** cruft, placement
**Importance:** medium
**Score:** 20
**MustFix:** false

## Finding

`docs/plan_topics/V9h-degraded-unknown-reason.md` carries a `**Precondition — degraded-state branch is gated.**` block between the `**Spec.**` and `**Adds.**` fields. `conventions.md §Leaf format` states every leaf has the same five fields in the same order (Spec/Convention, Adds, Tests, Deps, Ships when), with the blank skeleton in `leaf-template.md`; the `Precondition` block is a sixth, non-standard field.

The block does two things, neither of which belongs inline in the leaf body. First, it asserts a hard **blocking dependency**: the SM-4 / SM-5 / SM-6 / SM-3b degraded-state obligations "MUST be authoritatively resolved … before [they] are implemented", and "the resolution may find the branch unreachable as written and require those obligations to be reworked." That is a sequencing/blocked-leaf constraint expressed as prose rather than as a `Deps.` edge or a structural blocked-leaf signal. Second, it parks a paragraph-length **open-risk / decide-later** note about an unresolved spec contradiction (host-prerequisites clause (a)) — a plan-level scheduling concern.

Both payloads are invisible to anyone reading `docs/plan.md`, which only links the leaf file and has no Blocked Obligations or Open Questions section. A leaf-sequencer reading `Deps.` sees `V9h-T, V9b, V18c` and no signal that the degraded obligations are gated on an unresolved contradiction, while a reader of the leaf body sees a hard precondition — the two readers diverge on whether `V9h`'s degraded arm is pickable.

## Plan Documents

- `docs/plan_topics/V9h-degraded-unknown-reason.md` — leaf body, `Precondition` block between `Spec.` and `Adds.` (edited)
- `docs/plan.md` — `V9` slice listing / a Blocked Obligations or Open Questions section to surface the plan-level risk (edited)
- `docs/plan_topics/conventions.md` — `§Leaf format` (defines the five-field format the block violates) (read-only)
- `docs/plan_topics/leaf-template.md` — canonical field skeleton (read-only)

## Spec Documents

None — the fix is purely internal relocation across plan files. (`host-prerequisites.md#degraded-state-host-prerequisites` and `version-bump-step2.md#bump-checklist-instance-survival` are referenced by the block but not edited; the spec contradiction itself is owned by the related higher-severity finding, not this one.)

## Affected Leaves

**Phases:** Vertical slices — V9

**Leaves (implementation order):**

- `V9h` — Session-only degraded state and unknown-reason rule — (modified)

(`V9g` lists `V9h` in `Deps.` and would inherit any blocked-leaf signal under the co-resolved split below, but the minimal placement fix in isolation does not edit it.)

## Consequence

**Severity:** correctness

The blocking dependency on the unresolved clause-(a) contradiction is expressed only as prose in a non-standard field, so it is absent from `Deps.` and from plan.md. A planner or sequencer reading the plan would treat `V9h`'s degraded arm as pickable while the leaf body says it is gated — two reasonable readers diverge on whether the work can start, and no structural signal stops the degraded obligations from being implemented (and green-gated) ahead of the resolution.

## Issue introduction

**Verdict:** single-commit

**Introducing commit:** `a70e2a7` — "pi-loom plan: resolve \"V9h degraded-state branch over unresolved host contradiction\"" (2026-06-11)

**History:** `docs/plan_topics/V9h-degraded-unknown-reason.md` was created at `c6a664e` (2026-06-10, "pi-loom plan: build/update plan for spec.md + review") with the standard five-field leaf format and no `Precondition` block. Commit `a70e2a7` (2026-06-11) added the `**Precondition — degraded-state branch is gated.**` block (and the `host-prerequisites.md` Spec link) while resolving a prior-review finding about the degraded-state branch resting on an unresolved host-prerequisite contradiction. `git log -S 'Precondition — degraded-state branch is gated'` over `docs/plan_topics/` confirms `a70e2a7` is the sole introducing commit; the misplaced-inline form entered the corpus as the chosen vehicle for that earlier resolution.

## Solution Space

**Shape:** single

### Recommendation

Strike the entire `**Precondition — degraded-state branch is gated.**` block (the paragraph between `**Spec.**` and `**Adds.**`) from `docs/plan_topics/V9h-degraded-unknown-reason.md` so the leaf returns to the five-field format in `conventions.md §Leaf format`. Re-home its two distinct payloads:

- **Blocking relationship** — the SM-4 / SM-5 / SM-6 / SM-3b degraded-state obligations are gated on host-prerequisites clause (a): express this as a structural blocked-leaf signal a sequencer reading leaf metadata / `Deps.` can observe, not as prose in a non-standard field.
- **Plan-level scheduling/risk** — clause (a) is an open spec contradiction whose resolution may render the branch unreachable as written: surface this in `docs/plan.md` where a planner reading the plan sees it (e.g. a Blocked Obligations / Open Questions entry), since plan.md has no such section today and the concern is currently invisible there.

Keep the authoritative tracking of clause (a) at the version-bump editorial-review checklist item (a) (`version-bump-step2.md#bump-checklist-instance-survival`); do not re-park the tracking obligation in the leaf body. The `host-prerequisites.md#degraded-state-host-prerequisites` link added alongside the block stays in `**Spec.**`.

## Relationships

- T25 "Degraded-state obligations are required green at loom 1.0 over an open spec contradiction" — co-resolve (same `V9h` leaf; its split-into-a-blocked-leaf decision constrains where this finding's blocked-leaf signal and plan-level risk note land, and the same restructuring can co-resolve both — apply that decision first, then land this placement correction on the resulting structure)
- T10 "V9h cites 'four discriminators' without enumerating them" — same-cluster (same `V9h` leaf; resolves independently)

---

# T12 — Transitive-completeness arm's named-singleton example `(H5a, M)` omits H1a

**Original heading:** Singleton-enumeration example `(H5a, M)` omits H1a, contradicting the data it illustrates
**Original section:** docs/plan_topics/H5a-closing-gate-automation.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H5a`'s `Adds.` defines the standing transitive-completeness arm, which requires at least one leaf ID from each closing-leaf cell of `coverage-matrix.md` to be a member of `H5b`'s `Deps.` after "expanding both sides' contiguous ranges (e.g. `V1a–V18d`) and `H5b`'s named singletons (`H5a`, `M`)". The parenthetical names two singletons, but `H5b`'s actual `Deps.` carries three non-range entries: `H1a`, `H5a`, `M`. `H1a` is the closing leaf for the un-anchored `typebox "*"` MUST-NOT cell, as `H5b`'s own `Deps.` rationale note and `H6a`'s prose both state (`H6a` correctly enumerates the set as `(H1a, H5a, M)`).

The example therefore contradicts the data it purports to illustrate, and `H5a`'s `(H5a, M)` is the lone place in the plan that drops `H1a` from the singleton set. An implementer building the arm who treats the parenthetical as the literal singleton enumeration would expand `H5b`'s named singletons to `{H5a, M}`, omitting `H1a`. The `typebox "*"` MUST-NOT cell — whose only listed leaf is `H1a`, and which is not covered by any `V`-range — would then have no listed leaf in the expanded set, and the arm would report a CI failure against a coverage cell that is in fact correctly closed.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds.` (transitive-completeness arm sentence) (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` (read-only; the source of truth for the singleton set)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Deps rationale note (read-only; already enumerates `(H1a, H5a, M)` correctly)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one reads `H5b`'s actual `Deps.` and includes `H1a`; one hardcodes the `(H5a, M)` example and omits it. The latter builds a transitive-completeness arm that falsely reddens CI on the correctly-closed `typebox "*"` MUST-NOT cell (whose sole closing leaf `H1a` appears only as a named singleton, not inside any `V`-range).

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 08bd641 — pi-loom plan: resolve "H5b coverage Deps completeness has no mechanical backstop" (2026-06-11, Thomas Andersen)
**History:** Commit 08bd641 introduced the transitive-completeness arm in `H5a`'s `Adds.`, authoring the named-singleton example as `(H5a, M)`. `H1a` had already been added to `H5b`'s `Deps.` by the earlier ancestor commit 25b911f ("resolve 'H1a missing from H5b's Deps'"), so when 08bd641 wrote the parenthetical `H5b`'s singleton set was already `H1a, H5a, M`; the new prose simply omitted the pre-existing `H1a`. The inconsistency is wholly contained in 08bd641.

## Solution Space

**Shape:** single

### Recommendation

In `H5a`'s `Adds.`, in the transitive-completeness arm sentence, change the singleton-expansion clause from `H5b`'s named singletons (`H5a`, `M`) to enumerate all three non-range `Deps.` entries: `H5b`'s named singletons (`H1a`, `H5a`, `M`). Equivalently, the parenthetical may be dropped in favour of referring to "every non-range entry in `H5b`'s `Deps.`", which stays correct if the singleton set later changes. Either form removes the contradiction with `H5b`'s `Deps.`; the enumerated form matches the phrasing already used in `H6a`'s Deps rationale note.

## Relationships

- T13 "H5a transitive-completeness arm illustrates range expansion with an unexpandable cross-group range" — same-cluster (same transitive-completeness-arm sentence in `H5a`'s `Adds.`; resolves independently)
- T20 "Systemic leaf over-bundling across the leaf corpus" — decision-dependency (a split of `H5a` would relocate the transitive-completeness arm carrying this example)

---

# T13 — H5a transitive-completeness arm illustrates range expansion with an unexpandable cross-group range

**Original heading:** Cross-group range `V1a–V18d` has no defined expansion order
**Original section:** docs/plan_topics/H5a-closing-gate-automation.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

H5a's `Adds.` defines a standing transitive-completeness arm whose mechanism is: "for every closing-leaf cell … the arm requires AT LEAST ONE of the leaf IDs that cell lists to be a member of `H5b`'s `Deps.` after expanding both sides' contiguous ranges (e.g. `V1a–V18d`) and `H5b`'s named singletons (`H5a`, `M`)". The worked example `V1a–V18d` is a **cross-group** range — it spans every vertical slice group from V1 through V18.

There is no defined enumeration for such a range. `plan.md`'s "Vertical slices" intro states slice numbering "is an editorial grouping that only roughly tracks the dependency DAG … it is not a topological order", and `conventions.md` item 3 says slices "are roughly ordered by their dependency DAG … Reorder freely". So the membership and ordering of leaves between `V1a` and `V18d` is not fixed by any rule the plan states; expanding the range requires an implementer to invent a canonical leaf sequence that does not exist.

The ranges actually present in `H5b`'s `Deps.` are all **within-group** (`V1a`–`V1b`, `V2a`–`V2d`, … `V18a`–`V18d`) — each spans a single `<group>` number and varies only the letter suffix, which is well-defined. The arm only ever needs within-group expansion; the cross-group `V1a–V18d` example is illustrative only, but it tells an implementer to build a more general expander than the data requires, and a more general one whose semantics the plan never pins. Two implementers reading this sentence implement different expanders: one restricts to within-group letter-suffix expansion (correct against the real `Deps.`), another attempts whole-range expansion and must guess the leaf order.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md` — `Adds.` (transitive-completeness arm) (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps.` (read-only — the expansion target; its ranges are all within-group)
- `docs/plan.md` — "Vertical slices" intro (read-only — establishes editorial, non-topological slice numbering)
- `docs/plan_topics/conventions.md` — item 3 + `Leaf format` (`Deps.`) (read-only — range usage and editorial numbering)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H5a` — REQ-ID / diagnostic-code closing-gate automation — (modified)

## Consequence

**Severity:** correctness

The transitive-completeness arm is the mechanism that mechanically backs the coverage closure obligation. Because the example instructs the implementer to expand a range whose enumeration the plan explicitly declares non-canonical, two reasonable implementers produce different expanders — one matching the real within-group `Deps.` data, one guessing a cross-group leaf order — so the same coverage-matrix cell can pass the gate for one and red it for the other.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 08bd641 — pi-loom plan: resolve "H5b coverage Deps completeness has no mechanical backstop" (2026-06-11, Thomas Andersen)
**History:** The transitive-completeness plan-structural arm was authored into H5a's `Adds.` in this commit, and the cross-group `V1a–V18d` range example was part of the arm's wording from the start. `git log -S 'V1a–V18d'` and `git log -S 'transitive-completeness'` over `H5a-closing-gate-automation.md` each return only `08bd641`, and `git show 08bd641` confirms the example appears in the added paragraph — the ambiguity has been present since the arm was introduced.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H5a-closing-gate-automation.md`, in the `Adds.` transitive-completeness-arm sentence, replace the cross-group example `V1a–V18d` with a within-group range that actually occurs in `H5b`'s `Deps.` (for example `V2a–V2d`), and state that the arm expands only within-group `<group><letter>` ranges — i.e. a range whose two endpoints share the same `<group>` number, enumerated by contiguous letter suffix. This matches the real `H5b` `Deps.` (every range there is within-group) and removes any dependence on a canonical cross-group leaf order, which `plan.md` and `conventions.md` declare does not exist.

Concretely, the clause currently reading "after expanding both sides' contiguous ranges (e.g. `V1a–V18d`) and `H5b`'s named singletons (`H5a`, `M`)" should expand a within-group example and pin the within-group letter-suffix expansion rule, e.g. "after expanding both sides' contiguous within-group `<group><letter>` ranges by letter suffix (e.g. `V2a–V2d` → `V2a, V2b, V2c, V2d`) and `H5b`'s named singletons (`H5a`, `M`)".

Edge case for the implementer: confirm no closing-leaf cell in `coverage-matrix.md` lists a cross-group range on its own side; if one does, it must be rewritten as a comma-separated list or within-group ranges so the symmetric "both sides" expansion stays well-defined.

## Relationships

- T12 "Transitive-completeness arm's named-singleton example `(H5a, M)` omits H1a" — same-cluster (corrects the named-singleton example in the same transitive-completeness-arm sentence; resolves independently of the range example)
- T20 "Systemic leaf over-bundling across the leaf corpus" — decision-dependency (a split would relocate the transitive-completeness arm; the expansion-order fix applies wherever the arm lives)

---

# T14 — `ajv-formats` missing from H1a's enumerated runtime-dependency set

**Original heading:** `ajv-formats` relied on but absent from H1a's enumerated dependency set
**Original section:** docs/plan_topics/H1a-scaffold-and-toolchain.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

H1a's **Adds** field enumerates loom's own runtime `dependencies` as `ajv`/`semver`/`chokidar`/`yaml`/`minimatch`. `ajv-formats` is never part of that enumerated set; it appears only inside a later parenthetical — "`ajv` (with `ajv-formats`) is the non-normative reference validator behind the validator-neutral `SchemaValidator` seam".

`ajv-formats` is a real, required runtime dependency, not an optional aside. The spec's reference `SchemaValidator` registers it as an instance-level side effect and relies on it for silent format-keyword acceptance: `implementation-notes.md` §"Implementation hint (non-normative)" states the reference implementation "uses AJV v8 (`ajv ^8`, `ajv-formats ^3`), declared in loom's own `dependencies`". The checked-in `package.json` already carries `ajv-formats ^3.0.1` in its `dependencies` block.

H1a is the establishing leaf that owns initial population of `package.json`. Its authoritative enumeration therefore diverges from both the artifact it produces and the spec contract it implements: an implementer scaffolding the runtime `dependencies` block from the enumerated list alone would omit `ajv-formats`. None of H1a's architectural Tests read the runtime `dependencies` set, so the omission is not caught mechanically at this leaf.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (edited)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H1a — Project scaffold and toolchain — (modified)

## Consequence

**Severity:** correctness

An implementer scaffolding `package.json#dependencies` from H1a's enumerated set would leave out `ajv-formats`, so the reference `SchemaValidator` (which registers `ajv-formats` on its own `Ajv` instance and depends on it for format-keyword acceptance) would fail to resolve the package at runtime. The plan's authoritative enumeration also contradicts the artifact it produces, inviting two reasonable implementers to disagree on whether `ajv-formats` is a declared dependency.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e
**History:** The H1a leaf was first authored in `c6a664e` ("pi-loom plan: build/update plan for spec.md + review") with the runtime-dependency enumeration `ajv`/`semver`/`chokidar`, while `ajv-formats` appeared only in the parenthetical "`ajv` (with `ajv-formats`)" in the same commit. Later commits extended the enumeration — `1064946` added `yaml`, `8279cb1` added `minimatch` — but none added `ajv-formats`. The divergence between the enumerated runtime-dependency set and the relied-upon `ajv-formats` dependency has therefore existed unchanged since the leaf was created.

## Solution Space

**Shape:** single

### Recommendation

In `H1a-scaffold-and-toolchain.md`'s **Adds** field, add `ajv-formats` to the enumerated runtime `dependencies` list so the enumeration reads `ajv`/`ajv-formats`/`semver`/`chokidar`/`yaml`/`minimatch` (place `ajv-formats` adjacent to `ajv`). The existing parenthetical "`ajv` (with `ajv-formats`) is the non-normative reference validator…" and its citation to `implementation-notes.md` may remain as the rationale for the entry. This aligns the enumerated set with both the checked-in `package.json` (`ajv-formats ^3.0.1`) and the spec contract in `implementation-notes.md` (`ajv ^8`, `ajv-formats ^3`). Do not edit the spec — `implementation-notes.md` already states the dependency correctly; the fix is internal to the plan leaf.

## Relationships

- T29 "Pi SDK is never provisioned into loom's own build-test environment" — same-cluster (both are H1a manifest-enumeration completeness gaps; resolve independently)
- T30 "`eslint-plugin-loom-local` in-tree plugin package has no creating leaf" — same-cluster (both concern H1a dependency provisioning; resolve independently)

---

# T15 — H4a bundles three independent units into one leaf, delaying the MVP behind surface it never consumes

**Original heading:** H4a bundles factory shell + basic harness + full (a)–(g) response-programming surface
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** step-atomicity
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

`H4a` packs three independently-shippable units into a single horizontal leaf: (1) the never-throw extension factory entry point; (2) the end-to-end harness plus its in-memory fixture-supply mechanism; and (3) the full seven-category scripted-injection "response-programming surface" — categories (a) scripted assistant turns, (b) tool-result scripting, (c) binder response/failure, (d) `tool_loop.max_rounds` exhaustion, (e) cancellation injection, (f) nested `invoke(...)` child completion, and (g) subagent-mode callee. The leaf's binding fourth Tests bullet additionally demands a per-category functional-effect self-check for all of (a)–(g), and `Ships when` gates on every one of those assertions passing.

Only unit (2) — the harness and its in-memory fixture-supply — is consumed by the MVP. `M-T` (`Deps. H4a`) and `M` (`Deps. M-T, H4a`) read their single-source happy-path fixture `.loom` in-memory from the harness and touch none of the (a)–(g) surface (confirmed in both leaves' `Adds.`). As written, the entire (a)–(g) surface plus its seven functional-effect assertions must be built and green before `M-T`/`M` can begin, even though neither consumes it.

Categories (f) and (g) compound the problem: (f) models the `V4c` ERR-13 completed-invoke-child contract and (g) models the `V9i` subagent-mode session contract, so `H4a` must forward-model two vertical-slice contracts whose owning leaves (`V4c`, `V9i`) do not yet exist at `H4a` time. Two reasonable implementers can model those not-yet-written contracts differently, and the resulting harness surface may diverge from what `V4c`/`V9i` eventually define. Bundling the whole surface into one leaf also makes it unreviewable in a single pass.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — whole leaf (`Adds.`, `Tests.`, `Ships when.`) (edited)
- `docs/plan.md` — Horizontal phases list (edited)
- `docs/plan_topics/M-minimal-slash-command.md` — `Deps.` (read-only)
- `docs/plan_topics/M-T-minimal-slash-command.md` — `Deps.` (read-only)
- `docs/plan_topics/V4c-terminal-outcomes.md` — `Deps.` (option-dependent)
- `docs/plan_topics/V9i-subagent-isolation.md` — `Deps.` (option-dependent)
- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — `Deps.` (option-dependent)
- `docs/plan_topics/V13c-query-tool-loop.md` — `Deps.` (option-dependent)
- `docs/plan_topics/V13d-query-failure-repair.md` — `Deps.` (option-dependent)
- `docs/plan_topics/V17a-cancellation-core.md` — `Deps.` (option-dependent)
- `docs/plan_topics/H7a-integration-acceptance.md` — `Deps.` (option-dependent)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal, MVP, Vertical

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `<new>` — Response-programming surface (full (a)–(g) scripted-injection contract; the finding's prose calls it `H4b`) — (added)
- `H7a` — Terminal integration-acceptance run — (modified)
- `M-T` — Minimal end-to-end `.loom` slash command (tests) — (modified)
- `M` — Minimal end-to-end `.loom` slash command — (modified)
- `V4c` — Terminal outcomes — (modified)
- `V9i` — Subagent isolation — (modified)
- `V11f` — Binder retry taxonomy — (modified)
- `V13c` — Query tool loop — (modified)
- `V13d` — Query failure repair — (modified)
- `V17a` — Cancellation core — (modified)

## Consequence

**Severity:** correctness

If shipped unfixed, the MVP path (`M-T`/`M`) cannot begin until the entire seven-category surface and its functional-effect self-check are built and green, even though the MVP consumes only the harness fixture-supply. Worse, `H4a` is forced to forward-model the `V4c` ERR-13 and `V9i` subagent contracts before those leaves exist, so the harness surface can diverge from what those slices eventually define, and the bundled leaf is too large to review in one pass.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); 27e12be — resolve "Session double's model / tool / binder-response scripting surface is undefined" (2026-06-10); c58c08c — resolve "V4c ERR-13 routes a completed invoke-child through H4a" (2026-06-11); 98be740 — resolve "V4c ERR-12 consumes H4a subagent-mode-callee H4a does not enumerate" (2026-06-11); 1b6ea25 — resolve "Response-programming surface determinism gated, functional effect not" (2026-06-11)
**History:** `H4a` bundled the factory shell and end-to-end harness from the plan's first commit (`c6a664e`). The response-programming surface was then accreted onto the same leaf across a chain of later fixes: `27e12be` introduced the scripting surface (categories (a)–(e)), `c58c08c` added category (f) invoke-child, `98be740` added category (g) subagent-mode callee, and `1b6ea25` added the per-category (a)–(g) functional-effect self-check. The three-units-in-one-leaf bloat is the cumulative product of that accretion, not any single commit.

## Solution Space

**Shape:** single

This is a two-obligation fix: first carve the surface out of `H4a`, then point its consumers at the new leaf. Resolve them in that order so the second obligation lands on a stable baseline.

### Recommendation

Extract the response-programming surface into a new horizontal leaf, then retarget the surface consumers' `Deps` onto it.

**First, extract the surface into a new horizontal leaf.** Create a new horizontal leaf (placeholder `<new>`; the finding's prose names it `H4b`) that owns the full (a)–(g) response-programming surface, leaving `H4a` with the factory entry point, the basic harness, the in-memory fixture-supply mechanism, and the four-axis session-double fidelity-contract self-check. This unblocks `M-T`/`M` (which depend on `H4a` alone) once the harness and fixture-supply ship, keeps each leaf reviewable in one pass, and isolates the (f)/(g) modelling to one leaf.

- In `docs/plan_topics/H4a-factory-shell-and-harness.md`: move the `Adds.` response-programming-surface paragraph (categories (a)–(g)) and the fourth `Tests.` bullet (the per-category (a)–(g) functional-effect self-check) into the new leaf's `Adds.`/`Tests.`. Strike the per-category (a)–(g) clause from `H4a`'s `Ships when`, leaving `H4a`'s `Ships when` gating on factory load, no-op command dispatch, and the four-axis fidelity-contract self-check (including its determinism gate).
- Create `docs/plan_topics/<new>-response-programming-surface.md` from `leaf-template.md`, owning the (a)–(g) surface `Adds.`, the per-category functional-effect `Tests.` bullet, the determinism gate over the scripted inputs, and `Deps. H4a`.
- Add the new leaf to the Horizontal phases list in `docs/plan.md`, after `H4a`.
- Per `conventions.md` §REQ-ID discipline (How-to-use step 2), evaluate whether the new leaf must be added to `H5b`'s `Deps`.

**Then, retarget the surface consumers onto the now-stable new leaf.** Add the new leaf ID to the `Deps.` field of every leaf that consumes the (a)–(g) surface, so each scripts against the leaf that actually owns the surface rather than against `H4a`. `V11f`, `V13c`, `V13d`, and `V9i` currently list no dependency on `H4a` at all despite the surface naming them as consumers — they gain the new leaf as their `Deps` entry. `V17a`, `V4c`, and `H7a` currently list `H4a` and gain the surface leaf alongside it, retaining `H4a` because they also use the harness. Check each consumer's actual usage before adding the dep: a consumer that uses only the basic harness (not the (a)–(g) surface) keeps `H4a` and does not gain the surface leaf — `V11f`/`V13c`/`V13d`/`V9i` need only the new leaf, while `V17a`/`V4c`/`H7a` legitimately need both.

The (f)/(g) categories still forward-model the `V4c` ERR-13 and `V9i` subagent contracts; isolating them in the new leaf does not by itself resolve the forward-reference, so sequence the new leaf after those contracts are pinned, or explicitly flag the modelling as the harness's own contract.

**Spec edits:** None.

## Relationships

- T20 "Systemic leaf over-bundling across the leaf corpus" — same-cluster (the same step-atomicity pattern across other leaves; resolves independently)
- T16 "Manual real-host smoke does not enumerate its live-host / binder-model / credential prerequisites" — same-cluster (same leaf, smoke-gate concern; resolves independently)
- T19 "H4a's 'closed at source' / 'cannot merge' smoke guarantee overstates a manual mechanism" — same-cluster (same leaf; resolves independently)

---

# T16 — Manual real-host smoke does not enumerate its live-host / binder-model / credential prerequisites

**Original heading:** Manual real-host smoke assumes a configured live Pi host + provider the plan never enumerates
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** assumptions
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H4a`'s **manual real-host smoke run** — driving `H7a`'s committed multi-feature fixture `.loom` against a live Pi host — is a **required pre-merge gate** with named owners (the contributor performing a Pi version bump; the contributor of any merge touching the four fidelity-contract axes), and `H6a`'s release-gate acceptance makes a recorded pass of that smoke a loom 1.0 release precondition. Both leaves describe *what the run scores* (pass criteria (a)–(e)) but neither describes *the environment the owner must stand up to run it at all*. Criteria (a)–(e) silently presuppose a working live, non-deterministic LLM host: a Pi install at the pinned SDK, a reachable structured-output-capable binder model resolvable through `ctx.modelRegistry`, and resolved credentials for that model. None of that is enumerated or cross-referenced at the smoke's owning leaf.

The prerequisites in fact already exist in the spec — `host-prerequisites.md` item 1 pins the Pi-SDK range (`#pi-sdk-pin`, which `H6a` already cites for the pin literal only), item 2 names the structured-output-capable binder model resolved via `ctx.modelRegistry`, and item 3 records that credentials are whatever Pi already resolves for the model (loom stores none). But the smoke bullets in `H4a`/`H6a` never connect the run to those prerequisites, so an owner reading the gate has no enumerated environment to provision against.

This is sharper than a cosmetic gap because criterion (b) — "the binder pass produces structurally-valid output" — is unsatisfiable without a resolvable, credentialed binder model. An owner who runs the smoke against a Pi install with no structured-output-capable binder model registered gets a `loom/load/binder-model-unresolved` load failure, which scores as a criterion (a) failure (thrown/aborted run) — a spurious "confirmed behavioural-divergence finding" that blocks the merge. Two owners with different model/provider configurations can likewise diverge on a run that is supposed to be model-output-invariant.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests bullet 3 (manual real-host smoke pass criteria) (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (manual real-host smoke) (option-dependent)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — items 1–3 (Pi-SDK pin, binder model, binder credentials) (read-only)

## Affected Leaves

**Phases:** Horizontal (including the release-gate sub-grouping)

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)
- `H6a` — Live-corpus closing-gate activation (loom 1.0 release gate) — (modified)

## Consequence

**Severity:** correctness

A named smoke owner cannot provision the live-host environment from the gate text alone, and the most likely under-provisioning (no resolvable binder model) makes criterion (b) unsatisfiable and surfaces as a criterion (a) failure — a spurious behavioural-divergence finding that blocks a merge or a Pi bump. Two owners with different live host/model configurations can score the same model-output-invariant run differently.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 328ba4d — pi-loom plan: resolve "real-host verification gap" (2026-06-10, Thomas Andersen)
**History:** `328ba4d` introduced the manual real-host smoke into `H4a` as a run "driving a representative `.loom` ... against a live Pi host", with no enumeration of the live host, binder model/provider, or credential precondition; the gap has been present in every revision since. A later commit (`3911733`, 2026-06-11) added the model-output-invariant pass criteria (a)–(e) that sharpen the dependency on a live LLM host, but it refined the scoring without enumerating the environment, so the originating gap remains the `328ba4d` introduction.

## Solution Space

**Shape:** single

### Recommendation

In `H4a`'s third Tests bullet (the manual real-host smoke), state the live-host precondition the run requires and bind it to the spec page that already names it: a live Pi host at the [`host-prerequisites.md#pi-sdk-pin`](../../docs/spec_topics/pi-integration-contract/host-prerequisites.md#pi-sdk-pin) range, with a structured-output-capable binder model resolvable via `ctx.modelRegistry` (`host-prerequisites.md` item 2) and credentials resolved by Pi for that model (`host-prerequisites.md` item 3, loom stores none). Make explicit that the smoke's named owners (the bump contributor for trigger (1); the merging contributor for trigger (2)) run the gate against their own Pi install configured to satisfy that precondition, and that an unsatisfied binder-model/credential precondition is an un-runnable-gate condition, not a behavioural-divergence finding — so a missing binder model does not score as a criterion (a) failure that blocks the merge.

`H6a`'s Release-gate acceptance item already defers to "the model-output-invariant criterion `H4a` defines", so pinning the precondition at `H4a` propagates to `H6a` by reference. If the reviewer prefers the release-gate shard to be self-contained, add the same `host-prerequisites.md` cross-reference to `H6a`'s acceptance item rather than restating the prerequisite text.

## Relationships

- T18 "Smoke pass criterion (b) leaves 'structurally-valid binder output' undefined" — decision-dependency (criterion (b) is the criterion that depends on a resolvable, credentialed binder model; anchoring (b) and enumerating the binder-model precondition are coordinated edits to the same bullet)
- T15 "H4a bundles three independent units into one leaf" — same-cluster (same leaf; resolves independently)
- T19 "H4a's 'closed at source' / 'cannot merge' smoke guarantee overstates a manual mechanism" — same-cluster (same H4a smoke bullet; concerns the merge-block mechanism rather than the live-host precondition)

---

# T17 — Axis (ii) "single-turn prompt-mode append semantics" is ambiguous against the turn-count carve-out in the live-host pass criterion

**Original heading:** Axis (ii) "single-turn prompt-mode append semantics" conflicts with allowed turn-count variance
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** clarity
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H4a`'s third Tests bullet defines the live-host smoke run's pass/fail predicate as criteria (a)–(e). Criterion (d) requires "the four session-double fidelity-contract axes — streamed-token order relative to `ctx.waitForIdle()` resolution, **single-turn prompt-mode append semantics**, the `pi.on` cancel-forward subscription, and cancellation propagation — hold". The same paragraph closes by declaring "benign live-model variance in turn **order**, turn **count**, or which permitted codes fire is **not** a fail."

The bare phrase "single-turn prompt-mode append semantics" admits two incompatible readings. Read as a *per-response* invariant — each streamed assistant response is appended as exactly one prompt-mode turn — it is fully compatible with a variable total turn count, since the live model may emit any number of responses. Read as a *total* constraint — the run produces a single prompt-mode turn — it directly contradicts the carve-out that blesses turn-count variance. A smoke-runner scoring criterion (d) cannot tell which the gate means.

Earlier in the same bullet the self-check enumerates the same axis as "(ii) one streamed assistant response appended as a single prompt-mode turn" — the per-response reading. The pass/fail criterion (d) drops that per-response gloss while sitting beside the turn-count carve-out, so the release-blocking predicate is stated more loosely than the contract it scores against. Two reasonable contributors running the gate against a live (non-deterministic) model would diverge on whether a multi-turn run fails (d).

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests bullet 3, "Pass/fail criterion" list item (d) (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (read-only; inherits H4a's pass criterion by reference)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)

## Consequence

**Severity:** correctness

Criterion (d) is a release-blocking pass/fail predicate for the manual real-host smoke gate. Under the ambiguous phrasing, one runner reads axis (ii) as per-response and passes a benign multi-turn live run; another reads it as a single-total-turn requirement and fails the same run as a behavioural divergence, triggering the revert / merge-block path. The gate scores inconsistently on the very turn-count variance the paragraph elsewhere declares benign.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 3911733 — pi-loom plan: resolve "Live-host smoke pass criterion assumes a non-deterministic LLM reproduces a transcript" (2026-06-11, Thomas Andersen)
**History:** Before 3911733 the pass criterion required the live run to match `H7a`'s golden transcript in exact turn order and count, so the bare phrase "single-turn prompt-mode append semantics" stood beside no turn-count concession and was unambiguous in context. Commit 3911733 reframed the criterion for a non-deterministic LLM, simultaneously introducing the (a)–(e) list (whose item (d) re-uses the bare phrase without the per-response gloss the self-check item (ii) carries) and the closing "benign live-model variance in turn … count … is not a fail" carve-out. Those two edits in the same commit created the present ambiguity.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H4a-factory-shell-and-harness.md`, third Tests bullet, within the "Pass/fail criterion" sentence, edit criterion (d)'s axis enumeration so axis (ii) carries the per-response gloss the self-check already uses. Strike `single-turn prompt-mode append semantics` from the criterion-(d) axis list and replace it with text asserting the per-response invariant explicitly — e.g. `each streamed assistant response is appended as exactly one prompt-mode turn (a per-response invariant, independent of total turn count)`. This makes (d) consistent with the self-check's axis (ii) phrasing ("one streamed assistant response appended as a single prompt-mode turn") and reconciles it with the trailing carve-out that turn-count variance is benign: a run may produce any number of turns, but each streamed response must map to exactly one prompt-mode turn.

Edge case for the implementer: the same bare phrase `single-turn prompt-mode append semantics` appears twice more in the bullet — in the contract definition (`**Adds.**` paragraph) and in trigger (2)'s "touches the four fidelity-contract axes" enumeration. Those are axis *labels*, not the scored predicate, so they may stay as short labels; only criterion (d)'s use is the scored predicate that needs the per-response gloss. Keep the label and the predicate semantically aligned.

## Relationships

- T18 "Smoke pass criterion (b) leaves 'structurally-valid binder output' undefined" — same-cluster (another under-specified item in the same H4a (a)–(e) pass/fail list; resolves independently)

---

# T18 — Smoke pass criterion (b) leaves "structurally-valid binder output" undefined

**Original heading:** "structurally-valid binder output" pass criterion (b) is undefined
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** clarity, implementability
**Importance:** medium
**Score:** 25
**MustFix:** false

## Finding

`H4a`'s manual real-host smoke run is scored on a release-blocking pass/fail predicate whose clauses `(a)–(e)` each name a concrete observable — except clause `(b)`, "the binder pass produces structurally-valid output." The term "structurally-valid" is never anchored to a contract. The plan defines several distinct candidate meanings for binder-related output: the three-arm `ok | needs_info | ambiguous` envelope schema (`V11c`, ultimately `spec_topics/binder/binder-bypass-and-envelope.md#binder-envelope-schema-constructed-dynamically-from-params`), the JSON-Schema-subset reject gate (`V5d`), and the binder system-note line discipline (`V11e`). Each yields a different pass/fail outcome for the same run — "JSON parses," "validates against the envelope schema," "passes the subset gate," and "matches system-note line discipline" are not equivalent.

The same undefined phrase is restated verbatim in `H6a`'s release-gate acceptance bullet, which cites `H4a`'s criterion as the definition of "pass" for the loom 1.0 release gate. A release-blocking gate therefore turns on a predicate two reviewers could score differently, and the ambiguity propagates from `H4a` into the release gate without a single source of truth.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — Tests bullet, live-host smoke `Pass/fail criterion` clause (b) (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (manual real-host smoke) bullet (edited)
- `docs/plan_topics/V11c-bypass-envelope.md` — binder bypass and envelope schema (read-only)
- `docs/plan_topics/V5d-subset-lowering.md` — schema-subset reject gate (read-only)
- `docs/plan_topics/V11e-system-note-determinism.md` — binder system-note rendering / line discipline (read-only)

## Spec Documents

- `docs/spec_topics/binder/binder-bypass-and-envelope.md` — Binder envelope schema (`#binder-envelope-schema-constructed-dynamically-from-params`) (read-only)

## Affected Leaves

**Phases:** Horizontal

**Leaves (implementation order):**

- H4a — Extension factory shell and end-to-end harness — (modified)
- H6a — Live-corpus activation / release gate — (modified)

## Consequence

**Severity:** correctness

Two reviewers scoring the same live-host smoke run can reach opposite pass/fail verdicts on clause (b), because "structurally-valid" admits at least three incompatible readings (envelope-schema validity, subset-gate acceptance, line-discipline conformance). Since `H6a`'s release gate inherits this clause as its definition of "pass," the loom 1.0 release can be blocked or allowed on an arbitrary interpretation rather than a fixed contract.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 3911733 — pi-loom plan: resolve "Live-host smoke pass criterion assumes a non-deterministic LLM reproduces a transcript" (2026-06-11, Thomas Andersen)
**History:** `H4a`'s live-host smoke pass criterion was originally an exact-golden-transcript match and contained no "structurally-valid" term. Commit 3911733 replaced that exact-match criterion with the model-output-invariant `(a)–(e)` clause list, introducing clause (b) "the binder pass produces structurally-valid output" without anchoring "structurally-valid" to any concrete contract. The same commit propagated the phrase into `H6a`'s release-gate restatement, so both leaves have carried the undefined term since that single commit.

## Solution Space

**Shape:** single

### Recommendation

In `H4a`'s live-host smoke `Pass/fail criterion`, replace clause (b)'s bare "the binder pass produces structurally-valid output" with a clause that anchors validity to the binder envelope schema — the contract the binder's inference response is actually checked against. Concrete text for clause (b): "the binder pass produces output that validates against the binder envelope schema (`V11c`; `spec_topics/binder/binder-bypass-and-envelope.md#binder-envelope-schema-constructed-dynamically-from-params`)." Update the matching failure-enumeration phrase later in the same bullet ("structurally-invalid binder output") to refer to the same anchored contract.

Apply the identical anchored wording to `H6a`'s release-gate acceptance bullet, which currently restates "structurally-valid binder output" twice; both restatements must cite the same `V11c` envelope-schema definition so the release gate and the `H4a` smoke share one source of truth for clause (b).

Edge case the implementer must watch: clause (b) governs the live, non-deterministic run, so it must remain a structural-validity check (the envelope parses and conforms to the three-arm `ok | needs_info | ambiguous` schema), not an exact-value match against `H7a`'s deterministic goldens — the surrounding bullet already distinguishes model-output-invariant scoring from `H7a`'s exact-match in-process gate.

## Relationships

- T16 "Manual real-host smoke does not enumerate its live-host / binder-model / credential prerequisites" — decision-dependency (criterion (b) depends on a resolvable, credentialed binder model; anchoring (b) and enumerating the binder-model precondition are coordinated edits to the same bullet)
- T17 "Axis (ii) 'single-turn prompt-mode append semantics' is ambiguous" — same-cluster (same `(a)–(e)` live-host smoke pass-criterion block in `H4a`; resolves independently)

---

# T19 — H4a's "closed at source" / "cannot merge" smoke guarantee overstates a manual, after-the-fact-auditable mechanism

**Original heading:** Manual smoke "cannot merge"/"closed at source" guarantee is not backed by the named mechanism
**Original section:** docs/plan_topics/H4a-factory-shell-and-harness.md
**Kind:** overclaim, validation
**Importance:** medium
**Score:** 30
**MustFix:** true

## Finding

H4a's third `Tests` bullet describes the manual real-host smoke as a "required pre-merge gate" on two triggers and then asserts a hard merge-blocking guarantee: "Because the gate runs before merge, a divergent pin or a divergence-introducing four-axes change **cannot merge**: the undetected-by-CI window between a divergent merge and a human running the smoke is **closed at source**." The named mechanism behind that claim is entirely human discipline — a contributor is obligated to run the smoke and record the result in the triggering commit message. Nothing in H4a, H6a, or `conventions.md` describes a CI hook that observes whether the smoke ran, and the second trigger ("any merge whose diff touches the four fidelity-contract axes") has no mechanical detector that recognises such a diff and demands evidence.

The leaf's own companion text confirms the gap: H6a's Release-gate acceptance says a skipped, mis-recorded, or stale-pin run is "detectable **after the fact** by reading the commit message." That is after-the-fact auditability, not a closed pre-merge window. A contributor who forgets to run the smoke, or who does not recognise that their diff touched one of the four axes, merges with no obstruction; the omission surfaces only when someone later reads the commit history. The "cannot merge" / "closed at source" framing therefore promises a mechanical guarantee the plan does not deliver.

## Plan Documents

- `docs/plan_topics/H4a-factory-shell-and-harness.md` — third `Tests` bullet (the "required pre-merge gate" / "closed at source" prose) (edited)
- `docs/plan_topics/H6a-live-corpus-activation.md` — Release-gate acceptance (manual real-host smoke) (read-only — its "detectable after the fact" wording is the mechanism the H4a prose must be reconciled to)

## Spec Documents

None

## Affected Leaves

**Phases:** Horizontal phases

**Leaves (implementation order):**

- `H4a` — Extension factory shell and end-to-end harness — (modified)

## Consequence

**Severity:** correctness

A reader who trusts the "closed at source" guarantee will believe divergent merges are mechanically blocked and de-prioritise both running the manual smoke and building any real enforcement, while a reader who reconciles against H6a's "after the fact" wording will conclude only auditability exists — two reasonable contributors diverge on whether the merge window is actually closed. The plan ships an unenforceable promise: a divergent pin or an axes-touching change can land on `main` unblocked, contradicting the leaf's own stated guarantee.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** `15eb44c` — "pi-loom plan: resolve \"real-host divergence pre-merge gate (posture i)\"" (2026-06-11)
**History:** The plan corpus is git-tracked. `git log -S "closed at source"` and `git log -S "cannot merge"` over `docs/plan_topics/H4a-factory-shell-and-harness.md` each return exactly one commit, `15eb44c`. That commit added the entire "required pre-merge gate" passage to H4a's third `Tests` bullet, including the "Because the gate runs before merge … cannot merge … closed at source" sentence. The defect entered with the posture-i pre-merge-gate resolution: the edit introduced hard merge-blocking framing without a CI mechanism to back it. The companion after-the-fact-auditability language in H6a ("detectable after the fact by reading the commit message") was added separately in `eca63cf` ("resolve \"Manual real-host fidelity gate leaves no falsifiable record\""), which is consistent with the mechanism; the overclaim is localised to the language `15eb44c` introduced in H4a.

## Solution Space

**Shape:** single

### Recommendation

In `docs/plan_topics/H4a-factory-shell-and-harness.md`, in the third `Tests` bullet, strike the sentence:

> Because the gate runs before merge, a divergent pin or a divergence-introducing four-axes change cannot merge: the undetected-by-CI window between a divergent merge and a human running the smoke is closed at source.

Replace it with wording that matches the mechanism actually delivered: the smoke is a required *manual* pre-merge step whose execution is auditable after the fact via the commit-message evidence record (per H6a), and it carries no mechanical guarantee that a skipped run, or a divergence the contributor does not recognise as touching the four axes, is blocked from merging. The new text must state (a) the smoke is a contributor obligation, not a CI-enforced gate, and (b) detection of a skipped/unrecognised run is after-the-fact via the commit message rather than at merge time.

Leave the subsequent "merge blocker" sentence intact: a *confirmed* behavioural-divergence finding from a run that did occur is a genuine blocker; the overclaim is only the implication that every divergent change is mechanically forced through the gate. If a hard pre-merge block is genuinely intended instead, the alternative is to name a real CI trigger that observes smoke execution — but no such trigger exists in the plan today, so the wording softening is the change that makes the leaf truthful.

Edge case the implementer must watch: the second trigger ("touches the four fidelity-contract axes") has no mechanical diff detector, so the softened wording must not reintroduce an implication that trigger recognition is automatic.

## Relationships

- T16 "Manual real-host smoke does not enumerate its prerequisites" — same-cluster (same H4a smoke gate; resolves independently)
- T15 "H4a bundles three independent units into one leaf" — same-cluster (same leaf; resolves independently)

---

# T20 — Systemic leaf over-bundling across the plan corpus

**Original headings:**
- V3a bundles core expression evaluator with three stdlib families
- V5d bundles reject gate + lowering pass + canonical-hash recipe
- V8a merges two independent seams (Checkpoint + SchemaValidator)
- V8b bundles five structurally independent host seams
- V9b bundles registration steps + drain-state contract + two wiring points
- V11d bundles three independent binder output-prep mechanisms
- H5a bundles six independently implementable scanner/reconciler arms + warn-only mode
- V15a invocation core is too large (5 mechanisms + 6 diagnostics)
- Forwarding-listener throw-trap is a distinctly complex independently-verifiable sub-mechanism

**Original section:** docs/plan_topics (multiple leaves)
**Kind:** step-atomicity
**Importance:** medium
**Score:** 30
**MustFix:** false

## Finding

A recurring pattern spans the leaf corpus: several leaves each pack multiple structurally-independent, independently-shippable, independently-testable units into a single leaf, so the implementing commit is too large to trace each unit against its fixtures in one TDD pass and no unit can land or be reviewed incrementally. `conventions.md` §Vertical slices requires each leaf to be "the smallest feature that can ship and be tested independently"; these leaves violate that rule:

- **`H5a`** — one CI gate carrying seven independently-implementable reconciliation arms (unmapped-REQ-ID, numbered-REQ-ID→citing-test, diagnostics-registry↔test parity, un-anchored-MUST recogniser, `no-broad-catch` allow-list resolver, per-prefix numbering-hole/retired clash, transitive-completeness expander) plus a warn-only live-corpus mode, each with its own seeded fixtures.
- **`V3a`** — the core expression interpreter bundled with the entire `string`/`array<T>`/`object` standard-library surface (four pure stdlib-family test suites); five downstream consumers (`V3b`/`V3c`/`V3d`/`V4a`/`V6d`) consume only the interpreter.
- **`V5d`** — the JSON-Schema-subset reject gate, the multi-stage lowering pass, and the SHA-256 canonical-hash recipe.
- **`V8a`** — two unrelated host seams (`Checkpoint` cancellation substrate + `SchemaValidator` JSON-Schema validation) with disjoint downstream consumer sets.
- **`V8b`** — five structurally independent host seams (`Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator`), each with its own PIC anchor, interface, and adapter.
- **`V9b`** — registration steps 1–5, the `LoomRegistry` drain-state contract, the `ReloadFailureInjector` failure-injection seam, and the model-reference-matcher production wiring point.
- **`V11d`** — the system-prompt builder, fill-if-absent defaulting + post-merge AJV revalidation, and the `BNDR-6` argument echo.
- **`V15a`** — five invocation mechanisms (`realpath` containment, parse cache, `invoke<T>` return-type check, cross-mode matrix, prompt→prompt suspend) plus a six-code diagnostic suite.
- **`V17a`** — the cancellation core plus the distinctly complex, independently-verifiable forwarding-listener throw-trap.

## Plan Documents

- `docs/plan_topics/H5a-closing-gate-automation.md`, `docs/plan_topics/V3a-expression-evaluator.md`, `docs/plan_topics/V5d-subset-lowering.md`, `docs/plan_topics/V8a-checkpoint-validator-seams.md`, `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md`, `docs/plan_topics/V9b-registration-drain-state.md`, `docs/plan_topics/V11d-defaulting-echo.md`, `docs/plan_topics/V15a-invocation-core.md`, `docs/plan_topics/V17a-cancellation-core.md` — the over-bundled leaves and their `-T` partners (edited)
- `docs/plan.md` — slice listings (edited — link the new leaves)
- `docs/plan_topics/coverage-matrix.md` — closing-leaf rows for the split obligations (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — `Deps` (edited — any new coverage-producing leaf joins the transitive-completeness set)
- `docs/plan_topics/conventions.md` — §Vertical slices / §Leaf format / §REQ-ID discipline (read-only)

## Spec Documents

None — the fix re-partitions plan leaves only; the cited spec topics are read-only references that re-distribute across the split leaves unchanged.

## Affected Leaves

**Phases:** Horizontal; Vertical slices V3, V5, V8, V9, V11, V15, V17

**Leaves (implementation order):**

- `H5a`, `V3a`, `V5d`, `V8a`, `V8b`, `V9b`, `V11d`, `V15a`, `V17a` — each (modified) — decomposed along its natural seams
- `<new>` leaves — (added) — one or more per split, each with its paired `-T` tests task and its own `Deps`/`Ships when`
- downstream consumers whose `Deps` cite a split leaf — (modified) — re-pointed to the specific sub-leaf each consumes

## Consequence

**Severity:** advisory

Every affected leaf is fully implementable, so no implementer diverges on behaviour and no spec rule ships unimplemented — the cost is reviewability, incremental delivery, and downstream-unblocking. A single bundled commit must satisfy multiple unrelated contracts at once, so a defective unit can slip through unreviewed and a faulty sub-unit blocks tagging the whole leaf complete even when the rest is correct; downstream consumers that need only one sub-unit are delayed behind work they do not consume.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen); plus the per-leaf accretion commits (e.g. `0603eb4`/`ea6b1da`/`953e3fa`/`96563f9`/`08bd641` for `H5a`; `5953b18`/`d64dce5` for `V9b`; `27e12be`/`1b6ea25` for the H4a-adjacent surface; `cddd2b4`/`e2d385b` for `V15a`; `0bc84dd` for `V17a`'s throw-trap)
**History:** Most of these leaves were created already bundled at the plan's first commit (`c6a664e`) — their `Adds` fields enumerate the multiple units at inception (`V3a`, `V5d`, `V8a`, `V8b`, `V9b`, `V11d`, `V15a`). For `H5a`, `V9b`, `V15a`, and `V17a` the bundle deepened as later review-fix commits each appended a new surface to the same leaf without re-evaluating its atomicity. The over-bundling is therefore partly original design and partly accreted; no single commit is the sole cause.

## Solution Space

**Shape:** single

### Recommendation

Decompose each over-bundled leaf along its natural cohesion seams, retaining the existing leaf ID for the trimmed core (so downstream consumers that depend only on the core need no `Deps` edit) and giving each split-off unit its own `<new>` leaf with a paired `-T` tests task. Suggested cuts:

- `H5a` → keep the three live-corpus reconciliation surfaces + warn-only mode + diagnostics-registry arm in core `H5a`; move the plan-structural / lint-allow-list arms (numbering-hole/retired-clash, transitive-completeness expander, `no-broad-catch` allow-list resolver) to a new leaf listing `H5a` in `Deps` (keeps `H5b`/`H6a` pointed at `H5a` unchanged).
- `V3a` → split the `string`/`array<T>`/`object` stdlib families into a new V3 leaf, keeping the core interpreter as `V3a` so the five downstream consumers' `Deps` edge is unchanged.
- `V5d` → two-way split: reject gate | lowering pass (with the canonical-hash recipe folded in, since the slug-named hoist consumes the hash).
- `V8a` → two single-seam leaves (`Checkpoint` PIC-10 | `SchemaValidator` PIC-11); re-point Checkpoint-consumers vs Validator-consumers separately.
- `V8b` → per-seam(-group) leaves: `FileSystem` alone, `Clock`+`IdSource` together (the two ambient-wrapping seams stay together so the PIC-12/PIC-20 allow-list contract is not split), `FileWatcher`+`TokenEstimator` together; then re-point each dependent to the seam it consumes.
- `V9b` → extract the `LoomRegistry` drain-state contract into a new leaf first (cleanest boundary; carries the DISC-4 superseded-dispatch coverage row and the `V9h` `Deps` edge), leaving the two wiring seams on the registration leaf.
- `V11d` → split into system-prompt builder | fill-if-absent defaulting + post-merge AJV revalidation | argument echo, distributing `Deps` and coverage rows accordingly.
- `V15a` → two-way split: peel the prompt→prompt parent-suspend + `setActiveTools` snapshot/restore (the highest-risk, host-state-mutating, asynchronous mechanism) into its own leaf, keeping the synchronous parse/resolve/dispatch surface + diagnostics in `V15a`.
- `V17a` → peel the forwarding-listener throw-trap into its own leaf (`Deps` on trimmed `V17a` + `H4a`), keeping the cancellation core in `V17a`.

For each split: allocate new IDs from the existing `<group><letter>` scheme (use `<new>` placeholders until chosen; do not invent final IDs or break the ID scheme); update `coverage-matrix.md` closing-leaf rows so each obligation maps to the sub-leaf that closes it; add any new coverage-producing leaf to `H5b`'s `Deps` per the §REQ-ID discipline transitive-completeness clause; and re-point each downstream consumer's `Deps` (and its `-T` partner) to the specific sub-leaf it consumes. The spec is read-only for all of these splits.

## Relationships

- T15 "H4a bundles three independent units into one leaf" — same-cluster (the same step-atomicity pattern, kept separate because it carries a distinct correctness consequence; resolves independently)
- T08 "V11d system-prompt-structure bullet over-asserts" — decision-dependency (the V11d split decides which sub-leaf owns the system-prompt-builder bullet)
- T09 "ReloadFailureInjector seam has two owners" — decision-dependency (the V9b split picks the home for the failure-injection seam)
- T12 "Transitive-completeness arm singleton example omits H1a" — decision-dependency (the H5a split relocates the transitive-completeness arm carrying this example)
- T13 "H5a cross-group range has no expansion order" — decision-dependency (same arm; moves with the H5a split)
- T28 "V15a prompt→prompt snapshot/restore has no failure-path restore assertion" — decision-dependency (the V15a split decides which sub-leaf hosts the restore-on-failure test)

---

# T21 — Per-loom registration `ToolDefinition` field-derivation MUSTs unnamed by any leaf

**Original heading:** Per-loom registration `ToolDefinition` field-derivation MUSTs unnamed by any leaf
**Original section:** Cross-cutting / global
**Kind:** spec-coverage
**Importance:** high
**Score:** 95
**MustFix:** true

## Finding

`spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` §*Per-loom registration* specifies the mode-independent shape of the Pi `ToolDefinition` a loom materialises when referenced by another loom's `tools:`. Two of its field-derivation obligations are normative and observable but are named by no plan leaf:

- `label` — the loom file's basename with hyphens preserved and the leading character capitalised (`code-review.loom` → `"Code-review"`).
- the synthesised typed-query one-shot tool's `label` is the literal string `"Loom typed-query response"` (per `implementation-notes.md` §Runtime).

`V9f` (Tool-registration lifetime and visibility) is the leaf that materialises the `ToolDefinition` — it already owns the `Type.Unsafe` schema bridge, the per-mode wiring, and `PIC-8` / `PIC-19` — but it cites only `tool-registration-lifetime.md`, never `extension-bootstrap-and-per-loom.md`, and neither its **Adds** nor its **Tests** mention the `label` derivation or the typed-query literal. No other leaf references `basename`, `capitalis`, or `"Loom typed-query response"` (verified by `grep` across `plan_topics/`). The `parameters` `Type.Unsafe`-wrap + AJV-revalidate MUST is subsumed by `V9f`'s **Adds**, and the re-entrant-adapter MUST is subsumed by `V9i`'s `PIC-22`, so only the two `label` obligations are genuinely uncovered.

The `coverage-matrix.md` *Code-keyed obligation areas* table — which is the standing closing record for un-anchored `spec_topics/**` MUSTs under the `H5a` gate — carries no row for `extension-bootstrap-and-per-loom.md`'s Per-loom-registration ToolDefinition-shape MUSTs. Because these are un-anchored normative MUSTs with no `loom/...` registry code and no numbered REQ-ID, they fall under the GOV-22 un-anchored-obligation residue arm and require a rule-driven matrix row with a named closing leaf.

## Plan Documents

- `docs/plan_topics/V9f-tool-registration-lifetime.md` — Spec / Adds / Tests (edited)
- `docs/plan_topics/coverage-matrix.md` — *Code-keyed obligation areas* table (edited)
- `docs/plan_topics/conventions.md` — *REQ-ID discipline* (un-anchored-MUST closing rule) (read-only)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps (read-only; already covers `V9f` via the `V9a`–`V9j` range, so no transitive-completeness edit is owed)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — §Per-loom registration / field derivations (read-only)
- `docs/spec_topics/implementation-notes.md` — §Runtime (synthesised typed-query tool) (read-only)

The fix is internal to the plan files; the spec already carries the MUSTs.

## Affected Leaves

**Phases:** Vertical (slice V9 — Extension host integration)

**Leaves (implementation order):**

- `V9f` — Tool-registration lifetime and visibility — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers could derive the tool `label` differently — fail to preserve hyphens, fail to capitalise the leading character, or pick a different string for the synthesised typed-query tool — and nothing in the plan gates the spec's exact derivation. The MUSTs ship unverified, and once `H6a` flips the `H5a` gate to its live-corpus footing the un-enumerated un-anchored MUSTs redden CI (self-witnessing).

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V9f` was created in c6a664e (2026-06-10) without naming the `label` basename-capitalisation derivation or the `"Loom typed-query response"` literal, and `coverage-matrix.md` has never carried a Per-loom-registration ToolDefinition-shape row in any commit (pickaxe on `"Per-loom registration"` and `extension-bootstrap-and-per-loom` returns no match in `plan_topics/`). The gap has been present since the current vertical-leaf corpus was first authored; no later edit introduced it.

## Solution Space

**Shape:** single

### Recommendation

Name the ToolDefinition `label` contract in `V9f` — which already materialises the definition — and then add the matching coverage-matrix gating row, landing the `V9f` content edit first so the row points at a leaf that already asserts the obligation.

In `V9f`: add `extension-bootstrap-and-per-loom.md` to the **Spec** field; extend **Adds** to cover the `label` basename-capitalisation derivation (interior hyphens preserved, only the leading character capitalised) and the synthesised typed-query tool's literal label `"Loom typed-query response"`; add a **Tests** bullet asserting both — `code-review.loom` materialises `label: "Code-review"` and the typed-query one-shot tool materialises `label: "Loom typed-query response"`.

In `coverage-matrix.md`: add a *Code-keyed obligation areas* row mapping `extension-bootstrap-and-per-loom.md` §Per-loom registration's ToolDefinition-shape MUSTs (the `label` basename-capitalisation derivation and the typed-query literal label) to closing leaf `V9f`, marked as GOV-22 un-anchored residue consistent with the sibling rows.

No new leaf or ID is needed, and no `H5b` Deps edit is owed — `V9f` is already covered by `H5b`'s `V9a`–`V9j` range.

## Relationships

- T31 "Extension-bootstrap SDK-failure rule + code have no closing leaf" — same-cluster (same spec page `extension-bootstrap-and-per-loom.md`, different obligation family; resolves independently)
- T03 "Two PIC teardown pages absent from coverage-matrix code-keyed table" — same-cluster (same coverage-matrix un-anchored-MUST arm; resolves independently)

---

# T22 — Ambient-primitive scan's five-name list omits spec-banned clock primitives (`performance.now`, `clearTimeout`)

**Original heading:** Ambient-primitive ban assumes five-name list is the complete ambient surface
**Original section:** docs/plan_topics/conventions.md
**Kind:** assumptions
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

The *No globals, statics, singletons* rule in `conventions.md` bans direct `src/**` reference to exactly five ambient primitives — `process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, `setTimeout` — and declares that the H3a identifier-keyed scan plus the *Per-phase TDD ritual* self-review "partition the space with no third gap between them." The manual-residue list the rule concedes covers only *indirect forms* of those five names (aliased, destructured, computed, helper-wrapper, re-export reads); it does not cover any primitive outside the five.

The spec's own seam contract enumerates a larger ambient surface for the timing area alone. `host-interfaces-services.md` (the `Clock` / `WallClock` contract) states the runtime "MUST NOT call `Date.now`, `performance.now`, `Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout` outside the `WallClock` adapter," and the production `WallClock` adapter delegates `now()` to `performance.now()`, `wallNow()` to `Date.now()`, and its timer methods to the global `setTimeout` / `clearTimeout`; `implementation-notes.md` §Clock restates the same ban. So `performance.now`, `clearTimeout`, and `Date.prototype.getTime` are seam-wrappable primitives the WallClock adapter actually uses and the spec explicitly bans elsewhere — yet none is in the H3a scan's five-name list, and none is an indirect form of a listed name, so none is in the manual-residue list either.

A direct `performance.now()` or `clearTimeout(...)` call in a `src/**` module outside the WallClock adapter therefore falls into a genuine third gap: the identifier-keyed scan does not flag it (the identifier is not enumerated), and the self-review residue paragraph does not name it. This contradicts both the "no third gap" partition claim and the spec's hard MUST-NOT. The five-name list was treated as the complete ambient surface without being reconciled against the spec's enumerated ban or the V8* adapter primitive set.

## Plan Documents

- `docs/plan_topics/conventions.md` — Cross-cutting rules, *No globals, statics, singletons* (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — ambient-access scan Tests bullet + Adds (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — `Clock` seam Adds + PIC-12 exempt-site registration (edited)
- `docs/plan_topics/coverage-matrix.md` — IMPL row "ambient-access ban → `H3a`" back-reference (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — `Clock` / `FakeClock` interface and WallClock ambient ban (read-only)
- `docs/spec_topics/implementation-notes.md` — §Clock (read-only)

(The spec already enumerates the complete ban; the fix is internal to the plan files, bringing them into line with the spec.)

## Affected Leaves

**Phases:** Horizontal, Vertical (V8)

**Leaves (implementation order):**

- `H3a` — Dependency-injection seam skeleton — (modified) — closing leaf for the ambient-access ban; owns the identifier-keyed scan whose enumerated set must reconcile with the spec ban
- `V8b` — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (modified) — PIC-12 WallClock adapter uses `performance.now`/`clearTimeout`; the exempt-site registration must cover them

## Consequence

**Severity:** correctness

The H3a scan as enumerated does not enforce the spec's full WallClock ambient ban: a direct `performance.now()`, `clearTimeout(...)`, or `Date.prototype.getTime()` call outside the adapter would pass the gate unflagged while violating an explicit spec MUST-NOT, and the "no third gap" completeness claim is false. Two reasonable implementers — one extending the scan to the spec's full surface, one transcribing only the five names — would produce divergent gates, and a non-conformant ambient timing read could ship undetected.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** `49379da` (2026-06-11) — *pi-loom plan: resolve "ambient-access scan seam-adapter recognition rule"*; `f005760` (2026-06-11) — *pi-loom plan: resolve "Architectural / ambient-access scan blind spots have no named compensating review gate"*
**History:** `git log -S "crypto.randomUUID" -- docs/plan_topics/conventions.md` and `git show 49379da` show the *No globals, statics, singletons* ambient-primitive ban entered the corpus in `49379da` already carrying its five-name enumeration (`process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`, `setTimeout`); that enumeration has never matched the spec's WallClock ban surface (`Date.now`, `performance.now`, `Date.prototype.getTime`, `setTimeout`, `clearTimeout`) at `host-interfaces-services.md`. `git log -G "no third gap" -- docs/plan_topics/conventions.md` shows the completeness overclaim was layered on later in `f005760`, which added the manual-residue paragraph and the assertion that "the mechanical scans and that named review step partition the space with no third gap between them" over the still-incomplete five-name list. The defect is the interaction: an under-enumerated scan list (`49379da`) was made total by a partition claim (`f005760`) that the manual-residue list — enumerating only indirect forms of the five named primitives, not entirely-unlisted ones — does not actually back. The plan corpus is git-tracked, so the history is determinate.

## Solution Space

**Shape:** single

### Recommendation

Extend the scan's enumerated set to the spec's full ambient ban surface. In `conventions.md` *No globals, statics, singletons* and the H3a ambient-scan Tests bullet, replace the five-name list with the complete set the spec's WallClock ban enumerates: keep `process.env`, `process.cwd`, `crypto.randomUUID`, and add the timing primitives the spec bans outside the WallClock adapter — `performance.now`, `clearTimeout`, and `Date.prototype.getTime` — alongside the existing `Date.now` and `setTimeout`. Source the enumerated set directly from the spec's WallClock ban (`host-interfaces-services.md`) so the two stay in lockstep. Register the WallClock adapter's `performance.now()` (`now()`) and `clearTimeout` sites in V8b as exempt ambient sites via the existing `// allow-ambient: <primitive> — Clock` comment + allow-list mechanism, the same way the adapter's `Date.now`/`setTimeout` sites are already registered.

The spec imposes a hard MUST-NOT on `performance.now`/`clearTimeout`/`Date.prototype.getTime` outside the WallClock adapter, and the WallClock adapter is the only legitimate reference site for each — so those sites are registerable as exempt ambient sites and the mechanical scan should enforce exactly the spec's surface. Edge cases the implementer must watch: `now()` resolves to `performance.now()` and `wallNow()` to `Date.now()`, both inside WallClock — each needs its own exempt-site registration; and the scan is scoped to `src/**` excluding `**/*.test.ts`, so the `FakeClock` test double and test-side timer use stay out of scope. Deriving the enumerated identifier set from the spec's WallClock ban keeps the conventions list and the spec ban in lockstep; omitting a further spec-banned primitive would re-open the gap.

## Relationships

- T24 "Ambient-access allow-list lacks a defined representation or location" — must-follow (Option A registers new `performance.now`/`clearTimeout` exempt sites, which presupposes the allow-list's representation and location being pinned first)
- T20 "Systemic leaf over-bundling across the leaf corpus" — same-cluster (a V8b split redistributes the PIC-12 exempt-site registration this fix touches; resolves independently)

---

# T23 — `no-broad-catch` allow-list has no defined representation or location

**Original heading:** `no-broad-catch` allow-list has no defined representation or location
**Original section:** docs/plan_topics/conventions.md
**Kind:** implementability
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

The *Specific exception types only* rule in `conventions.md` permits a `catch (e: unknown)` clause only at an exempt broad-catch site, and only if **both** conditions hold: the same line carries a `// allow-broad-catch: <token> — <spec-page>` comment **and** "the call site is enumerated in the lint allow-list". The rule then says "the loom 1.0 closing gate asserts every allow-list entry's cited token resolves to one of [four arms]". The phrase "the lint allow-list" is never defined: no file states whether it is the set of `// allow-broad-catch:` comments scattered across `src/**`, a discrete registry file or ESLint-config array, where it lives, or what an entry's shape is.

The two leaves that operationalise the rule disagree with the two-condition wording. `H2a` wires the `no-broad-catch` ESLint rule and tests only the same-line comment ("a fixture file containing `catch (e: unknown)` with no `// allow-broad-catch:` comment fails lint; an allow-listed exempt site whose comment cites any admitted token passes") — it exercises no separate registry. `H5a`'s reconciler likewise treats each "`// allow-broad-catch:` entry" as the allow-list entry it validates. So the de-facto mechanism in both leaves is "the same-line comment IS the enumeration", yet the rule prose asserts a second, undefined condition on top of the comment.

This parallels the sibling *Sequential by default* rule, which is explicit that its `no-restricted-syntax` allow-list "enumerates a per-site allow-list; each entry MUST carry a same-line comment" — there the enumeration's home (the ESLint rule config) is named. The broad-catch rule borrows the two-part shape without the matching definition.

## Plan Documents

- `docs/plan_topics/conventions.md` — *Specific exception types only* cross-cutting rule (edited)
- `docs/plan_topics/H2a-cross-cutting-gates.md` — `no-broad-catch` lint wiring + Tests bullet (edited)
- `docs/plan_topics/H5a-closing-gate-automation.md` — broad-catch allow-list reconciliation arm + Tests bullet (edited)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — factory host-binding `try`/`catch` (Pi SDK boundary exempt site) (option-dependent)
- `docs/plan_topics/V9a-capability-probe.md` — self-failure probe-trap exempt sites (PIC-3…6) (option-dependent)
- `docs/plan_topics/V9g-session-shutdown.md` — per-step-isolation `session_shutdown` wraps (PIC-7) (option-dependent)
- `docs/plan_topics/V9h-degraded-unknown-reason.md` — unknown-reason `event.reason` read exempt site (option-dependent)
- `docs/plan_topics/V7a-diagnostics-primitive.md` — diagnostic-emission-isolation `console.error` wraps (PIC-21) (option-dependent)

## Spec Documents

None — the fix is internal to the plan's convention prose and the two horizontal gate leaves.

## Affected Leaves

**Phases:** Horizontal, Vertical slices

**Leaves (implementation order):**

- H2a — Cross-cutting lint and architectural gates — (modified)
- H4a — Extension factory shell and end-to-end harness — (modified)
- H5a — REQ-ID / diagnostic-code closing-gate automation — (modified)
- V7a — Diagnostics primitive and `loom-system-note` channel — (modified)
- V9a — Capability probe (Step 0) — (modified)
- V9g — Session-shutdown teardown and emission isolation — (modified)
- V9h — Session-only degraded state and unknown-reason rule — (modified)

(H4a / V7a / V9a / V9g / V9h are `modified` only under a discrete-registry resolution, where each exempt-site owner would register an allow-list entry; under the recommended comment-as-enumeration resolution they are unchanged.)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one builds a discrete allow-list registry per the literal two-condition wording while another (matching H2a/H5a's actual Tests) treats the same-line comment as the sole enumeration. The `no-broad-catch` lint (H2a) and the closing-gate reconciler (H5a) could then be built against different models — a broad-catch site permitted by one is rejected by the other, or H5a reconciles a registry that the lint never reads — so the gate that is supposed to keep exempt sites honest cannot be trusted to agree with the rule it enforces.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** b8bc4ce — pi-loom spec: resolve "Broad-catch sites lack matching no-broad-catch exemption" (2026-06-04, Thomas Andersen)
**History:** The exempt-broad-catch mechanism — and with it the two-condition wording "the same line carries a `// allow-broad-catch:` comment and the call site is enumerated in the lint allow-list" — entered `conventions.md` in b8bc4ce, which added the `// allow-broad-catch:` exemption. That commit named a "lint allow-list" as a second condition but never defined its representation, location, or entry shape. Later edits (96563f9 widening the cited-token predicate; 80f7c51 re-attributing the gates' owning leaf) touched the surrounding prose without resolving the gap, so the undefined allow-list has been present since b8bc4ce.

## Solution Space

**Shape:** single

### Recommendation

In `conventions.md`, *Specific exception types only* rule: collapse the two-condition wording so the same-line `// allow-broad-catch: <token> — <spec-page>` comment is itself the per-site enumeration — there is no separate registry. Strike the clause "and the call site is enumerated in the lint allow-list" and rephrase so the sentence reads to the effect of: a `catch (e: unknown)` is permitted only at an exempt broad-catch site whose same line carries the `// allow-broad-catch:` comment; the set of those comments across `src/**` is the lint allow-list. Keep the existing follow-on sentence that the loom 1.0 closing gate asserts every such entry's cited token resolves to one of the four admitted arms (coverage-matrix REQ-ID, *Code-keyed obligation areas* entry, `loom/...` registry code, or the structural `pi-sdk-boundary` token).

Align the two operationalising leaves to the same single-source statement so the rule, the enforcer, and the reconciler agree:

- `H2a` — in the *Specific exception types only* Tests bullet and the `Adds.` description of `no-broad-catch`, state that the rule permits a broad catch iff the same-line `// allow-broad-catch:` comment is present at an exempt-site shape; no separate allow-list file is read.
- `H5a` — in the broad-catch reconciliation prose and its Tests bullet, state that the gate scans the `// allow-broad-catch:` comments in the corpus as the allow-list entries it validates.

Edge cases for the implementer: the exempt-site *kind* (the five enumerated site categories) is still a precondition the lint must recognise structurally — the comment alone does not make an arbitrary site exempt; and the token-resolution check stays H5a's responsibility, not H2a's. Apply the representation wording consistently with the parallel *ambient-access* allow-list so the two "same-line-comment-plus-allow-list" rules do not describe their enumeration differently.

## Relationships

- T24 "Ambient-access allow-list lacks a defined representation or location" — co-resolve (same structural defect; the single "is the allow-list the set of comments or a discrete registry?" decision settles both, and the conventions text explicitly couples the two mechanisms)

---

# T24 — Ambient-access allow-list lacks a defined representation or location

**Original heading:** Ambient-access allow-list has no defined representation or location
**Original section:** docs/plan_topics/conventions.md
**Kind:** implementability
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

The *No globals, statics, singletons* rule in `conventions.md`, the `H3a`
architectural-test contract, and `V8b`'s PIC-12/PIC-20 bullets all gate the
ambient-primitive ban on **two** conditions: a direct reference to a banned
primitive (`process.env`, `process.cwd`, `crypto.randomUUID`, `Date.now`,
`setTimeout`) is an *exempt ambient site* only if (1) the same line carries a
`// allow-ambient: <primitive> — <seam>` comment **and** (2) "the site is
enumerated in the ambient-access allow-list the scan consults." No file
defines what that allow-list is — its path, its format, or how a `V8*`
adapter registers an entry the `H3a` identifier-keyed scan can read.

The surrounding prose pulls in opposite directions. "Registering a new exempt
site requires no `H3a` edit" and "the allow-list … starts empty … each
adapter site is registered as its leaf lands" read as if the scan simply
discovers the `// allow-ambient:` comments (the comments *are* the
enumeration). But the literal two-condition wording — comment **and**
enumerated allow-list entry — reads as a discrete registry that exists
separately from the comments. The rule also claims this is "the same
same-line-comment-plus-allow-list mechanism the *Specific exception types
only* and *Sequential by default* rules establish," yet those rules are
ESLint-backed (`no-broad-catch`, `no-restricted-syntax`) while the ambient
scan is a Vitest architectural test with no rule-options registry described —
so the asserted parallel does not pin a concrete representation either.

A `H3a` implementer therefore cannot tell whether to build a separate
allow-list artefact (and in what format/location) or to treat the same-line
comment as the sole enumeration. A `V8b` implementer registering the
`WallClock`/`IdSource`/`FileSystem` adapter sites faces the same ambiguity,
and the two leaves can implement mutually incompatible contracts.

## Plan Documents

- `docs/plan_topics/conventions.md` — *No globals, statics, singletons* rule (edited)
- `docs/plan_topics/H3a-di-seam-skeleton.md` — Adds / Tests (edited)
- `docs/plan_topics/V8b-clock-fs-id-watch-token-seams.md` — PIC-12 / PIC-20 / PIC-13 Tests bullets (option-dependent)
- `docs/plan_topics/V8b-T-clock-fs-id-watch-token-seams.md` — paired tests task (option-dependent)

## Spec Documents

None — the ambient-primitive ban is a project convention (horizontal), not a spec REQ-ID; the fix is internal to plan files.

## Affected Leaves

**Phases:** Horizontal, Vertical (V8)

**Leaves (implementation order):**

- H3a — Dependency-injection seam skeleton — (modified)
- V8b — `Clock`, `FileSystem`, `IdSource`, `FileWatcher`, `TokenEstimator` seams — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers diverge: one builds a discrete allow-list registry
the `H3a` scan reads; another treats the `// allow-ambient:` comments as the
enumeration. The `V8b` adapters then register exempt sites against a contract
that either does not exist or that the `H3a` scan does not read, so a genuine
ambient-access regression at an adapter site can pass — or a legitimate
adapter site can red — depending on which interpretation each leaf adopted.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 49379da — pi-loom plan: resolve "ambient-access scan seam-adapter recognition rule" (2026-06-11, Thomas Andersen)
**History:** Before 49379da the *No globals, statics, singletons* rule was a one-line "all collaborators passed by constructor; an architectural test enforces this against `src/**`" statement with no ambient-primitive surface. Commit 49379da introduced the ambient ban together with its dual "same-line `// allow-ambient:` comment **and** enumerated allow-list entry" mechanism across `conventions.md`, `H3a`, and `V8b` in one edit, and that same commit never defined the allow-list's representation or location — so the gap is coextensive with the mechanism it introduced.

## Solution Space

**Shape:** single

### Recommendation

State that the same-line `// allow-ambient: <primitive> — <seam>` comment is
itself the enumeration — there is no separate allow-list artefact. Concretely:

- In `conventions.md` *No globals, statics, singletons*, replace the
  two-condition clause ("the same line carries a `// allow-ambient: …`
  comment **and** the site is enumerated in the ambient-access allow-list the
  scan consults") with a single-condition statement: a direct reference is an
  exempt ambient site iff its line carries the `// allow-ambient: <primitive>
  — <seam>` comment, and the phrase "the ambient-access allow-list" denotes
  exactly the set of those same-line comments the `H3a` scan discovers (no
  separate registry file). Retain the existing "append-only, starts empty,
  grows as each `V8*` adapter lands, requires no `H3a` edit" properties —
  they already describe comment-based enumeration.
- In `H3a` Adds and the second Tests bullet, drop "and enumerated in the
  ambient-access allow-list" as a second condition; keep "a site carrying a
  same-line `// allow-ambient: <primitive> — <seam>` comment," and state the
  scan recognises exempt sites by that comment alone.
- In `V8b` PIC-12 and PIC-20, the existing "`// allow-ambient: …` comment plus
  allow-list entry" phrasing collapses to the comment alone; the adapter sites
  (`WallClock` for `Date.now`/`setTimeout`, `IdSource` for
  `crypto.randomUUID`, `FileSystem` for `process.cwd`) carry the comment and
  are thereby exempt.

Edge cases for the implementer:

- The conventions cross-reference asserting this is "the same … mechanism the
  *Specific exception types only* and *Sequential by default* rules establish"
  must be reconciled jointly with the `no-broad-catch` allow-list finding
  (those rules are ESLint-backed and carry a closing-gate token check the
  ambient scan does not), so the three rules end up describing one consistent
  enumeration model rather than implying a shared registry that does not
  exist.
- Unlike the broad-catch / sequential allow-lists, the ambient `// allow-ambient:`
  comment carries no closing-gate token-resolution check today; the fix should
  not imply one unless it also adds it.

## Relationships

- T23 "`no-broad-catch` allow-list has no defined representation or location" — co-resolve (same structural defect; the single "is the allow-list the set of comments or a discrete registry?" decision settles both, and the conventions text explicitly couples the two mechanisms)
- T22 "Ambient-primitive ban assumes five-name list is the complete ambient surface" — must-precede (this allow-list representation must be pinned before T22 registers new `performance.now`/`clearTimeout` exempt sites against it)

---

# T25 — Degraded-state obligations are required green at loom 1.0 over an open spec contradiction, gated only by a manual checklist

**Original heading:** Degraded-state obligations built/tested against an unresolved open spec contradiction, gated only by manual review
**Original section:** docs/plan_topics/V9h-degraded-unknown-reason.md
**Kind:** implementability, validation, risk, ordering
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

`V9h`'s own Precondition block states that its session-only degraded-state branch — the `new`/`resume`/`fork` arm comprising the `markRuntimeDegraded` tag write, the `"degraded-needs-reload"` transition, the `loom/host/session-shutdown-runtime-degraded` emission, and `/reload`-only recovery — rests on `host-prerequisites.md` clause **(a)**. The spec records clause (a) not as an accepted presupposition but as an **open contradiction** against Pi's documented teardown-and-rebind extension lifecycle at the loom 1.0 Pi-SDK pin: Pi reloads-and-rebinds the extension for the swapped-in session, so the drained `LoomRegistry` the branch depends on does not survive, and the spec is explicit that the resolution "may find the branch unreachable as written" and require `SM-4`/`SM-5`/`SM-6`/`SM-3b` to be reworked.

Despite that, `V9h`'s **Tests** and **Ships when** require the degraded path green at loom 1.0 (`npm test` exercises "the closed-set, unknown, snapshot-failure, and degraded paths with their codes"), and the spec's `session-only-degraded-state.md` acceptance criteria (a)–(m) are mapped to `V9h` in `coverage-matrix.md`. The only thing standing between "build it green" and "the contradiction is resolved" is the manual version-bump editorial-review checklist item (a) (`version-bump-step2.md#bump-checklist-instance-survival`), whose done condition is a per-item outcome recorded in a commit message — explicitly **not** `npm test`. No plan leaf produces the deciding resolution.

The consequence is that the `npm test` green gate gives false confidence: an implementer picks up `V9h`, builds the degraded-state branch, watches it pass, and tags the leaf complete — over obligations the spec says may be dead or wrong. The clause-(a) resolution is invisible to a planner reading `plan.md` (it lives only in an inline prose block on the leaf and in a downstream version-bump checklist), and there is no pre-designed fallback for the "branch unreachable" outcome.

## Plan Documents

- `docs/plan_topics/V9h-degraded-unknown-reason.md` — Precondition / Tests / Ships when / Deps (edited)
- `docs/plan_topics/coverage-matrix.md` — `session-only-degraded-state.md` row (line 88), currently mapped to `V9h` (edited)
- `docs/plan_topics/H5b-warn-only-canary.md` — Deps (transitive-completeness singleton set) (option-dependent)
- `docs/plan.md` — V9 slice list; Open Questions / Blocked Obligations surface (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — editorial-review checklist item (a) (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — clause (a), `#degraded-state-host-prerequisites` (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — `#bump-checklist-instance-survival` (read-only)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — degraded-branch obligations + acceptance criteria (option-dependent: edited only if the clause-(a) resolution finds the branch unreachable)
- `docs/spec_topics/session-model-and-appendix.md` — `SM-4`/`SM-5`/`SM-6`/`SM-3b` (option-dependent: same condition)

## Affected Leaves

**Phases:** Vertical slices — V9, V18

**Leaves (implementation order):**

- `V9h` — Session-only degraded state and unknown-reason rule — (modified)
- `<new>` — session-only degraded-state branch, blocked on the clause-(a) resolution — (added)
- `V18c` — Pi version-bump static gates — (read-only; carries the editorial-review checklist item (a) that records the resolution)

## Consequence

**Severity:** correctness

An implementer following `V9h` as written builds and ships the `SM-4`/`SM-5`/`SM-6`/`SM-3b` degraded-state branch green at loom 1.0, even though the spec records its founding premise as an open contradiction that "may find the branch unreachable as written." The `npm test` green and the `coverage-matrix.md` → `V9h` mapping let the closing gate pass vacuously over obligations that may encode contradicted (dead or wrong) behaviour, while the only real gate — the manual version-bump checklist — never runs at 1.0 and produces no mechanical signal.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-11, Thomas Andersen); a70e2a7 — pi-loom plan: resolve "V9h degraded-state branch over unresolved host contradiction" (2026-06-11, Thomas Andersen)
**History:** `V9h` was created in the plan's first commit `c6a664e` already requiring the degraded path green at loom 1.0 in its Tests and Ships-when, with no gating against the host contradiction (the leaf did not yet even cite `host-prerequisites.md`). A later commit `a70e2a7`, titled as a resolution of a prior review finding on this exact branch, added the `host-prerequisites.md` Spec cite and the inline Precondition prose block surfacing clause (a) as an open contradiction, but left Tests and Ships-when unchanged and expressed the gate only as prose rather than a hard dependency — so the core defect (degraded obligations required green over an unresolved contradiction, gated only by manual review) has been present since inception and the intervening commit documented it without closing it.

## Solution Space

**Shape:** single

### Recommendation

Split the `SM-4`/`SM-5`/`SM-6`/`SM-3b` degraded-state obligations into a new leaf (`<new>`) under V9, gated on the clause-(a) resolution; leave `V9h` owning only the unknown-reason / closed-set / snapshot-failure paths, which the Precondition already notes are unaffected by clause (a) and remain pickable.

- Create `<new>` with the degraded-state `Adds`/`Tests`/`Ships when` lifted from `V9h` (the tag write, `"degraded-needs-reload"` transition, `runtime-degraded` emission, `/reload`-only recovery, and acceptance criteria (a)–(m)). Express the gate on clause (a) as a `Deps`/blocked-leaf annotation pointing at the resolution owner, not prose. Name the fallback in `<new>`: if the resolution finds the branch unreachable, collapse to full teardown + `/reload` with no degraded tag write.
- In `V9h`, remove the degraded-state Tests bullet and the `degraded` term from Ships when, so its Ships when reads e.g. `npm test exercises the closed-set, unknown, and snapshot-failure paths with their codes`. Remove the inline Precondition block (its content moves to `<new>` and to the plan.md surface below).
- Retarget `coverage-matrix.md`'s `session-only-degraded-state.md` row (line 88) from `V9h` to `<new>`.
- Add `<new>` to `H5b`'s Deps if it introduces or closes a coverage-matrix-mapped obligation (per `plan.md` step 2 / `conventions.md` §REQ-ID discipline).
- Record the clause-(a) open question and the named fallback in a `plan.md` Open Questions / Blocked Obligations section so it is visible to a planner.

Resolve in this order: first split and gate the degraded-state work into `<new>` with the clause-(a) blocked annotation and the coverage-matrix/H5b retarget (this bounds the scope and lets `V9h` close at 1.0); then, on that stable baseline, author the named fallback inside `<new>` (collapse to full teardown + `/reload`, no tag write) so the "branch unreachable" outcome has a pre-designed landing rather than leaving the obligations as dead code. Surface the clause-(a) open question in a `plan.md` Blocked Obligations section keyed to version-bump checklist item (a), so the resolution owner is visible to a planner and the block is not buried in leaf prose. Edge case the implementer must watch: the unknown-reason / closed-set / snapshot-failure obligations must stay in `V9h` (they are explicitly unaffected by clause (a)) and must not be carried into the blocked leaf. Spec edits (`session-only-degraded-state.md` and `SM-4`/`SM-5`/`SM-6`/`SM-3b`) are needed only downstream if the resolution finds the branch unreachable.

## Relationships

- T11 "V9h parks a blocking dependency and open-risk note in a non-standard inline Precondition field" — co-resolve (the same split + blocked-leaf annotation + plan.md Blocked Obligations surface removes the misplaced inline block)
- T10 "V9h cites 'four discriminators' without enumerating them" — same-cluster (touches V9h's snapshot-failure path, which stays in V9h; resolves independently)

---

# T26 — V13a asserts the `discarded-query-result` runtime event but omits the V9d channel from its Deps

**Original heading:** Emits `discarded-query-result` runtime event without declaring the event-channel leaf V9d
**Original section:** docs/plan_topics/V13a-query-render.md
**Kind:** ordering
**Importance:** high
**Score:** 85
**MustFix:** false

## Finding

`V13a` (Query render and escapes) and its paired tests task `V13a-T` carry a Tests bullet that asserts the `discarded-query-result` diagnostic *and its runtime event* fire: "Each loom type stringifies per the table; `interpolated-result` and `discarded-query-result` (with its runtime event) fire." The runtime event for a discarded query result is a group-A `details: { event: RuntimeEvent }` emission on the `loom-system-note` channel, carrying the `discard_site` field — exactly the machinery (the `RuntimeEvent` payload shape, the always-log group-A routing, and the `loom-system-note` delivery surface) defined by `V9d` (Runtime-event channel and `masked` co-fire). This channel is distinct from the V7a diagnostics channel.

`V13a`'s declared Deps are `V13a-T, V11d, V2c, V4d`; `V13a-T`'s are `V11d, V2c, V4d`. `V9d` appears in neither, and is not reachable transitively: `V11d` deps `V11a/V2a/V2d/V5d/V8a`, `V2c` deps `V2a/V5d`, and `V4d` deps `V5d` — none of which reach `V9d` (the only leaf depending on `V9d` in the corpus is `V16a`). The runtime-event channel `V9d` builds is therefore not guaranteed to exist when `V13a`/`V13a-T` are picked.

Because the plan's build order is dep-driven and slice numbering is explicitly editorial ("sequence by **Deps**, not slice number"), an implementer who picks `V13a` once its declared Deps are green can do so before `V9d` has been built. The `discarded-query-result` runtime-event assertion then has no channel to emit on or observe against.

## Plan Documents

- `docs/plan_topics/V13a-query-render.md` — Deps (edited)
- `docs/plan_topics/V13a-T-query-render.md` — Deps (edited)
- `docs/plan_topics/V9d-runtime-event-channel.md` — runtime-event channel definition (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slices (V13 — Query)

**Leaves (implementation order):**

- `V13a-T` — Query render and escapes (tests) — (modified)
- `V13a` — Query render and escapes — (modified)

## Consequence

**Severity:** blocking

When `V13a`/`V13a-T` are picked per their declared Deps (the canonical dep-driven order) before `V9d` is built, the runtime-event channel does not yet exist, so the `discarded-query-result` runtime-event assertion in `V13a-T` cannot be written to fail red for the intended reason and the `V13a` test cannot pass. The leaf pair cannot be completed at the point the build order admits it.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V13a`'s first commit (c6a664e) already carried both the `discarded-query-result` "(with its runtime event)" Tests bullet and a Deps line that omits V9d (then `V13a-T, V11d, V2c`); the V9d runtime-event-channel leaf was created in that same commit, so the gap is the missing Deps edge rather than a missing target. A later commit a12e8b2 (2026-06-11) edited the same Deps line to add `V4d` while resolving an unrelated missing-dependency finding, but did not add `V9d`, leaving the gap intact.

## Solution Space

**Shape:** single

### Recommendation

Add `V9d` to the **Deps.** field of both leaves in the pair:

- In `docs/plan_topics/V13a-query-render.md`, extend `**Deps.** \`V13a-T\`, \`V11d\`, \`V2c\`, \`V4d\`` to also list `\`V9d\``.
- In `docs/plan_topics/V13a-T-query-render.md`, extend `**Deps.** \`V11d\`, \`V2c\`, \`V4d\`` to also list `\`V9d\``.

This is the only correct resolution: the runtime-event channel is genuinely unreachable through `V13a`'s current transitive deps (verified against `V11d`/`V2c`/`V4d`), so the alternative of relying on an existing transitive edge does not apply.

Implementer note: `V9d` already deps `V7a`, so declaring `V9d` also brings the diagnostics primitive into transitive reach — expected, and harmless. The discarded-query event is group-A (`details: { event: RuntimeEvent }`) routed by `V9d`, not a V7a diagnostics-channel emission, so V7a alone would not satisfy the assertion.

## Relationships

- T27 "Depth-walk fast-fail test consumes V5e's depth walk without declaring V5e in Deps" — same-cluster (sibling confirmed cross-shard missing-Deps-edge defect on a different leaf; resolved by an independent Deps edit)

---

# T27 — Depth-walk fast-fail test consumes V5e's depth walk without declaring V5e in Deps

**Original heading:** Depth-walk fast-fail has an undeclared dependency on V5e
**Original section:** docs/plan_topics/V11f-binder-retry-taxonomy.md
**Kind:** ordering
**Importance:** high
**Score:** 85
**MustFix:** false

## Finding

`V11f`'s "Depth-walk fast-fail `<ajv-summary>` rendering" test bullet asserts that a binder `kind:"ok"` envelope whose `args` trip the depth-walk fast-fail at the `params` boundary renders the *AJV validation of the binder's `args` failed* row with `<ajv-summary>` equal to the **single canonical depth-walk `ValidationIssue`** (`schema_keyword:"maxDepth"`, message `"JSON document depth exceeds 5"`). That `ValidationIssue` and its `maxDepth` rendering are owned by `V5e` (JSON document depth enforcement, hard ceiling #4) — the test explicitly requires the summary to be synthesised from the depth-walk issue rather than from an AJV `errorsText` traversal, so the depth-walk machinery from `V5e` must exist before the test can be written or pass.

`V11f`'s Deps are `V11f-T, V11e, V9j, V16a, V17a`, and the paired tests leaf `V11f-T`'s Deps are `V11e, V9j, V16a, V17a`. Neither lists `V5e`, and `V5e` is not transitively reachable from either Deps set (the transitive closure of `V11f`'s Deps reaches `V5d` — V5e's own dependency — but never `V5e` itself). The sibling leaf `V13c`, which exercises the same `maxDepth` depth-walk path for the typed-query response surface, correctly declares `V5e` in its Deps, confirming `V5e` is the canonical source for this behaviour and that the omission in the `V11f` pair is the anomaly.

Under the plan's Deps-driven pick rule (How-to-use step 3: "Pick the next leaf whose **Deps** are satisfied"), an implementer could legitimately pick up `V11f-T` / `V11f` with `V5e` unbuilt, at which point the depth-walk fast-fail test cannot be written against a non-existent canonical `ValidationIssue`, nor can it pass.

## Plan Documents

- `docs/plan_topics/V11f-binder-retry-taxonomy.md` — Deps field (edited)
- `docs/plan_topics/V11f-T-binder-retry-taxonomy.md` — Deps field (edited)
- `docs/plan_topics/V5e-depth-enforcement.md` — Adds / Tests (read-only) — confirms the canonical `maxDepth` `ValidationIssue` ownership
- `docs/plan_topics/V13c-query-tool-loop.md` — Deps field (read-only) — sibling precedent that correctly declares `V5e`
- `docs/plan.md` — How-to-use Deps-driven pick rule (read-only)

## Spec Documents

None

## Affected Leaves

**Phases:** Vertical slice V11

**Leaves (implementation order):**

- `V11f-T` — Binder cancellation, per-class retry budget, and failure taxonomy (tests) — (modified)
- `V11f` — Binder cancellation, per-class retry budget, and failure taxonomy — (modified)

## Consequence

**Severity:** blocking

If `V11f-T` / `V11f` is picked when its declared Deps are green, `V5e`'s depth walk may be unbuilt, so the depth-walk fast-fail test has no canonical `maxDepth` `ValidationIssue` to synthesise its `<ajv-summary>` from — the test cannot be written for the intended reason and cannot pass. The Deps DAG therefore admits a build order in which an acceptance gate is unsatisfiable.

## Issue introduction

**Verdict:** single-commit
**Introducing commits:** 62d0251 — pi-loom plan: resolve "AJV-on-args depth-walk fast-fail ajv-summary has no asserting test" (2026-06-11, Thomas Andersen)
**History:** `V11f` and `V11f-T` were created at c6a664e (2026-06-10) with Deps `V11f-T, V11e, V9j, V16a, V17a` (and `V11e, V9j, V16a, V17a` respectively); at that point neither leaf consumed `V5e`. Commit 62d0251 (2026-06-11) added the "Depth-walk fast-fail `<ajv-summary>` rendering" test bullet to both leaves — which consumes `V5e`'s canonical depth-walk `ValidationIssue` (`schema_keyword:"maxDepth"`) — but did not add `V5e` to either leaf's Deps, introducing the undeclared dependency.

## Solution Space

**Shape:** single

### Recommendation

Add `V5e` to the **Deps** field of both `docs/plan_topics/V11f-binder-retry-taxonomy.md` and `docs/plan_topics/V11f-T-binder-retry-taxonomy.md`.

- In `V11f-binder-retry-taxonomy.md`, change the Deps line from ``**Deps.** `V11f-T`, `V11e`, `V9j`, `V16a`, `V17a` `` so it also includes `` `V5e` ``.
- In `V11f-T-binder-retry-taxonomy.md`, change the Deps line from ``**Deps.** `V11e`, `V9j`, `V16a`, `V17a` `` so it also includes `` `V5e` ``.

This mirrors the existing, correct declaration in `V13c` (``**Deps.** `V13c-T`, `V13b`, `V9c`, `V16a`, `V5e`, `V8a` ``). No spec edit is required — `V5e` already owns and defines the canonical depth-walk `ValidationIssue` the test consumes; the gap is purely the missing Deps edge.

## Relationships

- T26 "V13a asserts the `discarded-query-result` runtime event but omits the V9d channel from its Deps" — same-cluster (sibling missing-Deps-edge defect on a different leaf; resolved by an independent Deps edit)

---

# T28 — Prompt→prompt `invoke` snapshot/restore has no failure-path restore assertion

**Original heading:** `setActiveTools` snapshot/restore mutates shared host state with no restore-on-failure assertion
**Original section:** docs/plan_topics/V15a-invocation-core.md
**Kind:** risk
**Importance:** high
**Score:** 100
**MustFix:** true

## Finding

`V15a` Adds "the prompt→prompt parent-suspend with the `setActiveTools` snapshot/restore" — the control surface that, around a prompt→prompt `invoke(...)`, snapshots the host's session-scoped active-tool set, swaps in the callee loom's callable set, runs the child body, and restores the snapshot in a `finally`. The spec mandates this restore-on-the-failure-path explicitly: `PIC-17` step 4 places the restore in a `finally` "so cancellation, panic, and provider exceptions all preserve the invariant," and `tool-registration-lifetime.md` names the prompt→prompt cross-mode path as one of the two `setActiveTools` snapshot/restore paths the protocol governs.

`V15a`'s Tests and Ships-when assert only the happy path: the cross-mode-matrix bullet checks "a child uses its own model/tools/system; prompt→prompt suspends the parent." No Test or Ships-when clause asserts that when the child invocation fails, cancels, or throws inside the suspended-parent window, the parent's active-tool set is observably restored to the pre-invoke snapshot. An implementer can satisfy every current `V15a` assertion with a build that installs the callee's tools and never restores them on the inner-failure path, because the only matrix assertion exercises a successful child.

The neighbouring restore protocols do not close this gap. `PIC-8`/`PIC-19` (owned by `V9f`) cover the case where the *restore call itself* throws and the setup-side snapshot/swap-install throws; `PIC-17` (owned by `V9c`) asserts the `finally` restore for a single prompt-mode *query*, and `PIC-2` (also `V9c`) asserts cross-body non-overlap. None of these fires on the specific event this finding names: a prompt→prompt child that fails while the parent is suspended, where the restore must still return the parent to its pre-invoke active set. That outcome belongs to the leaf that owns the parent-suspend snapshot/restore window — `V15a` — and is currently unasserted there.

## Plan Documents

- `docs/plan_topics/V15a-invocation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/V15a-T-invocation-core.md` — Tests / Ships when (edited)
- `docs/plan_topics/V9f-tool-registration-lifetime.md` — `PIC-8`/`PIC-19` restore-failure / install-failure protocols (read-only)
- `docs/plan_topics/V9c-conversation-drive.md` — `PIC-17` `finally` restore / `PIC-2` cross-body non-overlap (read-only)
- `docs/plan_topics/coverage-matrix.md` — `INV`/`PIC` → leaf mapping (read-only)

## Spec Documents

- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — `PIC-17` step-4 `finally` restore; `PIC-8`/`PIC-19`; recovery-mutex paragraph (read-only)

## Affected Leaves

**Phases:** Vertical V15

**Leaves (implementation order):**

- `V15a-T` — Invocation core (tests) — (modified)
- `V15a` — Invocation core — (modified)

## Consequence

**Severity:** correctness

If `V15a` ships unfixed, an implementer can build the prompt→prompt parent-suspend without the `finally` restore and every `V15a` test stays green, because the cross-mode-matrix assertion exercises only a successful child. The defect surfaces only after a child invocation fails or cancels: the parent is left bound to the callee loom's callable set, corrupting the active-tool set for every subsequent turn in that session — exactly the invariant `PIC-17`'s `finally` exists to protect.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, Thomas Andersen)
**History:** `V15a` was created in c6a664e with the prompt→prompt parent-suspend + `setActiveTools` snapshot/restore in **Adds** but only a happy-path cross-mode-matrix test and an `INV-1` containment Ships-when — no failure-path restore assertion ever existed. A later commit, e2d385b (2026-06-11, "resolve V15a omits Pi behavioural preconditions for prompt→prompt snapshot/restore"), deepened the **Spec** citation to name `PIC-8`/`PIC-19` and the recovery-mutex fallback, but added no corresponding Tests/Ships-when restore assertion, so the test gap persisted unchanged from inception.

## Solution Space

**Shape:** single

### Recommendation

Add an outcome-level test obligation for the prompt→prompt `invoke` restore path. Place the failing test in `V15a-T`'s **Tests** (the paired red-tests leaf) and the matching mirrored entry in `V15a`'s **Tests**, then extend `V15a`'s **Ships when** to require it.

The new assertion: after a prompt→prompt child invocation that fails, cancels, or throws inside the suspended-parent window, the parent's active-tool set is observably restored to its pre-invoke snapshot (the `PIC-17` step-4 `finally` restore exercised on the `invoke` path, with the inner failure surfaced and not masked). Word it against the observable active-set state (`pi.getActiveTools()` returns the pre-invoke snapshot after the failed child settles), not against an implementation hook.

Edge cases for the implementer:

- This is distinct from the assertions already owned elsewhere — do not duplicate them. `PIC-8`/`PIC-19` (the restore call itself throwing, and the setup-side snapshot/swap-install throwing) stay closed on `V9f`; `PIC-2` cross-body non-overlap stays on `V9c`. The new assertion is the restore-on-inner-failure for the `invoke` path, which no current leaf fires on.
- Cover the cancel and throw sub-cases of the child failure, since both transit the same `finally`.

## Relationships

- T20 "Systemic leaf over-bundling across the leaf corpus" — decision-dependency (the V15a split proposes peeling the prompt→prompt suspend + snapshot/restore into its own sub-leaf; if the split lands, this restore-test obligation should be authored onto whichever sub-leaf owns the parent-suspend window)

---

# T29 — Pi SDK is never provisioned into loom's own build-test environment, yet the version-bump gates live-read and import it

**Original heading:** Version-bump/harness leaves presuppose the Pi SDK is installed/resolvable at build-test time
**Original section:** docs/plan_topics/V18c-version-bump-checklist.md
**Kind:** assumptions
**Importance:** high
**Score:** 90
**MustFix:** false

## Finding

Several `V18`-phase gates require the four `@earendil-works/*` packages (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) to be resolvable under `node_modules` when `npm test` / `npm run typecheck` run on `main`:

- `V18c`'s `engines.node` three-way equality gate, operand (iii), is "the floor read live at build time from the installed `@earendil-works/pi-coding-agent` `package.json` under `node_modules` at the candidate version" (`version-bump-step2b.md` step 3). This is a module-resolving read of the installed dependency.
- `V18a`'s `SDK_SURFACE_INVENTORY` presence tests assert "each member is present on the pinned SDK", and `V18b`'s inventory-closure audit ranges over the SDK surface — both require the SDK importable.
- `V18c`'s strict-capability probe inspects a reachable `Model<Api>` declaration, and the `loom/typecheck/session-shutdown-reason-snapshot` brand-string gate is a `tsc` assertion against `SessionShutdownEvent['reason']` declared at `dist/core/extensions/types.d.ts` in `@earendil-works/pi-coding-agent` — both require the SDK's compiled surface and `.d.ts` present.
- `V18d`'s runtime-evidence gate (and the `H4a` harness it runs through) loads the extension, which imports SDK types, so the SDK must be resolvable to compile and run.

But `H1a`, the manifest owner, declares those four packages **only** as `peerDependencies`. `peerDependencies` are the consumer-facing contract; npm does not reliably install a package's own declared peers into that package's own `node_modules` during development, and the spec's host-prerequisites contract deliberately relies on `pnpm` (isolated mode) and `yarn` *not* deduplicating peer ranges — the very behaviour that means a peer-only declaration is not guaranteed present in loom's own checkout. No plan or spec text declares the precondition that the pinned Pi SDK is installed/resolvable in loom's own build-test environment, nor names a mechanism (a `devDependencies` / direct-dependency declaration, or an explicit install step) that provisions it. The `H1a` `Ships when` only exercises "zero production source files", so the gap is invisible until `V18a`/`V18b`/`V18c`/`V18d` are implemented and their SDK-reading tests fail to resolve the module.

## Plan Documents

- `docs/plan_topics/H1a-scaffold-and-toolchain.md` — Adds (manifest dependency declaration) + Tests (architectural devDependency assertions) (edited)
- `docs/plan_topics/V18c-version-bump-checklist.md` — Adds / Tests (gate descriptions that live-read and import the SDK) (option-dependent)
- `docs/plan_topics/V18a-capability-inventory.md` — Tests (surface-inventory presence assertions) (read-only)
- `docs/plan_topics/V18b-inventory-audit.md` — inventory-closure audit over `src/` (read-only)
- `docs/plan_topics/V18d-version-bump-acceptance.md` — runtime-evidence gate via the harness (read-only)
- `docs/plan_topics/H4a-factory-shell-and-harness.md` — harness compiles/imports SDK types (read-only)

## Spec Documents

- `docs/spec_topics/implementation-notes.md` — "Loom-package implementation dependencies (loom 1.0)" (option-dependent — natural home if the build-test SDK-provisioning precondition is recorded in the spec rather than only in `H1a`'s manifest)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — item 1 (Pi SDK pin) / "Loom-package implementation dependencies" (read-only — frames the four packages as the consumer-facing `peerDependencies` host contract; the build-test install precondition is distinct and unaddressed here)

## Affected Leaves

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- `H1a` — Project scaffold and toolchain — (modified)
- `H4a` — Extension factory shell and end-to-end harness — (blocked)
- `V18a` — SDK capability inventory — (blocked)
- `V18b` — Inventory-closure audit — (blocked)
- `V18c` — Pi version-bump static gates — (both)
- `V18d` — Pi version-bump runtime-evidence acceptance gate and revert path — (blocked)

## Consequence

**Severity:** blocking

`V18c`'s `engines.node` operand (iii) live-reads the installed `@earendil-works/pi-coding-agent` `package.json`, and `V18a`/`V18b`'s surface-inventory and the brand-string `tsc` gate import the SDK; with the SDK absent from loom's own `node_modules` these gates error on module resolution rather than producing a meaningful red, so the version-bump procedure's static gates cannot fire correctly. Because the manifest owner (`H1a`) declares the four packages only as `peerDependencies` — which the spec's own skew-detection rationale tells contributors not to expect deduped into the package's own tree — two reasonable implementers diverge (one adds a `devDependencies` declaration, one relies on fragile npm-7 peer auto-install that fails under the `pnpm`/`yarn` setups the spec targets), and CI under those package managers fails to provision the SDK at all.

## Issue introduction

**Verdict:** present-since-inception
**Introducing commits:** c6a664e — pi-loom plan: build/update plan for spec.md + review (2026-06-10, plan author)
**History:** The plan corpus is git-tracked (`git rev-parse --is-inside-work-tree` → true). The inception commit c6a664e created `H1a`, `V18a`, `V18b`, and `V18c` together. At that commit `H1a` already declared the four `@earendil-works/*` packages as `peerDependencies` only (`git show c6a664e:docs/plan_topics/H1a-scaffold-and-toolchain.md` shows two `peerDependencies` occurrences, no SDK `devDependencies`), and `V18a`/`V18c` already carried the `SDK_SURFACE_INVENTORY` "present on the pinned SDK" presence requirement (`git log -G "present on the pinned"` resolves only to c6a664e). The `engines.node` operand-(iii) "read live … from the installed `@earendil-works/pi-coding-agent` `package.json`" framing was later sharpened in 1e6ac07 (2026-06-11, "engines.node floor gate described two-way in V18c"), but that commit only made the live-read explicit — the underlying presupposition that the SDK is resolvable under `node_modules` while the manifest declares it peer-only was present from inception. No commit in the history ever introduced an SDK build-test install precondition or a corresponding `devDependencies` declaration.

## Solution Space

**Shape:** single

### Recommendation

In `H1a`'s **Adds**, declare the four `@earendil-works/*` packages (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) in loom's own `devDependencies`, pinned to the same loom 1.0 Pi-SDK pin range (`host-prerequisites.md#pi-sdk-pin`) the `peerDependencies` entries carry, so a fresh `npm install` provisions them under `node_modules` for the build-test gates. This is additive to — not a replacement for — the existing `peerDependencies` declaration: `peerDependencies` stays the consumer-facing, tilde-pinned skew-detection contract (a consumer installing loom never pulls loom's `devDependencies`), while `devDependencies` provisions loom's own checkout so `V18a`/`V18b`/`V18c`'s surface-inventory and `engines.node` operand-(iii) live-read, the strict-capability probe, the `loom/typecheck/session-shutdown-reason-snapshot` `tsc` gate, and the `V18d`/`H4a` harness all resolve the SDK.

In `H1a`'s **Tests**, add an architectural assertion that reads `package.json#devDependencies` and asserts the four `@earendil-works/*` packages are present at the pinned line, on the same footing as the existing `vitest` and lint-toolchain `devDependencies` assertions, so the provisioning is gated at `H1a` rather than discovered when a downstream `V18` test fails to resolve the module.

Edge cases the implementer must watch:
- The four `devDependencies` entries must stay lock-stepped to the same Pi-SDK pin literal as the four `peerDependencies` entries. The version-bump procedure's step-4 "joint move" (`version-bump-step2b.md`) and the `peerDependencies` literal-read assertion currently move and check only the four `peerDependencies` entries; they must extend to the four `devDependencies` entries too, otherwise operand (iii)'s live read resolves the stale `devDependency`-installed version rather than the candidate pin and the bump's gates pass against the wrong SDK.
- If any gate imports `typebox` at test time, the same provisioning consideration applies to `typebox` (declared `"*"` per its own carve-out, not folded into the four-entry tilde-pinned group).

The `peerDependencies` tilde-pin and its `"*"`-vs-tilde deviation rationale in `host-prerequisites.md` are unchanged by this fix; the spec stays read-only unless the precondition is additionally recorded under `implementation-notes.md` §"Loom-package implementation dependencies", where `semver`/`chokidar`/`yaml` provisioning already lives.

## Relationships

- T14 "`ajv-formats` missing from H1a's enumerated runtime-dependency set" — same-cluster (both are H1a manifest-enumeration completeness gaps; resolve independently)
- T30 "`eslint-plugin-loom-local` in-tree plugin package has no creating leaf" — same-cluster (both name an unstated H1a provisioning precondition; resolve independently)
