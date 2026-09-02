# Bug 0357 — `scanDocComments` classifies the doc-comment anchor by the next line's leading word against the three-member set `schema`/`enum`/`fn`, so a `///` above a schema field, an enum variant, or a `subagent fn` — three anchors the placement rule admits — draws error `theta/parse/doc-comment-misplaced` and the theta is refused registration: the canonical example in descriptions.md is a four-error load failure

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — every theta that uses the field- or
  variant-level description feature the spec documents (its own worked
  example included) fails to load with a wrong-cause error; in a `.thetalib`
  the same line kills every importer. Loud, but the diagnostic asserts the
  author broke a rule the registry row says they satisfied. D2 because the
  anchor classification needs body-structure awareness (a field/variant is
  only an anchor *inside* a `schema`/`enum` body) rather than a one-line
  predicate widening, and the eligible-set fix must not re-admit `///` above
  genuinely ineligible statements that happen to sit inside blocks.
- **Kind:** defect — implementation diverges from a stated rule.
  `docs/spec_topics/grammar.md:187–193` admits a `DocComment` immediately
  above five productions, including "A field within an object schema body"
  (`:191`) and "A variant within an `enum` body" (`:192`);
  `docs/spec_topics/descriptions.md:35` states the same five-anchor list;
  the registry row `docs/spec_topics/diagnostics/code-registry-parse.md:66`
  scopes the trigger to "a production **other than** `schema`, `enum`,
  schema field, enum variant, or `fn`". The implementation's integrated
  anchor detector recognises only the three leading keywords `schema` /
  `enum` / `fn`, so the two body-interior anchors — and the modifier-prefixed
  `subagent fn` form of the fifth — are classified `"other"` and refused.
- **Related:**
  - [Bug 0358](./0358-doc-comment-descriptions-never-lower.md) — the
    other half of the same unfinished integration: the anchors that ARE
    accepted lower no `description:` anywhere. Distinct mechanism (missing
    lowering wiring vs. wrong anchor classification), distinct observable
    (silent byte absence vs. spurious load error), distinct fix surface.
  - [Bug 0360](./0360-desc-gate-witnesses-dead-seams.md) — why no
    shipped test can red on this: the DESC-area tests drive the seam
    functions with hand-written anchor strings (`"field"`, `"variant"`)
    the integration never produces.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/parser/theta-document.ts:1643–1655` — the anchor computation
    inside `scanDocComments`: `production` is the next non-blank,
    non-comment line's leading identifier (`:1650`), and the eligible test
    is `production === "schema" || production === "enum" || production ===
    "fn"` (`:1652–1655`); everything else maps to `"other"`. A field line
    (`language: string,`) leads with the field name; a variant line
    (`Low,`) with the variant name; a `subagent fn step(...)` with
    `subagent` — all `"other"`.
  - `src/parser/theta-document.ts:1641–1642` — the in-source comment
    states the narrowed design: "`schema` / `enum` / `fn` are eligible
    anchors; every other production … is `theta/parse/doc-comment-misplaced`"
    — omitting the two body-interior anchors its own imported checker and
    the registry row both name.
  - `src/parser/descriptions.ts:136–166` — `checkDocCommentPlacement`, the
    delegated checker, whose eligible set is the correct five
    (`"schema"`, `"enum"`, `"field"`, `"variant"`, `"fn"`, `:143–149`);
    the integration can never hand it `"field"` or `"variant"`, so two of
    its five arms are dead in production.
  - `src/parser/theta-document.ts:63` — the sole production import from
    `descriptions.ts` (`checkDocCommentPlacement` only).
  - `src/extension/production-composition.ts:3383` (`hasLoadParseError`),
    used at `:1806` and `:2387` — an error-severity `theta/parse/*`
    diagnostic refuses composition, so the misplaced error un-registers the
    theta.
  - `docs/reference/grammar.md:400–402` — the reference mirror of the
    anchor list ("an object-schema field, an `enum` variant"), and `:311` —
    `FnDecl ::= SubagentMod? "fn" …`, making `subagent fn` an `FnDecl` (the
    surface form functions.md:50 says the Grammar Appendix owns).
- **Observed at:** 0.347.0 (af476df2). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`,
  plus a production-composition run through `discoverAndComposeFixtures`
  (both written, run, deleted).

## Summary

The parser recovers `///` runs with a line scan (`scanDocComments`) and
delegates placement to `checkDocCommentPlacement`. The delegated checker
implements the spec's five-anchor set, but the scan computes the anchor by
sniffing the *leading word of the next non-blank, non-comment line* and
recognising only `schema`, `enum`, and `fn`. A `///` above a field inside a
`schema` body, above a variant inside an `enum` body, or above a
`subagent fn` therefore classifies as `"other"` and draws
`theta/parse/doc-comment-misplaced` (E). The error refuses registration.

Pasting the two declarations from descriptions.md's own opening example
(`schema ReviewRequest` with two field descriptions, `enum Severity` with
two variant descriptions) into a theta produces four
`theta/parse/doc-comment-misplaced` errors and zero registered commands.

## Reproduction

Offline, at af476df2. Scratch vitest: `parseDoc` from
`tests/helpers/e2e-s1.ts`; registration outcome via
`discoverAndComposeFixtures` with the inert `pi`/`ctx` doubles used by
`tests/e2e-s6-description-registration.test.ts`.

Fixture A — the spec's example, verbatim anchors (frontmatter
`mode: prompt`, `params: { req: ReviewRequest }`; body `let x = 1` after
the declarations):

```
/// A user submitting a code review request
schema ReviewRequest {
  /// The programming language the code is written in
  language: string,

  /// Areas of concern to focus the review on
  focus_areas: array<string>,
}

/// Severity classification for a single review finding
enum Severity {
  /// Trivial issues; no immediate action needed
  Low,
  /// Requires attention soon
  Medium,
}
```

Observed diagnostics (whole set):

```
error theta/parse/doc-comment-misplaced L9   (above `language:`)
error theta/parse/doc-comment-misplaced L12  (above `focus_areas:`)
error theta/parse/doc-comment-misplaced L18  (above `Low,`)
error theta/parse/doc-comment-misplaced L20  (above `Medium,`)
```

The schema-level and enum-level `///` (lines 6 and 16) draw nothing — the
leading-word sniff sees `schema` / `enum` there.

Fixture B — variant-only:

```
enum Sev {
  /// trivial issues
  Low,
  High,
}
```

→ `error theta/parse/doc-comment-misplaced` at the `///` line.

Fixture C — `subagent fn` (reference grammar `FnDecl ::= SubagentMod? "fn"`):

```
/// doc for step
subagent fn step(objective: string) {
  "done"
}
```

→ `error theta/parse/doc-comment-misplaced`. Control: the same `///` above
a plain `fn rate(a: integer): integer { a }` draws nothing.

Fixture D — registration outcome. A no-params `mode: prompt` theta whose
body is `schema ReviewRequest { /// doc… language: string, }` plus
`` @`hi` ``, planted under `.pi/theta/` and composed through
`discoverAndComposeFixtures`:

```
WITH the field ///    -> composed runnables: 0
WITHOUT the field /// -> composed runnables: 1
```

Mechanism corroboration — the classification is name-sensitive, not
structure-sensitive: a field spelled `fn: string` under a `///` draws
`theta/parse/reserved-keyword-as-identifier` for the name but **no**
doc-comment-misplaced (the sniff read `fn` and accepted the anchor), while
the same `///` above `language: string` draws misplaced.

Controls that match the spec: `///` above `let` / `import` / an `export …
from` re-export / a `let` inside an `if` block → misplaced (correct);
`///` above object-form, alias-form (`schema X = "a" | "b"`), and by-form
(`schema X by k = A | B`) declarations → clean (correct); `////` → regular
comment, clean.

## Expected behaviour

- `docs/spec_topics/grammar.md:187` ("It is admitted immediately above any
  of the following productions") with `:191` "A field within an object
  schema body." and `:192` "A variant within an `enum` body." —
  fixtures A and B are byte-instances of those two bullets.
- `docs/spec_topics/descriptions.md:35` — the same placement list, and the
  page's own fenced example (`:5–29`) is fixture A's source.
- `docs/spec_topics/diagnostics/code-registry-parse.md:66` — the trigger is
  "above a production **other than** `schema`, `enum`, schema field, enum
  variant, or `fn`"; a schema field and an enum variant are in the excluded
  set, so the code must not fire there.
- `docs/reference/grammar.md:311` — `FnDecl ::= SubagentMod? "fn" …`
  together with `docs/spec_topics/functions.md:50` (the modifier's surface
  form "is given normatively by [Grammar Appendix — `fn` declarations]")
  makes `subagent fn` an `FnDecl`, i.e. the fifth anchor; `///` above it is
  legal.
- Zero diagnostics on fixtures A–C, and fixture D registers.

## Actual behaviour / root cause

`scanDocComments` (`src/parser/theta-document.ts:1607–1663`) recovers each
`///` run from raw body text (the lexer emits no comment tokens) and then
derives the anchored production lexically:

```ts
production = /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)/.exec(raw)?.[1] ?? "other";
...
const anchor =
  production === "schema" || production === "enum" || production === "fn"
    ? production
    : "other";
const diag = checkDocCommentPlacement(anchor, { file, range });
```

The scan is line-oriented and depth-blind: it does not know whether the run
sits inside a `schema` or `enum` body, so the two anchors that only exist
*inside* bodies are unrepresentable — a field or variant line leads with its
own name and maps to `"other"`. The modifier-prefixed `fn` form leads with
`subagent` and maps to `"other"` too. `checkDocCommentPlacement`
(`src/parser/descriptions.ts:136–166`) would accept `"field"` / `"variant"`
— its eligible set is the correct five — but no call site can produce those
strings. The resulting diagnostic is error-severity, and
`hasLoadParseError` (`src/extension/production-composition.ts:3383`, used at
`:1806` / `:2387`) refuses the theta.

No shipped test parses a document with `///` above a field or variant: the
committed `.theta`/`.thetalib` corpus contains zero `///` lines (grep over
`docs/examples/`, `tests/fixtures/`, `tests/live/acceptance/fixtures/`), the
committed-fixture parse gate therefore cannot see it, and
`tests/descriptions.test.ts` drives the checker with hand-written
`"field"` / `"variant"` strings the integration never mints (see
[bug 0360](./0360-desc-gate-witnesses-dead-seams.md)).

## Why it matters

- The refused inputs are the feature's documented shape. descriptions.md
  opens with exactly this example; a user following the spec gets four
  errors and no slash command, with a message ("'///' doc comment is not
  legal above this production") asserting the opposite of the registry
  row's trigger.
- In a `.thetalib`, one field description takes down every importing theta
  (same parse path, `theta/load/callee-has-errors` at each importer).
- The wrong-cause diagnostic is the misleading kind: the author checks the
  spec, finds their placement listed as legal, and has no path forward
  short of deleting documentation.
- The blast radius includes `subagent fn` docs — the one anchor whose
  eligibility the sniff *tries* to honour is broken by the RFC-0001
  modifier.

## Non-goals

- **The silent non-lowering of accepted descriptions** —
  [bug 0358](./0358-doc-comment-descriptions-never-lower.md). Fixing this report's anchor classification makes field/variant
  descriptions *load*; it does not make them lower.
- **`///` at EOF** (no following production) draws misplaced; defensible
  under "above any other production" read broadly. Not contested here.
- **Interposition permissiveness** — a blank line or `//` line between the
  `///` run and its anchor is accepted (`:1647–1649` skips both), which
  reads "immediately above" loosely. No observable consequence while
  descriptions lower nowhere; recorded, not filed.
- **`docs/spec_topics/grammar.md:138` vs `docs/reference/grammar.md:311`**
  — the spec-topics `FnDecl` production omits `SubagentMod?` while
  functions.md defers to the Grammar Appendix for exactly that surface and
  the reference grammar carries it. A one-line spec-internal drift; any fix
  here should reconcile it, but it is not this report's subject.

## Fix

Not yet decided; constraints any fix must satisfy:

1. `///` immediately above a field inside an object-`schema` body, a
   variant inside an `enum` body, an (optionally `subagent`-modified)
   top-level `fn`, and every `schema`/`enum` declaration form must draw no
   diagnostic; `///` above `let` / `import` / `export` / expression /
   control-flow statements (top-level or block-interior) must keep drawing
   `theta/parse/doc-comment-misplaced` with unchanged bytes.
2. The anchor decision must be structural, not name-keyed: a field's or
   variant's *name* must not change the verdict (the `fn: string` probe
   above is the red the current sniff cannot pass).
3. The natural seam is either brace/body tracking inside `scanDocComments`
   or moving placement into the statement parser where body context exists;
   either way `checkDocCommentPlacement`'s five-arm contract
   (`descriptions.ts:136`) stays the authority and its `"field"` /
   `"variant"` arms become reachable.
4. No `theta/*` code added or removed (the registry row is already
   correct); message bytes unchanged.
5. Witness: fixture A end-to-end (zero diagnostics AND registration), the
   name-sensitivity probe, `subagent fn`, and the misplaced controls — all
   offline through `parseDoc` + `discoverAndComposeFixtures`.

## Provenance

Fresh find (README sweep: no report names `doc-comment-misplaced` or the
DESC placement area; 0060/0103/0209/0299 are the binder-prompt line-shape
family, different surface). Probed at af476df2 with scratch vitests over
`parseDoc` (fixtures A–C plus controls) and `discoverAndComposeFixtures`
(fixture D); all scratch files deleted. Spec read: descriptions.md (whole
page), grammar.md §`///` placement, code-registry-parse.md:66,
reference/grammar.md:311/:400–404, functions.md:48–66. Implementation read:
theta-document.ts:63/:830–858/:946–952/:1599–1677,
descriptions.ts (whole file), production-composition.ts:1806/:2387/:3383.
