# Triaged Spec Review — spec.md

_Generated: 2026-05-08T09:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up — the last finding in the file (T22b, after the 2026-05-11 reshape-extract pass excised T22a to `spec-review-needs-reshape.md`) is addressed first; the first finding in the file (T02, after the 2026-05-11 spec-sweeps extraction) is addressed last in addressing order. After the reshape pass, split children replace their parents at the parent's file position; addressing within a child cluster runs alphabetically (a addressed first)._

_Triage tally: 10 high, 19 medium retained; 38 low discarded; 0 low findings merged into 0 medium findings; 0 nit dropped; 0 false dropped. (Updated 2026-05-15 T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T07 — `QueryError.message` content has no normativity rule finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T07 — `QueryError.message` content has no normativity rule finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-11 manual T03 split: +5 medium for the additional T03b–T03f children replacing the original T03; T03 was importance:medium, all six children inherit medium.) (Updated 2026-05-11 reshape-extract pass: T22a parked to `docs/spec-review-needs-reshape.md` per criterion 4 — verbatim-source-citation pattern; −1 medium.) (Updated 2026-05-12 T22a sub-split: T22a further split into T22a1 — anchor + paraphrase + spec.md forward-link, auto-resolvable, re-queued in this file — and T22a2 — citation upgrade, remains parked in `spec-review-needs-reshape.md` pending human SDK verification; +1 medium re-queued.) (Updated 2026-05-13 T17 retired: pre-flight review against current corpus state confirmed both halves of T17 are already addressed — the session-model paragraph in `docs/spec.md` no longer names `console.error` or `try`/`catch` inline (it forward-links the Diagnostic-emission isolation anchor in PIC), and PIC's Pi-version-bump-procedure editorial-review checklist already carries item (d) re-verifying the stdio-capture presupposition with the corresponding SP-1-compliant disclaimer at `future-considerations.md#pi-stdio-capture-facet`; T17's substantive concerns are therefore already in the corpus and the finding is dropped; −1 medium.) (Updated 2026-05-13 T22a-family Path-A reshape: SDK lookup against `@mariozechner/pi-coding-agent ~0.72.1` `docs/extensions.md` performed against the live V1 pin; the single-active-session presupposition is supported by Pi's lifecycle (sequential `session_shutdown` → `session_start` flow per `extensions.md` Lifecycle Overview lines 273–340 and Session Events line 388, plus the closed `SessionShutdownEvent['reason']` set `"quit" | "reload" | "new" | "resume" | "fork"` enumerating no concurrent-session signal). T22a2 has been **ratified** into T22a1 (citation block now included inline in T22a1's Recommendation rather than parked) and retired from `spec-review-needs-reshape.md`. T22b and T22c remain in their original forms targeting the to-be-installed `pi-integration-contract.md#session-binding-contract` anchor. Net change to retained count: 0; parked count 1 → 0.) (Updated 2026-05-14 T22a1 Option-1 reshape: forensic analysis of a divergent fix-loop run on T22a1 — see `docs/spec-review-forensic-analysis.md` — identified the bundled `Source of truth:` paragraph and the `"startup"` typo above as the divergence drivers; T22a1's Solution approach has been narrowed to anchor + italicised paraphrase + two forward-cross-references only, the `Source of truth:` block has been deleted, the typo has been corrected here and in T22a1, and the SDK-source citation responsibility moves to T36's diff-audit-on-pin-bump remedy and the existing `Pi version bump procedure` build-time `SessionShutdownEvent['reason']` type-equality assertion. Net change to retained count: 0.) (Updated 2026-05-15 T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites` finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md` finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T08a — Rewrite slash-invocation.md context_overflow system-note row to "context overflow" finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T08b — Sweep errors-and-results.md line 206 "context-window overflow" to "context overflow" finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T08c — Sweep query.md line 285 "context window exceeded" to provider context-overflow phrasing finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T11b — V6k counting-formula tighten: forced respond outside the budget finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T11c — V6k normative test vector for `max_rounds: 0` typed query finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T14 — Prompt-mode sequentiality argument has an unstated fourth premise finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T15c — Lift Session-model scope deferrals into Non-goals (V1) section finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T16c — Reduce host-side-denial paragraph to one sentence with forward-links finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T16d — Replace closing capability-model paragraph with single forward-link sentence finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T18a — Append success-side null-policy paragraph to PIC Runtime event channel finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T18b — Add per-mode operator-side null sentences to slash-invocation.md finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T19a — Extend ActiveInvocationRegistry entry shape with invocationId finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T19b — Add invocation_id field to RuntimeEvent payload declaration finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T19c — Widen always-log dedup key to include invocation_id finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T19d — Populate cancelled-by-session-shutdown details with invocation_id finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T19e — Add real-time sibling emission timing paragraph finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T21 — Pi-side slash-handler promise lifecycle taken as given finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T22b — Multi-session contingency response is unspecified in Future Considerations finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T22c — Pi version-bump procedure has no step for the session-binding contract finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T07 — `QueryError.message` content has no normativity rule finding-shape Pattern H auto-reshape: vestigial Success criteria section deleted (field is unused by fix-loop pipeline). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern A auto-reshape: Solution approach narrowed to descriptive form; verbatim text dropped; concrete pins moved to Solution constraints as forbidden-substring bullets. Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern G auto-reshape: deleted 4 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern K auto-reshape: deleted 1 decision-log sentence(s) from Problem. Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern L auto-reshape: deleted 4 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern G auto-reshape: deleted 4 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link finding-shape Pattern K auto-reshape: deleted 1 decision-log sentence(s) from Relationships. Net change to retained count: 0.) (Updated 2026-05-15 T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md` finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites` finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T07 — `QueryError.message` content has no normativity rule finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T08a — Rewrite slash-invocation.md context_overflow system-note row to "context overflow" finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T08b — Sweep errors-and-results.md line 206 "context-window overflow" to "context overflow" finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T08c — Sweep query.md line 285 "context window exceeded" to provider context-overflow phrasing finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T11c — V6k normative test vector for `max_rounds: 0` typed query finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T11b — V6k counting-formula tighten: forced respond outside the budget finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T14 — Prompt-mode sequentiality argument has an unstated fourth premise finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T15c — Lift Session-model scope deferrals into Non-goals (V1) section finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T16c — Reduce host-side-denial paragraph to one sentence with forward-links finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T16d — Replace closing capability-model paragraph with single forward-link sentence finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T18b — Add per-mode operator-side null sentences to slash-invocation.md finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T18a — Append success-side null-policy paragraph to PIC Runtime event channel finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T19e — Add real-time sibling emission timing paragraph finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T19d — Populate cancelled-by-session-shutdown details with invocation_id finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T19c — Widen always-log dedup key to include invocation_id finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T19b — Add invocation_id field to RuntimeEvent payload declaration finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T19a — Extend ActiveInvocationRegistry entry shape with invocationId finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T21 — Pi-side slash-handler promise lifecycle taken as given finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T22c — Pi version-bump procedure has no step for the session-binding contract finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T22b — Multi-session contingency response is unspecified in Future Considerations finding-shape Pattern I auto-reshape: vestigial metadata fields deleted (Original heading, Original section, Split from — auditor-misleading history-log; provides no value to the fixer). Net change to retained count: 0.) (Updated 2026-05-15 T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T18a — Append success-side null-policy paragraph to PIC Runtime event channel finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T19e — Add real-time sibling emission timing paragraph finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified finding-shape Pattern J auto-reshape: negative-space prescription sentence deleted from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T19a — Extend ActiveInvocationRegistry entry shape with invocationId finding-shape Pattern J auto-reshape: negative-space prescription sentence deleted from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites` finding-shape Pattern L auto-reshape: deleted 2 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T11b — V6k counting-formula tighten: forced respond outside the budget finding-shape Pattern L auto-reshape: deleted 1 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection finding-shape Pattern L auto-reshape: deleted 1 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T15c — Lift Session-model scope deferrals into Non-goals (V1) section finding-shape Pattern L auto-reshape: deleted 1 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T22b — Multi-session contingency response is unspecified in Future Considerations finding-shape Pattern L auto-reshape: deleted 1 gratuitous content span(s) from Solution approach. Net change to retained count: 0.) (Updated 2026-05-15 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern F auto-reshape: Solution approach narrowed from directive to directional form. Net change to retained count: 0.) (Updated 2026-05-15 T19e — Add real-time sibling emission timing paragraph finding-shape Pattern G auto-reshape: deleted 1 non-binding constraint bullet(s). Net change to retained count: 0.) (Updated 2026-05-15 T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept finding-shape Pattern K auto-reshape: deleted 1 decision-log sentence(s) from Solution constraints. Net change to retained count: 0.) (Updated 2026-05-15T20:44:34Z parked T22a1 — Session-binding contract sub-section in PIC: anchor, paraphrase, Pi-source citation, and spec.md forward-link to `docs/spec-review-parked.md` after diverging fix-loop, with cascade-parking of must-precede dependents T22b — Multi-session contingency response is unspecified in Future Considerations, T22c — Pi version-bump procedure has no step for the session-binding contract, and T15c — Lift Session-model scope deferrals into Non-goals (V1) section. T22a1 was already removed from the live document by the failed fix-loop run; only T22b/T22c/T15c are decremented here. −3 medium.) (Updated 2026-05-15T23:22:56Z parked T21 — Pi-side slash-handler promise lifecycle taken as given to `docs/spec-review-parked.md` after limit-cycle fix-loop (FIXCOUNTS 11,6,13,13,12); no cascade dependents (T21's only ## Relationships edges are same-cluster, which do not propagate parking). T21 was already removed from the live document by the failed fix-loop run; no tally decrement applied here. 0 medium.) (Updated 2026-05-16T01:11:09Z parked T20 — Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes to `docs/spec-review-parked.md` after diverging fix-loop (FIXCOUNTS 4,4,4,6,7), with cascade-parking of must-follow dependent T15b — Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection (T15b's ## Relationships block names T20 with must-follow). T20 was already removed from the live document by the failed fix-loop run; only T15b is decremented here. −1 medium.) (Updated 2026-05-16T03:29:07Z parked T19a — Extend ActiveInvocationRegistry entry shape with invocationId to `docs/spec-review-parked.md` after limit-cycle fix-loop (FIXCOUNTS 8,13,18,12,10); no cascade dependents (T19a's incoming Relationships edges from T19b/c/d/e are all co-resolve, and T19a's only outbound must-precede edge names T18a which remains live). T19a was already removed from the live document by the failed fix-loop run; no tally decrement applied here. 0 high.)_

_Decision tally (recorded 2026-05-08): all 18 `Shape: multiple` findings resolved to `Shape: single`. 6 findings merged at decision time: T17→T24, T28→T27, T29→T30, T31→T32, T33→T03, T45→T44. See per-finding **Decision** / **STATUS** lines._

_Reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`): T01 and T04 extracted into [`docs/spec-sweeps.md`](./spec-sweeps.md) as deferred mechanical sweeps that cannot be addressed atomically by the per-finding fix-loop; T03 flagged UNSPLITTABLE (composite-3+ with no enumerable Edit Plan in its Recommendation blocks); T11 split into T11a/b/c (must-precede chain); T15 split into T15a/b/c (co-resolve cluster); T16 split into T16a/b/c/d (co-resolve cluster); T18 split into T18a/b/c/d (T18a must-precede the rest)._

_Second reshape pass (2026-05-11, mode `reshape-only`, `PreserveIDs: true`, re-run with broadened splitter logic): T08 split into T08a/b/c (co-resolve cluster — three per-file prose sweeps via splitter location (v) `(file, verb)` prose pairs); T19 split into T19a/b/c/d/e (co-resolve cluster — five entries from chosen Option A's `Spec edits` block via splitter location (iv)). T03 re-flagged UNSPLITTABLE with refreshed diagnostic — under current splitter logic Option B's `Spec edits` block enumerates 3 bullets (one no-op, one composite-2), and the Decision-block-level *Absorbed T33 Option A spec edits* bullets are not captured by any source location, so a clean mechanical split would strand 3 of the 6 effective edits._

_Manual T03 reshape (2026-05-11): T03 split into T03a/b/c/d/e/f (must-precede chain plus same-cluster siblings). The split consolidates Option B's chosen `**Spec edits.**` bullets and the Decision-block's *Absorbed T33 Option A spec edits* bullets into a unified 6-edit set; pairwise dependencies make T03a (PIC sub-paragraph addition) and T03b (`SDK_SURFACE_INVENTORY` row) the cluster roots, T03c/d/e/f the dependents. The T33 absorption metadata is preserved via the `**Split from:**` field on each child._

_Reshape-extract pass (2026-05-11): T22a excised to [`docs/spec-review-needs-reshape.md`](./spec-review-needs-reshape.md) — divergence criterion 4 (verbatim-source-citation pattern alongside existing paraphrase; confirmed divergence case from divergence-analysis.md). T22b and T22c remain in file but are blocked pending T22a resolution. 1 medium finding parked._

_T22a sub-split (2026-05-12, manual): T22a further split into T22a1 (anchor + paraphrase + spec.md forward-link only — auto-resolvable, re-queued at end-of-file so the picker addresses it before T22b/T22c under bottom-up convention) and T22a2 (Pi-source citation upgrade — remains parked in [`spec-review-needs-reshape.md`](./spec-review-needs-reshape.md), gated on a human inspecting `docs/sdk.md`'s extension-lifecycle section). The criterion-4 divergence trigger is confined to T22a2; T22a1's edit set installs the `#session-binding-contract` anchor that T22b and T22c consume, unblocking both for the auto fix-loop._

# T02 — Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph

**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The second paragraph of `docs/spec.md`'s `## Overview` section embeds an inline parenthetical enumerating the per-axis subagent state-isolation contract (what the spawned session inherits from the loom's frontmatter, what is forwarded from the caller's `ExtensionCommandContext`, and what is not inherited). The same sentence already forward-links to the **Subagent state-isolation matrix** at `docs/spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix`, which is the canonical owner of that enumeration. Restating the axes in the Overview duplicates owner-page content in an aggregator (against the aggregator-vs-source convention in `docs/spec_topics/governance.md` GOV-12) and creates a stale-reference risk whenever the matrix's column membership changes.

## Solution approach

Delete the inline per-axis parenthetical (the em-dashed clause beginning "— what the spawned session inherits from the loom's frontmatter ...") from the second sentence of `## Overview` in `docs/spec.md`. The sentence's forward-link to `#subagent-state-isolation-matrix` and its forward-link to `./spec_topics/glossary.md` for the `callable set` definition are both retained; the `#subagent-state-isolation-matrix` anchor target is unchanged.

## Solution constraints

- Do not migrate the deleted axis names into `pi-integration-contract.md` — the matrix at `#subagent-state-isolation-matrix` is the canonical owner; restating them as PIC prose would re-create the duplication this finding fixes.
- Out of scope: the `<a id="terminal-outcomes-aggregator">` paragraph that immediately follows is owned by T26.

## Relationships

- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (broader pattern of misplaced detail in the Overview/Orientation prose).
- T26 "Terminal-outcomes paragraph in Overview restates routing taxonomy owned by Errors and Results" — same-cluster (sibling Overview placement issue).

---

# T03f — `h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph; extend `engines.node` literal-read test to cross-package equality

**Kind:** assumptions, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

In `docs/plan_topics/h1-scaffold.md`, the H1 manifest test bullet that asserts the `semver` / `@types/semver` `package.json` entries currently anchors at the dependency-pinning parenthetical in PIC's two `*Recommended recipe (non-normative).*` paragraphs — a parenthetical that T03c deletes once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`. Separately, the `package.json` `engines.node` literal-read test currently asserts only that the loom literal matches its own pinned string; it does not read `@mariozechner/pi-coding-agent`'s `engines.node` field, so a Pi minor bump that moves the upstream Node floor cannot fail this gate at the bump commit. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` so the cross-package floor and the four already-pinned constants share one source of truth, but no assertion in `test/extension/pinned-surface.test.ts` (or its `engines.node` sibling) yet consumes that row.

## Solution approach

In `docs/plan_topics/h1-scaffold.md`, retarget the `semver` / `@types/semver` manifest-assertion bullet so its spec anchor cites PIC's `**Loom-package implementation dependencies (V1).**` sub-paragraph (the sub-paragraph T03a installs) instead of the Step 0 (a) / Step 0 (d) recipe parentheticals. Separately, extend the `engines.node` literal-read test bullet (or the sibling SDK surface-inventory bullet that owns the `pi-engines-node` row T03b adds) so the asserted surface is cross-package equality between `@mariozechner/pi-coding-agent`'s `engines.node` field and the loom `package.json#engines.node` literal, sourced from the `pi-engines-node` `SDK_SURFACE_INVENTORY` row. The path-resolution mechanism, the comparison verb, and the assertion framing are the implementer's choice within H1's existing test-framework idioms.

## Solution constraints

- Consume the `pi-engines-node` `SDK_SURFACE_INVENTORY` row (added by T03b) as the single source of truth for the cross-package assertion; do not introduce a parallel literal in the H1 test description (would silently break the cross-package floor when one side moves).

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (this finding anchors at the sub-paragraph T03a installs).
- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding consumes the row T03b adds).

---

# T03e — Update `spec.md` Host runtime item 1: rephrase to delegate the `engines.node`-equality check to the H1 SDK surface-inventory test

**Kind:** consistency, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

`docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet) currently asserts that the loom runtime's Node floor matches `@mariozechner/pi-coding-agent`'s `engines.node` floor as a bare prose equivalence, with no named audit mechanism. T03b adds a `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md`, and T03f extends the H1 SDK surface-inventory literal-read test to assert cross-package equality between the two floors; the spec sentence needs to name that test as the auditor rather than reading like a manual coincidence between two unrelated literals.

## Solution approach

In `docs/spec.md` Orientation > Prerequisites > Host runtime item 1 (the **Node version floor** bullet), rewrite the phrase "matching `@mariozechner/pi-coding-agent`'s `engines.node` floor" to "verified equal to `@mariozechner/pi-coding-agent`'s `engines.node` floor by the H1 SDK surface-inventory test." The rest of item 1 — the literal `>=20.6.0`, the SemVer-comparison parenthetical, the `details.kind = "node-floor"` discriminator forward-link, the `loom/load/host-incompatible` emission contract forward-link, and the bump-procedure forward-link — stands unchanged.

## Solution constraints

- The `pi-engines-node` `SDK_SURFACE_INVENTORY` row, the cross-package equality assertion, and the PIC bump-procedure step 3 narrative are owned by T03b, T03f, and T03d respectively — out of scope here.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (this finding's sentence references the test row T03b adds).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what the new sentence delegates to).

---

# T03d — Update PIC Pi version-bump procedure step 3: replace manual-compare instruction with H1-test-fails-red narrative

**Kind:** consistency, prescription
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

Step 3 ("Re-confirm the `engines.node` floor") of the `## Pi version bump procedure` (anchor `pi-version-bump-procedure`) in `docs/spec_topics/pi-integration-contract.md` currently instructs the contributor to manually compare `@mariozechner/pi-coding-agent`'s `engines.node` floor at the candidate version against the loom `package.json#engines.node` literal. Once T03b adds the `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `docs/plan_topics/h1-scaffold.md` and T03f extends the H1 manifest assertion to a cross-package equality check anchored on that row, the manual compare is obviated — the H1 test fails red automatically when the upstream floor moves, and the surviving manual-compare prescription contradicts the automatic detection on which side is authoritative.

## Solution approach

Rewrite step 3 of `## Pi version bump procedure` so the body reframes the step around the cross-package `engines.node` equality test (the H1 assertion T03f extends, sourced from the `pi-engines-node` `SDK_SURFACE_INVENTORY` row T03b adds) as the mechanical detector for upstream-floor movement, rather than a manual compare the contributor performs at bump time. Preserve the step's enumeration of co-edit sites that must move in the same commit when the test fails red — the loom `package.json#engines.node` literal, the [Step 0 (a)](#entry-capability-probe) comparator-and-floor reference, the [`spec.md` — Host runtime obligation 1](../spec.md#orientation) sentence, and the H1 assertion itself — so contributors retain the closure list the manual-compare narrative previously carried.

## Solution constraints

- Preserve the `id="pi-version-bump-procedure"` heading anchor and the integer step number `3` (inbound links and the procedure's existing step ordering depend on both).
- Co-resolve with T03f in the same commit; the bump procedure and the test must not disagree on which side is authoritative for the upstream-floor.

## Relationships

- T03b "Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`" — must-follow (the test row this finding's narrative names is added by T03b).
- T03f "`h1-scaffold.md` manifest assertion ..." — same-cluster (the test extension T03f installs is what this narrative delegates to).

---

# T03c — Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs

**Kind:** cruft, consistency
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The two `*Recommended recipe (non-normative).*` paragraphs under Step 0 of `docs/spec_topics/pi-integration-contract.md` (the Step 0 (a) Node-floor recipe and the Step 0 (d) peer-dep range recipe) carry a parenthetical pinning `semver` as a direct H1 production dependency of the loom package. Once T03a installs the dedicated `**Loom-package implementation dependencies (V1).**` sub-paragraph in `**Host prerequisites.**`, that dependency obligation has its own normative home and the parentheticals become redundant — and contradictory, because the same recipes simultaneously promise that "a future swap to a different SemVer implementation (or a hand-rolled comparator) is permitted". A non-normative recipe that pins a specific implementation as a direct H1 production dependency cannot coexist with a sibling sentence inviting a swap.

## Solution approach

Delete the dependency-pinning parenthetical "pinned by H1 as a direct production dependency of the loom package" wherever it appears in the two `*Recommended recipe (non-normative).*` paragraphs of `docs/spec_topics/pi-integration-contract.md` (Step 0 (a) and Step 0 (d)). Leave the comparator-contract framing, the worked `semver.satisfies` / `semver.valid` example, and the future-swap escape-hatch sentence intact in both paragraphs — those clauses remain load-bearing for the recipe's stated purpose now that T03a's sub-paragraph carries the V1 dependency choice.

## Solution constraints

- The dependency-pinning normativity is owned by T03a's `**Loom-package implementation dependencies (V1).**` sub-paragraph; do not re-introduce normative pins in the recipe paragraphs as part of this trim, and do not promote either paragraph out of `*Recommended recipe (non-normative).*` status.

## Relationships

- T03a "Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`" — must-follow (the sub-paragraph T03a adds is what these parentheticals become redundant with).

---

# T03b — Add `pi-engines-node` row to `SDK_SURFACE_INVENTORY` in `h1-scaffold.md`

**Kind:** completeness, traceability
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `SDK_SURFACE_INVENTORY` constant described in `docs/plan_topics/h1-scaffold.md` (under the SDK surface-inventory literal-read test bullet of the H1 leaf's test framework) enumerates the probe-relevant pinned surfaces (`node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, `peer-dep-range`) but has no row representing Pi's `engines.node` floor as a cross-package surface. T03f extends the test infrastructure to assert cross-package equality between the loom package's `engines.node` literal and Pi's `engines.node` field, and T03d / T03e reference that assertion from the PIC bump procedure and the `spec.md` Host runtime item; without an inventory row holding Pi's floor as its own surface, that cross-package assertion has no shared source of truth with the rest of the inventory and degrades into a one-off test.

## Solution approach

Add one new row to the `SDK_SURFACE_INVENTORY` enumeration in `docs/plan_topics/h1-scaffold.md`, of the form `{ kind: "pi-engines-node", literal: ">=20.6.0" }`, alongside the existing `node-floor`, `abortsignal-member`, `namespace-function`, `type-union-snapshot`, `load-time-resolution`, `strict-capability-probe`, `api-coverage`, and `peer-dep-range` rows. The kind tag `pi-engines-node` is the surface name the cross-package equality assertion in T03f reads, and the literal records Pi's current `engines.node` floor so a future Pi bump that changes the floor lights up the assertion red. Frame the row as a sibling of the existing `node-floor` row (which holds the loom package's own floor) so the two together are the source of truth the cross-package equality test asserts on.

## Solution constraints

- The new row's `kind` discriminator must be the literal string `pi-engines-node` — T03d, T03e, and T03f all consume this surface name as their dedup key; a different tag silently breaks the chain.
- Add the row to the existing `SDK_SURFACE_INVENTORY` enumeration; do not introduce a parallel constant, a new test bullet, or a new H1 sub-leaf for it.
- The cross-package equality test, the PIC bump-procedure narrative, and the `spec.md` Host runtime sentence are owned by T03f, T03d, and T03e respectively — out of scope here.

## Relationships

- T03d "Update PIC Pi version-bump procedure step 3 ..." — must-precede (T03d's narrative names this row).
- T03e "Update `spec.md` Host runtime item 1 ..." — must-precede (T03e's sentence names the test that consumes this row).
- T03f "`h1-scaffold.md` manifest assertion ..." — must-precede (T03f's test extension uses this row as its source of truth).

---

# T03a — Add `**Loom-package implementation dependencies (V1).**` sub-paragraph in PIC `Host prerequisites`

**Kind:** assumptions, completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `**Host prerequisites.**` paragraph in `docs/spec_topics/pi-integration-contract.md` enumerates four host-side prerequisites (Pi SDK pin, Binder model, Binder credentials, Pi-supplied `AbortSignal`) and does not name the loom package's own production dependencies needed to satisfy the Step 0 probe contracts. The runtime's `semver` dependency is mentioned only inside the parentheticals of the two `*Recommended recipe (non-normative).*` paragraphs immediately below the enumeration, both explicitly labelled non-normative. Consequently the H1 leaf's `dependencies["semver"]` manifest assertion (per `docs/plan_topics/h1-scaffold.md`) has no normative anchor in PIC to assert against.

## Solution approach

Add a new sub-paragraph whose lead bold token is `**Loom-package implementation dependencies (V1).**` immediately below the four-item enumeration in `**Host prerequisites.**` of `docs/spec_topics/pi-integration-contract.md`. The sub-paragraph names the V1 implementation choices the recipe contracts consume — for V1, `semver` declared in the loom package's `dependencies` block and `@types/semver` declared in `devDependencies` — frames the choices as implementation-side rather than normative contract, and states the chosen version range as a literal value.

## Solution constraints

- Do not introduce a new MUST about which SemVer implementation contributors must use; the comparator-swap escape hatch already promised by the two `*Recommended recipe (non-normative).*` paragraphs must remain genuine after this sub-paragraph lands.

## Relationships

- T03c "Trim dependency-pinning parentheticals from PIC's two `*Recommended recipe (non-normative).*` paragraphs" — must-precede (this finding installs the anchor that obviates the parentheticals T03c removes).
- T03f "`h1-scaffold.md` manifest assertion: anchor at the new PIC sub-paragraph ..." — must-precede (T03f's manifest assertion anchors at the sub-paragraph this finding installs).

---

# T05 — `bind_*` (frontmatter) vs `binder*` / `binder-*` (settings, diagnostics, prose) — root-word inconsistency for the binder-model concept

**Kind:** naming
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The concept "the LLM the slash-command argument binder calls" appears across three surface conventions with two different root words: frontmatter uses `bind_` (`bind_model`, `bind_context`, `bind_echo`), while settings keys, diagnostic codes, anchors, and running prose use the longer root `binder` (`looms.binderModel`, `loom/load/binder-model-unresolved`, `## Binder model` in `docs/spec_topics/binder.md`, glossary entry `**binder**`). The per-surface case style (snake / camel / kebab) is already governed by documented conventions; the `binder` → `bind_` shortening inside the frontmatter family is not — the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` documents the snake-case rule but is silent on this root-word delta, and the glossary has an entry for `**binder**` (the mechanism) but no entry for the binder-model concept, so the cross-surface mapping has no canonical anchor. Author-facing remediation hints that name both surfaces in one sentence (e.g. the `loom/load/binder-model-unresolved` row in `docs/spec_topics/diagnostics.md`: ``set 'bind_model:' in frontmatter or 'looms.binderModel' in settings``) read as a typo until the convention is internalised.

## Solution approach

Document the per-surface mapping rather than rename the frontmatter family. Add a new `**binder model**` glossary entry to `docs/spec_topics/glossary.md`, alphabetised between the existing `**binder**` and `**callable set**` entries; the entry covers the concept, the per-surface spellings (`bind_model:` frontmatter, `looms.binderModel` settings, `binder-model` / "binder model" diagnostic and prose), the relationship to sibling `bind_` frontmatter fields (`bind_context`, `bind_echo`), and forward-links to `./binder.md` and `./discovery.md#settings-file-reads`. Extend the *Naming convention* paragraph in `docs/spec_topics/frontmatter.md` to document the `bind_` (frontmatter) vs `binder` (settings, diagnostic, prose) root-word convention for the binder-related family.

## Solution constraints

- Do not rename `bind_model`, `bind_context`, or `bind_echo` to `binder_model` / `binder_context` / `binder_echo`.
- The new `**binder model**` entry must be a sibling of (not a replacement for) the existing `**binder**` glossary entry — the latter refers to the mechanism, not the model.

## Relationships

None

---

# T06 — Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers

**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `operator` entry in `docs/spec_topics/glossary.md` binds *operator-facing* tightly to the active Pi TUI session via the `loom-system-note` channel, but the rest of the corpus admits non-TUI invocation paths — `invoke` from another loom, "programmatic consumers", a future loom harness, and the deferred `loom test` and non-loom programmatic harness items in `docs/spec_topics/future-considerations.md` — without reconciling them with that binding. The first use of *operator* in `docs/spec.md` (the terminal-outcomes aggregator paragraph at `<a id="terminal-outcomes-aggregator">`, "what the operator observes per channel") does not forward-link to the glossary, and the glossary `operator` entry has no anchor to link to. A reader auditing whether non-interactive callers see an operator-facing surface has no anchored answer, and a future contributor adding a non-slash entry point has no V1 binding to extend.

## Solution approach

Add an HTML anchor to the `operator` entry in `docs/spec_topics/glossary.md` matching the convention sibling glossary entries already use, and append one sentence to that entry pinning the V1 invariant: every loom invocation runs inside an active Pi TUI session (so an operator is always present) and non-interactive invocation paths — including the deferred `loom test` command and the deferred non-loom programmatic harness named in `docs/spec_topics/future-considerations.md` — are out of V1 scope, with the operator-facing channel's behaviour outside a TUI session undefined. Then add an inline forward-link of the form `the operator (per [Glossary](./spec_topics/glossary.md#operator))` on the first use of *operator* in the terminal-outcomes aggregator paragraph (`<a id="terminal-outcomes-aggregator">`) of `docs/spec.md`. The existing generic forward-link to the glossary in the Runtime observability bullet under `Scope` does not need a per-term anchor.

## Solution constraints

- Use the existing HTML-anchor convention (`<a id="..."></a>`) on the new glossary entry, matching siblings like `<a id="in-loop"></a>` and `<a id="query-terminating"></a>`; do not invent a new anchor scheme.
- The V1 carve-out lives in the glossary `operator` entry only; the consolidated V1 non-goals list (owned by T38) may cite it but is out of scope here.
- Do not extend the V1 disclaimer to Pi's `convertToLlm` LLM-context entry — that surface is a property of the channel, not the operator role.
- Reuse the deferred-feature names already in `docs/spec_topics/future-considerations.md` verbatim (`loom test`; non-loom programmatic harness); do not coin new names.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (overlapping scope: what the operator sees on success vs across non-interactive paths).
- T38 "Non-goals are not consolidated into a single section" — same-cluster (the V1 "no non-interactive delivery path" disclaimer is one of the items the consolidated Non-goals section would cite back to the glossary entry).

---

# T07 — `QueryError.message` content has no normativity rule

**Kind:** testability
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/errors-and-results.md`, every `QueryError` variant declared under `## QueryError variants` (`CancelledError`, `SchemaValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `ToolLoopExhaustedError`, `CodeToolError`, `InvokeInfraError`, `InvokeCalleeError`) carries an unannotated `message: string` field. The single exception is the **Panic message string (normative)** rule, which pins `InvokeInfraError.message` to a registered `loom/runtime/*` template when `cause === "panic"`. The intended contract on the non-panic cases — `message` is human-readable debug prose for operators, on the JavaScript `Error.message` convention, and is not part of the conformance contract — is implicit in the silence and is not stated anywhere a test author or downstream reader can find it. Without that positive statement, a conformance test author has no anchor for what to assert against, and a future maintainer extending the variant set has no convention to follow.

## Solution approach

State in the `### Notes` subsection of `## QueryError variants` in `docs/spec_topics/errors-and-results.md` that (i) programmatic consumers and conformance tests assert against `kind` and each variant's structured fields, (ii) `message` carries human-readable debug prose on the JavaScript `Error.message` convention and is not part of the conformance contract, and (iii) the single exception is `InvokeInfraError.message` on the panic path, which the **Panic message string (normative)** rule immediately above pins to a registered `loom/runtime/*` template. Composition (paragraph count, sentence count, ordering of the three items) and framing posture are the implementer's choice.

## Solution constraints

- Preserve the existing **Panic message string (normative)** rule for `InvokeInfraError.message` when `cause === "panic"` byte-for-byte; the new paragraph is additive and must not weaken or restate the panic-template wording.
- Do not introduce per-variant `message` templates in any form (e.g. a `loom/error/*` code-registry section).

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — same-cluster (touches the same `QueryError variants` surface; co-resolve siblings T08b/c also relevant).
- T39 "Mid-stream cancellation paragraph bundles multiple obligations under one anchor" — same-cluster (cancellation pathway; independent obligation-splitting concern).

---

# T08a — Rewrite slash-invocation.md context_overflow system-note row to "context overflow"

**Kind:** naming
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` currently renders the user-facing template as `"loom /<name> returned Err: context window exceeded"`, which uses a different root word from the rest of the corpus. The schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the surrounding prose in `binder.md`, `pi-integration-contract.md`, `hard-ceilings.md`, and `glossary.md` all use the bare root word "context overflow". Because that table is normative and byte-pinned ("Renderers MUST emit the surrounding template text verbatim"; "Wording changes are spec-versioned breaking changes"), once leaf V18i pins the literal text in tests, harmonising the row later becomes a breaking spec-version bump.

## Solution approach

Rewrite the user-facing template in the `context_overflow` row of the per-`kind` system-note table in `docs/spec_topics/slash-invocation.md` so it ends with the bare root word `context overflow` in place of `context window exceeded`. Edit only the table cell's prose — the schema name, the wire `kind` literal `"context_overflow"` (the row's first column), and any field names are unchanged. Coordinate landing with siblings T08b and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`; the change is the user-facing template wording only.
- The `errors-and-results.md` prose sweep is owned by T08b and the `query.md` sweep by T08c.
- Land before leaf V18i pins the literal in conformance tests — once V18i ships, this rename becomes a spec-versioned breaking bump under the table's "Wording changes are spec-versioned breaking changes" clause.

## Relationships

- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster (touches the same `QueryError variants` surface).

---

# T08b — Sweep errors-and-results.md line 206 "context-window overflow" to "context overflow"

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` — the prose sentence immediately preceding the ```` ```loom schema ContextOverflowError { ... } ```` block — describes the trigger as a "context-window overflow". The rest of the corpus (schema name `ContextOverflowError`, wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `query.md` (T08c)) uses the bare root word "context overflow". The hyphenated variant in this one prose site is observable at every cross-page navigation as a phrasing inconsistency.

## Solution approach

Rewrite the `ContextOverflowError` variant intro paragraph in the *Query-time variants* section of `docs/spec_topics/errors-and-results.md` to use the bare root word "context overflow" in place of "context-window overflow". Coordinate landing with siblings T08a and T08c so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`; the change is the prose root word only.
- The slash-invocation system-note row is owned by T08a; the `query.md` sweep by T08c.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08c "Sweep query.md line 285 'context window exceeded' to provider context-overflow phrasing" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T08c — Sweep query.md line 285 "context window exceeded" to provider context-overflow phrasing

**Kind:** naming
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Detection of `ContextOverflowError`* section in `docs/spec_topics/query.md` describes the runtime as mapping recognised provider `"context window exceeded"` error responses to this variant — quoting an exact provider error string. The quoted phrase both diverges from the corpus root word "context overflow" used by the schema name `ContextOverflowError`, the wire `kind` literal `"context_overflow"`, and the sibling sweeps in `slash-invocation.md` (T08a) and `errors-and-results.md` (T08b), and over-commits the spec to a literal provider string when the per-provider signatures actually live in *Pi Integration Contract — Provider error mapping*. A reader can't tell whether "context window exceeded" is a normative substring providers must emit or just one historical example.

## Solution approach

Rewrite the affected sentence in the *Detection of `ContextOverflowError`* section of `docs/spec_topics/query.md` to use the bare "context-overflow" phrasing — name the provider behaviour without quoting any specific provider error string. Keep the existing cross-reference to *Pi Integration Contract — Provider error mapping*, which retains ownership of the per-provider signatures. Coordinate landing with siblings T08a and T08b so the corpus root word is harmonised in one commit.

## Solution constraints

- Do not rename the schema identifier `ContextOverflowError` or the wire `kind` literal `"context_overflow"`.
- The slash-invocation system-note row is owned by T08a; the `errors-and-results.md` sweep by T08b.
- Do not introduce a new normative rule about what providers may or must emit — the per-provider signatures remain owned by *Pi Integration Contract — Provider error mapping*.

## Relationships

- T08a "Rewrite slash-invocation.md context_overflow system-note row to 'context overflow'" — co-resolve.
- T08b "Sweep errors-and-results.md line 206 'context-window overflow' to 'context overflow'" — co-resolve.
- T07 "`QueryError.message` content has no normativity rule" — same-cluster.

---

# T09 — `bind_context: session` overview bullet uses tilde-approximate caps that contradict the exact bounds defined later in the same file

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The `bind_context: session` bullet in the *bind_context* value list of `docs/spec_topics/binder.md` (the bullet immediately under "Configured via `bind_context:` …") describes the session-context cap as "the last ~20 turns or ~8000 tokens (whichever is smaller)". The tildes read as approximation and "whichever is smaller" reads as a min-of-two cap, while the *Session-context truncation (`bind_context: session`)* subsection later in the same file pins exact, jointly-applied, boundary-inclusive bounds (a turn is included iff running token total ≤ 8000 *and* running turn count ≤ 20). A reader who consumes only the bullet cannot tell that the limits are exact, joint, or boundary-inclusive, so an implementer or test author working from the bullet alone may round counts, undercount tokens, or apply min-of-two and still believe themselves conformant.

## Solution approach

Rewrite the `bind_context: session` bullet so it stops asserting approximate, min-of-two caps. Either restate the caps verbatim as the exact joint inclusive bounds owned by the algorithm subsection, or — preferably — defer entirely with a forward-link to the *Session-context truncation (`bind_context: session`)* subsection (anchor `#session-context-truncation-bind_context-session`) and let that subsection own the literals. Drop the tildes and the "whichever is smaller" framing.

## Solution constraints

- Treat the *Session-context truncation* subsection and the rendered binder system-prompt example line (`Recent session context (most recent 20 turns / 8000 tokens):`) as read-only; the bullet either restates the caps verbatim from that subsection or defers via forward-link, and never paraphrases or re-derives.
- Do not introduce a third independent statement of the caps in `binder.md` — the only acceptable copies remain the *Session-context truncation* subsection and the rendered system-prompt example line, both already present.

## Relationships

None

---

# T10 — Single-string bypass: behaviour on whitespace-only / absent slash argument is unspecified

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The *Single-string bypass* clause (item 2 of *Binder bypass*, anchor `bypass-cases`) in `docs/spec_topics/binder.md` is silent on the case where the user supplies no slash argument or supplies only whitespace. After the documented leading/trailing-whitespace trim, the bound value is `""`, and AJV with the default `string` schema accepts it, but the bypass path has no binder fallback, no `needs_info` channel, and no reserved diagnostic for this case — so two reasonable implementers diverge on whether the loom starts with `""` bound or whether the runtime emits a system note and suppresses the loom. The choice is load-bearing for the user-visible surface and for V3c's test matrix in `docs/plan_topics/v3-frontmatter.md`, which currently has no row pinning the empty-trim outcome.

## Solution approach

Clarify item 2 of *Binder bypass* in `docs/spec_topics/binder.md` to pin the chosen behaviour: when the slash argument is absent or trims to the empty string, the param is bound to `""` and the loom starts; AJV validates `""` against the `string` schema (it passes by definition). Add a paired test row to V3c's *Tests* line in `docs/plan_topics/v3-frontmatter.md` asserting that the no-argument and whitespace-only-argument cases both bind the param to `""` and start the loom.

## Solution constraints

- Do not introduce a new diagnostic code, a new failure-mode-template row, or a new system-note template — the resolution is to clarify the bound value and start condition only.
- Do not alter the existing trim semantics: leading/trailing whitespace stripped, internal whitespace preserved (e.g. `/foo  hello  ` still binds `"hello"`).
- Do not change echo policy on the bypass path — echo auto-suppression on bypass per V16k must continue to hold for the absent / whitespace-only cases.
- The *No-params overflow* note in `docs/spec_topics/slash-invocation.md` must remain gated on `params: {}` / absent; do not extend it to fire on the single-string bypass path.

## Relationships

None

---

# T11c — V6k normative test vector for `max_rounds: 0` typed query

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V6k *Tests* line in `docs/plan_topics/v6-typed-queries.md` (leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`") currently exercises `max_rounds: 0` only as far as asserting that the model receives an empty `tools` set during the free phase; it does not pin the boundary outcome of a `max_rounds: 0` typed query. Two compliant readings of the spec rule established by T11a and the V6k counting-formula re-stated by T11b — one in which the forced respond turn fires (returning `Ok(validated_value)`) and one in which the loop is treated as already exhausted (returning `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`) — would each pass V6k's existing *Tests* row and *Ships when* gate, so the leaf cannot catch the divergence.

## Solution approach

Add a paired normative test vector to V6k's *Tests* line covering the `max_rounds: 0` typed-query boundary: one row in which the model — invoked once against an empty tool set with forced choice on the respond tool — emits a valid respond-tool call and the query MUST return `Ok(validated_value)`, paired with one row in which the model emits a non-respond `tool_use` block (or text under non-strict providers) and the query MUST return `Err({ kind: "tool_loop_exhausted", rounds: 0, last_tool_name: null })`. The error-payload field values are load-bearing because they are what distinguishes the two compliant readings the finding identifies. Land after T11a (spec rule) and T11b (V6k *Adds* formula) per Relationships.

## Solution constraints

- The new vector applies to the original typed query only; do not conflate `max_rounds: 0` on the original query with `max_rounds: 0` on a respond-repair follow-up (V13g follow-ups receive a fresh `tool_loop` budget).
- Do not edit spec topic files; the *Tool-call loop bound* section in `docs/spec_topics/query.md` is owned by T11a.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow.
- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-follow.

---

# T11b — V6k counting-formula tighten: forced respond outside the budget

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Adds* paragraph of leaf "V6k — `tool_loop` cap enforcement and `ToolLoopExhaustedError`" in `docs/plan_topics/v6-typed-queries.md` defines the per-query slot count as *(free-phase rounds) + (1 if a forced respond turn is issued, else 0)* and pins exhaustion at *total slots would exceed `max_rounds`*. That formula counts the forced respond turn against the budget, which contradicts the *Tool-call loop bound* rule that T11a establishes in `docs/spec_topics/query.md` (the forced respond turn is exempt from CIO-4 slot-accounting). With T11a landed, V6k's *Adds* prose is internally inconsistent with the spec it implements, and the boundary outcome of a `max_rounds: 0` typed query is undefined from the leaf's perspective.

## Solution approach

Rewrite the counting-formula and exhaustion sentences in V6k's *Adds* paragraph in `docs/plan_topics/v6-typed-queries.md` so the slot count equals the free-phase round count (the forced respond turn sits outside the budget) and exhaustion fires under either of two disjoint conditions: (a) the slot count would exceed `max_rounds` and the next required turn is a free-phase turn, or (b) the forced respond turn was dispatched and the model failed to invoke the respond tool. Preserve the existing statements that the counter starts at 0, that respond-repair follow-ups (V13g) reset the counter, and that `max_rounds: 0` disables model-driven tool calls.

## Solution constraints

- The *Tool-call loop bound* section in `docs/spec_topics/query.md` is owned by T11a — do not edit spec topic files here.
- Do not collapse the two firing conditions into a single arithmetic predicate that re-counts the forced respond turn against `max_rounds`; that re-introduces the contradiction T11a fixes.
- The `max_rounds: 0` boundary test vector is owned by T11c, and leaf V6l (the two-phase driver) is independent — both out of scope here.

## Relationships

- T11a "Replace 'consumes one slot' prose with explicit forced-respond exemption rule" — must-follow (the spec rule must land first so V6k's formula has something to anchor against).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the formula change must land before the test can assert against it).

---

# T11a — Replace "consumes one slot" prose with explicit forced-respond exemption rule

**Kind:** testability
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The *Tool-call loop bound* section in `docs/spec_topics/query.md` (anchor `tool-call-loop-bound`) and the `tool_loop` field paragraph in `docs/spec_topics/frontmatter.md` each assert that the forced respond turn for a typed query consumes one `tool_loop` slot. That framing contradicts CIO-4 in `docs/spec_topics/hard-ceilings.md` and its *Depth-6 forced respond at `max_rounds`* worked consequence, which together treat the forced respond turn as the unconditional terminating mechanism CIO-4's `max_rounds`-final branch routes to (slot-accounting is evaluated only against free-phase rounds). At `max_rounds: 0` the contradiction is directly observable: under the "consumes one slot" reading the only available turn is already over budget; under CIO-4 it MUST still be dispatched. The sibling findings T11b and T11c cannot land their V6k changes against the spec until this prose is reconciled.

## Solution approach

Rewrite the relevant sentences in the *Tool-call loop bound* section of `docs/spec_topics/query.md` and in the `tool_loop` field paragraph of `docs/spec_topics/frontmatter.md` to replace the "consumes one slot" framing with an explicit forced-respond-exemption rule: the forced respond turn is the typed-query terminating mechanism CIO-4's `max_rounds`-final branch routes to; the runtime MUST dispatch it on every typed query that reaches that branch (including the `max_rounds: 0` boundary case, where it is the only turn issued); and CIO-4's slot-accounting check is not evaluated against the forced respond turn itself. Confirm `docs/spec_topics/hard-ceilings.md` CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence remain aligned with the new rule and leave them unedited if they do.

## Solution constraints

- Treat `docs/spec_topics/hard-ceilings.md` (CIO-4 and the *Depth-6 forced respond at `max_rounds`* worked consequence) and PIC-1 (d) in `docs/spec_topics/pi-integration-contract.md` as read-only — they are already aligned with the new rule.
- Plan leaves V6k and V6l in `docs/plan_topics/v6-typed-queries.md` are owned by T11b and T11c — out of scope here.

## Relationships

- T11b "V6k counting-formula tighten: forced respond outside the budget" — must-precede (the prose rule must land before V6k's formula can be rewritten against it).
- T11c "V6k normative test vector for `max_rounds: 0` typed query" — must-precede (the prose rule must land before V6k's test can assert against it).

---

# T12 — Dual-cap simultaneous breach: `<cap>` value in `loom/load/discovery-slow` diagnostic is indeterminate

**Kind:** testability
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The "Package discovery" → "Edge cases" bounded-walk paragraph in `docs/spec_topics/discovery.md` says the walk stops on `looms.scanPackagesMaxFiles` or `looms.scanPackagesTimeoutMs` "whichever fires first" and emits a single `loom/load/discovery-slow` warning naming "the cap that fired", but both predicates are evaluated against the same observed state at the same cap-check site (before each new candidate-package read). When both predicates first become true on the same iteration — constructible deterministically via the `FakeClock` seam — the spec does not say which is consulted first, so the warning's `cap` payload is indeterminate. Two compliant implementations would emit different `cap` strings for the same input scenario, breaking any test fixture or operator log-analysis that keys on the field. The asymmetric ordering rule already stated later in the same paragraph for the per-read deadline / global timeout interaction shows the authors recognise the need to nail down such overlaps; the dual-cap case at the cap-check site itself was missed.

## Solution approach

Clarify the bounded-walk paragraph under "Edge cases" in the "Package discovery" section of `docs/spec_topics/discovery.md` by adding a tie-breaking rule for the simultaneous-true case at the cap-check site: the file-count predicate is evaluated before the elapsed-time predicate, so when both predicates are true at the same iteration the warning's `cap` field is `looms.scanPackagesMaxFiles`. Leave the per-read deadline / global timeout ordering rule already stated later in the same paragraph unchanged — that race is at a different site and already has its ordering nailed down.

## Solution constraints

- Do not introduce a new `cap` value, a third diagnostic code, or a new `details` field — the tie-break must resolve to one of the existing two cap names.
- Test-vector additions to plan leaf V14m in `docs/plan_topics/v14-tool-calls.md` are out of scope here.

## Relationships

None

---

# T13 — Invocation depth bound: introductory sentence omits the "cross-file" qualifier on `.warp fn` calls

**Kind:** naming
**Importance:** high
**Shape:** single
**State:** reduced

## Problem

The "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` defines the same rule twice with different breadth. Its introductory paragraph enumerates the countable dispatches as direct `invoke(...)`, `.loom` callable calls through `tools:`, and `.warp` `fn` invokes — omitting the `cross-file` qualifier that the normative *countable-frame* paragraph immediately below applies to `.warp` `fn` calls. The qualifier is load-bearing: without it, intra-`.warp`-file `fn` dispatch is wrongly read as consuming a depth slot, so two implementers reading the subsection in order arrive at incompatible 32-slot budgets. The same loose phrasing has already propagated to the V18n leaf's *Adds.* bullet in `docs/plan_topics/v18-cancellation.md`.

## Solution approach

Rewrite the enumeration in the introductory paragraph of the "Invocation depth bound" subsection of `docs/spec_topics/invocation.md` so its third item reads "cross-file `.warp` `fn` calls" — adding the `cross-file` qualifier and matching the noun (`calls`) used by the normative *countable-frame* paragraph that follows. Apply the same wording change to the *Adds.* bullet of V18n in `docs/plan_topics/v18-cancellation.md`. Leave the normative *countable-frame* paragraph and the rest of the subsection unchanged.

## Solution constraints

- None.

## Relationships

None

---

# T14 — Prompt-mode sequentiality argument has an unstated fourth premise

**Kind:** assumptions
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The Session-model paragraph in `docs/spec.md` (anchored at `id="session-model"`) concludes that prompt-mode bodies execute strictly sequentially within a user session and supports that conclusion with three premises (i)/(ii)/(iii) that only close the user-session axis. Those three premises do not on their own rule out the sibling-subagent fan-out path that the next paragraph explicitly admits: a subagent-mode body may itself `invoke(...)` a prompt-mode child, and whether such a child can re-enter the user session and contend for `pi.setActiveTools` is the load-bearing question. The closing rule lives in the Cross-mode semantics section of `docs/spec_topics/invocation.md` (a `subagent → prompt` callee attaches to the subagent's own private `AgentSession`, not the user session), but a reader auditing the argument from `spec.md` alone cannot derive that — the fourth premise is unstated.

## Solution approach

Add a fourth premise to the parenthesised support list in the Session-model paragraph that names the Cross-mode rule closing the subagent-spawned-prompt-mode-child escape, and forward-link to the owning section in `docs/spec_topics/invocation.md`. Cite the Cross-mode rule rather than inlining or paraphrasing it. Leave the existing three premises and the follow-up "three potential sources of in-session overlap" sentence unchanged.

## Solution constraints

- The new premise must forward-link the Cross-mode semantics section and must not inline, restate, or paraphrase its content beyond a one-clause framing of which fan-out path is closed — that is the whole point of the finding (avoid aggregator overreach).
- Do not modify the existing premises (i)/(ii)/(iii) or the follow-up "three potential sources of in-session overlap" sentence.
- Restructuring of the Session-model paragraph is owned by T15a / T15b / T15c; the fourth premise is carried across whichever sibling lands first per T15b's coordination with this finding.
- Plan-leaf edits to V15g / V15h / V15j are out of scope here.

## Relationships

- T23 "Pi's per-session slash-handler serialisation is asserted without a verifiable Pi source" — same-cluster (different premise of the same argument).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (touches the same Session-model paragraph; co-edit pass).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (also concerns the sibling-subagent fan-out path, on the diagnostics axis; co-resolve siblings T19b/c/d/e also relevant).
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster (same fan-out path, resource-exhaustion axis).

---

# T15a — Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet

**Kind:** placement
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites compresses five distinct content categories — Pi-session binding, `session_shutdown` payload contract, prompt-mode sequentiality argument with its three supporting premises, mode-qualified transcript/tool-table isolation, and admission-cap / per-invocation-budget posture — into one Orientation bullet. The architectural clauses belong in the new `Concurrency model` subsection owned by T15b, and the V1 scope deferrals (parallel-`invoke`, concurrent user sessions) belong at the V1 non-goals surfaces owned by T15c; until this reduction lands, those siblings have no room to relocate content into. The paragraph reads as a single mixed block rather than as Orientation-level forward-linking prose.

## Solution approach

Reduce the `<a id="session-model"></a>` paragraph in `docs/spec.md` Orientation > Prerequisites to orientation-level forward-link prose. The retained content categories are: the one-session-at-a-time Pi-session binding (forward-link to the Session-binding contract in `docs/spec_topics/pi-integration-contract.md`), the `session_shutdown` payload contract (forward-link to the Extension entry point in `docs/spec_topics/pi-integration-contract.md` and to the closed `event.reason` set in the SDK type at `@mariozechner/pi-coding-agent`'s `dist/core/extensions/types.d.ts`), and a pointer to the architectural `Concurrency model` subsection installed by T15b. Delete the clauses T15b relocated (mode-qualified isolation summary, prompt-mode sequentiality with premises (i)/(ii)/(iii), genuine-concurrency-only-between-subagent-invocations conclusion, cancellation-propagates-downward restatement, per-invocation budget scoping, no-admission-cap statement) and the deferrals T15c lifted (parallel-`invoke`, concurrent user sessions). Composition — sentence count, ordering of forward-links, whether closely-related pointers fold into one sentence — is the implementer's choice.

## Solution constraints

- The reduced paragraph must retain the `<a id="session-model"></a>` anchor — inbound links (the Overview's terminal-outcomes paragraph, the `[Session model](#session-model)` reference inside the V1 non-goals subsection) depend on it.
- The destination `Concurrency model` subsection is owned by T15b — do not author it under this finding.
- T15b and T15c MUST have already landed before this finding is addressed (bottom-up ordering guarantees this: T15c at the highest line number is addressed first, T15b second, this finding T15a last). If either the `Concurrency model` subsection installed by T15b or the V1 non-goals entries verified by T15c is absent at edit time, defer.

## Relationships

- T15b "Move concurrency semantics into Extension Architecture / Implementation Notes Concurrency-model subsection" — co-resolve (the reduction makes room for the relocated content).
- T15c "Lift Session-model scope deferrals into Non-goals (V1) section" — co-resolve (the reduction makes room for the lifted deferrals).
- T02 "Subagent state-isolation enumeration duplicates PIC matrix in Overview opening paragraph" — same-cluster (identical placement pattern).
- T16a "Trust boundary bullet: keep scope claim and drop SDK-pin literal" — same-cluster (sibling Scope bullet exhibiting the same mixing of categories).
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — same-cluster (third instance of the pattern, in the Runtime-observability bullet).
- T24 "Fork-reason watcher closure leaves the extension in an unspecified, silently degraded state" — same-cluster (touches the same Session-model paragraph but addresses content correctness).

---

# T16a — Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The SDK-surface clause of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` inlines the literal Pi-SDK pin `@mariozechner/pi-coding-agent ~0.72.1` while restating that Pi's `ExtensionAPI` and `ExtensionContext` surfaces expose no per-extension privilege facet. That literal pin is owned verbatim by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`; restating it inside the Trust-boundary bullet creates a second site that the **Pi version bump procedure** in `docs/spec_topics/pi-integration-contract.md` (anchor `id="pi-version-bump-procedure"`) expects to drift on the next bump. The behavioural property the scope decision actually rests on is the no-per-extension-privilege-facet property at the V1 Pi-SDK pin, not the literal version range.

## Solution approach

Rewrite the SDK-surface clause of the Trust-boundary bullet so it states only the behavioural property — that the peer packages expose no per-extension privilege facet at the V1 Pi-SDK pin — and forward-links **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md` in lieu of restating the pin. Drop the inline `~0.72.1` parenthetical entirely. Retain the build-time SDK surface-inventory assertion as a single sentence carrying its forward-link to the anchor `id="pi-version-bump-procedure"` in `docs/spec_topics/pi-integration-contract.md`.

## Solution constraints

- Do not inline the literal `~0.72.1` (or any structural variant restating the Pi SDK pin); that pin remains owned solely by **Host prerequisites — Pi SDK pin** in `docs/spec_topics/pi-integration-contract.md`.
- The callable-set paragraph, the host-side-denial paragraph, and the closing capability-model sentence are owned by T16b, T16c, and T16d respectively — leave them present and untouched here.

## Relationships

- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve (same Trust-boundary bullet; must land in one commit).
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.
- T34 "Trust-boundary 'no privilege facet' claim is asserted but not gated by any audit the spec cites" — same-cluster (same bullet; orthogonal fix — adds an audit citation rather than restructures placement).
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster (the Session-model paragraph exhibits the same aggregator-overreach pattern).

---

# T16b — Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names

**Kind:** placement
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The callable-set paragraph in the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` names packaging-level Pi-API identifiers — the `customTools` array on `createAgentSession` for subagent mode and the `pi.setActiveTools` snapshot/restore pair for prompt mode — to characterise how the per-mode callable-set wiring is enforced. Those identifiers are owned verbatim by the **Tool-registration lifetime and visibility** and **Conversation drive — subagent mode** sections of `docs/spec_topics/pi-integration-contract.md`; the aggregator restatement drifts the moment either Pi API surface is renamed, replaced, or restructured. The behavioural property the trust-boundary scope decision actually rests on is the per-mode wiring isolation, not the specific Pi APIs that implement it.

## Solution approach

Rewrite the callable-set paragraph in the Trust-boundary bullet so it states only the behavioural isolation rule — subagent-mode invocations see only the loom's declared callable set; prompt-mode invocations see the loom's declared callable set unioned with the user session's snapshot for the swap window — and forward-links the **Tool-registration lifetime and visibility** section in `docs/spec_topics/pi-integration-contract.md` for the SDK-call mechanism. Drop the inline `customTools`, `createAgentSession`, and `pi.setActiveTools` identifiers from the paragraph. The SDK-call mechanism remains owned by the linked PIC section.

## Solution constraints

- Do not inline the Pi-API identifiers `customTools`, `createAgentSession`, or `pi.setActiveTools` (or any other Pi-API symbol that names how callables are wired for either mode); those are owned by **Tool-registration lifetime and visibility** in `docs/spec_topics/pi-integration-contract.md`.
- Preserve the *callable set* clarification — that the loom's declared callable set is a configuration knob over the *model's* reachable callable set, NOT a host-process sandbox — and its forward-link to [Parameters and Frontmatter — `tools`](./spec_topics/frontmatter.md#tools).
- The host-side-denial paragraph and the closing capability-model sentence are owned by T16c and T16d respectively — leave them untouched here.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.

---

# T16c — Reduce host-side-denial paragraph to one sentence with forward-links

**Kind:** placement, prescription
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The host-side-denial paragraph in the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` restates the full denial-routing rule for clean `execute()` denials (the `Err(QueryError { kind: "code_tool", cause: "execution", ... })` mapping), the non-conforming-return-envelope routing off `CodeToolError` to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"`, the non-settling-Promise disposition, and the post-cancel late-settlement discard rule. These observable `execute()` outcomes are owned verbatim by the **Failures** section of `docs/spec_topics/tool-calls.md` and by **Tool execution from loom code** in `docs/spec_topics/pi-integration-contract.md` (anchor `id="tool-execution-from-loom-code"`); the aggregator restatement drifts the moment either source widens or reshapes its outcome enumeration.

## Solution approach

Rewrite the host-side-denial paragraph in the Trust-boundary bullet so it stops restating the routing rule and becomes a single sentence that names the host-side-denial pathway (denials of filesystem, network, or Pi-API access reaching loom code through the tool that issued the request), forward-links both `docs/spec_topics/tool-calls.md` (for the **Failures** / outcome-enumeration content) and the anchor `id="tool-execution-from-loom-code"` in `docs/spec_topics/pi-integration-contract.md` for the complete enumeration of observable `execute()` outcomes, and preserves the silent-success-on-denial prohibition. The normative routing content remains owned by the linked sources.

## Solution constraints

- Do not inline the literal `Err(QueryError { kind: "code_tool", cause: "execution", ... })` (or any structural variant naming the `kind` / `cause` enum members), the literal `details.kind = "tool-return-shape"`, or any of the dispositions (non-conforming return envelope, non-settling Promise, post-cancel late settlement); those belong to the linked sources only.
- Preserve the silent-success-on-denial prohibition — host-side denial cannot surface to loom code as success — that is the load-bearing scope claim of this paragraph.
- The closing capability-model sentence is owned by T16d — leave it untouched.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve.
- T16d "Replace closing capability-model paragraph with single forward-link sentence" — co-resolve.

---

# T16d — Replace closing capability-model paragraph with single forward-link sentence

**Kind:** placement, scope
**Importance:** medium
**Shape:** single
**State:** reduced

## Problem

The closing sentence of the Trust-boundary bullet under Orientation > Scope in `docs/spec.md` ("A per-loom capability model is **out of scope for V1** and is not anticipated by V1; introducing one would require a migration.") restates the per-loom-sandbox / capability-model deferral that is already owned by the **No per-loom sandbox or capability model** bullet under [Future Considerations — V1 non-goals](./spec_topics/future-considerations.md#v1-non-goals). The aggregator restatement drifts the moment the source bullet's framing changes; it should be a forward-link, not a paraphrase.

## Solution approach

Rewrite the closing capability-model sentence of the Trust-boundary bullet so it stops restating the deferral and becomes a single forward-link sentence pointing at the **No per-loom sandbox or capability model** bullet on `docs/spec_topics/future-considerations.md` (anchor `id="v1-non-goals"`). The replacement characterises the disposition only as out of V1 scope and forward-links the source bullet; the normative content of the deferral remains owned by `future-considerations.md`.

## Solution constraints

- Do not restate the deferral's content (the "not anticipated by V1" framing or the "would require a migration" framing) — that framing remains owned by the **No per-loom sandbox or capability model** bullet under [Future Considerations — V1 non-goals](./spec_topics/future-considerations.md#v1-non-goals).
- Do not author a doc-level Non-goals section in `docs/spec.md` — that relocation is owned by T38.

## Relationships

- T16a "Reduce Trust-boundary SDK-surface clause: drop the `~0.72.1` literal" — co-resolve.
- T16b "Rewrite callable-set paragraph: drop inline `customTools` / `createAgentSession` / `pi.setActiveTools` names" — co-resolve.
- T16c "Reduce host-side-denial paragraph to one sentence with forward-links" — co-resolve.
- T38 "Non-goals are not consolidated into a single section" — must-follow (the disclaimer's permanent home is the proposed doc-level Non-goals section once T38 lands).

---

# T18d — Add V18q test asserting zero `loom-system-note` emissions on successful termination

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The V18q **Tests.** bullet under `## V18q — Runtime event channel and always-log emission` in `docs/plan_topics/v18-cancellation.md` asserts via clause (b) that the four excluded `kind`s (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) emit zero `loom-system-note` events on the always-log channel, but contains no symmetric clause asserting the success-side null: that a loom terminating with `Ok(v)` emits zero `loom-system-note` events on that channel. Sibling T18a installs the central success-side null-policy paragraph in PIC Runtime event channel; without a paired test clause in V18q, the leaf's **Ships when.** condition cannot catch a regression of that rule, and two compliant implementations could ship divergent success-side emission behaviour.

## Solution approach

Add one new lettered clause to the V18q **Tests.** bullet in `docs/plan_topics/v18-cancellation.md` asserting that a successful prompt-mode loom and a successful slash-invoked subagent-mode loom each emit zero `loom-system-note` events on the always-log channel. Mirror clause (b)'s structural shape (one clause covering both scenarios inline). The clause asserts against the success-side null-policy that sibling T18a installs centrally in PIC Runtime event channel; do not author the spec-side rule here.

## Solution constraints

- Append to V18q's **Tests.** bullet using the next free letter; do not renumber, drop, reword, or reorder existing clauses (a) through (l). In particular, do not weaken clause (b)'s four-excluded-kinds enumeration — the success-side null is additive to those guarantees, not a substitute.
- Do not edit V18q's **Spec.**, **Adds.**, **Deps.**, or **Ships when.** lines, and do not introduce a new diagnostic code, always-log `kind`, `customType`, or cross-leaf dependency change.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve.

---

# T18c — Widen spec.md Runtime observability bullet to forward-link the null-policy

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime observability** bullet under `### Scope` in `docs/spec.md` (Orientation > Scope) describes only failure-side events on the `loom-system-note` channel and neither names nor forward-links the success-side null-policy — that a loom terminating with `Ok(v)` emits no `loom-system-note` event. Reviewers auditing the operator-visibility contract from this aggregator bullet must triangulate against the PIC **Runtime event channel** section and `docs/spec_topics/slash-invocation.md` to confirm the absence of a success-side emission is deliberate. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section and T18b installs the per-mode operator-side null sentences in `slash-invocation.md`, but the spec.md aggregator bullet still gives no forward link to either, so the rule cannot be reached from the canonical entry surface.

## Solution approach

Widen the **Runtime observability** bullet under `### Scope` in `docs/spec.md` by adding a clarifying sentence that names the success-side null-policy on the `loom-system-note` channel and forward-links both the PIC **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` (the central success-side null-policy owner) and the **Once a loom is invoked** section in `docs/spec_topics/slash-invocation.md` (the per-mode operator-surface owner). Do not author the rule itself in `spec.md` — characterise the policy in one short sentence and rely on the link targets that siblings T18a and T18b install for the normative content. Preserve the bullet's existing failure-side framing and existing forward-links unchanged.

## Solution constraints

- Preserve every existing forward-link in the bullet (Glossary; PIC Runtime event channel; Diagnostics; Future Considerations — Richer runtime-event telemetry) — link text and targets unchanged.
- Preserve the bullet's existing failure-side framing (the *always-log set* Operator-facing runtime-failure framing, the disjoint `details`-shape sentence, the deferred-aggregation sentence) unchanged in normative content.
- The widening must name both forward-link targets (PIC **Runtime event channel** as the central owner, AND `slash-invocation.md` as the per-mode operator-surface owner); do not collapse to one link.
- The central success-side null-policy paragraph (T18a), the per-mode operator-side null sentences (T18b), and the V18q test clause (T18d) are owned elsewhere.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow.
- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — co-resolve.
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

# T18b — Add per-mode operator-side null sentences to slash-invocation.md

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md` describe the per-mode invocation and conversation-driving surfaces but neither bullet states the operator-side success-outcome null — that a successfully terminating loom emits no `loom-system-note` and that the operator-visible surfaces on success are the per-mode conversation / programmatic-return-value pair only. Sibling T18a installs the central success-side null-policy paragraph in the PIC **Runtime event channel** section, but a reader of `slash-invocation.md` must triangulate against PIC and `docs/spec_topics/invocation.md` to confirm the absence of a terminal operator-side note is deliberate rather than an under-specified surface.

## Solution approach

Add one per-surface null sentence to each of the **prompt mode** and **subagent mode** bullets under *Once a loom is invoked* in `docs/spec_topics/slash-invocation.md`. Each sentence restates, at the per-mode operator-surface level, the success-side null-policy that T18a installs centrally in the PIC **Runtime event channel** section: the prompt-mode sentence names `loom-system-note` and asserts no such note is emitted on successful termination, identifying the driven conversation as the operator-visible surface; the subagent-mode sentence asserts that the operator sees no terminal note on success (the subagent transcript is private and the return value reaches only the programmatic caller) and identifies the pre-start binder echo and the failure-side top-level `Err` note as the operator-visible surfaces. Do not author the central rule — restate the per-mode consequence and rely on T18a's PIC paragraph for the normative source.

## Solution constraints

- Do not modify the pre-existing per-mode framing in either bullet (the prompt-mode current-conversation-driving description and `Ok`-return-value-not-surfaced-to-user clause; the subagent-mode fresh-isolated-conversation description and return-value-only-reaches-caller clause).
- The central success-side null-policy paragraph (T18a), the `spec.md` aggregator forward-link (T18c), and the V18q test clause (T18d) are owned elsewhere — out of scope here.

## Relationships

- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-follow (the central rule must land first).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — co-resolve (sibling per-surface restatement; same edit pass).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — co-resolve.

---

# T18a — Append success-side null-policy paragraph to PIC Runtime event channel

**Kind:** completeness
**Importance:** medium
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` enumerates the **always-log set** of failure outcomes that emit on the `loom-system-note` channel — including the explicit four-excluded-kinds paragraph (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) — but never makes the symmetric statement on the success side: that a loom terminating with `Ok(v)`, including a child loom whose `Ok` flows to its `invoke` parent, emits no event on that channel. Reviewers must triangulate against `docs/spec_topics/invocation.md` and the per-mode bullets in `docs/spec_topics/slash-invocation.md` to confirm the success-visible surfaces are programmatic-only, and the sibling per-surface restatements (T18b in `slash-invocation.md`, T18c in `spec.md`) and the V18q test clause (T18d) have no central spec sentence to anchor against.

## Solution approach

Add a success-side null-policy statement to the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` asserting that a loom terminating with `Ok(v)` — including the case where a child loom's `Ok` flows to its `invoke` parent — emits no event on the `loom-system-note` channel. Name the success-visible surfaces (the driven conversation in prompt mode and the programmatic return value in every mode).

## Solution constraints

- Scope the null-policy to the *terminal* outcome surface only; do not extend it to pre-evaluation surfaces (the binder echo on `bind_echo: true` and the no-params overflow note remain operator-visible regardless of terminal outcome).
- Do not add a "completed" parity note for subagent slash invocations — that re-opens the deferred aggregation / latency surface intentionally scoped out of V1.
- The per-mode operator-side null sentences in `slash-invocation.md`, the `spec.md` **Runtime observability** aggregator forward-link, and the V18q test clause are owned by T18b, T18c, and T18d respectively.
- Do not introduce a new diagnostic code, a new always-log `kind`, or a new `customType` value; the edit is one additive paragraph inside the existing section.

## Relationships

- T18b "Add per-mode operator-side null sentences to slash-invocation.md" — must-precede (the central PIC paragraph must land before the slash-invocation restatement points at it).
- T18c "Widen spec.md Runtime observability bullet to forward-link the null-policy" — must-precede (the bullet's forward-link target must exist).
- T18d "Add V18q test asserting zero `loom-system-note` emissions on successful termination" — must-precede (the test asserts against the spec sentence installed here).
- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — same-cluster (operator-surface gap on the failure side; symmetric to this child's success-side gap; co-resolve siblings T19b/c/d/e also relevant).
- T06 "Operator role: TUI binding asserted in glossary but never reconciled with non-interactive callers" — same-cluster.

---

# T19e — Add real-time sibling emission timing paragraph

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins exactly-once-per-origin emission semantics for `loom-system-note` always-log notes and lists Deduplication and lifetime rules, but does not pin emission timing across concurrent sibling invocations. An implementer reading the section could legally batch sibling always-log emissions until the parent's tool-loop round closes — deferring operator-visible failure timing — without violating any existing rule on the page. The omission also leaves V18q's concurrent-sibling emission tests without a normative anchor for whether sibling failures must surface in real time at the originating site.

## Solution approach

Extend the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` to pin the emission timing of sibling always-log notes on `loom-system-note`. The section must establish that each sibling emission surfaces in real time at its originating site (batching across the parent's tool-loop round is not permitted), with V18q's concurrent-sibling tests as the binding behavioural anchor. The relative interleaving order across concurrent sibling origins follows the host JavaScript runtime's event-loop scheduling and is operator-observable; no test asserts a specific cross-sibling interleaving sequence.

## Solution constraints

- Place the new paragraph alongside the existing exactly-once-per-origin rule and the Deduplication and lifetime rules; do not relocate or reword the existing paragraphs in the section.
- The `ActiveInvocationRegistry` entry-shape change, the `RuntimeEvent` `invocation_id` wire field, the dedup-key widening, and the cancelled-by-session-shutdown details change are owned by T19a, T19b, T19c, and T19d respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19d — Populate cancelled-by-session-shutdown details with invocation_id

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` pins the per-invocation `finally`'s `loom/runtime/cancelled-by-session-shutdown` emission as the teardown-time operator-visibility surface, currently populating `details.event.reason` (read from the registry entry's `shutdownReason`) and `details.event.loom` (read from the registry entry's `loom`). Sibling T19a extends `ActiveInvocationRegistry` entries with an `invocationId` field and sibling T19b adds `invocation_id` to `RuntimeEvent`, but the cleanly-cancelled per-invocation note has no spec rule pinning that `details.event.invocation_id` is populated. Without it, cleanly-cancelled concurrent siblings of the same loom collapse onto the same operator-stream row at teardown even after the registry source and wire field exist. The `loom/runtime/cancelled-by-session-shutdown` row in `docs/spec_topics/diagnostics.md` and the nesting convention under `id="session-shutdown-details-conventions"` in the same file inherit the same gap on the diagnostics-side surface.

## Solution approach

Extend the `Per-invocation operator visibility (clean-cancel path)` rule under `id="session-shutdown-semantics"` in `docs/spec_topics/pi-integration-contract.md` to pin that the per-invocation `finally`'s `cancelled-by-session-shutdown` emission populates `details.event.invocation_id` by reading the registry entry's `invocationId` field (the same channel by which `details.event.loom` is read), not by re-deriving an id at the emission site. Mirror the addition in the `loom/runtime/cancelled-by-session-shutdown` row of `docs/spec_topics/diagnostics.md` and in the nesting-convention paragraph under `id="session-shutdown-details-conventions"` in the same file if and only if those locations enumerate the `details.event` field set; otherwise carry no diagnostics-side enumeration drift.

## Solution constraints

- Source `details.event.invocation_id` from the `ActiveInvocationRegistry` entry's `invocationId` field on the per-invocation `finally` (the same channel by which `details.event.loom` is read); do not re-derive an id at the emission site and do not introduce a parallel id channel.
- Preserve the existing `details.event.reason` clauses (the `"quit" | "reload" | "new" | "resume" | "fork" | string` type pin, the four captured-value cases under the **Unknown-reason rule**, the `"<unreadable>"` sentinel rules including the post-deadline residual-gap arm) and the `details.event.loom` clause textually unchanged.
- The `ActiveInvocationRegistry` entry-shape change, the `RuntimeEvent` wire-field addition, the dedup-key widening, and the real-time timing paragraph are owned by T19a, T19b, T19c, and T19e respectively.
- Do not introduce a new diagnostic code or `details.kind` discriminator.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child reads the registry entry T19a defines).
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve.
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19c — Widen always-log dedup key to include invocation_id

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` pins the cascade-twin dedup tuple as `(kind, query_site, message, occurred_at)`, and rule PIC-1 (g) under `id="pic-1"` in the same file restates the same four-field tuple. The tuple has no per-invocation discriminator, so two same-loom sibling invocations whose always-log emissions stamp the same `kind`, `query_site`, `message`, and `occurred_at` collapse into a single dedup-equivalent occurrence even though they originated in distinct invocations. Sibling T19b adds an `invocation_id` field to the `RuntimeEvent` payload that this dedup rule could discriminate on, but the dedup tuple itself does not yet read that field.

## Solution approach

Widen the dedup tuple stated in the **Deduplication and lifetime rules** sub-block of the **Runtime event channel** section in `docs/spec_topics/pi-integration-contract.md` from `(kind, query_site, message, occurred_at)` to `(invocation_id, kind, query_site, message, occurred_at)`, and pin that the always-log channel is session-flat at the wire level while the dedup key is per-invocation. Mirror the same widening in rule PIC-1 (g) under `id="pic-1"` so the two enumerations of the dedup tuple in the same file remain identical. The widening reads the wire field that sibling T19b installs; do not re-author that field here.

## Solution constraints

- Both occurrences of the dedup tuple in the file (the consumer-deduplication clause inside **Deduplication and lifetime rules**, and the restatement in rule PIC-1 (g) under `id="pic-1"`) must be updated together — leaving them divergent is forbidden.
- Preserve the existing four field names (`kind`, `query_site`, `message`, `occurred_at`) verbatim and in their existing order; do not rename, drop, or reorder them.
- Preserve the cascade-twin clause (two emissions sharing the tuple collapse to one occurrence; re-emissions copy the originating instance verbatim including `occurred_at`) and the panic-emission `display: false`-not-applicable clause unchanged apart from the tuple replacement itself.
- The `ActiveInvocationRegistry` shape change, the `RuntimeEvent` wire-field addition, the cancelled-by-session-shutdown details change, and the real-time timing paragraph are owned by T19a, T19b, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve.
- T19b "Add invocation_id field to RuntimeEvent payload declaration" — co-resolve (this child reads the field T19b adds).
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

---

# T19b — Add invocation_id field to RuntimeEvent payload declaration

**Kind:** error-model
**Importance:** high
**Atomicity:** atomic
**Shape:** single
**State:** reduced

## Problem

The `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`, introduced by the sentence pinning the shape as "normative and additive-only", carries no per-invocation correlation field. Sibling T19a sources an `invocationId` from the `ActiveInvocationRegistry` entry, but the wire payload has no destination for that value, so operator-side consumers of the always-log channel cannot distinguish concurrent-sibling emissions from the same loom. T19c's dedup-key widening and T19d's cancelled-by-session-shutdown details population both read this field and require it to be present on the wire shape.

## Solution approach

Add a required `invocation_id: string` field to the `type RuntimeEvent = { ... }` declaration in the **Runtime event channel** section of `docs/spec_topics/pi-integration-contract.md`. Rely on the existing "normative and additive-only" sentence above the declaration to characterise the addition; do not re-author that contract note here. Do not edit the surrounding prose, the dedup-tuple statements, or any sibling-owned surface.

## Solution constraints

- Preserve every existing `RuntimeEvent` field (`kind`, `code`, `loom`, `query_site`, `message`, `attempts`, `tokens_used`, `masked`, `occurred_at`) verbatim — same name, type, optionality marker, inline comment, and order.
- The `ActiveInvocationRegistry` entry-shape change, the dedup-tuple widening, the cancelled-by-session-shutdown details addition, and the sibling timing paragraph are owned by T19a, T19c, T19d, and T19e respectively.
- Do not introduce a new diagnostic code, `details.kind` discriminator, aggregation surface, or storm-detection layer.

## Relationships

- T19a "Extend ActiveInvocationRegistry entry shape with invocationId" — co-resolve (this child consumes the field T19a sources).
- T19c "Widen always-log dedup key to include invocation_id" — co-resolve.
- T19d "Populate cancelled-by-session-shutdown details with invocation_id" — co-resolve.
- T19e "Add real-time sibling emission timing paragraph" — co-resolve.
- T20 "Resource exhaustion under concurrent subagent invocations is undisclaimed for non-memory classes" — same-cluster.
- T18a "Append success-side null-policy paragraph to PIC Runtime event channel" — must-precede.
- T15a "Reduce Session-model Orientation paragraph to a four-sentence forward-linking bullet" — same-cluster.

