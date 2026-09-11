---
id: PTQ-0210
title: The fake-host `runProductionLoad` stderr-mirror load harness is duplicated byte-for-byte across five test files
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/arg-mismatch-diagnostic-count-by-surface.test.ts:701-710
  - tests/invoke-arg-type-mismatch-wired.test.ts:469-478
  - tests/division-result-type-number-invoke.test.ts:231-240
  - tests/invoke-arg-array-literal-provable.test.ts:415-424
  - tests/modulo-zero-result-type-number.test.ts:1830-1839
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# The fake-host `runProductionLoad` stderr-mirror load harness is duplicated byte-for-byte across five test files

## Observation
`tests/arg-mismatch-diagnostic-count-by-surface.test.ts` defines a private
`async function runProductionLoad(cwd): Promise<LoadOutcome>` (lines 675-721)
that builds a fake `ExtensionAPI`/`ExtensionContext` pair sized to
`discoverAndComposeFixtures`, monkey-patches `process.stderr.write` to capture
`makeLoadEmit`'s rendered diagnostic lines around one
`discoverAndComposeFixtures` call, restores the handle in a `.finally`, and
reshapes the result into a `{registered, notifications, diagnosticLines}`
record. The same function — same variable names, same `LoadOutcome` field
names, same six-method `pi` object, same stderr interposition, same reshape —
recurs in four sibling files. One of the four states outright that it was
copied: `tests/division-result-type-number-invoke.test.ts:197` reads "The
fake host `pi` / `ctx`, and the load outcome — copied SHAPE from
tests/invoke-arg-type-mismatch-wired.test.ts."

## Evidence
tests/arg-mismatch-diagnostic-count-by-surface.test.ts:701-710:
```ts
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });
```

tests/invoke-arg-type-mismatch-wired.test.ts:469-478 (byte-identical):
```ts
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });
```

tests/division-result-type-number-invoke.test.ts:231-240 (byte-identical):
```ts
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });
```

tests/invoke-arg-array-literal-provable.test.ts:415-424 (byte-identical):
```ts
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });
```

tests/modulo-zero-result-type-number.test.ts:1830-1839 (byte-identical):
```ts
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  const fixtures: readonly ThetaFixture[] = await discoverAndComposeFixtures(
    pi,
    ctx,
  ).finally(() => {
    process.stderr.write = write;
  });
```

The interposition sits inside a larger duplicated function: the six-method
fake `pi` object at tests/arg-mismatch-diagnostic-count-by-surface.test.ts:678-685 —
```ts
  const pi = {
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    sendMessage: (): void => {},
    sendUserMessage: (): void => {},
    getActiveTools: (): readonly string[] => [],
    setActiveTools: (): void => {},
  } as unknown as ExtensionAPI;
```
reproduces verbatim at tests/invoke-arg-type-mismatch-wired.test.ts:446-453,
tests/division-result-type-number-invoke.test.ts:213-220,
tests/invoke-arg-array-literal-provable.test.ts:392-399, and
tests/modulo-zero-result-type-number.test.ts:1812-1819. The `interface
LoadOutcome { registered; notifications; diagnosticLines }` header and the
surrounding `beforeAll` suffix-collision guard ("No planted stem may be a
suffix of another…" / "No stem may be a suffix of another…") also recur, at
tests/arg-mismatch-diagnostic-count-by-surface.test.ts:665,724;
tests/invoke-arg-type-mismatch-wired.test.ts:425,492;
tests/division-result-type-number-invoke.test.ts:201,254;
tests/invoke-arg-array-literal-provable.test.ts:372,438; and
tests/modulo-zero-result-type-number.test.ts:1800,1853.

Search: `grep -n "process.stderr.write = ((chunk: unknown): boolean =>" tests/*.ts`
returns exactly these 5 hits and no others.

## Why this is a problem
One harness — a fake `ExtensionAPI`/`ExtensionContext` pair, a
`process.stderr.write` interposition to read `makeLoadEmit`'s no-UI mirror,
and a `{registered, notifications, diagnosticLines}` reshape — is copied
whole into five files rather than drawn from one place; `tests/helpers/`
already holds this repository's shared-double convention (`fake-clock.ts`,
`fake-file-system.ts`, `fake-json-child.ts`, `call-with-clause-harness.ts`,
…) but none of its files construct this fake host or this interposition. The
five copies were not made at once: `tests/invoke-arg-type-mismatch-wired.test.ts`
(added v0.78.0) is the oldest, and bug 0207 (fixed v0.137.0) later had to
hand-correct a false "shipped composition root" attribution inside this same
harness's `LoadOutcome` docstring in that file, among thirteen further files
elsewhere in the suite carrying the same harness family. Three of the four
sibling copies here — `tests/modulo-zero-result-type-number.test.ts`
(v0.187.0), `tests/invoke-arg-array-literal-provable.test.ts` (v0.228.0) and
`tests/arg-mismatch-diagnostic-count-by-surface.test.ts` (v0.246.0) — were
added after that correction by copying the harness forward again (the fourth,
`tests/division-result-type-number-invoke.test.ts` at v0.80.0, predates the
correction and names its own copy source directly). Each of the five remains
a site where a correction touching this shape needs to be re-applied by hand
rather than fixed once.

## Suggested direction (non-binding, optional)
`tests/helpers/` is this repository's home for shared fakes and harnesses; a
`runProductionLoad`-shaped helper living there is the home this five-way copy
already points at (one copy names its own source file as "copied SHAPE
from").

## False-positive check
- Gate-pin check: none of the five files match `*gate*.test.ts` or the named
  gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `notifications`/`chunks` are ordinary recording
  arrays used to assert presence of output, not a MUST-NOT-called witness;
  this finding is about the harness construction being copied, not about the
  soundness of what it records.
- docs/bugs/ signature search: `grep -rl "runProductionLoad" docs/bugs/*.md`
  hits 0183 and 0207, both status **fixed**, both about comment wording (the
  false "shipped composition root" attribution) in files carrying this
  harness family, not about the code shape duplicated here; neither
  documents a correct-reason red for any of the five files, and the in-scope
  file is fully green (`vitest run tests/arg-mismatch-diagnostic-count-by-surface.test.ts`:
  98/98 passing).
- coverage-matrix / bug-doc citation search: none of the five file names
  appear in `docs/reference/coverage-matrix.md`; the five files are cited by
  name inside several `docs/bugs/*.md` witness/reproduction sections (0137,
  0142, 0146, 0147, 0152), but this finding does not propose merging,
  renaming or deleting any test — only that an internal helper function is
  currently copied five times — so no citation is disturbed.
- Scope: only `tests/arg-mismatch-diagnostic-count-by-surface.test.ts` is in
  this wave's review scope; the other four files are cited solely as
  duplication evidence and were not otherwise reviewed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all 5 sites' line-cites verified exact and the runProductionLoad bodies diff byte-identical (mod comments); git log confirms the candidate's addition-order/bug-0207 timeline exactly, and D7 copy-paste-double/boilerplate scope plus every false-positive carve-out (gate-pin, coverage-matrix, docs/bugs status) independently check out (triage: claude-opus-5)
