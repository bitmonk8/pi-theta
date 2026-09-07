---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: PiToolLoadEntry declares an optional execute member that its only constructor never populates and no reader consumes
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:3364-3369
  - src/extension/production-composition.ts:3388-3405
  - src/parser/callable-set.ts:59-63
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# PiToolLoadEntry declares an optional execute member that its only constructor never populates and no reader consumes

## Observation
`PiToolLoadEntry` is a module-private interface in
`production-composition.ts` whose only use is as the return type of
`resolveRegistryExtensionTool` (the extension-tool arm of `tools:`
resolution). It declares a mutable optional `execute` member. The sole
constructor returns only `toolName` plus an optional `parameters` spread —
its own doc-comment states "The entry holds NO `execute`" — and the value
flows into `ResolvedPiTool.toolDefinition`, which is typed `unknown`, so the
declaration buys no assignability either. Nothing in the repository reads or
writes `.execute` through this type.

## Evidence
src/extension/production-composition.ts:3364-3369 (the declaration; `execute`
is the interface's only non-readonly member):

```ts
interface PiToolLoadEntry {
  readonly toolName: string;
  /** The tool's registered input schema (RFC-0002 disjointness check reads it). */
  readonly parameters?: unknown;
  execute?: (id: string, params: unknown, signal: AbortSignal) => Promise<{ readonly content: readonly { readonly type: string }[] }>;
}
```

src/extension/production-composition.ts:3388-3405 (the only function returning
this type; no `execute` in the returned object; the preceding doc at :3381
says "The entry holds NO `execute` — the public extension API strips it"):

```ts
function resolveRegistryExtensionTool(
  name: string,
  getAllTools: GetAllToolsSnapshot | undefined,
): PiToolLoadEntry | undefined {
  const info = normalizeToolSnapshot(getAllTools?.() ?? []).find(
    (tool) => tool.name === name,
  );
  if (info === undefined) {
    return undefined;
  }
  ...
  return {
    toolName: name,
    ...(info.parameters === undefined ? {} : { parameters: info.parameters }),
  };
}
```

src/parser/callable-set.ts:59-63 (the slot the constructed value flows into —
`unknown`, so no structural member of `PiToolLoadEntry` affects assignability):

```ts
export interface ResolvedPiTool {
  readonly kind: "pi-tool";
  /** Strong reference to the resolved Pi `ToolDefinition` (opaque to this seam). */
  readonly toolDefinition: unknown;
}
```

Search counts (exact searches, whole repo, `*.ts`):
- `PiToolLoadEntry` across src/, tests/, extensions/, tools/: 2 hits — the
  declaration (production-composition.ts:3364) and the return annotation
  (:3391). No other reference, no re-export (the interface is unexported).
- `\.execute\s*=` across src/: 0 hits — the member is never assigned after
  construction.
- Downstream `execute` reads are duck-typed off `toolDefinition` casts, not
  through this interface: production-theta-producer.ts:3793
  (`typeof tool.execute !== "function"`), :3977 / :6176
  (`entry.toolDefinition as PiToolDispatch`), :6653
  (`typeof dispatch.execute !== "function"`).
- `["execute"]` / `['execute']` bracket access across src/ and tests/: 0 hits.

## Why this is a problem
Dead (never-written, never-read) schema field, proven by exhaustive reference
search: the one constructor of the type omits the member by design — two
adjacent doc-comments (:3358-3360, :3381-3383) state extension entries are
"execute-less by construction" — so the optional member models a state the
type can never be in. It cannot influence type-checking (the consuming slot is
`unknown`), it has no reader through the type (2 total references, both cited),
and it is the interface's only mutable member, inviting a write path that does
not exist. The declaration actively contradicts the documented shape it sits
beside.

## Suggested direction (non-binding, optional)
Drop the `execute` member from `PiToolLoadEntry` (the built-in arm's separate
inline return type on `resolvePiTool`, production-composition.ts:3410-3421,
declares its own required `execute` and is unaffected); alternatively inline
the two-field shape at the return annotation. The fix stage owns the choice.

## False-positive check
- Reference search `PiToolLoadEntry` across src/, extensions/, tools/, tests/:
  2 hits, both in production-composition.ts (:3364, :3391) — module-private,
  no re-export, so no external reader can exist.
- Write search `\.execute\s*=` across src/: 0 hits; no post-construction
  assignment anywhere.
- Dynamic/string-keyed access: `["execute"]` / `['execute']` across src/ and
  tests/: 0 hits. The producer's duck-typed `typeof …execute` probes
  (production-theta-producer.ts:3793, :6653) read values cast from
  `toolDefinition: unknown`; for a value built by
  `resolveRegistryExtensionTool` that probe always answers "absent" (the
  constructor cannot set it), which is the PIC-64 ladder routing the
  surrounding docs describe — removing the declaration changes no behavior.
- Test-only-caller rule: not applicable — no test references the interface or
  constructs its shape with `execute` set (unexported symbol).
- Intent check: the doc-comments above the interface (:3358-3360) and above
  the constructor (:3381-3383) both assert the entry holds no `execute`; the
  member is leftover shape-mirroring of the built-in arm's dispatch type, not
  a planned extension point (no code path toward populating it exists).

## Triage
