# Findings parked from `spec-review.md` — pi-loom

_This file collects findings physically removed from the
consolidated spec-review document because they cannot be addressed
by the current `/fix-spec-shape-single-findings` pipeline. Each
entry records the reason for parking and the path to the per-finding
forensic report. Parked findings must be reshaped (typically by
splitting bimodal obligations, narrowing scope, demoting MUSTs,
or capping the prose the fix is allowed to add) before being
re-introduced into the live review document._

_Cascade-parked findings (parked solely because they depended on
another parked finding) typically un-park automatically once the
upstream finding's reshape is re-introduced and successfully fixed,
unless they have substantive shape problems of their own._

---

## T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus")

> **PARKED** — 2026-05-26
> **Reason:** Parked as part of MULTI cluster T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"); T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it (rec F). Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 8. Loop notes: Cluster-mode MULTI invocation (T27 + T28). Pass-1 cleared all 8 fix-class findings (4 high + 2 medium + 2 low; 6 trust-override fixes + 2 score-budget-cheap-fix), forward-aligned every applied edit, and touched 4 chunks in `docs/spec_topics/governance.md`. Pass-2 classifier exited early on `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate): S=200, Σ_shadow=625, k×S=600, breach margin 25, breach multiplier 3.125×; 10 non-blocker raised findings counted toward the shadow budget of which 9 were trust-overridden. 0 blocker findings on the blocked pass. Per-pass severity tally: p1 raised{high:4,medium:2,low:2} fixed{high:4,medium:2,low:2}; p2 raised{high:5,medium:5} fixed{} blocked{high:5,medium:5}. Stage trajectory: stage1=2. Several p2 findings read as residue from pass-1 fix-06's ~21-LOC enumerated-test expansion of the *Implied-consumer carve-out*. Snapshot refs retained for forensics. Suggested reshape directions: raise cluster S (one member to blocker:200), split one of the high-scored consumer-behaviour-MUST axes off T27/T28 into its own Shape: single finding, narrow T28's Solution approach to defer operational-test partition pinning, or accept the residue as out-of-cluster work per T28's Audit completeness constraint. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-26T09-04-21_2247a3/t27-t28-cluster-corpus-direction-and-no-methodology-prescription.md

# T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus")

**Kind:** cross-corpus-boundary, scope, structural
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/governance.md` defers normative content to "the plan corpus" pervasively and embeds explicit cross-links into plan files. The phrase "(specified in the plan corpus)" appears ~15 times across GOV-1, GOV-2, GOV-4, GOV-6, GOV-9, GOV-12, and GOV-16 as the deferral pattern for CI-gate failure surfaces (exit codes, per-offence message formats, accumulation semantics, output streams). Two further patterns are sharper:

- **Explicit plan-file cross-links.** GOV-7 *Rename* (line 97) instructs editors to "update every reference to the old filename across `plan.md` and `plan_topics/**.md`; the plan-link CI gate (specified in the plan corpus) enforces this". GOV-10 (line 128) defines a *plan leaf* as "a terminal task in [`plan.md`](../plan.md) (leaf format defined in [`plan_topics/conventions.md`](../plan_topics/conventions.md#leaf-format))" with three explicit links into the plan corpus.
- **Rules *about* plan-leaf shape.** GOV-10 declares that implementers MAY restrict their reading per a plan leaf's `**Spec**` field. GOV-11 declares that "The plan leaf's `**Spec**` field MUST be closed under normative cross-link." Both rules are authored in the spec corpus but describe required properties of the plan corpus. GOV-2 ("The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf") similarly asserts a structural property of the plan from inside the spec.

Each pattern violates the corpus-direction rule under different angles. The explicit links are the cleanest case — they straightforwardly break under a plan deletion-and-rebuild. The "specified in the plan corpus" deferrals presume a plan exists and has a particular shape; they are softer but still violate the spec-independence invariant. GOV-10 / GOV-11 / GOV-2 are the deepest case: they are rules that exist primarily to constrain the plan, authored as spec rules.

The deepest case (GOV-2 / GOV-10 / GOV-11) was originally framed as an open structural choice — the spec could plausibly claim entitlement to publish a consumer schema ("here is what any plan that wants to consume me must offer", analogous to a library publishing its API), under which reading GOV-10 / GOV-11 are legitimate. T28 settles this case by articulating the missing principle: the spec MAY publish identifiers, interfaces, and invariants that consumers rely on, but MUST NOT prescribe how consumers consume them. Under that principle GOV-2 (prescribes that a coverage matrix exists and how it behaves), GOV-10 (prescribes plan-leaf shape and an implementer reading-scope optimisation), and GOV-11 (prescribes a closure property of a plan-leaf field) are methodology prescriptions, not published interfaces, and MUST move out of the spec corpus. The explicit `plan.md` / `plan_topics/conventions.md` links cross the corpus boundary regardless of how the rule's role is framed and are removed on the same pass. T27 is the first concrete application of T28's principle; it MUST NOT land before T28 has articulated the principle.

## Solution approach

The fix is not a mechanical sweep — `governance.md` is structurally entangled with the plan corpus in ways the other two findings (T25, T26) are not. Three sub-questions need contributor-side decisions before any edits land:

1. **Per-deferral classification of the ~15 "specified in the plan corpus" occurrences.** For each occurrence, classify per the T24a three-way scheme:
   - **Spec-owned floor obligation that can drop the deferral entirely.** Example: GOV-2's "The coverage-matrix closing CI gate treats any unmapped REQ-ID as a CI failure" is the spec-side obligation; the trailing "The plan corpus is the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream)" is implementation detail the spec does not need to claim authority over. Delete the trailing sentence.
   - **Spec-owned obligation that benefits from naming the responsible party.** Example: GOV-7 *Rename*'s "update every reference to the old filename across `plan.md` and `plan_topics/**.md`" — the spec needs to say that *something* tracks references to its filenames, but does not need to name the plan-link CI gate or even the plan corpus. Rewrite to "the build SHOULD enforce reference integrity" or similar implementation-neutral wording.
   - **Pure plan-process narration.** Delete outright.

2. **GOV-10 / GOV-11 deletion and migration to the plan corpus.** Per T28's principle, both rules are methodology prescriptions: GOV-10's plan-leaf definition and reading-scope optimisation are a plan-corpus convenience, and GOV-11's closure obligation is a property of a plan-side field. Delete both from `governance.md`. If the plan corpus wants the same shape, the plan corpus authors it in `plan_topics/conventions.md` directly — the spec does not mediate, link to, or sketch the schema. The spec's surviving consumer-facing claim is GOV-1's REQ-ID stability, which is a published identifier (legitimate spec content per T28) and is sufficient on its own for any consumer that wishes to bind.

3. **GOV-2 coverage-matrix-existence claim.** GOV-2's first sentence ("The plan's coverage matrix is keyed per REQ-ID, mapping each ID to its closing leaf") asserts that a coverage matrix exists in the plan and is structured a particular way — methodology prescription under T28. Delete the sentence; GOV-1's REQ-ID stability already provides everything a downstream tracker needs. The "closing CI gate" obligation downstream of this sentence (unmapped REQ-IDs cause CI failure) is also methodology — it prescribes how a consumer behaves; delete it. If the plan corpus wants a coverage-matrix CI gate, the plan corpus owns its definition.

4. **`Audience` paragraph (governance.md:3).** The opening *Audience* paragraph names "the coverage-matrix closing CI gate (specified in the plan corpus)" twice as a primary audience. Rewrite to name the consumer in spec-corpus-neutral terms ("automated tooling that maps REQ-IDs to implementation work") so the audience claim does not depend on the plan corpus existing.

5. **Failure-surface content is plan methodology — recover to plan corpus, not spec.** Most of `governance.md`'s "specified in the plan corpus" deferrals point at CI-gate *failure surface* definitions (exit code, per-offence message format, accumulation semantics, output stream) that the deleted `h6-req-ids.md` plan leaf (recoverable at `git show 657ee76^:docs/plan_topics/h6-req-ids.md`) almost certainly held in full. Under T28's principle these are methodology — they describe how CI tooling reports failures, not what the system being specified must do. Where the recovered content is worth preserving at all, it MUST be recovered into the plan corpus (e.g. a plan-corpus CI-conventions file owned by the plan-corpus author), not into `governance.md`. The deferrals themselves are simply deleted from the spec. T27 closes with the spec carrying zero failure-surface content; the question of whether the plan corpus wants to host the recovered schema is plan-corpus work outside T27's scope.

After these edits, `docs/spec_topics/governance.md` MUST carry zero occurrences of the phrases "specified in the plan corpus", "plan corpus", "plan leaf", "plan-side", and zero links to `../plan.md` or `../plan_topics/**`.

## Solution constraints

- Out of scope: the plan corpus itself — `plan.md` and `plan_topics/conventions.md` may need parallel edits if option (A) is chosen for GOV-10 / GOV-11 (moving the leaf-format definition there) or under option (B) (taking ownership of the closure rule). Those plan-side edits are downstream of this finding's resolution and are not in scope.
- Cross-corpus REQ-ID stability is a spec-corpus obligation and survives unchanged. GOV-1 / GOV-3 / GOV-4 / GOV-5 / GOV-6 / GOV-7 / GOV-8 / GOV-9 / GOV-12 / GOV-14 / GOV-15 / GOV-16 retain their normative force; only the deferral / cross-link sub-clauses inside each rule are edited.
- The disposition of GOV-2 / GOV-10 / GOV-11 is determined by T28's articulated principle, not by per-rule judgement; the resolution commit MUST cite T28 (by the principle's eventual rule location, see T28 *Solution constraints*) as the basis for deletion.
- T27 MUST NOT land before T28 has articulated the "no methodology prescription" principle. If T28's principle-articulation portion lands in a separate commit ahead of its broader cross-spec sweep, T27 MAY proceed once that commit is in.
- T27's rewrite of `governance.md` MUST leave a structural home (a section, anchor, or explicit placeholder) for T28's corpus-direction articulation. The two findings share the file; T27 owns the GOV-N rule cleanup, T28 owns the corpus-direction section.
- This finding is harder to mechanise than T25 / T26: the audit of which deferrals are pure-narration vs which are spec-owned-with-bad-wording requires per-rule judgement. Expect the resolution to land in multiple commits, one per rule cluster (GOV-1 anchor pass, GOV-2 / GOV-6 / GOV-12 floor obligations, GOV-7 rename mechanics, GOV-9 cross-link form, GOV-10 / GOV-11 disposition, GOV-16 inline-label backfill).

## Relationships

- T28 "Articulate the 'no methodology prescription' rule and audit `spec_topics/` against it" — co-resolve (T27 and T28 both rewrite `governance.md` substantially and cannot be cleanly separated; bundle into a single fix pass on `governance.md`. Within the pass, T28's principle articulation is authored first because T27's GOV-2 / GOV-10 / GOV-11 deletions cite it as their basis; T27's GOV-N cleanup then lands in the same file while preserving the corpus-direction section T28 owns. T28's cross-spec audit — step 3 — is disjoint and MAY run separately)
- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — same-cluster (parallel corpus-direction defect; T03 sweeps `spec.md`, T27 sweeps `governance.md`; no resolution dependency)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — same-cluster (T24a carved out `governance.md`'s "specified in the plan corpus" deferrals as a "permitted abstraction barrier"; this finding revisits that carve-out under the stricter reading and concludes the carve-out cannot be sustained without structural rework)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — same-cluster (parallel corpus-direction defect; T25's resolution is mechanical, this one requires per-rule judgement)
- T26 "Narrative spec→plan deferrals and `v18-cancellation.md` cross-link" — same-cluster (parallel surface-level case of the same defect class T27 addresses at the structural level)

---

## T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it

> **PARKED** — 2026-05-26
> **Reason:** Parked as part of MULTI cluster T27 — `governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / "specified in the plan corpus"); T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it (rec F). Category 1 (malformed finding — constraints binding surface; the originating finding's Solution constraints fence every viable remediation that the lens admits). The inner spec-diff-fix-loop's severity-weighted triage exited on must-fix-blocked-by-scope-guard (plan §Change A clause 1 escape): a raised lens finding outranked this originating finding in importance, but every viable remediation would violate a class-1 or class-2 scope guard forwarded from the top-level fixer. FIXCOUNTS: 8. Loop notes: Cluster-mode MULTI invocation (T27 + T28). Pass-1 cleared all 8 fix-class findings (4 high + 2 medium + 2 low; 6 trust-override fixes + 2 score-budget-cheap-fix), forward-aligned every applied edit, and touched 4 chunks in `docs/spec_topics/governance.md`. Pass-2 classifier exited early on `score-budget-exhausted-trust-override-suppressed` (Rec O pass-level shadow-budget gate): S=200, Σ_shadow=625, k×S=600, breach margin 25, breach multiplier 3.125×; 10 non-blocker raised findings counted toward the shadow budget of which 9 were trust-overridden. 0 blocker findings on the blocked pass. Per-pass severity tally: p1 raised{high:4,medium:2,low:2} fixed{high:4,medium:2,low:2}; p2 raised{high:5,medium:5} fixed{} blocked{high:5,medium:5}. Stage trajectory: stage1=2. Several p2 findings read as residue from pass-1 fix-06's ~21-LOC enumerated-test expansion of the *Implied-consumer carve-out*. Snapshot refs retained for forensics. Suggested reshape directions: raise cluster S (one member to blocker:200), split one of the high-scored consumer-behaviour-MUST axes off T27/T28 into its own Shape: single finding, narrow T28's Solution approach to defer operational-test partition pinning, or accept the residue as out-of-cluster work per T28's Audit completeness constraint. A human must resolve the guard-vs-severity collision (relax the guard, split this finding so the higher-importance raised finding is no longer downstream of the guard, or accept the trade-off and annotate the raised finding as out-of-scope) before re-introducing this finding.
> **Forensic report:** .pi/tmp/spec-fix-failure-forensics/2026-05-26T09-04-21_2247a3/t27-t28-cluster-corpus-direction-and-no-methodology-prescription.md

# T28 — Articulate the "no methodology prescription" rule and audit `spec_topics/` against it

**Kind:** structural, cross-corpus-boundary
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The corpus-direction rule established by T24a / T25 / T26 ("spec must stand independent of any particular plan") leaves one structural question unresolved: when may the spec publish content *about* a downstream consumer (plan, CI gate, tracking tooling), and when does that publication slide into prescribing how the consumer must work? T27 surfaced this question in concrete form: GOV-2 ("the plan's coverage matrix is keyed per REQ-ID"), GOV-10 (defines a "plan leaf" + reading-scope optimisation), and GOV-11 (closure rule on a `**Spec**` field) all read as spec rules but only have meaning if a plan exists and follows a particular methodology. T27 originally framed the GOV-10 / GOV-11 disposition as an open structural choice (option A reframe-as-schema vs option B delete) precisely because no articulated principle in the corpus settles it.

The principle that settles it is a sharpening of the corpus-direction rule:

> The spec MAY publish identifiers, interfaces, and invariants that consumers rely on; the spec MUST NOT prescribe how consumers consume them.

Under this rule, GOV-1 (REQ-IDs are stable, citable identifiers) is spec content — it publishes an identifier. GOV-2 (consumers MUST build a coverage matrix and treat unmapped IDs as CI failures) is methodology — it prescribes consumer behaviour. GOV-10 / GOV-11 are likewise methodology. The presence of an *implied* consumer (a tracker, a CI gate, an implementer reading the spec under some workflow) does not by itself make a rule methodology — GOV-1 implies a consumer too. The test is whether the rule constrains the implementation target or the spec's own identifiers (spec content) versus the process around them (methodology).

The defect is twofold: (i) the principle is missing from the corpus, and (ii) `spec_topics/*.md` has not been audited against it. T27's surface (`governance.md`) is the largest known violation but is unlikely to be the only one — methodology bleed in other spec topics has not been examined through this lens.

## Solution approach

1. **Articulate the principle.** Author the "no methodology prescription" rule as a normative addition to the corpus-direction surface, with the GOV-1 vs GOV-2 contrast as a worked example so future contributors have a concrete test case for the distinction. The articulation MUST include the "implied consumer is not sufficient evidence of methodology bleed" clarification so the rule is not over-applied against legitimate published identifiers and interfaces.

2. **Host the articulated rule in the slimmed-down post-T27 `governance.md`.** The corpus-direction rule presently has no single canonical home — it exists only as the basis cited by the T24a / T25 / T26 / T27 cluster. T28 codifies it as spec content in `governance.md`, alongside the new "no methodology prescription" sharpening and the GOV-1 vs GOV-2 worked example. Both the base rule and the sharpening land in the same section so a future reader sees the full corpus-direction story in one place.

3. **Audit `spec_topics/*.md` against the principle.** A full sweep of all spec topics for methodology prescriptions, classified per T24a's four-way scheme:
   - **Genuine spec content** — identifier, interface, or invariant the spec is entitled to publish (test: constrains the implementation target or the spec's identifiers, not the process around them); leave unchanged.
   - **Spec-owned invariant with methodology-prescription wording** — rewrite to publish the underlying invariant without prescribing the consumption pattern.
   - **Pure methodology that belongs in the plan corpus** — delete from spec; the plan corpus may take ownership independently.
   - **Genuinely normative content the spec relied on, previously held in the plan** — recover from git per T24a's *Pre-deletion plan-leaf inventory*.

4. **No spec→plan cross-links on the migration.** Where methodology is removed from `spec_topics/` and the plan corpus elects to host the equivalent content, the spec-corpus prose MUST NOT cross-link to the new location (that would re-introduce the corpus-direction defect T24a / T25 / T26 already resolved). The plan corpus knows where to find itself; the spec does not need to point.

After the sweep, `docs/spec_topics/*.md` MUST carry zero prescriptions of how downstream consumers (plans, CI gates, tracking tooling, implementer reading order) operate. The spec MAY name a consumer ("automated tooling that maps REQ-IDs to implementation work") to anchor an obligation's purpose; it MUST NOT specify the consumer's internals.

## Solution constraints

- **Sequencing with T27.** T28's principle-articulation portion (Solution approach items 1 + 2) MUST land before T27's `governance.md` rewrite, because T27 cites the principle as the basis for collapsing its prior GOV-10 / GOV-11 structural ambiguity. T28's cross-spec audit (item 3) MAY run in parallel with T27 since they touch disjoint files.
- **Articulation host file sequencing.** The principle MUST be authored in the slimmed-down post-T27 version of `governance.md`; T27's rewrite of `governance.md` deliberately leaves a structural home for the corpus-direction section T28 will populate.
- **Out of scope.** The plan corpus itself — moving methodology out of `spec_topics/` is in scope; further restructuring or authoring within `plan_topics/` is not. A plan-corpus author may independently take ownership of any methodology this finding evicts; that is downstream work.
- **Audit completeness.** If the sweep in step 3 turns up no methodology bleed outside `governance.md`, T28's resolution collapses to steps 1 + 2 (principle articulation only) plus a one-line "no other surfaces found" note recorded in the resolution commit. If it turns up methodology bleed in other `spec_topics/` files, T28 still resolves as a single Shape (the audit itself plus the principle articulation); any per-topic cleanup whose scope exceeds a single rewrite within T28 is spawned as a downstream Shape: single finding, one per affected file, and tracked separately from T28's closure.
- **The implied-consumer edge case is permitted.** Rules like GOV-1 (REQ-ID stability) presuppose a consumer that tracks requirements, but they constrain the spec's identifiers, not the tracker. The audit MUST NOT flag rules merely because they imply a consumer exists.

## Relationships

- T27 "`governance.md` pervasive plan-corpus dependency" — co-resolve (T27 and T28 both rewrite `governance.md` substantially and cannot be cleanly separated; bundle into a single fix pass on `governance.md`. Within the pass, T28's principle articulation is authored first because T27 cites it as the basis for the GOV-2 / GOV-10 / GOV-11 deletions; T27's GOV-N cleanup then lands in the same file while preserving the corpus-direction section T28 owns. T28's cross-spec audit — step 3 — is disjoint and MAY run separately)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — extends (T28's principle is a sharpening of the corpus-direction rule T24a established; T24a's four-way classification scheme is reused by T28 step 3 unchanged)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — extends (T25 audited spec_topics for plan-leaf token references; T28 audits the same surface for methodology prescriptions — disjoint defect classes, same audit pattern; if T28's audit lands paragraphs T25 already swept, the touch-set overlap is incidental, not a co-resolve trigger)
- T26 "Narrative spec→plan deferrals and `v18-cancellation.md` cross-link" — extends (same corpus-direction pattern as T25; T26's content-recovery procedure is reused by T28 step 3 unchanged)
