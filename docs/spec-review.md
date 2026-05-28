# Triaged Spec Review - spec

_Generated: 2026-05-27T11:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - addressed from last finding to first._

---

# T17 - Rename `V1` -> `loom 1.0` across the spec corpus

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency-broad
**Importance:** high
**Score:** 125
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` and `docs/spec_topics/*.md` use `V1` / `V1.0` / `V1.x` as the loom-language release name (~317 occurrences across the spec corpus; 13 in `spec.md`; 15 `> **V1 seam — …` blockquote labels; 10 `<a id="v1-…">` HTML anchors). `docs/plan_topics/conventions.md:9` reserves `H1`–`Hn`, `M`, and `V1`–`Vn` for plan-phase IDs and forbids reusing them for the release meaning: *"when plan prose needs to refer to the initial release of the loom language, write 'loom 1.0' or 'the initial release'; never reuse a plan ID for that meaning."* Same token, two meanings.

The plan-side rule already slips: `conventions.md:37` and `:43` write "V1.0 closing gate" (release meaning); `plan.md:11` writes "V1.0 release gate". A contributor reading SM-7d ("V1 no-cap / no-scheduler disposition") cannot tell whether the constraint is a release-line disposition or a leaf-phase scope. `README.md` lines 28–35 park the debt as a "deferred mechanical sweep" pointing at `docs/spec-sweeps.md` — that file does not exist in the tree, so the debt is currently untracked.

A pure mechanical rename also surfaces five dangling normative invariants the spec corpus does not currently pin:

1. **Token-sense overload.** The renamed token `loom 1.0` is overloaded — it names both the 1.0.0 frozen-baseline release and the design scope of the entire 1.x line. A contributor cannot tell from a bare `loom 1.0` callsite which sense binds.
2. **Dual-anchor lifecycle.** The dual `<a id="loom-1-0-…">` + `<a id="v1-…">` anchor pattern introduced by GOV-8 anchor-stability has no canonicality rule for new cross-references and no defined lifecycle under future GOV-8 *Split* / *Retire* / *Rename* operations.
3. **Frozen-baseline-vs-design-scope contradiction at closure callsites.** A flat `V1` → `loom 1.0` rewrite applied uniformly to the corpus produces a direct contradiction at frozen-baseline closure callsites: under the lexical-classification rule the rename authorises, those sites read as 1.x-line-wide commitments rather than frozen-baseline. The set of frozen-baseline closure callsites is corpus-wide and is NOT bounded to any fixed enumeration — the corpus admits any callsite matching the closure heuristic (currently ≥17 known sites).
4. **GOV-rule sibling reconciliation.** Any new dual-anchor governance section authored under GOV-8 interacts with siblings GOV-7 (lifecycle operations), GOV-17 (corpus direction), and GOV-18 (binding scope). An approach that authors a new GOV-N sub-section without auditing those siblings produces framing collisions with sibling rules already defined on the same page.
5. **Identifier-grammar conformance on net-new normative IDs.** Any net-new REQ-ID this fix authors MUST extract under GOV-3's grammar (`<PREFIX>-<N>` with `<N>` matching `[1-9][0-9]*`); any net-new inline label MUST extract under GOV-16's grammar. Tokens of shape `GOV-8a` or `GOV-8a-1` violate both grammars defined on the same page.

The `### V1 non-goals` heading on `docs/spec.md` and its `<a id="v1-non-goals">` anchor are part of the same rename surface: if the surrounding `V1` prose renames without touching this heading the spec carries a mixed-vocabulary surface; if this heading renames in isolation the inbound `#v1-non-goals` citations from `docs/spec_topics/future-considerations.md` and the sibling Orientation prose break.

All five invariants plus the `### V1 non-goals` heading/anchor MUST be pinned by this fix or the spec is left with new ambiguity in place of the old vocabulary collision. The fix-shape obligations on each are specified in `## Solution approach` (sites) and `## Solution constraints` (binding shape) below.

## Solution approach

Rename `V1` -> `loom 1.0`, `V1.0` -> `loom 1.0`, `V1.x` -> `loom 1.x` in the spec corpus, per the plan-side phrasing at `conventions.md:9` (which stays in force as the canonical rule for plan-phase IDs). EXCEPT at the frozen-baseline closure callsites identified by the behavioural sweep under *Sites — frozen-baseline closure callsites* below, where the rewrite target is `loom 1.0.0` (the distinct frozen-baseline spelling) not `loom 1.0`.

This fix bundles three further authoring sub-problems in the same domain so the post-fix spec corpus closes all five dangling invariants identified in `## Problem` in one consistent edit: (a) two further mechanical sweeps (`V2` → `loom 2.0`; `Tooling deferrals` anchor alias) listed under *Sites — companion mechanical sweep*; (b) a new two-bullet glossary entry pinning the token-sense distinction listed under *Sites — glossary entry*; (c) a new normative governance section authoring the dual-anchor convention as a REQ-ID (`GOV-19`, the next free numeric ID per the GOV-3 grammar) listed under *Sites — dual-anchor convention (GOV-19)*. Each sub-problem has its own `## Sites — …` block enumerating callsites and its own constraint block in `## Solution constraints` binding shape.

### Sites — spec corpus prose

**`docs/spec.md`** (13 V1 occurrences). Rewrite `V1` / `V1.0` / `V1.x` in prose at lines 40, 44, 46, 68, 70, 78, 80, 82, 86, 100, 102, 150. The `### V1 non-goals` heading at line 98 is renamed to `### loom 1.0 non-goals`; its `<a id="v1-non-goals">` anchor at line 97 is rewritten as the dual anchor `<a id="loom-1-0-non-goals"></a><a id="v1-non-goals"></a>` per *Sites — HTML anchor renames* below. The Source-language-stability bullet around line 75 is in scope of the frozen-baseline sweep below, not the flat rename.

**`docs/spec_topics/`** — 27 files, ~304 occurrences total. Rewrite V1 / V1.0 / V1.x in prose and rename every `> **V1 seam — <name>.**` blockquote label to `> **loom 1.0 seam — <name>.**`. Per-file occurrence counts (seam-label line numbers in parentheses):

- `binder.md` (10 occurrences; seam labels at :29, :106) — EXCEPT `binder.md:329` (frozen-baseline closure; see *Sites — frozen-baseline closure callsites*)
- `bindings.md` (2)
- `cancellation.md` (2)
- `control-flow.md` (1)
- `descriptions.md` (1)
- `diagnostics.md` (31) — EXCEPT the closure callsites enumerated under *Sites — frozen-baseline closure callsites*
- `discovery.md` (7)
- `errors-and-results.md` (14; seam label at :160) — EXCEPT the closure callsites enumerated under *Sites — frozen-baseline closure callsites*
- `expressions.md` (5)
- `frontmatter.md` (11; seam label at :135)
- `functions.md` (1)
- `future-considerations.md` (58; narrative seam reference at :65)
- `glossary.md` (3)
- `governance.md` (8) — see *Sites — dual-anchor convention (GOV-19)* below for additional GOV-19 authoring at this file
- `hard-ceilings.md` (14) — EXCEPT closure callsites swept below
- `implementation-notes.md` (4)
- `imports.md` (4; seam label at :22)
- `invocation.md` (8; seam labels at :14, :38, :40)
- `lexical.md` (1)
- `pi-integration-contract.md` (96; seam labels at :246, :250, :724) — EXCEPT closure callsites swept below
- `query.md` (10; seam labels at :273, :295)
- `runtime-value-model.md` (2)
- `schema-subset.md` (1)
- `schemas.md` (2)
- `slash-invocation.md` (2)
- `tool-calls.md` (5; seam label at :40)
- `type-system.md` (2)

### Sites — HTML anchor renames (11 anchors)

Each `<a id="v1-…">` is rewritten as a dual anchor `<a id="loom-1-0-…"></a><a id="v1-…"></a>` per GOV-8 anchor-stability convention. The pre-rename `<a id="v1-…">` is RETAINED as a sibling back-compat alias (canonical arm is `loom-1-0-*`; alias permanence binds under the dual-anchor convention authored at *Sites — dual-anchor convention (GOV-19)*).

- `docs/spec.md:97` — `v1-non-goals` -> `loom-1-0-non-goals`
- `docs/spec_topics/binder.md:106` — `v1-seam-binder-refinement-loop` -> `loom-1-0-seam-binder-refinement-loop`
- `docs/spec_topics/errors-and-results.md:160` — `v1-seam-discriminator-type-openness` -> `loom-1-0-seam-discriminator-type-openness`
- `docs/spec_topics/frontmatter.md:135` — `v1-seam-system-expression-sublanguage` -> `loom-1-0-seam-system-expression-sublanguage`
- `docs/spec_topics/future-considerations.md:96` — `v1-non-goals` -> `loom-1-0-non-goals`
- `docs/spec_topics/imports.md:22` — `v1-seam-resolver-interface` -> `loom-1-0-seam-resolver-interface`
- `docs/spec_topics/invocation.md:14` — `v1-seam-symlink-resolution-hardening` -> `loom-1-0-seam-symlink-resolution-hardening`
- `docs/spec_topics/pi-integration-contract.md:246` — `v1-seam-mid-loom-user-session-replacement` -> `loom-1-0-seam-mid-loom-user-session-replacement`
- `docs/spec_topics/pi-integration-contract.md:250` — `v1-seam-typed-query-supported-provider-set` -> `loom-1-0-seam-typed-query-supported-provider-set`
- `docs/spec_topics/pi-integration-contract.md:724` — `v1-seam-pi-owned-subagents-collision-source-set` -> `loom-1-0-seam-pi-owned-subagents-collision-source-set`
- `docs/spec_topics/query.md:295` — `v1-seam-pre-flight-token-nullability` -> `loom-1-0-seam-pre-flight-token-nullability`

The heading-derived slugs that the rename produces are handled identically: an explicit `<a id="...-loom-1-0-..."></a><a id="...-v1-..."></a>` pair is authored immediately before the renamed heading. See *Sites — heading-derived auto-anchor cases* below.

### Sites — heading-derived auto-anchor cases

GitHub renders an auto-id slug for every heading. The flat rename produces these renamed headings whose auto-id changes:

- `docs/spec.md` — `### V1 non-goals` → `### loom 1.0 non-goals` (auto-id slug shifts from `v1-non-goals` to `loom-1-0-non-goals`).
- `docs/spec_topics/future-considerations.md` — `## Tooling deferrals (no V1 impact)` → `## Tooling deferrals (no loom 1.0 impact)` (auto-id slug shifts from `tooling-deferrals-no-v1-impact` to `tooling-deferrals-no-loom-1-0-impact`).
- `docs/spec_topics/future-considerations.md` — `## Surface extensions (V1 leaves a seam)` → `## Surface extensions (loom 1.0 leaves a seam)` (auto-id slug shifts from `surface-extensions-v1-leaves-a-seam` to `surface-extensions-loom-1-0-leaves-a-seam`).
- `docs/spec_topics/future-considerations.md` — `## Model-level changes (no V1 seam expected)` → `## Model-level changes (no loom 1.0 seam expected)` (auto-id slug shifts; same dual-anchor treatment).

For each, author explicit `<a id="loom-1-0-..."></a><a id="v1-..."></a>` sibling pairs immediately before the renamed heading. The auto-id slug is no longer relied on — both arms are explicit `<a id>` anchors. Document under GOV-19 (axis 3) that the intensional dual-anchor definition admits this placement (explicit pair immediately before the heading, both arms `<a id>` rather than one auto-id + one explicit).

### Sites — inbound fragment-link rewrites

Every `#v1-non-goals`, `#v1-seam-…`, `#tooling-deferrals-no-v1-impact`, `#surface-extensions-v1-leaves-a-seam`, and `#model-level-changes-no-v1-seam-expected` fragment-link citation in the spec corpus must repoint to the new canonical `#loom-1-0-…` anchor. Grep:

```
grep -rnE '#(v1-|tooling-deferrals-no-v1-impact|surface-extensions-v1-leaves-a-seam|model-level-changes-no-v1-seam-expected)' docs/
```

and rewrite each hit. The largest concentration is `future-considerations.md` (Surface-extensions inventory cross-links each seam by `#v1-seam-…` fragment). The pre-rename aliases are retained at the destination sites (see *Sites — HTML anchor renames* and *Sites — heading-derived auto-anchor cases*) so any links missed by the grep continue to resolve.

### Sites — plan corpus slip fixes

- `docs/plan.md:11` — "V1.0 release gate" -> "loom 1.0 release gate"
- `docs/plan_topics/conventions.md:37` — "V1.0 closing gate" -> "loom 1.0 closing gate"
- `docs/plan_topics/conventions.md:43` — "V1.0 closing gate" -> "loom 1.0 closing gate"
- `docs/plan_topics/coverage-matrix.md` — any "V1.0 release gate" / "V1.0 closing gate" callsite (verify by grep; rewrite to `loom 1.0 …`).

`docs/plan_topics/conventions.md:9` (the reservation rule itself) stays unchanged.

### Sites — README parking pointer

- `README.md` lines 28–35 — Rewrite the parking-pointer paragraph: remove the `"V1" terminology disambiguation across the spec corpus` mention from the deferred-mechanical-sweeps list. If the companion *load-bearing* qualifier rewrite is the only remaining sweep, simplify the paragraph to reference only that. If no remaining sweeps exist, delete the `docs/spec-sweeps.md` link entirely (the file does not exist in the tree and is not created here).

### Sites — companion mechanical sweep

Two further mechanical sweeps in the same domain land alongside the `V1` rename so the post-fix spec corpus uses a single uniform release-version naming scheme:

- **`V2` → `loom 2.0` sweep.** `docs/spec_topics/governance.md` §"Ceiling-set carve-out" and §"Operational definitions"; `docs/spec_topics/future-considerations.md` no-formal-migration-mechanism bullet; any other `V2` callsite under `docs/spec_topics/` whose context is loom-release naming (not a Pi SDK or Node version literal). Rewrite to `loom 2.0`. No bare `V<N>` token remains as a loom release name anywhere under `docs/spec_topics/`.
- **`Tooling deferrals` heading + dual-anchor pair.** Covered under *Sites — heading-derived auto-anchor cases* above. Both `tooling-deferrals-no-v1-impact` and `tooling-deferrals-no-loom-1-0-impact` anchors are retained; the inbound link from `docs/spec_topics/pi-integration-contract.md:125` is repointed to the new canonical `#tooling-deferrals-no-loom-1-0-impact`.

### Sites — glossary entry (split per sense; new normative prose with stable anchors)

**Canonical home:** `docs/spec_topics/glossary.md`. The new entry is authored as **two distinct sibling bullets** (not one combined bullet) in the file's existing alphabetical sense table, each pinning one sense, each carrying its own stable `<a id>` anchor so the corpus's normative consumers can cite the per-sense identifier directly:

1. **Bullet 1 — design-scope sense.** Anchor `<a id="loom-1-0-design-scope"></a>`. Bold-token line: `**loom 1.0** (and **loom 1.x**)`. Body (one paragraph, no MUST clauses): defines the literal as naming the entire 1.x line / major design scope; cites the canonical consumers **by anchor fragment** (`[loom-1-0-non-goals](../spec.md#loom-1-0-non-goals)` aggregator on `docs/spec.md` and `future-considerations.md`; the `<major-line> targets Node exclusively` callsite cited by section anchor not line number; the *Scope* and *Prerequisites* paragraphs on `docs/spec.md` cited by their section anchors); explicitly disclaims the frozen-baseline sense (pointer to Bullet 2 by its anchor `#loom-1-0-0-frozen-baseline`).
2. **Bullet 2 — frozen-baseline sense.** Anchor `<a id="loom-1-0-0-frozen-baseline"></a>`. Bold-token line: `**loom 1.0.0**`. Body (one paragraph, no MUST clauses): defines the literal as naming the frozen 1.0.0 baseline release; cites the canonical consumers **by anchor fragment** (`[GOV-15](./governance.md#gov-15)` "loads cleanly under" wording; `[Ceiling-set carve-out](./governance.md#gov-15)` "closed at" phrasing; the PIC `[Re-validation gate](./pi-integration-contract.md#re-validation-gate)` carve-out; the panic-source closures linked by anchor not by line number — author a new `<a id="loom-1-0-0-panic-source-set">` on the closure paragraph in `diagnostics.md` as part of this fix and cite it; the `QueryError`-union statement in `binder.md` linked by a new `<a id="loom-1-0-0-binder-error-absence">` authored on that paragraph); explicitly disclaims the design-scope sense (pointer to Bullet 1 by its anchor `#loom-1-0-design-scope`).

The two-bullet shape is binding (see `## Solution constraints` *Glossary entry shape* below). The disambiguation between the two senses is **lexical only** — a callsite uses literal `loom 1.0` (or `loom 1.x`) to invoke Bullet 1, and literal `loom 1.0.0` to invoke Bullet 2. No SHOULD clause about inline parenthetical qualifiers is authored. All consumer citations in both bullets MUST use `#anchor` fragment form, never raw line numbers (every existing intra-corpus citation in `glossary.md` uses fragment form; line-number citations contradict corpus convention and are forbidden — see *Citation form constraints* below).

### Sites — frozen-baseline closure callsites (corpus-wide behavioural sweep; NOT a fixed enumeration)

The frozen-baseline rewrite (`loom 1.0` → `loom 1.0.0` at sites that pin a closure / exhaustive-enumeration / "exactly N" / "loads cleanly under" / "closed at" claim) is a **corpus-wide behavioural sweep**, not a fixed enumeration. The fixer MUST execute the sweep exhaustively across `docs/spec.md` and every file under `docs/spec_topics/`. The list below is the currently-known set of sites and is **non-exhaustive**: the sweep procedure MUST find every site matching the heuristic, including sites not listed below.

**Sweep procedure (mandatory).**

1. Run the rename pass first so every `V1` token has become `loom 1.0`.
2. Run `grep -nE '\bloom 1\.0[^.0]' docs/spec.md docs/spec_topics/` to enumerate every post-rename `loom 1.0` callsite (excluding `loom 1.0.0`, `loom 1.0.x`, `loom 1.0-impact`, etc.).
3. For each callsite, evaluate the closure heuristic against the surrounding sentence: a callsite is **frozen-baseline** iff the sentence (a) pins an exhaustive enumeration ("exactly N", "the closed set", "the N-element set", a list with a count), (b) uses "loads cleanly under" / "loads under", (c) uses "closed at" / "frozen at" / "frozen-baseline", or (d) references a closed `details.kind` / `Err`-variant / discriminator inventory. Default on ambiguity: **frozen-baseline** (the safer rewrite — frozen-baseline is the stronger commitment and design-scope claims subsume it).
4. Rewrite each frozen-baseline callsite from `loom 1.0` to `loom 1.0.0` in place.
5. After the sweep, verify by greppish witness: `grep -nE '\bloom 1\.0[^.0]' docs/spec.md docs/spec_topics/ | grep -iE 'closed|closure|exhaust|exact(ly)? [a-z0-9]+|loads cleanly|frozen|the closed set|the N-element'` returns zero matches. Any survivor is either a sweep miss (rewrite it) or a genuinely-design-scope callsite (leave it; record under the audit witness below).
6. Author an `<a id="loom-1-0-0-panic-source-set">` immediately before the closure paragraph that lists the six panic sources (currently `diagnostics.md` around line 385) and `<a id="loom-1-0-0-binder-error-absence">` immediately before the `QueryError`-union statement (currently `binder.md` around line 329), so the glossary's Bullet 2 can cite them by anchor instead of by line number.

**Audit witness (mandatory, recorded in commit message body).** The fixer MUST attach to the resolution commit a `Frozen-baseline-sweep:` trailer line counting `<N> callsites rewritten across <M> files; <K> design-scope survivors verified`. This makes the sweep's completeness inspectable post-hoc without re-running the grep.

**Currently-known site list (non-exhaustive; sweep MUST find more).**

- `docs/spec.md` Source-language-stability bullet (~line 75) — closure scope of the source-language equivalence promise; this site is in the spec.md prose count but binds frozen-baseline, not design-scope
- `docs/spec_topics/diagnostics.md:43` — `session-shutdown-details-conventions` closure ("Closed at `{reason}`")
- `docs/spec_topics/diagnostics.md:380` — four-provider closed set
- `docs/spec_topics/diagnostics.md:385` — `V1 has exactly six panic sources`
- `docs/spec_topics/diagnostics.md:397` — `internal-error` row's "outside the closed loom 1.0 panic-source list" trigger
- `docs/spec_topics/diagnostics.md:404` — `… not in V1's panic catalogue`
- `docs/spec_topics/diagnostics.md` — the `loom/runtime/cancelled-by-session-shutdown` and `loom/host/session-shutdown-runtime-degraded` rows both pin "Closed at `{reason}` in loom 1.0" closure semantics
- `docs/spec_topics/binder.md:329` — `V1 has no BinderError variant in the QueryError union`
- `docs/spec_topics/errors-and-results.md:109` — panic-source closure callsite (must agree with `diagnostics.md:385`'s frozen-baseline spelling — both reference the same closed six-element panic set and MUST land at the same `loom 1.0.0` spelling)
- `docs/spec_topics/errors-and-results.md:120` — six-template closure
- `docs/spec_topics/errors-and-results.md:158` — nine variant-tag closure
- `docs/spec_topics/errors-and-results.md:160` — seam callout on the nine-variant-tag closure (note: this is also a seam-label rename site under *Sites — HTML anchor renames*; both rewrites land in the same edit)
- `docs/spec_topics/errors-and-results.md:277` — `internal_error` carve-out closure
- `docs/spec_topics/governance.md` §GOV-15 — `loads cleanly under <baseline>` callsite
- `docs/spec_topics/governance.md` §*Ceiling-set carve-out* — `closed at <baseline>` callsite
- `docs/spec_topics/pi-integration-contract.md` §*Re-validation gate* — baseline-pinning carve-out
- `docs/spec_topics/pi-integration-contract.md:424` — `"not part of loom 1.0 conformance"` closure
- `docs/spec_topics/pi-integration-contract.md:509` — same closure pattern
- `docs/spec_topics/hard-ceilings.md` — any "V1.0-rejected-candidate-record" or "in-flight ceiling" callsite where the closure semantics are frozen-baseline

The fixer MUST treat this list as a non-exhaustive starting set, not a closed enumeration. Findings from the sweep that fall outside this list MUST also be rewritten and recorded in the audit witness count above.

### Sites — dual-anchor convention (GOV-19)

**Canonical home:** `docs/spec_topics/governance.md`, sited as a new normative section immediately after the existing GOV-18 (corpus direction / binding scope) and before the *REQ-ID prefix table* and the *Retired REQ-IDs* sub-table. Authoring this content is **MANDATORY** — without the convention the dual-anchor surface is unanchored to any governing rule.

**Identifier scheme — in-grammar, single REQ-ID parent + per-axis HTML-only anchors.**

- The new section's parent identifier is the REQ-ID **GOV-19** (the next free numeric ID under the `GOV` prefix per the REQ-ID prefix table on `governance.md`; verify against the *Retired REQ-IDs* sub-table for hole/retirement collisions per GOV-3 before allocation — at fix time, retired GOV-N entries are GOV-2, GOV-10, GOV-11, GOV-13, none of which collide with GOV-19). GOV-19 conforms to GOV-3's tail grammar (`[1-9][0-9]*`).
- Each of the four obligation axes carries its own **HTML-only navigation anchor** (`<a id="gov-19-canonical-arm">`, `<a id="gov-19-alias-permanence">`, `<a id="gov-19-intensional-definition">`, `<a id="gov-19-retirement-discharge">`). Per `.pi/project-config.md`'s "Anchor governance" section: *"Document-internal HTML anchors (`<a id="…-i">`, `<a id="…-ii">`, and similar non-PREFIX-N anchors used purely for in-page hash navigation) are NOT REQ-IDs and are NOT inline labels under GOV-16. They are page-local fragment identifiers and do not interact with `idAllocationPolicy`."* The per-axis anchors are pure in-page navigation anchors, not REQ-IDs and not inline labels; they do NOT require an entry in the inline-label prefix table and do NOT extend GOV-3 or GOV-16.
- The four-axis content lives inside the GOV-19 body as numbered sub-clauses. Only GOV-19 carries the REQ-ID `**GOV-19.**` bold-anchor marker. The four sub-clauses are normative prose paragraphs within GOV-19, marked editorially by the bold-token line `**Axis N — <name>.**` (no per-axis REQ-ID is minted).

**Section heading:** `### GOV-19 — Dual-anchor convention for renamed sections`.

**Section anchor:** `<a id="gov-19"></a>` on the section heading.

**Body — four numbered sub-clauses, each carrying its own per-axis HTML navigation anchor:**

1. `<a id="gov-19-canonical-arm"></a>` **Axis 1 — Canonical arm.** When a heading or paragraph carries both a `<a id="loom-1-0-...">` anchor and a `<a id="v1-...">` anchor that resolve to the same target, new cross-references in the spec corpus MUST cite the `loom-1-0-*` arm rather than the `v1-*` arm. The pre-existing `v1-*` arm is retained as a back-compat alias per Axis 2.
2. `<a id="gov-19-alias-permanence"></a>` **Axis 2 — Alias permanence.** The `v1-*` arm is a permanent back-compat alias, not a deprecated arm. It is NOT eligible for retirement under ordinary GOV-7 *Rename* / GOV-8 *Retire* operations except as the retirement-discharge axis (Axis 4) permits. Ordinary section-and-alias retirement (GOV-7 *Delete* / *Merge*, GOV-8 *Deletion*) of the entire heading remains permitted on its own terms and is NOT gated on Axis 4's discharge witness — only the alias-only retirement (drop `<a id="v1-...">` while keeping the heading) is gated.
3. `<a id="gov-19-intensional-definition"></a>` **Axis 3 — Definition of "dual-anchored heading or paragraph".** A heading or paragraph is *dual-anchored* iff it carries both a `<a id="v1-…">` anchor and a `<a id="loom-1-0-…">` anchor that resolve to the same target. The definition is intensional, not enumerated. It admits every dual-anchor placement class actually present in the post-fix corpus: (a) **at-heading explicit pair** — two `<a id>` tags on consecutive lines immediately before a `###`/`##` heading line (the predominant case); (b) **inline-blockquote pair** — two `<a id>` tags inline within a `> **... seam — ...**` blockquote label on a single line; (c) **at-heading explicit-pair-replacing-auto-id** — two `<a id>` tags immediately before a heading whose pre-rename GitHub auto-id slug differed (the `tooling-deferrals-*`, `surface-extensions-*`, `model-level-changes-*`, and `v1-non-goals`/`loom-1-0-non-goals` cases). Layout-form constraints that the definition pins MUST be satisfied by every placement class above. Where renderer-specific behaviour for two consecutive `<a id>` siblings differs (some renderers treat them as one anchor target with two ids, others as two distinct fragment targets), the definition is **renderer-agnostic**: both ids resolve to the same target paragraph/heading on any GFM-compatible renderer, which is the only renderer the spec corpus is rendered under (GOV-18 arm (a) binding scope).
4. `<a id="gov-19-retirement-discharge"></a>` **Axis 4 — Retirement discharge.** The `v1-*` alias on a given heading or paragraph MAY be retired (its `<a id="v1-...">` tag removed) only when both (a) and (b) hold:
   - (a) **Corpus-wide discharge predicate.** No inbound `#v1-<slug>` cross-reference to that specific alias remains in the spec corpus (`docs/spec.md` + `docs/spec_topics/*.md`). Recommended (non-normative) detection recipe: `grep -rnE '#v1-<slug>\b' docs/spec.md docs/spec_topics/ | wc -l == 0` for that specific slug. The recipe is illustrative, not a normative gate; the gate is the absence of inbound references regardless of how they are detected.
   - (b) **Audit record.** A retirement-record row is appended to a new `## Retired anchor aliases` sub-table on `governance.md` (see *Sites — Retired anchor aliases sub-table* below for the structural pin). The retirement-record row names the retired alias slug, the heading or paragraph it was attached to, and the abbreviated commit SHA of the retirement commit. The audit-record format is per-slug, single-line, with three columns; the cross-corpus scope question is resolved at axis 4's narrow scope (spec corpus only — see *Cross-corpus scope decision* below).

**Cross-corpus scope decision.** GOV-19 narrows to the spec corpus alone (`docs/spec.md` + `docs/spec_topics/`). Plan-side citations of `#v1-…` (none currently exist; verified by `grep -rnE '#v1-' docs/plan.md docs/plan_topics/`) are ungoverned by GOV-19; GOV-17 is NOT amended to extend the corpus-direction binding to GOV-19's obligations. Rationale: every cited inbound `#v1-…` lives in the spec corpus today; the plan corpus's existing reservation rule at `conventions.md:9` is sufficient to keep plan-side prose from inventing new `#v1-…` references. The narrower scope keeps GOV-17 untouched.

**Sibling-rule reconciliation (mandatory audit, results folded into GOV-19's prose).**

The fixer MUST audit GOV-7 (lifecycle operations), GOV-8 (anchor-stability), GOV-17 (corpus direction), and GOV-18 (binding scope) — all defined on the same `governance.md` page — for framing collisions with GOV-19 before authoring. The audit MUST produce the following resolutions (folded into GOV-19's prose, not surfaced as a Notes carve-out):

- **GOV-7 / GOV-8 interaction.** Axis 2's alias-permanence MUST explicitly distinguish *alias-only retirement* (drop the `<a id="v1-...">` tag while keeping the heading and its `loom-1-0-*` arm) from *full section retirement* (the GOV-7 *Delete* / *Merge* and GOV-8 *Deletion* paths). Axis 4's discharge witness gates ONLY alias-only retirement; full section retirement uses the GOV-7/GOV-8 paths without GOV-19 interaction.
- **GOV-17 interaction.** Axis 4's discharge predicate's scope is the spec corpus alone (the cross-corpus scope decision above). The decision MUST be explicitly stated in GOV-19's prose so a reader does not infer cross-corpus jurisdiction from GOV-17's spec-corpus scope.
- **GOV-18 interaction.** GOV-19 binds arm (b) (the spec corpus itself), parallel to GOV-1/GOV-3/GOV-8/GOV-9. It does NOT bind arm (a) (the implementation target). The recommended detection recipe under Axis 4 is non-normative per GOV-18 arm (b)'s separation of invariant from auditing machinery.

### Sites — Retired anchor aliases sub-table (companion to GOV-19 Axis 4)

**Canonical home:** `docs/spec_topics/governance.md`, sited as a new `## Retired anchor aliases` sub-section immediately after the existing `## Retired REQ-IDs` sub-section (parallel structural placement). The sub-section carries a stable `<a id="retired-anchor-aliases"></a>` anchor on its heading.

**First-creation rule.** The sub-section is created in the same commit as GOV-19. The sub-section's body in the initial commit is one paragraph of introductory prose plus an empty table (header row + separator only, no data rows). The introductory paragraph names the table's purpose (records the retirement of `v1-*` back-compat aliases under GOV-19 Axis 4) and the per-row column semantics. Data rows are appended in future commits as alias-only retirements actually occur.

**Table structure.**

```
| Retired alias slug | Owner heading or paragraph | Retired in | Reason |
|--------------------|----------------------------|------------|--------|
```

- **Retired alias slug** — the kebab-case slug (e.g. `v1-seam-binder-refinement-loop`), without the leading `#`.
- **Owner heading or paragraph** — the heading text or paragraph reference the alias was attached to, with a Markdown cross-reference to the heading's `loom-1-0-*` arm anchor.
- **Retired in** — the 7-character abbreviated commit SHA of the retirement commit, or the V1.x release tag, same form as the `Retired in` column of the existing *Retired prefixes* sub-table (GOV-7 lifecycle parity).
- **Reason** — one short prose line.

**Applicability scope.** The sub-table applies to alias-only retirements on `docs/spec.md` and every file under `docs/spec_topics/`. It does NOT apply to plan-corpus aliases (none exist) and does NOT apply to alias-only retirements on out-of-corpus pages (e.g. `README.md`, `CHANGELOG.md` — these are GOV-17 dependents and carry no spec-governed alias surface).

### Sites — diagnostics.md Closure paragraph release-scope inline pin

`docs/spec_topics/diagnostics.md` §*Placeholder rendering (normative)* *Closure.* paragraph: the closure sentence MUST advertise its release scope inline (e.g. `Closure (loom 1.0.0). The eight rendering categories above are exhaustive …`) so a test writer can resolve the release-scope without navigating to the glossary.

### Out-of-scope tokens that look like `V1` but stay

- Pi SDK version literals (`~0.74.1`, `0.75.5`, etc.) — these are Pi-side `peerDependencies` versions, not loom versions.
- Node version literals (`>= 20.6.0`, `>= 22.19.0`) — owned by T19; not loom-version tokens.
- Diagnostic codes (`loom/parse/non-string-enum-value` etc.) — opaque tokens; do not pattern-match.
- Inline labels `SM-N`, `HC-N`, `NOCEIL-N` — opaque page-local identifiers; only the prose attached (e.g. SM-7d's "V1 no-cap / no-scheduler disposition") rewrites to "loom 1.0 no-cap / no-scheduler disposition".
- `docs/plan_topics/leaf-template.md` and `.pi/project-config.md` carry the plan-phase `V1`–`Vn` reservation surface and are NOT edited under this finding.
- The wider Orientation prose cleanup on `docs/spec.md` (Source-language stability redundant sentence, `sm-anchor-scheme-stability` paragraph relocation, V1 non-goals per-item-anchor decomposition, V1 non-goals closing governance-prose trim) is NOT in scope of this finding.

## Solution constraints

### Mechanical-rename and anchor-stability constraints

- **Dual-anchor retention.** Every renamed anchor MUST retain the pre-rename `<a id="v1-…">` as a sibling alias under the new canonical `<a id="loom-1-0-…">` per GOV-8 anchor-stability convention. Witness: `grep -rE '<a id="loom-1-0-[^"]+"></a>\s*<a id="v1-[^"]+"></a>' docs/` returns at least one match per heading enumerated under *Sites — HTML anchor renames* and *Sites — heading-derived auto-anchor cases*; `grep -rE '<a id="v1-[^"]+"></a>' docs/ | wc -l` is non-zero (the back-compat aliases survive). Silently dropping a pre-rename anchor is forbidden.
- **No bare `V<N>` as a loom release name.** After this fix, `grep -rE '\bV[0-9]+(\.[0-9x]+)?\b' docs/spec.md docs/spec_topics/ | grep -v -E 'peerDependenc|>= 20\.|>= 22\.|loom/' | wc -l` returns 0 in the loom-release-naming context. The `V2` → `loom 2.0` sweep under *Sites — companion mechanical sweep* enforces this.

### Frozen-baseline corpus-wide behavioural sweep constraint

- **Corpus-wide behavioural sweep, not a fixed enumeration.** The `loom 1.0` → `loom 1.0.0` reclassification at closure callsites is a corpus-wide behavioural sweep per the procedure under *Sites — frozen-baseline closure callsites*. The fixer MUST execute the sweep over the entire spec corpus and rewrite every callsite identified by the closure heuristic, NOT just the callsites listed in the currently-known-site enumeration. The enumerated list is illustrative; the sweep procedure is normative.
- **Self-consistency witness.** After the sweep, the following greps MUST hold:
  - `grep -rnE '\bloom 1\.0[^.0]' docs/spec.md docs/spec_topics/ | grep -iE 'closed|closure|exhaust|exact(ly)? [a-z0-9]+|loads cleanly|frozen|the closed set|the N-element' | wc -l` returns 0 (no closure-heuristic site retains the `loom 1.0` design-scope spelling).
  - For every pair of callsites that reference the same closure (e.g. `errors-and-results.md`'s panic-source citation and `diagnostics.md`'s panic-source closure declaration), both callsites use the same spelling (`loom 1.0.0`).
- **Default on ambiguity is frozen-baseline.** Where a callsite is ambiguous between design-scope and frozen-baseline, the fixer rewrites to `loom 1.0.0` (frozen-baseline). Design-scope claims subsume frozen-baseline claims, so the stronger commitment is the safer rewrite.
- **Audit witness in commit message.** The resolution commit message MUST include a `Frozen-baseline-sweep:` trailer naming the count of rewritten callsites, the count of files touched by the sweep, and the count of design-scope survivors verified by the witness greps.

### Glossary entry shape constraints

- **Two-bullet shape.** The glossary entry MUST be authored as exactly two sibling bullets in `docs/spec_topics/glossary.md`, one per sense (design-scope, frozen-baseline), each with its own stable `<a id>` anchor (`loom-1-0-design-scope` and `loom-1-0-0-frozen-baseline` respectively). A single combined bullet bundling both senses is forbidden.
- **Anchor on each bullet.** Each of the two bullets MUST carry its `<a id>` immediately before the bold-token line, matching the anchor convention used by every other anchored sibling in `glossary.md`. Unanchored normative glossary bullets are forbidden.
- **Closure enumeration.** Bullet 1 (design-scope) MUST name the licensed literals `loom 1.0` and `loom 1.x`; Bullet 2 (frozen-baseline) MUST name `loom 1.0.0`. Each bullet MUST state the in-force behaviour for literals outside its named set: literals matching `loom <integer>.<integer>` with `<integer>` ≥ 2 are governed by a future analogous bullet pair and are out of scope of this entry; literals not matching the `loom <version>` pattern are not version tokens. The two bullets jointly form a closed enumeration over `{loom 1.0, loom 1.x, loom 1.0.0}` and an open enumeration over future major lines.
- **Disambiguation is lexical, no SHOULD clause.** The disambiguation rule between Bullets 1 and 2 is purely lexical (callsite spelling chooses the sense). No SHOULD clause about inline parenthetical qualifiers is authored.
- **Anchor-fragment citations only.** Every consumer citation in either bullet MUST use Markdown link form `[label](path#anchor)` against a stable `<a id>` anchor at the destination. Raw line-number citations (e.g. `diagnostics.md:385`) are forbidden in glossary prose. Where the destination paragraph currently lacks a stable anchor, the fixer MUST author one as part of the same edit (specifically: `<a id="loom-1-0-0-panic-source-set">` on the panic-source closure paragraph in `diagnostics.md`, `<a id="loom-1-0-0-binder-error-absence">` on the `QueryError`-union statement in `binder.md`; both are net-new HTML navigation anchors per the project-config "Anchor governance" carve-out and do not require REQ-ID allocation).
- **Lexical-MUST consistency with frozen-baseline sweep.** The frozen-baseline closure callsites MUST be rewritten to `loom 1.0.0` (by the corpus-wide behavioural sweep, not a fixed enumeration) BEFORE the glossary entry is authored, so the lexical-MUST in Bullet 2 is internally consistent with every spec-corpus callsite that binds under it. The fixer authoring order MUST be: (1) flat rename, (2) corpus-wide frozen-baseline sweep, (3) glossary entry.

### Dual-anchor convention (GOV-19) constraints

- **Mandatory authoring.** The dual-anchor convention section at *Sites — dual-anchor convention (GOV-19)* MUST be authored. No out-clause permits skipping the section.
- **Placement.** The section MUST be sited under the existing governance structure on `governance.md`, immediately after GOV-18 and before the *REQ-ID prefix table*. It MUST NOT be sited under GOV-15 (release process).
- **In-grammar identifier scheme.** The new normative section's parent identifier MUST be a single REQ-ID conforming to GOV-3's tail grammar (`<PREFIX>-<N>` with `<N>` matching `[1-9][0-9]*`). Authoring tokens of shape `GOV-8a` or `GOV-8a-1` is FORBIDDEN — neither GOV-3 nor GOV-16 admits the tail forms `8a` or `8a-1`, and the fixer MUST NOT author tokens outside the grammars defined on the same page. The next free numeric ID under the `GOV` prefix (verified against the union of live + retired GOV-N entries on `governance.md`) is allocated as the section's REQ-ID; at fix time this is `GOV-19`. The four obligation axes do NOT get their own REQ-IDs; they are normative paragraphs within GOV-19's body, marked by bold-token labels (`**Axis 1 — Canonical arm.**` etc.) and HTML-only navigation anchors (`<a id="gov-19-canonical-arm">` etc.). Per project-config "Anchor governance", document-internal HTML anchors used purely for in-page hash navigation are NOT REQ-IDs and are NOT inline labels; the per-axis anchors do NOT require an inline-label-prefix-table entry.
- **Anchor and per-axis anchors.** The section MUST carry a stable `<a id>` on its heading (`gov-19`) AND each of its four axis sub-clauses MUST carry its own per-axis HTML navigation anchor (`gov-19-canonical-arm`, `gov-19-alias-permanence`, `gov-19-intensional-definition`, `gov-19-retirement-discharge`). Anchorless normative axis sub-clauses are forbidden.
- **Intensional definition with placement-class enumeration.** Axis 3 MUST define "dual-anchored heading or paragraph" intensionally (any heading or paragraph carrying both `<a id="v1-…">` and `<a id="loom-1-0-…">` anchors that resolve to the same target). Axis 3 MUST additionally enumerate the placement classes the definition admits: (a) at-heading explicit pair, (b) inline-blockquote pair, (c) at-heading explicit-pair-replacing-auto-id. Each placement class actually present in the post-fix corpus MUST be covered by the enumeration. The definition MUST be renderer-agnostic with respect to two consecutive `<a id>` siblings — both ids resolve to the same target paragraph/heading on any GFM-compatible renderer (the only renderer the spec is rendered under per GOV-18 arm (a)). Enumerated page-lists ("the dual-anchored headings are X, Y, Z") are forbidden as the definition.
- **Sibling-rule audit.** GOV-19 authoring MUST be preceded by a sibling-rule audit covering GOV-7 (lifecycle operations), GOV-8 (anchor-stability), GOV-17 (corpus direction), and GOV-18 (binding scope) — all defined on the same `governance.md` page. The audit MUST resolve the GOV-7/GOV-8 interaction (alias-only retirement vs full section retirement), the GOV-17 interaction (corpus-scope decision explicitly stated), and the GOV-18 interaction (arm (a) vs arm (b) binding). Audit results MUST be folded into GOV-19's prose, NOT surfaced as a Notes carve-out.
- **Cross-corpus scope decision.** GOV-19 narrows to the spec corpus alone. The prose MUST explicitly state this scope decision so a reader does not infer cross-corpus jurisdiction from GOV-17's spec-corpus scope. GOV-17 is NOT amended.
- **Retirement discharge.** Axis 4 MUST name a per-slug discharge predicate (no inbound `#v1-<slug>` reference in the spec corpus) and pair it with a per-row entry in the new `## Retired anchor aliases` sub-table on `governance.md`. The detection recipe (`grep -rnE '#v1-<slug>\b' docs/spec.md docs/spec_topics/`) is non-normative per GOV-18 arm (b); the normative gate is the absence of inbound references regardless of detection method.

### Retired anchor aliases sub-table constraints

- **Mandatory authoring with explicit structure.** A new `## Retired anchor aliases` sub-section MUST be authored on `docs/spec_topics/governance.md` in the same commit as GOV-19. The sub-section MUST carry a stable `<a id="retired-anchor-aliases">` anchor on its heading.
- **Placement.** Sited immediately after the existing `## Retired REQ-IDs` sub-section (structural parity with existing retirement registries on the same page).
- **First-commit shape.** The sub-section's body in the initial commit is one paragraph of introductory prose plus an empty Markdown table (header row + separator only, no data rows). The introductory paragraph names the table's purpose and per-row column semantics.
- **Column shape.** The table has exactly four columns: `Retired alias slug | Owner heading or paragraph | Retired in | Reason`. The `Retired in` column uses the same value space as the `Retired in` column of the existing *Retired prefixes* sub-table (7-character abbreviated commit SHA or V1.x release tag).
- **Applicability scope (made explicit).** The sub-table applies to alias-only retirements on `docs/spec.md` and every file under `docs/spec_topics/`. It does NOT apply to plan-corpus or out-of-corpus pages.

### Identifier-grammar conformance constraint (applies corpus-wide to net-new IDs)

- **Net-new REQ-ID conformance.** Every net-new REQ-ID this fix authors MUST extract under GOV-3's REQ-ID grammar (`<PREFIX>-<N>` with `<PREFIX>` in the REQ-ID prefix-table union and `<N>` matching `[1-9][0-9]*`). Tokens of shape `GOV-8a` or `GOV-8a-1` are forbidden.
- **Net-new inline-label conformance.** Every net-new inline label this fix authors MUST extract under GOV-16's inline-label grammar (`<PREFIX>` in the inline-label prefix-table union, `<TAIL>` matching the prefix's pinned tail form). The fix authors no new inline labels.
- **Net-new HTML navigation anchors are permitted without grammar gating.** Anchors of shape `<a id="gov-19-canonical-arm">`, `<a id="loom-1-0-0-panic-source-set">`, `<a id="retired-anchor-aliases">`, etc. are document-internal navigation anchors per the project-config "Anchor governance" carve-out and are NOT subject to GOV-3 or GOV-16 grammar.

### Diagnostics-closure inline-scope constraint

- **Closure paragraph release-scope inline pin.** The *Closure.* paragraph under "Placeholder rendering (normative)" in `docs/spec_topics/diagnostics.md` MUST carry the release-scope inline (e.g. `(loom 1.0.0)` immediately after the `Closure.` label) so the closed eight-category enumeration's release semantics are resolvable without navigating to the glossary.

### Authoring shape and mechanical-witness constraints

- **Mechanically-checkable MUSTs only.** Every `MUST` clause introduced by this fix MUST either name a mechanically-checkable witness predicate inline in the same paragraph OR be authored as `SHOULD` instead. Undecidable `MUST preserve` clauses are forbidden.
- **Per-paragraph and per-sub-obligation anchors on net-new normative prose.** Any new normative paragraph authored under this fix MUST carry a stable `<a id="...">`. Each independently-falsifiable sub-obligation within a paragraph MUST also carry its own per-obligation `<a id>`. Applies to the glossary entry (two bullets, two anchors), the GOV-19 section (section anchor + four per-axis HTML navigation anchors), and the Retired anchor aliases sub-table heading.
- **Fixer authoring-order discipline.** The fixer MUST author edits in this order: (1) mechanical rename across spec corpus prose + plan slip fixes + README parking pointer + companion mechanical sweep; (2) corpus-wide frozen-baseline-callsite reclassification sweep per the procedure under *Sites — frozen-baseline closure callsites* (including authoring the `<a id="loom-1-0-0-panic-source-set">` and `<a id="loom-1-0-0-binder-error-absence">` anchors needed by the glossary's Bullet 2); (3) HTML anchor renames with dual-anchor retention (including heading-derived auto-anchor explicit-pair cases); (4) inbound fragment-link rewrites (including the heading-derived `#tooling-deferrals-no-v1-impact` / `#surface-extensions-v1-leaves-a-seam` / `#model-level-changes-no-v1-seam-expected` fragments); (5) diagnostics.md Closure inline-scope pin; (6) glossary entry (two anchored bullets, anchor-fragment citations only); (7) Retired anchor aliases sub-table on `governance.md` (empty table with header row + separator); (8) GOV-19 dual-anchor convention section (heading anchor + four per-axis HTML navigation anchors + sibling-rule audit folded into prose + cross-corpus scope decision explicitly stated). The order ensures every site cited by the glossary entry is already in its final form when the entry is authored, and every site referenced by GOV-19 (including the Retired anchor aliases sub-table) exists when GOV-19 is authored.
- **Suggested resolution commit message:** `pi-loom spec: resolve "V1 -> loom 1.0 rename across spec corpus + GOV-19 dual-anchor convention + glossary disambiguation"`. Include the `Frozen-baseline-sweep:` trailer per the frozen-baseline-sweep audit-witness constraint.

## Relationships

(none)
