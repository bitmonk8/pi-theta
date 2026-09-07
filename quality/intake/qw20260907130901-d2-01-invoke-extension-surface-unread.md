---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: InvokeExtensionInput.surface is required at every checkInvokeExtension call site but the function never reads it, and both production callers pass the same constant "tools"
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/invoke-diagnostics.ts:546-559
  - src/parser/invoke-diagnostics.ts:567-571
  - src/parser/callable-set.ts:424-428
  - src/extension/production-composition.ts:2144
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# InvokeExtensionInput.surface is required at every checkInvokeExtension call site but the function never reads it, and both production callers pass the same constant "tools"

## Observation
`InvokeExtensionInput` declares a required `surface: InvokePathSurface` field.
The only consumer of that input type, `checkInvokeExtension`, destructures
`literalPath` and `site` and never touches `surface`; the emitted diagnostic
(code, message, hint) is identical for both surface values, which the function's
own comment states ("The same code fires for both surfaces"). Both production
call sites pass the literal `"tools"`; the `"invoke"` value reaches this
function only from tests. The sibling input `CalleeHasErrorsInput.surface` IS
read (severity split), so this is specific to the extension-check input.

## Evidence
src/parser/invoke-diagnostics.ts:546-559 — the required field and its doc:

```ts
export interface InvokeExtensionInput {
  /** The path literal exactly as written (no realpath normalisation). */
  readonly literalPath: string;
  /** The referencing surface: an `invoke(...)` literal or a `tools:` `.theta` entry. */
  readonly surface: InvokePathSurface;
```

src/parser/invoke-diagnostics.ts:567-571 — the sole consumer never reads it:

```ts
export function checkInvokeExtension(input: InvokeExtensionInput): Diagnostic[] {
  const { literalPath, site } = input;
  // Byte-exact-lowercase `.theta` suffix (no realpath normalisation, no
  // case-folding): a `.thetalib` path or any non-lowercase variant such as `.THETA`
  // fires (invocation.md §Resolution). The same code fires for both surfaces.
```

src/parser/callable-set.ts:424-428 — production call site 1, constant `"tools"`:

```ts
  const [extensionDiagnostic] = checkInvokeExtension({
    literalPath: spec,
    surface: "tools",
    site: { file },
  });
```

src/extension/production-composition.ts:2144 — production call site 2, constant
`"tools"`:

```ts
      checkInvokeExtension({ literalPath: spec, surface: "tools", site: { file: parsed.sourcePath } })
```

Call-site census: grep `checkInvokeExtension` across src/, extensions/, tools/,
tests/ — production sites are exactly the two above; the remaining callers are
tests/invoke-diagnostics.test.ts:245,257,268,279 (which pass `"invoke"` or
`"tools"`; none reads the field back). The `"invoke"`-surface production path
never reaches this function: `invoke(...)` path extensions are refused in
src/lexer/literals.ts:103 (constructs `theta/parse/invoke-non-theta-extension`
directly).

## Why this is a problem
Vestigial field: the value is never read by any consumer (the definition of a
vestigial field in this lens — "the value is never read"), and additionally
every production call site passes the identical constant. The field's own type
doc (src/parser/invoke-diagnostics.ts:542, "governs only the diagnostic prose
framing") describes behaviour that does not exist — the prose does not vary by
surface. Git shows the field is unrevised scaffolding: it was introduced in the
V15f-T tests-task commit (`74755f5a V15f-T — Invoke parse/load diagnostics
(tests)`) and no later commit added a read.

## Suggested direction (non-binding, optional)
Drop `surface` from `InvokeExtensionInput` (keeping `InvokePathSurface` for
`CalleeHasErrorsInput`, which reads it) and remove the argument from the two
production call sites and the four test call sites; alternatively, if the
prose-framing behaviour the doc promises is wanted, that is a feature decision
outside this lens.

## False-positive check
- Read of the field: grep `surface` over src/parser/invoke-diagnostics.ts —
  reads exist only in `checkCalleeHasErrors` (:621, :630); `checkInvokeExtension`
  destructures `{ literalPath, site }` only (:568).
- Call-site census: grep `checkInvokeExtension` across src/, extensions/,
  tools/, tests/ — 2 production sites (callable-set.ts:424,
  production-composition.ts:2144), 4 test sites
  (tests/invoke-diagnostics.test.ts:245,257,268,279), 0 hits in extensions/ and
  tools/.
- String-keyed/dynamic access: the input object literals are constructed inline
  at each call site and passed once; no variable holds an
  `InvokeExtensionInput` for later `["surface"]` access (grep
  `InvokeExtensionInput` — declaration plus the function signature only;
  0 hits in extensions/, tools/).
- Test-only-caller check: the FIELD has zero readers anywhere including tests,
  so this is not test-only-reachable code; tests supply the field (the type
  requires it) but never observe it.
- Git-history intent: `git log -S 'readonly surface: InvokePathSurface'` on the
  file — single commit `74755f5a` (V15f-T tests-task); the paired V15f
  implementation kept the field without wiring a read.
- Spec-mandate check: invocation.md §Resolution mandates one code for both
  surfaces (which the function honours without the field); no spec text
  requires the input to carry the surface.

## Triage
