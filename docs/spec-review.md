# Triaged Spec Review - spec.md

_Generated: 2026-06-06T13:23:32Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T118) is addressed first; the first finding (T001) is addressed last._

_Triage tally: 0 blockers, 15 high, 48 medium retained; 91 low discarded; 0 low findings merged into 0 medium findings; 17 nit dropped; 0 false dropped._

_(Updated 2026-06-07: T064 "Ceiling #1 and ceiling #2 positive enforcement obligations carry no REQ-IDs" resolved and removed — GOV-1 dual-form REQ-ID anchors were coined at the three unanchored enforcement sites: `INV-4` on the `**Invocation depth bound.**` paragraph in `invocation.md` (covering ceiling #1 bound + surface), `FRNT-1` on the `tool_loop` field bullet in `frontmatter/frontmatter-fields-b-and-templates.md` (ceiling #2 bound), and `ERR-19` on the `ToolLoopExhaustedError` prose line in `errors-and-results/queryerror-variants.md` (ceiling #2 surface). The ceiling #1 / #2 aggregator entries in `spec/overview-and-orientation.md` were repointed from page-level / heading-slug auto-id links to the new `#inv-4` / `#frnt-1` / `#err-19` anchors, and the first-enforcement-point listing in `hard-ceilings.md` was repointed to `#inv-4` / `#err-19`. The ceiling-set-invariants citation in `hard-ceilings/ceilings-3-and-4.md` was left unchanged — it names the ceilings by routing-class description, not by obligation anchor, and carries no GOV-25-prohibited auto-id, so it is out of the Problem's scope. New IDs allocated under already-registered prefixes per GOV-3 (`INV-4`, `FRNT-1`, `ERR-19`); no new prefix coined.)_

_(Updated 2026-06-07: T052 "Item (e)/(r) `dist/*.js` baseline source unspecified — diff is unperformable after the candidate install" resolved and removed — a *Baseline acquisition* paragraph (anchor `#bump-baseline-acquisition`) was inserted into item (e) of `pi-integration-contract/version-bump-step2.md`, specifying that the contributor materialises the loom 1.0 Pi-SDK pin's `dist/*.js` tree via `npm pack @earendil-works/pi-coding-agent@<pinned-version>` into an ephemeral scratch directory (the canonical "from" side), with the post-step-1 `node_modules` candidate tree as the "to" side, and the ordering constraint that acquisition run before step 1's candidate install (or carry the explicit `@<pinned-version>` specifier if ordered after). Items (e) and (r) now cite the paragraph by anchor instead of restating the baseline source. No REQ-ID coined — the step-2 audit checklist carries no per-item REQ-IDs.)_

_(Updated 2026-06-07: T049 "`diagnostic-emission-isolation.md` opening scope omits the per-invocation surfaces the paragraph actually governs" resolved and removed — the opening sentence of the diagnostic-emission-isolation paragraph in `pi-integration-contract/diagnostic-emission-isolation.md` was rewritten to declare the three teardown-time `console.error` site classes the body actually governs: (a) the five `session_shutdown` teardown-handler codes, (b) the per-invocation `loom/runtime/cancelled-by-session-shutdown` emission from the per-invocation `finally`, and (c) the terminal `console.error` of the per-invocation `sendSystemNote` fallback chain; a closing sentence notes the subsequent clauses apply to all three classes except where a clause explicitly narrows (*Construction-site wrap* → two nested-shape codes; *Pi-side stdio visibility*'s `sendSystemNote` sentence → single site). Body, anchors (`#diagnostic-emission-isolation`, `#pic-emission-swallow`, `#pic-emission-visibility`), and the single MUST budget left unchanged. No REQ-ID coined — this is a non-narrative-prose opening-sentence scope correction, not a new defining obligation site.)_

_(Updated 2026-06-07: T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" resolved and removed — dual-form HTML anchors `<a id="hc3-a"></a>`…`<a id="hc3-e"></a>` were added to the `**HC3-a.**`–`**HC3-e.**` bullets in `hard-ceilings/ceilings-3-and-4.md` per GOV-16's *GOV-1 dual-form layout applies* clause, and the three `HC3-a` / `HC3-b` / `HC3-c` cross-links in `binder/determinism-cancellation-failure.md` were repointed from `overview-and-orientation.md#hard-ceiling-3` to `ceilings-3-and-4.md#hc3-a` / `#hc3-b` / `#hc3-c`. The `<a id="hard-ceiling-3"></a>` aggregator anchor on `overview-and-orientation.md` was left unchanged per the out-of-scope constraint. No REQ-ID or inline-label prefix coined.)_

_(Updated 2026-06-06: T099 "`loom/load/callee-has-errors` promises codes via `related`" resolved and removed — the `code-registry-load.md` row and the `invocation.md` Static resolution paragraph were walked back so neither promises the callee's diagnostic *codes* via `related`; both now state that `related` carries one entry per underlying error *site* (`{ file, range, message }` per `diagnostic-shape.md`), with the callee's own diagnostics emitted separately. No change to `diagnostic-shape.md` or the closed `related` element shape.)_

_(Updated 2026-06-07: T081 "Filesystem case-sensitivity is unspecified for `.warp` import basenames and for the `invoke` / `tools:` discovery-root containment check" resolved and removed — `imports.md` IMP-1 now pins `.warp` import resolution to a byte-for-byte (UTF-8, case-sensitive) match of the path literal's final segment against `readdir` output on every host, composed with the byte-exact extension check, with `loom/load/unresolvable-warp-path` covering the case-variant-entry case (registry row tightened to match); `invocation.md` *Resolution* now pins the discovery-root containment comparison to byte-exact `FileSystem.realpath` output for both callee and roots with no independent case-folding, governed by the existing INV-1 MUST across the load-time and runtime-open checks. The case-folding clause attaches to the existing "lie within the union of discovery roots" language and composes with (does not define) the still-pending T080 segment-boundary predicate. No new diagnostic code or REQ-ID; `loom/load/invoke-path-escape` left unchanged.)_

_(Updated 2026-06-07: T077 "Top-level loom return-type inference does not reconcile early-`return` operand types with the tail-expression type" resolved and removed — `functions.md` `#loom-return-type` now infers the return type as the least upper bound (under type-system.md `#type-compatibility` `⊑`) of the tail-expression type and every reachable early-`return` operand type, with the implicit `Result<T, QueryError>` wrapping triggered when any `?` appears or any contributing operand is `Result`-typed and `T` reconciled over the contributing operands' success payloads; the same rule governs annotation-less `fn` bodies. `return.md`'s `return expr` bullet now forwards to that rule for the no-declared-return-type case, and a sibling diagnostic `loom/parse/return-no-common-type` was added to `code-registry-parse.md` alongside `loom/parse/array-no-common-type`. The existing `⊑` rules for `match` arms, ternary branches, and array literals were not modified. No new REQ-ID coined: the edit adds no RFC-2119 normative-modal token, so GOV-22 progressive coinage does not trigger.)_

_(Updated 2026-06-07: T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" resolved and removed — an *Authoritative source* pointer was added to each enumerated unpinned-presupposition paragraph that previously cited only the type surface: `host-interfaces-core.md` (`#messages-chronological-order-presupposition`), `registration-steps.md` (`#getcommands-completeness-presupposition`, `#register-tool-post-startup-presupposition`), `provider-error-mapping.md` (`#provider-overflow-wording-presupposition`), `host-prerequisites.md` (`#model-registry-population-presupposition`, `#settings-write-back-preservation-presupposition`), `host-interfaces-services.md` (`#cwd-project-root-presupposition`), `subagent.md` (`#dispose-mid-abort-presupposition`), and `conversation-drive.md` (`#complete-forced-tool-presupposition`, `#complete-retry-and-cancellation-presupposition`). Each pointer names the observed implementation file/symbol at the loom 1.0 Pi-SDK pin (`@earendil-works/*` `dist/**`) or, for provider-owned overflow wording, the per-provider API error-format docs plus the captured-error-body fixture corpus; every `dist/**` citation carries the established **known-fragile evidence** flag routing textual-diffability failure to the version-bump recovery path. Following the snapshot/restore and `#custom-message-context-entry-presupposition` precedents, which were left untouched per the finding's out-of-scope constraint. The Solution approach's checklist-mirroring and head-of-checklist-rule additions were not taken (existing `version-bump-step2.md` checklist items already forward-link to each paragraph; no new MUST authored). No REQ-ID or diagnostic code coined.)_

_(Updated 2026-06-07: T078 "SLSH-5 `<parent_path>:<line>` is defined only for `invoke(...)` call sites, not for `.loom`-callable bare-identifier calls" resolved and removed — `slash-invocation.md` SLSH-5's `<line>` definition now sources the line from the call-site token that produced the `invoke_callee` hop for either syntactic form — the `invoke(` token of a literal `invoke(...)` expression, or the callee-name identifier of a `.loom`-callable bare-identifier call — with `<callee_path>` for the bare-identifier form taken from the parent's Resolution snapshot, and a new `.loom`-callable worked example added beside the existing Single-hop/Multi-hop bullets. The model-driven `@`-query tool-call surface is explicitly excluded (it feeds failure back as a tool-error result, not an `invoke_callee` cascade). No new REQ-ID; the SLSH-5 anchor and umbrella MUST were left as-is.)_

_(Updated 2026-06-07: T079 "SLSH-4 template cells and SLSH-5 worked examples disagree on whether inline backticks are emitted" resolved and removed — `slash-invocation.md` SLSH-4 prose now states that the inline backticks in the `System note shape` cells are Markdown code-span formatting and are not part of the emitted string (renderers emit the cell text with the surrounding backticks removed), matching the backtick-free SLSH-5 worked examples; the stripping is scoped to the template text so backticks arriving inside an interpolated placeholder pass through unchanged. No new REQ-ID; the SLSH-4 table rows and SLSH-5 examples were left as-is.)_

_(Updated 2026-06-07: T074 "TYPE-8 field-wise compatibility scope (named schema vs inline object type) is ambiguous" resolved and removed — `type-system.md` TYPE-8 is now scoped to inline object types (`ObjectType`) only; a new TYPE-10 (REQ-ID coined per GOV-22 under the registered `TYPE` prefix) pins named schemas as nominal — a `NamedType` resolving to an object schema participates in `⊑` only via TYPE-1 (same named schema), TYPE-4 (variant-to-union), and TYPE-5/TYPE-6 (union membership); cross-form (named-vs-inline) and cross-named-schema pairs are `⋢` regardless of field shape and surface as the offending site's existing `loom/parse/*-type-mismatch` diagnostic. The *Operational definition* paragraph was qualified so AJV-validation is a necessary, not sufficient, condition: the parser's nominal rejection is authoritative even when the lowered fragments are AJV-interchangeable. The optional new `loom/parse/named-schema-inline-object-mismatch` code was not added (folded under the existing mismatch family per optional-action discipline); no diagnostics-registry edit was needed since the parse rows already cite `#type-compatibility`.)_

_(Updated 2026-06-07: T010 "`==` semantics are authoritative on `runtime-value-model.md` but `expressions.md` Equality neither restates nor links them" and T073 "Cross-type `==` / `!=` disposition is unspecified" resolved together (co-resolve cluster) and removed — `expressions.md` § Equality is upgraded from a one-sentence body to a stub-with-link that names `==` as structural, teases the `NaN == NaN` / `+0 == -0` refinements with an on-page contrast to the `NaN` ordering rule, states the cross-type disposition, and forward-links the full rule to `runtime-value-model.md#equality`; `runtime-value-model.md`'s `**Equality (`==`).**` block gains a general cross-type rule before the per-shape bullets (`==` / `!=` admit any two static types and evaluate to `false` / `true` when the types share no common structural ground; loads and runs, never parse-rejects or panics) plus a back-reference from the primitives bullet to `expressions.md` § Ordering comparisons for the asymmetric `NaN` ordering. No diagnostic code added (the registry is closed under GOV-7/GOV-8); the `loom/parse/non-orderable-operands` suggestion to "use `==` / `!=` for other types" stays correct but is no longer load-bearing on parse-rejection semantics. No new REQ-ID coined — both pages are pre-REQ-ID-backfill (zero EXPR/RVM anchors), so GOV-22 progressive coinage defers to those pages' one-shot backfill pass per the transitional rule.)_

_(Updated 2026-06-07: T071 "Canonical hash recipe cites keywords the lowered subset never emits (`default`, `minLength`, `maxItems`)" resolved and removed — `schema-subset.md` *Canonical schema hash* step 2 ("Canonical form") numeric-literal sub-bullet now names only `const` and `enum` as numeric-literal positions (dropping the runtime-filled `default` surface-syntax feature the binder never lowers), and the trailing sentence claiming `minLength`/`maxItems` are the subset's integer-valued structural keywords was deleted (the top-of-file enumeration rejects all such keywords at parse time, so the lowered fragment contains none). The BNDR-4 / BNDR-5 / BNDR-6 cross-reference and the echo-formatter borrow carve-out — whose `(default)` mention names the binder echo-side tag, not a JSON Schema `default` keyword — were preserved. No new REQ-ID; no diagnostic change.)_

_(Updated 2026-06-07: T076 "Language-core hidden assumptions: enum-tag sidecar, AJV-config silence, Markdown-by-providers claim" resolved and removed — three independent edits landed. (1) `descriptions.md`'s `///`-rule "Markdown" bullet was demoted: the normative claim about provider rendering became a `No transformation.` bullet pinning loom's byte-for-byte emission, with the provider-Markdown observation moved to a `*(Non-normative provenance.)*` tail. (2) `schema-subset.md`'s Draft bullet gained a clarifying sentence binding "validates" / "is accepted by the validator" prose to JSON Schema 2020-12 semantics (lowered schemas evaluated under that draft by loom and any conforming validator); phrased without a new RFC-2119 modal to avoid a GOV-22 progressive-coinage trigger on a page that carries no REQ-ID anchors (pre-backfill). (3) A per-position *Named-enum positions* sidecar was added to `schema-subset.md` Lowering Algorithm step 5 (now "Per-schema sidecar" with two maps) and consumed by `runtime-value-model.md`'s inbound Wire-name translation bullet, giving enum-tag reattachment a machine-readable input that distinguishes named-`enum` positions from anonymous string-literal unions. The originating finding's third proposed edit-half — reframing `type-system.md`'s `⊑` operational definition against the PIC-11 `SchemaValidator` seam — was deferred per the finding's own coordination clause: the corpus is uniformly AJV-phrased and the seam reframing must land with the corpus-wide AJV→seam rewrite, which is not queued in this dispatch. No new REQ-ID coined; no RFC-2119 modal was added, so GOV-22 progressive coinage does not trigger.)_

_(Updated 2026-06-06: T085 "Mid-loom Pi-extension hot-reload: held closure invocation has no contracted outcome" resolved and removed — the last Resolution-snapshot consequence bullet in frontmatter-fields-b-and-templates.md was rewritten to replace the "out of loom 1.0 scope" dismissal with a positive contract: the held `execute` closure is dispatched like any other captured Pi-tool callable, and its failures route through the existing surfaces — catchable throws to `CodeToolError { cause: "execution" }`, non-conforming returns to `loom/runtime/internal-error` (both in tool-calls.md), and host-fatal errors to error-model.md's runtime-panics surface. No new diagnostic code, `loom-system-note` shape, or timeout was introduced; the `/reload` author-guidance sentence was retained.)_

_(Updated 2026-06-06: T102 "`bind_context` project-wide-inheritance parenthetical references a settings carrier that does not exist" resolved and removed — the no-params-bypass parenthetical in binder-bypass-and-envelope.md was corrected to state that `bind_model` may inherit from the project-wide `looms.binderModel` setting while `bind_context` has no project-wide carrier and defaults to `none`. No new settings key, diagnostic, or validation row was added.)_

_(Updated 2026-06-07: T075 "Bare-source backslash: no diagnostic code is named" resolved and removed — a new lex-phase diagnostic `loom/parse/stray-backslash` was registered in diagnostics/code-registry-parse.md for a backslash byte at a source position outside any string literal, path literal, or `@`...`` query-template body; lexical.md's Source-files list gained a **Stray backslash** bullet (carrying the stable `#stray-backslash` anchor) stating the rule and noting loom has no line-continuation marker; grammar.md's Newline-continuation note now names `loom/parse/stray-backslash` and links to that anchor instead of the bare "a parse error" phrasing. `illegal-escape` semantics unchanged. No new REQ-ID coined: code-registry rows and lexical.md carry no co-located REQ-ID anchors (pre-backfill) and the `loom/parse/*` code is itself the stable identifier per DIAG-3; the added row satisfies DIAG-2's same-time landing obligation.)_

_(Updated 2026-06-07: T062 "Patch-skew teardown fixtures and `literals-shape-invalid` sub-cases lack per-observable / per-sub-case fixture enumeration" resolved and removed — two fixture-enumeration obligations landed. (1) `unknown-reason-rule.md`'s four-sub-case `literals-shape-invalid` enumeration now requires a conformance suite to cover each of sub-cases (1)–(4) with its own fixture (synthetic snapshot exhibiting exactly that defect, asserting exactly one `loom/host/session-shutdown-pinned-constant-unreadable` with `details.failure === "literals-shape-invalid"` and no `loom/host/session-shutdown-reason-unknown`), reusing the (P-b)/(P-c-1) static-import-preserving substitution mechanic. (2) `patch-skew-degradation.md`'s (P-a)/(P-b-1)/(P-c-1) fixtures now pin that "the full five-sub-step teardown still runs" requires asserting each of the eight `details.call` call sites in the **Per-step isolation** closed set ran (via injected `LoomRegistry`/`chokidar`-watcher/`Clock`/signal-listener spies), plus sub-step 2's per-entry `ActiveInvocationRegistry` iteration and sub-step 3's bounded `Promise.allSettled` await (which carry no `details.call` label), with (P-c-1) using a fresh `LoomRegistry` per case. The optional elevation of the four sub-cases to a fifth *Fixture-obligation categories* category, and the optional per-clause lift of the cross-reference, were not taken (optional-action discipline). No new diagnostic code or REQ-ID coined — both pages are pre-REQ-ID-backfill (zero co-located REQ-ID anchors), so GOV-22 progressive coinage defers to those pages' one-shot backfill pass per the transitional rule; the **Per-step isolation** closed `details.call` set and (P-b-1)'s existing no-`reason-unknown` assertion were left unchanged.)_
_(Updated 2026-06-07: T082 "`params:` type-side: grammar reference and named-type resolution rule absent from the owning page" resolved and removed — the `params` prose bullet in frontmatter-fields-a.md gained a **Type side** sub-bullet reciprocating the type-grammar pointers to type-system.md and grammar.md#type-grammar, stating that a `params:` `NamedType` resolves whole-file against body-level `schema`/`enum` declarations and imported `.warp` symbols (so a frontmatter-to-body forward reference resolves), and naming the unresolved-name failure; the new parse-time diagnostic `loom/parse/unresolved-named-type` was registered in diagnostics/code-registry-parse.md. type-system.md and grammar.md were left unedited per the finding's out-of-scope constraint.)_

_(Updated 2026-06-06: T100 "`Diagnostic` envelope contract is unsatisfiable for location-less codes" resolved and removed — `file` and `range` were marked optional on the internal `Diagnostic` shape, a **Location-less diagnostics** paragraph enumerated the closed set of eight location-less codes and pinned the omitted-fields wire form, and the **Serialised content format** rule gained a carve-out dropping the `<file>:<line>:<col>:` prefix for those codes. No change to the `related?` element shape or to the DIAG-4 *Message* rows.)_

_(Updated 2026-06-06: T105 "BNDR-5 mandates shortest-round-tripping fixed-point digits without a derivation recipe" resolved and removed — a non-normative derivation recipe was appended to BNDR-5 in defaulting-system-note-echo.md, describing how to expand `String(n)`'s exponential output into shortest fixed-point form, with BNDR-6r and BNDR-6s as the worked oracle cases.)_

_(Updated 2026-06-06: T103 "Turn-grouping undefined when `SessionContext.messages` begins with non-`user` messages" resolved and removed — a second Pi behavioural precondition (each `AgentMessage[]` delivering surface is non-empty iff its first element is a `UserMessage`) was pinned alongside the existing chronological-ordering presupposition in host-interfaces-core.md, the binder turn-definition gained a forward reference to it, and version-bump checklist item (ag) was added to re-audit it per Pi minor bump. The turn-grouping rule, truncation walk, and BNDR-7 renderings are unchanged.)_

_(Updated 2026-06-06: T095 "ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated" resolved and removed — a **Watcher-time reload failures** definition (page-local anchor `#watcher-time-reload-failures`) was added at the end of "Caching and reload" in package-and-settings.md, pinning ERR-7's trigger set (registry-swap failure + re-emitted load/parse diagnostics, settings re-merge included) and **watcher-event-time** emission, and explicitly excluding the informational structural-change note and the `session_shutdown` teardown-timeout; error-model.md's ERR-7 list item was re-pointed from the `discovery.md` aggregator to that section. discovery-sources.md gained one-sentence `message`-field statements for `loom/load/cross-source-shadow` and `loom/load/cross-format-collision` (no structured `details` payload). The ERR-7 REQ-ID anchor stays in error-model.md; no new REQ-ID was coined.)_

_(Updated 2026-06-06: T108 "Non-Error throws yield `undefined` (or a TypeError) when the runtime extracts `.message`" and T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" resolved together as a co-resolve cluster and removed — a canonical underlying-error coercion was pinned in placeholder-rendering-b.md §6 and a fifth `pi.getCommands()` read-failure bullet was added to the Extension-bootstrap SDK failures enumeration.)_

_(Updated 2026-06-06: T087 "`respond_repair: { methodology: none, attempts: N>0 }` combination behaviour and `ValidationError.attempts` under `methodology: none` are unspecified" resolved and removed — the `none` bullet in frontmatter-fields-b-and-templates.md was made self-contained: a declared non-zero `respond_repair.attempts` is silently ignored under `methodology: none` (loads with no diagnostic, behaves as `attempts: 0`), and the returned `ValidationError.attempts` is `0` on every path that surfaces a `ValidationError` under `methodology: none` (initial AJV failure, depth-walk failure, and the ERR-17 forced-respond branch). The `#err-17` anchor and its sentence in queryerror-variants.md were left in place per GOV-28; no new REQ-ID was coined.)_

_(Updated 2026-06-06: T089 "Opening free-phase turn body unstated for `max_rounds > 0`; `discard_site` value undefined for void-tail discards" resolved and removed — the *Free phase* bullet in query-tool-loop.md now states the runtime issues the opening free-phase user turn carrying the rendered query template body as its sole content, with the `max_rounds: 0` boundary the same dispatch (not a second code path); and the **Observability of discarded results** paragraph in query-escapes-stringification.md now pins `discard_site` to the `let _ =` binding for the expression-statement form and to the tail `@`...`` expression (its start, for multi-line spans) for the void-tail-function form. No new IDs, MUSTs, or runtime-event fields.)_

_(Updated 2026-06-06: T066 "README links to a non-existent docs/spec-sweeps.md" resolved and removed — a README/tracking-doc finding outside the spec corpus; the README Status paragraph was rewritten to drop the dangling docs/spec-sweeps.md link.)_

_(Updated 2026-06-06: T033 "Binder clarity nits: placeholder mismatches, undefined block delimiter, ambiguous dash-clause, missing "or" in no-params bullet" and T104 "BNDR-7's "next blank line of the surrounding system prompt" presupposes framing the eight system-prompt blocks neither pin" resolved together as a co-resolve cluster and removed — *System-prompt structure (normative)* item 6 in binder-bypass-and-envelope.md now pins the Session-context block's exact byte framing (opening line + `\n` + body + a terminating blank line, ending `\n\n`, emitted regardless of block position), the BNDR-7 umbrella in binder-model-and-context.md now bounds each rendering body at "the terminating blank line that closes the block per item 6" instead of "the next blank line of the surrounding system prompt", and the four sibling clarity nits were fixed: the failure-mode-templates intro and rule 5 now name `<model's message>` (dropping the non-existent `<candidates>`/`candidates:` references), BNDR-2/BNDR-3 cite `<model's message>` to match the table, the determinism variable-inputs sentence was split off from the fixed-footprint clause, and `or` was inserted in the no-params bypass bullet.)_

_(Updated 2026-06-06: T107 "Hot-reload recovery note over-promises `/reload` success without a failed-re-reload contract" resolved and removed — the `recovery.looms` membership predicate on the binder-model hot-reload paragraph was pinned to prior `loom/load/binder-model-unresolved` failure plus binder-model re-resolution alone, the `<names>` template framing was narrowed from "can now load" to "now resolve a binder model", and the still-fails disposition was stated as surfacing through the loom's own `loom/load/*` diagnostic.)_

_(Updated 2026-06-06: T113 "`ActiveInvocationRegistry` entry shape omits the `disposeBarrier` resolver" resolved and removed — `active-invocation-registry.md` repointed five stale "below" cross-references to their owning pages and pinned the `disposeBarrier` resolver as closure-held with the five-field entry shape unchanged.)_

_(Updated 2026-06-06: T110 "`CodeToolError` ≡ `QueryError{kind:"code_tool"}` equivalence and `loom-direct:` toolCallId UUID form are both under-specified" resolved and removed — `host-interfaces-core.md` §**Tool execution from loom code** now states the `CodeToolError` ≡ `QueryError{kind:"code_tool"}` equivalence inline at the `isError` lowering paragraph. The `loom-direct:` toolCallId form/uniqueness/minting-path obligation (Step 2) was deferred to the live T096↔T097 co-resolve cluster, which owns that toolCallId-bullet edit surface.)_

_(Updated 2026-06-06: T092 "Glob `!`/`+`/`-` precedence and matcher engine unspecified for `pi.looms` / `loomPaths`" resolved and removed — DISC-5 in discovery/package-and-settings.md now pins loom's own matching contract on the discovery surface: the `minimatch` glob engine (referenced to Pi's `applyPatterns` in `@earendil-works/pi-coding-agent`, pinning loom's *use* not minimatch's dialect), `nocase` off, the empty-include "everything under root" start, the four-step override order (plain includes → `!` → `+` → `-`, with `-` final over `+`), and the exact-path treatment of `+`/`-` operands (referencing `matchesAnyExactPattern`). The `loomPaths` "Glob patterns and exclusions" bullet's "not a special snowflake" sentence was replaced with a cross-reference to DISC-5. No new REQ-ID coined (folded under the existing `disc-5` anchor); no edits elsewhere.)_

_(Updated 2026-06-06: T098 "Three testability gaps in tool-calls / cancellation: pre-eval-throw `<name>` token, missing non-resolvable `.loom` arg-mismatch surface, and unspecified cancelled `message`" resolved and removed — cancellation.md's Surfacing block dropped the literal `message: "..."` for the sibling field-elision `...` form and noted `message` carries no byte-exact constraint; tool-calls.md's pre-evaluation setup-throw bullet pinned `<name>` as the post-`as`/post-hyphen-rewrite callable-set entry (deliberately not the slash-prefixed `/<name>` framing); and the non-statically-resolvable `.loom`-callable input-validation safety net was routed to `Err(InvokeInfraError { cause: "validation", ... })` in both the Argument shape and Failures paragraphs, with the dual-`match`-arm consequence stated. No schema change in queryerror-variants.md.)_

_(Updated 2026-06-07: T059 "Item (e) recovery over-prescribes \"mutex\"; N/A definition and outcome-recording conventions buried mid-paragraph" resolved and removed — two independent edits to item (e) in version-bump-step2.md. (A) The fail-outcome recovery clause no longer mandates a "mutex" as the construct: it now requires a per-extension-instance serialisation of the snapshot → swap → body → restore window, names the per-extension-instance mutex as the loom 1.0 reference construct, and states that any synchronisation construct establishing the precondition (b) non-overlap property (async-aware lock, single-consumer awaited queue, channel, or equivalent of the pass-arm variants) is equally conformant; the keying-granularity prose and the recovery-serialisation runtime-contract cross-reference were preserved (the sibling tool-registration-lifetime.md, read-only here, retains the "recovery-mutex runtime contract" anchor and naming). (B) Item (e)'s `N/A` definition and the two-sub-outcome recording convention were lifted out of item (e)'s fail-trigger wall-of-prose into a discoverable anchored "Outcome recording conventions" block (`#bump-step-2-outcome-recording-conventions`) carrying the relocated (e.i)/(e.ii) anchors; item (e) now forward-references that block. No new REQ-ID coined.)_

_(Updated 2026-06-07: T083 "Stop-reason → `QueryError` variant mapping is undefined" resolved and removed — provider-error-mapping.md gained a **Stop-reason classification** subsection (anchor `stop-reason-classification`) mapping a successful HTTP-200 response's non-terminal stop reason by `AssistantMessage.stopReason`: an output-boundary terminator (`stopReason: "length"`) → `ContextOverflowError` with both token fields `null`, and any other non-terminal stop reason (incl. content-filter) → `TransportError` with `retryable: false`. The ambiguous "surface as `transport` or `context_overflow` per the existing classification rules" clause in query-tool-loop.md's "Typed queries are tool-loop-shaped" section was replaced with a forward-reference to that subsection, and query-failure-and-repair.md's "Detection of `ContextOverflowError`" co-located the clean-`length` terminator beside the mid-stream output-boundary rule. The T084 4xx/5xx `TransportError` catch-all rewrite was left out of scope.)_

---

# T001 - `tag-transition predicate` and `diagnostic-emission predicate` are coined, multi-page terms missing from the glossary

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/glossary.md` carries no entry for either *tag-transition predicate* or *diagnostic-emission predicate*, two coined PIC terms whose canonical definitions live in `session-only-degraded-state.md`'s *Predicate split* section and that are reused load-bearingly across SM-5, SM-6, and `drain-state-contract.md`. Both terms meet the glossary's own intake rule ("Add new entries here when the spec coins a new term that is reused on more than one page"). The two predicates differ only by the snapshot-success conjunct (`pinnedConstantReadOk`) that gates the diagnostic-emission predicate but not the broader tag-transition predicate, so a reader who meets either name on a page that defines neither has no alphabetised lookup path and risks conflating them.

## Solution approach

Add a glossary entry for each predicate at its alphabetical position in `docs/spec_topics/glossary.md` (*diagnostic-emission predicate* under d, *tag-transition predicate* under t), each a descriptive reminder that names the `pinnedConstantReadOk` snapshot-success conjunct as the sole factor distinguishing the narrower diagnostic-emission predicate from the broader tag-transition predicate. Carry a `See:` link in each entry to the canonical owner `session-only-degraded-state.md#session-only-reason-degraded-state`, matching the link form SM-5/SM-6 already use.

## Solution constraints

- The two new entries MUST be descriptive-only — no `MUST`/`SHOULD` term-usage prescription — consistent with the glossary page's descriptive-only header (the concern T002 addresses).

## Relationships

- T002 "Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer" - decision-overlap (constrains the wording of the two new entries: they MUST be descriptive-only, with no `MUST`/`SHOULD` term-usage prescription, consistent with the resolution of that finding)

# T002 - Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer

**Original heading:** Glossary entries carry normative MUST term-usage prescriptions inconsistent with the descriptive glossary header
**Original section:** docs/spec/overview-and-orientation.md, docs/spec/language-and-architecture.md, docs/spec/session-model-and-appendix.md, docs/spec_topics/overview.md, glossary.md (orientation / aggregators)
**Kind:** placement (shard-01)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`docs/spec_topics/glossary.md` opens with a header that declares the page descriptive only: *"Each entry is descriptive — a one-paragraph reminder of what a term means and where it is used. The canonical, normative definition lives on the feature page named in the entry's `See:` reference; if a glossary entry and its canonical page disagree, the canonical page wins."* Three entries on the same page then carry capitalised MUST prescriptions that bind authors and implementers to a specific term and forbid named synonyms:

- `callable set` — *"Authors and implementers MUST use the term `callable set` (or, with an explicit scoping modifier, `frontmatter callable set` / `loom's declared callable set`) … the bare phrases `tools: set`, `tool set`, `loom's tools`, and `available tools` are spec-prose synonyms to be avoided …"*
- `schema slug` — *"Authors and implementers MUST use `schema slug` (or the bare form `slug` when context is unambiguous). The synonyms `schema hash`, `schema-hash`, `sha12`, `lowered-schema hash`, and `lowered-schema content hash` are spec-prose drift to be avoided; a future grep gate uses this entry as its source of truth."*
- `Pi tool` vs. `.loom callable` — *"Authors and implementers MUST use the canonical term `.loom callable` … the synonyms `registered loom`, `registered subagent loom`, `registered-loom call`, and `loom callee` are spec-prose drift to be avoided."*

These are not "reminders of what a term means" — they are normative authoring/grep-gate rules, and at least one of them explicitly names *this glossary entry* as the source of truth for an automated check ("a future grep gate uses this entry as its source of truth"). The contradiction is two-way: on the *callable set* and `.loom callable` rows, the canonical feature pages named under `See:` (`frontmatter/frontmatter-fields-a.md`, `tool-calls.md`) carry no corresponding MUST and no avoid-list — so the glossary's "canonical page wins" disclaimer would silently nullify the prescription. On the *schema slug* row, `schema-subset.md` (the canonical page) does carry an avoid-list — *"the synonyms … are drift to be avoided"* — but defers normative pinning back to the glossary: *"the [Glossary](./glossary.md) entry pins the avoid-list."* That circular delegation means there is currently no page on which an implementer can find a normatively-owned term-usage rule that satisfies the page's own self-declared layering.

## Spec Documents

- `docs/spec_topics/glossary.md` — entries `callable set`, `schema slug`, `Pi tool` vs `.loom callable`, plus the page header (edited)
- `docs/spec_topics/frontmatter.md` / `docs/spec_topics/frontmatter/frontmatter-fields-a.md` — `tools` section (edited)
- `docs/spec_topics/schema-subset.md` — Canonical schema hash section (edited; already carries the avoid-list, gains a MUST and loses the back-delegation to glossary)
- `docs/spec_topics/tool-calls.md` — opening prose (edited)
- `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md` — uses `callable set` and `schemaSlug` (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's `plan.md` has no leaves authored yet — every phase section reads "No leaves yet — author per the template." No coverage matrix entries reference the affected pages.)

## Consequence

**Severity:** advisory

A contributor following the glossary header literally would treat all three MUSTs as non-binding ("canonical page wins") and write `tool set`, `schema hash`, or `loom callee` in new prose; a contributor reading the entries literally would treat them as the binding source of the avoid-list. The future grep gate the *schema slug* entry promises ("a future grep gate uses this entry as its source of truth") would also be implemented against a page the spec itself declares non-normative, undermining its authority on the first push-back.

## Solution Space

**Shape:** single
**State:** reduced

Push each MUST term-usage rule onto its canonical feature page and rewrite the glossary entries as descriptive pointers, honouring the glossary's own "canonical page wins" layering rule. For each of the three governed terms, the canonical feature page named in the glossary entry's `See:` reference grows a "Terminology" sub-paragraph carrying the MUST and its avoid-list verbatim; the glossary entry becomes a one-sentence descriptive reminder (e.g. "called *callable set* in spec prose; see the canonical page for the term-usage rule and the avoid-list of disallowed synonyms") with no MUST and no avoid-list.

### Spec edits
- `frontmatter/frontmatter-fields-a.md` `tools` section: add a "Terminology — *callable set*" sub-paragraph carrying the MUST plus the avoid-list `{ tools: set, tool set, loom's tools, available tools }`.
- `schema-subset.md` Canonical schema hash section: replace *"the [Glossary](./glossary.md) entry pins the avoid-list"* with the MUST and avoid-list inline; this becomes the grep gate's source of truth.
- `tool-calls.md` opening prose (or a new sub-section): add the MUST for `.loom callable` plus the avoid-list `{ registered loom, registered subagent loom, registered-loom call, loom callee }`.
- `glossary.md`: strip the three MUST clauses and avoid-lists from the three entries; leave a one-sentence pointer to the canonical page in each.

Rationale: each term's canonical page already exists and is the right owner for its term-usage MUST, co-locating each rule with the concept that motivates it so the avoid-list is encountered in context; this removes the circular delegation on the `schema slug` row without adding a new governance page.

### Edge cases
- The `schema-subset.md` Canonical schema hash section already says *"the [Glossary](./glossary.md) entry pins the avoid-list"* — that sentence MUST be removed in the same edit that adds the inline MUST, otherwise the circular delegation survives.
- The *schema slug* entry promises a future grep gate uses the glossary entry as its source of truth; if that grep gate ships it must be re-pointed at `schema-subset.md`.
- Keep the avoid-list wording byte-identical when moving it, so any out-of-tree grep or `pi-loom` lint over the existing glossary text continues to match.
- Term-usage rules now live on three feature pages with no single index; the avoid-list shape is currently uniform across the three and can silently diverge under independent edits — keep the three shapes aligned when editing any one.

## Relationships

None

---

# T003 - `respond-repair` sole-repair-mechanism scope claim has no normative home

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The `respond-repair` glossary entry asserts that the response-repair loop "is the only 'repair' mechanism the spec defines" — a language-wide exclusivity boundary that forbids ad-hoc repair behaviour (implicit coercion on validation failure, automatic retry on tool errors, rollback after a malformed turn) at any other failure boundary. The glossary header declares its entries descriptive and stipulates the canonical page wins on disagreement, so this exclusivity claim has no normative carrier. No other page restates it as an exclusivity rule: the PIC, error-model, and query pages each describe respond-repair's behaviour without claiming it is the sole repair primitive. Two implementers can therefore ship compliant loom 1.0 runtimes while disagreeing on whether other "small" repair behaviours are permitted.

## Solution approach

Add a normative paragraph under `## Schema-validation respond-repair` in `query/query-failure-and-repair.md`, carrying a stable anchor, stating that respond-repair is the only repair mechanism loom 1.0 defines and that the runtime performs no other implicit repair, coercion, retry, or rollback at any other failure boundary; enumerate the failure boundaries the rule spans (validation failures outside the typed-query response, tool-call errors, transport failures, panic recovery, history rollback) so the rule is mechanically checkable. Rewrite the `respond-repair` glossary entry's exclusivity sentence as a forward-link to that anchor.

## Solution constraints

- Out of scope: the `array<T>.join` "no implicit type conversion" entries at `expressions.md` and `diagnostics/code-registry-parse.md` remain as specific diagnostic-table entries — do not deduplicate them against the new general rule.

## Relationships

- T002 "Glossary entries carry normative MUST term-usage rules contradicting the page's own descriptive disclaimer" - same-cluster (same pattern across `callable set` / `schema slug` / `Pi tool` entries; different destinations)

# T004 - Hard-ceilings aggregator lists no inline bound for ceiling #3 while siblings state theirs

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The orientation Hard-ceilings aggregator in `docs/spec/overview-and-orientation.md` enumerates four ceilings. Siblings #1, #2, and #4 carry their numeric bound directly in the one-liner; ceiling #3 (anchor `hard-ceiling-3`) is the lone exception, carrying only a routing-class note and a forward-link to HC3-a … HC3-e with no number. A reader skimming the aggregator for the four ceiling magnitudes cannot tell that ceiling #3 is a per-class budget yielding three binder LLM calls in the worst case, and may substitute "one retry." The bound is fixed and stated at HC3-d (with the AJV-on-`args` zero-retry exception at HC3-c); only formatting omits it from the aggregator.

## Solution approach

Rewrite ceiling #3's one-liner in `docs/spec/overview-and-orientation.md`'s Hard-ceilings list to state its inline bound before the existing forward-link, matching the sibling one-liner style — worst-case three binder LLM calls per slash invocation (one initial attempt plus one transport-class retry plus one malformed-envelope-class retry, AJV-on-`args` not retried). Source the bound from HC3-d and the AJV exception from HC3-c on `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`.

## Solution constraints

- GOV-30 aggregator lock-step applies: the restated bound MUST byte-match the bound as stated at HC3-d (and the AJV-on-`args` exception at HC3-c) on `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md`.

## Relationships

- T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" - same-cluster (both touch ceiling #3's orientation entry, but the anchor-governance fix is independent of restating the bound)

# T005 - Orientation NFR refers to `loom-system-note` as a pre-existing Pi channel without flagging the registration step

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The *Runtime observability* NFR bullet in `docs/spec/overview-and-orientation.md` introduces `loom-system-note` as if it were a pre-existing Pi channel, on a par with the Pi tool-host or the Pi extension registry, and its only forward-link points at the emission contract (`runtime-event-channel.md`). It offers no pointer to the registration/ownership surface where the mandatory `pi.registerMessageRenderer("loom-system-note", renderer)` call and the "literal `loom-system-note` is owned by the pi-loom extension" rule live (`extension-bootstrap-and-per-loom.md#renderer-registration`). A top-down reader can follow the bullet to the emission contract and write `pi.sendMessage` calls without learning that the pi-loom extension must register the renderer first — i.e. that pi-loom *creates* the channel rather than consuming a pre-existing one.

## Solution approach

Rewrite the *Runtime observability* bullet's first-use clause in `docs/spec/overview-and-orientation.md` to frame `loom-system-note` as a custom-message channel the pi-loom extension registers (via `pi.registerMessageRenderer`) and solely owns. Add a forward-link to `extension-bootstrap-and-per-loom.md#renderer-registration` alongside the existing forward-link to the emission contract.

## Solution constraints

- The orientation bullet must remain a forward-reference; do not restate the registration / ownership rules there — `extension-bootstrap-and-per-loom.md` retains sole ownership of them.
- Out of scope: the Source-language-stability bullet's bare use of `loom-system-note` in observable (c) stays bare — re-qualifying registration mechanics into a stability-equivalence rule does not belong there.

## Relationships

- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (governs the registration-step anchor this finding wants to forward-link to; if that anchor moves into a numbered step, update this finding's link target in lockstep)

# T006 - Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths

**Original heading:** `spec.md` resolves to two different filesystem targets; GOV-17 corpus glob omits the `docs/spec/` subtree
**Original section:** docs/spec_topics/governance/ (governance subtree)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The orientation content the governance rules pin (Scope bullets, Prerequisites, Hard ceilings list, Session Model section) physically lives in `docs/spec/overview-and-orientation.md`, `docs/spec/language-and-architecture.md`, and `docs/spec/session-model-and-appendix.md`. The file `docs/spec.md` is a 9-line table of contents that forward-links into that `docs/spec/` subtree. Governance rules treat the orientation as if it were `spec.md` itself, but spell that target two different ways:

- GOV-23 (`anchor-scheme-and-retired.md`) and GOV-30 (`req-id-prefix-table-active-b.md`) write `[spec.md](../../spec.md)` — resolving to the 9-line TOC file, which carries none of the aggregator paragraphs they govern.
- GOV-31 (same page) and GOV-15 (`source-language-stability.md`) write `[spec.md — Scope](../../spec/overview-and-orientation.md#scope)`, `[spec.md — Prerequisites](../../spec/overview-and-orientation.md#prerequisites)`, and `[spec.md — Hard ceilings](../../spec/overview-and-orientation.md#hard-runtime-ceilings)` — resolving correctly into the subtree, but with link text that asserts the file is `spec.md` rather than `spec/overview-and-orientation.md`.

GOV-17 then defines the spec corpus as exactly `docs/spec.md` ∪ `docs/spec_topics/**/*.md`. The `docs/spec/` subtree matches neither arm, so under GOV-17's own operational dependent check a Markdown link inside one of the orientation pages does not count as "into the spec corpus." Two consequences follow: (a) any external file that cross-links into `docs/spec/overview-and-orientation.md` is vacuously not classified as a dependent and so cannot trip the no-cycles MUST GOV-17 enforces, and (b) arm-(b) self-binding rules (GOV-18 arm (b), GOV-1, GOV-3, GOV-6, GOV-29) that scope their invariants to "the spec corpus" do not bind the orientation pages at all, even though those pages are where the aggregator paragraphs governed by GOV-30/GOV-31 live.

## Spec Documents

- `docs/spec.md` — whole file (edited)
- `docs/spec/overview-and-orientation.md` — whole file (edited; merged away)
- `docs/spec/language-and-architecture.md` — whole file (edited; merged away)
- `docs/spec/session-model-and-appendix.md` — whole file (edited; merged away)
- `docs/spec_topics/governance/corpus-direction-and-scope.md` — GOV-17 corpus definition and dependent-check recipe (edited)
- `docs/spec_topics/governance/anchor-scheme-and-retired.md` — GOV-23 link text and target (edited)
- `docs/spec_topics/governance/req-id-prefix-table-active-b.md` — GOV-30 and GOV-31 link text and targets (edited)
- `docs/spec_topics/governance/source-language-stability.md` — GOV-15 ceiling-aggregator cross-links (edited)
- `README.md` — repository-layout table (read-only; cross-listed with the README-layout finding)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan has no authored leaves yet; the Horizontal, MVP, and Vertical-slice sections of `docs/plan.md` are all placeholders.)

## Consequence

**Severity:** correctness

Two independent governance invariants are silently inoperative against the orientation pages: GOV-17's no-cycles dependent check (a dependent that cross-links only into `docs/spec/*.md` is misclassified as non-dependent and admitted as a cross-reference target), and the arm-(b) self-binding scope of GOV-1/3/6/18/29 (REQ-ID grammar, extraction, table closure, cross-page uniqueness do not apply to the pages most readers treat as the spec entry point). Independently, the divergent link spelling means the same logical citation resolves to two different files: an editor moving content between `spec.md` and `spec/overview-and-orientation.md` cannot tell from the link text which arm a given citation tracks, so cross-link rot is invisible to grep.

## Solution Space

**Shape:** single
**State:** reduced

Collapse the orientation subtree back into a single `docs/spec.md`, matching GOV-17 as written and eliminating the dual-spelling failure mode at its root. Inline the contents of `docs/spec/overview-and-orientation.md`, `docs/spec/language-and-architecture.md`, and `docs/spec/session-model-and-appendix.md` back into `docs/spec.md`, delete the `docs/spec/` directory, and repoint every governance cross-link to `[…](../../spec.md#anchor)`.

### Spec edits
- Merge the three `docs/spec/*.md` files into `docs/spec.md`, preserving every `<a id>` anchor cited from elsewhere (`#scope`, `#prerequisites`, `#hard-runtime-ceilings`, `#session-model`, `#sm-3a`…`#sm-7e`, etc.).
- Delete the `docs/spec/` directory.
- In `anchor-scheme-and-retired.md` (GOV-23), `req-id-prefix-table-active-b.md` (GOV-30, GOV-31), and `source-language-stability.md` (GOV-15 ceiling cross-links), rewrite every `../../spec/overview-and-orientation.md#X` to `../../spec.md#X`. Link text already says `spec.md`, so no link-text changes are needed.
- README repository-layout table needs no change: the `docs/spec/` row drops out as a side effect (co-resolving the related README finding).

Rationale: the split's only benefit is editorial (file size), while its cost is structural — a term-of-art "`spec.md` aggregator" that no longer denotes content on `spec.md`, plus a third corpus arm to keep aligned across every present and future governance rule scoped to the corpus. Collapsing leaves every governance rule readable as written without amending corpus rules.

### Edge cases
- Before deleting the three files, `grep` all `<a id="...">` across them and verify no anchor slug collides — a collision would silently break an inbound governance cross-link after the merge.
- The result is a single large file; confirm no tooling assumes the `docs/spec/` path before removing it.

## Relationships

- T007 "Three governance scoping clauses cite a non-recursive `docs/spec_topics/*.md` glob that excludes the subdirectory anchor sites" - same-cluster (independent glob-scope defect on the governance rules; resolve in the same pass once corpus shape is settled).
- T065 "`HC3-a` / `HC3-c` cross-links target the orientation aggregator anchor instead of the inline-label anchor site, violating GOV-16 *Cross-link form*" - same-cluster (both touch cross-links into the orientation pages; resolving the file location first stabilises the anchor target).

---

# T007 - Three governance scoping clauses cite a non-recursive `docs/spec_topics/*.md` glob that excludes the subdirectory anchor sites

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

Three governance scoping clauses bound their scope as `docs/spec.md` + `docs/spec_topics/*.md`, a single-level glob that matches only first-level topic files and excludes the subdirectory files carrying the live anchor sites: GOV-29's cross-page canonical-arm uniqueness sentence and GOV-28(a)'s spec-corpus discharge predicate (both on `release-version-naming.md`), and GOV-18 arm (b)'s self-binding scope clause (`corpus-direction-and-scope.md`). GOV-17 defines the corpus with the recursive `docs/spec_topics/**/*.md` form, and sibling rules GOV-3 and GOV-6 match it; these three are the scoping sites that drop the second star. A literal reader can therefore retire a `v1-*` alias despite a live inbound `#v1-…` link in a subdirectory file, admit canonical-arm slug collisions across depth levels, and treat arm (b)'s self-binding scope as narrower than the corpus GOV-17 defines.

## Solution approach

Widen the glob in each of the three clauses from `docs/spec_topics/*.md` to the recursive `docs/spec_topics/**/*.md`, matching GOV-17. For the two `release-version-naming.md` sites (the GOV-29 cross-page-uniqueness sentence and the GOV-28(a) discharge-predicate sentence), a forward-reference to `#gov-17` in place of the inline glob is an acceptable alternative. Keep GOV-18 arm (b) (`#gov-18-arm-b`) enumerating the corpus literally rather than forward-referencing GOV-17.

## Solution constraints

- None.

## Relationships

- T006 "Orientation pages live outside GOV-17's corpus and are cited under two incompatible paths" - same-cluster (both are governance-scope-glob mismatches against the actual on-disk corpus; resolved independently — that finding extends the corpus, this one widens existing globs to match GOV-17)

# T009 - Integer-overflow arithmetic has no normative reference vector

**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`expressions.md` § "Other arithmetic" specifies a normative disposition for over-safe-integer results of binary `-`, `*`, `%`, and unary `-`: the result is computed in IEEE-754 double precision, silently loses precision, does not panic, and retains the static `integer` type rather than widening to `number`. Two implementer-visible commitments are made — the IEEE-754 double-precision value and the retained `integer` static type — with no concrete reference vector pinning either. The same file pairs the `replace(from, to)` entry with a normative reference-vectors table, so a conformance tester has byte-exact fixtures for `replace` but nothing for the more surprising integer-overflow rule.

## Solution approach

Add a normative reference-vectors table to § "Other arithmetic", following the `replace(from, to)` reference-vectors table format already in the file, covering over-safe-integer inputs that exercise both the IEEE-754 double-precision value and the retained `integer` static type. Pick inputs whose IEEE-754 result has a finite decimal representation so the expected column is byte-exact, and avoid inputs whose result is an integer-valued double inside the safe range, since such a vector cannot distinguish the no-widening commitment from a silent widen-and-back at the value level.

## Solution constraints

- None.

## Relationships

- T075 "Bare-source backslash: no diagnostic code is named" — same-cluster (both are testability findings on the same review cluster, but the diagnostics issue resolves independently of the overflow vectors)

# T011 - Three independent over-prescriptions across `type-system.md` and `schema-subset.md`

**Original heading:** Type-compatibility relation bound to AJV; depth-walk "recursive descent" mechanism; nullability/union lowering offered as a free choice
**Original section:** docs/spec_topics/ language core (lexical, grammar, type-system, expressions, runtime-value-model, descriptions, schemas, schema-subset)
**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three logically independent over-prescriptions sit on adjacent surfaces. They share the lens (each ties an observable contract to a non-observable implementation detail) but the fixes are independent and each touches a different paragraph.

1. **`⊑` is defined against AJV, not against JSON Schema.** `type-system.md` (Operational definition) reads: *"`T₁ ⊑ T₂` holds iff every value statically typed as `T₁` AJV-validates against the lowering of `T₂`."* The relation is a normative semantic of the language and governs every typed slot in the corpus (typed `let`, function args, `invoke<T>`, `array<T>` element, `match`/ternary common type, `+` mixed-numeric, frontmatter `params:` defaults). Tying it to one named validator means a conformant runtime that swaps in any other JSON Schema 2020-12 validator could violate `⊑` even when its observable behaviour against the lowered subset is identical to AJV's, and conversely an AJV configuration deviation (e.g. `coerceTypes: true`) could silently redefine the language semantic. This is also out of step with the rest of the spec's posture, where validation is contracted through the `SchemaValidator` seam (`pi-integration-contract/host-interfaces-services.md` PIC-11) and AJV is named only as the reference implementation in `implementation-notes.md`.

2. **Depth Enforcement prescribes a traversal mechanism for an observable-only cap.** `schema-subset.md` Depth Enforcement is correctly observable in its rules (the cap, the per-site destinations table, the canonical `schema_keyword: "maxDepth"` error shape). One sentence then over-reaches: *"Implementation is a recursive descent over the parsed JSON value with a depth counter; the first node whose depth would exceed `5` short-circuits and produces the failure."* No conformance witness distinguishes a recursive-descent implementation from an iterative-stack one, a streaming counter on a SAX parser, or a folded `JSON.parse` reviver. The cap, the failure-emission order across enforcement points, and the error shape are the contract; the traversal mechanism is implementer freedom.

3. **Nullability/union lowering offers a non-normative choice that the canonical hash cannot tolerate.** The Nullability bullet says *"`string | null` Loom type lowers to `{"type": ["string", "null"]}` **or** an `anyOf` with `{"type": "null"}`,"* and the Lowering Algorithm step 3 says the multi-type-array form is *"preferred for readability; falls back to `anyOf` if any arm is non-primitive."* But the lowered bytes are the input to the canonical-schema-hash recipe (`schema-subset.md` Canonical schema hash), and the resulting schema slug appears in `__inline_<slug>` `$defs` keys, the `__loom_respond_<slug>` synthesised tool name, the `__loom_callee_<slug>__…` and `__loom_bind_<slug>` PIC-owned tool names, and the per-query AJV compiled-validator cache key. Two implementers picking different lowerings for the same Loom union would produce different `$defs` keys, different tool names visible in `/tools` listings and `ERR-17` error messages, and different cache hits — none of these are "readability" concerns. The "preferred"/"or" wording leaves the wire-byte shape unfixed in a section that, two screens later, requires it to be byte-exact.

## Spec Documents

- `docs/spec_topics/type-system.md` — "Operational definition" paragraph of the `T₁ ⊑ T₂` section (edited)
- `docs/spec_topics/schema-subset.md` — Depth Enforcement, last sentence of the paragraph preceding *Error shape* (edited)
- `docs/spec_topics/schema-subset.md` — Subset enumeration *Nullability* bullet (edited)
- `docs/spec_topics/schema-subset.md` — Lowering Algorithm step 3, *Union of primitives only* sub-bullet (edited)
- `docs/spec_topics/schema-subset.md` — Canonical schema hash section (read-only; the reason obligation 3 matters)
- `docs/spec_topics/implementation-notes.md` — Runtime section, AJV reference-implementation note (read-only; the home for the AJV name after obligation 1)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-11 `SchemaValidator` interface (read-only; the contract `⊑` should defer to)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` enumerates no leaves yet; `docs/plan_topics/` contains only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`.)

## Consequence

**Severity:** correctness

Obligation 3 is the load-bearing one: two reasonable implementers will choose different nullability lowerings, producing different canonical hashes, different `__inline_*` / `__loom_respond_*` / `__loom_callee_*` / `__loom_bind_*` names, and different validator-cache keys for the same Loom source — a hard divergence visible in `/tools` listings, in `ERR-17` error messages that embed the slug byte-exact, and in any inter-runtime cache exchange. Obligation 1 makes the language definition non-portable across `SchemaValidator` implementations, contradicting the rest of the corpus's seam-based posture. Obligation 2 is the least consequential — it merely admits non-witnessable implementation-shape critique into future reviews — but is a one-sentence deletion.

## Solution Space

**Shape:** single
**State:** reduced

Three independent over-prescriptions across `type-system.md` and `schema-subset.md`. Each is a small, self-contained edit and each is independently shippable; resolve them in the order below so each lands on a stable baseline. Do not bundle them into one diff.

### Step 1 — Delete the depth-walk implementation-mechanism sentence
In `schema-subset.md` Depth Enforcement, strike the sentence *"Implementation is a recursive descent over the parsed JSON value with a depth counter; the first node whose depth would exceed `5` short-circuits and produces the failure."* Retain the surrounding sentence (*"The walk runs before AJV at each site: it is a cheap fast-fail …"*), which is observable contract. This is a pure deletion with no downstream cross-references; landing it first shrinks the section before later edits.

### Step 2 — Pin the nullability/union lowering form normatively
Replace the implementer-choice phrasing with a single normative rule: a primitive-only union (including any `T | null` over primitives) MUST lower to the multi-type-array form `{"type": [...]}`; a union with one or more non-primitive arms MUST lower to `anyOf`. Within the multi-type-array form, type-name order MUST match the source-order of the Loom arms, with `null` placed last when present.
- `schema-subset.md` Subset enumeration, *Nullability* bullet: rewrite as "Nullability is the special case of union: `string | null` lowers to `{"type": ["string", "null"]}`. See *Lowering Algorithm* step 3 for the full normative rule. The non-standard `nullable: true` modifier is not emitted."
- `schema-subset.md` Lowering Algorithm step 3, *Union of primitives only* sub-bullet: rewrite as "Union whose every arm is a primitive (`string`, `number`, `integer`, `boolean`, `null`): MUST emit `{"type": [<a>, <b>, …]}` with type names in Loom source-arm order, `null` last when present. Mixed unions (one or more non-primitive arms) MUST emit `anyOf` per the *Mixed `anyOf`* sub-bullet."

This closes a real divergence in the canonical-hash inputs: without it, two implementers' divergent lowerings widen into divergent `__inline_*` / `__loom_respond_*` slugs. It adds no new schema constructs (both forms already exist in the subset).

### Step 3 — Rebind `⊑` to JSON Schema 2020-12 semantics with AJV as reference implementation
In `type-system.md`'s *Operational definition* paragraph, replace *"AJV-validates against the lowering of `T₂`"* with *"validates against the lowering of `T₂` under JSON Schema 2020-12 semantics, as realised by the injected `SchemaValidator` service (see [PIC-11](../spec_topics/pi-integration-contract/host-interfaces-services.md#schemavalidator-interface))."* Reframe the surrounding paragraph accordingly (e.g. *"The AJV reading is the safety net at runtime …"* becomes *"The runtime validation is the safety net …"*). Update the supporting AJV mentions in the same edit, since the relation now defers to the seam:
- *Structural cases the parser must recognise* intro sentence: change "without invoking AJV" → "without invoking the `SchemaValidator`."
- *Unresolvable operands* paragraph: change "the runtime AJV check is the safety net" → "the runtime `SchemaValidator` check is the safety net."

This aligns the language semantic with the corpus's seam-based validation posture so a conformant runtime that swaps validators no longer violates `⊑`; AJV's role is preserved exactly as the reference implementation in `implementation-notes.md`. This is the widest-surface edit in `type-system.md`, so it lands last on the baseline already settled by steps 1 and 2.

### Edge cases
- (Step 2) Confirm the corpus uses `{"type":[…]}` form for primitive-only unions in every example outside the schema-subset page (other pages show both `{"type": ["string", "null"]}` and `{"anyOf": …}` forms); if any page shows the `anyOf` alternative for a primitive-only union, fix it in the same PR.
- (Step 2) Pin type-name order — without it, `string | null` and `null | string` lower to byte-distinct fragments and produce different schema slugs; the canonical-form key-sort post-processing must remain the only normalisation acting on the emitted fragment.
- (Step 3) Do not delete the AJV-as-reference-implementation note in `implementation-notes.md` — that is the home AJV moves *to*, not *from*. The assumed validator configuration (no type coercion, Draft 2020-12) now lives in PIC-11 rather than at the `⊑` definition site, so PIC-11 must state it.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (both bear on canonical-hash inputs / collision posture; resolved independently)
- T071 "Canonical hash recipe cites keywords the lowered subset never emits (`default`, `minLength`, `maxItems`)" - same-cluster (touches the same Canonical schema hash section; independent fix)

---

# T012 - `while`-loop termination disposition not cross-referenced from `control-flow.md`

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`control-flow.md`'s `while` paragraph is the owning page for the only loom 1.0 construct capable of unbounded iteration, yet it pins only parse-time obligations (`boolean` condition, `break`/`continue` scoping) and says nothing about what bounds a runaway loop, what variant a caller observes on cancellation, or how cancellation reaches a loop body. The authoritative answers live on other pages — `NOCEIL-1` (no wall-clock bound), `cancellation.md` Granularity (per-iteration checkpoint), `CancelledError`, and `NOCEIL-3`'s catchable-`RangeError` arm — but the `while` section forward-links none of them. A reader who stops at the owning page cannot tell whether a no-query loop is bounded at all, and a reader who consults `functions.md` for an "exhausted runtime ceiling" lands on `tool_loop_exhausted`, which does not bound a `while`.

## Solution approach

Add a termination forward-link from `control-flow.md`'s `while` section to the existing authoritative rules: `NOCEIL-1` at `hard-ceilings/ceiling-invariants-and-audit.md#no-additional-ceilings` (no wall-clock bound), the per-iteration checkpoint in `cancellation.md` Granularity, the `cancelled` surface at `errors-and-results/queryerror-variants.md#queryerror-variants`, and `NOCEIL-3`'s catchable-`RangeError` arm for host allocation / stack failures inside a loop body.

## Solution constraints

- Forward-link only: no normative content is moved or restated from the linked pages into `control-flow.md`, preserving GOV-15 source-language equivalence.

## Relationships

- T022 "Macrotask-yield primitive at the loop-iteration checkpoint is unspecified" — same-cluster (both touch the `cancellation.md` per-iteration checkpoint that this finding's cross-reference forward-links; the two resolve independently — pinning the yield primitive is orthogonal to cross-referencing the checkpoint from `control-flow.md`).

# T013 - `mut-on-immutable-context` umbrella claim contradicts the carve-out for `let _`

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Immutable contexts." umbrella sentence in `bindings.md` states that `mut` on any listed binding is `loom/parse/mut-on-immutable-context`, but the discard-form bullet then reassigns `let mut _ = ...` to a different code, `loom/parse/mut-on-discard`. The diagnostics registry in `code-registry-parse.md` scopes `mut-on-immutable-context` to function parameters, `for`-iteration variables, and `match` pattern bindings only — it does not cover the discard form. The umbrella claim therefore contradicts its own bullet and the registry, leaving two diagnostic codes attached to `let mut _`. An implementer reading the umbrella sentence in isolation emits the wrong code.

## Solution approach

Narrow the "Immutable contexts." umbrella sentence so its `mut-on-immutable-context` claim covers only the contexts the registry assigns to that code. Lift the discard form out of the umbrella bullet list and present it separately, so `let _ = ...` is named immutable while `let mut _ = ...` resolves to `mut-on-discard`. Keep both code names aligned with the `code-registry-parse.md` rows.

## Solution constraints

- Out of scope: `code-registry-parse.md` — its `mut-on-immutable-context` and `mut-on-discard` rows are the authoritative code scoping and are read-only; do not rename either code or edit the registry.

## Relationships

None

# T014 - SLSH-3 slash-boundary scoping is asserted only through an indirect parenthetical

**Kind:** scope
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

SLSH-3 on `slash-invocation.md` opens *"When a prompt-mode loom returns `Err(QueryError)` to its caller (the user's session)"* — its slash-boundary scope rides entirely on the parenthetical plus the glossary `caller` entry's two-senses partition. On a standalone read, the sentence fits every prompt-mode invoke parent in a prompt → prompt chain (per `invocation.md`'s cross-mode matrix, a prompt-mode child also drives the user's session), not just the slash entrypoint. SLSH-4's templates ("the shapes below") and SLSH-5's chain suffix ("the per-`kind` row above") inherit the ambiguity without restating the emission site. The authoritative `display: true` ⇒ slash-boundary mapping is owned by `pi-integration-contract/runtime-event-channel.md`, but the SLSH-3 prose does not stand on its own, so a literal reading emits duplicate system notes at every nested prompt → prompt invoke parent whose `?`-propagated `Err` traverses it.

## Solution approach

Rewrite SLSH-3's opening sentence on `slash-invocation.md` to name the slash-command boundary directly rather than relying on the `caller` parenthetical, using the slash-boundary framing `runtime-event-channel.md` already carries (the top-level `Err` cascading out of the slash-command boundary to the user's session). Clarify at SLSH-3 that SLSH-4's templates and SLSH-5's chain suffix apply at this same slash-boundary emission site, and that intermediate prompt-mode invoke parents whose `?`-propagated `Err` traverses them do not emit a SLSH-3/4/5-shaped note. Add a forward-link from SLSH-3 to `runtime-event-channel.md`'s `id="system-note-details-shapes"` per-variant `display` / `content` table.

## Solution constraints

- Out of scope: SLSH-5's `<parent_path>:<line>` definition (owned by T078) and SLSH-4's template-cell / inline-backtick rendering (owned by T079) — touch only the SLSH-3..SLSH-5 framing and scope sentences, not the template content.
- The tightened scope MUST NOT re-scope SLSH-3..SLSH-5 to subagent-mode `display: false` cascades or to the panic-rendering `details: { diagnostics }` emission path.

## Relationships

- T078 "SLSH-5 `<parent_path>:<line>` is defined only for `invoke(...)` call sites, not for `.loom`-callable bare-identifier calls" - same-cluster (independent defect on the same SLSH-5 rule)
- T079 "SLSH-4 template cells and SLSH-5 worked examples disagree on whether inline backticks are emitted" - same-cluster (independent defect on the same SLSH-4/SLSH-5 templates)

# T015 - Clock-ban prohibition and cross-boundary depth-counter rule lack observable acceptance criteria

**Original heading:** Clock-ban MUST NOT and invoke-depth cross-boundary rule lack observable acceptance criteria
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two normative rules in the runtime spec are written without any externally
observable acceptance criterion, so a conformance suite that exercises only
the surfaces the spec names cannot distinguish a compliant implementation
from a non-compliant one. They are independent rules on independent pages
and are addressed below as two separate obligations.

**(1) Clock ban.** `implementation-notes.md` (Clock bullet) states *"The
runtime MUST NOT call `Date.now`, `performance.now`,
`Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout`
outside the `WallClock` adapter (the reference implementation enforces
this ban with a build-time grep-test; the grep-test mechanism is
non-normative)."* The MUST NOT is phrased entirely against
implementation-internal call sites in the runtime's own source, and the
only verification mechanism cited is explicitly non-normative. A second
implementer reading the normative behavioural contract cannot derive a
black-box conformance test: an implementation that calls `Date.now()` in
ten places — but whose observable behaviour (`RuntimeEvent.occurred_at`
stamping, watcher debounce, settings-watcher debounce,
`looms.scanPackagesTimeoutMs` cap, retry/backoff timing) is fully
substitutable by a `FakeClock` — would pass every behavioural test
written from the cited call-site list. The rule that actually matters
behaviourally is *"every time-dependent observable in the runtime is
substitutable via the injected `Clock` seam,"* which is testable; the
call-site prohibition is a non-testable implementation convention.

**(2) Cross-boundary depth-counter rule.** `invocation.md` (paragraph
beginning *"The counter is per-chain and crosses subagent-mode boundaries
unchanged"*) states that `subagent → subagent` and `prompt → subagent`
invocations do not reset the per-chain depth counter, that the cap is
breached when pushing a frame would bring the count to 33, and that
`loom/runtime/invoke-depth-exceeded` renders `invoke chain depth
exceeded: 33 > 32`. The rule is stated declaratively but no acceptance
scenario pins the cross-boundary witness. A test suite that exercises
only same-mode chains — e.g. a 32-frame all-prompt-mode chain, plus a
single subagent spawn — would pass an implementation that silently
resets the counter at each subagent boundary, because the only chains
long enough to trip the cap never cross a boundary. The cross-boundary
clause is the entire reason the paragraph exists and is the property
most likely to be lost in a reasonable implementation (a fresh
`AgentSession` is an obvious place to start a fresh counter), yet
nothing in the spec compels a fixture that would catch the regression.

## Spec Documents

- `docs/spec_topics/implementation-notes.md` — Clock bullet (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-12 `Clock` / `FakeClock` interface (edited; receives the behavioural-substitutability obligation)
- `docs/spec_topics/invocation.md` — Invocation depth bound, cross-boundary paragraph (edited)
- `docs/spec_topics/diagnostics/code-registry-parse.md` — `loom/runtime/invoke-depth-exceeded` render-string pin (read-only; the acceptance scenario cites the existing pinned render)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The plan currently has no authored leaves under any phase; the coverage matrix is empty. When leaves are authored for the `Clock` seam and for the invocation depth bound, they should adopt the acceptance criteria added by this fix.)

## Consequence

**Severity:** correctness

Two independent implementers writing to the current spec can ship
runtimes that pass every behavioural test the spec admits, yet diverge
on whether `Date.now()` may appear outside `WallClock` and on whether
the depth counter resets across a subagent boundary. The depth-counter
divergence is operator-visible: a recursive divide-and-conquer that
should panic at frame 33 instead runs to whatever cap the host
ultimately imposes (stack overflow, memory exhaustion, or no bound at
all) when the counter silently resets at every spawned `AgentSession`.

## Solution Space

**Shape:** single
**State:** reduced

Two unrelated obligations on two different pages. Resolve the purely-additive cross-boundary scenario first so the clock-ban edit lands on a stable baseline.

### Step 1 — Add a cross-boundary depth-counter acceptance scenario
Append one normative acceptance scenario to the cross-boundary paragraph in `invocation.md` and nothing else. Immediately after the existing *"The counter is per-chain and crosses subagent-mode boundaries unchanged"* paragraph, insert a labelled scenario:

> *Acceptance scenario.* A chain composed of 32 `invoke` frames whose mode sequence interleaves at least one `prompt → subagent` and at least one `subagent → subagent` transition (and where no two adjacent frames share a mode in at least two positions) MUST raise `loom/runtime/invoke-depth-exceeded` rendering `invoke chain depth exceeded: 33 > 32` when the 33rd frame is about to be pushed, regardless of where the boundaries fall in the chain.

State the scenario in mode-mix / transition terms (not "exactly N boundaries") so a conforming implementation cannot satisfy it by special-casing a specific boundary count. Cross-link from the existing `subagent.md` concurrent-invocation-isolation block so the depth-counter passthrough across the `customTools` / `AgentSession` boundary is testable from the subagent page too.

### Step 2 — Demote the Clock ban to a convention; add a behavioural substitutability obligation
Replace the call-site MUST NOT with a behavioural contract on PIC-12 (the `Clock` / `FakeClock` interface) and demote the call-site prohibition to a non-normative implementer convention.
- In `implementation-notes.md` Clock bullet, replace the sentence *"The runtime MUST NOT call `Date.now`, `performance.now`, `Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout` outside the `WallClock` adapter (the reference implementation enforces this ban with a build-time grep-test; the grep-test mechanism is non-normative)."* with a non-normative editorial note: *"Non-normative implementer convention. The reference implementation avoids calling `Date.now`, `performance.now`, `Date.prototype.getTime`, or the global `setTimeout` / `clearTimeout` outside the `WallClock` adapter, and enforces this via a build-time grep-test; the convention exists only to make the PIC-12 behavioural substitutability obligation below easier to uphold in practice."*
- In `host-interfaces-services.md` PIC-12, add one normative behavioural obligation: *"Every time-dependent observable the runtime produces — `RuntimeEvent.occurred_at` stamping, the watcher debounce window, the settings-watcher debounce, the `looms.scanPackagesTimeoutMs` cap on the package-discovery walk, and any retry/backoff timing — MUST be fully substitutable via the injected `Clock` seam. Concretely: with a `FakeClock` whose `advance(ms)` is the sole source of forward time progress, a test fixture MUST be able to drive every such observable to its expected value/effect without any wall-clock passage, and no observable shall depend on a time source the seam does not mediate."* Enumerate the call sites (already listed in the existing PIC-12 prose) as the closed set of observables the obligation governs.

This replaces an untestable implementation-internal prohibition with a black-box behavioural contract a conformance suite can mechanise as `FakeClock`-substitution tests; the convention survives as guidance for implementers who want a mechanical check.

### Edge cases
- Step 1's acceptance scenario must be stated in mode-mix / transition-count terms, not as a specific 33-frame test case, so it cannot be satisfied by an implementation that special-cases the fixture. A "reset at every subagent boundary" implementation reduces the visible chain length to ≤ 31 frames, so the panic never fires and the assertion fails — the predicate must be tight enough to guarantee this.
- Step 2's PIC-12 obligation must enumerate the observables as a closed set already named in the existing Clock bullet (event stamping, watcher debounce, settings-watcher debounce, scan-packages timeout, retry/backoff). An open-ended list makes the obligation as untestable as the prohibition it replaces; keep the list in lockstep with the runtime's actual time-touching surface.
- The demoted convention in `implementation-notes.md` must stay non-normative; if it is re-elevated to a MUST NOT in any future edit, the testability defect returns.

## Relationships

- T048 "Always-log event construction and `ctx.ui.notify` fallback are unpinned at the runtime-event-channel fallback site" - same-cluster (touches `Clock.wallNow()` at a different call site; the PIC-12 substitutability obligation subsumes the substitutability concern but not the throw-handling concern)

---

# T016 - Snippets reference undeclared `ReviewScore`/unbound `code`; foot-gun mentions a linter the spec never scopes

**Original heading:** functions.md conceptual-model example uses undeclared `ReviewScore`/unbound `code`; linting non-goal not declared
**Original section:** docs/spec_topics/ functions, control-flow, return, bindings, imports, invocation, slash-invocation, implementation-notes
**Kind:** implementability, scope
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two independent issues, each small but each at a reader's first exposure to the language:

1. **Snippets reference names with no in-corpus declaration.** The Query-and-Await snippet in `overview.md` § Conceptual Model — Query-and-Await uses `${code}` (never bound) and annotates `let score: ReviewScore = …` (type never declared anywhere in the corpus). `functions.md`'s opening `rate_strictness` snippet has the same problem: it takes `p: Author` and returns `Result<ReviewScore, QueryError>`. `Author` is declared in `schemas.md` (a later page); `ReviewScore` is never declared anywhere. Neighbouring topic pages (`type-system.md`, `query/query-forms.md`, `errors-and-results/error-model.md`) carry the same `ReviewScore` symbol with no shared definition — the corpus has settled on it as a recurring example name without ever introducing it. Other example-heavy pages in the corpus (e.g. `binder/binder-bypass-and-envelope.md`, `pi-integration-contract/host-interfaces-services.md`, `binder/defaulting-system-note-echo.md`) explicitly tag illustrative fragments as non-normative; these two snippets do not.

2. **The `let x = expr?` foot-gun recommends linting, but linting is not in or out of scope.** `functions.md`'s foot-gun note says the pattern "is best caught by linting, not by the language rule." The loom 1.0 non-goals list in `future-considerations/model-changes-and-non-goals.md` enumerates eight cross-cutting scope decisions (no sandbox, no migration mechanism, no non-Node host, no concurrent sessions, no stdio-capture reliance, no parallel-invoke, no parallel fan-out, no admission cap) and the upstream "Model-level changes" list covers another eleven; neither mentions a loom lint / static-analysis tool. A reader cannot tell whether the foot-gun text presupposes a tool loom 1.0 ships, defers to a future tool, or names a tool out of scope.

The two halves are independent: fixing the example snippets does not address the linter-scope question, and declaring (or disclaiming) a lint surface does not fix the undeclared identifiers.

## Spec Documents

- `docs/spec_topics/overview.md` — Conceptual Model § Query-and-Await (edited)
- `docs/spec_topics/functions.md` — opening `rate_strictness` snippet; *Foot-gun — `let x = expr?`* paragraph (edited)
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — `loom 1.0 non-goals` list (edited)
- `docs/spec/language-and-architecture.md` — `### V1 non-goals` aggregator (edited; kept in lock-step under GOV-30)
- `docs/spec_topics/schemas.md` — read-only (confirms `Author` is declared here, `ReviewScore` nowhere)
- `docs/spec_topics/type-system.md`, `docs/spec_topics/query/query-forms.md`, `docs/spec_topics/errors-and-results/error-model.md` — read-only (confirm `ReviewScore` is a recurring undeclared example name)
- `docs/spec_topics/governance/req-id-prefix-table-active-b.md` — read-only (GOV-30 aggregator lock-step rule)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan file exists but currently has no leaves; nothing references these surfaces yet.)

## Consequence

**Severity:** advisory

A reader hitting either snippet at first contact has to guess whether `ReviewScore` / `code` are declared elsewhere and whether the linter exists. Neither guess affects what an implementer would build — both are reader-comprehension defects — but they sit at the corpus's two most-trafficked entry points (overview's Conceptual Model and the opening of `functions.md`) and undermine the corpus's general discipline of tagging non-normative illustration explicitly.

## Solution Space

**Shape:** single
**State:** reduced

Two independent obligations. Resolve the snippet tagging first (smaller scope, higher impact, no non-goals-list change), then declare lint tooling out of scope on that baseline.

### Step 1 — Tag the two snippets as illustrative non-normative fragments
At each snippet site, prepend a one-line non-normative marker, matching the corpus's existing illustrative-tag convention (as used by `binder/binder-bypass-and-envelope.md` "included for illustration" and `pi-integration-contract/host-interfaces-services.md` "non-normative reference illustrating one conforming decomposition").
- `docs/spec_topics/overview.md` — add a one-line "Illustrative; …" preface immediately before the Query-and-Await fenced block, naming `code` as an example identifier bound earlier in the loom and `ReviewScore` as an example schema (not declared here).
- `docs/spec_topics/functions.md` — add the same one-line preface before the `rate_strictness` fenced block, naming `Author` and `ReviewScore` as example schemas.

These snippets are introductory exposition of the `@` form, not schema-declaration tutorials, so a tag is preferred over inlining full declarations (which would dilute the rhetorical focus and impose a new "snippets must resolve every identifier inline" obligation the corpus does not otherwise hold).

### Step 2 — Declare lint / static-analysis tooling explicitly out of scope
Add a ninth bullet to the `loom 1.0 non-goals` list and forward-link the foot-gun to it, rather than merely softening the foot-gun wording — the underlying scope question ("does loom 1.0 ship a lint surface?") is real and worth answering once on a findable page.
- `docs/spec_topics/future-considerations/model-changes-and-non-goals.md` — append a new non-goal bullet, e.g. *"No loom lint / static-analysis tooling. loom 1.0 ships no separate lint surface; informative authoring-pattern advice in topic pages (e.g. the `let x = expr?` foot-gun in `functions.md`) is reader-facing guidance, not a contract on a downstream tool. A future lint tool would require revisiting the diagnostic surface ownership and is not anticipated by loom 1.0."* Use the same `*Recorded at:*` cross-reference template as the existing eight bullets, pointing at the `functions.md` foot-gun.
- `docs/spec/language-and-architecture.md` — update the GOV-30 aggregator's "eight items" integer (preserving the GOV-31 literal) and forward-link to the new bullet.
- `docs/spec_topics/functions.md` — keep the foot-gun text but forward-link the "best caught by linting" sentence to the new non-goal anchor.

### Edge cases
- `ReviewScore` recurs across the corpus (≥4 sites: `type-system.md`, `query/query-forms.md`, `errors-and-results/error-model.md`) with no shared declaration. Step 1 only tags the two sites named here; do not expand the fix to the others — raise a separate finding if the broader pattern is to be normalised.
- The new non-goal bullet must use the same `*Recorded at:*` template as the existing eight bullets and must forward-link the `functions.md` foot-gun specifically, not a generic "see also".
- Step 2 requires the GOV-30 aggregator update on `docs/spec/language-and-architecture.md` and the GOV-31 integer-literal preservation; omitting either leaves the lock-step out of sync (mechanically caught at review, but it is the exact edit GOV-30 guards against).

## Relationships

None

---

# T017 - Panic message templates duplicated between error-model.md and code-registry-runtime.md, with a self-undermining normative claim

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`errors-and-results/error-model.md`'s `**Panic message string (normative).**` paragraph (anchor `#runtime-panics`) reproduces the six `loom/runtime/*` message templates in a Code/Message-template table that duplicates the identical six rows in `diagnostics/code-registry-runtime.md`'s `loom/runtime/*` table. The paragraph asserts its own table is normative ("a conformant runtime MUST emit the registered string … conformance tests MAY assert on the exact string") while simultaneously conceding "the registry is authoritative if the two ever drift" — two normative carriers for the same byte-exact strings with a self-undermining tiebreaker. A conformance tester reading the error-model table can assert a false-positive failure against a registry-conformant runtime once the two copies diverge, and every future template edit must land in two places under a co-edit obligation that is nowhere stated. The registry rows already back-link to *Errors and Results — Runtime panics* in their *Spec rule* column, so the registry is the established sole authority.

## Solution approach

Delete the six-row Code/Message-template table from error-model.md's `**Panic message string (normative).**` paragraph (anchor `#runtime-panics`) and rewrite the paragraph to forward-reference `diagnostics/code-registry-runtime.md#loomruntime-runtime-panics-runtime-defect-surface-and-delivery-failures` as the sole authoritative carrier of the templates, removing the "registry is authoritative if the two ever drift" clause. Preserve the separate forward-reference to the placeholder-rendering rules at `placeholder-rendering-a.md#placeholder-rendering-normative`. Move the conformance-assertion entitlement ("conformance tests MAY assert on the exact string") onto the registry page so deleting it from error-model.md does not drop the contract.

## Solution constraints

- Out of scope: the existing per-source and `loom/runtime/internal-error` cross-references in the narrative **Runtime panics** paragraph (anchor `#runtime-panics`) above the deleted table — they are independent of the template duplication and must remain.

## Relationships

None

# T018 - DISC-4 does not cross-reference the `pi.getCommands()` enumeration API or its `session_start` ordering presupposition

**Kind:** implementability, assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

DISC-4 in `discovery/discovery-sources.md` is the canonical cross-format slash-name collision rule: it requires the `session_start` handler to drop any candidate `.loom` whose slash name collides with an already-registered Pi prompt template, skill, or other extension command. A reader sitting on DISC-4 cannot tell which Pi SDK accessor enumerates the registered command/prompt/skill namespace, nor under what event-ordering guarantee that snapshot is authoritative. Both facts are pinned elsewhere — `pi.getCommands()` and its first-`session_start`-completeness presupposition in `pi-integration-contract/registration-steps.md`, and the collision-candidate `SlashCommandSource` set in `pi-integration-contract/host-interfaces-services.md` — but DISC-4 links only through a loose parenthetical to the PIC page hub, not to either anchor.

## Solution approach

In DISC-4's `session_start` collision paragraph (`discovery/discovery-sources.md`), add a cross-reference naming `pi.getCommands()` and forward-linking to `registration-steps.md` step 3 and its `getcommands-completeness-presupposition` anchor. In the same paragraph, forward-link the collision-candidate `SlashCommandSource` set to `host-interfaces-services.md#v1-seam-pi-owned-subagents-collision-source-set`. Replace the existing loose parenthetical pointing at the PIC hub page with these anchored links.

## Solution constraints

- Out of scope: the DISC-4 de-registration mechanism owned by T091.
- Out of scope: the `pi.getCommands()` throw / failure semantics owned by T109.

## Relationships

- T091 "DISC-4 "de-registers a previously-registered loom" has no Pi-side mechanism" - same-cluster (sibling DISC-4 sub-rule needing its own host-API pin; resolve independently)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (concerns the same accessor's failure semantics; the fix here should not also try to define throw semantics)

# T019 - ERR-17 references `__loom_respond_<slug>` byte-exact without telling the reader where `<slug>` comes from

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

ERR-17 in `errors-and-results/queryerror-variants.md` (anchor `#err-17`) pins the wrong-tool synthesised `ValidationIssue` `message` literal byte-exactly, embedding the token `__loom_respond_<slug>`, yet the page never says where `<slug>` is derived from. Every sibling site that emits `__loom_respond_<slug>` forward-links the slug's source of truth in `schema-subset.md`, but ERR-17 carries no such hook. A conformance-test author landing on ERR-17 cannot derive the expected literal without prior knowledge of the canonical schema hash / synthesised-name recipe.

## Solution approach

Add a forward-cross-reference on the first mention of `__loom_respond_<slug>` in ERR-17, pointing at `schema-subset.md`'s `#canonical-schema-hash` and `#synthesised-names` anchors as the source of truth for the slug. The sibling `__loom_respond_<slug>` callsite in `query/query-failure-and-repair.md` is the existing precedent for the forward-link.

## Solution constraints

- None.

## Relationships

- T070 "Schema-slug collision posture is pinned only for the `pi.registerTool` cache, leaving the `$defs` hoist and the validator cache silent" - same-cluster (touches the same slug recipe but is about collision-handling, not about cross-referencing the recipe)

# T020 - DISC-6 over-prescribes implementation mechanism; `--loom` registration omits a pinned description

**Original heading:** DISC-6 over-prescribes `.catch(() => {})`, GC/file-handle mechanics, and the exact per-read deadline formula; `--loom` description elided
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

DISC-6 in `docs/spec_topics/discovery/package-and-settings.md` (the `<a id="disc-6">` bullet) mixes a small number of genuine behavioural obligations with three pieces of implementation prescription that the spec has no reason to lock in. The settled rejection of an abandoned read MUST be silenced "with `.catch(() => {})`"; the in-flight read on per-read timeout is described as "the file handle is dropped and GC'd"; and the per-read deadline is pinned to the exact algebra `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))`. The three obligations DISC-6 actually needs are observable: a settled rejection from an abandoned read MUST NOT be surfaced or re-routed back into the discovery pass; a per-scan unreadable diagnostic is emitted at most once per timed-out candidate; and the per-read deadline is at least the documented floor (`200 ms`) and scales proportionally with `looms.scanPackagesTimeoutMs`. As written, an implementer who satisfies the observable contract via (say) an `AbortController`-only path, a `try { … } finally { … }` without the `.catch` swallow, or a deadline of `Math.max(200, scanPackagesTimeoutMs >> 3)` would non-conform to the spec without producing a behavioural difference any test could see.

Separately, the canonical line in `docs/spec_topics/pi-integration-contract/registration-steps.md` step 1 — `pi.registerFlag('loom', { type: 'string', description: … })` — leaves the `description` slot as a literal `…` placeholder. Surrounding prose declares the exact string non-normative and gives an illustrative example (`'Loom file or directory paths, joined with the OS path-list separator'`), but the signature itself still carries the ellipsis, which inverts the normal spec convention that signature lines are byte-readable.

These are two independent obligations against two different files, bundled into one finding because both surfaced in the same prescription sweep. They are resolved by independent edits and should be fixed sequentially, not as one combined patch.

## Spec Documents

- `docs/spec_topics/discovery/package-and-settings.md` — DISC-6 bullet (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/package-read-timeout` row (read-only — cross-checked for any restatement of the prescribed mechanism; carries only the `details.kind` payload and points back to DISC-6)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 `pi.registerFlag('loom', …)` signature line (edited)
- `docs/spec_topics/discovery/discovery-sources.md` — `<a id="loom-flag-namespace">` paragraph (read-only — already states the flag-name namespace-clearance and first-load-wins behaviour; no edit needed)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan currently contains no leaves; `docs/plan_topics/` holds only `conventions.md`, `coverage-matrix.md`, and `leaf-template.md`.)

## Consequence

**Severity:** advisory

A conforming implementation that satisfies the observable contract (no surfaced settled-rejection, per-scan unreadable, deadline floor + proportionality) but uses a different swallowing primitive or a different deadline formula would technically violate DISC-6 as written, even though no diagnostic, log entry, or behaviour visible at any seam differs. The `…` description placeholder is purely editorial and would not block implementation, but reads as an unresolved spec drafting gap at a numbered, normative registration step.

## Solution Space

**Shape:** single
**State:** reduced

Two independent obligations in different files: an editorial pin on the `--loom` description and a prescription demotion in DISC-6. Resolve the editorial pin first (smaller, scope-bounded, cannot interact with the rewrite), then the DISC-6 demotion.

### Step 1 — Pin the `--loom` `registerFlag` description
In `docs/spec_topics/pi-integration-contract/registration-steps.md`, step 1:
- Replace `pi.registerFlag('loom', { type: 'string', description: … })` (both occurrences in the opening sentence) with `pi.registerFlag('loom', { type: 'string', description: 'Loom file or directory paths, joined with the OS path-list separator' })`.
- Rephrase the trailing clause to: "The flag name `'loom'`, `type: 'string'`, the presence of a `description`, and the registration ordering relative to `resources_discover` are the observable pins; the exact `description` string is non-normative (Pi renders it only in `--help`, where it keys no loom surface) and the value above is the recommended default."

This removes the `…` placeholder, promotes the example string the prose already provides into the signature, and preserves the string's existing non-normative status.

### Step 2 — Demote DISC-6 implementation mechanism to non-normative
In `docs/spec_topics/discovery/package-and-settings.md`, DISC-6, state the normative requirements behaviourally and move implementation idiom into non-normative notes:
- Replace "the read's eventual settlement MUST be silenced with `.catch(() => {})` and its result MUST NOT be re-routed back into the discovery pass" with "the read's eventual settlement MUST NOT be surfaced as a discovery diagnostic and MUST NOT be re-routed back into the discovery pass; the runtime is responsible for attaching a same-tick rejection handler so the settled promise does not surface as an unhandled rejection. *(One conforming idiom is `.catch(() => {})` attached at the same site that initiates the read; the requirement is observable, not the idiom.)*"
- Replace "the in-flight read is abandoned (the file handle is dropped and GC'd; …)" with "the in-flight read is abandoned (no further bytes from that read contribute to the registry, and any underlying file handle is released as the runtime sees fit); …"
- Replace "each candidate `package.json` read is bounded by a deadline race scheduled through `Clock.setTimeout`, where `deadline = max(200, floor(looms.scanPackagesTimeoutMs / 10))` milliseconds" with "each candidate `package.json` read is bounded by a deadline derived from `looms.scanPackagesTimeoutMs`: the per-read deadline MUST be at least `200 ms` (the floor) and MUST be a monotonically non-decreasing function of `looms.scanPackagesTimeoutMs` so that raising the global cap raises the per-read budget. The default-cap derivation `max(200, floor(looms.scanPackagesTimeoutMs / 10))` (so `2000 ms` global yields a `200 ms` per-read budget) is one conforming choice; it is non-normative."
- Keep normative: the `Clock.setTimeout` seam obligation (testability), the `FakeClock`-driven ordering tie-break, the once-per-candidate diagnostic, and the "unreadable for this scan only" caching rule.

This lifts the over-prescription without weakening any observable behaviour; the `Clock` seam and the deadline floor + monotonicity remain pinned so `FakeClock`-driven tests still constrain the implementation.

### Edge cases
- The per-read `200 ms` floor MUST remain a hard lower bound regardless of how small `looms.scanPackagesTimeoutMs` is configured — it is a real reliability obligation on slow filesystems and related diagnostic tests rely on it. Do not drop it.
- The `Clock.setTimeout` seam MUST remain the only timer source so `FakeClock` tests stay deterministic.
- The cap-check / per-read tie-break wording elsewhere in the same paragraph references the exact formula; check it for collateral wording drift when the formula is demoted.
- Preserve every inbound cross-reference into DISC-6 — from `code-registry-load.md` (the `loom/load/package-read-timeout` row's anchor link `#package-discovery`) and from `discovery-sources.md` (`<a id="loom-flag-namespace">`); no anchor IDs change.
- A related finding ("Concurrency cache-immutability, loop-iteration 'one macrotask,' and `.catch(() => {})` over-prescribe mechanism") may need the identical "settled rejection MUST NOT be surfaced" motif at three further sites; share that vocabulary so the corpus reads consistently.

## Relationships

None

---

# T021 - Three clarity defects in collision and error-variant prose: `cross-source-shadow` ≥3-source cardinality, "is now self-referential", "rarely have one"

**Original heading:** `cross-source-shadow` ">2 colliding sources" cardinality undefined; "is now self-referential"; "rarely have one"
**Original section:** docs/spec_topics/ errors-and-results + discovery
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three independent clarity defects landed under one heading because they share the "shard-06" lens; they should be resolved as separate edits.

**(a) `cross-source-shadow` cardinality for ≥3 sources.** `discovery-sources.md` Source-priority says: *"When the same slash name resolves from multiple sources, the higher-priority source wins and `loom/load/cross-source-shadow` is emitted naming both paths."* The opening phrase "multiple sources" admits three-or-more, but the closing phrase "naming both paths" implicitly assumes exactly two. The diagnostic-template row in `diagnostics/code-registry-load.md` reinforces the two-way shape (`'<higher>' wins over '<lower>'`), and the test vector in `diagnostics/placeholder-rendering-b.md` only exercises a two-source case. By contrast, the sibling rule DISC-4 (`cross-format-collision`) is explicit that three same-priority colliders produce a single diagnostic listing every path. Two reasonable implementers will diverge on whether a three-source shadow (e.g. CLI > settings > project) emits one diagnostic listing the winner plus every shadowed path, one diagnostic per shadowed loser pairing the winner against each loser, or only the single highest-priority loser (matching the literal "both paths" wording).

**(b) "is now self-referential".** `queryerror-variants.md` says of `InvokeError.inner`: *"The recursive `inner: QueryError` field is now self-referential within this section."* The temporal "now" is unanchored — there is no preceding statement that it was previously not self-referential — and reads as residual draft-history prose rather than a normative statement.

**(c) "rarely have one".** The same file states: *"`raw_response` only appears on variants where the model produced (or attempted to produce) a final text response. `cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response."* The schemas defined immediately above for `CancelledError` and `ContextOverflowError` do not declare a `raw_response` field at all, so "rarely have one" is not merely imprecise — it contradicts the schemas, which never carry the field. "Rarely" also leaves open whether implementations are permitted to add it, which they are not.

## Spec Documents

- `docs/spec_topics/discovery/discovery-sources.md` — Source priority paragraph (edited)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/cross-source-shadow` row, *Format* column (edited)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — `cross-source-shadow` test vector (edited)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `InvokeError` section and the `raw_response` recap paragraph (edited)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project has a `plan.md` but no leaves are yet authored under any phase.)

## Consequence

**Severity:** correctness

For obligation (a), the `cross-source-shadow` cardinality ambiguity will cause two reasonable implementers to produce different wire-observable behaviour — one diagnostic vs N — for the same three-source input, breaking conformance. Obligations (b) and (c) are cosmetic and prose-correctness respectively; (c) additionally risks an implementer adding a `raw_response` field to `CancelledError` / `ContextOverflowError` schemas on the strength of the "rarely have one" hint, contradicting the schema declarations.

## Solution Space

**Shape:** single
**State:** reduced

Three independent clarity defects. Resolve in the order below: the two localised single-paragraph edits in `queryerror-variants.md` first, then the larger multi-file cardinality edit last so it diffs cleanly against the stabilised file.

### Step 1 — Fix "is now self-referential"
In `queryerror-variants.md`, replace *"The recursive `inner: QueryError` field is now self-referential within this section."* with *"The `inner: QueryError` field is self-referential: `InvokeError` may itself appear as `inner`, allowing nested invoke chains to surface the full chain."* (Or strike the sentence entirely, since the recursion is already visible in the schema syntax below it.) This drops the draft-history temporal qualifier.

### Step 2 — Reconcile "rarely have one" with the `CancelledError` / `ContextOverflowError` schemas
In `queryerror-variants.md`, replace *"`cancelled` and `context_overflow` rarely have one; `transport` failures by definition have no assistant response."* with *"`CancelledError` and `ContextOverflowError` do not declare a `raw_response` field (their schemas above carry only the listed fields); `TransportError` likewise carries no assistant response."* This makes the recap match the schema declarations directly above it and forecloses an implementer adding the field. Cross-check that no other section references a `raw_response` field on either variant before committing.

### Step 3 — Define `cross-source-shadow` cardinality for ≥3 sources
Adopt the single-diagnostic-listing-all-shadowed-paths shape to match DISC-4's already-pinned multi-collider convention (the per-shadow alternative is viable but introduces an asymmetry between the two sibling collision diagnostics that buys nothing).
- In `discovery-sources.md`, rewrite the Source-priority sentence to: *"When the same slash name resolves from two or more sources, the highest-priority source wins, every lower-priority candidate is shadowed, and a single `loom/load/cross-source-shadow` diagnostic is emitted naming the winning path and every shadowed path."*
- In `diagnostics/code-registry-load.md`, update the *Format* cell of the `cross-source-shadow` row to admit a list of losers: change `'<higher>' wins over '<lower>'` to `'<higher>' wins over <lower-list>`, with `<lower-list>` defined as a comma-separated list of `'<path>'` entries.
- In `placeholder-rendering-b.md`, add the `<lower-list>` placeholder definition and a second test vector covering a three-source shadow so the multi-loser rendering is pinned.

### Edge cases
- When extending the diagnostic template, add the list-valued `<lower-list>` placeholder definition to `placeholder-rendering-b.md` in the same edit as the template change; confirm the freeform-tail placeholder taxonomy there covers list-valued tails (or extend it explicitly) before adopting.
- (Step 2) Verify no other section of the spec references a `raw_response` field on `CancelledError` or `ContextOverflowError` before committing.

## Relationships

- T095 "ERR-7 lacks a defining anchor on the discovery pages, and the payload field carrying shadow/collision paths is unstated" - same-cluster (also touches the `cross-source-shadow` payload contract; resolving the cardinality here narrows but does not subsume the payload-field question there)

---

# T022 - Macrotask-yield primitive at the loop-iteration checkpoint is unspecified

**Kind:** implementability, prescription
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

PIC-10's `loop-iter` production-wiring rule in `host-interfaces-services.md` and the **Granularity** paragraph in `cancellation.md` both require `before(...)` to "release the event loop for one macrotask turn" before the signal-check, but neither names the concrete primitive that effects the release. The candidate Node primitives are not interchangeable: `queueMicrotask` and `Promise.resolve().then` schedule microtasks that never drain a pending macrotask and defeat the rule, while `setTimeout(fn, 0)` and `MessageChannel.postMessage` land in different (and version-dependent) loop phases. The rule's correctness depends on a check-phase release that pairs with the Pi-dispatched abort macrotask flipping `loomAbort.signal.aborted` (the lifecycle pinned at `#pi-slash-handler-promise-lifecycle-presupposition` in `host-interfaces-core.md`). Two implementers choosing different primitives produce observably divergent Esc-during-compute-bound-loop behaviour against the same Pi version.

## Solution approach

Amend PIC-10's `loop-iter` production-wiring bullet in `host-interfaces-services.md` (`#pic-10`) to require that `before(...)` releases the event loop via `setImmediate` (resolution on the check phase), and state in one clause why a check-phase release is the condition the macrotask-yield rule depends on. Update the **Granularity** paragraph in `cancellation.md` only as a cross-reference to the pinned primitive if needed for consistency.

## Solution constraints

- The `setImmediate` requirement applies to `loop-iter` only; the other checkpoint kinds (`query`, `tool-call`, `invoke`, `binder-call`) keep their existing resolution under PIC-10.
- The requirement is on production wiring only; test wiring under the `Checkpoint` seam retains PIC-10's existing test/production split and may substitute a synchronous resolution.

## Relationships

None

# T023 - "CIO-N rules above" and the five-site co-edit "(in this page)" point to anchors on the sibling page

**Kind:** implementability, placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`ceiling-invariants-and-audit.md` carries textual back-references to the CIO-1…CIO-6 interaction-order rules that claim those rules live "above" or "in this page", but the rules are defined on the sibling page `ceilings-3-and-4.md` under `#ceiling-interaction-order` (anchors `#cio-1`…`#cio-6`). The affected sites are the *Worked consequences* lede ("each illustrates one or more `CIO-N` rules above"), the unhyperlinked bullet tags such as `(CIO-3, CIO-4)`, and the *Five-site list co-edit obligation* ("MUST update the five-site enumeration in CIO-3 above (in this page)"). The "(in this page)" parenthetical is false, and the bare `CIO-N` tokens give an editor performing the five-site lock-step co-edit no working pointer to the rule they must satisfy.

## Solution approach

Replace each broken in-page CIO-N reference on `ceiling-invariants-and-audit.md` with an explicit cross-link to `ceilings-3-and-4.md`: point the *Worked consequences* lede at `#ceiling-interaction-order` and drop "above", link each worked-consequence bullet tag (`CIO-2`, `CIO-3`, `CIO-4`) to its `#cio-N` anchor, and rewrite the *Five-site list co-edit obligation* to link `CIO-3` to `#cio-3` while deleting "above (in this page)". Match the relative-link spelling already used by the two correct in-file CIO references so a path grep stays clean.

## Solution constraints

- Edit only `ceiling-invariants-and-audit.md`; the CIO-N rule definitions and their `#cio-1`…`#cio-6` anchors stay single-sourced on `ceilings-3-and-4.md` — do not move or duplicate them.

## Relationships

None

# T024 - Tool-calls / cancellation: four normative-prose escape hatches

**Original heading:** Tool-calls/cancellation clarity: "any internal failure that should cascade"; "etc." in a normative shape-violation set; "appropriate sub-variant"; child-invoke arm discriminator not exhaustive
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Four independent escape-hatch phrases sit on normative surfaces in `cancellation.md` and `tool-calls.md`. Each makes one rule indeterminate for a conforming implementer or a conformance-fixture author:

1. **Vague cascade authorisation (`cancellation.md`, *Forwarding into `loomAbort`*, tool-exposed-entry bullet).** "The runtime may also call `loomAbort.abort()` itself on any internal failure that should cascade." The MAY is keyed off an undefined predicate ("should cascade"), with no enumeration of which failure classes are eligible. Two implementers will draw the line differently — one cascades on every `internal-error`, another only on adapter-setup throws — and no fixture can adjudicate.

2. **Open-ended normative shape-violation set (`tool-calls.md`, *Non-conforming return shape*).** The list of envelope violations ends in "etc.": "the resolved value is not an object, `content` is not iterable, an entry is missing `type` / `text`, etc." This sits inside a rule that routes the violation to `loom/runtime/internal-error` with `details.kind = "tool-return-shape"` — i.e. the discriminator is normative, but its membership is open. A test author cannot enumerate the test matrix.

3. **Forward reference with no target (`cancellation.md`, *Propagation*).** "a child loom cancelling internally surfaces as `Err(QueryError { kind: "cancelled" })` (or the appropriate sub-variant) to the parent" — "appropriate sub-variant" is a dangling reference. The Surfacing rule below defines the actual sub-variants (`invoke_callee` vs bare `cancelled`), but Propagation never names it; a reader who stops at Propagation has no rule.

4. **Child-invoke surfacing arms are not jointly exhaustive (`cancellation.md`, *Surfacing*, third bullet).** "A child invoke whose signal aborts surfaces … as `Err(QueryError { kind: "invoke_callee", inner: { kind: "cancelled", ... } })` when the abort originated inside the child, or directly as `kind: "cancelled"` when the parent's own signal fired first." Two cases are unaddressed: (a) ordinary downward propagation — the parent's signal aborts and the child's derived signal aborts in consequence; the abort "originated" at the parent but the child observes it through its own signal, so neither arm clearly governs; and (b) a same-window race where both signals fire before either checkpoint observes one. There is no tie-break.

Each defect is small in isolation; together they are the same hazard repeated four times on tightly-coupled surfaces (cancellation propagation and tool-call lowering), so they share a polish pass.

## Spec Documents

- `docs/spec_topics/cancellation.md` — *Forwarding into `loomAbort`* (tool-exposed-entry bullet) (edited)
- `docs/spec_topics/cancellation.md` — *Propagation* (edited)
- `docs/spec_topics/cancellation.md` — *Surfacing* (edited)
- `docs/spec_topics/tool-calls.md` — *Outcome enumeration (normative)* → *Non-conforming return shape* (edited)
- `docs/spec_topics/errors-and-results/error-model.md` — *Runtime panics* (read-only, for cross-checking the cascade-eligible class set)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — *QueryError variants* (read-only, sub-variant names for Propagation forward-link)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently carries no authored leaves; `docs/plan.md` declares all phase sections empty.)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge on (1) which adapter/runtime failures cascade through `loomAbort.abort()`, (2) the closed membership of the `tool-return-shape` violation set used to compose conformance tests, and (4) what `Err` variant a downward-propagated child cancellation surfaces with. Defect (3) is structural rather than divergence-producing on its own, but it leaves the Propagation rule incomplete on its own page.

## Solution Space

**Shape:** single
**State:** reduced

Four independent escape-hatch obligations across `tool-calls.md` and `cancellation.md`. Resolve in the order below so each lands on a stable baseline: close the envelope set, then the cascade set, then the child-invoke partition, then the propagation forward-link (which must cite whatever sub-variant names the partition leaves behind).

### Step 1 — Convert "etc." into a closed envelope-violation set
In `tool-calls.md` *Non-conforming return shape*, replace "etc." with the closed enumeration of envelope conditions the runtime detects: resolved value is not an object; `content` is missing or not an iterable; any `content` entry is not an object; any entry's `type` is not `"text"`; any entry's `text` is missing or non-string. Provide this as a stable list for conformance fixtures to match against. Reconcile the decomposition with whatever the lowering wrapper in `host-interfaces-core.md` *Tool execution from loom code* actually performs — pick the decomposition that matches the lowering rule.

### Step 2 — Close the cascade-eligible failure set
In `cancellation.md`'s tool-exposed-entry bullet, replace "any internal failure that should cascade" with a closed enumeration of failure classes that MUST or MAY trigger `loomAbort.abort()` from the runtime side, tagging each MUST/MAY. Anchor the list to the runtime-defect surface in `errors-and-results/error-model.md` *Runtime panics* (cross-link to `#runtime-panics`, and add a forwarding note from Runtime panics back to the cascade rule if the prose lands the binding). State the open-set policy explicitly — "classes added to *Runtime panics* are cascade-eligible by default unless tagged otherwise" — to avoid recurring edits as new runtime-defect classes are added.

### Step 3 — Make the child-invoke surfacing arms jointly exhaustive
Restate the third Surfacing bullet in `cancellation.md` as a single decision with an exhaustive partition, pivoting on which signal the child's own cancellation checkpoint observed first:
- If the child observed its own derived signal aborting because the parent's signal fired (the downward-propagation case, including the same-window race), the surface is `kind: "cancelled"` (no `invoke_callee` wrapping) — the parent's own checkpoint will also surface `cancelled` on its next checkpoint, so the parent's `?`/`match` arms see a uniform `kind`.
- Otherwise — the child cancelled internally without the parent's signal having aborted — the surface is `kind: "invoke_callee", inner: { kind: "cancelled", ... }`.
- Tie-break for the same-window race: if both signals are observed aborted at the child's surfacing point, the parent-originated arm wins (i.e. bare `kind: "cancelled"`).

### Step 4 — Replace "appropriate sub-variant" with a concrete forward link
In `cancellation.md` *Propagation*, replace "(or the appropriate sub-variant)" with a parenthetical that names the actual sub-variants (as fixed by Step 3) and forward-links to the Surfacing rule that owns them — e.g. "(or the `invoke_callee`-wrapped form when the abort originated inside the child; see Surfacing below)".

### Edge cases
- (Step 1) The enumeration MUST be a superset of every condition the lowering wrapper actually catches, or a conforming runtime can fail a fixture by detecting a violation the spec did not list.
- (Step 2) Decide whether the runtime is *required* to cascade on `tool-return-shape` (treat-as-internal-error) or merely *permitted* to; the choice sets whether the cascade list is MUST or MAY for that class.
- (Step 3) The tie-break direction (parent-arm-wins) determines which variants the `invoke` parent's `?`/`match` arms must cover; greppable cross-check against the `invoke` worked examples in `invocation.md` is needed before landing.
- (Step 4) This forward-link must cite the sub-variant names left by Step 3; do not lock in a name before the partition is fixed.

## Relationships

- T025 "Shard-07 hidden-host assumptions and stale residue" - same-cluster (parallel multi-issue finding on the same files; independent edit)

---

# T025 - Shard-07 hidden-host assumptions and stale residue

**Original heading:** Tool-calls/cancellation/hard-ceilings hidden assumptions and cruft: Pi-tool schema retrievable/AJV-consumable; no output schema; slash handler idle-context `ctx.signal===undefined`; unhandledRejection timing; NOCEIL-3 V8 host; stale link/decision-log
**Original section:** docs/spec_topics/ tool-calls, cancellation, hard-ceilings
**Kind:** assumptions (shard-07), cruft (shard-07), error-model (shard-07)
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two unrelated problems are stacked under one bundled review heading.

*Host-platform presuppositions that the spec leans on but never pins.* Shard-07 makes five load-bearing assumptions about Pi and about the host JavaScript runtime that none of the existing PIC presupposition lists name, so a future Pi or Node change in any of them would silently degrade observable behaviour without surfacing against a named, re-auditable obligation:

1. `tool-calls.md` (the **Argument shape** paragraph and the `unknown_tool` arm of **Failures**) presupposes Pi retains the registered `ToolDefinition`'s input schema after registration *and* exposes it in a shape the loom-side AJV can consume at every code-side call to mount its "safety-net" validation; the schema-retention/AJV-consumability presupposition is unpinned.
2. The same paragraph asserts as flat fact that "Pi tool definitions ship an input schema but no output schema" — a Pi-side claim that no PIC inventory item or presupposition records, so a future Pi tool surface that adds an `outputSchema` (or that loom hosts in a non-Pi context tomorrow) finds the spec silently mis-modelled.
3. `cancellation.md`'s **Forwarding into `loomAbort`** rule that "the runtime MUST tolerate `ctx.signal` being `undefined` at slash-command entry" attributes this to a documented Pi behaviour ("Pi documents `ctx.signal` as `undefined` in idle, non-turn contexts") but never records it as a presupposition alongside the six on the [Pi-side slash-handler promise lifecycle (consumption posture)](../../docs/spec_topics/pi-integration-contract/host-interfaces-core.md#pi-slash-handler-promise-lifecycle-presupposition) list. A future Pi that flipped the idle-context value (e.g. minted a synthetic always-non-aborted signal) would re-enter the "depend on its truthiness" path the rule was designed to forbid, but the version-bump checklist would not catch it.
4. `cancellation.md`'s **Race semantics — swallowing-handler attachment on every abandonable Promise** rule pins a Node-specific microtask-vs-`unhandledRejection`-timing model: "a `.catch(() => {})` registered lazily after cancellation fires will not catch a rejection that has already been queued for `unhandledRejection`." The same body of words appears in the *Post-cancel resolution* bullet in `tool-calls.md`. This is a presupposition about *Node*'s `unhandledRejection` semantics, not about Pi; the spec does not name a host-runtime presupposition list against which a future Node policy change (e.g. the `--unhandled-rejections=warn-with-error-code` posture, or worker-thread isolates) would re-validate.
5. `ceiling-invariants-and-audit.md`'s NOCEIL-3 closure cites V8-specific failure modes in normative prose — `"FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"`, the `OOMErrorCallback` / `abort()` path, `--max-old-space-size`, `--heapsnapshot-near-heap-limit`. The four-axis closure that backs the `NOCEIL-1`…`NOCEIL-4` set is therefore complete *only* against a V8/Node host; on a non-V8 JavaScript host (a future loom port to QuickJS, Hermes, JavaScriptCore, etc.) the uncatchable-fatal arm's enumeration is incomplete and the closure is not actually closed. The V8/Node host is presupposed without being declared a precondition of the closure.

*Three small pieces of stale residue.* Independent of the assumption pins above:

6. `tool-calls.md` line 31 (the *Non-conforming return shape* bullet) and the following sentence end with `[Errors and Results — Runtime panics](./errors-and-results.md)` and `[Errors and Results](./errors-and-results.md)`, linking the hub rather than the `runtime-panics` anchor on `errors-and-results/error-model.md`. The peer link in the *Pre-evaluation setup throw* bullet on line 30 already uses the correct `./errors-and-results/error-model.md#runtime-panics` form. `ceiling-invariants-and-audit.md` has the same mistake at the `*invoke* panic mid-loop` bullet and at NOCEIL-3 (`../errors-and-results.md`). The unanchored links land readers on the hub, defeating the "Runtime panics" reference each citation site asks them to follow.
7. The *Outcome enumeration (normative)* paragraph in `tool-calls.md` introduces "Three further tool-side outcomes" and then lists four bullets (*Non-settling Promise*, *Pre-evaluation setup throw inside the `.loom`-callable adapter*, *Non-conforming return shape*, *Post-cancel resolution*). The count is wrong by one.
8. `ceiling-invariants-and-audit.md`'s ***loom 1.0.0 rejected-candidate record (closed).*** paragraph is a historical decision log: it enumerates three candidate ceilings considered and rejected during 1.0.0 (regex backtracking on built-ins, JSON-Schema width pathologies, pattern-match recursion depth) and explicitly tells future editors *not* to append to it. It conveys no obligation an implementer or future editor can act on — the four-axis check above already governs future ceiling edits — and is a closed decision-log surface of the kind GOV-22 retires elsewhere.

The hidden-assumptions cluster (1)–(5) is governance-grade load-bearing material; the cruft cluster (6)–(8) is cosmetic-to-advisory editorial cleanup. The two clusters share no edit surface and should be resolved separately.

## Spec Documents

- `docs/spec_topics/tool-calls.md` — *Argument shape*, *Return type*, *Failures*, *Outcome enumeration (normative)* paragraphs (edited)
- `docs/spec_topics/cancellation.md` — *Forwarding into `loomAbort`* (slash-command entry bullet) and *Race semantics — swallowing-handler attachment on every abandonable Promise* paragraphs (edited)
- `docs/spec_topics/hard-ceilings/ceiling-invariants-and-audit.md` — NOCEIL-3 bullet, *Worked consequences* (`invoke` panic mid-loop), and *loom 1.0.0 rejected-candidate record (closed)* paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — *Pi-side slash-handler promise lifecycle (consumption posture)* paragraph (edited; landing site for new presuppositions (vii)+ covering the Pi-tool schema-retention/no-output-schema/idle-context claims)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — *Editorial-review checklist for unpinned host presuppositions* (edited; receives new checklist items mirroring the new presuppositions)
- `docs/spec_topics/errors-and-results/error-model.md` — `runtime-panics` anchor (read-only; destination of the corrected links)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(`docs/plan.md` lists no leaves yet.)

## Consequence

**Severity:** correctness

The five unpinned presuppositions are the real cost: each one is load-bearing for a normative MUST that would silently degrade — silent Pi-tool validation-mismatch handling, a silently mis-modelled Pi tool-output surface, the slash-handler forwarding path degrading to a no-op against a future Pi `ctx.signal` change, the swallowing-handler obligation becoming unsound against a future Node `unhandledRejection` policy, and the four-axis closure becoming incomplete on a non-V8 host. The version-bump checklist explicitly exists to catch silent host drift; these obligations bypass it. The stale-link / off-by-one-count / closed-decision-log items are cosmetic-to-advisory editorial residue that do not affect correctness but do degrade the spec's navigability and signal-to-noise.

## Solution Space

**Shape:** single
**State:** reduced

Two independently-resolvable obligations with no shared edit surface: pinning the five host-platform presuppositions, and clearing the editorial residue. Land the editorial cleanup first so the presupposition-pinning pass diffs cleanly as a substantive change rather than a mixed bag of cosmetic and load-bearing edits.

### Step 1 — Editorial cleanup of stale residue
Three independent micro-edits, no normative content change:
- In `tool-calls.md`, fix the two anchorless `errors-and-results.md` links on lines 31 and 33 to the `./errors-and-results/error-model.md#runtime-panics` form already used on line 30. Apply the same fix to `ceiling-invariants-and-audit.md`'s *invoke* panic mid-loop bullet and NOCEIL-3 (`../errors-and-results.md` → `../errors-and-results/error-model.md#runtime-panics`).
- In `tool-calls.md`'s *Outcome enumeration (normative)* paragraph, change "Three further tool-side outcomes" to "Four further tool-side outcomes" to match the four bullets below it.
- In `ceiling-invariants-and-audit.md`, delete the ***loom 1.0.0 rejected-candidate record (closed).*** paragraph; the four-axis check above already governs future ceiling edits and the closed sub-list provides no actionable obligation. If the worked examples have residual didactic value, move the three sentences to a non-normative footnote at the bottom of the page or to `docs/spec_topics/future-considerations.md`; do not retain them inline in a normative governance paragraph.

### Step 2 — Pin the five host-platform presuppositions on an audited list
Put presuppositions (1)–(5) on the same footing as the six already enumerated on the Pi-side slash-handler promise lifecycle list (`host-interfaces-core.md#pi-slash-handler-promise-lifecycle-presupposition`), splitting Pi-SDK presuppositions from host-runtime ones, and forward-link every consumption site instead of asserting the posture inline.
- On `host-interfaces-core.md`, extend the existing Pi-side presupposition list (or open a sibling *Pi-tool-surface consumption posture* block) with: (vii) Pi-tool input-schema retention and AJV-consumable shape at code-side call time; (viii) Pi-tool definitions ship no `outputSchema`; (ix) the idle-context `ctx.signal === undefined` Pi posture cited from `cancellation.md`. Give each an `<a id>` anchor.
- Open a parallel *Host-runtime consumption posture* block (on `host-interfaces-core.md` or `host-prerequisites.md`) for the Node/V8 entries: (x) Node `unhandledRejection` is unsuppressed by a `.catch` handler not attached before the first microtask boundary; (xi) NOCEIL-3's uncatchable-fatal closure is scoped to V8-class hosts (the engine-fatal enumeration is taken against V8; a future port to another JS engine requires re-validating the closure).
- On `version-bump-step2.md`, add corresponding *Editorial-review checklist* items keyed to each new anchor: (vii)–(ix) are Pi-bump items; (x)–(xi) escalate on a Node major or host-engine change.
- Rewrite the consumption sites to forward-link the new anchors instead of asserting the posture inline: *Argument shape* and the `unknown_tool` arm in `tool-calls.md`; the *Forwarding into `loomAbort`* slash-command-entry bullet in `cancellation.md`; the *Race semantics — swallowing-handler attachment* paragraph in `cancellation.md` and the *Post-cancel resolution* bullet in `tool-calls.md`; and NOCEIL-3 in `ceiling-invariants-and-audit.md`.

### Edge cases
- (Step 1) For the rejected-candidate-record deletion, ensure the four-axis *Routing obligation* prose above remains self-contained: it references the closed record in the "future spec-editors performing the four-axis check supply their own per-edit rationale rather than appending to this loom 1.0.0 worked-examples sub-list" clause, which must be rewritten to drop the back-reference.
- (Step 1) Defer the rejected-candidate-record deletion if the related finding that proposes moving all ceiling-set maintenance content to a governance page is being addressed in the same loop iteration — that finding subsumes this sub-edit. The link fix and count fix carry no such dependency.
- (Step 2) Decide the Pi-side vs host-runtime split for (x)/(xi) before writing the anchor block; the existing six-presupposition list is Pi-side only, and misrouting a host-runtime presupposition onto it would ask the SDK-surface inventory test to assert non-SDK properties and put the wrong items on the wrong version-bump checklist.

## Relationships

None

---

# T026 - `loom/parse/type-alias-cycle` cycle-chain rendering is unspecified

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The `loom/parse/type-alias-cycle` row in `code-registry-parse.md` carries the *Message* template `type-alias cycle: <path>`, which renders via the §5 source-derived rule in `placeholder-rendering-b.md` as a single path-literal. The diagnostic, however, reports a cycle through one or more schema names (e.g. `X → Y → X`), so the `<path>` rule cannot produce the intended rendering. The two sibling cycle rows (`loom/load/import-cycle`, `loom/load/invocation-cycle`) spell the chain form — separator, head-repetition, per-element shape — explicitly in their *Message* templates, but this row does not, leaving the separator, head-repetition, and length->2 layout undefined. Under DIAG-4's byte-exact *Message* contract, two conforming implementations diverge and any test sourcing the expected string from the column is unwriteable.

## Solution approach

Rewrite the `loom/parse/type-alias-cycle` row's *Message* template in `code-registry-parse.md` from `type-alias cycle: <path>` to `type-alias cycle: <name1> → <name2> → <name1>`, reusing the category-7 identifier-shaped placeholders `<name1>`/`<name2>` already registered in `placeholder-rendering-b.md`. Pin the chain-layout convention in the row's *Trigger* prose — elements in declaration order along the detected cycle, ` → ` (space, U+2192, space) as the separator, head element re-emitted at the tail — mirroring the sibling `import-cycle` and `invocation-cycle` rows. Add a forward-link from the illustrative cycle example in `schemas.md` to the registry row as the authoritative source.

## Solution constraints

- None.

## Relationships

- T027 "`<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined" - same-cluster (another DIAG-4 byte-exactness gap on a parse/load registry row).
- T075 "Bare-source backslash: no diagnostic code is named" - same-cluster (touches `type-alias-cycle` but covers a different concern — the missing diagnostic code for a bare-source backslash; the `type-alias-cycle` mention there is only preamble).

# T027 - `<key>` rendering for `loom/load/settings-value-out-of-range` is undetermined

**Original heading:** `` `settings-value-out-of-range` `<key>` form (dotted `looms.` vs bare) is unspecified ``
**Original section:** docs/spec_topics/diagnostics/
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The `loom/load/settings-value-out-of-range` row in `diagnostics/code-registry-load.md` declares the Message template `settings key <key> value is out of range; got <observed>` and lists the four recognised scalar keys bare in its *Trigger* prose (`binderModel`, `scanPackages`, `scanPackagesMaxFiles`, `scanPackagesTimeoutMs`), while every other surface — `discovery/package-and-settings.md`'s settings inventory, `binder/binder-model-and-context.md`, `frontmatter/frontmatter-fields-a.md`, the glossary, and the hot-reload `loom-system-note` template — names the keys dotted as `looms.binderModel`, `looms.scanPackages`, etc.

`<key>` is the category-5 source-derived placeholder, whose §5 rule in `diagnostics/placeholder-rendering-b.md` quotes the rendered value with double quotes when it is *not* identifier-shaped per `[A-Za-z_][A-Za-z0-9_]*`. The dotted form (`looms.binderModel`) fails that predicate (the `.` is rejected) and would render double-quoted; the bare form (`binderModel`) is identifier-shaped and would render bare. With the row never pinning which form the renderer feeds into the placeholder, the emitted Message is one of two byte-distinct strings, and DIAG-4's byte-exact-renderer requirement turns that ambiguity into a conformance defect.

This is the only settings-keyed parsed-scalar row in the registry; the analogous frontmatter peer `loom/load/frontmatter-value-out-of-range` avoids the problem entirely by routing through the closed-enum `<dotted-key>` placeholder (§7), whose value table fixes the rendered text to `tool_loop.max_rounds` / `respond_repair.attempts` unquoted. The settings-keyed row has no equivalent fix-up.

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/settings-value-out-of-range` row (edited)
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md` — §5 `<key>` rule, §7 closed-enum table, *Test vectors* (edited)
- `docs/spec_topics/discovery/package-and-settings.md` — *Settings file reads* / *Scalar-key validation* (read-only)
- `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — §8 strict-equality build-time prohibition exemption list (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

## Consequence

**Severity:** correctness

Two conformant renderers, both following the spec literally, can emit byte-distinct Messages (`settings key "looms.binderModel" value is out of range; got null` vs `settings key binderModel value is out of range; got null`) for the same fault. The §8 parsed-scalar carve-out explicitly allows tests to assert byte-identical equality against this row's full Message, so the divergence is directly observable as a cross-implementation test failure.

## Solution Space

**Shape:** single
**State:** reduced

Mint a new §7 closed-enum placeholder `<settings-key>` whose closed value table is the four recognised keys in their canonical dotted form (`looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, `looms.scanPackagesTimeoutMs`), rendered verbatim and unquoted. Retarget the `loom/load/settings-value-out-of-range` Message template from `<key>` to `<settings-key>`. This extends the pattern already established for `<dotted-key>` on the frontmatter peer row, lets the two parsed-scalar rows share a uniform rendering shape (`got <observed>` preceded by an unquoted dotted key), and pins the rendered string by construction with a GOV-7/GOV-8-versioned closed set so additions stay visible.

### Spec edits

- `diagnostics/code-registry-load.md`: change the Message template to `settings key <settings-key> value is out of range; got <observed>`; rewrite the *Trigger* prose to list the keys dotted (`looms.binderModel`, `looms.scanPackages`, `looms.scanPackagesMaxFiles`, `looms.scanPackagesTimeoutMs`) so the row's surfaces stop disagreeing with the rest of the corpus. State in this file that adding a `looms.*` scalar key to the discovery inventory MUST also extend the `<settings-key>` closed-enum table in the same edit (the GOV-7 review-gate convention already used for `<dotted-key>` and `<cap>`).
- `diagnostics/placeholder-rendering-b.md` §7 *Placeholders* list: add `<settings-key>`; add a *Closed-enum* sub-bullet pinning the four-member table; add a test vector showing a `loom/load/settings-value-out-of-range` for `looms.binderModel: null` rendering `settings key looms.binderModel value is out of range; got null`.
- `diagnostics/placeholder-rendering-b.md` §8 *Edge cases — Category 7 closed-enum closure*: extend the spec-versioned list to include `<settings-key>`.

### Edge cases

- `looms.scanPackages` is the only boolean-typed key; the test-vector set should cover both a numeric-out-of-range case (`looms.scanPackagesMaxFiles: 0`) and a kind-mismatch case (`looms.scanPackages: "true"`) to demonstrate the unquoted key rendering survives different `<observed>` kinds.
- §8's strict-equality build-time prohibition exemption already names `loom/load/settings-value-out-of-range` as a parsed-scalar carve-out — that exemption is unchanged by the new placeholder (Message remains fully byte-identical) and needs no edit.
- Confirm `<settings-key>` does not collide with any existing placeholder token across the four registry tables before minting it.
- The two-site coupling (discovery inventory ↔ `<settings-key>` table) is a real maintenance edge: an author adding a fifth `looms.*` scalar must extend the table in the same edit; the GOV-7 review gate covers this.

## Relationships

- T026 "`loom/parse/type-alias-cycle` cycle-chain rendering is unspecified" - same-cluster (sibling DIAG-4 byte-exactness gap caused by an underspecified placeholder rendering, resolved independently)
- T028 "Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster" - same-cluster (placeholder-categorisation hygiene in the same files; resolves independently)

---

# T028 - Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster

**Kind:** naming
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 5
**Shape:** single
**State:** reduced

## Problem

The seven-page diagnostics cluster drifts on the labels readers and tests must key on, eroding DIAG-4's contract that tests source the rendered string from the canonical *Message* column. `code-registry-runtime.md`'s table header reads `Message template` and `code-registry-host.md`'s reads `Severity` / `Anchor`, where the parse and load tables (and DIAG-4) canonicalise `Message`, `Sev`, and `Spec rule` — so tooling keyed on the canonical names silently skips those two tables. `code-registry-host.md`'s `loom/host/*` H3 (`host-observed anomalies`) names only one arm of the two-arm namespace its own intro paragraph defines. In `placeholder-rendering-b.md`, §7 files `<reason>` under `Closed-enum` despite its open `String(event.reason)` / `<unreadable>` fallback arm, §8 titles `<observed>` `Host-derived freeform-tail` despite its parsed-scalar and `host-incompatible` closed-literal arms, and the `placeholder-rendering-{a,b}.md` file stems convey no scope to a reader following an inbound link.

## Solution approach

Rename `code-registry-runtime.md`'s `Message template` column header to `Message`, and `code-registry-host.md`'s `Severity` / `Anchor` headers to `Sev` / `Spec rule`, matching the canonical names the parse and load tables and DIAG-4 use. Rewrite `code-registry-host.md`'s `loom/host/*` H3 to name both namespace arms consistent with its intro paragraph. In `placeholder-rendering-b.md`, move `<reason>` out of the `Closed-enum` sub-rule into one that names both its closed-arm and open-fallback paths, and re-title §8 so `<observed>`'s host-derived, closed-literal, and parsed-scalar arms are all admitted. Rename the `placeholder-rendering-{a,b}.md` files to stems that name their covered placeholder categories and repoint every inbound link across `docs/spec_topics/diagnostics/**` in the same commit.

## Solution constraints

- Out of scope: §8's `<failure>` carve-out, which is correctly framed as not a §8 placeholder — leave its prose unchanged when re-titling §8.

## Relationships

None

# T029 - Diagnostics shard: residual cruft and three unfalsifiable normative obligations

**Original heading:** Diagnostics cruft / testability: migration HTML comments, "previously rode this row" / naming-history notes, deferred-fallback hint; unfalsifiable multi-violation ordering, unreachable-path MUST, mutual-exclusion guarantee
**Original section:** docs/spec_topics/diagnostics/
**Kind:** cruft, testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The diagnostics shard carries two distinct classes of defect that share a surface but resolve independently.

**Class A — residual editorial cruft in normative cells.** Five sites carry text that conveys no requirement to an implementer:

1. `code-registry-load.md`, end-of-file HTML comment: `<!-- loom/runtime/* registry now lives on code-registry-runtime.md; the former empty #loom-runtime-namespace stub anchor here was removed (no inbound links). -->` — a migration log of a past refactor.
2. `code-registry-load.md`, `loom/load/unreadable-source` *Trigger*: "The per-read-timeout sub-trigger that **previously rode this row** now has its own code, `loom/load/package-read-timeout` (see the row below)." — naming history embedded in a normative trigger cell.
3. `code-registry-load.md`, `loom/load/cross-format-collision` *Trigger*: "The code name retains the historical `cross-format` token as a stable diagnostics-contract identifier per [Diagnostic shape — DIAG-3](diagnostic-shape.md#diag-3)" — rationale for why the code was not renamed, governed already by DIAG-3.
4. `code-registry-load.md`, `loom/load/typed-query-unsupported-provider` *Hint*: "Switch to a supported provider, drop the typed-query expressions, **or wait for the deferred JSON-mode fallback in [Future Considerations](../future-considerations.md)**." — a stretch-goal forward-reference inside author-facing remediation guidance.
5. `code-registry-host.md`, `loom/host/session-shutdown-runtime-degraded` *Trigger*: two inline anchors `<a id="runtime-degraded-emission-condition">` and `<a id="runtime-degraded-co-emission">`. A full-corpus grep across `docs/` finds zero inbound links to either anchor; the sibling `<a id="cancelled-by-session-shutdown-mutual-exclusion">` on the same page is referenced from `session-shutdown-semantics.md` and `session-only-degraded-state.md`, so absence-of-references here is not a discovery artefact.

**Class B — three normative obligations with no falsifying acceptance criterion.**

1. `code-registry-runtime.md`, `loom/runtime/internal-error` *Trigger* (the tool-return-envelope `shape_check` priority rule): *"When a single envelope violates more than one check, the runtime emits the first-failing token in that listed order…"* The five tokens (`resolved-not-object`, `content-not-iterable`, `entry-missing-type`, `entry-missing-text`, `other`) form a strict priority order, but every documented test exercises only single-violation paths. An implementation that ignores the ordering rule entirely passes every test — the MUST is unfalsifiable.
2. `placeholder-rendering-a.md` §4 (Numeric placeholders): the rule asserts that `Infinity`/`NaN` are *"unreachable by construction"* and then attaches a MUST that a renderer encountering one route it through `loom/runtime/internal-error`. Because the path is spec-guaranteed unreachable, no valid test input can exercise the obligation; an implementation that omits the guard is indistinguishable from one that includes it.
3. `code-registry-host.md`, `loom/host/session-shutdown-pinned-constant-unreadable` *Trigger*: *"This code and `loom/host/session-shutdown-reason-unknown` are **mutually exclusive**…"* The guarantee is normative (it prevents a misleading `event.reason outside closed set: quit` rendering on snapshot-corruption + valid-reason coincidence), but no acceptance scenario for the simultaneous-trigger case is documented. An implementation that emits both diagnostics on that simultaneous path violates the guarantee silently.

The two classes share the same files but are mechanically independent: Class A is pure deletion, Class B requires new acceptance criteria plus one MUST→SHOULD demotion.

## Spec Documents

- `docs/spec_topics/diagnostics/code-registry-load.md` — end-of-file HTML comment; `loom/load/unreadable-source` *Trigger*; `loom/load/cross-format-collision` *Trigger*; `loom/load/typed-query-unsupported-provider` *Hint* (edited)
- `docs/spec_topics/diagnostics/code-registry-host.md` — `loom/host/session-shutdown-runtime-degraded` *Trigger* (orphaned anchors); `loom/host/session-shutdown-pinned-constant-unreadable` *Trigger* (mutual-exclusion criterion) (edited)
- `docs/spec_topics/diagnostics/code-registry-runtime.md` — `loom/runtime/internal-error` *Trigger* (multi-violation `shape_check` ordering criterion) (edited)
- `docs/spec_topics/diagnostics/placeholder-rendering-a.md` — §4 Numeric placeholders, unreachable-path MUST (edited)
- `docs/spec_topics/diagnostics/diagnostic-shape.md` — DIAG-3 (read-only; referenced from the deleted cross-format rationale)
- `docs/spec_topics/pi-integration-contract/session-only-degraded-state.md` — confirms `#cancelled-by-session-shutdown-mutual-exclusion` is referenced (so its sibling anchors' orphan status is not a search artefact) (read-only)
- `docs/spec_topics/pi-integration-contract/session-shutdown-semantics.md` — same (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan currently contains no leaves; no acceptance criteria are blocked or modified.)

## Consequence

**Severity:** advisory

The cruft items add reader friction and the risk of stale forward-references but block no implementer. The three testability gaps are more substantive: two reasonable implementers can produce divergent wire output (a wrong-priority `details.shape_check` token, a co-emitted `reason-unknown` + `pinned-constant-unreadable` pair on a corrupted snapshot) while both pass every documented test, undermining the diagnostic shape contract that downstream operator-tooling depends on.

## Solution Space

**Shape:** single
**State:** reduced

Resolve in two sequential phases: first delete the editorial cruft (pure deletions across five small cells, landing a stable baseline with no normative additions), then anchor the three unfalsifiable normative obligations on the quieter resulting surface. Splitting the work this way keeps each diff small enough that the next pass's lenses critique the new acceptance criteria rather than re-flagging deleted cruft.

### Spec edits — deletions (apply first)

- `code-registry-load.md`: delete the end-of-file HTML comment in full.
- `code-registry-load.md`, `unreadable-source` *Trigger*: delete the sentence beginning "The per-read-timeout sub-trigger that previously rode this row…". The separately-tabled `loom/load/package-read-timeout` row already conveys the actionable fact; no forward-pointer is needed.
- `code-registry-load.md`, `cross-format-collision` *Trigger*: delete the clause "The code name retains the historical `cross-format` token as a stable diagnostics-contract identifier per [Diagnostic shape — DIAG-3](diagnostic-shape.md#diag-3);" leaving only "Its scope is the full same-priority slash-name collision rule, not only the cross-format arm."
- `code-registry-load.md`, `typed-query-unsupported-provider` *Hint*: delete the third option, leaving "Switch to a supported provider, or drop the typed-query expressions."
- `code-registry-host.md`, `session-shutdown-runtime-degraded` *Trigger*: delete `<a id="runtime-degraded-emission-condition"></a>` and `<a id="runtime-degraded-co-emission"></a>`. Before deleting, re-run `grep -rn '#runtime-degraded-emission-condition\|#runtime-degraded-co-emission' docs/` and only proceed if zero hits are returned; the sibling `#cancelled-by-session-shutdown-mutual-exclusion` anchor stays — it is referenced.

### Spec edits — normative anchoring (apply second)

- `code-registry-runtime.md`, `loom/runtime/internal-error` *Trigger*: append an acceptance criterion for the multi-violation case: *"When a tool envelope's resolved value is `null`, `details.shape_check` MUST be `"resolved-not-object"` and MUST NOT be `"other"` even though `null` also satisfies the `other` catch-all. When the envelope is `{ content: 7 }` (a non-iterable `content` on an object), `details.shape_check` MUST be `"content-not-iterable"`."* Two vectors suffice to discriminate any wrong-priority implementation.
- `placeholder-rendering-a.md` §4: demote the guard sentence "a renderer that nonetheless encounters one MUST surface it through `loom/runtime/internal-error`" to a non-normative parenthetical: *"(Implementations MAY route a stray `Infinity`/`NaN` through `loom/runtime/internal-error` as a defence-in-depth; the path is unreachable by construction in conformant emitters.)"* Phrase the replacement so the unreachability premise is the explicit precondition, so the relationship survives a future audit that weakens the premise.
- `code-registry-host.md`, `session-shutdown-pinned-constant-unreadable` *Trigger*: append an acceptance criterion for the simultaneous-trigger case: *"When the handler-entry pinned-constant lookup fails AND `event.reason` is a member of the closed set (e.g. `"quit"`), the handler MUST emit exactly one diagnostic with code `loom/host/session-shutdown-pinned-constant-unreadable` and MUST NOT emit any diagnostic with code `loom/host/session-shutdown-reason-unknown` for the same event."*

### Edge cases

- The orphan-anchor deletion is only safe under fresh corpus-grep evidence (anchors can acquire inbound links between review passes); re-run the grep immediately before the edit.
- The multi-violation acceptance criterion must pick vectors that actually discriminate priority: a `null` value falsifies any implementation that defaults to `"other"`; `{ content: 7 }` falsifies any that short-circuits on `entry-missing-type` ahead of `content-not-iterable`.

## Relationships

- T028 "Diagnostics surface: column-header, sub-rule-category, and file-name labels drift across the seven-page cluster" - same-cluster (same shard, independent naming concerns)
- T030 "Three unsourced Pi-SDK behavioural assertions in the diagnostics cluster" - same-cluster (same shard, independent assumption concerns)

---

# T031 - Echo destination for subagent-mode slash invocations is not pinned

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`defaulting-system-note-echo.md` §"Echo policy" says the runtime appends the success-echo system note to "the user's session", but for a subagent-mode slash invocation the caller's Pi session and the loom's spawned `AgentSession` are distinct surfaces — a distinction the binder hub (`binder.md`) draws explicitly while the echo-policy sentence inherits none of it. The same gap applies to the failure-arm echoes (`needs_info`, `ambiguous`, cancelled-binder, transport- and malformed-envelope failures) routed through `determinism-cancellation-failure.md` §"Failure modes", which also say "the user's session" without naming a mode. An implementer must reconstruct which surface receives the echo rather than reading it off the page, leaving the destination — observable to conformance tests and renderer integrations — implicit.

## Solution approach

In `defaulting-system-note-echo.md` §"Echo policy", clarify that the echo destination is the caller's Pi session for both prompt-mode and subagent-mode looms, and never the spawned subagent conversation. Carry the same destination disambiguation to `determinism-cancellation-failure.md` §"Failure modes", where the failure-arm echoes also say "the user's session" without naming a mode.

## Solution constraints

- None.

## Relationships

- T086 "`bind_echo` no-params diagnostic: trigger condition unpinned and overlaps the single-string-bypass code" - same-cluster (both touch the Echo policy section; resolve independently)

# T032 - Single-string-bypass disposition of `bind_model:` and `bind_context:` is unspecified

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

The single-string-bypass bullet (#2 under `## Binder bypass` in `binder-bypass-and-envelope.md`) does not state the disposition of the three `bind_*` frontmatter fields, whereas the parallel no-params bullet (#1) pins all three. An implementer has no rule for whether `bind_context:` or `bind_model:` declared on a single-string-bypass loom is silently ignored, warned, or load-failed — the bypass skips the binder call that would otherwise give those values meaning. `frontmatter-fields-a.md` makes `loom/load/binder-model-unresolved` conditional on the loom "not being bypass-eligible," implying `bind_model:` is permitted-but-unenforced on a bypass-eligible loom, but the disposition of an explicit value is never pinned. Two implementations will diverge on the load/no-load decision and on observable diagnostics.

## Solution approach

Rewrite the single-string-bypass bullet in `binder-bypass-and-envelope.md`'s `## Binder bypass` to state the disposition of all three `bind_*` fields, matching the no-params bullet where the semantics already coincide. For `bind_echo`, forward-link the existing `loom/parse/bind-echo-on-bypass` rule on `defaulting-system-note-echo.md` rather than restating it. Pin `bind_model:` and recognised `bind_context:` values (`none`, `session`) as silently ignored under the bypass, consistent with the `frontmatter-fields-a.md` bypass-eligibility carve-out.

## Solution constraints

- The `bind_context:` value-shape validation (`loom/load/unknown-bind-context-value` for values outside `none`/`session`) runs before bypass-eligibility is decided and MUST remain in force; the silently-ignored disposition applies only to recognised values.
- Out of scope: minting a new bypass-specific "no-effect" diagnostic for `bind_context: session`; the mode-scoped `loom/parse/bind-context-session-on-subagent` warning is not repurposed for the bypass case.

## Relationships

- T086 "`bind_echo` no-params diagnostic: trigger condition unpinned and overlaps the single-string-bypass code" - decision-overlap (this finding pulls the `bind_echo` rule out to the echo-policy page; that finding refines the `bind_echo` codes' boundaries)
- T102 "`bind_context` project-wide-inheritance parenthetical references a settings carrier that does not exist" - decision-overlap (constrains what "silently ignored (may be inherited from project-wide settings)" can claim for `bind_context:` on single-string bypass)

# T035 - `pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list

**Kind:** assumptions
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

`registration-steps.md` step 1 directs the factory to read `pi.getFlag('loom')` pre-bind — in the factory-time discovery walk and inside the `resources_discover` re-walk subscribed before any `session_start` — and `extension-bootstrap-and-per-loom.md` makes the extension fail fatally on `pi.registerFlag` failure precisely because step 1's discovery walk consumes the flag value via `pi.getFlag('loom')`. Step 2 then enumerates the pre-bind runtime in two lists: a safe-before-bind list (`registerCommand` / `registerTool` / `registerFlag` / `registerMessageRenderer` plus `refreshTools`) and a `notInitialized`-throwing list (`getCommands`, `getActiveTools`, the session-state action methods). `pi.getFlag` appears in neither. An implementer auditing the pre-bind runtime against step 2 cannot confirm the load-bearing step-1 read is contractually pre-bind-safe rather than coincidentally non-throwing at the current Pi-SDK pin, and `version-bump-step2.md` item (q)'s pre-bind re-audit has no `getFlag` entry to re-check on each Pi minor.

## Solution approach

In `registration-steps.md` step 2, add `pi.getFlag` to the safe-before-bind enumeration as a read sink and state the pre-bind callability contractually rather than descriptively — that `pi.getFlag` MUST be callable on the pre-bind runtime returned by `createExtensionRuntime()`, mirroring the register-sink phrasing. Add a bullet to `version-bump-step2.md` item (q) (anchor `#bump-checklist-pre-bind-and-renderer-resolution`) re-auditing that `pi.getFlag` still resolves on the pre-bind runtime on each Pi minor.

## Solution constraints

- Out of scope: `inventory-audit-intro.md`'s `#non-capability-pi-members` paragraph (owned by T036) — `pi.getFlag`'s surface existence is already pinned there; this finding adds only the behavioural pre-bind-safety claim, not a new inventory entry.

## Relationships

- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (the same step-2/step-3 boundary; both findings expose holes in the pre-bind / post-bind enumeration but resolve through independent edits)
- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (also concerns step-1/2 completeness of the registration-sink surface; resolves with its own edit to the numbered list)
- T041 "Shard-10 hidden assumptions and editorial cruft on the host-prerequisites / host-interfaces-core / host-interfaces-services / registration-steps page set" - same-cluster (umbrella finding noting unpinned behavioural presuppositions in registration-steps; this finding is one specific instance, but resolving it does not discharge the umbrella)

# T036 - `registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned

**Original heading:** `registerMessageRenderer` not placed in the numbered registration sequence; `registerFlag` options shape unpinned
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Two independent gaps appear in the same neighbourhood of the PIC bootstrap pages.

**(1) `registerMessageRenderer` has no ordinal position relative to step 1.** `registration-steps.md` numbers steps 1–5 as (1) `pi.registerFlag` + `resources_discover` subscription, (2) parse looms / build pending list, (3) `session_start` collision + `pi.registerCommand`, (4) `session_shutdown` subscription, (5) chokidar watcher + `LoomRegistry`. `pi.registerMessageRenderer` is named only inside step 2's safe-before-bind enumeration and inside `extension-bootstrap-and-per-loom.md`'s **Renderer registration** block, which requires it "synchronously inside the factory body, before the factory returns" without saying *when* relative to the numbered steps. Yet `extension-bootstrap-and-per-loom.md`'s **Extension-bootstrap SDK failures** list treats it as one of "the registration calls in steps 1–5," and its `pi.registerFlag` failure rule states that on a step-1 throw "the factory skips every subsequent `pi.register*` and `pi.on` call (steps 2–5 do not execute)." Whether `registerMessageRenderer` is among those skipped calls is load-bearing: if it runs **before** step 1, a step-1 fatal failure still emits its `loom/load/extension-bootstrap-failed` diagnostic via the persistent-transcript arm of the fallback chain (`sendSystemNote`); if it runs **after** step 1, the renderer is never registered, the persistent-transcript surface is unavailable, and the diagnostic must degrade to `ctx.ui.notify`. Two reasonable implementers will choose opposite orderings and produce observably different operator UX on the most-likely bootstrap failure path.

**(2) `pi.registerFlag`'s options parameter has no pinned declaration.** Step 1 calls `pi.registerFlag('loom', { type: 'string', description: … })` and `inventory-audit-intro.md`'s *Non-capability `pi.<member>` surfaces* paragraph pins that `pi.registerFlag` "is declared on the `ExtensionAPI` interface at `dist/core/extensions/types.d.ts`." Neither pin names the options-parameter interface (e.g. `RegisterFlagOptions`), enumerates its required/optional fields, or commits the loom-load-bearing subset (`type`, `description`) to a build-time surface check. Compare to the sibling treatment of `pi.getFlag`, which is pinned verbatim (`getFlag(name): boolean | string | undefined`). A Pi minor that renames the interface, narrows `type` to a closed string union excluding `'string'`, or makes `description` mandatory/forbidden will not be caught by the inventory-closure audit or by `SDK_SURFACE_INVENTORY` literal-read assertions — the failure surfaces as a runtime throw at step 1 against an unpinned host shape.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 (`pi.registerFlag` call site, `pi.getFlag` signature pin), step 2 (safe-before-bind enumeration, `SlashCommandInfo` build-time inventory MUST) (edited)
- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — **Extension-bootstrap SDK failures** ("registration calls in steps 1–5", `pi.registerFlag` failure rule); **Renderer registration** → *Lifecycle* → *Registration timing* (edited)
- `docs/spec_topics/pi-integration-contract/inventory-audit-intro.md` — **Non-capability `pi.<member>` surfaces** paragraph; **Inventory-closure audit** paragraph (edited)
- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step 0 factory-time host-binding call enumeration (read-only)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — item (q) editorial-review checklist for renderer-resolution behaviour (edited)
- `docs/spec_topics/discovery/discovery-sources.md` — `loom-flag-namespace` anchor (`pi.registerFlag('loom', …)` reference) (read-only)
- `docs/spec_topics/diagnostics/code-registry-load.md` — `loom/load/extension-bootstrap-failed` row's `<capability>` enumeration (read-only)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The project's plan currently has no leaves — `docs/plan.md` lists empty Horizontal / MVP / Vertical sections. When PIC leaves are authored, they will inherit these edits via the **Spec** field.)

## Consequence

**Severity:** correctness

Implementers will diverge on (1) whether `pi.registerMessageRenderer` runs before or after `pi.registerFlag`, producing different observable fallback-chain arms for the most-likely bootstrap failure; and on (2) the exact options-parameter shape passed to `pi.registerFlag`, since neither a TypeScript interface name nor a field-set pin exists, leaving the build-time surface-set-closure guarantee with a hole at this call site.

## Solution Space

**Shape:** single
**State:** reduced

Resolve two independent obligations sequentially: first add `registerMessageRenderer` to the numbered registration sequence (an ordering-only edit), then pin the `registerFlag` options-parameter interface and extend the SDK surface inventory on the resulting stable baseline. Stacking the inventory edit after the step-numbering is stable keeps each diff small and avoids rewriting cross-references twice.

### Spec edits — registration ordering (apply first)

- `registration-steps.md`: add a numbered step for `pi.registerMessageRenderer("loom-system-note", renderer)`, ordered **before** step 1, using "step 1a" (preserving existing step numbers) so the persistent-transcript surface is available when step 1's fatal failure path emits its `loom/load/extension-bootstrap-failed` diagnostic. The step body is a one-paragraph summary referring to `extension-bootstrap-and-per-loom.md` for normative detail, and explicitly states "registered **before** step 1's `pi.registerFlag` call, so that a step-1 fatal failure still has the persistent-transcript arm of the **System notes** fallback chain available."
- `extension-bootstrap-and-per-loom.md`, **Extension-bootstrap SDK failures** list: retitle the `pi.registerMessageRenderer` failure bullet from "(factory-time, step 0 having succeeded so the capability is present but the call itself rejects)" to "(factory-time, step 1a — registered before step 1)"; in the `pi.registerFlag` bullet change "steps 2–5 do not execute" to "steps 2–5 do not execute (step 1a's renderer registration, having already run, leaves the persistent-transcript surface available for this diagnostic)"; apply the same clause to the `pi.on` bullet.
- `extension-bootstrap-and-per-loom.md` → **Renderer registration** → *Registration timing*: change "synchronously inside the factory body, before the factory returns" to "synchronously inside the factory body, **before step 1's `pi.registerFlag` call** (per [Registration steps — step 1a](./registration-steps.md#…))."

### Spec edits — `RegisterFlagOptions` pin (apply second)

- `inventory-audit-intro.md`, **Non-capability `pi.<member>` surfaces** paragraph: append "`pi.registerFlag`'s options-parameter interface is `RegisterFlagOptions` (verify the exact name against `dist/core/extensions/types.d.ts` on each Pi minor bump), declared at the same Pi-SDK pin path. The loom-load-bearing field subset is `{ type: 'string' \| …; description?: string }`; loom 1.0 passes `type` and `description`. The build-time SDK surface inventory MUST list `RegisterFlagOptions` (and the closed-union shape of its `type` field) explicitly so a Pi minor that renames the interface or narrows `type` to exclude `'string'` fails the build." This adds the interface to the inventory alongside `SlashCommandInfo` and `SlashCommandSource`.
- `registration-steps.md` step 1: after the existing `pi.getFlag` declaration sentence, insert "`pi.registerFlag` is correspondingly declared as `registerFlag(name: string, options: RegisterFlagOptions): void` at the same path; the loom-load-bearing subset of `RegisterFlagOptions` is pinned at [Non-capability `pi.<member>` surfaces](./inventory-audit-intro.md#non-capability-pi-members)." This brings `pi.registerFlag` to parity with `pi.getFlag`'s pinning.
- `version-bump-step2.md`: add a new editorial-review checklist item (e.g. `(aa)`) for `RegisterFlagOptions` shape re-validation, mirroring item (q)'s structure.

### Edge cases

- When inserting step 1a, verify the diagnostic table's `<capability>` enumeration still reads correctly; "1a" avoids renumbering, but confirm no PIC page or `diagnostics/code-registry-load.md` cross-reference depends on a now-shifted meaning (`grep -rn 'step 1\|step 2\|step 3\|step 4\|step 5' docs/spec_topics/pi-integration-contract/`).
- The name `RegisterFlagOptions` is presumed; the spec language must hedge ("verify on next bump") until confirmed against `dist/core/extensions/types.d.ts`. If Pi declares the options parameter as an anonymous inline type rather than a named interface, the pin must name the structural shape and the surface inventory's literal-read assertion must target the field set rather than an interface symbol.

## Relationships

- T035 "`pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list" - same-cluster (sibling gap in step 1's pre-bind enumeration; resolved independently but on the same page)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (sibling step-3 read-failure gap)

---

# T037 - Loom-side `/reload` rules buried inside Pi-host presuppositions

**Kind:** placement (shard-10), scope (shard-10)
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`host-prerequisites.md`'s *Host prerequisites for the degraded-state branch* paragraph (c) (anchor `#degraded-state-host-prerequisites`) is scoped to Pi SDK behaviours no `dist/...d.ts` surface pins as a typed contract — a presupposition register the editorial-review bump checklist consumes. Embedded in it are two loom-side normative corollaries that belong elsewhere: corollary (c-i) is a carve-out on the loom-side drain-state-gated dispatch (the `LoomRegistry.readDrainState()` three-arm short-circuit), and corollary (c-ii) is a loom-side registration MUST NOT reserving the derived slash name `reload`. The canonical owners — `registration-steps.md` step 3's collision check and `drain-state-contract.md`'s *Methods* paragraph — never restate either rule, so an implementer working those pages has no in-page signal of them, and two reasonable implementers can each diverge into a runtime that disables the operator's `/reload` recovery path.

## Solution approach

Split paragraph (c) along the prose-vs-normative seam. Move the (c-ii) reserved-name drop to `registration-steps.md` step 3's existing cross-format collision-check site (`#slash-handler-registration`). Move the (c-i) short-circuit carve-out into `drain-state-contract.md`'s *Methods* paragraph alongside the `LoomRegistry.readDrainState()` arm enumeration, adding an anchor so `host-prerequisites.md` (c) can cite it. Trim host-prerequisites (c) to the Pi behavioural premise and add forward-links from it to both moved clauses so the editorial-review bump checklist (which keys on (c)) still reaches both.

## Solution constraints

- The reserved-name drop MUST execute in the same `session_start` pass as the cross-format collision check, sharing its `loom/load/cross-format-collision` diagnostic and de-registration symmetry, not as a separate parse-time rejection.
- The reserved-name drop MUST cover the DISC-4 basename-hyphen-normalised form (`re-load.loom` resolving to `reload`), not only the literal `reload` name.

## Relationships

- T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" - same-cluster (touches the surviving Pi-behavioural premise in host-prerequisites (c) that this finding leaves in place; the pointer-addition fix composes cleanly with the rule-extraction here)

# T038 - `loomAbort` construction, forwarding, and teardown rules duplicated in `host-interfaces-core.md`'s "Cancellation source" paragraph

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The "Cancellation source" paragraph in `host-interfaces-core.md` (anchor `#cancellation-source`) restates loom-runtime cancellation mechanism rules — `loomAbort` per-invocation `AbortController` construction, the three forwarding paths, the "MUST NOT use `ctx.signal` as the authoritative signal" reasoning, per-invocation `finally`-block listener teardown, and abort-reason propagation — that `cancellation.md` already owns normatively in its **Signal source**, **Forwarding into `loomAbort`**, and **Abort-reason propagation** paragraphs. The parallel normative MUSTs can drift silently when either page is edited, and the duplication only multiplies maintenance surface. The single piece unique to the PIC view is the Pi-side SDK presupposition the paragraph consumes: that Pi delivers an `AbortSignal` at `ctx.signal` and `tool.execute`'s `signal` parameter (with `ctx.signal` `undefined` in idle contexts) and that `CreateAgentSessionOptions` carries no `signal` field.

## Solution approach

In `host-interfaces-core.md`, trim the `#cancellation-source` paragraph to retain only the Pi-side SDK presupposition it uniquely owns — the two `dist/core/extensions/types.d.ts` entry-point declarations at the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) and the `CreateAgentSessionOptions` no-`signal` observation — deleting the runtime-mechanism rules and adding a forward-link to `cancellation.md`. Repoint the back-reference inside the adjacent "Pi-side slash-handler promise lifecycle (consumption posture)" paragraph's presupposition (v) from "the forwarding paragraph under **Cancellation source** above" to `cancellation.md`'s **Forwarding into `loomAbort`** section.

## Solution constraints

- None.

## Relationships

None

# T039 - Three implementation-structure MUSTs (re-entrant adapter, collision-source set, Checkpoint call sites) carry no observable acceptance criteria

**Original heading:** Code-side `MUST NOT serialise` re-entrancy, collision-source-set "single named set," and Checkpoint "MUST NOT add before() calls" lack observable acceptance criteria
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** testability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

Three normative clauses across the PIC seam pages constrain the *shape* of the implementation rather than its observable behaviour, and none of them is paired with an oracle a conformance test could fail:

1. **Adapter re-entrancy** (`extension-bootstrap-and-per-loom.md`, *Per-loom registration*, last paragraph): *"Adapter implementations MUST NOT serialise calls on shared closure state."* The text frames the requirement as a code-structure prohibition (don't take a lock on closure state) and gives no liveness witness — e.g. two parallel `execute` calls against the same `.loom` callable must both make progress within a bounded number of checkpoint turns. A conforming-by-mistake implementation that serialises through an `async` queue but completes promptly when the queue is short would satisfy any single-call test suite.
2. **Collision-source set "single named set"** (`host-interfaces-services.md`, *loom 1.0 seam — Pi-owned subagents collision source set*, PIC-20 callout): *"… MUST be defined as a single named set inside the runtime, consulted by the collision check via membership test rather than open-coded as three separate string comparisons or a hard-coded `switch`."* This prescribes the data structure (one `Set<string>`) and the access pattern (membership test, not comparison chain). It cannot be observed externally; an implementation using `if (s === "prompt" || s === "extension" || s === "skill")` produces identical collision diagnostics, so a future Pi minor that adds a fourth `SlashCommandSource` arm — the only motivating risk — would surface the regression at extension time, not in conformance.
3. **Checkpoint call-site closure** (`host-interfaces-services.md`, PIC-10 *`Checkpoint` seam*, second rule): *"Implementations MUST NOT add `before(...)` calls at any site not enumerated above."* This bans `before(...)` at unenumerated call sites in the implementation source, but the rule's observable companion — exactly one `before()` per enumerated checkpoint — is not stated as a counting requirement. The existing test-wiring narrative talks about *what a test can do with the seam* (fire `abort()` from inside `before(...)`), not about a check that asserts call multiplicity per checkpoint kind.

All three problems share the same root: the spec uses GOV-18 arm (a) to make seam *shapes* non-binding, but then uses MUST-level prose to constrain the *use* of those shapes in ways that no double or counting fake can witness. The Clock-ban sibling (PIC-12, last sentence) already shows the corpus's accepted pattern: a structural MUST plus an explicit *Non-normative implementation note* that the build-time grep-test is "an implementation choice, not an observable conformance point." The three clauses above need the equivalent demotion plus a behavioural Then-clause.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — *Per-loom registration*, adapter re-entrancy paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-10 *Checkpoint seam* rules block (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-20 *loom 1.0 seam — Pi-owned subagents collision source set* callout (edited)
- `docs/spec_topics/cancellation.md` — Granularity rule + Race semantics (read-only; defines the checkpoint enumeration the PIC-10 oracle must mirror)
- `docs/spec_topics/tool-calls.md` — Concurrency (read-only; defines parallel-tool-mode semantics the adapter re-entrancy oracle observes)
- `docs/spec_topics/governance/corpus-direction-and-scope.md` — GOV-18 arm (a) (read-only; the demotion these three clauses lean on)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently has no leaves authored; `plan.md` lists Horizontal, MVP, and Vertical sections all marked *No leaves yet*.)

## Consequence

**Severity:** correctness

Two reasonable implementers reading any of these three clauses can diverge: one writes a `Set<string>` / re-entrant adapter / single-call-site `before()`, the other writes a `switch` / queue-serialised adapter / scattered `before()`s, and both pass any conformance suite the spec authorises today. The first two divergences only bite at the next Pi minor bump (collision-source widening; tool-call parallelism regressions); the Checkpoint divergence directly threatens the two cancellation race rules PIC-10 exists to make testable, because an implementation that adds `before()` at extra sites can defeat the *no retroactive rewrite* and *no tail synthesis* guarantees the seam is meant to expose.

## Solution Space

**Shape:** single
**State:** reduced

Three structural MUSTs across two files each need an independently-designed behavioural oracle. Apply a shared template — demote each structural MUST to a Non-normative implementation note (in the GOV-18-arm-(a) style already used at PIC-12's Clock ban) and add one observable acceptance criterion — but resolve them in the order below because the second and third oracles lean on the first's counting fake for their observation wiring.

### Spec edits

1. **PIC-10 Checkpoint — counting double oracle.** In `host-interfaces-services.md` PIC-10's rules block, replace the second bullet's prohibition (*"Implementations MUST NOT add `before(...)` calls at any site not enumerated above"*) with a counting acceptance criterion: a conforming runtime, when driven through a fixture loom that exercises each `CheckpointKind` exactly once, MUST invoke `Checkpoint.before(kind, site)` exactly once per enumerated checkpoint (five kinds: `loop-iter`, `query`, `tool-call`, `invoke`, `binder-call`) — no more, no less, regardless of internal decomposition — stated as a counting `FakeCheckpoint` double's bookkeeping requirement. Add a *Non-normative implementation note* at the end of PIC-10 saying one mechanical witness is a build-time grep-test of `checkpoint.before(` call sites against the enumeration, parallel to the Clock-ban grep-test.
2. **Collision-source set — membership-test outcome oracle.** In `host-interfaces-services.md` PIC-20's callout, rewrite the MUST sentence (*"MUST be defined as a single named set … consulted by the collision check via membership test rather than open-coded as three separate string comparisons or a hard-coded `switch`"*) as a membership-outcome acceptance criterion: given a stubbed `pi.getCommands()` returning commands of each `SlashCommandSource` arm under the loom 1.0 Pi-SDK pin (`"prompt"`, `"extension"`, `"skill"`) plus one synthetic arm outside the set, the collision check MUST treat all three in-set arms as collision candidates and MUST silently ignore the out-of-set arm (no diagnostic, no throw). Move the "single named set" prescription into a parenthetical *Non-normative implementation note* immediately after. Rewrite the existing future-extension paragraph to say that widening the set under a future Pi minor turns the synthetic-arm test into a real in-set check, which is what makes the extension's loom 1.0 forward-compatibility free of further edits.
3. **Adapter re-entrancy — concurrent-execute liveness oracle.** In `extension-bootstrap-and-per-loom.md`'s *Per-loom registration* last paragraph, replace the prohibition (*"Adapter implementations MUST NOT serialise calls on shared closure state"*) with a liveness acceptance criterion grounded in the parallel-tool-mode semantics from `tool-calls.md`: when the model emits two parallel tool calls targeting the same `.loom`-callable, both adapter invocations MUST reach their first `before()` cancellation checkpoint within the same macrotask turn (the second call's progress is not gated on the first call's completion), and a conforming `FakeCheckpoint` observing both invocations MUST see both `before(...)` events before either underlying subagent completes. Add a brief cross-reference to PIC-10's `Checkpoint` seam as the observation point.

### Edge cases

- The PIC-10 counting requirement applies *per loom invocation*, not per runtime lifetime — re-entrant invocations have independent `Checkpoint` instances per the existing PIC-10 production-wiring rule. A future sixth `CheckpointKind` must update both the enumeration and the fixture (both live on the same page).
- The collision-set synthetic-arm injection must be done at the `pi.getCommands()` stub boundary, not inside the runtime's collision check, so the test needs no internal seam. If Pi's `SlashCommandSource` becomes more strongly typed than its current string-union form, the synthetic arm may require a TypeScript-level cast the test must justify.
- The re-entrancy fixture's two `execute` calls must be `await`ed in parallel via `Promise.all`, not sequentially, or the test passes trivially against a serialising implementation; a `FakeClock`-driven fixture makes the single-macrotask observation deterministic against test-runner scheduling.

## Relationships

- T015 "Clock-ban prohibition and cross-boundary depth-counter rule lack observable acceptance criteria" - same-cluster (sibling testability finding on shard-04; established the demote-to-non-normative pattern this finding inherits)
- T022 "Macrotask-yield primitive at the loop-iteration checkpoint is unspecified" - decision-overlap (PIC-10 is the seam under both; this finding's counting oracle and T022's primitive-name resolution should align on which yield mechanism the fixture observes)

---

# T040 - Host-prerequisites Pi-SDK-pin paragraph: skew-claim contradiction, review-gate verb drift, "one-character edit" misnomer, and unexpanded AJV

**Original heading:** Host-prerequisites clarity: "does not detect skew" vs "buys install-time skew detection"; MUST/SHOULD review-gate inconsistency; "one-character edit"; AJV unexpanded
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** clarity
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`docs/spec_topics/pi-integration-contract/host-prerequisites.md` carries four distinct editorial defects in the same neighbourhood of normative prose. They are independent — each has its own owning sentence(s) and its own fix — but they all land within the file's first sub-section and adjacent presupposition blocks, and a reader hitting any one of them is likely to hit the others. They are listed together here for triage; each is resolved separately.

**(1) Skew-claim contradiction.** Item 1 (Pi SDK pin) declares "no skew across the four is supported, and loom does not attempt to detect or accommodate skew." The *Deliberate deviation from Pi's bundled-package convention.* paragraph two paragraphs later then states that the tilde-pin "buys install-time skew detection on the package managers most production hosts use … causes the install to fail loudly when the host has resolved any of the four `@earendil-works/*` packages outside the pinned minor line." The two claims sit in the same item and are literally contradictory. The author's intent is clearly that the *runtime* does not detect skew but the *install* does; the bare "does not attempt to detect or accommodate skew" sentence overshoots that intent.

**(2) Review-gate verb drift across "on the same footing" presuppositions.** The *Host prerequisites for the degraded-state branch* preface declares that detection of a Pi minor violating any of presuppositions (a)–(d) "is by editorial review under [Pi version bump procedure]" and that "contributor-side editorial review against this enumerated list is the gate." Yet the verb attached to that gate diverges by presupposition: (c) uses **MUST** ("MUST be caught by editorial review under the bump procedure"); (d) uses **SHOULD** ("the contributor SHOULD confirm it by editorial review"); the **Host prerequisite for binder-model / `model:` load-time resolution** block uses **SHOULD** ("the contributor SHOULD re-confirm it"); the **Settings write-back key preservation** block uses **SHOULD** ("the contributor SHOULD re-confirm it"). Presuppositions (a) and (b) carry no explicit gate verb at all. A spec that calls these "on the same footing" and then attaches a different gate strength to each leaves a contributor genuinely unable to predict whether catching a (d)-class violation at bump time is mandatory or merely recommended.

**(3) "One-character edit" is wrong.** Item 1's framing for the single-source-of-truth pin reads: "each Pi minor bump is a one-character edit at this site rather than an N-site sweep." This is false for the pin's actual literal range `~0.75.5`: a minor bump to `~0.76.0` changes three characters; any bump crossing a digit boundary (e.g. `~0.99.0` → `~0.100.0`) extends the literal and changes more. The "one-site edit" property is what the surrounding lock-step machinery actually buys; the "one-character" claim mis-states it.

**(4) AJV unexpanded on first use.** The acronym AJV is used in normative PIC prose without ever being spelled out or glossed. First-use sites in the PIC shard include `host-interfaces-services.md` ("non-checkpoint synchronous work (AJV validation, schema lowering, default-merging)" and the `ValidationError` block mirroring "AJV's `ErrorObject` shape"), `extension-bootstrap-and-per-loom.md` ("the adapter MUST AJV-validate `params`"), `conversation-drive.md` ("the synthesised tool's `execute` AJV-validates"), and `runtime-event-channel.md`'s reachable-mask table. The glossary names AJV in several entries (`respond-repair`, `wire name`, `schema slug`) without ever defining it; no canonical page expands the acronym. Readers unfamiliar with the JSON-Schema validator ecosystem have nowhere to anchor the name.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — item 1 *Pi SDK pin* paragraph (skew-claim scoping) — (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — item 1 *Pi SDK pin* paragraph ("one-character edit" framing) — (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — degraded-state presuppositions (a)–(d), binder-model presupposition block, settings write-back presupposition block (review-gate verb alignment) — (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — first AJV use site, first-use-gloss target — (edited)
- `docs/spec_topics/glossary.md` — candidate gloss site if AJV is added as a glossary entry — (edited)
- `docs/spec_topics/pi-integration-contract/extension-bootstrap-and-per-loom.md` — read-only, second AJV reference site
- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — read-only, AJV reference site
- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — read-only, AJV reference site

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None — `docs/plan.md` exists but currently declares no leaves under any phase ("_(No leaves yet — author per the template.)_" under horizontal / MVP / vertical sections).

## Consequence

**Severity:** advisory

The skew-claim contradiction can mislead a future contributor (or a documentation-driven reviewer) into either weakening the install-time gate or adding a runtime skew probe the spec elsewhere explicitly disclaims. The review-gate verb drift leaves the bump checklist's strength genuinely ambiguous for three of the four presuppositions. The "one-character edit" misnomer and the unglossed AJV are cosmetic; neither blocks implementation. The bundle as a whole is editorial — none of it makes the contract inconsistent in a way that would cause divergent implementations on the load path itself.

## Solution Space

**Shape:** single
**State:** reduced

Resolve four independent obligations on the host-prerequisites Pi-SDK-pin paragraph in smallest-scope-first order so each diff stays small and lands on a stable baseline: gloss AJV, fix the "one-character edit" misnomer, scope the no-skew-detection claim to runtime, then align the review-gate verb across presuppositions (the largest and most consequential edit, reviewed last against a clean baseline).

### Spec edits

1. **Gloss AJV at first use.** Grep `AJV` in document-read order to find the corpus-wide first use (check `schema-subset.md`, `pi-integration.md`, and `host-interfaces-services.md`). Add a parenthetical expansion at that site: "AJV (the JSON-Schema validator the reference implementation uses; the abstract contract is the `SchemaValidator` seam, see Implementation Notes — Runtime)". Leave every other `AJV` mention intact. Optionally add a one-line glossary entry under `docs/spec_topics/glossary.md` keyed `AJV` pointing at the gloss site.
2. **Replace "one-character edit" with "one-site edit".** In item 1 of `host-prerequisites.md`, replace "each Pi minor bump is a one-character edit at this site" with "each Pi minor bump is a single-site edit at this anchor". Keep the surrounding "rather than an N-site sweep" clause — that is the actual property the lock-step buys.
3. **Scope the no-detection claim to runtime.** In item 1, change "loom does not attempt to detect or accommodate skew" to "loom does not attempt to detect or accommodate skew **at runtime**". Leave the *Deliberate deviation* paragraph's install-time-skew-detection language intact so the two paragraphs read consistently (install-time gates the skew; the runtime does not). Re-check the sentence two lines later ("Loom does not at runtime read `pi-coding-agent`'s `package.json` to verify the upstream pin…") — it is already runtime-scoped and still reads correctly.
4. **Align the review-gate verb to uniform MUST.** Replace the SHOULDs in item (d), the binder-model presupposition block, and the settings write-back presupposition block with MUST, matching (c); add an explicit MUST gate verb to (a) and (b) under the same uniformity rule. Justification: each presupposition, if violated by a Pi minor, silently breaks a load-bearing loom contract (degraded-branch recovery semantics, binder/`model:` load-time resolution, settings round-trip preservation), so none is a "best-effort" check, and the section preface's "on the same footing" framing reads most naturally when every member carries the same strength. If a uniform MUST cannot be defended for a specific presupposition (e.g. it is externally re-confirmable from Pi docs rather than only by source-diff), footnote that carve-out at the presupposition rather than weakening the whole set.

### Edge cases

- Place the AJV gloss only after confirming the true first-use site by grepping in document-read order; otherwise a later reader still hits an unglossed mention before the gloss.
- Choosing the wrong direction on the verb-alignment silently changes the procedural strength of contributor obligations; the uniform-MUST direction plus an explicit footnote for any deliberate SHOULD carve-out keeps the change auditable.

## Relationships

- T037 "Loom-side `/reload` rules buried inside Pi-host presuppositions" - same-cluster (touches presupposition (c) in the same file; this finding's edits to (c) should be sequenced after that finding's relocation, since moving (c-i)/(c-ii) out first reduces (c)'s edit surface)

---

# T041 - Shard-10 hidden assumptions and editorial cruft on the host-prerequisites / host-interfaces-core / host-interfaces-services / registration-steps page set

**Original heading:** Shard-10 hidden assumptions and cruft: `AgentSession.abort()`/`dispose()` behaviour unpinned; `resources_discover` reason literals; 250ms debounce burst-timing; deviation rationale, non-normative estimator note, fragile-evidence/argumentHint asides
**Original section:** docs/spec_topics/pi-integration-contract/ (host-prerequisites, host-interfaces-core, host-interfaces-services, extension-bootstrap-and-per-loom, registration-steps)
**Kind:** assumptions, cruft
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

The four shard-10 PIC pages (`host-prerequisites.md`, `host-interfaces-core.md`, `host-interfaces-services.md`, `registration-steps.md`) carry two unrelated problems that the source review bundled into one entry because they happened to sit on the same page set. They are separately resolvable and should not move together.

**Unpinned Pi behavioural presuppositions.** Three load-bearing Pi behaviours are consumed by normative spec text but have no entry in the *Editorial-review checklist for unpinned host presuppositions* under `version-bump-step2.md` (items (a)–(z)), so a Pi minor that changed them would not surface against any named checklist item:

1. *`AgentSession.abort()` / `dispose()` cancellation and teardown behaviour.* `host-interfaces-core.md`'s `AgentSession` paragraph and the **Cancellation source** paragraph rely on `abort()` actually tearing down the in-flight provider call and resolving once the agent is idle, and on `dispose()` actually removing listeners and disconnecting from the underlying agent. Item (n) explicitly audits the member *shape* only; the factory probe checks `typeof AgentSession.prototype.abort === "function"`; item (y) covers only the narrow `dispose()`-mid-unsettled-`abort()` overlap. Neither item audits that `abort()` and `dispose()` actually do what their names say — a Pi minor that retained both members as no-ops would pass every existing gate and silently leak subagent provider connections and break Esc-during-`@`-query forwarding.
2. *`resources_discover` event `reason` literal set.* `registration-steps.md` step 1 normatively distinguishes initial scan (`reason: "startup"`) from reload (`reason: "reload"`) and routes the project-root precedence rule (`event.cwd` preferred over the `FileSystem.cwd()` seam) off the event payload. The two literals and the payload shape (`{ cwd, reason }`) have no checklist item and are not enumerated by the SDK surface-inventory assertion (which covers only the seven named capabilities). A Pi minor that added a third reason (e.g. `"package-change"`) or removed `reason` would silently degrade either the startup-vs-reload discrimination or the per-event `cwd` precedence rule.
3. *250 ms debounce burst window vs editor write patterns.* `registration-steps.md` step 5 and `host-interfaces-services.md` PIC-14 fix the watcher debounce at 250 ms "to coalesce editor `change` + `rename` bursts". The numeric bound presupposes that the editors and platforms loom 1.0 supports do in fact complete their save bursts within 250 ms; the assumption is unstated and not audited. A platform whose editor save sequence routinely exceeds 250 ms would split one logical save across two registry rebuilds and emit a structural-change note that the operator did not cause.

**Editorial cruft on the same page set.** Six paragraphs across the four pages are non-normative asides or stale artefacts that the GOV-18 internals-prohibition discipline would strip:

- *Deliberate-deviation rationale* — `host-prerequisites.md`'s "Deliberate deviation from Pi's bundled-package convention" sub-paragraph justifies the tilde-pin choice against `pi-coding-agent`'s `packages.md`. The pin itself is normative; the justification is decision-log content.
- *Non-normative Pi-estimator algorithm note* — `host-interfaces-core.md`'s `estimateTokens` paragraph carries a labelled **Non-normative** orientation block describing how Pi's estimator counts UTF-16 code units, with a `"😀😀😀"`→2-token example. The block self-documents as orientation only and explicitly disclaims authority.
- *Orphaned anchor-move comment* — `host-interfaces-core.md` ends with the HTML comment `<!-- \`#checkpoint-seam\` anchor moved to host-interfaces-services.md, co-located with the PIC-10 \`Checkpoint\` seam content it names. -->`, a migration breadcrumb that no longer informs any reader.
- *Deferred subagents-collision-set expansion* — `host-interfaces-services.md`'s seam blockquote tails into "The deferred *Pi-owned subagents exposed as enumerable slash commands* extension in [Future Considerations](../future-considerations.md) lands by widening that set to four arms…", a forward-looking sentence about a future-considerations item.
- *Fragile-evidence epistemology paragraph* — `registration-steps.md` step 2 carries a `pre-bind-throw-closure-evidence`-anchored paragraph distinguishing "known-fragile evidence" (the `_`-prefixed loader internals, the `notInitialized` token, the throw-string text) from "observable rules" and explaining the audit-trail framing. The observable rules — that pre-bind action-method calls abort factory load, registration sinks and `refreshTools` are safe — are stated immediately above; the meta-paragraph adds editorial framing rather than spec content.
- *`argumentHint` deferral parenthetical* — `registration-steps.md` step 3 carries the parenthetical "(a deferred `argumentHint`-style upstream is tracked in [Future Considerations](../future-considerations/surface-extensions.md#surface-extensions-without-a-dedicated-topic-page-seam))", a forward-pointer to a deferred future-considerations seam.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `AgentSession` paragraph, `estimateTokens` paragraph, file tail (edited)
- `docs/spec_topics/pi-integration-contract/host-prerequisites.md` — *Deliberate deviation* sub-paragraph (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — *Pi-owned subagents collision source set* seam blockquote, PIC-14 debounce reference (edited)
- `docs/spec_topics/pi-integration-contract/registration-steps.md` — step 1 (`resources_discover` payload), step 2 (`pre-bind-throw-closure-evidence` paragraph), step 3 (`argumentHint` parenthetical), step 5 (250 ms debounce) (edited)
- `docs/spec_topics/pi-integration-contract/version-bump-step2.md` — checklist items (a)–(z) (edited)
- `docs/spec_topics/pi-integration-contract/capability-probe.md` — Step 0 (c) factory-probe contract for `AgentSession.prototype.abort` (read-only)
- `docs/spec_topics/discovery/package-and-settings.md` — *Caching and reload* 250 ms debounce reference (read-only; same window applies)

## Plan Impact

**Phases:** N/A

**Leaves (implementation order):** N/A

(The plan currently has no leaves; `docs/plan_topics/` contains only `conventions.md`, `leaf-template.md`, and `coverage-matrix.md`.)

## Consequence

**Severity:** advisory

The three unpinned presuppositions create silent-drift channels: a Pi minor that altered `abort()`/`dispose()` behaviour, reshaped `resources_discover.reason`, or shipped a save sequence that exceeded 250 ms would not trip the surface-inventory assertion or any named checklist item, and the divergence would surface only as a runtime hang, a misrouted reload, or an extra structural-change note. The cruft items do not affect implementer behaviour but inflate the corpus reviewers must scan and weaken the discipline that keeps non-normative material out of normative pages.

## Solution Space

**Shape:** single
**State:** reduced

The entry bundles two obligation classes — delete editorial asides, and record unpinned presuppositions — across four files. Apply the six deletions first (atomic per-paragraph edits that remove editorial surface so the additive edits land on a cleaner baseline), then the three presupposition pins (each adding a new lettered item to the `version-bump-step2.md` checklist plus a back-reference). The ordered sequence below keeps each diff bounded to one site or one new checklist item plus one back-reference.

### Spec edits — deletions (apply first, in this order)

1. `host-interfaces-core.md`: delete the orphaned trailing `#checkpoint-seam` anchor-move HTML comment (zero-risk one-line deletion).
2. `registration-steps.md` step 3: delete the parenthetical "(a deferred `argumentHint`-style upstream is tracked in [Future Considerations]…)"; the future-considerations page still owns the deferred completion-surface seam.
3. `host-interfaces-services.md`: delete the sentence "The deferred *Pi-owned subagents exposed as enumerable slash commands* extension … widens the set to four arms …" from the seam blockquote; the seam MUST is the normative content and the future-considerations page still owns the deferred extension.
4. `host-interfaces-core.md`: delete the **Non-normative** orientation paragraph at the tail of the `estimateTokens` paragraph (the `Math.ceil(chars/4)` description and the `"😀😀😀"`→2-token example), which self-discloses as orientation only.
5. `host-prerequisites.md`: delete the entire *Deliberate deviation from Pi's bundled-package convention* sub-paragraph; the normative pin and lock-step rule above it stand on their own. If a decision-log file exists, park the deleted rationale there so a future reviewer does not re-introduce it as normative.
6. `registration-steps.md` step 2: delete the `pre-bind-throw-closure-evidence`-anchored paragraph distinguishing known-fragile evidence from observable rules; the observable rules are stated immediately above. Relocate the `pre-bind-throw-closure-evidence` anchor onto whichever retained sentence checklist item (q) back-links to, and inline the necessary "fragile vs observable" scoping into item (q) itself in the same edit so its audit instruction stays interpretable. Do this last among the deletions because of the anchor-preservation requirement.

### Spec edits — presupposition pins (apply second, in this order)

7. **`resources_discover` reason set.** Add a new editorial-review checklist item in `version-bump-step2.md` covering the `resources_discover` event payload shape (`{ cwd, reason }`) and the closed `reason` literal set (`"startup"`, `"reload"`) that `registration-steps.md` step 1 normatively branches on, plus the per-event `cwd` precedence rule. Add one inline back-reference in step 1 of `registration-steps.md`.
8. **`AgentSession.abort()`/`dispose()` behaviour.** Add a new editorial-review checklist item (next free letter after (z)) in `version-bump-step2.md` covering the *behaviour* of `AgentSession.abort()` (tears down the in-flight provider call; resolves once idle) and `AgentSession.dispose()` (removes all listeners; disconnects from the underlying agent). Cross-link it from the `AgentSession` paragraph in `host-interfaces-core.md`, distinguishing it from item (n) (shape) and item (y) (dispose-mid-unsettled-abort overlap). This item is necessarily SHOULD-level editorial review since the behavioural property is harder to fixture than a shape probe.
9. **250 ms debounce burst window.** State explicitly at the `registration-steps.md` step 5 debounce site (and mirror at the `discovery/package-and-settings.md` settings-watcher debounce site) that the 250 ms window presupposes editor save bursts complete within that window on the supported platforms; add a `version-bump-step2.md` checklist item cross-linking both sites to re-confirm the assumption against the platform matrix on each Pi minor bump. Apply this only if a concrete platform matrix can be named; otherwise rework it as an inline non-normative caveat at the debounce sites rather than a checklist obligation.

### Edge cases

- The `estimateTokens` orientation block, the seam-expansion sentence, and the `argumentHint` parenthetical are forward-pointers whose targets survive on the future-considerations / Pi-owned pages — confirm those owners remain intact after deletion.
- The fragile-evidence paragraph deletion must not strand item (q): relocate its anchor and fold its scoping into (q) in the same edit.
- The debounce checklist item is vacuous unless a platform matrix is pinned somewhere; this pin is contingent on the implementer naming a concrete platform set.

## Relationships

- T035 "`pi.getFlag` is touched pre-bind but is absent from both the safe-before-bind list and the `notInitialized`-throwing list" - same-cluster (touches the same step-2 pre-bind discussion this finding reworks)
- T109 "`session_start` collision pass has no failure contract when `pi.getCommands()` throws" - same-cluster (touches step 3, same page as this finding's edits)
- T036 "`registerMessageRenderer` is unordered in the registration sequence; `registerFlag` options parameter is unpinned" - same-cluster (touches the same registration-steps numbered sequence this finding edits)

---

# T042 - `audit-recognised-shapes.md` and `audit-target-categories.md` filenames are swapped relative to their content

**Kind:** placement
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/pi-integration-contract/`, the sibling files `audit-recognised-shapes.md` and `audit-target-categories.md` have basenames that contradict their content: `audit-recognised-shapes.md` opens `# Audit target categories` and carries the *Target surface categories* paragraph (anchor `audit-target-surface-categories`), while `audit-target-categories.md` opens `# Audit recognised shapes` and carries the *Recognised import/access shapes* paragraph (anchor `audit-recognised-shapes`). Nine inbound cross-links across the corpus reference these files by basename; links to `audit-recognised-shapes.md#audit-recognised-shapes` already resolve to a missing anchor because that anchor lives in the other file, and any link written from the filename misleads readers. `docs/_tools/split_spec.py` is the upstream source: its split-map assigns the *Target surface categories* content to basename `audit-recognised-shapes` and the *Recognised import/access shapes* content to basename `audit-target-categories`.

## Solution approach

Rename the two sibling files in `docs/spec_topics/pi-integration-contract/` so each basename matches its existing H1 and interior anchor: the file containing *Target surface categories* (H1 `# Audit target categories`, anchor `audit-target-surface-categories`) becomes `audit-target-categories.md`, and the file containing *Recognised import/access shapes* (anchor `audit-recognised-shapes`) becomes `audit-recognised-shapes.md`. Update the matching filename strings in `docs/_tools/split_spec.py`'s split-map (the entries mapping source-spec lines 826 and 827) so a re-run reproduces the corrected names. Sweep the corpus for inbound links naming either filename and repoint them, and fix the renamed files' internal self-references that link `./audit-recognised-shapes.md#audit-target-surface-categories`.

## Solution constraints

- None.

## Relationships

None

# T043 - Binder extraction narrative covers only the missing-ToolCall malformed-envelope sub-case

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The structured-output extraction paragraph in `binder-inference.md` enumerates only two malformed-envelope sub-cases — an `AssistantMessage` with no matching `ToolCall` (plain text or a `ToolCall` with a different `name`) — and presents the matched-name path as the happy path. The canonical `failure-class-taxonomy` on `binder/determinism-cancellation-failure.md` classifies a broader set into the malformed-envelope class, including a matched-name `ToolCall` whose `arguments` fails JSON parsing, fails the envelope `anyOf` discriminator, carries a `kind` outside `ok | needs_info | ambiguous`, or otherwise violates the envelope schema. A reader treating the extraction paragraph as authoritative would not see how matched-name-but-bad-`arguments` is routed and could emit an unmapped runtime path.

## Solution approach

Rewrite `binder-inference.md`'s extraction paragraph so the matched-name `ToolCall`'s `arguments` is routed through the [Failure-class taxonomy](../binder/determinism-cancellation-failure.md#failure-class-taxonomy) rather than presented as a happy path, making the cross-reference cover every post-extraction failure shape instead of only the missing-`ToolCall` shape. Leave the enumeration of malformed-envelope shapes to the taxonomy, which already owns it.

## Solution constraints

- The broadened cross-reference MUST NOT collapse the AJV-on-`args` class (structurally valid envelope whose `args` fail AJV, non-retried) into the malformed-envelope class — the taxonomy keeps them distinct with different retry budgets.

## Relationships

- T111 "Binder `complete()` call execution phase contradicts its own cancellation/argument wiring" - same-cluster (same page, distinct prose defect)
- T112 "Binder `complete()` per-attempt retry / backoff delegated to `StreamOptions` fields loom never populates" - same-cluster (same page, distinct prose defect)
- T116 "Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields" - same-cluster (same binder-failure surface, independent resolution)

# T044 - Family-(5) malformed-marker per-clause `<symptom>` token requirement is asserted derivatively but never normatively pinned

**Kind:** implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

In `docs/spec_topics/pi-integration-contract/audit-failures.md`, the *Failure-surface contract* paragraph (anchor `audit-failure-surface-contract`) justifies its per-`<symptom>` negative-test fixture floor by counting family (5) at "nine tokens total" — the two stale sub-kinds (s1)/(s2) plus the seven malformed-marker clauses (a)–(g). That nine-token count is load-bearing but is never pinned as a normative obligation: no rule requires the implementation to emit seven distinct stable `<symptom>` tokens for clauses (a)–(g). The *Stale sub-kinds* paragraph explicitly states its two `<symptom>` tokens MUST be distinct, but the *Malformed-marker discriminator* paragraph describes a single discriminator and never partitions it into seven per-clause tokens. A conforming implementation can therefore surface all seven clauses under one shared `<symptom>` token and still satisfy every upstream MUST, tripping the fixture floor only as an arithmetic side-effect, so two implementers diverge on whether (a)–(g) are seven tokens or one.

## Solution approach

Clarify the *Malformed-marker discriminator* paragraph to normatively require a distinct stable `<symptom>` token per clause (a)–(g) — pairwise distinct and fixed at first implementation as permanent test invariants — mirroring the *Stale sub-kinds* "two `<symptom>` tokens MUST be distinct" obligation so both family-(5) partitions carry parallel pins. Resolve the case of a marker that fails several clauses at once, either by pinning a precedence order over (a)–(g) or by permitting multiple distinct-`<symptom>` records on the same line.

## Solution constraints

- If the added per-clause obligation creates or strengthens a defining obligation site with no co-located REQ-ID anchor, satisfy GOV-22 by coining the next `PIC-N` anchor under the page's registered prefix in the same commit.

## Relationships

None

# T046 - `RuntimeEvent` justifies a field it does not carry

**Original heading:** RuntimeEvent shape omits `provider` though transport emission is said to require it
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`conversation-drive.md` mandates that `TransportError.provider` be populated from the loom's resolved `model:` "regardless of which surface … detected the failure, since the `errorMessage` string carries no structured provider field and the **Runtime event channel** always-log emission for `kind: \"transport\"` requires the field." The cited justification is wrong on its face: the normative `RuntimeEvent` type in `runtime-event-channel.md` enumerates `kind, code?, loom, invocation_id, query_site?, discard_site?, message, attempts?, tokens_used?, masked?, occurred_at` — and is declared additive-only — so the runtime event channel does **not** require `provider` for a `kind: "transport"` emission. It cannot, because it has no slot for one.

The field that actually requires `provider` is the `TransportError` schema in `errors-and-results/queryerror-variants.md` (`provider: string` is mandatory and non-nullable). The two PIC sections therefore disagree about who owns the requirement: `conversation-drive.md` attributes it to the event channel; `runtime-event-channel.md` does not carry it; `queryerror-variants.md` is the silent actual source. An implementer reading only the conversation-drive paragraph and the RuntimeEvent shape sees a contradiction and has no signal which side to honour.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/conversation-drive.md` — *Error detection* paragraph (Conversation drive — prompt mode) and *Provider compatibility for typed queries* paragraph (both repeat the same justification) (edited)
- `docs/spec_topics/errors-and-results/queryerror-variants.md` — `TransportError` schema (read-only; canonical owner of the `provider: string` requirement)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

## Consequence

**Severity:** correctness

Two implementers reading the same paragraphs will diverge: one will widen `RuntimeEvent` with a `provider` field (taking the conversation-drive justification at face value); the other will leave `RuntimeEvent` as written and treat the justification as stale prose. The two implementations produce different on-the-wire payloads for the same operator-visible transport failure, and the dedup key `(kind, query_site, message, occurred_at)` is unaffected by the divergence so neither implementation looks malformed to the channel's own consumers.

## Solution Space

**Shape:** single
**State:** reduced

Leave `RuntimeEvent` unchanged and re-ground the justification on the schema that actually carries the field. The contradiction is at the justification site, not the schema: the existing `TransportError` schema already carries `provider: string`, so restating "this field is required because schema X says so" is the smaller, more localised edit and preserves the channel's deliberately narrow operator-facing projection.

### Spec edits

- In both `conversation-drive.md` paragraphs that synthesise a `TransportError` — the synchronous-throw mapping under *Error detection* and the unsupported-provider guard under *Provider compatibility for typed queries* — replace the clause "the **Runtime event channel** always-log emission for `kind: \"transport\"` requires the field" with a citation to `errors-and-results/queryerror-variants.md`'s `TransportError` schema, which is the real source of the `provider: string` requirement.
- No change to `runtime-event-channel.md`. No change to `queryerror-variants.md`.

### Edge cases

- Both occurrences of the offending clause in `conversation-drive.md` share the same wording and must be rewritten in the same edit; missing one leaves the contradiction half-alive.
- After the rewrite, operators reading a `kind: "transport"` event off the channel still see no `provider` and must cross-reference the originating `query_site` against the loom's `model:` to recover it — this is the intended deliberately-narrow projection, not a regression.

## Relationships

- T116 "Binder-failure RuntimeEvents have no pinned source for the required `invocation_id` / `loom` fields" - same-cluster (both concern which fields the `RuntimeEvent` shape carries and where they are sourced; resolved independently)
- T114 "pi-ai provider-error surface (status, body, network-failure delivery) is undefined" - decision-overlap (extending RuntimeEvent with `provider` would re-open the question of which other transport-classifier outputs the channel should carry; the selected solution leaves RuntimeEvent unchanged, so there is no interaction)

---

# T047 - `waitForIdle()` "never rejects" and "resolves only after `agent_end`" are unrouted Pi-behaviour presuppositions

**Kind:** assumptions (shard-12)
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 3
**Shape:** single
**State:** reduced

## Problem

`conversation-drive.md`'s *Resolution.* sentence asserts that `ctx.waitForIdle()` never rejects and resolves only once Pi emits the terminal `agent_end` for the user session and every awaited `agent_end` listener settles; the mirrored *Error detection.* paragraph routes the entire prompt-mode transport-failure surface through the post-`waitForIdle()` `stopReason`/`errorMessage` probe on the strength of "never rejects". Neither property is encoded by the `Promise<void>` type or any other typed contract on `ExtensionCommandContext.waitForIdle`. The editorial-review checklist in `version-bump-step2.md` covers eventual terminal-`agent_end` delivery (item (j)) and commit-vs-resolution ordering (item (ac)) but neither the no-rejection guarantee nor the resolves-only-after-`agent_end` semantics. A Pi minor that began rejecting `waitForIdle()` on transport teardown, or resolving it before `agent_end` settles, therefore has no SDK-surface signal and no editorial-review routing.

## Solution approach

Add anchor `id="waitforidle-settlement-presupposition"` to `conversation-drive.md`'s *Resolution.* sentence and rewrite it as a loom-side consumption posture stating both properties explicitly — `waitForIdle()` never rejects, and it resolves only once Pi has emitted the terminal `agent_end` and every awaited listener has settled — in the shape the adjacent `#driven-turn-commit-ordering-presupposition` posture uses. Rewrite the `waitForIdle()` inline comment on the `ExtensionCommandContext` shape in `host-interfaces-core.md` to forward-link the new anchor instead of restating the property. Add a new checklist item `(ae)` to the *Editorial-review checklist for unpinned host presuppositions* in `version-bump-step2.md`, citing the new anchor in the SHOULD-level audit shape of the adjacent items, and extend the preamble's "(f) through (ad)" cardinality reference to `(ae)`.

## Solution constraints

- Keep checklist items (j) and (ac) intact — they cover eventual terminal-`agent_end` delivery and commit-vs-resolution ordering; the new item covers only the settlement contract.
- The MUST-NOT-`try`/`catch` directive at the `await ctx.waitForIdle()` call site stays normative.

## Relationships

- T067 "Pi behavioural presuppositions lack authoritative behavioural pointers" - same-cluster (this finding adds one more entry to the unanchored-presupposition family that the related finding identifies as a structural gap).

# T048 - Always-log event construction and `ctx.ui.notify` fallback are unpinned at the runtime-event-channel fallback site

**Original heading:** Always-log event construction (`Clock.wallNow()`) and `ctx.ui.notify` signature unbounded/unpinned at the fallback site
**Original section:** docs/spec_topics/pi-integration-contract/ (audit-resolution, conversation-drive, runtime-event-channel, session-shutdown-semantics, session-only-degraded-state, drain-state-contract)
**Kind:** error-model, implementability
**Importance:** medium
**Score:** 25
**Must-fix:** false

## Finding

`runtime-event-channel.md`'s best-effort fallback paragraph says the chain "covers synchronous throws only" of `pi.sendMessage`. The `RuntimeEvent` construction that runs immediately before that call is outside the guard. `RuntimeEvent.occurred_at` is stamped via `Clock.wallNow()` (per the inline `// stamped at the originating emission site via Clock.wallNow()` comment on the payload type), and `PIC-12` in `host-interfaces-services.md` pins `wallNow(): number` with no "MUST NOT throw" obligation — a custom `Clock` adapter (or even a `WallClock` whose `Date.now()` was monkeypatched out of the engine-assumption set) could throw synchronously. A throw at that point silently violates the "exactly once per occurrence" always-log contract: the event is neither emitted nor accounted for in the dedup map, and no diagnostic is produced. The existing *Engine-assumption carve-out* covers `Map`/`Set`/`JSON.stringify`/IEEE-754 corruption, not a `Clock` adapter throw.

Separately, the same fallback paragraph calls `ctx.ui.notify(content, "error")` without anchoring the receiver. `ctx.ui.notify` is declared one file over in `host-interfaces-core.md` (within the `ExtensionContext` shape: `ui.notify(message: string, type?: "info" | "warning" | "error"): void` (synchronous, may throw)). The fallback paragraph reads in isolation: implementers cannot tell from the call site that `"error"` is one of three accepted severities, that the call is synchronous, or that "may throw" is the documented reason for the wrap-in-try/catch instruction the very next sentence gives.

These are two independent obligations — one closes a silent-drop gap in the always-log contract, the other adds a missing cross-link — and they should be resolved in that order so the second edit lands on a stable always-log baseline.

## Spec Documents

- `docs/spec_topics/pi-integration-contract/runtime-event-channel.md` — best-effort fallback paragraph; `RuntimeEvent` type block (edited)
- `docs/spec_topics/pi-integration-contract/host-interfaces-services.md` — PIC-12 `Clock`/`FakeClock` interface (read-only)
- `docs/spec_topics/runtime-value-model.md` — JavaScript engine assumptions (read-only)
- `docs/spec_topics/pi-integration-contract/host-interfaces-core.md` — `ctx.ui.notify` declaration on the `ExtensionContext` shape (read-only; cross-link target for Obligation B)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(The plan exists but currently contains no leaves; no acceptance criteria are affected and no leaf is blocked.)

## Consequence

**Severity:** correctness

A `Clock.wallNow()` throw during always-log event construction silently drops the event and skips the diagnostic fallback that the same paragraph guarantees for `pi.sendMessage` throws, producing two implementer-reasonable behaviours (some implementers will fold the construction into the guard, others will not). The `ctx.ui.notify` half is advisory in isolation, but combined the finding is correctness-level because it sits on the always-log contract.

## Solution Space

**Shape:** single
**State:** reduced

Resolve two independent obligations, the first before the second so the small cross-link lands on a stable baseline. First, fold the full `RuntimeEvent` emission sequence into the existing best-effort guard so a throw at any step routes through the fallback chain rather than dropping the always-log event silently. The seam is explicitly DI-shaped (PIC-12 admits a `FakeClock` and any conforming `Clock`), so a "wallNow() never throws" engine-assumption would stretch the IEEE-754/native-collections carve-out and export a silent-drop surface across every adapter; folding construction into the guard mirrors the pattern the paragraph already applies to `ctx.ui.notify` and keeps the always-log contract observable. Second, cross-link `ctx.ui.notify`'s signature and severity set at the fallback site.

### Spec edits

1. **Fold construction into the best-effort guard.** In `runtime-event-channel.md`, replace "The best-effort fallback below covers synchronous throws only" with wording naming the guarded scope explicitly: "covers synchronous throws from `Clock.wallNow()` (during `occurred_at` stamping), the dedup-map insertion, and the `pi.sendMessage` call." State that on a `Clock.wallNow()` throw the fallback's step-2 `system-note-delivery-failed` diagnostic is emitted with `occurred_at` handled by a single stated story (omit / second-call retry / sentinel — pick one and state it), and step 1's `ctx.ui.notify` is unaffected. Leave PIC-12 and the engine-assumptions section untouched.
2. **Cross-link `ctx.ui.notify`.** Add or repurpose an anchor on the `ui.notify(message: string, type?: "info" | "warning" | "error"): void` line in `host-interfaces-core.md` (e.g. `<a id="ui-notify"></a>`). In `runtime-event-channel.md` step 1 of the fallback, change `` `ctx.ui.notify(content, "error")` `` to a Markdown link to that anchor, optionally adding inline "(`type` is one of `"info" | "warning" | "error"`; `"error"` selected here for cascade visibility)". No behavioural change.

### Edge cases

- The `occurred_at` field on the `system-note-delivery-failed` diagnostic emitted when `Clock.wallNow()` itself was the thrower needs one definite wording; if the retry path (a second `wallNow()` inside the catch) is chosen, it must terminate the recursion explicitly because that second call could also throw.
- Do the cross-link second so the construction-folding edit does not have to be re-flowed around a newly-added anchor link.

## Relationships

- T101 "Renderer-throw during Pi's render invocation has no defined failure mode" - same-cluster (a third gap in the same "best-effort fallback covers …" scope sentence; resolve consistently)
- T049 "`diagnostic-emission-isolation.md` opening scope omits the per-invocation surfaces the paragraph actually governs" - same-cluster (same `sendSystemNote` fallback chain, scope side)

