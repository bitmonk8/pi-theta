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
verdict: questionable — deadness independently reproduced (recorder/stub instances confirmed unused for `.invalidate`: `recorder.` in the projection test reads only `.records`; `stubValidator` feeds only `schemaValidator:` field construction; production callers are exclusively `.compile(` at 5 sites in production-theta-producer.ts); the candidate's tests/ "sole hit" phrasing under-counts (4 more `.invalidate(` hits at hot-reload-stale-ctx-replacement.test.ts:469/635/676/744) but those are `b.harness.invalidate()` on an unrelated `StaleHarness` mock of Pi's own `ExtensionRuntime.invalidate`, not this seam, so the zero-caller substance holds; new confirming detail: `AjvSchemaValidator.#cache` is `readonly` and mutated only via `.set`/`.delete` inside `compile`/`invalidate` themselves — no staging, no swap, nothing else in src/ touches it — so the "staged … AJV validator cache" / "single synchronous publish" language at PIC-36/PIC-49 and the watcher-invalidate sentence at host-interfaces-services.md:48 and implementation-notes.md:29 describe a mechanism that has no realisation anywhere, not even outside the named member; deleting the member therefore forecloses a still-asserted spec behaviour rather than only removing cruft, which is a call for a human, not this pass. (triage: claude-opus-5)
verdict: questionable — independently re-verified every claim from scratch (interface :35-39 and impl now :411-413 after an unrelated 2026-09-09 comment-trim commit, 359d27ef, shifted it 6 lines; the rediscover context now sits near :1900 after the unrelated RFC-0010 commit added ~140 lines above, but still reuses the same closure-captured `root`/single `AjvSchemaValidator`; both test excerpts exact; `.invalidate(` = 1 unrelated comment in src/, 0 in tools/extensions/, 1 hit in tests/ which is the wrapper's own uncalled body; the 4 `hot-reload-stale-ctx-replacement.test.ts` hits are `harness.invalidate()` on a `StaleHarness` mock of Pi's own `ExtensionRunner`, confirmed unrelated; string-keyed/dynamic = 0; barrel re-export is type-only; witness suite has 0 hits; `git log -S 'invalidate(schemaSlug' -- src/` = only 8595ed6c/07bb79b6, no caller ever added) — the deadness is airtight, but host-interfaces-services.md:48's "the file watcher calls into the service's invalidate path" sentence sits above, not inside, the TS illustration that :50's GOV-18-arm-(a) disclaimer scopes to "this internal DI seam's member set", and :50 itself calls the architectural-constraints paragraph including :48 part of "the behavioural list above" it marks normative, so whether the resolution is deleting the member (requiring a spec edit to retire :48) or wiring the watcher (a behaviour change) is a spec-authority call, not a mechanical one — a human should rule. (triage: claude-opus-5)
verdict: questionable — fourth independent pass, same conclusion by a new route: every mechanical claim reproduces (line drift on impl/:1781 explained by unrelated 359d27ef comment-trim and the RFC-0010 insertion; `.invalidate(` call sites = 0 in src/tools/extensions bar one unrelated comment, and in tests/ only the wrapper's own uncalled body plus four unrelated `StaleHarness.invalidate()` calls; string-keyed/dynamic/non-TS/re-export = 0; `git log -S` scoped to src/ = only 8595ed6c/07bb79b6); tracing host-interfaces-services.md:48 itself back through `git log -S` lands on d826fae5, resolving a spec-review finding titled "Schema cache ownership is unspecified, inviting a module-level singleton" — its point was ownership (no module-level cache), not a caller mandate, and the sibling non-normative bullet at implementation-notes.md:31 concedes in the same breath that changed-file cache eviction "is an optimisation and does not affect the deterministic-validation contract", which cuts against reading :48 as a fail-closed MUST; but :48 carries no RFC-2119 modal in either direction and :50's "behavioural list above" scope over it is genuinely unsettled by text alone, so retiring :48 vs. wiring the watcher remains a spec-authority call outside this lens — a human should rule. (triage: claude-opus-5)
