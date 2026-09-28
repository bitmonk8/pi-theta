---
id: pending
title: One compose pass decides "same file" two ways — realpath-canonical (`canonicalizePath`: INV-1 containment, `buildInvokeGraph`, the `.thetalib` resolver, `tools:` matching) and separator-normalised `path.resolve` output (`PassParseCache`, `PassVerdictMemo`, the closure caches) — and the one pass parse cache receives both keyings for one file while its sibling's header calls it "the realpath-keyed parse cache"
lens: D1
status: intake
verdict: pending
locations:
  - src/extension/pass-parse-cache.ts:48-56
  - src/extension/pass-parse-cache.ts:103-108
  - src/extension/pass-verdict-memo.ts:202-210
  - src/extension/invoke-static-checks.ts:304-310
  - src/extension/invoke-static-checks.ts:331-337
  - src/extension/invoke-static-checks.ts:348-356
  - src/extension/invoke-expr-call-surface.ts:193-262
  - src/extension/callee-load-parse.ts:15-22
  - src/extension/import-resolution-kit.ts:90-94
  - src/extension/import-resolution-kit.ts:417
  - src/parser/thetalib-resolver.ts:113-119
  - src/extension/production-composition.ts:4736-4759
  - src/runtime/invocation.ts:121-135
sites: 13
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# One compose pass decides "same file" two ways — realpath-canonical (`canonicalizePath`: INV-1 containment, `buildInvokeGraph`, the `.thetalib` resolver, `tools:` matching) and separator-normalised `path.resolve` output (`PassParseCache`, `PassVerdictMemo`, the closure caches) — and the one pass parse cache receives both keyings for one file while its sibling's header calls it "the realpath-keyed parse cache"

## Observation
Within one `composeExtensionInstance` pass, several consumers must answer "do these two path spellings name the same file?". One family answers with `canonicalizePath` (`normalizePath(await fs.realpath(path))`): the INV-1 containment check, `buildInvokeGraph` (since bug 0362), the `.thetalib` resolver boundary (since bug 0361) and the `tools:`-entry-to-discovered-theta match. The other family answers with `normalizePath(path.resolve(...))` — separator rewrite only, no `realpath`: `PassParseCache.parse` keys by `normaliseCacheKey(input.path)`, `PassVerdictMemo` keys by the same helper under the alias `normaliseVerdictKey`, and the closure caches key by `rootAbs.replace(/\\/g, "/")`. The one `PassParseCache` instance is fed by seven production call sites: six pass a `path.resolve`/discovery spelling (way S), one — the import walk — passes the resolver's already-`realpath`ed spelling (way R). `invoke-static-checks.ts` contains both ways in one file (`resolveCalleeAbsolute` feeding `resolveCalleeArity` → the pass cache; `buildInvokeGraph` canonicalising) and its `buildInvokeGraph` header describes the parse cache as "realpath-keyed", as does `canonicalizePath`'s own header.

## Evidence

**Way S — the pass-scoped cache family keys by separator-normalised `path.resolve` output.**

src/extension/pass-parse-cache.ts:48-56 and :103-108 (re-read before filing):
```ts
import { normalizePath as normaliseCacheKey } from "../normalize-path";
...
/** Separator-normalise an absolute path so a Win32 and a POSIX spelling key together. */
export { normaliseCacheKey };
...
    parse(input, deps) {
      const key = normaliseCacheKey(input.path);
      const cached = byPath.get(key);
      if (cached !== undefined && bytesEqual(cached.bytes, input.bytes)) {
        return cached.document;
      }
```
Its header (pass-parse-cache.ts:14-17) states the purpose the key serves: "`parse` memoises `parseThetaDocument` for one pass, keyed by the separator-normalised absolute path, so a file already parsed this pass is returned from cache and `lexTheta` never re-emits for it (route 1 fires once by construction)".

src/extension/pass-verdict-memo.ts:202 and :210 (same helper, aliased):
```ts
      const entry = store.get(normaliseVerdictKey(absolutePath));
...
      store.set(normaliseVerdictKey(absolutePath), {
```

The S-spelling producers into the pass cache. src/extension/invoke-static-checks.ts:304-310:
```ts
/** Resolve an `invoke` path literal to a forward-slash-normalised absolute path. */
function resolveCalleeAbsolute(callerPath: string, literalPath: string): string {
  const baseDir = dirname(callerPath);
  const absolute = isAbsolute(literalPath)
    ? literalPath
    : resolvePath(baseDir, literalPath);
  return normalizePath(absolute);
```
src/extension/invoke-expr-call-surface.ts:193 and :262 hand that spelling to the arity resolver:
```ts
    const resolvedPath = resolveCalleeAbsolute(callerPath, invoke.path);
...
    const arity = await deps.resolveCalleeArity(resolvedPath);
```
which production-composition.ts:1893-1894 wires to `resolveCalleeArity(fileSystem, absolutePath, parseDeps)` → `readCalleeDocument`. src/extension/callee-load-parse.ts:15-22:
```ts
  const bytes = await readThetaBytes(fs, absolutePath);
  if (bytes === undefined) {
    return undefined;
  }
  // Bug 0264: route through the pass-scoped cache — this callee may already
  // have been parsed this pass (a discovered theta, or another `.theta`-callable
  // arity check reaching the same file).
  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
```
src/extension/production-composition.ts:4736-4759 (the callable-closure walk, `visit(absPath)` where `absPath` is `rootAbs` from `resolveCallableClosurePath` — `path.resolve` output — and each member's `path.resolve`d import):
```ts
  const visit = async (absPath: string): Promise<void> => {
    if (seen.has(absPath)) {
      return;
    }
    seen.add(absPath);
    const bytes = await fs.readBytes(absPath).then(
...
    const document = parseViaPassCache({ path: absPath, bytes }, deps);
```

**Way R — the sibling consumers key by `realpath` identity.**

src/runtime/invocation.ts:121-135 (the helper and its own contract):
```ts
/**
 * The single canonical `realpath`-then-forward-slash path form (invocation.md
 * §Resolution): `realpath`-normalise the host path, then forward-slash-normalise
 * per the Lexical "Path literals" rule; no independent case-folding — the
 * canonical form is whatever `realpath` returns on the host. This is the one
 * function that mints the canonical path identity the containment check, the
 * static-resolution per-pass parse cache key, and the `.thetalib` import-edge-graph
 * node identity all compare under; consumers reuse it rather than restating it.
 */
export async function canonicalizePath(
  fs: Pick<FileSystem, "realpath">,
  path: string,
): Promise<string> {
  return normalizePath(await fs.realpath(path));
}
```
src/extension/invoke-static-checks.ts:348-356 (`buildInvokeGraph`, same file as `resolveCalleeAbsolute`):
```ts
  inputs: readonly ThetaCompositionInput[],
  fs: Pick<FileSystem, "realpath">,
): Promise<InvokeGraph> {
  const canonical = (path: string): Promise<string> =>
    canonicalizePath(fs, path).then(
      (real) => real,
      () => normalizePath(path),
    );
  const byPath = new Map<string, string>();
```
src/parser/thetalib-resolver.ts:113-119 (the import resolver returns the `realpath`ed spelling):
```ts
    // Canonicalise once at the resolver boundary (bug 0361): IMP-1's
    // byte-exact FINAL-segment match already ran above, so a case-variant
    // final segment is still rejected — this only folds a case-variant
    // DIRECTORY segment (`../LIBS/` for on-disk `libs/`) to the on-disk
    // spelling, so every downstream key compares under one identity. Identity
    // on a case-sensitive host (`realpath.native` preserves byte identity).
    return this.probe.canonicalize(resolved);
```
src/extension/import-resolution-kit.ts:90-94 (the probe mints it via `canonicalizePath`) and :417 (that R spelling is what the import walk feeds into the SAME pass cache):
```ts
      const canonical = await canonicalizePath(this.fs, resolved).then(
        (real) => real,
        () => resolved,
      );
      this.canonicalCache.set(resolved, canonical);
...
          document: parseViaPassCache({ path: resolvedPath, bytes }, deps.parseDeps),
```

**The misread, already present in production code.** src/extension/invoke-static-checks.ts:331-337 (the `buildInvokeGraph` header):
```
 * Both the node keys and the resolved edge callees are minted through
 * `canonicalizePath` (`realpath`), so an `invoke(...)` literal whose directory
 * spelling differs only in case from the discovered path matches its node on a
 * case-insensitive host — the same `realpath` identity every sibling consumer
 * of this pass (INV-1 containment, the realpath-keyed parse cache) compares
 * under (invocation.md §Static resolution; `src/runtime/invocation.ts`). A
 * byte-exact string match would silently drop that edge and withhold the
```
The only pass-scoped parse cache production wires is `createPassParseCache()` (production-composition.ts:873), keyed as shown above — not by `realpath`. The same sentence appears in the bug record that introduced this header: `grep -n "realpath-keyed parse cache" docs/bugs/0362-invoke-cycle-graph-drops-case-variant-edges.md` → 1 hit: `133:reads the callee through the realpath-keyed parse cache — arity and type checks`.

**Searches run (this session).**

`grep -n "normaliseCacheKey\|normalizePath" src/extension/pass-parse-cache.ts` → 3 hits:
```
48:import { normalizePath as normaliseCacheKey } from "../normalize-path";
56:export { normaliseCacheKey };
104:      const key = normaliseCacheKey(input.path);
```

`grep -rn "parseViaPassCache(" src/ | grep -v "^\s*\*"` → 8 hits (1 definition + 7 producers; 6 pass a way-S spelling, import-resolution-kit.ts:417 passes way R):
```
src/extension/callee-load-parse.ts:22:  const document = parseViaPassCache({ path: absolutePath, bytes }, deps);
src/extension/import-resolution-kit.ts:417:          document: parseViaPassCache({ path: resolvedPath, bytes }, deps.parseDeps),
src/extension/pass-parse-cache.ts:146:export function parseViaPassCache(input: ThetaSource, deps: PassParseDeps): ThetaDocument {
src/extension/production-composition.ts:3523:  const document = parseViaPassCache({ path: absolute, bytes }, deps);
src/extension/production-composition.ts:3766:    const document = parseViaPassCache({ path: nestedAbsolute, bytes }, deps);
src/extension/production-composition.ts:4543:  const document = parseViaPassCache({ path: absolute, bytes }, deps);
src/extension/production-composition.ts:4759:    const document = parseViaPassCache({ path: absPath, bytes }, deps);
src/extension/production-discovered-theta.ts:109:  const document = parseViaPassCache({ path: theta.path, bytes }, deps);
```
(production-composition.ts:3464 `const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);`, :3706 `nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec)`, :4536 `absolute = isAbsolute(calleePath) ? calleePath : resolvePath(baseDir, calleePath)`, production-discovered-theta.ts:109 the discovery walk's `theta.path` — none passes through `realpath`.)

`grep -rn "canonicalizePath(" src/ | grep -v "^\S*:\s*//\|^\S*:\s*\*"` → 12 hits (way R's producers/consumers):
```
src/extension/import-resolution-kit.ts:90:      const canonical = await canonicalizePath(this.fs, resolved).then(
src/extension/invoke-static-checks.ts:352:    canonicalizePath(fs, path).then(
src/extension/production-composition.ts:595:  return (await fs.exists(root)) ? canonicalizePath(fs, root) : normalizePath(root);
src/extension/production-composition.ts:2198:      const canonical = await canonicalizePath(fs, theta.sourcePath);
src/extension/production-composition.ts:2226:        ? await canonicalizePath(fs, calleeAbs)
src/runtime/invocation.ts:102:  const canonicalPath = await canonicalizePath(deps.fs, resolvedPath);
src/runtime/invocation.ts:106:      await canonicalizePath(deps.fs, root),
src/runtime/invocation.ts:131:export async function canonicalizePath(
src/runtime/invocation.ts:306:  const frontier: string[] = [await canonicalizePath(deps.fs, entryPath)];
src/runtime/invocation.ts:322:      const canonicalEdge = await canonicalizePath(deps.fs, edge);
src/runtime/invoke-provenance-ledger.ts:116:      const calleePath = await canonicalizePath(deps.fs, input.calleePath).then(
src/runtime/invoke-provenance.ts:116:  const parentPath = await canonicalizePath(deps.fs, input.parentPath);
```

`grep -rn "normaliseVerdictKey\|normaliseCacheKey" src/ | grep -v "^src/extension/pass-parse-cache.ts"` → 3 hits:
```
src/extension/pass-verdict-memo.ts:95:  normaliseCacheKey as normaliseVerdictKey,
src/extension/pass-verdict-memo.ts:202:      const entry = store.get(normaliseVerdictKey(absolutePath));
src/extension/pass-verdict-memo.ts:210:      store.set(normaliseVerdictKey(absolutePath), {
```

`grep -n "realpath-keyed" src/extension/*.ts src/runtime/*.ts` → 1 hit:
```
src/extension/invoke-static-checks.ts:336: * of this pass (INV-1 containment, the realpath-keyed parse cache) compares
```

**Counts both ways.** Way S: 3 cache-keying sites (pass-parse-cache.ts:104, pass-verdict-memo.ts:202/:210, callable-closure-path.ts:14 `cacheKey = rootAbs.replace(/\\/g, "/")`) fed by 6 S-spelling producers into the parse cache. Way R: 1 minting helper (invocation.ts:131) with 11 call sites, of which 1 (import-resolution-kit.ts:90 → :417) feeds the S-keyed parse cache.

**Self-inconsistency statement.** No architecture or layering document fixes which identity a pass-scoped cache keys by; invocation.md §Resolution pins `realpath` identity for containment and §Static resolution says "Each visited file is parsed once per pass", but neither names the cache key. The anchor for this filing is self-inconsistency — the same "same file?" question answered by `realpath` in one sibling family and by separator rewrite in the other, inside one pass, over one shared cache — plus the cost below.

## Why this is a problem
Design consistency: the same question — is spelling A the same file as spelling B within this pass — is answered by two mechanisms that agree only when the two spellings already coincide byte-for-byte after a separator rewrite, and both mechanisms feed one cache. Mechanically:

1. **A maintainer has already got it wrong.** The `buildInvokeGraph` header in the same file that defines `resolveCalleeAbsolute` (invoke-static-checks.ts:336) asserts the parse cache is "realpath-keyed", and `canonicalizePath`'s own contract (invocation.ts:126-128) lists "the static-resolution per-pass parse cache key" among the identities it mints. The production cache keys by `normaliseCacheKey` = `normalizePath` (pass-parse-cache.ts:48/:104). Bug 0362's record (:133) reasoned from that belief ("arity and type checks too" were held to be safe because the cache was realpath-keyed) when scoping its fix to the cycle graph alone — the divergence was confined by a premise the code does not satisfy. PTQ-0167's triage (quality/resolved) already recorded the same fact from the other side ("`pass-parse-cache.ts` keys on the separator-normalised path with no `realpath`, so it is not the referent") and fixed only the doc sentence in invocation.ts.

2. **The cache's own stated invariant depends on the identity it does not use.** pass-parse-cache.ts:14-17: "a file already parsed this pass is returned from cache and `lexTheta` never re-emits for it (route 1 fires once by construction)". The import walk keys a `.thetalib` under way R (thetalib-resolver.ts:119 → import-resolution-kit.ts:417) while the callable-closure walk keys the same member under way S (production-composition.ts:4759, `absPath` from `path.resolve`). "Once by construction" therefore holds only when `realpath` is the identity on `path.resolve`'s output — i.e. no case-variant directory segment and no symlinked segment — which is exactly the spelling class bugs 0361 (import identity), 0362 (cycle graph) and 0467 (closure digest) each documented as splitting on Windows hosts before they were canonicalised. This filing does not assert a runtime defect; it records that the sibling families disagree on the identity, that three fixed records show the disagreement has already produced drift in siblings, and that the remaining S-keyed family carries the same shape.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the pass-scoped cache family (`PassParseCache`, `PassVerdictMemo`, the closure caches) could key by the identity `canonicalizePath` mints — using the `.then(ok, () => normalizePath(path))` fallback `buildInvokeGraph` already uses for a rejecting `realpath` — or the already-canonical `canonicalPath` the containment verdict returns could be threaded to the callee reads instead of a second `path.resolve` spelling; either way the two headers that call the cache "realpath-keyed" would become true rather than being narrowed. Which is right, and whether the pass-verdict memo's soundness argument tolerates a different key, is for the fix stage.

## False-positive check
- **Injected clone map:** no group covers this. The injected clone map lists no groups for pass-parse-cache.ts or invoke-static-checks.ts; the two ways are not token copies of each other (one calls `fs.realpath`, the other does not) — this is a mechanism divergence, not a D4 clone.
- **D9-affinity check:** not a wrong-home claim. `canonicalizePath` lives with the containment check it serves; `normaliseCacheKey` lives with the cache it keys; neither would be "moved" by a fix — the choice of identity, not the home, is the subject.
- **D2-deadness check:** both sides live. Way R: 11 `canonicalizePath(` call sites across src/ (pasted above). Way S: `normaliseCacheKey` at pass-parse-cache.ts:104 on every production parse (7 producers pasted), `normaliseVerdictKey` at pass-verdict-memo.ts:202/:210. `runStaticResolutionPass` (invocation.ts:299) is test-only (`grep -rln runStaticResolutionPass src/ tests/ extensions/ tools/` → `src/runtime/invocation.ts`, `tests/invocation-core.test.ts`) and is NOT counted as a way-R site here; it is cited only through `canonicalizePath`'s header text.
- **Export-style exemption:** not applicable (divergent-solutions, no wide-surface claim).
- **Prior filings read:** PTQ-0167 (resolved) — fixed a doc sentence in invocation.ts about `runStaticResolutionPass` inlining the helper; its fix scope did not touch `pass-parse-cache.ts` keying or the invoke-static-checks.ts:336 header. PTQ-1116 (resolved) — pass-parse-cache re-implemented `normalizePath`; fixed by importing it (the S helper), not by changing the identity. PTQ-1127 / PTQ-0348 (resolved) — closure-source path normalisation and per-caller hash recomputation; both kept the separator-only key. PTQ-1539 (open, D1) — two separator-rewrite helpers (`normalizePath` vs `toPosixFileSpelling`); a different divergence (which helper spells separators), not the realpath-vs-separator identity split. PTQ-1552 (open, D6) — the runtime recheck dropping its diagnostic; unrelated. Bugs 0361/0362/0467 are cited as the already-happened drift in siblings, each fixed at its own site; none touched the pass-cache family.
- **Git intent check:** `canonicalizePath`'s "parse cache key" clause predates the production pass cache (per PTQ-0167's triage, clause born 24f68d562 2026-07-01; `pass-parse-cache.ts` is bug 0264's fix, whose record §Fix chooses "keyed by the separator-normalised absolute path" and records the "(D) path-spelling divergence" as a residual, considering separators only). The invoke-static-checks.ts:336 header was added by the bug 0362 fix (0.359.0) after the pass cache existed — the misread postdates both.
- **Self-inconsistency statement:** no written rule exists for which identity pass-scoped caches key by; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify the pass-scoped cache identity (and to what) is a design decision for a human ruling. Form is OK and reported_by matches the pinned identity. I re-ran all five stated searches verbatim and every one reproduces its pasted lines and counts: 3 / 8 / 12 / 3 / 1, plus bug 0362:133 → 1. Every excerpt matches at its cited lines: pass-parse-cache.ts:14-17/:48/:104, pass-verdict-memo.ts:202/:210, invoke-static-checks.ts:304-310/:331-356, callee-load-parse.ts:15-22, import-resolution-kit.ts:90-94/:417, thetalib-resolver.ts:113-119, production-composition.ts:4736-4759/:873/:1893-1894, invocation.ts:121-135 and callable-closure-path.ts:14. The pass cache really is fed by both a realpath spelling (the import walk) and path.resolve spellings (six producers). clone-scan map on pass-parse-cache.ts shows no clone groups, so this is not D4's. The cost is concrete: invoke-static-checks.ts:336 and the bug 0362 record :133 both reason from a "realpath-keyed parse cache" that does not exist, and bugs 0361, 0467 and 0264 exist as cited. It is not a duplicate: PTQ-1539 covers the separator-helper split and PTQ-0167 (resolved) only narrowed a doc sentence; no open or intake filing states this root cause (triage: claude-opus-5-5)
