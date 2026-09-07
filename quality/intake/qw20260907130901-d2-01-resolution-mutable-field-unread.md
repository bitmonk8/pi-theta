---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: Resolution.mutable is populated on every local resolve but read by no code anywhere
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/lexical-environment.ts:83-88
  - src/runtime/lexical-environment.ts:596-603
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Resolution.mutable is populated on every local resolve but read by no code anywhere

## Observation
The runtime `Resolution` record (the outcome of `LexicalEnvironment.resolve`)
declares an optional `mutable` field, and `resolve()`'s local arm copies
`slot.mutable` into it on every local-binding hit. No consumer reads
`Resolution.mutable`: every `resolve(...)` caller in src reads only `.arm`,
`.value`, `.fn`, or `.moduleEnv`, and mutability enforcement is performed
inside `writeBinding` against the slot itself, not against a `Resolution`.

## Evidence
src/runtime/lexical-environment.ts:83-88 (declaration):
```ts
export interface Resolution {
  readonly arm: ResolutionArm;
  /** The bound value — present for a `local` read. */
  readonly value?: ThetaValue;
  /** Whether a `local` slot was declared `let mut`. */
  readonly mutable?: boolean;
```

src/runtime/lexical-environment.ts:596-603 (the only construction that sets it):
```ts
  public resolve(name: string): Resolution {
    // 1. local `let` / parameter — a local binding shadows all outer scopes.
    for (let env: LexicalEnvironment | null = this; env !== null; env = env.parent) {
      const slot = env.locals.get(name);
      if (slot !== undefined) {
        return { arm: "local", value: slot.value, mutable: slot.mutable };
      }
    }
```

Consumers of `resolve(...)` and the fields they read: `src/runtime/statement-executor.ts:434-435`
(`.arm`, `.fn`), `:1150` (`.arm`), `:2138` (`.value`);
`src/extension/production-theta-producer.ts:7924-7925` (`.arm`, `.value`),
`:7949` (`.arm`), `:7982-7985` (`.arm`, `.fn`);
`src/runtime/lexical-environment.ts:842-844` (`ThetaEvalHost`: `.arm`, `.value`).
Search `\.mutable\b` across src/, tests/, extensions/, tools/: every hit is
`slot.mutable` (`LocalSlot`, lexical-environment.ts:560, :601), AST-node
`stmt.mutable`/`s.mutable` (statement-executor.ts:2121,
production-theta-producer.ts:8174, theta-document.ts:9053), or the parser-side
`reassign.mutable` (parser/bindings.ts:89) — zero reads on a `Resolution`.

## Why this is a problem
Dead (write-only) field: the value is minted on every local identifier
resolution and provably consumed nowhere — not in src, not in tests, not in
extensions/ or tools/. The behaviour the field advertises (slot mutability,
bindings.md cka-6) is owned entirely by `writeBinding`
(lexical-environment.ts:556-583), which checks `slot.mutable` at the slot
layer; the `Resolution` copy duplicates that fact into a record no reader
consults, so the field and its construction are cruft.

## Suggested direction (non-binding, optional)
Drop the `mutable` member from `Resolution` and the `mutable: slot.mutable`
copy in `resolve()`'s local arm; mutability stays observable through
`writeBinding`'s accept/reject outcome, which is where every current check
already lives.

## False-positive check
- Identifier search: `\.mutable\b` grepped across src/, tests/, extensions/,
  tools/ — all hits enumerated above; none is a `Resolution` read.
- Destructuring/dynamic access: searched `{ ... mutable ... } =` destructuring
  patterns and `["mutable"]` bracket access across src/ and tests/ — zero hits.
- Test-only-caller rule: not applicable in the protective direction — even
  tests never read the field. tests/lexical-environment.test.ts greps for
  `mutable` show only prose and `writeBinding`/`resolve().value` assertions
  (lines 207-212), no `Resolution.mutable` read.
- Serialization: `Resolution` objects are never JSON-serialized or spread into
  wire payloads (no `JSON.stringify` of a resolve result found), so no
  string-keyed consumer exists.
- History intent: the V19b-T header (lines 33-46) declared the seam shape with
  the "arm-labelled Resolution"; the paired implementation put rejection at the
  scope layer (`writeBinding`, cka-6), leaving the `Resolution` copy unread.

## Triage
