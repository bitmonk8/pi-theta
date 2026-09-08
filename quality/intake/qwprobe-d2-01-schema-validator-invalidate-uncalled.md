---
id: pending
title: SchemaValidator.invalidate is a cache-invalidation entry point no code path has ever called
lens: D2
status: intake
verdict: pending
locations:
  - src/seams/schema-validator.ts:35-39
  - src/seams/schema-validator.ts:417-419
  - tests/di-seam-skeleton.test.ts:60
  - tests/invoke-return-enum-carrier-projection.test.ts:244-246
  - src/extension/production-composition.ts:1781-1786
sites: 4
fix_scope: localized
wave: qwprobe
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SchemaValidator.invalidate is a cache-invalidation entry point no code path has ever called

## Observation

The `SchemaValidator` seam interface declares an `invalidate(schemaSlug)` member
documented as the "file-watcher entry point", and `AjvSchemaValidator` implements
it as a one-line cache delete. No production, tool, or extension code calls it,
and no test invokes it either — the only test occurrences are interface-conformance
declarations (a no-op stub and a delegating wrapper method that nothing calls).
The production file-change path (hot-reload `rediscover`) reuses the same
`AjvSchemaValidator` instance across passes without invalidating anything; cache
freshness is instead guaranteed structurally, because the cache is keyed by the
content-addressed slug of the document's canonical bytes and every hit is
byte-verified before being served.

## Evidence

src/seams/schema-validator.ts:35-39 — the interface member:

```ts
export interface SchemaValidator {
  compile(schema: LoweredSchema): CompiledValidator;
  /** File-watcher entry point per the cache-invalidation rule. */
  invalidate(schemaSlug: string): void;
}
```

src/seams/schema-validator.ts:417-419 — the implementation:

```ts
  invalidate(schemaSlug: string): void {
    this.#cache.delete(schemaSlug);
  }
```

tests/di-seam-skeleton.test.ts:60 — conformance-only stub (declared, never called):

```ts
  invalidate: () => {},
```

tests/invoke-return-enum-carrier-projection.test.ts:244-246 — conformance-only
delegating method on the `RecordingSchemaValidator` test double; nothing invokes
the wrapper's `invalidate`, so the delegation body never executes:

```ts
  invalidate(schemaSlug: string): void {
    this.#inner.invalidate(schemaSlug);
  }
```

Context — the only file-watcher-driven reload wiring in production,
src/extension/production-composition.ts:1781-1786, reuses the same `root` (and
thus the same `AjvSchemaValidator` built at production-composition.ts:387) and
contains no `invalidate` call:

```ts
        rediscover: async () => {
          const pass = await runComposePass(
            pi,
            ctx,
            root,
            emitErr7,
```

Call-site searches: `\.invalidate\(` across src/ yields 0 invocations (the sole
hit is a comment at src/extension/stale-ctx.ts:5 about Pi's
`_extensionRunner.invalidate`, an unrelated host object). Across tests/ the sole
hit is tests/invoke-return-enum-carrier-projection.test.ts:245 — the delegation
body quoted above. Across tools/ and extensions/: 0 hits for `invalidate`.

## Why this is a problem

Dead code, proven dead: a public seam member and its implementation have had zero
reachable call paths across src/, extensions/, tools/, and tests/ since the member
was introduced (git: `8595ed6c` "H3a — dependency-injection seam skeleton"
introduced `invalidate(schemaSlug`; `07bb79b6` "V8c — SchemaValidator seam"
carried it; no later commit added a caller in src/). The witness suite for the
seam (tests/schema-validator-seam.test.ts) contains no occurrence of `invalidate`
at all, so this is not test-only-reachable production code — it is unreached
everywhere. The wiring the member's own doc comment anticipates ("file-watcher
entry point") never landed, and the design makes it unnecessary for correctness:
`compile` (src/seams/schema-validator.ts:390-415) keys the cache on the
content-addressed slug and byte-verifies every hit, so a changed schema document
mints different canonical bytes and can never be served a stale validator. The
member's only present-day effect is forcing every conforming test double to
declare a never-called method (the two test sites cited).

## Suggested direction (non-binding, optional)

The spec's illustration includes the member, but host-interfaces-services.md:50
states per GOV-18 arm (a) that the internal DI seam's member set "is not itself
binding". Dropping the member from the interface, the implementation, and the two
test doubles — or alternatively wiring the file watcher to it if the fix stage
concludes the behavioural sentence at host-interfaces-services.md:48 ("the file
watcher calls into the service's invalidate path") demands a live caller — is a
decision for the fix stage; either resolution removes the current state of an
entry point that nothing reaches.

## False-positive check

- Invocation search src/: grep `\.invalidate\(` over src/ — 0 call sites; the
  single textual hit is a comment (src/extension/stale-ctx.ts:5) about Pi's
  `_extensionRunner.invalidate`, a different object.
- Invocation search tests/: grep `\.invalidate\(` over tests/ — 1 hit,
  tests/invoke-return-enum-carrier-projection.test.ts:245, which is the wrapper's
  own delegation body; the wrapper method has no caller in that file or anywhere.
- Invocation search tools/ and extensions/: grep `invalidate` — 0 hits in both.
- String-keyed / dynamic access: grep `\[["']invalidate["']\]|"invalidate"|'invalidate'`
  repo-wide over source — 0 hits.
- Non-TS surfaces: grep `invalidate` over `*.js`, `*.mjs`, `*.cjs`, `*.theta`,
  `*.json` under src/, tools/, extensions/ — 0 hits.
- Witness-test check: grep `invalidate` in tests/schema-validator-seam.test.ts
  (the PIC-11 seam witness suite) — 0 hits, so tests are not callers; the two
  test occurrences cited are interface-conformance declarations only.
- Re-export check: src/seams/index.ts re-exports the `SchemaValidator` type
  (type-only barrel); no importer of the barrel or of schema-validator.ts calls
  `invalidate`.
- Spec-mandate check: host-interfaces-services.md:69 lists `invalidate` in the
  interface illustration, but :50 marks that member set non-normative per GOV-18
  arm (a); the member is not a fail-closed branch. The behavioural sentence at
  :48 describes an invalidate path for file-change invalidation, which no
  production wiring implements — noted honestly in the direction paragraph.
- Git-history intent: `git log -S 'invalidate(schemaSlug' -- src/` shows only the
  seam-skeleton introduction (8595ed6c) and the V8c implementation (07bb79b6);
  no commit ever added a caller.

## Triage
verdict: questionable — zero callers independently reproduced (`.invalidate(` in src/ = 1 unrelated comment; tools//extensions/ = 0; tests/ only the wrapper's own uncalled delegation body; string-keyed/dynamic/non-TS/re-export = 0; git shows no caller ever added), but host-interfaces-services.md:48 is a NORMATIVE "Architectural constraints" sentence ("the file watcher calls into the service's invalidate path") that the :50 non-binding disclaimer covers only for the illustration's member set, so the resolution is delete-plus-spec-change vs. wire-the-watcher (a behaviour change the D2 brief excludes) — a human should rule. (triage: claude-opus-5)
