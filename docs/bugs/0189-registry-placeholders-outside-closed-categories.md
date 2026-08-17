# Bug 0189 — `placeholder-rendering-a.md` §Closure makes the eight categories the whole admitted `<…>` vocabulary of the registry's *Message* column and closes it under GOV-7 / GOV-8, but nine shipped rows interpolate seven tokens no category and no carve-out clause names (`<teardown error first line>`, `<exit detail>`, `<line summary>`, `<detail>`, `<resolved>`, `<N>`, `<binder>`), while category 6 still enumerates `<dispose error first line>` — the pre-rename name the commit that renamed it left behind; no sentence in either artifact says which one moves, four of the seven are host- or run-variable tails that GOV-15 therefore promises byte-identical, and the closure's own "enforced at build time" clause has no gate

- **Status:** open. §Fix is not settled: this report exists to pin the spec
  disposition. One of the three candidate routes is foreclosed by measurement
  (DIAG-4 defers *Message* rewording to theta 2.0), and the choice between the
  two that remain is an operator decision under the GOV-7 / GOV-8 posture
  `placeholder-rendering-a.md:5` and `:7` assign this surface. No code change is
  proposed — every rendered byte is what the registry rows and the
  implementation agree on. No ordering dependency: nothing blocks this and it
  blocks nothing.
- **Sev/Diff estimate:** S4/D2 — spec-prose defect with no author-visible
  behaviour change (every emitted string is the registry's own and is pinned by
  shipped tests), and the remedy is a prose edit confined to the two
  `placeholder-rendering-*.md` pages with no `docs/reference/` mirror and no
  implementation byte, but it must adjudicate which artifact moves, name a
  GOV-7 / GOV-8 question, and reconcile nine rows plus the reverse-direction
  stale name in one commit.
- **Kind:** spec-prose defect — two normative artifacts disagree about the same
  closed surface and neither states which one is authoritative, in five
  measured elements.
  1. *Seven Message tokens are in no category and no carve-out clause.* The
     closure paragraph (`placeholder-rendering-a.md:7`) admits a `<…>` token in
     the *Message* column only via clause (a) (categories 1–7), (b) (§8), or the
     four named bespoke carve-outs (c) `<list>`, (d) `<failure>`, (e)
     `<observed>`, (f) `<read>`, then states: "No other placeholders are
     admitted; this closure is enforced at build time." Nine rows across
     `code-registry-runtime.md` and `code-registry-parse.md` interpolate seven
     tokens that satisfy no clause (§Reproduction R1, R5).
  2. *Category 6 enumerates a token no row carries.* `<dispose error first line>`
     (`placeholder-rendering-b.md:24`) is the pre-rename name; the row it named
     has carried `<teardown error first line>` since `fda23a4b` (v0.8.0), which
     edited that category's *test vector* to the re-scoped teardown wording and
     left its *Placeholders* line at the old name (§Reproduction R6).
  3. *Two admitted tokens sit under a category rule that cannot render what the
     row interpolates.* `<expected>` / `<actual>` are category 1 (Theta static
     types, `a.md:11–13`), but `code-registry-parse.md:60` renders integer
     type-argument counts through them and
     `code-registry-runtime.md:35` renders a model reference through `<expected>`.
  4. *The closure sentence's quantifier is over `<…>` tokens, and five Message
     templates carry `<…>` tokens that are literal source-grammar spellings
     rather than placeholders* — three distinct spellings: `array<T>`
     (`parse.md:38`, `:66`), `@<Schema>` (`:75`, `:76`), `invoke<Schema>`
     (`:121`). Read literally the sentence sweeps them in and admits none of
     them.
  5. *Nothing detects any of the above.* No gate enumerates Message-column
     tokens against the categories (§Reproduction R7), so the "enforced at build
     time" clause of the same sentence describes no artifact in the tree.
- **Related:**
  [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) — the filing
  origin and the compliant precedent. Its fix (v0.105.0, `bf32ad03`) registered
  `theta/runtime/subagent-return-value-not-representable`
  (`code-registry-runtime.md:32`) and deliberately reused the category-2
  `<value>` rather than coin a placeholder for a JSON Pointer, carrying the
  position in the emitted `message` and the pointer to the category-2 rule in
  its own *Trigger* prose. `.pi/tmp/fixes/0180-report.md` §Lesser notes item 5
  records the corpus state this report holds: "the corpus *does* already contain
  registry Message placeholders absent from the eight closure categories … a
  pre-existing closure-vs-registry inconsistency I neither widened nor chased."
  [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md) —
  the same class one level down, open: the closed `<construct>` token-name
  *value* table of the same page under-enumerates what the parser renders. Here
  the under-enumerated table is the category-to-placeholder map itself, which
  `a.md:5` names as the surface whose governance posture that value table
  borrows. Both reports ask the same question of the same page and a fix to
  either does not answer the other.
  [0117](./0117-error-model-omits-parse-coded-interpolation-panic.md) — the
  enumeration-one-generation-behind precedent, open: a closed list of six panic
  sources against a seventh shipped panic. Same shape (the list, not the
  behaviour, is wrong) and same disposition (spec-side, no code change).
  [0112](./0112-containment-records-inv5-label-and-coverage-row.md) — the
  records-disagree precedent, open: two shipped records disagree with the tree
  and the fix is mechanical prose once the authority is named.
  [0086](./0086-subagent-wire-parse-failed-no-emitter.md) — open, and it owns
  the one row here that has no emitter: `theta/runtime/subagent-wire-parse-failed`
  (`code-registry-runtime.md:27`, `<line summary>`) appears nowhere in `src/`.
  Its *Message* is still normative under DIAG-4 and still carries an unadmitted
  token, so this report covers the row's template whichever way 0086 settles.
- **Affected** (every citation read from the tree at HEAD `bf32ad03`, 0.105.0):
  - **The closed surface** —
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:3` (the §
    heading), `:5` (the lead-in: eight categories, "so two conformant
    implementations produce byte-identical strings … for the same source
    defect", and the GOV-7 / GOV-8 posture sentence), `:7` (§Closure: the
    clause list (a)–(f), "No other placeholders are admitted; this closure is
    enforced at build time", and the GOV-7 / GOV-8 breaking-change sentence),
    `:9`/`:11`/`:13` (category 1 heading, placeholder list, static-type rule),
    `:28`/`:30` (category 2), `:43`/`:45` (category 3), `:75`/`:77`/`:79`
    (category 4 and its integer rule), `:81` (the `<required>` / `<provided>`
    per-site scope note — the corpus's existing precedent for splitting one
    token's rule across categories);
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:3`/`:5`/`:7`
    (category 5), `:22`/`:24`/`:34` (category 6 heading, the placeholder list
    naming `<dispose error first line>`, the first-line-truncation rule), `:27`
    (the underlying-error coercion anchor), `:47` (the category-6 test vector
    `fda23a4b` rewrote to "A subagent child-process teardown error"),
    `:49`/`:51`/`:53` (category 7), `:82`/`:84`/`:86` (category 8 heading,
    placeholder list, host-derived rule), `:133` (the closed-enum-closure edge
    case), `:134` (the §8 prefix/suffix-anchoring edge case, whose build-time
    prohibition enumerates "registry rows whose Message templates contain a §8
    placeholder").
  - **The nine rows** — `docs/spec_topics/diagnostics/code-registry-runtime.md:24`
    (`subagent-dispose-failure`, `<teardown error first line>`), `:26`
    (`subagent-child-crashed`, `<exit detail>`), `:27`
    (`subagent-wire-parse-failed`, `<line summary>`), `:28`
    (`subagent-envelope-parse-failed`, `<line summary>`), `:30`
    (`subagent-exit-without-envelope`, `<exit detail>`), `:31`
    (`subagent-params-validation-failed`, `<detail>`), `:35`
    (`subagent-model-preflight-mismatch`, `<expected>` + `<resolved>`), `:40`
    (`reload-teardown-timeout`, `<N>` alongside the admitted `<ms>` and the
    clause-(c) `<list>`);
    `docs/spec_topics/diagnostics/code-registry-parse.md:64`
    (`shadowed-callable-call`, `<binder>`, whose *Trigger* prose carries an
    inline rendering rule — "renders the shadowing binder and its line, e.g.
    `let binding at line 6`" — with no closure clause pointing at it, unlike
    `<read>`'s clause (f)).
  - **The reverse direction** —
    `docs/spec_topics/diagnostics/code-registry-runtime.md:9` (the table
    preamble, which names "`<error.message>`, `<error>`, and
    `<dispose error first line>`" as the caught-throw placeholders of the rows
    below; the third is carried by no row on the page);
    `src/diagnostics/placeholder.ts:238` (the implementation's category-6
    comment, same pre-rename list). `<file>` (`b.md:5`) and `<uuid>` (`b.md:51`)
    appear in no *Message* cell on any of the four pages (§Reproduction R4).
  - **The mirror** — `docs/reference/diagnostics.md:7` (the DIAG-4
    transcription claim: "renderers emit it character-for-character with `<…>`
    placeholders interpolated"), `:110`, `:252`, `:254`, `:255`, `:256`, `:258`,
    `:259`, `:263`, `:268` (the same nine rows, same tokens), `:303` and `:379`
    (Provenance: the *Message* column is transcribed verbatim from the four spec
    registry pages). The reference corpus carries no copy of the placeholder
    categories: `rg -n 'Static-type placeholders|Underlying-error placeholders|Host-derived freeform' docs/reference/`
    is empty.
  - **The governing rules** —
    `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
    (DIAG-2), `:74` (DIAG-4: the *Message* column is normative, "renderers MUST
    emit it character-for-character with placeholders interpolated", and
    "Wording changes are spec-versioned breaking changes, deferred to theta 2.0
    migration"), `:80` (the column legend: "*Message* is the rendered
    author-facing string template (one line; `<…>` placeholders are interpolated
    by the renderer)");
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
    whose observable-(c) normalisation list is keyed "as classified by the
    placeholder-rendering categories"), `:9` (the loads-cleanly predicate),
    `:25` (the diagnostic-registry carve-out);
    `docs/spec_topics/governance/req-id-prefix-table-active-b.md:35` (GOV-7),
    `:49` (GOV-8 and its *Pure rewording* boundary);
    `docs/spec_topics/governance/req-id-prefix-table-active-a.md:69` (the
    `diagnostics/` → `DIAG` prefix row). Neither
    `placeholder-rendering-a.md` nor `-b.md` carries a `**DIAG-N.**` paragraph
    (`grep -c 'DIAG-'` on both pages returns `0`), so no REQ-ID retires under
    either disposition.
  - **The DIAG-4 witnesses on the affected rows** —
    `tests/subagent-isolation.test.ts:212–219` (the dispose-failure row: a
    `toBe` against the full rendered string
    `"subagent teardown failed: stdin close exploded"`, with the comment at
    `:213–215` citing the registry template by its `<teardown error first line>`
    spelling); `tests/host-peer-version-and-model.test.ts:336–343` (the
    model-preflight row's full string, `<expected>` and `<resolved>`
    substituted, asserted three times — on `error.message`, on
    `diagnostic.message`, and on the renderer's own output);
    `tests/session-shutdown.test.ts:71–72` (the
    reload-teardown-timeout template helper, `<N>` as a parameter);
    `tests/shadowed-callable-call.test.ts:125–132` (the `<binder>` template
    helper, whose doc comment calls it "the DIAG-4 byte-identical discipline").
    The remaining rows are asserted by code, not by rendered string.
  - **The emitting sites** (unchanged by any disposition, cited so the fix can
    confirm no byte moves) — `src/runtime/subagent-isolation.ts:79`,
    `src/runtime/subagent-json-driver.ts:159`,
    `src/runtime/subagent-envelope.ts:295`,
    `src/runtime/subagent-params.ts:305–306`,
    `src/runtime/subagent-model-guard.ts:74–78`,
    `src/extension/session-shutdown.ts:286`,
    `src/parser/theta-document.ts:5320`.
- **Observed at:** `0.105.0` (`bf32ad03`). Doc-versus-doc measurement; no
  runtime probe and no live model. Method: `rg` over the four registry pages,
  the two placeholder-rendering pages, `docs/reference/diagnostics.md`, `src/`,
  `tests/` and `tools/`, plus two `python` set-difference passes over the
  *Message* column (the last table cell of every row line, escaped `\|`
  protected) run from stdin heredocs — no file was written to the tree — and
  read-only `git log` / `git show`.

## Summary

`placeholder-rendering-a.md:7` closes the placeholder vocabulary. Every `<…>`
token in the *Message* column of the four registry pages must be a placeholder
enumerated in categories 1–7, a §8 placeholder, or one of four named bespoke
carve-outs; "No other placeholders are admitted; this closure is enforced at
build time"; introducing, retiring or re-categorising a placeholder is a
spec-versioned breaking change under GOV-7 and GOV-8.

The two sets do not match, in both directions.

The 201 rows carry 76 distinct `<…>` tokens in their *Message* cells. The eight
categories plus the three bespoke carve-out placeholders name 73. 67 names are
in both. **Nine tokens are in the registry and in no clause of the closure
paragraph** — seven placeholders (`<teardown error first line>`, `<exit detail>`,
`<line summary>`, `<detail>`, `<resolved>`, `<N>`, `<binder>`) across nine rows,
and three literal source-grammar spellings the sentence's quantifier does not
exclude (`array<T>`, `@<Schema>`, `invoke<Schema>`). **Six names are in the
closure and in no *Message* cell** — `<dispose error first line>` (the pre-rename
name of the token `subagent-dispose-failure` now carries), `<file>` and `<uuid>`
(named in categories 5 and 7, rendered by nothing), and `<message>`,
`<slash-name>`, `<invocation-id>` (reachable through the *Trigger*-prose
system-note template and clause (c)'s `<list>` decomposition rather than through
a *Message* cell of their own).

Neither artifact yields. The closure sentence says the categories are the whole
vocabulary; DIAG-4 (`diagnostic-shape.md:74`) makes each row's *Message* normative
and defers wording changes to theta 2.0. A reader who needs the rendering rule
for `<exit detail>` gets a table that does not list it and a Message column that
may not be reworded to avoid it.

The gap is not inert. GOV-15's observable (c) normalises exactly three classes of
per-run variability — per-invocation identifiers, wall-clock-derived values, and
"the category-8 host-derived freeform tails" — "as classified by the
placeholder-rendering categories" (`source-language-stability.md:5`). Four of the
seven unnamed tokens bind host- or run-variable strings (a caught teardown
throw's first line, an OS exit code or signal, a truncated offending wire line,
an AJV error). Classified by no category, they fall outside all three normalised
classes, so GOV-15 as written promises their renderings byte-identical across
theta 1.x — a promise no implementation can keep. For the same reason §8's
build-time prohibition on strict-equality assertions, whose scope is "registry
rows whose Message templates contain a §8 placeholder" (`b.md:134`), does not
reach those four rows, and `tests/subagent-isolation.test.ts:219` does assert
one of them with `toBe` against its full rendered string.

Nothing in the tree detects the disagreement, so the closure's own "enforced at
build time" clause is the second false statement in the same sentence.

## Reproduction

Doc-versus-doc at HEAD `bf32ad03` (0.105.0). Every command below was run from
the repository root; output is transcribed verbatim.

**R1 — the nine rows.** One `rg` over the two pages that carry them:

```console
$ rg -c 'teardown error first line|exit detail|line summary|: <detail>|<resolved>|<N> invocation|the local <binder>' \
    docs/spec_topics/diagnostics/code-registry-parse.md docs/spec_topics/diagnostics/code-registry-runtime.md
docs/spec_topics/diagnostics/code-registry-runtime.md:8
docs/spec_topics/diagnostics/code-registry-parse.md:1
```

The nine lines, with the *Message* template each carries:

| Row | Line | *Message* template | Unadmitted token |
|---|---|---|---|
| `theta/runtime/subagent-dispose-failure` | `runtime.md:24` | `subagent teardown failed: <teardown error first line>` | `<teardown error first line>` |
| `theta/runtime/subagent-child-crashed` | `:26` | `subagent child crashed: <exit detail>` | `<exit detail>` |
| `theta/runtime/subagent-wire-parse-failed` | `:27` | `subagent event-stream line parse failed: <line summary>` | `<line summary>` |
| `theta/runtime/subagent-envelope-parse-failed` | `:28` | `subagent return envelope parse failed: <line summary>` | `<line summary>` |
| `theta/runtime/subagent-exit-without-envelope` | `:30` | `subagent child exited without a return envelope: <exit detail>` | `<exit detail>` |
| `theta/runtime/subagent-params-validation-failed` | `:31` | `subagent marshalled params failed schema validation: <detail>` | `<detail>` |
| `theta/runtime/subagent-model-preflight-mismatch` | `:35` | `subagent model pre-flight mismatch: expected '<expected>', child resolved '<resolved>'` | `<resolved>` |
| `theta/runtime/reload-teardown-timeout` | `:40` | `reload teardown timed out after <ms>ms; <N> invocation(s) still in flight: <list>` | `<N>` |
| `theta/parse/shadowed-callable-call` | `parse.md:64` | `call of '<name>' resolves to the local <binder> that shadows the callable-set entry '<name>'; locals are not callable` | `<binder>` |

**R2 — none of the seven tokens appears on either placeholder-rendering page.**

```console
$ rg -c 'teardown error first line|exit detail|line summary|<detail>|<resolved>|<N>|<binder>' \
    docs/spec_topics/diagnostics/placeholder-rendering-a.md docs/spec_topics/diagnostics/placeholder-rendering-b.md
$ echo $?
1
```

No match on either page: no *Placeholders* line, no rule, no test vector, no
carve-out clause, no edge case.

**R3 — the mirror carries the same nine rows and the same tokens.**

```console
$ rg -n 'teardown error first line|exit detail|line summary|: <detail>|<resolved>|<N> invocation|the local <binder>' \
    docs/reference/diagnostics.md
```

Eleven lines: the nine registry rows (`:110`, `:252`, `:254`, `:255`, `:256`,
`:258`, `:259`, `:263`, `:268`), plus `:19` (`// single-line summary` in the
`Diagnostic` shape block) and `:345` (Provenance prose). The mirror transcribes
the drift faithfully, so no disagreement exists between the spec registry and its
reference copy on these rows.

**R4 — the reverse direction.** The only occurrence of any of
`<dispose error first line>`, `<file>`, `<uuid>` anywhere in the four registry
pages is the runtime table's preamble:

```console
$ rg -n '<uuid>|<file>|dispose error first line' docs/spec_topics/diagnostics/code-registry-*.md
docs/spec_topics/diagnostics/code-registry-runtime.md:9:Wherever a row below carries a caught throw's error message — in its Message template (the `<error.message>`, `<error>`, and `<dispose error first line>` placeholders) …
```

That preamble sentence names three caught-throw placeholders "in its Message
template"; the third is in no Message template on the page.

**R5 — the two-way set difference.** The *Message* column is the last cell of
each row line; `\|` is protected before splitting. The eight *Placeholders*
lists are transcribed from `a.md:11`, `:30`, `:45`, `:77` and `b.md:5`, `:24`,
`:51`, `:84`; the three bespoke carve-out placeholders are `<list>`,
`<failure>`, `<read>`.

```console
$ python - <<'PY'
import re
tok=re.compile(r'<[A-Za-z][A-Za-z0-9. -]*>')
A=set()
for p in ["parse","load","runtime","host"]:
    for line in open(f"docs/spec_topics/diagnostics/code-registry-{p}.md",encoding='utf-8'):
        s=line.rstrip('\n')
        if not s.startswith('| `theta/'): continue
        A|=set(tok.findall(s.replace('\\|','\x00').split('|')[1:-1][-1]))
cats=[["<type>","<expected>","<actual>","<left>","<right>","<element>"],
["<scrutinee summary>","<value>"],
["<construct>","<expr>"],
["<i>","<length>","<depth>","<offset>","<count>","<index>","<required>","<provided>","<max>"],
["<path>","<file>","<descriptor>","<name>","<field>","<param>","<variant>","<keyword>","<key>","<char>"],
["<error.message>","<original content first line>","<dispose error first line>"],
["<callee>","<enum>","<schema>","<method>","<model>","<provider>","<slash-name>","<slug>",
 "<invocation-id>","<uuid>","<name1>","<name2>","<X>","<A>","<B>","<root>","<paths>","<path-a>",
 "<path-b>","<source>","<higher>","<lower>","<fields>","<ms>","<deadline>","<cap>","<capability>",
 "<dotted-key>","<reason>","<kind>","<op>","<step>","<call>","<ctor>","<receiver kind>","<value>"],
["<error>","<message>","<observed>"]]
B=set(sum(cats,[]))|{"<list>","<failure>","<read>"}
print("|A|",len(A),"|B|",len(B),"both",len(A&B))
print("A only",len(A-B),sorted(A-B))
print("B only",len(B-A),sorted(B-A))
PY
|A| 76 |B| 73 both 67
A only 9 ['<N>', '<Schema>', '<T>', '<binder>', '<detail>', '<exit detail>', '<line summary>', '<resolved>', '<teardown error first line>']
B only 6 ['<dispose error first line>', '<file>', '<invocation-id>', '<message>', '<slash-name>', '<uuid>']
```

The same pass over `docs/reference/diagnostics.md` returns the identical
`A only` set.

Reading the two residues:

- `A only`, seven placeholders — the R1 table.
- `A only`, three literal spellings — `<T>` in `indexed access requires an
  array<T> or object receiver; got <type>` (`parse.md:38`) and `'for' expects
  array<T> after 'in'; got <type>` (`:66`); `<Schema>` in `explicit @<Schema>
  ascription is not compatible with binding annotation` (`:75`), in the
  `empty-query-annotation` template (`:76`) and in `invoke<Schema> annotation
  incompatible with callee '<callee>' return type <actual>` (`:121`). These
  interpolate nothing; they are source-grammar text inside the template. The
  closure sentence quantifies over "Every `<…>` token appearing in the *Message*
  column", not over placeholders, and admits no clause that covers them.
- `B only`, three reachable — `<slash-name>` and `<invocation-id>` are rendered
  inside clause (c)'s `<list>` decomposition (`runtime.md:40`); `<message>`
  appears in `theta/runtime/internal-error`'s *Trigger*-prose system-note
  template (`runtime.md:22`, `theta /<name> aborted with internal error:
  <message>`) and in `diagnostic-shape.md:63`'s serialised note-line format.
  None is a defect against the closure sentence, which ranges over the *Message*
  column only.
- `B only`, three unrendered — `<dispose error first line>` (R6), `<file>`, and
  `<uuid>`, the last two named in categories 5 and 7 and interpolated by no row.

**R6 — the category-6 name is one generation behind, and one commit did both
halves.** Read-only `git show`:

```console
$ git show fda23a4b^:docs/spec_topics/diagnostics/code-registry-runtime.md | grep -o 'subagent dispose[^|]*'
subagent dispose failed: <dispose error first line>`.
$ git show fda23a4b:docs/spec_topics/diagnostics/code-registry-runtime.md | grep -o 'subagent teardown[^|]*'
subagent teardown failed: <teardown error first line>`.
$ git show fda23a4b -- docs/spec_topics/diagnostics/placeholder-rendering-b.md | grep -E '^[-+][^-+]' | cut -c1-96
-- An `AgentSession.dispose()` rejection whose error message is `connection closed\nstack trace
+- A subagent child-process teardown error whose message is `connection closed\nstack trace ...
```

`fda23a4b` (2026-07-24, v0.8.0, RFC 0005) renamed the row's *Message* token and
rewrote category 6's test vector to match the re-scoped trigger, in the same
commit, and left category 6's *Placeholders* line (`b.md:24`) naming
`<dispose error first line>`. `src/diagnostics/placeholder.ts:238` carries the
same pre-rename list.

**R7 — no gate.** The `package.json` scripts are `build`, `typecheck`, `lint`,
`test` (plus `test:live`). The registry-reading tool is
`tools/code-registry/index.js`, whose exports are `parseRegistry`,
`registryMessage`, `reconcileClosedSet` and `reconcileStableIds` — DIAG-2 /
DIAG-3 / DIAG-4 reconciliation, no placeholder logic:

```console
$ rg -n 'placeholder' tools/code-registry/index.js
$ rg -n 'placeholder' tools/ | rg -v 'closing-gate'
```

Both empty; the `tools/closing-gate` hits are its unrelated `<new>`
coverage-matrix token. `tests/placeholder-rendering.test.ts` reads the four
registry pages (`:35–47`) but only to source one category-8 row's template
through `registryMessage` (`:181–186`); it asserts the eight rules against
hand-written inputs and never enumerates the *Message* column's tokens. So
nothing in `build`, `typecheck`, `lint` or `test` can see the residues R5
reports.

**R8 — the elements-3 sites.** `<expected>` and `<actual>` are category-1
static-type placeholders (`a.md:11`, rule at `:13`: "Render the Theta static
type by re-serialising it in the source-grammar form"). Ten Message cells carry
`<expected>`; eight are static-type positions. The other two are not:

```console
$ rg -n 'generic type .<ctor>. expects|child resolved' docs/spec_topics/diagnostics/code-registry-*.md
```

- `code-registry-parse.md:60` — `generic type '<ctor>' expects <expected> type
  argument(s); got <actual>`. Both render integer counts. Category 4 (numeric)
  lists neither, and §7's own `<ctor>` bullet (`b.md:72`) quotes this template
  without remarking on it.
- `code-registry-runtime.md:35` — `subagent model pre-flight mismatch: expected
  '<expected>', child resolved '<resolved>'`. `<expected>` renders a
  provider/model reference (`src/runtime/subagent-model-guard.ts:74–78`); the
  identifier-shaped `<model>` is what category 7 provides for that, and
  `<resolved>` is unnamed anywhere.

Category 4 already carries the device for this — `a.md:81`, the "Scope of
`<required>` / `<provided>`" note, which splits one token's rule across two
categories per emitting site — so the corpus has a precedent and these two rows
are outside it.

**R9 — the compliant row, as the control.** `code-registry-runtime.md:32`
(`theta/runtime/subagent-return-value-not-representable`, landed `bf32ad03`)
carries `<value>`, an admitted category-2 placeholder, and its *Trigger* prose
names the rule it renders by: "`message` names the offending value rendered per
the category-2 `<value>` rule and, when the offending value sits below the
returned payload's root, carries its RFC-6901 JSON Pointer position." R5's
`A only` set does not contain `<value>`. This is the shape the nine rows lack.

## Expected behaviour

- **The closure paragraph is exhaustive or it is not closed.**
  `placeholder-rendering-a.md:7` enumerates six admission clauses and then
  states "No other placeholders are admitted". A token in the *Message* column
  that satisfies no clause is either an admitted placeholder the paragraph fails
  to name, or an unregistered placeholder in a shipped row. The paragraph
  provides no third reading.
- **Every Message-column placeholder has exactly one rendering rule.**
  `a.md:5` states the purpose: the categories exist "so that two conformant
  implementations produce byte-identical strings (or byte-identical surround
  around an implementation-defined-tail interpolation, for category 8) for the
  same source defect". A second implementation reading `runtime.md:26` must be
  able to derive how `<exit detail>` renders. Today it derives nothing: the
  token is in no category, so no truncation rule, no coercion rule and no
  quoting rule attaches to it.
- **A bespoke placeholder gets a closure clause.** That is the corpus's own
  practice for exactly this situation, three times: clause (c) for `<list>`
  (whose rule lives in the `reload-teardown-timeout` row's prose), clause (d)
  for `<failure>`, clause (f) for `<read>` (added with bug 0027's fix, and
  cross-referenced from `runtime.md:23` back to the clause). `<binder>`
  (`parse.md:64`) is the same construction — an inline rendering rule in the
  row's own *Trigger* prose — and has no clause.
- **A category's *Placeholders* line names the tokens rows carry.** Category 6
  names `<dispose error first line>`; the rename to `<teardown error first line>`
  landed in `fda23a4b` together with that category's test-vector rewrite. The
  half that was left behind makes the category's own list unsatisfiable by any
  row.
- **GOV-15 can classify every placeholder.** Observable (c)'s normalisation list
  is defined "as classified by the placeholder-rendering categories"
  (`source-language-stability.md:5`). A per-run-variable token that belongs to no
  category cannot be normalised, and therefore falls under the byte-identical
  requirement — which for a host exit signal, a caught throw's first line, a
  truncated wire line and an AJV message is unmeetable.
- **A closed surface claiming build-time enforcement has a build-time
  enforcement.** `a.md:7` ends "this closure is enforced at build time".
  Reproduction R7 finds no such gate.

## Actual behaviour / root cause

1. **Nine rows interpolate seven unnamed tokens.** R1. Seven of the nine are the
   RFC 0005 / RFC 0006 subagent rows — one of those, `subagent-wire-parse-failed`,
   has no emitter anywhere in `src/`
   ([0086](./0086-subagent-wire-parse-failed-no-emitter.md)); the remaining two
   are the pre-existing `reload-teardown-timeout` row and
   `shadowed-callable-call` from bug 0016's fix. Each token's rendering is defined
   only by its emitting site.
2. **The additions never reached the closure paragraph.** `git show --stat`:
   `fda23a4b` (v0.8.0, RFC 0005) touched `code-registry-runtime.md` and
   `placeholder-rendering-b.md` — but on the latter only two test vectors
   (R6), not the *Placeholders* lists or the closure clause list. `4866d4d2`
   (v0.9.0, RFC 0006), which landed `<detail>`, both `<exit detail>` rows and
   both `<line summary>` rows, touched no placeholder-rendering page at all.
   `bfd6f7c5` (v0.22.0, bug 0016's fix), which landed `<binder>`, touched only
   `code-registry-parse.md`. `<N>` was never covered, not even at the closure
   paragraph's origin: `5e8b4996` (2026-05-06) added the
   `reload teardown timed out after <ms>ms; <N> invocation(s) still in flight: <list>`
   template one day before `f9308182` (2026-05-07) added the closure sentence,
   and that first version of the sentence already carried the bespoke-`<list>`
   carve-out for the very same row — the author carved out one of that row's
   two unadmitted tokens and left the other.
3. **Two admitted tokens render what their category's rule cannot describe.**
   R8. Clause (a) is satisfied nominally — the token is on a *Placeholders* line
   — while the rule that clause points at (re-serialise a Theta static type) does
   not apply to an integer count or a model reference.
4. **The sentence's quantifier over-reaches.** R5's three literal spellings
   (`array<T>`, `@<Schema>`, `invoke<Schema>`) are `<…>` tokens in *Message*
   cells and are admitted by no clause. No reader is confused by them in
   practice, which is why they have survived; they are evidence that the
   sentence is quantified over the wrong thing.
5. **Nothing can detect any of it, and the enforcement claim lost its anchor by
   policy.** R7. The first version of the sentence (`f9308182`, 2026-05-07) read
   "the V18s closing CI gate enforces this closure (see [V18s — Coverage-matrix
   closing CI gate](…))" — a named plan leaf. `9e536136` (2026-05-26) rewrote it
   to "this closure is enforced at build time" with no link, as one item in a
   corpus-direction sweep dropping plan-leaf references from the spec corpus; the
   sweep's own note in that diff records the substitution verbatim. `V18s` no
   longer appears anywhere under `docs/`, and no gate in `tools/` performs the
   check. The category renderers in `src/diagnostics/placeholder.ts` take values,
   not placeholder names (`renderUnderlyingError(caught: unknown)` at `:246`), so
   the closed vocabulary has no representation in the implementation either — the
   same absence bug 0063 measured for category 3's `renderConstruct`.

Root cause: the closure lives on a page that no gate reads and that a
registry-row edit is not required to touch. Each row addition was governed by
DIAG-2 (a code addition is a spec change, and each of these codes did land its
row in the same commit) and by DIAG-4 (the *Message* column is normative), and
both obligations were met. Neither rule mentions the placeholder vocabulary, the
closure paragraph is two pages away from the tables it quantifies over, and its
"enforced at build time" clause substituted for a gate that was never built. The
category-6 half-rename is the same failure inside a single commit: the row and
the category's test vector moved, the category's placeholder list did not.

## Why it matters

- **Two normative artifacts contradict each other on the same surface and
  neither yields.** DIAG-4 makes each row's *Message* normative and defers
  wording changes to theta 2.0 (`diagnostic-shape.md:74`), so the rows cannot
  move within theta 1.x. The closure paragraph says the categories are the whole
  vocabulary. A contributor adding the tenth such row cannot tell whether they
  must extend a GOV-7 / GOV-8-governed table or whether the table does not
  govern them.
- **GOV-15 promises what these four rows cannot deliver.** `<teardown error
  first line>`, `<exit detail>`, `<line summary>` and `<detail>` bind
  host-supplied or run-dependent strings. GOV-15 normalises per-run variability
  only for the three classes it names, keyed by placeholder category; an
  unclassified token is outside all three, so its rendering is promised
  byte-identical across theta 1.x. An OS exit signal and an AJV error message
  are not byte-stable across runs, let alone across releases.
- **The §8 test-conformance prohibition cannot see those rows.** `b.md:134`
  detects a non-conformant full-string equality assertion "by enumerating
  registry rows whose Message templates contain a §8 placeholder". None of the
  four host-derived tails is a §8 placeholder, so the enumeration skips them,
  and `tests/subagent-isolation.test.ts:219` asserts one of them with `toBe`
  against the full rendered string. That test is legal today and would be
  non-conformant the moment the token is classified into §8 — a change the
  disposition must carry.
- **The rendering rules that would apply are not obvious from the site.**
  `<detail>` binds an AJV error string, `<line summary>` a truncated wire line,
  `<exit detail>` a code-or-signal phrase. Whether each is first-line-truncated,
  whether the §6 caught-throw coercion applies, and whether `<no message>` is
  substituted on empty are exactly the questions the categories answer for the
  tokens they name — and are answered differently by category 6 and category 8.
  `runtime.md:9` asserts the §6 coercion for the row that carries `<teardown
  error first line>`, using its pre-rename name; nothing states it for
  `<exit detail>` or `<line summary>`.
- **A precedent is being set in the wrong direction.** Bug 0180's fix took the
  costly route — reusing category 2's `<value>` and carrying the JSON Pointer in
  prose — precisely because the closure sentence made a new placeholder a
  spec-versioned change (`.pi/tmp/fixes/0180-report.md` §Lesser notes 5). Nine
  rows already carry unregistered placeholders. Either that discipline is
  required and nine rows violate it, or it is not and 0180 paid for nothing.
- **The count-bearing prose is affected.** `a.md:5` and `:7` both say "eight
  categories", and `b.md:133`'s edge case enumerates the closed value tables.
  Whatever the disposition, the reader-facing claim "these eight categories are
  the vocabulary" is false today for nine rows in the shipped registry and its
  shipped reference mirror.

## Fix

Not decided here. The question is which artifact moves: the closure paragraph
and the category lists, which under-describe what the registry renders, or the
scope of the closure sentence, which claims more than the categories cover. The
constraints below hold either way.

**Constraint 1 — no *Message* byte may move, so the reword route is closed.**
Re-wording the nine rows to reuse admitted placeholders is not available within
theta 1.x: DIAG-4 (`diagnostic-shape.md:74`) makes wording changes
"spec-versioned breaking changes, deferred to theta 2.0 migration and outside
the GOV-15 diagnostic-registry carve-out", and the carve-out (`:25` of
`source-language-stability.md`) admits code additions and removals, not template
edits. This is a measurement, not a preference: it removes one of the three
candidate routes and leaves the adjudication between describing the tokens and
re-scoping the sentence.

**Constraint 2 — the nine rows are one surface.** Any disposition covers all
nine in the same commit, plus the category-6 reverse-direction name. Fixing the
seven subagent rows leaves the paragraph in the same state for `<N>` (2026-05-06,
older than every one of them) and `<binder>` (2026-07-27, newer than every one of
them), which is the span the class already covers.

**Constraint 3 — a category-list edit has no mirror; a Message edit has nine.**
`docs/reference/` carries the *Message* column (`diagnostics.md:110`, `:252`,
`:254`, `:255`, `:256`, `:258`, `:259`, `:263`, `:268`) and **no** copy of the
placeholder categories (`rg` for the three category headings in
`docs/reference/` is empty). So an edit confined to `placeholder-rendering-a.md`
and `-b.md` is a two-file spec edit with no reference-corpus obligation, and the
mirror is touched only if a template moves — which Constraint 1 forbids.

**Constraint 4 — the GOV-7 / GOV-8 question must be named, not assumed.** The
closure sentence makes "Introducing a new placeholder, retiring one, or moving a
placeholder between categories" a spec-versioned breaking change. Codifying a
placeholder the registry has rendered since v0.8.0 is none of the three on its
face, and GOV-8's *Pure rewording* test
(`req-id-prefix-table-active-b.md:49` — substantive iff the change "alters which
inputs are accepted, which outputs are produced, which diagnostics fire, or
which invariants hold") is not met by an enumeration that leaves every rendered
byte identical. Against that, adding a name to a table the same sentence calls
closed does change which invariant holds *of the table*. The disposition must
state which reading it takes; neither page carries a `**DIAG-N.**` paragraph, so
no REQ-ID retires either way (`grep -c 'DIAG-'` on both pages returns `0`).

**Constraint 5 — the reverse direction lands in the same commit.** Category 6's
*Placeholders* line (`b.md:24`), the runtime table's preamble (`runtime.md:9`)
and the implementation comment (`src/diagnostics/placeholder.ts:238`) all name
`<dispose error first line>`, which no row carries. `<file>` (`b.md:5`) and
`<uuid>` (`b.md:51`) are named and rendered by nothing; leaving them is
defensible (a name reserved for a future row) but must be stated rather than
left to inference.

**Constraint 6 — each token needs a GOV-15 classification as well as a
category.** Observable (c) keys its normalisation list on the categories
(`source-language-stability.md:5`). For every token the disposition touches it
must be derivable whether the rendering is byte-identical, a per-invocation
identifier, a wall-clock-derived value, or a host-derived freeform tail. The
four host-derived tails (§Why it matters) are the load-bearing case; `<N>` is a
plain integer count and `<binder>` and `<resolved>` are byte-stable.

**Constraint 7 — the four DIAG-4 witnesses are rewritten in place, never
deleted.** `tests/subagent-isolation.test.ts:212–219` (a `toBe` on the full
dispose-failure string, plus its comment citing the template),
`tests/host-peer-version-and-model.test.ts:336–343`,
`tests/session-shutdown.test.ts:71–72`,
`tests/shadowed-callable-call.test.ts:125–132`. No template moves under
Constraint 1, so none of the four expected strings changes; what changes is
whether the first is conformant. If any of the four host-derived tails is
classified into §8, the first witness must be re-shaped to §8's anchored
prefix/suffix partial match, and `b.md:134`'s enumeration must then cover the
newly-§8 rows.

**Constraint 8 — 0180's row is the control, not a subject.**
`code-registry-runtime.md:32` renders the admitted category-2 `<value>` and
names its rule in its own prose (R9). Whichever disposition lands must leave it
unchanged and should be readable as the pattern the nine rows are brought into
(or explicitly exempted from).

**Disposition A — describe the tokens (the closure and the category lists
move).** Assign each of the seven a rule, in the shape the corpus already uses:
the four host- or run-variable tails to §8 (host-derived freeform tail, whose
first-line-truncation rule matches what the emitting sites in
`src/runtime/subagent-*.ts` do) or to §6 where the bound value is a caught
throw; `<N>` to category 4 (an integer count, "bounded by construction" exactly
as `:79` requires); `<resolved>` to §7's identifier-shaped sub-rule alongside
`<model>`, with `<expected>` at that row given a per-site scope note in the
shape of `a.md:81`; `<binder>` to a new closure clause pointing at its row's
*Trigger* prose, exactly as clause (f) points at `<read>`'s. Element 3's
`generic-arity-mismatch` counts take the same `a.md:81` treatment. Nothing
outside the two pages changes: no template, no mirror, no implementation byte,
and no observable — the disposition Constraint 4's second reading has to price,
and Constraint 3 makes cheap.

**Disposition B — re-scope the sentence (the closure moves, the categories do
not).** State what the closure actually governs: quantify over *placeholders*
rather than over `<…>` tokens (which retires element 4 as well), and either
restrict the closed claim to the placeholders whose rendering the categories
own, or add a clause admitting a row-local placeholder whose rendering rule is
pinned in that row's own *Trigger* prose — a generalisation of clauses (c), (d)
and (f), which already do this one row at a time. This is the smaller edit and
it discharges elements 1 and 4 without answering Constraint 6: the seven
placeholders would be admitted with no category, so GOV-15's observable-(c)
classification would still have nothing to key on for the four host- or
run-variable ones. A B-shaped disposition therefore has to state the
GOV-15 classification for row-local placeholders somewhere, or GOV-15's
normalisation list has to name the new clause.

The two dispositions are not exclusive, and neither is complete without
Constraint 5's reverse-direction edit. Disposition A is the one that moves no
observable and leaves nothing for Constraint 6 to carry separately; Disposition B
is the one that stops the sentence from over-claiming. A fix that takes B without
A must say, in the same commit, how a row-local placeholder is classified under
GOV-15.

**Verification either disposition records.** Re-run R1–R5 and R8 and confirm the
`A only` and `B only` residues are what the disposition intends (empty, or a
stated exemption list); confirm `git diff -- docs/reference/` is empty unless a
template moved; confirm the four witnesses in Constraint 7 still assert the same
bytes; default suite, `npm run lint` and `npm run typecheck` green. If the
disposition claims build-time enforcement (the clause already in `a.md:7`), the
gate that discharges R7 lands in `tools/` in the same commit and is asserted by a
test that fails when a row gains an unadmitted token.

## Non-goals

- **The diagnostic taxonomy.** Which codes exist, their severities, phases and
  triggers are DIAG-2's surface and are not in question. All nine rows are
  registered, mirrored, and correct about what they report.
- **Bug 0180's row.** `code-registry-runtime.md:32` is compliant (R9) and is
  cited only as the control.
- **The absent emitter for `theta/runtime/subagent-wire-parse-failed`.** The row
  has no builder anywhere in `src/`; that is
  [0086](./0086-subagent-wire-parse-failed-no-emitter.md). Its *Message* is
  normative regardless, and its `<line summary>` is in scope here whichever way
  0086 settles.
- **Re-wording any *Message*.** Foreclosed by Constraint 1 and deferred to theta
  2.0 by DIAG-4. Element 1 is not a claim that the nine templates are badly
  worded.
- **The extra ` at <errorPath>` segment `src/runtime/subagent-params.ts:306`
  splices into the `subagent-params-validation-failed` message.** Measured, and
  it is the pattern the row's own *Trigger* prose authorises ("`message` names
  the failing param path") — the same pattern 0180's row uses for its JSON
  Pointer, and the reason 0180 could reuse `<value>`. Whether DIAG-4's
  "character-for-character" and a *Trigger*-authorised extra segment are
  reconcilable is a separate question about the *Message* column's contract, not
  about the placeholder vocabulary.
- **`theta/runtime/custom-type-unsafe`'s `<value>`** (`runtime.md:41`). It is in
  neither category 7's parse-time row list nor named by category 2, but category
  2's "distinguished by emitting site" clause covers a runtime site, so it is
  admitted. Recorded as measured, not as a finding.
- **`docs/reference/diagnostics.md`'s missing `theta/runtime/non-object-receiver`
  row.** Measured while sweeping the mirror: the spec registry has the row
  (`runtime.md:23`, `<read>` + `<receiver kind>`, landed with bug 0027's fix in
  0.39.0), the mirror has no line for it, and the mirror's Provenance (`:303`,
  `:379`) claims verbatim transcription of the four spec pages. It is a mirror
  completeness defect on a different row and is unfiled; it is out of scope here
  and is called out so a fix sweeping the mirror does not assume row-for-row
  parity.

## Provenance

- **Origin:** the bug 0180 fix (commit `bf32ad03`, v0.105.0).
  `.pi/tmp/fixes/0180-report.md` §Lesser notes item 5, "Placeholder closure was
  achievable only by reuse", records the corpus state and declines to chase it:
  "Noted because the corpus *does* already contain registry Message placeholders
  absent from the eight closure categories (`<detail>`, `<exit detail>`,
  `<line summary>`, `<expected>`, `<resolved>`, `<teardown error first line>`) —
  a pre-existing closure-vs-registry inconsistency I neither widened nor
  chased." Two corrections to that inventory, both measured here: `<expected>`
  **is** enumerated, in category 1 (`placeholder-rendering-a.md:11`) — its defect
  is a different one (element 3, a rule that cannot render a count or a model
  reference); and the run's list of six misses two further unadmitted tokens,
  `<N>` (`code-registry-runtime.md:40`) and `<binder>`
  (`code-registry-parse.md:64`). The corrected inventory is seven placeholders
  across nine rows, plus three literal spellings and six unrendered admitted
  names (R5).
- **The closed surface:** `docs/spec_topics/diagnostics/placeholder-rendering-a.md:3`,
  `:5`, `:7`, `:9–13`, `:28–32`, `:43–47`, `:75–79`, `:81`;
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:3–7`, `:22–34`,
  `:27`, `:47`, `:49–53`, `:72`, `:82–86`, `:90`, `:92`, `:133`, `:134`.
- **The registry:** `docs/spec_topics/diagnostics/code-registry-runtime.md:9`,
  `:22`, `:23`, `:24`, `:26`, `:27`, `:28`, `:30`, `:31`, `:32`, `:35`, `:40`,
  `:41`; `docs/spec_topics/diagnostics/code-registry-parse.md:38`, `:60`, `:64`,
  `:66`, `:75`, `:76`, `:121`; the four-page shard census (201 rows, 201 distinct
  codes, 76 distinct *Message*-column tokens) from R5's pass.
- **The mirror:** `docs/reference/diagnostics.md:7`, `:19`, `:110`, `:252`,
  `:254`, `:255`, `:256`, `:258`, `:259`, `:263`, `:268`, `:303`, `:345`, `:379`.
- **The governing rules:** `docs/spec_topics/diagnostics/diagnostic-shape.md:63`
  (the serialised note-line format), `:71` (DIAG-1), `:72` (DIAG-2), `:74`
  (DIAG-4), `:80` (the column legend);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15 and its
  observable-(c) normalisation list), `:9` (loads-cleanly), `:25` (the
  diagnostic-registry carve-out);
  `docs/spec_topics/governance/req-id-prefix-table-active-b.md:35` (GOV-7),
  `:49` (GOV-8, *Pure rewording*);
  `docs/spec_topics/governance/req-id-prefix-table-active-a.md:69` (the
  `diagnostics/` → `DIAG` prefix row).
- **The implementation and its witnesses:** `src/diagnostics/placeholder.ts:238`
  (the category-6 comment carrying the pre-rename name), `:246`
  (`renderUnderlyingError`, which takes a value, not a placeholder name);
  `src/runtime/subagent-isolation.ts:79`,
  `src/runtime/subagent-json-driver.ts:159`,
  `src/runtime/subagent-envelope.ts:295`,
  `src/runtime/subagent-params.ts:305–306`,
  `src/runtime/subagent-model-guard.ts:74–78`,
  `src/extension/session-shutdown.ts:286`,
  `src/parser/theta-document.ts:5320`;
  `tests/subagent-isolation.test.ts:212–219`,
  `tests/host-peer-version-and-model.test.ts:336–343`,
  `tests/session-shutdown.test.ts:71–72`,
  `tests/shadowed-callable-call.test.ts:125–132`,
  `tests/placeholder-rendering.test.ts:35–47` and `:181–186`,
  `tests/code-registry.test.ts:43–56`; `tools/code-registry/index.js` (exports
  `parseRegistry`, `registryMessage`, `reconcileClosedSet`,
  `reconcileStableIds`).
- **History** (read-only `git log` / `git show`):
  `git log --reverse -S 'No other placeholders are admitted'` → the sentence
  lands at `f9308182` (2026-05-07, "resolve 'placeholder rendering exemption
  open-ended'", then `spec_topics/diagnostics.md`), is rewritten from the "V18s
  closing CI gate enforces this closure" form to "this closure is enforced at
  build time" at `9e536136` (2026-05-26, the corpus-direction sweep dropping
  plan-leaf references), and is sharded to its current path by `f5e89f4f`
  (2026-06-04); `grep -rl 'V18s' docs/` is empty at HEAD;
  `git log --reverse -S '<N> invocation(s) still in flight'` → `5e8b4996`
  (2026-05-06), whose `spec_topics/diagnostics.md` diff adds the
  `reload-teardown-timeout` template and at which
  `grep -c 'No other placeholders are admitted'` on that file is `0` — so `<N>`
  predates the closure sentence by one day, while
  `git show f9308182:spec_topics/diagnostics.md | grep -o 'the bespoke \`<list>\` placeholder'`
  shows the same row's `<list>` carve-out present in the sentence's first
  version;
  `git log -S 'teardown error first line' -- docs/` → one commit, `fda23a4b`
  (2026-07-24, v0.8.0, RFC 0005), whose `code-registry-runtime.md` diff renames
  the token and whose `placeholder-rendering-b.md` diff (two lines) rewrites
  category 6's and category 8's test vectors only;
  `git log -S 'subagent child crashed: <exit detail>' -- docs/spec_topics/` (and
  the same for the other three RFC 0006 tokens) → `4866d4d2` (2026-07-24,
  v0.9.0, RFC 0006), which touched no placeholder-rendering page;
  `git log -S 'resolves to the local <binder>' -- docs/` → `bfd6f7c5`
  (2026-07-27, v0.22.0, bug 0016's fix), which touched only
  `code-registry-parse.md`;
  `git show --stat <sha> -- docs/spec_topics/diagnostics/` for each of the three.
- **Verification at HEAD `bf32ad03` (0.105.0):** every citation above read from
  the tree. R1–R4 and R7–R8 are `rg` invocations, transcribed with their output.
  R5 is two `python` heredocs (stdin, no file created) over the four registry
  pages and over `docs/reference/diagnostics.md`; the *Message* cell is the last
  `|`-delimited field of each `| \`theta/…` line with `\|` protected before the
  split, and the eight *Placeholders* lists are transcribed from the two pages
  as cited. R6 is `git show`. No file in the tree was written other than this
  report.
