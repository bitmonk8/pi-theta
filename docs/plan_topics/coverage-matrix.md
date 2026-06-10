# Spec coverage matrix

Every executable spec REQ-ID is mapped here to the **implementation** leaf (`<id>`) that closes it (its green tests are the closure evidence; the paired `<id>-T` tests task is not listed separately). At the loom 1.0 release gate, any executable REQ-ID without a mapping fails CI per [`conventions.md`](./conventions.md) *REQ-ID discipline* and the [`H5a`](./H5a-closing-gate-automation.md) closing-gate automation; the non-gating→gating flip to this live-corpus footing is owned by the terminal [`H6a`](./H6a-live-corpus-activation.md) release-gate activation leaf.

Use the REQ-ID prefix table in [`../spec_topics/governance.md`](../spec_topics/governance.md) to enumerate the REQ-IDs to cover.

## Numbered REQ-IDs (runtime obligations)

| REQ-ID | Closing leaf(s) |
|---|---|
| TYPE-1 … TYPE-10 | `V2b` |
| CTRL-1 | `V3c` |
| ERR-1 … ERR-7 | `V4e` |
| ERR-8 … ERR-13 | `V4c` |
| ERR-14 | `V4d` |
| ERR-15 | `V4d` |
| ERR-16 | `V4e` |
| ERR-17 | `V4d` |
| ERR-18 | `V4a` |
| ERR-19 | `V4d`, `V13c` |
| BNDR-1, BNDR-2, BNDR-3 | `V11c` |
| BNDR-4, BNDR-5 | `V2d` |
| BNDR-6 | `V11d` |
| BNDR-7, BNDR-8, BNDR-9 | `V11b` |
| DISC-1, DISC-2, DISC-3, DISC-4 | `V10a` |
| DISC-5, DISC-6 | `V10b` |
| DISC-7 | `V10c` |
| CIO-1 … CIO-6 | `V16a` |
| SLSH-1, SLSH-2 | `V12a` |
| SLSH-3, SLSH-4, SLSH-5 | `V12b` |
| PIC-1 | `V9d` |
| PIC-2 | `V9c` |
| PIC-3, PIC-4, PIC-5, PIC-6 | `V9a` |
| PIC-7 | `V9g` |
| PIC-8, PIC-19 | `V9f` |
| PIC-9 | `V9i` |
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
| FRNT-1 | `V6e` |
| IMP-1 | `V15c` |

## Code-keyed obligation areas (no numbered REQ-IDs)

Several non-narrative pages own their obligations through `loom/parse/*`, `loom/load/*`, and `loom/runtime/*` diagnostic codes rather than numbered `PREFIX-N` REQ-IDs (a standing spec residue under [`governance.md` GOV-22](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-22)). Their coverage is closed by the leaf whose green tests assert the listed codes against the diagnostics registry per [`conventions.md`](./conventions.md) *Diagnostic message anchors*.

The same table also enumerates the third closing-gate surface defined in [`conventions.md`](./conventions.md) *REQ-ID discipline*: every normative MUST/MUST-NOT on a non-narrative `spec_topics/**` page that carries no numbered `PREFIX-N` REQ-ID and no `loom/...` registry code and is not a named cross-leaf seam — the un-anchored-obligation residue under [`governance.md` GOV-22](../spec_topics/governance/req-id-prefix-table-active-b.md#gov-22). Each such MUST is one rule-driven row here with a named closing leaf (a `<new>` placeholder where the obligation is currently uncovered and its closing leaf is owned by the relevant spec-coverage finding), not a one-off patch; the [`H5a`](./H5a-closing-gate-automation.md) closing gate fails on any such MUST absent from this table with a closing leaf, on the live-corpus footing that binds at the loom 1.0 release gate once the terminal [`H6a`](./H6a-live-corpus-activation.md) activation leaf lands.


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
| `query/` (QRY) | `V13a`, `V13b`, `V13c`, `V13d` |
| `tool-calls.md` (TOOL) | `V14a` |
| `pi-integration-contract/conversation-drive.md` — *No additional access channels* denial-surface MUST (un-anchored; GOV-22 residue) | `V14a` |

## Governance REQ-IDs (GOV-*) — corpus governance, not runtime obligations

GOV-1, GOV-3, GOV-5 … GOV-9, GOV-15 … GOV-31 govern the **spec corpus itself** (REQ-ID anchoring, retirement, cross-link form, aggregator lock-step) per [`../spec_topics/governance.md`](../spec_topics/governance.md). They are arm-(b) corpus invariants enforced by review and out-of-corpus tooling, not behaviours the loom runtime implements, so they map to no runtime leaf. The mechanizable slice that touches this plan — the REQ-ID / diagnostic-code / coverage-matrix closing gate — is operationalised by [`H5a`](./H5a-closing-gate-automation.md). `CEIL` is a registered prefix that currently anchors no live REQ-ID; its cross-ceiling content is carried by the `CIO` IDs and the `HC3`/`NOCEIL` inline labels, all closed by `V16a` and `V11f`.
