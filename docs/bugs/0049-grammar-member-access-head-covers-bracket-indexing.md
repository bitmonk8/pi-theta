# Bug 0049 — `grammar.md:54`'s *Forbidden inside a literal* bullet heads both `obj.field` and `arr[i]` with "Member access", the name `expressions.md:9` reserves for `a.b` and `:10` separates from "Indexed access"; the rule the bullet states is correct, and whether the shared head is a mislabel or an intended umbrella is unadjudicated

- **Status:** fixed (0.241.0). The adjudication settled on disposition 1
  (relabel), the disposition this report recommends; see §Fix (0.241.0).
- **Kind:** spec-doc defect, disposition open — a normative page applies one
  access-form name to two access forms. Not an implementation defect and not a
  spec gap about the *rule*: both spellings the bullet names are dispositioned
  (`arr[i]` is rejected by the is-literal check; `obj.field` is stated as
  rejected), and no runtime behaviour follows from the head word. The open
  question is which of two readings governs:
  1. *Mislabel* — the bug
     [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
     class. "Member access" is the name `docs/spec_topics/expressions.md:9`
     assigns to `a.b`; `:10` gives the bracket form its own name, "Indexed
     access". Under this reading the fix is a label correction in the corpus's
     own vocabulary.
  2. *Umbrella* — the bullet names both forms at once by design, the head word
     is a superordinate for postfix accessor forms, and both spellings appear
     in the parenthetical, so no reader reaches a wrong outcome. Under this
     reading the disposition is wontfix, or a reword that coins no term.
- **Related:**
  [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
  — same conflation, one sentence, on a different page; fixed in 0.47.0 by
  relabelling `obj["kind"]` "An indexed access", and the filing origin of this
  report (its §Fix (0.47.0) *Residuals* item (i), `:126–133`, records this
  bullet and leaves it uncurated). Its residual (ii) (`:134–142`) records that
  the corpus has no vocabulary-consistency gate, which is why this site
  survives. [0032](./0032-absent-member-binds-undefined.md) — widened
  `theta/runtime/missing-object-key` to cover both access forms (0.42.0), the
  fix that separated the naming question from any behavioural one.
  [0036](./0036-missing-object-key-bare-key-rendering.md) — locked the byte
  strings 0037's sentence pins.
- **Affected** (citations at HEAD `1afe8cfd`, 0.47.0):
  - The sentence under adjudication: `docs/spec_topics/grammar.md:54` —
    "- Member access on anything other than `Enum.Variant` (no `obj.field`, no
    `arr[i]`)." It is the fifth and last bullet of the *Forbidden inside a
    literal* list (`:48` lead-in) in §"Theta literal sublanguage" (`:7`).
  - The naming authority: `docs/spec_topics/expressions.md:9` — "Member
    access: `a.b`" — and `:10` — "Indexed access: `a["b"]`, `a[0]`, `a[i]`".
    Two bullets of §Supported forms (`:5`), two names.
    `docs/spec_topics/glossary.md` carries no entry for either term, so
    expressions.md §Supported forms is the authority, as it was for 0037.
  - The mirror: `docs/reference/grammar.md:501` — "member access other than
    `Enum.Variant`." — the last clause of the one-bullet restatement at
    `:498–501`. It carries no bracket example, so it is not itself an instance
    of the conflation; it is in the blast radius of disposition 1, which would
    make the spec bullet name a form the mirror does not.
  - Not affected — the rule's substance. `arr[i]` in a `params:` default is
    rejected (`theta/parse/default-not-literal`, verified in §Reproduction),
    and the code's registry row (`code-registry-parse.md:48`) names no access
    form in its *Trigger* or *Message* cell, so no registry edit is owed under
    either disposition.
  - Not affected — the other 18 `member access` occurrences in
    `docs/spec_topics/` and `docs/reference/`. All 19 lines are classified in
    §Reproduction; `grammar.md:54` is the only one that applies the name to a
    bracket spelling.
- **Observed at:** `0.47.0` (HEAD `1afe8cfd`). Text read from the files. The
  implemented outcome of each spelling was established by parse-level probes
  through the shipped front end (`parseThetaDocument`); no model, no live
  provider, no file written.

## Summary

`grammar.md:54` heads two syntactic forms with one name. `obj.field` is member
access (`expressions.md:9`); `arr[i]` is indexed access (`expressions.md:10`).
The bullet's parenthetical lists both under "Member access".

Bug 0037 fixed the identical conflation in `placeholder-rendering-b.md:20`
(0.47.0) and recorded this bullet as a residual rather than folding it in. Two
readings of this site remain open, and this report does not settle them: the
0037 mislabel class, or a deliberate umbrella in a bullet whose job is to name
both forms at once. §Fix pins the constraints and both candidates and
recommends the first.

The bullet's *rule* is not in question. It states that neither spelling is a
literal, and the bracket half is enforced. One asymmetry bears on the
adjudication: the `Enum.Variant` exception in the head applies to the dot form
only. `Sev["High"]` is rejected by the is-literal check, so under the umbrella
reading the exception clause reads onto a form that has no exception.

## Reproduction

Read the files at HEAD `1afe8cfd`. Verbatim, with line numbers:

```text
docs/spec_topics/grammar.md
48  **Forbidden inside a literal** — every form below is rejected by the is-literal check, even though it parses as a Theta expression in unrestricted positions:
49
50  - Identifier references other than `Ident "." Ident` against an enum (no parameter references, no `let`-bound names, no function names).
51  - Operators other than the unary `-` carve-out for numeric literals (no `+`, no `&&`, no comparison, no ternary).
52  - Function and tool calls (no `f(x)`, no `<tool>(args)`).
53  - Template interpolation `${...}` and `@`...`` query templates.
54  - Member access on anything other than `Enum.Variant` (no `obj.field`, no `arr[i]`).
```

```text
docs/spec_topics/expressions.md
 9  - Member access: `a.b` — a member access whose theta-side name is absent panics with `theta/runtime/missing-object-key`, …
10  - Indexed access: `a["b"]`, `a[0]`, `a[i]` — the receiver `a` must be an `array<T>` or an object value; …
```

`arr[i]` matches the `a[i]` form on `:10`. It does not match `a.b`.

The mirror, which carries the same head word and no bracket example:

```text
docs/reference/grammar.md
498  - Forbidden inside a literal (each rejected by the is-literal check): identifier
499    references other than `Enum.Variant`; operators other than unary `-` on a
500    numeric literal; function and tool calls; `${...}` and `@`...`` templates;
501    member access other than `Enum.Variant`.
```

**Occurrence sweep.** `rg -in "member access" docs/spec_topics/` returns 15
lines; `rg -in "member access" docs/reference/` returns 4. Classified:

- *Naming authority and correct dot-form use* (8 lines):
  `expressions.md:9`, `:10` (`obj.fieldName` for the per-field declared type);
  `query/query-forms.md:42` ("member access (`a.b`); indexed access (`a[i]`)");
  `errors-and-results/error-model.md:74`;
  `diagnostics/code-registry-runtime.md:7`, `:23`;
  `diagnostics/placeholder-rendering-a.md:7`;
  `docs/reference/grammar.md:302` ("member access `a.b`; indexed access
  `a[k]`").
- *Registered code names, not prose usage* (4 lines):
  `theta/runtime/null-member-access` at `error-model.md:82`,
  `code-registry-runtime.md:15`, `docs/reference/errors-and-results.md:108`,
  `docs/reference/diagnostics.md:234`.
- *TypeScript-side surface, dot form* (5 lines):
  `pi-integration-contract/audit-recognised-shapes.md:3`,
  `audit-failures.md:12`, `audit-resolution.md:9`,
  `audit-target-categories.md:5`, `version-bump-step2b.md:8`. These name
  `pi.<member>` / `ctx.<member>`; the bracket form is separately named
  *computed access* (`pi[name]` or `ctx[name]`) and separately prohibited, so
  the two forms are kept apart there too.
- *Mirror of the bullet, no bracket example* (1 line):
  `docs/reference/grammar.md:501`.
- *In scope* (1 line): `docs/spec_topics/grammar.md:54`.

`rg -in "member access" docs/guide.md docs/tutorial.md docs/how-to/
docs/examples/` returns nothing, so no narrative page repeats the head word.

**Implemented outcome of each spelling.** One command, run at HEAD, no file
written:

```console
$ npx tsx -e "import {parseDoc} from './tests/helpers/e2e-s1.ts'; for (const rhs of ['obj.field','arr[i]','Sev.High','Sev[\"High\"]']) { const d = parseDoc('---\ndescription: d\nmode: prompt\nparams:\n  x: string = ' + rhs + '\n---\n\"ok\"'); console.log(rhs.padEnd(12), d.diagnostics.length === 0 ? 'no diagnostic' : d.diagnostics.map((x) => x.code).join(',')); }"
obj.field    no diagnostic
arr[i]       theta/parse/default-not-literal
Sev.High     no diagnostic
Sev["High"]  theta/parse/default-not-literal
```

## Expected behaviour

- `docs/spec_topics/expressions.md:9`, `:10` — member access is `a.b`; indexed
  access is `a["b"]`, `a[0]`, `a[i]`. `docs/spec_topics/glossary.md` defines
  neither, so §Supported forms is the naming authority for both.
- Where the corpus means both forms, it names both or names neither. Both
  names, in one clause: `error-model.md:71` ("Member or indexed access on a
  missing object key"), `:74` ("a stdlib-method call, indexed access, or member
  access"), `code-registry-runtime.md:7` and `:23` (same disjunction, and
  `[<index>]` for indexed access versus `.<field>` for member access in the
  same row), `placeholder-rendering-a.md:7`, `query-forms.md:42`,
  `docs/reference/errors-and-results.md:88`, `docs/reference/grammar.md:302`.
  Neither name, spellings only:
  `bindings.md:25` and `expressions.md:30` (`obj.field = ...`, `arr[i] = ...`),
  whose code is `theta/parse/assignment-to-member-or-index`
  (`code-registry-parse.md:30`) — the code name itself is a disjunction.
- The two restatements of this same forbidden list name no access form at all:
  `code-registry-parse.md:48`'s *Trigger* cell ("operator, function call,
  identifier reference other than `Enum.Variant`, `${...}` interpolation, or
  `@`...`` template") and `frontmatter/frontmatter-fields-a.md:60` (the same
  five items). `grammar.md:54` is the only site in the corpus that names an
  access form for this rule.
- The rule the bullet states stands under either disposition: neither spelling
  is admitted at a `params:` default, and a failure is
  `theta/parse/default-not-literal` (`code-registry-parse.md:48`).

## Actual behaviour / root cause

The head word "Member access" governs a parenthetical whose two examples are
one member access and one indexed access. Nothing in the bullet, the list, or
the section says the head is being used as a superordinate, and no other site
in the corpus uses it that way (§Reproduction's sweep).

**The two readings, with the surrounding context.**

*Reading 1 — mislabel.* The list at `:50–:54` is a rejection inventory, one
bullet per admitted-elsewhere form: identifier references, operators, calls,
templates, access. Each bullet names a form of the expression grammar and
parenthesises the spellings it rejects. Read that way, `:54`'s subject is the
`expressions.md:9` form and `arr[i]` is filed under the wrong bullet — there
being no indexed-access bullet is the defect. This is the 0037 shape: correct
claim, wrong name, in a list whose other four bullets name their forms
correctly.

*Reading 2 — umbrella.* The bullet's job is to close the access surface, and it
closes it: both spellings are shown, both are rejected, and the author who
reaches the bullet with either in hand finds their form named. Under this
reading the head is a superordinate for postfix accessor forms, the
parenthetical carries the precision, and the corpus loses nothing.

**What separates them.** The exception clause. "on anything other than
`Enum.Variant`" is a carve-out for one production, `NamedValueLit ::= Ident "."
Ident` (`grammar.md:26`), which exists only in the dot form. The is-literal
check implements exactly that split:
`src/parser/literal-sublanguage.ts:496–498` admits a `member` node when its
head is a bare identifier, and every `index` node falls to the default arm at
`:515–518` and is rejected unconditionally. So under reading 2 the head word
carries an exception clause onto a form that has no exception — `Sev["High"]`
is rejected (§Reproduction), while `Sev.High` is admitted. Under reading 1 the
carve-out is correctly scoped and only the name is wrong.

The corpus's own usage is the second discriminator: eight sites name both forms
when both are meant, two name neither, five keep member access and computed
access apart on the TypeScript side, and none uses "member access" as an
umbrella over a bracket spelling. After 0037's fix this bullet is the sole
candidate.

## Why it matters

- **A normative page contradicts the page it defers to for expression forms.**
  §"Theta literal sublanguage" defines a subset of the expression grammar
  (`grammar.md:9`) whose forms `expressions.md` names. A reader reconciling
  `:54` against `expressions.md:9`–`:10` finds two pages disagreeing about what
  `arr[i]` is, with no way to tell from the bullet which is authoritative.
- **The mirror reads as the dot-only rule.** Within `docs/reference/grammar.md`
  the term is defined at `:302` as `a.b` and used at `:501` in the forbidden
  list. Applying the page's own definition, the reference's forbidden list
  names no rule against `arr[i]`; the bracket form is reached there only
  through the identifier-reference clause at `:499`.
- **The conflation has already been copied once.** 0037 filed and fixed it at
  `placeholder-rendering-b.md:20`, where it had also outlived a behavioural
  half (`:159` of that report). One site of the same class survives.
- **The cost of resolving it either way is bounded and known.** One bullet, one
  line, no code, no registry row, no test.

## Fix

Not yet decided. The settled question is a **spec** decision on one line, and
it is the adjudication itself: whether the corpus's access-form vocabulary
(`expressions.md:9`–`:10`) binds a rejection-list head word, or whether a head
that names both forms at once may use one name.

**Candidate dispositions.**

1. *Relabel — the 0037 class.* Rewrite `grammar.md:54` so the head names both
   forms and the `Enum.Variant` carve-out stays scoped to the dot form, in one
   line, e.g. "- Member access on anything other than `Enum.Variant`, and
   indexed access in any form (no `obj.field`, no `arr[i]`)." Both names come
   from `expressions.md:9`–`:10`, so no term is coined, and the corpus gains
   the same treatment 0037 gave the other site. Consequence to settle in the
   same commit: `docs/reference/grammar.md:501` then restates a rule the spec
   states over two forms while naming one, so the mirror moves too or the
   divergence is recorded.
2. *Leave as found — the umbrella is intended.* No edit. The bullet already
   shows both spellings and rejects both, and the head is read as a
   superordinate. Obligation under this disposition: state where the
   superordinate use is licensed, since `expressions.md` §Supported forms
   assigns the name to one form and nothing else in the corpus uses it for the
   other. A clarifying reword that keeps one head word ("Postfix access on
   anything other than `Enum.Variant`") coins a term and is a third option only
   if that term is added to the naming authority.

**Recommendation: disposition 1.** Three verified facts favour it. The naming
authority gives the two forms separate bullets and separate names, and the
glossary adds nothing that widens either. Every other site that means both
forms names both (six) or names neither (two), so the umbrella has no precedent
in this corpus. The exception clause splits along the same line the
implementation splits on (`literal-sublanguage.ts:496–498` versus `:515–518`),
so a single head word attaches a dot-form carve-out to a form that has none.

**Constraints on any resolution.**

1. **The naming authority is `expressions.md:9`–`:10`.** Any reword draws its
   names from there. Neither line moves under either disposition, and no new
   access-form term enters the corpus without an entry in the authority (and,
   if it is meant to be a glossary term, in `docs/spec_topics/glossary.md`,
   which today defines neither existing name).
2. **Byte strings that must not change.** The three quoted expressions in the
   bullet — `obj.field`, `arr[i]`, `Enum.Variant` — are correct and are what
   the rule rejects and excepts; `Enum.Variant` is the same spelling used by
   the production comment at `grammar.md:26` and by the *Trigger* cell at
   `code-registry-parse.md:48`. The section heading "## Theta literal
   sublanguage" (`grammar.md:7`) supplies the anchor
   `#theta-literal-sublanguage`, linked from `code-registry-parse.md:48` and
   `frontmatter/frontmatter-fields-a.md:60`. The other four bullets (`:50–:53`)
   stay byte-identical.
3. **Line count.** `docs/spec_topics/grammar.md` is 223 lines. `rg -n
   "grammar\.md:[0-9]+" src/ tests/ tools/ docs/ | grep -v
   "reference/grammar.md"` returns 74 citing lines, naming line numbers 54, 90,
   94, 98, 102, 105, 107, 109, 129, 174, 175, 177, 179, 199, 220 and the spans
   89–102, 168–179, 170–177, 216–221 (the further numbers 278, 302, 501 and the
   span 273–284 exceed this file's length and name the reference page). Every number above
   54 drifts if the bullet gains or loses a line, so a resolution is an
   in-place, one-line rewrite unless it re-pins the inbound citations in the
   same commit.
4. **DIAG-2 closure is not engaged and must stay that way.** The resolution
   adds, removes or renames no code and changes no *Trigger*, severity or
   namespace (`diagnostics/diagnostic-shape.md:72`).
   `theta/parse/default-not-literal`'s row (`code-registry-parse.md:48`) names
   no access form in either the *Trigger* or the *Message* cell, so no registry
   edit is owed; the *Message* is unchanged, so DIAG-4 (`:74`) is untouched.
   GOV-15 (`governance/source-language-stability.md:5`) is not engaged either:
   no `.theta` changes its diagnostics, return value or effects.
5. **Mirror check is part of the resolution, not after it.**
   `docs/reference/grammar.md:498–501` is the restatement. It is not an
   instance of the conflation (no bracket example), which is what 0037 recorded
   — under disposition 1 it becomes a coverage question in the same commit;
   under disposition 2 it is left as found.
6. **Gate behaviour must be re-proved, not assumed.** The closing gate ingests
   the page: `tools/closing-gate/live-corpus.js:123` reads
   `docs/spec_topics/` into `specSources` (`:146`), consumed by
   `tests/live-corpus-release-gate.test.ts` (hard-fail, `:145
   expect(findings).toEqual([])`) and `tests/warn-only-canary.test.ts`. Line 54
   carries no `theta/` code, no `MUST`, no REQ-ID and is not a table row, so a
   reword that preserves those properties is expected to leave the gate output
   unchanged — a resolution demonstrates that rather than asserting it.
7. **No test witness is constructible, and none is owed.** No test or tool
   opens `grammar.md` as a file; the closest assertions on this rule are
   behavioural (`tests/e2e-s1-grammar-literal-sublang.test.ts:34`, `:42`) and
   read no prose. A prose-matching assertion would invert DIAG-4's direction
   for expected strings (`diagnostic-shape.md:74`).

## Fix (0.241.0)

- **Adjudication.** Disposition 1 (relabel). The report left the choice open
  and recommended disposition 1; the three facts it rests on were re-derived at
  the fixing HEAD (0.240.0) and all three still hold: (a) the naming authority
  still gives the two forms separate bullets and separate names
  (`docs/spec_topics/expressions.md:9`, `:10`) and
  `docs/spec_topics/glossary.md` still defines neither, so a relabel coins no
  term; (b) the corpus sweep is unchanged — `rg -in "member access"` returns 15
  lines under `docs/spec_topics/` and 4 under `docs/reference/`, no narrative
  page repeats the head word, and no site other than the one under adjudication
  applies the name to a bracket spelling; (c) the implementation still splits
  where the carve-out does — `src/parser/literal-sublanguage.ts:553`
  (`case "member":`, head must be a bare identifier) admits `Sev.High` while the
  `default:` arm at `:572` rejects every `index` node, so `Sev["High"]` reds
  `theta/parse/default-not-literal` (probe at the fixing HEAD through
  `tests/helpers/e2e-s1.ts`).
- **What shipped.**
  - `docs/spec_topics/grammar.md:54` — the *Forbidden inside a literal* bullet
    now names both forms in the authority's vocabulary: "Member access on
    anything other than `Enum.Variant`, and indexed access in any form (no
    `obj.field`, no `arr[i]`)." In-place, one line; the carve-out stays
    textually attached to the member-access half.
  - `docs/reference/grammar.md:616` — the mirror clause moves in the same
    change (§Fix constraint 5): "member access other than `Enum.Variant`, and
    indexed access in any form." The page's own definition of the terms is at
    `:404` at this HEAD, not `:302`.
  - `tests/grammar-literal-forbidden-access-naming.test.ts` — new
    corpus-conformance oracle, in the shape bug 0062's
    `tests/grammar-trailing-trigger-equals.test.ts` established.
- **Constraints discharged.** 1 — both names come from `expressions.md:9`–`:10`;
  neither that page nor the glossary moves. 2 — `obj.field`, `arr[i]` and
  `Enum.Variant` are byte-preserved, the four sibling bullets (`:50`–`:53`) and
  the `## Theta literal sublanguage` heading are byte-identical. 3 — both files
  keep their exact line counts (223 / 697) and both edited lines keep their
  numbers, so no inbound citation goes stale. 4 — no code, *Trigger*, severity,
  namespace or *Message* changes; no registry page is touched; DIAG-2 and DIAG-4
  stay unengaged and GOV-15 is not reached (`git diff --stat -- src/` is empty).
  5 — discharged by the mirror edit above. 6 — the closing gate was re-proved,
  not assumed: `tests/live-corpus-release-gate.test.ts` and
  `tests/warn-only-canary.test.ts` green after the edit. 7 — the report held
  that no witness is constructible; bug 0062's oracle pattern, filed later,
  shows one is. It asserts diagnostic *codes* only and no rendered *Message*
  string, so DIAG-4's direction for expected strings is not inverted.
- **Tests that lock it.** `tests/grammar-literal-forbidden-access-naming.test.ts`
  — §(A) A1/A2 behaviour anchor (`Sev.High` admits, `Sev["High"]` and `arr[i]`
  red `theta/parse/default-not-literal`), green before and after; §(B) B1/B2
  corpus conformance, red at the pre-fix corpus and green after; §(C) C1 the
  naming authority and the glossary's silence, C2 the four sibling bullets
  byte-identical, C3 the three quoted spellings plus the carve-out's scoping,
  C4 the 223 / 697 line pins — all four green in both states, so none
  presupposes the fix. Every reader throws naming its unmet precondition; no
  skip, no early return.
- **Gates.** Witness 8/8 green; red-ability proved by writing the pre-fix bytes
  back and re-running (B1/B2 red, A and C green), then restoring hash-verified.
  Full default suite 423 files / 8896 tests green. `npm run typecheck` and
  `npm run lint` clean. No live run is owed: the change is documentation-only
  and `git diff --stat -- src/` is empty.
- **Residuals.**
  1. The non-goal *dot half's implementation divergence* has closed on its own
     since the filing. At the filing `x: string = obj.field` parsed with zero
     diagnostics; at the fixing HEAD it reds `theta/parse/unknown-identifier`,
     so the bullet's "no `obj.field`" is now enforced (by identifier
     resolution rather than by the is-literal check). Recorded, not acted on —
     the code is a different one from `theta/parse/default-not-literal`, and
     which code should govern is outside this report's naming question.
  2. Bug 0037's residual (ii) — the corpus still has no vocabulary-consistency
     gate. This fix adds a conformance oracle for one bullet, not a gate.
  3. C3's carve-out-ordering conjunct compares first-occurrence positions in
     flattened text rather than parsing the clause structure. It pins the
     shipped wording; a bullet that repeated `Enum.Variant` after the
     indexed-access clause would still pass.

## Non-goals

- **The dot half's implementation divergence.** `grammar.md:54` states "no
  `obj.field`", and the is-literal check admits it: the `member` arm
  (`literal-sublanguage.ts:496–498`) accepts any `Ident "." Ident` without
  checking that the head resolves to an enum, which `grammar.md:26` requires
  ("head is an enum name in scope"). `x: string = obj.field` parses with zero
  diagnostics (§Reproduction). That is a separate defect — implementation
  versus stated rule, not a naming question — and is out of scope here. It is
  recorded because it establishes that the two spellings the bullet groups have
  different implemented outcomes, which is evidence for the adjudication.
- **A vocabulary-consistency gate.** 0037's residual (ii) (`:134–142`) records
  that nothing mechanically checks other pages against `expressions.md`
  §Supported forms, and that such a gate's DIAG-4 boundary needs its own
  adjudication. This report neither builds nor specifies one.
- **The other 18 `member access` occurrences.** All are classified in
  §Reproduction and none applies the name to a bracket spelling. None moves
  under either disposition.

## Provenance

- Origin: the bug 0037 fix (0.47.0, HEAD `1afe8cfd`) — its §Fix (0.47.0)
  *Residuals* item (i)
  ([0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)`:126–133`):
  "`docs/spec_topics/grammar.md:54` — the forbidden-inside-a-literal bullet
  … heads a bracket spelling with the member-access label, the same genus as
  this defect in a different sentence on a different page. Its mirror
  (`docs/reference/grammar.md:501`) carries no bracket example, so the mirror is
  clean." Left for separate curation against that fix's "Scope: one sentence".
  This report is that curation, and adds the adjudication 0037 did not settle.
- Spec: `docs/spec_topics/grammar.md:54` (the bullet), `:48` (the list lead-in),
  `:50–:53` (the sibling bullets), `:26` (`NamedValueLit`), `:7` (the section
  heading and anchor); `docs/spec_topics/expressions.md:5`, `:9`, `:10` (the
  naming authority), `:30` (member/index mutation, spellings only);
  `docs/spec_topics/glossary.md` (no entry for either term);
  `docs/spec_topics/bindings.md:25`;
  `docs/spec_topics/query/query-forms.md:42`;
  `docs/spec_topics/errors-and-results/error-model.md:71`, `:74`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:30`, `:48`;
  `docs/spec_topics/diagnostics/code-registry-runtime.md:7`, `:15`, `:23`;
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7`;
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:20` (0037's
  corrected sentence, the naming precedent);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`;
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15);
  `docs/reference/grammar.md:302`, `:472`, `:498–501`;
  `docs/reference/errors-and-results.md:88`, `:108`;
  `docs/reference/diagnostics.md:234`.
- Implementation: `src/parser/literal-sublanguage.ts:489` (`firstNonLiteral`),
  `:496–498` (the `member` arm's `Enum.Variant` carve-out), `:515–518` (the
  default arm that rejects every `index` node), `:64`–`:76` (the
  `theta/parse/default-not-literal` emission and its message).
- Tests and tooling read, none changed:
  `tests/e2e-s1-grammar-literal-sublang.test.ts:34`, `:42`;
  `tests/params-defaults.test.ts:118–142`; `tools/closing-gate/live-corpus.js:123`,
  `:146`; `tests/live-corpus-release-gate.test.ts:145`;
  `tests/warn-only-canary.test.ts`.
- Verification at HEAD `1afe8cfd` (0.47.0): every citation above read from the
  tree; the two `rg` sweeps for `member access` over `docs/spec_topics/` (15
  lines) and `docs/reference/` (4 lines) with each line classified in
  §Reproduction; the narrative-page sweep over `docs/guide.md`,
  `docs/tutorial.md`, `docs/how-to/` and `docs/examples/` (no hits); the
  inbound-citation sweep for `grammar.md:<n>`; and one `npx tsx -e` parse probe
  through `tests/helpers/e2e-s1.ts` (offline, no model, no live provider). No
  scratch file written; no file in the tree modified other than this report.
