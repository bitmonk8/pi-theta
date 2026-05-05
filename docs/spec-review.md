# pi-loom — Consolidated Spec Review

_Generated: 2026-05-05T19:49:46Z (revised: merges + multi→single conversion + bottom-up reorder)_
_60 source findings → 2 commit-ready findings (8 merge clusters, 22 standalone). 8 false positives dropped at consolidation; 0 persistent failures._

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
