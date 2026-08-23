# Bug 0057 — `glossary.md:57` spells the callee tool name's tail `__theta_callee_<actual-16-hex-chars>__<name>` where schema-subset.md `:108` — the page it cites as owning the set — spells it `__<post-rename-name>`; the two names differ whenever a `tools:` entry carries an `as` rename, and `<name>` is separately bound, one page away, to the local import binding in the reserved-name row's own Message

- **Status:** fixed (0.250.0). §Fix is settled — the implementation's one construction
  site and every other occurrence in the corpus agree on one spelling, so the
  drifting phrase has a determined replacement. One phrase, one line, one file;
  no behavioural, registry, mirror, or test change. No ordering dependency:
  bug [0040](./0040-inline-slug-def-namespace-not-reserved.md), which reserved
  these forms, shipped in 0.50.0 and left this line as found.
- **Kind:** spec-doc defect — a narrative page's inline restatement of a form
  drifts from the page it names as owning that form. Not a spec gap and not an
  implementation defect: `schema-subset.md:108` declares itself "the source of
  truth for the full set", its spelling is what `src/` constructs, and no
  runtime behaviour follows from the glossary phrase. The reserved-name
  predicate keys on the tail's *shape* (any non-empty `[A-Za-z0-9_]+`), not on
  which name fills it, so the reserved set is identical under either spelling.
- **Related:**
  - [0040](./0040-inline-slug-def-namespace-not-reserved.md) — the filing
    origin. Its §Fix (0.50.0) Residuals item (ii) (`:479–481`) records the
    observable: "`docs/spec_topics/glossary.md:57` spells the callee form's
    tail `__<name>` where schema-subset.md `:108` spells it
    `__<post-rename-name>` — pre-existing drift, untouched, unfiled." This
    report is that filing. The same drift was caught inside 0040's own diff:
    its round-1 review raised the callee form spelled
    `__theta_callee_<slug>__<name>` as a nit against `:108`'s
    `<post-rename-name>`, naming both halves of the defect — the drift and the
    collision with the registry row's own `<name>` placeholder — and the fixer
    corrected it in that diff. Every artefact the diff added now spells
    `<post-rename-name>` (`tests/inline-slug-name-reservation.test.ts:36`,
    `:853`; `src/parser/synthesised-names.ts:7–8`, `:28–31`). The glossary copy
    survived because it sat outside the diff.
  - [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
    — the class precedent. One phrase of spec prose contradicts the page that
    owns the term, the page's substance is correct and locked elsewhere, the
    correction is one sentence with no behavioural surface, and the adjacent
    phrasing that is *not* defective is left as found. This report has the same
    shape; §Non-goals states what it leaves as found.
- **Affected** (every citation verified at HEAD `aef82bde`, 0.50.0):
  - `docs/spec_topics/glossary.md:57` — **the one defective phrase.** The
    **schema slug** entry's closing sentence: "The rename is purely
    terminology — the on-the-wire tool names
    (`__theta_respond_<actual-16-hex-chars>` and
    `__theta_callee_<actual-16-hex-chars>__<name>`) and the `<slug>`
    placeholder token in diagnostic registry rows and template bodies are
    unaffected." The defect is the four-character tail token `<name>`.
  - `docs/spec_topics/schema-subset.md:108` — **the owning page**, which the
    same glossary entry cites two clauses earlier as "(that step owns the full
    set)": "**Synthesised names.** The schema slug appears in four
    synthesised-name forms, and this list is the source of truth for the full
    set: … `__theta_callee_<slug>__<post-rename-name>` for the prompt-mode
    registered tool of a `.theta` callee …".
  - `src/runtime/tool-registration.ts:308–313` — **the one construction site**
    in the tree. `contentAddressedName` returns
    `` `__theta_callee_${entry.slug}${counter}__${entry.postRenameName}` `` for
    the `callee` arm. Its doc-comment (`:303–307`) spells the collision form
    `__theta_callee_<slug>_<n>__<post-rename-name>`.
  - `src/runtime/tool-registration.ts:201–207` — the `RegistrationEntry`
    `callee` arm. The spliced field is named `postRenameName` and documented
    "The post-rename callee name spliced into the content-addressed name."
  - `src/extension/production-theta-producer.ts:2618–2626` — the **only**
    `registerToolInCache` call in `src/`, and it passes `kind: "respond"`.
    No production caller constructs a `kind: "callee"` entry at HEAD, so the
    callee arm is reachable at the unit seam only. The implementation
    therefore fixes the tail's *spelling* without yet minting a callee name
    end-to-end; §Non-goals scopes that absence out.
  - `tests/tool-registration-lifetime.test.ts:255–306` — the unit-seam pins,
    all `<post-rename-name>`-shaped: `:270` and `:272` pin
    `__theta_callee_0011223344556677__review` from
    `postRenameName: "review"` (`:262`); `:296–298` pin the base and the
    disambiguated `__theta_callee_<slug>_2__review` under the comment naming
    the form `__theta_callee_<slug>_2__<post-rename-name>`.
  - `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84`, `:85` — **why
    the two readings differ.** `:84`: for a `.theta` path the default name is
    the basename without the extension, hyphens replaced by underscores
    (`./code-review.theta` → `code_review`). `:85`: "The `as <name>` clause
    overrides the default for either kind: `read as file_read`,
    `./summarise.theta as my_summariser`." The post-rename name is the second;
    the two coincide only when no `as` clause is present.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:111` — **the other
    live binding of `<name>`.** The `theta/parse/import-reserved-synthesised-name`
    row enumerates the same four forms (spelling the callee tail
    `<post-rename-name>`), carries Message `imported symbol '<name>' binds a
    reserved synthesised name`, and states "`<name>` renders the LOCAL binding,
    not the source symbol." Mirrored at `docs/reference/diagnostics.md:160`.
  - Every other occurrence of the form in the corpus, all spelling
    `<post-rename-name>` — `docs/spec_topics/lexical.md:18` (the §Identifiers
    reservation rule); `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:7`
    (the prompt-mode registration cache) and `:9` (PIC-44's disambiguated
    `__theta_callee_<slug>_<n>__<post-rename-name>`);
    `docs/reference/schema-subset.md:201` and `docs/reference/grammar.md:50`
    (the two `docs/reference/` mirrors); `CHANGELOG.md:33`;
    `src/parser/synthesised-names.ts:7–8` and `:28–31` (the reservation
    predicate's own header, quoting `:108`).
  - Not affected — **the mirrors.** `docs/reference/` carries no glossary
    mirror (`docs/reference/` holds `README.md`, `coverage-matrix.md`,
    `diagnostics.md`, `discovery-cli.md`, `errors-and-results.md`,
    `frontmatter.md`, `grammar.md`, `hard-ceilings.md`, `schema-subset.md`,
    `type-system.md` and nothing else), and the two reference pages that do
    carry the callee form already spell `<post-rename-name>`. No same-commit
    mirror correction is owed; §Fix keeps the conditional check anyway.
  - Not affected — **the reserved set.**
    `src/parser/synthesised-names.ts:34–36` matches
    `__theta_callee_[0-9a-f]{16}__[A-Za-z0-9_]+`. The tail is a shape, not a
    named string, so no name changes reservation status under the correction.
  - Not affected — **the tests and the gates.** `rg -n 'glossary' tools/
    tests/ src/` returns nothing: no test or tool opens the page by name. The
    closing gate does ingest it, as one file of
    `readTree(docs/spec_topics)` into `specSources`
    (`tools/closing-gate/live-corpus.js:146`), but the substituted span is
    inside a backticked code span carrying no `theta/` code, no `MUST`, no
    REQ-ID and no table row, and `glossary.md` is registered as carrying no
    REQ-IDs at all (`docs/spec_topics/governance/req-id-prefix-table-active-b.md:9`
    — "`glossary.md` | (no IDs — narrative)").
- **Observed at:** `0.50.0` (HEAD `aef82bde`). Text defect, read from the
  files. The implementation's spelling pinned by a scratch probe over the one
  construction site (§Reproduction), run offline against the working tree and
  deleted. No live model.

## Summary

`glossary.md:57` defines **schema slug** and closes by naming the two
on-the-wire tool names the SUBS-2 terminology rename leaves alone. It spells
the callee one `__theta_callee_<actual-16-hex-chars>__<name>`. Two clauses
earlier the same entry points at `schema-subset.md:108` as the page that "owns
the full set", and that page spells the tail `__<post-rename-name>`.

The spec distinguishes the two names. A `.theta` entry in `tools:` gets a
default name from its basename (`frontmatter-fields-a.md:84`) which an `as`
clause overrides (`:85`); `post-rename name` is the corpus's term for the
result, used as the key of the frozen resolution snapshot
(`frontmatter-fields-b-and-templates.md:22`), as the `tool_name` a
`CodeToolError` carries (`errors-and-results/queryerror-variants.md:163`), and
as the name a `tools:` collision is judged on (`expressions.md:51`). The two
readings of `<name>` therefore diverge on every renamed callable.

The implementation splices the post-rename name: `contentAddressedName`
(`src/runtime/tool-registration.ts:308–313`) interpolates a field declared
`postRenameName`. `glossary.md:57` is the only occurrence of the form in the
tree that does not say so.

## Reproduction

Read the two files at HEAD `aef82bde`. Verbatim, with line numbers, both
truncated to the clause at issue:

```text
docs/spec_topics/glossary.md
57  - **schema slug** — … The rename is purely terminology — the on-the-wire tool names (`__theta_respond_<actual-16-hex-chars>` and `__theta_callee_<actual-16-hex-chars>__<name>`) and the `<slug>` placeholder token in diagnostic registry rows and template bodies are unaffected. See: …
```

```text
docs/spec_topics/schema-subset.md
108 5. **Synthesised names.** The schema slug appears in four synthesised-name forms, and this list is the source of truth for the full set: `__inline_<slug>` …; `__theta_respond_<slug>` for typed-query one-shot tools; `__theta_callee_<slug>__<post-rename-name>` for the prompt-mode registered tool of a `.theta` callee …
```

**Corpus census.** Every occurrence of the form in the tree, 28 matching lines
across 13 files:

```text
$ rg -c '__theta_callee' --glob '!node_modules' .
./CHANGELOG.md:1
./src/runtime/tool-registration.ts:2
./src/parser/synthesised-names.ts:5
./docs/spec_topics/schema-subset.md:1
./docs/bugs/0040-inline-slug-def-namespace-not-reserved.md:2
./docs/reference/schema-subset.md:1
./docs/spec_topics/glossary.md:1
./docs/spec_topics/diagnostics/code-registry-parse.md:1
./docs/reference/grammar.md:1
./docs/spec_topics/lexical.md:1
./tests/inline-slug-name-reservation.test.ts:4
./docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:2
./tests/tool-registration-lifetime.test.ts:6
```

Reduced to the placeholder-bearing spellings in `docs/` and `CHANGELOG.md`,
one line per occurrence:

| Occurrence | Tail |
|---|---|
| `docs/spec_topics/schema-subset.md:108` (owner) | `__<post-rename-name>` |
| `docs/spec_topics/lexical.md:18` | `__<post-rename-name>` |
| `docs/spec_topics/diagnostics/code-registry-parse.md:111` | `__<post-rename-name>` |
| `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:7` | `__<post-rename-name>` |
| `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:9` | `_<n>__<post-rename-name>` |
| `docs/reference/schema-subset.md:201` | `__<post-rename-name>` |
| `docs/reference/grammar.md:50` | `__<post-rename-name>` |
| `CHANGELOG.md:33` | `__<post-rename-name>` |
| **`docs/spec_topics/glossary.md:57`** | **`__<name>`** |

The remaining files are `src/` (`synthesised-names.ts:7–8`, `:28–31`;
`tool-registration.ts:306`, `:311`), `tests/`
(`inline-slug-name-reservation.test.ts:36`, `:853`;
`tool-registration-lifetime.test.ts` × 6) and this report's origin
(`docs/bugs/0040-…md:319`, `:361`) — all `<post-rename-name>` or a literal
minted name, none `<name>`.

Only one spelling of `<actual-16-hex-chars>` exists corpus-wide, on the same
line:

```text
$ rg -n 'actual-16-hex-chars' --glob '!node_modules' .
./docs/spec_topics/glossary.md:57: …
```

**Implementation probe.** The callee arm has no production caller, so the
construction site is driven directly. Scratch vitest file, run once at HEAD
`aef82bde` and deleted:

```ts
const cache = createRegistrationCache();
const registered: string[] = [];
const deps = { registerTool: (n: string) => { registered.push(n); },
               emitDiagnostic: () => {} };
// `review` stands for the post-rename callable name — the key the frozen
// `tools:` resolution snapshot uses after an `as` rename.
const entry: RegistrationEntry = {
  kind: "callee", slug: "0011223344556677",
  canonicalFormBytes: '{"type":"object"}', postRenameName: "review",
};
const minted = registerToolInCache(cache, entry, deps);
console.log("PROBE minted-callee-name = " + minted);
console.log("PROBE registerTool-received = " + JSON.stringify(registered));
console.log("PROBE reserved-predicate-accepts-minted = "
  + String(isReservedSynthesisedName(minted)));
console.log("PROBE reserved-predicate-accepts-slug-only = "
  + String(isReservedSynthesisedName("__theta_callee_0011223344556677")));
```

Output, verbatim:

```text
PROBE minted-callee-name = __theta_callee_0011223344556677__review
PROBE registerTool-received = ["__theta_callee_0011223344556677__review"]
PROBE reserved-predicate-accepts-minted = true
PROBE reserved-predicate-accepts-slug-only = false
```

The minted tail is the value of `postRenameName`, the name is what reaches
`pi.registerTool`, and the reservation predicate accepts the minted form while
rejecting the slug-only prefix.

**Code reading, for the half no probe can reach.** `registerToolInCache` is
called once in `src/`, at `production-theta-producer.ts:2618–2626`, with
`{ kind: "respond", … }`. `rg -n 'kind: "callee"' src/` returns only the type
declaration at `tool-registration.ts:201`. The callee arm is therefore
implemented and unit-pinned but not yet wired to a `.theta` load, so the probe
above is the strongest available witness of the spelling.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:108` is the declared source of truth for
  the four synthesised-name forms ("this list is the source of truth for the
  full set"), and it spells the callee tail `__<post-rename-name>`. A page that
  cites `:108` as owning the set restates it in that page's spelling.
- The implementation agrees: `src/runtime/tool-registration.ts:308–313`
  splices `entry.postRenameName`, declared and documented as "The post-rename
  callee name" at `:206–207`, pinned at
  `tests/tool-registration-lifetime.test.ts:270`, `:272`, `:297`, `:298`.
- Five further pages spell it the same way, six occurrences between them —
  `docs/spec_topics/lexical.md:18`,
  `docs/spec_topics/diagnostics/code-registry-parse.md:111`,
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:7`
  and `:9`, `docs/reference/schema-subset.md:201`,
  `docs/reference/grammar.md:50` — as does `CHANGELOG.md:33` and the
  reservation predicate's own header comment
  (`src/parser/synthesised-names.ts:7–8`, `:28–31`).
- `post-rename name` is the corpus's established term, not a coinage:
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:22`
  (the resolution snapshot is "a frozen per-theta table of `{ post-rename name
  → resolved callable }` entries"), `docs/spec_topics/expressions.md:51`,
  `docs/spec_topics/errors-and-results/queryerror-variants.md:163`, and in
  `src/` at `callable-set.ts:97`, `query-error.ts:116`,
  `production-theta-producer.ts:2958–2959`.
- The rest of the glossary sentence stands: the SUBS-2 terminology rule is
  purely terminology, and the wire names carry the hex characters themselves
  rather than the literal token `<slug>`. `schema-subset.md:96` (SUBS-2) makes
  the same point by delegating to step 5 instead of respelling the forms.

## Actual behaviour / root cause

`glossary.md:57` spells the tail `__<name>`. `<name>` names no defined string
at that callsite, and the corpus binds the token twice within one page of it:

1. `docs/spec_topics/frontmatter/frontmatter-fields-a.md:85` — the `as <name>`
   clause, whose target *is* the post-rename name. Under this reading the
   glossary is correct.
2. `docs/spec_topics/diagnostics/code-registry-parse.md:111` — the Message
   placeholder of `theta/parse/import-reserved-synthesised-name`, the row that
   enumerates these same four forms: "`<name>` renders the LOCAL binding, not
   the source symbol." Under this reading the glossary is wrong, and it names
   a string that is not a callee name at all.

Reading (2) is the nearer one. The glossary sentence's subject is the
synthesised-name namespace, and the only registry row in the corpus that
enumerates these forms is the one whose `<name>` means something else. A
reader who resolves the token against the surrounding subject matter resolves
it wrongly.

The third reading a reader can reach without leaving the frontmatter page is
the *default* callable name — the basename with hyphens replaced by
underscores (`frontmatter-fields-a.md:84`). That reading yields
`__theta_callee_<hex>__code_review` for `./code-review.theta as my_summariser`
where the implementation mints `__theta_callee_<hex>__my_summariser`. The two
diverge on every entry carrying an `as` clause.

**Root cause: an inline restatement with no mechanical tie to its owner.**
The glossary entry could have delegated — `schema-subset.md:96` does exactly
that for the identical claim, writing "the on-the-wire synthesised tool names
([step 5](#synthesised-names)) … are unaffected" with no form spelled out.
The glossary instead respells both forms inline, so the two texts can drift
without any gate noticing. Nothing checks a restated form against its owner:
`rg -n 'glossary' tools/ tests/ src/` is empty, and the closing gate's
recognisers key on codes, `MUST`s, REQ-IDs and table rows, none of which this
line carries.

**The same phrase was corrected once already, one commit ago.** Bug 0040's
round-1 review raised the callee form spelled `__theta_callee_<slug>__<name>`
inside that diff and flagged both halves of the defect — the drift from `:108`
and the collision with the registry row's own Message placeholder. The fixer
corrected it, and every artefact the diff added spells `<post-rename-name>`
at HEAD. The glossary line was outside the diff and outside the review's
surface, so it survived as the last occurrence of the spelling in the tree.

## Why it matters

- **The drifting page is the corpus's designated terminology authority.**
  `docs/STYLE.md:35` binds every doc writer, human or agent: "The authority is
  `docs/spec_topics/glossary.md`." A phrase that disagrees with its own cited
  owner on this page has the widest downstream reach of any page in the
  corpus, and every writer is directed to it before writing.
- **The two readings pick different strings.** Not a label or a synonym: for
  `./code-review.theta as my_summariser` the default-name reading yields
  `__theta_callee_<hex>__code_review` and the implementation yields
  `__theta_callee_<hex>__my_summariser`. Anyone deriving a registered tool
  name from the glossary — for a `/tools` listing, a transcript grep, a test
  expectation — gets a name that never appears.
- **`<name>` is already spoken for on the row that enumerates these forms.**
  `code-registry-parse.md:111` binds `<name>` to the local import binding and
  says so explicitly. DIAG-4 makes the *Message* column normative, so that
  binding is the load-bearing one; the glossary's reuse of the token for a
  different string on the same subject is the collision 0040's review named.
- **The class is already adjudicated.** One occurrence of this exact phrase
  was found and corrected during 0040; this is the survivor. Leaving it is a
  known-wrong line in the authority page.
- **The blast radius is bounded and stated.** The reservation predicate keys
  on the tail's shape, so no name changes status; no test reads the page; the
  registry is untouched. The cost of the correction is one token.

## Fix

**Correct the tail at `docs/spec_topics/glossary.md:57`.**
`__theta_callee_<actual-16-hex-chars>__<name>` becomes
`__theta_callee_<actual-16-hex-chars>__<post-rename-name>`. That token is the
whole edit. The rest of the line is byte-unchanged: the entry's definition,
the SUBS-2 cross-reference, the sibling
`__theta_respond_<actual-16-hex-chars>`, the `<slug>`-placeholder clause and
the trailing `See:` link all keep their bytes. `post-rename name` is the
corpus's own term (`frontmatter-fields-b-and-templates.md:22`,
`expressions.md:51`, `queryerror-variants.md:163`), so no term is coined.

**DIAG-2 is untouched.** No code is added or removed and no code's namespace,
severity or trigger changes. `code-registry-parse.md:111` keeps its bytes,
including its own `<name>` placeholder and the sentence pinning it to the
local binding; the mirror `docs/reference/diagnostics.md:160` keeps its bytes.
The collision is resolved by moving the glossary side, which is the side that
is wrong. GOV-15 is not engaged: no input's diagnostics, lowered bytes or
registered names change.

**No pinned byte moves.** The substitution adds 12 characters inside one code
span on line 57 of a 72-line LF file. No line is added, removed or reflowed,
so every inbound `path:line` citation into `glossary.md` stays valid —
including bug 0040's residual (ii) at
`0040-inline-slug-def-namespace-not-reserved.md:479–481`, which cites
`glossary.md:57` and stays correct after the fix. Nothing in `src/` or
`tests/` moves.

**Mirror check, same commit.** `docs/reference/` has no glossary mirror, and
its two pages carrying the callee form already spell `<post-rename-name>`. Re-run
`rg -n '__theta_callee' docs/reference/` at the fix baseline; if the result is
anything other than `grammar.md:50` and `schema-subset.md:201`, both spelling
`<post-rename-name>`, correct the mirror in the same commit.

**No test witness, and none is owed.** No test or tool opens `glossary.md`
(`rg -n 'glossary' tools/ tests/ src/` is empty). The page reaches the closing
gate only as one file of `readTree(docs/spec_topics)` into `specSources`
(`tools/closing-gate/live-corpus.js:146`); the substituted span carries no
`theta/` code, no `MUST`, no REQ-ID and no table row, and the page carries no
REQ-IDs at all
(`docs/spec_topics/governance/req-id-prefix-table-active-b.md:9`). Confirm
gate-inertness at fix time by applying the substitution to an in-memory corpus
clone and diffing the full unfiltered gate output, the pattern
`tests/warn-only-canary.test.ts:27–31` sanctions — the live tree is not
written for the check. A prose-matching assertion would invert DIAG-4
(`docs/spec_topics/diagnostics/diagnostic-shape.md:74`) and is deliberately
not built.

**Verification the fix must record.** Re-run the §Reproduction census
afterwards: `rg -n '__theta_callee' --glob '!node_modules' --glob
'!docs/bugs/**' .` shows no `__<name>` tail anywhere, and `rg -n
'actual-16-hex-chars' --glob '!node_modules' --glob '!docs/bugs/**' .` shows
the one surviving line, now spelling `__<post-rename-name>`. `docs/bugs/**` is
excluded because 0040's residual (ii) and this report both quote the defective
spelling verbatim and must keep it. Default gate, `npm run lint` and `npm run
typecheck` green; none of the three has a channel that can red on this change,
which the gate-inertness check above is what establishes.

## Non-goals

- **`<actual-16-hex-chars>` stays as found.** It is doing deliberate work, not
  drifting: the sentence's subject is that the SUBS-2 rename leaves the wire
  names alone, and the contrast it draws is between the wire name (which
  carries the hex characters themselves) and the token `<slug>` (which stays
  the placeholder spelling in registry rows and template bodies). The sibling
  `__theta_respond_<actual-16-hex-chars>` on the same line uses it identically.
  Rewriting either to `<slug>` would erase the contrast the sentence exists to
  draw.
- **The callee registration path's absence is not this report's subject.** No
  production caller constructs a `kind: "callee"` registration entry at HEAD;
  the arm is implemented and unit-pinned but unreached from a `.theta` load.
  That is an implementation-completeness question about
  `pi-integration-contract/tool-registration-lifetime.md:7`, independent of
  how any page spells the name.
- **No restatement gate is proposed.** The corpus has no mechanism tying an
  inline restatement of a form back to the page declaring itself that form's
  source of truth, which is why this drift survived. SUBS-2
  (`schema-subset.md:96`) already reserves a future grep gate over the
  *terminology* synonyms and none exists yet
  (`rg -n 'sha12|lowered-schema hash|schema-hash' tools/ tests/` is empty).
  Whether either gate should exist, and where its boundary against DIAG-4
  falls, is a separate adjudication.
- **The reserved set does not change.** `src/parser/synthesised-names.ts:34–36`
  matches the tail as a shape (`[A-Za-z0-9_]+`), so no author name gains or
  loses reservation status, and
  `tests/inline-slug-name-reservation.test.ts` needs no edit.

## Provenance

- Origin: the bug 0040 fix implementation (commit `aef82bde`, 0.50.0).
  Recorded twice, both as flagged-not-filed: `.pi/tmp/fixes/0040-report.md`
  §Residuals item 2 — "`docs/spec_topics/glossary.md:57` spells the callee
  form's tail `__<name>` where schema-subset.md `:108` spells it
  `__<post-rename-name>`. Pre-existing drift, untouched by this fix (fixing it
  would be an unrelated prose edit). Unfiled." — and
  [0040](./0040-inline-slug-def-namespace-not-reserved.md) §Fix (0.50.0)
  Residuals (ii) (`:479–481`). This report is that filing. The same fix
  report's §Review rounds records the round-1 nit that corrected the identical
  phrase in `tests/inline-slug-name-reservation.test.ts`.
- The defect and its owner: `docs/spec_topics/glossary.md:57` (the **schema
  slug** entry), `:19` (the paired **canonical schema hash** entry);
  `docs/spec_topics/schema-subset.md:108` (§Synthesised names, the declared
  source of truth), `:96` (SUBS-2, which delegates instead of respelling),
  `:94` (the pairing of the two terms), `:107` (step 4, the 16-hex output).
- The two readings of `<name>`:
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:84` (the default
  callable name), `:85` (the `as <name>` override and
  `theta/load/invalid-tool-rename`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:111` (the
  `theta/parse/import-reserved-synthesised-name` row, its Message, and the
  sentence binding `<name>` to the local import binding), mirrored at
  `docs/reference/diagnostics.md:160`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4).
- `post-rename name` as the corpus's term:
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:22`
  (§Resolution snapshot), `docs/spec_topics/expressions.md:51`,
  `docs/spec_topics/errors-and-results/queryerror-variants.md:163`;
  `src/parser/callable-set.ts:97`, `src/runtime/query-error.ts:116`,
  `src/extension/production-theta-producer.ts:2958–2959`.
- The implementation: `src/runtime/tool-registration.ts:201–207` (the
  `RegistrationEntry` callee arm and the `postRenameName` field), `:257–301`
  (`registerToolInCache`), `:303–313` (`contentAddressedName`, the one
  construction site); `src/extension/production-theta-producer.ts:2613–2628`
  (`#registerRespondTool`, the only caller, `kind: "respond"`), `:640` (the
  cache field); `src/parser/synthesised-names.ts:7–8`, `:28–31` (the header's
  quotation of `:108`), `:34–36` (the predicate).
- Pins and further occurrences (all unchanged by the fix):
  `tests/tool-registration-lifetime.test.ts:255–306`;
  `tests/inline-slug-name-reservation.test.ts:36`, `:853`;
  `docs/spec_topics/lexical.md:18`;
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md:7`,
  `:9` (PIC-44); `docs/reference/schema-subset.md:201`;
  `docs/reference/grammar.md:50`; `CHANGELOG.md:33`.
- Style and gate surface: `docs/STYLE.md:35` (the glossary as terminology
  authority); `tools/closing-gate/live-corpus.js:146` (the `specSources`
  ingest); `docs/spec_topics/governance/req-id-prefix-table-active-b.md:9`
  (`glossary.md` carries no REQ-IDs);
  `tests/warn-only-canary.test.ts:27–31` (the in-memory-clone pattern).
- Verification at HEAD `aef82bde`: every citation above read from the tree;
  the corpus census in §Reproduction run as `rg -c '__theta_callee' --glob
  '!node_modules' .` and `rg -n 'actual-16-hex-chars' --glob '!node_modules'
  .`; `rg -n 'glossary' tools/ tests/ src/` and `rg -n 'kind: "callee"' src/`
  both run and reported. One scratch vitest probe written under `tests/`, run
  once, output transcribed verbatim into §Reproduction, and deleted; no other
  file in the tree was written.

## Fix (0.250.0)

- What shipped: `docs/spec_topics/glossary.md:57` — the **schema slug** entry's
  callee wire-name tail respelled `__theta_callee_<actual-16-hex-chars>__<name>`
  → `__theta_callee_<actual-16-hex-chars>__<post-rename-name>`, matching the
  declared owner `schema-subset.md:108` and the one construction site
  (`src/runtime/tool-registration.ts:311`, which splices `entry.postRenameName`).
  That token is the whole edit: one file, one line, one code span. §Non-goals
  honoured — both `<actual-16-hex-chars>` occurrences, the sibling
  `__theta_respond_<actual-16-hex-chars>`, the `<slug>`-placeholder clause, the
  SUBS-2 cross-reference and the trailing `See:` link keep their bytes. Docs-only:
  `git diff --stat -- src/` is empty.
- Gates: `npm test` — `Test Files 427 passed (427)`, `Tests 9044 passed (9044)`;
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — no output, exit clean;
  `npm run lint` (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) — no
  output, exit clean. Byte stability: `wc -l` 72 before and after, so line 57 is
  still line 57 and every inbound `path:line` citation into the page — including
  0040's residual (ii) — stays valid.
- Witness: none, and none owed. §Fix settles it (a prose-matching assertion
  would invert DIAG-4, `diagnostics/diagnostic-shape.md`), and `glossary.md`
  carries no REQ-IDs
  (`governance/req-id-prefix-table-active-b.md:9`). The designated substitute —
  gate-inertness over an in-memory corpus clone, the pattern sanctioned at
  `tests/warn-only-canary.test.ts` — was run twice independently, each time via
  a scratch file run once and deleted, the live tree never written:
  `assembleLiveCorpus` post-fix vs. an in-memory clone reverted to the defective
  spelling, both through the full unfiltered `runClosingGate`, gave
  `post-fix findings count = 2263`, `pre-fix findings count = 2263`,
  `outputs identical = true`. The closing gate cannot see the substitution.
- Review: 1 round — `bug-fix-reviewer`, verdict CLEAN, zero findings across
  fidelity, correctness, non-goals, style and collateral.
- Verification: PASS. Fidelity/byte-stability (word-diff isolates the one token;
  72 lines both sides; one modified file tree-wide). Census — `rg -n
  '__theta_callee' --glob '!node_modules' --glob '!docs/bugs/**' .` leaves no
  `__<name>` tail anywhere, and `rg -n 'actual-16-hex-chars' --glob
  '!node_modules' --glob '!docs/bugs/**' .` returns exactly one line,
  `glossary.md:57`, now spelling `__<post-rename-name>`; `docs/bugs/**` still
  quotes the defective spelling verbatim, as §Fix requires. Gate-inertness as
  above. Gates green. No live test owed: the diff touches zero `src/` bytes, so
  no runtime path changed.
- Mirror check (the conditional §Fix keeps): `rg -n '__theta_callee'
  docs/reference/` returns exactly `grammar.md:111` and `schema-subset.md:254`,
  both already spelling `<post-rename-name>`. No mirror correction owed, none
  made.
- Residuals:
  1. **§Affected's "no test opens the page" claim is stale at fix time.** The
     report states `rg -n 'glossary' tools/ tests/ src/` returns nothing; at the
     fix baseline it returns
     `tests/grammar-literal-forbidden-access-naming.test.ts:148`, `:253`,
     `:281`, `:284`, `:294`, `:296` — bug 0037's cell C1, which reads
     `glossary.md` and asserts it contains neither `member access` nor
     `indexed access`. The substituted token contains neither string, so the
     assertion is undisturbed; the file was run and passed 8/8, and the full
     suite is green. The claim's *conclusion* (no test witnesses this line)
     survives; its *premise* does not.
  2. **Line-number drift in §Affected, pre-existing and not corrected here.**
     The report was filed at `aef82bde`/0.50.0; at the fix baseline the cited
     lines have moved: `code-registry-parse.md:111` → `:135`,
     `docs/reference/schema-subset.md:201` → `:254`,
     `docs/reference/grammar.md:50` → `:111`, `CHANGELOG.md:33` → `:4684`,
     `src/runtime/tool-registration.ts:308–313` → `:311`. Substance identical
     at every one; re-derived and quoted in `.pi/tmp/fixes/0057-report.md`.
     Left as found — correcting a filed report's historical citations is not
     this fix's subject and would churn a page no gate reads.
  3. **Corpus census grew since filing**, with no bearing on the fix:
     `src/parser/schema-lowering.ts:832` (prefix `__theta_callee_` only, no
     placeholder tail) and `docs/bugs/0099-…md` (7 hits) now also match
     `__theta_callee`. Neither carries a `__<name>` tail.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: `<actual-16-hex-chars>` stays as found on
  both wire names. `code-registry-parse.md` keeps its bytes, its own `<name>`
  placeholder and the sentence binding it to the LOCAL import binding — the
  collision is resolved by moving the glossary side, which is the wrong one.
  The reserved set is unchanged (`src/parser/synthesised-names.ts:35` matches
  the tail as a shape). No restatement gate proposed. The callee registration
  path's absence of a production caller is out of scope. Bug 0063's oracle cell
  C3 (`diagnostics/placeholder-rendering-a.md` §3, 17 rows) is byte-untouched
  and does NOT flip: the fix never reaches that file.
