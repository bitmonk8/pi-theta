---
id: PTQ-1758
title: par-for-body-return-refusal.test.ts repeats the shared registry read-or-throw sequence.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/par-for-body-return-refusal.test.ts:106-118
  - tests/par-for-body-return-refusal.test.ts:520-531
  - tests/helpers/load-row-harness.ts:153-168
  - tests/helpers/registry-oracle.ts:9-10
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# par-for-body-return-refusal.test.ts repeats the shared registry read-or-throw sequence.

## Observation
`registryMessageFor` in `tests/par-for-body-return-refusal.test.ts` reads a registry message, throws when the result is undefined, and otherwise returns the message. `tests/helpers/load-row-harness.ts` exports `registryMessageOrThrow` with the same sequence and a parameter for caller-specific failure context. This is one local reimplementation of an existing test helper: two implementations are compared below, not a repository-wide count. The local reader supplies the expected message used by the existing `(d1)` test.

## Evidence

`tests/par-for-body-return-refusal.test.ts:106-118`:

```ts
function registryMessageFor(code: string): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness precondition unmet: no registry row for ${code} on any sharded ` +
        `docs/spec_topics/diagnostics/code-registry-*.md page — the DIAG-4 Message ` +
        `column is this file's message oracle, so a missing row is a harness ` +
        `failure, never a skip. Bug 0223 §Fix route (a) owes that row (and ` +
        `inherits bug 0200's shard adjudication for where a \`par-*\` row lands).`,
    );
  }
  return template;
}
```

The canonical helper accepts the registry and caller context at `tests/helpers/load-row-harness.ts:153-157`:

```ts
export function registryMessageOrThrow(
  registry: readonly RegistryRow[],
  code: string,
  missingRowContext: string,
): string {
```

Its body at `tests/helpers/load-row-harness.ts:158-168`:

```ts
  const template = registryMessage(registry, code) as string | undefined;
  if (template === undefined) {
    throw new Error(
      `harness: the diagnostics code registry carries no Message row for ${code} — DIAG-4 ` +
        `(docs/spec_topics/diagnostics/diagnostic-shape.md) makes that column this file's only ` +
        `oracle, so a missing row is a loud harness failure, never a skip and never a ` +
        `hard-coded fallback. ${missingRowContext}`,
    );
  }
  return template;
}
```

The live local consumer at `tests/par-for-body-return-refusal.test.ts:520-531`:

```ts
    const registered = registryMessageFor(PAR_RETURN_IN_BODY);
    expect(
      registered,
      "DIAG-4: the settled Message is placeholder-free, mirroring " +
        "`par-break-continue`'s wording with `return` in place of its " +
        "`<keyword>` placeholder",
    ).toBe("'return' is not permitted inside a 'par for' body");
    expect(
      messagesFor(SRC_B, PAR_RETURN_IN_BODY),
      "DIAG-4: the emitted message is transcribed from the registry's Message " +
        "column, with no placeholder left unbound",
    ).toEqual([registered]);
```

The local-wording convention is explicit at `tests/helpers/registry-oracle.ts:9-10`:

```ts
// Readers whose assertion style and wording vary per file stay local, using
// the shared registry read.
```

## Why this is a problem
This is D7 boilerplate duplication: the lookup, undefined guard, error construction and successful return are independently implemented in the test and the shared helper. The implementations differ in their registry binding and failure prose, not in their lookup or failure policy; the shared helper already exposes registry and context parameters for those differences. The local-wording convention does not require a second implementation of the read-or-throw sequence: the file-specific bug-0223/0200 context is distinct from that sequence. The natural existing shared home is `tests/helpers/load-row-harness.ts`, whose `registryMessageOrThrow` is cited above.

## False-positive check
- Gate-pin check: the scoped file is not a gate/census test. The cited occurrence is a message reader, not a count or inventory pin.
- Recording-double check: neither compared function records calls or supplies a MUST-NOT call witness.
- docs/bugs/ signature search: `rg -n 'registryMessageFor|registryMessageOrThrow' docs/bugs --glob '*.md'` returned two hits, in bugs 0224 and 0240, both about bug 0118's reader rather than this function. Bug 0223's status is fixed (0.170.0). This filing does not call the missing-row throw a skip or challenge a documented correct-reason red.
- Coverage-matrix/bug-doc citation search: `rg -n 'par-for-body-return-refusal' docs/reference/coverage-matrix.md` returned no hits. `rg -l 'par-for-body-return-refusal' docs/bugs --glob '*.md'` returned bugs 0118, 0200, 0223, 0325, 0510 and 0515. No test, title or witness is proposed for merging, renaming or deletion; their citations remain applicable.
- Intent/history check: `git log -S 'function registryMessageFor' -- tests/par-for-body-return-refusal.test.ts` traces the reader to `3aaf74f8`; `git log -S 'export function registryMessageOrThrow' -- tests/helpers/load-row-harness.ts` traces the shared helper to the later `9e170f7b`. The registry-oracle local-wording comment is quoted rather than treated as absent.
- Duplicate check: searches for this test path through `quality/issues`, `quality/resolved` and `quality/intake` found the existing parse-deps, registry-constant, no-op checkpoint/mutator, pure-host and diagnostic-message-filter reports. PTQ-0649 concerns registry construction and explicitly leaves the local reader in place; it does not identify this later shared read-or-throw helper. PTQ-1342 and PTQ-1361 identify the read-or-throw sequence in different test files, not this occurrence.
- Coverage boundary: this finding concerns the implementation of an existing test helper only. It asserts no missing test or untested behaviour and requests no additional coverage.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce; the live registryMessageFor duplicates registryMessageOrThrow's lookup, undefined guard, throw and return, with bug-specific context already supported by its parameter. This is D7 boilerplate duplication, with no gate, recording-double or witness-removal carve-out. Resolved PTQ-0649 covers registry construction and permits a local reader, not a required inline guard; PTQ-1342/1361 fixed this same sequence in other files, so neither the local-wording comment nor dedupe blocks this occurrence. (triage: claude-opus-5-5)
