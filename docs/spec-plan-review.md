---
list: active
corpus: mixed
order: by-importance-then-location
entries:
  - { id: F-1600, tier: high, file: docs/spec_topics/pi-integration-contract/version-bump-step2b.md, anchor: "steps 3 and 4 (tail of file)", title: "Version-bump steps 3 and 4 are stranded in a file titled and scoped to step 2(b)" }
  - { id: F-2252, tier: high, file: docs/spec_topics/pi-integration-contract/version-bump-step2.md, anchor: "Editorial-review checklist* preamble and the numbered step 2 line", title: "Editorial-review checklist has no position in the 1–7 version-bump procedure" }
  - { id: F-2231, tier: high, file: docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md, anchor: "sub-step 3 (Await subagent disposal) and the **Per-step isolation** paragraph", title: "Sub-step 3's bounded-await timer machinery escapes the no-throw-escapes invariant" }
  - { id: F-2217, tier: high, file: docs/spec_topics/pi-integration-contract/runtime-event-channel.md, anchor: "`RuntimeEvent` type definition, `kind` field comment", title: "`RuntimeEvent.kind` comment names panic codes, but panics never produce a `RuntimeEvent`" }
  - { id: F-2207, tier: high, file: docs/spec_topics/pi-integration-contract/registration-steps.md, anchor: "Step 5 (`#watcher-hot-reload-registration`) and the PIC-36/49/55/37/38 blocks", title: "Hot-reload subsystem is framed as a registration step" }
  - { id: F-2208, tier: high, file: docs/spec_topics/pi-integration-contract/registration-steps.md, anchor: "Step 5 (`#watcher-hot-reload-registration`) and the PIC-36/49/55/37/38 blocks", title: "250 ms debounce window is a hardcoded constant with no contract justification" }
  - { id: F-1853, tier: high, file: docs/spec_topics/pi-integration-contract/provider-error-mapping.md, anchor: "Provider error mapping (variant-selection sentence) and `TransportError.retryable` population", title: "`TransportError.retryable` is undefined for HTTP statuses outside {5xx, 429, non-429 4xx, 200}" }
  - { id: F-2170, tier: high, file: docs/spec_topics/pi-integration-contract/host-prerequisites.md, anchor: "Pi-side slash-handler promise lifecycle (consumption posture)* presupposition (anchor `pi-slash-handler-promise-lifecycle-presupposition`)", title: "Heading frames the slash-handler-promise presuppositions as \"Pi-side\" while the body declares them loom-side" }
  - { id: F-2169, tier: high, file: docs/spec_topics/pi-integration-contract/host-prerequisites.md, anchor: "Host prerequisites for the degraded-state branch* (clause (a), \"Open contradiction\" callout) + *Clause (a) contradiction narrative", title: "Session-only degraded-state branch rests on an unresolved, self-declared open contradiction" }
---
<!-- Generated view. Entries are ordered by importance (highest-importance last, addressed first by the bottom-up picker), then by location, and carry a renderer-owned projection (tier/file/anchor/title) of each finding; edit only membership: which ids appear and their defer_reason/note. Substance lives in docs/findings/F-NNNN.md. -->
