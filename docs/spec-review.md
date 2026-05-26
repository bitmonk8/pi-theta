# Triaged Spec Review — spec

_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T28) is addressed first; the first finding (T03) is addressed last._

_Triage tally: 9 findings — 1 blocker, 7 high, 1 medium-low._

---

# T03 — `H1` is a plan-corpus identifier leaking into `spec.md` prose

**Kind:** cross-corpus-boundary, naming
**Importance:** medium-low
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` uses the token `H1` three times — in the Pi SDK and capabilities paragraph and in Host runtime bullets 1 and 2 — but `H1` is a plan-corpus phase identifier reserved by `docs/plan_topics/conventions.md` ("`H1`–`Hn`, `M`, and `V1`–`Vn` … are reserved for plan phases"). The spec corpus MUST NOT reference plan-corpus identifiers: a reader must be able to delete the plan and rebuild a different one from the same spec without touching the spec, and a glossary entry forward-linking to `plan_topics/conventions.md` (the original solution approach) would entrench the inversion rather than fix it. The three `H1` occurrences in `spec.md` are concretely the contract surface that pulls plan-corpus knowledge into spec-corpus prose.

## Solution approach

Rewrite the three `H1` call-sites in `docs/spec.md` (Pi SDK and capabilities paragraph; Host runtime bullets 1 and 2) so the prose names what the spec actually requires of the host / runtime in spec-corpus terms, with no token from the `H1…Hn` / `M` / `V1…Vn` reservation. Where a sentence currently relies on "the H1 tests" to discharge a normative assertion, either (a) state the assertion directly in `spec.md` (e.g. "the runtime MUST refuse to load when the peer-dep range excludes the installed Pi minor"), or (b) delete the deferral entirely if the surrounding paragraph is implementation guidance rather than a spec obligation. Do not add a glossary entry; the corpus-bridging move is the wrong remedy here.

## Solution constraints

- Out of scope: `docs/plan_topics/conventions.md`'s `H1…Hn` reservation — the plan corpus is permitted to coin and own these identifiers; the defect is solely the spec-side reference.
- Out of scope: the 21 cross-links from `docs/spec_topics/pi-integration-contract.md` to `../plan_topics/h1-scaffold.md` (owned by T24a).

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links from `spec.md` and `pi-integration-contract.md`" — same-cluster (same corpus-direction defect on the same `H1`-namespace surface; this finding removes the `H1` token, T24a removes the cross-links to the `H1` plan leaf; resolve in the same pass)
# T19c — Retarget the five `../spec.md#session-model` cross-references in future-considerations.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/future-considerations.md` carries five `../spec.md#session-model` cross-references (at lines 108, 112, 113, 114, and 116 — in the V1 non-goals `Recorded at:` lines for no-concurrent-user-sessions, no-parallel-invoke, no-parallel-fan-out, and no-admission-cap, plus one inline citation inside the no-parallel-fan-out body). Each citation pins a different sub-obligation of the Session model paragraph, but all five currently resolve to the same umbrella anchor. After T19a installs the per-obligation `sm-N-...` sub-anchors on `docs/spec.md`, these citations remain link-resolved-but-meaning-ambiguous until they are retargeted: a future edit narrowing one SM-obligation will silently appear to narrow the others.

## Solution approach

Retarget each of the five `../spec.md#session-model` cross-references in `docs/spec_topics/future-considerations.md` to the specific `sm-N-...` sub-anchor whose sub-obligation the surrounding `Recorded at:` line (or in-body citation) actually pins, using T19a's authored SM-N inventory as the ground truth for anchor names.

## Solution constraints

- Out of scope: authoring or modifying any `sm-N-...` anchor on `docs/spec.md` (owned by T19a) and retargeting the three sibling cross-references in `pi-integration-contract.md` (owned by T19b).

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (the `sm-N-...` anchor targets must exist before retargeting)
- T19b "Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md" — co-resolve (commutative sibling retarget; bundle into the same fix pass after T19a lands)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — same-cluster (if SM-7 collapses to a forward-link after T22, the SM-7 retargets in this edit collapse to `concurrency-model`)
# T19b — Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md to specific `sm-N-...` anchors

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/pi-integration-contract.md` carries three `../spec.md#session-model` cross-references — one in the `<a id="pi-slash-handler-promise-lifecycle-presupposition"></a>` *Pi-side slash-handler promise lifecycle* bullet, and two in the Pi-version-bump procedure (step 1's *Re-typecheck against the new package* item and step 5's *Update the capability-probe pinned constants* item). Each callsite pins a distinct sub-obligation of the Session model paragraph (cancellation-chain liveness; closed reason set; `SessionShutdownEvent` payload shape), but all three currently resolve to the same `#session-model` anchor. After T19a establishes `sm-N-...` sub-anchors on `docs/spec.md`, leaving the citations on the umbrella anchor leaves traceability ambiguous and lets a future edit narrowing one SM obligation silently appear to narrow the others.

## Solution approach

Retarget each of the three `../spec.md#session-model` cross-references in `docs/spec_topics/pi-integration-contract.md` (the Pi-side slash-handler promise lifecycle bullet and Pi-version-bump procedure steps 1 and 5) to the specific `sm-N-...` sub-anchor that names the sub-obligation that callsite is actually about, using T19a's SM-N inventory as the ground truth.

## Solution constraints

- Out of scope: authoring or naming the `sm-N-...` anchors themselves (owned by T19a) and retargeting the five `../spec.md#session-model` cross-references in `docs/spec_topics/future-considerations.md` (owned by T19c).

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-follow (the `sm-N-...` anchor targets must exist before retargeting)
- T19c "Retarget the five `../spec.md#session-model` cross-references in future-considerations.md" — co-resolve (commutative sibling retarget; bundle into the same fix pass after T19a lands)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — same-cluster
# T19a — Replace session-model paragraph with eight SM-N sub-units, each anchored `<a id="sm-N-...">`

**Kind:** traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` *Session model.* paragraph in `docs/spec.md` (Orientation › Prerequisites, third loose paragraph) carries one anchor over at least eight independently testable normative obligations: single-active-session binding to a Pi extension instance, the closed `session_shutdown` reason set, the per-reason fixed teardown sequence, the post-teardown degraded state for the session-only reasons `{"new","resume","fork"}`, the broader tag-transition predicate scope for the `LoomRegistry` drain transition and the degraded-state slash note, the narrower diagnostic-emission predicate scope for `loom/host/session-shutdown-runtime-degraded`, the mode-qualified concurrency / isolation model, and the per-invocation budget non-sharing rule. Eight live cross-references currently land on this anchor — three in `docs/spec_topics/pi-integration-contract.md` and five in `docs/spec_topics/future-considerations.md` — each pinning a different sub-obligation but all resolving to the same paragraph. As a result no inbound link can disambiguate which obligation it cites, and a future edit narrowing one obligation will silently appear to narrow the others.

## Solution approach

Decompose the `<a id="session-model"></a>` paragraph in `docs/spec.md` into eight stably-anchored sub-units `sm-1-...` through `sm-8-...`, one per obligation enumerated in Problem (binding; closed reason set; teardown sequence; degraded state for the session-only reasons; tag-transition predicate; diagnostic-emission predicate; mode-qualified isolation; per-invocation budget non-sharing). Keep the `<a id="session-model"></a>` anchor on the wrapping surface so existing inbound `#session-model` links continue to resolve. The SM-N inventory authored here is the ground truth that T19b and T19c retarget downstream callsites against.

## Solution constraints

- Out of scope: retargeting the eight downstream `#session-model` callsites — the three in `docs/spec_topics/pi-integration-contract.md` are owned by T19b and the five in `docs/spec_topics/future-considerations.md` are owned by T19c.

## Relationships

- T19b "Retarget the three `../spec.md#session-model` cross-references in pi-integration-contract.md" — must-precede (T19b's anchors-targets are established here)
- T19c "Retarget the five `../spec.md#session-model` cross-references in future-considerations.md" — must-precede (T19c's anchor-targets are established here)
- T22 "Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose" — must-follow (deduplication should land before this edit; if the concurrency content moves wholesale to `concurrency-model`, SM-7 collapses to a forward-link)
# T22 — Extension Architecture › Concurrency model bullet duplicates the Session model concurrency prose

**Kind:** cruft, naming, placement, scope, traceability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md`'s Extension Architecture section is a navigational index whose bullets follow `[Page Name](path) — short description`. The `<a id="concurrency-model"></a>` bullet breaks the pattern by embedding a ~500-word concurrency contract inline, near-verbatim duplicated from the Orientation › Session model paragraph (`<a id="session-model"></a>`): identical opening sentence, `(i)`–`(iv)` prompt-mode serialisation list, three-sources-of-overlap analysis, cancellation-propagation sentence, and per-invocation-budget paragraph. Neither copy is marked authoritative and the two anchors do not cross-reference each other, so future edits to one surface will drift independently of the other.

## Solution approach

Rewrite the body of the Extension Architecture › Concurrency model bullet in `docs/spec.md` to match the navigational `[Page Name](path) — short description` shape used by its siblings, with a forward-link to `#session-model` designated as the sole owner of the concurrency contract. Preserve the `<a id="concurrency-model"></a>` anchor in place so existing inbound `#concurrency-model` references continue to resolve.

## Solution constraints

- Out of scope: the `<a id="session-model"></a>` paragraph — owned by T19a–T19c.
- The rewritten bullet MUST NOT forward-link to `cancellation.md`, `implementation-notes.md`, `invocation.md`, or `pi-integration-contract.md`; every such link already lives inside the Session model paragraph and replicating any of them re-opens the drift surface this fix closes.

## Relationships

- T19a "Replace session-model paragraph with eight SM-N sub-units" — must-precede (decomposing `#session-model` into `SM-1`…`SM-8` is easier with one canonical body to decompose, not two)
# T23 — Pi SDK version literal `~0.72.1` is duplicated across the corpus and is stale against installed `0.74.1`

**Kind:** codebase-grounding-broad, cross-spec-consistency-broad, single-source-of-truth
**Importance:** blocker
**Shape:** single
**State:** reduced

## Problem

The Pi SDK pin literal `~0.72.1` is authored in ~30 places across the spec corpus plus 4 `package.json` `peerDependencies` entries:

- **Canonical pin (intended single source of truth):** `docs/spec_topics/pi-integration-contract.md` anchor `#pi-sdk-pin`.
- **In-corpus echoes on the canonical owner page:** ~26 further occurrences on the same `pi-integration-contract.md` page (across §*Session-binding contract*, §*Entry capability probe*, §*Patch-skew degradation contract*, §*Pi version bump procedure*, §*Conversation drive — subagent mode*, and others).
- **In-corpus echoes on other spec_topics:** `docs/spec_topics/binder.md`'s `<a id="strict-capability-requirement"></a>` paragraph (×1, as `pi-coding-agent ~0.72.1`); `docs/spec_topics/diagnostics.md`'s `loom/load/host-incompatible`, `loom/load/binder-model-not-strict-capable`, and `loom/load/binder-model-strict-capability-unknown` rows (×3); `docs/spec_topics/future-considerations.md`'s "No concurrent user sessions in the same host process." bullet (×1).
- **Build manifest:** `package.json` `peerDependencies` entries for `@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui` (×4).

Two defects co-exist on this surface:

1. **The literal is stale.** The installed Pi is `0.74.1`; the `~0.72.1` tilde range does not admit it. Every echo independently reinforces the stale literal; PIC describes an SDK version that contradicts reality, and `npm install` against `main` cannot satisfy the manifest pin until the four `package.json` entries are bumped.

2. **The literal was authored in many places to begin with.** The single-source-of-truth invariant the canonical pin's anchor name (`#pi-sdk-pin`) advertises is undermined by ~30 in-corpus repetitions of the literal. Every future Pi bump becomes an N-site sweep across `pi-integration-contract.md`, `binder.md`, `diagnostics.md`, `future-considerations.md`, and the manifest; any missed echo silently re-introduces corpus self-inconsistency. The version bump exposes the structural defect: a literal whose role is to name the supported Pi version is the kind of obligation that MUST live in exactly one place.

## Solution approach

Consolidate the Pi SDK version literal to a single canonical site in the spec corpus, then bump that site once:

1. **Designate the single source of truth.** The canonical pin at `docs/spec_topics/pi-integration-contract.md#pi-sdk-pin` is the only place in the spec corpus where the `~MAJOR.MINOR.PATCH` literal MAY appear. Tighten the surrounding prose so the pin is presented as the authoritative declaration and the single-source-of-truth rule is stated explicitly (e.g. "The supported Pi minor is pinned at `~0.74.1`. Every other reference to the supported Pi version in the spec corpus MUST cite this anchor and MUST NOT restate the literal.").

2. **Replace every in-corpus echo with an anchor citation.** Sweep the four affected files and rewrite each `~0.72.1` occurrence so the surrounding prose cites the canonical pin by anchor (e.g. "the [pinned Pi minor](./pi-integration-contract.md#pi-sdk-pin)" / "the pin recorded at [PIC §Pi SDK pin](#pi-sdk-pin)") rather than restating the literal. Where a sentence's grammar required the literal as an inline token, rephrase the sentence so the anchor reference carries the same load. Apply to:
   - `docs/spec_topics/pi-integration-contract.md` — the ~26 same-page echoes outside `#pi-sdk-pin` itself.
   - `docs/spec_topics/binder.md` — the `#strict-capability-requirement` paragraph.
   - `docs/spec_topics/diagnostics.md` — the three diagnostic-code rows (`loom/load/host-incompatible`, `loom/load/binder-model-not-strict-capable`, `loom/load/binder-model-strict-capability-unknown`).
   - `docs/spec_topics/future-considerations.md` — the "No concurrent user sessions in the same host process." bullet.

3. **Bump the canonical pin in the same commit.** Once the corpus carries the literal in exactly one place, rewrite `~0.72.1` → `~0.74.1` at `pi-integration-contract.md#pi-sdk-pin`. The bump is now a one-character edit in the spec corpus; the next bump after that is the same one-character edit.

4. **Update the build manifest jointly.** `package.json`'s four `@mariozechner/*` `peerDependencies` entries (`pi-coding-agent`, `pi-agent-core`, `pi-ai`, `pi-tui`) MUST carry the literal because npm consumes the manifest mechanically — the manifest is the one legitimate non-spec restatement of the pin, since it cannot anchor-cite. Bump all four entries from `~0.72.1` to `~0.74.1` in the same commit as the spec consolidation.

5. **Lock-step the manifest to the canonical pin under GOV-12.** Add a sentence at `pi-integration-contract.md#pi-sdk-pin` requiring the four `@mariozechner/*` peerDependencies entries in `package.json` to literally equal the canonical pin's range, and register the manifest as a GOV-12 lock-step downstream of the canonical pin. This closes the loophole that would otherwise let the manifest drift from the spec's canonical pin without surfacing as a spec edit, given that the manifest is the only legitimate restatement site.

Outcome: the spec corpus carries the version literal exactly once, the manifest carries it exactly four times (one per Pi peer), and the GOV-12 lock-step makes any drift between the spec side and the manifest side a CI-detectable failure. Every future Pi bump becomes a one-character edit at the canonical site plus a four-entry manifest update.

## Solution constraints

- The single-source-of-truth rule applies to the spec corpus only. `package.json` is permitted to restate the literal because npm reads the manifest mechanically; the GOV-12 lock-step replaces the freedom-to-restate elsewhere.
- The canonical pin's anchor slug `#pi-sdk-pin` MUST NOT be renamed; downstream pages will be retargeted at it during the sweep, and any rename fans out a second time across the same surfaces.
- The `typebox` peer-dep entry remains `"*"` per PIC §*`typebox` (the fifth Pi-bundled package)*; this finding does not touch it.
- Out of scope: cross-corpus restatements in `docs/plan_topics/**` — the plan corpus is a separate concern under T24a / T25 / T26's corpus-direction rule. The plan corpus MAY cite the canonical pin by anchor but MUST NOT restate the literal under the same single-source rule once that corpus is in scope.
- The five edits (canonical-site bump, four-file in-corpus consolidation sweep, manifest bump, and the new GOV-12 lock-step sentence) MUST land in a single commit. A partial landing leaves the corpus in a state where the canonical pin and the echoes disagree, which is the failure mode the consolidation is designed to eliminate.

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — independent (corpus-direction sweep and version-literal consolidation are orthogonal)
- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — independent (bare-token sweep and version-literal consolidation are independent)
# T24a — Remove `docs/plan_topics/h1-scaffold.md` cross-links from `spec.md` and `pi-integration-contract.md` (corpus-direction violation)

**Kind:** cross-corpus-boundary, cruft, doc-alignment-broad
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` (2 link sites) and `docs/spec_topics/pi-integration-contract.md` (21 link sites) cross-link `./plan_topics/h1-scaffold.md` / `../plan_topics/h1-scaffold.md` as the normative owner of test-harness wiring, file paths, in-code constant locations, comment grammars, fixture-row shapes, and discriminator literals that the surrounding paragraphs treat as mechanical gates. This inverts the corpus dependency direction: the spec corpus MUST stand on its own so that the plan can be deleted and rebuilt from a given spec without breaking spec content (the same invariant that lets the implementation be deleted and rebuilt from a given spec). The pattern is concrete in PIC's `#sdk-cap-inventory-closure-audit`, `#audit-non-empty-scan-canary`, `#pi-version-bump-procedure` steps 2(a)/2(b)/3/5, `#audit-exemption-mechanism`, the *H1 leaf adoption precondition* paragraph in `#patch-skew-degradation-contract`, and the `#sdk-cap-tool-registration-gating` / `#sdk-capability-inventory` deferrals that name `CAPABILITY_OBLIGATIONS`, `SDK_SURFACE_INVENTORY`, and the `// allow-broad-catch:` / `// allow:` grammars. Each deferral treats a plan leaf as the source of truth for content the spec relies on; together they make the spec corpus uncompilable without a specific plan leaf existing.

Second-order observation: the volume of delegated material (test runner, script names, constant identifiers, fixture file shapes, discriminator string literals) suggests PIC has absorbed a substantial slice of implementation guidance under the label of normative obligation. A clean separation will likely also shrink PIC.

## Solution approach

Audit every occurrence of `plan_topics/h1-scaffold.md` (and bare `H1` / `H1a` token references) in `docs/spec.md` and `docs/spec_topics/pi-integration-contract.md`. For each occurrence, classify the surrounding obligation into one of **four** categories:

1. **Spec-owned semantic obligation already complete in the spec** (e.g. "the runtime MUST refuse to load when the peer-dep range excludes the installed Pi minor", "the seven capability obligations enumerated above MUST all be present on the imported namespace"): keep the obligation, delete the deferral clause and the cross-link. The spec states what; the plan/implementation decides how (which runner, which file, which constant name, which discriminator string) without further spec input.
2. **Pure implementation guidance** (test-runner choice, `package.json` `scripts.test` script name, in-code constant identifiers, fixture file placements, comment-grammar token shape, audit-walker exit-code structure, per-record stdout wire format): delete the paragraph or sentence outright. The spec should not pin these.
3. **Bump-procedure mechanics** (the contributor checklist at `#pi-version-bump-procedure`): the checklist's framing as a contributor procedure that names specific tests, scripts, and constants is itself the defect. Rewrite it as a list of spec-side obligations the contributor must preserve through any bump (peer-dep range update + downstream-prose lock-step under GOV-12; `engines.node` floor equality with the installed Pi minor; capability-presence on the imported namespace; `SessionShutdownEvent['reason']` snapshot consistency), with no naming of the mechanical gates that enforce them.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git and restore into the spec corpus. Where PIC's deferral assumes that a specific contract surface exists (e.g. "the bidirectional `SessionShutdownEvent['reason']` type-equality assertion MUST surface the literal brand string `loom/typecheck/session-shutdown-reason-snapshot` verbatim in the failing `tsc` diagnostic"), the brand string, the bidirectionality requirement, and the typecheck-time surfacing are spec content even though the source-file location of the assertion is not. Where PIC names `SDK_SURFACE_INVENTORY` as the join key for capability/inventory bookkeeping, the *kind-discriminator inventory* (`abortsignal-member`, `namespace-function`, `type-union-snapshot`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`, `load-time-resolution`, `pi-engines-node`, `node-floor`) is a classification of what kinds of contract the runtime makes against the SDK — that classification is spec content; the literal constant name and the source-file path are not. The pre-deletion h1-scaffold.md (recoverable at `git show 657ee76^:docs/plan_topics/h1-scaffold.md`) is the authoritative source for the content shape and obligation wording; classify each candidate fragment by reading the deleted leaf against the surrounding PIC paragraph and asking "would deleting this fragment leave a PIC obligation underspecified?" — if yes, lift the fragment (rewritten to spec-corpus voice) into PIC or into a new spec_topic in the same edit that removes the cross-link.

Apply each classification edit in the same commit as the corresponding link removal; do not leave dangling cross-links pointing at a not-yet-existent plan path. After the audit, both `spec.md` and `pi-integration-contract.md` MUST carry zero references to `plan_topics/h1-scaffold.md` and zero bare `H1` / `H1a` tokens. T03 (the `H1` token in `spec.md`) is the parallel surface for the bare-token sweep.

## Pre-deletion plan-leaf inventory (git-recoverable)

The plan was reset in commit 657ee76 ("pi-loom plan: reset to scaffold + template; clear spec-debt register; remove forensic spec-review docs"). The 25 deleted plan leaves at `657ee76^` are the authoritative source for category-(4) recovery. Per the commit's `--stat` output, the deleted files and line counts:

| Plan leaf | Pre-deletion size | Recovery command |
|---|---|---|
| `h1-scaffold.md` | 56 lines | `git show 657ee76^:docs/plan_topics/h1-scaffold.md` |
| `h2-di-skeleton.md` | 110 lines | `git show 657ee76^:docs/plan_topics/h2-di-skeleton.md` |
| `h3-diagnostics.md` | 23 lines | `git show 657ee76^:docs/plan_topics/h3-diagnostics.md` |
| `h4-extension-shell.md` | 24 lines | `git show 657ee76^:docs/plan_topics/h4-extension-shell.md` |
| `h5-pi-e2e-harness.md` | 16 lines | `git show 657ee76^:docs/plan_topics/h5-pi-e2e-harness.md` |
| `h6-req-ids.md` | 20 lines | `git show 657ee76^:docs/plan_topics/h6-req-ids.md` |
| `m-mvp.md` | 37 lines | `git show 657ee76^:docs/plan_topics/m-mvp.md` |
| `v1-lexer.md` … `v18-cancellation.md` | 27–166 lines each | analogous |

The contributor SHOULD spot-check each git-recovered leaf against the PIC paragraph(s) that cite it before deciding the classification (1) / (2) / (3) / (4) per occurrence.

## Solution constraints

- The corpus rule is asymmetric: the plan corpus is permitted to reference spec topics by anchor (per GOV-10 / GOV-11), and a future plan leaf MAY independently scaffold the H1 horizontal-phase work with a `**Spec**` field citing PIC. This finding does not preclude such a leaf existing; it only requires that the spec corpus does not name it.
- GOV-12 lock-step survives the audit unchanged: where the spec currently asserts "the count is N" against a topic-page enumeration, the integer-count gate's deferral to "the plan corpus" as the normative source of the gate's failure surface (per `governance.md`) is the established pattern and is NOT in scope of this finding — that wording defers to the plan corpus generically rather than naming a specific plan file or leaf, and is treated as a permitted abstraction barrier.
- Out of scope: `docs/plan_topics/conventions.md`'s `H1`-`Hn` / `M` / `V1`-`Vn` reservation — the plan corpus is permitted to coin and own these identifiers.
- Out of scope: T03's three bare-`H1` token rewrites in `spec.md` (co-resolve in the same pass).
- Out of scope: T23's Pi-SDK-pin consolidation and stale-`~0.72.1`-literal bump — that finding's edits commute with this one and need not wait for it.

## Relationships

- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — co-resolve (same corpus-direction defect; T03 sweeps the bare `H1` tokens, this finding sweeps the link-form `plan_topics/h1-scaffold.md` references)
- T23 "Pi SDK version literal `~0.72.1` is duplicated across the corpus and is stale against installed `0.74.1`" — independent (version-literal consolidation is unrelated to corpus boundaries)
# T25 — Bare plan-leaf-ID tokens scatter across `spec_topics/` (`H1`, `V18s`, `V14a`, `V16h`, `V3a`, `V5h`, `V6i`, `V6k`, `V12a`, `V14q`, `V15c`, `V18q`, `MVP`)

**Kind:** cross-corpus-boundary, naming
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

`docs/plan_topics/conventions.md` reserves `H1`–`Hn`, `M`, and `V1`–`Vn` (with their leaf forms) as plan-corpus phase / leaf identifiers. The same identifiers leak into the spec corpus as bare tokens in `docs/spec_topics/*.md` prose, naming the plan leaves the spec is "implemented by" or "verified by". Concretely:

- `H1` — 102 occurrences in `spec_topics/` (chiefly `pi-integration-contract.md`), plus 3 in `spec.md` already covered by T03; the T25 sweep is the `spec_topics/` complement.
- `V18s` — 5 occurrences (`diagnostics.md`'s Closure / Category-2 boundary / Category-8 prefix-suffix anchoring paragraphs, plus the `pinned-constant-unreadable` carve-out, plus the `v18-cancellation.md` deep link addressed by T26).
- `V14a` — 2 occurrences (`diagnostics.md`'s `<uuid>` / `<invocation-id>` rendering convention; the `reload-teardown-timeout` row's `<invocation-id>` recipe).
- `V16h` — 2 occurrences (`pi-integration-contract.md`'s bump-procedure step 6 *Re-validate the provider seed-field table* — the fixture-name `V16h provider seed-field fixtures` appears twice in that paragraph).
- `V3a`, `V12a` — single occurrences each (`frontmatter.md`'s `mode:` paragraph: "every load-phase enforcement point (the MVP slash-handler, V3a frontmatter parsing, V12a subagent spawn)").
- `V5h` — single occurrence (`pi-integration-contract.md` provider-error mapping: "V5h provider-error fixtures").
- `V6i` — single occurrence (`query.md` typed-query example: "V6i's typed-query test suite").
- `V6k` — single occurrence (`pi-integration-contract.md` `masked` predicate: "per V6k").
- `V14q` — single occurrence (`future-considerations.md`: "the V14q test matrix gains a parallel `.md` subagent fixture").
- `V15c` — single occurrence (`type-system.md` variant-to-union row: "the V15c 'narrower callee under wider annotation' case").
- `V18q` — single occurrence (`query.md`: "V18q's `RuntimeEvent`-shape conformance test").
- `MVP` — single occurrence (`frontmatter.md`'s `mode:` paragraph alongside V3a / V12a).

Each occurrence names a specific plan leaf as the verifier or implementer of the surrounding spec content. The spec MUST stand independent of any particular plan: a reader who deletes `docs/plan_topics/**` and rebuilds the plan from scratch must find no broken references in `spec_topics/`, and a plan author who renames or splits a leaf MUST NOT thereby invalidate the spec corpus. T03 addresses the `H1`-in-`spec.md` slice; T25 sweeps the remaining ~114 occurrences across `spec_topics/`.

## Solution approach

Audit every bare plan-leaf-ID token in `docs/spec_topics/*.md` (`H1`, `H1a`-`H1n`, `M`, `Ma`-`Mn`, and any `V` followed by digits and a lowercase letter — including `MVP`). For each occurrence, classify the surrounding obligation per T24a's *four-way* classification (see T24a *Solution approach* and *Pre-deletion plan-leaf inventory* for the recovery procedure) and rewrite accordingly:

1. **Spec-owned semantic obligation** with the plan-leaf ID as the "verified by" naming — drop the leaf-ID naming, state the obligation in spec terms. For example, `diagnostics.md`'s "Boundary-condition test vectors are mandatory for the V18s closing CI gate" becomes "Boundary-condition test vectors are required at the 80/81 code-point boundary"; the existence and identity of the verifying gate is an implementation concern.
2. **Pure implementation guidance** dressed as a spec obligation (e.g. `frontmatter.md`'s "every load-phase enforcement point (the MVP slash-handler, V3a frontmatter parsing, V12a subagent spawn) converge on the same diagnostic" — naming three specific plan leaves as the enforcement points): rewrite to name the enforcement *surfaces* in spec terms (slash-command entry, frontmatter parsing, subagent spawn), not the plan leaves that implement them.
3. **Fixture / test-suite citations** (`V5h provider-error fixtures`, `V6i typed-query test suite`, `V16h provider seed-field fixtures`, `V18q RuntimeEvent-shape conformance test`, `V14q test matrix`, `V15c "narrower callee under wider annotation" case`): drop the leaf-ID prefix; the fixture / test concept can be named without claiming a plan-side owner. Where the citation's only purpose is to claim "tests exist", delete it.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git per T24a's *Pre-deletion plan-leaf inventory*. The clearest candidate in this finding's scope is the `V14a` *naming convention* reference in `diagnostics.md` (`<uuid>` / `<invocation-id>` rendered "in canonical lowercase 8-4-4-4-12 hex form per the convention pinned in V14a"; the same row also stamps the `<invocation-id>` recipe in `reload-teardown-timeout`'s rendering rule, which inherits the convention by transitivity). The hex-form convention is spec content; deleting "per V14a" without restoring the convention orphans the rendering rule. Recover the convention from `git show 657ee76^:docs/plan_topics/v14-tool-calls.md` and lift it into `diagnostics.md` inline (or, if it has cross-topic relevance, into `spec_topics/lexical.md` next to the existing identifier-form rules). The `V18s closing CI gate` references in `diagnostics.md` (placeholder-closure property, Category-2 boundary-condition test vectors, Category-8 prefix/suffix anchoring) similarly need a category-(1) / category-(4) split: the closure obligations themselves are spec content (already pinned in `diagnostics.md`); the *gate's existence as a closure-enforcement mechanism* may carry obligations the spec relied on (e.g. the prohibition on strict-equality assertions against §8-placeholder rows) — spot-check `git show 657ee76^:docs/plan_topics/v18-cancellation.md` for whether the closing-gate definition carries normative content beyond "the gate exists".

After the sweep, `docs/spec_topics/*.md` MUST carry zero matches for the regex `\b(H[1-9][0-9]*[a-z]?|M[a-z]?|V[1-9][0-9]*[a-z])\b` (with the `V1` / `V1.0` / `V1.x` loom-release usages on `Vn.m` form excluded by the trailing-letter requirement). Where a category-(4) recovery lands, the recovered content carries no leaf-ID token — the convention or contract surface is spec content authored at the spec-corpus voice level, not a back-pointer to the recovery-source plan leaf.

## Solution constraints

- Out of scope: `docs/spec.md` `H1` tokens (owned by T03) and the link-form `plan_topics/h1-scaffold.md` references (owned by T24a).
- Out of scope: `docs/plan_topics/conventions.md`'s reservation of these ID spaces — the plan corpus is permitted to coin and own them.
- Out of scope: spec-corpus `V1` / `V1.0` / `V1.x` usages in the loom-release sense.
- The `V14a` convention reference is *not* satisfied by simply deleting "per V14a": the surrounding sentence relies on the convention being defined somewhere. The fix MUST either inline the canonical-lowercase 8-4-4-4-12 hex-form definition into `diagnostics.md` or relocate it to an appropriate spec_topic — leaving the convention undefined is a regression.

## Relationships

- T03 "`H1` is a plan-corpus identifier leaking into `spec.md` prose" — co-resolve (same defect class on the `spec.md` slice; this finding sweeps the `spec_topics/` complement)
- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — co-resolve (the `H1` token sweep on `pi-integration-contract.md` and the link-form sweep on the same file are most cheaply done together; classification of each `H1` occurrence may also subsume the adjacent link-form classification under T24a)
- T26 "Narrative spec→plan deferrals and the `v18-cancellation.md` cross-link in `spec_topics/`" — co-resolve (some `V18s` token sites adjoin the `v18-cancellation.md` link site T26 owns; sweep them together)
- T27 "`governance.md` pervasive plan-corpus dependency (GOV-2 / GOV-7 / GOV-10 / GOV-11 / 'specified in the plan corpus' deferrals)" — same-cluster (parallel corpus-direction defect at higher structural level)
# T26 — Narrative spec→plan deferrals and `v18-cancellation.md` cross-link in `spec_topics/`

**Kind:** cross-corpus-boundary, doc-alignment-broad
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

T24a sweeps `plan_topics/h1-scaffold.md` cross-links from `docs/spec.md` and `docs/spec_topics/pi-integration-contract.md`. A parallel sweep on the same corpus-direction rule turns up further spec→plan references not in T24a's scope:

**Explicit cross-link to a different plan file (`v18-cancellation.md`):**

- `docs/spec_topics/diagnostics.md:77` — the *Closure* paragraph carries `[V18s — Coverage-matrix closing CI gate](../plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate)` as the gate enforcing the placeholder-closure property. The link makes the spec depend on a specific plan file existing at a specific path with a specific anchor.

**Narrative "plan corpus" / "plan leaves" / "plan-side" deferrals in `pi-integration-contract.md`:**

- Line 120 (*Unknown-reason rule* sub-anchor paragraph): the parenthetical "(plus the plan corpus where it cites the same anchor)" inside the inbound-reference-sweep definition.
- Line 125 (*H1 leaf adoption precondition* — partially in T24a's scope): the trailing sentence "if `h1-scaffold.md` has not yet enumerated the four obligations at any given point, that gap is a known-open plan-side delta tracked outside this spec-level contract (and outside this inner review loop)" frames a plan-side process as a spec concern.
- Line 204 (`parameters` row): "loom's respond-repair flow (specified in the plan corpus)".
- Line 242 (Typed queries — two-phase tool-loop): "verified by the tool-call plan leaves in the plan corpus".
- Line 248 (V1 seam — typed-query supported provider set): "and the typed-query-validation and subagent-typed-query plan leaves".
- Line 358 (Conversation drive — subagent mode): "by the subagent-mode plan leaves (specified in the plan corpus) — each row is mechanically asserted by one or more of those leaves".
- Line 795 (Step 0 capability-probe item-5/item-7 verification): "`spec.md` — Orientation — Prerequisites name-links each item back to the obligation here so that plan leaves and tests cite a single anchored source".
- Line 817 (subsection preamble of the bump procedure): "*This subsection is a contributor checklist; the `plan_topics/` links below identify the plan leaves that own the cited build-time assertions.*"

Each of these makes the spec presume a particular plan corpus exists, owns specific responsibilities, and is structured a particular way. None can survive a plan deletion-and-rebuild.

## Solution approach

Treat each occurrence per T24a's *four-way* classification (see T24a *Solution approach* and *Pre-deletion plan-leaf inventory* for the recovery procedure):

1. **Spec-owned semantic obligation** with a plan-corpus deferral that adds nothing to the obligation: delete the deferral. Examples: line 204's "(specified in the plan corpus)" is a back-pointer to *some* plan content with no normative force in PIC; delete the parenthetical. Line 242's "verified by the tool-call plan leaves in the plan corpus" is an assertion that *some* tests exist; delete the clause. Line 358's "by the subagent-mode plan leaves (specified in the plan corpus) — each row is mechanically asserted by one or more of those leaves" frames a plan property; delete the clause and let the spec's own assertion stand.
2. **Cross-link to a specific plan file** (`diagnostics.md:77`): delete the cross-link, retain the closure obligation. The Closure paragraph already states the closure property normatively; the V18s link only names the gate that enforces it, which is implementation. Rewrite "the V18s closing CI gate enforces this closure (see [V18s — …](../plan_topics/v18-cancellation.md#…))" to "this closure is enforced at build time" with no link.
3. **Plan-side process narration** (line 125's "known-open plan-side delta tracked outside this spec-level contract", line 817's subsection-preamble narration): delete the narration. The spec does not need to comment on the state of the plan corpus.
4. **Genuinely normative content the spec relied on, previously held in the plan** — recover from git per T24a's *Pre-deletion plan-leaf inventory*. The candidates most likely to fall into this category from this finding's surface are line 242's "verified by the tool-call plan leaves" (if the tool-call leaves at `git show 657ee76^:docs/plan_topics/v14-tool-calls.md` carried contract surfaces PIC relied on — e.g. specific routing rules between `ModelToolError` and the surrounding query infrastructure), line 248's "typed-query-validation and subagent-typed-query plan leaves" (similarly, `git show 657ee76^:docs/plan_topics/v6-typed-queries.md` and `git show 657ee76^:docs/plan_topics/v12-subagent.md`), and the V18s reference at `diagnostics.md:77` (per the recovery note in T25 item 4). Spot-check each git-recovered leaf against the surrounding PIC paragraph and apply the lift-and-rewrite procedure from T24a item 4. The line-125 "H1 leaf adoption precondition" overlap with T24a is the canonical example: the four fixture-obligation categories named there (`unknown-reason runtime`, `snapshot-only widening`, `narrowing no-regression`, `per-sub-trigger negative-test fixtures`) are spec content that should land in PIC's `#patch-skew-degradation-contract` directly, with their pre-deletion shapes recovered from `git show 657ee76^:docs/plan_topics/h1-scaffold.md`.

After the sweep, both `docs/spec_topics/diagnostics.md` and `docs/spec_topics/pi-integration-contract.md` MUST carry zero matches for `plan_topics/` and zero body-prose matches for the phrases `plan corpus`, `plan leaf`, `plan leaves`, or `plan-side` (the same constraint is the structural twin of T27's `governance.md` sweep, but `governance.md` is governed by T27 not this finding).

## Solution constraints

- Out of scope: `governance.md`'s pervasive "specified in the plan corpus" deferrals (owned by T27 — they raise a different structural question because `governance.md` rules are *about* the plan/spec boundary, not implementation guidance).
- Out of scope: `plan_topics/h1-scaffold.md` cross-links (owned by T24a).
- Out of scope: bare plan-leaf-ID tokens (owned by T25); some `V18s` token references at the `diagnostics.md` link site will be swept by T25 in the same pass.
- The `diagnostics.md` Closure paragraph's normative closure claim ("The eight categories below form the closed V1.0 placeholder-rendering surface") MUST survive intact; only the V18s-naming clause and its cross-link are removed.

## Relationships

- T24a "Remove `docs/plan_topics/h1-scaffold.md` cross-links" — co-resolve (parallel sweep; the `pi-integration-contract.md` deferrals listed in line 125 sit inside the *H1 leaf adoption precondition* paragraph T24a is already restructuring, so the two findings touch overlapping prose)
- T25 "Bare plan-leaf-ID tokens scatter across `spec_topics/`" — co-resolve (`diagnostics.md:77` carries both a `V18s` bare token and the `v18-cancellation.md` link; sweep them together)
