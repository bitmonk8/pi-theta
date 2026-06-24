---
list: active
corpus: plan
order: by-importance-then-location
entries:
  - { id: F-1319, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "§Code-keyed obligation areas (no numbered REQ-IDs) heading + intro", title: "`Code-keyed obligation areas` heading names only one of the two obligation kinds the table holds" }
  - { id: F-1318, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "§Code-keyed obligation areas (no numbered REQ-IDs)", title: "`runtime-event-channel.md` un-anchored MUSTs have no code-keyed coverage-matrix row (H5e reddens at H6a)" }
  - { id: F-1315, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "Code-keyed obligation areas table", title: "`determinism-cancellation-failure.md §Failure-mode templates` (non-cancelled classes) has no coverage-matrix row" }
  - { id: F-1242, tier: medium, file: docs/plan_topics/V9n-transport-error-mapping.md, anchor: Adds, title: "V9n Adds misattributes the prompt-mode `provider` source to V9j, contradicting the leaf's own tests" }
  - { id: F-1327, tier: medium, file: docs/plan_topics/V9i-subagent-isolation.md, anchor: "Adds, Deps", title: "V9i mislabels the pre-spawn model guard as a \"binder-model guard\" and points its model-resolution dependency at the binder" }
  - { id: F-1249, tier: medium, file: docs/plan_topics/V2e-wire-name-translation.md, anchor: "Tests / Ships when", title: "Outbound wire-name translation is claimed but never asserted" }
  - { id: F-1323, tier: medium, file: docs/plan_topics/V15i-T-export-visibility.md, anchor: Tests, title: "V15i / V15i-T Tests bullets cite no anchor token (plain-prose labels) instead of the `cka` citation form" }
  - { id: F-1258, tier: medium, file: docs/plan_topics/V14a-T-tool-calls.md, anchor: "Tests, Deps", title: "V14a-T omits the ERR-13 delegated-witness test and the V4f dependency carried by its paired impl leaf" }
  - { id: F-1322, tier: medium, file: docs/plan_topics/V13g-query-discard-observability.md, anchor: Tests, title: "V13g / V13g-T fold the parse-time and runtime discard obligations into one Tests bullet" }
  - { id: F-1255, tier: medium, file: docs/plan_topics/V13c-T-query-tool-loop.md, anchor: "Tests, Deps", title: "V13c-T omits the ERR-13 delegated-witness bullet and `V4f` Dep its impl partner carries" }
  - { id: F-1321, tier: medium, file: docs/plan_topics/V11f-T-binder-retry-taxonomy.md, anchor: "Tests field, §Failure-mode templates bullet", title: "V11f / V11f-T §Failure-mode templates Tests bullet carries no citable obligation token" }
  - { id: F-1256, tier: medium, file: docs/plan_topics/V11c-bypass-envelope.md, anchor: "Adds, Tests", title: "Bypass-path LLM-skip semantics live only in a non-asserting Tests bullet, not in `Adds`" }
  - { id: F-1312, tier: medium, file: docs/plan_topics/H6a-live-corpus-activation.md, anchor: "Deps field and its rationale parenthetical", title: "H5d transitive-completeness arm is never forced to land before the release gate activates" }
  - { id: F-1240, tier: medium, file: docs/plan_topics/H4a-factory-shell-and-harness.md, anchor: "Adds, Tests, Ships when", title: "H4a self-check asserts cancel-forward and cancellation-propagation axes with no enumerated cancel-driving affordance" }
  - { id: F-1237, tier: medium, file: docs/plan_topics/H4a-factory-shell-and-harness.md, anchor: Adds, title: "Harness in-memory fixture-supply mechanism has no declared injection point into discovery" }
  - { id: F-1253, tier: high, file: docs/plan_topics/leaf-template.md, anchor: "`**Spec.**` field description", title: "Leaf template's `Spec.` closure rule omits transitivity" }
  - { id: F-1248, tier: high, file: docs/plan_topics/coverage-matrix.md, anchor: "Numbered REQ-IDs (runtime obligations) table", title: "SUBS-1 union-lowering rule is an unmapped executable REQ-ID with no citing test" }
  - { id: F-1324, tier: high, file: docs/plan_topics/V17a-cancellation-core.md, anchor: "Tests (swallowing-handler side-channel suppression bullet)", title: "V17a swallowing-handler suppression test omits the `cka-33` / `V17a` inline citations the H5f per-facet gate requires" }
  - { id: F-1310, tier: high, file: docs/plan_topics/V13f-query-cancellation-routing.md, anchor: Tests, title: "`V13f` / `V14f` / `V15h` / `V9o` swallowing-handler Tests bullets omit the `cka-33` token and their own facet leaf-IDs the H5f per-facet citing-test gate requires" }
  - { id: F-1241, tier: high, file: docs/plan_topics/H5a-closing-gate-automation.md, anchor: Adds, title: "H5a's warn-only mode enumerates three live-corpus surfaces but omits the H5f per-facet surface H5b and H6a require" }
  - { id: F-1235, tier: high, file: docs/plan_topics/H4a-factory-shell-and-harness.md, anchor: "Adds (the \"complete never-fault prohibition\" / load-bearing-on-synchronous-completion sentence) and Tests bullet 1", title: "H4a \"complete never-fault prohibition\" is spec-backed for the renderer only, not for `registerFlag` or the factory-time `pi.on` subscriptions" }
  - { id: F-1247, tier: high, file: docs/plan.md, anchor: "§How to use this plan, step 2", title: "Step 2's H5b-Deps trigger lists a third disjunct broader than conventions.md's predicate" }
  - { id: F-1311, tier: blocker, file: docs/plan_topics/V9b-registration-reload-wiring.md, anchor: "Adds (model-reference-matcher production wiring), Tests, Ships when", title: "`findExactModelReferenceMatch` is not importable through Pi's public package surface at the pinned minor" }
---
<!-- Generated view. Entries are ordered by importance (highest-importance last, addressed first by the bottom-up picker), then by location, and carry a renderer-owned projection (tier/file/anchor/title) of each finding; edit only membership: which ids appear and their defer_reason/note. Substance lives in docs/findings/F-NNNN.md. -->
