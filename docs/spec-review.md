# pi-loom — Consolidated Spec Review

_Generated: 2026-05-05T19:49:46Z (revised: merges + multi→single conversion + bottom-up reorder)_
_60 source findings → 36 commit-ready findings (8 merge clusters, 29 standalone). 8 false positives dropped at consolidation; 0 persistent failures._

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

# Provider compatibility local-backend note belongs in `future-considerations.md`

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Provider compatibility local-backend note belongs in `future-considerations.md`
**Kind:** scope, placement

## Finding

The closing sentence of the "Provider compatibility for typed queries" paragraph in `spec_topics/pi-integration-contract.md` reads:

> Note that for OpenAI-compatible local backends whose provider type is in the supported set but whose specific model ignores `tool_choice`, the most likely symptom is a `validation` error with `attempts` exhausted; the runtime cannot separately diagnose model-level non-compliance in V1.

This sentence is not a normative obligation. It is an acknowledgement of a V1 diagnostic gap — the runtime cannot distinguish a provider-level support failure (which V1 does detect at load time and at runtime via `loom/load/typed-query-unsupported-provider` and a synthetic `transport` error) from a model-level non-compliance failure (which V1 surfaces only indirectly as `validation` exhaustion). Embedding it inside the otherwise normative paragraph mixes two registers: the rule that defines the supported provider set and the contractual error mapping for unsupported providers, versus an implementer caveat about a known blind spot.

This is distinct from the existing future-consideration "Typed-query support for providers without named-tool forcing", which is about *widening* the supported provider set with a JSON-mode fallback. The note in question is about *diagnostics* on providers already in the set, and currently has no home in `future-considerations.md`.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Provider compatibility for typed queries (edited)
- `spec_topics/future-considerations.md` — destination for the relocated note (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. V6m ("Typed-query provider compatibility check") cites the same anchor and continues to do so unchanged; its Adds/Tests describe load-time warning emission and runtime `transport` error synthesis, neither of which is touched by relocating a non-normative caveat. The relocation is purely editorial.

## Consequence

**Severity:** cosmetic

A non-normative limitation embedded mid-paragraph in a normative section is easy to misread as a contract requirement and hard to find when later auditing what V1 deliberately defers. No implementer behaviour changes either way.

## Solution Space

**Shape:** single

### Recommendation

Strip the trailing sentence from the "Provider compatibility for typed queries" paragraph in `spec_topics/pi-integration-contract.md` so the paragraph ends after the cross-link to `future-considerations.md`. Add a new bullet to `spec_topics/future-considerations.md` under a fresh top-level section **"Known V1 limitations (no seam expected)"** placed after "Model-level changes (no V1 seam expected)":

- **Diagnostic limitation: model-level non-compliance with `tool_choice` on supported providers.** When a typed query routes through a provider in the V1 supported set (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`) — most commonly an OpenAI-compatible local backend — but the specific model ignores forced-tool selection, the runtime cannot distinguish this from any other case where the model fails to call the respond tool. The visible symptom is a `validation` error with `coercion.attempts` exhausted. Separating provider-level from model-level non-compliance is out of scope for V1.
  *Cross-ref:* [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md).

The new bucket is justified because the existing three buckets are all forward-looking ("deferrals", "extensions", "model-level changes"); a known *limitation that V1 ships with* is a fourth category. If the editor prefers not to introduce a fourth top-level section, the bullet may instead be added under "Model-level changes (no V1 seam expected)" with the title amended in the lede paragraph to cover both forward changes and known gaps. Edge case for the implementer: the V6m leaf's spec citations remain valid as anchors; no test wording changes.

## Related Findings

- "Prompt-mode streaming edge cases placed in wrong file" — same-cluster (both relocate non-fitting content out of `pi-integration-contract.md`, but the destinations differ — `slash-invocation.md` vs. `future-considerations.md`)
- "\"A future feature MUST re-acquire `pi`\" uses normative MUST for out-of-scope feature" — co-resolve (the same `future-considerations.md` edit pass that adds the local-backend bullet should also relocate the future-feature MUST sentence; both demote out-of-scope material out of normative paragraphs in `pi-integration-contract.md`)
- "V1 seam constraints mixed with out-of-scope deferrals across 14 bullets" — decision-dependency (a structural reorganisation of `future-considerations.md` would change the destination bucket layout; if that finding is resolved first, the new bucket recommended here may already exist)

---

# Normative MUST applied to out-of-scope future feature in Conversation drive — prompt mode

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** "A future feature MUST re-acquire `pi`" uses normative MUST for out-of-scope feature
**Kind:** scope

## Finding

In `spec_topics/pi-integration-contract.md`, the **Conversation drive — prompt mode** bullet states:

> The captured `pi` reference assumes the user session is **not** replaced mid-loom (`ctx.newSession()` / `ctx.fork()` / `ctx.switchSession()` invalidate it); V1 looms never trigger replacement, but a future feature that does so MUST re-acquire `pi` via `withSession` before the next `sendUserMessage`.

The clause uses RFC-2119 MUST to bind a future, post-V1 feature that the surrounding sentence explicitly says V1 never triggers. Normative keywords in the spec are reserved for obligations a V1 conformer must satisfy; using MUST for behaviour outside V1 scope makes the obligation indistinguishable from a live V1 requirement to a reader scanning for testable rules. The same paragraph already pins the V1 invariant ("V1 looms never trigger replacement"), so the future-feature note adds no V1 obligation — only forward-compatibility guidance for whichever future leaf adds session replacement.

Compounding the placement issue, the future-replacement scenario is not catalogued in `spec_topics/future-considerations.md`, so the only mention of it lives inside a normative V1 paragraph rather than alongside other deferred items.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Conversation drive — prompt mode" bullet (edited)
- `spec_topics/future-considerations.md` — "Surface extensions (V1 leaves a seam)" (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The paragraph's V1-binding content (captured-`pi` lifetime, `sendUserMessage` delivery, `waitForIdle` completion) is unchanged; only the out-of-scope future-feature note is rewritten and relocated. `V5e` (`PromptModeConversationDriver`) consumes the V1 portion of the paragraph and is unaffected by the wording change.

## Consequence

**Severity:** cosmetic

A reader treating MUST/SHOULD/MAY as the spec's normative inventory will encounter an obligation whose subject is explicitly out of V1 scope, briefly confusing what V1 must satisfy. Because the immediately preceding clause pins the V1 invariant, no implementer is at risk of building the wrong thing — the cost is reader friction and a scope-tagging inconsistency relative to other deferred items.

## Solution Space

**Shape:** single

### Recommendation

Make two coordinated edits:

1. In `spec_topics/pi-integration-contract.md`, replace the future-feature clause with non-normative wording that ends the sentence at the V1 invariant. Suggested replacement for the existing fragment:

   > The captured `pi` reference assumes the user session is **not** replaced mid-loom (`ctx.newSession()` / `ctx.fork()` / `ctx.switchSession()` invalidate it); V1 looms never trigger replacement (see [Future Considerations](./future-considerations.md) for the post-V1 re-acquisition seam).

   This keeps the V1 invariant intact, drops the RFC-2119 keyword from an out-of-scope subject, and leaves a single forward link so readers chasing the future seam land in the right file.

2. In `spec_topics/future-considerations.md`, add a bullet under **Surface extensions (V1 leaves a seam)** that owns the deferred behaviour. Suggested wording:

   > **Mid-loom user-session replacement.** A future feature that calls `ctx.newSession()`, `ctx.fork()`, or `ctx.switchSession()` from inside a running loom invalidates the factory-captured `pi` reference used by the prompt-mode driver. The future implementation will need to re-acquire `pi` via `withSession` before the next `sendUserMessage`.
   > *Seam:* the prompt-mode driver reads `pi` from a single captured reference; introducing a re-acquisition hook is a localised change and does not perturb V1's "captured for the lifetime of each loom invocation" rule.

Edge cases the implementer must watch:

- Preserve the parenthetical list of session-mutating methods (`ctx.newSession()` / `ctx.fork()` / `ctx.switchSession()`) in whichever location the rewrite lands in — V5e's architectural test depends on the spec naming the exact set of replacement triggers, not just the concept.
- The cross-link in `pi-integration-contract.md` should point at the new `future-considerations.md` bullet, not the file's top, so the forward reference survives future re-ordering of the future-considerations list.
- Do not weaken the "V1 looms never trigger replacement" assertion — that is the live V1 invariant V5e relies on for the captured-`pi` lifetime guarantee.

## Related Findings

- "Symlink hardening future path embedded inline in a normative rule" — same-cluster (identical pattern: out-of-scope future text embedded inside a normative V1 paragraph; resolves independently with the same relocation-to-future-considerations move)
- "V1 seam constraints mixed with out-of-scope deferrals across 14 bullets" — same-cluster (parallel scope-hygiene issue inside `future-considerations.md` itself; both findings touch the V1-vs-future boundary but resolve independently)
- "Provider compatibility local-backend note belongs in `future-considerations.md`" — co-resolve (adjacent paragraph in the same `pi-integration-contract.md` section; both relocate an out-of-scope clause to `future-considerations.md` and can be edited in a single pass)
- "Two-arm binder schema is a V1 deliverable buried in the non-goals section" — same-cluster (mirror-image scope-hygiene issue: V1 content in a future-section rather than future content in a V1 section; same underlying spec-organisation rule)

---

# H2 Clock seam — watcher debounce, scanPackagesTimeoutMs, RuntimeEvent occurred_at

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Merged from:** 3 findings:
- Watcher debounce (250 ms) is a wall-clock constraint with no injectable clock seam
- RuntimeEvent deduplication key references a non-existent field
- `scanPackagesTimeoutMs` is a wall-clock constraint with no injectable clock seam

**Kind:** seams, error-model, completeness, implementability

## Finding

Three findings all reduce to the same architectural gap: the spec specifies wall-clock-bounded behaviour with no injectable clock seam, and one of them (`RuntimeEvent` dedup key) requires a stamped timestamp that the seam would provide.

1. The watcher debounce window (250 ms) is unobservable in tests without a fake clock.
2. `scanPackagesTimeoutMs` cannot be exercised in CI without a fake clock.
3. `RuntimeEvent`'s dedup key references `event.timestamp`, but `RuntimeEvent` declares no such field. Consumers cannot dedup correctly.

All three are resolved by adding a single `Clock` seam to the H2 DI skeleton and using it consistently. The findings MUST merge because they all extend the same H2 interface block.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — H2 DI seams paragraph (edited; new `Clock` interface alongside `FileSystem`); Watcher Step 4 (edited; Clock-seam reference); `RuntimeEvent` declaration (edited; new `occurred_at: number` field) (edited)
- `spec_topics/implementation-notes.md` — Runtime section (edited; `Clock` bullet alongside `SchemaValidator`)
- `spec_topics/discovery.md` — Package-discovery edge-cases bullet (edited; Clock-seam reference)
- `plan_topics/h2-di-skeleton.md` — Adds (edited; `Clock` interface in code block, `FakeClock` in test fakes, ordering rules in Tests bullets)
- `plan_topics/v18-cancellation.md` — V18f, V18r, V18q tests (edited; use `FakeClock` to drive deterministic coalescing / dedup)
- `plan_topics/v14-discovery.md` — V14m (edited; replace real-time test with `FakeClock` advance)

## Plan Impact

**Phases:** Horizontal, Vertical V14, V18

**Leaves (implementation order):**

- H2 — DI skeleton — (modified; adds `Clock` interface and `FakeClock` test fake)
- V14m — discovery walk timeout-cap path — (modified; uses `FakeClock`)
- V18f — watcher debounce coalescing — (modified; uses `FakeClock`)
- V18q — RuntimeEvent dedup — (modified; tests dedup key includes `occurred_at`)
- V18r — settings-watcher debounce — (modified; uses `FakeClock`)

## Consequence

**Severity:** correctness

Without the seam, three CI surfaces (V14m, V18f, V18r) either rely on real wall-clock time (slow + flaky) or cannot be tested at all. Without `occurred_at`, the dedup key in V18q is unspecified — two consumers will deduplicate inconsistently. The settings-watcher debounce (V18r) inherits the same gap.

## Solution Space

**Shape:** single

### Recommendation

Add a `Clock` seam to H2's DI skeleton, modelled on the existing `FileSystem` seam:

```ts
interface Clock {
  now(): number;                                         // monotonic milliseconds
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
```

- Production wiring: `WallClock` adapter delegates to `performance.now()` and the global `setTimeout` / `clearTimeout`.
- Test fake: `FakeClock` exposes `advance(ms: number)`. `advance` synchronously fires every timer whose deadline has elapsed, in deadline order; equal-deadline timers fire in registration order. `clearTimeout` is a no-op for already-fired handles. `now()` returns the fake's accumulated time and is *not* implicitly advanced.
- Lint rule: `Date.now`, `performance.now`, `Date.prototype.getTime`, and the global `setTimeout` / `clearTimeout` MUST NOT appear under `src/` outside the `WallClock` adapter (parallel to the existing `process.env.HOME` ban for `homedir()`). H2 ships a grep-test that enforces this.

Wire the seam at three sites:

1. **Watcher debounce (`pi-integration-contract.md`, Watcher Step 4).** Append: "the 250 ms window is measured against the runtime's injected `Clock` seam (per H2's DI skeleton); the seam exists to make burst-coalescing assertions deterministic and is not a tunable runtime knob."
2. **Discovery timeout cap (`discovery.md`, Package-discovery edge-cases bullet).** Append: "elapsed time is read through the runtime's `Clock.now()` seam (see [Pi Integration Contract](./pi-integration-contract.md)). The cap-check site is *before each new candidate-package read attempt*; a single very slow read is not aborted mid-flight (deferred hardening)."
3. **`RuntimeEvent.occurred_at`.** Extend the `RuntimeEvent` declaration with a required field:
   ```ts
   occurred_at: number; // Unix epoch ms, stamped at the originating emission site via Clock.now()
   ```
   Replace the dedup-key tuple text with: "Consumers MUST deduplicate on `(kind, query_site, message, occurred_at)`. Re-emissions for symmetry MUST copy the originating `RuntimeEvent` instance verbatim — including `occurred_at` — rather than re-stamping. Two emissions from the same `query_site` with the same `kind` and `message` but distinct `occurred_at` values represent two distinct occurrences."

Companion edits:

- **`spec_topics/implementation-notes.md`** — Add a `Clock` bullet to the Runtime section parallel to the existing `SchemaValidator` bullet, pinning one-instance-per-runtime.
- **`plan_topics/h2-di-skeleton.md`** — Adds: the `Clock` interface, the `WallClock` and `FakeClock` implementations, the grep-test, the ordering rules. Tests: `FakeClock.advance` fires due timers in deadline + registration order; `clearTimeout` is no-op for already-fired handles; concurrent timers with equal deadlines fire in registration order.
- **V14m, V18f, V18r, V18q tests** — Replace any wall-clock-dependent assertion with `FakeClock` injection. V18q must advance the clock between iterations of dedup-loop test cases so two consecutive emissions from the same site get distinct `occurred_at` values.

Edge cases:

- `Clock.now()` is monotonic (forbids `Date.now()`-style NTP drift).
- `Clock` is one-instance-per-runtime; parallel runtimes get independent clocks.
- The watcher's debouncer holds the most recent timer handle and clears it on each new event.
- The cap-check site for `scanPackagesTimeoutMs` is *between* `package.json` reads, not inside them.
- The `occurred_at` rethrow rule (copy-verbatim, never re-stamp) must be enforced through `?`-propagation and the user-facing top-level handler.
- Tests that mock the clock to a constant value will collide on `occurred_at`; V18q's test harness MUST advance the mock between iterations.

## Related Findings

- None outside this merge.

---

# Watcher structural-change note: `<N> file(s)` rendering rule unspecified

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Watcher structural-change note: `<N> file(s)` grammar ambiguous
**Kind:** testability

## Finding

`spec_topics/pi-integration-contract.md` (Structural changes paragraph) defines the watcher's informational note as:

> `loom watcher: <N> file(s) added or removed; run /reload to refresh the slash command list`

The substitution rule for `<N>` is named ("the count of distinct paths in the debounce-window batch"), but the surrounding word `file(s)` carries no rule. Two interpretations are equally consistent with the prose: (a) `file(s)` is a literal token that ships verbatim regardless of `N` (so `N=1` renders `1 file(s) added or removed`), or (b) `file(s)` is shorthand notation that an implementation expands to `1 file` / `N files` based on `N`. The same ambiguity is inherited by `V18r`, which routes settings-array deltas through this exact note.

This matters because `V18f`'s acceptance tests assert the rendered `content` against the spec template "verbatim" with `<N>=1` and `<N>=5`. The test cannot be written until the rendering rule is pinned: under interpretation (a) the assertion is `1 file(s) added or removed`; under interpretation (b) it is `1 file added or removed` and `5 files added or removed`. Two implementers reading the current text will pick differently and one will fail conformance.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Structural changes" paragraph under Extension entry point §4 (edited)

## Plan Impact

**Phases:** Vertical V18

**Leaves (implementation order):**

- V18f — File watcher (chokidar) over discovery roots — (modified)
- V18r — Settings-file watcher (`~/.pi/agent/settings.json`, `.pi/settings.json`) — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will render the `N=1` case differently (`1 file(s)` vs `1 file`). `V18f`'s "matches the spec template verbatim" assertion is not executable without a rule, and the same applies to `V18r` which reuses the note. End-users see a minor cosmetic difference; the conformance harness sees a hard test failure.

## Solution Space

**Shape:** single

### Recommendation

Adopt Option A. The note is a transient operator prompt, not prose the user dwells on; the cost of pluralisation logic is not repaid by the readability gain. State explicitly that `file(s)` is a literal for all `N`, and pin a worked example (`<N>=1` → `loom watcher: 1 file(s) added or removed; run /reload to refresh the slash command list`). `V18f` and `V18r` then have an unambiguous string to assert against.

Edge cases for the implementer:
- `<N>` is rendered in base 10 with no thousands separator, no leading zero, no sign.
- `<N>` equals `details.structural.added.length + details.structural.removed.length`; a path that appears in both arrays (rename: removed then re-added inside the same window) counts once if the spec elsewhere coalesces it, or twice if not — pin this in the same edit if the answer is not already in the structural-payload section.
- The trailing `; run /reload to refresh the slash command list` is also literal; do not substitute the slash-command name into it.

## Related Findings

- "Watcher debounce (250 ms) is a wall-clock constraint with no injectable clock seam" — same-cluster (same V18f leaf, both about watcher testability)
- "System-note 120-codepoint cap: \"code points or grapheme clusters\" is ambiguous" — same-cluster (both pin rendering rules for `loom-system-note` content strings)
- "Re-scan deduplication: no observable emission counter" — same-cluster (both about asserting watcher-emitted system-note content)

---

# Tool-error `message` truncation rule is sloppy on inclusivity, partial-code-point disposition, and the surrogate framing

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Tool execution content truncation: boundary and multi-byte edge case underspecified
**Kind:** testability

## Finding

The `code_tool` / `cause: "execution"` lowering in `spec_topics/pi-integration-contract.md` (the long paragraph beginning "The tool's returned `{ content, isError }`…") specifies the truncated `message` field as "the same filtered/joined text truncated to 4096 bytes (UTF-8) at a code-point boundary (no split surrogates / multi-byte sequences)". Three things are left ambiguous:

1. **Inclusive-vs-exclusive bound.** "Truncated to 4096 bytes" does not say whether the resulting byte length MUST be ≤ 4096 or < 4096, nor whether 4096 itself is the target length when input exceeds it. A conformance test cannot assert the exact byte length of the result.
2. **Partial-code-point disposition.** "At a code-point boundary" tells the implementer where the cut may not fall, but not what to do when a multi-byte code point straddles the boundary. The sensible reading is "drop the partial code point entirely, accept a result < 4096 bytes," but this is left implicit; an implementer could equally choose "include the partial code point and exceed the limit," "pad with replacement bytes," or "emit U+FFFD." The plan-side V14g already encodes the sensible reading ("the character is dropped whole, not split"), so the spec is the lagging document.
3. **Surrogate framing.** "No split surrogates / multi-byte sequences" conflates two different encodings. UTF-8 has no surrogates — surrogates are a UTF-16 concept. The well-formed companion rule, given verbatim in `spec_topics/binder.md` for system-note rendering ("Truncation operates on whole code points (or grapheme clusters) — never on UTF-16 code units, which would split surrogate pairs"), is the right framing: the operation is over code points, and the prohibition is against truncating in JavaScript-string space (UTF-16 code units) rather than UTF-8 byte space. The contract should pick UTF-8 byte counting and code-point cuts and drop the surrogate language entirely (or use the binder.md framing if the cap is being recast as a code-point cap).

The plan leaf already pins concrete behaviour, so spec authors and implementers will diverge in ways the test suite can detect; the gap is in the spec's normative paragraph, not in the test plan.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution and result lowering" paragraph at line 175 (edited)
- `spec_topics/binder.md` — System-note rendering rule 2 at line 140 (read-only; reference for canonical phrasing)
- `plan_topics/v14-tool-calls.md` — V14g test bullet (read-only; verifies the spec edit lands consistently with already-pinned behaviour)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14g — `CodeToolError` variant: `execution` cause — (modified)

V14g already specifies "≤4096 bytes at a code-point boundary (final byte never mid-multi-byte-sequence; no split surrogates)" and "the character is dropped whole, not split." A spec edit that picks the inclusive bound and drops the partial code point will require a one-line wording sync in V14g (remove "no split surrogates," reword to match the spec's final language) but no semantic change.

## Consequence

**Severity:** correctness

Two implementers reading the current paragraph could ship outputs that differ by a few bytes on every truncated tool error: one drops the straddling code point (result < 4096 bytes), one keeps it (result up to 4099 bytes), one emits U+FFFD. Conformance tests pinning the exact `message` field — which V14g calls for — will then disagree across implementations. The defect is small in user impact but blocks a clean test contract.

## Solution Space

**Shape:** single

### Recommendation

Replace the relevant clause in `spec_topics/pi-integration-contract.md` with:

> `<m>` is the same filtered/joined text encoded as UTF-8 and truncated so that the resulting byte length is at most 4096 bytes. Truncation MUST cut on a Unicode code-point boundary: every code point in the output is represented by all of its UTF-8 bytes, and no bytes of a partial code point appear. When a code point would straddle the 4096-byte limit, that code point is dropped entirely; the resulting message MAY therefore be shorter than 4096 bytes by up to three bytes.

Apply the identical rewrite to the sentence two clauses later that handles the `execute()`-throw path ("truncated under the same rule" already chains correctly; no separate edit needed).

Add one normative vector in the same paragraph or in a footnote:

> Worked example: a filtered/joined text whose first 4095 bytes are ASCII followed by a 3-byte UTF-8 code point (e.g. U+2026 `…`) MUST truncate to 4095 bytes; the 3-byte code point is dropped because including it would yield 4098 bytes.

Edge cases for the implementer:

- The cap is over UTF-8 byte length of the output, not over JavaScript-string `.length` (which counts UTF-16 code units). A naive `s.slice(0, 4096)` in JS would split surrogate pairs and is wrong on both axes.
- The 4-byte UTF-8 code points (astral plane, e.g. emoji) can drop up to three bytes off the result; the worked example above pins the 3-byte case but the 4-byte case is allowed and tested in V14g (`"😀"` straddling the boundary).
- Drop the "no split surrogates" phrase — it imports a UTF-16 concept into a UTF-8 specification and confuses the contract. The "complete code point" rule subsumes both prohibitions.

## Related Findings

- "Watcher structural-change note: `<N> file(s)` grammar ambiguous" — same-cluster (both are testability gaps in `pi-integration-contract.md` where a conformance test cannot assert an exact string output without further pinning; resolve independently)
- "Non-text content \"silently\" discarded: no observable signal for tests" — same-cluster (immediately adjacent paragraph in the same lowering rule; both concern observability of the tool-result lowering pipeline but resolve independently)

---

# Non-text content discard: clarify that `Ok("")` is the full observable contract

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Non-text content "silently" discarded: no observable signal for tests
**Kind:** testability

## Finding

The Tool execution lowering paragraph in `pi-integration-contract.md` (the `pi.execute` → loom-string contract) states: "Non-text content blocks (images, resource references) are discarded silently in V1" and then declares both `content: []` and a content array containing only non-text blocks to be legal `Ok("")` values when `!isError`. The intent is clearly that these two input shapes are observationally equivalent at the loom level, and `V14c-a`'s test list already asserts both produce `Ok("")`.

What the paragraph does not state explicitly is whether "silently" extends to the operator-facing `loom-system-note` / `RuntimeEvent` channel. The runtime emits structured `RuntimeEvent` records for the always-log set of `QueryError` failures (`pi-integration-contract.md` "Runtime event channel"), and an implementer reading "discarded silently" might reasonably decide to add a non-failure informational event ("N image blocks dropped") on the same channel — or might decide not to. Two conformant implementations can therefore differ in what an operator's transcript shows after a tool returns image content, and a conformance test cannot tell from the spec alone which behaviour is correct.

The fix is a one-clause clarifier — not a new mechanism. The spec should make explicit that the lowering produces no diagnostic, no `RuntimeEvent`, and no `loom-system-note`; the loom-level observable is exhausted by the `Ok("")` value. Implementations remain free to emit non-normative debug logs.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — "Tool execution from loom code" paragraph (the `{ content, isError }` lowering description) (edited)
- `spec_topics/pi-integration-contract.md` — "Runtime event channel" / "always-log set" (read-only — confirms non-text discard is not a `QueryError` and so falls outside the always-log contract)
- `spec_topics/future-considerations.md` — read-only, confirms "richer return shape" is the deferred work and any per-block telemetry would belong here

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14c-a — Pi-tool dispatch and `ctx` synthesis for bare `<name>(args)` calls — (modified)

## Consequence

**Severity:** advisory

Two implementers can ship divergent operator-facing behaviour on a tool that returns image content (one emits an info-level `loom-system-note`, the other does not), with neither violating the current spec text. Loom-level program behaviour is unaffected — `Ok("")` is unambiguous — but conformance tests over the operator transcript are unwritable until "silently" is pinned down.

## Solution Space

**Shape:** single

### Recommendation

Replace the current sentence in `pi-integration-contract.md` "Tool execution from loom code":

> Non-text content blocks (images, resource references) are discarded silently in V1; widening to a richer return shape is reserved for [Future Considerations](./future-considerations.md).

with:

> Non-text content blocks (images, resource references) are discarded during lowering; the loom-level observable is exhausted by the resulting `Ok("")` value. The runtime MUST NOT emit a `RuntimeEvent`, `loom-system-note`, or any other normative diagnostic on the discard path — non-text discard is not a `QueryError` and is not a member of the always-log set. Implementations MAY emit non-normative debug-channel logs for operator visibility. Widening to a richer return shape (preserving non-text blocks) is reserved for [Future Considerations](./future-considerations.md).

Then add a corresponding test bullet to `V14c-a`'s test list:

> a Pi-tool returning content with non-text blocks (images / resource references) and `!isError` produces `Ok("")` with **zero** `pi.sendMessage({ customType: "loom-system-note", ... })` calls observable on the spy and zero `RuntimeEvent` payloads emitted to the always-log helper — verified with both the all-non-text case and the mixed text + image case (the latter still emits the joined text only, no per-block notice).

Edge cases the implementer must watch:

- The mixed case (one text block + one image block) returns the text alone; no notice is appended explaining the image was dropped.
- The `isError: true` path (V14g) is unchanged — `code_tool` errors continue to emit through the always-log set per the existing rules; only the `!isError` discard path is being pinned to "no diagnostic".
- A debug-level `console.debug` or equivalent is permitted but MUST NOT route through `pi.sendMessage` or the `RuntimeEvent` channel, so it cannot appear in any session transcript or operator-visible surface.

## Related Findings

- "Tool execution content truncation: boundary and multi-byte edge case underspecified" — same-cluster (same lowering paragraph; resolves independently)
- "RuntimeEvent deduplication key references a non-existent field" — same-cluster (touches the `RuntimeEvent` surface that this finding's clarifier explicitly opts out of, but resolves independently)

## spec_topics/binder.md

---

# SDK surface (`estimateTokens`, `ctx.sessionManager.buildSessionContext`) belongs in the Pi Integration Contract, not the binder behavioural page

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page
**Kind:** placement

## Finding

`spec_topics/binder.md` § *Session-context truncation (`bind_context: session`)* introduces two named SDK contracts that no other passage in the spec describes:

1. **`estimateTokens(message)`** — a function exported from `@mariozechner/pi-coding-agent`, with its semantic contract pinned (`Math.ceil(chars / 4)` over text, thinking, tool-call argument JSON, and tool-result text), and a normative claim about its provider-agnosticism and conservative-overestimate behaviour.
2. **`ctx.sessionManager.buildSessionContext().messages`** — the message-list source the binder walks, with a normative non-use clause for `ctx.getContextUsage()` ("**not** used here … reserved for compaction triggers, footer rendering").

Both items are named-export / `ExtensionContext`-method dependencies on the Pi SDK. The dedicated home for that class of contract is `spec_topics/pi-integration-contract.md`, whose opening prose declares it the enumeration of "a small, named surface from `@mariozechner/pi-coding-agent`" anchored to a specific Pi minor version, and whose intro mandates that "a Pi minor bump requires re-validating this contract before the loom `peerDependencies` range is widened." `estimateTokens` and `buildSessionContext` are exactly the kind of surface that re-validation must cover, but they are not catalogued there — only `sessionManager: SessionManager.inMemory(cwd)` (the subagent constructor call) and `getContextUsage` (in passing, on the `ExtensionContext` member list) appear.

The behavioural algorithm — newest-to-oldest walk, dual ≤20-turn / ≤8000-token caps, whole-turn boundary, worked examples — is correctly placed in `binder.md`. Only the SDK-surface declarations are misplaced.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — new SDK-surface entries for `estimateTokens` and `ctx.sessionManager.buildSessionContext` (edited)
- `spec_topics/binder.md` — *Session-context truncation* section: replace SDK-surface prose with cross-references; keep algorithm + worked examples (edited)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16g — `bind_context: session` truncation — (modified)

V16g's **Spec** field currently points only at `binder.md` for the truncation section. After the move, V16g's spec citation should also reference `pi-integration-contract.md` for the `estimateTokens` / `buildSessionContext` SDK contracts. The leaf's **Adds** / **Tests** / **Ships when** content does not change — only the cross-reference set.

## Consequence

**Severity:** advisory

The spec is internally consistent and a careful reader following links can find every required fact, so neither correctness nor implementability is at risk. The cost is operational: the Pi-integration-contract page is the documented audit surface for Pi-version bumps (per its own intro), and an audit that scans only that page on a Pi minor upgrade will miss the `estimateTokens` export contract and the `buildSessionContext` shape contract. Drift between Pi's actual behaviour and the binder's truncation algorithm could land silently.

## Solution Space

**Shape:** single

### Recommendation

Move the two SDK-surface declarations into `pi-integration-contract.md` and reduce `binder.md` to a behavioural cross-reference.

**In `pi-integration-contract.md`,** add two new bold-lead paragraphs alongside the existing surface entries (Extension entry point, Per-loom registration, Conversation drive, etc.):

- **`estimateTokens` (named export).** Imported from `@mariozechner/pi-coding-agent`. Signature: `estimateTokens(message: Message): number`. V1 behaviour: a conservative `Math.ceil(chars / 4)` over the message's text, thinking, tool-call argument JSON, and tool-result text. Provider-agnostic; matches Pi's own compaction-decision estimator, so binder truncation behaviour stays consistent with Pi as model tokenizers evolve. Used by [Slash-Command Argument Binding — Session-context truncation](./binder.md#session-context-truncation-bind_context-session) for per-message and per-turn token counts.

- **`ctx.sessionManager.buildSessionContext()` (`ExtensionContext` member).** Returns a `SessionContext` whose `.messages` field is the ordered message list the runtime consumes for session-aware features. V1 callsite: [Slash-Command Argument Binding — Session-context truncation](./binder.md#session-context-truncation-bind_context-session) sources the binder's caller-session message list from `ctx.sessionManager.buildSessionContext().messages`. The runtime MUST NOT substitute `ctx.getContextUsage()` for per-turn token accounting; that API reports aggregate session usage, not per-turn counts, and is reserved for compaction triggers and footer rendering.

**In `binder.md`,** rewrite the first sentence of *Session-context truncation* to:

> Token counts are computed per message via `estimateTokens` and the message list is sourced from `ctx.sessionManager.buildSessionContext().messages` — both contracts are catalogued in [Pi Integration Contract](./pi-integration-contract.md). A turn's token count is the sum of `estimateTokens` over its constituent messages …

Drop the parenthetical re-statement of the `Math.ceil(chars / 4)` formula and the closing paragraph's restatement of `estimateTokens`'s provider-agnosticism / conservative-overestimate property and the `ctx.getContextUsage` non-use clause; both move to the integration-contract entries above. Keep the worked example, the dual-cap algorithm, and the whole-turn-boundary rule in `binder.md` — those are behavioural, not SDK-surface.

**Edge cases for the implementer:**

- The `argument-hint` content in the binder's system prompt (above the truncation section) is unrelated and stays in `binder.md`.
- Update V16g's **Spec** citation in `plan_topics/v16-binder.md` to add a second link to `pi-integration-contract.md` (the truncation algorithm link to `binder.md` stays).
- Do not remove `getContextUsage` from the existing `ExtensionContext` member list in `pi-integration-contract.md` — the new entry is a normative non-use clause for one specific callsite, not a deprecation.
- If the Pi-integration-contract page later adds an explicit table of named exports, `estimateTokens` joins that table (currently the page uses bold-lead paragraphs, not a table; match the existing style).

## Related Findings

- "Provider seed-field mapping (Determinism section) placed in binder page" — same-cluster (sibling placement issue on the same `binder.md` page; both move SDK-version-coupled content out of the behavioural page, but the seed-field mapping's natural home is also `pi-integration-contract.md`'s provider-table region, so the two edits can land in one PR without colliding)
- "System-note `pi.sendMessage` delivery paragraph placed in wrong file" — same-cluster (another SDK-surface-vs-behaviour placement finding; resolves independently)
- "Prompt-mode streaming edge cases placed in wrong file" — same-cluster (placement reorg in adjacent territory; independent resolution)
- "Provider compatibility local-backend note belongs in `future-considerations.md`" — same-cluster (same `pi-integration-contract.md` neighbourhood gets edited; resolves independently)

---

# Per-provider seed-field mapping belongs in the Pi integration contract, not in `binder.md`

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Provider seed-field mapping (Determinism section) placed in binder page
**Kind:** placement

## Finding

`spec_topics/binder.md` § Determinism encodes a per-provider mapping of the seed field name in the request payload: `openai-completions` → `seed`, `mistral` → `random_seed`, and `anthropic-messages` / `amazon-bedrock` → field omitted. The same paragraph also pins how the mapping is keyed (the resolved binder model's `api` field as reported by `@mariozechner/pi-ai`'s model registry, "not derived from any pi-ai capability flag") and notes that widening the supporting set is a spec-versioned change.

This is a per-provider request-shape contract against a specific named pi-ai surface. `spec_topics/pi-integration-contract.md` already hosts every other artefact of that exact shape — the **Provider error mapping** table (overflow-signature regexes per provider) and the **Provider compatibility for typed queries** list (named-tool-forcing supported set: `anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`) — both keyed on the same provider-id space and both flagged as version-coupled to pi-ai. The seed-field table is the third row in the same family and is the only one currently misfiled.

The misplacement matters because the binder page's job is the binder's *behaviour* (prompt shape, echo, failure modes, session-context truncation, FNV-1a seed derivation) — provider wire shapes only show up here. Anyone searching "where do we list per-provider request-field mappings?" should land in one place. Today the seed-field table is invisible to that search and the pi-ai upgrade re-validation checklist (already attached to the Provider error mapping table) does not naturally cover it.

## Spec Documents

- `spec_topics/binder.md` — § Determinism (edited)
- `spec_topics/pi-integration-contract.md` — Provider error mapping / Provider compatibility for typed queries area (edited)
- `plan_topics/v16-binder.md` — V16h **Spec** citation (edited)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16h — Binder determinism settings — (modified)

V16h's **Spec** field currently cites `[Slash-Command Argument Binding](../spec_topics/binder.md) (determinism)` and its **Tests** bullet says "The provider-to-field mapping matches the table in [Binder — Determinism](../spec_topics/binder.md)." The implementation is unchanged; only the citation targets shift.

## Consequence

**Severity:** cosmetic

A reader looking for per-provider request-payload mappings sees two of the three (overflow signatures, named-tool-forcing support) in `pi-integration-contract.md` and assumes the family is complete. The seed-field rule lives a page away in a section about determinism. On a pi-ai upgrade, the re-validation checklist anchored to the Provider error mapping table does not cover the seed-field table even though both are version-coupled in the same way. No implementer is blocked, but the integration-contract surface is no longer authoritative for "everything that depends on a pi-ai provider id."

## Solution Space

**Shape:** single

### Recommendation

Move the per-provider seed-field mapping out of `spec_topics/binder.md` § Determinism and into `spec_topics/pi-integration-contract.md`, immediately adjacent to the existing **Provider error mapping** and **Provider compatibility for typed queries** subsections.

Concrete edits:

1. In `pi-integration-contract.md`, add a new subsection — suggested heading **Provider seed-field mapping** — containing:
   - The provider → field-name table:

     | Provider | Seed field in request payload |
     |---|---|
     | `openai-completions` | `seed` |
     | `mistral` | `random_seed` |
     | `anthropic-messages` | omitted |
     | `amazon-bedrock` | omitted |

   - The keying rule verbatim ("keyed on the resolved binder model's `api` field as reported by `@mariozechner/pi-ai`'s model registry; not derived from any pi-ai capability flag").
   - The "widening the seed-supporting set is a spec-versioned change" sentence.
   - The standard "version-coupled to `@mariozechner/pi-ai`; MUST be re-validated on each upgrade" line that already accompanies the Provider error mapping table, so the upgrade-validation discipline applies uniformly.

2. In `binder.md` § Determinism, retain only the binder-behavioural content: `temperature: 0`; the FNV-1a derivation of the seed value (offset basis, prime, mask, qualified-name input, leading-`/` rule once that companion finding is resolved); the cross-process / cross-run determinism property; and the acknowledgement that the provider may still vary outputs given a fixed seed. Replace the per-provider table with a single sentence such as: *"Whether the seed is included in the request payload, and under which field name, is governed by the per-provider mapping in [Pi Integration Contract — Provider seed-field mapping](./pi-integration-contract.md#provider-seed-field-mapping)."*

3. Update `plan_topics/v16-binder.md` V16h:
   - **Spec** field: add `[Pi Integration Contract — Provider seed-field mapping](../spec_topics/pi-integration-contract.md)` alongside the existing `binder.md` (determinism) citation.
   - **Tests** bullet: change "matches the table in [Binder — Determinism]" to "matches the table in [Pi Integration Contract — Provider seed-field mapping]."

Edge cases for the implementer to watch:

- The FNV-1a hash *value* derivation and the binder's `temperature: 0` rule stay on the binder page — only the **request-payload encoding** (which field, when omitted) moves. The seam is "how the seed is derived" (binder behaviour) vs. "how it is wired into the provider request" (integration contract). Do not move the FNV-1a paragraph.
- The companion finding *"FNV-1a seed hash: no normative reference input→output pair; encoding ambiguous"* edits the same `binder.md` § Determinism paragraph; sequencing the two edits avoids merge churn but they do not conflict — that finding tightens the derivation rule that stays on the binder page, this finding moves the encoding table off it.
- The companion finding *"SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page"* makes the same kind of move from `binder.md` to `pi-integration-contract.md`. Both can land in a single edit pass.
- After the move, `spec.md`'s topic index and any cross-page links into `binder.md#determinism` keep working as long as the anchor is preserved on the binder page (which the recommendation does — only the table is removed, the section heading stays).

## Related Findings

- "SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page" — co-resolve (same source page, same destination page, same kind of move; ship as one edit pass)
- "FNV-1a seed hash: no normative reference input→output pair; encoding ambiguous" — same-cluster (touches the surrounding paragraph in `binder.md` § Determinism but resolves independently; this finding moves the per-provider table out, that finding tightens the FNV-1a derivation rule that stays)

---

# FNV-1a binder seed: byte encoding unspecified, no normative test vector

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** FNV-1a seed hash: no normative reference input→output pair; encoding ambiguous
**Kind:** testability

## Finding

`spec_topics/binder.md` §Determinism specifies the binder seed as the 32-bit FNV-1a hash (offset basis `0x811c9dc5`, prime `0x01000193`) of the loom's qualified name "as it appears in the slash registry (the bare command name, without the leading `/`)", masked to 32-bit unsigned. Whether the leading `/` participates is unambiguous (it does not). What is *not* specified is the **byte sequence** that FNV-1a consumes.

FNV-1a is defined over a stream of 8-bit bytes; its output depends on which encoding produces those bytes. Slash names are constrained to `^[a-z0-9][a-z0-9_-]*$` (pure ASCII), so UTF-8 and UTF-16-with-either-endianness all produce different byte sequences for the same name (UTF-8: one byte per character; UTF-16LE: two bytes per character with a zero high byte; UTF-16BE: two bytes with a zero low byte; plus optional BOM). Each yields a different 32-bit hash. A JS implementer reaching for `TextEncoder` gets UTF-8; one iterating `name.charCodeAt(i)` and feeding the raw 16-bit value to a generic FNV-1a implementation gets a UTF-16-ish result; both can claim conformance to the current text.

There is also no normative input→output pair, so a conforming-test author has no anchor: V16h's plan tests already assert "equals the spec-defined 32-bit FNV-1a hash" but the spec defines no concrete value for any concrete name. Two test suites, written against the same spec, can disagree on what the right answer is.

## Spec Documents

- `spec_topics/binder.md` — Determinism (edited)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16h — Binder determinism settings — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce different seed values for the same loom, and two reasonable test suites will disagree on which value is correct. The downstream user-facing effect is mild (provider RNGs are seeded "differently but stably" either way), but the contract that "the same loom produces the same seed across processes and runs" is meaningless across implementations, and `V16h`'s "equals the spec-defined 32-bit FNV-1a hash" assertion has no concrete pass criterion until the encoding is pinned.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/binder.md` §Determinism, after the existing FNV-1a sentence, add:

> The byte sequence hashed is the UTF-8 encoding of the bare command name, with no BOM and no NUL terminator. Equivalently, on a slash name `s` matching `^[a-z0-9][a-z0-9_-]*$` the input bytes are the ASCII code points of `s` in order. Reference vectors (loom name → 32-bit unsigned seed, hex):
>
> | Loom name | Seed |
> | --- | --- |
> | `code-review` | `0x________` |
> | `hello` | `0x________` |
> | `a` | `0x________` |
>
> Conforming implementations MUST reproduce these values exactly.

Notes for the spec author filling in the table:

- Compute the values once with a vetted FNV-1a implementation (e.g. the canonical reference C code from the Landon Curt Noll page, or a well-known npm package such as `fnv-plus` configured for FNV-1a 32-bit, cross-checked against a second implementation). Do not lift values from the first hit on a search engine — multiple "FNV-1a" libraries on npm implement subtly different variants.
- The three vectors cover: (a) the canonical example name used elsewhere in the spec, (b) the MVP example name, (c) a single-character degenerate case that pins the offset-basis-then-one-XOR computation.
- `V16h` Tests should be amended in the same edit to assert against the table verbatim rather than against an unanchored "spec-defined hash" — the plan leaf is already flagged `(modified)` for this reason.

Edge cases for the implementer: the mask to 32-bit unsigned applies only to the *output* (the working value during the multiply step is naturally bounded by the implementation's choice of integer width, e.g. `Math.imul` chains in JS); do not also mask the per-byte intermediate state in a way that diverges from the canonical algorithm. JSON serialisation of the seed is a plain number, not a hex string — the hex notation is for human cross-checking only.

## Related Findings

- "Provider seed-field mapping (Determinism section) placed in binder page" — same-cluster (both touch the Determinism section of `binder.md`; the seed-field-mapping move is a placement concern that does not interact with the encoding fix, but a single editing pass through Determinism is natural)

---

# System-note 120-codepoint cap: truncation unit ambiguous between code points and grapheme clusters

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** System-note 120-codepoint cap: "code points or grapheme clusters" is ambiguous
**Kind:** testability

## Finding

`spec_topics/binder.md` § *System-note rendering* rule 2 states the cap as "120 Unicode code points" and then describes the truncation unit as "whole code points (or grapheme clusters)". The parenthetical is not a clarification — the two units are observably different. A family emoji such as 👨‍👩‍👧 occupies a single grapheme cluster but five Unicode scalar values (joined by ZWJ); a regional-indicator pair (🇩🇪) is one cluster and two scalars. Two conformant implementations — one that truncates at scalar boundaries, one that truncates at cluster boundaries — will disagree on (a) the rendered length of inputs near the 120-code-point boundary and (b) whether a cluster straddling the boundary is preserved or split.

The cap unit is already pinned: "120 Unicode code points." The contradiction is purely in the truncation-unit clause that follows. The same ambiguity also taints rule 6 of the *Echo policy* format rules, which references this section by link, and every binder failure-arm note that flows through *System-note rendering*.

A normative reading also has to settle whether `…` (U+2026) is appended to the trimmed prefix and counted toward the cap (the spec says it is), and what happens when the input is exactly 120 scalars long with no overflow (no `…` appended).

## Spec Documents

- `spec_topics/binder.md` — § System-note rendering, rule 2 (edited)
- `spec_topics/binder.md` — § Echo policy, format rules item 6 (read-only — references the rule above by link; no edit needed if the link target is fixed)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16i — `bind_echo` formatter — modified
- V16l — `needs_info` envelope handling — modified
- V16m — `ambiguous` envelope handling — modified
- V16n — Binder transport failure single retry — modified
- V16o — Binder malformed envelope handling — modified

(V16i is the principal site — its tests for *Echo policy → Format rules* item 6 already over-specify "code points not UTF-16 units" and need a third assertion pinning the truncation-unit choice. The `needs_info` / `ambiguous` / transport / malformed-envelope leaves inherit the rule via *System-note rendering* and need a single-cluster-spanning-boundary fixture each, but no leaf reordering or additional dependencies.)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce visibly different system notes for any input that contains a multi-scalar grapheme cluster near the 120-code-point boundary. Tests written against one interpretation will fail against the other; downstream renderers (Pi's TUI, log scrapers, screenshot-based docs) will diverge in observable output for the same loom invocation.

## Solution Space

**Shape:** single

### Recommendation

Replace rule 2 with a single normative formulation that fixes the truncation unit at Unicode scalar value (code point):

> **Length cap.** The fully-rendered note (loom-controlled prefix + interpolated content) is capped at 120 Unicode code points. Truncation operates at code-point (Unicode scalar) boundaries — never at UTF-16 code unit boundaries, which would split surrogate pairs. When the rendered note exceeds 120 code points, the runtime MUST replace the overflow with a trailing `…` (U+2026) and the resulting note MUST be exactly 120 code points (the `…` counts toward the cap). When the rendered note is ≤120 code points, no `…` is appended. Implementations MAY additionally back the truncation point off to the nearest preceding extended grapheme cluster boundary as a rendering courtesy, provided the resulting note is still ≤120 code points; this back-off is non-normative and tests MUST NOT assert cluster-aware behaviour.

Implementer-relevant edge cases:

- Use `Array.from(str)` or a `for…of` iterator to count scalars — `string.length` returns UTF-16 code units and will over-count BMP-supplementary characters (every astral codepoint counts as 2).
- The `…` (U+2026) is a single BMP code point and counts as exactly 1 toward the cap.
- Rule 1 (whitespace collapse / trim) runs before rule 2; the 120-scalar measurement is taken after rule 1 has produced its result.
- The "MAY back off to grapheme cluster boundary" allowance is what frees implementers from depending on `Intl.Segmenter` for normative correctness — Node 16+ has it but the rule's compliance does not require it.
- A loom name that, after prefix interpolation, by itself consumes ≥119 code points leaves room only for `…`; the suffix is fully replaced. This is consistent with the spec's "do not pre-truncate the suffix to a fixed sub-budget" clause and needs no special carve-out.

V16i's existing test list (rule 6 in `plan_topics/v16-binder.md`) gains one fixture: a string whose 120th and 121st code points form a single grapheme cluster (e.g. base + combining mark, or a ZWJ sequence) — the assertion is that the output is exactly 120 code points ending in `…`, regardless of where the cluster fell.

## Related Findings

- "Echo policy: "past three elements" array truncation boundary ambiguous" — same-cluster (both are testability gaps in the same `binder.md` echo-policy / system-note rendering surface; resolved independently but a single editing pass over rules 1–7 should cover both).
- "Tool execution content truncation: boundary and multi-byte edge case underspecified" — same-cluster (parallel ambiguity for tool-output truncation in a different topic file; same fix shape — pin the unit, defer cluster-awareness to a non-normative MAY — but distinct spec text).

---

# Echo policy: array-truncation boundary at exactly three elements is ambiguous

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Echo policy: "past three elements" array truncation boundary ambiguous
**Kind:** testability

## Finding

`spec_topics/binder.md` §"Echo policy" reads:

> Array values shown as `[a, b, c]`, truncated to `[a, b, c, …+N more]` past three elements.

"Past three elements" does not pin the boundary. Two reasonable readings exist: (a) arrays of size ≥ 4 truncate (the natural English reading and the one already chosen by the plan); (b) arrays of size > 3 *including 3 itself* truncate (treating "past three" as "past the first three"). Reading (b) is unlikely but not excluded by the prose, and a conformance test that fixes a 3-element array as the expected `[a, b, c]` form has no normative anchor to point to.

The same paragraph also leaves `N` undefined: the rendered marker `…+N more` does not state whether `N` is the *count of dropped elements* or the *total array length*. The plan leaf V16i has independently committed to `N = count of dropped elements`, but the spec is silent.

The downstream plan leaf V16i — `bind_echo` formatter — has already had to guess both questions to write its tests, picking "≤3 in full / >3 truncated" and "N = dropped count". The spec must catch up to what the plan is testing against, so a future reader of the spec alone reaches the same answer.

## Spec Documents

- `spec_topics/binder.md` — Echo policy → Format rules (edited)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16i — `bind_echo` formatter — (modified)

The leaf's existing test text already encodes the intended boundary (`arrays of ≤3 elements rendered as [a, b, c] in element order, arrays of >3 elements rendered as [a, b, c, …+N more] where N is the count of dropped elements`). After the spec edit lands, V16i's "Spec" reference needs no change but the **Tests** wording can drop the implicit "the spec says 'past three' which we interpret as >3" tension and quote the spec verbatim.

## Consequence

**Severity:** correctness

A spec-only reader could implement reading (b) — full echo for ≤2 elements, truncation at 3 — and pass an internally-consistent test suite that disagrees with V16i's. Two implementers would diverge at the 3-element case, and a binder-driven UI's appearance for the common "exactly three values" path would silently differ between implementations. The `N` ambiguity has the same shape: an implementation that emits `…+5 more` for a 5-element array (showing total) versus `…+2 more` (showing dropped count) is internally consistent and equally defensible against the current prose.

## Solution Space

**Shape:** single

### Recommendation

Replace the bullet in `spec_topics/binder.md` §"Echo policy" → Format rules with:

> - Array values: arrays of **3 or fewer** elements are shown in full as `[a, b, c]` in element order; arrays of **4 or more** elements are shown as `[a, b, c, …+N more]` where the rendered prefix is the first three elements in order and `N` is the count of dropped elements (i.e. `total − 3`). An empty array renders as `[]`. Per-element rendering follows the same rules recursively (a string element is quoted by the same predicate as a top-level string value; a nested object element renders as `{first-field-value, …}`).

Implementer-relevant edge cases this pins down:

1. **Boundary.** `["a","b","c"]` → `[a, b, c]` (no marker); `["a","b","c","d"]` → `[a, b, c, …+1 more]`.
2. **Empty array.** `[]` → `[]` — explicitly stated so the formatter does not produce `[, …+0 more]` or omit the field.
3. **`N` semantics.** `N` is the count of *dropped* elements, not the total. A 10-element array renders `…+7 more`, not `…+10 more`. This matches V16i's existing test.
4. **Element rendering.** The rule "first three elements in order" inherits the rest of the format rules (quoting predicate for strings, `{first-field-value, …}` for nested objects); no separate sub-grammar.
5. **Interaction with the line-level cap.** Unchanged — the existing rule that "if truncation falls inside an array, the inner `…+N more` may be cut" continues to apply at the line level, separately from this element-count rule.

## Related Findings

- "System-note 120-codepoint cap: \"code points or grapheme clusters\" is ambiguous" — same-cluster (both are testability boundary gaps in the system-note / echo rendering grammar; resolved by independent edits to adjacent paragraphs in `binder.md`)
- "Tool execution content truncation: boundary and multi-byte edge case underspecified" — same-cluster (same shape of defect — truncation prose that does not pin inclusive/exclusive — but in a different spec topic; the fix idiom is transferable)

---

# Binder retry budget: maximum total LLM calls per slash invocation is not bounded

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Retry budget interaction: maximum total binder LLM calls not stated
**Kind:** testability

## Finding

`spec_topics/binder.md` gives each binder failure class its own single-retry budget — transport failures and malformed-envelope failures each get exactly one retry, AJV-validation failures get none — and then adds the cross-class clarification: *"Retry budgets are per-failure-class, not shared: a transport failure observed on the retry of a malformed envelope counts as a fresh transport-row path (one retry of its own), not as a third attempt on the malformed-envelope row."* The clarification establishes that a class can be entered mid-chain, but it does not establish a stopping condition for repeated class swaps.

Read literally, the rule is symmetric: if a malformed-class retry can spawn a fresh transport path with its own retry, the converse — a malformed failure observed on a transport retry spawning a fresh malformed path — has equal standing. Nothing in the surrounding text says a class's retry budget is consumed globally per invocation, nor does anything cap the total number of binder LLM calls. A conformance test that wants to assert "no slash invocation issues more than N binder LLM calls under any combination of upstream failures" cannot derive N from the spec, and two implementers can ship divergent termination behaviour while both pointing at the same paragraph.

The failure-modes table is also silent on which row's template is rendered when a chain ends after a class swap (e.g. malformed → transport-retry → malformed): the "most recent failure" rule is plausible but not stated.

## Spec Documents

- `spec_topics/binder.md` — Failure modes (paragraph following the failure-mode templates table) (edited)

## Plan Impact

**Phases:** Vertical V16, Vertical V18

**Leaves (implementation order):**

- V16o — Binder malformed envelope handling — (modified)
- V16n — Binder transport failure single retry — (modified)
- V18p — `AbortSignal` before and during the binder LLM call — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementations diverge: one treats `{transport, malformed}` retry budgets as one-shot per invocation (max 3 calls); another treats every class entry as a fresh path with its own retry (no finite bound until both classes happen to exhaust on the same call). Under hostile or flaky binder providers the second implementation can issue arbitrarily many calls per slash invocation, which is observable as latency and quota burn. Tests cannot pin behaviour, and the failure-modes table cannot be exercised at the boundary because the boundary is undefined.

## Solution Space

**Shape:** single

### Recommendation

Replace the existing per-failure-class paragraph with a budget that is per-class **and** per-invocation, plus an explicit total cap. Concretely, edit `spec_topics/binder.md` (Failure modes section) to state:

> Each retry-eligible failure class has a single retry budget per slash invocation: at most one transport-failure retry and at most one malformed-envelope retry, regardless of how the two interleave. A transport failure observed on the retry of a malformed envelope consumes the transport budget (not a second malformed attempt); a malformed envelope observed on the retry of a transport failure symmetrically consumes the malformed budget. Once a class's budget is consumed it is not replenished, even if the failure first appears as the consequence of another class's retry. Therefore the runtime MUST issue at most **3** binder LLM calls per slash invocation (1 initial attempt + at most 1 transport-class retry + at most 1 malformed-envelope-class retry). When the chain ends with both budgets exhausted, the surfaced system note is the row matching the **most recent** failure observed (e.g. a chain ending in a malformed envelope renders the malformed-envelope row, even if a transport failure occurred earlier in the chain).

Edge cases the implementer must watch:

- AJV validation failure on the merged `args` is unaffected (no retry, no budget). It can still occur on call 1, 2, or 3 depending on which call returned the structurally valid envelope.
- An `AbortSignal` observed during any retry suppresses that retry and surfaces the cancelled-binder row, irrespective of remaining budget (already covered by V18p; the cap does not change cancellation semantics).
- The 3-call cap is observable: tests should construct a chain `malformed → transport → malformed` against a controlled provider stub and assert exactly 3 provider invocations followed by the malformed-envelope system note.

Plan-leaf updates required:

- **V16n** Tests should add: under a stub provider that returns `transport-fail` then `malformed` then `transport-fail`, exactly 3 provider invocations occur and the surfaced note is the transport row (most-recent failure).
- **V16o** Tests should add: under a stub provider that returns `malformed` then `transport-fail` then `malformed`, exactly 3 provider invocations occur and the surfaced note is the malformed-envelope row.
- **V18p** No semantic change, but the cancellation-during-retry test should be reaffirmed to apply uniformly across both possible retry positions (call 2 OR call 3), not only the "single transport-failure retry" wording it currently uses.

## Related Findings

None

---

## spec_topics/query.md

---

# `QueryError` query-time variant count off by one

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** "Five query-time variants" lists six
**Kind:** naming

## Finding

`spec_topics/query.md` (Failure modes section, paragraph beginning *"The canonical declaration of `QueryError` and every variant it carries lives in…"*) introduces the query-time error variants with the phrase "The five **query-time** variants —" and then enumerates six: `ValidationError`, `TransportError`, `ModelToolError`, `ContextOverflowError`, `CancelledError`, `ToolLoopExhaustedError`. The canonical union declaration in `spec_topics/errors-and-results.md` ("QueryError variants") confirms six query-time variants — the prose count is wrong, not the enumeration.

Because the same paragraph is the only place the spec partitions `QueryError` into "query-time" vs. "code-side / invoke" subsets, the stated count doubles as the partition's de facto cardinality assertion. A reader scanning for "how many runtime-only error kinds must my `match` arms cover?" is told one number and shown another.

## Spec Documents

- `spec_topics/query.md` — Failure modes (edited)
- `spec_topics/errors-and-results.md` — QueryError variants (read-only; canonical source confirming the count is six)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(`V5g` introduces the `QueryError` union and successive leaves — V5h, V6i, V6k, V6m, V14r — add variants, but none of them quote or assert the prose count "five." A pure wording fix in `query.md` does not move any leaf's acceptance criteria.)

## Consequence

**Severity:** cosmetic

The canonical schema declaration in `errors-and-results.md` is unambiguous and is the source the lowering / runtime work reads from, so no implementer would build a five-variant union by mistake. The damage is reader confusion when the two pages are read together — the partition prose loses authority once it visibly miscounts its own list.

## Solution Space

**Shape:** single

### Recommendation

In the failure-modes paragraph of `spec_topics/query.md`, change "The five **query-time** variants —" to "The six **query-time** variants —". No other edit is needed; the enumeration, the cross-link to `errors-and-results.md#queryerror-variants`, and the surrounding partition prose are already correct.

## Related Findings

- "`InvokeInfraError` / `kind: \"invoke_failure\"` asymmetry not in glossary" — same-cluster (also a `QueryError` surface-naming inconsistency, but resolved by a separate edit in a different file).

(No other heading in the source review touches the query-time variant enumeration.)

---

# Coercion follow-up user turn lacks a normative template per methodology

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Schema-validation coercion follow-up turn text not normative
**Kind:** testability

## Finding

`spec_topics/frontmatter.md` (the `coercion` field-contract bullet at lines 133–136) defines three coercion methodologies — `validator_error`, `schema_repeat`, `none` — by paraphrase only:

> - `validator_error` (default) — the follow-up turn includes the AJV validation error from the previous attempt.
> - `schema_repeat` — the follow-up turn re-states the expected schema without quoting a specific error.
> - `none` — no follow-up; the first failure is returned as `Err` immediately.

`spec_topics/query.md` § *Schema-validation coercion* (lines 219–236) repeats the same descriptive language and never spells out the literal user-turn text either methodology emits. There is no surrounding-template-with-`<…>`-placeholder treatment of the kind `binder.md` § *Failure-mode templates (normative)* uses (lines 180–192) for the six binder system notes — where a renderer "MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated".

The gap is observable in the plan: `plan_topics/v13-wire-names.md` V13h is **explicitly blocked** ("until that template lands the assertion cannot be written without speculating about the wording"), and V13g's test bullet ("append a follow-up user turn quoting the AJV error") suffers the same defect — two implementers can both ship strings that "include the AJV validation error" yet differ in framing, prefix, schema rendering, error formatter, and surrounding instructions, with neither violating the prose. Conversation history is part of the conversation handle exposed to subagent-mode looms, so the literal turn text is observable beyond the model.

## Spec Documents

- `spec_topics/query.md` — *Schema-validation coercion* (edited)
- `spec_topics/frontmatter.md` — `coercion` field-contract bullet (edited)
- `spec_topics/binder.md` — *Failure-mode templates (normative)* (read-only; pattern reference)

## Plan Impact

**Phases:** Vertical V13

**Leaves (implementation order):**

- V13g — Coercion methodology: `validator_error` — (modified)
- V13h — Coercion methodology: `schema_repeat` — (blocked)
- V13j — Coercion appends a new user turn; non-validation propagation — (modified)

## Consequence

**Severity:** correctness

Two reasonable implementers will produce coercion follow-up turns whose literal text differs (different prefix, different AJV-error renderer, different schema serialisation), and neither V13g nor V13h can write a transcript-text assertion against the spec. V13h is already noted as blocked in the plan; V13g would silently pass any phrasing. The model's repair behaviour is sensitive to the wording, so divergence is also a behavioural risk, not just a test-harness one.

## Solution Space

**Shape:** single

### Recommendation

Add a new normative subsection *Follow-up turn templates (normative)* to `spec_topics/query.md` § *Schema-validation coercion*, in the same shape as `binder.md` § *Failure-mode templates (normative)*: a preamble fixing what is verbatim vs. interpolated, followed by one row per non-`none` methodology. Cross-link the `coercion.methodology` bullet in `frontmatter.md` to the new subsection rather than restating the prose.

Concretely:

1. **Preamble** (verbatim from the `binder.md` pattern, adapted): "Renderers MUST emit the surrounding template text verbatim; only the `<…>` placeholders are interpolated. Wording changes are spec-versioned breaking changes." Then fix the placeholder renderers:
   - `<ajv-summary>` — produced by `errorsText(errors, { separator: '; ' })` with the data-path prefix retained (the same helper already named in `binder.md`'s preamble; reuse the existing definition by reference rather than restating it).
   - `<schema-json>` — the **lowered** response schema (the JSON Schema actually handed to AJV), serialised with `JSON.stringify(schema, null, 2)`. State unambiguously that the lowered, not the source-Loom-type, form is canonical, since the model only ever sees the lowered form during the original turn.

2. **Templates** (one row per methodology, fenced as a single-line code block so whitespace is normative):

   | Methodology | Follow-up user turn |
   |---|---|
   | `validator_error` | `` `Your previous response did not match the required schema. Validation errors: <ajv-summary>. Return your final answer using the \`__loom_respond_<slug>\` tool, conforming to this schema:\n<schema-json>` `` |
   | `schema_repeat` | `` `Your previous response did not match the required schema. Return your final answer using the \`__loom_respond_<slug>\` tool, conforming to this schema:\n<schema-json>` `` |

   (Exact wording is for the spec author to ratify; the structural requirement is one fixed template per methodology with named placeholders and a fixed renderer for each placeholder.)

3. **`<slug>` placeholder.** Tie `<slug>` to the same source as the synthesised respond tool's name (the loom's qualified name slugged per the existing rule), to avoid the same divergence the sibling finding flags for `tool_loop_exhausted`'s `respond` literal. Cross-reference whichever section already defines `__loom_respond_<slug>`.

4. **`none` is excluded** from the table — no follow-up is issued, so there is no template to specify; the existing prose is sufficient.

Edge cases the implementer must watch:

- The follow-up turn is a **user** turn, not a system turn — the templates above must produce a `user` role message in the conversation. State this explicitly in the preamble.
- AJV error formatting depends on AJV options; pin `errorsText` invocation parameters in the preamble (matches binder's approach) so the placeholder is reproducible across AJV minor versions.
- The lowered-schema serialisation must be deterministic; if the lowering pipeline can produce key-ordering variation, fix the ordering (alphabetical, or insertion-ordered with a normative lowering rule) before this template can be tested verbatim.
- Multi-attempt follow-ups (attempts 2, 3, …) re-issue the same template against the *latest* failed attempt's AJV errors — clarify that each follow-up's `<ajv-summary>` reflects only the most recent failure, not a cumulative concatenation across attempts.

## Related Findings

- "Empty-template short-circuit: coercion interaction with `coercion.attempts` unclear" — same-cluster (both touch `coercion.attempts` semantics; resolve independently)
- "`tool_loop_exhausted` renders `respond` — source of literal unclear" — decision-dependency (the `<slug>` placeholder above shares its source-of-truth question with the `respond` literal in the `tool_loop_exhausted` system note; pin both to the same rule)
- "Tool-call loop default (25): no normative test vector for observability" — same-cluster (both are testability gaps in `query.md`'s coercion / tool-loop area)

---

# Empty-template short-circuit does not state whether coercion follow-ups fire

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Empty-template short-circuit: coercion interaction with `coercion.attempts` unclear
**Kind:** testability

## Finding

`spec_topics/query.md` (Degenerate rendered templates) says that when the fully-rendered user turn is empty or whitespace-only, the typed query short-circuits to `Err(QueryError { kind: "validation", message: "rendered query template is empty", attempts: 0, validation_errors: [], raw_response: null })` "without consuming a provider round-trip." That paragraph also handles the symmetric case for follow-ups: a coercion follow-up turn that itself short-circuits "does **not** consume an `attempts` slot."

The case the spec leaves implicit is the original-turn short-circuit on a typed query whose loom carries `coercion.attempts: 3` (or any non-zero value) and a non-`none` `coercion.methodology`. Schema-validation coercion is defined as a response to AJV failure on the model's *final response* (`Schema-validation coercion` section), and an empty-template short-circuit produces no model response to validate — so the operationally consistent reading is "no coercion follow-ups are ever issued, the `attempts: 0` value pinned in the short-circuit Err is also the count of follow-up turns the runtime tried." But the spec does not state that. A literal reader who keys off `kind: "validation"` could plausibly conclude the runtime should attempt the configured number of repair turns first (each of which would itself short-circuit, per the existing follow-up rule) before returning. The two interpretations diverge on observable provider traffic and on conversation-history shape, even though both end with `attempts: 0`.

A typed query's coverage tests cannot assert "an empty original template with `coercion.attempts: 3` issues zero coercion follow-up turns" without the spec saying so. One sentence suppressing coercion at the original-turn short-circuit point closes the gap.

## Spec Documents

- `spec_topics/query.md` — Degenerate rendered templates (edited)
- `spec_topics/query.md` — Schema-validation coercion (read-only)
- `spec_topics/frontmatter.md` — `coercion` (read-only)

## Plan Impact

**Phases:** Vertical V5, Vertical V13

**Leaves (implementation order):**

- V5e — Prompt-mode conversation driver — modified (coverage matrix attributes the empty-rendered-template runtime short-circuit to V5e; tests must assert that the short-circuit returns `attempts: 0` and issues zero coercion follow-up turns when the loom carries non-zero `coercion.attempts` and a non-`none` methodology)
- V13g — Coercion methodology: `validator_error` — modified (tests must assert the short-circuit path is not entered as a coercion-eligible failure: with an empty original template and `coercion.attempts: 3`, no follow-up user turn is appended to the conversation history and no follow-up provider round-trip is issued)
- V13j — Coercion preserves tool-call side effects — modified (the existing "no follow-up issued / no `attempts` consumed" assertions are extended to cover the empty-original-template case alongside the existing `context_overflow` permanent-short-circuit case)

## Consequence

**Severity:** correctness

Two implementers reading the spec strictly can ship divergent runtimes: one returns `Err(validation, attempts: 0)` immediately with zero provider traffic and a conversation history containing only the (un-sent) state from before the user turn; the other issues `coercion.attempts` follow-up user turns into the conversation, each of which itself short-circuits without a provider round-trip but each of which appears verbatim in the surviving conversation history that subagent-mode looms inherit. The first reading matches the spec's "without consuming a provider round-trip" phrasing; the second is not forbidden by anything currently normative.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/query.md` → Degenerate rendered templates, append to the existing Runtime short-circuit bullet: *"An empty-template short-circuit on the original user turn of a typed query MUST NOT trigger the coercion path: zero coercion follow-up turns are issued, no follow-up user turn is appended to the conversation history, and the returned `ValidationError.attempts` is 0 regardless of `coercion.attempts` and `coercion.methodology`. Rationale: coercion repairs a malformed model response (see Schema-validation coercion); the short-circuit is the runtime refusing input it constructed itself, before any model response exists, so there is nothing for a follow-up turn to repair."*

Edge cases the implementer must cover in tests:

- Loom with `coercion.methodology: validator_error, coercion.attempts: 3` + empty original template → returned Err has `attempts: 0`, conversation history at the subagent-mode `AgentSession` handle contains zero follow-up user turns appended after the short-circuit, zero provider round-trips observed on the fake transport.
- Same assertion with `coercion.methodology: schema_repeat` (once V13h's template lands) and with `coercion.methodology: none` (the latter is already a no-op but the assertion pins the symmetry).
- The pre-existing follow-up-short-circuit clause (a coercion follow-up that *itself* renders to empty) is unchanged: it remains a defensive case that does not consume an `attempts` slot.

## Related Findings

- "Schema-validation coercion follow-up turn text not normative" — same-cluster (also targets the coercion follow-up surface but addresses a different gap — the wording of follow-up turns the runtime *does* issue rather than whether to issue them at all)
- ""Five query-time variants" lists six" — same-cluster (touches the `validation` `kind` whose double-duty as both "AJV rejected the response" and "runtime refused its own constructed input" is what makes the empty-template / coercion interaction read ambiguously in the first place)

---

## spec_topics/slash-invocation.md

---

# `pi.sendMessage` delivery paragraph in `slash-invocation.md` duplicates `pi-integration-contract.md`

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** System-note `pi.sendMessage` delivery paragraph placed in wrong file
**Kind:** placement

## Finding

The closing paragraph of `spec_topics/slash-invocation.md` specifies the SDK-level delivery mechanism for the per-`kind` top-level-`Err` system note: the `pi.sendMessage({ customType: "loom-system-note", content, display: true, details: { event: { ... } } }, { triggerTurn: false })` call shape, the `customType` constant, the `display: true` flag, the `details.event` payload, the registered renderer's one-line dim formatting, and the renderer-vs-log-scraper consumption split.

Every one of those facts is already specified — and specified more completely — in `spec_topics/pi-integration-contract.md` under the **System notes** and **Runtime event channel** sections: the same `pi.sendMessage(...)` shape, the three disjoint `details` payload variants (`{ diagnostics }` / `{ event }` / `{ structural }`), the `pi.registerMessageRenderer("loom-system-note", ...)` registration, the `display: true` vs `display: false` rule, and the best-effort fallback chain. The `slash-invocation.md` paragraph adds nothing the contract page does not already say; it just signs off with "See [Pi Integration Contract] for the full mechanism," which is itself a tell that the detail belongs there.

`slash-invocation.md` is the user-facing invocation surface — what the user types, what the user sees, the per-`kind` template table for the rendered note text. SDK delivery mechanics on this page are out of scope and create a two-source-of-truth hazard: any future edit to the `pi.sendMessage` call shape or the `details` schema must be remembered in both places or the pages drift.

## Spec Documents

- `spec_topics/slash-invocation.md` — closing paragraph after the per-`kind` table (edited)
- `spec_topics/pi-integration-contract.md` — **System notes** section (read-only — already covers the delivery contract; receives at most a one-clause cross-reference noting that the per-`kind` table populates `details: { event }` for every row)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The affected leaves (`H4` for the `sendSystemNote` helper and renderer registration, `V18i` for the per-`kind` top-level-`Err` formatter, `V18q` for the runtime-event channel) already cite `pi-integration-contract.md` for delivery mechanics; their **Adds** and **Tests** clauses are unaffected by removing the duplicated paragraph from `slash-invocation.md`. `V18i`'s **Spec** field already lists `slash-invocation.md` for the per-`kind` table only, which is the post-edit role of that file.

## Consequence

**Severity:** cosmetic

The two pages are mutually consistent today. No implementer is misled and no test changes; the harm is purely a future-drift risk if one page's `pi.sendMessage` call shape or `details` payload is updated and the other is not. Resolving it now is a maintenance hygiene win.

## Solution Space

**Shape:** single

### Recommendation

In `spec_topics/slash-invocation.md`, replace the closing paragraph (the one beginning "The note is emitted as a custom-typed Pi message…") with a single short sentence that:

1. States that every row of the per-`kind` table emits as a `loom-system-note` carrying `details: { event: RuntimeEvent }`, where the `RuntimeEvent` payload is the same value V18q emits at the originating site (so consumers deduplicate on `(kind, query_site, message, occurrence-timestamp)`).
2. Cross-links to `pi-integration-contract.md` **System notes** for the `pi.sendMessage` call shape, the `details` payload variants, the renderer registration, and the best-effort fallback chain, and to `pi-integration-contract.md` **Runtime event channel** for the `RuntimeEvent` shape and the `display: true` vs `display: false` rule.

Do not duplicate the call signature, the `customType` literal, the `triggerTurn: false` option, the renderer's styling, or the renderer-vs-log-scraper consumption split — those all live on the contract page.

In `spec_topics/pi-integration-contract.md`, no edit is required: the **System notes** section already enumerates the `details` shapes including `{ event: RuntimeEvent }`, and the **Runtime event channel** section already specifies the payload, the `display` rule, and the deduplication key. Optionally, a one-clause aside under **Runtime event channel** noting that the per-`kind` top-level-`Err` table in `slash-invocation.md` is the user-facing renderer for `display: true` events would symmetrise the cross-reference, but the existing forward link from `slash-invocation.md` is sufficient.

## Related Findings

- "Prompt-mode streaming edge cases placed in wrong file" — co-resolve (the mirror move: prompt-mode user-visible streaming behaviour currently lives in `pi-integration-contract.md` and should migrate to `slash-invocation.md`. Resolving both in one edit cleanly partitions the two pages along the user-facing-vs-SDK-mechanics axis)
- "SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page" — same-cluster (same placement lens — SDK delivery mechanics in a behavioural page; resolves independently against `binder.md` rather than `slash-invocation.md`)
- "Provider seed-field mapping (Determinism section) placed in binder page" — same-cluster (same placement lens, different misplaced page; resolves independently)
- "Provider compatibility local-backend note belongs in `future-considerations.md`" — same-cluster (placement lens; the misplaced content is a known-limitation aside rather than SDK mechanics, so the destination differs)

---

## spec_topics/diagnostics.md

---

# `loom/runtime/invoke-depth` breaks the violation-naming pattern of its siblings

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** `loom/runtime/invoke-depth` — terse noun phrase vs. descriptive-phrase style of siblings
**Kind:** naming

## Finding

The runtime-panic registry in `spec_topics/diagnostics.md` lists six panic-source codes. Five of them name the violation directly:

- `loom/runtime/match-error`
- `loom/runtime/index-out-of-bounds`
- `loom/runtime/null-member-access`
- `loom/runtime/null-index-access`
- `loom/runtime/missing-object-key`

Each terminal segment reads as the condition that triggered the panic — an error, an out-of-bounds access, a null dereference, a missing key. The sixth, `loom/runtime/invoke-depth`, is a bare noun phrase naming a *measured quantity*. On its own the code does not say what about the depth was wrong (was it zero? negative? too small?). The registry's *Message* column resolves the ambiguity at render time (`invoke chain depth exceeded: <depth> > 32`), and the prose at `spec_topics/invocation.md` line 63 says "exceeding the cap raises a runtime panic with code `loom/runtime/invoke-depth`", so behaviour is unambiguous — only the code name is off-pattern.

The cost is small but real: an author scanning a system note for the code alone (without the rendered message) sees a noun phrase whose meaning has to be looked up rather than read.

## Spec Documents

- `spec_topics/diagnostics.md` — `loom/runtime/*` registry table row (line 203) (edited)
- `spec_topics/invocation.md` — Invocation depth bound paragraph (line 63) (edited)
- `spec_topics/errors-and-results.md` — runtime-panic enumeration (line 61) and panic-message table row (line 74) (edited)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H3 — Diagnostics primitive and multi-error accumulator — (modified) — exports the closed code constants generated from / asserted equal to the diagnostics registry; the constant for this row would change.
- V18n — Panic routing: `invoke` parent surface — (modified) — `Adds` and `Tests` reference the literal `loom/runtime/invoke-depth` (twice) when describing the depth-cap panic source.
- V18s — Coverage-matrix closing CI gate — (modified) — the gate scans every code in the registry table as a literal string; the renamed code propagates into the asserted set.

## Consequence

**Severity:** cosmetic

The spec is internally consistent: the code is the spelled-out string `loom/runtime/invoke-depth` everywhere it appears, the registry's *Message* column carries the violation phrasing, and the cross-reference into `invocation.md` defines the trigger. Two implementers will arrive at the same wire string. The cost is purely readability of the code in isolation.

## Solution Space

**Shape:** single

### Recommendation

Rename the code to `loom/runtime/invoke-depth-exceeded` everywhere it appears:

- `spec_topics/diagnostics.md` registry row (line 203) — *Code* column.
- `spec_topics/invocation.md` line 63 — the inline reference in the Invocation depth bound paragraph.
- `spec_topics/errors-and-results.md` lines 61 and 74 — the runtime-panic enumeration bullet and the panic-message table row.

The rename is a pure string substitution; no semantics, message templates, severity, or routing change. After the edit, all six runtime-panic codes name a violation rather than a quantity, matching the implicit naming convention already present in the table.

Edge cases for the implementer of the spec edit:

- The plan leaves H3, V18n, and V18s reference the literal old string and will need to follow the rename when their implementation lands; the V18s closing gate will catch any drift between the spec table and the exported constants module, so the rename does not need a separate cross-file audit.
- The slash boundary's panic-routing rule and the `InvokeInfraError { reason: "panic" }` parent-side surface are keyed on the *category* of the panic, not on the code string, so neither needs updating beyond the textual references already enumerated.

## Related Findings

- "`loom/runtime/internal-error` catch-all contradicts "closed registry" and "exactly six panic sources"" — same-cluster (touches the same registry table and the same "exactly six panic sources" framing; resolves independently — that finding adjusts the framing of the closed registry, this one renames one row).

---

# `loom/runtime/internal-error` is a runtime-defect surface, but `diagnostics.md` files it under panics

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** `loom/runtime/internal-error` catch-all contradicts "closed registry" and "exactly six panic sources"
**Kind:** scope

## Finding

The `### loom/runtime/* — runtime panics and delivery failures` section in `spec_topics/diagnostics.md` opens with two normative statements: "V1 has exactly six panic sources" and "Four additional `loom/runtime/*` codes — `system-note-delivery-failed`, `subagent-dispose-failure`, `registry-swap-failed`, and `registration-cache-collision` — are not panics but delivery-, rebuild-, or registration-failure diagnostics." The table that follows then has eleven rows: six panic codes, the four enumerated non-panic codes — and `loom/runtime/internal-error`, which is mentioned nowhere in the intro. A reader who counts the table against the prose finds an off-by-one (`four` should be `five`) and a missing enumeration entry.

The taxonomic confusion runs deeper than a count. `spec_topics/errors-and-results.md` (Runtime panics paragraph) carefully classifies `internal-error` as a **distinct runtime-defect surface** — explicitly *not* a panic source ("they do not extend the closed list"), and not a delivery/rebuild/registration failure either. It is the third kind: an unanticipated interpreter throw routed via the same channels as panics but originating outside any author-expressible expression. `diagnostics.md` files this third kind into the panic table without naming it, which is what makes the row read like a contradiction of the closed-six claim. The closed-registry rule itself is not violated — the *code* `loom/runtime/internal-error` is registered and stable; only the *trigger condition* is open-ended, which is the defining property of a runtime-defect surface and is fine.

The fix is a prose realignment in one section of `diagnostics.md` so the intro acknowledges three categories (six panic sources, the runtime-defect surface, four delivery/rebuild/registration codes) and the table either gains category headers or the intro enumerates `internal-error` alongside the other four with a phrase that matches the `errors-and-results.md` framing.

## Spec Documents

- `spec_topics/diagnostics.md` — `loom/runtime/*` section header and intro paragraph (edited)
- `spec_topics/errors-and-results.md` — Runtime panics paragraph (read-only; already the canonical framing)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. V18m and V18n already cite `loom/runtime/internal-error` by its literal registry code in their **Tests.** bullets and treat it as routed-alongside-panics-but-not-a-panic-source, matching the corrected framing. The diagnostic-code gate at V18s diffs the registry against asserted codes; that diff is unchanged. The fix is pure spec prose; no leaf's acceptance criteria move.

## Consequence

**Severity:** advisory

A reader of `diagnostics.md` in isolation hits two visible inconsistencies (the `four` vs five count, and a row that appears to violate the "exactly six" claim) and cannot resolve them without cross-referencing `errors-and-results.md`. Implementers and test authors who read both pages can still produce the right behaviour — V18m/V18n are unambiguous — but the diagnostics page is the natural primary reference for renderer authors, conformance-test authors, and LSP-integration authors, and shipping a self-contradicting registry intro creates avoidable friction and likely mis-citations downstream.

## Solution Space

**Shape:** single

### Recommendation

Edit the intro of the `### loom/runtime/* — runtime panics and delivery failures` section in `spec_topics/diagnostics.md` to enumerate three categories explicitly, mirroring the taxonomy already established in `errors-and-results.md`:

1. Rename the section heading to `### loom/runtime/* — runtime panics, runtime-defect surface, and delivery failures` (or equivalent) so the title matches the table contents.
2. Replace the second sentence so it reads, in substance:

   > V1 has exactly six **panic sources** (the rows below tagged as panics). One additional code — `loom/runtime/internal-error` — covers the **runtime-defect surface** defined in [Errors and Results — Runtime panics](./errors-and-results.md): an unanticipated interpreter or adapter throw outside the closed panic-source list, routed through the same channels as panics but not itself a panic source. Four further codes — `system-note-delivery-failed`, `subagent-dispose-failure`, `registry-swap-failed`, and `registration-cache-collision` — are delivery-, rebuild-, or registration-failure diagnostics emitted by the system-note fallback path, the subagent session lifecycle teardown, the watcher's build-aside-then-publish swap, and the prompt-mode tool-registration cache's collision check, all defined in [Pi Integration Contract](./pi-integration-contract.md).

3. Cross-link to `errors-and-results.md`'s "Runtime panics" paragraph so the runtime-defect-surface framing is not duplicated, only restated.
4. Optional but recommended: add a *Category* column to the table (`panic` / `runtime-defect` / `delivery-failure` / `rebuild-failure` / `registration-failure`) so the intro and the table are mechanically aligned.

Edge cases the implementer must watch:
- The closed-registry rule (rule 2 in the "Code registry rules" subsection above) refers to *codes*, not triggers. Do not weaken that rule when describing `internal-error`'s open trigger condition; the code is closed, the trigger is intentionally open, and those are not in tension.
- Keep the count phrasing precise: it is "exactly six panic sources" (unchanged) plus one runtime-defect surface plus four operational-failure codes. Do not collapse to "exactly six panic sources plus five non-panics" — that re-creates the original conflation between the runtime-defect surface and the operational failures.
- Sibling spec finding "`loom/runtime/invoke-depth` — terse noun phrase vs. descriptive-phrase style of siblings" touches the same panic table; if both edits land in the same pass, sequence the rename before the intro rewrite so the new intro can cite `invoke-depth-exceeded` directly.

## Related Findings

- "`loom/runtime/invoke-depth` — terse noun phrase vs. descriptive-phrase style of siblings" — same-cluster (same panic table; renames a row name, this finding rewrites the intro paragraph; resolve in the same edit pass)
- "Spec mandates broad-catch exception handling; conventions unconditionally forbid it" — same-cluster (the broad-catch site whose existence that finding flags is precisely the runtime-defect-surface boundary that emits `internal-error`; both findings clarify the same surface but along orthogonal axes — naming/category here, conventions allowlist there)

---

## spec_topics/discovery.md

---

# `discovery.md` page title "Directory Convention" understates the page's scope

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** "Directory Convention" page title too narrow for page content
**Kind:** naming

## Finding

`spec_topics/discovery.md` is titled "Directory Convention" both in its own H1 and in the `spec.md` table of contents (line 49). The phrase fits only the literal directory-layout fragments at the top of the page (`~/.pi/agent/looms/`, `.pi/looms/`, `looms/`). The body of the page covers substantially more: the five-source enumeration, source-priority rules, home-directory expansion, `pi.looms` package discovery (including the `node_modules/` walk, scope-directory handling, glob/`+`/`!`/`-` semantics, and the `scanPackages*` caps), settings-file precedence and merge rules, the `looms` entry schema, the failure-modes matrix with its six diagnostic codes, case-insensitive collision handling, filename-validity regex, and same-priority slash-name collision rules.

The mismatch shows up in cross-references too: `plan_topics/m-mvp.md`, `v14-tool-calls.md`, `v15-invoke.md`, `v17-warp.md`, and `v18-cancellation.md` cite this page as "Directory Convention" with sub-anchors like "Source priority", "Settings file reads", and "Discovery roots" — anchors that have no relationship to "directory convention". The REQ-ID prefix already assigned to the page (`DISC`, per `spec.md` line 96) anticipates the broader scope.

## Spec Documents

- `spec_topics/discovery.md` — H1 page heading (edited)
- `spec.md` — table-of-contents entry, line 49 (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. Plan leaves under M, V14, V15, V17, and V18 reference this page by the link label "Directory Convention" but their acceptance criteria do not depend on the title text; the underlying file path (`spec_topics/discovery.md`) is unchanged, so all existing links continue to resolve. The link labels become stale-but-functional, which is a documentation-hygiene matter rather than an acceptance-criteria change.

## Consequence

**Severity:** cosmetic

A reader scanning the table of contents for "where do settings, package walks, and slash-name collisions live?" must guess that "Directory Convention" is the right page; the title misdirects to a narrower topic. No implementer behaviour is affected.

## Solution Space

**Shape:** single

### Recommendation

Rename the page H1 in `spec_topics/discovery.md` from `# Directory Convention` to `# Discovery`, and update the `spec.md` TOC entry on line 49 to match (link text "Discovery", file path unchanged). The REQ-ID prefix `DISC` already aligns with the new title.

Implementer notes:

- The file path (`spec_topics/discovery.md`) and all sub-anchors (`#discovery-roots`, `#home-directory-expansion`, `#looms-entry-schema`) stay as-is; existing links from `plan_topics/` and intra-spec cross-references continue to resolve.
- Plan-leaf link labels under `plan_topics/m-mvp.md`, `v14-tool-calls.md`, `v15-invoke.md`, `v17-warp.md`, and `v18-cancellation.md` (and the `coverage-matrix.md` row) still read "Directory Convention". Updating those labels to "Discovery" is a separate, plan-side hygiene pass and is out of scope for the spec edit itself.

## Related Findings

- "`scanPackagesTimeoutMs` is a wall-clock constraint with no injectable clock seam" — same-cluster (also lives in `spec_topics/discovery.md` but resolves independently of the rename)

## spec_topics/invocation.md

---

# Deferred symlink hardening described inline in `invocation.md` is invisible from `future-considerations.md`

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Symlink hardening future path embedded inline in a normative rule
**Kind:** scope, placement

## Finding

The Resolution paragraph of `spec_topics/invocation.md` closes its discussion of the runtime `realpath` re-check with a sentence describing a deferred V1+ remedy: *"An irreducible kernel-level race remains between the runtime `realpath` and the subsequent `open(2)`; this re-check narrows the window from minutes to microseconds but does not close it. V1 accepts the residual; a future hardening pass (`openat2` with `RESOLVE_NO_SYMLINKS` on Linux, or platform equivalents) would close it."*

That sentence mixes two distinct artifacts inside one normative rule: the V1 obligation (state and accept the residual TOCTOU window) and a platform-specific post-V1 work item (the `openat2` / `RESOLVE_NO_SYMLINKS` hardening pass). The hardening item appears nowhere in `spec_topics/future-considerations.md`, which is the spec's index of deferred work. A future contributor or security reviewer scanning the deferred-work index for "what V1 punted on" will not see this item; the only way to discover it is to read the body of the invocation page. The deferred-work catalogue and the normative rule should be the two sides of one cross-reference, not two unrelated sentences in two unrelated files.

## Spec Documents

- `spec_topics/invocation.md` — Resolution paragraph (edited)
- `spec_topics/future-considerations.md` — new bullet (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. V15a and V15e cite the *Resolution* / *Static resolution* anchors of `invocation.md` and assert the V1 runtime re-check behaviour (symlink-swap re-check fires `loom/load/invoke-path-escape`); their acceptance criteria are unaffected by moving the sentence about the post-V1 `openat2` remedy to `future-considerations.md`. No leaf currently asserts the residual-race wording or the deferred remedy.

## Consequence

**Severity:** advisory

The V1 behavioural contract is unchanged and fully specified either way; nothing implementers ship in V1 differs. The harm is to post-V1 planning: a real, named hardening item is invisible to anyone using `future-considerations.md` as the canonical "what's deferred" list, so it is liable to be forgotten or rediscovered later as a "missing" security improvement.

## Solution Space

**Shape:** single

### Recommendation

Move the platform-specific remedy out of the Resolution paragraph and into `future-considerations.md`; leave only the V1 obligation in the normative rule, with a cross-reference to the new entry.

In `spec_topics/invocation.md`, replace the two trailing sentences of the Resolution paragraph (`An irreducible kernel-level race … platform equivalents) would close it.`) with a tighter V1 statement and a forward pointer, e.g.:

> An irreducible kernel-level race remains between the runtime `realpath` and the subsequent `open(2)`; this re-check narrows the window from minutes to microseconds but does not close it. V1 accepts the residual (see [Future Considerations — Symlink-resolution hardening](./future-considerations.md#…)).

In `spec_topics/future-considerations.md`, add a bullet under the **Surface extensions (V1 leaves a seam)** bucket — that bucket is the right home because the V1 invocation-resolution path *is* the seam: closing the residual race is a drop-in replacement of the `realpath` + containment-check call site with an `openat2(RESOLVE_NO_SYMLINKS)` equivalent, with no change to the diagnostic codes, error envelopes, or call-site contract documented in `invocation.md`. Suggested wording:

> **Symlink-resolution hardening for invoke-path containment** — V1 implements the discovery-root containment check by `realpath`-then-`open`, accepting an irreducible kernel-level TOCTOU window between the two syscalls (see [Invocation — Resolution](./invocation.md)). A future pass replaces the two-step sequence with a single atomic resolve-and-open primitive — `openat2(..., RESOLVE_NO_SYMLINKS | RESOLVE_BENEATH)` on Linux, and the platform equivalents on macOS / Windows / other targets — closing the residual race without changing the V1-visible diagnostic codes (`loom/load/invoke-path-escape`) or `InvokeInfraError { reason: "load_failure" }` envelope.
> *Seam:* the path-resolution call site in the invoke runtime is a single named function used by both load-time and invocation-time checks; replacing its body is additive and does not perturb caller code.

Edge cases the implementer must watch:

- Pick the heading anchor for the new bullet deterministically (e.g. `#symlink-resolution-hardening-for-invoke-path-containment`) and use that exact slug in the cross-reference from `invocation.md` so the link is stable on first introduction. (Adopt whatever slug convention the rest of `future-considerations.md` uses; the file currently has no explicit anchors, so introducing one is part of this edit.)
- Do not weaken the V1 normative wording: the sentence that remains in `invocation.md` must still state explicitly that V1 accepts the residual and that the re-check is mandatory. The cross-reference is a pointer to the deferred remedy, not a substitute for the V1 acceptance statement.
- The bucket choice (`Surface extensions (V1 leaves a seam)`) presupposes that the implementer treats the path-resolution call site as a single function. If V1 ends up inlining `realpath` + open at multiple sites, the seam claim becomes incorrect; in that case the bullet moves to **Model-level changes (no V1 seam expected)** instead. The wording above accommodates either bucket without further edits.

## Related Findings

- "Provider compatibility local-backend note belongs in `future-considerations.md`" — same-cluster (same placement pattern: deferred work mentioned inline in a normative page rather than catalogued in `future-considerations.md`; resolved independently with the same kind of edit)
- "V1 seam constraints mixed with out-of-scope deferrals across 14 bullets" — same-cluster (mirror image: that finding moves V1 seam obligations *out of* `future-considerations.md` into the normative pages; this one moves a deferred remedy *into* `future-considerations.md`. Together they enforce the same separation rule but cut in opposite directions)
- "Two-arm binder schema is a V1 deliverable buried in the non-goals section" — same-cluster (another instance of V1-vs-deferred boundary being blurred between `future-considerations.md` and a normative page; resolves independently)

---

## spec_topics/future-considerations.md

---

# Surface-extension "Seam:" annotations carry V1 obligations from the non-goals page

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** V1 seam constraints mixed with out-of-scope deferrals across 14 bullets
**Kind:** scope

## Finding

`spec_topics/future-considerations.md` is introduced as a deferral page — three buckets that "answer two questions: which V1 surfaces must leave a forward-compatible seam, and which items are post-V1 work that V1 is *not* expected to anticipate." The middle bucket, "Surface extensions (V1 leaves a seam)", contains 14 bullets, each ending in a `*Seam:*` annotation that states an obligation V1 code must satisfy *now*. Examples:

- "the query-options / tool-call-options / invoke-options struct must be open to additional fields, not a closed positional record" (per-call timeouts, per-query overrides);
- "the `QueryError` discriminator must be a string, not a closed enum at the type level" (user-defined error types, `BinderError` variant);
- "the frontmatter schema must tolerate forward-compatible unknown keys under a documented policy (V1 must state that policy explicitly)" (`binder_temperature`, user-overridable binder prompt);
- "the invocation AST node must carry a positional-vs-named flag even though V1 only emits positional";
- "`${...}` interpolation must go through a parser entry point that can later accept full expressions, not a hand-rolled `${param}` regex";
- "the module-resolution path must be a pluggable resolver, not a hard-coded relative-path resolution";
- "the binder-invocation path must not assume `bind_context` is set exactly once per loom" (automatic context escalation).

A `grep` across `spec_topics/` confirms most of these obligations appear *only* on this deferral page. `query.md`, `tool-calls.md`, and `invocation.md` say nothing about options-struct openness; `errors-and-results.md` describes the `QueryError` discriminator wire form but not the type-level openness constraint; `frontmatter.md` does not document an unknown-key policy (the only "unknown keys ignored" rule lives in `discovery.md`, scoped to the `looms.*` settings namespace, not loom frontmatter); `imports.md` says nothing about a pluggable resolver shape; `expressions.md` and `frontmatter.md` say nothing about the `${...}` parser entry point. Two of the fourteen are partially echoed on normative pages — `ContextOverflowError`'s `tokens_used` / `tokens_limit` nullability is documented in `errors-and-results.md`, and `argument-hint`'s preservation on the parsed AST is implicit in `frontmatter.md` / `slash-invocation.md` — but the rest stand alone in the deferral page.

The page's own framing compounds the problem: the prose calls itself a list of "Features deliberately deferred from V1," and the coverage matrix tags it `– (out of scope)`. An implementer reading only the normative topic pages will miss every uncited seam; an implementer who treats the page header at face value will read the seams as advisory hints about post-V1 work rather than V1 obligations. The `*Seam:*` italics do normative work without the authority of normative pages and without REQ-IDs (the H6 numbering pass explicitly skips `future-considerations.md` as narrative).

## Spec Documents

- `spec_topics/future-considerations.md` — Surface extensions bucket (edited)
- `spec_topics/query.md` — query primitive surface, `ContextOverflowError` detection (edited)
- `spec_topics/tool-calls.md` — tool-call options surface (edited)
- `spec_topics/invocation.md` — AST node shape, options surface (edited)
- `spec_topics/frontmatter.md` — field contract, unknown-key policy, `argument-hint` AST preservation (edited)
- `spec_topics/expressions.md` — `${...}` interpolation parser entry point (edited)
- `spec_topics/errors-and-results.md` — `QueryError` discriminator type-openness (edited)
- `spec_topics/imports.md` — module-resolution shape (edited)
- `spec_topics/binder.md` — binder-invocation `bind_context` re-entrancy (edited)
- `spec_topics/pi-integration-contract.md` — typed-query provider set as named constant; cross-format `SlashCommandSource` set membership (edited)
- `spec_topics/discovery.md` — cross-format collision source-set membership (read-only; already names a single set)
- `spec_topics/slash-invocation.md` — `argument-hint` AST preservation (read-only; already states the consumption rule)
- `spec.md` — REQ-ID prefix table (read-only; the prefix table need not change but the H6 anchor pass will need to number the new normative paragraphs)

## Plan Impact

**Phases:** MVP, Vertical V3, Vertical V5, Vertical V6, Vertical V12, Vertical V14, Vertical V15, Vertical V16, Vertical V17

**Leaves (implementation order):**

- Mb — MVP runtime/integration surface — (modified; the no-params `getArgumentCompletions` callback is already the V1 home for the `argumentHint`-on-AST seam and gains an explicit normative anchor)
- V3a — frontmatter parser surface — (modified; the unknown-key policy and `argument-hint` AST-preservation seams land here)
- V3b — frontmatter `params` — (modified; same unknown-key policy)
- V5b — `Query` primitive (untyped) — (modified; options-struct openness gains a normative anchor)
- V6a — `Query` primitive (typed) — (modified; options-struct openness; `QueryError` discriminator type-openness)
- V6 leaves consuming `QueryError` (V6b–V6k) — (modified; discriminator-as-string seam)
- V7 leaves doing `match` against `QueryError` — (read-only; the V1 set is still exhaustively matched, but tests should be re-anchored to the new normative paragraph rather than the deferral page)
- V12c — `system:` interpolation parser — (modified; `${...}` parser entry-point seam gains a normative anchor in `frontmatter.md` or `expressions.md`; the existing `loom/parse/system-interp-not-path` diagnostic hint already cites `future-considerations.md` and that hint text remains correct)
- V14a, V14b — tool-call surface — (modified; tool-call-options struct openness)
- V14q — slash-name collision at the same priority — (read-only; the `SlashCommandSource` named-set seam is already implicit in the current `discovery.md` and `pi-integration-contract.md` text)
- V15a–V15n — invocation surface — (modified; AST positional-vs-named flag seam lands in `invocation.md`; options-struct openness for invoke)
- V16a — binder defaults — (modified; frontmatter unknown-key policy underpins `binder_temperature` and binder-prompt-override seams)
- V16e–V16k — `bind_*` family — (modified; the "binder must not assume `bind_context` is set exactly once" seam lands in `binder.md`)
- V17a–V17m — `.warp` / imports — (modified; module-resolution pluggable-resolver seam lands in `imports.md`)

## Consequence

**Severity:** correctness

Two implementers working from the normative pages alone will diverge on observable surface shape: one may declare `QueryOptions` as a closed positional record, the other as an open struct; one may make `QueryError`'s `kind` a closed enum at the type level, the other a string; one may parse `${...}` with a regex, the other through an expression-parser entry point; one may hard-code the relative-path resolver, the other plumb a `Resolver` seam. Each divergence is silently V1-conforming today but blocks every named post-V1 extension. The deferral framing of the page makes it likely the divergent implementer is reading "deferred — not my problem" and never sees the seam.

## Solution Space

**Shape:** single

### Recommendation

Migrate every `*Seam:*` clause to the normative topic page that owns the surface it constrains, and reduce each `future-considerations.md` bullet to (a) the deferred feature description and (b) a back-link to the normative paragraph that pins the seam.

Concrete relocation table (one row per current bullet; the seam text moves verbatim or near-verbatim into the cited normative section, the bullet retains only the deferred-feature prose):

| Bullet | New normative home | Seam text to add |
|---|---|---|
| Per-call timeouts | `query.md`, `tool-calls.md`, `invocation.md` (options-surface section in each) | "The options record passed to <surface> is an open struct, not a closed positional record; V1 reserves the right to add fields without breaking call sites." |
| Pre-flight token-count check | (no migration needed) | The seam is already pinned in `errors-and-results.md` (`tokens_used` / `tokens_limit` nullability) and `query.md` (Detection of `ContextOverflowError`). The deferral bullet keeps its existing back-link. |
| Typed-query provider fallback | `pi-integration-contract.md` (Provider compatibility for typed queries) | "The V1-supported typed-query provider set is a single named runtime constant; widening it is additive." |
| Per-query overrides for `model` / `tools` / `system` | Same as per-call timeouts | (covered by the options-struct openness paragraph) |
| User-defined error types beyond `QueryError` | `errors-and-results.md` (`QueryError` declaration) | "The `kind` discriminator is typed as `string` (not a closed enum); call sites still exhaustively match the V1 variant set, but the type does not foreclose future variants." |
| `BinderError` as `QueryError` variant | (no migration needed) | Same paragraph as above; the deferral bullet keeps its back-link. |
| `binder_temperature` / user-overridable binder prompt | `frontmatter.md` (Field contract preamble) | "Unknown keys at the top level of frontmatter are tolerated for forward compatibility: <state the policy — e.g. ignored without diagnostic, or recorded under a `__unknown` bag, or warned at `loom/load/unknown-frontmatter-key` advisory severity>. The current V1 vocabulary is the table below; future minor versions extend the vocabulary additively." |
| Automatic context escalation | `binder.md` (binder-invocation section) | "The binder-invocation path is re-entrant per loom turn: V1 emits exactly one binder call per turn, but the path makes no assumption that `bind_context` is set at most once per loom over its lifetime." |
| Named-argument invocation | `invocation.md` (AST / argument-binding section) | "The invocation AST node carries a `style: 'positional' \| 'named'` discriminator; V1 only emits `'positional'`, but consumers must match exhaustively." |
| Richer `system:` expression sublanguage | `frontmatter.md` (Template Interpolation) or `expressions.md` | "`${...}` inside `system:` is parsed by the same expression entry point used by `expressions.md`, restricted at parse time to dotted-path expressions; the restriction is a parser-level filter, not a separate grammar." |
| Package / project-rooted import paths | `imports.md` (Path resolution) | "Import-path resolution goes through a single `Resolver` interface (`resolve(spec: string, fromFile: string): string`); V1 ships one implementation that handles relative paths only and rejects `@scope/pkg` and `/looms/...` with a documented diagnostic." |
| Pi-owned subagents enumerable as slash commands | (no migration needed) | The seam is already implicit in `discovery.md` and `pi-integration-contract.md` (the `"prompt" \| "extension" \| "skill"` set is named once); the deferral bullet keeps its back-link. |
| `argumentHint` upstream | (no migration needed) | The seam is already pinned in `frontmatter.md` ("the binder simply has no hint to use") and `slash-invocation.md` (`argument-hint` is consumed by the binder; the parsed AST retains it). The deferral bullet keeps its back-link. |

Edge cases the implementer must watch:

- **REQ-IDs.** The relocated seams become numbered REQ-IDs in their new home pages (per H6's anchor pass over non-narrative pages). The H6 leaf inserts the anchors during its single pass; do not pre-number them in this edit. After H6, the coverage matrix gains rows for each new REQ-ID, mapped to the leaves listed above. The `future-considerations.md` page remains unnumbered and untouched by H6.
- **The frontmatter unknown-key policy is a real choice, not a wording choice.** The current spec does not state which of {silently ignore, record under a bag, warn} V1 implements. The relocation forces that decision; pick the warning-at-advisory-severity option to match the existing `loom/load/argument-hint-not-displayed` precedent unless there is a specific reason to silence.
- **Diagnostic hint text already pointing at `future-considerations.md`** (e.g. `loom/parse/system-interp-not-path`) stays correct: the hint points the *user* at the deferred feature, not at the V1 seam. Do not rewrite those hints to point at the new normative paragraph.
- **Two bullets remain materially altered, not just relocated:** the `binder_temperature` / binder-prompt-override pair both depend on the unknown-key policy that does not yet exist. The relocation must land that policy paragraph in `frontmatter.md` first; the two deferral bullets then back-link to it.
- **Do not delete the bullets.** Even when the seam fully migrates, the deferral bullet retains the deferred-feature description and the back-link. The page's job — enumerating what V1 chose not to do — is still load-bearing.

## Related Findings

- "Two-arm binder schema is a V1 deliverable buried in the non-goals section" — same-cluster (same root cause: a V1 obligation framed as deferral-page metadata; co-resolves under the same "migrate the obligation, retain the back-link" pattern, but the source page differs — there the seam is in `binder.md` prose pointing forward, here the seam is in `future-considerations.md` pointing backward)
- "Automatic context escalation: unresolved conditional dependency" — co-resolve (one of the 14 bullets in this finding; the conditional dependency is a separate question that survives the relocation and should be answered in the relocated `binder.md` paragraph or flagged as an open question there)
- "Provider compatibility local-backend note belongs in `future-considerations.md`" — same-cluster (mirror direction: a V1-deferral note currently sitting *outside* `future-considerations.md` that should move *into* it; resolves the same boundary-discipline problem from the other side)
- "Conversation drive — prompt mode: MUST for an out-of-scope future feature" — same-cluster (same boundary-discipline failure: normative MUST applied to deferred work; co-resolves under the same "the normative page states only the V1 contract; deferrals live on the deferral page" pattern)
- "Symlink-hardening platform remedy is a deferred item described inline in a normative resolution rule" — same-cluster (mirror direction: deferred remedy living in a normative page; same fix pattern as the previous two)

---

# Binder refinement-loop seam is paid in V1 but filed under "no V1 seam expected"

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Two-arm binder schema is a V1 deliverable buried in the non-goals section
**Kind:** scope

## Finding

`spec_topics/binder.md` describes a binder envelope with three discriminator arms — `ok`, `needs_info`, `ambiguous` — and an `ambiguous.candidates` field that is part of the AJV-validated schema. The two failure arms produce identical V1 user-facing behaviour beyond the system-note prefix, and the `candidates` field is explicitly *not* surfaced in V1 (rule 5 of `System-note rendering` requires renderers to drop it). The page justifies all three pieces with a single sentence: "the structural distinction exists for the deferred binder refinement loop (cf. [Future Considerations](./future-considerations.md))."

`spec_topics/future-considerations.md` files **Binder refinement loop** under the bucket *Model-level changes (no V1 seam expected)*. That bucket is defined as items "V1 is not expected to anticipate; adding them post-V1 will require a migration." The bullet itself names no V1 seam and does not back-reference the `binder.md` work. Yet the seam is real and is paid for in V1: a third schema arm, a nullable `candidates: array<string>` field that AJV must accept, a per-arm system-note prefix, and a renderer rule that suppresses `candidates`. V16c, V16l, and V16m all exist specifically to land this shape.

The bucketing is also internally inconsistent. The same page lists **Automatic context escalation** in *Surface extensions (V1 leaves a seam)* with `Depends on: Binder refinement loop` — i.e. another deferred item whose own seam paragraph already presupposes that the refinement loop is itself a Surface-extension-class deferral. Both prose anchors point at a structural seam; only one ends up in the bucket whose contract is "name the seam."

## Spec Documents

- `spec_topics/binder.md` — `Binder envelope`, `Binder envelope schema`, `System-note rendering` rule 5 (option-dependent)
- `spec_topics/future-considerations.md` — `Surface extensions (V1 leaves a seam)`, `Model-level changes (no V1 seam expected)` (option-dependent)
- `plan_topics/v16-binder.md` — V16c / V16l / V16m / V16o (option-dependent — only edited under Option B)

## Plan Impact

**Phases:** Vertical V16

**Leaves (implementation order):**

- V16c — Binder envelope schema construction — (option-dependent: unchanged under Option A; arms collapse from three to two under Option B)
- V16l — `needs_info` envelope handling — (option-dependent: unchanged under A; merged with V16m under B)
- V16m — `ambiguous` envelope handling — (option-dependent: unchanged under A; removed or merged into V16l under B, and the `candidates`-suppression assertion disappears)
- V16o — Binder malformed envelope handling — (option-dependent: unchanged under A; the discriminator value set narrows under B)

## Consequence

**Severity:** advisory

An implementer reading `future-considerations.md` to understand which V1 surfaces must remain forward-compatible will not see the binder refinement loop and will not learn that the third envelope arm and the `candidates` field exist for a deferred feature rather than for V1 user value. The risk is not that V16c–V16m get implemented wrong — `binder.md` is normative and unambiguous — but that a future spec revision could "simplify" the envelope (e.g. drop `candidates`, collapse arms) without realising it is breaking a planned post-V1 migration path. The bucket misclassification removes the single signal future maintainers consult before touching V1 seams.

## Solution Space

**Shape:** single

### Recommendation

Option A. The seam is small (one extra discriminator arm plus one nullable field plus one renderer rule), the V1 implementation is already structured to land it (V16c/V16l/V16m exist and are testable as written), and collapsing now would lock in a schema-incompatible migration for any V2 refinement-loop work. The fix is editorial: relocate one bullet between buckets, add a `*Seam:*` annotation matching the format the other Surface-extensions bullets use, and tighten the two `binder.md` pointers to land on the relocated anchor.

Edge cases for the fixer:
- The `*Seam:*` annotation must enumerate **all three** carriers (envelope discriminator, `candidates` field, system-note prefix). Naming only one risks a future "simplification" that drops the others.
- Update `Automatic context escalation`'s `Depends on:` pointer to use the relocated anchor too — keeping both bullets in the same bucket strengthens the dependency's legibility.
- Do not add a new `loom/load/...` diagnostic for "candidates emitted but not rendered" — it is intentional and the schema accepts it; the renderer suppression is the contract, not a violation.

## Related Findings

- "V1 seam constraints mixed with out-of-scope deferrals across 14 bullets" — co-resolve (same bucket-discipline problem in `future-considerations.md`, opposite direction; both fixes establish the rule "V1 seam ↔ Surface extensions bucket")
- "Automatic context escalation: unresolved conditional dependency" — decision-dependency (its `Depends on: Binder refinement loop` line presumes the refinement loop is a real seam target; Option A makes that pointer load-bearing, Option B requires editing it)
- "SDK surface (`estimateTokens`, `ctx.sessionManager`) placed in binder behavioral page" — same-cluster (binder.md placement hygiene)
- "Provider seed-field mapping (Determinism section) placed in binder page" — same-cluster (binder.md placement hygiene)

---

## spec_topics/errors-and-results.md

---

# `InvokeInfraError` / `kind: "invoke_failure"` schema-vs-wire pair missing from the glossary

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** `` `InvokeInfraError` / `kind: "invoke_failure"` asymmetry not in glossary ``
**Kind:** naming

## Finding

Every `QueryError` variant in `errors-and-results.md` pairs a loom-side schema name with a snake_case wire `kind` discriminant, and in eight of the nine cases the two are mechanically related: `CancelledError` ↔ `"cancelled"`, `CodeToolError` ↔ `"code_tool"`, `ToolLoopExhaustedError` ↔ `"tool_loop_exhausted"`, etc. `InvokeInfraError` is the lone exception — its wire form is `"invoke_failure"`, dropping the `Infra` qualifier entirely. The `Infra` qualifier exists to partition the invoke-side variants (`InvokeInfraError` for failures *around* the callee body, `InvokeCalleeError` for the callee's own propagated `Err`); the wire `kind` predates that split and was deliberately left at `"invoke_failure"` to preserve the on-wire contract.

That history is captured in two prose footnotes inside `errors-and-results.md` (the **Notes** subsection and an inline aside on the `InvokeInfraError` schema), but it is invisible from the glossary. The glossary's general `loom-side name vs. wire name` entry establishes that the two surfaces *can* diverge with a `field as "WireName": T` rename, but it does not flag any specific `QueryError` variant where they actually do diverge, and it does not name `InvokeInfraError` / `"invoke_failure"` as the one V1 case where divergence is structural rather than per-field opt-in. Since `InvokeInfraError` is referenced from at least six topic pages (`errors-and-results.md`, `invocation.md`, `tool-calls.md`, `query.md`, `pi-integration.md`, `schema-subset.md`), it meets the glossary's own inclusion criterion ("terms reused on more than one page").

The result is a discoverability gap: an author who encounters `kind: "invoke_failure"` on the wire and grep-misses to the glossary first will not find the schema name; an author who encounters `InvokeInfraError` in code and consults the glossary will not find the wire name. Both must read past two prose paragraphs in `errors-and-results.md` to discover the asymmetry is intentional.

## Spec Documents

- `spec_topics/glossary.md` — entry list (edited)
- `spec_topics/errors-and-results.md` — `QueryError variants` and `Notes` (read-only; canonical authority)
- `spec_topics/invocation.md` — `Failures` (read-only; cross-references the pair)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is confined to the glossary page (and optionally a one-line back-link from the `errors-and-results.md` Notes paragraph). No leaf's `Adds` / `Tests` / `Ships when` text changes; in particular `V15l — InvokeInfraError variant` already pins schema name + wire `kind` correctly.

## Consequence

**Severity:** cosmetic

A reader who looks up either name in the glossary fails the lookup and must read two paragraphs of `errors-and-results.md` to learn the mapping. No implementer would build the wrong shape from this — the canonical schema declaration is unambiguous — but the glossary's stated role as "the spec's coined vocabulary in one alphabetised list" is undercut for the only `QueryError` variant whose two names do not match by construction.

## Solution Space

**Shape:** single

### Recommendation

Add a glossary entry for the `InvokeInfraError` ↔ `"invoke_failure"` pair. Suggested wording (alphabetises under `I`):

> **`InvokeInfraError`** / **`kind: "invoke_failure"`** — The infra-side invoke failure variant of `QueryError`. The schema name carries an `Infra` qualifier to partition it from `InvokeCalleeError` (the callee's own `Err` propagated through), but the wire `kind` discriminant remains `"invoke_failure"`: snake_case discriminants are stable wire contract and are not renamed when their loom-side schema name changes. This is the only V1 `QueryError` variant whose schema and wire names diverge other than by an explicit `field as "..."` rename. See: [Errors and Results — Invoke variants](./errors-and-results.md), [Invocation — Failures](./invocation.md).

The entry slots between the existing `coercion (type, expression-level)` and `loom-side name vs. wire name` items. Optionally extend the `loom-side name vs. wire name` entry with a sentence pointing forward to this entry as the canonical example. No edit to `errors-and-results.md` is required; if one is made, it should be limited to a single back-pointer ("see Glossary entry") in the Notes paragraph rather than relocating the explanation.

Edge case for the implementer: keep the entry short — the canonical `reason` enum (`load_failure` / `parse_failure` / `validation` / `panic` / `internal_error`) belongs on the schema page, not the glossary, per the page's "descriptive only" preamble.

## Related Findings

- "`argument-hint` uses a hyphen; all loom-native multi-word fields use underscores" — same-cluster (a different naming-asymmetry-not-explained-in-spec instance; resolved on `frontmatter.md`, not the glossary, but symptom is the same)
- ""binder bypass" conflates two distinct named conditions" — same-cluster (another glossary completeness gap; same edit pass on `glossary.md`)
- ""loom" overloaded across three senses; no disambiguating glossary entries" — same-cluster (another glossary completeness gap; same edit pass on `glossary.md`)

---

## spec_topics/frontmatter.md

---

# Hyphenated `argument-hint` breaks the loom-native underscore convention without an inline rationale

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** `argument-hint` uses a hyphen; all loom-native multi-word fields use underscores
**Kind:** naming

## Finding

Every multi-word frontmatter field that loom defines for itself uses underscores: `bind_model`, `bind_context`, `bind_echo`, `tool_loop`, and the nested `coercion.max_iterations` / `tool_loop.max_iterations`. The single multi-word exception is `argument-hint`, which is hyphenated. The exception is deliberate — `spec_topics/frontmatter.md` describes the field as mirroring "Pi's prompt-template frontmatter", and Pi's prompt-template loader does in fact key off the literal YAML string `argument-hint` (`pi-coding-agent` `dist/core/prompt-templates.js:102`: `frontmatter["argument-hint"] && { argumentHint: frontmatter["argument-hint"] }`). Loom inherits that key verbatim so authors who already know Pi's prompt templates do not have to learn a second spelling.

What the spec never states is the convention itself. The reader is left to infer "Pi-inherited names keep Pi's spelling; loom-native names use underscores" from the absence of a rule. An author writing a loom by analogy with `bind_model` will reach for `argument_hint:`, which then routes through the generic `loom/load/unknown-frontmatter-field` warner with the message `unknown frontmatter field 'argument_hint'`. The loom registers, no `Argument hint:` line reaches the binder grounding payload, and the autocomplete dropdown — which never surfaced the hint anyway — gives no signal that anything was misspelled. The symptom is silent degradation of binder grounding quality, traced only by an author who notices the warning and matches it against the field-contract table.

`description` is the other Pi-inherited field but is single-word, so it carries the convention asymmetry without exhibiting it. Among V1 vocabulary, only `argument-hint` actually shows the asymmetry, which is precisely why a one-line note would close the gap.

## Spec Documents

- `spec_topics/frontmatter.md` — Field contract table preamble or footnote on the `argument-hint` row (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The minimum fix is a documentation note. V3a already implements `loom/load/unknown-frontmatter-field` for arbitrary unknown keys, including `argument_hint`, and its acceptance criteria do not change. The optional typo-detection enhancement described under Recommendation would touch V3a; if adopted, treat V3a as `(modified)`.)

## Consequence

**Severity:** advisory

Authors who learn loom from its underscore-heavy field set will mistype `argument_hint:` and silently lose the binder grounding hint. The diagnostic surface is correct (one warning is emitted) but it does not connect the typo to the canonical name, so debugging requires opening the field-contract table. No implementation diverges; the cost is author confusion and degraded binder output for the affected loom file.

## Solution Space

**Shape:** single

### Recommendation

Add a one-line normative note to `spec_topics/frontmatter.md`, placed either as a sentence directly after the field-contract table or as a footnote on the `argument-hint` row. Suggested wording:

> **Naming convention.** `description` and `argument-hint` retain Pi's prompt-template spellings verbatim (Pi's loader keys off the literal YAML string `argument-hint`); every loom-defined multi-word field uses underscore separators (`bind_model`, `bind_context`, `bind_echo`, `tool_loop`, and the nested `*.max_iterations` / `*.attempts` / `*.methodology` keys). A frontmatter key of `argument_hint:` is therefore unrecognised and surfaces as `loom/load/unknown-frontmatter-field`.

Edge cases for the implementer of the spec edit:

- Do **not** change the field name. `pi-coding-agent`'s prompt-template parser reads `frontmatter["argument-hint"]` literally, and the spec's design intent is verbatim inheritance of Pi's YAML key. Renaming to `argument_hint` would either fork the spelling from Pi or require a second alias, both of which defeat the "mirrors Pi" framing.
- The note belongs in `frontmatter.md` only. The other files that mention the field (`binder.md`, `slash-invocation.md`, `pi-integration.md`, `future-considerations.md`) already use the canonical hyphenated form consistently and do not need touching.
- Optional, out of scope of this finding's minimum fix: V3a's unknown-frontmatter-field warner could include a "did you mean `argument-hint`?" hint when the offending key is exactly `argument_hint`. If pursued, it modifies V3a's acceptance criteria and warrants a separate diagnostic-message variant — the present finding does not require it.

## Related Findings

- "`InvokeInfraError` / `kind: \"invoke_failure\"` asymmetry not in glossary" — same-cluster (sibling naming-asymmetry documentation gap; both fixed by adding a single explanatory note rather than by renaming, but the edits live in different files and resolve independently)

---

## spec_topics/glossary.md

---

# Glossary entry for "binder bypass" omits the no-params case

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** "binder bypass" conflates two distinct named conditions
**Kind:** naming

## Finding

`spec_topics/binder.md` defines two independent bypass conditions under its `## Binder bypass` heading: **No-params bypass** (when `params:` is absent or `{}`) and **Single-string bypass** (when `params:` declares exactly one un-defaulted `string` field). Each has distinct triggers, distinct interactions with `bind_echo` (`loom/load/bind-echo-without-params` vs. `loom/parse/bind-echo-on-bypass`), and a load-time ordering rule between them ("the no-params bypass check runs before the single-string bypass check").

The `spec_topics/glossary.md` entry **binder / binder bypass** describes only the single-string condition: "when `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets the param to the entire slash-argument string … and skips the binder." A reader who looks up "binder bypass" in the glossary gets a definition that silently excludes the no-params case — and who would not know to keep reading `binder.md` to discover the omission.

The glossary's preface mitigates the harm ("if a glossary entry and its canonical page disagree, the canonical page wins"), so this is a documentation completeness defect, not a correctness one. But the glossary's own purpose — a one-stop reminder of coined vocabulary — is undermined when a named term covers two cases and the entry mentions only one.

## Spec Documents

- `spec_topics/glossary.md` — `binder / binder bypass` entry (edited)
- `spec_topics/binder.md` — `## Binder bypass` section (read-only — confirms both named conditions)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(`plan_topics/h6-req-ids.md` explicitly excludes `glossary.md` from REQ-ID anchoring as a pure-narrative page, and `coverage-matrix.md` carries no rows for it. The glossary is governed only by the cross-cutting `glossary` discipline in `spec.md`, which the fix satisfies in-place without leaf-level acceptance changes.)

## Consequence

**Severity:** advisory

A reader consulting only the glossary entry will believe the binder bypass is exclusively the single-string case and will not anticipate the no-params shortcut, the no-params-specific `loom/load/bind-echo-without-params` warning, or the load-order rule that prevents `params: {}` from accidentally matching the single-string branch. The canonical page is correct, so implementations following `binder.md` are unaffected; the cost is reader confusion and lost cross-reference value, not divergent code.

## Solution Space

**Shape:** single

### Recommendation

Take Option A. The pair pattern is already established for `loom-side name` vs. `wire name`, the two bypass conditions have distinct triggers and distinct diagnostics, and `binder.md` and plan leaf V3c both treat them as named coordinate cases rather than as variants of one underlying rule. Splitting also exposes the headwords `no-params bypass` and `single-string bypass` to glossary lookup, which is what the original finding observed was missing. Watch one edge case: the new `binder` entry must keep the cross-link to `binder.md`, and the paired bypass entry should anchor to `binder.md#binder-bypass` (not the page root) so a follower lands directly on the section that names both conditions in order.

## Related Findings

- "`InvokeInfraError` / `kind: "invoke_failure"` asymmetry not in glossary" — same-cluster (both are glossary-completeness gaps; resolve independently)
- "\"loom\" overloaded across three senses; no disambiguating glossary entries" — same-cluster (both edit `spec_topics/glossary.md` to add or split coined-term entries; co-resolvable in a single glossary pass but logically independent)

---

# "loom" / "Loom" / "pi-loom" — three referents, no glossary disambiguation

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** "loom" overloaded across three senses; no disambiguating glossary entries
**Kind:** naming

## Finding

The token "loom" carries three distinct referents across the spec, none of which the glossary names or distinguishes:

1. **The extension** — `pi-loom`, "the loom extension" (e.g. `spec.md:1`, `diagnostics.md:3` "the loom extension", `discovery.md` repeatedly).
2. **The language** — "Loom code", "Loom language", "Loom expressions" (e.g. `spec.md:5`, `spec.md:23`, `bindings.md:3` "Loom follows Rust's…", `expressions.md:3`, `influences.md:3`).
3. **A single invocable file unit** — "evaluating a loom", "each `.loom` file defines a **loom**", "the loom's queries", "the loom's return value" (e.g. `spec.md:3`, `overview.md:40` "Scope of a Loom File", `frontmatter.md`, `invocation.md`).

`glossary.md` defines none of the three. It uses "loom" freely inside other entries (`binder`, `callable set`, `prompt mode`, `Pi tool`) without ever pinning which referent is intended; readers are left to infer from context. Capitalisation is also inconsistent and load-bearing in places it should not be: `overview.md` writes "Scope of a Loom File" (sense 3, capitalised) while the body of the same file writes "loom" lowercase for the same referent; `spec.md` capitalises "Loom" for the language (sense 2) without ever stating that capitalisation marks the language sense; `influences.md` and `bindings.md` use "Loom" for the language but `expressions.md` mixes "Loom" and "loom" for the same referent across adjacent paragraphs.

The result is that an implementer reading any single sentence containing "loom" must do work to figure out which of the three is meant, and the glossary — which exists precisely to anchor coined terms — is silent on the term that names the project.

## Spec Documents

- `spec_topics/glossary.md` — body list (edited)
- `spec_topics/overview.md` — "Scope of a Loom File" heading and surrounding prose (edited; capitalisation pass)
- `spec_topics/influences.md` — "Loom borrows from…" prose (read-only; benchmark for language sense)
- `spec_topics/bindings.md`, `spec_topics/expressions.md`, `spec_topics/control-flow.md`, `spec_topics/descriptions.md`, `spec_topics/imports.md`, `spec_topics/grammar.md` — sentences that capitalise "Loom" for the language sense (read-only; verify they conform to the chosen convention, edit only on drift)
- `spec.md` — opening paragraph and "Surface and semantics of the Loom language" header (read-only; cross-check)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. `glossary.md` is enumerated as a pure-narrative page in the REQ-ID prefix table (`spec.md`) and is explicitly excluded from H6's anchor pass (per `plan_topics/h6-req-ids.md`). No leaf's acceptance criteria reference the term-disambiguation question, and no leaf is blocked on it.

## Consequence

**Severity:** advisory

Two implementers reading `frontmatter.md`'s "the loom's typed `params`" or `diagnostics.md`'s "owned by the loom extension" can both build correct code, but reviewers chasing precise references — especially around invocation boundaries where "the loom" (file unit) is distinct from "the loom extension" (process-wide registry) and from "Loom" (the language whose grammar admits a construct) — will repeatedly stumble. The glossary's silence on the project's title term is a missed-opportunity defect rather than a soundness issue.

## Solution Space

**Shape:** single

### Recommendation

Add three glossary entries to `spec_topics/glossary.md` (alphabetised in place) and pin the capitalisation convention in the entry for sense 2:

- **loom (file unit)** — A single `.loom` file viewed as a named, invocable unit: the artefact a slash command resolves to, the thing `invoke(...)` targets, the thing whose frontmatter declares `mode:`. Used with an article ("a loom", "the loom"). Lowercase. See: [Overview — Scope of a Loom File](./overview.md), [Invocation](./invocation.md).
- **Loom (language)** — The scripting language whose grammar and semantics this spec defines, shared by `.loom` and `.warp` files. Capitalised when used as a proper noun ("Loom expressions", "Loom code", "Loom follows Rust's…"); the lowercase form is reserved for sense 1. See: [Lexical Structure](./lexical.md), [Expression Sublanguage](./expressions.md), [Influences](./influences.md).
- **pi-loom (extension)** — The Pi extension that registers `.loom` files as slash commands, owns the discovery walk, and runs loom code. Referred to in prose as `pi-loom` or "the loom extension"; never capitalised "Loom Extension". See: [Pi Extension Integration](./pi-integration.md), [Pi Integration Contract](./pi-integration-contract.md).

After landing the entries, sweep `overview.md` once for the rule "capital `L` ⇒ language; lowercase `l` ⇒ file unit": the section heading "Scope of a Loom File" should become "Scope of a loom file" (sense 1), while "Loom expressions" / "Loom code" elsewhere stay capitalised. The sweep is mechanical and can be done in the same edit.

Edge cases the implementer must watch:

- `frontmatter.md` and `query.md` use phrases like "Loom static type" and "Loom literal sublanguage" — these are language-sense (capital L) and stay as-is.
- `discovery.md` and `pi-integration.md` use "the loom extension" — extension-sense (lowercase, with article) and stay as-is.
- Code-fence text and diagnostic codes (`loom/parse/...`, `loom-system-note`) are wire identifiers, not prose; they are not subject to the convention.
- Do not add REQ-IDs to the new entries — `glossary.md` is `(no IDs — narrative)` per the prefix table.

## Related Findings

- "binder bypass" conflates two distinct named conditions — same-cluster (adjacent glossary defect; same edit pass to `glossary.md` is the natural carrier)
- `InvokeInfraError` / `kind: "invoke_failure"` asymmetry not in glossary — same-cluster (third missing-glossary-entry finding; co-resolve in the same edit if the fixer is already in `glossary.md`)
- "top-level loom block" vs. "top level of a loom" — minor terminology inconsistency — same-cluster (also a candidate for a glossary entry once the canonical phrasing is picked in `return.md`)
- `argument-hint` uses a hyphen; all loom-native multi-word fields use underscores — same-cluster (sibling naming-convention finding in the same review; resolves independently)

---

## spec_topics/cancellation.md

---

# Race semantics: no injectable seam to land an abort between an `Ok` return and the next checkpoint

**Source:** docs/reviews/spec-review/spec-20260505-204733.md
**Original heading:** Race semantics: no test seam for checkpoint timing
**Kind:** testability

## Finding

`spec_topics/cancellation.md` (Race semantics paragraph) commits the runtime to a precise no-retroactive-rewrite rule: "An operation that has already returned `Ok(v)` retains that value even if the signal fires before the next checkpoint executes; the interpreter must not retroactively rewrite a completed `Ok` into `Err({kind:'cancelled'})`." The same paragraph also commits the runtime to the symmetric tail rule: if no further checkpoint executes before the loom returns, the abort is *not* synthesised into a top-level `cancelled` — the loom completes `Ok`. Both rules constrain interpreter behaviour in the sub-microtask window between an operation's resolution and the next checkpoint's signal-check.

No test seam exists today to land an abort deterministically inside that window. The existing collaborator seams (`H2 — Dependency-injection skeleton`) cover `FileSystem`, `DiagnosticsSink`, `SchemaValidator`, `ModelClient`, `ConversationDriver`, `ToolHost`, `LoomLoader`, `SubagentSpawner` — none of them give a test direct control over the boundary "operation just returned, checkpoint not yet observed". A test that fires `loomAbort.abort()` immediately after a fake tool's `execute()` resolves cannot guarantee the abort lands before the interpreter's next-statement microtask drains; the result is timing-dependent and either smoke-tests the in-flight cancellation path (already covered by V18b/c/d) or accidentally exercises the tail-completion path. The `V18a–V18e` leaves' `Tests.` bullets quietly assume this rule but supply no mechanism to verify it; the failure-mode (a regression where the interpreter checks `signal.aborted` *after* having already chosen the `Err` branch and rewrites the bound value) would slip through.

The same gap blocks deterministic verification of the tail rule: a fake whose final statement is pure arithmetic cannot reliably observe "abort fired during the tail" without a hook that fires synchronously between the final operation's return and the loom's top-level resolution.

## Spec Documents

- `spec_topics/cancellation.md` — Race semantics paragraph and Edge cases bullets (option-dependent)
- `spec_topics/pi-integration-contract.md` — `FakeFileSystem` / `FileSystem` interface section (the canonical "seam declaration" surface) (option-dependent)
- `spec_topics/implementation-notes.md` — Runtime section (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H2 — Dependency-injection skeleton with fakes — (modified) — adds the new seam interface and its in-memory fake
- V18a — `AbortSignal` at every loop iteration boundary — (modified) — gains a no-retroactive-rewrite test using the seam
- V18b — `AbortSignal` before every `@` query — (modified) — same
- V18c — `AbortSignal` before every tool call — (modified) — same
- V18d — `AbortSignal` before every `invoke` — (modified) — same
- V18e — Cancellation propagates downward only — (modified) — uses the seam to verify the parent's tail-completion rule when the child cancels last
- V18p — `AbortSignal` before and during the binder LLM call — (modified) — tail-completion rule for bypass-eligible looms ("either runs to its first in-loom checkpoint and surfaces `Err({kind:"cancelled"})` there or completes") is presently asserted without a deterministic injection point

## Consequence

**Severity:** advisory

The rule is unambiguous in prose, but two reasonable implementers can write the interpreter loop differently — one checks `signal.aborted` *before* binding the result, the other *after* — and only the second satisfies the spec. Without a test seam the regression is invisible until production users observe sporadic value loss after pressing Esc. The cancellation slice still ships and behaves correctly in the common cases; what is lost is the ability to defend the rule under refactoring.

## Solution Space

**Shape:** single

### Recommendation

**Option A.** Add a `Checkpoint` seam to H2 with `before(kind, site)`, no-op in production, observable in tests. This is the only option that gives deterministic tests of *both* race rules (no-retroactive-rewrite *and* tail-completion) without depending on JS microtask scheduling.

Edge cases the implementer must watch:
- The seam fires *before* the signal-check, not after, so a test that calls `abort()` from inside `before(...)` exercises the "abort observed at this checkpoint" path; a test that calls `abort()` from inside the *previous* checkpoint's `before(...)` exercises the "abort landed between checkpoints" path. Document both patterns.
- The hook must be `await`ed even when production wiring is a no-op, otherwise tests cannot inject async work between operation resolution and signal-check. The cost is one already-resolved promise per checkpoint.
- For `invoke`, parent and child each own their own `Checkpoint` seam (consistent with the per-invocation `loomAbort` rule); the H2 wiring constructs the child's seam from the same factory.
- The seam does **not** observe non-checkpoint synchronous work (AJV validation, schema lowering, default-merging) — the Granularity rule already excludes those, and the seam mirrors that exclusion exactly.
- The `binder-call` site is a checkpoint per V18p but lives outside the loom body; the seam fires there too so the cancelled-binder failure-mode test in V18p can also land aborts deterministically.

## Related Findings

- "Watcher debounce (250 ms) is a wall-clock constraint with no injectable clock seam" — same-cluster (both are wall-clock / timing constraints lacking a test seam; resolve independently with seam-shaped fixes)
- "`scanPackagesTimeoutMs` is a wall-clock constraint with no injectable clock seam" — same-cluster (same shape; a single `Clock` seam could co-resolve both watcher and timeout findings, but is independent of `Checkpoint`)
- "Discarded query event: \"exactly once\" — no observable marker to verify count" — same-cluster (testability gap on a normative rule; resolves with a different observation surface)
- "Non-text content \"silently\" discarded: no observable signal for tests" — same-cluster (testability gap; independent fix)
- "Re-scan deduplication: no observable emission counter" — same-cluster (same family of "no observable counter" findings)

