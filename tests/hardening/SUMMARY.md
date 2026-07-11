# Loom hardening campaign — summary

Live bug hunt against the SHIPPED extension (real `AgentSession`, real model),
driven through `tests/hardening/probe-harness.ts`. Strategy: partition the
documented language/CLI surface into areas, drive real `.loom` files through the
real discovery → parse → compose → runtime pipeline, and compare observed
behaviour against the spec/docs. Deterministic observation channels
(`registeredNames`, load `diagnostics`, computed `userTexts`, `toolCalls`,
`systemNotes`) were preferred over the stochastic model reply, so most probes
are cheap and repeatable.

## Dominant defect class

Most bugs were the same shape: a spec-mandated check or feature was **implemented
and unit-tested in an isolated module but never wired into the shipped
composition** (`production-composition.ts` / `production-loom-producer.ts`). The
isolated unit tests were green; the live pipeline never called the code. This is
the exact gap a "real extension in real life" probe suite catches and isolated
unit tests miss.

## Bugs found and FIXED (25)

| id | area | one-line |
|---|---|---|
| EXPR-1 | render | `Infinity`/`NaN` interpolated as `"null"` |
| EXPR-2 | runtime | `array.concat` unimplemented → loom aborted |
| EXPR-4 | parser | `fn f(n){ g(n) }` (bare-call tail) returned `null` (FN-5) |
| EXPR-5 | parser | recursion in a trailing-operand tail mis-evaluated |
| EXPR-6 | render | bound enum interpolated JSON-quoted, not bare wire |
| EXPR-7 | render | direct `${Enum.Variant}` aborted the loom |
| EXPR-8 | render | `${}` only resolved dotted paths — `${x+1}`,`${arr[0]}`,`${f(x)}` → `null` |
| QRY-1 | runtime | empty-template short-circuit aborted instead of a catchable `Err` |
| QRY-2/3/4 | render | enum wire value quoted / explicit `= "…"` dropped / direct interp aborted |
| QRY-5 | parser | invalid enum decls (empty body, non-string, dup names, inline) accepted |
| QRY-6 | parser | unknown `Enum.Variant` reference accepted |
| FM-1/2 | parser | `tools: read, grep` comma short-form failed to load |
| FM-3 | load | frontmatter/body errors un-registered the loom **silently** |
| FM-4 | parser | missing closing `---` silently dropped the body |
| FM-5 | parser | malformed YAML frontmatter silently accepted |
| INV-1/2 | parser | invoke path extension / backslash separator unchecked |
| INV-3 | parser | invoke arity unchecked |
| INV-4 | load | invocation cycle undetected → self-cycle **hung the host** |
| INV-5 | load/runtime | invoke path escape unenforced → **out-of-root sandbox escape** |
| INV-6 | runtime | `invoke<Schema>` return value not validated |
| INV-7 | runtime | invoke-chain depth ceiling (#1, cap 32) unenforced |
| INV-8 | parser | dynamic invoke path silently no-op'd |
| IMP-1..7 | imports | `.warp` import subsystem entirely unwired (missing/unexported/cycle/warp-top-level unchecked; imported fn → `null`; warp-fn query never ran) |
| DISC-1 | discovery | clean-leaf missing settings path emitted no `missing-source` error |
| DISC-2 | slash | SLSH-1 no-params overflow note never emitted |

Safety/security highlights: INV-4 (host hang), INV-5 (sandbox escape), INV-7
(unbounded recursion).

## Not fixed (verdict: borderline / documented gap)

- EXPR-3 — a bare object literal is accepted without the `loom/parse/bare-object-literal`
  strictness diagnostic; the resulting value behaviour is itself reasonable.
- INV-9 — prompt→prompt `invoke` child turns are not user-visible in the caller
  conversation (cross-mode attachment; deferred — distinct subsystem, higher risk).
- Registry gaps: no dedicated diagnostic code for an unterminated frontmatter
  fence (FM-4) or malformed YAML (FM-5); both degrade to `loom/load/missing-mode`.
  A distinct code would be a DIAG-2 spec change.

## Verification gates (all green)

`npm test` 1595 · `npm run test:conformance` 26 · `npm run lint` clean ·
`tsc --noEmit` clean · hardening probes 58/58 (`npx vitest run --config
vitest.hardening.config.ts`, needs a live provider).
