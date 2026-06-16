---
list: active
corpus: plan
order: bottom-up-by-location
entries:
  - { id: F-0034, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "§Governance REQ-IDs (GOV-*) and §Numbered REQ-IDs (runtime obligations)", title: "Governance section carries runtime/ceiling closure notes under a heading that disclaims them" }
  - { id: F-0088, tier: high, file: docs/plan_topics/coverage-matrix.md, anchor: "code-keyed obligation-area table (~lines 71–104)", title: "V11g closes a spec obligation that no coverage-matrix row maps to it" }
  - { id: F-0110, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "code-keyed obligation-area table (~lines 69–104)", title: "V17b closes the Forwarding-listener-throw MUST that no coverage-matrix row maps to it" }
  - { id: F-0104, tier: high, file: docs/plan_topics/coverage-matrix.md, anchor: "Code-keyed obligation-area table (and the `PIC-17, PIC-18` numbered row)", title: "V15d is untraceable: prompt→prompt suspend / `setActiveTools` snapshot-restore obligation has no coverage-matrix row" }
  - { id: F-0151, tier: medium, file: docs/plan_topics/coverage-matrix.md, anchor: "Code-keyed obligation-area table", title: "`registration-steps.md` has normative MUSTs but no coverage-matrix row" }
  - { id: F-0122, tier: high, file: docs/plan_topics/coverage-matrix.md, anchor: "Code-keyed obligation areas table", title: "V3c asserts only CTRL-1 — the five control-flow reject-path diagnostics are closed by no leaf" }
  - { id: F-0061, tier: medium, file: docs/plan_topics/conventions.md, anchor: "§Per-phase TDD ritual, \"MVP and vertical features — tests-task → implementation-task pairing\", Tests-task bullet", title: "Per-phase TDD ritual: \"One assertion per rule where practical\" gives no exception criterion" }
  - { id: F-0065, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Cross-cutting rules → *Sequential by default* (Enforcement posture)", title: "Blocking-runtime ban concedes its entire enforcement to manual review when a cheap approximating gate is available" }
  - { id: F-0070, tier: medium, file: docs/plan_topics/conventions.md, anchor: "Cross-cutting rules (*No globals, statics, singletons*; *Specific exception types only*; *Sequential by default*)", title: "Production-code root (`src/**`) is never reconciled with the Pi extension entry point (`extensions/index.ts`)" }
  - { id: F-0069, tier: medium, file: docs/plan_topics/conventions.md, anchor: "*Specific exception types only* rule", title: "Broad-catch exemption: category-membership enforcement posture is unstated" }
  - { id: F-0027, tier: medium, file: docs/plan_topics/conventions.md, anchor: "*REQ-ID discipline* (and *Specific exception types only* / *Sequential by default*, which use \"loom 1.0 closing gate\")", title: "\"loom 1.0 closing gate\" and \"loom 1.0 release gate\" coexist in the conventions.md REQ-ID rule with no inline equivalence" }
  - { id: F-0033, tier: medium, file: docs/plan_topics/conventions.md, anchor: "*No globals, statics, singletons*; *Sequential by default* (blocking-runtime ban); *Doc updates*; *REQ-ID discipline* (u", title: "GOV-15 release-time reviewer inspection has no enumerated residue checklist" }
  - { id: F-0166, tier: medium, file: docs/plan_topics/V9l-session-only-degraded-branch.md, anchor: "Adds bullet", title: "V9l Adds carries the conditional clause-(a) fallback path that belongs in plan.md §Blocked obligations" }
  - { id: F-0162, tier: medium, file: docs/plan_topics/V9k-extension-bootstrap-failures.md, anchor: "Tests (`pi.getCommands()` read-failure bullet) and Deps", title: "V9k asserts the `getCommands()` read-failure handler \"MUST NOT set drain state\" but does not depend on V9m, which owns the drain-state surface" }
  - { id: F-0159, tier: medium, file: docs/plan_topics/V9h-degraded-unknown-reason.md, anchor: "leaf file", title: "V9h leaf-pair file slug retains a `degraded-` prefix for a responsibility split out to V9l" }
  - { id: F-0157, tier: medium, file: docs/plan_topics/V9g-T-session-shutdown.md, anchor: "`CNCL-4` Tests bullet", title: "V9g CNCL-4 test bullet: ambiguous \"this\" leaves the `signal.reason` shape undetermined" }
---
<!-- Generated view. Entries are ordered by location and carry a renderer-owned projection (tier/file/anchor/title) of each finding; edit only membership: which ids appear and their defer_reason/note. Substance lives in docs/findings/F-NNNN.md. -->
