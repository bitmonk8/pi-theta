---
id: PTQ-0348
title: collectCallableClosureSources re-walks and re-hashes a shared `.theta` callee's transitive closure once per referencing caller, uncached
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:2461-2472
  - src/extension/production-composition.ts:2512-2538
  - src/extension/production-composition.ts:3728-3737
  - src/extension/production-composition.ts:3747-3802
  - src/extension/pass-parse-cache.ts:1-14
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-composition.ts#collectCallableClosureSources
wave: qw20260914130212
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# collectCallableClosureSources re-walks and re-hashes a shared `.theta` callee's transitive closure once per referencing caller, uncached

## Observation
`collectCallableClosureSources` computes a `.theta` callable's transitive-closure content (the root file plus every `.thetalib` it imports/re-exports) via a depth-first walk seeded from a function-local `seen: Set<string>` that does not survive past one call. `resolveCallableClosureHash` calls it and hashes the result with `hashCallableClosure` (a SHA-256 over the full closure content). `captureRootClosureHash` calls `resolveCallableClosureHash` once per registered theta's own root; `attachLoadTimeClosureHashes` calls it once per `.theta`-kind entry of that theta's own frozen `tools:` snapshot. Both are reached from `resolveThetaToolsAtLoad`, invoked once per discovered theta in `runComposePass`'s loop. When two or more discovered thetas name the same shared `.theta` callee in `tools:` — the reuse pattern `tools:` `.theta` entries exist to support — each theta's own call independently re-reads, re-decodes, and re-hashes that callee's entire closure from disk, because no cache keyed on the resolved absolute root path is threaded across these calls within the pass.

## Evidence
`captureRootClosureHash` (once per registered theta) calls `resolveCallableClosureHash` with no cache check:

`src/extension/production-composition.ts:2461-2472`
```ts
async function captureRootClosureHash(
  parsed: ThetaCompositionInput,
  fs: FileSystem,
  ctx: ExtensionContext,
  parseDeps: Parameters<typeof parseThetaDocument>[1],
): Promise<{ readonly name: string; readonly hash: string } | undefined> {
  if (parsed.sourcePath === undefined) {
    return undefined;
  }
  const hash = await resolveCallableClosureHash(fs, ctx, parseDeps, undefined, parsed.sourcePath);
  return hash === undefined ? undefined : { name: deriveCallableName(parsed.sourcePath), hash };
}
```

`attachLoadTimeClosureHashes` (once per `.theta`-kind `tools:` entry of each theta) calls it again per entry, unconditionally:

`src/extension/production-composition.ts:2512-2538` (the per-entry loop)
```ts
  for (const [name, entry] of entries) {
    if (entry.kind !== "theta") {
      continue;
    }
    const closureHash = await resolveCallableClosureHash(
      fs,
      ctx,
      parseDeps,
      callerPath,
      entry.calleePath,
    );
```

`resolveCallableClosureHash` delegates to a fresh walk every call:

`src/extension/production-composition.ts:3728-3737`
```ts
async function resolveCallableClosureHash(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: Parameters<typeof parseThetaDocument>[1],
  callerPath: string | undefined,
  calleePath: string,
): Promise<string | undefined> {
  const sources = await collectCallableClosureSources(fs, ctx, deps, callerPath, calleePath);
  return sources.length === 0 ? undefined : hashCallableClosure(sources);
}
```

`collectCallableClosureSources` seeds a fresh, function-local `seen` set every call and re-reads/re-decodes every member's bytes:

`src/extension/production-composition.ts:3747-3760`
```ts
async function collectCallableClosureSources(
  fs: FileSystem,
  ctx: ExtensionContext,
  deps: PassParseDeps,
  callerPath: string | undefined,
  calleePath: string,
): Promise<readonly ClosureSource[]> {
  const baseDir = callerPath !== undefined ? dirname(callerPath) : ctx.cwd;
  const rootAbs = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath);
  const sources: ClosureSource[] = [];
  const seen = new Set<string>();
  const decoder = new TextDecoder();
  const visit = async (absPath: string): Promise<void> => {
    if (seen.has(absPath)) {
```

Its own comment names the exact scenario — a closure member reached by more than one walk in the same pass — while scoping the fix to the PARSE step only:

`src/extension/production-composition.ts:3775-3780`
```ts
    sources.push({ path: absPath.replace(/\\/g, "/"), content: decoder.decode(bytes) });
    // Bug 0264: this closure walk re-parses each member on its own
    // (doc-comment above); route through the pass cache so a member already
    // parsed this pass — by the discovery walk, an importer, or another
    // closure walk — is not re-parsed and does not re-trigger `lexTheta`'s emit.
    const document = parseViaPassCache({ path: absPath, bytes }, deps);
```

Contrast: the same file's own established pattern for exactly this "reached by more than one walk in this pass" shape is a pass-scoped cache keyed by path, stated in its own module doc-comment:

`src/extension/pass-parse-cache.ts:1-14`
```ts
// Bug 0264 — a pass-scoped parse cache + delivered-diagnostic claim set.
//
// `lexTheta` hands its diagnostics to the V7d producer seam
// (`emitDiagnosticBatch`, `src/lexer/lexer.ts`) and returns them; every walk
// that calls `parseThetaDocument` on a file already parsed in this compose
// pass therefore causes a second lexer emit of the same rows. Bug 0255's
// `ThetaDocument.deliveredDiagnostics` + identity filter (untouched here,
// `src/parser/theta-document.ts`) stops a re-DELIVERY of one already-parsed
// document's rows at the ONE site that re-tests them; it cannot stop a
// re-PARSE, because a fresh `parseThetaDocument` call mints fresh `Diagnostic`
// objects — an identity filter downstream of a second parse has nothing of
// the first parse's identity left to compare against.
//
// So this module pairs two operations, neither sufficient alone:
```

## Why this is a problem
`collectCallableClosureSources`'s per-call cost is a full DFS over a `.theta` callable's transitive `.thetalib` closure: an `fs.readBytes` and a `TextDecoder.decode` per member, followed by a SHA-256 hash (`hashCallableClosure`) over the full concatenated content of every member. This cost is paid once per referencing caller within one load pass — once per registered theta that names the callee via `tools:`, and again via that theta's own `captureRootClosureHash` — even though the result is a pure function of the resolved absolute root path and the constant on-disk state: `collectCallableClosureSources`'s own recursive `visit` resolves further imports off each member's own directory, never off the original caller, so the result cannot depend on which caller asked. For K discovered thetas referencing the same shared `.theta` callable — the reuse the `tools:` `.theta`-entry mechanism exists to support — the aggregate cost is `O(K × closure size)` where `O(closure size + K)` is reachable by keying a cache on the resolved root path, the shape `parseViaPassCache` (bug 0264) and `pass-verdict-memo.ts` (bug 0276) already apply to the sibling per-callee computations (parse, structural verdict) reached from the same call sites in this file.

## Suggested direction (non-binding, optional)
One unproven hypothesis: a pass-scoped cache (e.g. `Map<string, readonly ClosureSource[]>`) keyed by the canonicalised root path, threaded alongside `passParseCache`/`passVerdictMemo` on the same `parseDeps`/`PassVerdictDeps` object, so `resolveCallableClosureHash` returns a cached result for a root already walked this pass. No claim is made about the exact cache shape beyond the fact that this file already establishes the pattern twice for sibling computations reached the same way.

## False-positive check
Searched `src/` for other callers of `resolveCallableClosureHash` / `collectCallableClosureSources` / `attachLoadTimeClosureHashes` / `captureRootClosureHash`: all four are file-private (0 external importers per the structural map), reached only from `resolveThetaToolsAtLoad` — itself called once per discovered theta in `runComposePass`'s loop, and once per `invoke`/`.theta`-callable dispatch in `parseCalleeTheta` — confirming the multi-caller-within-one-pass shape is a live production path (any `.theta` referenced by `tools:` from more than one caller theta), not a hypothetical. Checked `hashCallableClosure`'s own contract ("independent of the input array's order... a function of member CONTENT only") and `collectCallableClosureSources`'s own recursion (imports resolve off each member's own directory, never the original caller's): confirms the result cannot depend on which caller asked, so no correctness argument blocks a path-keyed memo. Checked `quality/issues/`, `quality/resolved/`, and the wave's already-filed/rejected lists for "closure", "callable-hash", "ClosureSource": the only "closure" hit (PTQ-0332) is an unrelated JS-closure-over-SDK-members finding in a different file. Not dead code: this is the load-bearing RFC-0005 subagent-callable-hash divergence check (`#subagent-theta-callable-hash`), exercised on every load pass with any `.theta`-kind `tools:` entry.

## Triage
<!-- pending -->
verdict: questionable — accounting verified: all 5 excerpts reproduce verbatim at the cited lines, independently cross-checked against `size-scan.mjs map` (identical ranges 2461-2472/2512-2538/3728-3737/3747-3802, each function unexported with 0/0 importers); `resolveThetaToolsAtLoad` calls `captureRootClosureHash` and `attachLoadTimeClosureHashes` exactly once each (lines 2247/2421), itself invoked once per theta from `runComposePass`'s loop (1035-1100) and once per dispatch from `parseCalleeTheta` (3701), with no cache anywhere in the chain — `PiFileSystem.readBytes` is a raw uncached `fs.promises.readFile`, and `pass-parse-cache.ts`'s own doc-comment confirms bug 0264 scoped its cache to the re-PARSE step only, leaving the read+hash exactly as unaddressed as claimed; `hashCallableClosure`'s documented content-only/order-independent contract plus `collectCallableClosureSources`'s own recursion (imports resolve off each member's own directory, never the caller's) confirm the digest is a pure function of the resolved root path, and `invocation.md`'s own "a `tools:` subgraph shared by more than one caller costs one judgment per distinct file" principle plus the real `pass-verdict-memo.ts` (bug 0276) precedent show a path-keyed cache would drop no spec-required behaviour; one gap found — `collectCallableClosureSources` has an uncited third direct caller, `refuseDivergedChildCallables` (1533/1565), so the false-positive check's "reached only from `resolveThetaToolsAtLoad`" slightly overstates for that one function, but this only adds further redundant calls rather than refuting the claim. Per the D8 protocol an accurate heavier-than-scale accounting rests at questionable, never confirmed, since adding the cache is a human design call (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): a pass-scoped memo, following the two sibling patterns this file already establishes (passParseCache, passVerdictMemo). Add a Map<canonical root path, readonly ClosureSource[]> (or the finished digest, whichever resolveCallableClosureHash consumes) carried on the same per-pass deps object those two ride, created once per compose pass in runComposePass and per dispatch in parseCalleeTheta exactly where the sibling caches are, and honoured inside collectCallableClosureSources / resolveCallableClosureHash so a root already walked THIS pass is not re-read or re-hashed; never shared across passes; digest byte-identical (the contract is a pure function of the resolved root path). No behaviour change; tests unchanged unless one counts fs reads (then re-pin to the new count and say so). Host-lane rule: runs after any D9 lane on production-composition.ts; if the pre-announced Seam A+C has moved these functions to theta-callee-tools-verification.ts by then, apply the same change there.
