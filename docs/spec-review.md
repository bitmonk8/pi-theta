# Triaged Spec Review - spec

_Generated: 2026-06-03T19:20:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T36) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 1 high, 15 medium retained; 13 low discarded; 4 low findings merged into 2 medium findings; 0 nit dropped; 0 false dropped._

---

# T01 - Echo policy illustrative example contradicts the quoting predicate

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The illustrative example under the "Echo policy" section of `docs/spec_topics/binder.md` renders `focus_areas=[error handling, async]` and `author={Ada Lovelace, …}` with the space-containing strings `error handling` and `Ada Lovelace` left unquoted. The format rules that immediately follow require any string with a code point outside `[A-Za-z0-9_.-]` to be quoted, and the reference-rendering table makes this explicit with its `"has space"` → `"has space"` row. The example therefore contradicts the predicate it is meant to illustrate. A reader who pattern-matches on this first example and skips the predicate will emit non-conforming, unquoted output.

## Solution approach

Rewrite the illustrative example line under "Echo policy" so every interpolated value conforms to the format rules below it, quoting the two space-containing strings while leaving the unquoted-branch values intact — e.g. `Running \`/code-review\`: language=TypeScript, focus_areas=["error handling", async], author={"Ada Lovelace", …}`. Keeping `TypeScript` and `async` unquoted exercises both branches of the predicate in one example.

## Solution constraints

- None.

## Relationships

- T24 "Echo policy — 'first field' rule undefined for anonymous inline-object-typed values" — same-cluster (both touch the Echo policy section's example/format rules; resolve independently — the anonymous-inline-object rule is about a missing ordering source, not about quoting).
- T25 "System-note rendering rule 1 — 'whitespace' undefined for collapse and trim" — same-cluster (same Echo policy / System-note rendering surface; resolves independently).
# T02 - Failure-mode templates use an undefined `<provider>` placeholder

**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Failure-mode templates (normative)" section in `binder.md` opens with a MUST-emit-verbatim contract and enumerates exactly three interpolated placeholders — `<message>`, `<candidates>`, and `<ajv-summary>`. The transport-failure row of the six-row table renders `loom /<name>: argument binder unavailable (<provider>: <message>)`, but `<provider>` is never defined among the enumerated placeholders. Because the surrounding text is byte-exact normative, two conformant renderers can disagree on what string belongs inside the parenthetical.

## Solution approach

Add a fourth placeholder definition for `<provider>` to the paragraph in binder.md's "Failure-mode templates (normative)" section that currently introduces `<message>`, `<candidates>`, and `<ajv-summary>`, identifying it as the `provider` field of the classifier-produced `TransportError` rendered verbatim — the raw wire provider id, not a normalised form. Forward-link the definition to the `TransportError` schema at errors-and-results.md `#queryerror-variants` and to the Provider error mapping table at pi-integration-contract.md `#provider-error-mapping`.

## Solution constraints

- Out of scope: assigning a BNDR-N REQ-ID anchor to this paragraph (owned by T12).

## Relationships

- T25 "System-note rendering rule 1 — 'whitespace' undefined for collapse and trim" — same-cluster (both are under-defined-token gaps in the same set of normative renderings; resolved independently).
- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — decision-overlap (the placeholder definition edited here will sit under whichever BNDR-N anchor the traceability fix assigns to this paragraph; resolve traceability first if both land together, otherwise independent).
# T03 - Determinism section over-pins FNV-1a as the binder-seed algorithm

**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`binder.md` §Determinism mandates the exact 32-bit FNV-1a algorithm (offset basis `0x811c9dc5`, prime `0x01000193`), the exact hashed byte sequence, and three frozen reference vectors under "Conforming implementations MUST reproduce these values exactly." The 32-bit seed value is not observable to loom authors or operators, and is omitted from the request payload for the `anthropic-messages` and `amazon-bedrock` transports the recommended binder models use. The strong MUST only purchases an observable property — cross-implementation byte-equivalence of binder provider requests — when the binder model resolves to a seed-supporting provider (`openai-completions` / `mistral`), and the section never states this as its rationale. A maintainer cannot tell which property is load-bearing when a provider deprecates its seed field, a transport is added, or a faster hash is proposed.

## Solution approach

In `binder.md` §Determinism (`#determinism`), keep the existing FNV-1a MUST and the three reference vectors — the gap is the missing rationale, not the algorithm choice — and add a justification clause naming the property the pin purchases: cross-implementation byte-equivalence of binder provider requests for seed-supporting providers. Cross-reference the `#provider-seed-field-mapping` anchor in `pi-integration-contract.md` and the GOV-15 conformance fixture suite (`#gov-15-fixture-suite`).

## Solution constraints

- Out of scope: the reproducibility-contract scope wording in §Determinism owned by T23 — add only the FNV-1a-pin rationale.
- Reference `#provider-seed-field-mapping` by anchor; do not reproduce its supporting/omitting provider split inline.

## Relationships

- T23 "Binder Determinism — reproducibility scope overreaches the provider contract" — same-cluster (both target binder.md §Determinism and both turn on what loom actually controls vs. what is provider-dependent; resolve independently — the rationale clause added here should reference the narrowed reproducibility-contract wording produced by that finding, but neither blocks the other).
- T28 "Canonical schema hash, step 2 — numeric serialization underspecified" — same-cluster (both pin a byte-level deterministic recipe whose output is load-bearing for cross-run reproducibility; resolutions are independent — this finding tightens the rationale for a recipe, that one tightens the recipe itself).
# T04 - Settings-watcher debounce window left unpinned

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/discovery.md` §Settings file reads → **Caching and reload** says only that "Watcher events are debounced to absorb partial writes from editors-in-progress" — no numeric window is given and the watcher is not tied to the injected `Clock` seam at this site. `pi-integration-contract.md` §`Clock` / `FakeClock` interface cross-references this section for the settings-watcher debounce window, so the reference is circular: it points here for a number this section never provides. A `FakeClock`-driven conformance test cannot pick the `advance(N)` boundary distinguishing "still coalescing" from "reload fired", and two implementers will diverge on reload latency and burst-coalescing behaviour for editor partial writes.

## Solution approach

Rewrite the "Watcher events are debounced…" sentence in `docs/spec_topics/discovery.md` §Settings file reads → **Caching and reload** to pin the settings-watcher debounce window at `250 ms`, measured against the injected `Clock` seam via `Clock.setTimeout` / `Clock.clearTimeout`, with each fresh watcher event resetting the timer (drop-and-reschedule, holding only the most recent handle). Cross-link the `Clock` / `FakeClock` interface section of `docs/spec_topics/pi-integration-contract.md` so the existing back-reference there resolves to a concrete window.

## Solution constraints

- Out of scope: the **Keys read** sub-block of §Settings file reads (owned by T30).

## Relationships

- T30 "`settings.json` shape undetermined: `looms` array collides with `looms.*` namespace" — same-cluster (same §Settings file reads section; resolve independently — the ambiguity fix touches the **Keys read** sub-block, this fix touches **Caching and reload**).
# T05 - future-considerations.md category headings still spelled `V1`

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

All four `## `-level category headings on `docs/spec_topics/future-considerations.md` still carry the legacy `V1` version token (`Tooling deferrals (no V1 impact)`, `Surface extensions (V1 leaves a seam)`, `Model-level changes (no V1 seam expected)`, `V1 non-goals`), while the rest of the corpus has converted to the canonical `loom 1.0` spelling per the GOV-20 alias table. Only `V1 non-goals` carries a GOV-21 dual-anchor pair; the other three headings have no authored anchor, so their only fragment identifier is the renderer-produced auto-id. Four in-corpus citations target `#surface-extensions-v1-leaves-a-seam` — two from `docs/spec.md` and two internal to `future-considerations.md` — and under [GOV-21 *Incidental auto-id prohibition*](./governance.md#gov-21-incidental-auto-id) that renderer auto-id is not a citable stable anchor, so a naive heading-text rename would silently break all four.

## Solution approach

Rename the four category headings on `docs/spec_topics/future-considerations.md` from the `V1` token to the `loom 1.0` spelling. Add GOV-21 dual anchors (a canonical `loom-1-0-*` arm plus a `v1-*` alias arm) to the three currently anchor-less headings so the rename is anchor-stable; the existing `V1 non-goals` pair is already correct and is retained. Repoint the four inbound citations of `#surface-extensions-v1-leaves-a-seam` (in `docs/spec.md` and internally in `future-considerations.md`) to the new canonical arm.

## Solution constraints

- Out of scope: retiring the `v1-*` alias arms. They are permanent back-compat aliases under [GOV-21 *Alias permanence*](./governance.md#gov-21-alias-permanence); alias-only retirement is gated on the separate *Retirement discharge* witness.

## Relationships

None
# T06 - Glossary `GOV-N` entry under-describes the live GOV range and scope

**Kind:** cross-spec-consistency-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The **GOV-N (governance rule)** glossary entry in `docs/spec_topics/glossary.md` defines the `GOV` prefix as "(`GOV-1` through `GOV-8`)" rules that "govern how REQ-IDs are coined, anchored, retired, and gated". Both the range and the scope are narrower than what `governance.md` — the page that owns the rules — actually carries: live rules now run through GOV-23 (with GOV-2/10/11/13 retired), and GOV scope extends well beyond REQ-ID lifecycle to aggregator lock-step (GOV-12), stable inline labels (GOV-16), corpus direction and binding scope (GOV-17/18), release-version naming (GOV-19/20/21), and Session Model anchor stability (GOV-23). Sibling glossary entries already cite rules outside the `1–8` window (e.g. GOV-19, GOV-20). The spec's central definition of the `GOV-N` token thus silently contradicts the canonical page it cross-links to.

## Solution approach

Rewrite the `GOV-N (governance rule)` entry in `glossary.md` so the range is expressed by pointer to `governance.md` rather than a fixed upper bound — orienting on the live range (currently through `GOV-23`, with retirements per [Retired REQ-IDs](./governance.md#retired-req-ids)) so the entry stays stable across future GOV additions. Broaden the scope clause beyond REQ-ID coining/anchoring/retirement to describe the live GOV surface (inline labels, `spec.md` aggregator lock-step, corpus direction and binding scope, release-version naming and legacy-token aliases, the source-language equivalence release-process goal, and Session Model anchor stability). Keep the existing per-page-prefix-table sentence and the `See: [Governance](./governance.md)` cross-link.

## Solution constraints

- Out of scope: `governance.md` rule bodies, the REQ-ID prefix table, and the *Retired REQ-IDs* section — edit `glossary.md` only.
- MAY NOT coin a new REQ-ID at this site: the glossary page is narrative (`(no IDs — narrative)` in its prefix-table row).

## Relationships

None
# T07 - Per-boundary tables use undefined `calling loom` instead of glossary `invoke parent`

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Two parallel normative tables — the ceiling #4 per-boundary table in `hard-ceilings.md` (the `invoke<T>` return value row, anchor `#ceiling-4-table`) and the Depth Enforcement per-boundary table row #5 in `schema-subset.md` — label the destination of an `invoke<T>` return-value depth violation as `calling loom`. The glossary's `caller` entry canonizes a different term, `invoke parent`, for exactly this concept, while `calling loom` is used elsewhere in the spec for the distinct path-resolution-anchor concept. `calling loom` is nowhere defined as an alias for `invoke parent`, so a reader cannot tell from the table which concept the destination column names. The ambiguity bites precisely here, because the destination governs who observes the `Err` and therefore which surface contract applies.

## Solution approach

Rename `calling loom` to the glossary canon `invoke parent` in the Destination column of the `invoke<T>` return value row in both the ceiling #4 table in `hard-ceilings.md` (`#ceiling-4-table`) and the Depth Enforcement table row #5 in `schema-subset.md`.

## Solution constraints

- Out of scope: the `calling loom` occurrences in `invocation.md`, `frontmatter.md`, `overview.md`, and `pi-integration-contract.md` — those name the path-resolution anchor, a distinct concept, and must not be renamed.

## Relationships

- T22 "invocation.md carries no INV-N REQ-IDs" — decision-overlap (the INV-N anchor on typed return is the natural cross-link target for these tables once it lands; the two edits coordinate naturally but neither blocks the other).
# T08 - Runtime bullets name AJV in normative prose despite SchemaValidator being the contract

**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `implementation-notes.md`, the **Schema validation** bullet establishes the injected `SchemaValidator` service as the observable contract and demotes AJV to a single non-normative *Implementation hint*. Two earlier normative Runtime bullets, however, name AJV directly as the validator of record: the typed-query bullet ("the returned tool-call payload is validated with **AJV**") and the `params:` bullet ("Parameter schemas … are likewise validated with AJV"). A reader following the contract front-to-back sees AJV named as the binding validator before learning the contract is library-agnostic, and a conformance-test author cannot tell whether an alternative conforming `SchemaValidator` satisfies the typed-query and `params` validation hooks.

## Solution approach

Rewrite the typed-query Runtime bullet and the `params:` Runtime bullet in `implementation-notes.md` to reference the injected `SchemaValidator` rather than AJV, forward-linking to the **Schema validation** bullet that introduces the seam.

## Solution constraints

- Out of scope: every AJV reference outside the two named Runtime bullets — the *Implementation hint (non-normative)* bullet (the correct home for the AJV v8 / `ajv-formats` choice), the `ValidationError` / `params` AJV-compatibility notes, and cross-page AJV terminology in `binder.md`, `errors-and-results.md`, and `frontmatter.md`.

## Relationships

- T26 "Defaulting — fill semantics undefined when the binder supplies a value for a defaulted field" — same-cluster (both involve the post-default-merge AJV/SchemaValidator step; the rename here is editorial and does not constrain the fill-semantics decision).
# T09 - `ui.notify` inline signature contradicts the pinned SDK declaration

**Kind:** doc-alignment-broad
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `ExtensionContext` inline block's `ui:` row in `pi-integration-contract.md` annotates `ui.notify` with a signature that contradicts the pinned SDK declaration of `ExtensionUIContext` in `@earendil-works/pi-coding-agent` (`dist/core/extensions/types.d.ts`). The inline form names the second parameter `kind` and marks it required; the SDK declares `type?` — optional. The optionality divergence is substantive: the SDK permits a one-argument `ui.notify("…")` call, while a consumer reading the inline annotation as authoritative would type its wrapper as requiring the second argument. The same block is governed by the in-page rule that this subset MUST be re-validated against the cited types file on each Pi minor bump, so the mismatch will recur as a false positive on every alignment audit until corrected.

## Solution approach

Rewrite the `ui.notify` annotation in the `ui:` row of the `ExtensionContext` inline block to match the SDK declaration: `ui.notify(message: string, type?: "info" | "warning" | "error"): void`.

## Solution constraints

- None.

## Relationships

- T34 "`estimateTokens` — ownership story is incoherent" — same-cluster (sibling normative-vs-SDK alignment issue on the same page; different remedy class — ownership story vs typo).
- T10 "`chokidar` named repeatedly but never declared as a dependency" — same-cluster (sibling external-entity declaration gap on the same page; different remedy class).
# T10 - `chokidar` named repeatedly but never declared as a dependency

**Kind:** external-entities
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`chokidar` is the production adapter behind the `FileWatcher` seam and is named across `pi-integration-contract.md` (the `discoveryWatcher.close()` parenthetical, the `session_shutdown` stale-runtime edge-case bullet, the `FakeFileWatcher` / `FileWatcher` interface block, and the `watch` bullet's event-filter list) and `diagnostics.md`'s Transient-toasts bullet, yet no paragraph declares which `package.json` block it belongs in or whether its import sites fall inside the PIC inventory-closure audit's *Target surface categories* scope. This is asymmetric with the two other npm packages PIC names: `semver` has a dedicated declaration in *Loom-package implementation dependencies (loom 1.0)*, and `typebox` has its own Pi-bundled-package sub-paragraph with explicit manifest-block framing. As a result, two implementers can produce divergent `package.json` files (e.g. `dependencies` vs `peerDependencies`) and divergent audit-exemption setups with no spec text deciding which is conformant.

## Solution approach

Add a `chokidar` clause to the existing *Loom-package implementation dependencies (loom 1.0)* paragraph (anchor `id="loom-package-implementation-dependencies-loom-1-0"`), naming `chokidar` as a loom-package `dependencies` entry on the `semver` precedent and linking its npm page. State that `chokidar` is out of scope for the inventory-closure audit's *Target surface categories* (anchor `id="audit-target-surface-categories"`), so no audit exemption marker is required at `chokidar` import sites. Name the dependency, not a version literal.

## Solution constraints

- Out of scope: the `FakeFileWatcher` / `FileWatcher` interface block and its illustrative `chokidar` references (the event-name comment, the `close()` parenthetical, the `addDir` / `unlinkDir` / `ready` / `error` filter list) stay as-is; the seam contract remains library-agnostic.

## Relationships

- T09 "`ui.notify` inline signature contradicts the pinned SDK declaration" — same-cluster (sibling external-entity / SDK-alignment gap on the same page; resolve independently).
# T11 - Vestigial "decided separately" pointers in query.md should link to Degenerate rendered templates

**Kind:** clarity, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Two sites in `docs/spec_topics/query.md` carry a vestigial "decided separately" back-pointer about empty rendered templates: the vector commentary item 6 in the dedent/newline-trim reference table, and the per-slot bullet under "Stringification of interpolated values" → Notes. Both say how an empty rendered template is handled "is decided separately" and send the reader hunting for a separate decision. No separate decision exists — the rule is already fully pinned earlier in the same file under the "Degenerate rendered templates" subsection (parse-time `loom/parse/empty-template` warning plus a runtime short-circuit to `Err(QueryError { … cause: "empty_template", … })`). The phrasings are drafting residue left in after the disposition was settled in-file.

## Solution approach

Rewrite both "decided separately" parentheticals — vector commentary item 6 and the per-slot stringification Notes bullet — as direct in-file cross-references to the "Degenerate rendered templates" subsection, dropping the "decided separately" framing and using the same anchor target at both sites. The subsection heading carries no bespoke anchor, so the implementer establishes or reuses query.md's intra-file fragment convention for the target.

## Solution constraints

- None.

## Relationships

- T33 "`max_rounds: 0` user-turn separator disagrees with the Follow-up turn templates it cites" — same-cluster (another `query.md` cross-reference defect; independent fix).
- T32 "Top-level `Err` per-`kind` table — `validation` row collapses the two causes" — same-cluster (both concern the `empty_template` short-circuit's normative footprint, but resolve in different files).

---
# T12 - binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `BNDR` prefix is registered in `governance.md`, but only `BNDR-1 … BNDR-3` are coined on `binder.md`, all three on the *Binder envelope* sub-section. The page's other dense normative-MUST surfaces — *Compact-transcript format (normative)*, *Session-context truncation (`bind_context: session`)*, *System-prompt structure (normative)*, and *Failure-mode templates (normative)* — carry no `BNDR-N` anchors, even though each rule is independently violable and independently testable. Per `GOV-22`, until these obligations are coined, `GOV-9`'s `#prefix-n` cross-link contract is unsatisfiable for them: inbound references from `spec.md`, `slash-invocation.md`, `frontmatter.md`, and `pi-integration-contract.md` resolve only to section-heading anchors or bespoke per-paragraph anchors, never to a per-obligation stable ID.

## Solution approach

Add dual-form `BNDR-N` anchors at the un-anchored normative obligation sites on `binder.md` — *Session-context truncation*, the *Compact-transcript format* MUST rules, the *System-prompt structure* items, the reference-rendering byte-pinning lead-ins, and the *Failure-mode templates* obligations — allocating numeric tails per `GOV-3` (next free integer starting at `BNDR-4`, no hole-filling) in the `GOV-1` *Dual-form layout*. Coin one ID per independently-testable obligation so each citable MUST resolves to its own `#bndr-n`, rather than a single block-level ID per section. Where a bespoke anchor already exists (e.g. `#per-invocation-retry-budget`), keep it in place and add the `BNDR-N` dual-form pair alongside.

## Solution constraints

- Out of scope: defining the `<provider>` placeholder (owned by T02) and repointing the `<ajv-summary>` cross-link to `#err-n` (owned by T18).

## Relationships

- T13 "cancellation.md carries no CNCL-N REQ-IDs" — same-cluster (same systemic GOV-22 gap on a different topic page; resolved independently).
- T16 "query.md missing QRY-N REQ-IDs" — same-cluster (parallel GOV-22 gap; independent prefix).
- T17 "slash-invocation.md carries no SLSH-N REQ-ID anchors" — same-cluster (parallel GOV-22 gap; independent prefix).
- T18 "`validation-issue-ordering` paragraph carries no ERR-N REQ-ID" — decision-overlap (the `<ajv-summary>` clause on `binder.md` cites the `validation-issue-ordering` paragraph by parent-section anchor; once that paragraph gets its `ERR-N`, the `binder.md` `<ajv-summary>` text should be repointed to `#err-n`).
- T02 "Failure-mode templates use an undefined `<provider>` placeholder" — decision-overlap (the `<provider>` definition will sit under whichever BNDR-N anchor this coinage assigns to the placeholder paragraph).
# T13 - discovery.md carries zero DISC-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`discovery.md` is a non-narrative page carrying multiple independently-violable normative obligations — among them the home-directory-expansion seam-routing MUST, the `pi.looms` shape MUST, the package-walk `Clock.setTimeout` / silenced-`.catch` / no-reroute MUSTs, the per-source failure-mode table, the case- and cross-format-collision rejections, the per-source dedup rule, and the settings-file merge semantics — yet it coins zero `DISC-N` REQ-ID anchors, even though `governance.md`'s REQ-ID prefix table registers the `DISC` prefix for the page. This violates GOV-22, which obligates a non-narrative page with un-anchored normative obligations to coin the missing REQ-IDs so GOV-9's `#prefix-n` cross-link contract is satisfiable. Inbound cross-links from `binder.md`, `diagnostics.md`, `errors-and-results.md`, `frontmatter.md`, `future-considerations.md`, `glossary.md`, and `governance.md` therefore resolve only to section-heading slugs, so no callsite can cite a specific obligation by stable id and a heading rename silently breaks every inbound link.

## Solution approach

Add `DISC-N` dual-form anchors (`<a id="disc-n"></a> **DISC-N.**`) to `discovery.md` per GOV-1 layout, one per independently-violable normative obligation, splitting or merging per GOV-8. Rewrite the inbound `discovery.md#<heading-slug>` cross-links named in the Problem to target the corresponding `#disc-n` fragment wherever they cite a specific obligation rather than the whole page.

## Solution constraints

- Preserve the existing navigation anchors `discovery-roots`, `home-directory-expansion`, and `file-extension-namespace`; co-locate each new `DISC-N` pair rather than replacing them.

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel GOV-22 coinage gap; independent fix).
- T14 "frontmatter.md carries no FRNT-N REQ-IDs" — same-cluster (parallel gap on a different page).
- T21 "cancellation.md carries no CNCL-N REQ-IDs" — same-cluster (parallel gap; resolved by the same GOV-22-driven coinage pattern).
- T22 "invocation.md carries no INV-N REQ-IDs" — same-cluster (parallel gap on a load-bearing page).
# T14 - frontmatter.md carries no FRNT-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`governance.md`'s REQ-ID prefix table allocates the `FRNT` prefix to `frontmatter.md`, but the page carries zero `**FRNT-N.**` anchors — a corpus-wide grep for `FRNT-[0-9]+` returns no matches. The page nonetheless states a substantial body of independently-violable normative obligations (the Unknown-key policy, each *Field contract* table row, the *Naming convention* rules including the "**No `name` field**" prohibition, the `params`/`tools`/`system:` rules, the *Resolution snapshot* bullets, the `loom/parse/system-interp-*` diagnostics, and the `respond_repair`/`tool_loop` semantics), none of which carries a co-located REQ-ID anchor. As a result GOV-22 fires a fresh violation on every substantive edit to the page, and GOV-9's `#prefix-n` cross-link contract is permanently unsatisfiable for the dozen-plus inbound references from sibling pages that name a specific frontmatter obligation.

## Solution approach

Add dual-form `FRNT-N` anchors at each independently-violable defining obligation site on `frontmatter.md` — one anchor per obligation, not one per paragraph — allocated per GOV-3 and laid out per GOV-1 *Dual-form layout*. In the same commit, rewrite inbound cross-references on the sibling pages that name a specific frontmatter obligation (rather than the whole page) to `#frnt-n` targets per GOV-9.

## Solution constraints

- When adding a co-located `FRNT-N` anchor at a site that already carries a bespoke HTML `id="..."` slug (e.g. `binder-model-root-word-convention`, `loom-1-0-seam-system-expression-sublanguage`, the inline `id="tools"`), preserve the existing slug.
- Repointing inbound cross-references edits only the link targets on sibling pages; coining those pages' own REQ-ID anchors is out of scope (T12, T13, T15, T16, T22 own their respective pages' coinage).

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel GOV-22 gap).
- T13 "discovery.md carries zero DISC-N REQ-IDs" — same-cluster (parallel GOV-22 gap).
- T22 "invocation.md carries no INV-N REQ-IDs" — same-cluster (`frontmatter.md` has multiple inbound-to-invocation cross-links; repointings are concurrent but the fixes are independent).
# T15 - Probe-wide invariants block missing PIC-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The **Probe-wide invariants** block in `pi-integration-contract.md` (immediately after the (a)–(e) probe sub-step enumeration) bundles four independently violable normative obligations — no self-member use, `typeof`/`in`-only checks, no probes beyond the five enumerated, and the factory MUST NOT throw — but none carries a stable `PIC-N` identifier. The `PIC` prefix is registered in governance.md's per-page prefix table and in active use (`PIC-1`, `PIC-2`), so the anchor mechanism is available; these four obligations are simply un-coined. Without per-obligation anchors, conformance tests, diagnostics, and cross-page citations can reference the block only by parent-section heading, collapsing four independently-testable failure modes onto one citation surface and leaving GOV-9's `#prefix-n` cross-link contract unsatisfiable for any caller that needs to pin one obligation. GOV-22 is the rule that admits this gap and prescribes coining a dual-form `PIC-N` anchor at each defining site.

## Solution approach

Add four dual-form `PIC-N` anchors — `PIC-3`, `PIC-4`, `PIC-5`, `PIC-6`, the next free integers after `PIC-1` and `PIC-2` — one per bullet in the Probe-wide invariants block, following the GOV-1 dual-form layout already used at the `pic-1` and `pic-2` anchors.

## Solution constraints

- None.

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (same GOV-22 trigger; resolved independently per its own page).
- T21 "cancellation.md carries no CNCL-N REQ-IDs" — same-cluster (page-wide instance of the same gap).
- T22 "invocation.md carries no INV-N REQ-IDs" — same-cluster (same page carries inbound-to-invocation cross-links that the INV-N coinage lands alongside).
