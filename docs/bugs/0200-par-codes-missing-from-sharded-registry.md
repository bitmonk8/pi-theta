# Bug 0200 — DIAG-2 closes the diagnostic registry on the four sharded `code-registry-*.md` pages and requires every code to land its row there, yet the three CTRL-4 `par for` body-restriction codes — `theta/parse/par-query-in-body`, `theta/parse/par-shared-mutation`, `theta/parse/par-break-continue` — have no row on any of them: they are emitted from four sites in `theta-document.ts`, stated in `control-flow.md` CTRL-4 prose, and tabulated only in the `docs/reference/` mirror, whose own Provenance says they "are registered here"; a set difference over the two artifacts is exactly these three codes, their normative *Trigger* / *Spec rule* / *Hint* columns exist nowhere in the corpus, and the one committed DIAG-4 witness that needs a *Message* carries a two-page fallback ladder to resolve it

- **Status:** open. §Fix is constraint-pinned, not settled: the row content is
  derivable from CTRL-4 prose, but which sharded page hosts the rows is an
  adjudication (the namespace points at the parse page; that page is the largest
  of the four under a committed size cap), and the *Trigger* / *Spec rule* /
  *Hint* cells have no existing text to transcribe. No code change is proposed —
  all three codes fire at HEAD and every rendered byte already matches the
  mirror's normative *Message*. No ordering dependency: nothing blocks this and
  it blocks nothing.
- **Sev/Diff estimate:** S4/D2 — spec-prose defect with no author-visible
  behaviour change (§Reproduction R4 and R6: the three codes are emitted and one
  committed witness asserts a full rendered *Message* green at HEAD), and the
  remedy is confined to one sharded page plus a reconciled Provenance note;
  D2 because it authors three rows in the five-column sharded shape whose
  *Trigger* / *Spec rule* / *Hint* cells must be derived from CTRL-4 prose
  without minting normative meaning, must land under DIAG-2's same-commit
  discipline, and must spell the *Message* cell in the escaped form
  `tools/code-registry/index.js` round-trips (R7 measures the naive spelling
  reddening the witness).
- **Kind:** defect — spec, registry completeness. Two normative artifacts
  disagree about where three shipped codes are registered, in four measured
  elements.
  1. *Three emitted codes have no row on the closed registry.* DIAG-2
     (`diagnostic-shape.md:72`) closes the registry and requires new codes to
     "land their codes in this table at the same time"; `rg` over
     `docs/spec_topics/diagnostics/` returns no match for any of the three
     (§Reproduction R1).
  2. *The count falsifies the four pages' own completeness claim.*
     `code-registry-parse.md:5` states the four tables "together enumerate every
     diagnostic the V1 spec defines". They enumerate 201 distinct codes; the
     mirror enumerates 203, and the set difference in the mirror's favour is
     exactly these three (§Reproduction R5).
  3. *The Trigger / Spec rule / Hint columns exist for these codes nowhere.* The
     mirror deliberately omits them (`docs/reference/diagnostics.md:8`: "The full
     *Trigger* / *Spec rule* / *Hint* columns live on the spec registry pages and
     are not restated here to avoid drift"), and the spec registry pages have no
     row to carry them. The column legend makes *Trigger* normative content —
     "*Trigger* is the canonical condition" (`diagnostic-shape.md:80`) — so the
     triggering condition for all three exists only as CTRL-4 prose
     (`control-flow.md:76`).
  4. *The two artifacts state different registration homes.* The mirror's
     Provenance says the three codes "are registered here for theta 1.1"
     (`docs/reference/diagnostics.md:304–306`) while its header says the page
     "transcribes the stable-contract columns … verbatim from the four spec
     registry pages" (`:4–6`). A page cannot be both the registration home and a
     verbatim transcription of a page that lacks the row.
- **Related:**
  [0189](./0189-registry-placeholders-outside-closed-categories.md) — open, the
  family precedent: a closed-surface claim on the same diagnostics cluster
  falsified by counting the registry it quantifies over, disposition spec-side
  with no code change. Same shape here (a closure claim versus a census), one
  level up: 0189 measures the *Message* column's placeholder vocabulary against
  the rows, this report measures the row set itself against DIAG-2. Neither fix
  answers the other. 0189 §Non-goals also records the reverse-direction residue
  this report's census re-measures (see §Non-goals).
  [0194](./0194-unprovable-marking-by-object-identity-shared-alias-element.md) —
  fixed (0.113.0), the filing origin and the measured consequence. Its witness
  `tests/loop-element-withhold-binding-scoped.test.ts` needs
  `par-query-in-body`'s *Message* for cell `e2` and therefore carries the
  two-page fallback ladder (§Reproduction R6); its fix-run report §Residuals
  item 3 is this report's origin (§Provenance).
  [0134](./0134-params-shift-induced-stale-citations.md) — open, and a distinct
  class: `path:line` citations that named correct content at a stale position.
  This defect is a missing row, not drift — no citation here points at moved
  content, and the remedy authors new text rather than re-aiming a reference.
  [0118](./0118-nested-fn-result-return-defers-to-runtime-panic.md) and
  [0122](./0122-template-interpolation-diagnostics-discarded.md) — both open and
  both cite `par-query-in-body`, neither files this gap as a subject. 0118 is the
  closer of the two: its §Affected notes in a parenthetical that the three codes
  "carry no row under `docs/spec_topics/diagnostics/`" (`:194–199`) while its
  subject is the missing FN-1 refusal under a `par for`. 0122 cites the code once
  as a row in its own diagnostic inventory (`:422`). No open report takes the
  absent rows as its subject.
- **Affected** (every citation read from the tree at HEAD `a7d15562`, 0.113.0):
  - **The four sharded pages — the closed normative home, by namespace, row
    count and byte size** —
    `docs/spec_topics/diagnostics/code-registry-parse.md` (`theta/parse/*`, 113
    rows, 55,564 bytes; `:5` the four-page completeness claim; `:66`
    `non-array-iterand`, `:67` `break-outside-loop`, `:68`
    `continue-outside-loop`, `:69` `break-with-value`, then `:70`
    `illegal-template-escape` — the gap is between `:69` and `:70`, the exact
    position the mirror fills; `:75` `empty-query-annotation`, the escaped
    backtick-in-*Message* spelling precedent R7 needs);
    `docs/spec_topics/diagnostics/code-registry-load.md` (`theta/load/*`, 53
    rows, 45,607 bytes);
    `docs/spec_topics/diagnostics/code-registry-runtime.md` (`theta/runtime/*`,
    30 rows, 45,310 bytes);
    `docs/spec_topics/diagnostics/code-registry-host.md` (`theta/host/*`, 5
    rows, 16,486 bytes). 201 distinct codes across the four, measured through
    `parseRegistry` (R5).
  - **The governing rules** —
    `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1: "Every
    author-visible diagnostic emitted by the runtime MUST carry a code from the
    registry below"), `:72` (DIAG-2: "**The registry is closed.** Adding a new
    code, removing a code, or changing a code's namespace, severity, or trigger
    are all spec changes — not implementation changes. New diagnostic sites added
    by future spec work MUST land their codes in this table at the same time."),
    `:74` (DIAG-4: the *Message* column is normative and "Tests asserting a
    diagnostic's rendered message MUST source the string from this column"),
    `:78`–`:80` (the `column-legend` anchor and the column legend: "normative;
    applies to all four registry tables … *Trigger* is the canonical condition;
    *Spec rule* points to the topic page where the rule is stated; *Hint* gives
    the normative author-facing hint when the spec mandates one"), `:42` (a
    row's *Trigger* prose pins `details` shape normatively — a second normative
    load on the absent column);
    `docs/spec_topics/diagnostics.md` (the cluster hub, whose Contents lists the
    four registry pages and no other registry surface).
  - **The mirror rows, quoted** — `docs/reference/diagnostics.md:116`:
    ``| `theta/parse/par-query-in-body` | E | parse | `` `@` query against the enclosing conversation is not permitted inside a 'par for' body `` |``;
    `:117`:
    ``| `theta/parse/par-shared-mutation` | E | parse | `cannot assign to outer binding '<name>' from inside a 'par for' body` |``;
    `:118`:
    ``| `theta/parse/par-break-continue` | E | parse | `'<keyword>' is not permitted inside a 'par for' body` |``.
    Their neighbours pin the ordering: `:115` `break-with-value`, `:119`
    `illegal-template-escape` — the sharded page's `:69` / `:70` pair. Also
    `:4`–`:8` (the header: verbatim transcription of the four spec pages, the
    *Message* column normative per DIAG-4, and the *Trigger* / *Spec rule* /
    *Hint* omission), `:37` (DIAG-2 restated), `:41` (DIAG-4 restated), `:53`
    (the `theta/parse/*` section), `:55` (the four-column header row
    `| Code | Sev | Phase | Message |` — the column set that makes the mirror
    unable to carry a *Trigger*), `:300`–`:306` (Provenance: the parse table
    "transcribed verbatim" from `code-registry-parse.md`, then the three
    `par-*` codes "originate in `docs/rfcs/0003-parallel-fanout.md` … and are
    registered here for theta 1.1"). 203 distinct codes on the page (R5).
  - **CTRL-4, quoted** — `docs/spec_topics/control-flow.md:76` (anchor
    `ctrl-4`), the only spec-corpus statement of all three triggering
    conditions: "A query against the enclosing conversation (`@`...``) inside the
    body is `theta/parse/par-query-in-body`: a conversation is a linear
    transcript and concurrent `@` queries against it have no defined
    interleaving."; "Outer bindings and the loop variable are readable, but
    assignment to a `let mut` declared outside the body is
    `theta/parse/par-shared-mutation`."; "`break` and `continue` are
    `theta/parse/par-break-continue` (no defined meaning under concurrent
    scheduling)."
  - **The emission sites** (cited by symbol; no byte moves under any
    disposition) — `src/parser/theta-document.ts`, `parseParFor` (`:4160`, whose
    doc comment at `:4157`–`:4158` names all three codes and CTRL-4 as their
    rule); `emitParForBodyDiagnostics` (`:4223`, doc comment `:4216`–`:4218`
    mapping each body shape to its code); `scanParForStmt` (`:4245`) — the
    `reassign` arm pushes `theta/parse/par-shared-mutation` at `:4264`, the
    `break`/`continue` arm pushes `theta/parse/par-break-continue` at `:4280`,
    the `query` arm pushes `theta/parse/par-query-in-body` at `:4309`;
    `scanParForExpr` (`:4337`) — the `query` arm pushes
    `theta/parse/par-query-in-body` at `:4342`. Also
    `src/runtime/statement-executor.ts:1271`, the interpreter comment naming
    `par-break-continue` as the parser-side bar it defends.
  - **The 0194-witness fallback ladder — the measured consequence** —
    `tests/loop-element-withhold-binding-scoped.test.ts:131`–`:137` (the header
    disclosure: the code "has no row on the four sharded spec registry pages
    `parseRegistry` reads, and appears in table form only on the transcription
    page … Disclosed, not chased: that gap is not this file's subject"), `:168`
    (`REGISTRY_PAGE`, the sharded parse page), `:170`–`:172` (the `REGISTRY`
    read), `:174`–`:183` (the doc comment and `TRANSCRIPTION_PAGE`), `:195`–`:203`
    (`registered`, which throws when the sharded page lacks the row),
    `:249`–`:265` (`transcribed`, the ladder: `:250` prefers the sharded oracle
    whenever it carries the row, then a bespoke doubled-backtick regex over the
    mirror, then `:261` a throw naming BOTH pages), `:270` (`PAR_QUERY`), `:311`
    (`PAR_QUERY_MESSAGE = transcribed(PAR_QUERY)` — the only call that reaches
    the mirror rung), `:1182`–`:1189` (cell `e2`, which asserts the rendered
    *Message* in an ordered whole-list comparison). The file is a protected
    witness; §Fix enumerates what may and may not move in it.
  - **The registry tooling that cannot see the mirror** —
    `tools/code-registry/index.js:31`–`:54` (`parseRegistry`, whose `:36` guard
    `cells.length < 5` skips any row with fewer than five cells, so the mirror's
    four-column rows are silently invisible to it), `:74`–`:79`
    (`extractMessage`: the span between the first and last backtick, then
    `\`` → backtick — the decode R7 measures), `:99`+ (`reconcileClosedSet`, the
    DIAG-2 both-directions reconciliation).
  - **The gate that computes the finding and drops it** —
    `tools/closing-gate/live-corpus.js:148`–`:150` (`registryText` assembled from
    the live `docs/spec_topics/diagnostics/` tree), `:51`–`:59`
    (`CANARY_GAP_KINDS`, seven kinds, neither closed-set kind among them),
    `:170`–`:172` (`runWarnOnlyCanary`), `:184` (the filter);
    `tools/closing-gate/index.js:665`–`:666` and `:703` / `:713` (the
    registry-versus-asserted reconciliation both ways);
    `tests/code-registry.test.ts:109` (the `reconcileClosedSet` assertion, run
    against a hand-written two-row registry rather than the corpus);
    `tests/live-corpus-release-gate.test.ts:143` (the release gate asserting
    every live-corpus finding is a `CANARY_GAP_KINDS` member).
  - **The origin in the RFC** — `docs/rfcs/0003-parallel-fanout.md:177`–`:178`
    (§Specification impact: "**Diagnostics.** New parse-error codes registered in
    [Diagnostics](../reference/diagnostics.md)" — the spec-impact clause names
    the reference mirror as the registration home), `:72`, `:85`, `:169`–`:170`
    (the three codes in the RFC's own prose).
- **Observed at:** `0.113.0` (`a7d15562`). Doc-versus-doc and doc-versus-code;
  no live model. Method: `rg` over `docs/spec_topics/`, `docs/reference/`, `src/`,
  `tests/` and `tools/`; two `node -e` passes (stdin only, no file written) — one
  computing the two-way code census through the shipped `parseRegistry`, one
  running the shipped closing-gate machinery over the live corpus; one
  `npx vitest run` of the 0194 witness; read-only `git show` / `git log`.

## Summary

DIAG-2 (`diagnostic-shape.md:72`) closes the diagnostic registry and requires a
new diagnostic site to "land their codes in this table at the same time". The
table is the four sharded `code-registry-*.md` pages, sharded by namespace under
a column legend that is "normative; applies to all four registry tables"
(`:80`), and whose parse page states the four "together enumerate every
diagnostic the V1 spec defines" (`code-registry-parse.md:5`).

Three registered, emitted `theta/parse/*` codes have no row on any of the four:
`par-query-in-body`, `par-shared-mutation`, `par-break-continue` — CTRL-4's
`par for` body restrictions. `rg` over `docs/spec_topics/diagnostics/` returns
nothing for all three; the only spec-corpus mention of any of them is
`control-flow.md:76` (R1).

The count is exact. The four pages carry 201 distinct codes; the reference
mirror carries 203. The mirror-only residue is precisely these three, and the
sharded-only residue is one unrelated row (R5). The three codes' *Code* / *Sev* /
*Phase* / *Message* cells therefore exist, in the mirror, at `:116`–`:118`, in
the same row order the sharded page uses for their neighbours — the gap sits
between `code-registry-parse.md:69` and `:70`.

The absent columns are the load-bearing ones. The mirror carries four columns by
design and says so: "The full *Trigger* / *Spec rule* / *Hint* columns live on
the spec registry pages and are not restated here to avoid drift"
(`docs/reference/diagnostics.md:8`). Those pages have no row. So for these three
codes the *Trigger* — which the column legend calls "the canonical condition"
(`diagnostic-shape.md:80`) — exists nowhere in table form, and their triggering
conditions are recoverable only from CTRL-4's prose paragraph.

The two artifacts also disagree about the registration home. The mirror's header
calls the page a verbatim transcription of the four spec pages (`:4`–`:6`); its
Provenance says these three codes "are registered here for theta 1.1"
(`:304`–`:306`). Both cannot hold. The RFC that introduced them made the same
assignment: "New parse-error codes registered in
[Diagnostics](../reference/diagnostics.md)" (`0003-parallel-fanout.md:177`–`:178`).

The consequence is measured, not hypothetical. Bug 0194's witness needs
`par-query-in-body`'s normative *Message* for one cell. DIAG-4 requires it to
source the string from the registry; the registry has no row; so the file
carries a second reader for the mirror and a two-rung ladder that throws naming
both pages (R6). It is green at HEAD only because of that fallback.

Nothing in the tree reports the gap. The shipped closing-gate machinery does
compute it — `asserted-code-not-in-registry` fires for all three codes when run
over the live corpus — and then discards it: the kind is not in
`CANARY_GAP_KINDS`, so the warn-only canary surfaces zero findings of it (R8).

## Reproduction

Doc-versus-doc and doc-versus-code at HEAD `a7d15562` (0.113.0). Every command
was run from the repository root; output is transcribed verbatim.

**R1 — no row on any of the four sharded pages.**

```console
$ rg -n 'par-query-in-body|par-shared-mutation|par-break-continue' docs/spec_topics/diagnostics/
$ echo $?
1
```

No match on `code-registry-parse.md`, `code-registry-load.md`,
`code-registry-runtime.md`, `code-registry-host.md`, `diagnostic-shape.md`, or
either `placeholder-rendering-*.md`. Widening to the whole spec corpus finds one
file:

```console
$ rg -c 'par-query-in-body|par-shared-mutation|par-break-continue' docs/spec_topics/
docs/spec_topics/control-flow.md:1
```

One line — CTRL-4 (R3).

**R2 — the three rows are tabulated in the reference mirror.**

```console
$ rg -n 'par-query-in-body|par-shared-mutation|par-break-continue' docs/reference/diagnostics.md
116:| `theta/parse/par-query-in-body` | E | parse | `` `@` query against the enclosing conversation is not permitted inside a 'par for' body `` |
117:| `theta/parse/par-shared-mutation` | E | parse | `cannot assign to outer binding '<name>' from inside a 'par for' body` |
118:| `theta/parse/par-break-continue` | E | parse | `'<keyword>' is not permitted inside a 'par for' body` |
304:- The three `theta/parse/par-*` codes (`par-query-in-body`, `par-shared-mutation`,
305:  `par-break-continue`) originate in `docs/rfcs/0003-parallel-fanout.md` (accepted;
```

The rows sit in a four-column table (`:55`, `| Code | Sev | Phase | Message |`)
whose header states the *Trigger* / *Spec rule* / *Hint* columns "live on the
spec registry pages and are not restated here to avoid drift" (`:8`). The
neighbouring rows pin the insertion position: `:115` is `break-with-value` and
`:119` is `illegal-template-escape`, which on the sharded page are `:69` and
`:70` — adjacent, with nothing between them.

**R3 — the codes are stated in CTRL-4 prose.** `control-flow.md:76`, three
clauses of one paragraph:

> A query against the enclosing conversation (`@`...``) inside the body is
> `theta/parse/par-query-in-body`: a conversation is a linear transcript and
> concurrent `@` queries against it have no defined interleaving.

> Outer bindings and the loop variable are readable, but assignment to a
> `let mut` declared outside the body is `theta/parse/par-shared-mutation`.

> `break` and `continue` are `theta/parse/par-break-continue` (no defined
> meaning under concurrent scheduling).

This is the whole spec-corpus statement of the three triggering conditions.

**R4 — the codes are emitted.** Cited by symbol:

```console
$ rg -n 'par-query-in-body|par-shared-mutation|par-break-continue' src/
src/parser/theta-document.ts:4157:   * (`par-query-in-body` / `par-shared-mutation` / `par-break-continue`,
src/parser/theta-document.ts:4216:   *   - an `@`-query against the enclosing conversation → `par-query-in-body`;
src/parser/theta-document.ts:4217:   *   - a reassignment to an outer `let mut` binding → `par-shared-mutation`;
src/parser/theta-document.ts:4218:   *   - a `break` / `continue` targeting the `par for` → `par-break-continue`.
src/parser/theta-document.ts:4264:            code: "theta/parse/par-shared-mutation",
src/parser/theta-document.ts:4280:            code: "theta/parse/par-break-continue",
src/parser/theta-document.ts:4309:          code: "theta/parse/par-query-in-body",
src/parser/theta-document.ts:4342:          code: "theta/parse/par-query-in-body",
src/runtime/statement-executor.ts:1271:      // Barred by the parser (par-break-continue); defensively a no-value Ok.
```

The four emission sites sit in `scanParForStmt` (`:4245` — the `reassign`,
`break`/`continue` and `query` arms) and `scanParForExpr` (`:4337` — the `query`
arm), both reached from `emitParForBodyDiagnostics` (`:4223`), itself called from
`parseParFor` (`:4160`). Each pushes `severity: "error"` with a `message` equal
to the mirror's *Message* template with its placeholder interpolated.

**R5 — the two-way census.** Run through the shipped `parseRegistry` (stdin
only, no file created):

```console
$ node -e "…parseRegistry over the four sharded pages; regex over the mirror…"
sharded distinct codes: 201
mirror distinct codes: 203
mirror-only: ["theta/parse/par-query-in-body","theta/parse/par-shared-mutation","theta/parse/par-break-continue"]
sharded-only: ["theta/runtime/non-object-receiver"]
```

The mirror-only residue is exactly the three codes. The one sharded-only row is
a separate, opposite-direction mirror-completeness residue already recorded
elsewhere (§Non-goals).

**R6 — the measured consequence: the 0194 witness's fallback ladder.**
`tests/loop-element-withhold-binding-scoped.test.ts` asserts cell `e2`'s
rendered *Message* for `par-query-in-body` (`:1182`–`:1189`) and sources it
through `transcribed` (`:249`–`:265`) rather than the file's primary
`registered` oracle (`:195`–`:203`), because the latter throws when the sharded
page lacks the row. The ladder prefers the sharded oracle (`:250`), falls back to
a bespoke doubled-backtick regex over `docs/reference/diagnostics.md`, and
throws naming both pages when neither carries the code (`:261`). Its header
records why (`:131`–`:137`):

> One code group (e) needs — CTRL-4's `theta/parse/par-query-in-body` — has no
> row on the four sharded spec registry pages `parseRegistry` reads, and appears
> in table form only on the transcription page whose own header declares that
> column normative under the same DIAG-4 … Disclosed, not chased: that gap is
> not this file's subject.

The file is green at HEAD, through the fallback rung:

```console
$ npx vitest run tests/loop-element-withhold-binding-scoped.test.ts
 ✓ tests/loop-element-withhold-binding-scoped.test.ts (30 tests) 35ms

 Test Files  1 passed (1)
      Tests  30 passed (30)
```

The mirror is unreadable by the shipped registry parser, which is why the second
reader exists: `parseRegistry` skips any table row with fewer than five cells
(`tools/code-registry/index.js:36`) and the mirror's rows have four.

**R7 — the *Message* cell spelling is a fix constraint, measured.** The mirror
spells `par-query-in-body`'s *Message* with the doubled-backtick GFM form
because the message embeds a code span. Transplanting that cell onto a sharded
row mis-extracts: `extractMessage` takes the span between the first and last
backtick (`tools/code-registry/index.js:74`–`:79`), so the doubled form yields a
string carrying an extra leading and trailing backtick-plus-space, and the byte
comparison against the mirror fails:

```console
$ node -e "…parseRegistry over one synthetic seven-column row, doubled-backtick Message cell…"
message: "` `@` query against the enclosing conversation is not permitted inside a 'par for' body `"
mirror cell: "`@` query against the enclosing conversation is not permitted inside a 'par for' body"
bytes equal: false
```

Since `transcribed` prefers the sharded row once one exists (`:250`), a row
spelled that way would red the witness. The sharded convention for a *Message*
embedding a code span is an outer single-backtick span with each inner delimiter
written as the table-cell escape `` \` `` — the spelling
`theta/parse/empty-query-annotation` (`code-registry-parse.md:75`) already uses.
That form round-trips exactly:

```console
$ node -e "…same row, escaped-span Message cell…"
BYTES EQUAL: true
```

**R8 — the gate computes the finding and discards it.** The shipped
closing-gate machinery assembles a live-corpus snapshot whose `registryText` is
the real `docs/spec_topics/diagnostics/` tree and whose `testSources` is the
real `tests/` tree (`tools/closing-gate/live-corpus.js:148`–`:150`):

```console
$ node -e "…assembleLiveCorpus + runClosingGate + warnOnlyFindings…"
asserted-code-not-in-registry total: 96
par-* among them: ["theta/parse/par-query-in-body","theta/parse/par-","theta/parse/par-shared-mutation","theta/parse/par-break-continue"]
warn-only survivors of that kind: 0
CANARY_GAP_KINDS has it: false
```

All three codes are reported by the DIAG-2 reconciliation and none survives the
warn-only filter. Two qualifications, both measured: the kind is coarse — 96
subjects, including the regex artefact `theta/parse/par-` from prose — so it is
not a usable gate as it stands; and `tests/code-registry.test.ts:109` exercises
`reconcileClosedSet` against a hand-written two-row registry, not the corpus, so
no test observes the corpus-level result either.

**R9 — history: the rows were never on a spec registry page.** Read-only
`git show`. The commit that added `par for` to the spec corpus touched the
mirror and CTRL-4, and no spec-corpus diagnostics page:

```console
$ git show 52d8a3c1 --stat | grep -E 'diagnostics|control-flow|files changed'
 docs/reference/diagnostics.md                      |  8 ++++-
 docs/spec_topics/control-flow.md                   | 22 +++++++++++++
 8 files changed, 128 insertions(+), 12 deletions(-)
```

Those eight mirror lines are the three rows, the Provenance note, and the
version bump of the page's own header. The registry was still monolithic then;
immediately before the sharding commit it carried none of the three:

```console
$ git show f5e89f4f^:docs/spec_topics/diagnostics.md | grep -c 'par-query-in-body'
0
```

So the rows were not lost in the shard: they were never written to the spec
registry.

## Expected behaviour

- **Every registered code has a row on exactly one sharded page.** DIAG-1
  (`diagnostic-shape.md:71`) requires every emitted diagnostic to carry a code
  "from the registry below"; DIAG-2 (`:72`) closes that registry and requires new
  sites to land their rows in the same commit. Three emitted codes with no row
  satisfy neither.
- **The four pages enumerate what they claim to enumerate.**
  `code-registry-parse.md:5` states the four tables "together enumerate every
  diagnostic the V1 spec defines". R5 makes that false by three.
- **Each row carries the full column set.** The column legend is "normative;
  applies to all four registry tables" and defines *Trigger* as "the canonical
  condition", *Spec rule* as the pointer to the owning topic page, and *Hint* as
  the normative author-facing hint (`diagnostic-shape.md:80`). A code whose row
  does not exist has no canonical condition in table form; a second
  implementation must reconstruct all three triggers from one CTRL-4 paragraph.
- **A DIAG-4 witness resolves a *Message* from the normative pages without a
  fallback.** DIAG-4 (`:74`) requires tests to "source the string from this
  column". `tests/loop-element-withhold-binding-scoped.test.ts` cannot, for one
  code, and carries a second page reader and a two-rung ladder to compensate
  (R6). With the rows in place the ladder's first rung answers and the second
  becomes unreachable.
- **One page is the registration home, and both artifacts say the same one.**
  The mirror's header calls itself a verbatim transcription of the four spec
  pages (`docs/reference/diagnostics.md:4`–`:6`) and its Provenance calls itself
  the place these three codes "are registered" (`:304`–`:306`). Exactly one of
  those descriptions can be true of the page.

## Actual behaviour / root cause

1. **The rows were written to the mirror instead of the registry, in the
   commit that introduced the codes.** R9. `52d8a3c1` ("spec: add par for
   (RFC 0003) to spec corpus; bump theta language 1.0->1.1") added the three
   rows and their Provenance note to `docs/reference/diagnostics.md`, added
   CTRL-4 to `docs/spec_topics/control-flow.md`, and left the then-monolithic
   `docs/spec_topics/diagnostics.md` untouched. This is not sharding drift: at
   `f5e89f4f^`, the last commit before the four-page split, the monolithic page
   carried zero occurrences of `par-query-in-body`.
2. **The RFC's own spec-impact clause named the mirror as the registration
   home.** `docs/rfcs/0003-parallel-fanout.md:177`–`:178`: "**Diagnostics.** New
   parse-error codes registered in [Diagnostics](../reference/diagnostics.md)."
   The implementing commit followed that instruction literally. The mirror's
   Provenance note then recorded the same assignment in the corpus
   (`docs/reference/diagnostics.md:304`–`:306`), which is why the gap reads as
   deliberate at the mirror and as an omission at the registry.
3. **The absent columns were never authored anywhere.** Because the mirror is a
   four-column transcription by design (`:8`), no *Trigger*, *Spec rule* or
   *Hint* text was ever written for these three codes. CTRL-4's prose carries
   the conditions; nothing carries a *Hint*, and the emitting sites supply none.
4. **Nothing detects the gap.** R8. The reconciliation exists and runs over the
   live corpus, but `asserted-code-not-in-registry` is outside
   `CANARY_GAP_KINDS` (`tools/closing-gate/live-corpus.js:51`–`:59`), so the
   warn-only canary drops it, and the release gate asserts only that surviving
   findings are members of that set (`tests/live-corpus-release-gate.test.ts:143`).
   The unit test for the same function uses a synthetic registry
   (`tests/code-registry.test.ts:109`). The mirror is additionally invisible to
   `parseRegistry` (four cells against a five-cell floor,
   `tools/code-registry/index.js:36`), so no tool compares the two artifacts.

Root cause: the code addition followed the RFC's spec-impact pointer to the
reference mirror rather than DIAG-2's "this table", and the only automated check
that would have caught it is computed and then filtered out of the surfaced
set. DIAG-2's same-commit discipline was met in form — the codes did land a
table in the introducing commit — but the table was the transcription, not the
registry it transcribes.

## Why it matters

- **The closed-registry claim is false by counting.** DIAG-2 is the rule the
  diagnostics cluster's closure rests on, and `code-registry-parse.md:5` states
  the four pages enumerate every diagnostic the spec defines. A contributor who
  trusts either statement — or a tool that reads the four pages as the code set,
  which `parseRegistry` is written to be — is wrong about three shipped
  `E`-severity parse codes.
- **DIAG-4 witnesses need per-witness fallbacks.** DIAG-4 tells a test to source
  its expected string from the registry column. For these three codes that
  instruction cannot be followed, and the one committed witness that needs it
  pays with a second page reader, a bespoke doubled-backtick regex, and a
  two-page throw message (R6). Every future witness on `par-shared-mutation` or
  `par-break-continue` faces the same choice.
- **The canonical triggering conditions exist in no table.** *Trigger* is
  normative (`diagnostic-shape.md:80`) and elsewhere load-bearing: `:42` makes a
  row's *Trigger* prose the normative pin for that row's `details` payload
  shape. For these three codes there is no *Trigger* cell to carry any of that,
  and the conditions must be read out of one dense CTRL-4 paragraph that also
  covers PIC-64 dispatch, mode legality and side-effect ordering.
- **The two artifacts assign the registration home differently, and one of them
  is the file the other calls a transcription.** A reader resolving where to add
  the next `par for` code gets the mirror's Provenance pointing at the mirror and
  DIAG-2 pointing at the shards.
- **The reconciliation that would catch it is disabled by category.** The
  machinery is shipped, wired to the live corpus, and green — because the kind
  that reports this class is filtered out before anything is surfaced (R8). The
  same filter hides any future missing row.

## Fix

Not settled here. The row content is derivable and the mirror already agrees on
every stable-contract column, so the open question is narrow: which sharded page
hosts the rows, and what the three absent cells say. The constraints below hold
under any disposition.

**Constraint 1 — the namespace fixes the family; the page is still an
adjudication.** The registry is sharded by namespace (`diagnostic-shape.md:80`)
and all three codes are `theta/parse/*`, so `code-registry-parse.md` is the only
namespace-consistent host, at the position the mirror's row order already fixes:
between `:69` (`break-with-value`) and `:70` (`illegal-template-escape`). What
must be adjudicated is whether that page absorbs them: it is the largest of the
four (55,564 bytes, 113 rows) and the sharding that created it was performed by
`f5e89f4f`, "docs: enforce 100KB hard / 30KB recommended size cap on spec set".
Three rows keep it under the hard cap and further past the recommended one. A
disposition that instead splits the parse page must say so, because the four-page
enumeration is cited by name in `code-registry-parse.md:5`,
`diagnostic-shape.md:80`, `docs/spec_topics/diagnostics.md`, the mirror's
Provenance, and `tests/code-registry.test.ts:44`–`:47`.

**Constraint 2 — *Trigger* / *Spec rule* / *Hint* are derived from CTRL-4, not
minted.** CTRL-4 (`control-flow.md:76`) is the only statement of the three
conditions (R3) and *Spec rule* is defined as the pointer to "the topic page
where the rule is stated" (`diagnostic-shape.md:80`), so each row's *Spec rule*
cell points at `../control-flow.md#ctrl-4` — the anchor exists. Each *Trigger*
restates that code's clause and adds no condition the prose does not carry: the
parser's scan is narrower than a naive reading in ways CTRL-4 already implies and
the implementation fixes — `par-shared-mutation` fires only for an outer mutable
not shadowed by a body-local (`:4264`), `par-break-continue` only when the
`break`/`continue` targets the `par for` itself rather than a loop nested in the
body (`:4280`), and a nested `par for` emits its own diagnostics rather than
being re-scanned by the enclosing one (`:4216`–`:4222`). Whether those details
belong in *Trigger* is an authoring decision; inventing a condition absent from
both CTRL-4 and the parser is not available. *Hint* has no source text; `—` is
the corpus's form for a row the spec mandates no hint for (e.g.
`code-registry-parse.md:67`–`:69`).

**Constraint 3 — DIAG-2 same-commit discipline.** DIAG-2 (`:72`) makes a
registry change a spec change and requires codes to land their rows with the
sites. The rows land in one commit together with the reconciliation of the
statements that currently point elsewhere: the mirror's Provenance note
(`docs/reference/diagnostics.md:304`–`:306`, which says the codes "are
registered here"). Whether the RFC's own spec-impact clause
(`0003-parallel-fanout.md:177`–`:178`) is corrected or left as accepted-RFC
history is a call the disposition states rather than leaves to inference.

**Constraint 4 — the mirror's own columns need no edit, and its column set
cannot carry the fix.** The mirror's *Code* / *Sev* / *Phase* / *Message* cells
for all three rows (`:116`–`:118`) already match what the implementation emits
(R2, R4), so the transcription is correct as far as it goes and no *Message* byte
moves — DIAG-4's theta-2.0 deferral of wording changes is not engaged. The
mirror carries four columns by design (`:8`, `:55`), so it cannot host the
absent columns; adding them there would contradict its stated no-drift posture.

**Constraint 5 — the *Message* cell must round-trip through the registry
parser.** R7 is a measurement, not a preference: the mirror's doubled-backtick
spelling of `par-query-in-body`'s *Message* mis-extracts under
`extractMessage` (`tools/code-registry/index.js:74`–`:79`) and would red the
0194 witness the moment a sharded row exists, because `transcribed` prefers the
sharded rung (`:250`). The row uses the outer single-backtick span with `` \` ``
escapes that `theta/parse/empty-query-annotation`
(`code-registry-parse.md:75`) already uses; that form was measured
byte-identical to the mirror's cell. `par-shared-mutation` and
`par-break-continue` embed no code span and need no escaping.

**Constraint 6 — the 0194 witness is a protected file, and the fix needs no
edit to it.** `tests/loop-element-withhold-binding-scoped.test.ts` belongs to
bug 0194 and stays green with zero changes: `transcribed` already prefers the
sharded oracle, so the new row is picked up automatically (this is the file's
stated intent at `:243`–`:245` — "The sharded oracle wins whenever it carries the
row, so the day CTRL-4's rows land on a spec registry page this reader stops
being consulted"). What becomes *available* is simplification, and it flips only
under this report's authority: retiring `TRANSCRIPTION_PAGE` /
`TRANSCRIPTION_TEXT` (`:174`–`:188`) and `transcribed` (`:249`–`:265`), routing
`:311` through the primary `registered` / `fill` path, and deleting the header
disclosure at `:131`–`:137`. A fix may also leave all of it in place; the
verification obligation is the same either way — the file green, cell `e2` still
asserting the same rendered bytes. Do not delete the cell or weaken its ordered
whole-list assertion.

**Constraint 7 — a detecting gate is optional and, as it stands, not usable.**
R8 shows the reconciliation already reports all three codes over the live
corpus, so a disposition may close the loop by adding
`asserted-code-not-in-registry` to `CANARY_GAP_KINDS`
(`tools/closing-gate/live-corpus.js:51`–`:59`). Measured caveat: that kind
currently yields 96 subjects including regex artefacts from prose
(`theta/parse/par-`), so enabling it as-is turns the canary noisy rather than
sharp. Tightening `extractAssertedCodes` is a separate subject and is not
required to close this report.

**Verification the fix records.** Re-run R1 (now three hits on
`code-registry-parse.md`), R5 (both censuses agree except the one unrelated
sharded-only row), and R7's round-trip (the new cell's extracted *Message*
byte-identical to the mirror's); confirm
`tests/loop-element-withhold-binding-scoped.test.ts` green with cell `e2`
asserting unchanged bytes; confirm `git diff -- src/` empty; default suite,
`npm run lint` and `npm run typecheck` green.

## Non-goals

- **The three codes' behaviour and triggering conditions.** Correct at HEAD. All
  three fire from the parser's `par for` body scan (R4), and their rendered
  messages match the mirror's normative *Message* templates. This report adds no
  condition, removes none, and proposes no severity or phase change — `E` /
  `parse` for all three, as the mirror already records.
- **CTRL-4's own prose.** The paragraph states all three conditions
  (`control-flow.md:76`) and is the source the *Trigger* cells derive from. Its
  wording, its PIC-64 dispatch clause and its mode-legality clause are out of
  scope.
- **0189's subject.** [0189](./0189-registry-placeholders-outside-closed-categories.md)
  measures the *Message* column's placeholder vocabulary against
  `placeholder-rendering-a.md`'s closure. Its nine rows are a different set from
  these three, and its remedy edits the placeholder pages, not the row set. The
  two overlap only in family. The `<name>` and `<keyword>` placeholders these
  rows carry are category-5 identifier placeholders and are not among 0189's
  unadmitted tokens.
- **`theta/runtime/non-object-receiver`'s absence from the mirror.** R5's
  opposite-direction residue: the sharded registry has the row and
  `docs/reference/diagnostics.md` does not, against a Provenance claiming
  verbatim transcription. That is a mirror-completeness defect on a different
  row and in the opposite direction, recorded as measured-and-unfiled by 0189
  §Non-goals. Out of scope here; called out so a fix sweeping either artifact
  does not assume row-for-row parity in both directions.
- **The stale `path:line` citations into `src/parser/theta-document.ts` in bug
  0118.** `0118:652` and `:660` cite the `par for` scan at `:4032`–`:4046`,
  `:4066`–`:4075` and `:4099`–`:4108`; the sites are at `:4264`, `:4280`, `:4309`
  and `:4342` at HEAD. That is bug 0134's class, in another report's document,
  and no in-scope edit here reaches it.
- **Tightening the closing gate's asserted-code extraction.** Constraint 7's
  caveat. `extractAssertedCodes` (`tools/closing-gate/index.js`) matches any
  `theta/...` occurrence in a test source, including prose and truncated
  fragments; making the kind gate-worthy is a separate subject.

## Provenance

- **Origin:** the bug 0194 fix run (commit `a7d15562`, v0.113.0).
  `.pi/tmp/fixes/0194-report.md` §Residuals item 3, verbatim: "**Three
  `theta/parse/*` codes have no row on the four sharded spec registry pages** —
  `par-query-in-body`, `par-shared-mutation`, `par-break-continue` — all stated
  in `control-flow.md` prose under CTRL-4 and all tabulated in
  `docs/reference/diagnostics.md`. Cell `e2` needs `par-query-in-body`'s
  *Message*, so the witness reads the sharded pages first and falls back to
  `docs/reference/diagnostics.md` (whose header declares that column normative
  under DIAG-4), throwing loudly and naming both pages when neither carries the
  code. Pre-existing gap, disclosed, no `docs/` file touched." That run recorded
  the gap and declined to chase it; this report is the filing. Every element of
  the residual was re-measured here, and R5, R7, R8 and R9 are additions to it:
  the census that bounds the gap at exactly three codes, the *Message*-cell
  round-trip constraint, the disabled gate, and the history showing the rows
  were never on a spec registry page.
- **The closed registry:** `docs/spec_topics/diagnostics/diagnostic-shape.md:42`
  (*Trigger* prose pins `details` shape), `:71` (DIAG-1), `:72` (DIAG-2), `:74`
  (DIAG-4), `:78` (the `column-legend` anchor), `:80` (the column legend and the
  four-page sharding);
  `docs/spec_topics/diagnostics/code-registry-parse.md:5` (the four-page
  completeness claim), `:66`–`:69` (the loop and `break` rows), `:70`
  (`illegal-template-escape`), `:75` (`empty-query-annotation`, the escaped
  *Message* precedent); `docs/spec_topics/diagnostics/code-registry-load.md`,
  `code-registry-runtime.md`, `code-registry-host.md` (the other three shards);
  `docs/spec_topics/diagnostics.md` (the cluster hub Contents).
- **The mirror:** `docs/reference/diagnostics.md:4`–`:8` (the transcription
  claim, the DIAG-4 *Message* claim, the *Trigger* / *Spec rule* / *Hint*
  omission), `:37` (DIAG-2 restated), `:41` (DIAG-4 restated), `:53`, `:55` (the
  four-column header), `:115`–`:119` (the three rows and their neighbours),
  `:300`–`:306` (Provenance and the "registered here for theta 1.1" note).
- **The rule's prose home:** `docs/spec_topics/control-flow.md:76` (CTRL-4,
  anchor `ctrl-4`).
- **The implementation:** `src/parser/theta-document.ts` — `parseParFor`
  (`:4160`, doc `:4157`), `emitParForBodyDiagnostics` (`:4223`, doc
  `:4216`–`:4218`), `scanParForStmt` (`:4245`; emissions at `:4264`, `:4280`,
  `:4309`), `scanParForExpr` (`:4337`; emission at `:4342`);
  `src/runtime/statement-executor.ts:1271`.
- **The witness and the tooling:**
  `tests/loop-element-withhold-binding-scoped.test.ts:131`–`:137`, `:168`,
  `:170`–`:172`, `:174`–`:188`, `:195`–`:203`, `:243`–`:245`, `:249`–`:265`,
  `:270`, `:311`, `:1182`–`:1189`; `tools/code-registry/index.js:31`–`:54`
  (`parseRegistry`, `:36` the five-cell floor), `:74`–`:79` (`extractMessage`),
  `:99`+ (`reconcileClosedSet`); `tests/code-registry.test.ts:44`–`:47` (the
  four-page list), `:109` (the synthetic-registry reconciliation);
  `tools/closing-gate/index.js:665`–`:666`, `:703`, `:713`;
  `tools/closing-gate/live-corpus.js:51`–`:59`, `:148`–`:150`, `:170`–`:172`,
  `:184`; `tests/live-corpus-release-gate.test.ts:143`.
- **The origin in the RFC:** `docs/rfcs/0003-parallel-fanout.md:72`, `:85`,
  `:169`–`:170`, `:177`–`:178`.
- **History** (read-only `git show` / `git log`):
  `git log --oneline -S 'par-query-in-body' -- docs/` → seven commits, none of
  them touching a `docs/spec_topics/diagnostics` path: `2f2a7768` (RFC 0003
  added), `ce10adc1` (RFC accepted), `52d8a3c1` (spec corpus, theta 1.0→1.1),
  `5fff41de` (how-to and examples), `bb5206a6` (bugs 0114–0118), `552b4ace`
  (bugs 0122–0124), `a7d15562` (the 0194 fix);
  `git show 52d8a3c1 --stat` → `docs/reference/diagnostics.md` +8,
  `docs/spec_topics/control-flow.md` +22;
  `git show f5e89f4f^:docs/spec_topics/diagnostics.md | grep -c 'par-query-in-body'`
  → `0`, so the pre-sharding monolithic page never carried the rows;
  `git log --format='%s' -1 f5e89f4f` → "docs: enforce 100KB hard / 30KB
  recommended size cap on spec set", the sharding commit whose cap Constraint 1
  prices.
- **Verification at HEAD `a7d15562` (0.113.0):** every citation above read from
  the tree. R1–R4 and R9 are `rg` / `git` invocations transcribed with their
  output. R5, R7 and R8 are `node -e` passes over stdin — the first two through
  the shipped `tools/code-registry/index.js`, the third through the shipped
  `tools/closing-gate/` machinery — with no file written to the tree. R6 is one
  `npx vitest run`. No file in the tree was created or modified other than this
  report.

## Coordination note from bug 0189's fix

[0189](./0189-registry-placeholders-outside-closed-categories.md)'s fix settled
the closure-versus-registry adjudication on
`docs/spec_topics/diagnostics/placeholder-rendering-a.md` and, in doing so, added
a same-commit obligation that reaches any future fix landing a registry row: a
row that introduces a `<…>` **placeholder** MUST land that placeholder's category
assignment or admission clause in the placeholder-rendering subsection's category
lists and closure clauses in the same commit as the row — DIAG-2's discipline
extended to the placeholder vocabulary.

That obligation is **discharged in advance for the three `theta/parse/par-*`
rows**. Their *Message* templates interpolate exactly two placeholders,
`<name>` and `<keyword>`, and both are already enumerated on category 5's
*Placeholders* line, so sharding the rows into `code-registry-parse.md` admits no
new placeholder and requires no placeholder-rendering edit. Recorded so a fix for
this report does not have to re-derive it.
