---
id: PTQ-0187
title: The invoke-diagnostics.ts module header enumerates the diagnostic codes the module owns but stops at bug 0131's fn-arity pair, omitting the three RFC 0009 with-clause codes whose constants, hints, and message builders the same file defines and two production modules import from it
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/invoke-diagnostics.ts:1-31
  - src/parser/invoke-diagnostics.ts:41-46
  - src/parser/invoke-diagnostics.ts:91-104
  - src/parser/invoke-diagnostics.ts:371-404
sites: 3
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# The invoke-diagnostics.ts module header enumerates the diagnostic codes the module owns but stops at bug 0131's fn-arity pair, omitting the three RFC 0009 with-clause codes whose constants, hints, and message builders the same file defines and two production modules import from it

## Observation
The header (:1-31) introduces the module as owning a set of parse/load
diagnostics and lists them as bullets: eight codes in six bullets, the last
being the bug 0131 `fn-arity-too-few` / `fn-arity-too-many` pair. The header's
"Spec:" paragraph (:41-46) lists the governing documents. The module also
defines `WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE`, `WITH_CLAUSE_PI_TOOL_CODE`, and
`WITH_CLAUSE_IN_PROCESS_CALLEE_CODE` (:91-104) with a dedicated section of
registry-verbatim hints and message builders (:371-404), added by the RFC 0009
commit (96303cc3). Neither the bullet roster nor the "Spec:" paragraph
mentions them or RFC 0009. The bug 0131 commit (0759f529), by contrast, added
its codes to the roster when it added them to the file.

## Evidence
src/parser/invoke-diagnostics.ts:1-6 and :26-31 — the header's framing and its
last bullet:

```ts
// V15f / V15f-T — the invoke parse/load diagnostics seam.
//
// This module owns the parse-time and load-time diagnostics the paired `V15f`
// implementation leaf fills in, all keyed to the code-keyed INV parse/load
// obligation area (invocation.md §Argument binding / §Typed return /
// §Argument arity / §Resolution / §Static resolution):
```
```ts
//   - `theta/parse/fn-arity-too-few` / `theta/parse/fn-arity-too-many` — a plain
//     top-level `fn` call (bug 0131, arm (2) only — a same-file `fn`, including
//     `subagent fn`; an imported `.thetalib` arm is deferred to bug 0138) whose
//     positional argument count differs from the callee's declared parameter
//     count. A `fn` parameter carries no default, so required equals total —
//     both arms are always parse-time, with no runtime AJV net.
```

`grep -n "^//   - " src/parser/invoke-diagnostics.ts` → :8, :11, :15, :19,
:22, :26 — six bullets, no bullet for any `with-clause-*` code.

src/parser/invoke-diagnostics.ts:41-46 — the "Spec:" paragraph, with no RFC
0009 entry:

```ts
// Spec: invocation.md (§Argument binding, §Typed return, §Argument arity,
// §Resolution, §Static resolution), implementation-notes.md
// ("Static-resolution load pass"), diagnostics/code-registry-parse.md,
// diagnostics/code-registry-load.md, diagnostics/placeholder-rendering-a.md,
// diagnostics/placeholder-rendering-b.md.
```

src/parser/invoke-diagnostics.ts:91-104 — the three codes the module defines
but the roster omits:

```ts
/** `theta/parse/with-clause-prompt-mode-callee` (code-registry-parse.md; RFC 0009). */
export const WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE =
  "theta/parse/with-clause-prompt-mode-callee";

/** `theta/parse/with-clause-pi-tool` (code-registry-parse.md; RFC 0009). */
export const WITH_CLAUSE_PI_TOOL_CODE = "theta/parse/with-clause-pi-tool";

/**
 * `theta/parse/with-clause-in-process-callee` (code-registry-parse.md; RFC 0009
 * Erratum A′ — the default-reject arm of the call-site clause's callee
 * classification).
 */
export const WITH_CLAUSE_IN_PROCESS_CALLEE_CODE =
  "theta/parse/with-clause-in-process-callee";
```

src/parser/invoke-diagnostics.ts:371-374 — the section banner for their
hints/messages (:377, :381, :386, :390, :395, :402):

```ts
// --------------------------------------------------------------------------
// Call-site `with { cwd }` clause — callee-mode gate + callee classification
// (RFC 0009; invocation.md #options-surface / INV-8; tool-calls.md TOOL-1)
// --------------------------------------------------------------------------
```

Consumers: `grep -rn "WITH_CLAUSE_\|withClause.*Message" src/ --include=*.ts`
excluding this file → 21 hits in src/extension/invoke-static-checks.ts and 10
in src/parser/theta-document.ts, so the omitted codes are live exports of the
module, not local scaffolding.

History: `git show 0759f529 -- src/parser/invoke-diagnostics.ts` adds the
`//   - \`theta/parse/fn-arity-too-few\`…` bullet alongside the new constants
(the roster was maintained as the module's inventory when codes were added);
`git show 96303cc3 -- src/parser/invoke-diagnostics.ts` adds :91-104 and the
:371-404 section and changes no header line.

## Why this is a problem
Stale roster. The header is the file's statement of what the module owns —
"This module owns … diagnostics … :" followed by an enumerated list — and the
enumeration was kept current through bug 0131 but not through RFC 0009, so a
reader taking the header at its word will believe the module owns eight
codes when it owns eleven, and will find no header pointer to RFC 0009 for the
three that two other modules import from here. The mismatch is mechanical
(three named constants in the file, zero header mentions), not a matter of
emphasis.

## Suggested direction (non-binding, optional)
Add a bullet for the three with-clause codes (with RFC 0009 in the "Spec:"
paragraph), or reword the header so it no longer presents the bullets as the
module's complete inventory.

## False-positive check
- Checked whether the header scopes itself to V15f only ("the paired V15f
  implementation leaf fills in"): the same roster already carries the bug 0131
  codes, which post-date V15f, so the list is maintained as the module
  inventory rather than frozen at the V15f set.
- Verified the three codes are defined in this file (not merely re-exported):
  :92-93, :96, :103-104 are `export const` string literals; their hints and
  message builders are at :377-404.
- Not a duplicate: PTQ-0107 cites invoke-diagnostics.ts:33-40 (stub
  narration in the same header, a different paragraph and root cause);
  qw20260910054544-d2-01 and -d2-02 concern src/extension/invoke-static-checks.ts
  docs, not this file's header; PTQ-0031 and PTQ-0004 cite other sites in
  this file.

## Triage
verdict: confirmed — every cited fact reproduces at the exact lines: header :3-6 frames a colon-introduced inventory ("This module owns the parse-time and load-time diagnostics … :") whose six bullets (:8/:11/:15/:19/:22/:26 per `grep "^//   - "`) name 8 codes while the file exports 11 `*_CODE` constants (:66-104 — the three WITH_CLAUSE_* at :92-93/:96/:103-104 plus hints/builders under the RFC 0009 banner :371-404), header :1-46 has zero with-clause/RFC 0009 mentions, the consumer grep gives exactly 21 hits in invoke-static-checks.ts and 10 in theta-document.ts (imports at :97/:147; registry rows at code-registry-parse.md:152-154), `git blame -L 1,46` puts :26-31 on 0759f529 (bug 0131 appended its bullet under the unchanged V15f framing — the only other header touch, 2bc69157, is the Loom→Theta rename) so the roster was curated past V15f, and 96303cc3's only hunks start at -88 and -353 so RFC 0009 left the header untouched; the with-clause banner itself keys the codes to "invocation.md #options-surface / INV-8", inside the INV obligation area the header claims to cover, refuting any out-of-area reading; stale inventory-with-ownership-claim is the accepted class of PTQ-0113/0116/0127/0153/0160 and same-wave d2-02 (confirmed) is the exact analogue for invoke-static-checks.ts's header; not a duplicate — PTQ-0107 covers :33-40 stub narration only, d2-04 covers checker-doc blank residue at :339+, PTQ-0004/0031 cite other sites/causes (triage: claude-opus-5)
