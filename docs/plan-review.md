---
list: active
corpus: plan
order: by-importance-then-location
entries:
  - { id: F-0197, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "\"`CIO` / `HC3` / `NOCEIL` / `CEIL` closure rationale\" and the Numbered REQ-IDs table", title: "HC3 and NOCEIL closing-leaf mappings live only in rationale prose, not in the coverage-matrix tables" }
  - { id: F-0190, tier: medium, file: docs/plan_topics/conventions.md, anchor: "REQ-ID discipline, *Transitive-completeness plan-maintenance* clause", title: "`H5d` \"stay in lockstep\" overstates a per-cell at-least-one gate" }
  - { id: F-0199, tier: medium, file: docs/plan_topics/conventions.md, anchor: "REQ-ID discipline", title: "`<new>` placeholder coverage-matrix rows satisfy the un-anchored-MUST gate without a real closing leaf" }
  - { id: F-0192, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Leaf format, **Spec** field bullet", title: "Spec-field closure rule uses the undefined terms \"normative cross-link\" / \"narrative cross-link\"" }
  - { id: F-0188, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Leaf format §Deps / Per-phase TDD ritual", title: "\"Deps satisfied\" build-order step names no machine-checkable pickability predicate" }
  - { id: F-0193, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Cross-cutting rules → *Sequential by default*", title: "Sequential-by-default allow-list representation is undefined at its own rule site" }
  - { id: F-0208, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Cross-cutting rules scope paragraph; release-time residue inspection checklist", title: "Gated-tree completeness claim rests on an unverified entry-shim purity property" }
  - { id: F-0205, tier: medium, file: docs/plan_topics/conventions.md, anchor: "*Sequential by default* enforcement posture; release-time residue-inspection item 3; *Per-phase TDD ritual* self-review", title: "`V8*` FileSystem seam-adapter exclusion names no module-path boundary" }
  - { id: F-0280, tier: medium, file: docs/plan_topics/V9k-extension-bootstrap-failures.md, anchor: "whole leaf", title: "V9k bundles five independent bootstrap-failure surfaces in one leaf" }
  - { id: F-0278, tier: medium, file: docs/plan_topics/V9i-subagent-isolation.md, anchor: "full leaf", title: "V9i bundles three separable concerns into one leaf" }
  - { id: F-0267, tier: medium, file: docs/plan_topics/V9g-session-shutdown.md, anchor: Deps, title: "Consumers of V9a's single-source pinned-constants block under-declare the read: V9g/V9h/V18c omit the direct V9a Deps edge, and V18c's SHUTDOWN_AWAIT_CAP_MS literal-read assertion is backed by no test" }
  - { id: F-0275, tier: medium, file: docs/plan_topics/V9f-tool-registration-lifetime.md, anchor: Adds, title: "One window concept named three ways across V9c, V9c-T, and V9f" }
  - { id: F-0276, tier: medium, file: docs/plan_topics/V9f-T-tool-registration-lifetime.md, anchor: Tests, title: "`ToolDefinition.label` derivation is asserted only in the V9f implementation leaf, never red-first in V9f-T and never gated by Ships when" }
  - { id: F-0273, tier: medium, file: docs/plan_topics/V9c-conversation-drive.md, anchor: "implementation leaf body", title: "V9c bundles three concern clusters — query-drive, active-set gating, and transport-error mapping — in one leaf pair" }
  - { id: F-0272, tier: medium, file: docs/plan_topics/V9c-conversation-drive.md, anchor: "Tests, `stopReason: \"error\"` error-detection bullet", title: "Prompt-mode `TransportError.provider` cites V9j's classifier, which owns no prompt-mode session-model read path" }
  - { id: F-0268, tier: medium, file: docs/plan_topics/V9b-registration-reload-wiring.md, anchor: "Adds / Tests / Ships when", title: "V9b's matcher witness asserts a reconciliation only V11a can exercise" }
  - { id: F-0270, tier: medium, file: docs/plan_topics/V9b-registration-reload-wiring.md, anchor: Adds, title: "The \"pending-registration list\" is named three different ways across V9b, V9k, and the coverage matrix" }
  - { id: F-0266, tier: medium, file: docs/plan_topics/V9a-capability-probe.md, anchor: Adds, title: "V9a Adds prescribes source-code layout (\"single physical home\" / \"lives alongside\") instead of the export/import obligations" }
  - { id: F-0264, tier: medium, file: docs/plan_topics/V7c-placeholder-rendering.md, anchor: "Tests block", title: "Category-8 test bullet conflates the byte-identical surround with a free \"tail\" and omits the assertion shape" }
  - { id: F-0260, tier: medium, file: docs/plan_topics/V7a-diagnostics-primitive.md, anchor: "leaf body", title: "`V7a` bundles the diagnostics data primitive with the `loom-system-note` delivery channel" }
  - { id: F-0226, tier: medium, file: docs/plan_topics/V7a-diagnostics-primitive.md, anchor: Adds, title: "V1a→V7a diagnostic-emission seam is unnamed on both ends" }
  - { id: F-0256, tier: medium, file: docs/plan_topics/V6c-tools-set.md, anchor: "Tests / Ships when", title: "Three `tools:`-resolution load codes have no asserting plan leaf" }
  - { id: F-0252, tier: medium, file: docs/plan_topics/V5d-subset-lowering.md, anchor: "Adds / Tests / Ships when", title: "V5d reject gate: allowlist-vs-denylist semantics unstated" }
  - { id: F-0249, tier: medium, file: docs/plan_topics/V4e-pre-evaluation-failures.md, anchor: "Deps / Adds", title: "V4e wraps V5e's ceiling-#4 depth breach for ERR-16 but declares no dependency on the depth-walk producer" }
  - { id: F-0245, tier: medium, file: docs/plan_topics/V4c-terminal-outcomes.md, anchor: "`V4c` leaf body", title: "`V4c` bundles two independently-shippable units: the ERR-8…ERR-12 trichotomy and the ERR-13 no-rollback proof" }
  - { id: F-0246, tier: medium, file: docs/plan_topics/V4c-terminal-outcomes.md, anchor: "`Tests.`", title: "Duplicate `ERR-13` REQ-ID across two `V4c` / `V4c-T` test bullets" }
  - { id: F-0244, tier: medium, file: docs/plan_topics/V4a-T-match-result.md, anchor: "`loom/runtime/match-error` Tests bullet", title: "`V4a-T`'s `loom/runtime/match-error` assertion scope is left undetermined by the \"co-asserted here\" note" }
---
<!-- Generated view. Entries are ordered by importance (highest-importance last, addressed first by the bottom-up picker), then by location, and carry a renderer-owned projection (tier/file/anchor/title) of each finding; edit only membership: which ids appear and their defer_reason/note. Substance lives in docs/findings/F-NNNN.md. -->
