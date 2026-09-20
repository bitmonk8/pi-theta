---
id: pending
title: system-interpolation.ts's two load-phase-consumer citations still name import-static-checks.ts, but that consumer moved to import-system-template-patch.ts
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/system-interpolation.ts:60-70
  - src/parser/system-interpolation.ts:488-492
  - src/extension/import-system-template-patch.ts:1-13
sites: 2
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# system-interpolation.ts's two load-phase-consumer citations still name import-static-checks.ts, but that consumer moved to import-system-template-patch.ts

## Observation
Two doc comments in `system-interpolation.ts` name `import-static-checks.ts`
as the file containing the LOAD-phase `system:` template-revalidation
consumer for, respectively, `LOAD_SYSTEM_INTERP_BAD_FIELD_CODE` and
`toInterpolationType`. Both citations were written on 2026-09-04 (commit
401a425b), when that consumer logic did live inline in
`import-static-checks.ts`. On 2026-09-14/15 (commits 6a68f58c, e3772ed8) the
consumer was split out into a new sibling file, `import-system-template-patch.ts`.
Neither citation was updated for the split; `import-static-checks.ts` no
longer defines or reads either name — it only calls the extracted
`patchSystemTemplateForImports` function, imported from the new file.

## Evidence
src/parser/system-interpolation.ts:60-70 — the first citation (on
`LOAD_SYSTEM_INTERP_BAD_FIELD_CODE`):

```ts
 * (docs/spec_topics/diagnostics/code-registry-load.md). Emitted by the
 * load-phase template-revalidation consumer in `import-static-checks.ts`, not
 * by this module.
 */
```

src/parser/system-interpolation.ts:488-492 — the second citation (on
`toInterpolationType`):

```ts
 * Exported for bug 0423's load-phase sidecar carry
 * (`import-static-checks.ts`): the object arm already threads `sidecars` /
 * `rootDef` through unchanged, so converting an imported schema's
 * `SystemParamType` shell into the `InterpolationType` a patched template part
 * carries is a call, not a reimplementation.
```

src/extension/import-system-template-patch.ts:1-13 — the file's own header,
stating the split and naming itself as the consumer of both cited names:

```ts
// Bug 0422/0423/0450 — LOAD-phase `system:` template revalidation and sidecar
// carry, split out of `checkThetaImports` (import-static-checks.ts). The
// PARSE-phase `system:` check (system-interpolation.ts) admits any `.Ident`
// step off an imported schema opaquely, because the sync parser cannot see
// the `.thetalib`'s fields; `patchSystemTemplateForImports` re-walks each
// already-parsed template PATH part whose head names a directly-imported
// schema or enum against the LOAD-phase-resolved field set, refusing a step
// that names no real field and, for a bare param over a schema carrying a
// real wire rename, replacing the part's `InterpolationType` so the render
// applies the wire-name translation. Returns a patched copy of the template's
// parts (or `undefined` when nothing needed patching) and pushes any refusal
// diagnostics into the caller's `diagnostics` array — the same division of
// labour `checkThetaImports` ran inline before this split.
```

`grep -n "LOAD_SYSTEM_INTERP_BAD_FIELD_CODE\|toInterpolationType" src/extension/import-static-checks.ts`
→ no hits; both names are absent from that file at HEAD.
`grep -n "LOAD_SYSTEM_INTERP_BAD_FIELD_CODE\|toInterpolationType" src/extension/import-system-template-patch.ts`
→ `LOAD_SYSTEM_INTERP_BAD_FIELD_CODE` imported at line 19 and used to build a
diagnostic at line 65; `toInterpolationType` imported at line 20 and called
inside the file's patch logic.

## Why this is a problem
Both comments are load-bearing pointers for a reader trying to find the actual
LOAD-phase consumer of these two exports. Following either citation into
`import-static-checks.ts` at HEAD finds neither the diagnostic-code use nor
the `toInterpolationType` call; both now live in `import-system-template-patch.ts`,
a file the citations never name. The underlying facts each comment states
(these names exist to serve a load-phase consumer, exported rather than
kept private) remain true; only the file attribution has decayed since the
2026-09-14/15 split extracted that consumer into its own module.

## Suggested direction (non-binding, optional)
Point both citations at `import-system-template-patch.ts` (or at
`patchSystemTemplateForImports` by name), matching that file's own header,
which already states the split accurately.

## False-positive check
- Confirmed both comments' exact wording and line numbers via `Read` of
  `src/parser/system-interpolation.ts` and `grep -n` for the citation text.
- Confirmed `import-static-checks.ts` no longer defines or reads either cited
  name: `grep -n "LOAD_SYSTEM_INTERP_BAD_FIELD_CODE\|toInterpolationType"
  src/extension/import-static-checks.ts` → no hits; it only imports and calls
  `patchSystemTemplateForImports` (`grep -n "patchSystemTemplateForImports"
  src/extension/import-static-checks.ts` → import at :130, call at :1930).
- Confirmed the actual consumer file: `grep -n
  "LOAD_SYSTEM_INTERP_BAD_FIELD_CODE\|toInterpolationType"
  src/extension/import-system-template-patch.ts` → both imported and used
  inside that file.
- Git history: `git blame -L 60,70` and `git blame -L 486,492` on
  `src/parser/system-interpolation.ts` both attribute the cited text to
  commit `401a425b` (2026-09-04). `git log --oneline --diff-filter=A --
  src/extension/import-system-template-patch.ts` shows that file created by
  commit `6a68f58c` (2026-09-14, "quality: qw20260914060226 fix
  d9/src__extension__import-static-checks.ts"), ten days after the citations
  were written — confirming the citations predate, and were never updated
  for, the split.
- This is a prose/citation-drift claim, not a deadness claim: both cited
  exports (`LOAD_SYSTEM_INTERP_BAD_FIELD_CODE`, `toInterpolationType`) remain
  live, imported and used by `import-system-template-patch.ts`, so no
  identifier-reachability search across src/extensions/tools/tests is owed
  beyond the consumer-location check above.

## Triage
