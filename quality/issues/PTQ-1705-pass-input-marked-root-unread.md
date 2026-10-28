---
id: PTQ-1705
title: resolvePassInputs returns a markedRoot field that its caller never reads.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-composition.ts:1528-1536
  - src/extension/production-composition.ts:1623-1631
  - src/extension/production-composition.ts:857-864
  - src/extension/production-composition.ts:1610-1620
sites: 2
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# resolvePassInputs returns a markedRoot field that its caller never reads.

## Observation
`resolvePassInputs` declares and constructs a `markedRoot` result field. Its sole caller destructures six other result fields and does not retain the returned object. The local `markedRoot` value is used inside the helper as an input to discovery; that use is separate from the unread result field.

## Evidence
The two occurrences of the result field are its type member and its object-literal member.

`src/extension/production-composition.ts:1528-1536`:
```ts
}): Promise<{
  readonly settings: ThetaSettings;
  readonly placementSelector: ReturnType<typeof resolvePlacementSelector>;
  readonly subagentRootRegime: RootRegime;
  readonly markedRoot: ReturnType<typeof detectMarkedRootWinner>;
  readonly walk: Awaited<ReturnType<typeof discoverThetas>>;
  readonly packageWalk: Awaited<ReturnType<typeof discoverPackageThetas>>;
  readonly discovered: DiscoveredTheta[];
}> {
```

`src/extension/production-composition.ts:1623-1631`:
```ts
  return {
    settings,
    placementSelector,
    subagentRootRegime,
    markedRoot,
    walk,
    packageWalk,
    discovered,
  };
```

The sole consumer leaves that field behind, without a rest binding or another reference to the object. `rg --hidden --no-ignore -n 'resolvePassInputs' src/ extensions/ tools/ tests/` returns two matching lines: this call and the declaration at line 1510.

`src/extension/production-composition.ts:857-864`:
```ts
  const {
    settings,
    placementSelector,
    subagentRootRegime,
    walk,
    packageWalk,
    discovered,
  } = await resolvePassInputs({
```

The discovery input remains live and is not the subject of this finding.

`src/extension/production-composition.ts:1610-1620`:
```ts
    fs: fileSystem,
    settings,
    cliPaths,
    piOwnedNames,
    markedRoot,
    packageCandidates: packageWalk.thetas.map((pkg) => ({
      path: pkg.path,
      stem: pkg.name,
      descriptorValue: pkg.descriptorValue,
    })),
  });
```

## Why this is a problem
This is an unread result field: the helper advertises and constructs an output that no consumer observes. The evidence distinguishes that output from the live discovery input, so this is not an argument to remove marked-root detection or its fail-closed discovery behavior.

## Suggested direction (non-binding, optional)
Limit the helper's result contract to outputs its caller consumes, while retaining its internal marked-root discovery input.

## False-positive check
Reference and dynamic-access searches were run over all four required trees:

- `rg --hidden --no-ignore -n 'resolvePassInputs' src/ extensions/ tools/ tests/` — two matching lines, the sole call and the non-exported declaration.
- `rg --hidden --no-ignore -n '\bmarkedRoot\b' src/ extensions/ tools/ tests/` — 26 matching lines, inspected to distinguish the helper's return field from discovery inputs and the separately scoped callable-hash alignment variables.
- `rg --hidden --no-ignore -n "['\"](resolvePassInputs|composeOneTheta|markedRoot)['\"]" src/ extensions/ tools/ tests/` — no matches, including string-keyed access to this field or helper.
- `rg --hidden --no-ignore -n '\.markedRoot\b' src/ extensions/ tools/ tests/` — one match, `input.markedRoot` in `src/discovery/discovery-walk.ts:577`, which consumes the live discovery input, not this helper's result.
- `rg --hidden --no-ignore -n 'export.*(resolvePassInputs|composeOneTheta)' src/ extensions/ tools/ tests/` — no matches. The sole call does not spread, forward, or expose the returned object, so computed-key consumers cannot observe it either.

There is no test-only consumer of this result field. The history check `git log --oneline -S 'async function resolvePassInputs' -- src/extension/production-composition.ts`, followed by `git show b258e293 -- src/extension/production-composition.ts`, shows the extraction introduced both the return field and the caller that omits it. The discovery use was retained inside the extracted helper; no rationale for exposing an unread result field accompanies it.

## Triage
verdict: confirmed — All excerpts and stated searches reproduce: the non-exported helper's sole caller discards its markedRoot output without retaining or forwarding the result; only the internal discovery input remains live. Commit b258e293 introduced the unread output, and no existing finding tracks this root cause. (triage: claude-opus-5-5)
