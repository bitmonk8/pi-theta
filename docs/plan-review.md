# Triaged Plan Review — plan

_Generated: 2026-06-12T00:30:00Z_
_Plan: docs/plan.md_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T31) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 1 high, 19 medium retained; 9 low discarded; 9 low findings merged into 1 medium finding; 25 NIT dropped; 0 false dropped._

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
