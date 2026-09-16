---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: parseCalleeForTools re-runs its on-disk-name readdir and nested-containment realpath probes once per referencing theta, uncached, for a shared tools: .theta callee
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:1329-1333
  - src/extension/production-composition.ts:2656-2669
  - src/extension/production-composition.ts:2941-2959
  - src/extension/production-composition.ts:3016-3027
  - src/runtime/invocation.ts:91-106
  - src/extension/production-composition.ts:955-962
sites: 6                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-composition.ts#parseCalleeForTools # D8 only: the exemption key
wave: qw20260916045442
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# parseCalleeForTools re-runs its on-disk-name readdir and nested-containment realpath probes once per referencing theta, uncached, for a shared tools: .theta callee

## Observation
`resolveThetaToolsAtLoad` (production-composition.ts:2583-2796) runs once per discovered theta from `runComposePass`'s per-theta loop. Inside it, `calleeCache: Map<string, CalleeParse>` is a fresh, function-local map, populated by calling `parseCalleeForTools` once per distinct `.theta` spec in that ONE theta's own `tools:` list. When two or more discovered thetas name the same shared `.theta` callee in `tools:` — the reuse `tools:` `.theta` entries exist to support, per this file's own PTQ-0348 finding — each theta's own call independently re-runs `parseCalleeForTools`'s `fs.readdir`-based on-disk-name resolution and its `fs.realpath`-based nested-containment probe for that callee, because neither is cached on anything that outlives one `resolveThetaToolsAtLoad` call. This is the same repeated-per-referencing-caller shape PTQ-0348 (closure hash) and PTQ-0349 (double-probing within one frame) already fixed for two OTHER computations reached from this exact call chain; the two probes below were not part of either fix's scope and remain uncached across callers.

## Evidence
`resolveThetaToolsAtLoad` is invoked once per discovered theta, in the per-theta loop:

`src/extension/production-composition.ts:1329-1333`
```ts
    const toolResult = await resolveThetaToolsAtLoad(
      input,
      fileSystem,
      ctx,
      parseDeps,
```

Its `calleeCache` is a function-local map (fresh on every call above, never threaded across calls), populated by calling `parseCalleeForTools` once per distinct spec in THIS theta's own `tools:` list:

`src/extension/production-composition.ts:2656-2669`
```ts
  const calleeCache = new Map<string, CalleeParse>();
  for (const entry of toolsList) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (
      spec.length > 0 &&
      !isBareToolName(spec) &&
      !calleeCache.has(spec) &&
      checkInvokeExtension({ literalPath: spec, site: { file: parsed.sourcePath } })
        .length === 0
    ) {
      calleeCache.set(
```

`parseCalleeForTools` runs an `fs.readdir` (via `onDiskCalleeName`) on every call, keyed on nothing that survives past this one call:

`src/extension/production-composition.ts:2941-2959`
```ts
async function parseCalleeForTools(
  fs: FileSystem,
  ctx: ExtensionContext,
  callerDir: string,
  spec: string,
  deps: PassParseDeps,
  getAllTools: GetAllToolsSnapshot | undefined,
  activeRoots?: readonly string[],
): Promise<CalleeParse> {
  const absolute = isAbsolute(spec) ? spec : resolvePath(callerDir, spec);
  const bytes = await fs.readBytes(absolute).then(
    (value) => value,
    () => undefined,
  );
  if (bytes === undefined) {
    return { fileExists: false, mode: "subagent", hasErrors: false };
  }

  const onDiskName = await onDiskCalleeName(fs, absolute);
```

It then probes the callee's OWN nested `tools:` containment — PTQ-0349's own comment names this probe's per-entry cost, `1 + activeRoots.length` `fs.realpath` calls, and describes deduplicating it only WITHIN one frame ("ONCE here, ahead of both consumers below"), never across the callers reaching this same callee:

`src/extension/production-composition.ts:3016-3027`
```ts
  // PTQ-0349: compute every nested `tools:` entry's INV-1 containment verdict
  // ONCE here, ahead of both consumers below — `checkNestedToolsContainment`
  // (diagnostics) and `calleeFailsOwnStructuralChecks` (withhold (a), one
  // frame in) used to each call `checkInvokePathAtLoad` independently over
  // the identical `(nestedAbsolute, literalPath, activeRoots)` triple,
  // doubling that probe's `1 + activeRoots.length` `fs.realpath` calls per
  // entry.
  const nestedContainment = await probeNestedToolsContainment(
    fs,
    absolute,
    document.frontmatter.tools,
    activeRoots,
```

`checkInvokePathAtLoad` (the probe `probeNestedToolsContainment` calls per nested entry) delegates straight to `checkInvokePathContainment`, whose own cost is one `realpath` for the callee plus one per active root, with no cache of its own:

`src/runtime/invocation.ts:91-106`
```ts
export async function checkInvokePathContainment(
  deps: InvokePathCheckDeps,
  resolvedPath: string,
  activeRoots: readonly string[],
): Promise<InvokePathContainment> {
  // The containment comparison is decided on the byte-exact `realpath` output of
  // *both* the resolved callee path and each active root (invocation.md
  // §Resolution). Forward-slash-normalise per the Lexical "Path literals" rule;
  // no independent case-folding — the canonical form is whatever `realpath`
  // returns on the host.
  const canonicalPath = await canonicalizePath(deps.fs, resolvedPath);

  for (const root of activeRoots) {
    const canonicalRoot = stripTrailingSeparator(
      await canonicalizePath(deps.fs, root),
    );
```

`activeRoots` (the loop `checkInvokePathContainment` iterates) is the discovered-theta directory union — one entry per discovered theta's own directory, not a small fixed constant:

`src/extension/production-composition.ts:955-962`
```ts
  // INV-1 (invocation.md §Resolution): the active discovery-root union threaded
  // into the invoke containment check — the parent directory of every discovered
  // theta. Every registrable theta sits inside an active discovery root, so this
  // set is the roots the load-time and runtime containment checks compare
  // against; a callee resolving outside all of them escapes the sandbox.
  const activeRoots = Array.from(
    new Set(discovered.map((theta) => dirname(theta.path))),
  );
```

## Why this is a problem
For K discovered thetas that reference the same shared `.theta` callee via `tools:` — the exact reuse scenario `tools:` `.theta` entries exist to support (this file's own PTQ-0348 framing) — and a callee declaring M of its own nested `tools:` `.theta` entries, this pass currently pays K separate `fs.readdir` calls (`onDiskCalleeName`, once per referencing theta) and K × M × (1 + `activeRoots.length`) `fs.realpath` calls (`probeNestedToolsContainment`, once per referencing theta per nested entry), where 1 `readdir` plus M × (1 + `activeRoots.length`) `realpath` calls would suffice: both computations are pure functions of the callee's own resolved absolute path (and, for the containment probe, the pass-constant `activeRoots`), independent of which caller reached it, exactly the soundness argument this file's own `collectCallableClosureSources` doc comment already makes for the sibling closure-hash cache ("two different callers naming the same root always compute ... the identical source set"). Unlike that sibling computation (fixed, PTQ-0348) and unlike the double-probe within one frame (fixed, PTQ-0349), neither `onDiskCalleeName`'s result nor `probeNestedToolsContainment`'s per-entry verdict is stored on anything broader than the one `resolveThetaToolsAtLoad` call that produced it, so this file's own established pattern — a pass-scoped cache keyed on the resolved callee path, already applied four times (`passParseCache`, `passVerdictMemo`, `closureSourcesCache`, `closureHashCache`) — stops one computation short of covering everything `parseCalleeForTools` does per referencing caller.

## Suggested direction (non-binding, optional)
One unproven hypothesis, following the same shape this file already applies four times: add a pass-scoped `Map<string, CalleeParse>` (or two narrower maps, one per probe) keyed by the resolved absolute callee path, carried alongside `passParseCache`/`passVerdictMemo`/`closureSourcesCache`/`closureHashCache` on the same per-pass deps object, consulted by `parseCalleeForTools` before running `onDiskCalleeName` / `probeNestedToolsContainment` and populated after. No claim is made about the exact cache shape beyond the fact that this file already establishes the pattern for four sibling per-callee computations reached the same way.

## False-positive check
Confirmed `calleeCache` (production-composition.ts:2656) is declared inside `resolveThetaToolsAtLoad`'s own function body (2583-2796), not on `parseDeps`/`PassClosureDeps` or any other object threaded across calls — grepped for `calleeCache` and found only this one declaration and its own-function uses, no external reference. Confirmed `resolveThetaToolsAtLoad` is called once per discovered theta (1329, inside the `for (const input of parsedInputs)` loop in `runComposePass`) and once per runtime dispatch (4184, `parseCalleeTheta`) — two call shapes, neither of which threads a `CalleeParse` cache across separate calls. Checked this is not PTQ-0348: that finding's caches (`closureSourcesCache`/`closureHashCache`) cover `collectCallableClosureSources`/`resolveCallableClosureHash` only (the SHA-256 closure-content hash), confirmed present and consulted in the current source (production-composition.ts:4230-4239, 4270-4274) — a different computation from the `fs.readdir`/`fs.realpath` probes this finding names, which those two caches do not touch. Checked this is not PTQ-0349: that finding's fix (`probeNestedToolsContainment`, confirmed landed at 3023) deduplicates the containment probe between `checkNestedToolsContainment` and `calleeFailsOwnStructuralChecksBody` WITHIN one `parseCalleeForTools` call — its own doc comment (3016-3022) states the scope as "ONCE here, ahead of both consumers below," a within-frame claim, not an across-caller one; this finding is about the SAME probe's cost being paid again by a SECOND, THIRD, ... referencing theta's own separate `parseCalleeForTools` call for the identical target. Searched `quality/issues/`, `quality/resolved/`, and the wave's already-filed/rejected lists for "onDiskCalleeName", "probeNestedToolsContainment", "calleeCache": no existing filing makes this specific across-caller claim. Not dead code: both probes are load-bearing (bug 0379 case-variance parity for `onDiskCalleeName`; INV-1/bug 0111 containment for `probeNestedToolsContainment`), reached on every load pass with a shared `.theta` `tools:` callee; the finding is that their cost is paid once per referencing caller rather than once per distinct callee, not that either is unreachable.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting verified: all 6 excerpts reproduce verbatim at the cited lines; traced all four existing pass-scoped caches (passParseCache, passVerdictMemo, closureSourcesCache/closureHashCache) and confirmed none covers onDiskCalleeName's `fs.readdir` or probeNestedToolsContainment's `fs.realpath` probe (passVerdictMemo's own doc-comment concedes a memo hit "needs [nestedContainment] not at all" yet it is still computed unconditionally before that check); calleeCache confirmed function-local (2583-2796), PiFileSystem confirmed a raw uncached fs passthrough; distinct from fixed PTQ-0348 (different computation) and PTQ-0349 (whose landed fix, verified at 3016-3022, scopes to "ONCE here" within one call, never across separate referencing callers); no exemptions.json entry for this host. Per D8 protocol an accurate heavier-than-scale accounting caps at questionable — adding the cache is a human design call, matching how sibling PTQ-0348/PTQ-0349 were triaged before ratification (triage: claude-opus-5)
