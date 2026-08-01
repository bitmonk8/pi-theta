# Bug 0037 — placeholder-rendering §5's second `<key>` test vector calls the bracket spelling `obj["kind"]` "A member access", the name expressions.md:9 reserves for `a.b`; the byte string the vector pins is correct and locked, only the syntax label is wrong

- **Status:** open. §Fix settled — one label correction in one spec sentence;
  no behavioural, registry, or test change.
- **Kind:** spec-doc defect — a normative page mislabels the syntax of its own
  test vector. Not a spec gap and not an implementation defect: the §5 `<key>`
  rule (`placeholder-rendering-b.md:11`), its runtime identifier-shape
  predicate restatement (`:129`), and the rendered byte string this vector
  pins are all correct, implemented, and locked green. No runtime behaviour
  follows from the label word.
- **Related:** bug
  [0036](./0036-missing-object-key-bare-key-rendering.md) — routed the one
  `MissingObjectKeyPanic` emission site through the category-5 renderer and
  locked both §5 `<key>` vectors' byte strings at that site
  (`tests/missing-object-key-rendering.test.ts`, 0.41.0); those tests are what
  make this vector's *claim* correct while its *label* is not. Bug
  [0032](./0032-absent-member-binds-undefined.md) — widened
  `theta/runtime/missing-object-key` from indexed access to member access as
  well (0.42.0), which is why the mislabel is now confined to syntax and is no
  longer also false about behaviour; its §Fix (0.42.0) Residuals paragraph
  (`:147–151`) records this vector as flagged-not-filed, and this report is
  that filing.
- **Affected** (citations at HEAD `f959f8de`, 0.45.0):
  - The one defective sentence:
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:20` — "A member
    access `obj["kind"]` on a missing key renders `missing object key: kind`
    (key is identifier-shaped, so bare)." The quoted expression is the
    bracket spelling.
  - The naming authority the sentence contradicts:
    `docs/spec_topics/expressions.md:9` — "Member access: `a.b`" — and `:10` —
    "Indexed access: `a["b"]`, `a[0]`, `a[i]`". The two forms are separate
    bullets of §Supported forms with separate names; `docs/spec_topics/glossary.md`
    defines neither term, so expressions.md §Supported forms is the authority.
  - Not affected — the vector's substance: the `<key>` rule at `:11`
    (quote-only-when-not-identifier-shaped, a runtime predicate on the key
    string), its `:129` restatement with the reserved-keyword carve-out, and
    the rendered string `missing object key: kind`. Its `<key>` rendering is
    pinned at the renderer by `tests/placeholder-rendering.test.ts:124`
    (`renderSourceDerived({ kind: "key", text: "kind" })` → `kind`) and the
    whole message at the emission site by
    `tests/missing-object-key-rendering.test.ts:334–348` / `:418` (bug 0036's
    lock), and it is the same string under either access form since 0032.
  - Not affected — mirrors and tooling: no reference page repeats the vector
    sentence. `docs/reference/` carries only the registry row and the panic
    bullet (`errors-and-results.md:88`, `:110`; `diagnostics.md:236`), none of
    which names an access form for a vector. No test or tool reads the vector
    prose — the only file reads in `tests/missing-object-key-rendering.test.ts`
    target the four `code-registry-*.md` pages (`:130–139`), and the expected
    byte strings are literals built from the registry template (`:159`,
    `:161`).
  - Not affected — the sibling vector at `:19`. Its own phrasing is examined
    in §Actual behaviour / root cause below; it states a true claim and
    contains no mislabel, and §Fix leaves it as found.
- **Observed at:** `0.45.0` (HEAD `f959f8de`). Text defect, read from the
  file. No execution, no live model.

## Summary

`placeholder-rendering-b.md:20` is the second of §5's two `<key>` test
vectors. It quotes `obj["kind"]` — indexed access per `expressions.md:10` —
and calls it "A member access", the name `expressions.md:9` assigns to `a.b`.
The rendered string the vector pins (`missing object key: kind`) is correct
and locked by two test files, so the defect is the label word and nothing
else.

The §5 `<key>` rule is a predicate on the key *string* (`:11`, `:129`), not on
the access form that produced it, so no vector has to name an access form for
the rule to be complete. Where a vector does name one, it describes the
example it quotes, and this one describes it wrongly.

Before bug 0032 the sentence was also false about behaviour: member access on
an absent name did not panic at all (it bound JS `undefined`). Since 0032
(0.42.0) both spellings raise `theta/runtime/missing-object-key` through one
shared presence gate, so a reader who takes the label at face value now
reaches a true conclusion about the message by a false route through the
grammar.

## Reproduction

Read the two files at HEAD `f959f8de`. Verbatim, with line numbers:

```text
docs/spec_topics/diagnostics/placeholder-rendering-b.md
15  **Test vectors.**
…
19  - A `match` on `obj["my-key"]` against a missing key renders `missing object key: "my-key"` (key is not identifier-shaped, so quoted).
20  - A member access `obj["kind"]` on a missing key renders `missing object key: kind` (key is identifier-shaped, so bare).
```

```text
docs/spec_topics/expressions.md
 9  - Member access: `a.b` — a member access whose theta-side name is absent panics with `theta/runtime/missing-object-key`, …
10  - Indexed access: `a["b"]`, `a[0]`, `a[i]` — the receiver `a` must be an `array<T>` or an object value; …
```

`obj["kind"]` matches the `a["b"]` form on `:10`. It does not match `a.b`.

Scope checks, both empty of hits outside the one sentence and the two bug docs
that quote it:

```text
$ rg -n --glob '*.md' 'A member access' docs/
docs/spec_topics/diagnostics/placeholder-rendering-b.md:20:- A member access `obj["kind"]` …
docs/bugs/0036-missing-object-key-bare-key-rendering.md:185:  and "A member access `obj["kind"]` on a missing key renders

$ rg -n --glob '*.md' 'missing object key' docs/reference/
docs/reference/errors-and-results.md:88:- Member or indexed access on a missing object key — `theta/runtime/missing-object-key`.
docs/reference/errors-and-results.md:110:| `theta/runtime/missing-object-key` | `missing object key: <key>` |
docs/reference/diagnostics.md:236:| `theta/runtime/missing-object-key` | E | runtime | `missing object key: <key>`. |
```

## Expected behaviour

- `docs/spec_topics/expressions.md:9`, `:10` — member access is `a.b`; indexed
  access is `a["b"]`, `a[0]`, `a[i]`. A spec sentence that names an access form
  names the one it quotes.
- `docs/spec_topics/diagnostics/placeholder-rendering-b.md:11` — the §5 `<key>`
  rule: quoted "only when the key string is *not* identifier-shaped … The
  identifier-shape predicate is a runtime check on the key string, not a
  parse-time grammar production." `:129` restates it. Both are silent on the
  access form, which is what makes the label descriptive rather than
  load-bearing.
- The rendered string stands: `missing object key: kind`, bare, for either
  spelling of an absent identifier-shaped key
  (`docs/spec_topics/diagnostics/code-registry-runtime.md:17` — Trigger
  "`obj[k]` or `obj.field` where `k` / `field` is not a present theta-side name
  on the receiver", Message `missing object key: <key>`;
  `docs/spec_topics/errors-and-results/error-model.md:71` — "Member or indexed
  access on a missing object key", `:76` — the templates are normative and
  interpolated by the per-category rules).

## Actual behaviour / root cause

`:20` calls `obj["kind"]` "A member access". One word class, in a page whose
vectors conformance tests "MUST match" (`placeholder-rendering-a.md`),
asserting a grammar production the quoted example does not use.

The label predates bug 0032 ([0032](./0032-absent-member-binds-undefined.md)
`:147–151`), and until 0.42.0 it was false about behaviour as well as syntax:
`theta/runtime/missing-object-key` fired only on indexed access, so the
sentence named a form that raised no panic while quoting the form that did.
Bug 0032 removed the behavioural half by widening the panic to both
spellings and made the two spellings render one absent name byte-identically
through the interpolation point bug 0036 established. The syntax half
survived, unexamined, because the vector's byte string never changed and the
tests that lock it read the registry row rather than this prose.

**The sibling vector at `:19`, recorded as found.** It reads "A `match` on
`obj["my-key"]` against a missing key renders `missing object key: "my-key"`".
Three observations:

1. No mislabel. It does not call `obj["my-key"]` a member access; it names an
   enclosing construct instead of an access form.
2. The `match` is inert to the rendering. The panic fires while the scrutinee
   is evaluated, and `error-model.md:65` and `:94` state that panics bypass
   `?` and `match` and "cannot be caught by `match`" — so no arm runs and the
   enclosing construct contributes nothing to the emitted string. The vector
   would pin the same bytes with the `match` removed.
3. The pair is asymmetric. `:19` names an enclosing construct, `:20` names an
   access form, and both quote the same access form — so read together the two
   vectors invite the reading that they contrast two spellings, which is the
   reading `:20`'s label states outright and `:19`'s does not contradict.

None of the three makes `:19` a false sentence, so it is not part of the
defect this report files.

## Why it matters

- **A normative page contradicts the grammar page it depends on.** §5's
  vectors are the strings conformance tests must match
  (`error-model.md:76`, `placeholder-rendering-a.md`: "conformance tests
  asserting on a rendered message MUST match these vectors"). A reader
  reconciling `:20` against `expressions.md:9` finds the two pages disagree
  about what `obj["kind"]` is and has no way to tell which page is wrong from
  the vector alone.
- **The error has already been copied once.**
  [0036](./0036-missing-object-key-bare-key-rendering.md)`:185` reproduces the
  sentence as a verbatim quote of the spec. Adjacent prose also has to work
  around it: 0036 §Summary (`:139`) states that the bracket form "is the only
  spelling for keys that are not identifier-shaped (member access cannot name
  them)" — the constraint that makes `:19`'s vector reachable only through
  indexing, one line above a sentence labelling the same syntax member
  access.
- **It hides how thin the vector coverage is.** With `:20` read as a
  member-access vector, §5 appears to cover both spellings. Both vectors quote
  the bracket form; neither exercises member access. That is adequate — §5's
  rule is access-form-agnostic — but the label makes the coverage look
  different from what it is.
- **The cost is bounded and known.** One word class, one sentence, no
  behavioural surface: the string, the registry row, the panic code and the
  locking tests are all untouched by the correction.

## Fix

**Correct the label at `docs/spec_topics/diagnostics/placeholder-rendering-b.md:20`.**
"A member access `obj["kind"]`" becomes "An indexed access `obj["kind"]`",
matching the name `expressions.md:10` gives the form. The rest of the sentence
is byte-unchanged, including the rendered string `missing object key: kind`
and the parenthetical "(key is identifier-shaped, so bare)". "Indexed access"
is the corpus's own term for the form (`expressions.md:10`,
`error-model.md`, `code-registry-runtime.md`,
`diagnostics/placeholder-rendering-a.md`); no term is coined.

**Scope: one sentence.** No reference mirror repeats it (§Reproduction's second
grep), so nothing in `docs/reference/` moves. No registry edit — the
`theta/runtime/missing-object-key` row's code, severity, phase, Trigger and
Message cell are all untouched, and the row already covers both spellings
since 0032. No test edit: the byte strings in
`tests/missing-object-key-rendering.test.ts` are literals checked against the
registry row read from `code-registry-*.md`, and
`tests/placeholder-rendering.test.ts:123–124` calls the renderer directly, so
neither file reads the corrected prose. The default gate cannot red on this
change.

**Leave `:19` as found.** Its claim is true, it contains no mislabel, and
`tests/missing-object-key-rendering.test.ts:322` quotes it verbatim in a
comment — editing it would make that quotation stale while correcting nothing
false. The asymmetry recorded in §Actual behaviour / root cause item 3
survives the fix.

**GOV-15 is not engaged.** The change is doc prose in a test-vector label. No
observable changes: not the rendered message, not the panic code, severity or
class, not the registry, not `tests/fixtures/h7a/permitted-codes.json`. A
`.theta` file behaves identically before and after, so the source-language
stability promise has nothing to compare.

**No test witness.** A one-word prose correction has no observable to pin, and
the vector's byte string is already locked at both the renderer and the
emission site by 0036's tests. DIAG-4 directs tests to source expected strings
from the registry's *Message* column "rather than copy-pasting prose from the
spec rule's home page", which is what those tests do; a prose-matching
assertion would invert that rule.

## Provenance

- Origin: the bug 0032 fix implementation (commit `62a848ff`, 0.42.0) — the
  implementer's grep sweep over the `missing-object-key` surface the widening
  touched. Recorded twice, both times as flagged-not-filed:
  `.pi/tmp/fixes/0032-report.md:12` — "Flagged (not filed):
  placeholder-rendering-b.md:20 labels the bracket spelling `obj["kind"]` "A
  member access" — pre-existing one-word mislabel, correct byte-string claim."
  — and [0032](./0032-absent-member-binds-undefined.md) §Fix (0.42.0)
  Residuals (`:147–151`) — "The pre-existing `placeholder-rendering-b.md:20`
  vector label ("A member access" describing the bracket spelling
  `obj["kind"]`) predates this bug, asserts a correct byte string, and is left
  as found — flagged for separate curation." This report is that curation.
- Spec: `docs/spec_topics/diagnostics/placeholder-rendering-b.md:20` (the
  defect), `:19` (the sibling vector), `:11` (the §5 `<key>` rule), `:15`
  (the *Test vectors.* heading the two bullets sit under), `:129` (the runtime
  predicate and the reserved-keyword carve-out);
  `docs/spec_topics/expressions.md:9` (member access `a.b`), `:10` (indexed
  access `a["b"]`, `a[0]`, `a[i]`);
  `docs/spec_topics/errors-and-results/error-model.md:65` and `:94` (panics
  bypass and cannot be caught by `match` — the `:19` finding), `:71` (the panic
  bullet, both spellings), `:76` (normative templates, per-category
  interpolation, exact-string conformance licence);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:17` (the registry
  row); `docs/spec_topics/diagnostics/placeholder-rendering-a.md` ("conformance
  tests asserting on a rendered message MUST match these vectors");
  `docs/spec_topics/diagnostics/diagnostic-shape.md:74` (DIAG-4 — expected
  strings come from the *Message* column, not from spec prose);
  `docs/reference/errors-and-results.md:88`, `:110` and
  `docs/reference/diagnostics.md:236` (the mirrors, none carrying the vector).
- Locking tests (unchanged by the fix):
  `tests/placeholder-rendering.test.ts:123–124` (the renderer-side pins for
  both vectors' `<key>` renderings);
  `tests/missing-object-key-rendering.test.ts` (bug 0036's emission-site lock
  — registry read at `:130–139`, expected literals at `:159` / `:161`, the
  `o["kind"]` bare control at `:334–348`, the spelled-out vector strings at
  `:417–418`, the `:19` verbatim quotation at `:322`).
- Verification at HEAD `f959f8de`: every citation above read from the tree;
  `rg` over `docs/` for `A member access` and over `docs/reference/` for
  `missing object key` (both quoted in §Reproduction); `rg` over
  `tests/`, `tools/` and `src/` for any read of `placeholder-rendering-b.md`
  prose — none. No scratch files written; no code executed.
