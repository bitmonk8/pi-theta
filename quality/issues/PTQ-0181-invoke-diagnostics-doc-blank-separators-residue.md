---
id: PTQ-0181
title: Five checker doc comments in invoke-diagnostics.ts end with a dangling blank ` *` line left behind when the V15f commit deleted the "V15f-T stubs this inert" sentence each blank line used to separate
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/invoke-diagnostics.ts:339-343
  - src/parser/invoke-diagnostics.ts:437-441
  - src/parser/invoke-diagnostics.ts:564-568
  - src/parser/invoke-diagnostics.ts:612-616
  - src/parser/invoke-diagnostics.ts:665-669
sites: 5
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# Five checker doc comments in invoke-diagnostics.ts end with a dangling blank ` *` line left behind when the V15f commit deleted the "V15f-T stubs this inert" sentence each blank line used to separate

## Observation
The doc comments on `checkInvokeReturnType`, `checkInvokeArity`,
`checkInvokeCall`, `checkInvokeExtension`, and `checkCalleeHasErrors` each
close with a blank ` *` line immediately before ` */`. In the tests-task
commit (74755f5a) each of those blank lines separated the prose from a final
paragraph reading "V15f-T stubs this inert; the paired V15f leaf fills it in."
The implementation commit (d9ea72a6) deleted that paragraph in all five
comments and left the separator. The sixth checker in the same commit,
`checkInvokeArgTypes`, had its stub paragraph replaced with new prose rather
than deleted, and its comment closes cleanly. These are the only five
occurrences of a blank comment line directly before a comment terminator
across the three files in this review's scope.

## Evidence
src/parser/invoke-diagnostics.ts:339-343 — `checkInvokeReturnType`:

```ts
 * Animal`) is accepted; an incompatible one fires
 * `theta/parse/invoke-return-type-mismatch`. When either side is not statically
 * resolvable no parse error fires (runtime AJV net).
 *
 */
```

src/parser/invoke-diagnostics.ts:437-441 — `checkInvokeArity`:

```ts
 *     have no destination and no runtime net is possible).
 *   - `providedCount < requiredCount` → `theta/parse/invoke-arity-too-few` when
 *     statically resolvable; otherwise no parse error (runtime AJV net).
 *
 */
```

src/parser/invoke-diagnostics.ts:564-568 — `checkInvokeCall`:

```ts
 * both mis-arities and mis-types reports the arity error rather than a confusing
 * per-argument type error on the first extra slot. When arity fails the
 * per-argument type check does not run.
 *
 */
```

src/parser/invoke-diagnostics.ts:612-616 — `checkInvokeExtension`:

```ts
 * byte-exact-lowercase `.theta` — a `.thetalib` path or any non-lowercase variant
 * such as `.THETA` (invocation.md §Resolution, lexical.md §Extension matching).
 * The same code fires for both surfaces.
 *
 */
```

src/parser/invoke-diagnostics.ts:665-669 — `checkCalleeHasErrors`:

```ts
 * `invoke(...)` callee (the parent registers, static checks against that callee
 * are skipped, and the runtime AJV check is the net). The underlying sites are
 * listed via `related`.
 *
 */
```

Pattern count: `awk 'prev ~ /^ \*$/ && $0 ~ /^ \*\/$/ {print NR-1} {prev=$0}'`
over src/parser/invoke-diagnostics.ts → exactly :342, :440, :567, :615, :668;
over src/parser/frontmatter.ts and src/parser/query-schema-resolve.ts → 0 hits.

History: `git show d9ea72a6 -- src/parser/invoke-diagnostics.ts` removes, in
each of the five comments, the two lines

```
- * V15f-T stubs this inert; the paired V15f leaf fills it in.
```

(preceded by the ` *` separator that remains), together with the
`stub/v15f-unimplemented` sentinel and the `stub()` helper; for
`checkInvokeArgTypes` the same commit replaces its stub paragraph with the
"A statically-unresolvable operand … runtime AJV net." sentence, which is why
that comment has no dangling line.

## Why this is a problem
Leftover scaffolding: a paragraph separator whose paragraph was excised. The
five blank lines carry no content and mark the position of text that no
longer exists; a reader of the rendered JSDoc sees a trailing empty paragraph
on exactly the five functions whose stub sentence was deleted rather than
rewritten. The same commit shows the intended shape (the sixth checker's
comment closes without the separator).

## Suggested direction (non-binding, optional)
Delete the five ` *` lines.

## False-positive check
- Verified the blank line is not a separator before a rendering directive or
  tag: in all five cases the next line is ` */`; no `@param`/`@returns`
  follows.
- Verified provenance rather than style: blame on each of the five ` *` lines
  → 74755f5a (V15f-T) for the line itself, and `git show d9ea72a6` shows the
  deleted stub sentence directly below each one; the line was authored as a
  paragraph separator, not as a deliberate trailing blank.
- Checked the doc-restatement/D4 boundary: this is not a claim about duplicate
  or stale prose content; it is residue of a deletion (the rejected
  pi-token-estimator filing's blame test — separator authored with the deleted
  paragraph — is satisfied here).
- Not a duplicate: PTQ-0107 cites invoke-diagnostics.ts:33-40 (the header's
  stub narration), a different site and root cause; the pending
  qw20260907202646-d2-03-value-doc-comment-empty-separators concerns
  src/runtime/value.ts and commit 984796c1, not this file or commit.

## Triage
verdict: confirmed — every claim reproduces: all five excerpts byte-match at :339-343/:437-441/:564-568/:612-616/:665-669, the awk search yields exactly :342/:440/:567/:615/:668 in invoke-diagnostics.ts and 0 hits in frontmatter.ts/query-schema-resolve.ts, git blame puts all five ` *` lines on 74755f5a (V15f-T), and `git show d9ea72a6` deletes " * V15f-T stubs this inert; the paired V15f leaf fills it in." directly beneath each retained separator in exactly those five checkers while replacing checkInvokeArgTypes' two-line stub with new prose (its comment closes cleanly at :262-273) — blame-proven excision residue of a historical-narration paragraph whose feature landed, the D2 brief's "leftover scaffolding / historical narration comments" category rather than taste, and the same anchor the store accepted for the value.ts sibling (qw20260907202646-d2-03, final line confirmed) and the doc-duplicate residue issues; in scope (src/ production source; nothing consumes the text — no typedoc/jsdoc in package.json, no eslint comment rules — so the "rendered JSDoc" phrasing overreaches slightly but the anchor does not rest on it); not a duplicate — PTQ-0107 covers :33-40 header narration (different root cause), PTQ-0004/0031 different sites/causes, wave siblings d2-01/02/08 cite other files or the header roster, and the value.ts filing is a different file/commit (store convention files shard-scoped fragments of one mechanism separately, per the PTQ-0071…0107 stub-narration family); only slip is "the two lines" wording for a one-line removal per comment, which does not affect substance (triage: claude-opus-5)
