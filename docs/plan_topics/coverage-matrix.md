# Spec coverage matrix

Every executable spec REQ-ID is mapped here to the **implementation** leaf (`<id>`) that closes it (its green tests are the closure evidence; the paired `<id>-T` tests task is not listed separately). At the loom 1.0 release gate, any executable REQ-ID without a mapping fails CI per [`conventions.md`](./conventions.md) *REQ-ID discipline* and the [`H5a`](./H5a-closing-gate-automation.md) closing-gate automation; the non-gating→gating flip to this live-corpus footing is owned by the terminal [`H6a`](./H6a-live-corpus-activation.md) release-gate activation leaf.

Use the REQ-ID prefix table in [`../spec_topics/governance.md`](../spec_topics/governance.md) to enumerate the REQ-IDs to cover.

## Numbered REQ-IDs (runtime obligations)

`X-n … X-m` denotes the inclusive contiguous range — every REQ-ID from `X-n` through `X-m`, both endpoints included (e.g. `TYPE-1 … TYPE-10` covers `TYPE-1, TYPE-2, …, TYPE-10`). The reading presumes the prefix's spec numbering has no holes between the endpoints; a hole inside a `…` range surfaces as an [`H5a`](./H5a-closing-gate-automation.md) per-prefix-numbering-hole gate failure, not a silent skip.

| REQ-ID | Closing leaf(s) |
|---|---|
| TYPE-1 … TYPE-10 | `V2b` |
| CTRL-1 | `V3c` |
| ERR-1 … ERR-7 | `V4e` |
| ERR-8 … ERR-13 | `V4c` |
| ERR-14 | `V4d` |
| ERR-15 | `V4d` |
| ERR-16 | `V4e` |
| ERR-17 | `V4d`, `V13d` |
| ERR-18 | `V4a` |
| ERR-19 | `V4d`, `V13c` |
| BNDR-1, BNDR-2, BNDR-3 | `V11c` |
| BNDR-4, BNDR-5 | `V2d` |
| BNDR-6 | `V11d` |
| BNDR-7, BNDR-8, BNDR-9 | `V11b` |
| DISC-1, DISC-2, DISC-3 | `V10a` |
| DISC-4 (discovery/collision detection) | `V10a` |
| DISC-4 (superseded-entry dispatch) | `V9b` |
| DISC-5, DISC-6 | `V10b` |
| DISC-7 | `V10c` |
| CIO-1 | `V16a`, `V4e`, `V11f` |
| CIO-2, CIO-3, CIO-4 | `V16a` |
| CIO-5 | `V16a`, `H7a` |
| CIO-6 | `V16a` |
| SLSH-1, SLSH-2 | `V12a` |
| SLSH-3, SLSH-4, SLSH-5 | `V12b` |
| PIC-1 | `V9d` |
| PIC-2 | `V9c` |
| PIC-3, PIC-4, PIC-5, PIC-6 | `V9a` |
| PIC-7 | `V9g` |
| PIC-8, PIC-19 | `V9f` |
| PIC-9, PIC-22 | `V9i` |
| PIC-10, PIC-11 | `V8a` |
| PIC-12, PIC-13, PIC-14, PIC-16, PIC-20 | `V8b` |
| PIC-15 | `V18a` |
| PIC-17, PIC-18 | `V9c` |
| PIC-21 | `V7a` |
| INV-1, INV-2, INV-3 | `V15a` |
| INV-4 | `V15b` |
| DIAG-1 | `V7a` |
| DIAG-2, DIAG-3 | `V7b` |
| DIAG-4 | `V7b`, `V7c` |
| CNCL-1, CNCL-2, CNCL-3 | `V17a` |
| CNCL-4 | `V17a`, `V9g` |
| CNCL-5, CNCL-6 | `V17a` |
| FRNT-1 | `V6e` |
| IMP-1 | `V15c` |

## Code-keyed obligation areas (no numbered REQ-IDs)

Several non-narrative pages own their obligations through `loom/parse/*`, `loom/load/*`, and `loom/runtime/*` diagnostic codes rather than numbered `PREFIX-N` REQ-IDs (a standing spec residue under [`governance.md` GOV-22](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-22)). Their coverage is closed by the leaf whose green tests assert the listed codes against the diagnostics registry per [`conventions.md`](./conventions.md) *Diagnostic message anchors*.

The same table also enumerates the third closing-gate surface defined in [`conventions.md`](./conventions.md) *REQ-ID discipline*: every normative MUST/MUST-NOT on a non-narrative `spec_topics/**` page that carries no numbered `PREFIX-N` REQ-ID and no `loom/...` registry code — the un-anchored-obligation residue under [`governance.md` GOV-22](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-22). Each such MUST is one rule-driven row here with a named closing leaf (a `<new>` placeholder where the obligation is currently uncovered and its closing leaf is owned by the relevant spec-coverage finding), not a one-off patch; the [`H5a`](./H5a-closing-gate-automation.md) closing gate fails on any such MUST absent from this table with a closing leaf, on the live-corpus footing that binds at the loom 1.0 release gate once the terminal [`H6a`](./H6a-live-corpus-activation.md) activation leaf lands.


| Spec area (prefix) | Closing leaf(s) |
|---|---|
| `lexical.md` (LEX), `grammar.md` (GRAM) | `V1a`, `V1b`, `V2a` |
| `runtime-value-model.md` (RVM) | `V2c` |
| `expressions.md` (EXPR) | `V3a` |
| `bindings.md` (BNDS) | `V3b` |
| `functions.md` (FN), `return.md` (RET) | `V3d` |
| `schemas.md` (SCHM) | `V5a`, `V5b` |
| `descriptions.md` (DESC) | `V5c` |
| `schema-subset.md` (SUBS) | `V5d`, `V5e` |
| `frontmatter/frontmatter-fields-a.md`, `frontmatter-fields-b-and-templates.md` (FRNT) | `V6a`, `V6b`, `V6c`, `V6d`, `V6e` |
| `query/` (QRY) | `V13a`, `V13b`, `V13c`, `V13d` |
| `tool-calls.md` (TOOL) | `V14a`, `V13c` |
| `invocation.md` (INV) — the six un-anchored `invoke` parse/load diagnostic codes (`loom/parse/invoke-arg-type-mismatch`, `loom/parse/invoke-return-type-mismatch`, `loom/parse/invoke-arity-too-few`, `loom/parse/invoke-arity-too-many`, `loom/parse/invoke-non-loom-extension`, `loom/load/callee-has-errors`) (un-anchored; GOV-22 residue) | `V15a` |
| `pi-integration-contract/extension-bootstrap-and-per-loom.md` §Extension-bootstrap SDK failures — the five per-call-type `loom/load/extension-bootstrap-failed` granularity surfaces (renderer-failure degrade-and-proceed; per-loom `registerCommand` drop; whole-extension `registerFlag`/`pi.on` abort; `session_start`-time `getCommands()` read-failure pending-list drop with no drain-state write) (un-anchored; GOV-22 residue) | `V9k` |
| `pi-integration-contract/conversation-drive.md` — *No additional access channels* denial-surface MUST (un-anchored; GOV-22 residue) | `V14a` |
| `pi-integration-contract/version-bump-triggers.md` — runtime-evidence acceptance-gate MUST (output (c); a red runtime-evidence run MUST NOT be merged at the candidate pin) (un-anchored; GOV-22 residue) | `V18d` |
| `pi-integration-contract/audit-resolution.md`, `audit-recognised-shapes.md`, `audit-target-categories.md`, `audit-failures.md`, `audit-wire-and-canary.md`, and the audit-procedure MUSTs on `inventory-audit-intro.md` not closed by `V18a`'s `PIC-15` — the non-exemptible family-(4) out-of-scope-import/access discriminator, the fail-closed non-empty canary, the `audit/<class>/<family>/<symptom>` record grammar, and the `// allow-pi-surface:` marker scope (un-anchored; GOV-22 residue) | `V18b` |
| `pi-integration-contract/host-prerequisites.md` §`pi-sdk-pin` — `typebox` `"*"` MUST NOT be collapsed into the four-entry tilde-pinned `peerDependencies` group (un-anchored; GOV-22 residue) | `H1a` |
| `pi-integration-contract/drain-state-contract.md` — `LoomRegistry.readDrainState` closed three-arm dispatch (dispatch / shutting-down note / degraded-needs-reload note), the no-fourth-arm / no-alternative-gating-field prohibition, and the `readDrainState` read-failure fail-safe MUSTs (un-anchored; GOV-22 residue) | `V9b` |
| `pi-integration-contract/conversation-drive.md` §`untyped-query-ok-extraction` — untyped-query trailing-turn `Ok(string)` extraction MUSTs (final-turn boundary, assistant-text concatenation, downstream of the cancel and `stopReason: "error"` short-circuits) (un-anchored; GOV-22 residue) | `V9c` |
| `pi-integration-contract/active-invocation-registry.md` — insertion-order iteration and `invocationId`-from-`IdSource.newInvocationId()` MUSTs (un-anchored; GOV-22 residue) | `V9e` |
| `pi-integration-contract/session-only-degraded-state.md` — the Recovery-path prohibition set (no un-drain / no re-subscribe / no poll / no other self-recovery path until `/reload`), the state-independent drain-state tag write, the *Predicate split* diagnostic-emission-vs-tag-transition rule, the *Seam-minimality* `MUST NOT introduce any handler-scoped state seam` prohibition, and the *Inline triplet is normative* clause (un-anchored; GOV-22 residue) | `V9h` |
| `pi-integration-contract/unknown-reason-rule.md` — the three sub-anchored obligations (`#unknown-reason-rule-membership-check`, `#unknown-reason-rule-constant-source`, `#unknown-reason-rule-handler-trycatch`) and the anchor-stable contract-surface MUSTs (the two diagnostic codes, the closed-set literal, and the three `details.failure` discriminator literals); the rule's own carve-out excludes its in-paragraph code/literal restatements from anchor-stable scope (un-anchored; GOV-22 residue) | `V9h` |
| `pi-integration-contract/patch-skew-degradation.md` §`session_shutdown` sub-step 3 — the aggregate `await Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))` settle-all over every in-flight entry's per-entry `disposeBarrier`, bounded by `SHUTDOWN_AWAIT_CAP_MS` (un-anchored; GOV-22 residue) | `V9g` |
| `pi-integration-contract/binder-inference.md` §Binder inference call — the `complete()` symbol/signature/structured-output surface re-validation MUST (un-anchored; GOV-22 residue) | `V9j` |
| `pi-integration-contract/provider-error-mapping.md` §Provider error mapping / §Provider seed-field mapping — the provider-error→`QueryError` mapping-table, `TransportError.retryable` population, context-overflow token extraction, stop-reason classification, and provider seed-field-mapping MUSTs (un-anchored; GOV-22 residue) | `V9j` |
| `frontmatter/frontmatter-fields-a.md` §`model` — a present-but-unresolvable `model:` value fires the `loom/load/model-unresolved` load-time error and the loom is not registered (code-keyed; no numbered REQ-ID) | `V6a` |
| `binder/binder-model-and-context.md` §Binder model + §Strict-capability requirement — the three load-time diagnostic codes `loom/load/binder-model-unresolved`, `loom/load/binder-model-not-strict-capable`, `loom/load/binder-model-strict-capability-unknown`; the `#binder-model-hot-reload` recovery note is informational (`loom-system-note`, no `loom/load/*` code) (un-anchored; GOV-22 residue) | `V11a` |
| `binder/defaulting-system-note-echo.md` §System-note rendering — the five line-discipline MUSTs (rule 1 single-line collapse/trim against the reference rendering, rule 2 120-code-point truncation-with-`…`, rule 3 prefix/suffix demarcation grammar, rule 4 empty-model-content→malformed-envelope classification, rule 5 `ambiguous.candidates` non-surfacing) (un-anchored; GOV-22 residue) | `V11e` |
| `binder/determinism-cancellation-failure.md` §Determinism — `temperature: 0` + FNV-1a seed-derivation MUSTs (un-anchored; GOV-22 residue) | `V11e` |
| `implementation-notes.md` (IMPL) §Runtime *Static-resolution load pass* — the transitive static-resolution parse-cache walk and the in-process hot-reload re-walk (drop of the changed file plus every transitive `.warp` importer on the `LoomRegistry` swap) → `V15a`, `V9b`; the cross-file `(file, line, col)` diagnostic aggregation order → `V7a` (un-anchored; GOV-22 residue). Pure back-references closed on their owning leaves: multi-error batching → `V7a` (PIC-21 / DIAG-1), ambient-access ban → `H3a`, runtime dependency declarations (`semver`, `chokidar`, `yaml`) → `H1a` | `V15a`, `V9b`, `V7a` |
| `binder/binder-bypass-and-envelope.md` §"System-prompt structure (normative)" — the eight structural items (Loom-identity line, Description line, Argument-hint line, Parameters block, User-arguments line, Session-context block, Envelope-kinds enumeration, No-invent-defaults instruction), the *Type display* reference renderings, the *Default-literal rendering* rule, and the *Parameter-line reference renderings* table (un-anchored; GOV-22 residue) | `V11d` |

## Governance REQ-IDs (GOV-*) — corpus governance, not runtime obligations

GOV-1, GOV-3, GOV-5 … GOV-9, GOV-15 … GOV-31 govern the **spec corpus itself** (REQ-ID anchoring, retirement, cross-link form, aggregator lock-step) per [`../spec_topics/governance.md`](../spec_topics/governance.md). They are arm-(b) corpus invariants enforced by review and out-of-corpus tooling, not behaviours the loom runtime implements, so they map to no runtime leaf. The mechanizable slice that touches this plan — the REQ-ID / diagnostic-code / coverage-matrix closing gate — is operationalised by [`H5a`](./H5a-closing-gate-automation.md). `CEIL` is a registered prefix that currently anchors no live REQ-ID; its cross-ceiling content is carried by the `CIO` IDs and the `HC3`/`NOCEIL` inline labels. `CIO-2 … CIO-4` and `CIO-6` close in [`V16a`](./V16a-ceiling-order-masked.md); `CIO-1`'s cross-ceiling precedence *decision* is witnessed at [`V16a`](./V16a-ceiling-order-masked.md)'s seam while its temporal slash-load-before-runtime placement is co-witnessed by the load-time consults in [`V4e`](./V4e-pre-evaluation-failures.md) / [`V11f`](./V11f-binder-retry-taxonomy.md); `CIO-5`'s seam-local single-surface arbitration closes at [`V16a`](./V16a-ceiling-order-masked.md) while its cross-site never-interleaves property is co-witnessed by [`H7a`](./H7a-integration-acceptance.md)'s co-occurring-breach integration run; and `HC3-a … HC3-e` close in [`V11f`](./V11f-binder-retry-taxonomy.md). The `NOCEIL-1 … NOCEIL-4` non-existence claims have no single closing leaf: their observable seams are distributed (NOCEIL-1 → [`V6a`](./V6a-frontmatter-contract.md)'s `loom/parse/timeout-field-rejected`; NOCEIL-2 → [`V4d`](./V4d-queryerror-variants.md)'s `ContextOverflowError` / ERR-14/15/17; NOCEIL-3 → [`V4b`](./V4b-runtime-panics.md)'s `loom/runtime/internal-error` carve-out; NOCEIL-4 → [`V15b`](./V15b-invoke-depth-cycle.md)'s `INV-4` invoke-depth bound), and their cross-cutting closure is the spec's four-axis Audit methodology in [`../spec_topics/hard-ceilings.md`](../spec_topics/hard-ceilings.md) (a GOV-15 release-time corpus-review obligation, not a runtime leaf).
