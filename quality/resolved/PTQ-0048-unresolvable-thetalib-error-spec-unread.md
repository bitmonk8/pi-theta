---
id: PTQ-0048
title: UnresolvableThetaLibPathError stores a spec field that no catch site or test ever reads
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/imports.ts:169-176
  - src/parser/imports.ts:296-304
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# UnresolvableThetaLibPathError stores a spec field that no catch site or test ever reads

## Observation
`UnresolvableThetaLibPathError` declares a `readonly spec: string` field and
assigns it in the constructor. The one catch site for this exception,
`loadThetaLibImport`, deliberately discards the caught error (`void
resolveError`) and renders its diagnostic from the `spec` argument it already
holds — its comment states the diagnostic renders "the spec path as written
(`<path>`), not the thrown error's message". No other code reads the field: the
error's message (built from the same spec via
`unresolvableThetaLibPathMessage`) is the only channel anything consumes.

## Evidence
src/parser/imports.ts:169-176 — the stored-but-unread field:

```ts
export class UnresolvableThetaLibPathError extends Error {
  readonly spec: string;
  constructor(spec: string) {
    super(unresolvableThetaLibPathMessage(spec));
    this.name = "UnresolvableThetaLibPathError";
    this.spec = spec;
  }
}
```

src/parser/imports.ts:296-304 — the sole catch site voids the error object and
uses its own `spec` parameter instead:

```ts
  } catch (resolveError: unknown) { // allow-broad-catch: theta/load/unresolvable-thetalib-path — spec_topics/imports.md (IMP-1: the load pipeline treats *any* throw from `resolve` as a resolution failure)
    // IMP-1 mandates treating a throw from `resolve` as a resolution failure —
    // any throw, not only `UnresolvableThetaLibPathError` — so this does not
    // rethrow. The diagnostic renders the spec path as written (`<path>`), not
    // the thrown error's message.
    void resolveError;
```

Reader census: grep `UnresolvableThetaLibPathError` across src/, extensions/,
tools/, tests/ — throw sites at src/parser/imports.ts:233,238,254,257, the
class itself, and tests/imports.test.ts:10,73,96,109,121,129 (constructions and
`toThrow(...)` assertions). Grep `.spec` (word-bounded) across src/ and tests/ —
the only write is imports.ts:174; every other `.spec` hit is an unrelated
`parsed.spec` / `entry.spec` / `specA.spec` on other types; no expression reads
`spec` off an `UnresolvableThetaLibPathError` instance anywhere, tests
included.

## Why this is a problem
Vestigial field — "the value is never read" — with the mismatch visible at the
one place it could have been read: the IMP-1 catch site treats ANY throw as
unresolvable and explicitly declines to inspect the error object, so the typed
carrier the field was built for has no consumer. Git shows the field is
original V15c-T scaffolding (`git log -S 'this.spec = spec'` → single commit
`2eafe310`, "V15c-T — .warp import resolution/diagnostics failing tests") that
no later commit ever read.

## Suggested direction (non-binding, optional)
Drop the `spec` field (and its constructor assignment); the constructor
parameter still feeds the message, and the class remains a distinguishable
throw type by `name`/`instanceof` for the tests that assert it.

## False-positive check
- Field-read search: grep `\.spec\b` over src/ and tests/ — one write
  (imports.ts:174), zero reads on this class; each other hit inspected and
  attributed to unrelated types (callable-set `parsed.spec`,
  production-theta-producer `parsed.spec`, test-local spec records).
- Catch-site search: grep `UnresolvableThetaLibPathError` across src/,
  extensions/, tools/ — the only catch anywhere is loadThetaLibImport's
  broad catch (imports.ts:296), which voids the error.
- String-keyed/dynamic access: grep `["']spec["']\]` over src/ and tests/ — no
  bracket access on an error object.
- Test-only-caller check: tests construct the error (resolver doubles,
  tests/imports.test.ts:73,129) and assert `toThrow` — none reads `.spec`, so
  the FIELD is unreached even by witness tests (the class itself is alive and
  not claimed dead).
- Git-history intent: `git log -S 'this.spec = spec' -- src/parser/imports.ts`
  → single commit `2eafe310` (V15c-T); the paired implementation and later
  import-pass work (import-static-checks.ts) added five loadThetaLibImport call
  sites without ever reading the field.
- Spec-mandate check: imports.md IMP-1 (quoted at the catch site) mandates
  treating any throw as a resolution failure and rendering `<path>` from the
  spec as written — i.e., the spec text itself directs consumers AWAY from the
  error object's contents; no spec text requires the field.

## Triage
verdict: confirmed — reverified: `.spec` on this class has exactly one write (imports.ts:174) and zero reads repo-wide; sole catch site voids the error (`void resolveError`, :303), import-static-checks's 6 `loadThetaLibImport` calls never name the class, tests only `toThrow`/construct, no bracket or destructured access, and imports.md IMP-1 mandates only the throw — sibling `ThetaFnArityError` stores nothing, so the field is a one-off vestige (triage: claude-opus-5)
