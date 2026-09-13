---
id: PTQ-0284
title: package-discovery.ts hand-mints the `<kind>:"<value>"` descriptor at three sites instead of calling discovery-walk.ts's shared renderer
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/discovery/discovery-walk.ts:1373-1380
  - src/discovery/package-discovery.ts:507-512
  - src/discovery/package-discovery.ts:552-558
  - src/discovery/package-discovery.ts:560-565
sites: 4
fix_scope: module
d4_class: clone
wave: qw20260912204251
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-12
---

# package-discovery.ts hand-mints the `<kind>:"<value>"` descriptor at three sites instead of calling discovery-walk.ts's shared renderer

## Observation
`discovery-walk.ts` owns one private function, `renderSourceDescriptor(source, descriptorValue)`, whose own doc comment calls it "the one rendering shared by every mint site that renders a discovery source as `<descriptor>`, so a source rejected by two different observers cannot render under two grammars for the same pass (bug 0461)." It is not exported. `package-discovery.ts` needs the identical `package:"<value>"` grammar for its own `missing-source` / `unreadable-source` diagnostics and, unable to import the private renderer, spells the same `<kind>:"<value>"` template inline at three separate `diagnostics.push` sites instead.

## Evidence
The shared, but unexported, renderer (`src/discovery/discovery-walk.ts:1373-1380`):
```ts
/** Render a source kind + descriptor value as the normative
 *  `<kind>:"<value>"` descriptor (placeholder-rendering-b.md §5/§7) — the
 *  one rendering shared by every mint site that renders a discovery source
 *  as `<descriptor>`, so a source rejected by two different observers
 *  cannot render under two grammars for the same pass (bug 0461). */
function renderSourceDescriptor(source: DiscoverySource, descriptorValue: string): string {
  return `${descriptorKindOf(source)}:"${descriptorValue}"`;
}
```
For `source: "package"` this evaluates to `` `package:"${descriptorValue}"` `` — byte-identical to what all three sites below hand-write.

Copy 1 — `src/discovery/package-discovery.ts:507-512` (`resolvePiThetas`'s universe-walk-failure report):
```ts
    diagnostics.push({
      severity: "warning",
      code: UNREADABLE_SOURCE,
      file: dir,
      message: `discovery source is unreadable: package:"${pkgName}"`,
    });
```

Copy 2 — `src/discovery/package-discovery.ts:552-558` (`thetasInDirectory`'s missing-path report):
```ts
        diagnostics.push({
          severity: missing,
          code: MISSING_SOURCE,
          file: dir,
          message: `discovery source path does not exist: package:"${descriptorValue}"`,
        });
      }
```

Copy 3 — `src/discovery/package-discovery.ts:560-565` (`thetasInDirectory`'s unreadable-path report):
```ts
      diagnostics.push({
        severity: "warning",
        code: UNREADABLE_SOURCE,
        file: dir,
        message: `discovery source is unreadable: package:"${descriptorValue}"`,
      });
    }
```
Diff verdict: renamed-only / hardcoded-literal clone. All three copies reproduce `renderSourceDescriptor`'s exact output form (`` `<prefix>: package:"<value>"` ``) with `"package"` baked in as a literal instead of calling the parametrised function; none has diverged in bytes yet. Not in the clone map (each copy is a single template-literal line, below the scanner's token-window floor); found by reading and corroborated by the project's own bug record.

`docs/bugs/0461-source-failure-descriptor-category-text.md`'s own fix-review residual #2 names this exact gap:
> `package:"<name>"` is minted inline at three `package-discovery.ts` sites rather than through a shared exported `renderSourceDescriptor`; bytes are correct and byte-pinned by tests at all three. A shared-renderer refactor (touching executable lines) was declined to keep this fix message-text-only.

## Why this is a problem
`renderSourceDescriptor`'s own doc comment states the risk in the present tense: bug 0461 was exactly "a source rejected by two different observers render[ing] under two grammars for the same pass," and the fix's stated purpose was to make this rendering the *one* shared site. Three more mint sites that reproduce the same grammar as bare string literals, instead of calling that renderer, are three more places the next descriptor-format change (e.g. an escaping fix, a kind-token rename) must be applied by hand and can be missed — the identical failure class bug 0461 was filed to close. The bug's own fix notes confirm the duplication is known and was deliberately left unresolved pending a later refactor, not accidentally overlooked.

## Suggested direction (non-binding, optional)
`renderSourceDescriptor` (and the `descriptorKindOf` switch it calls) already live in `src/discovery/discovery-walk.ts`, in the same directory as `package-discovery.ts` — exporting the existing function is the natural shared home to point at, as bug 0461's own residual note anticipates ("a shared-renderer refactor").

## False-positive check
Re-read all four sites at the cited lines immediately before filing; confirmed byte-for-byte that `` `package:"${value}"` `` is what `renderSourceDescriptor("package", value)` already produces. Confirmed `renderSourceDescriptor` is not exported (`grep -n "export function renderSourceDescriptor"` — no match) so `package-discovery.ts` cannot import it as-is. Confirmed via `docs/bugs/0461-source-failure-descriptor-category-text.md` that this exact triplication was already identified by name during that bug's own review and knowingly deferred, not merely an unnoticed coincidence. All three package-discovery.ts copies are live call sites (not dead code — each is reached from `resolvePiThetas`/`thetasInDirectory`, both invoked from `discoverPackageThetas`, the module's exported entry point).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all four excerpts verified verbatim at their cited lines, `renderSourceDescriptor` confirmed unexported (only 2 call sites, both in discovery-walk.ts) so package-discovery.ts cannot import it today, all three package-discovery.ts copies are live (reached from exported `discoverPackageThetas`), clone-scan.mjs correctly does not list the triplet (each ~23-token block is under the 60-token floor, confirmed by running it), and bug 0461's own residual #2 quote matches verbatim, independently corroborating the deferred duplication (triage: claude-opus-5)
