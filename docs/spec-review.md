# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding (T46) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 16 high, 29 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 0 nit dropped; 0 false dropped._

_Decision tally (recorded 2026-05-08): all 18 `Shape: multiple` findings resolved to `Shape: single`. 6 findings merged at decision time: T17→T24, T28→T27, T29→T30, T31→T32, T33→T03, T45→T44. See per-finding **Decision** / **STATUS** lines._

---

# T01 — `V1` denotes two distinct things across the spec and plan corpora

**Original heading:** "V1" terminology collision between spec and plan conventions
**Original section:** docs/spec.md — Document level
**Kind:** doc-alignment-broad
**Importance:** medium

## Finding

`docs/plan_topics/conventions.md` reserves the bare token `V1`–`V18` for plan-phase identifiers and states explicitly: *"When plan prose needs to refer to the initial release of the loom language, write 'loom 1.0' or 'the initial release'; never reuse 'V1' for that meaning."* `docs/plan.md` honours that — `V1` is *Lexer hardening* — and the per-phase pages under `plan_topics/` likewise treat `V1`…`V18` as phase IDs (with the exception of a handful of stray "V1 returns `[]`", "V1 Pi SDK pin" usages in `h2-di-skeleton.md`, `h3-diagnostics.md`, `h4-extension-shell.md`, `h5-pi-e2e-harness.md`, `m-mvp.md` that already breach the convention).

`docs/spec.md` and every page under `docs/spec_topics/` use the bare token `V1` to mean *the initial loom release* — 234 occurrences across 27 spec-topic pages plus the spec.md root (e.g. *"V1 targets Node exclusively"*, *"V1 enums carry string values only"*, *"V1 has no `BinderError` variant"*, *"V1 seam — automatic context escalation"*). A reader who consults both corpora encounters `V1` with two distinct referents and no in-text disambiguation.

Dotted forms (`V1.0`, `V1.x`) and the next-major form (`V2`) are unambiguous — no plan phase carries a dot — and are not part of this finding. The collision is restricted to the bare token `V1`.

## Spec Documents

- `docs/spec.md` — entire file (option-dependent: edited under Option A; read-only under Option B)
- `docs/spec_topics/*.md` — all 27 pages currently containing bare `V1` (option-dependent)
- `docs/plan_topics/conventions.md` — *Vertical slices* paragraph (option-dependent: read-only under Option A; edited under Option B)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The conflict is documentary; no plan leaf's `Tests` or `Ships when` criterion changes under either resolution, and no leaf is blocked by the ambiguity. (The five plan-prose breaches noted above — `V1` used to mean *the initial release* inside H2/H3/H4/H5/M leaves — should be cleaned up alongside whichever resolution is chosen, but they are editorial fixes, not modifications to the leaf's normative content.)

## Consequence

**Severity:** advisory

A reader cross-referencing `plan.md` and `spec.md` will, on first encounter with bare `V1`, have to context-switch to determine which referent applies. No implementer would ship the wrong behaviour because of this — the surrounding prose always disambiguates — but it imposes a cognitive tax on every cross-doc reading session and signals to future maintainers that the two corpora were not co-designed.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Rename in the spec corpus

**Approach.** Sweep `docs/spec.md` and `docs/spec_topics/*.md` replacing bare `V1` with `loom 1.0` (when referring to the released language) or `the initial release` (when contrasting with deferred features), matching the phrasing the convention already prescribes for plan prose. Anchor IDs containing `v1` (e.g. `#v1-seam-binder-refinement-loop`, the `> **V1 seam — <name>.**` blockquote convention) are kept as-is — they are stable IDs, not prose — but their human-visible labels are updated. Dotted forms `V1.0`, `V1.x` and the next-major form `V2` stay as-is.

**Spec edits.** Mechanical search-and-replace across `docs/spec.md` plus all 27 affected `spec_topics/*.md` pages, with manual review of each hit to choose between *loom 1.0* and *the initial release*. The five plan-prose breaches in `plan_topics/h2-di-skeleton.md`, `h3-diagnostics.md`, `h4-extension-shell.md`, `h5-pi-e2e-harness.md`, `m-mvp.md` get the same treatment.

**Pros.** Single, consistent vocabulary across spec and plan; the convention's stated rationale (one token, one referent) is honoured; future readers see no overloading; the `> **V1 seam — <name>.**` blockquote convention is the only construct that retains `V1`, and there it is a fixed phrase tied to anchor IDs.

**Cons.** ~234 spec-prose edits, each requiring a judgement call between the two replacement phrasings; risk of subtle meaning shifts where *V1* was doing work the longer phrasings can't (e.g. *"V1 enums carry string values only"* — does *the initial release* read as "release 1.0 only" or as "the loom language as currently specified"?); the `V1 seam` blockquote convention becomes a lone exception that future readers will question.

**Risks.** Search-and-replace pollution: bare `V1` appears inside multi-word constructs like `V1 seam` (intentional, keep), `V1 Pi SDK pin` (replace), `V1 enums` (replace). Requires per-hit review; cannot be a blind regex replacement.

### Option B — Carve `spec.md` and `spec_topics/` out of the convention

**Approach.** Amend the *Vertical slices* paragraph in `docs/plan_topics/conventions.md` to scope the `V1`-as-phase-ID reservation to *plan prose* (`plan.md`, `plan_topics/`), explicitly noting that `spec.md` and `spec_topics/*.md` use `V1` to mean *the initial release of the loom language* and that this is the older, established usage which the convention does not displace.

**Spec edits.** One sentence added to `docs/plan_topics/conventions.md` (one file, ~50 words). No edits anywhere in the spec corpus. The five plan-prose breaches noted above still need cleanup since they are inside plan files.

**Pros.** Minimal edit surface; no risk of meaning drift; the spec corpus stays as written; the convention's existing reservation continues to hold within the plan corpus where it actually constrains identifier choice (no plan author will ever name a leaf `V1a` and intend "the initial release sub-leaf a").

**Cons.** Cross-doc reading still requires a context-switch on every bare `V1`; the convention now codifies the overload rather than eliminating it; future spec authors retain a token whose meaning depends on which corpus the reader came from.

**Risks.** A new spec page or topic could introduce a usage where context does not disambiguate (the current 234 hits all happen to be unambiguous in context, but that's a property of the current text, not a guarantee for future edits).

### Recommendation

Option A. The convention's stated intent — one token, one referent — is the right policy, and the cost of paying the rename tax once is bounded; the cost of leaving the overload in place is paid on every cross-doc reading session forever. Concretely:

- Replace bare `V1` with `loom 1.0` when the surrounding clause is talking about the *released artifact* (versioning, scope, what ships); use `the initial release` when contrasting with deferred features (*"deferred to a future release"*, *"not supported in the initial release"*).
- Preserve the `> **V1 seam — <name>.**` blockquote convention as a fixed phrase — its `V1` is part of an established anchor-ID-bearing construct, not prose, and renaming it would invalidate every `#v1-seam-…` link.
- Preserve dotted (`V1.0`, `V1.1`, `V1.x`) and next-major (`V2`) forms as-is; they do not collide with any plan token.
- Clean up the five plan-prose breaches (`h2-di-skeleton.md`, `h3-diagnostics.md`, `h4-extension-shell.md`, `h5-pi-e2e-harness.md`, `m-mvp.md`) in the same pass.
- Diagnostic message strings in the registry that read *"…not supported in V1"* (`loom/parse/break-with-value`, `loom/parse/match-guard-not-supported`, `loom/parse/rest-pattern-not-supported`, `loom/parse/nested-fn`) are author-visible output, not internal prose — keep their wire text untouched (renaming would invalidate any external test fixtures that pin the message verbatim) and treat them as a separate, GOV-8-governed message-string change if a future edit wants to align them.

## Relationships

None

---

# T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph

**Original heading:** Subagent state-isolation detail misplaced in Overview
**Original section:** docs/spec.md — Overview
**Kind:** placement
**Importance:** medium

## Finding

The opening orientation paragraph of `docs/spec.md` (the prose immediately under `## Overview`, before the `<a id="terminal-outcomes-aggregator">` paragraph) embeds a parenthetical enumeration of the subagent-mode state-isolation contract: it lists what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's `ExtensionCommandContext`, and what is *not* inherited from the caller — naming five specific axes (`transcript`, `system prompt`, `ambient tool set`, `cancellation controller`, caller's `params` and `bindings`).

This enumeration is the canonical content of the **Subagent state-isolation matrix** that already lives at `docs/spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix` — a three-column table whose explicit purpose is "the canonical enumeration of what the spawned session inherits…". The same Overview sentence already forward-links to that matrix. Restating the axes inline duplicates owner-page content in an aggregator (against the convention recorded at `governance.md` GOV-12) and creates a stale-reference risk: any future change to the matrix's column membership (e.g. the `bind_context: session` seam adding a forwarded axis) must be mirrored in two places. The duplication also triggers two adjacent naming-consistency findings on this same paragraph — `ambient tool set` vs the Session model's `tools:` table, and the cancellation-forwarding fan-in vs the Session model's per-invocation framing — that disappear if the parenthetical is removed.

The product description and the mode contrast (prompt mode drives the caller's conversation; subagent mode drives a separate one) are the right level for the orientation paragraph. The five-axis enumeration is not.

## Spec Documents

- `docs/spec.md` — Overview, first paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — `subagent-state-isolation-matrix` section (read-only)
- `docs/spec_topics/governance.md` — GOV-12 (aggregator-vs-source lock-step) (read-only)

## Plan Impact

**Phases:** Horizontal H6.

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 already retargets every `spec.md`-introduction link whose target is a non-narrative-page section anchor (the matrix's `#subagent-state-isolation-matrix` is one such anchor) to a `PIC-N` REQ-ID anchor. Deleting the parenthetical removes one of the link sites H6 must rewrite; the leaf's tests are unaffected.

## Consequence

**Severity:** advisory

A reader of the Overview gets a five-axis list that omits at least one axis the PIC matrix carries (the matrix populates three full columns; the parenthetical names five items, not aligned to the column structure), and any future seam that touches the matrix must edit two places to stay synchronized. Implementers can still produce a correct subagent-mode wiring by reading PIC; the cost is documentation drift and extra work for the H6 link-rewrite pass and for every later edit to the matrix.

## Solution Space

**Shape:** single

### Recommendation

In `docs/spec.md`'s Overview first paragraph, delete the parenthetical `— what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's ExtensionCommandContext, and what is *not* inherited from the caller (transcript, system prompt, ambient tool set, cancellation controller, caller's params and bindings) —` and reduce the surrounding sentence to a one-line orientation pointer:

> The state-isolation contract for subagent invocation is enumerated in [Pi Integration Contract — Subagent state-isolation matrix](./spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix); the *callable set* concept that matrix references is defined in [Glossary — `callable set`](./spec_topics/glossary.md).

Edge cases for the implementer:

- Keep the existing forward-link target unchanged so the H6 link-retarget pass still has a single edit to make (PIC anchor → `PIC-N` REQ-ID anchor at H6 land time).
- Do not migrate the deleted axis names into PIC. The matrix already covers them; restating them as PIC prose would introduce a new aggregator/owner duplication on the PIC side.
- The terminal-outcomes paragraph that immediately follows is a separate placement issue (see related findings) and is not in scope for this fix.
- The `callable set` glossary pointer is load-bearing for PIC's matrix prose and must be retained.

## Relationships

- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster (broader pattern of misplaced detail in the Overview/Orientation prose).
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — same-cluster (sibling Overview placement issue).

---

# T03 — `semver` dependency obligation buried in a non-normative recipe paragraph

**Original heading:** `semver` not declared as a dependency
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Kind:** assumptions
**Importance:** medium

## Finding

The spec describes the loom runtime's own production dependency on `semver` only inside the parenthetical of a paragraph it explicitly labels *non-normative*. The two `*Recommended recipe (non-normative).*` blocks in `pi-integration-contract.md` (the Step 0 (a) Node-floor check and the Step 0 (d) peer-dep range check) carry the sentence "pinned by H1 as a direct production dependency of the loom package," and that is the spec's only declaration of a `semver` obligation. The `**Host prerequisites.**` enumeration immediately above those recipes lists four items (Pi SDK pin, Binder model, Binder credentials, Pi-supplied `AbortSignal`) and does not include `semver`. The `spec.md` orientation aggregator for Host runtime references the same recipes but explicitly disclaims them ("not a library prescription"), so a reader following the aggregator down sees no dependency obligation at all.

The plan does carry a real `dependencies["semver"]` manifest assertion — it lives in `h1-scaffold.md`'s SDK-surface-inventory test paragraph, alongside an `@types/semver` mention. But the spec gives that test no anchor to assert against: there is no normative sentence saying "the loom package's `dependencies` block MUST contain `semver`," no pinned version range for `semver`, and no statement of why it lands in `dependencies` rather than `peerDependencies`. The two recipe paragraphs simultaneously promise that "a future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted" — which is incompatible with a hard dependency declaration unless the spec separates the comparator *contract* (normative) from the V1 *implementation choice* (a recipe).

The result is a hidden coupling between three documents: PIC's recipe parentheticals are the only spec text that mentions the dep, h1-scaffold.md has the manifest assertion, and `package.json` carries the literal — but no aggregator names `semver` as part of the loom runtime's own dependency surface, and the version range is unstated everywhere except (eventually) the manifest itself.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites; Step 0 (a) Node floor recipe; Step 0 (d) peer-dep range recipe (edited)
- `docs/spec.md` — Orientation > Prerequisites > Host runtime, item 1 (option-dependent)
- `docs/plan_topics/h1-scaffold.md` — SDK surface-inventory test paragraph; `package.json` `dependencies` literal-read assertion (read-only; verifies that a manifest assertion already exists)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf already adds `semver` and `@types/semver` and asserts the `dependencies` entry in its manifest test. Under any chosen option below, the assertion language and the version literal that test pins must align with whatever the spec declares — so H1 is touched, but only at the language/literal level (not in scope of work).

## Consequence

**Severity:** advisory

A fresh implementer reading the spec end-to-end sees `semver` only inside parentheticals labelled non-normative and concludes nothing is obligated. They will then run into the H1 manifest test failing for an undocumented reason, or — worse — they will follow the spec's own escape hatch ("a hand-rolled comparator is permitted") and ship a loom package with no `semver` dep, which the H1 manifest test then fails on without a spec sentence to point at. The implementation gets there either way; the spec is just internally inconsistent about whether the library is required.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option B. Decision-time merge: T33 absorbed (cross-package `engines.node` equality test rides this commit; both edit Host runtime item 1). See T33 stub.

### Option A — Promote `semver` to a formal entry in PIC `Host prerequisites`

**Approach.** Extend PIC's `**Host prerequisites.**` enumeration (currently four items) with a fifth item — *Loom-package production dependencies* — that names `semver` (and `@types/semver` as the dev-dep companion), pins the version range as a literal, and states which `package.json` block the entries live in (`dependencies`, not `peerDependencies`). Keep both `*Recommended recipe (non-normative).*` paragraphs as-is for the comparator-contract framing, but drop the parenthetical "pinned by H1 as a direct production dependency of the loom package" since that obligation now lives in the dedicated entry.

**Spec edits.**
- `pi-integration-contract.md` — add the fifth `Host prerequisites` item; trim the dependency-pinning parentheticals from the two recipe paragraphs.
- `spec.md` — orientation aggregator for Host runtime gains a one-line forward-link to the new fifth entry (per GOV-12 lock-step).
- `h1-scaffold.md` — anchor the `dependencies["semver"]` manifest assertion at the new PIC entry instead of at the recipe paragraph.

**Pros.** Single source of truth for the dep obligation; H1 manifest test has a clear spec anchor; version range becomes auditable from the spec.

**Cons.** Forecloses, in practice, the "future swap to a hand-rolled comparator" the recipes currently promise — the moment `semver` is in `Host prerequisites`, removing it is a spec edit, not a leaf-level implementation choice.

**Risks.** Locks the comparator implementation choice into the spec at V1, which is more prescription than the current text intends.

### Option B — Add a separate "Loom-package dependencies" sub-paragraph that documents V1 implementation choices without making them normative

**Approach.** Below `**Host prerequisites.**` in PIC, add a `**Loom-package implementation dependencies (V1).**` paragraph that lists the V1 implementation choices for the recipe contracts — currently just `semver` — with their version ranges and the `package.json` block they live in, framed as "V1 ships with `semver` as the chosen comparator implementation; a future spec edit may substitute another implementation" so the implementation-choice framing matches the recipe's existing escape hatch. Drop the dependency-pinning parentheticals from the two recipe paragraphs.

**Spec edits.**
- `pi-integration-contract.md` — add the new sub-paragraph; trim the recipe parentheticals; both edits in one commit.
- `spec.md` — no change required; the orientation aggregator already disclaims library prescription.
- `h1-scaffold.md` — anchor the manifest assertion at the new sub-paragraph.

**Pros.** Preserves the comparator-swap flexibility the spec already promised; the dep declaration lives in the document a reader looks at when auditing the loom package's manifest; H1 has a clean anchor.

**Cons.** Adds a small new structural unit ("implementation dependencies") that the rest of the spec does not currently use, which a future reader has to learn.

**Risks.** Low. The framing matches the rest of PIC's recipe pattern.

### Option C — Rewrite the recipe to not require an external library

**Approach.** Replace `semver.satisfies(...)` with stdlib parsing — split `process.versions.node` and the floor `">=20.6.0"` on `.`, parse to integers, compare lexicographically with explicit prerelease handling. Same for the peer-dep range check. The recipe becomes self-contained, the dep disappears entirely.

**Spec edits.**
- `pi-integration-contract.md` — rewrite both recipe paragraphs.
- `h1-scaffold.md` — drop the `semver` / `@types/semver` manifest assertions.

**Pros.** No new dependency surface; one fewer supply-chain edge.

**Cons.** Hand-rolled SemVer comparison with prerelease eligibility is non-trivial and famously easy to get subtly wrong (build metadata, prerelease tag ordering, the `~0.72.1` tilde semantic). The recipe paragraph in PIC would balloon. Re-implementing what `semver` already does correctly is a poor use of the recipe slot.

**Risks.** Subtle SemVer-semantic bugs; the recipe stops being a recipe and becomes a normative algorithm.

### Recommendation

Take Option B. The spec's own framing already separates "the comparator contract" from "the chosen library implementation"; matching that with a dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC keeps the contract/recipe distinction clean and gives H1's manifest assertion a stable anchor. State the version range as a literal (`"^7.0.0"` or whatever H1 lands on) so the H1 literal-read test asserts against a single source of truth. Edge case the implementer must watch: the `@types/semver` entry belongs in `devDependencies`, not `dependencies`, and the new sub-paragraph should call that out so the H1 assertion checks the correct manifest block for each.

## Relationships

- T33 "Node floor `>=20.6.0` not automatically audited against Pi's `engines.node`" — same-cluster (same Host runtime item 1; concerns the floor literal's audit path, not the comparator dependency).

---

# T04 — "Load-bearing" used as an undefined technical qualifier

**Original heading:** "Load-bearing host-shape check" used without definition
**Original section:** docs/spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** clarity
**Importance:** medium

## Finding

The Pi-SDK orientation paragraph in `spec.md` uses "load-bearing" twice in adjacent sentences with two distinct meanings, neither defined and neither anchored in the Glossary:

1. *"…the **load-bearing host-shape check** that `Type.Unsafe` is a callable function is owned by [PIC — Step 0 (e)]…"* — here it qualifies a single named check.
2. *"…the capability probe owned by [PIC — Step 0 (Capability probe)]…, which is **the single load-bearing check**."* — here it qualifies the entire probe and asserts uniqueness.

A reader cannot tell from the prose whether "load-bearing" means (a) any check whose failure causes refusal to register, (b) a check that gates further checks via short-circuit, or (c) the only check with normative status at this site. The two sentences sit close enough that all three readings appear plausible. The same colloquialism recurs throughout `pi-integration-contract.md` (≥10 occurrences across host-prerequisites prose, member surfaces, and `Clock` / `FileSystem` interface descriptions), which compounds the ambiguity rather than localising it.

The probe itself is exhaustively specified at PIC Step 0 (the `(a)→(b)→(c)+(d)→(e)` short-circuit order, the per-failure `details.kind` map, the `loom/load/host-incompatible` emission contract). What is missing is the framing word. "Load-bearing" carries no operational consequence beyond the sentence it sits in; an implementer building from the topic page can still produce a conformant probe.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Pi SDK and capabilities (edited)
- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites; Step 0 (d), (e); `ExtensionContext` / `ExtensionCommandContext` member-surface paragraphs; renderer registration; `Clock` and `FileSystem` interface paragraphs; Pi version-bump procedure (option-dependent — only edited if the global cleanup option is taken)
- `docs/spec_topics/glossary.md` — (option-dependent — edited only if the term is promoted to a defined glossary entry)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — the fix is a wording change in informative orientation paragraphs. No acceptance criterion, surface-inventory test, or capability-probe specification consumed by a plan leaf changes shape.

## Consequence

**Severity:** advisory

A reader of the orientation paragraph cannot pin down whether "the single load-bearing check" means "the only check at extension-factory entry that gates registration" or something narrower. The paragraph is informative and the operative rules live in PIC Step 0, so an implementer can still build a conformant probe; the cost is reader friction and ambient lexical noise across the corpus.

## Solution Space

**Shape:** single

### Recommendation

Drop "load-bearing" from `spec.md` and replace each use with the operational meaning the sentence actually carries:

- For the `Type.Unsafe` sentence: *"…the host-shape check that `Type.Unsafe` is a callable function — which causes the runtime to refuse extension registration on failure — is owned by [PIC — Step 0 (e)]…"*.
- For the closing sentence: *"…the capability probe owned by [PIC — Step 0 (Capability probe)]; on any of its sub-step failures the runtime emits `loom/load/host-incompatible` and skips every factory-time host-binding call."* The "single" qualifier is dropped because the probe is already described as a single named procedure; the "no other gating check at this site" claim, if needed, is carried by PIC Step 0's *On failure: refusal and diagnostic* clause and does not need restating in orientation prose.

Apply the same pass across `pi-integration-contract.md`: replace each "load-bearing" with the concrete consequence it implies in context — typically "checked at extension-factory entry by Step 0" for shape-check sites, "consumed by [section]" for member-surface sites, and "required for [behaviour]" for interface sites. Do **not** add a Glossary entry for "load-bearing"; the term has no single meaning to canonicalise, and a Glossary entry would license further informal use.

Edge cases the editor must watch:

- The `plan_topics/h2-di-skeleton.md` and `plan_topics/h1-scaffold.md` uses of "load-bearing" are inside plan rationale, not normative spec text, and are out of scope for this fix.
- Two PIC sites use "non-load-bearing" as a negation (`pi-integration-contract.md:3` and `:501`) to mark surfaces Pi may revise without spec changes. Replace with "non-contract" or "outside the V1 contract" rather than leaving the negated form behind.
- The `dist/core/index.d.ts` re-export sentence in PIC Step 0 (c) uses "the import path is load-bearing" to mean "the runtime depends on the re-export specifically." Rewrite as "the runtime depends on the `dist/core/index.d.ts` re-export specifically (not on direct import from `@mariozechner/pi-agent-core`)" so the dependency surface is named explicitly.

## Relationships

None

---

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Original heading:** `looms.binderModel` (settings key) vs `bind_model` (frontmatter field) — same concept, different root names
**Original section:** docs/spec_topics/binder.md
**Kind:** naming
**Importance:** medium

## Finding

The concept "the LLM the slash-command argument binder calls" surfaces under three distinct surface conventions that each apply a *different root word*:

- Frontmatter (snake_case): `bind_model`, `bind_context`, `bind_echo` — root `bind_`.
- Settings keys (camelCase, per Pi's settings convention): `looms.binderModel` — root `binder`.
- Diagnostic codes (kebab-case) and section headings / running prose: `loom/load/binder-model-unresolved`, `loom/load/binder-model-not-strict-capable`, `loom/load/binder-model-strict-capability-unknown`, `## Binder model`, `<a id="sdk-cap-binder-llm-model"></a>`, glossary entry `**binder**`, `binder-model resolution failure` — root `binder`.

The per-surface case style (snake / camel / kebab) is governed by clear convention rules already documented in `frontmatter.md` and `discovery.md`, and is not the issue. The issue is the *root-word shortening* `binder` → `bind` that applies inside the frontmatter family but nowhere else, with no rule documenting it. An author who has read the binder topic page (where every reference is "binder model") and then writes frontmatter must know to drop the `er`; an implementer reading `loom/load/binder-model-unresolved` must know that the field the diagnostic asks the author to set is spelled `bind_model`, not `binder_model`. The user-facing remediation hint compounds the cost — it points at *both* spellings in one sentence: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``.

The frontmatter naming convention paragraph in `frontmatter.md` documents the snake_case / hyphen split (Pi-inherited fields keep Pi's hyphens; loom-defined fields use underscores) but is silent on the `binder` → `bind_` shortening. The glossary has an entry for `**binder**` but no entry for `binder model`, so the cross-surface mapping has no canonical anchor.

## Spec Documents

- `docs/spec_topics/glossary.md` — Glossary list (edited)
- `docs/spec_topics/frontmatter.md` — Field contract table; *Naming convention* paragraph; `bind_*` field prose (option-dependent)
- `docs/spec_topics/binder.md` — `## Binder model`; resolution-chain prose (option-dependent)
- `docs/spec_topics/discovery.md` — *Settings file reads* → *Keys read* (option-dependent)
- `docs/spec_topics/diagnostics.md` — `loom/load/binder-model-*` rows; remediation-hint message (option-dependent)
- `docs/spec_topics/pi-integration-contract.md` — `## SDK capability inventory` item 7; anchor `sdk-cap-binder-llm-model`; `modelRegistry` comment (option-dependent)
- `docs/spec_topics/implementation-notes.md` — binder-invocation prose (option-dependent)
- `docs/spec_topics/slash-invocation.md` — short-version paragraph mentioning the resolution chain (option-dependent)
- `docs/spec_topics/future-considerations.md` — `bind_model` → `looms.binderModel` template that the proposed `tool_loop` settings key would mirror (option-dependent)
- `docs/spec_topics/errors-and-results.md` — pre-evaluation failure list, item 4 (read-only)
- `docs/spec.md` — capability inventory bullet 7 (read-only; the prose-side rename is owned by sibling finding *"Binder LLM model" vs "binder model"*)

## Plan Impact

**Phases:** V3, V14, V16

**Leaves (implementation order):**

- V3a — Frontmatter parsing — (modified)
- V14n — Discovery: settings file reads (`looms` array, plus the read mechanism reused by V16e for binder model) — (modified)
- V16e — `bind_model` resolution chain — (modified)

The two test surfaces that name spellings literally are V3a's deferred-frontmatter test (which enumerates `bind_model`, `bind_context`, `bind_echo` verbatim) and V16e's resolution-chain assertions (which name `looms.binderModel`); both update only under Option B. V14n names `looms.binderModel` in its *Adds* prose. Under Option A the leaf bodies remain unchanged in substance.

## Consequence

**Severity:** advisory

Authors must remember a one-letter root-word delta when moving between two adjacent surfaces (frontmatter ↔ settings) that the spec routinely cross-references in a single sentence. No implementer divergence — both spellings are exact strings the runtime matches against — but every author-facing diagnostic and remediation hint that names both surfaces (e.g. `loom/load/binder-model-unresolved`'s remediation message) reads as a typo until the convention is internalised.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Document the per-surface mapping; ship the spelling split as-is

**Approach.** Add one glossary entry that pins the concept and explicitly enumerates the per-surface spellings; extend the *Naming convention* paragraph in `frontmatter.md` with one sentence noting that the `bind_*` family of frontmatter fields drops the `-er` from the prose root `binder` (companion exemplars: `bind_model`, `bind_context`, `bind_echo`).

**Spec edits.**
- `glossary.md`: add a `**binder model**` entry (alphabetised between `**binder**` and `**callable set**`) of the form: *"The LLM the binder calls. Configured per-loom by frontmatter field `bind_model:`, with fallback to settings key `looms.binderModel`. Diagnostic codes and prose use the kebab/space form `binder-model` / "binder model" (see `loom/load/binder-model-unresolved`). The `bind_` prefix on the frontmatter field matches sibling fields `bind_context` and `bind_echo` and is not a separate concept. See: [Slash-Command Argument Binding — Binder model](./binder.md), [Discovery — Settings file reads](./discovery.md#settings-file-reads)."*
- `frontmatter.md` *Naming convention* paragraph: append one sentence to the existing snake-case rule: *"Within the binder-related family, the frontmatter prefix is `bind_` (`bind_model`, `bind_context`, `bind_echo`); the corresponding settings key, diagnostic, and prose forms use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-*`, "binder model")."*
- No changes to wire formats, settings keys, frontmatter field names, or diagnostic codes.

**Pros.**
- Zero churn across the spec corpus and the V3 / V14 / V16 leaves' acceptance criteria.
- Existing diagnostic codes, frontmatter test fixtures, and settings-key constants in already-drafted leaves stay untouched.
- The `bind_*` frontmatter family is internally consistent (three sibling fields all share the same prefix).

**Cons.**
- The mapping must be kept in two places (the glossary entry and the naming-convention paragraph) plus echoed in any remediation hint that names both surfaces.
- Authors still see a one-letter mismatch in remediation messages.

**Risks.** Future binder-related additions (e.g. a hypothetical `bind_seed` or `looms.binderSeedSalt`) inherit the split and the glossary entry must be updated each time.

### Option B — Rename the frontmatter family to `binder_*`

**Approach.** Pre-V1 rename of `bind_model`, `bind_context`, `bind_echo` to `binder_model`, `binder_context`, `binder_echo`, eliminating the root-word delta between frontmatter and the rest of the corpus.

**Spec edits.**
- `frontmatter.md`: rename the three field-contract rows; rename in the *Naming convention* paragraph; rename in the bullet listing the binder-configuration trio.
- `binder.md`: rename in the *Binder model* prose; in the bypass-cases prose (`bind_echo: true` references); in the failure-modes table; and in the *V1 seam — automatic context escalation* note.
- `discovery.md`: rewrite the `looms.binderModel` description to read `binder_model:` for the frontmatter side (the settings key already uses the long root and stays as `looms.binderModel`).
- `diagnostics.md`: rename `bind_model:` references in the `loom/load/binder-model-unresolved` row's *Description* and *Remediation* columns; the diagnostic codes themselves (already `binder-model-*`) do not change.
- `implementation-notes.md`, `slash-invocation.md`, `future-considerations.md`: rename `bind_model:` references.
- `frontmatter.md` *Naming convention* paragraph: re-list the loom-defined snake_case exemplars (`binder_model`, `binder_context`, `binder_echo`, `tool_loop`, etc.).
- Plan leaves V3a, V14n, V16e: rename string literals in *Adds* / *Tests* prose.

**Pros.**
- One root word, one concept; no per-surface mapping to maintain.
- Remediation hints become symmetric (`set 'binder_model:' in frontmatter or 'looms.binderModel' in settings` — only the case style differs, which is the documented per-surface convention).
- Eliminates a recurring author papercut.

**Cons.**
- Touches ≥9 spec topic pages plus three plan leaves; every example `.loom` snippet in the corpus must be re-grepped.
- Spec V1 has not shipped, so this is reversible with no wire-contract impact, but the editorial cost is non-trivial.

**Risks.** Stale `bind_model` references in untouched corners (illustrative examples, README snippets if any) become a rolling cleanup task.

### Recommendation

**Option A.** The split is editorial debt, not a correctness gap; the V1 spec is already late-stage, and the glossary entry plus the one-sentence convention rule reduce the cost of the delta to a single lookup site. Option B's rename touches ≥12 files and three already-drafted plan leaves to retire a one-letter author papercut, with no wire-format or downstream consumer pressure forcing the change. Adopt Option A now; revisit Option B only if a future surface (e.g. CLI flag `--binder-model`) makes the split visible at a fourth surface.

Edge cases the implementer must watch:
- The `**binder**` glossary entry already exists and refers to the *mechanism*, not the *model*; the new `**binder model**` entry is a sibling, not a replacement.
- The `loom/load/binder-model-unresolved` remediation-hint string in `diagnostics.md` is verbatim author-facing and must not be reflowed; if a `See:` link is added, append it after the hint, do not splice it inside.
- `pi-integration-contract.md`'s anchor `sdk-cap-binder-llm-model` is referenced from `spec.md` capability bullet 7; coordinate with future renames there to ensure the rename happens once.

## Relationships

None

---

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Original heading:** Operator role undefined; non-interactive delivery path unstated
**Original section:** docs/spec.md — Orientation (misc / cross-cutting)
**Kind:** assumptions
**Importance:** medium

## Finding

`spec.md` uses *operator* as a first-class failure audience starting at the terminal-outcomes paragraph (line 10, "what an `invoke` parent sees, what a slash caller sees, what the operator observes per channel") and again in the Hard ceilings opening sentence ("addressed to at least one of *loom code*, *the model*, or *the operator*"). Neither site forward-links to a definition; the term is later defined only in `spec_topics/glossary.md`, which binds it tightly to the TUI: "The human running the Pi TUI session that hosts the loom extension … 'operator-facing' means the surface is rendered into the active TUI session via the `loom-system-note` channel." The glossary itself is not on the `Reading order` path and is not referenced from either operator-using site in `spec.md`.

The stronger gap is that the glossary's TUI binding is never reconciled with the call sites the spec already admits exist outside that binding. `overview.md` and `slash-invocation.md` enumerate three invocation sources — slash command, `invoke` from another loom, and "a future loom harness" / "programmatic consumers"; `future-considerations.md` plans for "first-class loom values invocable from non-loom programmatic harnesses." For each non-slash path the spec is silent on what *operator-facing* means. An `invoke` chain originating from a slash dispatch has a session and therefore a TUI operator, but `pi-integration-contract.md` line 386 also notes that `loom-system-note` messages enter the LLM context window via Pi's `convertToLlm` transform, so even within a session the "operator" is one of several consumers of the channel.

The result: a reader trying to pin down whether `loom/host/discovery-degraded-after-shutdown` is observable when no human is attached, or whether a subagent-mode `invoke` chain (whose transcript is private) still has a TUI-visible operator surface, has to infer the answer from scattered passages. The right answer for V1 is straightforward — every loom invocation runs inside an active Pi TUI session bound to one operator, because Pi exposes no other entry point at the pinned `~0.72.1` SDK — but the spec asserts neither the binding nor the V1-only carve-out.

## Spec Documents

- `docs/spec.md` — Overview (terminal-outcomes paragraph), Orientation > Scope > Hard ceilings, Orientation > Scope > Runtime observability (edited)
- `docs/spec_topics/glossary.md` — `operator` entry (edited)
- `docs/spec_topics/overview.md` — Scope of a loom file (read-only; cites "programmatic consumers" / "future loom harness")
- `docs/spec_topics/slash-invocation.md` — prompt-mode invocation paragraph (read-only; same "future loom harness" phrasing)
- `docs/spec_topics/future-considerations.md` — non-loom programmatic harness item (read-only; the deferred-feature anchor the V1 disclaimer points at)
- `docs/spec_topics/pi-integration-contract.md` — System notes / Runtime event channel (read-only; supplies the channel-as-operator-surface contract the glossary leans on)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

H6 (REQ-IDs) explicitly excludes `glossary.md` from per-page anchor insertion as a narrative page, and no other leaf carries acceptance criteria over the operator-role definition or the non-interactive-delivery scope statement. The fix is purely editorial against `spec.md` and `glossary.md`; the runtime emission paths (H4 `loom-system-note` registration, V18q always-log helper, Mb cancellation note) are unaffected.

## Consequence

**Severity:** advisory

Two implementers cannot diverge on observable behaviour from this gap — the spec's emission rules are pinned regardless of who is reading the channel — but a reader auditing spec coverage cannot tell whether non-TUI delivery is unsupported, undefined, or simply unaddressed, and a future contributor adding (e.g.) a `loom test` harness has no anchor for the question "does the always-log set still fire?" The cost compounds with the future `non-loom programmatic harnesses` item in `future-considerations.md`, which assumes a settled operator-role definition to extend.

## Solution Space

**Shape:** single

### Recommendation

Make the V1 binding explicit in two edits:

1. **Glossary.** Append one sentence to the `operator` entry in `spec_topics/glossary.md` pinning the V1 invariant: "In V1 every loom invocation runs inside an active Pi TUI session, so an operator is always present; non-interactive invocation paths (e.g. a future `loom test` harness or non-loom programmatic harness per [Future Considerations](./future-considerations.md)) are out of scope and the operator-facing channel's behaviour outside a TUI session is undefined."

2. **`spec.md` first uses.** On the first use of *operator* in the Overview terminal-outcomes paragraph (line 10) and in the Hard ceilings opening sentence (line 56), add a single forward-link of the form `the operator (per [Glossary](./spec_topics/glossary.md#operator))`. The Runtime observability bullet (line 52) already forward-links the Glossary generically and does not need the per-term anchor.

Edge cases the implementer must watch:

- The V1 carve-out belongs in the Glossary entry, not in a Non-goals section, because the term must remain defined uniformly across the corpus; the consolidated Non-goals section MAY cite it, but the definition is the single source of truth.
- The forward-link target must be an explicit `#operator` anchor on the glossary entry. If the glossary entry has no anchor today, add one in the same edit (an HTML `<a id="operator"></a>` or the anchor convention `glossary.md` already uses for other terms — match what is there).
- Do not extend the disclaimer to cover `convertToLlm` LLM-context entry; that surface is already owned by [Pi Integration Contract — System notes — Custom-message channel persistence and LLM-context entry](./spec_topics/pi-integration-contract.md) and is a property of the channel, not of the operator role.
- The `loom test` reference is to the deferred feature already named in `future-considerations.md` ("Surfacing it for testing, replay, or observability is a future consideration (see `loom test`…)"); use the existing name verbatim rather than coining one.

## Relationships

- T18 "Success-side operator observability is unstated" — same-cluster (overlapping scope: what the operator sees on success vs across non-interactive paths).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (the V1 "no non-interactive delivery path" disclaimer is one of the items the consolidated Non-goals section would cite back to the glossary entry).

---

# T07 — `QueryError.message` content has no normativity rule

**Original heading:** `CancelledError.message` has no normative content
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** testability
**Importance:** medium

## Finding

`CancelledError` declares `message: string` with no template, no example, and no statement about whether the content is implementation-defined. A conformance test cannot assert any specific string, cannot assert non-emptiness, and cannot even assert the field's presence beyond what the schema itself implies.

The same gap is present on every other `QueryError` variant in `errors-and-results.md` — `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, and `InvokeCalleeError` all carry an unannotated `message: string`. The single exception is the panic path: when `InvokeInfraError.cause === "panic"`, the **Panic message string (normative)** rule (lines 112–123) pins `message` to the registered `loom/runtime/*` template. No comparable rule covers any of the non-panic `message` fields, and `ValidationIssue.message` is annotated only with the inline comment `// human-readable summary of the failure`, which is descriptive rather than normative.

The author-facing impact is concrete: the topic's own opening example (line 10) interpolates `${e.message}` into a user-visible string, so authors will write code that depends on this field. Without a rule stating either that content is implementation-defined or that it follows a fixed template, two conformant runtimes can ship messages that diverge arbitrarily, and authors writing portable looms have no contract to write against.

## Spec Documents

- `docs/spec_topics/errors-and-results.md` — `### QueryError variants` and the **Notes** subsection that follows them (edited)
- `docs/spec_topics/cancellation.md` — **Surfacing** bullet that placeholder-renders `message: "..."` (read-only)
- `docs/spec_topics/diagnostics.md` — code registry (option-dependent: edited only under the per-variant template option)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

## Consequence

**Severity:** advisory

Two conformant runtimes can emit different `message` strings for the same failure, and conformance tests have no contract to assert against beyond the discriminant `kind` and the variant's structured fields. Authors who interpolate `e.message` into user-visible output (as the topic's own opening example does) get implementation-dependent behaviour with no spec acknowledgement that this is the intended trade-off.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Single blanket non-normativity rule

**Approach.** Add one paragraph to the **Notes** subsection of `### QueryError variants` stating that `message` content on every `QueryError` variant is implementation-defined and non-normative, with the explicit carve-out that the panic path's template (per **Panic message string (normative)** above) overrides this for `InvokeInfraError` when `cause === "panic"`. Conformance tests MUST assert only on `kind`, the variant's structured fields, and (for the panic carve-out) the registered template.

**Spec edits.**

- One new paragraph in `errors-and-results.md` **Notes**, placed adjacent to the existing `raw_response`/`ToolLoopExhaustedError` notes.
- A one-line cross-reference from `cancellation.md`'s **Surfacing** bullet so the `"..."` placeholder is anchored to the new rule rather than read as a forgotten template.

**Pros.** One edit covers nine variants. No new normative obligations on runtimes. Aligns with how `ValidationIssue.message`'s inline `// human-readable summary` is already framed. Author-portable code is steered toward `kind` discrimination, which is the spec's stable contract anyway.

**Cons.** Author code that interpolates `e.message` into user-visible output gets formally blessed implementation dependence; cross-runtime UX consistency is sacrificed.

**Risks.** Authors who already write `${e.message}`-style messages may be surprised to learn the content is non-normative. Mitigated by the opening example (line 10) being the natural place to add a one-sentence reader caveat.

### Option B — Per-variant message templates in the diagnostics registry

**Approach.** Extend the **Diagnostics code registry** with a `loom/error/*` (or equivalent) section listing one row per `QueryError` variant, each with a normative `Message template` column analogous to the `loom/runtime/*` panic templates. The `message` field on each variant becomes a template-rendered string the runtime MUST emit.

**Spec edits.**

- New code-registry section in `diagnostics.md` with one row per non-panic `QueryError` variant.
- Replace each `message: string` annotation in `errors-and-results.md` with a pointer to its registry row (mirroring how the panic path is documented).
- Refit `cancellation.md`'s `message: "..."` placeholder in the **Surfacing** bullet to the registered template.

**Pros.** Cross-runtime UX consistency. Conformance tests can assert exact strings. Symmetric treatment with the existing panic-message normativity rule.

**Cons.** Substantially heavier obligation on runtimes. Requires designing nine templates with stable placeholder grammar, and binds the spec to wording it cannot revise without a breaking change. Most variants already carry structured discriminator fields (`tool_name`, `cause`, `tokens_limit`, `callee_path`, …) that author-visible UX should compose from; pinning a template makes those fields semi-redundant for display.

**Risks.** Template churn during V1 implementation; placeholder grammar (the closed eight-category system in `diagnostics.md` §73) may need extension to cover error-message interpolations cleanly.

### Recommendation

Option A. The structured discriminant fields on each variant already carry the information author code should branch on, and the panic carve-out remains the one case where wire-stable strings genuinely matter (because the panic source is otherwise opaque to the parent's `match` arms). Implementer must watch one edge: the new rule must explicitly preserve the panic-template normativity for `InvokeInfraError.message` when `cause === "panic"`, and must not weaken the existing wording at lines 112–128.

## Relationships

- T08 "Inconsistent phrasing for the context-overflow failure across schema, wire kind, and user-facing system note" — same-cluster (touches the same `QueryError variants` surface).
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster (cancellation pathway; independent obligation-splitting concern).

---

# T08 — Inconsistent phrasing for the context-overflow failure across schema, wire kind, and user-facing system note

**Original heading:** `ContextOverflowError` / `context_overflow` / "context window exceeded" — three phrasings for one concept
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** naming
**Importance:** medium

## Finding

The same failure mode is described by two competing English phrasings depending on which surface the reader is looking at. The schema variant (`errors-and-results.md` line 209) is `ContextOverflowError`, the wire `kind` is `"context_overflow"`, and prose anchors throughout the corpus (`hard-ceilings.md`, `pi-integration-contract.md`, `binder.md`, `query.md`'s detection heading, `glossary.md`'s always-log entry) consistently say "overflow". The user-facing system-note template in `slash-invocation.md` (the `context_overflow` row of the per-`kind` formatting table, line 42) breaks that pattern with `"loom /<name> returned Err: context window exceeded"`.

Because that table is normative, byte-pinned ("Renderers MUST emit the surrounding template text verbatim"; "Conformance tests MAY assert on the exact rendered string"; "Wording changes are spec-versioned breaking changes"), an implementer matching on `kind: "context_overflow"` to derive the user-facing string has no textual cue — schema, wire kind, and surrounding prose all point to "overflow"; only the table mandates a different word. Once V18i ships with the table's literal text, harmonising it later is a breaking spec-version bump.

The supporting field name `tokens_limit` is unrelated — it names a numeric bound on tokens, not the failure category — and is not in scope for this finding.

## Spec Documents

- `docs/spec_topics/slash-invocation.md` — per-`kind` system-note table, `context_overflow` row (edited)
- `docs/spec_topics/errors-and-results.md` — `ContextOverflowError` variant intro paragraph (line 206) and the `raw_response` notes block (line 290) (edited; prose only)
- `docs/spec_topics/query.md` — Detection of `ContextOverflowError`; the "context window exceeded" phrase on line 285 describing what providers return (edited; prose only)
- `docs/spec_topics/binder.md` — Context-overflow handling paragraph (read-only; already says "context-overflow")
- `docs/spec_topics/pi-integration-contract.md` — Provider error mapping table header "Overflow signature → `ContextOverflowError`" (read-only; already aligned)
- `docs/spec_topics/glossary.md` — always-log entry referencing `context_overflow` (option-dependent; only edited if Option B is chosen and a glossary mapping is added)

## Plan Impact

**Phases:** V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)

V5h, V13, V16n, V18q reference `ContextOverflowError` / `context_overflow` only by schema name or wire kind and are unaffected by a system-note wording change.

## Consequence

**Severity:** advisory

A reader synthesising the user-visible string from the wire `kind` will produce something other than "context window exceeded" and silently fail conformance once V18i pins the literal text. Implementers who copy the slash-invocation row verbatim are correct today, so nothing strictly blocks shipping; the cost is reader friction now and a breaking spec-version bump later if the inconsistency is fixed after V18i lands.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the `slash-invocation.md` `context_overflow` row from `"loom /<name> returned Err: context window exceeded"` to `"loom /<name> returned Err: context overflow"`. Sweep `errors-and-results.md` line 206 ("context-window overflow") and `query.md` line 285 ("context window exceeded") to use the bare phrase "context overflow" so that schema name, wire kind, prose, and user-facing template all read with the same root word. Leave `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` untouched — they already match.

Edge cases for the implementer:

- The edit lands before V18i so its tests pin the new string from the start; if V18i has already shipped, the change is a spec-versioned breaking bump under GOV-12 and the slash-invocation row's "Wording changes are spec-versioned breaking changes" clause.
- No schema name, wire `kind` literal, or field name changes — purely user-facing prose. The renderer's `match` arm on `kind: "context_overflow"` is unaffected.
- The `query.md` line 285 sentence describes what providers return ("recognised provider \"context window exceeded\" error responses"); replace it with a phrasing that names the provider behaviour without quoting, e.g. "recognised provider context-overflow error responses", to avoid implying providers literally emit the string "context window exceeded".

## Relationships

- T07 "`QueryError.message` content has no normativity rule" — same-cluster (touches the same `QueryError variants` surface).

---

# T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

**Original heading:** Binder context `~20 turns` approximate notation contradicts exact bounds in `binder.md`
**Original section:** docs/spec_topics/frontmatter.md
**Kind:** testability
**Importance:** high

## Finding

`binder.md` contains two incompatible specifications of the session-context truncation caps. Line 23 (the `bind_context: session` bullet at the top of the section) reads "the binder additionally receives the last **~20 turns** or **~8000 tokens** (whichever is smaller)". The tildes signal approximation, and "whichever is smaller" suggests an interaction between the two limits that is not what the algorithm actually does.

The normative algorithm later in the same file (Session-context truncation, line 109) pins exact, inclusive bounds: a turn is included iff "the running token total is ≤ 8000 *and* the running turn count is ≤ 20"; the first candidate that would violate either inequality is excluded entirely. The accompanying worked examples include explicit boundary-equality vectors (running total exactly 8000 included; the 21st turn excluded "regardless of its token weight"), and the rendered system-prompt example at line 179 prints "most recent 20 turns / 8000 tokens" with no tildes. The plan leaf V16g writes acceptance tests directly against the exact bounds.

A reader who only consumes the introductory bullet cannot tell that the limits are exact, that both bounds apply jointly (not "whichever is smaller"), or that boundary-equality is inclusive. An implementer or test author working from that bullet alone would be free to round, sample, or pick the tighter cap as a shortcut and still believe they were conformant.

## Spec Documents

- `docs/spec_topics/binder.md` — `bind_context` value list (line 23) (edited)
- `docs/spec_topics/binder.md` — Session-context truncation (lines 107–119) (read-only)
- `docs/spec_topics/binder.md` — Binder system prompt example (line 179) (read-only)
- `docs/spec_topics/frontmatter.md` — `bind_context` row (line 43) (read-only — confirms no quantitative claims live here)

## Plan Impact

**Phases:** V16

**Leaves (implementation order):**

- V16g — `bind_context: session` truncation — (modified)

V16g already cites the exact caps and the worked-example vectors from `binder.md`'s normative algorithm; the leaf itself does not change in substance, but its **Spec.** anchor target is the section whose introductory bullet is being corrected, so the cross-reference must be re-checked after the edit lands.

## Consequence

**Severity:** correctness

Two implementers reading only the bullet would diverge: one might treat the caps as soft targets (rounding turn counts, undercounting tokens), another might enforce "whichever is smaller" as a single binding cap, a third might read down to the algorithm and apply the exact joint inequality. The boundary-equality test vectors in V16g would catch the first two implementations, but only after the implementation work was wasted; the bullet should not invite the divergence in the first place.

## Solution Space

**Shape:** single

### Recommendation

Replace the line-23 bullet with a description that matches the algorithm exactly:

> `session` — prompt-mode-only; the binder additionally receives the most recent caller-session turns whose running total is ≤ 8000 tokens and whose running turn count is ≤ 20, walked newest-to-oldest with whole-turn boundaries (full algorithm and worked examples below).

Drop the tildes, drop "whichever is smaller" (the bounds are an inclusive joint constraint, not a min-of-two), and forward-link to the Session-context truncation subsection so the bullet's role as orientation is unambiguous.

Edge cases the implementer must watch:

- The bullet's revised wording must not re-introduce its own quantitative description that could drift from the algorithm; the numeric literals (8000, 20) and the inclusivity rule live in exactly one place — the Session-context truncation paragraph — and the bullet either restates them verbatim or defers to it.
- The rendered system-prompt example at line 179 (`most recent 20 turns / 8000 tokens`) is also a copy of the same literals and is part of the normative reference rendering; if the bullet is rephrased to defer rather than restate, line 179 still stands as a third site that must stay numerically aligned with the algorithm.

## Relationships

None

---

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Original heading:** Single-string bypass: empty-string argument behavior unspecified
**Original section:** docs/spec_topics/binder.md
**Kind:** testability
**Importance:** high

## Finding

`binder.md` § *Binder bypass* item 2 says: "When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param's value to the entire slash-argument string (with leading and trailing whitespace trimmed) and skips the binder call. AJV validation still runs as a safety net (a string passes by definition; this is just the standard validation path)."

The text is silent on the case where the user supplies no slash argument, or supplies only whitespace. After the trim, the bound value is `""`. AJV with the default `{ type: "string" }` schema accepts `""`; nothing in the bypass paragraph forbids it. But two reasonable implementers will pick different behaviours:

- (a) bind the param to `""` and start the loom (the literal reading of the current text);
- (b) treat the empty trim result as "user supplied no argument" and surface a `needs_info`-style system note (mirroring the binder's required-field semantics, and matching the spirit of `slash-invocation.md` § *No-params overflow*, which already special-cases whitespace-only remainders by collapsing them to "nothing supplied");
- (c) reject as a validation failure on the grounds that an empty string is not a meaningful argument.

The bypass path has no binder call to fall back on, no `needs_info` channel of its own, and no diagnostic code reserved for "bypass loom invoked with no argument", so the choice is load-bearing for both the user-visible surface (does the loom run with `""` or does the user see a system note?) and the test matrix for V3c. The spec must pin one behaviour.

## Spec Documents

- `docs/spec_topics/binder.md` — § Binder bypass → Single-string bypass (item 2) (edited)
- `docs/spec_topics/slash-invocation.md` — § No-params overflow (read-only; provides the precedent that whitespace-only remainders trim to empty)

## Plan Impact

**Phases:** V3

**Leaves (implementation order):**

- V3c — Bypass binder (no-params and single-string forms) — (modified)

## Consequence

**Severity:** correctness

Two implementers reading the current text will plausibly diverge: one starts the loom with the string param bound to `""`, the other suppresses the loom and emits a system note. Loom authors writing single-string bypass looms cannot predict which behaviour Pi-loom will exhibit when the user types `/foo` with no argument, and V3c's test matrix has no row for the empty-trim case.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Bind `""` and run the loom

- **Approach.** Add a sentence to item 2: "When the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts; AJV validates `""` as a `string` (it passes by definition)." No new diagnostic.
- **Spec edits.** One sentence in `binder.md` § *Binder bypass* item 2. No echo-policy change (echo is already auto-suppressed on bypass per V16k). V3c **Adds**/**Tests** gain a row asserting that `/foo` and `/foo   ` both bind `""` and start the loom.
- **Pros.** Faithful to the current literal reading. Cheapest possible bypass — no special case in the runtime. Authors who want to forbid empty input can declare AJV constraints (e.g. `minLength: 1`) once that surface is reachable, or guard inside the loom body.
- **Cons.** Hands the "is empty meaningful?" question to the loom author, who has no spec-blessed way to express "non-empty required" on a bypass-eligible param in V1 (the schema-subset surface for `string` params does not currently expose `minLength`).
- **Risks.** A loom author writing `/define <term>` gets called with `term = ""` when the user mis-types `/define`, and is responsible for the resulting UX. Consistent with the no-params-overflow precedent (whitespace-only trims to empty and is benign).

### Option B — Route empty trim to a system note, do not start the loom

- **Approach.** Add to item 2: "When the slash argument is absent or trims to the empty string, the runtime emits a single `loom-system-note` formatted as `loom /<name>: argument required — this loom takes a single string argument` and the loom does not run. AJV is not consulted." Reserve a diagnostic code (e.g. `loom/run/single-string-bypass-empty-arg`, info-level, no parse/load implication).
- **Spec edits.** Two sentences in `binder.md` § *Binder bypass* item 2; new row in the failure-mode templates table for the bypass-empty case (or a cross-reference noting it is not a binder failure mode); V3c **Adds**/**Tests** assert the system-note text and that the loom never starts.
- **Pros.** Mirrors the binder's `needs_info` semantics for the LLM path: a single-string loom whose argument is required (no default) gets the same "you must supply this" surface whether or not the binder runs. Removes the trap where authors must defensively check for `""` inside every bypass loom.
- **Cons.** Introduces a runtime branch on the bypass path that did not exist before, plus a new system-note template and (likely) a new diagnostic code subject to GOV-3 / GOV-8 governance. Slightly more spec surface area.
- **Risks.** Authors who *want* to accept empty input on a bypass loom (e.g. a `/scratch` loom that opens an empty editor) cannot opt out without giving the field a default — at which point the loom is no longer bypass-eligible (defaults disqualify, per the same paragraph). That regression must be acknowledged.

### Recommendation

**Option A.** The literal reading of the current text already implies "bind `""` and run", and Option A makes that explicit with one sentence and no new diagnostic surface. The `slash-invocation.md` § *No-params overflow* precedent ("whitespace-only remainders trim to empty and emit no note") is the consistent reading for the bypass path: the runtime trims, then proceeds; UX guards are the loom author's responsibility. Pin the AJV-passes-by-definition observation explicitly so the test for V3c can assert it without re-deriving the reasoning.

Edge cases the V3c implementer must cover:

- `/foo` (no characters after the command name) → param = `""`, loom starts.
- `/foo   ` (whitespace only, including tabs) → param = `""`, loom starts.
- `/foo  hello  ` → param = `"hello"`, loom starts (existing path; trim removes leading/trailing whitespace only, internal whitespace preserved).
- Echo is auto-suppressed in all three cases per V16k; no echo line is emitted.
- The note from `slash-invocation.md` § *No-params overflow* does **not** fire here — that note is gated on `params: {}` / absent, not on the single-string bypass path.

## Relationships

None

---

# T11 — `tool_loop` slot accounting on the forced respond turn is internally inconsistent

**Original heading:** CIO-4 vacuous-after-forced-respond behavior implicit, not stated
**Original section:** docs/spec_topics/query.md and docs/spec_topics/hard-ceilings.md
**Kind:** testability
**Importance:** high

## Finding

Three normative sites disagree about how `tool_loop.max_rounds` accounts for the typed-query forced respond turn, and the disagreement is observable at the boundary case `max_rounds: 0`.

- `query.md` — *Tool-call loop bound* states "The forced respond turn for typed queries also consumes one slot," and exhaustion fires "when the cap is reached without the model producing a terminating turn (a plain text turn for untyped queries, a respond-tool call for typed queries)." Read in isolation, the two clauses are compatible only because the forced respond turn is itself a terminating-turn vehicle.
- `frontmatter.md` — `tool_loop` description repeats the "consumes one slot" claim verbatim.
- `plan_topics/v6-typed-queries.md` — V6k pins a **counting formula**: "Total slots consumed by a query = (free-phase rounds) + (1 if a forced respond turn is issued, else 0). Exhaustion fires when total slots would exceed `max_rounds`." Under that formula, a typed query with `max_rounds: 0` consumes 0 + 1 = 1 slot, exceeding 0, and must therefore exhaust before the respond tool's `execute` ever runs.
- `query.md` — *Worked example: depth-6 forced respond at `max_rounds`*, closing paragraph: "With `max_rounds: 0`, no free phase runs (the model gets an empty tool-set per V6k), the forced respond turn is the only turn, and `masked` is omitted on the surfaced event." The phrasing "is the only turn" presupposes the forced respond turn is dispatched and surfaces a result (in the example, the depth-6 `validation` error) — not `tool_loop_exhausted`.
- `hard-ceilings.md` — CIO-4 specifies that ceiling #2 is checked "before the next model turn (or, on a typed query at the final round permitted by `max_rounds`, the forced respond turn) is requested," and the *Depth-6 forced respond at `max_rounds`* worked consequence calls the forced respond turn "precisely the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to."

The CIO-4 wording, the worked examples, and PIC-1's V1 reachable predicate are mutually consistent: the forced respond turn dispatches unconditionally as the terminating mechanism, and the only way the forced respond turn surfaces `tool_loop_exhausted` is the V6k case where the model fails to call the respond tool (`last_tool_name: null`). But the V6k counting formula and the "consumes one slot" prose, taken at face value, predict the opposite outcome at `max_rounds: 0`. A test writer asked "given `max_rounds: 0` and a typed query whose forced respond turn returns a valid payload, must the runtime return `Ok(validated_value)` or `Err(tool_loop_exhausted)`?" cannot answer from the spec without choosing which site to trust. Neither V6k's tests nor the worked example exercise this boundary.

## Spec Documents

- `docs/spec_topics/query.md` — *Tool-call loop bound* and *Worked example: depth-6 forced respond at `max_rounds`* (edited)
- `docs/spec_topics/frontmatter.md` — `tool_loop` field description (edited)
- `docs/spec_topics/hard-ceilings.md` — CIO-4 and *Depth-6 forced respond at `max_rounds`* worked consequence (edited)
- `docs/spec_topics/pi-integration-contract.md` — PIC-1 (d) V1 reachable predicate (read-only; already consistent with the recommended rule)
- `docs/plan_topics/v6-typed-queries.md` — V6k Adds and Tests (edited; counting formula must be reconciled and a `max_rounds: 0` typed-query test added)

## Plan Impact

**Phases:** V6 — Typed queries

**Leaves (implementation order):**

- V6l — Two-phase tool-loop driver for typed queries — (modified; driver MUST dispatch the forced respond turn unconditionally and not consult the slot count to decide whether to issue it)
- V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError` — (modified; counting formula and tests both need the `max_rounds: 0` typed-query case and the rule that the forced respond turn alone never trips ceiling #2 on the slot-accounting path)

## Consequence

**Severity:** correctness

Two implementers reading the spec in good faith will diverge on the `max_rounds: 0` typed-query case: one treating the V6k formula as authoritative and emitting `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`, the other treating CIO-4's "terminating mechanism" wording as authoritative and emitting `Ok(validated_value)` (or `Err({ kind: "validation", … })` on a bad payload). The same divergence affects any non-zero `max_rounds` where a free-phase round was skipped — the behavioural difference between "forced respond is exempt from slot-accounting exhaustion" and "forced respond consumes a slot that can tip the count over `max_rounds`" is observable on every typed query.

## Solution Space

**Shape:** single

### Recommendation

State the rule explicitly on `query.md`'s *Tool-call loop bound* and propagate the wording to the three other normative sites. The substantive rule the existing CIO-4 / PIC-1 / worked-example trio already implies is:

> The forced respond turn for typed queries is the terminating mechanism the runtime routes to when the free phase ends or when CIO-4's `max_rounds`-final branch fires. The slot-accounting check (CIO-4) is **not** evaluated against the forced respond turn itself: the runtime MUST dispatch the forced respond turn whenever a typed query reaches that branch, including when `max_rounds: 0` (in which case the forced respond turn is the only turn issued). The forced respond turn surfaces `Err({ kind: "tool_loop_exhausted", … })` if and only if the model fails to invoke the synthesised respond tool on that turn (the `last_tool_name: null` case V6k already pins); a successful respond-tool invocation surfaces `Ok(value)` on a valid payload or `Err({ kind: "validation", … })` on an invalid one, regardless of the current slot count.

Concretely:

1. Replace the loose "The forced respond turn for typed queries also consumes one slot" sentence in `query.md` *Tool-call loop bound* and the matching sentence in `frontmatter.md` with the rule above. The "consumes one slot" framing is what creates the contradiction; drop it.
2. Tighten V6k's *Adds* paragraph: redefine the counting formula as `slots = free-phase rounds`, with the forced respond turn outside the budget; restate exhaustion as "(slot count would exceed `max_rounds` and the next required turn is a free-phase turn) OR (the forced respond turn was dispatched and the model failed to invoke the respond tool)."
3. Add a normative test vector to V6k's *Tests* line: a typed query with `max_rounds: 0`, frontmatter tools omitted, model invoked once with empty tool-set + forced choice on the respond tool, model returns a valid respond-tool call → MUST return `Ok(validated_value)`; same vector with the model returning a non-respond `tool_use` block (or text under non-strict providers) → MUST return `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`.
4. No edit needed to PIC-1 (d) — its predicate ("after CIO-4's slot increment for the just-completed free-phase round, leaves the `tool_loop` slot count equal to `max_rounds`") is already worded against the *free-phase* slot count and remains correct under the recommendation. The `max_rounds: 0` case (no free-phase round, predicate vacuously false → `masked` omitted) matches the existing worked example.

Edge case the implementer must watch: respond-repair follow-ups already get a fresh `tool_loop` budget per query.md and V13g, so the same rule applies recursively — each follow-up's forced respond turn is exempt from its own follow-up budget's slot-accounting. The "respond-repair follow-ups (V13g) reset the counter" line in V6k's tests already covers the budget-reset side; the exemption rule above carries over without additional text.

## Relationships

None

---

# T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate

**Original heading:** Dual-cap simultaneous breach: `<cap>` value in diagnostic is indeterminate
**Original section:** docs/spec_topics/discovery.md
**Kind:** testability
**Importance:** high

## Finding

`discovery.md` §"Package discovery" → "Edge cases" specifies that the package walk stops "once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`), whichever fires first; on either trip it emits a single `loom/load/discovery-slow` warning that names the root being scanned and the cap that fired." The cap-check site is "before each new candidate-package read attempt."

Both cap predicates are evaluated at the same check site against the same observed state (file count and `Clock.now()`), so a deterministic simultaneous-breach scenario is constructible — e.g. a `FakeClock` that lands exactly on the timeout boundary at the same iteration where the file count first reaches `looms.scanPackagesMaxFiles`. In that case the spec is silent on which predicate is consulted first, hence which string the warning's `cap` payload carries. The `whichever fires first` clause resolves a temporal race in real time but not the simultaneous-true case.

The asymmetric ordering rule the spec already states for the per-read deadline interaction with the global timeout ("the per-read warning is emitted first and the global `loom/load/discovery-slow` warning still fires from the cap-check site at the next candidate") shows the authors recognise the need to nail down ordering when two trip points overlap; the dual-cap case at the cap-check site itself was missed.

A conformance test that asserts the `cap` field's value for the simultaneous-breach case cannot be written from prose alone, and two implementers will reasonably diverge: one will check the cheap arithmetic predicate first (file count), the other will check the time predicate first (since "timeout" is the higher-pressure signal).

## Spec Documents

- `docs/spec_topics/discovery.md` — Package discovery → Edge cases (scan caps paragraph, line ~129) (edited)
- `docs/spec_topics/diagnostics.md` — `loom/load/discovery-slow` registry entry (read-only; only edited if the diagnostic's `details` schema is the chosen surface for the `cap` field)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14m — Discovery: package `looms/` and `pi.looms` — (modified)

The existing V14m `Tests.` cover the file-count cap (2001-package fixture) and the time cap (`FakeClock.advance` past `scanPackagesTimeoutMs`) independently, but no test exercises both predicates being true at the same cap-check iteration. Once the spec fixes an evaluation order, V14m gains one test vector: a `FakeClock` driven so that at the iteration where the file count first equals `scanPackagesMaxFiles`, `Clock.now()` has also crossed `scanPackagesTimeoutMs` — the warning's `cap` field MUST be the spec-mandated string.

## Consequence

**Severity:** correctness

The `loom/load/discovery-slow` warning is observable contract surface and the spec already constrains its `cap` payload to a specific value. Two compliant implementations would emit different `cap` strings for the same input scenario, which breaks any operator log-analysis or test fixture that keys on the `cap` field. Behaviour (the walk aborting) is unaffected; only the diagnostic content diverges.

## Solution Space

**Shape:** single

### Recommendation

Specify in `discovery.md` §"Package discovery" → "Edge cases" that the file-count predicate is evaluated before the elapsed-time predicate at the cap-check site. Reword the existing sentence to:

> The extension stops opening additional `package.json` files once it has either inspected `looms.scanPackagesMaxFiles` files (default `2000`) or spent `looms.scanPackagesTimeoutMs` milliseconds on the walk (default `2000`); the file-count predicate is evaluated first, so when both predicates are true at the same cap-check iteration the file-count cap fires and the warning's `cap` field is `looms.scanPackagesMaxFiles`.

Rationale the implementer needs to know:
- The file-count predicate is a constant-time integer compare against an in-process counter; the time predicate calls through the `Clock.now()` seam. Checking the cheap predicate first is also the natural short-circuit order.
- The ordering only matters at the cap-check site (between candidate reads). The per-read deadline race is a separate site and its ordering rule (per-read warning emitted first, then global `discovery-slow` at the next candidate) already exists and is unaffected.
- A normative test vector belongs in V14m's `Tests.` bullet: a `FakeClock` that advances past `scanPackagesTimeoutMs` on the same iteration the package count first reaches `scanPackagesMaxFiles` MUST emit a `loom/load/discovery-slow` warning whose `cap` field equals `"looms.scanPackagesMaxFiles"`.

## Relationships

None

---

# T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

**Original heading:** "`.warp` `fn` invokes" vs "cross-file `.warp` `fn` call" — contradictory depth-counting qualifier
**Original section:** docs/spec_topics/invocation.md
**Kind:** naming
**Importance:** high

## Finding

The **Invocation depth bound** subsection of `docs/spec_topics/invocation.md` defines the same rule twice with different breadth.

The introductory paragraph (line 77) says the cap counts:

> "both direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes"

The normative *countable-frame* definition two paragraphs later (line 79) says:

> "any direct `invoke(...)` call, any `.loom` callable call dispatched through a `tools:` entry, or **any cross-file `.warp` `fn` call**."

The `cross-file` qualifier is load-bearing. A `.warp` library file may contain several top-level `fn` declarations that call one another; under the introductory wording every such *intra-file* dispatch consumes a depth slot, while under the normative wording only calls that cross a `.warp` file boundary do. Two implementers reading the page in order will therefore arrive at incompatible budgets — and the spec gives no signal which sentence binds.

The same loose phrasing has already propagated to the plan: V18n's *Adds.* bullet describes the cap as "per-chain count of 32 across direct `invoke`, registered-loom calls, and `.warp` `fn` invokes", inheriting the missing qualifier from the intro paragraph rather than the normative definition.

## Spec Documents

- `docs/spec_topics/invocation.md` — Invocation depth bound, intro paragraph (edited)
- `docs/spec_topics/invocation.md` — Invocation depth bound, *countable frames* paragraph (read-only; already correct)
- `docs/plan_topics/v18-cancellation.md` — V18n *Adds.* bullet (edited; mirror of the intro wording)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18n — Panic routing: `invoke` parent surface — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on whether intra-`.warp` `fn` calls consume the 32-slot budget. The bound is a hard runtime ceiling whose breach raises a panic and surfaces as a Pi system note or `InvokeInfraError`; a budget that differs from the spec's intent silently changes which programs hit the ceiling and which do not, in a way that is observable but not obviously attributable to a spec defect.

## Solution Space

**Shape:** single

### Recommendation

Edit the introductory paragraph of **Invocation depth bound** in `docs/spec_topics/invocation.md` so its enumeration matches the normative *countable-frame* definition that follows. Concretely, replace `"and \`.warp\` \`fn\` invokes"` with `"and cross-file \`.warp\` \`fn\` calls"` (and, for parallelism with the normative wording, prefer "calls" over "invokes" so the same noun is used in both places).

The intent — already pinned by the second paragraph — is that intra-file `.warp` `fn` dispatch is *not* countable, matching the treatment of intra-file `.loom` `fn` calls (which are not enumerated as countable frames either). Recursion within a single `.warp` file is therefore bounded only by the host stack (NOCEIL-4 / NOCEIL-3 in `hard-ceilings.md`), not by the `invoke`-chain cap.

After the spec edit, update V18n's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md` to use the same `"cross-file \`.warp\` \`fn\` calls"` wording, so the leaf's acceptance text cannot be read as accidentally testing the broader (incorrect) rule.

Edge cases the implementer must watch:

- A `.warp` `fn` that calls another `.warp` `fn` re-exported from a third `.warp` file: the dispatch resolves cross-file (the callee lives in a different source unit than the caller's body) and counts.
- A `.warp` `fn` invoked from a `.loom` body: the dispatch is cross-file by construction and counts. The current intro wording happens to give the right answer here, which is presumably why the gap has not been caught.
- Self-recursion within a single `.warp` `fn`: same-file, does not count; bounded by the host stack via NOCEIL-3 / NOCEIL-4.

## Relationships

None

---

# T14 — Prompt-mode sequentiality argument has an unstated fourth premise

**Original heading:** Prompt-mode sequentiality guarantee chains three unverified premises
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** medium

## Finding

The Session-model paragraph concludes that *"prompt-mode bodies execute strictly sequentially within a single user session: at most one prompt-mode body … holds an open `pi.setActiveTools` snapshot/restore window at a time"* and supports the conclusion with three pillars: (i) Pi's per-session slash-handler serialisation, (ii) load-time rejection of prompt-mode `.loom` callees in any other loom's `tools:` (so the model cannot fan out parallel prompt-mode tool calls), and (iii) `invoke(...)` to a prompt-mode callee suspends the parent plus "V1 exposes no parallel-`invoke` surface."

Those three pillars only close the user-session axis. They do not, on their own, rule out the obvious back-door: parallel tool calls into the same `.loom` callable can target subagent-mode callees (the spec's own follow-up paragraph affirms this), and a subagent-mode body may itself contain an `invoke(...)` to a prompt-mode child. Whether such a sibling-spawned prompt-mode child can re-enter the user session and contend for `pi.setActiveTools` is the load-bearing question, and the aggregator never asks it. The answer lives in `invocation.md`'s Cross-mode semantics rule (`subagent → prompt` attaches the child to the *subagent's own private* `AgentSession`, never to the user session, and only the `prompt → prompt` cell touches `pi.setActiveTools`), but a reader auditing the sequentiality argument from spec.md alone cannot derive that — the argument's fourth premise is unstated.

The argument is correct given the Cross-mode rule; the gap is in the chain of reasoning the orientation document asks the reader to follow. Sequentiality is a non-trivial property whose violation would produce subtle, hard-to-debug interleavings; an aggregator that asserts it must close every fan-out path explicitly.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (edited)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only)
- `docs/spec_topics/frontmatter.md` — `tools` (read-only)
- `docs/spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only)

## Plan Impact

**Phases:** Vertical V15

**Leaves (implementation order):**

- V15g — Prompt-mode `.loom` callee in `tools:` is load error — (modified)
- V15h — Cross-mode cell: prompt → prompt — (modified)
- V15j — Cross-mode cell: subagent → prompt — (modified)

(modifications limited to extending the test list with a sequentiality assertion — no re-scoping)

## Consequence

**Severity:** advisory

A reader cross-checking the sequentiality claim against the three named pillars will find the chain genuinely incomplete and either (a) lose confidence in the aggregator, or (b) attempt to engineer the missing escape, encounter the Cross-mode rule by accident, and waste review cycles reconstructing the argument. No implementer who follows the linked topic pages will produce divergent runtime behaviour, but the argument as written is not self-supporting.

## Solution Space

**Shape:** single

### Recommendation

Insert a fourth premise in the parenthesised support list, naming the Cross-mode rule that closes the subagent escape, and add a corresponding non-existence test obligation:

1. **Spec edit (Session-model paragraph in `docs/spec.md`).** After the existing item (iii), add: *"and (iv) the rule, owned by [Invocation — Cross-mode semantics](./spec_topics/invocation.md#cross-mode-semantics), that a prompt-mode callee invoked from a subagent-mode parent attaches to the subagent's own private `AgentSession` rather than the user session — so the sibling-subagent fan-out path admitted by the next paragraph cannot re-enter the user session's `pi.setActiveTools` window."* The follow-up sentence that already enumerates "the three potential sources of in-session overlap" can stay as is; the new clause documents *why* a subagent-spawned prompt-mode body is not a fourth source.

2. **Plan edit (test obligation, V15j).** Extend V15j's Tests bullet to include a sequentiality assertion: spawn two concurrent subagent-mode siblings whose bodies each `invoke(...)` a prompt-mode child; assert that neither child issues a `pi.setActiveTools` call against the user session, and that the user session's active-tool set observed at any point during the run equals the snapshot taken before the outer slash invocation. This is the test the recommended spec edit forward-links to.

Edge cases the implementer must watch:

- The new test must verify zero `pi.setActiveTools` calls on the *user* session specifically — `pi.setActiveTools` is a user-session-only API per `pi-integration-contract.md`, but the test must distinguish "no call against the user session" from "no call anywhere" (the subagent's own session uses `customTools` on `AgentSession`, not `pi.setActiveTools`, so the latter check is trivially true and proves nothing).
- The fourth premise should not rephrase the Cross-mode rule; it should cite it. Inlining the rule in the orientation paragraph would re-create the over-prescription pattern that other findings on this page flag.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (different premise of the same argument).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster (touches the same Session-model paragraph; co-edit pass).
- T19 "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" — same-cluster (also concerns the sibling-subagent fan-out path, on the diagnostics axis).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster (same fan-out path, resource-exhaustion axis).

---

# T15 — Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block

**Original heading:** Detailed architecture content in Orientation heading; out-of-scope statements buried in narrative
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** placement, scope
**Importance:** medium

## Finding

The `<a id="session-model"></a>` paragraph under `## Orientation > Prerequisites` is a single ~700-word block that carries five distinct categories of content: (a) the Pi-extension/session binding fact, (b) the `session_shutdown` payload contract and teardown forward-link, (c) prompt-mode strict-sequentiality and its three supporting premises (Pi handler serialisation, prompt-mode-tool rejection, no parallel-`invoke`), (d) tool-table and transcript isolation semantics keyed to mode, and (e) the V1 admission-cap and per-invocation-budget posture. The paragraph also opens with `*Pi SDK and capabilities. Orientation; this paragraph is informative.*` framing inherited from the surrounding subsection, yet its bullets read as load-bearing architectural commitments — the source of truth a reader will reach for when asking "can two prompt-mode looms run at once?" or "are sibling invocations cancellation-coupled?".

Two scope deferrals are buried inside the same paragraph rather than appearing in a Non-goals surface: `"V1 exposes no parallel-invoke surface"` (mid-clause inside premise (iii)) and `"Concurrent user sessions in the same host process are out of scope for V1 because Pi does not support them."` (terminal sentence). A reader scanning Orientation for V1 boundaries cannot find them; they are visible only to a reader who reads the entire Session-model paragraph linearly.

The two halves are separable but related: the architectural detail wants a normative home (Extension Architecture or Implementation Notes), and the scope deferrals want the consolidated Non-goals surface that document-level finding "No consolidated Non-goals section" already calls for.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Session model (edited)
- `docs/spec.md` — new Non-goals (V1) section (edited; created by the co-resolved Non-goals finding)
- `docs/spec.md` — Extension Architecture (edited; gains a Session-model anchor or absorbs detail under Pi Extension Integration)
- `docs/spec_topics/pi-integration-contract.md` — `ActiveInvocationRegistry`, Tool-registration lifetime and visibility, Session-shutdown semantics (read-only; already owns the normative rules being aggregated)
- `docs/spec_topics/implementation-notes.md` — No invocation cap, Per-invocation single-threaded execution (read-only; already owns the disposition)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only; already owns the no-parallel-`invoke` rule)
- `docs/spec_topics/frontmatter.md` — `tools` (read-only; already owns the load-time prompt-mode-callee rejection)
- `docs/spec_topics/future-considerations.md` — Known V1 limitations (read-only; already records the concurrent-user-session deferral)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** None

(The change is confined to the spec.md aggregator's prose organisation. The normative rules being relocated already live on topic pages owned by H4, V12, V15, V18, etc.; no leaf's `Spec` field, `Tests`, or `Ships when` condition changes.)

## Consequence

**Severity:** advisory

A reader looking for the V1 concurrency posture must read the entire paragraph linearly to extract it; a reader looking for V1 scope boundaries cannot find the two deferrals at all without prose-grepping. No implementer derives wrong behaviour — every claim still forward-links to its owning topic page — but the spec.md aggregator fails its own stated job of providing scannable orientation, and the `*informative*` framing is in tension with the load-bearing architectural commitments the paragraph carries.

## Solution Space

**Shape:** single

### Recommendation

Split the current Session-model paragraph into three pieces, in this order:

1. **Keep in `Orientation > Prerequisites > Session model`, reduced to four sentences:** the one-session-at-a-time binding, the `session_shutdown` payload reference, the closed `event.reason` set anchored to the SDK type, and a forward-link to the new architectural home for concurrency semantics. Drop the prompt-mode-sequentiality argument, the tool-table isolation explanation, the admission-cap statement, and the per-invocation-budget statement from this bullet.

2. **Move concurrency semantics into `Extension Architecture` under a new `Concurrency model` subsection** (sibling to Pi Extension Integration), or into `Implementation Notes` as a new `Concurrency model` entry. This subsection owns: the mode-qualified isolation summary (cancellation always independent; transcript and tool-table isolation subagent-only); prompt-mode strict sequentiality with its three supporting premises (i)/(ii)/(iii); the genuine-concurrency-only-between-subagent-invocations conclusion; the cancellation-propagates-downward-only restatement; per-invocation budget scoping. Each clause keeps its existing forward-links to PIC, Implementation Notes, Cancellation, Invocation, and Frontmatter — those topic pages remain the normative owners; this section is an aggregator like the Hard-ceilings bullet.

3. **Lift both scope deferrals into the new `Non-goals (V1)` section** (created by the co-resolved document-level finding) as two bullets:
   - `Parallel invocation surface — V1 exposes no API by which a parent loom can spawn sibling invocations concurrently. (See [Invocation — Cross-mode semantics].)`
   - `Concurrent user sessions in the same host process — Pi binds an extension to one active session at a time and V1 does not work around this. (See [Future Considerations — Known V1 limitations].)`

Edge cases the implementer must watch:

- The new Concurrency-model subsection must keep all eleven existing forward-links intact — this is a reorganisation, not a rewrite. GOV-12 lock-step still applies between this aggregator and the owner pages.
- If the co-resolved Non-goals section has not yet landed, gate this fix on it; do not invent a Non-goals home unilaterally and create a third placement to reconcile later.
- The choice between `Extension Architecture` and `Implementation Notes` as the home for the architectural half follows whatever rule the spec establishes for prompt-vs-subagent-mode-mechanics (the Hard-ceilings aggregator sits in `Orientation > Scope` and forward-links to `Implementation Notes`; either home is consistent with that pattern, but pick one and apply it across the cluster of placement findings).
- The reduced four-sentence Session-model bullet must continue to anchor `<a id="session-model"></a>` so existing inbound links in the Overview's terminal-outcomes paragraph and elsewhere do not break.

## Relationships

- T38 "Non-goals are not consolidated into a single section" — must-follow (the two extracted scope deferrals require the Non-goals surface; T38 must land first).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (identical placement pattern).
- T16 "Trust boundary bullet conflates scope decision with normative contracts and a deferral" — same-cluster (sibling Scope bullet exhibiting the same mixing of categories).
- T18 "Success-side operator observability is unstated" — same-cluster (third instance of the pattern, in the Runtime-observability bullet).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — same-cluster (touches the same Session-model paragraph but addresses content correctness).
- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — must-follow (the three premises being relocated are the ones that need citations; the move is the natural moment to add them).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — must-follow (the admission-cap disposition being relocated is the surface that needs the resource-exhaustion answer).
- T19 "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" — same-cluster (lives in the same architectural area being relocated).

---

# T16 — Trust boundary bullet conflates scope decision with normative contracts and a deferral

**Original heading:** Trust boundary bullet mixes scope decision, normative error contracts, and future-consideration
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Kind:** placement, prescription, scope
**Importance:** medium

## Finding

`spec.md` line 48's `Trust boundary` bullet is introduced as an *informative orientation aggregator* (per the prose immediately above it: "The bullets are *informative orientation*: each one forward-links the topic page that owns the normative contract"). In practice the bullet carries three classes of content that violate that framing:

1. **Restated normative tool-execution contracts.** The bullet inlines the full denial-routing rule (`Err(QueryError { kind: "code_tool", cause: "execution", ... })`), the non-conforming-envelope handling (routed off `CodeToolError` to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"`), the non-settling-Promise behaviour, and the post-cancel late-settlement discard rule. These are owned verbatim by [`tool-calls.md` — Failures / Outcome enumeration (normative)](../../docs/spec_topics/tool-calls.md) and [`pi-integration-contract.md` — Tool execution from loom code](../../docs/spec_topics/pi-integration-contract.md#tool-execution-from-loom-code). Restating them here creates two normative copies that GOV-12 expects to drift.

2. **Inlined SDK-call mechanism.** The bullet names `customTools` array on `createAgentSession` for subagent mode and `pi.setActiveTools` snapshot/restore for prompt mode — packaging-level details that belong to PIC's `Tool-registration lifetime and visibility` and `Conversation drive — subagent mode` sections. The behavioural property the trust-boundary scope decision actually rests on is "the per-mode wiring isolates each loom's callable set from the user session's active tool set" — not the specific Pi APIs that achieve it.

3. **Misplaced future-consideration.** "A per-loom capability model is **out of scope for V1** and is not anticipated by V1; introducing one would require a migration." duplicates the already-owned bullet at [`future-considerations.md` line 97 — No per-loom sandbox or capability model](../../docs/spec_topics/future-considerations.md). A doc-level Non-goals section (called out separately in this review) would be the natural consolidated home; until that exists the deferral lives correctly on `future-considerations.md` and should be a forward-link from the bullet, not a restatement.

The net effect is a ~13-line bullet doing the work of a 2–3 line scope disclaimer plus three forward-links. The scope decision the aggregator exists to record — "V1 has no loom-level sandbox; `tools:` is a model-side allowlist, not a host-process boundary" — is buried in the middle of the prose.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary (edited)
- `docs/spec_topics/tool-calls.md` — Failures / Outcome enumeration (read-only — already owns the routing rules being trimmed from the aggregator)
- `docs/spec_topics/pi-integration-contract.md` — Tool execution from loom code; Tool-registration lifetime and visibility; Conversation drive — subagent mode (read-only — already owns the SDK-call mechanism)
- `docs/spec_topics/future-considerations.md` — No per-loom sandbox or capability model (read-only — already owns the deferral)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is editorial restructuring of a `spec.md` aggregator bullet. The normative contracts being trimmed already live on owner pages that plan leaves cite directly (`tool-calls.md`, `pi-integration-contract.md`, `future-considerations.md`); no leaf's `Spec:` reference, acceptance criteria, or test list is affected.

## Consequence

**Severity:** advisory

The bullet is currently consistent with its owner pages, so no implementer is misled today. The risk is forward: the next time `tool-calls.md` widens the `CodeToolError.cause` enum, or PIC swaps `customTools` for a future Pi API, or `future-considerations.md` revises the capability-model framing, the Trust-boundary bullet becomes a stale duplicate and GOV-12's lock-step convention has to chase it. The bullet's stated role ("informative orientation, each bullet forward-links the owner") is the correct shape; the fix restores it.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the bullet to carry **only** the scope decision plus forward-links. Concretely:

1. Keep the first sentence ("V1 looms execute inside the Pi extension-host process at full Node host-process privilege.") and the scope claim ("V1 imposes no loom-level sandbox.").
2. Reduce the SDK-surface clause to its behavioural content: the four peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin (the literal pin is owned by PIC — drop the `~0.72.1` parenthetical entirely; this aligns with the separate "SDK pin literal restated in aggregator" finding).
3. Keep the "no extra mediation" sentence with its forward-link to PIC.
4. Keep the *callable-set* paragraph but state the behavioural isolation rule ("subagent-mode invocations see only the loom's declared callable set; prompt-mode invocations see the loom's declared callable set unioned with the user session's snapshot for the swap window") and forward-link to PIC's `Tool-registration lifetime and visibility` for the SDK-call mechanism. Drop the inline `customTools` / `createAgentSession` / `pi.setActiveTools` names.
5. Reduce the host-side-denial paragraph to one sentence: "Host-side denials of filesystem, network, or Pi-API access reach loom code through the tool that issued the request; the complete enumeration of observable `execute()` outcomes — including non-conforming return envelopes, non-settling Promises, and post-cancel late settlements — is owned by [Tool Calls — Failures](./spec_topics/tool-calls.md) and [Pi Integration Contract — Tool execution from loom code](./spec_topics/pi-integration-contract.md#tool-execution-from-loom-code); silent success on denial is forbidden." Drop the parenthetical reproductions of `Err(QueryError { kind: "code_tool", cause: "execution", ... })` and `details.kind = "tool-return-shape"`.
6. Replace the closing capability-model paragraph with a single forward-link sentence: "A per-loom capability model is out of V1 scope; see [Future Considerations — No per-loom sandbox or capability model](./spec_topics/future-considerations.md). When a doc-level Non-goals section lands (separate finding), this disclaimer relocates there."

Implementer-relevant edge cases:

- The "build-time SDK surface-inventory assertion" sentence about a future Pi privilege facet stays — it is a scope decision (detection point), not a normative contract on routing. It should remain in the bullet, reduced to one sentence, with the forward-link to `pi-version-bump-procedure` retained.
- Do not delete the *callable set* clarification ("a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox"). That distinction *is* the scope decision and would otherwise be stranded on `frontmatter.md`.
- The `bash` / `read` "illustrative" sentence is editorial colour, not scope-bearing; drop it as part of the slim-down.

## Relationships

- T38 "Non-goals are not consolidated into a single section" — must-follow (the third sub-issue's permanent home is the proposed doc-level Non-goals section).
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (same bullet; orthogonal fix — adds an audit citation rather than restructures placement).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster (the Session model paragraph exhibits the same aggregator-overreach pattern).

---

# T17 — `console.error` teardown sink: unverified and over-prescribed in aggregator

**Original heading:** `console.error` teardown sink: unverified and over-prescribed in aggregator
**Original section:** docs/spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** assumptions, prescription
**Importance:** medium

**STATUS:** Merged into T24 on 2026-05-08. The `console.error` last-resort sink contract is tightened (drop redundant channel/mechanism prose from spec.md aggregator; cite Pi stdio policy in PIC) in the same commit that lands T24 Option A's `loom/host/discovery-degraded-after-shutdown` diagnostic. The body below is retained for traceability; the actionable hardened recommendation lives in T24.

## Finding

The Session-model paragraph in `docs/spec.md` (Orientation > Prerequisites) ends an `event.reason`-routing sentence with a parenthetical that names the teardown-handler sink and the control-flow mechanism inline:

> "…the teardown-handler last-resort sink defined in [Pi Integration Contract — Extension entry point, step 4](./spec_topics/pi-integration-contract.md#diagnostic-emission-isolation) (the rule that pins `console.error` as the channel and wraps every teardown-handler emission in `try`/`catch` so a throw from the sink does not unwind the handler)…"

Two distinct issues sit on top of each other.

**(1) Aggregator over-prescription.** The parenthetical restates the channel (`console.error`) and the mechanism (`try`/`catch`) that PIC's *Diagnostic-emission isolation* rule (`docs/spec_topics/pi-integration-contract.md`, around line 131) already owns verbatim. The aggregator's job at this site is to forward-link the rule and name the behavioural contract — "emissions reach an out-of-band channel and never unwind the teardown handler" — not to duplicate the implementation choices. If PIC's rule changes (e.g. swaps to `process.stderr.write`, or wraps each emission in a small helper), spec.md drifts silently.

**(2) Unverified host assumption.** The choice of `console.error` as the last-resort sink is reasoned about in PIC and `diagnostics.md` purely from the loom side: `pi.sendMessage` may be invalidated mid-teardown, so something other than the SDK channel is needed. Neither PIC nor `diagnostics.md` cites Pi's policy for extension stdio — whether Pi captures, redirects, swallows, or surfaces extension `console.*` writes to the user's terminal. Without that citation, the claim that `console.error` is in fact a *visible* operator surface during teardown is an implicit assumption rather than an established host contract. If Pi captures extension stdio into a buffer that is itself torn down with the extension runtime, the three teardown diagnostics (`loom/runtime/reload-teardown-timeout`, `loom/host/session-shutdown-reason-unknown`, `loom/host/session-shutdown-teardown-step-failed`) reach no operator at all.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Session model (the `event.reason`-routing parenthetical) — (edited)
- `docs/spec_topics/pi-integration-contract.md` — Extension entry point > Diagnostic-emission isolation — (edited)
- `docs/spec_topics/diagnostics.md` — Persistent diagnostics carve-outs and `loom/host/*` namespace prose — (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No current plan leaf implements the `session_shutdown` teardown handler or its three `console.error`-routed diagnostics; H4 establishes the unrelated `sendSystemNote` fallback chain, and V18f / V18r cover file and settings watchers. The fix here is purely an aggregator-wording change in `spec.md` plus a host-policy citation in PIC; neither alters acceptance criteria for any existing leaf.

## Consequence

**Severity:** advisory

If left unfixed, spec.md's parenthetical drifts the moment PIC's *Diagnostic-emission isolation* rule changes shape, and a future reader cannot tell which of the two statements is normative. The unverified stdio assumption is more substantive: an implementer who relies on `console.error` for teardown-time operator visibility may be silently wrong about what reaches the user, and there is no documented fallback if Pi's stdio capture policy makes the channel invisible.

## Solution Space

**Shape:** single

### Recommendation

**In `spec.md` (Session-model parenthetical).** Replace the inline channel-and-mechanism description with a behavioural-contract phrase plus a forward link only:

> "…via the teardown-handler last-resort sink defined in [Pi Integration Contract — Extension entry point — Diagnostic-emission isolation](./spec_topics/pi-integration-contract.md#diagnostic-emission-isolation) (the sink reaches an out-of-band channel and never unwinds the teardown handler)…"

The concrete channel name (`console.error`) and control-flow primitive (`try`/`catch`) MUST live only in PIC. Apply the same reduction at the structurally identical site later in the same paragraph that names "the teardown-handler last-resort sink."

**In `docs/spec_topics/pi-integration-contract.md` (Diagnostic-emission isolation).** Anchor the choice of `console.error` to a Pi-side citation. The rule already enumerates the failure modes the wrapping `try`/`catch` defends against (closed stdio, FD exhaustion, throwing proxy); add one sentence citing the Pi SDK or extension-host documentation passage that establishes Pi does not capture or suppress extension stdio (or, if Pi *does* capture it, name where the captured stream surfaces and confirm operator visibility during teardown). If the citation cannot be produced from the current SDK pin, file the gap as a `loom/host/*` follow-up and state explicitly in PIC that the visibility of teardown-time `console.error` writes is V1-best-effort pending verification at the next SDK pin bump.

**Edge cases for the implementer.** (i) Both spec.md edits are pure wording reductions — no behaviour changes, no new diagnostic codes, no test impact. (ii) The PIC citation is additive: the existing *Diagnostic-emission isolation* contract stays intact; the new sentence only attaches a host-side warrant. (iii) If verification reveals Pi *does* swallow extension stdio, the three teardown diagnostics need a different last-resort sink (e.g. write to a loom-controlled file under `~/.pi/` before returning from the handler), which would be a follow-up finding, not part of this fix.

## Relationships

- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — co-resolve (both edit PIC step 4's per-step isolation paragraph and rely on the `console.error` last-resort sink).

---

# T18 — Success-side operator observability is unstated

**Original heading:** Success-outcome observability and operator-channel obligations undefined
**Original section:** docs/spec.md — Orientation > Scope > Runtime observability
**Kind:** completeness
**Importance:** medium

## Finding

The Runtime observability bullet in `spec.md` and the Runtime event channel section in `pi-integration-contract.md` define the **always-log set** as a closed subset of `QueryError` `kind` values. The set, by construction, covers only failure outcomes. The spec never makes the symmetric statement on the success side: that a loom which terminates with `Ok(v)` emits **nothing** on the `loom-system-note` channel, and that an `invoke` parent's observation of a child's success is purely programmatic (the value flows through the return surface, no operator-visible event is generated). A reader has to infer the absence by exhausting the failure-only enumeration.

The asymmetry is most visible on the slash-invocation surface. For a prompt-mode loom the conversation itself is the user-facing surface (`slash-invocation.md` says explicitly that the final `Ok` value is not surfaced — the user sees the streamed turns). For a **subagent-mode** loom invoked via slash, the operator sees the binder echo before the loom starts, then — on success — silence: the subagent transcript stays private, the return value goes only to the (in V1 always implicit) caller, and no terminal event hits `loom-system-note`. On failure the operator sees the normative top-level `Err` note. Whether that asymmetry is intended (no completion note for subagent slash invocations) or an oversight (a `loom /<name> completed` parity note was forgotten) is left to implementer judgement.

The third sub-question raised by the original framing — what the operator sees during the session-shutdown abort-and-await window — *is* covered: `pi-integration-contract.md`'s `session_shutdown` block specifies `loom/runtime/cancelled-by-session-shutdown` (E, runtime, `display: false`) for invocations that cancel cleanly inside `SHUTDOWN_AWAIT_CAP_MS`, and `loom/runtime/reload-teardown-timeout` for those still in flight at the deadline. The remaining gap is the success side and the `invoke`-parent success-observation rule; the spec should state both as explicit null-policies rather than leaving them as inferences from a failure-only inventory.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Runtime observability (edited)
- `docs/spec_topics/pi-integration-contract.md` — Runtime event channel (edited)
- `docs/spec_topics/slash-invocation.md` — Once a loom is invoked / Top-level `Err` in prompt mode (edited)
- `docs/spec_topics/invocation.md` — Final-value propagation across callees (read-only)
- `docs/spec_topics/glossary.md` — `always-log set` entry (read-only)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18i — Per-`kind` formatting for prompt-mode top-level `Err` — (modified)
- V18q — Runtime event channel and always-log emission — (modified)

V18q already asserts that the four excluded `kind`s emit zero events; the same leaf needs an additional assertion that a successful prompt-mode and subagent-mode termination emits zero events on `loom-system-note` (the success-side null-policy). V18i is touched only if the recommendation below adds a parity completion note for subagent-slash success; under the recommendation as written it stays read-only.

## Consequence

**Severity:** advisory

A literal reader of the always-log set will conclude "no success event," which is the intended behaviour, so two implementations will not silently diverge on the wire. The cost is operator UX: a slash-invoked subagent loom produces a binder echo, then nothing visible until the user notices the prompt has returned. Reviewers and authors looking for the operator-visibility contract have to triangulate across `spec.md`, `pi-integration-contract.md`, `slash-invocation.md`, and `invocation.md` to convince themselves that the absence is deliberate.

## Solution Space

**Shape:** single

### Recommendation

State the success-side null-policy explicitly in two places, and leave behaviour unchanged.

1. **`pi-integration-contract.md` — Runtime event channel.** Append a short paragraph immediately after the always-log-set enumeration: *"Successful terminal outcomes (a loom whose body produces an `Ok` final value, including a child loom whose `Ok` flows to its `invoke` parent) emit no event on the `loom-system-note` channel. The channel is failure-only by design; success surfaces are the driven conversation (prompt mode) and the programmatic return value (every mode). This is the success-side counterpart of the always-log set's failure inventory."*

2. **`slash-invocation.md` — Once a loom is invoked.** Add one sentence to each of the prompt-mode and subagent-mode bullets making the operator-side null explicit. Prompt mode: *"No `loom-system-note` is emitted on successful termination; the conversation is the operator-visible surface."* Subagent mode: *"On successful termination the operator sees no terminal note (the subagent transcript is private and the return value reaches only the programmatic caller); the operator-visible surfaces in subagent slash invocations are the pre-start binder echo and, on failure, the top-level `Err` note formatted per the table below."*

3. **`spec.md` — Runtime observability bullet.** Replace "*Operator*-facing runtime failure events are emitted…" with a one-clause widening: "*Operator*-facing observability of loom termination is failure-only on the `loom-system-note` channel; the always-log set… (existing text). Successful terminations emit nothing on this channel — see [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md) for the explicit success-side null-policy and [Slash-Command Invocation](./spec_topics/slash-invocation.md) for the per-mode operator surfaces."

4. **`invocation.md` — Final-value propagation across callees.** No edit required; the existing "On callee failure …, no final value flows in either mode — the caller observes only the `InvokeCalleeError` / `InvokeInfraError` envelope" sentence is the programmatic-side counterpart and reads correctly once the operator-side null is stated centrally.

5. **V18q tests.** Add a leaf-internal test asserting zero `loom-system-note` emissions on a successful prompt-mode loom and on a successful slash-invoked subagent-mode loom, mirroring V18q (b)'s structure for the four excluded kinds.

Edge case the implementer must watch: the binder echo (`bind_echo: true`) and the no-params overflow note are pre-evaluation surfaces and remain operator-visible regardless of terminal outcome; the success-side null applies only to the *terminal* surface, not to the per-loom pre-start surfaces. The recommendation deliberately does not add a "completed" parity note for subagent slash invocations — the existing failure-only convention is intentional, the binder echo already attributes the invocation to the operator, and adding a success note would re-open the deferred aggregation/latency surface that `pi-integration-contract.md` and `future-considerations.md` have already scoped out of V1.

## Relationships

- T19 "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" — same-cluster (operator-surface gap on the failure side; symmetric to this finding's success-side gap).
- T06 "Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers" — same-cluster.

---

# T19 — Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule

**Original heading:** Concurrent subagent sibling failure: no aggregation rule for parent or operator surface
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** high

## Finding

When a query in a parent loom emits parallel tool calls into the same `.loom` callable, the runtime spawns N independent subagent-mode sibling invocations (`tool-calls.md` Concurrency section; `pi-integration-contract.md` re-entrant adapter rule and `ActiveInvocationRegistry` Per-mode concurrency invariants). Each sibling that fails for an always-log reason emits its own `loom-system-note` with `display: false` and a `RuntimeEvent` payload defined in `pi-integration-contract.md` Runtime event channel.

The `RuntimeEvent` shape carries `loom: string` (the slash name) but no per-invocation correlation key. When two sibling invocations of `/code-review` run concurrently and both fail, the operator stream contains two notes whose `(loom, kind, query_site, message)` tuples are identical and whose `occurred_at` values may be arbitrarily close; an operator scanning the stream cannot tell which note belongs to which sibling, and consumers cannot stitch a sibling's diagnostic to its tool-call-id in the parent's transcript.

The spec is also silent on two adjacent timing questions that surface only under sibling concurrency: (a) whether a sibling's always-log emission appears on `loom-system-note` at the moment of failure (origin-site emission per V18q) or is somehow held until the parent's tool-loop round closes — `pi-integration-contract.md`'s Deduplication and lifetime rules pin "exactly once per origin" but say nothing about ordering across concurrent origins; (b) whether the always-log channel is per-invocation or session-flat, which determines whether the dedup key `(kind, query_site, message, occurred_at)` is computed per-sibling or globally (two siblings with the same `query_site` that fail at the same `Clock.now()` tick would dedup to one if the key is global). Cancellation propagation (downward only, sibling-independent) is pinned; sibling failure surfacing is not.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (read-only — concurrency disposition forward-links to PIC and the always-log channel)
- `docs/spec_topics/pi-integration-contract.md` — `ActiveInvocationRegistry` Per-mode concurrency invariants; Runtime event channel; `RuntimeEvent` payload shape; Deduplication and lifetime rules (edited)
- `docs/spec_topics/diagnostics.md` — `loom-system-note` `details` payload shapes (edited under Option A; read-only under Option B)
- `docs/spec_topics/tool-calls.md` — Concurrency section (read-only — establishes the sibling-spawn surface)
- `docs/spec_topics/glossary.md` — `RuntimeEvent` / always-log set entries (option-dependent — touched only if a new field is added)
- `docs/spec_topics/future-considerations.md` — operator-stream aggregation deferral (option-dependent)

## Plan Impact

**Phases:** V12, V14, V15, V18

**Leaves (implementation order):**

- V12a — `mode: subagent` accepted; AgentSession spawn — (modified — the subagent spawn site is the registry-insertion point that must source the per-invocation correlation key under Option A)
- V14e — Pi tool wired into `@` queries as model-callable — (modified — the parallel-tool-call path into a `.loom` callable is the dominant sibling-spawn surface; tests must cover concurrent-sibling failure interleaving)
- V15g — `invoke(...)` to subagent-mode callee — (modified — the second registry-insertion site for sibling-bearing concurrency under Option A; read-only under Option B)
- V18q — Runtime event channel and always-log emission — (modified — owns the `RuntimeEvent` payload shape, the emission helper, and the dedup-key rule that all need adjustment; tests must cover the concurrent-sibling case explicitly)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will add an ad-hoc per-invocation tag (process-local counter, `crypto.randomUUID`, or a `loomAbort` identity hash) to disambiguate sibling notes; another will leave the surface as-is and accept that an operator looking at two failing siblings of `/code-review` sees two indistinguishable notes. The dedup-key question compounds: if `(kind, query_site, message, occurred_at)` is computed globally, two siblings failing at the same fake-clock tick collapse to one note and one of the siblings' failures vanishes from the operator stream — the V18q test (l) explicitly relies on `FakeClock.advance` to force distinct `occurred_at` values, but two real siblings on a real clock can hit the same millisecond.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Add `invocation_id` to `RuntimeEvent` and pin per-invocation channel scope

Approach. Add a required `invocation_id: string` field to `RuntimeEvent`. The id is sourced at the `ActiveInvocationRegistry` insertion site (slash-handler entry, `tool.execute(...)` adapter entry, `invoke(...)` spawn site) and stored on the registry entry alongside `loomAbort` and `disposeBarrier`. The emission helper reads it from the per-invocation context and includes it on every always-log event from that invocation. The dedup key is widened to `(invocation_id, kind, query_site, message, occurred_at)` so per-sibling dedup is structurally correct regardless of clock collisions.

Spec edits. (1) In `pi-integration-contract.md` `ActiveInvocationRegistry`, extend the entry shape to `Set<{ loomAbort: AbortController; disposeBarrier: Promise<void>; invocationId: string }>` and pin the id-derivation rule (e.g. `crypto.randomUUID()` at insertion; the same id is used for the entry's lifetime). (2) In the `RuntimeEvent` declaration, add `invocation_id: string;` as a required additive field and note it on the additive-only contract. (3) In Deduplication and lifetime rules, widen the dedup key to include `invocation_id` and state explicitly that the always-log channel is session-flat at the wire level but the dedup key is per-invocation. (4) In Per-invocation operator visibility, populate `details.event.invocation_id` on `cancelled-by-session-shutdown` so teardown notes are correlatable. (5) Add one paragraph stating that sibling always-log emissions appear on `loom-system-note` in real time at the originating site (no batching, no aggregation, interleaving order is the JavaScript event-loop scheduling order — non-normative for tests, observable for operators).

Pros. Small, additive, consistent with the additive-only `RuntimeEvent` contract. Implementable inside V18q's existing emission helper. Fixes the dedup-collision problem on a real clock. Forward-compatible with future aggregation/correlation features in `future-considerations.md` (e.g. tool-call-id correlation).

Cons. Adds a required field, so V18q test (f) and the JSON-stringify-tolerant assumptions of the dedup-key tests need updating. The id is opaque to operators — a follow-on rendering rule would be needed to make it useful in transcripts (likely deferred to a renderer concern).

Risks. Two registry entries must never share an id (covered by `crypto.randomUUID` collision-resistance, which is the same assumption the V1 SHA-256 schema-slug rule already takes). The `cascade-twin re-emission` rule must copy `invocation_id` verbatim like `occurred_at` and `masked` — easy to miss without an explicit rule.

### Option B — Disclaim sibling demultiplexing for V1; pin only the timing rule

Approach. State explicitly that V1 does not provide per-sibling correlation on the operator channel: notes from concurrent siblings of the same loom are indistinguishable in the operator stream, and operators relying on sibling identity are out of scope. Add only the two timing rules: (1) sibling always-log emissions surface in real time at the originating site, not batched into the parent's tool-loop round; (2) the always-log channel is session-flat and the dedup key is per-emission-site (as today) — sibling collisions on `occurred_at` are accepted as a V1 cosmetic limitation. Forward-link to `future-considerations.md` for the eventual correlation surface.

Spec edits. (1) In `pi-integration-contract.md` Runtime event channel, add a "Concurrent sibling invocations" paragraph stating the disclaimer and the timing rule. (2) In `future-considerations.md`, add an entry for "Per-invocation correlation on the operator channel" as a deferred surface extension. (3) In `pi-integration-contract.md` Deduplication and lifetime rules, add an explicit note: when two distinct origins produce byte-identical `(kind, query_site, message, occurred_at)` tuples (the sibling-collision case), they are intentionally collapsed at the consumer-side dedup, accepted as a V1 cosmetic limitation.

Pros. Zero `RuntimeEvent` shape change. No new field for the V18q helper or for tests to cover. Aligns with V1's "operator-facing channel is intentionally write-only" disposition.

Cons. The dedup-collision case silently drops a sibling failure from the operator stream — an operator triaging "why did my parallel batch of 4 only show 3 failures?" gets no answer. Two implementers could still diverge on the timing rule's interpretation if it is stated only as prose ("real time"); a test vector is needed.

Risks. The "cosmetic limitation" framing may not survive contact with operators using `/loom` looms in production fan-out scenarios; revisiting in V1.x then becomes a `RuntimeEvent`-shape change, which the additive-only contract permits but which has a higher coordination cost than landing it in V1.0.

### Recommendation

Option A. The cost is one field on the `RuntimeEvent` payload and one entry-shape extension on the registry; both are additive and land cleanly in V18q. Implementers must remember three things: (1) the cascade-twin re-emission rule extends to `invocation_id` (copy verbatim, never re-derive at the boundary site); (2) the registry's id-derivation rule must run inside the **Dispatch-site setup wrap** `try`/`catch`, before any awaitable work, so a setup-time throw still has an id available for the `internal-error` emission; (3) V18q test (l) — which uses `FakeClock.advance` between iterations to force distinct `occurred_at` values — should be supplemented with a same-tick concurrent-sibling test that exercises the per-`invocation_id` dedup arm without advancing the clock.

## Relationships

- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster (both touch the unbounded-concurrent-sibling surface; admission cap vs observability).
- T18 "Success-side operator observability is unstated" — must-precede (any decision to add operator-visibility for successful sibling outcomes will want to reuse the `invocation_id` field this finding adds).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster.

---

# T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes

**Original heading:** No admission cap: resource exhaustion on concurrent subagent invocations is unspecified
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** error-model
**Importance:** medium

## Finding

The spec commits to "no admission cap, no scheduler interposed above Pi's event loop" for in-flight invocations (`spec.md` Session model → `implementation-notes.md#no-invocation-cap`). The only resource-exhaustion class that paragraph names is heap memory: catchable host-allocation `RangeError`s route through `loom/runtime/internal-error` (NOCEIL-3 carve-out), uncatchable V8 heap-OOM terminates the host. That coverage is partial. Two other classes that scale with concurrent-subagent fan-out are not addressed:

- **OS-level descriptor / handle exhaustion** (`EMFILE`, `ENFILE`, ephemeral-port exhaustion, child-process slots). These manifest as JavaScript exceptions thrown from Pi-internal I/O or from the provider transport layer; nothing in `errors-and-results.md` or `hard-ceilings.md` names them. They will today fall through `loom/runtime/internal-error` (per the runtime-defect-surface paragraph in `errors-and-results.md`), but the operator has no signal that descriptor pressure — rather than a runtime defect — is the cause.
- **Provider rate-limit / quota storms.** Each per-query 429 surfaces as `TransportError { http_status: 429, retryable, ... }` to the loom that issued it. Under fan-out, N siblings each receive an isolated `TransportError`; there is no aggregation surface, no operator-facing "many siblings rate-limited at once" diagnostic, and no per-class accounting in the `loom-system-note` channel.

The result: under concurrent-subagent pressure, the first observable failure is host-process-level (OOM kill, EMFILE storm) or N independent in-loom `TransportError`s with no operator-facing correlation. The closed disclaimer in `implementation-notes.md#no-invocation-cap` ("the rule does not promise resource unboundedness") only names heap-OOM; the other classes inherit the disclaimer by silence, and the operator surface for diagnosing pre-exhaustion is empty.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (read-only; the disclaimer lives on the owner page)
- `docs/spec_topics/implementation-notes.md` — `no-invocation-cap` paragraph (edited)
- `docs/spec_topics/hard-ceilings.md` — NOCEIL-3 (read-only; partition reference)
- `docs/spec_topics/errors-and-results.md` — runtime-defect surface and `TransportError` (read-only)
- `docs/spec_topics/diagnostics.md` — code registry (option-dependent — option B adds one row)

## Plan Impact

**Phases:** V18 (under option B only)

**Leaves (implementation order):**

- V18m — top-level interpreter `internal-error` wrap — (option-dependent; under option B, augment with descriptor/EMFILE classification or add a `loom/host/resource-exhausted` emission path)
- V18n — `invoke`-boundary `internal-error` wrap — (option-dependent; same as V18m)

(Under option A — disclaim only — no leaves are modified; the change is purely spec prose.)

## Consequence

**Severity:** advisory

Under load (a parent fanning out parallel tool calls into many subagent-mode `.loom` callees), the operator sees either an opaque host crash (descriptor / port exhaustion at the OS layer) or an undifferentiated burst of `TransportError`s with `http_status: 429`. Both are diagnosable — the former via host logs, the latter by inspecting per-invocation diagnostics — but neither surfaces "the runtime is at a resource ceiling" as an actionable signal. Two reasonable implementers diverge silently: one will add a watchdog or a soft semaphore, the other will rely on the spec's "no admission cap" wording and ship without one.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A.

### Option A — Widen the existing disclaimer

**Approach.** Extend the `implementation-notes.md#no-invocation-cap` parenthetical so the disclaimer enumerates the classes it covers, not just heap-OOM. Pin the operator-facing surface as `loom/runtime/internal-error` for catchable cases (EMFILE, port exhaustion thrown into JS) and host-process termination for uncatchable cases. Cross-reference `TransportError` (`errors-and-results.md`) as the per-query rate-limit surface and explicitly state that V1 has no aggregation surface across siblings.

**Spec edits.**
- `implementation-notes.md`, `no-invocation-cap` paragraph: replace `(host-OOM and analogous below-runtime exhaustion still route through loom/runtime/internal-error per [Errors and Results])` with an enumeration: heap (NOCEIL-3 partition), descriptor / port / child-process-slot exhaustion (catchable → `loom/runtime/internal-error`; uncatchable host fatals out of scope), provider rate-limit / quota (per-query `TransportError`; no aggregation across siblings in V1).
- `spec.md` Session model: no edit (the disclaimer remains owned by the linked paragraph).

**Pros.** No new diagnostic code; no test surface in V18; closes the silence by being explicit about which classes inherit the disclaimer.

**Cons.** Operators still get no pre-exhaustion warning — only post-failure routing. Cross-sibling correlation remains absent.

**Risks.** A future reviewer reads "covered by `internal-error`" and concludes descriptor exhaustion is observable through that code, when the diagnostic carries `error.message` with no `details.kind` distinguishing it from any other host throw. To mitigate, recommend that the lowering wrapper in V18m / V18n stamp a `details.kind = "host-resource-exhaustion"` discriminator when the underlying error matches a curated list of `EMFILE`, `ENFILE`, `ENOBUFS`, `ECONNREFUSED`-from-port-exhaustion, etc. — but this drifts toward option B.

### Option B — Add `loom/host/resource-exhausted` (W, runtime)

**Approach.** Introduce a dedicated diagnostic code emitted on a registry-level threshold crossing (e.g. concurrent-subagent count above some operator-configurable seam, or descriptor-pressure heuristic from `process.report.getReport().libuv` / `posix_resource` poll). Carries `details.kind ∈ { "memory", "descriptors", "provider-rate-limit", "concurrent-subagents" }` and `details.snapshot` with the measured value vs. seam. Emitted once per crossing, deduped while above the threshold.

**Spec edits.**
- `diagnostics.md`: add `loom/host/resource-exhausted` registry row (severity `W`, phase `runtime`).
- `implementation-notes.md`: pin the threshold seam (suggest `concurrent-subagents` as the only V1 measured class; descriptors and rate-limit deferred to a V1 seam) and the dedup rule.
- `spec.md` Session model: amend the no-admission-cap sentence to forward-link to the new diagnostic.

**Pros.** Operator gets a pre-exhaustion warning. The `details.invocation_id` correlation surfaced by the related sibling-failure finding can ride the same emission. Designs in a per-class accounting hook for V1.x extension.

**Cons.** Introduces a new code, a new threshold seam (operator-configurable or magic-numbered), and a new emission path that V18 must land. Threshold tuning is out of scope for V1 but the seam needs to exist. Crossing detection for descriptor pressure is non-portable (Linux-vs-macOS-vs-Windows).

**Risks.** A new code without a test fixture fails the V18s diagnostic-code closing gate. The threshold seam, if left under-specified, becomes a config-divergence surface across implementers.

### Recommendation

Adopt **Option A**. The finding's real defect is silence, not absence of machinery — the spec already routes every catchable resource-exhaustion throw through `loom/runtime/internal-error` and every per-query rate-limit through `TransportError`. Naming those classes in the disclaimer closes the documentation gap without committing V1 to a measurement seam, a portable descriptor-pressure heuristic, or an operator-tunable threshold (all of which are V2-shaped). Edge cases the implementer must watch: (a) the curated list of error names that V18m / V18n route through `internal-error` should include the descriptor-exhaustion family so test fixtures can assert routing without crossing into option B; (b) the disclaimer must explicitly name "no aggregation across siblings" so an implementer does not invent a `loom-system-note` storm-detection layer; (c) if a future Pi version exposes a `pi.resourceReport()` or similar capability, the disclaimer should be revisited under the same GOV-12 lock-step as the seven-capabilities inventory.

## Relationships

- T19 "Concurrent subagent siblings: no operator demultiplexing or sibling-failure timing rule" — same-cluster (same Session-model paragraph; addresses sibling-diagnostic correlation).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster.

---

# T21 — Pi-side slash-handler promise lifecycle taken as given

**Original heading:** `ctx.signal` propagation semantics taken as given
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** medium

## Finding

The orientation cancellation paragraph in `spec.md` and the **Cancellation source** paragraph in `pi-integration-contract.md` describe the runtime side of the slash-command cancellation chain in detail: `ctx.signal` is observed inside the runtime's `tool_call`/`tool_result`/`message_update`/`turn_end`/`agent_end` event handlers, an aborted `ctx.signal` triggers `loomAbort.abort(reason)`, the symmetric direction (`loomAbort.abort()` → `ctx.abort()`) tears down the user run and unblocks `await ctx.waitForIdle()`, the handler eventually returns the cancelled-arm `loom-system-note`. The runtime side is fully pinned.

The **Pi side** of the same chain is not. The capability-inventory entry (item 5, `sdk-cap-cancellation-propagation`) requires only that Pi *supplies* an `AbortSignal` at the two extension entry points. It does not state what Pi does with the slash-command handler's returned `Promise` after `ctx.signal` aborts: whether Pi awaits the handler's promise indefinitely, whether Pi imposes any internal deadline, whether Pi continues to deliver subsequent events to the same context, whether the handler is permitted to keep emitting `pi.sendMessage` calls between the abort and its eventual return, and whether Pi treats a handler that never returns as a host-process error or as a benign stall. The runtime's design implicitly assumes "Pi awaits the handler normally; `ctx.signal` is Pi's only out-of-band interaction with the handler after dispatch" — the prompt-mode *Hang handling* paragraph's "`waitForIdle()` has no internal deadline; hangs are bounded only by the cancellation path" wording rests on that assumption — but the assumption is not stated as a Pi-side guarantee anywhere in the spec.

A reader cross-checking the runtime's behaviour against Pi's contract has nothing to verify against. A future Pi version that introduces a handler-promise deadline, or that abandons the handler's promise after `ctx.signal` aborts (rather than awaiting it), would silently break the runtime's cancelled-system-note delivery and the `disposeBarrier`-driven session-shutdown drain rule, with no spec test or build-time gate to catch the drift.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (cancellation paragraph) (edited)
- `docs/spec_topics/pi-integration-contract.md` — *Cancellation source*, *SDK capability inventory item 5* (edited)
- `docs/spec_topics/cancellation.md` — *Forwarding into `loomAbort`*, *Surfacing* (read-only — already covers the runtime side)
- `docs/spec_topics/pi-integration-contract.md` — *Conversation drive — prompt mode* (read-only — the *Hang handling* sub-paragraph that consumes the assumption)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is documentary. Existing leaves (H4 *Pi extension shell*, H5 *Pi end-to-end harness*, Mb *MVP runtime*, V18a–V18e *cancellation checkpoints*) already exercise the runtime side of the assumption correctly; no acceptance criterion changes under the recommended fix. If the fix were instead landed as a new SDK-capability assertion in the entry capability probe (Step 0 (c)), H4's capability-probe tests would gain one row — but the recommendation below does not take that path.

## Consequence

**Severity:** advisory

The runtime ships correctly because Pi's actual behaviour matches the unstated assumption. The cost is verification debt: an implementer or auditor cannot confirm the cancellation chain by reading `spec.md` plus the linked PIC sections alone — they must read Pi's source to discover that Pi awaits the handler's promise normally and imposes no deadline. A future Pi change in this area would not be caught by any spec gate.

## Solution Space

**Shape:** single

### Recommendation

Add one paragraph to `pi-integration-contract.md`'s **Cancellation source** section (immediately after the existing `ctx.signal` JSDoc quote) stating Pi's slash-command-handler lifecycle as a host prerequisite the runtime consumes:

> **Slash-handler promise lifecycle.** Pi awaits the `Promise` returned by the slash-command `handler` for the full duration of the loom invocation, including any time elapsed between `ctx.signal` becoming `aborted` and the handler's eventual return. Pi imposes no internal deadline on the handler, and `ctx.signal` is Pi's only out-of-band interaction with the in-flight handler — Pi does not force-resolve, abandon, or detach the handler's promise after abort. The handler MAY continue to emit `pi.sendMessage` calls (including the cancelled-arm `loom-system-note`) and MAY continue to drive `ExtensionCommandContext` reads between the abort and its return; Pi continues to render those emissions on the same context until the handler settles. The runtime's *Hang handling* rule above (`waitForIdle()` is bounded only by the cancellation path) and the `session_shutdown` handler's `Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))` await both consume this guarantee.

Bind the new paragraph into the SDK capability inventory by widening item 5's text from "Pi MUST supply an `AbortSignal` …" to additionally require "… and Pi MUST award the handler's returned promise unbounded settle time after `ctx.signal` aborts (per **Slash-handler promise lifecycle** above)." The capability count in `spec.md`'s orientation bullet 3 stays at seven — this is a refinement of item 5, not a new capability.

The orientation cancellation paragraph in `spec.md` already forward-links capability inventory item 5 for cancellation propagation; no `spec.md` edit is required beyond ensuring that link continues to land on the widened item.

Edge cases the implementer must watch:

- The new paragraph is a Pi-side guarantee, not a runtime obligation; it goes under PIC, not under `cancellation.md`.
- The guarantee covers the *slash-command* handler only. The `tool.execute(...)` adapter's promise lifecycle is governed independently by the *Tool execution from loom code* section's outcome-routing summary.
- If the SDK-pin bump procedure later widens to mechanically verify Pi-side behavioural guarantees (not just type-shape), the fixture for this paragraph is a slash-handler that never returns after `ctx.signal` aborts — assert that Pi does not surface a host-process error and does not invoke a second handler concurrently.

## Relationships

- T22 "Single-active-session premise lacks Pi citation and a multi-session contingency" — same-cluster.
- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster.

---

# T22 — Single-active-session premise lacks Pi citation and a multi-session contingency

**Original heading:** Concurrent user sessions: Pi guarantee uncited; fallback if Pi adds support undefined
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions, completeness
**Importance:** medium

## Finding

The Session-model paragraph opens with the assertion that "A Pi extension instance is bound to exactly one active user session at a time" and closes with "Concurrent *user sessions* in the same host process are out of scope for V1 because Pi does not support them." Both clauses state Pi-side facts about the extension/session lifecycle without citing any Pi type, interface comment, or PIC anchor that establishes them. The assertion is load-bearing: the entire concurrency model in the paragraph (mode-qualified isolation, prompt-mode sequentiality, registry scoping, the cancellation-fan-in argument) presupposes a single user session per extension instance. Searching `pi-integration-contract.md` finds no section that carries the citation either — PIC discusses `session_shutdown`, `ActiveInvocationRegistry`, and per-mode tool-registration plumbing on top of this premise, but never anchors the premise itself to a Pi surface (`ExtensionAPI`, `ExtensionContext`, `ExtensionRuntime`, or session-lifecycle docs).

The second clause goes further and predicts Pi will not introduce multi-session support during V1.x. It records the prediction as a scope decision but specifies no behaviour if the prediction proves wrong: the runtime is not told to refuse to load, to bind to the first session and ignore additional ones, to extend the registry to multi-session keying, or to emit any host-incompatibility diagnostic. Compare the analogous treatment of a future per-extension privilege facet under Trust boundary, which at least names the surface (the build-time SDK surface-inventory assertion) where the change would surface; the user-session contingency has no such anchor.

The Pi version-bump procedure today inspects four pinned constants (Node floor, `AbortSignal` member-with-kind list, factory-probable capability list, peer-dep range) and does not look at the session-binding contract at all. A Pi minor that broadened the binding silently — for example, by changing the lifetime of `ExtensionAPI` from per-session to per-process while keeping all named members intact — would pass the surface-inventory test and slip through unnoticed.

## Spec Documents

- `docs/spec.md` — Orientation > Session model (edited)
- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites and Extension entry point sections (edited)
- `docs/spec_topics/future-considerations.md` — multi-session contingency entry (edited)
- `docs/spec_topics/pi-integration.md` — read-only (cross-check whether session-lifecycle vocabulary lives here)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is a documentation/citation change plus a contingent disclaimer; no leaf's `Tests` or `Ships when` criteria change. The H1 SDK surface-inventory test (`test/extension/pinned-surface.test.ts`) does not need to grow a new probe entry, because the single-active-session contract is a Pi-side lifecycle invariant rather than a probable named member; the citation lives in prose, not in the surface inventory.

## Consequence

**Severity:** advisory

A reader who tries to verify the Session-model paragraph against the pinned Pi SDK has nowhere to land — the load-bearing premise is unfalsifiable in the spec corpus as written. Implementation can still proceed because the V1 design (single extension instance, one `pi` reference captured by the factory, registry scoped to that instance) is internally consistent under the premise; the gap is a maintenance hazard rather than an immediate divergence risk. If Pi quietly relaxes the binding within the `~0.72.1` tilde range, the runtime would silently expose its single-session assumptions (registry collisions, captured-`pi` aliasing across sessions, prompt-mode sequentiality breaking) without any audit trail catching the drift.

## Solution Space

**Shape:** single

### Recommendation

Add the citation in PIC and a contingent disclaimer in `future-considerations.md`; reduce the spec.md sentences to forward-links.

1. **In `docs/spec_topics/pi-integration-contract.md` — Host prerequisites** (or a new sub-section "Session-binding contract" alongside the existing `ActiveInvocationRegistry` material), add a paragraph anchoring the single-active-session guarantee to a verifiable Pi source. The anchor should name the file and symbol in `@mariozechner/pi-coding-agent ~0.72.1` that establishes it — the most likely candidate is the lifecycle documentation on `ExtensionAPI` / `ExtensionRuntime` / `ExtensionContext` in `dist/core/extensions/types.d.ts`, or the prose contract in `pi-coding-agent`'s own SDK docs (e.g. `docs/sdk.md`). If no in-tree symbol carries the contract explicitly, state that fact and cite the SDK doc page (`docs/sdk.md` of `pi-coding-agent`) verbatim as the source of truth.

2. **In the same PIC section**, extend the Pi version-bump procedure with one new step: re-confirm the session-binding contract against the new Pi minor's lifecycle documentation. Frame it parallel to the existing `event.reason` diff-audit so the procedure has one coherent rule.

3. **In `docs/spec_topics/future-considerations.md`**, add an entry under "Known V1 limitations (no seam expected)" — "**Multi-session Pi extension instances.** V1 assumes a Pi extension instance binds to exactly one active user session at a time, per [PIC — Session-binding contract]. If a future Pi minor relaxes this within the `~0.72.1` tilde range or in a subsequent pin, the V1 runtime continues to bind to a single session per extension instance: the `pi` reference captured by the extension factory, the `ActiveInvocationRegistry`, and the prompt-mode `pi.setActiveTools` snapshot/restore protocol all remain scoped to that single session, and any second session reaching the extension is out of V1 scope (no second registry, no second renderer registration, no second teardown handler). The Pi version-bump procedure detects the relaxation; the V1 response is documented here, not adopted in the runtime."

4. **In `docs/spec.md` — Session-model paragraph**, replace the bare opening sentence with a forward-link: "A Pi extension instance is bound to exactly one active user session at a time, per [Pi Integration Contract — Session-binding contract](./spec_topics/pi-integration-contract.md#session-binding-contract)." Replace the closing "Pi does not support them" clause with: "Concurrent *user sessions* in the same host process are out of scope for V1 per [Future Considerations — Multi-session Pi extension instances](./spec_topics/future-considerations.md#multi-session)." Both edits keep spec.md as orientation aggregator under GOV-12.

Edge cases an implementer must watch:

- The citation chain must terminate at a Pi-side artefact (file + symbol, or named SDK doc page), not loop back into the loom spec corpus.
- If the audit step reveals Pi's contract is weaker than asserted (e.g. the lifecycle doc only says "typically bound to one session"), the spec must downgrade the assertion accordingly rather than over-claim. In that case the contingency entry in `future-considerations.md` becomes load-bearing today, not hypothetical.
- The fallback disclaimer must not introduce normative MUSTs that a leaf would have to test — V1 ships nothing for the multi-session case, and the contingency is documentation-only.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — co-resolve (same Session-model paragraph, same uncited-Pi-fact pattern; both citations should land in the same PIC section in one edit pass).
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (same uncited-Pi-internals pattern).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster.
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (same diff-audit-on-pin-bump remedy).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — must-precede (its proposal to extract the 'concurrent user sessions … out of scope' sentence into a top-level Non-goals section interacts with this finding's proposal to forward-link it to `future-considerations.md`).

---

# T23 — Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source

**Original heading:** Pi serializes slash handlers: citation missing for the sequentiality guarantee
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** high

## Finding

`spec.md` (Orientation > Session model) anchors the prompt-mode sequentiality conclusion on three premises, the first of which is "Pi's per-session slash-handler serialisation pinned at [Pi Integration Contract — Tool-registration lifetime and visibility]". Following that link, PIC's *Tool-registration lifetime and visibility* paragraph re-states the property as Pi *behavioural* precondition (b): "the loom runtime assumes Pi serialises slash-command dispatch per session (two loom-invocation slash dispatches against the same session cannot overlap their snapshot/restore windows)." PIC further admits that "the H1 SDK surface-inventory test cannot detect either weakening from the type surface alone" and forward-links re-validation to the *Pi version bump procedure*. The bump procedure as enumerated has seven steps, none of which covers re-checking this precondition. No interface declaration, source-file line, code comment, or Pi test is cited at any of these sites.

The chain therefore relies on a Pi-side guarantee that is asserted as a fact in three places (spec.md aggregator, PIC behavioural-preconditions paragraph, PIC sub-step-2 fast-path framing in *`session_shutdown` — Edge cases* — "Pi serialises turns") but pinned to no Pi artifact a contributor can audit. If Pi does not in fact serialise per-session slash-handler dispatch — or weakens the guarantee in a tilde-compatible patch / minor — the prompt-mode `pi.setActiveTools` snapshot/restore protocol races: two overlapping snapshot/restore windows can install one window's `customTools` set after the other window has already restored, leaving the user session with a permanently-stale active-tool set or with the wrong tools visible to the model mid-turn. The runtime owes no diagnostic for this and would not detect it.

## Spec Documents

- `docs/spec.md` — Orientation > Session model, prompt-mode sequentiality sentence (edited)
- `docs/spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility, behavioural-preconditions sub-paragraph (edited)
- `docs/spec_topics/pi-integration-contract.md` — `session_shutdown` Edge cases ("Pi serialises turns") (edited)
- `docs/spec_topics/pi-integration-contract.md` — Pi version bump procedure (edited)
- `docs/spec_topics/frontmatter.md` — `tools:` (read-only; rejection rule that completes the sequentiality argument)
- `docs/spec_topics/invocation.md` — Cross-mode semantics (read-only; suspend-on-invoke rule that completes the sequentiality argument)

## Plan Impact

**Phases:** Horizontal H1, Vertical V14

**Leaves (implementation order):**

- H1 — Scaffold (SDK surface-inventory test) — (modified)
- V14e — Same `tools:` set presented to model during query tool-call loop — (modified)

## Consequence

**Severity:** correctness

If Pi does not serialise per-session slash-handler dispatch as assumed, two concurrent prompt-mode invocations against the same user session can interleave their `pi.setActiveTools` snapshot/restore windows, leaving the user session with a permanently-stale active-tool set or surfacing the wrong callable set to the model on a turn. The failure mode is silent — no `loom/runtime/*` diagnostic covers it — and two implementers, one trusting the spec and one auditing Pi, would diverge on whether a per-session runtime mutex is required.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. (Option B — behavioural fixture in H5 — queued as a future follow-up finding once the H5 harness exists; not part of this commit.)

### Option A — Cite the existing Pi mechanism

**Approach.** Audit `@mariozechner/pi-coding-agent ~0.72.1` for the artifact that establishes per-session slash-handler serialisation (likely the per-session `Runner` queue / `waitForIdle` interaction in `dist/core/extensions/loader.js` or an upstream `AgentSession` turn-ordering invariant), and pin the citation in PIC's behavioural-preconditions paragraph by file + symbol the same way the surrounding sentence pins `pi.setActiveTools(string[])` to `ExtensionAPI` in `dist/core/extensions/types.d.ts`.

**Spec edits.**
- PIC *Tool-registration lifetime and visibility*: replace "the loom runtime assumes Pi serialises slash-command dispatch per session" with "Pi serialises slash-command dispatch per session, pinned by `<symbol>` in `<file>` of `@mariozechner/pi-coding-agent ~0.72.1`".
- PIC *Pi version bump procedure*: add a step 8 — "Re-confirm per-session slash-handler serialisation. Diff the cited symbol against the candidate minor; if removed, renamed, or weakened, add a runtime mutex per the Option C fallback in the same edit."
- `spec.md` aggregator sentence: keep the forward-link; PIC now carries the citation.

**Pros.** No runtime change. Aligns the precondition with the citation discipline used for the type-encoded part of the same sentence. Cheapest if Pi already has the artifact.

**Cons.** The mechanical gate (a green H1 test) cannot detect drift inside the cited symbol's body — only renames or removals. A behavioural weakening that keeps the symbol intact is still silent.

**Risks.** If Pi has no single artifact establishing serialisation (the property is emergent across `Runner` + `AgentSession` + `ExtensionRuntime`), the citation is brittle.

### Option B — Add a behavioural fixture and tie it to the bump procedure

**Approach.** Augment Option A with an H1 (or H5) integration fixture that drives two overlapping slash dispatches against a real Pi `~0.72.1` instance and asserts the second handler does not enter while the first holds an open `pi.setActiveTools` window. Wire the fixture into the bump-procedure step added in Option A so the gate is mechanical, not type-shape-dependent.

**Spec edits.** Same as Option A, plus the bump-procedure step references the fixture's leaf ID.

**Pros.** Detects behavioural drift the type surface cannot. Survives Pi refactors that keep the property but move the symbol.

**Cons.** Real-Pi integration test is heavier than the existing H1 type-surface tests; H5 (`pi-e2e-harness`) is the natural home but adds a leaf-or-test obligation under H1 if it must close before V14e ships. Test setup must defeat any debounce / coalesce that hides the race.

**Risks.** A flaky fixture would produce noisy bump-procedure failures; the assertion needs a deterministic synchronisation primitive (e.g. a long-`await` inside the first handler) rather than wall-clock timing.

### Option C — Defensively serialise inside the runtime

**Approach.** Replace the Pi-side assumption with a per-session runtime mutex that wraps the entire snapshot → swap → body → restore sequence in `pi.setActiveTools` calls. The serialisation guarantee then holds by construction regardless of Pi's behaviour.

**Spec edits.**
- PIC *Tool-registration lifetime and visibility*: drop precondition (b); replace with a normative runtime obligation pinning the per-session mutex (state the lock object's scope — keyed on the captured `pi` reference or on `ExtensionContext` identity — and the acquisition/release pairing around the snapshot/restore `try`/`finally`).
- Update V14e tests to assert the mutex semantics rather than asserting Pi-side serialisation.

**Pros.** Removes the unverified Pi assumption entirely. Defends against Pi adding multi-handler reentrancy in a future minor.

**Cons.** Adds a runtime concept (per-session lock) that did not exist; widens the runtime contract. Performance cost is negligible (the lock is uncontended in the assumed-serial case) but the spec surface grows.

**Risks.** A misplaced lock (e.g. on the wrong scope, or held across `await ctx.waitForIdle()`) deadlocks the user session; the spec must pin the lock granularity precisely.

### Recommendation

Adopt Option A as the immediate fix, with Option B's behavioural fixture queued as the durable gate. PIC's behavioural-precondition paragraph already names this re-validation obligation in prose ("MUST be re-validated as part of [Pi version bump procedure]"); Option A discharges that obligation today by adding the citation and the matching numbered step, and Option B turns the manual diff into a mechanical test once the H5 harness exists. Option C is reserved for the case where the Option A audit fails to find a stable Pi artifact — defer it unless that audit comes back empty.

Edge cases the implementer must watch:
- The cited symbol must establish *per-session* serialisation, not global per-extension serialisation; PIC explicitly excludes the in-process prompt → prompt `invoke(...)` overlap from precondition (b) and assigns it to the runtime's own LIFO-nesting argument.
- The audit must distinguish "Pi queues handler dispatch" from "Pi serialises turns inside a single handler"; only the former prevents two snapshot/restore windows from overlapping.
- If the cited mechanism lives in `pi-agent-core` or `pi-tui` rather than `pi-coding-agent`, the bump-procedure step must name the correct lock-step package so the diff runs against the right `dist/` tree.

## Relationships

- T14 "Prompt-mode sequentiality argument has an unstated fourth premise" — co-resolve (the same finding names Pi serialisation as the first of three premises; this fix discharges that premise).
- T22 "Single-active-session premise lacks Pi citation and a multi-session contingency" — same-cluster (identical pattern).
- T21 "Pi-side slash-handler promise lifecycle taken as given" — same-cluster.
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (Pi-side surface asserted without a tilde-range drift gate).

---

# T24 — Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state

**Original heading:** Fork-reason watcher closure: colloquial prose, no operator diagnostic, intermediate state undescribed
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** clarity, cruft, completeness, error-model, assumptions
**Importance:** high

## Finding

The Session-model paragraph in `spec.md` (and the corresponding bullet in `pi-integration-contract.md` step 4) commits to running the full fixed teardown sequence — including `discoveryWatcher.close()` and `settingsWatcher.close()` in sub-step 4 — for every value in the `event.reason` closed set. For the three "session-only" reasons (`"new"`, `"resume"`, `"fork"`) this leaves the extension runtime alive but with both watchers closed, and the prose then waves the operator off with the parenthetical *"recovery is one `/reload` away"*.

Three concrete gaps follow from that wording:

1. **Intermediate-state behaviour is undescribed.** Sub-step 1 marks the `LoomRegistry` as drained and the slash-command handler short-circuits drained dispatches with the literal `loom /<name>: extension shutting down` note. There is no rule that ever *un*-drains the registry. On a `"fork"` shutdown the extension therefore enters a permanent state in which every subsequent slash invocation returns "extension shutting down" until the operator issues `/reload` — but neither file states this, and the words "watchers may be closed" are read most naturally as "may, depending on conditions" rather than "are unconditionally". The behaviour is in fact deterministic; the prose obscures that.

2. **Operator visibility is zero until the symptom surfaces.** The teardown handler emits no `loom-system-note`, no `console.error`, and no Pi-side notification when watcher closure happens on a non-teardown reason. The first observable symptom is either the "extension shutting down" reply on the next slash invocation, or — if the operator does not issue any further slash command — a stale callable list across edits to `.loom` / settings files. The three teardown-handler diagnostics enumerated in PIC step 4 (`reload-teardown-timeout`, `session-shutdown-reason-unknown`, `session-shutdown-teardown-step-failed`) all cover failure modes, none covers the *successful* fork-reason teardown.

3. **The recovery clause is colloquial and non-normative.** "Recovery is one `/reload` away" carries no MUST/SHOULD obligation, does not state whether `/reload` is the only path, does not commit to the operator-issued path (vs. an automatic re-subscribe), and reads as inline editorial commentary inside an otherwise normative paragraph.

## Spec Documents

- `docs/spec.md` — *Orientation > Session model* (the `<a id="session-model"></a>` paragraph) (edited)
- `docs/spec_topics/pi-integration-contract.md` — *Extension entry point* step 4, the `reason: "new" | "resume" | "fork"` bullet immediately after the teardown sub-step list (edited)
- `docs/spec_topics/diagnostics.md` — Code registry table (edited under Option A; read-only under Option B)
- `docs/spec_topics/pi-integration-contract.md` — *Extension entry point* sub-step 1 (registry-drain rule) and sub-step 4 (watcher closure) (read-only — referenced for current behaviour)

## Plan Impact

**Phases:** Horizontal H4; Vertical V18.

**Leaves (implementation order):**

- H4 — Pi extension shell — (modified — owns `extensions/index.ts` and `sendSystemNote`; the `session_shutdown` handler will live here)
- V18f — File watcher (chokidar) over discovery roots — (modified — disposal-on-`session_shutdown` path)
- V18r — Settings-file watcher — (modified — symmetric to V18f for `settingsWatcher`)
- V18s — Coverage-matrix closing CI gate — (modified — gate (2) requires every code in the diagnostics registry to be asserted by at least one test)

Note: the plan currently has no leaf that explicitly owns implementation of the `session_shutdown` teardown handler (registry drain, abort-and-await, watcher close, listener detach). H4's *Adds* covers `pi.on(...)` plumbing implicitly but does not enumerate the handler's sub-steps. Resolving this finding will surface that gap regardless of which option is chosen.

## Consequence

**Severity:** correctness

After a `"fork"` shutdown the extension runtime is alive but every subsequent slash invocation in the same Pi process returns "extension shutting down" with no explanation, and editor-driven `.loom` / settings edits silently no-op. Two reasonable implementers will diverge on whether to (a) leave the registry drained until `/reload`, (b) un-drain it once teardown resolves, or (c) re-subscribe the watchers, because the spec admits all three readings. The operator has no diagnostic correlating the silence with the upstream `session_shutdown` event.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Decision-time merge: T17 absorbed (`console.error` teardown sink contract tightened in same commit; T24's new diagnostic emits through the verified sink). See T17 stub.

### Option A — Keep deterministic full-teardown; specify the degraded state and emit one diagnostic

**Approach.** Preserve the "fixed teardown sequence regardless of reason" invariant. State explicitly that on `"new" | "resume" | "fork"` the extension runtime remains live with the registry permanently drained and both watchers closed; that subsequent slash invocations return the same `loom /<name>: extension shutting down` note already pinned in PIC sub-step 1; and that `/reload` is the only V1 path that re-establishes a fresh runtime. Add one new diagnostic emitted from the teardown handler when `event.reason ∈ {"new", "resume", "fork"}` and sub-step 4 completes without a throw.

**Spec edits.**

- *`spec.md` Session model paragraph.* Replace the parenthetical *"(recovery is one `/reload` away)"* with normative prose stating: watchers are closed on every reason in the closed set, including `"fork"`; after such a closure the runtime remains live but the `LoomRegistry` is drained for the remainder of the extension-instance lifetime; operator-issued `/reload` is the only V1 recovery path; the runtime emits exactly one `loom/host/discovery-degraded-after-shutdown` (W, runtime) note per such shutdown, with `details.event.reason` carrying the reason that triggered closure.

- *`pi-integration-contract.md` step 4 closing bullet.* Mirror the same prose, pin the diagnostic emission point as "after sub-step 4 completes without a throw and `event.reason ∈ {"new", "resume", "fork"}"`, and route it through the teardown-handler last-resort `console.error` sink defined in the *Diagnostic-emission isolation* paragraph.

- *`diagnostics.md` registry table.* Add the new code with severity `W`, phase `runtime`, message template `loom watcher closed without teardown (reason: <event.reason>); slash invocations are degraded until /reload`, `details.event.reason: "new" | "resume" | "fork"`.

**Pros.** Preserves the determinism invariant the rest of the teardown sequence rests on (no per-reason branching). Resolves the operator-visibility gap. Resolves the intermediate-state ambiguity by stating the post-closure state explicitly rather than implying it. Re-uses the existing `console.error` last-resort sink and the existing drained-registry semantics; no new control-flow surface.

**Cons.** Adds one entry to the diagnostics registry and to the V18s coverage gate. Does not eliminate the post-fork degradation itself — a `"fork"` still silently disables file-watching until `/reload`.

**Risks.** If an operator habitually issues `/fork` (or whatever Pi UI maps to it) without then issuing `/reload`, the W-level diagnostic must actually reach the persistent transcript surface; the teardown-handler emission goes through `console.error` only, so visibility depends on the operator reading host-process stderr or the diagnostics channel V18q wires up. State that the diagnostic is best-effort and document the surface explicitly.

### Option B — Carve `"fork"` (and `"new"` / `"resume"`) out of sub-step 4

**Approach.** Branch the teardown sequence on `event.reason`: for the three session-only reasons, run sub-steps 1–3 and 5 but skip sub-step 4 (watcher closure) entirely, and additionally un-drain the registry at the end of the handler so subsequent slash invocations dispatch normally. Treat `"quit"` and `"reload"` as the only reasons that close watchers.

**Spec edits.**

- *`pi-integration-contract.md` step 4.* Split the sub-step list into a shared prefix (sub-steps 1–3, 5) and a tail (sub-step 4 plus the registry-drain commit) gated on `event.reason ∈ {"quit", "reload"}`. State the un-drain rule for the session-only reasons.
- *`spec.md` Session model paragraph.* Drop the "watchers closed on every reason" claim and the colloquial parenthetical; replace with the new branched contract.
- *PIC sub-step 1.* Make the drain reversible at end-of-handler when the branch did not run sub-step 4.

**Pros.** Eliminates the silent-degradation outcome at its source: a `"fork"` no longer breaks file-watching or slash dispatch.

**Cons.** Breaks the "fixed teardown sequence regardless of reason" property that PIC currently leans on as a simplicity invariant — the unknown-reason rule, the per-step isolation rule, the idempotency clause, and the emergent-fast-path framing all assume a single uniform sequence. Each must be re-derived under the branch, multiplying the surface area of the contract. Introduces an "un-drain" state transition the registry has no current vocabulary for; `LoomRegistry.dispatch` would need a tri-state `{ live, draining, drained }` rather than the binary `drained` flag PIC sub-step 1 currently pins. Risk of a drained-then-undrained registry racing with a slash invocation that observed the drained state and already returned the shutdown note.

**Risks.** The closed `event.reason` set may widen in a future Pi minor; a branched sequence forces a per-reason routing decision on every new value, whereas a uniform sequence routes them through the `unknown-reason` rule by default.

### Recommendation

Take **Option A**. The fix is a wording tightening plus one new `W`-severity diagnostic; it preserves every existing PIC invariant and addresses both the operator-visibility gap and the intermediate-state ambiguity at the same edit. Implementer edge cases to watch:

- The new diagnostic emission must land **after** sub-step 4 completes without a throw — if sub-step 4 throws, the existing `loom/host/session-shutdown-teardown-step-failed` rule already covers the surface and the discovery-degraded note would be redundant.
- Emission must be wrapped in the same `try`/`catch` envelope that the *Diagnostic-emission isolation* paragraph requires for the other three teardown-handler emissions; a throw out of `console.error` MUST NOT unwind the handler.
- The diagnostic fires exactly once per shutdown event in the session-only-reason branch; the idempotency clause ("a second `session_shutdown` fired before the first returns is a no-op") already covers the duplicate-event path.
- The plan must grow (or H4 must absorb) a leaf that owns the `session_shutdown` handler implementation and tests; today no leaf enumerates registry drain + watcher close + listener detach as its acceptance set.

## Relationships

- T17 "`console.error` teardown sink: unverified and over-prescribed in aggregator" — co-resolve (both edit PIC step 4 and rely on the `console.error` last-resort sink).
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — must-precede (Option A's `details.event.reason` enumeration pivots on the closed reason set).
- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — same-cluster.

---

# T25 — Forward-compatibility-seam aggregator count is not gated by CI

**Original heading:** Count of 13 seams hard-coded without build-time verification; no cost/priority signal
**Original section:** docs/spec.md — Orientation > Scope > Forward-compatibility seams
**Kind:** assumptions, scope
**Importance:** medium

## Finding

`spec.md` Scope > Forward-compatibility seams asserts "V1 reserves 13 typed/structural seams" as a literal integer; the source-of-truth seams live as `> **V1 seam — <name>.**` blockquotes scattered across `spec_topics/*.md`. Today the inventory grep returns 14 such blockquotes (one of which — `pi-integration-contract.md`'s *Pi-owned subagents collision source set* — is then explicitly excluded by `future-considerations.md` prose because the dependent feature only activates if Pi widens `SlashCommandSource`), yielding the documented 13. Reproducing that arithmetic is a non-trivial reading exercise even with the sources open, and nothing prevents a future PR that adds, removes, or recategorises a seam from leaving the literal stale.

GOV-12 governs this aggregator-vs-source relationship and disclaims any CI gate on the grounds that "semantic equivalence between an aggregator paragraph and a set of topic-page paragraphs is not mechanically decidable, mirroring the GOV-8 *Pure rewording* limit." That reasoning is sound for prose-equivalent aggregators (e.g. the Host-runtime obligations summary), but it is over-broad for the seam tally specifically: counting `> **V1 seam — <name>.**` blockquotes across a fixed file set and comparing against a single integer literal in `spec.md` is a `grep | wc -l` / `diff` shape — exactly the kind of check V18s already runs for REQ-IDs, diagnostic codes, and the prefix table. The same pattern recurs in three other Scope/Overview aggregators that hard-code small integer counts (`.warp` top-level forms `currently five`; the four-item Hard ceilings list; the seven-element Pi capabilities list), so the right design unit is a parameterised aggregator-count gate rather than a one-off seam check.

The original framing also flagged the absence of a "cost/priority signal" per seam — cheap (open-struct field) vs. expensive (named function exposing a shared subroutine). On inspection this is not a spec gap: every seam carries equally-weighted V1 MUST language ("the runtime MUST …", "consumers MUST switch on … exhaustively"), and `future-considerations.md` already maintains the only normatively meaningful tier (with-seam vs. no-seam-rides-unknown-key-policy). Implementer effort estimation is appropriately a plan concern.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Forward-compatibility seams (read-only — the literal `13` stays; what changes is that a CI gate now defends it)
- `docs/spec_topics/governance.md` — GOV-12 (edited — the "not mechanically decidable" carve-out needs a sentence acknowledging that count-shaped aggregator claims are an exception with a CI gate)
- `docs/spec_topics/future-considerations.md` — *Surface extensions (V1 leaves a seam)* and the *Surface extensions without a dedicated topic-page seam* sub-bucket (read-only — the prose explaining why the Pi-owned-subagents seam is not counted in the 13 is the canonical reconciliation)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18s — Coverage-matrix closing CI gate — (modified)

V18s already specifies nine numbered gates (`gov-1` … `gov-9`) over REQ-IDs, diagnostic codes, prefix tables, and spec/plan link integrity. A tenth gate enforcing aggregator-count equality slots into the same `<source-path>:<context>: <gate-id>: <symbol> <reason>` failure-line contract and the same exit-code / accumulation semantics. No other leaf needs modification: the seam-bearing leaves (V5e/V14c-a/V15a for per-call timeout, V6/V11/V13 for discriminator type-openness, V12a/V14n for Pi-owned subagents, V16 for binder seams, V17 for `Resolver`, etc.) already carry the per-seam MUSTs.

## Consequence

**Severity:** advisory

Without the gate, drift between `spec.md`'s literal "13" and the actual blockquote inventory is a latent documentation defect that GOV-12 reclassifies as non-correctness. Implementers can still build a working V1 — the seam contracts each stand on their own MUST language. The cost is silent erosion of GOV-12's lock-step promise across V1.x releases, and harder reviewer diffs when a future seam is added.

## Solution Space

**Shape:** single

### Recommendation

Add a tenth gate to V18s — `gov-10` (*Aggregator-count gate*) — that asserts equality between hard-coded integer literals in `spec.md` aggregator paragraphs and the actual count of source items each summarises. Implementation shape:

- The gate is data-driven over a closed table of *(aggregator-literal location, source predicate, expected adjustment)* tuples maintained in V18s's gate source. Initial entries:
  - **Forward-compatibility seams.** Source predicate: `grep -rE '^[[:space:]]*> \*\*V1 seam — ' docs/spec_topics/`. Adjustment: subtract the count of seams referenced from the *Surface extensions without a dedicated topic-page seam* sub-bucket of `future-considerations.md` (currently 1 — the Pi-owned-subagents seam). Expected: matches the integer in `spec.md`'s "V1 reserves N typed/structural seams" sentence.
  - **`.warp` top-level forms.** Source predicate: rows of the canonical list at `imports.md#permitted-top-level-forms`. Expected: matches `(currently N: …)` in `spec.md`'s file-extension paragraph.
  - **Hard ceilings.** Source predicate: numbered ceilings in `spec.md`'s Hard-ceilings list itself, cross-checked against owner-page anchors. Expected: matches "the four below".
  - **Pi capabilities.** Source predicate: bullet list under the *Host runtime / Pi SDK and capabilities* aggregator. Expected: matches the literal "seven".
- Failure-line shape: `docs/spec.md:<line>: gov-10: <aggregator-name> expected <N>, found <M>` (literal aggregator name from the table; reasons add `aggregator count drift` to the closed `<reason>` vocabulary).
- The exclusion list (the "subtract these" set, currently just the Pi-owned-subagents seam) is itself encoded in the gate's source table with a comment naming the `future-considerations.md` paragraph that justifies each exclusion.
- GOV-12 is amended by one sentence acknowledging the aggregator-count exception: e.g. "Aggregator paragraphs that take the shape of an integer count of source items (e.g. *N seams*, *N ceilings*) are checked mechanically by V18s gate (10); the prose-equivalence carve-out above does not extend to count-shaped claims."

Edge cases the implementer must watch:

- The seam grep MUST anchor to the `> **V1 seam — ` prefix and tolerate leading whitespace (the `frontmatter.md` `system:` seam is indented under a list — `^[[:space:]]*>` is required, not `^>`). The current `^>`-only inventory miscounts by 1.
- The exclusion list is per-seam, not per-extension item: the *Per-call timeouts* future-considerations entry consumes three distinct seams (query, tool-calls, invocation), and all three are in the count of 13 even though they pin a single deferred extension. The gate counts blockquotes, not extensions.
- The `.warp` permitted-forms gate must accommodate the *or, after V12, `protocol`* lookahead phrasing without double-counting once V12 lands; either the source predicate excludes `protocol` until its anchor is live, or the literal in `spec.md` is updated in lock-step with V12 and the gate's expectation table is bumped in the same commit.

## Relationships

- T31 "Hard-ceiling closure asserted at the aggregator without pointing at the backing audit" — same-cluster (sibling closed-set claim that the same gate covers).
- T35 "SDK capability inventory closed-set claim has no negative-direction audit" — same-cluster (sibling closed-set claim).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (touches the aggregator-vs-source relationship).

---

# T26 — Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results

**Original heading:** Terminal-outcomes paragraph: normative routing detail and error codes in aggregator
**Original section:** docs/spec.md — Overview
**Kind:** placement
**Importance:** high

## Finding

The Overview paragraph anchored at `#terminal-outcomes-aggregator` (`docs/spec.md` line 10) is a single ~600-word sentence that does far more than orient. It enumerates the three failure modes (`Err`, panic, hard-ceiling exhaustion); names the routing-class qualifier ("ceilings whose routing class is panic or `Err`"); calls out a specific exclusion (the load-time binder cap, identified as ceiling #3); references the closed pre-evaluation failure enumeration; restates the partial-append contract (turns appended before the terminal event remain in the conversation, no implicit rollback, mid-stream fragments governed elsewhere); and asserts the trichotomy applies "only once evaluation has begun." Every one of those statements is owned, with its closed enumeration and per-cause routing rule, by `spec_topics/errors-and-results.md` under the `#terminal-outcomes` and `#partial-append-contract` anchors.

GOV-12 sanctions a fixed list of five aggregator paragraphs in `spec.md` — Scope bullets, Pi SDK and capabilities bullet list, Host runtime obligations, hard-runtime-ceilings list, and `.warp` permitted-top-level-forms list. The terminal-outcomes paragraph is not on that list, and the GOV-12 framing ("enumerate a closed set of items each owned by a different topic page") does not fit it: rather than enumerating a closed set with one item per owner-page, it inlines a routing taxonomy. Because there is no CI gate for aggregator drift (GOV-12 makes drift a documentation defect, not a correctness one), the duplication has already produced cross-paragraph inconsistencies that other findings in this review surface independently — the exclusion clause names only ceiling #3 and silently omits ceiling #4's slash-load arm; the "panic or `Err`" qualifier is incompatible with ceiling #4's "boundary-dependent" routing class; the pre-evaluation enumeration is referenced but never bounded.

The fix is to demote the paragraph to a true orientation sentence — name the trichotomy, name its owner — and let `errors-and-results.md` carry the routing detail, exclusions, and partial-append contract. Doing so also reduces the surface H6 must retarget when it rewrites `spec.md`'s introduction onto REQ-ID anchors.

## Spec Documents

- `docs/spec.md` — Overview, terminal-outcomes paragraph (`<a id="terminal-outcomes-aggregator">`) (edited)
- `docs/spec_topics/errors-and-results.md` — `#terminal-outcomes`, `#partial-append-contract` (read-only; canonical owner)
- `docs/spec_topics/governance.md` — GOV-12 (read-only; constrains what an aggregator may carry and lists the sanctioned set)
- `docs/spec_topics/hard-ceilings.md` — referenced by the paragraph for routing classes (read-only)
- `docs/spec_topics/cancellation.md` — referenced for the cancellation arm (read-only)
- `docs/spec_topics/pi-integration-contract.md` — referenced for `loomAbort.signal` (read-only)

## Plan Impact

**Phases:** Horizontal phases

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

The H6 test "spec.md's introduction contains zero links of the form `./spec_topics/<non-narrative-page>.md#<non-prefix-anchor>`" today must rewrite the paragraph's `#terminal-outcomes`, `#partial-append-contract`, and `#cancellation-source` links onto whichever `ERR-N` / `PIC-N` anchors H6 assigns to those rules. Trimming the paragraph as proposed shrinks the set of links H6 must retarget but does not change the test or block the leaf.

## Consequence

**Severity:** correctness

The duplication is the upstream cause of three already-filed inconsistencies in this same review (the ceiling #3-only exclusion clause, the "panic or `Err`" qualifier vs. ceiling #4's "boundary-dependent" routing, and the unbounded pre-evaluation enumeration). Two implementers reading Overview vs. `errors-and-results.md` can extract different routing-class sets for ceiling #4 and a different exclusion list for the trichotomy. Future edits to Errors and Results — adding a fail variant, retiring a routing class, splitting a ceiling — must be mirrored manually in this paragraph, with no mechanical check that the mirror happened.

## Solution Space

**Shape:** single

### Recommendation

Replace the paragraph with a single orientation sentence whose only normative content is the trichotomy name and the owner-page link. Concretely, something of the form:

> Loom evaluation produces one of three terminal outcomes — success, failure, cancellation. The closed enumeration, the per-cause caller-surface map, the partial-append contract, the routing classes for each hard-ceiling breach, and the pre-evaluation failure enumeration that fires before the trichotomy applies are all owned by [Errors and Results — Terminal outcomes](./spec_topics/errors-and-results.md#terminal-outcomes) and [Errors and Results — Partial-append contract](./spec_topics/errors-and-results.md#partial-append-contract). The cancellation arm is owned by [Cancellation](./spec_topics/cancellation.md).

Edge cases the implementer of the edit must watch:

- The `<a id="terminal-outcomes-aggregator">` anchor itself should be retained — other prose (and possibly diagnostics scripts) may already link to it. The anchor stays; only the paragraph behind it shrinks.
- Do not extend GOV-12's sanctioned aggregator list to add this paragraph as a sixth aggregator. The point of the demotion is that this paragraph is not a closed-set enumeration; it is an orientation pointer. Adding it to GOV-12 would re-license the same drift problem.
- The sentence "The success / fail / cancelled trichotomy applies only once evaluation has begun" carries a real boundary distinction (pre-evaluation failures are not in the trichotomy). Retain it in the orientation sentence — it is the one piece of framing the owner page assumes the reader brings in.
- The cancellation source detail (`loomAbort.signal`, Pi's `ctx.signal` forwarding) currently embedded mid-paragraph belongs in the Session model / Cancellation aggregator, not here. Excise it; do not relocate it into the trimmed sentence.
- After the edit, re-check the H6 link-rewrite plan: the surviving links should target `errors-and-results.md` and `cancellation.md` page-level (or REQ-ID anchors once H6 lands), not surviving section anchors.

## Relationships

- T29 "Pre-evaluation exclusion clause names ceiling #3 only; ceiling #4's slash-load `params` arm is also pre-evaluation" — co-resolve (the exclusion clause goes away with the trim).
- T30 "Ceiling #4's model-driven row is neither panic nor `Err`, contradicting the trichotomy paragraph's qualifier" — co-resolve (the qualifier goes away with the trim).
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — same-cluster (identical pattern applied to a different aggregator paragraph).

---

# T27 — Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels

**Original heading:** Normative routing classes and error codes in Hard ceilings aggregator
**Original section:** docs/spec.md — Orientation > Scope > Hard ceilings
**Kind:** placement
**Importance:** medium

## Finding

The Hard ceilings bullet at `spec.md` *Orientation > Scope* is declared an "Orientation aggregator (per [Governance — GOV-12](./spec_topics/governance.md))" and is therefore informative — every obligation it appears to state must be owned by a topic page it forward-links to. GOV-12 explicitly scopes aggregators to enumerating "a closed set of items each owned by a different topic page" and notes that drift between an aggregator and its sources is undetectable by any CI gate.

Within that frame, the four-ceiling list goes well past enumeration. Each row reproduces concrete owner-page material that is not orientation-shaped:

- Wire-level error-code shapes — `loom/runtime/invoke-depth-exceeded` (owned by `invocation.md` and `errors-and-results.md`), `Err(QueryError { kind: "tool_loop_exhausted", … })` (owned by `errors-and-results.md` § *`QueryError` variants*), and the canonical depth-violation message `"JSON document depth exceeds 5"` plus `schema_keyword: "maxDepth"` (owned by `schema-subset.md` § *Depth Enforcement*).
- Sub-obligation identifiers — the bullet names HC3-a … HC3-e, CIO-1 … CIO-6, the `masked` field contract, and NOCEIL-1 … NOCEIL-4 inline, even though `hard-ceilings.md` is the declared owner of every one of them and the list-tail paragraph already forward-links to those owners.
- Cross-ceiling routing prose — the slash-load-`params`-cross-routes-through-#3 sentence and the per-boundary "five enforcement points" framing both restate substantive content that the per-boundary table on `hard-ceilings.md` already owns end-to-end.

The duplicated material reads as acceptance-criteria-level content (a test could plausibly assert the inlined error-code shapes verbatim), and the lock-step convention that GOV-12 relies on to keep the aggregator honest is editor-discipline only. As the inlined surface grows, the silent-drift hazard grows with it.

## Spec Documents

- `docs/spec.md` — *Orientation > Scope > Hard ceilings* aggregator bullet, items 1–4 and tail paragraph (edited)
- `docs/spec_topics/governance.md` — GOV-12 (read-only; defines the aggregator-is-informative rule)
- `docs/spec_topics/hard-ceilings.md` — owner of HC3-a…HC3-e, the per-boundary table, CIO-1…CIO-6, the `masked` field, NOCEIL-1…NOCEIL-4 (read-only; possibly edited under option B if a re-anchoring is preferred)
- `docs/spec_topics/invocation.md` — owner of `loom/runtime/invoke-depth-exceeded` (read-only)
- `docs/spec_topics/errors-and-results.md` — owner of `QueryError` variants (read-only)
- `docs/spec_topics/schema-subset.md` — owner of the depth-walk and the canonical depth-violation message (read-only)
- `docs/spec_topics/binder.md` — owner of the failure-mode templates that ceiling #3 routes through (read-only)

## Plan Impact

**Phases:** V11, V14, V16, V18

**Leaves (implementation order):**

- V11i — Runtime depth cap of 5 — (option-dependent: link-target migration only)
- V14e — Pi tool wired into `@` queries as model-callable — (option-dependent)
- V16n — Binder transport failure single retry — (option-dependent; cites `spec.md#hard-ceiling-3`)
- V16o — Binder malformed envelope handling — (option-dependent; cites `spec.md#hard-ceiling-3`)
- V16p — AJV validation of `args` post-default-merge — (option-dependent; cites `spec.md#hard-ceiling-3`)
- V18m — Panic routing: slash-command surface — (option-dependent; cites `spec.md#no-additional-ceilings`)
- V18n — Panic routing: `invoke` parent surface — (option-dependent; cites `spec.md#no-additional-ceilings`)
- V18p — `AbortSignal` before and during the binder LLM call — (option-dependent; cites `spec.md#hard-ceiling-3`)

(All leaves cite the aggregator only as a navigational anchor — none depend on the aggregator's *content*. Under any option that preserves the `#hard-runtime-ceilings`, `#hard-ceiling-3`, `#ceiling-interaction-order`, and `#no-additional-ceilings` HTML anchors at their current locations, no leaf body needs editing. Under the trim option (A) the four anchors must either remain in place or migrate to `hard-ceilings.md` and the leaf-side links retargeted in the same commit.)

## Consequence

**Severity:** advisory

If left as-is, the spec ships with two parallel statements of the same wire shapes and sub-obligation labels (the aggregator and the owner pages). Implementers can still build a working system because GOV-10's plan-leaf reading scope routes them to the topic pages, not the aggregator. The cost is paid by future spec maintainers: any wire-shape evolution (a new `QueryError` field, a renamed diagnostic code, an HC3-* split) must be patched in two places, and GOV-12 explicitly states no CI gate can catch the omission. The risk surface scales with the number of duplicated tokens, which is currently large.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Decision-time merge: T28 absorbed (ceiling #4 schema-kind list expanded to five labels per T28 Option A in the same aggregator-trim commit). See T28 stub.

### Option A — Trim aggregator to enumeration-and-link

**Approach.** Reduce each of the four numbered items to (i) the ceiling's name, (ii) its load-time/runtime classification, (iii) its routing-class one-liner (the wording GOV-12 already authorises), and (iv) a single forward-link to its owner page. Strip the inlined error-code shapes, the `schema_keyword`/canonical-message restatements, the HC3-/CIO-/NOCEIL-/`masked` enumerations from the tail paragraph, and the slash-load cross-routing sentence. Keep the four `<a id="…">` anchors (`#hard-runtime-ceilings`, `#hard-ceiling-3`, `#ceiling-interaction-order`, `#no-additional-ceilings`) at their current locations so the eight cited plan leaves continue to resolve without edit. The cross-ceiling note collapses to one sentence: "Cross-ceiling content (sub-obligations, the per-boundary table, the interaction order, the `masked` field, and the non-existence claims) is owned by [Hard Runtime Ceilings](./spec_topics/hard-ceilings.md)."

**Spec edits.**

- `docs/spec.md` line 56 — rewrite the four numbered rows to the four-field shape above; delete the inlined error codes and the inlined sub-obligation enumerations from the tail paragraph.
- `docs/spec.md` lines 60, 63 — preserve the `<a id="hard-ceiling-3">`, `<a id="ceiling-interaction-order">`, `<a id="no-additional-ceilings">` anchors verbatim.
- `docs/spec.md` line 65 — keep the GOV-12 lock-step parenthetical or fold it into one sentence.

**Pros.** Removes the drift surface entirely; aligns the aggregator with GOV-12's "enumerate, don't restate" intent; makes the page shorter and easier to scan as orientation; co-resolves the sibling aggregator-prescription findings on the same bullet.

**Cons.** A single-page reader (one who lands on `spec.md` without traversing forward-links) loses inline visibility of the wire shapes. Mitigated by GOV-10, which scopes implementers to topic pages anyway.

**Risks.** None at the citation layer if the four anchors stay put. If the anchors are also migrated, the eight plan leaves above need link-target updates in the same commit.

### Option B — Keep the content, mark it explicitly as informative restatement

**Approach.** Leave the four-row content as-is. Add a single italicised lead-in to the aggregator's prose head — e.g. "*The error-code shapes, sub-obligation labels, and routing prose below are restated from the cited owner pages for orientation; the cited topics are normative.*" — and add a brief "see [GOV-12](…)" reminder at the head of any restated identifier cluster.

**Spec edits.**

- `docs/spec.md` line 56 — insert the italicised informative-restatement lead-in immediately after the existing "Orientation aggregator" sentence.
- Optionally annotate each restated error code with a `(restated from [path])` parenthetical at first occurrence in the bullet.

**Pros.** Zero structural change; preserves single-page-reader convenience; no plan-leaf or anchor disturbance.

**Cons.** Does not reduce the drift hazard — it only documents it. GOV-12 already names the convention; restating it locally is itself a duplication of GOV-12's text. Lengthens an already long bullet rather than tightening it.

**Risks.** Future maintainers reading the lead-in may treat the restated codes as decorative and let drift accumulate; the editorial burden is unchanged.

### Recommendation

Option A. The aggregator's stated purpose under GOV-12 is enumeration, and the cost of trimming is borne entirely by the maintenance side (GOV-10 already routes implementers off `spec.md` for normative content). Preserve the four existing `<a id="…">` anchors so the eight plan leaves remain link-stable; the trim is a pure prose edit at the spec level. Edge cases the implementer must watch: (1) the GOV-12 lock-step parenthetical at the end of the bullet should be deleted along with the trim — it duplicates GOV-12's own rule; (2) the canonical depth-violation message, if removed from the aggregator, should not also be removed from `schema-subset.md` (it is the owner there); (3) verify after the edit that no in-corpus link targets a phrase inside the trimmed text rather than the four named anchors.

## Relationships

- T28 "Ceiling #4 aggregator: schema-kind list of length 4 paired with 'five enforcement points'" — same-cluster (same row of the aggregator).
- T29 "Pre-evaluation exclusion clause names ceiling #3 only; ceiling #4's slash-load `params` arm is also pre-evaluation" — same-cluster.
- T30 "Ceiling #4's model-driven row is neither panic nor `Err`, contradicting the trichotomy paragraph's qualifier" — same-cluster.
- T31 "Hard-ceiling closure asserted at the aggregator without pointing at the backing audit" — same-cluster.
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — same-cluster (same placement complaint applied to a different aggregator).
- T44 "`HC3-a`–`HC3-e` and `NOCEIL-N` labels escape GOV-3 detection and GOV-8 governance" — must-precede (if HC3-/NOCEIL- are formalised as `CEIL-N` REQ-IDs, the aggregator's restated identifier list must be retargeted at the new IDs in the same commit; trimming the aggregator first reduces the surface that retargeting touches).

---

# T28 — Ceiling #4 aggregator: schema-kind list of length 4 paired with "five enforcement points"

**Original heading:** Ceiling #4: 4 named schema kinds but 5 enforcement points stated
**Original section:** docs/spec.md — Orientation > Scope > Hard ceilings
**Kind:** consistency
**Importance:** medium

**STATUS:** Merged into T27 on 2026-05-08. T28 chose Option A (expand ceiling #4 schema-kind list to five labels: typed-query response / model-driven tool-arg / code-driven tool-arg / `params` / `invoke<T>` return). The five-label expansion lands in the same aggregator-trim commit as T27 Option A. The body below is retained for traceability; the actionable hardened recommendation lives in T27.

## Finding

The Hard-ceilings aggregator bullet for ceiling #4 in `docs/spec.md` (line 61) reads "JSON-document depth 5 against typed-query / tool-arg / `params` / `invoke<T>` return schemas" — a four-element list of schema kinds — and then refers in the same sentence to "the per-boundary destination/surface table (five enforcement points)." A reader counting the items cannot reconcile the 4 vs. 5: nothing in spec.md explains which kind splits, or whether one item is being doubled, or whether the count is a typo.

The owner page resolves the discrepancy. `docs/spec_topics/hard-ceilings.md` § Per-boundary destination/surface table enumerates exactly five rows: typed-query response, tool-call args (model-driven), tool-call args (code-driven), `params` validation, `invoke<T>` return value. CIO-3 on the same page repeats the five-site list in the same order, and the "Five-site list co-edit obligation" makes the cardinality 5 a normative invariant maintained in lockstep across hard-ceilings.md and PIC-1. The split that produces 5 is therefore in **tool-arg** (model-driven vs. code-driven), not in `params` or in any other label.

The spec.md aggregator collapses that split into the single label "tool-arg" and then quotes the count "five" without acknowledging the collapse, so the aggregator is internally inconsistent and silently desynchronised from the canonical five-site enumeration that GOV-12 / the co-edit obligation are meant to keep in step.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Hard ceilings, ceiling #4 row (edited)
- `docs/spec_topics/hard-ceilings.md` — Per-boundary destination/surface table (ceiling #4); CIO-3; Five-site list co-edit obligation (read-only)
- `docs/spec_topics/pi-integration-contract.md` — PIC-1 per-site reachable-mask-domain table (read-only; one of the three sites the co-edit obligation already binds together)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is wording inside an orientation aggregator. No leaf's acceptance criteria reference the spec.md aggregator's enumeration shape; the leaves that own per-boundary enforcement (V4g, V6, V11i, V14, V16q, plus the `invoke<T>` return path) anchor on the per-boundary table in `hard-ceilings.md`, which already enumerates five sites correctly.

## Consequence

**Severity:** advisory

A first-time reader hits an off-by-one between adjacent clauses in the same sentence and must navigate to `hard-ceilings.md` to find out which of the four labels splits. No implementer would diverge in behavior — the per-boundary table is unambiguous — but the aggregator is exactly the page GOV-12 designates as the visible summary, and an inconsistent summary undermines the cross-page lock-step convention. It also means a future leaf that adds a sixth enforcement site can update the canonical table without anyone noticing the aggregator no longer matches.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Resolved by merge into T27 — see STATUS banner at top of this finding.

### Option A — Expand the schema-kind list to five items

**Approach.** Replace the four-item label list in spec.md ceiling #4 with the five labels used by the per-boundary table, splitting "tool-arg" into its model-driven and code-driven arms.

**Spec edits.**

- `docs/spec.md` line 61, opening clause of ceiling #4:
  - Before: "**JSON-document depth 5** against typed-query / tool-arg / `params` / `invoke<T>` return schemas *(runtime)*"
  - After:  "**JSON-document depth 5** against typed-query response / model-driven tool-arg / code-driven tool-arg / `params` / `invoke<T>` return schemas *(runtime)*"
- The "(five enforcement points)" parenthetical later in the same sentence then matches the list verbatim.

**Pros.**
- Aggregator becomes self-consistent without a forward-trip.
- Aggregator and per-boundary table use identical row labels, strengthening the GOV-12 / Five-site co-edit obligation: any future row split or merge produces visible drift in both places.
- Reader sees, at the orientation level, that model-driven vs. code-driven tool-arg are distinct surfaces — a distinction that matters because only the model-driven row produces no `Err` on the loom-code side.

**Cons.**
- Marginally longer ceiling #4 line in the aggregator.

**Risks.** None material; the new labels are quoted verbatim from existing canonical text.

### Option B — Drop the count, defer cardinality to the per-boundary table

**Approach.** Keep the four-label "schema-kinds" framing in spec.md but remove the numeric "(five enforcement points)" and let the linked per-boundary table own the cardinality.

**Spec edits.**

- `docs/spec.md` line 61, second sentence: replace "the per-boundary destination/surface table (five enforcement points) and the cross-ceiling slash-load handoff are owned by …" with "the per-boundary destination/surface table and the cross-ceiling slash-load handoff are owned by …".

**Pros.**
- Smallest possible edit; leaves the existing four-grouping summary intact.
- Eliminates the literal count from the aggregator, removing one drift surface.

**Cons.**
- Reader loses the at-a-glance signal that the boundary count is 5, not 4 — i.e., that "tool-arg" hides an internal split.
- The Five-site list co-edit obligation now binds three sites (per-boundary table, CIO-3, PIC-1) with no echo at the aggregator level, weakening orientation visibility.

**Risks.** Future readers may continue to assume the schema-kind groupings and the boundary count coincide.

### Recommendation

Option A. The Five-site list co-edit obligation already pins the cardinality at 5 across `hard-ceilings.md` (per-boundary table + CIO-3) and `pi-integration-contract.md` (PIC-1); the spec.md aggregator should join that lockstep set rather than abstract over it, since GOV-12's purpose is precisely to make divergence between the aggregator and the canonical enumeration visible. The model-driven vs. code-driven split is also semantically load-bearing — the model-driven row is the only enforcement point whose surface is silent at the loom-code level — so surfacing it at orientation rather than burying it in the topic page improves first-read accuracy. Edge case for the implementer of the edit: keep the order of the five labels identical to the per-boundary table and to CIO-3, since the Five-site list co-edit obligation's wording ("in the same order and with the same row labels") makes the order itself a normative invariant.

## Relationships

- T29 "Pre-evaluation exclusion clause names ceiling #3 only; ceiling #4's slash-load `params` arm is also pre-evaluation" — same-cluster (same ceiling #4 row).
- T30 "Ceiling #4's model-driven row is neither panic nor `Err`, contradicting the trichotomy paragraph's qualifier" — same-cluster (same ceiling #4 row).
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — co-resolve (the broader trim of the Hard ceilings aggregator naturally includes reconciling the schema-kind list with the boundary count).

---

# T29 — Pre-evaluation exclusion clause names ceiling #3 only; ceiling #4's slash-load `params` arm is also pre-evaluation

**Original heading:** Ceiling #4 slash-load arm not excluded from the trichotomy paragraph's exclusion clause
**Original section:** docs/spec.md — Orientation > Scope > Hard ceilings
**Kind:** consistency
**Importance:** high

**STATUS:** Merged into T30 on 2026-05-08. The pre-evaluation exclusion clause edit (extending the clause to name ceiling #4's slash-load `params` arm) lands in the same commit as T30 Option A's trichotomy carve-out — both edit the Overview terminal-outcomes paragraph and the `errors-and-results.md` mirror sentence. The body below is retained for traceability; the actionable hardened recommendation lives in T30.

## Finding

The terminal-outcomes paragraph in `docs/spec.md` defines the success / fail / cancelled trichotomy and lists, parenthetically, which hard-ceiling breaches are *not* evaluation outcomes. The exclusion clause names exactly one ceiling: "the load-time binder cap is excluded (see ceiling #3 …)". The matching exclusion sentence on the topic page (`spec_topics/errors-and-results.md` — *Terminal outcomes*) repeats the same single carve-out.

But the Hard-ceilings bullet for ceiling #4 in the same `spec.md` Scope subsection explicitly states that ceiling #4's slash-load `params` arm "cross-routes through ceiling #3's load-time classification", and the per-boundary table in `spec_topics/hard-ceilings.md` (`#ceiling-4-table`, slash-load row) confirms it: that arm fires at slash-load time, surfaces through the binder's AJV-on-`args` failure-mode template (HC3-c, no-retry), produces no `Result` value, and is "Not an evaluation outcome". CIO-1 in the same page reinforces this — "the slash-load `params` arm of ceiling #4 also occurs at slash-load time and is routed by ceiling #3's failure-mode templates". So one of ceiling #4's five enforcement points is pre-evaluation by exactly the same logic that excludes ceiling #3 from the trichotomy.

The pre-evaluation failure enumeration in `errors-and-results.md` (item 5: "binder LLM-call exhaustion (per … ceiling #3)") aggravates the gap: its title scopes item 5 to LLM-call budget exhaustion, even though the body of HC3 — and the slash-load arm of #4 that piggybacks on HC3-c — covers the AJV-on-`args` no-retry path as well. A reader who consults only the spec.md trichotomy paragraph and the seven-item list would conclude that a depth-6 `params` payload at slash-load time produces an evaluation outcome (an `Err`), which contradicts the per-boundary table.

## Spec Documents

- `docs/spec.md` — Overview, terminal-outcomes paragraph (`<a id="terminal-outcomes-aggregator">`) (edited)
- `docs/spec.md` — Orientation > Scope > Hard ceilings, ceiling #4 row and surrounding prose (read-only — already states the cross-route correctly)
- `docs/spec_topics/errors-and-results.md` — *Terminal outcomes* paragraph and the closed seven-item pre-evaluation list (edited)
- `docs/spec_topics/hard-ceilings.md` — *Per-boundary destination/surface table (ceiling #4)* slash-load row and CIO-1 (read-only — source of truth for the cross-routing)
- `docs/spec_topics/binder.md` — *Failure-mode templates* (AJV-on-`args` row) and *Failure-class taxonomy* (read-only — confirms the slash-load arm surfaces through HC3-c's template)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The closing leaves V11i (depth-walk service) and V16p (post-default-merge AJV validation including a depth-6 `params` test that asserts the system-note template) already implement the slash-load arm as a load-time, non-evaluation-outcome surface. Their **Adds** / **Tests** / **Ships when** acceptance criteria are consistent with the per-boundary table; they remain unchanged by this finding. The fix is confined to spec prose.

## Consequence

**Severity:** correctness

A reader who relies on the spec.md trichotomy paragraph (and the topic page's mirroring sentence) for the closed enumeration of pre-evaluation failures would model the slash-load `params` arm of ceiling #4 as an evaluation `Err`, route it onto a `Result` surface visible to loom code, and skip the load-time system-note rendering. A second reader who consults the per-boundary table would route it correctly. The two implementations would diverge on a load-failure surface that has both an operator-visible system-note contract and a "loom does not start" guarantee.

## Solution Space

**Shape:** single

### Recommendation

Make the pre-evaluation carve-out explicit at every site that names it, and tighten the seven-item list to admit the cross-routed arm.

1. **`docs/spec.md` — Overview, terminal-outcomes paragraph.** Replace "the load-time binder cap is excluded (see ceiling #3 …)" with: "the load-time pre-evaluation paths are excluded — namely ceiling #3 (the binder per-class retry budget) and ceiling #4's slash-load `params` arm, which cross-routes through ceiling #3's load-time classification per [Hard Runtime Ceilings — Per-boundary destination/surface table (ceiling #4)](./spec_topics/hard-ceilings.md#ceiling-4-table)". Keep the existing forward-link to *Errors and Results — Terminal outcomes* for the closed pre-evaluation enumeration.

2. **`docs/spec_topics/errors-and-results.md` — *Terminal outcomes*, **Failure** bullet.** Mirror the same wording: "… exhausted a runtime-class hard ceiling … the load-time pre-evaluation paths (ceiling #3 and ceiling #4's slash-load `params` arm) are excluded — see the per-boundary table linked from ceiling #4 …".

3. **`docs/spec_topics/errors-and-results.md` — pre-evaluation seven-item list.** Either:
   - (a) Re-title item 5 from "binder LLM-call exhaustion (per ceiling #3)" to "binder pipeline failure (per ceiling #3 — covering transport-class HC3-a, malformed-envelope HC3-b, AJV-on-`args` HC3-c including the slash-load arm of ceiling #4 that cross-routes through HC3-c, and the worst-case-three-call sum HC3-d/HC3-e)"; or
   - (b) Split item 5 into two list items — "5a. binder retry-budget exhaustion (HC3-a, HC3-b)" and "5b. binder AJV-on-`args` failure (HC3-c) — including the slash-load arm of ceiling #4 that surfaces through HC3-c's template".

   Option (a) keeps the list at seven and is preferred because the GOV-12 lock-step convention (and the leaf coverage in V16n / V16o / V16p / V11i) is already organised around HC3 as a single ceiling that owns multiple sub-classes. Option (b) is acceptable if a future leaf needs to reference the AJV-on-`args` arm by ordinal.

4. **Edge cases for the implementer.** The depth-walk's pre-AJV ordering (`schema-subset.md` *Depth Enforcement*, CIO-3) means the slash-load `params` arm always surfaces with `<ajv-summary> = "<JSON-Pointer> JSON document depth exceeds 5"` rather than a regular AJV-keyword failure. The exclusion-clause edits MUST NOT imply the surface text differs between the AJV-on-`args` row and the depth-walk-on-`args` row — both render through the *AJV validation of the binder's `args` failed (no retry)* template in `binder.md` § *Failure-mode templates*; only the `<ajv-summary>` placeholder content differs. The HC3-d worst-case-three-call sum is unaffected.

## Relationships

- T30 "Ceiling #4's model-driven row is neither panic nor `Err`, contradicting the trichotomy paragraph's qualifier" — co-resolve (same paragraph; both edits land together).
- T28 "Ceiling #4 aggregator: schema-kind list of length 4 paired with 'five enforcement points'" — same-cluster.
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — must-precede (if that finding's recommendation reduces the Overview paragraph to a one-sentence summary, the exclusion-clause edit lands on `errors-and-results.md` only).

---

# T30 — Ceiling #4's model-driven row is neither panic nor `Err`, contradicting the trichotomy paragraph's qualifier

**Original heading:** Ceiling #4 "boundary-dependent" routing class incompatible with trichotomy's "panic or `Err`" qualifier
**Original section:** docs/spec.md — Orientation > Scope > Hard ceilings
**Kind:** consistency
**Importance:** high

## Finding

The Overview's terminal-outcomes paragraph (`spec.md` line 10) says a loom evaluation fails by returning `Err`, by panicking, or "by exhausting one of the runtime-class [hard ceilings](#hard-runtime-ceilings) below — ceilings whose routing class is panic or `Err`". The Hard-ceilings aggregator (`spec.md` line 56) then declares ceiling #4 "runtime-class at four of its five enforcement points" with routing class **boundary-dependent**, deferring the destinations to the per-boundary table on `hard-ceilings.md`.

That table contradicts the qualifier. Ceiling #4's model-driven tool-arg row (`hard-ceilings.md` line 28) routes neither to a panic nor to an `Err`: the depth violation is materialised as a tool-error result fed back to the model as the next user turn, the round counts against `tool_loop.max_rounds`, and the loop continues. V14e in `plan_topics/v14-tool-calls.md` makes this concrete and explicit ("does **not** surface as `ModelToolError` … and does **not** terminate the query"). The same panic-or-`Err` qualifier is restated in `errors-and-results.md` line 55, so any reader cross-checking spec.md against its owner page sees both repeat the claim and both omit the model-driven row's third surface.

The result is that a reader cannot tell, from the trichotomy paragraph alone, whether the model-driven row is in fact a fail-arm event (it isn't — it is an in-loop signal that may *eventually* contribute to ceiling #2 exhaustion, which then routes via `Err`), or whether the spec is internally inconsistent. `schema-subset.md` line 49 already gets the wording right ("boundary-dependent, not uniformly 'recoverable `Err`'"); the aggregator and its owner page lag behind.

## Spec Documents

- `docs/spec.md` — Overview > terminal-outcomes paragraph (edited)
- `docs/spec.md` — Orientation > Scope > Hard ceilings, ceiling #4 row (option-dependent)
- `docs/spec_topics/errors-and-results.md` — Failure bullet under Terminal outcomes (edited)
- `docs/spec_topics/hard-ceilings.md` — Per-boundary destination/surface table (read-only)
- `docs/spec_topics/schema-subset.md` — Depth Enforcement / Error shape (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The resolution is spec-text-only. V11i, V6i, V14e, V14f, V15 (`invoke<T>` return / `params` invoke arm), and V16p already encode the actual per-boundary surfaces — including V14e's explicit "tool-error result fed back as the next user turn; round counts against `tool_loop.max_rounds`; not a `QueryError` to loom code". No leaf's tests or acceptance criteria need to change.

## Consequence

**Severity:** correctness

Two reasonable implementers reading only the trichotomy paragraph would diverge on the model-driven row: one would synthesise an `Err(QueryError { kind: "validation", ... })` to loom code on every depth-6 model-emitted tool-arg payload (terminating the query), the other would feed the depth violation back as a tool-error and let the loop continue. Only the second matches `hard-ceilings.md` and V14e. The first produces wrong behaviour on every depth-6 model payload that the model could otherwise have repaired within `tool_loop.max_rounds`.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Decision-time merge: T29 absorbed (pre-evaluation exclusion clause extended to name ceiling #4's slash-load `params` arm in same commit; both edit the Overview terminal-outcomes paragraph and the `errors-and-results.md` mirror sentence). See T29 stub. Ordering note: land **after** T26 (terminal-outcomes paragraph trim) so the spec.md half collapses; the carve-out content survives on `errors-and-results.md` regardless.

### Option A — Carve the model-driven row out of the qualifier

**Approach.** Keep the trichotomy paragraph's "panic or `Err`" qualifier as describing what *terminates the query in the fail arm*; explicitly note that ceiling #4's model-driven tool-arg row is an in-loop signal whose depth violation is delivered to the model and does not by itself terminate the query (any resulting query-termination flows through ceiling #2's recoverable `Err`).

**Spec edits.**
- `spec.md` line 10: replace "ceilings whose routing class is panic or `Err`" with "ceilings whose query-terminating routing class is panic or `Err` (ceiling #4's model-driven tool-arg row is an in-loop event that does not by itself terminate the query — see [Hard ceilings](#hard-runtime-ceilings) for the per-arm surfaces)".
- `spec.md` line 56, ceiling #4 paragraph: change "Ceiling #4 is runtime-class at four of its five enforcement points" to "Ceiling #4 is runtime-class at four of its five enforcement points; four of those four query-terminating runtime arms route via panic or `Err`, and the model-driven tool-arg row is an in-loop signal fed back to the model (the slash-load `params` arm cross-routes through ceiling #3's load-time classification per the per-boundary table linked from #4 below)".
- `errors-and-results.md` line 55: parallel edit — append "(ceiling #4's model-driven tool-arg row is in-loop and does not by itself produce an `Err`; if it leads to query termination, that termination flows through ceiling #2's `Err`)" to the parenthetical that already excludes the load-time binder cap.

**Pros.** Preserves the clean shape of the trichotomy (every fail-arm-causing breach is panic or `Err`); makes the in-loop nature of the model-driven row visible at the orientation level; matches `schema-subset.md`'s already-correct wording.

**Cons.** Adds a clause to a paragraph the spec-review separately flags as overstuffed.

**Risks.** Minimal — the carve-out reflects existing leaf behaviour.

### Option B — Relax the qualifier to admit a third runtime fail surface

**Approach.** Change "ceilings whose routing class is panic or `Err`" to "ceilings whose routing class is panic, `Err`, or model-visible tool-error feedback". Restate the same enumeration on `errors-and-results.md`.

**Spec edits.**
- `spec.md` line 10: replace the qualifier as above.
- `errors-and-results.md` line 55: parallel edit.
- `spec.md` line 56, ceiling #4 paragraph: no edit needed; "boundary-dependent" already covers the third surface.

**Pros.** Smaller textual change; does not introduce a "query-terminating" qualifier that the spec has not previously used.

**Cons.** Conflates a query-terminating outcome (panic, `Err`) with an in-loop signal that the model is invited to repair. The fail-arm enumeration becomes less crisp: a reader scanning the trichotomy paragraph would reasonably expect "model-visible tool-error feedback" to be a terminal outcome on its own, but it is not (the loop continues). Pushes the "this is not by itself terminal" clarification down to the per-boundary table.

**Risks.** Encourages misreading the model-driven row as a terminal outcome; works against the trichotomy's purpose as the orientation contract for *what ends a query*.

### Recommendation

Adopt **Option A**. The trichotomy paragraph's job is to enumerate query-terminating outcomes; the model-driven row of ceiling #4 is not one. Carving it out preserves the trichotomy's normative shape and aligns spec.md with `hard-ceilings.md`, V14e, and the already-correct wording on `schema-subset.md`. Edge cases the implementer must watch:

- The Hard-ceilings aggregator (`spec.md` line 56) currently lumps the model-driven row in with "runtime-class at four of its five enforcement points"; the edit must distinguish *runtime-class* (true of all four runtime arms) from *query-terminating* (true of three). Both notions appear in adjacent sentences; do not collapse them.
- The same carve-out wording must land in `errors-and-results.md` line 55 in the same commit, since it restates the qualifier verbatim. Without that, the next reviewer hits the same inconsistency one document over.
- Do not extend the carve-out to the slash-load `params` arm — that arm is already excluded by the existing "load-time binder cap is excluded" clause via its cross-route through ceiling #3, and the related-finding on the slash-load arm tracks that fix separately.

## Relationships

- T29 "Pre-evaluation exclusion clause names ceiling #3 only; ceiling #4's slash-load `params` arm is also pre-evaluation" — co-resolve (same paragraph; both edits land together).
- T28 "Ceiling #4 aggregator: schema-kind list of length 4 paired with 'five enforcement points'" — same-cluster.
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — same-cluster.
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — must-precede (if that finding's reduction is adopted, the qualifier this finding edits moves to `errors-and-results.md`).

---

# T31 — Hard-ceiling closure asserted at the aggregator without pointing at the backing audit

**Original heading:** Hard ceilings asserted as a complete closed set of four without audit citation
**Original section:** docs/spec.md — Orientation > Scope > Hard ceilings
**Kind:** assumptions
**Importance:** medium

**STATUS:** Merged into T32 on 2026-05-08. T31 chose Option B (audit-methodology paragraph on `hard-ceilings.md § No additional V1 runtime ceiling applies`, plus a tightened aggregator pointer in spec.md). The methodology paragraph gates T32 Option A's GOV-15 carve-out for V1.x ceiling additions and lands in the same commit. The body below is retained for traceability; the actionable hardened recommendation lives in T32.

## Finding

The Hard-ceilings bullet in `spec.md` opens with "The complete V1 set of hard ceilings is the four below" — a closure claim treated as fact. The aggregator gives no inline pointer to whatever evidence backs the closure; a reader has no path from "four" to "and here is why a fifth cannot exist."

The owning topic page does carry that evidence. `hard-ceilings.md` § *No additional V1 runtime ceiling applies* enumerates four non-existence claims `NOCEIL-1 … NOCEIL-4`, each fixing one axis the runtime is *not* ceilinged on (wall-clock timeouts, response/cumulative tokens, runtime-value memory, host-language stack depth) and naming the surface that any breach falls through to instead (`loom/runtime/internal-error` for catchable host allocation/stack failures; uncatchable host fatals terminate the process). `spec.md` line 63 forward-links those four claims, but as part of a bundle of cross-ceiling content, not as the closure receipt for the headline assertion three lines above.

Two distinct audit-trail gaps remain. (a) The aggregator sentence asserts closure without naming the receipt. (b) Even on the owner page, the closure rests on a hand-picked four-axis taxonomy (`{ time, tokens, memory, stack }`) with no record of the methodology that established that this axis set is itself exhaustive — no `grep`-and-shape pattern, no enumeration of the candidate axes considered and rejected, no rule binding the next spec-editor to re-run the same check when adding a ceiling under GOV-12. The original framing's specific examples (regex backtracking, schema width, pattern-match recursion) mostly resolve against existing rules — `expressions.md` lines 75–76 forbid regex in `split`/`replace`, `schema-subset.md` line 16 rejects `maxProperties` and friends at parse time, and pattern-match recursion falls through NOCEIL-3/4 — but the absence of a documented method to demonstrate that result is the load-bearing problem.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Hard ceilings (edited)
- `docs/spec_topics/hard-ceilings.md` — No additional V1 runtime ceiling applies (option-dependent)
- `docs/spec_topics/governance.md` — GOV-12 (read-only)
- `docs/spec_topics/expressions.md` — string built-ins (read-only; rules out one candidate implicit ceiling)
- `docs/spec_topics/schema-subset.md` — Explicitly-rejected JSON Schema keywords (read-only; rules out another)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The `NOCEIL-3` panic-source closure is already exercised by V18m / V18n (catchable `RangeError` arms route through `loom/runtime/internal-error`); no leaf currently tests the four-ceiling closure as such, and neither candidate fix changes a leaf's acceptance criteria — the work is spec-side documentation and an optional GOV-12-shaped editor procedure.

## Consequence

**Severity:** advisory

Implementers can build a conformant V1 runtime from the existing text — every observable surface is named and every NOCEIL fall-through is pinned. The cost shows up at spec-evolution time: a future editor introducing a new ceiling under GOV-12 has no documented method for confirming it is genuinely new (vs. a re-statement of an existing axis), and a reviewer auditing the closure has nothing to compare the claim against.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option B. Resolved by merge into T32 — see STATUS banner at top of this finding.

### Option A — Tighten the aggregator phrasing only

**Approach.** Reword `spec.md`'s opening clause so the closure cites its receipt inline: replace "The complete V1 set of hard ceilings is the four below" with something like "The four ceilings below are the V1 set; the closure rests on the four non-existence claims `NOCEIL-1 … NOCEIL-4` (no wall-clock, token, memory, or host-stack ceiling) at [Hard Runtime Ceilings — No additional V1 runtime ceiling applies], which name the fall-through surface for each axis."

**Spec edits.** One sentence in `spec.md` § Hard ceilings (the line beginning "The complete V1 set of hard ceilings is the four below"). No edits on the topic page.

**Pros.** Minimal surface area. Aligns with the existing GOV-12 aggregator/owner split — the aggregator forward-links rather than restating evidence. Makes the receipt visible to a reader who only reads `spec.md`.

**Cons.** Does not document *how* the four-axis NOCEIL set was itself established to be exhaustive; future editors still have no procedure.

**Risks.** Low.

### Option B — Document the audit methodology on the owner page

**Approach.** Add a short methodology paragraph to `hard-ceilings.md` § *No additional V1 runtime ceiling applies* — naming the four candidate-axis families considered (time, token economy, memory/handle exhaustion, frame depth), the rule that any future axis surfaces either as a new ceiling or as a documented fall-through to one of the four NOCEIL surfaces, and a GOV-12 edit obligation that introducing a ceiling MUST add a one-line entry to the methodology paragraph naming the axis it ceilings. Then apply Option A's pointer in `spec.md`.

**Spec edits.** One paragraph appended to `hard-ceilings.md` § *No additional V1 runtime ceiling applies*; the same one-sentence rewording in `spec.md` from Option A; one-line addition to the GOV-12 ceiling-update co-edit list (already present at the end of the same section) naming the methodology paragraph as a required co-edit site.

**Pros.** Closes both gaps — the aggregator points at the receipt, and the receipt is itself auditable. Binds the next spec-editor to a check that survives the current authors.

**Cons.** Adds a methodology section that is itself a non-machine-checkable claim; the closure's quality depends on the editor running the axis check honestly. More edit surface than Option A.

**Risks.** The methodology paragraph could be perceived as guidance rather than a normative gate; mitigated by tying it to GOV-12's existing co-edit obligation list, which already governs the aggregator and per-ceiling owner pages.

### Recommendation

Option B. The cheap rewording in Option A papers over the visible gap but leaves the underlying audit unrecorded; the next editor adding a fifth ceiling under GOV-12 still has no method. Option B costs one paragraph and one bullet on the existing co-edit list and produces a closure that survives author turnover. Edge case for the implementer of the spec edit: the methodology paragraph is the load-bearing artefact — keep it factual (axes considered, fall-through surface for each) and avoid turning it into a justification for the specific limit values, which are owned elsewhere.

## Relationships

- T25 "Forward-compatibility-seam aggregator count is not gated by CI" — same-cluster (sibling closure-without-audit on the adjacent Forward-compatibility-seams bullet).
- T35 "SDK capability inventory closed-set claim has no negative-direction audit" — same-cluster (closed-set assertion in another Orientation bullet).
- T32 "Source-language stability bullet leaves equivalence undefined at the aggregator and silently contradicts the open-set ceiling clause" — must-precede (its sub-issue 3 turns on whether adding a ceiling within V1.x is breaking; resolving the closure-audit question informs the answer).
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — same-cluster (same bullet; the aggregator-trim is compatible with Option B's pointer-insertion).

---

# T32 — Source-language stability bullet leaves equivalence undefined at the aggregator and silently contradicts the open-set ceiling clause

**Original heading:** "Intended to behave identically": vague modal, undefined equivalence, untestable, ceiling interaction unaddressed
**Original section:** docs/spec.md — Orientation > Scope > Source-language stability
**Kind:** clarity, completeness
**Importance:** high

## Finding

The Source-language stability bullet in `spec.md` (Orientation > Scope) reads "A `.loom` or `.warp` file that loads cleanly under V1.0 is intended to load and behave identically under every V1.x release," then forward-links to `governance.md` GOV-15 as the owner. A reader scanning only `spec.md` is given no qualifier on what "behave identically" covers — return values, diagnostic codes, `loom-system-note` content, wall-clock, tokens, and log-line volume are all candidate observables, and the aggregator picks none of them. GOV-15 in fact pins the equivalence to three observables (return values, ordered diagnostic-code sequences, and `loom-system-note` content strings, with timing and counts excluded), but the aggregator passes none of that orientation through, leaving "behave identically" doing the entire load-bearing work of a one-sentence summary.

Two clauses further down the same Scope subsection introduce a substantive contradiction the spec never reconciles. The Hard ceilings bullet states "The complete V1 set of hard ceilings is the four below" and immediately permits "a future V1 leaf that introduces a new ceiling [to update] this bullet… in the same commit per GOV-12." Adding a fifth ceiling in V1.x would, by construction, alter the ordered diagnostic-code sequence and `loom-system-note` content for any input that newly trips it — a direct violation of GOV-15's equivalence promise. Neither GOV-15, GOV-14, nor the Hard ceilings aggregator names this interaction. The reader is left to choose between "the equivalence promise blocks new ceilings in V1.x," "the open-set ceiling clause silently overrides the equivalence promise," or "the two clauses coexist with an implicit exception."

(The original framing also called the equivalence claim "untestable" and asked for golden-file vectors. That framing is foreclosed by GOV-14, which explicitly records the absence of an automated equivalence gate as a V1.0 scope choice rather than a defect, and by GOV-13's retirement note. The polished finding does not pursue testability.)

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Source-language stability (edited)
- `docs/spec.md` — Orientation > Scope > Hard ceilings (edited)
- `docs/spec_topics/governance.md` — GOV-15, GOV-14, GOV-12 (option-dependent)
- `docs/spec_topics/future-considerations.md` — "No formal source-language migration mechanism" entry (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. GOV-15 is intentionally outside the V18s closing-gate set (verified by reading `plan_topics/v18-cancellation.md`'s nine-gate enumeration). The fix is spec-text only; under every option below, no V1 leaf's `Adds`, `Tests`, or `Ships when` change.

## Consequence

**Severity:** correctness

A future V1.x leaf author, told that adding a fifth ceiling is a permitted in-place edit per GOV-12 and the Hard ceilings aggregator, can land such a ceiling in good faith and simultaneously violate GOV-15's diagnostic-code-sequence and `loom-system-note` equivalence for every previously-loading `.loom` / `.warp` input that newly trips it. With no rule naming this interaction, two reviewers reading the same PR will reach opposing verdicts on whether the addition is permissible within V1.x.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Decision-time merge: T31 absorbed (audit-methodology paragraph from T31 Option B lands in same commit; T32's GOV-15 carve-out for V1.x ceiling additions is unsafe without T31's methodology gating the additions). See T31 stub.

### Option A — Carve new ceilings out of GOV-15

**Approach.** Edit GOV-15 to add: "Introducing a new hard runtime ceiling within V1.x is a recognised exception to this equivalence; the equivalence promise is restricted to inputs that, under both releases, do not trip a ceiling absent from V1.0." Mirror the carve-out one-liner on the Hard ceilings aggregator.

**Spec edits.** `governance.md` GOV-15 prose; one parenthetical on `spec.md` Hard ceilings bullet; one parenthetical on `spec.md` Source-language stability bullet referencing the carve-out.

**Pros.** Preserves GOV-12's open-set ceiling discipline. Keeps V1.x bug-fix latitude — a newly-discovered runaway loop or pathological JSON shape can be capped without forcing V2.

**Cons.** Weakens the equivalence promise from "every input" to "every input that does not newly trip a ceiling." Operators relying on the V1.0 diagnostic-code sequence as a contract receive a quiet downgrade.

**Risks.** A V1.x leaf that combines a new ceiling with an unrelated diagnostic-code edit can shelter the latter under the carve-out. Mitigation: the carve-out covers the new ceiling's own diagnostic surface, not collateral edits.

### Option B — Close the ceiling set for V1.x

**Approach.** Edit the Hard ceilings aggregator and `hard-ceilings.md` to state: "The four ceilings below are the closed V1 set; introducing a fifth requires a major-version bump." Drop GOV-12's wording that names "introduces a fifth hard ceiling" as an in-scope aggregator update.

**Spec edits.** `spec.md` Hard ceilings prose; `governance.md` GOV-12's worked-example list; `hard-ceilings.md` opening; `future-considerations.md` to record the deferral.

**Pros.** GOV-15's equivalence promise becomes exception-free against the ceiling axis. A reader can trust that the four ceilings are the only diagnostic-code-sequence-affecting limits they will see in V1.x.

**Cons.** Removes a release-engineering escape valve. A V1.x discovery (e.g. unbounded regex backtracking in lowering, schema-width pathology) cannot be capped at the runtime layer; the only options become a non-ceiling diagnostic, a workaround in the affected topic page, or holding the fix for V2.

**Risks.** Pressure to land a needed cap as a non-ceiling diagnostic, sneaking the same observable change in under a different label.

### Option C — Treat a new ceiling as a major-version trigger by policy

**Approach.** Leave GOV-12 and the Hard ceilings aggregator structurally permissive, but add to GOV-15: "A V1.x release that introduces a new hard runtime ceiling, retires an existing one, or changes the routing class of an existing one is treated as a V2 release for the purpose of this equivalence." The release-numbering policy carries the burden the spec text otherwise would.

**Spec edits.** `governance.md` GOV-15 prose; one cross-reference on the Hard ceilings aggregator.

**Pros.** Preserves the equivalence promise without restricting future engineering. Aligns with how the spec already treats other ceiling-shape changes implicitly.

**Cons.** Pushes a substantive correctness rule into release-numbering policy, which is not otherwise governed by the spec corpus. Creates a forward dependency on a "what is a V2" rule that GOV-15 alone cannot define.

**Risks.** Future maintainers may land a new ceiling under V1.(x+1) and only later notice that the release should have been V2.0; the violation is detected by review, not by CI.

### Recommendation

Adopt **Option A**, plus a one-sentence orientation summary on the `spec.md` Source-language stability bullet that names the three GOV-15 observables and the three exclusions in-line (replacing "intended to load and behave identically").

Option A is the smallest edit that resolves the contradiction without removing the V1.x ceiling-addition latitude that GOV-12 already grants and that `future-considerations.md` implicitly assumes. Option B's closed-set commitment overconstrains release engineering for a property that GOV-14 already records as un-gated; Option C overloads release numbering with a rule the spec corpus does not otherwise own.

Edge cases the implementer (here, the spec editor) must watch: (i) the carve-out covers only the new ceiling's own diagnostic surface — collateral diagnostic-code edits in the same PR remain bound by GOV-15; (ii) retiring or relaxing an existing ceiling has the symmetric effect (an input that previously tripped now succeeds) and should be named in the same carve-out clause; (iii) the aggregator summary of GOV-15 must stay in lock-step with GOV-15 itself per GOV-12.

## Relationships

- T31 "Hard-ceiling closure asserted at the aggregator without pointing at the backing audit" — same-cluster (both touch the open-vs-closed status of the ceiling set).
- T29 "Pre-evaluation exclusion clause names ceiling #3 only" — same-cluster (different cross-clause inconsistency in the same Hard ceilings aggregator).

---

# T33 — Node floor `>=20.6.0` not automatically audited against Pi's `engines.node`

**Original heading:** Node floor `>=20.6.0` asserted as matching Pi's `engines.node` without audit
**Original section:** docs/spec.md — Orientation > Prerequisites > Host runtime
**Kind:** assumptions
**Importance:** medium

**STATUS:** Merged into T03 on 2026-05-08. T33 chose Option A (cross-package `engines.node` equality test in H1 surface-inventory; PIC bump-procedure step 3 rewritten to reference the test). The H1 test extension and PIC bump-procedure rewrite land in the same Host-runtime-item-1 cleanup commit as T03 Option B's `**Loom-package implementation dependencies (V1).**` PIC sub-paragraph. The body below is retained for traceability; the actionable hardened recommendation lives in T03.

## Finding

`spec.md` Host runtime obligation 1 states the loom runtime requires Node `>=20.6.0`, "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor." `pi-integration-contract.md` Step 0 (a) restates the same literal as the canonical pinned floor, and `package.json#engines.node` carries the same string. The "matching" claim is asserted as a fact; nothing in the spec corpus or the test suite mechanically verifies that loom's literal equals Pi's `engines.node` at the pinned `~0.72.1` version.

The H1 `engines.node` literal-read test (per `plan_topics/h1-scaffold.md`) asserts only that loom's own `package.json#engines.node === ">=20.6.0"`. The cross-package match is enforced exclusively by step 3 of the **Pi version bump procedure** (`pi-integration-contract.md`), which instructs the maintainer to compare floors by hand. Under the `~0.72.1` tilde range a patch release of `pi-coding-agent` could raise `engines.node` (e.g. to `>=20.10.0`) without producing any test failure, leaving loom claiming a floor below Pi's actual requirement until the next deliberate bump cycle.

The defect is the audit path, not the current literal: the codebase-grounding lens confirms the floors do match at `~0.72.1`. The aggregator sentence ("matching `@mariozechner/pi-coding-agent`'s `engines.node` floor") makes a Pi-side claim with no automated check standing behind it and no citation of where the check would fail if drift occurred.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Host runtime, item 1 (edited)
- `docs/spec_topics/pi-integration-contract.md` — Step 0 (a); Pi version bump procedure, step 3 (option-dependent)
- `docs/plan_topics/h1-scaffold.md` — `engines.node` literal-read test; SDK surface-inventory test (option-dependent)
- `docs/spec_topics/diagnostics.md` — `loom/load/host-incompatible` `node-floor` discriminator row (read-only)
- `package.json` — `engines.node`, `peerDependencies` (read-only)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** advisory

A patch-level `pi-coding-agent` release that raises `engines.node` within the `~0.72.1` tilde range silently widens the gap between the floor loom advertises and the floor Pi enforces. The runtime would refuse only the lower of the two floors at Step 0 (a), so an operator on a Node version that satisfies loom but not Pi sees an undiagnosed Pi-side failure rather than the `loom/load/host-incompatible` `node-floor` route the spec contracts. No correctness divergence occurs at the present pin; the cost is an audit gap that the bump procedure relies on a human to close.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Resolved by merge into T03 — see STATUS banner at top of this finding.

### Option A — Cross-package equality test in H1

**Approach.** Extend the H1 `engines.node` literal-read test (or add a sibling assertion in `test/extension/pinned-surface.test.ts`) that imports `@mariozechner/pi-coding-agent/package.json` (e.g. `require.resolve(...)` then `JSON.parse(readFileSync(...))`, or a `with { type: "json" }` import) and asserts `pi.engines.node === loom.engines.node` literally. Add a `{ kind: "pi-engines-node", literal: ">=20.6.0" }` row to `SDK_SURFACE_INVENTORY` so the four pinned constants the probe consumes plus the cross-package floor share one source of truth.

**Spec edits.**
- `docs/spec.md` Host runtime item 1: replace "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" with "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test."
- `docs/plan_topics/h1-scaffold.md`: add the new `pi-engines-node` inventory row and a bullet describing the cross-package read in the `engines.node` literal-read test paragraph.
- `docs/spec_topics/pi-integration-contract.md` Pi version bump procedure step 3: replace the manual-compare instruction with "the H1 cross-package `engines.node` test fails red at the bump commit if the upstream floor has moved; update the loom literal, Step 0 (a), and the spec.md sentence in the same edit."

**Pros.** Drift fails red at the bump commit (not at user runtime). Eliminates a manual step from the bump procedure. Single source of truth for the cross-package floor.
**Cons.** Adds one production-package import to H1 (already permitted for the SDK surface-inventory test, so the precedent exists). Test runs fail in environments where `@mariozechner/pi-coding-agent` is not installed — but H1's existing surface-inventory test already requires it.
**Risks.** None material; the read is a single JSON parse of a stable manifest field.

### Option B — Cite the existing manual audit and disclaim auto-detection

**Approach.** Leave the audit manual but make the spec honest about it. Replace the bare "matching" assertion with an explicit citation of the H1 literal-read test (loom side) plus the bump-procedure step 3 (cross-package side), and add an explicit disclaimer that intra-tilde-range upstream drift is detected only at the next bump cycle.

**Spec edits.**
- `docs/spec.md` Host runtime item 1: "The runtime requires Node `>=20.6.0`. The literal is pinned by the H1 `engines.node` literal-read test against `package.json` and re-confirmed against `@mariozechner/pi-coding-agent`'s `engines.node` floor by step 3 of [Pi version bump procedure]; intra-tilde-range upstream drift is detected only at the next bump cycle."
- No plan or PIC edits required.

**Pros.** No new test infrastructure. Honest about the audit path.
**Cons.** Drift still surfaces only at the next bump commit, which may lag the upstream patch release indefinitely. Lengthens an aggregator sentence the doc-level findings already flag as overweight.
**Risks.** Future maintainer skips bump-procedure step 3 silently; the gap reopens.

### Recommendation

Option A. The cost is one additional row in `SDK_SURFACE_INVENTORY` plus a JSON-read assertion in a test file that already imports `@mariozechner/pi-coding-agent`, against the benefit of converting an open-ended "trust the maintainer at bump time" gate into a build-time gate that fails on the same commit that introduces drift. Edge cases the implementer must watch:
- The cross-package read MUST resolve `pi-coding-agent`'s `package.json` via `require.resolve` (or the `exports` map's `./package.json` entry) rather than a hard-coded `node_modules/...` path, so workspace and pnpm hoisting layouts both work.
- The assertion MUST compare strings literally, not via `semver.subset` — the contract is exact-equality, matching the H1 test's existing posture on `engines.node` and `peerDependencies`.
- The bump procedure step 3 narrative MUST be updated in the same edit; otherwise PIC and the test diverge on which side is authoritative.

## Relationships

- T03 "`semver` dependency obligation buried in a non-normative recipe paragraph" — co-resolve (same Host runtime item 1 paragraph; H1 already adds `semver` as a direct dependency).
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (identical drift-under-tilde concern, different surface).
- T37 "Built-artefact path `dist/core/extensions/types.d.ts` cited as the source of truth for Pi-SDK types" — same-cluster (stability of Pi surfaces across minor bumps under the tilde range).

---

# T34 — Trust-boundary "no privilege facet" claim is asserted but not gated by any audit the spec cites

**Original heading:** ExtensionAPI exposes no privilege facet: assertion unverified
**Original section:** docs/spec.md — Orientation > Scope > Trust boundary
**Kind:** assumptions
**Importance:** medium

## Finding

The Trust-boundary bullet in spec.md asserts as fact that Pi's `ExtensionAPI`, `ExtensionContext`, and (by inheritance) `ExtensionCommandContext` "expose no per-extension privilege facet" and that "Pi exposes no per-extension privilege scoping the runtime can rely on as a security boundary." The runtime's entire V1 trust posture (no sandbox, no mediation layer, `tools:` is configuration not security) is justified on top of that assertion.

The claim is empirically true at the pinned `~0.72.1` version — the `ExtensionContext` member surface enumerated in `pi-integration-contract.md` and the touched `ExtensionAPI` members carry no field whose name or type signals per-extension privilege. But spec.md does not show that audit, and the gate it forwards to as the catch-on-drift mechanism — "the build-time SDK surface-inventory assertion run by [Pi version bump procedure]" — does not in fact perform a privilege-facet check. The H1 surface-inventory test (per `plan_topics/h1-scaffold.md`) enumerates exactly the seven factory-probable capabilities, the `AbortSignal` member-with-kind list, the Node floor, and the peer-dep range. A Pi 0.73 minor that adds, say, `ExtensionContext.requestCapability(...)` or a `privilegeScope` field would pass every existing inventory entry — none of them enumerate the full surface of `ExtensionAPI` / `ExtensionContext` / `ExtensionCommandContext`, only the named members the runtime calls.

The result is a security disclaimer resting on a closed-set claim that no test mechanizes. The disclaimer does not falsely describe today's Pi, but the cited build-time gate cannot deliver the "would surface at the SDK surface-inventory assertion" guarantee the trust-boundary sentence promises.

## Spec Documents

- `docs/spec.md` — Orientation > Scope > Trust boundary (edited)
- `docs/spec_topics/pi-integration-contract.md` — `ExtensionContext`, `ExtensionCommandContext`, SDK capability inventory, Pi version bump procedure (edited)
- `docs/spec_topics/future-considerations.md` — Known V1 limitations: no per-loom sandbox or capability model (read-only)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The H1 leaf owns the SDK surface-inventory test (`test/extension/pinned-surface.test.ts`) and its `SDK_SURFACE_INVENTORY` constant. That is where a privilege-facet-absence audit must land if it is to be the gate the spec promises.

## Consequence

**Severity:** advisory

V1.0 ships correctly: the absence claim is true at the pinned version, so no implementer following the spec produces a wrong runtime today. The defect surfaces at the next Pi minor bump — if Pi introduces a privilege facet, the cited gate does not catch it, and the trust-boundary disclaimer silently goes stale before any reviewer is alerted. The runtime can then ship with a no-mediation posture that no longer matches Pi's surface.

## Solution Space

**Shape:** single

### Recommendation

Convert the inline absence claim into a forward-link to a build-time audit that actually exists, and add the audit to the H1 surface inventory.

Concretely:

1. **PIC (`pi-integration-contract.md`).** Add a `**Per-extension privilege facet — closed-set audit.**` paragraph under the SDK capability inventory section. State the closed predicate the audit checks: "no exported member of `ExtensionAPI`, `ExtensionContext`, or `ExtensionCommandContext` declared in `dist/core/extensions/types.d.ts` of the pinned `@mariozechner/pi-coding-agent` matches any of the privilege-shaped name patterns `/privilege|permission|grant|capability(?!-name)|scope(?!-id)|role|sandbox|mediator|trust/i`, and no member's TypeScript type contains those tokens." Cite the version-bump procedure as the consumer.
2. **H1 inventory constant.** Add a new entry kind to `SDK_SURFACE_INVENTORY`:
   `{ kind: "no-privilege-facet", surfaces: ["ExtensionAPI", "ExtensionContext", "ExtensionCommandContext"], denyPattern: "<the regex from PIC>" }`.
   The test enumerates every own/inherited member name (and, via `ts.TypeChecker` against the imported `.d.ts`, every type-level token) of the three named interfaces from the resolved `@mariozechner/pi-coding-agent` package and asserts no name or type matches the deny-pattern. A red here on a future bump triggers step 7-bis of the version-bump procedure: if a true privilege facet has appeared, file the spec edit before widening `peerDependencies`.
3. **spec.md Trust boundary.** Replace `"expose no per-extension privilege facet"` with `"carry no per-extension privilege facet under the closed-set audit owned by [Pi Integration Contract — Per-extension privilege facet — closed-set audit]"`, and replace the "would surface at the build-time SDK surface-inventory assertion" sub-clause with a forward-link to that same anchor. spec.md no longer asserts the closed set directly; PIC owns the predicate, H1 mechanizes it.

Edge cases the implementer must watch:

- `ExtensionContext` extends a Pi-side interface chain (`ReadonlySessionManager` and friends). The audit must walk inherited members, not just own members, or a privilege facet introduced on a parent interface escapes the deny-pattern. Use `ts.TypeChecker.getPropertiesOfType(...)` against the resolved interface symbol.
- The deny-pattern uses negative lookahead for `capability-name` and `scope-id` because the existing SDK already names `customTools` arrays and session scopes that are not privilege facets; tune the negative lookaheads against the pinned shape, not against generic English. Document the pattern's exclusions inline so a future widening is visible.
- The audit is co-pinned with `dist/core/extensions/types.d.ts`. The separate finding on `dist/core/extensions/types.d.ts` applies — prefer resolving the types via the package's `exports` map rather than the dist path, so a Pi build-output reshuffle does not silently turn the audit green.

## Relationships

- T16 "Trust boundary bullet conflates scope decision with normative contracts and a deferral" — co-resolve (same Trust-boundary edit pass).
- T35 "SDK capability inventory closed-set claim has no negative-direction audit" — same-cluster (a sibling closed-set-without-audit defect).
- T37 "Built-artefact path `dist/core/extensions/types.d.ts` cited as the source of truth for Pi-SDK types" — same-cluster (the audit recommended here inherits the dist-path stability problem).

---

# T35 — SDK capability inventory closed-set claim has no negative-direction audit

**Original heading:** Seven Pi capabilities asserted as exhaustive without audit evidence
**Original section:** docs/spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** assumptions
**Importance:** medium

## Finding

`spec.md` (Orientation > Prerequisites > Pi SDK and capabilities) and `pi-integration-contract.md` (SDK capability inventory) both state that "the seven SDK capabilities the runtime depends on" are the closed list anchored under the inventory. The supporting H1 leaf (`pinned-surface.test.ts`, consuming `SDK_SURFACE_INVENTORY`) and the Pi-version-bump procedure (PIC step 2) verify the inventory in only one direction: that each declared capability member is present on the imported Pi namespace at the pinned `~0.72.1`. Nothing in the spec corpus or the H1 test plan verifies the converse — that no `pi.<member>` access, no destructured field of `ExtensionAPI` / `ExtensionContext` / `ExtensionCommandContext`, and no named import from `@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, or `@mariozechner/pi-tui` exists in `src/` outside the seven inventory entries (plus the `AbortSignal` shape and the bundled-`typebox` shape, which are accounted for separately).

The closed-set claim is therefore a maintenance assertion, not a tested invariant. A future leaf that reaches for an additional Pi surface — for example `pi.theme.*` for renderer styling, a Pi key-binding registration call, an `ExtensionAPI` logging member, a file-watcher facility, or a new `pi-agent-core` re-export — would silently widen the runtime's dependence on Pi without lighting up the inventory, the bump procedure, or any spec rule. The first observable failure would arrive at the next Pi minor bump that removes or renames the silently-used member.

The same maintenance gap binds the parallel "complete set of four hard ceilings" and "13 typed/structural seams" claims (separate findings). What this finding addresses is specifically the Pi-surface inventory — the claim that the runtime's coupling to Pi is bounded by the seven items, with no audit demonstrating the bound holds.

## Spec Documents

- `docs/spec.md` — Orientation > Prerequisites > Pi SDK and capabilities (edited)
- `docs/spec_topics/pi-integration-contract.md` — SDK capability inventory; Pi version bump procedure (edited)
- `docs/plan_topics/h1-scaffold.md` — SDK surface-inventory test bullet (read-only for spec; edited at the plan layer)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The audit lives naturally inside H1's existing `pinned-surface.test.ts` (or as a sibling `pi-surface-coverage.test.ts` in the same suite); no new phase is required. H4 / Mb / V14 / V18 leaves that introduce new `pi.*` call sites simply update `SDK_SURFACE_INVENTORY` in lock-step, and the new audit fails loudly if they don't.

## Consequence

**Severity:** advisory

The runtime keeps working today; the gap surfaces only when (a) a contributor adds a new Pi-surface call without updating the inventory, then (b) a future Pi minor bump removes or behaviour-changes that surface. The combined likelihood is low but the failure mode is silent at every gate the spec currently names — surface-inventory test green, capability probe green, bump procedure green — until user runtime.

## Solution Space

**Shape:** single

### Recommendation

Add a negative-direction Pi-surface coverage audit as a second assertion in the H1 SDK surface-inventory test, and bind it to the existing bump procedure.

**Audit rule (executable).** A static AST walk over `src/**/*.ts` (TypeScript compiler API, matching the existing `no-static-state` pattern in H1) collects:

1. Every `MemberExpression` whose root identifier is `pi` (the `ExtensionAPI` parameter name H4 pins). Record the full member path (`pi.registerCommand`, `pi.sendMessage`, `pi.modelRegistry.find`, etc.).
2. Every `ImportDeclaration` whose specifier matches `@mariozechner/pi-coding-agent`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, or `@mariozechner/pi-tui`. Record each named import.
3. Every property access on identifiers locally bound to `ExtensionContext` / `ExtensionCommandContext` (typed parameters, including via destructuring). Record the accessed member name.

The test asserts that each collected access maps to either (i) an entry in `SDK_SURFACE_INVENTORY`, (ii) an `AbortSignal` / `AbortController` member already covered by the `abortsignal-member` entries, (iii) the `Type.Unsafe` import covered by the `typebox` shape probe in PIC Step 0 (e), or (iv) an explicit, named exemption in a sibling `PI_SURFACE_EXEMPTIONS` constant carrying a `// allow: <REQ-ID> — <spec-page>` comment. A collected access that matches none fails the test with a message naming the file, the offending member path, and the closest inventory entry to triage against.

**Spec edits.**

- `pi-integration-contract.md`, SDK capability inventory preamble: add one sentence after the existing "items 1, 2, 3, 4, and 6 are factory-probable" sentence — "The closed-set claim is mechanically enforced: an H1 static-AST audit asserts that every `pi.<member>` access, every named import from the four `@mariozechner/*` peer packages, and every `ExtensionContext` / `ExtensionCommandContext` member access in `src/` resolves to an entry in `SDK_SURFACE_INVENTORY` or a named exemption."
- `pi-integration-contract.md`, Pi version bump procedure step 2: extend to cite both directions — "asserts each enumerated capability is present **and** that the source tree references no Pi surface outside the inventory."
- `spec.md`, the orientation paragraph that declares "the seven capabilities the runtime depends on": replace with "the seven SDK capabilities the runtime depends on (closed set; the closed-set claim is mechanically enforced — see [PIC — SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory))." No literal-restatement of the audit lives in `spec.md`.
- `h1-scaffold.md`, SDK surface-inventory test bullet: add the negative-direction assertion as a second sub-bullet under the existing test, sharing the same `SDK_SURFACE_INVENTORY` source of truth.

**Edge cases the implementer must watch.**

- The audit walks `src/`, not `test/` or `dist/`. Test fakes (`FakeExtensionAPI`) are exempt by directory; this is correct because they implement Pi rather than consume it.
- Property-access detection on typed `ExtensionContext` parameters requires resolving the parameter's TypeScript type, not just the identifier name (a parameter named `ctx` may be typed `ExtensionCommandContext` or some unrelated context). Use the TypeScript type-checker, not name-matching.
- `pi.modelRegistry.find` (capability 7) is a multi-segment path; the inventory entry is `{ kind: "load-time-resolution", path: "ctx.modelRegistry.find", ... }` and the audit must match nested member paths against inventory `path` fields, not just the leaf identifier.
- The `PI_SURFACE_EXEMPTIONS` escape hatch must be small and named per-site (one entry per `<file>:<line-range>`). A bare wildcard exemption defeats the audit.
- The audit is static — a dynamic `pi[name]()` call evades it. H1 should also forbid computed member access on `pi` / `ctx` (a small `no-restricted-syntax` rule covering `MemberExpression[computed=true][object.name=/^(pi|ctx)$/]` in `src/`).

## Relationships

- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (Pi-surface audit-evidence-missing, different claim).
- T31 "Hard-ceiling closure asserted at the aggregator without pointing at the backing audit" — same-cluster (identical pattern, different surface).
- T25 "Forward-compatibility-seam aggregator count is not gated by CI" — same-cluster (same pattern, different surface).
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster (closed-set integrity under tilde-range Pi pin).

---

# T36 — `SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type

**Original heading:** `event.reason` closed set under tilde range admits patch-level widening
**Original section:** docs/spec.md — Orientation > Session model
**Kind:** assumptions
**Importance:** high

## Finding

`spec.md` (Session model) and `pi-integration-contract.md` (Extension entry point, step 4) both pin the `event.reason` value space as the closed five-element set `{"quit", "reload", "new", "resume", "fork"}` and name `SessionShutdownEvent` in `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts` as the source of truth. The `~0.72.1` peer-dep range admits any `0.72.x` patch, and patch releases are free to widen the union (Pi's SemVer policy treats type widenings as non-breaking). Nothing in the build chain compares the literal closed set against the SDK type at bump time.

The H1 `SDK_SURFACE_INVENTORY` literal-read test (`test/extension/pinned-surface.test.ts`) covers the Node floor, the `AbortSignal` member-with-kind table, the factory-probable capability list, and the peer-dep range — but no entry covers the `SessionShutdownEvent.reason` literal union. A patch bump that adds a sixth reason therefore reaches users without any test going red. The runtime's **Unknown-reason rule** (PIC step 4) catches the new value at runtime — it emits `loom/host/session-shutdown-reason-unknown` and runs the full teardown — so the system does not crash, but the operator-facing diagnostic fires for every shutdown of the new kind on every install until someone notices.

The symmetric narrowing case (Pi removes a reason in a patch) is invisible: the runtime's `switch`-equivalent set membership keeps accepting the removed literal that Pi will never deliver again, and the literal set diverges silently from the SDK type. The `tsc`-level type assertion that would catch both directions is absent.

## Spec Documents

- `docs/spec_topics/pi-integration-contract.md` — Host prerequisites; Extension entry point step 4 (Unknown-reason rule); SDK capability inventory — Re-validation on `peerDependencies` widening; Pi version bump procedure (edited)
- `docs/spec.md` — Orientation > Session model paragraph (read-only; the literal closed set is restated here but ownership remains on PIC)
- `docs/plan_topics/h1-scaffold.md` — `SDK_SURFACE_INVENTORY` literal-read test description (edited)

## Plan Impact

**Phases:** Horizontal H1

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

The session_shutdown handler itself (which already encodes the closed set and the unknown-reason fallback per PIC step 4) is not currently owned by an explicit leaf — `coverage-matrix.md` maps `Pi Integration Contract` broadly to `H4, H5, Mb, V5h, V6i, V12a, V14a–V14j, V14t, V18f, V18q` and the handler implementation is implicit in that bundle. Adding the build-time pin does not require carving a new leaf out of that bundle; it extends an existing H1 entry.

## Consequence

**Severity:** correctness

A Pi patch that widens `SessionShutdownEvent['reason']` ships through `~0.72.1` without notice; the first signal is `loom/host/session-shutdown-reason-unknown` warnings on every operator's terminal. A patch that narrows the union goes entirely undetected and leaves dead code in the runtime's set-membership check. Neither produces a crash, but both violate the "SDK type is the source of truth" claim the spec makes for the closed set, and the loom-side bump procedure has no mechanical gate that catches the drift.

## Solution Space

**Shape:** single

### Recommendation

Add a fifth `SDK_SURFACE_INVENTORY` entry kind in H1 alongside the existing four:

```ts
{
  kind: "type-union-snapshot",
  path: "SessionShutdownEvent.reason",
  literals: ["quit", "reload", "new", "resume", "fork"]
}
```

The H1 `pinned-surface.test.ts` asserts equality between this literal array and the union members of `SessionShutdownEvent['reason']` extracted at typecheck time via a TypeScript type-equality probe of the form

```ts
import type { SessionShutdownEvent } from "@mariozechner/pi-coding-agent";
type Reason = SessionShutdownEvent["reason"];
type ExpectedReason = (typeof SDK_SURFACE_INVENTORY)[/* index */]["literals"][number];
const _exhaustive: Reason extends ExpectedReason ? ExpectedReason extends Reason ? true : never : never = true;
```

so a widening fails compilation (right-to-left direction red), a narrowing also fails (left-to-right red), and the failing surface is `npm run typecheck` rather than user runtime.

Pin the array in the same single source-of-truth pinned-constants block under `src/extension/` that already holds the Step 0 capability-probe constants. The runtime's set-membership check in PIC step 4's Unknown-reason rule consumes the same constant, so the closed set, the Step 0 probe, and the H1 test cannot drift from each other.

Update `pi-integration-contract.md` in three places:

1. Add a sentence to the Unknown-reason rule paragraph stating that the closed set is sourced from the pinned-constants block and is asserted equal to `SessionShutdownEvent['reason']` by the H1 surface-inventory test.
2. Add `type-union-snapshot` to the **Pi version bump procedure** step 5 enumeration of pinned constants the bumper must update.
3. Anchor the runtime-fallback policy: when the H1 typecheck red-arrows on a Pi patch, the loom maintainer (a) updates the literal array to match the new SDK union, (b) ships the change in the next loom patch, and (c) accepts that during the gap window the `loom/host/session-shutdown-reason-unknown` diagnostic and the full-teardown fallback are the user-facing contract for any new reason. State this explicitly so the runtime fallback is not later mistaken for the spec-level answer.

The runtime fallback (Unknown-reason rule + diagnostic + full teardown) is correct as-is and does not change; the build-time pin is an upstream gate, not a replacement.

Edge cases the implementer must watch:
- The type-equality probe must be bidirectional. A one-sided `extends` check (the common `Assert<X extends Y>` pattern) catches widening but not narrowing.
- The `literals` array MUST be declared `as const` so its element type is the narrow string literal union, not `string[]`.
- The probe MUST live in a `.ts` file that participates in `npm run typecheck`, not in `pinned-surface.test.ts` alone — a runtime-only test cannot observe type-level drift.
- The pinned-constants block is the same module the runtime imports for its set-membership check; updating the array is therefore a single-site edit (no separate copy in the handler).

## Relationships

- T35 "SDK capability inventory closed-set claim has no negative-direction audit" — same-cluster (closed-set assertion without a build-time pin).
- T37 "Built-artefact path `dist/core/extensions/types.d.ts` cited as the source of truth for Pi-SDK types" — same-cluster (same source-of-truth fragility under the tilde range).
- T33 "Node floor `>=20.6.0` not automatically audited against Pi's `engines.node`" — same-cluster (sibling tilde-range silent-drift hole).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — must-precede (touches the same closed reason set; any per-reason carve-out decided there must be reflected in the pinned literal array here).

---

# T37 — Built-artefact path `dist/core/extensions/types.d.ts` cited as the source of truth for Pi-SDK types

**Original heading:** `dist/core/extensions/types.d.ts` path treated as authoritative
**Original section:** docs/spec.md — Orientation > Prerequisites > Pi SDK and capabilities
**Kind:** assumptions
**Importance:** high

## Finding

Both Trust-boundary and Session-model bullets in `spec.md` cite `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts` as the canonical declaration site for `ExtensionAPI`, `ExtensionContext`, and `SessionShutdownEvent`. The same deep `dist/...` path is reused at seven sites inside `pi-integration-contract.md` (lines 190, 341, 343, 501, 521, 527, 563, 569) for `pi.setActiveTools`, `pi.registerMessageRenderer`, `ExtensionCommandContext`, `CompactOptions` / `CompactionResult`, the tool-result envelope, and the `ctx.signal` / tool `signal` entry-point declarations.

That path is build output. Pi's `package.json` `exports` map (verified at the installed `0.73.0` peer) only publishes `.` (`./dist/index.d.ts`) and `./hooks` (`./dist/core/hooks/index.d.ts`); `dist/core/extensions/types.d.ts` is not exported and is reachable only by pierce-through filesystem reads. The TypeScript public entrypoint `./dist/index.d.ts` does re-export every symbol the spec actually cites — `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`, `SessionShutdownEvent`, `CompactOptions`, `CompactionResult`, and the tool-result family — so an alternative formulation is available without loss of precision. The H1 surface-inventory test in `plan_topics/h1-scaffold.md` already imports the package via the public entrypoint, so the spec citation and the test that validates it disagree on which surface is canonical.

Within the `~0.72.1` tilde range a 0.72.x patch can reorganise the `dist/` tree (rename a barrel file, collapse `core/extensions/` into `core/`, switch bundlers) without touching the public exports map, and the spec's verbatim path citations would silently rot — even when the public-entrypoint surface, and therefore the runtime, is unchanged.

## Spec Documents

- `docs/spec.md` — Orientation > Session model; Orientation > Scope > Trust boundary (edited)
- `docs/spec_topics/pi-integration-contract.md` — `pi.setActiveTools` snapshots; Renderer registration (`pi.registerMessageRenderer`); `ExtensionContext` member surface; `CompactOptions` / `CompactionResult`; `ExtensionCommandContext`; tool-result envelope; Cancellation source (edited)
- `docs/plan_topics/h1-scaffold.md` — SDK surface-inventory literal-read test (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — H1's existing `pinned-surface.test.ts` already imports the package via the public entrypoint and asserts the named symbols on that namespace; no acceptance-criterion change follows from re-anchoring the spec text to the same surface.

## Consequence

**Severity:** correctness

A patch-level Pi bump that reshuffles `dist/` without altering the public `exports` surface leaves the spec citing a non-existent (or relocated) path while the runtime — and the H1 surface-inventory test — keep working. Implementers reading the spec would also be steered toward deep filesystem reads past the `exports` map for type imports; under `moduleResolution: "node16" | "bundler"` such imports fail outright, and even under `node` they encode an unstable contract Pi does not promise.

## Solution Space

**Shape:** single

### Recommendation

Re-anchor every Pi-SDK type citation in `spec.md` and `pi-integration-contract.md` to the package's public entrypoint and symbol name, dropping the `dist/...` path. Concretely:

- Replace each occurrence of the form ``X in `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts` `` with ``X (re-exported by `@mariozechner/pi-coding-agent`'s package entrypoint)``. The H1 `SDK_SURFACE_INVENTORY` constant and `pinned-surface.test.ts` (per `plan_topics/h1-scaffold.md`) are the build-time gate that proves the symbol is reachable on that namespace at the pinned version.
- Where a spec sentence currently relies on a line-number reference (e.g. PIC's "declared at `dist/core/extensions/types.d.ts` lines 199–203" for `CompactOptions`), drop the line numbers and either (a) inline the verbatim type literal that the spec is pinning, or (b) cite only the symbol name. Line numbers in build output are not a stable contract.
- Add one entry to the `SDK_SURFACE_INVENTORY` `namespace-function`/type covering each symbol the spec currently cites by `dist/...` path that is not yet enumerated (`SessionShutdownEvent`, `CompactOptions`, `CompactionResult`, the tool-result envelope type, `ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`). The bump-procedure step 2 then mechanically catches a Pi minor that drops or renames any of them on the public namespace.

Edge cases the editor must watch:

- Two PIC sentences ("the inline shapes below are the loom-load-bearing subset and MUST be re-validated against this file on each Pi minor bump") use the file as a re-validation anchor. After re-anchoring, the re-validation target becomes the named export on the public entrypoint, and the bump-procedure step 1 (typecheck) plus step 2 (surface-inventory test) jointly enforce it; no separate `dist/...` audit is required.
- The PIC `~0.72.1` peer-dep pin and the H1 literal-read test for `peerDependencies` are unaffected — they already pin the package version, not a path inside it.
- Do not pivot to `import type { X } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.js"` as a "stable" deep import; that path is also not in the `exports` map and merely renames the same fragility.

## Relationships

- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — co-resolve (also lives in the Trust-boundary bullet).
- T35 "SDK capability inventory closed-set claim has no negative-direction audit" — same-cluster.
- T36 "`SessionShutdownEvent.reason` closed set has no build-time pin against the SDK type" — same-cluster.
- T16 "Trust boundary bullet conflates scope decision with normative contracts and a deferral" — same-cluster (touches the same Trust-boundary paragraph).

---

# T38 — Non-goals are not consolidated into a single section

**Original heading:** No consolidated Non-goals section
**Original section:** docs/spec.md — Document level
**Kind:** scope
**Importance:** medium

## Finding

The spec corpus has no single section that enumerates what V1 is *not* doing. The information exists, but is scattered across at least four locations and three documents:

- `docs/spec.md` § Orientation > Scope — five present-tense disposition bullets (Trust boundary, Source-language stability, Runtime observability, Forward-compatibility seams, Hard ceilings); only the first two contain explicit out-of-scope statements ("A per-loom capability model is **out of scope for V1**", "Migration across major versions is out of V1 scope").
- `docs/spec.md` § Orientation > Session model — out-of-scope statements buried in dense normative prose: "V1 exposes no parallel-`invoke` surface", "no admission cap, no scheduler interposed above Pi's event loop", "Concurrent *user sessions* in the same host process are out of scope for V1 because Pi does not support them".
- `docs/spec.md` § Orientation > Prerequisites — "V1 targets Node exclusively (Bun, Deno, browser-embed are out of V1 scope)".
- `docs/spec_topics/future-considerations.md` — four buckets (Tooling deferrals, Surface extensions, Model-level changes, Known V1 limitations), of which only the last is a true non-goal list and contains exactly three items, each carrying a `Recorded at:` back-pointer to a `spec.md` § Scope bullet.

The result: a reader who wants to know "what does V1 deliberately not do?" must walk all four locations, mentally de-duplicate (the trust-boundary disposition appears in three of them), and reconcile inline asides against the `future-considerations.md` "Known V1 limitations" list. The `Recorded at:` back-pointers in `future-considerations.md` claim parity with the `spec.md` § Scope bullets, but the in-prose Session-model exclusions (concurrent user sessions, no parallel-`invoke` surface, no admission cap) appear in neither — so the back-pointer convention is not, in fact, a complete index.

## Spec Documents

- `docs/spec.md` — Orientation > Scope; Orientation > Session model; Orientation > Prerequisites (edited)
- `docs/spec_topics/future-considerations.md` — Known V1 limitations (option-dependent; edited under Option C)
- `docs/spec_topics/governance.md` — GOV-12 (read-only; the lock-step rule constrains how a duplicated list is maintained)
- `docs/spec_topics/pi-integration-contract.md` — Session-shutdown semantics, Tool-registration lifetime and visibility (read-only; cited by inline asides being relocated)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(This is a doc-organization edit. No plan leaf grep-matches "non-goal" or owns the Scope/Orientation structure of `spec.md`. `h6-req-ids.md` and `coverage-matrix.md` reference `spec.md` only at the REQ-ID/anchor level, which this edit does not touch.)

## Consequence

**Severity:** advisory

A V1 implementer can ship a conforming runtime without a consolidated non-goals list — every disposition is present in some normative location. The cost is review-time and onboarding friction: a reviewer asking "did the runtime correctly omit a parallel-invoke surface?" or "is per-loom sandboxing actually deferred?" has no single anchor to cite, and a future seam-or-not-a-seam debate (e.g. when a contributor proposes per-loom capability scoping) lacks a canonical disposition list to argue against.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option B. Ordering note: land **before** T15, T16, T22 so they can place their relocations into the new home; rename `future-considerations.md § Known V1 limitations (no seam expected)` to `V1 non-goals` with internal `no seam expected` / `deferred with seam` split.

### Option A — New top-level "Non-goals (V1)" section in `spec.md`

**Approach.** Add a new top-level section "Non-goals (V1)" after Orientation and before Language. List every V1 exclusion as a single bullet with a one-line forward-link to the page that owns the rationale. The Scope subsection's exclusion phrases stay in place; the new section is an aggregator under GOV-12.

**Spec edits.**
- `docs/spec.md`: insert a new `## Non-goals (V1)` section between Orientation and Language. Cover at minimum: per-loom sandbox / capability model, source-language major-version migration, non-Node JavaScript hosts, concurrent user sessions in the same host process, parallel-`invoke` surface, parallel prompt-mode tool fan-out, admission cap on concurrent subagent invocations, per-call timeouts (deferred-with-seam, not absent), aggregated runtime-event telemetry (deferred-with-seam). Tag each as "no seam" vs "seam reserved" with a forward-link to the owning topic-page paragraph.
- `docs/spec_topics/future-considerations.md`: change "Known V1 limitations (no seam expected)" `Recorded at:` pointers to point to the new aggregator section instead of the existing § Scope bullets.

**Pros.** Single discoverable anchor; matches the structural convention already used for Hard ceilings (orientation aggregator + topic-page owner); aligns with the existing GOV-12 lock-step pattern.

**Cons.** Introduces a third copy of the disposition (Scope bullet + new aggregator + `future-considerations.md`); the aggregator must be policed under GOV-12 against two sources, not one.

**Risks.** Drift between the aggregator and the in-prose Session-model exclusions if a reviewer adds a new disposition only to the latter.

### Option B — Promote `future-considerations.md` § "Known V1 limitations" to canonical owner; add a thin orientation pointer

**Approach.** Treat `future-considerations.md` § "Known V1 limitations (no seam expected)" as the single owner of the V1 non-goals list. Extend it to cover the dispositions currently buried in `spec.md` § Session model and § Prerequisites. Add one paragraph in `spec.md` § Orientation (or a new "Non-goals" subsection inside Orientation, sibling of Scope) that names the categories and forward-links to that page; do not duplicate the list.

**Spec edits.**
- `docs/spec_topics/future-considerations.md`: extend "Known V1 limitations" to add bullets for concurrent user sessions, parallel-`invoke` surface, parallel prompt-mode tool fan-out, no admission cap on subagent concurrency. Each bullet keeps the `Recorded at:` pointer back to the in-prose owner in `spec.md`.
- `docs/spec.md`: add a brief "Non-goals" subsection inside Orientation (sibling of Scope and Reading order) that lists the category names only and links to `future-considerations.md`. Leave the in-prose exclusions in § Session model and § Trust boundary unchanged; they remain the normative owners and the `future-considerations.md` page indexes them.

**Pros.** No duplicated list — one canonical place; `future-considerations.md` already has the structure, header, and `Recorded at:` convention; GOV-12 lock-step burden is one aggregator → many sources, the same shape it already polices for the Hard ceilings bullet.

**Cons.** The non-goals list lives on a topic page rather than `spec.md`, which slightly weakens its "first-class scope statement" framing; readers expecting non-goals adjacent to scope must follow one link.

**Risks.** "Known V1 limitations (no seam expected)" currently means specifically "no forward-compatibility seam"; widening it to cover all non-goals (including ones that *do* have seams, like per-call timeouts) requires either a section rename or a clear sub-bucket split.

### Option C — Rename `spec.md` § Scope to "Scope and non-goals" and merge in place

**Approach.** Keep one section, broaden its remit. Rename Orientation > Scope to "Scope and non-goals". Pull the in-prose Session-model exclusions ("Concurrent user sessions…", "no parallel-`invoke` surface", "no admission cap") into new bullets in the renamed section. Leave `future-considerations.md` § "Known V1 limitations" as a back-pointer index.

**Spec edits.**
- `docs/spec.md`: rename § Scope → § Scope and non-goals; add three new bullets for the Session-model exclusions; remove the same statements from the § Session model paragraph (replace with one-sentence forward-links).
- `docs/spec_topics/future-considerations.md`: update `Recorded at:` pointers to the renamed section.

**Pros.** No new section; the existing aggregator-with-topic-owner convention extends naturally; § Session model becomes shorter and more readable.

**Cons.** § Scope and non-goals becomes the longest subsection in Orientation and mixes present-tense scope dispositions (e.g. "V1 reserves 13 typed/structural seams") with negative-form non-goals; the rename addresses the heading-vs-content mismatch flagged elsewhere but does not separate orientation from exclusion.

**Risks.** Bullet inflation; reviewers may stop scanning the section once it crosses ~10 bullets.

### Recommendation

**Option B.** `future-considerations.md` already owns three of the four "no seam expected" exclusions and already has a back-pointer convention; the right fix is to extend that section to cover the missing in-prose exclusions and add a thin discoverable pointer from `spec.md` § Orientation. This avoids the GOV-12 lock-step burden of policing a duplicated bullet list (Option A) and avoids overloading § Scope (Option C).

Edge cases the implementer must watch:

- The "Known V1 limitations" header carries the qualifier "(no seam expected)". Either rename it to "V1 non-goals" with an internal split between "no seam expected" and "deferred with seam" (preferred), or keep the existing header and add a sibling "Deferred with seam" sub-bucket. Do not silently widen the existing header — it changes the meaning of every existing `Recorded at:` pointer.
- The inline aside "V1 targets Node exclusively (Bun, Deno, browser-embed are out of V1 scope)" in § Prerequisites is already mirrored by "No non-Node JavaScript host support" in § Known V1 limitations. Keep both — the prerequisite paragraph needs the disclaimer in situ.
- The `tools:` allowlist parenthetical in § Trust boundary ("a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox") is a clarification of an in-scope feature, not a non-goal. Do not promote it.
- GOV-12 governs the new pointer. Add the pointer paragraph to the GOV-12 inventory if the spec maintains an explicit aggregator list.

## Relationships

- T15 "Session-model paragraph mixes architectural rules and scope deferrals into one Orientation block" — co-resolve (its second sub-issue is the same Session-model relocation).
- T16 "Trust boundary bullet conflates scope decision with normative contracts and a deferral" — same-cluster (touches the same § Scope bullet).
- T18 "Success-side operator observability is unstated" — same-cluster (another § Scope bullet placement issue).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (adjacent placement issue in § Overview).

---

# T39 — Mid-stream cancellation paragraph bundles multiple obligations under one anchor

**Original heading:** Mid-stream cancellation: six independent MUST obligations bundled under one anchor
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** traceability
**Importance:** medium

## Finding

The paragraph anchored at `mid-stream-cancellation-conversation-state` in `errors-and-results.md` packs several normative rules under a single HTML anchor. Disentangling the prose, the paragraph carries at least:

1. A **non-mutation** umbrella — the runtime MUST NOT mutate Pi-committed conversation surfaces — elaborated by an enumeration of forbidden verbs (truncate, re-write, replace, remove) applied to assistant tokens, tool-call cards, and system notes.
2. A **no-compensating-injection** rule — structurally distinct from #1 because injection adds new turns rather than altering existing ones.
3. A **symmetry** rule — the obligation binds both the cancellation arm and the `?`-propagation arm after a partial stream.
4. A **respond-repair carve-out** — the obligation's scope window for typed queries with respond-repair follow-ups runs from the cancelled streaming turn up to the next driver send; respond-repair's own conversation appends are governed elsewhere.
5. A **subagent-mode binding** — the non-mutation obligation still applies internally even though subagent conversations have no external observer.

These are independently testable: a conformance suite can exercise each in isolation. Today none of them carries its own identifier — the only addressable unit is the paragraph as a whole. Two cross-references already point at the lone anchor (`cancellation.md` line 57 and `slash-invocation.md` line 25), so any future split must update those targets in the same edit.

The page does not yet carry the `**ERR-N.**` markers governance.md GOV-1 mandates; the H6 anchor pass is the natural moment to assign them, and doing so per-obligation rather than per-paragraph costs nothing extra at that point but locks in the bundling permanently if missed.

## Spec Documents

- `docs/spec_topics/errors-and-results.md` — `**Mid-stream cancellation, conversation state.**` paragraph and the immediately preceding `**Partial-append contract.**` paragraph (edited)
- `docs/spec_topics/cancellation.md` — bullet under "Surfacing" that cross-links `#mid-stream-cancellation-conversation-state` (edited; cross-link target update)
- `docs/spec_topics/slash-invocation.md` — "Cancellation mid-stream" bullet under user-visible streaming that cross-links `#mid-stream-cancellation-conversation-state` (edited; cross-link target update)
- `docs/spec_topics/governance.md` — GOV-1 (anchor placement / canonical form), GOV-3 (extraction regex), GOV-7/GOV-8 (lifecycle) (read-only)
- `docs/spec_topics/query.md` — schema-validation respond-repair section referenced by carve-out #4 (read-only)
- `docs/plan_topics/h6-req-ids.md` — leaf that schedules the corpus-wide anchor pass (read-only)

## Plan Impact

**Phases:** Horizontal phases

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 already enumerates `errors-and-results.md` in its **Spec** field and is the single corpus-wide anchor pass. The leaf as written treats anchor insertion as one ID per "normative obligation"; this finding is a constraint on how that judgement applies to this specific paragraph (multiple IDs, not one). No new leaf is required and no existing acceptance criterion changes.

## Consequence

**Severity:** advisory

A reviewer or test author cannot cite the no-compensating-injection rule, the `?`-propagation symmetry, or the respond-repair scope carve-out without dragging in the entire paragraph; if any one of the rules later needs to be tightened, weakened, or retired, GOV-8's split-or-deletion-plus-add discipline forces the whole bundle through retirement together. Implementers can still build the runtime correctly from the prose as written.

## Solution Space

**Shape:** single

### Recommendation

When H6 lands `**ERR-N.**` anchors on `errors-and-results.md`, decompose this paragraph into separate REQ-IDs rather than assigning one ID to the whole paragraph. A workable decomposition:

- **`ERR-N` (non-mutation of committed surfaces).** The runtime MUST NOT mutate the Pi-committed conversation; the verb enumeration (truncate, re-write, replace, remove) and the surface enumeration (assistant tokens, tool-call cards, system notes) remain inside this paragraph as the rule body.
- **`ERR-N+1` (no compensating injection).** The runtime MUST NOT inject compensating turns after a mid-stream cancellation.
- **`ERR-N+2` (cancellation / `?`-propagation symmetry).** Both rules above apply symmetrically to the cancellation path and to `?`-propagation after a partial stream.
- **`ERR-N+3` (respond-repair scope window).** For typed queries with respond-repair follow-ups, the obligations bind the runtime between the cancelled streaming turn and the next driver send; respond-repair's own conversation appends are governed by `query.md`'s respond-repair section.
- **`ERR-N+4` (subagent-mode internal binding).** The non-mutation obligation holds inside the subagent loom even though subagent conversations have no external observer.

Per GOV-1 *Permitted alternate contexts*, the inline `**ERR-N.**` form is the canonical anchor; the existing `<a id="mid-stream-cancellation-conversation-state"></a>` HTML anchor is not on the closed list of permitted contexts (it sits in body prose, not a table cell, ATX heading, or pre-fenced-code line) and MUST be removed during the H6 pass. The existing cross-references in `cancellation.md` and `slash-invocation.md` retarget at the same edit:

- `cancellation.md` "Surfacing" bullet — point at the `ERR-N`/`ERR-N+2` pair (non-mutation + symmetry); the bullet's prose covers both rules.
- `slash-invocation.md` "Cancellation mid-stream" bullet — point at `ERR-N` (non-mutation of user-visible streaming surface); the bullet does not concern the `?`-propagation symmetry or the respond-repair carve-out.

Edge cases for the implementer: (a) the verb enumeration inside `ERR-N` is illustrative, not closed — leaving it inside the rule body keeps GOV-8 from firing every time a sixth verb (e.g. "reorder") gets added; (b) the dense-numbering gate in H6's tests requires `ERR-1..ERR-K` with no holes, so the `+1`/`+2` offsets above resolve to whatever `N` the page-wide pass settles on; (c) splitting later, after H6 has assigned a single `ERR-N`, costs four GOV-8 retirement entries plus four cross-reference rewrites — doing it during H6 costs nothing extra.

## Relationships

- T40 "Pre-evaluation failure list has no per-item anchors; cross-references depend on ordinal position" — co-resolve (same page, same H6 pass).
- T41 "Binder refinement-loop seam bundles three independent MUSTs under one navigational anchor" — same-cluster (identical pattern in `binder.md`).
- T42 "Race semantics: cancellation MUSTs lack per-obligation REQ-ID anchors" — same-cluster (identical pattern in `cancellation.md`).
- T43 "GOV-14, GOV-15, PIC-1 violate GOV-1's Dual-form layout rule" — same-cluster (related GOV-1 discipline question).

---

# T40 — Pre-evaluation failure list has no per-item anchors; cross-references depend on ordinal position

**Original heading:** Pre-evaluation failure list items addressable only by ordinal position
**Original section:** docs/spec_topics/errors-and-results.md
**Kind:** traceability
**Importance:** medium

## Finding

The closed seven-item enumeration of pre-evaluation failures in `errors-and-results.md` (host-incompatibility, lex/parse/type batches, frontmatter rejection, binder-model resolution failure, binder LLM-call exhaustion, `tools:` resolution failure, watcher-time reload failures) is presented as a numbered list in continuous prose with no per-item anchor. Each item is a distinct normative obligation whose surface, owner page, and routing rule are independently citable, yet none carries a `**ERR-N.**` marker.

Today the list is referenced positionally from within the same page (`errors-and-results.md` line 55) and by section-level link from `spec.md` (line 10). Item 5 already cross-refers outward to ceiling #3 (`#hard-ceiling-3`); the inverse target does not exist, so a future cross-link from `hard-ceilings.md`, `binder.md`, `frontmatter.md`, `discovery.md`, or `pi-integration-contract.md` back into one specific pre-evaluation failure has no stable anchor to bind to.

The list is explicitly extensible: the closing paragraph at line 68 says "a future leaf that introduces one updates this list and the new failure's owner page in the same commit." Any insertion that is not an append at position 8 mutates every later ordinal — a consequence GOV-1's anchor discipline is designed to neutralise, but only if the anchors exist.

## Spec Documents

- `docs/spec_topics/errors-and-results.md` — `**Terminal outcomes.**` paragraph + the pre-evaluation list at lines 60–66 (edited)
- `docs/spec_topics/governance.md` — REQ-ID prefix table (read-only)
- `docs/spec.md` — terminal-outcomes-aggregator paragraph at line 10 (read-only)

## Plan Impact

**Phases:** Horizontal phases (H6), V18.

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified)

H6 already commits to inserting `**PREFIX-N.**` markers for "every normative obligation" on every non-narrative spec page. V18s is tagged because the new `ERR-N` anchors must appear in `coverage-matrix.md` for the unmapped-REQ-ID gate to pass.

## Consequence

**Severity:** advisory.

No runtime divergence. The cost is paid by spec maintenance: any future cross-reference into a specific pre-evaluation failure (and any insertion or reordering of items) is currently load-bearing on prose reread rather than on an anchor diff.

## Solution Space

**Shape:** single.

### Recommendation

Assign each of the seven list items a stable `**ERR-N.**` anchor as part of the H6 anchor pass, using the dual-form `<a id="err-n"></a> **ERR-N.**` layout permitted by GOV-1 for list contexts. Place each anchor at the head of its bullet body, after the existing list ordinal:

```markdown
1. <a id="err-1"></a> **ERR-1.** host-incompatibility detected by the capability probe (per …)
2. <a id="err-2"></a> **ERR-2.** lex / parse / type batches (per …)
…
7. <a id="err-7"></a> **ERR-7.** watcher-time reload failures (per …)
```

While editing, replace the in-page positional reference at line 55 with a fragment link.

Edge cases the implementer must watch:

- The "the seven below" count assertion at line 58 must move in lock-step with the list.
- The dual-form anchor is required (not the inline-only form) because the surrounding `1.` … `7.` ordinal prefix already occupies the bullet's leading bytes.
- Once the anchors exist, the cross-link from `hard-ceilings.md` CIO-1 SHOULD be updated to point at `#err-5`.

## Relationships

- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — co-resolve (same page, same H6 pass).
- T41 "Binder refinement-loop seam bundles three independent MUSTs under one navigational anchor" — same-cluster.
- T42 "Race semantics: cancellation MUSTs lack per-obligation REQ-ID anchors" — same-cluster.
- T29 "Pre-evaluation exclusion clause names ceiling #3 only" — must-precede (its fix may need to add a forward-link into a specific pre-evaluation failure item).

---

# T41 — Binder refinement-loop seam bundles three independent MUSTs under one navigational anchor

**Original heading:** Binder refinement-loop seam: three MUST obligations under one non-REQ-ID anchor
**Original section:** docs/spec_topics/binder.md
**Kind:** traceability
**Importance:** medium

## Finding

The seam blockquote in `binder.md` ("V1 seam — binder refinement loop", anchored `<a id="v1-seam-binder-refinement-loop"></a>`) carries three numbered MUST obligations preserved for the deferred refinement loop:

1. The binder envelope schema MUST keep the three-arm `ok | needs_info | ambiguous` discriminator.
2. The `ambiguous.candidates` field MUST remain in the envelope schema (and MUST NOT be surfaced on the V1 system note).
3. The failure-mode templates table MUST keep distinct `needs more info` vs `ambiguous arguments` row prefixes.

These are three distinct, independently testable obligations — they govern different artefacts. They are however currently addressable only through the navigational anchor `v1-seam-binder-refinement-loop`, which does not match GOV-1's `**PREFIX-N.**` form, is invisible to GOV-3's REQ-ID extractor, and is therefore not subject to GOV-8's lifecycle. The page already owns the `BNDR` prefix per `governance.md`'s prefix table; no `**BNDR-N.**` markers exist on the page yet.

## Spec Documents

- `docs/spec_topics/binder.md` — `> **V1 seam — binder refinement loop.**` blockquote (edited)
- `docs/spec_topics/governance.md` — REQ-ID prefix table; GOV-1 anchor placement; GOV-8 lifecycle (read-only)
- `docs/plan_topics/h6-req-ids.md` — REQ-ID anchor-pass leaf that owns this insertion (read-only)

## Plan Impact

**Phases:** Horizontal H6

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

V16c, V16l, V16m, V16o all already test the substantive behaviour; their `**Spec**` fields and acceptance criteria do not change.

## Consequence

**Severity:** advisory

A reviewer or test author cannot cite obligation 2 (the `candidates` field's schema-presence-without-rendering split) without dragging in obligations 1 and 3, and a future GOV-8 retirement of any single carrier has no stable ID to retire against.

## Solution Space

**Shape:** single

### Recommendation

Split the seam blockquote's three numbered items into three top-level `**BNDR-N.**` paragraphs, each carrying its own MUST. Numbers slot into wherever the H6 anchor pass lands binder.md's BNDR sequence:

- `**BNDR-<i>.** The binder envelope schema MUST retain the three-arm `ok | needs_info | ambiguous` discriminator.`
- `**BNDR-<j>.** The envelope schema MUST retain the `ambiguous.candidates` field. The V1 runtime MUST NOT surface its contents on the user-facing system note.`
- `**BNDR-<k>.** The failure-mode templates table MUST keep distinct row prefixes for "argument binding needs more info" and "ambiguous arguments".`

Edge cases for the implementer:

- Retain the introductory paragraph as non-normative narrative framing above the three BNDRs. Do not anchor it.
- Drop the umbrella MUST sentence; the three sub-items each carry the MUST force individually.
- The existing `<a id="v1-seam-binder-refinement-loop"></a>` MAY be kept as a free-standing navigational bookmark or removed once the inbound link from `future-considerations.md#binder-refinement-loop` is retargeted. Prefer removal.
- The presentational blockquote (`>`) MAY be dropped along with the split.

## Relationships

- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster.
- T40 "Pre-evaluation failure list has no per-item anchors" — same-cluster.
- T42 "Race semantics: cancellation MUSTs lack per-obligation REQ-ID anchors" — same-cluster.
- T46 "GOV-9 cross-link contract is unsatisfiable for body-paragraph REQ-IDs" — must-follow.

---

# T42 — Race semantics: cancellation MUSTs lack per-obligation REQ-ID anchors

**Original heading:** Race semantics: four independent MUST obligations in continuous prose with no per-obligation identifier
**Original section:** docs/spec_topics/cancellation.md
**Kind:** traceability
**Importance:** medium

## Finding

The `**Race semantics.**` block in `cancellation.md` (lines 33–39) bundles several independently testable MUST obligations into continuous prose under a single bolded section label that is neither a `**CNCL-N.**` REQ-ID anchor nor an `<a id>` HTML anchor. The CNCL prefix is reserved for `cancellation.md` in the GOV-3 prefix table, but the page currently carries zero `**CNCL-N.**` markers.

Counting MUSTs in the block: (1) no retroactive `Ok(v) → Err({kind:"cancelled"})` rewrite; (2) no top-level synthesis of `cancelled` when no further checkpoint executes before the loom returns; (3) the late-settlement discard at the tool-call boundary, which itself nests three sub-MUSTs and is mirrored to four Promise-owning sites; (4) the swallowing-handler attachment requirement for the lifetime of every Pi-returned Promise the runtime might abandon.

Plan leaves under V18 already cite "the swallowing-handler rule in [Cancellation — Race semantics]" by descriptive name across V18a/b/c/d/e/p, because no per-obligation anchor exists. The H6 anchor-pass leaf is specified to insert one `**PREFIX-N.**` marker per *normative obligation* per page; with the obligations bundled in continuous prose, H6 cannot annotate them at the granularity GOV-1 requires without first splitting the prose.

## Spec Documents

- `docs/spec_topics/cancellation.md` — `**Race semantics.**` paragraph cluster, lines 33–39 (edited)
- `docs/spec_topics/governance.md` — GOV-1, GOV-3, GOV-8 (read-only)
- `docs/spec_topics/errors-and-results.md` — `Mid-stream cancellation, conversation state` cross-reference (read-only)
- `docs/spec_topics/pi-integration-contract.md` — `Checkpoint` seam and Subagent session lifecycle (read-only)

## Plan Impact

**Phases:** Horizontal H6, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18a — `AbortSignal` at every loop iteration boundary — (modified)
- V18b — `AbortSignal` before every `@` query — (modified)
- V18c — `AbortSignal` before every tool call — (modified)
- V18d — `AbortSignal` before every `invoke` — (modified)
- V18e — Cancellation propagates downward only — (modified)
- V18p — `AbortSignal` before and during the binder LLM call — (modified)

## Consequence

**Severity:** correctness

Plan-leaf citations across V18 currently reference these MUSTs by English paraphrase; without per-obligation anchors, the V18s GOV-9 spec-anchor gate cannot enforce that each cited rule resolves to a stable target, and a future split or rewording silently breaks every consumer with no GOV-8 retirement record.

## Solution Space

**Shape:** single

### Recommendation

Split the `**Race semantics.**` block into discrete `**CNCL-N.**` paragraphs at obligation granularity. The minimum split is four:

- **CNCL-N₁** — No retroactive `Ok → Err({kind:"cancelled"})` rewrite.
- **CNCL-N₂** — No top-level synthesis of `cancelled` when no further checkpoint executes before the loom returns.
- **CNCL-N₃** — Late-settlement discard at every checkpoint that has surfaced `cause:"cancelled"`. Three sub-MUSTs (no rebind, no second `Err`, no second `RuntimeEvent`). Applies to the `execute()` Promise, the `@`-query provider Promise, the `invoke` callee's top-level Promise, and the subagent `AgentSession.abort()` Promise.
- **CNCL-N₄** — Swallowing-handler attachment, attached at the construction site before the first microtask boundary.

Sequencing constraint: the prose split lands first (so the H6 pass annotates four discrete paragraphs rather than one).

Edge cases the implementer must watch:

- The late-settlement discard's three sub-MUSTs are tightly coupled. Bundling them under one `**CNCL-N.**` is acceptable per GOV-1, but the paragraph MUST enumerate the three sub-MUSTs explicitly so reviewers can cite "CNCL-N₃ clause (b)" unambiguously.
- The swallowing-handler attachment-timing sub-MUST can stay folded into CNCL-N₄.
- The cross-page extension to `AgentSession.abort()`'s discarded Promise lives in CNCL-N₄'s applicability list.
- Update every plan-leaf citation under V18a–V18p in the same H6 commit so the V18s spec-anchor gate is green.

## Relationships

- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster.
- T41 "Binder refinement-loop seam bundles three independent MUSTs under one navigational anchor" — same-cluster.
- T46 "GOV-9 cross-link contract is unsatisfiable for body-paragraph REQ-IDs" — must-follow.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T43 — GOV-14, GOV-15, PIC-1 violate GOV-1's Dual-form layout rule

**Original heading:** GOV-14, GOV-15, PIC-1: HTML anchor elements on separate lines from bold markers
**Original section:** docs/spec_topics/governance.md
**Kind:** traceability
**Importance:** medium

## Finding

GOV-1's *Dual-form layout* clause is normative and explicit: when the HTML anchor form accompanies a `**PREFIX-N.**` marker, it MUST appear on the same source line as the marker, in the literal byte order `<a id="prefix-n"></a> **PREFIX-N.**`. Three current sites in the spec corpus violate this rule:

- `docs/spec_topics/governance.md:94–96` — `<a id="gov-14"></a>` is on its own line with a blank line separating it from `**GOV-14 …**`.
- `docs/spec_topics/governance.md:129–131` — same pattern for `<a id="gov-15"></a>`.
- `docs/spec_topics/pi-integration-contract.md:458–460` — same pattern for `<a id="pic-1"></a>`.

These are the only three `<a id="<prefix>-N"></a>` HTML-form REQ-ID anchors that currently exist in the spec corpus, and all three are placed wrong. Plan leaf H6's first `Tests.` bullet encodes the same single-line co-location requirement and would fail against the current bytes.

## Spec Documents

- `docs/spec_topics/governance.md` — GOV-14 anchor (lines 94–96), GOV-15 anchor (lines 129–131) (edited)
- `docs/spec_topics/pi-integration-contract.md` — PIC-1 anchor (lines 458–460) (edited)
- `docs/spec_topics/governance.md` — GOV-1 *Dual-form layout* clause (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. H6 already encodes the correct dual-form layout in its `Tests.` bullets and `Adds.` paragraph; its acceptance criteria do not change.

## Consequence

**Severity:** correctness

The spec corpus violates one of its own normative governance rules at the only three sites where the rule's HTML-form clause currently applies. Rendered fragment targets still resolve in GitHub-flavoured Markdown, so cross-link navigation is unaffected; the breakage is internal self-consistency plus a guaranteed future failure of H6's same-line-co-location test.

## Solution Space

**Shape:** single

### Recommendation

At each of the three sites, delete the `<a id="…"></a>` line and the blank line below it, then prefix the existing `**PREFIX-N.**` line with `<a id="…"></a> ` (anchor, single ASCII space).

Two edge cases the editor must respect:

1. GOV-1's *Permitted alternate contexts* clause is a closed list — table cell, ATX heading, line preceding a fenced code block. None of the three sites match any of those contexts; they are paragraph-level markers. The placement fix here addresses only the *layout* violation; the *context* violation is the subject of T46 and must be resolved together with it before either patch lands cleanly.
2. GOV-14 currently sits *between* GOV-8's introductory paragraph and GOV-8's Split/Merge/Deletion bullets. That is a separate placement defect outside this finding's scope.

## Relationships

- T46 "GOV-9 cross-link contract is unsatisfiable for body-paragraph REQ-IDs" — must-follow (the resolution determines whether HTML anchors are permitted in paragraph context at all; this fix must land in the same edit).
- T44 "`HC3-a`–`HC3-e` and `NOCEIL-N` labels escape GOV-3 detection and GOV-8 governance" — same-cluster.
- T45 "`CIO-N` labels use a prefix that is not registered in the GOV-3 prefix table" — same-cluster.
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster.
- T42 "Race semantics: cancellation MUSTs lack per-obligation REQ-ID anchors" — same-cluster.
- T41 "Binder refinement-loop seam bundles three independent MUSTs under one navigational anchor" — same-cluster.

---

# T44 — `HC3-a`–`HC3-e` and `NOCEIL-N` labels escape GOV-3 detection and GOV-8 governance

**Original heading:** `HC3-a`–`HC3-e` and `NOCEIL-N` labels escape GOV-3 detection and GOV-8 governance
**Original section:** docs/spec_topics/hard-ceilings.md
**Kind:** traceability
**Importance:** high

## Finding

`hard-ceilings.md` introduces nine cross-page-citable identifiers — `HC3-a`…`HC3-e` (the per-class binder retry sub-obligations) and `NOCEIL-1`…`NOCEIL-4` (the enumerated non-existence claims) — each described in the page's own prose as a *"stable inline label citable from tests and downstream revisions."* They are cited by name from `spec.md`, from `governance.md` GOV-12's lock-step list, from sibling spec topics, and from plan leaves under `v16-binder.md` and `v18-cancellation.md`. They function as REQ-IDs in every operational sense.

But they are invisible to the GOV-3 machinery that polices REQ-IDs:

- **GOV-3 primary extractor** is `\b(<live-prefix-alternation>)-[1-9][0-9]*\b`. The numeric tail rules out `HC3-a`…`HC3-e` (alphabetic suffix), and `NOCEIL` is not in the live-prefix alternation.
- **GOV-3 unknown-prefix detector** is `\b[A-Z]{2,4}-[1-9][0-9]*\b`. The `{2,4}` cap excludes the 6-character `NOCEIL` prefix, and the numeric tail again excludes `HC3-a`…`HC3-e`.

The downstream consequences are concrete. The page's assigned prefix is `CEIL` (per the GOV-3 prefix table), but the page carries zero `**CEIL-N.**` markers; the V18s *Prefix-table-completeness gate* (gate 6) therefore reports `hard-ceilings.md` as having no live prefix witness. More importantly, GOV-8's lifecycle does not bind these labels: a substantive edit can land in-place without retirement.

## Spec Documents

- `docs/spec_topics/hard-ceilings.md` — *Per-class retry budget (ceiling #3)*, *No additional V1 runtime ceiling applies* (edited)
- `docs/spec_topics/governance.md` — REQ-ID prefix table, GOV-3, GOV-7, GOV-8, GOV-12 (option-dependent)
- `docs/spec.md` — Hard ceilings aggregator, Reading order entry (edited under either option)
- `docs/spec_topics/binder.md` — Failure-class taxonomy (HC3-a/b/c citations) (edited)
- `docs/spec_topics/diagnostics.md` — `loom/runtime/internal-error` row (NOCEIL-3 citation) (edited)
- `docs/spec_topics/errors-and-results.md` — Runtime panics (NOCEIL-3 citation) (edited)
- `docs/spec_topics/pi-integration-contract.md` — Outcome routing summary (NOCEIL-1 citation) (edited)
- `docs/spec_topics/tool-calls.md` — Non-settling Promise (NOCEIL-1 citation) (edited)

## Plan Impact

**Phases:** Horizontal (H6), Vertical (V18).

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified)

H6 must either emit `**CEIL-N.**` anchors over the nine load-bearing rules currently labelled HC3-x / NOCEIL-N — and the leaf's Spec field needs `hard-ceilings.md` added; it is currently missing — or extend the anchor pass to recognise a second class of stable inline label.

## Consequence

**Severity:** correctness

Substantive edits to HC3-x / NOCEIL-N can land in-place with no GOV-8 retirement and no detectable signal at any V18s gate. Cross-citing sites silently start carrying the new meaning.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option B (semantic preservation; introduce GOV-16 inline-label class for HC3/NOCEIL/CIO). Decision-time merge: T45 absorbed (T45 Option A — register CIO as co-owned prefix on `hard-ceilings.md` — is the symmetric counterpart of this Option B; both land as one "GOV-16 inline-label class + CIO co-owned prefix" commit). See T45 stub. Ordering note: land **before** T39, T40, T41, T42 (per-MUST REQ-ID splits) and **before** T27 (Hard ceilings aggregator trim) so the labels are formally registered when they are referenced or removed.

### Option A — Promote HC3-x and NOCEIL-N to formal `CEIL-N` REQ-IDs

**Approach.** Allocate `CEIL-1` through `CEIL-9` to the existing rules: `CEIL-1`…`CEIL-5` for the five HC3-x sub-obligations, `CEIL-6`…`CEIL-9` for the four NOCEIL-N claims. Renumber inline; update every cross-reference. Add `hard-ceilings.md` to H6's Spec field. Add a `hard-ceilings.md` row to `coverage-matrix.md`.

**Pros.** One identifier system, one set of governance rules, one set of CI gates. No new concepts in `governance.md`.

**Cons.** Loses semantically meaningful prefixes. `HC3-a` carries the information *"sub-obligation `a` of hard ceiling #3"*; `NOCEIL-3` carries *"non-existence claim about runtime memory."* Wide blast radius: ~20 cross-references rewritten in a single commit.

**Risks.** A misnumbered allocation or a missed cross-reference creates a gate failure when V18s lands.

### Option B — Formalise informal stable inline labels as a second governed class

**Approach.** Acknowledge in `governance.md` that REQ-IDs are not the only cross-page-citable identifier class. Add a new GOV rule (call it GOV-16) that defines *stable inline labels* as a second class with its own per-page registry, anchor form, GOV-8-equivalent lifecycle, and retirement table. GOV-3's two regexes stay unchanged; a third extractor is added that targets the inline-label form. The V18s gate gains a parallel arm.

**Pros.** Preserves the mnemonic value of `HC3-a` / `NOCEIL-3`. Zero churn to existing cross-references (~20 sites untouched). Captures a real linguistic distinction.

**Cons.** Adds a second identifier class to governance, doubling the rule surface. V18s gate logic grows. Sets a precedent.

**Risks.** GOV-3's *unknown-prefix detector* is the spec's "we caught everything" guarantee. The new rule MUST close this — likely by widening the unknown-prefix detector and registering the inline-label prefixes alongside REQ-ID prefixes.

### Recommendation

Adopt **Option B**. The phrase *"stable inline label citable from tests and downstream revisions"* appears three times in `hard-ceilings.md` and reads as a deliberate design choice; the labels' semantically meaningful prefixes would be lost under flattening to `CEIL-N`. The blast radius of Option B is concentrated in `governance.md` and the two anchor-related plan leaves.

Edge cases the implementer must watch:

1. The new GOV-16 rule MUST tighten the unknown-prefix detector — either by widening `[A-Z]{2,4}` to cover up to 6 characters, or by adding the inline-label prefixes to a dedicated per-page registry consulted by the detector.
2. The lock-step convention in GOV-12 already names `HC3-a…HC3-e` and `NOCEIL-1…NOCEIL-4` explicitly; that enumeration is correct under Option B and stays as-written.

## Relationships

- T45 "`CIO-N` labels use a prefix that is not registered in the GOV-3 prefix table" — co-resolve (same root cause).
- T43 "GOV-14, GOV-15, PIC-1 violate GOV-1's Dual-form layout rule" — same-cluster.
- T46 "GOV-9 cross-link contract is unsatisfiable for body-paragraph REQ-IDs" — same-cluster.
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — must-follow (trimming the aggregator first reduces the surface that retargeting touches).

---

# T45 — `CIO-N` labels use a prefix that is not registered in the GOV-3 prefix table

**Original heading:** `CIO-N` labels use an unregistered prefix
**Original section:** docs/spec_topics/hard-ceilings.md
**Kind:** traceability
**Importance:** high

**STATUS:** Merged into T44 on 2026-05-08. T45 chose Option A (register CIO as a co-owned prefix on `hard-ceilings.md`; rework GOV-3/4/5/7 from "per-page prefix" to "per-page prefix(es)"). T45's CIO co-owned-prefix registration is the symmetric counterpart of T44 Option B's GOV-16 inline-label class for HC3/NOCEIL — both decisions land as one "GOV-16 inline-label class + CIO co-owned prefix" commit. The body below is retained for traceability; the actionable hardened recommendation lives in T44.

## Finding

`hard-ceilings.md` defines six rules `**CIO-1.**` through `**CIO-6.**` under *Interaction between ceilings*, using exactly the GOV-1 inline anchor form. Per GOV-3 the unknown-prefix detector regex is `\b[A-Z]{2,4}-[1-9][0-9]*\b`; `CIO` is three uppercase ASCII letters and `CIO-1`…`CIO-6` match this regex. GOV-6 then requires every observed prefix to belong to the union of (live prefix table, *Retired prefixes* sub-table). `CIO` appears in neither table — `hard-ceilings.md`'s row in the live table allocates it `CEIL`, and `CIO` is absent from the retired sub-table. The V18s *Prefix-table-completeness gate* (per `plan_topics/v18-cancellation.md` gate 6) would therefore exit non-zero on every commit until `CIO` is either registered or eliminated.

The CIO labels are also load-bearing across the corpus: they are cited by `spec.md`, `query.md`, `binder.md`, `pi-integration-contract.md`, `glossary.md`, and `plan_topics/v6-typed-queries.md`. Whichever fix is chosen sweeps all of these references.

The collateral observation that `hard-ceilings.md`'s registered `CEIL` prefix has no `**CEIL-N.**` anchors is not a separate violation under the existing rules, but it does mean the prefix slot is available for option B below without conflict.

## Spec Documents

- `docs/spec_topics/governance.md` — REQ-ID prefix table; *Retired prefixes* sub-table (option-dependent)
- `docs/spec_topics/hard-ceilings.md` — *Interaction between ceilings* (edited)
- `docs/spec.md` — *Orientation > Scope > Hard ceilings* aggregator and Reading-order pointer (edited under option B)
- `docs/spec_topics/query.md` — `## Tool-call loop bound` example narrative (edited under option B)
- `docs/spec_topics/binder.md` — *Failure-class taxonomy* AJV-on-`args` paragraph (edited under option B)
- `docs/spec_topics/pi-integration-contract.md` — PIC-1 mask-domain table and V1-reachable-predicate paragraph (edited under option B)
- `docs/spec_topics/glossary.md` — *tool-call round slot accounting* (edited under option B)
- `docs/plan_topics/v6-typed-queries.md` — V6k driver paragraph (edited under option B)
- `docs/plan_topics/v18-cancellation.md` — V18s gate 6 specification (read-only; defines the failing gate)
- `docs/plan_topics/h6-req-ids.md` — H6 Spec field and anchor-pass scope (edited)

## Plan Impact

**Phases:** Horizontal H6, V18 (vertical slice).

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (blocked) — gate 6 cannot land green until `CIO` is registered or the labels are renumbered

## Consequence

**Severity:** correctness

The V18s closing CI gate cannot ship green against the current spec — it would report `CIO-1` … `CIO-6` as unknown prefixes on every PR and main build, blocking the closing gate from doing useful work.

## Solution Space

**Shape:** single

**Decision (2026-05-08):** Option A. Resolved by merge into T44 — see STATUS banner at top of this finding.

### Option A — Register `CIO` as a co-owned prefix on `hard-ceilings.md`

- **Approach.** Extend GOV-3 / GOV-4 to allow a page to own ≥1 prefixes. Add a row binding `CIO` to `hard-ceilings.md`; leave the existing `CEIL` row in place.
- **Spec edits.** `governance.md`: reword GOV-1/GOV-3/GOV-4/GOV-5/GOV-7 from "per-page prefix" to "per-page prefix(es)"; add a `CIO` row. `hard-ceilings.md`: no change to anchor text. No edits to citing pages.
- **Pros.** Preserves thematic naming. No churn at citation sites.
- **Cons.** Touches load-bearing governance rules. The Spec-field closure rule (GOV-11) needs a wording check.
- **Risks.** Schema change ripples into every gate that parses the prefix table.

### Option B — Renumber `CIO-1` … `CIO-6` as `CEIL-1` … `CEIL-6`

- **Approach.** Edit `hard-ceilings.md` to replace each `**CIO-N.**` anchor with `**CEIL-N.**`, then sweep every citation in the seven other files. No governance schema change.
- **Spec edits.** `hard-ceilings.md` (six anchor edits + the self-citations). Citations in `spec.md`, `query.md`, `binder.md`, `pi-integration-contract.md`, `glossary.md`, `plan_topics/v6-typed-queries.md`, and the GOV-12 aggregator-list paragraph in `governance.md`.
- **Pros.** Lives entirely within the existing one-prefix-per-page model. No governance wording changes.
- **Cons.** Loses the thematic prefix that makes CIO-N self-documenting.
- **Risks.** A miss in the citation sweep will produce broken back-references. Mitigation: do the sweep with `grep -rn '\bCIO-[1-9]\b' docs/` and assert empty after edit.

### Recommendation

**Option B.** Renumber to `CEIL-N` and sweep the eight files. The schema change in option A is disproportionate when the entire problem is six labels on one page that already has a registered prefix sitting unused.

Edge cases the implementer must watch:

- Co-allocate `CEIL-1` … `CEIL-6` for the existing `CIO-1` … `CIO-6` rules in source order. If the same commit also resolves T44 (which it should), continue numbering: `HC3-a` → `CEIL-7`, …, `NOCEIL-4` → `CEIL-15`. Dense numbering per GOV-3 is satisfied.
- The GOV-12 aggregator paragraph in `governance.md` enumerates "CIO-1…CIO-6" as part of the cross-ceiling content list; sweep it.
- The Reading-order entry in `spec.md` lists "CIO-1…CIO-6" in its hard-ceilings cross-reference; sweep it.
- The H6 Spec field omits `hard-ceilings.md` today; the fix commit must add it.
- Sweep with `grep -rn '\bCIO-[1-9]\b' docs/` after the edit; expect zero hits.

## Relationships

- T44 "`HC3-a`–`HC3-e` and `NOCEIL-N` labels escape GOV-3 detection and GOV-8 governance" — co-resolve.
- T27 "Hard ceilings aggregator duplicates owner-page error codes and sub-obligation labels" — same-cluster.
