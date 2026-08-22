# Bug 0230 — `tests/code-registry.test.ts` drives `reconcileClosedSet` with a hand-written two-row registry (`:87–:112`), so DIAG-2's closed set is gated NOWHERE corpus-wide: the live-corpus canary computes both closed-set kinds (4 `registry-code-no-asserting-test` + 112 `asserted-code-not-in-registry` at HEAD) and filters both out before the only assertion (`live-corpus.js:184`, `live-corpus-release-gate.test.ts:143–145`), no tool compares the registry against its `docs/reference/diagnostics.md` mirror (`parseRegistry` yields 0 rows over the 4-column mirror), and a ghost row added to `code-registry-parse.md` with no mirror row and no asserting test leaves the whole default suite green (375 files / 7698 tests)

- **Status:** fixed (0.184.0). §Fix was constraint-pinned, not settled: the
  candidate gate shapes were enumerated with their measured costs and the choice
  was left to the run. The run selected shape 2 in its no-second-copy reading
  and records why in `## Fix (0.184.0)`.
- **Sev/Diff estimate:** S3/D3 — S3 because the subject is a verification gap,
  not an author-visible behaviour: no diagnostic changes, and the gate that
  DIAG-2's same-commit discipline is repeatedly credited to
  (`tests/code-registry.test.ts`, cited as "the closed-set gate" by
  `docs/bugs/0155-ternary-common-type-unenforced-trigger-conflict.md:622`,
  `docs/bugs/0102-params-default-string-literal-raw-newline-admitted.md:712`,
  `docs/bugs/0031-ctor-field-value-typing-unchecked.md:660`) cannot red on any
  corpus-level drift. Three live instances exist at HEAD, unreported by any
  test: `theta/runtime/non-object-receiver` has a registry row and no mirror row
  (218 registry codes, 217 mirror codes), and four registry codes have no
  asserting test anywhere under `tests/` (§Reproduction (d)). D3 because §Fix
  needs in-run adjudication and the enabling change is not local: the
  `asserted-code-not-in-registry` arm yields 112 subjects at HEAD, most of them
  extractor artefacts (`theta/parse/`, `theta/demo`, `theta/bug0179`), so
  turning either kind into a gate requires deciding what `extractAssertedCodes`
  means over the live test corpus, and the mirror direction has no computing
  code at all.
- **Kind:** defect — verification gap, three elements.
  1. *The DIAG-2 unit test asserts the reconciler, not the corpus.*
     `tests/code-registry.test.ts:86` is the closed-set test; its registry input
     is a two-element literal array (`:87–:105`) and its asserted-code input is
     a two-element literal list (`:111`), so `reconcileClosedSet`
     (`tools/code-registry/index.js:99`) is exercised as a pure function. The
     only test in the file that reads the live registry pages (`:39–:56`) is the
     `parseRegistry` shape test (`:62`), which checks one row
     (`theta/parse/unterminated-string`) and the presence of the four
     namespaces.
  2. *The corpus-level reconciliation is computed and then discarded.*
     `tools/closing-gate/live-corpus.js` assembles the live corpus (`:122`) and
     `warnOnlyFindings` runs the full gate over it, keeping only
     `CANARY_GAP_KINDS` (`:184`, set at `:51–:59`). Neither closed-set kind is
     in that set — the module's own header states the exclusion (`:21–:24`) —
     and the release gate's reddening assertion consumes exactly that filtered
     projection (`tests/live-corpus-release-gate.test.ts:39–41`, `:140–:145`).
     Both arms fire over the live corpus (§Reproduction (d)) and neither reaches
     an `expect`.
  3. *Registry↔mirror parity is computed nowhere.* `docs/reference/diagnostics.md`
     transcribes four columns (`:3–:9`), and `parseRegistry` skips any table row
     with fewer than five cells (`tools/code-registry/index.js:36`), so
     `parseRegistry` over the mirror returns 0 rows. No test, tool or gate reads
     both artifacts.
- **Related:**
  - [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) —
    **fixed (0.179.0)**, the origin. Its `## Fix (0.179.0)` landed a new row
    (`theta/parse/inline-field-name-not-identifier`) plus its
    `docs/reference/diagnostics.md` mirror row plus a witness "in the same
    commit" under DIAG-2, and recorded no gate observing any of the three. This
    report measures what would have happened had any of the three been omitted:
    nothing.
  - [0200](./0200-par-codes-missing-from-sharded-registry.md) — **fixed
    (0.173.0)**, which measured one half of this subject first. Its R8
    (`:393–:411`), its root-cause item 4 (`:485–:492`) and its *Residuals*
    item 3 (`:907–:914`) record
    `asserted-code-not-in-registry` as computed over the live corpus and dropped
    for being outside `CANARY_GAP_KINDS`, and its Constraint 7 (`:612–:620`)
    declines to enable it because the kind yields 96 subjects including regex
    artefacts. The count is 112 at HEAD. That report's subject was three missing
    rows; the gap is claimed here, in both directions and including the mirror.
    Its *Residuals* item 4 (`:915–:918`) is the
    `theta/runtime/non-object-receiver` mirror absence this report re-measures.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed (0.45.0)**,
    whose §Affected (`:86–:92`) states the other half: the
    `registry-code-no-asserting-test` arm "is excluded from the live-corpus
    canary" and `tests/code-registry.test.ts:109–111` "drives the reconciler
    with synthetic inputs". Verified true at HEAD. That statement sits in a
    report about `SchemaShape` codes and carries no fix obligation.
  - [0189](./0189-registry-placeholders-outside-closed-categories.md) — **fixed
    (0.129.0)**, the precedent for a registry-wide gate landed as its own
    subject: it closed a *Message*-column vocabulary against
    `placeholder-rendering-a.md` §Closure. Any gate minted here sits beside
    that one and must not duplicate its scan.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for the `code-registry-*.md:NN` and
    `tools/closing-gate/index.js:NN` citation drift any fix here induces. 0200's
    *Residuals* item 2 measured that population: 1,128 `code-registry-parse.md:NN`
    citations across 187 files.
- **Affected** (every citation verified at HEAD `4c157bcc`, 0.183.0):
  - **The unit test that stands in for the gate.**
    `tests/code-registry.test.ts:39–:56` — the live four-page read;
    `:58` — the DIAG-2 describe; `:62` — the `parseRegistry` shape test, the
    only live-corpus assertion in the file; `:86` — the closed-set test;
    `:87–:105` — the two-row literal registry; `:109–:112` — the
    `reconcileClosedSet` call and its two-element `assertedCodes`;
    `:120–:124` — the `registry-code-no-asserting-test` assertion, over that
    literal; `:128`, `:165` — the DIAG-3 and DIAG-4 describes, whose inputs are
    literal (`:133–:141`, `:158–:161`) except the DIAG-4 message lookup.
  - **The reconciler.** `tools/code-registry/index.js:31` — `parseRegistry`;
    `:36` — the five-cell floor that makes the four-column mirror invisible;
    `:99` — `reconcileClosedSet`; `:106` — `asserted-code-not-in-registry`;
    `:115` — `registry-code-no-asserting-test`; `:132` —
    `reconcileStableIds`.
  - **The gate that owns the same two arms over a corpus.**
    `tools/closing-gate/index.js:701–:711` — arm (3),
    `registry-code-no-asserting-test`; `:713–:722` — arm (4),
    `asserted-code-not-in-registry`; `:911` — `loadCorpus`, whose shape
    (`governance.md`, `spec/`, `registry/`, `tests/` under one directory) is the
    seeded-fixture layout, not the repository's.
  - **The filter.** `tools/closing-gate/live-corpus.js:21–:24` — the header
    clause excluding "diagnostic-code parity" from the canary's surfaces;
    `:51–:59` — `CANARY_GAP_KINDS`, seven kinds, neither closed-set kind among
    them; `:122` — `assembleLiveCorpus`, which does read the live
    `docs/spec_topics/diagnostics/**` registry (`:148–:150`) and the live
    `tests/**` corpus (`:151–:153`); `:184` — the filter.
  - **The only assertion.** `tests/live-corpus-release-gate.test.ts:39–:41` —
    `liveCorpusFindings`, which delegates to `warnOnlyFindings`;
    `:140–:145` — the reddening assertion (`expect(findings).toEqual([])`) over
    that projection.
  - **The fixture-scoped closed-set coverage.**
    `tests/closing-gate.test.ts:15–:17` — `FIXTURES`, the
    `test-fixtures/closing-gate` root; `:34` — the no-violation scenario;
    `:68` — `registry-code-no-asserting-test` against the
    `registry-code-no-test` fixture; `:74` — `asserted-code-not-in-registry`
    against the `asserted-code-not-in-registry` fixture. Both arms are gated
    against seeded fixtures and against no live artifact.
  - **The spec sentences.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2, "the
    registry is closed", "New diagnostic sites added by future spec work MUST
    land their codes in this table at the same time"; `:71` — DIAG-1;
    `:74` — DIAG-4; `docs/spec_topics/diagnostics/code-registry-parse.md:5` —
    the four tables "together enumerate every diagnostic the V1 spec defines".
  - **The mirror.** `docs/reference/diagnostics.md:3–:9` — the header's
    verbatim-transcription claim and its four-column scope. 217 code rows
    against the registry's 218.
- **Observed at:** `0.183.0` (HEAD `4c157bcc`). Offline, deterministic; no live
  model, no provider. Census figures are produced by the shipped functions —
  `assembleLiveCorpus` + `runClosingGate` (`tools/closing-gate/`),
  `parseRegistry` (`tools/code-registry/`) — over the live tree, in three
  scratch node scripts under `.pi/tmp/`, since deleted. Suite figures are
  `npx vitest run --exclude 'tests/*scratch*'`; the exclusion drops untracked
  scratch files belonging to sibling sessions (`tests/scratch-0231-probe.test.ts`,
  `tests/zz-scratch-0232-probe*.test.ts`), which are not this filing's. Each
  mutation probe (§Reproduction (b), (c)) edited one spec registry page, ran the
  suite, and was restored by writing the backed-up bytes back — never
  `git stash`, `git checkout --` or `git restore` — with `git hash-object`
  proving byte-exact restoration against `git rev-parse HEAD:<path>`
  (`code-registry-parse.md` `61acaa4d5c47a4118596c57d5d5e03a01748d002`,
  `code-registry-load.md` `218bf3af1fdeed561af9147c77e19d8b95f89b5f`).
  `src/`, `tests/`, `tools/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

DIAG-2 closes the diagnostic registry and requires a new code to land its row
in the same commit as its site. Three artifacts carry that closure — the four
sharded `code-registry-*.md` tables, the `docs/reference/diagnostics.md` mirror,
and the asserting test corpus — and no test in `npm test` reconciles any pair of
them over the live tree.

`tests/code-registry.test.ts` is the file bug records name as "the closed-set
gate". Its closed-set test (`:86`) builds a two-row registry literal
(`:87–:105`) and a two-element asserted-code list (`:111`) and asserts that
`reconcileClosedSet` reports one finding of each kind. That is a unit test of
the reconciler. The file's only live-corpus assertion is the `parseRegistry`
shape test (`:62`): one row, four namespaces.

The corpus-level reconciliation exists and runs. `assembleLiveCorpus`
(`live-corpus.js:122`) reads the live registry pages and the live `tests/**`
corpus, `runClosingGate` computes both closed-set arms over them
(`closing-gate/index.js:701`, `:713`), and `warnOnlyFindings` (`:184`) drops
both because `CANARY_GAP_KINDS` (`:51–:59`) lists neither. The one reddening
assertion consumes the filtered projection
(`live-corpus-release-gate.test.ts:39–41`, `:140–:145`). At HEAD the discarded
findings are 4 `registry-code-no-asserting-test` and 112
`asserted-code-not-in-registry`; the surfaced count is 0.

Registry↔mirror parity is computed by nothing. The mirror is a four-column
transcription and `parseRegistry` skips rows with fewer than five cells
(`code-registry/index.js:36`), so `parseRegistry` over the mirror returns 0
rows.

Three probes measure the consequence. A ghost row added to
`code-registry-parse.md` with no mirror row and no asserting test: the whole
default suite is green (375 files, 7698 tests). Removal of
`theta/load/cross-source-shadow` (a code no test asserts): green. Removal of
`theta/parse/empty-enum-body` (a code tests assert by name, without sourcing its
*Message* from the live registry): green. Removal of
`theta/parse/inline-field-name-not-identifier` — bug 0228's row, whose witness
sources its *Message* through `registryMessage` over the live pages — reds 12+
cells across two files. Row removal is caught opportunistically, per code, by
whichever witness happens to read the live registry; row addition is caught
nowhere, and mirror omission is caught nowhere.

## Reproduction

Offline, deterministic, at HEAD `4c157bcc`.

### (a) What the registry test file gates

| # | site | input | what an assertion could catch |
|---|---|---|---|
| A1 | `code-registry.test.ts:62` (`parseRegistry`) | live four pages | a malformed `theta/parse/unterminated-string` row; a namespace with zero rows |
| A2 | `:86` (`reconcileClosedSet`) | two-row literal (`:87–:105`) + two-element `assertedCodes` (`:111`) | a `reconcileClosedSet` regression |
| A3 | `:132` (`reconcileStableIds`) | two-element literal code lists (`:133–:141`) | a `reconcileStableIds` regression |
| A4 | `:169` (`registryMessage`) | live four pages | a change to `theta/parse/binding-case-mismatch`'s *Message* cell |

Row shape is checked for one row (A1). Mirror parity, row count, per-row column
completeness and the registry↔test-corpus reconciliation are checked by no cell
of the file.

### (b) A ghost row: added, unmirrored, unwitnessed, and green

One row inserted into `code-registry-parse.md` after
`theta/parse/empty-enum-body`:

```
| `theta/parse/ghost-probe-0230` | E | parse | A probe row with no mirror and no asserting test. | [Grammar Appendix](../grammar.md) | — | `ghost probe row <x>` |
```

No `docs/reference/diagnostics.md` row, no emission site, no asserting test.

| # | observable | result |
|---|---|---|
| B1 | `parseRegistry` row count | 218 → 219 |
| B2 | computed `registry-code-no-asserting-test` findings | 4 → 5 |
| B3 | `npx vitest run tests/code-registry.test.ts tests/closing-gate.test.ts` | `48 passed (48)` |
| B4 | `npx vitest run --exclude 'tests/*scratch*'` | `Test Files 375 passed (375)`, `Tests 7698 passed (7698)` |

B4 is the measurement: the default suite does not observe a registry row that
DIAG-2's same-commit clause forbids landing alone.

### (c) Row removal, three codes

Each removal is one deleted table line; the suite command is B4's.

| # | row removed | suite |
|---|---|---|
| C1 | `theta/load/cross-source-shadow` (asserted by no test) | `375 passed`, `7698 passed` |
| C2 | `theta/parse/empty-enum-body` (asserted by code name in `tests/schema-declarations.test.ts:141–154`, message not sourced from the registry) | `375 passed`, `7698 passed` |
| C3 | `theta/parse/inline-field-name-not-identifier` (bug 0228's row; witness sources its *Message* via `registryMessage` over the live pages) | red — `tests/inline-object-type-source-capture.test.ts` cell `A0` plus 11 further cells across that file and `tests/inline-object-field-name-case.test.ts` |

C3 is the whole mechanism by which a removal is currently caught: a per-row
witness that resolves its expected message from the live registry. C1 and C2 are
the two ways a row escapes it — no witness at all, or a witness that hard-codes
the message and cites the code in prose.

### (d) The live-corpus census, unfiltered

`assembleLiveCorpus(repoRoot)` → `runClosingGate`, findings grouped by kind:

| kind | count | in `CANARY_GAP_KINDS` |
|---|---|---|
| `registry-code-no-asserting-test` | 4 | no |
| `asserted-code-not-in-registry` | 112 | no |
| `retired-live-id-clash` | 13 | no |
| `per-prefix-numbering-hole` | 2130 | no |
| — surfaced by `warnOnlyFindings` | 0 | — |

The four `registry-code-no-asserting-test` subjects:
`theta/load/cross-source-shadow`, `theta/runtime/subagent-wire-parse-failed`,
`theta/runtime/subagent-envelope-parse-failed`,
`theta/runtime/subagent-envelope-schema-skew`.

The 112 `asserted-code-not-in-registry` subjects are dominated by extractor
artefacts: prose-truncated prefixes (`theta/parse/`, `theta/runtime/`,
`theta/parse/quoted-inline-field-`), theta document names
(`theta/demo`, `theta/bug0179`, `theta/child`), and the registry test's own
deliberate ghosts (`theta/runtime/ghost`, `theta/parse/old-name`,
`theta/parse/new-name`). This is 0200's Constraint 7 caveat, re-measured: the
kind is not usable as a gate at its current extraction fidelity.

### (e) Mirror parity

| # | observable | result |
|---|---|---|
| E1 | registry code rows (four sharded pages, via `parseRegistry`) | 218 |
| E2 | `docs/reference/diagnostics.md` code rows | 217 |
| E3 | registry-only codes | `theta/runtime/non-object-receiver` |
| E4 | mirror-only codes | none |
| E5 | `parseRegistry` over the mirror text | 0 rows (four cells against the five-cell floor, `code-registry/index.js:36`) |

E3 is 0200's *Residuals* item 4, unchanged at HEAD and reported by no test. E5
is why: the one function that could compare the artifacts cannot read one of
them.

### (f) Bounds

| # | statement | evidence |
|---|---|---|
| F1 | the closed-set arms are correct where they are exercised | `tests/closing-gate.test.ts:68`, `:74` green against the `registry-code-no-test` and `asserted-code-not-in-registry` fixtures; `tests/code-registry.test.ts:86` green over its literal |
| F2 | `theta/typecheck/*` is correctly carved out of both arms | `tests/closing-gate.test.ts:38`; `tools/closing-gate/index.js:701`, `:713` comments |
| F3 | the canary's own four arms ARE gated over the live corpus | `tests/live-corpus-release-gate.test.ts:140–145`, green, and the seeded-gap cells at `:160`, `:180`, `:213` prove it can red |
| F4 | DIAG-4 has a live-corpus foothold | `tests/code-registry.test.ts:169`; 150 test files read the live registry pages, and a row whose *Message* one of them resolves cannot be deleted silently (cell C3) |

F3 and F4 bound the claim: this report is not "the closing gate is dead". Four
arms hard-fail over the live corpus, and per-row *Message* resolution catches
some removals. The closed set itself is what nothing reconciles.

## Expected behaviour

DIAG-2 (`diagnostic-shape.md:72`) closes the registry and states that new
diagnostic sites "MUST land their codes in this table at the same time".
`code-registry-parse.md:5` states that the four tables "together enumerate every
diagnostic the V1 spec defines". `docs/reference/diagnostics.md:3–:9` states
that the mirror transcribes the stable-contract columns "verbatim from the four
spec registry pages".

From those three sentences:

- **A registry row added without an asserting test is reported.** The
  reconciliation that reports it exists (`closing-gate/index.js:701–:711`) and
  runs over the live corpus; its output reaches no assertion. Cell B4 should not
  be green.
- **A registry row removed is reported, whether or not some witness happens to
  resolve its *Message*.** Cells C1 and C2 should not be green. Today the
  property that catches a removal is DIAG-4 message-sourcing, which is a
  different obligation that happens to imply part of this one.
- **The mirror and the registry enumerate the same code set.** Cell E3 is a
  standing one-row divergence between two artifacts that each claim to
  enumerate the closed set, reported by nothing. Whether the fix is a parity
  gate or the missing mirror row, the divergence must be observable.
- **A test file that stands in for a corpus gate says which it is.**
  `tests/code-registry.test.ts`'s header calls its subject "the closed-set +
  stable-id enforcement the H5a gate consumes" (`:8–:9`), which is accurate for
  the reconciler and is read as coverage of the closed set by at least three
  fix records.

## Actual behaviour / root cause

**The unit test and the corpus gate were authored as one leaf, and only the unit
half landed an assertion.** `tests/code-registry.test.ts` is a V7b leaf: it pins
the four exports `tools/code-registry/index.js` provides (`:11–:15` of that
module) and hands corpus-level reconciliation to "the H5a gate". H5a's gate
(`tools/closing-gate/index.js`) does implement both closed-set arms, and
`tests/closing-gate.test.ts` runs it — against `test-fixtures/closing-gate`
(`:15–:17`). `loadCorpus` (`:911`) takes a directory holding `governance.md`,
`spec/`, `registry/` and `tests/`, which is the fixture layout; the repository
root is not that shape.

**The live-corpus footing was scoped to four arms by design, and the closed set
was not among them.** `live-corpus.js:21–:24` states it: the machinery's other
arms — "diagnostic-code parity, retired/live clash, per-prefix numbering hole,
broad-catch allow-list, transitive-completeness" — "are not part of the
live-corpus footing H6a flips and are filtered out of the canary's returned
collection". `warnOnlyFindings` (`:184`) applies the filter, and
`tests/live-corpus-release-gate.test.ts:39–:41` delegates the hard-fail footing
to the same projection so the two cannot drift. The consequence is that the
closed-set arms run 2,259 findings' worth of computation per suite run
(§Reproduction (d)) and no assertion reads any of it.

**The two artifacts cannot be compared by the one tool that parses either.**
The mirror carries four columns by design (`docs/reference/diagnostics.md:8–:9`
declines *Trigger* / *Spec rule* / *Hint* "to avoid drift"), and
`parseRegistry`'s five-cell floor (`code-registry/index.js:36`) exists to skip
non-registry tables. Together they make the mirror unreadable to the registry
parser, which is 0200's R8 finding ("no tool compares the two artifacts") still
true at HEAD.

**What catches a removal today is DIAG-4, not DIAG-2.** 150 test files read the
live registry pages; a row whose *Message* one of them resolves through
`registryMessage` cannot be deleted without a red (cell C3, 12 cells). A row
that no file resolves can (cells C1, C2). This is coverage by coincidence: it
follows the distribution of message-sourcing witnesses, not the registry.

**Nothing catches an addition, in any artifact.** An added row has, by
construction, no witness that could red on its absence. The only mechanism that
could observe it is the `registry-code-no-asserting-test` arm, which is the
filtered one.

## Why it matters

- **The same-commit discipline DIAG-2 states is unenforced, and fix records
  credit a gate for enforcing it.** `docs/bugs/0155-…:622` calls
  `tests/code-registry.test.ts` "the closed-set gate";
  `docs/bugs/0102-…:712` and `docs/bugs/0031-…:660` reason from what its
  "closed-set reconciliation" would demand of a new code. Cells B3 and B4 show
  the file cannot answer that question. Every future fix minting a row inherits
  the same unearned assurance.
- **Three divergences are live at HEAD and unreported.** Four registry codes
  with no asserting test, and one registry code with no mirror row
  (§Reproduction (d), (e)). Two are already written down as residuals of other
  reports (0200 items 3 and 4, 0033 §Affected) and none is observable from a
  suite run.
- **A missing row has happened, from exactly this blind spot.** Bug 0200's R9
  (`:413–:436`) measured the case: commit `52d8a3c1` added three `par for` codes to the
  mirror, CTRL-4 prose and the emitting parser, and no spec registry page. The
  gap survived from that commit to 0.173.0. The reconciliation that reports it
  was running the whole time.
- **The cost of the gap is paid per fix, in prose.** Because no gate answers,
  each report that touches the registry re-derives the obligation by hand and
  states its own census (0200 R1/R5, 0228 §Fix (b), 0033 §Affected). That work
  is a gate's output, written by a model each time.
- **Closing it costs no source language change.** No `.theta` behaviour, no
  diagnostic emission, no *Message* cell moves under any candidate in §Fix.

## Fix

Not settled. The candidates below are constraint-pinned; the run selects, states
its choice, and records why the others are wrong. DIAG-2
(`diagnostic-shape.md:72`) is the anchor — the obligation is "the registry is
closed", and the deliverable is a test that reds when it is not.

**(a) Where the gate lives.** Three shapes, not exclusive:

- *Shape 1 — admit the kinds into the live-corpus footing.* Add
  `registry-code-no-asserting-test` (and/or `asserted-code-not-in-registry`) to
  `CANARY_GAP_KINDS` (`live-corpus.js:51–:59`), which makes
  `tests/live-corpus-release-gate.test.ts:145` red on them. Pre-measured cost:
  4 and 112 findings respectively at HEAD (§Reproduction (d)), so the
  asserted-code direction is not admissible without (b), and the four
  registry-code subjects must be dispositioned (witnessed, or carved out with a
  stated reason) before the assertion can be green. `live-corpus.js:21–:24`'s
  header clause states the current scope and would need correcting in the same
  change, along with the H5b/H6a plan-leaf prose that fixes the four-arm
  footing.
- *Shape 2 — a dedicated registry-parity test.* A new test file reconciling the
  live four pages against the live `tests/**` corpus and against the mirror,
  independent of the closing gate's corpus loader, with its own carve-out list.
  Cost: a second definition of "asserted", against `live-corpus.js`'s stated
  no-second-copy principle (`:5–:11`). Benefit: the mirror direction has no home
  in the gate's corpus shape at all (`loadCorpus` has no mirror slot).
- *Shape 3 — strengthen `tests/code-registry.test.ts` in place.* Keep the
  reconciler unit cells (A2, A3) and add live-corpus cells beside them: row
  count, per-row column completeness, and the mirror↔registry code-set
  comparison. Cost: the mirror is invisible to `parseRegistry`
  (`code-registry/index.js:36`), so this needs a mirror reader — either a
  four-column mode on `parseRegistry` or a mirror-specific extractor — and that
  choice has a blast radius on 150 test files that import the module.

**(b) The extraction question the asserted-code direction depends on.**
`extractAssertedCodes` matches code-shaped strings in test text and yields 112
subjects at HEAD, of which the majority are prose truncations
(`theta/parse/`, `theta/parse/quoted-inline-field-`), theta document names
(`theta/demo`, `theta/child`) and the registry test's deliberate ghosts. Any
disposition that gates that direction must first state what counts as an
assertion. 0200's §Non-goals excluded this; it is in scope here only if the run
picks a shape that needs it. The `registry-code-no-asserting-test` direction
does not need it — 4 subjects, all real.

**(c) The four unwitnessed codes.** `theta/load/cross-source-shadow`,
`theta/runtime/subagent-wire-parse-failed`,
`theta/runtime/subagent-envelope-parse-failed`,
`theta/runtime/subagent-envelope-schema-skew`. Each is either a missing witness
(write it) or a carve-out (state why the code is unassertable offline, in the
carve-out's own comment). A gate that lands with an unexplained allow-list of
four is a gate that will grow a fifth.

**(d) The mirror row.** `theta/runtime/non-object-receiver` is absent from
`docs/reference/diagnostics.md` (cell E3). A parity gate reds on it. Adding the
row is 0200's *Residuals* item 4 and is a one-line change; the run states
whether it lands here (as the gate's precondition) or stays 0200's residual.

**(e) Ordering.** Nothing blocks this report. A fix here is a precondition for
retiring the per-report registry censuses that 0200 R1/R5, 0228 §Fix (b) and
0033 §Affected each wrote by hand; a later report reusing that measurement
should cite this record rather than re-deriving it.

**(f) Witness obligations.** The gate's own both-directions proof is the whole
subject:

- **Cell B4's probe becomes a red.** Re-run it: the ghost row of
  §Reproduction (b) inserted, the suite red, naming the row; restored by writing
  the bytes back, hash-proven, and green. `git stash`, `git checkout --` and
  `git restore` are not admissible restorations here.
- **Cells C1 and C2 become reds** under any shape that gates removal; cell C3
  must stay red for its own reason (DIAG-4 message sourcing) and must not be
  weakened into the new gate's coverage.
- **The mirror direction is proven by mutation**: one mirror row deleted → red;
  one registry row deleted → red; restored byte-exact both times.
- **The carve-out list is asserted, not merely consulted.** A cell naming each
  carved-out code and its reason, so an unexplained addition to the list reds.
- **The census figures of §Reproduction (d) and (e) are re-measured** after the
  fix and quoted; a gate whose green rests on a stale carve-out is not a gate.

**(g) Blast radius.** No `src/` change, no diagnostic emission, no *Message*
cell, no `.theta` behaviour. `tests/committed-fixture-parse-gate.test.ts` takes
no new refusal. The reachable surfaces are `tools/closing-gate/`,
`tools/code-registry/`, the two registry test files, and — under shape 1 — the
H5b/H6a plan-leaf prose stating the four-arm live-corpus footing.

## Non-goals

- **The `per-prefix-numbering-hole` and `retired-live-id-clash` arms.** 2,130
  and 13 findings at HEAD (§Reproduction (d)), also computed and also filtered.
  They are REQ-ID surfaces, not the diagnostic registry, and are out of scope
  here; a fix must not enable them incidentally.
- **The three missing `par for` rows.** Landed by
  [0200](./0200-par-codes-missing-from-sharded-registry.md) (0.173.0). This
  report claims the absence of a gate, not any missing row except as cell E3's
  evidence.
- **`extractAssertedCodes`'s fidelity**, unless §Fix (b) is entered: the
  `registry-code-no-asserting-test` direction is gateable without touching it.
- **DIAG-1, DIAG-3 and DIAG-4.** An emission site carrying an unregistered code
  (DIAG-1), a rename (DIAG-3) and *Message* wording (DIAG-4) are separate
  obligations with their own cells (`code-registry.test.ts:132`, `:169`). This
  report claims the closed set only.
- **The four gated canary arms.** `tests/live-corpus-release-gate.test.ts`'s
  REQ-ID, citing-test, per-facet and un-anchored-MUST arms work over the live
  corpus and can red (cell F3). Their scope is not re-opened.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `tools/closing-gate/index.js`, `tools/closing-gate/live-corpus.js` and — if
  §Fix (d) lands — `docs/reference/diagnostics.md`; that is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Provenance

- Origin: the bug
  [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) fix
  (0.179.0), whose §Fix (b) minted a registry row, its *Trigger*, its mirror row
  and its witness "in the same commit" under DIAG-2 and recorded no gate
  observing any of the three. The premise this report tests — that omitting one
  of them reds a gate — is measured false (§Reproduction (b), (c)).
- Prior partial measurement, verified at HEAD and not copied:
  [0200](./0200-par-codes-missing-from-sharded-registry.md) R8 (`:393–:411`),
  Constraint 7 (`:612–:620`), *Residuals* items 3 (`:907–:914`) and 4
  (`:915–:918`) for the `asserted-code-not-in-registry` direction and the
  mirror row; [0033](./0033-body-level-schema-alias-unsupported.md) §Affected
  (`:86–:92`) for the `registry-code-no-asserting-test` direction.
- Independently measured at HEAD `4c157bcc` for this filing: the four-arm
  finding census and the surfaced count (§Reproduction (d)) through
  `assembleLiveCorpus` + `runClosingGate` + `warnOnlyFindings`; the 218/217 code
  counts, the registry-only code and the 0-row mirror parse (§Reproduction (e))
  through `parseRegistry`; the ghost-row probe (§Reproduction (b)) and the three
  removal probes (§Reproduction (c)) as temporary single-line edits to
  `code-registry-parse.md` / `code-registry-load.md`, each restored by writing
  the backed-up bytes back and hash-verified against
  `git rev-parse HEAD:<path>`.
- Spec: `docs/spec_topics/diagnostics/diagnostic-shape.md` (`:71`, `:72`,
  `:74`); `docs/spec_topics/diagnostics/code-registry-parse.md:5`;
  `docs/reference/diagnostics.md` (`:3–:9`).
- Implementation evidence at `4c157bcc`: `tools/code-registry/index.js`
  (`:31`, `:36`, `:99`, `:106`, `:115`, `:132`);
  `tools/closing-gate/index.js` (`:701–:711`, `:713–:722`, `:911`);
  `tools/closing-gate/live-corpus.js` (`:21–:24`, `:51–:59`, `:122`,
  `:148–:153`, `:184`).
- Test evidence at `4c157bcc`: `tests/code-registry.test.ts` (`:39–:56`,
  `:58`, `:62`, `:86`, `:87–:105`, `:109–:112`, `:120–:124`, `:128`, `:165`,
  `:169`); `tests/closing-gate.test.ts` (`:15–:17`, `:34`, `:38`, `:68`,
  `:74`); `tests/live-corpus-release-gate.test.ts` (`:39–:41`, `:140–:145`,
  `:160`, `:180`, `:213`); `tests/schema-declarations.test.ts:141–:154`;
  `tests/inline-object-type-source-capture.test.ts`;
  `tests/inline-object-field-name-case.test.ts`.

## Fix (0.184.0)

**Shape 2, in its no-second-copy reading, selected by the run.** The gate is a
dedicated corpus-wide reconciliation test that runs the SHIPPED machinery —
`assembleLiveCorpus` + `runClosingGate` (`tools/closing-gate/`) and
`parseRegistry` (`tools/code-registry/`) — over the real repository root and
asserts on the two closed-set kinds directly. No second definition of
"asserted" is authored, which is what `live-corpus.js:5–:11` forbids and what
§Fix (a) shape 2 charged against it.

**Why the other two shapes are wrong here.** Shape 1 (admit the kinds into
`CANARY_GAP_KINDS`) re-scopes the canary: `live-corpus.js:21–:24` states a
four-arm live-corpus footing that H6a hard-fails on, so admitting a fifth and
sixth arm drags the H5b/H6a plan-leaf prose that fixes that footing and couples
this subject to the canary's release-gate contract — a blast radius §Fix (g)
did not need to buy for a closed-set gate. Shape 3 (strengthen
`tests/code-registry.test.ts` in place) needs a mirror reader, and the only
candidates were a four-column mode on `parseRegistry` or a change to its
five-cell floor (`code-registry/index.js:36`) — 150 test files import that
module. The shipped shape keeps a mirror reader local to the new file and
leaves `parseRegistry` byte-identical.

**The 112-count arm is baselined, not gated to empty.** `extractAssertedCodes`
(`closing-gate/index.js:589`) matches any code-shaped span in test text, so the
population is dominated by prose truncations, `.theta` document names and the
registry test's deliberate ghosts (§Reproduction (d), §Fix (b)). Gating it to
empty would red permanently, which is no gate. It is pinned as DATA — the
precedent shape of `tests/fixtures/h7a/permitted-codes.json` — with its own
staleness tripwire, so an ADDITION reds while extractor fidelity stays §Fix
(b)'s separate subject.

- What shipped:
  - `tests/registry-closed-set-corpus-gate.test.ts` (new) — six cells over the
    live tree. Cell 1: the `registry-code-no-asserting-test` subject set is
    asserted SET-EQUAL to an inline `CARVE_OUT` table, so an unwitnessed row
    landing reds and a stale carve-out reds (§Fix (c), §Fix (f) "the carve-out
    list is asserted, not merely consulted"). Cell 2: every carved-out code is a
    live registry code carrying a non-empty stated reason. Cell 3: the
    `asserted-code-not-in-registry` subjects are a SUBSET of the pinned
    baseline. Cell 4: no pinned baseline entry has gone stale. Cells 5–6:
    registry↔mirror code-set parity, both directions, with distinct messages.
    A missing artifact throws naming its path (`readRequired`) — never a skip.
  - `tests/fixtures/diag2/asserted-code-not-in-registry-baseline.json` (new) —
    the 112 HEAD subjects, produced mechanically from the gate run and sorted.
  - `docs/reference/diagnostics.md` — one added row,
    `theta/runtime/non-object-receiver`, transcribed verbatim from
    `code-registry-runtime.md` in that page's ordering position. §Fix (d) lands
    HERE, as the parity gate's precondition; it is also 0200's *Residuals*
    item 4, now discharged. Registry and mirror both enumerate 218 codes.
  - The four carve-outs carry per-code reasons, and the reasons are three
    distinct findings, not one excuse: `theta/load/cross-source-shadow` is
    emitted at `src/discovery/discovery-walk.ts:1181` and genuinely unwitnessed;
    `theta/runtime/subagent-wire-parse-failed` has NO emitter anywhere in `src/`
    (bug 0086, open), so no test can witness it;
    `theta/runtime/subagent-envelope-parse-failed` and
    `theta/runtime/subagent-envelope-schema-skew` ARE witnessed
    (`tests/subagent-envelope.test.ts:330`, `:346`,
    `tests/subagent-json-wire.test.ts:129`) through exported code constants, so
    the shipped extractor — which matches literal spans — cannot see them.
  - `CODE_PREFIX = "theta" + "/"`: the carve-out table composes its codes rather
    than spelling them, because `extractAssertedCodes` treats any code-shaped
    literal in a `tests/**` source as an assertion and a spelled-out table would
    make the gate file itself the asserting test for the very codes it carves
    out. Verified arm-neutral: both arms recompute identically with the file
    present and with it filtered out of `testSources` (delta `[]`).
- Gates:
  - Witness, red before: `npx vitest run tests/registry-closed-set-corpus-gate.test.ts`
    → `Tests 1 failed | 5 passed (6)`, `registry codes absent from
    docs/reference/diagnostics.md: expected [ 'theta/runtime/non-object-receiver' ]
    to deeply equal []`. Green after: `Tests 6 passed (6)`.
  - Full default suite: `npm test` → `Test Files 376 passed (376)`,
    `Tests 7704 passed (7704)` (filing baseline 375 / 7698, plus this file's 6).
  - `npm run typecheck` → clean, no output. `npm run lint` → clean, no output.
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — FINDINGS, two, both text:
  the `cross-source-shadow` carve-out reason was self-falsified (it claimed its
  own message string occurred nowhere under `tests/`, which the landing file
  makes false), and the `REGISTRY_PAGES` comment wrongly equated the four
  sharded pages with `assembleLiveCorpus`'s wider `registryText`. Round 1 also
  independently re-ran all four §Fix (f) mutation proofs. One fixer round,
  comment/reason-string only, no assertion moved. Round 2
  (`bug-fix-reviewer-fast`) — CLEAN, no escalation.
- Verification: PASS.
  - Witness reds: the mirror row deleted by a temporary local edit → RED naming
    `theta/runtime/non-object-receiver`; restored by writing the bytes back →
    GREEN.
  - §Fix (f) mutation proofs, each restored byte-exact and hash-verified against
    `git rev-parse HEAD:<path>` (`code-registry-parse.md`
    `61acaa4d5c47a4118596c57d5d5e03a01748d002`, `code-registry-load.md`
    `218bf3af1fdeed561af9147c77e19d8b95f89b5f`): the ghost row of §Reproduction
    (b) → 2 cells red, and the whole default suite red
    (`Test Files 1 failed | 375 passed (376)`) where the filing measured
    `375 passed (375)` green — cell B4 is closed; cell C1 → 2 cells red; cell C2
    → 1 cell red; a mirror row deleted → red naming the code. Cell C3's own
    DIAG-4 red is unweakened: `tools/**` and both inline-object witness files
    are byte-identical to HEAD.
  - Census re-measured after the fix: `registry-code-no-asserting-test` 4,
    `asserted-code-not-in-registry` 112, `retired-live-id-clash` 13,
    `per-prefix-numbering-hole` 2130; registry 218 rows, mirror 218 rows,
    registry-only `[]`, mirror-only `[]`, baseline fixture length 112.
  - Live: no `src/` path is touched and the diff carries no executable source
    change (`git status --short`: one modified documentation file plus two new
    test-only paths), so the 0193/0205 precedent applies and no live run is
    owed. None was run; no live lock was taken.
- Residuals:
  1. **A coordinated removal of a prose-mentioned code stays green.** Deleting
     `theta/parse/empty-enum-body` from BOTH `code-registry-parse.md` and the
     mirror in one edit leaves all six cells green (measured in review round 1,
     restored byte-exact): arms (3)/(4) read `parseRegistryCodes` over
     `registryText`, which spans every `.md` under
     `docs/spec_topics/diagnostics/` plus `docs/spec_topics/diagnostics.md`
     (`live-corpus.js:148–:150`), so a code backtick-mentioned in
     `placeholder-rendering-b.md` still counts as registered, and symmetric
     deletion satisfies parity. Closing this needs a third reconciliation —
     `extractAssertedCodes` against `parseRegistry` over the four TABLES only —
     which is a design extension past §Fix's obligations. The file's
     `REGISTRY_PAGES` comment states the wider-set mechanism so the parity cells
     are not misread as covering it.
  2. **The baseline cell is merge-sensitive by design.** `assembleLiveCorpus`
     reads `tests/**/*.ts` from disk independent of vitest's include/exclude, so
     a sibling change landing a test that cites a new code-shaped span (a
     bug-numbered `.theta` document name, say) reds the subset cell until the
     baseline is updated. That is the tripwire working — the precedent fixture
     `tests/fixtures/h7a/permitted-codes.json` behaves the same way — but a
     merge should expect it and update the pin rather than weaken the cell. An
     untracked scratch test sitting in `tests/` during a run reds it too.
  3. **`theta/parse/tool-arg-not-literal` and `theta/parse/unexpected-token`**
     sit in the 112 baseline and are code-SHAPED rather than obviously
     artefactual. Whether either names a real unregistered code or is prose is
     §Fix (b)'s extractor-fidelity subject, explicitly out of scope here.
  4. **`tests/par-for.test.ts:464` cites `docs/reference/diagnostics.md:312`**
     for the CTRL-4 Provenance paragraph, whose true line at HEAD was 318 — a
     pre-existing 6-line drift, unrelated to this fix, moved to 319 by the added
     row. 0134's adjudicated do-not-chase class; not chased.
- Discharge notes appended: none. 0200's *Residuals* item 4 (the missing mirror
  row) and 0033's §Affected statement are discharged in substance by this
  record; neither sibling document was edited.
- Pinned dispositions / non-goals: `CANARY_GAP_KINDS` and the canary's four-arm
  live-corpus footing are unchanged (§Non-goals "the four gated canary arms");
  `per-prefix-numbering-hole` and `retired-live-id-clash` stay filtered;
  `parseRegistry`'s five-cell floor and its 150 importers are untouched;
  `tests/code-registry.test.ts`'s reconciler unit cells are untouched (cell F1
  is correct for what it asserts); no `src/` change, no diagnostic emission, no
  *Message* cell moved.
