---
id: PTQ-0878
title: envelope() in inline-object-stray-close-token-split.test.ts is byte-identical to a copy in inline-object-keyless-entry-refusal.test.ts with no shared home
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-object-stray-close-token-split.test.ts:360-365
  - tests/inline-object-keyless-entry-refusal.test.ts:794-799
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# envelope() in inline-object-stray-close-token-split.test.ts is byte-identical to a copy in inline-object-keyless-entry-refusal.test.ts with no shared home

## Observation
`tests/inline-object-stray-close-token-split.test.ts` declares a local
`envelope(slug: string, defs: string): string` that hand-builds the
`params:` JSON Schema envelope string around a hoisted `p` property
(`schema-subset.md:73`'s `$ref`-to-`$defs` shape), used as the expected value
in this file's `loweredParams` byte-comparison cells. The same five-statement
function body — same template-literal split across two lines, same
placeholder positions for `slug` and `defs` — is independently declared, with
no shared import, in `tests/inline-object-keyless-entry-refusal.test.ts`.

## Evidence

`tests/inline-object-stray-close-token-split.test.ts:360-365` (re-read
immediately before filing):
```ts
function envelope(slug: string, defs: string): string {
  return (
    `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_${slug}"}},` +
    `"required":["p"],"additionalProperties":false,"$defs":{${defs}}}`
  );
}
```

`tests/inline-object-keyless-entry-refusal.test.ts:794-799` — byte-identical
(re-read immediately before filing; `diff` of the two six-line spans is
empty):
```ts
function envelope(slug: string, defs: string): string {
  return (
    `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_${slug}"}},` +
    `"required":["p"],"additionalProperties":false,"$defs":{${defs}}}`
  );
}
```

Exact search: `grep -rl "^function envelope(slug: string, defs: string): string {$" tests/*.test.ts` returns exactly these two files, and no other `tests/*.test.ts` file or `tests/helpers/*.ts` module declares a function of this name and signature.

## Why this is a problem
`envelope()` is a fixture-construction helper — a hand-written re-derivation of the exact JSON Schema envelope bytes `hoistInlineObjectType`/`lowerParamsFieldType` are expected to produce for a `params:` field — used purely as harness plumbing to build expected-value strings for `toEqual` comparisons. It carries no bug-specific logic (the placeholder shape, the property name `p`, and the `$defs` wrapping are the same fixed structure regardless of which bug's cells consume it), yet it is retyped byte-for-byte in a second file instead of imported once, so any future change to the shape those envelope strings encode (e.g. an ordering or key change in the hoisted `params:` envelope) requires an identical hand-edit in both files.

## Suggested direction (non-binding, optional)
`envelope()` (and its file-local companion `def()`, which builds one `$defs` entry's fragment body and appears only in the file under review today) are small, pure, string-building helpers with no per-file variation in body; a `tests/helpers/` export used by both files removes the duplicate declaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `envelope()` builds a plain string from its arguments; it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "inline-object-stray-close-token-split\|inline-object-keyless-entry-refusal" docs/bugs/*.md` finds both files cited in several bug documents (0238, 0244, 0256, 0257, and others) as witness files by name and cell id; none of those citations names or depends on the internal shape of `envelope()`, and no citation states a rationale for the function's independent redeclaration.
- coverage-matrix/bug-doc citation search: `grep -n "inline-object-stray-close-token-split\|inline-object-keyless-entry-refusal" docs/reference/coverage-matrix.md` returns 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` block — only that the shared string-building helper could be imported once.
- Coverage check: the claim is entirely about a repeated function DEFINITION, not a missing test path; each copy is exercised by the `loweredParams`/lowering-comparison cells already running in its own file.
- Prior-filing overlap check: `grep -rl "function envelope(slug" quality/intake/*.md quality/issues/*.md quality/resolved/*.md` returns no hits before this filing; PTQ-0596 and PTQ-0555 (the `Cell`/`expectGroup` and `FM`/`theta`/`paramsSrc` bundles that also touch these two files) name a disjoint set of functions and do not mention `envelope`/`def`.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce at tests/inline-object-stray-close-token-split.test.ts:360-365 and tests/inline-object-keyless-entry-refusal.test.ts:794-799, sed-extracted spans diff to empty, both copies live (6 and 3 `envelope(` call sites respectively), `grep -rln '^function envelope(slug: string, defs: string): string {$' tests/` → exactly these two files and no tests/helpers/ export of it (the four other files carrying the `"p":{"$ref":"#/$defs/__inline_` shape inline it as string literals, not as this helper, so sites: 2 is accurate); D7 boilerplate/copy-paste-fixture class, both locations under tests/, neither file is a gate, 0 coverage-matrix hits, docs/bugs cite the files as witnesses (5 docs) but none names `envelope()` and no merge/rename/delete is proposed; PTQ-0596/0555/0751/0475 name disjoint helpers (Cell/expectGroup, FM/theta/paramsSrc, fixture/diag harness, registry read) and none mentions envelope/def — stray `d4_class: clone` field on a D7 filing is extraneous but non-blocking (triage: claude-fable-5-1)
