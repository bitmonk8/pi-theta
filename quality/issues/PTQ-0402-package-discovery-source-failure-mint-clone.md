---
id: PTQ-0402
title: Package discovery reimplements source-failure diagnostic minting
lens: D4
status: open
verdict: confirmed
locations:
  - src/discovery/discovery-source-enumerate.ts:267-289
  - src/discovery/package-discovery.ts:85-86
  - src/discovery/package-discovery.ts:457-462
  - src/discovery/package-discovery.ts:499-515
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260917095931
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-17
---

# Package discovery reimplements source-failure diagnostic minting

## Observation
`discovery-source-enumerate.ts` exports `emitSourceFailure`, a single helper that builds the three canonical `theta/load/*-source` diagnostics for the CLI, settings, project, and global sources. `package-discovery.ts` redeclares `MISSING_SOURCE` and `UNREADABLE_SOURCE` as local constants and inlines the same message text and descriptor rendering in `thetasInDirectory` and `resolvePiThetas`.

## Evidence
`src/discovery/discovery-source-enumerate.ts:267-289` — the shared helper:

```typescript
export function emitSourceFailure(
  severity: Severity | null,
  source: DiscoverySource,
  descriptorValue: string,
  path: string,
  diagnostics: Diagnostic[],
  kind: "missing" | "unreadable" | "wrong-type",
): void {
  if (severity === null) {
    return; // conventional silent-on-missing
  }
  const descriptor = renderSourceDescriptor(source, descriptorValue);
  const code = kind === "missing" ? MISSING_SOURCE : kind === "unreadable" ? UNREADABLE_SOURCE : WRONG_TYPE_SOURCE;
  const message =
    kind === "missing"
      ? `discovery source path does not exist: ${descriptor}`
      : kind === "unreadable"
        ? `discovery source is unreadable: ${descriptor}`
        : `discovery source ${descriptor} is neither a .theta file nor a directory of them`;
  diagnostics.push({ severity, code, file: normalizePath(path), message });
}
```

`src/discovery/package-discovery.ts:85-86` — duplicated code constants:

```typescript
const MISSING_SOURCE = "theta/load/missing-source";
const UNREADABLE_SOURCE = "theta/load/unreadable-source";
```

`src/discovery/package-discovery.ts:499-515` — inline minting in `thetasInDirectory`:

```typescript
  if (!entries.ok) {
    if (entries.code === "ENOENT") {
      if (missing !== null) {
        diagnostics.push({
          severity: missing,
          code: MISSING_SOURCE,
          file: dir,
          message: `discovery source path does not exist: ${renderSourceDescriptor("package", descriptorValue)}`,
        });
      }
    } else {
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_SOURCE,
        file: dir,
        message: `discovery source is unreadable: ${renderSourceDescriptor("package", descriptorValue)}`,
      });
    }
    return out;
  }
```

`src/discovery/package-discovery.ts:457-462` — inline minting in `resolvePiThetas`:

```typescript
    diagnostics.push({
      severity: "warning",
      code: UNREADABLE_SOURCE,
      file: dir,
      message: `discovery source is unreadable: ${renderSourceDescriptor("package", pkgName)}`,
    });
```

Verdict: renamed-only / duplicated logic. The message strings and descriptor rendering match `emitSourceFailure`; only the caller-specific variable names and the shape of the `diagnostics.push` call differ.

## Why this is a problem
Clone/drift. The package source emits the same `theta/load/missing-source` and `theta/load/unreadable-source` diagnostics as the other four sources, using the same message grammar and descriptor form. If the registry text, code strings, or descriptor rendering change in `emitSourceFailure` but the package inline copies are not updated, package-discovery failures would render differently from the rest. The local constants also shadow the canonical exports from `discovery-model.ts`.

## Suggested direction (non-binding, optional)
The natural shared home is `discovery-source-enumerate.ts`, which already exports `emitSourceFailure`; `package-discovery.ts` could call it for package-source failures. If the import direction is undesirable, a neutral mint helper in `discovery-model.ts` or `discovery-path-classify.ts` would also remove the duplication.

## False-positive check
Verified `emitSourceFailure` is exported and is imported only by `discovery-walk.ts` and `discovery-source-enumerate.ts` itself; `package-discovery.ts` does not import it. The canonical `MISSING_SOURCE` / `UNREADABLE_SOURCE` strings are exported from `discovery-model.ts`; `package-discovery.ts` redeclares them locally. This is not a spec-normative vector that the spec repeats on purpose — the messages are authored once in `diagnostics/code-registry-load.md` and minted here. No tests/ are involved.

## Triage
verdict: confirmed — all four excerpts verified verbatim at the cited lines; clone-scan reports no group for package-discovery.ts (each push block is under the token floor) so the copies were diffed by hand: message templates, code strings and renderSourceDescriptor call are byte-identical to emitSourceFailure's missing/unreadable arms (renamed-only), and the helper's normalizePath(path) is idempotent on the joinPosix-built dirs so a call would be behaviour-preserving; MISSING_SOURCE/UNREADABLE_SOURCE confirmed exported from discovery-model.ts:124-125 and redeclared locally with no import; all three package copies live via thetasInDirectory (:431, :580) under exported discoverPackageThetas; no stated non-sharing rationale in either header and no cycle risk (package-discovery.ts imported only by production-composition.ts); not a spec vector table (code-registry-load.md:55-56 authors each message once); distinct from resolved PTQ-0284, which covered only the descriptor grammar and left these push blocks inline (triage: claude-fable-5-1)
verdict: confirmed — re-verified independently: all four excerpts match at the cited lines (helper at :266-289, two-line drift); clone-scan map on package-discovery.ts lists no group (under token floor) so copies were hand-diffed — missing/unreadable message templates, code strings and renderSourceDescriptor("package", …) call are identical to emitSourceFailure's two arms; MISSING_SOURCE/UNREADABLE_SOURCE exported at discovery-model.ts:124-126 yet redeclared at :85-86 with no import; both copies live (thetasInDirectory :431/:580, resolvePiThetas :598 → exported discoverPackageThetas, sole importer production-composition.ts:151); no cycle (neither source-enumerate nor model imports package-discovery); helper's normalizePath is a backslash→slash no-op on the seam's joinPosix-built dirs and matches enumerateDirectory's handling, so a call is behaviour-preserving; not a spec vector (code-registry-load.md:55-56 authors each message once); distinct from resolved PTQ-0284, whose fix imported only the descriptor renderer and left these push blocks inline (triage: claude-fable-5-1)
