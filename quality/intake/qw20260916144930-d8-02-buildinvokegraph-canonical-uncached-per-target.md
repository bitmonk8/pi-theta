---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: buildInvokeGraph's canonical() helper re-runs an uncached fs.realpath per invoke() target reference instead of once per distinct resolved path
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:457-471
  - src/extension/invoke-static-checks.ts:472-482
  - src/runtime/invocation.ts:135-140
  - src/extension/import-static-checks.ts:463-464
  - src/extension/import-static-checks.ts:478-491
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/invoke-static-checks.ts#buildInvokeGraph # D8 only: the exemption key, <path> or <path>#<function>
wave: qw20260916144930
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# buildInvokeGraph's canonical() helper re-runs an uncached fs.realpath per invoke() target reference instead of once per distinct resolved path

## Observation
`buildInvokeGraph` (invoke-static-checks.ts, `457-485 | 29 LOC | 1/3 importers` per the structural map) builds the per-compose-pass invoke cycle-detection graph across every discovered theta. It defines a local `canonical(path)` helper that wraps `canonicalizePath` (a bare `fs.realpath` call, `src/runtime/invocation.ts`) with no memoization, then calls that helper once per discovered theta's own source path AND once per `invoke(...)` literal target across every discovered theta's body, with no cache keyed on the resolved path in between. A sibling file in this same review shard (`import-static-checks.ts`'s `CachingThetaLibProbe`) already establishes exactly the missing cache shape — a `Map<string, string>` from resolved path to its `realpath` form, consulted before calling `canonicalizePath` again — for the analogous problem of avoiding repeat `realpath` calls within one load pass.

## Evidence
**`buildInvokeGraph`'s `canonical` helper and first loop — invoke-static-checks.ts:457-471, no cache anywhere in scope:**
```ts
export async function buildInvokeGraph(
  inputs: readonly ThetaCompositionInput[],
  fs: Pick<FileSystem, "realpath">,
): Promise<InvokeGraph> {
  const canonical = (path: string): Promise<string> =>
    canonicalizePath(fs, path).then(
      (real) => real,
      () => normalizePath(path),
    );
  const byPath = new Map<string, string>();
  for (const input of inputs) {
    if (input.sourcePath !== undefined) {
      byPath.set(await canonical(input.sourcePath), input.slashName);
    }
  }
```

**The second loop — invoke-static-checks.ts:472-482 — `canonical` called once per `invoke(...)` literal, across every discovered theta, with no target-side cache (`byPath` is a lookup keyed on the RESULT, not a memo of `canonical`'s own inputs):**
```ts
  const edges = new Map<string, string[]>();
  for (const input of inputs) {
    if (input.sourcePath === undefined) continue;
    const targets: string[] = [];
    for (const invoke of collectInvokeExprs(input.body)) {
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) continue;
      const abs = await canonical(resolveCalleeAbsolute(input.sourcePath, invoke.path));
      const targetName = byPath.get(abs);
      if (targetName !== undefined) targets.push(targetName);
    }
    edges.set(input.slashName, targets);
  }
```

**`canonicalizePath`'s own implementation, confirming no internal cache — src/runtime/invocation.ts:135-140:**
```ts
export async function canonicalizePath(
  fs: Pick<FileSystem, "realpath">,
  path: string,
): Promise<string> {
  return normalizePath(await fs.realpath(path));
}
```

**The sibling in-shard precedent this file does NOT apply here — `CachingThetaLibProbe`'s field, import-static-checks.ts:463-464:**
```ts
  /** Resolved-path string → its canonical `realpath` form, precached beside the directory listing (bug 0361). */
  private readonly canonicalCache = new Map<string, string>();
```
Its cache-check-then-populate shape, import-static-checks.ts:478-491:
```ts
    if (!this.canonicalCache.has(resolved)) {
      // `canonicalizePath` mints the on-disk-cased identity (realpath.native
      // folds case-variant DIRECTORY segments on a case-insensitive host;
      // byte-identity on a case-sensitive host). A realpath failure — the
      // file removed between readdir and here, or an in-memory FS double whose
      // realpath rejects — falls back to the joined string, the
      // pre-canonicalisation identity, so this never worsens resolution and
      // never throws. The `.then(ok, err)` arm is the sanctioned I/O-boundary
      // pattern (mirrors the readdir read below), not a broad catch.
      const canonical = await canonicalizePath(this.fs, resolved).then(
        (real) => real,
        () => resolved,
      );
      this.canonicalCache.set(resolved, canonical);
    }
```

**Data-scale citation** — docs/spec_topics/invocation.md:20 (partial quote of the "Static resolution" paragraph), the spec's own architectural principle for this exact domain (static resolution of `invoke`/`tools:` targets during a load pass):
> "...a structural judgment that consulted no visited-path member on its own branch is path-independent and is recorded once per pass and reused for a later reference to the same file with the same bytes, the same active discovery roots, and the same tool registry, so a `tools:` subgraph shared by more than one caller costs one judgment per distinct file rather than one per path that reaches it..."

## Why this is a problem
`canonical`'s only per-call cost is one `fs.realpath` round trip (`canonicalizePath`, confirmed above to hold no cache of its own). Inside one `buildInvokeGraph` call, the SECOND loop's `canonical(resolveCalleeAbsolute(input.sourcePath, invoke.path))` (line 478) is invoked once per `invoke(...)` literal across every discovered theta's body, and nothing in scope — `byPath` is keyed on canonical OUTPUT for node lookup, not on the pre-canonicalisation INPUT for reuse — prevents two `invoke(...)` literals (whether two call sites in one theta, or the same shared-utility callee invoked from two different theta files, the ordinary code-reuse shape this exact function's own job is to build a graph over) that resolve to the identical absolute path from each independently paying that round trip. This is the identical shape of gap this codebase has already recognised and remedied elsewhere: `CachingThetaLibProbe.canonicalCache`, in the sibling file this same shard reviews, exists specifically to answer "has this resolved path already been through `realpath` this pass" before calling `canonicalizePath` again — a pattern `buildInvokeGraph`'s own `canonical` closure, despite already holding a local `Map` (`byPath`) for a different purpose in the same function, does not apply to itself. The spec's own "Static resolution" paragraph (quoted above) states the general principle for this exact subsystem as "recorded once per pass and reused... a subgraph shared by more than one caller costs one judgment per distinct file rather than one per path that reaches it" — establishing that a shared target reached from more than one caller is the expected, designed-for shape in this domain, not an edge case.

## Suggested direction (non-binding, optional)
Unproven hypothesis: add a local `Map<string, string>` inside `buildInvokeGraph`, keyed on the pre-canonicalisation path string, and have `canonical` consult and populate it before calling `canonicalizePath` — the same shape `CachingThetaLibProbe.canonicalCache` already applies in the sibling file, requiring no cross-call or cross-pass plumbing since the whole fix fits within this one function's own scope.

## False-positive check
Re-read every cited range immediately before filing; excerpts match verbatim, including `canonicalizePath`'s own implementation (confirmed a bare `fs.realpath` wrapper with no cache) and `CachingThetaLibProbe`'s cache field and its consult-then-populate block. Grepped `quality/` for "buildInvokeGraph" and for "canonicalCache": no existing intake/issue/resolved filing makes this specific claim (the resolved `PTQ-0295` on this same function concerns its `unresolvable` field always being empty, a distinct D2 claim about a different part of the same function; the resolved `PTQ-0061` concerns `collectInvokeExprs`'s `export` visibility, not this caching gap). Checked the D8 durable-exemption list: neither `buildInvokeGraph` nor `invoke-static-checks.ts` is listed, so no exemption applies. Not dead code: `buildInvokeGraph` is exported and reached from exactly one production call site (`production-composition.ts:1280`, `await buildInvokeGraph(parsedInputs, fileSystem)`, over the WHOLE discovered-theta set once per compose pass) per the structural map's `1/3` importer count. `docs/spec_topics/invocation.md`'s quoted principle is offered as supporting evidence for the data-scale claim, not as a clause this filing argues against — no `challenges_spec` is set, since applying a cache here would change no observable behaviour (the same identity `canonicalizePath` already computes, computed once instead of repeatedly).

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting verified: canonical()'s two loops (invoke-static-checks.ts:457-471/472-482) and canonicalizePath's bare fs.realpath body (invocation.ts:134-139) reproduce verbatim with no cache in either; PiFileSystem.realpath (src/seams/pi-file-system.ts:117) is an uncached syscall, so nothing beneath fs.realpath memoizes either; CachingThetaLibProbe's canonicalCache field and consult-then-populate block (import-static-checks.ts:462-463/477-491) reproduce verbatim as the cited sibling precedent; production-composition.ts:1280 confirms buildInvokeGraph runs once per pass over the whole parsedInputs set and is the only production importer of its module's three (matches the cited 1/3); the invocation.md quote reproduces verbatim; no exemptions.json entry for this host; distinct from PTQ-0295 (unresolvable field) and PTQ-0061 (export visibility) on the same function, and from the sibling intake collectCallSites-redundant-walk candidate (a different root cause on overlapping lines) — per the D8 heavier-than-scale protocol an accurate accounting rests at questionable, matching the PTQ-0348/PTQ-0349 precedent (the cache shape is a design decision for human ruling) (triage: claude-opus-5)
