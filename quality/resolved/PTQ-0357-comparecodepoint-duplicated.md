---
id: PTQ-0357
title: compareCodePoint's Unicode code-point comparator is byte-identical in compact-transcript.ts and schema-lowering.ts
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/compact-transcript.ts:223-235
  - src/parser/schema-lowering.ts:104-116
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260915044704
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-15
---

# compareCodePoint's Unicode code-point comparator is byte-identical in compact-transcript.ts and schema-lowering.ts

## Observation
`src/binder/compact-transcript.ts` and `src/parser/schema-lowering.ts` each declare their own file-private `function compareCodePoint(a: string, b: string): number`, used exclusively to sort object keys by Unicode code point inside that file's own canonical-JSON serializer (`canonicalJson` in compact-transcript.ts; `canonicalForm` in schema-lowering.ts). The two 13-line function bodies are byte-for-byte identical. Neither file imports from the other, and neither file's comment names the other's copy — each is an independent declaration satisfying a similarly-worded but textually distinct spec requirement (BNDR-8 vs. schema-subset.md's Canonical schema hash).

## Evidence

**Location 1 — `src/binder/compact-transcript.ts:223-235`:**
```ts
function compareCodePoint(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const len = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aPoints[i]?.codePointAt(0) ?? 0;
    const bp = bPoints[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) {
      return ap - bp;
    }
  }
  return aPoints.length - bPoints.length;
}
```
Called at compact-transcript.ts:206, `.sort(([a], [b]) => compareCodePoint(a, b))`, inside `canonicalJson`'s object-key branch. `canonicalJson` is the renderer's "single source for emitting JSON anywhere in the transcript" (its own doc comment) — reached from `renderAssistant`'s `<args-json>` and `renderToolResult`'s non-text blocks, both called from `renderMessage`, called from the exported `renderCompactTranscript` (BNDR-7/BNDR-8).

**Location 2 — `src/parser/schema-lowering.ts:104-116`:**
```ts
function compareCodePoint(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const len = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < len; i += 1) {
    const ap = aPoints[i]?.codePointAt(0) ?? 0;
    const bp = bPoints[i]?.codePointAt(0) ?? 0;
    if (ap !== bp) {
      return ap - bp;
    }
  }
  return aPoints.length - bPoints.length;
}
```
Called at schema-lowering.ts:88, `compareCodePoint(a.key, b.key)`, inside `canonicalForm`'s `"object"` case. `canonicalForm` is exported and called by `canonicalHash`/`schemaSlug` (same file), which are in turn called from `src/extension/production-composition.ts:4213`, `src/extension/production-theta-producer.ts:3511`, and `src/parser/params.ts:1489`.

Diff verdict: **identical**. `diff` on the two 13-line bodies (compact-transcript.ts:223-235 vs. schema-lowering.ts:104-116) returns no output — every character matches. The two preceding doc comments are near-verbatim paraphrases of each other ("as BNDR-8's key sort requires… diverging from code-point order across the surrogate range… as the rule mandates" vs. "as the canonical form's key sort requires… which diverges from code-point order only across the surrogate range… as the spec mandates").

Not in the clone map: the shard's map reports `(no clone groups)` for `compact-transcript.ts`. A live re-run of `clone-scan.mjs map --files` against a manifest naming only these two files reproduces that absence, and a direct call to the module's own `cloneGroups()` across the whole repo (83 groups total) confirms no group's occurrences include this pair. Tokenising the exact excerpt above with `ts.createScanner` (the tool's own scanner) counts 116 tokens — well over the tool's 60-token `MIN_TOKENS` floor — so this is a scanner miss on an exact match, not a below-floor omission; found by reading, then confirmed mechanically by `diff` and by grepping the whole repo for `function compareCodePoint(` (exactly these 2 hits, no third copy) and for the distinctive `codePointAt(0) ?? 0` body fragment (same 2 files, no others).

## Why this is a problem
Both copies exist to satisfy an "ascending Unicode code-point order" requirement for two independent canonical-serialization obligations, each cited by its own file: compact-transcript.ts's comment cites BNDR-8 (binder-model-and-context.md's "canonical no-whitespace JSON serialisation… object keys in ascending Unicode code-point order"), feeding the compact-transcript's byte-exact `<args-json>` / `toolResult` rendering; schema-lowering.ts's comment cites schema-subset.md's "Canonical schema hash" step 2 ("object keys sorted by Unicode code-point"), feeding the SHA-256 schema slug used for `.thetalib` `$defs` dedup and the "Schema-slug collision posture byte-equality check." These are two separate spec documents that independently require the identical surrogate-aware code-point comparison, not one spec repeating its own vector table — so the normative-reference-vector carve-out does not apply here.

Because the comparator is reimplemented rather than shared, a fix to one copy (for example, correcting how an edge-case string — an empty string, a lone/unpaired surrogate, or an astral-plane character at the tail) compares would not reach the other copy. `tsc` gives no warning either way: both functions type-check independently regardless of whether their outputs agree. The two pipelines' definitions of "ascending Unicode code-point order" could then silently disagree on the same edge-case key: BNDR-8's compact-transcript byte-exactness reference renderings on one side, and schema-subset.md's byte-equality schema-slug-collision check on the other. Neither file's comment names the other's copy, so there is no single review checkpoint a maintainer would hit that surfaces the sibling when editing either one — unlike the `HANDLED_PROGRESS_FIELDS` pair in `execution-status/child-tap.ts`/`progress-tool.ts`, whose comments explicitly cross-reference each other as a deliberate mirror, this pair carries no such acknowledgement on either side.

## Suggested direction (non-binding, optional)
A small shared Unicode-code-point-comparison helper is the natural shared home to point at, as a hypothesis only — `schema-lowering.ts` already imports a sibling canonical-serialization helper (`renderCanonicalNumber`) from `../render/canonical-number`, so `src/render/` is one existing candidate directory; the nearest common ancestor of `src/binder/` and `src/parser/` is otherwise only `src/` itself. A human picks the actual location and whether `compact-transcript.ts`'s or `schema-lowering.ts`'s wording of the doc comment (or a third, spec-neutral one) becomes canonical.

## False-positive check
Re-read both cited spans immediately before filing (quoted verbatim above; both match the current working tree). Confirmed via `diff` that the two 13-line bodies are byte-identical, and via `ts.createScanner` that the excerpt is 116 tokens (above the clone tool's own 60-token floor), then confirmed by directly invoking the clone-scan tool's `cloneGroups()` against the whole repository that no emitted group (of 83 total) contains this pair — a genuine scanner miss, not a below-floor case, so this is filed as a clone found by reading per the D4 brief's own allowance for exactly that. Confirmed both copies are live: `compareCodePoint` (compact-transcript.ts) is reached from the exported `renderCompactTranscript` via `renderMessage` → `renderAssistant`/`renderToolResult` → `canonicalJson`; `compareCodePoint` (schema-lowering.ts) is reached from the exported `canonicalForm`/`canonicalHash`, called from `production-composition.ts:4213`, `production-theta-producer.ts:3511`, and `parser/params.ts:1489` (grep-confirmed) — neither is a dead copy (D2's territory). Grepped the whole repo for `function compareCodePoint(` and for the distinctive `codePointAt(0) ?? 0` fragment: exactly these two hits each, no third copy and no existing exported/shared version either file could have called instead. Confirmed the two doc comments cite two different spec documents (binder-model-and-context.md's BNDR-8 vs. schema-subset.md's Canonical schema hash) rather than one spec repeating a single normative vector across sites, so the carve-out for spec-anchored repeated vectors does not shield this pair. Not tests/ (both are `src/**` production files); not generated (both carry hand-written, only-lightly-divergent prose doc comments, not codegen headers). Checked the do-not-refile list and grepped `quality/resolved/` and `quality/issues/` for `compareCodePoint`, `canonicalJson`, and `canonicalForm`: no existing filing names this pair (the one incidental hit, PTQ-0067, is an unrelated stale-narration finding about `schema-lowering.ts`'s header comment).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both 13-line bodies are byte-identical (diff empty, 116 tokens > the 60-token MIN_TOKENS floor) yet clone-scan.mjs's 83 groups include neither, a genuine scanner miss reproduced directly; both copies are live in production chains (renderCompactTranscript; canonicalHash/schemaSlug at production-composition.ts:4213, production-theta-producer.ts:3511, params.ts:1489, all exact-line-verified) and anchored to two independent specs (BNDR-8 vs. schema-subset.md), so the vector-table carve-out doesn't apply; no existing PTQ tracks this pair (triage: claude-opus-5)
