# Spec document-set size-cap proposal

_Targets: hard cap 100 KB per file; recommended ≈ 30 KB per file._

## 1. Current state

Files over a threshold (KB):

| File | Size | Hard cap (100) | Recommended (30) |
|---|---|---|---|
| `spec_topics/pi-integration-contract.md` | 576 | **OVER** | over |
| `spec_topics/diagnostics.md` | 152 | **OVER** | over |
| `spec_topics/governance.md` | 97 | ok | over |
| `spec_topics/binder.md` | 62 | ok | over |
| `spec.md` | 48 | ok | over |
| `spec_topics/query.md` | 44 | ok | over |
| `spec_topics/errors-and-results.md` | 37 | ok | over |
| `spec_topics/discovery.md` | 35 | ok | over |
| `spec_topics/hard-ceilings.md` | 34 | ok | over |
| `spec_topics/future-considerations.md` | 34 | ok | over |
| `spec_topics/frontmatter.md` | 31 | ok | over |

Root cause is paragraph density, not section count. PIC carries its weight in run-on paragraphs: line 176 is **49.5 KB on one line**; lines 827 / 123 / 931 / 175 are 22 / 21 / 18 / 18 KB.

## 2. Referencing topology (what breaks on a split)

- Topic set + `spec.md`: full-path anchored links, e.g. `./spec_topics/pi-integration-contract.md#entry-capability-probe`.
- Review docs (`spec-review.md`, `spec-review-parked.md`, `spec-review-forensic-analysis.md`): reference by prose filename ("the Runtime event channel section of `pi-integration-contract.md`"), bare `#anchor`, and REQ-IDs (GOV-12, PIC-2, SM-7a, NOCEIL-3…). They contain few full markdown links (8 total).
- Splitting PIC + diagnostics touches **403 link occurrences** (320 + 83).
- All 94 PIC anchors and 7 diagnostics anchors are **globally unique** → a mechanical `anchor → new file` repoint is safe.

## 3. Strategy

Two levers:

- **A. Structural split (lossless).** Move whole sections to new pages; anchors travel unchanged; repoint inbound links.
- **B. Paragraph surgery (lossless) / condensation (content change).** Break run-on mega-paragraphs into multiple paragraphs/sub-sections. Required for the 30 KB goal because single paragraphs exceed it.

Reaching the **hard cap** needs only A. Reaching the **recommendation** needs A + B, and B's condensation portion is a normative-content edit that must go through review.

To keep the "PIC" / "Diagnostics" mental model and minimise prose-reference churn, split each oversized file into a **subdirectory with an index page**, mirroring the existing `spec.md` + `spec_topics/` pattern:

```
spec_topics/pi-integration-contract.md      ->  index/orientation page (forward-links children)
spec_topics/pi-integration-contract/*.md    ->  child pages (own the anchors)
spec_topics/diagnostics.md                  ->  index page
spec_topics/diagnostics/*.md                ->  child pages
```

The index page keeps the old filename, so prose references to "`pi-integration-contract.md`" and REQ-ID/bare-anchor references in the review docs still resolve at the page level; only **anchored** links whose target anchor moved to a child file are repointed.

## 4. Proposed split — `pi-integration-contract.md` (576 KB)

Measured region sizes (by current line ranges):

| Child page | Lines | KB | Anchors (sample) |
|---|---|---|---|
| `host-prerequisites.md` | 1–119 | 49 | pi-sdk-pin, typebox-single-instance-precondition, entry-capability-probe, step-0-* |
| `slash-handler-degradation.md` | 120–177 | **166** | unknown-reason-rule, patch-skew, substep-1-*, drain-state, active-invocation-registry, diagnostic-emission-isolation |
| `session-shutdown-and-tools.md` | 178–291 | 58 | session-shutdown-semantics, tool-registration-lifetime, no-extra-mediation, untyped-query, seams |
| `provider-mapping.md` | 292–351 | 9 | provider-error-mapping, transport-error-retryable, provider-seed-field-mapping |
| `subagent.md` | 352–399 | 20 | subagent-pre-spawn-model-guard, subagent-state-isolation-matrix, concurrent-invocation-isolation |
| `binder-inference.md` | 400–519 | 24 | pic-2, binder-inference-call, success-side-null-policy |
| `runtime-event-channel.md` | 520–588 | 19 | pic-1 |
| `host-interfaces.md` | 589–814 | 47 | sessioncontext-shape, extensioncontext-interface, schemavalidator, clock, filesystem, filewatcher |
| `sdk-capability-inventory.md` | 815–901 | **130** | sdk-capability-inventory, inventory-closure-audit, sdk-cap-* |
| `version-bump.md` | 902–935 | **66** | pi-version-bump-procedure, bump-step-* |

Hard-cap compliance: three children remain over 100 KB after a pure split (`slash-handler-degradation` 166, `sdk-capability-inventory` 130, `version-bump` 66 — the last is under but its line 931 = 18 KB). These require a second-level split or paragraph surgery:

- `slash-handler-degradation.md` → split at the drain-state / emission-isolation boundary into 2–3 pages; **break the 49.5 KB line-176 paragraph** into its constituent obligations (it enumerates multiple substeps already tagged with anchors substep-1-* / substep-2-*).
- `sdk-capability-inventory.md` → split "capability inventory (items 1–7)" from "inventory-closure audit"; break the 22 KB and 19 KB audit paragraphs.
- `version-bump.md` → break the 18 KB step-2 paragraph into per-step sub-sections.

After A + paragraph surgery, every PIC child lands ≤ ~30–50 KB; condensation (lever B) is then optional to pull the 40–50 KB ones under 30.

## 5. Proposed split — `diagnostics.md` (152 KB)

| Child page | Lines | KB |
|---|---|---|
| index (intro + code-registry rules) | 1–75 | 27 |
| `placeholder-rendering.md` | 76–271 | 31 |
| `code-registry-parse.md` (`loom/parse/*`) | 272–367 | 28 |
| `code-registry-load.md` (`loom/load/*`) | 368–418 | 26 |
| `code-registry-runtime-host.md` (`loom/runtime/*`, `loom/host/*`) | 419–452 | 43 |

All children land near the 30 KB recommendation with pure splitting; the last needs a minor paragraph break or a further parse/runtime split.

## 6. The nine over-recommendation files (under hard cap)

These need no action for the hard cap. For the recommendation, each has clean `##`/`###` section structure and splits along existing boundaries without paragraph surgery (target ~2 pages each, subdirectory + index pattern). Lowest-churn order: governance, binder, query, then spec.md (spec.md is mostly orientation prose forward-linking topics; condensing its run-on orientation paragraphs is the cleanest win and reduces it well under 30 KB without a split).

## 7. Reference-fixing plan

1. Generate a `anchor → new file` map per split file (94 PIC + 7 diagnostics anchors; all unique).
2. Mechanical repoint across `docs/**/*.md`: for each moved anchor, rewrite `OLDFILE.md#anchor` → `NEWDIR/CHILD.md#anchor` (and relative-path-correct `../` prefixes for links originating inside the new subdirectory).
3. Leave the index page at the old filename so:
   - prose references ("…in `pi-integration-contract.md`") still resolve;
   - bare `#anchor` and REQ-ID references in review docs are unaffected (they don't encode a file).
4. Review docs (`spec-review*.md`): audit the 8 full links + any prose filename mentions that now point at a child's content; update the prose to name the child page. Bare anchors / REQ-IDs need no change.
5. Validate: a link-checker pass over `docs/**` asserting every `*.md#anchor` target exists; assert no file > 100 KB; report files > 30 KB.

## 8. Decision points for the user

- **Scope:** (a) hard cap only — split PIC + diagnostics, leave the nine; or (b) hard cap + recommendation — also split/condense all nine.
- **Lever B:** is condensation of normative prose permitted, or restrict to lossless structural split + paragraph surgery only (some files then settle at 30–50 KB, above the recommendation but well under the cap)?
- **Layout:** subdirectory-per-large-topic + index page (recommended, low reference churn) vs flat sibling files in `spec_topics/` (higher prose-reference churn).
