# Triaged Spec Review - spec.md

_Generated: 2026-06-07T00:00:00Z_
_Spec: docs/spec.md_
_Process: bottom-up - the last finding (T18) is addressed first; the first finding (T01) is addressed last._

_Triage tally: 0 blocker, 0 high, 3 medium, 0 low retained; 197 low discarded; 0 low findings merged into 0 medium findings; 91 nit dropped; 0 false dropped._

---

# T01 - `node_modules/` walk silently skips pnpm-isolated package entries

**Kind:** assumptions
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

The package-discovery walk's "immediate child directory" enumeration rule (the first **Per-package resolution** bullet in `package-and-settings.md`) classifies `node_modules/` (root #3) entries through the `FileSystem.lstat` seam, which PIC-13 (`host-interfaces-services.md`, anchor `pic-13`) specifies does NOT follow symlinks. Under pnpm's default isolated layout the top-level `node_modules/` entries are symlinks (`lstat` reports `isSymbolicLink()` true and `isDirectory()` false), so under the literal "immediate child directory" rule they are neither candidate packages nor scope directories and contribute zero looms. The spec is silent on this case — it does not direct realpath-classification, scope `node_modules/` to non-pnpm layouts, or register a diagnostic — so one implementer silently drops every pnpm loom while another who follows symlinks finds those packages resolved under `.pnpm/`, with divergent containment (`loom/load/manifest-escapes-package`) and cross-source dedup behaviour, both claiming conformance. The four sibling roots are unaffected because `pi install` populates them with real directories.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** d6cbb37 — pi-loom spec: resolve "pi.looms is an extension-owned convention" (2026-05-04, Thomas Andersen); 475155c — pi-loom plan: resolve "V14m discovery walk omits scoped packages and has no upper bound" (2026-05-05, Thomas Andersen)
**History:** The package-discovery walk was assembled across two commits. d6cbb37 introduced the "Roots scanned" block listing `node_modules/` as root #3, bringing pnpm's on-disk layout into scope. 475155c then added the immediate-child-directory enumeration bullet, which classifies entries without following symlinks. The pnpm-isolated-symlink case has been silently unhandled since that second commit completed the walk, and no later edit on `package-and-settings.md` addressed it.

## Solution approach

Clarify the `node_modules/` root (#3) enumeration in `package-and-settings.md` to pin that entries whose `lstat` reports `isSymbolicLink()` true are filtered out silently — the walk does not follow symlinks, so pnpm's default isolated layout (`node_modules/<pkg>` as a symlink into `node_modules/.pnpm/…`) is out of scope for this root. Name the recourse so the out-of-scope band is actionable: pnpm projects install via `pi install` (root #1 or #4) or use pnpm's hoisted node-linker mode.

## Solution constraints

- Out of scope: the `@`-scope-directory candidate-enumeration rewrite of the same `node_modules/` walk, owned by T02.
- Out of scope: changing PIC-13's `lstat` / `realpath` member contracts in `host-interfaces-services.md`, or introducing realpath-classification of `node_modules/` entries — the clarification rests on the existing `lstat` no-follow semantics.

## Relationships

- T02 "Package-discovery candidate-enumeration rule stated two contradictory ways" — same-cluster (both touch the `node_modules/` root's candidate-enumeration walk; symlink classification vs scoped-package unwrapping; resolve independently)
# T02 - Package-discovery candidate-enumeration rule stated two contradictory ways

**Kind:** clarity
**Importance:** medium
**Score:** 15
**Must-fix:** false
**Shape:** single
**State:** reduced

## Problem

`docs/spec_topics/discovery/package-and-settings.md` § "Package discovery" defines what counts as a "candidate package" twice, with conflicting answers. The intro sentence under **Roots scanned** treats every immediate child whose `package.json` parses as a candidate — which silently drops `@scope` directories (they carry no `package.json`), making every loom under any `@scope/pkg` invisible. The first bullet under **Per-package resolution** instead unwraps `@`-prefixed children one level as scope directories and reads `@scope/pkg/package.json`. The two rules diverge for npm's standard scoped-package layout, which routinely appears in `node_modules/` and `~/.pi/agent/npm/`; the enumeration rule is also structurally misplaced inside the body of the loop that opens "For each candidate package:".

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** d6cbb37 — pi-loom spec: resolve "pi.looms is an extension-owned convention" (2026-05-04, Thomas Andersen); 475155c — pi-loom plan: resolve "V14m discovery walk omits scoped packages and has no upper bound" (2026-05-05, Thomas Andersen)
**History:** d6cbb37 introduced the "Roots scanned" intro sentence treating every immediate child whose `package.json` parses as a candidate package. 475155c then added the `@`-scope-aware "Per-package resolution" bullet that unwraps scope directories, without reconciling or removing the intro sentence. The two contradictory candidate-enumeration definitions have coexisted since that second commit.

## Solution approach

Rewrite the intro candidate-enumeration sentence under **Roots scanned** so it states the scope-aware rule (`@`-prefixed children are scope directories whose own immediate children are the candidates) as the single definition of what counts as a candidate package. Delete the contradicting first bullet of **Per-package resolution** (the "For each root in the priority list above…" bullet) so the loop body describes only per-package behaviour, leaving the `disc-5` bullet and the remaining `pi.looms`-resolution bullets intact.

## Solution constraints

- Out of scope: symlink / pnpm-isolated entry classification in the same discovery walk (owned by T01).

## Relationships

- T01 "`node_modules/` walk silently skips pnpm-isolated package entries" — same-cluster (same enumeration walk, but concerns symlink classification rather than `@scope` unwrapping; resolve independently)
# T05 - `ContextOverflowError` carries `raw_response` in prose but not in its schema

**Kind:** error-model
**Importance:** medium
**Score:** 25
**Must-fix:** false
**Decision axes:** 2
**Shape:** single
**State:** reduced

## Problem

The detection rule in `query-failure-and-repair.md` § *Detection of `ContextOverflowError`* specifies that a streamed response truncated at the output boundary is classified as `context_overflow` "with `raw_response` set to the partial text", and the § *Notes* cross-variant paragraph in `queryerror-variants.md` positively claims both `cancelled` and `context_overflow` admit a (rarely-populated) `raw_response`. But the canonical `ContextOverflowError` schema declares only `kind`, `message`, `tokens_used`, and `tokens_limit` — no `raw_response` — and `CancelledError` declares only `kind` and `message`. A conforming implementation cannot set a field its schema does not declare, and an exhaustive consumer destructuring `ContextOverflowError` would never see the partial-text payload the detection prose promises. Two implementers diverge: one honours the prose and fails the variant's own schema-shape assertion, the other honours the schema and discards the partial stream the detection rule captured.

## Issue introduction

**Verdict:** multi-commit-interaction
**Introducing commits:** 82be125 — spec: adopt P1 typed-query two-phase loop (Option A) (2026-05-04, Thomas Andersen); 6750c81 — spec: consolidate QueryError variants; rename to InvokeInfraError / CodeToolError / ModelToolError (2026-05-05, Thomas Andersen)
**History:** The `context_overflow` detection prose asserting `raw_response` is set to the partial text was authored in 82be125. 6750c81 then consolidated the QueryError variants, fixing the `ContextOverflowError` field set to `kind`/`message`/`tokens_used`/`tokens_limit` with no `raw_response`. The prose and the canonical schema have diverged since, the prose promising a field the schema never declared.

## Solution approach

Reconcile the schema to the detection prose. Add a `raw_response: string | null` field to the `ContextOverflowError` schema in `queryerror-variants.md`, following the `ToolLoopExhaustedError` precedent for the field's shape and null semantics. Rewrite the § *Notes* cross-variant `raw_response` paragraph so it states `context_overflow`'s populated-vs-null condition and drops the `cancelled` claim. The detection-rule clause in `query-failure-and-repair.md` already matches this shape and needs no change.

## Solution constraints

- `CancelledError`'s schema must not gain a `raw_response` field — its firing path holds no partial assistant text the runtime is positioned to surface.

## Relationships

None

