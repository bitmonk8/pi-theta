---
id: pending
title: static-type-inference.ts's two spec line citations name lines that do not carry the text they cite (type-system.md:48 for the Unresolvable operands paragraph, lexical.md:15 for the lowercase-first field rule)
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/static-type-inference.ts:395-397
  - src/parser/static-type-inference.ts:461-463
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# static-type-inference.ts's two spec line citations name lines that do not carry the text they cite (type-system.md:48 for the Unresolvable operands paragraph, lexical.md:15 for the lowercase-first field rule)

## Observation
This file carries exactly two `<spec>.md:<line>` citations. Both point at a line
adjacent to, but not at, the spec text they name. `#matchArmScope`'s doc cites
"`type-system.md:48`, *Unresolvable operands*"; at HEAD, line 48 of
`docs/spec_topics/type-system.md` is the "**A written `NamedType` head that
resolves to no declaration does not participate in `⊑` either.**" paragraph and
the *Unresolvable operands* paragraph is line 50. `#memberType`'s doc cites
"variant names are PascalCase, field names lowercase-first, lexical.md:15";
line 15 of `docs/spec_topics/lexical.md` carries only the PascalCase bullet, and
the lowercase-first bullet (which is where "schema field names" appears) is
line 16.

## Evidence
src/parser/static-type-inference.ts:394-397 — citation one:

```ts
   * precisely: the name alone (with no marker) still makes a sibling
   * `resolveNamed` lookup unresolvable and therefore defer
   * (`type-system.md:48`, *Unresolvable operands*) — that holds for any
```

`docs/spec_topics/type-system.md:48` — what that line actually is:

```
**A written `NamedType` head that resolves to no declaration does not participate in `⊑` either.** A `let` annotation, an `fn` parameter type, an `fn` return type, an `invoke<T>` ascription, and every other reference position [Diagnostics — code registry](./diagnostics/code-registry-parse.md#code-registry) names, naming a `NamedType` that resolves to no visible declaration is rejected at parse time as `theta/parse/unresolved-named-type` before any compatibility question arises.
```

`docs/spec_topics/type-system.md:50` — the paragraph the comment names:

```
**Unresolvable operands.** When either side of a compatibility check is past the parser's static view (e.g. an inferred binding whose RHS depends on a Pi-tool call whose registered schema is not visible at parse time, or an `invoke` against a callee that produced `theta/load/callee-has-errors`) — a type the source WITHHOLDS or that sits outside the parser's static view, never a name the author WROTE and got wrong, which is refused upstream instead by the sentence above — the parse-time check is skipped and the runtime AJV check is the safety net.
```

src/parser/static-type-inference.ts:461-463 — citation two:

```ts
   * §Fix route 1). A conformant `schema` can never own a field spelled like a
   * variant (variant names are PascalCase, field names lowercase-first,
   * lexical.md:15; the ill-cased spelling draws `binding-case-mismatch`), so
```

`docs/spec_topics/lexical.md:15-16` — the two bullets the claim spans; the
"schema field names" half is on :16, not :15:

```
- **PascalCase** (uppercase first letter) is required for: `schema` names, `enum` names, `enum` variant names, and any user identifier introduced as a type-like binding. The built-in `Ok`, `Err`, and `Result` follow the same rule.
- **lowercase-first** (a lowercase letter, or `_`) is required for: `let` and `let mut` bindings, function parameters, function names, and schema field names.
```

## Why this is a problem
Both citations are load-bearing: the first is the authority for this pass's
deferral posture on a withheld binder name, the second is the authority for the
claim that the enum-shadowing fallback can never collide with a real declared
field. A reader following either citation lands on a line that does not contain
the cited rule — in the first case on the paragraph the *Unresolvable operands*
paragraph explicitly distinguishes itself from ("never a name the author WROTE
and got wrong, which is refused upstream instead by the sentence above"), which
is the opposite disposition to the one the comment is invoking. The mismatch is
mechanical: the comment names both a line number and a section title, and at
HEAD they resolve to different paragraphs.

## Suggested direction (non-binding, optional)
The section titles in both comments are unambiguous and already do the pointing;
the line numbers are the part that has drifted.

## False-positive check
- Exhaustive citation search in the file:
  `grep -nE "[a-z0-9-]+\.md:+[0-9]+" src/parser/static-type-inference.ts` — two
  hits, :397 and :463, both cited above. No third numeric spec citation exists
  in this file.
- Line resolution: `grep -n "Unresolvable operands\|A written \`NamedType\` head"
  docs/spec_topics/type-system.md` → :48 is the `NamedType`-head paragraph, :50
  is *Unresolvable operands*. `awk 'NR>=13 && NR<=16'
  docs/spec_topics/lexical.md` → :15 PascalCase bullet, :16 lowercase-first
  bullet.
- Not a deadness claim, so no identifier reachability search is owed; both
  comments sit on live private methods (`#matchArmScope` at :409,
  `#memberType` at :488) that the pass calls on every walk.
- Checked that the citations are not pointing at a different copy of the spec:
  a second `type-system.md` exists at `docs/reference/type-system.md`, where
  `grep -n "Unresolvable operands"` answers :65 — also not :48 — and there is no
  `docs/reference/lexical.md` at all (`ls docs/reference/`), so `lexical.md`
  can only mean `docs/spec_topics/lexical.md`.

## Triage
