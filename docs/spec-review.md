# Triaged Spec Review - spec

_Generated: 2026-06-03T19:20:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T36) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 2 high, 22 medium retained; 13 low discarded; 4 low findings merged into 2 medium findings; 0 nit dropped; 0 false dropped._

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
# T16 - query.md missing QRY-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`governance.md`'s REQ-ID prefix table registers the `QRY` prefix to `query.md`, but the page carries zero `QRY-N` anchors — neither the GOV-1 *Canonical form* inline `**QRY-N.**` marker nor the *Dual-form layout* `<a id="qry-n">` token — despite hosting many independently verifiable normative obligations. Because no `#qry-n` fragments exist, every inbound cross-link from sibling pages resolves only at section-heading granularity, violating the GOV-9 cross-link contract that requires a `#prefix-n` fragment when the depended-upon page is non-narrative. The GOV-15 "release blocked on uncoined obligations on a registered prefix" condition is currently tripped, and individual obligations cannot be cited by stable id.

## Solution approach

Add `QRY-N` REQ-ID anchors at each independently verifiable normative obligation on `query.md`, following GOV-1 *Canonical form* and *Dual-form layout* and GOV-22's progressive-coinage procedure, with numeric tails allocated per GOV-3. Add forward-links from the inbound cross-references on the sibling pages that cite `query.md` rules (`errors-and-results.md`, `hard-ceilings.md`, `pi-integration-contract.md`, `frontmatter.md`, `glossary.md`, `tool-calls.md`, `schema-subset.md`, and `spec.md`'s SM-8 aggregator) so each repoints to the specific `#qry-n` fragment it depends on.

## Solution constraints

- Preserve the existing bespoke HTML section anchors on `query.md` (`#tool-call-loop-bound`, `#worked-example-depth-6-forced-respond`, `#typed-queries-are-tool-loop-shaped`, `#forced-respond-turn-non-compliance`, and the pre-flight-token-nullability anchors); add the new dual-form `QRY-N` pairs alongside them, not in place of them, so existing inbound links keep resolving.

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel un-coined-prefix gap; resolve independently per page).
- T17 "slash-invocation.md carries no SLSH-N REQ-ID anchors" — same-cluster (parallel gap).
- T18 "`validation-issue-ordering` paragraph carries no ERR-N REQ-ID" — decision-overlap (QRY-21's `<ajv-summary>` placeholder links to `errors-and-results.md#validation-issue-ordering`; once that paragraph gains an `ERR-N`, the QRY-21 cross-link should be updated in the same edit).
- T32 "Top-level `Err` per-`kind` table — `validation` row collapses the two causes" — decision-overlap (the resolution of that finding will likely cite the new QRY-5 *empty-template short-circuit* anchor; co-ordinate the inbound-link update).
# T17 - slash-invocation.md carries no SLSH-N REQ-ID anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`governance.md`'s REQ-ID prefix table binds `slash-invocation.md` to the
`SLSH` prefix, but the page coins zero `SLSH-N` anchors. Multiple defining
obligation sites carry no co-located REQ-ID — the normative-templates
verbatim-emission rule, each row of the per-`kind` system-note table, the
chain-attribution suffix rule for `invoke_callee_error`, the no-params
overflow emission rule, and the user-visible streaming rules. Because none
of these sites is anchored, GOV-9's `#prefix-n` cross-link contract is
unsatisfiable for them: every consumer page reaches the obligations only
via heading-slug links, and individual per-`kind` table rows cannot be
cited at all by other pages or by conformance tests.

## Solution approach

Coin `SLSH-N` dual-form anchors at each defining obligation site on
`slash-invocation.md` per GOV-1 dual-form layout and GOV-22 progressive
coinage, allocating next-free integers (GOV-3) in source order — covering
the normative-templates verbatim sentence, each per-`kind` system-note
table row (one anchor per row, including the catch-all), the
chain-attribution suffix rule, the no-params overflow emission rule, and
the user-visible streaming rules. Then rewrite the inbound cross-references
from `binder.md`, `cancellation.md`, `errors-and-results.md`,
`frontmatter.md`, `pi-integration-contract.md`, and `glossary.md` to target
the specific `#slsh-n` fragment each consumes, per GOV-9.

## Solution constraints

- None.

## Relationships

- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (parallel GOV-22 deficit; same coinage procedure, independent edit).
- T16 "query.md missing QRY-N REQ-IDs" — same-cluster (parallel page-wide gap).
- T20 "Tool-call late-settlement discard paragraph needs three CNCL-N sub-anchors" — same-cluster (parallel per-sub-obligation coinage question; resolve the SLSH chain-attribution sub-obligations the same way).
- T32 "Top-level `Err` per-`kind` table — `validation` row collapses the two causes" — must-follow (splitting the `validation` row changes how many per-row `SLSH-N` anchors the table needs; resolve that row split first, or accept a second coinage pass).
# T18 - `validation-issue-ordering` paragraph carries no ERR-N REQ-ID

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `ValidationIssue` ordering paragraph in `errors-and-results.md` (anchored with the bespoke HTML id `validation-issue-ordering`) states an independent normative obligation: the canonical deterministic sort of `validation_errors` entries keyed on `(path, schema_keyword, message)` by Unicode code point. It is the load-bearing definition of `validation_errors[0]` and the binder failure-mode template's `<ajv-summary>` placeholder, and the reference point conformance tests compare against. It carries no `ERR-N` REQ-ID even though the `ERR` prefix is live on this page (`ERR-1` … `ERR-7`). Inbound cites from `binder.md`, `query.md`, and `implementation-notes.md` reach it via the bespoke fragment rather than a `#err-n` URL, which leaves GOV-9's cross-link contract unsatisfiable and the obligation un-coined under GOV-22.

## Solution approach

Coin the next free `ERR-N` dual-form anchor on the `validation-issue-ordering` paragraph in `errors-and-results.md`, retaining the legacy `validation-issue-ordering` fragment as an alias so existing inbound links keep resolving. Repoint the inbound `#validation-issue-ordering` cross-links in `binder.md`, `query.md`, and `implementation-notes.md` to the coined `#err-n` fragment.

## Solution constraints

- None.

## Relationships

- T19 "Mid-stream cancellation and No-rollback paragraphs lack ERR-N REQ-IDs" — co-resolve (shares the ERR-N integer namespace on the same page; the integer assigned here constrains the integers assigned there — co-edit in a single commit and assign in file-appearance order).
- T16 "query.md missing QRY-N REQ-IDs" — decision-overlap (QRY-21's `<ajv-summary>` link should be updated to this paragraph's new `ERR-N` in the same edit).
- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (corpus-wide GOV-22 progressive-coinage gap; resolves on its own page).
# T19 - Mid-stream cancellation and No-rollback paragraphs lack ERR-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/errors-and-results.md` states six independent normative obligations in bold-headed paragraphs — the five `Mid-stream cancellation, *` paragraphs (non-mutation of committed surfaces, no compensating injection, cancellation/`?`-propagation symmetry, respond-repair scope window, subagent-mode internal binding) and the **No rollback** paragraph. None carries an `ERR-N` REQ-ID, although the `ERR` prefix is registered and `ERR-1 … ERR-7` already exist on the same page as dual-form anchors. Only paragraphs 1 and 6 carry a navigation anchor (`mid-stream-cancellation-conversation-state`, `no-rollback`); the rest have none. Per GOV-22 these defining obligation sites must coin co-located REQ-ID anchors, and per GOV-9 sibling-page citations cannot resolve to a `#prefix-n` fragment until they do.

## Solution approach

Add a dual-form `<a id="err-N"></a> **ERR-N.**` anchor at each of the six bold-headed obligation sites in `errors-and-results.md`, allocating the next free integers under the already-registered `ERR` prefix per GOV-3. Preserve the existing `mid-stream-cancellation-conversation-state` and `no-rollback` HTML anchors on the same lines as legacy aliases so inbound links continue to resolve.

## Solution constraints

- The new IDs are post-evaluation obligations and MUST NOT be folded into the page's "seven pre-evaluation failures" / "the seven below" count assertions, which bind only to `ERR-1 … ERR-7`.

## Relationships

- T18 "`validation-issue-ordering` paragraph carries no ERR-N REQ-ID" — co-resolve (same page, same `ERR` prefix; the same commit that coins these IDs should also coin the ordering paragraph's `ERR-N` to keep `ERR`-prefix numbering contiguous).
- T21 "cancellation.md carries no CNCL-N REQ-IDs" — same-cluster (parallel GOV-22 / GOV-9 drain on the cancellation page).
- T20 "Tool-call late-settlement discard paragraph needs three CNCL-N sub-anchors" — same-cluster (per-sub-obligation anchor split; same coining pattern).
# T20 - Tool-call late-settlement discard paragraph needs three CNCL-N sub-anchors

**Kind:** traceability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The `cancellation.md` paragraph `**Race semantics — late-settlement discard at the tool-call checkpoint.**` states a single discard rule that decomposes into three independently-violable sub-obligations: (a) no rebind of the call site to the late value, (b) no second `Err` for the same invocation, and (c) no second `RuntimeEvent`. With only a paragraph-head anchor, a test, conformance fixture, or cross-page citation cannot pin one sub-obligation without dragging in the other two, and a single `CNCL-N` covering all three would conflate them into one ID — the same atomicity violation the `SM-3a`/`SM-3b` and `SM-7a`…`SM-7e` sub-letter splits avoid. The immediately-following `**Race semantics — swallowing-handler attachment on every abandonable Promise.**` paragraph already cites these rules in-text as `clause (a)` / `clause (b)`, but those references cannot be promoted to GOV-9 `#cncl-n` cross-links until per-sub-obligation anchors exist.

## Solution approach

Split the `**Race semantics — late-settlement discard at the tool-call checkpoint.**` paragraph in `cancellation.md` so sub-obligations (a) no-rebind, (b) no-second-`Err`, and (c) no-second-`RuntimeEvent` each carry their own dual-form anchor at the sub-obligation's source line, adding three consecutive `CNCL-N` REQ-IDs in source order (a)→(b)→(c) per GOV-1 / GOV-22 and the `SM-7a`…`SM-7e` sub-letter precedent. Rewrite the following `**Race semantics — swallowing-handler attachment...**` paragraph's in-text `clause (a)` / `clause (b)` references as GOV-9 `#cncl-n` cross-links to the two new `Err`-channel anchors. Repoint the `Post-cancel resolution` bullet in `tool-calls.md` and the `tool-execution-from-loom-code` restatement in `pi-integration-contract.md` to cite the three new anchors.

## Solution constraints

- Out of scope: the corpus-wide inbound `#cncl-n` cross-link repointing and the page-wide `CNCL-N` numbering base, both owned by T21; this finding adds only the three sub-obligation anchors and repoints the adjacent swallowing-handler paragraph plus the two sibling restatements named in Solution approach.

## Relationships

- T21 "cancellation.md carries no CNCL-N REQ-IDs" — must-follow (the page-wide CNCL-N coinage finding determines the integer base and the GOV-22 progressive-coinage pass; resolve the page-wide coinage first — this finding lands on its baseline and constrains that pass to allocate three IDs to this paragraph).
- T19 "Mid-stream cancellation and No-rollback paragraphs lack ERR-N REQ-IDs" — same-cluster (sibling rule on `errors-and-results.md` where multiple consecutive paragraphs each need their own REQ-ID; same atomicity-of-anchoring principle, resolved on a different page).
# T21 - cancellation.md carries no CNCL-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`cancellation.md` is registered in the per-page REQ-ID prefix table on `governance.md` with prefix `CNCL`, but the page carries zero `CNCL-N` anchor sites despite being dense with independently-violable normative obligations (signal source-of-truth, the per-mode forwarding paths, abort-reason propagation, the late-settlement discard sub-obligations, the swallowing-handler attachment rule, and the cancellation race rules). Because no obligation is coined, every inbound GOV-9 cross-link from depending pages (`binder.md`, `errors-and-results.md`, `pi-integration-contract.md`, `slash-invocation.md`, `hard-ceilings.md`, `diagnostics.md`, and the `spec.md` SM-7a / SM-7e aggregators) resolves only to a section-heading slug. This is exactly the permanently-unsatisfiable state GOV-22 was written to close.

## Solution approach

Coin `CNCL-N` dual-form anchors per GOV-1 / GOV-22 on `cancellation.md`, one per independently-violable normative obligation. Repoint every inbound cross-reference from the depending pages above from its `#section-slug` target to the new `#cncl-n` fragment.

## Solution constraints

- The `spec.md` SM-7a / SM-7e aggregator paragraphs are informative under GOV-12: repoint their cross-links only, coin no new REQ-IDs there.

## Relationships

- T20 "Tool-call late-settlement discard paragraph needs three CNCL-N sub-anchors" — must-precede (the three sub-anchors land inside this fix as `CNCL-15a` / `CNCL-15b` / `CNCL-15c`; resolve this page-wide coinage first so the sub-obligation finding lands on its baseline).
- T12 "binder.md — un-anchored normative obligations missing BNDR-N REQ-IDs" — same-cluster (identical traceability gap on `binder.md`; inbound links from `cancellation.md` to `binder.md`'s cancelled-binder failure-mode benefit from being repointed in lock-step).
- T31 "Per-cause caller surfaces table — Cancellation row contradicts cancellation.md surfacing" — decision-overlap (that finding's recommended pointer should target a CNCL-N anchor once these exist; today it targets the section heading).
# T22 - invocation.md carries no INV-N REQ-IDs

**Kind:** traceability
**Importance:** medium
**Score:** 35
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`invocation.md` is registered with REQ-ID prefix `INV` in the governance.md REQ-ID prefix table, but the page carries zero `INV-N` anchor sites despite being normatively dense — the symlink-resolution hardening seam, the named-argument-invocation `style` discriminator, the per-call-timeout open-struct seam, the invoke-chain depth cap, the cross-mode snapshot/restore protocol, static resolution, typed return, argument arity, cycle detection, and the invoke-cause `QueryError` partition, among others. Because no `INV-N` anchors exist, GOV-9's `#prefix-n` cross-link contract is unsatisfiable for every inbound dependency: spec.md's Session Model aggregator plus cancellation.md, diagnostics.md, errors-and-results.md, frontmatter.md, functions.md, future-considerations.md, hard-ceilings.md, implementation-notes.md, pi-integration-contract.md, and tool-calls.md currently link only to section-heading slugs or bespoke `#static-resolution` / `#typed-return` / `#argument-binding` / `#final-value-propagation` / `#cycle-detection` anchors that are not REQ-ID anchors under GOV-1. This is the residue GOV-22 was written to close.

## Solution approach

Add `INV-N` dual-form anchors to `invocation.md` per GOV-1 and GOV-22, one per independently-violable normative obligation on the page, and repoint each inbound consumer's cross-references to the new `#inv-n` fragments in the same commit. Keep the bespoke `#static-resolution`, `#typed-return`, `#argument-binding`, `#final-value-propagation`, and `#cycle-detection` anchors as co-located aliases. Repoint future-considerations.md's symlink-hardening *Anchored at:* link to the `INV-N` anchor owning the single-named-function MUST.

## Solution constraints

- Out of scope: the `calling loom` → `invoke parent` per-boundary-table naming on hard-ceilings.md and tool-calls.md, owned by T07 — repoint only the cross-link targets in those rows, do not edit the surrounding cell wording.

## Relationships

- T13 "discovery.md carries zero DISC-N REQ-IDs" — same-cluster (same GOV-22 pattern, different page).
- T14 "frontmatter.md carries no FRNT-N REQ-IDs" — same-cluster (`frontmatter.md` has multiple inbound-to-invocation cross-links; repointings are concurrent but the fixes are independent).
- T07 "Per-boundary tables use undefined `calling loom` instead of glossary `invoke parent`" — decision-overlap (the new INV-7 anchor on typed return is the natural cross-link target for those tables once the naming finding lands).
# T23 - Binder Determinism — reproducibility scope overreaches the provider contract

**Kind:** assumptions
**Importance:** high
**Score:** 100
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

binder.md's "Compact-transcript format (normative)" section justifies byte-level pinning of the transcript renderer as a "hard reproducibility contract," and the Determinism section states the same loom produces the same seed and the same binder decision "on every run and across processes." This framing rests on an unstated assumption that the provider maps `(prompt-bytes, temperature: 0, seed)` to byte-identical output — a property of the provider stack, not of loom, which controls only deterministic seed derivation and deterministic prompt-byte construction. The Provider seed-field mapping table (`#provider-seed-field-mapping` in pi-integration-contract.md) omits the `seed` field for `anthropic-messages` and `amazon-bedrock` — exactly the transports the binder-model guidance steers authors toward (Claude Haiku) — so loom's cross-run determinism guarantee never reaches those providers, and alias-resolved snapshots can drift between runs. The over-broad output-determinism premise weakens the load-bearing justification for the MUST-reproduce-exactly transcript rendering and invites conformance tests asserting cross-run output equality that flake.

## Solution approach

Rewrite the "Why the transcript bytes are pinned" paragraph in binder.md's "Compact-transcript format (normative)" section to scope the reproducibility claim to what loom controls — byte-identical binder input and a deterministic seed value — and to state that whether the provider maps that input to byte-identical output is provider-dependent, naming the seed-omitted transports per `#provider-seed-field-mapping` and the upstream-API caveat for seed-accepting transports. Add a pointer noting alias-resolved binder models (per `binder-model-parse-rule`) further depend on the resolved concrete model staying stable across runs. Rewrite the Determinism section's closing sentence ("The same loom therefore produces the same seed on every binder call across processes and runs") to scope it to the seed value rather than the binder's sampled output, cross-referencing the seed-field mapping table for the transport-level caveat.

## Solution constraints

- The MUST-reproduce-exactly status of the reference transcript renderings A–D must remain normative; the rewrite re-justifies it on input-reproducibility / cache-stability / audit grounds, it does not weaken the rule.

## Relationships

- T03 "Determinism section over-pins FNV-1a as the binder-seed algorithm" — same-cluster (same Determinism section; that finding's rationale clause should reference the narrowed reproducibility-contract wording produced here, but neither blocks the other — sequence the edits to avoid merge churn).
