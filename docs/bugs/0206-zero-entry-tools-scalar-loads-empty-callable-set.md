# Bug 0206 — A `tools:` scalar whose comma split yields zero entries (`tools: ""`, `tools: " , "`) registers the theta with the empty callable set and no diagnostic, byte-identically to an absent field

- **Status:** fixed (0.159.0).
- **Sev/Diff estimate:** S4/D2 — zero occurrences in the 35 committed
  `.theta` / `.thetalib` files and the misdeclaration is visible in the author's
  own file (the field names no entry), but settling it needs either a DIAG-2
  *Trigger* widening plus five spec/reference sentences in one commit or an
  equally explicit docs-only settlement, and the code arm must be keyed so
  `tools: []` is not caught.
- **Kind:** spec silence — `frontmatter-fields-a.md:43` / `:74`,
  `frontmatter-fields-b-and-templates.md:3` and the three
  `docs/reference/frontmatter.md` restatements (`:127–128`, `:163–166`,
  `:211–215`) state that `tools: []` and an absent `tools:` field are equivalent,
  and enumerate what is refused (a mapping, an alias, a key carrying no value
  node). A quoted or block SCALAR whose comma split yields zero entries is in
  neither list: it is admitted as one of the two spellings and then collapses
  onto the absent-field behaviour. The observable effect is an author-written
  `tools:` field that declares nothing, silently.
- **Related:**
  - [0104](./0104-tools-field-nonscalar-value-loads-empty-callable-set.md) —
    **fixed (0.127.0)**, the node-KIND half of the same field. It landed
    `theta/load/malformed-tools-field` for a `tools:` value that is neither a
    scalar nor a sequence, and its §Fix scope was the node kind, not emptiness
    (constraint (d) refuses `tools: {}` because `{}` is a mapping, while keeping
    `tools: []` silent). Its fix report records this class as residual 2 —
    measured, deliberately left, and unfiled: "Whether an author-written
    `tools:` that declares no entry at all should be distinguished from
    `tools: []` is the same missing-vs-present-but-bad question one level
    further in." This report is that filing. No ordering dependency: 0104
    shipped in 0.127.0 and the site it created (the `tools` arm of the key walk,
    `src/parser/frontmatter.ts:994–998`, and the refusal push at `:1196–1205`)
    is present at HEAD.
  - [0069](./0069-tools-entry-residue-silently-dropped.md) — **fixed (0.62.0)**,
    the footing. Its Kind line reads "the implementation consumes it silently.
    The observable effect is a narrowed callable set the author never declared",
    and its §Fix closed the per-ENTRY grammar so an entry outside it raises
    `theta/load/malformed-tool-entry` and the theta does not register. 0069's
    input narrows the set; this report's input empties it. The analogy is the
    disposition, not the mechanism: 0069's residue is judged by
    `parseEntry` (`src/parser/callable-set.ts`), this class never produces an
    entry for that grammar to see.
  - [0001](./0001-extension-tools-unreachable.md) — **fixed (0.11.0)**.
    §"The callable set is the only door — for code and for queries": the
    prompt-mode query-time loop installs exactly the theta's callable set as the
    model's active tools with no union of the ambient session snapshot, so an
    empty set is not recoverable at query time and load is the only place the
    author can learn of it.
- **Affected** (every citation verified at HEAD `590fc43e`, 0.127.0):
  - `src/parser/frontmatter.ts:432–439` — **the site.** `extractToolsList`'s
    scalar arm: `String(node.value)` is `.split(",")`, `.map(trim)`,
    `.filter((entry) => entry.length > 0)` (`:434–437`), and `:438` collapses a
    zero-length result to `undefined` (`entries.length > 0 ? entries :
    undefined`). Every filtered-empty input therefore answers the same value the
    absent field answers.
  - `src/parser/frontmatter.ts:994–998` — the `tools` arm of the frontmatter key
    walk. `isScalar(item.value) || isSeq(item.value)` routes to
    `extractToolsList`; the `else` records 0104's field-level refusal range. A
    quoted or block scalar takes the `isScalar` branch, so the refusal cannot
    reach it and nothing else in the arm records the zero-entry outcome.
  - `src/parser/frontmatter.ts:1336` — `...(toolsValue !== undefined ? { tools:
    toolsValue } : {})`: the key is not spread when the extraction answered
    `undefined`, so the returned frontmatter carries no `tools` key at all
    (measured: `"tools" in frontmatter` is `false`).
  - `src/parser/frontmatter.ts:149–156` — the `FrontmatterData.tools?` doc,
    "Present iff the theta declares a non-empty `tools:` field", which is the
    only place in the source that acknowledges the collapse.
  - `src/extension/production-composition.ts:1603`, `:1622–1631` —
    `resolveThetaToolsAtLoad`'s early return: `toolsList === undefined ||
    toolsList.length === 0` answers `{ diagnostics: [], callableSet:
    EMPTY_CALLABLE_SET }` (`EMPTY_CALLABLE_SET` is the frozen empty snapshot at
    `:1590`). The load path holds no signal that distinguishes the two inputs.
- **Observed at:** `0.127.0` (`590fc43e`), Windows. Offline, deterministic,
  provider-free: a scratch probe over the shipped frontmatter reader
  (`parseFrontmatter`) and over the shipped `session_start` composition root
  (`discoverAndComposeFixtures`) against real on-disk `.pi/theta/` discovery
  workspaces — the two-harness pattern of
  `tests/tools-field-shape-refusal.test.ts` (bug 0104's witness).

## Summary

A `tools:` value that is a quoted or block scalar containing only commas and
whitespace (`tools: ""`, `tools: " , "`, `tools: ","`, `tools: "   "`, a block
scalar holding `,`) takes the admitted scalar spelling, splits to zero entries,
and yields `tools=undefined` — so the theta registers with the empty callable
set and no diagnostic at any severity, indistinguishably from a file that has no
`tools:` line.

## Reproduction

`mode: prompt` plus one `tools:` line, body `` @`hi` ``. Through
`parseFrontmatter` (`src/parser/frontmatter.ts`), reading `.registered`,
`.frontmatter?.tools`, `"tools" in .frontmatter`, and `.diagnostics`:

| `tools:` line | registered | `tools` value | `tools` key present | diagnostics |
| --- | --- | --- | --- | --- |
| `tools: ""` (empty double-quoted) | `true` | `undefined` | no | `[]` |
| `tools: ''` (empty single-quoted) | `true` | `undefined` | no | `[]` |
| `tools: " , "` (comma-only, quoted) | `true` | `undefined` | no | `[]` |
| `tools: ","` | `true` | `undefined` | no | `[]` |
| `tools: ",,,"` | `true` | `undefined` | no | `[]` |
| `tools: "   "` (whitespace only) | `true` | `undefined` | no | `[]` |
| `tools: \|` over an indented `,` (block literal) | `true` | `undefined` | no | `[]` |
| `tools: >-` over an indented blank (folded) | `true` | `undefined` | no | `[]` |

Controls, same harness:

| `tools:` line | registered | `tools` value | diagnostics |
| --- | --- | --- | --- |
| `tools: []` (spec'd equivalent-to-absent) | `true` | `undefined` | `[]` |
| absent `tools:` | `true` | `undefined` | `[]` |
| `tools: read` | `true` | `["read"]` | `[]` |
| `tools: read, grep` | `true` | `["read", "grep"]` | `[]` |
| `tools:   read  ` (padded) | `true` | `["read"]` | `[]` |
| `tools: {read: bash}` (0104's refusal) | `false` | `undefined` | `error theta/load/malformed-tools-field: malformed 'tools:' field; expected a comma-separated list of entries or a YAML sequence` |

The subject rows are byte-identical to the two control rows the spec declares
equivalent, and to each other.

Out of class, and loud for a different reason: an UNQUOTED leading comma is a
YAML indicator, so the frontmatter block fails to parse and `mode:` is lost with
it.

| `tools:` line | registered | `tools` value | diagnostics |
| --- | --- | --- | --- |
| `tools: ,` | `false` | `undefined` | `error theta/load/missing-mode` |
| `tools: , ,` | `false` | `undefined` | `error theta/load/missing-mode` |
| `tools: ,read,` | `false` | `undefined` | `error theta/load/missing-mode` |

The reproducing class is therefore exactly the QUOTED and BLOCK scalars: a plain
scalar cannot reach it (a comma-leading plain scalar is a YAML error, and an
empty or whitespace-only plain scalar parses as a null scalar, which yields the
single entry `null` → `theta/load/unknown-tool`, measured under 0104 §Non-goals).

Through the shipped `session_start` composition root, one theta per planted
`.pi/theta/` workspace, reading the returned fixtures' slash names and the
`ctx.ui.notify` error text:

| workspace `tools:` line | registered slash names | notifications |
| --- | --- | --- |
| `tools: ""` | `["emptystr"]` | `[]` |
| `tools: " , "` | `["commaonly"]` | `[]` |
| `tools: []` (control) | `["ctlemptyseq"]` | `[]` |
| absent (control) | `["ctlabsent"]` | `[]` |
| `tools: read` (control) | `["ctlscalar"]` | `[]` |

The clean-scalar control registering is the non-vacuity precondition: the
discovery walk reached each planted workspace.

## Expected behaviour

One of two dispositions, stated in the spec and enforced consistently:

- A `tools:` field that declares zero entries is a distinct authoring intent
  from an omitted field, on the same footing
  `frontmatter-fields-a.md:36` / `:39` / `:41` state three times for the
  neighbouring `mode`, `model` and `bind_context` rows — "`missing` and
  `present-but-bad` do not collapse into one code, because the authoring intent
  differs" — and on the footing 0104 §Fix constraint (d) applied to
  `tools: {}`; so it is refused with a registered error-severity code and the
  theta does not register; or
- it is a third spelling of the empty callable set, equivalent to `tools: []`
  and to the absent field, and the spec sentences that enumerate the
  equivalences say so.

Either way the spec's enumeration of admitted and refused `tools:` shapes covers
the input, and an author reading it can predict the outcome.

## Actual behaviour / root cause

Neither. The spec enumerates the equivalence set as exactly `tools: []` and an
absent field (`frontmatter-fields-a.md:43`, `:74`;
`frontmatter-fields-b-and-templates.md:3`; `docs/reference/frontmatter.md:127–128`,
`:163–166`, `:211–215`) and the refused set as a mapping, an alias, and a key
carrying no value node (the same sentences, plus the
`theta/load/malformed-tools-field` *Trigger* at
`docs/spec_topics/diagnostics/code-registry-load.md:26`, whose "Not refused"
clause lists "a plain scalar, the comma short form, a sequence, `tools: []`, and
an absent `tools:` field"). A zero-entry quoted or block scalar is in neither
list and behaves as the first.

The mechanism is one expression. `extractToolsList`'s scalar arm splits on
commas, trims each entry, filters empties, and then answers `undefined` when
nothing survives (`src/parser/frontmatter.ts:434–438`). `undefined` is the same
answer the function gives for a node kind it does not handle (`:452`) and the
same answer the caller records for a genuinely absent field, so `:1336` omits
the `tools` key and `resolveThetaToolsAtLoad`'s early return
(`src/extension/production-composition.ts:1622–1631`) reaches
`EMPTY_CALLABLE_SET` by the `toolsList === undefined` disjunct. 0104's
field-level refusal cannot reach the input because the `tools` arm
(`:994–998`) routes every scalar to `extractToolsList` and records the refusal
range only in the `else`.

## Why it matters

The callable set is the only door (0001): the empty set means the model can make
no tool call for the whole theta and theta code has no `<name>(...)` callable to
resolve. A hand-written `tools: ""` is unlikely — the realistic vector is
GENERATED frontmatter, where a scaffolder, a code-generating agent, or a
templating step emits `tools: "<substituted>"` and the substitution is empty or
collapses to separators. theta itself has no frontmatter-templating feature
(`${…}` interpolation reaches `system:` and `@`-query bodies only,
`frontmatter-fields-b-and-templates.md:46`, `:50`), so the generator is always
external to theta and its output is never validated against the field's intent —
it is validated only against YAML, which admits the empty string. The failure is
then a worse model answer with no trace at load, on a file whose `tools:` line
looks populated to whatever wrote it.

The bound on this: zero of the 35 committed `.theta` / `.thetalib` files carry
the shape (every committed `tools:` field is a name-bearing scalar or a
sequence), and an author or reviewer inspecting the file sees a field that names
nothing. This is a spec-silence and generated-input footgun, not a live defect
in any shipped theta.

## Non-goals

- **The node-KIND refusal.** 0104's `theta/load/malformed-tools-field` and its
  refused set (mappings, the empty flow mapping `tools: {}`, aliases, a key with
  no value node) are settled and shipped. This report is about a value inside the
  admitted scalar spelling.
- **The two null spellings.** A bare `tools:` key and `tools: null` parse as a
  null scalar, take the same arm through `String(node.value)`, and yield the
  single entry `null` → `theta/load/unknown-tool: unknown Pi tool 'null'`,
  un-registering the theta (measured). That is loud and error-severity, and
  whether the message should name the shape is 0104 §Non-goals' separate
  adjudication.
- **The entry grammar.** `parseToolsEntry` (`src/parser/callable-set.ts`) is
  0069's and is never reached here: zero entries are produced.
- **`tools: []` and the absent field.** Both keep loading silently with the
  empty callable set. Any fix must leave them byte-identical.
- **The non-map `params:` value.** `params: read` and `params: [a]` register with
  no diagnostic for the structurally identical reason (0104 §Non-goals);
  uncovered, unfiled, and a different field.

## Fix

Not yet decided. Two routes are viable and the choice is a spec adjudication:
whether a `tools:` field that declares zero entries is `present-but-bad` (the
frame `frontmatter-fields-a.md:36` / `:39` / `:41` state three times, and the
frame 0104 applied to `tools: {}`) or a third spelling of the empty callable set.
Both routes must satisfy the constraints below.

**Route A — refuse a zero-entry scalar under 0104's existing row.** Emit
`theta/load/malformed-tools-field` at the frontmatter layer and do not register.

- The *Message* needs no change and no DIAG-4 reword: "malformed 'tools:' field;
  expected a comma-separated list of entries or a YAML sequence" is true of a
  scalar that spells no entry, and it carries no placeholder. The mirror row
  `docs/reference/diagnostics.md:195` carries only the Message and is therefore
  unchanged.
- The *Trigger* at `code-registry-load.md:26` must be widened: its "Not refused"
  clause currently names "a plain scalar, the comma short form" without an
  emptiness qualifier, and its "Refused" clause enumerates node kinds only. A
  *Trigger* change is a DIAG-2 spec change
  (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`), so it lands in the
  same commit as the enforcement, together with the five equivalence sentences
  (`frontmatter-fields-a.md:43`, `:74`;
  `frontmatter-fields-b-and-templates.md:3`; `docs/reference/frontmatter.md:51`,
  `:163–166`, `:211–215`) and the reference restatement at `:127–128`.
- GOV-15: every input in the reproduction table loads with no `E`-severity
  diagnostic today, so all of them sit inside the loads-cleanly input set
  (`source-language-stability.md:9`) and the addition is covered by the
  diagnostic-registry carve-out (`:25`) as an addition for inputs that did not
  previously emit the code. The corpus census (zero occurrences in 35 files)
  bounds the blast radius.
- The check is keyed on the SCALAR arm, not on `extractToolsList` answering
  `undefined`: `tools: []` reaches the `isSeq` arm and answers `undefined` too
  (`:450`), so a predicate over the return value alone would refuse the spelling
  the spec declares equivalent to absent. The scalar arm's zero-entry outcome
  must be distinguishable at the call site in `:994–998`, which already knows the
  node kind.
- The refusal is ranged on the value node with the `valueRange ?? keyRange`
  fallback the arm already computes (`:997`), matching 0104's range convention
  and `theta/load/params-null`'s.
- The block-scalar spellings (`|`, `>-`) are scalars and fall in the same class;
  a route that refused only the quoted flow spellings would leave the same
  silence one spelling over.
- Cost this route pays that route B does not: a behaviour change on a shipped
  minor, a registry *Trigger* edit, and a witness with both harness halves
  (bug 0104's witness file is the pattern; its (D5) control rows must stay
  green).

**Route B — spec-state the equivalence for zero-entry scalars (docs-only).**
Amend the same five equivalence sentences to state that a `tools:` scalar whose
comma split yields no entry is equivalent to `tools: []`, and widen the
`code-registry-load.md:26` *Trigger*'s "Not refused" clause to say so
explicitly.

- No code change, no behaviour change, no GOV-15 exposure. The DIAG-2 edit is a
  *Trigger* clarification rather than a new emission.
- The amendment must name the quoted and block spellings, because a plain scalar
  cannot reach the class: a comma-leading plain scalar is a YAML error and an
  empty plain scalar is a null scalar keeping `theta/load/unknown-tool`
  (measured). A sentence that said "an empty scalar" without that qualifier
  would be false of the plain spelling.
- Cost: the generated-frontmatter footgun in §Why it matters stays, and the
  `present-but-bad` frame that `frontmatter-fields-a.md:36` / `:39` / `:41`
  assert for the neighbouring fields, and that 0104 applied to `tools: {}`, does
  not extend to this field's zero-entry value.

**Constraints binding on either route.**

(a) `tools: []`, an absent `tools:` field, `tools: read`, the comma short form,
    a sequence, 0069's non-scalar sequence ITEM, and the two null spellings keep
    their current outcomes byte-identically. Bug 0104's witness
    (`tests/tools-field-shape-refusal.test.ts`, groups (D5), (D6), (D7) and the
    (D3) control rows) pins all of them and must stay green.

(b) One input, one rule: whichever disposition is chosen, the quoted flow
    spellings and the block-scalar spellings get the same one.

(c) The decision is recorded in the spec prose, not only in the registry
    *Trigger* — the reader who hits this writes frontmatter and reads
    `frontmatter-fields-a.md` §`tools`, not the diagnostics registry.

## Provenance

- Reproduced at HEAD `590fc43e` (0.127.0) with a scratch probe over
  `parseFrontmatter` and over `discoverAndComposeFixtures`, mirroring the two
  harness halves of `tests/tools-field-shape-refusal.test.ts`. Every row in
  §Reproduction is measured, including the controls, the 0104 refusal row, and
  the three out-of-class YAML-error rows. The probe was deleted; no test file was
  added.
- Origin: bug 0104's fix report, residual 2 — "The empty and comma-only scalar
  spellings still yield the empty callable set silently. Measured: `tools: ""`
  and `tools: " , "` → `registered=true, tools=undefined, diags=[]`. … This fix
  deliberately leaves the behaviour alone (it is out of §Fix's stated scope,
  which is the node KIND) … Whether an author-written `tools:` that declares no
  entry at all should be distinguished from `tools: []` is the same
  missing-vs-present-but-bad question one level further in, unfiled."
- Source: `src/parser/frontmatter.ts:149–156` (the `tools?` field doc),
  `:432–452` (`extractToolsList`, both arms and the two zero-entry collapses),
  `:994–998` (the `tools` arm of the key walk), `:1196–1205` (0104's refusal
  push), `:1336` (the conditional spread);
  `src/extension/production-composition.ts:1590` (`EMPTY_CALLABLE_SET`),
  `:1603`, `:1622–1631` (`resolveThetaToolsAtLoad`'s early return).
- Spec: `docs/spec_topics/frontmatter/frontmatter-fields-a.md:36`, `:39`, `:41`
  (the three missing-vs-present-but-bad rows), `:43` (the `tools` field-contract
  row), `:74` (§`tools`), `:88` (0069's closed per-entry grammar);
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:3`
  (§YAML-shape), `:18` (the `tools:` rejection family), `:46`, `:50` (the
  `${…}` surfaces, which do not include frontmatter field values);
  `docs/spec_topics/diagnostics/code-registry-load.md:18`
  (`theta/load/params-null`), `:19`
  (`theta/load/params-type-not-expression`), `:26`
  (`theta/load/malformed-tools-field` and its *Trigger*);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
- Reference: `docs/reference/frontmatter.md:51` (the field-contract row),
  `:127–128`, `:163–166`, `:211–215` (the three equivalence restatements);
  `docs/reference/diagnostics.md:195` (the Message mirror).
- Corpus census: 35 committed `.theta` / `.thetalib` files, zero carrying a
  `tools:` scalar that spells no entry.

## Fix (0.159.0)

- **The adjudication** — §Fix offered two routes and this run took **Route A**:
  a `tools:` scalar whose comma split yields no entry is `present-but-bad` and is
  refused, on the frame `frontmatter-fields-a.md:36` / `:39` / `:41` state three
  times for the neighbouring fields and 0104 applied to `tools: {}`. Route B
  (admit-and-document) was not taken. The DIAG-2 question — widen 0104's
  existing `theta/load/malformed-tools-field` *Trigger* versus mint a new row —
  was settled as **widen**, on three independent grounds: the shipped *Message*
  (`malformed 'tools:' field; expected a comma-separated list of entries or a
  YAML sequence`) is already true of a scalar that spells no entry, so no
  reword is needed and DIAG-4 (`diagnostic-shape.md:74`) is not engaged; the
  *Message* carries no placeholder, so the closed placeholder tables
  (`placeholder-rendering-b.md`) need no edit and no `<value>` sub-rule is
  reused; and the granularity is the same one 0104's row already owns (the
  FIELD's value shape, ranged on the value node), so a second row would report
  one granularity twice. `docs/reference/diagnostics.md` mirrors only the
  *Message* and is therefore byte-unchanged.
- **What shipped**
  - `src/parser/frontmatter.ts` — the `tools` arm of the frontmatter key walk
    splits into separate `isScalar` / `isSeq` branches; the scalar branch
    records `toolsMalformedRange = valueRange ?? keyRange` when
    `extractToolsList` answers `undefined`, reusing 0104's single refusal push
    so exactly one diagnostic issues. Keyed on the ARM, not on the return
    value: the sequence arm answers `undefined` for `tools: []` too, which the
    spec declares equivalent to an absent field and which stays silent by
    construction. `extractToolsList`'s doc comment now states that its
    `undefined` return is ambiguous by design and is not the refusal signal;
    the `ParsedFrontmatter.tools?` doc drops its "iff … non-empty" overclaim.
  - `docs/spec_topics/diagnostics/code-registry-load.md` — the DIAG-2 *Trigger*
    widening on the `theta/load/malformed-tools-field` row, in the same change
    as the enforcement. Refused now names the zero-entry scalar in whatever
    YAML style; Not refused states the two genuinely-excluded plain spellings.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md` (the `tools`
    field-contract row and §`tools`),
    `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
    (§YAML-shape), `docs/reference/frontmatter.md` (the field-contract row and
    the three equivalence restatements) — §Fix constraint (c): the decision is
    recorded where the author reads, not only in the registry.
  - `tests/tools-field-zero-entry-scalar-refusal.test.ts` — **new**, 51 cells,
    this report's witness, mirroring 0104's two-harness shape. (E1) sources the
    normative *Message* from the registry; (E2) is the 13-row `parseFrontmatter`
    matrix (the eight §Reproduction subject rows plus five tagged/anchored
    spellings) asserting per row exactly one error-severity
    `malformed-tools-field`, the exact `SourceRange`, `registered === false` and
    a withheld frontmatter; (E3) pins the eleven silent controls; (E4) pins the
    out-of-class YAML-parse-error rows; (E5) is the production half over
    `discoverAndComposeFixtures` with a non-vacuity precondition cell.
  - `tests/live/tools-field-zero-entry-scalar-refusal-live-cell.test.ts` —
    **new**, one standalone additive live cell carrying the literal token
    `` in its title, header and assertion strings (the parent renumbers
    at merge). Registration-only observable off the settled `ExtensionRunner`
    after the real `session_start` → `pi.registerCommand` step; zero model
    turns, 0104's live-cell shape.
- **Gates**: witness run `Tests 51 passed (51)`; 0104's witness
  `Tests 37 passed (37)` with both its lock files byte-identical to HEAD; full
  default suite `Test Files 350 passed (350)` / `Tests 7025 passed (7025)`;
  `npx tsc --noEmit` clean; `npm run lint` clean; live cell
  `Tests 1 passed (1)`; H9a acceptance `Tests 10 passed (10)`.
- **Review**: 2 rounds, plus one pre-review correction round. Correction round
  (citation/comment-only, no assertion and no behaviour touched): the
  implementer had rewritten stale `src/parser/frontmatter.ts:<line>` citations in
  16 unrelated files, which this lane's brief forbids; all 16 were restored
  byte-exact to HEAD (`git hash-object` == `git rev-parse HEAD:<path>` for each)
  and gates re-run green. Round 1 (deep): one `spec` finding — the new prose
  asserted the falsifiable universal "a plain scalar cannot spell this", which a
  tag-forced empty plain scalar (`tools: !!str` → `PLAIN`, value `""`, refused)
  disproves; the eight prose sites were reworded to state the refused class as
  its predicate, and seven locking cells were appended. Round 2 (fast): CLEAN,
  no deep review recommended, one non-blocking `prose` residual.
- **Verification**: PASS. Witness reds without the fix — inverting the key-walk
  arm reds 30 of 51 cells (all 13 (E2) rows × 2 plus the four (E5) subject
  assertions) and leaves exactly the 21 control/anchor cells green; the source
  was restored byte-exact (`1c2043d9…` before and after). Full default suite
  green. The live cell was run for real under the shared live lock and proven
  red in the same inverted tree for the right reason (`cellf2empty` registered)
  and green after restoration. Lint and typecheck clean. The H9a stderr gate is
  unaffected, established by a real H9a acceptance run rather than by
  assumption: no acceptance fixture declares a zero-entry `tools:` scalar, this
  fix emits no NEW code, and `tests/fixtures/h7a/permitted-codes.json` was
  neither edited nor needed editing.
- **Residuals**
  1. **Line-citation drift, left as the pre-fix baseline.** The `+33` shift in
     `src/parser/frontmatter.ts` stales `frontmatter.ts:<line>` comment
     citations in `src/parser/theta-document.ts` and 15 `tests/*.ts` files
     (including bug 0104's two protected lock files). No refresh was made: this
     surface's churn convention is symbols-not-lines (0149 `+45`, 0059 `+10`,
     0185 `+9`, 0104 `+33` all landed on it without a refresh pass, recorded in
     0104's own residual 3), and this report's §Fix authorizes no such pass. The
     bug document's own `src/` citations also drifted before this fix
     (`production-composition.ts` `EMPTY_CALLABLE_SET` measured at `:1596` not
     `:1590`, `resolveThetaToolsAtLoad` at `:1609` not `:1603`, its early return
     at `:1629–1638` not `:1622–1631`; the `tools?` doc at `:151` not
     `:149–156`) — measured, recorded, not chased.
  2. **A redundant equivalence restatement** in `docs/reference/frontmatter.md`
     (the `tools: []`/absent equivalence is stated twice in adjacent sentences,
     one new and one pre-existing). Round 2 raised it as non-blocking prose and
     it was left: correct content, no ambiguity.
  3. **The non-map `params:` value** (`params: read`, `params: [a]`) stays
     uncovered and unfiled, as §Non-goals leaves it — same shape, different
     field.
- **Discharge notes appended**: `docs/bugs/0104-tools-field-nonscalar-value-loads-empty-callable-set.md`
  — its residual 2 is discharged and its registry row's *Trigger* boundary moved.
- **Pinned dispositions / non-goals**: §Non-goals holds as written. The node-KIND
  refusal is 0104's and is untouched; the two null spellings keep
  `theta/load/unknown-tool` (they yield the one entry `"null"`, so the scalar
  arm's new check never fires — verified, not special-cased); the entry grammar
  (`parseToolsEntry`) is never reached; `tools: []` and the absent field stay
  byte-identically silent; `src/extension/production-composition.ts` is
  untouched, the input no longer reaching `resolveThetaToolsAtLoad`'s early
  return.
