# Bug 0112 — Two shipped records disagree with the tree on the `tools:`-containment surface: ten source comments across three `src/extension/` files label the discovery-root containment check `INV-5`, while `invocation.md`'s INV-5 is subagent return-value propagation over the envelope and containment's pin is INV-1 — which one of those same files names correctly eight times; and `docs/plan_topics/coverage-matrix.md` maps that pin as `INV-1 | V15a` alone, so the 37-cell witness now discharging its `tools:`-entry site (`tests/tools-entry-containment.test.ts`) is reachable from no row

- **Status:** fixed (0.237.0). §Fix is settled: two independent, mechanical edits — ten
  comment tokens rewritten across three `src/extension/` files, one annotation
  added to `docs/plan_topics/coverage-matrix.md:92` — with no executable line
  touched in either. Neither edit adds, removes or renames a `theta/*` code, a
  registry row, a REQ-ID or a plan leaf, and no runtime observable moves. No
  ordering dependency: both findings are residuals of
  [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md), which
  shipped in 0.66.0 and is the tree this report measures.
- **Sev/Diff estimate:** S4/D1 — both findings are records that misdescribe a
  tree whose behaviour is correct (a comment naming the wrong REQ-ID; a
  traceability row that omits a site), so the benefit is corpus fidelity and not
  corrected behaviour; D1 because every edit is a comment or prose token, no
  test is owed, and the two live-gated readers of the matrix stay green under the
  row form §Fix pins.
- **Kind:** two instances of one defect class — a shipped record of the
  `tools:`-entry containment rule that does not match the tree, both surfaced by
  the 0110 fix, both behaviour-neutral. The two are disjoint in file, in reader,
  and in what they misstate.
  1. *Source-comment side.* Ten comments in `src/extension/invoke-static-checks.ts`
     (4), `src/extension/production-composition.ts` (3) and
     `src/extension/production-theta-producer.ts` (3) label the
     `realpath`-then-discovery-root containment check `INV-5`.
     `docs/spec_topics/invocation.md:36`'s INV-5 is **Subagent return-value
     propagation over the envelope**; the containment rule is §Resolution
     (`:12`) and its two-site pin is INV-1 (`:14`, `:16`).
  2. *Plan-doc side.* `docs/plan_topics/coverage-matrix.md:92` maps INV-1 —
     the pin that names `tools:` `.theta` entry registration as one of its two
     load-time sites — to the single closing leaf `V15a`, whose witness
     (`tests/invocation-core.test.ts`) drives the shared checker directly and no
     `tools:` entry. The 37-cell witness that now discharges that site,
     `tests/tools-entry-containment.test.ts`, cites no leaf, no `cka-<n>` token
     and no REQ-ID, so no row reaches it.
- **Related:**
  - [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md) —
    **fixed (0.66.0)**, the parent and the filing origin. This report is its
    §Fix (0.66.0) *Residuals* item 4 (`:1294–1301`, the label drift) and item 6
    (`:1308–1311`, the absent coverage row), filed. Its §Non-goals bullet
    (`:674–683`) states finding 1 in the present tense, records it "unfiled",
    and resolves this report's INV citations in advance: "where the source says
    INV-5 and means containment, the owning rule is invocation.md §Resolution
    plus the INV-1 seam". Two corrections to that bullet's own evidence are
    recorded in §Actual behaviour: it names two files where the tree has three,
    and its `production-theta-producer.ts:3116` citation is stale (`:3182` at
    HEAD, shifted by its own fix's insertions).
  - [0109](./0109-tools-diagnostic-enumerations-one-generation-behind.md) —
    **open**, the same class at a different surface: two shipped enumerations of
    the `tools:` diagnostic family one generation behind the closed registry.
    Same properties as this report — records rather than behaviour, no observable
    moves, mechanical edits, filed as a pair because that is one commit's worth
    of work. The two reports are disjoint in every file they touch: 0109 edits
    `src/extension/production-composition.ts`'s `preEvalCauseOf` batch (an
    executable `if`) and `docs/spec_topics/functions.md:70`; this report edits
    comment lines in that file and one row of
    `docs/plan_topics/coverage-matrix.md`. They can land in one sitting, and the
    only coordination needed is that both touch `production-composition.ts`, so
    whichever lands second re-derives its `path:line` citations.
  - [0071](./0071-theta-callable-call-arity-unchecked.md) — **fixed (0.64.0)**,
    and [0072](./0072-tool-arg-checks-dead-and-no-runtime-net.md) — **fixed
    (0.65.0)**: the two commits that grew `src/extension/invoke-static-checks.ts`
    into its current shape, which is why finding 1's citations to that file are
    given as symbol plus comment text rather than bare line numbers. Neither is
    the drift's origin and neither is a dependency; both are named because a
    reader re-deriving the file's line numbers will find them shifted again.
- **Affected** (every citation re-verified at HEAD `6093597c`, 0.66.0):
  - `docs/spec_topics/invocation.md:14`, `:16` — INV-1. `:14` is the anchor line,
    verbatim: `> <a id="inv-1"></a> **INV-1.** **Symlink-resolution-hardening
    seam.**`. `:16` is the obligation: "The load-time check (parent theta
    registration / `tools:` `.theta` entry registration) and the
    invocation-time re-check (the moment the runtime opens the callee for
    invocation) MUST apply the identical
    `realpath`-then-discovery-root-containment semantics — including the
    segment-boundary within-root predicate — defined under *Resolution* above".
    This is the rule the ten comments annotate.
  - `docs/spec_topics/invocation.md:36` — INV-5, verbatim: `<a id="inv-5"></a>
    **INV-5.** **Subagent return-value propagation over the envelope.**` Its
    body binds the parent to derive an `invoke` result solely from the child's
    `theta_result` envelope, maps the `ok` / `err` arms, and extends the same
    reading to a `subagent fn` call crossing the boundary inline. It says
    nothing about paths, roots, `realpath` or containment.
  - `docs/spec_topics/invocation.md:12` — §Resolution, which states the
    containment rule the comments describe (byte-exact comparison on
    `FileSystem.realpath` output, segment-boundary within-root predicate, "A
    resolved path that escapes every active root is a load-time error
    `theta/load/invoke-path-escape`", and "a `tools:` `.theta` entry that
    escapes likewise fails to register the callable"), and which names INV-1 as
    the pin: "INV-1 below pins identical containment semantics across both call
    sites".
  - `docs/spec_topics/invocation.md:40`, `:44`, `:85` — INV-2 (**Named-argument-invocation
    seam**), INV-3 (**Per-call-timeout seam**), INV-4 (**Invocation depth
    bound**). With `:14` and `:36` these are the whole live INV set:
    `rg -o '<a id="inv-[0-9]+"></a>' docs/spec_topics/` returns exactly five
    anchors, all on this page.
  - `docs/spec_topics/governance/req-id-prefix-table-active-a.md:63` — the row
    `| `invocation.md` | `INV` |`, which binds a bare `INV-<n>` token to this
    page's anchors. `docs/spec_topics/governance/req-id-prefix-table-retired.md`
    contains no `INV-` row (`rg -c 'INV-'` → no match), so no retired-ID reading
    resolves the labels either.
  - `src/extension/invoke-static-checks.ts` — four containment comments, cited
    by symbol and text because bugs 0071, 0072 and 0110 each rewrote parts of
    this file:
    - the module header comment's bullet list of the checks the pass owns:
      "INV-5 — `checkInvokePathAtLoad` (the shared realpath + discovery-root
      containment check) so a callee resolving outside every active discovery
      root is `theta/load/invoke-path-escape` and the parent does not register"
      (`:28–30` at HEAD);
    - inside `walkExpr` (declared `:170`), the `par for` arm: "the `invoke(...)`
      surface's INV-5 path-escape and `checkCalleeHasErrors` checks" (`:225`);
    - `checkInvokeStaticResolution`'s doc comment, first bullet: "INV-5
      path-escape (`theta/load/invoke-path-escape`) via the shared realpath +
      discovery-root containment check — the `invoke(...)` surface ONLY. The
      `tools:` `.theta`-entry surface's containment is judged upstream, at
      `tools:` resolution time (`parseCalleeForTools`)…" (`:613`). The 0110 fix
      rewrote this bullet's body and left its label;
    - the `invoke(...)` loop's call site: "INV-5 (invocation.md §Resolution): a
      resolved callee outside every active discovery root un-registers the
      parent" (`:683`), immediately above the `checkInvokePathAtLoad` call.
  - `src/extension/invoke-static-checks.ts:646` — the same doc comment's closing
    sentence: "The extension / path-separator (INV-1 / INV-2) and dynamic-path
    (INV-8) checks already fired during the whole-file parse and are not
    repeated here." This is the file's only `INV-1` token, and its subject is
    the extension / separator rules, not containment — so correcting the four
    labels above puts `INV-1` on two subjects in one file unless this sentence
    moves with them (§Fix step 1).
  - `src/extension/production-composition.ts:494`, `:627`, `:737` — three
    containment comments, all inside `runComposePass` (declared `:397`):
    the `activeRoots` derivation ("INV-5 (invocation.md §Resolution): the active
    discovery-root union threaded into the invoke containment check — the parent
    directory of every discovered theta"); the producer wiring ("INV-5
    (invocation.md INV-1 seam): the runtime open-time containment re-check
    consults the same `realpath` seam and active-root union"); and the invoke
    static-check call site ("INV-3 / INV-4 / INV-5: run the invoke static checks
    against the resolved callees and the shared invoke graph"). This file is not
    named in 0110's residual 4.
  - `src/extension/production-composition.ts:699`, `:1390`, `:1432`, `:1443`,
    `:1479`, `:1672`, `:1695`, `:1949` — the eight comments the 0110 fix added,
    every one labelling the same containment rule `INV-1` and marked "bug 0110"
    (e.g. `:1695`: "INV-1 (invocation.md §Resolution) / bug 0110: the same
    `realpath` + discovery-root containment check the `invoke(...)` surface
    runs"). One file therefore labels one rule two ways, eleven times.
  - `src/extension/production-theta-producer.ts:468` — the doc comment on
    `ProductionProducerInput`'s `fileSystem` / `activeRoots` fields (interface
    declared `:350`): "INV-5 (invocation.md §Resolution, INV-1 seam): the
    `FileSystem.realpath` seam and the union of currently-active discovery
    roots, used by the runtime open-time containment re-check."
  - `src/extension/production-theta-producer.ts:3182` — inside `#driveCallee`
    (declared `:3172`): "INV-5 (invocation.md §Resolution, INV-1 seam): re-run
    the realpath + discovery-root containment check at the moment the runtime
    opens the callee, against the *currently* active roots."
  - `src/extension/production-theta-producer.ts:3320` —
    `#recheckCalleeContainment`'s doc comment (method declared `:3326`): "INV-5
    runtime re-check: resolve the callee path against the caller's directory and
    re-run the shared realpath + discovery-root containment check against the
    currently-active roots." This one names no INV-1 seam anywhere.
  - `src/extension/production-theta-producer.ts:2146` — the file's fourth
    `INV-5` token, and a correct one: inside `#spawnSubagentFnSession`'s doc
    comment (`:2135–2152`), "Consistent with revised INV-5, its body runs
    IN-PROCESS against an isolated OFF-SESSION conversation in the parent",
    whose subject is the `subagent fn` boundary INV-5's own text covers.
  - `src/runtime/invocation.ts:1`, `:6–12`, `:42`, `:72`, `:92` — the module that
    owns the check, and the in-tree positive precedent: its header declares the
    leaf ("V15a / V15a-T — the invocation-core seam"), then "INV-1 — the
    symlink-resolution-hardening seam. A single named
    `realpath`-then-discovery-root-containment check shared by the load-time
    registration check and the invocation-time runtime re-check"; `:42` is the
    section rule "INV-1 — invoke-path discovery-root containment (load-time +
    runtime re-check)"; `:72` and `:92` label
    `InvokePathContainment` / `checkInvokePathContainment` INV-1. The functions
    the ten mislabelled comments call are labelled INV-1 at their definitions.
  - `src/runtime/subagent-envelope.ts:27`, `:208`, `:277`, `:281` and
    `src/runtime/subagent-json-driver.ts:24`, `:59`, `:85` — the seven other
    `INV-5` tokens in `src/`, all on envelope reconstruction and its
    fail-closed mappings. The label is live and in use for its own subject.
  - `src/parser/theta-document.ts:4204–4207` — "INV-1 / INV-2 (invocation.md
    §Resolution; lexical.md §"Path literals" / §"Extension matching") … INV-8: a
    non-literal (runtime-computed) path is not supported in theta 1.0". The same
    private numbering as `invoke-static-checks.ts:646`, on the parse-time
    extension / separator / dynamic-path checks. Scoped out (§Non-goals).
  - `docs/bugs/0004-generic-annotation-drops-transitive-defs.md:185` — the
    corpus's own record of that numbering, verbatim: "(§Typed return — tagged
    INV-6 in implementation comments; the spec's own anchors stop at INV-5)".
    `:116` names the tag's site (`#validateInvokeReturn`'s doc comment).
  - `docs/plan_topics/coverage-matrix.md:3` — the matrix's stated purpose:
    "Every executable spec REQ-ID is mapped here to the **implementation** leaf
    (`<id>`) that closes it (its green tests are the closure evidence; the paired
    `<id>-T` tests task is not listed separately)."
  - `docs/plan_topics/coverage-matrix.md:15`, `:92`, `:95` — the *Numbered
    REQ-IDs* table header (`| REQ-ID | Closing leaf(s) |`), the row
    `| INV-1 | `V15a` |`, and the row `| INV-5 | RFC 0006 (child-process theta
    execution — envelope return propagation) |`. The second row is what a reader
    following a source comment's `INV-5` reaches for containment coverage.
  - `docs/plan_topics/coverage-matrix.md:7` — *Closing-leaf column authoring*:
    the column "is machine-read by the `H5d` transitive-completeness gate, which
    tokenises each cell by taking exactly its backtick-delimited spans as leaf-ID
    tokens. Every leaf-ID in a closing-leaf cell MUST therefore be
    backtick-delimited … and no other span in that cell may be — the
    parenthetical facet / co-witness annotation prose carries no backticks".
  - `docs/plan_topics/coverage-matrix.md:9` — *Multi-leaf-row per-facet citing
    tests*: when a cell "lists two or more leaves", each non-co-witness facet
    "MUST carry its own **facet-naming citing test** — a test that cites both the
    row's subject inline … and that facet's closing-leaf-ID inline". This is the
    constraint that fixes the row form in §Fix step 2.
  - `docs/plan_topics/coverage-matrix.md:87–91` — the five rows whose
    closing-leaf cell names a bug fix rather than a leaf (`PIC-65` … `PIC-69`,
    e.g. "bug 0024 fix (own-registration exclusion from the cross-format
    collision source set …)"). The precedent for the annotation form step 2
    uses, and evidence that an unbackticked closer is admissible in a live cell.
  - `docs/plan_topics/coverage-matrix.md:114`, `:116`, `:121`, `:123` — the
    *Code-keyed obligation areas* table: its heading, its scope sentence
    ("Several non-narrative pages own their obligations through `theta/parse/*`,
    `theta/load/*`, and `theta/runtime/*` diagnostic codes rather than numbered
    `PREFIX-N` REQ-IDs"), the append-only `cka-<n>` *Token* rule, and the table
    header. `:188` carries `cka-64`, the highest token in use.
  - `docs/plan_topics/coverage-matrix.md:137`, `:138` — `| `cka-13` |
    `tool-calls.md` (TOOL) | `V14a`, `V14b`, `V14c`, `V14e` |` and `cka-14`,
    which enumerates "the six un-anchored `invoke` parse/load diagnostic codes"
    and correctly excludes `theta/load/invoke-path-escape` — that code is
    anchored by INV-1, not un-anchored. `rg 'invoke-path-escape|containment'
    docs/plan_topics/coverage-matrix.md` returns no match: the code and the word
    appear nowhere in the matrix.
  - `docs/spec_topics/tool-calls.md:14` — §"Argument shape", the obligation the
    new witness discharges: "a path that escapes the active discovery roots is
    rejected with `theta/load/invoke-path-escape` and the callable is not
    created". `docs/spec_topics/diagnostics/code-registry-load.md:33` — the
    registry row, whose *Trigger* names "An `invoke(...)` literal or a `tools:`
    `.theta` entry" and whose *Phase* is `load, runtime`.
  - `tests/tools-entry-containment.test.ts` — the 0110 witness: 910 lines, 10
    `describe` groups (cells A, B0, C1–C3, D, E, F, G, H1–H2, I, J), 30 `it(`
    literals, **37** vitest cells, green at HEAD (`npx vitest run
    tests/tools-entry-containment.test.ts` → 1 file / 37 tests). Its header
    (`:23–36`) cites the bug, the two spec pages and the registry row.
    `rg 'cka-[0-9]+|\bV1[0-9][a-z]\b|INV-[0-9]+|coverage-matrix'` over the file
    returns no match.
  - `tests/invocation-core.test.ts:1`, `:15`, `:53–175` — `V15a`'s witness. Its
    header declares the leaf and cites `INV-1`, `V15a`, `V15e` and `cka-44`
    inline, which is what satisfies the gate's citing-test arm for the INV-1
    row. The eight cells in `:53–175` (two `describe` groups, `:53` and `:102`)
    drive `checkInvokePathContainment`, `checkInvokePathAtLoad` and
    `recheckInvokePathAtRuntime` against a `FakeFileSystem`; none drives a
    `tools:` entry. The file runs 10 cells in total; the other two are the
    static-resolution parse-cache group at `:220`.
  - Witness-citation census over the `tools:`-surface witnesses
    (`rg -o 'cka-[0-9]+|\bV1[0-9][a-z]\b|INV-[0-9]+|TOOL-[0-9]+'`):
    `tests/production-tools-load-resolution.test.ts` cites `cka-11`, `cka-14`,
    `V15f`, `INV-3`; `tests/theta-callable-call-arity.test.ts` cites `INV-3`
    only; `tests/tools-entry-closed-grammar.test.ts`,
    `tests/tools-entry-closed-grammar-lockstep.test.ts` and
    `tests/tools-derived-name-shape.test.ts` cite none. Finding 2's witness is
    the fourth uncited `tools:`-surface witness, not an isolated omission
    (§Non-goals).
  - `tests/live-corpus-release-gate.test.ts:134–156` — the hard gate over the
    real matrix: "npm test runs the closing gate against the live spec corpus,
    live test corpus, and live coverage-matrix.md and PASSES green — every arm
    returns zero findings over the live corpus", asserting `findings` empty.
    `tests/warn-only-canary.test.ts:118`, `:136` — the same machinery in its
    warn-only disposition. These two are the reason step 2's row form is
    constrained rather than free.
  - `tools/closing-gate/live-corpus.js:51–59` (`CANARY_GAP_KINDS` — seven kinds:
    `unmapped-executable-req-id`, `mapped-req-id-no-citing-test`,
    `per-facet-citing-test-missing`, and the four un-anchored-MUST kinds),
    `:144–156` (`assembleLiveCorpus`'s returned corpus: `prefixTableText`,
    `specSources`, `coverageMatrixText`, `registryText`, `testSources`,
    `planLeavesText`, `perFacetCitingTests` — no `srcSources`, no
    `h5bDepsText`), `:183–185` (`warnOnlyFindings` = `runClosingGate` filtered to
    those seven kinds).
  - `tools/closing-gate/index.js:670` (the broad-catch arm's
    `corpus.srcSources ?? []`, empty on the live corpus), `:753` (the H5d
    transitive-completeness arm, gated on `h5bDepsText` and therefore dormant on
    the live corpus), `:774` (the un-anchored-MUST arms), `:839–842` (the
    per-facet arm and its `if (listed.length < 2) continue;` single-leaf skip),
    `:391–404` (`deriveFacetPartition`, whose leaf regex is
    ``/`([A-Z]+[0-9]*[a-z]?)`\s*(?:\(([^)]*)\))?/g`` — backticked spans only),
    `:502–523` (`parseCkaAreaRows`, which reads a row's pages by matching
    `*.md` in the area cell).
  - `tools/eslint-plugin-theta-local/index.js:32–36` — the lint's own scope
    note: it "verifies only that such a comment with a non-empty cited token is
    present; resolving the token against coverage-matrix.md is the theta 1.0
    closing gate's job (H5c), not this rule's". No lint rule reads a REQ-ID
    label in a comment.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15 and
    its three observables: "(a) return values, (b) ordered diagnostic-code
    sequences, and (c) equivalent `theta-system-note` content strings".
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, the closed
    registry. Neither is engaged (§Expected behaviour).
- **Observed at:** `0.66.0` (HEAD `6093597c`, `package.json:3`,
  `CHANGELOG.md:9`), Windows. Offline, deterministic; no live model, no
  provider. Established by source and doc inspection at HEAD plus two runs:
  `npx vitest run tests/tools-entry-containment.test.ts` → 1 file / 37 tests
  green, and the greps quoted above. No scratch fixture was written.

## Summary

Two shipped records of the `tools:`-entry containment rule disagree with the
tree. Both are residuals of the 0110 fix; neither changes behaviour.

1. Ten comments in three `src/extension/` files label the
   `realpath`-then-discovery-root containment check `INV-5`.
   `docs/spec_topics/invocation.md:36`'s INV-5 is subagent return-value
   propagation over the envelope. The rule those comments annotate is
   §Resolution (`:12`), pinned across its two load-time sites by INV-1 (`:14`,
   `:16`). A reader resolving `INV-5` lands on the envelope contract, and — via
   `docs/plan_topics/coverage-matrix.md:95` — on RFC 0006 rather than on `V15a`.
2. The matrix maps INV-1 to the single closing leaf `V15a` (`:92`). INV-1 is a
   two-site pin whose text names "`tools:` `.theta` entry registration" as one
   of the two load-time sites. `V15a`'s witness drives the shared checker and no
   `tools:` entry; the witness that now drives that site,
   `tests/tools-entry-containment.test.ts` (37 cells), cites no leaf, no
   `cka-<n>` token and no REQ-ID. No row reaches it.

The 0110 fix bounds finding 1 precisely. Its own new comments name INV-1 where
they name the rule — eight of them, in `production-composition.ts`, each marked
"bug 0110" — and it left the pre-existing `INV-5` labels as found, including one
whose body it rewrote (`invoke-static-checks.ts:613`). The drift is therefore
unchanged in extent, not widened: the same file now labels one rule INV-1 eight
times and INV-5 three times.

The two are independent edits sharing a cause and a commit's worth of work.
They touch different files, serve different readers, and misstate different
things; what they share is that the fix which made the `tools:` surface enforce
containment did not carry its records along. Neither edit touches an executable
line.

## Reproduction

Both findings are established by reading the tree at HEAD. Every command is
offline.

**Finding 1 — what INV-1 and INV-5 are.**

```sh
# The whole live INV set: five anchors, all on invocation.md.
rg -o '<a id="inv-[0-9]+"></a>' docs/spec_topics/

# INV-1 (the containment pin) and INV-5 (the envelope rule), verbatim.
sed -n '14p;16p' docs/spec_topics/invocation.md
sed -n '36p' docs/spec_topics/invocation.md

# The prefix binding that makes a bare INV-<n> resolve to that page …
rg -n '`invocation.md` \| `INV`' docs/spec_topics/governance/req-id-prefix-table-active-a.md
# … and no retired INV row that would license another reading.
rg -c 'INV-' docs/spec_topics/governance/req-id-prefix-table-retired.md
```

**Finding 1 — the labels, by subject.**

```sh
# 11 tokens in the three extension files: 10 on containment, 1 on the envelope.
rg -n 'INV-5' src/extension/invoke-static-checks.ts \
              src/extension/production-composition.ts \
              src/extension/production-theta-producer.ts

# The same rule, labelled INV-1, in one of those files (8 comments, bug 0110).
rg -n 'INV-1' src/extension/production-composition.ts

# The module that owns the check labels it INV-1 at every definition.
rg -n 'INV-1' src/runtime/invocation.ts

# The label's correct users, for contrast: envelope reconstruction.
rg -n 'INV-5' src/runtime/subagent-envelope.ts src/runtime/subagent-json-driver.ts
```

Read the subject beside each hit: `invoke-static-checks.ts:28`, `:225`, `:613`,
`:683`; `production-composition.ts:494`, `:627`, `:737`;
`production-theta-producer.ts:468`, `:3182`, `:3320` all describe path
containment. `production-theta-producer.ts:2146` describes a `subagent fn` body
crossing the subagent boundary, which is INV-5's own subject.

**Finding 2 — the matrix, and what the witness cites.**

```sh
# The row, and the row a reader following an INV-5 label reaches instead.
sed -n '3p;15p;92p;95p' docs/plan_topics/coverage-matrix.md

# The code and the word appear nowhere in the matrix.
rg -n 'invoke-path-escape|containment' docs/plan_topics/coverage-matrix.md

# The witness cites no leaf, no token, no REQ-ID.
rg -n 'cka-[0-9]+|\bV1[0-9][a-z]\b|INV-[0-9]+|coverage-matrix' \
   tests/tools-entry-containment.test.ts

# V15a's own witness does cite them — and drives no `tools:` entry.
sed -n '1p;15p' tests/invocation-core.test.ts
rg -n 'tools:' tests/invocation-core.test.ts
```

**Finding 2 — what gates the matrix.**

```sh
# Two tests read the live matrix; the first asserts zero findings.
rg -n 'coverage-matrix' tests/live-corpus-release-gate.test.ts tests/warn-only-canary.test.ts

npx vitest run tests/live-corpus-release-gate.test.ts tests/warn-only-canary.test.ts
```

Both green at HEAD: 2 files / 10 tests. The arm set they project is
`CANARY_GAP_KINDS` (`tools/closing-gate/live-corpus.js:51–59`), and the corpus
they assemble (`:144–156`) carries no `srcSources` and no `h5bDepsText` — so no
gate reads a `src/**` comment, and the H5d closing-leaf-token arm
(`tools/closing-gate/index.js:753`) is dormant over the live matrix.

## Expected behaviour

- **A comment naming a spec rule names the rule that governs the code it
  annotates.** The repo's comment rule is WHY-not-WHAT; a wrong REQ-ID defeats
  it at the first hop, because the WHY is delegated to a citation and the
  citation resolves elsewhere. `INV-<n>` resolves through one binding
  (`req-id-prefix-table-active-a.md:63`: `invocation.md` owns `INV`) to one
  anchor, and `#inv-5` is subagent return-value propagation over the envelope
  (`invocation.md:36`). The containment rule is §Resolution (`:12`), and its
  load-time / runtime two-site identity is INV-1 (`:14`, `:16`) — the pin that
  names `tools:` `.theta` entry registration as a call site. The tree already
  applies this reading twice: `src/runtime/invocation.ts` labels the checker
  INV-1 at every definition (`:6–12`, `:42`, `:72`, `:92`), and the 0110 fix's
  eight new comments in `production-composition.ts` label the same rule INV-1.
  The mislabel also mis-routes the coverage lookup: `coverage-matrix.md:95`
  maps INV-5 to RFC 0006 (envelope return propagation), while containment's
  closure is `:92`'s `V15a`.
- **A witness is traceable to the obligation it discharges.** The matrix's
  stated purpose (`:3`) is that "Every executable spec REQ-ID is mapped here to
  the **implementation** leaf (`<id>`) that closes it (its green tests are the
  closure evidence)". A row therefore names an obligation and the closer whose
  green tests are its evidence. INV-1's obligation has two load-time sites
  (`invocation.md:16`); its row names one closer, whose witness exercises
  neither surface end-to-end. `tests/tools-entry-containment.test.ts` is the
  green evidence for the `tools:` site as of 0.66.0, and nothing in the matrix
  points at it, so the row understates what closes the pin it maps.
- **Neither finding engages a code, a row or an observable.** No `theta/*` code
  is added, removed or renamed, so DIAG-2's closed-registry rule
  (`diagnostic-shape.md:72`) is satisfied by the row that already exists
  (`code-registry-load.md:33`, whose *Trigger* names both surfaces and whose
  *Phase* is already `load, runtime`). GOV-15's three observables
  (`source-language-stability.md:5`) — (a) return values, (b) ordered
  diagnostic-code sequences, (c) `theta-system-note` content strings — are
  untouched: the edits are comment tokens and one plan-doc table cell, and no
  input's emitted sequence or note content changes. There is no
  `docs/reference/` mirror to move, because neither record is user-facing.

## Actual behaviour / root cause

### Finding 1 — the label

Eleven `INV-5` tokens sit in the three `src/extension/` files that carry the
containment story. Ten annotate path containment; one annotates the envelope.

| Site | Subject | Verdict |
|---|---|---|
| `invoke-static-checks.ts:28` (module header bullet) | `checkInvokePathAtLoad`, the shared containment check | wrong |
| `invoke-static-checks.ts:225` (in `walkExpr`, `par for` arm) | "the `invoke(...)` surface's INV-5 path-escape" | wrong |
| `invoke-static-checks.ts:613` (`checkInvokeStaticResolution` doc) | "INV-5 path-escape … via the shared realpath + discovery-root containment check" | wrong |
| `invoke-static-checks.ts:683` (the `invoke(...)` loop) | "a resolved callee outside every active discovery root un-registers the parent" | wrong |
| `production-composition.ts:494` (in `runComposePass`) | the `activeRoots` union "threaded into the invoke containment check" | wrong |
| `production-composition.ts:627` (in `runComposePass`) | "the runtime open-time containment re-check" | wrong |
| `production-composition.ts:737` (in `runComposePass`) | "INV-3 / INV-4 / INV-5: run the invoke static checks" | wrong (INV-5 element) |
| `production-theta-producer.ts:468` (`ProductionProducerInput` fields) | the `realpath` seam + active-root union "used by the runtime open-time containment re-check" | wrong |
| `production-theta-producer.ts:3182` (in `#driveCallee`) | "re-run the realpath + discovery-root containment check" | wrong |
| `production-theta-producer.ts:3320` (`#recheckCalleeContainment` doc) | "INV-5 runtime re-check: resolve the callee path …" | wrong |
| `production-theta-producer.ts:2146` (`#spawnSubagentFnSession` doc) | a `subagent fn` body crossing the subagent boundary in-process | correct |

Three of the ten repair themselves in part: `production-composition.ts:627`,
`production-theta-producer.ts:468` and `:3182` name "INV-1 seam" inside the
parenthesis their `INV-5` heads, so the citation carries both the wrong id and
the right pin. `:3320` and the four `invoke-static-checks.ts` sites name no
INV-1 at all. None of the ten is arguable on its subject: every one describes
`realpath` normalisation, an active-root comparison, or the diagnostic that
comparison raises, and INV-5's text is confined to the `theta_result` envelope.

**Root cause: the labels are ordinals of a private numbering that collides with
the spec's anchor set.** The same files number the invoke static checks
`INV-1`/`INV-2` (extension / path separator, `invoke-static-checks.ts:646` and
`theta-document.ts:4204`), `INV-3` (arity), `INV-4` (cycle), `INV-5`
(path escape), `INV-6` (typed return, `production-theta-producer.ts:3065` and
five more), `INV-8` (dynamic path). Only five INV anchors exist, and their
subjects are the symlink seam, the named-argument seam, the per-call-timeout
seam, the invocation depth bound, and envelope propagation — so the private
scheme agrees with the spec on none of those ordinals. The corpus already
records the collision at its far end: bug 0004's §Provenance
(`0004-…:185`) writes "(§Typed return — tagged INV-6 in implementation comments;
the spec's own anchors stop at INV-5)". For ids 6 and 8 the mismatch is visible
on sight, because nothing resolves. For id 5 it is invisible, because something
resolves — to the wrong rule.

**Nothing in the tree scores it.** The live closing gate assembles no
`srcSources` (`live-corpus.js:144–156`), the one `src/`-reading arm resolves
`// allow-broad-catch:` tokens (`index.js:670`), and the lint checks a cited
token's presence rather than its resolution
(`eslint-plugin-theta-local/index.js:32–36`). A comment's REQ-ID is unverified
by construction.

**The 0110 fix's effect on the drift, precisely.** It added eight comments
naming the rule INV-1, all in `production-composition.ts`, each marked "bug
0110" (`:699`, `:1390`, `:1432`, `:1443`, `:1479`, `:1672`, `:1695`, `:1949`).
Its single hunk in `invoke-static-checks.ts` rewrote the body of the doc-comment
bullet at `:613` — replacing the assertion that the `tools:` surface has no
containment check anywhere — and kept the bullet's `INV-5` label. So the count of
mislabelled comments is what it was, one mislabelled comment now carries newer
text, and the correct label is now present in the same file eight times over.

Two corrections to the parent's own record of this finding. 0110 §Non-goals
(`:674–683`) and residual 4 (`:1294–1301`) name two files;
`src/extension/production-composition.ts` carries three of the ten labels and is
named in neither. And the bullet's `production-theta-producer.ts:3116` citation
is stale: `#driveCallee`'s containment comment is `:3182` at HEAD, `#driveCallee`
itself `:3172`, shifted by that fix's own insertions.

### Finding 2 — the row

`docs/plan_topics/coverage-matrix.md:92` is `| INV-1 | `V15a` |`. Three facts
about it, each verifiable in the file:

- **The obligation it maps has two load-time sites.** `invocation.md:16`: "The
  load-time check (parent theta registration / `tools:` `.theta` entry
  registration) and the invocation-time re-check … MUST apply the identical
  `realpath`-then-discovery-root-containment semantics".
- **The leaf it names witnesses the shared function, not the two surfaces.**
  `tests/invocation-core.test.ts:53–175` drives `checkInvokePathContainment`,
  `checkInvokePathAtLoad` and `recheckInvokePathAtRuntime` against a
  `FakeFileSystem` in eight cells. The file contains no `tools:` entry. Before 0.66.0 that was the
  whole of the pin's evidence, and the `tools:` site had no implementation to
  witness.
- **The witness that now covers the second site is unreferenced.**
  `tests/tools-entry-containment.test.ts` (37 cells, green) cites the bug, the
  two spec pages and the registry row, and no leaf, token or REQ-ID. Nothing
  links the row to it in either direction.

`theta/load/invoke-path-escape` appears nowhere in the matrix, and that is
consistent rather than a second gap: the *Code-keyed obligation areas* table
covers obligations carrying no numbered REQ-ID (`:116`), and `cka-14` says so
explicitly by enumerating "the six un-anchored `invoke` parse/load diagnostic
codes" and excluding this one. The code is anchored — by INV-1 — which is why
the numbered row at `:92` is where its closure is recorded and where the gap is.

**Root cause: the matrix is an obligation→leaf map with no back-pressure from
new witnesses.** Nothing fails when a fix adds green evidence for a mapped
obligation without touching the row: the live gate's seven arms
(`live-corpus.js:51–59`) reconcile REQ-IDs against rows and rows against citing
tests, and no arm walks from a test file to the row it belongs to. A witness that
cites nothing is therefore invisible to the gate in both directions.

**The class is wider than this row, and bounded here on purpose.** Of the five
`tools:`-surface witnesses, two cite a leaf or token
(`production-tools-load-resolution.test.ts`: `cka-11`, `cka-14`, `V15f`;
`invocation-core.test.ts`: `V15a`, `V15e`, `cka-44`) and three cite none
(`tools-entry-closed-grammar.test.ts`,
`tools-entry-closed-grammar-lockstep.test.ts`,
`tools-derived-name-shape.test.ts`; `theta-callable-call-arity.test.ts` cites
`INV-3` and no leaf). The matrix also names only five bug fixes as closers
(`:87–91`, all of which coined a new PIC id), so a fix that discharges an
already-mapped obligation has never been recorded in it. This report asks for the
one row 0110's residual names and leaves the pattern (§Non-goals).

## Why it matters

- **A wrong REQ-ID sends the next reader to the wrong normative text.** Ten
  comments annotate a `realpath` + active-root check with an id whose spec text
  is about the `theta_result` envelope. The reader who follows it reads a
  contract about `Ok`/`Err` arms and child exits, and finds nothing about paths;
  the reader who follows it into the plan reaches RFC 0006 instead of `V15a`
  (`coverage-matrix.md:95` against `:92`).
- **The wrongness is unverifiable by the suite.** No gate reads a `src/**`
  comment's REQ-ID (`live-corpus.js:144–156`, `index.js:670`,
  `eslint-plugin-theta-local/index.js:32–36`), so the labels survive every
  release and every rewrite of the file they sit in. Two rewrites already
  happened around them: bugs 0071 and 0072 grew `invoke-static-checks.ts`, and
  0110 rewrote the body under one of the labels.
- **One file now labels one rule two ways.**
  `src/extension/production-composition.ts` carries eight `INV-1` comments and
  three `INV-5` comments for the same containment check. A reader cannot tell
  from the file which id is the citation and which is the residue.
- **A witness absent from the matrix is not traceable to the obligation it
  discharges.** The matrix exists so that "its green tests are the closure
  evidence" for each mapped obligation (`:3`). For INV-1's `tools:`-entry site
  the green tests are in a file the matrix does not name, so the row understates
  its own closure and a future reviewer re-deriving coverage from the matrix
  finds the second site unwitnessed. That reading is what 0110's report itself
  recorded before the fix: "There is no coverage row naming the `tools:`
  surface's load-time containment separately."
- **The record that is wrong is the one used to decide whether work is owed.**
  Both records are consulted when someone asks what governs a check or what
  closes an obligation — a comment during a change to the containment path, the
  matrix at the release gate. Neither is consulted by a test, which is why both
  drifted and why correcting them is the whole of the work.

## Non-goals

- **The non-containment `INV-<n>` labels in the same files.**
  `invoke-static-checks.ts:646` uses `INV-1` / `INV-2` for the extension and
  path-separator rules and `INV-8` for the dynamic-path rule;
  `theta-document.ts:4204–4207` does the same at parse time;
  `production-theta-producer.ts:3065`, `:3247`, `:3267`, `:3290`, `:3303`,
  `:3350` use `INV-6` for `invoke<Schema>` return validation; the compound
  comment at `production-composition.ts:737` also carries `INV-3` (arity) and
  `INV-4` (cycle). None matches invocation.md's ids either. They are excluded
  because the containment labels have a stated right answer in the corpus
  (§Resolution plus INV-1, `invocation.md:12`, `:14`, `:16`) while these do not:
  arity, cycle and the six invoke parse/load codes are recorded as un-anchored
  GOV-22 residue (`coverage-matrix.md:138`, `cka-14` → `V15f`), and INV-6 / INV-8
  name nothing at all (`rg -o 'INV-[6-9]' docs/` returns only bug 0004's
  narration). Correcting those means choosing a citation form for an un-anchored
  obligation, which is a different edit and a different adjudication. Unfiled.
  §Fix step 1 covers the one collision this creates —
  `invoke-static-checks.ts:646` — because that sentence would otherwise leave
  `INV-1` on two subjects in one file.
- **The other uncited witnesses.** Three `tools:`-surface witnesses cite no leaf
  or token and a fourth cites only `INV-3` (§Actual behaviour). Adding those
  citations edits existing test files, which the 0110 fix's orchestrator
  explicitly reverted as unapproved (0110 §Fix (0.66.0) *Review rounds*), and the
  matrix's own convention obliges an inline citation only for a *facet* of a
  multi-leaf row (`:9`). Unfiled.
- **Adding a citation to `tests/tools-entry-containment.test.ts`.** Step 2's row
  form needs none (§Fix), and the file is a test this report does not own.
- **Whether `theta/load/invoke-path-escape` should be enumerated in the
  code-keyed table.** It is anchored by INV-1, and `cka-14` scopes itself to the
  six un-anchored codes (`:138`), so its absence there is correct. This report
  does not reopen the GOV-22 anchoring of the invoke diagnostics.
- **`docs/plan_topics/conventions.md`'s dangling references.** The matrix cites
  "`conventions.md` *REQ-ID discipline*" at `:3`, `:9`, `:116` and `:121`; that
  file is a retired stub whose body is pruned and which states so in its first
  line. Separate defect, unfiled, and named here only so a reader following
  those links is not surprised.
- **The containment implementation.** 0110's fix is the subject this report
  measures, not a thing it revisits. No executable line changes here.
- **`docs/bugs/README.md`.** Updated centrally, not here.

## Fix

Two edits, one commit, no executable line touched. No `theta/*` code, registry
row, REQ-ID or plan leaf is added, removed or renamed, so DIAG-2
(`diagnostic-shape.md:72`) needs no registry edit and GOV-15's three observables
(`source-language-stability.md:5`) are untouched.

**Step 1 — relabel the ten containment comments `INV-1`.** In
`src/extension/invoke-static-checks.ts` (the module-header bullet at `:28`, the
`par for` arm in `walkExpr` at `:225`, `checkInvokeStaticResolution`'s
doc-comment bullet at `:613`, the `invoke(...)` loop's call-site comment at
`:683`), `src/extension/production-composition.ts` (`:494`, `:627`, and the
`INV-5` element of the compound label at `:737`, all in `runComposePass`) and
`src/extension/production-theta-producer.ts` (`ProductionProducerInput`'s
`fileSystem` / `activeRoots` doc at `:468`, `#driveCallee` at `:3182`,
`#recheckCalleeContainment`'s doc at `:3320`), write the citation the rule
carries: `INV-1 (invocation.md §Resolution)`. Where the existing text already
names the seam — `production-composition.ts:627`,
`production-theta-producer.ts:468` and `:3182` read "INV-5 (invocation.md
§Resolution, INV-1 seam)" or "INV-5 (invocation.md INV-1 seam)" — the correction
leaves one citation rather than two: `INV-1 (invocation.md §Resolution)`. Match
the form the 0110 fix's eight comments in `production-composition.ts` already use
(`:699`, `:1695`), and match `src/runtime/invocation.ts`, which labels the same
functions INV-1 at their definitions. Leave
`production-theta-producer.ts:2146` alone: its `INV-5` is correct.

Two constraints:

- **Retire the `INV-1` at `invoke-static-checks.ts:646`.** That sentence uses
  `INV-1` / `INV-2` for the extension and path-separator rules. After step 1 the
  file would use `INV-1` for two subjects, so the sentence loses its ids and
  names the rules by their spec sections instead — extension matching and the
  forward-slash rule are `lexical.md` §"Extension matching" / §"Path literals"
  via `invocation.md:10`, and the dynamic-path rejection is `invocation.md:10`'s
  string-literal requirement. Same treatment if the compound at
  `production-composition.ts:737` is rewritten: its `INV-3` / `INV-4` elements
  are out of scope (§Non-goals), so keep them byte-exact and change only the
  `INV-5` token.
- **Comment lines only.** No executable line, no reflow of surrounding code, no
  change to any string a test asserts on (`rg -l 'INV-5' tests/` returns six
  files: `tests/e2e-s5-invoke-untyped-style.test.ts`, which uses a different,
  explicitly namespaced `REQ-INV-<n>` scheme, and five subagent-envelope test
  files. None reads these comments).

**Step 2 — name the `tools:`-entry closer on the INV-1 row.** Annotate
`docs/plan_topics/coverage-matrix.md:92` so the row records both of the pin's
load-time closers: keep `` `V15a` `` as the row's only backtick-delimited token
and append an unbackticked closer naming bug 0110's `tools:`-entry site, in the
form the five `PIC-65` … `PIC-69` rows already use for a bug-fix closer
(`:87–91`), e.g.

```
| INV-1 | `V15a`, bug 0110 fix (tools: .theta-entry load-time containment site — tests/tools-entry-containment.test.ts) |
```

Three constraints, each derived from the matrix's own conventions and from the
gate that reads them:

- **Exactly one backtick-delimited leaf token in the cell.**
  `deriveFacetPartition` (`tools/closing-gate/index.js:391–404`) counts
  backticked `[A-Z]+[0-9]*[a-z]?` spans, and the per-facet arm skips a row with
  fewer than two (`:842`). A second backticked leaf would make the row
  multi-leaf and oblige a facet-naming citing test per facet
  (`coverage-matrix.md:9`), which the new witness does not carry — that arm is
  live-gated (`per-facet-citing-test-missing` ∈ `CANARY_GAP_KINDS`,
  `live-corpus.js:51–59`), so it would red
  `tests/live-corpus-release-gate.test.ts`. The annotation prose therefore
  carries no backticks, which is also what `:7` requires.
- **The row stays in the *Numbered REQ-IDs* table.** The code-keyed table is
  scoped to obligations with no numbered REQ-ID (`:116`); this obligation is
  INV-1. No new `cka-<n>` token is minted, so the append-only *Token* rule
  (`:121`) is not engaged and `cka-64` (`:188`) stays the highest.
  `cka-13` (`:137`) is left as it is: it already lists four leaves, and a fifth
  would demand a fifth facet-naming citing test.
- **`docs/bugs/README.md` and every other doc are untouched by this step.**

**No test is owed, and the suite does gate the matrix.** Two tests read the real
`docs/plan_topics/coverage-matrix.md`:
`tests/live-corpus-release-gate.test.ts:134–156`, which asserts the live gate
returns zero findings, and `tests/warn-only-canary.test.ts:118`, `:136`, which
runs the same machinery warn-only. Under the row form above neither needs an
edit: the arms they project are the seven `CANARY_GAP_KINDS`, the row's REQ-ID
column is unchanged so arms 1 and 2 see the same mapping and the same citing test
(`tests/invocation-core.test.ts` cites `INV-1` and `V15a` inline), the per-facet
arm skips the single-leaf row, the un-anchored-MUST arms are page-driven and no
page's row set changes, and the H5d closing-leaf-token arm is dormant on the live
corpus (`index.js:753`; `live-corpus.js:144–156` supplies no `h5bDepsText`).
Finding 1 is owed no witness for the same reason it drifted: nothing in the tree
reads a `src/**` comment's REQ-ID, and adding a gate for that is a corpus-tooling
obligation this report does not open.

**Gates to run.** `npm test` (both matrix readers included),
`npm run typecheck`, `npm run lint`, plus
`npx vitest run tests/tools-entry-containment.test.ts tests/invocation-core.test.ts`
→ 37 + 10 cells green, unchanged. Comment-only edits cannot move a runtime
observable; the point of the run is to prove the matrix edit is inert to the two
live-gated readers.

## Provenance

- Filing origin: [0110](./0110-theta-callable-tools-entry-no-load-time-containment.md)
  §Fix (0.66.0) *Residuals* item 4 (`:1294–1301`) and item 6 (`:1308–1312`),
  plus its §Non-goals bullet (`:674–683`). What this report adds beyond the
  residuals: the label inventory by subject (ten wrong, one right in the three
  files, seven right in `src/runtime/`), the third file the residual does not
  name, the corrected `#driveCallee` citation, the private-numbering root cause
  with bug 0004's record of it, the `INV-1`-collision constraint at
  `invoke-static-checks.ts:646`, the matrix's own row conventions and the
  `bug NNNN fix` precedent, the witness-citation census across the five
  `tools:`-surface witnesses, and the measured answer to whether the matrix is
  test-gated.
- Spec measured against: `docs/spec_topics/invocation.md:12` (§Resolution — the
  containment rule, the mandatory `realpath` step, the `tools:`-entry clause,
  the code), `:14`, `:16` (INV-1 — the symlink-resolution-hardening seam and its
  two named load-time sites), `:36` (INV-5 — subagent return-value propagation
  over the envelope), `:40`, `:44`, `:85` (INV-2, INV-3, INV-4 — the rest of the
  live INV set); `docs/spec_topics/tool-calls.md:14` (§"Argument shape" — the
  obligation the new witness discharges);
  `docs/spec_topics/diagnostics/code-registry-load.md:33` (the
  `theta/load/invoke-path-escape` row — *Trigger* naming both surfaces, *Phase*
  `load, runtime`); `docs/spec_topics/diagnostics/diagnostic-shape.md:72`
  (DIAG-2); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15's three observables);
  `docs/spec_topics/governance/req-id-prefix-table-active-a.md:63` (the
  `invocation.md` → `INV` binding) and
  `docs/spec_topics/governance/req-id-prefix-table-retired.md` (no `INV-` row).
- Plan measured against: `docs/plan_topics/coverage-matrix.md:3` (stated
  purpose), `:7` (*Closing-leaf column authoring*), `:9` (*Multi-leaf-row
  per-facet citing tests*), `:15`, `:92`, `:95` (the numbered table header and
  the INV-1 / INV-5 rows), `:87–91` (the five `bug NNNN fix` closer cells),
  `:114`, `:116`, `:121`, `:123`, `:137`, `:138`, `:188` (the code-keyed table's
  heading, scope, *Token* rule, header, `cka-13`, `cka-14` and `cka-64`);
  `docs/plan_topics/conventions.md` (a retired stub — the target of the matrix's
  *REQ-ID discipline* links).
- Implementation: `src/extension/invoke-static-checks.ts` (`:28`, `:225`,
  `:613`, `:646`, `:683`; `walkExpr:170`, `checkInvokeStaticResolution`),
  `src/extension/production-composition.ts` (`:494`, `:627`, `:737` in
  `runComposePass:397`; the eight bug-0110 `INV-1` comments at `:699`, `:1390`,
  `:1432`, `:1443`, `:1479`, `:1672`, `:1695`, `:1949`),
  `src/extension/production-theta-producer.ts` (`:468` on
  `ProductionProducerInput:350`; `:2146` in `#spawnSubagentFnSession`'s doc
  `:2135–2152`; `:3182` in `#driveCallee:3172`; `:3320` on
  `#recheckCalleeContainment:3326`; the six `INV-6` sites at `:3065`, `:3247`,
  `:3267`, `:3290`, `:3303`, `:3350`), `src/runtime/invocation.ts:1`, `:6–12`,
  `:42`, `:72`, `:92` (the INV-1 precedent), `src/runtime/subagent-envelope.ts`
  and `src/runtime/subagent-json-driver.ts` (the seven correct `INV-5` uses),
  `src/parser/theta-document.ts:4204–4207`.
- Tests and tooling: `tests/tools-entry-containment.test.ts` (910 lines, 10
  `describe` groups, 30 `it(` literals, 37 cells, no leaf/token/REQ-ID
  citation), `tests/invocation-core.test.ts:1`, `:15`, `:53–175`,
  `tests/production-tools-load-resolution.test.ts`,
  `tests/theta-callable-call-arity.test.ts`,
  `tests/tools-entry-closed-grammar.test.ts`,
  `tests/tools-entry-closed-grammar-lockstep.test.ts`,
  `tests/tools-derived-name-shape.test.ts` (the citation census),
  `tests/live-corpus-release-gate.test.ts:134–156`,
  `tests/warn-only-canary.test.ts:118`, `:136`,
  `tools/closing-gate/live-corpus.js:51–59`, `:144–156`, `:183–185`,
  `tools/closing-gate/index.js:391–404`, `:502–523`, `:670`, `:753`, `:774`,
  `:839–842`, `tools/eslint-plugin-theta-local/index.js:32–36`.
- Evidence: source and doc inspection at HEAD `6093597c` (0.66.0), plus
  `npx vitest run tests/tools-entry-containment.test.ts` → 1 file / 37 tests
  green, and the greps quoted in §Reproduction. No scratch file was written and
  no file outside this report was modified.
- Concurrency at filing: another agent is editing
  `src/discovery/discovery-walk.ts` and `src/discovery/package-discovery.ts` for
  [0076](./0076-existing-root-enumeration-failure-silent.md) and may add a
  coverage row of its own. `docs/plan_topics/coverage-matrix.md` was 192 lines
  with `cka-64` the highest token and `| INV-1 | `V15a` |` at `:92` at the moment
  this report was written; the matrix may have gained unrelated rows since, so
  step 2 re-derives `:92` before editing and treats the highest `cka-<n>` as
  read, not as quoted here.

## Fix (0.237.0)

- **What shipped**
  - `src/extension/invoke-static-checks.ts` — the four containment comments
    (module-header bullet, the `par for` arm in `walkExpr`,
    `checkInvokeStaticResolution`'s first doc-comment bullet, the `invoke(...)`
    loop's call site) now cite `INV-1 (invocation.md §Resolution)`; the private
    `INV-1` / `INV-2` / `INV-8` sentence in that same doc comment lost its
    ordinals and names the rules by spec section instead (`lexical.md`
    §"Extension matching" / §"Path literals", reached via `invocation.md`
    §Resolution; the dynamic-path rejection as §Resolution's string-literal
    requirement), so the file carries `INV-1` on one subject only.
  - `src/extension/production-composition.ts` — the `activeRoots` derivation,
    the producer wiring and the `INV-5` element of the compound static-check
    label inside `runComposePass` cite `INV-1 (invocation.md §Resolution)`; the
    compound's `INV-3` / `INV-4` elements are byte-exact, so the label reads
    `INV-3 / INV-4 / INV-1` in non-ascending order by §Fix's own constraint.
  - `src/extension/production-theta-producer.ts` — `ProductionProducerInput`'s
    `fileSystem` / `activeRoots` doc, `#driveCallee`'s re-check comment and
    `#recheckCalleeContainment`'s doc comment cite `INV-1 (invocation.md
    §Resolution)`; where the text previously carried both the wrong id and the
    right seam, one citation now stands rather than two.
    `#spawnSubagentFnSession`'s `INV-5` is untouched — it is correct.
  - `docs/plan_topics/coverage-matrix.md` — the INV-1 row records both of the
    pin's load-time closers: `` `V15a` `` stays the cell's only
    backtick-delimited span and an unbackticked closer in the `PIC-65` … `PIC-69`
    form names bug 0110's `tools:`-entry site and its witness
    (`tests/tools-entry-containment.test.ts`).
  - No executable line, no assertion, no test file, no other doc. All four files
    keep their HEAD line counts exactly (1200 / 2897 / 6760 / 192), so no
    `path:line` citation into them shifted.
- **Gates** (re-run independently by the orchestrator, not taken on report)
  - Witness: none owed, and the determination was re-derived rather than
    assumed — no gate, lint or test resolves a `src/**` comment's REQ-ID
    (`assembleLiveCorpus` supplies no `srcSources` and no `h5bDepsText`; the one
    `src`-reading arm matches `allow-broad-catch:` tokens; the lint checks token
    presence, not resolution; `grep -rn 'INV-' tools/` is empty), and the matrix
    gap is invisible to all seven `CANARY_GAP_KINDS` arms in both directions
    (the per-facet arm's single-leaf skip). Inertness of the matrix edit was
    *proved*: the row was neutralised in place to its HEAD text, the two
    live-gated readers ran green, the edit was restored, and the restoration was
    hash-verified byte-exact (`c4bbdcb1…` before neutralisation, `64602d2d…` =
    HEAD's blob while neutralised, `c4bbdcb1…` after restoration). No `git
    stash`, no `git checkout`/`restore`.
  - Full suite: `npm test` → 417 files / 8728 tests passed.
  - Targeted: `npx vitest run tests/live-corpus-release-gate.test.ts
    tests/warn-only-canary.test.ts tests/tools-entry-containment.test.ts
    tests/invocation-core.test.ts` → 4 files / 57 tests passed (37 + 10 cells
    unchanged from HEAD).
  - `npm run typecheck` clean; `npm run lint` clean;
    `grep -rn "X\.Y\.Z" tests/ src/ --include=*.ts` empty.
  - No live run owed: zero executable lines in the diff (verified by the
    orchestrator's own filter over `git diff -U0`), so no runtime observable can
    move.
- **Review**: 2 rounds plus one polish round.
  - Round 1 (deep) — 3 findings: one *fidelity* (an eleventh containment label,
    the collapsed shorthand `INV-3/-4/-5` in `walkExpr`'s `block` arm, which the
    report's `rg -n 'INV-5'` census could not match), two *prose* (the
    retirement sentence garbled by a triple "and" and a dangling "checks"; four
    comment paragraphs left ragged by the relabel). It refuted the suggestion
    that the compound label be reordered to ascending ids: §Fix requires the
    `INV-3` / `INV-4` tokens byte-exact, so the non-ascending order is mandated.
  - Round 2 (fast) — CLEAN; confirmed the tightened `checkInvokeStaticResolution`
    bullet loses no load-bearing claim, and raised one non-blocking *prose*
    residual (two paragraphs still over the prevailing wrap width).
  - Polish round (light) — moved one line break so the `` `par for` `` backtick
    span is not split; established by exhaustive search that the module-header
    bullet's three-line budget cannot go below ~90 columns without deleting
    content. Comment-only; polish verified by gate-diff, so the confirmation
    review round was skipped.
- **Verification**: PASS, no findings. Witness determination re-derived from the
  gate sources; default suite 417/8728 green; live run judged not owed on the
  zero-executable-line evidence (no lock taken, none needed); lint and typecheck
  clean; line counts and the `INV-5` residual census re-checked.
- **Residuals**
  1. *Wrap width in one doc comment.* `checkInvokeStaticResolution`'s first
     bullet averages ~90 columns against the file's prevailing ~80, because its
     payload cannot fit the fixed line budget the citation-stability constraint
     imposes. No lint rule engages it. Relaxing it means letting the file grow,
     which would stale the `path:line` citations into it from
     `tests/modulo-zero-result-type-number.test.ts` and
     `tests/wire-translation-inbound-retag.test.ts`.
  2. *The eleventh site was outside §Fix's enumeration.* The orchestrator
     self-authorized the one-line, one-token relabel of the collapsed shorthand
     on the record: §Fix step 1's object is the containment citation and §Summary's
     defect is one file labelling one rule two ways; `invocation.md`'s INV-5 is
     envelope propagation, which call-site collection does not feed; and
     §Non-goals excludes only *non-containment* `INV-<n>` labels, so the omission
     was a census-method gap (`rg -n 'INV-5'` cannot match `INV-3/-4/-5`), not a
     decision. Bound: one line, ordinal tokens only, file line count unchanged.
  3. *Report facts stale at HEAD* (recorded, not acted on): every `src/**` line
     number in §Affected is from 0.66.0 and has shifted (the ten sites are at
     `invoke-static-checks.ts:35`, `:238`, `:803`, `:881`;
     `production-composition.ts:591`, `:739`, `:849`;
     `production-theta-producer.ts:493`, `:3635`, `:3780`, with the correct
     `INV-5` at `:2554`); `production-composition.ts` now carries twelve `INV-1`
     tokens rather than eight, bug 0111 having widened the correct-label side
     after filing; and `rg -l 'INV-5' tests/` returns fourteen files, not six —
     none of which reads these comments (verified by a negative grep on the
     comment strings).
  4. *The class this report bounds is untouched*, as §Non-goals directs: the
     non-containment private ordinals (`INV-6`, `INV-8`, the arity / cycle ids),
     the other uncited `tools:`-surface witnesses, and the `cka-13` row.
- **Discharge notes appended**: none.
- **Pinned dispositions / non-goals**: no `theta/*` code, registry row, REQ-ID or
  plan leaf added, removed or renamed — DIAG-2's closed registry is not engaged
  and GOV-15's three observables are untouched. No new `cka-<n>` token; `cka-64`
  remains the highest. `docs/bugs/README.md`, `package.json` and `CHANGELOG.md`
  are updated centrally, not here.
