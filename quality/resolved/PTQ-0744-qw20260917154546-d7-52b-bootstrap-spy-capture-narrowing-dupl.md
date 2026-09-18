---
id: PTQ-0744
title: captureConsoleError/captureStderr/noteDiagnostics/requireHandler duplicated byte-identically between extension-bootstrap-production-wiring.test.ts and extension-bootstrap-sink-liveness.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/extension-bootstrap-production-wiring.test.ts:215-224
  - tests/extension-bootstrap-production-wiring.test.ts:236-244
  - tests/extension-bootstrap-production-wiring.test.ts:246-265
  - tests/extension-bootstrap-sink-liveness.test.ts:113-122
  - tests/extension-bootstrap-sink-liveness.test.ts:124-143
  - tests/extension-bootstrap-sink-liveness.test.ts:348-356
sites: 6
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# captureConsoleError/captureStderr/noteDiagnostics/requireHandler duplicated byte-identically between extension-bootstrap-production-wiring.test.ts and extension-bootstrap-sink-liveness.test.ts

## Observation
`tests/extension-bootstrap-production-wiring.test.ts` and `tests/extension-bootstrap-sink-liveness.test.ts` each declare a `noteDiagnostics(note)` array-narrowing helper, a `captureConsoleError()` console-error spy-capture helper, a `captureStderr()` stderr-write spy-capture helper, and a `requireHandler(host, event)` loud-lookup helper, with byte-identical bodies (only the `host` parameter's local interface name differs: `RecordingHost` vs `HostDouble`, both shaped `{ handlers: Map<string, PiHandler> }`).

## Evidence
`tests/extension-bootstrap-production-wiring.test.ts:215-224`:
```ts
function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}
```

`tests/extension-bootstrap-sink-liveness.test.ts:113-122`:
```ts
function noteDiagnostics(note: RecordedNote): readonly Diagnostic[] {
  const details = note.details as { diagnostics?: unknown } | undefined;
  const diagnostics = details?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    expect.fail(
      `system note carries no details.diagnostics array: ${JSON.stringify(note.details)}`,
    );
  }
  return diagnostics as readonly Diagnostic[];
}
```

`tests/extension-bootstrap-production-wiring.test.ts:246-265`:
```ts
/** Spy `console.error`, returning its accumulating argument log. */
function captureConsoleError(): unknown[][] {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]): void => {
    calls.push(args);
  });
  return calls;
}

/** Spy `process.stderr.write`, returning its accumulating chunk log. */
function captureStderr(): string[] {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array): boolean => {
      chunks.push(String(chunk));
      return true;
    },
  );
  return chunks;
}
```

`tests/extension-bootstrap-sink-liveness.test.ts:124-143` reproduces the same two functions character-for-character (verified via `grep -n` below).

`tests/extension-bootstrap-production-wiring.test.ts:236-244`:
```ts
function requireHandler(host: RecordingHost, event: string): PiHandler {
  const handler = host.handlers.get(event);
  if (handler === undefined) {
    expect.fail(
      `the factory installed no '${event}' subscription (installed: ${[...host.handlers.keys()].join(", ") || "none"})`,
    );
  }
  return handler;
}
```

`tests/extension-bootstrap-sink-liveness.test.ts:348-356`:
```ts
function requireHandler(host: HostDouble, event: string): PiHandler {
  const handler = host.handlers.get(event);
  if (handler === undefined) {
    expect.fail(
      `the factory installed no '${event}' subscription (installed: ${[...host.handlers.keys()].join(", ") || "none"})`,
    );
  }
  return handler;
}
```

Search: `grep -n "function captureConsoleError\|function captureStderr\|function requireHandler\|function noteDiagnostics" tests/extension-bootstrap-*.test.ts` returns exactly these two files, one declaration of each function per file (8 declarations total across the two files; the two `noteDiagnostics` plus two `captureConsoleError` plus two `captureStderr` plus two `requireHandler` = the 4 duplicated helpers × 2 files = 8 declarations, cited above as 6 location ranges since `captureConsoleError`/`captureStderr` are adjacent in each file).

## Why this is a problem
Four small test-harness helpers — a details-array narrowing helper, two Vitest spy-capture wrappers, and a handler-lookup guard — are retyped character-for-character in a second file instead of living once. `tests/helpers/` already hosts comparably small single-purpose modules (e.g. `fake-clock.ts`), which is the kind of home this cluster of four helpers would naturally sit in.

## Suggested direction (non-binding, optional)
A shared module under `tests/helpers/` (or `tests/harness/`) exporting `captureConsoleError`, `captureStderr`, `noteDiagnostics` (generic over a `{ details: unknown }` note shape) and `requireHandler` (generic over `{ handlers: Map<string, H> }`) would let both files import the same four declarations instead of retyping them.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kinds; not applicable.
- Recording-double check: `requireHandler`/`noteDiagnostics` are loud-lookup/narrowing helpers over already-recorded state, not themselves the recording double that performs a MUST-NOT witness; `captureConsoleError`/`captureStderr` are generic Vitest spy wrappers with no assertion inside them. The duplication claim is about the helper code itself, not about a legitimate negative-witness pattern.
- docs/bugs/ signature search: `grep -rn "extension-bootstrap-production-wiring\|extension-bootstrap-sink-liveness" docs/bugs/*.md` shows both files cited in docs/bugs/0023 (production wiring) and docs/bugs/0255 / docs/bugs/0323 (sink-liveness) as separate witness suites for distinct obligations (the production default-export wiring vs. the two-tier sink/ProbeHost seam) — none of those citations pin the four low-level spy/narrowing helper bodies as required to diverge; this finding does not propose merging, renaming or deleting either test file or suite.
- coverage-matrix citation search: `grep -n "extension-bootstrap-production-wiring\|extension-bootstrap-sink-liveness" docs/reference/coverage-matrix.md` returned no hits — neither file is pinned by name there.
- This is not a coverage claim: both files' behavioural assertions and their distinct fixture/host doubles (`RecordingHost` vs `HostDouble`, which differ beyond the shared four helpers) are untouched by this finding; only the four duplicated non-assertion declarations are cited.

## Triage
verdict: confirmed — independently re-verified: all six excerpts reproduce at the cited lines and mktemp diffs show noteDiagnostics (215-224 vs 113-122) and captureConsoleError/captureStderr (246-265 vs 124-143) byte-identical with requireHandler (236-244 vs 348-356) differing only in the host type name (RecordingHost vs HostDouble, both `readonly handlers: Map<string, PiHandler>`); all four are live (21 / 25 call sites), neither file is a gate test, neither is named in docs/reference/coverage-matrix.md (0 hits), docs/bugs/0023/0255/0323 cite the files as witness suites without pinning the helper bodies, and no tracked issue lists either bootstrap file in its locations (PTQ-0230/0267/0300 grep 0 for extension-bootstrap) — the candidate's only gap is that noteDiagnostics is ALREADY exported from tests/helpers/compose-workspace-harness.ts:164 (PTQ-0230's landed fix), which strengthens the duplication anchor rather than refuting it; matches this store's confirmed per-occurrence D7 boilerplate-duplication precedent (PTQ-0230/0267/0300) (triage: claude-fable-5-1)
