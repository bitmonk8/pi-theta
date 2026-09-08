---
id: PTQ-0063
title: "`BinderEnvelopeKind` in binder-envelope.ts is an exported type nothing in the repository references"
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/binder/binder-envelope.ts:39-40
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `BinderEnvelopeKind` in binder-envelope.ts is an exported type nothing in the repository references

## Observation

`binder-envelope.ts` derives and exports the type `BinderEnvelopeKind` from the
`BINDER_ENVELOPE_KINDS` tuple. No module in src/, extensions/, tools/, or
tests/ imports or names this type — not even binder-envelope.ts itself uses it
after the declaration. The envelope-schema builder in the same file hardcodes
the three `kind` tokens as `const` values in its `anyOf` arms rather than
consuming the constant or the type, and the one test that asserts the token
list imports only the constant `BINDER_ENVELOPE_KINDS`. The test harness
declares its own, unrelated `BinderEnvelopeKind` in
`tests/harness/response-program.ts` and re-exports that local declaration.

## Evidence

src/binder/binder-envelope.ts:36-40 — declaration; the type is never referenced
again in the module:

```ts
/** The three envelope arms' `kind` discriminator tokens, in schema order (BNDR-1). */
export const BINDER_ENVELOPE_KINDS = ["ok", "needs_info", "ambiguous"] as const;

/** One of the three envelope-arm discriminator tokens. */
export type BinderEnvelopeKind = (typeof BINDER_ENVELOPE_KINDS)[number];
```

Search `grep -rn "BinderEnvelopeKind" src/ extensions/ tools/ tests/
--include=*.ts` — 5 hits total: the declaration above,
tests/harness/index.ts:22, and three in tests/harness/response-program.ts.
The harness hits are a distinct local type, not an import of the src symbol —
tests/harness/response-program.ts:100:

```ts
export type BinderEnvelopeKind = "ok" | "needs_info" | "ambiguous";
```

and tests/harness/index.ts:17-29 re-exports from that file, not from
src/binder/binder-envelope:

```ts
export {
  ResponseProgrammer,
  ...
  type BinderEnvelopeKind,
  ...
} from "./response-program";
```

## Why this is a problem

Dead code, proven dead: the exported type has zero consumers across src/,
extensions/, tools/, and tests/ (including its own module), so it is not even
test-only-reachable — the witness-test carve-out does not apply. It advertises
a seam (`the envelope-arm discriminator token type`) that no code binds; the
implementation path expresses the three arms as inline `const` literals in
`buildBinderEnvelopeSchema`, and the harness re-implemented the same union
independently rather than importing this one.

## Suggested direction (non-binding, optional)

Remove the type alias (the `BINDER_ENVELOPE_KINDS` constant it derives from has
a live test consumer and can stay), or have an actual consumer adopt it if one
is wanted.

## False-positive check

- Identifier search across src/, extensions/, tools/, tests/ (`grep -rn
  "BinderEnvelopeKind" --include=*.ts`): only the declaration and the harness's
  own same-named local type (declared at tests/harness/response-program.ts:100,
  re-exported by tests/harness/index.ts from "./response-program").
- Import-path search (`grep -rn "from ['\"].*binder-envelope"` across src/,
  extensions/, tools/, tests/): every importer's named-import list checked; none
  names `BinderEnvelopeKind`.
- Re-export barrels: `grep -rn "export \*" src/` returns no export-star barrels
  anywhere in src/, so no indirect re-export path exists.
- String-keyed/dynamic access: not applicable to a type-only symbol (erased at
  compile time; cannot be reached dynamically).
- Test-only-caller check: no test references the src type, so the "tests are
  legitimate callers" protection does not apply.
- Git intent: introduced in 66db8874 (V11c-T seam declaration) together with
  `BINDER_ENVELOPE_KINDS`; the paired V11c implementation (25c513f3) hardcoded
  the `kind` consts in the schema arms and never adopted the type.

## Triage

verdict: confirmed — re-ran the hunt: `BinderEnvelopeKind` (src/binder/binder-envelope.ts:40) has exactly the 5 claimed hits and zero consumers — the 4 non-declaration hits are the harness's own structurally-declared union (tests/harness/response-program.ts:100, used at :127/:153, re-exported by tests/harness/index.ts:22 from "./response-program"), no `export *` barrels exist in any TS source, package.json declares no main/types/exports entry point, and a type-only symbol cannot be reached dynamically, so the witness-test carve-out does not apply (triage: claude-opus-5)

