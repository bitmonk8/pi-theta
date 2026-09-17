---
id: PTQ-0542
title: binder-param-type-projection.test.ts's dispatchRoot() retypes the e2e-s5 checkpoint/idSource/clock/AJV RuntimeRoot double
lens: D7
status: open
verdict: confirmed
locations:
  - tests/binder-param-type-projection.test.ts:581-603
  - tests/e2e-s5-binder-echo-emission.test.ts:130-143
  - tests/binder-post-merge-ajv-enforcement.test.ts:406-436
sites: 2
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# binder-param-type-projection.test.ts's dispatchRoot() retypes the e2e-s5 checkpoint/idSource/clock/AJV RuntimeRoot double

## Observation
`tests/binder-param-type-projection.test.ts` declares `dispatchRoot(): RuntimeRoot`
(cell 8, the file's one production-dispatch witness), which builds a
`checkpoint`/`idSource`/`clock`/`schemaValidator`/`fileSystem` object literal
with the schema validator constructed as `new AjvSchemaValidator({ emit: ()
=> {}, slugOf: (schema) => { const canonicalBytes = JSON.stringify(schema);
return { slug: canonicalBytes, canonicalBytes }; } })`. This is the same
`checkpoint`/`idSource`/`clock`/`schemaValidator` skeleton, with the identical
inline AJV construction, that `tests/e2e-s5-binder-echo-emission.test.ts`
declares as `rootDouble()` and that
`tests/binder-post-merge-ajv-enforcement.test.ts` declares as `rootDouble()` +
`realAjvValidator()` (filed separately as
`qw20260917154546-d7-01-binder-post-merge-e2e-s5-harness-duplicated.md`) — a
third independent typing of the same double, each adding its own
`fileSystem` arm to resolve that file's own fixture path(s).

## Evidence
`tests/binder-param-type-projection.test.ts:581-603`:
```ts
function dispatchRoot(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> =>
        path === DISPATCH_SOURCE_PATH
          ? Promise.resolve(new TextEncoder().encode(DISPATCH_THETA))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`)),
    },
  } as unknown as RuntimeRoot;
}
```

`tests/e2e-s5-binder-echo-emission.test.ts:130-143` — the identical
`checkpoint`/`idSource`/`clock`/`schemaValidator` fields and the identical
inline AJV construction, no `fileSystem` (this file drives a single
in-memory fixture that never reaches the filesystem seam):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}
```

`tests/binder-post-merge-ajv-enforcement.test.ts:406-436` — the same fields
again, the AJV construction factored into a named `realAjvValidator()` but
with the identical body, and its own `fileSystem` arm keyed on a `Map` of
five fixtures rather than one:
```ts
function realAjvValidator(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}
```

Search performed: `grep -n "new AjvSchemaValidator({" tests/binder-param-type-projection.test.ts tests/e2e-s5-binder-echo-emission.test.ts tests/binder-post-merge-ajv-enforcement.test.ts` — one hit per file (three total), each immediately followed by the identical `emit: () => {}, slugOf: (schema) => { const canonicalBytes = JSON.stringify(schema); return { slug: canonicalBytes, canonicalBytes }; }` body, confirming three independent typings rather than a shared constructor.

## Why this is a problem
The five-field `RuntimeRoot` double (`checkpoint`/`idSource`/`clock`/
`schemaValidator`/optionally `fileSystem`) with its inline
`JSON.stringify`-content-addressed `AjvSchemaValidator` is retyped
character-for-character in `dispatchRoot()` here, in `rootDouble()` in
`tests/e2e-s5-binder-echo-emission.test.ts`, and again in
`tests/binder-post-merge-ajv-enforcement.test.ts`. `tests/helpers/` holds no
module exporting this double; a change to what `RuntimeRoot`,
`AjvSchemaValidator`'s constructor options, or `SchemaSlug` require has to be
applied by hand in every site that has independently typed it.

## Suggested direction (non-binding, optional)
The same shared home named in
`qw20260917154546-d7-01-binder-post-merge-e2e-s5-harness-duplicated.md` (a
`tests/helpers/` module exporting the AJV-backed `RuntimeRoot` double with
`fileSystem` left as a caller-supplied map or resolver) would give this
file's `dispatchRoot()` the same fix point as the other two sites, rather than
a fourth hand-typed copy the next file in this lineage would add.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or the named
gate kin; the cited code is harness/fixture declaration, not a pinned count
or inventory assertion. Recording-double check: the double is a
value-returning stand-in for `RuntimeRoot`, not a call-recording "never
called" witness; the carve-out does not apply. docs/bugs/ signature search:
`grep -rn "binder-param-type-projection" docs/bugs/` shows
`docs/bugs/0251-tolerated-junk-type-text-renders-raw-into-binder-prompt.md`
naming this file as its own reproduction/witness ("Witness RED before: npx
vitest run tests/binder-param-type-projection.test.ts") — a correct-reason
citation of the file as a whole, not of this harness code as a documented
red; the file passes at HEAD. Coverage-matrix/bug-doc citation search: `grep
-n "binder-param-type-projection" docs/reference/coverage-matrix.md` returned
no hit. This finding proposes no merge, rename, or deletion of the file or any
`it()`/`describe()` — only that `dispatchRoot()`'s body be imported rather
than retyped — so the citation carve-out does not block filing. This is not a
coverage claim: the file already exists, already passes, and already
exercises its own copy of the double; the observation is about the double's
declaration being repeated across three files.

## Triage
verdict: confirmed — independently re-verified: all three excerpts match byte-for-byte at the cited lines (checkpoint/idSource/clock fields and the JSON.stringify content-addressed AJV slugOf body identical; e2e-s5 has no fileSystem arm as stated); the stated grep reproduces (one `new AjvSchemaValidator({` per file, three total); no tests/helpers module exports a checkpoint+idSource+clock+AJV(+fs) RuntimeRoot double (tool-call-dispatch-harness.rootDouble has AJV but no clock/fs, call-with-clause-harness.rootDouble has clock but no AJV, parent-producer-harness.rootDouble is unexported and AJV-less); the host's own cell-8 comment (line 543) names the lineage ("the e2e-s5 pattern of tests/binder-forced-tool-dispatch.test.ts") and git confirms e2e-s5 as origin (d23c22be 2026-07-13, post-merge copy 94e81974, this file 501f5a58 2026-08-23); all three files pass at HEAD (40/40); no gate/recording-double/witness-list carve-out applies (bugs 0251/0256 cite the file as a whole, coverage-matrix has no hit, nothing merged/renamed/deleted); no open/resolved PTQ tracks this lineage (PTQ-0226 cites this file at 481-495 for the corpus reader, a different root cause; PTQ-0209/0384/0397/0403 are other harness families) — form nit: `sites: 2` against three cited excerpts; note this is the third copy of the same-wave intake sibling d7-01 (binder-post-merge/e2e-s5, confirmed) and should be consolidated into that one helper at fix time (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
