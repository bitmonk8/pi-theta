# Triaged Spec Review - spec

_Generated: 2026-05-27T11:30:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T20) is addressed first; the first finding (T04) is addressed last._

---

# T04 - V1 non-goals heading + anchor rename in lock-step with T17

**Original heading:** Orientation → V1 non-goals (`v1-non-goals` paragraph and closing paragraph)
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` carries a `### V1 non-goals` heading anchored at `<a id="v1-non-goals">`. T17 retires the spec-corpus `V1` token (Option A — rename to `loom 1.0` / `loom 1.x`); the chosen rename applies to this heading and its anchor. If T17 lands without touching this heading the spec carries a mixed-vocabulary surface; if this heading renames in isolation the inbound `#v1-non-goals` citations from `docs/spec_topics/future-considerations.md` and the sibling Orientation prose break. The two edits must ship together.

## Solution approach

Rename the `### V1 non-goals` heading in `docs/spec.md` to `### loom 1.0 non-goals` and its `<a id="v1-non-goals">` anchor to `<a id="loom-1-0-non-goals">`. Add the pre-rename `<a id="v1-non-goals">` as a sibling back-compat alias per GOV-8 anchor-stability (do NOT delete it). The heading-and-anchor pair binds under the dual-anchor convention authored by T17 (see *Sites — dual-anchor convention paragraph (GOV-8)* in T17's Solution approach).

## Solution constraints

- Out of scope: the wider Orientation prose cleanup originally bundled in this finding (Source-language stability redundant sentence, `sm-anchor-scheme-stability` paragraph relocation, V1 non-goals per-item-anchor decomposition, V1 non-goals closing governance-prose trim). Those edits were dropped from the working set.

## Relationships

- T17 "`V1` denotes two different things across the spec/plan boundary" — co-resolve (this heading + its `#v1-non-goals` anchor are part of the same `V1` → `loom 1.0` rename surface T17 covers; addressing them separately would leave the spec with a mixed-vocabulary heading or a broken inbound `#v1-non-goals` link from `future-considerations.md`)

---

# T17 - Rename `V1` -> `loom 1.0` across the spec corpus

**Original heading:** Cross-spec — `V1` terminology collision with the plan corpus
**Original section:** `docs/spec.md`
**Kind:** cross-spec-consistency-broad
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` and `docs/spec_topics/*.md` use `V1` / `V1.0` / `V1.x` as the loom-language release name (~317 occurrences across the spec corpus; 13 in `spec.md`; 15 `> **V1 seam — …` blockquote labels; 10 `<a id="v1-…">` HTML anchors). `docs/plan_topics/conventions.md:9` reserves `H1`–`Hn`, `M`, and `V1`–`Vn` for plan-phase IDs and forbids reusing them for the release meaning: *"when plan prose needs to refer to the initial release of the loom language, write 'loom 1.0' or 'the initial release'; never reuse a plan ID for that meaning."* Same token, two meanings.

The plan-side rule already slips: `conventions.md:37` and `:43` write "V1.0 closing gate" (release meaning); `plan.md:11` writes "V1.0 release gate". A contributor reading SM-7d ("V1 no-cap / no-scheduler disposition") cannot tell whether the constraint is a release-line disposition or a leaf-phase scope. `README.md` lines 28–35 park the debt as a "deferred mechanical sweep" pointing at `docs/spec-sweeps.md` — that file does not exist in the tree, so the debt is currently untracked.

A pure mechanical rename also surfaces three dangling normative invariants the spec corpus does not currently pin, every one of which the prior run's spec-lens corpus raised as a defect against the partial-rename diff (accumulated constraints `C1, C4..C11` recovered from `.pi/tmp/spec-fix-loop/2026-05-27T19-25-46_73d5d3/_origin/_accumulated-constraints.md`):

1. **Token-sense overload.** The renamed token `loom 1.0` is overloaded — it names both the 1.0.0 frozen-baseline release (e.g. GOV-15's "loads cleanly under <baseline>", the *Ceiling-set carve-out* "closed at <baseline>", the PIC `Re-validation gate` carve-out, the panic-source closure declarations in `diagnostics.md:385/:404` and the `QueryError`-variant statement in `binder.md:329`) and the design scope of the entire 1.x line (e.g. "<major-line> targets Node exclusively", the `loom-1-0-non-goals` aggregator). A contributor cannot tell from a bare `loom 1.0` callsite which sense binds.
2. **Dual-anchor lifecycle.** The dual `<a id="loom-1-0-…">` + `<a id="v1-…">` anchor pattern introduced by GOV-8 anchor-stability has no canonicality rule for new cross-references and no defined lifecycle under future GOV-8 *Split* / *Retire* / *Rename* operations.
3. **Frozen-baseline-vs-design-scope contradiction at closure callsites.** A flat `V1` → `loom 1.0` rewrite applied uniformly to the corpus produces a direct contradiction at frozen-baseline closure callsites (the three sites listed under invariant 1): under the lexical-classification rule the rename authorises, those sites read as 1.x-line-wide commitments (a future `1.0.1` patch MAY add a seventh panic source) rather than frozen-baseline.

All three invariants MUST be pinned by this fix or the spec is left with new ambiguity in place of the old vocabulary collision. The fix-shape obligations on each are specified in `## Solution approach` (sites) and `## Solution constraints` (binding shape) below; arm choices on bimodal resolutions are made in this finding, not deferred to the fixer.

## Solution approach

Rename `V1` -> `loom 1.0`, `V1.0` -> `loom 1.0`, `V1.x` -> `loom 1.x` in the spec corpus, per the plan-side phrasing at `conventions.md:9` (which stays in force as the canonical rule for plan-phase IDs). EXCEPT at the frozen-baseline closure callsites enumerated under *Sites — frozen-baseline closure callsites* below, where the rewrite target is `loom 1.0.0` (the distinct frozen-baseline spelling) not `loom 1.0`.

This fix bundles three further authoring sub-problems in the same domain so the post-fix spec corpus closes all three dangling invariants identified in `## Problem` in one consistent edit: (a) two further mechanical sweeps (`V2` → `loom 2.0`; `Tooling deferrals` anchor alias) listed under *Sites — companion mechanical sweep*; (b) a new two-bullet glossary entry pinning the token-sense distinction listed under *Sites — glossary entry*; (c) a new GOV-8 sub-section authoring the dual-anchor convention listed under *Sites — dual-anchor convention paragraph (GOV-8)*. Each sub-problem has its own `## Sites — …` block enumerating callsites and its own constraint block in `## Solution constraints` binding shape.

### Sites — spec corpus prose

**`docs/spec.md`** (13 V1 occurrences). Rewrite `V1` / `V1.0` / `V1.x` in prose at lines 40, 44, 46, 68, 70, 78, 80, 82, 86, 100, 102, 150. Line 97 anchor and line 98 heading `### V1 non-goals` are owned by T04 (co-resolve).

**`docs/spec_topics/`** — 27 files, ~304 occurrences total. Rewrite V1 / V1.0 / V1.x in prose and rename every `> **V1 seam — <name>.**` blockquote label to `> **loom 1.0 seam — <name>.**`. Per-file occurrence counts (seam-label line numbers in parentheses):

- `binder.md` (10 occurrences; seam labels at :29, :106) — EXCEPT `binder.md:329` (frozen-baseline closure; see *Sites — frozen-baseline closure callsites*)
- `bindings.md` (2)
- `cancellation.md` (2)
- `control-flow.md` (1)
- `descriptions.md` (1)
- `diagnostics.md` (31) — EXCEPT `diagnostics.md:385` and `:404` (frozen-baseline closures; see *Sites — frozen-baseline closure callsites*)
- `discovery.md` (7)
- `errors-and-results.md` (14; seam label at :160)
- `expressions.md` (5)
- `frontmatter.md` (11; seam label at :135)
- `functions.md` (1)
- `future-considerations.md` (58; narrative seam reference at :65)
- `glossary.md` (3)
- `governance.md` (8) — see *Sites — dual-anchor convention paragraph (GOV-8)* below for additional GOV-8 sub-section authoring at this file
- `hard-ceilings.md` (14)
- `implementation-notes.md` (4)
- `imports.md` (4; seam label at :22)
- `invocation.md` (8; seam labels at :14, :38, :40)
- `lexical.md` (1)
- `pi-integration-contract.md` (96; seam labels at :246, :250, :724)
- `query.md` (10; seam labels at :273, :295)
- `runtime-value-model.md` (2)
- `schema-subset.md` (1)
- `schemas.md` (2)
- `slash-invocation.md` (2)
- `tool-calls.md` (5; seam label at :40)
- `type-system.md` (2)

### Sites — HTML anchor renames (10 anchors)

Each `<a id="v1-…">` is rewritten as a dual anchor `<a id="loom-1-0-…"></a><a id="v1-…"></a>` per GOV-8 anchor-stability convention. The pre-rename `<a id="v1-…">` is RETAINED as a sibling back-compat alias (canonical arm is `loom-1-0-*`; alias permanence binds under the dual-anchor convention authored at *Sites — dual-anchor convention paragraph (GOV-8)*).

- `docs/spec.md:97` — `v1-non-goals` -> `loom-1-0-non-goals` (T04 co-resolve)
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

### Sites — inbound fragment-link rewrites

Every `#v1-non-goals` and `#v1-seam-…` fragment-link citation in the spec corpus must repoint to the new canonical `#loom-1-0-…` anchor. Grep:

```
grep -rn '#v1-non-goals\|#v1-seam-' docs/
```

and rewrite each hit. The largest concentration is `future-considerations.md` (Surface-extensions inventory cross-links each seam by `#v1-seam-…` fragment). The pre-rename `<a id="v1-…">` aliases are retained at the destination sites (see *Sites — HTML anchor renames*) so any links missed by the grep continue to resolve.

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
- **`Tooling deferrals` heading + dual-anchor pair.** `docs/spec_topics/future-considerations.md` §"Tooling deferrals (no V1 impact)" renames the heading to "Tooling deferrals (no loom 1.0 impact)" and authors a dual anchor `<a id="tooling-deferrals-no-loom-1-0-impact"></a><a id="tooling-deferrals-no-v1-impact"></a>` immediately before the renamed heading. Both anchors are retained; the inbound link from `docs/spec_topics/pi-integration-contract.md:125` is repointed to the new canonical `#tooling-deferrals-no-loom-1-0-impact`. (Standard GOV-8 dual-anchor pattern under the convention authored at *Sites — dual-anchor convention paragraph (GOV-8)*.)

### Sites — glossary entry (split per sense; new normative prose with stable anchors)

**Canonical home:** `docs/spec_topics/glossary.md`. The new entry is authored as **two distinct sibling bullets** (not one combined bullet) in the file's existing alphabetical sense table, each pinning one sense, each carrying its own stable `<a id>` anchor so the corpus's normative consumers can cite the per-sense identifier directly:

1. **Bullet 1 — design-scope sense.** Anchor `<a id="loom-1-0-design-scope"></a>`. Bold-token line: `**loom 1.0** (and **loom 1.x**)`. Body (one paragraph, no MUST clauses): defines the literal as naming the entire 1.x line / major design scope; cites the canonical consumers (the `loom-1-0-non-goals` aggregator on `docs/spec.md` and `future-considerations.md`, the `<major-line> targets Node exclusively` callsite, the *Scope* / *Prerequisites* paragraphs on `docs/spec.md`); explicitly disclaims the frozen-baseline sense (pointer to Bullet 2).
2. **Bullet 2 — frozen-baseline sense.** Anchor `<a id="loom-1-0-0-frozen-baseline"></a>`. Bold-token line: `**loom 1.0.0**`. Body (one paragraph, no MUST clauses): defines the literal as naming the frozen 1.0.0 baseline release; cites the canonical consumers (GOV-15's "loads cleanly under <baseline>", the *Ceiling-set carve-out*'s "closed at <baseline>" phrasing, the PIC *Re-validation gate* carve-out, the panic-source closures in `diagnostics.md:385/:404`, the `QueryError`-union statement in `binder.md:329`); explicitly disclaims the design-scope sense (pointer to Bullet 1).

The two-bullet shape is binding (see `## Solution constraints` *Glossary entry shape* below). The disambiguation between the two senses is **lexical only** — a callsite uses literal `loom 1.0` (or `loom 1.x`) to invoke Bullet 1, and literal `loom 1.0.0` to invoke Bullet 2. No SHOULD clause about inline parenthetical qualifiers ("`(baseline release)`" or "`(major line)`") is authored — the chosen disambiguation arm is "delete the SHOULD" (per arm-choice on accumulated constraint `C5`).

### Sites — frozen-baseline closure callsites (rewrite to `loom 1.0.0`)

The following callsites pin frozen-baseline closure invariants (a future `1.0.1` patch SHALL NOT extend the closed set). They MUST be rewritten to `loom 1.0.0` to bind under Glossary Bullet 2, not the bare-`V1` → `loom 1.0` flat rewrite which would bind them under Bullet 1 (design-scope, 1.x-wide):

- `docs/spec_topics/diagnostics.md:385` — `V1 has exactly six panic sources` → `loom 1.0.0 has exactly six panic sources`
- `docs/spec_topics/diagnostics.md:404` — `… not in V1's panic catalogue` → `… not in loom 1.0.0's panic catalogue`
- `docs/spec_topics/binder.md:329` — `V1 has no BinderError variant in the QueryError union` → `loom 1.0.0 has no BinderError variant in the QueryError union`
- `docs/spec_topics/governance.md` §GOV-15 — `loads cleanly under <baseline>` callsite: ensure the baseline token at this site reads `loom 1.0.0` (verify by grep against the §GOV-15 body)
- `docs/spec_topics/governance.md` §*Ceiling-set carve-out* — `closed at <baseline>` callsite: same treatment
- `docs/spec_topics/pi-integration-contract.md` §*Re-validation gate* — baseline-pinning carve-out: same treatment
- `docs/spec_topics/hard-ceilings.md` — any "V1.0-rejected-candidate-record" or "in-flight ceiling" callsite where the closure semantics are frozen-baseline: rewrite the V1.0 token to `loom 1.0.0`

The fixer MUST perform a `grep -nE '\bV1(\\.0)?\b' docs/spec.md docs/spec_topics/` pre-pass enumerating every callsite, then classify each as design-scope (rewrite to `loom 1.0` / `loom 1.x`) or frozen-baseline (rewrite to `loom 1.0.0`) using the heuristic: any callsite whose surrounding sentence makes a closure / exhaustive-enumeration / "exactly N" / "loads cleanly under" / "closed at" claim is frozen-baseline; everything else is design-scope. Default on ambiguity: design-scope (the safer rewrite — design-scope claims subsume frozen-baseline claims). The audit results MUST be folded into the rewrite, not surfaced as a Notes carve-out.

### Sites — dual-anchor convention paragraph (GOV-8)

**Canonical home:** `docs/spec_topics/governance.md`, sited as a new sub-section IMMEDIATELY under GOV-8 (NOT under GOV-15). Authoring this paragraph is **MANDATORY** (the prior run's OPTIONAL framing is withdrawn — without the convention the dual-anchor surface is unanchored to any governing rule and the lens corpus re-raises the omission on every pass).

**Section heading:** `### GOV-8a — Dual-anchor convention for renamed sections` (or the next free GOV-8 sub-letter per the page's existing convention).

**Section anchor:** `<a id="gov-8a"></a>` on the section heading.

**Body — four numbered sub-clauses, each independently falsifiable, each carrying its own per-obligation `<a id>`:**

1. `<a id="gov-8a-1-canonical-arm"></a>` **Canonical arm.** When a heading carries both a `<a id="loom-1-0-...">` anchor and a `<a id="v1-...">` anchor, new cross-references in the spec corpus MUST cite the `loom-1-0-*` arm. Witness: `grep -rn '#v1-' docs/ | grep -v '<a id="v1-' | wc -l` — should monotonically decrease over time; any new commit that grows this count is non-conformant.
2. `<a id="gov-8a-2-alias-permanence"></a>` **Alias permanence.** The `v1-*` arm is a permanent back-compat alias, NOT a deprecated arm. It is not eligible for retirement under GOV-7 *Rename* / GOV-8 *Retire* unless the discharge witness in sub-clause 4 is satisfied. The corpus MUST NOT remove a `<a id="v1-…">` alias without satisfying sub-clause 4.
3. `<a id="gov-8a-3-intensional-definition"></a>` **Definition of "dual-anchored heading".** A heading is *dual-anchored* iff both `<a id="v1-…">` and `<a id="loom-1-0-…">` anchors co-occur on consecutive lines immediately before its heading text. The definition is intensional (any heading matching the pattern is dual-anchored); enumerated page-lists are not used. Witness: `grep -rE '<a id="loom-1-0-[^"]+"></a>\s*<a id="v1-[^"]+"></a>' docs/`.
4. `<a id="gov-8a-4-retirement-witness"></a>` **Retirement discharge witness.** The `v1-*` arm MAY be retired (anchor removed; alias dropped) only when the discharge predicate `grep -rE '#v1-[a-z0-9-]+' docs/ | wc -l == 0` holds across the entire spec + plan corpus AND every load-bearing renamed callsite has been audited to confirm no inbound link relies on the alias. The audit MUST be recorded as a one-line addendum to GOV-7 *Rename* naming the SHA of the verifying commit. Until both conditions hold the alias stays.

### Sites — diagnostics.md Closure paragraph release-scope inline pin

`docs/spec_topics/diagnostics.md` §*Placeholder rendering (normative)* *Closure.* paragraph: the closure sentence MUST advertise its release scope inline (e.g. `Closure (loom 1.0.0). The eight rendering categories above are exhaustive …`) so a test writer can resolve the release-scope without navigating to the glossary. (Accumulated constraint `C8` carryover.)

### Out-of-scope tokens that look like `V1` but stay

- Pi SDK version literals (`~0.74.1`, `0.75.5`, etc.) — these are Pi-side `peerDependencies` versions, not loom versions.
- Node version literals (`>= 20.6.0`, `>= 22.19.0`) — owned by T19; not loom-version tokens.
- Diagnostic codes (`loom/parse/non-string-enum-value` etc.) — opaque tokens; do not pattern-match.
- Inline labels `SM-N`, `HC-N`, `NOCEIL-N` — opaque page-local identifiers; only the prose attached (e.g. SM-7d's "V1 no-cap / no-scheduler disposition") rewrites to "loom 1.0 no-cap / no-scheduler disposition".
- `docs/plan_topics/leaf-template.md` and `.pi/project-config.md` carry the plan-phase `V1`–`Vn` reservation surface and are NOT edited under this finding.

## Solution constraints

### Mechanical-rename and anchor-stability constraints

- **Dual-anchor retention.** Every renamed anchor MUST retain the pre-rename `<a id="v1-…">` as a sibling alias under the new canonical `<a id="loom-1-0-…">` per GOV-8 anchor-stability convention. Witness: `grep -rE '<a id="loom-1-0-[^"]+"></a>\s*<a id="v1-[^"]+"></a>' docs/` returns one match per heading enumerated under *Sites — HTML anchor renames* and *Sites — companion mechanical sweep*; `grep -rE '<a id="v1-[^"]+"></a>' docs/ | wc -l` is non-zero (the back-compat aliases survive). Silently dropping a pre-rename anchor is forbidden.
- **No bare `V<N>` as a loom release name.** After this fix, `grep -rE '\bV[0-9]+(\\.[0-9x]+)?\b' docs/spec.md docs/spec_topics/ | grep -v -E 'peerDependenc|>= 20\\.|>= 22\\.|loom/' | wc -l` returns 0 in the loom-release-naming context. The `V2` → `loom 2.0` sweep under *Sites — companion mechanical sweep* enforces this.

### Glossary entry shape constraints (operationalising `C1, C4, C5, C7, C10, C11`)

- **Two-bullet shape.** The glossary entry MUST be authored as exactly two sibling bullets in `docs/spec_topics/glossary.md`, one per sense (design-scope, frozen-baseline), each with its own stable `<a id>` anchor (`loom-1-0-design-scope` and `loom-1-0-0-frozen-baseline` respectively, or equivalent kebab-case slugs preserved across this run). A single combined bullet bundling both senses is forbidden. (Operationalises `C11`.)
- **Anchor on each bullet.** Each of the two bullets MUST carry its `<a id>` immediately before the bold-token line, matching the anchor convention used by every other anchored sibling in `glossary.md`. Unanchored normative glossary bullets are forbidden. (Operationalises `C4, C10`.)
- **Closure enumeration.** Bullet 1 (design-scope) MUST name the licensed literals `loom 1.0` and `loom 1.x`; Bullet 2 (frozen-baseline) MUST name `loom 1.0.0`. Each bullet MUST state the in-force behaviour for literals outside its named set: literals matching `loom <integer>.<integer>` with `<integer>` ≥ 2 (e.g. `loom 2.0`, `loom 2.1.0`) are governed by a future analogous bullet pair and are out of scope of this entry; literals not matching the `loom <version>` pattern are not version tokens. The two bullets jointly form a closed enumeration over `{loom 1.0, loom 1.x, loom 1.0.0}` and an open enumeration over future major lines. (Operationalises `C1`.)
- **Disambiguation is lexical, no SHOULD clause.** The disambiguation rule between Bullets 1 and 2 is purely lexical (callsite spelling chooses the sense). No SHOULD clause about inline parenthetical qualifiers (e.g. "`load-bearing callsites SHOULD carry an inline qualifier (baseline release)`") is authored. The chosen arm for accumulated constraint `C5` is "delete the SHOULD"; the chosen arm for `C7` is (b) (narrow the bullet — do not claim the bare-`V1` rename was sense-correct; the per-callsite frozen-baseline sweep under *Sites — frozen-baseline closure callsites* is the discharge instrument). (Operationalises `C5, C7`.)
- **Lexical-MUST consistency with frozen-baseline rewrite.** The frozen-baseline closure callsites enumerated under *Sites — frozen-baseline closure callsites* MUST be rewritten to `loom 1.0.0` (not `loom 1.0`) BEFORE the glossary entry is authored, so the lexical-MUST in Bullet 2 is internally consistent with every spec-corpus callsite that binds under it. The fixer authoring order MUST be: (1) flat rename, (2) frozen-baseline-callsite reclassification sweep, (3) glossary entry. (Operationalises `C9`.)

### Dual-anchor convention constraints (operationalising `C6`)

- **Mandatory authoring.** The dual-anchor convention paragraph at *Sites — dual-anchor convention paragraph (GOV-8)* MUST be authored. The prior run's OPTIONAL framing is withdrawn; no out-clause permits skipping the section.
- **Placement.** The section MUST be sited under GOV-8 (anchor lifecycle), NOT under GOV-15 (release process). It is a sibling sub-section of GOV-8, not a child of GOV-15.
- **Anchor and per-sub-clause anchors.** The section MUST carry a stable `<a id>` on its heading (e.g. `gov-8a`) AND each of its four sub-clauses MUST carry its own per-obligation `<a id>` (e.g. `gov-8a-1-canonical-arm`, `gov-8a-2-alias-permanence`, `gov-8a-3-intensional-definition`, `gov-8a-4-retirement-witness`). Anchorless normative sub-clauses introduced into `governance.md` are forbidden. (Operationalises the prior fix's *Per-paragraph and per-sub-obligation anchors on net-new normative prose* constraint, kept verbatim.)
- **Intensional definition.** Sub-clause 3 MUST define "dual-anchored heading" intensionally (any heading matching a syntactic pattern). Enumerated page-lists are forbidden as the definition.
- **Retirement discharge witness.** Sub-clause 4 MUST name a concrete grep-able discharge predicate (`grep -rE '#v1-[a-z0-9-]+' docs/ | wc -l == 0` plus an audit-record obligation against GOV-7 *Rename*). A permission predicate without a named discharge instrument is forbidden. (Operationalises the prior fix's *Retirement-audit witness* constraint, promoted from conditional to unconditional.)

### Diagnostics-closure inline-scope constraint (operationalising `C8`)

- **Closure paragraph release-scope inline pin.** The *Closure.* paragraph under "Placeholder rendering (normative)" in `docs/spec_topics/diagnostics.md` MUST carry the release-scope inline (e.g. `(loom 1.0.0)` immediately after the `Closure.` label) so the closed eight-category enumeration's release semantics are resolvable without navigating to the glossary.

### Authoring shape and mechanical-witness constraints

- **Mechanically-checkable MUSTs only.** Every `MUST` clause introduced by this fix MUST either name a mechanically-checkable witness predicate (grep-pattern, build-time literal-read test, CI gate criterion) inline in the same paragraph OR be authored as `SHOULD` instead. Undecidable `MUST preserve` clauses (e.g. "MUST preserve sense classification" with no extractor) are forbidden. (Operationalises the prior fix's *Mechanically-checkable MUSTs only* constraint, retained.)
- **Per-paragraph and per-sub-obligation anchors on net-new normative prose.** Any new normative paragraph authored under this fix MUST carry a stable `<a id="...">`. Each independently-falsifiable sub-obligation within a paragraph MUST also carry its own per-obligation `<a id>`. Applies to the glossary entry (two bullets, two anchors) AND the GOV-8a section (section anchor + four sub-clause anchors).
- **Fixer authoring-order discipline.** The fixer MUST author edits in this order: (1) mechanical rename across spec corpus prose + plan slip fixes + README parking pointer + companion mechanical sweep; (2) frozen-baseline-callsite reclassification sweep (rewrite to `loom 1.0.0` at the enumerated sites); (3) HTML anchor renames with dual-anchor retention; (4) inbound fragment-link rewrites; (5) diagnostics.md Closure inline-scope pin; (6) glossary entry (two anchored bullets); (7) GOV-8a dual-anchor convention section (heading anchor + four sub-clause anchors). The order ensures every site cited by the glossary entry is already in its final form when the entry is authored.

### Cluster-internal out-of-scope constraints

- Out of scope: the plan-phase `V1`–`Vn` reservation surface (Option B considered and rejected — plan rule predates spec text; leaving spec V1 prose in place would perpetuate the documented slip pattern). `docs/plan_topics/leaf-template.md` and `.pi/project-config.md` carry the canonical home of the plan-phase `V1` token reservation and are NOT edited under this finding.
- Out of scope: the *load-bearing* qualifier rewrite parked alongside this debt in `README.md`. Separate sweep with its own scope decision.

## Relationships

- T04 "V1 non-goals heading + anchor rename in lock-step with T17" — co-resolve (T04's heading + anchor are part of the same `V1` → `loom 1.0` rename surface this finding covers)
