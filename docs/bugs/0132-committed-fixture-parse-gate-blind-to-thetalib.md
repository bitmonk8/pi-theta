# Bug 0132 — The committed-fixture parse gate's walk filters `entry.name.endsWith(".theta")`, so neither committed `.thetalib` is lexed or parsed by any offline test: two independent fixes (0095, 0079) delegated a corpus-wide "no shipped source moves" claim to this gate and each discharged the `.thetalib` half in a scratch probe it then deleted; and the same walk takes its corpus from the working tree rather than the index, so its own vacuity guard requires the gitignored `.pi/theta/smoke.theta` to be present and a scratch `.theta` dropped anywhere under `.pi/` reds the gate

- **Status:** open. §Fix states one approach and pins the constraints; one axis
  is left to the run — whether the corpus becomes `git ls-files` or stays a
  working-tree walk — because that choice decides the disposition of defect 2
  and rewrites the vacuity guard. Measured here so the choice is not blind: both
  committed `.thetalib` files parse to `[]` at HEAD, so extending the filter adds
  two green cells and reds nothing. No ordering dependency on another report.
- **Sev/Diff estimate:** S3/D2 — a shipped gate that cannot red for part of the
  corpus its own header claims ("every committed `.theta` the repository ships",
  `tests/committed-fixture-parse-gate.test.ts:11`), with two fix records already
  routing around it; D2 because the fix is one test file, no new registered code
  and no spec edit, over one bounded in-run choice of corpus source.
- **Kind:** verification gap — test infrastructure, one test file, two defects in
  it (two-defect report per the bug-0002/0023/0030 precedent).
  1. **Extension blindness.** The walk's leaf filter is
     `entry.name.endsWith(".theta")`
     (`tests/committed-fixture-parse-gate.test.ts:55`), so the two committed
     `.thetalib` files never enter the shipped set and the gate cannot red on
     either. `.thetalib` goes through the same lexer and the same whole-file
     parser as `.theta` — `lexTheta` (`src/lexer/lexer.ts:92`, doc comment at
     `:80`: "Lex a single `.theta` / `.thetalib` source") and
     `parseThetaDocument` (`src/parser/theta-document.ts:758`, doc comment at
     `:748`) — so a lowering or capture change can move a shipped library's
     parse with nothing red.
  2. **Corpus taken from the working tree, not the index.** `discoverShippedFixtures`
     walks `REPO_ROOT` (`:66–71`) with `SKIP_DIRS` = `node_modules`, `.git`,
     `dist`, `coverage`, `h7b-invalid` (`:38–44`). `.pi/` is not skipped and
     `.gitignore:26` ignores it, so the gate's corpus includes gitignored files.
     Measured both directions below: the guard at `:111–113` *requires* the
     untracked `.pi/theta/smoke.theta` to exist, and an unrelated scratch
     `.theta` under `.pi/tmp/` becomes a gate cell and reds it.
- **Related:**
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) — **fixed
    (0.74.0)**, the filing origin. Its §Affected calls this gate "the gate
    requiring zero diagnostics from every committed `.theta` / `.thetalib`"
    (`:142–143`) and its §Fix delegates the blast-radius proof to it: "No
    committed `.theta` / `.thetalib` and no file under `docs/examples/` carries a
    `}` followed by a `|`, so `tests/committed-fixture-parse-gate.test.ts` cannot
    witness a change and no shipped example moves" (`:603–606`), with the
    demonstration specified as "re-parsing all 35 committed `.theta` /
    `.thetalib` files" (`:614`). The fix record filed the correction this report
    is built on: "§Fix delegates the blast-radius proof to
    `tests/committed-fixture-parse-gate.test.ts`, but that walk filters
    `entry.name.endsWith(".theta")`, so it **cannot witness either committed
    `.thetalib`**; the oracle written for this fix covers both extensions"
    (`:764–768`). The oracle is a separate probe, not the gate.
  - [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md) —
    **fixed (0.69.0)**, the same routing-around five minors earlier. Its shipped
    §Fix record states the corpus claim with no in-tree witness for the
    `.thetalib` half: "every shipped `.theta` and `.thetalib` in the tree parses
    free of this code, so `theta/parse/interpolated-result` is not reachable from
    any shipped fixture and `tests/fixtures/h7a/permitted-codes.json` is
    deliberately unchanged" (`:141–145`). Its fix report names the workaround:
    "`tests/committed-fixture-parse-gate.test.ts` covers the 32 `.theta`; a
    deleted scratch probe extended the same walk to the two `.thetalib`"
    (`.pi/tmp/fixes/0079-report.md:133–138`, under gitignored `.pi/` — the
    durable citation is the bug doc's own text above). **Two independent fixes,
    same gate, same gap, same throwaway remedy.** That repetition, not either
    fix on its own, is what makes this a filed defect rather than an artefact of
    one run: the obligation both records discharge is corpus-wide, the gate that
    is supposed to hold it covers part of the corpus, and each orchestrator paid
    for the rest privately and then deleted the receipt.
  - [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md) — **open**, the
    nearest class sibling and the same S3/D2 shape: a shipped witness that reds
    on one spelling of the drift and not on the class. It differs in *why* the
    gate is short. 0107's cells score the right corpus (one function's body) with
    an assertion too weak to catch the class — a blacklist of two byte sequences.
    This gate's assertion is exactly right (`expect(diagnostics).toEqual([])`,
    `:122`) and is applied to a corpus that is short by two files and long by an
    unbounded number of untracked ones. Weakening the assertion is 0107's defect;
    mis-scoping the input set is this one's. Neither owns the other, and the two
    fixes touch disjoint files.
  - [0047](./0047-h9a-code-gate-blind-to-host-namespace.md) — **open**, the
    closest structural analogue: an extraction alternation naming three of four
    registered namespaces, so `theta/host/*` codes never enter the filtered set
    and a committed permission for one changes no outcome. Same failure mode one
    level up (a filter that silently excludes part of its stated domain), on a
    different axis — 0047's filter excludes a *diagnostic namespace* from a live
    stream, this one excludes a *file extension* from an offline corpus. Neither
    subsumes the other: 0047's fix edits
    `tests/live/acceptance/harness.ts:463–466`, this one edits
    `tests/committed-fixture-parse-gate.test.ts`. If both land, the pair closes
    the two halves of "a gate whose domain is narrower than the claim it
    discharges".
  - [0048](./0048-double-session-start-live-vacuous-quiesce-witness.md) —
    **open**, the precedent that a shipped assertion which cannot red on the
    condition it claims to guard is tracked as a bug in this repo rather than
    tolerated, filed against `AGENTS.md:113` ("A live assertion that cannot red
    is worthless").
  - [0030](./0030-h9a-stderr-gate-gap-and-stale-intended-red-header.md) —
    **fixed (0.35.0)**, bears on the class and not on the code. It is the
    two-defect-report precedent for a gate gap in test infrastructure, and it
    closed a *live* gate gap (no assertion scored theta-owned stderr-line
    presence). Different mechanism, different suite, no shared file; cited for
    the report shape only.
- **Affected** (every citation verified at HEAD `76dfde5c`, 0.74.0):
  - `tests/committed-fixture-parse-gate.test.ts:55` — **defect 1**, the whole of
    it: `} else if (entry.isFile() && entry.name.endsWith(".theta")) {`. The
    enclosing `walkThetaFiles` is `:50–60`; its doc comment at `:49` reads
    "Recursively collect every `.theta` file under `dir`, skipping SKIP_DIRS", so
    code and comment agree and the omission reads as intended rather than as a
    typo.
  - `tests/committed-fixture-parse-gate.test.ts:11–14` — the header sentence the
    filter falls short of: "Here every committed `.theta` the repository ships is
    run through the real lexer/parser (`lexTheta` -> `parseThetaDocument`) and
    MUST yield zero load/parse diagnostics." The header is self-consistent — it
    says `.theta`, and the gate does `.theta`. The gap is between the gate's
    domain and the corpus-wide claims two fix records delegate to it.
  - `tests/committed-fixture-parse-gate.test.ts:62–71` — `discoverShippedFixtures`,
    which maps the absolute walk to repo-relative POSIX paths and sorts; `:103`
    — the module-scope `shippedFixtures` the `it.each` expands.
  - `tests/committed-fixture-parse-gate.test.ts:38–44` — **defect 2**,
    `SKIP_DIRS`. Five entries: `node_modules`, `.git`, `dist`, `coverage`,
    `h7b-invalid`. `.pi` is absent, and `.gitignore:26` is `.pi/`.
  - `tests/committed-fixture-parse-gate.test.ts:108–116` — the vacuity guard.
    `:109` `length > 0`; `:110` requires `tests/fixtures/h7a/acceptance.theta`;
    `:111–113` requires at least one member matching
    `/^\.pi\/theta\/.*\.theta$/`; `:115` requires the seeded-invalid absent. The
    `:111–113` cell is the second half of defect 2: the only file in the tree
    that satisfies it is untracked (`git ls-files .pi/` returns nothing;
    `git check-ignore -v .pi/theta/smoke.theta` → `.gitignore:26:.pi/`).
  - `tests/committed-fixture-parse-gate.test.ts:118–124` — the per-file cell,
    `expect(diagnostics).toEqual([])` at `:122`. The assertion is exact and
    correct; it is only ever handed `.theta` paths.
  - `tests/committed-fixture-parse-gate.test.ts:91–101` — `loadParseDiagnostics`,
    the reader a fix reuses unchanged: `readFileSync` to bytes (`:92`), `lexTheta`
    (`:95`), `parseThetaDocument` (`:96`), union filtered to `theta/load/` +
    `theta/parse/` (`:97–100`). Extension-agnostic already — nothing in it needs
    to change for `.thetalib`.
  - `tests/committed-fixture-parse-gate.test.ts:73–85` — `makeDeps`. The deps
    object is `{ systemNote, modelMatcher }` only
    (`src/parser/theta-document.ts:740–745`): **no resolver, no `FileSystem`**.
    Import specs are therefore not followed at this seam, so
    `docs/examples/import-thetalib.theta` parsing to `[]` says nothing about
    `docs/examples/personas.thetalib`. The gate cannot reach a `.thetalib`
    transitively either — the exclusion is total, not partial.
  - `tests/committed-fixture-parse-gate.test.ts:127–137` — the red-proof cell for
    the `.theta` half (the seeded-invalid fixture yields
    `theta/parse/schema-case-mismatch`). There is no counterpart for
    `.thetalib`: nothing demonstrates that a malformed committed `.thetalib`
    would red anything, because no committed `.thetalib` is read.
  - `tests/committed-fixture-parse-gate.test.ts:3–4` — the stated convention
    anchor, `conventions.md §"Per-phase TDD ritual" (test-corpus hygiene)`. That
    anchor no longer resolves: `docs/plan_topics/conventions.md` is a nine-line
    retired stub whose body is pruned ("This leaf's body has been pruned as
    historical cruft"). Nothing outside this file states what its corpus must be,
    which is why the shortfall has stayed invisible across two fixes.
  - `docs/examples/personas.thetalib` — **excluded file 1**, tracked, 9 lines:
    one `schema Author` and one `fn rate_strictness(a: Author): Result<integer,
    QueryError>` carrying an `@<integer>` query with three interpolations. It is
    the library `docs/examples/import-thetalib.theta:7` imports. Coverage
    elsewhere: **none**. No test in the suite reads its bytes (`rg -n
    "personas\.thetalib" tests/ tools/ src/` returns only synthetic path strings
    against fakes — `tests/imports.test.ts:96–115`, `:210`, `:252`,
    `tests/export-visibility.test.ts:92`, `src/parser/imports.ts:171`, `:212`).
  - `tests/live/acceptance/fixtures/acc-lib.thetalib` — **excluded file 2**,
    tracked, 5 lines: one `fn tagline(): string`. Imported by
    `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`, which is H9a
    area (g) (`tests/live/acceptance/harness.ts:279–284`;
    `tests/live/acceptance/noninteractive-acceptance.test.ts:394`). A real host
    therefore does load it — but only in the live half, which `npm test` excludes
    (`vitest.config.ts:12`), and area (g)'s invariants are `noErrorExit` and
    `permittedCodesSubset` (`harness.ts:283`), not "zero load/parse
    diagnostics". So the offline default gate scores neither file, and the one
    file with any coverage at all has it on a different observable in a suite
    that is not the development gate.
  - `src/parser/theta-document.ts:892–894` — the `.thetalib`-only parse route the
    exclusion also removes from the corpus: `file.endsWith(".thetalib") ?
    checkThetaLibTopLevel(...) : []`, aggregated at `:905`.
    `checkThetaLibTopLevel` is `:1115–1132`, `thetalibFormOf` `:1086`. Suite
    coverage of this branch is synthetic only: `tests/imports.test.ts:148–177`
    calls `checkThetaLibTopLevelForm` directly with a synthetic site,
    `tests/schema-alias-union-decl.test.ts:454` and
    `tests/schema-alias-rhs-malformed.test.ts:241`, `:332`, `:1230–1259` drive
    `parseThetaDocument` with in-memory bodies under a `.thetalib` path
    (`bug0033.thetalib`, `bug0042.thetalib`). No committed `.thetalib`'s bytes
    reach it.
  - **No second corpus gate exists.** `rg -n 'endsWith\("\.thetalib"\)|\*\.thetalib'
    tests/ tools/` returns two matches, both `rg` invocations quoted inside
    comments (`tests/brace-rooted-union-arm-capture.test.ts:708`,
    `tests/live/live-production-acceptance.test.ts:1841`).
    `tools/closing-gate/live-corpus.js` mentions neither extension. Nothing else
    in the tree walks committed theta sources, so this file is the whole of the
    corpus surface.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:71` — DIAG-1: "Every
    author-visible diagnostic emitted by the runtime MUST carry a code from the
    registry below. Emitting an unregistered code is a defect; tests are entitled
    to assert on the specific code at every documented diagnostic site." The
    entitlement is per-site and unqualified by file extension; a `.thetalib` site
    is a documented diagnostic site.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:109` — the
    `theta/parse/thetalib-top-level-statement` row (`E`, phase `parse`), the one
    registered code whose *Trigger* is reachable only from a `.thetalib` file.
  - `docs/spec_topics/lexical.md:3` — "`.theta` and `.thetalib` files are decoded
    and normalised before lexing; every other rule on this page (and every other
    spec rule mentioning "newline") operates on the post-normalisation stream."
    One intake, both extensions.
  - `docs/spec_topics/implementation-notes.md:10` — the Parser *Contract*: "The
    parser MUST emit diagnostics matching [Diagnostics], including multi-error
    reporting across the whole `.theta` or `.thetalib` file and its transitively
    imported `.thetalib` modules before failing." **This is the sentence that
    makes the exclusion a gap rather than a scoping choice**: one parser, one
    diagnostic contract, both extensions named in the same clause. There is no
    separate `.thetalib` grammar to gate separately.
  - `docs/spec_topics/imports.md:11–17` — the `.thetalib` file rules. `:12`:
    "Inside `fn` bodies, the full Theta language is available, including
    `@`...`` queries." The only top-level divergence from `.theta` is the
    permitted-form restriction at `:13`; everything below the top level is the
    same language, so the parser surface a fix would newly gate is the same one
    the 32 `.theta` cells already gate.
  - `docs/spec_topics/grammar.md:193` — `FnDecl` "(top-level `fn` declarations in
    `.theta` and `.thetalib` files…)", the grammar appendix naming both.
  - `AGENTS.md:60–64` — §"No silent skipping": a missing precondition "**fails
    loudly** naming the unmet precondition … never an early return or skip.
    Preserve this in any new live test or harness." Stated for the live
    harnesses; the vacuity guard at `:108–116` is this gate's compliant
    equivalent and any fix keeps that property. `AGENTS.md:111–115` — "A live
    assertion that cannot red is worthless. After strengthening, prove the red
    path once … then restore and confirm green." **`AGENTS.md` states no
    obligation about corpus gates specifically** — no sentence names the
    committed-theta corpus, `git ls-files`, or which extensions a gate must
    cover. Searched: `rg -n "corpus|gate|No silent" AGENTS.md` returns `:9`,
    `:25`, `:60` only, none of them a corpus rule. That absence is part of the
    root cause and §Fix (e) proposes closing it.
- **Observed at:** `0.74.0` (HEAD `76dfde5c`). Offline, deterministic,
  provider-free; no live model, no network. Two measurement routes, both
  re-runnable: (1) the retained bug-0095 corpus oracle
  (`.pi/tmp/fixes/0095-corpus-probe.test.ts`, under gitignored `.pi/`), copied to
  a scratch path with its output redirected so the retained artefact was not
  overwritten, run at this HEAD, then deleted; (2) direct runs of
  `npx vitest run tests/committed-fixture-parse-gate.test.ts` with the working
  tree perturbed and restored. No tracked file was modified: `git status
  --porcelain` is empty before and after, and the moved-aside
  `.pi/theta/smoke.theta` was restored and `md5sum -c`-verified.

## Summary

`tests/committed-fixture-parse-gate.test.ts` is the repository's only gate over
committed theta sources: it walks the tree, lexes and parses every file it finds
through the real `lexTheta` → `parseThetaDocument` pipeline, and requires zero
`theta/load/*` and `theta/parse/*` diagnostics per file. It exists because an
invalid fixture once shipped green — the original `acceptance.theta` used `#`
comments — and was caught only by a manual real-host smoke (`:6–14`).

Its walk filters `entry.name.endsWith(".theta")` (`:55`). The repository tracks
34 theta sources: 32 `.theta` and 2 `.thetalib`. The two `.thetalib` files —
`docs/examples/personas.thetalib` and
`tests/live/acceptance/fixtures/acc-lib.thetalib` — never enter the shipped set,
so the gate cannot red on either, and its `.thetalib` red-proof does not exist
because no `.thetalib` cell exists.

The exclusion is not a scoping choice. `.thetalib` is lexed by the same
`lexTheta` and parsed by the same `parseThetaDocument`, and
`implementation-notes.md:10` states the parser contract over "the whole `.theta`
or `.thetalib` file" in one clause. A capture, lowering or recovery change in
`src/parser/theta-document.ts` therefore moves the parse of a shipped library
with nothing red — and the `.thetalib`-only route at `:892–894`
(`theta/parse/thetalib-top-level-statement`,
`code-registry-parse.md:109`) is outside the corpus entirely. Nor does the gate
reach a `.thetalib` transitively: its deps are `{ systemNote, modelMatcher }`
with no resolver (`theta-document.ts:740–745`), so `import-thetalib.theta`
parsing clean says nothing about the library it imports.

Two shipped fixes have already paid for this gap and thrown away the proof. Bug
0095 §Fix delegates its blast-radius obligation to this gate by name — "so
`tests/committed-fixture-parse-gate.test.ts` cannot witness a change and no
shipped example moves" (`:603–606`) — over a corpus it describes as "every
committed `.theta` / `.thetalib`" (`:142–143`); its orchestrator found the gate
blind to the two libraries and wrote a supplementary oracle covering both
extensions, filing the correction verbatim (`:764–768`). Bug 0079 did the same
thing one release earlier for the same reason: its shipped §Fix record asserts
"every shipped `.theta` and `.thetalib` in the tree parses free of this code"
(`:141–145`), and its fix report records how the second half was obtained — "a
deleted scratch probe extended the same walk to the two `.thetalib`". Two
independent runs, one gate, one gap, two throwaway probes.

A second defect sits in the same walk. `discoverShippedFixtures` (`:66–71`) takes
its corpus from the working tree, and `SKIP_DIRS` (`:38–44`) does not skip `.pi/`
even though `.gitignore:26` ignores it. The consequence runs both ways and is
measured below: the guard at `:111–113` requires an untracked file
(`.pi/theta/smoke.theta`) to be present, so on a fresh clone the gate reds for a
reason unrelated to any fixture; and a scratch `.theta` dropped under `.pi/tmp/`
becomes a gate cell, so an unrelated local artefact can red it. A gate whose
corpus depends on untracked working-tree state is not reproducible, and its
membership is not the committed set its name and header claim.

Measured at HEAD, both `.thetalib` files parse to `[]`. Extending the filter adds
two green cells and reds nothing — so the cost of closing defect 1 is bounded and
known before the fix starts.

## Reproduction

Offline at `76dfde5c`, provider-free. `git status --porcelain` empty before and
after every step.

### The corpus, from the index

```
$ git ls-files '*.theta'    | wc -l      → 32
$ git ls-files '*.thetalib' | wc -l      →  2
$ git ls-files '*.theta' '*.thetalib' | sed 's|/[^/]*$||' | sort | uniq -c
     21 docs/examples
      1 tests/fixtures/h7a
      1 tests/fixtures/h7b-invalid
     11 tests/live/acceptance/fixtures
```

34 tracked sources. `docs/examples` is 20 `.theta` + `personas.thetalib`;
`tests/live/acceptance/fixtures` is 10 `.theta` + `acc-lib.thetalib`;
`tests/fixtures/h7a/acceptance.theta` and the seeded-invalid
`tests/fixtures/h7b-invalid/malformed.theta` are one each. This confirms bug
0095's fix-record figure (34 tracked = 32 + 2, with that directory split) and
refutes the "35" its bug doc carries at `:143` and `:614`: the whole-tree walk
also finds the untracked `.pi/theta/smoke.theta`, and 35 counts it.

### What the gate actually runs

```
$ npx vitest run tests/committed-fixture-parse-gate.test.ts
  Test Files  1 passed (1)      Tests  34 passed (34)
```

34 cells = 1 vacuity guard + **32 shipped-fixture cells** + 1 seeded-invalid
red-proof. The 32 shipped cells are *not* the 32 tracked `.theta`: the
seeded-invalid is excluded by `SKIP_DIRS` (`:43`) and the untracked
`.pi/theta/smoke.theta` is included. So 31 tracked + 1 untracked. Bug 0079's fix
report says the gate "covers the 32 `.theta`" — right by count, wrong by
membership.

Neither `.thetalib` appears as a cell name. `.thetalib` cells: **0**.

### Both committed `.thetalib` files parse clean at HEAD

The bug-0095 corpus oracle (`git ls-files '*.theta' '*.thetalib'` plus the
present `.pi/theta/smoke.theta`, each file lexed and parsed exactly as the gate
does) re-run at this HEAD, 35 rows:

```
docs/examples/personas.thetalib                     []
tests/live/acceptance/fixtures/acc-lib.thetalib     []
docs/examples/import-thetalib.theta                 []
tests/fixtures/h7b-invalid/malformed.theta          ["error theta/parse/schema-case-mismatch: …",
                                                     "error theta/parse/unsupported-feature: … stray '#' …",
                                                     "error theta/parse/empty-schema-body: …",
                                                     "error theta/parse/schema-case-mismatch: …",
                                                     "error theta/parse/unknown-identifier: … 'validation'",
                                                     "error theta/parse/unknown-identifier: … 'notes'"]
```

Every other row is `[]`; the seeded-invalid is the only non-empty one. `diff`
against the retained `0.74.0` baseline is byte-empty. **Extending the gate's
filter to `.thetalib` adds two cells and both are green** — the fix does not need
a disposition for a pre-existing red.

### Defect 2, direction 1 — the guard requires an untracked file

`.pi/theta/smoke.theta` is untracked (`git ls-files .pi/` → nothing;
`git check-ignore -v` → `.gitignore:26:.pi/`). Moved aside, the gate reds:

```
FAIL  … > discovers the committed fixtures the repository ships
AssertionError: expected false to be true
 ❯ tests/committed-fixture-parse-gate.test.ts:113:7
   111|     expect(
   112|       shippedFixtures.some((p) => /^\.pi\/theta\/.*\.theta$/.test(p)),
   113|     ).toBe(true);
  Tests  1 failed | 32 passed (33)
```

Restored and `md5sum -c`-verified; gate back to 34/34. On a fresh clone — CI, or
any checkout without local `.pi/` state — this cell fails, and the failure names
no fixture defect.

### Defect 2, direction 2 — an untracked scratch file becomes a gate cell

A two-line malformed `.theta` written to `.pi/tmp/bugs/scratch-probe.theta` (a
gitignored scratch directory, nothing to do with the shipped corpus):

```
×  H7b: … > .pi/tmp/bugs/scratch-probe.theta parses cleanly through lexTheta -> parseThetaDocument
   +     "file": ".pi/tmp/bugs/scratch-probe.theta",
  Tests  1 failed | 34 passed (35)
```

Deleted; gate back to 34/34. The corpus is the working tree, so any local
artefact under any non-skipped directory is scored as a shipped fixture.

### The gate cannot reach a `.thetalib` transitively either

`docs/examples/import-thetalib.theta:7` is
`import { Author, rate_strictness } from "./personas.thetalib"`, and that file's
gate cell is green. It proves nothing about `personas.thetalib`:
`makeDeps` (`:73–85`) returns `{ systemNote, modelMatcher }`, and
`ParseThetaDocumentDeps` (`src/parser/theta-document.ts:740–745`) has exactly
those two members — no `Resolver`, no `FileSystem`. No import spec is resolved at
this seam, so no imported file is read. Same for
`tests/live/acceptance/fixtures/acc-imports-invoke.theta:7` and
`acc-lib.thetalib`.

### No other gate covers the two files

```
$ rg -n 'endsWith\("\.thetalib"\)|\*\.thetalib' tests/ tools/
tests/brace-rooted-union-arm-capture.test.ts:708      (an `rg` command inside a comment)
tests/live/live-production-acceptance.test.ts:1841    (an `rg` command inside a comment)
$ rg -n "personas\.thetalib|acc-lib\.thetalib" tests/ tools/ src/
   → only synthetic path strings against fakes; no read of either file's bytes
```

`acc-lib.thetalib` is loaded for real exactly once in the repository: H9a area
(g) spawns `pi -p` on `acc-imports-invoke.theta`
(`tests/live/acceptance/harness.ts:279–284`;
`tests/live/acceptance/noninteractive-acceptance.test.ts:394`). That is the live
suite, excluded from `npm test` (`vitest.config.ts:12`), and its invariants are
`noErrorExit` + `permittedCodesSubset` (`harness.ts:283`) — not zero load/parse
diagnostics. `docs/examples/personas.thetalib` is loaded nowhere.

## Expected behaviour

The gate's purpose, stated in its own header (`:6–14`), is that a committed theta
source cannot ship with a load/parse diagnostic and cannot have its diagnostics
silently moved by a parser change. Three sentences make that purpose cover
`.thetalib`:

`docs/spec_topics/implementation-notes.md:10` — the Parser *Contract*:

> The parser MUST emit diagnostics matching [Diagnostics](./diagnostics.md),
> including multi-error reporting across the whole `.theta` or `.thetalib` file
> and its transitively imported `.thetalib` modules before failing.

One parser, one contract, both extensions in one clause. There is no separate
`.thetalib` grammar and no separate diagnostic contract that a separate gate
would hold.

`docs/spec_topics/lexical.md:3` — "`.theta` and `.thetalib` files are decoded and
normalised before lexing; every other rule on this page … operates on the
post-normalisation stream." One intake for both, so every lexical rule the 32
`.theta` cells gate applies unchanged to the two excluded files.

`docs/spec_topics/diagnostics/diagnostic-shape.md:71` — DIAG-1: "tests are
entitled to assert on the specific code at every documented diagnostic site."
Per-site and unqualified by extension. A `.thetalib` top-level statement is a
documented site (`code-registry-parse.md:109`); so is every site inside a
`.thetalib` `fn` body, since `imports.md:12` makes "the full Theta language"
available there.

`imports.md:13` is the only top-level divergence — a `.thetalib` top level admits
only `import` / `export` / `schema` / `enum` / `fn`. That divergence *adds* a
registered code to the corpus surface rather than removing any, so it argues for
inclusion, not against it.

Expected, then:

- Every committed theta source, both extensions, is lexed and parsed by the gate
  and yields zero `theta/load/*` / `theta/parse/*` diagnostics. At HEAD that is
  34 tracked files: 31 shipped `.theta` + 2 `.thetalib` scored for cleanliness,
  1 seeded-invalid scored for reddening.
- The gate has a red-proof for each extension it covers, per `AGENTS.md:111–115`
  — today the seeded-invalid discharges that for `.theta` (`:127–137`) and
  nothing discharges it for `.thetalib`.
- The corpus is a function of the commit, not of local working-tree state, so the
  same commit gates identically on a fresh clone and on a developer machine with
  local `.pi/` files.
- The vacuity guard keeps failing loudly on a shrunken corpus and naming the
  unmet precondition (`AGENTS.md:60–64`), without requiring a file the commit
  does not contain.

## Actual behaviour / root cause

**One leaf-filter predicate.** `walkThetaFiles` (`:50–60`) has a single file
branch:

```ts
} else if (entry.isFile() && entry.name.endsWith(".theta")) {
  acc.push(join(dir, entry.name));
}
```

`"personas.thetalib".endsWith(".theta")` is `false`. No other filter exists in
the file and no allow-list is consulted, so the two libraries are dropped at the
walk and never appear downstream: `discoverShippedFixtures` (`:66–71`) maps and
sorts what the walk returned, `shippedFixtures` (`:103`) is that array, and
`it.each(shippedFixtures)` (`:118`) expands one cell per member. Absent from the
array means absent from the test list — there is no cell to red.

**Everything downstream is already extension-agnostic.**
`loadParseDiagnostics` (`:91–101`) reads bytes, sets `source.path = relPath`, and
calls `lexTheta` / `parseThetaDocument`. Both accept a `.thetalib` path; the
parser's own `.thetalib` dispatch keys off exactly that string
(`src/parser/theta-document.ts:892`, `file.endsWith(".thetalib")`). So the reader
needs no change: the defect is confined to the one predicate at `:55`.

**The excluded route is the one no other corpus test can reach.**
`theta/parse/thetalib-top-level-statement` (`code-registry-parse.md:109`) fires
only from `checkThetaLibTopLevel` (`theta-document.ts:1115–1132`), reached only
through the `:892–894` branch, reached only for a `.thetalib` path. Suite
coverage of that branch is synthetic — `tests/imports.test.ts:148–177` calls
`checkThetaLibTopLevelForm` directly; `tests/schema-alias-union-decl.test.ts:454`
and `tests/schema-alias-rhs-malformed.test.ts:241`, `:332`, `:1230–1259` parse
in-memory bodies under invented `.thetalib` paths. Those cells prove the check
works. None of them reads a file the repository ships, which is the property this
gate exists to hold.

**Transitive reach is structurally absent, not merely unused.**
`ParseThetaDocumentDeps` (`theta-document.ts:740–745`) is
`{ systemNote, modelMatcher }`. There is no resolver member to pass, so no
arrangement of this gate's deps makes an `import` spec resolve. A `.thetalib`
enters the gate only if the walk names it.

**The corpus is the working tree.** `discoverShippedFixtures` starts at
`REPO_ROOT` = `process.cwd()` (`:33`) and prunes five directory names (`:38–44`).
`.pi/` is not among them; `.gitignore:26` is `.pi/`. So gitignored files are
corpus members, and the gate's membership varies with local state that no commit
records. The two measured directions above are the two faces of that: the
`:111–113` cell *depends* on an untracked file existing (fresh clone → red), and
any untracked `.theta` anywhere non-skipped *joins* the corpus (local scratch →
red). Both reds name no shipped fixture, which is the failure mode a gate must
not have.

**Why it survived two fixes.** The gate's stated convention anchor is dead:
`:3–4` cites `conventions.md §"Per-phase TDD ritual" (test-corpus hygiene)`, and
`docs/plan_topics/conventions.md` is a nine-line stub retaining only its filename
because `tools/closing-gate/live-corpus.js` derives leaf IDs from the directory.
`AGENTS.md` states no corpus-gate obligation either (`rg -n "corpus|gate|No
silent" AGENTS.md` → `:9`, `:25`, `:60`, none a corpus rule). With no text
outside the file stating what the corpus must be, each orchestrator that hit the
shortfall compared the gate against its own obligation, found it short, patched
around it locally, and deleted the patch. Bug 0095's record even states the
filter verbatim (`:764–768`) — the knowledge was produced twice and retained
nowhere executable.

## Why it matters

- **A parser change can move a shipped library's parse with nothing red.** The
  gate is the only corpus-wide check on committed theta sources, and it scores 32
  of 34. Both excluded files exercise the parser: `personas.thetalib` carries a
  `schema` with three field types, a `fn` with a `Result<integer, QueryError>`
  return annotation, and an `@<integer>` query with three `${}` interpolations —
  precisely the constructs recent fixes have moved.
- **The gap is load-bearing for claims already shipped.** Bug 0095 §Fix
  (`:603–606`) and bug 0079's §Fix record (`:141–145`) both state a corpus-wide
  "no shipped source moves" result. Both statements are true only because a
  scratch probe was written and deleted. Read at face value from the tree, each
  cites a gate that covers part of the stated corpus; a future reader auditing
  either claim cannot re-derive it by re-running the suite.
- **Two independent runs paid the same cost.** The repetition is the argument: it
  is not one orchestrator's local workaround but a stable property of the gate
  that any corpus-wide obligation must route around. The next fix touching
  `src/parser/theta-document.ts` pays it again.
- **The `.thetalib`-only diagnostic route has no corpus witness at all.**
  `theta/parse/thetalib-top-level-statement` is a registered `E` row
  (`code-registry-parse.md:109`) whose only reach is the `:892–894` branch. DIAG-1
  entitles tests to assert on the specific code at every documented site; for
  committed sources, no test does.
- **The gate has no red-proof for half its stated domain.** `:127–137` proves the
  gate reddens on a malformed `.theta`. Nothing proves it would red on a
  malformed `.thetalib`, because there is no path by which a `.thetalib` reaches
  it. Per `AGENTS.md:111–115`, an assertion that cannot red is worthless — here
  the assertion is fine and the input never arrives.
- **The corpus is not reproducible.** Measured: without local `.pi/` state the
  gate reds at `:113`; with an unrelated scratch `.theta` present it reds at a
  synthesised cell. A gate that reds on a fresh clone trains readers to discount
  its reds, which is the same failure `AGENTS.md:53–58` (§"Expect documented
  correct-reason reds": "Before attributing a red to your change, check
  `docs/bugs/` for an open report whose signature matches") exists to keep
  bounded — except here the red is not documented and not correct-reason.
- **The shortfall is invisible from outside the file.** The convention anchor at
  `:3–4` no longer resolves and `AGENTS.md` carries no corpus rule, so nothing
  will flag the next fix that delegates a corpus-wide claim here.
- **Closing it is cheap and green on arrival.** Measured: both `.thetalib` files
  parse to `[]` at HEAD. The blindness has cost two runs a scratch probe each and
  costs the fix two green cells.

## Non-goals

- **The parse dispositions of either `.thetalib`.** Both are `[]` at HEAD and
  this report asks that they be *scored*, not changed. If a later change makes
  one non-empty, that is that change's disposition to state.
- **Whether the two libraries are the right example corpus.** Their content,
  location and count are `docs/examples/` and H9a's business.
- **H9a area (g)'s invariants.** `noErrorExit` + `permittedCodesSubset`
  (`tests/live/acceptance/harness.ts:283`) are the live suite's choice; this
  report does not propose adding a zero-diagnostics invariant there. The live
  half is excluded from `npm test` by design (`vitest.config.ts:12`), so live
  coverage cannot substitute for an offline corpus gate either way.
- **`tests/fixtures/h7b-invalid/malformed.theta`.** The seeded-invalid fixture
  and its cell (`:127–137`) are the `.theta` red-proof and stay byte-unchanged.
- **The other gate gaps.** The `theta/host/*` extraction blindness is
  [0047](./0047-h9a-code-gate-blind-to-host-namespace.md); the two-regex
  source-shape lock-step is
  [0107](./0107-tools-lockstep-witness-is-source-shape-gate.md). Disjoint files,
  disjoint fixes.
- **Import resolution at this seam.** Giving the gate a `Resolver` so it follows
  `import` specs would be a different change with its own design questions
  (cycle handling, per-file attribution of an imported file's diagnostics).
  Naming the two `.thetalib` files directly in the walk covers them without it,
  and §Fix takes that route.
- **Retiring or repointing `docs/plan_topics/conventions.md`.** The dead anchor at
  `:3–4` is evidence for how this survived; rewriting the retired plan leaf is
  out of scope. §Fix (e) proposes stating the obligation where it is enforceable
  instead.

## Fix

**One file: `tests/committed-fixture-parse-gate.test.ts`.** No source change, no
new registered code, no spec edit. Defect 1's shape is mechanical — the walk
admits `.thetalib` as well as `.theta` — and the measurement above bounds it:
both files parse to `[]`, so the extension adds two green cells. Defect 2 is the
axis left to the run, because the choice of corpus source rewrites the vacuity
guard and decides what "committed" means in this file.

**(a) Extend the walk to both extensions.** `:55` becomes a two-extension
predicate, and the `:49` doc comment and the `:1`, `:11–14` header sentences are
restated to say what the gate then covers. Downstream needs nothing:
`loadParseDiagnostics` (`:91–101`) is already extension-agnostic and
`parseThetaDocument` keys its own `.thetalib` dispatch off the path string
(`src/parser/theta-document.ts:892`). Expected result, measured in advance: 36
cells — 1 guard + 31 shipped `.theta` + 2 `.thetalib` + 1 seeded-invalid, if
(b) also drops the untracked file; 37 if it does not.

**(b) Decide the corpus source — `git ls-files` or the working-tree walk. Not
settled; the run decides, and must state which and why.** The two options differ
in more than mechanism:

1. **`git ls-files '*.theta' '*.thetalib'`** makes the corpus a function of the
   commit, which is what "committed fixture" claims and what makes the gate
   reproducible on a fresh clone. It drops `.pi/theta/smoke.theta`, so the
   `:111–113` guard cell must be replaced — that cell is the only thing keeping
   the untracked file load-bearing. Cost: the gate acquires a `git` dependency
   (an `execFileSync` in a test that has none today) and stops covering a
   developer's local `.theta` files, which for a *committed*-corpus gate is
   correct rather than a loss. Precedent in-tree: the bug-0095 oracle takes
   exactly this route.
2. **Keep the walk and add `.pi` to `SKIP_DIRS` (`:38–44`)**, no new dependency.
   This closes direction 2 (a scratch `.theta` under `.pi/` no longer joins the
   corpus) but not direction 1 unless `:111–113` is also rewritten — and
   `SKIP_DIRS` would then have to track `.gitignore`, which is the same class of
   silent drift one level along.

Whichever is chosen, two properties are required: no cell may depend on an
untracked file existing, and the guard must still fail loudly on a shrunken
corpus.

**(c) Rewrite the vacuity guard (`:108–116`) so it names a committed
precondition.** The guard's job — a broken discovery must not silently green the
gate — is right and stays. What must change is `:111–113`, whose predicate is
satisfied only by an untracked file. Replacements to consider, stated so the run
can pick and pin: an exact expected count for each extension, derived from the
same corpus source (b) chooses; membership assertions naming both `.thetalib`
files and `tests/fixtures/h7a/acceptance.theta` (`:110`, which stays); and the
existing `not.toContain(SEEDED_INVALID)` (`:115`, which stays). A count is the
stronger guard because it reds on silent shrinkage in either extension, and it
is the shape `AGENTS.md:60–64` asks for: a failure naming the unmet precondition
rather than a quiet pass. If a count is used, the run states how it is
maintained when a fixture is added.

**(d) Add the `.thetalib` red-proof.** `:127–137` proves the gate reddens on a
malformed `.theta`; the same obligation applies to the extension being added, per
`AGENTS.md:111–115` ("prove the red path once … then restore and confirm
green"). Two routes: seed a malformed `.thetalib` beside the existing invalid
fixture under `tests/fixtures/h7b-invalid/` (already excluded from the shipped
set by `SKIP_DIRS:43`, so it costs nothing elsewhere), or prove the red by
neutralisation during the run and record the observed failure in the fix record.
The seeded file is the durable form and is what makes the extension non-vacuous
for the next reader; a natural code to seed against is
`theta/parse/thetalib-top-level-statement` (`code-registry-parse.md:109`), which
no committed-corpus test can currently reach. The run decides and states which.

**(e) State the obligation somewhere enforceable.** The gate's cited convention
(`:3–4`) points at a pruned stub, and `AGENTS.md` carries no corpus rule — which
is why two fixes rediscovered the same gap independently. One sentence in
`AGENTS.md` saying that the committed-corpus gate covers every committed theta
source of both extensions, and that a corpus-wide claim in a fix record is
discharged by that gate rather than by a scratch probe, converts this from
tribal knowledge into something the next run reads. `AGENTS.md` is outside this
report's one-file scope; the run either takes the edit or records the decision
not to.

**Constraints — binding on any implementation:**

- **Offline, provider-free, deterministic.** The gate is in the default `npm
  test` set (`vitest.config.ts:6`), which "stays offline" by design. No model, no
  network, no provider credentials. Option (b1)'s `git` subprocess is the only new
  ambient dependency under consideration and it is offline; if it is taken, the
  run states what happens when `git` is unavailable — which must be a loud
  failure, not a skip.
- **Fail loudly, never skip** (`AGENTS.md:60–64`). A missing precondition — no
  corpus, a shrunken corpus, `git` absent under (b1) — fails naming the unmet
  precondition. No early `return`, no `it.skip`, no `.todo`, no conditional
  `describe`. "A skipped test is a lie."
- **No bug-witness file is weakened to accommodate this.** The fix is confined to
  `tests/committed-fixture-parse-gate.test.ts`. In particular the pinned cells in
  `tests/discriminator-field-classifier-brace-group.test.ts` (bug 0096's
  witness, rewritten by the 0095 fix), `tests/brace-rooted-union-arm-capture.test.ts`,
  `tests/imports.test.ts:148–177` and `tests/schema-alias-rhs-malformed.test.ts`
  stay byte-unchanged. If extending the corpus surfaces a diagnostic on a
  committed file, the fix reports it and stops — it does not relax the
  `toEqual([])` assertion at `:122`, narrow the corpus, or edit the offending
  source to fit.
- **The `.theta` half stays exactly as strong.** All 32 shipped `.theta` cells,
  the exact `expect(diagnostics).toEqual([])` (`:122`), and the seeded-invalid
  red-proof (`:127–137`) survive unchanged in strength. The change is additive on
  the extension axis; on the corpus axis it may *remove* untracked members, which
  is (b)'s decision and must be stated rather than incidental.
- **Both directions verified.** Per `AGENTS.md:111–115`, the new `.thetalib`
  cells must be shown able to red — (d) — and then green. A cell that cannot red
  reproduces this bug in a new place.

**Witness.** The gate is its own witness; no separate test file is added. The fix
record states: the cell count before and after with its composition; the two
`.thetalib` rows' measured dispositions (`[]` at HEAD, re-derived after the
change); the observed red from (d) and the restored green; the corpus source
chosen in (b) with the reasoning; and a re-run of the two defect-2 measurements
above showing both now behave as intended under the chosen corpus — a fresh-clone
corpus (no local `.pi/`) greens, and a scratch `.theta` under `.pi/` is ignored.

## Provenance

- Origin: the bug 0095 fix (0.74.0, commit `75af7646`), residual 5 of
  `.pi/tmp/fixes/0095-report.md` — three statements in that bug doc found wrong
  rather than stale, the second being "§Fix delegates the blast-radius proof to
  `tests/committed-fixture-parse-gate.test.ts`, but that walk filters `.theta`
  only and **cannot witness either committed `.thetalib`**". The shipped form of
  that correction is
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)`:764–768`.
  This report adds what the residual does not: the second occurrence in bug
  0079's records, the exact tracked corpus re-derived from the index at HEAD, the
  measured parse disposition of both excluded files, the transitive-unreachability
  proof from the deps type, the untracked-corpus defect measured in both
  directions, the dead convention anchor, and the constraint set.
- Second occurrence:
  [0079](./0079-interpolated-result-unemitted-private-encoding-rendered.md)`:141–145`
  (the shipped §Fix record asserting the corpus-wide result over both extensions)
  and `.pi/tmp/fixes/0079-report.md:133–138` (how the `.thetalib` half was
  obtained — "a deleted scratch probe extended the same walk to the two
  `.thetalib`"). Both fix reports live under gitignored `.pi/`; the durable
  citations are the two bug docs' own text.
- Implementation evidence at `76dfde5c`:
  `tests/committed-fixture-parse-gate.test.ts:1`, `:3–4` (the dead convention
  anchor), `:6–14` (the header claim), `:33` (`REPO_ROOT`), `:38–44`
  (`SKIP_DIRS`), `:47` (`SEEDED_INVALID`), `:49–60` (**the walk**, the filter at
  `:55`), `:62–71` (`discoverShippedFixtures`), `:73–85` (`makeDeps`), `:91–101`
  (`loadParseDiagnostics`), `:103` (`shippedFixtures`), `:108–116` (the vacuity
  guard, the untracked-file cell at `:111–113`), `:118–124` (the per-file cell,
  the assertion at `:122`), `:127–137` (the `.theta` red-proof);
  `src/lexer/lexer.ts:80`, `:92` (`lexTheta`, both extensions);
  `src/parser/theta-document.ts:1`, `:740–745` (`ParseThetaDocumentDeps` — no
  resolver), `:748`, `:758` (`parseThetaDocument`), `:892–894` (the `.thetalib`
  dispatch), `:905` (its aggregation), `:1086` (`thetalibFormOf`), `:1115–1132`
  (`checkThetaLibTopLevel`); `vitest.config.ts:6`, `:12` (the default suite's
  include and the live exclusion); `.gitignore:26` (`.pi/`).
- Excluded corpus at `76dfde5c`: `docs/examples/personas.thetalib` (imported by
  `docs/examples/import-thetalib.theta:7`);
  `tests/live/acceptance/fixtures/acc-lib.thetalib` (imported by
  `tests/live/acceptance/fixtures/acc-imports-invoke.theta:7`, driven by H9a area
  (g) — `tests/live/acceptance/harness.ts:279–284`,
  `tests/live/acceptance/noninteractive-acceptance.test.ts:394`).
- Synthetic `.thetalib` coverage that exists (and is not a substitute): direct
  calls to `checkThetaLibTopLevelForm` — `tests/imports.test.ts:148–177`;
  `parseThetaDocument` drives over in-memory bodies under an invented `.thetalib`
  path — `tests/schema-alias-union-decl.test.ts:454`,
  `tests/schema-alias-rhs-malformed.test.ts:241`, `:332`, `:1230–1259`; synthetic
  `.thetalib` file paths in diagnostic-shape assertions —
  `tests/diagnostics-primitive.test.ts:169–237`.
- Spec: `docs/spec_topics/implementation-notes.md:10` (the Parser *Contract* over
  "the whole `.theta` or `.thetalib` file" — the anchor);
  `docs/spec_topics/lexical.md:3` (one intake for both extensions), `:10`
  (byte-exact lowercase extension matching);
  `docs/spec_topics/imports.md:11–17` (the `.thetalib` file rules; `:12` the full
  language inside `fn` bodies, `:13` the permitted top-level forms), `:19` (the
  byte-exact `.thetalib` path requirement);
  `docs/spec_topics/grammar.md:193` (`FnDecl` in both file kinds);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1);
  `docs/spec_topics/diagnostics/code-registry-parse.md:109`
  (`theta/parse/thetalib-top-level-statement`);
  `docs/spec_topics/discovery/discovery-sources.md:9`, `:17` (`.thetalib` is
  never slash-discovered — why it has no discovery-side coverage either).
- Repo conventions: `AGENTS.md:60–64` (§"No silent skipping"), `:111–115`
  (§"Verify both directions"; `:113` "A live assertion that cannot red is
  worthless"), `:53–58` (§"Expect documented correct-reason reds"), `:25–26` (the
  default gate stays offline). No corpus-gate obligation is stated
  anywhere in `AGENTS.md`; `docs/plan_topics/conventions.md` is a retired
  nine-line stub, so the anchor at
  `tests/committed-fixture-parse-gate.test.ts:3–4` resolves to no text.
