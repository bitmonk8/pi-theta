---
id: PTQ-0167
title: canonicalizePath's doc claims the static-resolution parse-cache key reuses it "rather than restating it" while the same file's static-resolution pass inlines the composition twice
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/invocation.ts:133-147
  - src/runtime/invocation.ts:315-317
  - src/runtime/invocation.ts:330-336
  - src/runtime/invocation.ts:106-114
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# canonicalizePath's doc claims the static-resolution parse-cache key reuses it "rather than restating it" while the same file's static-resolution pass inlines the composition twice

## Observation
`canonicalizePath` is documented as "the one function that mints the canonical
path identity the containment check, the static-resolution per-pass parse cache
key, and the `.thetalib` import-edge-graph node identity all compare under;
consumers reuse it rather than restating it." Two of the three named consumers
do call it. The third — the static-resolution per-pass parse cache key, which
lives in `runStaticResolutionPass` in the same file — does not: it writes
`normalizePath(await deps.fs.realpath(...))` inline at both the entry seed and
the per-edge canonicalisation, bypassing the exported helper whose body is that
exact expression.

## Evidence
src/runtime/invocation.ts:133-147 — the claim and the function whose body is
the restated composition:

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

src/runtime/invocation.ts:315-317 — restatement 1, the parse-cache key's entry
seed:

```ts
  // Frontier of canonical paths still to visit; the entry is canonicalised so
  // the cache is keyed uniformly on `realpath` output.
  const frontier: string[] = [normalizePath(await deps.fs.realpath(entryPath))];
```

src/runtime/invocation.ts:330-336 — restatement 2, the per-edge cache key:

```ts
    // Walk transitively across literal `invoke` paths and `.theta` `tools:`
    // entries, canonicalising each edge before enqueueing it.
    for (const edge of [...parsed.invokePaths, ...parsed.toolThetaPaths]) {
      const canonicalEdge = normalizePath(await deps.fs.realpath(edge));
      if (!cache.has(canonicalEdge)) {
        frontier.push(canonicalEdge);
      }
    }
```

src/runtime/invocation.ts:106-114 — the containment check, one of the two
consumers that does reuse the helper:

```ts
  const canonicalPath = await canonicalizePath(deps.fs, resolvedPath);

  for (const root of activeRoots) {
    const canonicalRoot = stripTrailingSeparator(
      await canonicalizePath(deps.fs, root),
    );
```

The third named consumer also reuses it, from another module:
src/extension/import-static-checks.ts:535 —
`const canonical = await canonicalizePath(this.fs, resolved).then(`.

Exact searches: `grep -n "normalizePath\|canonicalizePath"
src/runtime/invocation.ts` → helper defined at :142, called at :108 and :112;
`normalizePath` inlined with `fs.realpath` at :317 and :333 and nowhere else.

## Why this is a problem
A named invariant the file itself breaks: the doc-comment tells a reader that
the canonical-identity minting is single-sourced and that consumers reuse the
function, and it names the static-resolution parse cache key specifically — the
one consumer that restates the composition. Git shows the claim drifted onto a
consumer that never adopted it: `git blame -L 132,147 src/runtime/invocation.ts`
dates the "static-resolution per-pass parse cache key" clause on line 139 to
`2bc691576` (2026-07-19), while the two inline restatements at :317 and :333
date to `0fccd7d5a` (2026-07-01) and were left untouched by that commit. The
doc was extended to cover a consumer that does not do what the doc says.

## Suggested direction (non-binding, optional)
Either narrow the sentence to the consumers that actually route through the
helper, or have the static-resolution pass call it — whichever the maintainers
prefer; the point is that the sentence and the two call expressions in the same
file currently disagree.

## False-positive check
- Reference search: `grep -rn "canonicalizePath" --include=*.ts src/ tests/
  extensions/ tools/` — call expressions are invocation.ts:108 and :112,
  import-static-checks.ts:535, invoke-static-checks.ts:422,
  production-composition.ts:481, invoke-provenance-ledger.ts:116,
  invoke-provenance.ts:116; `runStaticResolutionPass` is not among them.
- Confirmed the inline expression is byte-equivalent to the helper's body:
  helper is `normalizePath(await fs.realpath(path))` (:146); the inlines are
  `normalizePath(await deps.fs.realpath(entryPath))` (:317) and
  `normalizePath(await deps.fs.realpath(edge))` (:333).
- Not a deadness claim — `canonicalizePath` has five live cross-module
  importers, so the helper is not unused; the finding is the doc/consumer
  mismatch.
- Not a behaviour claim: the two forms compute the same value, so no output
  difference is asserted.
- Git intent: `git blame -L 132,147 --date=short src/runtime/invocation.ts`
  (clause added `2bc691576` 2026-07-19) vs `git blame -L 315,335 --date=short`
  (restatements `0fccd7d5a` 2026-07-01) — the naming clause postdates the
  restatements it names.
- Duplicate check: `grep -rn "runtime/invocation" quality/intake/` → only
  qw20260907183353-d2-01-runtime-seams-stub-narration-stale, citing
  invocation.ts:20-32 (stub narration). No filed finding names :133-147, :317,
  or :333.

## Triage
verdict: confirmed — re-verified: :133-141 does claim "consumers reuse it rather than restating it" and names the parse-cache key, while :317/:333 inline the helper's exact body and runStaticResolutionPass appears in no canonicalizePath call site (re-grepped src/ tests/ extensions/ tools/); the blame narrative is wrong (the clause dates to 24f68d562 2026-07-01, not the 2bc691576 Loom->Theta rename), but that commit's own diff converted the containment check's two inlines and left the pass's, so the mismatch and its intent stand (triage: claude-opus-5)
verdict: confirmed — every excerpt reproduces verbatim (:133-147 doc + helper body, :108/:112 reuse, :317/:333 inlines) and the mismatch is mechanical, not taste: the doc names "the static-resolution per-pass parse cache key" among consumers that "reuse it rather than restating it", yet the only realpath-keyed per-pass parse cache in the repo is `runStaticResolutionPass` in this same file (section header :267; `pass-parse-cache.ts` keys on the separator-normalised path with no `realpath`, so it is not the referent) and it inlines the helper's exact body twice while `canonicalizePath` is never called inside it (re-grepped src/ tests/ extensions/ tools/: calls at invocation.ts:108/:112, import-static-checks.ts:535, invoke-static-checks.ts:529, production-composition.ts:491, invoke-provenance-ledger.ts:116, invoke-provenance.ts:116 — candidate's :422/:481 are minor drift); the candidate's blame narrative is wrong — `2bc691576` is the Loom→Theta rename that only changed `.warp`→`.thetalib` on :139, and the clause was born in `24f68d562` (2026-07-01, V15e) together with the helper — but that commit's own diff converted the containment check's two inlines and left the pass's two (still `0fccd7d5a`), so the claim was false on arrival rather than drifted, exactly the confirmed PTQ-0128 pattern, and the intent evidence still supports the finding; not a deadness claim (helper has five production importing modules), so `runStaticResolutionPass` being test-only-reachable (sole caller tests/invocation-core.test.ts) does not invoke the witness-caller rule — the defect sits in live production narration; not a duplicate (PTQ-0073 covers only the :20-32 stub-status header); fix is a one-sentence narrowing or two one-line replacements (`deps.fs` is already `Pick<FileSystem, "realpath" | "readText">`, :289); aside outside this filing's root cause: production-composition.ts:1485/:1513 also inline `realpath(...).replace(/\\/g, "/")`, a separate restating consumer worth its own filing (triage: claude-opus-5)
