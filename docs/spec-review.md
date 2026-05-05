# pi-loom — Consolidated Spec Review

_Generated: 2026-05-05T19:49:46Z (revised: merges + multi→single conversion + bottom-up reorder)_
_60 source findings → 9 commit-ready findings (8 merge clusters, 23 standalone). 8 false positives dropped at consolidation; 0 persistent failures._

Findings are ordered for **bottom-up processing**: each commit fixes the *last* finding in the doc until the doc is empty. Dependencies that require a particular landing order are encoded in the doc order — `MERGE-F` (`bindings.md` BNDS / BNDR rename) sits at the bottom of the REQ-ID-appendix supersection so it lands *before* `MERGE-G` (retirement registries + V18s sub-gates), which sits above it.

---

## spec.md — Opening paragraph

---

# spec.md opening paragraph — combined rewrite

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 6 findings:
- Opening sentence's "no return value" claim contradicts the rest of the spec
- Orientation describes subagent mode as "fresh isolated" without naming the isolation axes
- Opening paragraph omits the failure surface and the prompt-mode partial-append contract
- Mode selection rule is not cross-linked from the spec orientation
- Opening prose carries unanchored normative obligations
- Opening hyperlink points at `https://pi.dev` instead of the canonical SDK home

**Kind:** cross-spec-consistency, error-model, completeness, traceability, prescription, cruft

## Finding

The opening paragraph of `spec.md` carries six independent defects that all touch the same prose:

1. The sentence "evaluating a loom does not return a value or write a file — it appends turns to a conversation" contradicts every topic page that defines a return-value path (`overview.md`, `return.md`, `comparison.md`, `README.md`).
2. The phrase "fresh isolated conversation" stacks two undefined adjectives; the isolation axes (transcript, system prompt, tools) are never enumerated at the orientation level.
3. The paragraph names only the success outcome; failure (`Err`, panic, cancellation) and the prompt-mode partial-append contract are not surfaced.
4. The `prompt` / `subagent` dichotomy is introduced as load-bearing without a cross-link to its normative owner (`frontmatter.md`).
5. The paragraph carries obligation-shaped clauses without REQ-IDs; `spec.md` is meant to be informative orientation only.
6. The hyperlink target `https://pi.dev` is not the authoritative SDK reference; the canonical artefact is the `pi-mono` GitHub repository (also linked from `spec_topics/overview.md` line 5).

All six fixes rewrite the same paragraph and MUST land in one edit.

## Spec Documents

- `spec.md` — opening paragraph (edited)
- `spec_topics/overview.md` — line 5 (hyperlink) and line 7 (return-value framing) (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The merged edit is orientation prose only. The normative contracts it now points at — partial-append (V5/V14/V15), mode-selection diagnostics (V3a), subagent isolation (`frontmatter.md` field contract) — are already owned by existing leaves; no Tests/Ships criteria change.

## Consequence

**Severity:** advisory

A top-down reader of `spec.md` currently builds a wrong mental model on six axes simultaneously: incorrect return-value contract, vague isolation, no failure surface, no mode-selection owner, normative-looking prose without enforcement, and a hyperlink that does not resolve to documentation.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the opening paragraph of `spec.md` to the following text (informative orientation, no normative obligations, all owners cross-linked):

> [Pi Coding Agent](https://github.com/badlogic/pi-mono) extension that adds a domain-specific scripting language for prompts and agentic operations.
>
> A `.loom` file interleaves code with literal text destined for the model. Loom evaluation appends turns to a conversation: the *caller's* current conversation in `prompt` mode, or a separate conversation in `subagent` mode that does not inherit the caller's transcript, system prompt, or tool set. Mode is selected per-loom by the required `mode:` frontmatter field — see [Parameters and Frontmatter](./spec_topics/frontmatter.md). Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files.
>
> Evaluation either succeeds (turns appended; final value available to programmatic callers) or fails — by returning `Err`, by panicking, or by being cancelled. In `prompt` mode, turns appended *before* the failure remain in the caller's conversation; the runtime performs no implicit rollback. See [Errors and Results](./spec_topics/errors-and-results.md), [Invocation from Pi](./spec_topics/slash-invocation.md), and [Diagnostics](./spec_topics/diagnostics.md) for the per-stage error surfaces and the partial-append contract. The full conceptual model is normative in [Overview](./spec_topics/overview.md) and the topic pages it links; this paragraph is informative orientation only.

Companion edit to `spec_topics/overview.md`:

- **Line 5 (hyperlink).** Replace the `https://pi.dev` target with `https://github.com/badlogic/pi-mono`. Keep the visible link text "Pi Coding Agent" unchanged.
- **Line 7 (return-value framing).** Replace `The output of evaluating a loom is not a return value or a file write — it is a structured sequence of text fragments injected into a conversation context.` with: `Evaluating a loom produces two outputs: a structured sequence of text fragments injected into a conversation context (its primary effect) and a final value — the loom's last expression or `return expr` — consumed by programmatic callers (`invoke`, subagent harness). Looms do not write files. Both outputs are detailed under [Scope of a Loom File](#scope-of-a-loom-file).`

Edge cases:

- Keep the three subagent-isolation axes in fixed order (transcript, system prompt, tools); the same order must be used if a future axis is appended.
- Do not enumerate "process" or "cancellation scope" as isolation axes — the spec makes no such guarantees today.
- Do not add REQ-IDs to the rewritten paragraph; `spec.md` carries no prefix per the appendix table.
- Do not edit `return.md`, `invocation.md`, `comparison.md`, or `README.md`; they are already correct.
- Do not edit cross-link targets inside `spec_topics/pi-integration-contract.md` or other topic pages — they reference the npm package by identifier, not via `pi.dev` hyperlinks.

## Related Findings

- "Pi runtime prerequisites and SDK version pin not surfaced" — co-resolve with MERGE-D (Orientation prerequisites); both edits land in the same Orientation block.
- "`.warp` top-level form list" — same-cluster (paragraph 2; resolved in MERGE-B).

---

---

## spec.md — Paragraph 2: .loom / .warp file contract

---

# spec.md paragraph 2 — `.loom` / `.warp` file contract rewrite

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 3 findings:
- `.warp` top-level form list restated in `spec.md` without an anchor; drift risk against `imports.md`
- Extension-mismatch enforcement for `.warp` and `.loom` paths leaves diagnostic codes unregistered
- `.loom` / `.warp` file-extension namespace not verified

**Kind:** cross-spec-consistency, completeness, error-model, prescription

## Finding

`spec.md` paragraph 2 carries three defects that all rewrite or extend the same paragraph:

1. The paragraph restates the `.warp` top-level permitted-form list inline (`import`, `export`, `schema`, `enum`, `fn`); `imports.md` owns the canonical list. Two copies = drift surface.
2. Extension-mismatch enforcement for `.warp` (in `import` paths) and `.loom` (in `invoke` and `tools:` paths) is mentioned in prose but no diagnostic codes are registered. Two new codes are needed: `loom/parse/invoke-non-loom-extension` and `loom/parse/import-non-warp-extension`.
3. The paragraph silently assumes the `.loom` and `.warp` extensions are not claimed by any other Pi-ecosystem extension. No verification note exists.

All three edits modify the same paragraph and MUST land together.

## Spec Documents

- `spec.md` — paragraph 2 (edited)
- `spec_topics/imports.md` — Path resolution paragraph + `.warp file rules` first bullet (edited)
- `spec_topics/invocation.md` — Resolution paragraph (edited)
- `spec_topics/diagnostics.md` — `loom/parse/*` table (edited; two new rows)
- `spec_topics/discovery.md` — new "File-extension namespace" note at top of file (edited)

## Plan Impact

**Phases:** Vertical V3, V14, V15, V17

**Leaves (implementation order):**

- V3a — frontmatter / load diagnostics — (read-only confirmation; no new behaviour)
- V14m — discovery walk — (read-only confirmation)
- V15a, V17c — path-literal lexing precedence — (modified; the new extension diagnostics fire *after* `loom/parse/invalid-path-separator`)

## Consequence

**Severity:** correctness

Without the diagnostic codes, two implementers will diverge on what fires when `invoke("./x.warp")` or `import { ... } from "./x.loom"` is encountered. The drift risk on the top-level form list compounds when `imports.md` evolves. The unverified namespace assumption is implementation-defining without spec backing.

## Solution Space

**Shape:** single

### Recommendation

Rewrite `spec.md` paragraph 2 to:

> A loom is stored in one of two file extensions that share a single grammar and type system. `.loom` files are invocable as slash commands (see [Invocation from Pi](./spec_topics/slash-invocation.md)); `.warp` files are library modules whose top level is restricted to a small set of declaration forms — see [Imports](./spec_topics/imports.md) for the normative list (including `enum` per [Schema Declarations](./spec_topics/schemas.md) and the `export … from` re-export form). `.warp` files are never directly invoked: slash invocation is prevented by construction (discovery scans `*.loom` only — see [Discovery](./spec_topics/discovery.md)); `invoke(...)` and `tools:` paths ending in `.warp` raise `loom/parse/invoke-non-loom-extension`; `import` paths ending in `.loom` raise `loom/parse/import-non-warp-extension`. See [Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace) for the namespace-clearance note.
>
> <!-- DO NOT inline the permitted-form list here; see imports.md. -->

Companion edits:

- **`spec_topics/imports.md`** — Path resolution paragraph: replace "Paths must end in `.warp`" with "Paths must end in `.warp`; a non-`.warp` extension is `loom/parse/import-non-warp-extension`."
- **`spec_topics/invocation.md`** — Resolution paragraph: replace "It must end in `.loom`" with "It must end in `.loom`; a non-`.loom` extension is `loom/parse/invoke-non-loom-extension`. The same code applies to `tools:` `.loom` entries whose path string does not end in `.loom`."
- **`spec_topics/diagnostics.md`** — Register two new rows in the `loom/parse/*` table next to `loom/parse/invalid-path-separator`:
  - `loom/parse/invoke-non-loom-extension` (E, parse) — owner `invocation.md`. Hint: "invoke and `tools:` paths must end in `.loom`; use `import` for `.warp` library code."
  - `loom/parse/import-non-warp-extension` (E, parse) — owner `imports.md`. Hint: "import paths must end in `.warp`; `.loom` files are not importable — use `invoke(...)` instead."
  Order both diagnostics so that `loom/parse/invalid-path-separator` fires *before* the extension check.
- **`spec_topics/discovery.md`** — Add a `### File-extension namespace` paragraph at the top, co-located with the existing `pi` manifest-namespace verification, stating: (1) `.loom` and `.warp` are coined by this extension; no Pi-shipped surface or other `@mariozechner/pi-coding-agent` extension claims them at the time of writing; (2) Pi has no central file-extension registry — ownership is established de facto by each extension's discovery walker; cross-extension collisions on `.loom`/`.warp` files manifest via the existing slash-name collision rule, not a separate file-extension rule; (3) the check is a point-in-time observation, not a guarantee; if a future Pi-ecosystem package adopts the same extensions, this section is the place to document the resolution.

Edge cases:

- The extension check applies to the path literal as written, not the realpath-normalised result. Symlinks whose target ends in a different extension are irrelevant.
- The check is byte-exact lowercase (matching `lexical.md`'s path-literal grammar). `./x.LOOM` is rejected with the new code.
- The `tools:` surface emits the new code at parse time (consistent with `loom/parse/invalid-path-separator`).
- The discovery namespace note is descriptive — assign no REQ-ID, no per-leaf test obligation, no new diagnostic.

## Related Findings

- None outside this merge.

---

---

## spec.md — Paragraph 3: Self-containment and reading scope

---

# spec.md paragraph 3 — Self-containment and reading scope rewrite

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 3 findings:
- "plan leaf" and its **Spec** field used before being defined or cross-linked
- "Explicitly cross-linked" — link granularity is undefined
- Self-containment + MAY-restrict permission has no closure rule and no enforcement

**Kind:** cross-spec-consistency, completeness, traceability

## Finding

`spec.md` paragraph 3 carries three defects that all rewrite the same paragraph:

1. The trailing sentence references "plan leaf" and its **Spec** field on first use without definition or cross-link.
2. "Explicitly cross-linked" is normative but its target granularity (file-level vs. section-level vs. REQ-ID-level) is undefined.
3. The self-containment claim and the MAY-restrict permission are jointly unsatisfiable: an implementer who restricts reading to listed topics may miss normative cross-links the listed topics depend on.

All three rewrite the same paragraph and require the same companion edit to `plan_topics/conventions.md`.

## Spec Documents

- `spec.md` — paragraph 3 (edited)
- `plan_topics/conventions.md` — Leaf format → Spec bullet (edited)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (read-only; closure invariant is enforced by author discipline at H6, not by H6 itself)

## Consequence

**Severity:** advisory

A reader of paragraph 3 currently cannot tell what a plan leaf is, at what granularity cross-links must point, or whether the **Spec** field is closed under cross-link.

## Solution Space

**Shape:** single

### Recommendation

Rewrite `spec.md` paragraph 3 to:

> Each topic page is authored to be self-contained: any rule it depends on from another topic must be either stated locally or referenced by a markdown link whose target is the specific REQ-ID anchor (`#prefix-n`) of the depended-upon rule. Where the depended-upon page is pure-narrative (no REQ-IDs per the appendix table), a section-level link to the relevant heading on that page suffices. An implementer MAY therefore restrict their reading to the topics listed under their plan leaf's **Spec** field, where a *plan leaf* is a terminal task in [`plan.md`](./plan.md) (leaf format defined in [`plan_topics/conventions.md`](./plan_topics/conventions.md#leaf-format)) and its **Spec** field is the list of `spec_topics/*.md` filenames the leaf implements. The **Spec** field is required to be closed under normative cross-link: any topic page cross-linked from a listed topic for a normative rule is itself listed.

Companion edit to `plan_topics/conventions.md` (Leaf format → Spec bullet):

> The **Spec** field MUST be closed under normative cross-link: if topic `T` is listed and `T` cross-links to a normative rule in topic `T'`, then `T'` MUST also appear in the field. Narrative cross-links (`overview.md`, `glossary.md`, `comparison.md`, `influences.md`, `related-work.md`, `future-considerations.md`) do not trigger the closure obligation. The closure is checked at fixed point — iterate adding pages until the field stops growing. A future mechanical lint is out of scope unless drift is observed.

Edge cases:

- Until H6 closes, REQ-ID anchors do not exist; the orientation rule binds *target form*, not *enforcement*. V18s gate accepts pre-H6 transitional spec-page-anchor citations per `conventions.md`.
- Anchored cross-links to a specific REQ-ID still drag the entire page into the closure — there is no per-REQ-ID granularity in the **Spec** field.
- If `plan_topics/conventions.md`'s `## Leaf format` slug differs from `leaf-format` under the project's renderer, adjust the fragment.
- H6 will retroactively expand many existing **Spec** fields once anchors land.

## Related Findings

- None outside this merge.

---

---

## spec.md — Implementation Notes

---

# spec.md Orientation prerequisites + Host runtime + pi-integration-contract Host prerequisites

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 3 findings:
- Pi runtime prerequisites and SDK version pin not surfaced in the spec orientation
- LLM availability for argument binding is an undisclosed runtime prerequisite
- Host runtime (Node + JS) and Pi-supplied `AbortSignal` are unstated prerequisites

**Kind:** completeness, traceability, error-model

## Finding

Three orthogonal prerequisite gaps all want the same insertion site (Orientation block of `spec.md` + opening paragraph of `pi-integration-contract.md`):

1. The Pi SDK pin (`@mariozechner/pi-coding-agent ^0.72.1`) and the named SDK capabilities loom depends on are not surfaced at the spec entry point.
2. The binder LLM model is a runtime prerequisite for non-bypass looms but is undisclosed in orientation.
3. Node.js host runtime, web-standard `AbortSignal`, and JS engine assumptions (IEEE-754, `Map`/`Set`, `JSON.stringify`, `Object.is`) are unstated.

All three edit the same Orientation block and the same `pi-integration-contract.md` opening paragraph.

## Spec Documents

- `spec.md` — Orientation block (edited; new `## Prerequisites` subsection)
- `spec_topics/pi-integration-contract.md` — opening paragraph (edited; new `**Host prerequisites.**` paragraph + `AbortSignal` prerequisite sentence)
- `spec_topics/runtime-value-model.md`, `spec_topics/cancellation.md` — (read-only; cross-link targets)
- `package.json` — `engines.node` field (edited)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — repository skeleton + Vitest — (modified; add an `engines.node` assertion)

## Consequence

**Severity:** correctness

A reader of orientation cannot tell which Pi SDK version is required, which LLM credentials are needed for the binder, or which Node runtime the spec assumes. Three separate evaluators will reach three different conclusions.

## Solution Space

**Shape:** single

### Recommendation

Add a `## Prerequisites` subsection at the top of `spec.md`'s Orientation block (above the Overview / Influences / Comparison bullets) containing three sub-areas:

**Subsection 1 — Pi SDK and capabilities.**

> The host is `@mariozechner/pi-coding-agent` at the version pinned by [Pi Integration Contract](./spec_topics/pi-integration-contract.md). The matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is also required; `package.json` `peerDependencies` is the enforcement point. Loom depends on the following named SDK capabilities (each link points to the section that pins it):
>
> - **Slash-command registration** — `pi.registerCommand` (per *Extension entry point*).
> - **Prompt-mode conversation drive** — `pi.sendUserMessage` + `ExtensionCommandContext.waitForIdle` (per *Conversation drive — prompt mode*).
> - **Subagent-mode isolated session** — `createAgentSession` returning a disposable `AgentSession` with private `SessionManager.inMemory(cwd)` transcript (per *Conversation drive — subagent mode* and *Subagent session lifecycle*).
> - **Tool registration and gating** — `pi.registerTool` + `pi.setActiveTools` snapshot/restore (per *Tool-registration lifetime and visibility*).
> - **Cancellation propagation** — Pi-supplied `AbortSignal` plumbed via `ctx.signal` (turn-side) and `execute(..., signal, ...)` (tool-side); the loom-side `AbortController` rule is in *Cancellation source*.
> - **Custom-message channel and renderer** — `pi.sendMessage({ customType: "loom-system-note", ... })` + `pi.registerMessageRenderer` (per *System notes*).
> - **Binder LLM model** — A structured-output-capable model resolved via `ctx.modelRegistry`; non-bypass looms fail to load with `loom/load/binder-model-unresolved` if absent. Bypass cases (no-params, single-string with no default) skip the binder call.
>
> Widening `peerDependencies` requires re-validating the surface inventory above against the new Pi minor before the range moves.

**Subsection 2 — Host runtime.**

> The loom runtime executes inside the Pi extension host process. The host is Node.js; the supported version range is `>=20.6.0` (matching `@mariozechner/pi-coding-agent`'s `engines.node` floor at the pinned peer-dep version). A Pi minor bump that widens or narrows that range requires re-validating the loom range in the same edit. The host's `AbortSignal` / `AbortController` types are Web-standard (the Node-bundled WHATWG implementation); the loom runtime treats them as a load-bearing SDK contract. The runtime value model assumes a JavaScript engine with IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics for primitive equality (see [Runtime Value Model](./spec_topics/runtime-value-model.md) and [Cancellation](./spec_topics/cancellation.md)).

Companion edits to `spec_topics/pi-integration-contract.md`:

- Add a `**Host prerequisites.**` paragraph at the top, after the existing version pin, covering: (1) the SDK pin (already there); (2) the binder-model requirement and `loom/load/binder-model-unresolved` failure (with `loom/load/binder-model-strict-capability-unknown` (W) currently degraded under `^0.72.1`); (3) credentials reach the binder via the same `ctx.modelRegistry` / `Model<Api>` path Pi uses for its own queries; (4) V1 has no global binder opt-out — bypass is structural and per-loom.
- Add one sentence elevating "Pi delivers an `AbortSignal` to every extension entry point — `ctx.signal`, `tool.execute`'s `signal` parameter, and `createAgentSession({ signal })`'s parameter" to a stated SDK prerequisite. Cross-reference from the existing **Cancellation source** paragraph.

Companion edit to `package.json`:

- Add `"engines": { "node": ">=20.6.0" }`. H1 adds a Vitest assertion that reads the field literally.

Edge cases:

- The version constant must not be duplicated. The Prerequisites subsection references the constant by name ("the pinned range stated at the top of [Pi Integration Contract]"), not by literal value.
- The capability list is a navigation aid only; it MUST NOT restate behavioural rules.
- The `AbortSignal` prerequisite is additive — it does not retract `cancellation.md`'s tolerance for `ctx.signal === undefined` at slash-command entry.
- Do not add REQ-IDs to the Prerequisites subsection; orientation pages carry no IDs.
- Do not state credentials are stored by Pi — state they reach the binder via `ctx.modelRegistry`.

## Related Findings

- MERGE-A (opening-paragraph rewrite) — same Orientation block; both must land in one pass to avoid two contradictory rewrites of the same block.

---

---

## spec.md — Appendix: REQ-ID prefix table — introductory paragraph

---

# spec.md Appendix REQ-ID prefix table — introductory paragraph rewrite

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 5 findings:
- REQ-ID anchors described as present-state; actually an H6 future deliverable
- Coverage matrix described as per-REQ-ID; currently section-keyed scaffolding
- REQ-ID marker form and extraction contract unspecified
- Cross-reference to V18s gate by file path rather than stable anchor
- Governance rules for the REQ-ID system lack their own IDs

**Kind:** cross-spec-consistency, traceability, completeness

## Finding

The introductory paragraph of `spec.md`'s REQ-ID prefix table appendix carries five defects that all rewrite the same paragraph:

1. REQ-ID anchors are described in present indicative ("rules inside the page are numbered…") but no spec page actually carries them yet — H6 is the deferred owner.
2. The coverage matrix is described as keyed per REQ-ID; today it is section-keyed scaffolding. H6 re-pivots it.
3. The REQ-ID marker form (`**PREFIX-N.**` inline marker vs. `<a id="prefix-n"></a>` HTML anchor) is named but no extraction contract pins which form CI greps for.
4. The V18s gate is referenced by file path (`plan_topics/v18-cancellation.md`) rather than by a stable section anchor.
5. The governance rules in this paragraph carry no IDs of their own, so plan leaves cannot cite them.

## Spec Documents

- `spec.md` — Appendix: REQ-ID prefix table introductory paragraph (edited)
- `plan_topics/v18-cancellation.md` — V18s — Coverage-matrix closing CI gate (read-only; gains a stable anchor)
- `plan_topics/coverage-matrix.md` — preamble (edited; matches new wording)
- `plan_topics/h6-req-ids.md` — Adds / Tests (edited; pins extraction-form contract)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified; pins the extraction contract and the H6-vs-spec-now temporal gating)
- V18s — Coverage-matrix closing CI gate — (modified; gains stable anchor + GOV-N IDs for governance rules)

## Consequence

**Severity:** correctness

A spec-table parser today cannot tell from this paragraph whether REQ-ID anchors exist (they don't yet), which form is canonical, or whether the V18s gate is currently active. Governance rules without IDs cannot be cited from leaf acceptance criteria.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the introductory paragraph of the REQ-ID prefix table appendix in `spec.md` to:

> **GOV-1.** Each spec page that carries normative obligations is assigned a stable per-page REQ-ID prefix (table below). [H6](./plan_topics/h6-req-ids.md) owns the initial pass that inserts `PREFIX-N` anchors into each page. The canonical anchor form is the inline `**PREFIX-N.**` marker (used by H6's grep, by V18s, and by all downstream tooling); the alternate `<a id="prefix-n"></a>` HTML form is permitted only where rendering constraints make the inline marker impractical, in which case both forms appear together on the same line.
>
> **GOV-2.** Once H6 lands, the plan's coverage matrix in [`plan_topics/coverage-matrix.md`](./plan_topics/coverage-matrix.md) is keyed per REQ-ID, mapping each ID to its closing leaf, and the [V18s coverage-matrix closing gate](./plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate) treats any unmapped REQ-ID as a CI failure. Until H6 closes, the spec-side REQ-ID set is empty, the matrix is section-keyed scaffolding, and the V18s diff is vacuously satisfied.
>
> **GOV-3.** The REQ-ID extraction regex is `\b[A-Z]{3,4}-[0-9]+\b`, applied to non-narrative `spec_topics/*.md` files. Pure-narrative pages (`overview.md`, `glossary.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) are excluded from extraction.

Companion edits:

- **`plan_topics/v18-cancellation.md`** — Add an explicit anchor `### V18s — Coverage-matrix closing CI gate` (or confirm the existing H3 slugs to `v18s-coverage-matrix-closing-ci-gate`).
- **`plan_topics/coverage-matrix.md`** — Preamble: change "every executable spec rule mapped to its closing leaf(s)" to "every executable spec rule will be mapped to its closing leaf(s) once H6 closes; today the matrix is section-keyed scaffolding."
- **`plan_topics/h6-req-ids.md`** — Adds: pin the inline-marker-canonical rule. Tests: assert that every non-narrative page carries `PREFIX-N` markers in inline form for the page's prefix.

Edge cases:

- Keep the prefix table itself in present tense — assignments are live; only in-page anchors are deferred.
- Do not invent or hand-place `PREFIX-N` markers ahead of H6; doing so causes spurious V18s diffs.
- The `GOV-N` prefix is reserved by this rewrite for spec-governance rules; add a `GOV` row to the prefix table (with `spec.md` as the page).

## Related Findings

- MERGE-G (closing immutability paragraph) — same appendix; the closing paragraph rewrite extends V18s with prefix-table sub-gates that read this paragraph's GOV-N anchors.

---

---

## spec.md — REQ-ID prefix table: closing paragraph (immutability rules)

---

# spec.md REQ-ID prefix table — closing immutability paragraph rewrite + retirement registries + V18s sub-gates

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 6 findings:
- "Prefix table is immutable" contradicts "adding a new page" in the same sentence
- Prefix mutation rules cover only add; rename/delete/merge unspecified
- REQ-ID lifecycle covers only split; merge, delete, pure-rewording cases absent
- Enforcement mechanisms for prefix and ID immutability absent
- BIND/BNDG disambiguation is permissive, not normative; "same edit" over-prescribes process
- Closing explanatory paragraph (BIND/BNDG rationale) is cruft

**Kind:** consistency, completeness, error-model, prescription, cruft, traceability

## Finding

The closing paragraph of the REQ-ID prefix table in `spec.md` carries six defects that all rewrite the same paragraph or extend the same V18s gate:

1. "Prefix table itself is immutable — adding a new page requires…" is self-contradictory (the per-row invariant and the table-append-only rule are conflated).
2. Mutation procedures cover only the add path; rename/delete/merge/narrative-to-normative-promotion are silent.
3. The REQ-ID lifecycle defines only the split case; merge, deletion, and pure-rewording are silent. No retirement record exists.
4. The V18s gate enforces only "missing matrix mapping"; retired-ID reuse, renumbering-to-fill-holes, and prefix-row mutation all pass silently.
5. The "downstream tooling can search either one" sentence is descriptive, not normative — disjointness must be a tool-facing obligation.
6. The leading rationale sentence ("The `BIND` / `BNDG` split … is necessary because…") is non-normative cruft.

All six edit the same paragraph plus extensions to V18s.

## Spec Documents

- `spec.md` — Appendix: REQ-ID prefix table closing paragraph + new Retired prefixes sub-table (edited)
- `plan_topics/conventions.md` — REQ-ID discipline bullet (edited)
- `plan_topics/v18-cancellation.md` — V18s — Coverage-matrix closing CI gate (edited; three new sub-gates)
- `plan_topics/h6-req-ids.md` — Adds / Tests (edited; per-page `## Retired REQ-IDs` skeleton)
- All `spec_topics/*.md` non-narrative pages — (edited at H6; trailing `## Retired REQ-IDs` section added)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified; three new sub-gates)

## Consequence

**Severity:** correctness

The asserted invariants (prefix immutability, REQ-ID immutability) cannot be relied on by downstream tooling. The V18s gate gives a false sense of coverage. Two reviewers diverge on rename / delete / merge / rewording semantics. The cruft sentence and permissive disjointness wording compound the ambiguity.

## Solution Space

**Shape:** single

### Recommendation

Replace the closing paragraph of the REQ-ID prefix table with the following normative content (deleting the leading rationale sentence about `BIND` / `BNDG`):

> **GOV-4 (per-row invariant).** Existing rows in the prefix table are immutable: once a page is assigned a prefix, that prefix never changes and is never reused for another page. The table is append-only. Introducing a new non-narrative page requires appending a new row whose prefix is *previously-unused* — meaning absent from both this table and the *Retired prefixes* sub-table below.
>
> **GOV-5 (disjoint-prefix rule).** Each row's `Prefix` value is a complete identifier token, not a search prefix. Tooling that consumes REQ-IDs MUST anchor matches at a word boundary on both ends (`\b<PREFIX>-[0-9]+\b`); two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) MUST NOT be treated as aliases or as one prefix-matching the other.
>
> **GOV-6 (table-completeness invariant).** At every commit on `main`, the set of prefixes appearing in REQ-IDs across `spec_topics/*.md` is a subset of the union of (live prefix table, Retired prefixes sub-table). The V18s gate enforces this.
>
> **GOV-7 (mutation procedures).**
> - **Add.** New page → append a row with a previously-unused prefix.
> - **Rename.** Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten.
> - **Delete.** The row is moved from the live table to the Retired prefixes sub-table. The prefix MUST NOT be reused.
> - **Merge.** The surviving page keeps its prefix; the absorbed page's prefix is moved to the Retired prefixes sub-table.
> - **Narrative-to-normative promotion.** Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation.
>
> **GOV-8 (REQ-ID lifecycle).**
> - **Split.** When one rule splits into N rules, the original ID retires and N fresh IDs are appended at the page's tail.
> - **Merge.** When N rules merge into one, all N source IDs retire and one fresh ID is appended at the page's tail.
> - **Deletion.** Rule removed without replacement → ID retires; the prefix-position number MUST NOT be reused.
> - **Pure rewording.** Typo fixes, sentence restructuring, link updates leave the ID unchanged. A change that alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold is substantive and MUST be modelled as a split, merge, or deletion-plus-add — never as an in-place edit.
>
> All retirements (per GOV-7 Delete/Merge and per GOV-8 Split/Merge/Deletion) MUST be recorded:
>
> - **Per-prefix retirements** appear in a `Retired prefixes` sub-table immediately below the live prefix table, with columns (`Prefix`, `Formerly`, `Retired in` — commit SHA or release tag).
> - **Per-ID retirements** appear in a trailing `## Retired REQ-IDs` section on each non-narrative page, with columns (`ID`, `Retired in`, `Successor(s)`).

V18s sub-gate extensions (added to V18s in `plan_topics/v18-cancellation.md`):

1. **Reused-ID gate.** The set of retired IDs (union across all `## Retired REQ-IDs` sections) is disjoint from the set of currently-numbered IDs across all pages.
2. **Dense-numbering gate.** For each non-narrative page, the union of live `PREFIX-N` markers and that page's retired-ID list forms a contiguous `1..K` range. A trailing hole is permitted iff the missing IDs all appear in the retired-IDs section.
3. **Prefix table-completeness gate.** GOV-6's check: every prefix observed in spec text appears in the live prefix table or the Retired prefixes sub-table; every retired prefix has a witness row.

Companion edits:

- **`plan_topics/conventions.md`** — Replace the REQ-ID discipline bullet with a paragraph that mirrors GOV-4 through GOV-8 by reference, citing the appendix as canonical.
- **`plan_topics/h6-req-ids.md`** — Adds: insert empty `## Retired REQ-IDs` skeleton on every non-narrative page during the anchor pass. Tests: assert exactly one such section per non-narrative page.

Edge cases:

- The Retired prefixes sub-table is itself append-only — a retired prefix cannot be un-retired.
- The "previously-unused" check unions the live and retired tables, so a deleted page's prefix is permanently sequestered.
- A merge across two pages requires the retirement record to live on the source page; the successor's home page is the page whose prefix the new ID carries.
- The retirement-record format records no human-readable reason; if needed, add a fourth column without breaking the gate.
- MERGE-F (BNDS / BNDR rename) lands *before* this finding under bottom-up processing; if the current `BIND` / `BNDG` cell has been swapped before this paragraph rewrite lands, the Retired prefixes sub-table records the placeholder transitions explicitly.

## Related Findings

- MERGE-E (REQ-ID intro paragraph) — landed already under bottom-up processing before this; this finding extends the GOV-N namespace established there.
- MERGE-F (BNDS / BNDR rename) — must land before this finding (lower in doc → processed first); the retirement registry can record the BIND/BNDG → BNDR/BNDS transition if needed.

---

---

## spec.md — REQ-ID prefix table: `bindings.md` row

---

# spec.md REQ-ID prefix table — `bindings.md` row cleanup (BNDS / BNDR)

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 2 findings:
- Table cell encodes transition prose + two prefixes instead of a single canonical token
- `BNDG` is a non-obvious abbreviation; assignment rationale inverted

**Kind:** correctness, naming, clarity, implementability, traceability

## Finding

The `bindings.md` row in `spec.md`'s REQ-ID prefix table currently reads:

```
| `bindings.md` | `BIND` &nbsp;→&nbsp; **BNDG** (to keep `BIND` for `binder.md`) |
```

This violates the table's one-prefix-per-row invariant (every other row holds a single bare token) and uses the contrived abbreviation `BNDG` for `bindings.md` while assigning the natural `BIND` to `binder.md` — an asymmetric allocation with no documented rationale that future readers cannot reproduce from the page name.

Both defects are fixed by adopting a vowel-elision convention: when two page stems collide on their first four letters, both pages take a four-letter contraction formed by stripping interior vowels.

This finding MUST land before H6 begins numbering; after H6, REQ-ID immutability prevents the swap.

## Spec Documents

- `spec.md` — Appendix: REQ-ID prefix table (rows for `bindings.md` and `binder.md`); paragraph immediately after the table (rationale sentence deleted) (edited)
- `plan_topics/h6-req-ids.md` — Adds / Tests (modified to use `BNDS` / `BNDR`)
- `plan_topics/conventions.md` — REQ-ID discipline example (modified)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified; prefix-set assertion derives the union from the table itself, so no code change beyond text update)

## Consequence

**Severity:** correctness

A naïve table parser sees two tokens in the `bindings.md` row and either picks the wrong one or fails. After H6 has stamped IDs, the asymmetric allocation cannot be revisited. Cognitive cost: every author writing under `bindings.md` must memorise an unmotivated synthetic prefix.

## Solution Space

**Shape:** single

### Recommendation

Replace the `bindings.md` and `binder.md` rows in `spec.md`'s REQ-ID prefix table with single-token entries derived from the interior-vowel-elision rule:

```
| `bindings.md` | `BNDS` |
| `binder.md`   | `BNDR` |
```

State the elision rule once in the prefix-table preamble (or as a footnote on either row): "Where two page stems collide on their first four letters, both prefixes are formed by stripping interior vowels (`bindings` → `BNDS`, `binder` → `BNDR`)."

Delete the trailing rationale sentence after the table that begins "The `BIND` / `BNDG` split for `binder.md` and `bindings.md` is necessary because…" — the elision rule subsumes it, and the symmetric allocation needs no defence.

Companion edits:

- **`plan_topics/h6-req-ids.md`** — Update the **Adds** call-out and the **Tests** bullets to read `BNDS` for `bindings.md` and `BNDR` for `binder.md`. The prefix-set test continues to derive the union from the table itself, so no code change beyond text update.
- **`plan_topics/conventions.md`** — Update the `binder.md → BIND` example (REQ-ID discipline paragraph) to `binder.md → BNDR`.

Edge cases:

- This finding MUST land before H6 numbers any IDs against either page. After H6, the swap is forbidden by REQ-ID immutability.
- Any review feedback already in flight that cites `BIND-N` against `binder.md` or `BNDG-N` against `bindings.md` must be re-anchored before H6 closes.
- No retired-prefixes machinery is needed — no `BIND-N` or `BNDG-N` IDs were ever issued (verified by `grep -E '\b(BIND|BNDG)-[0-9]+\b' spec_topics/`). If MERGE-G's retirement registry has already landed, this row's transition is recorded as one entry: `BIND` (Formerly: `binder.md` placeholder) and `BNDG` (Formerly: `bindings.md` placeholder), both retired in the same edit that introduces `BNDR` / `BNDS`.

## Related Findings

- MERGE-G (closing immutability paragraph) — must land *before* this finding (in landing order: MERGE-G first, MERGE-F after) so that the retirement registry exists when the swap is recorded. In doc order: MERGE-G appears above MERGE-F (MERGE-F is processed first under bottom-up).

---

---

## spec_topics/pi-integration-contract.md

---

# Spec mandates broad-catch exception handling that conventions unconditionally forbid

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Spec mandates broad-catch exception handling; conventions unconditionally forbid it
**Kind:** doc-alignment-broad

## Finding

`spec_topics/pi-integration-contract.md` requires the runtime to recover from arbitrary throws across at least four Pi SDK boundary sites, none of which the SDK types as a specific exception subclass:

1. `AgentSession.dispose()` — "If `dispose()` itself throws, the runtime logs the disposal error via the `loom/runtime/subagent-dispose-failure` diagnostic … but does not mask the original error" (Subagent session lifecycle, around line 101).
2. `pi.sendMessage` for `loom-system-note` — "If it throws or rejects, the runtime falls back …" through `ctx.ui.notify` then a diagnostic then `console.error` (System notes, lines 160–165).
3. `ctx.ui.notify` inside that same fallback — "`ctx.ui.notify` itself can throw (e.g. in print mode where Pi's UI is not attached); wrap it in the same try/catch and proceed to the diagnostic step" (line 165).
4. The interpreter top-level wrap — `pi-integration-contract.md` line 99 lists "any unexpected exception thrown by the interpreter or the Pi SDK" as a teardown trigger, and `plan_topics/v18-cancellation.md` V18m/V18n catch "an unexpected interpreter throw … outside the closed V1 panic-source list (a `TypeError` from a host function, an internal invariant violation, an unanticipated SDK reject)" and route it to `loom/runtime/internal-error`. By construction this catch-clause cannot bind a specific subtype.

`plan_topics/conventions.md` "Cross-cutting rules" prohibits exactly these patterns: "No `catch (e)`, `catch (e: unknown)`, `catch (e: any)`, or `catch (e: Error)` — bind to a specific subtype or let the exception propagate. The rethrow-on-mismatch pattern … is also forbidden. … ESLint rule (`no-broad-catch`) wired in H1 enforces this." `plan_topics/h1-scaffold.md` (line 36) widens this slightly with "explicit boundary modules listed in the lint config are exempt so that catching standard-library `Error` subtypes (`AbortError`, `TypeError` from JSON parsing) at well-defined boundaries remains possible" — but the rationale only contemplates catching *typed* standard-library errors, not catching `unknown` from an SDK that does not export typed throws. There is no per-site marker convention (unlike the `Promise.all` allowlist's mandatory `// allow: <REQ-ID> — <spec-page>` comment), so an exempt module currently has unbounded license to broad-catch with no audit trail tying each site back to a normative requirement.

The Pi SDK does not expose typed exception classes for `dispose`, `sendMessage`, `ui.notify`, or arbitrary host-function throws, so narrow-catch is structurally impossible at the four sites. Implementers will either (a) ship code the lint rule rejects, (b) add ad-hoc bypass comments with no spec linkage, or (c) silently dump entire boundary modules into the exempt list, defeating the rule's purpose.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Subagent session lifecycle; System notes; Runtime event channel (read-only — describes the contract that requires the catches)
- `plan_topics/conventions.md` — "Cross-cutting rules every phase", Specific exception types only bullet (edited)
- `plan_topics/h1-scaffold.md` — `no-broad-catch` ESLint rule description and exempt-module rationale (edited)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V12, Vertical V18

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — modified (lint rule definition, exempt-list / per-site marker mechanism, fixture tests)
- H4 — Pi extension shell — modified (`sendSystemNote` helper wraps `pi.sendMessage` and `ctx.ui.notify`; `PiSubagentSpawner.dispose` shim around `AgentSession.dispose()`)
- Mb — Minimal runtime + slash registration — modified (depends on H4's `sendSystemNote`; first real broad-catch user)
- V12a — `mode: subagent` accepted; AgentSession spawn — modified (disposal `finally` block; `dispose()` failure → `loom/runtime/subagent-dispose-failure` without masking original)
- V18m — Panic routing: slash-command surface — modified (top-level catch of "unexpected interpreter throw outside the closed V1 panic-source list" → `loom/runtime/internal-error`)
- V18n — Panic routing: `invoke` parent surface — modified (parallel boundary catch at the `invoke` frame)
- V18q — Runtime event channel and always-log emission — modified (helper that calls `pi.sendMessage` must observe the same throw/reject contract)

## Consequence

**Severity:** correctness

Two reasonable implementers will diverge: one will add `// eslint-disable-next-line no-broad-catch` at each site with no spec anchor; another will widen the boundary-module exemption to include large chunks of `src/runtime/`, blowing a hole through the rule. A third may try to satisfy the rule literally and fail to implement the spec-mandated fallback paths, surfacing untyped Pi SDK throws to the user as uncaught exceptions instead of as `loom/runtime/subagent-dispose-failure` / `loom/runtime/system-note-delivery-failed` / `loom/runtime/internal-error` diagnostics. The `no-broad-catch` rule is wired into H1's CI, so the conflict is hard-blocking the moment H4 lands `sendSystemNote`.

## Solution Space

**Shape:** single

### Recommendation

Extend `plan_topics/conventions.md` "Specific exception types only" with a per-site allowlist mechanism that mirrors the `Promise.all` rule:

> A `catch (e: unknown)` clause is permitted at a Pi SDK boundary site if and only if the same line carries a `// allow-broad-catch: <REQ-ID> — <spec-page>` comment. The H1 lint rule's allowlist enumerates these sites by `<file>:<line-range>`, and the V18s coverage gate asserts every allow-list entry has a matching REQ-ID present in `coverage-matrix.md`. Once H6 mints REQ-IDs for `pi-integration-contract.md`, transitional allow-comments may use the spec-page-anchor form (e.g. `// allow-broad-catch: per pi-integration-contract.md — System notes`) under the same V18s deprecation-tolerated posture as the `Promise.all` rule.

Update `plan_topics/h1-scaffold.md` to:

- Rename the rule's exempt-list rationale: it permits *both* catching typed standard-library errors at boundaries *and* the per-site `// allow-broad-catch:` form for untyped SDK throws.
- Add fixture tests asserting (i) `catch (e: unknown) // allow-broad-catch: PI-N — pi-integration-contract.md` passes, (ii) the same `catch` without the comment fails, (iii) the comment without a matching coverage-matrix entry fails the V18s gate.

Seed the allowlist in the same edit with the four canonical sites, each citing the responsible leaf:

| Site | Leaf | Spec anchor |
|---|---|---|
| `sendSystemNote` wrap of `pi.sendMessage` | H4 | pi-integration-contract.md — System notes |
| `sendSystemNote` wrap of `ctx.ui.notify` | H4 | pi-integration-contract.md — System notes |
| `PiSubagentSpawner` wrap of `AgentSession.dispose()` | V12a | pi-integration-contract.md — Subagent session lifecycle |
| Top-level interpreter wrap → `loom/runtime/internal-error` | V18m | pi-integration-contract.md — Subagent session lifecycle ("any unexpected exception") + diagnostics.md `internal-error` row |
| `invoke` boundary wrap → `loom/runtime/internal-error` | V18n | same |

Edge cases the implementer must watch:

- The top-level wrap and the `invoke`-boundary wrap are two distinct call sites and need two allow-list entries; the V18s gate must not collapse them.
- `sendSystemNote`'s re-entry guard (per H4 test) is independent of the broad-catch allowance — both must hold simultaneously.
- The exempt-module exemption (whole files exempt for typed standard-library catches) and the per-site `// allow-broad-catch:` exemption are different mechanisms; an exempt module still MAY NOT host an unmarked broad catch — the per-site comment requirement applies inside exempt files too, so audit-by-grep stays exhaustive.
- `CLAUDE.md`'s parent rule "Never `catch(...)`" is honoured because every permitted site is anchored to a spec REQ-ID; the convention can cite this in the rationale.

## Related Findings

- "`loom/runtime/internal-error` catch-all contradicts \"closed registry\" and \"exactly six panic sources\"" — same-cluster (the interpreter-body broad-catch under discussion here is the call site that emits `loom/runtime/internal-error`; that finding addresses the registry-closure tension while this one addresses the lint-rule tension; resolving both in a coordinated edit keeps the spec self-consistent on what `internal-error` is for and where it is allowed to originate)

---

# Prompt-mode streaming edge cases live on the wrong page

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Prompt-mode streaming edge cases placed in wrong file
**Kind:** placement

## Finding

`spec_topics/pi-integration-contract.md` carries a "User-visible streaming — prompt mode" paragraph (and a parallel "User-visible streaming — subagent mode" paragraph) describing what the human operator sees while a loom is running: that assistant tokens stream into the transcript in real time without buffering or restyling, that typed-query final responses render as ordinary Pi tool-call cards, that an `Err` propagated by `?` after partial assistant text leaves the streamed prefix in the transcript with the failure note appended after, and that cancellation mid-stream leaves whatever Pi has already rendered visible (no rollback). The companion subagent-mode paragraph asserts the dual: no tokens, tool-call cards, or system notes from a subagent's queries surface to any ancestor transcript.

These are observer-side outcomes of slash invocation — what a user perceives when they invoke a `/foo` command — not SDK delivery mechanics. The natural home is `spec_topics/slash-invocation.md`, which already establishes the prompt-vs-subagent observer split ("In prompt mode, the loom drives the *current* conversation — every query is a turn the user sees in their session" / "When the loom finishes, only its return value reaches the caller; the intermediate transcript stays inside the subagent") and already owns the prompt-mode top-level-`Err` rendering table that pairs naturally with the "`Err` after partial text" edge case.

What `pi-integration-contract.md` should retain are the genuinely SDK-shaped facts these paragraphs interleave: that `pi-loom` does not call any Pi-side suppression/styling API on the stream, that the typed-query sink is implemented as a synthesised one-shot tool whose Pi tool-call card is not specially formatted by loom, and that the subagent-mode in-memory `SessionManager` is what mechanically prevents subagent output from reaching Pi's user-facing UI. Those belong with the conversation-drive sections that already describe the underlying SDK calls.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "User-visible streaming — prompt mode" and "User-visible streaming — subagent mode" sections (edited)
- `spec_topics/slash-invocation.md` — receives the moved observer-side prose; integrates near the prompt-mode/subagent-mode paragraph and the top-level-`Err` table (edited)
- `spec_topics/cancellation.md` — read-only; the cancellation edge case cross-links here (read-only)
- `spec_topics/query.md` — read-only; the typed-query-renders-as-tool-call edge case is grounded by Query — Typed queries are tool-loop-shaped (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. Plan citations to the affected sections (`v5-untyped-queries.md` V5e, `v6-typed-queries.md` V6h, `v12-subagent.md`, `v18-cancellation.md`) all anchor on "Conversation drive — prompt mode", "Conversation drive — subagent mode", or "Subagent session lifecycle" — none cite the "User-visible streaming" section by anchor or by name. The move is invisible at the plan layer; no leaf needs reauthoring.

## Consequence

**Severity:** cosmetic

A reader looking for "what does the user see when a prompt-mode loom errors mid-stream" reaches for `slash-invocation.md` first and finds the top-level-`Err` table but nothing about partial-prefix retention, then has to know to also consult `pi-integration-contract.md`. The two pages each carry half of the observer contract. No implementation behaviour is at stake; no test changes; pure organisation.

## Solution Space

**Shape:** single

### Recommendation

Move the observer-side content to `spec_topics/slash-invocation.md`; keep the SDK-mechanics fragments in `spec_topics/pi-integration-contract.md`.

Concretely:

1. In `spec_topics/slash-invocation.md`, add a new section titled **"User-visible streaming"** placed immediately after the existing "In prompt mode … / In subagent mode …" bullet pair and before the "Top-level `Err` in prompt mode" section. It carries:
   - The prompt-mode statement that assistant tokens stream into the transcript in real time and the loom interpreter resumes only after `ctx.waitForIdle()`, with the user seeing the response unfold while the loom is still mid-query.
   - The two prompt-mode edge-case bullets verbatim (`Err`-via-`?` partial-prefix retention; cancellation-mid-stream partial retention with the cancellation note appended after).
   - The subagent-mode dual: no assistant tokens, tool-call cards, or system notes from a subagent's queries surface to any ancestor transcript; the only artefact crossing back is the loom's return value (or `InvokeCalleeError` / `InvokeInfraError`).
2. In `spec_topics/pi-integration-contract.md`, delete both "User-visible streaming — prompt mode" and "User-visible streaming — subagent mode" paragraphs, but **retain** the SDK-mechanics fragments by folding them into the adjacent "Conversation drive" sections:
   - Into "Conversation drive — prompt mode": the fact that `pi-loom` performs no buffering, suppression, or restyling of Pi's stream; the fact that the typed-query final response is delivered through a synthesised one-shot tool whose tool-call card uses Pi's default rendering (no loom-side formatting).
   - Into "Conversation drive — subagent mode" (or "Subagent session lifecycle"): the fact that the in-memory `SessionManager` is what mechanically prevents subagent output from reaching Pi's user-facing UI.
3. Add a one-line cross-link from each side: `slash-invocation.md`'s new section ends with "Underlying SDK delivery mechanics live in [Pi Integration Contract — Conversation drive](./pi-integration-contract.md)"; the trimmed `pi-integration-contract.md` Conversation-drive sections gain "User-visible behaviour is specified in [Invocation from Pi — User-visible streaming](./slash-invocation.md)".

Edge cases for the implementer:

- The prompt-mode paragraph also notes that "intermediate tool calls render normally in the prompt-mode transcript; only the final response is the structured-value sink." That sentence straddles both pages — it is partly observer (renders normally) and partly mechanics (final response is the sink). Split it: the rendering claim moves to `slash-invocation.md`; the "final response is the structured-value sink" claim stays in `pi-integration-contract.md` next to the synthesised-one-shot-tool description.
- Preserve the existing cross-link to `cancellation.md` from the cancellation-mid-stream bullet when moving it.
- Do not introduce new normative MUST/SHOULD wording during the move; the current paragraphs are descriptive and should remain so. Any normative tightening is a separate finding.

## Related Findings

- "Provider compatibility local-backend note belongs in `future-considerations.md`" — same-cluster (another placement fix on the same page; resolve in the same editing pass)
- "'A future feature MUST re-acquire `pi`' uses normative MUST for out-of-scope feature" — same-cluster (same page, scope/placement; the `pi` re-acquisition note sits in the prompt-mode "Conversation drive" prose adjacent to the streaming text being moved)
- "System-note `pi.sendMessage` delivery paragraph placed in wrong file" — same-cluster (parallel placement issue elsewhere in the spec; same kind of fix, no shared edit)
- "SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page" — same-cluster (same kind: SDK-vs-behavior boundary mis-placement on a different page)
- "Provider seed-field mapping (Determinism section) placed in binder page" — same-cluster (same kind, different page)

---


